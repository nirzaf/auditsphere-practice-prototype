import React from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import type { ConfirmationStatus } from '../../types/targetLifecycle';
import { REQUIRED_CONFIRMATION_TYPES, type RequiredConfirmationType } from '../../types/targetLifecycle';
import { hasAnyRole, visibleEngagementIds } from '../../services/guards';
import { criticalConfirmationBlockers, isFrozen } from '../../services/targetLifecycle';
import { ActionButton, Field, TargetForm, value, type TargetViewProps } from './TargetCommon';
import { downloadVerifiedArtifact } from '../../services/artifactStore';

export function ConfirmationsView(props: TargetViewProps) {
  const state = prototypeStore.getReadSnapshot(),
    eng = state.engagements.find((e) => e.id === state.selectedEngagement);
  if (!eng) return null;
  const confirmations = (state.confirmations || []).filter((c) => c.engagementId === eng.id),
    blockers = criticalConfirmationBlockers(state, eng),
    documents = state.documents.filter(
      (d) =>
        d.engagementId === eng.id &&
        d.clientId === eng.client &&
        !d.brokenLink &&
        !state.documents.some((next) => next.supersedesDocumentId === d.id)
    );
  return (
    <div className="target-stack">
      <section className="panel panel-pad">
        <div className="flex-between">
          <div>
            <h2>External confirmations</h2>
            <p>
              {confirmations.length} tracked · {blockers.length} critical outstanding · requests and
              responses are simulated.
            </p>
          </div>
          <ActionButton
            disabled={
              !hasAnyRole(state, ['manager', 'partner']) || !blockers.length || isFrozen(eng)
            }
            action={async () =>
              downloadVerifiedArtifact(await prototypeStore.lifecycle.generateHoldingLetter(eng.id))
            }
          >
            Generate Pending Confirmation / Holding Letter
          </ActionButton>
        </div>
        {blockers.length > 0 && (
          <ul className="target-blockers">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
      </section>
      <TargetForm
        title="Track a new confirmation"
        formId="confirmation"
        button="Create confirmation"
        disabled={!hasAnyRole(state, ['preparer', 'manager', 'partner']) || isFrozen(eng)}
        onRegisterUnsavedForm={props.onRegisterUnsavedForm}
        onCommit={(data) =>
          prototypeStore.lifecycle.createConfirmation(eng.id, {
            type: value(data, 'type') as RequiredConfirmationType,
            counterparty: value(data, 'counterparty'),
            relatedFsli: value(data, 'fsli'),
            ownerUserId: value(data, 'owner'),
            dueAt: value(data, 'due'),
            critical: value(data, 'critical') === 'yes',
            workpaperIds: value(data, 'workpaper') ? [value(data, 'workpaper')] : []
          })
        }
      >
        <Field label="Type" name="type" defaultValue="Bank">
          {REQUIRED_CONFIRMATION_TYPES.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </Field>
        <Field label="Counterparty" name="counterparty" />
        <Field label="Related FSLI" name="fsli" defaultValue="Cash and cash equivalents" />
        <Field
          label="Owner"
          name="owner"
          defaultValue={state.users.find((u) => u.name === eng.manager)?.id || ''}
        >
          {state.users
            .filter(
              (u) =>
                u.status === 'Active' &&
                ['preparer', 'manager', 'reviewer', 'partner'].includes(u.role)
            )
            .filter((u) => {
              const visible = visibleEngagementIds(state, u.id);
              return visible === 'ALL' || visible.includes(eng.id);
            })
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </Field>
        <Field label="Due date" name="due" type="date" defaultValue={state.asOfDate} />
        <Field label="Critical for final reporting" name="critical" defaultValue="yes">
          <option value="yes">Yes — unresolved blocks release</option>
          <option value="no">No — tracked supporting matter</option>
        </Field>
        <Field label="Linked workpaper" name="workpaper" required={false}>
          <option value="">Not linked yet</option>
          {eng.workpapers.map((w) => (
            <option value={w.id} key={w.id}>
              {w.title}
            </option>
          ))}
        </Field>
      </TargetForm>
      {confirmations.map((c) => (
        <section className="panel panel-pad" key={c.id}>
          <div className="flex-between">
            <h3>
              {c.type} · {c.counterparty}{!(REQUIRED_CONFIRMATION_TYPES as readonly string[]).includes(c.type) && ' · Historical type'}
            </h3>
            <strong>
              {c.status} · {c.critical ? 'Critical' : 'Supporting'}
            </strong>
          </div>
          <p className="caption">
            {c.id} · {c.relatedFsli} · Owner {state.users.find((u) => u.id === c.ownerUserId)?.name}{' '}
            · Due {c.dueAt} · Requested {c.requestedAt || 'Not recorded'} · Received{' '}
            {c.receivedAt || 'Not recorded'}
          </p>
          <TargetForm
            title={`Update confirmation: ${c.counterparty}`}
            button="Record transition"
            disabled={isFrozen(eng) || !(REQUIRED_CONFIRMATION_TYPES as readonly string[]).includes(c.type)}
            onRegisterUnsavedForm={props.onRegisterUnsavedForm}
            onCommit={(data) =>
              prototypeStore.lifecycle.transitionConfirmationWithHandover(
                eng.id,
                c.id,
                value(data, 'status') as ConfirmationStatus,
                value(data, 'note'),
                value(data, 'evidence') ? [value(data, 'evidence')] : []
              )
            }
          >
            <Field label="Next status" name="status">
              <option value="">Choose next status</option>
              {[
                'Requested',
                'Awaiting',
                'Received',
                'Reviewed',
                'Cleared',
                'No Response',
                'Exception',
                'Cancelled'
              ].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </Field>
            <Field
              label="Response evidence (required when Received)"
              name="evidence"
              required={false}
            >
              <option value="">Choose same-engagement document</option>
              {documents.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name} · v{d.version}
                </option>
              ))}
            </Field>
            <Field label="Transition rationale" name="note" type="textarea" />
          </TargetForm>
          <details>
            <summary>Confirmation history · v{c.revision}</summary>
            {c.history.map((h, index) => (
              <p key={index}>
                {h.at} · {state.users.find((u) => u.id === h.actorUserId)?.name || h.actorUserId} ·{' '}
                {h.action}: {h.reason}
              </p>
            ))}
          </details>
        </section>
      ))}
    </div>
  );
}
