// Client-facing business requirements presentation, built from typed slide data. Every slide can
// be explored: its discussion notes, the modules behind it (from the module guide) and a route
// into the real workspace. No second content store — module detail is read from moduleGuideContent.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { isClientRole } from '../../services/guards';
import { DECK_SLIDES } from '../clientRequirements/deckData';
import { DeckContents } from '../clientRequirements/DeckContents';
import { DetailDrawer } from '../clientRequirements/DetailDrawer';
import { SlideCover } from '../clientRequirements/SlideCover';
import { SlideCoverage } from '../clientRequirements/SlideCoverage';
import { SlideFlow } from '../clientRequirements/SlideFlow';
import { MODULE_SLIDES } from '../clientRequirements/moduleMap';
import '../clientRequirements/clientRequirements.css';

interface ClientRequirementsViewProps {
  onNavigate: (route: RouteKey, targetId?: string) => void;
  /** A slide id (s07) or module id (MOD-05) to open on arrival. */
  targetId?: string;
}

const STORAGE_KEY = 'ste-auditsphere-client-requirements-slide';
const stepsOf = (index: number) => {
  const slide = DECK_SLIDES[index];
  const cards = slide.groups ? slide.groups.flatMap(group => group.steps) : slide.steps || [];
  return cards.reduce((max, card) => Math.max(max, card.step), 0);
};
const lastIndex = DECK_SLIDES.length - 1;

const readInitial = (targetId?: string): { index: number; moduleId: string | null } => {
  if (targetId) {
    const bySlide = DECK_SLIDES.findIndex(slide => slide.id === targetId);
    if (bySlide >= 0) return { index: bySlide, moduleId: null };
    const first = MODULE_SLIDES[targetId]?.[0];
    if (first) return { index: DECK_SLIDES.findIndex(slide => slide.id === first), moduleId: targetId };
  }
  try {
    const saved = Number(sessionStorage.getItem(STORAGE_KEY));
    if (Number.isInteger(saved) && saved >= 0 && saved <= lastIndex) return { index: saved, moduleId: null };
  } catch { /* remembered position is a convenience only */ }
  return { index: 0, moduleId: null };
};

export const ClientRequirementsView: React.FC<ClientRequirementsViewProps> = ({ onNavigate, targetId }) => {
  const initial = useMemo(() => readInitial(targetId), [targetId]);
  const [index, setIndex] = useState(initial.index);
  const [follow, setFollow] = useState(false);
  const [followStep, setFollowStep] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(initial.moduleId !== null);
  const [focusModuleId, setFocusModuleId] = useState<string | null>(initial.moduleId);
  const deckRef = useRef<HTMLDivElement>(null);
  const [presenting, setPresenting] = useState(false);
  const clientMode = isClientRole(prototypeStore.getSnapshot().currentRole);
  const slide = DECK_SLIDES[index];
  const total = stepsOf(index);

  useEffect(() => {
    setIndex(initial.index);
    setFocusModuleId(initial.moduleId);
    setDrawerOpen(initial.moduleId !== null);
  }, [initial]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY, String(index)); } catch { /* ignore */ } }, [index]);

  const goTo = useCallback((next: number, atEnd = false) => {
    const bounded = Math.max(0, Math.min(lastIndex, next));
    setIndex(bounded);
    setFocusModuleId(null);
    setFollowStep(follow ? (atEnd ? stepsOf(bounded) : Math.min(1, stepsOf(bounded))) : stepsOf(bounded));
  }, [follow]);
  const goToSlideId = useCallback((slideId: string) => {
    const target = DECK_SLIDES.findIndex(entry => entry.id === slideId);
    if (target >= 0) goTo(target);
  }, [goTo]);
  const next = useCallback(() => {
    if (follow && followStep < total) setFollowStep(followStep + 1);
    else goTo(index + 1);
  }, [follow, followStep, total, index, goTo]);
  const prev = useCallback(() => {
    if (follow && followStep > 1) setFollowStep(followStep - 1);
    else goTo(index - 1, true);
  }, [follow, followStep, index, goTo]);
  const toggleFollow = () => {
    const enabled = !follow;
    setFollow(enabled);
    setFollowStep(enabled ? Math.min(1, total) : total);
  };
  // Presentation mode: real browser full screen when available, otherwise a fixed full-window layout.
  const startPresenting = useCallback(() => {
    setPresenting(true);
    try { void deckRef.current?.requestFullscreen?.().catch(() => undefined); } catch { /* fixed layout still applies */ }
  }, []);
  const stopPresenting = useCallback(() => {
    setPresenting(false);
    try { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    const onFullscreenChange = () => { if (!document.fullscreenElement) setPresenting(false); };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      try { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); } catch { /* ignore */ }
    };
  }, []);
  const openDetail = (moduleId: string | null = null) => { setFocusModuleId(moduleId); setDrawerOpen(true); };
  const closeDetail = () => { setDrawerOpen(false); setFocusModuleId(null); };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable || target.closest('[role="dialog"]'))) return;
      if (event.key === 'Escape') { if (drawerOpen) closeDetail(); else if (presenting) stopPresenting(); return; }
      if (target?.tagName === 'BUTTON' && (event.key === ' ' || event.key === 'Enter')) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); next(); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); prev(); }
      else if (event.key === 'PageDown') { event.preventDefault(); goTo(index + 1); }
      else if (event.key === 'PageUp') { event.preventDefault(); goTo(index - 1); }
      else if (event.key === 'Home') { event.preventDefault(); goTo(0); }
      else if (event.key === 'End') { event.preventDefault(); goTo(lastIndex); }
      else if (event.key.toLowerCase() === 's') toggleFollow();
      else if (event.key.toLowerCase() === 'f') (presenting ? stopPresenting() : startPresenting());
      else if (event.key.toLowerCase() === 'd') (drawerOpen ? closeDetail() : openDetail());
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const stepLabel = follow && total ? `Step ${followStep} of ${total}` : 'Complete view';
  const coverageIndex = DECK_SLIDES.findIndex(entry => entry.kind === 'coverage');

  return (
    <div className={`cr-deck${presenting ? ' cr-present' : ''}`} ref={deckRef}>
      <div className="pagehead">
        <div>
          <span className="eyebrow">CLIENT REVIEW</span>
          <h1>Client Requirements</h1>
          <p className="sub">Walk through the business requirements. Select any card, or “Explore detail”, to go deeper into the modules behind it.</p>
        </div>
        <span className="badge amber">Requirements view — not proof of live delivery</span>
      </div>
      <div className="cr-layout">
        <DeckContents index={index} onSelect={goTo} />
        <section className="cr-main" aria-label="Presentation">
          <div className="cr-progress" role="progressbar" aria-label="Presentation progress" aria-valuemin={1} aria-valuemax={DECK_SLIDES.length} aria-valuenow={index + 1}>
            <span style={{ width: `${((index + 1) / DECK_SLIDES.length) * 100}%` }} />
          </div>
          <article className="cr-stage" aria-live="polite" aria-labelledby="cr-slide-title">
            {slide.kind !== 'cover' && (
              <header className="cr-stage-head">
                <span className="cr-tag">{slide.tag}</span>
                <h2 id="cr-slide-title" className="cr-title">{slide.title}</h2>
                <p className="cr-subtitle">{slide.subtitle}</p>
              </header>
            )}
            {slide.kind === 'cover' && <h2 id="cr-slide-title" className="cr-sr">{slide.title}</h2>}
            {slide.kind === 'cover' && <SlideCover onStart={() => goTo(1)} onCoverage={() => goTo(coverageIndex)} />}
            {slide.kind === 'flow' && <SlideFlow slide={slide} followStep={follow ? followStep : null} onExplore={() => openDetail()} />}
            {slide.kind === 'coverage' && <SlideCoverage onOpenModule={openDetail} onGoToSlide={goToSlideId} />}
          </article>
          <div className="cr-toolbar">
            <button type="button" className="btn ghost sm" onClick={prev} disabled={index === 0 && (!follow || followStep <= 1)}>← Back</button>
            <span className="cr-counter">{index + 1} / {DECK_SLIDES.length}</span>
            <button type="button" className="btn ghost sm" onClick={next} disabled={index === lastIndex && (!follow || followStep >= total)}>Next →</button>
            <span className="cr-sep" />
            <button type="button" className="btn ghost sm" aria-pressed={follow} onClick={toggleFollow} disabled={total === 0}>{follow ? 'Show full view' : 'Follow steps'}</button>
            <span className="caption">{stepLabel}</span>
            <span className="cr-spacer" />
            <button type="button" className="btn ghost sm" aria-pressed={presenting} onClick={presenting ? stopPresenting : startPresenting}>{presenting ? 'Exit presentation' : 'Present full screen'}</button>
            <button type="button" className="btn primary sm" aria-expanded={drawerOpen} onClick={() => (drawerOpen ? closeDetail() : openDetail())}>{drawerOpen ? 'Hide detail' : 'Explore detail'}</button>
          </div>
          <p className="caption">Keys: ← → navigate · Page Up/Down slides · S follow steps · D detail · F full screen · Esc close</p>
        </section>
        {drawerOpen && (
          <DetailDrawer
            slide={slide}
            focusModuleId={focusModuleId}
            clientMode={clientMode}
            onClose={closeDetail}
            onNavigate={route => onNavigate(route)}
            onGoToSlide={goToSlideId}
            onClearFocus={() => setFocusModuleId(null)}
          />
        )}
      </div>
    </div>
  );
};
