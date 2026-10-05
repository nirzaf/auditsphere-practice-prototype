// Shared enterprise feedback primitives: notices, empty/no-result/out-of-scope states,
// stale-dependency banners, gate/blocker lists and disabled-action explanations.
// Presentation only: callers pass facts already derived from store state and guards.
import React from 'react';
import { StatusGlyph } from './StatusBadge';

type NoticeTone = 'success' | 'error' | 'warning' | 'info' | 'simulation';
const NOTICE_GLYPH = { success: 'checkcircle', error: 'stop', warning: 'alert', info: 'eye', simulation: 'flask' } as const;

interface NoticeProps {
  tone: NoticeTone;
  title?: string;
  children?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/** Inline outcome message. Errors and warnings interrupt (role=alert); others are polite status. */
export const Notice: React.FC<NoticeProps> = ({ tone, title, children, onDismiss, className = '' }) => (
  <div className={`notice notice-${tone} ${className}`.trim()} role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}>
    <StatusGlyph glyph={NOTICE_GLYPH[tone]} />
    <div className="notice-body">
      {title && <b className="notice-title">{title}</b>}
      {children && <div>{children}</div>}
    </div>
    {onDismiss && <button type="button" className="icon-btn notice-dismiss" aria-label="Dismiss message" onClick={onDismiss}>✕</button>}
  </div>
);

type EmptyVariant = 'none' | 'filtered' | 'scope';
const EMPTY_DEFAULT: Record<EmptyVariant, string> = {
  none: 'Nothing has been recorded yet.',
  filtered: 'No records match these filters. Clear or widen the filters to see more.',
  scope: 'Nothing is available in your current access scope.'
};

interface EmptyStateProps {
  /** none = no records exist; filtered = records exist but filters exclude them; scope = nothing permitted.
   *  A scope state never reveals whether restricted records exist or how many. */
  variant?: EmptyVariant;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ variant = 'none', title, description, actions, compact }) => (
  <div className={`empty-state empty-${variant}${compact ? ' compact' : ''}`} data-empty-variant={variant}>
    <span className="empty-icon" aria-hidden="true"><StatusGlyph glyph={variant === 'filtered' ? 'eye' : variant === 'scope' ? 'lock' : 'box'} /></span>
    <div>
      <b>{title}</b>
      {(description ?? (variant === 'none' ? undefined : EMPTY_DEFAULT[variant])) && <p className="sub">{description ?? EMPTY_DEFAULT[variant]}</p>}
      {actions && <div className="row wrap mt8" style={{ gap: 8 }}>{actions}</div>}
    </div>
  </div>
);

/** Table body row for the three empty variants, so tables keep their header context. */
export const EmptyTableRow: React.FC<EmptyStateProps & { colSpan: number }> = ({ colSpan, ...props }) => (
  <tr className="empty-row"><td colSpan={colSpan}><EmptyState compact {...props} /></td></tr>
);

interface StaleBannerProps {
  /** What is stale, e.g. "Financial package Rev 3". */
  subject: string;
  /** Upstream sources that changed. from/to are displayed verbatim (e.g. "Revision 4"). */
  changes: Array<{ source: string; from: string; to: string }>;
  affected?: string[];
  /** Historical decisions that remain preserved in history. */
  preserved?: string;
  required: string;
  action?: React.ReactNode;
}

export const StaleBanner: React.FC<StaleBannerProps> = ({ subject, changes, affected, preserved, required, action }) => (
  <section className="stale-banner" role="status" aria-label={`${subject} is stale`}>
    <div className="stale-head"><StatusGlyph glyph="alert" /><b>STALE</b><span>{subject}</span></div>
    <div className="stale-grid">
      <div><label>Source changed</label>{changes.map(change => <div key={change.source}>{change.source}: <span className="mono">{change.from}</span> → <span className="mono">{change.to}</span></div>)}</div>
      {affected && affected.length > 0 && <div><label>Affected</label><ul>{affected.map(item => <li key={item}>{item}</li>)}</ul></div>}
      {preserved && <div><label>Historical record preserved</label><div>{preserved}</div></div>}
      <div><label>Required</label><div>{required}</div>{action && <div className="mt8">{action}</div>}</div>
    </div>
  </section>
);

export interface GateItem {
  label: string;
  passed: boolean;
  /** Why it is blocked (or what satisfied it). */
  detail?: React.ReactNode;
  action?: React.ReactNode;
}

/** Readiness gates with explicit pass/blocked text — the precise reason, never just "invalid". */
export const GateList: React.FC<{ gates: GateItem[]; label: string }> = ({ gates, label }) => (
  <ul className="gate-list" aria-label={label}>
    {gates.map(gate => (
      <li key={gate.label} className={gate.passed ? 'gate-pass' : 'gate-blocked'}>
        <StatusGlyph glyph={gate.passed ? 'checkcircle' : 'stop'} />
        <div className="gate-text">
          <span className="gate-label">{gate.label}</span>
          <span className="gate-state">{gate.passed ? 'Passed' : 'Blocked'}</span>
          {gate.detail && <div className="caption">{gate.detail}</div>}
        </div>
        {gate.action && <div className="gate-action">{gate.action}</div>}
      </li>
    ))}
  </ul>
);

/** Explains why an action is unavailable. Pair with aria-describedby on the disabled control. */
export const ActionReason: React.FC<{ id?: string; children: React.ReactNode }> = ({ id, children }) => (
  <span className="action-reason" id={id}><StatusGlyph glyph="lock" />{children}</span>
);
