import React from 'react';
import { DeckCard, DeckSlide } from './deckTypes';
import { StepCard } from './StepCard';

interface SlideFlowProps {
  slide: DeckSlide;
  /** Highest step revealed in follow mode; null shows the complete slide. */
  followStep: number | null;
  onExplore: () => void;
}

export const SlideFlow: React.FC<SlideFlowProps> = ({ slide, followStep, onExplore }) => {
  const groups = slide.groups || [{ label: '', steps: slide.steps || [] }];
  const renderCards = (cards: DeckCard[]) => (
    <ol className={`cr-flow cols-${Math.min(cards.filter(c => !c.outcome).length, 4)}`}>
      {cards.map((card, index) => (
        <StepCard key={index} card={card} index={index} total={cards.length} future={followStep !== null && card.step > followStep} onExplore={onExplore} />
      ))}
    </ol>
  );
  return (
    <div className="cr-slide-body">
      {groups.map((group, index) => (
        <section key={index} className="cr-group" aria-label={group.label || undefined}>
          {group.label && <h3 className="cr-group-label">{group.label}</h3>}
          {renderCards(group.steps)}
        </section>
      ))}
      {slide.band && (
        <div className="cr-band" role="note">
          <span className="cr-band-label">{slide.band[0]}</span>
          <span className="cr-band-text">{slide.band[1]}</span>
        </div>
      )}
    </div>
  );
};
