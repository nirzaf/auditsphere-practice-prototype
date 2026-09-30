// Quiet, opt-in walkthrough: a slim launcher above each module and a small docked card that
// never covers the page or blocks it. Nothing opens by itself; Esc or Close dismisses it.
import React, { useEffect, useState } from 'react';
import type { RouteKey } from '../../types';
import { walkthroughsForRoute, journeyForRoute, LIFECYCLE_STATES } from '../../services/walkthroughContent';

const KEY = 'ste-auditsphere-walkthrough-done';
const readDone = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const writeDone = (ids: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* convenience only */ } };

export const ModuleWalkthroughCard: React.FC<{ route: RouteKey }> = ({ route }) => {
  const tours = walkthroughsForRoute(route);
  const journey = journeyForRoute(route);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<string[]>(readDone);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!tours.length) return null;

  const flat = tours.flatMap(tour => tour.steps.map(step => ({ tour, step })));
  const current = flat[Math.min(index, flat.length - 1)];
  const last = index >= flat.length - 1;
  const finished = tours.every(tour => done.includes(tour.id));
  const finish = () => {
    const next = Array.from(new Set([...done, ...tours.map(tour => tour.id)]));
    setDone(next); writeDone(next); setOpen(false);
  };
  const start = () => { setIndex(0); setOpen(true); };

  return (
    <>
      <div className="walkthrough-bar" data-testid="walkthrough-launcher">
        <span className="small"><b>{tours[0].name}:</b> {tours[0].purpose}</span>
        <button type="button" className="btn sm ghost" onClick={start} aria-haspopup="dialog">
          {finished ? 'Replay walkthrough' : `Take the walkthrough · ${flat.length} steps`}
        </button>
      </div>
      {open && (
        <aside className="walkthrough-card" role="dialog" aria-label={`${current.tour.name} walkthrough`} data-testid="walkthrough-card">
          <div className="walkthrough-head">
            <span className="caption">{current.tour.name} · Step {index + 1} of {flat.length}</span>
            <button type="button" className="icon-btn" aria-label="Close walkthrough" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="walkthrough-dots" aria-hidden="true">
            {flat.map((_, i) => <span key={i} className={i === index ? 'on' : i < index ? 'past' : ''} />)}
          </div>
          {journey && journey.states.length > 0 && <p className="caption" data-testid="walkthrough-journey">{journey.specModule} · Stage {journey.states.map(state => `${LIFECYCLE_STATES.indexOf(state) + 1} of ${LIFECYCLE_STATES.length}`).join(' – ')} of the engagement journey ({journey.states.map(state => state.replace(/_/g, ' ').toLowerCase()).join(' → ')})</p>}
          <p className="walkthrough-title"><b>{current.step.title}</b></p>
          <p className="small"><b>Do:</b> {current.step.action}</p>
          <p className="small"><b>You will see:</b> {current.step.see}</p>
          {last && <p className="small walkthrough-result"><b>The outcome:</b> {current.tour.result}</p>}
          <div className="row walkthrough-actions">
            <button type="button" className="btn sm ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button>
            {last
              ? <button type="button" className="btn sm primary" onClick={finish}>Done</button>
              : <button type="button" className="btn sm primary" onClick={() => setIndex(index + 1)}>Next</button>}
          </div>
        </aside>
      )}
    </>
  );
};
