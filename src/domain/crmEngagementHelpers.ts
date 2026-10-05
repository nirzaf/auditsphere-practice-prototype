// Shared engagement admin helpers (browser-free).
import type { EngagementRecord, PrototypeState } from '../types';
import type { CommandContext } from './commandContext';

export function assignAccountingPeriod(state: PrototypeState, engagement: EngagementRecord, ctx: CommandContext): void {
  const client = state.clients.find(item => item.id === engagement.client);
  if (!client) return;
  const profile = (client.accountingProfile ||= {
    legalEntityName: client.name, reportingBasis: 'Not selected', baseCurrency: engagement.currency || 'QAR',
    accounts: [], periodBooks: [], dimensions: [], revision: 0, chartRevision: 0, history: []
  });
  const period = profile.periodBooks.find(book => book.ownerEngagementId === engagement.id);
  if (period) {
    engagement.accountingPeriodBookId = period.id;
    engagement.accountingProfileRevision = profile.revision;
    engagement.accountingChartRevision = profile.chartRevision;
    return;
  }
  const dates = engagement.period.match(/(\d{4})/g) || [String(engagement.year)];
  const id = `PB-${engagement.id}`;
  if (profile.revision) {
    profile.history.push({
      legalEntityName: profile.legalEntityName, reportingBasis: profile.reportingBasis, baseCurrency: profile.baseCurrency,
      accounts: structuredClone(profile.accounts), periodBooks: structuredClone(profile.periodBooks),
      dimensions: structuredClone(profile.dimensions), revision: profile.revision, chartRevision: profile.chartRevision,
      savedAt: ctx.now(), savedByUserId: state.currentUserId
    });
  }
  profile.periodBooks.push({ id, name: engagement.period, bookName: engagement.mode || 'General ledger', startDate: `${dates[0]}-01-01`, endDate: `${dates.at(-1) || dates[0]}-12-31`, ownerEngagementId: engagement.id, status: 'Open' });
  profile.revision++;
  // Sibling engagements on the same client carry the updated accounting revisions too,
  // exactly as the store's original private helper did.
  for (const existing of state.engagements.filter(item => item.client === engagement.client)) {
    existing.accountingProfileRevision = profile.revision;
    existing.accountingChartRevision = profile.chartRevision;
  }
  engagement.accountingPeriodBookId = id;
  engagement.accountingProfileRevision = profile.revision;
  engagement.accountingChartRevision = profile.chartRevision;
}

export function invalidateReleaseBasis(eng: EngagementRecord): void {
  eng.generation++;
  eng.candidate = null;
  eng.approvals.manager = null;
  eng.approvals.client = null;
  eng.approvals.partner = null;
  eng.approvals.eqr = null;
}
