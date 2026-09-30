import type { PrototypeState, AdjustmentJournalSupportLinks } from '../types';
import { GuardError } from './guards';

export function assertAdjustmentSupport(state: PrototypeState, engagementId: string, links?: AdjustmentJournalSupportLinks) {
    if (!links || (!links.evidence && !links.workpaper && !links.finding)) return;
    const engagement = state.engagements.find(item => item.id === engagementId);
    if (!engagement) throw new GuardError('FORBIDDEN_SCOPE', 'Journal support must belong to an available engagement.');
    if (links.evidence) {
      const pin = links.evidence;
      const evidence = state.evidenceCatalogue.find(item => item.id === pin.id);
      const document = evidence && state.documents.find(item => item.id === evidence.documentId);
      if (!evidence || !document || document.id !== pin.documentId || document.clientId !== engagement.client || document.engagementId !== engagementId || document.brokenLink) {
        throw new GuardError('FORBIDDEN_SCOPE', 'Linked evidence must resolve to an available document within this engagement and client.');
      }
      if (state.documents.some(item => item.supersedesDocumentId === document.id)) throw new GuardError('STALE_REVISION', 'Linked evidence points to a superseded document. Select evidence for the current document revision.');
      if (evidence.adequacyStatus !== 'Adequate' || evidence.version !== pin.evidenceVersion || document.version !== pin.documentVersion || evidence.version !== document.version) {
        throw new GuardError('STALE_REVISION', 'Linked evidence is not adequate at the pinned current evidence and document revisions. Select a current adequate evidence record.');
      }
    }
    if (links.workpaper) {
      const workpaper = engagement.workpapers.find(item => item.id === links.workpaper!.id);
      if (!workpaper || !workpaper.applicable || workpaper.status === 'Not applicable') throw new GuardError('FORBIDDEN_SCOPE', 'Linked workpaper must be available and applicable within this engagement.');
      if (workpaper.version !== links.workpaper.version) throw new GuardError('STALE_REVISION', 'Linked workpaper revision is stale. Select its current revision.');
    }
    if (links.finding) {
      const finding = state.findings.find(item => item.id === links.finding!.id && item.engagementId === engagementId);
      if (!finding) throw new GuardError('FORBIDDEN_SCOPE', 'Linked finding must belong to this engagement.');
      if ((finding.revision || 1) !== links.finding.revision) throw new GuardError('STALE_REVISION', 'Linked finding revision is stale. Select its current revision.');
    }
}

export function adjustmentSupportIssues(state: PrototypeState, engagementId: string): Record<string,string> {
  return Object.fromEntries(state.adjustmentJournals.filter(j => j.engagementId === engagementId).flatMap(j => {
    try { assertAdjustmentSupport(state,engagementId,j.supportLinks); return []; }
    catch(error) { return [[j.id,error instanceof Error ? error.message : 'Journal support unavailable']]; }
  }));
}
