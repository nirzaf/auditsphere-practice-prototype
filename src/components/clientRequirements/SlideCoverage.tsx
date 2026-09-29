import React, { useMemo, useState } from 'react';
import { MODULE_GUIDES } from '../../services/moduleGuideContent';
import { MODULE_SLIDES, slideNumber } from './moduleMap';

interface SlideCoverageProps { onOpenModule: (moduleId: string) => void; onGoToSlide: (slideId: string) => void }

export const SlideCoverage: React.FC<SlideCoverageProps> = ({ onOpenModule, onGoToSlide }) => {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MODULE_GUIDES.filter(guide => !q || `${guide.id} ${guide.name}`.toLowerCase().includes(q));
  }, [query]);
  return (
    <div className="cr-slide-body">
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <label className="caption" htmlFor="cr-module-filter">Find a module</label>
        <input id="cr-module-filter" className="cr-filter" type="search" value={query} placeholder="Name or MOD-number" onChange={event => setQuery(event.target.value)} />
        <span className="caption">{matches.length} of {MODULE_GUIDES.length} modules · select one to explore it</span>
      </div>
      <ul className="cr-modgrid">
        {matches.map(guide => (
          <li key={guide.id} className="cr-mod">
            <button type="button" className="cr-mod-main" onClick={() => onOpenModule(guide.id)}>
              <span className="cr-mod-id">{guide.id}</span>
              <span className="cr-mod-name">{guide.name}</span>
            </button>
            <span className="cr-mod-slides">
              {(MODULE_SLIDES[guide.id] || []).map(slideId => (
                <button key={slideId} type="button" className="cr-slidelink" onClick={() => onGoToSlide(slideId)} aria-label={`Go to slide ${slideNumber(slideId)}`}>{String(slideNumber(slideId)).padStart(2, '0')}</button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {matches.length === 0 && <p className="sub">No module matches “{query}”.</p>}
    </div>
  );
};
