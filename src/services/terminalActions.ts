// Consequence statements for destructive and terminal actions (spec: impact, reason
// requirement, related records, reversibility — never a bare "Are you sure?").
// The copy describes what the store command actually does; it does not change behaviour.

export interface ActionConsequence {
  title: string;
  impact: string;
  preserved: string;
  reversible: string;
}

export const ACTION_CONSEQUENCES = {
  'engagement-suspended': { title: 'Suspend engagement', impact: 'Pauses new professional work on this engagement.', preserved: 'Jobs, time, invoices, evidence and review history stay available.', reversible: 'Reversible: the engagement can be resumed.' },
  'engagement-cancelled': { title: 'Cancel engagement', impact: 'Stops all new professional work. The engagement becomes terminal.', preserved: 'Existing invoices, evidence, reviews and history remain available read-only.', reversible: 'Not reversible: a cancelled engagement cannot be reactivated.' },
  'engagement-closed': { title: 'Close engagement', impact: 'Marks the engagement complete. No further work can be recorded.', preserved: 'Releases, archive entries, invoices and history remain available read-only.', reversible: 'Not reversible: a closed engagement cannot be reopened.' },
  'engagement-active': { title: 'Resume engagement', impact: 'Allows professional work to continue.', preserved: 'The suspension and its reason stay in the lifecycle history.', reversible: 'Reversible: it can be suspended again.' },
  'job-cancelled': { title: 'Cancel job', impact: 'Stops the job; its open tasks can no longer progress.', preserved: 'Tasks, recorded time and linked document history are retained.', reversible: 'Not reversible: a cancelled job cannot be reopened.' },
  'job-blocked': { title: 'Block job', impact: 'Flags the job as unable to proceed; it appears in Blocked or stale queues.', preserved: 'All work and history are unchanged.', reversible: 'Reversible: set it back to In progress when resolved.' },
  'task-cancelled': { title: 'Cancel task', impact: 'Removes the task from open work and completion checks.', preserved: 'Its history, notes, time and document links are retained.', reversible: 'Reversible with a reason: a cancelled task can be reopened.' },
  'task-blocked': { title: 'Block task', impact: 'Flags the task as unable to proceed; it appears in Blocked or stale queues.', preserved: 'All work and history are unchanged.', reversible: 'Reversible: set it back to In progress when resolved.' },
  'task-reopened': { title: 'Reopen cancelled task', impact: 'Returns the task to open work.', preserved: 'The cancellation and its reason remain in history.', reversible: 'Reversible: it can be cancelled again with a reason.' },
  'template-retired': { title: 'Retire template', impact: 'The template can no longer create new jobs.', preserved: 'Jobs already created keep their pinned template revision.', reversible: 'Not reversible for this revision: create a new revision instead.' },
  'pbc-cancelled': { title: 'Cancel client request', impact: 'Withdraws the request from the client portal and open counts.', preserved: 'Uploaded files, the conversation and history are retained.', reversible: 'Not reversible: raise a new request if the item is needed again.' },
  'invoice-returned': { title: 'Return invoice draft', impact: 'Sends the draft back to the preparer; it cannot be issued until revised and re-reviewed.', preserved: 'The draft, its lines and earlier history are retained.', reversible: 'Not a terminal action: the preparer revises and resubmits.' },
  'credit-returned': { title: 'Return credit note', impact: 'Sends the credit note back for revision before it can be issued.', preserved: 'The credit note and its history are retained.', reversible: 'Not a terminal action: it is revised and reviewed again.' },
  'grant-revoked': { title: 'Revoke access grant', impact: 'The persona immediately loses this scope in the prototype.', preserved: 'The grant and its revocation stay in grant history.', reversible: 'Reversible: a new grant can be issued with evidence.' },
  'review-reassigned': { title: 'Reassign review point', impact: 'Moves responsibility for responding to the selected person.', preserved: 'The previous assignee and reason stay in assignment history.', reversible: 'Reversible: it can be reassigned again.' },
  'evidence-unlinked': { title: 'Remove evidence link', impact: 'The workpaper no longer relies on this document; a submitted or cleared workpaper returns to rework.', preserved: 'The link event and reason stay in evidence history.', reversible: 'Reversible: the document can be linked again.' },
  'workpaper-not-applicable': { title: 'Mark workpaper not applicable', impact: 'Excludes the workpaper from clearance gates.', preserved: 'Prior work and clearance history are retained.', reversible: 'Reversible: mark it applicable again.' },
  'fieldwork-returned': { title: 'Return fieldwork', impact: 'Returns the procedure to the preparer for rework.', preserved: 'The submission and its history are retained.', reversible: 'Not a terminal action: the preparer resubmits.' },
  'document-sharing': { title: 'Change client sharing', impact: 'Changes whether the client portal can see this document.', preserved: 'The sharing change and reason are recorded.', reversible: 'Reversible: sharing can be changed again with a reason.' },
  'document-unavailable': { title: 'Mark document unavailable', impact: 'Evidence and workpapers relying on it are flagged as broken links.', preserved: 'The reference, versions and history are retained.', reversible: 'Reversible: the reference can be restored.' }
} satisfies Record<string, ActionConsequence>;

export type ConsequenceKey = keyof typeof ACTION_CONSEQUENCES;

/** Prompt text: action, impact, what is preserved, reversibility, then the reason request. */
export function consequencePrompt(key: ConsequenceKey, subject: string, reasonLabel = 'Reason (required)'): string {
  const c = ACTION_CONSEQUENCES[key];
  return `${c.title}: ${subject}\n\nImpact: ${c.impact}\nKept: ${c.preserved}\n${c.reversible}\n\n${reasonLabel}:`;
}
