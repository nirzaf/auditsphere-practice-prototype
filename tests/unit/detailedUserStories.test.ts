import { beforeEach, it } from 'node:test';
import assert from 'node:assert/strict';
import { targetFixture, act, acceptance } from '../helpers/targetFixture';
import { prototypeStore as store } from '../../src/store/prototypeStore';
import { TargetLifecycleCommands } from '../../src/store/targetLifecycleCommands';
import { closeExpiredArchives, practiceEconomics } from '../../src/services/targetLifecycle';
import { requireEngagementScope } from '../../src/services/guards';
import { getRoutedContact } from '../../src/services/contactRouting';

let state: ReturnType<typeof targetFixture>;
let commands: TargetLifecycleCommands;
const writer = async (id: string) => ({ id, name: `${id}.pdf`, kind: 'PDF' as const, mimeType: 'application/pdf', size: 3, sha256: 'a'.repeat(64) });
beforeEach(async () => {
  state = targetFixture();
  (store as any).state = state;
  commands = new TargetLifecycleCommands(() => state, () => {}, writer);
  const engagement = state.engagements[0];
  act(state, 'manager');
  commands.pinAcceptedProposal(engagement.id, engagement.proposalId!);
  store.saveAcceptanceCase(acceptance(state));
  act(state, 'partner');
  store.decideAcceptanceCase('ACC-TARGET', 'Accepted', 'Independent screening against all required evidence.');
  store.generateEngagementLetter(engagement.id, 'ISA 210 External Statutory Audit', 'IFRS', state.currentPerson, true);
  act(state, 'billing');
  commands.recordAdvance(engagement.id, { amount: engagement.agreedFee / 2, date: state.asOfDate, reference: 'STORY-ADV', method: 'Bank transfer' });
  await commands.generateOfficialReceipt(engagement.id);
});

it('US-M1-003 never substitutes a primary finance contact for MD/GM or audit liaison', () => {
  const finance = state.contacts.filter(contact => contact.title === 'Chief Financial Officer');
  assert.ok(getRoutedContact(finance, 'invoices_receipts'));
  assert.equal(getRoutedContact(finance, 'proposals_reports'), undefined);
  assert.equal(getRoutedContact(finance, 'pbc_requests'), undefined);
  finance[0].active = false;
  assert.equal(getRoutedContact(finance, 'invoices_receipts'), undefined);
});

it('US-M1-011 advance receipt settles the exact invoice and reversal restores its outstanding balance', () => {
  const engagement = state.engagements[0];
  const receipt = state.receipts[0], invoice = state.invoices.find(item => item.id === receipt.allocations[0].invoiceId)!;
  assert.equal(invoice.engagementId, engagement.id);
  assert.equal(invoice.status, 'Paid');
  assert.equal(invoice.paid, receipt.amount);
  assert.equal(receipt.allocatedAmount, receipt.amount);
  commands.reverseAdvance(engagement.id, receipt.id, 'Synthetic payment reference corrected.');
  assert.equal(invoice.status, 'Issued');
  assert.equal(invoice.paid, 0);
  assert.equal(receipt.allocations[0].reversed, true);
});

it('US-M2-006 retains engagement-specific milestone revisions and rejects reversed dates atomically', () => {
  act(state, 'manager');
  const engagement = state.engagements[0];
  const dates = { cutoff: '2026-06-30', fieldwork: '2026-07-15', draft: '2026-08-10', final: '2026-09-15' };
  commands.saveMilestones(engagement.id, dates, 'Non-December reporting year.');
  const before = structuredClone(engagement.auditLifecycle!.milestones);
  assert.throws(() => commands.saveMilestones(engagement.id, { ...dates, final: '2026-06-01' }, 'Invalid reordered milestones.'), /order/);
  assert.deepEqual(engagement.auditLifecycle!.milestones, before);
  assert.equal(store.getSnapshot().engagements[0].auditLifecycle!.milestones![0].cutoff, '2026-06-30');
});

it('US-M4-004 and US-M4-006 reject Manager bundle authorization and release at the command boundary', async () => {
  act(state, 'manager');
  const engagement = state.engagements[0];
  await assert.rejects(commands.generateDeliverables(engagement.id, state.asOfDate), /requires partner/);
  assert.throws(() => commands.markDeliverablesDelivered(engagement.id, 'Manager cannot authorize external release.'), /requires partner/);
  assert.equal(engagement.auditLifecycle!.deliverables.length, 0);
});

it('US-M4-007 expires without running a simulation and closure is permanent with one system history entry', () => {
  const engagement = state.engagements[0], control = engagement.auditLifecycle!.archiveControl;
  Object.assign(control, { finalReportDate: '2026-07-01', freezeDueDate: '2026-08-30', freezeStatus: 'Counting Down' });
  assert.equal(closeExpiredArchives(state), true);
  assert.equal(control.freezeStatus, 'Frozen');
  state.asOfDate = '2026-07-01';
  assert.equal(closeExpiredArchives(state), false);
  assert.equal(control.history.filter(entry => entry.action === 'Automatic 60-day archive lock').length, 1);
  assert.throws(() => requireEngagementScope(state, engagement.id, 'administrative'), /frozen/);
  assert.throws(() => commands.reverseAdvance(engagement.id, state.receipts[0].id, 'Cannot alter an expired archive.'), /frozen/);
});

it('US-M5-004 phase actuals and variances reconcile to the engagement total without using internal cost', () => {
  const engagement = state.engagements[0];
  state.times = [
    { id: 'TIME-PLAN', person: 'Layla Rahman', clientId: engagement.client, engagementId: engagement.id, taskTitle: 'Planning risk assessment', activity: 'Audit planning', auditPhase: 'Planning', date: state.asOfDate, durationMinutes: 60, billingRatePerHour: 750, costRatePerHour: 1, billable: true, status: 'Approved' },
    { id: 'TIME-FIELD', person: 'Adam Khan', clientId: engagement.client, engagementId: engagement.id, taskTitle: 'Cash testing', activity: 'Audit fieldwork', auditPhase: 'Fieldwork', date: state.asOfDate, durationMinutes: 120, billingRatePerHour: 200, costRatePerHour: 1, billable: true, status: 'Submitted' }
  ];
  const metrics = practiceEconomics(state, engagement);
  assert.equal(metrics.phases.reduce((sum, phase) => sum + phase.actual, 0), metrics.actualHours);
  assert.equal(metrics.phases.reduce((sum, phase) => sum + phase.variance, 0), metrics.actualHours - metrics.budgetHours);
  assert.equal(metrics.wip, 1150);
  assert.equal(metrics.profit, engagement.agreedFee - 1150);
});
