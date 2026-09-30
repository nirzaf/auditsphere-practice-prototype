import type { EngagementRecord, PrototypeState, ProposalRecord } from '../types';
import type {
  AuditOpinion,
  TargetEngagementLifecycle,
  TargetStageDefinition,
  TargetLifecycleState
} from '../types/targetLifecycle';
import { isReleaseBlockingFinding } from './findings';
import { calculateBalanceSheet, calculateIncomeStatement, applyReportingAdjustments } from './calculations';
import { adjustmentSupportIssues } from './adjustmentSupport';

export function hasValidLeadProfile(state: PrototypeState, clientId: string) {
  const client = state.clients.find(c => c.id === clientId);
  return Boolean(client?.name.trim() && state.contacts.some(c => c.clientId === clientId && c.active && c.name.trim() && (c.email || c.phone)));
}
export const FINAL_DELIVERABLE_TYPES = ['Independent Auditor Report & Audited Financial Statements', 'Management Letter', 'Letter of Representation', 'Management Correspondences Audit Trail', 'Final Balance Fee Note'];
export function hasExactFivePartBundle(set: import('../types/targetLifecycle').DeliverableSet) {
  const formatValid = (artifact: typeof set.artifacts[number]) => artifact.mimeType === 'application/pdf' || (artifact.deliverable === 'Letter of Representation' && artifact.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  return set.artifacts.length === 5 && new Set(set.artifacts.map(a => a.id)).size === 5 && set.artifacts.every(formatValid) && FINAL_DELIVERABLE_TYPES.every(type => set.artifacts.filter(a => (a.deliverable === type || (type === FINAL_DELIVERABLE_TYPES[0] && a.deliverable === 'Audit Report')) && a.id && /^[a-f0-9]{64}$/i.test(a.sha256) && a.size > 0).length === 1);
}
export function hasAllApplicableProceduresSubmitted(state: PrototypeState, engagement: EngagementRecord) {
  const programs = scopedPrograms(state, engagement);
  return !fieldworkBlockers(state, engagement).length && !engagement.workpapers.some(w => w.applicable && w.status === 'Changes required') && programs.length > 0 && programs.every(p => p.procedures.length > 0 && p.procedures.every(s => ['Submitted', 'Cleared'].includes(s.status) && !s.scopeReassessmentRequired && !s.evidenceReassessmentRequired));
}
export function sampleEvidenceReady(state: PrototypeState, engagement: EngagementRecord, item: import('../types').SamplePopulationRow) {
  if (!item.tested) return false;
  const physical = Boolean(item.physicalReference?.indexCode.trim() && item.physicalReference.description.trim());
  const document = state.documents.find(d => d.id === item.evidenceDoc && d.engagementId === engagement.id && d.clientId === engagement.client && !d.brokenLink && !state.documents.some(next => next.supersedesDocumentId === d.id));
  const digital = Boolean(document && state.evidenceCatalogue.some(e => e.documentId === document.id && e.adequacyStatus === 'Adequate' && e.version === document.version));
  return item.evidenceMode === 'Physical' ? physical : item.evidenceMode === 'Hybrid' ? physical && digital : item.evidenceMode === 'Digital' ? digital : physical || digital;
}
export function substantiveProgramFor(state: PrototypeState, engagementId: string, line: string) {
  return state.auditPrograms.find(p => p.engagementId === engagementId && !['Analytical Review', 'Going Concern'].includes(p.area) && p.financialStatementLines?.includes(line));
}
export function materialityBenchmark(engagement: EngagementRecord, benchmark: string) {
  benchmark = benchmark.toLowerCase();
  const bs = calculateBalanceSheet(engagement.rows), pl = calculateIncomeStatement(engagement.rows);
  const tax = engagement.rows.filter(r => r.type === 'expense' && /income tax|tax expense/i.test(r.name)).reduce((n,r) => n + r.balance,0);
  const value = benchmark === 'assets' ? bs.totalAssets : benchmark === 'equity' ? bs.totalEquity : benchmark === 'profit' ? pl.netProfit + tax : pl.revenue;
  const accounts = engagement.rows.filter(r => benchmark === 'assets' ? r.type === 'asset' : benchmark === 'equity' ? ['equity', 'revenue', 'expense'].includes(r.type) : benchmark === 'profit' ? ['revenue', 'expense'].includes(r.type) : r.type === 'revenue').map(r => ({ code: r.code, balance: r.balance }));
  return { value: money(value), accounts };
}
export const STANDARD_CHARGE_OUT_RATES = { Partner: 1000, Manager: 750, 'Senior/Reviewer': 500, 'Preparer/Staff': 200 } as const;

export const TARGET_STAGES: TargetStageDefinition[] = [
  {
    id: 'lead',
    label: 'Lead & CRM',
    route: 'acquisition',
    owner: 'Relationship owner',
    roles: ['relationship', 'manager', 'partner']
  },
  {
    id: 'proposal',
    label: 'Proposal & Engagement Letter',
    route: 'proposals',
    owner: 'Relationship owner / client',
    roles: ['relationship', 'manager', 'partner']
  },
  {
    id: 'acceptance',
    label: 'Acceptance / continuance',
    route: 'onboarding',
    owner: 'Compliance → Engagement Partner',
    roles: ['onboarding', 'compliance', 'manager', 'partner']
  },
  {
    id: 'advance',
    label: 'EL pin, 50% advance & receipt',
    route: 'billing',
    owner: 'Billing officer (after Dual-Key clearance + EL)',
    roles: ['billing', 'manager', 'partner']
  },
  {
    id: 'workspace',
    label: 'M365 workspace',
    route: 'm365-setup',
    owner: 'System administrator',
    roles: ['admin', 'manager', 'partner']
  },
  {
    id: 'pbc',
    label: 'Client PBC & accepted evidence',
    route: 'documents',
    owner: 'Client contributor → audit team',
    roles: ['manager', 'preparer', 'reviewer']
  },
  {
    id: 'staffing',
    label: 'Staff scheduling & economics',
    route: 'scheduling',
    owner: 'Audit Manager',
    roles: ['manager', 'partner']
  },
  {
    id: 'tb',
    label: 'Trial balance & mapping',
    route: 'trial-balance',
    owner: 'Preparer',
    roles: ['preparer', 'manager', 'reviewer']
  },
  {
    id: 'planning',
    label: 'Planning & PM / TE / SAD',
    route: 'audit-planning',
    owner: 'Audit Manager',
    roles: ['manager', 'preparer', 'partner']
  },
  {
    id: 'financials',
    label: 'P&L / balance sheet drill-down',
    route: 'financial-statements',
    owner: 'Audit team',
    roles: ['preparer', 'manager', 'reviewer']
  },
  {
    id: 'fieldwork',
    label: 'Fieldwork programs',
    route: 'audit-fieldwork',
    owner: 'Preparer / reviewer',
    roles: ['preparer', 'manager', 'reviewer'],
    aliases: ['audit-risks']
  },
  {
    id: 'sampling',
    label: 'Sampling & X-1 physical index',
    route: 'sampling',
    owner: 'Preparer',
    roles: ['preparer', 'manager', 'reviewer']
  },
  {
    id: 'confirmations',
    label: 'Confirmations',
    route: 'confirmations',
    owner: 'Audit Manager',
    roles: ['preparer', 'manager', 'reviewer', 'partner']
  },
  {
    id: 'review',
    label: 'Preparer → Manager review',
    route: 'reviews',
    owner: 'Preparer → Manager',
    roles: ['preparer', 'manager', 'reviewer', 'partner']
  },
  {
    id: 'srm',
    label: 'SRM → Partner clearance',
    route: 'reviews',
    owner: 'Manager → Engagement Partner',
    roles: ['manager', 'partner']
  },
  {
    id: 'opinion',
    label: 'Opinion & ML / LOR / Audit Report',
    route: 'delivery',
    owner: 'Engagement Partner',
    roles: ['manager', 'partner']
  },
  {
    id: 'balance',
    label: 'Final balance invoice',
    route: 'billing',
    owner: 'Billing officer',
    roles: ['billing', 'manager', 'partner']
  },
  {
    id: 'archive',
    label: '60-day freeze & read-only archive',
    route: 'records',
    owner: 'Records administrator',
    roles: ['records', 'manager', 'partner']
  },
  {
    id: 'analytics',
    label: 'Practice analytics & firm ledger',
    route: 'reports',
    owner: 'Partner / firm finance',
    roles: ['manager', 'partner', 'billing', 'admin']
  }
];
export function emptyAuditLifecycle(): TargetEngagementLifecycle {
  return {
    advancePayments: [],
    receiptDocuments: [],
    staffing: [],
    managerReviews: [],
    srms: [],
    partnerClearances: [],
    opinions: [],
    deliverables: [],
    balanceInvoices: [],
    archiveControl: { freezeStatus: 'Not Started', history: [] },
    history: []
  };
}
export function normalizeTargetState(state: PrototypeState): PrototypeState {
  for (const key of [
    'confirmations',
    'firmLedger',
    'portalPasswordChanges',
    'portalDelegations'
  ] as const) {
    if (state[key] !== undefined && !Array.isArray(state[key]))
      throw new Error(`Invalid target lifecycle collection: ${key}.`);
  }
  for (const engagement of state.engagements) {
    const target = engagement.auditLifecycle;
    if (!target) continue;
    for (const key of [
      'advancePayments',
      'receiptDocuments',
      'staffing',
      'managerReviews',
      'srms',
      'partnerClearances',
      'opinions',
      'deliverables',
      'balanceInvoices',
      'history'
    ] as const)
      if (!Array.isArray(target[key]))
        throw new Error(`Invalid lifecycle ${key} in ${engagement.id}.`);
    if (
      !target.archiveControl ||
      !['Not Started', 'Counting Down', 'Frozen'].includes(target.archiveControl.freezeStatus) ||
      !Array.isArray(target.archiveControl.history)
    )
      throw new Error(`Invalid archive control in ${engagement.id}.`);
    if (
      target.staffing.some(
        (r) =>
          !Number.isInteger(r.revision) ||
          !Array.isArray(r.allocations) ||
          r.allocations.some(
            (a) =>
              !Number.isFinite(a.plannedHours) ||
              a.plannedHours <= 0 ||
              (a.chargeRate !== null && (!Number.isFinite(a.chargeRate) || a.chargeRate < 0)) ||
              (a.costRate !== null && (!Number.isFinite(a.costRate) || a.costRate < 0))
          )
      )
    )
      throw new Error(`Invalid staffing in ${engagement.id}.`);
    if (
      target.archiveControl.freezeStatus === 'Frozen' &&
      (!target.archiveControl.finalReportDate ||
        !isIsoDate(target.archiveControl.finalReportDate) ||
        target.archiveControl.freezeDueDate !==
          plusDays(target.archiveControl.finalReportDate, 60) ||
        !target.archiveControl.frozenAt ||
        !target.archiveControl.frozenByUserId ||
        !engagement.archive)
    )
      throw new Error(`Frozen archive metadata is incomplete for ${engagement.id}.`);
  }
  for (const entry of state.firmLedger || []) {
    if (
      !isIsoDate(entry.date) ||
      !Array.isArray(entry.lines) ||
      entry.lines.length < 2 ||
      entry.lines.some(
        (l) =>
          !Number.isFinite(l.debit) ||
          !Number.isFinite(l.credit) ||
          l.debit < 0 ||
          l.credit < 0 ||
          (l.debit > 0 && l.credit > 0)
      ) ||
      Math.abs(entry.lines.reduce((n, l) => n + l.debit - l.credit, 0)) > 0.005
    )
      throw new Error('Invalid or unbalanced firm ledger entry.');
  }
  state.confirmations ||= [];
  state.firmLedger ||= [];
  state.portalPasswordChanges ||= [];
  state.portalDelegations ||= [];
  for (const engagement of state.engagements) {
    engagement.auditLifecycle ||= emptyAuditLifecycle();
    // Historical EQR records remain available in exported history, never a target gate.
    engagement.eqrRequired = false;
  }
  return state;
}
export function isIsoDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function plusDays(value: string, days: number): string {
  if (!isIsoDate(value)) throw new Error('A valid date is required.');
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function serviceKey(service: string) {
  const normalized = service.trim().toLowerCase().replace(/[^a-z0-9]+/g,' ');
  if (/agreed|aup|4400/.test(normalized)) return 'agreed-upon-procedures';
  if (/internal.*audit/.test(normalized)) return 'internal-audit';
  if (/audit/.test(normalized)) return 'external-financial-statement-audit';
  return normalized;
}
export function engagementPeriodEnd(engagement: EngagementRecord) {
  const iso = engagement.period.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return iso;
  const explicit = engagement.period.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
  if (!explicit) return undefined;
  const month = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(explicit[2].toLowerCase()) + 1;
  return `${explicit[3]}-${String(month).padStart(2,'0')}-${explicit[1].padStart(2,'0')}`;
}
export function proposalMatchesEngagement(proposal: ProposalRecord, engagement: EngagementRecord) {
  const end = engagementPeriodEnd(engagement);
  const snapshot = proposal.presentedSnapshot;
  return proposal.clientId === engagement.client && proposal.periodEnd?.slice(0,4) === String(engagement.year) && (!end || proposal.periodEnd === end) && proposal.items.some(item => serviceKey(item.serviceName) === serviceKey(engagement.service)) && (!snapshot || (snapshot.currency === proposal.currency && snapshot.totalAmount === proposal.totalAmount && JSON.stringify(snapshot.items) === JSON.stringify(proposal.items) && (!snapshot.periodEnd || snapshot.periodEnd === proposal.periodEnd) && (!snapshot.periodStart || snapshot.periodStart === proposal.periodStart)));
}
export function acceptedProposal(
  state: PrototypeState,
  engagement: EngagementRecord
): ProposalRecord | undefined {
  const pin = engagement.auditLifecycle?.commercialBasis;
  const proposal = state.proposals.find((p) => p.id === (pin?.proposalId || engagement.proposalId));
  return proposal &&
    proposalMatchesEngagement(proposal,engagement) &&
    proposal.state === 'Accepted' &&
    proposal.revision === proposal.presentedSnapshot?.revision &&
    proposal.revision === proposal.clientResponse?.revision &&
    proposal.clientResponse.responseType === 'Accepted' &&
    proposal.clientResponse.evidenceRef &&
    (!pin || (proposal.revision === pin.revision && (!pin.engagementService || pin.engagementService === engagement.service) && (!pin.engagementPeriod || pin.engagementPeriod === engagement.period) && (!pin.proposalPeriodEnd || pin.proposalPeriodEnd === proposal.periodEnd) && (!pin.proposalPeriodStart || pin.proposalPeriodStart === proposal.periodStart) && (!pin.currency || pin.currency === engagement.currency) && (pin.acceptedFee === undefined || pin.acceptedFee === proposal.presentedSnapshot.totalAmount)))
    ? proposal
    : undefined;
}
export function advanceReceipts(state: PrototypeState, engagement: EngagementRecord) {
  const pin = engagement.auditLifecycle?.commercialBasis;
  return (engagement.auditLifecycle?.advancePayments || [])
    .filter(
      (payment) =>
        !payment.reversed &&
        payment.proposalId === pin?.proposalId &&
        payment.revision === pin?.revision
    )
    .flatMap((payment) => {
      const receipt = state.receipts.find(
        (r) =>
          r.id === payment.receiptId &&
          r.clientId === engagement.client &&
          r.currency === engagement.currency
      );
      if (!receipt) return [];
      const allocations = receipt.allocations.filter(a => !a.reversed && state.invoices.some(i => i.id === a.invoiceId && (i.engagementId || i.eng) === engagement.id && i.isAdvanceInvoice));
      const amount = money(allocations.reduce((sum,a) => sum + a.amount,0));
      return amount > 0 ? [{ ...receipt, allocations, amount }] : [];
    });
}
export function advanceBasis(state: PrototypeState, engagement: EngagementRecord): string {
  return JSON.stringify({
    pin: engagement.auditLifecycle?.commercialBasis,
    receipts: advanceReceipts(state, engagement).map((r) => ({
      id: r.id,
      amount: r.amount,
      date: r.date,
      reference: r.externalRef,
      method: r.method
    }))
  });
}
export function billingSummary(state: PrototypeState, engagement: EngagementRecord) {
  const proposal = acceptedProposal(state, engagement);
  const fee = proposal?.presentedSnapshot?.totalAmount ?? null;
  const advance = money(advanceReceipts(state, engagement).reduce((sum, r) => sum + r.amount, 0));
  const expected = fee === null ? null : money(fee / 2);
  const receipt = [...(engagement.auditLifecycle?.receiptDocuments || [])]
    .reverse()
    .find((r) => r.basis === advanceBasis(state, engagement));
  return {
    fee,
    advance,
    expectedAdvance: expected,
    balance: fee === null ? null : money(fee - advance),
    receipt,
    complete: fee !== null && expected !== null && advance === expected && Boolean(receipt)
  };
}
export function professionalCase(state: PrototypeState, engagement: EngagementRecord) {
  return [...(state.acceptanceCases || [])]
    .reverse()
    .find(
      (c) =>
        c.engagementId === engagement.id &&
        c.clientId === engagement.client &&
        c.year === engagement.year &&
        c.service === engagement.service
    );
}
export function professionalBlockers(
  state: PrototypeState,
  engagement: EngagementRecord
): string[] {
  const record = professionalCase(state, engagement);
  if (!record) return ['Complete an engagement-specific acceptance / continuance recommendation.'];
  const blockers: string[] = [];
  if (record.decisionStatus !== 'Accepted')
    blockers.push(`Partner acceptance is ${record.decisionStatus.toLowerCase()}.`);
  if (
    !record.independenceConfirmed ||
    !record.amlKycCompleted ||
    !record.conflictsCleared ||
    !record.prohibitionsChecked ||
    !record.competenceConfirmed ||
    record.riskRating === 'Prohibited' ||
    record.conditions.length
  )
    blockers.push(
      'Resolve independence, KYC/AML, competence and prohibited or conditional matters.'
    );
  if (!['Track B (Continuance)', 'Continuance'].includes(record.assessmentType || '') && (record.managementIntegrityConfirmed !== true || record.financialViabilityConfirmed !== true || !record.screeningEvidence?.managementIntegrity?.trim() || !record.screeningEvidence?.financialViability?.trim())) blockers.push('Track A requires management integrity and financial viability confirmations with evidence.');
  if (
    ['amlKyc', 'independence', 'conflicts', 'prohibitions', 'competence'].some(
      (k) =>
        !record.screeningEvidence?.[k as keyof NonNullable<typeof record.screeningEvidence>]?.trim()
    )
  )
    blockers.push('All five professional checks require evidence references.');
  const actor = state.users.find((u) => u.id === record.decisionByUserId);
  if (!actor || !['partner', 'superuser'].includes(actor.role) || !record.decisionNotes?.trim())
    blockers.push('Record a Partner decision with actor, time and rationale.');
  return blockers;
}
export function activationBlockers(state: PrototypeState, engagement: EngagementRecord): string[] {
  const blockers = professionalBlockers(state, engagement);
  if (!acceptedProposal(state, engagement) || !engagement.auditLifecycle?.commercialBasis)
    blockers.unshift('Pin the accepted Proposal / EL revision and fee.');
  const billing = billingSummary(state, engagement);
  if (!billing.complete)
    blockers.push(
      'Record exactly the required 50% advance and generate its current official receipt.'
    );
  const client = state.clients.find((c) => c.id === engagement.client);
  if (!client || ['Suspended', 'Archived'].includes(client.status))
    blockers.push('The client is suspended or archived.');
  if (engagement.lifecycleStatus && engagement.lifecycleStatus !== 'Active')
    blockers.push(`The engagement is ${engagement.lifecycleStatus.toLowerCase()}.`);
  return blockers;
}
export function currentPlan(state: PrototypeState, engagement: EngagementRecord) {
  return (state.auditPlans || [])
    .filter((p) => p.engagementId === engagement.id)
    .sort((a, b) => a.version - b.version)
    .at(-1);
}
export function fieldworkBlockers(state: PrototypeState, engagement: EngagementRecord): string[] {
  const blockers = activationBlockers(state, engagement);
  const plan = currentPlan(state, engagement);
  if (
    !plan ||
    plan.status !== 'Approved' ||
    plan.sourceVersion !== engagement.sourceVersion ||
    !engagement.planning
  )
    blockers.push('Approve or reconfirm PM / TE / SAD against the current TB revision.');
  const staffing = engagement.auditLifecycle?.staffing.at(-1);
  if (
    !staffing ||
    ['Partner', 'Manager', 'Senior/Reviewer', 'Preparer/Staff'].some(
      (role) => !staffing.allocations.some((a) => a.role === role)
    )
  )
    blockers.push(
      'Assign Partner, Manager, Senior/Reviewer and Preparer/Staff with hours and explicit rates (unknown is allowed).'
    );
  if (
    !engagement.sourceAccepted ||
    !engagement.mappingApproved ||
    !engagement.rows.length ||
    engagement.rows.some((r) => !r.mappedStatementLine) ||
    Math.abs(engagement.rows.reduce((n, r) => n + r.balance, 0)) > 0.005
  )
    blockers.push('Upload a balanced TB and confirm every account mapping.');
  if (!engagement.auditLifecycle?.workspace?.accessVerifiedAt)
    blockers.push('Prepare and verify the simulated engagement workspace for evidence handoff.');
  return blockers;
}
export function fsliRiskLevel(state: PrototypeState, engagement: EngagementRecord, fsli: string): 'GREEN' | 'AMBER' | 'RED' {
  const rows = engagement.rows.filter(row => row.mappedStatementLine === fsli);
  const balance = Math.abs(rows.reduce((sum, row) => sum + row.balance, 0));
  const plan = currentPlan(state, engagement);
  const estimate = /estimate|provision|fair value|impairment|ecl|expected credit loss|allowance|obsolesc|warranty|goodwill|contingenc/i;
  const critical = estimate.test(fsli) || rows.some(row => estimate.test(row.name));
  const significant = state.auditRisks.some(risk => risk.engagementId === engagement.id && risk.rating === 'Significant' && (risk.area?.toLowerCase() === fsli.toLowerCase() || rows.some(row => risk.area?.toLowerCase().includes(row.name.toLowerCase()))));
  if (critical || significant || (plan && balance > plan.overallMateriality)) return 'RED';
  if (plan && balance >= plan.performanceMateriality) return 'AMBER';
  return 'GREEN';
}
export function scopedPrograms(state: PrototypeState, engagement: EngagementRecord) {
  return state.auditPrograms.filter((p) => p.engagementId === engagement.id);
}
/** Canonical material projection: migration-added empty histories must not stale a review. */
export function analyticalReviewIsCurrent(state: PrototypeState, engagement: EngagementRecord, record: import('../types/targetLifecycle').AnalyticalReviewRecord) {
  const mapping = state.accountMappingRevisions?.filter(m => m.engagementId === engagement.id).at(-1);
  const prior = state.engagements.find(item => item.id === record.comparativeEngagementId);
  const priorMapping = state.accountMappingRevisions?.filter(item => item.engagementId === prior?.id).at(-1);
  return record.tbSourceVersion === engagement.sourceVersion && record.mappingRevision === mapping?.revision && record.planVersion === currentPlan(state, engagement)?.version
    && (!record.comparativeEngagementId || Boolean(prior && prior.sourceVersion === record.comparativeSourceVersion && priorMapping?.revision === record.comparativeMappingRevision));
}
export function reviewBasis(state: PrototypeState, engagement: EngagementRecord): string {
  const plan = currentPlan(state, engagement),
    record = professionalCase(state, engagement),
    statement = state.statementSetRevisions?.filter((r) => r.engagementId === engagement.id).at(-1);
  return JSON.stringify({
    client: engagement.client,
    year: engagement.year,
    period: engagement.period,
    commercial: engagement.auditLifecycle?.commercialBasis,
    accepted: acceptedProposal(state, engagement)?.state,
    advance: advanceBasis(state, engagement),
    professional: record && {
      id: record.id,
      decision: record.decisionStatus,
      actor: record.decisionByUserId,
      at: record.decisionDate,
      notes: record.decisionNotes,
      evidence: record.screeningEvidence,
      checks: [
        record.amlKycCompleted,
        record.independenceConfirmed,
        record.conflictsCleared,
        record.prohibitionsChecked,
        record.competenceConfirmed
      ],
      risk: record.riskRating,
      conditions: record.conditions || []
    },
    analyticalReviews: engagement.auditLifecycle?.analyticalReviews || [],
    source: engagement.sourceVersion,
    rows: engagement.rows.map((r) => ({
      code: r.code,
      name: r.name,
      type: r.type,
      balance: r.balance,
      line: r.mappedStatementLine,
      dimensions: r.dimensions || {}
    })),
    planning: plan && {
      id: plan.id,
      version: plan.version,
      source: plan.sourceVersion,
      status: plan.status,
      benchmark: plan.benchmark,
      value: plan.benchmarkValue,
      rates: [plan.materialityRate, plan.performanceMaterialityRate, plan.clearlyTrivialRate],
      thresholds: [
        plan.overallMateriality,
        plan.performanceMateriality,
        plan.clearlyTrivialThreshold
      ],
      rationales: plan.rationales || [],
      team: plan.teamAllocations || [],
      preparedBy: plan.preparedByUserId,
      reviewedBy: plan.reviewedByUserId
    },
    statements: statement && {
      id: statement.id,
      revision: statement.revision,
      source: statement.sourceVersion,
      mapping: statement.mappingRevision,
      layout: statement.layoutVersion,
      totals: statement.totals,
      lines: statement.lines,
      status: statement.status
    },
    staffing: engagement.auditLifecycle?.staffing.at(-1),
    risks: state.auditRisks
      .filter((r) => r.engagementId === engagement.id)
      .map((r) => ({
        id: r.id,
        title: r.title,
        area: r.area,
        rating: r.rating,
        response: r.response,
        owner: r.owner,
        procedures: r.linkedProcedureIds || [],
        assertions: r.assertions || []
      })),
    programs: scopedPrograms(state, engagement).map((p) => ({
      id: p.id,
      area: p.area,
      objective: p.objective,
      fsli: p.financialStatementLines || [],
      workpaper: p.leadWorkpaperRef,
      procedures: p.procedures.map((s) => ({
        id: s.id,
        title: s.title,
        instructions: s.instructions,
        status: s.status,
        work: s.workPerformed,
        conclusion: s.conclusion,
        limitation: s.evidenceLimitation,
        scopeStale: !!s.scopeReassessmentRequired,
        evidenceStale: !!s.evidenceReassessmentRequired,
        preparedBy: s.preparedByUserId,
        reviewedBy: s.reviewedByUserId,
        workpaper: s.linkedWorkpaperId,
        risks: s.linkedRiskIds || []
      }))
    })),
    workpapers: engagement.workpapers.map((w) => ({
      id: w.id,
      applicable: w.applicable,
      version: w.version,
      status: w.status,
      scope: w.scope,
      work: w.workPerformed,
      conclusion: w.conclusion,
      clearance: w.clearance || null,
      evidence: w.evidenceRevisions || {},
      physical: w.physicalReference
    })),
    reviews: engagement.reviews.map((r) => ({
      id: r.id,
      wp: r.wp,
      subject: r.subjectType || 'workpaper',
      subjectVersion: r.subjectVersion,
      title: r.title,
      body: r.body,
      status: r.status,
      response: r.response,
      assignee: r.assignedUserId || r.assigned,
      version: r.version
    })),
    evidence: state.evidenceCatalogue
      .filter((e) =>
        state.documents.some((d) => d.id === e.documentId && d.engagementId === engagement.id)
      )
      .map((e) => ({
        id: e.id,
        document: e.documentId,
        version: e.version,
        adequacy: e.adequacyStatus,
        procedures: e.linkedProcedures || []
      })),
    documents: state.documents
      .filter((d) => d.engagementId === engagement.id)
      .map((d) => ({
        id: d.id,
        version: d.version,
        sha: d.sha,
        broken: !!d.brokenLink,
        successor: d.supersedesDocumentId
      })),
    pbc: engagement.pbc.map((p) => ({ id: p.id, status: p.status, files: p.sharedFiles || [] })),
    samples: state.samplePopulations
      .filter((p) => p.engagementId === engagement.id)
      .map((p) => ({
        id: p.id,
        source: p.sourceRevision,
        hash: p.sourceSha256,
        tb: p.tbSourceVersion,
        plan: p.planVersion,
        complete: !!p.sourceComplete,
        count: p.totalPopulationCount,
        value: p.totalPopulationValue,
        selection: p.selectionVersion,
        method: p.methodology,
        items: p.items.map((i) => ({
          id: i.id,
          ref: i.itemRef,
          amount: i.amount,
          date: i.date,
          counterparty: i.counterparty,
          selected: !!i.selected,
          tested: !!i.tested,
          result: i.result,
          audited: i.auditedAmount,
          notes: i.notes,
          limitation: i.limitation,
          evidence: i.evidenceDoc,
          physical: i.physicalReference
        }))
      })),
    confirmations: (state.confirmations || []).filter((c) => c.engagementId === engagement.id),
    adjustments: state.adjustmentJournals.filter(j => j.engagementId === engagement.id),
    findings: state.findings
      .filter((f) => f.engagementId === engagement.id)
      .map((f) => ({
        id: f.id,
        title: f.title,
        revision: f.revision || 1,
        amount: f.amount,
        category: f.category,
        gross: f.grossMisstatement,
        net: f.netMisstatement,
        journal: f.linkedJournalId,
        disposition: f.disposition,
        account: f.affectedAccount,
        line: f.financialStatementLine,
        condition: f.condition,
        recommendation: f.recommendation,
        severity: f.severity,
        description: f.description,
        currency: f.currency,
        response: f.managementResponse,
        procedure: f.linkedProcedureId,
        workpaper: f.linkedWorkpaperId,
        evidence: f.linkedEvidenceId
      }))
  });
}

export function currentReview(state: PrototypeState, engagement: EngagementRecord) {
  const basis = reviewBasis(state, engagement),
    lifecycle = engagement.auditLifecycle;
  const authorized = (id: string | undefined, role: string, name: string) => {
    const user = state.users.find((u) => u.id === id),
      assigned = state.users.find((u) => u.name === name && u.role === role);
    return Boolean(
      user?.status === 'Active' &&
      (user.role === 'superuser' ||
        (user.role === role &&
          assigned &&
          (user.personId || user.id) === (assigned.personId || assigned.id))) &&
      state.roleGrants.some(
        (g) =>
          g.userId === id &&
          (!g.effectiveFrom || g.effectiveFrom <= state.asOfDate) &&
          (!g.expiresAt || g.expiresAt >= state.asOfDate) &&
          (g.scopeKind === 'Global' ||
            (g.scopeKind === 'Engagement' && g.scopeId === engagement.id) ||
            (g.scopeKind === 'Client' && g.scopeId === engagement.client))
      )
    );
  };
  const managerRecord = lifecycle?.managerReviews.at(-1),
    srmRecord = lifecycle?.srms.at(-1),
    partnerRecord = lifecycle?.partnerClearances.at(-1);
  const manager =
    managerRecord?.basis === basis &&
    authorized(managerRecord?.actorUserId, 'manager', engagement.manager);
  const srm =
    manager &&
    srmRecord?.basis === basis &&
    authorized(srmRecord?.actorUserId, 'manager', engagement.manager);
  const partner =
    srm &&
    partnerRecord?.basis === basis &&
    authorized(partnerRecord?.actorUserId, 'partner', engagement.partner);
  return { basis, manager, srm, partner };
}
export function criticalConfirmationBlockers(
  state: PrototypeState,
  engagement: EngagementRecord
): string[] {
  return (state.confirmations || [])
    .filter((c) => c.engagementId === engagement.id && c.critical && c.status !== 'Cleared')
    .map(
      (c) =>
        `${c.type} confirmation for ${c.counterparty} is ${c.status.toLowerCase()}${c.status === 'Cancelled' ? '; cancellation does not dispose of a critical matter' : ''}.`
    );
}
export function managerReviewBlockers(
  state: PrototypeState,
  engagement: EngagementRecord
): string[] {
  const blockers = fieldworkBlockers(state, engagement);
  const journals = state.adjustmentJournals.filter(j => j.engagementId === engagement.id);
  if (journals.some(j => ['Draft','Technical review'].includes(j.status))) blockers.push('Complete independent technical review and management decisions for proposed AJEs.');
  const supportIssues = adjustmentSupportIssues(state,engagement.id);
  if (journals.some(j => ['Management accepted','Reporting included'].includes(j.status) && (supportIssues[j.id] || j.reflectionSourceVersion !== engagement.sourceVersion)) || applyReportingAdjustments(engagement.rows,journals,engagement.sourceVersion,supportIssues).unapplied.length) blockers.push('Reconfirm accepted AJE reflection and account support against the current TB.');
  if (
    !(state.statementSetRevisions || []).some(
      (r) =>
        r.engagementId === engagement.id &&
        r.sourceVersion === engagement.sourceVersion &&
        r.status !== 'Stale'
    )
  )
    blockers.push('Generate the current mapped P&L / BS snapshot.');
  if ([...new Map((engagement.auditLifecycle?.analyticalReviews || []).map(r => [r.fsli, r])).values()].some(r => !analyticalReviewIsCurrent(state, engagement, r))) blockers.push('Analytical Review sign-off is stale after TB, mapping or plan changes; re-sign on the current basis.');
  if (!engagement.auditLifecycle?.analyticalReviews?.some(record => analyticalReviewIsCurrent(state, engagement, record) && record.isa570Checklist.conclusion.trim() && ['operatingCashFlows', 'debtCovenantsCompliant', 'workingCapitalAdequate', 'noMaterialDisruptions'].every(key => typeof record.isa570Checklist[key as keyof typeof record.isa570Checklist] === 'boolean'))) blockers.push('Record deliberate ISA 570 answers and a written going concern conclusion before managerial clearance.');
  const programs = scopedPrograms(state, engagement);
  if (
    !['Analytical Review', 'Going Concern'].every((area) =>
      programs.some((p) => p.area === area)
    ) ||
    !programs.length ||
    programs.some((p) =>
      p.procedures.some(
        (s) =>
          s.status !== 'Cleared' || s.scopeReassessmentRequired || s.evidenceReassessmentRequired
      )
    )
  )
    blockers.push(
      'Complete and review every current fieldwork procedure, including Analytical Review and Going Concern.'
    );
  const samples = state.samplePopulations.filter((s) => s.engagementId === engagement.id);
  if (
    !samples.length ||
    samples.some(
      (s) =>
        s.tbSourceVersion !== engagement.sourceVersion ||
        s.planVersion !== currentPlan(state, engagement)?.version ||
        !s.items.some((i) => i.selected) ||
        s.items.some((i) => i.selected && !sampleEvidenceReady(state, engagement, i))
    )
  )
    blockers.push('Test current selected samples and link applicable digital or physical evidence.');
  if (
    !engagement.workpapers.some((w) => w.applicable) ||
    engagement.workpapers.some(
      (w) =>
        w.applicable &&
        (w.status !== 'Cleared' ||
          w.clearance?.version !== w.version ||
          w.clearance?.sourceVersion !== engagement.sourceVersion)
    )
  )
    blockers.push(
      'Preparer must submit, and the assigned reviewer must clear, each current workpaper revision.'
    );
  if (engagement.reviews.some((r) => r.status !== 'Cleared'))
    blockers.push('Resolve and clear every open or reopened review point.');
  return blockers;
}
export function opinionValidation(value: AuditOpinion, focusArea: string, basis: string): string[] {
  if (!['Clean', 'Qualified', 'Disclaimer', 'Adverse'].includes(value))
    return ['Select one of the four supported opinions.'];
  if (value === 'Clean') return [];
  return [
    ...(['Qualified', 'Disclaimer', 'Adverse'].includes(value) && !focusArea.trim()
      ? [`${value === 'Qualified' ? 'Qualified' : 'Modified'} opinion requires an impacted focus area / FSLI.`]
      : []),
    ...(basis.trim().length < 20
      ? ['Modified opinion requires a meaningful basis of at least 20 characters.']
      : [])
  ];
}
export function targetReleaseBlockers(
  state: PrototypeState,
  engagement: EngagementRecord
): string[] {
  const blockers = [
    ...managerReviewBlockers(state, engagement),
    ...criticalConfirmationBlockers(state, engagement)
  ];
  const review = currentReview(state, engagement);
  if (!review.manager)
    blockers.push('Manager clearance is missing or stale for the current review basis.');
  if (!review.srm) blockers.push('Generate the SRM from the current manager-reviewed basis.');
  if (!review.partner) blockers.push('Partner must clear the current SRM and audit basis.');
  if (state.findings.some((f) => f.engagementId === engagement.id && isReleaseBlockingFinding(f)))
    blockers.push('Dispose of unresolved material findings and SAD items.');
  return [...new Set(blockers)];
}
export function reportBasis(state: PrototypeState, engagement: EngagementRecord): string {
  return JSON.stringify({
    review: reviewBasis(state, engagement),
    opinion: engagement.auditLifecycle?.opinions.at(-1),
    clearance: engagement.auditLifecycle?.partnerClearances.at(-1)
  });
}
export function currentDeliverables(state: PrototypeState, engagement: EngagementRecord) {
  const set = engagement.auditLifecycle?.deliverables.at(-1);
  if (
    isFrozen(engagement) &&
    engagement.archive?.releaseId === engagement.auditLifecycle?.archiveControl.reportSetId
  )
    return engagement.auditLifecycle?.deliverables.find(
      (item) => item.id === engagement.archive!.releaseId
    );
  return set?.basis === reportBasis(state, engagement) &&
    targetReleaseBlockers(state, engagement).length === 0
    ? set
    : undefined;
}
export function isFrozen(engagement: EngagementRecord, asOfDate = new Date().toISOString().slice(0, 10)): boolean {
  const control = engagement.auditLifecycle?.archiveControl;
  const today = new Date().toISOString().slice(0, 10);
  if (today > asOfDate) asOfDate = today;
  return control?.freezeStatus === 'Frozen' || Boolean(control?.freezeDueDate && control.freezeDueDate <= (control.asOfDate && control.asOfDate > asOfDate ? control.asOfDate : asOfDate));
}
/** Monotonic system closure; runs on load/read and before command notification. */
export function closeExpiredArchives(state: PrototypeState): boolean {
  let changed = false;
  const today = new Date().toISOString().slice(0, 10);
  const asOf = state.asOfDate > today ? state.asOfDate : today;
  for (const engagement of state.engagements) {
    const control = engagement.auditLifecycle?.archiveControl;
    if (!control || control.freezeStatus === 'Frozen' || !control.freezeDueDate || control.freezeDueDate > asOf) continue;
    control.freezeStatus = 'Frozen';
    control.frozenAt = `${control.freezeDueDate}T00:00:00.000Z`;
    control.frozenByUserId = 'system';
    control.asOfDate = asOf;
    const entry = { at: control.frozenAt, actorUserId: 'system', action: 'Automatic 60-day archive lock', reason: `Signature date ${control.finalReportDate}; expiry ${control.freezeDueDate}.` };
    control.history.push(entry);
    engagement.auditLifecycle!.history.push(entry);
    const set = engagement.auditLifecycle!.deliverables.find(record => record.id === control.reportSetId);
    if (set) {
      const manifest = set.artifacts.map(artifact => `${artifact.deliverable}: ${artifact.id} / SHA-256 ${artifact.sha256}`);
      engagement.archive = { archivedAt: control.frozenAt, archivedBy: 'Automatic compliance clock', releaseId: set.id, manifest, packagingStatus: 'Pending', artifacts: [] };
      (state.archives ||= []).push({ id: `ARCH-${set.id}`, engagementId: engagement.id, releaseId: set.id, clientName: state.clients.find(client => client.id === engagement.client)?.name || engagement.client, service: engagement.service, year: engagement.year, archivedAt: control.frozenAt, archivedBy: 'Automatic compliance clock', onHold: false, manifestCount: manifest.length, manifest, artifacts: [] });
    } else engagement.archive = { archivedAt: control.frozenAt, archivedBy: 'Automatic compliance clock', releaseId: control.reportSetId || `EXPIRY-${engagement.id}`, manifest: ['Report set unavailable; closure remains read-only.'], packagingStatus: 'Pending', artifacts: [] };
    changed = true;
  }
  return changed;
}
export function firmTrialBalance(state: PrototypeState, month?: string, currency = state.firmSettings.currency) {
  const accounts = new Map<
    string,
    { account: string; debit: number; credit: number; balance: number }
  >();
  const projection = (state.firmLedger || []).filter(e => e.currency === currency && (!month || e.date.startsWith(month))).map(e => e.lines);
  const invoices = state.invoices.filter(i => ['Issued','Paid'].includes(i.status) && i.currency === currency);
  for (const invoice of invoices.filter(i => !month || i.issueDate?.startsWith(month))) projection.push([{ account: 'Accounts receivable', debit: invoice.amount, credit: 0 }, { account: 'Audit fee revenue', debit: 0, credit: invoice.amount }] as any);
  for (const receipt of state.receipts.filter(r => r.currency === currency)) for (const allocation of receipt.allocations.filter(a => invoices.some(i => i.id === a.invoiceId))) {
    if (!month || (allocation.date || receipt.date).startsWith(month)) projection.push([{ account: 'Cash', debit: allocation.amount, credit: 0 }, { account: 'Accounts receivable', debit: 0, credit: allocation.amount }] as any);
    if (allocation.reversed && (!month || (allocation.reversalDate || allocation.date || receipt.date).startsWith(month))) projection.push([{ account: 'Cash', debit: 0, credit: allocation.amount }, { account: 'Accounts receivable', debit: allocation.amount, credit: 0 }] as any);
  }
  for (const lines of projection)
    for (const line of lines) {
      const account = accounts.get(line.account) || {
        account: line.account,
        debit: 0,
        credit: 0,
        balance: 0
      };
      account.debit = money(account.debit + line.debit);
      account.credit = money(account.credit + line.credit);
      account.balance = money(account.debit - account.credit);
      accounts.set(line.account, account);
    }
  return [...accounts.values()];
}
export function allocatedSettlementAt(state: PrototypeState, invoiceId: string, asOf: string) {
  return money(state.receipts.reduce((sum,r) => sum + r.allocations.filter(a => a.invoiceId === invoiceId && (a.date || r.date) <= asOf && (!a.reversed || Boolean(a.reversalDate && a.reversalDate > asOf))).reduce((n,a) => n + a.amount,0),0));
}
export function practiceEconomics(state: PrototypeState, engagement: EngagementRecord) {
  const allocations = engagement.auditLifecycle?.staffing.at(-1)?.allocations || [];
  const times = state.times.filter(
    (t) => t.engagementId === engagement.id && !['Returned', 'Superseded'].includes(t.status)
  );
  const budgetHours = allocations.reduce((n, a) => n + a.plannedHours, 0),
    actualHours = times.reduce((n, t) => n + t.durationMinutes / 60, 0);
  const budgetValue =
    allocations.length && allocations.every((a) => a.chargeRate !== null)
      ? money(allocations.reduce((n, a) => n + a.plannedHours * a.chargeRate!, 0))
      : null;
  const actualCost = times.every((t) => t.costRatePerHour !== undefined)
    ? money(times.reduce((n, t) => n + (t.durationMinutes / 60) * t.costRatePerHour!, 0))
    : null;
  const rateFor = (t: typeof times[number]) => t.billingRatePerHour;
  const wip = (times.length > 0 || (allocations.length > 0 && allocations.every(a => a.chargeRate !== null))) && times.every(t => rateFor(t) != null && Number.isFinite(rateFor(t)))
    ? money(times.reduce((n,t) => n + t.durationMinutes / 60 * rateFor(t)!, 0)) : null;
  const people = [...new Map(allocations.map(a => [a.userId, a])).values()];
  const availableHours = people.length && people.every(a => a.capacityHours !== undefined)
    ? people.reduce((n,a) => n + a.capacityHours! - (a.leaveHours || 0),0) : null;
  const fee = billingSummary(state, engagement).fee;
  return {
    budgetHours,
    actualHours,
    phases: (['Planning', 'Fieldwork', 'Review', 'Reporting'] as const).map(phase => {
      const budget = allocations.filter(allocation => allocation.phase === phase).reduce((sum, allocation) => sum + allocation.plannedHours, 0);
      const actual = times.filter(entry => entry.auditPhase === phase || (!entry.auditPhase && (/planning/i.test(entry.activity) ? 'Planning' : /review/i.test(entry.activity) ? 'Review' : /report/i.test(entry.activity) ? 'Reporting' : 'Fieldwork') === phase)).reduce((sum, entry) => sum + entry.durationMinutes / 60, 0);
      return { phase, budget, actual, variance: actual - budget };
    }),
    budgetValue,
    actualCost,
    wip,
    profit: fee !== null && wip !== null ? money(fee - wip) : null,
    realization: fee !== null && wip && wip > 0 ? (fee / wip) * 100 : null,
    utilization: availableHours && availableHours > 0 ? actualHours / availableHours * 100 : null
  };
}
export interface TargetStageProgress extends TargetStageDefinition {
  status: 'Completed' | 'Current' | 'Blocked' | 'Needs Rework' | 'Not Started' | 'Frozen';
  blockers: string[];
  predecessor?: string;
  successor?: string;
}
const tbIngested = (engagement: EngagementRecord): boolean =>
  engagement.sourceAccepted && engagement.mappingApproved && engagement.rows.length > 0;
export function engagementProgress(
  state: PrototypeState,
  engagement: EngagementRecord
): TargetStageProgress[] {
  const review = currentReview(state, engagement),
    bill = billingSummary(state, engagement),
    plan = currentPlan(state, engagement),
    set = currentDeliverables(state, engagement);
  const proposal = acceptedProposal(state, engagement),
    acceptanceRecord = professionalCase(state, engagement),
    // Dual-Key Gate (Flow 1 / store generateEngagementLetter): Key 1 = current accepted
    // proposal/EL revision; Key 2 = independent Partner acceptance with zero professional
    // blockers. The stepper must mirror the store so it cannot show "complete" while EL
    // generation is still refused.
    dualKeyClear =
      !!proposal &&
      acceptanceRecord?.decisionStatus === 'Accepted' &&
      professionalBlockers(state, engagement).length === 0,
    samples = state.samplePopulations.filter((p) => p.engagementId === engagement.id);
  const done: Record<string, boolean> = {
    lead: state.leads.some((l) => l.convertedClientId === engagement.client && l.stage === 'Won'),
    proposal: Boolean(proposal && engagement.auditLifecycle?.commercialBasis),
    advance: bill.complete,
    acceptance: dualKeyClear,
    workspace: Boolean(engagement.auditLifecycle?.workspace?.accessVerifiedAt),
    pbc: engagement.pbc.some((p) => p.status === 'Accepted'),
    staffing: Boolean(engagement.auditLifecycle?.staffing.length),
    tb: engagement.sourceAccepted && engagement.mappingApproved && engagement.rows.length > 0,
    planning: Boolean(
      plan?.status === 'Approved' && plan.sourceVersion === engagement.sourceVersion
    ),
    financials:
      state.statementSetRevisions?.some(
        (r) =>
          r.engagementId === engagement.id &&
          r.sourceVersion === engagement.sourceVersion &&
          r.status !== 'Stale'
      ) || false,
    fieldwork:
      scopedPrograms(state, engagement).length > 0 &&
      scopedPrograms(state, engagement).every((p) =>
        p.procedures.every(
          (s) =>
            s.status === 'Cleared' &&
            !s.scopeReassessmentRequired &&
            !s.evidenceReassessmentRequired
        )
      ),
    sampling:
      samples.length > 0 &&
      samples.every(
        (p) =>
          p.tbSourceVersion === engagement.sourceVersion &&
          p.planVersion === plan?.version &&
          p.items.some((i) => i.selected) &&
          p.items.every((i) => !i.selected || sampleEvidenceReady(state, engagement, i))
      ),
    confirmations:
      (state.confirmations || []).some((c) => c.engagementId === engagement.id) &&
      criticalConfirmationBlockers(state, engagement).length === 0,
    review: review.manager,
    srm: review.srm && review.partner,
    opinion: !!set?.deliveredAt,
    balance:
      !!set && !!engagement.auditLifecycle?.balanceInvoices.some((i) => i.deliverableId === set.id),
    archive: isFrozen(engagement),
    analytics: !!state.firmLedger?.length
  };
  const blockers: Record<string, string[]> = {
    proposal: proposal ? [] : ['Prepare, present and manually record acceptance of a proposal.'],
    advance: [
      ...(proposal ? [] : ['Accept and pin the proposal fee first.']),
      ...professionalBlockers(state, engagement)
    ],
    acceptance: professionalBlockers(state, engagement),
    workspace: activationBlockers(state, engagement),
    pbc: [
      ...activationBlockers(state, engagement),
      ...(!done.workspace ? ['Verify the workspace.'] : [])
    ],
    staffing: activationBlockers(state, engagement),
    tb: activationBlockers(state, engagement),
    planning: [
      ...activationBlockers(state, engagement),
      ...(!tbIngested(engagement)
        ? ['Ingest and map the trial balance before calculating materiality.']
        : [])
    ],
    financials: [
      ...(done.tb ? [] : ['Upload and map the TB.']),
      ...(done.planning ? [] : ['Approve PM / TE / SAD against the current TB revision.'])
    ],
    fieldwork: fieldworkBlockers(state, engagement),
    sampling: fieldworkBlockers(state, engagement),
    confirmations: activationBlockers(state, engagement),
    review: managerReviewBlockers(state, engagement),
    srm: review.manager ? [] : ['Complete current Manager review.'],
    opinion: targetReleaseBlockers(state, engagement),
    balance: set?.deliveredAt ? [] : ['Deliver/sign off the current final audit documents.'],
    archive: done.balance ? [] : ['Generate the final balance invoice after delivery.']
  };
  let current = false;
  return TARGET_STAGES.map((stage, index) => {
    const stale =
      (stage.id === 'srm' && !!engagement.auditLifecycle?.srms.length && !review.srm) ||
      (stage.id === 'review' &&
        !!engagement.auditLifecycle?.managerReviews.length &&
        !review.manager) ||
      (stage.id === 'planning' && !!plan && plan.sourceVersion !== engagement.sourceVersion) ||
      (stage.id === 'opinion' && !!engagement.auditLifecycle?.deliverables.length && !set);
    const reasons = blockers[stage.id] || [];
    const status =
      isFrozen(engagement) && stage.id === 'archive'
        ? 'Frozen'
        : isFrozen(engagement) && stage.id !== 'analytics'
          ? 'Completed'
          : done[stage.id]
            ? 'Completed'
            : stale
              ? 'Needs Rework'
              : reasons.length
                ? 'Blocked'
                : !current
                  ? 'Current'
                  : 'Not Started';
    if (status === 'Current') current = true;
    return {
      ...stage,
      status,
      blockers: ['Completed', 'Frozen'].includes(status) ? [] : reasons,
      predecessor: TARGET_STAGES[index - 1]?.label,
      successor: TARGET_STAGES[index + 1]?.label
    };
  });
}

export interface SystemLifecycleStateDefinition {
  state: TargetLifecycleState;
  label: string;
  module: string;
  allowedActions: string;
  gateToAdvance: string;
  nextState: TargetLifecycleState | 'TERMINAL';
}

export const SYSTEM_LIFECYCLE_STATES: SystemLifecycleStateDefinition[] = [
  {
    state: 'LEAD_INGESTION',
    label: 'Lead Ingestion',
    module: 'Module 1: Commercial & CRM',
    allowedActions: 'Log inquiry, capture company and contact data',
    gateToAdvance: 'Minimum entity and primary contact data validated',
    nextState: 'PROPOSAL_GENERATION'
  },
  {
    state: 'PROPOSAL_GENERATION',
    label: 'Proposal Generation',
    module: 'Module 1: Commercial & CRM',
    allowedActions: 'Build Brief Quote or Comprehensive Proposal, dispatch to client',
    gateToAdvance: 'Proposal dispatched via Email / WhatsApp link',
    nextState: 'DUAL_KEY_PENDING'
  },
  {
    state: 'DUAL_KEY_PENDING',
    label: 'Dual-Key Clearance Gate',
    module: 'Module 1 & 2: Governance Gate',
    allowedActions: 'Complete Client Acceptance Checklist (AML/KYC), record client commercial approval',
    gateToAdvance: 'Dual-Key Clearance: Both Client Acceptance AND Partner AML/KYC Approval confirmed',
    nextState: 'ADVANCE_BILLING'
  },
  {
    state: 'ADVANCE_BILLING',
    label: 'Advance Billing & Receipt',
    module: 'Module 1: Commercial & CRM',
    allowedActions: 'Generate Engagement Letter (ISA 210) & 50% Advance Invoice',
    gateToAdvance: '50% advance payment confirmed and recorded with receipt voucher',
    nextState: 'PORTAL_ACTIVE_PLANNING'
  },
  {
    state: 'PORTAL_ACTIVE_PLANNING',
    label: 'Portal Active & Planning',
    module: 'Module 2: Governance & Planning',
    allowedActions: 'Provision Client Portal, schedule team, ingest Trial Balance, calculate materiality',
    gateToAdvance: 'Planning signed off by Partner, TB mapped to FSLIs',
    nextState: 'FIELDWORK_EXECUTION'
  },
  {
    state: 'FIELDWORK_EXECUTION',
    label: 'Fieldwork Execution',
    module: 'Module 3: Technical Execution',
    allowedActions: 'Execute workprograms, attach digital/physical evidence, log confirmation requests',
    gateToAdvance: 'All assigned FSLI procedures submitted by Preparers',
    nextState: 'MANAGERIAL_REVIEW'
  },
  {
    state: 'MANAGERIAL_REVIEW',
    label: 'Managerial Review & SRM',
    module: 'Module 3: Technical Execution',
    allowedActions: 'Review workpapers, issue review notes/rework, compile SRM',
    gateToAdvance: 'Zero open review notes, SRM compiled, critical confirmations returned',
    nextState: 'PARTNER_APPROVAL'
  },
  {
    state: 'PARTNER_APPROVAL',
    label: 'Partner Approval & Opinion',
    module: 'Module 4: Reporting & Deliverables',
    allowedActions: 'Partner inspects SRM, reviews Red-risk areas, selects Audit Opinion (ISA 700/705)',
    gateToAdvance: 'Partner applies digital signature and firm seal',
    nextState: 'DELIVERABLE_RELEASE'
  },
  {
    state: 'DELIVERABLE_RELEASE',
    label: 'Deliverable Release',
    module: 'Module 4: Reporting & Deliverables',
    allowedActions: 'Generate 5-part deliverables package, issue 50% balance invoice, freeze client portal uploads',
    gateToAdvance: 'Final package generated and delivered to client',
    nextState: 'COMPLIANCE_COUNTDOWN'
  },
  {
    state: 'COMPLIANCE_COUNTDOWN',
    label: 'Compliance Countdown (ISA 230)',
    module: 'Module 4: Reporting & Deliverables',
    allowedActions: 'Review final archive; Partner may trigger early lock',
    gateToAdvance: '60 calendar days elapsed since signature date OR manual lock triggered',
    nextState: 'ARCHIVED_READ_ONLY'
  },
  {
    state: 'ARCHIVED_READ_ONLY',
    label: 'Archived (Read-Only)',
    module: 'Module 4: Reporting & Deliverables',
    allowedActions: 'Read-only viewing and regulator inspection export',
    gateToAdvance: 'File is permanently locked; modifications strictly disallowed',
    nextState: 'TERMINAL'
  }
];

export function computeSystemState(
  state: PrototypeState,
  engagement: EngagementRecord
): SystemLifecycleStateDefinition {
  if (isFrozen(engagement)) {
    return SYSTEM_LIFECYCLE_STATES[10]; // ARCHIVED_READ_ONLY
  }
  const set = currentDeliverables(state, engagement);
  const control = engagement.auditLifecycle?.archiveControl;
  if (set?.deliveredAt && hasExactFivePartBundle(set)) {
    return SYSTEM_LIFECYCLE_STATES[9]; // COMPLIANCE_COUNTDOWN
  }
  if (set && hasExactFivePartBundle(set)) {
    return SYSTEM_LIFECYCLE_STATES[8]; // DELIVERABLE_RELEASE
  }
  const review = currentReview(state, engagement);
  if (review.partner) {
    return SYSTEM_LIFECYCLE_STATES[8]; // Await compilation/release
  }
  if (review.srm && !criticalConfirmationBlockers(state, engagement).length) {
    return SYSTEM_LIFECYCLE_STATES[7]; // Await assigned Partner
  }
  if (review.manager || hasAllApplicableProceduresSubmitted(state, engagement)) {
    return SYSTEM_LIFECYCLE_STATES[6]; // MANAGERIAL_REVIEW
  }
  const plan = currentPlan(state, engagement);
  const tbReady = !fieldworkBlockers(state, engagement).length;
  if (plan?.status === 'Approved' && tbReady) {
    return SYSTEM_LIFECYCLE_STATES[5]; // FIELDWORK_EXECUTION
  }
  const bill = billingSummary(state, engagement);
  if (bill.complete) {
    return SYSTEM_LIFECYCLE_STATES[4]; // PORTAL_ACTIVE_PLANNING
  }
  const acceptanceRecord = professionalCase(state, engagement);
  // Dual-Key Gate (Flow 1 / state machine DUAL_KEY_PENDING): Key 1 = current accepted
  // proposal/EL revision with evidence; Key 2 = independent Partner acceptance with zero
  // professional blockers. Both must hold before EL generation and 50% advance billing.
  const dualKeyPassed =
    !!acceptedProposal(state, engagement) &&
    acceptanceRecord?.decisionStatus === 'Accepted' &&
    professionalBlockers(state, engagement).length === 0;
  if (dualKeyPassed) {
    return SYSTEM_LIFECYCLE_STATES[3]; // ADVANCE_BILLING
  }
  const proposal = state.proposals.find(p => p.id === engagement.proposalId && p.clientId === engagement.client);
  if (proposal?.presentedSnapshot?.revision === proposal?.revision && proposal?.dispatchHistory?.some(d => d.revision === proposal.revision && d.recipientName.trim() && d.simulatedOutcome === 'Delivered (simulated)')) {
    return SYSTEM_LIFECYCLE_STATES[2]; // DUAL_KEY_PENDING
  }
  if (proposal || hasValidLeadProfile(state, engagement.client)) {
    return SYSTEM_LIFECYCLE_STATES[1]; // PROPOSAL_GENERATION
  }
  return SYSTEM_LIFECYCLE_STATES[0]; // LEAD_INGESTION
}

