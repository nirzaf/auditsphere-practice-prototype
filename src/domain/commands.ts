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
import { createContactCommand, setPrimaryContactCommand, updateContactCommand } from './crmContactCommands';
import {
  addCustomFieldDefinitionCommand,
  assignClientRelationshipGroupCommand,
  createClientRelationshipGroupCommand,
  nominateClientContactCommand,
  reviewClientContactNominationCommand,
  setClientCustomFieldCommand,
  setCustomFieldDefinitionEnabledCommand
} from './crmClientAdminCommands';
import { convertLeadCommand, createLeadCommand, updateLeadCommand } from './leadCommands';
import { createProposalCommand } from './crmProposalDraftCommands';
import { presentProposalCommand, updateProposalCommand } from './crmProposalReviewCommands';
import { recordProposalResponseCommand, reviewProposalCommand, reviseProposalCommand } from './crmProposalDecisionCommands';
import { createEngagementCommand, setEngagementLifecycleCommand } from './crmEngagementLifecycleCommands';
import { updateEngagementAdminCommand } from './crmEngagementAdminCommands';
import { createInvoiceCommand } from './crmBillingCreateCommands';
import { issueInvoiceCommand, reviewInvoiceCommand } from './crmBillingReviewCommands';
import {
  linkEvidenceProcedureCommand,
  setEvidenceAdequacyCommand,
  unlinkEvidenceProcedureCommand
} from './evidenceCommands';

/** Entity kinds persisted in workspace_entities. These are `PrototypeState` collection keys. */
export type EntityKind = 'clients' | 'contacts' | 'leads' | 'proposals' | 'engagements' | 'invoices' | 'clientContactNominations' | 'customFields' | 'relationshipGroups';

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
      ctx.dispatch?.(command);
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
      ctx.dispatch?.(command);
      return {
        changes: [{ entityKind: 'clients', entityId: saved.id, clientId: saved.id }],
        result: { clientId: saved.id, warnings }
      };
    }
    case 'client.nominateContact': {
      const { nominationId } = nominateClientContactCommand(state, command.payload, ctx);
      ctx.dispatch?.(command);
      return {
        changes: [{ entityKind: 'clientContactNominations', entityId: nominationId, clientId: command.payload.clientId }],
        result: { nominationId }
      };
    }
    case 'client.reviewContactNomination': {
      const { nominationId } = reviewClientContactNominationCommand(state, command.payload.nominationId, command.payload.note, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'clientContactNominations', entityId: nominationId }], result: { nominationId } };
    }
    case 'client.setCustomField': {
      const { clientId } = setClientCustomFieldCommand(state, command.payload.clientId, command.payload.fieldId, command.payload.value, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'clients', entityId: clientId, clientId }], result: { clientId } };
    }
    case 'client.defineCustomField': {
      const { fieldId } = addCustomFieldDefinitionCommand(state, command.payload.label, command.payload.fieldType, command.payload.options ?? [], ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'customFields', entityId: fieldId }], result: { fieldId } };
    }
    case 'client.setCustomFieldEnabled': {
      const { fieldId } = setCustomFieldDefinitionEnabledCommand(state, command.payload.fieldId, command.payload.enabled, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'customFields', entityId: fieldId }], result: { fieldId } };
    }
    case 'client.assignRelationshipGroup': {
      const { clientId, groupIds } = assignClientRelationshipGroupCommand(state, command.payload.clientId, command.payload.groupId, ctx);
      ctx.dispatch?.(command);
      return {
        changes: [
          { entityKind: 'clients', entityId: clientId, clientId },
          ...groupIds.map(id => ({ entityKind: 'relationshipGroups' as const, entityId: id }))
        ],
        result: { clientId, groupIds }
      };
    }
    case 'client.createRelationshipGroup': {
      const { clientId, groupId, previousGroupId } = createClientRelationshipGroupCommand(
        state, command.payload.clientId, command.payload.name, command.payload.description ?? '', ctx
      );
      ctx.dispatch?.(command);
      return {
        changes: [
          { entityKind: 'relationshipGroups', entityId: groupId },
          { entityKind: 'clients', entityId: clientId, clientId },
          ...(previousGroupId ? [{ entityKind: 'relationshipGroups' as const, entityId: previousGroupId }] : [])
        ],
        result: { clientId, groupId }
      };
    }
    case 'lead.create': {
      const { saved } = createLeadCommand(state, command.payload.lead, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'leads', entityId: saved.id }], result: { leadId: saved.id } };
    }
    case 'lead.update': {
      const { saved } = updateLeadCommand(state, command.payload.lead, ctx);
      if (state.leads.some(item => item.id === saved.id)) ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'leads', entityId: saved.id }], result: { leadId: saved.id } };
    }
    case 'lead.convert': {
      const { client } = convertLeadCommand(state, command.payload.leadId, command.payload.clientId, ctx);
      ctx.dispatch?.(command);
      return {
        changes: [
          { entityKind: 'leads', entityId: command.payload.leadId },
          { entityKind: 'clients', entityId: client.id, clientId: client.id }
        ],
        result: { clientId: client.id }
      };
    }
    case 'contact.create': {
      const { saved } = createContactCommand(state, command.payload.contact, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'contacts', entityId: saved.id, clientId: saved.clientId }], result: { contactId: saved.id } };
    }
    case 'contact.update': {
      const { saved, revision } = updateContactCommand(state, command.payload.clientId, command.payload.contactId, command.payload.changes, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'contacts', entityId: saved.id, clientId: saved.clientId }], result: { contactId: saved.id, revision } };
    }
    case 'contact.setPrimary': {
      const { saved } = setPrimaryContactCommand(state, command.payload.clientId, command.payload.contactId, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'contacts', entityId: saved.id, clientId: saved.clientId }], result: { contactId: saved.id } };
    }
    case 'proposal.create': {
      const { saved } = createProposalCommand(state, command.payload.proposal, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'proposals', entityId: saved.id, clientId: saved.clientId }], result: { proposalId: saved.id } };
    }
    case 'proposal.update': {
      const { saved } = updateProposalCommand(state, command.payload.proposal, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'proposals', entityId: saved.id, clientId: saved.clientId }], result: { proposalId: saved.id } };
    }
    case 'proposal.present': {
      const { saved } = presentProposalCommand(state, command.payload.proposalId, command.payload.channel, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'proposals', entityId: saved.id, clientId: saved.clientId }], result: { proposalId: saved.id } };
    }
    case 'proposal.review': {
      const { saved } = reviewProposalCommand(state, command.payload.proposalId, command.payload.approved, command.payload.notes, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'proposals', entityId: saved.id, clientId: saved.clientId }], result: { proposalId: saved.id } };
    }
    case 'proposal.revise': {
      const { saved } = reviseProposalCommand(state, command.payload.proposalId, ctx);
      ctx.dispatch?.(command);
      return {
        changes: [
          { entityKind: 'proposals', entityId: command.payload.proposalId, clientId: saved.clientId },
          { entityKind: 'proposals', entityId: saved.id, clientId: saved.clientId }
        ],
        result: { proposalId: saved.id }
      };
    }
    case 'proposal.respond': {
      const { saved } = recordProposalResponseCommand(state, command.payload.proposalId, command.payload.response, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'proposals', entityId: saved.id, clientId: saved.clientId }], result: { proposalId: saved.id } };
    }
    case 'engagement.create': {
      const { saved } = createEngagementCommand(state, command.payload.engagement, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'engagements', entityId: saved.id, clientId: saved.client, engagementId: saved.id }], result: { engagementId: saved.id } };
    }
    case 'engagement.updateAdmin': {
      const { saved } = updateEngagementAdminCommand(state, command.payload.engagement, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'engagements', entityId: saved.id, clientId: saved.client, engagementId: saved.id }], result: { engagementId: saved.id } };
    }
    case 'engagement.setLifecycle': {
      const { saved } = setEngagementLifecycleCommand(state, command.payload.engagementId, command.payload.status, command.payload.reason, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'engagements', entityId: saved.id, clientId: saved.client, engagementId: saved.id }], result: { engagementId: saved.id } };
    }
    case 'invoice.create': {
      const { saved } = createInvoiceCommand(state, command.payload.invoice, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'invoices', entityId: saved.id, clientId: saved.clientId, engagementId: saved.engagementId ?? saved.eng }], result: { invoiceId: saved.id } };
    }
    case 'invoice.review': {
      const { saved } = reviewInvoiceCommand(state, command.payload.invoiceId, command.payload.approved, command.payload.note ?? '', ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'invoices', entityId: saved.id, clientId: saved.clientId, engagementId: saved.engagementId ?? saved.eng }], result: { invoiceId: saved.id } };
    }
    case 'invoice.issue': {
      const { saved } = issueInvoiceCommand(state, command.payload.invoiceId, ctx);
      ctx.dispatch?.(command);
      return { changes: [{ entityKind: 'invoices', entityId: saved.id, clientId: saved.clientId, engagementId: saved.engagementId ?? saved.eng }], result: { invoiceId: saved.id } };
    }
    case 'evidence.setAdequacy': {
      const result = setEvidenceAdequacyCommand(state, command.payload.evidenceId, command.payload.status, command.payload.rationale ?? '', ctx);
      ctx.dispatch?.(command);
      return { changes: [], result };
    }
    case 'evidence.linkProcedure': {
      const result = linkEvidenceProcedureCommand(state, command.payload.evidenceId, command.payload.procedureId, ctx);
      ctx.dispatch?.(command);
      return { changes: [], result };
    }
    case 'evidence.unlinkProcedure': {
      const result = unlinkEvidenceProcedureCommand(state, command.payload.evidenceId, command.payload.procedureId, command.payload.reason, ctx);
      ctx.dispatch?.(command);
      return { changes: [], result };
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
