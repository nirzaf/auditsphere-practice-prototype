// US-GAP-29 (R01) regression: the directory services must forward an explicit page
// cursor/limit so records beyond the first 100 remain discoverable in the UI.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getBusinessClients, getBusinessLeads } from '../../src/services/businessWorkspace.js';
import type { BusinessWorkspacePreference } from '../../src/shared/api/business.js';

const preference: BusinessWorkspacePreference = { version: 1, workspaceId: 'ws-1', actorId: 'actor-1', persona: 'PREPARER' };
const originalFetch = globalThis.fetch;
const requests: string[] = [];
const capturedHeaders: Array<Headers | undefined> = [];

function stubFetch(): void {
  requests.length = 0;
  capturedHeaders.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(String(input));
    capturedHeaders.push(init?.headers as Headers | undefined);
    return { ok: true, json: async () => ({ items: [], nextCursor: null }) } as unknown as Response;
  }) as typeof fetch;
}

after(() => { globalThis.fetch = originalFetch; });

describe('business directory pagination requests (US-GAP-29)', () => {
  it('requests the first page with a bounded default limit and no cursor', async () => {
    stubFetch();
    await getBusinessClients('ws-1', preference);
    assert.equal(requests[0], '/api/workspaces/ws-1/clients?limit=100');
  });

  it('forwards an explicit cursor and limit for subsequent client pages', async () => {
    stubFetch();
    await getBusinessClients('ws-1', preference, { cursor: 'opaque%2Fcursor', limit: 25 });
    assert.match(requests[0], /^\/api\/workspaces\/ws-1\/clients\?limit=25&cursor=/);
    // The server returns an already-encoded cursor; the client must send it back verbatim so the
    // server's single decodeURIComponent step recovers the original page token.
    const roundTripped = new URL(`https://local.test${requests[0]}`).searchParams.get('cursor');
    assert.equal(roundTripped, 'opaque%2Fcursor');
  });

  it('forwards an explicit cursor for subsequent lead pages', async () => {
    stubFetch();
    await getBusinessLeads('ws-1', preference, { cursor: 'lead-cursor' });
    assert.equal(requests[0], '/api/workspaces/ws-1/leads?limit=100&cursor=lead-cursor');
  });

  it('keeps the supplied actor, persona and client scope headers while paging', async () => {
    stubFetch();
    const scoped: BusinessWorkspacePreference = { ...preference, clientId: 'client-9', persona: 'REVIEWER' };
    await getBusinessLeads('ws-1', scoped, { cursor: 'lead-cursor' });
    assert.equal(requests.length, 1);
    const headers = capturedHeaders[0];
    assert.equal(headers?.get('X-Actor-Id'), 'actor-1');
    assert.equal(headers?.get('X-Active-Persona'), 'REVIEWER');
    assert.equal(headers?.get('X-Client-Id'), 'client-9');
  });
});
