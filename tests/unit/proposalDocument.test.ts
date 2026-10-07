import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { renderProposalPdf, ProposalDocumentError, type ProposalDocumentInput } from '../../worker/proposalDocument.js';

const shortProposal: ProposalDocumentInput = {
  id: 'proposal-test', revision: 1, createdAt: '2026-10-06T00:00:00.000Z', mode: 'QUOTE',
  scope: 'Statutory audit for the agreed reporting period, including the final audit report.',
  feeMinor: 10_000_001, validUntil: '2026-11-01', timeline: [{ name: 'Planning and fieldwork', date: '2027-02-15' }],
  client: { legalName: 'Local Trading WLL', tradingName: null, registrationNumber: 'CR-1001' },
  engagement: { code: 'E-2026-001', periodStart: '2025-01-01', periodEnd: '2025-12-31', type: 'STATUTORY_AUDIT' },
  firm: {
    legalName: 'Local Audit Partners WLL', registrationNumber: 'CR-FIRM-001', address: 'Doha, Qatar',
    profileText: 'Independent audit and assurance services for Qatar entities.',
    credentialsText: 'Current Qatar audit registration verified against firm records.',
    industryPortfolioText: 'Anonymized assurance experience across local trading and service entities.',
    methodologyText: 'The firm uses its approved risk-based audit methodology and documented professional review.'
  },
  team: [], firmEvidence: { credentials: [], industryPortfolio: [] }
};

function pageCount(bytes: Uint8Array): number {
  return (new TextDecoder().decode(bytes).match(/\/Type \/Page\b/g) ?? []).length;
}

function decodedPdfStreams(bytes: Uint8Array): string[] {
  const pdf = Buffer.from(bytes);
  const streams: string[] = [];
  const marker = Buffer.from('stream\n');
  let cursor = 0;
  while (cursor < pdf.length) {
    const markerIndex = pdf.indexOf(marker, cursor);
    if (markerIndex < 0) break;
    const dictionaryStart = pdf.lastIndexOf(Buffer.from('<<'), markerIndex);
    const dictionary = pdf.subarray(dictionaryStart, markerIndex).toString('latin1');
    const dataStart = markerIndex + marker.length;
    const dataEnd = pdf.indexOf(Buffer.from('endstream'), dataStart);
    if (dataEnd < 0) break;
    if (dictionary.includes('/FlateDecode')) {
      let compressedEnd = dataEnd;
      if (pdf[compressedEnd - 1] === 0x0a) compressedEnd -= 1;
      if (pdf[compressedEnd - 1] === 0x0d) compressedEnd -= 1;
      streams.push(inflateSync(pdf.subarray(dataStart, compressedEnd)).toString('latin1'));
    }
    cursor = dataEnd + Buffer.byteLength('endstream');
  }
  return streams;
}

it('renders a bounded quote with reconciled fees and refuses silent overflow', () => {
  const bytes = renderProposalPdf(shortProposal);
  assert.deepEqual(renderProposalPdf(shortProposal), bytes, 'the same proposal snapshot renders reproducible bytes');
  assert.match(new TextDecoder().decode(bytes.subarray(0, 8)), /^%PDF-\d\.\d$/);
  assert.ok(pageCount(bytes) >= 1 && pageCount(bytes) <= 2);
  const renderedContent = decodedPdfStreams(bytes).join('\n');
  for (const expected of [
    'Local Trading WLL',
    '2025-01-01 to 2025-12-31',
    shortProposal.scope,
    'Planning and fieldwork',
    'QAR 100,000.01',
    'QAR 50,000.01',
    'QAR 50,000.00'
  ]) {
    assert.ok(renderedContent.includes(expected), `the generated PDF contains ${expected}`);
  }

  assert.throws(() => renderProposalPdf({
    ...shortProposal,
    scope: 'Long scope '.repeat(3000),
    firm: { ...shortProposal.firm, profileText: 'Long firm profile '.repeat(3000), methodologyText: 'Long methodology '.repeat(3000) }
  }), (error: unknown) => error instanceof ProposalDocumentError && error.code === 'PROPOSAL_EXCEEDS_PAGE_LIMIT');
});

it('embeds the licensed Arabic font before rendering Arabic firm and client names', () => {
  const font = new Uint8Array(readFileSync(new URL('../../public/fonts/NotoSansArabic-Variable.ttf', import.meta.url)));
  const arabicProposal = {
    ...shortProposal,
    client: { ...shortProposal.client, legalName: 'شركة الدوحة للتجارة' },
    firm: { ...shortProposal.firm, legalName: 'شركة تدقيق محلية', profileText: 'خدمات التدقيق والمراجعة المستقلة في دولة قطر.' }
  };
  const bytes = renderProposalPdf(arabicProposal, font);
  assert.match(new TextDecoder().decode(bytes.subarray(0, 8)), /^%PDF-\d\.\d$/);
  assert.ok(pageCount(bytes) >= 1 && pageCount(bytes) <= 2);
});

it('requires actual Partner-maintained credentials and portfolio in comprehensive proposals', () => {
  const fullProposal: ProposalDocumentInput = { ...shortProposal, mode: 'FULL_PROPOSAL', team: [
    { displayName: 'Assigned Partner', grade: 'PARTNER', originalName: 'partner-cv.pdf', sha256: 'a'.repeat(64) }
  ], firmEvidence: {
    credentials: [{ originalName: 'firm-license.pdf', sha256: 'b'.repeat(64) }],
    industryPortfolio: [{ originalName: 'anonymized-experience.pdf', sha256: 'c'.repeat(64) }]
  } };
  assert.throws(() => renderProposalPdf({ ...fullProposal, firm: { ...fullProposal.firm, credentialsText: '' } }),
    (error: unknown) => error instanceof ProposalDocumentError && error.code === 'FIRM_CREDENTIALS_REQUIRED');
  assert.throws(() => renderProposalPdf({ ...fullProposal, firm: { ...fullProposal.firm, industryPortfolioText: '' } }),
    (error: unknown) => error instanceof ProposalDocumentError && error.code === 'FIRM_PORTFOLIO_REQUIRED');
  const bytes = renderProposalPdf(fullProposal);
  assert.match(new TextDecoder().decode(bytes), /%PDF/);
  assert.ok(pageCount(bytes) >= 2, 'a comprehensive proposal uses a separate qualifications/team page');
  const renderedContent = decodedPdfStreams(bytes).join('\n');
  for (const expected of [
    fullProposal.firm.profileText,
    fullProposal.firm.credentialsText!,
    fullProposal.firm.industryPortfolioText!,
    fullProposal.firm.methodologyText,
    'Assigned Partner',
    'partner-cv.pdf',
    'firm-license.pdf',
    'anonymized-experience.pdf',
    'QAR 100,000.01',
    'QAR 50,000.01',
    'QAR 50,000.00',
    'Page 1 of 2',
    'Page 2 of 2'
  ]) {
    assert.ok(renderedContent.includes(expected), `the comprehensive PDF contains ${expected}`);
  }
});
