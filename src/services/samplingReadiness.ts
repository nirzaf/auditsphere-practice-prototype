import type { PrototypeState, SamplePopulationItem } from '../types';

/** Read-only mirror of the store precondition for sample-frame selection/review. */
export function isSampleFrameReconciled(state: PrototypeState, population: SamplePopulationItem): boolean {
  const engagement = state.engagements.find(item => item.id === population.engagementId);
  const glRow = engagement?.rows.find(row => row.code === population.accountCode);
  return Boolean(
    population.sourceComplete && engagement && glRow &&
    population.period === engagement.year && population.currency === engagement.currency &&
    population.items.every(item => (!item.period || item.period === population.period) && (!item.currency || item.currency === population.currency)) &&
    Math.abs(glRow.balance - population.totalPopulationValue) < 0.01
  );
}
