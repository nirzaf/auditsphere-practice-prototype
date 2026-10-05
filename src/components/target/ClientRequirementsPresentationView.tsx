import React, { useState, useEffect } from 'react';
import { DECK_SLIDES } from '../clientRequirements/deckData';
import { DECK_ICONS } from '../clientRequirements/deckIcons';
import type { DeckSlide, DeckCard, IconElement } from '../clientRequirements/deckTypes';
import type { TargetViewProps } from './TargetCommon';

export function ClientRequirementsPresentationView({ onNavigate }: TargetViewProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [followSteps, setFollowSteps] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showNotes, setShowNotes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const slide: DeckSlide = DECK_SLIDES[slideIndex] || DECK_SLIDES[0];

  const allCards: DeckCard[] = slide.groups
    ? slide.groups.flatMap(g => g.steps)
    : slide.steps || [];

  const maxSteps = allCards.length > 0 ? Math.max(...allCards.map(c => c.step)) : 0;

  // Reset step counter on slide change
  useEffect(() => {
    setCurrentStep(followSteps ? 1 : maxSteps);
  }, [slideIndex, followSteps, maxSteps]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        if (followSteps && currentStep < maxSteps) {
          setCurrentStep(s => s + 1);
        } else if (slideIndex < DECK_SLIDES.length - 1) {
          setSlideIndex(i => i + 1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        if (followSteps && currentStep > 1) {
          setCurrentStep(s => s - 1);
        } else if (slideIndex > 0) {
          setSlideIndex(i => i - 1);
        }
      } else if (e.key === 's' || e.key === 'S') {
        setFollowSteps(f => !f);
      } else if (e.key === 'n' || e.key === 'N') {
        setShowNotes(n => !n);
      } else if (e.key === 'f' || e.key === 'F') {
        setIsFullscreen(f => !f);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slideIndex, followSteps, currentStep, maxSteps]);

  const renderIcon = (iconKey?: string) => {
    if (!iconKey || !DECK_ICONS[iconKey]) return null;
    const elements: IconElement[] = DECK_ICONS[iconKey];

    return (
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        {elements.map((el, i) => {
          if (el.tag === 'path') return <path key={i} d={el.d} />;
          if (el.tag === 'circle') return <circle key={i} cx={el.cx} cy={el.cy} r={el.r} />;
          if (el.tag === 'rect') return <rect key={i} x={el.x} y={el.y} width={el.width} height={el.height} rx={el.rx} />;
          return null;
        })}
      </svg>
    );
  };

  const isCardVisible = (card: DeckCard) => {
    if (!followSteps) return true;
    return card.step <= currentStep;
  };

  return (
    <div className={`client-requirements-container ${isFullscreen ? 'fullscreen-mode' : ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      minHeight: '85vh',
      position: isFullscreen ? 'fixed' : 'relative',
      inset: isFullscreen ? 0 : undefined,
      zIndex: isFullscreen ? 9999 : undefined,
      background: isFullscreen ? '#0f172a' : 'transparent',
      padding: isFullscreen ? 24 : 0,
      overflow: isFullscreen ? 'auto' : undefined
    }}>
      {/* Top Controls Bar */}
      <div className="panel panel-pad flex-between" style={{ background: '#1e293b', color: '#f8fafc', borderRadius: 8, padding: '10px 16px', flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <span className="badge blue font-bold">STE v2.1 REQUIREMENTS DECK</span>
          <select
            className="input sm"
            value={slideIndex}
            onChange={e => setSlideIndex(Number(e.target.value))}
            style={{ minWidth: 280, background: '#0f172a', color: '#fff', borderColor: '#334155' }}
          >
            {DECK_SLIDES.map((s, idx) => (
              <option key={s.id} value={idx}>
                {String(idx + 1).padStart(2, '0')}. {s.title}
              </option>
            ))}
          </select>
          <span className="caption mono text-muted" style={{ color: '#94a3b8' }}>
            Slide {slideIndex + 1} of {DECK_SLIDES.length}
          </span>
        </div>

        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn sm ghost"
            style={{ color: '#fff', borderColor: '#334155' }}
            disabled={slideIndex === 0 && (!followSteps || currentStep === 1)}
            onClick={() => {
              if (followSteps && currentStep > 1) setCurrentStep(s => s - 1);
              else if (slideIndex > 0) setSlideIndex(i => i - 1);
            }}
          >
            ← Previous
          </button>

          <button
            type="button"
            className="btn sm ghost"
            style={{ color: '#fff', borderColor: '#334155' }}
            disabled={slideIndex === DECK_SLIDES.length - 1 && (!followSteps || currentStep === maxSteps)}
            onClick={() => {
              if (followSteps && currentStep < maxSteps) setCurrentStep(s => s + 1);
              else if (slideIndex < DECK_SLIDES.length - 1) setSlideIndex(i => i + 1);
            }}
          >
            Next →
          </button>

          <button
            type="button"
            className={`btn sm ${followSteps ? 'primary' : 'ghost'}`}
            style={!followSteps ? { color: '#fff', borderColor: '#334155' } : undefined}
            onClick={() => setFollowSteps(f => !f)}
            title="Step-by-step progressive reveal (S)"
          >
            {followSteps ? `Step ${currentStep}/${maxSteps}` : 'Follow Steps'}
          </button>

          <button
            type="button"
            className={`btn sm ${showNotes ? 'amber' : 'ghost'}`}
            style={!showNotes ? { color: '#fff', borderColor: '#334155' } : undefined}
            onClick={() => setShowNotes(n => !n)}
            title="Toggle CPA Discussion Notes (N)"
          >
            Discussion Notes {showNotes ? '▲' : '▼'}
          </button>

          <button
            type="button"
            className="btn sm ghost"
            style={{ color: '#fff', borderColor: '#334155' }}
            onClick={() => setIsFullscreen(f => !f)}
            title="Toggle Fullscreen (F)"
          >
            {isFullscreen ? 'Exit Fullscreen' : '⛶ Fullscreen'}
          </button>

          <a
            href="./Client_Requirements.html"
            target="_blank"
            rel="noopener noreferrer"
            className="btn sm ghost"
            style={{ color: '#38bdf8', borderColor: '#0284c7' }}
            title="Open standalone HTML presentation"
          >
            ↗ Standalone Deck
          </a>
        </div>
      </div>

      {/* Main Slide Stage (16:9 Aspect Ratio Container) */}
      <div
        className="slide-stage"
        style={{
          width: '100%',
          minHeight: '560px',
          background: '#FFFFFF',
          color: '#17212B',
          borderRadius: 10,
          boxShadow: '0 2px 8px #0F172A08',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '36px 44px',
          position: 'relative'
        }}
      >
        {/* Slide Header */}
        <div>
          <div className="flex-between mb12" style={{ alignItems: 'center' }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span
                style={{
                  background: slide.kind === 'cover' ? '#00796d' : '#e0f2fe',
                  color: slide.kind === 'cover' ? '#ffffff' : '#0284c7',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em'
                }}
              >
                {slide.tag || 'STE SPECIFICATION V2.1'}
              </span>
              <span className="caption" style={{ color: '#526176' }}>
                {slide.chapter} · {slide.section}
              </span>
            </div>
            <span className="mono font-bold" style={{ color: '#526176', fontSize: '13px' }}>
              {String(slideIndex + 1).padStart(2, '0')} / {String(DECK_SLIDES.length).padStart(2, '0')}
            </span>
          </div>

          <h1 style={{
            fontSize: 'clamp(1.5rem, 2.2vw, 1.9rem)',
            lineHeight: 1.2,
            margin: '8px 0 6px 0',
            color: '#17212B'
          }}>
            {slide.title}
          </h1>

          <p style={{
            fontSize: slide.kind === 'cover' ? '20px' : '16px',
            color: '#526176',
            margin: '0 0 24px 0'
          }}>
            {slide.subtitle}
          </p>
        </div>

        {/* Slide Body / Cards */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', margin: '16px 0' }}>
          {slide.groups ? (
            <div className="grid2" style={{ gap: 20 }}>
              {slide.groups.map((group, gIdx) => (
                <div key={gIdx} className="panel panel-pad" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#0369a1', fontSize: '14px', textTransform: 'uppercase' }}>
                    {group.label}
                  </h4>
                  <div className="stack" style={{ gap: 12 }}>
                    {group.steps.map((c, cIdx) => {
                      const visible = isCardVisible(c);
                      return (
                        <div
                          key={cIdx}
                          className="borderbox p12 bg-white"
                          style={{
                            borderRadius: 8,
                            border: c.dashed ? '2px dashed #94a3b8' : '1px solid #cbd5e1',
                            opacity: visible ? 1 : 0.2,
                            transition: 'opacity 0.25s ease'
                          }}
                        >
                          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                            <div style={{ color: '#00796d' }}>{renderIcon(c.icon)}</div>
                            <div style={{ flex: 1 }}>
                              <div className="flex-between">
                                <strong style={{ fontSize: '14px', color: '#0f172a' }}>{c.heading}</strong>
                                {c.tag && <span className="tag blue">{c.tag}</span>}
                              </div>
                              <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: '12.5px', color: '#475569' }}>
                                {c.body.map((b, bIdx) => (
                                  <li key={bIdx}>{b}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : slide.steps && slide.steps.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fit, minmax(${slide.steps.length > 4 ? '200px' : '240px'}, 1fr))`,
                gap: 14
              }}
            >
              {slide.steps.map((c, cIdx) => {
                const visible = isCardVisible(c);
                return (
                  <div
                    key={cIdx}
                    className="borderbox p14"
                    style={{
                      borderRadius: 10,
                      background: '#F8FAFC',
                      border: c.dashed ? '2px dashed #94a3b8' : '1px solid #E2E8F0',
                      opacity: visible ? 1 : 0.2,
                      transition: 'all 0.25s ease',
                      boxShadow: visible ? '0 4px 12px rgba(0,0,0,0.04)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div className="flex-between mb8" style={{ alignItems: 'center' }}>
                        <span className="caption mono font-bold" style={{ color: '#00796d' }}>
                          {c.tag || `STEP ${c.step}`}
                        </span>
                        <div style={{ color: '#0B6B65' }}>
                          {renderIcon(c.icon)}
                        </div>
                      </div>

                      <strong style={{ fontSize: '14px', display: 'block', marginBottom: 8, color: '#17212B' }}>
                        {c.heading}
                      </strong>

                      <ul style={{ margin: '0 0 0 16px', padding: 0, fontSize: '12px', color: '#526176', lineHeight: 1.5 }}>
                        {c.body.map((b, bIdx) => (
                          <li key={bIdx} style={{ marginBottom: 4 }}>{b}</li>
                        ))}
                      </ul>
                    </div>

                    {c.outcome && (
                      <div className="mt8 pt8 border-top" style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>
                        ✓ Final Stage Milestone
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p24 text-center" style={{ background: '#f8fafc', borderRadius: 8 }}>
              <p className="sub">Executive requirements introduction and conceptual architecture overview.</p>
            </div>
          )}
        </div>

        {/* Slide Band / Scope Footer */}
        {slide.band && (
          <div
            className="row p12"
            style={{
              background: '#EEF3F9',
              borderRadius: 8,
              borderLeft: '4px solid #0284c7',
              gap: 12,
              alignItems: 'center',
              marginTop: 16
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '11px', color: '#0284c7', textTransform: 'uppercase' }}>
              {slide.band[0]}
            </span>
            <span style={{ fontSize: '13px', color: '#2B6CB0' }}>
              {slide.band[1]}
            </span>
          </div>
        )}
      </div>

      {/* CPA Discussion Notes Modal / Drawer */}
      {showNotes && (
        <aside
          role="dialog"
          aria-modal="true"
          className="panel panel-pad"
          style={{
            background: '#ffffff',
            border: '2px solid #0284c7',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            padding: 24
          }}
        >
          <div className="flex-between mb12" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
            <div>
              <span className="caption font-bold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                CPA Discussion Notes &amp; Regulatory Alignment
              </span>
              <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', color: '#0f172a' }}>{slide.title}</h3>
            </div>
            <button type="button" className="btn sm ghost" onClick={() => setShowNotes(false)}>
              Close ✕
            </button>
          </div>

          <div className="grid3" style={{ gap: 20 }}>
            <div className="borderbox p14 bg-muted-subtle" style={{ borderRadius: 8 }}>
              <span className="caption font-bold" style={{ color: '#00796d', textTransform: 'uppercase' }}>
                1. Business Requirement (ISA / IFRS)
              </span>
              <p style={{ margin: '8px 0 0 0', fontSize: '13px', lineHeight: 1.6, color: '#1e293b' }}>
                {slide.note}
              </p>
            </div>

            <div className="borderbox p14" style={{ borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <span className="caption font-bold" style={{ color: '#166534', textTransform: 'uppercase' }}>
                2. CPA Review Point &amp; Verification
              </span>
              <p style={{ margin: '8px 0 0 0', fontSize: '13px', lineHeight: 1.6, color: '#14532d' }}>
                {slide.review}
              </p>
            </div>

            <div className="borderbox p14" style={{ borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
              <span className="caption font-bold" style={{ color: '#92400e', textTransform: 'uppercase' }}>
                3. Boundary &amp; Governance Guard
              </span>
              <p style={{ margin: '8px 0 0 0', fontSize: '13px', lineHeight: 1.6, color: '#78350f' }}>
                {slide.boundary || 'Ensure evidence cross-referencing and Partner approval are completed before transitioning to the next workflow state.'}
              </p>
            </div>
          </div>
        </aside>
      )}

      {/* Quick Jump Navigator to Core Modules */}
      <div className="panel panel-pad" style={{ background: '#f8fafc', borderRadius: 8 }}>
        <span className="caption font-bold mb8" style={{ display: 'block' }}>Quick Jump to v2.1 Functional Modules in Deck:</span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {DECK_SLIDES.map((s,i) => <button key={s.id} type="button" className="btn sm ghost" aria-current={i === slideIndex ? 'step' : undefined} onClick={() => setSlideIndex(i)}>{String(i+1).padStart(2,'0')}. {s.title}</button>)}
        </div>
      </div>
    </div>
  );
}
