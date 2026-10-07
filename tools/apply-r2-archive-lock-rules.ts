import { mergeArchiveLockRules, r2ArchiveLockRules, type R2ArchiveLockRule } from '../worker/archiveRetention.js';

type ExistingLockRule = { id: string; [key: string]: unknown };
type LockResponse = { success?: boolean; result?: { rules?: ExistingLockRule[] }; errors?: Array<{ message?: string }> };

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const bucketName = process.env.AUDITSPHERE_R2_BUCKET ?? 'auditsphere-prototype-files';
if (!token || !accountId) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required to apply archive lock rules.');

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/lock`;

async function request(method: 'GET' | 'PUT', rules?: Array<ExistingLockRule | R2ArchiveLockRule>): Promise<LockResponse> {
  const response = await fetch(endpoint, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(rules ? { body: JSON.stringify({ rules }) } : {})
  });
  let body: LockResponse;
  try { body = await response.json() as LockResponse; }
  catch { throw new Error(`Cloudflare R2 lock ${method} returned HTTP ${response.status} with invalid JSON.`); }
  if (!response.ok || body.success === false) {
    const details = body.errors?.map(error => error.message).filter(Boolean).join('; ');
    throw new Error(`Cloudflare R2 lock ${method} failed (HTTP ${response.status})${details ? `: ${details}` : '.'}`);
  }
  return body;
}

const currentBody = await request('GET');
const currentRules = currentBody.result?.rules ?? [];
if (!Array.isArray(currentRules) || currentRules.some(rule => !rule || typeof rule.id !== 'string')) {
  throw new Error('Cloudflare returned an invalid bucket lock rule list; no changes were applied.');
}

const managedRules = r2ArchiveLockRules();
const managedIds = new Set(managedRules.map(rule => rule.id));
const preservedRules = currentRules.filter(rule => !managedIds.has(rule.id));
const nextRules = mergeArchiveLockRules(currentRules, managedRules);
if (nextRules.length > 1000) throw new Error('The merged R2 bucket lock configuration exceeds Cloudflare’s 1,000-rule limit.');

await request('PUT', nextRules);
const verifiedBody = await request('GET');
const verifiedRules = verifiedBody.result?.rules ?? [];
const byId = new Map(verifiedRules.map(rule => [rule.id, rule]));
for (const rule of managedRules) {
  const stored = byId.get(rule.id);
  const condition = stored?.condition as Record<string, unknown> | undefined;
  const conditionMatches = rule.condition.type === 'Age'
    ? condition?.type === 'Age' && condition.maxAgeSeconds === rule.condition.maxAgeSeconds
    : condition?.type === 'Indefinite';
  if (!stored || stored.enabled !== true || stored.prefix !== rule.prefix || !conditionMatches) {
    throw new Error(`Cloudflare did not return the expected lock rule ${rule.id}.`);
  }
}
for (const rule of preservedRules) {
  if (!byId.has(rule.id)) throw new Error(`Cloudflare did not preserve existing lock rule ${rule.id}.`);
}

process.stdout.write(`Verified ${managedRules.length} AuditSphere archive retention rules on ${bucketName}; preserved ${preservedRules.length} unrelated rule(s).\n`);
