// AuditSphere workflow progress derivation (MOD-UX-02).
//
// Turns the state a module already holds into the answers every screen must give:
// what is complete, what is pending, what is blocked, what can be done next, and
// who acts next.
//
// Two rules shape this module:
//
//  1. **Derived, never hard-coded.** A caller supplies the per-step counts it
//     computed from real records. This module only aggregates them. It cannot
//     invent a step, and it cannot report progress for a record the caller did
//     not read.
//  2. **Out-of-scope work is invisible.** Callers pass counts from the records
//     their guard already permits. `excludedNote` exists so a module can say
//     "records outside your scope are not counted" without leaking a number.
//
// Nothing here reads or writes business state, so it cannot bypass a guard.

import type { LifecycleStepState } from './lifecycle';

/** Per-step accounting a module derives from its own records. */
export interface StepTally {
  /** Steps whose required work is finished. */
  done: number;
  /** Steps currently being worked, or waiting on the reader. */
  current: number;
  /** Steps that cannot start yet because a predecessor is unfinished. */
  pending: number;
  /**
   * Steps that cannot proceed at all. Each needs a `blockers` entry naming the
   * reason and the required action — a blocked step with no explanation is a bug,
   * not an empty state.
   */
  blocked: number;
  /** Steps or revisions sent back for rework. */
  returned?: number;
  /** Steps whose derived output no longer matches its source. */
  stale?: number;
  /** Steps genuinely not applicable to this record, with a recorded rationale. */
  notApplicable?: number;
  /** Steps deliberately skipped. */
  skipped?: number;
}

/** Why a step is blocked, and what would unblock it. */
export interface StepBlocker {
  /** The step this refers to, so the reader can find it. */
  step: string;
  /** The precise reason, naming the upstream record or revision where known. */
  reason: string;
  /** The required next action. */
  required: string;
  /** Who has to act, when the state names them. */
  owner?: string;
}

export interface TrackerStep {
  readonly id: string;
  readonly label: string;
  readonly state: LifecycleStepState;
  /** Who acts next on this step, when the state names them. */
  readonly owner?: string;
  /** Why a blocked step cannot proceed. */
  readonly reason?: string;
  /** What must happen for a blocked step to proceed. */
  readonly required?: string;
  /** Steps the reader can open directly, when the module can route to them. */
  readonly targetSection?: string;
}

export interface WorkflowProgress {
  readonly title: string;
  readonly steps: readonly TrackerStep[];
  /** Steps whose work is finished (includes not-applicable, which needs nothing). */
  readonly completed: number;
  readonly pending: number;
  readonly blocked: number;
  readonly returned: number;
  readonly stale: number;
  readonly notApplicable: number;
  readonly current: number;
  /** Steps that require action from someone. */
  readonly total: number;
  /** 0–100, rounded. `notApplicable` steps never count against the reader. */
  readonly percent: number;
  /** `Completed 6 / 10 · Pending 3 · Blocked 1` */
  readonly summary: string;
  /** The single next thing to do, derived from the step states. */
  readonly nextAction: string;
  /** Who acts next, when a step or blocker names an owner. */
  readonly nextOwner?: string;
  /** True when nothing further can be done without someone else. */
  readonly waitingOnOthers: boolean;
  readonly blockers: readonly StepBlocker[];
  /** One-line explanation shown while a module hides out-of-scope records. */
  readonly excludedNote?: string;
}

export interface WorkflowProgressInput {
  /** Row label, for example `Preparation → Approval`. */
  title: string;
  tally: StepTally;
  /** Ordered step list, each with the state the module derived for it. */
  steps: readonly TrackerStep[];
  blockers?: readonly StepBlocker[];
  /** Who acts next, when the module knows and no step carries it. */
  nextOwner?: string;
  excludedNote?: string;
}

/**
 * Count the tracker's answers from a module's per-step tally.
 *
 * Counting rules, and why:
 * - **completed** includes `notApplicable`: a step that is deliberately out of
 *   scope needs nothing further, so leaving it out would understate progress.
 * - **total** includes every budgeted step, including `notApplicable` and
 *   `skipped`. A step that belongs to the journey counts, whether it was done,
 *   waived or skipped, so the percentage measures the whole journey.
 * - A record whose every step is not-applicable reports 100%, not 0%.
 */
export function deriveWorkflowProgress(input: WorkflowProgressInput): WorkflowProgress {
  const { title, tally, steps } = input;
  const blocked = Math.max(0, tally.blocked);
  const returned = Math.max(0, tally.returned ?? 0);
  const stale = Math.max(0, tally.stale ?? 0);
  const notApplicable = Math.max(0, tally.notApplicable ?? 0);
  const skipped = Math.max(0, tally.skipped ?? 0);
  const current = Math.max(0, tally.current);
  const done = Math.max(0, tally.done);
  const pending = Math.max(0, tally.pending);
  const blockers = input.blockers ?? [];

  // Counting rules, and why:
  // - A `not-applicable` step is *budgeted* (it belongs to the journey) and
  //   *resolved* (it needs nothing further). It therefore sits in both the
  //   denominator and the numerator, so "Completed 5 / 6" reads correctly and a
  //   record that is entirely scoped out reports 100%, never 0%.
  // - A `skipped` step stays in the denominator only: skipping work must not
  //   silently raise the completion percentage.
  const completed = done + notApplicable;
  const total = done + current + pending + blocked + returned + stale + skipped + notApplicable;
  const percent = total === 0 ? 100 : Math.min(100, Math.max(0, Math.round((completed / total) * 100)));

  const counts = [`Completed ${completed} / ${total}`];
  // Report the states a reader must act on, and only when they are non-zero, so
  // the line stays readable instead of listing six zeroes.
  if (current) counts.push(`In progress ${current}`);
  if (pending) counts.push(`Pending ${pending}`);
  if (returned) counts.push(`Rework ${returned}`);
  if (stale) counts.push(`Stale ${stale}`);
  if (blocked) counts.push(`Blocked ${blocked}`);
  if (notApplicable) counts.push(`Not applicable ${notApplicable}`);

  const blockedSteps = steps.filter(step => step.state === 'blocked');
  const returnedSteps = steps.filter(step => step.state === 'returned');
  const staleSteps = steps.filter(step => step.state === 'stale');
  const currentSteps = steps.filter(step => step.state === 'current');
  const pendingSteps = steps.filter(step => step.state === 'pending');

  // A blocked step must always explain itself and say what would unblock it.
  // Steps that carry their own reason/required are used directly; anything else
  // is reported rather than silently dropped, because a blocked step the reader
  // cannot understand is worse than no tracker at all.
  const declared = blockers.length
    ? blockers
    : blockedSteps.map(step => ({
      step: step.label,
      reason: step.reason ?? 'A predecessor step is unfinished.',
      required: step.required ?? `Resolve the preceding step before "${step.label}" can proceed.`,
      owner: step.owner
    }));

  // The next action follows the real order of the journey: rework and staleness
  // outrank a blocker, because neither can be ignored, and a blocker outranks
  // ordinary work in progress.
  const firstOf = (list: readonly TrackerStep[]) => list[0];
  const nextStep = firstOf(returnedSteps) ?? firstOf(staleSteps) ?? firstOf(blockedSteps) ?? firstOf(currentSteps) ?? firstOf(pendingSteps);

  const nextAction = nextStep
    ? nextStep.state === 'returned'
      ? `Rework "${nextStep.label}" and resubmit it for review.`
      : nextStep.state === 'stale'
        ? `Recalculate "${nextStep.label}" from the current source, then re-review it.`
        : nextStep.state === 'blocked'
          ? nextStep.required ?? `Resolve the blocker on "${nextStep.label}".`
          : nextStep.state === 'current'
            ? `Continue "${nextStep.label}".`
            : `Start "${nextStep.label}".`
    : total === 0
      ? 'No workflow steps apply to this record.'
      : percent === 100
        ? 'All steps are complete.'
        : 'No step is actionable in your current scope.';

  const nextOwner = input.nextOwner
    ?? nextStep?.owner
    ?? firstOf(blockedSteps)?.owner;

  // "Waiting on others" means the reader has nothing actionable: every remaining
  // step is blocked, returned to someone else, or stale pending recalculation.
  const actionableRemaining = currentSteps.length + pendingSteps.length;
  const waitingOnOthers = actionableRemaining === 0
    && (blockedSteps.length + staleSteps.length + returnedSteps.length) > 0;

  return {
    title,
    steps,
    completed,
    pending,
    blocked,
    returned,
    stale,
    notApplicable,
    current,
    total,
    percent,
    summary: counts.join(' · '),
    nextAction,
    nextOwner,
    waitingOnOthers,
    blockers: declared,
    excludedNote: input.excludedNote
  };
}

/** Progress for a record whose journey is expressed as ordered step states. */
export function tallyFromSteps(states: readonly LifecycleStepState[]): StepTally {
  const count = (state: LifecycleStepState) => states.filter(item => item === state).length;
  return {
    done: count('done'),
    current: count('current'),
    pending: count('pending'),
    blocked: count('blocked'),
    returned: count('returned'),
    stale: count('stale'),
    notApplicable: count('not-applicable'),
    skipped: count('skipped')
  };
}

/**
 * Build tracker steps from a module's declared lifecycle model plus the states it
 * derived, so a module with a declared model cannot drift from it.
 *
 * `states` is keyed by step label rather than by index: a missing entry is
 * reported as `pending`, which is honest — the module has not shown that step is
 * complete — and a renamed model step cannot silently inherit another step's
 * state.
 */
export function stepsFromModel(
  modelSteps: readonly string[],
  states: Readonly<Record<string, LifecycleStepState>>,
  detail: Readonly<Record<string, { owner?: string; reason?: string; required?: string; targetSection?: string }>> = {}
): TrackerStep[] {
  return modelSteps.map((label, index) => {
    const extra = detail[label] ?? {};
    return {
      id: `${index}-${label}`,
      label,
      state: states[label] ?? 'pending',
      owner: extra.owner,
      reason: extra.reason,
      required: extra.required,
      targetSection: extra.targetSection
    };
  });
}
