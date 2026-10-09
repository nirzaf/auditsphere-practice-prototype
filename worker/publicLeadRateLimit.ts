import type { Env } from './env';
import { ApiError } from './errors';

async function hashIp(secret: string, ip: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip)));
  return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Enforces five submissions in a rolling hour using one atomic D1 INSERT.
 * Returns the salted IP digest for storage with an accepted submission.
 */
export async function enforcePublicLeadHourlyLimit(
  env: Pick<Env, 'DB' | 'PUBLIC_LEAD_IP_HASH_SECRET'>,
  ip: string,
  now = new Date()
): Promise<string> {
  const secret = env.PUBLIC_LEAD_IP_HASH_SECRET;
  if (!secret || secret.length < 32) throw new ApiError('UNAVAILABLE', 'The public lead IP hashing key must be configured with at least 32 characters.');

  const ipSha256 = await hashIp(secret, ip);
  const createdAt = now.toISOString();
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const retentionCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Keep only one day of salted hashes. If cleanup or insertion fails, let the
  // request fail closed through the API's standard UNAVAILABLE mapping.
  await env.DB.prepare('DELETE FROM public_lead_rate_limit_events WHERE created_at<=?').bind(retentionCutoff).run();
  const inserted = await env.DB.prepare(`INSERT INTO public_lead_rate_limit_events(id,ip_sha256,created_at)
    SELECT ?,?,? WHERE (SELECT COUNT(*) FROM public_lead_rate_limit_events WHERE ip_sha256=? AND created_at>?)<5
    RETURNING id`)
    .bind(crypto.randomUUID(), ipSha256, createdAt, ipSha256, cutoff)
    .first<{ id: string }>();
  if (!inserted) throw new ApiError('RATE_LIMITED', 'Too many public lead submissions. Try again later.');
  return ipSha256;
}
