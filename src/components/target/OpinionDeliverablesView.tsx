import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import type { AuditOpinion } from '../../types/targetLifecycle';
import { hasAnyRole } from '../../services/guards';
import {
  currentDeliverables,
  isFrozen,
  reportBasis,
  targetReleaseBlockers
} from '../../services/targetLifecycle';
import {
  ActionButton,
  ArtifactLink,
  Field,
  TargetForm,
  value,
  type TargetViewProps
} from './TargetCommon';

export function OpinionDeliverablesView(props: TargetViewProps) {
  const state = prototypeStore.getSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement);
  if (!eng) return null;
  const opinion = eng.auditLifecycle!.opinions.at(-1),
    set = currentDeliverables(state, eng),
    blockers = targetReleaseBlockers(state, eng),
    frozen = isFrozen(eng);
  return (
    <div className="target-stack">
      <section className="panel panel-pad">
        <h2>Opinion & final audit deliverables</h2>
        <p>
          Four opinion choices, controlled report revisions, and the ML / LOR / Audit Report
          package.
        </p>
        {blockers.length > 0 && (
          <div className="target-blockers" role="status">
            <h3>Release blockers</h3>
            <ul>
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <TargetForm
        title="Engagement Partner opinion"
        formId="opinion"
        button="Record opinion"
        disabled={!hasAnyRole(state, ['partner']) || frozen}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={(data) =>
          prototypeStore.lifecycle.selectOpinion(
            eng.id,
            value(data, 'opinion') as AuditOpinion,
            value(data, 'focus'),
            value(data, 'basis')
          )
        }
      >
        <Field label="Audit opinion" name="opinion" defaultValue={opinion?.value || 'Clean'}>
          {['Clean', 'Qualified', 'Disclaimer', 'Adverse'].map((o) => (
            <option key={o} value={o}>
              {o === 'Clean' ? 'Clean / Unmodified' : o}
            </option>
          ))}
        </Field>
        <Field
          label="Focus area (required for Qualified)"
          name="focus"
          required={false}
          defaultValue={opinion?.focusArea || ''}
        />
        <Field
          label="Basis for modified opinion (at least 20 characters)"
          name="basis"
          type="textarea"
          required={false}
          defaultValue={opinion?.basis || ''}
        />
      </TargetForm>
      {opinion && (
        <section className="panel panel-pad">
          <h3>
            {opinion.value} Opinion · revision {opinion.revision}
          </h3>
          {opinion.value !== 'Clean' && (
            <>
              <h4>Basis for {opinion.value} Opinion</h4>
              <p>{opinion.focusArea}</p>
              <p>{opinion.basis}</p>
            </>
          )}
          <p className="caption">
            Partner {state.users.find((u) => u.id === opinion.selectedByUserId)?.name} ·{' '}
            {opinion.selectedAt} · illustrative wording, no legal opinion.
          </p>
        </section>
      )}
      <TargetForm
        title="Generate final audit documents"
        formId="deliverables"
        button="Generate ML / LOR / Audit Report"
        disabled={!hasAnyRole(state, ['manager', 'partner']) || frozen || !opinion}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={(data) =>
          prototypeStore.lifecycle.generateDeliverables(eng.id, value(data, 'reportDate'))
        }
      >
        <Field
          label="Final opinion / report date"
          name="reportDate"
          type="date"
          defaultValue={state.asOfDate}
        />
        <p className="caption">
          The 60-day timer uses this date once current final delivery/sign-off is recorded.
          Generated versions remain downloadable in history.
        </p>
      </TargetForm>
      {eng.auditLifecycle!.deliverables.map((d) => (
        <section className="panel panel-pad" key={d.id}>
          <h3>
            Final audit set v{d.revision} ·{' '}
            {d.basis === reportBasis(state, eng) && set ? 'Current' : 'Stale / historical'}
          </h3>
          <p className="caption">
            Report date {d.reportDate} · opinion v{d.opinionRevision} · generated {d.generatedAt} ·{' '}
            {d.deliveredAt
              ? `Delivery/sign-off simulated ${d.deliveredAt}`
              : 'Delivery not recorded'}
          </p>
          <div className="target-buttons">
            {d.artifacts.map((a) => (
              <ArtifactLink key={a.id} artifact={a} />
            ))}
          </div>
        </section>
      ))}
      <TargetForm
        title="Record final delivery / sign-off simulation"
        formId="delivery"
        button="Record final delivery / sign-off"
        disabled={!hasAnyRole(state, ['manager', 'partner']) || frozen || !set || !!set.deliveredAt}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={(data) =>
          prototypeStore.lifecycle.markDeliverablesDelivered(eng.id, value(data, 'note'))
        }
      >
        <Field label="Manual delivery / sign-off note" name="note" type="textarea" />
        <p className="target-simulation">
          No email is sent. Signatures are document previews, not legal electronic signatures.
        </p>
      </TargetForm>
      <button className="btn" onClick={() => props.onNavigate('billing')}>
        Next: final balance invoice
      </button>
    </div>
  );
}
