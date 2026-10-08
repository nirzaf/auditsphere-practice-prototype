export type SuggestedMilestoneCode = 'FIELDWORK_START' | 'DRAFT_REPORT' | 'FINAL_REPORT';
export type SuggestedMilestones = Record<SuggestedMilestoneCode, string>;

function addDays(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** Qatar work week starts Sunday. Suggestions use elapsed calendar days from the period end. */
export function suggestMilestones(periodEnd: string): SuggestedMilestones {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || new Date(`${periodEnd}T00:00:00.000Z`).toISOString().slice(0, 10) !== periodEnd) {
    throw new Error('Period end must be a valid ISO calendar date.');
  }
  const dayAfterEnd = addDays(periodEnd, 1);
  const weekday = new Date(`${dayAfterEnd}T00:00:00.000Z`).getUTCDay();
  const daysUntilSunday = (7 - weekday) % 7;
  return {
    FIELDWORK_START: addDays(dayAfterEnd, daysUntilSunday),
    DRAFT_REPORT: addDays(periodEnd, 46),
    FINAL_REPORT: addDays(periodEnd, 74)
  };
}
