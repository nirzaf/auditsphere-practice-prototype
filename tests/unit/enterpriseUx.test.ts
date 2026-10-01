import { routeCode } from '../../src/services/routeCatalog.js';
// Enterprise UX layer contracts: shared status semantics, lifecycle definitions grounded in
// real store commands, route catalogue coverage and deterministic scoped work queues.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { loadScenarioState } from '../../src/store/scenarios.js';
import { statusKind, statusSemantic, isTerminalStatus } from '../../src/services/statusSemantics.js';
import { LIFECYCLES, lifecycleById, projectLifecycle } from '../../src/services/lifecycles.js';
import { ROUTE_CATALOG } from '../../src/services/legacyRouteCatalog.js';
import { buildWorkQueues, readyForReleaseEngagements } from '../../src/services/workQueues.js';
import { isSamePerson, requireIndependentActor, scopedInvoices } from '../../src/services/guards.js';
import type { PrototypeState } from '../../src/types/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const typesSource = readFileSync(join(here, '..', '..', 'src', 'types', 'index.ts'), 'utf8');

/** Literal members of a `field: 'A' | 'B'` union declared inside `export interface Name`. */
function unionLiterals(interfaceName: string, field: string): string[] {
  const start = typesSource.indexOf(`export interface ${interfaceName} `);
  assert.ok(start >= 0, `interface ${interfaceName} exists`);
  const body = typesSource.slice(start, typesSource.indexOf('\n}\n', start));
  const match = body.match(new RegExp(`\\n\\s+${field}\\??:\\s*(\\|?\\s*'[^;]+);`));
  assert.ok(match, `${interfaceName}.${field} union exists`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
}

function setPersona(state: PrototypeState, userId: string) {
  const user = state.users.find(u => u.id === userId)!;
  state.currentUserId = user.id;
  state.currentPerson = user.name;
  state.currentRole = user.role;
}

let state: PrototypeState;
beforeEach(() => {
  state = createInitialState();
  (prototypeStore as any).state = state;
});

describe('shared status semantics', () => {
  it('maps every declared status/stage/disposition literal to a meaningful kind', () => {
    const literals = [...typesSource.matchAll(/\b(?:status|stage|state|lifecycleStatus|disposition|adequacyStatus|reflectionStatus)\??:\s*((?:\s*\|?\s*'[^']+')+)/g)]
      .flatMap(match => [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]));
    const unmapped = [...new Set(literals)].filter(value => statusKind(value) === 'neutral' && value !== 'Unknown');
    assert.deepEqual(unmapped, [], `every status literal needs a shared semantic: ${unmapped.join(', ')}`);
  });

  it('gives equivalent meanings one presentation and keeps terminal states distinct', () => {
    assert.equal(statusKind('Returned'), 'returned');
    assert.equal(statusKind('Changes required'), 'returned');
    assert.equal(statusKind('Needs clarification'), 'returned');
    assert.equal(statusKind('Stale'), 'stale');
    assert.equal(statusKind('In Review'), statusKind('Under review'));
    assert.equal(statusSemantic('Approved').tone, statusSemantic('Reviewed').tone);
    assert.equal(statusKind('Simulated accepted'), 'simulation');
    assert.equal(isTerminalStatus('Cancelled'), true);
    assert.equal(isTerminalStatus('Superseded'), true);
    assert.equal(isTerminalStatus('Draft'), false);
    assert.equal(statusKind('Returned · v3'), 'returned', 'composed labels resolve by their leading status');
    assert.equal(statusKind('Something new'), 'neutral', 'unknown text is neutral, never guessed as approved');
  });
});

describe('lifecycle definitions are grounded in store commands', () => {
  it('names only commands that exist on the prototype store', () => {
    const missing = LIFECYCLES.flatMap(def => def.transitions.filter(t => typeof (prototypeStore as any)[t.command] !== 'function').map(t => `${def.id}:${t.command}`));
    assert.deepEqual(missing, []);
  });

  it('places every status of each typed record on its path, rework, blocked, stale or terminal set', () => {
    const coverage: Array<[string, string, string]> = [
      ['lead', 'LeadOpportunity', 'stage'], ['client', 'ClientRecord', 'status'], ['proposal', 'ProposalRecord', 'state'],
      ['engagement', 'EngagementRecord', 'lifecycleStatus'], ['job', 'JobTaskItem', 'status'], ['job', 'JobRecord', 'status'],
      ['job-template', 'JobTemplateItem', 'status'], ['pbc', 'PbcRequestItem', 'status'], ['time', 'TimeEntryItem', 'status'],
      ['budget', 'BudgetRecord', 'status'], ['invoice', 'InvoiceRecord', 'status'], ['credit-note', 'CreditNoteRecord', 'status'],
      ['adjustment', 'AdjustmentJournalItem', 'status'], ['reconciliation', 'ReconciliationSchedule', 'status'],
      ['mapping', 'AccountMappingRevision', 'status'], ['statement-set', 'StatementSetRevision', 'status'],
      ['statement-set', 'CashFlowScheduleRevision', 'status'], ['disclosure', 'DisclosureReviewRecord', 'status'],
      ['consolidation-output', 'ConsolidationOutputPackage', 'status'], ['audit-plan', 'AuditPlanRecord', 'status'],
      ['audit-procedure', 'AuditProcedureItem', 'status'], ['audit-program-template', 'AuditProgramTemplate', 'status'],
      ['workpaper', 'WorkpaperItem', 'status'], ['review-note', 'ReviewNoteItem', 'status'], ['evidence', 'EvidenceItem', 'adequacyStatus'],
      ['finding', 'FindingItem', 'disposition'], ['invitation', 'SimulatedInvitation', 'status'], ['m365', 'M365SimulationConfig', 'status']
    ];
    const gaps: string[] = [];
    for (const [id, iface, field] of coverage) {
      const def = lifecycleById(id);
      const placed = new Set([...def.path.flatMap(step => step.statuses), ...(def.rework?.statuses || []), ...(def.blocked || []), ...(def.stale || []), ...(def.terminal || [])]);
      unionLiterals(iface, field).filter(value => !placed.has(value)).forEach(value => gaps.push(`${id} (${iface}.${field}): ${value}`));
    }
    assert.deepEqual(gaps, []);
  });

  it('projects happy-path, rework, stale and terminal positions without inventing steps', () => {
    const invoice = lifecycleById('invoice');
    const issued = projectLifecycle(invoice, 'Issued');
    assert.deepEqual(issued.steps.map(s => s.state), ['done', 'done', 'done', 'current', 'todo']);
    const paid = projectLifecycle(invoice, 'Paid');
    assert.equal(paid.steps.every(s => s.state === 'done'), true, 'final step is complete, not pending');
    const returned = projectLifecycle(invoice, 'Draft', { returned: true });
    assert.equal(returned.position, 'rework');
    assert.equal(returned.steps[0].state, 'returned');
    const wp = projectLifecycle(lifecycleById('workpaper'), 'Changes required');
    assert.deepEqual(wp.steps.map(s => s.state), ['done', 'returned', 'todo', 'todo']);
    assert.equal(projectLifecycle(lifecycleById('reconciliation'), 'Stale').position, 'stale');
    assert.equal(projectLifecycle(invoice, 'Cancelled').position, 'terminal');
    assert.equal(new Set(LIFECYCLES.map(def => def.id)).size, LIFECYCLES.length, 'lifecycle ids are unique');
  });
});

describe('route catalogue', () => {
  it('names every route with a section and keeps the historical route code', () => {
    for (const [route, info] of Object.entries(ROUTE_CATALOG)) {
      assert.ok(info.section && info.label, `${route} has a section and label`);
    }
    assert.equal(routeCode('overview'), 'OVERVIEW');
    assert.equal(routeCode('m365-setup'), 'M365 SETUP');
    assert.equal(routeCode('financial-statements'), 'FINANCIAL STATEMENTS');
  });
});

describe('segregation-of-duties identity helper', () => {
  it('matches the same natural person across role labels, preserving requireIndependentActor', () => {
    assert.equal(isSamePerson(state, 'preparer', 'Adam Khan'), true);
    assert.equal(isSamePerson(state, 'Adam Khan', 'Sara Malik'), false);
    assert.throws(() => requireIndependentActor('Adam Khan', 'Adam Khan', 'approve their own work', state), /Separation of duties/);
  });
});

describe('billing register scope (defect fix)', () => {
  it('hides invoices whose engagement is outside a narrow persona\'s grant', () => {
    setPersona(state, 'group-user');
    const ids = scopedInvoices(state).map(invoice => invoice.id);
    assert.equal(ids.includes('INV-26003'), false, 'ENG-26002 invoice is not visible to an ENG-26001-only persona');
    assert.ok(ids.length > 0, 'in-scope invoices remain visible');
    assert.ok(scopedInvoices(state).every(invoice => (invoice.engagementId || invoice.eng) === 'ENG-26001'));
    setPersona(state, 'billing');
    assert.deepEqual(scopedInvoices(state).map(invoice => invoice.id).sort(), state.invoices.map(invoice => invoice.id).sort(), 'a global billing grant still sees the full register');
  });
});

describe('role work queues (deterministic, scoped projections)', () => {
  const queue = (s: PrototypeState, id: string) => buildWorkQueues(s).find(q => q.id === id)!;

  it('routes returned work and review points to the preparer, not the reviewer', () => {
    setPersona(state, 'preparer');
    const returned = queue(state, 'returned').items.map(item => item.id).sort();
    assert.deepEqual(returned, ['RN-001', 'RN-002', 'WP-C1', 'WP-F1']);
    assert.deepEqual(queue(state, 'my-tasks').items.map(item => item.id).sort(), ['TSK-103', 'TSK-103-2']);
    setPersona(state, 'reviewer');
    assert.equal(queue(state, 'returned').items.length, 0);
  });

  it('never offers a reviewer their own work (segregation of duties)', () => {
    setPersona(state, 'manager');
    const reviews = queue(state, 'my-reviews').items;
    assert.equal(reviews.some(item => item.id === 'TIME-04'), false, 'own submitted time is not in own review queue');
    assert.equal(reviews.some(item => item.id === 'INV-26003'), true, 'another person\'s invoice draft awaits independent review');
    setPersona(state, 'billing');
    assert.equal(queue(state, 'my-reviews').items.some(item => item.id === 'INV-26003'), false, 'the invoice preparer does not see it as their review');
  });

  it('moves a returned time entry into the owner\'s queue with the reviewer\'s reason', () => {
    setPersona(state, 'reviewer');
    prototypeStore.reviewTimeEntry('TIME-04', 'Returned', 'Split planning and fieldwork minutes.');
    setPersona(state, 'manager');
    const item = queue(state, 'returned').items.find(entry => entry.id === 'TIME-04');
    assert.ok(item, 'returned time is in the owner\'s Returned queue');
    assert.match(item!.reason, /Sara Malik.*Split planning and fieldwork minutes/);
  });

  it('keeps a narrow persona\'s queues inside its granted engagement', () => {
    setPersona(state, 'group-user');
    const engagementIds = new Set(buildWorkQueues(state).flatMap(q => q.items.map(item => item.engagementId)).filter(Boolean));
    assert.deepEqual([...engagementIds].every(id => id === 'ENG-26001'), true);
  });

  it('agrees with the dashboard ready-to-release rule and excludes archived engagements', () => {
    const scenario = loadScenarioState('blocked-rework');
    (prototypeStore as any).state = scenario;
    setPersona(scenario, 'manager');
    const ready = queue(scenario, 'ready-release').items.map(item => item.id).sort();
    assert.deepEqual(ready, readyForReleaseEngagements(scenario.engagements).map(e => e.id).sort());
    scenario.engagements.forEach(e => { e.archive = { archivedAt: '2026-09-23', archivedBy: 'x', releaseId: 'R', manifest: [] }; });
    assert.equal(queue(scenario, 'ready-release').items.length, 0);
  });

  it('reports waiting-on-client requests and nothing for an empty practice', () => {
    setPersona(state, 'manager');
    assert.deepEqual(queue(state, 'waiting-client').items.filter(item => item.kind === 'Client request').map(item => item.id).sort(), ['PBC-03', 'PBC-04']);
    const empty = loadScenarioState('empty-practice');
    setPersona(empty, 'manager');
    assert.equal(buildWorkQueues(empty).every(q => q.items.length === 0), true);
  });
});

describe('what changed since last review (deterministic workpaper diff)', () => {
  it('uses the last clearance as baseline and reports only recorded field changes', async () => {
    const { workpaperChangesSinceReview } = await import('../../src/services/reviewDiff.js');
    const eng = state.engagements.find(e => e.id === 'ENG-26001')!;
    const wp = structuredClone(eng.workpapers.find(w => w.id === 'WP-A1')!);
    const clearedAt = '2026-09-22T10:00:00.000Z'; // after the seeded workbook upload (2026-09-21)
    wp.clearanceHistory = [{ clearedBy: 'Sara Malik', clearedAt, sourceVersion: eng.sourceVersion, generation: 1, version: wp.version, notes: 'ok' }];
    assert.deepEqual(workpaperChangesSinceReview(wp, eng).changes, [], 'no changes are invented when nothing moved');
    wp.version += 1;
    wp.status = 'Changes required';
    wp.evidenceLinkHistory = [
      { documentId: 'DOC-OLD', version: 1, action: 'Linked', actorId: 'preparer', reason: 'before baseline', at: '2026-09-01T00:00:00.000Z' },
      { documentId: 'DOC-9', version: 2, action: 'Linked', actorId: 'preparer', reason: 'Refreshed bank confirmation', at: '2026-09-22T12:00:00.000Z' }
    ];
    const { baseline, changes } = workpaperChangesSinceReview(wp, { sourceVersion: eng.sourceVersion + 1 });
    assert.equal(baseline?.kind, 'clearance');
    assert.deepEqual(changes.map(change => change.field), ['Workpaper revision', 'Evidence', 'Trial balance source', 'Status']);
    assert.match(changes[1].detail, /Linked DOC-9 v2 — Refreshed bank confirmation/);
    assert.equal(changes.some(change => change.detail.includes('DOC-OLD')), false, 'events before the baseline are excluded');
  });

  it('falls back to the last submission and returns nothing for never-reviewed work', async () => {
    const { workpaperChangesSinceReview } = await import('../../src/services/reviewDiff.js');
    const wp = structuredClone(state.engagements[0].workpapers[0]);
    wp.clearanceHistory = [];
    wp.submissionHistory = [];
    assert.equal(workpaperChangesSinceReview(wp).baseline, null);
    wp.submissionHistory = [{ version: wp.version, submittedBy: 'preparer', submittedAt: '2026-09-15T00:00:00.000Z' }];
    assert.equal(workpaperChangesSinceReview(wp).baseline?.kind, 'submission');
  });
});

describe('module lifecycle guide coverage', () => {
  it('gives every operational route its own rehearsal guide, exact route first', async () => {
    const { guidesForRoute } = await import('../../historical/guideProjections.js');
    const reference = new Set(['requirements', 'client-requirements', 'role-guide', 'module-guide']);
    const missing = Object.keys(ROUTE_CATALOG).filter(route => !reference.has(route) && guidesForRoute(route as any).length === 0);
    assert.deepEqual(missing, []);
    assert.equal(guidesForRoute('approvals')[0].id, 'MOD-36', 'Sign-offs shows its own guide, not the adjustment guide that mentions approvals');
    assert.equal(guidesForRoute('reconciliations')[0].id.startsWith('MOD-2'), true);
  });
});

describe('blocked and stale lifecycle positioning', () => {
  it('marks only the step where the record is stuck; earlier steps stay done, later steps not reached', () => {
    assert.deepEqual(projectLifecycle(lifecycleById('release'), 'Blocked').steps.map(s => s.state), ['blocked', 'todo', 'todo', 'todo']);
    assert.deepEqual(projectLifecycle(lifecycleById('job'), 'Blocked').steps.map(s => s.state), ['done', 'blocked', 'todo']);
    assert.deepEqual(projectLifecycle(lifecycleById('reconciliation'), 'Stale').steps.map(s => s.state), ['done', 'done', 'stale'], 'the stale approval is the invalidated step');
    assert.deepEqual(projectLifecycle(lifecycleById('package'), 'Stale').steps.map(s => s.state), ['stale', 'todo', 'todo', 'todo', 'todo']);
  });
});

describe('outstanding sign-offs in the review queue', () => {
  it('lists a sign-off only for the assigned approver and only while it is not current for the generation', () => {
    const q = (s: PrototypeState) => buildWorkQueues(s).find(queue => queue.id === 'my-reviews')!.items.filter(item => item.route === 'approvals');
    setPersona(state, 'partner');
    const partnerItems = q(state);
    const assigned = state.engagements.filter(e => !e.archive && e.partner === 'Daniel James' && (e.lifecycleStatus || 'Active') === 'Active' && e.approvals.partner?.generation !== e.generation);
    assert.deepEqual(partnerItems.map(item => item.engagementId).sort(), assigned.map(e => e.id).sort());
    assert.ok(partnerItems.every(item => item.kind === 'Partner sign-off'));
    const eng = state.engagements.find(e => e.id === partnerItems[0]?.engagementId);
    if (eng) {
      eng.approvals.partner = { by: 'Daniel James', byUserId: 'partner', at: '2026-09-23T00:00:00Z', generation: eng.generation };
      assert.equal(q(state).some(item => item.engagementId === eng.id), false, 'a current partner sign-off leaves the queue');
    }
    setPersona(state, 'preparer');
    assert.equal(q(state).length, 0, 'preparers owe no engagement sign-offs');
  });
});
