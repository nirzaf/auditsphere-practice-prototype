// MOD-UX-02: engagement journey derivation.
//
// The tracker on the Engagements screen must reflect the engagement's real
// records. This suite mutates one thing at a time in a real initial state and
// asserts the tracker moves accordingly — so a step can never be reported as
// complete, pending or blocked on the strength of a hard-coded position.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { deriveEngagementJourney } from '../../src/services/engagementJourney.js';
import { LIFECYCLE_MODELS } from '../../src/services/lifecycle.js';
import type { PrototypeState, EngagementRecord } from '../../src/types/index.js';

const MODEL_STEPS = LIFECYCLE_MODELS['audit-engagement'].steps;
let state: PrototypeState;
let eng: EngagementRecord;

const journey = () => deriveEngagementJourney({ state, engagement: eng });
const stepState = (label: string) => journey().steps.find(item => item.label === label)?.state;

beforeEach(() => {
  state = createInitialState() as PrototypeState;
  eng = state.engagements.find(item => item.id === 'ENG-26001')!;
});

describe('MOD-UX-02 engagement journey tracker', () => {
  it('covers exactly the declared engagement lifecycle model', () => {
    const progress = journey();
    assert.deepEqual(progress.steps.map(item => item.label), [...MODEL_STEPS]);
    assert.equal(progress.total, MODEL_STEPS.length);
    assert.match(progress.summary, /^Completed \d+ \/ 8/);
    assert.equal(progress.percent, Math.round((progress.completed / progress.total) * 100));
  });

  it('derives acceptance from the recorded professional acceptance, not the stage label', () => {
    eng.professionalAcceptance = undefined as any;
    eng.stage = 'Review';
    assert.notEqual(stepState('Accepted'), 'done', 'a late stage must not imply acceptance');
    assert.equal(stepState('Accepted'), 'current');
    assert.match(journey().steps[0].required!, /acceptance decision/i);
    eng.professionalAcceptance = { by: 'Daniel James', at: '2026-09-01', evidenceRef: 'ACC-1', proposalRevision: 2 };
    assert.equal(stepState('Accepted'), 'done');
  });

  it('only completes planning on an approved plan revision', () => {
    state.auditPlans = [{ ...(state.auditPlans?.[0] ?? {}), engagementId: eng.id, id: 'PLAN-X', version: 1, status: 'Under review' } as any];
    assert.equal(stepState('Planned'), 'current', 'a plan under review is not approved planning');
    state.auditPlans = [{ ...(state.auditPlans![0]), status: 'Approved' } as any];
    assert.equal(stepState('Planned'), 'done');
  });

  it('blocks planning by name while the engagement is suspended', () => {
    state.auditPlans = [];
    eng.planning = false;
    eng.lifecycleStatus = 'Suspended';
    const planned = journey().steps.find(item => item.label === 'Planned')!;
    assert.equal(planned.state, 'blocked');
    assert.match(planned.reason!, /Suspended/);
    assert.match(planned.required!, /Resume the engagement/);
  });

  it('requires a linked procedure for every identified risk', () => {
    state.auditRisks = [
      { id: 'R-1', engagementId: eng.id, title: 'Revenue cut-off', area: 'Revenue', assertions: ['Cut-off'], description: '', rationale: '', response: '', owner: 'Adam Khan', rating: 'Significant', linkedProcedureIds: [] },
      { id: 'R-2', engagementId: eng.id, title: 'Inventory', area: 'Inventory', assertions: ['Existence'], description: '', rationale: '', response: '', owner: 'Adam Khan', rating: 'Medium', linkedProcedureIds: ['PRC-01'] }
    ] as any;
    const risks = journey().steps.find(item => item.label === 'Risks & programs')!;
    assert.equal(risks.state, 'current');
    assert.match(risks.reason!, /1 identified risk\(s\) have no linked procedure/);
    state.auditRisks = state.auditRisks.map(risk => ({ ...risk, linkedProcedureIds: ['PRC-01'] }));
    assert.equal(stepState('Risks & programs'), 'done');
  });

  it('derives fieldwork from the workpapers actually cleared', () => {
    eng.workpapers = [] as any;
    assert.notEqual(stepState('Fieldwork'), 'done', 'no workpapers is not completed fieldwork');
    eng.workpapers = [
      { id: 'WP-1', title: 'Cash', version: 1, status: 'Cleared' },
      { id: 'WP-2', title: 'Receivables', version: 1, status: 'In progress' }
    ] as any;
    const fieldwork = journey().steps.find(item => item.label === 'Fieldwork')!;
    assert.equal(fieldwork.state, 'current');
    assert.match(fieldwork.reason!, /1 of 2 workpaper\(s\) are not cleared/);
    eng.workpapers = eng.workpapers.map(item => ({ ...item, status: 'Cleared' })) as any;
    assert.equal(stepState('Fieldwork'), 'done');
  });

  it('treats a not-applicable workpaper as resolved rather than outstanding', () => {
    eng.workpapers = [
      { id: 'WP-1', title: 'Cash', version: 1, status: 'Cleared' },
      { id: 'WP-2', title: 'Inventory count', version: 1, status: 'Not applicable' }
    ] as any;
    assert.equal(stepState('Fieldwork'), 'done');
  });

  it('uses the shared release-blocking rule for findings instead of re-deriving it', () => {
    state.findings = [
      { id: 'F-1', engagementId: eng.id, title: 'Cut-off error', disposition: 'Proposed for correction', severity: 'Material' }
    ] as any;
    const findings = journey().steps.find(item => item.label === 'Findings resolved')!;
    assert.equal(findings.state, 'current');
    assert.match(findings.reason!, /block release/);
    // A reasoned waiver is a resolving disposition, so it clears the step.
    state.findings = [{ ...state.findings[0], disposition: 'Uncorrected waived' } as any];
    assert.equal(stepState('Findings resolved'), 'done');
  });

  it('reports a reopened finding review point as returned work', () => {
    state.findings = [{ id: 'F-1', engagementId: eng.id, title: 'Cut-off error', disposition: 'Uncorrected waived', severity: 'Material' }] as any;
    eng.reviews = [
      { id: 'REV-1', wp: 'F-1', subjectType: 'finding', status: 'Reopened', title: 'Cut-off', assigned: 'Adam Khan', due: '2026-09-30', history: [] }
    ] as any;
    const findings = journey().steps.find(item => item.label === 'Findings resolved')!;
    assert.equal(findings.state, 'returned');
    assert.match(findings.required!, /Respond to the reopened review point/);
    // Returned work outranks ordinary progress in the next-action line.
    assert.match(journey().nextAction, /Rework "Findings resolved"/);
  });

  it('derives review clearance from open review points', () => {
    eng.reviews = [{ id: 'REV-1', wp: 'WP-1', status: 'Open', title: 'x', assigned: 'Sara Malik', due: '2026-09-30', history: [] }] as any;
    const review = journey().steps.find(item => item.label === 'Review cleared')!;
    assert.equal(review.state, 'current');
    assert.match(review.reason!, /1 review point\(s\) are not cleared/);
    eng.reviews = [] as any;
    assert.equal(stepState('Review cleared'), 'done');
  });

  it('derives completion from the four recorded sign-offs and names the outstanding owner', () => {
    eng.approvals = { manager: null, client: null, partner: null, eqr: null };
    eng.eqrRequired = true;
    eng.eqrReviewerUserId = 'eqr';
    const completion = journey().steps.find(item => item.label === 'Completion')!;
    assert.equal(completion.state, 'current');
    assert.equal(completion.owner, 'eqr', 'the outstanding EQR reviewer is named as the owner');
    assert.match(completion.required!, /EQR concurrence/);

    const stamp = { by: 'Someone', at: '2026-09-01', generation: eng.generation };
    eng.approvals = { manager: stamp, client: stamp, partner: stamp, eqr: stamp };
    assert.equal(stepState('Completion'), 'done');
  });

  it('derives release from issued releases, a prepared candidate, or archive', () => {
    eng.releases = [] as any;
    eng.candidate = null as any;
    assert.equal(stepState('Released'), 'pending');
    eng.candidate = { generation: eng.generation, preparedAt: '2026-09-01', preparedBy: 'Layla Rahman', manifest: [], sourceVersion: eng.sourceVersion, packageRevision: eng.packageRevision, packageDefinitionId: 'PKG' } as any;
    const released = journey().steps.find(item => item.label === 'Released')!;
    assert.equal(released.state, 'current');
    assert.match(released.required!, /Issue the release/);
    eng.releases = [{ id: 'REL-1', version: 1, generation: eng.generation, releasedAt: '2026-09-02', releasedBy: 'Daniel James', delivered: true, manifest: [] }] as any;
    assert.equal(stepState('Released'), 'done');
  });

  it('stops a cancelled engagement honestly instead of showing permanent pending work', () => {
    // Withhold acceptance and leave planning unreviewed, then cancel: the reader
    // must see that the journey ended, not a list of work nobody will ever do.
    eng.professionalAcceptance = undefined as any;
    eng.planning = false;
    state.auditPlans = [];
    eng.lifecycleStatus = 'Cancelled';
    const progress = journey();
    assert.equal(progress.blocked, 0, 'a terminal engagement has no blocked work left to do');
    assert.match(progress.nextAction, /cannot progress/);
    assert.match(progress.nextAction, /remain available/);
    assert.equal(progress.waitingOnOthers, false);
    assert.ok(progress.steps.some(item => item.state === 'not-applicable'), 'unreachable steps are not applicable, not outstanding');
    assert.equal(progress.percent, 100, 'a journey that ended has no outstanding work to report');
  });

  it('does not erase completed work when the engagement is cancelled', () => {
    // Cancelling must not re-label finished steps as waived: the history of what
    // was actually done has to survive.
    const completedBefore = journey().steps.filter(item => item.state === 'done').map(item => item.label);
    assert.ok(completedBefore.length > 0, 'the fixture starts with completed steps');
    eng.lifecycleStatus = 'Cancelled';
    const completedAfter = journey().steps.filter(item => item.state === 'done').map(item => item.label);
    assert.deepEqual(completedAfter, completedBefore, 'completed steps stay completed after cancellation');
  });

  it('adds an explicit suspension blocker without losing the step states', () => {
    eng.lifecycleStatus = 'Suspended';
    const progress = journey();
    assert.ok(progress.blockers.some(blocker => /Suspended/.test(blocker.reason)), 'the suspension is explained as a blocker');
    assert.match(progress.nextAction.length > 0 ? 'ok' : '', /ok/);
  });

  it('states that records outside the grant are never counted, without reading as a denial', () => {
    const note = journey().excludedNote!;
    assert.match(note, /never counted/);
    // The superuser route sweep asserts that no permitted route claims access was
    // denied, so an honest scope note must not use denial wording.
    assert.doesNotMatch(note, /access denied|outside your access scope/i);
  });

  it('names a section for every step so the reader can navigate to it', () => {
    for (const step of journey().steps) {
      assert.ok(step.targetSection, `step "${step.label}" must name the section it governs`);
    }
  });

  it('never reports a percentage that disagrees with its own counts', () => {
    for (const mutate of [
      () => { eng.professionalAcceptance = undefined as any; },
      () => { eng.lifecycleStatus = 'Cancelled'; },
      () => { eng.workpapers = [] as any; },
      () => { eng.reviews = [{ id: 'R', wp: 'W', status: 'Open', title: 't', assigned: 'a', due: 'd', history: [] }] as any; }
    ]) {
      state = createInitialState() as PrototypeState;
      eng = state.engagements.find(item => item.id === 'ENG-26001')!;
      mutate();
      const progress = journey();
      // `completed` deliberately folds in the not-applicable steps (they need
      // nothing further), so the bucketed sum is the remaining states.
      const remaining = progress.current + progress.pending + progress.blocked + progress.returned + progress.stale;
      assert.equal(progress.total, progress.completed + remaining, 'every step is counted exactly once');
      assert.equal(progress.total, progress.steps.length, 'the total is exactly the number of journey steps');
      assert.equal(progress.percent, Math.round((progress.completed / progress.total) * 100));
    }
  });
});
