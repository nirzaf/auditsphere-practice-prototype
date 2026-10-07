import assert from 'node:assert/strict';
import { it } from 'node:test';
import { sha256 } from '@noble/hashes/sha2.js';
import { unzipSync } from 'fflate';
import { createStreamingArchive, toHex, verifyStreamingSha256 } from '../../worker/streamingArchive.js';

const encoder = new TextEncoder();

function bytesStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

it('streams verified source bytes into a readable ZIP and reports its SHA-256 and size', async () => {
  const source = encoder.encode('committed evidence bytes');
  const sourceHash = toHex(sha256(source));
  const manifest = encoder.encode('{"format":"test"}');
  const archive = createStreamingArchive(manifest, [{ path: 'files/evidence.txt', sizeBytes: source.byteLength, sha256: sourceHash, body: bytesStream(source) }]);
  const output = new Response(archive.body).arrayBuffer();
  const result = await archive.completed;
  const outputBytes = new Uint8Array(await output);
  const entries = unzipSync(outputBytes);
  assert.equal(new TextDecoder().decode(entries['manifest.json']), new TextDecoder().decode(manifest));
  assert.equal(new TextDecoder().decode(entries['files/evidence.txt']), new TextDecoder().decode(source));
  assert.equal(result.sizeBytes, outputBytes.byteLength);
  assert.equal(result.sha256, toHex(sha256(outputBytes)));
  const verified = await new Response(verifyStreamingSha256(bytesStream(outputBytes), result.sizeBytes, result.sha256)).arrayBuffer();
  assert.deepEqual(new Uint8Array(verified), outputBytes);
});

it('rejects changed or truncated source bytes and errors the uncommitted ZIP stream', async () => {
  const source = encoder.encode('changed evidence');
  const archive = createStreamingArchive(encoder.encode('{}'), [{
    path: 'files/evidence.txt', sizeBytes: source.byteLength, sha256: 'a'.repeat(64), body: bytesStream(source)
  }]);
  const consume = new Response(archive.body).arrayBuffer();
  await assert.rejects(archive.completed, /failed size or SHA-256 verification/);
  await assert.rejects(consume);
});

it('builds and verifies a ZIP larger than the former 64 MiB input ceiling with bounded chunks', async () => {
  const chunk = new Uint8Array(64 * 1024).fill(0x5a);
  const chunkCount = 65 * 16;
  const sourceSize = chunk.byteLength * chunkCount;
  const sourceHash = sha256.create();
  for (let index = 0; index < chunkCount; index++) sourceHash.update(chunk);
  let sent = 0;
  const sourceBody = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent === chunkCount) { controller.close(); return; }
      controller.enqueue(chunk);
      sent++;
    }
  });
  const archive = createStreamingArchive(encoder.encode('{"format":"large-test"}'), [{
    path: 'files/large.bin', sizeBytes: sourceSize, sha256: toHex(sourceHash.digest()), body: sourceBody
  }]);
  const outputHash = sha256.create();
  const reader = archive.body.getReader();
  let outputSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    outputSize += value.byteLength;
    outputHash.update(value);
  }
  const result = await archive.completed;
  assert.ok(sourceSize > 64 * 1024 * 1024);
  assert.ok(outputSize > sourceSize);
  assert.equal(result.sizeBytes, outputSize);
  assert.equal(result.sha256, toHex(outputHash.digest()));
});

it('splits oversized upstream chunks before passing them to the ZIP writer', async () => {
  const source = new Uint8Array(3 * 64 * 1024 + 17).fill(0x33);
  const archive = createStreamingArchive(encoder.encode('{}'), [{
    path: 'files/large-chunk.bin', sizeBytes: source.byteLength, sha256: toHex(sha256(source)), body: bytesStream(source)
  }]);
  let largestOutputChunk = 0;
  const reader = archive.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      largestOutputChunk = Math.max(largestOutputChunk, value.byteLength);
    }
  } finally {
    reader.releaseLock();
  }
  await archive.completed;
  assert.ok(largestOutputChunk <= 64 * 1024, `ZIP writer emitted ${largestOutputChunk} byte chunk`);
});

it('fails streamed verification when the stored bytes differ from the sealed hash or size', async () => {
  const source = encoder.encode('sealed bytes');
  const incorrectHash = verifyStreamingSha256(bytesStream(source), source.byteLength, '0'.repeat(64));
  await assert.rejects(new Response(incorrectHash).arrayBuffer(), /sealed size and SHA-256/);
  const incorrectSize = verifyStreamingSha256(bytesStream(source), source.byteLength + 1, toHex(sha256(source)));
  await assert.rejects(new Response(incorrectSize).arrayBuffer(), /sealed size and SHA-256/);
});
