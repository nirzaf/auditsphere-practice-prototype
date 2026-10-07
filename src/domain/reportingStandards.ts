export type PresentationEdition = 'IAS1' | 'IFRS18' | 'OTHER_APPROVED';

export const IFRS18_EFFECTIVE_PERIOD_START = '2027-01-01';

export function usesFullIfrsFramework(reportingFramework: string): boolean {
  const normalized = reportingFramework.trim().toLocaleLowerCase('en-US');
  if (!normalized || /\b(?:smes?|small and medium)\b/.test(normalized)) return false;
  return normalized === 'ifrs'
    || normalized.startsWith('ifrs ')
    || normalized === 'international financial reporting standards'
    || normalized.startsWith('international financial reporting standards ')
    || normalized === 'full ifrs';
}

export function presentationEditionBlocker(input: {
  reportingFramework: string;
  presentationEdition: PresentationEdition;
  earlyAdoption: boolean;
  periodStart: string;
}): string | null {
  if (!usesFullIfrsFramework(input.reportingFramework)) {
    if (input.earlyAdoption) return 'Early adoption is available only for IFRS 18 under the full IFRS framework.';
    if (input.presentationEdition === 'IFRS18') return 'IFRS 18 is available only when the approved reporting framework is full IFRS.';
    return null;
  }

  const effective = input.periodStart >= IFRS18_EFFECTIVE_PERIOD_START;
  if (input.earlyAdoption && (input.presentationEdition !== 'IFRS18' || effective)) {
    return 'Record early adoption only when IFRS 18 is selected for a period beginning before 1 January 2027.';
  }
  if (effective && input.presentationEdition === 'IAS1') {
    return 'For full IFRS annual periods beginning on or after 1 January 2027, select IFRS 18 or an explicitly Partner-approved alternative edition.';
  }
  if (!effective && input.presentationEdition === 'IFRS18' && !input.earlyAdoption) {
    return 'IFRS 18 applies from annual periods beginning on 1 January 2027; record explicit early adoption for an earlier period.';
  }
  return null;
}
