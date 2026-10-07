import { it } from 'node:test';
import assert from 'node:assert/strict';
import { presentationEditionBlocker, usesFullIfrsFramework } from '../../src/domain/reportingStandards.js';

it('US-REP-003 applies IFRS 18 from the period-start effective date without silently reusing IAS 1', () => {
  const profile = { reportingFramework: 'IFRS', earlyAdoption: false };
  assert.equal(presentationEditionBlocker({ ...profile, presentationEdition: 'IAS1', periodStart: '2026-12-31' }), null);
  assert.match(presentationEditionBlocker({ ...profile, presentationEdition: 'IAS1', periodStart: '2027-01-01' }) ?? '', /select IFRS 18/);
  assert.equal(presentationEditionBlocker({ ...profile, presentationEdition: 'IFRS18', periodStart: '2027-01-01' }), null);
  assert.equal(presentationEditionBlocker({ ...profile, presentationEdition: 'OTHER_APPROVED', periodStart: '2027-01-01' }), null,
    'a separately Partner-approved alternative remains explicit');
});

it('US-REP-003 requires explicit early-adoption approval and does not impose full IFRS editions on other frameworks', () => {
  assert.match(presentationEditionBlocker({ reportingFramework: 'International Financial Reporting Standards', presentationEdition: 'IFRS18',
    earlyAdoption: false, periodStart: '2026-01-01' }) ?? '', /explicit early adoption/);
  assert.equal(presentationEditionBlocker({ reportingFramework: 'IFRS', presentationEdition: 'IFRS18', earlyAdoption: true,
    periodStart: '2026-01-01' }), null);
  assert.match(presentationEditionBlocker({ reportingFramework: 'IFRS', presentationEdition: 'IAS1', earlyAdoption: true,
    periodStart: '2026-01-01' }) ?? '', /only when IFRS 18 is selected/);
  assert.equal(usesFullIfrsFramework('IFRS for SMEs'), false);
  assert.equal(presentationEditionBlocker({ reportingFramework: 'IFRS for SMEs', presentationEdition: 'IAS1', earlyAdoption: false,
    periodStart: '2027-01-01' }), null);
  assert.match(presentationEditionBlocker({ reportingFramework: 'Qatar Accounting Standards', presentationEdition: 'IFRS18', earlyAdoption: false,
    periodStart: '2027-01-01' }) ?? '', /only when the approved reporting framework is full IFRS/);
});
