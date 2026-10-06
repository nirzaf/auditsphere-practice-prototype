import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole } from '../../services/guards';
import { currentReview, isFrozen, managerReviewBlockers } from '../../services/targetLifecycle';
import {
  ActionButton,
  ArtifactLink,
  Field,
  TargetForm,
  value,
  type TargetViewProps
} from './TargetCommon';

export function ReviewSRMView(props: TargetViewProps) {
  const [savingWorkpaperIds, setSavingWorkpaperIds] = React.useState<string[]>([]);
  const state = prototypeStore.getReadSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement);
  if (!eng) return null;
  const current = currentReview(state, eng),
    blockers = managerReviewBlockers(state, eng),
    frozen = isFrozen(eng),
    documents = state.documents.filter(
      (d) =>
        d.engagementId === eng.id &&
        !d.brokenLink &&
        !state.documents.some((next) => next.supersedesDocumentId === d.id)
    );
  return (
    <div className="target-stack">
      <section className="panel panel-pad">
        <h2>Preparer → Manager → SRM → Partner</h2>
        <div className="target-review-rail">
          <span>Workpapers & review points</span>
          <span>{current.manager ? 'Manager current' : 'Manager pending / stale'}</span>
          <span>{current.srm ? 'SRM current' : 'SRM pending / stale'}</span>
          <span>{current.partner ? 'Partner current' : 'Partner pending / stale'}</span>
        </div>
        <p className="caption">
          A material source change requires fresh clearance. EQR is not a mandatory gate in this
          target lifecycle.
        </p>
        {blockers.length > 0 && (
          <details className="target-blockers">
            <summary>Manager review prerequisites · {blockers.length}</summary>
            <ul>
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {eng.workpapers.filter(w => w.applicable).map((w) => (
        <section className="panel panel-pad" key={w.id}>
          <div className="flex-between">
            <h3>{w.title}</h3>
            <strong>
              v{w.version} · {w.status === 'Changes required' ? 'Under Rework' : w.status}
            </strong>
          </div>
          <p className="caption">
            Preparer: {w.preparer} · Reviewer: {w.reviewer} · Scope: {w.scope} · Evidence:{' '}
            {w.evidenceRefs?.join(', ') || 'Not linked'}
            {w.physicalReference ? ` · Physical: ${w.physicalReference.indexCode} (${w.physicalReference.description})` : ''}
          </p>
          {w.executionRiskLevel === 'RED' && (
            <p className="caption" role="status">
              <span className="tag red">RED-RISK FILE</span> Manager-executed work: the engagement
              Manager may not clear this workpaper; the assigned Partner reviewer ({w.reviewer})
              records its clearance, which is reproduced in the SRM Red-area evidence section.
            </p>
          )}
          <p className="caption">
            Evidence policy: Digital/Hybrid work needs current accepted digital documents;
            Physical-mode work is supported by the recorded X-1 physical index — one readiness
            policy per selected evidence mode.
          </p>
          <TargetForm
            title={`Link accepted evidence to ${w.id}`}
            button="Link evidence"
            disabled={!hasAnyRole(state, ['preparer', 'manager', 'reviewer', 'partner']) || frozen}
            onRegisterUnsavedForm={props.onRegisterUnsavedForm}
            onCommit={(data) =>
              prototypeStore.linkWorkpaperEvidence(eng.id, w.id, value(data, 'document'))
            }
          >
            <Field label="Evidence document" name="document">
              <option value="">Choose current accepted evidence</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · v{d.version}
                </option>
              ))}
            </Field>
          </TargetForm>
          <TargetForm
            title={`Prepare / revise ${w.id}`}
            formId="workpaper"
            button="Generate workpaper workbook revision"
            disabled={!hasAnyRole(state, ['preparer', 'manager']) || frozen}
            onRegisterUnsavedForm={props.onRegisterUnsavedForm}
            onCommit={async data => {
              setSavingWorkpaperIds(current => current.includes(w.id) ? current : [...current, w.id]);
              try {
                return await prototypeStore.lifecycle.saveFieldworkWorkbook(
                eng.id,
                w.id,
                value(data, 'scope'),
                value(data, 'work'),
                value(data, 'conclusion'),
                value(data, 'evidenceMode') as 'Digital' | 'Physical' | 'Hybrid'
                );
              } finally {
                setSavingWorkpaperIds(current => current.filter(id => id !== w.id));
              }
            }}
          >
            <Field label="Workpaper scope" name="scope" defaultValue={w.scope || eng.period} />
            <Field label="Workpaper evidence mode" name="evidenceMode" defaultValue={w.evidenceMode || (w.physicalReference ? (w.evidenceRefs?.length ? 'Hybrid' : 'Physical') : 'Digital')}>
              <option>Digital</option><option>Physical</option><option>Hybrid</option>
            </Field>
            <Field
              label="Work performed"
              name="work"
              type="textarea"
              defaultValue={w.workPerformed || ''}
            />
            <Field
              label="Workpaper conclusion"
              name="conclusion"
              type="textarea"
              defaultValue={w.conclusion}
            />
          </TargetForm>
          {w.generatedArtifact && <ArtifactLink artifact={w.generatedArtifact} />}
          <div className="target-buttons mt16">
            <ActionButton
              disabled={
                !hasAnyRole(state, ['preparer', 'manager']) ||
                frozen ||
                savingWorkpaperIds.includes(w.id) ||
                !w.workingPaper ||
                w.workingPaper.version !== w.version ||
                w.status === 'Submitted' ||
                w.status === 'Cleared'
              }
              action={() => prototypeStore.submitWorkpaper(eng.id, w.id)}
            >
              Mark ready for independent review
            </ActionButton>
            <ActionButton
              disabled={
                !hasAnyRole(state, ['manager', 'reviewer', 'partner']) ||
                frozen ||
                w.status !== 'Submitted'
              }
              action={() =>
                prototypeStore.clearWorkpaper(
                  eng.id,
                  w.id,
                  w.executionRiskLevel === 'RED'
                    ? 'Manager-executed RED work independently reviewed and cleared by the assigned Partner reviewer.'
                    : 'Current revision, evidence and conclusions independently reviewed.'
                )
              }
            >
              {w.executionRiskLevel === 'RED' ? 'Partner reviewer clears RED workpaper' : 'Clear current workpaper'}
            </ActionButton>
          </div>
          <TargetForm
            title={`Return a review point on ${w.id}`}
            formId="review-return"
            button="Manager returns point"
            disabled={
              !hasAnyRole(state, ['manager', 'reviewer', 'partner']) ||
              frozen ||
              !['Submitted', 'Cleared'].includes(w.status)
            }
            onRegisterUnsavedForm={props.onRegisterUnsavedForm}
            onCommit={(data) =>
              prototypeStore.addReviewNote(eng.id, {
                id: `RN-${crypto.randomUUID()}`,
                wp: w.id,
                title: value(data, 'title'),
                body: value(data, 'note'),
                severity: 'Medium',
                status: 'Open',
                raisedBy: state.currentPerson,
                assigned: w.preparer,
                due: state.asOfDate,
                response: '',
                version: 1,
                history: [
                  {
                    actor: state.currentPerson,
                    action: 'Returned to Preparer',
                    time: new Date().toISOString(),
                    text: value(data, 'note')
                  }
                ]
              })
            }
          >
            <Field label="Review point title" name="title" />
            <Field label="Return note" name="note" type="textarea" />
          </TargetForm>
        </section>
      ))}
      {eng.reviews.map((note) => (
        <section className="panel panel-pad" key={note.id}>
          <h3>
            {note.title} · {note.status}
          </h3>
          <p>{note.body}</p>
          <p className="caption">
            Assigned: {note.assigned} · Workpaper: {note.wp} · Response basis: v
            {note.subjectVersion ?? 'Not recorded'} · Client-bundle visibility:{' '}
            <strong>{note.externalVisibility || 'Internal only'}</strong> (internal review notes
            never enter the client correspondence bundle unless explicitly designated and cleared).
          </p>
          {(note.externalVisibility === 'Formal client correspondence' || note.status === 'Cleared') && hasAnyRole(state, ['manager', 'partner']) && !frozen && (
            <TargetForm
              title={`Client-correspondence designation: ${note.id}`}
              button={note.externalVisibility === 'Formal client correspondence' ? 'Withdraw from client bundle' : 'Designate as formal client correspondence'}
              disabled={frozen || !hasAnyRole(state, ['manager', 'partner']) || (note.externalVisibility !== 'Formal client correspondence' && note.status !== 'Cleared')}
              onRegisterUnsavedForm={props.onRegisterUnsavedForm}
              onCommit={(data) =>
                prototypeStore.designateReviewCorrespondence(
                  eng.id,
                  note.id,
                  note.externalVisibility !== 'Formal client correspondence',
                  value(data, 'reason')
                )
              }
            >
              <Field
                label={note.externalVisibility === 'Formal client correspondence' ? 'Withdrawal reason' : 'Designation reason (why this cleared query is formal management correspondence)'}
                name="reason"
                type="textarea"
              />
              {(note.correspondenceHistory || []).map((entry, index) => (
                <p className="caption" key={index}>{entry.at} · {entry.visibility} · {entry.reason}</p>
              ))}
            </TargetForm>
          )}
          <TargetForm
            title={`Preparer response: ${note.id}`}
            button="Record revised response"
            disabled={
              !hasAnyRole(state, ['preparer', 'manager', 'reviewer', 'partner']) ||
              frozen ||
              note.status === 'Cleared'
            }
            onRegisterUnsavedForm={props.onRegisterUnsavedForm}
            onCommit={(data) =>
              prototypeStore.respondReviewNote(eng.id, note.id, value(data, 'response'))
            }
          >
            <Field
              label="Response to review point"
              name="response"
              type="textarea"
              defaultValue={note.response}
            />
          </TargetForm>
          <ActionButton
            disabled={
              !hasAnyRole(state, ['manager', 'reviewer', 'partner']) ||
              frozen ||
              note.status !== 'Responded'
            }
            action={() => prototypeStore.clearReviewNote(eng.id, note.id)}
          >
            Independent clearance of review point
          </ActionButton>
          <details>
            <summary>Rework history</summary>
            {note.history.map((h, i) => (
              <p key={i}>
                {h.actor} · {h.action}: {h.text}
              </p>
            ))}
          </details>
        </section>
      ))}
      <TargetForm
        title="Manager engagement clearance"
        formId="manager-clearance"
        button="Clear current Manager review"
        disabled={!hasAnyRole(state, ['manager']) || frozen}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={async (data) => {
          const notes = value(data, 'notes');
          if (notes.trim().length < 20) throw new Error('Record a meaningful Manager recommendation of at least 20 characters.');
          if (!current.manager) prototypeStore.lifecycle.recordManagerClearance(eng.id, notes);
          try { await prototypeStore.lifecycle.generateSRM(eng.id, notes); }
          catch (error) { throw new Error(`Manager clearance saved; SRM pending. Retry Generate SRM. ${error instanceof Error ? error.message : ''}`); }
        }}
      >
        <Field label="Manager conclusion" name="notes" type="textarea" />
      </TargetForm>
      <TargetForm
        title="Summary Review Memorandum"
        formId="srm"
        button="Generate SRM"
        disabled={!hasAnyRole(state, ['manager']) || frozen || !current.manager}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={(data) =>
          prototypeStore.lifecycle.generateSRM(eng.id, value(data, 'recommendation'))
        }
      >
        <Field label="Manager recommendation" name="recommendation" type="textarea" />
      </TargetForm>
      {eng.auditLifecycle!.srms.map((srm) => (
        <details className="panel panel-pad" key={srm.artifact.id}>
          <summary>
            SRM v{srm.revision} · {srm.basis === current.basis ? 'Current' : 'Stale / historical'}
          </summary>
          <ArtifactLink artifact={srm.artifact} />
          {srm.summary
            .filter((l) => !l.startsWith('Source fingerprint'))
            .map((line, index) => (
              <p key={index}>{line}</p>
            ))}
        </details>
      ))}
      <TargetForm
        title="Engagement Partner clearance"
        formId="partner-clearance"
        button="Partner clears current SRM"
        disabled={!hasAnyRole(state, ['partner']) || frozen || !current.srm}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={(data) => prototypeStore.lifecycle.clearPartner(eng.id, value(data, 'notes'))}
      >
        <Field label="Partner clearance rationale" name="notes" type="textarea" />
      </TargetForm>
      <button className="btn" onClick={() => props.onNavigate('delivery')}>
        Next: opinion & final deliverables
      </button>
    </div>
  );
}
