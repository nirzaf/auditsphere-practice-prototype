import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  cloudWorkspaceSnapshot,
  subscribeCloudWorkspace,
  initializeCloudWorkspace,
  listSeeds,
  createWorkspace,
  resumeWorkspace,
  loadWorkspaceState,
  disconnectLocalProjection,
  cloudWorkspaceConnected,
  SYNCED_COMMAND_TYPES
} from '../../services/cloudWorkspace';

export function CloudWorkspaceLabel() {
  useSyncExternalStore(subscribeCloudWorkspace, cloudWorkspaceSnapshot);
  return <>{cloudWorkspaceConnected() ? 'CLOUD WORKSPACE' : 'LOCAL WORKSPACE'}</>;
}

export function CloudDemoControls({ visible, onBeforeContextChange }: { visible: boolean; onBeforeContextChange: (change: () => void) => void }) {
  const status = useSyncExternalStore(subscribeCloudWorkspace, cloudWorkspaceSnapshot);
  const [seeds, setSeeds] = useState<Array<{ id: string; title: string; description: string }>>([]);
  const [seed, setSeed] = useState('commercial'), [code, setCode] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void initializeCloudWorkspace(); }, []);
  useEffect(() => { if (visible) void listSeeds().then(setSeeds).catch(error => setError(error.message)); }, [visible]);
  if (!visible) return status.mode === 'conflict' || status.mode === 'offline'
    ? <p className="banner amber" role="alert">Cloud workspace sync is paused. Current work remains local. Open Presenter / Demo Controls to retry or reload the cloud revision.</p>
    : null;
  const run = async (operation: () => Promise<void> | void) => {
    setBusy(true); setError('');
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : 'Cloud workspace operation failed.'); }
    finally { setBusy(false); }
  };
  const replace = (operation: () => Promise<void>) => onBeforeContextChange(() => void run(operation));
  const create = async () => {
    const workspace = await createWorkspace(seed);
    setCode(workspace.accessCode);
  };
  return <section className="panel panel-pad mt12" data-testid="cloud-demo-controls">
    <h3>Cloud workspace</h3>
    <p className="caption">Synthetic data only. Each workspace lasts seven days on the prototype Worker. Saved client/lead changes and exact file bytes are stored server-side; edits outside the currently synced commands ({SYNCED_COMMAND_TYPES.join(', ')}) stay local to this browser until synced. Starting or resuming replaces the current local projection after unsaved forms are resolved.</p>
    <p role="status">{status.message}{status.revision ? ` · Revision ${status.revision}` : ''}</p>
    {error && <p className="banner amber" role="alert">{error}</p>}
    <fieldset disabled={busy || status.mode === 'loading'} style={{ border: 0, padding: 0 }}>
      <label className="caption">Synthetic starting point<select className="input" value={seed} onChange={event => setSeed(event.target.value)}>{seeds.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <p className="caption">{seeds.find(item => item.id === seed)?.description}</p>
      <button className="btn sm" disabled={!seeds.length} onClick={() => replace(create)}>Create cloud workspace</button>
      <label className="caption mt12" style={{ display: 'block' }}>Resume with workspace access code<input className="input" type="password" autoComplete="off" value={code} onChange={event => setCode(event.target.value)} /></label>
      <div className="row mt8" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn sm" disabled={!code} onClick={() => replace(() => resumeWorkspace(code))}>Resume workspace</button>
        {cloudWorkspaceConnected() && <>
          <button className="btn sm" onClick={() => replace(loadWorkspaceState)}>Reload cloud revision</button>
          <button className="btn sm" onClick={() => void run(disconnectLocalProjection)}>Keep local / disconnect</button>
        </>}
      </div>
    </fieldset>
    <p className="caption mt8">Anyone with the access code can resume this synthetic workspace. The running session uses a same-origin HttpOnly cookie; the code itself is only needed to enroll another browser. Persona switching is simulated; this is not production authentication or server-side audit approval.</p>
  </section>;
}
