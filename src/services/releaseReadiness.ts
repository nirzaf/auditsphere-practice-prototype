import type { EngagementRecord, PrototypeState } from '../types';
import { isReleaseBlockingFinding } from './findings';

export interface ReleaseReadiness {
  ready: boolean;
  reason?: string;
  blockers: string[];
  approvals: {
    manager: boolean;
    client: boolean;
    partner: boolean;
    eqr: boolean;
    managementAcknowledgement: boolean;
  };
}

function naturalPersonId(state: PrototypeState, userId?: string, name?: string): string | undefined {
  const user = state.users.find(item => item.id === userId) || state.users.find(item => item.name === name);
  return user?.personId || user?.id || name;
}

/** Read-only mirror of the store's authoritative release preconditions. */
export function evaluateReleaseReadiness(engagement: EngagementRecord | undefined, state: PrototypeState): ReleaseReadiness {
  const blockers: string[] = [];
  if (!engagement) {
    return { ready: false, reason: 'Engagement not found', blockers: ['Engagement not found'], approvals: { manager: false, client: false, partner: false, eqr: false, managementAcknowledgement: false } };
  }

  const generation = engagement.generation;
  const managerApproval = engagement.approvals?.manager;
  const clientApproval = engagement.approvals?.client;
  const partnerApproval = engagement.approvals?.partner;
  const eqrApproval = engagement.approvals?.eqr;
  const managerPerson = naturalPersonId(state, managerApproval?.byUserId, managerApproval?.by);
  const partnerPerson = naturalPersonId(state, partnerApproval?.byUserId, partnerApproval?.by);
  const distinctManagerPartner = !managerPerson || !partnerPerson || managerPerson !== partnerPerson;
  const approvals = {
    manager: Boolean(managerApproval && managerApproval.generation === generation && distinctManagerPartner),
    client: Boolean(clientApproval && clientApproval.generation === generation && (!clientApproval.byUserId || state.users.find(user => user.id === clientApproval.byUserId)?.role === 'client')),
    partner: Boolean(partnerApproval && partnerApproval.generation === generation && distinctManagerPartner && (!partnerApproval.byUserId || state.users.find(user => user.id === partnerApproval.byUserId)?.role === 'partner')),
    eqr: Boolean(eqrApproval && eqrApproval.generation === generation && (!eqrApproval.byUserId || state.users.find(user => user.id === eqrApproval.byUserId)?.role === 'eqr')),
    managementAcknowledgement: Boolean(
      engagement.managementPresentation?.generation === generation &&
      engagement.managementPresentation.sourceVersion === engagement.sourceVersion &&
      engagement.managementPresentation.packageRevision === engagement.packageRevision &&
      engagement.managementPackageDecision?.decision === 'Acknowledged' &&
      engagement.managementPackageDecision.generation === generation &&
      engagement.managementPackageDecision.sourceVersion === engagement.sourceVersion &&
      engagement.managementPackageDecision.packageRevision === engagement.packageRevision
    )
  };

  if (!engagement.acceptance || !engagement.terms) blockers.push('Commercial acceptance or agreed terms are missing');
  if (!engagement.planning || !engagement.sourceAccepted || !engagement.mappingApproved) blockers.push('Planning, accepted source, or approved mapping is missing');

  const allWorkpapersCurrent = (engagement.workpapers || []).every(workpaper =>
    !workpaper.applicable || workpaper.status === 'Not applicable' || (
      workpaper.status === 'Cleared' &&
      workpaper.clearance !== null && workpaper.clearance !== undefined &&
      workpaper.clearance.version === workpaper.version &&
      workpaper.clearance.sourceVersion === engagement.sourceVersion
    )
  );
  if (!allWorkpapersCurrent) blockers.push('One or more workpapers are not cleared or marked N/A');
  if (!(engagement.reviews || []).every(review => review.status === 'Cleared')) blockers.push('One or more review notes remain open');
  if (state.findings.some(finding => finding.engagementId === engagement.id && isReleaseBlockingFinding(finding))) blockers.push('Unresolved material findings exist');
  if (!approvals.manager) blockers.push(`Manager clearance missing or invalid for generation ${generation}`);
  if (!approvals.client) blockers.push(`Client management representation missing or invalid for generation ${generation}`);
  if (!approvals.managementAcknowledgement) blockers.push(`Current management package acknowledgement missing for generation ${generation}`);
  if (!approvals.partner) blockers.push(`Partner sign-off missing or invalid for generation ${generation}`);
  if (engagement.eqrRequired) {
    if (!approvals.eqr) blockers.push(`EQR concurrence missing or invalid for generation ${generation}`);
    if (engagement.eqrConcerns?.some(concern => !concern.resolved)) blockers.push('Unresolved EQR concerns remain');
  }

  const latestGLSource = engagement.glSourceHistory?.at(-1);
  const currentMappingRevision = Math.max(0, ...(state.accountMappingRevisions || [])
    .filter(revision => revision.engagementId === engagement.id)
    .map(revision => revision.revision));
  const currentPackage = engagement.packageHistory?.find(packageRevision => packageRevision.revision === engagement.packageRevision);
  const packageCurrent = Boolean(
    currentPackage &&
    currentPackage.engagementId === engagement.id &&
    currentPackage.generation === generation &&
    currentPackage.sourceVersion === engagement.sourceVersion &&
    currentPackage.glSourceRevision === latestGLSource?.revision &&
    currentPackage.glSourceSha256 === latestGLSource?.sha256 &&
    currentPackage.mappingRevision === currentMappingRevision &&
    currentPackage.validation.passed &&
    currentPackage.artifacts.length === 3
  );
  if (!packageCurrent) blockers.push('Assemble a valid current package revision with current TB/GL source, mapping and XLSX, DOCX and PDF artifacts first');

  return { ready: blockers.length === 0, reason: blockers[0], blockers, approvals };
}
