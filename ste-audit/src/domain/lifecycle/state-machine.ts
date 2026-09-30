/**
 * Immutable 11-stage engagement state machine (spec §5).
 *
 * The machine is a pure function: it never mutates its inputs and it is the ONLY
 * authority permitted to move an engagement between states. Callers read the
 * outcome and persist it inside a transaction; an illegal or gate-blocked
 * transition produces a violation list instead of a new state.
 */
import { ARCHIVE_COUNTDOWN_DAYS } from '../constants';
import { isTerminal, type EngagementEvent, type EngagementState } from './states';

/** All facts the machine may consider. Derived by the caller from persisted records. */
export interface EngagementGateFacts {
  /** Module 1 — lead ingestion. */
  entityProfileComplete: boolean;
  primaryContactDefined: boolean;
  contactRoutingComplete: boolean;
  /** Module 1 — proposal dispatch. */
  proposalDispatchedVia: 'Email' | 'WhatsApp' | null;
  /** Module 1 — Dual-Key gate (Key 1 client approval, Key 2 Partner AML/KYC). */
  dualKey: { key1ClientApproval: boolean; key2PartnerClearance: boolean };
  /** Module 1 — 50% advance. */
  advance: { requiredQar: number; recordedQar: number; receiptDocumentId: string | null };
  /** Module 2 — planning sign-off and TB mapping. */
  planningSignedOffByPartner: boolean;
  tbMappedToFslis: boolean;
  /** Module 3 — fieldwork and review. */
  fieldProcedures: { total: number; submitted: number };
  review: { openNotes: number; srmCompiled: boolean };
  confirmations: { criticalOutstanding: number };
  /** Module 4 — partner approval and release. */
  partnerApproval: { signatureApplied: boolean; opinionSelected: boolean; redRiskAreasCleared: boolean };
  release: { packageGenerated: boolean; deliveredToClient: boolean };
  /** Module 4 — ISA 230 countdown. */
  archive: { signatureDate: string | null; daysSinceSignature: number | null; manualLock: boolean };
}

export interface TransitionDefinition {
  from: EngagementState;
  to: EngagementState;
  event: EngagementEvent;
  /** Spec §5 "Allowed Actions" copy. */
  allowedActions: string;
  /** Spec §5 "Gate / Condition to Advance" copy. */
  gate: string;
  check: (facts: EngagementGateFacts) => string[];
}

const exactlyFiftyPercent = (facts: EngagementGateFacts): string[] => {
  const { requiredQar, recordedQar } = facts.advance;
  const violations: string[] = [];
  if (!(requiredQar > 0))
    violations.push('The accepted engagement fee has not been pinned, so the 50% advance cannot be verified.');
  if (!Number.isFinite(recordedQar) || recordedQar !== requiredQar)
    violations.push(
      `The recorded advance (${recordedQar} QAR) must equal exactly the required 50% (${requiredQar} QAR).`
    );
  if (!facts.advance.receiptDocumentId)
    violations.push('An official receipt document must be generated for the recorded advance.');
  return violations;
};

export const TRANSITIONS: TransitionDefinition[] = [
  {
    from: 'LEAD_INGESTION',
    to: 'PROPOSAL_GENERATION',
    event: 'completeLeadIngestion',
    allowedActions: 'Log inquiry, capture company and contact data',
    gate: 'Minimum entity and primary contact data validated',
    check: (f) => {
      const v: string[] = [];
      if (!f.entityProfileComplete)
        v.push('Capture the client entity profile (legal name, CR/TIN, relationship).');
      if (!f.primaryContactDefined)
        v.push('Record at least one primary contact before generating a proposal.');
      return v;
    }
  },
  {
    from: 'PROPOSAL_GENERATION',
    to: 'DUAL_KEY_PENDING',
    event: 'dispatchProposal',
    allowedActions: 'Build Brief Quote or Comprehensive Proposal, dispatch to client',
    gate: 'Proposal dispatched via Email / WhatsApp',
    check: (f) =>
      f.proposalDispatchedVia === 'Email' || f.proposalDispatchedVia === 'WhatsApp'
        ? []
        : ['Dispatch the quote/proposal to the client by Email or WhatsApp.']
  },
  {
    from: 'DUAL_KEY_PENDING',
    to: 'ADVANCE_BILLING',
    event: 'clearDualKey',
    allowedActions: 'Complete Client Acceptance Checklist (AML/KYC), record client commercial approval',
    gate: 'Dual-Key Clearance: Both Client Acceptance AND Partner AML Approval confirmed',
    check: (f) => {
      const v: string[] = [];
      if (!f.dualKey.key1ClientApproval)
        v.push('Key 1 — the client has not recorded commercial approval of the current proposal revision.');
      if (!f.dualKey.key2PartnerClearance)
        v.push('Key 2 — the Engagement Partner has not completed AML/KYC risk clearance.');
      return v;
    }
  },
  {
    from: 'ADVANCE_BILLING',
    to: 'PORTAL_ACTIVE_PLANNING',
    event: 'confirmAdvance',
    allowedActions: 'Generate Engagement Letter & 50% Advance Invoice',
    gate: '50% advance payment confirmed and recorded',
    check: exactlyFiftyPercent
  },
  {
    from: 'PORTAL_ACTIVE_PLANNING',
    to: 'FIELDWORK_EXECUTION',
    event: 'signOffPlanning',
    allowedActions: 'Provision Client Portal, schedule team, ingest Trial Balance, calculate materiality',
    gate: 'Planning signed off by Partner, TB mapped to FSLIs',
    check: (f) => {
      const v: string[] = [];
      if (!f.planningSignedOffByPartner)
        v.push('The Engagement Partner has not signed off on planning and materiality.');
      if (!f.tbMappedToFslis)
        v.push('The trial balance has not been fully mapped to financial statement line items.');
      return v;
    }
  },
  {
    from: 'FIELDWORK_EXECUTION',
    to: 'MANAGERIAL_REVIEW',
    event: 'submitFieldwork',
    allowedActions: 'Execute workprograms, attach digital/physical evidence, log confirmation requests',
    gate: 'All assigned FSLI procedures submitted by Preparers',
    check: (f) => {
      const v: string[] = [];
      if (f.fieldProcedures.total <= 0) v.push('No audit procedures exist for this engagement yet.');
      if (f.fieldProcedures.submitted !== f.fieldProcedures.total)
        v.push(
          `${f.fieldProcedures.submitted} of ${f.fieldProcedures.total} procedures are submitted; every assigned FSLI procedure must be submitted before managerial review.`
        );
      return v;
    }
  },
  {
    from: 'MANAGERIAL_REVIEW',
    to: 'PARTNER_APPROVAL',
    event: 'completeManagerReview',
    allowedActions: 'Review workpapers, issue review notes/rework, compile SRM',
    gate: 'Zero open review notes, SRM compiled, critical confirmations returned',
    check: (f) => {
      const v: string[] = [];
      if (f.review.openNotes > 0)
        v.push(
          `${f.review.openNotes} review note(s) are still open; clear or rework them before Partner approval.`
        );
      if (!f.review.srmCompiled) v.push('The Summary Review Memorandum (SRM) has not been compiled.');
      if (f.confirmations.criticalOutstanding > 0)
        v.push(
          `${f.confirmations.criticalOutstanding} critical confirmation(s) are outstanding; issue a holding letter and obtain responses before final reporting.`
        );
      return v;
    }
  },
  {
    from: 'PARTNER_APPROVAL',
    to: 'DELIVERABLE_RELEASE',
    event: 'applyPartnerSignature',
    allowedActions: 'Partner inspects SRM, reviews Red-risk areas, selects Audit Opinion',
    gate: 'Partner applies digital signature and firm seal',
    check: (f) => {
      const v: string[] = [];
      if (!f.partnerApproval.redRiskAreasCleared)
        v.push('Red (critical) risk areas have not been cleared by the Partner.');
      if (!f.partnerApproval.opinionSelected) v.push('No ISA 700/705 audit opinion has been selected.');
      if (!f.partnerApproval.signatureApplied)
        v.push('The Partner digital signature and firm seal have not been applied to the certified report.');
      return v;
    }
  },
  {
    from: 'DELIVERABLE_RELEASE',
    to: 'COMPLIANCE_COUNTDOWN',
    event: 'releaseDeliverables',
    allowedActions:
      'Generate 5-part deliverables package, issue 50% balance invoice, freeze client portal uploads',
    gate: 'Final package generated and delivered to client',
    check: (f) => {
      const v: string[] = [];
      if (!f.release.packageGenerated)
        v.push('The mandatory 5-part deliverables bundle has not been generated.');
      if (!f.release.deliveredToClient)
        v.push('The final package has not been recorded as delivered to the client.');
      return v;
    }
  },
  {
    from: 'COMPLIANCE_COUNTDOWN',
    to: 'ARCHIVED_READ_ONLY',
    event: 'lockArchive',
    allowedActions: 'Review final archive; Partner may trigger early lock',
    gate: '60 calendar days elapsed since signature date OR manual lock triggered',
    check: (f) => {
      const v: string[] = [];
      if (f.archive.manualLock) return v;
      if (!f.archive.signatureDate) {
        v.push('The archive countdown cannot start: the Partner signature date is not recorded.');
        return v;
      }
      if (f.archive.daysSinceSignature === null || f.archive.daysSinceSignature < ARCHIVE_COUNTDOWN_DAYS)
        v.push(
          `The ISA 230 file completion period has not elapsed (${f.archive.daysSinceSignature ?? 0} of ${ARCHIVE_COUNTDOWN_DAYS} days).`
        );
      return v;
    }
  }
];
