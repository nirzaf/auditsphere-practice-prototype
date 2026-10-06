// Shared API error contract.
//
// Worker and frontend import the SAME definition so an error surfaced by the
// API is always typed identically on both sides. Machine codes are stable;
// message text may change.

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'WORKSPACE_EXPIRED'
  | 'WORKSPACE_FROZEN'
  | 'NOT_FOUND'
  | 'FORBIDDEN_SCOPE'
  | 'PERSONA_ACTION_DENIED'
  | 'SELF_APPROVAL'
  | 'SELF_REVIEW_BLOCKED'
  | 'DISABLED_IDENTITY'
  | 'STALE_REVISION'
  | 'VERSION_CONFLICT'
  | 'INVALID_STATE'
  | 'INVALID_TRANSITION'
  | 'INVALID_SAMPLE_PARAMETERS'
  | 'INVALID_POPULATION'
  | 'UNBALANCED_ADJUSTMENT'
  | 'UNBALANCED_JOURNAL'
  | 'VALIDATION_FAILED'
  | 'CALCULATION_DOMAIN_EXCEEDED'
  | 'GATE_BLOCKED'
  | 'STALE_APPROVAL'
  | 'STALE_DEPENDENCY'
  | 'STANDARDS_PROFILE_INCOMPATIBLE'
  | 'OUTSIDE_ASSUMPTIONS'
  | 'UNSUPPORTED_COMMAND'
  | 'IDEMPOTENCY_MISMATCH'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTEGRITY_MISMATCH'
  | 'FILE_HASH_MISMATCH'
  | 'IMMUTABLE_RECORD'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  requestId: string;
}

/**
 * Maps the existing browser-side `GuardError` codes onto the stable API codes.
 * The domain guards keep their own vocabulary; the transport layer owns the wire
 * vocabulary. Keeping this mapping in one place means the server can reuse the
 * exact same guard functions the browser uses without leaking guard internals.
 */
export const GUARD_CODE_TO_API_CODE: Record<string, ApiErrorCode> = {
  FORBIDDEN_SCOPE: 'FORBIDDEN_SCOPE',
  SELF_APPROVAL: 'SELF_APPROVAL',
  STALE_REVISION: 'STALE_REVISION',
  DISABLED_IDENTITY: 'DISABLED_IDENTITY',
  INVALID_STATE: 'INVALID_STATE'
};

/** HTTP status for each API error code. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  WORKSPACE_EXPIRED: 410,
  WORKSPACE_FROZEN: 423,
  NOT_FOUND: 404,
  FORBIDDEN_SCOPE: 403,
  PERSONA_ACTION_DENIED: 403,
  SELF_APPROVAL: 403,
  SELF_REVIEW_BLOCKED: 403,
  DISABLED_IDENTITY: 403,
  STALE_REVISION: 409,
  VERSION_CONFLICT: 409,
  INVALID_STATE: 422,
  INVALID_TRANSITION: 409,
  INVALID_SAMPLE_PARAMETERS: 422,
  INVALID_POPULATION: 422,
  UNBALANCED_ADJUSTMENT: 422,
  UNBALANCED_JOURNAL: 422,
  VALIDATION_FAILED: 422,
  CALCULATION_DOMAIN_EXCEEDED: 422,
  GATE_BLOCKED: 409,
  STALE_APPROVAL: 409,
  STALE_DEPENDENCY: 409,
  STANDARDS_PROFILE_INCOMPATIBLE: 422,
  OUTSIDE_ASSUMPTIONS: 422,
  UNSUPPORTED_COMMAND: 400,
  IDEMPOTENCY_MISMATCH: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTEGRITY_MISMATCH: 422,
  FILE_HASH_MISMATCH: 422,
  IMMUTABLE_RECORD: 423,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503
};

export const isApiErrorBody = (value: unknown): value is ApiErrorBody =>
  Boolean(value && typeof value === 'object' && typeof (value as ApiErrorBody).code === 'string' && typeof (value as ApiErrorBody).message === 'string');
