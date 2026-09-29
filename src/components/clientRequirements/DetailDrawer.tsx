import React, { useEffect, useRef } from 'react';
import { MODULE_GUIDES } from '../../services/moduleGuideContent';
import { RouteKey } from '../../types';
import { DeckSlide } from './deckTypes';
import { ModuleDetail } from './ModuleDetail';
import { modulesForSlide } from './moduleMap';

interface DetailDrawerProps {
  slide: DeckSlide;
  /** When set, the drawer shows just this module (opened from the coverage map). */
  focusModuleId: string | null;
  clientMode: boolean;
  onClose: () => void;
  onNavigate: (route: RouteKey) => void;
  onGoToSlide: (slideId: string) => void;
  onClearFocus: () => void;
}

// A non-modal side panel: it must not carry role="dialog", which the app treats as an unsaved-form-guarded dialog.
export const DetailDrawer: React.FC<DetailDrawerProps> = ({ slide, focusModuleId, clientMode, onClose, onNavigate, onGoToSlide, onClearFocus }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, [focusModuleId]);
  const focused = focusModuleId ? MODULE_GUIDES.find(guide => guide.id === focusModuleId) : undefined;
  const modules = focused ? [focused] : modulesForSlide(slide.id);
  return (
    <aside className="cr-drawer" aria-label="Detail">
      <div className="between">
        <span className="eyebrow">{focused ? 'Module detail' : 'Explore this requirement'}</span>
        <button ref={closeRef} type="button" className="btn ghost sm" onClick={onClose}>Close</button>
      </div>
      {focused ? (
        <>
          <button type="button" className="btn ghost sm mt8" onClick={onClearFocus}>← Back to “{slide.title}”</button>
          <h3 className="mt12">{focused.name}</h3>
        </>
      ) : (
        <>
          <h3 className="mt8">{slide.title}</h3>
          <h4 className="mt12">What this means</h4>
          <p className="sub">{slide.note}</p>
          <h4 className="mt12">Confirm with your team</h4>
          <p className="sub">{slide.review}</p>
          {slide.boundary && (
            <div className="cr-boundary" role="note">
              <h4>Boundary to keep in mind</h4>
              <p className="sub">{slide.boundary}</p>
            </div>
          )}
          <h4 className="mt12">{modules.length ? `Modules behind this requirement (${modules.length})` : 'Modules'}</h4>
          {modules.length === 0 && <p className="sub">This slide sets out a principle that applies across the modules rather than a single one.</p>}
        </>
      )}
      <div className="stack" style={{ gap: 8, marginTop: 8 }}>
        {modules.map(guide => (
          <ModuleDetail key={guide.id} guide={guide} clientMode={clientMode} defaultOpen={Boolean(focused) || modules.length === 1} onNavigate={onNavigate} onGoToSlide={onGoToSlide} />
        ))}
      </div>
    </aside>
  );
};
