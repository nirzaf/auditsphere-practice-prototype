// US-GAP-25..28 regression: the SharePoint/Graph adapter resolves the configured
// site, honours bounded throttling retries and fails closed when unconfigured.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GraphError,
  ensureFolder,
  resolveSharePointSite,
  sharePointConfig,
  sharePointStatus,
  uploadSmallFile
} from '../../worker/integrations/sharepoint.js';
import type { Env } from '../../worker/env.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function config(tenant: string) {
  return { tenantId: tenant, clientId: 'client-1', clientSecret: 'secret', siteHostname: 'host.sharepoint.com', sitePath: '/sites/audit-test', driveName: 'Documents' };
}

describe('SharePoint/Graph adapter (US-GAP-25..28)', () => {
  it('reports an unconfigured environment without any network call', async () => {
    assert.equal(sharePointConfig({} as Env), null);
    const status = await sharePointStatus({} as Env, { fetchImpl: async () => { throw new Error('must not be called'); } });
    assert.equal(status.state, 'UNCONFIGURED');
  });

  it('resolves the configured site, drive and root folder', async () => {
    const urls: string[] = [];
    const deps = {
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'token-a', expires_in: 3600 });
        if (url.includes('/sites/host.sharepoint.com:') ) return json({ id: 'site-a', displayName: 'Audit Test', webUrl: 'https://host.sharepoint.com/sites/audit-test' });
        if (url.includes('/sites/site-a/drives')) return json({ value: [{ id: 'drive-a', name: 'Documents' }] });
        if (url.includes('/drives/drive-a/root')) return json({ id: 'root-a' });
        return json({ error: 'unexpected' }, 404);
      }) as unknown as typeof fetch
    };
    const resolved = await resolveSharePointSite(config('tenant-a'), deps);
    assert.deepEqual(resolved, {
      siteId: 'site-a', driveId: 'drive-a', rootFolderId: 'root-a',
      displayName: 'Audit Test', webUrl: 'https://host.sharepoint.com/sites/audit-test'
    });
    assert.ok(urls.some(url => url.includes('/drives/drive-a/root')));
  });

  it('retries a throttled Graph response before failing', async () => {
    let graphAttempts = 0;
    const deps = {
      sleep: async () => {},
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'token-b' });
        graphAttempts += 1;
        if (graphAttempts === 1) return new Response('throttled', { status: 429, headers: { 'Retry-After': '1' } });
        if (url.includes('/sites/host.sharepoint.com:')) return json({ id: 'site-b', displayName: 'Audit', webUrl: 'https://host.sharepoint.com/sites/audit-test' });
        if (url.includes('/sites/site-b/drives')) return json({ value: [{ id: 'drive-b', name: 'Documents' }] });
        if (url.includes('/drives/drive-b/root')) return json({ id: 'root-b' });
        return json({}, 404);
      }) as unknown as typeof fetch
    };
    const resolved = await resolveSharePointSite(config('tenant-b'), deps);
    assert.equal(resolved.siteId, 'site-b');
    assert.ok(graphAttempts >= 4);
  });

  it('returns FAILED with the underlying reason when the site cannot be resolved', async () => {
    const deps = {
      sleep: async () => {},
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'token-c' });
        return new Response('forbidden', { status: 403 });
      }) as unknown as typeof fetch
    };
    const status = await sharePointStatus({
      SHAREPOINT_TENANT_ID: 'tenant-c', SHAREPOINT_CLIENT_ID: 'client-1', SHAREPOINT_CLIENT_SECRET: 'secret',
      SHAREPOINT_SITE_HOSTNAME: 'host.sharepoint.com', SHAREPOINT_SITE_PATH: '/sites/audit-test'
    } as Env, deps);
    assert.equal(status.state, 'FAILED');
    assert.ok(status.message.length > 0);
  });

  it('creates a folder and uploads a file through the drive endpoints', async () => {
    const seen: Array<{ url: string; method?: string }> = [];
    const deps = {
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        seen.push({ url, method: init?.method });
        if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'token-d' });
        if (url.endsWith('/children')) return json({ id: 'folder-1', webUrl: 'https://host.sharepoint.com/sites/audit-test/PBC' });
        if (url.includes('/content')) return json({ id: 'file-1', eTag: 'etag-1', file: { hashes: { quickXorHash: 'qx-1' } } });
        return json({}, 404);
      }) as unknown as typeof fetch
    };
    const folder = await ensureFolder(config('tenant-d'), 'drive-1', 'root-1', 'PBC', {}, deps);
    assert.equal(folder.itemId, 'folder-1');
    const file = await uploadSmallFile(config('tenant-d'), 'drive-1', 'folder-1', { name: 'tb.xlsx', contentType: 'application/vnd.ms-excel', bytes: new Uint8Array([1, 2, 3]) }, deps);
    assert.equal(file.itemId, 'file-1');
    assert.equal(file.contentHash, 'qx-1');
    assert.ok(seen.some(entry => entry.method === 'PUT'));
  });

  it('classifies a rejected token request as a GraphError', async () => {
    const deps = { fetchImpl: (async () => new Response('denied', { status: 401 })) as unknown as typeof fetch };
    await assert.rejects(() => resolveSharePointSite(config('tenant-e'), deps), (error: unknown) => error instanceof GraphError);
  });
});
