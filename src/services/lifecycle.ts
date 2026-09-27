// AuditSphere shared lifecycle & status semantics (MOD-UX-01).
//
// One presentation vocabulary for every module. This module is deliberately
// pure: it maps the *existing* record vocabularies already stored in
// prototypeStore onto a small set of visual tones, and derives read-only
// lifecycle projections from state that is already persisted.
//
// It never invents a transition, never changes a record, and never relaxes a
// guard. Every lifecycle step it reports is derived from a field the store
// already owns, so a step can only show as complete when the underlying
// business state really says so.

/** Visual tone a status maps to. Colour is never the only signal: the badge
 *  always renders the literal status text plus an accessible description. */
export type StatusTone =
  | 'neutral'   // nothing has started, or the value is purely informational
  | 'progress'  // work is actively happening
  | 'waiting'   // blocked on someone or something else (not an error)
  | 'review'    // in an independent review / approval queue
  | 'returned'  // sent back for rework
  | 'blocked'   // cannot proceed until a predecessor is resolved
  | 'stale'     // derived output no longer matches its source revision
  | 'approved'  // a human decision has been recorded
  | 'complete'  // terminal good outcome
  | 'terminal-bad' // terminal outcome that ends the journey without delivery
  | 'simulated'; // prototype simulation surface, never a live integration

export interface StatusSemantic {
  /** The literal status string as stored. */
  readonly label: string;
  /** The shared visual tone. */
  readonly tone: StatusTone;
  /** Short plain-language explanation of what the state means for the reader. */
  readonly meaning: string;
  /** Whether the journey has reached an end state and can only be reopened or amended. */
  readonly terminal: boolean;
  /** Whether the record still needs a human to act on it. */
  readonly actionable: boolean;
}

/** Canonical meaning text per tone, used when a status has no bespoke wording. */
export const TONE_MEANING: Record<StatusTone, string> = {
  neutral: 'Not started yet, or informational only.',
  progress: 'Work is in progress and owned by someone.',
  waiting: 'Waiting on another party before work can continue.',
  review: 'Awaiting an independent review or approval decision.',
  returned: 'Returned for rework; a revised revision is required.',
  blocked: 'Cannot proceed until the named blocker is resolved.',
  stale: 'The underlying source changed after this output was produced.',
  approved: 'A human decision has been recorded for this revision.',
  complete: 'This record reached its good terminal state.',
  'terminal-bad': 'This journey ended here; it cannot continue from this state.',
  simulated: 'Prototype simulation only. No live external system is involved.'
};

interface ToneFacts {
  terminal?: boolean;
  actionable?: boolean;
  meaning?: string;
}

function key(status: string): string {
  return status.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

// Statuses whose visual tone differs from their obvious family. Everything else
// is derived from the prefix/suffix rules in `statusSemantics` below.
const TONE_OVERRIDES: Record<string, ToneFacts & { tone: StatusTone }> = {
  // Waiting on the client or another team, not an error and not our own work.
  'requested': { tone: 'waiting', meaning: 'Requested from the client; the response has not arrived yet.' },
  'needs clarification': { tone: 'waiting', meaning: 'Clarification was asked of the client and is outstanding.' },
  'waiting on client': { tone: 'waiting' },
  'not configured': { tone: 'neutral', meaning: 'No simulated configuration has been saved yet.' },
  'disconnected': { tone: 'neutral', meaning: 'Simulated connection is not established. Nothing is live.' },
  'simulated verified': { tone: 'simulated', meaning: 'Prototype verification only; no external provider was contacted.' },
  'simulated error': { tone: 'simulated', meaning: 'Simulated failure path. Nothing external was attempted.' },
  'simulated accepted': { tone: 'simulated', meaning: 'Simulated delivery accepted locally. No external email was sent.' },
  'simulated failed': { tone: 'simulated', meaning: 'Simulated delivery failed locally. No external email was attempted.' },
  'outcome unknown': { tone: 'waiting', meaning: 'The simulated outcome was never resolved.' },
  'recorded manually': { tone: 'neutral', meaning: 'Logged by hand; no system interaction took place.' },
  'partially reflected': { tone: 'waiting', meaning: 'Only part of this revision is reflected in the current trial balance.' },
  'not reflected': { tone: 'waiting', meaning: 'Accepted, but not yet reflected in the current trial balance.' },
  'unknown': { tone: 'neutral', meaning: 'The linkage cannot be proven from the current source.' },
  'pending verification': { tone: 'waiting', meaning: 'Recorded, but not yet independently verified.' },
  'differences noted': { tone: 'returned', meaning: 'A difference was recorded and needs resolution.' },
  'exception noted': { tone: 'returned', meaning: 'An exception was recorded and needs resolution.' },
  'exceptions noted': { tone: 'returned', meaning: 'Exceptions were recorded and need resolution.' },
  'changes required': { tone: 'returned', meaning: 'The reviewer requires changes before this can clear.' },
  'not applicable': { tone: 'complete', terminal: true, actionable: false, meaning: 'Deliberately scoped out with a recorded rationale.' },
  'under review': { tone: 'review' },
  'pending review': { tone: 'review' },
  'in review': { tone: 'review' },
  'technical review': { tone: 'review', meaning: 'In independent technical review.' },
  'management accepted': { tone: 'progress', meaning: 'Management accepted this item; reporting inclusion is still to be decided.' },
  'reporting included': { tone: 'approved', meaning: 'Approved for reporting inclusion in the current source.' },
  'pending': { tone: 'waiting' },
  'ready': { tone: 'progress', meaning: 'Ready for the next step in its journey.' },
  'open': { tone: 'progress' },
  'expired': { tone: 'terminal-bad', terminal: true, actionable: false, meaning: 'The window closed before this was used.' },
  'revoked': { tone: 'terminal-bad', terminal: true, actionable: false, meaning: 'Access was withdrawn; the record is retained as history.' },
  'declined': { tone: 'terminal-bad', terminal: true, actionable: false, meaning: 'The client declined. The record is retained as history.' },
  'lost': { tone: 'terminal-bad', terminal: true, actionable: false, meaning: 'The opportunity was lost. History is retained.' },
  'unqualified': { tone: 'terminal-bad', terminal: true, actionable: false, meaning: 'Screened out before acceptance. History is retained.' },
  'blocked': { tone: 'blocked', meaning: 'A named predecessor must be resolved before work continues.' },
  'stale': { tone: 'stale', meaning: 'The source changed after this output was produced; it must be re-derived.' },
  'due soon': { tone: 'waiting', meaning: 'Approaching its due date while still open.' },
  'overdue': { tone: 'blocked', meaning: 'Past its due date while still open.' }
};

/**
 * Map any status string used by the prototype onto the shared vocabulary.
 * Unknown values degrade to `neutral` with the literal text preserved, so a new
 * status can never render invisibly or crash a view.
 */
export function statusSemantics(status: string | undefined | null): StatusSemantic {
  const label = (status ?? '').toString().trim();
  if (!label) {
    return { label: 'Not set', tone: 'neutral', meaning: 'No status has been recorded.', terminal: false, actionable: false };
  }
  const k = key(label);
  const override = TONE_OVERRIDES[k];
  if (override) {
    return {
      label,
      tone: override.tone,
      meaning: override.meaning ?? TONE_MEANING[override.tone],
      terminal: override.terminal ?? false,
      actionable: override.actionable ?? !(override.terminal ?? false)
    };
  }
  // Terminal families expressed as past participles.
  if (['approved', 'cleared', 'accepted', 'won', 'adequate', 'reflected in tb', 'issued', 'paid'].includes(k)) {
    return { label, tone: k === 'approved' || k === 'cleared' || k === 'accepted' || k === 'adequate' ? 'approved' : 'complete', meaning: TONE_MEANING[k === 'approved' || k === 'cleared' || k === 'accepted' || k === 'adequate' ? 'approved' : 'complete'], terminal: false, actionable: false };
  }
  if (['completed', 'closed', 'archived', 'retired', 'published', 'superseded', 'cancelled', 'rejected', 'withdrawn'].includes(k)) {
    const bad = ['cancelled', 'rejected', 'withdrawn'].includes(k);
    return { label, tone: bad ? 'terminal-bad' : 'complete', meaning: TONE_MEANING[bad ? 'terminal-bad' : 'complete'], terminal: true, actionable: false };
  }
  if (['reviewed', 'in review', 'technical review'].includes(k)) {
    return { label, tone: 'review', meaning: TONE_MEANING.review, terminal: false, actionable: true };
  }
  if (['returned', 'reopened', 'blocking', 'not cleared'].includes(k)) {
    return { label, tone: 'returned', meaning: TONE_MEANING.returned, terminal: false, actionable: true };
  }
  if (['draft', 'not started', 'planned', 'prospect', 'scheduled', 'inactive', 'disabled', 'pending'].includes(k)) {
    return { label, tone: 'neutral', meaning: TONE_MEANING.neutral, terminal: false, actionable: true };
  }
  if (['in progress', 'active', 'submitted', 'received', 'responded', 'reflected', 'ready', 'open', 'sent', 'current'].includes(k)) {
    return { label, tone: 'progress', meaning: TONE_MEANING.progress, terminal: false, actionable: true };
  }
  return { label, tone: 'neutral', meaning: TONE_MEANING.neutral, terminal: false, actionable: true };
}

/** `true` when the status means the record still needs a human to act. */
export function isActionableStatus(status: string | undefined | null): boolean {
  return statusSemantics(status).actionable;
}

/** `true` when the status is an end state for its journey. */
export function isTerminalStatus(status: string | undefined | null): boolean {
  return statusSemantics(status).terminal;
}

// ---------------------------------------------------------------------------
// Lifecycle models
// ---------------------------------------------------------------------------

export type LifecycleStepState = 'done' | 'current' | 'blocked' | 'returned' | 'stale' | 'pending' | 'skipped' | 'not-applicable';

export interface LifecycleStep {
  readonly id: string;
  readonly label: string;
  readonly state: LifecycleStepState;
  /** Who or what the step is waiting on, when it is not done. */
  readonly owner?: string;
  /** Why the step cannot proceed. Shown for `blocked` steps. */
  readonly reason?: string;
  /** What must happen before a blocked, returned or stale step can proceed. */
  readonly required?: string;
}

export type LifecycleModelId =
  | 'record-approval'
  | 'request-response'
  | 'source-revision'
  | 'financial-package'
  | 'consolidation-run'
  | 'audit-engagement'
  | 'matter-register';

export interface LifecycleModel {
  readonly id: LifecycleModelId;
  readonly title: string;
  readonly steps: readonly string[];
}

/**
 * The lifecycle models actually supported by the prototype. A module picks the
 * model matching its domain; unrelated modules are never forced into one
 * universal state machine.
 */
export const LIFECYCLE_MODELS: Record<LifecycleModelId, LifecycleModel> = {
  'record-approval': {
    id: 'record-approval',
    title: 'Prepare → submit → independent review → approve',
    steps: ['Draft', 'Submitted', 'In review', 'Approved', 'Effective']
  },
  'request-response': {
    id: 'request-response',
    title: 'Request → client response → staff review → accept',
    steps: ['Requested', 'Received', 'Under review', 'Accepted']
  },
  'source-revision': {
    id: 'source-revision',
    title: 'Import → validate → map → derive → review',
    steps: ['Imported', 'Validated', 'Mapped', 'Derived', 'Reviewed']
  },
  'financial-package': {
    id: 'financial-package',
    title: 'Calculate → validate → management → accounting review → partner → release',
    steps: ['Calculated', 'Validated', 'Management approved', 'Accounting reviewed', 'Partner review', 'Released']
  },
  'consolidation-run': {
    id: 'consolidation-run',
    title: 'Perimeter → components → FX → eliminations → run → review',
    steps: ['Perimeter', 'Components pinned', 'FX applied', 'Eliminations', 'Run complete', 'Reviewed']
  },
  'audit-engagement': {
    id: 'audit-engagement',
    title: 'Accept → plan → risk → fieldwork → findings → review → complete → release',
    steps: ['Accepted', 'Planned', 'Risks & programs', 'Fieldwork', 'Findings resolved', 'Review cleared', 'Completion', 'Released']
  },
  'matter-register': {
    id: 'matter-register',
    title: 'Register journey state',
    steps: ['Open', 'In progress', 'Closed']
  }
};

/** The lifecycle model each routed module reports. */
export const MODULE_LIFECYCLE_MODEL: Record<string, LifecycleModelId> = {
  overview: 'matter-register',
  clients: 'matter-register',
  'client-detail': 'request-response',
  acquisition: 'matter-register',
  proposals: 'record-approval',
  engagements: 'audit-engagement',
  onboarding: 'record-approval',
  jobs: 'record-approval',
  'job-templates': 'record-approval',
  documents: 'request-response',
  communications: 'matter-register',
  'my-time': 'record-approval',
  budgets: 'record-approval',
  billing: 'record-approval',
  receivables: 'record-approval',
  'accounting-setup': 'source-revision',
  'trial-balance': 'source-revision',
  'gl-transactions': 'source-revision',
  'account-mappings': 'source-revision',
  adjustments: 'record-approval',
  reconciliations: 'record-approval',
  'financial-statements': 'source-revision',
  'financial-packages': 'financial-package',
  consolidation: 'consolidation-run',
  'audit-planning': 'record-approval',
  'audit-risks': 'record-approval',
  'audit-fieldwork': 'record-approval',
  sampling: 'record-approval',
  audit: 'record-approval',
  evidence: 'record-approval',
  findings: 'record-approval',
  reviews: 'record-approval',
  approvals: 'record-approval',
  quality: 'record-approval',
  delivery: 'financial-package',
  records: 'matter-register',
  portal: 'request-response',
  reports: 'matter-register',
  administration: 'matter-register',
  'm365-setup': 'matter-register',
  requirements: 'matter-register',
  'module-guide': 'matter-register',
  services: 'matter-register',
  'role-guide': 'matter-register'
};

export function lifecycleModelFor(route: string): LifecycleModel {
  return LIFECYCLE_MODELS[MODULE_LIFECYCLE_MODEL[route] ?? 'matter-register'];
}

/** Short sentence a module can print so the reader knows how the journey works. */
export function lifecycleHint(route: string): string {
  return lifecycleModelFor(route).title;
}

// ---------------------------------------------------------------------------
// Blocker descriptions
// ---------------------------------------------------------------------------

export interface BlockerNotice {
  readonly title: string;
  readonly why: string;
  readonly affected: readonly string[];
  readonly required: string;
  readonly tone: 'blocked' | 'stale' | 'waiting';
}

export interface PackageContextInput {
  revision?: number | null;
  status?: string | null;
  /** True when the package was derived from a superseded source revision. */
  stale?: boolean;
  /** Human-readable label of the source the package was built from. */
  sourceLabel?: string;
  /** Human-readable label of the source that is current now. */
  currentSourceLabel?: string;
}

/**
 * Describe *why* a derived output cannot be used right now. Modules call this
 * instead of printing a bare "Error" / "Cannot continue", so the reader always
 * gets the precise reason and the required next action.
 */
export function describePackageBlocker(context: PackageContextInput): BlockerNotice | null {
  const status = (context.status ?? '').toString().trim();
  if (context.stale || status === 'Stale') {
    return {
      title: 'Stale — recalculate required',
      why: context.currentSourceLabel && context.sourceLabel
        ? `The source changed after this output was produced: ${context.sourceLabel} → ${context.currentSourceLabel}.`
        : 'The source trial balance changed after this output was produced.',
      affected: ['Mapping review', 'Statement derivation', 'Package approval'],
      required: 'Recalculate the output from the current source, then re-review the new revision.',
      tone: 'stale'
    };
  }
  if (status === 'Returned') {
    return {
      title: 'Returned for rework',
      why: 'A reviewer or approver returned this revision with a recorded reason.',
      affected: ['The returned revision', 'Any approval that depended on it'],
      required: 'Resolve the recorded comments, then resubmit a new revision for independent review.',
      tone: 'waiting'
    };
  }
  if (['Rejected', 'Cancelled'].includes(status)) {
    return {
      title: `${status} — terminal`,
      why: `This record was ${status.toLowerCase()} and cannot continue from this state.`,
      affected: ['Subsequent lifecycle steps'],
      required: 'Start a new record if the work is still required; the current record stays as history.',
      tone: 'blocked'
    };
  }
  return null;
}

/** Reasons a disabled control can be labelled with, instead of a silent no-op. */
export function explainUnavailable(reason: string): string {
  return reason.replace(/\s+/g, ' ').trim();
}
