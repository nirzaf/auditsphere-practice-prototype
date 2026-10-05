// Browser-free invoice review + issue commands (VP-030 slice).
import type { InvoiceRecord, PrototypeState } from '../types';
import { GuardError, requireActiveIdentity, requireClientScope, requireEngagementScope, requireIndependentActor } from '../services/guards';
import { requireRoleKey } from './clientCommands';
import type { CommandContext } from './commandContext';

export function reviewInvoiceCommand(state: PrototypeState, invId: string, approved: boolean, note: string, ctx: CommandContext): { saved: InvoiceRecord } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['billing', 'manager', 'partner'], 'review invoices');
  const inv = state.invoices.find(i => i.id === invId);
  if (!inv) throw new GuardError('INVALID_STATE', `Invoice "${invId}" was not found.`);
  requireClientScope(state, inv.clientId);
  if (inv.engagementId) requireEngagementScope(state, inv.engagementId, 'billing');
  if (inv.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only draft invoices can be reviewed.');
  if (approved) requireIndependentActor(inv.preparedBy, state.currentPerson, 'approve their own invoice', state);
  if (!approved) {
    if (!note.trim() || note.trim().length > 500) throw new GuardError('INVALID_STATE', 'A returned invoice requires a bounded review note so the preparer can rework it.');
    inv.status = 'Draft';
    inv.commercialApproval = undefined;
    inv.reviewNote = note.trim();
    ctx.log(`Invoice ${inv.invoiceNumber} returned for changes: ${note.trim()}`, inv.id);
    ctx.notify();
    return { saved: inv };
  }
  inv.status = 'Approved';
  inv.reviewNote = undefined;
  inv.commercialApproval = { by: state.currentPerson, at: ctx.now(), basis: 'Independent commercial fee review', reviewedRevision: Math.max(1, inv.revision || 1) };
  ctx.log(`Invoice ${inv.invoiceNumber} approved`, inv.id);
  ctx.notify();
  return { saved: inv };
}

export function issueInvoiceCommand(state: PrototypeState, invId: string, ctx: CommandContext): { saved: InvoiceRecord } {
  requireActiveIdentity(state);
  requireRoleKey(state, ['billing', 'manager', 'partner'], 'issue invoices');
  const inv = state.invoices.find(i => i.id === invId);
  if (!inv) throw new GuardError('INVALID_STATE', `Invoice "${invId}" was not found.`);
  requireClientScope(state, inv.clientId);
  if (inv.engagementId) requireEngagementScope(state, inv.engagementId, 'billing');
  if (inv.status !== 'Approved' || !inv.commercialApproval || inv.commercialApproval.reviewedRevision !== Math.max(1, inv.revision || 1)) {
    throw new GuardError('INVALID_STATE', 'Only the current independently reviewed invoice revision can be issued.');
  }
  requireIndependentActor(inv.commercialApproval.by, state.currentPerson, 'issue an invoice they reviewed', state);
  inv.status = 'Issued';
  inv.issueDate = ctx.now().split('T')[0];
  ctx.log(`Invoice issued in demo: ${inv.invoiceNumber} (${inv.amount} ${inv.currency})`, inv.id);
  ctx.notify();
  return { saved: inv };
}
