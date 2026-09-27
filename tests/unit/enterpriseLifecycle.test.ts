// MOD-UX-01: shared lifecycle and status semantics.
//
// The prototype stores many different status vocabularies. This suite proves the
// shared presentation layer maps every one of them to a tone with a plain-language
// meaning, never loses the literal status text, and never invents a lifecycle
// model for a module that has none.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  statusSemantics, isActionableStatus, isTerminalStatus, TONE_MEANING,
  LIFECYCLE_MODELS, MODULE_LIFECYCLE_MODEL, lifecycleModelFor, describePackageBlocker
} from '../../src/services/lifecycle.js';
import { canOpenRoute } from '../../src/services/guards.js';
import { ROUTE_KEYS } from '../../src/types/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const TONES = Object.keys(TONE_MEANING);

describe('MOD-UX-01 shared status semantics', () => {
  it('maps every status vocabulary stored in the product onto a known tone', () => {
    // Harvest the literal status unions straight out of the state contract so a
    // newly added status cannot silently render as an unstyled value.
    const types = readFileSync(join(repoRoot, 'src', 'types', 'index.ts'), 'utf8');
    const literals = new Set<string>();
    for (const match of types.matchAll(/(?:status|stage|adequacyStatus|reflectionStatus|decisionStatus|state)\??:\s*([^;]+);/g)) {
      for (const literal of match[1].matchAll(/'([^']+)'/g)) literals.add(literal[1]);
    }
    assert.ok(literals.size > 30, `expected the state contract to declare status vocabularies, found ${literals.size}`);
    const unmapped: string[] = [];
    for (const value of literals) {
      const semantic = statusSemantics(value);
      if (!TONES.includes(semantic.tone)) unmapped.push(`${value} → ${semantic.tone}`);
      if (semantic.label !== value) unmapped.push(`${value} lost its literal text (got ${semantic.label})`);
      if (!semantic.meaning || semantic.meaning.length < 10) unmapped.push(`${value} has no plain-language meaning`);
    }
    assert.deepEqual(unmapped, [], `every stored status must map to a tone with a meaning: ${unmapped.join('; ')}`);
  });

  it('keeps colour from being the only signal and preserves the literal label', () => {
    for (const status of ['Draft', 'In review', 'Returned', 'Stale', 'Approved', 'Archived', 'Simulated verified']) {
      const semantic = statusSemantics(status);
      assert.equal(semantic.label, status, `${status} must render its literal text`);
      assert.ok(semantic.meaning.length > 10, `${status} must carry explanatory text`);
    }
    // Unknown statuses degrade safely rather than rendering nothing.
    const unknown = statusSemantics('Some Future Status');
    assert.equal(unknown.label, 'Some Future Status');
    assert.equal(unknown.tone, 'neutral');
    // A missing status is explicit instead of blank.
    assert.equal(statusSemantics('').label, 'Not set');
    assert.equal(statusSemantics(undefined).label, 'Not set');
  });

  it('separates "needs a human" from "journey is over"', () => {
    assert.equal(isActionableStatus('In review'), true, 'a review decision still needs someone');
    assert.equal(isActionableStatus('Approved'), false, 'an approved revision needs nobody');
    assert.equal(isActionableStatus('Draft'), true);
    assert.equal(isTerminalStatus('Archived'), true);
    assert.equal(isTerminalStatus('Cancelled'), true);
    assert.equal(isTerminalStatus('Rejected'), true);
    assert.equal(isTerminalStatus('Approved'), false, 'an approval can still be amended or superseded');
    assert.equal(isTerminalStatus('Draft'), false);
    // Terminal states are never also advertised as actionable.
    for (const status of ['Archived', 'Cancelled', 'Rejected', 'Withdrawn', 'Expired', 'Revoked', 'Declined']) {
      assert.equal(isActionableStatus(status), false, `${status} must not look actionable`);
      assert.equal(isTerminalStatus(status), true, `${status} must read as terminal`);
    }
  });

  it('gives every routed module a lifecycle model without inventing steps', () => {
    const missing = ROUTE_KEYS.filter(route => !MODULE_LIFECYCLE_MODEL[route]);
    assert.deepEqual(missing, [], `every supported route needs a declared lifecycle model: ${missing.join(', ')}`);
    for (const route of ROUTE_KEYS) {
      const model = lifecycleModelFor(route);
      assert.ok(model.steps.length >= 3, `${route} lifecycle must have a meaningful number of steps`);
      assert.ok(model.title.length > 10, `${route} lifecycle needs a readable title`);
      assert.equal(LIFECYCLE_MODELS[model.id], model, `${route} must reference a declared model`);
    }
    // The models are genuinely different per domain, not one universal machine.
    assert.notDeepEqual(LIFECYCLE_MODELS['request-response'].steps, LIFECYCLE_MODELS['financial-package'].steps);
    assert.notDeepEqual(LIFECYCLE_MODELS['consolidation-run'].steps, LIFECYCLE_MODELS['record-approval'].steps);
  });

  it('scopes lifecycle metadata to routes that can actually be opened', () => {
    // A lifecycle model may not advertise a module no persona can reach.
    const roles = ['superuser', 'partner', 'manager', 'reviewer', 'preparer', 'eqr', 'relationship',
      'onboarding', 'compliance', 'billing', 'records', 'admin', 'client_admin', 'client_finance', 'client'];
    const unreachable = ROUTE_KEYS.filter(route =>
      !roles.some(role => canOpenRoute(role as any, route as any, true)));
    assert.deepEqual(unreachable, [], `lifecycle models exist for unreachable routes: ${unreachable.join(', ')}`);
    // Every persona must be able to reach something, or the product is unusable for it.
    const stranded = roles.filter(role => !ROUTE_KEYS.some(route => canOpenRoute(role as any, route as any, true)));
    assert.deepEqual(stranded, [], `personas with no reachable route: ${stranded.join(', ')}`);
  });

  it('explains stale, returned and terminal blockers precisely', () => {
    const stale = describePackageBlocker({ status: 'Stale', sourceLabel: 'Revision 4', currentSourceLabel: 'Revision 5' });
    assert.ok(stale, 'a stale output must produce a blocker');
    assert.equal(stale!.tone, 'stale');
    assert.match(stale!.why, /Revision 4 → Revision 5/, 'the exact source movement must be named');
    assert.ok(stale!.affected.length >= 2, 'the affected downstream items must be listed');
    assert.match(stale!.required, /Recalculate/, 'the required action must be stated');

    const returned = describePackageBlocker({ status: 'Returned' });
    assert.equal(returned?.tone, 'waiting');
    assert.match(returned!.required, /resubmit/i, 'rework must state the resubmission path');

    const cancelled = describePackageBlocker({ status: 'Cancelled' });
    assert.equal(cancelled?.tone, 'blocked');
    assert.match(cancelled!.required, /new record|history/i, 'terminal states must state the recovery path');

    // A healthy record reports no blocker at all rather than a false alarm.
    assert.equal(describePackageBlocker({ status: 'Approved' }), null);
    assert.equal(describePackageBlocker({ status: 'Draft' }), null);
    assert.equal(describePackageBlocker({}), null);
  });

  it('renders the shared stale notice with every lifecycle answer the reader needs', async () => {
    // Rendered through react-dom/server so the shipped component, not a copy of
    // its markup, is what the browser will produce.
    const { renderToStaticMarkup } = await import('react-dom/server');
    const React = (await import('react')).default;
    const { StaleNotice, BlockerNotice, LifecycleStepper, StatusBadge, ListState } = await import('../../src/components/common/Enterprise.js');
    const html = renderToStaticMarkup(React.createElement(StaleNotice, {
      sourceLabel: 'Revision 4',
      currentSourceLabel: 'Revision 5',
      affected: ['Mapping review', 'Package approval'],
      preserved: 'Partner approval of Revision 4 remains in history.',
      required: 'Recalculate and review Revision 5.'
    }));
    assert.match(html, /Revision 4 → Revision 5/, 'the exact source movement must be visible');
    assert.match(html, /Mapping review/, 'affected downstream items must be listed');
    assert.match(html, /remains in history/, 'preserved history must be stated, not implied');
    assert.match(html, /Recalculate and review Revision 5/, 'the required action must be stated');
    assert.match(html, /role="status"/, 'the notice must announce itself to assistive technology');

    // A returned record names the rework path rather than a bare "Returned".
    const returned = renderToStaticMarkup(React.createElement(BlockerNotice, {
      tone: 'waiting', title: 'Returned for rework', why: 'A reviewer returned this revision with a reason.',
      required: 'Resolve the comments and resubmit a new revision.'
    }));
    assert.match(returned, /Returned for rework/);
    assert.match(returned, /resubmit a new revision/);

    // The stepper marks completed, current and blocked steps distinguishably.
    const stepper = renderToStaticMarkup(React.createElement(LifecycleStepper, {
      title: 'Prepare → approve', steps: [
        { id: 'a', label: 'Draft', state: 'done' },
        { id: 'b', label: 'In review', state: 'current', owner: 'Sara Malik' },
        { id: 'c', label: 'Approved', state: 'blocked', reason: 'Independent reviewer required' }
      ]
    }));
    for (const state of ['done', 'current', 'blocked']) assert.match(stepper, new RegExp(`lifecycle-node ${state}`), `${state} must be a distinct rendered state`);
    assert.match(stepper, /Sara Malik/, 'the current step must name who it is waiting on');
    assert.match(stepper, /Independent reviewer required/, 'a blocked step must state why');

    // A list state distinguishes the three different kinds of empty.
    assert.match(renderToStaticMarkup(React.createElement(ListState, { kind: 'empty' })), /No records yet/);
    assert.match(renderToStaticMarkup(React.createElement(ListState, { kind: 'no-match' })), /No records match these filters/);
    assert.match(renderToStaticMarkup(React.createElement(ListState, { kind: 'scoped' })), /outside your current scope|No records are available in your current scope/);

    // A status carries its literal text plus an accessible reading of the state.
    const badge = renderToStaticMarkup(React.createElement(StatusBadge, { status: 'In review', explain: true }));
    assert.match(badge, />In review</, 'the literal status must remain the visible text');
    assert.match(badge, /aria-label="In review\. /, 'the accessible name must explain the state');
    assert.match(badge, /data-status-tone="review"/, 'the tone must be published');
  });
});
