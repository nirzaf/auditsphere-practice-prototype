import React, { useState } from 'react';
import type { ModuleWorkflowProgress, ProgressStepState, WorkflowStep } from '../../services/workflowProgress';
import { StatusGlyph } from './StatusBadge';
import type { RouteKey } from '../../types';

interface WorkflowProgressProps {
  progress: ModuleWorkflowProgress;
  onNavigate?: (route: RouteKey, targetId?: string) => void;
  onSelectStep?: (step: WorkflowStep) => void;
  compact?: boolean;
  className?: string;
}

const STEP_GLYPH: Record<ProgressStepState, 'check' | 'dot' | 'undo' | 'stop' | 'alert' | 'x' | 'half'> = {
  completed: 'check', current: 'half', pending: 'dot', blocked: 'stop', returned: 'undo', stale: 'alert', skipped: 'x', na: 'x'
};

const STEP_TEXT: Record<ProgressStepState, string> = {
  completed: 'Completed', current: 'Current step', pending: 'Pending', blocked: 'Blocked', returned: 'Returned for rework',
  stale: 'Stale because a source changed', skipped: 'Skipped and unfinished', na: 'Not applicable'
};

const formatPercent = (value: number) => Number.isInteger(value) ? `${value}` : value.toFixed(1);

export const WorkflowProgress: React.FC<WorkflowProgressProps> = ({
  progress,
  onNavigate,
  onSelectStep,
  compact = false,
  className = ''
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = `wp-details-${progress.moduleId}-${progress.route}`;
  const isWorkflow = progress.applicability === 'workflow';
  const hasMeasuredSteps = isWorkflow && progress.counts.total > 0 && progress.percentComplete !== null;

  const handleStepClick = (step: WorkflowStep) => {
    if (onSelectStep) onSelectStep(step);
    else if (step.targetRoute && onNavigate) onNavigate(step.targetRoute, step.targetRecordId);
  };

  const countItems = [
    { key: 'completed', label: 'Done', value: progress.counts.completed, icon: 'check' as const, color: 'green' },
    { key: 'current', label: 'Current', value: progress.counts.current || 0, icon: undefined, color: 'teal' },
    { key: 'pending', label: 'Pending', value: progress.counts.pending, icon: undefined, color: 'muted' },
    { key: 'blocked', label: 'Blocked', value: progress.counts.blocked, icon: 'stop' as const, color: 'red' },
    { key: 'returned', label: 'Rework', value: progress.counts.returned || 0, icon: 'undo' as const, color: 'amber' },
    { key: 'stale', label: 'Stale', value: progress.counts.stale || 0, icon: 'alert' as const, color: 'amber' },
    { key: 'skipped', label: 'Skipped', value: progress.counts.skipped || 0, icon: undefined, color: 'muted' },
    { key: 'not-applicable', label: 'Not required', value: progress.counts.notApplicable || 0, icon: undefined, color: 'muted' }
  ].filter(item => item.value > 0 || item.key === 'completed' || item.key === 'pending');

  return (
    <section
      className={`workflow-progress-panel ${className}`.trim()}
      aria-label={`${progress.moduleName} status${hasMeasuredSteps ? `: ${formatPercent(progress.percentComplete!)}% complete` : ''}`}
      data-module-id={progress.moduleId}
      data-route={progress.route}
      data-applicability={progress.applicability || 'workflow'}
    >
      <div className="wp-header">
        <div className="wp-title-area">
          <span className="crumb-code" title="Module Code">{progress.moduleId}</span>
          <div className="wp-heading-copy">
            <h3 className="wp-title">{progress.moduleName}</h3>
            <p className="wp-subtitle">{progress.currentSection}{progress.scopeLabel ? ` · ${progress.scopeLabel}` : ''}</p>
          </div>
        </div>

        <div className="wp-metrics-area">
          {hasMeasuredSteps ? (
            <div className="wp-bar-wrap">
              <div className="wp-bar-track" role="progressbar" aria-valuenow={progress.percentComplete!} aria-valuemin={0} aria-valuemax={100} aria-label={`${progress.moduleName} lifecycle steps complete`} aria-valuetext={`${progress.counts.completed} of ${progress.counts.total} applicable lifecycle steps complete`}>
                <div className="wp-bar-fill" style={{ width: `${progress.percentComplete}%`, background: progress.counts.blocked > 0 ? 'var(--st-orange-fg)' : 'var(--teal)' }} />
              </div>
              <span className="wp-percent-label">{formatPercent(progress.percentComplete!)}% · {progress.counts.completed}/{progress.counts.total} {progress.metricLabel}</span>
            </div>
          ) : (
            <span className={`wp-no-progress wp-no-progress-${progress.applicability || 'workflow'}`}>
              {progress.metricLabel || 'No completion measure applies'}
            </span>
          )}

          {isWorkflow && <div className="wp-counts-pill" aria-label="Lifecycle step counts">
            {countItems.map((item, index) => (
              <React.Fragment key={item.key}>
                {index > 0 && <span className="wp-count-sep" aria-hidden="true">·</span>}
                <span className={`wp-count-item text-${item.color}`}>
                  {item.icon && <StatusGlyph glyph={item.icon} />}{item.value} {item.label}
                </span>
              </React.Fragment>
            ))}
          </div>}

          <button
            type="button"
            className="btn ghost sm wp-toggle-btn"
            onClick={() => setDetailsOpen(prev => !prev)}
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
          >
            {detailsOpen ? 'Hide details' : 'Workflow details'}
          </button>
        </div>
      </div>

      {(progress.nextAction || progress.blockers.length > 0) && <div className="wp-action-strip">
        {progress.blockers.length > 0 && <div className="wp-immediate-blocker" role="status">
          <StatusGlyph glyph="stop" />
          <span><b>Needs attention:</b> {progress.blockers[0]}</span>
        </div>}
        <div className="wp-next-action">
          <b>Next action</b>
          <span>{progress.nextAction}</span>
          <span className="wp-actor">Who acts: {progress.whoActsNext}{progress.actorEligible === false ? ` · ${progress.actorEligibilityReason || 'This persona cannot perform that action.'}` : ''}</span>
        </div>
      </div>}

      {progress.steps.length > 0 && <nav aria-label={`${progress.moduleName} lifecycle steps`} className="wp-stepper-nav">
        <ol className="wp-stepper">
          {progress.steps.map(step => {
            const isClickable = Boolean(step.targetRoute || step.targetSection || step.targetRecordId);
            const content = <>
              <span className="wp-step-marker" aria-hidden="true"><StatusGlyph glyph={STEP_GLYPH[step.state]} /></span>
              <span className="wp-step-content">
                <span className="wp-step-label">{step.label}</span>
                <span className="wp-step-state">{STEP_TEXT[step.state]}</span>
                {step.detail && <span className="wp-step-sub">{step.detail}</span>}
              </span>
            </>;
            return <li key={step.id} className={`wp-step wp-step-${step.state} ${isClickable ? 'is-clickable' : ''}`}>
              {isClickable ? <button
                type="button"
                className="wp-step-button"
                data-target-route={step.targetRoute || ''}
                data-target-section={step.targetSection || ''}
                data-target-record-id={step.targetRecordId || ''}
                aria-current={step.state === 'current' ? 'step' : undefined}
                aria-label={`${step.label}: ${STEP_TEXT[step.state]}${step.detail ? `. ${step.detail}` : ''}`}
                onClick={() => handleStepClick(step)}
              >{content}</button> : <div className="wp-step-static" aria-current={step.state === 'current' ? 'step' : undefined}>{content}</div>}
            </li>;
          })}
        </ol>
      </nav>}

      <div className="wp-primary-answer">
        <b>{progress.applicability === 'unavailable' ? 'Context unavailable' : progress.applicability === 'reference' || progress.applicability === 'summary' ? 'View guidance' : 'Progress'}</b>
        <span>{progress.applicability === 'unavailable' ? progress.pendingSummary : hasMeasuredSteps ? progress.completedSummary : progress.metricLabel}</span>
      </div>

      {detailsOpen && <div id={detailsId} className="wp-answers-drawer" role="region" aria-label="Workflow status details">
        <div className="wp-answers-grid">
          <div className="wp-answer-card"><span className="wp-answer-q">Where am I?</span><p className="wp-answer-a"><b>{progress.moduleName}</b> · {progress.currentSection}{progress.scopeLabel ? ` · ${progress.scopeLabel}` : ''}</p></div>
          <div className="wp-answer-card"><span className="wp-answer-q">What is complete?</span><p className="wp-answer-a">{progress.completedSummary}</p></div>
          <div className="wp-answer-card"><span className="wp-answer-q">What is pending?</span><p className="wp-answer-a">{progress.pendingSummary}</p></div>
          <div className={`wp-answer-card ${progress.blockers.length > 0 ? 'has-blockers' : ''}`}>
            <span className="wp-answer-q">What is blocked?</span>
            {progress.blockers.length > 0 ? <ul className="wp-blocker-list">{progress.blockers.map((blocker, index) => <li key={`${index}-${blocker}`}><StatusGlyph glyph="stop" /> {blocker}</li>)}</ul> : <p className="wp-answer-a">No current workflow blockers.</p>}
          </div>
          <div className="wp-answer-card"><span className="wp-answer-q">What can I do next?</span><p className="wp-answer-a font-semibold">{progress.nextAction}</p></div>
          <div className="wp-answer-card"><span className="wp-answer-q">Who acts next?</span><p className="wp-answer-a font-semibold">{progress.whoActsNext}{progress.actorEligible === false ? ` · ${progress.actorEligibilityReason || 'This persona cannot perform that action.'}` : ''}</p></div>
          {progress.recordSummary && <div className="wp-answer-card wp-record-summary"><span className="wp-answer-q">Record snapshot</span><p className="wp-answer-a">{progress.recordSummary}</p></div>}
        </div>
      </div>}
    </section>
  );
};
