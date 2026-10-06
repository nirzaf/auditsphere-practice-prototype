import { unzlibSync } from 'fflate';

export interface ReportingPngInspection {
  width: number;
  height: number;
  transparentPixelCount: number;
  sanitizedBytes: Uint8Array;
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_DIMENSION = 4096;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_DECODED_BYTES = 32 * 1024 * 1024;
const COLOR_METADATA_CHUNKS = new Set(['sRGB', 'gAMA', 'cHRM', 'pHYs']);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(parts: readonly Uint8Array[]): number {
  let value = 0xffffffff;
  for (const part of parts) for (const byte of part) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function concatenate(parts: readonly Uint8Array[], length: number): Uint8Array {
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function sampleAt(row: Uint8Array, sample: number, bitDepth: number): number {
  if (bitDepth === 16) return row[sample * 2] * 256 + row[sample * 2 + 1];
  if (bitDepth === 8) return row[sample];
  const bitOffset = sample * bitDepth;
  const shift = 8 - bitDepth - (bitOffset % 8);
  return (row[Math.floor(bitOffset / 8)] >>> shift) & ((1 << bitDepth) - 1);
}

function paeth(left: number, above: number, upperLeft: number): number {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function countTransparentPixels(input: {
  compressed: Uint8Array;
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  transparency: Uint8Array | null;
  palette: Uint8Array | null;
}): number {
  const channelsByType: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[input.colorType];
  const bitsPerPixel = channels * input.bitDepth;
  const rowBytes = Math.ceil(input.width * bitsPerPixel / 8);
  const stride = rowBytes + 1;
  const expectedLength = stride * input.height;
  if (expectedLength > MAX_DECODED_BYTES) throw new Error('The decoded PNG exceeds the reporting image safety limit.');

  let pixels: Uint8Array;
  try {
    pixels = unzlibSync(input.compressed, { out: new Uint8Array(expectedLength) });
  } catch {
    throw new Error('The PNG image data is invalid or cannot be decoded safely.');
  }
  if (pixels.byteLength !== expectedLength) throw new Error('The PNG scanline data is incomplete or oversized.');

  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  let previous = new Uint8Array(rowBytes);
  let transparentPixelCount = 0;
  const transparencyValues = input.transparency && input.colorType !== 3
    ? Array.from({ length: input.colorType === 0 ? 1 : 3 }, (_, index) => input.transparency![index * 2] * 256 + input.transparency![index * 2 + 1])
    : [];

  for (let y = 0; y < input.height; y += 1) {
    const scanlineOffset = y * stride;
    const filter = pixels[scanlineOffset];
    if (filter > 4) throw new Error('The PNG uses an unsupported scanline filter.');
    const filtered = pixels.subarray(scanlineOffset + 1, scanlineOffset + stride);
    const row = new Uint8Array(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const above = previous[x] ?? 0;
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2)
        : filter === 4 ? paeth(left, above, upperLeft) : 0;
      row[x] = (filtered[x] + predictor) & 0xff;
    }

    for (let x = 0; x < input.width; x += 1) {
      if (input.colorType === 4 || input.colorType === 6) {
        const alphaSample = input.colorType === 4 ? x * 2 + 1 : x * 4 + 3;
        const alpha = sampleAt(row, alphaSample, input.bitDepth);
        if (alpha < (input.bitDepth === 16 ? 65535 : 255)) transparentPixelCount += 1;
      } else if (input.colorType === 3 && input.transparency && input.palette) {
        const paletteIndex = sampleAt(row, x, input.bitDepth);
        if (paletteIndex * 3 >= input.palette.byteLength) throw new Error('The PNG palette index is outside its declared palette.');
        if (paletteIndex < input.transparency.byteLength && input.transparency[paletteIndex] < 255) transparentPixelCount += 1;
      } else if (input.transparency) {
        const components = input.colorType === 0 ? 1 : 3;
        let matchesTransparentColor = true;
        for (let component = 0; component < components; component += 1) {
          if (sampleAt(row, x * components + component, input.bitDepth) !== transparencyValues[component]) {
            matchesTransparentColor = false;
            break;
          }
        }
        if (matchesTransparentColor) transparentPixelCount += 1;
      }
    }
    previous = row;
  }
  return transparentPixelCount;
}

/** Validates a static PNG and removes accepted non-pixel color metadata before report embedding. */
export function inspectReportingPng(bytes: Uint8Array, requireTransparency = false): ReportingPngInspection {
  if (bytes.byteLength < 45 || bytes.byteLength > MAX_ASSET_BYTES || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw new Error('Choose a valid PNG no larger than 25 MiB.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const retainedChunks: Uint8Array[] = [];
  const imageDataChunks: Uint8Array[] = [];
  let offset = PNG_SIGNATURE.byteLength;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  let sawHeader = false;
  let sawData = false;
  let dataEnded = false;
  let sawEnd = false;

  while (offset + 12 <= bytes.byteLength) {
    const chunkStart = offset;
    const length = view.getUint32(offset);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const kind = String.fromCharCode(...typeBytes);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (!/^[A-Za-z]{4}$/.test(kind) || chunkEnd > bytes.byteLength) throw new Error('The PNG contains a malformed chunk.');
    if (view.getUint32(dataEnd) !== crc32([typeBytes, bytes.subarray(dataStart, dataEnd)])) throw new Error('The PNG contains a chunk with an invalid checksum.');
    const data = bytes.subarray(dataStart, dataEnd);
    const rawChunk = bytes.subarray(chunkStart, chunkEnd);

    if (!sawHeader) {
      if (kind !== 'IHDR' || length !== 13) throw new Error('The PNG must begin with a valid IHDR chunk.');
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      bitDepth = data[8];
      colorType = data[9];
      const allowedDepths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION
        || !allowedDepths[colorType]?.includes(bitDepth) || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        throw new Error('The PNG dimensions or encoding are outside the supported static image limits.');
      }
      retainedChunks.push(rawChunk);
      sawHeader = true;
    } else if (kind === 'IHDR') {
      throw new Error('The PNG contains more than one image header.');
    } else if (kind === 'PLTE') {
      if (sawData || palette || length < 3 || length > 768 || length % 3 !== 0 || colorType === 0 || colorType === 4) {
        throw new Error('The PNG palette is invalid.');
      }
      palette = data;
      retainedChunks.push(rawChunk);
    } else if (kind === 'tRNS') {
      if (sawData || transparency || colorType === 4 || colorType === 6) throw new Error('The PNG transparency declaration is invalid.');
      if ((colorType === 0 && length !== 2) || (colorType === 2 && length !== 6)
        || (colorType === 3 && (!palette || length < 1 || length > palette.byteLength / 3))) throw new Error('The PNG transparency declaration is incomplete.');
      transparency = data;
      retainedChunks.push(rawChunk);
    } else if (kind === 'IDAT') {
      if (dataEnded || (colorType === 3 && !palette)) throw new Error('The PNG image data is out of order or has no palette.');
      sawData = true;
      imageDataChunks.push(data);
      retainedChunks.push(rawChunk);
    } else if (kind === 'IEND') {
      if (length !== 0 || !sawData) throw new Error('The PNG end marker is invalid.');
      retainedChunks.push(rawChunk);
      sawEnd = true;
      offset = chunkEnd;
      break;
    } else if (COLOR_METADATA_CHUNKS.has(kind)) {
      if (sawData) dataEnded = true;
    } else {
      throw new Error('The PNG contains unsupported metadata or an unexpected active-content chunk. Re-export a clean static PNG asset.');
    }

    if (sawData && kind !== 'IDAT') dataEnded = true;
    offset = chunkEnd;
  }

  if (!sawHeader || !sawEnd || offset !== bytes.byteLength || !imageDataChunks.length) throw new Error('The PNG is incomplete or contains trailing data.');
  if (colorType === 3 && !palette) throw new Error('The PNG palette is missing.');
  if (colorType === 0 || colorType === 2) {
    const sampleLimit = bitDepth === 16 ? 65535 : (1 << bitDepth) - 1;
    const transparentSamples = Array.from({ length: colorType === 0 ? 1 : 3 }, (_, index) => transparency ? transparency[index * 2] * 256 + transparency[index * 2 + 1] : 0);
    if (transparency && transparentSamples.some(sample => sample > sampleLimit)) throw new Error('The PNG transparency color is outside its sample range.');
  }

  const compressed = concatenate(imageDataChunks, imageDataChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  const transparentPixelCount = countTransparentPixels({ compressed, width, height, bitDepth, colorType, transparency, palette });
  if (requireTransparency && transparentPixelCount === 0) throw new Error('The firm seal PNG must contain at least one genuinely transparent pixel.');
  const sanitizedLength = PNG_SIGNATURE.byteLength + retainedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const sanitizedBytes = concatenate([PNG_SIGNATURE, ...retainedChunks], sanitizedLength);
  return { width, height, transparentPixelCount, sanitizedBytes };
}
