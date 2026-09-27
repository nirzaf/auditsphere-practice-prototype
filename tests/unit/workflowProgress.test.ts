// Unit tests for Workflow Progress Calculation Engine
// Verifies real-state progress derivation, percentage math, completed/pending/blocked counts,
// six enterprise question answers, role/scope isolation, and blocked/rework transitions.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { computeModuleWorkflowProgress, isEngagementReleaseReady } from '../../src/services/workflowProgress.js';
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

    // Grant access to only CLI-001
    state.roleGrants = [
      {
        id: 'g-rel-test',
        userId: relationshipUser.id,
        role: 'relationship',
        clientAccess: ['CLI-001'],
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
});
