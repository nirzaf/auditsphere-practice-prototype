import React, { lazy, Suspense, useState, useSyncExternalStore } from 'react';
import { BusinessWorkspaceConsole, BusinessWorkspaceSetupDialog } from './components/business/BusinessWorkspace';
import { businessWorkspaceSnapshot, subscribeBusinessWorkspace } from './services/businessWorkspace';

// The legacy prototype is a development/test harness only. Vite replaces DEV
// with a build-time constant and removes this import from production output.
const DevelopmentPrototypeApp = import.meta.env.DEV
  ? lazy(() => import('./PrototypeApp').then(module => ({ default: module.PrototypeApp })))
  : null;

function ProductionWorkspaceLanding() {
  const [setupOpen, setSetupOpen] = useState(false);

  return <>
    <main className="business-console business-production-landing">
      <header className="business-console-header">
        <div className="business-console-brand">
          <span className="business-brand-mark" aria-hidden="true">AS</span>
          <div><strong>AuditSphere</strong><span>Business workspace</span></div>
        </div>
      </header>
      <section className="business-overview-card" aria-labelledby="production-workspace-heading">
        <div className="business-overview-copy">
          <p className="business-eyebrow">SERVER-PERSISTED · QAR · ASIA/QATAR</p>
          <h1 id="production-workspace-heading">Open your business workspace</h1>
          <p>Create a workspace for real records or connect to an existing workspace. Business records and files are stored by the Worker; this browser keeps only your selected workspace and persona.</p>
          <p className="business-note">This operating profile uses self-selected personas in a trusted environment. Persona selection does not verify identity. Do not store confidential client information on an unrestricted public deployment.</p>
          <button type="button" className="btn primary" onClick={() => setSetupOpen(true)}>Create or connect workspace</button>
        </div>
      </section>
    </main>
    <BusinessWorkspaceSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
  </>;
}

export const App: React.FC = () => {
  const businessWorkspace = useSyncExternalStore(subscribeBusinessWorkspace, businessWorkspaceSnapshot);
  if (businessWorkspace) return <BusinessWorkspaceConsole />;

  if (DevelopmentPrototypeApp) {
    return <Suspense fallback={<main className="business-console" role="status">Loading development workspace…</main>}><DevelopmentPrototypeApp /></Suspense>;
  }

  return <ProductionWorkspaceLanding />;
};

export default App;
