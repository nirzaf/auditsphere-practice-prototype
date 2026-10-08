import { sha256 } from '@noble/hashes/sha2.js';

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
const ZIP64_EXTRA_ID = 0x0001;
const UTF8_AND_DESCRIPTOR_FLAGS = 0x0808;
const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC32_TABLE[index] = value >>> 0;
}

type CentralDirectoryEntry = {
  name: Uint8Array;
  crc32: number;
  sizeBytes: number;
  localOffset: number;
};

function put16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function put32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function put64(target: Uint8Array, offset: number, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('ZIP64 values must be non-negative safe integers.');
  let remaining = BigInt(value);
  for (let index = 0; index < 8; index += 1) {
    target[offset + index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
}

function crc32Update(crc: number, bytes: Uint8Array): number {
  let value = crc;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function archivePath(path: string, seen: Set<string>, allowManifest = false): Uint8Array {
  if (!path || path.includes('\\') || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Archive path is invalid: ${path || '(empty)'}.`);
  }
  if ((!allowManifest && path === 'manifest.json') || seen.has(path)) throw new Error(`Archive path is duplicated or reserved: ${path}.`);
  const encoded = new TextEncoder().encode(path);
  if (!encoded.byteLength || encoded.byteLength > 0xffff) throw new Error(`Archive path exceeds the ZIP filename limit: ${path}.`);
  seen.add(path);
  return encoded;
}

function localFileHeader(name: Uint8Array): Uint8Array {
  const header = new Uint8Array(30 + name.byteLength + 20);
  put32(header, 0, 0x04034b50);
  put16(header, 4, 45);
  put16(header, 6, UTF8_AND_DESCRIPTOR_FLAGS);
  put16(header, 8, 0); // Stored entries keep streaming CPU and memory bounded.
  put16(header, 10, 0); // Stable DOS time: 00:00.
  put16(header, 12, 0x0021); // 1980-01-01
  put32(header, 14, 0); // CRC and sizes follow in the data descriptor.
  put32(header, 18, 0xffff_ffff);
  put32(header, 22, 0xffff_ffff);
  put16(header, 26, name.byteLength);
  put16(header, 28, 20);
  header.set(name, 30);
  const extra = 30 + name.byteLength;
  put16(header, extra, ZIP64_EXTRA_ID);
  put16(header, extra + 2, 16);
  // ZIP64 sizes in a streaming local header are zero; authoritative sizes are
  // supplied by the ZIP64 data descriptor and central directory entry.
  put64(header, extra + 4, 0);
  put64(header, extra + 12, 0);
  return header;
}

function dataDescriptor(crc: number, sizeBytes: number): Uint8Array {
  const descriptor = new Uint8Array(24);
  put32(descriptor, 0, 0x08074b50);
  put32(descriptor, 4, crc);
  put64(descriptor, 8, sizeBytes);
  put64(descriptor, 16, sizeBytes);
  return descriptor;
}

function centralDirectoryHeader(entry: CentralDirectoryEntry): Uint8Array {
  const header = new Uint8Array(46 + entry.name.byteLength + 28);
  put32(header, 0, 0x02014b50);
  put16(header, 4, 45); // DOS platform, ZIP specification 4.5.
  put16(header, 6, 45);
  put16(header, 8, UTF8_AND_DESCRIPTOR_FLAGS);
  put16(header, 10, 0);
  put16(header, 12, 0);
  put16(header, 14, 0x0021); // 1980-01-01
  put32(header, 16, entry.crc32);
  put32(header, 20, 0xffff_ffff);
  put32(header, 24, 0xffff_ffff);
  put16(header, 28, entry.name.byteLength);
  put16(header, 30, 28);
  put16(header, 32, 0); // no comment
  put16(header, 34, 0); // disk number
  put16(header, 36, 0); // internal attributes
  put32(header, 38, 0); // external attributes
  put32(header, 42, 0xffff_ffff);
  header.set(entry.name, 46);
  const extra = 46 + entry.name.byteLength;
  put16(header, extra, ZIP64_EXTRA_ID);
  put16(header, extra + 2, 24);
  put64(header, extra + 4, entry.sizeBytes);
  put64(header, extra + 12, entry.sizeBytes);
  put64(header, extra + 20, entry.localOffset);
  return header;
}

export function createStreamingArchive(manifestBytes: Uint8Array, files: StreamingArchiveFile[]): StreamingArchiveResult {
  const output = new TransformStream<Uint8Array, Uint8Array>();
  const writer = output.writable.getWriter();
  const archiveHash = sha256.create();
  const entries: CentralDirectoryEntry[] = [];
  const seenPaths = new Set<string>();
  let archiveSize = 0;

  const write = async (bytes: Uint8Array) => {
    if (!bytes.byteLength) return;
    if (!Number.isSafeInteger(archiveSize + bytes.byteLength)) throw new Error('The sealed archive exceeds the supported exact byte-count range.');
    archiveHash.update(bytes);
    archiveSize += bytes.byteLength;
    await writer.write(bytes);
  };

  const addEntry = async (path: string, body: ReadableStream<Uint8Array>, expected?: { sizeBytes: number; sha256: string }, allowManifest = false) => {
    const name = archivePath(path, seenPaths, allowManifest);
    const localOffset = archiveSize;
    await write(localFileHeader(name));
    const hash = expected ? sha256.create() : undefined;
    let crc = 0xffff_ffff;
    let sizeBytes = 0;
    const reader = body.getReader();
    let sourceComplete = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { sourceComplete = true; break; }
        if (!value?.byteLength) continue;
        if (!Number.isSafeInteger(sizeBytes + value.byteLength)) throw new Error(`Archive source exceeds the supported exact byte-count range: ${path}.`);
        sizeBytes += value.byteLength;
        if (expected && sizeBytes > expected.sizeBytes) throw new Error(`Archive source exceeded its committed size: ${path}.`);
        hash?.update(value);
        crc = crc32Update(crc, value);
        for (let offset = 0; offset < value.byteLength; offset += ZIP_CHUNK_BYTES) {
          await write(value.subarray(offset, Math.min(offset + ZIP_CHUNK_BYTES, value.byteLength)));
        }
      }
    } finally {
      if (!sourceComplete) await reader.cancel('Archive source verification did not complete.').catch(() => undefined);
      reader.releaseLock();
    }
    const finalCrc = (crc ^ 0xffff_ffff) >>> 0;
    if (expected && (sizeBytes !== expected.sizeBytes || toHex(hash!.digest()) !== expected.sha256)) {
      throw new Error(`Archive source failed size or SHA-256 verification: ${path}.`);
    }
    await write(dataDescriptor(finalCrc, sizeBytes));
    entries.push({ name, crc32: finalCrc, sizeBytes, localOffset });
  };

  const byteStream = (bytes: Uint8Array): ReadableStream<Uint8Array> => new ReadableStream({
    start(controller) { controller.enqueue(bytes); controller.close(); }
  });

  const completed = (async () => {
    try {
      await addEntry('manifest.json', byteStream(manifestBytes), undefined, true);
      for (const file of files) {
        if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) {
          throw new Error(`Archive source metadata is invalid for ${file.path}.`);
        }
        const body = typeof file.body === 'function' ? await file.body() : file.body;
        await addEntry(file.path, body, { sizeBytes: file.sizeBytes, sha256: file.sha256 });
      }

      const centralDirectoryOffset = archiveSize;
      for (const entry of entries) await write(centralDirectoryHeader(entry));
      const centralDirectorySize = archiveSize - centralDirectoryOffset;
      const zip64EndOffset = archiveSize;
      const zip64End = new Uint8Array(56);
      put32(zip64End, 0, 0x06064b50);
      put64(zip64End, 4, 44);
      put16(zip64End, 12, 45);
      put16(zip64End, 14, 45);
      put32(zip64End, 16, 0);
      put32(zip64End, 20, 0);
      put64(zip64End, 24, entries.length);
      put64(zip64End, 32, entries.length);
      put64(zip64End, 40, centralDirectorySize);
      put64(zip64End, 48, centralDirectoryOffset);
      await write(zip64End);

      const locator = new Uint8Array(20);
      put32(locator, 0, 0x07064b50);
      put32(locator, 4, 0);
      put64(locator, 8, zip64EndOffset);
      put32(locator, 16, 1);
      await write(locator);

      const classicEnd = new Uint8Array(22);
      put32(classicEnd, 0, 0x06054b50);
      put16(classicEnd, 4, 0);
      put16(classicEnd, 6, 0);
      put16(classicEnd, 8, 0xffff);
      put16(classicEnd, 10, 0xffff);
      put32(classicEnd, 12, 0xffff_ffff);
      put32(classicEnd, 16, 0xffff_ffff);
      put16(classicEnd, 20, 0);
      await write(classicEnd);

      await writer.close();
      return { sizeBytes: archiveSize, sha256: toHex(archiveHash.digest()) };
    } catch (error) {
      await writer.abort(error).catch(() => undefined);
      throw error;
    }
  })();

  return { body: output.readable, completed };
}

export function verifyStreamingSha256(
  body: ReadableStream<Uint8Array>, expectedSizeBytes: number, expectedSha256: string
): ReadableStream<Uint8Array> {
  if (!Number.isSafeInteger(expectedSizeBytes) || expectedSizeBytes < 0) {
    throw new Error('The sealed archive size is outside the supported exact byte-count range.');
  }
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error('The sealed archive SHA-256 value is invalid.');
  }
  const hash = sha256.create();
  let sizeBytes = 0;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const nextSize = sizeBytes + chunk.byteLength;
      if (!Number.isSafeInteger(nextSize)) throw new Error('The stored archive exceeds the supported exact byte-count range.');
      if (nextSize > expectedSizeBytes) throw new Error('The stored archive exceeded its sealed size.');
      sizeBytes = nextSize;
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
