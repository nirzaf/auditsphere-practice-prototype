// AuditSphere financial-package journey derivation (MOD-UX-02).
//
// The package lifecycle is the accounting journey's last mile:
// calculated → validated → management acknowledged → accounting reviewed →
// partner review → released.
//
// Read-only projection. Every step cites the record field it reads, so the
// tracker can be checked against the store contract rather than trusted.

import type { PrototypeState, EngagementRecord, FinancialPackageRevision } from '../types';
import { deriveWorkflowProgress, type TrackerStep, type WorkflowProgress } from './workflowProgress';
import { LIFECYCLE_MODELS } from './lifecycle';
import { getPackageContextDisplay } from './calculations';

const MODEL = LIFECYCLE_MODELS['financial-package'];

/** Where each package step's work happens, so a step can open its section. */
export const PACKAGE_STEP_SECTION: Readonly<Record<string, string>> = {
  Calculated: 'financial-packages',
  Validated: 'financial-packages',
  'Management approved': 'financial-packages',
  'Accounting reviewed': 'approvals',
  'Partner review': 'approvals',
  Released: 'delivery'
};

interface StepFacts {
  state: TrackerStep['state'];
  owner?: string;
  reason?: string;
  required?: string;
}

export interface PackageJourneyInput {
  state: PrototypeState;
  engagement: EngagementRecord;
  /** The revision under review; defaults to the engagement's current revision. */
  revision?: FinancialPackageRevision | undefined;
}

export function derivePackageJourney({ state, engagement: eng, revision }: PackageJourneyInput): WorkflowProgress {
  const history = eng.packageHistory ?? [];
  // Fall back to the newest saved revision so a stale package still reports the
  // journey it actually reached, instead of pretending nothing was assembled.
  const pkg = revision
    ?? history.find(item => item.revision === eng.packageRevision)
    ?? [...history].sort((left, right) => right.revision - left.revision)[0];

  const display = getPackageContextDisplay(eng);
  const released = eng.releases.some(release => !release.isAmended) || Boolean(eng.archive);

  // --- Step 1: Calculated ---------------------------------------------------
  const calculated: StepFacts = pkg
    ? { state: 'done' }
    : { state: 'pending', required: 'Assemble a package revision from the current trial balance and mapping.' };

  // --- Step 2: Validated ----------------------------------------------------
  // Source: revision.validation.passed and the source lineage it was built from.
  const latestMappingRevision = (state.accountMappingRevisions ?? [])
    .filter(item => item.engagementId === eng.id)
    .sort((a, b) => b.revision - a.revision)[0]?.revision;
  const sourceCurrent = Boolean(pkg && pkg.sourceVersion === eng.sourceVersion && pkg.mappingRevision === latestMappingRevision);
  // A revision belongs to the engagement generation it was assembled for. Once
  // the generation advances (a profile, scope or lifecycle change), no later step
  // of that revision can still count — including its recorded sign-offs.
  const generationCurrent = Boolean(pkg && pkg.generation === eng.generation);
  const lineageCurrent = sourceCurrent && generationCurrent;
  const validated: StepFacts = !pkg
    ? { state: 'pending', required: 'Validation runs when a revision is assembled.' }
    : pkg.validation.passed && lineageCurrent
      ? { state: 'done' }
      : !lineageCurrent
        ? {
          state: 'stale',
          owner: eng.manager,
          reason: sourceCurrent
            ? `Revision ${pkg.revision} was assembled for engagement generation ${pkg.generation}; the engagement is now at generation ${eng.generation}.`
            : `Revision ${pkg.revision} was built from source v${pkg.sourceVersion} / mapping v${pkg.mappingRevision}; the engagement is now at source v${eng.sourceVersion}.`,
          required: 'Assemble a new revision from the current source and re-validate it.'
        }
        : {
          state: 'blocked',
          owner: eng.manager,
          reason: `Validation failed: ${pkg.validation.pendingWorkpapers} workpaper(s) pending, ${pkg.validation.openReviews} open review(s), ${pkg.validation.materialFindings} material finding(s).`,
          required: 'Clear the outstanding workpapers, reviews and findings, then validate again.'
        };

  // --- Step 3: Management acknowledged --------------------------------------
  // Source: engagement.managementPackageDecision, bound to the exact revision.
  const managementDecision = eng.managementPackageDecision;
  const managementCurrent = Boolean(managementDecision
    && pkg
    && lineageCurrent
    && managementDecision.generation === pkg.generation
    && managementDecision.sourceVersion === pkg.sourceVersion
    && managementDecision.packageRevision === pkg.revision);
  const management: StepFacts = managementCurrent && managementDecision?.decision === 'Acknowledged'
    ? { state: 'done' }
    : managementCurrent && managementDecision?.decision === 'Rejected'
      ? { state: 'returned', owner: eng.manager, reason: `Management rejected revision ${pkg?.revision} with a recorded rationale.`, required: 'Address the rationale, assemble the replacement revision, and re-present it.' }
      : !pkg || lineageCurrent
        ? { state: 'current', owner: eng.partner, reason: 'Management has not acknowledged this revision yet.', required: 'Present the package to management and record their decision.' }
        : { state: 'pending', required: 'Assemble and validate a current revision before presenting it to management.' };

  // --- Step 4: Accounting reviewed ------------------------------------------
  // Source: engagement.approvals.manager, bound to the same revision.
  const managerApproval = eng.approvals.manager;
  const accountingReviewed: StepFacts = managerApproval && pkg && lineageCurrent && managerApproval.generation === pkg.generation
    ? { state: 'done' }
    : !pkg || lineageCurrent
      ? { state: 'current', owner: eng.manager, reason: 'The accounting review sign-off is not recorded for this revision.', required: 'Record the accounting review sign-off.' }
      : { state: 'pending', required: 'A current validated revision must exist before the accounting review can be recorded.' };

  // --- Step 5: Partner review ----------------------------------------------
  // Source: engagement.approvals.partner, bound to the same revision, plus the
  // EQR concurrence when the engagement requires one.
  const partnerApproval = eng.approvals.partner;
  const eqrOutstanding = eng.eqrRequired && !eng.approvals.eqr;
  const partnerReview: StepFacts = partnerApproval && pkg && lineageCurrent && partnerApproval.generation === pkg.generation && !eqrOutstanding
    ? { state: 'done' }
    : !pkg || lineageCurrent
      ? {
        state: 'current',
        owner: eqrOutstanding ? eng.eqrReviewerUserId : eng.partner,
        reason: eqrOutstanding
          ? 'The engagement requires an EQR concurrence that is not recorded.'
          : 'Partner approval is not recorded for this revision.',
        required: eqrOutstanding ? 'Record the EQR concurrence.' : 'Record the partner approval.'
      }
      : { state: 'pending', required: 'A current validated revision must exist before partner review can be recorded.' };

  // --- Step 6: Released ----------------------------------------------------
  // Source: engagement.releases / engagement.archive.
  const releasedStep: StepFacts = released
    ? { state: 'done' }
    : eng.candidate
      ? { state: 'current', owner: eng.partner, reason: 'A release candidate is prepared but has not been issued.', required: 'Issue the release from the release desk.' }
      : { state: 'pending', required: 'Prepare the release candidate once every sign-off is recorded.' };

  const order: Array<[string, StepFacts]> = [
    ['Calculated', calculated], ['Validated', validated], ['Management approved', management],
    ['Accounting reviewed', accountingReviewed], ['Partner review', partnerReview], ['Released', releasedStep]
  ];

  const steps: TrackerStep[] = MODEL.steps.map((label, index) => {
    const facts = order.find(([name]) => name === label)?.[1] ?? { state: 'pending' as const };
    return {
      id: `${index}-${label}`,
      label,
      state: facts.state,
      owner: facts.owner,
      reason: facts.reason,
      required: facts.required,
      targetSection: PACKAGE_STEP_SECTION[label]
    };
  });

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
    title: 'Package journey',
    tally,
    steps,
    excludedNote: display.revision
      ? `Only revision ${display.revision} and its own approvals are counted; records outside your access scope are never included.`
      : 'No package revision is saved for this engagement yet.'
  });

  if (released) {
    return {
      ...progress,
      nextAction: 'This package has been released. Its release and archive lineage remain available.',
      waitingOnOthers: false
    };
  }
  return progress;
}
