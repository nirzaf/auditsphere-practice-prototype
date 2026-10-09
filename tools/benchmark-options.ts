export type BenchmarkOptions =
  | { mode: 'help' }
  | { mode: 'local' }
  | {
      mode: 'staging';
      target: URL;
      workspaceId: string;
      buildId: string;
      users: number;
      durationSeconds: number;
      thinkTimeMs: number;
    };

const valueFlags = new Set([
  '--target', '--workspace-id', '--build-id', '--users', '--duration-seconds', '--think-time-ms'
]);
const hasLabel = (labels: string[], marker: string) => labels.some(label => new RegExp(`(?:^|-)${marker}(?:$|-)`).test(label));

function stagingTarget(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('--target must be an absolute staging URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('--target must use HTTPS and must not contain credentials, a query, or a fragment.');
  }
  const labels = url.hostname.toLowerCase().split('.');
  const isProduction = hasLabel(labels, 'prod') || hasLabel(labels, 'production');
  const isIsolatedTarget = ['staging', 'stage', 'uat', 'test'].some(marker => hasLabel(labels, marker));
  if (isProduction || !isIsolatedTarget) {
    throw new Error('--target hostname must identify an isolated staging, stage, UAT, or test environment; production hosts are refused.');
  }
  url.pathname = '/';
  return url;
}

function integerOption(values: Map<string, string>, name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = values.get(name);
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function parseBenchmarkOptions(args: string[]): BenchmarkOptions {
  if (args.includes('--help') || args.includes('-h')) return { mode: 'help' };

  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--confirm-synthetic-staging') {
      flags.add(argument);
      continue;
    }
    if (!valueFlags.has(argument)) throw new Error(`Unknown benchmark option: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
    if (values.has(argument)) throw new Error(`${argument} may be provided only once.`);
    values.set(argument, value);
    index++;
  }

  const targetValue = values.get('--target');
  if (targetValue === undefined) {
    if (values.size || flags.size) throw new Error('Staging options require --target.');
    return { mode: 'local' };
  }
  if (!flags.has('--confirm-synthetic-staging')) {
    throw new Error('Remote load is limited to an isolated synthetic staging environment. Add --confirm-synthetic-staging to acknowledge this boundary.');
  }

  const workspaceId = values.get('--workspace-id')?.trim();
  const buildId = values.get('--build-id')?.trim();
  if (!workspaceId) throw new Error('--workspace-id is required for a staging run.');
  if (!buildId || buildId.length > 120) throw new Error('--build-id is required and must be 120 characters or fewer.');
  return {
    mode: 'staging',
    target: stagingTarget(targetValue),
    workspaceId,
    buildId,
    users: integerOption(values, '--users', 50, 1, 50),
    durationSeconds: integerOption(values, '--duration-seconds', 900, 1, 3600),
    thinkTimeMs: integerOption(values, '--think-time-ms', 5000, 0, 60000)
  };
}

export const benchmarkHelp = `Usage:
  npm run benchmark:local-api
  npm run benchmark:local-api -- --target https://auditsphere-staging.example.com \\
    --workspace-id <synthetic-workspace-id> --build-id <deployed-build-id> \\
    --confirm-synthetic-staging [--users 50] [--duration-seconds 900] [--think-time-ms 5000]

The default run is the existing local SQLiteD1 benchmark. A --target run requires
a hostname labeled staging, stage, uat, or test, a dedicated synthetic workspace,
and at least one PREPARER profile per virtual user. It sends no cookies or
credentials. Production hosts are refused. The full acceptance run uses
--users 50 and --duration-seconds 900.`;
