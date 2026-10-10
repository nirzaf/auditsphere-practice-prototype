import assert from 'node:assert/strict';
import { it } from 'node:test';
import { zlibSync } from 'fflate';
import { extractReportingPdfText } from '../helpers/reportingPdf.js';
import { renderReportingPdf } from '../../worker/reportingDocument.js';

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  body.set(new TextEncoder().encode(type)); body.set(data, 4);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const chunk = new Uint8Array(12 + data.length), view = new DataView(chunk.buffer);
  view.setUint32(0, data.length); chunk.set(body, 4); view.setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0);
  return chunk;
}

function approvalPng(): Uint8Array {
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, 1); view.setUint32(4, 1); header[8] = 8; header[9] = 6;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header), pngChunk('IDAT', zlibSync(new Uint8Array([0, 35, 84, 127, 255]))), pngChunk('IEND', new Uint8Array())];
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

it('US-REP-003 keeps long disclosure text readable across numbered PDF pages', () => {
  const finalDisclosure = 'FINAL-LONG-DISCLOSURE-SENTINEL';
  const input = {
    number: 'REPORT-LONG-DISCLOSURE', title: 'Independent Auditor’s Report and Financial Statements',
    firmName: 'Northstar Audit Partners', clientName: 'Northstar Trading LLC', engagementCode: 'ENG-26047',
    serviceType: 'STATUTORY_AUDIT', periodStart: '2025-01-01', periodEnd: '2025-12-31',
    sections: [{ heading: 'Disclosure note 12 · Going concern', paragraphs: [
      `${'The entity expects to meet its obligations as they fall due. '.repeat(360)}${finalDisclosure}`
    ] }]
  };
  const extracted = extractReportingPdfText(renderReportingPdf(input));
  const repeated = extractReportingPdfText(renderReportingPdf(input));

  assert.ok(extracted.pageCount >= 2, `the long note must span pages; got ${extracted.pageCount}`);
  assert.equal(extracted.pages.length, extracted.pageCount, 'each PDF page has its own readable text stream');
  assert.equal(repeated.pageCount, extracted.pageCount, 'the same report snapshot keeps identical pagination');
  assert.deepEqual(repeated.strings, extracted.strings, 'the same report snapshot keeps identical page text and ordering');
  assert.ok(extracted.text.includes('Disclosure note 12 · Going concern'));
  assert.ok(extracted.text.includes(finalDisclosure), 'the last disclosure text is retained after pagination');
  assert.ok(extracted.text.includes(`REPORT-LONG-DISCLOSURE · Page 1 of ${extracted.pageCount}`));
  assert.ok(extracted.text.includes(`REPORT-LONG-DISCLOSURE · Page ${extracted.pageCount} of ${extracted.pageCount}`));
});

it('US-REP-003 paginates long statement tables without dropping line items or totals', () => {
  const rows = Array.from({ length: 90 }, (_, index) => ({
    label: `QA-FS-${String(index + 1).padStart(3, '0')} · Synthetic statement line ${index + 1}`,
    current: `QAR ${((index + 1) * 125).toFixed(2)}`,
    comparative: `QAR ${((index + 1) * 100).toFixed(2)}`
  }));
  rows.push({ label: 'Total assets', current: 'QAR 512,812.50', comparative: 'QAR 410,250.00' });
  const extracted = extractReportingPdfText(renderReportingPdf({
    number: 'REPORT-LONG-TABLE', title: 'Complete statement table', firmName: 'Northstar Audit Partners',
    clientName: 'Northstar Trading LLC', engagementCode: 'ENG-26047', serviceType: 'STATUTORY_AUDIT',
    periodStart: '2025-01-01', periodEnd: '2025-12-31', sections: [{ heading: 'Statement of Financial Position', rows }]
  }));

  assert.ok(extracted.pageCount >= 2);
  assert.equal(extracted.pages.length, extracted.pageCount);
  assert.ok(extracted.text.includes('QA-FS-001 · Synthetic statement line 1'));
  assert.ok(extracted.text.includes('QA-FS-090 · Synthetic statement line 90'));
  assert.ok(extracted.text.includes('Total assets'));
  assert.ok(extracted.text.includes('QAR 512,812.50'));
  assert.ok(extracted.text.indexOf('QA-FS-001 · Synthetic statement line 1') < extracted.text.indexOf('QA-FS-090 · Synthetic statement line 90'));
  assert.ok(extracted.text.includes(`REPORT-LONG-TABLE · Page ${extracted.pageCount} of ${extracted.pageCount}`));
});

it('US-REP-003 moves the complete signature and seal block clear of a crowded page footer', () => {
  const approvalImage = approvalPng();
  const body = Array.from({ length: 25 }, (_, index) => `Approval layout line ${index + 1}: current approved financial statement evidence remains unchanged.`);
  body.push('BODY-BEFORE-PARTNER-APPROVAL');
  const extracted = extractReportingPdfText(renderReportingPdf({
    number: 'REPORT-APPROVAL-FOOTER', title: 'Independent Auditor’s Report and Financial Statements',
    firmName: 'Northstar Audit Partners', clientName: 'Northstar Trading LLC', engagementCode: 'ENG-26047',
    serviceType: 'STATUTORY_AUDIT', periodStart: '2025-01-01', periodEnd: '2025-12-31',
    sections: [{ heading: 'Approved statement detail', paragraphs: body }],
    signatureBytes: approvalImage, sealBytes: approvalImage, partnerName: 'QA Reporting Partner'
  }));
  const bodyPage = extracted.pages.findIndex(page => page.includes('BODY-BEFORE-PARTNER-APPROVAL'));
  const approvalPage = extracted.pages.findIndex(page => page.includes('Partner approval assets displayed for review'));

  assert.ok(bodyPage >= 0);
  assert.ok(approvalPage > bodyPage, 'the approval images and disclaimer start on the next page when the whole block would overlap the footer');
  assert.ok(extracted.pages[approvalPage].some(text => text.includes('not a certificate-based digital signature')));
  assert.ok(extracted.pages[approvalPage].some(text => text.includes(`Page ${approvalPage + 1} of ${extracted.pageCount}`)));
});
