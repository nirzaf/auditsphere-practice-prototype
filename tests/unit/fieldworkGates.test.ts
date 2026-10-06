// Fieldwork completeness gates (US-GAP-12/13).
//
// These pin the two completion rules the review found were not enforced: an
// unfinished (UNASSESSED) going-concern assessment must not reach independent
// review, and fieldwork cannot complete while an in-scope mapped FSLI has no
// workprogram.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertGoingConcernComplete, assertFieldworkFsliCoverage, summarizeSrmDifferences } from '../../worker/businessFieldwork.js';

describe('fieldwork completeness gates (US-GAP-12/13)', () => {
  it('blocks an unfinished (UNASSESSED) going-concern assessment from review', () => {
    assert.throws(() => assertGoingConcernComplete('UNASSESSED'), /unfinished going-concern assessment/);
    for (const conclusion of ['NO_MATERIAL_UNCERTAINTY', 'MATERIAL_UNCERTAINTY', 'INAPPROPRIATE_BASIS']) {
      assert.doesNotThrow(() => assertGoingConcernComplete(conclusion));
    }
  });

  it('blocks fieldwork completion while an in-scope mapped FSLI has no workprogram', () => {
    assert.throws(() => assertFieldworkFsliCoverage(['REVENUE', 'CASH'], ['REVENUE']), /in-scope FSLI/);
    assert.doesNotThrow(() => assertFieldworkFsliCoverage(['REVENUE', 'CASH'], ['CASH', 'REVENUE']));
    assert.doesNotThrow(() => assertFieldworkFsliCoverage([], []));
  });

  it('keeps signed and gross unadjusted exposure separate when offsetting items net below SAD', () => {
    const result = summarizeSrmDifferences([
      { id: 'overstatement', amountMinor: '300000', qualitativeSignificance: false, disposition: 'UNADJUSTED' },
      { id: 'understatement', amountMinor: '-250000', qualitativeSignificance: false, disposition: 'UNADJUSTED' }
    ], { sadMinor: '400000', performanceMinor: '750000', planningMinor: '1000000' });

    assert.equal(result.signedUnadjustedMinor, '50000', 'QAR 3,000 less QAR 2,500 is a signed QAR 500 exposure');
    assert.equal(result.grossUnadjustedMinor, '550000', 'offsetting errors retain QAR 5,500 gross exposure');
    assert.equal(result.thresholdAnalysis.aggregate.signedExceedsSAD, false);
    assert.equal(result.thresholdAnalysis.aggregate.grossExceedsSAD, true);
    assert.equal(result.thresholdAnalysis.perItem.length, 2);
  });

  it('retains a low-value qualitative exception in the SRM and prevents trivial dismissal', () => {
    const difference = { id: 'management-integrity', amountMinor: '10000', qualitativeSignificance: true, disposition: 'UNADJUSTED' as const };
    const result = summarizeSrmDifferences([difference], { sadMinor: '400000', performanceMinor: '750000', planningMinor: '1000000' });

    assert.deepEqual(result.thresholdAnalysis.perItem[0], {
      differenceId: 'management-integrity', amountMinor: '10000', qualitativeSignificance: true,
      exceedsSAD: false, exceedsTE: false, exceedsPM: false, disposition: 'UNADJUSTED'
    });
    assert.equal(result.grossUnadjustedMinor, '10000');
    assert.throws(() => summarizeSrmDifferences([
      { ...difference, disposition: 'CLEARLY_TRIVIAL' }
    ], { sadMinor: '400000', performanceMinor: '750000', planningMinor: '1000000' }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'GATE_BLOCKED');
  });
});
