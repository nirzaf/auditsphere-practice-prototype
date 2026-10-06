/** Preserve the version observed when drafting unless the person explicitly rebases. */
export function procedureExpectedVersion(baseVersion: number | undefined, serverVersion: number, rebase = false): number {
  return rebase || baseVersion === undefined ? serverVersion : baseVersion;
}

export function hasProcedureVersionConflict(baseVersion: number | undefined, serverVersion: number): boolean {
  return baseVersion !== undefined && baseVersion !== serverVersion;
}
