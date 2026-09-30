import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { cloudDemoConfigured, cloudDemoSnapshot, subscribeCloudDemo, initializeCloudDemo, cloudDemoSeeds, startCloudDemo, resumeCloudDemo, reloadCloudDemo, saveCloudDemo, disconnectCloudDemo, cloudDemoAccessCode } from '../../services/cloudDemo';

export function CloudDemoLabel() {
  useSyncExternalStore(subscribeCloudDemo, cloudDemoSnapshot);
  return <>{cloudDemoAccessCode() ? 'CLOUD DEMO' : 'LOCAL DEMO'}</>;
}

export function CloudDemoControls({ visible, onBeforeContextChange }: { visible: boolean; onBeforeContextChange: (change: () => void) => void }) {
  const status = useSyncExternalStore(subscribeCloudDemo, cloudDemoSnapshot);
  const [seeds, setSeeds] = useState<Array<{ id: string; title: string; description: string }>>([]);
  const [seed, setSeed] = useState('commercial'), [code, setCode] = useState(''), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void initializeCloudDemo(); }, []);
  useEffect(() => { if (visible && cloudDemoConfigured()) void cloudDemoSeeds().then(setSeeds).catch(error => setError(error.message)); }, [visible]);
  if (!cloudDemoConfigured()) return null;
  if (!visible) return status.mode === 'conflict' || status.mode === 'offline'
    ? <p className="banner amber" role="alert">Cloud autosave is paused. Current work remains local. Open Presenter / Demo Controls to retry or resolve the cloud revision.</p>
    : null;
  const run = async (operation: () => Promise<void> | void) => {
    setBusy(true); setError('');
    try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : 'Cloud operation failed.'); }
    finally { setBusy(false); }
  };
  const replace = (operation: () => Promise<void>) => onBeforeContextChange(() => void run(operation));
  return <section className="panel panel-pad mt12" data-testid="cloud-demo-controls">
    <h3>Cloud demo workspace</h3>
    <p className="caption">Synthetic data only. Each workspace lasts seven days. Changes to saved records autosave. Uploaded and generated files remain in this browser. Starting or resuming replaces the current local demo after unsaved forms are resolved.</p>
    <p role="status">{status.message}{status.revision ? ` · Revision ${status.revision}` : ''}</p>
    {error && <p className="banner amber" role="alert">{error}</p>}
    <fieldset disabled={busy || status.mode === 'loading' || status.mode === 'saving'} style={{ border: 0, padding: 0 }}>
      <label className="caption">Synthetic starting point<select className="input" value={seed} onChange={event => setSeed(event.target.value)}>{seeds.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <p className="caption">{seeds.find(item => item.id === seed)?.description}</p>
      <button className="btn sm" disabled={!seeds.length} onClick={() => replace(() => startCloudDemo(seed))}>Start new cloud demo</button>
      <label className="caption mt12" style={{ display: 'block' }}>Resume with demo access code<input className="input" type="password" autoComplete="off" value={code} onChange={event => setCode(event.target.value)} /></label>
      <div className="row mt8" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn sm" disabled={!code} onClick={() => replace(() => resumeCloudDemo(code))}>Resume demo</button>
        {cloudDemoAccessCode() && <>
          <button className="btn sm" onClick={() => void run(() => navigator.clipboard.writeText(cloudDemoAccessCode()))}>Copy access code</button>
          <button className="btn sm" disabled={status.mode === 'conflict'} onClick={() => void run(saveCloudDemo)}>Save / retry</button>
          <button className="btn sm" onClick={() => replace(reloadCloudDemo)}>Reload cloud revision</button>
          <button className="btn sm" onClick={() => void run(disconnectCloudDemo)}>Keep local / disconnect</button>
        </>}
      </div>
    </fieldset>
    <p className="caption mt8">Anyone with the access code can edit this synthetic workspace. Persona switching is simulated; this is not production authentication or server-side audit approval.</p>
  </section>;
}
