// Fieldwork completeness gates (US-GAP-12/13).
//
// These pin the two completion rules the review found were not enforced: an
// unfinished (UNASSESSED) going-concern assessment must not reach independent
// review, and fieldwork cannot complete while an in-scope mapped FSLI has no
// workprogram.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertGoingConcernComplete, assertFieldworkFsliCoverage } from '../../worker/businessFieldwork.js';

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
});
