import type { EngagementRecord, PrototypeState, GeneratedArtifactRecord, ArchivedArtifactRecord } from '../types';
import { artifactSha256, loadVerifiedArtifact, persistArtifact } from './artifactStore';
import { hasExactFivePartBundle } from './targetLifecycle';
import { zipSync } from 'fflate';

export function inspectionRecords(state: PrototypeState, eng: EngagementRecord) {
  const { archive, ...engagement } = structuredClone(eng);
  const scoped = (rows: Array<any> | undefined) => (rows || []).filter(r => r.engagementId === eng.id);
  const documents = scoped(state.documents);
  const invoiceIds = new Set(state.invoices.filter(i => (i.engagementId || i.eng) === eng.id).map(i => i.id));
  const receipts = state.receipts.filter(r => r.allocations.some(a => invoiceIds.has(a.invoiceId))).map(r => {
    const allocations = r.allocations.filter(a => invoiceIds.has(a.invoiceId));
    return { ...r, allocations, amount: allocations.reduce((sum,a) => sum + a.amount,0), inspectionScope: 'Only allocations to this engagement; other engagement allocations excluded.' };
  });
  const refs = new Set([eng.id, ...eng.workpapers.map(w => w.id), ...eng.pbc.map(p => p.id), ...documents.map(d => d.id), ...[state.acceptanceCases,state.auditPlans,state.auditPrograms,state.auditRisks,state.findings,state.adjustmentJournals,state.samplePopulations,state.confirmations].flatMap(rows => scoped(rows).map(r => r.id)), ...invoiceIds,...receipts.map(r => r.id)]);
  return { format: 'AuditSphere full engagement inspection v1', engagement, client: state.clients.find(c => c.id === eng.client), contacts: state.contacts.filter(c => c.clientId === eng.client), proposals: state.proposals.filter(p => p.id === eng.proposalId), acceptanceCases: scoped(state.acceptanceCases), auditPlans: scoped(state.auditPlans), auditRisks: scoped(state.auditRisks), auditPrograms: scoped(state.auditPrograms), samples: scoped(state.samplePopulations), findings: scoped(state.findings), adjustments: scoped(state.adjustmentJournals), confirmations: scoped(state.confirmations), mappings: scoped(state.accountMappingRevisions), financialStatements: scoped(state.statementSetRevisions), documents, evidence: state.evidenceCatalogue.filter(e => documents.some(d => d.id === e.documentId)), time: scoped(state.times), invoices: state.invoices.filter(i => (i.engagementId || i.eng) === eng.id), receipts, folders: scoped(state.folders), communications: scoped(state.communications), events: state.events.filter(e => refs.has(e.ref)), boundary: 'Local prototype inspection. Cloud snapshots do not restore original bytes. Missing originals are explicitly listed.' };
}

export async function sealEngagementArchive(state: PrototypeState, eng: EngagementRecord) {
  if (!eng.archive) throw new Error('Read-only closure must be recorded before packaging.');
  const archive = eng.archive;
  const sources: GeneratedArtifactRecord[] = [];
  for (const set of eng.auditLifecycle?.deliverables || []) { sources.push(...set.artifacts); if (set.draftRepresentationArtifact) sources.push(set.draftRepresentationArtifact); }
  for (const wp of eng.workpapers) { if (wp.generatedArtifact) sources.push(wp.generatedArtifact); sources.push(...(wp.generatedArtifactHistory || [])); }
  sources.push(...(eng.auditLifecycle?.srms || []).map(r => r.artifact), ...(eng.auditLifecycle?.receiptDocuments || []).map(r => r.artifact), ...(eng.auditLifecycle?.holdingLetters || []).flatMap(r => r.artifact ? [r.artifact] : []));
  sources.push(...(eng.auditLifecycle?.signedRepresentations || []).map(r => r.artifact));
  const records = inspectionRecords(state, eng);
  const unavailable: string[] = [];
  const released = eng.auditLifecycle?.deliverables.find(s => s.id === archive.releaseId);
  if (!released || !hasExactFivePartBundle(released)) unavailable.push('Released five-part report set unavailable or incomplete; read-only closure remains effective.');
  for (const source of eng.sourceHistory || []) {
    if (source.originalArtifact) sources.push(source.originalArtifact);
    else if (source.fileName) unavailable.push(`TB source v${source.version} / ${source.fileName}: imported rows and source history retained; original upload bytes were not captured`);
  }
  for (const population of records.samples) {
    if (population.sourceArtifact) sources.push(population.sourceArtifact);
    else if (population.sourceFileName) unavailable.push(`Population ${population.id} / ${population.sourceFileName}: imported rows and source history retained; original upload bytes were not captured`);
  }
  // Upload metadata predating captured MIME/bytes is retained, never advertised as verified.
  for (const d of records.documents) {
    if (d.sha && d.mimeType) sources.push({ id: d.id, name: d.name, kind: 'PBC', mimeType: d.mimeType, size: d.size, sha256: d.sha });
    else unavailable.push(`${d.id}: ${d.name} — original file bytes/identity unavailable`);
  }
  const copies: ArchivedArtifactRecord[] = [];
  for (const source of new Map(sources.map(a => [a.id,a])).values()) {
    try {
      const savedCopy = archive.artifacts?.find(a => a.sourceArtifactId === source.id && a.sha256 === source.sha256);
      const blob = await loadVerifiedArtifact(source).catch(error => savedCopy ? loadVerifiedArtifact(savedCopy) : Promise.reject(error));
      const copy = { ...source, id: `archive:${eng.id}:${archive.releaseId}:${source.id}`, sourceArtifactId: source.id };
      await persistArtifact(copy, blob);
      copies.push(copy);
    } catch (error) { unavailable.push(`${source.id}: ${error instanceof Error ? error.message : 'Original bytes unavailable'}`); }
  }
  const blob = new Blob([JSON.stringify({ ...records, artifactAvailability: { verifiedCopies: copies, unavailable } }, null, 2)], { type: 'application/json' });
  const inspection = { id: `archive:${eng.id}:${archive.releaseId}:inspection`, name: `${eng.id}-full-audit-file.json`, kind: 'GROUP_JSON' as const, mimeType: blob.type, size: blob.size, sha256: await artifactSha256(blob) };
  await persistArtifact(inspection as GeneratedArtifactRecord, blob);
  archive.artifacts = copies;
  archive.inspection = inspection as GeneratedArtifactRecord;
  archive.unavailable = unavailable;
  archive.packagingStatus = unavailable.length ? 'Incomplete — originals unavailable' : 'Verified';
  archive.processedAt = new Date().toISOString();
  archive.manifest = [...copies.map(a => `${a.name}: ${a.id} / SHA-256 ${a.sha256}`), `Complete scoped records/history: ${inspection.name} / SHA-256 ${inspection.sha256}`, ...unavailable.map(x => `UNAVAILABLE: ${x}`)];
  const index = state.archives?.find(a => a.engagementId === eng.id && a.releaseId === archive.releaseId);
  if (index) { index.artifacts = copies; index.manifest = archive.manifest; index.manifestCount = archive.manifest.length; }
}

export async function createInspectionZip(state: PrototypeState, eng: EngagementRecord) {
  if (!eng.archive) throw new Error('Complete read-only closure before exporting the archive.');
  const files: Record<string,Uint8Array> = {};
  const unavailable = [...(eng.archive.unavailable || [])];
  const verifiedFiles: Array<{path:string;id:string;sha256:string}> = [];
  for (const [index,artifact] of (eng.archive.artifacts || []).entries()) {
    try {
      const blob = await loadVerifiedArtifact(artifact);
      const path = `originals/${String(index+1).padStart(3,'0')}_${artifact.name.replace(/[\\/]/g,'_')}`;
      files[path] = new Uint8Array(await blob.arrayBuffer());
      verifiedFiles.push({path,id:artifact.id,sha256:artifact.sha256});
    } catch (error) { unavailable.push(`${artifact.id}: ${error instanceof Error ? error.message : 'Archived bytes unavailable'}`); }
  }
  if (eng.archive.inspection) {
    try { files['sealed-inspection.json'] = new Uint8Array(await (await loadVerifiedArtifact(eng.archive.inspection)).arrayBuffer()); }
    catch (error) { unavailable.push(`Sealed inspection: ${error instanceof Error ? error.message : 'Unavailable'}`); }
  }
  files['audit-file-manifest.json'] = new TextEncoder().encode(JSON.stringify({ ...inspectionRecords(state,eng), archive: eng.archive, exportStatus: unavailable.length ? 'Incomplete — listed originals unavailable' : 'Verified', verifiedFiles, unavailable },null,2));
  return new Blob([Uint8Array.from(zipSync(files,{level:6})).buffer],{type:'application/zip'});
}
