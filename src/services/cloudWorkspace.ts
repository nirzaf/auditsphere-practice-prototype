// Cloud workspace client.
//
// The browser talks to the SAME-ORIGIN Worker API under /api/* with its
// HttpOnly session cookie; no API base URL is configurable and no Bearer
// token is ever held in JavaScript storage. The access code is shown once
// for resume/enrollment on another browser; the running session relies on
// the cookie alone.
//
// Mutations are command-based: the client posts the shared typed command
// union and then pulls the authoritative state the Worker committed. There
// is deliberately no whole-state PUT — the browser can never overwrite
// server state with a complete snapshot.

import type { ChangesResponse, CommandResponse, StateResponse, WorkspaceCommand } from '../shared/api/commands';
import type { CreateWorkspaceResponse, SeedSummary, SessionInfo } from '../shared/api/sessions';
import type { FileInitRequest, FileInitResponse, FileMetadata } from '../shared/api/files';

const API_BASE = '/api';
const CONNECTION_KEY = 'ste-auditsphere-cloud-workspace-v1';
/** Non-secret reconnect hint: the cookie session is the real credential. */
type ConnectionHint = { workspaceId: string; name: string; revision: number };

export type CloudWorkspaceMode = 'local' | 'loading' | 'saved' | 'saving' | 'offline' | 'conflict';
export type CloudWorkspaceStatus = {
  mode: CloudWorkspaceMode;
  message: string;
  workspaceId?: string;
  workspaceName?: string;
  revision?: number;
};

/**
 * Command families whose mutations are executed by the Worker.
 *
 * Only families with a COMPLETE, faithful browser-free body are listed here, so a
 * cloud workspace and a local workspace enforce exactly the same rules. Families
 * whose browser implementation is still richer than the shared body
 * (`engagement.updateAdmin`, `invoice.create` with source-linked lines) are
 * deliberately excluded and stay browser-local.
 */
export const SYNCED_COMMAND_TYPES: readonly string[] = [
  'client.create',
  'client.update',
  'client.nominateContact',
  'client.reviewContactNomination',
  'client.setCustomField',
  'client.defineCustomField',
  'client.setCustomFieldEnabled',
  'client.assignRelationshipGroup',
  'client.createRelationshipGroup',
  'contact.create',
  'contact.update',
  'contact.setPrimary',
  'lead.create',
  'lead.update',
  'lead.convert',
  'proposal.create',
  'proposal.update',
  'proposal.present',
  'proposal.review',
  'proposal.revise',
  'proposal.respond',
  'engagement.create',
  'engagement.setLifecycle',
  'invoice.review',
  'invoice.issue'
];

let hint: ConnectionHint | null = null;
let status: CloudWorkspaceStatus = { mode: 'local', message: 'Local workspace' };
const listeners = new Set<() => void>();
let initialized = false;
let applying = false;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshPending: Promise<void> | undefined;
let commandQueue: Promise<unknown> = Promise.resolve();

function publish(next: CloudWorkspaceStatus) {
  status = next;
  listeners.forEach(listener => listener());
}

export const cloudWorkspaceSnapshot = () => status;
export function subscribeCloudWorkspace(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** True when a cloud workspace session is active (cookie-backed). */
export const cloudWorkspaceConnected = () => status.mode === 'saved' || status.mode === 'saving' || status.mode === 'conflict';

async function request<T>(path: string, options: RequestInit = {}, withBody = true): Promise<T> {
  const response = await fetch(API_BASE + path, {
    ...options,
    credentials: 'same-origin',
    signal: AbortSignal.timeout(20000),
    headers: {
      ...(withBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {})
    }
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = (body as { message?: string; error?: string } | undefined)?.message
      || (body as { error?: string } | undefined)?.error
      || 'Cloud workspace request failed.';
    throw Object.assign(new Error(message), { status: response.status });
  }
  return body as T;
}

function rememberHint() {
  if (hint) localStorage.setItem(CONNECTION_KEY, JSON.stringify(hint));
  else localStorage.removeItem(CONNECTION_KEY);
}

function adopt(workspaceId: string, name: string, revision: number) {
  hint = { workspaceId, name, revision };
  rememberHint();
}

/** Replace the local projection with the authoritative server snapshot. */
async function applyWorkspaceState(state: unknown, revision: number) {
  applying = true;
  try {
    const { prototypeStore } = await import('../store/prototypeStore');
    prototypeStore.importStateJSON(JSON.stringify(state));
  } finally { applying = false; }
  if (hint) {
    hint.revision = revision;
    rememberHint();
  }
  publish({ mode: 'saved', message: 'Cloud workspace saved', workspaceId: hint?.workspaceId, workspaceName: hint?.name, revision });
}

export const isApplyingRemoteState = () => applying;

// --- Seeds & lifecycle ------------------------------------------------------

export async function listSeeds(): Promise<SeedSummary[]> {
  return (await request<{ seeds: SeedSummary[] }>('/seeds', {}, false)).seeds;
}

export async function createWorkspace(seedId: string, name?: string): Promise<CreateWorkspaceResponse> {
  const created = await request<CreateWorkspaceResponse>('/workspaces', {
    method: 'POST',
    body: JSON.stringify({ seedId, ...(name ? { name } : {}) })
  });
  adopt(created.workspaceId, created.workspaceName, created.revision);
  await loadWorkspaceState();
  return created;
}

export async function resumeWorkspace(accessCode: string): Promise<void> {
  const code = accessCode.trim();
  if (!/^[a-f0-9-]{36}\.[-A-Za-z0-9]+$/.test(code)) throw new Error('Enter a valid workspace access code.');
  const [workspaceId] = code.split('.');
  await request<{ session: SessionInfo }>('/workspaces/resume', { method: 'POST', body: JSON.stringify({ accessCode: code }) });
  adopt(workspaceId, 'Cloud workspace', 0);
  await loadWorkspaceState();
}

export async function loadWorkspaceState(): Promise<void> {
  if (!hint) throw new Error('No cloud workspace is connected.');
  const state = await request<StateResponse>(`/workspaces/${hint.workspaceId}/state`, {}, false);
  if (state.workspaceId !== hint.workspaceId) throw new Error('Cloud session does not match this workspace.');
  await applyWorkspaceState(state.state, state.revision);
}

/** Reconnect from the stored non-secret hint; the cookie authenticates us. */
export async function initializeCloudWorkspace(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const cached = localStorage.getItem(CONNECTION_KEY);
  if (!cached) return;
  try {
    const parsed = JSON.parse(cached) as ConnectionHint;
    if (!parsed?.workspaceId) return;
    hint = parsed;
    const state = await request<StateResponse>(`/workspaces/${parsed.workspaceId}/state`, {}, false);
    await applyWorkspaceState(state.state, state.revision);
  } catch (error) {
    const code = (error as { status?: number }).status;
    publish({
      mode: 'offline',
      message: code === 401 || code === 403
        ? 'Cloud session expired. Resume with the workspace access code to reconnect; local work is preserved.'
        : 'Cloud unavailable; the local workspace remains usable.',
      workspaceId: hint?.workspaceId,
      workspaceName: hint?.name
    });
  }
}

/** Pull the authoritative state shortly after a committed command. */
function scheduleStateRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { void refreshWorkspaceState(); }, 250);
}

export async function refreshWorkspaceState(): Promise<void> {
  if (!hint) return;
  if (refreshPending) return refreshPending;
  refreshPending = (async () => {
    try {
      const state = await request<StateResponse>(`/workspaces/${hint!.workspaceId}/state`, {}, false);
      await applyWorkspaceState(state.state, state.revision);
    } catch (error) {
      publish({
        mode: 'offline',
        message: error instanceof Error ? error.message : 'Cloud unavailable; local work is preserved.',
        workspaceId: hint?.workspaceId,
        workspaceName: hint?.name,
        revision: hint?.revision
      });
    } finally { refreshPending = undefined; }
  })();
  return refreshPending;
}

// --- Commands ----------------------------------------------------------------

/** Execute one typed command server-authoritatively, then adopt the committed state. */
export function executeCommand(command: WorkspaceCommand, expectedRevision?: number): Promise<CommandResponse> {
  const task = commandQueue.then(async () => {
    if (!hint) throw new Error('Connect a cloud workspace before executing cloud commands.');
    const workspaceId = hint.workspaceId;
    const expected = expectedRevision ?? hint.revision;
    try {
      const idempotencyKey = globalThis.crypto.randomUUID();
      const response = await request<CommandResponse>(`/workspaces/${workspaceId}/commands`, {
        method: 'POST',
        body: JSON.stringify({ command, expectedRevision: expected, idempotencyKey })
      });
      if (hint?.workspaceId === workspaceId) {
        hint.revision = response.revision;
        rememberHint();
        publish({ mode: 'saved', message: 'Cloud command saved; other unsynced local edits remain local.', workspaceId, workspaceName: hint.name, revision: hint.revision });
      }
      return response;
    } catch (error) {
      const conflict = (error as { status?: number }).status === 409;
      publish({
        mode: conflict ? 'conflict' : 'offline',
        message: conflict
          ? 'Cloud revision moved ahead. Local work is preserved; reload the cloud revision to continue.'
          : error instanceof Error ? error.message : 'Cloud command failed; local work is preserved.',
        workspaceId: hint?.workspaceId,
        workspaceName: hint?.name,
        revision: hint?.revision
      });
      throw error;
    }
  });
  commandQueue = task.catch(() => undefined);
  return task;
}

export async function listChanges(sinceRevision?: number): Promise<ChangesResponse> {
  if (!hint) throw new Error('No cloud workspace is connected.');
  const query = Number.isInteger(sinceRevision) ? `?since=${sinceRevision}` : '';
  return request<ChangesResponse>(`/workspaces/${hint.workspaceId}/changes${query}`, {}, false);
}

export async function switchPersona(userId: string): Promise<SessionInfo> {
  if (!hint) throw new Error('No cloud workspace is connected.');
  const result = await request<{ session: SessionInfo; actor: SessionInfo['actor'] }>('/session/persona', {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
  await loadWorkspaceState();
  return result.session;
}

export async function logout(): Promise<void> {
  if (!hint) return;
  await request('/session/logout', { method: 'POST', body: '{}' });
  disconnectLocalProjection();
}

// --- Files (R2-backed exact bytes) -------------------------------------------

export async function uploadFile(init: FileInitRequest, bytes: ArrayBuffer | Uint8Array): Promise<FileMetadata> {
  if (!hint) throw new Error('Connect a cloud workspace before uploading files.');
  const started = await request<FileInitResponse>(`/workspaces/${hint.workspaceId}/files`, {
    method: 'POST',
    body: JSON.stringify(init)
  });
  const content = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // uploadUrl is an absolute same-origin path from the Worker; stream bytes straight to it.
  const upload = await fetch(started.uploadUrl, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: content as unknown as BodyInit,
    signal: AbortSignal.timeout(60000)
  });
  if (!upload.ok) throw new Error('Cloud file upload failed; the staged file was not stored.');
  const completed = await request<{ file: FileMetadata; verifiedSha256: string }>(
    `/workspaces/${hint.workspaceId}/files/${started.file.id}/complete`,
    { method: 'POST', body: JSON.stringify({ sizeBytes: content.byteLength, sha256: init.sha256 }) }
  );
  return completed.file;
}

export const completeFile = async (fileId: string, sizeBytes: number, sha256?: string): Promise<{ file: FileMetadata; verifiedSha256: string }> => {
  if (!hint) throw new Error('No cloud workspace is connected.');
  return request(`/workspaces/${hint.workspaceId}/files/${fileId}/complete`, { method: 'POST', body: JSON.stringify({ sizeBytes, sha256 }) });
};

export async function downloadFile(fileId: string): Promise<Blob> {
  if (!hint) throw new Error('No cloud workspace is connected.');
  const response = await fetch(`${API_BASE}/workspaces/${hint.workspaceId}/files/${fileId}`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Cloud file download failed.');
  return response.blob();
}

export async function listFiles(): Promise<FileMetadata[]> {
  if (!hint) throw new Error('No cloud workspace is connected.');
  const result = await request<{ files: FileMetadata[] }>(`/workspaces/${hint.workspaceId}/files`, {}, false);
  return result.files ?? [];
}

/** Drop the reconnect hint and stop syncing; local unsaved work is preserved. */
export function disconnectLocalProjection() {
  hint = null;
  localStorage.removeItem(CONNECTION_KEY);
  publish({ mode: 'local', message: 'Disconnected; the current workspace remains local.' });
}

/** Queue one accepted shared-domain command for the cookie-authorized Worker. */
export function dispatchServerCommand(command: WorkspaceCommand): void {
  if (!cloudWorkspaceConnected() || !SYNCED_COMMAND_TYPES.includes(command.type)) return;
  void executeCommand(command).catch(() => {
    // Keep accepted local state visible while exposing that server sync paused.
  });
}
