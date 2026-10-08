import { randomUUID } from 'node:crypto';

type Options = { environment?: string; name?: string; email?: string; naturalPersonKey?: string; idempotencyKey?: string };

function usage(): string {
  return 'Usage: npx tsx tools/bootstrap-first-partner.ts --env staging --name "Firm name" --email partner@example.com --natural-person-key <key> [--idempotency-key <key>]';
}

function parseArgs(argv: string[]): Options {
  const result: Options = {};
  const values: Record<string, keyof Options> = {
    '--env': 'environment', '--name': 'name', '--email': 'email',
    '--natural-person-key': 'naturalPersonKey', '--idempotency-key': 'idempotencyKey'
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    const target = values[arg];
    const value = argv[index + 1];
    if (!target || !value || value.startsWith('--')) throw new Error(usage());
    if (result[target] !== undefined) throw new Error(`Duplicate option: ${arg}`);
    result[target] = value;
    index += 1;
  }
  return result;
}

async function main(): Promise<void> {
  let options: Options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { throw new Error(error instanceof Error ? error.message : usage()); }
  if (options.environment !== 'staging' || !options.name?.trim() || !options.email?.trim() || !options.naturalPersonKey?.trim()) {
    throw new Error(`Staging environment and all Partner fields are required.\n${usage()}`);
  }
  const token = process.env.AUDITSPHERE_BOOTSTRAP_TOKEN;
  const configuredUrl = process.env.AUDITSPHERE_STAGING_URL;
  if (!token || token.length < 32 || !configuredUrl) throw new Error('Set AUDITSPHERE_STAGING_URL and AUDITSPHERE_BOOTSTRAP_TOKEN in the local environment.');

  let base: URL;
  try {
    base = new URL(configuredUrl);
    if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('invalid origin');
  } catch { throw new Error('AUDITSPHERE_STAGING_URL must be an HTTPS origin without a path, query, or credentials.'); }

  const idempotencyKey = options.idempotencyKey?.trim() || randomUUID();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) throw new Error('--idempotency-key must be 8–200 characters.');
  process.stdout.write(`Bootstrap request key: ${idempotencyKey}\n`);

  const response = await fetch(new URL('/api/internal/bootstrap', base), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
      name: options.name.trim(),
      currency: 'QAR',
      timezone: 'Asia/Qatar',
      initialPartner: {
        displayName: options.name.trim(),
        naturalPersonKey: options.naturalPersonKey.trim(),
        email: options.email.trim()
      }
    }),
    signal: AbortSignal.timeout(30_000)
  });
  let result: Record<string, unknown> | null = null;
  try { result = await response.json() as Record<string, unknown>; } catch { /* Never print an untrusted response body. */ }
  if (!response.ok || !result || typeof result.workspaceId !== 'string' || typeof result.staffMemberId !== 'string'
    || typeof result.actorProfileId !== 'string' || typeof result.userAccountId !== 'string') {
    const code = typeof result?.code === 'string' && /^[A-Z_]{1,64}$/.test(result.code) ? result.code : `HTTP_${response.status}`;
    throw new Error(`First-Partner bootstrap failed (${code}). Use the same --idempotency-key to safely retry an uncertain request.`);
  }
  process.stdout.write(`First-Partner workspace created${result.replayed === true ? ' (idempotent replay)' : ''}.\n`);
  process.stdout.write(`Workspace: ${result.workspaceId}\nStaff member: ${result.staffMemberId}\nAPPROVER profile: ${result.actorProfileId}\nStaff account: ${result.userAccountId}\nInvitation: queued for ${options.email.trim().toLowerCase()}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'First-Partner bootstrap failed.'}\n`);
  process.exitCode = 1;
});
