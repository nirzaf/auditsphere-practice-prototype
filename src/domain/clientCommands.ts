// Browser-free client-profile commands.
//
// These bodies are the single implementation of the client create/update rules.
// `prototypeStore` delegates to them and the Cloudflare Worker executes them
// directly, so the browser can never diverge from the server.
// Ported faithfully from the original store methods; the existing unit tests
// remain the equivalence guard.

import type { ClientRecord, PrototypeState, RoleKey } from '../types';
import { GuardError, requireActiveIdentity, requireClientScope, visibleClientIds } from '../services/guards';
import type { CommandContext } from './commandContext';

const CLIENT_TYPES = ['Company', 'Individual', 'Partnership', 'Government', 'Nonprofit', 'Other'];
const CLIENT_STATUSES = ['Prospect', 'Active', 'Suspended', 'Archived'];

export function requireRoleKey(state: PrototypeState, allowed: readonly RoleKey[], action: string): void {
  if (state.currentRole !== 'superuser' && !allowed.includes(state.currentRole)) {
    throw new GuardError('FORBIDDEN_SCOPE', `Role "${state.currentRole}" cannot ${action}.`);
  }
}

export function isInScopeUser(state: PrototypeState, clientId: string, name: string, roles: readonly RoleKey[]): boolean {
  return state.users.some(user => {
    if (user.status !== 'Active' || user.name !== name || !roles.includes(user.role)) return false;
    const visible = visibleClientIds(state, user.id);
    return visible === 'ALL' || visible.includes(clientId);
  });
}

/** Pure client-profile validation. Exactly the rules the browser already enforced. */
export function validateClientProfile(state: PrototypeState, client: ClientRecord): void {
  if (!client.name?.trim()) throw new GuardError('INVALID_STATE', 'Client legal name is required.');
  if (!client.code?.trim()) throw new GuardError('INVALID_STATE', 'Client code is required.');
  if (!client.clientType || !CLIENT_TYPES.includes(client.clientType)) throw new GuardError('INVALID_STATE', 'Choose a valid client type.');
  if (!CLIENT_STATUSES.includes(client.status)) throw new GuardError('INVALID_STATE', 'Choose a valid client status.');
  if (!client.relationshipOwner?.trim()) throw new GuardError('INVALID_STATE', 'A relationship owner is required.');
  if (!isInScopeUser(state, client.id, client.relationshipOwner, ['relationship', 'manager', 'partner'])) throw new GuardError('FORBIDDEN_SCOPE', 'Relationship owner must be an active relationship, manager, or partner persona with client scope.');
  if (client.partner && !isInScopeUser(state, client.id, client.partner, ['partner'])) throw new GuardError('FORBIDDEN_SCOPE', 'Assigned partner must be active and have client scope.');
  if (client.manager && !isInScopeUser(state, client.id, client.manager, ['manager'])) throw new GuardError('FORBIDDEN_SCOPE', 'Assigned manager must be active and have client scope.');
  const email = client.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GuardError('INVALID_STATE', 'Enter a valid client email address.');
  const phone = client.phone?.trim();
  if (phone && !/^\+?[0-9().\s-]{7,24}$/.test(phone)) throw new GuardError('INVALID_STATE', 'Enter a valid client phone number.');
  const website = client.website?.trim();
  if (website) {
    try {
      const url = new URL(website);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) throw new Error();
    } catch {
      throw new GuardError('INVALID_STATE', 'Enter a valid website URL beginning with http:// or https://.');
    }
  }
  if (typeof client.revenue !== 'number' || !Number.isFinite(client.revenue) || client.revenue < 0) throw new GuardError('INVALID_STATE', 'Annual revenue must be a finite non-negative amount.');
  if (client.entityRole && !['Standalone', 'Holding', 'Subsidiary', 'Affiliate'].includes(client.entityRole)) throw new GuardError('INVALID_STATE', 'Choose a supported corporate hierarchy role.');
  if (['Subsidiary', 'Affiliate'].includes(client.entityRole || '') && !client.parentClientId) throw new GuardError('INVALID_STATE', 'Subsidiaries and affiliates require a recorded parent entity.');
  if (client.parentClientId) {
    const seen = new Set([client.id]);
    let parent: string | undefined = client.parentClientId;
    while (parent) {
      if (seen.has(parent)) throw new GuardError('INVALID_STATE', 'Corporate hierarchy cannot contain a cycle or self-parent.');
      const entity = state.clients.find(c => c.id === parent);
      if (!entity) throw new GuardError('INVALID_STATE', 'Corporate parent must be an existing client entity.');
      requireClientScope(state, parent);
      seen.add(parent);
      parent = entity.parentClientId;
    }
  }
}

/** Similar-name / duplicate-registration warnings. Pure and scope-aware. */
export function clientProfileWarnings(
  state: PrototypeState,
  client: Pick<ClientRecord, 'name' | 'registrationNumber'>,
  excludingClientId?: string
): string[] {
  const visible = visibleClientIds(state);
  const nameTokens = (value: string) => value.toLowerCase().replace(/\b(limited|ltd|llc|wll|company|co|the)\b/g, ' ').match(/[a-z0-9]+/g) || [];
  const tokens = nameTokens(client.name).filter(token => token.length > 2);
  const warnings: string[] = [];
  for (const existing of state.clients) {
    if (existing.id === excludingClientId || (visible !== 'ALL' && !visible.includes(existing.id))) continue;
    const sameRegistration = Boolean(
      client.registrationNumber?.trim() && existing.registrationNumber?.trim()
      && client.registrationNumber.trim().toLowerCase() === existing.registrationNumber.trim().toLowerCase()
    );
    const existingTokens = new Set(nameTokens(existing.name).filter(token => token.length > 2));
    const overlap = [...new Set(tokens)].filter(token => existingTokens.has(token));
    const similarName = overlap.length >= 2
      || (tokens.length > 0 && tokens.every(token => existingTokens.has(token)))
      || [...existingTokens].every(token => token.length > 2 && tokens.includes(token));
    if (sameRegistration) warnings.push(`Registration number matches ${existing.name} (${existing.id}); review before saving. The legal entities will remain separate.`);
    else if (similarName) warnings.push(`Name is similar to ${existing.name} (${existing.id}); review the legal entity before saving. No records will be merged.`);
  }
  return warnings;
}

/** Create a client profile. Requires Global client scope (matches the store). */
export function createClientCommand(
  state: PrototypeState,
  client: ClientRecord,
  ctx: CommandContext
): { saved: ClientRecord; warnings: string[] } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner'], 'create client profiles');
  if (visibleClientIds(state) !== 'ALL') throw new GuardError('FORBIDDEN_SCOPE', 'Creating a client profile requires an active Global client grant.');
  validateClientProfile(state, client);
  if (state.clients.some(existing => existing.id === client.id)) throw new GuardError('INVALID_STATE', `Client "${client.id}" already exists.`);
  const normalized = client.code.trim().toUpperCase();
  if (state.clients.some(c => c.code.trim().toUpperCase() === normalized)) {
    throw new GuardError('INVALID_STATE', `Duplicate client code "${client.code}". Review the similar-name warning instead of merging distinct legal entities.`);
  }
  const saved: ClientRecord = {
    ...client,
    code: normalized,
    name: client.name.trim(),
    clientType: client.clientType,
    profileRevision: 0,
    accountingProfile: client.accountingProfile || {
      legalEntityName: client.name.trim(),
      reportingBasis: 'Not selected',
      baseCurrency: 'QAR',
      accounts: [],
      periodBooks: [],
      dimensions: [],
      revision: 0,
      chartRevision: 0,
      history: []
    }
  };
  state.clients.push(saved);
  if (saved.contact?.trim() && saved.email?.trim()) {
    state.contacts.push({
      id: ctx.newId('CNT'),
      clientId: saved.id,
      name: saved.contact.trim(),
      email: saved.email.trim(),
      phone: saved.phone?.trim() || undefined,
      isPrimary: true,
      active: true
    });
  }
  ctx.log(`New client profile created: ${saved.name}`, saved.id);
  ctx.notify();
  return { saved, warnings: clientProfileWarnings(state, saved, saved.id) };
}

/**
 * Update a client profile with an optimistic profile-revision check.
 * A stale revision fails closed with STALE_REVISION; it is never merged
 * last-write-wins, because a client profile carries professional decisions.
 */
export function updateClientCommand(
  state: PrototypeState,
  client: ClientRecord,
  expectedProfileRevision: number,
  ctx: CommandContext
): { saved: ClientRecord; warnings: string[] } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['relationship', 'manager', 'partner'], 'edit client profiles');
  requireClientScope(state, client.id);
  const index = state.clients.findIndex(c => c.id === client.id);
  if (index < 0) throw new GuardError('INVALID_STATE', `Client "${client.id}" was not found.`);
  const current = state.clients[index];
  if ((current.profileRevision || 0) !== expectedProfileRevision) {
    throw new GuardError('STALE_REVISION', `Stale client profile: expected revision ${expectedProfileRevision} but found ${current.profileRevision || 0}. Reload the profile and retry.`);
  }
  validateClientProfile(state, client);
  const normalized = client.code.trim().toUpperCase();
  if (state.clients.some(c => c.id !== client.id && c.code.trim().toUpperCase() === normalized)) {
    throw new GuardError('INVALID_STATE', `Duplicate client code "${client.code}".`);
  }
  const saved: ClientRecord = {
    ...current,
    ...client,
    code: normalized,
    name: client.name.trim(),
    profileRevision: expectedProfileRevision + 1,
    accountingProfile: current.accountingProfile,
    customFields: current.customFields,
    relationshipGroupId: current.relationshipGroupId
  };
  state.clients[index] = saved;
  ctx.log(`Client profile updated: ${saved.name} (Rev ${saved.profileRevision})`, saved.id);
  ctx.notify();
  return { saved, warnings: clientProfileWarnings(state, saved, saved.id) };
}
