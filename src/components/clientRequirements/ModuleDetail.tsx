import React, { useState } from 'react';
import { ModuleGuideEntry } from '../../services/moduleGuideContent';
import { RouteKey } from '../../types';
import { canOpenRoute } from '../../services/guards';
import { prototypeStore } from '../../store/prototypeStore';
import { requestWalkthrough } from '../walkthrough/walkthroughModel';
import { guideVisibleToClient, MODULE_SLIDES, primaryRouteFor, slideNumber } from './moduleMap';

interface ModuleDetailProps {
  guide: ModuleGuideEntry;
  clientMode: boolean;
  defaultOpen?: boolean;
  onNavigate: (route: RouteKey) => void;
  onGoToSlide: (slideId: string) => void;
}

/** Client-facing deep dive for one module, drawn from the module guide (no second content store). */
export const ModuleDetail: React.FC<ModuleDetailProps> = ({ guide, clientMode, defaultOpen = false, onNavigate, onGoToSlide }) => {
  const [open, setOpen] = useState(defaultOpen);
  const state = prototypeStore.getSnapshot();
  const route = primaryRouteFor(guide);
  const canOpen = canOpenRoute(state.currentRole, route, true);
  const showSteps = !clientMode || guideVisibleToClient(guide);
  const panelId = `cr-mod-${guide.id}`;
  return (
    <section className="cr-moddetail" aria-label={`${guide.id} ${guide.name}`}>
      <button type="button" className="cr-moddetail-head" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
        <span><b>{guide.id}</b> · {guide.name}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div id={panelId} className="cr-moddetail-body">
          <h4>What it covers today</h4>
          <p className="sub">{guide.exists}</p>
          {showSteps ? (
            <>
              <h4 className="mt12">How you would see it</h4>
              <ol className="sub cr-steps">{guide.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
            </>
          ) : (
            <p className="sub mt12">This workspace is used by your engagement team; they can walk you through it during a session.</p>
          )}
          <h4 className="mt12">What you should see</h4>
          <p className="sub">{guide.outcome}</p>
          <h4 className="mt12">If something is denied or out of date</h4>
          <p className="sub">{guide.failure}</p>
          {!clientMode && (
            <>
              <h4 className="mt12">Prototype limits (presenter note)</h4>
              <p className="sub">{guide.limits}</p>
              <p className="caption mt8">People involved: {guide.personas} · Workspace: <code>{guide.route.replace(/`/g, '')}</code></p>
            </>
          )}
          <div className="row mt12" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn ghost sm" disabled={!canOpen} onClick={() => { onNavigate(route); requestWalkthrough(guide.id); }}>Start guided walkthrough</button>
            <button type="button" className="btn primary sm" disabled={!canOpen} onClick={() => onNavigate(route)} title={canOpen ? undefined : 'Your current role cannot open this workspace'}>Open this workspace</button>
            {(MODULE_SLIDES[guide.id] || []).map(slideId => (
              <button key={slideId} type="button" className="btn ghost sm" onClick={() => onGoToSlide(slideId)}>Requirement slide {String(slideNumber(slideId)).padStart(2, '0')}</button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
