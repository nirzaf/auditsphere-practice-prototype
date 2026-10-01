import React, { useEffect, useId, useRef, useState } from 'react';
import type { GeneratedArtifactRecord, RouteKey } from '../../types';
import type { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { downloadVerifiedArtifact } from '../../services/artifactStore';
import { prototypeStore } from '../../store/prototypeStore';
import { engagementProgress, isFrozen, computeSystemState } from '../../services/targetLifecycle';
import { visibleEngagementIds } from '../../services/guards';

export interface TargetViewProps {
  onNavigate: (route: RouteKey, targetId?: string) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}
export function Field({
  label,
  name,
  defaultValue = '',
  type = 'text',
  required = true,
  children,
  placeholder,
  ...rest
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  required?: boolean;
  children?: React.ReactNode;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <label className="target-field" htmlFor={id}>
      <span>{label}</span>
      {children ? (
        <select id={id} name={name} defaultValue={defaultValue} required={required}>
          {children}
        </select>
      ) : type === 'textarea' ? (
        <textarea id={id} name={name} defaultValue={defaultValue} required={required} rows={3} placeholder={placeholder} />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          {...rest}
        />
      )}
    </label>
  );
}
export function TargetForm({
  title,
  children,
  onCommit,
  onRegisterUnsavedForm,
  disabled = false,
  button = 'Save',
  formId
}: {
  title: string;
  children: React.ReactNode;
  onCommit: (data: FormData) => unknown | Promise<unknown>;
  onRegisterUnsavedForm?: TargetViewProps['onRegisterUnsavedForm'];
  disabled?: boolean;
  button?: string;
  formId?: string;
}) {
  const dirty = useRef(false),
    form = useRef<HTMLFormElement>(null),
    id = useId();
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    const key = `target-form:${id}`;
    onRegisterUnsavedForm?.(
      {
        label: title,
        isDirty: () => dirty.current,
        save: () => {
          setMessage({
            text: 'Use this form’s explicit action before changing context.',
            error: true
          });
          return false;
        },
        discard: () => {
          form.current?.reset();
          dirty.current = false;
          setMessage(null);
        }
      },
      key
    );
    return () => onRegisterUnsavedForm?.(null, key);
  }, [id, title, onRegisterUnsavedForm]);
  return (
    <form
      ref={form}
      className="panel panel-pad target-form"
      data-target-form={formId}
      onInput={() => {
        dirty.current = true;
        setMessage(null);
      }}
      onChange={() => {
        dirty.current = true;
        setMessage(null);
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMessage(null);
        try {
          await onCommit(new FormData(e.currentTarget));
          dirty.current = false;
          setMessage({ text: 'Saved to this browser’s synthetic engagement.', error: false });
        } catch (error) {
          setMessage({ text: error instanceof Error ? error.message : String(error), error: true });
        } finally {
          setPending(false);
        }
      }}
    >
      <h3>{title}</h3>
      <fieldset disabled={pending || disabled}>
        <div className="target-fields">{children}</div>
        <button className="btn primary mt16" type="submit">
          {pending ? 'Saving…' : button}
        </button>
      </fieldset>
      {disabled && (
        <p className="caption mt8">
          This action is unavailable for the current role or engagement state.
        </p>
      )}
      {message && (
        <p
          className={`target-message ${message.error ? 'error' : 'success'}`}
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
export function ActionButton({
  children,
  action,
  disabled = false,
  testId
}: {
  children: React.ReactNode;
  action: () => unknown | Promise<unknown>;
  disabled?: boolean;
  testId?: string;
}) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  return (
    <span className="target-action">
      <button
        type="button"
        className="btn sm"
        data-testid={testId}
        disabled={disabled || pending}
        onClick={async () => {
          setPending(true);
          setMessage(null);
          try {
            await action();
            setMessage({ text: 'Recorded.', error: false });
          } catch (error) {
            setMessage({
              text: error instanceof Error ? error.message : String(error),
              error: true
            });
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? 'Working…' : children}
      </button>
      {message && (
        <span
          role={message.error ? 'alert' : 'status'}
          className={`target-message ${message.error ? 'error' : 'success'}`}
        >
          {message.text}
        </span>
      )}
    </span>
  );
}
export function ArtifactLink({ artifact }: { artifact: GeneratedArtifactRecord }) {
  return (
    <ActionButton action={() => downloadVerifiedArtifact(artifact)}>
      Download {artifact.name}
    </ActionButton>
  );
}
export const value = (data: FormData, key: string) => String(data.get(key) || '').trim();
export const amount = (data: FormData, key: string) => Number(value(data, key));
export function TargetLifecycleHeader({
  route,
  onNavigate
}: TargetViewProps & { route: RouteKey }) {
  const state = prototypeStore.getReadSnapshot(),
    allowed = visibleEngagementIds(state),
    engagement = state.engagements.find(
      (e) => e.id === state.selectedEngagement && (allowed === 'ALL' || allowed.includes(e.id))
    );
  if (!engagement) return null;
  const progress = engagementProgress(state, engagement),
    matches = progress.filter((s) => s.route === route || s.aliases?.includes(route)),
    stage =
      matches.find((s) => !['Completed', 'Frozen'].includes(s.status)) ||
      matches.at(-1) ||
      progress.find((s) => s.status === 'Current') ||
      progress.find((s) => s.status === 'Blocked') ||
      progress.at(-1)!;
  return (
    <section
      className="target-header panel panel-pad"
      aria-label="Engagement lifecycle context"
      data-testid="target-lifecycle-header"
    >
      <div className="flex-between">
        <div>
          <p className="caption">
            {state.clients.find((c) => c.id === engagement.client)?.name} · {engagement.period}
          </p>
          <h2>{route === 'delivery' && computeSystemState(state, engagement).state === 'PARTNER_APPROVAL' ? 'Partner Approval & Opinion' : stage.label}</h2>
          <p className="caption">
            {engagement.id} ·{' '}
            {isFrozen(engagement) ? 'Frozen · read-only' : engagement.lifecycleStatus || 'Active'} ·
            Acting: {state.currentPerson} ({state.currentRole})
          </p>
        </div>
        <button className="btn sm" onClick={() => onNavigate('overview')}>
          View lifecycle
        </button>
      </div>
      <div className="target-handoff">
        <span>Predecessor: {stage.predecessor || 'New lead'}</span>
        <span>
          Status: <strong>{stage.status}</strong>
        </span>
        <span>Next handoff: {stage.successor || 'Practice review'}</span>
      </div>
      {stage.blockers.length > 0 && (
        <details className="target-blockers" open>
          <summary>
            {stage.blockers.length} prerequisite{stage.blockers.length === 1 ? '' : 's'} · owner:{' '}
            {stage.owner}
          </summary>
          <ul>
            {stage.blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
      {stage.status === 'Needs Rework' && (
        <p role="status" className="target-message error">
          The source basis changed. Revisit the predecessor and record fresh review before
          continuing.
        </p>
      )}
    </section>
  );
}
