import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole } from '../../services/guards';
import { isFrozen } from '../../services/targetLifecycle';
import { ArtifactLink, Field, TargetForm, value, type TargetViewProps } from './TargetCommon';

export function FreezeArchiveView(props: TargetViewProps) {
  const state = prototypeStore.getSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement);
  if (!eng) return null;
  const control = eng.auditLifecycle!.archiveControl,
    frozen = isFrozen(eng),
    asOf = control.asOfDate || state.asOfDate,
    remaining = control.freezeDueDate
      ? Math.max(0, Math.ceil((Date.parse(control.freezeDueDate) - Date.parse(asOf)) / 86400000))
      : null;
  return (
    <div className="target-stack">
      <section className="panel panel-pad">
        <h2>{frozen ? 'Frozen archive · read-only' : '60-day regulatory freeze simulation'}</h2>
        <dl className="target-totals">
          <dt>Final opinion / report date</dt>
          <dd>{control.finalReportDate || 'Not delivered'}</dd>
          <dt>Freeze due (+60 calendar days)</dt>
          <dd>{control.freezeDueDate || 'Not started'}</dd>
          <dt>Simulation as-of</dt>
          <dd>{asOf}</dd>
          <dt>Days remaining</dt>
          <dd>{remaining ?? 'Not started'}</dd>
          <dt>Status</dt>
          <dd>{control.freezeStatus}</dd>
        </dl>
        <p className="target-simulation">
          Browser-local read-only controls. No live SharePoint lock, legal retention enforcement, or
          regulatory compliance verification.
        </p>
      </section>
      {!frozen && (
        <TargetForm
          title="Advance the controlled archive clock"
          formId="freeze"
          button="Simulate countdown / freeze"
          disabled={!hasAnyRole(state, ['records', 'manager', 'partner'])}
          onRegisterUnsavedForm={props.onRegisterUnsavedForm}
          onCommit={(data) => prototypeStore.lifecycle.simulateFreeze(eng.id, value(data, 'asOf'))}
        >
          <Field
            label="Simulation as-of date"
            name="asOf"
            type="date"
            defaultValue={control.freezeDueDate || state.asOfDate}
          />
          <p className="caption">
            At the due date, exact final file bytes are copied and verified, then engagement
            mutations are rejected. Use a new scenario to rehearse again.
          </p>
        </TargetForm>
      )}
      {!frozen && hasAnyRole(state, ['partner']) && (
        <section className="panel panel-pad borderbox" style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}>
          <h4>Lead Partner Immediate Archival Seal (Early Lock Command)</h4>
          <p className="caption mt4">
            Under ISA 230 / STE policy, the Lead Audit Partner may execute an immediate manual freeze prior to the 60-day statutory expiry.
          </p>
          <button
            type="button"
            className="btn sm danger mt12"
            onClick={() => prototypeStore.lifecycle.simulateFreeze(eng.id, state.asOfDate, true)}
          >
            Execute Partner Early Archival Lock Now
          </button>
        </section>
      )}
      {frozen && (
        <section className="panel panel-pad" data-testid="frozen-archive">
          <h3>Frozen archive manifest</h3>
          <p>
            Frozen {control.frozenAt} by{' '}
            {state.users.find((u) => u.id === control.frozenByUserId)?.name}. Amendments require an
            explicit successor engagement.
          </p>
          {eng.archive?.manifest.map((item) => (
            <p key={item} className="target-digest">
              {item}
            </p>
          ))}
          <div className="target-buttons">
            {eng.archive?.artifacts?.map((a) => (
              <ArtifactLink key={a.id} artifact={a} />
            ))}
          </div>
        </section>
      )}
      <details className="panel panel-pad" open>
        <summary>Archive control history</summary>
        {control.history.map((h, index) => (
          <p key={index}>
            {h.at} · {h.action}: {h.reason}
          </p>
        ))}
      </details>
      <details className="panel panel-pad">
        <summary>Complete engagement event history · {eng.events.length}</summary>
        {eng.events.map((e, index) => (
          <p key={index}>
            {e.time} · {e.text}
          </p>
        ))}
      </details>
      <div className="target-buttons">
        <button className="btn" onClick={() => props.onNavigate('reports')}>
          Review practice analytics
        </button>
        <button className="btn" onClick={() => props.onNavigate('practice-ledger')}>
          Review firm ledger
        </button>
      </div>
    </div>
  );
}
