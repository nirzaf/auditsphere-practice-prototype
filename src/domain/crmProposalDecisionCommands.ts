// Browser-free proposal review + response + revision commands (VP-011).
import type { PrototypeState } from '../types';
import { GuardError, hasAnyRole, requireActiveIdentity, requireClientScope, requireIndependentActor } from '../services/guards';
import { requireRoleKey } from './clientCommands';
import type { CommandContext } from './commandContext';
import { isProposalDate } from './crmProposalRules';

type Proposal = PrototypeState['proposals'][number];

export function reviewProposalCommand(state: PrototypeState, propId: string, approved: boolean, notes: string | undefined, ctx: CommandContext): { saved: Proposal } {
  requireActiveIdentity(state);
  if (!hasAnyRole(state, ['partner', 'manager'])) {
    throw new GuardError('FORBIDDEN_SCOPE', `Role "${state.currentRole}" is not authorized to commercially review proposals. Requires partner or manager.`);
  }
  const prop = state.proposals.find(p => p.id === propId);
  if (!prop) throw new GuardError('INVALID_STATE', `Proposal "${propId}" was not found.`);
  if (prop.clientId) requireClientScope(state, prop.clientId);
  requireIndependentActor(prop.preparedBy, state.currentPerson, 'commercially approve this proposal', state);
  if (approved) requireRoleKey(state, ['partner'], 'authorize commercial proposals');
  if (prop.state !== 'Draft' && prop.state !== 'Internal review') throw new GuardError('INVALID_STATE', 'Only an unpresented proposal revision can be reviewed.');
  if (!approved && !notes?.trim()) throw new GuardError('INVALID_STATE', 'A return reason is required before a proposal can be sent back for revision.');
  prop.commercialReview = { reviewedBy: state.currentPerson, reviewedAt: ctx.now(), approved, notes: notes?.trim() || undefined };
  prop.state = approved ? 'Approved to send' : 'Draft';
  ctx.log(`Proposal ${prop.id} ${approved ? 'approved' : 'returned'} by ${state.currentPerson}`, prop.id);
  ctx.notify();
  return { saved: prop };
}

export function reviseProposalCommand(state: PrototypeState, propId: string, ctx: CommandContext): { saved: Proposal } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner'], 'revise proposals');
  const source = state.proposals.find(p => p.id === propId);
  if (!source) throw new GuardError('INVALID_STATE', `Proposal "${propId}" was not found.`);
  if (source.state === 'Accepted' || source.state === 'Superseded') throw new GuardError('INVALID_STATE', 'Accepted or superseded proposals cannot be revised.');
  if (source.clientId) requireClientScope(state, source.clientId);
  source.state = 'Superseded';
  const revision: Proposal = {
    ...structuredClone(source), id: `${source.id}-R${source.revision + 1}`, revision: source.revision + 1,
    predecessorId: source.id, preparedBy: state.currentPerson, preparedAt: ctx.now().slice(0, 10),
    state: 'Draft', commercialReview: undefined, clientResponse: undefined, presentedSnapshot: undefined
  };
  state.proposals.push(revision);
  ctx.log(`Proposal ${source.id} revised as ${revision.id}`, revision.id);
  ctx.notify();
  return { saved: revision };
}

export function recordProposalResponseCommand(state: PrototypeState, propId: string, response: NonNullable<Proposal['clientResponse']>, ctx: CommandContext): { saved: Proposal } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['client', 'relationship', 'manager', 'partner'], 'record client proposal response');
  const prop = state.proposals.find(p => p.id === propId);
  if (!prop || !response) throw new GuardError('INVALID_STATE', 'Proposal or client response was not found.');
  if (!prop.clientId) throw new GuardError('INVALID_STATE', 'Proposal must be linked to a client before recording a response.');
  requireClientScope(state, prop.clientId);
  if (prop.state !== 'Presented' || !prop.commercialReview?.approved) throw new GuardError('INVALID_STATE', 'Only an approved, presented proposal can receive a client response.');
  const authorizedContact = state.contacts.find(
    contact => contact.clientId === prop.clientId && contact.active && contact.name.trim().toLocaleLowerCase() === response.contact?.trim().toLocaleLowerCase()
  );
  if (
    !prop.presentedSnapshot || prop.presentedSnapshot.revision !== prop.revision ||
    !['Accepted', 'Declined', 'Withdrawn'].includes(response.responseType) || !authorizedContact ||
    !['Email', 'WhatsApp', 'Meeting', 'Letter'].includes(response.method) ||
    !isProposalDate(response.date) || !response.evidenceRef?.trim() || !response.notes.trim()
  ) {
    throw new GuardError('INVALID_STATE', 'Response requires the current presented revision, an active client contact, allowed method and allowed response type, valid date, notes, and an evidence reference.');
  }
  prop.clientResponse = {
    ...response, contact: response.contact.trim(), recordedBy: state.currentPerson, recordedRole: state.currentRole,
    contactId: authorizedContact.id, revision: prop.presentedSnapshot.revision
  };
  prop.state = response.responseType;
  ctx.log(`Proposal ${prop.id} client response: ${response.responseType} by ${response.contact} via ${response.method}`, prop.id);
  ctx.notify();
  return { saved: prop };
}
