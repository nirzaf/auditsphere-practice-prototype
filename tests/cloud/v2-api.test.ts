import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

// Integration test for the cloud full-stack v2 API. Runs against a deployed
// Worker (real D1 + real R2), so the important integration path is genuinely
// executed rather than mocked.
//
//   $env:CLOUD_API_URL='https://auditsphere-visual-prototype.<sub>.workers.dev'
//   npm run test:cloud:v2
const api = process.env.CLOUD_API_URL?.replace(/\/$/, '');
const hex = (bytes: Buffer | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

it('cloud v2 API enforces sessions, revisions, idempotency and R2 integrity', { skip: !api, timeout: 120000 }, async () => {
  if (!api) return;
  const origin = api;
  let cookie = '';
  const raw = async (path: string, init: RequestInit = {}, useCookie = true) => {
    const binary = init.body instanceof Uint8Array || init.body instanceof Blob;
    const response = await fetch(api + path, {
      ...init,
      headers: {
        ...(binary ? {} : { 'Content-Type': 'application/json' }),
        Origin: origin,
        ...(useCookie && cookie ? { Cookie: cookie } : {}),
        ...((init.headers as Record<string, string> | undefined) ?? {})
      },
      signal: AbortSignal.timeout(25000)
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return response;
  };
  const json = async (path: string, init?: RequestInit) => {
    const response = await raw(path, init);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body: body as any, headers: response.headers };
  };
  const post = (path: string, payload: unknown) => json(path, { method: 'POST', body: JSON.stringify(payload) });

  // --- health & seeds -------------------------------------------------------
  const health = await json('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.storage, 'D1+R2');

  const seeds = await json('/api/seeds');
  assert.equal(seeds.status, 200);
  assert.ok(seeds.body.seeds.length >= 1);
  assert.ok(seeds.body.seeds.every((seed: any) => !seed.state_json && !seed.state), 'seed catalog must not leak state');

  // --- no session => no workspace state ------------------------------------
  const noSession = await json('/api/workspaces/00000000-0000-0000-0000-000000000000/state');
  assert.ok([401, 404].includes(noSession.status), `expected 401/404 without a session, got ${noSession.status}`);

  // --- cross-origin mutation refused ---------------------------------------
  const crossOrigin = await fetch(api + '/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.invalid' },
    body: JSON.stringify({ seedId: seeds.body.seeds[0].id })
  });
  assert.equal(crossOrigin.status, 403);

  // --- create a workspace (real D1 + R2) -----------------------------------
  const seedId = seeds.body.seeds.find((seed: any) => seed.id === 'commercial')?.id ?? seeds.body.seeds[0].id;
  const created = await post('/api/workspaces', { seedId, name: 'Integration workspace' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const workspaceId = created.body.workspaceId as string;
  const accessCode = created.body.accessCode as string;
  assert.match(workspaceId, /^[a-f0-9-]{36}$/);
  assert.match(accessCode, /^[a-f0-9-]{36}\.[a-f0-9]{64}$/);
  assert.ok(cookie.startsWith('as_session='), 'a session cookie must be issued');

  // --- authoritative state --------------------------------------------------
  const state = await json(`/api/workspaces/${workspaceId}/state`);
  assert.equal(state.status, 200);
  const revision = state.body.revision as number;
  assert.ok(revision >= 1);
  assert.ok(Array.isArray(state.body.state.clients));

  // --- positive command -----------------------------------------------------
  const renamed = await post(`/api/workspaces/${workspaceId}/commands`, {
    command: { type: 'workspace.rename', payload: { name: 'Renamed by integration test' } },
    expectedRevision: revision
  });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
  assert.equal(renamed.body.revision, revision + 1);

  // --- stale revision fails closed (409) -----------------------------------
  const stale = await post(`/api/workspaces/${workspaceId}/commands`, {
    command: { type: 'workspace.rename', payload: { name: 'Should not apply' } },
    expectedRevision: revision
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'STALE_REVISION');
  assert.equal(stale.body.details.currentRevision, revision + 1);

  // --- invalid payload rejected (fails closed, nothing persisted) ----------
  const invalid = await post(`/api/workspaces/${workspaceId}/commands`, {
    command: { type: 'workspace.rename', payload: { name: '' } }
  });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.code, 'INVALID_STATE');

  // --- arbitrary state replacement is refused ------------------------------
  const replacement = await post(`/api/workspaces/${workspaceId}/commands`, {
    command: { type: 'state.replaceEverything', payload: { state: {} } }
  });
  assert.equal(replacement.status, 422);

  // --- idempotent retry does not double-apply ------------------------------
  const current = await json(`/api/workspaces/${workspaceId}/state`);
  const key = randomUUID();
  const first = await post(`/api/workspaces/${workspaceId}/commands`, {
    command: { type: 'workspace.rename', payload: { name: 'Idempotent rename' } },
    expectedRevision: current.body.revision,
    idempotencyKey: key
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const replay = await post(`/api/workspaces/${workspaceId}/commands`, {
    command: { type: 'workspace.rename', payload: { name: 'Idempotent rename' } },
    expectedRevision: current.body.revision,
    idempotencyKey: key
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.revision, first.body.revision, 'replay must not advance the revision again');
  const mismatched = await post(`/api/workspaces/${workspaceId}/commands`, {
    command: { type: 'workspace.rename', payload: { name: 'Different request' } },
    idempotencyKey: key
  });
  assert.equal(mismatched.status, 409);
  assert.equal(mismatched.body.code, 'IDEMPOTENCY_MISMATCH');

  // --- audit trail records the actor and time ------------------------------
  const events = await json(`/api/workspaces/${workspaceId}/events?limit=20`);
  assert.equal(events.status, 200);
  assert.ok(events.body.events.length >= 1, 'audit trail must record commands');
  assert.equal(events.body.events[0].command_type, 'workspace.rename');
  assert.ok(Number.isInteger(events.body.events[0].created_at));

  // --- files: two-phase commit with integrity ------------------------------
  const bytes = Buffer.concat([
    Buffer.from('%PDF-1.7\n'),
    Buffer.from(`integration-payload-${workspaceId}\n`),
    Buffer.alloc(2048, 7)
  ]);
  const digest = hex(bytes);

  const init = await post(`/api/workspaces/${workspaceId}/files`, {
    category: 'PBC',
    originalName: 'integration-evidence.pdf',
    mimeType: 'application/pdf',
    sizeBytes: bytes.byteLength,
    sha256: digest
  });
  assert.equal(init.status, 201, JSON.stringify(init.body));
  const fileId = init.body.file.id as string;
  assert.equal(init.body.file.state, 'INITIALIZED');
  assert.match(init.body.uploadUrl, new RegExp(`/api/workspaces/${workspaceId}/files/${fileId}/content$`));

  // A disallowed MIME type is refused before any bytes are stored.
  const badMime = await post(`/api/workspaces/${workspaceId}/files`, {
    category: 'PBC',
    originalName: 'payload.exe',
    mimeType: 'application/x-msdownload',
    sizeBytes: 10
  });
  assert.equal(badMime.status, 415);

  const uploaded = await raw(`/api/workspaces/${workspaceId}/files/${fileId}/content`, {
    method: 'PUT',
    body: bytes,
    headers: { 'Content-Type': 'application/pdf' }
  });
  assert.equal(uploaded.status, 200, await uploaded.text());

  const completed = await post(`/api/workspaces/${workspaceId}/files/${fileId}/complete`, {
    sizeBytes: bytes.byteLength,
    sha256: digest
  });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.verifiedSha256, digest);
  assert.equal(completed.body.file.state, 'COMMITTED');

  // Exact bytes survive a fresh session in "another browser".
  cookie = '';
  const resumed = await post('/api/workspaces/resume', { accessCode });
  assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
  const downloaded = await raw(`/api/workspaces/${workspaceId}/files/${fileId}`);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('content-disposition')?.includes('integration-evidence.pdf'), true);
  const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
  assert.equal(downloadedBytes.byteLength, bytes.byteLength, 'byte length must survive across sessions');
  assert.equal(hex(downloadedBytes), digest, 'SHA-256 must survive across sessions');
  assert.deepEqual(downloadedBytes, bytes);

  const meta = await json(`/api/workspaces/${workspaceId}/files/${fileId}/metadata`);
  assert.equal(meta.status, 200);
  assert.equal(meta.body.file.sha256, digest);

  // --- integrity mismatch fails closed -------------------------------------
  const secondInit = await post(`/api/workspaces/${workspaceId}/files`, {
    category: 'EVIDENCE',
    originalName: 'wrong-digest.pdf',
    mimeType: 'application/pdf',
    sizeBytes: bytes.byteLength,
    sha256: 'f'.repeat(64)
  });
  const secondId = secondInit.body.file.id as string;
  await raw(`/api/workspaces/${workspaceId}/files/${secondId}/content`, {
    method: 'PUT',
    body: bytes,
    headers: { 'Content-Type': 'application/pdf' }
  });
  const mismatch = await post(`/api/workspaces/${workspaceId}/files/${secondId}/complete`, {
    sizeBytes: bytes.byteLength,
    sha256: 'f'.repeat(64)
  });
  assert.equal(mismatch.status, 422);
  assert.equal(mismatch.body.code, 'INTEGRITY_MISMATCH');

  // --- workspace isolation --------------------------------------------------
  // Capture the FIRST workspace's session before creating another one, then use
  // it explicitly: a session must never read a different workspace.
  const firstWorkspaceCookie = cookie;
  const other = await post('/api/workspaces', { seedId, name: 'Other workspace' });
  const otherId = other.body.workspaceId as string;
  assert.notEqual(otherId, workspaceId);
  const crossWorkspace = await fetch(`${api}/api/workspaces/${otherId}/state`, {
    headers: { Origin: origin, Cookie: firstWorkspaceCookie }
  });
  assert.equal(crossWorkspace.status, 403);
  assert.equal((await crossWorkspace.json() as any).code, 'FORBIDDEN_SCOPE');

  // --- cleanup --------------------------------------------------------------
  await raw(`/api/workspaces/${workspaceId}`, { method: 'DELETE' });
  await raw(`/api/workspaces/${otherId}`, { method: 'DELETE' });
});
