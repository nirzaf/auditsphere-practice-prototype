import { isApiErrorBody } from '../shared/api/errors';
import type {
  BusinessActorProfile,
  BusinessContextResponse,
  BusinessClientDetail,
  BusinessClientSummary,
  BusinessDirectoryCommandResponse,
  BusinessFileMediaType,
  BusinessFileMetadata,
  BusinessFilePurpose,
  BusinessFileReservation,
  BusinessLead,
  BusinessPersona,
  BusinessProposalWorkspace,
  BusinessStandardsProfile,
  BusinessWorkspaceBootstrapRequest,
  BusinessWorkspaceBootstrapResponse,
  BusinessWorkspacePreference,
  BusinessWorkspaceSummary
} from '../shared/api/business';

const STORAGE_KEY = 'auditsphere.business-context.v1';
const listeners = new Set<() => void>();

function parsePreference(value: unknown): BusinessWorkspacePreference | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<BusinessWorkspacePreference>;
  if (item.version !== 1 || typeof item.workspaceId !== 'string' || !item.workspaceId.trim()) return null;
  if (item.persona !== undefined && !['PREPARER', 'REVIEWER', 'APPROVER', 'CLIENT'].includes(item.persona)) return null;
  if (item.actorId !== undefined && typeof item.actorId !== 'string') return null;
  if (item.clientId !== undefined && typeof item.clientId !== 'string') return null;
  if (item.engagementId !== undefined && typeof item.engagementId !== 'string') return null;
  return {
    version: 1,
    workspaceId: item.workspaceId.trim(),
    ...(item.actorId ? { actorId: item.actorId } : {}),
    ...(item.persona ? { persona: item.persona } : {}),
    ...(item.clientId ? { clientId: item.clientId } : {}),
    ...(item.engagementId ? { engagementId: item.engagementId } : {})
  };
}

function readPreference(): BusinessWorkspacePreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parsePreference(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

let preference = readPreference();

function publish(next: BusinessWorkspacePreference | null): void {
  preference = next;
  if (typeof window !== 'undefined') {
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // A denied browser storage write must not turn into business-data fallback.
    }
  }
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    try { preference = event.newValue ? parsePreference(JSON.parse(event.newValue)) : null; }
    catch { preference = null; }
    for (const listener of listeners) listener();
  });
}

export const businessWorkspaceSnapshot = (): BusinessWorkspacePreference | null => preference;
export const subscribeBusinessWorkspace = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function saveBusinessWorkspacePreference(next: BusinessWorkspacePreference): void {
  const parsed = parsePreference(next);
  if (!parsed) throw new Error('A valid business workspace selection is required.');
  publish(parsed);
}

export function clearBusinessWorkspacePreference(): void {
  publish(null);
}

export function selectBusinessActor(profile: BusinessActorProfile): void {
  if (!preference) return;
  publish({
    version: 1,
    workspaceId: preference.workspaceId,
    actorId: profile.id,
    persona: profile.persona,
    ...(profile.persona === 'CLIENT' && profile.clientId ? { clientId: profile.clientId } : {})
  });
}

function contextHeaders(current: BusinessWorkspacePreference | null = preference): Headers {
  const headers = new Headers();
  if (current?.actorId && current.persona) {
    headers.set('X-Actor-Id', current.actorId);
    headers.set('X-Active-Persona', current.persona);
  }
  if (current?.clientId) headers.set('X-Client-Id', current.clientId);
  if (current?.engagementId) headers.set('X-Engagement-Id', current.engagementId);
  return headers;
}

async function requestJson<T>(path: string, options: {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  context?: BusinessWorkspacePreference | null;
  signal?: AbortSignal;
} = {}): Promise<T> {
  const headers = contextHeaders(options.context === undefined ? preference : options.context);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'omit',
      cache: 'no-store',
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {})
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Business workspace is unavailable. Check the connection and retry.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (isApiErrorBody(body)) throw Object.assign(new Error(body.message), { code: body.code, requestId: body.requestId });
    throw new Error('The business workspace request failed. Retry or check the service status.');
  }
  return body as T;
}

async function requestBinary<T>(path: string, file: Blob, options: {
  contentType: BusinessFileMediaType;
  expectedVersion: number;
  idempotencyKey: string;
  context: BusinessWorkspacePreference;
}): Promise<T> {
  if (!options.context.actorId || !options.context.persona) throw new Error('Select an active actor profile before uploading a file.');
  const headers = contextHeaders(options.context);
  headers.set('Content-Type', options.contentType);
  headers.set('X-File-Version', String(options.expectedVersion));
  headers.set('Idempotency-Key', options.idempotencyKey);
  let response: Response;
  try {
    response = await fetch(path, { method: 'PUT', /* raw file bytes go only to the file /content endpoint */ headers, body: file, credentials: 'omit', cache: 'no-store' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Business file storage is unavailable. Retry the upload with the same file.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (isApiErrorBody(body)) throw Object.assign(new Error(body.message), { code: body.code, requestId: body.requestId });
    throw new Error('The file upload failed. Retry or check the service status.');
  }
  return body as T;
}

export async function createBusinessWorkspace(
  input: BusinessWorkspaceBootstrapRequest,
  idempotencyKey: string
): Promise<BusinessWorkspaceBootstrapResponse> {
  return requestJson<BusinessWorkspaceBootstrapResponse>('/api/workspaces', {
    method: 'POST', body: input, idempotencyKey, context: null
  });
}

export async function getBusinessWorkspace(workspaceId: string, signal?: AbortSignal): Promise<BusinessWorkspaceSummary> {
  const result = await requestJson<{ workspace: BusinessWorkspaceSummary }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}`, { context: null, signal }
  );
  if (result.workspace.dataMode !== 'BUSINESS') throw new Error('That workspace is not a BUSINESS workspace.');
  return result.workspace;
}

export async function getBusinessActorProfiles(workspaceId: string, signal?: AbortSignal): Promise<BusinessActorProfile[]> {
  const result = await requestJson<{ items: BusinessActorProfile[]; nextCursor: null }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/actor-profiles`, { context: null, signal }
  );
  return result.items;
}

export async function getBusinessContext(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessContextResponse> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/context`, { context: selected, signal });
}

export async function getBusinessClients(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<{ items: BusinessClientSummary[]; nextCursor: string | null }> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/clients?limit=100`, { context: selected, signal });
}

export async function getBusinessClient(
  workspaceId: string,
  clientId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessClientDetail> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/clients/${encodeURIComponent(clientId)}`, { context: selected, signal });
}

export async function getBusinessLeads(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<{ items: BusinessLead[]; nextCursor: string | null }> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/leads?limit=100`, { context: selected, signal });
}

export async function getBusinessStandardsProfiles(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessStandardsProfile[]> {
  const result = await requestJson<{ items: BusinessStandardsProfile[] }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/standards-profiles`, { context: selected, signal }
  );
  return result.items;
}

export async function getBusinessProposalWorkspace(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessProposalWorkspace> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/proposal-workspace`, { context: selected, signal });
}

export async function getBusinessFiles(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessFileMetadata[]> {
  const result = await requestJson<{ files: BusinessFileMetadata[] }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/files?limit=100`, { context: selected, signal }
  );
  return result.files;
}

export function initializeBusinessFile(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  input: { purpose: BusinessFilePurpose; originalName: string; mediaType: BusinessFileMediaType; sizeBytes: number; clientId?: string; engagementId?: string },
  idempotencyKey: string
): Promise<BusinessFileReservation> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/files`, {
    method: 'POST', body: input, idempotencyKey, context: selected
  });
}

export function uploadBusinessFile(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  reservation: BusinessFileReservation,
  file: Blob,
  mediaType: BusinessFileMediaType,
  idempotencyKey: string
): Promise<{ fileId: string; version: number; state: 'STAGED'; sizeBytes: number; sha256: string; commandId: string; replayed: boolean }> {
  return requestBinary(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(reservation.fileId)}/content`, file, {
    contentType: mediaType, expectedVersion: reservation.version, idempotencyKey, context: selected
  });
}

export function completeBusinessFile(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  staged: { fileId: string; version: number; sizeBytes: number; sha256: string },
  idempotencyKey: string
): Promise<{ fileId: string; version: number; state: 'COMMITTED'; sizeBytes: number; sha256: string; commandId: string; replayed: boolean }> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(staged.fileId)}/complete`, {
    method: 'POST', body: { expectedVersion: staged.version, sizeBytes: staged.sizeBytes, sha256: staged.sha256 }, idempotencyKey, context: selected
  });
}

export function getBusinessFileDownloadUrl(workspaceId: string, fileId: string): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(fileId)}`;
}

export async function downloadBusinessFile(
  workspaceId: string,
  file: BusinessFileMetadata,
  selected: BusinessWorkspacePreference
): Promise<Blob> {
  const headers = contextHeaders(selected);
  let response: Response;
  try {
    response = await fetch(getBusinessFileDownloadUrl(workspaceId, file.id), {
      headers, credentials: 'omit', cache: 'no-store'
    });
  } catch {
    throw new Error('Business file storage is unavailable. Retry the download.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (isApiErrorBody(body)) throw Object.assign(new Error(body.message), { code: body.code, requestId: body.requestId });
    throw new Error('The file download failed. Check the service status and retry.');
  }
  return response.blob();
}

export async function runBusinessCommand<T = Record<string, unknown>>(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  command: unknown,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<BusinessDirectoryCommandResponse<T>> {
  if (!selected.actorId || !selected.persona) throw new Error('Select an active actor profile before making a business change.');
  const value = command && typeof command === 'object' ? command as { type?: string; payload?: Record<string, unknown> } : {};
  const payload = value.payload ?? {};
  const commandVersion = value.type === 'proposal.create' ? payload.expectedEngagementVersion : payload.expectedVersion;
  const versionTarget = typeof commandVersion === 'number'
    ? value.type === 'staff.update' ? { entity: 'StaffMember', id: payload.staffMemberId }
      : value.type === 'actor-profile.deactivate' ? { entity: 'ActorProfile', id: payload.actorProfileId }
        : value.type === 'client.update' || value.type === 'client.deactivate' ? { entity: 'Client', id: payload.clientId }
          : value.type === 'contact.update' ? { entity: 'Contact', id: payload.contactId }
            : value.type === 'lead.update' || value.type === 'lead.lose' || value.type === 'lead.convert' ? { entity: 'Lead', id: payload.leadId }
              : value.type === 'engagement.advance' ? { entity: 'Engagement', id: payload.engagementId }
            : value.type === 'team-cv.approve' ? { entity: 'TeamCv', id: payload.teamCvId }
              : value.type === 'proposal.create' ? { entity: 'Engagement', id: payload.engagementId }
                : value.type === 'proposal.revise' ? { entity: 'Proposal', id: payload.proposalId }
              : value.type === 'proposal.generate' || value.type === 'proposal.generate.retry' || value.type === 'proposal.approve' || value.type === 'proposal.dispatch' ? { entity: 'ProposalVersion', id: payload.proposalVersionId }
                : value.type === 'proposal.dispatch.retry' ? { entity: 'Dispatch', id: payload.dispatchId }
                : null
    : null;
  const expectedVersions = versionTarget && typeof versionTarget.id === 'string'
    ? [{ ...versionTarget, version: commandVersion as number }]
    : [];
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/commands`, {
    method: 'POST',
    body: {
      actor: { persona: selected.persona, actorId: selected.actorId },
      context: {
        ...(selected.clientId ? { clientId: selected.clientId } : {}),
        ...(selected.engagementId ? { engagementId: selected.engagementId } : {})
      },
      expectedVersions,
      command
    },
    idempotencyKey, context: selected, signal
  });
}

export const newBusinessIdempotencyKey = (): string => crypto.randomUUID();

export function personaLabel(persona: BusinessPersona): string {
  return persona;
}
