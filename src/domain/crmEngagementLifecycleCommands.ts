// Browser-free engagement create + lifecycle commands (VP-012).
import type { EngagementRecord, PrototypeState } from '../types';
import { GuardError, requireActiveIdentity, requireClientScope, requireEngagementScope } from '../services/guards';
import { emptyAuditLifecycle } from '../services/targetLifecycle';
import { requireRoleKey } from './clientCommands';
import type { CommandContext } from './commandContext';
import { assignAccountingPeriod, invalidateReleaseBasis } from './crmEngagementHelpers';

export function createEngagementCommand(state: PrototypeState, eng: EngagementRecord, ctx: CommandContext): { saved: EngagementRecord } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['manager', 'partner'], 'create engagements');
  requireClientScope(state, eng.client);
  const engagementClient = state.clients.find(c => c.id === eng.client);
  if (!engagementClient) throw new GuardError('INVALID_STATE', 'Engagement client was not found.');
  if (['Suspended', 'Archived'].includes(engagementClient.status) && !['Draft', 'Acceptance', 'Acceptance pending'].includes(eng.stage)) {
    throw new GuardError('INVALID_STATE', `Client ${engagementClient.id} is ${engagementClient.status.toLowerCase()}; reactivate the client before starting active professional work.`);
  }
  if (eng.proposalId) {
    const proposal = state.proposals.find(p => p.id === eng.proposalId);
    if (!proposal || proposal.clientId !== eng.client || proposal.state !== 'Accepted' || !proposal.clientResponse?.evidenceRef || proposal.presentedSnapshot?.revision !== proposal.revision) {
      throw new GuardError('INVALID_STATE', 'Engagement must link to the same client’s accepted current proposal revision with evidence.');
    }
    const existing = state.engagements.find(e => e.proposalId === eng.proposalId);
    if (existing) { requireClientScope(state, existing.client); return { saved: existing }; }
    if (!['Draft', 'Acceptance'].includes(eng.stage) && (!eng.acceptance || !eng.terms)) {
      throw new GuardError('INVALID_STATE', 'Engagement activation requires a separate professional acceptance and agreed terms.');
    }
  } else if (!eng.acceptance || !eng.terms) {
    throw new GuardError('INVALID_STATE', 'Engagements without an accepted proposal require recorded acceptance and terms.');
  }
  if (state.engagements.some(e => e.id === eng.id)) throw new GuardError('INVALID_STATE', `Engagement "${eng.id}" already exists.`);
  assignAccountingPeriod(state, eng, ctx);
  eng.auditLifecycle ||= emptyAuditLifecycle();
  eng.eqrRequired = false;
  state.engagements.push(eng);
  state.selectedEngagement = eng.id;
  ctx.log(`New engagement created: ${eng.service} FY${eng.year}`, eng.id);
  ctx.notify();
  return { saved: eng };
}

export function setEngagementLifecycleCommand(
  state: PrototypeState, engagementId: string, status: NonNullable<EngagementRecord['lifecycleStatus']>, reason: string, ctx: CommandContext
): { saved: EngagementRecord } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['manager', 'partner'], 'change engagement lifecycle');
  requireEngagementScope(state, engagementId, 'administrative');
  const engagement = state.engagements.find(item => item.id === engagementId);
  if (!engagement) throw new GuardError('INVALID_STATE', `Engagement "${engagementId}" was not found.`);
  if (!reason.trim()) throw new GuardError('INVALID_STATE', 'An engagement lifecycle decision requires a reason.');
  const current = engagement.lifecycleStatus || 'Active';
  const valid =
    current === 'Active' ? ['Suspended', 'Cancelled', 'Closed'].includes(status) :
    current === 'Suspended' ? ['Active', 'Cancelled', 'Closed'].includes(status) : false;
  if (!valid) throw new GuardError('INVALID_STATE', `${current} engagement cannot transition to ${status}.`);
  if (status === 'Active' && ['Draft', 'Acceptance'].includes(engagement.stage) && engagement.proposalId && !engagement.professionalAcceptance) {
    throw new GuardError('INVALID_STATE', 'Cannot resume an engagement without current professional acceptance.');
  }
  engagement.lifecycleStatus = status;
  engagement.events ||= [];
  engagement.events.push({ text: `${current} → ${status} by ${state.currentPerson}: ${reason.trim()}`, ref: engagement.id, time: ctx.now(), type: 'lifecycle' });
  invalidateReleaseBasis(engagement);
  ctx.log(`Engagement ${engagement.id} ${status.toLowerCase()}: ${reason.trim()}`, engagement.id, 'history');
  ctx.notify();
  return { saved: engagement };
}
