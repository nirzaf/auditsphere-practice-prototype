import assert from 'node:assert/strict';
import { it } from 'node:test';
import { extractReportingPdfText } from '../helpers/reportingPdf.js';
import { renderReportingPdf } from '../../worker/reportingDocument.js';

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
