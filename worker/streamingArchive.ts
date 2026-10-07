import { sha256 } from '@noble/hashes/sha2.js';
import { Zip, ZipPassThrough } from 'fflate';

export type StreamingArchiveFile = {
  path: string;
  sizeBytes: number;
  sha256: string;
  body: ReadableStream<Uint8Array> | (() => Promise<ReadableStream<Uint8Array>>);
};

export type StreamingArchiveResult = {
  body: ReadableStream<Uint8Array>;
  completed: Promise<{ sizeBytes: number; sha256: string }>;
};

const ZIP_CHUNK_BYTES = 64 * 1024;
const ZIP32_MAX_BYTES = 0xffff_ffff;

export function createStreamingArchive(manifestBytes: Uint8Array, files: StreamingArchiveFile[]): StreamingArchiveResult {
  const output = new TransformStream<Uint8Array, Uint8Array>();
  const writer = output.writable.getWriter();
  const archiveHash = sha256.create();
  let archiveSize = 0;
  let writeFailure: unknown;
  let writes = Promise.resolve();
  let zip!: Zip;
  zip = new Zip((error, chunk) => {
    if (error) { writeFailure = error; return; }
    if (!chunk?.byteLength) return;
    if (archiveSize + chunk.byteLength > ZIP32_MAX_BYTES) {
      writeFailure = new Error('The streamed archive exceeds the ZIP32 4 GiB size limit.');
      zip.terminate();
      return;
    }
    archiveHash.update(chunk);
    archiveSize += chunk.byteLength;
    writes = writes.then(() => writer.write(chunk)).catch(reason => { writeFailure = reason; });
  });

  const drain = async () => {
    await writes;
    if (writeFailure) throw writeFailure;
  };
  const addBytes = async (path: string, bytes: Uint8Array) => {
    const entry = new ZipPassThrough(path);
    zip.add(entry);
    for (let offset = 0; offset < bytes.byteLength; offset += ZIP_CHUNK_BYTES) {
      entry.push(bytes.subarray(offset, Math.min(offset + ZIP_CHUNK_BYTES, bytes.byteLength)));
      await drain();
    }
    entry.push(new Uint8Array(0), true);
    await drain();
  };
  const completed = (async () => {
    try {
      await addBytes('manifest.json', manifestBytes);
      for (const file of files) {
        if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) {
          throw new Error(`Archive source metadata is invalid for ${file.path}.`);
        }
        if (file.sizeBytes > ZIP32_MAX_BYTES) throw new Error(`Archive source exceeds the ZIP32 4 GiB member limit: ${file.path}.`);
        const entry = new ZipPassThrough(file.path);
        const fileHash = sha256.create();
        const body = typeof file.body === 'function' ? await file.body() : file.body;
        const reader = body.getReader();
        zip.add(entry);
        let sizeBytes = 0;
        let sourceComplete = false;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { sourceComplete = true; break; }
            sizeBytes += value.byteLength;
            if (sizeBytes > file.sizeBytes) throw new Error(`Archive source exceeded its committed size: ${file.path}.`);
            fileHash.update(value);
            for (let offset = 0; offset < value.byteLength; offset += ZIP_CHUNK_BYTES) {
              entry.push(value.subarray(offset, Math.min(offset + ZIP_CHUNK_BYTES, value.byteLength)));
              await drain();
            }
          }
        } finally {
          if (!sourceComplete) await reader.cancel('Archive source verification did not complete.').catch(() => undefined);
          reader.releaseLock();
        }
        entry.push(new Uint8Array(0), true);
        await drain();
        if (sizeBytes !== file.sizeBytes || toHex(fileHash.digest()) !== file.sha256) {
          throw new Error(`Archive source failed size or SHA-256 verification: ${file.path}.`);
        }
      }
      zip.end();
      await drain();
      await writer.close();
      return { sizeBytes: archiveSize, sha256: toHex(archiveHash.digest()) };
    } catch (error) {
      zip.terminate();
      await writer.abort(error).catch(() => undefined);
      throw error;
    }
  })();

  return { body: output.readable, completed };
}

export function verifyStreamingSha256(
  body: ReadableStream<Uint8Array>, expectedSizeBytes: number, expectedSha256: string
): ReadableStream<Uint8Array> {
  const hash = sha256.create();
  let sizeBytes = 0;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      sizeBytes += chunk.byteLength;
      if (sizeBytes > expectedSizeBytes) throw new Error('The stored archive exceeded its sealed size.');
      hash.update(chunk);
      controller.enqueue(chunk);
    },
    flush() {
      if (sizeBytes !== expectedSizeBytes || toHex(hash.digest()) !== expectedSha256) {
        throw new Error('The stored archive bytes do not match their sealed size and SHA-256.');
      }
    }
  }));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
