import assert from 'node:assert/strict';
import { it } from 'node:test';
import { zlibSync } from 'fflate';
import { inspectReportingPng } from '../../worker/reportingPng.js';

const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}

function chunk(kind: string, data: Uint8Array): Uint8Array {
  const type = new TextEncoder().encode(kind);
  const body = concat([type, data]);
  const result = new Uint8Array(12 + data.byteLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.byteLength);
  result.set(body, 4);
  view.setUint32(8 + data.byteLength, crc32(body));
  return result;
}

function png(alpha: number, options: { width?: number; metadata?: string } = {}): Uint8Array {
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, options.width ?? 1);
  headerView.setUint32(4, 1);
  header[8] = 8;
  header[9] = 6;
  const metadata = options.metadata ? [chunk(options.metadata, new Uint8Array(9))] : [];
  return concat([signature, chunk('IHDR', header), ...metadata, chunk('IDAT', zlibSync(new Uint8Array([0, 35, 84, 127, alpha]))), chunk('IEND', new Uint8Array())]);
}

function chunkKinds(bytes: Uint8Array): string[] {
  const kinds: string[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 8; offset + 12 <= bytes.byteLength;) {
    const length = view.getUint32(offset);
    kinds.push(String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)));
    offset += length + 12;
  }
  return kinds;
}

it('US-REP-002 validates a real transparent seal and strips non-pixel color metadata before rendering', () => {
  const inspected = inspectReportingPng(png(96, { metadata: 'pHYs' }), true);
  assert.equal(inspected.width, 1);
  assert.equal(inspected.height, 1);
  assert.equal(inspected.transparentPixelCount, 1);
  assert.deepEqual(chunkKinds(inspected.sanitizedBytes), ['IHDR', 'IDAT', 'IEND']);
});

it('US-REP-002 rejects an opaque seal even when the PNG format has an alpha channel', () => {
  assert.throws(() => inspectReportingPng(png(255), true), /genuinely transparent pixel/);
});

it('US-REP-002 rejects malformed chunks, invalid checksums, and unexpected active content', () => {
  const badChecksum = png(0);
  badChecksum[29] ^= 0xff;
  assert.throws(() => inspectReportingPng(badChecksum), /invalid checksum/);
  assert.throws(() => inspectReportingPng(png(0, { metadata: 'acTL' })), /unsupported metadata|active-content/);
});

it('US-REP-002 bounds image dimensions before allocating decoded pixel data', () => {
  assert.throws(() => inspectReportingPng(png(0, { width: 4097 })), /dimensions|encoding/);
});
