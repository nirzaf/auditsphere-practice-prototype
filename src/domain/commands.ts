// Command dispatcher.
//
// Maps the shared typed command union onto the browser-free domain command
// bodies. Imported by BOTH the React store and the Cloudflare Worker so there is
// exactly one implementation of each rule.

import type { PrototypeState } from '../types';
import type { WorkspaceCommand } from '../shared/api/commands';
import { GuardError } from '../services/guards';
import type { CommandContext } from './commandContext';
import { createClientCommand, updateClientCommand } from './clientCommands';
import { convertLeadCommand, createLeadCommand, updateLeadCommand } from './leadCommands';

/** Entity kinds persisted in workspace_entities. These are `PrototypeState` collection keys. */
export type EntityKind = 'clients' | 'contacts' | 'leads';

export interface DomainChange {
  entityKind: EntityKind;
  entityId: string;
  clientId?: string;
  engagementId?: string;
}

export interface DomainCommandResult {
  changes: DomainChange[];
  /** Optional payload returned to the caller (e.g. similar-name warnings). */
  result?: unknown;
}

/**
 * Execute one command against `state` (mutated in place).
 * Throws GuardError with a stable code; the transport layer maps it to an
 * ApiErrorCode and HTTP status.
 */
export function runWorkspaceCommand(
  state: PrototypeState,
  command: WorkspaceCommand,
  ctx: CommandContext
): DomainCommandResult {
  switch (command.type) {
    case 'client.create': {
      const client = command.payload.client;
      const { saved, warnings } = createClientCommand(state, client, ctx);
      // A primary contact may have been materialised alongside the client.
      const contact = state.contacts.find(c => c.clientId === saved.id && c.isPrimary);
      return {
        changes: [
          { entityKind: 'clients', entityId: saved.id, clientId: saved.id },
          ...(contact ? [{ entityKind: 'contacts' as const, entityId: contact.id, clientId: saved.id }] : [])
        ],
        result: { clientId: saved.id, warnings }
      };
    }
    case 'client.update': {
      const { saved, warnings } = updateClientCommand(
        state,
        command.payload.client,
        command.payload.expectedProfileRevision,
        ctx
      );
      return {
        changes: [{ entityKind: 'clients', entityId: saved.id, clientId: saved.id }],
        result: { clientId: saved.id, warnings }
      };
    }
    case 'lead.create': {
      const { saved } = createLeadCommand(state, command.payload.lead, ctx);
      return { changes: [{ entityKind: 'leads', entityId: saved.id }], result: { leadId: saved.id } };
    }
    case 'lead.update': {
      const { saved } = updateLeadCommand(state, command.payload.lead, ctx);
      return { changes: [{ entityKind: 'leads', entityId: saved.id }], result: { leadId: saved.id } };
    }
    case 'lead.convert': {
      const { client } = convertLeadCommand(state, command.payload.leadId, command.payload.clientId, ctx);
      return {
        changes: [
          { entityKind: 'leads', entityId: command.payload.leadId },
          { entityKind: 'clients', entityId: client.id, clientId: client.id }
        ],
        result: { clientId: client.id }
      };
    }
    case 'workspace.rename': {
      const name = command.payload.name?.trim();
      if (!name || name.length > 200) throw new GuardError('INVALID_STATE', 'Workspace name must be 1-200 characters.');
      return { changes: [], result: { name } };
    }
    default: {
      // Exhaustiveness guard: adding a union member without a body is a type error.
      const never: never = command;
      throw new GuardError('INVALID_STATE', `Unsupported command ${JSON.stringify(never)}.`);
    }
  }
}
