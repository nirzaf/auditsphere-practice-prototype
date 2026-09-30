import { TARGET_GUIDES, ModuleGuideEntry } from '../../services/moduleGuideContent';
import { RouteKey } from '../../types';
import { DECK_SLIDES } from './deckData';

/** Which slides set out each module's business requirement (the deck's coverage map). */
export const MODULE_SLIDES: Record<string, string[]> = Object.fromEntries(TARGET_GUIDES.map(guide => [guide.id,
  /billing|engagement|acquisition|proposal/.test(guide.route) ? ['s06','s07'] : /documents|scheduling|trial-balance|planning|onboarding/.test(guide.route) ? ['s08','s09'] : /delivery|records/.test(guide.route) ? ['s12','s13'] : /reports|ledger/.test(guide.route) ? ['s14','s15'] : /portal/.test(guide.route) ? ['s16'] : ['s10','s11']
]));

export const modulesForSlide = (slideId: string): ModuleGuideEntry[] =>
  TARGET_GUIDES.filter(guide => MODULE_SLIDES[guide.id]?.includes(slideId));

export const slideNumber = (slideId: string) => DECK_SLIDES.findIndex(slide => slide.id === slideId) + 1;

/** First workspace named by a module guide's route, mapped to an app route. */
export const primaryRouteFor = (guide: ModuleGuideEntry): RouteKey => {
  const first = guide.route.replace(/`/g, '').split('→')[0].trim().split(' ')[0];
  const mapped: Record<string, RouteKey> = { 'client-detail': 'clients', crm: 'clients', Shell: 'clients', 'trial-balance': 'accounting-setup', requirements: 'requirements' };
  return mapped[first] || (first as RouteKey) || 'overview';
};

/** Same client-visibility rule the Module Guide uses: only portal/client-facing workspaces show full steps. */
export const guideVisibleToClient = (guide: ModuleGuideEntry) =>
  ['portal', 'client-detail', 'requirements', 'clients'].some(route => guide.route.replace(/`/g, '').includes(route));
