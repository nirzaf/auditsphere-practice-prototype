import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { canOpenRoute, visibleEngagementIds } from '../../services/guards';
import { TARGET_STAGES, engagementProgress } from '../../services/targetLifecycle';
import type { TargetViewProps } from './TargetCommon';

export function LifecycleOverviewView({ onNavigate }: TargetViewProps) {
  const state = prototypeStore.getSnapshot(),
    visible = visibleEngagementIds(state),
    engagements = state.engagements.filter((e) => visible === 'ALL' || visible.includes(e.id));
  const selected = engagements.find((e) => e.id === state.selectedEngagement);
  const stages = selected
    ? engagementProgress(state, selected)
    : TARGET_STAGES.map((s) => ({ ...s, status: 'Not Started', blockers: [] as string[] }));
  return (
    <div className="target-overview">
      <div className="page-title">
        <div>
          <p className="caption">AUDIT ENGAGEMENT LIFECYCLE</p>
          <h1>From first lead to final archive</h1>
          <p className="sub">
            One engagement, current source records, explicit owners and controlled handoffs.
          </p>
        </div>
      </div>
      <div className="panel panel-pad target-intro">
        <div>
          <h2>
            {selected
              ? state.clients.find((c) => c.id === selected.client)?.name
              : 'Start with a synthetic lead'}
          </h2>
          <p>
            {selected
              ? `${selected.id} · ${selected.period}`
              : 'Create the lead, convert it to a prospect, accept its Proposal / EL, then create the draft audit engagement.'}
          </p>
        </div>
        <div className="target-buttons">
          <button
            className="btn primary"
            onClick={() => onNavigate(selected ? 'engagements' : 'acquisition')}
          >
            {selected ? 'Engagement details' : 'Create a lead'}
          </button>
          {canOpenRoute(state.currentRole, 'proposals') && (
            <button className="btn" onClick={() => onNavigate('proposals')}>
              Proposal & EL
            </button>
          )}
          {canOpenRoute(state.currentRole, 'engagements') && (
            <button className="btn" onClick={() => onNavigate('engagements')}>
              Engagement register
            </button>
          )}
        </div>
      </div>
      <p className="target-simulation">
        Browser-only prototype. M365, email, payments, portal passwords, signatures and regulatory
        freeze are simulations.
      </p>
      <ol
        className="target-stage-grid"
        aria-label="Canonical engagement lifecycle"
        data-testid="target-lifecycle-stages"
      >
        {stages.map((stage, index) => (
          <li
            key={stage.id}
            className={`target-stage ${stage.status.toLowerCase().replaceAll(' ', '-')}`}
          >
            <button
              onClick={() => onNavigate(stage.route)}
              disabled={!canOpenRoute(state.currentRole, stage.route)}
              aria-label={`${index + 1}. ${stage.label} — ${stage.status}`}
            >
              <span className="target-stage-number">{String(index + 1).padStart(2, '0')}</span>
              <span>
                <strong>{stage.label}</strong>
                <small>{stage.owner}</small>
              </span>
              <span className="target-stage-state">{stage.status}</span>
            </button>
            {stage.blockers.length > 0 && <p>{stage.blockers[0]}</p>}
          </li>
        ))}
      </ol>
      {engagements.length > 0 && (
        <section className="panel panel-pad">
          <h3>Engagements in your scope</h3>
          <div className="target-buttons">
            {engagements.map((e) => (
              <button
                className="btn"
                key={e.id}
                onClick={() => {
                  prototypeStore.setSelectedEngagement(e.id);
                  onNavigate('overview');
                }}
              >
                {state.clients.find((c) => c.id === e.client)?.name} · {e.year}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
