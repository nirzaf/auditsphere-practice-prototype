// Consistent record history. Entries come from the local demo event log or a record's own
// history arrays; this is browser-local demo state, not a tamper-evident audit trail.
import React from 'react';
import { StatusGlyph } from './StatusBadge';
import { statusSemantic } from '../../services/statusSemantics';

export interface TimelineEntry {
  id?: string;
  /** What happened, e.g. "Returned for changes". */
  title: string;
  actor?: string;
  at?: string;
  revision?: string | number;
  reason?: string;
  /** "Draft → Approved" style transition, shown when known. */
  from?: string;
  to?: string;
}

const formatAt = (at?: string) => {
  if (!at) return '';
  const parsed = /^\d{4}-\d{2}-\d{2}T/.test(at) ? new Date(at) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : at;
};

export const ActivityTimeline: React.FC<{ entries: TimelineEntry[]; label: string; emptyText?: string; limit?: number }> = ({ entries, label, emptyText = 'No recorded history for this record yet.', limit }) => {
  const shown = limit ? entries.slice(0, limit) : entries;
  return (
    <div className="activity-timeline">
      <ol aria-label={label}>
        {shown.map((entry, index) => {
          const semantic = statusSemantic(entry.to || entry.title);
          return (
            <li key={entry.id || `${entry.title}-${index}`} className={`tl-item tone-${semantic.tone}`}>
              <span className="tl-dot"><StatusGlyph glyph={semantic.kind === 'neutral' ? 'dot' : semantic.glyph} /></span>
              <div className="tl-body">
                <div className="tl-title">{entry.title}{entry.from && entry.to && <span className="tl-transition"> · {entry.from} → {entry.to}</span>}</div>
                <div className="caption">{[entry.actor, formatAt(entry.at), entry.revision !== undefined && entry.revision !== '' ? `Rev ${entry.revision}` : ''].filter(Boolean).join(' · ')}</div>
                {entry.reason && <div className="tl-reason">“{entry.reason}”</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {!shown.length && <p className="sub">{emptyText}</p>}
      {limit && entries.length > limit && <p className="caption mt8">Showing the latest {limit} of {entries.length} entries.</p>}
      <p className="caption tl-disclaimer">Browser-local demo history — not a tamper-evident audit trail.</p>
    </div>
  );
};
