import { TARGET_GUIDES, currentGuideVisibleToClient } from '../../services/currentWorkflowGuides';
type ModuleGuideEntry = import('../../services/currentWorkflowGuides').CurrentWorkflowGuide;
import type { RouteKey } from '../../types';
import { DECK_SLIDES } from './deckData';

/** Which slides set out each module's business requirement (the deck's coverage map). */
export const MODULE_SLIDES: Record<string, string[]> = Object.fromEntries(TARGET_GUIDES.map(guide => [guide.id,
  /billing|engagement|acquisition|proposal/.test(guide.route) ? ['s06','s07'] : /documents|scheduling|trial-balance|planning|onboarding/.test(guide.route) ? ['s08','s09'] : /delivery|records/.test(guide.route) ? ['s12','s13'] : /reports|ledger/.test(guide.route) ? ['s14','s15'] : /portal/.test(guide.route) ? ['s16'] : ['s10','s11']
]));

export const modulesForSlide = (slideId: string): ModuleGuideEntry[] =>
  TARGET_GUIDES.filter(guide => MODULE_SLIDES[guide.id]?.includes(slideId));

export const slideNumber = (slideId: string) => DECK_SLIDES.findIndex(slide => slide.id === slideId) + 1;

/** Each guide already names exactly one current route. */
export const primaryRouteFor = (guide: Pick<ModuleGuideEntry,'route'>): RouteKey => guide.route;

/** Client visibility is owned by the current guide model. */
export const guideVisibleToClient = currentGuideVisibleToClient;
