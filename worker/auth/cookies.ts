export const SESSION_COOKIE_NAME = '__Host-as_session';

export function sessionCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE_NAME}=${token}; Max-Age=${Math.max(0, Math.floor(maxAge))}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
