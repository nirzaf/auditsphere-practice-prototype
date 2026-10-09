import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';
import { SqliteD1 } from '../tests/helpers/sqliteD1.js';
import { benchmarkHelp, parseBenchmarkOptions } from './benchmark-options.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const userCount = 20;
const measuredWaves = 10;
const initialClientCount = 100;
const scopedReadTargetMs = 500;
const commandTargetMs = 1000;
const origin = 'https://benchmark.auditsphere.invalid';
const originalConsoleLog = console.log;
const requestStatusCounts: Record<string, number> = {};
const pause = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

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

type StagingActor = { id: string; persona: 'PREPARER' };
type StagingSample = { status: number; elapsedMs: number };

async function stagingRequest(target: URL, path: string, options: {
  method?: string;
  payload?: unknown;
  actor?: StagingActor;
  idempotencyKey?: string;
} = {}): Promise<StagingSample> {
  const headers = new Headers({ Origin: target.origin });
  if (options.actor) {
    headers.set('X-Actor-Id', options.actor.id);
    headers.set('X-Active-Persona', options.actor.persona);
  }
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (options.payload !== undefined) headers.set('Content-Type', 'application/json');
  const started = performance.now();
  try {
    const response = await fetch(new URL(path.replace(/^\//, ''), target), {
      method: options.method ?? 'GET',
      headers,
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(15000),
      ...(options.payload === undefined ? {} : { body: JSON.stringify(options.payload) })
    });
    await response.body?.cancel();
    return { status: response.status, elapsedMs: performance.now() - started };
  } catch {
    return { status: 0, elapsedMs: performance.now() - started };
  }
}

async function stagingJson<T>(target: URL, path: string): Promise<{ status: number; body: T | null }> {
  const response = await fetch(new URL(path.replace(/^\//, ''), target), {
    headers: { Origin: target.origin },
    redirect: 'error',
    credentials: 'omit',
    signal: AbortSignal.timeout(15000)
  });
  const raw = await response.text();
  let body: T | null = null;
  try { body = JSON.parse(raw) as T; } catch { /* Do not print response bodies that may contain private details. */ }
  return { status: response.status, body };
}

function summarizeStaging(samples: StagingSample[], targetMs: number) {
  const summary = samples.length
    ? summarize(samples.map(sample => sample.elapsedMs), targetMs)
    : { samples: 0, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null, targetMs, meetsLocalTarget: false };
  const failed = samples.filter(sample => sample.status < 200 || sample.status >= 300).length;
  return {
    ...summary,
    failedRequests: failed,
    errorRate: samples.length ? Number((failed / samples.length).toFixed(6)) : 1
  };
}

async function runStagingBenchmark(options: Extract<ReturnType<typeof parseBenchmarkOptions>, { mode: 'staging' }>): Promise<void> {
  const health = await stagingJson<{ status?: string; readinessChecks?: { environment?: string } }>(options.target, '/api/health/ready');
  if (health.status !== 200 || health.body?.status !== 'ready' || health.body.readinessChecks?.environment !== 'staging') {
    throw new Error(`Staging readiness must be healthy and report environment=staging (HTTP ${health.status}). No load was sent.`);
  }

  const actorResponse = await stagingJson<{ items?: Array<{ id: string; persona: string }> }>(
    options.target, `/api/workspaces/${encodeURIComponent(options.workspaceId)}/actor-profiles`
  );
  if (actorResponse.status !== 200 || !Array.isArray(actorResponse.body?.items)) {
    throw new Error(`Could not read synthetic PREPARER profiles from the specified staging workspace (HTTP ${actorResponse.status}). No load was sent.`);
  }
  const actors = actorResponse.body.items
    .filter((item): item is { id: string; persona: 'PREPARER' } => item.persona === 'PREPARER' && typeof item.id === 'string')
    .slice(0, options.users);
  if (actors.length < options.users) {
    throw new Error(`The staging workspace has ${actors.length} usable PREPARER profiles; ${options.users} are required. No load was sent.`);
  }
  const contextProbe = await stagingRequest(options.target,
    `/api/workspaces/${encodeURIComponent(options.workspaceId)}/context`, { actor: actors[0] });
  if (contextProbe.status !== 200) throw new Error(`The staging actor preflight failed (HTTP ${contextProbe.status}). No load was sent.`);

  const contextReads: StagingSample[] = [];
  const clientListReads: StagingSample[] = [];
  const clientCommands: StagingSample[] = [];
  const statusCounts: Record<string, number> = {};
  const startedAt = new Date();
  const startedClock = performance.now();
  const endAt = Date.now() + options.durationSeconds * 1000;
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  let sequence = 0;

  async function runVirtualUser(actor: StagingActor): Promise<void> {
    while (Date.now() < endAt) {
      const requestNumber = sequence++;
      let sample: StagingSample;
      if (requestNumber % 10 < 7) {
        if (requestNumber % 2 === 0) {
          sample = await stagingRequest(options.target,
            `/api/workspaces/${encodeURIComponent(options.workspaceId)}/context`, { actor });
          contextReads.push(sample);
        } else {
          sample = await stagingRequest(options.target,
            `/api/workspaces/${encodeURIComponent(options.workspaceId)}/clients?limit=25`, { actor });
          clientListReads.push(sample);
        }
      } else {
        const code = `LOAD-${runId}-${requestNumber.toString(36)}`;
        sample = await stagingRequest(options.target,
          `/api/workspaces/${encodeURIComponent(options.workspaceId)}/commands`, {
            method: 'POST', actor, idempotencyKey: crypto.randomUUID(), payload: {
              actor: { actorId: actor.id, persona: actor.persona },
              context: {}, expectedVersions: [],
              command: { type: 'client.create', payload: clientPayload(code) }
            }
          });
        clientCommands.push(sample);
      }
      statusCounts[String(sample.status)] = (statusCounts[String(sample.status)] ?? 0) + 1;
      if (options.thinkTimeMs > 0 && Date.now() < endAt) await pause(options.thinkTimeMs);
    }
  }

  await Promise.all(actors.map(actor => runVirtualUser(actor)));
  const elapsedMs = performance.now() - startedClock;
  const readSamples = [...contextReads, ...clientListReads];
  const readSummary = summarizeStaging(readSamples, 400);
  const commandSummary = summarizeStaging(clientCommands, 800);
  const fullLoadProfile = actors.length === 50 && options.durationSeconds >= 900;
  const totalRequests = readSamples.length + clientCommands.length;
  const report = {
    result: fullLoadProfile && readSummary.p95Ms !== null && readSummary.p95Ms < 400 && readSummary.p99Ms !== null && readSummary.p99Ms < 1000 && commandSummary.p95Ms !== null && commandSummary.p95Ms < 800 && readSummary.errorRate < 0.01 && commandSummary.errorRate < 0.01
      ? 'PASS_APPLICATION_LATENCY'
      : 'FAIL_OR_INCOMPLETE_APPLICATION_LATENCY',
    acceptanceBoundary: 'Remote Worker measurements only; Cloudflare D1, Worker CPU and outbox metrics must be completed from the same staging window in the dashboard.',
    recordedAt: new Date().toISOString(),
    target: options.target.origin,
    workspaceId: options.workspaceId,
    deployedBuildId: options.buildId,
    dataClassification: 'synthetic staging only',
    identityProfile: 'no application authentication; self-selected PREPARER workflow context',
    durationSeconds: options.durationSeconds,
    fullAcceptanceLoadProfile: fullLoadProfile,
    actualElapsedSeconds: Number((elapsedMs / 1000).toFixed(3)),
    syntheticActors: actors.length,
    thinkTimeMs: options.thinkTimeMs,
    requestCount: totalRequests,
    averageRequestsPerSecond: Number((totalRequests / (elapsedMs / 1000)).toFixed(3)),
    requestStatusCounts: statusCounts,
    routeMix: {
      requestedReadPercent: 70,
      requestedCommandPercent: 30,
      actual: {
        contextReads: contextReads.length,
        paginatedClientListReads: clientListReads.length,
        clientCreateCommands: clientCommands.length
      }
    },
    thresholds: { readP95Ms: 400, readP99Ms: 1000, commandP95Ms: 800, maxErrorRate: 0.01, minimumDurationSeconds: 900 },
    latency: {
      reads: readSummary,
      contextRead: summarizeStaging(contextReads, 400),
      paginatedClientListRead: summarizeStaging(clientListReads, 400),
      clientCreateCommand: commandSummary
    },
    cloudflareDashboardMetrics: {
      d1RowsReadPerMinute: 'PENDING: capture from staging D1 analytics for the recorded time window',
      d1RowsWrittenPerMinute: 'PENDING: capture from staging D1 analytics for the recorded time window',
      workerCpuTimePercentiles: 'PENDING: capture from the staging Worker dashboard for the recorded time window',
      outboxDrainTime: 'PENDING: capture queue-to-complete duration from sanitized staging outbox metrics',
      cloudflareWindowStartedAt: startedAt.toISOString()
    },
    limitations: [
      'Workflow persona headers are self-selected context, not authenticated sessions or identity assurance.',
      'The load run creates synthetic clients in the supplied dedicated staging workspace; isolate or reset that staging dataset after acceptance.',
      'Application latency and error rate alone do not close capacity acceptance until the pending Cloudflare D1, Worker CPU and outbox metrics are added.'
    ]
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.result !== 'PASS_APPLICATION_LATENCY') process.exitCode = 1;
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
  const options = parseBenchmarkOptions(process.argv.slice(2));
  if (options.mode === 'help') {
    process.stdout.write(`${benchmarkHelp}\n`);
    return;
  }
  if (options.mode === 'staging') {
    await runStagingBenchmark(options);
    return;
  }

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
      'Passing this local benchmark is useful for regression detection but does not close the deployed 50-concurrent-workflow-user p95 criterion.'
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
