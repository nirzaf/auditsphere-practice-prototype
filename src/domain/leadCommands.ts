// Browser-free lead / opportunity commands (VP-009).
// Single implementation shared by the browser store and the Cloudflare Worker.

import type { PrototypeState } from '../types';
import { GuardError, requireActiveIdentity, requireClientScope } from '../services/guards';
import { requireRoleKey } from './clientCommands';
import type { CommandContext } from './commandContext';

type Lead = PrototypeState['leads'][number];

const isValidMoney = (amount: number, allowZero = false) =>
  Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) && Math.round(amount * 100) === amount * 100;

const isRealDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function createLeadCommand(state: PrototypeState, lead: Lead, ctx: CommandContext): { saved: Lead } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner'], 'manage opportunities');
  if (!lead.name.trim() || !lead.contact.trim() || !lead.service.trim() || !lead.owner.trim()) throw new GuardError('INVALID_STATE', 'Opportunity name, contact, requested service, and owner are required.');
  if (!isValidMoney(lead.value, true)) throw new GuardError('INVALID_STATE', 'Opportunity amount must be a finite non-negative amount with at most two decimal places.');
  if (lead.targetDate && !isRealDate(lead.targetDate)) throw new GuardError('INVALID_STATE', 'Opportunity target date must be a real calendar date.');
  if (['Lost', 'Unqualified'].includes(lead.stage) && !lead.lostReason?.trim()) throw new GuardError('INVALID_STATE', 'A lost or unqualified opportunity requires an outcome reason.');
  if (state.leads.some(item => item.id === lead.id)) throw new GuardError('INVALID_STATE', `Opportunity "${lead.id}" already exists.`);
  lead.history ||= [{ by: state.currentPerson, at: ctx.now(), stage: lead.stage }];
  state.leads.push(lead);
  ctx.log(`New opportunity registered: ${lead.name}`, lead.id);
  ctx.notify();
  return { saved: lead };
}

export function updateLeadCommand(state: PrototypeState, lead: Lead, ctx: CommandContext): { saved: Lead } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner'], 'manage opportunities');
  const index = state.leads.findIndex(l => l.id === lead.id);
  if (index < 0) throw new GuardError('INVALID_STATE', `Opportunity "${lead.id}" was not found.`);
  if (state.leads[index].convertedClientId) throw new GuardError('INVALID_STATE', 'A converted opportunity cannot be converted or reclassified again.');
  if (!lead.name.trim() || !lead.contact.trim() || !lead.service.trim() || !lead.owner.trim() || !isValidMoney(lead.value, true)) throw new GuardError('INVALID_STATE', 'Opportunity name, contact, requested service, owner and a valid non-negative fee are required.');
  if (lead.targetDate && !isRealDate(lead.targetDate)) throw new GuardError('INVALID_STATE', 'Opportunity target date must be a real calendar date.');
  if (['Lost', 'Unqualified'].includes(lead.stage) && !lead.lostReason?.trim()) throw new GuardError('INVALID_STATE', 'A lost or unqualified opportunity requires an outcome reason.');
  if (lead.stage !== state.leads[index].stage) {
    lead.history = [
      ...(state.leads[index].history || []),
      { by: state.currentPerson, at: ctx.now(), stage: lead.stage, reason: ['Lost', 'Unqualified'].includes(lead.stage) ? lead.lostReason?.trim() : undefined }
    ];
  }
  state.leads[index] = lead;
  ctx.log(`Opportunity ${lead.id} moved to ${lead.stage}${['Lost', 'Unqualified'].includes(lead.stage) ? `: ${lead.lostReason}` : ''}`, lead.id);
  ctx.notify();
  return { saved: lead };
}

/** Convert a won opportunity into a prospect client. Creates the client when none is named. */
export function convertLeadCommand(state: PrototypeState, leadId: string, clientId: string | undefined, ctx: CommandContext): { client: PrototypeState['clients'][number] } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner'], 'convert opportunities');
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) throw new GuardError('INVALID_STATE', `Opportunity "${leadId}" was not found.`);
  if (lead.convertedClientId) {
    const existing = state.clients.find(c => c.id === lead.convertedClientId);
    if (existing) return { client: existing };
  }
  if (lead.stage !== 'Won') throw new GuardError('INVALID_STATE', 'Only a won opportunity can be converted to a prospect.');
  lead.stage = 'Won';
  lead.accepted = false;

  let client = state.clients.find(c => c.id === clientId);
  if (clientId && !client) throw new GuardError('INVALID_STATE', `Client "${clientId}" was not found.`);
  if (client) requireClientScope(state, client.id);
  if (!client) {
    const newClientId = `CL-00${state.clients.length + 1}`;
    let code = lead.name.slice(0, 4).toUpperCase() || 'NEW';
    let suffix = 1;
    while (state.clients.some(c => c.code.toUpperCase() === code)) code = `${lead.name.slice(0, 3).toUpperCase()}${suffix++}`;
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
    state.clients.push(client);
  }
  lead.convertedClientId = client.id;
  ctx.log(`Opportunity ${lead.name} converted to client ${client.name}`, client.id);
  ctx.notify();
  return { client };
}
