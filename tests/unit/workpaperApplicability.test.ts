// VP-052-AC03: a not-applicable decision needs a senior reviewer role and a
// rationale, cannot hide an unresolved linked finding, keeps prior clearance as
// history and is visible in the progress denominator used by release readiness.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { createInitialState } from '../../src/store/initialState.js';
import type { PrototypeState } from '../../src/types/index.js';

const store = prototypeStore as any;
function asUser(state: PrototypeState, userId: string) {
  const user = state.users.find(item => item.id === userId)!;
  state.currentUserId = user.id;
  state.currentPerson = user.name;
  state.currentRole = user.role;
}

describe('VP-052-AC03 workpaper not-applicable decisions', () => {
  it('requires a senior role and rationale, respects unresolved findings and retains clearance history', () => {
    store.state = createInitialState();
    const engagement = store.state.engagements.find((item: any) => item.id === 'ENG-26001');
    const workpaper = engagement.workpapers.find((item: any) => item.id === 'WP-A1');
    const clearanceBefore = structuredClone(workpaper.clearance);
    const historyBefore = workpaper.clearanceHistory.length;
    const versionBefore = workpaper.version;

    asUser(store.state, 'preparer');
    let before = JSON.stringify(store.state);
    assert.throws(() => store.updateWorkpaper('ENG-26001', 'WP-A1', { applicable: false, rationale: 'Area not relevant' }), /not applicable|cannot/i, 'a preparer cannot decide applicability alone');
    assert.equal(JSON.stringify(store.state), before);

    asUser(store.state, 'manager');
    before = JSON.stringify(store.state);
    assert.throws(() => store.updateWorkpaper('ENG-26001', 'WP-A1', { applicable: false, rationale: '  ' }), /requires a reason/);
    assert.equal(JSON.stringify(store.state), before, 'missing rationale saves nothing');

    store.state.findings.push({ id: 'FND-VP052-AC03', engagementId: 'ENG-26001', title: 'Open exception on WP-A1', linkedWorkpaperId: 'WP-A1', disposition: 'Proposed for correction', dispositionHistory: [] });
    before = JSON.stringify(store.state);
    assert.throws(() => store.updateWorkpaper('ENG-26001', 'WP-A1', { applicable: false, rationale: 'Area not relevant' }), /findings/i, 'an unresolved linked finding cannot be concealed by N/A');
    assert.equal(JSON.stringify(store.state), before);
    store.state.findings = store.state.findings.filter((item: any) => item.id !== 'FND-VP052-AC03');

    store.updateWorkpaper('ENG-26001', 'WP-A1', { applicable: false, rationale: 'No revenue stream of this type in FY2026.' });
    assert.equal(workpaper.status, 'Not applicable');
    assert.equal(workpaper.notApplicableRationale, 'No revenue stream of this type in FY2026.');
    assert.equal(workpaper.version, versionBefore + 1, 'the decision is a new attributable revision');
    assert.equal(workpaper.clearance, null, 'prior clearance is not carried onto the N/A revision');
    if (clearanceBefore) {
      assert.equal(workpaper.clearanceHistory.length, historyBefore + 1);
      assert.deepEqual(workpaper.clearanceHistory.at(-1), clearanceBefore, 'prior clearance is retained as history');
    }
    store.state = createInitialState();
  });
});
