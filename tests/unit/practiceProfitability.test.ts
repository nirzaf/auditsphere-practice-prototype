import assert from 'node:assert/strict';
import { it } from 'node:test';
import { summarizeEngagementMargin, summarizePhaseVariance } from '../../worker/businessPractice';

it('reconciles the canonical tiered charge-out value and engagement margin', () => {
  const tieredTime = [
    { hourlyMinor: 100000n, minutes: 75 },  // Partner: 1.25 hours
    { hourlyMinor: 75000n, minutes: 120 },  // Manager: 2 hours
    { hourlyMinor: 50000n, minutes: 240 },  // Senior: 4 hours
    { hourlyMinor: 20000n, minutes: 600 }   // Associate: 10 hours
  ];
  const numerator = tieredTime.reduce((total, item) => total + item.hourlyMinor * BigInt(item.minutes), 0n);

  assert.deepEqual(summarizeEngagementMargin(2000000n, numerator), {
    chargeOutDenominator: '60', chargeOutValueMinor: '675000', profitabilityMinor: '1325000'
  });
});

it('reports positive phase overruns and zero-budget actual work without a false percentage', () => {
  assert.deepEqual(summarizePhaseVariance('FIELDWORK', 6000, 6600), {
    phase: 'FIELDWORK', plannedMinutes: 6000, actualMinutes: 6600, varianceMinutes: 600,
    varianceBps: 1000, varianceStatus: 'OVERRUN'
  });
  assert.deepEqual(summarizePhaseVariance('REPORTING', 0, 120), {
    phase: 'REPORTING', plannedMinutes: 0, actualMinutes: 120, varianceMinutes: 120,
    varianceBps: null, varianceStatus: 'UNBUDGETED'
  });
  assert.equal(summarizePhaseVariance('ARCHIVE', 0, 0).varianceBps, null);
});
