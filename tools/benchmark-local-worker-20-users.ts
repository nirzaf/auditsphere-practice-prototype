import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';
import { SqliteD1 } from '../tests/helpers/sqliteD1.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const userCount = 20;
const measuredWaves = 10;
const initialClientCount = 100;
const scopedReadTargetMs = 500;
const commandTargetMs = 1000;
const origin = 'https://benchmark.auditsphere.invalid';
const originalConsoleLog = console.log;
const requestStatusCounts: Record<string, number> = {};

// The Worker emits one structured request metric per call. Keep the benchmark
// output machine-readable while retaining aggregate status evidence.
console.log = (message?: any, ...args: any[]) => {
  if (typeof message === 'string') {
    try {
      const entry = JSON.parse(message) as { event?: string; status?: number };
      if (entry.event === 'workspace.api.request' && typeof entry.status === 'number') {
        const key = String(entry.status);
        requestStatusCounts[key] = (requestStatusCounts[key] ?? 0) + 1;
        return;
      }
    } catch {
      // Preserve non-JSON messages below.
    }
  }
  originalConsoleLog(message, ...args);
};

type Actor = { actorId: string; persona: 'PREPARER' };
type TimedResponse = { status: number; body: any; elapsedMs: number };

const db = new SqliteD1();
const objects = new Map<string, Uint8Array>();
const env = {
  DB: db,
  FILES: {
    async put(key: string, body: BodyInit) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, bytes);
      return { key, size: bytes.length, etag: 'benchmark', httpEtag: 'benchmark', uploaded: new Date() };
    },
    async get(key: string) {
      const bytes = objects.get(key);
      if (!bytes) return null;
      const copy = bytes.slice();
      return {
        key, size: copy.length, etag: 'benchmark', httpEtag: 'benchmark', uploaded: new Date(),
        body: new Response(copy).body,
        arrayBuffer: async () => copy.slice().buffer,
        text: async () => new TextDecoder().decode(copy),
        json: async () => JSON.parse(new TextDecoder().decode(copy)),
        httpMetadata: {}, customMetadata: {}
      };
    },
    async head(key: string) {
      const bytes = objects.get(key);
      return bytes
        ? { key, size: bytes.length, etag: 'benchmark', httpEtag: 'benchmark', uploaded: new Date(), httpMetadata: {}, customMetadata: {} }
        : null;
    }
  } as any,
  ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } as any,
  BUSINESS_SETUP_ENABLED: 'true'
} as any;

async function request(path: string, options: {
  method?: string;
  payload?: unknown;
  actor?: { actorId: string; persona: string };
  idempotencyKey?: string;
} = {}): Promise<TimedResponse> {
  const headers = new Headers({ Origin: origin });
  if (options.actor) {
    headers.set('X-Actor-Id', options.actor.actorId);
    headers.set('X-Active-Persona', options.actor.persona);
  }
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (options.payload !== undefined) headers.set('Content-Type', 'application/json');
  const started = performance.now();
  const response = await worker.fetch(new Request(`${origin}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.payload === undefined ? {} : { body: JSON.stringify(options.payload) })
  }), env, {} as any);
  const body = await response.json();
  return { status: response.status, body, elapsedMs: performance.now() - started };
}

function assertStatus(label: string, result: TimedResponse, expected: number): void {
  if (result.status !== expected) {
    const code = typeof result.body?.code === 'string' ? ` ${result.body.code}` : '';
    throw new Error(`${label} returned HTTP ${result.status}${code}; expected ${expected}.`);
  }
}

async function command(actor: { actorId: string; persona: string }, workspaceId: string, type: string, payload: unknown) {
  return request(`/api/workspaces/${workspaceId}/commands`, {
    method: 'POST', actor, idempotencyKey: crypto.randomUUID(), payload: {
      actor: { actorId: actor.actorId, persona: actor.persona },
      context: {},
      expectedVersions: [],
      command: { type, payload }
    }
  });
}

function clientPayload(code: string) {
  return {
    code,
    legalName: `${code} Benchmark Trading WLL`,
    entityType: 'STANDALONE',
    industry: 'Trading',
    address: 'Doha, Qatar',
    countryCode: 'QA',
    primaryContact: {
      fullName: `${code} Finance Contact`,
      email: `${code.toLowerCase()}@example.invalid`,
      title: 'Finance Manager',
      role: 'CFO_FINANCE_DIRECTOR',
      effectiveFrom: '2026-01-01'
    }
  };
}

function percentile(samples: number[], quantile: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

function summarize(samples: number[], targetMs: number) {
  return {
    samples: samples.length,
    p50Ms: Number(percentile(samples, 0.50).toFixed(3)),
    p95Ms: Number(percentile(samples, 0.95).toFixed(3)),
    p99Ms: Number(percentile(samples, 0.99).toFixed(3)),
    maxMs: Number(Math.max(...samples).toFixed(3)),
    targetMs,
    meetsLocalTarget: percentile(samples, 0.95) < targetMs
  };
}

async function main(): Promise<void> {
  db.migrate(repositoryRoot);
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const changedPaths = execFileSync('git', ['status', '--porcelain'], { cwd: repositoryRoot, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean).map(line => line.slice(3));
  const bootstrap = await request('/api/workspaces', {
    method: 'POST',
    idempotencyKey: crypto.randomUUID(),
    payload: {
      name: 'Isolated 20-user API benchmark',
      currency: 'QAR',
      timezone: 'Asia/Qatar',
      initialPartner: {
        displayName: 'Benchmark Partner',
        naturalPersonKey: `BENCHMARK-${crypto.randomUUID()}`,
        email: 'benchmark.partner@example.invalid'
      }
    }
  });
  assertStatus('BUSINESS workspace bootstrap', bootstrap, 201);
  const workspaceId = bootstrap.body.workspaceId as string;
  const approver = { actorId: bootstrap.body.actorProfileId as string, persona: 'APPROVER' };
  const users: Actor[] = [];

  for (let index = 0; index < userCount; index++) {
    const identity = `${String(index + 1).padStart(2, '0')}-${crypto.randomUUID()}`;
    const staff = await command(approver, workspaceId, 'staff.create', {
      displayName: `Synthetic Preparer ${index + 1}`,
      naturalPersonKey: `BENCHMARK-${identity}`,
      email: `preparer-${identity}@example.invalid`,
      grade: 'ASSOCIATE'
    });
    assertStatus(`Create synthetic staff member ${index + 1}`, staff, 200);
    const assigned = await command(approver, workspaceId, 'actor-profile.assign', {
      persona: 'PREPARER', staffMemberId: staff.body.result.staffMemberId
    });
    assertStatus(`Assign synthetic preparer ${index + 1}`, assigned, 200);
    users.push({ actorId: assigned.body.result.actorProfileId as string, persona: 'PREPARER' });
  }

  for (let index = 0; index < initialClientCount; index++) {
    const result = await command(users[index % users.length], workspaceId, 'client.create',
      clientPayload(`SEED${String(index + 1).padStart(4, '0')}`));
    assertStatus(`Seed client ${index + 1}`, result, 200);
  }

  // Exclude one warm-up of each route from the reported samples.
  const warmupContext = await request(`/api/workspaces/${workspaceId}/context`, { actor: users[0] });
  assertStatus('Warm-up context read', warmupContext, 200);
  const warmupList = await request(`/api/workspaces/${workspaceId}/clients?limit=25`, { actor: users[0] });
  assertStatus('Warm-up client list read', warmupList, 200);
  const warmupCommand = await command(users[0], workspaceId, 'client.create', clientPayload('WARMUP0001'));
  assertStatus('Warm-up client create', warmupCommand, 200);

  const contextReads: number[] = [];
  const clientListReads: number[] = [];
  const clientCommands: number[] = [];

  for (let wave = 0; wave < measuredWaves; wave++) {
    const contexts = await Promise.all(users.map(actor => request(
      `/api/workspaces/${workspaceId}/context`, { actor }
    )));
    for (const [index, result] of contexts.entries()) {
      assertStatus(`Context read for synthetic user ${index + 1}`, result, 200);
      contextReads.push(result.elapsedMs);
    }

    const lists = await Promise.all(users.map(actor => request(
      `/api/workspaces/${workspaceId}/clients?limit=25`, { actor }
    )));
    for (const [index, result] of lists.entries()) {
      assertStatus(`Client list read for synthetic user ${index + 1}`, result, 200);
      clientListReads.push(result.elapsedMs);
    }

    const commands = await Promise.all(users.map((actor, index) => command(
      actor, workspaceId, 'client.create',
      clientPayload(`LOAD${String(wave + 1).padStart(2, '0')}${String(index + 1).padStart(2, '0')}`)
    )));
    for (const [index, result] of commands.entries()) {
      assertStatus(`Client command for synthetic user ${index + 1}`, result, 200);
      clientCommands.push(result.elapsedMs);
    }
  }

  const scopedReads = [...contextReads, ...clientListReads];
  const scopedReadSummary = summarize(scopedReads, scopedReadTargetMs);
  const contextSummary = summarize(contextReads, scopedReadTargetMs);
  const clientListSummary = summarize(clientListReads, scopedReadTargetMs);
  const commandSummary = summarize(clientCommands, commandTargetMs);
  const report = {
    result: scopedReadSummary.meetsLocalTarget && commandSummary.meetsLocalTarget ? 'PASS_LOCAL_TARGETS' : 'FAIL_LOCAL_TARGETS',
    acceptanceBoundary: 'Local in-process Worker + SQLiteD1 only; this does not establish Cloudflare D1/Workers p95 acceptance.',
    recordedAt: new Date().toISOString(),
    commit,
    worktreeClean: changedPaths.length === 0,
    changedPaths,
    environment: {
      runtime: `Node.js ${process.version}`,
      platform: `${process.platform}-${process.arch}`,
      logicalCpuCount: cpus().length,
      workerInvocation: 'in-process Worker.fetch',
      database: 'isolated in-memory SQLite D1 adapter',
      objectStorage: 'in-memory R2 stub',
      externalNetworkRequests: 0
    },
    workload: {
      syntheticActors: userCount,
      concurrentRequestsPerWave: userCount,
      measuredWaves,
      initialPersistedClients: initialClientCount,
      measuredRequestCount: contextReads.length + clientListReads.length + clientCommands.length,
      workerRequestStatusCounts: requestStatusCounts,
      routeMix: {
        contextReads: contextReads.length,
        paginatedClientListReads: clientListReads.length,
        clientCreateCommands: clientCommands.length
      },
      providerJobs: 'excluded'
    },
    thresholds: { scopedReadP95Ms: scopedReadTargetMs, commandP95Ms: commandTargetMs },
    latency: {
      scopedReads: scopedReadSummary,
      contextRead: contextSummary,
      paginatedClientListRead: clientListSummary,
      clientCreateCommand: commandSummary
    },
    limitations: [
      'The in-memory SQLite adapter serializes database calls and has different latency and concurrency characteristics from Cloudflare D1.',
      'No browser, network, Cloudflare runtime, deployed Worker, production data, or provider job was exercised.',
      'Passing this local benchmark is useful for regression detection but does not close the deployed 20-active-user p95 criterion.'
    ]
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.result !== 'PASS_LOCAL_TARGETS') process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`Local API benchmark failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
}).finally(() => {
  console.log = originalConsoleLog;
  db.close();
});
