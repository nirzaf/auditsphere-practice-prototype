// R2 file storage: two-phase commit with integrity verification.
//
// D1 and R2 have no shared transaction, so the state machine is explicit:
//   INITIALIZED -> UPLOADING -> STAGED -> VERIFIED -> COMMITTED
// Domain records may only reference COMMITTED files. If the D1 commit fails the
// object is left staged and the scheduled cleanup removes it later; if the R2
// upload fails no committed domain record is created.
//
// The bucket is never public. Every read is authorized against the session actor's
// client/engagement scope before an object is fetched.

import type { FileCategory, FileMetadata, FileInitRequest, FileInitResponse, FileCompleteRequest, FileCompleteResponse, FileState } from '../../src/shared/api/files';
import { FILE_MIME_ALLOWLIST, MAX_UPLOAD_LIMIT_BYTES, isAllowedMime } from '../../src/shared/api/files';
import type { SessionActor } from '../../src/shared/api/sessions';
import type { Env } from './env';
import { ApiError } from './errors';
import { nowSeconds } from './db';
import { sha256Hex } from './http';

export interface FileRow {
  id: string;
  workspace_id: string;
  client_id: string | null;
  engagement_id: string | null;
  category: string;
  logical_record_type: string | null;
  logical_record_id: string | null;
  r2_key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  state: FileState;
  immutable: number;
  created_by_user_id: string | null;
  created_at: number;
  committed_at: number | null;
  deleted_at: number | null;
}

const FILE_COLUMNS = `id,workspace_id,client_id,engagement_id,category,logical_record_type,logical_record_id,
  r2_key,original_name,mime_type,size_bytes,sha256,state,immutable,created_by_user_id,created_at,committed_at,deleted_at`;

const FILE_FOLDERS: Record<FileCategory, string> = {
  PBC: 'pbc',
  TB_SOURCE: 'sources/tb',
  GL_SOURCE: 'sources/gl',
  EVIDENCE: 'evidence',
  WORKPAPER: 'workpapers',
  GENERATED: 'generated',
  RELEASE: 'releases',
  ARCHIVE: 'archive',
  REPRESENTATION: 'generated/representation'
};

/**
 * Key layout namespaces bytes per workspace/client/engagement and per logical
 * record, with an opaque UUID file id as the object name so the original display
 * filename never becomes an object path.
 */
export function buildR2Key(input: {
  workspaceId: string;
  category: FileCategory;
  clientId?: string;
  engagementId?: string;
  logicalRecordId?: string;
  fileId: string;
}): string {
  const parts = [
    'workspaces', input.workspaceId,
    'clients', input.clientId ?? '_',
    'engagements', input.engagementId ?? '_',
    FILE_FOLDERS[input.category] ?? 'other'
  ];
  if (input.logicalRecordId) parts.push(input.logicalRecordId);
  parts.push(input.fileId);
  return parts.join('/');
}

const safeFilename = (name: string): string => name.replace(/[^\w.\- ()]/g, '_').slice(0, 200) || 'file';

export const toFileMetadata = (row: FileRow): FileMetadata => ({
  id: row.id,
  workspaceId: row.workspace_id,
  clientId: row.client_id ?? undefined,
  engagementId: row.engagement_id ?? undefined,
  category: row.category as FileCategory,
  logicalRecordType: row.logical_record_type ?? undefined,
  logicalRecordId: row.logical_record_id ?? undefined,
  originalName: row.original_name,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  sha256: row.sha256 ?? undefined,
  state: row.state,
  immutable: Boolean(row.immutable),
  createdByUserId: row.created_by_user_id ?? undefined,
  createdAt: row.created_at,
  committedAt: row.committed_at ?? undefined
});

export async function getFileRow(env: Env, workspaceId: string, fileId: string): Promise<FileRow | null> {
  return await env.DB.prepare(
    `SELECT ${FILE_COLUMNS} FROM file_objects WHERE workspace_id=? AND id=? AND deleted_at IS NULL`
  ).bind(workspaceId, fileId).first<FileRow>();
}

export async function listFileRows(
  env: Env,
  workspaceId: string,
  filters: { clientId?: string; engagementId?: string; state?: FileState } = {}
): Promise<FileRow[]> {
  const clauses = ['workspace_id=?', 'deleted_at IS NULL'];
  const values: unknown[] = [workspaceId];
  if (filters.clientId) { clauses.push('client_id=?'); values.push(filters.clientId); }
  if (filters.engagementId) { clauses.push('engagement_id=?'); values.push(filters.engagementId); }
  if (filters.state) { clauses.push('state=?'); values.push(filters.state); }
  const result = await env.DB.prepare(
    `SELECT ${FILE_COLUMNS} FROM file_objects WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 500`
  ).bind(...values).all<FileRow>();
  return result.results ?? [];
}

/** Phase 1 — authorize and reserve a file id. No bytes are accepted yet. */
export async function initializeFile(
  env: Env,
  workspaceId: string,
  actor: SessionActor,
  request: FileInitRequest,
  origin: string
): Promise<FileInitResponse> {
  if (!FILE_FOLDERS[request.category]) throw new ApiError('BAD_REQUEST', 'Choose a supported file category.');
  if (!isAllowedMime(request.category, request.mimeType)) {
    throw new ApiError(
      'UNSUPPORTED_MEDIA_TYPE',
      `${request.mimeType} is not accepted for ${request.category}. Allowed: ${FILE_MIME_ALLOWLIST[request.category].join(', ')}.`
    );
  }
  if (!Number.isFinite(request.sizeBytes) || request.sizeBytes <= 0) throw new ApiError('BAD_REQUEST', 'Declare a positive file size.');
  if (request.sizeBytes > MAX_UPLOAD_LIMIT_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'This file exceeds the accepted size limit.');
  if (request.clientId && actor.clientIds !== 'ALL' && !actor.clientIds.includes(request.clientId)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'That client is outside your scope.');
  }
  if (request.engagementId && actor.engagementIds !== 'ALL' && !actor.engagementIds.includes(request.engagementId)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'That engagement is outside your scope.');
  }
  const fileId = crypto.randomUUID();
  const r2Key = buildR2Key({
    workspaceId,
    category: request.category,
    clientId: request.clientId,
    engagementId: request.engagementId,
    logicalRecordId: request.logicalRecordId,
    fileId
  });
  await env.DB.prepare(
    `INSERT INTO file_objects(id,workspace_id,client_id,engagement_id,category,logical_record_type,logical_record_id,
       r2_key,original_name,mime_type,size_bytes,sha256,state,immutable,created_by_user_id,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'INITIALIZED',0,?,?)`
  ).bind(
    fileId, workspaceId, request.clientId ?? null, request.engagementId ?? null, request.category,
    request.logicalRecordType ?? null, request.logicalRecordId ?? null,
    r2Key, safeFilename(request.originalName), request.mimeType, request.sizeBytes,
    request.sha256 ? request.sha256.toLowerCase() : null,
    actor.userId || null, nowSeconds()
  ).run();
  const row = await getFileRow(env, workspaceId, fileId);
  if (!row) throw new ApiError('UNAVAILABLE', 'The file reservation could not be read back.');
  return { file: toFileMetadata(row), uploadUrl: `${origin}/api/workspaces/${workspaceId}/files/${fileId}/content` };
}

/** Phase 2 — stream bytes straight to the R2 binding. Never proxied via base64. */
export async function writeFileContent(
  env: Env,
  workspaceId: string,
  fileId: string,
  actor: SessionActor,
  request: Request
): Promise<FileMetadata> {
  const row = await getFileRow(env, workspaceId, fileId);
  if (!row) throw new ApiError('NOT_FOUND', 'File reservation not found.');
  assertFileScope(row, actor);
  if (row.state !== 'INITIALIZED' && row.state !== 'UPLOADING') {
    throw new ApiError('INVALID_STATE', `Bytes cannot be written while the file is ${row.state}.`);
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_LIMIT_BYTES) {
    throw new ApiError('PAYLOAD_TOO_LARGE', 'This file exceeds the accepted size limit.');
  }
  if (!request.body) throw new ApiError('BAD_REQUEST', 'A request body with file bytes is required.');
  const object = await env.FILES.put(row.r2_key, request.body, {
    httpMetadata: { contentType: row.mime_type }
  });
  await env.DB.prepare('UPDATE file_objects SET state=?, size_bytes=? WHERE workspace_id=? AND id=?')
    .bind('STAGED', object.size, workspaceId, fileId).run();
  const updated = await getFileRow(env, workspaceId, fileId);
  if (!updated) throw new ApiError('UNAVAILABLE', 'The staged file could not be read back.');
  return toFileMetadata(updated);
}

/** Authorize a file row against the session actor's server-resolved scope. */
export function assertFileScope(row: FileRow, actor: SessionActor): void {
  if (row.client_id && actor.clientIds !== 'ALL' && !actor.clientIds.includes(row.client_id)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'This file belongs to a client outside your scope.');
  }
  if (row.engagement_id && actor.engagementIds !== 'ALL' && !actor.engagementIds.includes(row.engagement_id)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'This file belongs to an engagement outside your scope.');
  }
}

const sha256Bytes = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Phase 3 — verify the stored object and commit. Verifies existence, exact size
 * and the SHA-256 digest before the metadata row may be referenced by a domain
 * record. A mismatch fails closed and leaves the object staged for cleanup.
 */
export async function completeFile(
  env: Env,
  workspaceId: string,
  fileId: string,
  actor: SessionActor,
  request: FileCompleteRequest
): Promise<FileCompleteResponse> {
  const row = await getFileRow(env, workspaceId, fileId);
  if (!row) throw new ApiError('NOT_FOUND', 'File reservation not found.');
  assertFileScope(row, actor);
  if (row.state === 'COMMITTED') {
    if (!row.sha256) throw new ApiError('INVALID_STATE', 'The committed file has no recorded digest.');
    return { file: toFileMetadata(row), verifiedSha256: row.sha256 };
  }
  if (row.state !== 'STAGED' && row.state !== 'VERIFIED') {
    throw new ApiError('INVALID_STATE', `The file is ${row.state}; upload the bytes before completing.`);
  }
  const object = await env.FILES.get(row.r2_key);
  if (!object) throw new ApiError('INTEGRITY_MISMATCH', 'The uploaded object was not found in storage.');
  const bytes = await object.arrayBuffer();
  const verified = await sha256Bytes(bytes);
  if (!Number.isFinite(request.sizeBytes) || bytes.byteLength !== request.sizeBytes) {
    throw new ApiError('INTEGRITY_MISMATCH', `Stored size ${bytes.byteLength} does not match the declared ${request.sizeBytes}.`);
  }
  if (row.size_bytes !== bytes.byteLength) {
    throw new ApiError('INTEGRITY_MISMATCH', `Reserved size ${row.size_bytes} does not match the stored size ${bytes.byteLength}.`);
  }
  const expected = (request.sha256 ?? row.sha256)?.toLowerCase();
  if (expected && expected !== verified) {
    throw new ApiError('INTEGRITY_MISMATCH', 'The stored object failed its SHA-256 integrity check.');
  }
  await env.DB.prepare(
    `UPDATE file_objects SET state='COMMITTED', sha256=?, size_bytes=?, committed_at=? WHERE workspace_id=? AND id=?`
  ).bind(verified, bytes.byteLength, nowSeconds(), workspaceId, fileId).run();
  const updated = await getFileRow(env, workspaceId, fileId);
  if (!updated) throw new ApiError('UNAVAILABLE', 'The committed file could not be read back.');
  return { file: toFileMetadata(updated), verifiedSha256: verified };
}

/** Safe download headers: never inline-sniff, never edge-cache an authenticated body. */
const downloadHeaders = (row: FileRow): Record<string, string> => ({
  'Content-Type': row.mime_type,
  'Content-Disposition': `attachment; filename="${safeFilename(row.original_name)}"; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
});

/**
 * Authorized download. Scope is checked before the object is fetched, the size is
 * always reconciled with metadata, and immutable (archived) objects are verified
 * against their recorded digest before any byte is returned.
 */
export async function buildDownloadResponse(
  env: Env,
  workspaceId: string,
  fileId: string,
  actor: SessionActor
): Promise<Response> {
  const row = await getFileRow(env, workspaceId, fileId);
  if (!row) throw new ApiError('NOT_FOUND', 'File not found.');
  assertFileScope(row, actor);
  if (row.state !== 'COMMITTED') {
    throw new ApiError('INVALID_STATE', `The file is ${row.state} and cannot be downloaded yet.`);
  }
  const object = await env.FILES.get(row.r2_key);
  if (!object) {
    throw new ApiError('NOT_FOUND', 'The stored object is missing. This is reported as an explicit exception.');
  }
  if (object.size !== row.size_bytes) {
    throw new ApiError('INTEGRITY_MISMATCH', 'The stored object size differs from the recorded size.');
  }
  if (row.sha256 && row.immutable) {
    const bytes = await object.arrayBuffer();
    if (await sha256Bytes(bytes) !== row.sha256) {
      throw new ApiError('INTEGRITY_MISMATCH', 'The archived object failed its recorded digest verification.');
    }
    return new Response(bytes, { headers: downloadHeaders(row) });
  }
  return new Response(object.body, { headers: downloadHeaders(row) });
}

/** Delete a non-immutable file. Archived (immutable) objects refuse deletion. */
export async function deleteFile(env: Env, workspaceId: string, fileId: string, actor: SessionActor): Promise<void> {
  const row = await getFileRow(env, workspaceId, fileId);
  if (!row) throw new ApiError('NOT_FOUND', 'File not found.');
  assertFileScope(row, actor);
  if (row.immutable) {
    throw new ApiError('IMMUTABLE_RECORD', 'Archived files are application read-only and cannot be deleted through the normal API.');
  }
  await env.FILES.delete(row.r2_key);
  await env.DB.prepare('UPDATE file_objects SET deleted_at=? WHERE workspace_id=? AND id=?')
    .bind(nowSeconds(), workspaceId, fileId).run();
}

/** Mark committed files immutable when an engagement archive is frozen. */
export async function freezeWorkspaceFiles(env: Env, workspaceId: string, engagementId: string): Promise<void> {
  await env.DB.prepare(
    'UPDATE file_objects SET immutable=1 WHERE workspace_id=? AND engagement_id=? AND state=?'
  ).bind(workspaceId, engagementId, 'COMMITTED').run();
}

/**
 * Scheduled cleanup: remove staged/orphaned objects never referenced by a commit.
 * R2 lifecycle policies can also be used, but staged rows must clear their D1
 * metadata here regardless.
 */
export async function cleanupStagedFiles(env: Env, olderThanSeconds = 24 * 60 * 60): Promise<number> {
  const threshold = nowSeconds() - olderThanSeconds;
  const result = await env.DB.prepare(
    `SELECT id,r2_key FROM file_objects WHERE state IN ('INITIALIZED','UPLOADING','STAGED') AND created_at<? LIMIT 200`
  ).bind(threshold).all<{ id: string; r2_key: string }>();
  const rows = result.results ?? [];
  for (const row of rows) {
    await env.FILES.delete(row.r2_key).catch(() => undefined);
    await env.DB.prepare('UPDATE file_objects SET deleted_at=? WHERE id=?').bind(nowSeconds(), row.id).run();
  }
  return rows.length;
}
