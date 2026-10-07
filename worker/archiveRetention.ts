/** R2 prefixes and lock rules for archive objects under each workspace policy. */
export type ArchiveRetentionPolicy = {
  retentionYears: number | null;
  retainIndefinitely: number | boolean;
};

const SECONDS_PER_DAY = 86_400;
const MAX_RETENTION_YEARS = 100;

export function archiveRetentionSegment(policy: ArchiveRetentionPolicy): string {
  const indefinite = policy.retainIndefinitely === true || policy.retainIndefinitely === 1;
  if (indefinite && policy.retentionYears === null) return 'indefinite';
  const years = policy.retentionYears;
  if (indefinite || !Number.isInteger(years) || years === null || years < 1 || years > MAX_RETENTION_YEARS) {
    throw new Error('The archive retention policy is incomplete or invalid.');
  }
  return `years-${years}`;
}

export type R2ArchiveLockRule = {
  id: string;
  enabled: true;
  prefix: string;
  condition: { type: 'Age'; maxAgeSeconds: number } | { type: 'Indefinite' };
};

export function mergeArchiveLockRules<T extends { id: string }>(
  existingRules: T[], desiredRules: R2ArchiveLockRule[]
): Array<T | R2ArchiveLockRule> {
  const desiredIds = new Set(desiredRules.map(rule => rule.id));
  return [...existingRules.filter(rule => !desiredIds.has(rule.id)), ...desiredRules];
}

/**
 * Bucket-lock Age uses elapsed seconds rather than calendar anniversaries.
 * This rounds up for leap years, preserving at least the selected calendar
 * retention term with at most one extra day per four-year block.
 */
export function r2ArchiveLockRules(): R2ArchiveLockRule[] {
  const rules: R2ArchiveLockRule[] = [];
  for (let years = 1; years <= MAX_RETENTION_YEARS; years++) {
    const minimumDays = years * 365 + Math.ceil(years / 4);
    rules.push({
      id: `auditsphere-archive-${years}-years`,
      enabled: true,
      prefix: `sealed-archives/retention/years-${years}/`,
      condition: { type: 'Age', maxAgeSeconds: minimumDays * SECONDS_PER_DAY }
    });
  }
  rules.push({
    id: 'auditsphere-archive-indefinite',
    enabled: true,
    prefix: 'sealed-archives/retention/indefinite/',
    condition: { type: 'Indefinite' }
  });
  return rules;
}
