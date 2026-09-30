import { it } from 'node:test';
import assert from 'node:assert/strict';
const api = process.env.DEMO_API_URL;

it('D1 demo API isolates workspaces and atomically rejects stale revisions', { skip: !api, timeout: 60000 }, async () => {
  const call = (path: string, method = 'GET', body?: unknown, token?: string) => fetch(api + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  assert.equal((await call('/health')).status, 200);
  const seeds = await (await call('/seeds')).json() as any;
  assert.equal(seeds.seeds.length, 2);
  assert.ok(seeds.seeds.every((seed: any) => !seed.state && !seed.state_json));
  assert.equal((await call('/workspaces', 'POST', null)).status, 400);
  assert.equal((await fetch(api + '/seeds', { headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
  const first = await (await call('/workspaces', 'POST', { seedId: 'commercial' })).json() as any;
  const second = await (await call('/workspaces', 'POST', { seedId: 'blank' })).json() as any;
  assert.ok(first.id && second.id);
  try {
    assert.equal(first.state.proposals[0].state, 'Draft');
    assert.equal(first.state.engagements.length, 0);
    assert.equal(first.state.receipts.length, 0);
    assert.equal((await call(`/workspaces/${first.id}`)).status, 401);
    assert.equal((await call(`/workspaces/${first.id}`, 'GET', undefined, second.token)).status, 404);
    assert.equal((await call(`/workspaces/${first.id}`, 'PUT', { revision: 1, state: {} }, first.token)).status, 422);
    first.state.clients[0].notes = 'Synthetic test change persisted through D1.';
    const race = await Promise.all([call(`/workspaces/${first.id}`, 'PUT', { revision: 1, state: first.state }, first.token), call(`/workspaces/${first.id}`, 'PUT', { revision: 1, state: first.state }, first.token)]);
    assert.deepEqual(race.map(response => response.status).sort(), [200, 409]);
    const read = await call(`/workspaces/${first.id}`, 'GET', undefined, first.token);
    assert.equal(read.headers.get('cache-control'), 'no-store');
    const saved = await read.json() as any;
    assert.equal(saved.revision, 2);
    assert.equal(saved.state.clients[0].notes, first.state.clients[0].notes);
    const other = await (await call(`/workspaces/${second.id}`, 'GET', undefined, second.token)).json() as any;
    assert.equal(other.state.clients.length, 0);
    assert.ok(first.expiresAt > Date.now() / 1000 + 6 * 86400);
  } finally {
    await call(`/workspaces/${first.id}`, 'DELETE', undefined, first.token);
    await call(`/workspaces/${second.id}`, 'DELETE', undefined, second.token);
  }
});
