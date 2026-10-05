// Shared browser-free mutation helpers used by more than one command family.
//
// Ported verbatim from the private prototypeStore helpers so the store and the
// Worker keep exactly one implementation of each rule.

import type { EngagementRecord, PrototypeState, ReviewNoteItem, WorkpaperItem } from '../types';

/** Reopen review notes attached to a workpaper whose revision changed. */
export function reopenWorkpaperReviewNotes(
  state: PrototypeState,
  eng: EngagementRecord,
  workpaper: WorkpaperItem,
  now: string
): void {
  for (const note of eng.reviews.filter(item => item.wp === workpaper.id && ['Responded', 'Cleared'].includes(item.status))) {
    note.status = 'Reopened';
    note.history.push({
      actor: state.currentPerson,
      action: 'Reopened after workpaper revision',
      time: now,
      text: `Workpaper revision changed to v${workpaper.version}; previous response remains historical.`
    });
  }
}

/** Reopen review notes attached to a finding whose revision changed. */
export function reopenFindingReviewNotes(
  state: PrototypeState,
  eng: EngagementRecord,
  finding: PrototypeState['findings'][number],
  now: string
): void {
  for (const note of eng.reviews.filter(item => item.subjectType === 'finding' && item.wp === finding.id && ['Responded', 'Cleared'].includes(item.status))) {
    note.status = 'Reopened';
    note.history.push({
      actor: state.currentPerson,
      action: 'Reopened after finding revision',
      time: now,
      text: `Finding revision changed to v${finding.revision || 1}; previous response remains historical.`
    });
  }
}

/** Review-note revision the note is bound to (finding revision or workpaper version). */
export function reviewSubjectRevision(state: PrototypeState, eng: EngagementRecord, note: ReviewNoteItem): number {
  if (note.subjectType === 'finding') {
    const finding = state.findings.find(item => item.id === note.wp && item.engagementId === eng.id);
    if (!finding) throw new Error(`Review finding "${note.wp}" was not found in this engagement.`);
    return finding.revision || 1;
  }
  const workpaper = eng.workpapers.find(item => item.id === note.wp);
  if (!workpaper) throw new Error(`Review workpaper "${note.wp}" was not found.`);
  return workpaper.version;
}

/** True when a newer revision supersedes this document. */
export function hasNewerDocumentRevision(state: PrototypeState, documentId: string): boolean {
  return state.documents.some(document => document.supersedesDocumentId === documentId);
}
