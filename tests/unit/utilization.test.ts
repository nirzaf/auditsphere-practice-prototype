import assert from 'node:assert/strict';
import { it } from 'node:test';
import { summarizeCapacityUtilization } from '../../worker/businessPractice';

it('calculates utilization from scheduled capacity after approved leave', () => {
  const fortyHours = summarizeCapacityUtilization(2400, 480, 1920, []);
  assert.deepEqual(fortyHours, { availableMinutes: 1920, resultReason: 'CALCULATED', utilizationBps: 10000 });

  assert.deepEqual(summarizeCapacityUtilization(480, 480, 0, []), {
    availableMinutes: 0, resultReason: 'ZERO_AVAILABILITY', utilizationBps: null
  });
  assert.deepEqual(summarizeCapacityUtilization(480, 0, 240, ['2026-10-07']), {
    availableMinutes: 480, resultReason: 'MISSING_CAPACITY', utilizationBps: null
  });
});
