import assert from 'node:assert/strict';
import { it } from 'node:test';
import { downloadBusinessArchiveExport } from '../../src/services/businessWorkspace.js';

const selected = { version: 1 as const, workspaceId: 'workspace-test', actorId: 'reviewer-test', persona: 'REVIEWER' as const };
const archiveHash = 'a'.repeat(64);
const manifestHash = 'b'.repeat(64);

function response(bytes: Uint8Array[], options: { size?: number; archiveHash?: string; type?: string } = {}): Response {
  const total = bytes.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of bytes) controller.enqueue(chunk);
      controller.close();
    }
  });
  return new Response(body, { headers: {
    'Content-Type': options.type ?? 'application/zip',
    'Content-Length': String(options.size ?? total),
    'X-Archive-SHA256': options.archiveHash ?? archiveHash,
    'X-Archive-Manifest-SHA256': manifestHash
  } });
}

async function withFetch<T>(stub: typeof fetch, action: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try { return await action(); }
  finally { globalThis.fetch = original; }
}

it('streams a sealed archive in chunks to the selected file without creating a Blob', async () => {
  const chunks = [new Uint8Array([0x50, 0x4b]), new Uint8Array([0x03, 0x04, 0x10, 0x20])];
  const written: number[] = [];
  let closed = false;
  let aborted = false;
  const writer = {
    async write(chunk: Uint8Array) { written.push(...chunk); },
    async close() { closed = true; },
    async abort() { aborted = true; }
  };
  const result = await withFetch(async () => response(chunks), () => downloadBusinessArchiveExport(
    'workspace-test', 'engagement-test', 'archive', selected, archiveHash, manifestHash, writer
  ));
  assert.equal(result.fileName, 'sealed-audit-archive.zip');
  assert.equal(result.blob, undefined);
  assert.deepEqual(written, [0x50, 0x4b, 0x03, 0x04, 0x10, 0x20]);
  assert.equal(closed, true);
  assert.equal(aborted, false);
});

it('aborts the destination when a streamed archive is truncated', async () => {
  let aborted = false;
  const writer = {
    async write() {},
    async close() { assert.fail('truncated archives must not close the destination'); },
    async abort() { aborted = true; }
  };
  await assert.rejects(withFetch(async () => response([new Uint8Array([1, 2])], { size: 3 }), () => downloadBusinessArchiveExport(
    'workspace-test', 'engagement-test', 'archive', selected, archiveHash, manifestHash, writer
  )), /incomplete/);
  assert.equal(aborted, true);
});

it('rejects a streamed response with mismatched seal metadata before writing bytes', async () => {
  let wrote = false;
  const writer = {
    async write() { wrote = true; }, async close() {}, async abort() {}
  };
  await assert.rejects(withFetch(async () => response([new Uint8Array([1])], { archiveHash: 'c'.repeat(64) }), () => downloadBusinessArchiveExport(
    'workspace-test', 'engagement-test', 'archive', selected, archiveHash, manifestHash, writer
  )), /seal hashes/);
  assert.equal(wrote, false);
});

it('rejects an oversized streamed response and aborts the partial file', async () => {
  let aborted = false;
  const writer = {
    async write() {}, async close() {}, async abort() { aborted = true; }
  };
  await assert.rejects(withFetch(async () => response([new Uint8Array([1, 2, 3])], { size: 2 }), () => downloadBusinessArchiveExport(
    'workspace-test', 'engagement-test', 'archive', selected, archiveHash, manifestHash, writer
  )), /exceeded its sealed size/);
  assert.equal(aborted, true);
});

it('keeps the non-streaming fallback byte-hash verification for browsers without file streaming', async () => {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const expected = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const result = await withFetch(async () => response([bytes], { archiveHash: expected }), () => downloadBusinessArchiveExport(
    'workspace-test', 'engagement-test', 'archive', selected, expected, manifestHash
  ));
  assert.equal(result.blob?.type, 'application/zip');
  assert.deepEqual(new Uint8Array(await result.blob!.arrayBuffer()), bytes);
});

it('hashes fallback response chunks as they arrive and checks the declared size', async () => {
  const chunks = [new Uint8Array([0x50, 0x4b]), new Uint8Array([0x03, 0x04, 0x10, 0x20])];
  const bytes = new Uint8Array([...chunks[0]!, ...chunks[1]!]);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const expected = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const result = await withFetch(async () => response(chunks, { archiveHash: expected }), () => downloadBusinessArchiveExport(
    'workspace-test', 'engagement-test', 'archive', selected, expected, manifestHash
  ));
  assert.deepEqual(new Uint8Array(await result.blob!.arrayBuffer()), bytes);

  await assert.rejects(() => withFetch(async () => response(chunks, { archiveHash: expected, size: bytes.byteLength + 1 }), () => downloadBusinessArchiveExport(
    'workspace-test', 'engagement-test', 'archive', selected, expected, manifestHash
  )), /incomplete and did not match its declared size/);
});

it('rejects an unsafe declared archive size before reading the fallback body', async () => {
  const body = new ReadableStream<Uint8Array>({ pull() { assert.fail('invalid size must be rejected before reading'); } });
  const result = new Response(body, { headers: {
    'Content-Type': 'application/zip', 'Content-Length': '9007199254740992',
    'X-Archive-SHA256': archiveHash, 'X-Archive-Manifest-SHA256': manifestHash
  } });
  await assert.rejects(() => withFetch(async () => result, () => downloadBusinessArchiveExport(
    'workspace-test', 'engagement-test', 'archive', selected, archiveHash, manifestHash
  )), /invalid content length/);
});

it('rejects truncated, oversized, or digest-mismatched fallback downloads', async () => {
  const chunks = [new Uint8Array([0x50, 0x4b]), new Uint8Array([0x03, 0x04])];
  const bytes = new Uint8Array([...chunks[0]!, ...chunks[1]!]);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const expected = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const oversized = new Uint8Array([...bytes, 0x00]);

  await assert.rejects(() => withFetch(async () => response([oversized], { archiveHash: expected, size: bytes.byteLength }), () => downloadBusinessArchiveExport(
    'workspace-test', 'engagement-test', 'archive', selected, expected, manifestHash
  )), /exceeded its declared exact byte count/);
  await assert.rejects(() => withFetch(async () => response(chunks, { archiveHash: 'c'.repeat(64) }), () => downloadBusinessArchiveExport(
    'workspace-test', 'engagement-test', 'archive', selected, 'c'.repeat(64), manifestHash
  )), /client-side SHA-256 check/);
});
