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
  assert.equal(repeated.pageCount, extracted.pageCount, 'the same report snapshot keeps identical pagination');
  assert.deepEqual(repeated.strings, extracted.strings, 'the same report snapshot keeps identical page text and ordering');
  assert.ok(extracted.text.includes('Disclosure note 12 · Going concern'));
  assert.ok(extracted.text.includes(finalDisclosure), 'the last disclosure text is retained after pagination');
  assert.ok(extracted.text.includes(`REPORT-LONG-DISCLOSURE · Page 1 of ${extracted.pageCount}`));
  assert.ok(extracted.text.includes(`REPORT-LONG-DISCLOSURE · Page ${extracted.pageCount} of ${extracted.pageCount}`));
});
