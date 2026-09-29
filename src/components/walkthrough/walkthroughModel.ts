// Turns a module guide (moduleGuideContent.ts) into a short, one-step-at-a-time walkthrough.
// Pure and content-free: every sentence shown comes from the existing guide, so there is no second
// source of truth to keep in sync.
import { MODULE_GUIDES, ModuleGuideEntry } from '../../services/moduleGuideContent';
import { guideVisibleToClient } from '../clientRequirements/moduleMap';

export interface Walkthrough {
  id: string;
  name: string;
  /** What the module is for, in the guide's own words. */
  purpose: string;
  steps: string[];
  outcome: string;
  failure: string;
  /** Client personas only see the steps of client-facing workspaces. */
  stepsHidden: boolean;
  nextModuleId: string | null;
}

export const WALKTHROUGH_EVENT = 'auditsphere:walkthrough';

const plain = (text: string) => text.replace(/`/g, '');

export function buildWalkthrough(guide: ModuleGuideEntry, clientMode: boolean): Walkthrough {
  const index = MODULE_GUIDES.findIndex(entry => entry.id === guide.id);
  const stepsHidden = clientMode && !guideVisibleToClient(guide);
  return {
    id: guide.id,
    name: guide.name,
    purpose: plain(guide.exists),
    steps: stepsHidden ? [] : guide.steps.map(plain),
    outcome: plain(guide.outcome),
    failure: plain(guide.failure),
    stepsHidden,
    nextModuleId: MODULE_GUIDES[index + 1]?.id ?? null,
  };
}

/** Screen positions: 0 = introduction, 1..n = steps, n+1 = summary. */
export const lastPosition = (walkthrough: Walkthrough) => walkthrough.steps.length + 1;

export const clampPosition = (walkthrough: Walkthrough, position: number) => Math.max(0, Math.min(lastPosition(walkthrough), Math.trunc(position) || 0));

export function requestWalkthrough(moduleId: string) {
  window.dispatchEvent(new CustomEvent(WALKTHROUGH_EVENT, { detail: { moduleId } }));
}
