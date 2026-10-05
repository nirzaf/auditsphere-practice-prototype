// Browser-free contact commands (VP-007).
//
// Single implementation shared by the browser store and the Cloudflare Worker.
// Ported faithfully from prototypeStore.updateClientContact / addContact /
// setPrimaryContact; the existing unit tests remain the equivalence guard.

import type { PrototypeState } from '../types';
import { GuardError, requireActiveIdentity, requireClientScope } from '../services/guards';
import { requireRoleKey } from './clientCommands';
import type { CommandContext } from './commandContext';

type Contact = PrototypeState['contacts'][number];
type ContactPatch = Partial<
  Pick<
    Contact,
    'name' | 'email' | 'phone' | 'title' | 'responsibility' | 'effectiveFrom' | 'effectiveTo' | 'active' | 'contactRole'
  >
>;

const isRealDate = (value?: string): boolean =>
  !value ||
  (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);

const snapshot = (contact: Contact) => ({
  name: contact.name,
  email: contact.email,
  phone: contact.phone,
  title: contact.title,
  responsibility: contact.responsibility,
  effectiveFrom: contact.effectiveFrom,
  effectiveTo: contact.effectiveTo,
  isPrimary: contact.isPrimary,
  active: contact.active,
  contactRole: contact.contactRole
});

export function createContactCommand(state: PrototypeState, contact: Contact, ctx: CommandContext): { saved: Contact } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner', 'admin', 'onboarding'], 'add client contacts');
  requireClientScope(state, contact.clientId);
  if (!contact.name || !contact.name.trim()) {
    throw new GuardError('INVALID_STATE', 'Contact full name is required.');
  }
  if (
    !state.clients.some(c => c.id === contact.clientId) ||
    !contact.email.trim() ||
    state.contacts.some(c => c.id === contact.id)
  ) {
    throw new GuardError('INVALID_STATE', 'Contact must have a unique ID, existing client and email address.');
  }
  if (contact.isPrimary && !contact.active) throw new GuardError('INVALID_STATE', 'An inactive contact cannot be primary.');
  if (
    !isRealDate(contact.effectiveFrom) ||
    !isRealDate(contact.effectiveTo) ||
    (contact.effectiveFrom && contact.effectiveTo && contact.effectiveTo < contact.effectiveFrom)
  ) {
    throw new GuardError(
      'INVALID_STATE',
      'Contact responsibility dates must be real calendar dates and the end date cannot precede the start date.'
    );
  }
  if (contact.isPrimary) state.contacts.forEach(c => { if (c.clientId === contact.clientId) c.isPrimary = false; });
  contact.portalAccessRequested = false;
  contact.revision ||= 1;
  contact.history ||= [];
  state.contacts.push(contact);
  ctx.log(`Contact added: ${contact.name} (${contact.clientId})`, contact.id);
  ctx.notify();
  return { saved: contact };
}

export function updateContactCommand(
  state: PrototypeState,
  clientId: string,
  contactId: string,
  changes: ContactPatch,
  ctx: CommandContext
): { saved: Contact; revision: number } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner', 'admin', 'onboarding'], 'edit client contacts');
  requireClientScope(state, clientId);
  const index = state.contacts.findIndex(item => item.id === contactId && item.clientId === clientId);
  const current = state.contacts[index];
  if (!current) throw new GuardError('INVALID_STATE', 'Contact was not found in this client.');
  const next = { ...current, ...structuredClone(changes) };
  if (!next.active) next.isPrimary = false;
  if (!next.name.trim() || !next.email.trim()) throw new GuardError('INVALID_STATE', 'Contact full name and email address are required.');
  if (next.isPrimary && !next.active) throw new GuardError('INVALID_STATE', 'An inactive contact cannot be primary.');
  if (
    !isRealDate(next.effectiveFrom) ||
    !isRealDate(next.effectiveTo) ||
    (next.effectiveFrom && next.effectiveTo && next.effectiveTo < next.effectiveFrom)
  ) {
    throw new GuardError(
      'INVALID_STATE',
      'Contact responsibility dates must be real calendar dates and the end date cannot precede the start date.'
    );
  }
  const before = snapshot(current);
  const revision = (current.revision || 1) + 1;
  if (next.isPrimary) state.contacts.forEach(contact => { if (contact.clientId === clientId) contact.isPrimary = contact.id === contactId; });
  else if (current.isPrimary) state.contacts.forEach(contact => { if (contact.clientId === clientId && contact.id === contactId) contact.isPrimary = false; });
  next.revision = revision;
  next.history = [...(current.history || []), { revision, changedAt: ctx.now(), changedByUserId: state.currentUserId, before, after: snapshot(next) }];
  next.portalAccessRequested = current.portalAccessRequested || false;
  state.contacts[index] = next;
  ctx.log(`Contact updated: ${next.name} (Rev ${revision})`, next.id);
  ctx.notify();
  return { saved: next, revision };
}

export function setPrimaryContactCommand(
  state: PrototypeState,
  clientId: string,
  contactId: string,
  ctx: CommandContext
): { saved: Contact } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner', 'admin'], 'set primary client contacts');
  requireClientScope(state, clientId);
  const contact = state.contacts.find(c => c.id === contactId && c.clientId === clientId);
  if (!contact) throw new GuardError('INVALID_STATE', 'Contact not found in this client.');
  if (!contact.active) throw new GuardError('INVALID_STATE', 'An inactive contact cannot be primary.');
  state.contacts.forEach(c => {
    if (c.clientId === clientId) c.isPrimary = c.id === contactId;
  });
  ctx.notify();
  return { saved: contact };
}
