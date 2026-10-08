import assert from 'node:assert/strict';
import { it } from 'node:test';
import { suggestMilestones } from '../../src/shared/milestoneDefaults.js';

it('suggests the Qatar Sunday fieldwork start and fixed calendar-day offsets for a December year end', () => {
  assert.deepEqual(suggestMilestones('2025-12-31'), {
    FIELDWORK_START: '2026-01-04', DRAFT_REPORT: '2026-02-15', FINAL_REPORT: '2026-03-15'
  });
});

it('calculates suggestions for June and March period ends without month-based rollover', () => {
  assert.deepEqual(suggestMilestones('2026-06-30'), {
    FIELDWORK_START: '2026-07-05', DRAFT_REPORT: '2026-08-15', FINAL_REPORT: '2026-09-12'
  });
  assert.deepEqual(suggestMilestones('2026-03-31'), {
    FIELDWORK_START: '2026-04-05', DRAFT_REPORT: '2026-05-16', FINAL_REPORT: '2026-06-13'
  });
});

it('handles a leap-day period end and late-January day additions', () => {
  assert.deepEqual(suggestMilestones('2024-02-29'), {
    FIELDWORK_START: '2024-03-03', DRAFT_REPORT: '2024-04-15', FINAL_REPORT: '2024-05-13'
  });
  assert.deepEqual(suggestMilestones('2025-01-31'), {
    FIELDWORK_START: '2025-02-02', DRAFT_REPORT: '2025-03-18', FINAL_REPORT: '2025-04-15'
  });
});

it('rejects impossible date strings rather than normalizing them', () => {
  assert.throws(() => suggestMilestones('2025-02-29'), /valid ISO calendar date/);
});
