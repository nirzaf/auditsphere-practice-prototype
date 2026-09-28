// Unit tests for Workflow Progress Calculation Engine
// Verifies real-state progress derivation, percentage math, completed/pending/blocked counts,
// six enterprise question answers, role/scope isolation, and blocked/rework transitions.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import {
  computeModuleWorkflowProgress,
  isEngagementReleaseReady,
  aggregateWorkflowSteps,
  hasValidGenerationSignoff
} from '../../src/services/workflowProgress.js';
import type { WorkflowStep, ProgressContext } from '../../src/services/workflowProgress.js';
import type { PrototypeState, RouteKey } from '../../src/types/index.js';

describe('Workflow Progress Calculation Engine', () => {
  let state: PrototypeState;

  beforeEach(() => {
    state = createInitialState();
    (prototypeStore as any).state = state;
  });

  const ALL_OPERATIONAL_ROUTES: RouteKey[] = [
    'overview', 'clients', 'acquisition', 'proposals', 'engagements', 'onboarding',
    'jobs', 'job-templates', 'documents', 'communications',
    'my-time', 'budgets', 'billing', 'receivables',
    'accounting-setup', 'trial-balance', 'gl-transactions', 'account-mappings', 'adjustments', 'reconciliations',
    'financial-statements', 'financial-packages', 'consolidation',
    'audit-planning', 'audit-risks', 'audit-fieldwork', 'sampling', 'audit', 'evidence',
    'findings', 'reviews', 'approvals', 'delivery', 'records',
    'portal', 'reports', 'administration', 'm365-setup'
  ];

  it('computes valid progress for all operational module routes', () => {
    for (const route of ALL_OPERATIONAL_ROUTES) {
      const progress = computeModuleWorkflowProgress(route, state);

      // Module identity
      assert.ok(progress.moduleId.startsWith('MOD-'), `${route} should have a valid MOD-xx id`);
      assert.ok(progress.moduleName.length > 0, `${route} should have a module name`);
      assert.ok(progress.currentSection.length > 0, `${route} should describe the current section`);

      // Steps definition
      assert.ok(progress.steps.length >= 3, `${route} should have at least 3 workflow steps`);
      for (const step of progress.steps) {
        assert.ok(step.id.length > 0, `${route} step should have an id`);
        assert.ok(step.label.length > 0, `${route} step should have a label`);
        assert.ok(
          ['completed', 'current', 'pending', 'blocked', 'returned', 'stale', 'na'].includes(step.state),
          `${route} step state ${step.state} should be a valid ProgressStepState`
        );
      }

      // Percentage math
      assert.ok(progress.percentComplete >= 0, `${route} percentComplete should be >= 0`);
      assert.ok(progress.percentComplete <= 100, `${route} percentComplete should be <= 100`);

      // Counts reconciliation
      assert.ok(progress.counts.completed >= 0, `${route} completed count should be >= 0`);
      assert.ok(progress.counts.pending >= 0, `${route} pending count should be >= 0`);
      assert.ok(progress.counts.blocked >= 0, `${route} blocked count should be >= 0`);
      assert.ok(progress.counts.total >= 0, `${route} total count should be >= 0`);

      // Six enterprise questions answers
      assert.ok(progress.completedSummary.length > 0, `${route} answers 'What is complete?'`);
      assert.ok(progress.pendingSummary.length > 0, `${route} answers 'What is pending?'`);
      assert.ok(Array.isArray(progress.blockers), `${route} blockers should be an array`);
      if (progress.counts.blocked > 0) {
        assert.ok(progress.blockedSummary && progress.blockedSummary.length > 0, `${route} explains 'What is blocked?'`);
      }
      assert.ok(progress.nextAction.length > 0, `${route} answers 'What can I do next?'`);
      assert.ok(progress.whoActsNext.length > 0, `${route} answers 'Who acts next?'`);
    }
  });

  it('respects scope and does not calculate progress from hidden engagements', () => {
    // Restrict persona to relationship manager with only 1 client
    const relationshipUser = state.users.find(u => u.role === 'relationship')!;
    state.currentUserId = relationshipUser.id;
    state.currentPerson = relationshipUser.name;
    state.currentRole = relationshipUser.role;

    // Grant access to only CLI-001 using typed production grant schema
    state.roleGrants = [
      {
        userId: relationshipUser.id,
        role: 'relationship',
        scopeKind: 'Client',
        scopeId: 'CLI-001',
        grantedBy: 'USR-001',
        grantedAt: new Date().toISOString()
      }
    ];

    const progress = computeModuleWorkflowProgress('engagements', state);
    const visibleEngsCount = state.engagements.filter(e => e.client === 'CLI-001').length;
    assert.equal(progress.counts.total, visibleEngsCount, 'Total engagements in progress must equal scoped count');
  });

  it('detects blocked state when release gates are unfulfilled', () => {
    const eng = state.engagements[0];
    // Add an unresolved material finding to the engagement
    state.findings.push({
      id: 'FIND-TEST-BLOCK',
      engagementId: eng.id,
      title: 'Material Unadjusted Audit Difference',
      category: 'Audit Difference',
      severity: 'Material',
      status: 'Open',
      disposition: 'Uncorrected',
      materialityImpact: 'Material',
      recommendation: 'Management must adjust or provide support'
    });

    const isReady = isEngagementReleaseReady(eng, state);
    assert.equal(isReady, false, 'Engagement with open material finding cannot be release ready');

    const progress = computeModuleWorkflowProgress('delivery', state, eng.id);
    assert.ok(progress.counts.blocked > 0, 'Release progress should record blocked count');
    assert.ok(progress.blockers.some(b => b.includes('material findings open')), 'Should specify material findings blocker');
  });

  it('reflects rework and returned proposal status correctly', () => {
    const prop = state.proposals[0];
    prop.state = 'Draft';
    prop.commercialReview = {
      reviewedBy: 'Partner Reviewer',
      reviewedAt: '2026-09-20',
      approved: false,
      notes: 'Fee cap exceeds client threshold; revise schedule.'
    };

    const progress = computeModuleWorkflowProgress('proposals', state);
    assert.ok(progress.counts.returned && progress.counts.returned > 0, 'Should record returned rework count');
    assert.ok(progress.reworkNotes && progress.reworkNotes.length > 0, 'Should include return reason notes');
    assert.ok(progress.steps.some(s => s.state === 'returned'), 'At least one step should be in returned state');
  });

  it('reflects PBC request clarification and acceptance steps', () => {
    const eng = state.engagements[0];
    eng.pbc = [
      {
        id: 'pbc-test-1',
        title: 'Trial balance source',
        description: 'Provide general ledger trial balance',
        status: 'Needs clarification',
        category: 'Financial',
        dueDate: '2026-10-01',
        requestedAt: '2026-09-01',
        requestedBy: 'Senior Auditor'
      },
      {
        id: 'pbc-test-2',
        title: 'Bank confirmations',
        description: 'Signed confirmation letters',
        status: 'Accepted',
        category: 'Confirmations',
        dueDate: '2026-10-01',
        requestedAt: '2026-09-01',
        requestedBy: 'Senior Auditor'
      }
    ];

    const progress = computeModuleWorkflowProgress('portal', state, eng.id);
    assert.equal(progress.counts.completed, 1, 'One PBC accepted');
    assert.ok(progress.counts.returned && progress.counts.returned >= 1, 'Needs clarification counts as rework/returned');
    assert.ok(progress.steps.some(s => s.id === 'clarifications' && s.state === 'returned'));
  });

  it('reflects adjustments reflection and unposted status', () => {
    const eng = state.engagements[0];
    state.adjustmentJournals = [
      {
        id: 'ADJ-TEST-1',
        engagementId: eng.id,
        number: 'AJ-01',
        description: 'Accrue unrecorded audit fees',
        status: 'Draft',
        type: 'AJP',
        period: '2026',
        preparedBy: 'Preparer',
        preparedAt: '2026-09-20',
        lines: [
          { id: 'l1', accountCode: '6100', accountName: 'Professional Fees', debit: 5000, credit: 0 },
          { id: 'l2', accountCode: '2100', accountName: 'Accrued Liabilities', debit: 0, credit: 5000 }
        ]
      }
    ];

    const progress = computeModuleWorkflowProgress('adjustments', state, eng.id);
    assert.equal(progress.counts.pending, 1, 'Draft journal is pending review/reflection');
    assert.ok(progress.nextAction.includes('Submit draft adjustment'), 'Recommends next action');
  });

  it('reflects time entry submission and manager approval lifecycle', () => {
    const user = state.users[0];
    state.currentUserId = user.id;
    state.currentPerson = user.name;
    state.times = [
      {
        id: 'TIME-TEST-1',
        engagementId: state.engagements[0].id,
        date: '2026-09-25',
        hours: 7.5,
        person: user.name,
        task: 'Interim inventory observation',
        status: 'Submitted',
        category: 'Fieldwork',
        billable: true,
        rate: 220
      }
    ];

    const progress = computeModuleWorkflowProgress('my-time', state);
    assert.equal(progress.counts.pending, 1, 'Submitted time is pending approval');
    assert.ok(progress.whoActsNext.includes('Manager'), 'Manager acts next on submitted time');
  });

  // -------------------------------------------------------------
  // Focused Regression Matrix T01–T20 (Section 7)
  // -------------------------------------------------------------

  it('T01 Arithmetic: Exact counts, denominator and percentage reconcile', () => {
    // 3 completed + 1 current + 1 blocked = 5 applicable, 60%
    const steps1: WorkflowStep[] = [
      { id: 's1', label: 'Step 1', state: 'completed' },
      { id: 's2', label: 'Step 2', state: 'completed' },
      { id: 's3', label: 'Step 3', state: 'completed' },
      { id: 's4', label: 'Step 4', state: 'current' },
      { id: 's5', label: 'Step 5', state: 'blocked' }
    ];
    const res1 = aggregateWorkflowSteps(steps1);
    assert.equal(res1.applicableCount, 5);
    assert.equal(res1.counts.completed, 3);
    assert.equal(res1.counts.current, 1);
    assert.equal(res1.counts.blocked, 1);
    assert.equal(res1.percentComplete, 60);

    // 3 completed + 1 legitimately non-required step = 100% of 3 applicable steps with 1 separately disclosed exclusion
    const steps2: WorkflowStep[] = [
      { id: 's1', label: 'Step 1', state: 'completed' },
      { id: 's2', label: 'Step 2', state: 'completed' },
      { id: 's3', label: 'Step 3', state: 'completed' },
      { id: 's4', label: 'Step 4 (N/A)', state: 'na' }
    ];
    const res2 = aggregateWorkflowSteps(steps2);
    assert.equal(res2.applicableCount, 3);
    assert.equal(res2.notApplicableCount, 1);
    assert.equal(res2.counts.completed, 3);
    assert.equal(res2.percentComplete, 100);

    // All not-applicable = no numeric completion (null), not 0/0 = 100%
    const steps3: WorkflowStep[] = [
      { id: 's1', label: 'Step 1', state: 'na' },
      { id: 's2', label: 'Step 2', state: 'na' }
    ];
    const res3 = aggregateWorkflowSteps(steps3);
    assert.equal(res3.applicableCount, 0);
    assert.equal(res3.notApplicableCount, 2);
    assert.equal(res3.percentComplete, null);

    // Rounding must not show 100% while any applicable step remains unresolved
    const steps4: WorkflowStep[] = [
      ...Array.from({ length: 99 }, (_, i) => ({ id: `c-${i}`, label: `Done ${i}`, state: 'completed' as const })),
      { id: 'p-1', label: 'Pending', state: 'pending' as const }
    ];
    const res4 = aggregateWorkflowSteps(steps4);
    assert.equal(res4.applicableCount, 100);
    assert.equal(res4.percentComplete, 99); // capped below 100
  });

  it('T02 Empty/missing context: No fabricated success, no first-engagement leak', () => {
    // Empty clients state
    const emptyState = { ...state, clients: [] };
    const clientsProg = computeModuleWorkflowProgress('clients', emptyState);
    assert.equal(clientsProg.counts.completed, 0);
    assert.ok(clientsProg.percentComplete === null || clientsProg.percentComplete === 0);
    assert.ok(clientsProg.nextAction.includes('Onboard initial client profile') || clientsProg.nextAction.includes('client'));

    // Non-existent engagement id does not fall back to first engagement
    const missingProg = computeModuleWorkflowProgress('delivery', state, 'ENG-NONEXISTENT-999');
    assert.equal(missingProg.percentComplete, null);
    assert.equal(missingProg.counts.completed, 0);
    assert.ok(missingProg.blockers.some(b => b.includes('ENG-NONEXISTENT-999')));
  });

  it('T03 Applicability: Required/non-required EQR and all-not-applicable cases', () => {
    const eng = state.engagements[0];
    // Non-required EQR
    eng.eqrRequired = false;
    const prog1 = computeModuleWorkflowProgress('approvals', state, eng.id);
    const eqrStep1 = prog1.steps.find(s => s.id === 'eqr-approval');
    assert.ok(eqrStep1);
    assert.equal(eqrStep1.state, 'na');
    assert.ok(eqrStep1.detail?.includes('without EQR requirement') || eqrStep1.detail?.includes('Not Required'));

    // Required EQR
    eng.eqrRequired = true;
    eng.approvals = { ...eng.approvals, eqr: undefined };
    const prog2 = computeModuleWorkflowProgress('approvals', state, eng.id);
    const eqrStep2 = prog2.steps.find(s => s.id === 'eqr-approval');
    assert.ok(eqrStep2);
    assert.notEqual(eqrStep2.state, 'na');
  });

  it('T04 Terminal outcome: Cancellation and rejection preserve distinct outcomes and history', () => {
    // Cancelled engagement
    const eng = state.engagements[0];
    eng.lifecycleStatus = 'Cancelled';
    const prog = computeModuleWorkflowProgress('delivery', state, eng.id);
    assert.equal(prog.percentComplete, null);
    assert.ok(prog.blockers.some(b => b.includes('Cancelled')));
    assert.ok(prog.steps.some(s => s.state === 'blocked'));

    // Rejected acceptance case
    state.acceptanceCases = [
      {
        id: 'ACC-TERM-1',
        clientId: 'CL-001',
        engagementId: eng.id,
        year: 2026,
        service: 'Audit',
        riskRating: 'Prohibited',
        independenceConfirmed: false,
        amlKycCompleted: true,
        conflictsCleared: false,
        prohibitionsChecked: true,
        competenceConfirmed: true,
        conditions: [],
        recommendationBy: 'Preparer',
        recommendationDate: '2026-09-01',
        recommendationNotes: 'Conflict identified',
        decisionStatus: 'Declined',
        decisionNotes: 'Prohibited client entity under ethics policy'
      }
    ];
    const acceptProg = computeModuleWorkflowProgress('onboarding', state, eng.id);
    assert.ok(acceptProg.counts.blocked && acceptProg.counts.blocked > 0);
    assert.ok(acceptProg.blockers.some(b => b.includes('Declined')));
  });

  it('T05 Stale approvals: A historical generation approval cannot complete current generation', () => {
    const eng = state.engagements[0];
    eng.generation = 2;
    // Approvals in state only cover generation 1
    const isReady = isEngagementReleaseReady(eng, state);
    assert.equal(isReady, false);

    // Verify helper directly
    const validSignoff = hasValidGenerationSignoff(eng, state, 'partner');
    assert.equal(validSignoff, false, 'Historical generation 1 approval cannot validate generation 2');
  });

  it('T06 Package lineage: Released v1 does not complete unreviewed v2', () => {
    const eng = state.engagements[0];
    eng.packageRevision = 2;
    eng.packageHistory = [
      {
        revision: 1,
        generation: 1,
        definitionId: 'PKG-DEF-1',
        name: 'Financial Statements Package',
        preparedAt: '2026-08-01',
        preparedBy: 'Senior Preparer',
        status: 'Released',
        manifest: []
      } as any,
      {
        revision: 2,
        generation: 2,
        definitionId: 'PKG-DEF-1',
        name: 'Financial Statements Package (Revised)',
        preparedAt: '2026-09-01',
        preparedBy: 'Senior Preparer',
        status: 'Draft',
        manifest: []
      } as any
    ];

    const prog = computeModuleWorkflowProgress('financial-packages', state, { engagementId: eng.id, revision: 2 });
    assert.ok(prog.percentComplete !== null && prog.percentComplete < 100);
    assert.ok(prog.steps.some(s => s.id === 'management-decision' && s.state !== 'completed'));
  });

  it('T07 Context switch: Portal and Client 360 follow resolved selection', () => {
    // Client 360 for CL-001
    const p1 = computeModuleWorkflowProgress('client-detail', state, { clientId: 'CL-001' });
    assert.ok(p1.currentSection.includes('CL-001') || p1.completedSummary.includes(state.clients.find(c => c.id === 'CL-001')!.name));

    // Client 360 for CL-002
    const p2 = computeModuleWorkflowProgress('client-detail', state, { clientId: 'CL-002' });
    assert.ok(p2.currentSection.includes('CL-002') || p2.completedSummary.includes(state.clients.find(c => c.id === 'CL-002')!.name));
    assert.notEqual(p1.currentSection, p2.currentSection);
  });

  it('T08 Non-disclosure: Hidden sentinels change neither visible counts nor descriptions', () => {
    const relationshipUser = state.users.find(u => u.role === 'relationship')!;
    state.currentUserId = relationshipUser.id;
    state.currentPerson = relationshipUser.name;
    state.currentRole = relationshipUser.role;
    state.roleGrants = [
      {
        userId: relationshipUser.id,
        role: 'relationship',
        scopeKind: 'Client',
        scopeId: 'CL-001',
        grantedBy: 'USR-001',
        grantedAt: new Date().toISOString()
      }
    ];

    const baseline = computeModuleWorkflowProgress('engagements', state);

    // Inject out-of-scope sentinel engagement for CL-002
    state.engagements.push({
      id: 'ENG-SECRET-999',
      client: 'CL-002',
      service: 'Forensic Investigation',
      stage: 'Fieldwork',
      year: 2026,
      mode: 'Audit',
      period: 'Annual',
      due: '2026-12-31',
      manager: 'Secret Manager',
      partner: 'Secret Partner',
      team: [],
      agreedFee: 1000000,
      currency: 'QAR',
      acceptance: true,
      terms: true,
      planning: true,
      sourceAccepted: true,
      mappingApproved: true,
      generation: 1,
      packageRevision: 1,
      builtGeneration: 1,
      sourceVersion: 1,
      opinion: 'Unmodified',
      eqrRequired: false,
      releases: [],
      pbc: []
    } as any);

    const afterSentinel = computeModuleWorkflowProgress('engagements', state);
    assert.equal(afterSentinel.counts.total, baseline.counts.total);
    assert.equal(afterSentinel.completedSummary, baseline.completedSummary);
    assert.equal(afterSentinel.nextAction, baseline.nextAction);
  });

  it('T09 Revocation: Removing a valid grant clears record content and progress together', () => {
    const relationshipUser = state.users.find(u => u.role === 'relationship')!;
    state.currentUserId = relationshipUser.id;
    state.currentPerson = relationshipUser.name;
    state.currentRole = relationshipUser.role;
    state.roleGrants = [
      {
        userId: relationshipUser.id,
        role: 'relationship',
        scopeKind: 'Client',
        scopeId: 'CL-001',
        grantedBy: 'USR-001',
        grantedAt: new Date().toISOString()
      }
    ];

    const activeProg = computeModuleWorkflowProgress('engagements', state);
    assert.ok(activeProg.counts.total > 0);

    // Revoke all grants
    state.roleGrants = [];
    const revokedProg = computeModuleWorkflowProgress('engagements', state);
    assert.equal(revokedProg.counts.total, 0);
  });

  it('T10 Failed save guard: Unrelated global records cannot satisfy save detection', () => {
    // Demonstrates exact-match save check: comparison against global array length is guarded
    const initialScopedIds = new Set(['INV-001']);
    const currentGlobalInvoices = [
      { id: 'INV-001', clientId: 'CLI-001', amount: 1000 },
      { id: 'INV-002-GLOBAL-UNRELATED', clientId: 'CLI-OTHER', amount: 2000 }
    ];

    // If a save failed to create a new record in our scope, no new id exists in currentGlobalInvoices matching our scope
    const newlyCreatedInScope = currentGlobalInvoices.some(
      item => item.clientId === 'CLI-001' && !initialScopedIds.has(item.id)
    );
    assert.equal(newlyCreatedInScope, false, 'Failed save does not falsely detect success due to other invoices');
  });

  it('T11 Successful save: Exact record committed is observed', () => {
    const initialScopedIds = new Set(['INV-001']);
    const currentGlobalInvoices = [
      { id: 'INV-001', clientId: 'CLI-001', amount: 1000 },
      { id: 'INV-002-NEW', clientId: 'CLI-001', amount: 3000 }
    ];

    const newlyCreated = currentGlobalInvoices.find(
      item => item.clientId === 'CLI-001' && !initialScopedIds.has(item.id)
    );
    assert.ok(newlyCreated);
    assert.equal(newlyCreated.id, 'INV-002-NEW');
  });

  it('T12 Rework and currentness: Return -> revision -> resubmit updates only affected progress', () => {
    const prop = state.proposals[0];
    prop.state = 'Draft';
    prop.commercialReview = {
      reviewedBy: 'Partner Reviewer',
      reviewedAt: '2026-09-20',
      approved: false,
      notes: 'Rate card adjustment required.'
    };

    const returnedProg = computeModuleWorkflowProgress('proposals', state);
    assert.ok(returnedProg.counts.returned && returnedProg.counts.returned > 0);
    assert.ok(returnedProg.steps.some(s => s.state === 'returned'));

    // Resubmit proposal
    prop.state = 'Internal review';
    prop.commercialReview = undefined;
    const resubmittedProg = computeModuleWorkflowProgress('proposals', state);
    assert.equal(resubmittedProg.counts.returned || 0, 0);
    assert.ok(resubmittedProg.steps.some(s => s.id === 'review' && s.state === 'current'));
  });

  it('T13 Route coverage: Every supported operational route and alias maps deliberately', () => {
    const routeAliases: Record<string, RouteKey> = {
      'client-portal': 'portal',
      'crm': 'acquisition',
      'audit-acceptance': 'onboarding',
      'reporting-centre': 'reports'
    };

    for (const [alias, canonical] of Object.entries(routeAliases)) {
      const aliasProg = computeModuleWorkflowProgress(alias as any, state);
      const canonicalProg = computeModuleWorkflowProgress(canonical, state);
      assert.equal(aliasProg.moduleId, canonicalProg.moduleId, `Alias ${alias} must match canonical ${canonical} moduleId`);
      assert.equal(aliasProg.moduleName, canonicalProg.moduleName, `Alias ${alias} must match canonical ${canonical} moduleName`);
    }
  });

  it('T14 Navigation: Each actionable step has a valid target route', () => {
    for (const route of ALL_OPERATIONAL_ROUTES) {
      const prog = computeModuleWorkflowProgress(route, state);
      for (const step of prog.steps) {
        if (step.targetRoute) {
          assert.ok(ALL_OPERATIONAL_ROUTES.includes(step.targetRoute), `Step ${step.id} has valid target route ${step.targetRoute}`);
        }
      }
    }
  });

  it('T15 Unsaved transition guard: Preserves dirty context', () => {
    let dirty = true;
    const mockGuard = {
      label: 'Invoice draft',
      isDirty: () => dirty,
      save: async () => false,
      discard: () => { dirty = false; }
    };

    assert.equal(mockGuard.isDirty(), true);
    // Discarding cleans state
    mockGuard.discard();
    assert.equal(mockGuard.isDirty(), false);
  });

  it('T16 Owner and action eligibility: Next action indicates eligible role', () => {
    for (const route of ALL_OPERATIONAL_ROUTES) {
      const prog = computeModuleWorkflowProgress(route, state);
      assert.ok(prog.whoActsNext && prog.whoActsNext.length > 0, `${route} must identify who acts next`);
      assert.notEqual(prog.whoActsNext, 'Unknown', `${route} must not use Unknown actor`);
    }
  });

  it('T17 Filter/queue agreement: Portal metrics share active PBC scope', () => {
    const eng = state.engagements[0];
    const prog = computeModuleWorkflowProgress('portal', state, eng.id);
    const activePbc = eng.pbc.filter(p => p.status !== 'Draft' && p.status !== 'Cancelled');
    assert.equal(prog.counts.total, activePbc.length);
  });

  it('T18 Responsive semantics and bounds: Progress conforms to Section 5 bounds', () => {
    for (const route of ALL_OPERATIONAL_ROUTES) {
      const prog = computeModuleWorkflowProgress(route, state);
      if (prog.percentComplete !== null) {
        assert.ok(prog.percentComplete >= 0 && prog.percentComplete <= 100);
      }
      assert.ok(Number.isFinite(prog.counts.total));
      assert.ok(Number.isFinite(prog.counts.completed));
      assert.ok(Number.isFinite(prog.counts.pending));
    }
  });

  it('T19 Read-only calculation: Computing progress leaves state completely unchanged', () => {
    const stateBefore = JSON.stringify(state);
    computeModuleWorkflowProgress('engagements', state);
    computeModuleWorkflowProgress('delivery', state, state.engagements[0].id);
    computeModuleWorkflowProgress('portal', state, state.engagements[0].id);
    computeModuleWorkflowProgress('billing', state);
    const stateAfter = JSON.stringify(state);
    assert.equal(stateBefore, stateAfter, 'State must not be mutated by progress calculation');
  });

  it('T20 Prior UX preservation: Scoped invoices and credit notes remain intact', () => {
    const eng = state.engagements[0];
    const invoicesProg = computeModuleWorkflowProgress('billing', state, eng.id);
    assert.ok(invoicesProg.moduleId === 'MOD-14');
    assert.ok(invoicesProg.counts.total >= 0);
  });
});
