// WorkflowProgress component: visible enterprise progress tracker for all modules.
// Displays:
// 1. Current step progression (Setup ✓ → Preparation ✓ → Review ● → Approval ○)
// 2. Real percentage complete progress bar (e.g. "60% Complete") or "Reference view"
// 3. Reconciled counts (Completed X · Pending Y · Blocked Z)
// 4. Primary Next Action and Immediate Blocker visible in compact view (FIX-07)
// 5. Accessible native <button type="button"> step activation for keyboard (Enter/Space) & pointer
// 6. Six core enterprise answers drawer:
//    - Where am I?
//    - What is complete?
//    - What is pending?
//    - What is blocked?
//    - What can I do next?
//    - Who acts next?

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
  skipped: 'half',
  na: 'x'
};

const STEP_TEXT: Record<ProgressStepState, string> = {
  completed: 'Completed',
  current: 'Current step',
  pending: 'Pending',
  blocked: 'Blocked',
  returned: 'Returned for rework',
  stale: 'Stale (source changed)',
  skipped: 'Skipped',
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

  const hasPercent = progress.percentComplete !== null && progress.percentComplete !== undefined;

  return (
    <section
      className={`workflow-progress-panel ${className}`.trim()}
      aria-label={`${progress.moduleName} workflow progress: ${hasPercent ? `${progress.percentComplete}% complete` : 'Reference view'}`}
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
          <div className="wp-bar-wrap" title={hasPercent ? `${progress.percentComplete}% complete` : 'Reference view — no linear workflow applies'}>
            <div
              className="wp-bar-track"
              role="progressbar"
              aria-valuenow={hasPercent ? progress.percentComplete! : undefined}
              aria-valuemin={hasPercent ? 0 : undefined}
              aria-valuemax={hasPercent ? 100 : undefined}
              aria-label={hasPercent ? 'Module completion percentage' : 'Reference view — no completion percentage'}
            >
              <div
                className="wp-bar-fill"
                style={{
                  width: `${hasPercent ? Math.min(100, Math.max(0, progress.percentComplete!)) : 0}%`,
                  background: progress.counts.blocked > 0 ? 'var(--st-orange-fg)' : 'var(--teal)'
                }}
              />
            </div>
            <span className="wp-percent-label">{hasPercent ? `${progress.percentComplete}% Complete` : 'Reference view'}</span>
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
            {Boolean(progress.counts.stale && progress.counts.stale > 0) && (
              <>
                <span className="wp-count-sep">·</span>
                <span className="wp-count-item text-amber">
                  <StatusGlyph glyph="alert" /> {progress.counts.stale} Stale
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
      <div aria-label="Workflow steps" role="region" className="wp-stepper-nav">
        <ol className="wp-stepper">
          {progress.steps.map((step, idx) => {
            const isClickable = Boolean(onSelectStep || (step.targetRoute && onNavigate));
            const isCurrent = step.state === 'current' || (
              !progress.steps.some(s => s.state === 'current') && (
                idx === progress.steps.findIndex(s => s.state === 'returned' || s.state === 'blocked' || s.state === 'pending') ||
                (!progress.steps.some(s => s.state === 'returned' || s.state === 'blocked' || s.state === 'pending') && idx === progress.steps.length - 1)
              )
            );
            return (
              <li
                key={step.id || idx}
                className={`wp-step wp-step-${step.state} ${isClickable ? 'is-clickable' : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
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
                style={{
                  cursor: isClickable ? 'pointer' : 'default',
                  userSelect: 'none'
                }}
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
      </div>

      {/* Primary Next Action & Immediate Blocker Bar (Always visible in compact mode - FIX-07) */}
      <div className="wp-compact-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginTop: 10, padding: '8px 12px', background: '#f8faf9', borderRadius: 'var(--radius-sm)', border: '1px solid #eef2f1', fontSize: '12px' }}>
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="caption" style={{ fontWeight: 700, color: 'var(--ink)' }}>Next valid action:</span>
          <span style={{ color: 'var(--ink)' }}>{progress.nextAction}</span>
          <span className="caption text-muted">·</span>
          <span className="caption" style={{ color: 'var(--teal)', fontWeight: 600 }}>Action by: {progress.whoActsNext}</span>
        </div>
        {progress.blockers.length > 0 && (
          <div className="row" style={{ gap: 6, alignItems: 'center', color: 'var(--st-red-fg)', fontWeight: 600 }}>
            <StatusGlyph glyph="stop" />
            <span>Blocker: {progress.blockers[0]}</span>
          </div>
        )}
      </div>

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
