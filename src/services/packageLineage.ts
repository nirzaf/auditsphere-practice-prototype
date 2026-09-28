import type { EngagementRecord, FinancialPackageRevision } from '../types';

/** Returns the persisted release that proves this exact package revision was issued. */
export function releaseForPackage(engagement: EngagementRecord, packageRevision: FinancialPackageRevision | undefined) {
  if (!packageRevision || packageRevision.engagementId !== engagement.id || packageRevision.artifacts.length === 0) return undefined;
  return engagement.releases.find(release => {
    if (release.generation !== packageRevision.generation || release.manifest.length !== packageRevision.artifacts.length) return false;
    return release.manifest.every(manifestItem =>
      manifestItem.sourceId === packageRevision.id &&
      manifestItem.sourceRevision === packageRevision.revision &&
      packageRevision.artifacts.some(artifact =>
        artifact.id === manifestItem.artifactId &&
        artifact.name === manifestItem.name &&
        artifact.kind === manifestItem.type &&
        artifact.mimeType === manifestItem.mimeType &&
        artifact.size === manifestItem.size &&
        artifact.sha256 === manifestItem.sha
      )
    );
  });
}

export function archiveForRelease(engagement: EngagementRecord, releaseId: string | undefined) {
  if (!releaseId || engagement.archive?.releaseId !== releaseId) return undefined;
  return engagement.archive;
}
