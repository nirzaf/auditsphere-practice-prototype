import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';

export const OFFICE_PACKAGE_MAX_ENTRIES = 2_048;
export const OFFICE_PACKAGE_MAX_ENTRY_BYTES = 32 * 1024 * 1024;
export const OFFICE_PACKAGE_MAX_EXPANDED_BYTES = 64 * 1024 * 1024;

export type OfficePackageInspection = {
  valid: boolean;
  tooLarge: boolean;
  entries: ReadonlySet<string>;
  expandedBytes: number;
};

function isSafeOfficeMemberName(name: string): boolean {
  if (!name || name.length > 512 || name.includes('\0') || name.includes('\\') || name.startsWith('/') || /^[a-z]:/i.test(name)) return false;
  return !name.split('/').some(segment => segment === '.' || segment === '..');
}

/**
 * Streams every member of an OOXML ZIP and counts actual output bytes. Central
 * directory sizes are used only as an early rejection hint; limits are enforced
 * again against the decompressor output so forged size fields cannot bypass it.
 */
export function inspectOfficePackage(bytes: Uint8Array): OfficePackageInspection {
  const entries = new Set<string>();
  let entryCount = 0;
  let expandedBytes = 0;
  let tooLarge = false;
  let invalid = false;
  let declaredExpandedBytes = 0;

  const unzip = new Unzip(file => {
    entryCount++;
    if (entryCount > OFFICE_PACKAGE_MAX_ENTRIES) {
      tooLarge = true;
      return;
    }
    if (!isSafeOfficeMemberName(file.name) || entries.has(file.name)) {
      invalid = true;
      return;
    }
    entries.add(file.name);

    if (file.originalSize !== undefined) {
      declaredExpandedBytes += file.originalSize;
      if (file.originalSize > OFFICE_PACKAGE_MAX_ENTRY_BYTES
        || declaredExpandedBytes > OFFICE_PACKAGE_MAX_EXPANDED_BYTES) {
        tooLarge = true;
        return;
      }
    }

    let memberBytes = 0;
    file.ondata = (error, chunk) => {
      if (error) {
        invalid = true;
        file.terminate();
        return;
      }
      memberBytes += chunk.byteLength;
      expandedBytes += chunk.byteLength;
      if (memberBytes > OFFICE_PACKAGE_MAX_ENTRY_BYTES
        || expandedBytes > OFFICE_PACKAGE_MAX_EXPANDED_BYTES) {
        tooLarge = true;
        file.terminate();
      }
    };
    try {
      file.start();
    } catch {
      invalid = true;
    }
  });
  unzip.register(UnzipPassThrough);
  unzip.register(UnzipInflate);

  try {
    unzip.push(bytes, true);
  } catch {
    invalid = true;
  }

  return { valid: !invalid && !tooLarge && entryCount > 0, tooLarge, entries, expandedBytes };
}
