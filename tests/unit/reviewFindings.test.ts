// Regressions for findings from the 2026-09-27 Claude Code review pass (REVIEW-PASS-01).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { createInitialState } from '../../src/store/initialState.js';

const store = prototypeStore as any;

describe('review pass regressions', () => {
  it('a component added to an existing group requires the actor\'s engagement grant (MOD-26 / VP-043-AC03)', () => {
    store.state = createInitialState();
    const state = store.state;
    const outside = structuredClone(state.engagements.find((item: any) => item.id === 'ENG-26002'));
    outside.id = 'ENG-26009';
    state.engagements.push(outside);
    state.roleGrants.push(
      { userId: 'group-user', role: 'manager', scopeKind: 'Group', scopeId: 'GRP-01' },
      { userId: 'group-user', role: 'manager', scopeKind: 'Engagement', scopeId: 'ENG-26002' }
    );
    const user = state.users.find((item: any) => item.id === 'group-user');
    Object.assign(state, { currentUserId: user.id, currentPerson: user.name, currentRole: user.role });
    const candidate = structuredClone(state.consolidationGroups[0]);
    candidate.components[1].componentId = 'ENG-26009';
    const before = JSON.stringify(state.consolidationGroups);
    assert.throws(() => store.updateConsolidationGroup(candidate, { reason: 'Swap subsidiary to an ungranted engagement' }), /ENG-26009.*outside the current scoped grant/);
    assert.equal(JSON.stringify(state.consolidationGroups), before, 'denied perimeter change writes nothing');
    store.state = createInitialState();
  });
});

function asUser(userId: string) {
  const user = store.state.users.find((item: any) => item.id === userId);
  Object.assign(store.state, { currentUserId: user.id, currentPerson: user.name, currentRole: user.role });
}

describe('review pass evidence gaps', () => {
  it('VP-030-AC04: fixture invoices use the no-tax profile and migration preserves a recorded historical tax total', async () => {
    const { migratePersistedState } = await import('../../src/services/migrations.js');
    const fresh = createInitialState();
    for (const invoice of fresh.invoices) {
      assert.equal(Object.keys(invoice).some(key => /tax/i.test(key)), false, `${invoice.id} carries no invented tax field`);
      assert.equal(Math.round(invoice.lines.reduce((sum, line) => sum + line.amount, 0) * 100), Math.round(invoice.amount * 100), `${invoice.id} total equals its lines (no tax added)`);
    }
    const legacy = JSON.parse(JSON.stringify(fresh));
    legacy.invoices[0].taxTotal = 1500;
    legacy.invoices[0].taxLabel = 'Historical VAT (recorded before the no-tax profile)';
    const { state: migrated } = migratePersistedState(legacy, createInitialState());
    const invoice: any = migrated.invoices.find(item => item.id === legacy.invoices[0].id);
    assert.equal(invoice.taxTotal, 1500, 'a recorded historical tax total is preserved');
    assert.equal(invoice.taxLabel, legacy.invoices[0].taxLabel);
    assert.equal(invoice.amount, legacy.invoices[0].amount, 'the historical invoice total is not rewritten');
    const { invoiceTaxLine } = await import('../../src/services/calculations.js');
    assert.equal(invoiceTaxLine(invoice), `Historical tax total (as recorded: Historical VAT (recorded before the no-tax profile)): ${invoice.currency || 'QAR'} 1,500.00`, 'the recorded historical total is rendered as recorded');
    assert.equal(invoiceTaxLine(fresh.invoices[1]), 'Tax: not calculated (approved no-tax demo profile)', 'new invoices state the no-tax profile');
  });

  it('VP-052-AC03: a reasoned N/A decision leaves the release progress denominator (workpaper gate)', () => {
    store.state = createInitialState();
    const engagement = store.state.engagements.find((item: any) => item.id === 'ENG-26001');
    for (const workpaper of engagement.workpapers.filter((item: any) => item.id !== 'WP-C1')) {
      workpaper.status = 'Cleared';
      workpaper.clearance = { clearedBy: 'Sara Malik', clearedAt: '2026-09-21T09:00:00Z', sourceVersion: engagement.sourceVersion, generation: engagement.generation, version: workpaper.version, notes: 'Cleared.' };
    }
    store.state.findings = store.state.findings.filter((item: any) => item.linkedWorkpaperId !== 'WP-C1');
    assert.match(store.evaluateReleaseReadiness('ENG-26001').reason, /workpapers are not cleared or marked N\/A/);
    asUser('manager');
    store.updateWorkpaper('ENG-26001', 'WP-C1', { applicable: false, rationale: 'No inventory held at year end.' });
    assert.doesNotMatch(store.evaluateReleaseReadiness('ENG-26001').reason || '', /workpapers/, 'the N/A paper no longer counts as open work');
    store.state = createInitialState();
  });

  it('VP-057-AC01: a failed release gate names the missing record and creates no candidate, release or event', () => {
    store.state = createInitialState();
    asUser('partner');
    const engagement = store.state.engagements.find((item: any) => item.id === 'ENG-26001');
    const before = JSON.stringify({ releases: engagement.releases, candidate: engagement.candidate ?? null, events: engagement.events, archives: store.state.archives || [] });
    assert.throws(() => store.prepareReleaseCandidate('ENG-26001'), /workpapers are not cleared/);
    assert.equal(JSON.stringify({ releases: engagement.releases, candidate: engagement.candidate ?? null, events: engagement.events, archives: store.state.archives || [] }), before, 'no release artifacts or events are created by a blocked gate');
    store.state = createInitialState();
  });

  it('VP-056-AC01: EQR concerns and their resolution in one engagement leave another engagement unchanged', () => {
    store.state = createInitialState();
    const other = store.state.engagements.find((item: any) => item.id === 'ENG-26002');
    const snapshot = () => JSON.stringify({ generation: other.generation, approvals: other.approvals, concerns: other.eqrConcerns, eqr: other.eqrReviewerUserId, required: other.eqrRequired });
    const before = snapshot();
    asUser('eqr');
    store.addEqrConcern('ENG-26001', 'VP-056-AC01 isolation concern');
    const concern = store.state.engagements.find((item: any) => item.id === 'ENG-26001').eqrConcerns.at(-1);
    assert.equal(snapshot(), before, 'raising a concern changes no other engagement');
    asUser('manager');
    store.respondEqrConcern('ENG-26001', concern.id, 'Team response with revised inventory testing.');
    assert.equal(snapshot(), before, 'the team response changes no other engagement');
    asUser('eqr-2');
    store.toggleEqrConcern('ENG-26001', concern.id);
    assert.equal(store.state.engagements.find((item: any) => item.id === 'ENG-26001').eqrConcerns.at(-1).resolved, true);
    assert.equal(snapshot(), before, 'resolving a concern changes no other engagement');
    store.state = createInitialState();
  });
});
