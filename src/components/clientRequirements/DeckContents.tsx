import React, { useMemo } from 'react';
import { DECK_SLIDES } from './deckData';

export const DeckContents: React.FC<{ index: number; onSelect: (index: number) => void }> = ({ index, onSelect }) => {
  const chapters = useMemo(() => {
    const result: Array<{ name: string; items: Array<{ slideIndex: number; title: string }> }> = [];
    DECK_SLIDES.forEach((slide, slideIndex) => {
      const last = result[result.length - 1];
      if (last && last.name === slide.chapter) last.items.push({ slideIndex, title: slide.title });
      else result.push({ name: slide.chapter, items: [{ slideIndex, title: slide.title }] });
    });
    return result;
  }, []);
  return (
    <nav className="cr-contents" aria-label="Presentation contents">
      {chapters.map(chapter => (
        <div key={chapter.name + chapter.items[0].slideIndex}>
          <p className="cr-chapter">{chapter.name}</p>
          <ul>
            {chapter.items.map(item => (
              <li key={item.slideIndex}>
                <button type="button" className={item.slideIndex === index ? 'active' : ''} aria-current={item.slideIndex === index ? 'true' : undefined} onClick={() => onSelect(item.slideIndex)}>
                  <span className="cr-num">{String(item.slideIndex + 1).padStart(2, '0')}</span> {item.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
};
