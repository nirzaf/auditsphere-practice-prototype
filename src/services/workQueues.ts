// Role-oriented work queues: deterministic projections of existing state, scoped by the
// current persona's grants. No scheduler, automation or new state — every item is an
// existing record in a state that needs a person to act. Counts equal list lengths by
// construction (the dashboard renders the same arrays it counts).
import type { PrototypeState, RouteKey, EngagementRecord } from '../types';
import { hasAnyRole, isSamePerson, visibleEngagementIds } from './guards';
import { getPackageContextDisplay } from './calculations';

export type QueueId = 'my-tasks' | 'my-reviews' | 'returned' | 'waiting-client' | 'blocked' | 'ready-release';

export interface QueueItem {
  id: string;
  kind: string;
  label: string;
  engagementId: string;
  status: string;
  route: RouteKey;
  due?: string;
  /** Why the item is in this queue (who acted, what is required). */
  reason: string;
}

export interface WorkQueue {
  id: QueueId;
  title: string;
  description: string;
  tone: 'blue' | 'purple' | 'orange' | 'amber' | 'red' | 'green';
  items: QueueItem[];
}

const OPEN_WORK = (status: string) => !['Completed', 'Cancelled'].includes(status);

/** Engagements the persona may see, excluding archived ones (their work is read-only). */
function scopedEngagements(state: PrototypeState, engagementIds?: Set<string>): EngagementRecord[] {
  const visible = visibleEngagementIds(state);
  return state.engagements.filter(e => (visible === 'ALL' || visible.includes(e.id)) && (!engagementIds || engagementIds.has(e.id)));
}

/** Engagements whose visible workpapers and reviews are all cleared (same rule as the dashboard metric). */
export function readyForReleaseEngagements(engagements: EngagementRecord[]): EngagementRecord[] {
  return engagements.filter(e => !e.archive && e.workpapers.length > 0 && e.workpapers.every(w => w.status === 'Cleared') && e.reviews.every(r => r.status === 'Cleared'));
}

export function buildWorkQueues(state: PrototypeState, options: { engagementIds?: Set<string> } = {}): WorkQueue[] {
  const me = state.currentUserId;
  const myName = state.currentPerson;
  const mine = (identity?: string) => Boolean(identity) && (isSamePerson(state, identity!, me) || isSamePerson(state, identity!, myName));
  const engagements = scopedEngagements(state, options.engagementIds);
  const active = engagements.filter(e => !e.archive);
  const engagementSet = new Set(active.map(e => e.id));
  const canReviewTime = hasAnyRole(state, ['manager', 'reviewer', 'partner']);
  const canReviewBilling = hasAnyRole(state, ['billing', 'manager', 'partner']);
  const canReviewAccounting = hasAnyRole(state, ['manager', 'reviewer', 'partner']);
  const canReviewPlan = hasAnyRole(state, ['manager', 'partner']);
  const client = (e: EngagementRecord) => state.clients.find(c => c.id === e.client)?.name || e.client;

  const myTasks: QueueItem[] = [];
  const jobsById = new Map(state.jobs.filter(j => engagementSet.has(j.engagementId)).map(j => [j.id, j]));
  state.jobTasks.forEach(task => {
    const job = jobsById.get(task.jobId);
    if (!job || !OPEN_WORK(task.status) || task.status === 'Blocked' || !mine(task.assignee)) return;
    myTasks.push({ id: task.id, kind: 'Task', label: task.title, engagementId: job.engagementId, status: task.status, route: 'scheduling', due: task.dueDate, reason: `Assigned to you in ${job.title}` });
  });
  active.forEach(e => e.workpapers.filter(w => mine(w.preparer) && ['Planned', 'In progress'].includes(w.status)).forEach(w => myTasks.push({ id: w.id, kind: 'Workpaper', label: w.title, engagementId: e.id, status: w.status, route: 'reviews', reason: `You are the assigned preparer · ${client(e)}` })));

  const reviews: QueueItem[] = [];
  active.forEach(e => {
    e.workpapers.filter(w => w.status === 'Submitted' && mine(w.reviewer) && !mine(w.preparer)).forEach(w => reviews.push({ id: w.id, kind: 'Workpaper', label: w.title, engagementId: e.id, status: w.status, route: 'reviews', reason: `Submitted v${w.submittedVersion ?? w.version} by ${w.preparer}; you are the assigned reviewer` }));
    e.reviews.filter(r => r.status === 'Responded' && (mine(r.raisedBy) || mine(r.author))).forEach(r => reviews.push({ id: r.id, kind: 'Review point response', label: r.title, engagementId: e.id, status: r.status, route: 'reviews', due: r.due, reason: `${r.assigned} responded to your review point; clear or reopen it` }));
    if (canReviewAccounting) e.reconciliations.filter(rec => rec.status === 'In Review' && !mine(rec.preparedByUserId)).forEach(rec => reviews.push({ id: rec.id || rec.ref, kind: 'Reconciliation', label: rec.title || rec.name, engagementId: e.id, status: rec.status, route: 'trial-balance', reason: 'Awaiting independent review' }));
  });
  if (canReviewTime) state.times.filter(t => t.status === 'Submitted' && engagementSet.has(t.engagementId) && !mine(t.person)).forEach(t => reviews.push({ id: t.id, kind: 'Time entry', label: `${t.person} · ${t.taskTitle} (${t.durationMinutes} min)`, engagementId: t.engagementId, status: t.status, route: 'my-time', reason: 'Submitted time awaiting approval or return' }));
  if (canReviewBilling) state.invoices.filter(i => i.status === 'Draft' && !i.reviewNote && engagementSet.has(i.engagementId || i.eng || "") && !mine(i.preparedBy)).forEach(i => reviews.push({ id: i.id, kind: 'Invoice', label: `${i.invoiceNumber} · ${i.description}`, engagementId: i.engagementId || i.eng || "", status: i.status, route: 'billing', due: i.due, reason: `Prepared by ${i.preparedBy}; needs independent review before issue` }));
  if (canReviewAccounting) state.adjustmentJournals.filter(j => j.status === 'Draft' && engagementSet.has(j.engagementId) && !mine(j.preparedBy)).forEach(j => reviews.push({ id: j.id, kind: 'Adjustment journal', label: j.title, engagementId: j.engagementId, status: j.status, route: 'findings', reason: `Prepared by ${j.preparedBy}; awaiting technical review` }));
  if (canReviewPlan) (state.auditPlans || []).filter(p => p.status === 'Under review' && engagementSet.has(p.engagementId || "") && !mine(p.preparedByUserId || p.preparedBy)).forEach(p => reviews.push({ id: p.id, kind: 'Audit plan', label: `${p.id} · v${p.version}`, engagementId: p.engagementId || '', status: p.status, route: 'audit-planning', reason: 'Plan version awaiting approval' }));

  // Outstanding sign-offs owed by the assigned manager / partner / EQR for the current generation.
  // A projection only: recordApproval still enforces authority, independence and package currency.
  const activeEqr = state.users.find(user => user.role === 'eqr' && user.status === 'Active')?.id;
  active.filter(e => (e.lifecycleStatus || 'Active') === 'Active').forEach(e => {
    const owed: Array<[string, boolean]> = [
      ['Manager sign-off', state.currentRole === 'manager' && mine(e.manager) && e.approvals.manager?.generation !== e.generation],
      ['Partner sign-off', state.currentRole === 'partner' && mine(e.partner) && e.approvals.partner?.generation !== e.generation],
      ['EQR concurrence', state.currentRole === 'eqr' && e.eqrRequired && (e.eqrReviewerUserId || activeEqr) === me && e.approvals.eqr?.generation !== e.generation]
    ];
    owed.filter(([, due]) => due).forEach(([kind]) => reviews.push({ id: `${e.id}-${kind.split(' ')[0].toUpperCase()}`, kind, label: `${client(e)} · ${e.service}`, engagementId: e.id, status: 'Pending', route: 'reviews', due: e.due, reason: `Your ${kind.toLowerCase()} for generation ${e.generation} is outstanding` }));
  });

  const returned: QueueItem[] = [];
  state.times.filter(t => t.status === 'Returned' && engagementSet.has(t.engagementId) && mine(t.person)).forEach(t => returned.push({ id: t.id, kind: 'Time entry', label: `${t.taskTitle} (${t.durationMinutes} min)`, engagementId: t.engagementId, status: t.status, route: 'my-time', reason: `Returned by ${t.reviewedBy || 'reviewer'}: ${t.returnReason || 'no reason recorded'}` }));
  state.invoices.filter(i => i.status === 'Draft' && i.reviewNote && engagementSet.has(i.engagementId || i.eng || "") && mine(i.preparedBy)).forEach(i => returned.push({ id: i.id, kind: 'Invoice', label: i.invoiceNumber, engagementId: i.engagementId || i.eng || "", status: 'Returned', route: 'billing', due: i.due, reason: `Returned for changes: ${i.reviewNote}` }));
  active.forEach(e => {
    e.workpapers.filter(w => w.status === 'Changes required' && mine(w.preparer)).forEach(w => returned.push({ id: w.id, kind: 'Workpaper', label: w.title, engagementId: e.id, status: w.status, route: 'reviews', reason: 'Evidence or document changed after submission; rework and resubmit' }));
    e.reviews.filter(r => ['Open', 'Reopened'].includes(r.status) && (mine(r.assignedUserId) || mine(r.assigned) || mine(r.assignee))).forEach(r => returned.push({ id: r.id, kind: 'Review point', label: r.title, engagementId: e.id, status: r.status, route: 'reviews', due: r.due, reason: `Raised by ${r.raisedBy}; your response is required` }));
    e.reconciliations.filter(rec => rec.status === 'Returned' && mine(rec.preparedByUserId)).forEach(rec => returned.push({ id: rec.id || rec.ref, kind: 'Reconciliation', label: rec.title || rec.name, engagementId: e.id, status: rec.status, route: 'trial-balance', reason: `Returned: ${rec.reviewNote || 'see review note'}` }));
  });

  const waiting: QueueItem[] = [];
  active.forEach(e => {
    e.pbc.filter(p => ['Requested', 'Needs clarification'].includes(p.status)).forEach(p => waiting.push({ id: p.id, kind: 'Client request', label: p.title, engagementId: e.id, status: p.status, route: 'documents', due: p.due, reason: p.status === 'Needs clarification' ? `Clarification requested: ${p.clarificationNote || 'see thread'}` : `Awaiting upload from ${client(e)}` }));
    if (e.managementPresentation && !e.managementPackageDecision) waiting.push({ id: `${e.id}-MGMT`, kind: 'Management package', label: `Package Rev ${e.managementPresentation.packageRevision}`, engagementId: e.id, status: 'Presented', route: 'reviews', reason: 'Presented to client management; decision not yet recorded' });
  });
  state.proposals.filter(p => p.state === 'Presented' && (!p.clientId || state.clients.some(c => c.id === p.clientId && active.some(e => e.client === c.id)))).forEach(p => waiting.push({ id: p.id, kind: 'Proposal', label: p.title, engagementId: active.find(e => e.client === p.clientId)?.id || '', status: p.state, route: 'proposals', reason: `Rev ${p.revision} presented; client response not yet recorded` }));

  const blocked: QueueItem[] = [];
  state.jobTasks.forEach(task => {
    const job = jobsById.get(task.jobId);
    if (job && task.status === 'Blocked') blocked.push({ id: task.id, kind: 'Task', label: task.title, engagementId: job.engagementId, status: task.status, route: 'scheduling', due: task.dueDate, reason: task.blockedReason || task.statusChangeReason || 'Blocked — reason in task history' });
  });
  active.forEach(e => {
    e.reconciliations.filter(rec => rec.status === 'Stale').forEach(rec => blocked.push({ id: rec.id || rec.ref, kind: 'Reconciliation', label: rec.title || rec.name, engagementId: e.id, status: rec.status, route: 'trial-balance', reason: `Source TB changed to v${e.sourceVersion}; prior review preserved, re-review required` }));
    const pkg = getPackageContextDisplay(e);
    if (pkg.status === 'Stale / blocked') blocked.push({ id: `${e.id}-PKG`, kind: 'Financial package', label: `Package ${pkg.revision}`, engagementId: e.id, status: 'Stale', route: 'delivery', reason: 'Package is not current for the latest source/generation or its validation is blocked; assemble a new revision' });
    const latestStatement = [...(state.statementSetRevisions || []).filter(s => s.engagementId === e.id)].sort((a, b) => b.revision - a.revision)[0];
    if (latestStatement?.status === 'Stale') blocked.push({ id: latestStatement.id, kind: 'Statement set', label: `Statement set v${latestStatement.revision}`, engagementId: e.id, status: 'Stale', route: 'financial-statements', reason: 'An upstream source, mapping or layout changed; regenerate and re-review' });
  });

  const ready: QueueItem[] = readyForReleaseEngagements(active).map(e => ({ id: e.id, kind: 'Engagement', label: `${client(e)} · ${e.service}`, engagementId: e.id, status: e.stage, route: 'delivery', due: e.due, reason: 'All visible workpapers and review points cleared; confirm release gates' }));

  const byDue = (a: QueueItem, b: QueueItem) => (a.due || '9999').localeCompare(b.due || '9999') || a.id.localeCompare(b.id);
  return [
    { id: 'my-tasks', title: 'My work', description: 'Open tasks and workpapers assigned to you', tone: 'blue', items: myTasks.sort(byDue) },
    { id: 'my-reviews', title: 'Waiting for my review', description: 'Submitted work where you are an eligible independent reviewer', tone: 'purple', items: reviews.sort(byDue) },
    { id: 'returned', title: 'Returned to me', description: 'Rework and review points that need your response', tone: 'orange', items: returned.sort(byDue) },
    { id: 'waiting-client', title: 'Waiting on client', description: 'Requests, proposals and packages pending a client action', tone: 'amber', items: waiting.sort(byDue) },
    { id: 'blocked', title: 'Blocked or stale', description: 'Work that cannot proceed until a dependency is resolved', tone: 'red', items: blocked.sort(byDue) },
    { id: 'ready-release', title: 'Ready for release', description: 'Engagements whose visible work is cleared', tone: 'green', items: ready.sort(byDue) }
  ];
}
