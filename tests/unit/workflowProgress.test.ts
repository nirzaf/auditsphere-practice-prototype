// MOD-UX-02: workflow progress derivation.
//
// Proves the per-screen tracker answers the six questions honestly: what is
// complete, what is pending, what is blocked, what happens next, who acts next,
// and what is deliberately excluded. Every number must come from the counts the
// module derived — never from a constant.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveWorkflowProgress, tallyFromSteps, stepsFromModel,
  type StepTally, type TrackerStep
} from '../../src/services/workflowProgress.js';
import { LIFECYCLE_MODELS, MODULE_LIFECYCLE_MODEL } from '../../src/services/lifecycle.js';
import { ROUTE_KEYS } from '../../src/types/index.js';

const step = (label: string, state: TrackerStep['state'], extra: Partial<TrackerStep> = {}): TrackerStep =>
  ({ id: label, label, state, ...extra });

const build = (tally: Partial<StepTally>, steps: TrackerStep[] = [], extra: Partial<Parameters<typeof deriveWorkflowProgress>[0]> = {}) =>
  deriveWorkflowProgress({
    title: 'Preparation → Approval',
    tally: { done: 0, current: 0, pending: 0, blocked: 0, ...tally },
    steps,
    ...extra
  });

describe('MOD-UX-02 workflow progress derivation', () => {
  it('reports completion counts and a rounded percentage from the derived tally only', () => {
    const progress = build({ done: 6, current: 1, pending: 2, blocked: 1 });
    assert.equal(progress.completed, 6);
    assert.equal(progress.total, 10);
    assert.equal(progress.percent, 60);
    assert.equal(progress.pending, 2);
    assert.equal(progress.blocked, 1);
    assert.equal(progress.current, 1);
    // The summary must expose every non-zero state, in a fixed order.
    assert.equal(progress.summary, 'Completed 6 / 10 · In progress 1 · Pending 2 · Blocked 1');
  });

  it('omits zero counts so the summary stays readable', () => {
    assert.equal(build({ done: 3, pending: 1 }).summary, 'Completed 3 / 4 · Pending 1');
    assert.equal(build({ done: 4 }).summary, 'Completed 4 / 4');
  });

  it('counts a not-applicable step as budgeted and resolved', () => {
    // A step deliberately scoped out belongs to the journey, so it stays in the
    // denominator, and it needs nothing further, so it also counts as resolved.
    // Ignoring it must not inflate progress; waiving it must not deflate it.
    const progress = build({ done: 3, notApplicable: 2, pending: 1 });
    assert.equal(progress.completed, 5, 'not-applicable steps count as completed work');
    assert.equal(progress.total, 6, 'they remain part of the journey budget');
    assert.equal(progress.percent, 83);
    assert.match(progress.summary, /Not applicable 2/);
  });

  it('reports a fully scoped-out record as complete rather than zero', () => {
    const progress = build({ notApplicable: 4 });
    assert.equal(progress.percent, 100);
    assert.equal(progress.completed, 4);
    assert.equal(progress.total, 4);
    assert.equal(progress.nextAction, 'All steps are complete.');
  });

  it('reports a record with no applicable steps without inventing progress', () => {
    const progress = build({});
    assert.equal(progress.total, 0);
    assert.equal(progress.percent, 100);
    assert.equal(progress.nextAction, 'No workflow steps apply to this record.');
  });

  it('never reports more than 100% or less than 0%', () => {
    assert.equal(build({ done: 5, pending: 5 }).percent, 50);
    // Defensive: a caller that over-counts must not produce a nonsense bar.
    assert.ok(build({ done: 99, pending: 1 }).percent <= 100);
    assert.ok(build({ done: 0, blocked: 0 }).percent >= 0);
  });

  it('names the next action in journey order, with rework and staleness first', () => {
    // Rework outranks everything: returned work that is ignored is the worst case.
    const withRework = build({ done: 2, returned: 1, blocked: 1, current: 1 }, [
      step('Setup', 'done'), step('Preparation', 'done'), step('Review', 'returned'),
      step('Approval', 'blocked', { required: 'Independent reviewer required.' }), step('Completion', 'current')
    ]);
    assert.match(withRework.nextAction, /Rework "Review" and resubmit/);

    const withStale = build({ done: 2, stale: 1, blocked: 1 }, [
      step('Setup', 'done'), step('Preparation', 'done'), step('Review', 'stale'), step('Approval', 'blocked')
    ]);
    assert.match(withStale.nextAction, /Recalculate "Review" from the current source/);

    const blockedOnly = build({ done: 2, blocked: 1 }, [
      step('Setup', 'done'), step('Preparation', 'done'), step('Approval', 'blocked', { required: 'Partner approval required.' })
    ]);
    assert.equal(blockedOnly.nextAction, 'Partner approval required.');

    const working = build({ done: 1, current: 1 }, [step('Setup', 'done'), step('Preparation', 'current')]);
    assert.equal(working.nextAction, 'Continue "Preparation".');

    const notStarted = build({ pending: 2 }, [step('Setup', 'pending'), step('Preparation', 'pending')]);
    assert.equal(notStarted.nextAction, 'Start "Setup".');
  });

  it('states who acts next and whether anything is actionable by the reader', () => {
    const waiting = build({ done: 1, blocked: 1 }, [
      step('Setup', 'done'), step('Approval', 'blocked', { owner: 'Daniel James' })
    ], { blockers: [{ step: 'Approval', reason: 'Needs partner sign-off.', required: 'Partner approval required.', owner: 'Daniel James' }] });
    assert.equal(waiting.nextOwner, 'Daniel James');
    assert.equal(waiting.waitingOnOthers, true, 'a fully blocked record is not actionable by the reader');

    const actionable = build({ done: 1, current: 1 }, [step('Setup', 'done'), step('Preparation', 'current', { owner: 'Adam Khan' })]);
    assert.equal(actionable.nextOwner, 'Adam Khan');
    assert.equal(actionable.waitingOnOthers, false);
  });

  it('carries a precise reason and required action for every blocked step', () => {
    const progress = build({ done: 1, blocked: 1 }, [
      step('Setup', 'done'),
      step('Approval', 'blocked', { reason: 'Source trial balance changed after review.', required: 'Recalculate from the current source.' })
    ]);
    assert.equal(progress.blockers.length, 1, 'a blocked step must produce a blocker explanation');
    assert.match(progress.blockers[0].reason, /Source trial balance changed/);
    assert.match(progress.blockers[0].required, /Recalculate/);
    assert.equal(progress.blockers[0].step, 'Approval');
  });

  it('keeps out-of-scope records out of the numbers, and says so instead', () => {
    const progress = build({ done: 2, pending: 1 }, [], {
      excludedNote: 'Records outside your access scope are not counted in these totals.'
    });
    assert.equal(progress.total, 3, 'only the permitted records contribute');
    assert.match(progress.excludedNote!, /not counted/);
  });

  it('derives a tally from ordered step states without double counting', () => {
    const tally = tallyFromSteps(['done', 'done', 'current', 'pending', 'blocked', 'returned', 'stale', 'not-applicable', 'skipped']);
    assert.deepEqual(tally, { done: 2, current: 1, pending: 1, blocked: 1, returned: 1, stale: 1, notApplicable: 1, skipped: 1 });
    const progress = deriveWorkflowProgress({ title: 'All states', tally, steps: [] });
    assert.equal(progress.total, 9, 'every step is accounted for exactly once');
    assert.equal(progress.completed, 3, 'done plus not-applicable');
    assert.equal(progress.percent, 33);
  });

  it('does not let skipped work raise the completion percentage', () => {
    const honest = deriveWorkflowProgress({ title: 'x', tally: tallyFromSteps(['done', 'pending']), steps: [] });
    const skipped = deriveWorkflowProgress({ title: 'x', tally: tallyFromSteps(['done', 'pending', 'skipped', 'skipped']), steps: [] });
    assert.equal(honest.percent, 50);
    assert.equal(skipped.percent, 25, 'two skipped steps enlarge the journey without counting as progress');
  });

  it('maps a declared lifecycle model onto its steps and defaults missing states to pending', () => {
    const model = LIFECYCLE_MODELS['financial-package'];
    const steps = stepsFromModel(model.steps, { Calculated: 'done', Validated: 'done', 'Partner review': 'current' });
    assert.equal(steps.length, model.steps.length);
    assert.equal(steps[0].state, 'done');
    assert.equal(steps.find(item => item.label === 'Partner review')!.state, 'current');
    assert.equal(steps.find(item => item.label === 'Released')!.state, 'pending', 'an unreported step is pending, never assumed complete');
    // A renamed model step must not inherit another step's state.
    const renamed = stepsFromModel(['Alpha', 'Beta'], { Gamma: 'done' });
    assert.deepEqual(renamed.map(item => item.state), ['pending', 'pending']);
  });

  it('gives every routed module a declared lifecycle model the tracker can use', () => {
    const missing = ROUTE_KEYS.filter(route => !MODULE_LIFECYCLE_MODEL[route]);
    assert.deepEqual(missing, [], `routes without a lifecycle model: ${missing.join(', ')}`);
    for (const route of ROUTE_KEYS) {
      const model = LIFECYCLE_MODELS[MODULE_LIFECYCLE_MODEL[route]];
      // A tracker built from the model must produce a coherent, non-invented tally.
      const progress = deriveWorkflowProgress({
        title: model.title,
        tally: tallyFromSteps(model.steps.map((_, index) => (index === 0 ? 'done' : 'pending'))),
        steps: stepsFromModel(model.steps, { [model.steps[0]]: 'done' })
      });
      assert.equal(progress.total, model.steps.length, `${route} tracker must cover exactly its model steps`);
      assert.equal(progress.completed, 1);
      assert.match(progress.nextAction, /Start "/, `${route} must state the next step to start`);
    }
  });
});
