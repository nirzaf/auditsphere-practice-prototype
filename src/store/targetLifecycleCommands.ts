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
  activationBlockers,
  advanceBasis,
  advanceReceipts,
  billingSummary,
  criticalConfirmationBlockers,
  currentDeliverables,
  currentPlan,
  currentReview,
  emptyAuditLifecycle,
  fieldworkBlockers,
  firmTrialBalance,
  isFrozen,
  isIsoDate,
  managerReviewBlockers,
  money,
  opinionValidation,
  plusDays,
  reportBasis,
  reviewBasis,
  targetReleaseBlockers
} from '../services/targetLifecycle';
import { createPDFBlob, createXLSXBlob } from '../services/exportService';
import {
  artifactSha256,
  loadVerifiedArtifact,
  persistArtifact,
  persistArtifacts
} from '../services/artifactStore';

export type ArtifactWriter = (
  id: string,
  title: string,
  lines: string[]
) => Promise<GeneratedArtifactRecord>;
export async function writeLifecyclePDF(
  id: string,
  title: string,
  lines: string[]
): Promise<GeneratedArtifactRecord> {
  const blob = createPDFBlob(title, lines);
  const record: GeneratedArtifactRecord = {
    id,
    name: `${id.replaceAll(':', '_')}.pdf`,
    kind: 'PDF',
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
    if (isFrozen(engagement))
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
    if (
      engagement.auditLifecycle!.commercialBasis?.proposalId === proposalId &&
      engagement.auditLifecycle!.commercialBasis?.revision === proposal.revision
    )
      return;
    if (
      proposal.periodStart?.slice(0, 4) !== String(engagement.year) ||
      !proposal.items.some((item) => /audit/i.test(item.serviceName))
    )
      throw new GuardError('INVALID_STATE', 'Pin an audit proposal for this engagement year.');
    engagement.auditLifecycle!.commercialBasis = { proposalId, revision: proposal.revision };
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
    const summary = billingSummary(this.state, engagement);
    if (summary.advance + input.amount > summary.fee!)
      throw new GuardError(
        'INVALID_STATE',
        'Recorded advances cannot exceed the accepted fee. Reverse a wrong record explicitly.'
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
      allocatedAmount: 0,
      allocations: []
    });
    engagement.auditLifecycle!.advancePayments.push({
      receiptId: id,
      ...pin,
      recordedByUserId: this.state.currentUserId
    });
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
    payment.reversalReason = reason.trim();
    this.event(
      engagement,
      'Advance reversed',
      `${receiptId}: ${reason.trim()}. Receipt and downstream clearance are now stale.`
    );
  }
  public async generateOfficialReceipt(engagementId: string) {
    let engagement = this.engagement(engagementId, ['billing']);
    const summary = billingSummary(this.state, engagement),
      receipts = advanceReceipts(this.state, engagement);
    if (!acceptedProposal(this.state, engagement) || !receipts.length)
      throw new GuardError(
        'INVALID_STATE',
        'Record an advance against the current accepted fee first.'
      );
    const basis = advanceBasis(this.state, engagement),
      actor = this.state.currentUserId;
    const client = this.state.clients.find((c) => c.id === engagement.client)!;
    const id = uniqueId(`RECEIPT-${engagement.id}`);
    const artifact = await this.artifactWriter(id, 'Official Receipt — Prototype', [
      `Client: ${client.name}`,
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
    engagement.auditLifecycle!.receiptDocuments.push({
      receiptIds: receipts.map((r) => r.id),
      basis,
      generatedAt: new Date().toISOString(),
      artifact
    });
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
  public saveStaffing(engagementId: string, allocations: StaffAllocation[], reason: string) {
    const engagement = this.engagement(engagementId, ['manager', 'partner'], true);
    requireText(reason, 'Staffing revision reason');
    const roles: StaffAllocation['role'][] = [
      'Partner',
      'Manager',
      'Senior/Reviewer',
      'Preparer/Staff'
    ];
    if (!allocations.length || roles.some((r) => !allocations.some((a) => a.role === r)))
      throw new GuardError('INVALID_STATE', 'Assign all four engagement responsibilities.');
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
      if (a.chargeRate !== null) requireMoney(a.chargeRate, true);
      if (a.costRate !== null) requireMoney(a.costRate, true);
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
    input: { fileName: string; format: 'CSV' | 'XLSX'; sha256: string }
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
      !/^[0-9a-f]{64}$/i.test(input.sha256)
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
  public generateSample(
    engagementId: string,
    populationId: string,
    method: 'Random' | 'Monetary Unit Sampling' | 'Stratified',
    count: number,
    seed: number
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
      !['Random', 'Monetary Unit Sampling', 'Stratified'].includes(method)
    )
      throw new GuardError(
        'INVALID_STATE',
        'Choose a supported method, integer sample size and reproducible integer seed.'
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
        selected.add(ranked[start + Math.floor(random() * (end - start))].id);
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
      items.slice(0, count).forEach((i) => selected.add(i.id));
    }
    for (const item of population.items) {
      item.selected = selected.has(item.id);
      item.tested = false;
      item.result = 'Untested';
      item.physicalReference = undefined;
    }
    population.methodology = `${method}; seed ${seed}`;
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
      `${populationId}: ${method}, seed ${seed}, ${selected.size}/${items.length} distinct items from ${count} draws; control total ${population.totalPopulationValue}.`
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
    const preparer = this.state.users.find(
      (u) => u.id === staffing.allocations.find((a) => a.role === 'Preparer/Staff')!.userId
    )!;
    const reviewer = this.state.users.find(
      (u) => u.id === staffing.allocations.find((a) => a.role === 'Senior/Reviewer')!.userId
    )!;
    requireIndependentActor(
      preparer.id,
      reviewer.id,
      'assign a workpaper to its own reviewer',
      this.state
    );
    const workpaperId = `WP-${engagementId}-AUDIT`;
    const areas = [
      'Revenue',
      'Purchasing',
      'Fixed Assets',
      'Treasury',
      'Analytical Review',
      'Going Concern'
    ];
    const programs = areas.map((area, index) => ({
      id: `AP-${engagementId}-${index + 1}`,
      engagementId,
      area,
      financialStatementLines: [
        ...new Set(
          engagement.rows
            .filter((r) =>
              area === 'Revenue'
                ? r.type === 'revenue'
                : area === 'Purchasing'
                  ? r.type === 'expense' || /payable|inventory|purchas/i.test(r.name)
                  : area === 'Fixed Assets'
                    ? /fixed|plant|equipment|ppe|depreciation/i.test(r.name)
                    : area === 'Treasury'
                      ? /cash|bank|loan|borrow/i.test(r.name)
                      : true
            )
            .map((r) => r.mappedStatementLine!)
        )
      ],
      title: `${area} audit program`,
      leadWorkpaperRef: workpaperId,
      objective: `Document ${area.toLowerCase()} work, evidence and conclusion.`,
      procedures: [
        {
          id: `PROC-${engagementId}-${index + 1}`,
          engagementId,
          title:
            area === 'Going Concern'
              ? 'Evaluate going concern and management assessment'
              : area === 'Analytical Review'
                ? 'Perform substantive analytical review'
                : `Test ${area.toLowerCase()} balances`,
          instructions: `Record work, evidence, exceptions and conclusion for ${area.toLowerCase()}.`,
          assignee: preparer.name,
          status: 'Not started' as const,
          linkedWorkpaperId: workpaperId
        }
      ]
    }));
    this.state.auditPrograms.push(...programs);
    engagement.workpapers.push({
      id: workpaperId,
      title: 'Audit fieldwork and completion conclusions',
      objective: 'Reconcile the TB and document the six program areas.',
      assertion: 'Existence / completeness / valuation / presentation',
      risk: 'Material misstatement and going concern',
      version: 1,
      status: 'Planned',
      applicable: true,
      scope: engagement.period,
      workPerformed: '',
      conclusion: '',
      preparer: preparer.name,
      reviewer: reviewer.name,
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
    this.event(engagement, 'Standard audit programs prepared', areas.join(', '));
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
    conclusion: string
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
    if (
      !wp.evidenceRefs?.length ||
      wp.evidenceRefs.some(
        (id) =>
          !this.state.documents.some(
            (d) =>
              d.id === id &&
              d.engagementId === engagementId &&
              !d.brokenLink &&
              !this.state.documents.some((next) => next.supersedesDocumentId === id)
          )
      )
    )
      throw new GuardError(
        'INVALID_STATE',
        'Link current accepted evidence before generating the workpaper workbook.'
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
      ['Evidence', wp.evidenceRefs.join(', ')],
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
    rows: import('../types').SamplePopulationRow[]
  ) {
    const engagement = this.engagement(engagementId, ['preparer', 'manager', 'reviewer'], true);
    fail(fieldworkBlockers(this.state, engagement));
    const account = engagement.rows.find((r) => r.code === accountCode);
    if (
      !account ||
      !rows.length ||
      !fileName.trim() ||
      !/^[0-9a-f]{64}$/i.test(sha256) ||
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
    >
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
      !['Bank', 'Debtor', 'Inventory', 'Other'].includes(input.type) ||
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
    const engagement = this.engagement(engagementId, ['manager', 'partner'], true),
      blockers = criticalConfirmationBlockers(this.state, engagement);
    if (!blockers.length)
      throw new GuardError(
        'INVALID_STATE',
        'A holding letter requires a critical outstanding confirmation.'
      );
    return this.artifactWriter(
      uniqueId(`HOLD-${engagementId}`),
      'Pending Confirmation / Holding Letter — Prototype',
      [
        `Engagement: ${engagementId} / ${engagement.period}`,
        ...blockers,
        'Final report remains blocked. This artifact does not dispose of outstanding confirmations.',
        'Local prototype letter; no email or external dispatch.'
      ]
    );
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
    for (const wp of engagement.workpapers.filter((w) => w.applicable))
      requireIndependentActor(
        wp.submittedBy || wp.preparer,
        this.state.currentUserId,
        'clear work they prepared',
        this.state
      );
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
    const summary = [
      `Client: ${this.state.clients.find((c) => c.id === engagement.client)?.name}`,
      `Engagement: ${engagement.id} / ${engagement.period}`,
      `TB source: v${engagement.sourceVersion}; PM ${plan.overallMateriality}, TE ${plan.performanceMateriality}, SAD ${plan.clearlyTrivialThreshold}`,
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
      `Source fingerprint: ${basis}`,
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
    engagement.auditLifecycle!.opinions.push({
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
      `${value}; ${focusArea}. Prior deliverables require regeneration.`
    );
  }
  public async generateDeliverables(engagementId: string, reportDate: string) {
    let engagement = this.engagement(engagementId, ['manager', 'partner'], true);
    fail(targetReleaseBlockers(this.state, engagement));
    const opinion = engagement.auditLifecycle!.opinions.at(-1);
    if (!opinion)
      throw new GuardError('INVALID_STATE', 'The assigned Partner must select an opinion first.');
    fail(opinionValidation(opinion.value, opinion.focusArea, opinion.basis));
    if (!isIsoDate(reportDate) || reportDate > this.state.asOfDate)
      throw new GuardError(
        'INVALID_STATE',
        'Use a valid final opinion/report date on or before the simulation as-of date.'
      );
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
          'Deliverable 1: Independent Auditor’s Report & Certified Financial Statements (ISA 700 / 705)',
          opinion.value === 'Clean'
            ? 'Clean / Unqualified Opinion — Financial statements give a true and fair view in accordance with IFRS'
            : `${opinion.value} Opinion — ISA 705 Modified Auditor Report`,
          ...(opinion.value !== 'Clean'
            ? [
                `Basis for ${opinion.value} Opinion (ISA 705):`,
                ...(opinion.focusArea ? [`Affected FSLI / Focus Area: ${opinion.focusArea}`] : []),
                opinion.basis
              ]
            : []),
          'Financial Statements: Statement of Financial Position, Statement of Profit or Loss and Other Comprehensive Income, Statement of Changes in Equity, Statement of Cash Flows, and Notes.',
          'Digital Credentials Embedded:',
          `• Engagement Partner Signature: [Signed Digitally by Daniel James, Engagement Partner]`,
          `• Official Firm Stamp & Seal: STE Audit & Accounting LLC [State of Qatar - QFC Registration QFC-00892]`
        ]
      },
      {
        deliverable: 'Management Letter',
        lines: [
          ...header,
          'Deliverable 2: Management Letter on Internal Control Observations',
          'Structured Observations (Deficiency -> Impact -> Auditor Recommendation):',
          ...this.state.findings
            .filter((f) => f.engagementId === engagementId)
            .map(
              (f) =>
                `• Deficiency: ${f.title}\n  Impact: ${f.severity} severity on ${f.financialStatementLine || 'financial reporting'}\n  Auditor Recommendation: ${f.recommendation || f.condition || f.description || ''} (${f.disposition})`
            )
        ]
      },
      {
        deliverable: 'Letter of Representation',
        lines: [
          ...header,
          'Deliverable 3: Letter of Representation (LOR formatted for client letterhead)',
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
          ...(this.state.confirmations || [])
            .filter((c) => c.engagementId === engagementId)
            .map((c) => `• [Confirmation ${c.type}] ${c.counterparty} (${c.relatedFsli}): Status ${c.status} (Critical: ${c.critical ? 'Yes' : 'No'})`),
          ...(engagement.reviews || [])
            .map((r) => `• [Review Inquiry] ${r.title} (${r.status}): ${r.body}`)
        ]
      },
      {
        deliverable: 'Final Balance Fee Note',
        lines: [
          ...header,
          'Deliverable 5: Final Balance Fee Note (Remaining 50% Professional Fee Balance)',
          `Invoice Number: INV-2026-FINAL-${engagementId}`,
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
        ...(await this.artifactWriter(`${id}-${index + 1}`, d.deliverable, d.lines)),
        deliverable: d.deliverable
      });
    engagement = this.engagement(engagementId, ['manager', 'partner'], true);
    fail(targetReleaseBlockers(this.state, engagement));
    if (actor !== this.state.currentUserId || basis !== reportBasis(this.state, engagement))
      throw new GuardError(
        'STALE_REVISION',
        'Cleared audit basis/opinion changed while generating deliverables. Generate again.'
      );
    engagement.auditLifecycle!.deliverables.push({
      id,
      revision: engagement.auditLifecycle!.deliverables.length + 1,
      basis,
      opinionRevision: opinion.revision,
      generatedAt: new Date().toISOString(),
      generatedByUserId: actor,
      reportDate,
      artifacts
    });
    this.event(
      engagement,
      'ML / LOR / Audit Report generated',
      `${id}, report date ${reportDate}. Prior versions remain historical.`
    );
    return artifacts;
  }
  public markDeliverablesDelivered(engagementId: string, note: string) {
    const engagement = this.engagement(engagementId, ['manager', 'partner'], true);
    requireText(note, 'Delivery/sign-off record', 10);
    const set = currentDeliverables(this.state, engagement);
    if (!set)
      throw new GuardError(
        'STALE_REVISION',
        'Generate a current cleared final audit set before recording delivery.'
      );
    if (set.deliveredAt) return;
    set.deliveredAt = new Date().toISOString();
    set.deliveredByUserId = this.state.currentUserId;
    set.deliveryNote = note;
    const control = engagement.auditLifecycle!.archiveControl;
    control.history.push({
      at: new Date().toISOString(),
      actorUserId: this.state.currentUserId,
      action: control.finalReportDate
        ? 'Report reissue resets freeze basis'
        : 'Freeze timer started',
      reason: `Final opinion/report date ${set.reportDate}; report set ${set.id}.`
    });
    control.finalReportDate = set.reportDate;
    control.freezeDueDate = plusDays(set.reportDate, 60);
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
  public async simulateFreeze(engagementId: string, asOfDate: string) {
    let engagement = this.engagement(engagementId, ['records', 'manager', 'partner'], true);
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
    if (asOfDate < control.freezeDueDate) {
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
    engagement = this.engagement(engagementId, ['records', 'manager', 'partner'], true);
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
      action: 'Simulated 60-day freeze',
      reason: `Report ${set.id}; report date ${set.reportDate}; due ${currentControl.freezeDueDate}; simulation as-of ${asOfDate}. Browser-local read-only enforcement only.`
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
      manifestCount: manifest.length,
      manifest,
      artifacts: copies
    });
    this.event(
      engagement,
      'Archive frozen read-only',
      `Simulation as-of ${asOfDate}. No live SharePoint lock or legal compliance verification.`
    );
  }
  public postFirmExpense(input: {
    date: string;
    category: 'Office rent' | 'Staff salaries' | 'Petty cash' | 'Other expenses';
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
      !['Office rent', 'Staff salaries', 'Petty cash', 'Other expenses'].includes(input.category)
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
