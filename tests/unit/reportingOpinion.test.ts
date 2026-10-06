import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildOpinionReportSections, opinionReportingBlockers, validateOpinionSelection } from '../../worker/reportingOpinion.js';

it('US-REP-001 renders Adverse rationale and exact FSLI impact in the shared preview/PDF projection', () => {
  const rationale = 'The recorded revenue is materially overstated because the contract liabilities were omitted.';
  const basis = 'Revenue recognition did not comply with the approved performance-obligation accounting policy.';
  const sections = buildOpinionReportSections({
    reportType: 'ISA_AUDIT', category: 'ADVERSE', rationale, basisHeading: 'Basis for Adverse Opinion', basisText: basis,
    materialityAssessment: 'The amount exceeds performance materiality by a significant margin.',
    pervasivenessAssessment: 'The misstatement affects revenue and multiple related statement disclosures.',
    additionalSections: [{ heading: 'Other Matter', body: 'The comparative statements were audited by a predecessor auditor.' }]
  }, [{ code: 'REV-01', name: 'Revenue', amountMinor: '123450', explanation: 'A completed contract liability was recorded as current-period revenue.' }]);

  assert.equal(sections[0].paragraphs?.[0], rationale, 'approved rationale remains verbatim in its own paragraph');
  assert.equal(sections[1].heading, 'Basis for Adverse Opinion');
  assert.equal(sections[1].paragraphs?.[0], basis);
  assert.deepEqual(sections[2].rows, [{ label: 'REV-01 · Revenue', current: 'QAR 1234.50', detail: 'A completed contract liability was recorded as current-period revenue.' }]);
  assert.equal(sections.find(section => section.heading === 'Other Matter')?.paragraphs?.[0], 'The comparative statements were audited by a predecessor auditor.');
});

it('US-REP-001 creates the opinion-specific Qualified and Disclaimer headings', () => {
  for (const [category, heading] of [['QUALIFIED', 'Basis for Qualified Opinion'], ['DISCLAIMER', 'Basis for Disclaimer of Opinion']]) {
    const sections = buildOpinionReportSections({ reportType: 'ISA_AUDIT', category, basisText: 'The auditor could not obtain sufficient appropriate evidence for the identified balance.' });
    assert.equal(sections[1].heading, heading);
  }
});

it('US-REP-001 rejects incomplete modified opinions before any opinion insert is assembled', () => {
  const missingLine = validateOpinionSelection({ reportType: 'ISA_AUDIT', category: 'QUALIFIED', affectedFsliCount: 0,
    basisText: 'The required basis is detailed, but there is no identified statement line.', aupReportType: null, aupProcedureSummary: null });
  assert.equal(missingLine, 'A modified opinion requires at least one affected FSLI and substantive basis text.');
  const missingBasis = validateOpinionSelection({ reportType: 'ISA_AUDIT', category: 'ADVERSE', affectedFsliCount: 1,
    basisText: 'too short', aupReportType: null, aupProcedureSummary: null });
  assert.equal(missingBasis, 'A modified opinion requires at least one affected FSLI and substantive basis text.');
  assert.equal(validateOpinionSelection({ reportType: 'ISA_AUDIT', category: 'QUALIFIED', affectedFsliCount: 1,
    basisText: 'There is a substantive basis for the identified affected statement line.', aupReportType: null, aupProcedureSummary: null }), null);
});

it('US-REP-001 rejects audit-opinion data on AUP work', () => {
  assert.match(validateOpinionSelection({ reportType: 'ISRS_4400_AUP', category: 'ADVERSE', affectedFsliCount: 1,
    basisText: 'An audit opinion basis cannot be used on agreed-upon procedures.', aupReportType: 'AUP report',
    aupProcedureSummary: 'The procedures were performed and factual findings are reported.' }) ?? '', /cannot carry an ISA audit opinion/);
});

it('US-REP-001 reports conditional going-concern blockers and keeps AUP outside ISA opinion wording', () => {
  assert.deepEqual(opinionReportingBlockers('ISA_AUDIT', 'MATERIAL_UNCERTAINTY', null),
    ['The assessed material going-concern uncertainty needs a Partner-completed reporting section.']);
  assert.deepEqual(opinionReportingBlockers('ISA_AUDIT', 'MATERIAL_UNCERTAINTY', 'See the separate going-concern section.'), []);
  assert.deepEqual(opinionReportingBlockers('ISRS_4400_AUP', 'MATERIAL_UNCERTAINTY', null), []);
  const sections = buildOpinionReportSections({ reportType: 'ISRS_4400_AUP', category: null, aupReportType: 'ISRS 4400 (Revised) agreed-upon procedures report',
    aupProcedureSummary: 'We performed the procedures agreed with the engaging party and report the factual findings.' });
  assert.equal(sections[0].heading, 'ISRS 4400 (Revised) agreed-upon procedures report');
  assert.equal(sections[0].paragraphs?.[0], 'We performed the procedures agreed with the engaging party and report the factual findings.');
  assert.ok(sections.every(section => !section.heading.includes('Independent Auditor')));
});
