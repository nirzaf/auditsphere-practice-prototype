import { clientCorrespondenceLines, managementLetterLines, STANDARD_PAYMENT_TERMS } from '../services/clientOutputs';
import { REQUIRED_CONFIRMATION_TYPES, type RequiredConfirmationType } from '../types/targetLifecycle';
import type {
  EngagementRecord,
  GeneratedArtifactRecord,
  PrototypeState,
  RoleKey,
  TrialBalanceRow,
  WorkpaperItem
} from '../types';
import type {
  AuditOpinion,
  ConfirmationStatus,
  ExternalConfirmation,
  PhysicalEvidenceReference,
  StaffAllocation
} from '../types/targetLifecycle';
import {
  activePersona,
  GuardError,
  hasAnyRole,
  isClientRole,
  recordPrototypeSuperuserOverride,
  requireActiveIdentity,
  requireClientScope,
  requireEngagementScope,
  requireIndependentActor,
  visibleEngagementIds
} from '../services/guards';
import {
  acceptedProposal,
  STANDARD_CHARGE_OUT_RATES,
  activationBlockers,
  advanceBasis,
  advanceReceipts,
  billingSummary,
  criticalConfirmationBlockers,
  currentDeliverables,
  currentPlan,
  currentReview,
  currentSignatureAuthorization,
  emptyAuditLifecycle,
  fieldworkBlockers,
  firmTrialBalance,
  isFrozen,
  isIsoDate,
  managerReviewBlockers,
  money,
  modifiedOpinionBasisLines,
  opinionValidation,
  partnerReportingBasis,
  currentPartnerOpinion,
  plusDays,
  professionalBlockers,
  reportBasis,
  reviewBasis,
  targetReleaseBlockers,
  hasExactFivePartBundle, fsliRiskLevel, proposalMatchesEngagement
} from '../services/targetLifecycle';
import { createPDFBlob, createXLSXBlob, createDOCXBlob, type PDFVisualAssets } from '../services/exportService';
import { applyReportingAdjustments, calculateBalanceSheet, calculateIncomeStatement } from '../services/calculations';
import { requireRoutedContact } from '../services/contactRouting';
import { sealEngagementArchive } from '../services/archivePackage';
import { srmReviewSections } from '../services/reviewSchedules';
import { adjustmentSupportIssues } from '../services/adjustmentSupport';
import {
  artifactSha256,
  loadVerifiedArtifact,
  persistArtifact,
  persistArtifacts
} from '../services/artifactStore';

export type ArtifactWriter = (
  id: string,
  title: string,
  lines: string[],
  visuals?: PDFVisualAssets
) => Promise<GeneratedArtifactRecord>;
export async function writeLifecyclePDF(
  id: string,
  title: string,
  lines: string[],
  visuals?: PDFVisualAssets
): Promise<GeneratedArtifactRecord> {
  const representation = title === 'Letter of Representation';
  const blob = representation ? await createDOCXBlob(title, lines) : createPDFBlob(title, lines, visuals);
  const record: GeneratedArtifactRecord = {
    id,
    name: `${id.replaceAll(':', '_')}.${representation ? 'docx' : 'pdf'}`,
    kind: representation ? 'DOCX' : 'PDF',
    mimeType: blob.type,
    size: blob.size,
    sha256: await artifactSha256(blob)
  };
  await persistArtifact(record, blob);
  return record;
}
const uniqueId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const requireText = (value: string, label: string, min = 1) => {
  if (typeof value !== 'string' || value.trim().length < min || value.length > 5000)
    throw new GuardError(
      'INVALID_STATE',
      `${label} requires ${min > 1 ? 'a meaningful ' : ''}recorded value.`
    );
};
const requireMoney = (value: number, allowZero = false) => {
  if (
    !Number.isFinite(value) ||
    value < (allowZero ? 0 : 0.01) ||
    Math.abs(value * 100 - Math.round(value * 100)) > 1e-6
  )
    throw new GuardError(
      'INVALID_STATE',
      'Use a finite positive amount with at most two decimal places.'
    );
};
function fail(blockers: string[]) {
  if (blockers.length) throw new GuardError('INVALID_STATE', blockers.join(' '));
}
/** Compact non-cryptographic display digest for printed lineage lines (FNV-1a). */
function fingerprintDigest(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, '0')}`;
}

/** Commands operate on the host store's state; there is no second store or copied engagement truth. */
export class TargetLifecycleCommands {
  constructor(
    private getState: () => PrototypeState,
    private notify: () => void,
    private artifactWriter: ArtifactWriter = writeLifecyclePDF
  ) {}
  private get state() {
    return this.getState();
  }
  private engagement(id: string, roles: RoleKey[], activation = false): EngagementRecord {
    const state = this.state;
    requireActiveIdentity(state);
    if (!hasAnyRole(state, roles))
      throw new GuardError('FORBIDDEN_SCOPE', `This action requires ${roles.join(' / ')}.`);
    requireEngagementScope(state, id, 'administrative');
    const engagement = state.engagements.find((e) => e.id === id);
    if (!engagement) throw new GuardError('INVALID_STATE', 'Engagement was not found.');
    if (isFrozen(engagement, state.asOfDate))
      throw new GuardError(
        'INVALID_STATE',
        'This engagement is frozen and read-only. Use an explicit successor engagement for an amendment.'
      );
    engagement.auditLifecycle ||= emptyAuditLifecycle();
    if (activation) fail(activationBlockers(state, engagement));
    return engagement;
  }
  private event(engagement: EngagementRecord, action: string, reason: string) {
    const entry = {
      at: new Date().toISOString(),
      actorUserId: this.state.currentUserId,
      action,
      reason
    };
    engagement.auditLifecycle!.history.push(entry);
    engagement.events.push({
      text: `${action}: ${reason}`,
      ref: engagement.id,
      time: entry.at,
      type: 'lifecycle'
    });
    this.state.events.unshift({
      text: `${action}: ${reason}`,
      ref: engagement.id,
      time: entry.at,
      type: 'lifecycle'
    });
    this.notify();
  }
  private assignedPartner(engagement: EngagementRecord) {
    const user = this.state.users.find((u) => u.id === this.state.currentUserId);
    const partner = this.state.users.find(
      (u) => u.role === 'partner' && u.name === engagement.partner
    );
    if (!user || !partner || (user.personId || user.id) !== (partner.personId || partner.id)) {
      if (
        !recordPrototypeSuperuserOverride(
          this.state,
          'record an assigned Engagement Partner decision'
        )
      )
        throw new GuardError(
          'FORBIDDEN_SCOPE',
          'Only the assigned Engagement Partner may record this decision.'
        );
    }
  }
  public pinAcceptedProposal(engagementId: string, proposalId: string) {
    const engagement = this.engagement(engagementId, ['billing', 'manager', 'partner']);
    const proposal = this.state.proposals.find(
      (p) => p.id === proposalId && p.clientId === engagement.client
    );
    if (
      !proposal ||
      proposal.state !== 'Accepted' ||
      proposal.presentedSnapshot?.revision !== proposal.revision ||
      proposal.clientResponse?.revision !== proposal.revision ||
      !proposal.clientResponse.evidenceRef
    )
      throw new GuardError(
        'INVALID_STATE',
        'The exact presented proposal revision must be accepted with client evidence.'
      );
    if (proposal.totalAmount <= 0)
      throw new GuardError('INVALID_STATE', 'The accepted engagement fee must be positive.');
    if (!proposalMatchesEngagement(proposal,engagement))
      throw new GuardError('INVALID_STATE', 'Pin the proposal for this exact client, service and reporting period.');
    if (engagement.auditLifecycle!.commercialBasis && acceptedProposal(this.state,engagement)?.id === proposalId) return;
    engagement.auditLifecycle!.commercialBasis = { proposalId, revision: proposal.revision, engagementService: engagement.service, engagementPeriod: engagement.period, proposalPeriodEnd: proposal.periodEnd, proposalPeriodStart: proposal.periodStart, acceptedFee: proposal.presentedSnapshot.totalAmount, currency: proposal.currency };
    engagement.proposalId = proposalId;
    engagement.agreedFee = proposal.presentedSnapshot.totalAmount;
    engagement.currency = proposal.currency;
    engagement.terms = true;
    engagement.generation++;
    engagement.approvals.manager = null;
    engagement.approvals.partner = null;
    this.event(
      engagement,
      'Accepted Proposal / EL pinned',
      `${proposalId} revision ${proposal.revision}; fee ${engagement.agreedFee} ${engagement.currency}. Existing advance links remain historical until explicitly reconciled.`
    );
  }
  public recordAdvance(
    engagementId: string,
    input: {
      amount: number;
      date: string;
      reference: string;
      method: 'Bank transfer' | 'Cash' | 'Cheque' | 'Other';
    }
  ) {
    const engagement = this.engagement(engagementId, ['billing']);
    requireMoney(input.amount);
    requireText(input.reference, 'Payment reference');
    if (
      !isIsoDate(input.date) ||
      !['Bank transfer', 'Cash', 'Cheque', 'Other'].includes(input.method)
    )
      throw new GuardError('INVALID_STATE', 'Record a valid payment date and method.');
    const proposal = acceptedProposal(this.state, engagement),
      pin = engagement.auditLifecycle!.commercialBasis;
    if (!proposal || !pin)
      throw new GuardError(
        'INVALID_STATE',
        'Pin the accepted Proposal / EL fee before recording the advance.'
      );
    // Dual-Key Gate, Key 2 (spec Flow 1 + §5): no advance receipt may be recorded while
    // Partner risk clearance is missing, declined, conditional, or missing evidence.
    // Key 1 is the accepted proposal/EL revision checked above.
    const key2 = professionalBlockers(this.state, engagement);
    if (key2.length)
      throw new GuardError(
        'INVALID_STATE',
        `Dual-Key Gate: Partner risk clearance is incomplete — ${key2.join(' ')}`
      );
    const summary = billingSummary(this.state, engagement);
    const invoice = this.state.invoices.find(record => record.id === `INV-ADV-${engagement.id}` && record.engagementId === engagement.id && record.clientId === engagement.client && record.isAdvanceInvoice);
    if (!invoice || !engagement.engagementLetter?.firmStamp || !engagement.engagementLetter.partnerSignature || !['Approved', 'Issued', 'Paid'].includes(invoice.status)) throw new GuardError('INVALID_STATE', 'The Partner-issued engagement letter and exact 50% advance invoice are required before payment recording.');
    if (invoice.amount !== summary.expectedAdvance || invoice.currency !== engagement.currency) throw new GuardError('STALE_REVISION', 'Advance invoice must match the current contracted fee and currency.');
    if (summary.advance + input.amount > summary.expectedAdvance!)
      throw new GuardError(
        'INVALID_STATE',
        'Recorded advances cannot exceed the required 50% invoice. Reverse a wrong record explicitly.'
      );
    if (
      this.state.receipts.some(
        (r) =>
          r.clientId === engagement.client &&
          r.externalRef === input.reference.trim() &&
          !engagement.auditLifecycle!.advancePayments.some(
            (p) => p.receiptId === r.id && p.reversed
          )
      )
    )
      throw new GuardError('INVALID_STATE', 'That payment reference is already recorded.');
    const id = uniqueId('ADV');
    this.state.receipts.push({
      id,
      clientId: engagement.client,
      receiptNumber: id,
      amount: input.amount,
      currency: engagement.currency,
      date: input.date,
      method: input.method,
      externalRef: input.reference.trim(),
      reference: input.reference.trim(),
      notes: `Manually recorded synthetic advance for ${engagement.id}; no funds collected.`,
      allocatedAmount: input.amount,
      allocations: [{ invoiceId: invoice.id, amount: input.amount, allocatedAt: new Date().toISOString(), date: input.date }]
    });
    engagement.auditLifecycle!.advancePayments.push({
      receiptId: id,
      ...pin,
      recordedByUserId: this.state.currentUserId
    });
    invoice.paid = money(invoice.paid + input.amount);
    invoice.status = invoice.paid === invoice.amount ? 'Paid' : 'Issued';
    this.event(
      engagement,
      'Advance recorded',
      `${input.amount} ${engagement.currency}; ${input.reference}. Required advance: ${summary.expectedAdvance}; manual record, no external collection.`
    );
    return id;
  }
  public reverseAdvance(engagementId: string, receiptId: string, reason: string) {
    const engagement = this.engagement(engagementId, ['billing']);
    requireText(reason, 'Reversal reason');
    const payment = engagement.auditLifecycle!.advancePayments.find(
      (p) => p.receiptId === receiptId && !p.reversed
    );
    if (!payment) throw new GuardError('INVALID_STATE', 'An active advance record is required.');
    payment.reversed = true;
    const receipt = this.state.receipts.find(record => record.id === receiptId);
    for (const allocation of receipt?.allocations || []) {
      if (allocation.reversed) continue;
      const invoice = this.state.invoices.find(record => record.id === allocation.invoiceId);
      if (invoice) { invoice.paid = money(invoice.paid - allocation.amount); invoice.status = 'Issued'; }
      allocation.reversed = true; allocation.reversalReason = reason; allocation.reversalDate = this.state.asOfDate;
    }
    if (receipt) receipt.allocatedAmount = 0;
    payment.reversalReason = reason.trim();
    this.event(
      engagement,
      'Advance reversed',
      `${receiptId}: ${reason.trim()}. Receipt and downstream clearance are now stale.`
    );
  }
  public async generateOfficialReceipt(engagementId: string) {
    let engagement = this.engagement(engagementId, ['billing']);
    const recipient = requireRoutedContact(this.state.contacts.filter(contact => contact.clientId === engagement.client), 'invoices_receipts');
    const summary = billingSummary(this.state, engagement),
      receipts = advanceReceipts(this.state, engagement);
    if (!acceptedProposal(this.state, engagement) || !receipts.length)
      throw new GuardError(
        'INVALID_STATE',
        'Record an advance against the current accepted fee first.'
      );
    const basis = advanceBasis(this.state, engagement),
      actor = this.state.currentUserId;
    const existing = engagement.auditLifecycle!.receiptDocuments.find(d => d.basis === basis);
    if (existing) return existing.artifact;
    const liaison = requireRoutedContact(this.state.contacts.filter(c => c.clientId === engagement.client), 'pbc_requests');
    const client = this.state.clients.find((c) => c.id === engagement.client)!;
    const id = uniqueId(`RECEIPT-${engagement.id}`);
    const artifact = await this.artifactWriter(id, 'Official Receipt — Prototype', [
      `Client: ${client.name}`,
      `To: ${recipient.name} (${recipient.title || recipient.contactRole}); ${recipient.email}`,
      `Engagement: ${engagement.id} / ${engagement.period}`,
      `Accepted Proposal / EL: ${engagement.auditLifecycle!.commercialBasis!.proposalId} revision ${engagement.auditLifecycle!.commercialBasis!.revision}`,
      `Recorded amount: ${summary.advance} ${engagement.currency}`,
      `Required 50%: ${summary.expectedAdvance} ${engagement.currency}`,
      ...receipts.map(
        (r) => `${r.date} | ${r.method} | ${r.externalRef} | ${r.amount} ${r.currency}`
      ),
      `Recorded by: ${this.state.currentPerson}`,
      `Generated at: ${new Date().toISOString()}`,
      'Manual prototype payment record; no funds were collected or transmitted.'
    ]);
    engagement = this.engagement(engagementId, ['billing']);
    if (actor !== this.state.currentUserId || basis !== advanceBasis(this.state, engagement))
      throw new GuardError(
        'STALE_REVISION',
        'Advance changed while generating the receipt. Generate it again.'
      );
    const completed = engagement.auditLifecycle!.receiptDocuments.find(d => d.basis === basis);
    if (completed) return completed.artifact;
    engagement.auditLifecycle!.receiptDocuments.push({
      receiptIds: receipts.map((r) => r.id),
      basis,
      generatedAt: new Date().toISOString(),
      artifact
    });
    if (summary.advance === summary.expectedAdvance) {
      const path = `/Demo/${client.code}/${engagement.year}/${engagement.id}/`;
      engagement.auditLifecycle!.workspace ||= { path, preparedAt: new Date().toISOString(), preparedByUserId: actor };
      engagement.auditLifecycle!.workspace.accessVerifiedAt ||= new Date().toISOString();
      engagement.auditLifecycle!.workspace.accessVerifiedByUserId ||= actor;
      for (const name of ['01_Administration & Planning', '02_Trial Balance & Schedules', '03_Fieldwork & Testing', '04_Drafts & Deliverables', '05_Final Signed Archive']) {
        const folderPath = `${engagement.auditLifecycle!.workspace.path}${name}/`;
        if (!(this.state.folders ||= []).some(f => f.path === folderPath)) this.state.folders.push({ path: folderPath, label: name, clientId: client.id, engagementId });
      }
      engagement.auditLifecycle!.onboarding ||= { liaisonContactId: liaison.id, recipient: liaison.email || liaison.phone || liaison.name, at: new Date().toISOString(), status: 'Invitation issued (simulated)', requiresFirstLoginReset: true };
    }
    this.event(engagement, 'Official receipt generated', artifact.id);
    return artifact;
  }
  public verifyWorkspaceAccess(engagementId: string, note: string) {
    const engagement = this.engagement(engagementId, ['admin', 'manager', 'partner'], true);
    requireText(note, 'Access verification note');
    if (
      !engagement.auditLifecycle!.workspace ||
      !this.state.folders?.some((f) => f.engagementId === engagementId)
    )
      throw new GuardError('INVALID_STATE', 'Prepare the exact engagement workspace first.');
    engagement.auditLifecycle!.workspace.accessVerifiedAt = new Date().toISOString();
    engagement.auditLifecycle!.workspace.accessVerifiedByUserId = this.state.currentUserId;
    this.event(engagement, 'Simulated workspace access verified', note.trim());
  }
  public simulatePasswordChange() {
    requireActiveIdentity(this.state);
    if (!isClientRole(this.state.currentRole))
      throw new GuardError(
        'FORBIDDEN_SCOPE',
        'Only a client persona can complete the simulated first-login password change.'
      );
    const existing = this.state.portalPasswordChanges?.find(
      (p) => p.userId === this.state.currentUserId
    );
    if (existing) return;
    const at = new Date().toISOString();
    (this.state.portalPasswordChanges ||= []).push({
      userId: this.state.currentUserId,
      changedAt: at,
      history: [
        {
          at,
          actorUserId: this.state.currentUserId,
          action: 'Simulated mandatory password change',
          reason: 'No password or authentication credential is stored.'
        }
      ]
    });
    this.notify();
  }
  public delegatePortal(engagementId: string, userId: string) {
    const engagement = this.engagement(engagementId, ['client_admin'], true);
    requireClientScope(this.state, engagement.client);
    if (!engagement.auditLifecycle!.workspace?.accessVerifiedAt)
      throw new GuardError(
        'INVALID_STATE',
        'Verify the engagement workspace before delegating PBC access.'
      );
    const user = this.state.users.find(
      (u) =>
        u.id === userId &&
        u.status === 'Active' &&
        ['client_finance', 'client_admin'].includes(u.role)
    );
    const visible = visibleEngagementIds(this.state, userId);
    if (!user || visible === 'ALL' || !visible.includes(engagementId))
      throw new GuardError(
        'FORBIDDEN_SCOPE',
        'Delegate only to an active contributor already scoped to this engagement. Delegation never creates a grant.'
      );
    const list = (this.state.portalDelegations ||= []);
    if (list.some((d) => d.engagementId === engagementId && d.userId === userId && !d.revokedAt))
      return;
    list.push({
      engagementId,
      clientId: engagement.client,
      userId,
      delegatedByUserId: this.state.currentUserId,
      at: new Date().toISOString()
    });
    this.event(engagement, 'PBC task delegated', user.name);
  }
  public toggleRowLock(engagementId: string, fsli: string, expectedRevision: number) {
    const eng = this.engagement(engagementId, ['preparer', 'reviewer', 'manager', 'partner'], true);
    if (!eng.rows.some(r => r.mappedStatementLine === fsli)) throw new GuardError('INVALID_STATE', 'Choose a current mapped FSLI row.');
    const locks = eng.auditLifecycle!.rowLocks ||= {};
    const previous = locks[fsli];
    if ((previous?.revision || 0) !== expectedRevision) throw new GuardError('STALE_REVISION', 'The row lock changed; reload its current revision.');
    const active = previous && !previous.releasedAt && Date.parse(previous.expiresAt) > Date.now();
    if (active && previous.actorUserId !== this.state.currentUserId) throw new GuardError('INVALID_STATE', 'Another auditor holds this row; wait for release or expiry.');
    const now = new Date().toISOString();
    locks[fsli] = { actorUserId: this.state.currentUserId, revision: expectedRevision + 1, acquiredAt: now,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), ...(active ? { releasedAt: now } : {}) };
    this.event(eng, 'FSLI row lock revised (local simulation)', `${fsli}: v${expectedRevision + 1}; five-minute bounded lease.`);
  }
  public saveMilestones(engagementId: string, dates: { cutoff: string; fieldwork: string; draft: string; final: string }, reason: string) {
    const engagement = this.engagement(engagementId, ['manager', 'partner'], true);
    requireText(reason, 'Milestone revision reason');
    const ordered = [dates.cutoff, dates.fieldwork, dates.draft, dates.final];
    if (ordered.some(date => !isIsoDate(date)) || ordered.some((date, index) => index > 0 && date < ordered[index - 1])) throw new GuardError('INVALID_STATE', 'Milestones require valid dates in cutoff, fieldwork, draft, final order.');
    const history = engagement.auditLifecycle!.milestones ||= [];
    history.push({ ...dates, revision: history.length + 1, reason: reason.trim(), actorUserId: this.state.currentUserId, at: new Date().toISOString() });
    this.event(engagement, 'Statutory milestones revised', reason);
  }
  public saveStaffing(engagementId: string, allocations: StaffAllocation[], reason: string) {
    const engagement = this.engagement(engagementId, ['manager', 'partner'], true);
    requireText(reason, 'Staffing revision reason');
    const roles: StaffAllocation['role'][] = [
      'Partner',
      'Manager',
      'Senior/Reviewer',
      'Preparer/Staff'
    ];
    if (!allocations.length || ['Partner','Manager','Preparer/Staff'].some((r) => !allocations.some((a) => a.role === r)))
      throw new GuardError('INVALID_STATE', 'Assign Partner, Manager and associate responsibilities; Senior/Reviewer is an optional charge-out grade.');
    for (const a of allocations) {
      const user = this.state.users.find((u) => u.id === a.userId && u.status === 'Active');
      const validRoles: Record<StaffAllocation['role'], RoleKey[]> = {
        Partner: ['partner'],
        Manager: ['manager'],
        'Senior/Reviewer': ['reviewer', 'manager'],
        'Preparer/Staff': ['preparer']
      };
      if (!user || !validRoles[a.role]?.includes(user.role))
        throw new GuardError(
          'INVALID_STATE',
          'Assign active staff with the matching professional role.'
        );
      const visible = visibleEngagementIds(this.state, user.id);
      if (visible !== 'ALL' && !visible.includes(engagementId))
        throw new GuardError('FORBIDDEN_SCOPE', 'Every assignee requires engagement scope.');
      if (
        !Number.isFinite(a.plannedHours) ||
        a.plannedHours <= 0 ||
        a.plannedHours > 2000 ||
        !['Planning', 'Fieldwork', 'Review', 'Reporting'].includes(a.phase) ||
        !isIsoDate(a.startDate) ||
        !isIsoDate(a.endDate) ||
        a.startDate > a.endDate
      )
        throw new GuardError(
          'INVALID_STATE',
          'Use positive hours, an audit phase and a valid scheduled date range.'
        );
      if ([a.capacityHours, a.leaveHours, a.targetUtilizationPct].some(v => v !== undefined && (!Number.isFinite(v) || v < 0)) || (a.capacityHours !== undefined && a.capacityHours <= 0) || (a.targetUtilizationPct !== undefined && a.targetUtilizationPct > 100) || (a.capacityHours !== undefined && (a.leaveHours || 0) > a.capacityHours)) throw new GuardError('INVALID_STATE', 'Availability needs positive capacity, bounded leave and a 0–100% utilization target.');
      if (a.chargeRate !== null) requireMoney(a.chargeRate, true);
      if (engagement.currency === 'QAR' && a.chargeRate !== null && a.chargeRate !== STANDARD_CHARGE_OUT_RATES[a.role]) throw new GuardError('INVALID_STATE', 'Use the standard QAR role charge-out rate, or leave the rate explicitly Unknown.');
      if (a.costRate !== null) requireMoney(a.costRate, true);
    }
    for (const person of new Set(allocations.map(a => a.userId))) {
      const own = allocations.filter(a => a.userId === person), capacity = own[0].capacityHours;
      if (capacity === undefined) continue;
      if (own.some(a => a.capacityHours !== capacity || (a.leaveHours || 0) !== (own[0].leaveHours || 0))) throw new GuardError('INVALID_STATE', 'Use one consistent capacity/leave interval per person across phases.');
      const overlaps = this.state.engagements.filter(e => e.id !== engagementId && !isFrozen(e)).flatMap(e => e.auditLifecycle?.staffing.at(-1)?.allocations || []).filter(a => a.userId === person && own.some(b => a.startDate <= b.endDate && b.startDate <= a.endDate));
      if ([...own, ...overlaps].reduce((n,a) => n + a.plannedHours,0) > capacity - (own[0].leaveHours || 0)) throw new GuardError('INVALID_STATE', 'Overlapping engagement allocations exceed recorded person capacity less leave.');
    }
    const partner = allocations.find((a) => a.role === 'Partner')!,
      manager = allocations.find((a) => a.role === 'Manager')!;
    if (partner.userId === manager.userId)
      throw new GuardError('SELF_APPROVAL', 'Partner and Manager must be independent actors.');
    engagement.partner = this.state.users.find((u) => u.id === partner.userId)!.name;
    engagement.manager = this.state.users.find((u) => u.id === manager.userId)!.name;
    engagement.team = [
      ...new Set(allocations.map((a) => this.state.users.find((u) => u.id === a.userId)!.name))
    ];
    const revision = (engagement.auditLifecycle!.staffing.at(-1)?.revision || 0) + 1;
    engagement.auditLifecycle!.staffing.push({
      revision,
      allocations: structuredClone(allocations),
      byUserId: this.state.currentUserId,
      at: new Date().toISOString(),
      reason
    });
    this.event(
      engagement,
      'Staff scheduling revised',
      `v${revision}: ${reason}. Assignment does not change role grants.`
    );
  }
  public importMappedTB(
    engagementId: string,
    rows: TrialBalanceRow[],
    input: { fileName: string; format: 'CSV' | 'XLSX'; sha256: string; originalArtifact?: GeneratedArtifactRecord }
  ) {
    const engagement = this.engagement(
      engagementId,
      ['preparer', 'manager', 'reviewer', 'partner'],
      true
    );
    if (
      !rows.length ||
      rows.some(
        (r) =>
          !r.code.trim() ||
          !r.name.trim() ||
          !Number.isFinite(r.balance) ||
          !['asset', 'liability', 'equity', 'revenue', 'expense'].includes(r.type)
      ) ||
      new Set(rows.map((r) => r.code)).size !== rows.length ||
      Math.abs(rows.reduce((n, r) => n + r.balance, 0)) > 0.005
    )
      throw new GuardError(
        'INVALID_STATE',
        'A valid balanced TB with unique account identities is required.'
      );
    if (
      !input.fileName.trim() ||
      !['CSV', 'XLSX'].includes(input.format) ||
      !/^[0-9a-f]{64}$/i.test(input.sha256) || (input.originalArtifact && (input.originalArtifact.sha256 !== input.sha256 || input.originalArtifact.name !== input.fileName))
    )
      throw new GuardError('INVALID_STATE', 'TB file name, format and SHA-256 are required.');
    const previous = engagement.sourceVersion;
    engagement.sourceHistory ||= [];
    if (!engagement.sourceHistory.length && engagement.rows.length)
      engagement.sourceHistory.push({
        version: previous,
        rows: structuredClone(engagement.rows),
        importedAt: this.state.asOfDate,
        importedBy: 'Historical prototype source',
        format: 'Legacy'
      });
    engagement.sourceVersion++;
    engagement.rows = structuredClone(rows);
    engagement.sourceAccepted = true;
    engagement.mappingApproved = false;
    engagement.planning = false;
    engagement.sourceHistory.push({
      version: engagement.sourceVersion,
      rows: structuredClone(rows),
      predecessorVersion: previous,
      ...input,
      importedAt: new Date().toISOString(),
      importedBy: this.state.currentPerson
    });
    this.staleFinancialBasis(
      engagement,
      'TB replaced: reconfirm mapping and planning; reassess fieldwork, samples and workpaper conclusions.'
    );
    this.event(
      engagement,
      'TB source imported',
      `${input.fileName}, source v${engagement.sourceVersion}; ingestion only, no ledger posting.`
    );
  }
  private staleFinancialBasis(engagement: EngagementRecord, reason: string) {
    for (const statement of this.state.statementSetRevisions || [])
      if (statement.engagementId === engagement.id) statement.status = 'Stale';
    for (const program of this.state.auditPrograms.filter((p) => p.engagementId === engagement.id))
      for (const procedure of program.procedures) {
        procedure.scopeReassessmentRequired = true;
        procedure.scopeReassessmentReason = reason;
        procedure.status = 'In progress';
        procedure.reviewedByUserId = undefined;
        procedure.reviewedAt = undefined;
      }
    for (const wp of engagement.workpapers.filter((w) => w.applicable)) {
      wp.status = 'Changes required';
      wp.clearance = null;
    }
    engagement.generation++;
    engagement.approvals.manager = null;
    engagement.approvals.partner = null;
  }
  public confirmMapping(engagementId: string, mappings: Array<{ code: string; line: string }>) {
    const engagement = this.engagement(
      engagementId,
      ['preparer', 'manager', 'reviewer', 'partner'],
      true
    );
    if (
      mappings.length !== engagement.rows.length ||
      new Set(mappings.map((m) => m.code)).size !== mappings.length ||
      mappings.some((m) => !m.line.trim() || !engagement.rows.some((r) => r.code === m.code))
    )
      throw new GuardError(
        'INVALID_STATE',
        'Confirm exactly one FSLI mapping for every source account.'
      );
    engagement.rows = engagement.rows.map((r) => ({
      ...r,
      mappedStatementLine: mappings.find((m) => m.code === r.code)!.line.trim()
    }));
    engagement.mappingApproved = true;
    const list = (this.state.accountMappingRevisions ||= []);
    const revision =
      Math.max(0, ...list.filter((r) => r.engagementId === engagementId).map((r) => r.revision)) +
      1;
    list.push({
      engagementId,
      revision,
      mappings: engagement.rows.map((r) => ({
        accountCode: r.code,
        targets: [{ statementLine: r.mappedStatementLine!, percentage: 100 }]
      })),
      preparedBy: this.state.currentPerson,
      status: 'Approved',
      preparedByUserId: this.state.currentUserId,
      preparedAt: new Date().toISOString(),
      approvedByUserId: this.state.currentUserId,
      approvedAt: new Date().toISOString(),
      sourceVersion: engagement.sourceVersion
    });
    this.event(
      engagement,
      'TB mapping confirmed',
      `Source v${engagement.sourceVersion}, mapping v${revision}. Suggestions require this explicit confirmation.`
    );
  }
  public attachPhysicalReference(
    engagementId: string,
    workpaperId: string,
    populationId: string,
    itemId: string,
    reference: PhysicalEvidenceReference
  ) {
    const engagement = this.engagement(engagementId, ['preparer', 'manager', 'reviewer'], true);
    fail(fieldworkBlockers(this.state, engagement));
    if (
      !/^[A-Z]{1,4}-[1-9]\d*$/.test(reference.indexCode) ||
      !reference.description.trim() ||
      (reference.box !== undefined && (!reference.box.trim() || reference.box.length > 100))
    )
      throw new GuardError(
        'INVALID_STATE',
        'Use a structured physical index such as X-1, a description and an optional box/location.'
      );
    const workpaper = engagement.workpapers.find((w) => w.id === workpaperId),
      population = this.state.samplePopulations.find(
        (p) => p.id === populationId && p.engagementId === engagementId
      ),
      item = population?.items.find((i) => i.id === itemId && i.selected);
    if (!workpaper || !item)
      throw new GuardError(
        'FORBIDDEN_SCOPE',
        'Link a selected sample and workpaper from this exact engagement.'
      );
    item.physicalReference = structuredClone(reference);
    workpaper.physicalReference = structuredClone(reference);
    this.event(
      engagement,
      'Physical evidence linked',
      `${workpaperId} / ${itemId}: ${reference.indexCode} ${reference.box || ''}. ${reference.description}`
    );
  }
  public attachDigitalSampleEvidence(engagementId: string, populationId: string, itemId: string, documentId: string, mode: 'Digital' | 'Hybrid' = 'Digital') {
    const engagement = this.engagement(engagementId, ['preparer','reviewer','manager'], true);
    const item = this.state.samplePopulations.find(p => p.id === populationId && p.engagementId === engagementId)?.items.find(i => i.id === itemId && i.selected);
    const document = this.state.documents.find(d => d.id === documentId && d.engagementId === engagementId && d.clientId === engagement.client && !d.brokenLink && !this.state.documents.some(n => n.supersedesDocumentId === d.id));
    if (!item || !document || !this.state.evidenceCatalogue.some(e => e.documentId === document.id && e.adequacyStatus === 'Adequate' && e.version === document.version)) throw new GuardError('INVALID_STATE', 'Select current adequate same-engagement digital evidence.');
    item.evidenceDoc = documentId; item.evidenceMode = mode;
    this.event(engagement, 'Digital sample evidence linked', `${populationId}/${itemId}: ${documentId} v${document.version}; ${mode}`);
  }
  public generateSample(
    engagementId: string,
    populationId: string,
    method: 'Random' | 'Monetary Unit Sampling' | 'Stratified' | 'Systematic Random Sampling' | 'Stratified Attribute Sampling',
    count: number,
    seed: number,
    methodology?: { samplingBasis: string; sizeDetermination: string; attributeDefinition?: string; strataField?: 'counterparty' | 'month' | 'direction' }
  ) {
    const engagement = this.engagement(engagementId, ['preparer', 'manager', 'reviewer'], true);
    fail(fieldworkBlockers(this.state, engagement));
    const population = this.state.samplePopulations.find(
      (p) => p.id === populationId && p.engagementId === engagementId
    );
    if (
      !population ||
      !population.sourceComplete ||
      population.items.length !== population.totalPopulationCount ||
      Math.abs(
        population.items.reduce((n, i) => n + i.amount, 0) - population.totalPopulationValue
      ) > 0.005
    )
      throw new GuardError('INVALID_STATE', 'Sampling requires a complete reconciled population.');
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > population.items.length ||
      !Number.isInteger(seed) ||
      !['Random', 'Monetary Unit Sampling', 'Stratified', 'Systematic Random Sampling', 'Stratified Attribute Sampling'].includes(method)
    )
      throw new GuardError(
        'INVALID_STATE',
        'Choose a supported method, integer sample size and reproducible integer seed.'
      );
    // R07: the reviewer records the sampling basis and how the size was determined. The
    // entered count is a professional decision (or documented override), never a silently
    // validated recommendation; attribute strata must be defined by the reviewer.
    requireText(methodology?.samplingBasis || '', 'Sampling basis (population and method rationale)', 20);
    requireText(methodology?.sizeDetermination || '', 'Sample-size determination', 10);
    if (method === 'Stratified Attribute Sampling')
      requireText(
        methodology?.attributeDefinition || '',
        'Applicable attribute / strata definition',
        20
      );
    let rng = seed >>> 0;
    const random = () => {
      rng = (1664525 * rng + 1013904223) >>> 0;
      return rng / 4294967296;
    };
    const items = [...population.items];
    const selected = new Set<string>();
    if (method === 'Stratified') {
      const ranked = items.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
      for (let n = 0; n < count; n++) {
        const start = Math.floor((n * ranked.length) / count),
          end = Math.floor(((n + 1) * ranked.length) / count);
        const idx = start + Math.floor(random() * Math.max(1, end - start));
        const item = ranked[Math.min(idx, ranked.length - 1)];
        selected.add(item.id);
        item.selectionRationale = `Value-stratified sampling: stratum ${n + 1} of ${count}; rank ${idx + 1}; amount ${item.amount}.`;
      }
    } else if (method === 'Stratified Attribute Sampling') {
      const field = methodology?.strataField || 'counterparty';
      if (!['counterparty','month','direction'].includes(field)) throw new GuardError('INVALID_STATE','Choose a supported attribute field.');
      const attributeOf = (item: typeof items[number]) => field === 'counterparty' ? item.counterparty : field === 'month' ? item.date.slice(0,7) : String(Math.sign(item.amount));
      const strata = [...new Set(items.map(attributeOf))];
      if (count < strata.length) throw new GuardError('INVALID_STATE', 'Attribute sampling needs at least one item per selected nonempty stratum.');
      for (const attribute of strata) {
        const group = items.filter(i => attributeOf(i) === attribute);
        const item = group[Math.floor(random() * group.length)];
        selected.add(item.id);
        item.selectionRationale = `Stratified Attribute Sampling: ${field}=${attribute}; ${methodology!.attributeDefinition}; one random item per nonempty stratum.`;
      }
      const remaining = items.filter(i => !selected.has(i.id));
      while (selected.size < count) {
        const index = Math.floor(random() * remaining.length);
        const [item] = remaining.splice(index, 1);
        selected.add(item.id);
        item.selectionRationale = `Stratified Attribute Sampling: random remainder after ${field} coverage; attribute ${attributeOf(item)}.`;
      }
    } else if (method === 'Systematic Random Sampling') {
      const interval = items.length / count;
      const start = random() * interval;
      for (let n = 0; n < count; n++) {
        const idx = Math.floor(start + n * interval) % items.length;
        const item = items[idx];
        selected.add(item.id);
        item.selectionRationale = `Systematic Random Sampling: draw ${n + 1} of ${count}; interval ${interval}; random start ${start}; index ${idx}.`;
      }
    } else if (method === 'Monetary Unit Sampling') {
      if (items.some((i) => i.amount <= 0))
        throw new GuardError(
          'INVALID_STATE',
          'MUS requires a positive-value population; use Random or Stratified for credits/zero balances.'
        );
      const total = items.reduce((n, i) => n + i.amount, 0),
        interval = total / count,
        start = random() * interval;
      let index = 0,
        cumulative = items[0].amount;
      const hits = new Map<string, number>();
      for (let n = 0; n < count; n++) {
        const point = start + n * interval;
        while (index < items.length - 1 && point >= cumulative) {
          index++;
          cumulative += items[index].amount;
        }
        const chosen = items[index];
        selected.add(chosen.id);
        hits.set(chosen.id, (hits.get(chosen.id) || 0) + 1);
      }
      for (const item of items)
        item.selectionRationale = hits.has(item.id)
          ? `Systematic MUS: ${hits.get(item.id)} monetary-unit hit(s); interval ${interval}; random start ${start}; ${count} draws.`
          : undefined;
    } else {
      for (let n = items.length - 1; n > 0; n--) {
        const k = Math.floor(random() * (n + 1));
        [items[n], items[k]] = [items[k], items[n]];
      }
      items.slice(0, count).forEach((i) => {
        selected.add(i.id);
        i.selectionRationale = `Simple Random Sampling: reproducible seed ${seed}.`;
      });
    }
    for (const item of population.items) {
      item.selected = selected.has(item.id);
      item.tested = false;
      item.result = 'Untested';
      item.physicalReference = undefined;
    }
    population.methodology = `${method}; seed ${seed}`;
    population.samplingBasis = methodology!.samplingBasis.trim();
    population.sizeDetermination = methodology!.sizeDetermination.trim();
    population.attributeDefinition = methodology?.attributeDefinition ? `${methodology.strataField || 'counterparty'}: ${methodology.attributeDefinition.trim()}` : undefined;
    population.selectionVersion = (population.selectionVersion || 0) + 1;
    population.selectionPreparedBy = this.state.currentPerson;
    population.selectedCount = selected.size;
    population.selectedValue = money(
      population.items.filter((i) => i.selected).reduce((n, i) => n + i.amount, 0)
    );
    population.tbSourceVersion = engagement.sourceVersion;
    population.planVersion = currentPlan(this.state, engagement)?.version;
    this.event(
      engagement,
      'Sample generated',
      `${populationId}: ${method}, seed ${seed}, ${selected.size}/${items.length} distinct items from ${count} draws; control total ${population.totalPopulationValue}; size determination recorded by the reviewer.`
    );
  }
  public prepareStandardPrograms(engagementId: string) {
    const engagement = this.engagement(engagementId, ['manager', 'partner'], true);
    fail(fieldworkBlockers(this.state, engagement));
    if (this.state.auditPrograms.some((p) => p.engagementId === engagementId))
      throw new GuardError(
        'INVALID_STATE',
        'Programs already exist. Tailor them with an ad-hoc procedure instead of duplicating the file.'
      );
    const staffing = engagement.auditLifecycle!.staffing.at(-1)!;
    const allocationFor = (role: StaffAllocation['role']) =>
      this.state.users.find((u) => u.id === staffing.allocations.find((a) => a.role === role)!.userId)!;
    const preparerUser = allocationFor('Preparer/Staff');
    const managerUser = allocationFor('Manager');
    const reviewerUser = staffing.allocations.some(a => a.role === 'Senior/Reviewer') ? allocationFor('Senior/Reviewer') : managerUser;
    const partnerUser = allocationFor('Partner');
    requireIndependentActor(
      preparerUser.id,
      reviewerUser.id,
      'assign a workpaper to its own reviewer',
      this.state
    );
    const workpaperId = `WP-${engagementId}-AUDIT`;
    // R04: one substantive program per mapped FSLI. Expense, inventory and payable lines are
    // no longer collapsed into a shared Purchasing file, so each FSLI keeps its own owner,
    // evidence, completion and review state.
    const areas = [
      ...new Set(engagement.rows.map((row) => row.mappedStatementLine!).filter(Boolean)),
      'Analytical Review',
      'Going Concern'
    ];
    const programs = areas.map((area, index) => {
      let procedures: Array<{
        id: string;
        engagementId: string;
        title: string;
        instructions: string;
        assignee: string;
        status: 'Not started';
        linkedWorkpaperId: string;
      }> = [];

      if (!['Analytical Review', 'Going Concern'].includes(area)) {
        const assertions = [
          { name: 'Ownership', title: `[Ownership / Rights] Verify legal title, contracts and obligations for ${area.toLowerCase()}`, desc: `Inspect title deeds, agreements, contracts, and registers to verify ownership rights and absence of encumbrances.` },
          { name: 'Valuation', title: `[Valuation & Allocation] Test measurement, impairment and allocation for ${area.toLowerCase()}`, desc: `Assess accounting estimates, net realizable values, depreciation models, and expected credit loss (ECL) provisions.` },
          { name: 'Completeness', title: `[Completeness] Reconcile sub-ledgers and test unrecorded items in ${area.toLowerCase()}`, desc: `Reconcile sub-ledgers to GL, test unrecorded liabilities / omitted revenues, and test sequential document matching.` },
          { name: 'Existence', title: `[Existence] Verify physical existence and independent confirmations for ${area.toLowerCase()}`, desc: `Conduct physical verification, inspect supporting delivery/acceptance records, or obtain independent third-party confirmation.` },
          { name: 'Cut-off', title: `[Cut-off] Test pre- and post-closing transaction allocation for ${area.toLowerCase()}`, desc: `Sample transactions recorded immediately before and after reporting period-end to ensure correct period accounting.` }
        ];
        procedures = assertions.map((a, pIdx) => ({
          id: `PROC-${engagementId}-${index + 1}-${pIdx + 1}`,
          engagementId,
          title: a.title,
          instructions: a.desc,
          assignee: preparerUser.name,
          status: 'Not started' as const,
          linkedWorkpaperId: workpaperId
        }));
      } else if (area === 'Analytical Review') {
        procedures = [
          {
            id: `PROC-${engagementId}-${index + 1}-1`,
            engagementId,
            title: '[Analytical Review] Substantive ratio analysis and fluctuation review',
            instructions: 'Evaluate gross margin, operating ratios, and material budget/comparative variances against audit materiality.',
            assignee: preparerUser.name,
            status: 'Not started' as const,
            linkedWorkpaperId: workpaperId
          }
        ];
      } else {
        procedures = [
          {
            id: `PROC-${engagementId}-${index + 1}-1`,
            engagementId,
            title: '[Going Concern] Evaluate 12-month cash forecast and covenant compliance',
            instructions: 'Evaluate management going concern assessment, forward liquidity forecast, debt covenants, and operational solvency indicators (ISA 570).',
            assignee: preparerUser.name,
            status: 'Not started' as const,
            linkedWorkpaperId: workpaperId
          }
        ];
      }

      return {
        id: `AP-${engagementId}-${index + 1}`,
        engagementId,
        area,
        financialStatementLines: [
          ...new Set(
            engagement.rows
              .filter((r) =>
                ['Analytical Review', 'Going Concern'].includes(area)
                  ? true
                  : r.mappedStatementLine === area
              )
              .map((r) => r.mappedStatementLine!)
          )
        ],
        title: `${area} audit program`,
        leadWorkpaperRef: workpaperId,
        objective: `Document ${area.toLowerCase()} work, evidence and conclusion.`,
        procedures
      };
    });
    // R04: procedure owners and workpaper preparer/reviewer pairs come from the same risk
    // tier: RED = manager executes / partner reviews; AMBER = senior executes / manager
    // reviews; GREEN = preparer executes / senior reviews.
    const tierFor = (level: 'RED' | 'AMBER' | 'GREEN') =>
      level === 'RED'
        ? { executor: managerUser, reviewer: partnerUser }
        : level === 'AMBER'
          ? { executor: reviewerUser, reviewer: reviewerUser.id === managerUser.id ? partnerUser : managerUser }
          : { executor: preparerUser, reviewer: reviewerUser };
    for (const program of programs) {
      const level = program.financialStatementLines.some(line => fsliRiskLevel(this.state, engagement, line) === 'RED') ? 'RED' as const : program.financialStatementLines.some(line => fsliRiskLevel(this.state, engagement, line) === 'AMBER') ? 'AMBER' as const : 'GREEN' as const;
      const tier = tierFor(level);
      program.leadWorkpaperRef = `${workpaperId}-${program.id}`;
      for (const procedure of program.procedures) { procedure.assignee = tier.executor.name; procedure.linkedWorkpaperId = program.leadWorkpaperRef; }
      (program as typeof program & { riskTier: 'RED' | 'AMBER' | 'GREEN' }).riskTier = level;
      (program as typeof program & { executorName: string }).executorName = tier.executor.name;
    }
    this.state.auditPrograms.push(...programs);
    engagement.workpapers.push({
      id: workpaperId,
      title: 'Audit fieldwork and completion conclusions',
      objective: 'Reconcile the TB and document the program areas.',
      assertion: 'Existence / completeness / valuation / presentation',
      risk: 'Material misstatement and going concern',
      version: 1,
      status: 'Planned',
      applicable: true,
      scope: engagement.period,
      workPerformed: '',
      conclusion: '',
      preparer: preparerUser.name,
      reviewer: reviewerUser.name,
      guidelines: areas.map((area) => ({
        title: area,
        desc: `Record the ${area.toLowerCase()} conclusion.`,
        mandatory: true
      })),
      template: {
        name: 'Audit fieldwork workbook',
        ref: 'TARGET-AUDIT',
        version: '1',
        format: 'XLSX',
        instructions: 'Generated from current procedures and linked accepted evidence.',
        csv: ''
      },
      workingPaper: null,
      supportingEvidence: [],
      evidenceRefs: [],
      clearance: null,
      clearanceHistory: [],
      sourceProcedureRefs: programs.flatMap((p) => p.procedures.map((s) => s.id))
    });
    const aggregate = engagement.workpapers.at(-1)!;
    aggregate.applicable = false;
    aggregate.status = 'Not applicable';
    aggregate.notApplicableRationale = 'Historical aggregate header; each program now has its own workpaper.';
    for (const program of programs) {
      const level = (program as typeof program & { riskTier?: 'RED' | 'AMBER' | 'GREEN' }).riskTier || 'GREEN';
      const tier = tierFor(level);
      engagement.workpapers.push({
        ...structuredClone(aggregate),
        id: program.leadWorkpaperRef,
        title: `${program.area} workpaper`,
        objective: program.objective,
        applicable: true,
        status: 'Planned',
        executionRiskLevel: level,
        notApplicableRationale: undefined,
        preparer: tier.executor.name,
        reviewer: tier.reviewer.name,
        guidelines: [{ title: program.area, desc: 'Record the current scoped work and conclusion.', mandatory: true }],
        sourceProcedureRefs: program.procedures.map(p => p.id)
      });
    }
    this.event(
      engagement,
      'Standard audit programs prepared',
      `${areas.join(', ')}; one workpaper per FSLI with risk-tiered ownership (RED manager/partner, AMBER senior/manager, GREEN preparer/senior).`
    );
  }
  public addAdHocProcedure(
    engagementId: string,
    programId: string,
    title: string,
    instructions: string,
    reason: string
  ) {
    const engagement = this.engagement(engagementId, ['manager', 'preparer', 'partner'], true);
    requireText(title, 'Procedure title');
    requireText(instructions, 'Procedure instructions');
    requireText(reason, 'Insertion reason');
    const program = this.state.auditPrograms.find(
      (p) => p.id === programId && p.engagementId === engagementId
    );
    if (!program) throw new GuardError('FORBIDDEN_SCOPE', 'Select a program in this engagement.');
    const id = uniqueId('PROC');
    program.procedures.push({
      id,
      engagementId,
      title,
      instructions,
      status: 'Not started',
      linkedWorkpaperId: program.leadWorkpaperRef,
      history: [
        {
          id: uniqueId('HIST'),
          revision: 1,
          action: 'Status changed',
          actorUserId: this.state.currentUserId,
          occurredAt: new Date().toISOString(),
          programId,
          status: 'Not started',
          reason: `Ad-hoc procedure inserted: ${reason}`
        }
      ]
    });
    this.event(engagement, 'Ad-hoc audit procedure inserted', `${title}: ${reason}`);
    return id;
  }
  public async saveFieldworkWorkbook(
    engagementId: string,
    workpaperId: string,
    scope: string,
    workPerformed: string,
    conclusion: string,
    evidenceMode?: 'Digital' | 'Physical' | 'Hybrid'
  ) {
    let engagement = this.engagement(engagementId, ['preparer', 'manager'], true);
    fail(fieldworkBlockers(this.state, engagement));
    requireText(scope, 'Scope');
    requireText(workPerformed, 'Work performed', 10);
    requireText(conclusion, 'Workpaper conclusion', 10);
    let wp = engagement.workpapers.find((w) => w.id === workpaperId);
    if (!wp || !wp.applicable)
      throw new GuardError('INVALID_STATE', 'Select an applicable workpaper.');
    if (this.state.currentRole === 'preparer' && wp.preparer !== this.state.currentPerson)
      throw new GuardError(
        'FORBIDDEN_SCOPE',
        'Only the assigned Preparer may revise this workpaper.'
      );
    // R12: one readiness policy per evidence mode. Physical-mode work (recorded on the
    // workpaper via the X-1 physical index) supports the workbook without digital refs;
    // any linked digital evidence must still be current same-engagement documents.
    const digitalRefs = wp.evidenceRefs || [];
    const staleDigital = digitalRefs.some(
      (id) =>
        !this.state.documents.some(
          (d) =>
            d.id === id &&
            d.engagementId === engagementId &&
            !d.brokenLink &&
            !this.state.documents.some((next) => next.supersedesDocumentId === id)
        )
    );
    const physicalReady = Boolean(
      wp.physicalReference?.indexCode.trim() && wp.physicalReference?.description.trim()
    );
    const mode = evidenceMode || wp.evidenceMode;
    if (mode && !['Digital','Physical','Hybrid'].includes(mode)) throw new GuardError('INVALID_STATE','Choose Digital, Physical or Hybrid evidence.');
    if (mode === 'Physical' && !physicalReady || mode === 'Hybrid' && (!physicalReady || !digitalRefs.length) || mode === 'Digital' && !digitalRefs.length) throw new GuardError('INVALID_STATE', `${mode} evidence requirements are incomplete.`);
    if (staleDigital || (!digitalRefs.length && !physicalReady))
      throw new GuardError(
        'INVALID_STATE',
        staleDigital
          ? 'The linked digital evidence is stale. Refresh it to the current same-engagement revision before generating the workpaper workbook.'
          : 'Link current accepted evidence (digital, or a recorded physical X-1 index for Physical-mode work) before generating the workpaper workbook.'
      );
    const programs = this.state.auditPrograms.filter(
      (p) =>
        p.engagementId === engagementId &&
        p.procedures.some((s) => s.linkedWorkpaperId === workpaperId)
    );
    const basis = reviewBasis(this.state, engagement),
      actor = this.state.currentUserId;
    const version = wp.workingPaper ? wp.version + 1 : wp.version;
    const id = uniqueId(`WORK-${workpaperId}-v${version}`);
    const blob = createXLSXBlob('Audit Fieldwork', [
      ['Engagement', engagementId],
      ['Scope', scope],
      ['Work performed', workPerformed],
      ['Conclusion', conclusion],
      ['TB revision', engagement.sourceVersion],
      ['Evidence', [...digitalRefs, wp.physicalReference ? `Physical ${wp.physicalReference.indexCode}: ${wp.physicalReference.description}` : ''].filter(Boolean).join(', ')],
      [],
      ['Area', 'Procedure', 'Work performed', 'Conclusion', 'Status'],
      ...programs.flatMap((p) =>
        p.procedures.map((s) => [
          p.area,
          s.title || s.id,
          s.workPerformed || '',
          s.conclusion || '',
          s.status
        ])
      )
    ]);
    const artifact: GeneratedArtifactRecord = {
      id,
      name: `${id}.xlsx`,
      kind: 'XLSX',
      mimeType: blob.type,
      size: blob.size,
      sha256: await artifactSha256(blob)
    };
    await persistArtifact(artifact, blob);
    engagement = this.engagement(engagementId, ['preparer', 'manager'], true);
    wp = engagement.workpapers.find((w) => w.id === workpaperId)!;
    if (actor !== this.state.currentUserId || basis !== reviewBasis(this.state, engagement))
      throw new GuardError('STALE_REVISION', 'Fieldwork changed during workbook generation.');
    if (wp.generatedArtifact) (wp.generatedArtifactHistory ||= []).push(wp.generatedArtifact);
    wp.version = version;
    wp.scope = scope;
    wp.workPerformed = workPerformed;
    wp.conclusion = conclusion;
    if (mode) wp.evidenceMode = mode;
    wp.status = 'In progress';
    wp.clearance = null;
    wp.generatedArtifact = artifact;
    wp.workingPaper = {
      file: artifact.name,
      name: artifact.name,
      size: artifact.size,
      sha: artifact.sha256,
      version,
      uploadedAt: new Date().toISOString(),
      uploadedBy: this.state.currentPerson,
      local: true
    };
    for (const note of engagement.reviews.filter(
      (r) => r.wp === wp!.id && ['Responded', 'Cleared'].includes(r.status)
    )) {
      note.status = 'Reopened';
      note.history.push({
        actor: this.state.currentPerson,
        action: 'Reopened after workpaper revision',
        time: new Date().toISOString(),
        text: `Workpaper is now v${version}.`
      });
    }
    this.event(
      engagement,
      'Fieldwork workbook revision generated',
      `${workpaperId} v${version}; current conclusions and evidence. Historical generated revisions retained.`
    );
    return artifact;
  }
  public importPopulation(
    engagementId: string,
    accountCode: string,
    fileName: string,
    sha256: string,
    rows: import('../types').SamplePopulationRow[],
    sourceArtifact?: GeneratedArtifactRecord
  ) {
    const engagement = this.engagement(engagementId, ['preparer', 'manager', 'reviewer'], true);
    fail(fieldworkBlockers(this.state, engagement));
    const account = engagement.rows.find((r) => r.code === accountCode);
    if (
      !account ||
      !rows.length ||
      !fileName.trim() ||
      !/^[0-9a-f]{64}$/i.test(sha256) || (sourceArtifact && (sourceArtifact.sha256 !== sha256 || sourceArtifact.name !== fileName)) ||
      Math.abs(rows.reduce((n, r) => n + r.amount, 0) - account.balance) > 0.005
    )
      throw new GuardError(
        'INVALID_STATE',
        'The complete source population must reconcile to the selected TB account.'
      );
    if (
      rows.length > 20000 ||
      new Set(rows.map((r) => r.itemRef)).size !== rows.length ||
      rows.some(
        (r) =>
          !isIsoDate(r.date) ||
          r.date.slice(0, 4) !== String(engagement.year) ||
          !r.counterparty.trim() ||
          !r.itemRef.trim() ||
          !Number.isFinite(r.amount) ||
          (r.currency && r.currency !== engagement.currency) ||
          (r.period && r.period !== engagement.year)
      )
    )
      throw new GuardError(
        'INVALID_STATE',
        'Population items must be unique, numeric and within this engagement period/currency.'
      );
    const id = uniqueId('POP');
    this.state.samplePopulations.push({
      id,
      engagementId,
      area: account.mappedStatementLine || account.name,
      accountCode,
      period: engagement.year,
      currency: engagement.currency,
      description: fileName,
      sourceFileName: fileName,
      sourceSha256: sha256,
      sourceArtifact,
      sourceRevision: 1,
      sourceComplete: true,
      totalPopulationCount: rows.length,
      totalPopulationValue: money(rows.reduce((n, r) => n + r.amount, 0)),
      selectedCount: 0,
      selectedValue: 0,
      items: rows.map((r, index) => ({
        ...r,
        id: `${id}-${index + 1}`,
        selected: false,
        tested: false,
        result: 'Untested',
        period: engagement.year,
        currency: engagement.currency
      }))
    });
    this.event(
      engagement,
      'Sample population imported',
      `${id}, ${fileName}; reconciled control total ${account.balance}.`
    );
    return id;
  }
  public createConfirmation(
    engagementId: string,
    input: Pick<
      ExternalConfirmation,
      | 'type'
      | 'counterparty'
      | 'relatedFsli'
      | 'ownerUserId'
      | 'dueAt'
      | 'critical'
      | 'workpaperIds'
    > & { type: RequiredConfirmationType }
  ) {
    const engagement = this.engagement(engagementId, ['preparer', 'manager', 'partner'], true);
    requireText(input.counterparty, 'Counterparty');
    requireText(input.relatedFsli, 'Related FSLI');
    const owner = this.state.users.find(
      (u) =>
        u.id === input.ownerUserId &&
        u.status === 'Active' &&
        ['preparer', 'manager', 'reviewer', 'partner'].includes(u.role)
    );
    const visible = visibleEngagementIds(this.state, input.ownerUserId);
    if (
      !owner ||
      (visible !== 'ALL' && !visible.includes(engagementId)) ||
      !isIsoDate(input.dueAt) ||
      !(REQUIRED_CONFIRMATION_TYPES as readonly string[]).includes(input.type) ||
      typeof input.critical !== 'boolean' ||
      input.workpaperIds.some((id) => !engagement.workpapers.some((w) => w.id === id))
    )
      throw new GuardError(
        'INVALID_STATE',
        'Confirmation requires a scoped staff owner, valid due date, type, criticality and same-engagement workpapers.'
      );
    const id = uniqueId('CONF'),
      at = new Date().toISOString();
    (this.state.confirmations ||= []).push({
      ...structuredClone(input),
      id,
      clientId: engagement.client,
      engagementId,
      status: 'Draft',
      counterparty: input.counterparty.trim(),
      evidenceRefs: [],
      notes: '',
      revision: 1,
      history: [
        {
          at,
          actorUserId: this.state.currentUserId,
          action: 'Created',
          reason: 'Synthetic external confirmation tracking; no external request transmitted.'
        }
      ]
    });
    this.event(engagement, 'Confirmation created', `${id}: ${input.type} / ${input.counterparty}`);
    return id;
  }
  public async transitionConfirmationWithHandover(engagementId: string, id: string, status: ConfirmationStatus, note: string, evidenceRefs: string[] = []) {
    this.transitionConfirmation(engagementId, id, status, note, evidenceRefs);
    // R11: any transition that leaves critical confirmations outstanding — including
    // Requested and Cancelled, not only Awaiting/No Response/Exception — keeps final
    // reporting blocked and must have a current holding letter. Idempotent per blocker set.
    const engagement = this.state.engagements.find(e => e.id === engagementId);
    if (engagement && criticalConfirmationBlockers(this.state, engagement).length) {
      try { await this.generateHoldingLetter(engagementId); }
      catch (error) { throw new Error(`Confirmation transition saved; Holding Letter pending. Retry generation. ${error instanceof Error ? error.message : ''}`); }
    }
  }
  public transitionConfirmation(
    engagementId: string,
    id: string,
    status: ConfirmationStatus,
    note: string,
    evidenceRefs: string[] = []
  ) {
    const engagement = this.engagement(
      engagementId,
      ['preparer', 'manager', 'reviewer', 'partner'],
      true
    );
    requireText(note, 'Confirmation transition note');
    const confirmation = this.state.confirmations?.find(
      (c) => c.id === id && c.engagementId === engagementId && c.clientId === engagement.client
    );
    if (!confirmation)
      throw new GuardError('FORBIDDEN_SCOPE', 'Confirmation is outside this engagement.');
    if (!(REQUIRED_CONFIRMATION_TYPES as readonly string[]).includes(confirmation.type)) throw new GuardError('INVALID_STATE', 'Historical confirmation types are read-only.');
    const allowed: Record<ConfirmationStatus, ConfirmationStatus[]> = {
      Draft: ['Requested', 'Cancelled'],
      Requested: ['Awaiting', 'Received', 'Cancelled'],
      Awaiting: ['Received', 'No Response', 'Exception', 'Cancelled'],
      Received: ['Reviewed', 'Exception'],
      Reviewed: ['Cleared', 'Exception'],
      Cleared: ['Exception', 'Awaiting'],
      'No Response': ['Requested', 'Received', 'Cancelled'],
      Exception: ['Requested', 'Received', 'Cancelled'],
      Cancelled: []
    };
    if (!allowed[confirmation.status].includes(status))
      throw new GuardError(
        'INVALID_STATE',
        `Cannot move a confirmation from ${confirmation.status} to ${status}.`
      );
    if (
      ['Reviewed', 'Cleared', 'Exception', 'Cancelled'].includes(status) &&
      !hasAnyRole(this.state, ['manager', 'reviewer', 'partner'])
    )
      throw new GuardError(
        'FORBIDDEN_SCOPE',
        'Review/disposition requires Manager, reviewer or Partner.'
      );
    if (
      evidenceRefs.some(
        (id) =>
          !this.state.documents.some(
            (d) =>
              d.id === id &&
              d.engagementId === engagementId &&
              d.clientId === engagement.client &&
              !d.brokenLink &&
              !this.state.documents.some((next) => next.supersedesDocumentId === d.id)
          )
      )
    )
      throw new GuardError(
        'FORBIDDEN_SCOPE',
        'Confirmation evidence must be current and from the same engagement.'
      );
    if (status === 'Received' && !evidenceRefs.length)
      throw new GuardError(
        'INVALID_STATE',
        'A received confirmation requires a same-engagement response document.'
      );
    if (
      status === 'Cleared' &&
      (!confirmation.evidenceRefs.length ||
        confirmation.evidenceRefs.some(
          (id) =>
            !this.state.documents.some(
              (d) =>
                d.id === id &&
                d.engagementId === engagementId &&
                !d.brokenLink &&
                !this.state.documents.some((next) => next.supersedesDocumentId === id)
            )
        ))
    )
      throw new GuardError(
        'INVALID_STATE',
        'A critical confirmation cannot be cleared without response evidence.'
      );
    if (['Reviewed', 'Cleared'].includes(status)) {
      const requester = confirmation.history.find((h) => h.action === 'Requested')?.actorUserId;
      if (requester)
        requireIndependentActor(
          requester,
          this.state.currentUserId,
          'review their own confirmation',
          this.state
        );
    }
    confirmation.status = status;
    confirmation.notes = note.trim();
    confirmation.revision++;
    if (evidenceRefs.length) confirmation.evidenceRefs = [...evidenceRefs];
    if (status === 'Requested') confirmation.requestedAt = new Date().toISOString();
    if (status === 'Received') confirmation.receivedAt = new Date().toISOString();
    confirmation.history.push({
      at: new Date().toISOString(),
      actorUserId: this.state.currentUserId,
      action: status,
      reason: note.trim()
    });
    this.event(engagement, 'Confirmation updated', `${id}: ${status}. ${note.trim()}`);
  }
  public async generateHoldingLetter(engagementId: string) {
    const engagement = this.engagement(engagementId, ['preparer', 'reviewer', 'manager', 'partner'], true),
      blockers = criticalConfirmationBlockers(this.state, engagement);
    if (!blockers.length)
      throw new GuardError(
        'INVALID_STATE',
        'A holding letter requires a critical outstanding confirmation.'
      );
    // R11: idempotent per the identity of the blocked confirmation SET — a status rewording
    // (Requested → Awaiting) never duplicates the letter; a new confirmation joining the
    // blocked set triggers a fresh current letter.
    const blockerKey = (this.state.confirmations || [])
      .filter((c) => c.engagementId === engagementId && c.critical && c.status !== 'Cleared')
      .map((c) => c.id)
      .sort()
      .join('|');
    const actor = this.state.currentUserId, sourceVersion = engagement.sourceVersion;
    const existing = engagement.auditLifecycle!.holdingLetters?.find(l => l.blockerKey ? l.blockerKey === blockerKey : JSON.stringify(l.sourceBlockers) === JSON.stringify(blockers));
    if (existing?.artifact) return existing.artifact;
    const recipient = requireRoutedContact(this.state.contacts.filter(contact => contact.clientId === engagement.client), 'proposals_reports');
    const id = uniqueId(`HOLD-${engagementId}`);
    const artifact = await this.artifactWriter(id, 'Pending Confirmation / Holding Letter — Prototype', [
      `Engagement: ${engagementId} / ${engagement.period}`, `To: ${recipient.name} (${recipient.title || recipient.contactRole})`, ...blockers,
      'Final report remains blocked. Issued locally (simulated); no external dispatch.'
    ]);
    const current = this.engagement(engagementId, ['preparer', 'reviewer', 'manager', 'partner'], true);
    if (actor !== this.state.currentUserId || sourceVersion !== current.sourceVersion || JSON.stringify(blockers) !== JSON.stringify(criticalConfirmationBlockers(this.state, current))) throw new GuardError('STALE_REVISION', 'Holding Letter source or actor changed during generation.');
    const letters = current.auditLifecycle!.holdingLetters ||= [];
    letters.push({ id, revision: letters.length + 1, engagementId, generatedAt: new Date().toISOString(),
      generatedByUserId: this.state.currentUserId, recipientContactId: recipient?.id,
      recipientName: recipient?.name || this.state.clients.find(c => c.id === current.client)?.name || current.client,
      sourceBlockers: [...blockers], blockerKey, artifactId: artifact.id, artifact, simulatedDispatchStatus: 'Issued (simulated)' });
    this.event(current, 'Holding Letter issued (simulated)', id);
    return artifact;
  }

  public recordManagerClearance(engagementId: string, notes: string) {
    const engagement = this.engagement(engagementId, ['manager'], true);
    requireText(notes, 'Manager conclusion');
    fail(managerReviewBlockers(this.state, engagement));
    if (
      engagement.manager !== this.state.currentPerson &&
      !recordPrototypeSuperuserOverride(
        this.state,
        'record Manager clearance as a non-assigned manager'
      )
    )
      throw new GuardError(
        'FORBIDDEN_SCOPE',
        'Only the assigned Manager can record engagement clearance.'
      );
    // R04: a workpaper already cleared at its current revision by an actor independent of
    // its preparer (e.g. a partner-cleared, manager-executed RED file) does not need the
    // Manager to re-clear work they executed themselves.
    for (const wp of engagement.workpapers.filter((w) => w.applicable)) {
      const preparerPerson = this.state.users.find((u) => u.name === wp.preparer);
      const clearedByPerson = this.state.users.find((u) => u.name === wp.clearance?.clearedBy);
      const independentlyCleared =
        wp.clearance &&
        wp.clearance.version === wp.version &&
        wp.clearance.sourceVersion === engagement.sourceVersion &&
        preparerPerson &&
        clearedByPerson &&
        (clearedByPerson.personId || clearedByPerson.id) !==
          (preparerPerson.personId || preparerPerson.id);
      if (independentlyCleared) continue;
      requireIndependentActor(
        wp.submittedBy || wp.preparer,
        this.state.currentUserId,
        'clear work they prepared',
        this.state
      );
    }
    const basis = reviewBasis(this.state, engagement);
    engagement.auditLifecycle!.managerReviews.push({
      revision: engagement.auditLifecycle!.managerReviews.length + 1,
      basis,
      actorUserId: this.state.currentUserId,
      at: new Date().toISOString(),
      notes
    });
    this.event(engagement, 'Manager engagement review cleared', notes);
  }
  public async generateSRM(engagementId: string, recommendation: string) {
    let engagement = this.engagement(engagementId, ['manager'], true);
    requireText(recommendation, 'Manager recommendation', 20);
    fail(managerReviewBlockers(this.state, engagement));
    if (!currentReview(this.state, engagement).manager)
      throw new GuardError('STALE_REVISION', 'Clear current Manager review before generating SRM.');
    const basis = reviewBasis(this.state, engagement),
      actor = this.state.currentUserId,
      plan = currentPlan(this.state, engagement)!;
    const existing = engagement.auditLifecycle!.srms.find(r => r.basis === basis && r.notes === recommendation);
    if (existing) return existing.artifact;
    const summary = [
      `Client: ${this.state.clients.find((c) => c.id === engagement.client)?.name}`,
      `Engagement: ${engagement.id} / ${engagement.period}`,
      `TB source: v${engagement.sourceVersion}; PM ${plan.overallMateriality}, TE ${plan.performanceMateriality}, SAD ${plan.clearlyTrivialThreshold}`,
      ...srmReviewSections(this.state,engagement),
      ...this.state.auditRisks
        .filter((r) => r.engagementId === engagementId)
        .map((r) => `Risk: ${r.title} (${r.rating}) — ${r.response}`),
      ...this.state.auditPrograms
        .filter((p) => p.engagementId === engagementId)
        .map(
          (p) => `${p.area}: ${p.procedures.map((s) => `${s.title}: ${s.conclusion}`).join('; ')}`
        ),
      ...this.state.findings
        .filter((f) => f.engagementId === engagementId)
        .map(
          (f) =>
            `Finding / SAD: ${f.title}, ${f.amount || 0} ${engagement.currency}, ${f.disposition}`
        ),
      ...(this.state.confirmations || [])
        .filter((c) => c.engagementId === engagementId)
        .map(
          (c) =>
            `${c.type}: ${c.counterparty}, ${c.status}, ${c.critical ? 'critical' : 'non-critical'}`
        ),
      `Open review points: ${engagement.reviews.filter((r) => r.status !== 'Cleared').length}`,
      `Manager recommendation: ${recommendation}`,
      // R16: the full serialized basis stays in the SRM record for lineage; the printed
      // document carries only a compact digest plus revision summary.
      `Source fingerprint: ${fingerprintDigest(basis)} (SRM revision ${engagement.auditLifecycle!.srms.length + 1}; TB source v${engagement.sourceVersion}; full basis lineage retained in the SRM record)`,
      'Prototype SRM; no legal or regulatory compliance claim.'
    ];
    const artifact = await this.artifactWriter(
      uniqueId(`SRM-${engagementId}`),
      'Summary Review Memorandum — Prototype',
      summary
    );
    engagement = this.engagement(engagementId, ['manager'], true);
    if (
      actor !== this.state.currentUserId ||
      basis !== reviewBasis(this.state, engagement) ||
      !currentReview(this.state, engagement).manager
    )
      throw new GuardError(
        'STALE_REVISION',
        'Audit basis changed during SRM generation. Re-review and generate again.'
      );
    engagement.auditLifecycle!.srms.push({
      revision: engagement.auditLifecycle!.srms.length + 1,
      basis,
      actorUserId: actor,
      at: new Date().toISOString(),
      notes: recommendation,
      artifact,
      summary
    });
    this.event(engagement, 'SRM generated', artifact.id);
    return artifact;
  }
  public clearPartner(engagementId: string, notes: string) {
    const engagement = this.engagement(engagementId, ['partner'], true);
    this.assignedPartner(engagement);
    requireText(notes, 'Partner conclusion', 20);
    const review = currentReview(this.state, engagement);
    fail(managerReviewBlockers(this.state, engagement));
    fail(criticalConfirmationBlockers(this.state, engagement));
    if (!review.manager || !review.srm)
      throw new GuardError(
        'STALE_REVISION',
        'Partner clearance requires current Manager review and SRM.'
      );
    requireIndependentActor(
      engagement.auditLifecycle!.managerReviews.at(-1)!.actorUserId,
      this.state.currentUserId,
      'clear their own Manager review',
      this.state
    );
    engagement.auditLifecycle!.partnerClearances.push({
      revision: engagement.auditLifecycle!.partnerClearances.length + 1,
      basis: review.basis,
      actorUserId: this.state.currentUserId,
      at: new Date().toISOString(),
      notes
    });
    this.event(engagement, 'Partner cleared current SRM', notes);
  }
  public selectOpinion(
    engagementId: string,
    value: AuditOpinion,
    focusArea: string,
    basis: string
  ) {
    const engagement = this.engagement(engagementId, ['partner'], true);
    this.assignedPartner(engagement);
    fail(targetReleaseBlockers(this.state, engagement));
    fail(opinionValidation(value, focusArea, basis));
    if (value !== 'Clean' && !engagement.rows.some(row => row.mappedStatementLine === focusArea.trim())) throw new GuardError('INVALID_STATE', 'Select an affected FSLI from the current mapped trial balance.');
    engagement.auditLifecycle!.opinions.push({
      reportingBasis: partnerReportingBasis(this.state, engagement),
      revision: engagement.auditLifecycle!.opinions.length + 1,
      value,
      focusArea: focusArea.trim(),
      basis: basis.trim(),
      selectedByUserId: this.state.currentUserId,
      selectedAt: new Date().toISOString()
    });
    engagement.opinion = value;
    this.event(
      engagement,
      'Audit opinion selected',
      `${value}; ${focusArea}. Opinion selection alone is not the signature event; prior deliverables require regeneration and a fresh partner signature.`
    );
  }
  /** R10: the authoritative partner signature/seal event, pinned to the current opinion
   *  revision and reporting basis. Opinion selection, bundle compilation and delivery are
   *  deliberately separate steps; only this command records the signature date that starts
   *  the 60-day compliance clock. */
  public authorizeReportSignature(engagementId: string, signatureDate: string, note: string, visuals?: PDFVisualAssets) {
    const engagement = this.engagement(engagementId, ['partner'], true);
    this.assignedPartner(engagement);
    requireText(note, 'Signature authorization note', 10);
    for (const png of [visuals?.signaturePng, visuals?.sealPng]) if (png && (!/^data:image\/png;base64,iVBORw0KGgo/.test(png) || png.length > 1400000)) throw new GuardError('INVALID_STATE','Use a PNG signature/seal illustration under 1 MB.');
    if (visuals?.signaturePng || visuals?.sealPng) {
      try { createPDFBlob('Validate synthetic visual assets', [], visuals); }
      catch { throw new GuardError('INVALID_STATE','The supplied PNG illustration cannot be rendered. Choose a valid PNG before authorizing.'); }
    }
    if (!isIsoDate(signatureDate) || signatureDate > this.state.asOfDate)
      throw new GuardError(
        'INVALID_STATE',
        'Use a valid signature date on or before the simulation as-of date.'
      );
    const opinion = currentPartnerOpinion(this.state, engagement);
    if (!opinion)
      throw new GuardError(
        'STALE_REVISION',
        'Select and validate the current audit opinion before recording the partner signature.'
      );
    fail(targetReleaseBlockers(this.state, engagement));
    const basis = reportBasis(this.state, engagement);
    const authorizations = engagement.auditLifecycle!.signatureAuthorizations ||= [];
    const existing = authorizations.at(-1);
    if (existing && existing.basis === basis && existing.opinionRevision === opinion.revision && existing.signatureDate === signatureDate && existing.signaturePng === visuals?.signaturePng && existing.sealPng === visuals?.sealPng)
      return existing;
    authorizations.push({
      revision: authorizations.length + 1,
      basis,
      opinionRevision: opinion.revision,
      signatureDate,
      signedByUserId: this.state.currentUserId,
      signaturePng: visuals?.signaturePng,
      sealPng: visuals?.sealPng,
      sealApplied: true,
      at: new Date().toISOString(),
      note: note.trim()
    });
    const clock = engagement.auditLifecycle!.archiveControl;
    const due = plusDays(signatureDate, 60);
    if (!clock.freezeDueDate || due < clock.freezeDueDate) {
      clock.finalReportDate = signatureDate;
      clock.freezeDueDate = due;
    }
    clock.freezeStatus = 'Counting Down';
    clock.history.push({ at: new Date().toISOString(), actorUserId: this.state.currentUserId, action: 'Partner signature starts compliance countdown', reason: `Opinion v${opinion.revision}; signature ${signatureDate}; earliest due date ${clock.freezeDueDate}. Reissues never extend this deadline.` });
    this.event(
      engagement,
      'Partner signature & firm seal applied (simulated)',
      `Signature date ${signatureDate}; opinion revision ${opinion.revision}. Authoritative signature event; compilation and delivery remain separate steps. No cryptographic or legal signature is claimed.`
    );
  }
  public async generateDeliverables(engagementId: string, reportDate: string) {
    let engagement = this.engagement(engagementId, ['partner'], true);
    this.assignedPartner(engagement);
    if (criticalConfirmationBlockers(this.state, engagement).length) {
      try { await this.generateHoldingLetter(engagementId); }
      catch (error) { throw new GuardError('INVALID_STATE', `Reporting blocked; Holding Letter generation failed. Retry the Holding Letter action: ${String(error)}`); }
    }
    fail(targetReleaseBlockers(this.state, engagement));
    const opinion = currentPartnerOpinion(this.state, engagement);
    if (this.state.findings.some(f => f.engagementId === engagementId && f.managementLetterVisible && (!f.impact?.trim() || !f.recommendation?.trim()))) throw new GuardError('INVALID_STATE','Complete every designated management-letter impact and recommendation before compiling.');
    if (!opinion)
      throw new GuardError('INVALID_STATE', 'The assigned Partner must select an opinion first.');
    fail(opinionValidation(opinion.value, opinion.focusArea, opinion.basis));
    // R10: compilation requires the recorded partner signature/seal for the current basis,
    // and the report date must equal the authorized signature date.
    const signature = currentSignatureAuthorization(this.state, engagement);
    if (!signature)
      throw new GuardError(
        'INVALID_STATE',
        'The assigned Partner must record the simulated digital signature and firm seal for the current opinion and reporting basis before compiling deliverables.'
      );
    if (!isIsoDate(reportDate) || reportDate > this.state.asOfDate)
      throw new GuardError(
        'INVALID_STATE',
        'Use a valid final opinion/report date on or before the simulation as-of date.'
      );
    if (reportDate !== signature.signatureDate)
      throw new GuardError(
        'INVALID_STATE',
        `The report date must equal the authorized signature date ${signature.signatureDate}. Re-sign the reporting basis to change the signature date.`
      );
    fail(targetReleaseBlockers(this.state, engagement));
    const reviewAt = engagement.auditLifecycle!.partnerClearances.at(-1)!.at.slice(0, 10);
    if (reportDate < reviewAt)
      throw new GuardError(
        'INVALID_STATE',
        'The final report date cannot predate current Partner clearance.'
      );
    const basis = reportBasis(this.state, engagement),
      actor = this.state.currentUserId,
      id = uniqueId(`FINAL-${engagementId}`);
    const client = this.state.clients.find((c) => c.id === engagement.client)!;
    const header = [
      `Client: ${client.name}`,
      `Engagement: ${engagementId} / ${engagement.period}`,
      `Final report date: ${reportDate}`,
      `Partner signature date (ISA 700): ${signature.signatureDate}`,
      `Opinion: ${opinion.value}`,
      `TB source: v${engagement.sourceVersion}`,
      `SRM revision: ${engagement.auditLifecycle!.srms.at(-1)!.revision}`,
      `Partner: ${engagement.partner}`,
      `Generated at: ${new Date().toISOString()}`,
      'PROTOTYPE DOCUMENT — no legal signature or external delivery.'
    ];
    const summary = billingSummary(this.state, engagement);
    const acceptedFee = summary.fee ?? engagement.agreedFee;
    const advancePaid = summary.advance;
    const balanceRemaining = money(acceptedFee - advancePaid);
    const financeRecipient = requireRoutedContact(this.state.contacts.filter(contact => contact.clientId === engagement.client), 'invoices_receipts');
    const reportRecipient = requireRoutedContact(this.state.contacts.filter(contact => contact.clientId === engagement.client), 'proposals_reports');
    const existingBalance = engagement.auditLifecycle!.balanceInvoices[0];
    if (existingBalance) {
      const existingInvoice = this.state.invoices.find(i => i.id === existingBalance.invoiceId);
      if (!existingInvoice || existingInvoice.amount !== balanceRemaining || existingInvoice.currency !== engagement.currency || existingBalance.acceptedFee !== acceptedFee || existingBalance.recognizedAdvance !== advancePaid) throw new GuardError('STALE_REVISION', 'Reconcile the existing final invoice obligation before compiling a replacement set.');
    }
    const finalInvoiceId = existingBalance?.invoiceId || uniqueId(`BAL-${engagementId}`);
    const invoiceNumber = existingBalance ? this.state.invoices.find(invoice => invoice.id === existingBalance.invoiceId)?.invoiceNumber : `${this.state.firmSettings.invoiceNumberPrefix}${this.state.firmSettings.invoiceNextNumber}`;
    if (!invoiceNumber) throw new GuardError('INVALID_STATE', 'The persisted final invoice is missing.');
    const reporting = applyReportingAdjustments(engagement.rows, this.state.adjustmentJournals.filter(journal => journal.engagementId === engagementId), engagement.sourceVersion,adjustmentSupportIssues(this.state,engagementId));
    if (reporting.unapplied.length) throw new GuardError('INVALID_STATE', 'Resolve reporting adjustment support before compiling the statements.');
    const income = calculateIncomeStatement(reporting.rows), position = calculateBalanceSheet(reporting.rows);
    const statementLines = [
      `Audited statement of profit or loss (${engagement.currency})`,
      `Revenue: ${money(income.revenue)}; Cost of sales: ${money(income.costOfSales)}; Operating expenses: ${money(income.operatingExpenses)}; Net profit / loss: ${money(income.netProfit)}`,
      `Audited statement of financial position (${engagement.currency})`,
      `Assets: ${money(position.totalAssets)}; Liabilities: ${money(position.totalLiabilities)}; Equity including current result: ${money(position.totalEquity)}`,
      ...reporting.rows.map(row => `${row.mappedStatementLine || row.type} | ${row.code} ${row.name}: ${money(row.balance)} ${engagement.currency}`)
    ];
    const definitions: Array<{
      deliverable:
        | 'Independent Auditor Report & Audited Financial Statements'
        | 'Management Letter'
        | 'Letter of Representation'
        | 'Management Correspondences Audit Trail'
        | 'Final Balance Fee Note'
        | 'Audit Report';
      lines: string[];
    }> = [
      {
        deliverable: 'Audit Report',
        lines: [
          ...header,
          `To: ${reportRecipient.name} (${reportRecipient.title || reportRecipient.contactRole})`,
          'Deliverable 1: Independent Auditor’s Report & Certified Financial Statements (ISA 700 / 705)',
          opinion.value === 'Clean'
            ? 'Clean / Unqualified Opinion — Financial statements give a true and fair view in accordance with IFRS'
            : `${opinion.value} Opinion — ISA 705 Modified Auditor Report`,
          ...(opinion.value !== 'Clean'
            ? // R08: one rendering function for preview and export; the partner's recorded
              // basis and FSLI are reproduced verbatim with no invented valuation defect.
              modifiedOpinionBasisLines(opinion)
            : []),
          ...statementLines,
          'Digital Credentials Embedded:',
          `• Engagement Partner Signature: [Signed Digitally by ${engagement.partner || 'Engagement Partner'}, Engagement Partner]`,
          `• Official Firm Stamp & Seal: STE Audit SYNTHETIC DEMO SEAL — no legal certification claim`
        ]
      },
      {
        deliverable: 'Management Letter',
        lines: [
          ...header,
          'Deliverable 2: Management Letter on Internal Control Observations',
          'Structured Observations (Deficiency -> Impact -> Auditor Recommendation):',
          ...managementLetterLines(this.state, engagement)
        ]
      },
      {
        deliverable: 'Letter of Representation',
        lines: [
          ...header,
          'Deliverable 3: Letter of Representation (LOR formatted for client letterhead)',
          `[Place on ${client.name} letterhead; reporting period ${engagement.period}]`,
          ...statementLines,
          'To: STE Audit & Accounting LLC',
          'This representation letter is provided in connection with your audit of the financial statements of the entity for the statutory reporting period for the purpose of expressing an opinion on whether the financial statements give a true and fair view in accordance with IFRS.',
          'Management acknowledges its responsibility for the preparation of financial statements, internal control systems, and complete disclosure of fraud, litigation and subsequent events (ISA 580).',
          'Signed by Executive Management: Managing Director / CEO and Chief Financial Officer.'
        ]
      },
      {
        deliverable: 'Management Correspondences Audit Trail',
        lines: [
          ...header,
          'Deliverable 4: Management Correspondences Audit Trail',
          'Summary of Formal Audit Inquiries, Confirmation Results & Cleared Inquiries:',
          ...clientCorrespondenceLines(this.state, engagement)
        ]
      },
      {
        deliverable: 'Final Balance Fee Note',
        lines: [
          STANDARD_PAYMENT_TERMS,
          ...header,
          'Deliverable 5: Final Balance Fee Note (Remaining 50% Professional Fee Balance)',
          `Invoice Number: ${invoiceNumber}`,
          `To: ${financeRecipient.name} (${financeRecipient.title || financeRecipient.contactRole}); ${financeRecipient.email}`,
          `Contracted Professional Fee: ${acceptedFee.toLocaleString()} ${engagement.currency}`,
          `Recognized 50% Advance Settlement: ${advancePaid.toLocaleString()} ${engagement.currency}`,
          `Net Balance Professional Fee Due: ${balanceRemaining.toLocaleString()} ${engagement.currency}`,
          'Payment Terms: Due upon delivery of certified audit deliverables package.'
        ]
      }
    ];
    const artifacts = [];
    for (const [index, d] of definitions.entries())
      artifacts.push({
        ...(await this.artifactWriter(`${id}-${index + 1}`, d.deliverable, d.lines, {signaturePng:signature.signaturePng,sealPng:signature.sealPng,signerName:this.state.currentPerson})),
        deliverable: d.deliverable
      });
    engagement = this.engagement(engagementId, ['partner'], true);
    this.assignedPartner(engagement);
    fail(targetReleaseBlockers(this.state, engagement));
    if (
      actor !== this.state.currentUserId ||
      basis !== reportBasis(this.state, engagement) ||
      currentSignatureAuthorization(this.state, engagement)?.revision !== signature.revision
    )
      throw new GuardError(
        'STALE_REVISION',
        'Cleared audit basis, opinion or partner signature changed while generating deliverables. Generate again.'
      );
    if (!existingBalance) {
      if (invoiceNumber !== `${this.state.firmSettings.invoiceNumberPrefix}${this.state.firmSettings.invoiceNextNumber}` || engagement.auditLifecycle!.balanceInvoices.length) throw new GuardError('STALE_REVISION', 'Invoice sequence changed during bundle generation. Compile again.');
      this.state.invoices.push({ id: finalInvoiceId, clientId: engagement.client, eng: engagementId, engagementId, invoiceNumber, description: 'Final audit balance — accepted fee less recorded advance', amount: balanceRemaining, paid: 0, currency: engagement.currency, status: 'Draft', due: plusDays(reportDate, this.state.firmSettings.paymentTermsDays), issueDate: reportDate, preparedBy: this.state.currentPerson, revision: 1, lines: [{ id: `${finalInvoiceId}-1`, description: 'Final audit balance', quantity: 1, rate: balanceRemaining, amount: balanceRemaining, sourceType: 'Fixed service', sourceId: engagement.proposalId }] });
      this.state.firmSettings.invoiceNextNumber++;
      engagement.auditLifecycle!.balanceInvoices.push({ invoiceId: finalInvoiceId, deliverableId: id, acceptedFee, recognizedAdvance: advancePaid, artifact: artifacts[4] });
    }
    if (existingBalance) engagement.auditLifecycle!.balanceInvoices.push({ invoiceId: finalInvoiceId, deliverableId: id, acceptedFee, recognizedAdvance: advancePaid, artifact: artifacts[4] });
    engagement.auditLifecycle!.deliverables.push({
      id,
      revision: engagement.auditLifecycle!.deliverables.length + 1,
      basis,
      opinionRevision: opinion.revision,
      generatedAt: new Date().toISOString(),
      signatureAuthorizationRevision: signature.revision,
      generatedByUserId: actor,
      reportDate,
      artifacts
    });
    const control = engagement.auditLifecycle!.archiveControl;
    control.finalReportDate ||= reportDate;
    control.freezeDueDate ||= plusDays(reportDate, 60);
    control.freezeStatus = 'Counting Down';
    control.reportSetId = id;
    control.history.push({ at: new Date().toISOString(), actorUserId: actor, action: 'Signed report bundle compiled', reason: `Bundle ${id}; report date ${reportDate}; existing signature deadline ${control.freezeDueDate} retained.` });
    this.event(
      engagement,
      'ML / LOR / Audit Report generated',
      `${id}, report date ${reportDate}. Prior versions remain historical.`
    );
    return artifacts;
  }
  public markDeliverablesDelivered(engagementId: string, note: string) {
    const engagement = this.engagement(engagementId, ['partner'], true);
    this.assignedPartner(engagement);
    requireText(note, 'Delivery/sign-off record', 10);
    const set = currentDeliverables(this.state, engagement);
    if (set && !hasExactFivePartBundle(set)) throw new GuardError('INVALID_STATE', 'Release requires exactly five semantic deliverables.');
    if (!set)
      throw new GuardError(
        'STALE_REVISION',
        'Generate a current cleared final audit set before recording delivery.'
      );
    if (set.deliveredAt) return;
    const signedRepresentation = engagement.auditLifecycle!.signedRepresentations?.filter(record => record.deliverableSetId === set.id && record.basis === set.basis).at(-1);
    if (!signedRepresentation) throw new GuardError('INVALID_STATE', 'Retain the executive-signed representation letter for this exact bundle before release.');
    const finalInvoice = this.state.invoices.find(invoice => invoice.id === engagement.auditLifecycle!.balanceInvoices[0]?.invoiceId);
    if (!finalInvoice) throw new GuardError('INVALID_STATE', 'Compile the persisted final invoice before release.');
    const commercial = billingSummary(this.state, engagement);
    if (finalInvoice.clientId !== engagement.client || finalInvoice.engagementId !== engagement.id || finalInvoice.currency !== engagement.currency || finalInvoice.amount !== commercial.balance || finalInvoice.status === 'Cancelled') throw new GuardError('STALE_REVISION', 'The persisted final invoice must reconcile to the exact engagement, currency and contracted balance before release.');
    set.draftRepresentationArtifact = set.artifacts[2];
    set.artifacts[2] = { ...signedRepresentation.artifact, deliverable: 'Letter of Representation' };
    if (finalInvoice.status === 'Draft') finalInvoice.status = 'Issued';
    set.deliveredAt = new Date().toISOString();
    set.deliveredByUserId = this.state.currentUserId;
    set.deliveryNote = note;
    const control = engagement.auditLifecycle!.archiveControl;
    control.history.push({
      at: new Date().toISOString(),
      actorUserId: this.state.currentUserId,
      action: control.finalReportDate
        ? 'Report release retains signature deadline'
        : 'Freeze timer started',
      reason: `Final opinion/report date ${set.reportDate}; report set ${set.id}.`
    });
    control.finalReportDate ||= set.reportDate;
    control.freezeDueDate ||= plusDays(set.reportDate, 60);
    control.freezeStatus = 'Counting Down';
    control.reportSetId = set.id;
    const version = engagement.releases.length + 1;
    engagement.releases.push({
      id: set.id,
      version,
      generation: engagement.generation,
      releasedAt: set.deliveredAt,
      releasedBy: this.state.currentPerson,
      delivered: true,
      dispatchNote: note,
      isAmended: version > 1,
      predecessorId: engagement.releases.at(-1)?.id,
      manifest: set.artifacts.map((a) => ({
        id: a.id,
        artifactId: a.id,
        name: a.name,
        type: a.deliverable,
        mimeType: a.mimeType,
        size: a.size,
        sha: a.sha256,
        sourceRevision: set.revision
      }))
    });
    this.event(
      engagement,
      'Final delivery/sign-off simulated',
      `${note}. Freeze due ${control.freezeDueDate} from report date, not invoice date.`
    );
  }
  public async generateBalanceInvoice(engagementId: string) {
    let engagement = this.engagement(engagementId, ['billing'], true);
    const delivered = currentDeliverables(this.state, engagement);
    const linked = engagement.auditLifecycle!.balanceInvoices.find(i => i.deliverableId === delivered?.id);
    if (linked && delivered?.deliveredAt) return linked.artifact;
    const set = currentDeliverables(this.state, engagement),
      summary = billingSummary(this.state, engagement);
    if (
      !set?.deliveredAt ||
      summary.fee === null ||
      summary.balance === null ||
      summary.balance <= 0
    )
      throw new GuardError(
        'INVALID_STATE',
        'A current delivered final report and positive accepted-fee balance are required.'
      );
    if (engagement.auditLifecycle!.balanceInvoices.some((i) => i.deliverableId === set.id))
      throw new GuardError(
        'INVALID_STATE',
        'The final balance invoice is already generated for this report set.'
      );
    if (engagement.auditLifecycle!.balanceInvoices.length)
      throw new GuardError(
        'INVALID_STATE',
        'A prior balance invoice exists. Reissued reports do not generate a second payment demand; retain the original commercial record.'
      );
    const actor = this.state.currentUserId,
      basis = reportBasis(this.state, engagement),
      advance = billingSummary(this.state, engagement).advance;
    const id = uniqueId(`BAL-${engagementId}`),
      invoiceNumber = `${this.state.firmSettings.invoiceNumberPrefix}${this.state.firmSettings.invoiceNextNumber}`;
    const artifact = await this.artifactWriter(id, 'Final Engagement Balance Invoice — Prototype', [
      `Engagement: ${engagementId} / ${engagement.period}`,
      `Client: ${this.state.clients.find((c) => c.id === engagement.client)?.name}`,
      `Invoice: ${invoiceNumber}`,
      `Accepted fee: ${summary.fee} ${engagement.currency}`,
      `Recognized manual advance: ${summary.advance} ${engagement.currency}`,
      `Remaining balance: ${summary.balance} ${engagement.currency}`,
      `Delivered final report: ${set.id}`,
      `Generated at: ${new Date().toISOString()}`,
      'Prototype invoice record. No external payment demand or email is sent.'
    ]);
    engagement = this.engagement(engagementId, ['billing'], true);
    if (
      actor !== this.state.currentUserId ||
      basis !== reportBasis(this.state, engagement) ||
      advance !== billingSummary(this.state, engagement).advance ||
      engagement.auditLifecycle!.balanceInvoices.length
    )
      throw new GuardError(
        'STALE_REVISION',
        'Commercial or final report state changed during invoice generation.'
      );
    this.state.invoices.push({
      id,
      clientId: engagement.client,
      eng: engagementId,
      engagementId,
      invoiceNumber,
      description: 'Final audit balance — accepted fee less recorded advance',
      amount: summary.balance,
      paid: 0,
      currency: engagement.currency,
      status: 'Issued',
      due: plusDays(this.state.asOfDate, this.state.firmSettings.paymentTermsDays),
      issueDate: this.state.asOfDate,
      preparedBy: this.state.currentPerson,
      revision: 1,
      lines: [
        {
          id: `${id}-1`,
          description: 'Final audit balance',
          quantity: 1,
          rate: summary.balance,
          amount: summary.balance,
          sourceType: 'Fixed service',
          sourceId: engagement.proposalId
        }
      ]
    });
    this.state.firmSettings.invoiceNextNumber++;
    engagement.auditLifecycle!.balanceInvoices.push({
      invoiceId: id,
      deliverableId: set.id,
      acceptedFee: summary.fee,
      recognizedAdvance: summary.advance,
      artifact
    });
    this.event(
      engagement,
      'Final balance invoice generated',
      `${invoiceNumber}: ${summary.balance} ${engagement.currency}`
    );
    return artifact;
  }
  public async recordSignedRepresentation(engagementId: string, setId: string, artifact: GeneratedArtifactRecord, executive: string, financeExecutive: string, note: string) {
    const engagement = this.engagement(engagementId, ['manager', 'partner'], true);
    requireText(executive, 'Executive management signatory');
    requireText(financeExecutive, 'Finance executive signatory');
    requireText(note, 'Signature inspection and source reference', 10);
    const set = currentDeliverables(this.state, engagement);
    if (!set || set.id !== setId || set.deliveredAt) throw new GuardError('STALE_REVISION', 'Choose the current unreleased bundle for the signed representation.');
    if (!artifact.size || !/^[a-f0-9]{64}$/i.test(artifact.sha256 || '') || !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(artifact.mimeType)) throw new GuardError('INVALID_STATE', 'Upload the signed PDF or Word representation letter with a verified hash.');
    const actor = this.state.currentUserId, basis = set.basis;
    await loadVerifiedArtifact(artifact);
    const current = this.engagement(engagementId, ['manager', 'partner'], true);
    if (actor !== this.state.currentUserId || currentDeliverables(this.state, current)?.id !== setId || basis !== reportBasis(this.state, current)) throw new GuardError('STALE_REVISION', 'Bundle or actor changed while verifying the signed representation.');
    const records = current.auditLifecycle!.signedRepresentations ||= [];
    records.push({ revision: records.length + 1, deliverableSetId: setId, basis, artifact, executive, financeExecutive, note, actorUserId: actor, at: new Date().toISOString() });
    this.event(current, 'Executive-signed representation retained', `${artifact.name}; ${executive}; ${financeExecutive}; ${note}`);
  }
  public async simulateFreeze(engagementId: string, asOfDate: string, partnerEarlyLock = false) {
    let engagement = this.engagement(
      engagementId,
      partnerEarlyLock ? ['partner'] : ['records', 'manager', 'partner'],
      true
    );
    if (partnerEarlyLock) this.assignedPartner(engagement);
    if (!isIsoDate(asOfDate))
      throw new GuardError('INVALID_STATE', 'Choose a valid simulation as-of date.');
    const control = engagement.auditLifecycle!.archiveControl,
      set = currentDeliverables(this.state, engagement);
    if (
      !set?.deliveredAt ||
      control.reportSetId !== set.id ||
      !control.freezeDueDate ||
      !engagement.auditLifecycle!.balanceInvoices.length
    )
      throw new GuardError(
        'INVALID_STATE',
        'Deliver the current final report and generate its balance invoice before archive simulation.'
      );
    if (asOfDate < control.finalReportDate!)
      throw new GuardError('INVALID_STATE', 'Simulation date cannot predate the report.');
    if (control.asOfDate && asOfDate < control.asOfDate)
      throw new GuardError(
        'INVALID_STATE',
        'Archive simulation is forward-only; use a reset scenario for another rehearsal.'
      );
    if (!partnerEarlyLock && asOfDate < control.freezeDueDate) {
      control.asOfDate = asOfDate;
      this.event(
        engagement,
        'Freeze countdown simulated',
        `${asOfDate}; due ${control.freezeDueDate}`
      );
      return;
    }
    const actor = this.state.currentUserId,
      basis = reportBasis(this.state, engagement);
    const artifacts = [];
    for (const artifact of set.artifacts) {
      const record = {
        ...artifact,
        id: `archive:${engagementId}:${set.id}:${artifact.id}`,
        sourceArtifactId: artifact.id
      };
      const blob = await loadVerifiedArtifact(artifact);
      artifacts.push({ record, blob });
    }
    await persistArtifacts(artifacts);
    engagement = this.engagement(
      engagementId,
      partnerEarlyLock ? ['partner'] : ['records', 'manager', 'partner'],
      true
    );
    if (actor !== this.state.currentUserId || basis !== reportBasis(this.state, engagement))
      throw new GuardError(
        'STALE_REVISION',
        'The report basis changed while preparing immutable archive copies.'
      );
    const currentControl = engagement.auditLifecycle!.archiveControl,
      at = new Date().toISOString();
    currentControl.asOfDate = asOfDate;
    currentControl.freezeStatus = 'Frozen';
    currentControl.frozenAt = at;
    currentControl.frozenByUserId = this.state.currentUserId;
    currentControl.history.push({
      at,
      actorUserId: actor,
      action: partnerEarlyLock ? 'Partner manual early lock' : 'Simulated 60-day freeze',
      reason: partnerEarlyLock
        ? `Report ${set.id}; partner manual early lock executed ahead of 60-day deadline ${currentControl.freezeDueDate}.`
        : `Report ${set.id}; report date ${set.reportDate}; due ${currentControl.freezeDueDate}; simulation as-of ${asOfDate}. Browser-local read-only enforcement only.`
    });
    const manifest = set.artifacts.map((a) => `${a.deliverable}: ${a.id} / SHA-256 ${a.sha256}`),
      copies = artifacts.map((a) => a.record);
    engagement.archive = {
      archivedAt: at,
      archivedBy: this.state.currentPerson,
      releaseId: set.id,
      manifest,
      artifacts: copies
    };
    engagement.archive.packagingStatus = 'Pending';
    await sealEngagementArchive(this.state, engagement);
    (this.state.archives ||= []).push({
      id: `ARCH-${set.id}`,
      engagementId,
      releaseId: set.id,
      clientName: this.state.clients.find((c) => c.id === engagement.client)!.name,
      service: engagement.service,
      year: engagement.year,
      archivedAt: at,
      archivedBy: this.state.currentPerson,
      onHold: false,
      manifestCount: engagement.archive.manifest.length,
      manifest: engagement.archive.manifest,
      artifacts: engagement.archive.artifacts
    });
    this.event(
      engagement,
      partnerEarlyLock ? 'Partner manual early archive lock executed' : 'Archive frozen read-only',
      `Simulation as-of ${asOfDate}. No live SharePoint lock or legal compliance verification.`
    );
  }
  public async retryArchivePackaging(engagementId: string) {
    requireActiveIdentity(this.state);
    if (!hasAnyRole(this.state,['records','manager','partner'])) throw new GuardError('FORBIDDEN_SCOPE','Archive packaging requires records, Manager or Partner access.');
    requireEngagementScope(this.state,engagementId,'administrative');
    const engagement = this.state.engagements.find(e => e.id === engagementId);
    if (!engagement?.archive || !isFrozen(engagement)) throw new GuardError('INVALID_STATE','Only a closed archive can be repackaged.');
    await sealEngagementArchive(this.state,engagement);
    this.notify();
  }
  public postFirmExpense(input: {
    date: string;
    category: 'Office rent' | 'Staff salaries' | 'Petty cash' | 'Other expenses' | 'Partner withdrawals';
    amount: number;
    description: string;
    reference: string;
  }) {
    requireActiveIdentity(this.state);
    if (!hasAnyRole(this.state, ['billing', 'admin', 'partner']))
      throw new GuardError(
        'FORBIDDEN_SCOPE',
        'Firm finance, administrator or Partner permission is required.'
      );
    if (
      !this.state.roleGrants.some(
        (g) =>
          g.userId === this.state.currentUserId &&
          g.role === this.state.currentRole &&
          g.scopeKind === 'Global' &&
          (!g.effectiveFrom || g.effectiveFrom <= this.state.asOfDate) &&
          (!g.expiresAt || g.expiresAt >= this.state.asOfDate)
      ) &&
      this.state.currentRole !== 'superuser'
    )
      throw new GuardError(
        'FORBIDDEN_SCOPE',
        'The firm ledger requires a current Global firm-finance grant.'
      );
    requireMoney(input.amount);
    requireText(input.description, 'Expense description');
    requireText(input.reference, 'Expense reference');
    if (
      !isIsoDate(input.date) ||
      !['Office rent', 'Staff salaries', 'Petty cash', 'Other expenses', 'Partner withdrawals'].includes(input.category)
    )
      throw new GuardError('INVALID_STATE', 'Use a valid firm expense category and date.');
    if (this.state.firmLedger?.some((e) => e.reference === input.reference.trim()))
      throw new GuardError('INVALID_STATE', 'Firm ledger references must be unique.');
    const id = uniqueId('FIRM');
    (this.state.firmLedger ||= []).push({
      id,
      date: input.date,
      description: input.description.trim(),
      reference: input.reference.trim(),
      currency: this.state.firmSettings.currency,
      actorUserId: this.state.currentUserId,
      createdAt: new Date().toISOString(),
      lines: [
        { account: input.category, debit: input.amount, credit: 0 },
        { account: 'Cash', debit: 0, credit: input.amount }
      ]
    });
    this.state.events.unshift({
      text: `Firm expense recorded: ${input.category} / ${input.amount}; separate from all client TBs.`,
      ref: id,
      time: new Date().toISOString(),
      type: 'ledger'
    });
    this.notify();
    return id;
  }
}
