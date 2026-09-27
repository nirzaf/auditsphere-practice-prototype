// VP-064-AC01/AC04: canonical records describe every module with routes, commands,
// fixtures and assertions, and never claim live integrations, production readiness
// or professional assurance.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderLifecycleMatrix } from '../../tools/lifecycle-matrix.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('VP-064 documentation contract', () => {
  it('VP-064-AC01: module coverage lists all 39 modules with route, command, fixture and positive/negative assertions', () => {
    const rows = read('docs/prototype/module-coverage.md').split('\n').filter(line => /^\| \d{2} \|/.test(line));
    assert.deepEqual(rows.map(line => line.split('|')[1].trim()), Array.from({ length: 39 }, (_, index) => String(index + 1).padStart(2, '0')));
    for (const row of rows) {
      const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
      const [id, stories, routes, commands, fixtures, positive, negative] = cells;
      assert.match(stories, /VP-\d{3}/, `module ${id} names its stories`);
      for (const [label, value] of Object.entries({ routes, commands, fixtures, positive, negative })) assert.ok(value && value !== '—', `module ${id} records ${label}`);
    }
  });

  it('VP-064-AC04: canonical records make no live, production or professional-assurance claim', () => {
    const files = ['docs/prototype/scope.md', 'docs/prototype/module-coverage.md', 'docs/prototype/verification.md', 'docs/prototype/remaining-limitations.md', 'tracking/ACCEPTANCE_EVIDENCE.md', 'tracking/MODULE_DEMO_SIGNOFF.md', 'docs/prototype/criterion-evidence-ledger.md'];
    const affirmative = /(?<!never sets `)(?<!never )(?<!not )liveConnected\s*[=:]\s*true|is (now )?production[- ]ready|production approval (was )?(granted|given)|professionally (certified|approved)|real (email|emails) (was|were) sent|deployed to production as part of this acceptance/i;
    for (const file of files) assert.doesNotMatch(read(file), affirmative, `${file} contains no affirmative live/production/professional claim`);
    const scope = read('docs/prototype/scope.md');
    assert.match(scope, /Hard exclusions \(never offered, never gated\)/);
    assert.match(scope, /PROTOTYPE-AGENT-ACCEPTANCE-001/);
    assert.match(scope, /\| Not approved \| Professional methodology or opinions, real postings, live providers, production security\/retention/);
  });

  it('UX-LIFECYCLE: the generated lifecycle matrix matches src/services/lifecycles.ts', () => {
    assert.equal(read('docs/prototype/lifecycle-matrix.md'), renderLifecycleMatrix(), 'regenerate with: npx tsx tools/lifecycle-matrix.ts');
  });

  it('VP-064-AC04: any recorded agent approval receipt disclaims production and deployment', () => {
    const evidence = read('tracking/ACCEPTANCE_EVIDENCE.md');
    const receipts = [...evidence.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1])).filter(item => item.authorization_reference === 'PROTOTYPE-AGENT-ACCEPTANCE-001');
    for (const receipt of receipts) {
      assert.equal(receipt.production_or_professional_approval, false);
      assert.equal(receipt.remote_deployment_authorized, false);
      assert.equal(receipt.reviewer_kind, 'AI_AGENT');
      assert.match(receipt.tested_source_sha, /^[0-9a-f]{40}$/);
      assert.ok(['APPROVED_FOR_DEMO', 'CHANGES_REQUIRED'].includes(receipt.decision));
    }
  });
});
