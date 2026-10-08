import assert from 'node:assert/strict';
import { it } from 'node:test';
import { calculateArOutstandingMinor, getArAgingBucket } from '../../worker/businessPractice.js';

it('ages receivables at exact Qatar calendar-day boundaries', () => {
  const due = '2026-08-15';
  assert.equal(getArAgingBucket(due, '2026-08-14'), 'CURRENT', 'not-yet-due invoices remain current');
  assert.equal(getArAgingBucket(due, due), 'CURRENT', 'an invoice due today remains current');
  assert.equal(getArAgingBucket(due, '2026-08-16'), 'DAYS_1_30', 'the first overdue day is in 1–30');
  assert.equal(getArAgingBucket(due, '2026-09-14'), 'DAYS_1_30', 'day 30 remains in 1–30');
  assert.equal(getArAgingBucket(due, '2026-09-15'), 'DAYS_31_60', 'day 31 starts 31–60');
  assert.equal(getArAgingBucket(due, '2026-10-14'), 'DAYS_31_60', 'day 60 remains in 31–60');
  assert.equal(getArAgingBucket(due, '2026-10-15'), 'DAYS_61_90', 'day 61 starts 61–90');
  assert.equal(getArAgingBucket(due, '2026-11-13'), 'DAYS_61_90', 'day 90 remains in 61–90');
  assert.equal(getArAgingBucket(due, '2026-11-14'), 'DAYS_91_PLUS', 'day 91 starts the final bucket');
  assert.equal(getArAgingBucket(due, '2026-09-23'), 'DAYS_31_60', 'the specified 15 August to 23 September example is 39 days overdue');
});

it('rejects impossible calendar dates instead of assigning a misleading bucket', () => {
  assert.throws(() => getArAgingBucket('2026-02-31', '2026-03-01'), /valid calendar dates/);
  assert.throws(() => getArAgingBucket('2026-02-28', '2026-02-31'), /valid calendar dates/);
});

it('reconciles invoice aging after effective allocations and credits without allowing a negative balance', () => {
  assert.equal(calculateArOutstandingMinor(100_000n, 30_000n, 10_000n), 60_000n,
    'a QAR 1,000 invoice less QAR 300 allocated cash and QAR 100 credit leaves QAR 600');
  assert.throws(() => calculateArOutstandingMinor(100_000n, 80_000n, 30_000n, 'AS-QA-001'),
    /Invoice AS-QA-001 has credits or allocations greater than its issued amount/);
});
