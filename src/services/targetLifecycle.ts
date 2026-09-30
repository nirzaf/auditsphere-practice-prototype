import type { EngagementRecord, PrototypeState, ProposalRecord } from '../types';
import type {
  AuditOpinion,
  TargetEngagementLifecycle,
  TargetStageDefinition,
  TargetLifecycleState
} from '../types/targetLifecycle';
import { isReleaseBlockingFinding } from './findings';

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
    roles: ['preparer', 'manager', 'reviewer']
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
export function acceptedProposal(
  state: PrototypeState,
  engagement: EngagementRecord
): ProposalRecord | undefined {
  const pin = engagement.auditLifecycle?.commercialBasis;
  const proposal = state.proposals.find((p) => p.id === (pin?.proposalId || engagement.proposalId));
  return proposal &&
    proposal.clientId === engagement.client &&
    proposal.state === 'Accepted' &&
    proposal.revision === proposal.presentedSnapshot?.revision &&
    proposal.revision === proposal.clientResponse?.revision &&
    proposal.clientResponse.responseType === 'Accepted' &&
    proposal.clientResponse.evidenceRef &&
    (!pin || proposal.revision === pin.revision)
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
      return receipt ? [receipt] : [];
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
export function scopedPrograms(state: PrototypeState, engagement: EngagementRecord) {
  return state.auditPrograms.filter((p) => p.engagementId === engagement.id);
}
/** Canonical material projection: migration-added empty histories must not stale a review. */
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
    findings: state.findings
      .filter((f) => f.engagementId === engagement.id)
      .map((f) => ({
        id: f.id,
        title: f.title,
        revision: f.revision || 1,
        amount: f.amount,
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
  if (
    !(state.statementSetRevisions || []).some(
      (r) =>
        r.engagementId === engagement.id &&
        r.sourceVersion === engagement.sourceVersion &&
        r.status !== 'Stale'
    )
  )
    blockers.push('Generate the current mapped P&L / BS snapshot.');
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
        s.items.some((i) => i.selected && (!i.tested || !i.physicalReference))
    )
  )
    blockers.push('Test current selected samples and link their structured physical references.');
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
export function isFrozen(engagement: EngagementRecord): boolean {
  return engagement.auditLifecycle?.archiveControl.freezeStatus === 'Frozen';
}
export function firmTrialBalance(state: PrototypeState) {
  const accounts = new Map<
    string,
    { account: string; debit: number; credit: number; balance: number }
  >();
  for (const entry of state.firmLedger || [])
    for (const line of entry.lines) {
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
export function practiceEconomics(state: PrototypeState, engagement: EngagementRecord) {
  const allocations = engagement.auditLifecycle?.staffing.at(-1)?.allocations || [];
  const times = state.times.filter(
    (t) => t.engagementId === engagement.id && t.status === 'Approved'
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
  const wip = times.every((t) => t.billingRatePerHour !== undefined)
    ? money(times.reduce((n, t) => n + (t.durationMinutes / 60) * t.billingRatePerHour!, 0))
    : null;
  const fee = billingSummary(state, engagement).fee;
  return {
    budgetHours,
    actualHours,
    budgetValue,
    actualCost,
    wip,
    profit: fee !== null && actualCost !== null ? money(fee - actualCost) : null,
    realization: fee !== null && wip && wip > 0 ? (fee / wip) * 100 : null,
    utilization: budgetHours > 0 ? (actualHours / budgetHours) * 100 : null
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
          p.items.every((i) => !i.selected || (i.tested && !!i.physicalReference))
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
  if (control?.freezeStatus === 'Counting Down' || (set && set.deliveredAt)) {
    return SYSTEM_LIFECYCLE_STATES[9]; // COMPLIANCE_COUNTDOWN
  }
  if (set && set.artifacts.length >= 3) {
    return SYSTEM_LIFECYCLE_STATES[8]; // DELIVERABLE_RELEASE
  }
  const review = currentReview(state, engagement);
  if (review.partner) {
    return SYSTEM_LIFECYCLE_STATES[7]; // PARTNER_APPROVAL
  }
  if (review.manager || engagement.auditLifecycle?.srms.length) {
    return SYSTEM_LIFECYCLE_STATES[6]; // MANAGERIAL_REVIEW
  }
  const plan = currentPlan(state, engagement);
  const tbReady = engagement.sourceAccepted && engagement.mappingApproved && engagement.rows.length > 0;
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
  if (state.proposals.some(p => p.clientId === engagement.client)) {
    return SYSTEM_LIFECYCLE_STATES[2]; // DUAL_KEY_PENDING
  }
  if (state.leads.some(l => l.convertedClientId === engagement.client)) {
    return SYSTEM_LIFECYCLE_STATES[1]; // PROPOSAL_GENERATION
  }
  return SYSTEM_LIFECYCLE_STATES[0]; // LEAD_INGESTION
}

