import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { aggregateWorkflowSteps, computeModuleWorkflowProgress, isEngagementReleaseReady } from '../../src/services/workflowProgress.js';
import type { WorkflowStep } from '../../src/services/workflowProgress.js';
import { evaluateReleaseReadiness } from '../../src/services/releaseReadiness.js';
import { archiveForRelease, releaseForPackage } from '../../src/services/packageLineage.js';
import { ROUTE_CATALOG } from '../../src/services/routeCatalog.js';
import { resolveRouteHash } from '../../src/services/routes.js';
import type { FinancialPackageRevision, GeneratedArtifactRecord, PrototypeState, RouteKey } from '../../src/types/index.js';

describe('workflow progress contracts', () => {
  let state: PrototypeState;

  beforeEach(() => {
    state = createInitialState();
    (prototypeStore as unknown as { state: PrototypeState }).state = state;
  });

  it('T01: aggregates the same applicable milestones into exact counts and percentage', () => {
    const steps: WorkflowStep[] = [
      { id: 'a', label: 'A', state: 'completed' },
      { id: 'b', label: 'B', state: 'completed' },
      { id: 'c', label: 'C', state: 'completed' },
      { id: 'd', label: 'D', state: 'current' },
      { id: 'e', label: 'E', state: 'blocked' }
    ];
    assert.deepEqual(aggregateWorkflowSteps(steps), {
      valid: true,
      counts: { completed: 3, current: 1, pending: 0, blocked: 1, returned: 0, stale: 0, skipped: 0, notApplicable: 0, total: 5 },
      percentComplete: 60
    });

    const notRequired = aggregateWorkflowSteps([
      { id: 'a', label: 'A', state: 'completed' },
      { id: 'b', label: 'B', state: 'completed' },
      { id: 'c', label: 'C', state: 'completed' },
      { id: 'eqr', label: 'EQR', state: 'na' }
    ]);
    assert.equal(notRequired.percentComplete, 100);
    assert.equal(notRequired.counts.total, 3);
    assert.equal(notRequired.counts.notApplicable, 1);
    assert.equal(aggregateWorkflowSteps([{ id: 'n/a', label: 'N/A', state: 'na' }]).percentComplete, null);
    assert.ok((aggregateWorkflowSteps([
      { id: 'done', label: 'Done', state: 'completed' },
      { id: 'open', label: 'Open', state: 'skipped' }
    ]).percentComplete ?? 100) < 100, 'a skipped required step remains unfinished');
    assert.equal(aggregateWorkflowSteps([{ id: 'same', label: 'One', state: 'completed' }, { id: 'same', label: 'Two', state: 'completed' }]).valid, false);
  });

  it('T13: maps every route to a deliberate workflow, summary, or reference surface', () => {
    const routes = Object.keys(ROUTE_CATALOG) as RouteKey[];
    assert.ok(routes.length >= 30, 'the test covers the exhaustive current route catalogue');
    for (const route of routes) {
      const definition = ROUTE_CATALOG[route];
      const progress = computeModuleWorkflowProgress(route, state, {
        engagementId: 'ENG-26001',
        clientId: 'CL-001',
        recordId: route === 'jobs' ? 'JOB-2601' : undefined,
        portalResolved: route === 'portal'
      });
      assert.ok(definition.moduleId, `${route} has an explicit module identity`);
      assert.equal(progress.moduleId, definition.moduleId, `${route} uses its catalog identity`);
      assert.ok(progress.moduleName.trim() && progress.currentSection.trim(), `${route} describes its visible surface`);
      if (definition.progressMode === 'summary' || definition.progressMode === 'reference') {
        assert.equal(progress.applicability, definition.progressMode);
        assert.equal(progress.percentComplete, null, `${route} must not fabricate workflow completion`);
        assert.equal(progress.steps.length, 0);
      } else {
        assert.equal(progress.applicability, 'workflow', `${route} uses a real workflow selector`);
        assert.ok(progress.steps.length > 0, `${route} supplies lifecycle milestones`);
        assert.equal(new Set(progress.steps.map(step => step.id)).size, progress.steps.length, `${route} milestone IDs are unique`);
        assert.equal(progress.counts.total, progress.steps.filter(step => step.state !== 'na').length, `${route} denominator matches applicable steps`);
        assert.ok(progress.percentComplete === null || progress.percentComplete >= 0 && progress.percentComplete <= 100);
      }
      assert.ok(progress.nextAction.trim() && progress.whoActsNext.trim(), `${route} states an action and eligible role`);
    }

    // The catalogue is current-only: retired identifiers are not routes at all, and a
    // retired hash resolves to nothing instead of redirecting into another module.
    for (const retired of ['accounting-setup', 'gl-transactions', 'account-mappings', 'adjustments', 'reconciliations', 'financial-packages', 'consolidation']) {
      assert.equal((ROUTE_CATALOG as Record<string, unknown>)[retired], undefined, `${retired} is not a current route`);
    }
    assert.equal(resolveRouteHash('#packages'), null, 'a retired hash resolves to nothing');
    assert.equal(resolveRouteHash('#time-tracking'), null, 'a retired hash resolves to nothing');
    assert.equal(resolveRouteHash('#made-up-route'), null);
    assert.equal(resolveRouteHash('#trial-balance'), 'trial-balance', 'a current hash resolves directly');
  });

  it('T02: missing or out-of-scope engagement and population context fails closed', () => {
    state.selectedEngagement = '';
    const missing = computeModuleWorkflowProgress('trial-balance', state);
    assert.equal(missing.applicability, 'unavailable');
    assert.equal(missing.percentComplete, null);
    assert.equal(missing.steps.length, 0);
    assert.match(missing.nextAction, /select an authorized engagement/i);

    state.selectedEngagement = 'ENG-26001';
    const foreign = computeModuleWorkflowProgress('documents', state, { engagementId: 'ENG-NOT-PERMITTED' });
    assert.equal(foreign.applicability, 'unavailable');
    assert.equal(foreign.steps.length, 0);
    const invalidPopulation = computeModuleWorkflowProgress('sampling', state, { engagementId: 'ENG-26001', recordId: 'POP-NOT-IN-THIS-ENGAGEMENT' });
    assert.equal(invalidPopulation.applicability, 'unavailable');
    assert.equal(invalidPopulation.percentComplete, null);
    assert.equal(invalidPopulation.selectedRecordId, 'POP-NOT-IN-THIS-ENGAGEMENT');
  });

  it('T03 and T05: EQR applicability and current-generation approvals use readiness rules', () => {
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const required = evaluateReleaseReadiness(engagement, state);
    assert.equal(required.approvals.eqr, false);
    assert.ok(required.blockers.some(blocker => blocker.startsWith('EQR concurrence missing')));

    engagement.eqrRequired = false;
    const notRequired = evaluateReleaseReadiness(engagement, state);
    assert.equal(notRequired.approvals.eqr, false);
    assert.equal(notRequired.blockers.some(blocker => blocker.startsWith('EQR concurrence missing')), false);

    engagement.approvals.manager = { by: 'Layla Rahman', byUserId: 'manager', at: state.asOfDate, generation: engagement.generation - 1 };
    const stale = evaluateReleaseReadiness(engagement, state);
    assert.equal(stale.approvals.manager, false);
    assert.ok(stale.blockers.some(blocker => blocker.includes('Manager clearance missing or invalid')));

    engagement.approvals.client = { by: 'Omar Nasser', byUserId: 'client', at: state.asOfDate, generation: engagement.generation };
    const representationWithoutAcknowledgement = evaluateReleaseReadiness(engagement, state);
    assert.equal(representationWithoutAcknowledgement.approvals.client, true);
    assert.equal(representationWithoutAcknowledgement.approvals.managementAcknowledgement, false, 'management representation does not substitute for package acknowledgement');
    assert.ok(representationWithoutAcknowledgement.blockers.some(blocker => blocker.includes('Current management package acknowledgement')));

    engagement.approvals.manager = { by: 'Layla Rahman', byUserId: 'manager', at: state.asOfDate, generation: engagement.generation };
    engagement.approvals.partner = { by: 'Layla Rahman', byUserId: 'manager', at: state.asOfDate, generation: engagement.generation };
    assert.equal(evaluateReleaseReadiness(engagement, state).approvals.manager, false, 'one natural person cannot satisfy both independent sign-offs');
    assert.equal(isEngagementReleaseReady(engagement, state), false, 'readiness is read-only and remains blocked by real prerequisites');
  });

  it('T06: a release and archive attach only to the exact package revision and manifest', () => {
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const artifacts: GeneratedArtifactRecord[] = [
      { id: 'ART-XLSX', kind: 'XLSX', name: 'package.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 12, sha256: 'a'.repeat(64) },
      { id: 'ART-DOCX', kind: 'DOCX', name: 'package.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 13, sha256: 'b'.repeat(64) },
      { id: 'ART-PDF', kind: 'PDF', name: 'package.pdf', mimeType: 'application/pdf', size: 14, sha256: 'c'.repeat(64) }
    ];
    const packageV1: FinancialPackageRevision = {
      id: 'PKG-EXACT-V1', engagementId: engagement.id, revision: 1, generation: engagement.generation, sourceVersion: engagement.sourceVersion,
      glSourceRevision: 1, glSourceSha256: 'd'.repeat(64), mappingRevision: 1, notes: 'Current test package', noteRevision: 1,
      sections: [], validation: { passed: true, trialBalanceNet: 0, pendingWorkpapers: 0, openReviews: 0, materialFindings: 0 },
      artifacts, createdAt: state.asOfDate, createdBy: 'Layla Rahman', createdByUserId: 'manager'
    };
    const release: PrototypeState['engagements'][number]['releases'][number] = {
      id: 'REL-PKG-V1', version: 1, generation: engagement.generation, releasedAt: state.asOfDate, releasedBy: 'Daniel James', delivered: true,
      manifest: artifacts.map(artifact => ({
        id: artifact.id, artifactId: artifact.id, name: artifact.name, type: artifact.kind, mimeType: artifact.mimeType,
        size: artifact.size, sha: artifact.sha256, sourceId: packageV1.id, sourceRevision: packageV1.revision
      }))
    };
    const packageV2: FinancialPackageRevision = { ...structuredClone(packageV1), id: 'PKG-EXACT-V2', revision: 2, noteRevision: 2 };
    engagement.packageHistory = [packageV1, packageV2];
    engagement.packageRevision = 2;
    engagement.releases = [release];
    engagement.archive = { archivedAt: state.asOfDate, archivedBy: 'Records Officer', releaseId: release.id, manifest: artifacts.map(artifact => artifact.id) };

    assert.equal(releaseForPackage(engagement, packageV1)?.id, release.id, 'the exact v1 release is retained as history');
    assert.equal(releaseForPackage(engagement, packageV2), undefined, 'released v1 does not complete unreviewed v2');
    assert.equal(archiveForRelease(engagement, release.id)?.releaseId, release.id);
    assert.equal(archiveForRelease(engagement, 'REL-PKG-V2'), undefined, 'an archive for v1 cannot close a v2 release');
  });

  it('T07: Client 360 and portal progress follow the resolved client and engagement', () => {
    const first = state.engagements.find(item => item.id === 'ENG-26001')!;
    const second = state.engagements.find(item => item.id === 'ENG-26002')!;
    const firstPortal = computeModuleWorkflowProgress('portal', state, { clientId: first.client, engagementId: first.id, portalResolved: true });
    const secondPortal = computeModuleWorkflowProgress('portal', state, { clientId: second.client, engagementId: second.id, portalResolved: true });
    assert.match(firstPortal.scopeLabel || '', /CL-001.*ENG-26001/);
    assert.match(secondPortal.scopeLabel || '', /CL-002.*ENG-26002/);
    assert.notEqual(firstPortal.completedSummary, secondPortal.completedSummary);
    const mismatch = computeModuleWorkflowProgress('portal', state, { clientId: first.client, engagementId: second.id, portalResolved: true });
    assert.equal(mismatch.applicability, 'unavailable');
    assert.equal(mismatch.percentComplete, null);

    const clientDetail = computeModuleWorkflowProgress('client-detail', state, { clientId: first.client });
    assert.equal(clientDetail.scopeLabel, `Client ${first.client}`);
    assert.equal(computeModuleWorkflowProgress('client-detail', state, { clientId: 'CL-NOT-PERMITTED' }).applicability, 'unavailable');
  });

  it('T08 and T09: a scoped grant hides sentinel records and revocation clears progress', () => {
    const user = state.users.find(item => item.id === 'relationship')!;
    const visibleEngagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const hiddenEngagement = state.engagements.find(item => item.client !== visibleEngagement.client)!;
    state.currentUserId = user.id;
    state.currentPerson = user.name;
    state.currentRole = user.role;
    state.roleGrants = [{ userId: user.id, role: user.role, scopeKind: 'Client', scopeId: visibleEngagement.client, grantedAt: state.asOfDate, grantedBy: 'manager' }];
    state.selectedEngagement = visibleEngagement.id;

    const visibleBefore = computeModuleWorkflowProgress('documents', state, { engagementId: visibleEngagement.id });
    assert.ok(visibleBefore.steps.length > 0);
    assert.ok(state.documents.some(document => document.engagementId === visibleEngagement.id), 'positive control has visible documents');
    assert.notEqual(hiddenEngagement.client, visibleEngagement.client, 'hidden fixture uses a different client');
    const sentinel = { ...structuredClone(state.documents[0]), id: 'DOC-HIDDEN-SENTINEL', clientId: hiddenEngagement.client, engagementId: hiddenEngagement.id, name: 'PRIVATE-OUT-OF-SCOPE-SENTINEL.pdf' };
    state.documents.push(sentinel);
    state.communications.push({
      id: 'COMM-HIDDEN-SENTINEL', clientId: hiddenEngagement.client, engagementId: hiddenEngagement.id, direction: 'Outbound', channel: 'Email',
      participants: 'Private', summary: 'PRIVATE-OUT-OF-SCOPE-SENTINEL', author: 'Private', date: state.asOfDate, status: 'Outcome unknown'
    });
    const visibleAfter = computeModuleWorkflowProgress('documents', state, { engagementId: visibleEngagement.id });
    assert.deepEqual(visibleAfter, visibleBefore, 'out-of-scope records change no visible metrics, blockers or accessible text');
    const restricted = computeModuleWorkflowProgress('documents', state, { engagementId: hiddenEngagement.id });
    assert.equal(restricted.applicability, 'unavailable');

    state.roleGrants = [];
    const revoked = computeModuleWorkflowProgress('documents', state, { engagementId: visibleEngagement.id });
    assert.equal(revoked.applicability, 'unavailable');
    assert.equal(revoked.steps.length, 0);
    assert.equal(revoked.percentComplete, null);
  });

  // The retired `jobs` route and its Jobs & Tasks progress selector no longer exist in the
  // current five-module surface, so the two job-scoped selector tests were removed with it.
  // Job and task records remain first-class domain data used by the current work queues.

  it('T19: progress selectors are deterministic and do not mutate business state', () => {
    const before = structuredClone(state);
    for (const route of ['trial-balance', 'delivery', 'records'] as const) {
      const first = computeModuleWorkflowProgress(route, state, { engagementId: 'ENG-26001' });
      const second = computeModuleWorkflowProgress(route, state, { engagementId: 'ENG-26001' });
      assert.deepEqual(second, first, `${route} selection is deterministic`);
    }
    assert.deepEqual(state, before, 'computing progress leaves persistent business state unchanged');
  });

  it('T16: names a supported eligible role for the next action', () => {
    const releaseProgress = computeModuleWorkflowProgress('reviews', state, { engagementId: 'ENG-26001' });
    assert.match(releaseProgress.whoActsNext, /Preparer|Manager/, 'the current review selector names a role-level actor');
    assert.ok(state.users.some(user => user.role === 'manager' && user.status === 'Active'), 'a role-level hint names a supported active role');
    assert.doesNotMatch(`${releaseProgress.nextAction} ${releaseProgress.whoActsNext}`, /waiting on others/i, 'the hint does not claim that another actor is blocking an action available to this user');
  });
});
