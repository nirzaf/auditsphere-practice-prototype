// VP-064-AC04: canonical records describe current routes and workflow guidance,
// and never claim live integrations, production readiness or professional assurance.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCurrentWorkflowMatrix } from '../../tools/current-workflow-matrix.js';
import { TARGET_GUIDES, CURRENT_WORKFLOW_ORDER } from '../../src/services/currentWorkflowGuides.js';
import { ROUTE_CATALOG } from '../../src/services/routeCatalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('VP-064 documentation contract', () => {
  it('current workflow guide coverage exactly matches the current route catalogue', () => {
    const catalogRoutes = Object.keys(ROUTE_CATALOG).sort();
    const guideRoutes = TARGET_GUIDES.map(guide => guide.route).sort();
    assert.deepEqual(guideRoutes, catalogRoutes);
    assert.deepEqual([...CURRENT_WORKFLOW_ORDER].sort(), catalogRoutes);
    assert.equal(new Set(guideRoutes).size, guideRoutes.length, 'each current route has exactly one guide');
  });

  it('the generated workflow matrix describes current routes and lifecycle ownership only', () => {
    const matrix = renderCurrentWorkflowMatrix();
    assert.equal(read('docs/prototype/lifecycle-matrix.md'), matrix, 'regenerate with: npx tsx tools/current-workflow-matrix.ts');
    assert.match(matrix, /^# Current workflow and lifecycle matrix/m);
    assert.doesNotMatch(matrix, /MOD-\d{2}|39 modules|Legacy Redirect/);
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
