// Browser-free proposal draft commands (VP-010).
import type { PrototypeState } from '../types';
import { GuardError, requireActiveIdentity, requireClientScope } from '../services/guards';
import { requireRoleKey } from './clientCommands';
import type { CommandContext } from './commandContext';
import { hasValidProposalPeriod, isProposalCurrency, isValidProposalMoney } from './crmProposalRules';

type Proposal = PrototypeState['proposals'][number];

export function lineOk(state: PrototypeState, item: Proposal['items'][number]): boolean {
  return Boolean(
    item.serviceName.trim() &&
    ['Fixed', 'Time & Materials', 'Retainer'].includes(item.feeModel) &&
    item.scope.trim() &&
    item.description.trim() &&
    item.exclusions?.trim() &&
    item.deliverables.trim() &&
    item.clientResponsibilities?.trim() &&
    item.dependencies?.trim() &&
    item.period?.trim() &&
    hasValidProposalPeriod(item.periodStart, item.periodEnd) &&
    isValidProposalMoney(item.amount, true) &&
    Number.isFinite(item.quantity) &&
    (item.quantity || 0) > 0 &&
    isValidProposalMoney(item.rate ?? item.amount, true) &&
    Math.abs(item.amount - (item.feeModel === 'Fixed' ? item.rate ?? item.amount : (item.quantity || 0) * (item.rate || 0))) <= 0.005 &&
    (!item.serviceId ||
      Boolean(
        state.proposalServices?.some(s => s.id === item.serviceId && (!item.serviceRevision || s.revision === item.serviceRevision)) ||
          state.proposalServiceHistory?.some(s => s.id === item.serviceId && s.revision === item.serviceRevision)
      ))
  );
}

export function templateOk(state: PrototypeState, prop: Proposal): boolean {
  return !prop.templateId || Boolean(
    state.proposalTemplates?.some(t => t.id === prop.templateId && t.revision === prop.templateRevision) ||
      state.proposalTemplateHistory?.some(t => t.id === prop.templateId && t.revision === prop.templateRevision)
  );
}

export function createProposalCommand(state: PrototypeState, prop: Proposal, ctx: CommandContext): { saved: Proposal } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner'], 'draft proposals');
  if (prop.clientId) requireClientScope(state, prop.clientId);
  if (prop.leadId && !state.leads.some(l => l.id === prop.leadId)) throw new GuardError('INVALID_STATE', 'Proposal opportunity was not found.');
  if (prop.leadId && prop.clientId && state.leads.find(l => l.id === prop.leadId)?.convertedClientId !== prop.clientId) {
    throw new GuardError('INVALID_STATE', 'Proposal opportunity and client do not match.');
  }
  if (state.proposals.some(p => p.id === prop.id)) throw new GuardError('INVALID_STATE', `Proposal "${prop.id}" already exists.`);
  if (
    !prop.title.trim() || !prop.period?.trim() || !hasValidProposalPeriod(prop.periodStart, prop.periodEnd) ||
    !isProposalCurrency(prop.currency) || !templateOk(state, prop) || !prop.items.length ||
    !prop.items.every(item => lineOk(state, item)) || !prop.terms.trim() ||
    !isValidProposalMoney(prop.totalAmount, true) ||
    Math.abs(prop.items.reduce((sum, item) => sum + item.amount, 0) - prop.totalAmount) > 0.005
  ) {
    throw new GuardError('INVALID_STATE', 'Proposal requires a period, supported currency, complete line scope, valid service and reconciled fee calculations.');
  }
  if (prop.state !== 'Draft' || prop.presentedSnapshot || prop.clientResponse || prop.commercialReview?.approved || prop.dispatchHistory?.length) {
    throw new GuardError('INVALID_STATE', 'New proposals start as drafts; authorization, dispatch and acceptance require their separate commands.');
  }
  state.proposals.push(structuredClone(prop));
  ctx.log(`Proposal ${prop.title} drafted (Rev ${prop.revision})`, prop.id);
  ctx.notify();
  return { saved: prop };
}
