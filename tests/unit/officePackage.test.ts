import assert from 'node:assert/strict';
import { it } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { verifyBusinessFileBytes } from '../../worker/business.js';
import { OFFICE_PACKAGE_MAX_ENTRIES, OFFICE_PACKAGE_MAX_ENTRY_BYTES, inspectOfficePackage } from '../../worker/officePackage.js';

const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function docxBytes(documentBytes = strToU8('<w:document/>')): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': documentBytes
  });
}

function understateOfficeMember(bytes: Uint8Array, memberName: string): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let index = bytes.byteLength - 22; index >= Math.max(0, bytes.byteLength - 65_557); index--) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
  }
  assert.notEqual(eocd, -1, 'fixture has an end-of-central-directory record');
  let centralOffset = view.getUint32(eocd + 16, true);
  const centralEnd = centralOffset + view.getUint32(eocd + 12, true);
  while (centralOffset + 46 <= centralEnd && view.getUint32(centralOffset, true) === 0x02014b50) {
    const filenameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const filenameStart = centralOffset + 46;
    const filename = new TextDecoder().decode(bytes.subarray(filenameStart, filenameStart + filenameLength));
    if (filename === memberName) {
      const localOffset = view.getUint32(centralOffset + 42, true);
      view.setUint32(localOffset + 22, 0, true);
      view.setUint32(centralOffset + 24, 0, true);
      return bytes;
    }
    centralOffset += 46 + filenameLength + extraLength + commentLength;
  }
  throw new Error(`ZIP member not found: ${memberName}`);
}

function renameZipMember(bytes: Uint8Array, memberName: string, replacementName: string): Uint8Array {
  const source = strToU8(memberName);
  const replacement = strToU8(replacementName);
  assert.equal(source.byteLength, replacement.byteLength, 'fixture replacement preserves the ZIP filename length');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let index = bytes.byteLength - 22; index >= Math.max(0, bytes.byteLength - 65_557); index--) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
  }
  assert.notEqual(eocd, -1, 'fixture has an end-of-central-directory record');
  let centralOffset = view.getUint32(eocd + 16, true);
  const centralEnd = centralOffset + view.getUint32(eocd + 12, true);
  while (centralOffset + 46 <= centralEnd && view.getUint32(centralOffset, true) === 0x02014b50) {
    const filenameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const filenameStart = centralOffset + 46;
    const filename = new TextDecoder().decode(bytes.subarray(filenameStart, filenameStart + filenameLength));
    if (filename === memberName) {
      const localOffset = view.getUint32(centralOffset + 42, true);
      assert.equal(view.getUint16(localOffset + 26, true), replacement.byteLength, 'fixture local header has the expected name length');
      bytes.set(replacement, localOffset + 30);
      bytes.set(replacement, filenameStart);
      return bytes;
    }
    centralOffset += 46 + filenameLength + extraLength + commentLength;
  }
  throw new Error(`ZIP member not found: ${memberName}`);
}

it('accepts a complete Office ZIP package and checks its actual directory members', () => {
  const bytes = docxBytes();
  assert.doesNotThrow(() => verifyBusinessFileBytes(docx, bytes));

  const missingParts = zipSync({ 'word/document.xml': strToU8('<w:document/>') });
  assert.throws(() => verifyBusinessFileBytes(docx, missingParts), /required Office document parts/);
});

it('limits actual streamed expansion even when ZIP size metadata understates a member', () => {
  const expansion = new Uint8Array(OFFICE_PACKAGE_MAX_ENTRY_BYTES + 1).fill(65);
  const bytes = understateOfficeMember(docxBytes(expansion), 'word/document.xml');
  const inspection = inspectOfficePackage(bytes);
  assert.equal(inspection.tooLarge, true);
  assert.equal(inspection.valid, false);
  assert.throws(() => verifyBusinessFileBytes(docx, bytes), /safe expanded size or member-count limit/);
});

it('rejects Office packages with too many members before accepting their parts', () => {
  const members = Object.fromEntries(Array.from({ length: OFFICE_PACKAGE_MAX_ENTRIES + 1 }, (_, index) => [`member-${index}`, new Uint8Array()])) as Record<string, Uint8Array>;
  const inspection = inspectOfficePackage(zipSync(members));
  assert.equal(inspection.tooLarge, true);
  assert.equal(inspection.valid, false);
});

it('rejects duplicate package paths that downstream ZIP readers could interpret differently', () => {
  const bytes = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8('<w:document/>'),
    'word/documenT.xml': strToU8('<w:document/>')
  });
  const ambiguous = renameZipMember(bytes, 'word/documenT.xml', 'word/document.xml');
  const inspection = inspectOfficePackage(ambiguous);
  assert.equal(inspection.valid, false);
  assert.throws(() => verifyBusinessFileBytes(docx, ambiguous), /valid ZIP package/);
});
