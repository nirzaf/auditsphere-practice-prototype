import React, { useEffect, useMemo, useState } from 'react';
import type { BusinessPbcEngagement, BusinessWorkflowProgress as WorkflowProgressData, BusinessWorkspacePreference } from '../../shared/api/business';
import { getBusinessPbcEngagements, getBusinessWorkflowProgress } from '../../services/businessWorkspace';

function labelStatus(status: WorkflowProgressData['stages'][number]['status']): string {
  if (status === 'completed') return 'Completed';
  if (status === 'current') return 'Current';
  if (status === 'pending') return 'Pending';
  if (status === 'blocked') return 'Blocked';
  if (status === 'rework') return 'Returned for rework';
  return 'Stale';
}

export function BusinessWorkflowProgress({
  selected,
  refreshKey
}: {
  selected: BusinessWorkspacePreference;
  refreshKey: number;
}) {
  const [engagements, setEngagements] = useState<BusinessPbcEngagement[]>([]);
  const [engagementId, setEngagementId] = useState(selected.engagementId ?? '');
  const [progress, setProgress] = useState<WorkflowProgressData | null>(null);
  const [loadingEngagements, setLoadingEngagements] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [error, setError] = useState('');
  const engagement = useMemo(() => engagements.find(item => item.id === engagementId) ?? null, [engagements, engagementId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingEngagements(true);
    setError('');
    const listScope = { ...selected };
    delete listScope.engagementId;
    getBusinessPbcEngagements(selected.workspaceId, listScope, controller.signal).then(items => {
      if (controller.signal.aborted) return;
      setEngagements(items);
      setEngagementId(current => items.some(item => item.id === current)
        ? current : items.find(item => item.id === selected.engagementId)?.id ?? items[0]?.id ?? '');
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Engagements could not be loaded.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingEngagements(false);
    });
    return () => controller.abort();
  }, [selected.workspaceId, selected.clientId, selected.engagementId, refreshKey]);

  useEffect(() => {
    if (!engagement) {
      setProgress(null);
      setLoadingProgress(false);
      return;
    }
    const controller = new AbortController();
    const scopedSelection = { ...selected, clientId: engagement.clientId, engagementId: engagement.id };
    setProgress(null);
    setLoadingProgress(true);
    setError('');
    getBusinessWorkflowProgress(selected.workspaceId, engagement.id, scopedSelection, controller.signal).then(result => {
      if (!controller.signal.aborted) setProgress(result);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Workflow progress could not be loaded.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingProgress(false);
    });
    return () => controller.abort();
  }, [selected.workspaceId, selected.clientId, engagement?.id, refreshKey]);

  return <section className="business-directory-card business-workflow-card" aria-labelledby="business-workflow-heading">
    <div className="business-section-heading">
      <div><p className="business-eyebrow">SERVER-PROJECTED · US-SYS-003</p><h2 id="business-workflow-heading">Engagement workflow</h2></div>
      {engagements.length > 0 && <label className="business-field business-workflow-select" htmlFor="business-workflow-engagement">
        <span>Engagement</span>
        <select id="business-workflow-engagement" value={engagementId} onChange={event => setEngagementId(event.target.value)}>
          {engagements.map(item => <option key={item.id} value={item.id}>{item.code} · {item.periodStart}–{item.periodEnd}</option>)}
        </select>
      </label>}
    </div>

    {loadingEngagements && <p className="business-muted" role="status">Loading engagement list…</p>}
    {!loadingEngagements && !engagements.length && <p className="business-muted">No permitted engagements are available to show.</p>}
    {error && <p className="business-alert" role="alert">{error}</p>}
    {engagement && loadingProgress && <p className="business-muted" role="status">Refreshing server workflow state…</p>}
    {engagement && progress && <>
      <p className="business-workflow-state">Current state: <strong>{progress.state.replaceAll('_', ' ')}</strong> · Source version {progress.sourceVersion}</p>
      <ol className="business-workflow-stages" aria-label="Engagement lifecycle progress">
        {progress.stages.map(stage => <li key={stage.id} data-status={stage.status}>
          <span className="business-workflow-stage-status">{labelStatus(stage.status)}</span>
          <strong>{stage.label}</strong>
          <small>{stage.completedCount} / {stage.requiredCount} lifecycle transition complete</small>
          {stage.status === 'current' && stage.blockerCoverage === 'module-detail' && <small>Open the stage module for its detailed readiness blockers.</small>}
          {stage.blockers.length > 0 && <ul className="business-workflow-blockers">
            {stage.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>
              <span>{blocker.description}</span>{blocker.route && <small>Resolve in {blocker.route.replaceAll('-', ' ')}</small>}
            </li>)}
          </ul>}
        </li>)}
      </ol>
    </>}
  </section>;
}
