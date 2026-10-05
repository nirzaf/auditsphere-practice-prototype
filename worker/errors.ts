// Worker error mapping.
//
// Domain guards throw `GuardError`; this module is the ONLY place that turns a
// thrown value into an HTTP response, so no raw D1/R2/Worker exception can ever
// reach the browser (task requirement: map errors to stable UI patterns).

import { API_ERROR_STATUS, GUARD_CODE_TO_API_CODE, type ApiErrorBody, type ApiErrorCode } from '../src/shared/api/errors';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: unknown;
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
  get status(): number {
    return API_ERROR_STATUS[this.code];
  }
}

/** Thrown values that carry a `code` (GuardError and ApiError). */
interface CodedError {
  code?: string;
  message?: string;
}

export function toApiError(error: unknown, requestId: string): { body: ApiErrorBody; status: number } {
  if (error instanceof ApiError) {
    return { body: { code: error.code, message: error.message, details: error.details, requestId }, status: error.status };
  }
  const coded = error as CodedError;
  if (coded && typeof coded.code === 'string') {
    const mapped = GUARD_CODE_TO_API_CODE[coded.code];
    if (mapped) {
      return { body: { code: mapped, message: coded.message || 'The request was rejected.', requestId }, status: API_ERROR_STATUS[mapped] };
    }
  }
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(JSON.stringify({ event: 'workspace.api.unhandled', requestId, message }));
  return {
    body: { code: 'UNAVAILABLE', message: 'The cloud service is temporarily unavailable.', requestId },
    status: API_ERROR_STATUS.UNAVAILABLE
  };
}
