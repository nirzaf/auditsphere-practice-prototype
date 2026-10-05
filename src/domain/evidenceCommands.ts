// Browser-free evidence-catalogue commands (VP-053).
//
// Version-pinned shared references: an evidence record pins a document revision and
// an adequacy determination. Single implementation shared by the browser store and
// the Cloudflare Worker; ported faithfully from prototypeStore.setEvidenceAdequacy.

import type { PrototypeState } from '../types';
import { GuardError, requireActiveIdentity, requireClientScope, requireEngagementScope } from '../services/guards';
import { requireRoleKey } from './clientCommands';
import type { CommandContext } from './commandContext';
import { invalidateReleaseBasis } from './crmEngagementHelpers';
import { hasNewerDocumentRevision, reopenWorkpaperReviewNotes } from './sharedHelpers';

export type EvidenceAdequacy = 'Adequate' | 'Pending verification' | 'Deficient';

export function setEvidenceAdequacyCommand(
  state: PrototypeState,
  evidenceId: string,
  status: EvidenceAdequacy,
  rationale: string,
  ctx: CommandContext
): { evidenceId: string } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['manager', 'reviewer', 'partner', 'eqr'], 'set evidence adequacy');
  const ev = state.evidenceCatalogue.find(e => e.id === evidenceId);
  if (!ev) throw new GuardError('INVALID_STATE', 'Evidence record not found.');
  const evidenceDocument = state.documents.find(d => d.id === ev.documentId);
  if (!evidenceDocument) throw new GuardError('INVALID_STATE', 'Evidence document was not found.');
  if (evidenceDocument.clientId) requireClientScope(state, evidenceDocument.clientId);
  if (evidenceDocument.engagementId) requireEngagementScope(state, evidenceDocument.engagementId);
  if (status === 'Adequate' && evidenceDocument.brokenLink) throw new GuardError('INVALID_STATE', 'An unavailable document reference cannot be marked adequate.');
  if (status !== 'Adequate' && !rationale.trim()) throw new GuardError('INVALID_STATE', 'A non-adequate determination requires a recorded rationale.');

  const changed = ev.adequacyStatus !== status;
  ev.adequacyStatus = status;
  ev.adequacyHistory ||= [];
  if (changed) ev.adequacyHistory.push({ status, actorId: state.currentUserId, rationale: rationale.trim(), at: ctx.now() });

  if (changed) {
    for (const program of state.auditPrograms) for (const procedure of program.procedures) {
      if (!ev.linkedProcedures.includes(procedure.id)) continue;
      const engagement = state.engagements.find(item => item.id === (procedure.engagementId || program.engagementId || evidenceDocument.engagementId));
      if (!engagement) continue;
      procedure.evidenceReassessmentHistory ||= [];
      procedure.evidenceReassessmentHistory.push({
        documentId: ev.documentId, version: ev.version, previousStatus: procedure.status,
        reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: ctx.now()
      });
      procedure.evidenceReassessmentRequired = true;
      if (procedure.status === 'Cleared' || procedure.status === 'Submitted') procedure.status = 'In progress';
      procedure.reviewedByUserId = undefined;
      procedure.reviewedAt = undefined;
      invalidateReleaseBasis(engagement);
    }
    for (const engagement of state.engagements) for (const workpaper of engagement.workpapers) {
      if (!workpaper.evidenceRefs?.includes(ev.documentId)) continue;
      if (!workpaper.clearance && !workpaper.submittedVersion && workpaper.status !== 'Cleared' && workpaper.status !== 'Submitted') continue;
      if (workpaper.clearance) workpaper.clearanceHistory.push({ ...workpaper.clearance });
      workpaper.clearance = null;
      workpaper.submittedBy = undefined;
      workpaper.submittedVersion = undefined;
      workpaper.version++;
      reopenWorkpaperReviewNotes(state, engagement, workpaper, ctx.now());
      workpaper.status = 'Changes required';
      invalidateReleaseBasis(engagement);
    }
  }
  ctx.log(`Evidence ${evidenceId} adequacy set to ${status} by ${state.currentPerson}${rationale ? ': ' + rationale : ''}`, evidenceId);
  ctx.notify();
  return { evidenceId };
}

export function linkEvidenceProcedureCommand(
  state: PrototypeState,
  evidenceId: string,
  procedureId: string,
  ctx: CommandContext
): { evidenceId: string; procedureId: string } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['manager', 'preparer', 'reviewer', 'partner', 'eqr'], 'link evidence to a procedure');
  const ev = state.evidenceCatalogue.find(e => e.id === evidenceId);
  if (!ev) throw new GuardError('INVALID_STATE', 'Evidence record not found.');
  const doc = state.documents.find(d => d.id === ev.documentId);
  if (!doc) throw new GuardError('INVALID_STATE', 'Evidence document was not found.');
  const eng = state.engagements.find(e => e.id === (doc?.engagementId || state.selectedEngagement));
  if (!eng) throw new GuardError('INVALID_STATE', 'Select an engagement for this evidence link.');
  requireEngagementScope(state, eng.id);
  if (!state.auditPrograms.some(p => (p.engagementId === eng.id || (!p.engagementId && eng.id === state.engagements[0]?.id)) && p.procedures.some(proc => proc.id === procedureId))) throw new GuardError('INVALID_STATE', 'Procedure was not found in the selected engagement.');
  if (doc.clientId) requireClientScope(state, doc.clientId);
  if (doc.engagementId && doc.engagementId !== eng.id) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same engagement.');
  if (doc.clientId !== eng.client) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same client.');
  if (doc.brokenLink || ev.adequacyStatus !== 'Adequate' || doc.version !== ev.version || hasNewerDocumentRevision(state, doc.id)) throw new GuardError('STALE_REVISION', 'Only an available, adequate evidence record pinned to the current document revision can be linked.');
  if (!ev.linkedProcedures.includes(procedureId)) {
    ev.linkedProcedures.push(procedureId);
    ev.linkedProcedureHistory ||= [];
    ev.linkedProcedureHistory.push({ procedureId, action: 'Linked', actorId: state.currentUserId, reason: 'Linked to scoped audit procedure', at: ctx.now() });
    invalidateReleaseBasis(eng);
  }
  ctx.log(`Evidence ${evidenceId} linked to procedure ${procedureId}`, evidenceId);
  ctx.notify();
  return { evidenceId, procedureId };
}

export function unlinkEvidenceProcedureCommand(
  state: PrototypeState,
  evidenceId: string,
  procedureId: string,
  reason: string,
  ctx: CommandContext
): { evidenceId: string; procedureId: string } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['manager', 'preparer', 'reviewer', 'partner', 'eqr'], 'unlink evidence from a procedure');
  const evidence = state.evidenceCatalogue.find(item => item.id === evidenceId);
  const document = evidence && state.documents.find(item => item.id === evidence.documentId);
  if (!evidence || !document || !evidence.linkedProcedures.includes(procedureId) || !reason.trim()) throw new GuardError('INVALID_STATE', 'A linked evidence record, procedure and unlink rationale are required.');
  const program = state.auditPrograms.find(item => item.procedures.some(procedure => procedure.id === procedureId));
  const procedure = program?.procedures.find(item => item.id === procedureId);
  const engagementId = procedure?.engagementId || program?.engagementId || document.engagementId;
  const engagement = state.engagements.find(item => item.id === engagementId);
  if (!procedure || !engagement) throw new GuardError('INVALID_STATE', 'Procedure was not found in the evidence scope.');
  requireEngagementScope(state, engagement.id);
  if (document.clientId) requireClientScope(state, document.clientId);
  if (document.engagementId && document.engagementId !== engagement.id) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same engagement.');
  if (document.clientId !== engagement.client) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same client.');
  evidence.linkedProcedures = evidence.linkedProcedures.filter(id => id !== procedureId);
  evidence.linkedProcedureHistory ||= [];
  evidence.linkedProcedureHistory.push({ procedureId, action: 'Unlinked', actorId: state.currentUserId, reason: reason.trim(), at: ctx.now() });
  procedure.evidenceReassessmentHistory ||= [];
  procedure.evidenceReassessmentHistory.push({
    documentId: evidence.documentId, version: evidence.version, previousStatus: procedure.status,
    reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: ctx.now()
  });
  procedure.evidenceReassessmentRequired = true;
  if (procedure.status === 'Cleared' || procedure.status === 'Submitted') procedure.status = 'In progress';
  procedure.reviewedByUserId = undefined;
  procedure.reviewedAt = undefined;
  invalidateReleaseBasis(engagement);
  ctx.log(`Evidence ${evidenceId} unlinked from procedure ${procedureId}: ${reason.trim()}`, evidenceId);
  ctx.notify();
  return { evidenceId, procedureId };
}
