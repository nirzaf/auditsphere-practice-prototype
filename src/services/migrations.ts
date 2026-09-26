// AuditSphere schema migrations + fixture integrity — VP-004
// Versioned browser-local metadata persistence. Preserve previous payload before
// migration, migrate deterministically, validate references, never silently reset.

import type { PrototypeState } from '../types';

export const CURRENT_SCHEMA = 28;

export interface MigrationResult {
  state: PrototypeState;
  migratedFrom: number;
  warnings: string[];
}

export interface IntegrityIssue {
  code: string;
  message: string;
}

/** Validate foreign references, dates, money control totals, no binary payloads. */
export function validateFixtures(state: PrototypeState): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const list = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
  const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const dateIssue = (record: string, field: string, value: unknown) => {
    if (!validDate(value)) issues.push({ code: 'FIXTURE_DATE', message: `${record} has an invalid ${field} date.` });
  };
  const clients = list<PrototypeState['clients'][number]>(state?.clients);
  const engagements = list<PrototypeState['engagements'][number]>(state?.engagements);
  const jobs = list<PrototypeState['jobs'][number]>(state?.jobs);
  const tasks = list<PrototypeState['jobTasks'][number]>(state?.jobTasks);
  const users = list<PrototypeState['users'][number]>(state?.users);
  const clientIds = new Set(clients.map(c => c.id));
  const engIds = new Set(engagements.map(e => e.id));
  const jobIds = new Set(jobs.map(j => j.id));
  const taskIds = new Set(tasks.map(t => t.id));
  const userIds = new Set(users.map(u => u.id));

  dateIssue('Saved state', 'as-of', state?.asOfDate);

  for (const e of engagements) {
    dateIssue(`Engagement ${e.id}`, 'due', e.due);
    if (!clientIds.has(e.client)) {
      issues.push({ code: 'FK_ENGAGEMENT_CLIENT', message: `Engagement ${e.id} references unknown client ${e.client}` });
    }
    const cashFlowRevisions = list<NonNullable<PrototypeState['engagements'][number]['cashFlowScheduleHistory']>[number]>(e.cashFlowScheduleHistory);
    const cashFlowIds = new Set<string>();
    const cashFlowNumbers = new Set<number>();
    for (const revision of cashFlowRevisions) {
      if (!revision || revision.engagementId !== e.id || !revision.id || cashFlowIds.has(revision.id) || !Number.isInteger(revision.revision) || revision.revision < 1 || cashFlowNumbers.has(revision.revision) || !['Draft', 'Reviewed', 'Stale'].includes(revision.status) || !Number.isFinite(revision.openingCash) || revision.openingCash < 0 || !Number.isFinite(revision.closingCash) || revision.closingCash < 0 || revision.openingEquity !== undefined && (!Number.isFinite(revision.openingEquity) || revision.openingEquity < 0) || !Number.isFinite(revision.sourceVersion) || !Number.isFinite(revision.mappingRevision) || !userIds.has(revision.preparedByUserId) || revision.reviewedByUserId && !userIds.has(revision.reviewedByUserId) || !Array.isArray(revision.movements) || revision.movements.some(item => !item || !item.id || !item.description || !Number.isFinite(item.amount) || !item.evidenceRef || !['Operating', 'Investing', 'Financing', 'Equity contribution', 'Equity distribution', 'Non-cash'].includes(item.category) || !state.documents?.some(document => document.id === item.evidenceRef))) {
        issues.push({ code: 'CASH_FLOW_REVISION', message: `Cash-flow schedule ${revision?.id || '(missing id)'} on ${e.id} contains invalid history, movement or evidence references.` });
        continue;
      }
      cashFlowIds.add(revision.id);
      cashFlowNumbers.add(revision.revision);
    }
    const glRevisions = list<NonNullable<PrototypeState['engagements'][number]['glSourceHistory']>[number]>(e.glSourceHistory);
    const glRevisionNumbers = new Set<number>();
    for (const [index, revision] of glRevisions.entries()) {
      const lines = list<NonNullable<typeof revision>['transactions'][number]>(revision?.transactions);
      const client = clients.find(item => item.id === e.client);
      const book = (Array.isArray(client?.accountingProfile?.periodBooks) ? client.accountingProfile.periodBooks : []).find(item => item.id === revision?.periodBookId && item.ownerEngagementId === e.id);
      const keys = new Set<string>();
      const journals = new Map<string, { debit: number; credit: number; date: string; currency: string }>();
      for (const line of lines) {
        if (!line || line.engagementId !== e.id || typeof line.journalId !== 'string' || !line.journalId || typeof line.lineId !== 'string' || !line.lineId || !validDate(line.date) || book && (line.date < book.startDate || line.date > book.endDate) || client?.accountingProfile?.baseCurrency && line.currency !== client.accountingProfile.baseCurrency || typeof line.accountCode !== 'string' || !line.accountCode || typeof line.accountName !== 'string' || !line.accountName || typeof line.description !== 'string' || !line.description || !Number.isFinite(line.debit) || !Number.isFinite(line.credit) || Math.abs(line.debit * 100 - Math.round(line.debit * 100)) > 1e-7 || Math.abs(line.credit * 100 - Math.round(line.credit * 100)) > 1e-7 || line.debit < 0 || line.credit < 0 || line.debit > 0 && line.credit > 0 || line.debit === 0 && line.credit === 0 || keys.has(`${line.journalId}\u0000${line.lineId}`)) {
          issues.push({ code: 'GL_SOURCE_LINE', message: `GL revision ${revision?.revision ?? '?'} on ${e.id} contains an invalid or duplicate transaction line.` });
          continue;
        }
        keys.add(`${line.journalId}\u0000${line.lineId}`);
        const totals = journals.get(line.journalId) || { debit: 0, credit: 0, date: line.date, currency: line.currency };
        if (totals.date !== line.date || totals.currency !== line.currency) issues.push({ code: 'GL_SOURCE_JOURNAL', message: `GL journal ${line.journalId} on ${e.id} mixes dates or currencies.` });
        totals.debit += line.debit; totals.credit += line.credit; journals.set(line.journalId, totals);
      }
      const validColumnMapping = revision?.columnMapping === undefined || revision.columnMapping && typeof revision.columnMapping === 'object' && !Array.isArray(revision.columnMapping) && Object.keys(revision.columnMapping).length <= 14 && Object.entries(revision.columnMapping).every(([key, value]) => /^(journal|line|date|account|name|debit|credit|currency|description|opening|serviceDate|department|costCentre|project)$/.test(key) && typeof value === 'string' && value.length <= 256);
      if (!revision || !validColumnMapping || revision.revision !== index + 1 || !Number.isInteger(revision.revision) || revision.revision < 1 || glRevisionNumbers.has(revision.revision) || revision.predecessorRevision !== (revision.revision > 1 ? revision.revision - 1 : undefined) || typeof revision.fileName !== 'string' || !revision.fileName.trim() || !['CSV', 'XLSX', 'Legacy'].includes(revision.format) || revision.format !== 'Legacy' && !/^[a-f0-9]{64}$/i.test(revision.sha256 || '') || typeof revision.importedAt !== 'string' || !validDate(revision.importedAt.slice(0, 10)) || !userIds.has(revision.importedByUserId) || !book || !lines.length || !revision.openingBalances || typeof revision.openingBalances !== 'object' || Array.isArray(revision.openingBalances) || Object.values(revision.openingBalances).some(value => !Number.isFinite(value) || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) || [...journals.values()].some(totals => Math.abs(totals.debit - totals.credit) > 0.005)) {
        issues.push({ code: 'GL_SOURCE_REVISION', message: `GL revision ${revision?.revision ?? '(missing revision)'} on ${e.id} contains invalid source metadata, period, opening balances or journal totals.` });
      }
      if (revision && Number.isInteger(revision.revision)) glRevisionNumbers.add(revision.revision);
    }
  }
  for (const j of jobs) {
    if (j.dueDate) dateIssue(`Job ${j.id}`, 'due', j.dueDate);
    if (!clientIds.has(j.clientId)) issues.push({ code: 'FK_JOB_CLIENT', message: `Job ${j.id} references unknown client ${j.clientId}` });
    if (!engIds.has(j.engagementId)) issues.push({ code: 'FK_JOB_ENGAGEMENT', message: `Job ${j.id} references unknown engagement ${j.engagementId}` });
  }
  for (const t of tasks) {
    if (!jobIds.has(t.jobId)) issues.push({ code: 'FK_TASK_JOB', message: `Task ${t.id} references unknown job ${t.jobId}` });
    if (t.parentTaskId) {
      if (!taskIds.has(t.parentTaskId)) {
        issues.push({ code: 'FK_SUBTASK_PARENT', message: `Subtask ${t.id} references unknown parent ${t.parentTaskId}` });
      } else {
        const parent = tasks.find(p => p.id === t.parentTaskId);
        if (parent?.parentTaskId) issues.push({ code: 'HIERARCHY_DEPTH', message: `Task ${t.id} nests deeper than one subtask level` });
        if (parent && parent.jobId !== t.jobId) issues.push({ code: 'HIERARCHY_JOB', message: `Subtask ${t.id} crosses jobs` });
      }
    }
  }
  for (const inv of list<PrototypeState['invoices'][number]>(state?.invoices)) {
    dateIssue(`Invoice ${inv.id}`, 'due', inv.due);
    if (inv.issueDate) {
      dateIssue(`Invoice ${inv.id}`, 'issue', inv.issueDate);
      if (validDate(inv.due) && validDate(inv.issueDate) && inv.due < inv.issueDate) issues.push({ code: 'FIXTURE_DATE_ORDER', message: `Invoice ${inv.id} is due before its issue date.` });
    }
    if (!clientIds.has(inv.clientId)) issues.push({ code: 'FK_INVOICE_CLIENT', message: `Invoice ${inv.id} references unknown client ${inv.clientId}` });
    if (!Array.isArray(inv.lines)) {
      issues.push({ code: 'INVOICE_LINES', message: `Invoice ${inv.id} has no valid line collection` });
      continue;
    }
    const lineSum = inv.lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0);
    if (Math.abs(lineSum - inv.amount) > 0.005) {
      issues.push({ code: 'MONEY_INVOICE_TOTAL', message: `Invoice ${inv.id} total ${inv.amount} != sum of lines ${lineSum}` });
    }
  }
  for (const engagement of engagements) {
    for (const request of engagement.pbc || []) dateIssue(`PBC request ${request.id}`, 'due', request.due);
    const books = engagement.client && state.clients.find(client => client.id === engagement.client)?.accountingProfile?.periodBooks || [];
    for (const book of books) {
      dateIssue(`Accounting period ${book.id}`, 'start', book.startDate);
      dateIssue(`Accounting period ${book.id}`, 'end', book.endDate);
      if (validDate(book.startDate) && validDate(book.endDate) && book.startDate > book.endDate) issues.push({ code: 'FIXTURE_DATE_ORDER', message: `Accounting period ${book.id} ends before it starts.` });
    }
  }
  for (const receipt of list<PrototypeState['receipts'][number]>(state?.receipts)) dateIssue(`Receipt ${receipt.id}`, 'effective', receipt.date);
  for (const credit of list<PrototypeState['creditNotes'][number]>(state?.creditNotes)) dateIssue(`Credit note ${credit.id}`, 'issue', credit.issueDate);
  // Monetary control total: 8-account demo TB must net to zero per engagement where applicable
  // (only warn when engagement carries the canonical 8 demo rows)
  for (const e of engagements) {
    if (e.rows.length === 8) {
      const net = e.rows.reduce((s, r) => s + r.balance, 0);
      if (Math.abs(net) > 0.005) {
        issues.push({ code: 'MONEY_TB_IMBALANCE', message: `Engagement ${e.id} trial balance nets to ${net}, expected 0` });
      }
    }
  }
  // No uploaded binary payloads in persisted state
  const raw = JSON.stringify(state);
  if (/data:[^,]*;base64,/i.test(raw)) {
    issues.push({ code: 'PERSISTENCE_BINARY', message: 'Persisted state contains inline binary payload (file bytes must stay in-session only)' });
  }
  // No real personal data: demo emails must use .demo
  for (const u of users) {
    if (u.email && !/\.demo$/.test(u.email) && !/\.invalid$/.test(u.email)) {
      issues.push({ code: 'FIXTURE_PII', message: `User ${u.name} email ${u.email} is not a synthetic .demo address` });
    }
  }
  for (const g of list<PrototypeState['roleGrants'][number]>(state?.roleGrants)) {
    if (!userIds.has(g.userId)) issues.push({ code: 'FK_GRANT_USER', message: `Access grant references unknown persona ${g.userId}` });
    else if (users.find(u => u.id === g.userId)?.role !== g.role) issues.push({ code: 'GRANT_ROLE_MISMATCH', message: `Access grant role does not match persona ${g.userId}` });
    if (g.scopeKind === 'Client' && (!g.scopeId || !clientIds.has(g.scopeId))) issues.push({ code: 'FK_GRANT_CLIENT', message: `Access grant references unknown client ${g.scopeId || '(empty)'}` });
    if (g.scopeKind === 'Engagement' && (!g.scopeId || !engIds.has(g.scopeId))) issues.push({ code: 'FK_GRANT_ENGAGEMENT', message: `Access grant references unknown engagement ${g.scopeId || '(empty)'}` });
  }
  if (!userIds.has(state.currentUserId) || users.find(u => u.id === state.currentUserId)?.name !== state.currentPerson || users.find(u => u.id === state.currentUserId)?.role !== state.currentRole) {
    issues.push({ code: 'CURRENT_IDENTITY', message: 'Current identity does not resolve to one immutable active persona and role.' });
  }
  return issues;
}

export function migratePersistedState(parsed: unknown, fresh: PrototypeState): MigrationResult {
  const warnings: string[] = [];
  const p = parsed as Record<string, unknown>;
  const from = typeof p?.schema === 'number' ? (p.schema as number) : 0;
  let state: PrototypeState = { ...fresh, ...(parsed as Partial<PrototypeState>) };
  // The spread above is shallow: an older persisted firmSettings object replaces the fresh
  // one wholesale, so fields added in newer schemas (timezone, logoRef) must be backfilled.
  state.firmSettings = { ...fresh.firmSettings, ...((p?.firmSettings as Partial<PrototypeState['firmSettings']> | undefined) || {}) };
  // A migrated accounting profile without a deliberately selected reporting basis stays
  // explicitly 'Not selected' — never undefined, so TB/GL intake gates keep applying.
  for (const client of state.clients || []) {
    if (client.accountingProfile && !client.accountingProfile.reportingBasis) client.accountingProfile.reportingBasis = 'Not selected';
  }
  if (!Array.isArray(state.proposalServices)) state.proposalServices = structuredClone(fresh.proposalServices || []);
  if (!Array.isArray(state.proposalServiceHistory)) state.proposalServiceHistory = [];
  if (!Array.isArray(state.proposalTemplates)) state.proposalTemplates = structuredClone(fresh.proposalTemplates || []);
  if (!Array.isArray(state.proposalTemplateHistory)) state.proposalTemplateHistory = [];
  for (const proposal of state.proposals || []) {
    proposal.period ||= proposal.items.find(item => item.period)?.period;
    for (const item of proposal.items || []) {
      item.quantity ??= 1;
      item.rate ??= item.amount;
      item.exclusions ||= 'Not specified in this historical proposal.';
      item.clientResponsibilities ||= 'Not specified in this historical proposal.';
      item.dependencies ||= 'Not specified in this historical proposal.';
      item.period ||= proposal.period || 'Historical period not recorded';
    }
    proposal.period ||= 'Historical period not recorded';
    if (proposal.presentedSnapshot) {
      for (const item of proposal.presentedSnapshot.items || []) {
        item.quantity ??= 1;
        item.rate ??= item.amount;
        item.dependencies ||= '';
      }
    }
  }
  if (from < 3) {
    warnings.push(`Migrated legacy schema v${from} to v${CURRENT_SCHEMA}: preserved engagements, PBC, workpapers, reviews and releases.`);
    state.asOfDate = state.asOfDate || '2026-09-23';
  }
  if (from < 4) {
    // v4: engagement-scoped EQR state, per-engagement approvals, M365 independent cards
    for (const e of state.engagements) {
      if (!e.approvals) {
        (e as unknown as Record<string, unknown>).approvals = { manager: null, client: null, partner: null, eqr: null };
        warnings.push(`Engagement ${e.id}: initialised per-engagement approval/EQR state (VP-056).`);
      }
    }
    if (!state.emailTemplates) state.emailTemplates = fresh.emailTemplates;
    if (!state.customFields) state.customFields = fresh.customFields;
  }
  if (from < 5) {
    const users = Array.isArray(state.users) ? state.users : fresh.users;
    const resolve = (value: string, role?: string) => {
      const byId = users.find(u => u.id === value);
      if (byId) return byId;
      const matches = users.filter(u => u.name === value && (!role || u.role === role));
      return matches.length === 1 ? matches[0] : undefined;
    };
    const grants: PrototypeState['roleGrants'] = [];
    for (const grant of Array.isArray(state.roleGrants) ? state.roleGrants : []) {
      const user = resolve(grant.userId, grant.role);
      if (!user || user.role !== grant.role) {
        warnings.push(`Removed ambiguous or mismatched legacy access grant for ${grant.userId}; no authority was inferred.`);
        continue;
      }
      grants.push({ ...grant, userId: user.id });
    }
    state.users = users;
    state.roleGrants = grants;
    const current = resolve(state.currentUserId || state.currentPerson, state.currentRole);
    state.currentUserId = current?.id || '';
    if (current) {
      state.currentPerson = current.name;
      state.currentRole = current.role;
    } else {
      warnings.push('Could not uniquely resolve the legacy active persona; business commands remain disabled until a persona is selected.');
    }
    state.m365Config = {
      ...fresh.m365Config,
      ...(state.m365Config || {}),
      liveConnected: false,
      configRevision: Math.max(1, state.m365Config?.configRevision || 1),
      verificationResults: {}
    };
    warnings.push('Migrated persona grants to immutable IDs and cleared legacy M365 verification claims (v5).');
  }
  if (from < 6) {
    state.m365Config = { ...fresh.m365Config, ...(state.m365Config || {}), permittedUsers: Array.isArray(state.m365Config?.permittedUsers) ? state.m365Config.permittedUsers : [], liveConnected: false };
    warnings.push('Added explicit synthetic M365 permitted-person mappings without inferring access grants (v6).');
  }
  if (from < 7) {
    for (const engagement of state.engagements) {
      if (!Array.isArray(engagement.sourceHistory)) engagement.sourceHistory = engagement.rows.length ? [{
        version: engagement.sourceVersion || 1,
        rows: structuredClone(engagement.rows),
        importedAt: state.asOfDate,
        importedBy: 'Legacy source; import metadata unavailable',
        format: 'Legacy'
      }] : [];
    }
    warnings.push('Preserved existing trial-balance rows as legacy source snapshots and enabled immutable import revision history (v7).');
  }
  if (from < 8) {
    for (const engagement of state.engagements) if (!Array.isArray(engagement.packageHistory)) engagement.packageHistory = [];
    warnings.push('Initialized versioned financial package definitions without fabricating generated artifacts (v8).');
  }
  if (from < 9) {
    const defaultEngagementId = state.engagements[0]?.id;
    state.auditRisks ||= fresh.auditRisks;
    state.auditPrograms ||= fresh.auditPrograms;
    for (const risk of state.auditRisks) if (!risk.engagementId) risk.engagementId = defaultEngagementId;
    for (const seeded of fresh.auditPrograms) {
      if (seeded.id === 'PRG-03' && !state.auditPrograms.some(program => program.procedures.some(procedure => procedure.id === 'PRC-03'))) state.auditPrograms.push(structuredClone(seeded));
    }
    for (const program of state.auditPrograms) {
      program.engagementId ||= defaultEngagementId;
      for (const procedure of program.procedures) {
        procedure.engagementId ||= program.engagementId;
        const linkedRiskIds = state.auditRisks.filter(risk => risk.engagementId === procedure.engagementId && risk.linkedProcedureIds.includes(procedure.id)).map(risk => risk.id);
        procedure.linkedRiskIds = [...new Set([...(procedure.linkedRiskIds || []), ...linkedRiskIds])];
      }
    }
    warnings.push('Scoped legacy risks and programs to the default engagement and restored reciprocal risk/procedure lineage (v9).');
  }
  if (from < 10) {
    for (const population of state.samplePopulations || []) {
      population.engagementId ||= state.selectedEngagement || state.engagements[0]?.id;
      for (const item of population.items || []) item.selected ??= true;
    }
    warnings.push('Scoped legacy sample populations to an engagement and retained existing sample selection (v10).');
  }
  if (from < 11) {
    for (const population of state.samplePopulations || []) {
      population.sourceRevision ||= 1;
      population.sourceFileName ||= 'Legacy sample population';
      population.sourceComplete ??= false;
      population.sourceHistory ||= [];
    }
    warnings.push('Added source identity and predecessor history for sample population replacements (v11).');
  }
  if (from < 12) {
    state.roleGrantHistory = Array.isArray(state.roleGrantHistory) ? state.roleGrantHistory : [];
    warnings.push('Initialized access grant history without inferring events from current grants (v12).');
  }
  if (from < 13) {
    for (const record of state.acceptanceCases || []) {
      record.screeningEvidence ||= {};
      if (record.decisionStatus === 'Accepted') {
        const engagement = state.engagements.find(item => item.id === record.engagementId || (item.client === record.clientId && item.year === record.year));
        if (engagement) engagement.acceptance = false;
      }
    }
    warnings.push('Added explicit acceptance screening evidence references; legacy approvals without references no longer authorize engagement work (v13).');
  }
  if (from < 15) {
    for (const population of state.samplePopulations || []) {
      const seeded = fresh.samplePopulations.find(item => item.id === population.id);
      const engagement = state.engagements.find(item => item.id === population.engagementId);
      population.accountCode ||= seeded?.accountCode;
      population.period ||= seeded?.period || engagement?.year;
      population.currency ||= seeded?.currency || engagement?.currency;
    }
    warnings.push('Linked sample populations to an explicit engagement period, currency and GL account (v15).');
  }
  if (from < 16) {
    state.workpaperTemplates = structuredClone(fresh.workpaperTemplates || []);
    warnings.push('Added the published workpaper template catalogue without copying execution or clearance state (v16).');
  }
  if (from < 17) {
    warnings.push('Added evidence-link and adequacy history records (v17).');
  }
  if (from < 18) {
    warnings.push('Added attributable finding disposition histories (v18).');
  }
  if (from < 19) warnings.push('Added saved and independently reviewed statement-set revisions (v19).');
  if (from < 20) {
    for (const client of state.clients) {
      const engagements = state.engagements.filter(engagement => engagement.client === client.id);
      if (!client.accountingProfile) {
        const rows = new Map(engagements.flatMap(engagement => engagement.rows).map(row => [row.code, row]));
        client.accountingProfile = {
          revision: 1,
          chartRevision: 1,
          legalEntityName: client.name,
          reportingBasis: 'Not selected',
          baseCurrency: engagements[0]?.currency || 'QAR',
          accounts: [...rows.values()].map(row => ({ code: row.code, name: row.name, type: row.type, posting: true, active: true })),
          periodBooks: engagements.map(engagement => ({ id: `PB-${engagement.id}`, name: engagement.period, bookName: engagement.mode, startDate: `${engagement.year}-01-01`, endDate: `${engagement.year}-12-31`, ownerEngagementId: engagement.id, status: 'Open' as const })),
          dimensions: [{ id: `DIM-DEPT-${client.id}`, name: 'Department', values: [...new Set(engagements.flatMap(engagement => engagement.rows.map(row => row.dimensionDept).filter((value): value is string => Boolean(value))))], active: true }],
          history: []
        };
      }
      for (const engagement of engagements) {
        const profile = client.accountingProfile;
        const periodBook = profile.periodBooks.find(item => item.ownerEngagementId === engagement.id) || { id: `PB-${engagement.id}`, name: engagement.period, bookName: engagement.mode, startDate: `${engagement.year}-01-01`, endDate: `${engagement.year}-12-31`, ownerEngagementId: engagement.id, status: 'Open' as const };
        if (!profile.periodBooks.some(item => item.id === periodBook.id)) profile.periodBooks.push(periodBook);
        engagement.accountingPeriodBookId ||= periodBook.id;
        engagement.accountingProfileRevision ||= profile.revision;
        engagement.accountingChartRevision ||= profile.chartRevision;
      }
    }
    warnings.push('Added client accounting profiles and period/book context from existing engagement metadata; legacy source imports remain unpinned to that context until re-imported (v20).');
  }
  if (from < 21) {
    const legacyActorId = (name: string) => state.users.find(user => user.name === name)?.id || name;
    const baseline = (archive: NonNullable<PrototypeState['engagements'][number]['archive']>) => archive.history ||= [{
      action: 'Existing archive state' as const,
      actorId: legacyActorId(archive.archivedBy),
      at: archive.archivedAt,
      after: { releaseId: archive.releaseId, retentionUntil: archive.retentionUntil, onHold: Boolean(archive.onApplicationHold), holdReason: archive.holdReason }
    }];
    for (const engagement of state.engagements) if (engagement.archive) baseline(engagement.archive);
    state.archives ||= [];
    for (const archive of state.archives) {
      archive.history ||= [{
        action: 'Existing archive state',
        actorId: legacyActorId(archive.archivedBy),
        at: archive.archivedAt,
        after: { releaseId: archive.releaseId, retentionUntil: archive.retentionUntil, onHold: Boolean(archive.onApplicationHold ?? archive.onHold), holdReason: archive.holdReason }
      }];
    }
    warnings.push('Initialized attributable archive metadata histories while preserving existing archive manifests (v21).');
  }
  if (from < 22) {
    for (const group of state.consolidationGroups || []) {
      const seededSubsidiary = group.id === 'GRP-01' ? group.components.find(component => component.componentId === 'ENG-26002') : undefined;
      if (seededSubsidiary?.role === 'Associate' && seededSubsidiary.ownershipPercent === 100 && seededSubsidiary.legalEntityName === 'Northstar Services (Associate)') {
        seededSubsidiary.role = 'Subsidiary';
        seededSubsidiary.legalEntityName = 'Northstar Services (Subsidiary)';
      }
    }
    warnings.push('Corrected the seeded wholly owned consolidation component label; unsupported associate accounting methods remain unchanged (v22).');
  }
  if (from < 23) {
    for (const group of state.consolidationGroups || []) {
      const parent = group.components.find(component => component.role === 'Parent');
      const engagement = state.engagements.find(item => item.id === parent?.componentId);
      const profile = state.clients.find(item => item.id === engagement?.client)?.accountingProfile;
      if (!group.reportingBasis && profile?.reportingBasis !== 'Not selected') group.reportingBasis = profile?.reportingBasis;
      for (const component of group.components) {
        delete component.packageReview;
        component.status = 'Pending';
      }
    }
    warnings.push('Pinned prior consolidation snapshots for explicit basis, period and package-review revalidation (v23).');
  }
  if (from < 24) {
    for (const client of state.clients || []) {
      client.clientType ||= 'Company';
      client.profileRevision ??= 0;
    }
    warnings.push('Initialized client entity types and profile revisions while preserving client IDs and linked work (v24).');
  }
  if (from < 26) {
    for (const invoice of state.invoices || []) {
      if (invoice.clientId) continue;
      const engagementId = invoice.engagementId || invoice.eng;
      const matches = state.engagements.filter(item => item.id === engagementId);
      const clientId = matches.length === 1 ? matches[0].client : undefined;
      if (clientId && state.clients.some(client => client.id === clientId)) {
        invoice.clientId = clientId;
        warnings.push(`Linked invoice ${invoice.id} to client ${clientId} using its unique engagement ${engagementId} (v26).`);
      }
    }
  }
  if (from < 27) {
    for (const invoice of state.invoices || []) {
      if (Array.isArray(invoice.lines)) continue;
      const seededInvoices = fresh.invoices.filter(item => item.id === invoice.id);
      if (seededInvoices.length !== 1) continue;
      const seeded = seededInvoices[0];
      const engagementId = invoice.engagementId || invoice.eng;
      const seededEngagementId = seeded.engagementId || seeded.eng;
      const matchesSeedIdentity = invoice.clientId === seeded.clientId
        && engagementId === seededEngagementId
        && invoice.invoiceNumber === seeded.invoiceNumber
        && invoice.description === seeded.description
        && invoice.amount === seeded.amount
        && invoice.currency === seeded.currency;
      if (matchesSeedIdentity && Array.isArray(seeded.lines) && seeded.lines.length > 0) {
        invoice.lines = structuredClone(seeded.lines);
        warnings.push(`Restored the missing line collection for unchanged seeded invoice ${invoice.id} (v27).`);
      }
    }
  }
  if (from < 28) {
    state.users = Array.isArray(state.users) ? state.users : [];
    const seededSuperuser = fresh.users.find(user => user.id === 'superuser');
    if (seededSuperuser && !state.users.some(user => user.id === seededSuperuser.id)) {
      state.users.push(structuredClone(seededSuperuser));
      warnings.push('Added the synthetic full-access prototype testing persona (v28).');
    }
  }
  for (const evidence of state.evidenceCatalogue || []) {
    evidence.linkedProcedureHistory ||= [];
    evidence.adequacyHistory ||= [];
  }
  for (const finding of state.findings || []) finding.dispositionHistory ||= [];
  for (const engagement of state.engagements) engagement.cashFlowScheduleHistory = Array.isArray(engagement.cashFlowScheduleHistory) ? engagement.cashFlowScheduleHistory : [];
  state.accountMappingRevisions = Array.isArray(state.accountMappingRevisions) ? state.accountMappingRevisions : [];
  state.statementSetRevisions = Array.isArray(state.statementSetRevisions) ? state.statementSetRevisions : [];
  state.statementLayoutRevisions = Array.isArray(state.statementLayoutRevisions) ? state.statementLayoutRevisions : [];
  state.simulatedInvitations = Array.isArray(state.simulatedInvitations) ? state.simulatedInvitations : [];
  state.identityStatusHistory = Array.isArray(state.identityStatusHistory) ? state.identityStatusHistory : [];
  state.auditProgramTemplates = Array.isArray(state.auditProgramTemplates) ? state.auditProgramTemplates : [];
  state.auditProgramTemplateHistory = Array.isArray(state.auditProgramTemplateHistory) ? state.auditProgramTemplateHistory : [];
  state.workpaperTemplates = Array.isArray(state.workpaperTemplates) ? state.workpaperTemplates : [];
  state.schema = CURRENT_SCHEMA;
  return { state, migratedFrom: from, warnings };
}
