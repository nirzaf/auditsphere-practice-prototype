// DEMO-001/DEMO-002: client-friendly module catalogue, contextual how-to guidance and
// a manual presenter itinerary. Guidance is distilled from the 39 module rehearsal
// guides in the client-demo task pack; there is no second requirements or status
// database and no scripted business approvals. Engineering acceptance labels stay
// presenter-only; client personas see capabilities and simulation honesty only.
import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { MODULE_GUIDES, ModuleGuideEntry } from '../../services/moduleGuideContent';
import { prototypeStore } from '../../store/prototypeStore';
import { isClientRole } from '../../services/guards';
import { Icon } from '../common/Icons';

interface ModuleCatalogueViewProps {
  onNavigate: (route: RouteKey, targetId?: string) => void;
  originRoute?: RouteKey;
}

// Presenter itinerary distilled from the client-demo playbook chapter table. Next/Back
// move the highlighted guidance only; opening a workspace always goes through the
// app's real navigation (and its unsaved-form guard).
const ITINERARY: Array<{ chapter: string; scenario: string; roles: string; modules: string; outcome: string }> = [
  { chapter: '1. Overview and client workspace', scenario: 'full-practice', roles: 'manager', modules: 'MOD-01 → MOD-02 → MOD-17', outcome: 'Scope-aware dashboard and linked client records.' },
  { chapter: '2. Acquire and start an engagement', scenario: 'full-practice', roles: 'relationship → compliance/onboarding → partner → client management', modules: 'MOD-03 → MOD-04 → MOD-27', outcome: 'Lead, proposal response and separate professional acceptance.' },
  { chapter: '3. Organize and collaborate', scenario: 'full-practice', roles: 'manager → preparer', modules: 'MOD-05 → MOD-06 → MOD-07 → MOD-11', outcome: 'Manual job/templates/tasks, internal discussion and local communications.' },
  { chapter: '4. Request and review information', scenario: 'full-practice', roles: 'preparer → client_finance → independent reviewer', modules: 'MOD-10 → MOD-09 → MOD-08 → MOD-33', outcome: 'One request thread, versioned response, reviewed evidence and scoped portal.' },
  { chapter: '5. Prepare client financial output', scenario: 'accounting-only', roles: 'preparer → reviewer → client management', modules: 'MOD-20 → MOD-21 → MOD-22 → MOD-23 → MOD-24 → MOD-25', outcome: 'Source import through reviewed genuine financial package; no client-ledger posting.' },
  { chapter: '6. Perform the audit', scenario: 'audit-findings', roles: 'permitted engagement team', modules: 'MOD-28 → MOD-29 → MOD-30 → MOD-31 → MOD-32 → MOD-34 → MOD-35 → MOD-36', outcome: 'Deliberate plan, linked risks/tests/evidence, exceptions and independent decisions.' },
  { chapter: '7. Release and keep records', scenario: 'blocked-rework then a completed fixture', roles: 'manager → partner → records', modules: 'MOD-37 → MOD-38', outcome: 'Visible blocker, lawful local rework, exact release and archive history.' },
  { chapter: "8. Run the firm's finances", scenario: 'full-practice', roles: 'preparer → manager/reviewer → billing', modules: 'MOD-12 → MOD-13 → MOD-14 → MOD-15 → MOD-16', outcome: 'Approved time, budget, issued demo invoice, offline receipt/aging/report.' },
  { chapter: '9. Show bounded group reporting', scenario: 'two-component-consolidation', roles: 'manager → independent partner', modules: 'MOD-26', outcome: 'Exact component pins, rate, elimination and reviewed JSON output.' },
  { chapter: '10. Administer the installation', scenario: 'full-practice', roles: 'admin, then permitted client/staff', modules: 'MOD-18 → MOD-19 → MOD-39', outcome: 'Simulated setup, separate identities/grants and prospective settings.' },
];

const ITINERARY_STORAGE_KEY = 'ste-auditsphere-presenter-itinerary';

const primaryRouteFor = (guide: ModuleGuideEntry): RouteKey => {
  const first = guide.route.replace(/`/g, '').split('→')[0].trim().split(' ')[0];
  const mapped: Record<string, RouteKey> = { 'client-detail': 'clients', 'crm': 'clients', 'Shell': 'clients', 'trial-balance': 'accounting-setup', 'requirements': 'requirements' };
  return (mapped[first] || (first as RouteKey) || 'overview');
};

export const ModuleCatalogueView: React.FC<ModuleCatalogueViewProps> = ({ onNavigate, originRoute }) => {
  const state = prototypeStore.getSnapshot();
  const clientMode = isClientRole(state.currentRole);
  const [selectedId, setSelectedId] = useState<string>('MOD-01');
  const [tourStep, setTourStep] = useState<number>(() => {
    if (typeof localStorage === 'undefined') return 0;
    const saved = Number(localStorage.getItem(ITINERARY_STORAGE_KEY));
    return Number.isInteger(saved) && saved >= 0 && saved < ITINERARY.length ? saved : 0;
  });

  const selected = MODULE_GUIDES.find(guide => guide.id === selectedId) || MODULE_GUIDES[0];
  const originGuide = MODULE_GUIDES.find(guide => guide.route.replace(/`/g, '').includes(originRoute || ''));
  const chapter = ITINERARY[tourStep];
  const chapterModules = chapter.modules.split('→').map(part => part.trim());

  const setStep = (next: number) => {
    const bounded = Math.max(0, Math.min(ITINERARY.length - 1, next));
    setTourStep(bounded);
    try { localStorage.setItem(ITINERARY_STORAGE_KEY, String(bounded)); } catch { /* presenter note only */ }
  };

  const guideVisibleToClient = (guide: ModuleGuideEntry) =>
    ['portal', 'client-detail', 'requirements', 'clients'].some(route => guide.route.replace(/`/g, '').includes(route));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Module Guide &amp; Presenter Tour</h1>
          <p>
            What each of the 39 AuditSphere workspaces does, who uses it, and how to walk through it.
            Everything below runs on synthetic browser-local data — no message, payment, signature or filing leaves this demo.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="badge amber" style={{ padding: '6px 12px', fontSize: 13 }}>39 Modules</span>
          <span className="badge amber" style={{ padding: '6px 12px', fontSize: 13 }}>Browser-local demo</span>
        </div>
      </div>

      {originRoute && originRoute !== 'module-guide' && (
        <div className="panel panel-pad" role="status" style={{ background: 'var(--action-tint)', borderLeft: '4px solid var(--action)' }}>
          <b>Context-sensitive guidance.</b>
          {originGuide ? <span> Opened from <b>{originGuide.id} — {originGuide.name}</b>; its entry is highlighted below.</span> : <span> Opened from your previous workspace.</span>}
          <span> Your selected client and engagement stay unchanged.</span>
          <div className="row mt8">
            <button className="btn sm ghost" onClick={() => onNavigate(originRoute)}>Back to the workspace</button>
            {originGuide && <button className="btn sm" onClick={() => setSelectedId(originGuide.id)}>Show this module's guide</button>}
          </div>
        </div>
      )}

      {!clientMode && (
        <section className="panel panel-pad" aria-label="Presenter itinerary">
          <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span className="eyebrow">PRESENTER ITINERARY (manual — nothing is scripted)</span>
              <h2 className="mt8" style={{ marginTop: 8 }}>{chapter.chapter}</h2>
              <p className="sub mt4">Preset: <b>{chapter.scenario}</b> (switch via the scenario chooser — the app confirms unsaved work first) · Roles in order: {chapter.roles}</p>
            </div>
            <span className="badge blue" style={{ padding: '6px 12px' }}>Step {tourStep + 1} of {ITINERARY.length}</span>
          </div>
          <div className="row mt12" style={{ gap: 8, flexWrap: 'wrap' }}>
            {chapterModules.map(moduleId => {
              const guide = MODULE_GUIDES.find(entry => entry.id === moduleId);
              return guide ? <button key={moduleId} className="btn sm ghost" onClick={() => setSelectedId(guide.id)}>{guide.id} {guide.name}</button> : null;
            })}
          </div>
          <p className="sub mt8"><b>Visible outcome:</b> {chapter.outcome}</p>
          <p className="sub mt4"><b>Checkpoint:</b> note this step number before closing the demo — the tour resumes here on this browser. Role changes stay explicit in the persona selector; the tour never performs an approval for you.</p>
          <div className="row mt12" style={{ gap: 8 }}>
            <button className="btn sm ghost" onClick={() => setStep(tourStep - 1)} disabled={tourStep === 0}>← Previous chapter</button>
            <button className="btn sm ghost" onClick={() => setStep(tourStep + 1)} disabled={tourStep === ITINERARY.length - 1}>Next chapter →</button>
            <button className="btn sm" onClick={() => onNavigate(primaryRouteFor(MODULE_GUIDES.find(entry => entry.id === chapterModules[0]) || selected))}>Open first workspace of this chapter</button>
          </div>
        </section>
      )}

      <div className="panel panel-pad">
        <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="eyebrow">MODULE CATALOGUE</span>
            <h2 style={{ marginTop: 8 }}>{selected.id} — {selected.name}</h2>
            <p className="sub mt4">Workspace: <code>{selected.route.replace(/`/g, '')}</code> · Typical order of people: {selected.personas} · Suggested starting preset: <code>{selected.scenario}</code></p>
          </div>
          <button className="btn primary sm" onClick={() => onNavigate(primaryRouteFor(selected))}>Open this workspace</button>
        </div>

        <div className="grid2 mt16">
          <section className="borderbox panel-pad">
            <h3>How to use this module</h3>
            {clientMode && !guideVisibleToClient(selected) ? (
              <p className="sub">This workspace is used by your engagement team. A guided walkthrough is available during a client session with them; your portal-visible modules show their full steps.</p>
            ) : (
              <ol className="sub" style={{ paddingLeft: 18, display: 'stack' }}>
                {selected.steps.map((step, index) => <li key={index} style={{ marginBottom: 6 }}>{step}</li>)}
              </ol>
            )}
          </section>
          <section className="borderbox panel-pad">
            <h3>What you should see</h3>
            <p className="sub">{selected.outcome}</p>
            <h3 className="mt12">If something is denied or stale</h3>
            <p className="sub">{selected.failure}</p>
            {!clientMode && (
              <>
                <h3 className="mt12">Intentional prototype limits</h3>
                <p className="sub">{selected.limits}</p>
              </>
            )}
          </section>
        </div>
        {!clientMode && <p className="caption mt8">Workspace component: <code>{selected.component}</code>. “Intentional prototype limits” are presenter notes on declared boundaries — they are hidden from client personas.</p>}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>All 39 modules</h3>
          <span className="caption">Select a module to load its guide above</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Module</th><th>Workspace</th><th>People involved</th><th>Starting preset</th><th>Action</th></tr>
            </thead>
            <tbody>
              {MODULE_GUIDES.map(guide => (
                <tr key={guide.id} style={guide.id === selected.id ? { background: 'var(--action-tint)' } : undefined}>
                  <td><b>{guide.id}</b> · {guide.name}</td>
                  <td><code>{guide.route.replace(/`/g, '')}</code></td>
                  <td className="sub">{guide.personas}</td>
                  <td><code>{guide.scenario}</code></td>
                  <td className="row" style={{ gap: 6 }}>
                    <button className="btn sm ghost" onClick={() => setSelectedId(guide.id)}>Guide</button>
                    <button className="btn sm" onClick={() => onNavigate(primaryRouteFor(guide))}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
