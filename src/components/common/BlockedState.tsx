// BlockedState component: explicit blocker presentation for gates and workflows.
// Answers: Why is this blocked? What is required next? Who acts next?

import React from 'react';
import { StatusGlyph } from './StatusBadge';

interface BlockedStateProps {
  title: string;
  reason: React.ReactNode;
  required: React.ReactNode;
  whoActs?: string;
  action?: React.ReactNode;
  className?: string;
}

export const BlockedState: React.FC<BlockedStateProps> = ({
  title,
  reason,
  required,
  whoActs,
  action,
  className = ''
}) => {
  return (
    <div className={`blocked-state-card ${className}`.trim()} role="alert" aria-label={`Blocked: ${title}`}>
      <div className="blocked-state-head">
        <span className="blocked-state-icon">
          <StatusGlyph glyph="stop" />
        </span>
        <div>
          <span className="caption text-red font-bold uppercase tracking-wider">Workflow Blocked</span>
          <h4 className="blocked-state-title">{title}</h4>
        </div>
      </div>

      <div className="blocked-state-grid">
        <div className="blocked-field">
          <label>Why is it blocked?</label>
          <div className="blocked-value">{reason}</div>
        </div>

        <div className="blocked-field">
          <label>What is required next?</label>
          <div className="blocked-value">{required}</div>
        </div>

        {whoActs && (
          <div className="blocked-field">
            <label>Who acts next?</label>
            <div className="blocked-value font-semibold text-teal">{whoActs}</div>
          </div>
        )}
      </div>

      {action && (
        <div className="blocked-state-actions mt8">
          {action}
        </div>
      )}
    </div>
  );
};
