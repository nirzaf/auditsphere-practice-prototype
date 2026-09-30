import { ArchivedArtifactRecord, FinancialPackageRevision, GeneratedArtifactRecord } from '../types';
import { downloadBlob } from './exportService';

const DB_NAME = 'ste-auditsphere-generated-artifacts';
const STORE_NAME = 'artifacts';

function openArtifactDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable; generated files cannot be persisted.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open generated-file storage.'));
  });
}

export async function artifactSha256(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable; artifact identity cannot be verified.');
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function persistArtifact(record: GeneratedArtifactRecord, blob: Blob): Promise<void> {
  return persistArtifacts([{ record, blob }]);
}

export async function captureSourceOriginal(name: string, bytes: ArrayBuffer, mimeType: string): Promise<GeneratedArtifactRecord> {
  const blob = new Blob([bytes], { type: mimeType });
  const record: GeneratedArtifactRecord = { id: `source:${crypto.randomUUID()}`, name, kind: 'PBC', mimeType, size: blob.size, sha256: await artifactSha256(blob) };
  await persistArtifact(record, blob);
  return record;
}

export async function persistArtifacts(items: Array<{ record: GeneratedArtifactRecord; blob: Blob }>): Promise<void> {
  for (const { record, blob } of items) {
    if (blob.size !== record.size || blob.type !== record.mimeType || await artifactSha256(blob) !== record.sha256) throw new Error(`Generated artifact ${record.name} does not match its declared size, type or digest.`);
  }
  const db = await openArtifactDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not persist generated artifact.'));
      tx.onabort = () => reject(tx.error || new Error('Generated artifact persistence was aborted.'));
      try {
        const store = tx.objectStore(STORE_NAME);
        for (const { record, blob } of items) store.put({ id: record.id, blob });
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  } finally { db.close(); }
}

export async function loadVerifiedArtifact(record: GeneratedArtifactRecord): Promise<Blob> {
  const db = await openArtifactDb();
  let blob: Blob | undefined;
  try {
    blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(record.id);
      request.onsuccess = () => resolve(request.result?.blob as Blob | undefined);
      request.onerror = () => reject(request.error || new Error('Could not read the saved artifact.'));
    });
  } finally { db.close(); }
  if (!blob || blob.size !== record.size || blob.type !== record.mimeType || await artifactSha256(blob) !== record.sha256) throw new Error(`Saved artifact ${record.name} is missing or failed its SHA-256 integrity check.`);
  return blob;
}

export async function downloadVerifiedArtifact(record: GeneratedArtifactRecord): Promise<void> {
  downloadBlob(await loadVerifiedArtifact(record), record.name);
}

export async function copyReleaseArtifactsToArchive(
  engagementId: string,
  releaseId: string,
  manifest: Array<{ artifactId?: string; sha?: string }>,
  packageHistory: FinancialPackageRevision[]
): Promise<ArchivedArtifactRecord[]> {
  const artifacts = new Map(packageHistory.flatMap(revision => revision.artifacts).map(artifact => [artifact.id, artifact]));
  if (!manifest.length || manifest.some(item => !item.artifactId || !item.sha || artifacts.get(item.artifactId)?.sha256 !== item.sha)) {
    throw new Error('The release does not reference a complete set of verified generated artifacts.');
  }
  return Promise.all(manifest.map(async item => {
    const source = artifacts.get(item.artifactId!)!;
    const copy: ArchivedArtifactRecord = { ...source, id: `archive:${engagementId}:${releaseId}:${source.id}`, sourceArtifactId: source.id };
    await persistArtifact(copy, await loadVerifiedArtifact(source));
    return copy;
  }));
}
