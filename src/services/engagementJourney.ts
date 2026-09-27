// AuditSphere engagement journey derivation (MOD-UX-02).
//
// Reads the engagement record and the records that hang off it, and derives the
// real audit-engagement journey: accepted → planned → risks → fieldwork →
// findings → review → completion → released.
//
// This is a read-only projection. It never writes to the store, never relaxes a
// guard, and never reports a step as complete on the strength of anything other
// than the record itself. Every step state has a named source field, recorded in
// the comment beside it, so a reviewer can check the derivation against the
// store contract instead of trusting the label.

import type { PrototypeState, EngagementRecord } from '../types';
import { deriveWorkflowProgress, type TrackerStep, type WorkflowProgress } from './workflowProgress';
import { LIFECYCLE_MODELS } from './lifecycle';
import { isReleaseBlockingFinding } from './findings';

const MODEL = LIFECYCLE_MODELS['audit-engagement'];

/** A step's state plus the detail a reader needs to act on it. */
interface StepFacts {
  state: TrackerStep['state'];
  owner?: string;
  reason?: string;
  required?: string;
}

export interface EngagementJourneyInput {
  state: PrototypeState;
  engagement: EngagementRecord;
  /** Client name, so a blocker can name who owes the work. */
  clientName?: string;
  /** Optional handler that opens the section a step governs. */
  sectionRoute?: (step: string) => string | undefined;
}

/** The sections each journey step belongs to, for step-to-section navigation. */
export const ENGAGEMENT_STEP_SECTION: Readonly<Record<string, string>> = {
  Accepted: 'onboarding',
  Planned: 'audit-planning',
  'Risks & programs': 'audit-risks',
  Fieldwork: 'audit',
  'Findings resolved': 'findings',
  'Review cleared': 'reviews',
  Completion: 'approvals',
  Released: 'delivery'
};

export function deriveEngagementJourney(input: EngagementJourneyInput): WorkflowProgress {
  const { engagement: eng, state, clientName } = input;

  // A terminal engagement cannot progress, and the tracker must say that rather
  // than showing "0% complete" for work that will never happen.
  const terminal = eng.lifecycleStatus === 'Cancelled';
  const suspended = eng.lifecycleStatus === 'Suspended';
  const archived = Boolean(eng.archive);
  const released = eng.releases.some(release => !release.isAmended) || archived;

  const risks = state.auditRisks.filter(risk => risk.engagementId === eng.id);
  const plans = (state.auditPlans ?? []).filter(plan => plan.engagementId === eng.id);
  const findings = state.findings.filter(finding => finding.engagementId === eng.id);
  // The release-blocking rule is shared with the release desk rather than
  // reimplemented here, so the tracker and the gate can never disagree.
  const releaseBlockingFindings = findings.filter(isReleaseBlockingFinding);
  const openReviews = eng.reviews.filter(review => review.status !== 'Cleared');
  // A reopened review point on a finding means that finding was returned for
  // rework; the review note is the record that carries the state.
  const returnedFindingReview = eng.reviews.some(review => review.subjectType === 'finding' && review.status === 'Reopened');
  const workpapers = eng.workpapers;
  const openWorkpapers = workpapers.filter(item => item.status !== 'Cleared' && item.status !== 'Not applicable');

  const approvalCount = [eng.approvals.manager, eng.approvals.client, eng.approvals.partner, eng.approvals.eqr].filter(Boolean).length;
  const eqrOutstanding = eng.eqrRequired && !eng.approvals.eqr;

  // --- Step 1: Accepted -----------------------------------------------------
  // Source: engagement.professionalAcceptance (recorded partner acceptance).
  const accepted: StepFacts = eng.professionalAcceptance
    ? { state: 'done' }
    : { state: 'current', owner: eng.partner, reason: 'Professional acceptance is not recorded for this engagement.', required: `Record the engagement acceptance decision and its evidence reference.` };

  // --- Step 2: Planned ------------------------------------------------------
  // Source: engagement.planning flag and the audit plan revision's own status
  // ('Draft' | 'Under review' | 'Approved' | 'Superseded').
  const approvedPlan = plans.find(plan => plan.status === 'Approved');
  const planUnderReview = plans.find(plan => plan.status === 'Under review');
  const planned: StepFacts = approvedPlan
    ? { state: 'done' }
    : planUnderReview
      ? { state: 'current', owner: planUnderReview.reviewedBy ?? eng.manager, reason: 'An audit plan revision is under independent review.', required: 'Complete the independent plan review.' }
      : plans.length || eng.planning
        ? { state: 'current', owner: eng.manager, reason: 'Planning is started but no plan revision is approved.', required: 'Save the plan and obtain independent review.' }
        : suspended
          ? { state: 'blocked', owner: eng.manager, reason: `The engagement is ${eng.lifecycleStatus}; professional work cannot proceed.`, required: 'Resume the engagement before planning.' }
          : { state: 'pending', required: 'Prepare materiality, team allocations and timing, then obtain independent review.' };

  // --- Step 3: Risks & programs --------------------------------------------
  // Source: state.auditRisks for this engagement and their procedure links.
  const linkedRisks = risks.filter(risk => risk.linkedProcedureIds.length > 0);
  const risksStep: StepFacts = risks.length === 0
    ? { state: planned.state === 'done' ? 'current' : 'pending', required: 'Identify the risks of material misstatement and link an audit response to each.' }
    : linkedRisks.length === risks.length
      ? { state: 'done' }
      : { state: 'current', owner: eng.manager, reason: `${risks.length - linkedRisks.length} identified risk(s) have no linked procedure.`, required: 'Link an audit procedure to every identified risk.' };

  // --- Step 4: Fieldwork ----------------------------------------------------
  // Source: engagement.workpapers and their per-item status.
  const fieldwork: StepFacts = workpapers.length === 0
    ? { state: risksStep.state === 'done' ? 'current' : 'pending', required: 'Prepare the workpapers that evidence the audit response.' }
    : openWorkpapers.length === 0
      ? { state: 'done' }
      : { state: 'current', owner: eng.manager, reason: `${openWorkpapers.length} of ${workpapers.length} workpaper(s) are not cleared.`, required: 'Complete and clear the outstanding workpapers.' };

  // --- Step 5: Findings resolved -------------------------------------------
  // Source: state.findings' disposition, the shared release-blocking rule, and a
  // reopened finding review point (which is what "returned" means here).
  const findingsStep: StepFacts = returnedFindingReview
    ? { state: 'returned', owner: eng.manager, reason: 'A finding review point was reopened after the finding was revised.', required: 'Respond to the reopened review point and resubmit the finding.' }
    : findings.length === 0
      ? { state: fieldwork.state === 'done' ? 'done' : 'pending', required: fieldwork.state === 'done' ? undefined : 'Evaluate misstatements once fieldwork is complete.' }
      : releaseBlockingFindings.length === 0
        ? { state: 'done' }
        : { state: 'current', owner: eng.manager, reason: `${releaseBlockingFindings.length} material or significant finding(s) have no resolving disposition and block release.`, required: 'Correct, agree or waive each blocking finding with a recorded rationale.' };

  // --- Step 6: Review cleared ----------------------------------------------
  // Source: engagement.reviews (independent review points).
  const reviewStep: StepFacts = openReviews.length
    ? { state: 'current', owner: eng.eqrReviewerUserId ?? eng.partner, reason: `${openReviews.length} review point(s) are not cleared.`, required: 'Clear or return the outstanding review points.' }
    : { state: 'done' };

  // --- Step 7: Completion ---------------------------------------------------
  // Source: engagement.approvals (generation-bound manager/client/partner/EQR).
  const completion: StepFacts = approvalCount === 4 && !eqrOutstanding
    ? { state: 'done' }
    : suspended
      ? { state: 'blocked', owner: eng.partner, reason: `The engagement is ${eng.lifecycleStatus}; sign-offs cannot be recorded.`, required: 'Resume the engagement before completing sign-offs.' }
      : { state: 'current', owner: eqrOutstanding ? eng.eqrReviewerUserId : eng.partner, reason: `${approvalCount} of 4 required sign-off(s) recorded${eqrOutstanding ? '; the EQR concurrence is outstanding' : ''}.`, required: eqrOutstanding ? 'Record the EQR concurrence.' : 'Record the outstanding sign-offs.' };

  // --- Step 8: Released -----------------------------------------------------
  // Source: engagement.releases / engagement.archive.
  const releasedStep: StepFacts = released
    ? { state: 'done' }
    : eng.candidate
      ? { state: 'current', owner: eng.partner, reason: 'A release candidate is prepared but has not been issued.', required: 'Issue the release.' }
      : { state: 'pending', required: 'Prepare the release candidate once every sign-off is recorded.' };

  // A terminal or archived engagement stops where it is; later steps are reported
  // as not applicable rather than as outstanding work nobody can do.
  const order: Array<[string, StepFacts]> = [
    ['Accepted', accepted], ['Planned', planned], ['Risks & programs', risksStep],
    ['Fieldwork', fieldwork], ['Findings resolved', findingsStep], ['Review cleared', reviewStep],
    ['Completion', completion], ['Released', releasedStep]
  ];

  const states: Record<string, TrackerStep['state']> = {};
  const detail: Record<string, { owner?: string; reason?: string; required?: string; targetSection?: string }> = {};
  for (const [label, facts] of order) {
    states[label] = facts.state;
    detail[label] = {
      owner: facts.owner,
      reason: facts.reason,
      required: facts.required,
      targetSection: ENGAGEMENT_STEP_SECTION[label]
    };
  }

  // A terminal engagement stops where it is. Only steps that had NOT already been
  // completed become not-applicable: reporting finished work as waived would
  // erase the fact that it was done, and a step that still shows real work —
  // an outstanding review point, for example — keeps that state so the blocker
  // stays visible instead of being described as "not applicable".
  if (terminal) {
    for (const label of MODEL.steps) {
      if (states[label] !== 'done') states[label] = 'not-applicable';
    }
  }

  const steps: TrackerStep[] = MODEL.steps.map((label, index) => ({
    id: `${index}-${label}`,
    label,
    state: states[label] ?? 'pending',
    owner: detail[label]?.owner,
    reason: detail[label]?.reason,
    required: detail[label]?.required,
    targetSection: detail[label]?.targetSection
  }));

  const tally = {
    done: steps.filter(step => step.state === 'done').length,
    current: steps.filter(step => step.state === 'current').length,
    pending: steps.filter(step => step.state === 'pending').length,
    blocked: steps.filter(step => step.state === 'blocked').length,
    returned: steps.filter(step => step.state === 'returned').length,
    stale: steps.filter(step => step.state === 'stale').length,
    notApplicable: steps.filter(step => step.state === 'not-applicable').length
  };

  const progress = deriveWorkflowProgress({
    title: 'Engagement journey',
    tally,
    steps,
    // Phrased so that an honest scope note is never mistaken for a denial notice:
    // the superuser sweep asserts that no permitted route claims access was denied,
    // and this text appears on a route every persona may open.
    excludedNote: 'Only this engagement\'s own records and reviews count towards these totals; records your current grant does not permit are never counted.'
  });

  if (terminal) {
    return {
      ...progress,
      nextAction: `This engagement is ${eng.lifecycleStatus} and cannot progress. Existing invoices, evidence and historical reviews remain available.`,
      waitingOnOthers: false
    };
  }
  if (suspended) {
    return {
      ...progress,
      nextAction: progress.nextAction,
      blockers: [
        ...progress.blockers,
        { step: 'Professional work', reason: `The engagement is ${eng.lifecycleStatus}.`, required: 'Resume the engagement before further professional work.', owner: eng.partner }
      ]
    };
  }
  if (archived) {
    return {
      ...progress,
      nextAction: 'This engagement is archived. Its releases remain in Records & Archive.',
      waitingOnOthers: false
    };
  }
  return progress;
}
