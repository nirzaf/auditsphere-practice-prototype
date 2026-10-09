import { isApiErrorBody } from '../shared/api/errors';
import { sha256 } from '@noble/hashes/sha2.js';
import type {
  BusinessActorProfile,
  BusinessWorkspaceChangeFeed,
  BusinessWorkflowProgress,
  BusinessContextResponse,
  BusinessClientDetail,
  BusinessClientSummary,
  BusinessDirectoryCommandResponse,
  BusinessUserSummary,
  BusinessFileMediaType,
  BusinessFileMetadata,
  BusinessFilePurpose,
  BusinessPbcEngagement,
  BusinessPbcPortal,
  BusinessPlanningWorkspace,
  BusinessPlanningReadiness,
  BusinessTrialBalanceWorkspace,
  BusinessFinancialStatements,
  BusinessFieldworkWorkspace,
  BusinessTrialBalancePreview,
  BusinessTrialBalanceImport,
  BusinessCapacity,
  BusinessFileReservation,
  BusinessAcceptanceGate,
  BusinessRiskWorkspace,
  BusinessDeliveryWorkspace,
  BusinessLead,
  BusinessPersona,
  BusinessProposalWorkspace,
  BusinessStandardsProfile,
  BusinessWorkspacePreference,
  BusinessWorkspaceSummary
} from '../shared/api/business';

const STORAGE_KEY = 'auditsphere.business-context.v1';
const listeners = new Set<() => void>();

function parsePreference(value: unknown): BusinessWorkspacePreference | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<BusinessWorkspacePreference>;
  if (item.version !== 1 || typeof item.workspaceId !== 'string' || !item.workspaceId.trim()) return null;
  if (item.clientId !== undefined && typeof item.clientId !== 'string') return null;
  if (item.engagementId !== undefined && typeof item.engagementId !== 'string') return null;
  return {
    version: 1,
    workspaceId: item.workspaceId.trim(),
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

export interface LoadedBusinessContext {
  workspaceId: string;
  response: BusinessContextResponse;
}

export function isBusinessContextCurrent(
  context: LoadedBusinessContext | null,
  selected: BusinessWorkspacePreference | null,
  activeProfileId: string | null
): context is LoadedBusinessContext {
  return Boolean(context && selected && activeProfileId
    && context.workspaceId === selected.workspaceId
    && context.response.actor.id === activeProfileId
    && context.response.scope.clientId === (selected.clientId ?? null)
    && context.response.scope.engagementId === (selected.engagementId ?? null));
}

export function saveBusinessWorkspacePreference(next: BusinessWorkspacePreference): void {
  const parsed = parsePreference(next);
  if (!parsed) throw new Error('A valid business workspace selection is required.');
  publish(parsed);
}

export function clearBusinessWorkspacePreference(): void {
  publish(null);
}

function contextHeaders(current: BusinessWorkspacePreference | null = preference): Headers {
  const headers = new Headers();
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
      credentials: 'same-origin',
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
    if (response.status === 401 && typeof window !== 'undefined' && path.startsWith('/api/workspaces/')) {
      window.dispatchEvent(new CustomEvent('auditsphere:session-expired'));
    }
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
  if (!options.context.workspaceId) throw new Error('An authenticated business workspace is required before uploading a file.');
  const headers = contextHeaders(options.context);
  headers.set('Content-Type', options.contentType);
  headers.set('X-File-Version', String(options.expectedVersion));
  headers.set('Idempotency-Key', options.idempotencyKey);
  let response: Response;
  try {
    response = await fetch(path, { method: 'PUT', /* raw file bytes go only to the file /content endpoint */ headers, body: file, credentials: 'same-origin', cache: 'no-store' });
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

export async function getBusinessUsers(workspaceId: string, signal?: AbortSignal): Promise<BusinessUserSummary[]> {
  const result = await requestJson<{ items: BusinessUserSummary[]; nextCursor: null }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/users`, { context: null, signal }
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

export async function getBusinessWorkspaceChanges(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  options: { after?: string; engagementId?: string; limit?: number; signal?: AbortSignal } = {}
): Promise<BusinessWorkspaceChangeFeed> {
  const query = new URLSearchParams({ after: options.after ?? '0', limit: String(options.limit ?? 100) });
  if (options.engagementId) query.set('engagementId', options.engagementId);
  return requestJson(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/changes?${query}`,
    { context: selected, signal: options.signal }
  );
}

export async function getBusinessWorkflowProgress(
  workspaceId: string,
  engagementId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessWorkflowProgress> {
  return requestJson(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/workflow`,
    { context: selected, signal }
  );
}

export async function getBusinessClients(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  options: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {}
): Promise<{ items: BusinessClientSummary[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 100) });
  if (options.cursor) query.set('cursor', options.cursor);
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/clients?${query}`, { context: selected, signal: options.signal });
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
  options: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {}
): Promise<{ items: BusinessLead[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 100) });
  if (options.cursor) query.set('cursor', options.cursor);
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/leads?${query}`, { context: selected, signal: options.signal });
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

export async function getBusinessAcceptanceGate(
  workspaceId: string,
  engagementId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessAcceptanceGate> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/acceptance-gate`, { context: selected, signal });
}

export async function getBusinessRiskWorkspace(
  workspaceId: string,
  engagementId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessRiskWorkspace> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/risk-workspace`, { context: selected, signal });
}

export async function getBusinessDeliveryWorkspace(
  workspaceId: string,
  engagementId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessDeliveryWorkspace> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/delivery-workspace`, { context: selected, signal });
}

export async function getBusinessPracticeWorkspace(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  input: { from: string; to: string; engagementId?: string; asOfDate?: string },
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ from: input.from, to: input.to, ...(input.engagementId ? { engagementId: input.engagementId } : {}),
    ...(input.asOfDate ? { asOfDate: input.asOfDate } : {}) });
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/practice?${query}`, { context: selected, signal });
}

export async function getBusinessFirmProfitLossReport(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  month: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ month });
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/practice/reports/profit-loss?${query}`, { context: selected, signal });
}

export async function getBusinessReportingWorkspace(
  workspaceId: string,
  engagementId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/reporting-workspace`, { context: selected, signal });
}

export async function getBusinessOpinionPreview(
  workspaceId: string,
  engagementId: string,
  opinionVersionId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ versionId: opinionVersionId });
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/opinion-preview?${query}`, { context: selected, signal });
}

export async function getBusinessReleasedReportProvenance(
  workspaceId: string,
  engagementId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/released-report/provenance`, { context: selected, signal });
}

export async function getBusinessPlanningWorkspace(
  workspaceId: string,
  engagementId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessPlanningWorkspace> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/planning-workspace`, { context: selected, signal });
}

export async function getBusinessTrialBalanceWorkspace(
  workspaceId: string,
  engagementId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessTrialBalanceWorkspace> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/trial-balance-workspace`, { context: selected, signal });
}

export async function getBusinessFinancialStatements(workspaceId:string,engagementId:string,selected:BusinessWorkspacePreference,signal?:AbortSignal):Promise<BusinessFinancialStatements>{
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/financial-statements`,{context:selected,signal});
}
export async function getBusinessFsliSourceLines(workspaceId:string,engagementId:string,fsliId:string,selected:BusinessWorkspacePreference,signal?:AbortSignal){
  const query=new URLSearchParams({limit:'100'});return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/fslis/${encodeURIComponent(fsliId)}/source-lines?${query}`,{context:selected,signal});
}
export async function getBusinessFieldworkWorkspace(workspaceId:string,engagementId:string,selected:BusinessWorkspacePreference,signal?:AbortSignal):Promise<BusinessFieldworkWorkspace>{
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/fieldwork-workspace`,{context:selected,signal});
}
export async function getBusinessSamplingPlan(workspaceId:string,engagementId:string,planId:string,selected:BusinessWorkspacePreference,signal?:AbortSignal):Promise<Record<string,unknown>>{
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/sampling-plans/${encodeURIComponent(planId)}`,{context:selected,signal});
}
export async function getBusinessSamplingPopulation(workspaceId:string,engagementId:string,populationId:string,selected:BusinessWorkspacePreference,signal?:AbortSignal):Promise<Record<string,unknown>>{
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/sampling-populations/${encodeURIComponent(populationId)}`,{context:selected,signal});
}
export async function getBusinessFieldworkChanges<T = { changes: unknown[]; nextCursor: string; hasMore: boolean }>(workspaceId:string,engagementId:string,selected:BusinessWorkspacePreference,after:number,signal?:AbortSignal):Promise<T>{
  const query=new URLSearchParams({after:String(after),limit:'100'});return requestJson<T>(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/changes?${query}`,{context:selected,signal});
}

export async function getBusinessTrialBalancePreview(
  workspaceId: string,
  engagementId: string,
  fileId: string,
  selected: BusinessWorkspacePreference,
  worksheet?: string,
  signal?: AbortSignal
): Promise<BusinessTrialBalancePreview> {
  const query = new URLSearchParams({ fileId, ...(worksheet ? { worksheet } : {}) });
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/trial-balance-preview?${query}`, { context: selected, signal });
}

export async function getBusinessTrialBalanceImport(
  workspaceId: string,
  engagementId: string,
  importId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessTrialBalanceImport> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/tb-imports/${encodeURIComponent(importId)}`, { context: selected, signal });
}

export async function getBusinessPlanningReadiness(
  workspaceId: string,
  engagementId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessPlanningReadiness> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/planning-readiness`, { context: selected, signal });
}

export async function getBusinessCapacity(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  from: string,
  to: string,
  signal?: AbortSignal
): Promise<BusinessCapacity> {
  const query = new URLSearchParams({ from, to });
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/capacity?${query}`, { context: selected, signal });
}

export async function getBusinessPbcEngagements(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessPbcEngagement[]> {
  const result = await requestJson<{ engagements: BusinessPbcEngagement[] }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/pbc-engagements`, { context: selected, signal }
  );
  return result.engagements;
}

export async function getBusinessPbcPortal(
  workspaceId: string,
  engagementId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<BusinessPbcPortal> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/portal`, { context: selected, signal });
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
  input: { purpose: BusinessFilePurpose; originalName: string; mediaType: BusinessFileMediaType; sizeBytes: number; clientId?: string; engagementId?: string;
    folderId?: string; pbcRequestId?: string; expectedPbcRequestVersion?: number; representationRequestId?: string; paymentEvidenceReservationId?: string },
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
  return downloadBusinessFileVersion(workspaceId, file.id, selected);
}

export async function downloadBusinessFileVersion(
  workspaceId: string,
  fileId: string,
  selected: BusinessWorkspacePreference
): Promise<Blob> {
  const headers = contextHeaders(selected);
  let response: Response;
  try {
    response = await fetch(getBusinessFileDownloadUrl(workspaceId, fileId), {
      headers, credentials: 'same-origin', cache: 'no-store'
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

export async function createBusinessArchiveDownloadTicket(
  workspaceId:string,
  engagementId:string,
  selected:BusinessWorkspacePreference
):Promise<{downloadUrl:string;expiresAt:string}>{
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/archive/download-ticket`,{
    method:'POST',context:selected
  });
}

export async function downloadBusinessArchiveExport(
  workspaceId: string,
  engagementId: string,
  part: 'archive' | 'manifest',
  selected: BusinessWorkspacePreference,
  expectedArchiveSha256: string,
  expectedManifestSha256: string,
  writable?: { write(chunk: Uint8Array): Promise<void>; close(): Promise<void>; abort?(reason?: unknown): Promise<void> }
): Promise<{ blob?: Blob; fileName: string }> {
  if (part === 'archive' && !writable) {
    throw new Error('Use the native download ticket for archives unless a streamed file destination is available.');
  }
  const query = new URLSearchParams({ part });
  let response: Response;
  try {
    response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/archive/export?${query}`, {
      headers: contextHeaders(selected), credentials: 'same-origin', cache: 'no-store'
    });
  } catch {
    throw new Error('The sealed archive service is unavailable. Retry the export.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (isApiErrorBody(body)) throw Object.assign(new Error(body.message), { code: body.code, requestId: body.requestId });
    throw new Error('The sealed archive export failed. Check the service status and retry.');
  }
  if (response.headers.get('X-Archive-SHA256') !== expectedArchiveSha256
    || response.headers.get('X-Archive-Manifest-SHA256') !== expectedManifestSha256) {
    throw new Error('The archive export response does not match the independently recorded seal hashes.');
  }
  const expectedType = part === 'manifest' ? 'application/json' : 'application/zip';
  if (response.headers.get('Content-Type')?.split(';', 1)[0]?.trim() !== expectedType) {
    throw new Error('The archive export returned an unexpected media type.');
  }
  const contentLength = response.headers.get('Content-Length');
  const expectedSize = contentLength === null ? undefined : Number(contentLength);
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(expectedSize) || expectedSize! < 0)) {
    throw new Error('The archive export response has an invalid content length.');
  }
  if (writable && part === 'archive') {
    if (expectedSize === undefined || expectedSize <= 0 || !response.body) {
      throw new Error('The streamed archive response is missing a valid size or body.');
    }
    const reader = response.body.getReader();
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > expectedSize) throw new Error('The streamed archive exceeded its sealed size.');
        await writable.write(value);
      }
      if (received !== expectedSize) throw new Error('The streamed archive was incomplete and did not match its sealed size.');
      await writable.close();
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      await writable.abort?.(error).catch(() => undefined);
      throw error;
    }
    return { fileName: 'sealed-audit-archive.zip' };
  }
  if (!response.body) throw new Error('The archive export response has no readable body.');
  const hash = sha256.create();
  let received = 0;
  const integrityStream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(value, controller) {
      if (!value?.byteLength) return;
      const nextSize = received + value.byteLength;
      if (!Number.isSafeInteger(nextSize) || (expectedSize !== undefined && nextSize > expectedSize)) {
        throw new Error('The archive export exceeded its declared exact byte count.');
      }
      received = nextSize;
      hash.update(value);
      controller.enqueue(value);
    },
    flush() {
      if (expectedSize !== undefined && received !== expectedSize) {
        throw new Error('The archive export was incomplete and did not match its declared size.');
      }
      const actualHash = [...hash.digest()].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (actualHash !== expectedHash) throw new Error('The exported bytes failed the client-side SHA-256 check.');
    }
  }));
  const expectedHash = part === 'manifest' ? expectedManifestSha256 : expectedArchiveSha256;
  const blob = await new Response(integrityStream, { headers: { 'Content-Type': expectedType } }).blob();
  return { blob, fileName: part === 'manifest' ? 'archive-manifest.json' : 'sealed-audit-archive.zip' };
}

export function getBusinessArchiveStatus(
  workspaceId: string,
  engagementId: string,
  selected: BusinessWorkspacePreference,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/engagements/${encodeURIComponent(engagementId)}/archive-status`, {
    context: selected, signal
  });
}

export async function runBusinessCommand<T = Record<string, unknown>>(
  workspaceId: string,
  selected: BusinessWorkspacePreference,
  command: unknown,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<BusinessDirectoryCommandResponse<T>> {
  if (!selected.workspaceId) throw new Error('An authenticated business workspace is required before making a business change.');
  const value = command && typeof command === 'object' ? command as { type?: string; payload?: Record<string, unknown> } : {};
  const payload = value.payload ?? {};
  const commandVersion = value.type === 'proposal.create' ? payload.expectedEngagementVersion
    : value.type === 'pbc.submit' || value.type === 'pbc.review' ? payload.expectedRequestVersion : payload.expectedVersion;
  const versionTarget = typeof commandVersion === 'number'
    ? value.type === 'staff.update' ? { entity: 'StaffMember', id: payload.staffMemberId }
      : value.type === 'actor-profile.deactivate' ? { entity: 'ActorProfile', id: payload.actorProfileId }
        : ['user.unlock', 'user.grantProfile', 'user.disable', 'user.enable'].includes(String(value.type))
          ? { entity: 'UserAccount', id: payload.userAccountId }
        : value.type === 'client.update' || value.type === 'client.deactivate' ? { entity: 'Client', id: payload.clientId }
          : value.type === 'contact.update' ? { entity: 'Contact', id: payload.contactId }
            : value.type === 'lead.update' || value.type === 'lead.lose' || value.type === 'lead.convert' ? { entity: 'Lead', id: payload.leadId }
              : value.type === 'engagement.advance' ? { entity: 'Engagement', id: payload.engagementId }
            : value.type === 'team-cv.approve' ? { entity: 'TeamCv', id: payload.teamCvId }
                : value.type === 'pbc.submit' || value.type === 'pbc.review' ? { entity: 'PbcRequest', id: payload.requestId }
                  : value.type === 'proposal.create' ? { entity: 'Engagement', id: payload.engagementId }
                : value.type === 'proposal.revise' ? { entity: 'Proposal', id: payload.proposalId }
              : value.type === 'proposal.generate' || value.type === 'proposal.generate.retry' || value.type === 'proposal.approve' || value.type === 'proposal.dispatch' ? { entity: 'ProposalVersion', id: payload.proposalVersionId }
                : value.type === 'proposal.dispatch.retry' ? { entity: 'Dispatch', id: payload.dispatchId }
                  : value.type === 'analytical-review.submit' ? { entity: 'AnalyticalReview', id: payload.analyticalReviewId }
                    : value.type === 'workprogram.template.approve' ? { entity: 'WorkprogramTemplate', id: payload.templateId }
                      : value.type === 'procedure.update' || value.type === 'procedure.mark-not-applicable' || value.type === 'procedure.submit' || value.type === 'procedure.review' ? { entity: 'Procedure', id: payload.procedureId }
                        : value.type === 'sampling.policy.approve' ? { entity: 'SamplingPolicy', id: payload.policyId }
                          : value.type === 'sampling.record-test' && Number(commandVersion)>0 ? { entity: 'SampleTest', id: payload.populationRowId }
                            : value.type === 'time.submit' || value.type === 'time.approve' || value.type === 'time.return' || value.type === 'time.correct'
                              ? { entity: 'TimeEntry', id: payload.timeEntryId }
                : null
    : null;
  const expectedVersions = versionTarget && typeof versionTarget.id === 'string'
    ? [{ ...versionTarget, version: commandVersion as number }]
    : [];
  return requestJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/commands`, {
    method: 'POST',
    body: {
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
