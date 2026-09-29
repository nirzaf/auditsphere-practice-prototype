import { MODULE_GUIDES, ModuleGuideEntry } from '../../services/moduleGuideContent';
import { RouteKey } from '../../types';
import { DECK_SLIDES } from './deckData';

/** Which slides set out each module's business requirement (the deck's coverage map). */
export const MODULE_SLIDES: Record<string, string[]> = {
  'MOD-01': ['s04'], 'MOD-02': ['s05'], 'MOD-03': ['s07'], 'MOD-04': ['s07', 's08'], 'MOD-05': ['s09'], 'MOD-06': ['s09'],
  'MOD-07': ['s09'], 'MOD-08': ['s06', 's28'], 'MOD-09': ['s11'], 'MOD-10': ['s28'], 'MOD-11': ['s10'], 'MOD-12': ['s25'],
  'MOD-13': ['s25'], 'MOD-14': ['s25'], 'MOD-15': ['s25'], 'MOD-16': ['s26'], 'MOD-17': ['s04'], 'MOD-18': ['s29'],
  'MOD-19': ['s06', 's28'], 'MOD-20': ['s08'], 'MOD-21': ['s12'], 'MOD-22': ['s14'], 'MOD-23': ['s13'], 'MOD-24': ['s15', 's16'],
  'MOD-25': ['s16'], 'MOD-26': ['s24'], 'MOD-27': ['s07'], 'MOD-28': ['s17'], 'MOD-29': ['s17'], 'MOD-30': ['s18'],
  'MOD-31': ['s18'], 'MOD-32': ['s19'], 'MOD-33': ['s11', 's18'], 'MOD-34': ['s19'], 'MOD-35': ['s21'], 'MOD-36': ['s21'],
  'MOD-37': ['s20', 's22'], 'MOD-38': ['s23'], 'MOD-39': ['s30'],
};

export const modulesForSlide = (slideId: string): ModuleGuideEntry[] =>
  MODULE_GUIDES.filter(guide => MODULE_SLIDES[guide.id]?.includes(slideId));

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
