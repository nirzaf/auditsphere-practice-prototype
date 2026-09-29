import React from 'react';
import { DeckCard } from './deckTypes';
import { DeckIcon } from './DeckIcon';

interface StepCardProps {
  card: DeckCard;
  index: number;
  total: number;
  /** Dimmed while "follow steps" has not reached this card yet. */
  future: boolean;
  onExplore: () => void;
}

export const StepCard: React.FC<StepCardProps> = ({ card, index, total, future, onExplore }) => (
  <li className={`cr-cardwrap${card.outcome ? ' outcome' : ''}${future ? ' future' : ''}`}>
    {index > 0 && !card.outcome && <span className="cr-arrow" aria-hidden="true">→</span>}
    <button
      type="button"
      className={`cr-card${card.dashed ? ' dashed' : ''}${card.outcome ? ' outcome' : ''}`}
      onClick={onExplore}
      aria-label={`${card.tag ? card.tag + ': ' : ''}${card.heading}. Step ${index + 1} of ${total}. Open detail.`}
    >
      {card.icon && <DeckIcon name={card.icon} />}
      <span className="cr-card-text">
        {card.tag && <span className="cr-card-tag">{card.tag}</span>}
        <span className="cr-card-head">{card.heading}</span>
        {card.body.length > 0 && (
          <span className="cr-card-body">{card.body.map((line, i) => <span key={i}>{line}</span>)}</span>
        )}
      </span>
      {!card.outcome && <span className="cr-card-more" aria-hidden="true">Explore ›</span>}
    </button>
  </li>
);
