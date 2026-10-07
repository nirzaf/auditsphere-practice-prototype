// Microsoft Graph / SharePoint adapter for the AuditSphere business Worker.
//
// Configuration is supplied through `SHAREPOINT_*` bindings (see
// docs/prototype/integration-configuration.md). When the configuration is absent
// every call fails closed with an explicit "unconfigured" error; it never reports
// a synthetic success. A `fetch` implementation can be injected for tests.

import type { Env } from '../env';

export interface SharePointConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteHostname: string;
  sitePath: string;
  driveName: string;
}

export interface GraphDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class GraphError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'GraphError';
  }
}

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const LOGIN_ROOT = 'https://login.microsoftonline.com';
const RETRYABLE = new Set([429, 503]);

export function sharePointConfig(env: Env): SharePointConfig | null {
  const tenantId = env.SHAREPOINT_TENANT_ID?.trim();
  const clientId = env.SHAREPOINT_CLIENT_ID?.trim();
  const clientSecret = env.SHAREPOINT_CLIENT_SECRET;
  const siteHostname = env.SHAREPOINT_SITE_HOSTNAME?.trim();
  const sitePath = env.SHAREPOINT_SITE_PATH?.trim();
  if (!tenantId || !clientId || !clientSecret || !siteHostname || !sitePath) return null;
  return { tenantId, clientId, clientSecret, siteHostname, sitePath, driveName: env.SHAREPOINT_DRIVE_NAME?.trim() || 'Documents' };
}

export function sharePointConfigured(env: Env): boolean {
  return sharePointConfig(env) !== null;
}

let tokenCache: { key: string; token: string; expiresAt: number } | null = null;

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}

export async function graphToken(config: SharePointConfig, deps: GraphDeps = {}): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const key = `${config.tenantId}:${config.clientId}:${config.clientSecret.length}`;
  if (tokenCache && tokenCache.key === key && tokenCache.expiresAt > now() + 60_000) return tokenCache.token;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const response = await fetchImpl(`${LOGIN_ROOT}/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) throw new GraphError('The Microsoft Graph token request was rejected.', response.status);
  const json = await response.json().catch(() => null) as { access_token?: unknown; expires_in?: unknown } | null;
  if (!json || typeof json.access_token !== 'string' || !json.access_token) {
    throw new GraphError('The Microsoft Graph token response did not include an access token.', 401);
  }
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  tokenCache = { key, token: json.access_token, expiresAt: now() + expiresIn * 1000 };
  return json.access_token;
}

async function graphRequest(config: SharePointConfig, path: string, init: RequestInit, deps: GraphDeps): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const token = await graphToken(config, deps);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const url = path.startsWith('http') ? path : `${GRAPH_ROOT}${normalizePath(path)}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetchImpl(url, { ...init, headers });
    if (RETRYABLE.has(response.status)) {
      const retryAfter = Number(response.headers.get('Retry-After') ?? '1');
      await sleep(Math.max(1, Number.isFinite(retryAfter) ? retryAfter : 1) * 1000);
      continue;
    }
    return response;
  }
  throw new GraphError('Microsoft Graph remained throttled after bounded retries.', 429);
}

async function jsonOf<T>(response: Response, message: string): Promise<T> {
  const body = await response.json().catch(() => null) as T | null;
  if (!response.ok || !body) throw new GraphError(message, response.status);
  return body;
}

export interface ResolvedSite {
  siteId: string;
  driveId: string;
  rootFolderId: string;
  displayName: string;
  webUrl: string;
}

/** Resolves the configured site path to stable site, drive and root identifiers. */
export async function resolveSharePointSite(config: SharePointConfig, deps: GraphDeps = {}): Promise<ResolvedSite> {
  const site = await graphRequest(config, `/sites/${config.siteHostname}:/${config.sitePath}?$select=id,displayName,webUrl`, { method: 'GET' }, deps);
  const siteJson = await jsonOf<{ id?: unknown; displayName?: unknown; webUrl?: unknown }>(site, 'The configured SharePoint site path could not be resolved.');
  if (typeof siteJson.id !== 'string' || !siteJson.id) throw new GraphError('The resolved site did not return a stable identifier.', 404);
  const drives = await graphRequest(config, `/sites/${siteJson.id}/drives?$select=id,name`, { method: 'GET' }, deps);
  const driveJson = await jsonOf<{ value?: Array<{ id: string; name: string }> }>(drives, 'The document libraries for the site could not be read.');
  const drive = (driveJson.value ?? []).find(item => item.name === config.driveName) ?? (driveJson.value ?? [])[0];
  if (!drive) throw new GraphError('The configured site exposes no document library to use.', 404);
  const root = await graphRequest(config, `/drives/${drive.id}/root?$select=id`, { method: 'GET' }, deps);
  const rootJson = await jsonOf<{ id?: unknown }>(root, 'The document library root folder could not be read.');
  if (typeof rootJson.id !== 'string' || !rootJson.id) throw new GraphError('The library root folder did not return a stable identifier.', 404);
  return {
    siteId: siteJson.id,
    driveId: drive.id,
    rootFolderId: rootJson.id,
    displayName: typeof siteJson.displayName === 'string' ? siteJson.displayName : config.siteHostname,
    webUrl: typeof siteJson.webUrl === 'string' ? siteJson.webUrl : `https://${config.siteHostname}${config.sitePath}`
  };
}

/** Creates a folder under a parent. Pass `failOnConflict: false` to reuse an existing folder. */
export async function ensureFolder(
  config: SharePointConfig, driveId: string, parentFolderId: string, name: string,
  options: { failOnConflict?: boolean } = {}, deps: GraphDeps = {}
): Promise<{ itemId: string; webUrl: string }> {
  const conflictBehavior = options.failOnConflict === false ? 'replace' : 'fail';
  const response = await graphRequest(config, `/drives/${driveId}/items/${parentFolderId}/children`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': conflictBehavior })
  }, deps);
  const body = await jsonOf<{ id?: unknown; webUrl?: unknown }>(response, `The folder "${name}" could not be created.`);
  if (typeof body.id !== 'string' || !body.id) throw new GraphError('The created folder did not return a stable identifier.', 500);
  return { itemId: body.id, webUrl: typeof body.webUrl === 'string' ? body.webUrl : '' };
}

/** Uploads a small file (<= 4 MiB) and returns the stored byte digest reported by Graph. */
export async function uploadSmallFile(
  config: SharePointConfig, driveId: string, parentFolderId: string,
  file: { name: string; contentType: string; bytes: Uint8Array }, deps: GraphDeps = {}
): Promise<{ itemId: string; etag: string; contentHash: string | null }> {
  const response = await graphRequest(config, `/drives/${driveId}/items/${parentFolderId}:/${encodeURIComponent(file.name)}:/content`, {
    method: 'PUT',
    headers: { 'Content-Type': file.contentType },
    body: file.bytes as unknown as BodyInit
  }, deps);
  const body = await jsonOf<{ id?: unknown; eTag?: unknown; file?: { hashes?: { quickXorHash?: unknown } } }>(response, `The file "${file.name}" could not be uploaded.`);
  if (typeof body.id !== 'string' || !body.id) throw new GraphError('The uploaded file did not return a stable identifier.', 500);
  const quickXor = body.file?.hashes?.quickXorHash;
  return { itemId: body.id, etag: typeof body.eTag === 'string' ? body.eTag : '', contentHash: typeof quickXor === 'string' ? quickXor : null };
}

/** Lists retained versions for a drive item so relied-on evidence can be pinned. */
export async function listItemVersions(config: SharePointConfig, driveId: string, itemId: string, deps: GraphDeps = {}): Promise<Array<{ id: string; lastModifiedDateTime: string; size: number }>> {
  const response = await graphRequest(config, `/drives/${driveId}/items/${itemId}/versions?$select=id,lastModifiedDateTime,size`, { method: 'GET' }, deps);
  const body = await jsonOf<{ value?: Array<{ id: string; lastModifiedDateTime: string; size: number }> }>(response, 'The item version history could not be read.');
  return body.value ?? [];
}

/** Reads the retention/lock state Microsoft exposes for an item (availability is tenant-dependent). */
export async function getItemRetention(config: SharePointConfig, driveId: string, itemId: string, deps: GraphDeps = {}): Promise<{ retentionLabel: string | null; isRecordLocked: boolean | null }> {
  const response = await graphRequest(config, `/drives/${driveId}/items/${itemId}?$select=id,retentionLabel`, { method: 'GET' }, deps);
  const body = await jsonOf<{ retentionLabel?: { name?: unknown; isRecordLocked?: unknown } }>(response, 'The item retention label could not be read.');
  const label = body.retentionLabel;
  return {
    retentionLabel: typeof label?.name === 'string' ? label.name : null,
    isRecordLocked: typeof label?.isRecordLocked === 'boolean' ? label.isRecordLocked : null
  };
}

export type SharePointStatusState = 'UNCONFIGURED' | 'CONNECTED' | 'FAILED';

export interface SharePointStatus {
  state: SharePointStatusState;
  siteHostname: string | null;
  sitePath: string | null;
  message: string;
  checkedAt: string;
  siteId?: string;
  driveId?: string;
  rootFolderId?: string;
}

/** Probes the configured site with a scoped read and reports an honest state. */
export async function sharePointStatus(env: Env, deps: GraphDeps = {}): Promise<SharePointStatus> {
  const checkedAt = new Date((deps.now ?? Date.now)()).toISOString();
  const config = sharePointConfig(env);
  if (!config) {
    return {
      state: 'UNCONFIGURED', siteHostname: env.SHAREPOINT_SITE_HOSTNAME ?? null, sitePath: env.SHAREPOINT_SITE_PATH ?? null,
      message: 'Set the SHAREPOINT_* configuration before the SharePoint integration can connect.', checkedAt
    };
  }
  try {
    const resolved = await resolveSharePointSite(config, deps);
    return {
      state: 'CONNECTED', siteHostname: config.siteHostname, sitePath: config.sitePath,
      message: 'Resolved the configured site and document library.', checkedAt,
      siteId: resolved.siteId, driveId: resolved.driveId, rootFolderId: resolved.rootFolderId
    };
  } catch (error) {
    return {
      state: 'FAILED', siteHostname: config.siteHostname, sitePath: config.sitePath,
      message: error instanceof Error ? error.message : 'The SharePoint probe failed.', checkedAt
    };
  }
}


