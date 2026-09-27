// AuditSphere shared enterprise UI primitives (MOD-UX-01 · Phase 1).
//
// These components are the one shared vocabulary every module uses to answer:
// where am I, what state is this record in, what is blocking it, what can I do
// now, who must act next, what changed, and where does the flow continue.
//
// They are presentation-only. No primitive reads or writes business state, so
// none of them can bypass a guard or relax a rule.

import React from 'react';
import { Icon } from './Icons';
import {
  StatusTone,
  LifecycleStep,
  statusSemantics,
  lifecycleModelFor,
  TONE_MEANING
} from '../../services/lifecycle';

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

export interface StatusBadgeProps {
  /** Business status as stored. Missing values render as an explicit "Not set". */
  status?: string | null;
  size?: 'sm' | 'md';
  /** Override the derived tone when a module knows better than the vocabulary. */
  tone?: StatusTone;
  /** Append the derived explanation to the accessible description. */
  explain?: boolean;
  className?: string;
}

/**
 * Renders a status with a tone cue and a plain-language explanation.
 *
 * The literal status text stays the badge's only text node, so a status that
 * already sits inside a sentence ("v8 · Approved") keeps exactly its previous
 * inline text and no test or screenshot assertion changes meaning. The
 * explanation travels in the accessible name and the tooltip, and the tone
 * changes the badge's shape (left border, weight) as well as its colour, so the
 * state is never carried by colour alone.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', tone, explain = false, className = '' }) => {
  const semantic = statusSemantics(status);
  const appliedTone = tone ?? semantic.tone;
  const description = explain ? `${semantic.label}. ${semantic.meaning}` : semantic.meaning;
  return (
    <span
      className={`status-badge tone-${appliedTone} ${size === 'sm' ? 'sm' : ''} ${className}`.trim()}
      data-status-tone={appliedTone}
      data-status-label={semantic.label}
      aria-label={description}
      title={description}
    >
      {semantic.label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// LifecycleStepper
// ---------------------------------------------------------------------------

export interface LifecycleStepperProps {
  title: string;
  steps: readonly LifecycleStep[];
  /** One-line summary of where the journey stands. */
  summary?: string;
  /** Extra guidance shown under the track (for example the required next action). */
  footer?: React.ReactNode;
  /** Accessible name; defaults to the title. */
  label?: string;
}

/**
 * Shows a record's real lifecycle: completed steps, the step in progress, and
 * which steps are unreachable while a blocker stands.
 */
export const LifecycleStepper: React.FC<LifecycleStepperProps> = ({ title, steps, summary, footer, label }) => {
  const current = steps.find(step => step.state === 'current');
  const blocked = steps.filter(step => step.state === 'blocked');
  const summaryText = summary
    ?? (blocked.length
      ? `Blocked at ${blocked.map(step => step.label).join(', ')}.`
      : current ? `Current step: ${current.label}${current.owner ? ` — waiting on ${current.owner}` : ''}.`
        : 'No step is currently in progress.');
  return (
    <section className="lifecycle" aria-label={label ?? `${title} lifecycle`} data-lifecycle-model={title}>
      <div className="lifecycle-head">
        <div>
          <h3>{title}</h3>
          <p className="sub">{summaryText}</p>
        </div>
      </div>
      <ol className="lifecycle-track" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map(step => (
          <li key={step.id} className={`lifecycle-node ${step.state}`}>
            <span className="life-mark" aria-hidden="true">
              {step.state === 'done' ? '✓' : step.state === 'blocked' ? '!' : step.state === 'current' ? '●' : step.state === 'skipped' ? '–' : '○'}
            </span>
            <div>
              <div className="life-label">{step.label}</div>
              {step.owner && step.state !== 'done' && <div className="life-owner">{step.owner}</div>}
              {step.reason && step.state === 'blocked' && <div className="life-owner">{step.reason}</div>}
              <span className="sr-only">{` — ${step.state === 'not-applicable' ? 'not applicable' : step.state}`}</span>
            </div>
          </li>
        ))}
      </ol>
      {footer && <div className="lifecycle-foot">{footer}</div>}
    </section>
  );
};

// ---------------------------------------------------------------------------
// PageHeader
// ---------------------------------------------------------------------------

export interface PageIdentityItem {
  label: string;
  value: React.ReactNode;
  /** Render the value in monospace (identifiers, revisions, hashes). */
  mono?: boolean;
}

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Status pill(s) shown next to the title. */
  status?: React.ReactNode;
  /** Primary actions, right-aligned. */
  actions?: React.ReactNode;
  /** Client · engagement · period · owner · updated line. */
  identity?: PageIdentityItem[];
  /** Lifecycle model hint for this module. */
  lifecycleHint?: string;
  /** Rendered between the header and the identity line (for example a stale banner). */
  banner?: React.ReactNode;
  /** Anchor id, used when the page is the target of a skip/return link. */
  id?: string;
}

/**
 * The shared enterprise page anatomy: breadcrumb-ish identity, title, status and
 * actions on one line, then the context line that tells the reader which client,
 * engagement, period and revision they are looking at.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title, description, status, actions, identity, lifecycleHint, banner, id
}) => (
  <div className="pagehead" id={id}>
    <div style={{ minWidth: 0 }}>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <h1>{title}</h1>
        {status && <span className="page-status">{status}</span>}
      </div>
      {description && <p className="page-subtitle">{description}</p>}
      {identity && identity.length > 0 && (
        <div className="page-identity">
          {identity.filter(item => item.value !== undefined && item.value !== null && item.value !== '').map(item => (
            <span className="identity-item" key={item.label}>
              <span>{item.label}</span>
              <b className={item.mono ? 'mono' : undefined}>{item.value}</b>
            </span>
          ))}
        </div>
      )}
    </div>
    {actions && <div className="head-actions">{actions}</div>}
  </div>
);

/** Lifecycle hint strip that explains how a module's journey works. */
export const LifecycleHint: React.FC<{ model: string; children?: React.ReactNode }> = ({ model, children }) => (
  <div className="lifecycle-hint" role="note">
    <b>{model}</b>
    {children && <span>{children}</span>}
  </div>
);

// ---------------------------------------------------------------------------
// Module context — one shared answer to "which client/engagement/period?"
// ---------------------------------------------------------------------------

const ModuleContextValue = React.createContext<{ route: string; context: ModuleContext | null }>({ route: 'overview', context: null });

export const ModuleContextProvider: React.FC<{ route: string; context: ModuleContext | null; children: React.ReactNode }> = ({ route, context, children }) => (
  <ModuleContextValue.Provider value={{ route, context }}>{children}</ModuleContextValue.Provider>
);

export function useModuleContext(): { route: string; context: ModuleContext | null } {
  return React.useContext(ModuleContextValue);
}

/** Identity items for the module currently being rendered. */
export function useModuleIdentity(): PageIdentityItem[] {
  return moduleIdentity(useModuleContext().context);
}

/**
 * Identity items scoped to one client record. A client workspace must never
 * advertise an engagement that belongs to a different client, so when the
 * selected engagement is not owned by `clientId` only the client-level facts are
 * reported.
 */
export function useClientScopedIdentity(clientId: string | undefined, extra?: PageIdentityItem[]): PageIdentityItem[] {
  const { context } = useModuleContext();
  if (!clientId) return moduleIdentity(context);
  const ownsSelected = context?.engagementClientId === clientId || (!context?.engagementClientId && context?.clientId === clientId);
  if (ownsSelected) return [...moduleIdentity(context), ...(extra ?? [])];
  return [...moduleIdentity({ ...(context ?? { isClientRole: false }), engagementId: undefined, service: undefined, currency: undefined, sourceVersion: undefined, packageRevision: null, packageStatus: null, lifecycleStatus: undefined }), ...(extra ?? [])];
}

/** The lifecycle model of the module currently being rendered. */
export function useModuleLifecycle(): { title: string; steps: readonly string[] } {
  const model = lifecycleModelFor(useModuleContext().route);
  return { title: model.title, steps: model.steps };
}

/**
 * The shared identity line, dropped into a view's existing page header. It reads
 * the module context, so a view keeps its own title and actions while gaining the
 * same client · engagement · period · revision line as every other module.
 *
 * Renders nothing when there is no engagement context (practice-wide pages), so
 * it is safe to add unconditionally.
 */
export const ModuleIdentityLine: React.FC<{ extra?: PageIdentityItem[]; clientId?: string; className?: string }> = ({ extra, clientId, className = '' }) => {
  // A client workspace passes its own client id so a globally selected
  // engagement from another client can never appear in the identity line.
  const scoped = useClientScopedIdentity(clientId, extra);
  const { context } = useModuleContext();
  const items = (clientId ? scoped : [...moduleIdentity(context), ...(extra ?? [])])
    .filter(item => item.value !== undefined && item.value !== null && item.value !== '');
  if (!items.length) return null;
  return (
    <div className={`page-identity ${className}`.trim()}>
      {items.map(item => (
        <span className="identity-item" key={item.label}>
          <span>{item.label}</span>
          <b className={item.mono ? 'mono' : undefined}>{item.value}</b>
        </span>
      ))}
    </div>
  );
};

/** The shared lifecycle hint strip for the module currently being rendered. */
export const ModuleLifecycleHint: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { title, steps } = useModuleLifecycle();
  return <LifecycleHint model={title}>{children ?? `Steps: ${steps.join(' → ')}`}</LifecycleHint>;
};

/** The lifecycle stepper for the module currently being rendered. */
export const ModuleLifecycleStepper: React.FC<{ steps: readonly LifecycleStep[]; summary?: string; footer?: React.ReactNode }> = ({ steps, summary, footer }) => {
  const { title } = useModuleLifecycle();
  return <LifecycleStepper title={title} steps={steps} summary={summary} footer={footer} />;
};

// ---------------------------------------------------------------------------
// ModulePageHeader — the shared enterprise page anatomy for a routed module
// ---------------------------------------------------------------------------

export interface ModuleContext {
  clientName?: string;
  clientId?: string;
  engagementId?: string;
  /** Client that owns the selected engagement, used to refuse cross-client context. */
  engagementClientId?: string;
  service?: string;
  period?: string;
  year?: number;
  currency?: string;
  lifecycleStatus?: string;
  stage?: string;
  manager?: string;
  due?: string;
  archive?: boolean;
  /** Package revision label, e.g. `v3`, when a package context exists. */
  packageRevision?: string | null;
  packageStatus?: string | null;
  sourceVersion?: number;
  isClientRole: boolean;
}

export interface ModulePageHeaderProps {
  /** Route key; drives the lifecycle hint and the page's tone marker. */
  route: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  /** Extra identity items appended after the derived client/engagement/period line. */
  identity?: PageIdentityItem[];
  /** Context facts for the identity line; omit on non-contextual pages. */
  context?: ModuleContext | null;
  /** Show the module's lifecycle hint strip under the header. */
  showLifecycleHint?: boolean;
  /** Also print the identity line when no engagement context exists. */
  banner?: React.ReactNode;
  id?: string;
}

/**
 * Build the identity line from the module context, so every module answers
 * "which client, engagement, period and revision am I looking at?" in the same
 * order with the same labels. Items with no value are omitted rather than
 * rendered as blanks.
 */
export function moduleIdentity(context: ModuleContext | null | undefined): PageIdentityItem[] {
  if (!context) return [];
  if (context.isClientRole) {
    return [
      { label: 'Client', value: context.clientName ?? context.clientId },
      { label: 'Period', value: context.period ?? (context.year ? `FY ${context.year}` : undefined) },
      { label: 'Your engagement team', value: context.manager }
    ];
  }
  return [
    { label: 'Client', value: context.clientName ?? context.clientId },
    { label: 'Engagement', value: context.engagementId, mono: true },
    { label: 'Service', value: context.service },
    { label: 'Period', value: context.period ?? (context.year ? `FY ${context.year}` : undefined) },
    { label: 'Currency', value: context.currency },
    { label: 'Lifecycle', value: context.lifecycleStatus },
    { label: 'Manager', value: context.manager },
    { label: 'Target date', value: context.due },
    { label: 'Source revision', value: context.sourceVersion ? `v${context.sourceVersion}` : undefined, mono: true },
    {
      label: 'Package',
      value: context.packageRevision
        ? `${context.packageRevision}${context.packageStatus ? ` · ${context.packageStatus}` : ''}`
        : context.packageStatus && context.packageStatus !== 'Not created' ? context.packageStatus : undefined,
      mono: true
    }
  ];
}

/**
 * Every routed module renders its title through this component so the reader
 * always sees the same answers at the top of the page: which module, which
 * client and engagement, which period, which revision, and how this module's
 * lifecycle works.
 */
export const ModulePageHeader: React.FC<ModulePageHeaderProps> = ({
  route, title, description, status, actions, identity, context, showLifecycleHint = false, banner, id
}) => {
  const model = lifecycleModelFor(route);
  const derived = moduleIdentity(context);
  const merged = [...derived, ...(identity ?? [])];
  return (
    <>
      <PageHeader
        id={id}
        title={title}
        description={description}
        status={status}
        actions={actions}
        identity={merged}
        banner={banner}
      />
      {banner}
      {showLifecycleHint && (
        <LifecycleHint model={model.title}>
          {`Steps: ${model.steps.join(' → ')}`}
        </LifecycleHint>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// StateBlock — empty / no-result / out-of-scope
// ---------------------------------------------------------------------------

export type StateBlockKind = 'empty' | 'no-match' | 'scoped' | 'error';

const STATE_BLOCK_DEFAULT: Record<StateBlockKind, { icon: string; title: string; body: string }> = {
  empty: { icon: 'layers', title: 'Nothing here yet', body: 'No records have been created in this scope.' },
  'no-match': { icon: 'search', title: 'No records match these filters', body: 'Records exist in this scope, but none match the filters you applied. Clear or widen the filters to see them.' },
  scoped: { icon: 'shield', title: 'No records are available in your current scope', body: 'Your access grant does not include records for this module. Counts for records outside your scope are not shown.' },
  error: { icon: 'bell', title: 'This section could not be loaded', body: 'The underlying browser-local data could not be read for this section. Nothing has been changed.' }
};

export interface StateBlockProps {
  kind: StateBlockKind;
  title?: string;
  body?: React.ReactNode;
  icon?: string;
  /** Suggested next steps. Never offer an action the current role cannot perform. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Distinguishes "no records exist" from "no records match the filters" from
 * "records exist but are outside your permitted scope", without leaking counts
 * of restricted records.
 */
export const StateBlock: React.FC<StateBlockProps> = ({ kind, title, body, icon, actions, className = '' }) => {
  const fallback = STATE_BLOCK_DEFAULT[kind];
  return (
    <div className={`state-block ${kind === 'scoped' ? 'scoped' : ''} ${className}`.trim()} data-state-block={kind} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="state-icon" aria-hidden="true"><Icon name={icon ?? fallback.icon} size="lg" /></span>
      <h3>{title ?? fallback.title}</h3>
      <p>{body ?? fallback.body}</p>
      {actions && <div className="state-actions">{actions}</div>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ListState — the per-collection empty / no-match answer
// ---------------------------------------------------------------------------

/**
 * Canonical copy for the two different questions a collection can answer. Kept in
 * one place so no module invents its own wording for the same situation, and
 * asserted by the static UX harness.
 */
export const LIST_STATE_TEXT = {
  empty: 'No records yet',
  'no-match': 'No records match these filters',
  scoped: 'No records are available in your current scope',
  error: 'This list could not be loaded'
} as const;

export interface ListStateProps {
  kind: 'empty' | 'no-match' | 'scoped' | 'error';
  /** Override the wording when the record type deserves a specific noun. */
  message?: React.ReactNode;
  /** The module's own explanation of what this list is for. */
  hint?: React.ReactNode;
  /** A create/apply action, only when the current role may actually perform it. */
  action?: React.ReactNode;
  colSpan?: number;
  className?: string;
}

/**
 * Renders inside a list or table body so an empty collection explains *which*
 * kind of empty it is: nothing exists, nothing matches the current filters,
 * everything is outside the current scope, or the list failed to load.
 */
export const ListState: React.FC<ListStateProps> = ({ kind, message, hint, action, colSpan, className = '' }) => {
  const body = (
    <div className={`state-block ${kind === 'scoped' ? 'scoped' : ''} ${className}`.trim()} data-list-state={kind} role={kind === 'error' ? 'alert' : 'status'} style={{ border: 0, background: 'transparent', padding: '22px 18px' }}>
      <h3>{message ?? LIST_STATE_TEXT[kind]}</h3>
      {hint && <p>{hint}</p>}
      {action && <div className="state-actions">{action}</div>}
    </div>
  );
  if (colSpan === undefined) return body;
  return <tr><td colSpan={colSpan} style={{ padding: 0 }}>{body}</td></tr>;
};

// ---------------------------------------------------------------------------
// Blocker notice / stale banner
// ---------------------------------------------------------------------------

export interface BlockerNoticeProps {
  tone?: 'blocked' | 'stale' | 'waiting' | 'history';
  title: string;
  why: React.ReactNode;
  affected?: readonly string[];
  required?: React.ReactNode;
  /** Preserved historical decision that must not look erased. */
  preserved?: React.ReactNode;
  actions?: React.ReactNode;
  label?: string;
}

/**
 * Explains exactly why something cannot proceed, what it affects, what the
 * reader must do, and what history is deliberately preserved. Used instead of
 * vague "Error" / "Cannot continue" text.
 */
export const BlockerNotice: React.FC<BlockerNoticeProps> = ({
  tone = 'blocked', title, why, affected, required, preserved, actions, label
}) => (
  <section className={`notice ${tone}`} role={tone === 'history' ? 'note' : 'status'} aria-label={label ?? title}>
    <div className="notice-head">
      <Icon name={tone === 'stale' ? 'refresh' : tone === 'blocked' ? 'shield' : 'clock'} size="sm" />
      <h3>{title}</h3>
    </div>
    <div className="notice-body">
      <dl>
        <dt>Why</dt>
        <dd>{why}</dd>
        {affected && affected.length > 0 && <>
          <dt>Affected</dt>
          <dd><ul>{affected.map(item => <li key={item}>{item}</li>)}</ul></dd>
        </>}
        {preserved && <>
          <dt>Preserved</dt>
          <dd>{preserved}</dd>
        </>}
        {required && <>
          <dt>Required</dt>
          <dd>{required}</dd>
        </>}
      </dl>
      {actions && <div className="row mt12" style={{ gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// StaleNotice — why a derived output can no longer be relied on
// ---------------------------------------------------------------------------

export interface StaleNoticeProps {
  /**
   * What the record was derived from, for example `Revision 4`. Omit when the
   * exact movement is unknown so nothing is invented.
   */
  sourceLabel?: string;
  /** What the source is now, for example `Revision 5`. */
  currentSourceLabel?: string;
  /** A specific recorded reason that takes precedence over the revision movement. */
  reason?: React.ReactNode;
  /** Downstream items this output feeds. */
  affected?: readonly string[];
  /** The historical decision that must remain visible rather than looking erased. */
  preserved?: React.ReactNode;
  /** What the reader must do next. */
  required: React.ReactNode;
  actions?: React.ReactNode;
  tone?: 'stale' | 'blocked' | 'waiting';
  title?: string;
}

/**
 * Shows that a derived output no longer matches its source, naming the exact
 * change, listing what it affects, stating which historical decision is
 * deliberately preserved, and naming the required next action. Used instead of a
 * bare "Stale" word so the reader never has to guess.
 */
export const StaleNotice: React.FC<StaleNoticeProps> = ({
  sourceLabel, currentSourceLabel, reason, affected, preserved, required, actions, tone = 'stale', title
}) => {
  const movement = sourceLabel && currentSourceLabel
    ? `${sourceLabel} → ${currentSourceLabel}`
    : currentSourceLabel
    ? `now at ${currentSourceLabel}`
    : 'a newer source revision';
  const why = reason ?? `The source this output was derived from changed (${movement}). The figures shown were produced from the earlier source and do not include that change.`;
  return (
    <BlockerNotice
      tone={tone}
      title={title ?? (tone === 'stale' ? 'Stale — recalculate required' : tone === 'blocked' ? 'Blocked' : 'Waiting')}
      why={why}
      affected={affected}
      preserved={preserved}
      required={required}
      actions={actions}
      label="Staleness and required action"
    />
  );
};

// ---------------------------------------------------------------------------
// Provenance / review panel
// ---------------------------------------------------------------------------

export interface ProvenanceItem {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}

/** Prepared-by / revision / reviewer / approval facts for a reviewed record. */
export const ProvenancePanel: React.FC<{ items: ProvenanceItem[]; title?: string; className?: string }> = ({ items, title, className = '' }) => (
  <div className={className}>
    {title && <h3 className="mb8" style={{ fontSize: 13 }}>{title}</h3>}
    <dl className="provenance">
      {items.filter(item => item.value !== undefined && item.value !== null && item.value !== '').map(item => (
        <div key={item.label}>
          <dt className="prov-label">{item.label}</dt>
          <dd className={`prov-value ${item.muted ? 'muted' : ''}`.trim()}>{item.value}</dd>
        </div>
      ))}
    </dl>
  </div>
);

export interface ReviewCell {
  heading: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  /** Highlight the cell that the reader must act on next. */
  attention?: boolean;
}

/** Prepared by → reviewer → approver → next action, for review-driven modules. */
export const ReviewPanel: React.FC<{ cells: ReviewCell[]; label?: string }> = ({ cells, label }) => (
  <div className="review-panel" aria-label={label ?? 'Review status'}>
    {cells.map(cell => (
      <div className={`review-cell ${cell.attention ? 'attention' : ''}`.trim()} key={cell.heading}>
        <h4>{cell.heading}</h4>
        <b>{cell.value}</b>
        {cell.detail && <p>{cell.detail}</p>}
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Activity timeline
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  id: string;
  title: string;
  /** Actor and role/persona, rendered as the secondary line. */
  actor?: string;
  time?: string;
  revision?: string | number;
  reason?: React.ReactNode;
  /** Previous → new state, when the event moved the record. */
  transition?: string;
  icon?: string;
}

/** Consistent chronological history: actor, time, revision, reason, transition. */
export const ActivityTimeline: React.FC<{ events: TimelineEvent[]; label?: string; emptyMessage?: string }> = ({ events, label, emptyMessage }) => {
  if (!events.length) return <p className="sub">{emptyMessage ?? 'No history has been recorded for this record yet.'}</p>;
  return (
    <ol className="timeline-list" aria-label={label ?? 'Activity and history'}>
      {events.map(event => (
        <li className="timeline-item" key={event.id}>
          <span className="timeline-dot" aria-hidden="true"><Icon name={event.icon ?? 'checkcircle'} size="sm" /></span>
          <div className="timeline-content">
            <div className="timeline-title">{event.title}</div>
            {(event.actor || event.time || event.revision !== undefined) && (
              <div className="timeline-meta">
                {event.actor && <span>{event.actor}</span>}
                {event.time && <span>{event.time}</span>}
                {event.revision !== undefined && event.revision !== '' && <span className="mono">Rev {event.revision}</span>}
              </div>
            )}
            {event.transition && <div className="timeline-transition">{event.transition}</div>}
            {event.reason && <div className="timeline-reason">{event.reason}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
};

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  icon?: string;
  tone?: string;
  /** Selecting the card reveals the exact underlying filtered records. */
  onSelect?: () => void;
  selected?: boolean;
  /** Explains why a metric is unavailable for this persona instead of hiding it silently. */
  unavailableReason?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, caption, icon = 'grid', tone = '', onSelect, selected = false, unavailableReason }) => {
  const available = !unavailableReason;
  const body = (
    <>
      <div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon name={icon} /></span></div>
      <div className="metric-value">{available ? value : '—'}</div>
      <span className="metric-caption">{unavailableReason ?? caption}</span>
      {available && onSelect && <span className="metric-drill" aria-hidden="true">View matching records</span>}
    </>
  );
  const label$ = `${label}: ${available ? value : 'unavailable'}. ${unavailableReason ?? caption ?? ''}`;
  if (!available) return <div className="metric unavailable" aria-label={label$}>{body}</div>;
  if (!onSelect) return <div className="metric" aria-label={label$}>{body}</div>;
  return (
    <button
      type="button"
      className={`metric ${tone}`}
      aria-label={label$}
      aria-pressed={selected}
      onClick={onSelect}
      style={{ cursor: 'pointer', color: 'inherit', width: '100%' }}
    >
      {body}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Cross-module handoff links
// ---------------------------------------------------------------------------

export interface HandoffLink {
  kind: string;
  label: string;
  onOpen: () => void;
}

/** Contextual navigation to the records this one depends on or feeds. */
export const HandoffLinks: React.FC<{ links: HandoffLink[]; title?: string }> = ({ links, title }) => {
  if (!links.length) return null;
  return (
    <div>
      {title && <h3 className="mb8" style={{ fontSize: 13 }}>{title}</h3>}
      <div className="handoff-links">
        {links.map(link => (
          <button type="button" className="handoff-link" key={`${link.kind}:${link.label}`} onClick={link.onOpen}>
            <span className="handoff-kind">{link.kind}</span>
            <span>{link.label}</span>
            <Icon name="arrow" size="sm" />
          </button>
        ))}
      </div>
    </div>
  );
};

/** Section wrapper so related panels group consistently. */
export const SectionCard: React.FC<{ title: React.ReactNode; caption?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, caption, actions, children }) => (
  <section className="section-card">
    <header>
      <div>
        <h3>{title}</h3>
        {caption && <p className="sub">{caption}</p>}
      </div>
      {actions}
    </header>
    <div className="section-body">{children}</div>
  </section>
);

/** Plain-language explanation attached to a control the user cannot use. */
export const ActionReason: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="action-reason">{children}</span>
);

export { TONE_MEANING };
