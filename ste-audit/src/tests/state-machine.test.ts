import { describe, expect, it } from 'vitest';
import { TRANSITIONS, type EngagementGateFacts } from '../domain/lifecycle/state-machine';
import { ENGAGEMENT_STATES, isTerminal, stateIndex } from '../domain/lifecycle/states';

describe('11-Stage Engagement State Machine (spec §5)', () => {
  it('has 11 sequential states ending with ARCHIVED_READ_ONLY as terminal', () => {
    expect(ENGAGEMENT_STATES.length).toBe(11);
    expect(ENGAGEMENT_STATES[0]).toBe('LEAD_INGESTION');
    expect(ENGAGEMENT_STATES[10]).toBe('ARCHIVED_READ_ONLY');
    expect(isTerminal('ARCHIVED_READ_ONLY')).toBe(true);
    expect(isTerminal('LEAD_INGESTION')).toBe(false);
  });

  const baseFacts: EngagementGateFacts = {
    entityProfileComplete: false,
    primaryContactDefined: false,
    contactRoutingComplete: false,
    proposalDispatchedVia: null,
    dualKey: { key1ClientApproval: false, key2PartnerClearance: false },
    advance: { requiredQar: 40_000, recordedQar: 0, receiptDocumentId: null },
    planningSignedOffByPartner: false,
    tbMappedToFslis: false,
    fieldProcedures: { total: 10, submitted: 0 },
    review: { openNotes: 0, srmCompiled: false },
    confirmations: { criticalOutstanding: 0 },
    partnerApproval: { signatureApplied: false, opinionSelected: false, redRiskAreasCleared: false },
    release: { packageGenerated: false, deliveredToClient: false },
    archive: { signatureDate: null, daysSinceSignature: null, manualLock: false }
  };

  it('blocks LEAD_INGESTION -> PROPOSAL_GENERATION until entity and contact profile exist', () => {
    const transition = TRANSITIONS.find(t => t.from === 'LEAD_INGESTION')!;
    expect(transition).toBeDefined();

    // Incomplete facts
    const violations = transition.check(baseFacts);
    expect(violations.length).toBe(2);

    // Complete facts
    const cleared = transition.check({
      ...baseFacts,
      entityProfileComplete: true,
      primaryContactDefined: true
    });
    expect(cleared.length).toBe(0);
  });

  it('hard-blocks DUAL_KEY_PENDING -> ADVANCE_BILLING until BOTH Key 1 and Key 2 are signed off', () => {
    const transition = TRANSITIONS.find(t => t.from === 'DUAL_KEY_PENDING')!;
    expect(transition).toBeDefined();

    // Neither key cleared
    let v = transition.check(baseFacts);
    expect(v.length).toBe(2);
    expect(v[0]).toContain('Key 1');
    expect(v[1]).toContain('Key 2');

    // Only Key 1 (client) cleared
    v = transition.check({
      ...baseFacts,
      dualKey: { key1ClientApproval: true, key2PartnerClearance: false }
    });
    expect(v.length).toBe(1);
    expect(v[0]).toContain('Key 2');

    // Only Key 2 (partner) cleared
    v = transition.check({
      ...baseFacts,
      dualKey: { key1ClientApproval: false, key2PartnerClearance: true }
    });
    expect(v.length).toBe(1);
    expect(v[0]).toContain('Key 1');

    // Both cleared
    v = transition.check({
      ...baseFacts,
      dualKey: { key1ClientApproval: true, key2PartnerClearance: true }
    });
    expect(v.length).toBe(0);
  });

  it('strictly validates 50% advance settlement before PORTAL_ACTIVE_PLANNING', () => {
    const transition = TRANSITIONS.find(t => t.from === 'ADVANCE_BILLING')!;

    // No payment
    let v = transition.check(baseFacts);
    expect(v.length).toBeGreaterThan(0);

    // Partial payment (e.g. 20k of 40k)
    v = transition.check({
      ...baseFacts,
      advance: { requiredQar: 40_000, recordedQar: 20_000, receiptDocumentId: 'doc-rcpt-1' }
    });
    expect(v.length).toBe(1);
    expect(v[0]).toContain('must equal exactly the required 50%');

    // Exact 50% with receipt
    v = transition.check({
      ...baseFacts,
      advance: { requiredQar: 40_000, recordedQar: 40_000, receiptDocumentId: 'doc-rcpt-1' }
    });
    expect(v.length).toBe(0);
  });

  it('blocks MANAGERIAL_REVIEW -> PARTNER_APPROVAL when review notes or critical confirmations are open', () => {
    const transition = TRANSITIONS.find(t => t.from === 'MANAGERIAL_REVIEW')!;

    const v = transition.check({
      ...baseFacts,
      review: { openNotes: 2, srmCompiled: false },
      confirmations: { criticalOutstanding: 1 }
    });

    expect(v.length).toBe(3);
    expect(v[0]).toContain('2 review note(s) are still open');
    expect(v[1]).toContain('Summary Review Memorandum');
    expect(v[2]).toContain('1 critical confirmation(s) are outstanding');
  });

  it('enforces 60-day ISA 230 countdown or manual partner lock before final ARCHIVED_READ_ONLY', () => {
    const transition = TRANSITIONS.find(t => t.from === 'COMPLIANCE_COUNTDOWN')!;

    // Only 15 days elapsed without manual lock
    let v = transition.check({
      ...baseFacts,
      archive: { signatureDate: '2026-09-01', daysSinceSignature: 15, manualLock: false }
    });
    expect(v.length).toBe(1);
    expect(v[0]).toContain('period has not elapsed (15 of 60 days)');

    // 60 days elapsed
    v = transition.check({
      ...baseFacts,
      archive: { signatureDate: '2026-09-01', daysSinceSignature: 60, manualLock: false }
    });
    expect(v.length).toBe(0);

    // Early manual lock by Partner
    v = transition.check({
      ...baseFacts,
      archive: { signatureDate: '2026-09-01', daysSinceSignature: 5, manualLock: true }
    });
    expect(v.length).toBe(0);
  });
});
