// Browser-free engagement admin edit (VP-012 slice).
import type { EngagementRecord, PrototypeState } from '../types';
import { GuardError, requireActiveIdentity, requireEngagementScope, visibleEngagementIds } from '../services/guards';
import { requireRoleKey } from './clientCommands';
import type { CommandContext } from './commandContext';
import { invalidateReleaseBasis } from './crmEngagementHelpers';

export function updateEngagementAdminCommand(state: PrototypeState, eng: EngagementRecord, ctx: CommandContext): { saved: EngagementRecord } {
  requireActiveIdentity(state);
  const index = state.engagements.findIndex(e => e.id === eng.id);
  if (index < 0) throw new GuardError('INVALID_STATE', `Engagement "${eng.id}" was not found.`);
  requireRoleKey(state, ['manager', 'partner'], 'edit engagement administration fields');
  requireEngagementScope(state, eng.id, 'administrative');
  const current = state.engagements[index];
  if (['Cancelled', 'Closed'].includes(current.lifecycleStatus || 'Active')) throw new GuardError('INVALID_STATE', 'Cancelled or closed engagements are immutable.');
  if (eng.client !== current.client) throw new GuardError('INVALID_STATE', 'An engagement cannot be reassigned to another client.');
  if (!eng.service.trim() || !eng.period.trim() || !Number.isInteger(eng.year) || eng.year < 1900 || eng.year > 2100) {
    throw new GuardError('INVALID_STATE', 'Engagement service, reporting period and a valid reporting year are required.');
  }
  const updated = { ...current, service: eng.service.trim(), year: eng.year, period: eng.period.trim(), stage: eng.stage, due: eng.due, manager: eng.manager, partner: eng.partner, team: [...eng.team], opinion: eng.opinion };
  if (new Set(updated.team).size !== updated.team.length || !updated.team.includes(updated.manager) || !updated.team.includes(updated.partner)) {
    throw new GuardError('INVALID_STATE', 'The engagement team must contain unique active professional personas, including its manager and partner.');
  }
  for (const name of updated.team) {
    const user = state.users.find(u => u.status === 'Active' && u.group === 'Professional' && u.name === name);
    if (!user) throw new GuardError('INVALID_STATE', 'The engagement team must contain unique active professional personas, including its manager and partner.');
    const visible = visibleEngagementIds(state, user.id);
    if (visible !== 'ALL' && !visible.includes(eng.id)) throw new GuardError('FORBIDDEN_SCOPE', `${name} does not have an active grant to engagement ${eng.id}.`);
  }
  if (JSON.stringify(updated) === JSON.stringify(current)) return { saved: current };
  const changed = (['service', 'year', 'period', 'stage', 'due', 'manager', 'partner', 'team', 'opinion'] as const).filter(k => JSON.stringify(current[k]) !== JSON.stringify(updated[k]));
  updated.events = [...(current.events || []), { id: `ACT-${crypto.randomUUID()}`, text: `Engagement administration changed by ${state.currentPerson}: ${changed.join(', ')}`, ref: eng.id, time: ctx.now(), type: 'history' as const }];
  state.engagements[index] = updated;
  invalidateReleaseBasis(updated);
  ctx.log(`Engagement ${eng.id} changed (${changed.join(', ')}); release approvals reset`, eng.id, 'history');
  ctx.notify();
  return { saved: updated };
}
