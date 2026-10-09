const ROLE_BLOCKED_LOCAL_PARTS = new Set([
  'abuse', 'mailer-daemon', 'no-reply', 'noreply', 'postmaster', 'security'
]);

export async function emailRecipientSha256(address: string): Promise<string> {
  const normalized = address.trim().toLocaleLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function isRouteIdentifier(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isRoleBlockedRecipient(address: string): boolean {
  const localPart = address.slice(0, address.lastIndexOf('@')).split('+', 1)[0].toLocaleLowerCase();
  return ROLE_BLOCKED_LOCAL_PARTS.has(localPart);
}
