// Shared status badge: visible text + glyph + tone, with the semantic meaning exposed to
// assistive technology. Never conveys state by colour alone.
import React from 'react';
import { StatusKind, StatusSemantic, STATUS_KINDS, statusSemantic } from '../../services/statusSemantics';

const GLYPHS: Record<StatusSemantic['glyph'], React.ReactNode> = {
  dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
  half: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>,
  up: <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="6 11 12 5 18 11" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  undo: <><polyline points="9 14 4 9 9 4" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  stop: <><circle cx="12" cy="12" r="9" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  checkcircle: <><circle cx="12" cy="12" r="9" /><polyline points="8 12 11 15 16 9" /></>,
  send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  box: <><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /></>,
  layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /></>,
  flask: <><path d="M9 3h6" /><path d="M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3" /></>
};

export const StatusGlyph: React.FC<{ glyph: StatusSemantic['glyph'] }> = ({ glyph }) => (
  <svg className="status-glyph" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{GLYPHS[glyph]}</svg>
);

interface StatusBadgeProps {
  /** Missing status renders a neutral em dash rather than an empty pill. */
  status: string | undefined;
  /** Override the inferred semantic kind when the module knows better (e.g. a derived gate). */
  kind?: StatusKind;
  /** Optional qualifier rendered after the status, e.g. a revision "v3". */
  detail?: string;
  className?: string;
  title?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, kind, detail, className = '', title }) => {
  if (!status) return <span className="status-badge tone-gray kind-neutral">—</span>;
  const semantic = kind ? STATUS_KINDS[kind] : statusSemantic(status);
  return (
    <span className={`status-badge tone-${semantic.tone} kind-${semantic.kind} ${className}`.trim()} data-status-kind={semantic.kind} title={title || semantic.meaning}>
      <StatusGlyph glyph={semantic.glyph} />
      <span>{status}{detail ? ` · ${detail}` : ''}</span>
    </span>
  );
};
