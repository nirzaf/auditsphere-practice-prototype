import React from 'react';
import { DECK_ICONS } from './deckIcons';

export const DeckIcon: React.FC<{ name?: string; size?: number }> = ({ name, size = 40 }) => {
  const elements = name ? DECK_ICONS[name] : undefined;
  if (!elements) return null;
  return (
    <svg className="cr-icon" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      {elements.map((el, index) => {
        const { tag, ...attrs } = el;
        return tag === 'path' ? <path key={index} {...attrs} /> : tag === 'circle' ? <circle key={index} {...attrs} /> : <rect key={index} {...attrs} />;
      })}
    </svg>
  );
};
