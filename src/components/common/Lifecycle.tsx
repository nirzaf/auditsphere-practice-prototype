// Lifecycle panel: makes a record's state visible instead of hiding it in buttons.
// Shows the stepper for its lifecycle definition, the current state, who acted and who must
// act next, blockers and downstream impact. All facts are supplied by the calling module.
import React from 'react';
import { LifecycleDefinition, projectLifecycle, StepState } from '../../services/lifecycles';
import { StatusBadge, StatusGlyph } from './StatusBadge';
import type { StatusKind } from '../../services/statusSemantics';

const STEP_GLYPH: Record<StepState, 'check' | 'dot' | 'undo' | 'stop' | 'alert' | 'x' | 'half'> = {
  done: 'check', current: 'half', returned: 'undo', blocked: 'stop', stale: 'alert', todo: 'dot', skipped: 'x'
};
const STEP_TEXT: Record<StepState, string> = {
  done: 'completed', current: 'current step', returned: 'returned for rework', blocked: 'blocked', stale: 'stale', todo: 'not reached', skipped: 'not reached'
};

export const LifecycleStepper: React.FC<{ definition: LifecycleDefinition; status: string; returned?: boolean; label?: string }> = ({ definition, status, returned, label }) => {
  const view = projectLifecycle(definition, status, { returned });
  return (
    <ol className="lc-steps" aria-label={label || `${definition.record} lifecycle`}>
      {view.steps.map(step => (
        <li key={step.step} className={`lc-step lc-${step.state}`} aria-current={step.state === 'current' || step.state === 'returned' ? 'step' : undefined}>
          <span className="lc-marker"><StatusGlyph glyph={STEP_GLYPH[step.state]} /></span>
          <span className="lc-label">{step.step}</span>
          <span className="sr-only">{`: ${STEP_TEXT[step.state]}`}</span>
        </li>
      ))}
    </ol>
  );
};

export interface LifecycleFact { label: string; value: React.ReactNode }

interface LifecyclePanelProps {
  definition: LifecycleDefinition;
  /** Record label shown in the heading, e.g. "INV-2026-003 · Rev 2". */
  subject: string;
  status: string;
  /** Human label for the header badge when the lifecycle status is an internal key. */
  displayStatus?: string;
  displayKind?: StatusKind;
  /** True when the store keeps Draft after a return (invoice, proposal) but a return note exists. */
  returned?: boolean;
  facts?: LifecycleFact[];
  /** Precise blockers; an empty list renders "None". Omit to hide the row. */
  blockers?: string[];
  nextAction?: React.ReactNode;
  downstream?: React.ReactNode;
  children?: React.ReactNode;
  headingLevel?: 'h2' | 'h3' | 'h4';
}

export const LifecyclePanel: React.FC<LifecyclePanelProps> = ({ definition, subject, status, displayStatus, displayKind, returned, facts = [], blockers, nextAction, downstream, children, headingLevel = 'h3' }) => {
  const view = projectLifecycle(definition, status, { returned });
  const Heading = headingLevel;
  return (
    <section className="lifecycle-panel" aria-label={`${subject} lifecycle`} data-lifecycle={definition.id}>
      <div className="lc-head">
        <div>
          <span className="eyebrow">{definition.record} lifecycle</span>
          <Heading className="lc-subject">{subject}</Heading>
        </div>
        <StatusBadge status={displayStatus || (returned && status === 'Draft' ? 'Returned' : status)} kind={displayKind} />
      </div>
      <LifecycleStepper definition={definition} status={status} returned={returned} label={`${subject} lifecycle steps`} />
      {view.position === 'rework' && view.reworkNote && <p className="lc-note lc-note-rework"><StatusGlyph glyph="undo" />{view.reworkNote}</p>}
      {view.position === 'terminal' && <p className="lc-note"><StatusGlyph glyph="lock" />{status} is terminal. The record and its history stay available read-only.</p>}
      <dl className="lc-facts">
        {facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value ?? '—'}</dd></div>)}
        {blockers && <div className="lc-blockers lc-wide"><dt>Blockers</dt><dd>{blockers.length ? <ul>{blockers.map(item => <li key={item}>{item}</li>)}</ul> : 'None'}</dd></div>}
        {nextAction && <div className="lc-next lc-wide"><dt>Next action</dt><dd>{nextAction}</dd></div>}
        {downstream && <div className="lc-wide"><dt>Downstream impact</dt><dd>{downstream}</dd></div>}
      </dl>
      {children}
    </section>
  );
};
