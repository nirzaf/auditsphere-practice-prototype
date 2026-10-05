// Browser-free client-governance commands (VP-007 / VP-019 slice).
//
// Single implementation shared by the React store and the Cloudflare Worker.
// Ported faithfully from prototypeStore.nominateClientContact,
// reviewClientContactNomination, setClientCustomField, addCustomFieldDefinition,
// setCustomFieldDefinitionEnabled, assignClientRelationshipGroup and
// createClientRelationshipGroup; the existing unit suites are the equivalence guard.

import type { PrototypeState } from '../types';
import { GuardError, requireActiveIdentity, requireClientScope } from '../services/guards';
import { requireRoleKey } from './clientCommands';
import type { CommandContext } from './commandContext';

export type CustomFieldType = PrototypeState['customFields'][number]['type'];

export function nominateClientContactCommand(
  state: PrototypeState,
  input: { clientId: string; name: string; email: string; reason: string },
  ctx: CommandContext
): { nominationId: string } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['client_admin'], 'nominate a client contact');
  requireClientScope(state, input.clientId);
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const reason = input.reason?.trim();
  if (!name || !email || !reason) throw new GuardError('INVALID_STATE', 'Contact name, email and nomination reason are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GuardError('INVALID_STATE', 'Enter a valid contact email address.');
  state.clientContactNominations ||= [];
  if (state.clientContactNominations.some(item => item.clientId === input.clientId && item.email.toLowerCase() === email && item.status === 'Pending review')) {
    throw new GuardError('INVALID_STATE', 'A contact nomination for this email is already awaiting review.');
  }
  const nomination = {
    id: ctx.newId('NOM'),
    clientId: input.clientId,
    name,
    email,
    nominatedByUserId: state.currentUserId,
    nominatedBy: state.currentPerson,
    nominatedAt: ctx.now(),
    reason,
    status: 'Pending review' as const
  };
  state.clientContactNominations.push(nomination);
  ctx.log(`Client contact nominated for staff review: ${name}`, nomination.id);
  ctx.notify();
  return { nominationId: nomination.id };
}

export function reviewClientContactNominationCommand(
  state: PrototypeState,
  nominationId: string,
  note: string,
  ctx: CommandContext
): { nominationId: string } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'onboarding', 'manager', 'partner', 'admin'], 'review client contact nominations');
  const nomination = (state.clientContactNominations || []).find(item => item.id === nominationId);
  if (!nomination) throw new GuardError('INVALID_STATE', 'Contact nomination was not found.');
  requireClientScope(state, nomination.clientId);
  if (nomination.status !== 'Pending review') throw new GuardError('INVALID_STATE', 'Only a pending nomination can be reviewed.');
  if (!note?.trim()) throw new GuardError('INVALID_STATE', 'A review note is required.');
  nomination.status = 'Reviewed';
  nomination.reviewedByUserId = state.currentUserId;
  nomination.reviewedBy = state.currentPerson;
  nomination.reviewedAt = ctx.now();
  nomination.reviewNote = note.trim();
  ctx.log(`Client contact nomination reviewed: ${nomination.name}`, nomination.id);
  ctx.notify();
  return { nominationId };
}

export function setClientCustomFieldCommand(
  state: PrototypeState,
  clientId: string,
  fieldId: string,
  value: string,
  ctx: CommandContext
): { clientId: string } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner', 'admin'], 'update client custom fields');
  requireClientScope(state, clientId);
  const client = state.clients.find(c => c.id === clientId);
  const field = state.customFields.find(f => f.id === fieldId && f.enabled !== false);
  if (!client || !field) throw new GuardError('INVALID_STATE', 'Client or active custom field was not found.');
  const text = value.trim();
  if (!text) throw new GuardError('INVALID_STATE', 'Custom field value is required.');
  if (field.type === 'number' && (!Number.isFinite(Number(text)) || text === '')) throw new GuardError('INVALID_STATE', 'Enter a finite number for this custom field.');
  if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text)) throw new GuardError('INVALID_STATE', 'Enter a valid date for this custom field.');
  if (field.type === 'choice' && !field.options?.includes(text)) throw new GuardError('INVALID_STATE', 'Select one of the configured choices for this custom field.');
  client.customFields ||= {};
  client.customFields[fieldId] = field.type === 'number' ? Number(text) : text;
  ctx.log(`Client custom field updated: ${field.label}`, clientId);
  ctx.notify();
  return { clientId };
}

export function addCustomFieldDefinitionCommand(
  state: PrototypeState,
  label: string,
  type: CustomFieldType,
  options: string[],
  ctx: CommandContext
): { fieldId: string } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner', 'admin'], 'define client custom fields');
  const cleanLabel = label.trim();
  const cleanOptions = [...new Set(options.map(option => option.trim()).filter(Boolean))];
  if (!cleanLabel || state.customFields.some(field => field.label.trim().toLowerCase() === cleanLabel.toLowerCase())) throw new GuardError('INVALID_STATE', 'Enter a unique custom field label.');
  if (type === 'choice' && cleanOptions.length < 2) throw new GuardError('INVALID_STATE', 'Choice fields need at least two distinct options.');
  const field = { id: ctx.newId('cf'), label: cleanLabel, type, options: type === 'choice' ? cleanOptions : undefined, enabled: true };
  state.customFields.push(field);
  ctx.log(`Client custom field defined: ${cleanLabel}`, field.id);
  ctx.notify();
  return { fieldId: field.id };
}

export function setCustomFieldDefinitionEnabledCommand(
  state: PrototypeState,
  fieldId: string,
  enabled: boolean,
  ctx: CommandContext
): { fieldId: string } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner', 'admin'], 'change client custom field availability');
  const field = state.customFields.find(item => item.id === fieldId);
  if (!field) throw new GuardError('INVALID_STATE', 'Custom field definition was not found.');
  field.enabled = enabled;
  ctx.log(`Client custom field ${enabled ? 'enabled' : 'disabled'}: ${field.label}`, field.id);
  ctx.notify();
  return { fieldId };
}

export function assignClientRelationshipGroupCommand(
  state: PrototypeState,
  clientId: string,
  groupId: string | undefined,
  ctx: CommandContext
): { clientId: string; groupIds: string[] } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner', 'admin'], 'change client relationship groups');
  requireClientScope(state, clientId);
  const client = state.clients.find(c => c.id === clientId);
  const group = groupId ? state.relationshipGroups.find(g => g.id === groupId) : undefined;
  if (!client || (groupId && !group)) throw new GuardError('INVALID_STATE', 'Client or relationship group was not found.');
  const touched = new Set<string>();
  if (client.relationshipGroupId) {
    const previous = state.relationshipGroups.find(g => g.id === client.relationshipGroupId);
    if (previous) {
      previous.clientIds = previous.clientIds.filter(id => id !== clientId);
      touched.add(previous.id);
    }
  }
  client.relationshipGroupId = group?.id;
  if (group && !group.clientIds.includes(clientId)) {
    group.clientIds.push(clientId);
    touched.add(group.id);
  }
  ctx.log(`Client ${group ? 'linked to' : 'removed from'} relationship group${group ? ` ${group.name}` : ''}`, clientId);
  ctx.notify();
  return { clientId, groupIds: [...touched] };
}

export function createClientRelationshipGroupCommand(
  state: PrototypeState,
  clientId: string,
  name: string,
  description: string,
  ctx: CommandContext
): { clientId: string; groupId: string; previousGroupId?: string } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner', 'admin'], 'create client relationship groups');
  requireClientScope(state, clientId);
  const client = state.clients.find(c => c.id === clientId);
  if (!client || !name.trim()) throw new GuardError('INVALID_STATE', 'Choose an existing client and enter a relationship group name.');
  if (state.relationshipGroups.some(group => group.name.trim().toLowerCase() === name.trim().toLowerCase())) throw new GuardError('INVALID_STATE', 'A relationship group with this name already exists.');
  let previousGroupId: string | undefined;
  if (client.relationshipGroupId) {
    const previous = state.relationshipGroups.find(group => group.id === client.relationshipGroupId);
    if (previous) {
      previous.clientIds = previous.clientIds.filter(id => id !== clientId);
      previousGroupId = previous.id;
    }
  }
  const group = { id: ctx.newId('GRP-REL'), name: name.trim(), description: description.trim(), clientIds: [clientId] };
  state.relationshipGroups.push(group);
  client.relationshipGroupId = group.id;
  ctx.log(`Client relationship group created: ${group.name}`, clientId);
  ctx.notify();
  return { clientId, groupId: group.id, previousGroupId };
}
