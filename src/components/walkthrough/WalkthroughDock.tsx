// Guided walkthrough: a small docked panel that walks through one module a step at a time.
// Non-modal on purpose (no role="dialog"): the person keeps using the workspace while following it.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { RouteKey } from '../../types';
import { MODULE_GUIDES } from '../../services/moduleGuideContent';
import { canOpenRoute } from '../../services/guards';
import { prototypeStore } from '../../store/prototypeStore';
import { guidesForRoute } from '../common/ModuleGuideStrip';
import { primaryRouteFor } from '../clientRequirements/moduleMap';
import { buildWalkthrough, clampPosition, lastPosition, requestWalkthrough, WALKTHROUGH_EVENT } from './walkthroughModel';
import './walkthrough.css';

interface WalkthroughDockProps {
  route: RouteKey;
  clientMode: boolean;
  onNavigate: (route: RouteKey, targetId?: string) => void;
}

const storageKey = (moduleId: string) => `ste-auditsphere-walkthrough-${moduleId}`;
const readPosition = (moduleId: string) => {
  try { return Number(sessionStorage.getItem(storageKey(moduleId))) || 0; } catch { return 0; }
};

export const WalkthroughDock: React.FC<WalkthroughDockProps> = ({ route, clientMode, onNavigate }) => {
  const routeGuides = useMemo(() => guidesForRoute(route), [route]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(0);

  const begin = useCallback((moduleId: string, startAt?: number) => {
    const guide = MODULE_GUIDES.find(entry => entry.id === moduleId);
    if (!guide) return;
    const walkthrough = buildWalkthrough(guide, clientMode);
    setActiveId(moduleId);
    setPosition(clampPosition(walkthrough, startAt ?? readPosition(moduleId)));
    setOpen(true);
  }, [clientMode]);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const moduleId = (event as CustomEvent<{ moduleId?: string }>).detail?.moduleId;
      if (moduleId) begin(moduleId, 0);
    };
    window.addEventListener(WALKTHROUGH_EVENT, onRequest);
    return () => window.removeEventListener(WALKTHROUGH_EVENT, onRequest);
  }, [begin]);
  useEffect(() => {
    if (!activeId) return;
    try { sessionStorage.setItem(storageKey(activeId), String(position)); } catch { /* progress is a convenience only */ }
  }, [activeId, position]);

  const active = activeId ? MODULE_GUIDES.find(entry => entry.id === activeId) : undefined;
  const pillGuide = routeGuides[0];
  if (!open) {
    // The launcher stays small and only appears where a module guide exists.
    const target = active && routeGuides.some(guide => guide.id === active.id) ? active : pillGuide;
    if (!target) return null;
    return (
      <button type="button" className="wt-pill" onClick={() => begin(target.id)} aria-label={`Start guided walkthrough for ${target.name}`}>
        <span aria-hidden="true">▶</span> Walkthrough
      </button>
    );
  }
  if (!active) return null;

  const walkthrough = buildWalkthrough(active, clientMode);
  const last = lastPosition(walkthrough);
  const state = prototypeStore.getSnapshot();
  const moduleRoute = primaryRouteFor(active);
  const onModuleRoute = routeGuides.some(guide => guide.id === active.id);
  const canOpen = canOpenRoute(state.currentRole, moduleRoute, true);
  const nextGuide = walkthrough.nextModuleId ? MODULE_GUIDES.find(entry => entry.id === walkthrough.nextModuleId) : undefined;
  const nextRoute = nextGuide ? primaryRouteFor(nextGuide) : undefined;
  const canOpenNext = nextRoute ? canOpenRoute(state.currentRole, nextRoute, true) : false;
  const step = position >= 1 && position <= walkthrough.steps.length ? walkthrough.steps[position - 1] : undefined;
  const goTo = (next: number) => setPosition(clampPosition(walkthrough, next));
  const close = () => setOpen(false);

  return (
    <aside className="wt-dock" aria-label={`Guided walkthrough: ${walkthrough.name}`}>
      <div className="wt-head">
        <span className="wt-title"><span className="wt-id">{walkthrough.id}</span> {walkthrough.name}</span>
        <button type="button" className="wt-x" onClick={close} aria-label="Minimise walkthrough">−</button>
      </div>
      {routeGuides.length > 1 && (
        <label className="wt-switch">
          <span className="caption">Module on this screen</span>
          <select value={active.id} onChange={event => begin(event.target.value, 0)}>
            {routeGuides.map(guide => <option key={guide.id} value={guide.id}>{guide.id} · {guide.name}</option>)}
          </select>
        </label>
      )}
      <div className="wt-dots" role="progressbar" aria-label="Walkthrough progress" aria-valuemin={0} aria-valuemax={last} aria-valuenow={position}>
        {Array.from({ length: last + 1 }, (_, index) => <span key={index} className={index <= position ? 'on' : ''} />)}
      </div>
      <div className="wt-body" aria-live="polite">
        {position === 0 && (
          <>
            <p className="wt-kicker">What this is for</p>
            <p>{walkthrough.purpose}</p>
            <p className="wt-meta">{walkthrough.stepsHidden ? 'Your engagement team walks you through this workspace.' : `${walkthrough.steps.length} short steps · about ${Math.max(1, Math.round(walkthrough.steps.length * 0.6))} min`}</p>
            {!onModuleRoute && <p className="wt-meta">Open the workspace first so you can follow along.</p>}
          </>
        )}
        {step && (
          <>
            <p className="wt-kicker">Step {position} of {walkthrough.steps.length}</p>
            <p className="wt-step">{step}</p>
          </>
        )}
        {position === last && (
          <>
            <p className="wt-kicker">What you should see</p>
            <p>{walkthrough.outcome}</p>
            <p className="wt-kicker">If something is blocked</p>
            <p>{walkthrough.failure}</p>
          </>
        )}
      </div>
      <div className="wt-actions">
        {(!onModuleRoute || position === 0) && (
          <button type="button" className="btn ghost sm" disabled={!canOpen} onClick={() => onNavigate(moduleRoute)} title={canOpen ? undefined : 'Your current role cannot open this workspace'}>
            {onModuleRoute ? 'Workspace open ✓' : 'Open workspace'}
          </button>
        )}
        <span className="wt-spacer" />
        <button type="button" className="btn ghost sm" onClick={() => goTo(position - 1)} disabled={position === 0}>Back</button>
        {position < last ? (
          <button type="button" className="btn primary sm" onClick={() => goTo(position + 1)}>{position === 0 ? (walkthrough.steps.length ? 'Start' : 'Summary') : position === last - 1 ? 'Finish' : 'Next'}</button>
        ) : (
          <>
            <button type="button" className="btn ghost sm" onClick={() => goTo(0)}>Replay</button>
            {nextGuide && (
              <button
                type="button"
                className="btn primary sm"
                disabled={!canOpenNext}
                title={canOpenNext ? undefined : 'Your current role cannot open the next workspace'}
                onClick={() => { if (nextRoute) onNavigate(nextRoute); requestWalkthrough(nextGuide.id); }}
              >
                Next: {nextGuide.name}
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
