import test from 'node:test';
import assert from 'node:assert/strict';
import { DECK_SLIDES } from '../../src/components/clientRequirements/deckData';
import { DECK_ICONS } from '../../src/components/clientRequirements/deckIcons';
import { MODULE_SLIDES } from '../../src/components/clientRequirements/moduleMap';
import { MODULE_GUIDES } from '../../src/services/moduleGuideContent';

test('every module guide is covered by at least one valid slide', () => {
  const ids = new Set(DECK_SLIDES.map(slide => slide.id));
  for (const guide of MODULE_GUIDES) {
    const slides = MODULE_SLIDES[guide.id];
    assert.ok(slides?.length, `${guide.id} has no requirement slide`);
    for (const slideId of slides) assert.ok(ids.has(slideId), `${guide.id} maps to unknown slide ${slideId}`);
  }
  assert.equal(Object.keys(MODULE_SLIDES).length, MODULE_GUIDES.length);
});

test('slide ids are unique and cards reference known icons with ascending steps', () => {
  assert.equal(new Set(DECK_SLIDES.map(slide => slide.id)).size, DECK_SLIDES.length);
  for (const slide of DECK_SLIDES) {
    const cards = slide.groups ? slide.groups.flatMap(group => group.steps) : slide.steps || [];
    if (slide.kind === 'flow') assert.ok(cards.length > 0, `${slide.id} has no cards`);
    let last = 0;
    for (const card of cards) {
      if (card.icon) assert.ok(DECK_ICONS[card.icon], `${slide.id} uses unknown icon ${card.icon}`);
      assert.ok(card.step >= last, `${slide.id} steps are out of order`);
      last = card.step;
    }
  }
});
