import assert from 'node:assert/strict';
import { it } from 'node:test';
import { calculateStatementVariance } from '../../worker/businessFieldwork.js';

it('calculates comparative statement variances without dividing by zero or inventing missing comparatives', () => {
  const cases = [
    { current: 1200, prior: 1000, expected: { numerator: '200', denominator: '1000', percent: 20, reason: 'CALCULATED' } },
    { current: -800, prior: -1000, expected: { numerator: '200', denominator: '1000', percent: 20, reason: 'CALCULATED' } },
    { current: 500, prior: 0, expected: { numerator: null, denominator: null, percent: null, reason: 'NEW_BALANCE' } },
    { current: 0, prior: 0, expected: { numerator: null, denominator: null, percent: null, reason: 'ZERO_BOTH' } },
    { current: 500, prior: null, expected: { numerator: null, denominator: null, percent: null, reason: 'NO_COMPARATIVE' } }
  ] as const;
  for (const { current, prior, expected } of cases) {
    assert.deepEqual(calculateStatementVariance(current, prior), expected);
  }
});
