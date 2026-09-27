// MOD-UX-02: financial-package journey derivation.
//
// The package tracker drives the accounting journey's last mile, so each step
// must read the record the store actually owns: the saved revision, its
// validation and lineage, the management decision, the generation-bound
// sign-offs and the release records.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { derivePackageJourney } from '../../src/services/packageJourney.js';
import { LIFECYCLE_MODELS } from '../../src/services/lifecycle.js';
import type { PrototypeState, EngagementRecord, FinancialPackageRevision } from '../../src/types/index.js';

const MODEL_STEPS = LIFECYCLE_MODELS['financial-package'].steps;
let state: PrototypeState;
let eng: EngagementRecord;

const journey = () => derivePackageJourney({ state, engagement: eng });
const stepState = (label: string) => journey().steps.find(item => item.label === label)?.state;
const step = (label: string) => journey().steps.find(item => item.label === label)!;

/** A validated revision whose lineage matches the engagement exactly. */
function validatedRevision(overrides: Partial<FinancialPackageRevision> = {}): FinancialPackageRevision {
  const mappingRevision = (state.accountMappingRevisions ?? [])
    .filter(item => item.engagementId === eng.id)
    .sort((a, b) => b.revision - a.revision)[0]?.revision ?? 1;
  return {
    id: `PKG-${eng.id}-1`,
    engagementId: eng.id,
    revision: 1,
    generation: eng.generation,
    sourceVersion: eng.sourceVersion,
    mappingRevision,
    notes: '',
    noteRevision: 1,
    sections: [],
    validation: { passed: true, trialBalanceNet: 0, pendingWorkpapers: 0, openReviews: 0, materialFindings: 0 } as any,
    artifacts: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    createdBy: 'Layla Rahman',
    createdByUserId: 'manager',
    ...overrides
  } as FinancialPackageRevision;
}

beforeEach(() => {
  state = createInitialState() as PrototypeState;
  eng = state.engagements.find(item => item.id === 'ENG-26001')!;
  eng.packageHistory = [];
  eng.packageRevision = 0;
  eng.releases = [] as any;
  eng.candidate = null as any;
  eng.approvals = { manager: null, client: null, partner: null, eqr: null };
  eng.eqrRequired = false;
  eng.managementPackageDecision = undefined as any;
});

describe('MOD-UX-02 financial package journey tracker', () => {
  it('covers exactly the declared package lifecycle model', () => {
    const progress = journey();
    assert.deepEqual(progress.steps.map(item => item.label), [...MODEL_STEPS]);
    assert.equal(progress.total, MODEL_STEPS.length);
    assert.match(progress.summary, /^Completed 0 \/ 6/);
  });

  it('does not claim a calculation that has not been assembled', () => {
    assert.equal(stepState('Calculated'), 'pending');
    assert.match(step('Calculated').required!, /Assemble a package revision/);
    assert.notEqual(stepState('Validated'), 'done', 'an unassembled package cannot be validated');
  });

  it('completes validation only for a passed revision whose lineage is current', () => {
    const revision = validatedRevision();
    state = { ...state };
    eng.packageHistory = [revision];
    assert.equal(stepState('Calculated'), 'done');
    assert.equal(stepState('Validated'), 'done');

    // Advancing the source without re-assembling makes the revision stale.
    eng.sourceVersion = revision.sourceVersion + 1;
    assert.equal(stepState('Validated'), 'stale');
    assert.match(step('Validated').reason!, /was built from source v\d+/);
    assert.match(step('Validated').required!, /Assemble a new revision/);
    assert.match(journey().nextAction, /Recalculate "Validated"/);
  });

  it('explains a failed validation by its blocking counts', () => {
    eng.packageHistory = [validatedRevision({
      validation: { passed: false, trialBalanceNet: 0, pendingWorkpapers: 3, openReviews: 2, materialFindings: 1 } as any
    })];
    const validated = step('Validated');
    assert.equal(validated.state, 'blocked');
    assert.match(validated.reason!, /3 workpaper\(s\) pending, 2 open review\(s\), 1 material finding\(s\)/);
    assert.match(validated.required!, /Clear the outstanding workpapers, reviews and findings/);
    assert.equal(journey().blockers.length, 1, 'a blocked step must explain itself');
  });

  it('requires management acknowledgement against the exact revision', () => {
    const revision = validatedRevision();
    eng.packageHistory = [revision];
    assert.equal(stepState('Management approved'), 'current');
    assert.match(step('Management approved').required!, /Present the package to management/);

    // An acknowledgement for a different revision must not count.
    eng.managementPackageDecision = { decision: 'Acknowledged', by: 'Omar Nasser', byUserId: 'client', at: '2026-09-02', generation: revision.generation, sourceVersion: revision.sourceVersion, packageRevision: 99, rationale: '', evidenceRef: 'E-1' } as any;
    assert.notEqual(stepState('Management approved'), 'done', 'an acknowledgement for another revision is not this revision\'s');

    eng.managementPackageDecision = { ...eng.managementPackageDecision!, packageRevision: revision.revision } as any;
    assert.equal(stepState('Management approved'), 'done');
  });

  it('reports a management rejection as returned work with the recorded rationale', () => {
    const revision = validatedRevision();
    eng.packageHistory = [revision];
    eng.managementPackageDecision = {
      decision: 'Rejected', by: 'Omar Nasser', byUserId: 'client', at: '2026-09-02',
      generation: revision.generation, sourceVersion: revision.sourceVersion, packageRevision: revision.revision,
      rationale: 'Turnover note is incomplete.', evidenceRef: 'E-2'
    } as any;
    const management = step('Management approved');
    assert.equal(management.state, 'returned');
    assert.match(management.reason!, /rejected revision 1/);
    assert.match(management.required!, /assemble the replacement revision, and re-present it/);
    assert.match(journey().nextAction, /Rework "Management approved"/);
  });

  it('derives the review steps from the generation-bound sign-offs', () => {
    const revision = validatedRevision();
    eng.packageHistory = [revision];
    const stamp = { by: 'Sara Malik', at: '2026-09-03', generation: revision.generation };
    eng.approvals.manager = stamp;
    assert.equal(stepState('Accounting reviewed'), 'done');
    assert.equal(stepState('Partner review'), 'current');

    eng.approvals.partner = stamp;
    assert.equal(stepState('Partner review'), 'done');

    // A sign-off from an earlier generation must not count for this revision.
    eng.generation = revision.generation + 1;
    assert.notEqual(stepState('Accounting reviewed'), 'done');
    assert.notEqual(stepState('Partner review'), 'done');
  });

  it('names the EQR reviewer when an EQR concurrence is required and missing', () => {
    const revision = validatedRevision();
    eng.packageHistory = [revision];
    eng.approvals.partner = { by: 'Daniel James', at: '2026-09-03', generation: revision.generation };
    eng.eqrRequired = true;
    eng.eqrReviewerUserId = 'eqr';
    const partner = step('Partner review');
    assert.equal(partner.state, 'current');
    assert.equal(partner.owner, 'eqr');
    assert.match(partner.reason!, /EQR concurrence/);
  });

  it('derives release from the release records and stops the journey once released', () => {
    const revision = validatedRevision();
    eng.packageHistory = [revision];
    assert.equal(stepState('Released'), 'pending');
    eng.candidate = { generation: eng.generation, preparedAt: '2026-09-04', preparedBy: 'Layla Rahman', manifest: [], sourceVersion: eng.sourceVersion, packageRevision: revision.revision, packageDefinitionId: 'PKG' } as any;
    assert.equal(stepState('Released'), 'current');
    assert.match(step('Released').required!, /Issue the release/);
    eng.releases = [{ id: 'REL-1', version: 1, generation: eng.generation, releasedAt: '2026-09-05', releasedBy: 'Daniel James', delivered: true, manifest: [] }] as any;
    assert.equal(stepState('Released'), 'done');
    assert.match(journey().nextAction, /has been released/);
    assert.equal(journey().waitingOnOthers, false);
  });

  it('falls back to the newest saved revision so a stale package still reports its journey', () => {
    eng.packageHistory = [validatedRevision({ revision: 1 }), validatedRevision({ revision: 2, sourceVersion: eng.sourceVersion - 1 })];
    eng.packageRevision = 1; // the engagement points at the older revision
    const progress = journey();
    assert.equal(stepState('Calculated'), 'done');
    assert.match(progress.excludedNote!, /records outside your access scope are never included/);
  });

  it('says so plainly when no package exists, rather than showing a zero silently', () => {
    assert.match(journey().excludedNote!, /No package revision is saved/);
  });

  it('counts every step exactly once and keeps the percentage consistent', () => {
    for (const setup of [
      () => {},
      () => { eng.packageHistory = [validatedRevision()]; },
      () => { eng.packageHistory = [validatedRevision({ validation: { passed: false, pendingWorkpapers: 1, openReviews: 0, materialFindings: 0 } as any })]; },
      () => { eng.packageHistory = [validatedRevision({ sourceVersion: 0 })]; }
    ]) {
      state = createInitialState() as PrototypeState;
      eng = state.engagements.find(item => item.id === 'ENG-26001')!;
      eng.packageHistory = []; eng.packageRevision = 0; eng.releases = [] as any;
      setup();
      const progress = journey();
      const remaining = progress.current + progress.pending + progress.blocked + progress.returned + progress.stale;
      assert.equal(progress.total, progress.completed + remaining, 'every step counted once');
      assert.equal(progress.total, progress.steps.length);
      assert.equal(progress.percent, Math.round((progress.completed / progress.total) * 100));
    }
  });

  it('names a section for every step so the reader can navigate to it', () => {
    for (const item of journey().steps) assert.ok(item.targetSection, `step "${item.label}" must name its section`);
  });
});
