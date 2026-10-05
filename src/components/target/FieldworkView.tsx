import { hasAnyRole } from '../../services/guards';
import { isFrozen } from '../../services/targetLifecycle';
import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { ActionButton, Field, TargetForm, value, type TargetViewProps } from './TargetCommon';
import { AuditRisksProgramsView } from '../modules/AuditRisksProgramsView';
export function FieldworkView(props: TargetViewProps & { programId?: string }) {
  const state = prototypeStore.getReadSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement);
  if (!eng) return null;
  const programs = state.auditPrograms.filter((p) => p.engagementId === eng.id);
  return (
    <div className="target-stack">
      <section className="panel panel-pad">
        <h2>Audit programs & fieldwork</h2>
        <p>
          Prepare the six standard areas, including Analytical Review and Going Concern. Record
          actual work, evidence and conclusions before submitting workpapers.
        </p>
        <ActionButton
          disabled={
            Boolean(programs.length) || isFrozen(eng) || !hasAnyRole(state, ['manager', 'partner'])
          }
          action={() => prototypeStore.lifecycle.prepareStandardPrograms(eng.id)}
        >
          Prepare standard audit programs
        </ActionButton>
      </section>
      <TargetForm
        title="Insert an ad-hoc audit procedure"
        button="Insert procedure"
        disabled={isFrozen(eng) || !hasAnyRole(state, ['manager', 'preparer', 'partner'])}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={(d) =>
          prototypeStore.lifecycle.addAdHocProcedure(
            eng.id,
            value(d, 'program'),
            value(d, 'title'),
            value(d, 'instructions'),
            value(d, 'reason')
          )
        }
      >
        <Field label="Program" name="program">
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.area}
            </option>
          ))}
        </Field>
        <Field label="Procedure title" name="title" />
        <Field label="Instructions" name="instructions" type="textarea" />
        <Field label="Insertion rationale" name="reason" />
      </TargetForm>
      <fieldset disabled={isFrozen(eng)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <AuditRisksProgramsView
          key={props.programId}
          initialProgramId={props.programId}
          onNavigate={props.onNavigate}
          onRegisterUnsavedForm={props.onRegisterUnsavedForm || (() => {})}
        />
      </fieldset>
      <button className="btn" onClick={() => props.onNavigate('reviews')}>
        Open workpaper preparation & review
      </button>
    </div>
  );
}
