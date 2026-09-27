// VP-021-E01: finite availability matrix across the record types that consume a
// document reference. An unavailable reference blocks every new link/exposure
// atomically; withdrawal and restoration remain possible; restore re-enables use.
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

describe('VP-021-E01 document availability × consuming record type', () => {
  it('blocks task, workpaper, evidence, procedure and client-sharing use of an unavailable document without writing', () => {
    store.state = createInitialState();
    asUser(store.state, 'manager');
    store.setDocumentAvailability('DOC-003', true, 'VP-021-E01 matrix: file missing from synthetic root');
    const denied: Array<[string, string, () => unknown]> = [
      ['task link', 'manager', () => store.linkDocumentToTask('DOC-003', 'TSK-101')],
      ['client sharing', 'manager', () => store.setDocumentClientSharing('DOC-003', true, 'Share for client review')],
      ['workpaper evidence', 'preparer', () => store.linkWorkpaperEvidence('ENG-26001', 'WP-C1', 'DOC-003')],
      ['evidence adequacy', 'manager', () => store.setEvidenceAdequacy('EVD-02', 'Adequate', 'Reviewed schedule')],
      ['evidence-procedure link', 'manager', () => store.linkEvidenceProcedure('EVD-02', 'PRC-01')]
    ];
    for (const [label, userId, run] of denied) {
      asUser(store.state, userId);
      const before = JSON.stringify(store.state);
      assert.throws(run, /unavailable|available/i, `${label} must be refused while the reference is unavailable`);
      assert.equal(JSON.stringify(store.state), before, `${label} refusal leaves no partial metadata`);
    }
  });

  it('still allows withdrawal of an unavailable shared document and re-enables use after restore', () => {
    store.state = createInitialState();
    asUser(store.state, 'manager');
    store.setDocumentAvailability('DOC-002', true, 'VP-021-E01 matrix: shared file unavailable');
    store.setDocumentClientSharing('DOC-002', false, 'Withdraw while unavailable');
    assert.equal(store.state.documents.find((item: any) => item.id === 'DOC-002').visibility, 'Internal', 'withdrawal is not blocked by unavailability');

    store.setDocumentAvailability('DOC-003', true, 'Temporarily unavailable');
    store.setDocumentAvailability('DOC-003', false, 'Restored at the same synthetic root');
    store.linkDocumentToTask('DOC-003', 'TSK-101');
    assert.equal(store.state.documents.find((item: any) => item.id === 'DOC-003').linkedTaskId, 'TSK-101', 'restored reference links under the same identity');
    asUser(store.state, 'preparer');
    store.linkWorkpaperEvidence('ENG-26001', 'WP-C1', 'DOC-003');
    const workpaper = store.state.engagements.find((item: any) => item.id === 'ENG-26001').workpapers.find((item: any) => item.id === 'WP-C1');
    assert.ok((workpaper.evidence || workpaper.evidenceDocumentIds || JSON.stringify(workpaper)).includes('DOC-003'), 'restored reference can be pinned as workpaper evidence');
    store.state = createInitialState();
  });
});
