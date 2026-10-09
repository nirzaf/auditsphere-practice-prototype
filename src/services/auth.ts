import type { AuthMe } from '../shared/api/auth';

class AuthRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(path, {
      ...init, headers, credentials: 'same-origin', cache: 'no-store'
    });
  } catch {
    throw new Error('AuditSphere authentication is unavailable. Check the connection and retry.');
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null) as { message?: unknown } | null;
  if (!response.ok) throw new AuthRequestError(typeof body?.message === 'string' ? body.message : 'The authentication request failed. Retry.', response.status);
  return body as T;
}

export async function loadAuthMe(): Promise<AuthMe | null> {
  try { return await authRequest<AuthMe>('/api/auth/me'); }
  catch (error) {
    if (error instanceof AuthRequestError && error.status === 401) return null;
    throw error;
  }
}

export async function clientLogin(email: string, password: string): Promise<AuthMe> {
  return authRequest<AuthMe>('/api/auth/client/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function changeClientPassword(currentPassword: string, newPassword: string): Promise<void> {
  await authRequest<void>('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await authRequest<void>('/api/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  await authRequest<void>('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
}

export async function chooseActiveProfile(actorProfileId: string): Promise<AuthMe> {
  return authRequest<AuthMe>('/api/auth/active-profile', { method: 'POST', body: JSON.stringify({ actorProfileId }) });
}

export async function signOut(): Promise<void> {
  await authRequest<void>('/api/auth/logout', { method: 'POST' });
}
