// Browser-free proposal review / dispatch / response commands (VP-010, VP-011).
import type { PrototypeState } from '../types';
import { GuardError, hasAnyRole, requireActiveIdentity, requireClientScope, requireIndependentActor } from '../services/guards';
import { requireRoutedContact } from '../services/contactRouting';
import { requireRoleKey } from './clientCommands';
import type { CommandContext } from './commandContext';
import { hasValidProposalPeriod, isProposalCurrency, isProposalDate, isValidProposalMoney } from './crmProposalRules';
import { templateOk } from './crmProposalDraftCommands';

type Proposal = PrototypeState['proposals'][number];

export function updateProposalCommand(state: PrototypeState, prop: Proposal, ctx: CommandContext): { saved: Proposal } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner'], 'edit proposal drafts');
  const index = state.proposals.findIndex(item => item.id === prop.id);
  if (index < 0 || state.proposals[index].state !== 'Draft') throw new GuardError('INVALID_STATE', 'Only an existing draft proposal can be edited.');
  if (
    !prop.period?.trim() || !hasValidProposalPeriod(prop.periodStart, prop.periodEnd) ||
    !isProposalCurrency(prop.currency) || !templateOk(state, prop) || !prop.items.length ||
    !prop.items.every(
      item =>
        ['Fixed', 'Time & Materials', 'Retainer'].includes(item.feeModel) &&
        item.scope.trim() && item.exclusions?.trim() && item.deliverables.trim() &&
        item.clientResponsibilities?.trim() && item.dependencies?.trim() && item.period?.trim() &&
        hasValidProposalPeriod(item.periodStart, item.periodEnd) &&
        isValidProposalMoney(item.amount, true) && Number.isFinite(item.quantity) && (item.quantity || 0) > 0 &&
        isValidProposalMoney(item.rate ?? item.amount, true) &&
        Math.abs(item.amount - (item.feeModel === 'Fixed' ? item.rate ?? item.amount : (item.quantity || 0) * (item.rate || 0))) <= 0.005
    ) ||
    !prop.terms.trim() || Math.abs(prop.items.reduce((sum, item) => sum + item.amount, 0) - prop.totalAmount) > 0.005
  ) {
    throw new GuardError('INVALID_STATE', 'Proposal scope, fee calculations, period, currency and terms are required.');
  }
  if (prop.state !== 'Draft' || prop.presentedSnapshot || prop.clientResponse || prop.commercialReview?.approved || prop.dispatchHistory?.some(d => d.revision === prop.revision)) {
    throw new GuardError('INVALID_STATE', 'Draft editing cannot manufacture authorization, dispatch or acceptance.');
  }
  state.proposals[index] = structuredClone(prop);
  ctx.log(`Proposal ${prop.id} draft updated`, prop.id);
  ctx.notify();
  return { saved: prop };
}

export function presentProposalCommand(state: PrototypeState, propId: string, channel: 'Email' | 'WhatsApp', ctx: CommandContext): { saved: Proposal } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner'], 'present proposals');
  const prop = state.proposals.find(p => p.id === propId);
  if (!prop) throw new GuardError('INVALID_STATE', `Proposal "${propId}" was not found.`);
  if (!['Email', 'WhatsApp'].includes(channel)) throw new GuardError('INVALID_STATE', 'Proposal dispatch requires Email or WhatsApp.');
  if (prop.state !== 'Approved to send' || !prop.commercialReview?.approved) throw new GuardError('INVALID_STATE', 'Only an approved proposal can be presented.');
  if (!prop.deliveryTimeline?.trim()) throw new GuardError('INVALID_STATE', 'Record the proposal delivery timeline before dispatch.');
  if (
    prop.proposalMode === 'Comprehensive Technical Proposal' &&
    (!prop.firmProfile?.trim() || !prop.firmHistory?.trim() || !prop.regulatoryRegistrations?.length ||
      prop.regulatoryRegistrations.some(value => !value.trim()) ||
      !(typeof prop.teamCredentials === 'string' ? prop.teamCredentials.trim() : prop.teamCredentials?.length) ||
      !prop.industryExperience?.trim() || !prop.auditMethodology?.trim())
  ) {
    throw new GuardError('INVALID_STATE', 'Comprehensive proposal requires firm profile, history, commercial registrations, team CVs, industry portfolio, ISA methodology, fee schedule and delivery timeline before dispatch.');
  }
  if (prop.clientId) requireClientScope(state, prop.clientId);
  const recipient = requireRoutedContact(state.contacts.filter(c => c.clientId === prop.clientId), 'proposals_reports');
  prop.presentedSnapshot = {
    revision: prop.revision, title: prop.title, currency: prop.currency, totalAmount: prop.totalAmount,
    items: structuredClone(prop.items), terms: prop.terms, presentedBy: state.currentPerson, presentedAt: ctx.now(),
    proposalMode: prop.proposalMode, firmProfile: prop.firmProfile, firmHistory: prop.firmHistory,
    deliveryTimeline: prop.deliveryTimeline,
    regulatoryRegistrations: prop.regulatoryRegistrations ? [...prop.regulatoryRegistrations] : undefined,
    teamCredentials: prop.teamCredentials ? structuredClone(prop.teamCredentials) : undefined,
    industryExperience: prop.industryExperience, auditMethodology: prop.auditMethodology,
    period: prop.period, periodStart: prop.periodStart, periodEnd: prop.periodEnd
  };
  (prop.dispatchHistory ||= []).push({
    recipientContactId: recipient?.id,
    recipientName: recipient?.name || state.leads.find(l => l.id === prop.leadId)?.contact || 'Proposal recipient',
    channel, revision: prop.revision, dispatchedAt: ctx.now(), simulatedOutcome: 'Delivered (simulated)'
  });
  prop.state = 'Presented';
  ctx.log(`Proposal ${prop.id} Rev ${prop.revision} presented`, prop.id);
  ctx.notify();
  return { saved: prop };
}
