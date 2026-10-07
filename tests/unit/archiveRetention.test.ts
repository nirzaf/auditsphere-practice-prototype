import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { archiveRetentionSegment, mergeArchiveLockRules, r2ArchiveLockRules } from '../../worker/archiveRetention.js';

it('maps every accepted finite and indefinite retention policy to a distinct protected prefix', () => {
  assert.equal(archiveRetentionSegment({ retentionYears: 1, retainIndefinitely: 0 }), 'years-1');
  assert.equal(archiveRetentionSegment({ retentionYears: 7, retainIndefinitely: false }), 'years-7');
  assert.equal(archiveRetentionSegment({ retentionYears: 100, retainIndefinitely: 0 }), 'years-100');
  assert.equal(archiveRetentionSegment({ retentionYears: null, retainIndefinitely: 1 }), 'indefinite');
  assert.equal(archiveRetentionSegment({ retentionYears: null, retainIndefinitely: true }), 'indefinite');
  for (const policy of [
    { retentionYears: null, retainIndefinitely: 0 },
    { retentionYears: 7, retainIndefinitely: 1 },
    { retentionYears: 0, retainIndefinitely: 0 },
    { retentionYears: 101, retainIndefinitely: 0 }
  ]) assert.throws(() => archiveRetentionSegment(policy), /incomplete or invalid/);
});

it('generates one non-overlapping R2 bucket-lock rule for each supported policy', () => {
  const rules = r2ArchiveLockRules();
  assert.equal(rules.length, 101);
  assert.equal(new Set(rules.map(rule => rule.id)).size, 101);
  assert.equal(new Set(rules.map(rule => rule.prefix)).size, 101);
  assert.equal(rules[0].prefix, 'sealed-archives/retention/years-1/');
  assert.deepEqual(rules[0].condition, { type: 'Age', maxAgeSeconds: 366 * 86_400 });
  assert.deepEqual(rules[99].condition, { type: 'Age', maxAgeSeconds: 36_525 * 86_400 });
  assert.equal(rules[100].prefix, 'sealed-archives/retention/indefinite/');
  assert.deepEqual(rules[100].condition, { type: 'Indefinite' });
});

it('replaces only the generated rule IDs and preserves other bucket lock rules', () => {
  const desired = r2ArchiveLockRules();
  const existing = [
    { id: 'unrelated-retention', prefix: 'legacy/', enabled: true },
    { id: desired[0].id, prefix: 'old-prefix/', enabled: false }
  ];
  const merged = mergeArchiveLockRules(existing, desired);
  assert.equal(merged.length, 102);
  assert.deepEqual(merged[0], existing[0]);
  assert.equal(merged.filter(rule => rule.id === desired[0].id).length, 1);
  assert.equal(merged.find(rule => rule.id === desired[0].id)?.prefix, desired[0].prefix);
});

it('keeps the checked-in Cloudflare rule file synchronized with the policy generator', () => {
  const config = JSON.parse(readFileSync('worker/r2-archive-locks.json', 'utf8')) as { rules: unknown[] };
  assert.deepEqual(config.rules, r2ArchiveLockRules());
});
