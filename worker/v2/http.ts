// Worker HTTP helpers: bounded JSON parsing, hardening headers, cookie handling.

import { ApiError } from './errors';

export const sessionCookieName = 'as_session';
export const csrfCookieName = 'as_csrf';

export const baseHeaders = (requestId: string): Record<string, string> => ({
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'X-Request-Id': requestId
});

export const jsonResponse = (
  body: unknown,
  status: number,
  requestId: string,
  extra: Record<string, string> = {}
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...baseHeaders(requestId), ...extra }
  });

/**
 * Read a JSON body with an explicit size ceiling enforced while streaming.
 * A Content-Length that already exceeds the ceiling is rejected without reading.
 */
export async function readJson<T>(request: Request, limit: number): Promise<T> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'Send an application/json request.');
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    throw new ApiError('PAYLOAD_TOO_LARGE', `Request body exceeds ${limit} bytes.`);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError('BAD_REQUEST', 'A JSON request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError('PAYLOAD_TOO_LARGE', `Request body exceeds ${limit} bytes.`);
    }
    chunks.push(value);
  }
  if (size === 0) throw new ApiError('BAD_REQUEST', 'A JSON request body is required.');
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(all)) as T;
  } catch {
    throw new ApiError('BAD_REQUEST', 'Send a valid JSON request body.');
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    out[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  path?: string;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite ?? 'Strict'}`);
  return parts.join('; ');
}

/**
 * Same-origin enforcement for state-changing requests.
 * `Origin` must be present and must match the request's own origin. This holds
 * whether the app is served from workers.dev, the custom domain, or localhost.
 */
export const assertSameOrigin = (request: Request, url: URL): void => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('Origin');
  if (!origin) throw new ApiError('BAD_REQUEST', 'A same-origin Origin header is required for this request.');
  if (origin !== url.origin) throw new ApiError('FORBIDDEN_SCOPE', 'Cross-origin requests are not accepted.');
};

export const sha256Hex = async (value: string): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const randomToken = (bytes = 32): string => {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
};
