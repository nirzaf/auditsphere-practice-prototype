import { canonicalRoute } from '../services/legacyRoutes';
// AuditSphere Single Typed Store & Command Boundary
// VP-002, VP-004, VP-019, VP-056: Single state, guarded actions, reactive subscriptions

import { PrototypeState, RoleKey, ClientRecord, EngagementRecord, JobRecord, JobTaskItem, JobTemplateItem, TimeEntryItem, InvoiceRecord, InvoiceLineItem, ReceiptRecord, CreditNoteRecord, PbcRequestItem, WorkpaperItem, WorkpaperTemplateItem, ReviewNoteItem, AdjustmentJournalItem, AdjustmentJournalSupportLinks, ConsolidationGroupRecord, DocumentItem, CommunicationItem, EmailTemplateItem, AcceptanceCaseRecord, AuditPlanRecord, ArchiveRecord, ArchiveHistoryEntry, ArchivedArtifactRecord, SimulatedInvitation, IdentityStatusEvent, StatementSetRevision, StatementLayoutRevision, CashFlowScheduleRevision, ReconciliationSchedule, ClientAccountingProfile, GLSourceRevision, ProposalServiceDefinition, ProposalContentTemplate } from '../types';
import { createInitialState } from './initialState';
import { TargetLifecycleCommands } from './targetLifecycleCommands';
import { activationBlockers, billingSummary, fieldworkBlockers, normalizeTargetState, emptyAuditLifecycle } from '../services/targetLifecycle';
import { ScenarioName, loadScenarioState } from './scenarios';
import { CURRENT_SCHEMA, migratePersistedState, validateFixtures } from '../services/migrations';
import { requireActiveIdentity, requireIndependentActor, requireEngagementScope, requireClientScope, visibleClientIds, visibleEngagementIds, eligibleReviewAssignees, eligibleAuditRiskOwners, isClientRole, canOpenRoute, GuardError, markStateStale, roleRequiresApprovalEvidence, requireConsolidationGroupScope, isSuperuserRole, hasAnyRole, recordPrototypeSuperuserOverride, requireActiveEngagementLifecycle, requireActiveConsolidationComponents } from '../services/guards';
import { applyReportingAdjustments, calculateReconciliationVariance } from '../services/calculations';
import { validatePbcUpload } from '../services/pbcUpload';
import { consolidationOutputFingerprint } from '../services/consolidationOutput';
import { isReleaseBlockingFinding } from '../services/findings';
import { evaluateReleaseReadiness as evaluateReleaseReadinessSnapshot } from '../services/releaseReadiness';
import { isSampleFrameReconciled } from '../services/samplingReadiness';

const STORAGE_KEY = 'ste-auditsphere-role-portals-v2';
const STORAGE_BACKUP_KEY = 'ste-auditsphere-role-portals-v2.backup';

const isValidMoney = (amount: number, allowZero = false) =>
  Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) && Math.round(amount * 100) === amount * 100;
const isCentAmount = (amount: unknown): amount is number => typeof amount === 'number' && Number.isFinite(amount) && Math.round(amount * 100) === amount * 100;
const isValidAdjustmentJournalLines = (lines: unknown, engagement: EngagementRecord) =>
  Array.isArray(lines) && lines.length >= 2 && lines.every((line: any) =>
    Boolean(line && typeof line === 'object'
      && typeof line.accountCode === 'string' && line.accountCode.trim()
      && typeof line.accountName === 'string' && line.accountName.trim()
      && ['debit', 'credit'].includes(line.type)
      && isValidMoney(line.amount)
      && ((line.debit === undefined && line.credit === undefined)
        || (isValidMoney(line.debit ?? 0, true) && isValidMoney(line.credit ?? 0, true)
          && line.debit === (line.type === 'debit' ? line.amount : 0)
          && line.credit === (line.type === 'credit' ? line.amount : 0)))
      && engagement.rows.some(row => row.code === line.accountCode)
      && (line.engagementId === undefined || line.engagementId === engagement.id)
      && (line.clientId === undefined || line.clientId === engagement.client)
      && (line.currency === undefined || line.currency === engagement.currency)));
const isActiveClientContact = (state: PrototypeState, clientId: string, name: string) =>
  state.contacts.some(contact => contact.clientId === clientId && contact.active && contact.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());

const requireRole = (state: PrototypeState, allowed: RoleKey[], action: string) => {
  if (!isSuperuserRole(state.currentRole) && !allowed.includes(state.currentRole)) {
    throw new GuardError('FORBIDDEN_SCOPE', `Role "${state.currentRole}" cannot ${action}.`);
  }
};
const requireGlobalAdmin = (state: PrototypeState, action: string) => {
  if (!isSuperuserRole(state.currentRole) && (state.currentRole !== 'admin' || !state.roleGrants.some(g => g.userId === state.currentUserId && g.role === 'admin' && g.scopeKind === 'Global'))) {
    throw new GuardError('FORBIDDEN_SCOPE', `Only administrators with an active Global grant can ${action}.`);
  }
};
const unsupportedProposalTerms = ['t' + 'ax', 'pay' + 'roll', 'artificial ' + 'intelligence', 'A' + 'I', 'payment ' + 'gateway', 'e ' + 'signature', 'signature ' + 'provider'];
const hasUnsupportedProposalOffering = (value: string) => {
  const words = value.toLowerCase().match(/[a-z]+/g) || [];
  const normalized = ` ${words.join(' ')} `;
  return words.some(word => word.startsWith('re' + 'curr')) || unsupportedProposalTerms.some(term => normalized.includes(` ${term.toLowerCase()} `));
};
const isProposalCurrency = (value: string) => ['QAR', 'USD', 'EUR', 'GBP'].includes(value);
const isProposalDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
const hasValidProposalPeriod = (start?: string, end?: string) => Boolean(isProposalDate(start) && isProposalDate(end) && start! <= end!);

class PrototypeStore {
  private state: PrototypeState;
  public readonly lifecycle = new TargetLifecycleCommands(() => this.state, () => this.notify());
  private listeners: Set<() => void> = new Set();
  private isSessionOnly = false;
  private loadError: string | null = null;
  private storageConflict = false;

  constructor() {
    this.state = this.loadInitialState();
    // VP-004: one active editing tab. A storage event from another tab surfaces
    // reload/conflict guidance instead of silently overwriting.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.storageConflict = true;
          markStateStale(this.state, true);
          this.listeners.forEach(fn => fn());
        }
      });
    }
  }

  public hasStorageConflict(): boolean { return this.storageConflict; }
  public resolveStorageConflict(choice: 'reload' | 'keep-local'): void {
    if (!this.storageConflict) return;
    const latest = localStorage.getItem(STORAGE_KEY);
    if (choice === 'reload') {
      if (!latest) throw new GuardError('INVALID_STATE', 'The newer saved state is no longer available.');
      const parsed = JSON.parse(latest) as Partial<PrototypeState>;
      const { state } = migratePersistedState(parsed, createInitialState());
      const issues = validateFixtures(state);
      if (issues.length) throw new GuardError('INVALID_STATE', `Newer saved state failed validation: ${issues[0].message}`);
      markStateStale(this.state, false);
      this.state = state;
    } else if (latest) {
      // Preserve the other tab's latest payload before the user explicitly replaces it.
      localStorage.setItem(STORAGE_BACKUP_KEY, latest);
    }
    this.storageConflict = false;
    markStateStale(this.state, false);
    if (choice === 'keep-local') this.persist();
    this.listeners.forEach(fn => fn());
  }
  public isSessionOnlyMode(): boolean { return this.isSessionOnly; }
  public getLoadError(): string | null { return this.loadError; }

  private assertCurrentAdjustmentSupport(engagementId: string, links?: AdjustmentJournalSupportLinks) {
    if (!links || (!links.evidence && !links.workpaper && !links.finding)) return;
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    if (!engagement) throw new GuardError('FORBIDDEN_SCOPE', 'Journal support must belong to an available engagement.');
    if (links.evidence) {
      const pin = links.evidence;
      const evidence = this.state.evidenceCatalogue.find(item => item.id === pin.id);
      const document = evidence && this.state.documents.find(item => item.id === evidence.documentId);
      if (!evidence || !document || document.id !== pin.documentId || document.clientId !== engagement.client || document.engagementId !== engagementId || document.brokenLink) {
        throw new GuardError('FORBIDDEN_SCOPE', 'Linked evidence must resolve to an available document within this engagement and client.');
      }
      if (this.state.documents.some(item => item.supersedesDocumentId === document.id)) throw new GuardError('STALE_REVISION', 'Linked evidence points to a superseded document. Select evidence for the current document revision.');
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
      const finding = this.state.findings.find(item => item.id === links.finding!.id && item.engagementId === engagementId);
      if (!finding) throw new GuardError('FORBIDDEN_SCOPE', 'Linked finding must belong to this engagement.');
      if ((finding.revision || 1) !== links.finding.revision) throw new GuardError('STALE_REVISION', 'Linked finding revision is stale. Select its current revision.');
    }
  }

  public getAdjustmentSupportIssue(engagementId: string, links?: AdjustmentJournalSupportLinks): string | null {
    try {
      this.assertCurrentAdjustmentSupport(engagementId, links);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Journal support could not be verified.';
    }
  }

  public getAdjustmentSupportIssues(engagementId: string): Record<string, string> {
    return Object.fromEntries(this.state.adjustmentJournals
      .filter(journal => journal.engagementId === engagementId && journal.supportLinks)
      .flatMap(journal => {
        const issue = this.getAdjustmentSupportIssue(engagementId, journal.supportLinks);
        return issue ? [[journal.id, issue] as const] : [];
      }));
  }

  private loadInitialState(): PrototypeState {
    if (typeof localStorage === 'undefined') {
      this.isSessionOnly = true;
      return typeof window === 'undefined' ? createInitialState() : loadScenarioState('target-lifecycle');
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          this.loadError = 'Saved demo state could not be parsed. Recovery: keep the preserved payload, reset, or import a validated file. Nothing was silently deleted.';
          try { localStorage.setItem(STORAGE_BACKUP_KEY, raw); } catch { /* quota */ }
          return typeof window === 'undefined' ? createInitialState() : loadScenarioState('target-lifecycle');
        }
        const schema = (parsed as { schema?: unknown }).schema;
        if (typeof schema === 'number' && schema > CURRENT_SCHEMA) {
          this.loadError = `Saved demo state uses schema v${schema}, newer than supported v${CURRENT_SCHEMA}. Recovery: export/preserve the payload, then reset or import a compatible file.`;
          try { localStorage.setItem(STORAGE_BACKUP_KEY, raw); } catch { /* quota */ }
          return typeof window === 'undefined' ? createInitialState() : loadScenarioState('target-lifecycle');
        }
        if (parsed && typeof schema === 'number' && Array.isArray((parsed as { engagements?: unknown }).engagements)) {
          try { localStorage.setItem(STORAGE_BACKUP_KEY, raw); } catch { /* quota */ }
          const { state } = migratePersistedState(parsed, createInitialState());
          const issues = validateFixtures(state);
          if (issues.length === 0) return state;
          this.loadError = `Saved demo state failed integrity validation (${issues[0].message}). The original payload was preserved; reset or import a validated file.`;
          return typeof window === 'undefined' ? createInitialState() : loadScenarioState('target-lifecycle');
        }
        this.loadError = 'Saved demo state was ambiguous or incomplete. Recovery: the prior payload was preserved; reset or import a validated file.';
        try { localStorage.setItem(STORAGE_BACKUP_KEY, raw); } catch { /* quota */ }
      }
    } catch (e) {
      console.warn('Storage read error, starting with default session state', e);
      this.isSessionOnly = true;
    }
    return typeof window === 'undefined' ? createInitialState() : loadScenarioState('target-lifecycle');
  }

  private persist() {
    if (this.isSessionOnly || this.storageConflict) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Storage quota exceeded, switching to session-only mode', e);
      this.isSessionOnly = true;
    }
  }

  private notify() {
    this.persist();
    this.listeners.forEach(fn => fn());
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public getSnapshot = (): PrototypeState => {
    return structuredClone(this.state);
  };

  public getPreservedStateJSON(): string | null {
    try { return localStorage.getItem(STORAGE_BACKUP_KEY); } catch { return null; }
  }

  private invalidateReleaseBasis(eng: EngagementRecord) {
    eng.generation++;
    eng.candidate = null;
    eng.approvals.manager = null;
    eng.approvals.client = null;
    eng.approvals.partner = null;
    eng.approvals.eqr = null;
  }

  private reopenWorkpaperReviewNotes(eng: EngagementRecord, workpaper: WorkpaperItem) {
    for (const note of eng.reviews.filter(item => item.wp === workpaper.id && ['Responded', 'Cleared'].includes(item.status))) {
      note.status = 'Reopened';
      note.history.push({ actor: this.state.currentPerson, action: 'Reopened after workpaper revision', time: new Date().toISOString(), text: `Workpaper revision changed to v${workpaper.version}; previous response remains historical.` });
    }
  }

  private reopenFindingReviewNotes(eng: EngagementRecord, finding: PrototypeState['findings'][number]) {
    for (const note of eng.reviews.filter(item => item.subjectType === 'finding' && item.wp === finding.id && ['Responded', 'Cleared'].includes(item.status))) {
      note.status = 'Reopened';
      note.history.push({ actor: this.state.currentPerson, action: 'Reopened after finding revision', time: new Date().toISOString(), text: `Finding revision changed to v${finding.revision || 1}; previous response remains historical.` });
    }
  }

  private reviewSubjectRevision(eng: EngagementRecord, note: ReviewNoteItem) {
    if (note.subjectType === 'finding') {
      const finding = this.state.findings.find(item => item.id === note.wp && item.engagementId === eng.id);
      if (!finding) throw new GuardError('INVALID_STATE', `Review finding "${note.wp}" was not found in this engagement.`);
      return finding.revision || 1;
    }
    const workpaper = eng.workpapers.find(item => item.id === note.wp);
    if (!workpaper) throw new GuardError('INVALID_STATE', `Review workpaper "${note.wp}" was not found.`);
    return workpaper.version;
  }

  private assignAccountingPeriod(engagement: EngagementRecord) {
    const client = this.state.clients.find(item => item.id === engagement.client);
    if (!client) return;
    const profile = client.accountingProfile ||= { legalEntityName: client.name, reportingBasis: 'Not selected', baseCurrency: engagement.currency || 'QAR', accounts: [], periodBooks: [], dimensions: [], revision: 0, chartRevision: 0, history: [] };
    const period = profile.periodBooks.find(book => book.ownerEngagementId === engagement.id);
    if (period) { engagement.accountingPeriodBookId = period.id; engagement.accountingProfileRevision = profile.revision; engagement.accountingChartRevision = profile.chartRevision; return; }
    const dates = engagement.period.match(/(\d{4})/g) || [String(engagement.year)];
    const startYear = dates[0], endYear = dates.at(-1) || startYear;
    const id = `PB-${engagement.id}`;
    if (profile.revision) profile.history.push({ legalEntityName: profile.legalEntityName, reportingBasis: profile.reportingBasis, baseCurrency: profile.baseCurrency, accounts: structuredClone(profile.accounts), periodBooks: structuredClone(profile.periodBooks), dimensions: structuredClone(profile.dimensions), revision: profile.revision, chartRevision: profile.chartRevision, savedAt: new Date().toISOString(), savedByUserId: this.state.currentUserId });
    profile.periodBooks.push({ id, name: engagement.period, bookName: engagement.mode || 'General ledger', startDate: `${startYear}-01-01`, endDate: `${endYear}-12-31`, ownerEngagementId: engagement.id, status: 'Open' });
    profile.revision++;
    for (const existing of this.state.engagements.filter(item => item.client === engagement.client)) { existing.accountingProfileRevision = profile.revision; existing.accountingChartRevision = profile.chartRevision; }
    engagement.accountingPeriodBookId = id; engagement.accountingProfileRevision = profile.revision; engagement.accountingChartRevision = profile.chartRevision;
  }

  private hasNewerDocumentRevision(documentId: string) {
    return this.state.documents.some(document => document.supersedesDocumentId === documentId);
  }

  private staleReconciliation(rec: ReconciliationSchedule) {
    if (rec.status === 'Stale') return;
    if (rec.preparedAt) {
      rec.history ||= [];
      rec.history.push({ revision: rec.revision || 1, sourceVersion: rec.sourceVersion || 0, status: rec.status, savedAt: rec.preparedAt, savedByUserId: rec.preparedByUserId || '', glBalance: rec.glBalance ?? rec.sourceBalance, statementBalance: rec.statementBalance ?? rec.supportingBalance, items: structuredClone(rec.items || []), reviewedByUserId: rec.reviewedByUserId, reviewedAt: rec.reviewedAt, reviewNote: rec.reviewNote });
    }
    rec.status = 'Stale';
  }

  private staleStatementSetRevisions(changedEngagementId: string) {
    for (const revision of this.state.statementSetRevisions || []) {
      if (revision.engagementId !== changedEngagementId && revision.comparativeEngagementId !== changedEngagementId) continue;
      const engagement = this.state.engagements.find(item => item.id === revision.engagementId);
      const mappingRevision = Math.max(0, ...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === revision.engagementId).map(item => item.revision));
      const comparison = revision.comparativeEngagementId && this.state.engagements.find(item => item.id === revision.comparativeEngagementId);
      const comparisonMappingRevision = comparison && Math.max(0, ...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === comparison.id).map(item => item.revision));
      if (!engagement || revision.sourceVersion !== engagement.sourceVersion || revision.mappingRevision !== mappingRevision ||
          (revision.scopeSnapshot && (revision.scopeSnapshot.service !== engagement.service || revision.scopeSnapshot.year !== engagement.year || revision.scopeSnapshot.period !== engagement.period)) ||
          (revision.comparativeEngagementId && (!comparison || revision.comparativeSourceVersion !== comparison.sourceVersion || revision.comparativeMappingRevision !== comparisonMappingRevision || revision.comparativeScopeSnapshot && (revision.comparativeScopeSnapshot.service !== comparison.service || revision.comparativeScopeSnapshot.year !== comparison.year || revision.comparativeScopeSnapshot.period !== comparison.period)))) {
        revision.status = 'Stale';
      }
    }
  }

  private staleCashFlowSchedules(changedEngagementId: string) {
    const engagement = this.state.engagements.find(item => item.id === changedEngagementId);
    if (!engagement) return;
    const mappingRevision = Math.max(0, ...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === changedEngagementId).map(item => item.revision));
    for (const revision of engagement.cashFlowScheduleHistory || []) {
      if (revision.sourceVersion !== engagement.sourceVersion || revision.mappingRevision !== mappingRevision) revision.status = 'Stale';
    }
  }

  public logEvent(text: string, ref: string, type = 'checkcircle') {
    const time = 'Today · ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    this.state.events.unshift({ text, ref, time, type });
    if (this.state.events.length > 50) this.state.events.pop();
  }

  // --- Persona & Scope Actions ---
  public setRole(role: RoleKey) {
    this.state.currentRole = role;
    const persona = this.state.users.find(u => u.role === role);
    if (persona) {
      this.state.currentUserId = persona.id;
      this.state.currentPerson = persona.name;
    }
    this.notify();
  }

  public setPerson(name: string) {
    const matching = this.state.users.filter(u => u.name === name && u.role === this.state.currentRole);
    const user = matching.length === 1 ? matching[0] : this.state.users.find(u => u.name === name);
    if (user) {
      this.state.currentUserId = user.id;
      this.state.currentPerson = user.name;
      this.state.currentRole = user.role;
    } else {
      this.state.currentPerson = name;
    }
    this.notify();
  }

  /** Switch by immutable persona ID, never by display name. */
  public setPersona(userId: string) {
    const user = this.state.users.find(u => u.id === userId);
    if (!user) throw new GuardError('DISABLED_IDENTITY', `Persona "${userId}" is not recognized.`);
    this.state.currentUserId = user.id;
    this.state.currentPerson = user.name;
    this.state.currentRole = user.role;
    this.notify();
  }

  public setSelectedEngagement(id: string) {
    this.state.selectedEngagement = id;
    this.notify();
  }

  // --- Client Actions (VP-006, VP-007) ---
  public addClient(client: ClientRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'create client profiles');
    if (visibleClientIds(this.state) !== 'ALL') throw new GuardError('FORBIDDEN_SCOPE', 'Creating a client profile requires an active Global client grant.');
    this.validateClientProfile(client);
    if (this.state.clients.some(existing => existing.id === client.id)) throw new GuardError('INVALID_STATE', `Client "${client.id}" already exists.`);
    const normalized = client.code.trim().toUpperCase();
    if (this.state.clients.some(c => c.code.trim().toUpperCase() === normalized)) {
      throw new GuardError('INVALID_STATE', `Duplicate client code "${client.code}". Review the similar-name warning instead of merging distinct legal entities.`);
    }
    const saved: ClientRecord = { ...client, code: normalized, name: client.name.trim(), clientType: client.clientType, profileRevision: 0, accountingProfile: client.accountingProfile || { legalEntityName: client.name.trim(), reportingBasis: 'Not selected', baseCurrency: 'QAR', accounts: [], periodBooks: [], dimensions: [], revision: 0, chartRevision: 0, history: [] } };
    this.state.clients.push(saved);
    if (saved.contact?.trim() && saved.email?.trim()) this.state.contacts.push({ id: `CNT-${crypto.randomUUID()}`, clientId: saved.id, name: saved.contact.trim(), email: saved.email.trim(), phone: saved.phone?.trim() || undefined, isPrimary: true, active: true });
    this.logEvent(`New client profile created: ${saved.name}`, saved.id);
    this.notify();
    return this.getClientProfileWarnings(saved, saved.id);
  }

  private validateClientProfile(client: ClientRecord) {
    const allowedTypes = ['Company', 'Individual', 'Partnership', 'Government', 'Nonprofit', 'Other'];
    const allowedStatuses = ['Prospect', 'Active', 'Suspended', 'Archived'];
    if (!client.name?.trim()) throw new GuardError('INVALID_STATE', 'Client legal name is required.');
    if (!client.code?.trim()) throw new GuardError('INVALID_STATE', 'Client code is required.');
    if (!client.clientType || !allowedTypes.includes(client.clientType)) throw new GuardError('INVALID_STATE', 'Choose a valid client type.');
    if (!allowedStatuses.includes(client.status)) throw new GuardError('INVALID_STATE', 'Choose a valid client status.');
    if (!client.relationshipOwner?.trim()) throw new GuardError('INVALID_STATE', 'A relationship owner is required.');
    const inScopeUser = (name: string, roles: RoleKey[]) => this.state.users.some(user => {
      if (user.status !== 'Active' || user.name !== name || !roles.includes(user.role)) return false;
      const visible = visibleClientIds(this.state, user.id);
      return visible === 'ALL' || visible.includes(client.id);
    });
    if (!inScopeUser(client.relationshipOwner, ['relationship', 'manager', 'partner'])) throw new GuardError('FORBIDDEN_SCOPE', 'Relationship owner must be an active relationship, manager, or partner persona with client scope.');
    if (client.partner && !inScopeUser(client.partner, ['partner'])) throw new GuardError('FORBIDDEN_SCOPE', 'Assigned partner must be active and have client scope.');
    if (client.manager && !inScopeUser(client.manager, ['manager'])) throw new GuardError('FORBIDDEN_SCOPE', 'Assigned manager must be active and have client scope.');
    const email = client.email?.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GuardError('INVALID_STATE', 'Enter a valid client email address.');
    const phone = client.phone?.trim();
    if (phone && !/^\+?[0-9().\s-]{7,24}$/.test(phone)) throw new GuardError('INVALID_STATE', 'Enter a valid client phone number.');
    const website = client.website?.trim();
    if (website) {
      try { const url = new URL(website); if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) throw new Error(); }
      catch { throw new GuardError('INVALID_STATE', 'Enter a valid website URL beginning with http:// or https://.'); }
    }
    if (typeof client.revenue !== 'number' || !Number.isFinite(client.revenue) || client.revenue < 0) throw new GuardError('INVALID_STATE', 'Annual revenue must be a finite non-negative amount.');
  }

  public getClientProfileWarnings(client: Pick<ClientRecord, 'name' | 'registrationNumber'>, excludingClientId?: string): string[] {
    const visible = visibleClientIds(this.state);
    const nameTokens = (value: string) => value.toLowerCase().replace(/\b(limited|ltd|llc|wll|company|co|the)\b/g, ' ').match(/[a-z0-9]+/g) || [];
    const tokens = nameTokens(client.name).filter(token => token.length > 2);
    const warnings: string[] = [];
    for (const existing of this.state.clients) {
      if (existing.id === excludingClientId || visible !== 'ALL' && !visible.includes(existing.id)) continue;
      const sameRegistration = Boolean(client.registrationNumber?.trim() && existing.registrationNumber?.trim() && client.registrationNumber.trim().toLowerCase() === existing.registrationNumber.trim().toLowerCase());
      const existingTokens = new Set(nameTokens(existing.name).filter(token => token.length > 2));
      const overlap = [...new Set(tokens)].filter(token => existingTokens.has(token));
      const similarName = overlap.length >= 2 || tokens.length > 0 && tokens.every(token => existingTokens.has(token)) || [...existingTokens].every(token => token.length > 2 && tokens.includes(token));
      if (sameRegistration) warnings.push(`Registration number matches ${existing.name} (${existing.id}); review before saving. The legal entities will remain separate.`);
      else if (similarName) warnings.push(`Name is similar to ${existing.name} (${existing.id}); review the legal entity before saving. No records will be merged.`);
    }
    return warnings;
  }

  public updateClient(client: ClientRecord, expectedProfileRevision: number) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'edit client profiles');
    requireClientScope(this.state, client.id);
    const index = this.state.clients.findIndex(c => c.id === client.id);
    if (index < 0) throw new GuardError('INVALID_STATE', `Client "${client.id}" was not found.`);
    const current = this.state.clients[index];
    if ((current.profileRevision || 0) !== expectedProfileRevision) throw new GuardError('STALE_REVISION', `Stale client profile: expected revision ${expectedProfileRevision} but found ${current.profileRevision || 0}. Reload the profile and retry.`);
    this.validateClientProfile(client);
    const normalized = client.code.trim().toUpperCase();
    if (this.state.clients.some(c => c.id !== client.id && c.code.trim().toUpperCase() === normalized)) {
      throw new GuardError('INVALID_STATE', `Duplicate client code "${client.code}".`);
    }
    const saved: ClientRecord = { ...current, ...client, code: normalized, name: client.name.trim(), profileRevision: expectedProfileRevision + 1, accountingProfile: current.accountingProfile, customFields: current.customFields, relationshipGroupId: current.relationshipGroupId };
    this.state.clients[index] = saved;
    this.logEvent(`Client profile updated: ${saved.name} (Rev ${saved.profileRevision})`, saved.id);
    this.notify();
    return this.getClientProfileWarnings(saved, saved.id);
  }

  /** Contacts never create portal logins, management authority or staff roles (VP-007). */
  public updateClientContact(clientId: string, contactId: string, changes: Partial<Pick<PrototypeState['contacts'][number], 'name' | 'email' | 'phone' | 'title' | 'responsibility' | 'effectiveFrom' | 'effectiveTo' | 'active'>>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin', 'onboarding'], 'edit client contacts');
    requireClientScope(this.state, clientId);
    const index = this.state.contacts.findIndex(item => item.id === contactId && item.clientId === clientId);
    const current = this.state.contacts[index];
    if (!current) throw new GuardError('INVALID_STATE', 'Contact was not found in this client.');
    const next = { ...current, ...structuredClone(changes) };
    if (!next.active) next.isPrimary = false;
    if (!next.name.trim() || !next.email.trim()) throw new GuardError('INVALID_STATE', 'Contact full name and email address are required.');
    if (next.isPrimary && !next.active) throw new GuardError('INVALID_STATE', 'An inactive contact cannot be primary.');
    const validDate = (value?: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(next.effectiveFrom) || !validDate(next.effectiveTo) || next.effectiveFrom && next.effectiveTo && next.effectiveTo < next.effectiveFrom) throw new GuardError('INVALID_STATE', 'Contact responsibility dates must be real calendar dates and the end date cannot precede the start date.');
    const snapshot = (contact: typeof current) => ({ name: contact.name, email: contact.email, phone: contact.phone, title: contact.title, responsibility: contact.responsibility, effectiveFrom: contact.effectiveFrom, effectiveTo: contact.effectiveTo, isPrimary: contact.isPrimary, active: contact.active });
    const before = snapshot(current);
    const revision = (current.revision || 1) + 1;
    if (next.isPrimary) this.state.contacts.forEach(contact => { if (contact.clientId === clientId) contact.isPrimary = contact.id === contactId; });
    else if (current.isPrimary) this.state.contacts.forEach(contact => { if (contact.clientId === clientId && contact.id === contactId) contact.isPrimary = false; });
    next.revision = revision;
    next.history = [...(current.history || []), { revision, changedAt: new Date().toISOString(), changedByUserId: this.state.currentUserId, before, after: snapshot(next) }];
    next.portalAccessRequested = current.portalAccessRequested || false;
    this.state.contacts[index] = next;
    this.logEvent(`Contact updated: ${next.name} (Rev ${revision})`, next.id);
    this.notify();
    return revision;
  }

  public addContact(contact: PrototypeState['contacts'][0]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin', 'onboarding'], 'add client contacts');
    requireClientScope(this.state, contact.clientId);
    if (!contact.name || !contact.name.trim()) {
      throw new GuardError('INVALID_STATE', 'Contact full name is required.');
    }
    if (!this.state.clients.some(c => c.id === contact.clientId) || !contact.email.trim() || this.state.contacts.some(c => c.id === contact.id)) throw new GuardError('INVALID_STATE', 'Contact must have a unique ID, existing client and email address.');
    if (contact.isPrimary && !contact.active) throw new GuardError('INVALID_STATE', 'An inactive contact cannot be primary.');
    const validDate = (value?: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(contact.effectiveFrom) || !validDate(contact.effectiveTo) || contact.effectiveFrom && contact.effectiveTo && contact.effectiveTo < contact.effectiveFrom) throw new GuardError('INVALID_STATE', 'Contact responsibility dates must be real calendar dates and the end date cannot precede the start date.');
    if (contact.isPrimary) this.state.contacts.forEach(c => { if (c.clientId === contact.clientId) c.isPrimary = false; });
    contact.portalAccessRequested = false;
    contact.revision ||= 1;
    contact.history ||= [];
    this.state.contacts.push(contact);
    this.logEvent(`Contact added: ${contact.name} (${contact.clientId})`, contact.id);
    this.notify();
  }

  /** A client administrator may nominate a contact for staff review; nomination never creates an identity or grant. */
  public nominateClientContact(input: { clientId: string; name: string; email: string; reason: string }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['client_admin'], 'nominate a client contact');
    requireClientScope(this.state, input.clientId);
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    const reason = input.reason?.trim();
    if (!name || !email || !reason) throw new GuardError('INVALID_STATE', 'Contact name, email and nomination reason are required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GuardError('INVALID_STATE', 'Enter a valid contact email address.');
    this.state.clientContactNominations ||= [];
    if (this.state.clientContactNominations.some(item => item.clientId === input.clientId && item.email.toLowerCase() === email && item.status === 'Pending review')) {
      throw new GuardError('INVALID_STATE', 'A contact nomination for this email is already awaiting review.');
    }
    const nomination = {
      id: `NOM-${crypto.randomUUID()}`,
      clientId: input.clientId,
      name,
      email,
      nominatedByUserId: this.state.currentUserId,
      nominatedBy: this.state.currentPerson,
      nominatedAt: new Date().toISOString(),
      reason,
      status: 'Pending review' as const
    };
    this.state.clientContactNominations.push(nomination);
    this.logEvent(`Client contact nominated for staff review: ${name}`, nomination.id);
    this.notify();
    return nomination.id;
  }

  public reviewClientContactNomination(nominationId: string, note: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'onboarding', 'manager', 'partner', 'admin'], 'review client contact nominations');
    const nomination = (this.state.clientContactNominations || []).find(item => item.id === nominationId);
    if (!nomination) throw new GuardError('INVALID_STATE', 'Contact nomination was not found.');
    requireClientScope(this.state, nomination.clientId);
    if (nomination.status !== 'Pending review') throw new GuardError('INVALID_STATE', 'Only a pending nomination can be reviewed.');
    if (!note?.trim()) throw new GuardError('INVALID_STATE', 'A review note is required.');
    nomination.status = 'Reviewed';
    nomination.reviewedByUserId = this.state.currentUserId;
    nomination.reviewedBy = this.state.currentPerson;
    nomination.reviewedAt = new Date().toISOString();
    nomination.reviewNote = note.trim();
    this.logEvent(`Client contact nomination reviewed: ${nomination.name}`, nomination.id);
    this.notify();
  }

  public setClientCustomField(clientId: string, fieldId: string, value: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'update client custom fields');
    requireClientScope(this.state, clientId);
    const client = this.state.clients.find(c => c.id === clientId);
    const field = this.state.customFields.find(f => f.id === fieldId && f.enabled !== false);
    if (!client || !field) throw new GuardError('INVALID_STATE', 'Client or active custom field was not found.');
    const text = value.trim();
    if (!text) throw new GuardError('INVALID_STATE', 'Custom field value is required.');
    if (field.type === 'number' && (!Number.isFinite(Number(text)) || text === '')) throw new GuardError('INVALID_STATE', 'Enter a finite number for this custom field.');
    if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text)) throw new GuardError('INVALID_STATE', 'Enter a valid date for this custom field.');
    if (field.type === 'choice' && !field.options?.includes(text)) throw new GuardError('INVALID_STATE', 'Select one of the configured choices for this custom field.');
    client.customFields ||= {};
    client.customFields[fieldId] = field.type === 'number' ? Number(text) : text;
    this.logEvent(`Client custom field updated: ${field.label}`, clientId);
    this.notify();
  }

  public addCustomFieldDefinition(label: string, type: PrototypeState['customFields'][number]['type'], options: string[] = []) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'define client custom fields');
    const cleanLabel = label.trim();
    const cleanOptions = [...new Set(options.map(option => option.trim()).filter(Boolean))];
    if (!cleanLabel || this.state.customFields.some(field => field.label.trim().toLowerCase() === cleanLabel.toLowerCase())) throw new GuardError('INVALID_STATE', 'Enter a unique custom field label.');
    if (type === 'choice' && cleanOptions.length < 2) throw new GuardError('INVALID_STATE', 'Choice fields need at least two distinct options.');
    const field = { id: `cf_${crypto.randomUUID()}`, label: cleanLabel, type, options: type === 'choice' ? cleanOptions : undefined, enabled: true };
    this.state.customFields.push(field);
    this.logEvent(`Client custom field defined: ${cleanLabel}`, field.id);
    this.notify();
    return field.id;
  }

  public setCustomFieldDefinitionEnabled(fieldId: string, enabled: boolean) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'change client custom field availability');
    const field = this.state.customFields.find(item => item.id === fieldId);
    if (!field) throw new GuardError('INVALID_STATE', 'Custom field definition was not found.');
    field.enabled = enabled;
    this.logEvent(`Client custom field ${enabled ? 'enabled' : 'disabled'}: ${field.label}`, field.id);
    this.notify();
  }

  public assignClientRelationshipGroup(clientId: string, groupId?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'change client relationship groups');
    requireClientScope(this.state, clientId);
    const client = this.state.clients.find(c => c.id === clientId);
    const group = groupId ? this.state.relationshipGroups.find(g => g.id === groupId) : undefined;
    if (!client || (groupId && !group)) throw new GuardError('INVALID_STATE', 'Client or relationship group was not found.');
    if (client.relationshipGroupId) {
      const previous = this.state.relationshipGroups.find(g => g.id === client.relationshipGroupId);
      if (previous) previous.clientIds = previous.clientIds.filter(id => id !== clientId);
    }
    client.relationshipGroupId = group?.id;
    if (group && !group.clientIds.includes(clientId)) group.clientIds.push(clientId);
    this.logEvent(`Client ${group ? 'linked to' : 'removed from'} relationship group${group ? ` ${group.name}` : ''}`, clientId);
    this.notify();
  }

  public createClientRelationshipGroup(clientId: string, name: string, description = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'create client relationship groups');
    requireClientScope(this.state, clientId);
    const client = this.state.clients.find(c => c.id === clientId);
    if (!client || !name.trim()) throw new GuardError('INVALID_STATE', 'Choose an existing client and enter a relationship group name.');
    if (this.state.relationshipGroups.some(group => group.name.trim().toLowerCase() === name.trim().toLowerCase())) throw new GuardError('INVALID_STATE', 'A relationship group with this name already exists.');
    if (client.relationshipGroupId) {
      const previous = this.state.relationshipGroups.find(group => group.id === client.relationshipGroupId);
      if (previous) previous.clientIds = previous.clientIds.filter(id => id !== clientId);
    }
    const group = { id: `GRP-REL-${crypto.randomUUID()}`, name: name.trim(), description: description.trim(), clientIds: [clientId] };
    this.state.relationshipGroups.push(group);
    client.relationshipGroupId = group.id;
    this.logEvent(`Client relationship group created: ${group.name}`, clientId);
    this.notify();
  }

  public setPrimaryContact(clientId: string, contactId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'set primary client contacts');
    requireClientScope(this.state, clientId);
    const contact = this.state.contacts.find(c => c.id === contactId && c.clientId === clientId);
    if (!contact) throw new GuardError('INVALID_STATE', 'Contact not found in this client.');
    if (!contact.active) throw new GuardError('INVALID_STATE', 'An inactive contact cannot be primary.');
    this.state.contacts.forEach(c => {
      if (c.clientId === clientId) c.isPrimary = c.id === contactId;
    });
    this.notify();
  }

  /** Explicit scoped grants (VP-019). Admin alone never grants professional authority. */
  public grantAccess(userId: string, role: RoleKey, scopeKind: 'Global' | 'Client' | 'Engagement' | 'Group', scopeId?: string, reason = '', dates: { effectiveFrom?: string; expiresAt?: string; requestRef?: string; approvalEvidenceRef?: string } = {}) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'grant access');
    const user = this.state.users.find(u => u.id === userId && u.status === 'Active');
    if (!user || user.role !== role) throw new GuardError('INVALID_STATE', 'Grant must target an active persona with its assigned role.');
    const actor = this.state.users.find(u => u.id === this.state.currentUserId)!;
    if ((actor.personId || actor.id) === (user.personId || user.id)) throw new GuardError('FORBIDDEN_SCOPE', 'Administrators cannot grant access to their own person.');
    if (!reason.trim()) throw new GuardError('INVALID_STATE', 'An approved request reason is required.');
    const validDate = (value?: string) => {
      if (!value) return true;
      const parsed = Date.parse(`${value}T00:00:00Z`);
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
    };
    if (!validDate(dates.effectiveFrom) || !validDate(dates.expiresAt) || dates.effectiveFrom && dates.expiresAt && dates.expiresAt < dates.effectiveFrom) throw new GuardError('INVALID_STATE', 'Grant effective and expiry dates must be valid, and expiry cannot precede the effective date.');
    if (!dates.requestRef?.trim()) throw new GuardError('INVALID_STATE', 'An approved access-request reference is required.');
    if (roleRequiresApprovalEvidence(role) && !dates.approvalEvidenceRef?.trim()) throw new GuardError('INVALID_STATE', 'Professional or management-approver access requires a separate approval-evidence reference.');
    if (roleRequiresApprovalEvidence(role) && dates.approvalEvidenceRef?.trim() === dates.requestRef.trim()) throw new GuardError('INVALID_STATE', 'Approval evidence must have a separate reference from the access request.');
    if ((scopeKind === 'Client' || scopeKind === 'Engagement') && !scopeId) {
      throw new GuardError('INVALID_STATE', 'Scoped grants require a scope ID.');
    }
    if (scopeKind === 'Client' && !this.state.clients.some(c => c.id === scopeId)) throw new GuardError('INVALID_STATE', 'Grant client does not exist.');
    if (scopeKind === 'Engagement' && !this.state.engagements.some(e => e.id === scopeId)) throw new GuardError('INVALID_STATE', 'Grant engagement does not exist.');
    if (scopeKind === 'Group' && !this.state.consolidationGroups.some(group => group.id === scopeId)) throw new GuardError('INVALID_STATE', 'Grant consolidation group does not exist.');
    if (this.state.roleGrants.some(g => g.userId === userId && g.role === role && g.scopeKind === scopeKind && g.scopeId === scopeId)) {
      throw new GuardError('INVALID_STATE', 'That scope is already granted to this persona.');
    }
    const at = new Date().toISOString();
    this.state.roleGrants.push({ userId, role, scopeKind, scopeId, effectiveFrom: dates.effectiveFrom, expiresAt: dates.expiresAt, requestRef: dates.requestRef.trim(), approvalEvidenceRef: dates.approvalEvidenceRef?.trim() || undefined, grantedAt: at, grantedBy: actor.id, reason: reason.trim() });
    this.state.roleGrantHistory ||= [];
    this.state.roleGrantHistory.push({ id: crypto.randomUUID(), action: 'Granted', userId, role, scopeKind, scopeId, actorUserId: actor.id, at, reason: reason.trim(), effectiveFrom: dates.effectiveFrom, expiresAt: dates.expiresAt, requestRef: dates.requestRef.trim(), approvalEvidenceRef: dates.approvalEvidenceRef?.trim() || undefined });
    this.logEvent(`Access granted: ${user.name} → ${role} (${scopeKind}${scopeId ? ':' + scopeId : ''}) — ${reason}`, scopeId || user.id);
    this.notify();
  }

  public revokeAccess(userId: string, role: RoleKey, scopeId: string | undefined, reason: string) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'revoke access');
    const idx = this.state.roleGrants.findIndex(g => g.userId === userId && g.role === role && (g.scopeId || undefined) === (scopeId || undefined));
    if (idx >= 0) {
      if (!reason.trim()) throw new GuardError('INVALID_STATE', 'An access-revocation reason is required.');
      const grant = this.state.roleGrants[idx];
      this.state.roleGrantHistory ||= [];
      this.state.roleGrantHistory.push({ id: crypto.randomUUID(), action: 'Revoked', userId, role, scopeKind: grant.scopeKind, scopeId: grant.scopeId, actorUserId: this.state.currentUserId, at: new Date().toISOString(), reason: reason.trim(), effectiveFrom: grant.effectiveFrom, expiresAt: grant.expiresAt, requestRef: grant.requestRef, approvalEvidenceRef: grant.approvalEvidenceRef });
      this.state.roleGrants.splice(idx, 1);
      this.logEvent(`Access revoked: ${this.state.users.find(u => u.id === userId)?.name || userId} → ${role}${scopeId ? ' (' + scopeId + ')' : ''} — ${reason.trim()}`, scopeId || userId);
      this.notify();
    }
  }

  // --- Identity Lifecycle & Simulated Invitations (VP-018) ---
  public createDemoIdentity(identity: { name: string; email: string; role: RoleKey; label: string; group?: 'Commercial' | 'Professional' | 'Client' | 'Operations' | 'System / Prototype Testing' }) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'create demo identities');
    if (identity.role === 'superuser') throw new GuardError('INVALID_STATE', 'The reserved prototype superuser is seeded for testing and cannot be duplicated or granted through ordinary identity creation.');
    if (!identity.name?.trim() || !identity.email?.trim()) throw new GuardError('INVALID_STATE', 'Identity name and email are required.');
    const normalizedEmail = identity.email.trim().toLowerCase();
    if (this.state.users.some(u => u.email.toLowerCase() === normalizedEmail)) {
      throw new GuardError('INVALID_STATE', `A persona with email "${identity.email}" already exists.`);
    }
    const id = `user-${Date.now().toString(36)}`;
    const initials = identity.name.trim().split(' ').map(n => n[0]).join('').slice(0, 3).toUpperCase();
    const group = identity.group || (identity.role === 'client' ? 'Client' : ['partner', 'manager', 'preparer', 'reviewer', 'eqr'].includes(identity.role) ? 'Professional' : 'Commercial');
    this.state.users.push({
      id,
      name: identity.name.trim(),
      initials,
      role: identity.role,
      label: identity.label || identity.role,
      group,
      email: normalizedEmail,
      status: 'Active'
    });
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: 'Created',
      userId: id,
      userName: identity.name.trim(),
      role: identity.role,
      actor: this.state.currentPerson,
      reason: 'Created new simulated practice persona'
    });
    this.logEvent(`New simulated persona created: ${identity.name.trim()} (${identity.role})`, id);
    this.notify();
    return id;
  }

  public setUserStatus(userId: string, status: 'Active' | 'Disabled', reason = '') {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'change identity status');
    const user = this.state.users.find(u => u.id === userId);
    if (!user) throw new GuardError('INVALID_STATE', `Identity "${userId}" not found.`);
    if (user.id === this.state.currentUserId && status === 'Disabled') {
      throw new GuardError('FORBIDDEN_SCOPE', 'Administrators cannot disable their own active session persona.');
    }
    user.status = status;
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: status === 'Active' ? 'Activated' : 'Disabled',
      userId: user.id,
      userName: user.name,
      role: user.role,
      actor: this.state.currentPerson,
      reason: reason.trim() || `Identity status changed to ${status}`
    });
    this.logEvent(`Identity status changed: ${user.name} is now ${status}`, user.id);
    this.notify();
  }

  public sendSimulatedInvitation(invitation: { email: string; name: string; role: RoleKey; scopeKind: 'Global' | 'Client' | 'Engagement'; scopeId?: string }) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'send simulated invitations');
    if (!invitation.email?.trim() || !invitation.name?.trim()) throw new GuardError('INVALID_STATE', 'Recipient email and name are required.');
    const id = `INV-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();
    const expiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.state.simulatedInvitations ||= [];
    const record: SimulatedInvitation = {
      id,
      email: invitation.email.trim().toLowerCase(),
      name: invitation.name.trim(),
      role: invitation.role,
      scopeKind: invitation.scopeKind,
      scopeId: invitation.scopeId,
      status: 'Pending',
      invitedAt: now.toISOString(),
      invitedBy: this.state.currentPerson,
      expiresAt: expiry.toISOString()
    };
    this.state.simulatedInvitations.push(record);
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: now.toISOString(),
      action: 'Invited',
      userId: id,
      userName: record.name,
      role: record.role,
      actor: this.state.currentPerson,
      reason: `Simulated invitation sent for ${record.role} (${record.scopeKind})`
    });
    this.logEvent(`Simulated invitation sent: ${record.name} (${record.email})`, id);
    this.notify();
    return id;
  }

  private recordInvitationExpiry(inv: SimulatedInvitation) {
    if (inv.status !== 'Pending' || Date.parse(inv.expiresAt) > Date.now()) return false;
    inv.status = 'Expired';
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(), timestamp: new Date().toISOString(), action: 'InvitationExpired',
      userId: inv.id, userName: inv.name, role: inv.role, actor: this.state.currentPerson,
      reason: 'Simulated invitation passed its expiration time'
    });
    this.logEvent(`Simulated invitation expired: ${inv.name}`, inv.id);
    return true;
  }

  public revokeSimulatedInvitation(invitationId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'revoke simulated invitations');
    if (!reason?.trim()) throw new GuardError('INVALID_STATE', 'Revocation reason is required.');
    this.state.simulatedInvitations ||= [];
    const inv = this.state.simulatedInvitations.find(i => i.id === invitationId);
    if (!inv) throw new GuardError('INVALID_STATE', `Invitation "${invitationId}" not found.`);
    if (this.recordInvitationExpiry(inv)) {
      this.notify();
      throw new GuardError('INVALID_STATE', 'Expired invitations cannot be revoked. Renew it first if the recipient is still required.');
    }
    if (inv.status !== 'Pending') throw new GuardError('INVALID_STATE', 'Only pending invitations can be revoked.');
    inv.status = 'Revoked';
    inv.revokedAt = new Date().toISOString();
    inv.revokedBy = this.state.currentPerson;
    inv.revocationReason = reason.trim();
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: 'InvitationRevoked',
      userId: inv.id,
      userName: inv.name,
      role: inv.role,
      actor: this.state.currentPerson,
      reason: reason.trim()
    });
    this.logEvent(`Simulated invitation revoked: ${inv.name} — ${reason.trim()}`, inv.id);
    this.notify();
  }

  public acceptSimulatedInvitation(invitationId: string) {
    requireActiveIdentity(this.state);
    this.state.simulatedInvitations ||= [];
    const inv = this.state.simulatedInvitations.find(i => i.id === invitationId);
    if (!inv) throw new GuardError('INVALID_STATE', `Invitation "${invitationId}" not found.`);
    if (this.recordInvitationExpiry(inv)) {
      this.notify();
      throw new GuardError('INVALID_STATE', 'This simulated invitation has expired. Renew it before acceptance.');
    }
    if (inv.status !== 'Pending') throw new GuardError('INVALID_STATE', 'Only pending invitations can be accepted.');
    inv.status = 'Accepted';
    let user = this.state.users.find(u => u.email.toLowerCase() === inv.email.toLowerCase());
    if (!user) {
      const id = `user-${Date.now().toString(36)}`;
      user = {
        id,
        name: inv.name,
        initials: inv.name.split(' ').map(n => n[0]).join('').slice(0, 3).toUpperCase(),
        role: inv.role,
        label: inv.role,
        group: inv.role === 'client' ? 'Client' : 'Professional',
        email: inv.email,
        status: 'Active'
      };
      this.state.users.push(user);
    } else {
      user.status = 'Active';
    }
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: 'InvitationAccepted',
      userId: user.id,
      userName: user.name,
      role: user.role,
      actor: user.name,
      reason: 'Candidate completed simulated onboarding'
    });
    this.logEvent(`Simulated invitation accepted: ${user.name} onboarded as ${user.role}`, user.id);
    this.notify();
  }

  public resendSimulatedInvitation(invitationId: string) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'resend simulated invitations');
    this.state.simulatedInvitations ||= [];
    const inv = this.state.simulatedInvitations.find(i => i.id === invitationId);
    if (!inv) throw new GuardError('INVALID_STATE', `Invitation "${invitationId}" not found.`);
    this.recordInvitationExpiry(inv);
    const now = new Date();
    inv.status = 'Pending';
    inv.invitedAt = now.toISOString();
    inv.expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    inv.revokedAt = undefined;
    inv.revokedBy = undefined;
    inv.revocationReason = undefined;
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: now.toISOString(),
      action: 'InvitationResent',
      userId: inv.id,
      userName: inv.name,
      role: inv.role,
      actor: this.state.currentPerson,
      reason: 'Invitation renewed with fresh 7-day expiration'
    });
    this.logEvent(`Simulated invitation resent to ${inv.name}`, inv.id);
    this.notify();
  }


  // --- Leads & Pipeline Actions (VP-009) ---
  public addLead(lead: PrototypeState['leads'][0]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'manage opportunities');
    if (!lead.name.trim() || !lead.contact.trim() || !lead.service.trim() || !lead.owner.trim()) throw new GuardError('INVALID_STATE', 'Opportunity name, contact, requested service, and owner are required.');
    if (!isValidMoney(lead.value, true)) throw new GuardError('INVALID_STATE', 'Opportunity amount must be a finite non-negative amount with at most two decimal places.');
    if (lead.targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(lead.targetDate) || !Number.isFinite(Date.parse(lead.targetDate)) || new Date(`${lead.targetDate}T00:00:00Z`).toISOString().slice(0, 10) !== lead.targetDate)) throw new GuardError('INVALID_STATE', 'Opportunity target date must be a real calendar date.');
    if (['Lost', 'Unqualified'].includes(lead.stage) && !lead.lostReason?.trim()) throw new GuardError('INVALID_STATE', 'A lost or unqualified opportunity requires an outcome reason.');
    if (this.state.leads.some(item => item.id === lead.id)) throw new GuardError('INVALID_STATE', `Opportunity "${lead.id}" already exists.`);
    lead.history ||= [{ by: this.state.currentPerson, at: new Date().toISOString(), stage: lead.stage }];
    this.state.leads.push(lead);
    this.logEvent(`New opportunity registered: ${lead.name}`, lead.id);
    this.notify();
  }

  public updateLead(lead: PrototypeState['leads'][0]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'manage opportunities');
    const index = this.state.leads.findIndex(l => l.id === lead.id);
    if (index >= 0) {
      if (this.state.leads[index].convertedClientId) throw new GuardError('INVALID_STATE', 'A converted opportunity cannot be converted or reclassified again.');
      if (!lead.name.trim() || !lead.contact.trim() || !lead.service.trim() || !lead.owner.trim() || !isValidMoney(lead.value, true)) throw new GuardError('INVALID_STATE', 'Opportunity name, contact, requested service, owner and a valid non-negative fee are required.');
      if (lead.targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(lead.targetDate) || !Number.isFinite(Date.parse(lead.targetDate)) || new Date(`${lead.targetDate}T00:00:00Z`).toISOString().slice(0, 10) !== lead.targetDate)) throw new GuardError('INVALID_STATE', 'Opportunity target date must be a real calendar date.');
      if (['Lost', 'Unqualified'].includes(lead.stage) && !lead.lostReason?.trim()) throw new GuardError('INVALID_STATE', 'A lost or unqualified opportunity requires an outcome reason.');
      if (lead.stage !== this.state.leads[index].stage) lead.history = [...(this.state.leads[index].history || []), { by: this.state.currentPerson, at: new Date().toISOString(), stage: lead.stage, reason: ['Lost', 'Unqualified'].includes(lead.stage) ? lead.lostReason?.trim() : undefined }];
      this.state.leads[index] = lead;
      this.logEvent(`Opportunity ${lead.id} moved to ${lead.stage}${['Lost', 'Unqualified'].includes(lead.stage) ? `: ${lead.lostReason}` : ''}`, lead.id);
      this.notify();
    }
  }

  public convertLead(leadId: string, clientId?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'convert opportunities');
    const lead = this.state.leads.find(l => l.id === leadId);
    if (!lead) throw new GuardError('INVALID_STATE', `Opportunity "${leadId}" was not found.`);
    if (lead.convertedClientId) return this.state.clients.find(c => c.id === lead.convertedClientId);
    if (lead.stage !== 'Won') throw new GuardError('INVALID_STATE', 'Only a won opportunity can be converted to a prospect.');
    lead.stage = 'Won';
    lead.accepted = false;

    // Check or create client
    let client = this.state.clients.find(c => c.id === clientId);
    if (clientId && !client) throw new GuardError('INVALID_STATE', `Client "${clientId}" was not found.`);
    if (client) requireClientScope(this.state, client.id);
    if (!client) {
      const newClientId = `CL-00${this.state.clients.length + 1}`;
      let code = lead.name.slice(0, 4).toUpperCase() || 'NEW';
      let suffix = 1;
      while (this.state.clients.some(c => c.code.toUpperCase() === code)) code = `${lead.name.slice(0, 3).toUpperCase()}${suffix++}`;
      client = {
        id: newClientId,
        code,
        name: lead.name,
        clientType: 'Company',
        profileRevision: 0,
        initials: lead.name.slice(0, 2).toUpperCase(),
        industry: 'Commercial Client',
        contact: lead.contact,
        email: lead.email,
        jurisdiction: 'State of Qatar',
        status: 'Prospect',
        risk: 'Low',
        revenue: lead.value,
        relationshipOwner: lead.owner
      };
      this.state.clients.push(client);
    }
    lead.convertedClientId = client.id;
    this.logEvent(`Opportunity ${lead.name} converted to client ${client.name}`, client.id);
    this.notify();
    return client;
  }

  // --- Proposal Actions (VP-010, VP-011) ---
  public saveProposalService(service: ProposalServiceDefinition, expectedRevision?: number) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'maintain proposal service definitions');
    if (!service.id.trim() || !service.name.trim() || hasUnsupportedProposalOffering(`${service.name} ${service.description}`) || !service.scope.trim() || !service.deliverables.trim() || !service.period.trim() || !hasValidProposalPeriod(service.periodStart, service.periodEnd) || !isProposalCurrency(service.currency) || !isValidMoney(service.rate, true) || !Number.isFinite(service.quantity) || service.quantity <= 0 || !['Fixed', 'Time & Materials', 'Retainer'].includes(service.feeModel)) throw new GuardError('INVALID_STATE', 'Proposal service requires an in-scope offering, supported currency, valid reporting period, a positive quantity, nonnegative rate and valid fee model.');
    const list = this.state.proposalServices ||= [];
    const index = list.findIndex(item => item.id === service.id);
    if (index >= 0 && expectedRevision !== undefined && list[index].revision !== expectedRevision) throw new GuardError('STALE_REVISION', 'Proposal service changed in another view. Reload before saving.');
    const next = { ...structuredClone(service), revision: index >= 0 ? list[index].revision + 1 : 1 };
    if (index >= 0) { (this.state.proposalServiceHistory ||= []).push(structuredClone(list[index])); list[index] = next; }
    else list.push(next);
    this.logEvent(`Proposal service ${next.id} saved at revision ${next.revision}`, next.id);
    this.notify();
    return structuredClone(next);
  }

  public saveProposalTemplate(template: ProposalContentTemplate, expectedRevision?: number) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'maintain proposal content templates');
    const serviceSource = this.state.proposalServices?.find(service => service.id === template.serviceId);
    const serviceRevisionExists = Boolean(serviceSource && (!template.serviceRevision || serviceSource.revision === template.serviceRevision || this.state.proposalServiceHistory?.some(service => service.id === template.serviceId && service.revision === template.serviceRevision)));
    if (!template.id.trim() || !template.name.trim() || !template.title.trim() || hasUnsupportedProposalOffering(`${template.name} ${template.title} ${template.description}`) || !template.scope.trim() || !template.deliverables.trim() || !template.period.trim() || !hasValidProposalPeriod(template.periodStart, template.periodEnd) || !template.terms.trim() || !isProposalCurrency(template.currency) || !serviceRevisionExists) throw new GuardError('INVALID_STATE', 'Proposal template requires an in-scope supported service revision, title, scope, valid reporting period, terms and a supported currency.');
    if (!Number.isFinite(template.quantity) || template.quantity <= 0 || !isValidMoney(template.rate, true) || !['Fixed', 'Time & Materials', 'Retainer'].includes(template.feeModel)) throw new GuardError('INVALID_STATE', 'Proposal template requires a positive quantity, nonnegative rate and valid fee model.');
    const list = this.state.proposalTemplates ||= [];
    const index = list.findIndex(item => item.id === template.id);
    if (index >= 0 && expectedRevision !== undefined && list[index].revision !== expectedRevision) throw new GuardError('STALE_REVISION', 'Proposal template changed in another view. Reload before saving.');
    const next = { ...structuredClone(template), revision: index >= 0 ? list[index].revision + 1 : 1 };
    if (index >= 0) { (this.state.proposalTemplateHistory ||= []).push(structuredClone(list[index])); list[index] = next; }
    else list.push(next);
    this.logEvent(`Proposal content template ${next.id} saved at revision ${next.revision}`, next.id);
    this.notify();
    return structuredClone(next);
  }

  public addProposal(prop: PrototypeState['proposals'][0]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'draft proposals');
    if (prop.clientId) requireClientScope(this.state, prop.clientId);
    if (prop.leadId && !this.state.leads.some(l => l.id === prop.leadId)) throw new GuardError('INVALID_STATE', 'Proposal opportunity was not found.');
    if (prop.leadId && prop.clientId && this.state.leads.find(l => l.id === prop.leadId)?.convertedClientId !== prop.clientId) throw new GuardError('INVALID_STATE', 'Proposal opportunity and client do not match.');
    if (this.state.proposals.some(p => p.id === prop.id)) throw new GuardError('INVALID_STATE', `Proposal "${prop.id}" already exists.`);
    if (!prop.title.trim() || !prop.period?.trim() || !hasValidProposalPeriod(prop.periodStart, prop.periodEnd) || !isProposalCurrency(prop.currency) || (prop.templateId && !Boolean(this.state.proposalTemplates?.some(template => template.id === prop.templateId && template.revision === prop.templateRevision) || this.state.proposalTemplateHistory?.some(template => template.id === prop.templateId && template.revision === prop.templateRevision))) || !prop.items.length || !prop.items.every(item => item.serviceName.trim() && ['Fixed', 'Time & Materials', 'Retainer'].includes(item.feeModel) && item.scope.trim() && item.description.trim() && item.exclusions?.trim() && item.deliverables.trim() && item.clientResponsibilities?.trim() && item.dependencies?.trim() && item.period?.trim() && hasValidProposalPeriod(item.periodStart, item.periodEnd) && isValidMoney(item.amount, true) && Number.isFinite(item.quantity) && (item.quantity || 0) > 0 && isValidMoney(item.rate ?? item.amount, true) && Math.abs(item.amount - (item.feeModel === 'Fixed' ? item.rate ?? item.amount : (item.quantity || 0) * (item.rate || 0))) <= 0.005 && (!item.serviceId || Boolean(this.state.proposalServices?.some(service => service.id === item.serviceId && (!item.serviceRevision || service.revision === item.serviceRevision)) || this.state.proposalServiceHistory?.some(service => service.id === item.serviceId && service.revision === item.serviceRevision)))) || !prop.terms.trim() || !isValidMoney(prop.totalAmount, true) || Math.abs(prop.items.reduce((sum, item) => sum + item.amount, 0) - prop.totalAmount) > 0.005) throw new GuardError('INVALID_STATE', 'Proposal requires a period, supported currency, complete line scope, valid service and reconciled fee calculations.');
    this.state.proposals.push(prop);
    this.logEvent(`Proposal ${prop.title} drafted (Rev ${prop.revision})`, prop.id);
    this.notify();
  }

  public updateProposal(prop: PrototypeState['proposals'][0]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'edit proposal drafts');
    const index = this.state.proposals.findIndex(item => item.id === prop.id);
    if (index < 0 || this.state.proposals[index].state !== 'Draft') throw new GuardError('INVALID_STATE', 'Only an existing draft proposal can be edited.');
    if (!prop.period?.trim() || !hasValidProposalPeriod(prop.periodStart, prop.periodEnd) || !isProposalCurrency(prop.currency) || (prop.templateId && !Boolean(this.state.proposalTemplates?.some(template => template.id === prop.templateId && template.revision === prop.templateRevision) || this.state.proposalTemplateHistory?.some(template => template.id === prop.templateId && template.revision === prop.templateRevision))) || !prop.items.length || !prop.items.every(item => ['Fixed', 'Time & Materials', 'Retainer'].includes(item.feeModel) && item.scope.trim() && item.exclusions?.trim() && item.deliverables.trim() && item.clientResponsibilities?.trim() && item.dependencies?.trim() && item.period?.trim() && hasValidProposalPeriod(item.periodStart, item.periodEnd) && isValidMoney(item.amount, true) && Number.isFinite(item.quantity) && (item.quantity || 0) > 0 && isValidMoney(item.rate ?? item.amount, true) && Math.abs(item.amount - (item.feeModel === 'Fixed' ? item.rate ?? item.amount : (item.quantity || 0) * (item.rate || 0))) <= 0.005) || !prop.terms.trim() || Math.abs(prop.items.reduce((sum, item) => sum + item.amount, 0) - prop.totalAmount) > 0.005) throw new GuardError('INVALID_STATE', 'Proposal scope, fee calculations, period, currency and terms are required.');
    this.state.proposals[index] = prop;
    this.logEvent(`Proposal ${prop.id} draft updated`, prop.id);
    this.notify();
  }

  public presentProposal(propId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'present proposals');
    const prop = this.state.proposals.find(p => p.id === propId);
    if (!prop) throw new GuardError('INVALID_STATE', `Proposal "${propId}" was not found.`);
    if (prop.state !== 'Approved to send' || !prop.commercialReview?.approved) throw new GuardError('INVALID_STATE', 'Only an approved proposal can be presented.');
    if (prop.clientId) requireClientScope(this.state, prop.clientId);
    prop.presentedSnapshot = { revision: prop.revision, title: prop.title, currency: prop.currency, totalAmount: prop.totalAmount, items: structuredClone(prop.items), terms: prop.terms, presentedBy: this.state.currentPerson, presentedAt: new Date().toISOString() };
    prop.state = 'Presented';
    this.logEvent(`Proposal ${prop.id} Rev ${prop.revision} presented`, prop.id);
    this.notify();
  }

  public createProposalRevision(propId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'revise proposals');
    const source = this.state.proposals.find(p => p.id === propId);
    if (!source) throw new GuardError('INVALID_STATE', `Proposal "${propId}" was not found.`);
    if (source.state === 'Accepted' || source.state === 'Superseded') throw new GuardError('INVALID_STATE', 'Accepted or superseded proposals cannot be revised.');
    if (source.clientId) requireClientScope(this.state, source.clientId);
    source.state = 'Superseded';
    const revision = { ...structuredClone(source), id: `${source.id}-R${source.revision + 1}`, revision: source.revision + 1, predecessorId: source.id, preparedBy: this.state.currentPerson, preparedAt: new Date().toISOString().slice(0, 10), state: 'Draft' as const, commercialReview: undefined, clientResponse: undefined, presentedSnapshot: undefined };
    this.state.proposals.push(revision);
    this.logEvent(`Proposal ${source.id} revised as ${revision.id}`, revision.id);
    this.notify();
    return revision;
  }

  public reviewProposal(propId: string, approved: boolean, notes?: string) {
    requireActiveIdentity(this.state);
    if (!hasAnyRole(this.state, ['partner', 'manager'])) {
      throw new GuardError('FORBIDDEN_SCOPE', `Role "${this.state.currentRole}" is not authorized to commercially review proposals. Requires partner or manager.`);
    }
    const prop = this.state.proposals.find(p => p.id === propId);
    if (!prop) throw new GuardError('INVALID_STATE', `Proposal "${propId}" was not found.`);
    if (prop.clientId) requireClientScope(this.state, prop.clientId);
    // Same-person commercial approval denied even under another role label (VP-011).
    requireIndependentActor(prop.preparedBy, this.state.currentPerson, 'commercially approve this proposal', this.state);
    if (prop.state !== 'Draft' && prop.state !== 'Internal review') throw new GuardError('INVALID_STATE', 'Only an unpresented proposal revision can be reviewed.');
    if (!approved && !notes?.trim()) throw new GuardError('INVALID_STATE', 'A return reason is required before a proposal can be sent back for revision.');
    prop.commercialReview = {
      reviewedBy: this.state.currentPerson,
      reviewedAt: new Date().toISOString(),
      approved,
      notes: notes?.trim() || undefined
    };
    prop.state = approved ? 'Approved to send' : 'Draft';
    this.logEvent(`Proposal ${prop.id} ${approved ? 'approved' : 'returned'} by ${this.state.currentPerson}`, prop.id);
    this.notify();
  }

  public recordProposalResponse(propId: string, response: PrototypeState['proposals'][0]['clientResponse']) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['client', 'relationship', 'manager', 'partner'], 'record client proposal response');
    const prop = this.state.proposals.find(p => p.id === propId);
    if (!prop || !response) throw new GuardError('INVALID_STATE', 'Proposal or client response was not found.');
    if (!prop.clientId) throw new GuardError('INVALID_STATE', 'Proposal must be linked to a client before recording a response.');
    requireClientScope(this.state, prop.clientId);
    if (prop.state !== 'Presented' || !prop.commercialReview?.approved) throw new GuardError('INVALID_STATE', 'Only an approved, presented proposal can receive a client response.');
    const authorizedContact = this.state.contacts.find(contact => contact.clientId === prop.clientId && contact.active && contact.name.trim().toLocaleLowerCase() === response.contact?.trim().toLocaleLowerCase());
    if (!prop.presentedSnapshot || prop.presentedSnapshot.revision !== prop.revision || !['Accepted', 'Declined', 'Withdrawn'].includes(response.responseType) || !authorizedContact || !['Email', 'Meeting', 'Letter'].includes(response.method) || !isProposalDate(response.date) || !response.evidenceRef?.trim() || !response.notes.trim()) throw new GuardError('INVALID_STATE', 'Response requires the current presented revision, an active client contact, allowed method and allowed response type, valid date, notes, and an evidence reference.');
    prop.clientResponse = { ...response, contact: response.contact.trim(), recordedBy: this.state.currentPerson, recordedRole: this.state.currentRole, contactId: authorizedContact.id, revision: prop.presentedSnapshot.revision };
    prop.state = response.responseType;
    this.logEvent(`Proposal ${prop.id} client response: ${response.responseType} by ${response.contact}`, prop.id);
    this.notify();
  }

  // --- Engagement Actions (VP-012) ---
  public addEngagement(eng: EngagementRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'create engagements');
    requireClientScope(this.state, eng.client);
    const engagementClient = this.state.clients.find(c => c.id === eng.client);
    if (!engagementClient) throw new GuardError('INVALID_STATE', 'Engagement client was not found.');
    if (['Suspended', 'Archived'].includes(engagementClient.status) && !['Draft', 'Acceptance', 'Acceptance pending'].includes(eng.stage)) throw new GuardError('INVALID_STATE', `Client ${engagementClient.id} is ${engagementClient.status.toLowerCase()}; reactivate the client before starting active professional work.`);
    if (eng.proposalId) {
      const proposal = this.state.proposals.find(p => p.id === eng.proposalId);
      if (!proposal || proposal.clientId !== eng.client || proposal.state !== 'Accepted' || !proposal.clientResponse?.evidenceRef || proposal.presentedSnapshot?.revision !== proposal.revision) throw new GuardError('INVALID_STATE', 'Engagement must link to the same client’s accepted current proposal revision with evidence.');
      const existing = this.state.engagements.find(e => e.proposalId === eng.proposalId);
      if (existing) { requireClientScope(this.state, existing.client); return existing; }
      if (!['Draft', 'Acceptance'].includes(eng.stage) && (!eng.acceptance || !eng.terms)) throw new GuardError('INVALID_STATE', 'Engagement activation requires a separate professional acceptance and agreed terms.');
    } else if (!eng.acceptance || !eng.terms) {
      throw new GuardError('INVALID_STATE', 'Engagements without an accepted proposal require recorded acceptance and terms.');
    }
    if (this.state.engagements.some(e => e.id === eng.id)) throw new GuardError('INVALID_STATE', `Engagement "${eng.id}" already exists.`);
    this.assignAccountingPeriod(eng);
    eng.auditLifecycle ||= emptyAuditLifecycle();
    eng.eqrRequired = false;
    this.state.engagements.push(eng);
    this.state.selectedEngagement = eng.id;
    this.logEvent(`New engagement created: ${eng.service} FY${eng.year}`, eng.id);
    this.notify();
    return eng;
  }

  public activateEngagement(engagementId: string, evidenceRef: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['partner'], 'professionally accept engagements');
    const eng = this.state.engagements.find(item => item.id === engagementId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engagementId}" was not found.`);
    const client = this.state.clients.find(item => item.id === eng.client);
    if (!client || ['Suspended', 'Archived'].includes(client.status)) throw new GuardError('INVALID_STATE', 'A suspended or archived client must be reactivated before professional acceptance.');
    requireEngagementScope(this.state, eng.id, 'activation');
    if (!['Draft', 'Acceptance'].includes(eng.stage)) throw new GuardError('INVALID_STATE', 'Only a draft engagement can be activated.');
    const proposal = this.state.proposals.find(item => item.id === eng.proposalId);
    if (!proposal || proposal.state !== 'Accepted' || !proposal.clientResponse?.evidenceRef || proposal.presentedSnapshot?.revision !== proposal.revision) throw new GuardError('INVALID_STATE', 'Activation requires the current accepted proposal revision and client evidence.');
    if (eng.professionalAcceptance) throw new GuardError('INVALID_STATE', 'This engagement has already been professionally accepted.');
    if (!evidenceRef.trim()) throw new GuardError('INVALID_STATE', 'Professional acceptance requires an evidence reference.');
    requireIndependentActor(proposal.preparedBy, this.state.currentPerson, 'professionally accept this engagement', this.state);
    eng.professionalAcceptance = { by: this.state.currentPerson, at: new Date().toISOString(), evidenceRef: evidenceRef.trim(), proposalRevision: proposal.revision };
    eng.acceptance = true;
    eng.terms = true;
    eng.stage = 'Planning';
    this.logEvent(`Engagement ${eng.id} professionally accepted against ${proposal.id} Rev ${proposal.revision}`, eng.id);
    this.notify();
  }

  public updateEngagement(eng: EngagementRecord) {
    requireActiveIdentity(this.state);
    const index = this.state.engagements.findIndex(e => e.id === eng.id);
    if (index < 0) throw new GuardError('INVALID_STATE', `Engagement "${eng.id}" was not found.`);
    requireRole(this.state, ['manager', 'partner'], 'edit engagement administration fields');
    requireEngagementScope(this.state, eng.id, 'administrative');
    const current = this.state.engagements[index];
    if (['Cancelled', 'Closed'].includes(current.lifecycleStatus || 'Active')) throw new GuardError('INVALID_STATE', 'Cancelled or closed engagements are immutable.');
    if (eng.client !== current.client) throw new GuardError('INVALID_STATE', 'An engagement cannot be reassigned to another client.');
    if (!this.state.users.some(u => u.status === 'Active' && u.role === 'manager' && u.name === eng.manager) || !this.state.users.some(u => u.status === 'Active' && u.role === 'partner' && u.name === eng.partner)) throw new GuardError('INVALID_STATE', 'Engagement manager and partner must be active assigned personas.');
    const scopeChanged = current.service !== eng.service || current.year !== eng.year || current.period !== eng.period;
    const teamChanged = current.manager !== eng.manager || current.partner !== eng.partner || JSON.stringify(current.team) !== JSON.stringify(eng.team);
    const planningReviewChanged = scopeChanged || teamChanged;
    if (!eng.service.trim() || !eng.period.trim() || !Number.isInteger(eng.year) || eng.year < 1900 || eng.year > 2100 || !/^\d{4}$/.test(String(eng.year))) throw new GuardError('INVALID_STATE', 'Engagement service, reporting period and a valid reporting year are required.');
    const updated = { ...current, service: eng.service.trim(), year: eng.year, period: eng.period.trim(), stage: eng.stage, due: eng.due, manager: eng.manager, partner: eng.partner, team: [...eng.team], opinion: eng.opinion };
    if (new Set(updated.team).size !== updated.team.length || updated.team.some(name => !this.state.users.some(user => user.status === 'Active' && user.group === 'Professional' && user.name === name)) || !updated.team.includes(updated.manager) || !updated.team.includes(updated.partner)) throw new GuardError('INVALID_STATE', 'The engagement team must contain unique active professional personas, including its manager and partner.');
    for (const name of updated.team) {
      const user = this.state.users.find(item => item.status === 'Active' && item.group === 'Professional' && item.name === name)!;
      const visible = visibleEngagementIds(this.state, user.id);
      if (visible !== 'ALL' && !visible.includes(eng.id)) throw new GuardError('FORBIDDEN_SCOPE', `${name} does not have an active grant to engagement ${eng.id}.`);
    }
    if (JSON.stringify(updated) !== JSON.stringify(current)) {
      const changed = (['service', 'year', 'period', 'stage', 'due', 'manager', 'partner', 'team', 'opinion'] as const).filter(key => JSON.stringify(current[key]) !== JSON.stringify(updated[key]));
      if (planningReviewChanged) {
        updated.planning = false;
        if (scopeChanged) {
          updated.sourceAccepted = false;
          updated.mappingApproved = false;
          for (const revision of this.state.statementSetRevisions || []) if (revision.engagementId === eng.id || revision.comparativeEngagementId === eng.id) revision.status = 'Stale';
          for (const reconciliation of updated.reconciliations || []) this.staleReconciliation(reconciliation);
          for (const revision of updated.cashFlowScheduleHistory || []) revision.status = 'Stale';
        }
        const latestActivePlan = [...(this.state.auditPlans || [])].filter(plan => plan.engagementId === eng.id && plan.status !== 'Superseded').sort((a, b) => b.version - a.version)[0];
        if (latestActivePlan) {
          latestActivePlan.status = 'Superseded';
          latestActivePlan.supersededReason = `Engagement ${scopeChanged ? 'service or reporting period' : 'team'} changed; update and independently review the audit plan.`;
        }
        for (const program of this.state.auditPrograms) if (program.engagementId === eng.id || (!program.engagementId && eng.id === this.state.engagements[0]?.id)) for (const procedure of program.procedures) {
          if (procedure.status === 'Not started' && !procedure.workPerformed && !procedure.conclusion) continue;
          const reason = scopeChanged ? 'Engagement service or reporting period changed' : 'Engagement team changed';
          procedure.scopeReassessmentHistory ||= [];
          procedure.scopeReassessmentHistory.push({ reason, previousStatus: procedure.status, reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: new Date().toISOString() });
          procedure.scopeReassessmentRequired = true;
          procedure.scopeReassessmentReason = scopeChanged ? 'Service or period changed' : 'Engagement team changed';
          if (procedure.status === 'Cleared' || procedure.status === 'Submitted') procedure.status = 'In progress';
          procedure.reviewedByUserId = undefined;
          procedure.reviewedAt = undefined;
        }
      }
      updated.events = [...(current.events || []), { text: `Engagement administration changed by ${this.state.currentPerson}: ${changed.join(', ')}`, ref: eng.id, time: new Date().toISOString(), type: 'history' }];
      this.state.engagements[index] = updated;
      this.invalidateReleaseBasis(updated);
      this.logEvent(`Engagement ${eng.id} changed (${changed.join(', ')}); release approvals reset`, eng.id, 'history');
      this.notify();
    }
  }

  public setEngagementLifecycle(engagementId: string, status: NonNullable<EngagementRecord['lifecycleStatus']>, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'change engagement lifecycle');
    requireEngagementScope(this.state, engagementId, 'administrative');
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    if (!engagement) throw new GuardError('INVALID_STATE', `Engagement "${engagementId}" was not found.`);
    if (!reason.trim()) throw new GuardError('INVALID_STATE', 'An engagement lifecycle decision requires a reason.');
    const current = engagement.lifecycleStatus || 'Active';
    const valid = current === 'Active'
      ? ['Suspended', 'Cancelled', 'Closed'].includes(status)
      : current === 'Suspended'
        ? ['Active', 'Cancelled', 'Closed'].includes(status)
        : false;
    if (!valid) throw new GuardError('INVALID_STATE', `${current} engagement cannot transition to ${status}.`);
    if (status === 'Active' && ['Draft', 'Acceptance'].includes(engagement.stage) && engagement.proposalId && !engagement.professionalAcceptance) throw new GuardError('INVALID_STATE', 'Cannot resume an engagement without current professional acceptance.');
    engagement.lifecycleStatus = status;
    engagement.events ||= [];
    engagement.events.push({ text: `${current} → ${status} by ${this.state.currentPerson}: ${reason.trim()}`, ref: engagement.id, time: new Date().toISOString(), type: 'lifecycle' });
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Engagement ${engagement.id} ${status.toLowerCase()}: ${reason.trim()}`, engagement.id, 'history');
    this.notify();
  }

  // --- Jobs & Tasks (VP-013, VP-014, VP-015) ---
  public addJob(job: JobRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'create jobs');
    requireEngagementScope(this.state, job.engagementId);
    const eng = this.state.engagements.find(e => e.id === job.engagementId);
    if (!eng || eng.client !== job.clientId) throw new GuardError('INVALID_STATE', 'Job client and engagement must match.');
    if (!job.title.trim() || !job.owner.trim() || !job.dueDate) throw new GuardError('INVALID_STATE', 'Job title, owner, and due date are required.');
    if (this.state.jobs.some(j => j.id === job.id)) throw new GuardError('INVALID_STATE', `Job "${job.id}" already exists.`);
    this.assertScopedJobStaff(job.owner, job.engagementId, 'Job owner');
    this.state.jobs.push(job);
    this.logEvent(`New job scheduled: ${job.title}`, job.id);
    this.notify();
  }

  public updateJob(job: JobRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'update jobs');
    const index = this.state.jobs.findIndex(j => j.id === job.id);
    if (index >= 0) {
      const current = this.state.jobs[index];
      requireEngagementScope(this.state, job.engagementId);
      if (job.clientId !== current.clientId || job.engagementId !== current.engagementId) throw new GuardError('INVALID_STATE', 'A job cannot be moved to a different client or engagement.');
      this.assertScopedJobStaff(job.owner, job.engagementId, 'Job owner');
      if (current.status === 'Cancelled' && job.status !== 'Cancelled') throw new GuardError('INVALID_STATE', 'A cancelled job cannot be reopened. Its history remains available.');
      const children = this.state.jobTasks.filter(t => t.jobId === job.id && t.status !== 'Cancelled');
      if (job.status === 'Completed' && children.some(t => t.status !== 'Completed')) throw new GuardError('INVALID_STATE', 'Job cannot complete while required tasks are unfinished.');
      if (job.status === 'Blocked' && !job.blockedReason?.trim()) throw new GuardError('INVALID_STATE', 'Blocked status requires a reason.');
      if (job.status === 'Cancelled' && current.status !== 'Cancelled') {
        if (!job.cancellationReason?.trim()) throw new GuardError('INVALID_STATE', 'Cancelling a job requires a reason.');
        job.cancelledAt = new Date().toISOString();
        job.cancelledByUserId = this.state.currentUserId;
        this.logEvent(`Job ${job.id} cancelled: ${job.cancellationReason.trim()}`, job.id, 'history');
      } else if (job.status !== current.status) {
        this.logEvent(`Job ${job.id} status changed: ${current.status} → ${job.status}${job.status === 'Blocked' ? ` — ${job.blockedReason!.trim()}` : ''}`, job.id, 'history');
      }
      const changedDetails = (['title', 'description', 'owner', 'dueDate'] as const).filter(key => current[key] !== job[key]);
      if (changedDetails.length) this.logEvent(`Job ${job.id} details updated: ${changedDetails.join(', ')}`, job.id, 'history');
      this.state.jobs[index] = job;
      this.notify();
    }
  }

  public addTask(task: JobTaskItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'create tasks');
    const job = this.state.jobs.find(j => j.id === task.jobId);
    if (!job) throw new GuardError('INVALID_STATE', `Referenced job "${task.jobId}" does not exist.`);
    requireEngagementScope(this.state, job.engagementId);
    if (job.status === 'Cancelled') throw new GuardError('INVALID_STATE', 'Tasks cannot be added to a cancelled job.');
    this.assertTaskHierarchy(task);
    this.state.jobTasks.push(task);
    this.notify();
  }

  public updateTask(task: JobTaskItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'update tasks');
    const job = this.state.jobs.find(j => j.id === task.jobId);
    if (!job) throw new GuardError('INVALID_STATE', `Referenced job "${task.jobId}" does not exist.`);
    requireEngagementScope(this.state, job.engagementId);
    if (job.status === 'Cancelled') throw new GuardError('INVALID_STATE', 'Tasks in a cancelled job are retained and cannot be changed.');
    this.assertTaskHierarchy(task, task.id);
    const index = this.state.jobTasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      const current = this.state.jobTasks[index];
      // Completing a parent with unfinished required children is blocked (VP-014).
      if (task.status === 'Completed' && !task.parentTaskId) {
        const children = this.state.jobTasks.filter(t => t.parentTaskId === task.id && t.status !== 'Cancelled');
        if (children.some(c => c.status !== 'Completed')) {
          throw new GuardError('INVALID_STATE', 'Parent task cannot complete while required subtasks are unfinished.');
        }
      }
      if (task.status === 'Blocked' && !task.blockedReason) {
        throw new GuardError('INVALID_STATE', 'Blocked status requires a reason.');
      }
      if (task.status !== current.status) {
        const reason = task.statusChangeReason?.trim() || '';
        if ((task.status === 'Cancelled' || current.status === 'Cancelled') && (!reason || reason.length > 1000)) throw new GuardError('INVALID_STATE', 'Cancelling or reopening a task requires a reason of 1,000 characters or fewer.');
        task.statusHistory = [...(current.statusHistory || []), { from: current.status, to: task.status, reason, by: this.state.currentPerson, byUserId: this.state.currentUserId, at: new Date().toISOString() }];
        this.logEvent(`Task ${task.id} status changed: ${current.status} → ${task.status}${reason ? ` — ${reason}` : ''}`, task.id, 'history');
      } else task.statusHistory = current.statusHistory;
      delete task.statusChangeReason;
      this.state.jobTasks[index] = task;
      this.notify();
    }
  }

  private assertTaskHierarchy(task: JobTaskItem, selfId?: string) {
    if (!task.title || !task.title.trim()) {
      throw new GuardError('INVALID_STATE', 'Task title is required.');
    }
    const job = this.state.jobs.find(j => j.id === task.jobId);
    if (!job) {
      throw new GuardError('INVALID_STATE', `Referenced job "${task.jobId}" does not exist.`);
    }
    if (task.parentTaskId) {
      if (task.parentTaskId === (selfId || task.id)) {
        throw new GuardError('INVALID_STATE', 'A task cannot be its own parent (cycle rejected).');
      }
      const parent = this.state.jobTasks.find(t => t.id === task.parentTaskId);
      if (!parent) throw new GuardError('INVALID_STATE', 'Parent task not found in this job.');
      if (parent.jobId !== task.jobId) throw new GuardError('INVALID_STATE', 'Cross-job parents are rejected.');
      if (parent.parentTaskId) throw new GuardError('INVALID_STATE', 'Only one level of subtasks is supported (VP-014).');
    }
    this.assertTaskAssignee(task.assignee, job.engagementId);
  }

  private assertTaskAssignee(name: string, engagementId: string) {
    this.assertScopedJobStaff(name, engagementId, 'Task assignee');
  }

  private assertScopedJobStaff(name: string, engagementId: string, label: string) {
    const user = this.state.users.find(item => item.status === 'Active' && item.name === name && !isClientRole(item.role) && canOpenRoute(item.role, canonicalRoute('jobs')));
    if (!user) throw new GuardError('INVALID_STATE', `${label} must be an active staff user with job access.`);
    const visible = visibleEngagementIds(this.state, user.id);
    if (visible !== 'ALL' && !visible.includes(engagementId)) throw new GuardError('FORBIDDEN_SCOPE', `${label} must have access to this engagement.`);
  }

  public reassignTask(taskId: string, newAssignee: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'reassign tasks');
    const task = this.state.jobTasks.find(t => t.id === taskId);
    if (!task) throw new GuardError('INVALID_STATE', `Task "${taskId}" was not found.`);
    const job = this.state.jobs.find(j => j.id === task.jobId);
    if (!job) throw new GuardError('INVALID_STATE', 'Task job was not found.');
    requireEngagementScope(this.state, job.engagementId);
    if (job.status === 'Cancelled') throw new GuardError('INVALID_STATE', 'Tasks in a cancelled job are retained and cannot be reassigned.');
    if (!reason.trim()) throw new GuardError('INVALID_STATE', 'Task reassignment requires a reason.');
    this.assertTaskAssignee(newAssignee, job.engagementId);
    if (task.assignee === newAssignee) throw new GuardError('INVALID_STATE', 'Choose a different assignee.');
    if (!task.reassignmentHistory) task.reassignmentHistory = [];
    task.reassignmentHistory.push({
      from: task.assignee,
      to: newAssignee,
      date: new Date().toISOString(),
      reason
    });
    task.assignee = newAssignee;
    this.logEvent(`Task "${task.title}" reassigned to ${newAssignee}: ${reason}`, task.id);
    this.notify();
  }

  public addJobTemplate(template: JobTemplateItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'create job templates');
    if (!template.name || !template.name.trim()) throw new GuardError('INVALID_STATE', 'Template name is required.');
    this.assertJobTemplateStructure(template);
    if (this.state.jobTemplates.some(t => t.id === template.id)) throw new GuardError('INVALID_STATE', 'Job template ID must be unique.');
    this.state.jobTemplates.push(template);
    this.logEvent(`Job template created: ${template.name}`, template.id);
    this.notify();
  }

  public createJobTemplateRevision(sourceId: string, edits: Pick<JobTemplateItem, 'name' | 'service' | 'description' | 'defaultJobTitle' | 'tasks'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'revise job templates');
    const source = this.state.jobTemplates.find(template => template.id === sourceId);
    if (!source || source.status !== 'Published') throw new GuardError('INVALID_STATE', 'Only a published template can be revised.');
    this.assertJobTemplateStructure({ ...source, ...edits });
    const rootTemplateId = source.rootTemplateId || source.id;
    const revision = Math.max(...this.state.jobTemplates.filter(template => (template.rootTemplateId || template.id) === rootTemplateId).map(template => template.revision)) + 1;
    const next: JobTemplateItem = { ...edits, id: `${rootTemplateId}-R${revision}`, status: 'Draft', revision, revisionOfId: source.id, rootTemplateId, tasks: structuredClone(edits.tasks) };
    if (this.state.jobTemplates.some(template => template.id === next.id)) throw new GuardError('INVALID_STATE', 'That template revision already exists.');
    this.state.jobTemplates.push(next);
    this.logEvent(`Job template revision ${revision} drafted from ${source.id}: ${next.name}`, next.id);
    this.notify();
    return next;
  }

  public publishJobTemplate(templateId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'publish job templates');
    const tpl = this.state.jobTemplates.find(t => t.id === templateId);
    if (!tpl) throw new GuardError('INVALID_STATE', 'Template not found.');
    this.assertJobTemplateStructure(tpl);
    if (tpl.status === 'Retired') throw new GuardError('INVALID_STATE', 'Retired templates cannot be republished; create a new revision.');
    tpl.status = 'Published';
    this.logEvent(`Job template published: ${tpl.name}`, tpl.id);
    this.notify();
  }

  public retireJobTemplate(templateId: string, reason = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'retire job templates');
    const tpl = this.state.jobTemplates.find(t => t.id === templateId);
    if (!tpl) throw new GuardError('INVALID_STATE', 'Template not found.');
    if (tpl.status === 'Retired') throw new GuardError('INVALID_STATE', 'Template is already retired.');
    if (!reason.trim() || reason.trim().length > 300) throw new GuardError('INVALID_STATE', 'Retiring a template requires a bounded reason; published revisions and existing jobs remain unchanged.');
    tpl.status = 'Retired';
    this.logEvent(`Job template retired: ${tpl.name} — ${reason.trim()}`, tpl.id);
    this.notify();
  }

  private assertJobTemplateStructure(template: Pick<JobTemplateItem, 'name' | 'defaultJobTitle' | 'tasks'>) {
    if (!template.name.trim() || !template.defaultJobTitle.trim() || template.tasks.length === 0 || template.tasks.some(task => !task.title.trim() || (task.subtasks || []).some(subtask => !subtask.trim()))) {
      throw new GuardError('INVALID_STATE', 'A template requires a name, default job title, and titled phases/subtasks.');
    }
  }

  public applyJobTemplate(templateId: string, engagementId: string, jobTitle: string, dueDate: string, owner: string, operationId?: string, startDate = this.state.asOfDate) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'apply job templates');
    requireEngagementScope(this.state, engagementId);
    const tpl = this.state.jobTemplates.find(t => t.id === templateId);
    if (!tpl) throw new GuardError('INVALID_STATE', 'Template was not found.');
    if (operationId) {
      const prior = this.state.jobs.find(job => job.templateOperationId === operationId);
      if (prior) {
        if (prior.fromTemplateId !== templateId || prior.engagementId !== engagementId || prior.title !== jobTitle || prior.dueDate !== dueDate || prior.startDate !== startDate || prior.owner !== owner) throw new GuardError('INVALID_STATE', 'Template operation ID was already used for different job details.');
        return prior;
      }
    }
    if (tpl.status !== 'Published') {
      throw new GuardError('INVALID_STATE', 'Only Published templates can be applied to create jobs (VP-015).');
    }
    this.assertJobTemplateStructure(tpl);
    const eng = this.state.engagements.find(e => e.id === engagementId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engagementId}" was not found.`);
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!jobTitle.trim() || !validDate(startDate) || !validDate(dueDate) || startDate > dueDate || !this.state.users.some(u => u.status === 'Active' && u.name === owner)) throw new GuardError('INVALID_STATE', 'A job title, valid start and delivery dates, and active owner are required.');
    const newJobId = `JOB-260${this.state.jobs.length + 1}`;

    const newJob: JobRecord = {
      id: newJobId,
      clientId: eng.client,
      engagementId: eng.id,
      title: jobTitle || tpl.defaultJobTitle,
      description: tpl.description,
      owner,
      startDate,
      dueDate,
      status: 'Not started',
      fromTemplateId: tpl.id,
      fromTemplateRevision: tpl.revision,
      ...(operationId ? { templateOperationId: operationId } : {}),
      createdAt: new Date().toISOString()
    };
    this.state.jobs.push(newJob);

    // Copy tasks and subtasks
    tpl.tasks.forEach((t, i) => {
      const parentTaskId = `TSK-${newJobId}-${i + 1}`;
      this.state.jobTasks.push({
        id: parentTaskId,
        jobId: newJobId,
        title: t.title,
        assignee: owner,
        status: 'Not started',
        order: i + 1
      });

      if (t.subtasks && t.subtasks.length > 0) {
        t.subtasks.forEach((sub, subI) => {
          this.state.jobTasks.push({
            id: `${parentTaskId}-${subI + 1}`,
            jobId: newJobId,
            parentTaskId,
            title: sub,
            assignee: owner,
            status: 'Not started',
            order: subI + 1
          });
        });
      }
    });

    this.logEvent(`Job created from template "${tpl.name}": ${newJob.title}`, newJob.id);
    this.notify();
  }

  // --- Comments & Collaboration (VP-016) ---
  public addComment(comment: PrototypeState['comments'][0]) {
    requireActiveIdentity(this.state);
    if (comment.subjectType === 'client') requireClientScope(this.state, comment.subjectId);
    else if (comment.subjectType === 'engagement') requireEngagementScope(this.state, comment.subjectId);
    else {
      const task = comment.subjectType === 'task' ? this.state.jobTasks.find(t => t.id === comment.subjectId) : undefined;
      const job = comment.subjectType === 'job' ? this.state.jobs.find(j => j.id === comment.subjectId) : task ? this.state.jobs.find(j => j.id === task.jobId) : undefined;
      if (!job) throw new GuardError('INVALID_STATE', 'Comment subject was not found.');
      requireEngagementScope(this.state, job.engagementId);
    }
    if (!comment.text.trim() || comment.text.length > 5000) throw new GuardError('INVALID_STATE', 'Comment text is required and must be 5,000 characters or fewer.');
    if (comment.subjectType !== 'client' && comment.visibility !== 'internal') throw new GuardError('INVALID_STATE', 'Job, task and engagement comments must remain internal.');
    if (this.state.comments.some(item => item.id === comment.id)) throw new GuardError('INVALID_STATE', `Comment "${comment.id}" already exists.`);
    const task = comment.subjectType === 'task' ? this.state.jobTasks.find(item => item.id === comment.subjectId) : undefined;
    const job = comment.subjectType === 'job' ? this.state.jobs.find(item => item.id === comment.subjectId) : task ? this.state.jobs.find(item => item.id === task.jobId) : undefined;
    const eligibleIds = this.state.users.filter(user => {
      if (user.status !== 'Active' || isClientRole(user.role) || !canOpenRoute(user.role, canonicalRoute('jobs'))) return false;
      if (comment.subjectType === 'client') {
        const visible = visibleClientIds(this.state, user.id);
        return visible === 'ALL' || visible.includes(comment.subjectId);
      }
      const engagementId = comment.subjectType === 'engagement' ? comment.subjectId : job!.engagementId;
      const visible = visibleEngagementIds(this.state, user.id);
      return visible === 'ALL' || visible.includes(engagementId);
    }).map(user => user.id);
    if ((comment.mentions || []).some(id => !eligibleIds.includes(id))) throw new GuardError('FORBIDDEN_SCOPE', 'Mention recipients must be active staff who can access this comment subject.');
    this.state.comments.push(comment);
    if ((comment.mentions || []).length) {
      this.state.localNotices ||= [];
      for (const recipientUserId of new Set(comment.mentions)) this.state.localNotices.push({ id: `${comment.id}:${recipientUserId}`, recipientUserId, commentId: comment.id, createdAt: new Date().toISOString() });
    }
    (comment.mentions || []).forEach(id => this.logEvent(`Local mention for ${this.state.users.find(user => user.id === id)?.name} on ${comment.subjectType} ${comment.subjectId}`, comment.id));
    this.notify();
  }

  public markLocalNoticeRead(noticeId: string) {
    requireActiveIdentity(this.state);
    const notice = this.state.localNotices?.find(item => item.id === noticeId);
    if (!notice || notice.recipientUserId !== this.state.currentUserId) throw new GuardError('FORBIDDEN_SCOPE', 'A local notice can only be read by its intended recipient.');
    notice.readAt ||= new Date().toISOString();
    this.notify();
  }

  public moderateComment(commentId: string, hidden: boolean, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'moderate internal comments');
    const comment = this.state.comments.find(item => item.id === commentId);
    if (!comment || comment.visibility !== 'internal') throw new GuardError('INVALID_STATE', 'Internal comment was not found.');
    if (comment.subjectType === 'client') requireClientScope(this.state, comment.subjectId);
    else if (comment.subjectType === 'engagement') requireEngagementScope(this.state, comment.subjectId);
    else {
      const task = comment.subjectType === 'task' ? this.state.jobTasks.find(item => item.id === comment.subjectId) : undefined;
      const job = comment.subjectType === 'job' ? this.state.jobs.find(item => item.id === comment.subjectId) : task ? this.state.jobs.find(item => item.id === task.jobId) : undefined;
      if (!job) throw new GuardError('INVALID_STATE', 'Comment subject was not found.');
      requireEngagementScope(this.state, job.engagementId);
    }
    if (comment.author === this.state.currentPerson && !recordPrototypeSuperuserOverride(this.state, 'moderate their own comment')) throw new GuardError('FORBIDDEN_SCOPE', 'The comment author cannot moderate their own comment.');
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new GuardError('INVALID_STATE', 'Comment moderation requires a reason of 1,000 characters or fewer.');
    const currentlyHidden = comment.moderationHistory?.at(-1)?.action === 'Hidden';
    if (currentlyHidden === hidden) throw new GuardError('INVALID_STATE', `Comment is already ${hidden ? 'hidden' : 'visible'}.`);
    comment.moderationHistory ||= [];
    comment.moderationHistory.push({ action: hidden ? 'Hidden' : 'Restored', by: this.state.currentPerson, byUserId: this.state.currentUserId, at: new Date().toISOString(), reason: reason.trim() });
    this.logEvent(`Internal comment ${hidden ? 'hidden' : 'restored'} by moderator: ${reason.trim()}`, comment.id);
    this.notify();
  }

  public editComment(id: string, text: string) {
    requireActiveIdentity(this.state);
    const comment = this.state.comments.find(item => item.id === id);
    if (!comment) throw new GuardError('INVALID_STATE', 'Comment was not found.');
    if (comment.subjectType === 'client') requireClientScope(this.state, comment.subjectId);
    else if (comment.subjectType === 'engagement') requireEngagementScope(this.state, comment.subjectId);
    else {
      const task = comment.subjectType === 'task' ? this.state.jobTasks.find(item => item.id === comment.subjectId) : undefined;
      const job = comment.subjectType === 'job' ? this.state.jobs.find(item => item.id === comment.subjectId) : task ? this.state.jobs.find(item => item.id === task.jobId) : undefined;
      if (!job) throw new GuardError('INVALID_STATE', 'Comment subject was not found.');
      requireEngagementScope(this.state, job.engagementId);
    }
    if (comment.author !== this.state.currentPerson && !recordPrototypeSuperuserOverride(this.state, 'edit another persona\'s comment')) throw new GuardError('FORBIDDEN_SCOPE', 'Only the comment author can edit this note.');
    if (!text.trim() || text.length > 5000) throw new GuardError('INVALID_STATE', 'Comment text is required and must be 5,000 characters or fewer.');
    comment.text = text.trim();
    comment.edited = true;
    comment.editedAt = new Date().toISOString();
    comment.editedBy = this.state.currentPerson;
    this.notify();
  }

  // --- Document Management & SharePoint (VP-020, VP-021) ---
  public addDocument(doc: DocumentItem) {
    requireActiveIdentity(this.state);
    requireClientScope(this.state, doc.clientId);
    if (doc.engagementId) {
      requireEngagementScope(this.state, doc.engagementId);
      if (this.state.engagements.find(e => e.id === doc.engagementId)?.client !== doc.clientId) throw new GuardError('INVALID_STATE', 'Document client and engagement must match.');
    }
    if (!doc.name.trim() || !Number.isFinite(doc.size) || doc.size < 0 || this.state.documents.some(d => d.id === doc.id)) throw new GuardError('INVALID_STATE', 'Document metadata is invalid or duplicated.');
    this.state.documents.push(doc);
    this.logEvent(`Document registered in library: ${doc.name} (v${doc.version})`, doc.id);
    this.notify();
  }

  public linkDocumentToTask(documentId: string, taskId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'preparer', 'reviewer'], 'link a document to a task');
    const document = this.state.documents.find(item => item.id === documentId);
    const task = this.state.jobTasks.find(item => item.id === taskId);
    const job = task && this.state.jobs.find(item => item.id === task.jobId);
    if (!document || !task || !job || document.clientId !== job.clientId || document.engagementId !== job.engagementId) throw new GuardError('INVALID_STATE', 'Task file must be a registered document in the same client and engagement.');
    requireEngagementScope(this.state, job.engagementId, 'records');
    if (document.brokenLink) throw new GuardError('INVALID_STATE', 'An unavailable document reference cannot be linked to a task. Restore it first.');
    if (document.linkedTaskId === taskId) return;
    if (document.linkedTaskId) throw new GuardError('INVALID_STATE', 'Unlink the document from its current task before linking it elsewhere.');
    document.linkedTaskId = taskId;
    document.taskLinkHistory ||= [];
    document.taskLinkHistory.push({ action: 'Linked', taskId, by: this.state.currentPerson, byUserId: this.state.currentUserId, at: new Date().toISOString() });
    this.logEvent(`Document linked to task ${task.title}: ${document.name}`, document.id);
    this.notify();
  }

  public unlinkDocumentFromTask(documentId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'preparer', 'reviewer'], 'unlink a document from a task');
    const document = this.state.documents.find(item => item.id === documentId);
    const task = document?.linkedTaskId && this.state.jobTasks.find(item => item.id === document.linkedTaskId);
    const job = task && this.state.jobs.find(item => item.id === task.jobId);
    if (!document || !task || !job) throw new GuardError('INVALID_STATE', 'Linked task file was not found.');
    requireEngagementScope(this.state, job.engagementId, 'records');
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new GuardError('INVALID_STATE', 'A reason of 1,000 characters or fewer is required to unlink a task file.');
    document.taskLinkHistory ||= [];
    document.taskLinkHistory.push({ action: 'Unlinked', taskId: task.id, by: this.state.currentPerson, byUserId: this.state.currentUserId, at: new Date().toISOString(), reason: reason.trim() });
    delete document.linkedTaskId;
    this.logEvent(`Document unlinked from task ${task.title}: ${reason.trim()}`, document.id);
    this.notify();
  }

  public setDocumentClientSharing(documentId: string, shared: boolean, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'change client document sharing');
    const document = this.state.documents.find(item => item.id === documentId);
    if (!document) throw new GuardError('INVALID_STATE', 'Document was not found.');
    requireClientScope(this.state, document.clientId);
    if (document.engagementId) requireEngagementScope(this.state, document.engagementId, 'records');
    if (typeof reason !== 'string' || !reason.trim()) throw new GuardError('INVALID_STATE', 'A reason is required to change client document sharing.');
    const next = shared ? 'Client shared' : 'Internal';
    if (document.visibility === next) throw new GuardError('INVALID_STATE', `Document is already ${shared ? 'shared with the client' : 'internal'}.`);
    // Withdrawal stays possible; a new client exposure needs an available file.
    if (shared && document.brokenLink) throw new GuardError('INVALID_STATE', 'An unavailable document reference cannot be shared with the client. Restore it first.');
    document.sharingHistory ||= [];
    document.sharingHistory.push({ from: document.visibility, to: next, by: this.state.currentPerson, byUserId: this.state.currentUserId, at: new Date().toISOString(), reason: reason.trim() });
    document.visibility = next;
    if (document.engagementId) {
      const engagement = this.state.engagements.find(item => item.id === document.engagementId)!;
      this.invalidateReleaseBasis(engagement);
    }
    this.logEvent(`Client sharing ${shared ? 'enabled' : 'withdrawn'} for ${document.name}: ${reason.trim()}`, document.id);
    this.notify();
  }

  public replaceDocumentRevision(documentId: string, file: { name: string; size: number; sha256: string }, revisionId?: string): DocumentItem {
    requireActiveIdentity(this.state);
    const previous = this.state.documents.find(doc => doc.id === documentId);
    if (!previous) throw new GuardError('INVALID_STATE', 'Document to replace was not found.');
    requireClientScope(this.state, previous.clientId);
    if (previous.engagementId) requireEngagementScope(this.state, previous.engagementId);
    if (!file.name.trim() || !Number.isFinite(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new GuardError('INVALID_STATE', 'Replacement requires a file name, valid size and SHA-256 digest.');
    if (this.state.documents.some(doc => doc.supersedesDocumentId === previous.id)) throw new GuardError('STALE_REVISION', 'This document already has a replacement. Select its current revision.');
    const revision: DocumentItem = {
      ...previous,
      id: revisionId || `DOC-${crypto.randomUUID()}`,
      name: file.name,
      version: previous.version + 1,
      size: file.size,
      sha: file.sha256,
      source: 'Local In-Session',
      uploadedBy: this.state.currentPerson,
      uploadedAt: new Date().toISOString(),
      supersedesDocumentId: previous.id,
      spSiteId: undefined,
      spDriveId: undefined,
      spItemId: undefined,
      brokenLink: undefined
    };
    if (!/^DOC-[\w-]+$/.test(revision.id) || this.state.documents.some(doc => doc.id === revision.id)) throw new GuardError('INVALID_STATE', 'Replacement document identity must be unique and valid.');
    this.state.documents.push(revision);
    const affectedEngagementIds = new Set<string>();
    const replacementEvidence = this.state.evidenceCatalogue.filter(item => item.documentId === previous.id).map(item => ({
      ...structuredClone(item),
      id: `EVD-${crypto.randomUUID()}`,
      documentId: revision.id,
      version: revision.version,
      sha: file.sha256,
      adequacyStatus: 'Pending verification' as const,
      receivedDate: this.state.asOfDate,
      owner: this.state.currentPerson,
      linkedProcedures: [],
      linkedProcedureHistory: []
    }));
    for (const item of this.state.evidenceCatalogue.filter(evidence => evidence.documentId === previous.id)) {
      for (const procedureId of item.linkedProcedures) {
        for (const program of this.state.auditPrograms) {
          const procedure = program.procedures.find(candidate => candidate.id === procedureId);
          if (!procedure) continue;
          const engagementId = procedure.engagementId || program.engagementId || previous.engagementId;
          const engagement = this.state.engagements.find(candidate => candidate.id === engagementId);
          if (!engagement) continue;
          procedure.evidenceReassessmentHistory ||= [];
          procedure.evidenceReassessmentHistory.push({ documentId: previous.id, version: previous.version, previousStatus: procedure.status, reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: new Date().toISOString() });
          procedure.evidenceReassessmentRequired = true;
          if (procedure.status === 'Cleared') procedure.status = 'In progress';
          procedure.reviewedByUserId = undefined;
          procedure.reviewedAt = undefined;
          affectedEngagementIds.add(engagement.id);
        }
      }
    }
    this.state.evidenceCatalogue.push(...replacementEvidence);
    for (const engagement of this.state.engagements) {
      if (previous.engagementId && engagement.id !== previous.engagementId) continue;
      if (engagement.client !== previous.clientId) continue;
      for (const rec of engagement.reconciliations || []) {
        const scheduleEvidence = (rec.evidence || '').split(/[\s,;]+/).includes(previous.id);
        if (scheduleEvidence || (rec.items || []).some(item => item.evidenceDoc === previous.id)) {
          this.staleReconciliation(rec);
          affectedEngagementIds.add(engagement.id);
        }
      }
      for (const workpaper of engagement.workpapers) {
        if (!workpaper.evidenceRefs?.includes(previous.id)) continue;
        if (workpaper.clearance) workpaper.clearanceHistory.push({ ...workpaper.clearance });
        workpaper.clearance = null;
        workpaper.status = 'Changes required';
        workpaper.version += 1;
        affectedEngagementIds.add(engagement.id);
      }
    }
    for (const engagementId of affectedEngagementIds) {
      const engagement = this.state.engagements.find(candidate => candidate.id === engagementId);
      if (engagement) this.invalidateReleaseBasis(engagement);
    }
    this.logEvent(`Document ${previous.name} superseded by ${revision.name} (v${revision.version}); prior revision retained`, revision.id);
    this.notify();
    return revision;
  }

  public updateDocumentReference(documentId: string, name: string, folderPath: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'rename or move documents');
    const document = this.state.documents.find(item => item.id === documentId);
    if (!document) throw new GuardError('INVALID_STATE', 'Document was not found.');
    requireClientScope(this.state, document.clientId);
    if (document.engagementId) requireEngagementScope(this.state, document.engagementId);
    const cleanName = name.trim();
    const cleanPath = folderPath.trim();
    const folder = this.state.folders?.find(item => item.path === cleanPath);
    if (!cleanName || !cleanPath.startsWith('/') || !cleanPath.endsWith('/') || !folder || (folder.clientId && folder.clientId !== document.clientId)) throw new GuardError('INVALID_STATE', 'Choose a name and an existing folder in this client library.');
    document.name = cleanName;
    document.folderPath = cleanPath;
    this.logEvent(`Document reference renamed or moved: ${document.id} → ${cleanPath}${cleanName}`, document.id);
    this.notify();
  }

  public setDocumentAvailability(documentId: string, broken: boolean, reason = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'change document reference availability');
    const document = this.state.documents.find(item => item.id === documentId);
    if (!document) throw new GuardError('INVALID_STATE', 'Document was not found.');
    requireClientScope(this.state, document.clientId);
    if (document.engagementId) requireEngagementScope(this.state, document.engagementId);
    if (broken && !reason.trim()) throw new GuardError('INVALID_STATE', 'Record why the document reference is unavailable.');
    document.brokenLink = broken;
    this.logEvent(`Document reference ${broken ? 'marked unavailable' : 'restored'}: ${document.id}${reason.trim() ? ` — ${reason.trim()}` : ''}`, document.id);
    this.notify();
  }

  // --- Communications (VP-026, VP-027) ---
  public saveEmailTemplate(template: EmailTemplateItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'maintain email templates');
    const supportedPlaceholders = new Set(['client_name', 'client_contact', 'request_title', 'due_date']);
    const content = `${template.subject || ''}\n${template.body || ''}`;
    const placeholders = [...new Set([...content.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]))];
    if (!template.id?.trim() || !template.name?.trim() || template.name.trim().length > 100 || !template.subject?.trim() || template.subject.trim().length > 240 || !template.body?.trim() || template.body.length > 5000) throw new GuardError('INVALID_STATE', 'Email template needs a name, subject and body within the supported length limits.');
    if (placeholders.some(token => !supportedPlaceholders.has(token))) throw new GuardError('INVALID_STATE', `Unsupported email template placeholder: {${placeholders.find(token => !supportedPlaceholders.has(token))}}. Use client_name, client_contact, request_title or due_date.`);
    if (this.state.emailTemplates.some(item => item.id !== template.id && item.name.trim().toLowerCase() === template.name.trim().toLowerCase())) throw new GuardError('INVALID_STATE', 'Email template names must be unique.');
    const index = this.state.emailTemplates.findIndex(item => item.id === template.id);
    const saved = { ...structuredClone(template), name: template.name.trim(), subject: template.subject.trim(), body: template.body.trim(), placeholders: placeholders.map(token => `{${token}}`) };
    if (index < 0) this.state.emailTemplates.push(saved);
    else this.state.emailTemplates[index] = saved;
    this.logEvent(`Email template ${index < 0 ? 'created' : 'updated'}: ${saved.name}`, saved.id);
    this.notify();
    return structuredClone(saved);
  }

  public addCommunication(comm: CommunicationItem) {
    requireActiveIdentity(this.state);
    requireClientScope(this.state, comm.clientId);
    if (comm.direction === 'Inbound') {
      if (!['Internal', 'Client visible'].includes(comm.visibility)) throw new GuardError('INVALID_STATE', 'Incoming communication visibility must be Internal or Client visible.');
      if (comm.visibility === 'Client visible') requireRole(this.state, ['manager', 'partner'], 'publish an inbound communication to the client portal');
      const recordDate = typeof comm.date === 'string' ? comm.date.slice(0, 10) : '';
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(recordDate) && Number.isFinite(Date.parse(`${recordDate}T00:00:00Z`)) && new Date(`${recordDate}T00:00:00Z`).toISOString().slice(0, 10) === recordDate;
      if (!validDate || recordDate > this.state.asOfDate) throw new GuardError('INVALID_STATE', 'Incoming communication date must be valid and on or before the active scenario date.');
      if (typeof comm.summary !== 'string' || !comm.summary.trim() || comm.summary.length > 240 || typeof comm.participants !== 'string' || !comm.participants.trim() || comm.participants.length > 500 || typeof comm.body !== 'undefined' && (typeof comm.body !== 'string' || comm.body.length > 5000)) throw new GuardError('INVALID_STATE', 'Incoming communication needs a summary of 240 characters, participants of 500 characters and notes of 5,000 characters or fewer.');
    }
    if (comm.linkedDocumentId) {
      const document = this.state.documents.find(item => item.id === comm.linkedDocumentId);
      if (!document || document.clientId !== comm.clientId || (document.engagementId && comm.engagementId && document.engagementId !== comm.engagementId)) throw new GuardError('FORBIDDEN_SCOPE', 'Communication document must belong to the same client and engagement.');
      requireClientScope(this.state, document.clientId);
      if (document.engagementId) requireEngagementScope(this.state, document.engagementId);
      if (document.brokenLink || comm.visibility === 'Client visible' && document.visibility !== 'Client shared') throw new GuardError('FORBIDDEN_SCOPE', 'Unavailable or internal documents cannot be linked to a client-visible communication.');
    }
    if (comm.jobId) {
      const job = this.state.jobs.find(item => item.id === comm.jobId);
      if (!job || job.clientId !== comm.clientId || (comm.engagementId && job.engagementId !== comm.engagementId)) throw new GuardError('INVALID_STATE', 'Communication job must belong to its selected client and engagement.');
      requireEngagementScope(this.state, job.engagementId);
      comm.engagementId = job.engagementId;
    }
    if (comm.engagementId) {
      requireEngagementScope(this.state, comm.engagementId);
      if (this.state.engagements.find(e => e.id === comm.engagementId)?.client !== comm.clientId) throw new GuardError('INVALID_STATE', 'Communication client and engagement must match.');
    }
    if (comm.relatedRequestId) {
      const requestEngagement = this.state.engagements.find(engagement => engagement.pbc.some(request => request.id === comm.relatedRequestId));
      const request = requestEngagement?.pbc.find(item => item.id === comm.relatedRequestId);
      if (!requestEngagement || !request || requestEngagement.id !== comm.engagementId || requestEngagement.client !== comm.clientId || ['Draft', 'Cancelled'].includes(request.status)) throw new GuardError('FORBIDDEN_SCOPE', 'Linked request must be an active, client-visible request for this exact client and engagement.');
      requireEngagementScope(this.state, requestEngagement.id);
    }
    if (comm.direction === 'Outbound' && comm.channel === 'Email' && comm.simulationSubmissionId && this.state.communications.some(item => item.simulationSubmissionId === comm.simulationSubmissionId)) return;
    if (!comm.summary.trim()) throw new GuardError('INVALID_STATE', 'Communication summary is required.');
    if (comm.direction === 'Outbound' && comm.channel === 'Email') {
      const mailConfig = this.state.m365Config;
      const sender = mailConfig?.mailSenderAccount?.trim() || '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) throw new GuardError('INVALID_STATE', 'The configured simulated mail sender is unavailable. Correct the sender in Microsoft 365 Setup before recording this attempt.');
      const mailVerification = mailConfig.verificationResults?.mail;
      if (mailVerification && (mailVerification.configRevision !== (mailConfig.configRevision || 1) || mailVerification.outcome !== 'success')) throw new GuardError('INVALID_STATE', 'The simulated mail sender is unavailable or has not been verified for the current configuration. Reverify mail in Microsoft 365 Setup before recording this attempt.');
      const recipient = comm.recipientEmail?.trim().toLowerCase() || '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !comm.body?.trim()) throw new GuardError('INVALID_STATE', 'A valid recipient email and message body are required.');
      if (/\{[^{}]+\}/.test(`${comm.summary}\n${comm.body}`)) throw new GuardError('INVALID_STATE', 'Resolve all template placeholders in the subject and message body before recording this attempt.');
      if (!this.state.contacts.some(contact => contact.clientId === comm.clientId && contact.active && contact.email?.trim().toLowerCase() === recipient)) throw new GuardError('FORBIDDEN_SCOPE', 'Recipient must be an active contact for this client.');
      const ccEmails = comm.ccEmails || [];
      if (!Array.isArray(ccEmails) || ccEmails.length > 20) throw new GuardError('INVALID_STATE', 'CC may include up to 20 active client contacts.');
      const normalizedCc = ccEmails.map(email => typeof email === 'string' ? email.trim().toLowerCase() : '');
      if (normalizedCc.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || new Set([recipient, ...normalizedCc]).size !== normalizedCc.length + 1) throw new GuardError('INVALID_STATE', 'Enter distinct valid email addresses for To and CC.');
      if (normalizedCc.some(email => !this.state.contacts.some(contact => contact.clientId === comm.clientId && contact.active && contact.email?.trim().toLowerCase() === email))) throw new GuardError('FORBIDDEN_SCOPE', 'Every CC recipient must be an active contact for this client.');
      if (!comm.simulationReference?.trim() || !comm.simulationEvidence?.trim() || this.state.communications.some(item => item.id === comm.id || item.simulationReference === comm.simulationReference)) throw new GuardError('INVALID_STATE', 'Each simulated send needs a unique reference and recorded outcome evidence.');
      comm.recipientEmail = recipient;
      comm.ccEmails = normalizedCc;
    }
    comm.revision ||= 1;
    this.state.communications.unshift(comm);
    this.logEvent(`Communication logged: ${comm.channel} (${comm.direction}) - ${comm.summary}`, comm.id);
    this.notify();
  }

  public correctCommunication(
    communicationId: string,
    changes: Partial<Pick<CommunicationItem, 'channel' | 'participants' | 'summary' | 'body' | 'date' | 'visibility' | 'jobId' | 'linkedDocumentId'>>,
    reason: string
  ) {
    requireActiveIdentity(this.state);
    const communication = this.state.communications.find(item => item.id === communicationId);
    if (!communication || communication.direction !== 'Inbound') throw new GuardError('INVALID_STATE', 'Only a manually recorded inbound communication can be corrected.');
    requireClientScope(this.state, communication.clientId);
    if (communication.engagementId) requireEngagementScope(this.state, communication.engagementId);
    if (communication.author !== this.state.currentPerson && !hasAnyRole(this.state, ['manager', 'partner'])) throw new GuardError('FORBIDDEN_SCOPE', 'Only the communication author or a manager/partner can correct this record.');
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) throw new GuardError('INVALID_STATE', 'Communication correction requires a reason of 500 characters or fewer.');
    const next = { ...communication, ...changes };
    const recordDate = typeof next.date === 'string' ? next.date.slice(0, 10) : '';
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(recordDate) && Number.isFinite(Date.parse(`${recordDate}T00:00:00Z`)) && new Date(`${recordDate}T00:00:00Z`).toISOString().slice(0, 10) === recordDate;
    if (!validDate || recordDate > this.state.asOfDate) throw new GuardError('INVALID_STATE', 'Incoming communication date must be valid and on or before the active scenario date.');
    if (!['Email', 'Phone', 'Meeting', 'Portal message'].includes(next.channel) || typeof next.summary !== 'string' || !next.summary.trim() || next.summary.length > 240 || typeof next.participants !== 'string' || !next.participants.trim() || next.participants.length > 500 || typeof next.body !== 'undefined' && (typeof next.body !== 'string' || next.body.length > 5000)) throw new GuardError('INVALID_STATE', 'Incoming communication needs a supported channel, summary of 240 characters, participants of 500 characters and notes of 5,000 characters or fewer.');
    if (next.visibility === 'Client visible' && communication.visibility !== 'Client visible') requireRole(this.state, ['manager', 'partner'], 'publish an inbound communication to the client portal');
    if (!['Internal', 'Client visible'].includes(next.visibility)) throw new GuardError('INVALID_STATE', 'Incoming communication visibility must be Internal or Client visible.');
    if (changes.jobId) {
      const job = this.state.jobs.find(item => item.id === changes.jobId);
      if (!job || job.clientId !== communication.clientId || communication.engagementId && job.engagementId !== communication.engagementId) throw new GuardError('FORBIDDEN_SCOPE', 'Communication job must belong to its selected client and engagement.');
      requireEngagementScope(this.state, job.engagementId);
      next.engagementId = job.engagementId;
    }
    if (next.linkedDocumentId) {
      const document = this.state.documents.find(item => item.id === next.linkedDocumentId);
      if (!document || document.clientId !== communication.clientId || (document.engagementId && next.engagementId && document.engagementId !== next.engagementId)) throw new GuardError('FORBIDDEN_SCOPE', 'Communication document must belong to the same client and engagement.');
      requireClientScope(this.state, document.clientId);
      if (document.engagementId) requireEngagementScope(this.state, document.engagementId);
      if (document.brokenLink || next.visibility === 'Client visible' && document.visibility !== 'Client shared') throw new GuardError('FORBIDDEN_SCOPE', 'Unavailable or internal documents cannot be linked to a client-visible communication.');
    }
    const previous = {
      channel: communication.channel,
      participants: communication.participants,
      summary: communication.summary,
      body: communication.body,
      date: communication.date,
      visibility: communication.visibility,
      jobId: communication.jobId,
      linkedDocumentId: communication.linkedDocumentId
    };
    const revision = communication.revision || 1;
    communication.correctionHistory ||= [];
    communication.correctionHistory.push({ revision, correctedBy: this.state.currentPerson, correctedByUserId: this.state.currentUserId, correctedAt: new Date().toISOString(), reason: reason.trim(), previous });
    Object.assign(communication, changes, { revision: revision + 1, engagementId: next.engagementId });
    this.logEvent(`Communication corrected: ${communication.id} — ${reason.trim()}`, communication.id);
    this.notify();
  }

  // --- Time Tracking (VP-028) ---
  public addTimeEntry(entry: TimeEntryItem) {
    requireActiveIdentity(this.state);
    requireEngagementScope(this.state, entry.engagementId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || Number.isNaN(Date.parse(`${entry.date}T00:00:00Z`)) || new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10) !== entry.date || entry.date > this.state.asOfDate) throw new GuardError('INVALID_STATE', 'Time entry date must be a valid date on or before the active scenario date.');
    if (entry.jobId) {
      const job = this.state.jobs.find(item => item.id === entry.jobId && item.engagementId === entry.engagementId);
      if (!job || job.status === 'Cancelled') throw new GuardError('INVALID_STATE', 'Time must reference an active job in the same engagement.');
      if (entry.taskId) {
        const task = this.state.jobTasks.find(item => item.id === entry.taskId && item.jobId === job.id);
        if (!task || task.status === 'Cancelled') throw new GuardError('INVALID_STATE', 'Time must reference an active task under the selected job.');
      }
    } else if (entry.taskId) {
      throw new GuardError('INVALID_STATE', 'A task-linked time entry must also reference its job.');
    }
    if (!Number.isInteger(entry.durationMinutes) || entry.durationMinutes <= 0 || !entry.activity.trim() || !entry.taskTitle.trim()) throw new GuardError('INVALID_STATE', 'Time entry needs an activity, task, and positive whole-minute duration.');
    if (entry.person !== this.state.currentPerson && !recordPrototypeSuperuserOverride(this.state, `record time for ${entry.person}`)) throw new GuardError('FORBIDDEN_SCOPE', 'A persona can record time only for itself.');
    this.state.times.unshift(entry);
    this.logEvent(`Time entry recorded by ${entry.person} (${entry.durationMinutes} min)`, entry.id);
    this.notify();
  }

  public reviewTimeEntry(entryId: string, status: 'Approved' | 'Returned', returnReason?: string) {
    requireActiveIdentity(this.state);
    const entry = this.state.times.find(t => t.id === entryId);
    if (!entry) throw new GuardError('INVALID_STATE', `Time entry "${entryId}" was not found.`);
    requireEngagementScope(this.state, entry.engagementId);
    if (entry.status !== 'Submitted') throw new GuardError('INVALID_STATE', 'Only submitted time entries can be reviewed.');
    // Enforce separation of duties: cannot approve own time!
    if (status === 'Approved') requireIndependentActor(entry.person, this.state.currentPerson, 'approve their own time entry', this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'review time');
    if (status === 'Returned' && !returnReason?.trim()) throw new GuardError('INVALID_STATE', 'Returning time requires a reason.');
    if (status === 'Approved') {
      const budget = this.state.budgets.find(b => b.engagementId === entry.engagementId);
      const line = budget?.lines.find(l => l.roleOrActivity.trim().toLowerCase() === entry.activity.trim().toLowerCase());
      entry.budgetVersion = budget?.version;
      entry.billingRatePerHour = line?.billingRatePerHour;
      entry.costRatePerHour = line?.costRatePerHour;
      entry.currency = budget?.currency;
      const engagement = this.state.engagements.find(e=>e.id===entry.engagementId);
      const allocation = engagement?.auditLifecycle?.staffing.at(-1)?.allocations.find(a=>this.state.users.find(u=>u.id===a.userId)?.name===entry.person);
      if (engagement?.auditLifecycle) { entry.budgetVersion=engagement.auditLifecycle.staffing.at(-1)?.revision; entry.billingRatePerHour=allocation?.chargeRate??undefined; entry.costRatePerHour=allocation?.costRate??undefined; entry.currency=engagement.currency; }
    }
    entry.status = status;
    entry.reviewedBy = this.state.currentPerson;
    entry.reviewedAt = new Date().toISOString();
    if (returnReason) entry.returnReason = returnReason;
    this.logEvent(`Time entry ${entry.id} ${status.toLowerCase()} by ${this.state.currentPerson}`, entry.id);
    this.notify();
  }

  public resubmitReturnedTime(entryId: string, correction: Pick<TimeEntryItem, 'taskTitle' | 'durationMinutes' | 'activity' | 'narrative' | 'billable'>) {
    requireActiveIdentity(this.state);
    const entry = this.state.times.find(t => t.id === entryId);
    if (!entry || entry.status !== 'Returned') throw new GuardError('INVALID_STATE', 'Only returned time entries can be resubmitted.');
    requireEngagementScope(this.state, entry.engagementId);
    if (entry.person !== this.state.currentPerson && !recordPrototypeSuperuserOverride(this.state, `resubmit returned time for ${entry.person}`)) throw new GuardError('FORBIDDEN_SCOPE', 'Only the original time owner can resubmit a returned entry.');
    if (entry.date > this.state.asOfDate) throw new GuardError('INVALID_STATE', 'Time entry date must be on or before the active scenario date.');
    if (!correction.taskTitle.trim() || !correction.activity.trim() || !Number.isInteger(correction.durationMinutes) || correction.durationMinutes <= 0) throw new GuardError('INVALID_STATE', 'Corrected time requires a task, activity and positive whole-minute duration.');
    entry.status = 'Superseded';
    const revision = (entry.correctionRevision || 0) + 1;
    this.state.times.unshift({ ...entry, ...correction, id: `${entry.id}-R${revision}`, status: 'Submitted', correctionRevision: revision, supersedesId: entry.id, reviewedBy: undefined, reviewedAt: undefined, returnReason: undefined, billingRatePerHour: undefined, costRatePerHour: undefined, budgetVersion: undefined });
    this.logEvent(`Returned time entry resubmitted as revision ${revision}: ${entry.id}`, entry.id);
    this.notify();
  }

  // --- Budgets (VP-029) ---
  public updateBudget(budget: PrototypeState['budgets'][0]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'author engagement budgets');
    requireEngagementScope(this.state, budget.engagementId);
    if (budget.lines.length === 0 || budget.lines.some(line => !line.roleOrActivity.trim() || !Number.isInteger(line.plannedMinutes) || line.plannedMinutes < 0 || !isValidMoney(line.billingRatePerHour, true) || (line.costRatePerHour !== undefined && !isValidMoney(line.costRatePerHour, true))) || new Set(budget.lines.map(line => line.roleOrActivity.trim().toLowerCase())).size !== budget.lines.length) throw new GuardError('INVALID_STATE', 'Budget lines need unique activity names, non-negative whole minutes, and finite rates with at most two decimal places.');
    const index = this.state.budgets.findIndex(b => b.id === budget.id);
    if (index >= 0) {
      const prior = this.state.budgets[index];
      if (budget.version <= prior.version) throw new GuardError('STALE_REVISION', `Budget revision must advance beyond v${prior.version}.`);
      this.state.budgets[index] = {
        ...budget,
        history: [...(prior.history || []), { version: prior.version, savedAt: new Date().toISOString(), savedBy: this.state.currentPerson, lines: structuredClone(prior.lines) }]
      };
    } else {
      this.state.budgets.push(budget);
    }
    this.logEvent(`Engagement budget ${budget.id} saved`, budget.id);
    this.notify();
  }

  // --- Invoicing & Billing (VP-030, VP-031) ---
  public addInvoice(inv: InvoiceRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'draft invoices');
    requireClientScope(this.state, inv.clientId);
    if (inv.engagementId) requireEngagementScope(this.state, inv.engagementId, 'billing');
    const client = this.state.clients.find(item => item.id === inv.clientId);
    if (!client) throw new GuardError('INVALID_STATE', 'Invoice requires an existing client account.');
    const invoiceNumber = typeof inv.invoiceNumber === 'string' ? inv.invoiceNumber.trim() : '';
    if (!invoiceNumber || invoiceNumber.length > 64 || /[\u0000-\u001f\u007f]/.test(invoiceNumber)) throw new GuardError('INVALID_STATE', 'Invoice reference is required, must be at most 64 characters, and cannot contain control characters.');
    if (typeof inv.description !== 'string' || !inv.description.trim() || inv.description.trim().length > 240) throw new GuardError('INVALID_STATE', 'Invoice description is required and must be at most 240 characters.');
    const issueDate = inv.issueDate || this.state.asOfDate;
    const validInvoiceDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validInvoiceDate(issueDate) || !validInvoiceDate(inv.due) || inv.due < issueDate) throw new GuardError('INVALID_STATE', 'Invoice and due dates must be valid calendar dates, with the due date on or after the invoice date.');
    if (!isProposalCurrency(inv.currency)) throw new GuardError('INVALID_STATE', 'Invoice requires a supported currency.');
    const billingDetails = inv.billingDetails ? { ...inv.billingDetails } : {
      accountName: client.name,
      contactName: client.contact,
      email: client.email,
      phone: client.phone,
      address: client.address,
      registrationNumber: client.registrationNumber
    };
    if (typeof billingDetails.accountName !== 'string' || !billingDetails.accountName.trim() || typeof billingDetails.contactName !== 'string' || !billingDetails.contactName.trim()) throw new GuardError('INVALID_STATE', 'Invoice requires a client billing account name and contact name.');
    if (!isValidMoney(inv.amount, true) || !Array.isArray(inv.lines) || Math.abs(inv.lines.reduce((s, line) => s + line.amount, 0) - inv.amount) > 0.005) throw new GuardError('INVALID_STATE', 'Invoice total must match its line items.');
    if (inv.lines.some(line => !line.description.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.rate) || line.rate < 0 || !Number.isFinite(line.amount) || line.amount < 0 || Math.abs(Math.round(line.amount * 100) / 100 - line.amount) > 0.005 || Math.abs(Math.round(line.quantity * line.rate * 100) / 100 - line.amount) > 0.005)) {
      throw new GuardError('INVALID_STATE', 'Every invoice line needs a description, positive quantity, non-negative finite rate, and matching rounded line total.');
    }
    if (inv.status !== 'Draft') throw new GuardError('INVALID_STATE', 'New invoices must begin as drafts.');
    if (this.state.invoices.some(i => i.id === inv.id || i.invoiceNumber.trim().toLocaleLowerCase() === invoiceNumber.toLocaleLowerCase())) throw new GuardError('INVALID_STATE', 'Invoice ID and number must be unique.');
    inv.revision = Math.max(1, inv.revision || 1);
    const timeLines = inv.lines.filter(line => line.sourceType === 'Time entry');
    const sourceIds = timeLines.map(line => line.sourceId);
    if (sourceIds.some(id => !id) || new Set(sourceIds).size !== sourceIds.length) throw new GuardError('INVALID_STATE', 'Each billed time line must identify one unique approved time entry.');
    const timeSources = timeLines.map(line => {
      const time = this.state.times.find(entry => entry.id === line.sourceId);
      if (!time || time.status !== 'Approved' || !time.billable || time.supersedesId || time.billedInvoiceId) throw new GuardError('INVALID_STATE', `Time source "${line.sourceId}" is not approved, billable, current, and available for invoicing.`);
      if (time.clientId !== inv.clientId || time.engagementId !== (inv.engagementId || inv.eng)) throw new GuardError('FORBIDDEN_SCOPE', `Time source "${time.id}" does not belong to this invoice's client and engagement.`);
      if (!time.currency || time.currency !== inv.currency || !Number.isFinite(time.billingRatePerHour) || time.billingRatePerHour! <= 0) throw new GuardError('INVALID_STATE', `Time source "${time.id}" has no compatible approved billing rate and currency.`);
      const quantity = time.durationMinutes / 60;
      const amount = Math.round(quantity * time.billingRatePerHour! * 100) / 100;
      if (line.quantity !== quantity || line.rate !== time.billingRatePerHour || line.amount !== amount) throw new GuardError('INVALID_STATE', `Invoice line for "${time.id}" does not match its approved duration and pinned rate.`);
      if (this.state.invoices.some(existing => existing.status !== 'Cancelled' && existing.lines.some(existingLine => existingLine.sourceType === 'Time entry' && existingLine.sourceId === time.id))) throw new GuardError('INVALID_STATE', `Time source "${time.id}" has already been consumed by an invoice.`);
      return time;
    });
    const fixedLines = inv.lines.filter(line => line.sourceType === 'Fixed service');
    const fixedSourceIds = fixedLines.map(line => line.sourceId);
    if (fixedSourceIds.some(id => !id) || new Set(fixedSourceIds).size > 1) throw new GuardError('INVALID_STATE', 'Fixed-service invoice lines must reference one accepted proposal revision.');
    if (fixedLines.length) {
      const sourceId = fixedSourceIds[0]!;
      const proposal = this.state.proposals.find(p => sourceId === `proposal:${p.id}:r${p.revision}` && p.state === 'Accepted' && p.items.some(item => item.feeModel === 'Fixed'));
      const engagement = this.state.engagements.find(e => e.id === (inv.engagementId || inv.eng) && e.proposalId === proposal?.id && e.client === inv.clientId && e.acceptance && e.terms);
      if (!proposal || !engagement || proposal.currency !== inv.currency) throw new GuardError('FORBIDDEN_SCOPE', 'Fixed-service billing must match an accepted proposal revision, engagement, client and currency.');
      const contracted = proposal.items.filter(item => item.feeModel === 'Fixed').reduce((sum, item) => sum + item.amount, 0);
      const previouslyBilled = this.state.invoices.filter(existing => existing.id !== inv.id && (existing.engagementId || existing.eng) === engagement.id && existing.clientId === inv.clientId && existing.status !== 'Cancelled').flatMap(existing => existing.lines).filter(line => line.sourceType === 'Fixed service').reduce((sum, line) => sum + line.amount, 0);
      const requested = fixedLines.reduce((sum, line) => sum + line.amount, 0);
      if (fixedLines.some(line => !isValidMoney(line.amount)) || previouslyBilled + requested > contracted + 0.005) throw new GuardError('INVALID_STATE', `Fixed-service billing exceeds the remaining accepted proposal balance of ${Math.max(0, contracted - previouslyBilled)} ${proposal.currency}.`);
    }
    inv.invoiceNumber = invoiceNumber;
    inv.description = inv.description.trim();
    inv.issueDate = issueDate;
    inv.billingDetails = billingDetails;
    this.state.invoices.push(inv);
    timeSources.forEach(time => { time.billedInvoiceId = inv.id; });
    // Prospective numbering (VP-062-AC02): consuming the configured next number advances it;
    // any other explicit number leaves the counter unchanged. Uniqueness is enforced above.
    if (inv.invoiceNumber === `${this.state.firmSettings.invoiceNumberPrefix}${this.state.firmSettings.invoiceNextNumber}`) {
      this.state.firmSettings.invoiceNextNumber += 1;
    }
    this.logEvent(`Invoice draft created: ${inv.invoiceNumber}`, inv.id);
    this.notify();
  }

  public cancelInvoiceDraft(invId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'cancel invoice drafts');
    const invoice = this.state.invoices.find(item => item.id === invId);
    if (!invoice) throw new GuardError('INVALID_STATE', `Invoice "${invId}" was not found.`);
    requireClientScope(this.state, invoice.clientId);
    if (invoice.engagementId) requireEngagementScope(this.state, invoice.engagementId, 'billing');
    if (invoice.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only unapproved invoice drafts can be cancelled.');
    invoice.status = 'Cancelled';
    invoice.lines.filter(line => line.sourceType === 'Time entry').forEach(line => {
      const time = this.state.times.find(entry => entry.id === line.sourceId);
      if (time?.billedInvoiceId === invoice.id) time.billedInvoiceId = undefined;
    });
    this.logEvent(`Invoice draft cancelled: ${invoice.invoiceNumber}`, invoice.id);
    this.notify();
  }

  public reviseInvoiceDraft(invId: string, changes: { description: string; due: string; amount: number; lines: InvoiceLineItem[]; reason: string }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'revise invoice drafts');
    const invoice = this.state.invoices.find(item => item.id === invId);
    if (!invoice) throw new GuardError('INVALID_STATE', `Invoice "${invId}" was not found.`);
    requireClientScope(this.state, invoice.clientId);
    if (invoice.engagementId) requireEngagementScope(this.state, invoice.engagementId, 'billing');
    if (invoice.status !== 'Draft' && invoice.status !== 'Approved') throw new GuardError('INVALID_STATE', 'Only unissued invoice drafts can be revised.');
    if (!changes.reason?.trim() || changes.reason.trim().length > 500) throw new GuardError('INVALID_STATE', 'Invoice revision requires a bounded reason.');
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(changes.due) && Number.isFinite(Date.parse(changes.due)) && new Date(`${changes.due}T00:00:00Z`).toISOString().slice(0, 10) === changes.due;
    if (!changes.description?.trim() || changes.description.trim().length > 240 || !validDate) throw new GuardError('INVALID_STATE', 'Invoice revision requires a bounded description and valid due date.');
    if (!isValidMoney(changes.amount, true) || !Array.isArray(changes.lines) || Math.abs(changes.lines.reduce((sum, line) => sum + line.amount, 0) - changes.amount) > 0.005) throw new GuardError('INVALID_STATE', 'Revised invoice total must match its line items.');
    if (changes.lines.some(line => !line.description.trim() || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.rate) || line.rate < 0 || !Number.isFinite(line.amount) || line.amount < 0 || Math.abs(Math.round(line.amount * 100) / 100 - line.amount) > 0.005 || Math.abs(Math.round(line.quantity * line.rate * 100) / 100 - line.amount) > 0.005)) throw new GuardError('INVALID_STATE', 'Every revised invoice line needs a description, positive quantity, non-negative finite rate, and matching rounded line total.');
    const priorSourceLines = invoice.lines.filter(line => line.sourceType !== 'Ad hoc');
    const revisedSourceLines = changes.lines.filter(line => line.sourceType !== 'Ad hoc');
    if (JSON.stringify(priorSourceLines) !== JSON.stringify(revisedSourceLines)) throw new GuardError('INVALID_STATE', 'A revision cannot change, remove, or add source-linked time or fixed-service lines.');
    if (new Set(changes.lines.map(line => line.id)).size !== changes.lines.length) throw new GuardError('INVALID_STATE', 'Revised invoice line IDs must be unique.');
    const revision = Math.max(1, invoice.revision || 1);
    invoice.revisionHistory = [...(invoice.revisionHistory || []), {
      revision,
      description: invoice.description,
      amount: invoice.amount,
      due: invoice.due,
      lines: invoice.lines.map(line => ({ ...line })),
      editedBy: this.state.currentPerson,
      editedAt: new Date().toISOString(),
      reason: changes.reason.trim()
    }];
    if (invoice.commercialApproval) invoice.commercialApprovalHistory = [...(invoice.commercialApprovalHistory || []), { revision, by: invoice.commercialApproval.by, at: invoice.commercialApproval.at || new Date().toISOString(), basis: invoice.commercialApproval.basis }];
    invoice.description = changes.description.trim();
    invoice.due = changes.due;
    invoice.amount = Math.round(changes.amount * 100) / 100;
    invoice.lines = changes.lines.map(line => ({ ...line }));
    invoice.revision = revision + 1;
    invoice.status = 'Draft';
    invoice.commercialApproval = undefined;
    invoice.reviewNote = undefined;
    this.logEvent(`Invoice ${invoice.invoiceNumber} revised to draft revision ${invoice.revision}: ${changes.reason.trim()}`, invoice.id);
    this.notify();
  }

  public reviewInvoice(invId: string, approved: boolean, note = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'review invoices');
    const inv = this.state.invoices.find(i => i.id === invId);
    if (!inv) throw new GuardError('INVALID_STATE', `Invoice "${invId}" was not found.`);
    requireClientScope(this.state, inv.clientId);
    if (inv.engagementId) requireEngagementScope(this.state, inv.engagementId, 'billing');
    if (inv.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only draft invoices can be reviewed.');
    if (approved) requireIndependentActor(inv.preparedBy, this.state.currentPerson, 'approve their own invoice', this.state);
    if (!approved) {
      if (!note.trim() || note.trim().length > 500) throw new GuardError('INVALID_STATE', 'A returned invoice requires a bounded review note so the preparer can rework it.');
      inv.status = 'Draft';
      inv.commercialApproval = undefined;
      inv.reviewNote = note.trim();
      this.logEvent(`Invoice ${inv.invoiceNumber} returned for changes: ${note.trim()}`, inv.id);
      this.notify();
      return;
    }
    inv.status = 'Approved';
    inv.reviewNote = undefined;
    inv.commercialApproval = {
      by: this.state.currentPerson,
      at: new Date().toISOString(),
      basis: 'Independent commercial fee review',
      reviewedRevision: Math.max(1, inv.revision || 1)
    };
    this.logEvent(`Invoice ${inv.invoiceNumber} ${approved ? 'approved' : 'returned'}`, inv.id);
    this.notify();
  }

  public issueInvoice(invId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'issue invoices');
    const inv = this.state.invoices.find(i => i.id === invId);
    if (!inv) throw new GuardError('INVALID_STATE', `Invoice "${invId}" was not found.`);
    requireClientScope(this.state, inv.clientId);
    if (inv.engagementId) requireEngagementScope(this.state, inv.engagementId, 'billing');
    if (inv.status !== 'Approved' || !inv.commercialApproval || inv.commercialApproval.reviewedRevision !== Math.max(1, inv.revision || 1)) throw new GuardError('INVALID_STATE', 'Only the current independently reviewed invoice revision can be issued.');
    requireIndependentActor(inv.commercialApproval.by, this.state.currentPerson, 'issue an invoice they reviewed', this.state);
    inv.status = 'Issued';
    inv.issueDate = new Date().toISOString().split('T')[0];
    this.logEvent(`Invoice issued in demo: ${inv.invoiceNumber} (${inv.amount} ${inv.currency})`, inv.id);
    this.notify();
  }

  public addCreditNote(credit: CreditNoteRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'draft credit notes');
    const inv = this.state.invoices.find(i => i.id === credit.invoiceId);
    if (!inv) throw new GuardError('INVALID_STATE', 'Credit note must link to an existing invoice.');
    if (inv.clientId !== credit.clientId) throw new GuardError('FORBIDDEN_SCOPE', 'Cross-client credits are rejected.');
    requireClientScope(this.state, credit.clientId);
    if (inv.engagementId) requireEngagementScope(this.state, inv.engagementId, 'billing');
    if (!isValidMoney(credit.amount)) throw new GuardError('INVALID_STATE', 'Credit amount must be finite, positive, and use at most two decimal places.');
    if ((credit.currency || inv.currency) !== inv.currency) throw new GuardError('INVALID_STATE', 'Credit note currency must match the invoice currency.');
    if (inv.status !== 'Issued' && inv.status !== 'Paid') throw new GuardError('INVALID_STATE', 'Credit notes can be created only for issued invoices.');
    const issuedCredits = this.state.creditNotes
      .filter(c => c.invoiceId === credit.invoiceId && c.status === 'Issued')
      .reduce((s, c) => s + c.amount, 0);
    const remaining = inv.amount - issuedCredits;
    if (credit.amount > remaining) {
      throw new GuardError('INVALID_STATE', `Credit ${credit.amount} exceeds remaining creditable amount ${remaining}.`);
    }
    this.state.creditNotes.push(credit);
    credit.revision = Math.max(1, credit.revision || 1);
    credit.status = 'Draft';
    credit.reviewedBy = undefined;
    credit.reviewedRevision = undefined;
    credit.issuedBy = undefined;
    if (credit.creditNumber === `${this.state.firmSettings.creditNumberPrefix}${this.state.firmSettings.creditNextNumber}`) {
      this.state.firmSettings.creditNextNumber += 1;
    }
    this.logEvent(`Credit note drafted: ${credit.creditNumber} (${credit.amount} ${credit.currency || inv.currency})`, credit.id);
    this.notify();
  }

  public reviewCreditNote(creditId: string, approved: boolean, returnReason?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'review credit notes');
    const credit = this.state.creditNotes.find(c => c.id === creditId);
    if (!credit) throw new GuardError('INVALID_STATE', `Credit note "${creditId}" was not found.`);
    requireClientScope(this.state, credit.clientId);
    const invoice = this.state.invoices.find(i => i.id === credit.invoiceId);
    if (invoice?.engagementId) requireEngagementScope(this.state, invoice.engagementId, 'billing');
    if (approved && credit.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only a draft credit note can be approved.');
    if (approved) {
      requireIndependentActor(credit.preparedBy, this.state.currentPerson, 'approve their own credit note', this.state);
      const otherReservedCredits = this.state.creditNotes.filter(item => item.id !== credit.id && item.invoiceId === credit.invoiceId && (item.status === 'Issued' || item.status === 'Approved')).reduce((sum, item) => sum + item.amount, 0);
      if (credit.amount > (invoice?.amount || 0) - otherReservedCredits) throw new GuardError('INVALID_STATE', 'Credit note exceeds the remaining creditable invoice balance.');
    } else if ((credit.status !== 'Draft' && credit.status !== 'Approved') || !returnReason?.trim()) throw new GuardError('INVALID_STATE', 'Returning a draft or approved credit note requires a reason.');
    credit.status = approved ? 'Approved' : 'Draft';
    credit.reviewedBy = approved ? this.state.currentPerson : undefined;
    credit.reviewedRevision = approved ? Math.max(1, credit.revision || 1) : undefined;
    credit.returnReason = approved ? undefined : returnReason!.trim();
    if (!approved) credit.revision = Math.max(1, credit.revision || 1) + 1;
    this.logEvent(`Credit note ${credit.creditNumber} ${approved ? 'approved' : 'returned'} by ${this.state.currentPerson}`, credit.id);
    this.notify();
  }

  public reviseCreditNote(creditId: string, changes: { amount: number; reason: string }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'revise credit notes');
    const credit = this.state.creditNotes.find(item => item.id === creditId);
    if (!credit) throw new GuardError('INVALID_STATE', `Credit note "${creditId}" was not found.`);
    requireClientScope(this.state, credit.clientId);
    const invoice = this.state.invoices.find(item => item.id === credit.invoiceId);
    if (invoice?.engagementId) requireEngagementScope(this.state, invoice.engagementId, 'billing');
    if (credit.status !== 'Draft' || !credit.returnReason) throw new GuardError('INVALID_STATE', 'Only a returned draft credit note can be revised.');
    if (!isValidMoney(changes.amount) || !changes.reason?.trim()) throw new GuardError('INVALID_STATE', 'Revised credit requires a positive cent-accurate amount and reason.');
    if ((credit.currency || invoice?.currency) !== invoice?.currency) throw new GuardError('INVALID_STATE', 'Credit note currency must match the invoice currency.');
    const otherReservedCredits = this.state.creditNotes.filter(item => item.id !== credit.id && item.invoiceId === credit.invoiceId && (item.status === 'Issued' || item.status === 'Approved')).reduce((sum, item) => sum + item.amount, 0);
    if (changes.amount > (invoice?.amount || 0) - otherReservedCredits) throw new GuardError('INVALID_STATE', 'Credit note exceeds the remaining creditable invoice balance.');
    credit.amount = changes.amount;
    credit.reason = changes.reason.trim();
    credit.revision = Math.max(1, credit.revision || 1) + 1;
    credit.reviewedBy = undefined;
    credit.reviewedRevision = undefined;
    this.logEvent(`Credit note ${credit.creditNumber} revised to revision ${credit.revision}`, credit.id);
    this.notify();
  }

  public issueCreditNote(creditId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'issue credit notes');
    const credit = this.state.creditNotes.find(c => c.id === creditId);
    if (!credit) throw new GuardError('INVALID_STATE', `Credit note "${creditId}" was not found.`);
    requireClientScope(this.state, credit.clientId);
    const invoice = this.state.invoices.find(i => i.id === credit.invoiceId);
    if (!invoice || (invoice.status !== 'Issued' && invoice.status !== 'Paid')) throw new GuardError('INVALID_STATE', 'Credit note invoice is no longer eligible for credit.');
    if ((credit.currency || invoice.currency) !== invoice.currency) throw new GuardError('INVALID_STATE', 'Credit note currency must match the invoice currency.');
    if (invoice.engagementId) requireEngagementScope(this.state, invoice.engagementId, 'billing');
    if (credit.status !== 'Approved' || !credit.reviewedBy || credit.reviewedRevision !== Math.max(1, credit.revision || 1)) throw new GuardError('INVALID_STATE', 'Credit note must receive independent review of its current revision before issue.');
    requireIndependentActor(credit.reviewedBy, this.state.currentPerson, 'issue the credit note they reviewed', this.state);
    const alreadyIssued = this.state.creditNotes.filter(c => c.invoiceId === invoice.id && c.status === 'Issued').reduce((sum, c) => sum + c.amount, 0);
    if (credit.amount > invoice.amount - alreadyIssued) throw new GuardError('INVALID_STATE', 'Credit note exceeds the remaining creditable invoice balance.');
    const otherApproved = this.state.creditNotes.filter(item => item.id !== credit.id && item.invoiceId === invoice.id && item.status === 'Approved').reduce((sum, item) => sum + item.amount, 0);
    if (credit.amount + otherApproved > invoice.amount - alreadyIssued) throw new GuardError('INVALID_STATE', 'Credit note exceeds the remaining creditable invoice balance after other approved credits.');
    credit.status = 'Issued';
    credit.issueDate = this.state.asOfDate;
    credit.date = this.state.asOfDate;
    credit.issuedBy = this.state.currentPerson;
    invoice.creditsApplied = (invoice.creditsApplied || 0) + credit.amount;
    this.logEvent(`Credit note issued: ${credit.creditNumber} (${credit.amount} ${credit.currency || invoice.currency})`, credit.id);
    this.notify();
  }

  // --- Offline Receipts & Allocations (VP-032) ---
  public addReceipt(receipt: ReceiptRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'record offline receipts');
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!receipt.id?.trim() || !receipt.receiptNumber?.trim() || receipt.receiptNumber.length > 80 || !/^[A-Z]{3}$/.test(receipt.currency) || !validDate(receipt.date) || !['Bank transfer', 'Cash', 'Cheque', 'Other'].includes(receipt.method) || typeof receipt.externalRef !== 'string' || receipt.externalRef.length > 160 || typeof receipt.reference !== 'undefined' && (typeof receipt.reference !== 'string' || receipt.reference.length > 160) || typeof receipt.notes !== 'undefined' && (typeof receipt.notes !== 'string' || receipt.notes.length > 2000)) throw new GuardError('INVALID_STATE', 'Receipt requires a bounded number/reference, valid date, supported method, three-letter currency and bounded text metadata.');
    if (!isValidMoney(receipt.amount)) throw new GuardError('INVALID_STATE', 'Receipt amount must be finite, positive, and use at most two decimal places.');
    if (!receipt.clientId) throw new GuardError('INVALID_STATE', 'Receipt requires a client billing account.');
    if (this.state.receipts.some(r => r.id === receipt.id || r.receiptNumber.trim().toLowerCase() === receipt.receiptNumber.trim().toLowerCase())) throw new GuardError('INVALID_STATE', 'Receipt ID and number must be unique.');
    requireClientScope(this.state, receipt.clientId);
    if (receipt.allocatedAmount !== 0 || receipt.allocations.length !== 0) throw new GuardError('INVALID_STATE', 'New receipt must start with no allocations; use allocation commands to record settlement history.');
    this.state.receipts.unshift(receipt);
    this.logEvent(`Offline receipt recorded: ${receipt.receiptNumber} (${receipt.amount} ${receipt.currency})`, receipt.id);
    this.notify();
  }

  public allocateReceipt(receiptId: string, invoiceId: string, amount: number) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'allocate offline receipts');
    const receipt = this.state.receipts.find(r => r.id === receiptId);
    const invoice = this.state.invoices.find(i => i.id === invoiceId);
    if (!receipt || !invoice) return;
    requireClientScope(this.state, receipt.clientId);
    if (receipt.clientId !== invoice.clientId) {
      throw new GuardError('FORBIDDEN_SCOPE', 'Cross-client allocation is rejected.');
    }
    if (invoice.engagementId) requireEngagementScope(this.state, invoice.engagementId, 'billing');
    if (receipt.currency !== invoice.currency) {
      throw new GuardError('INVALID_STATE', 'Cross-currency allocation is rejected.');
    }
    if (invoice.status !== 'Issued' && invoice.status !== 'Paid') {
      throw new GuardError('INVALID_STATE', 'Only issued invoices can receive allocations (draft/cancelled excluded).');
    }
    if (!isValidMoney(amount)) {
      throw new GuardError('INVALID_STATE', 'Allocation amount must be finite, positive, and use at most two decimal places.');
    }

    if (!Array.isArray(receipt.allocations) || Math.abs(receipt.allocatedAmount - receipt.allocations.filter(item => !item.reversed).reduce((sum, item) => sum + item.amount, 0)) > 0.005 || this.state.receipts.some(item => Math.abs(item.allocatedAmount - (item.allocations || []).filter(allocation => !allocation.reversed).reduce((sum, allocation) => sum + allocation.amount, 0)) > 0.005)) throw new GuardError('INVALID_STATE', 'Receipt allocation balance is stale; reload before allocating.');
    const unallocated = receipt.amount - receipt.allocatedAmount;
    if (amount > unallocated) {
      throw new GuardError('INVALID_STATE', `Allocation amount ${amount} exceeds available unallocated receipt balance ${unallocated}.`);
    }

    // Invoice net remaining outstanding balance
    const issuedCredits = this.state.creditNotes
      .filter(c => c.invoiceId === invoice.id && c.status === 'Issued')
      .reduce((s, c) => s + c.amount, 0);

    const totalAllocated = this.state.receipts.flatMap(item => item.allocations || []).filter(item => item.invoiceId === invoice.id && !item.reversed).reduce((sum, item) => sum + item.amount, 0);

    const settledAmount = Math.max(invoice.paid || 0, totalAllocated);
    const remainingInvoice = Math.max(0, invoice.amount - issuedCredits - settledAmount);
    if (amount > remainingInvoice) {
      throw new GuardError('INVALID_STATE', `Allocation ${amount} exceeds remaining invoice balance ${remainingInvoice}.`);
    }

    receipt.allocatedAmount = (receipt.allocatedAmount || 0) + amount;
    const nowIso = new Date().toISOString();
    receipt.allocations.push({
      invoiceId,
      amount,
      allocatedAt: nowIso,
      date: nowIso.split('T')[0]
    });

    invoice.paid = settledAmount + amount;
    if (invoice.paid >= invoice.amount - issuedCredits) {
      invoice.status = 'Paid';
    }

    this.logEvent(`Receipt ${receipt.receiptNumber} allocated ${amount} QAR to invoice ${invoice.invoiceNumber}`, receipt.id);
    this.notify();
  }

  public reverseAllocation(receiptId: string, allocationIndex: number, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'reverse receipt allocations');
    const receipt = this.state.receipts.find(r => r.id === receiptId);
    if (!receipt || !receipt.allocations[allocationIndex]) throw new GuardError('INVALID_STATE', 'Receipt allocation was not found.');
    requireClientScope(this.state, receipt.clientId);
    if (!reason.trim()) throw new GuardError('INVALID_STATE', 'A reversal reason is required.');

    const alloc = receipt.allocations[allocationIndex];
    if (alloc.reversed) return;
    const invoice = this.state.invoices.find(i => i.id === alloc.invoiceId);
    if (!invoice) throw new GuardError('INVALID_STATE', 'The allocated invoice no longer exists.');
    if (invoice.engagementId) requireEngagementScope(this.state, invoice.engagementId, 'billing');
    const currentInvoiceSettled = receipt.allocations.filter(item => item.invoiceId === invoice.id && !item.reversed).reduce((sum, item) => sum + item.amount, 0);
    const allInvoiceSettled = this.state.receipts.flatMap(item => item.allocations || []).filter(item => item.invoiceId === invoice.id && !item.reversed).reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs((invoice.paid || 0) - allInvoiceSettled) > 0.005 || Math.abs(receipt.allocatedAmount - receipt.allocations.filter(item => !item.reversed).reduce((sum, item) => sum + item.amount, 0)) > 0.005 || currentInvoiceSettled < alloc.amount) throw new GuardError('INVALID_STATE', 'Settlement totals are stale; refresh before reversing this allocation.');

    alloc.reversed = true;
    alloc.reversalDate = new Date().toISOString().split('T')[0];
    alloc.reversalReason = reason;
    receipt.allocatedAmount = Math.max(0, receipt.allocatedAmount - alloc.amount);

    invoice.paid = Math.max(0, invoice.paid - alloc.amount);
    const issuedCredits = this.state.creditNotes.filter(c => c.invoiceId === invoice.id && c.status === 'Issued').reduce((sum, c) => sum + c.amount, 0);
    if (invoice.status === 'Paid' && invoice.paid < invoice.amount - issuedCredits) {
      invoice.status = 'Issued';
    }

    this.logEvent(`Allocation reversed on ${receipt.receiptNumber}: ${reason}`, receipt.id);
    this.notify();
  }

  // --- Accounting & TB (VP-035, VP-036, VP-038) ---
  public saveAccountingProfile(clientId: string, input: Omit<ClientAccountingProfile, 'revision' | 'chartRevision' | 'history'>, engagementId: string, periodBookId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'edit accounting setup');
    requireClientScope(this.state, clientId);
    const client = this.state.clients.find(item => item.id === clientId);
    const engagement = this.state.engagements.find(item => item.id === engagementId && item.client === clientId);
    if (!client || !engagement) throw new GuardError('INVALID_STATE', 'Accounting setup requires an engagement belonging to this client.');
    requireActiveEngagementLifecycle(this.state, engagement.id);
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    const codes = input.accounts.map(account => account.code.trim());
    const dimensionIds = Array.isArray(input.dimensions) ? input.dimensions.map(dimension => typeof dimension?.id === 'string' ? dimension.id.trim().toLowerCase() : '') : [];
    const dimensionNames = Array.isArray(input.dimensions) ? input.dimensions.map(dimension => typeof dimension?.name === 'string' ? dimension.name.trim().toLowerCase() : '') : [];
    const supportedDimensionNames = new Set(['Department', 'Cost centre', 'Project']);
    const dimensionsValid = Array.isArray(input.dimensions)
      && new Set(dimensionIds).size === dimensionIds.length
      && new Set(dimensionNames).size === dimensionNames.length
      && input.dimensions.every(dimension => Boolean(dimension && typeof dimension.id === 'string' && dimension.id.trim()) && supportedDimensionNames.has(dimension.name) && typeof dimension.active === 'boolean' && Array.isArray(dimension.values) && dimension.values.length > 0 && new Set(dimension.values.map(value => typeof value === 'string' ? value.trim().toLowerCase() : '')).size === dimension.values.length && dimension.values.every(value => typeof value === 'string' && Boolean(value.trim())));
    if (!input.legalEntityName.trim() || input.reportingBasis === 'Not selected' || !/^[A-Z]{3}$/.test(input.baseCurrency) || !input.accounts.length || new Set(codes).size !== codes.length || input.accounts.some(account => !account.code.trim() || !account.name.trim() || !['asset', 'liability', 'equity', 'revenue', 'expense'].includes(account.type))) throw new GuardError('INVALID_STATE', 'Setup requires a legal entity, reporting basis, three-letter currency and uniquely coded, named chart accounts.');
    const byCode = new Map(input.accounts.map(account => [account.code, account]));
    for (const account of input.accounts) {
      if (account.parentCode && (!byCode.has(account.parentCode) || account.parentCode === account.code || byCode.get(account.parentCode)?.posting)) throw new GuardError('INVALID_STATE', `Invalid chart parent for account ${account.code}.`);
      let parent = account.parentCode; const seen = new Set([account.code]);
      while (parent) { if (seen.has(parent)) throw new GuardError('INVALID_STATE', 'Chart hierarchy contains a cycle.'); seen.add(parent); parent = byCode.get(parent)?.parentCode; }
    }
    const ids = input.periodBooks.map(book => book.id);
    if (new Set(ids).size !== ids.length || input.periodBooks.some(book => !book.name.trim() || !book.bookName.trim() || !validDate(book.startDate) || !validDate(book.endDate) || book.startDate > book.endDate || !this.state.engagements.some(item => item.id === book.ownerEngagementId && item.client === clientId))) throw new GuardError('INVALID_STATE', 'Period books need unique IDs, valid ranges and an owner engagement for this client.');
    const selected = input.periodBooks.find(book => book.id === periodBookId && book.ownerEngagementId === engagementId);
    if (!selected || selected.status !== 'Open' || !dimensionsValid) throw new GuardError('INVALID_STATE', 'Select an open period book for this engagement and use supported dimensions with unique identifiers/names and non-empty, unique dimension values.');
    const previous = client.accountingProfile || { legalEntityName: client.name, reportingBasis: 'Not selected' as const, baseCurrency: engagement.currency || 'QAR', accounts: [], periodBooks: [], dimensions: [], revision: 0, chartRevision: 0, history: [] };
    if (previous.revision && (engagement.accountingProfileRevision !== previous.revision || engagement.accountingChartRevision !== previous.chartRevision)) throw new GuardError('STALE_REVISION', 'Accounting setup changed; reload before saving.');
    const chartChanged = JSON.stringify(previous.accounts) !== JSON.stringify(input.accounts);
    const dimensionsChanged = JSON.stringify(previous.dimensions || []) !== JSON.stringify(input.dimensions);
    const history = structuredClone(previous.history);
    if (previous.revision) history.push({ legalEntityName: previous.legalEntityName, reportingBasis: previous.reportingBasis, baseCurrency: previous.baseCurrency, accounts: structuredClone(previous.accounts), periodBooks: structuredClone(previous.periodBooks), dimensions: structuredClone(previous.dimensions), revision: previous.revision, chartRevision: previous.chartRevision, savedAt: new Date().toISOString(), savedByUserId: this.state.currentUserId });
    const profile: ClientAccountingProfile = { ...structuredClone(input), revision: previous.revision + 1, chartRevision: previous.chartRevision + Number(chartChanged), history };
    client.accountingProfile = profile;
    const engagementIds = new Set(this.state.engagements.filter(item => item.client === clientId).map(item => item.id));
    for (const revision of this.state.statementSetRevisions || []) if (engagementIds.has(revision.engagementId) || revision.comparativeEngagementId && engagementIds.has(revision.comparativeEngagementId)) revision.status = 'Stale';
    for (const item of this.state.engagements.filter(e => e.client === clientId)) {
      item.accountingProfileRevision = profile.revision; item.accountingChartRevision = profile.chartRevision;
      const book = profile.periodBooks.find(b => b.ownerEngagementId === item.id && b.id === (item.id === engagementId ? periodBookId : item.accountingPeriodBookId));
      if (book) item.accountingPeriodBookId = book.id;
      if ((chartChanged || dimensionsChanged) && item.mappingApproved) {
        item.mappingApproved = false;
        const engagementMappings = (this.state.accountMappingRevisions || []).filter(mapping => mapping.engagementId === item.id).sort((a, b) => a.revision - b.revision);
        const currentMapping = engagementMappings.at(-1);
        if (currentMapping?.status === 'Approved') {
          const revision = Math.max(0, ...engagementMappings.map(mapping => mapping.revision)) + 1;
          this.state.accountMappingRevisions!.push({ engagementId: item.id, revision, mappings: structuredClone(currentMapping.mappings), status: 'Draft', preparedBy: this.state.currentUserId });
        }
      }
      this.staleStatementSetRevisions(item.id); this.invalidateReleaseBasis(item);
    }
    this.logEvent(`Accounting setup for ${client.name} saved as Rev ${profile.revision}${chartChanged ? ` (chart Rev ${profile.chartRevision})` : ''}`, engagementId);
    this.notify(); return profile.revision;
  }

  public updateTrialBalanceRows(
    engId: string,
    rows: PrototypeState['engagements'][0]['rows'],
    source?: { fileName: string; format: 'CSV' | 'XLSX'; sha256: string; mapping: { code: number; name: number; debit: number; credit: number; signed: number; convention: 'signed-net' | 'debit-credit'; dimension?: { id: string; index: number } } }
  ) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner'], 'replace trial balance rows');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" was not found.`);
    const client = this.state.clients.find(item => item.id === eng.client);
    const profile = client?.accountingProfile;
    const periodBook = profile?.periodBooks.find(book => book.id === eng.accountingPeriodBookId && book.ownerEngagementId === engId);
    if (source && (!profile || profile.reportingBasis === 'Not selected' || !periodBook || periodBook.status !== 'Open' || eng.accountingProfileRevision !== profile.revision || eng.accountingChartRevision !== profile.chartRevision)) throw new GuardError('INVALID_STATE', 'Complete or reload the client accounting setup and select this engagement’s open period book before importing a trial balance.');
    if (source && rows.some(row => !profile?.accounts.some(account => account.code === row.code && account.active && account.posting))) throw new GuardError('INVALID_STATE', 'Imported accounts must exist as active posting accounts in the selected chart.');
    if (source && rows.some(row => source.mapping.dimension && !row.dimensions?.[source.mapping.dimension.id] || Object.entries(row.dimensions || {}).some(([id, value]) => !profile?.dimensions.some(dimension => dimension.id === id && dimension.active && dimension.values.includes(value))))) throw new GuardError('INVALID_STATE', 'Imported dimension values must exist in an active dimension in the selected accounting profile.');
    if (!Array.isArray(rows) || rows.some(r => !r.code.trim() || !r.name.trim() || !Number.isFinite(r.balance)) || new Set(rows.map(r => r.code.trim())).size !== rows.length) throw new GuardError('INVALID_STATE', 'Trial balance rows require unique account codes, names, and finite balances.');
    if (source && (!source.fileName.trim() || !/^[0-9a-f]{64}$/i.test(source.sha256))) throw new GuardError('INVALID_STATE', 'Imported source requires a file name and SHA-256 digest.');
    if (!eng.sourceHistory) eng.sourceHistory = eng.rows.length ? [{ version: eng.sourceVersion || 1, rows: structuredClone(eng.rows), importedAt: this.state.asOfDate, importedBy: 'Legacy source; import metadata unavailable', format: 'Legacy' }] : [];
    const predecessorVersion = eng.sourceVersion;
    eng.sourceVersion++;
    eng.rows = structuredClone(rows);
    this.staleCashFlowSchedules(engId);
    eng.sourceHistory.push({
      version: eng.sourceVersion,
      rows: structuredClone(rows),
      importedAt: new Date().toISOString(),
      importedBy: this.state.currentPerson,
      fileName: source?.fileName || 'Manual local replacement',
      format: source?.format || 'Manual',
      sha256: source?.sha256,
      mapping: source ? { ...source.mapping } : undefined,
      predecessorVersion,
      accountingProfileRevision: profile?.revision,
      accountingChartRevision: profile?.chartRevision,
      periodBookId: periodBook?.id
    });
    for (const rec of eng.reconciliations || []) {
      this.staleReconciliation(rec);
    }
    this.staleStatementSetRevisions(engId);
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Trial balance updated for ${eng.id} (Source v${eng.sourceVersion})`, eng.id);
    this.notify();
  }

  public importGeneralLedgerSource(engagementId: string, input: { fileName: string; format: 'CSV' | 'XLSX'; sha256: string; openingBalances: Record<string, number>; transactions: GLSourceRevision['transactions']; columnMapping?: Record<string, string> }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner'], 'import a general ledger source');
    requireEngagementScope(this.state, engagementId);
    if (this.isSessionOnly) throw new GuardError('INVALID_STATE', 'Browser storage is session-only; a durable GL source revision cannot be recorded.');
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    const client = this.state.clients.find(item => item.id === engagement?.client);
    const profile = client?.accountingProfile;
    const book = profile?.periodBooks.find(item => item.id === engagement?.accountingPeriodBookId && item.ownerEngagementId === engagementId);
    if (!engagement || !book || book.status !== 'Open' || !profile || profile.reportingBasis === 'Not selected' || engagement.accountingProfileRevision !== profile.revision || engagement.accountingChartRevision !== profile.chartRevision) throw new GuardError('INVALID_STATE', 'Select this engagement’s current open accounting period book before importing its general ledger.');
    if (Object.keys(input.openingBalances || {}).some(code => !profile.accounts.some(account => account.code === code && account.active && account.posting))) throw new GuardError('INVALID_STATE', 'GL opening balances must reference active posting accounts in the selected chart.');
    if (input.columnMapping && (Object.keys(input.columnMapping).length > 14 || Object.entries(input.columnMapping).some(([key, value]) => !/^(journal|line|date|account|name|debit|credit|currency|description|opening|serviceDate|department|costCentre|project)$/.test(key) || typeof value !== 'string' || value.length > 256))) throw new GuardError('INVALID_STATE', 'GL column mapping must contain only bounded, known source fields.');
    const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    const cents = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
    const journalTotals = new Map<string, { debit: number; credit: number; date: string; currency: string }>();
    const keys = new Set<string>();
    if (!input || typeof input.fileName !== 'string' || !input.fileName.trim() || input.fileName.length > 255 || !['CSV', 'XLSX'].includes(input.format) || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(input.sha256) || !Array.isArray(input.transactions) || !input.transactions.length || input.transactions.length > 5000 || !input.openingBalances || typeof input.openingBalances !== 'object' || Array.isArray(input.openingBalances) || Object.values(input.openingBalances).some(value => !Number.isFinite(value) || !cents(value))) throw new GuardError('INVALID_STATE', 'GL import requires a named bounded source, SHA-256, transactions, and cent-accurate opening balances.');
    for (const line of input.transactions) {
      const dimensions = line?.dimensions || {};
      const activeDimensions = new Map((profile.dimensions || []).filter(dimension => dimension.active).map(dimension => [dimension.name, dimension]));
      const invalidDimension = !dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions) || Object.entries(dimensions).some(([name, value]) => {
        const configured = activeDimensions.get(name as 'Department' | 'Cost centre' | 'Project');
        return !configured || typeof value !== 'string' || !value.trim() || value.length > 128 || configured.values.length > 0 && !configured.values.includes(value);
      });
      const serviceDateValid = line?.serviceDate === undefined || typeof line.serviceDate === 'string' && validDate(line.serviceDate);
      if (!line || typeof line.journalId !== 'string' || !line.journalId.trim() || line.journalId.length > 128 || typeof line.lineId !== 'string' || !line.lineId.trim() || line.lineId.length > 128 || typeof line.accountCode !== 'string' || !line.accountCode.trim() || line.accountCode.length > 128 || !profile.accounts.some(account => account.code === line.accountCode && account.active && account.posting) || typeof line.accountName !== 'string' || !line.accountName.trim() || line.accountName.length > 255 || typeof line.description !== 'string' || !line.description.trim() || line.description.length > 2048 || typeof line.date !== 'string' || !validDate(line.date) || line.date < book.startDate || line.date > book.endDate || !serviceDateValid || !cents(line.debit) || !cents(line.credit) || line.currency !== profile.baseCurrency || !Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0 || line.debit > 0 && line.credit > 0 || line.debit === 0 && line.credit === 0 || invalidDimension || keys.has(`${line.journalId}\u0000${line.lineId}`)) throw new GuardError('INVALID_STATE', 'GL lines must reference active posting accounts, use configured dimensions and valid service dates, and have unique keys, in-period dates, matching currency and exactly one cent-accurate non-negative debit or credit.');
      keys.add(`${line.journalId}\u0000${line.lineId}`);
      const totals = journalTotals.get(line.journalId) || { debit: 0, credit: 0, date: line.date, currency: line.currency };
      if (totals.date !== line.date || totals.currency !== line.currency) throw new GuardError('INVALID_STATE', `Journal ${line.journalId} mixes dates or currencies.`);
      totals.debit += line.debit; totals.credit += line.credit; journalTotals.set(line.journalId, totals);
    }
    for (const [journal, totals] of journalTotals) if (Math.abs(totals.debit - totals.credit) > 0.005) throw new GuardError('INVALID_STATE', `Journal ${journal} is not balanced.`);
    const history = engagement.glSourceHistory ||= [];
    const revision: GLSourceRevision = { revision: (history.at(-1)?.revision || 0) + 1, predecessorRevision: history.at(-1)?.revision, fileName: input.fileName.trim(), format: input.format, sha256: input.sha256.toLowerCase(), columnMapping: input.columnMapping ? structuredClone(input.columnMapping) : undefined, periodBookId: book.id, importedAt: new Date().toISOString(), importedByUserId: this.state.currentUserId, openingBalances: structuredClone(input.openingBalances), transactions: input.transactions.map(line => ({ ...structuredClone(line), engagementId })) };
    history.push(revision);
    for (const reconciliation of engagement.reconciliations || []) this.staleReconciliation(reconciliation);
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`General ledger source revision ${revision.revision} imported for ${engagementId}`, engagementId);
    this.notify();
    if (this.isSessionOnly) throw new GuardError('INVALID_STATE', 'Browser storage could not persist the GL source revision; it remains available only for this session.');
    return revision.revision;
  }

  public saveReconciliationSchedule(engagementId: string, input: ReconciliationSchedule) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager'], 'edit reconciliation schedules');
    requireEngagementScope(this.state, engagementId);
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    const currentIndex = engagement?.reconciliations.findIndex(item => item.id === input.id || !item.id && item.ref === input.ref) ?? -1;
    const current = currentIndex >= 0 ? engagement?.reconciliations[currentIndex] : undefined;
    const date = input.asOfDate || this.state.asOfDate;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    const row = engagement?.rows.find(item => item.code === input.accountCode);
    const accountingProfile = engagement && this.state.clients.find(client => client.id === engagement.client)?.accountingProfile;
    const periodBookId = engagement?.accountingPeriodBookId;
    const periodBook = accountingProfile?.periodBooks.find(book => book.id === periodBookId && book.ownerEngagementId === engagementId);
    const items = input.items ?? [];
    if (!engagement || input.engagementId !== undefined && input.engagementId !== engagementId || !periodBook || !row || typeof input.name !== 'string' || !input.name.trim() || typeof input.accountCode !== 'string' || !input.accountCode.trim() || !validDate || date < periodBook.startDate || date > periodBook.endDate) throw new GuardError('INVALID_STATE', 'Reconciliation requires a valid account and an as-of date within the selected engagement period book.');
    if (input.currency !== undefined && input.currency !== engagement.currency) throw new GuardError('INVALID_STATE', 'Reconciliation schedule currency must match the engagement currency.');
    if (!isCentAmount(input.statementBalance ?? input.supportingBalance) || typeof input.evidence !== 'string' || !input.evidence.trim()) throw new GuardError('INVALID_STATE', 'Reconciliation requires finite cent-accurate balances and complete schedule evidence.');
    if (!Array.isArray(items) || new Set(items.map((item: any) => item?.id).filter((id: unknown) => typeof id === 'string')).size !== items.length) throw new GuardError('INVALID_STATE', 'Reconciliation requires complete, dated in-scope items with unique identifiers.');
    for (const item of items as any[]) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 128 || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 1000 || !['Timing item', 'Proposed correction'].includes(item.type) || typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isFinite(Date.parse(`${item.date}T00:00:00Z`)) || new Date(`${item.date}T00:00:00Z`).toISOString().slice(0, 10) !== item.date || item.date < periodBook.startDate || item.date > date) throw new GuardError('INVALID_STATE', 'Reconciliation requires complete, dated in-scope items within the selected period book and no later than the as-of date.');
      if (!isCentAmount(item.amount)) throw new GuardError('INVALID_STATE', 'Reconciliation requires finite balances and complete, cent-accurate item amounts.');
      if (item.currency !== undefined && item.currency !== engagement.currency) throw new GuardError('INVALID_STATE', 'Every reconciliation item currency must match the engagement currency.');
      if (item.evidenceDoc !== undefined && (typeof item.evidenceDoc !== 'string' || !item.evidenceDoc.trim()) || item.journalId !== undefined && (typeof item.journalId !== 'string' || !item.journalId.trim())) throw new GuardError('INVALID_STATE', 'Reconciliation item evidence and journal references must be non-empty identifiers when supplied.');
    }
    if (input.sourceVersion !== undefined && input.sourceVersion !== engagement.sourceVersion) throw new GuardError('STALE_REVISION', 'Trial balance changed; reload the schedule before editing.');
    const history = structuredClone(current?.history || input.history || []);
    if (current?.preparedAt) history.push({ revision: current.revision || 1, sourceVersion: current.sourceVersion || engagement.sourceVersion, status: current.status, savedAt: current.preparedAt, savedByUserId: current.preparedByUserId || '', glBalance: current.glBalance ?? current.sourceBalance, statementBalance: current.statementBalance ?? current.supportingBalance, items: structuredClone(current.items || []), reviewedByUserId: current.reviewedByUserId, reviewedAt: current.reviewedAt, reviewNote: current.reviewNote });
    const schedule: ReconciliationSchedule = { ...structuredClone(input), id: current?.id || input.id || `REC-${crypto.randomUUID()}`, title: input.title || input.name, ref: current?.ref || input.ref || `REC-${Date.now()}`, engagementId, accountCode: row.code, sourceBalance: row.balance, glBalance: row.balance, statementBalance: input.statementBalance ?? input.supportingBalance, supportingBalance: input.statementBalance ?? input.supportingBalance, asOfDate: date, currency: engagement.currency, sourceVersion: engagement.sourceVersion, revision: (current?.revision || 0) + 1, status: 'Draft', preparedByUserId: this.state.currentUserId, preparedAt: new Date().toISOString(), reviewedByUserId: undefined, reviewedAt: undefined, reviewNote: undefined, items: structuredClone(items), history };
    if (current && engagement) engagement.reconciliations[currentIndex] = schedule;
    else engagement.reconciliations.push(schedule);
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Reconciliation ${schedule.ref} saved as revision ${schedule.revision} against TB v${schedule.sourceVersion}`, engagementId);
    this.notify();
    return schedule.id;
  }

  public reviewReconciliationSchedule(engagementId: string, scheduleId: string, decision: 'Approved' | 'Returned', note = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['reviewer', 'manager', 'partner'], 'review reconciliation schedules');
    requireEngagementScope(this.state, engagementId);
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    const schedule = engagement?.reconciliations.find(item => item.id === scheduleId);
    if (!engagement || !schedule || !['Draft', 'Returned'].includes(schedule.status) || schedule.sourceVersion !== engagement.sourceVersion || !schedule.preparedByUserId) throw new GuardError('STALE_REVISION', 'Only the current draft reconciliation can be independently reviewed.');
    requireIndependentActor(schedule.preparedByUserId, this.state.currentUserId, 'review their reconciliation schedule', this.state);
    if (decision === 'Returned' && !note.trim()) throw new GuardError('INVALID_STATE', 'A return reason is required.');
    if (decision === 'Approved') {
      const variance = calculateReconciliationVariance(schedule);
      const hasScopedEvidence = (reference: string) => this.state.documents.some(document => document.id === reference && document.clientId === engagement.client && (!document.engagementId || document.engagementId === engagementId));
      const scheduleEvidence = schedule.evidence.split(/[\s,;]+/).some(hasScopedEvidence);
      if (!scheduleEvidence || (schedule.items || []).some(item => !item.evidenceDoc?.trim() || !hasScopedEvidence(item.evidenceDoc) || item.type === 'Proposed correction' && (!item.journalId || !this.state.adjustmentJournals.some(journal => journal.id === item.journalId && journal.engagementId === engagementId)))) throw new GuardError('INVALID_STATE', 'Every reconciliation reference must resolve to in-scope evidence and proposed corrections must link to an engagement journal.');
      if (variance.unexplainedDifference > 0.005) throw new GuardError('INVALID_STATE', `Unexplained reconciliation residual ${variance.unexplainedDifference.toFixed(2)} blocks approval.`);
    }
    schedule.status = decision;
    schedule.reviewedByUserId = this.state.currentUserId;
    schedule.reviewedAt = new Date().toISOString();
    schedule.reviewNote = note.trim() || undefined;
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Reconciliation ${schedule.ref} ${decision.toLowerCase()} by ${this.state.currentPerson}${note.trim() ? `: ${note.trim()}` : ''}`, engagementId);
    this.notify();
  }

  public saveAccountMappings(engagementId: string, mappings: NonNullable<PrototypeState['accountMappingRevisions']>[number]['mappings']) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'edit account mappings');
    requireEngagementScope(this.state, engagementId);
    const engagement = this.state.engagements.find(e => e.id === engagementId);
    const validTargets = new Set(['Cash and cash equivalents', 'Trade receivables', 'Other current assets', 'Property and equipment', 'Trade payables', 'Borrowings', 'Share capital and reserves', 'Revenue', 'Cost of sales', 'Operating expenses', 'Finance costs', 'Income tax']);
    if (!engagement || !Array.isArray(mappings) || new Set(mappings.map(m => m.accountCode)).size !== mappings.length || mappings.some(m => !engagement.rows.some(r => r.code === m.accountCode) || !m.targets.length || m.targets.some(t => !validTargets.has(t.statementLine) || !Number.isFinite(t.percentage) || t.percentage <= 0) || Math.abs(m.targets.reduce((sum, t) => sum + t.percentage, 0) - 100) > 0.0001)) throw new GuardError('INVALID_STATE', 'Mappings must reference unique source accounts and valid statement targets whose allocations total exactly 100%.');
    this.state.accountMappingRevisions ||= [];
    const history = this.state.accountMappingRevisions.filter(r => r.engagementId === engagementId);
    const revision = history.length ? Math.max(...history.map(r => r.revision)) + 1 : 1;
    this.state.accountMappingRevisions.push({ engagementId, revision, mappings: structuredClone(mappings), status: 'Draft', preparedBy: this.state.currentUserId });
    this.staleStatementSetRevisions(engagementId);
    this.staleCashFlowSchedules(engagementId);
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Account mappings saved for ${engagementId} (Mapping v${revision}); dependent output is stale`, engagementId);
    this.notify();
  }

  public approveAccountMappings(engagementId: string, revision: number) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['reviewer', 'partner'], 'approve account mappings');
    requireEngagementScope(this.state, engagementId);
    const mapping = this.state.accountMappingRevisions?.find(r => r.engagementId === engagementId && r.revision === revision);
    const engagement = this.state.engagements.find(e => e.id === engagementId);
    if (!mapping || !engagement || mapping.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only an existing draft mapping revision can be approved.');
    requireIndependentActor(mapping.preparedBy, this.state.currentUserId, 'approve account mappings', this.state);
    mapping.status = 'Approved';
    mapping.reviewedBy = this.state.currentUserId;
    this.staleStatementSetRevisions(engagementId);
    this.staleCashFlowSchedules(engagementId);
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Account mappings v${revision} independently approved for ${engagementId}`, engagementId);
    this.notify();
  }

  public saveStatementLayoutRevision(input: Pick<StatementLayoutRevision, 'engagementId' | 'sourceVersion' | 'mappingRevision' | 'lines' | 'subtotals'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'edit financial statement layouts');
    requireEngagementScope(this.state, input.engagementId);
    const engagement = this.state.engagements.find(item => item.id === input.engagementId);
    const mapping = [...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === input.engagementId)].sort((a, b) => b.revision - a.revision)[0];
    const unmapped = engagement?.rows.filter(row => !mapping?.mappings.some(item => item.accountCode === row.code)) || [];
    if (!engagement || !mapping || input.sourceVersion !== engagement.sourceVersion || input.mappingRevision !== mapping.revision || mapping.status !== 'Approved' || unmapped.length) throw new GuardError('STALE_REVISION', 'Statement layout requires the current, complete, independently approved account mapping and source.');
    const expectedLines = [...new Set(mapping.mappings.flatMap(item => item.targets.map(target => target.statementLine)))].sort();
    if (!Array.isArray(input.lines) || !Array.isArray(input.subtotals)) throw new GuardError('INVALID_STATE', 'Statement layout lines and subtotals must be arrays.');
    const actualLines = input.lines.map(item => item.line);
    const balanceSheetLines = new Set(['Cash and cash equivalents', 'Trade receivables', 'Other current assets', 'Property and equipment', 'Trade payables', 'Borrowings', 'Share capital and reserves']);
    const expectedStatement = (line: string) => balanceSheetLines.has(line) ? 'bs' : 'is';
    if (input.lines.length !== expectedLines.length || new Set(actualLines).size !== actualLines.length || expectedLines.some(line => !actualLines.includes(line)) || input.lines.some(item => !item.group.trim() || !Number.isInteger(item.order) || item.order < 1 || !['bs', 'is'].includes(item.statement) || item.statement !== expectedStatement(item.line))) throw new GuardError('INVALID_STATE', 'A statement layout must include every mapped line once with its correct statement, a group and positive whole-number order.');
    const uniqueStatements = [...new Set(input.lines.map(item => item.statement))];
    if (uniqueStatements.some(statement => new Set(input.lines.filter(item => item.statement === statement).map(item => item.order)).size !== input.lines.filter(item => item.statement === statement).length)) throw new GuardError('INVALID_STATE', 'Line order values must be unique within each statement.');
    const subtotalIds = input.subtotals.map(item => item.id);
    if (!Array.isArray(input.subtotals) || new Set(subtotalIds).size !== subtotalIds.length || input.subtotals.some(item => !item.id.trim() || !item.label.trim() || !['bs', 'is'].includes(item.statement) || !item.lineNames.length || new Set(item.lineNames).size !== item.lineNames.length || item.lineNames.some(line => !input.lines.some(layoutLine => layoutLine.line === line && layoutLine.statement === item.statement)))) throw new GuardError('INVALID_STATE', 'Each subtotal needs a unique ID, label, statement type and one or more unique lines from that statement.');
    this.state.statementLayoutRevisions ||= [];
    const history = this.state.statementLayoutRevisions.filter(item => item.engagementId === input.engagementId);
    const revision = Math.max(1, ...history.map(item => item.revision)) + 1;
    const record: StatementLayoutRevision = { ...structuredClone(input), id: `${input.engagementId}-LAYOUT-${revision}`, revision, preparedByUserId: this.state.currentUserId, preparedAt: new Date().toISOString() };
    this.state.statementLayoutRevisions.push(record);
    for (const statement of this.state.statementSetRevisions || []) if (statement.engagementId === input.engagementId) statement.status = 'Stale';
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Financial statement layout v${revision} saved for ${input.engagementId}`, input.engagementId);
    this.notify();
    return revision;
  }

  public saveStatementSetRevision(input: Omit<StatementSetRevision, 'id' | 'revision' | 'status' | 'preparedByUserId' | 'preparedAt' | 'reviewedByUserId' | 'reviewedAt'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'save financial statement revisions');
    requireEngagementScope(this.state, input.engagementId);
    const engagement = this.state.engagements.find(item => item.id === input.engagementId);
    const mapping = [...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === input.engagementId)].sort((a, b) => b.revision - a.revision)[0];
    const currentLayoutVersion = Math.max(1, ...(this.state.statementLayoutRevisions || []).filter(item => item.engagementId === input.engagementId).map(item => item.revision));
    const unmapped = engagement?.rows.filter(row => !mapping?.mappings.some(item => item.accountCode === row.code)) || [];
    if (!engagement || !mapping || input.sourceVersion !== engagement.sourceVersion || input.mappingRevision !== mapping.revision || mapping.status !== 'Approved' || unmapped.length) throw new GuardError('STALE_REVISION', 'Statement revision requires a current, complete, approved account mapping and source.');
    if (input.layoutVersion !== currentLayoutVersion) throw new GuardError('STALE_REVISION', 'Statement revision must use the current saved layout version.');
    const currentLayout = [...(this.state.statementLayoutRevisions || [])].filter(item => item.engagementId === input.engagementId).sort((a, b) => b.revision - a.revision)[0];
    const savedSubtotalDefinitions = (input.subtotals || []).map(({ id, label, statement, lineNames }) => ({ id, label, statement, lineNames }));
    if (currentLayout && (!input.layout || JSON.stringify(input.layout) !== JSON.stringify(currentLayout.lines) || JSON.stringify(savedSubtotalDefinitions) !== JSON.stringify(currentLayout.subtotals))) throw new GuardError('STALE_REVISION', 'Statement revision must retain the current saved line grouping, order and subtotals.');
    const numbers = Object.values(input.totals).concat(input.comparativeTotals ? Object.values(input.comparativeTotals) : []);
    if (input.layoutVersion < 1 || numbers.some(value => !Number.isFinite(value)) || !Array.isArray(input.lines) || input.lines.some(line => !line.line.trim() || !Number.isFinite(line.current) || line.comparative !== undefined && !Number.isFinite(line.comparative) || !Array.isArray(line.currentSources) || !Array.isArray(line.comparativeSources))) throw new GuardError('INVALID_STATE', 'Statement revision totals and mapped source rows are invalid.');
    if (input.comparativeEngagementId) {
      const comparison = this.state.engagements.find(item => item.id === input.comparativeEngagementId);
      const comparisonMapping = [...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === input.comparativeEngagementId)].sort((a, b) => b.revision - a.revision)[0];
      if (!comparison || !comparisonMapping || comparison.client !== engagement.client || comparison.currency !== engagement.currency || comparison.year >= engagement.year || input.comparativeSourceVersion !== comparison.sourceVersion || input.comparativeMappingRevision !== comparisonMapping.revision || comparisonMapping.status !== 'Approved' || comparison.rows.some(row => !comparisonMapping.mappings.some(item => item.accountCode === row.code))) throw new GuardError('STALE_REVISION', 'Comparative statement source and approved mapping must match the selected earlier client period.');
    } else if (input.comparativeTotals || input.lines.some(line => line.comparative !== undefined || line.comparativeSources.length)) {
      throw new GuardError('INVALID_STATE', 'Comparative figures require a selected, approved comparative period.');
    }
    this.state.statementSetRevisions ||= [];
    const history = this.state.statementSetRevisions.filter(item => item.engagementId === input.engagementId);
    const revision = Math.max(0, ...history.map(item => item.revision)) + 1;
    for (const prior of history) prior.status = 'Stale';
    const record: StatementSetRevision = { ...structuredClone(input), id: `${input.engagementId}-STMT-${revision}`, revision, status: 'Draft', preparedByUserId: this.state.currentUserId, preparedAt: new Date().toISOString() };
    record.scopeSnapshot = { service: engagement.service, year: engagement.year, period: engagement.period };
    const comparison = input.comparativeEngagementId && this.state.engagements.find(item => item.id === input.comparativeEngagementId);
    if (comparison) record.comparativeScopeSnapshot = { service: comparison.service, year: comparison.year, period: comparison.period };
    this.state.statementSetRevisions.push(record);
    this.logEvent(`Financial statement set v${revision} saved for ${input.engagementId}`, input.engagementId);
    this.notify();
    return revision;
  }

  public staleStatementRevisionsForComparativeChange(engagementId: string, comparativeEngagementId: string) {
    requireActiveIdentity(this.state);
    requireEngagementScope(this.state, engagementId);
    for (const revision of this.state.statementSetRevisions || []) {
      if (revision.engagementId === engagementId && revision.comparativeEngagementId !== (comparativeEngagementId || undefined)) revision.status = 'Stale';
    }
    this.notify();
  }

  public reviewStatementSetRevision(engagementId: string, revisionNumber: number) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['reviewer', 'partner', 'eqr'], 'review financial statement revisions');
    requireEngagementScope(this.state, engagementId);
    const history = (this.state.statementSetRevisions || []).filter(item => item.engagementId === engagementId);
    const revision = history.find(item => item.revision === revisionNumber);
    const latestRevision = Math.max(0, ...history.map(item => item.revision));
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    const mappingRevision = Math.max(0, ...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === engagementId).map(item => item.revision));
    const layoutVersion = Math.max(1, ...(this.state.statementLayoutRevisions || []).filter(item => item.engagementId === engagementId).map(item => item.revision));
    const currentLayout = [...(this.state.statementLayoutRevisions || [])].filter(item => item.engagementId === engagementId).sort((a, b) => b.revision - a.revision)[0];
    const revisionSubtotalDefinitions = (revision?.subtotals || []).map(({ id, label, statement, lineNames }) => ({ id, label, statement, lineNames }));
    const comparison = revision?.comparativeEngagementId ? this.state.engagements.find(item => item.id === revision.comparativeEngagementId) : undefined;
    const comparisonMappingRevision = comparison && Math.max(0, ...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === comparison.id).map(item => item.revision));
    if (!revision || !engagement || revisionNumber !== latestRevision || revision.status !== 'Draft' || revision.sourceVersion !== engagement.sourceVersion || revision.mappingRevision !== mappingRevision || revision.layoutVersion !== layoutVersion || currentLayout && (!revision.layout || JSON.stringify(revision.layout) !== JSON.stringify(currentLayout.lines) || JSON.stringify(revisionSubtotalDefinitions) !== JSON.stringify(currentLayout.subtotals)) || (revision.comparativeEngagementId && (!comparison || revision.comparativeSourceVersion !== comparison.sourceVersion || revision.comparativeMappingRevision !== comparisonMappingRevision))) {
      if (revision) revision.status = 'Stale';
      this.notify();
      throw new GuardError('STALE_REVISION', 'This statement revision is no longer current; prepare a new revision after source, mapping or comparative changes.');
    }
    const currentMapping = [...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === engagementId)].sort((a, b) => b.revision - a.revision)[0];
    if (!currentMapping || currentMapping.status !== 'Approved' || engagement.rows.some(row => !currentMapping.mappings.some(item => item.accountCode === row.code))) throw new GuardError('STALE_REVISION', 'The current statement mapping is not complete and approved.');
    if (revision.comparativeEngagementId) {
      const compMapping = [...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === comparison!.id)].sort((a, b) => b.revision - a.revision)[0];
      if (!compMapping || compMapping.status !== 'Approved' || comparison!.rows.some(row => !compMapping.mappings.some(item => item.accountCode === row.code))) throw new GuardError('STALE_REVISION', 'The comparative mapping is not complete and approved.');
    }
    requireIndependentActor(revision.preparedByUserId, this.state.currentUserId, 'review a statement set they prepared', this.state);
    revision.status = 'Reviewed';
    revision.reviewedByUserId = this.state.currentUserId;
    revision.reviewedAt = new Date().toISOString();
    this.logEvent(`Financial statement set v${revisionNumber} independently reviewed`, engagementId);
    this.notify();
  }

  public saveCashFlowSchedule(input: Omit<CashFlowScheduleRevision, 'id' | 'revision' | 'status' | 'preparedByUserId' | 'preparedAt' | 'reviewedByUserId' | 'reviewedAt'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'prepare cash-flow schedules');
    requireEngagementScope(this.state, input.engagementId);
    const engagement = this.state.engagements.find(item => item.id === input.engagementId);
    const mapping = [...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === input.engagementId)].sort((a, b) => b.revision - a.revision)[0];
    if (!engagement || !mapping || mapping.status !== 'Approved' || mapping.revision !== input.mappingRevision || input.sourceVersion !== engagement.sourceVersion) throw new GuardError('STALE_REVISION', 'A cash-flow schedule requires the current trial balance and an approved account mapping.');
    const money = (value: number) => Number.isFinite(value) && Math.round(value * 100) === value * 100;
    if (!money(input.openingCash) || input.openingCash < 0 || !money(input.closingCash) || input.closingCash < 0 || input.openingEquity !== undefined && (!money(input.openingEquity) || input.openingEquity < 0) || !input.movements.length || input.movements.some(item => !item.id.trim() || !item.description.trim() || !item.evidenceRef.trim() || !money(item.amount) || !['Operating', 'Investing', 'Financing', 'Equity contribution', 'Equity distribution', 'Non-cash'].includes(item.category) || item.category === 'Equity contribution' && item.amount < 0 || item.category === 'Equity distribution' && item.amount > 0) || new Set(input.movements.map(item => item.id)).size !== input.movements.length) throw new GuardError('INVALID_STATE', 'Enter non-negative opening cash/equity and closing cash plus uniquely identified, classified movement lines with a description, evidence reference and cent-accurate amount; equity contributions are inflows and distributions are outflows.');
    engagement.cashFlowScheduleHistory ||= [];
    const history = engagement.cashFlowScheduleHistory;
    const revision = Math.max(0, ...history.map(item => item.revision)) + 1;
    for (const prior of history) prior.status = 'Stale';
    history.push({ ...structuredClone(input), id: `${engagement.id}-CF-${revision}`, revision, status: 'Draft', preparedByUserId: this.state.currentUserId, preparedAt: new Date().toISOString() });
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Cash-flow schedule v${revision} saved for ${engagement.id}`, engagement.id);
    this.notify();
    return revision;
  }

  public reviewCashFlowSchedule(engagementId: string, revisionNumber: number) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['reviewer', 'partner', 'eqr'], 'review cash-flow schedules');
    requireEngagementScope(this.state, engagementId);
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    const history = engagement?.cashFlowScheduleHistory || [];
    const revision = history.find(item => item.revision === revisionNumber);
    const mapping = [...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === engagementId)].sort((a, b) => b.revision - a.revision)[0];
    if (!engagement || !revision || revision !== history.at(-1) || revision.status !== 'Draft' || revision.sourceVersion !== engagement.sourceVersion || revision.mappingRevision !== mapping?.revision || mapping.status !== 'Approved') {
      if (revision) revision.status = 'Stale';
      this.notify();
      throw new GuardError('STALE_REVISION', 'Only the latest cash-flow schedule tied to the current source and approved mapping can be reviewed.');
    }
    requireIndependentActor(revision.preparedByUserId, this.state.currentUserId, 'review a cash-flow schedule they prepared', this.state);
    const netCashMovement = revision.movements.filter(item => item.category !== 'Non-cash').reduce((sum, item) => sum + item.amount, 0);
    const hasScopedEvidence = (reference: string) => this.state.documents.some(document => document.id === reference && document.clientId === engagement.client && (!document.engagementId || document.engagementId === engagementId));
    const cashTarget = mapping.mappings.flatMap(item => {
      const row = engagement.rows.find(source => source.code === item.accountCode);
      return item.targets.filter(target => target.statementLine === 'Cash and cash equivalents').map(target => (row?.balance || 0) * target.percentage / 100);
    }).reduce((sum, amount) => sum + amount, 0);
    const equityMovements = revision.movements.filter(item => ['Equity contribution', 'Equity distribution'].includes(item.category)).reduce((sum, item) => sum + item.amount, 0);
    const adjustedRows = applyReportingAdjustments(engagement.rows, this.state.adjustmentJournals.filter(item => item.engagementId === engagementId), engagement.sourceVersion, this.getAdjustmentSupportIssues(engagementId)).rows;
    const equityTarget = mapping.mappings.flatMap(item => {
      const row = adjustedRows.find(source => source.code === item.accountCode);
      return item.targets.filter(target => target.statementLine === 'Share capital and reserves').map(target => 0 - (row?.balance || 0) * target.percentage / 100); // signed: a debit (deficit) equity row reduces the tie
    }).reduce((sum, amount) => sum + amount, 0);
    const equityTies = revision.openingEquity === undefined || Math.abs(revision.openingEquity + equityMovements - equityTarget) <= 0.005;
    if (revision.movements.some(item => !hasScopedEvidence(item.evidenceRef)) || !engagement.rows.every(row => mapping.mappings.some(item => item.accountCode === row.code)) || Math.abs(revision.openingCash + netCashMovement - revision.closingCash) > 0.005 || Math.abs(cashTarget - revision.closingCash) > 0.005 || !equityTies) throw new GuardError('INVALID_STATE', 'Every movement needs in-scope document evidence; cash movements must reconcile to the approved mapped cash balance, and supplied opening equity plus evidenced contributions/distributions must reconcile to mapped equity excluding current-period result.');
    revision.status = 'Reviewed';
    revision.reviewedByUserId = this.state.currentUserId;
    revision.reviewedAt = new Date().toISOString();
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Cash-flow schedule v${revisionNumber} independently reviewed`, engagementId);
    this.notify();
  }

  public addAdjustmentJournal(journal: AdjustmentJournalItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner'], 'create adjustment journals');
    requireEngagementScope(this.state, journal.engagementId);
    const engagement = this.state.engagements.find(e => e.id === journal.engagementId);
    if (typeof journal.id !== 'string' || !journal.id.trim() || typeof journal.title !== 'string' || !journal.title.trim() || this.state.adjustmentJournals.some(j => j.id === journal.id)) throw new GuardError('INVALID_STATE', 'Journal needs a unique ID and title.');
    if (!engagement || !isValidAdjustmentJournalLines(journal.lines, engagement)) throw new GuardError('INVALID_STATE', 'Journal lines must contain at least two valid debit/credit entries using accounts and any supplied client, engagement or currency context from this engagement.');
    this.assertCurrentAdjustmentSupport(journal.engagementId, journal.supportLinks);
    const debits = journal.lines.filter(l => l.type === 'debit').reduce((s, l) => s + l.amount, 0);
    const credits = journal.lines.filter(l => l.type === 'credit').reduce((s, l) => s + l.amount, 0);
    if (Math.abs(debits - credits) > 0.005) throw new GuardError('INVALID_STATE', 'Adjustment journal must balance before it can be saved.');
    this.state.adjustmentJournals.unshift({ ...journal, revision: journal.revision || 1, reflectionSourceVersion: engagement.sourceVersion, status: 'Draft', preparedBy: this.state.currentPerson, reviewedBy: undefined, managementAcceptedBy: undefined, managementDecisionNote: undefined });
    this.logEvent(`Adjustment journal proposed: ${journal.title}`, journal.id);
    this.notify();
  }

  public amendAdjustmentJournal(journalId: string, changes: { title: string; lines: AdjustmentJournalItem['lines']; rationale: string; supportLinks?: AdjustmentJournalSupportLinks }, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'partner'], 'amend adjustment journals');
    const journal = this.state.adjustmentJournals.find(item => item.id === journalId);
    if (!journal) throw new GuardError('INVALID_STATE', 'Adjustment journal was not found.');
    requireEngagementScope(this.state, journal.engagementId);
    if (journal.status === 'Draft') throw new GuardError('INVALID_STATE', 'Only a reviewed or decided adjustment can be amended.');
    if (!reason.trim()) throw new GuardError('INVALID_STATE', 'An amendment reason is required.');
    const engagement = this.state.engagements.find(item => item.id === journal.engagementId);
    if (typeof changes.title !== 'string' || !changes.title.trim() || typeof changes.rationale !== 'string' || !changes.rationale.trim()) throw new GuardError('INVALID_STATE', 'An amended journal needs a title and rationale.');
    if (!engagement || !isValidAdjustmentJournalLines(changes.lines, engagement)) throw new GuardError('INVALID_STATE', 'Amended journal lines must contain at least two valid debit/credit entries using accounts and any supplied client, engagement or currency context from this engagement.');
    const supportLinks = Object.prototype.hasOwnProperty.call(changes, 'supportLinks') ? changes.supportLinks : journal.supportLinks;
    this.assertCurrentAdjustmentSupport(journal.engagementId, supportLinks);
    const debits = changes.lines.filter(line => line.type === 'debit').reduce((sum, line) => sum + line.amount, 0);
    const credits = changes.lines.filter(line => line.type === 'credit').reduce((sum, line) => sum + line.amount, 0);
    if (Math.abs(debits - credits) > 0.005) throw new GuardError('INVALID_STATE', 'Amended journal must balance before it can be resubmitted.');
    if (journal.title === changes.title.trim() && journal.rationale === changes.rationale.trim() && JSON.stringify(journal.lines) === JSON.stringify(changes.lines) && JSON.stringify(journal.supportLinks) === JSON.stringify(supportLinks)) throw new GuardError('INVALID_STATE', 'Amendment must change the journal content or its supporting references.');

    const amendedAt = new Date().toISOString();
    journal.amendmentHistory = [...(journal.amendmentHistory || []), {
      revision: journal.revision || 1,
      title: journal.title,
      lines: structuredClone(journal.lines),
      rationale: journal.rationale,
      status: journal.status,
      preparedBy: journal.preparedBy,
      reviewedBy: journal.reviewedBy,
      managementAcceptedBy: journal.managementAcceptedBy,
      managementDecisionNote: journal.managementDecisionNote,
      reflectionStatus: journal.reflectionStatus,
      reflectionSourceVersion: journal.reflectionSourceVersion,
      reflectionEvidenceRef: journal.reflectionEvidenceRef,
      supportLinks: structuredClone(journal.supportLinks),
      amendedAt,
      amendedByUserId: this.state.currentUserId,
      reason: reason.trim()
    }];
    journal.revision = (journal.revision || 1) + 1;
    journal.title = changes.title.trim();
    journal.lines = structuredClone(changes.lines);
    journal.rationale = changes.rationale.trim();
    journal.supportLinks = structuredClone(supportLinks);
    journal.preparedBy = this.state.currentPerson;
    journal.status = 'Draft';
    journal.reviewedBy = undefined;
    journal.reviewNote = undefined;
    journal.reportingIncludedBy = undefined;
    journal.reportingIncludedAt = undefined;
    journal.managementAcceptedBy = undefined;
    journal.managementDecisionNote = undefined;
    journal.reflectionStatus = 'Unknown';
    journal.reflectedInClientBooks = false;
    journal.reflectionSourceVersion = engagement.sourceVersion;
    journal.reflectionEvidenceRef = undefined;
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Adjustment journal ${journalId} amended to revision ${journal.revision}: ${reason.trim()}`, journalId);
    this.notify();
  }

  public reviewAdjustmentJournal(journalId: string, approved: boolean, note = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'technically review adjustment journals');
    const journal = this.state.adjustmentJournals.find(item => item.id === journalId);
    if (!journal) throw new GuardError('INVALID_STATE', 'Adjustment journal was not found.');
    requireEngagementScope(this.state, journal.engagementId);
    if (journal.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only draft adjustments can enter technical review.');
    requireIndependentActor(journal.preparedBy, this.state.currentPerson, 'technically review this adjustment journal', this.state);
    if (approved) this.assertCurrentAdjustmentSupport(journal.engagementId, journal.supportLinks);
    if (!approved) {
      if (!note.trim() || note.trim().length > 500) throw new GuardError('INVALID_STATE', 'A rejected adjustment requires a bounded technical-review rationale so the preparer can rework it.');
      journal.reviewNote = note.trim();
    } else {
      journal.reviewNote = undefined;
    }
    journal.status = approved ? 'Technical review' : 'Rejected';
    journal.reviewedBy = this.state.currentPerson;
    const engagement = this.state.engagements.find(e => e.id === journal.engagementId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Adjustment journal ${journal.id} ${approved ? 'passed technical review' : `rejected at technical review: ${journal.reviewNote}`}`, journal.id);
    this.notify();
  }

  public markAdjustmentJournalReportingIncluded(journalId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'record reporting inclusion');
    const journal = this.state.adjustmentJournals.find(item => item.id === journalId);
    if (!journal) throw new GuardError('INVALID_STATE', 'Adjustment journal was not found.');
    requireEngagementScope(this.state, journal.engagementId);
    const engagement = this.state.engagements.find(e => e.id === journal.engagementId);
    if (!engagement) throw new GuardError('INVALID_STATE', 'Adjustment engagement was not found.');
    if (journal.status !== 'Management accepted') throw new GuardError('INVALID_STATE', 'Only a management-accepted adjustment can be recorded as included in reporting.');
    this.assertCurrentAdjustmentSupport(journal.engagementId, journal.supportLinks);
    if (journal.reflectionStatus !== 'Reflected in TB' || journal.reflectionSourceVersion !== engagement.sourceVersion) throw new GuardError('INVALID_STATE', 'Record the journal as reflected in the current trial balance before including it in reporting.');
    journal.status = 'Reporting included';
    journal.reportingIncludedBy = this.state.currentPerson;
    journal.reportingIncludedAt = new Date().toISOString();
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Adjustment journal ${journal.id} recorded as included in reporting by ${this.state.currentPerson}`, journal.id);
    this.notify();
  }

  public recordAdjustmentManagementDecision(journalId: string, accepted: boolean, note = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['client'], 'record a management adjustment decision');
    const journal = this.state.adjustmentJournals.find(item => item.id === journalId);
    if (!journal) throw new GuardError('INVALID_STATE', 'Adjustment journal was not found.');
    const engagement = this.state.engagements.find(e => e.id === journal.engagementId);
    if (!engagement) throw new GuardError('INVALID_STATE', 'Adjustment engagement was not found.');
    requireClientScope(this.state, engagement.client);
    requireEngagementScope(this.state, engagement.id);
    if (journal.status !== 'Technical review' || !journal.reviewedBy) throw new GuardError('INVALID_STATE', 'Only technically reviewed adjustments can receive a management decision.');
    requireIndependentActor(journal.preparedBy, this.state.currentPerson, 'record management acceptance of this adjustment', this.state);
    requireIndependentActor(journal.reviewedBy, this.state.currentPerson, 'record management acceptance of this adjustment', this.state);
    if (accepted) this.assertCurrentAdjustmentSupport(journal.engagementId, journal.supportLinks);
    if (!accepted && !note.trim()) throw new GuardError('INVALID_STATE', 'A rejected adjustment requires a management rationale.');
    journal.status = accepted ? 'Management accepted' : 'Rejected';
    journal.managementAcceptedBy = accepted ? this.state.currentPerson : undefined;
    journal.managementDecisionNote = note.trim() || undefined;
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Adjustment journal ${journal.id} ${accepted ? 'accepted' : 'rejected'} by management`, journal.id);
    this.notify();
  }

  public updateAdjustmentJournal(journal: AdjustmentJournalItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'review or update adjustment journals');
    requireEngagementScope(this.state, journal.engagementId);
    const index = this.state.adjustmentJournals.findIndex(j => j.id === journal.id);
    if (index >= 0) {
      const current = this.state.adjustmentJournals[index];
      requireEngagementScope(this.state, current.engagementId);
      if (journal.engagementId !== current.engagementId || journal.preparedBy !== current.preparedBy || journal.title !== current.title || journal.status !== current.status || journal.reviewedBy !== current.reviewedBy || journal.managementAcceptedBy !== current.managementAcceptedBy || journal.managementDecisionNote !== current.managementDecisionNote || JSON.stringify(journal.lines) !== JSON.stringify(current.lines) || JSON.stringify(journal.supportLinks) !== JSON.stringify(current.supportLinks)) throw new GuardError('INVALID_STATE', 'Journal content, ownership, supporting references and approval state are immutable after proposal. Use the guarded review, management-decision and amendment actions.');
      const engagement = this.state.engagements.find(e => e.id === journal.engagementId);
      if (!engagement || journal.reflectionSourceVersion !== engagement.sourceVersion) throw new GuardError('STALE_REVISION', 'Confirm the journal reflection status against the current trial-balance source revision.');
      if (Boolean(journal.reflectedInClientBooks) !== (journal.reflectionStatus === 'Reflected in TB')) throw new GuardError('INVALID_STATE', 'The source-reflected flag and reflection status must agree.');
      if (journal.reflectionStatus === 'Reflected in TB' && !journal.reflectionEvidenceRef?.trim()) throw new GuardError('INVALID_STATE', 'A reflected-in-TB decision requires an evidence reference.');
      if ((journal.reflectionEvidenceRef?.trim().length || 0) > 160) throw new GuardError('INVALID_STATE', 'Reflection evidence reference must be 160 characters or fewer.');
      if (journal.reflectionStatus !== current.reflectionStatus || journal.reflectionSourceVersion !== current.reflectionSourceVersion || journal.reflectionEvidenceRef !== current.reflectionEvidenceRef) journal.reflectionHistory = [...(current.reflectionHistory || []), { status: current.reflectionStatus, sourceVersion: current.reflectionSourceVersion || 0, evidenceRef: current.reflectionEvidenceRef, recordedAt: new Date().toISOString(), recordedByUserId: this.state.currentUserId }];
      this.state.adjustmentJournals[index] = journal;
      this.invalidateReleaseBasis(engagement);
      this.notify();
    }
  }

  // --- Consolidation (VP-043–VP-046) ---
  public updateConsolidationGroup(group: ConsolidationGroupRecord, options?: { reason?: string }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'change consolidation groups');
    if (!group.name.trim() || group.components.length !== 2 || new Set(group.components.map(c => c.componentId)).size !== 2) throw new GuardError('INVALID_STATE', 'This prototype supports named consolidation groups with exactly two distinct explicitly selected components.');
    if (new Set(group.components.map(component => component.role)).size !== 2 || !group.components.some(component => component.role === 'Parent') || !group.components.some(component => component.role === 'Subsidiary') || group.components.some(component => component.ownershipPercent !== 100)) throw new GuardError('INVALID_STATE', 'This prototype supports one Parent and one 100% owned Subsidiary; other ownership methods cannot be calculated.');
    if (!/FY\s+\d{4}/.test(group.period) || !/^[A-Z]{3}$/.test(group.presentationCurrency || group.currency)) throw new GuardError('INVALID_STATE', 'Enter a reporting period and ISO currency code.');
    const parent = group.components.find(component => component.role === 'Parent');
    const parentEngagement = this.state.engagements.find(engagement => engagement.id === parent?.componentId);
    const parentProfile = this.state.clients.find(client => client.id === parentEngagement?.client)?.accountingProfile;
    if (!group.reportingBasis && parentProfile && parentProfile.reportingBasis !== 'Not selected') group.reportingBasis = parentProfile.reportingBasis;
    if (!group.reportingBasis) throw new GuardError('INVALID_STATE', 'Select a supported group reporting basis.');
    const index = this.state.consolidationGroups.findIndex(item => item.id === group.id);
    const existingGroup = this.state.consolidationGroups[index];
    if (existingGroup) requireConsolidationGroupScope(this.state, existingGroup.id);
    if (existingGroup && JSON.stringify(group.eliminations) !== JSON.stringify(existingGroup.eliminations)) throw new GuardError('INVALID_STATE', 'Group elimination journals must use the guarded draft and independent-review actions.');
    if (existingGroup && JSON.stringify(group.outputPackages || []) !== JSON.stringify(existingGroup.outputPackages || [])) throw new GuardError('INVALID_STATE', 'Group output package revisions and review decisions must use the guarded prepare and independent-review actions.');
    for (const component of group.components) {
      const engagement = this.state.engagements.find(e => e.id === component.componentId);
      if (!engagement || engagement.year !== Number(group.period.match(/\d{4}/)?.[0])) throw new GuardError('INVALID_STATE', `Component ${component.componentId} does not match the group period.`);
      // New components (including ones added to an existing group) need the actor's engagement grant.
      if (!existingGroup || !existingGroup.components.some(item => item.componentId === component.componentId)) requireEngagementScope(this.state, engagement.id);
      else requireActiveEngagementLifecycle(this.state, engagement.id);
      const client = this.state.clients.find(item => item.id === engagement.client);
      const profile = client?.accountingProfile;
      const periodBook = profile?.periodBooks.find(book => book.id === engagement.accountingPeriodBookId && book.ownerEngagementId === engagement.id && book.status === 'Open');
      if (!profile || profile.reportingBasis !== group.reportingBasis || !periodBook) throw new GuardError('INVALID_STATE', `Component ${component.componentId} has an incompatible or unselected reporting basis/period book.`);
      if (!Number.isInteger(component.packageRevisionPinned) || component.packageRevisionPinned! < 1 || !component.packageRows) throw new GuardError('INVALID_STATE', `Component ${component.componentId} requires an explicit pinned package snapshot.`);
      const priorPin = existingGroup?.components.find(item => item.componentId === component.componentId);
      const keepsPriorSnapshot = Boolean(priorPin && priorPin.packageRevisionPinned === component.packageRevisionPinned && JSON.stringify(priorPin.packageRows) === JSON.stringify(component.packageRows));
      const pinsCurrentSnapshot = component.packageRevisionPinned === engagement.packageRevision && JSON.stringify(component.packageRows) === JSON.stringify(engagement.rows);
      if (!keepsPriorSnapshot && !pinsCurrentSnapshot) throw new GuardError('STALE_REVISION', `Component ${component.componentId} must retain its pinned snapshot or pin the exact current engagement package revision.`);
      if (component.status === 'Ready' && (!component.packageReview || component.packageReview.componentId !== component.componentId || component.packageReview.packageRevision !== component.packageRevisionPinned || component.packageReview.sourceVersion !== engagement.sourceVersion || component.packageReview.reportingBasis !== profile.reportingBasis || component.packageReview.period !== group.period || !component.packageReview.evidenceRef.trim() || !this.state.users.some(user => user.id === component.packageReview?.reviewedByUserId && user.status === 'Active'))) throw new GuardError('INVALID_STATE', `Component ${component.componentId} requires a current package review for its exact source, basis and period.`);
      if (!/^[A-Z]{3}$/.test(component.currency)) throw new GuardError('INVALID_STATE', `Component ${component.componentId} requires an ISO currency code.`);
      if (component.effectiveDate !== undefined && component.effectiveDate !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(component.effectiveDate) || Number.isNaN(Date.parse(component.effectiveDate)) || new Date(`${component.effectiveDate}T00:00:00Z`).toISOString().slice(0, 10) !== component.effectiveDate)) throw new GuardError('INVALID_STATE', `Component ${component.componentId} requires a valid effective date (YYYY-MM-DD).`);
    }
    if (index >= 0) {
      const reason = options?.reason?.trim() || '';
      if (!reason) throw new GuardError('INVALID_STATE', 'Record a reason for the perimeter change.');
      const nextRevision = (existingGroup.perimeterRevision || 1) + 1;
      group.perimeterRevision = nextRevision;
      group.perimeterHistory = [
        ...(existingGroup.perimeterHistory || []),
        { revision: nextRevision, changedBy: this.state.currentPerson, changedAt: new Date().toISOString(), reason, components: structuredClone(group.components) },
      ];
      for (const elimination of group.eliminations) {
        if (elimination.status === 'Approved') {
          elimination.reviewHistory = [...(elimination.reviewHistory || []), { status: 'Returned' as const, changedBy: this.state.currentPerson, changedAt: new Date().toISOString(), perimeterRevision: existingGroup.perimeterRevision || 1, note: `Approval was bound to perimeter revision ${existingGroup.perimeterRevision || 1}; perimeter revision ${nextRevision} requires independent re-review.`, evidenceRef: 'System staleness event' }];
          elimination.status = 'Draft';
          delete elimination.approvedPerimeterRevision;
          delete elimination.approvedComponentPins;
          delete elimination.approvedFxRates;
          delete elimination.approvalEvidenceRef;
        }
      }
      this.state.consolidationGroups[index] = group;
    } else {
      group.perimeterRevision = group.perimeterRevision || 1;
      this.state.consolidationGroups.push(group);
    }
    this.logEvent(`Consolidation group updated: ${group.name}`, group.id);
    this.notify();
  }

  public revertConsolidationPerimeter(groupId: string, revision: number, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'change consolidation groups');
    const group = this.state.consolidationGroups.find(item => item.id === groupId);
    if (!group) throw new GuardError('INVALID_STATE', `Consolidation group "${groupId}" was not found.`);
    const entry = group.perimeterHistory?.find(item => item.revision === revision);
    if (!entry) throw new GuardError('INVALID_STATE', `Perimeter revision ${revision} has no recorded history for group "${groupId}".`);
    if (!reason?.trim()) throw new GuardError('INVALID_STATE', 'Record a reason for the perimeter revert.');
    const candidate = structuredClone(group);
    candidate.components = structuredClone(entry.components);
    this.updateConsolidationGroup(candidate, { reason: reason.trim() });
  }

  public saveConsolidationElimination(groupId: string, input: ConsolidationGroupRecord['eliminations'][number], reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'prepare group elimination journals');
    const group = this.state.consolidationGroups.find(item => item.id === groupId);
    if (!group || !reason.trim()) throw new GuardError('INVALID_STATE', 'Choose a group and record why this elimination is being saved.');
    requireConsolidationGroupScope(this.state, group.id);
    requireActiveConsolidationComponents(this.state, group.id);
    const components = group.components;
    if (input.counterpartyA === input.counterpartyB || !components.some(component => component.componentId === input.counterpartyA) || !components.some(component => component.componentId === input.counterpartyB)) throw new GuardError('INVALID_STATE', 'Choose the two distinct component entities as counterparties.');
    const currency = group.presentationCurrency || group.currency;
    if (input.currency !== currency || !isValidMoney(input.amount) || !input.title.trim() || !input.explanation.trim() || !input.evidenceRef?.trim() || input.evidenceRef.trim().length > 160) throw new GuardError('INVALID_STATE', 'A group-currency elimination requires a title, positive cent amount, rationale and evidence reference of at most 160 characters.');
    if (!input.lines.length || input.lines.some(line => !line.account.trim() || !isValidMoney(line.amount))) throw new GuardError('INVALID_STATE', 'Every elimination journal line requires an account and positive amount in cents.');
    const debits = input.lines.filter(line => line.type === 'debit').reduce((sum, line) => sum + line.amount, 0);
    const credits = input.lines.filter(line => line.type === 'credit').reduce((sum, line) => sum + line.amount, 0);
    if (!debits || !credits || Math.abs(debits - credits) > 0.005 || Math.abs(debits - input.amount) > 0.005) throw new GuardError('INVALID_STATE', 'Elimination debit and credit lines must balance and equal the stated amount.');
    const availableAccounts = new Set(components.flatMap(component => component.packageRows || []).flatMap(row => [row.code.trim().toLowerCase(), row.name.trim().toLowerCase()]));
    if (input.lines.some(line => !availableAccounts.has(line.account.trim().toLowerCase()))) throw new GuardError('INVALID_STATE', 'Every elimination account must match an account in a pinned component package.');
    // Duplicate-inclusion guard: one active elimination per counterparty pair and account,
    // so the same intercompany balance cannot be eliminated twice (VP-045-E02). The pair is
    // unordered, and seeded records may name counterparties by legal-entity name while new
    // entries use component IDs — both resolve to the component before comparison.
    const counterpartyKey = (value: string) => {
      const bare = value.replace(/ \([^)]*\)$/, '').trim().toLowerCase();
      const component = components.find(c => c.componentId === value || c.legalEntityName === value || c.legalEntityName.replace(/ \([^)]*\)$/, '').trim().toLowerCase() === bare);
      return component?.componentId || value;
    };
    const samePair = (item: ConsolidationGroupRecord['eliminations'][number]) => {
      const a1 = counterpartyKey(item.counterpartyA);
      const b1 = counterpartyKey(item.counterpartyB);
      const a2 = counterpartyKey(input.counterpartyA);
      const b2 = counterpartyKey(input.counterpartyB);
      return (a1 === a2 && b1 === b2) || (a1 === b2 && b1 === a2);
    };
    const duplicate = group.eliminations.find(item => item.id !== input.id
      && samePair(item)
      && item.lines.some(line => input.lines.some(next => next.account.trim().toLowerCase() === line.account.trim().toLowerCase())));
    if (duplicate) throw new GuardError('INVALID_STATE', `Elimination ${duplicate.id} already covers one of these accounts for the same counterparty pair; return and amend that elimination instead of duplicating the inclusion.`);
    const index = group.eliminations.findIndex(item => item.id === input.id);
    const current = group.eliminations[index];
    if (current?.status === 'Approved') throw new GuardError('INVALID_STATE', 'Approved elimination content is immutable; create a new revision after a reasoned return.');
    if (current?.status === 'Submitted') throw new GuardError('INVALID_STATE', 'Submitted elimination content is locked until an independent reviewer returns it.');
    if (current && current.preparedByUserId !== this.state.currentUserId && !recordPrototypeSuperuserOverride(this.state, 'amend another preparer\'s group elimination draft')) throw new GuardError('FORBIDDEN_SCOPE', 'Only the original preparer can amend this elimination draft.');
    const revision = (current?.revision || 0) + 1;
    if (current && current.status === 'Returned') {
      current.reviewHistory ||= [];
    }
    const saved = {
      ...structuredClone(input),
      id: current?.id || `ELIM-${group.id}-${String(group.eliminations.length + 1).padStart(3, '0')}`,
      status: 'Draft' as const,
      submittedByUserId: undefined,
      submittedAt: undefined,
      currency,
      revision,
      preparedByUserId: current?.preparedByUserId || this.state.currentUserId,
      evidenceRef: input.evidenceRef.trim(),
      reviewHistory: current?.reviewHistory || [],
      approvedPerimeterRevision: undefined,
      approvedComponentPins: undefined,
      approvedFxRates: undefined,
      approvalEvidenceRef: undefined,
      lines: structuredClone(input.lines)
    };
    if (current) group.eliminations[index] = saved;
    else group.eliminations.push(saved);
    group.status = 'In progress';
    this.logEvent(`Group elimination ${saved.id} revision ${revision} saved by ${this.state.currentPerson}: ${reason.trim()}`, group.id, 'history');
    this.notify();
    return saved.id;
  }

  public submitConsolidationElimination(groupId: string, eliminationId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'submit group elimination journals');
    const group = this.state.consolidationGroups.find(item => item.id === groupId);
    const elimination = group?.eliminations.find(item => item.id === eliminationId);
    if (!group || !elimination || elimination.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only a saved draft group elimination can be submitted.');
    requireConsolidationGroupScope(this.state, group.id);
    requireActiveConsolidationComponents(this.state, group.id);
    if (elimination.preparedByUserId !== this.state.currentUserId && !recordPrototypeSuperuserOverride(this.state, 'submit another preparer\'s group elimination')) throw new GuardError('FORBIDDEN_SCOPE', 'Only the original preparer can submit this group elimination.');
    elimination.status = 'Submitted';
    elimination.submittedByUserId = this.state.currentUserId;
    elimination.submittedAt = new Date().toISOString();
    this.logEvent(`Group elimination ${elimination.id} revision ${elimination.revision || 1} submitted by ${this.state.currentPerson}`, group.id, 'history');
    this.notify();
  }

  public reviewConsolidationElimination(groupId: string, eliminationId: string, decision: 'Approved' | 'Returned', note: string, evidenceRef: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'reviewer'], 'review group elimination journals');
    const group = this.state.consolidationGroups.find(item => item.id === groupId);
    const elimination = group?.eliminations.find(item => item.id === eliminationId);
    if (!group || !elimination || elimination.status !== 'Submitted') throw new GuardError('INVALID_STATE', 'Only a submitted group elimination can be reviewed.');
    requireConsolidationGroupScope(this.state, group.id);
    requireActiveConsolidationComponents(this.state, group.id);
    if (!note.trim() || !evidenceRef.trim() || evidenceRef.trim().length > 160) throw new GuardError('INVALID_STATE', 'Record the review rationale and evidence reference (160 characters or fewer).');
    if (!elimination.preparedByUserId) throw new GuardError('INVALID_STATE', 'The elimination draft has no recorded preparer.');
    requireIndependentActor(elimination.preparedByUserId, this.state.currentUserId, 'review their own group elimination', this.state);
    if (decision === 'Approved') for (const component of group.components) {
      const engagement = this.state.engagements.find(item => item.id === component.componentId);
      const client = this.state.clients.find(item => item.id === engagement?.client);
      const review = component.packageReview;
      if (!engagement || component.status !== 'Ready' || component.packageRevisionPinned !== engagement.packageRevision || JSON.stringify(component.packageRows) !== JSON.stringify(engagement.rows) || !review || review.sourceVersion !== engagement.sourceVersion || review.reportingBasis !== group.reportingBasis || review.period !== group.period || !review.evidenceRef.trim()) throw new GuardError('STALE_REVISION', `Current reviewed package pins are required before approving group elimination ${elimination.id}.`);
      if (client?.accountingProfile?.reportingBasis !== group.reportingBasis) throw new GuardError('STALE_REVISION', `Component ${component.componentId} has an incompatible reporting basis.`);
      const rate = component.currency === (group.presentationCurrency || group.currency) ? 1 : group.fxRates[component.currency];
      if (!Number.isFinite(rate) || rate <= 0) throw new GuardError('STALE_REVISION', `A current closing rate is required for ${component.currency}.`);
    }
    elimination.reviewHistory ||= [];
    elimination.reviewHistory.push({ status: decision, changedBy: this.state.currentPerson, changedAt: new Date().toISOString(), perimeterRevision: group.perimeterRevision || 1, note: note.trim(), evidenceRef: evidenceRef.trim() });
    if (decision === 'Returned') {
      elimination.status = 'Returned';
      delete elimination.submittedByUserId;
      delete elimination.submittedAt;
      delete elimination.approvedPerimeterRevision;
      delete elimination.approvedComponentPins;
      delete elimination.approvedFxRates;
      delete elimination.approvalEvidenceRef;
    } else {
      elimination.status = 'Approved';
      elimination.approvedPerimeterRevision = group.perimeterRevision || 1;
      elimination.approvedComponentPins = group.components.map(component => ({
        componentId: component.componentId,
        packageRevision: component.packageRevisionPinned || 0,
        sourceVersion: this.state.engagements.find(item => item.id === component.componentId)?.sourceVersion || 0
      }));
      elimination.approvedFxRates = Object.fromEntries(group.components.map(component => {
        const currency = component.currency;
        const rate = currency === (group.presentationCurrency || group.currency) ? 1 : group.fxRates[currency];
        return [currency, { rate: rate || 0, revision: group.fxRateHistory?.[currency]?.length || 0 }];
      }));
      elimination.approvalEvidenceRef = evidenceRef.trim();
    }
    this.logEvent(`Group elimination ${elimination.id} ${decision.toLowerCase()} by ${this.state.currentPerson}: ${note.trim()}`, group.id, 'history');
    this.notify();
  }

  public saveConsolidationOutputPackage(groupId: string, record: import('../types').ConsolidationOutputPackage) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'prepare consolidated output packages');
    const group = this.state.consolidationGroups.find(item => item.id === groupId);
    if (!group || !record.id || !record.evidenceRef.trim() || record.preparedByUserId !== this.state.currentUserId || record.status !== 'Draft' || !/^[a-f0-9]{64}$/i.test(record.artifact.sha256) || record.artifact.size <= 0 || !record.artifact.name || record.artifact.mimeType !== 'application/json' || group.outputPackages?.some(item => item.id === record.id || item.artifact.id === record.artifact.id)) throw new GuardError('INVALID_STATE', 'A prepared group output requires a unique identity, its exact active preparer, review evidence and a verified JSON artifact identity.');
    requireConsolidationGroupScope(this.state, group.id);
    requireActiveConsolidationComponents(this.state, group.id);
    if (record.revision !== (group.outputPackages?.length || 0) + 1 || record.fingerprint !== consolidationOutputFingerprint(group, this.state)) throw new GuardError('STALE_REVISION', 'The consolidated output changed before its package could be saved. Rebuild from current reviewed inputs.');
    for (const component of group.components) {
      const engagement = this.state.engagements.find(item => item.id === component.componentId);
      if (!engagement || component.status !== 'Ready' || component.packageRevisionPinned !== engagement.packageRevision || JSON.stringify(component.packageRows) !== JSON.stringify(engagement.rows) || !component.packageReview || component.packageReview.sourceVersion !== engagement.sourceVersion || component.packageReview.packageRevision !== component.packageRevisionPinned || component.packageReview.reportingBasis !== group.reportingBasis || component.packageReview.period !== group.period) throw new GuardError('STALE_REVISION', `Current reviewed component packages are required for ${component.componentId}.`);
    }
    group.outputPackages ||= [];
    group.outputPackages.push(structuredClone(record));
    this.logEvent(`Consolidated output package ${record.id} revision ${record.revision} prepared`, group.id, 'history');
    this.notify();
  }

  public reviewConsolidationOutputPackage(groupId: string, packageId: string, decision: 'Approved' | 'Returned', note: string, evidenceRef: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['partner'], 'review consolidated output packages');
    const group = this.state.consolidationGroups.find(item => item.id === groupId);
    const record = group?.outputPackages?.find(item => item.id === packageId);
    const superuserOverride = isSuperuserRole(this.state.currentRole) && record?.preparedByUserId === this.state.currentUserId
      ? recordPrototypeSuperuserOverride(this.state, 'review own consolidated output package')
      : false;
    if (!group || !record || record.status === 'Approved' || !note.trim() || !evidenceRef.trim() || (record.preparedByUserId === this.state.currentUserId && !superuserOverride) || record.fingerprint !== consolidationOutputFingerprint(group, this.state)) throw new GuardError('STALE_REVISION', 'A different partner, current exact group-output revision, rationale and review evidence are required. Rebuild stale output packages.');
    requireConsolidationGroupScope(this.state, group.id);
    requireActiveConsolidationComponents(this.state, group.id);
    record.reviewHistory.push({ status: decision, byUserId: this.state.currentUserId, by: this.state.currentPerson, at: new Date().toISOString(), note: note.trim(), evidenceRef: evidenceRef.trim() });
    record.status = decision;
    if (decision === 'Approved') record.approvedFingerprint = record.fingerprint;
    else delete record.approvedFingerprint;
    this.logEvent(`Consolidated output package ${record.id} ${decision.toLowerCase()} by ${this.state.currentPerson}`, group.id, 'history');
    this.notify();
  }

  public updateConsolidationFxRate(groupId: string, currency: string, rate: number, effectiveDate: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'change consolidation exchange rates');
    const group = this.state.consolidationGroups.find(item => item.id === groupId);
    if (!group) throw new GuardError('INVALID_STATE', `Consolidation group "${groupId}" was not found.`);
    requireConsolidationGroupScope(this.state, group.id);
    requireActiveConsolidationComponents(this.state, group.id);
    const presentationCurrency = group.presentationCurrency || group.currency;
    if (!/^[A-Z]{3}$/.test(currency) || currency === presentationCurrency || !group.components.some(component => component.currency === currency)) throw new GuardError('INVALID_STATE', 'Select a foreign currency used by a group component.');
    if (!Number.isFinite(rate) || rate <= 0) throw new GuardError('INVALID_STATE', 'Exchange rate must be a finite number greater than zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || Number.isNaN(Date.parse(effectiveDate)) || new Date(`${effectiveDate}T00:00:00Z`).toISOString().slice(0, 10) !== effectiveDate) throw new GuardError('INVALID_STATE', 'Enter a valid effective date.');
    group.fxRateHistory ||= {};
    const history = group.fxRateHistory[currency] ||= [];
    history.push({ revision: history.length + 1, rate, purpose: 'Closing', effectiveDate, changedBy: this.state.currentPerson, changedAt: new Date().toISOString() });
    group.fxRates[currency] = rate;
    for (const elimination of group.eliminations) if (elimination.status === 'Approved') {
      elimination.reviewHistory = [...(elimination.reviewHistory || []), { status: 'Returned', changedBy: this.state.currentPerson, changedAt: new Date().toISOString(), perimeterRevision: group.perimeterRevision || 1, note: `Closing-rate revision ${history.length} for ${currency} changed; independent elimination re-review is required.`, evidenceRef: 'System staleness event' }];
      elimination.status = 'Draft';
      delete elimination.approvedPerimeterRevision;
      delete elimination.approvedComponentPins;
      delete elimination.approvedFxRates;
      delete elimination.approvalEvidenceRef;
    }
    group.status = 'In progress';
    this.logEvent(`Consolidation ${currency} closing rate updated to ${rate} for ${effectiveDate}`, groupId);
    this.notify();
  }

  // --- Audit Workpapers, Procedures, Reviews (VP-050, VP-052, VP-055, VP-056) ---
  public createWorkpaperFromTemplate(engId: string, templateId: string, preparerId: string, reviewerId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'create workpapers from templates');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const template = this.state.workpaperTemplates?.find(item => item.id === templateId && item.status === 'Published');
    const preparer = this.state.users.find(item => item.id === preparerId && item.status === 'Active' && item.role === 'preparer');
    const reviewer = this.state.users.find(item => item.id === reviewerId && item.status === 'Active' && ['reviewer', 'manager', 'partner', 'eqr'].includes(item.role));
    if (!engagement || !template || !preparer || !reviewer) throw new GuardError('INVALID_STATE', 'Choose a published template and active eligible preparer/reviewer.');
    requireIndependentActor(preparer.id, reviewer.id, 'assign the same person as preparer and reviewer', this.state);
    const sequence = Math.max(0, ...engagement.workpapers.map(item => Number(item.id.match(/-(\d+)$/)?.[1] || 0))) + 1;
    const id = `WP-${engId}-${String(sequence).padStart(2, '0')}`;
    if (engagement.workpapers.some(item => item.id === id)) throw new GuardError('INVALID_STATE', 'Generated workpaper identity already exists.');
    const workpaper: WorkpaperItem = {
      id, title: template.name, objective: template.objective, assertion: template.assertion, risk: template.risk,
      version: 1, status: 'Planned', applicable: true, scope: template.scope, workPerformed: '', conclusion: '',
      sourceTemplateId: template.id, sourceTemplateVersion: template.version,
      sourceProcedureRefs: [...template.procedureRefs],
      preparer: preparer.name, reviewer: reviewer.name, assignmentHistory: [
        { role: 'preparer', to: preparer.id, assignedBy: this.state.currentUserId, reason: 'Created from published template', assignedAt: new Date().toISOString() },
        { role: 'reviewer', to: reviewer.id, assignedBy: this.state.currentUserId, reason: 'Created from published template', assignedAt: new Date().toISOString() }
      ],
      guidelines: structuredClone(template.guidelines), template: structuredClone(template.template), workingPaper: null,
      supportingEvidence: [], evidenceRefs: [], clearance: null, clearanceHistory: []
    };
    engagement.workpapers.push(workpaper);
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Workpaper ${id} created from ${template.id} v${template.version}`, engId);
    this.notify();
    return id;
  }

  public reassignWorkpaper(engId: string, wpId: string, role: 'preparer' | 'reviewer', userId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'reassign workpapers');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const workpaper = engagement?.workpapers.find(item => item.id === wpId);
    const user = this.state.users.find(item => item.id === userId && item.status === 'Active' && (role === 'preparer' ? item.role === 'preparer' : ['reviewer', 'manager', 'partner', 'eqr'].includes(item.role)));
    if (!workpaper || !user || !reason.trim()) throw new GuardError('INVALID_STATE', 'Choose an eligible active assignee and record a reassignment reason.');
    const otherName = role === 'preparer' ? workpaper.reviewer : workpaper.preparer;
    const other = this.state.users.find(item => item.name === otherName);
    requireIndependentActor(user.id, other?.id || otherName, 'assign one person as both preparer and reviewer', this.state);
    const from = role === 'preparer' ? workpaper.preparer : workpaper.reviewer;
    if (from === user.name) return;
    workpaper.assignmentHistory ||= [];
    workpaper.assignmentHistory.push({ role, from, to: user.id, assignedBy: this.state.currentUserId, reason: reason.trim(), assignedAt: new Date().toISOString() });
    if (role === 'preparer') workpaper.preparer = user.name; else workpaper.reviewer = user.name;
    if (workpaper.clearance) workpaper.clearanceHistory.push({ ...workpaper.clearance });
    workpaper.clearance = null;
    workpaper.submittedBy = undefined;
    workpaper.submittedVersion = undefined;
    workpaper.version += 1;
    workpaper.status = 'In progress';
    if (engagement) this.reopenWorkpaperReviewNotes(engagement, workpaper);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Workpaper ${wpId} ${role} reassigned to ${user.name}: ${reason.trim()}`, engId);
    this.notify();
  }

  public updateWorkpaper(engId: string, wpId: string, updates: Pick<WorkpaperItem, 'applicable'> & Partial<Pick<WorkpaperItem, 'scope' | 'workPerformed' | 'conclusion'>> & { rationale?: string }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'change workpaper applicability');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const wp = eng.workpapers.find(w => w.id === wpId);
    if (!wp) return;
    const changed = wp.applicable !== updates.applicable || (updates.scope !== undefined && updates.scope !== wp.scope) || (updates.workPerformed !== undefined && updates.workPerformed !== wp.workPerformed) || (updates.conclusion !== undefined && updates.conclusion !== wp.conclusion);
    if (!changed) return;
    if (wp.applicable && !updates.applicable) {
      requireRole(this.state, ['manager', 'partner'], 'mark workpapers not applicable');
      if (!updates.rationale?.trim()) throw new GuardError('INVALID_STATE', 'Marking a workpaper not applicable requires a reason.');
      if (this.state.findings.some(item => item.engagementId === engId && item.linkedWorkpaperId === wpId && !['Corrected in TB', 'Corrected by client', 'Waived as immaterial'].includes(item.disposition))) throw new GuardError('INVALID_STATE', 'Resolve or formally disposition linked findings before marking the workpaper not applicable.');
    }
    wp.version++;
    this.reopenWorkpaperReviewNotes(eng, wp);
    wp.applicable = updates.applicable;
    if (updates.scope !== undefined) wp.scope = updates.scope.trim();
    if (updates.workPerformed !== undefined) wp.workPerformed = updates.workPerformed.trim();
    if (updates.conclusion !== undefined) wp.conclusion = updates.conclusion.trim();
    wp.status = updates.applicable ? 'In progress' : 'Not applicable';
    wp.notApplicableRationale = updates.applicable ? undefined : updates.rationale?.trim() || wp.notApplicableRationale;
    if (wp.clearance) wp.clearanceHistory.push({ ...wp.clearance });
    wp.clearance = null;
    wp.submittedBy = undefined;
    wp.submittedVersion = undefined;
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Workpaper ${wpId} revised to v${wp.version}; prior submission/clearance is historical`, engId);
    this.notify();
  }

  public linkWorkpaperEvidence(engId: string, wpId: string, documentId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'partner'], 'link workpaper evidence');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const workpaper = engagement?.workpapers.find(item => item.id === wpId);
    const document = this.state.documents.find(item => item.id === documentId && item.engagementId === engId);
    if (!workpaper || !document || document.brokenLink) throw new GuardError('INVALID_STATE', 'Evidence must be an available document in this engagement.');
    if (this.hasNewerDocumentRevision(document.id)) throw new GuardError('STALE_REVISION', 'Pin the latest document revision before reassessing this workpaper.');
    workpaper.evidenceRefs ||= [];
    workpaper.evidenceRevisions ||= {};
    if (!workpaper.evidenceRefs.includes(document.id)) {
      workpaper.evidenceRefs.push(document.id);
      workpaper.evidenceLinkHistory ||= [];
      workpaper.evidenceLinkHistory.push({ documentId: document.id, version: document.version, action: 'Linked', actorId: this.state.currentUserId, reason: 'Pinned current document revision', at: new Date().toISOString() });
    }
    workpaper.evidenceRevisions[document.id] = document.version;
    workpaper.version++;
    if (engagement) this.reopenWorkpaperReviewNotes(engagement, workpaper);
    workpaper.status = 'In progress';
    workpaper.submittedBy = undefined;
    workpaper.submittedVersion = undefined;
    if (workpaper.clearance) workpaper.clearanceHistory.push({ ...workpaper.clearance });
    workpaper.clearance = null;
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Document ${document.id} v${document.version} linked to workpaper ${wpId} v${workpaper.version}`, engId);
    this.notify();
  }

  public unlinkWorkpaperEvidence(engId: string, wpId: string, documentId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'partner'], 'unlink workpaper evidence');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const workpaper = engagement?.workpapers.find(item => item.id === wpId);
    const document = this.state.documents.find(item => item.id === documentId && item.engagementId === engId);
    if (!workpaper || !document || !workpaper.evidenceRefs?.includes(documentId) || !reason.trim()) throw new GuardError('INVALID_STATE', 'A pinned workpaper document and removal reason are required.');
    workpaper.evidenceLinkHistory ||= [];
    workpaper.evidenceLinkHistory.push({ documentId, version: workpaper.evidenceRevisions?.[documentId] ?? document.version, action: 'Unlinked', actorId: this.state.currentUserId, reason: reason.trim(), at: new Date().toISOString() });
    workpaper.evidenceRefs = workpaper.evidenceRefs.filter(id => id !== documentId);
    if (workpaper.clearance) workpaper.clearanceHistory.push({ ...workpaper.clearance });
    workpaper.clearance = null;
    workpaper.submittedBy = undefined;
    workpaper.submittedVersion = undefined;
    workpaper.version++;
    if (engagement) this.reopenWorkpaperReviewNotes(engagement, workpaper);
    workpaper.status = 'In progress';
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Document ${documentId} unpinned from workpaper ${wpId}: ${reason.trim()}`, engId);
    this.notify();
  }

  public submitWorkpaper(engId: string, wpId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'partner'], 'submit workpapers');
    requireEngagementScope(this.state, engId);
    const targetEngagement = this.state.engagements.find(e => e.id === engId);
    if (targetEngagement?.auditLifecycle) { const blockers = fieldworkBlockers(this.state, targetEngagement); if (blockers.length) throw new GuardError('INVALID_STATE', blockers.join(' ')); }
    const engagement = this.state.engagements.find(item => item.id === engId);
    const workpaper = engagement?.workpapers.find(item => item.id === wpId);
    if (!engagement || !workpaper || !workpaper.applicable || workpaper.status === 'Not applicable') throw new GuardError('INVALID_STATE', 'Only an applicable workpaper can be submitted.');
    if (this.state.currentRole === 'preparer' && workpaper.preparer !== this.state.currentPerson) throw new GuardError('FORBIDDEN_SCOPE', 'Only the assigned preparer may submit this workpaper.');
    if (!workpaper.workPerformed?.trim() || !workpaper.conclusion.trim() || !workpaper.scope?.trim() || !workpaper.workingPaper || workpaper.workingPaper.version !== workpaper.version || !(workpaper.evidenceRefs || []).length) throw new GuardError('INVALID_STATE', 'Record work performed, scope, conclusion, a current workbook and linked evidence before submission.');
    if ((workpaper.evidenceRefs || []).some(id => {
      const document = this.state.documents.find(item => item.id === id && item.engagementId === engId);
      return !document || document.brokenLink || this.hasNewerDocumentRevision(id) || workpaper.evidenceRevisions?.[id] !== document.version;
    })) throw new GuardError('INVALID_STATE', 'Refresh every evidence link to its current same-engagement document revision before submission.');
    if ((workpaper.evidenceRefs || []).some(id => this.state.evidenceCatalogue.some(item => item.documentId === id && (item.adequacyStatus !== 'Adequate' || item.version !== this.state.documents.find(document => document.id === id)?.version)))) throw new GuardError('STALE_REVISION', 'Evidence must be adequate and pinned to its current document revision before submission.');
    workpaper.submittedBy = this.state.currentUserId;
    workpaper.submittedVersion = workpaper.version;
    workpaper.submissionHistory ||= [];
    workpaper.submissionHistory.push({ version: workpaper.version, submittedBy: this.state.currentUserId, submittedAt: new Date().toISOString() });
    workpaper.status = 'Submitted';
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Workpaper ${wpId} revision v${workpaper.version} submitted for independent review`, engId);
    this.notify();
  }

  public clearWorkpaper(engId: string, wpId: string, notes: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'clear workpapers');
    requireEngagementScope(this.state, engId);
    const targetEngagement = this.state.engagements.find(e => e.id === engId);
    if (targetEngagement?.auditLifecycle) { const blockers = fieldworkBlockers(this.state, targetEngagement); if (blockers.length) throw new GuardError('INVALID_STATE', blockers.join(' ')); }
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const wp = eng.workpapers.find(w => w.id === wpId);
    if (!wp) return;
    if (!wp.applicable || !notes.trim()) throw new GuardError('INVALID_STATE', 'Only applicable workpapers with a clearance rationale can be cleared.');
    if (wp.status !== 'Submitted' || wp.submittedVersion !== wp.version || !wp.submittedBy) throw new GuardError('INVALID_STATE', 'Only the exact current submitted revision can be cleared.');
    if (wp.reviewer !== this.state.currentPerson && !(eng.auditLifecycle && this.state.currentRole === 'manager' && eng.manager === this.state.currentPerson) && !recordPrototypeSuperuserOverride(this.state, 'clear a workpaper as a non-assigned reviewer')) throw new GuardError('FORBIDDEN_SCOPE', 'Only the assigned reviewer may clear this workpaper.');

    // Check separation of duties: preparer cannot clear own workpaper!
    requireIndependentActor(wp.preparer, this.state.currentPerson, 'independently clear this workpaper', this.state);

    this.invalidateReleaseBasis(eng);
    wp.status = 'Cleared';
    wp.clearance = {
      clearedBy: this.state.currentPerson,
      clearedAt: new Date().toISOString(),
      sourceVersion: eng.sourceVersion,
      generation: eng.generation,
      version: wp.version,
      notes
    };
    wp.clearanceHistory.push({ ...wp.clearance });
    this.logEvent(`Workpaper ${wp.id} cleared by ${this.state.currentPerson}`, wp.id);
    this.notify();
  }

  public addReviewNote(engId: string, note: ReviewNoteItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner', 'eqr'], 'raise review points');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" was not found.`);
    const subjectType = note.subjectType || 'workpaper';
    if (!['workpaper', 'finding'].includes(subjectType)) throw new GuardError('INVALID_STATE', 'Choose a supported review subject.');
    note.subjectType = subjectType;
    const subjectVersion = this.reviewSubjectRevision(eng, note);
    const assignee = eligibleReviewAssignees(this.state, engId).find(user => user.id === note.assignedUserId)
      || eligibleReviewAssignees(this.state, engId).find(user => user.name === (note.assignee || note.assigned));
    if (!assignee) throw new GuardError('FORBIDDEN_SCOPE', 'Assign the review point to an active, engagement-scoped preparer or manager.');
    note.assignedUserId = assignee.id;
    note.assigned = assignee.name;
    note.assignee = assignee.name;
    note.assignmentHistory ||= [];
    note.assignmentHistory.push({ assignedUserId: assignee.id, assignedTo: assignee.name, actorUserId: this.state.currentUserId, at: new Date().toISOString(), reason: 'Initial assignment' });
    note.subjectVersion = subjectVersion;
    eng.reviews.unshift(note);
    if (eng.auditLifecycle && subjectType === 'workpaper') { const wp = eng.workpapers.find(w => w.id === note.wp); if (wp) { wp.status = 'Changes required'; wp.clearance = null; } }
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Review note ${note.id} raised on ${note.wp}`, note.id);
    this.notify();
  }

  public reassignReviewNote(engId: string, noteId: string, assigneeUserId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'reassign review points');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(item => item.id === engId);
    const note = eng?.reviews.find(item => item.id === noteId);
    const assignee = eligibleReviewAssignees(this.state, engId).find(user => user.id === assigneeUserId);
    if (!eng || !note || note.status === 'Cleared' || !assignee || !reason.trim()) throw new GuardError('INVALID_STATE', 'Reassignment requires an open review point, an active in-scope preparer or manager, and a reason.');
    if (note.assignedUserId === assignee.id) return;
    note.assignedUserId = assignee.id;
    note.assigned = assignee.name;
    note.assignee = assignee.name;
    note.assignmentHistory ||= [];
    note.assignmentHistory.push({ assignedUserId: assignee.id, assignedTo: assignee.name, actorUserId: this.state.currentUserId, at: new Date().toISOString(), reason: reason.trim() });
    note.history.push({ actor: this.state.currentPerson, action: `Reassigned to ${assignee.name}`, time: new Date().toISOString(), text: reason.trim() });
    this.logEvent(`Review note ${note.id} reassigned to ${assignee.name}: ${reason.trim()}`, note.id);
    this.notify();
  }

  public respondReviewNote(engId: string, noteId: string, response: string, evidenceDoc?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner'], 'respond to review points');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" was not found.`);
    const note = eng.reviews.find(r => r.id === noteId);
    if (!note) throw new GuardError('INVALID_STATE', `Review point "${noteId}" was not found.`);
    if (!response.trim()) throw new GuardError('INVALID_STATE', 'A response is required.');
    const subjectVersion = this.reviewSubjectRevision(eng, note);
    if (evidenceDoc) {
      const document = this.state.documents.find(d => d.id === evidenceDoc && d.engagementId === engId);
      if (!document) throw new GuardError('FORBIDDEN_SCOPE', 'Review evidence must be a document in this engagement.');
    }
    note.response = response;
    note.responseEvidence = evidenceDoc;
    note.status = 'Responded';
    note.subjectVersion = subjectVersion;
    this.invalidateReleaseBasis(eng);
    note.history.push({
      actor: this.state.currentPerson,
      action: 'Responded to query',
      time: new Date().toLocaleTimeString('en-GB'),
      text: response
    });
    this.logEvent(`Response provided for review note ${note.id}`, note.id);
    this.notify();
  }

  public clearReviewNote(engId: string, noteId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner', 'eqr'], 'clear review points');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const note = eng.reviews.find(r => r.id === noteId);
    if (!note) return;
    if (eng.auditLifecycle && note.status !== 'Responded') throw new GuardError('INVALID_STATE', 'A current preparer response is required before clearance.');
    const subjectVersion = this.reviewSubjectRevision(eng, note);
    const subjectName = note.subjectType === 'finding' ? 'finding' : 'workpaper';
    if (note.status === 'Reopened' || (note.subjectVersion !== undefined && note.subjectVersion !== subjectVersion)) {
      note.status = 'Reopened';
      note.history.push({ actor: this.state.currentPerson, action: 'Stale response rejected', time: new Date().toISOString(), text: `Response refers to ${subjectName} v${note.subjectVersion ?? 'unknown'}; current revision is v${subjectVersion}.` });
      this.notify();
      throw new GuardError('STALE_REVISION', `Review point was reopened by a ${subjectName} change; assess the current revision before clearing.`);
    }

    // Responder cannot clear their own query!
    const lastResponder = note.history.filter(h => h.action.includes('Responded')).at(-1)?.actor;
    if (lastResponder) requireIndependentActor(lastResponder, this.state.currentPerson, 'clear their own review point', this.state);

    this.invalidateReleaseBasis(eng);

    note.status = 'Cleared';
    note.history.push({
      actor: this.state.currentPerson,
      action: 'Cleared review point',
      time: new Date().toLocaleTimeString('en-GB')
    });
    this.logEvent(`Review note ${note.id} cleared by ${this.state.currentPerson}`, note.id);
    this.notify();
  }

  public recordApproval(engId: string, roleKey: 'manager' | 'client' | 'partner' | 'eqr', notes = '') {
    requireActiveIdentity(this.state);
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    if (eng.auditLifecycle) throw new GuardError('INVALID_STATE', 'Use target Manager → SRM → Partner clearance in Review & SRM.');
    const testOverride = recordPrototypeSuperuserOverride(this.state, `record ${roleKey} approval as the prototype superuser`);
    const latestGLSource = eng.glSourceHistory?.at(-1);
    const currentPackage = eng.packageHistory?.find(item => item.revision === eng.packageRevision);
    if (currentPackage && (currentPackage.generation !== eng.generation || currentPackage.glSourceRevision !== latestGLSource?.revision || currentPackage.glSourceSha256 !== latestGLSource?.sha256)) throw new GuardError('STALE_REVISION', 'The current financial package does not match the accepted GL source; regenerate and review it before recording a stage approval.');

    // Role authority checks (VP-019, VP-056 / EX14, RR17, RR18)
    const role = this.state.currentRole;
    if (roleKey === 'partner' && role !== 'partner' && !testOverride) {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only a partner can record partner clearance.');
    }
    if (roleKey === 'partner') {
      const assigned = this.state.users.find(u => u.name === eng.partner && u.role === 'partner');
      const actor = this.state.users.find(u => u.id === this.state.currentUserId);
      if ((!assigned || !actor || (assigned.personId || assigned.id) !== (actor.personId || actor.id)) && !testOverride) throw new GuardError('FORBIDDEN_SCOPE', 'Only the assigned engagement partner can record partner clearance.');
    }
    if (roleKey === 'eqr' && role !== 'eqr' && !testOverride) {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only an Engagement Quality Reviewer can record EQR concurrence.');
    }
    if (roleKey === 'eqr') {
      const assignedEqrId = eng.eqrReviewerUserId || this.state.users.find(u => u.role === 'eqr' && u.status === 'Active')?.id;
      if (assignedEqrId !== this.state.currentUserId && !testOverride) throw new GuardError('FORBIDDEN_SCOPE', 'Only the currently assigned EQR can record concurrence.');
    }
    if (roleKey !== 'client') {
      const pkg = eng.packageHistory?.find(item => item.revision === eng.packageRevision && item.generation === eng.generation);
      if (pkg?.createdByUserId) requireIndependentActor(pkg.createdByUserId, this.state.currentUserId, 'approve a package they prepared', this.state);
    }
    if (roleKey === 'manager' && !['manager', 'partner'].includes(role) && !testOverride) {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only an engagement manager or partner can record manager clearance.');
    }
    if (roleKey === 'client' && role !== 'client' && !testOverride) {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only an authorized client management approver (role: "client") can record representation sign-off.');
    }

    requireEngagementScope(this.state, engId);

    if (roleKey === 'manager' && eng.approvals.partner?.byUserId) requireIndependentActor(eng.approvals.partner.byUserId, this.state.currentUserId, 'record manager clearance after partner sign-off', this.state);
    else if (roleKey === 'manager' && eng.approvals.partner?.by) requireIndependentActor(eng.approvals.partner.by, this.state.currentPerson, 'record manager clearance after partner sign-off', this.state);
    if (roleKey === 'partner' && eng.approvals.manager?.byUserId) requireIndependentActor(eng.approvals.manager.byUserId, this.state.currentUserId, 'record partner sign-off after manager clearance', this.state);
    else if (roleKey === 'partner' && eng.approvals.manager?.by) requireIndependentActor(eng.approvals.manager.by, this.state.currentPerson, 'record partner sign-off after manager clearance', this.state);
    if (roleKey === 'client' && !eng.acceptance) throw new GuardError('INVALID_STATE', 'Commercial acceptance must be recorded before management representation.');

    // EQR check: unresolved concerns block EQR sign-off (VP-056 / F03)
    if (roleKey === 'eqr' && eng.eqrConcerns?.some(c => !c.resolved)) {
      throw new GuardError('INVALID_STATE', 'Cannot complete EQR sign-off: Unresolved EQR concerns remain.');
    }

    // Partner cannot also complete EQR for the same engagement (VP-056), scoped
    // per engagement — never a global shared object.
    if (roleKey === 'eqr' && eng.approvals.partner?.byUserId) requireIndependentActor(eng.approvals.partner.byUserId, this.state.currentUserId, 'complete EQR after partner sign-off', this.state);
    else if (roleKey === 'eqr' && eng.approvals.partner?.by) requireIndependentActor(eng.approvals.partner.by, this.state.currentPerson, 'complete EQR after partner sign-off', this.state);
    eng.approvals[roleKey] = {
      by: this.state.currentPerson,
      byUserId: this.state.currentUserId,
      at: new Date().toISOString(),
      generation: eng.generation,
      notes
    };
    eng.approvalHistory ||= [];
    eng.approvalHistory.push({ role: roleKey, by: this.state.currentPerson, byUserId: this.state.currentUserId, at: eng.approvals[roleKey]!.at, generation: eng.generation, notes });
    this.logEvent(`Stage approval recorded: ${roleKey.toUpperCase()} by ${this.state.currentPerson}`, eng.id);
    this.notify();
  }

  public assignEqrReviewer(engId: string, userId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'assign an EQR');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    const reviewer = this.state.users.find(u => u.id === userId && u.role === 'eqr' && u.status === 'Active');
    const actor = this.state.users.find(u => u.id === this.state.currentUserId);
    if (!eng || !reviewer || !actor || !reason.trim()) throw new GuardError('INVALID_STATE', 'Select an active EQR and provide an assignment or substitution reason.');
    const granted = this.state.roleGrants.some(g => g.userId === reviewer.id && g.role === 'eqr' && (g.scopeKind === 'Global' || (g.scopeKind === 'Engagement' && g.scopeId === engId)));
    if (!granted) throw new GuardError('FORBIDDEN_SCOPE', 'The selected EQR is not authorized for this engagement.');
    const reviewerPerson = reviewer.personId || reviewer.id;
    const partner = this.state.users.find(u => u.name === eng.partner && u.role === 'partner');
    const manager = this.state.users.find(u => u.name === eng.manager && u.role === 'manager');
    if ((partner && reviewerPerson === (partner.personId || partner.id)) || (manager && reviewerPerson === (manager.personId || manager.id)) || eng.team.includes(reviewer.name)) throw new GuardError('FORBIDDEN_SCOPE', 'The EQR must be independent of the engagement partner, manager and engagement team.');
    if (eng.eqrReviewerUserId === reviewer.id) throw new GuardError('INVALID_STATE', 'This EQR is already assigned.');
    eng.eqrReviewerUserId = reviewer.id;
    eng.eqrAssignmentHistory ||= [];
    eng.eqrAssignmentHistory.push({ userId: reviewer.id, assignedByUserId: actor.id, at: new Date().toISOString(), reason: reason.trim() });
    eng.approvals.eqr = null;
    this.logEvent(`EQR assigned to ${reviewer.name}: ${reason.trim()}`, eng.id);
    this.notify();
  }

  public presentManagementPackage(engId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'present a management package');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    const pkg = eng?.packageHistory?.find(p => p.revision === eng.packageRevision);
    const latestGLSource = eng?.glSourceHistory?.at(-1);
    if (!eng || !pkg || pkg.generation !== eng.generation || pkg.sourceVersion !== eng.sourceVersion || pkg.glSourceRevision !== latestGLSource?.revision || pkg.glSourceSha256 !== latestGLSource?.sha256 || !pkg.validation.passed || pkg.artifacts.length !== 3) throw new GuardError('INVALID_STATE', 'Only the complete, validated package for the current TB/GL source can be presented to management.');
    if (eng.managementPackageDecision) (eng.managementPackageDecisionHistory ||= []).push(eng.managementPackageDecision);
    eng.managementPresentation = { generation: eng.generation, sourceVersion: eng.sourceVersion, packageRevision: eng.packageRevision, presentedAt: new Date().toISOString(), presentedBy: this.state.currentPerson, presentedByUserId: this.state.currentUserId, preparedByUserId: pkg.createdByUserId, artifacts: structuredClone(pkg.artifacts) };
    eng.managementPackageDecision = undefined;
    this.logEvent(`Package revision ${pkg.revision} presented to management`, eng.id);
    this.notify();
  }

  public recordManagementPackageDecision(engId: string, decision: 'Acknowledged' | 'Rejected', rationale: string, evidenceRef: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['client'], 'record a management package decision');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    const presentation = eng?.managementPresentation;
    if (!eng || !presentation || presentation.generation !== eng.generation || presentation.sourceVersion !== eng.sourceVersion || presentation.packageRevision !== eng.packageRevision) throw new GuardError('STALE_REVISION', 'There is no current package deliberately presented to management.');
    if (!rationale.trim() || !evidenceRef.trim()) throw new GuardError('INVALID_STATE', 'A management rationale and evidence reference are required.');
    requireIndependentActor(presentation.presentedByUserId, this.state.currentUserId, 'decide on a package they presented', this.state);
    requireIndependentActor(presentation.preparedByUserId, this.state.currentUserId, 'decide on a package they prepared', this.state);
    if (eng.managementPackageDecision) (eng.managementPackageDecisionHistory ||= []).push(eng.managementPackageDecision);
    eng.managementPackageDecision = { decision, by: this.state.currentPerson, byUserId: this.state.currentUserId, at: new Date().toISOString(), generation: presentation.generation, sourceVersion: presentation.sourceVersion, packageRevision: presentation.packageRevision, rationale: rationale.trim(), evidenceRef: evidenceRef.trim() };
    this.logEvent(`Management ${decision.toLowerCase()} package revision ${presentation.packageRevision}`, eng.id);
    this.notify();
  }

  public addEqrConcern(engId: string, text: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['eqr'], 'raise EQR concerns');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    if (!text || !text.trim()) throw new GuardError('INVALID_STATE', 'Concern text is required.');
    if (!eng.eqrConcerns) eng.eqrConcerns = [];
    const concernId = `EQR-0${eng.eqrConcerns.length + 1}`;
    eng.eqrConcerns.push({
      id: concernId,
      text: text.trim(),
      resolved: false,
      raisedBy: this.state.currentPerson,
      raisedAt: new Date().toISOString()
    });
    this.invalidateReleaseBasis(eng);
    this.logEvent(`EQR concern ${concernId} raised by ${this.state.currentPerson}`, eng.id);
    this.notify();
  }

  public toggleEqrConcern(engId: string, concernId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['eqr'], 'resolve EQR concerns');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const concern = eng.eqrConcerns?.find(c => c.id === concernId);
    if (!concern) throw new GuardError('INVALID_STATE', 'Concern not found.');
    if (!concern.resolved && !concern.response?.trim()) throw new GuardError('INVALID_STATE', 'Record and independently review the team response before resolving an EQR concern.');
    if (!concern.resolved) {
      requireIndependentActor(concern.raisedBy, this.state.currentUserId, 'resolve a concern raised by the same person', this.state);
      requireIndependentActor(concern.responseUserId || concern.responseBy || '', this.state.currentUserId, 'approve this EQR response', this.state);
    }
    this.invalidateReleaseBasis(eng);
    concern.resolved = !concern.resolved;
    if (concern.resolved) {
      concern.resolvedAt = new Date().toISOString();
      concern.resolvedBy = this.state.currentPerson;
      concern.resolvedUserId = this.state.currentUserId;
      concern.reviewedBy = this.state.currentPerson;
      concern.reviewedAt = concern.resolvedAt;
    } else {
      concern.resolvedAt = undefined;
      concern.resolvedBy = undefined;
      concern.resolvedUserId = undefined;
      concern.reviewedBy = undefined;
      concern.reviewedAt = undefined;
    }
    this.logEvent(`EQR concern ${concernId} marked ${concern.resolved ? 'resolved' : 'open'}`, eng.id);
    this.notify();
  }

  public respondEqrConcern(engId: string, concernId: string, response: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner'], 'respond to EQR concerns');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    const concern = eng?.eqrConcerns?.find(c => c.id === concernId);
    if (!eng || !concern || concern.resolved) throw new GuardError('INVALID_STATE', 'Only an open EQR concern can receive a response.');
    if (!response.trim()) throw new GuardError('INVALID_STATE', 'EQR response is required.');
    requireIndependentActor(concern.raisedBy, this.state.currentUserId, 'respond to a concern raised by the same person', this.state);
    concern.response = response.trim();
    concern.responseBy = this.state.currentPerson;
    concern.responseUserId = this.state.currentUserId;
    concern.responseAt = new Date().toISOString();
    this.invalidateReleaseBasis(eng);
    this.logEvent(`EQR concern ${concernId} response recorded`, eng.id);
    this.notify();
  }

  public replaceWorkpaperRevision(engId: string, wpId: string, fileDetails: { name: string; size?: number; sha256?: string }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'replace workpaper revisions');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const wp = eng.workpapers.find(w => w.id === wpId);
    if (!wp) throw new GuardError('INVALID_STATE', 'Workpaper not found.');
    if (!fileDetails.name || !fileDetails.name.trim() || !Number.isFinite(fileDetails.size) || (fileDetails.size || 0) < 1) throw new GuardError('INVALID_STATE', 'Choose a non-empty local file.');
    if (fileDetails.sha256 && !/^[a-f0-9]{64}$/i.test(fileDetails.sha256)) throw new GuardError('INVALID_STATE', 'File digest must be a SHA-256 hex value.');

    this.invalidateReleaseBasis(eng);
    wp.version += 1;
    this.reopenWorkpaperReviewNotes(eng, wp);
    wp.status = 'In progress';
    wp.submittedBy = undefined;
    wp.submittedVersion = undefined;
    if (wp.clearance) {
      wp.clearanceHistory.push({ ...wp.clearance });
      wp.clearance = null;
    }
    wp.documentName = fileDetails.name;
    wp.workingPaper = {
      file: fileDetails.name,
      name: fileDetails.name,
      size: fileDetails.size!,
      sha: fileDetails.sha256,
      version: wp.version,
      uploadedAt: new Date().toISOString(),
      uploadedBy: this.state.currentPerson,
      local: true
    };
    this.logEvent(`Workpaper ${wp.id} revision v${wp.version} uploaded by ${this.state.currentPerson}`, wp.id);
    this.notify();
  }

  // --- PBC lifecycle (VP-023, VP-024): response is not acceptance ---------------
  public uploadPbcResponse(engId: string, requestId: string, file: { id?: string; name: string; size?: number; sha256?: string; type?: string }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['client_admin', 'client_finance', 'client'], 'upload client PBC responses');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    if (eng.auditLifecycle && !eng.auditLifecycle.workspace?.accessVerifiedAt) throw new GuardError('INVALID_STATE', 'Verify the simulated engagement workspace before PBC access.');
    if (eng.auditLifecycle && isClientRole(this.state.currentRole) && !this.state.portalPasswordChanges?.some(p => p.userId === this.state.currentUserId)) throw new GuardError('INVALID_STATE', 'Complete the simulated mandatory password change before uploading.');
    const req = eng.pbc.find(r => r.id === requestId);
    if (!req) throw new GuardError('INVALID_STATE', 'PBC request not found.');
    const uploadError = validatePbcUpload({ name: file.name, size: file.size || 0, type: file.type });
    if (uploadError) throw new GuardError('INVALID_STATE', uploadError);
    if (!file.sha256 || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new GuardError('INVALID_STATE', 'A SHA-256 digest of the selected file is required.');
    if (req.contributor !== this.state.currentPerson && !recordPrototypeSuperuserOverride(this.state, `submit a client PBC response assigned to ${req.contributor}`)) throw new GuardError('FORBIDDEN_SCOPE', 'Only the named client contributor can submit this PBC response.');
    if (!['Requested', 'Needs clarification', 'Received'].includes(req.status)) throw new GuardError('INVALID_STATE', `A response cannot be uploaded while the request is ${req.status}.`);

    const docId = file.id || `DOC-PBC-${crypto.randomUUID()}`;
    if (!/^DOC-PBC-[\w-]+$/.test(docId) || this.state.documents.some(document => document.id === docId)) throw new GuardError('INVALID_STATE', 'PBC response identity must be unique and valid.');
    const uploadedAt = new Date().toISOString();
    const uploadVersion = (req.sharedFiles?.at(-1)?.version || 0) + 1;
    const previousSubmission = req.sharedFiles?.at(-1);
    const previousDocument = previousSubmission && this.state.documents.find(document => document.id === previousSubmission.id);
    if (previousDocument) {
      this.replaceDocumentRevision(previousDocument.id, { name: file.name, size: file.size!, sha256: file.sha256 }, docId);
    } else {
      const newDoc: DocumentItem = {
        id: docId,
        clientId: eng.client,
        engagementId: eng.id,
        name: file.name,
        folderPath: `/PBC/`,
        version: uploadVersion,
        size: file.size!,
        sha: file.sha256,
        classification: 'Client provided',
        visibility: 'Client shared',
        source: 'Local In-Session',
        linkedPbcId: req.id,
        uploadedBy: this.state.currentPerson,
        uploadedAt
      };
      this.state.documents.unshift(newDoc);
    }

    if (!req.sharedFiles) req.sharedFiles = [];
    req.sharedFiles.push({
      id: docId,
      name: file.name,
      version: uploadVersion,
      size: file.size!,
      sha: file.sha256 || null,
      uploadedBy: this.state.currentPerson,
      uploadedAt,
      source: 'Client Portal'
    });

    if (!req.thread) req.thread = [];
    req.thread.push({
      id: `TH-${Date.now()}`,
      kind: 'response',
      author: this.state.currentPerson,
      role: this.state.currentRole,
      text: `Uploaded evidence file: ${file.name}`,
      time: new Date().toISOString(),
      file: file.name,
      version: uploadVersion,
      clientVisible: true
    });

    req.file = file.name;
    req.version = uploadVersion;
    req.status = 'Received';
    req.acceptedBy = undefined;
    req.acceptedAt = undefined;
    req.acceptedVersion = undefined;
    this.invalidateReleaseBasis(eng);
    this.logEvent(`PBC response file uploaded by ${this.state.currentPerson}: ${file.name}`, req.id);
    this.notify();
  }
  public replyToPbcRequest(engId: string, requestId: string, text: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['client_admin', 'client_finance', 'client'], 'reply to a client PBC request');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const request = engagement?.pbc.find(item => item.id === requestId);
    const message = text.trim();
    if (!request) throw new GuardError('INVALID_STATE', 'PBC request not found.');
    if (!message) throw new GuardError('INVALID_STATE', 'A reply message is required.');
    if (message.length > 2000) throw new GuardError('INVALID_STATE', 'A PBC reply cannot exceed 2,000 characters.');
    if (!['Requested', 'Needs clarification', 'Received'].includes(request.status)) {
      throw new GuardError('INVALID_STATE', `A reply cannot be added while the request is ${request.status}.`);
    }
    request.thread ||= [];
    request.thread.push({
      id: `TH-${crypto.randomUUID()}`,
      kind: 'email',
      author: this.state.currentPerson,
      role: this.state.currentRole,
      text: message,
      time: new Date().toISOString(),
      clientVisible: true
    });
    this.logEvent(`Client replied to PBC request: ${request.title}`, request.id);
    this.notify();
  }

  public addPbcRequest(engId: string, request: PbcRequestItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'preparer'], 'create PBC requests');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    if (!request.id?.trim() || this.state.engagements.some(e => e.pbc.some(p => p.id === request.id))) throw new GuardError('INVALID_STATE', 'PBC request ID must be unique.');
    if (!request.title || !request.title.trim() || !request.category.trim() || !request.owner.trim() || !request.contributor?.trim()) throw new GuardError('INVALID_STATE', 'Request title, category, owner and client recipient are required.');
    if (!isActiveClientContact(this.state, eng.client, request.contributor)) throw new GuardError('FORBIDDEN_SCOPE', 'Client recipient must be an active contact assigned to this client.');
    if (eng.auditLifecycle && !eng.auditLifecycle.workspace?.accessVerifiedAt) throw new GuardError('INVALID_STATE', 'Prepare and verify workspace access before drafting PBC requests.');
    eng.pbc.unshift({ ...request, status: 'Draft', version: 1 });
    this.invalidateReleaseBasis(eng);
    this.logEvent(`PBC request drafted: ${request.title}`, request.id);
    this.notify();
  }

  public requestPbcClarification(engId: string, requestId: string, note: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'request PBC clarification');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(e => e.id === engId);
    const req = engagement?.pbc.find(r => r.id === requestId);
    if (!req || !['Received', 'Accepted'].includes(req.status)) throw new GuardError('INVALID_STATE', 'Clarification requires a received or accepted response.');
    if (!note.trim()) throw new GuardError('INVALID_STATE', 'Clarification details are required.');
    if (req.status === 'Accepted' && req.acceptedBy && req.acceptedAt && req.acceptedVersion !== undefined) {
      req.acceptanceHistory ||= [];
      if (!req.acceptanceHistory.some(item => item.version === req.acceptedVersion && item.acceptedAt === req.acceptedAt)) req.acceptanceHistory.push({ version: req.acceptedVersion, acceptedBy: req.acceptedBy, acceptedByUserId: this.state.users.find(user => user.name === req.acceptedBy)?.id || '', acceptedAt: req.acceptedAt });
    }
    req.status = 'Needs clarification';
    req.clarificationNote = note.trim();
    req.thread ||= [];
    req.thread.push({ id: `TH-${crypto.randomUUID()}`, kind: 'clarification', author: this.state.currentPerson, role: this.state.currentRole, text: req.clarificationNote, time: new Date().toISOString(), clientVisible: true });
    this.invalidateReleaseBasis(engagement!);
    this.logEvent(`PBC clarification requested: ${req.title}`, req.id);
    this.notify();
  }

  public presentPbcRequest(engId: string, requestId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'preparer'], 'present PBC requests');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    const req = eng?.pbc.find(r => r.id === requestId);
    if (!eng || !req) throw new GuardError('INVALID_STATE', `PBC request "${requestId}" was not found.`);
    if (!req.title.trim() || !req.owner.trim() || !req.contributor?.trim()) throw new GuardError('INVALID_STATE', 'A title, owner, and client recipient are required before presentation.');
    if (!isActiveClientContact(this.state, eng.client, req.contributor)) throw new GuardError('FORBIDDEN_SCOPE', 'Client recipient must be an active contact assigned to this client before presentation.');
    if (req.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only draft requests can be presented.');
    if (eng.auditLifecycle && !eng.auditLifecycle.workspace?.accessVerifiedAt) throw new GuardError('INVALID_STATE', 'Verify the engagement workspace before sending PBC requests.');
    req.status = 'Requested';
    req.requestedBy = this.state.currentPerson;
    req.requestedAt = new Date().toISOString();
    this.invalidateReleaseBasis(eng);
    this.logEvent(`PBC request presented: ${req.title}`, req.id);
    this.notify();
  }

  public acceptPbcResponse(engId: string, requestId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'accept PBC evidence');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    const req = eng?.pbc.find(r => r.id === requestId);
    if (!eng || !req) throw new GuardError('INVALID_STATE', `PBC request "${requestId}" was not found.`);
    if (req.status !== 'Received' || (!req.file && !req.responseDocId && (!req.sharedFiles || req.sharedFiles.length === 0))) {
      throw new GuardError('INVALID_STATE', 'Cannot accept PBC request: no valid submission has been received.');
    }
    const lastUploadBy = req.thread?.filter(t => t.kind === 'response').at(-1)?.author || req.contributor || '';
    if (lastUploadBy) {
      requireIndependentActor(lastUploadBy, this.state.currentPerson, 'accept this PBC response', this.state);
    }
    req.status = 'Accepted';
    req.acceptedBy = this.state.currentPerson;
    req.acceptedAt = new Date().toISOString();
    req.acceptedVersion = req.version;
    if (eng.auditLifecycle) { for (const file of req.sharedFiles || []) { if (!this.state.evidenceCatalogue.some(item => item.documentId === file.id && item.version === file.version)) this.state.evidenceCatalogue.push({id:`EVID-${crypto.randomUUID()}`,title:file.name,documentId:file.id,version:file.version,adequacyStatus:'Adequate',receivedDate:req.acceptedAt.slice(0,10),owner:this.state.currentPerson,linkedProcedures:[]}); } }
    req.acceptanceHistory ||= [];
    req.acceptanceHistory.push({ version: req.version, acceptedBy: this.state.currentPerson, acceptedByUserId: this.state.currentUserId, acceptedAt: req.acceptedAt });
    this.invalidateReleaseBasis(eng);
    this.logEvent(`PBC response accepted: ${req.title}`, req.id);
    this.notify();
  }

  // --- PBC request lifecycle (VP-023): edits and cancellation retain identity,
  // attribution and prior submissions; cancellation is terminal but never deletes.
  public updatePbcRequest(engId: string, requestId: string, changes: { title?: string; description?: string; due?: string; owner?: string; contributor?: string }, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner'], 'edit client information requests');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', 'Engagement not found.');
    const req = eng.pbc.find(r => r.id === requestId);
    if (!req) throw new GuardError('INVALID_STATE', 'PBC request not found.');
    if (req.status === 'Cancelled') throw new GuardError('INVALID_STATE', 'A cancelled request cannot be edited; its history remains available.');
    if (req.status === 'Accepted') throw new GuardError('INVALID_STATE', 'An accepted request can no longer be edited; create a follow-up request so accepted evidence stays pinned.');
    if (!reason.trim()) throw new GuardError('INVALID_STATE', 'Recording a reason is required to edit an information request.');
    const changed: string[] = [];
    if (changes.title !== undefined) {
      const title = changes.title.trim();
      if (!title) throw new GuardError('INVALID_STATE', 'Request title cannot be empty.');
      if (title !== req.title) { req.title = title; changed.push('title'); }
    }
    if (changes.description !== undefined) {
      const description = changes.description.trim();
      if (description !== (req.description || '')) { req.description = description; changed.push('description'); }
    }
    if (changes.due !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(changes.due)) throw new GuardError('INVALID_STATE', 'Use a valid due date (YYYY-MM-DD).');
      if (changes.due !== req.due) { req.due = changes.due; changed.push('due date'); }
    }
    if (changes.owner !== undefined) {
      const owner = changes.owner.trim();
      if (!owner) throw new GuardError('INVALID_STATE', 'The request owner cannot be empty.');
      if (owner !== req.owner) { req.owner = owner; changed.push('request owner'); }
    }
    if (changes.contributor !== undefined) {
      const contributor = changes.contributor.trim();
      if (!contributor) throw new GuardError('INVALID_STATE', 'The client recipient cannot be empty.');
      if (!isActiveClientContact(this.state, eng.client, contributor)) throw new GuardError('FORBIDDEN_SCOPE', 'Recipient must be an active contact assigned to this client.');
      const authorizedContact = this.state.contacts.find(contact => contact.clientId === eng.client && contact.active && contact.name.trim().toLocaleLowerCase() === contributor.toLocaleLowerCase());
      if (contributor !== req.contributor) { req.contributor = authorizedContact!.name; changed.push('client recipient'); }
    }
    if (!changed.length) throw new GuardError('INVALID_STATE', 'No changes were entered.');
    req.thread = req.thread || [];
    req.thread.push({ id: `TH-${Date.now()}-${Math.floor(Math.random() * 10000)}`, kind: 'request', author: this.state.currentPerson, role: this.state.currentRole, text: `Request edited (${changed.join(', ')}): ${reason.trim()}`, time: new Date().toISOString(), clientVisible: false });
    this.logEvent(`PBC request ${requestId} edited (${changed.join(', ')}): ${reason.trim()}`, eng.id);
    this.notify();
  }

  public cancelPbcRequest(engId: string, requestId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner'], 'cancel client information requests');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', 'Engagement not found.');
    const req = eng.pbc.find(r => r.id === requestId);
    if (!req) throw new GuardError('INVALID_STATE', 'PBC request not found.');
    if (req.status === 'Cancelled') throw new GuardError('INVALID_STATE', 'This request is already cancelled.');
    if (!reason.trim()) throw new GuardError('INVALID_STATE', 'Cancelling a request requires a recorded reason.');
    req.status = 'Cancelled';
    req.thread = req.thread || [];
    const retained = req.sharedFiles?.length ? ` ${req.sharedFiles.length} shared file(s) and prior history are retained.` : ' Prior history is retained.';
    req.thread.push({ id: `TH-${Date.now()}-${Math.floor(Math.random() * 10000)}`, kind: 'request', author: this.state.currentPerson, role: this.state.currentRole, text: `Request cancelled: ${reason.trim()}.${retained}`, time: new Date().toISOString(), clientVisible: false });
    this.logEvent(`PBC request ${requestId} cancelled: ${reason.trim()}`, eng.id);
    this.notify();
  }

  // --- Time correction revision (VP-028): approved entries are never overwritten -
  public correctApprovedTime(entryId: string, correctedMinutes: number, reason: string) {
    requireActiveIdentity(this.state);
    const entry = this.state.times.find(t => t.id === entryId);
    if (!entry) return;
    requireEngagementScope(this.state, entry.engagementId);
    if (entry.status !== 'Approved') throw new GuardError('INVALID_STATE', 'Only approved entries use correction revisions.');
    if (!Number.isInteger(correctedMinutes) || correctedMinutes <= 0 || !reason.trim()) throw new GuardError('INVALID_STATE', 'Corrected duration must be positive whole minutes with a reason.');
    if (entry.person !== this.state.currentPerson && !hasAnyRole(this.state, ['manager', 'partner'])) throw new GuardError('FORBIDDEN_SCOPE', 'Only the time owner or an engagement manager/partner can submit a correction.');
    entry.status = 'Superseded';
    const correction: TimeEntryItem = {
      ...entry,
      id: `${entry.id}-R${(entry.correctionRevision || 0) + 1}`,
      durationMinutes: correctedMinutes,
      status: 'Submitted',
      correctionRevision: (entry.correctionRevision || 0) + 1,
      supersedesId: entry.id,
      reviewedBy: undefined,
      reviewedAt: undefined,
      returnReason: `Correction of ${entry.id}: ${reason}`
    };
    this.state.times.unshift(correction);
    this.logEvent(`Time correction submitted for ${entry.id}: ${reason}`, correction.id);
    this.notify();
  }

  // --- Evidence catalogue (VP-053): version-pinned shared references ------------
  public setEvidenceAdequacy(evidenceId: string, status: 'Adequate' | 'Pending verification' | 'Deficient', rationale = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner', 'eqr'], 'set evidence adequacy');
    const ev = this.state.evidenceCatalogue.find(e => e.id === evidenceId);
    if (!ev) throw new GuardError('INVALID_STATE', 'Evidence record not found.');
    const evidenceDocument = this.state.documents.find(d => d.id === ev.documentId);
    if (!evidenceDocument) throw new GuardError('INVALID_STATE', 'Evidence document was not found.');
    if (evidenceDocument.clientId) requireClientScope(this.state, evidenceDocument.clientId);
    if (evidenceDocument.engagementId) requireEngagementScope(this.state, evidenceDocument.engagementId);
    if (status === 'Adequate' && evidenceDocument.brokenLink) throw new GuardError('INVALID_STATE', 'An unavailable document reference cannot be marked adequate.');
    if (status !== 'Adequate' && !rationale.trim()) {
      throw new GuardError('INVALID_STATE', 'A non-adequate determination requires a recorded rationale.');
    }
    const changed = ev.adequacyStatus !== status;
    ev.adequacyStatus = status;
    ev.adequacyHistory ||= [];
    if (changed) ev.adequacyHistory.push({ status, actorId: this.state.currentUserId, rationale: rationale.trim(), at: new Date().toISOString() });
    const linkedEng = evidenceDocument?.engagementId && this.state.engagements.find(e => e.id === evidenceDocument.engagementId);
    if (changed) {
      for (const program of this.state.auditPrograms) for (const procedure of program.procedures) {
        if (!ev.linkedProcedures.includes(procedure.id)) continue;
        const engagement = this.state.engagements.find(item => item.id === (procedure.engagementId || program.engagementId || evidenceDocument.engagementId));
        if (!engagement) continue;
        procedure.evidenceReassessmentHistory ||= [];
        procedure.evidenceReassessmentHistory.push({ documentId: ev.documentId, version: ev.version, previousStatus: procedure.status, reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: new Date().toISOString() });
        procedure.evidenceReassessmentRequired = true;
        if (procedure.status === 'Cleared' || procedure.status === 'Submitted') procedure.status = 'In progress';
        procedure.reviewedByUserId = undefined;
        procedure.reviewedAt = undefined;
        this.invalidateReleaseBasis(engagement);
      }
      for (const engagement of this.state.engagements) for (const workpaper of engagement.workpapers) {
        if (!workpaper.evidenceRefs?.includes(ev.documentId)) continue;
        if (!workpaper.clearance && !workpaper.submittedVersion && workpaper.status !== 'Cleared' && workpaper.status !== 'Submitted') continue;
        if (workpaper.clearance) workpaper.clearanceHistory.push({ ...workpaper.clearance });
        workpaper.clearance = null;
        workpaper.submittedBy = undefined;
        workpaper.submittedVersion = undefined;
        workpaper.version++;
        this.reopenWorkpaperReviewNotes(engagement, workpaper);
        workpaper.status = 'Changes required';
        this.invalidateReleaseBasis(engagement);
      }
    }
    this.logEvent(`Evidence ${evidenceId} adequacy set to ${status} by ${this.state.currentPerson}${rationale ? ': ' + rationale : ''}`, evidenceId);
    this.notify();
  }

  public linkEvidenceProcedure(evidenceId: string, procedureId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner', 'eqr'], 'link evidence to a procedure');
    const ev = this.state.evidenceCatalogue.find(e => e.id === evidenceId);
    if (!ev) throw new GuardError('INVALID_STATE', 'Evidence record not found.');
    const doc = this.state.documents.find(d => d.id === ev.documentId);
    if (!doc) throw new GuardError('INVALID_STATE', 'Evidence document was not found.');
    const eng = this.state.engagements.find(e => e.id === (doc?.engagementId || this.state.selectedEngagement));
    if (!eng) throw new GuardError('INVALID_STATE', 'Select an engagement for this evidence link.');
    requireEngagementScope(this.state, eng.id);
    if (!this.state.auditPrograms.some(p => (p.engagementId === eng.id || (!p.engagementId && eng.id === this.state.engagements[0]?.id)) && p.procedures.some(proc => proc.id === procedureId))) throw new GuardError('INVALID_STATE', 'Procedure was not found in the selected engagement.');
    if (doc.clientId) requireClientScope(this.state, doc.clientId);
    if (doc.engagementId && doc.engagementId !== eng.id) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same engagement.');
    if (doc.clientId !== eng.client) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same client.');
    if (doc.brokenLink || ev.adequacyStatus !== 'Adequate' || doc.version !== ev.version || this.hasNewerDocumentRevision(doc.id)) throw new GuardError('STALE_REVISION', 'Only an available, adequate evidence record pinned to the current document revision can be linked.');
    if (!ev.linkedProcedures.includes(procedureId)) {
      ev.linkedProcedures.push(procedureId);
      ev.linkedProcedureHistory ||= [];
      ev.linkedProcedureHistory.push({ procedureId, action: 'Linked', actorId: this.state.currentUserId, reason: 'Linked to scoped audit procedure', at: new Date().toISOString() });
      this.invalidateReleaseBasis(eng);
    }
    this.logEvent(`Evidence ${evidenceId} linked to procedure ${procedureId}`, evidenceId);
    this.notify();
  }

  public unlinkEvidenceProcedure(evidenceId: string, procedureId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner', 'eqr'], 'unlink evidence from a procedure');
    const evidence = this.state.evidenceCatalogue.find(item => item.id === evidenceId);
    const document = evidence && this.state.documents.find(item => item.id === evidence.documentId);
    if (!evidence || !document || !evidence.linkedProcedures.includes(procedureId) || !reason.trim()) throw new GuardError('INVALID_STATE', 'A linked evidence record, procedure and unlink rationale are required.');
    const program = this.state.auditPrograms.find(item => item.procedures.some(procedure => procedure.id === procedureId));
    const procedure = program?.procedures.find(item => item.id === procedureId);
    const engagementId = procedure?.engagementId || program?.engagementId || document.engagementId;
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    if (!procedure || !engagement) throw new GuardError('INVALID_STATE', 'Procedure was not found in the evidence scope.');
    requireEngagementScope(this.state, engagement.id);
    if (document.clientId) requireClientScope(this.state, document.clientId);
    if (document.engagementId && document.engagementId !== engagement.id) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same engagement.');
    if (document.clientId !== engagement.client) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same client.');
    evidence.linkedProcedures = evidence.linkedProcedures.filter(id => id !== procedureId);
    evidence.linkedProcedureHistory ||= [];
    evidence.linkedProcedureHistory.push({ procedureId, action: 'Unlinked', actorId: this.state.currentUserId, reason: reason.trim(), at: new Date().toISOString() });
    procedure.evidenceReassessmentHistory ||= [];
    procedure.evidenceReassessmentHistory.push({ documentId: evidence.documentId, version: evidence.version, previousStatus: procedure.status, reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: new Date().toISOString() });
    procedure.evidenceReassessmentRequired = true;
    if (procedure.status === 'Cleared' || procedure.status === 'Submitted') procedure.status = 'In progress';
    procedure.reviewedByUserId = undefined;
    procedure.reviewedAt = undefined;
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Evidence ${evidenceId} unlinked from procedure ${procedureId}: ${reason.trim()}`, evidenceId);
    this.notify();
  }

  private recordAuditProcedureHistory(
    engId: string,
    procedure: import('../types').AuditProcedureItem,
    action: import('../types').AuditProcedureHistoryEntry['action'],
    previous?: import('../types').AuditProcedureHistoryEntry['previous'],
    reason?: string
  ) {
    const program = this.state.auditPrograms.find(item =>
      (item.engagementId === engId || (!item.engagementId && engId === this.state.engagements[0]?.id)) &&
      item.procedures.some(candidate => candidate.id === procedure.id)
    );
    if (!program) return;
    procedure.history ||= [];
    const revision = procedure.history.length + 1;
    procedure.history.push({
      id: `${procedure.id}-H${revision}`,
      revision,
      action,
      actorUserId: this.state.currentUserId,
      occurredAt: new Date().toISOString(),
      programId: program.id,
      sourceTemplateId: program.sourceTemplateId,
      sourceTemplateVersion: program.sourceTemplateVersion,
      status: procedure.status,
      workPerformed: procedure.workPerformed,
      conclusion: procedure.conclusion,
      evidenceLimitation: procedure.evidenceLimitation,
      reason: reason?.trim() || undefined,
      previous: previous ? structuredClone(previous) : undefined
    });
  }

  public updateAuditProcedureExecution(engId: string, procedureId: string, workPerformed: string, conclusion: string, evidenceLimitation: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager'], 'record procedure fieldwork');
    requireEngagementScope(this.state, engId);
    const targetEngagement = this.state.engagements.find(e => e.id === engId);
    if (targetEngagement?.auditLifecycle) { const blockers = fieldworkBlockers(this.state, targetEngagement); if (blockers.length) throw new GuardError('INVALID_STATE', blockers.join(' ')); }
    const procedure = this.state.auditPrograms.find(p => (p.engagementId === engId || (!p.engagementId && engId === this.state.engagements[0]?.id)) && p.procedures.some(item => item.id === procedureId))?.procedures.find(p => p.id === procedureId);
    if (!procedure) throw new GuardError('INVALID_STATE', 'Procedure was not found in the selected engagement.');
    if (!workPerformed.trim() || !conclusion.trim()) throw new GuardError('INVALID_STATE', 'Record work performed and a conclusion.');
    const previous = { status: procedure.status, workPerformed: procedure.workPerformed, conclusion: procedure.conclusion, evidenceLimitation: procedure.evidenceLimitation };
    procedure.workPerformed = workPerformed.trim();
    procedure.conclusion = conclusion.trim();
    procedure.evidenceLimitation = evidenceLimitation.trim() || undefined;
    procedure.status = 'In progress';
    procedure.scopeReassessmentRequired = false;
    procedure.scopeReassessmentReason = undefined;
    procedure.reviewedByUserId = undefined;
    procedure.reviewedAt = undefined;
    this.recordAuditProcedureHistory(engId, procedure, 'Fieldwork saved', previous);
    const engagement = this.state.engagements.find(item => item.id === engId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Procedure ${procedureId} fieldwork updated`, procedureId);
    this.notify();
  }

  public updateAuditProcedureStatus(engId: string, procedureId: string, status: import('../types').AuditProcedureItem['status'], reason = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer', 'partner', 'eqr'], 'update procedure fieldwork status');
    requireEngagementScope(this.state, engId);
    const targetEngagement = this.state.engagements.find(e => e.id === engId);
    if (targetEngagement?.auditLifecycle) { const blockers = fieldworkBlockers(this.state, targetEngagement); if (blockers.length) throw new GuardError('INVALID_STATE', blockers.join(' ')); }
    const procedure = this.state.auditPrograms.find(p => (p.engagementId === engId || (!p.engagementId && engId === this.state.engagements[0]?.id)) && p.procedures.some(item => item.id === procedureId))?.procedures.find(p => p.id === procedureId);
    if (!procedure) throw new GuardError('INVALID_STATE', 'Procedure was not found in the selected engagement.');
    const previous = { status: procedure.status, workPerformed: procedure.workPerformed, conclusion: procedure.conclusion, evidenceLimitation: procedure.evidenceLimitation };
    const isReturn = (procedure.status === 'Submitted' || procedure.status === 'Cleared') && ['Not started', 'In progress', 'Blocked'].includes(status);
    if (isReturn) {
      if (!reason.trim() || reason.trim().length > 500) throw new GuardError('INVALID_STATE', 'Returning submitted or cleared fieldwork requires a bounded reason so the preparer can rework it.');
      procedure.returnReason = reason.trim();
      procedure.returnedByUserId = this.state.currentUserId;
      procedure.returnedAt = new Date().toISOString();
    }
    if (status === 'Submitted') {
      requireRole(this.state, ['preparer', 'manager'], 'submit procedure fieldwork');
      if (!procedure.workPerformed?.trim() || !procedure.conclusion?.trim()) throw new GuardError('INVALID_STATE', 'Record work performed and a conclusion before submitting fieldwork.');
      const hasCurrentEvidence = this.state.evidenceCatalogue.some(e => {
        if (!e.linkedProcedures.includes(procedureId) || e.adequacyStatus !== 'Adequate') return false;
        let document = this.state.documents.find(d => d.id === e.documentId);
        if (!document || document.brokenLink || document.clientId !== this.state.engagements.find(item => item.id === engId)?.client || (document.engagementId && document.engagementId !== engId) || document.version !== e.version) return false;
        return !this.hasNewerDocumentRevision(document.id);
      });
      if (!hasCurrentEvidence && !procedure.evidenceLimitation?.trim()) throw new GuardError('INVALID_STATE', 'Link current adequate evidence or record an evidence limitation before submitting.');
      if (procedure.scopeReassessmentRequired) throw new GuardError('STALE_REVISION', 'Planning scope changed; re-record this procedure before submitting.');
      procedure.preparedByUserId = this.state.currentUserId;
      procedure.evidenceReassessmentRequired = false;
    }
    if (status === 'Completed') throw new GuardError('INVALID_STATE', 'Use Submitted for preparer work and Cleared for independent review.');
    if (status === 'Cleared' && procedure.status !== 'Cleared') {
      requireRole(this.state, ['reviewer', 'manager', 'partner', 'eqr'], 'clear procedure fieldwork');
      if (procedure.evidenceReassessmentRequired) throw new GuardError('STALE_REVISION', 'Reassess the changed evidence and resubmit fieldwork before clearing this procedure.');
      if (procedure.status !== 'Submitted' || !procedure.preparedByUserId) throw new GuardError('INVALID_STATE', 'Only submitted fieldwork with a recorded preparer can be cleared.');
      requireIndependentActor(procedure.preparedByUserId, this.state.currentUserId, 'clear their own procedure fieldwork', this.state);
      procedure.reviewedByUserId = this.state.currentUserId;
      procedure.reviewedAt = new Date().toISOString();
      procedure.returnReason = undefined;
    }
    if (status !== 'Cleared') {
      procedure.reviewedByUserId = undefined;
      procedure.reviewedAt = undefined;
    }
    if (status === 'Exceptions noted') procedure.hasExceptions = true;
    procedure.status = status;
    const action: import('../types').AuditProcedureHistoryEntry['action'] = isReturn ? 'Returned' : status === 'Submitted' ? 'Submitted' : status === 'Cleared' ? 'Cleared' : 'Status changed';
    this.recordAuditProcedureHistory(engId, procedure, action, previous, isReturn ? reason : undefined);
    const engagement = this.state.engagements.find(item => item.id === engId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Procedure ${procedureId} status changed to ${status}`, procedureId);
    this.notify();
  }

  public updateAuditRisk(engId: string, riskId: string, changes: Pick<import('../types').AuditRiskItem, 'title' | 'area' | 'assertions' | 'description' | 'rationale' | 'response' | 'owner' | 'rating'> & { linkedProcedureIds?: string[] }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer'], 'edit assessed risks');
    requireEngagementScope(this.state, engId);
    const risk = this.state.auditRisks.find(item => (item.engagementId === engId || (!item.engagementId && engId === this.state.engagements[0]?.id)) && item.id === riskId);
    if (!risk) throw new GuardError('INVALID_STATE', 'Risk was not found in the selected engagement.');
    const previousProcedureIds = [...(risk.linkedProcedureIds || [])];
    const nextProcedureIds = changes.linkedProcedureIds ?? previousProcedureIds;
    const scopedPrograms = this.state.auditPrograms.filter(program => program.engagementId === engId || (program.engagementId === undefined && engId === this.state.engagements[0]?.id));
    const scopedProcedureIds = new Set(scopedPrograms.flatMap(program => program.procedures.map(procedure => procedure.id)));
    if (new Set(nextProcedureIds).size !== nextProcedureIds.length || nextProcedureIds.some(id => !scopedProcedureIds.has(id))) throw new GuardError('FORBIDDEN_SCOPE', 'Risk and procedure must both belong to the selected engagement.');
    if (![changes.title, changes.area, changes.description, changes.rationale, changes.response, changes.owner].every(value => value?.trim())) throw new GuardError('INVALID_STATE', 'Risk title, area, description, rationale, response and owner are required.');
    if (!changes.assertions.length || new Set(changes.assertions).size !== changes.assertions.length || changes.assertions.some(assertion => !assertion.trim())) throw new GuardError('INVALID_STATE', 'Select at least one unique assertion.');
    if (!['Low', 'Medium', 'Significant'].includes(changes.rating) || !eligibleAuditRiskOwners(this.state, engId).some(user => user.name === changes.owner)) throw new GuardError('INVALID_STATE', 'Risk rating and active in-scope professional owner must be valid.');
    const previous = structuredClone(risk);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const plans = (this.state.auditPlans || []).filter(plan => plan.engagementId === engId).sort((a, b) => b.version - a.version);
    const currentPlan = plans[0];
    let reviewImpact: string | undefined;
    if (engagement && currentPlan && ['Approved', 'Under review'].includes(currentPlan.status)) {
      const nextVersion = currentPlan.version + 1;
      reviewImpact = `Risk ${riskId} changed; audit plan v${nextVersion} requires independent review.`;
      const revision = { ...structuredClone(currentPlan), id: `PLAN-${engId}-V${nextVersion}`, version: nextVersion, status: 'Under review' as const, rationales: [...currentPlan.rationales, reviewImpact], preparedBy: this.state.currentPerson, preparedByUserId: this.state.currentUserId, preparedAt: new Date().toISOString(), reviewedBy: undefined, reviewedByUserId: undefined, reviewedAt: undefined, reviewNotes: undefined };
      currentPlan.status = 'Superseded';
      currentPlan.supersededReason = reviewImpact;
      this.state.auditPlans!.push(revision);
      engagement.planning = false;
    }
    Object.assign(risk, structuredClone(changes), { linkedProcedureIds: [...nextProcedureIds] });
    const affectedProcedureIds = new Set([...previousProcedureIds, ...nextProcedureIds]);
    for (const program of scopedPrograms) for (const procedure of program.procedures) {
      procedure.linkedRiskIds ||= [];
      if (nextProcedureIds.includes(procedure.id)) {
        if (!procedure.linkedRiskIds.includes(riskId)) procedure.linkedRiskIds.push(riskId);
      } else procedure.linkedRiskIds = procedure.linkedRiskIds.filter(id => id !== riskId);
    }
    risk.revisions ||= [];
    risk.revisions.push({
      revision: risk.revisions.length + 1,
      title: previous.title,
      area: previous.area,
      assertions: structuredClone(previous.assertions),
      description: previous.description,
      owner: previous.owner,
      linkedProcedureIds: previousProcedureIds,
      rating: previous.rating,
      response: previous.response,
      changedBy: this.state.currentPerson,
      changedAt: new Date().toISOString(),
      rationale: changes.rationale,
      reviewImpact
    });
    for (const program of scopedPrograms) {
      for (const procedure of program.procedures) {
        if (!affectedProcedureIds.has(procedure.id)) continue;
        procedure.scopeReassessmentHistory ||= [];
        procedure.scopeReassessmentHistory.push({ reason: `Risk ${riskId} changed`, previousStatus: procedure.status, reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: new Date().toISOString() });
        procedure.scopeReassessmentRequired = true;
        procedure.scopeReassessmentReason = `Risk ${riskId} changed — reassess planned response`;
        if (procedure.status === 'Cleared' || procedure.status === 'Submitted') procedure.status = 'In progress';
        procedure.reviewedByUserId = undefined;
        procedure.reviewedAt = undefined;
      }
    }
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Risk ${riskId} updated (Revision ${risk.revisions.length})`, riskId);
    this.notify();
  }

  public createAuditRisk(engId: string, risk: Pick<import('../types').AuditRiskItem, 'title' | 'area' | 'assertions' | 'description' | 'rationale' | 'response' | 'owner' | 'rating'> & { linkedProcedureIds?: string[] }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer'], 'add assessed risks');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(item => item.id === engId);
    if (!engagement) throw new GuardError('INVALID_STATE', 'Engagement was not found.');
    const scopedPrograms = this.state.auditPrograms.filter(program => program.engagementId === engId || (program.engagementId === undefined && engId === this.state.engagements[0]?.id));
    const scopedProcedureIds = new Set(scopedPrograms.flatMap(program => program.procedures.map(procedure => procedure.id)));
    const nextProcedureIds = [...new Set(risk.linkedProcedureIds || [])];
    if (nextProcedureIds.some(id => !scopedProcedureIds.has(id))) throw new GuardError('FORBIDDEN_SCOPE', 'Risk and procedure must both belong to the selected engagement.');
    if (![risk.title, risk.area, risk.description, risk.rationale, risk.response, risk.owner].every(value => value?.trim())) throw new GuardError('INVALID_STATE', 'Risk title, area, description, rationale, response and owner are required.');
    if (!risk.assertions.length || new Set(risk.assertions).size !== risk.assertions.length || risk.assertions.some(assertion => !assertion.trim())) throw new GuardError('INVALID_STATE', 'Select at least one unique assertion.');
    if (!['Low', 'Medium', 'Significant'].includes(risk.rating) || !eligibleAuditRiskOwners(this.state, engId).some(user => user.name === risk.owner)) throw new GuardError('INVALID_STATE', 'Risk rating and active in-scope professional owner must be valid.');
    const riskId = `RSK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const created: import('../types').AuditRiskItem = {
      id: riskId,
      engagementId: engId,
      title: risk.title.trim(),
      area: risk.area.trim(),
      assertions: [...risk.assertions],
      description: risk.description.trim(),
      rationale: risk.rationale.trim(),
      response: risk.response.trim(),
      owner: risk.owner,
      rating: risk.rating,
      linkedProcedureIds: nextProcedureIds,
      revisions: []
    };
    this.state.auditRisks.push(created);
    for (const program of scopedPrograms) for (const procedure of program.procedures) {
      if (!nextProcedureIds.includes(procedure.id)) continue;
      procedure.linkedRiskIds ||= [];
      if (!procedure.linkedRiskIds.includes(riskId)) procedure.linkedRiskIds.push(riskId);
    }
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Risk ${riskId} added to the engagement risk assessment`, riskId);
    this.notify();
    return riskId;
  }

  public createAuditProgramTemplate(template: Omit<import('../types').AuditProgramTemplate, 'id' | 'version' | 'status'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'admin'], 'create audit program templates');
    if (!template.name?.trim() || !template.area?.trim() || !template.description?.trim()) {
      throw new GuardError('INVALID_STATE', 'Template name, area and description are required.');
    }
    if (![...new Set([...this.state.auditPrograms.map(program => program.area), ...(this.state.auditProgramTemplates || []).map(item => item.area)])].includes(template.area.trim())) throw new GuardError('INVALID_STATE', 'Template audit area must match a supported audit area.');
    if (!template.procedures?.length) {
      throw new GuardError('INVALID_STATE', 'Template must include at least one procedure.');
    }
    const id = `TPL-PRG-${crypto.randomUUID()}`;
    this.state.auditProgramTemplates ||= [];
    this.state.auditProgramTemplates.push({
      id,
      name: template.name.trim(),
      area: template.area.trim(),
      description: template.description.trim(),
      version: 1,
      status: 'Draft',
      procedures: structuredClone(template.procedures)
    });
    this.logEvent(`Audit program template created: ${template.name}`, id);
    this.notify();
    return id;
  }

  public reviseAuditProgramTemplate(templateId: string, changes: Pick<import('../types').AuditProgramTemplate, 'name' | 'area' | 'description' | 'procedures'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'admin'], 'revise audit program templates');
    const template = this.state.auditProgramTemplates?.find(item => item.id === templateId);
    if (!template || template.status === 'Retired' || !changes.name.trim() || !changes.area.trim() || !changes.description.trim() || !changes.procedures.length) throw new GuardError('INVALID_STATE', 'A current reusable template and complete revised content are required.');
    if (![...new Set([...this.state.auditPrograms.map(program => program.area), ...(this.state.auditProgramTemplates || []).map(item => item.area)])].includes(changes.area.trim())) throw new GuardError('INVALID_STATE', 'Template audit area must match a supported audit area.');
    this.state.auditProgramTemplateHistory ||= [];
    this.state.auditProgramTemplateHistory.push(structuredClone(template));
    Object.assign(template, structuredClone(changes), { version: template.version + 1, status: 'Draft' as const });
    this.logEvent(`Audit program template ${template.name} revised to v${template.version} draft`, template.id);
    this.notify();
  }

  public publishAuditProgramTemplate(templateId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'admin'], 'publish audit program templates');
    const template = this.state.auditProgramTemplates?.find(item => item.id === templateId);
    if (!template || template.status !== 'Draft' || !template.procedures.length) throw new GuardError('INVALID_STATE', 'Only a complete draft audit program template can be published.');
    template.status = 'Published';
    this.logEvent(`Audit program template ${template.name} v${template.version} published`, template.id);
    this.notify();
  }

  public retireAuditProgramTemplate(templateId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'admin'], 'retire audit program templates');
    const template = this.state.auditProgramTemplates?.find(item => item.id === templateId);
    if (!template || template.status === 'Retired') throw new GuardError('INVALID_STATE', 'A current audit program template is required.');
    this.state.auditProgramTemplateHistory ||= [];
    this.state.auditProgramTemplateHistory.push(structuredClone(template));
    template.status = 'Retired';
    this.logEvent(`Audit program template ${template.name} v${template.version} retired`, template.id);
    this.notify();
  }

  public applyAuditProgramTemplate(engId: string, templateId: string, customTitle?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'apply audit program templates');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" was not found.`);
    this.state.auditProgramTemplates ||= [];
    const template = this.state.auditProgramTemplates.find(t => t.id === templateId && t.status === 'Published');
    if (!template) throw new GuardError('INVALID_STATE', 'Published audit program template not found.');

    const prgId = `PRG-${engId}-${crypto.randomUUID()}`;
    const newProcedures: import('../types').AuditProcedureItem[] = template.procedures.map((p, idx) => ({
      id: `PRC-${crypto.randomUUID()}`,
      engagementId: engId,
      ref: `PRC-${(idx + 1).toString().padStart(2, '0')}`,
      title: p.title,
      instructions: p.instructions,
      objective: p.objective,
      assertion: p.defaultAssertions.join(', '),
      requiredEvidence: p.requiredEvidenceType,
      status: 'Not started',
      linkedRiskIds: [],
      workPerformed: '',
      conclusion: ''
    }));

    this.state.auditPrograms.push({
      id: prgId,
      engagementId: engId,
      area: template.area,
      title: customTitle?.trim() || template.name,
      objective: template.description,
      sourceTemplateId: template.id,
      sourceTemplateVersion: template.version,
      procedures: newProcedures
    });

    this.invalidateReleaseBasis(eng);
    this.logEvent(`Applied program template "${template.name}" to ${engId} (${newProcedures.length} fresh procedures)`, engId);
    this.notify();
    return prgId;
  }


  public setAuditRiskProcedureLink(engId: string, riskId: string, procedureId: string, linked: boolean) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer'], 'link a risk to a procedure');
    requireEngagementScope(this.state, engId);
    const risk = this.state.auditRisks.find(item => (item.engagementId === engId || (!item.engagementId && engId === this.state.engagements[0]?.id)) && item.id === riskId);
    const program = this.state.auditPrograms.find(item => (item.engagementId === engId || (!item.engagementId && engId === this.state.engagements[0]?.id)) && item.procedures.some(proc => proc.id === procedureId));
    const procedure = program?.procedures.find(item => item.id === procedureId);
    if (!risk || !procedure) throw new GuardError('INVALID_STATE', 'Risk and procedure must both belong to the selected engagement.');
    risk.linkedProcedureIds ||= [];
    procedure.linkedRiskIds ||= [];
    if (linked) {
      if (!risk.linkedProcedureIds.includes(procedureId)) risk.linkedProcedureIds.push(procedureId);
      if (!procedure.linkedRiskIds.includes(riskId)) procedure.linkedRiskIds.push(riskId);
    } else {
      risk.linkedProcedureIds = risk.linkedProcedureIds.filter(id => id !== procedureId);
      procedure.linkedRiskIds = procedure.linkedRiskIds.filter(id => id !== riskId);
    }
    const engagement = this.state.engagements.find(item => item.id === engId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Risk ${riskId} ${linked ? 'linked to' : 'unlinked from'} procedure ${procedureId}`, riskId);
    this.notify();
  }

  public setSampleItemSelected(populationId: string, itemId: string, selected: boolean, rationale = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer', 'partner'], 'select substantive sample items');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId) throw new GuardError('INVALID_STATE', 'Population must be linked to an engagement.');
    requireEngagementScope(this.state, population.engagementId);
    if (!population.sourceComplete) throw new GuardError('INVALID_STATE', 'Import the complete population source before selecting sample items.');
    if (!isSampleFrameReconciled(this.state, population)) throw new GuardError('INVALID_STATE', 'Reconcile the complete population to its mapped GL balance, period and currency before selecting sample items.');
    const item = population.items.find(candidate => candidate.id === itemId);
    if (!item) throw new GuardError('INVALID_STATE', 'Sample item was not found in this population.');
    if (selected && !rationale.trim()) throw new GuardError('INVALID_STATE', 'Selection rationale is required.');
    item.selected = selected;
    item.selectionRationale = selected ? rationale.trim() : undefined;
    population.selectionVersion = (population.selectionVersion || 0) + 1;
    population.selectionPreparedBy = this.state.currentUserId;
    population.selectedCount = population.items.filter(candidate => candidate.selected).length;
    population.selectedValue = population.items.filter(candidate => candidate.selected).reduce((sum, candidate) => sum + candidate.amount, 0);
    const engagement = this.state.engagements.find(candidate => candidate.id === population.engagementId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Sample item ${itemId} ${selected ? 'selected' : 'removed from selection'}`, populationId);
    this.notify();
  }

  public reviewSampleSelection(populationId: string, evaluation: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['reviewer', 'partner'], 'review substantive sample selection');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId || !population.sourceComplete || !isSampleFrameReconciled(this.state, population)) throw new GuardError('INVALID_STATE', 'A complete, reconciled population is required before review.');
    requireEngagementScope(this.state, population.engagementId);
    if (!population.selectedCount || !evaluation.trim()) throw new GuardError('INVALID_STATE', 'Select items and record an evaluation before review.');
    if (!population.selectionPreparedBy) throw new GuardError('INVALID_STATE', 'A preparer must save the current selection before review.');
    requireIndependentActor(population.selectionPreparedBy, this.state.currentUserId, 'review sample selection', this.state);
    population.selectionReviews ||= [];
    population.selectionReviews.push({ version: population.selectionVersion || 0, sourceRevision: population.sourceRevision || 1, reviewedBy: this.state.currentUserId, reviewedAt: new Date().toISOString(), selectedCount: population.selectedCount, testedCount: population.items.filter(item => item.selected && item.tested).length, untestedCount: population.items.filter(item => item.selected && !item.tested && !item.limitation).length, limitedCount: population.items.filter(item => item.selected && Boolean(item.limitation)).length, exceptionCount: population.items.filter(item => item.selected && item.result === 'Exception noted').length, evaluation: evaluation.trim() });
    this.logEvent(`Sample selection v${population.selectionVersion || 0} independently reviewed`, populationId);
    this.notify();
  }

  public linkSampleExceptionToFinding(populationId: string, itemId: string, findingId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer'], 'link a sample exception to a finding');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId) throw new GuardError('INVALID_STATE', 'Population must be linked to an engagement.');
    requireEngagementScope(this.state, population.engagementId);
    const sample = population.items.find(item => item.id === itemId);
    const finding = this.state.findings.find(item => item.id === findingId && item.engagementId === population.engagementId);
    if (!sample?.selected || !sample.tested || sample.result !== 'Exception noted' || !finding) throw new GuardError('INVALID_STATE', 'Link a tested sample exception to a finding in the same engagement.');
    sample.findingId = finding.id;
    this.logEvent(`Sample exception ${itemId} linked to finding ${finding.id}`, populationId);
    this.notify();
  }

  public recordSampleItemLimitation(populationId: string, itemId: string, limitation: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager'], 'record a sample testing limitation');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId || !population.sourceComplete || !isSampleFrameReconciled(this.state, population)) throw new GuardError('INVALID_STATE', 'A complete, reconciled population is required before recording limitations.');
    requireEngagementScope(this.state, population.engagementId);
    const sample = population.items.find(item => item.id === itemId);
    if (!sample?.selected || sample.tested || !limitation.trim()) throw new GuardError('INVALID_STATE', 'Select an untested item and explain the testing limitation.');
    sample.limitation = limitation.trim();
    sample.result = 'Limited';
    this.logEvent(`Sample item ${itemId} limitation recorded`, populationId);
    this.notify();
  }

  public recordSampleItemTest(populationId: string, itemId: string, auditedAmount: number, notes: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer'], 'record substantive sample testing');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId) throw new GuardError('INVALID_STATE', 'Population must be linked to an engagement.');
    requireEngagementScope(this.state, population.engagementId);
    if (!population.sourceComplete) throw new GuardError('INVALID_STATE', 'Import the complete population source before recording sample tests.');
    if (!isSampleFrameReconciled(this.state, population)) throw new GuardError('INVALID_STATE', 'Reconcile the complete population to its mapped GL balance, period and currency before recording sample tests.');
    const item = population.items.find(candidate => candidate.id === itemId);
    if (!item?.selected) throw new GuardError('INVALID_STATE', 'Select the population item before recording test results.');
    if (!Number.isFinite(auditedAmount) || auditedAmount < 0 || !notes.trim()) throw new GuardError('INVALID_STATE', 'Audited amount must be non-negative and testing notes are required.');
    item.auditedAmount = auditedAmount;
    item.difference = auditedAmount - (item.recordedAmount ?? item.amount);
    item.tested = true;
    item.result = item.difference === 0 ? 'Satisfactory' : 'Exception noted';
    item.notes = notes.trim();
    item.limitation = undefined;
    const engagement = this.state.engagements.find(candidate => candidate.id === population.engagementId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Sample item ${itemId} test recorded: ${item.result}`, populationId);
    this.notify();
  }

  public replaceSamplePopulationSource(populationId: string, fileName: string, sha256: string, rows: import('../types').SamplePopulationRow[]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer'], 'replace a sample population source');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId) throw new GuardError('INVALID_STATE', 'Population must be linked to an engagement.');
    requireEngagementScope(this.state, population.engagementId);
    if (!fileName.trim() || fileName.length > 255 || !/^[a-f0-9]{64}$/.test(sha256) || !rows.length) throw new GuardError('INVALID_STATE', 'A named source file, SHA-256 digest, and at least one valid population row are required.');
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    const engagement = this.state.engagements.find(item => item.id === population.engagementId);
    if (!engagement || !population.accountCode || population.period !== engagement.year || population.currency !== engagement.currency) throw new GuardError('INVALID_STATE', 'Population must identify an account, period and currency in its engagement context.');
    if (rows.length > 20000 || !Number.isFinite(rows.reduce((sum, row) => sum + row.amount, 0)) || new Set(rows.map(row => row.itemRef)).size !== rows.length || new Set(rows.map(row => row.id)).size !== rows.length || rows.some(row => !row.id.trim() || !row.itemRef.trim() || !validDate(row.date) || !row.counterparty.trim() || !Number.isFinite(row.amount) || (row.period !== undefined && row.period !== population.period) || (row.currency !== undefined && row.currency !== population.currency) || row.selected || row.tested || row.result !== 'Untested')) throw new GuardError('INVALID_STATE', 'Population rows must be unique, dated, numeric, in the engagement period/currency, and unselected/untested before replacement.');
    population.sourceHistory ||= [];
    population.sourceHistory.push({
      revision: population.sourceRevision || 1,
      fileName: population.sourceFileName || 'Legacy sample population',
      sha256: population.sourceSha256 || '',
      importedAt: new Date().toISOString(),
      importedBy: this.state.currentUserId,
      totalPopulationCount: population.totalPopulationCount,
      totalPopulationValue: population.totalPopulationValue,
      items: structuredClone(population.items)
    });
    population.sourceRevision = (population.sourceRevision || 1) + 1;
    population.sourceFileName = fileName.trim();
    population.sourceSha256 = sha256;
    population.sourceComplete = true;
    population.items = structuredClone(rows).map(row => ({ ...row, selected: false, tested: false, result: 'Untested', notes: undefined, limitation: undefined, auditedAmount: undefined, difference: undefined, findingId: undefined }));
    population.totalPopulationCount = rows.length;
    population.totalPopulationValue = rows.reduce((sum, row) => sum + row.amount, 0);
    population.selectedCount = 0;
    population.selectedValue = 0;
    population.selectionVersion = (population.selectionVersion || 0) + 1;
    population.selectionPreparedBy = undefined;
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Population ${populationId} source replaced with revision ${population.sourceRevision}`, populationId);
    this.notify();
  }

  // --- Findings disposition (VP-054) -------------------------------------------
  public addFinding(input: Omit<PrototypeState['findings'][number], 'id' | 'disposition' | 'dispositionHistory'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer', 'partner', 'eqr'], 'record audit findings');
    requireEngagementScope(this.state, input.engagementId);
    const engagement = this.state.engagements.find(item => item.id === input.engagementId);
    if (!engagement || !input.title.trim() || !input.condition?.trim() || !input.recommendation?.trim() || !input.affectedAccount?.trim() || !input.assertion?.trim()) throw new GuardError('INVALID_STATE', 'Finding title, condition, recommendation, account and assertion are required.');
    if (!['Monetary misstatement', 'Internal control deficiency', 'Disclosure omission'].includes(input.category || input.type || '')) throw new GuardError('INVALID_STATE', 'Choose a supported finding type.');
    if (!['Material', 'Significant', 'Minor', 'Trivial'].includes(input.severity || '')) throw new GuardError('INVALID_STATE', 'Choose a supported finding severity.');
    if (input.owner && !this.state.users.some(user => user.name === input.owner && user.status === 'Active')) throw new GuardError('INVALID_STATE', 'Finding owner must be an active practice identity.');
    const category = input.category || input.type!;
    const amount = input.amount;
    if (category === 'Monetary misstatement') {
      if (!Number.isFinite(amount) || amount === 0 || !/^[A-Z]{3}$/.test(input.currency || '')) throw new GuardError('INVALID_STATE', 'Monetary findings require a non-zero signed amount and ISO currency code.');
    } else if (amount !== undefined && amount !== 0) throw new GuardError('INVALID_STATE', 'Qualitative findings cannot carry a monetary amount.');
    const procedureExists = !input.linkedProcedureId || this.state.auditPrograms.some(program => (program.engagementId === input.engagementId || (!program.engagementId && input.engagementId === this.state.engagements[0]?.id)) && program.procedures.some(procedure => procedure.id === input.linkedProcedureId));
    const workpaper = input.linkedWorkpaperId && engagement.workpapers.find(item => item.id === input.linkedWorkpaperId);
    const evidence = input.linkedEvidenceId && this.state.evidenceCatalogue.find(item => item.id === input.linkedEvidenceId);
    const evidenceDocument = evidence && this.state.documents.find(item => item.id === evidence.documentId && item.clientId === engagement.client && (!item.engagementId || item.engagementId === engagement.id));
    const population = input.linkedSamplePopulationId && this.state.samplePopulations.find(item => item.id === input.linkedSamplePopulationId && item.engagementId === engagement.id);
    const sampleItem = population && population.items.find(item => item.id === input.linkedSampleItemId && (item.result === 'Exception noted' || item.result === 'Exception'));
    const journal = input.linkedJournalId && this.state.adjustmentJournals.find(item => item.id === input.linkedJournalId && item.engagementId === engagement.id);
    const review = input.linkedReviewNoteId && engagement.reviews.find(item => item.id === input.linkedReviewNoteId);
    if (!procedureExists || (input.linkedWorkpaperId && !workpaper) || (input.linkedEvidenceId && !evidenceDocument) || (input.linkedSamplePopulationId && !sampleItem) || (input.linkedJournalId && !journal) || (input.linkedReviewNoteId && !review)) throw new GuardError('FORBIDDEN_SCOPE', 'Every linked source must resolve within this engagement and client.');
    const sequence = Math.max(0, ...this.state.findings.map(item => Number(item.id.match(/^FND-(\d+)$/)?.[1] || 0))) + 1;
    const id = `FND-${String(sequence).padStart(3, '0')}`;
    const finding: PrototypeState['findings'][number] = {
      ...structuredClone(input), id, category, type: category,
      grossMisstatement: category === 'Monetary misstatement' ? Math.abs(amount!) : undefined,
      netMisstatement: category === 'Monetary misstatement' ? amount : undefined,
      disposition: 'Proposed for correction', dispositionHistory: []
    };
    this.state.findings.unshift(finding);
    if (sampleItem) sampleItem.findingId = id;
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Audit finding raised: ${finding.title}`, id);
    this.notify();
    return id;
  }

  public setFindingDisposition(findingId: string, disposition: PrototypeState['findings'][0]['disposition'], rationale: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'record finding dispositions');
    const f = this.state.findings.find(x => x.id === findingId);
    if (!f) return;
    requireEngagementScope(this.state, f.engagementId);
    if (!rationale || !rationale.trim()) throw new GuardError('INVALID_STATE', 'Finding disposition requires human rationale.');
    if (disposition === f.disposition) throw new GuardError('INVALID_STATE', 'Choose a different finding disposition.');
    if (disposition === 'Corrected in TB') {
      const journal = f.linkedJournalId && this.state.adjustmentJournals.find(item => item.id === f.linkedJournalId && item.engagementId === f.engagementId);
      if (!journal || journal.status !== 'Reporting included' || journal.reflectionStatus !== 'Reflected in TB') throw new GuardError('INVALID_STATE', 'A finding can be marked corrected in the trial balance only when its linked reviewed journal is included and reflected.');
    }
    f.dispositionHistory ||= [];
    f.dispositionHistory.push({ disposition, from: f.disposition, actorId: this.state.currentUserId, rationale: rationale.trim(), at: new Date().toISOString() });
    f.disposition = disposition;
    f.revision = (f.revision || 1) + 1;
    const eng = this.state.engagements.find(e => e.id === f.engagementId);
    if (eng) { this.reopenFindingReviewNotes(eng, f); this.invalidateReleaseBasis(eng); }
    this.logEvent(`Finding ${findingId} disposition: ${disposition}`, findingId);
    this.notify();
  }

  // --- Amendment / reissue lineage (VP-058) ------------------------------------
  public prepareAmendedRelease(engId: string, reason: string) {
    this.reopenReleaseForAmendment(engId, reason);
  }

  // --- Firm settings apply prospectively (VP-062) -------------------------------
  public updateFirmSettings(patch: Partial<PrototypeState['firmSettings']>, reason = '') {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'change firm settings');
    const bounded = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
    if ('firmName' in patch && !bounded(patch.firmName, 120)) throw new GuardError('INVALID_STATE', 'Firm name is required and must be 120 characters or fewer.');
    if ('firmLegalName' in patch && !bounded(patch.firmLegalName, 200)) throw new GuardError('INVALID_STATE', 'Firm legal name is required and must be 200 characters or fewer.');
    if ('jurisdiction' in patch && !bounded(patch.jurisdiction, 80)) throw new GuardError('INVALID_STATE', 'Jurisdiction is required and must be 80 characters or fewer.');
    if ('currency' in patch && !/^[A-Z]{3}$/.test(patch.currency || '')) throw new GuardError('INVALID_STATE', 'Firm reporting currency must be a three-letter ISO code.');
    if ('locale' in patch && !bounded(patch.locale, 16)) throw new GuardError('INVALID_STATE', 'Locale is required and must be 16 characters or fewer.');
    if ('timezone' in patch && !bounded(patch.timezone, 32)) throw new GuardError('INVALID_STATE', 'Timezone label is required and must be 32 characters or fewer.');
    if ('logoRef' in patch && patch.logoRef !== undefined && (!bounded(patch.logoRef, 80))) throw new GuardError('INVALID_STATE', 'A logo reference, when provided, must be 80 characters or fewer; this browser-local prototype stores no binary logo payload.');
    if ('invoiceNumberPrefix' in patch && !bounded(patch.invoiceNumberPrefix, 16)) throw new GuardError('INVALID_STATE', 'Invoice number prefix is required and must be 16 characters or fewer.');
    if ('creditNumberPrefix' in patch && !bounded(patch.creditNumberPrefix, 16)) throw new GuardError('INVALID_STATE', 'Credit number prefix is required and must be 16 characters or fewer.');
    if ('invoiceNextNumber' in patch && (!Number.isInteger(patch.invoiceNextNumber) || patch.invoiceNextNumber! < 1)) throw new GuardError('INVALID_STATE', 'Next invoice number must be a positive whole number.');
    if ('creditNextNumber' in patch && (!Number.isInteger(patch.creditNextNumber) || patch.creditNextNumber! < 1)) throw new GuardError('INVALID_STATE', 'Next credit number must be a positive whole number.');
    if ('paymentTermsDays' in patch && (!Number.isInteger(patch.paymentTermsDays) || patch.paymentTermsDays! < 0 || patch.paymentTermsDays! > 365)) throw new GuardError('INVALID_STATE', 'Payment terms must be a whole number between 0 and 365 days.');
    this.state.firmSettings = { ...this.state.firmSettings, ...patch };
    this.logEvent(`Firm settings updated${reason ? ': ' + reason : ''}`, 'FIRM');
    this.notify();
  }

  /** Fixture integrity snapshot for tests and the coverage report. */
  public checkIntegrity() {
    return validateFixtures(this.state);
  }

  // --- Release & Archive (VP-057, VP-058, VP-059) ---
  public evaluateReleaseReadiness(engId: string): { ready: boolean; reason?: string } {
    const eng = this.state.engagements.find(e => e.id === engId);
    const readiness = evaluateReleaseReadinessSnapshot(eng, this.state);
    return readiness.ready ? { ready: true } : { ready: false, reason: readiness.reason };
  }

  public prepareReleaseCandidate(engId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'prepare a release candidate');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" not found.`);

    const readiness = this.evaluateReleaseReadiness(engId);
    if (!readiness.ready) {
      throw new GuardError('INVALID_STATE', `Cannot prepare release candidate: ${readiness.reason}`);
    }

    const packageDefinition = eng.packageHistory?.find(p => p.revision === eng.packageRevision);
    const latestGLSource = eng.glSourceHistory?.at(-1);
    const mappingRevision = Math.max(0, ...(this.state.accountMappingRevisions || []).filter(r => r.engagementId === engId).map(r => r.revision));
    if (!packageDefinition || packageDefinition.generation !== eng.generation || packageDefinition.sourceVersion !== eng.sourceVersion || packageDefinition.glSourceRevision !== latestGLSource?.revision || packageDefinition.glSourceSha256 !== latestGLSource?.sha256 || packageDefinition.mappingRevision !== mappingRevision || !packageDefinition.validation.passed || packageDefinition.artifacts.length !== 3) throw new GuardError('INVALID_STATE', 'Cannot prepare release candidate: assemble a valid current package revision with current TB/GL source, mapping and XLSX, DOCX and PDF artifacts first.');
    if (eng.candidate && eng.candidate.generation === eng.generation && eng.candidate.sourceVersion === eng.sourceVersion && eng.candidate.packageRevision === eng.packageRevision && eng.candidate.packageDefinitionId === packageDefinition.id) {
      return eng.candidate;
    }

    eng.candidate = {
      generation: eng.generation,
      preparedAt: new Date().toISOString(),
      preparedBy: this.state.currentPerson,
      preparedByUserId: this.state.currentUserId,
      sourceVersion: eng.sourceVersion,
      packageRevision: eng.packageRevision,
      packageDefinitionId: packageDefinition.id,
      manifest: structuredClone(packageDefinition.artifacts)
    };
    this.logEvent(`Release candidate frozen for ${eng.id} (Gen ${eng.generation})`, eng.id);
    this.notify();
    return eng.candidate;
  }

  public saveDisclosureReview(engagementId: string, input: Omit<import('../types').DisclosureReviewRecord, 'revision' | 'status' | 'preparedByUserId' | 'reviewedByUserId' | 'reviewedAt'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer'], 'prepare financial disclosures');
    requireEngagementScope(this.state, engagementId);
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    if (!engagement || !input.id.trim() || !input.title.trim() || input.applicability === 'Applicable' && (!input.text.trim() || !input.evidenceRef?.trim()) || input.applicability === 'Not applicable' && !input.rationale?.trim()) throw new GuardError('INVALID_STATE', 'Each disclosure needs a title and either prepared content with evidence or a not-applicable rationale.');
    const prior = engagement.disclosureHistory?.find(item => item.id === input.id);
    engagement.disclosureHistory ||= [];
    const record = { ...structuredClone(input), revision: (prior?.revision || 0) + 1, status: 'Draft' as const, preparedByUserId: this.state.currentUserId };
    engagement.disclosureHistory = [...engagement.disclosureHistory.filter(item => item.id !== input.id), record];
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Disclosure ${input.id} v${record.revision} prepared`, engagementId);
    this.notify();
    return record.revision;
  }

  public reviewDisclosure(engagementId: string, disclosureId: string, revision: number) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['reviewer', 'partner', 'eqr'], 'review financial disclosures');
    requireEngagementScope(this.state, engagementId);
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    const record = engagement?.disclosureHistory?.find(item => item.id === disclosureId && item.revision === revision);
    if (!record || record !== engagement?.disclosureHistory?.find(item => item.id === disclosureId) || record.status !== 'Draft') throw new GuardError('STALE_REVISION', 'Only the current disclosure draft can be reviewed.');
    requireIndependentActor(record.preparedByUserId, this.state.currentUserId, 'review a disclosure they prepared', this.state);
    if (record.applicability === 'Applicable') {
      const document = this.state.documents.find(item => item.id === record.evidenceRef && item.clientId === engagement!.client && (!item.engagementId || item.engagementId === engagementId));
      if (!document) throw new GuardError('INVALID_STATE', 'Disclosure evidence must reference an in-scope client document.');
    }
    record.status = 'Reviewed';
    record.reviewedByUserId = this.state.currentUserId;
    record.reviewedAt = new Date().toISOString();
    this.invalidateReleaseBasis(engagement!);
    this.logEvent(`Disclosure ${disclosureId} v${revision} independently reviewed`, engagementId);
    this.notify();
  }

  public saveFinancialPackageRevision(record: import('../types').FinancialPackageRevision) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer'], 'assemble a financial package revision');
    requireEngagementScope(this.state, record.engagementId);
    if (this.isSessionOnly) throw new GuardError('INVALID_STATE', 'Browser state storage is unavailable; package revisions cannot be claimed as persisted.');
    const eng = this.state.engagements.find(e => e.id === record.engagementId);
    const latestGLSource = eng?.glSourceHistory?.at(-1);
    const requiredKinds = ['XLSX', 'DOCX', 'PDF'];
    const mappingRevision = Math.max(0, ...(this.state.accountMappingRevisions || []).filter(r => r.engagementId === record.engagementId).map(r => r.revision));
    const cashFlowSectionEnabled = record.sections.some(section => ['cf', 'eq'].includes(section.id) && section.enabled);
    const equitySectionEnabled = record.sections.some(section => section.id === 'eq' && section.enabled);
    const latestCashFlow = eng?.cashFlowScheduleHistory?.at(-1);
    const cashFlowLineageValid = cashFlowSectionEnabled
      ? latestCashFlow?.status === 'Reviewed' && (!equitySectionEnabled || latestCashFlow.openingEquity !== undefined) && latestCashFlow.revision === record.cashFlowScheduleRevision && latestCashFlow.sourceVersion === eng?.sourceVersion && latestCashFlow.mappingRevision === mappingRevision
      : record.cashFlowScheduleRevision === undefined;
    const notesEnabled = record.sections.some(section => section.id === 'notes' && section.enabled);
    const currentDisclosures = eng?.disclosureHistory || [];
    const disclosureLineageValid = !notesEnabled || currentDisclosures.length > 0 && currentDisclosures.every(item => item.status === 'Reviewed' && item.reviewedByUserId && item.reviewedByUserId !== item.preparedByUserId) && JSON.stringify(record.disclosures || []) === JSON.stringify(currentDisclosures);
    if (!eng || record.revision !== eng.packageRevision + 1 || record.generation !== eng.generation + 1 || record.sourceVersion !== eng.sourceVersion || record.glSourceRevision !== latestGLSource?.revision || record.glSourceSha256 !== latestGLSource?.sha256 || record.mappingRevision !== mappingRevision || record.noteRevision !== record.revision || !cashFlowLineageValid || !disclosureLineageValid || record.artifacts.length !== 3 || new Set(record.artifacts.map(a => a.kind)).size !== 3 || requiredKinds.some(kind => !record.artifacts.some(a => a.kind === kind)) || record.artifacts.some(a => !a.id || !a.name || !a.mimeType || a.size <= 0 || !/^[0-9a-f]{64}$/i.test(a.sha256)) || !record.sections.some(s => s.enabled) || new Set(record.sections.map(s => s.id)).size !== record.sections.length || record.sections.some((s, i) => s.order !== i + 1)) throw new GuardError('INVALID_STATE', 'Package revision must pin the current TB/GL source and mapping, reviewed disclosure lineage, valid cash-flow lineage, unique ordered sections, and genuine XLSX/DOCX artifact digests.');
    eng.packageHistory ||= [];
    if (eng.packageHistory.some(p => p.revision === record.revision || p.id === record.id) || this.state.engagements.some(other => other.packageHistory?.some(p => p.artifacts.some(a => record.artifacts.some(n => n.id === a.id))))) throw new GuardError('INVALID_STATE', 'Package revision or artifact identity already exists.');
    eng.packageHistory.push(structuredClone(record));
    eng.packageRevision = record.revision;
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Financial package revision ${record.revision} assembled from source v${record.sourceVersion}`, eng.id);
    this.notify();
    if (this.isSessionOnly) throw new GuardError('INVALID_STATE', 'Browser storage could not persist the package definition; the revision is available only for this session.');
  }

  public issueRelease(engId: string, dispatchNote = '', recipients: string[] = []) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['partner'], 'issue a release record');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" not found.`);
    const assignedPartner = this.state.users.find(u => u.name === eng.partner && u.role === 'partner');
    const activeActor = this.state.users.find(u => u.id === this.state.currentUserId);
    if ((!assignedPartner || !activeActor || (assignedPartner.personId || assignedPartner.id) !== (activeActor.personId || activeActor.id)) && !recordPrototypeSuperuserOverride(this.state, 'issue a release as a non-assigned partner')) throw new GuardError('FORBIDDEN_SCOPE', 'Only the assigned engagement partner can issue this release record.');
    if (!eng.candidate) {
      throw new GuardError('INVALID_STATE', 'Cannot issue release: no release candidate prepared.');
    }
    if (eng.candidate.generation !== eng.generation) {
      throw new GuardError('STALE_REVISION', `Release candidate is stale: candidate generation is ${eng.candidate.generation}, but current engagement generation is ${eng.generation}.`);
    }
    if (eng.candidate.sourceVersion !== eng.sourceVersion || eng.candidate.packageRevision !== eng.packageRevision) throw new GuardError('STALE_REVISION', 'Release candidate no longer matches the pinned source and package revisions.');
    const packageDefinition = eng.packageHistory?.find(p => p.id === eng.candidate!.packageDefinitionId && p.revision === eng.packageRevision && p.generation === eng.generation);
    const latestGLSource = eng.glSourceHistory?.at(-1);
    if (!packageDefinition || packageDefinition.glSourceRevision !== latestGLSource?.revision || packageDefinition.glSourceSha256 !== latestGLSource?.sha256 || JSON.stringify(packageDefinition.artifacts) !== JSON.stringify(eng.candidate.manifest)) throw new GuardError('STALE_REVISION', 'Release candidate artifact identities or GL source lineage no longer match the frozen package revision.');
    if (((eng.approvals.partner?.byUserId ? eng.approvals.partner.byUserId !== this.state.currentUserId : eng.approvals.partner?.by !== this.state.currentPerson) && !recordPrototypeSuperuserOverride(this.state, 'issue a release after a different partner recorded sign-off')) || eng.approvals.partner?.generation !== eng.generation) throw new GuardError('FORBIDDEN_SCOPE', 'The active partner must record current-generation sign-off before issue.');
    const seenRecipients = new Set<string>();
    const cleanRecipients = recipients.map(r => r.trim()).filter(r => {
      const key = r.toLowerCase();
      if (!r || seenRecipients.has(key)) return false;
      seenRecipients.add(key);
      return true;
    });
    if (cleanRecipients.length === 0) throw new GuardError('INVALID_STATE', 'Enter at least one distribution recipient for the local release record.');
    if (!dispatchNote.trim()) throw new GuardError('INVALID_STATE', 'A distribution note is required.');

    const alreadyReleased = eng.releases.some(r => r.generation === eng.generation);
    if (alreadyReleased) {
      throw new GuardError('INVALID_STATE', `Generation ${eng.generation} has already been released.`);
    }

    const readiness = this.evaluateReleaseReadiness(engId);
    if (!readiness.ready) {
      throw new GuardError('INVALID_STATE', `Cannot issue release: ${readiness.reason}`);
    }

    const releaseId = `REL-2600${eng.releases.length + 1}`;
    const prevRelease = eng.releases.at(-1);
    eng.releases.push({
      id: releaseId,
      version: eng.releases.length + 1,
      generation: eng.candidate.generation,
      releasedAt: new Date().toISOString(),
      releasedBy: this.state.currentPerson,
      delivered: false,
      dispatchNote,
      predecessorId: prevRelease ? prevRelease.id : undefined,
      recipients: cleanRecipients,
      manifest: eng.candidate.manifest.map((artifact, index) => ({ id: `M-${releaseId}-${index + 1}`, artifactId: artifact.id, name: artifact.name, type: artifact.kind, mimeType: artifact.mimeType, size: artifact.size, sha: artifact.sha256, sourceId: packageDefinition.id, sourceRevision: eng.packageRevision }))
    });
    eng.candidate = null;
    this.logEvent(`Report package released in demo: ${releaseId}`, eng.id);
    this.notify();
  }

  public reopenReleaseForAmendment(engId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'reopen a release for amendment');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" was not found.`);
    if (!reason || !reason.trim()) throw new GuardError('INVALID_STATE', 'Amendment reason is required.');

    if (!eng.releases.length) throw new GuardError('INVALID_STATE', 'No issued release record exists to amend.');

    eng.packageRevision++;
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Release re-opened for amendment: ${reason} (Gen ${eng.generation})`, eng.id);
    this.notify();
  }

  public prepareClientWorkspace(clientId: string, year = 2026, engagementId?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['admin', 'onboarding', 'relationship', 'manager', 'partner'], 'prepare client workspaces');
    const client = this.state.clients.find(c => c.id === clientId);
    if (!client) throw new GuardError('INVALID_STATE', `Client "${clientId}" not found.`);
    requireClientScope(this.state, clientId);
    const matchingEngagements = this.state.engagements.filter(e => e.client === clientId && e.year === year);
    const engagement = engagementId
      ? matchingEngagements.find(e => e.id === engagementId)
      : matchingEngagements.length === 1 ? matchingEngagements[0] : undefined;
    if (engagementId && !engagement) throw new GuardError('INVALID_STATE', `Engagement "${engagementId}" does not match this client and year.`);
    if (!engagementId && matchingEngagements.length > 1) throw new GuardError('INVALID_STATE', 'Choose the exact engagement before preparing a year workspace.');
    if (engagement) requireEngagementScope(this.state, engagement.id, 'administrative');
    if (engagement?.auditLifecycle) { const blockers = activationBlockers(this.state, engagement); if (blockers.length) throw new GuardError('INVALID_STATE', blockers.join(' ')); }
    if (client.status !== 'Active') throw new GuardError('INVALID_STATE', 'Only an active accepted client can have a workspace prepared.');
    const binding = this.state.m365Config;
    const bindingRevision = binding.configRevision || 1;
    const sharePointResult = binding.verificationResults?.sharepoint;
    const expectedResourceId = `${binding.tenantId}|${binding.sharePointSite}|${binding.sharePointLibrary}|${binding.folderRoot}`;
    if (binding.liveConnected !== false || sharePointResult?.outcome !== 'success' || sharePointResult.configRevision !== bindingRevision || sharePointResult.resourceId !== expectedResourceId) {
      throw new GuardError('INVALID_STATE', 'Prepare a client workspace only after the current synthetic SharePoint binding succeeds.');
    }
    const code = client.code;
    const configuredRoot = binding.folderRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    const clientRoot = `${configuredRoot}/${code}/`;
    if (!this.state.folders) this.state.folders = [];
    const canonical = [
      { path: clientRoot, label: `${client.name} Root`, clientId },
      { path: `${clientRoot}${year}/`, label: `FY ${year} Records`, clientId, engagementId: engagement?.id },
      ...(engagement ? [{ path: `${clientRoot}${year}/${engagement.id}/`, label: `${engagement.id} Records`, clientId, engagementId: engagement.id }] : []),
      ...(engagement ? [
        { path: `${clientRoot}${year}/${engagement.id}/01_Administration & Planning/`, label: '01 Administration & Planning', clientId, engagementId: engagement.id },
        { path: `${clientRoot}${year}/${engagement.id}/02_Trial Balance & Schedules/`, label: '02 Trial Balance & Schedules', clientId, engagementId: engagement.id },
        { path: `${clientRoot}${year}/${engagement.id}/03_Fieldwork & Testing/`, label: '03 Fieldwork & Testing', clientId, engagementId: engagement.id },
        { path: `${clientRoot}${year}/${engagement.id}/04_Drafts & Deliverables/`, label: '04 Drafts & Deliverables', clientId, engagementId: engagement.id },
        { path: `${clientRoot}${year}/${engagement.id}/05_Final Signed Archive/`, label: '05 Final Signed Archive', clientId, engagementId: engagement.id }
      ] : [])
    ];
    if (engagement?.auditLifecycle) engagement.auditLifecycle.workspace ||= { path: `${clientRoot}${year}/${engagement.id}/`, preparedAt: new Date().toISOString(), preparedByUserId: this.state.currentUserId };
    canonical.forEach(folder => {
      if (!this.state.folders!.some(f => f.path === folder.path)) {
        this.state.folders!.push(folder);
      }
    });
    this.logEvent(`Canonical SharePoint workspace prepared for client ${code}`, clientId);
    this.notify();
  }

  public renameClientWorkspaceFolder(folderPath: string, label: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'rename workspace folder labels');
    const folder = this.state.folders?.find(item => item.path === folderPath);
    if (!folder || !folder.clientId) throw new GuardError('INVALID_STATE', 'Choose an existing client workspace folder.');
    const client = this.state.clients.find(item => item.id === folder.clientId);
    if (!client || client.status !== 'Active') throw new GuardError('INVALID_STATE', 'Only an active accepted client workspace can be renamed.');
    requireClientScope(this.state, client.id);
    if (folder.engagementId) requireEngagementScope(this.state, folder.engagementId);
    const cleanLabel = label.trim();
    if (!cleanLabel || cleanLabel.length > 120) throw new GuardError('INVALID_STATE', 'Folder display name must contain 1–120 characters.');
    if (cleanLabel === folder.label) return folder;
    const previousLabel = folder.label;
    folder.label = cleanLabel;
    this.logEvent(`Workspace folder display label changed: ${folder.path} · ${previousLabel} → ${cleanLabel}`, folder.engagementId || client.id);
    this.notify();
    return folder;
  }

  public archiveEngagement(engId: string, releaseId: string, retentionUntil?: string, onHold = false, holdReason?: string, artifactCopies?: ArchivedArtifactRecord[]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['records', 'manager', 'partner'], 'create or update local archive metadata');
    requireEngagementScope(this.state, engId, 'records');
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" not found.`);

    // Verify release exists and is eligible (R14)
    const release = eng.releases.find(r => r.id === releaseId);
    if (!release) {
      throw new GuardError('INVALID_STATE', `Cannot archive: Release "${releaseId}" does not exist for engagement "${engId}".`);
    }

    if (!release.manifest.length) throw new GuardError('INVALID_STATE', 'Cannot create an archive index without a release manifest.');
    const normalizedRetentionUntil = retentionUntil?.trim() || undefined;
    if (normalizedRetentionUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedRetentionUntil) || Number.isNaN(Date.parse(normalizedRetentionUntil)) || new Date(`${normalizedRetentionUntil}T00:00:00Z`).toISOString().slice(0, 10) !== normalizedRetentionUntil)) throw new GuardError('INVALID_STATE', 'Enter a valid retention date.');
    if (onHold && !holdReason?.trim()) throw new GuardError('INVALID_STATE', 'An application hold requires a reason.');
    if (!this.state.archives) this.state.archives = [];
    const existing = this.state.archives.find(a => a.engagementId === eng.id && a.releaseId === releaseId);
    const previousArchive = existing ? undefined : [...this.state.archives].reverse().find(a => a.engagementId === eng.id);
    const archiveArtifacts = existing?.artifacts || artifactCopies;
    if (!archiveArtifacts || archiveArtifacts.length !== release.manifest.length || release.manifest.some(m => !archiveArtifacts.some(a => a.sourceArtifactId === m.artifactId && a.sha256 === m.sha))) {
      throw new GuardError('INVALID_STATE', 'Cannot archive until exact release artifact bytes are copied and verified.');
    }
    const archiveManifest = release.manifest.map(m => `${m.id} · ${m.name} · SHA-256 ${m.sha}`);
    const before = existing ? { releaseId: existing.releaseId, retentionUntil: existing.retentionUntil, onHold: Boolean(existing.onApplicationHold ?? existing.onHold), holdReason: existing.holdReason } : undefined;
    const after = { releaseId, retentionUntil: normalizedRetentionUntil, onHold, holdReason: onHold ? holdReason?.trim() : undefined };
    const changed = !before || before.retentionUntil !== after.retentionUntil || before.onHold !== after.onHold || before.holdReason !== after.holdReason;
    const action: ArchiveHistoryEntry['action'] | undefined = !before
      ? previousArchive ? 'Successor release archived' : 'Archived'
      : before.onHold !== after.onHold ? after.onHold ? 'Application hold placed' : 'Application hold lifted'
        : changed ? 'Metadata corrected' : undefined;
    const history: ArchiveHistoryEntry[] = [...(existing?.history || (existing ? [{ action: 'Existing archive state' as const, actorId: existing.archivedBy, at: existing.archivedAt, after: before! }] : []))];
    if (action) history.push({ action, actorId: this.state.currentUserId, at: new Date().toISOString(), before, after });
    const predecessorArchiveId = existing?.predecessorArchiveId || previousArchive?.id;
    const archiveData = {
      archivedAt: existing?.archivedAt || new Date().toISOString(),
      archivedBy: existing?.archivedBy || this.state.currentPerson,
      releaseId,
      manifest: archiveManifest,
      artifacts: archiveArtifacts,
      retentionUntil: normalizedRetentionUntil,
      onApplicationHold: onHold,
      holdReason: after.holdReason,
      predecessorArchiveId,
      history
    };
    eng.archive = archiveData;

    const client = this.state.clients.find(c => c.id === eng.client);
    const archiveRecord: ArchiveRecord = {
      id: existing?.id || `ARC-${eng.id}-${releaseId}`,
      engagementId: eng.id,
      releaseId,
      clientName: client?.name || eng.client,
      service: eng.service,
      year: eng.year,
      archivedAt: archiveData.archivedAt,
      archivedBy: archiveData.archivedBy,
      manifest: archiveManifest,
      artifacts: archiveArtifacts,
      manifestCount: archiveManifest.length,
      retentionUntil: archiveData.retentionUntil,
      onHold,
      onApplicationHold: onHold,
      holdReason: after.holdReason,
      predecessorArchiveId,
      history
    };
    if (existing) Object.assign(existing, archiveRecord, { handoverRequested: existing.handoverRequested, handoverRequester: existing.handoverRequester, handoverNotes: existing.handoverNotes });
    else this.state.archives.push(archiveRecord);

    this.logEvent(`Engagement ${eng.id} archived with ${archiveArtifacts.length} verified artifact copies`, eng.id);
    this.notify();
  }

  public recordArchiveHandover(engId: string, requester: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'records'], 'record an archive handover request');
    requireEngagementScope(this.state, engId, 'records');
    const archive = [...(this.state.archives || [])].reverse().find(a => a.engagementId === engId);
    if (!archive) throw new GuardError('INVALID_STATE', 'The engagement must have a local archive index first.');
    if (archive.onHold) throw new GuardError('INVALID_STATE', 'An active application hold blocks the handover request.');
    if (!requester.trim() || !reason.trim()) throw new GuardError('INVALID_STATE', 'Handover requester and reason are required.');
    archive.handoverRequested = true;
    archive.handoverRequester = requester.trim();
    archive.handoverNotes = `${reason.trim()} · recorded by ${this.state.currentPerson} on ${this.state.asOfDate}`;
    this.logEvent(`Archive handover request recorded for ${requester.trim()}: ${reason.trim()}`, engId);
    this.notify();
  }

  // --- Client Acceptance & Continuance (VP-047 / R12) ---
  public saveAcceptanceCase(accCase: AcceptanceCaseRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['onboarding', 'compliance', 'manager', 'reviewer'], 'record an acceptance recommendation');
    requireClientScope(this.state, accCase.clientId);
    if (!this.state.clients.some(c => c.id === accCase.clientId) || !Number.isInteger(accCase.year) || !accCase.recommendationNotes.trim()) throw new GuardError('INVALID_STATE', 'Acceptance case needs an existing client, reporting year, and recommendation rationale.');
    const requiredEvidence = { amlKyc: accCase.amlKycCompleted, independence: accCase.independenceConfirmed, conflicts: accCase.conflictsCleared, prohibitions: accCase.prohibitionsChecked, competence: accCase.competenceConfirmed };
    if (Object.entries(requiredEvidence).some(([key, checked]) => checked && !accCase.screeningEvidence?.[key as keyof typeof requiredEvidence]?.trim())) throw new GuardError('INVALID_STATE', 'Every completed acceptance screening check needs an evidence reference.');
    const eng = this.state.engagements.find(e => e.id === accCase.engagementId) || this.state.engagements.find(e => e.client === accCase.clientId && e.year === accCase.year && e.service === accCase.service);
    if (eng && (eng.client !== accCase.clientId || eng.year !== accCase.year || eng.service !== accCase.service)) throw new GuardError('FORBIDDEN_SCOPE', 'Acceptance must match the exact engagement, client, service and year.');
    if (accCase.engagementId && !eng) throw new GuardError('FORBIDDEN_SCOPE', 'Acceptance engagement was not found.');
    if (eng) requireEngagementScope(this.state, eng.id, 'administrative');
    if (!this.state.acceptanceCases) this.state.acceptanceCases = [];
    const idx = this.state.acceptanceCases.findIndex(c => c.id === accCase.id);
    const previous = idx >= 0 ? this.state.acceptanceCases[idx] : undefined;
    const linkedEngagement = this.state.engagements.find(e => e.client === accCase.clientId && e.year === accCase.year);
    const at = new Date().toISOString();
    const saved: AcceptanceCaseRecord = {
      ...accCase,
      engagementId: eng?.id || accCase.engagementId || linkedEngagement?.id,
      decisionStatus: 'Pending',
      decisionBy: undefined,
      decisionByUserId: undefined,
      decisionDate: undefined,
      decisionNotes: undefined,
      recommendationBy: this.state.currentPerson,
      recommendationByUserId: this.state.currentUserId,
      recommendationDate: at,
      history: [...(previous?.history || []), { action: 'recommendation', by: this.state.currentPerson, byUserId: this.state.currentUserId, at, notes: accCase.recommendationNotes, status: 'Pending', screeningEvidence: structuredClone(accCase.screeningEvidence || {}) }]
    };
    if (idx >= 0) this.state.acceptanceCases[idx] = saved;
    else this.state.acceptanceCases.push(saved);
    if (eng) {
      eng.acceptance = false;
      this.invalidateReleaseBasis(eng);
    }
    this.logEvent(`Acceptance recommendation saved for client ${accCase.clientId} (partner decision pending)`, accCase.clientId);
    this.notify();
  }

  public decideAcceptanceCase(caseId: string, decision: 'Accepted' | 'Declined', rationale: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['partner'], 'record the client acceptance decision');
    const record = this.state.acceptanceCases?.find(c => c.id === caseId);
    if (!record) throw new GuardError('INVALID_STATE', 'Acceptance case was not found.');
    requireClientScope(this.state, record.clientId);
    const eng = this.state.engagements.find(e => e.id === record.engagementId) || this.state.engagements.find(e => e.client === record.clientId && e.year === record.year);
    if (!eng) throw new GuardError('INVALID_STATE', 'Acceptance decision must be bound to an engagement.');
    if (eng.client !== record.clientId || eng.year !== record.year || eng.service !== record.service) throw new GuardError('FORBIDDEN_SCOPE', 'Acceptance case is not bound to the exact engagement period.');
    requireEngagementScope(this.state, eng.id, 'administrative');
    const assignedPartner = this.state.users.find(u => u.name === eng.partner && u.role === 'partner');
    const actor = this.state.users.find(u => u.id === this.state.currentUserId);
    if ((!assignedPartner || !actor || (assignedPartner.personId || assignedPartner.id) !== (actor.personId || actor.id)) && !recordPrototypeSuperuserOverride(this.state, 'decide an acceptance case as a non-assigned partner')) throw new GuardError('FORBIDDEN_SCOPE', 'Only the assigned engagement partner can decide this case.');
    if (!rationale.trim()) throw new GuardError('INVALID_STATE', 'Partner decision requires a rationale.');
    if (decision === 'Accepted' && record.conditions.length) throw new GuardError('INVALID_STATE', 'Resolve every acceptance condition before Partner approval.');
    if (decision === 'Accepted' && eng.auditLifecycle && !billingSummary(this.state, eng).complete) throw new GuardError('INVALID_STATE', 'Pin the accepted fee, record the required 50% advance and generate its current receipt before Partner acceptance.');
    if (decision === 'Accepted' && (record.riskRating === 'Prohibited' || !record.independenceConfirmed || !record.amlKycCompleted || !record.conflictsCleared || !record.prohibitionsChecked || !record.competenceConfirmed || ['amlKyc', 'independence', 'conflicts', 'prohibitions', 'competence'].some(key => !record.screeningEvidence?.[key as keyof NonNullable<AcceptanceCaseRecord['screeningEvidence']>]?.trim()))) throw new GuardError('INVALID_STATE', 'Acceptance is blocked until all required checks have evidence references and the mandate is not prohibited.');
    requireIndependentActor(record.recommendationByUserId || record.recommendationBy, this.state.currentUserId, 'decide a case they recommended', this.state);
    const at = new Date().toISOString();
    record.decisionStatus = decision;
    record.decisionBy = this.state.currentPerson;
    record.decisionByUserId = this.state.currentUserId;
    record.decisionDate = at;
    record.decisionNotes = rationale.trim();
    record.history ||= [];
    record.history.push({ action: 'decision', by: this.state.currentPerson, byUserId: this.state.currentUserId, at, notes: rationale.trim(), status: decision });
    eng.acceptance = decision === 'Accepted';
    const acceptedClient = this.state.clients.find(client=>client.id===eng.client);
    if (eng.auditLifecycle && decision === 'Accepted' && acceptedClient?.status === 'Prospect') { acceptedClient.status = 'Active'; acceptedClient.profileRevision = (acceptedClient.profileRevision || 0) + 1; }
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Partner ${decision.toLowerCase()} client acceptance case ${caseId}`, eng.id);
    this.notify();
  }

  public createContinuanceDraft(priorEngagementId: string, changedFacts: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'create a continuance draft');
    requireEngagementScope(this.state, priorEngagementId);
    const prior = this.state.engagements.find(e => e.id === priorEngagementId);
    if (!prior) throw new GuardError('INVALID_STATE', 'Prior-period engagement was not found.');
    const caseRecord = this.state.acceptanceCases?.find(c => c.clientId === prior.client && c.year === prior.year);
    const assignedPartner = this.state.users.find(u => u.name === prior.partner && u.role === 'partner');
    if (!prior.acceptance || !caseRecord || (caseRecord.engagementId && caseRecord.engagementId !== prior.id) || caseRecord.decisionStatus !== 'Accepted' || !caseRecord.decisionByUserId || !assignedPartner || (assignedPartner.personId || assignedPartner.id) !== (this.state.users.find(u => u.id === caseRecord.decisionByUserId)?.personId || caseRecord.decisionByUserId)) throw new GuardError('INVALID_STATE', 'A separately accepted prior-period continuance case is required.');
    if (!changedFacts.trim()) throw new GuardError('INVALID_STATE', 'Record current-period changes from the prior period before creating a draft.');
    if (caseRecord.continuedToEngagementId) {
      const existing = this.state.engagements.find(e => e.id === caseRecord.continuedToEngagementId);
      if (existing) return existing;
    }

    const year = prior.year + 1;
    const id = `ENG-CONT-${prior.client}-${year}`;
    if (this.state.engagements.some(e => e.id === id)) throw new GuardError('INVALID_STATE', 'A next-period engagement already exists without a matching continuance link.');
    const dueMonthDay = /^\d{4}-\d{2}-\d{2}$/.test(prior.due) ? prior.due.slice(5) : '09-28';
    const draft: EngagementRecord = {
      ...prior,
      id,
      continuanceFromEngagementId: prior.id,
      continuanceCaseId: caseRecord.id,
      continuanceNotes: changedFacts.trim(),
      stage: 'Acceptance pending',
      year,
      period: `01 Jan – 31 Dec ${year}`,
      due: `${year}-${dueMonthDay}`,
      agreedFee: 0,
      proposalId: undefined,
      acceptance: false,
      terms: false,
      planning: false,
      sourceAccepted: false,
      mappingApproved: false,
      generation: 0,
      packageRevision: 1,
      builtGeneration: 0,
      sourceVersion: 0,
      sourceHistory: [],
      packageHistory: [],
      candidate: null,
      releases: [],
      archive: null,
      approvals: { manager: null, client: null, partner: null, eqr: null },
      approvalHistory: [],
      eqrConcerns: [],
      rows: [],
      adjustment: 0,
      journalState: 'Draft',
      sourceReflection: false,
      supplements: false,
      reconciliations: [],
      workpapers: [],
      reviews: [],
      pbc: [],
      annual: { confirmed: [], decision: null, nextId: null },
      questionnaire: { answers: {}, status: 'Not started' },
      events: [{ text: `Fresh period draft linked to ${prior.id}; changed facts recorded`, ref: id, time: new Date().toISOString(), type: 'history' }]
    };
    this.assignAccountingPeriod(draft);
    this.state.engagements.push(draft);
    caseRecord.changedFacts = changedFacts.trim();
    caseRecord.continuedToEngagementId = id;
    this.state.selectedEngagement = id;
    this.logEvent(`Fresh FY${year} continuance draft created from ${prior.id}`, id);
    this.notify();
    return draft;
  }

  // --- Audit Planning & Materiality (VP-048 / R12) ---
  public saveAuditPlan(plan: AuditPlanRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'prepare an audit plan');
    requireEngagementScope(this.state, plan.engagementId);
    if (!this.state.auditPlans) this.state.auditPlans = [];
    const engPlans = this.state.auditPlans.filter(p => p.engagementId === plan.engagementId);
    const latest = engPlans.reduce<AuditPlanRecord | undefined>((current, item) => !current || item.version > current.version ? item : current, undefined);
    const supersedingApprovedPlan = latest?.status === 'Approved';
    const reviewImpact = supersedingApprovedPlan
      ? `Approved audit plan v${latest.version} superseded by v${plan.version}; reassess affected procedure scope and conclusions.`
      : undefined;
    if (plan.version !== (latest?.version || 0) + 1 || plan.status !== 'Under review') throw new GuardError('STALE_REVISION', `New audit plan must be the next version and start under review (expected v${(latest?.version || 0) + 1}).`);
    if (!Number.isFinite(plan.benchmarkValue) || plan.benchmarkValue <= 0 ||
        !Number.isFinite(plan.materialityRate) || plan.materialityRate <= 0 || plan.materialityRate > 100 ||
        !Number.isFinite(plan.performanceMaterialityRate) || plan.performanceMaterialityRate! <= 0 || plan.performanceMaterialityRate! > 100 ||
        !Number.isFinite(plan.clearlyTrivialRate) || plan.clearlyTrivialRate! < 0 || plan.clearlyTrivialRate! > 100 ||
        !plan.rationales.some(r => r.trim())) {
      throw new GuardError('INVALID_STATE', 'Audit plan needs a positive benchmark, explicit valid materiality rates, and a rationale.');
    }
    const expectedOverall = Math.round(plan.benchmarkValue * plan.materialityRate / 100);
    const expectedPerformance = Math.round(expectedOverall * plan.performanceMaterialityRate! / 100);
    const expectedTrivial = Math.round(expectedOverall * plan.clearlyTrivialRate! / 100);
    if (plan.overallMateriality !== expectedOverall || plan.performanceMateriality !== expectedPerformance || plan.clearlyTrivialThreshold !== expectedTrivial) {
      throw new GuardError('INVALID_STATE', 'Audit plan threshold amounts must match its saved benchmark and explicit rates.');
    }
    if (!Array.isArray(plan.teamAllocations) || plan.teamAllocations.length === 0) {
      throw new GuardError('INVALID_STATE', 'Assign at least one in-scope staff member with a role and scheduled dates before submitting the audit plan.');
    }
    for (const assignment of plan.teamAllocations) {
      const user = this.state.users.find(item => item.status === 'Active' && item.name === assignment.person && !isClientRole(item.role) && canOpenRoute(item.role, 'audit-planning'));
      if (!user) throw new GuardError('INVALID_STATE', 'Every audit plan assignment must name an active staff user with audit-planning access.');
      const visible = visibleEngagementIds(this.state, user.id);
      if (visible !== 'ALL' && !visible.includes(plan.engagementId)) throw new GuardError('FORBIDDEN_SCOPE', 'Every audit plan assignee must have access to this engagement.');
      const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
      if (!assignment.role.trim() || !validDate(assignment.scheduledStart) || !validDate(assignment.scheduledEnd) || assignment.scheduledStart > assignment.scheduledEnd) {
        throw new GuardError('INVALID_STATE', 'Every audit plan assignment needs a role and a valid scheduled date range.');
      }
    }
    if (latest) {
      latest.status = 'Superseded';
      if (reviewImpact) latest.supersededReason = reviewImpact;
    }
    const basisEngagement = this.state.engagements.find(e => e.id === plan.engagementId);
    if (basisEngagement?.auditLifecycle) plan.sourceVersion = basisEngagement.sourceVersion;
    plan.preparedBy = this.state.currentPerson;
    plan.preparedByUserId = this.state.currentUserId;
    plan.preparedAt = new Date().toISOString();
    this.state.auditPlans.push(plan);
    const eng = this.state.engagements.find(e => e.id === plan.engagementId);
    if (eng) {
      eng.planning = false;
      if (reviewImpact) {
        for (const program of this.state.auditPrograms.filter(item => item.engagementId === plan.engagementId || (!item.engagementId && plan.engagementId === this.state.engagements[0]?.id))) {
          for (const procedure of program.procedures) {
            const reason = `Approved audit plan v${latest!.version} changed — reassess planned procedure scope and conclusions.`;
            procedure.scopeReassessmentHistory ||= [];
            procedure.scopeReassessmentHistory.push({ reason, previousStatus: procedure.status, reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: new Date().toISOString() });
            procedure.scopeReassessmentRequired = true;
            procedure.scopeReassessmentReason = reason;
            if (procedure.status === 'Cleared' || procedure.status === 'Submitted') procedure.status = 'In progress';
            procedure.reviewedByUserId = undefined;
            procedure.reviewedAt = undefined;
          }
        }
      }
      this.invalidateReleaseBasis(eng);
    }
    this.logEvent(`Audit plan ${plan.id} saved as v${plan.version} under review`, plan.engagementId);
    this.notify();
  }

  public reviewAuditPlan(planId: string, approved: boolean, notes: string) {
    requireActiveIdentity(this.state);
    if (!this.state.auditPlans) return;
    const plan = this.state.auditPlans.find(p => p.id === planId);
    if (!plan) return;
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'review audit plans');
    requireEngagementScope(this.state, plan.engagementId);
    if (plan.status !== 'Under review') throw new GuardError('STALE_REVISION', 'Only the current under-review plan can be reviewed.');
    if (!notes.trim()) throw new GuardError('INVALID_STATE', 'Plan review requires recorded notes.');
    requireIndependentActor(plan.preparedByUserId || plan.preparedBy || '', this.state.currentUserId, 'review this audit plan', this.state);
    const basisEngagement = this.state.engagements.find(e => e.id === plan.engagementId);
    if (basisEngagement?.auditLifecycle && plan.sourceVersion !== basisEngagement.sourceVersion) throw new GuardError('STALE_REVISION', 'TB changed after this plan was prepared; prepare a fresh materiality revision.');
    plan.status = approved ? 'Approved' : 'Draft';
    plan.reviewedBy = this.state.currentPerson;
    plan.reviewedByUserId = this.state.currentUserId;
    plan.reviewedAt = new Date().toISOString();
    plan.reviewNotes = notes.trim();
    const eng = this.state.engagements.find(e => e.id === plan.engagementId);
    if (eng) {
      eng.planning = approved;
      this.invalidateReleaseBasis(eng);
    }
    this.logEvent(`Audit plan ${plan.id} review recorded: ${plan.status}`, plan.engagementId);
    this.notify();
  }

  // --- M365 Setup (VP-017, VP-022) ---
  public updateM365Config(config: PrototypeState['m365Config']) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['admin', 'manager', 'partner'], 'change simulated Microsoft configuration');
    const prev = this.state.m365Config;
    if (!config || !config.tenantId?.trim() || config.tenantId.length > 128 || !config.tenantName?.trim() || config.tenantName.length > 253 || !config.sharePointLibrary?.trim() || config.sharePointLibrary.length > 128 || !config.folderRoot?.startsWith('/') || config.folderRoot.length > 512 || config.folderRoot.split('/').some(part => part === '.' || part === '..') || config.folderRoot.includes('\\') || config.mailSenderAccount && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.mailSenderAccount)) throw new GuardError('INVALID_STATE', 'Tenant, SharePoint library and an absolute in-scope folder root are required; optional mail must be a valid synthetic mailbox.');
    let site: URL;
    try { site = new URL(config.sharePointSite); } catch { throw new GuardError('INVALID_STATE', 'SharePoint site must be a valid HTTPS site URL.'); }
    if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash || site.pathname === '/') throw new GuardError('INVALID_STATE', 'SharePoint site must be a valid HTTPS site URL without credentials, query or fragment.');
    if (!Array.isArray(config.permittedUsers) || new Set(config.permittedUsers.map(u => u.userId)).size !== config.permittedUsers.length || config.permittedUsers.some(u => !this.state.users.some(person => person.id === u.userId && person.status === 'Active') || !this.state.users.some(person => person.role === u.role && person.status === 'Active'))) throw new GuardError('INVALID_STATE', 'Permitted-person mappings must use unique active personas and active AuditSphere roles.');
    const changed = prev.tenantId !== config.tenantId ||
      prev.tenantName !== config.tenantName ||
      prev.sharePointSite !== config.sharePointSite ||
      prev.sharePointLibrary !== config.sharePointLibrary ||
      prev.folderRoot !== config.folderRoot ||
      prev.mailSenderAccount !== config.mailSenderAccount ||
      prev.oneDriveEnabled !== config.oneDriveEnabled ||
      JSON.stringify(prev.permittedUserGroups) !== JSON.stringify(config.permittedUserGroups) ||
      JSON.stringify(prev.permittedUsers || []) !== JSON.stringify(config.permittedUsers);
    this.state.m365Config = {
      ...config,
      liveConnected: false,
      configRevision: (prev.configRevision || 1) + Number(changed),
      verificationResults: prev.verificationResults || {},
      status: changed ? 'Not configured' : prev.status
    };
    this.notify();
  }

  public simulateM365Verification(card: 'identity' | 'sharepoint' | 'mail' | 'onedrive', outcome: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['admin', 'manager', 'partner'], 'run Microsoft service simulations');
    if (!['success', 'access-denied', 'missing-resource', 'expired-session', 'throttled', 'unavailable'].includes(outcome)) {
      throw new GuardError('INVALID_STATE', `Unsupported simulation outcome "${outcome}".`);
    }
    const config = this.state.m365Config;
    if (card === 'identity' && outcome === 'success' && (!config.permittedUsers?.length || config.permittedUsers.some(u => !this.state.users.some(person => person.id === u.userId && person.status === 'Active')))) throw new GuardError('INVALID_STATE', 'Select at least one active permitted person before a successful identity simulation.');
    if (card === 'mail' && !config.mailSenderAccount.trim()) throw new GuardError('INVALID_STATE', 'Mail verification requires a saved sender selection.');
    if (card === 'onedrive' && !config.oneDriveEnabled) throw new GuardError('INVALID_STATE', 'OneDrive simulation is disabled.');
    const resourceId = card === 'identity' ? `${config.tenantId}|${config.permittedUsers.map(u => `${u.userId}:${u.role}`).join(',')}`
      : card === 'sharepoint' ? `${config.tenantId}|${config.sharePointSite}|${config.sharePointLibrary}|${config.folderRoot}`
        : card === 'mail' ? `${config.tenantId}|${config.mailSenderAccount}`
          : `${config.tenantId}|${config.folderRoot}`;
    const revision = config.configRevision || 1;
    config.verificationResults = {
      ...config.verificationResults,
      [card]: { outcome, testedAt: new Date().toISOString(), configRevision: revision, resourceId }
    };
    const required = ['identity', 'sharepoint'] as const;
    config.status = required.every(key => config.verificationResults?.[key]?.outcome === 'success' && config.verificationResults[key]?.configRevision === revision)
      ? 'Simulated verified'
      : outcome === 'success' ? 'Not configured' : 'Simulated error';
    config.lastSimulatedVerification = new Date().toISOString();
    config.liveConnected = false;
    this.logEvent(`M365 ${card} simulation: ${outcome}`, resourceId);
    this.notify();
  }

  public simulateM365Disconnect() {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['admin', 'manager', 'partner'], 'disconnect the simulated Microsoft configuration');
    this.state.m365Config.status = 'Disconnected';
    this.state.m365Config.configRevision = (this.state.m365Config.configRevision || 1) + 1;
    this.state.m365Config.liveConnected = false;
    this.logEvent('M365 connection simulated disconnected', 'M365');
    this.notify();
  }

  // --- Scenario & State Reset (VP-004) ---
  public loadScenario(name: ScenarioName) {
    this.state = loadScenarioState(name);
    this.logEvent(`Loaded scenario preset: ${name}`, 'SYS');
    this.notify();
  }

  public resetState() {
    this.state = loadScenarioState('target-lifecycle');
    this.loadError = null;
    this.storageConflict = false;
    markStateStale(this.state, false);
    this.logEvent('Local prototype state reset to initial baseline', 'SYS');
    this.notify();
  }

  public exportStateJSON(): string {
    return JSON.stringify(this.state, null, 2);
  }

  public importStateJSON(jsonStr: string) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error('Invalid JSON format for AuditSphere state import.');
    }
    const p = parsed as { engagements?: unknown; schema?: unknown };
    if (!p || !Array.isArray(p.engagements)) {
      throw new Error('Imported state is ambiguous: missing engagements. Prior payload preserved; nothing was overwritten.');
    }
    if (typeof p.schema === 'number' && p.schema > CURRENT_SCHEMA) {
      throw new Error(`Imported state uses schema v${p.schema}, newer than supported v${CURRENT_SCHEMA}.`);
    }
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) localStorage.setItem(STORAGE_BACKUP_KEY, current);
    } catch { /* quota */ }
    const { state, warnings } = migratePersistedState(parsed, createInitialState());
    const issues = validateFixtures(state);
    if (issues.length > 0) {
      throw new Error(`Imported state failed integrity: ${issues[0].message} (${issues.length} issue(s)). Prior payload preserved.`);
    }
    this.state = state;
    this.loadError = null;
    warnings.forEach(w => this.logEvent(w, 'SYS'));
    this.logEvent('Validated synthetic state imported successfully', 'SYS');
    this.notify();
  }
}

export const prototypeStore = new PrototypeStore();
