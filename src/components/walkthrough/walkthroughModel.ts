// Turns the current route guide into a short, one-step-at-a-time walkthrough.
// The current workflow guide is the single content source for guide strips, the
// requirements crosswalk and walkthroughs; no historical module list is consulted.
import { CURRENT_WORKFLOW_ORDER, TARGET_GUIDES, currentGuideVisibleToClient, type CurrentWorkflowGuide } from '../../services/currentWorkflowGuides';
import type { RouteKey } from '../../types';

export interface Walkthrough {
  id: string;
  route: RouteKey;
  name: string;
  /** What the current route is for, in the shared guide's own words. */
  purpose: string;
  steps: string[];
  outcome: string;
  failure: string;
  /** Client personas only see the steps of explicitly client-facing workspaces. */
  stepsHidden: boolean;
  nextRoute: RouteKey | null;
}

export type ModuleGuideEntry = CurrentWorkflowGuide;

export const WALKTHROUGH_EVENT = 'auditsphere:walkthrough';

const plain = (text: string) => text.replace(/`/g, '');

export function buildWalkthrough(guide: CurrentWorkflowGuide, clientMode: boolean): Walkthrough {
  const index = CURRENT_WORKFLOW_ORDER.indexOf(guide.route);
  const stepsHidden = clientMode && !currentGuideVisibleToClient(guide);
  return {
    id: guide.id,
    route: guide.route,
    name: guide.name,
    purpose: plain(guide.exists),
    steps: stepsHidden ? [] : guide.steps.map(plain),
    outcome: plain(guide.outcome),
    failure: plain(guide.failure),
    stepsHidden,
    nextRoute: CURRENT_WORKFLOW_ORDER[index + 1] ?? null
  };
}

/** Screen positions: 0 = introduction, 1..n = steps, n+1 = summary. */
export const lastPosition = (walkthrough: Walkthrough) => walkthrough.steps.length + 1;

export const clampPosition = (walkthrough: Walkthrough, position: number) => Math.max(0, Math.min(lastPosition(walkthrough), Math.trunc(position) || 0));

export function requestWalkthrough(moduleId: string) {
  window.dispatchEvent(new CustomEvent(WALKTHROUGH_EVENT, { detail: { moduleId } }));
}
