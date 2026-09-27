// WorkflowProgress component: visible enterprise progress tracker for all modules.
// Displays:
// 1. Current step progression (Setup ✓ → Preparation ✓ → Review ● → Approval ○)
// 2. Real percentage complete progress bar (e.g. "60% Complete")
// 3. Reconciled counts (Completed X · Pending Y · Blocked Z)
// 4. Six core enterprise answers:
//    - Where am I?
//    - What is complete?
//    - What is pending?
//    - What is blocked?
//    - What can I do next?
//    - Who acts next?
// 5. Interactive step selection & responsive behavior.

import React, { useState } from 'react';
import type { ModuleWorkflowProgress, ProgressStepState, WorkflowStep } from '../../services/workflowProgress';
import { StatusGlyph } from './StatusBadge';
import type { RouteKey } from '../../types';

interface WorkflowProgressProps {
  progress: ModuleWorkflowProgress;
  onNavigate?: (route: RouteKey) => void;
  onSelectStep?: (step: WorkflowStep) => void;
  compact?: boolean;
  className?: string;
}

const STEP_GLYPH: Record<ProgressStepState, 'check' | 'dot' | 'undo' | 'stop' | 'alert' | 'x' | 'half'> = {
  completed: 'check',
  current: 'half',
  pending: 'dot',
  blocked: 'stop',
  returned: 'undo',
  stale: 'alert',
  na: 'x'
};

const STEP_TEXT: Record<ProgressStepState, string> = {
  completed: 'Completed',
  current: 'Current step',
  pending: 'Pending',
  blocked: 'Blocked',
  returned: 'Returned for rework',
  stale: 'Stale (source changed)',
  na: 'Not applicable'
};

export const WorkflowProgress: React.FC<WorkflowProgressProps> = ({
  progress,
  onNavigate,
  onSelectStep,
  compact = false,
  className = ''
}) => {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleStepClick = (step: WorkflowStep) => {
    if (onSelectStep) {
      onSelectStep(step);
    } else if (step.targetRoute && onNavigate) {
      onNavigate(step.targetRoute);
    }
  };

  return (
    <section
      className={`workflow-progress-panel ${className}`.trim()}
      aria-label={`${progress.moduleName} workflow progress: ${progress.percentComplete}% complete`}
      data-module-id={progress.moduleId}
    >
      {/* Top Header Bar */}
      <div className="wp-header">
        <div className="wp-title-area">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="crumb-code" title="Module Code">{progress.moduleId}</span>
            <h3 className="wp-title">{progress.moduleName}</h3>
            <span className="caption text-muted">· {progress.currentSection}</span>
          </div>
        </div>

        <div className="wp-metrics-area">
          <div className="wp-bar-wrap" title={`${progress.percentComplete}% complete`}>
            <div className="wp-bar-track" role="progressbar" aria-valuenow={progress.percentComplete} aria-valuemin={0} aria-valuemax={100} aria-label="Module completion percentage">
              <div
                className="wp-bar-fill"
                style={{
                  width: `${Math.min(100, Math.max(0, progress.percentComplete))}%`,
                  background: progress.counts.blocked > 0 ? 'var(--st-orange-fg)' : 'var(--teal)'
                }}
              />
            </div>
            <span className="wp-percent-label">{progress.percentComplete}% Complete</span>
          </div>

          <div className="wp-counts-pill">
            <span className="wp-count-item text-green">
              <StatusGlyph glyph="check" /> {progress.counts.completed} Done
            </span>
            <span className="wp-count-sep">·</span>
            <span className="wp-count-item text-muted">
              {progress.counts.pending} Pending
            </span>
            {progress.counts.blocked > 0 && (
              <>
                <span className="wp-count-sep">·</span>
                <span className="wp-count-item text-red">
                  <StatusGlyph glyph="stop" /> {progress.counts.blocked} Blocked
                </span>
              </>
            )}
            {Boolean(progress.counts.returned && progress.counts.returned > 0) && (
              <>
                <span className="wp-count-sep">·</span>
                <span className="wp-count-item text-amber">
                  <StatusGlyph glyph="undo" /> {progress.counts.returned} Rework
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            className="btn ghost sm wp-toggle-btn"
            onClick={() => setDetailsOpen(prev => !prev)}
            aria-expanded={detailsOpen}
            aria-controls={`wp-details-${progress.moduleId}`}
          >
            {detailsOpen ? 'Hide Answers' : 'Workflow Answers'}
          </button>
        </div>
      </div>

      {/* Stepper Row */}
      <nav aria-label="Workflow steps" className="wp-stepper-nav">
        <ol className="wp-stepper">
          {progress.steps.map((step, idx) => {
            const isClickable = Boolean(onSelectStep || (step.targetRoute && onNavigate));
            return (
              <li
                key={step.id || idx}
                className={`wp-step wp-step-${step.state} ${isClickable ? 'is-clickable' : ''}`}
                aria-current={step.state === 'current' ? 'step' : undefined}
                onClick={isClickable ? () => handleStepClick(step) : undefined}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={
                  isClickable
                    ? e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleStepClick(step);
                        }
                      }
                    : undefined
                }
              >
                <div className="wp-step-marker">
                  <StatusGlyph glyph={STEP_GLYPH[step.state]} />
                </div>
                <div className="wp-step-content">
                  <span className="wp-step-label">{step.label}</span>
                  <span className="sr-only">: {STEP_TEXT[step.state]}</span>
                  {step.detail && <span className="wp-step-sub">{step.detail}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Six Enterprise Questions Answers Drawer */}
      {detailsOpen && (
        <div id={`wp-details-${progress.moduleId}`} className="wp-answers-drawer" role="region" aria-label="Workflow status details">
          <div className="wp-answers-grid">
            <div className="wp-answer-card">
              <span className="wp-answer-q">Where am I?</span>
              <p className="wp-answer-a">
                <b>{progress.moduleName}</b> · {progress.currentSection}
              </p>
            </div>

            <div className="wp-answer-card">
              <span className="wp-answer-q">What is complete?</span>
              <p className="wp-answer-a text-green">
                {progress.completedSummary}
              </p>
            </div>

            <div className="wp-answer-card">
              <span className="wp-answer-q">What is pending?</span>
              <p className="wp-answer-a">
                {progress.pendingSummary}
              </p>
            </div>

            <div className={`wp-answer-card ${progress.blockers.length > 0 ? 'has-blockers' : ''}`}>
              <span className="wp-answer-q">What is blocked?</span>
              {progress.blockers.length > 0 ? (
                <ul className="wp-blocker-list">
                  {progress.blockers.map((b, i) => (
                    <li key={i}><StatusGlyph glyph="stop" /> {b}</li>
                  ))}
                </ul>
              ) : (
                <p className="wp-answer-a text-muted">No current workflow blockers.</p>
              )}
            </div>

            <div className="wp-answer-card">
              <span className="wp-answer-q">What can I do next?</span>
              <p className="wp-answer-a font-semibold">
                {progress.nextAction}
              </p>
            </div>

            <div className="wp-answer-card">
              <span className="wp-answer-q">Who acts next?</span>
              <p className="wp-answer-a font-semibold text-teal">
                {progress.whoActsNext}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
