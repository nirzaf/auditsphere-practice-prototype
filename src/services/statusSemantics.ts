// Shared status vocabulary (enterprise UX layer).
// Every module status string maps to ONE semantic kind so equivalent meanings look the
// same everywhere: text + icon + accessible label, never colour alone. Presentation only —
// this never decides eligibility; store commands and guards remain the authority.

export type StatusKind =
  | 'draft' | 'progress' | 'waiting' | 'submitted' | 'review' | 'returned'
  | 'blocked' | 'stale' | 'approved' | 'complete' | 'issued' | 'closed'
  | 'cancelled' | 'archived' | 'superseded' | 'failed' | 'simulation' | 'neutral';

export interface StatusSemantic {
  kind: StatusKind;
  /** Short meaning announced to assistive technology alongside the visible status text. */
  meaning: string;
  /** Visual tone; one of the shared badge tones in the global base stylesheet. */
  tone: 'gray' | 'blue' | 'amber' | 'purple' | 'orange' | 'red' | 'green' | 'teal' | 'indigo';
  /** Shared glyph name rendered by StatusBadge. */
  glyph: 'dot' | 'half' | 'clock' | 'up' | 'eye' | 'undo' | 'stop' | 'alert' | 'check' | 'checkcircle' | 'send' | 'lock' | 'x' | 'box' | 'layers' | 'flask';
}

export const STATUS_KINDS: Record<StatusKind, StatusSemantic> = {
  draft: { kind: 'draft', meaning: 'Draft — not yet submitted', tone: 'gray', glyph: 'dot' },
  progress: { kind: 'progress', meaning: 'In progress', tone: 'blue', glyph: 'half' },
  waiting: { kind: 'waiting', meaning: 'Waiting on another party', tone: 'amber', glyph: 'clock' },
  submitted: { kind: 'submitted', meaning: 'Submitted — awaiting review', tone: 'blue', glyph: 'up' },
  review: { kind: 'review', meaning: 'In review', tone: 'purple', glyph: 'eye' },
  returned: { kind: 'returned', meaning: 'Returned — changes required', tone: 'orange', glyph: 'undo' },
  blocked: { kind: 'blocked', meaning: 'Blocked — cannot proceed', tone: 'red', glyph: 'stop' },
  stale: { kind: 'stale', meaning: 'Stale — its source changed after it was prepared', tone: 'orange', glyph: 'alert' },
  approved: { kind: 'approved', meaning: 'Approved', tone: 'green', glyph: 'check' },
  complete: { kind: 'complete', meaning: 'Completed', tone: 'green', glyph: 'checkcircle' },
  issued: { kind: 'issued', meaning: 'Issued or released', tone: 'teal', glyph: 'send' },
  closed: { kind: 'closed', meaning: 'Closed — terminal', tone: 'gray', glyph: 'lock' },
  cancelled: { kind: 'cancelled', meaning: 'Cancelled — terminal', tone: 'gray', glyph: 'x' },
  archived: { kind: 'archived', meaning: 'Archived — read only', tone: 'gray', glyph: 'box' },
  superseded: { kind: 'superseded', meaning: 'Superseded by a later revision; kept in history', tone: 'gray', glyph: 'layers' },
  failed: { kind: 'failed', meaning: 'Rejected, declined or failed', tone: 'red', glyph: 'x' },
  simulation: { kind: 'simulation', meaning: 'Simulated — no external system was contacted', tone: 'indigo', glyph: 'flask' },
  neutral: { kind: 'neutral', meaning: 'Status', tone: 'gray', glyph: 'dot' }
};

// Every literal status/stage/disposition in src/types is listed here (see statusSemantics.test.ts).
const STATUS_MAP: Record<string, StatusKind> = {
  // Generic drafting / progress
  'draft': 'draft', 'not started': 'draft', 'planned': 'draft', 'not configured': 'draft', 'not assessed': 'draft',
  'in progress': 'progress', 'open': 'progress', 'active': 'progress', 'prospect': 'draft',
  'inquiry': 'draft', 'discovery': 'progress', 'evaluation': 'progress', 'proposal': 'progress',
  // Engagement stages (free text on EngagementRecord.stage)
  'planning': 'progress', 'fieldwork': 'progress', 'accounting': 'progress', 'completion': 'progress',
  'reporting': 'progress', 'review': 'review', 'acceptance pending': 'waiting',
  // Waiting on someone else
  'requested': 'waiting', 'pending': 'waiting', 'pending review': 'waiting', 'pending verification': 'waiting',
  'needs clarification': 'returned', 'responded': 'submitted', 'received': 'submitted', 'presented': 'waiting',
  'suspended': 'blocked', 'ready': 'approved', 'on hold': 'waiting', 'outcome unknown': 'waiting',
  // Submission and review
  'submitted': 'submitted', 'in review': 'review', 'under review': 'review', 'internal review': 'review',
  'technical review': 'review', 'reopened': 'returned', 'changes required': 'returned', 'returned': 'returned',
  'differences noted': 'returned', 'exceptions noted': 'returned', 'exception noted': 'returned',
  // Blockers
  'blocked': 'blocked', 'deficient': 'blocked', 'inadequate': 'blocked', 'uncorrected': 'blocked',
  'stale': 'stale', 'simulated error': 'failed', 'disconnected': 'closed',
  // Approval and completion
  'approved': 'approved', 'approved to send': 'approved', 'reviewed': 'approved', 'cleared': 'complete',
  'management accepted': 'approved', 'management agreed': 'approved', 'proposed for correction': 'progress',
  'adequate': 'approved', 'accepted': 'complete', 'won': 'complete', 'completed': 'complete', 'complete': 'complete',
  'published': 'approved', 'paid': 'complete', 'reporting included': 'complete', 'reflected in tb': 'complete',
  'corrected in tb': 'complete', 'corrected by client': 'complete', 'waived as immaterial': 'closed',
  'uncorrected waived': 'closed', 'acknowledged': 'complete', 'current': 'approved', 'validated': 'approved',
  'not applicable': 'closed', 'simulated verified': 'simulation', 'simulated accepted': 'simulation',
  'recorded manually': 'complete', 'partially reflected': 'progress', 'not reflected': 'draft', 'unknown': 'neutral',
  // Issue / release
  'issued': 'issued', 'released': 'issued', 'delivered': 'issued', 'applied': 'complete',
  // Terminal
  'closed': 'closed', 'cancelled': 'cancelled', 'withdrawn': 'cancelled', 'retired': 'closed',
  'archived': 'archived', 'superseded': 'superseded', 'expired': 'closed', 'revoked': 'cancelled',
  'inactive': 'closed', 'disabled': 'closed', 'rejected': 'failed', 'declined': 'failed', 'lost': 'failed',
  'unqualified': 'failed', 'simulated failed': 'failed', 'validation blocked': 'blocked'
};

export function statusKind(status: string | undefined | null): StatusKind {
  if (!status) return 'neutral';
  const key = status.trim().toLowerCase();
  if (STATUS_MAP[key]) return STATUS_MAP[key];
  // Deliberately narrow fallbacks for composed labels such as "Returned · v3" or "Stale (TB v4)".
  const head = key.split(/[·(:—-]/)[0].trim();
  return STATUS_MAP[head] || 'neutral';
}

export function statusSemantic(status: string | undefined | null): StatusSemantic {
  return STATUS_KINDS[statusKind(status)];
}

/** Terminal kinds never offer forward lifecycle actions (presentation hint only). */
export const TERMINAL_KINDS: ReadonlySet<StatusKind> = new Set(['closed', 'cancelled', 'archived', 'superseded', 'failed']);

export function isTerminalStatus(status: string | undefined | null): boolean {
  return TERMINAL_KINDS.has(statusKind(status));
}
