// Shared file / object contracts.
//
// Binary bytes never travel through this contract as base64 in the normal path;
// the API returns upload instructions and the browser PUTs bytes directly to the
// Worker's content endpoint (which streams to the R2 binding).

export type FileCategory =
  | 'PBC'
  | 'TB_SOURCE'
  | 'GL_SOURCE'
  | 'EVIDENCE'
  | 'WORKPAPER'
  | 'GENERATED'
  | 'RELEASE'
  | 'ARCHIVE'
  | 'REPRESENTATION';

/** Two-phase commit states. Domain records may only reference `COMMITTED` files. */
export type FileState = 'INITIALIZED' | 'UPLOADING' | 'STAGED' | 'VERIFIED' | 'COMMITTED';

export interface FileMetadata {
  id: string;
  workspaceId: string;
  clientId?: string;
  engagementId?: string;
  category: FileCategory;
  logicalRecordType?: string;
  logicalRecordId?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
  state: FileState;
  immutable: boolean;
  createdByUserId?: string;
  createdAt: number;
  committedAt?: number;
}

export interface FileInitRequest {
  category: FileCategory;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  /** Optional client-declared digest; verified against the R2 object on complete. */
  sha256?: string;
  clientId?: string;
  engagementId?: string;
  logicalRecordType?: string;
  logicalRecordId?: string;
}

export interface FileInitResponse {
  file: FileMetadata;
  /** Same-origin endpoint the browser streams bytes to. */
  uploadUrl: string;
}

export interface FileCompleteRequest {
  sizeBytes: number;
  sha256?: string;
}

export interface FileCompleteResponse {
  file: FileMetadata;
  /** Digest the server computed from the stored object. */
  verifiedSha256: string;
}

/** Allowlist per workflow. Extensions alone are never trusted. */
export const FILE_MIME_ALLOWLIST: Record<FileCategory, readonly string[]> = {
  PBC: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/png',
    'image/jpeg'
  ],
  TB_SOURCE: [
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ],
  GL_SOURCE: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  EVIDENCE: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ],
  WORKPAPER: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  GENERATED: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/json'
  ],
  RELEASE: ['application/pdf', 'application/zip', 'application/json'],
  ARCHIVE: ['application/pdf', 'application/zip', 'application/json'],
  REPRESENTATION: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
};

/** Bounded small-upload path. Larger payloads must use the multipart path. */
export const SMALL_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_LIMIT_BYTES = 200 * 1024 * 1024;

export const isAllowedMime = (category: FileCategory, mimeType: string): boolean =>
  (FILE_MIME_ALLOWLIST[category] ?? []).includes(mimeType);
