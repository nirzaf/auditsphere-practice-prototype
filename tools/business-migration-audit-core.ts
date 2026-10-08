import { createHash } from 'node:crypto';

export interface MigrationAuditSourceEntity {
  entity_kind: string;
  entity_id: string;
  payload_json: string;
}

export interface MigrationAuditSourceRoot {
  document_key: string;
  payload_json: string;
}

export interface MigrationAuditSourceFile {
  id: string;
  r2_key: string;
  original_name: string;
  size_bytes: number;
  sha256: string | null;
  state: string;
}

export interface MigrationAuditIdMap {
  source_kind: string;
  source_id: string;
  target_kind: string;
  target_id: string;
}

export interface MigrationAuditSnapshot {
  workspace: { id: string; schema_version: number; data_mode: string };
  entities: MigrationAuditSourceEntity[];
  rootDocuments: MigrationAuditSourceRoot[];
  files: MigrationAuditSourceFile[];
  idMaps: MigrationAuditIdMap[];
  targetRows: Array<{ kind: string; id: string }>;
  /** Whitelisted columns used only for explicit source-to-target comparison. */
  targetFields?: Array<{ kind: string; id: string; fields: Record<string, unknown> }>;
  targetMoneyTotals: Array<{ kind: string; row_count: string; amount_minor: string }>;
}

export interface VerifiedR2Object {
  found: boolean;
  sizeBytes?: number;
  sha256?: string;
}

export interface MigrationAuditReport {
  runId: string;
  workspaceId: string;
  sourceSchemaVersion: number;
  targetSchemaVersion: number;
  installedApplicationSchemaVersion: number;
  sourceSha256: string;
  status: 'DRY_RUN';
  validationStatus: 'VALIDATED' | 'BLOCKED';
  businessRecordsChanged: false;
  auditMetadataRecorded: boolean;
  sourceCount: number;
  targetCount: number;
  counts: {
    sourceByKind: Record<string, number>;
    rootDocuments: Record<string, number>;
    targetByKind: Record<string, number>;
    committedFiles: number;
  };
  reconciliationByTarget: Array<{ targetKind: string; sourceRows: number; mappedRows: number; targetRows: number; status: 'COUNTS_MATCHED' | 'BLOCKED' }>;
  moneyTotals: {
    sourceNativeUnits: Record<string, string>;
    targetQarMinorUnits: Record<string, { rows: string; amountMinor: string }>;
    reconciliation: Array<{ sourceKind: string; sourceRows: number; targetKind: string; targetRows: number; sourceAmountMinor: string; targetAmountMinor: string; status: 'MATCHED' | 'MISMATCHED' | 'UNVERIFIED' }>;
  };
  missingFiles: Array<{ sourceId: string; objectKey: string; reason: string; expectedSha256?: string; actualSha256?: string }>;
  orphanRows: Array<{ sourceKind: string; sourceId: string; field: string; referenceId: string; reason: string }>;
  unmappedRows: Array<{ sourceKind: string; sourceId: string; reason: string }>;
  reconciliationIssues: Array<{ sourceKind: string; sourceId: string; code: string }>;
  fieldReconciliation: Array<{
    sourceKind: string;
    sourceId: string;
    targetKind: string;
    targetId: string;
    fields: Array<{
      sourceField: string;
      targetField: string | null;
      status: 'MATCHED' | 'MISMATCHED' | 'UNVERIFIED';
      sourceSha256?: string;
      targetSha256?: string;
    }>;
  }>;
  blockers: number;
}

/** Only direct, semantics-preserving identity mappings are registered here.
 * Transformed records must be mapped explicitly in migration_id_map after their
 * source relationships and provenance have been reviewed.
 */
const DIRECT_TARGET_KIND: Readonly<Record<string, string>> = {
  clients: 'clients',
  contacts: 'contacts',
  leads: 'leads',
  proposals: 'proposals',
  engagements: 'engagements',
  invoices: 'invoices',
  creditNotes: 'firm_credit_notes',
  receipts: 'receipt_vouchers',
  times: 'firm_time_entries',
  budgets: 'engagement_budgets',
  auditRisks: 'risk_assessments',
  auditPrograms: 'procedures',
  samplePopulations: 'sample_populations',
  evidenceCatalogue: 'evidence_records',
  findings: 'findings',
  adjustmentJournals: 'audit_adjustments',
  confirmations: 'confirmations',
  documents: 'file_versions',
  file_objects: 'file_versions'
};

const ROOT_TARGET_KIND: Readonly<Record<string, string>> = {
  firmSettings: 'firm_profiles'
};

const TARGET_KIND_TABLE: Readonly<Record<string, string>> = {
  clients: 'clients', contacts: 'contacts', leads: 'leads', proposals: 'proposals',
  engagements: 'engagements', invoices: 'invoices', firm_credit_notes: 'firm_credit_notes',
  receipt_vouchers: 'receipt_vouchers', firm_time_entries: 'firm_time_entries',
  engagement_budgets: 'engagement_budgets', risk_assessments: 'risk_assessments',
  procedures: 'procedures', sample_populations: 'sample_populations',
  evidence_records: 'evidence_records', findings: 'findings', audit_adjustments: 'audit_adjustments',
  confirmations: 'confirmations', file_versions: 'file_versions', firm_profiles: 'firm_profiles'
};

const METADATA_ROOTS = new Set(['__manifest__', '__scalars__', '__settings__']);
const RELATION_FIELDS: Readonly<Record<string, string>> = {
  clientId: 'clients', parentClientId: 'clients', relatedClientId: 'clients',
  engagementId: 'engagements', leadId: 'leads', proposalId: 'proposals',
  invoiceId: 'invoices', creditNoteId: 'creditNotes', receiptId: 'receipts',
  documentId: 'documents', supersedesDocumentId: 'documents', fileId: 'file_objects',
  fileVersionId: 'file_versions', evidenceId: 'evidenceCatalogue',
  findingId: 'findings', riskId: 'auditRisks', auditProgramId: 'auditPrograms',
  procedureId: 'auditPrograms', populationId: 'samplePopulations',
  jobId: 'jobs', taskId: 'jobTasks', contactId: 'contacts', userId: 'users'
};

const UNMAPPABLE = Symbol('unmappable source field');
type MigrationFieldDefinition = {
  sourceField: string;
  targetField: string;
  optional?: boolean;
  transform?: (value: unknown, payload: Record<string, unknown>, maps: ReadonlyMap<string, MigrationAuditIdMap>) => unknown | typeof UNMAPPABLE;
};

const direct = (value: unknown): unknown => value;
const nullableText = (value: unknown): unknown => {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' ? value.trim() : UNMAPPABLE;
};
const countryCode = (value: unknown): unknown => {
  if (typeof value !== 'string') return UNMAPPABLE;
  const normalized = value.trim();
  if (/^[A-Za-z]{2}$/.test(normalized)) return normalized.toUpperCase();
  if (normalized.toLocaleLowerCase() === 'qatar') return 'QA';
  return UNMAPPABLE;
};
const entityType = (value: unknown): unknown => ({
  Holding: 'HOLDING', Subsidiary: 'SUBSIDIARY', Standalone: 'STANDALONE'
} as Record<string, string>)[String(value)] ?? UNMAPPABLE;
const activeFlag = (value: unknown): unknown => ({ Active: 1, Suspended: 0, Archived: 0 } as Record<string, number>)[String(value)] ?? UNMAPPABLE;
const contactRole = (value: unknown): unknown => ({
  'MD/GM': 'MD_GM',
  'CFO/Finance Director': 'CFO_FINANCE_DIRECTOR',
  'Chief Accountant/Audit Liaison': 'CHIEF_ACCOUNTANT_LIAISON',
  Other: 'OTHER'
} as Record<string, string>)[String(value)] ?? UNMAPPABLE;
const booleanInteger = (value: unknown): unknown => typeof value === 'boolean' ? Number(value) : UNMAPPABLE;
const mappedRelation = (kind: string) => (value: unknown, _payload: Record<string, unknown>, maps: ReadonlyMap<string, MigrationAuditIdMap>): unknown => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return UNMAPPABLE;
  return maps.get(`${kind}\0${value}\0${kind}`)?.target_id ?? UNMAPPABLE;
};

/** Explicitly supported field pairs. Other source fields remain blockers until reviewed mappings are added. */
const FIELD_MAPPINGS: Readonly<Record<string, readonly MigrationFieldDefinition[]>> = {
  clients: [
    { sourceField: 'code', targetField: 'code', transform: nullableText },
    { sourceField: 'name', targetField: 'legal_name', transform: nullableText },
    { sourceField: 'tradingName', targetField: 'trading_name', optional: true, transform: nullableText },
    { sourceField: 'entityRole', targetField: 'entity_type', transform: entityType },
    { sourceField: 'parentClientId', targetField: 'parent_client_id', optional: true, transform: mappedRelation('clients') },
    { sourceField: 'registrationNumber', targetField: 'commercial_registration', optional: true, transform: nullableText },
    { sourceField: 'taxId', targetField: 'tax_id', optional: true, transform: nullableText },
    { sourceField: 'industry', targetField: 'industry', transform: nullableText },
    { sourceField: 'address', targetField: 'address', transform: nullableText },
    { sourceField: 'jurisdiction', targetField: 'country_code', transform: countryCode },
    { sourceField: 'status', targetField: 'active', transform: activeFlag }
  ],
  contacts: [
    { sourceField: 'clientId', targetField: 'client_id', transform: mappedRelation('clients') },
    { sourceField: 'name', targetField: 'full_name', transform: nullableText },
    { sourceField: 'email', targetField: 'email', optional: true, transform: value => typeof value === 'string' ? value.trim().toLocaleLowerCase() || null : value === null ? null : UNMAPPABLE },
    { sourceField: 'phone', targetField: 'phone', optional: true, transform: nullableText },
    { sourceField: 'title', targetField: 'title', transform: nullableText },
    { sourceField: 'contactRole', targetField: 'role', transform: contactRole },
    { sourceField: 'isPrimary', targetField: 'is_primary', transform: booleanInteger },
    { sourceField: 'active', targetField: 'active', transform: booleanInteger },
    { sourceField: 'effectiveFrom', targetField: 'effective_from', transform: nullableText },
    { sourceField: 'effectiveTo', targetField: 'effective_to', optional: true, transform: nullableText }
  ]
};

function valueSha256(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function reconcileMappedFields(
  sourceKind: string,
  sourceId: string,
  targetKind: string,
  targetId: string,
  sourcePayload: Record<string, unknown>,
  targetFields: Record<string, unknown> | undefined,
  maps: ReadonlyMap<string, MigrationAuditIdMap>
): MigrationAuditReport['fieldReconciliation'][number] | null {
  const definitions = FIELD_MAPPINGS[sourceKind];
  if (!definitions) return null;
  const fields: MigrationAuditReport['fieldReconciliation'][number]['fields'] = [];
  const registeredSourceFields = new Set(['id', ...definitions.map(item => item.sourceField)]);
  if (!targetFields) {
    fields.push({ sourceField: '*', targetField: null, status: 'UNVERIFIED' });
  } else {
    for (const definition of definitions) {
      const present = Object.hasOwn(sourcePayload, definition.sourceField);
      const raw = present ? sourcePayload[definition.sourceField] : undefined;
      const mapped = !present && definition.optional
        ? null
        : present
          ? (definition.transform ?? direct)(raw, sourcePayload, maps)
          : UNMAPPABLE;
      const targetPresent = Object.hasOwn(targetFields, definition.targetField);
      const targetValue = targetFields[definition.targetField];
      if (mapped === UNMAPPABLE || !targetPresent) {
        fields.push({
          sourceField: definition.sourceField,
          targetField: definition.targetField,
          status: 'UNVERIFIED',
          ...(present ? { sourceSha256: valueSha256(raw) } : {}),
          ...(targetPresent ? { targetSha256: valueSha256(targetValue) } : {})
        });
      } else {
        fields.push({
          sourceField: definition.sourceField,
          targetField: definition.targetField,
          status: canonical(mapped) === canonical(targetValue) ? 'MATCHED' : 'MISMATCHED',
          sourceSha256: valueSha256(mapped),
          targetSha256: valueSha256(targetValue)
        });
      }
    }
  }
  for (const sourceField of Object.keys(sourcePayload).filter(field => !registeredSourceFields.has(field)).sort()) {
    fields.push({ sourceField, targetField: null, status: 'UNVERIFIED', sourceSha256: valueSha256(sourcePayload[sourceField]) });
  }
  return { sourceKind, sourceId, targetKind, targetId, fields };
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const parsePayload = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
};

const compareSource = (a: { source_kind: string; source_id: string }, b: { source_kind: string; source_id: string }) =>
  a.source_kind.localeCompare(b.source_kind) || a.source_id.localeCompare(b.source_id);

function addSourceAmount(totals: Record<string, bigint>, kind: string, field: string, payload: Record<string, unknown>): void {
  const value = payload[field];
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    const key = `${kind}.${field}`;
    totals[key] = (totals[key] ?? 0n) + BigInt(value);
  }
}

function inspectRelations(
  sourceKind: string,
  sourceId: string,
  payload: Record<string, unknown>,
  idsByKind: Map<string, Set<string>>,
  filesById: Map<string, MigrationAuditSourceFile>,
  missingFiles: MigrationAuditReport['missingFiles'],
  orphanRows: MigrationAuditReport['orphanRows']
): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    for (const [field, nested] of Object.entries(value as Record<string, unknown>)) {
      const targetKind = RELATION_FIELDS[field];
      if (targetKind && typeof nested === 'string' && nested.length > 0) {
        if (targetKind === 'file_objects') {
          if (!filesById.has(nested)) missingFiles.push({ sourceId: nested, objectKey: '', reason: `Referenced by ${sourceKind}/${sourceId} but no source file row exists.` });
        } else if (targetKind === 'file_versions') {
          // A direct file-version reference is checked through migration_id_map below.
          const mappedKind = DIRECT_TARGET_KIND.file_objects;
          if (!idsByKind.get(`mapped:${mappedKind}`)?.has(nested)) {
            orphanRows.push({ sourceKind, sourceId, field, referenceId: nested, reason: 'Referenced normalized file version has no verified source mapping.' });
          }
        } else if (!idsByKind.get(targetKind)?.has(nested)) {
          orphanRows.push({ sourceKind, sourceId, field, referenceId: nested, reason: `Referenced ${targetKind} row is absent from the source snapshot.` });
        }
      }
      visit(nested);
    }
  };
  visit(payload);
}

/** Build an evidence-backed, read-only dry-run report from D1 rows and R2 byte checks. */
export function buildMigrationAuditReport(
  snapshot: MigrationAuditSnapshot,
  verifiedObjects: ReadonlyMap<string, VerifiedR2Object>,
  targetSchemaVersion: number,
  installedApplicationSchemaVersion: number,
  runId = crypto.randomUUID()
): MigrationAuditReport {
  const entities = [...snapshot.entities].sort((a, b) => a.entity_kind.localeCompare(b.entity_kind) || a.entity_id.localeCompare(b.entity_id));
  const roots = [...snapshot.rootDocuments].sort((a, b) => a.document_key.localeCompare(b.document_key));
  const files = [...snapshot.files].sort((a, b) => a.id.localeCompare(b.id));
  const maps = [...snapshot.idMaps].sort(compareSource);
  const payloads = new Map<string, Record<string, unknown>>();
  const idsByKind = new Map<string, Set<string>>();
  const sourceByKind: Record<string, number> = {};
  for (const entity of entities) {
    sourceByKind[entity.entity_kind] = (sourceByKind[entity.entity_kind] ?? 0) + 1;
    payloads.set(`${entity.entity_kind}\0${entity.entity_id}`, parsePayload(entity.payload_json));
    const ids = idsByKind.get(entity.entity_kind) ?? new Set<string>();
    ids.add(entity.entity_id);
    idsByKind.set(entity.entity_kind, ids);
  }
  const fileIds = new Set(files.map(file => file.id));
  idsByKind.set('file_objects', fileIds);
  for (const mapping of maps) {
    if (TARGET_KIND_TABLE[mapping.target_kind]) {
      const ids = idsByKind.get(`mapped:${mapping.target_kind}`) ?? new Set<string>();
      ids.add(mapping.target_id);
      idsByKind.set(`mapped:${mapping.target_kind}`, ids);
    }
  }

  const byMapKey = new Map(maps.map(mapping => [`${mapping.source_kind}\0${mapping.source_id}\0${mapping.target_kind}`, mapping]));
  const targetIds = new Map<string, Set<string>>();
  const targetFieldRows = new Map((snapshot.targetFields ?? []).map(row => [`${row.kind}\0${row.id}`, row.fields]));
  const targetCounts: Record<string, number> = {};
  for (const row of snapshot.targetRows) {
    const ids = targetIds.get(row.kind) ?? new Set<string>();
    ids.add(row.id);
    targetIds.set(row.kind, ids);
    targetCounts[row.kind] = (targetCounts[row.kind] ?? 0) + 1;
  }

  const missingFiles: MigrationAuditReport['missingFiles'] = [];
  const orphanRows: MigrationAuditReport['orphanRows'] = [];
  const unmappedRows: MigrationAuditReport['unmappedRows'] = [];
  const reconciliationIssues: MigrationAuditReport['reconciliationIssues'] = [];
  const fieldReconciliation: MigrationAuditReport['fieldReconciliation'] = [];
  const sourceRows = [
    ...entities.map(entity => ({ source_kind: entity.entity_kind, source_id: entity.entity_id, target_kind: DIRECT_TARGET_KIND[entity.entity_kind] })),
    ...roots.filter(root => !METADATA_ROOTS.has(root.document_key)).map(root => ({ source_kind: 'ROOT_DOCUMENT', source_id: root.document_key, target_kind: ROOT_TARGET_KIND[root.document_key] })),
    ...files.map(file => ({ source_kind: 'file_objects', source_id: file.id, target_kind: DIRECT_TARGET_KIND.file_objects }))
  ].sort(compareSource);
  const sourceKeys = new Set(sourceRows.map(source => `${source.source_kind}\0${source.source_id}`));
  const sourceByKey = new Map(sourceRows.map(source => [`${source.source_kind}\0${source.source_id}`, source]));
  let reconciledTargetCount = 0;
  for (const mapping of maps) {
    const mappedSource = sourceByKey.get(`${mapping.source_kind}\0${mapping.source_id}`);
    if (!sourceKeys.has(`${mapping.source_kind}\0${mapping.source_id}`)) {
      orphanRows.push({ sourceKind: mapping.source_kind, sourceId: mapping.source_id, field: 'migration_id_map.source_id', referenceId: mapping.source_id, reason: 'Mapping references a source row that is absent from the workspace snapshot.' });
    } else if (!mappedSource?.target_kind || mapping.target_kind !== mappedSource.target_kind) {
      orphanRows.push({ sourceKind: mapping.source_kind, sourceId: mapping.source_id, field: 'migration_id_map.target_kind', referenceId: mapping.target_kind, reason: 'Mapping target kind does not match the registered source mapping.' });
    }
  }
  if (snapshot.workspace.schema_version >= targetSchemaVersion) {
    unmappedRows.push({ sourceKind: 'workspace', sourceId: snapshot.workspace.id, reason: 'SOURCE_SCHEMA_NOT_SUPPORTED_BY_MIGRATION_TARGET' });
  }
  const sourceIdSets = new Map(idsByKind);
  for (const source of sourceRows) {
    if (!source.target_kind) {
      unmappedRows.push({ sourceKind: source.source_kind, sourceId: source.source_id, reason: 'NO_REGISTERED_MAPPING' });
      continue;
    }
    const mapping = byMapKey.get(`${source.source_kind}\0${source.source_id}\0${source.target_kind}`);
    if (!mapping) {
      unmappedRows.push({ sourceKind: source.source_kind, sourceId: source.source_id, reason: 'ID_MAPPING_MISSING' });
      continue;
    }
    const targetKind = TARGET_KIND_TABLE[mapping.target_kind];
    if (!targetKind) {
      unmappedRows.push({ sourceKind: source.source_kind, sourceId: source.source_id, reason: 'TARGET_KIND_NOT_REGISTERED' });
      continue;
    }
    if (!targetIds.get(targetKind)?.has(mapping.target_id)) {
      orphanRows.push({ sourceKind: source.source_kind, sourceId: source.source_id, field: 'migration_id_map.target_id', referenceId: mapping.target_id, reason: `Mapped ${targetKind} row is absent from the normalized workspace.` });
    } else {
      reconciledTargetCount += 1;
      const fieldReport = reconcileMappedFields(
        source.source_kind,
        source.source_id,
        targetKind,
        mapping.target_id,
        payloads.get(`${source.source_kind}\0${source.source_id}`) ?? {},
        targetFieldRows.get(`${targetKind}\0${mapping.target_id}`),
        byMapKey
      );
      if (fieldReport) {
        fieldReconciliation.push(fieldReport);
        if (fieldReport.fields.some(field => field.status !== 'MATCHED')) {
          reconciliationIssues.push({ sourceKind: source.source_kind, sourceId: source.source_id, code: 'TARGET_FIELD_RECONCILIATION_NOT_VERIFIED' });
        }
        for (const field of fieldReport.fields) {
          if (field.status === 'MATCHED') continue;
          const code = field.status === 'MISMATCHED' ? 'TARGET_FIELD_MISMATCH'
            : field.sourceField === '*' ? 'TARGET_FIELDS_NOT_SNAPSHOTTED'
              : field.targetField === null ? 'SOURCE_FIELD_NOT_MAPPED' : 'TARGET_FIELD_NOT_VERIFIED';
          reconciliationIssues.push({ sourceKind: source.source_kind, sourceId: source.source_id, code });
        }
      } else reconciliationIssues.push({ sourceKind: source.source_kind, sourceId: source.source_id, code: 'TARGET_FIELD_RECONCILIATION_NOT_VERIFIED' });
    }
  }

  const filesById = new Map(files.map(file => [file.id, file]));
  for (const entity of entities) {
    const payload = payloads.get(`${entity.entity_kind}\0${entity.entity_id}`) ?? {};
    inspectRelations(entity.entity_kind, entity.entity_id, payload, sourceIdSets, filesById, missingFiles, orphanRows);
  }
  for (const file of files) {
    if (file.state !== 'COMMITTED') {
      missingFiles.push({ sourceId: file.id, objectKey: file.r2_key, reason: `File row is ${file.state}; only committed source files are migratable.`, ...(file.sha256 ? { expectedSha256: file.sha256 } : {}) });
      continue;
    }
    const verification = verifiedObjects.get(file.id);
    if (!file.sha256 || !verification?.found) {
      missingFiles.push({ sourceId: file.id, objectKey: file.r2_key, reason: !file.sha256 ? 'COMMITTED_FILE_HASH_MISSING' : 'R2_OBJECT_MISSING', ...(file.sha256 ? { expectedSha256: file.sha256 } : {}) });
      continue;
    }
    if (verification.sizeBytes !== file.size_bytes) {
      missingFiles.push({ sourceId: file.id, objectKey: file.r2_key, reason: `R2_SIZE_MISMATCH expected=${file.size_bytes} actual=${verification.sizeBytes ?? 'unknown'}`, expectedSha256: file.sha256, ...(verification.sha256 ? { actualSha256: verification.sha256 } : {}) });
      continue;
    }
    if (verification.sha256?.toLowerCase() !== file.sha256.toLowerCase()) {
      missingFiles.push({ sourceId: file.id, objectKey: file.r2_key, reason: 'R2_SHA256_MISMATCH', expectedSha256: file.sha256, ...(verification.sha256 ? { actualSha256: verification.sha256 } : {}) });
    }
  }

  const sourceMoney: Record<string, bigint> = {};
  for (const entity of entities) {
    const payload = payloads.get(`${entity.entity_kind}\0${entity.entity_id}`) ?? {};
    if (entity.entity_kind === 'invoices') { addSourceAmount(sourceMoney, 'invoices', 'amount', payload); addSourceAmount(sourceMoney, 'invoices', 'taxTotal', payload); addSourceAmount(sourceMoney, 'invoices', 'paid', payload); }
    if (entity.entity_kind === 'creditNotes') addSourceAmount(sourceMoney, 'creditNotes', 'amount', payload);
    if (entity.entity_kind === 'receipts') { addSourceAmount(sourceMoney, 'receipts', 'amount', payload); addSourceAmount(sourceMoney, 'receipts', 'allocatedAmount', payload); }
  }
  const rootCounts = Object.fromEntries(roots.map(root => [root.document_key, 1]));
  if (files.length) sourceByKind.file_objects = files.length;
  const targetMoneyTotals = Object.fromEntries(snapshot.targetMoneyTotals.map(total => [total.kind, { rows: total.row_count, amountMinor: total.amount_minor }]));
  const sourceByTarget = new Map<string, typeof sourceRows>();
  for (const source of sourceRows) {
    if (!source.target_kind || !TARGET_KIND_TABLE[source.target_kind]) continue;
    const rows = sourceByTarget.get(source.target_kind) ?? [];
    rows.push(source);
    sourceByTarget.set(source.target_kind, rows);
  }
  const reconciliationByTarget = [...sourceByTarget.entries()].map(([targetKind, sources]) => {
    const mappedRows = sources.filter(source => {
      const mapping = byMapKey.get(`${source.source_kind}\0${source.source_id}\0${targetKind}`);
      return Boolean(mapping && targetIds.get(targetKind)?.has(mapping.target_id));
    }).length;
    const targetRows = targetIds.get(targetKind)?.size ?? 0;
    const status = mappedRows === sources.length && targetRows === sources.length ? 'COUNTS_MATCHED' as const : 'BLOCKED' as const;
    if (targetRows > sources.length) {
      unmappedRows.push({ sourceKind: `normalized:${targetKind}`, sourceId: '*', reason: `TARGET_COUNT_MISMATCH expected=${sources.length} source rows, found=${targetRows} target rows.` });
    }
    return { targetKind, sourceRows: sources.length, mappedRows, targetRows, status };
  }).sort((a, b) => a.targetKind.localeCompare(b.targetKind));
  const moneyPairs = [
    { sourceKind: 'invoices', targetKind: 'invoices', sourceField: 'amount', extraField: 'taxTotal', targetKindForRows: 'invoices' },
    { sourceKind: 'creditNotes', targetKind: 'firm_credit_notes', sourceField: 'amount', targetKindForRows: 'firm_credit_notes' },
    { sourceKind: 'receipts', targetKind: 'receipt_vouchers', sourceField: 'amount', targetKindForRows: 'receipt_vouchers' },
    { sourceKind: 'receipts', targetKind: 'payments', sourceField: 'amount', targetKindForRows: 'payments', relatedTargetKind: 'receipt_vouchers' }
  ] as const;
  const moneyReconciliation = moneyPairs.flatMap(pair => {
    const sourceEntities = entities.filter(entity => entity.entity_kind === pair.sourceKind);
    if (!sourceEntities.length) return [];
    const sourceAmount = sourceEntities.reduce((total, entity) => {
      const payload = payloads.get(`${entity.entity_kind}\0${entity.entity_id}`) ?? {};
      const amount = payload[pair.sourceField];
      const extra = 'extraField' in pair ? payload[pair.extraField] : undefined;
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) return total;
      const currency = typeof payload.currency === 'string' ? payload.currency : 'QAR';
      if (currency !== 'QAR') return total;
      const extraAmount = typeof extra === 'number' && Number.isSafeInteger(extra) ? extra : 0;
      return total + BigInt(amount) + BigInt(extraAmount);
    }, 0n);
    const target = targetMoneyTotals[pair.targetKindForRows];
    const normalizedTargetRows = Number(target?.rows ?? '0');
    const targetAmount = BigInt(target?.amountMinor ?? '0');
    const sourceCurrencyKnown = sourceEntities.every(entity => {
      const payload = payloads.get(`${entity.entity_kind}\0${entity.entity_id}`) ?? {};
      return payload.currency === undefined || payload.currency === 'QAR';
    });
    const hasAmounts = sourceEntities.every(entity => {
      const payload = payloads.get(`${entity.entity_kind}\0${entity.entity_id}`) ?? {};
      return typeof payload[pair.sourceField] === 'number' && Number.isSafeInteger(payload[pair.sourceField]);
    });
    const matchedCounts = pair.relatedTargetKind
      ? reconciliationByTarget.find(item => item.targetKind === pair.relatedTargetKind)?.status === 'COUNTS_MATCHED'
        && normalizedTargetRows === sourceEntities.length
      : reconciliationByTarget.find(item => item.targetKind === pair.targetKind)?.status === 'COUNTS_MATCHED';
    const status = !sourceCurrencyKnown || !hasAmounts || !matchedCounts ? 'UNVERIFIED' as const
      : sourceAmount === targetAmount ? 'MATCHED' as const : 'MISMATCHED' as const;
    if (status === 'MISMATCHED') {
      orphanRows.push({ sourceKind: pair.sourceKind, sourceId: snapshot.workspace.id, field: 'moneyTotal', referenceId: targetAmount.toString(), reason: `QAR minor-unit total mismatch source=${sourceAmount} target=${targetAmount}.` });
    } else if (status === 'UNVERIFIED') {
      unmappedRows.push({ sourceKind: pair.sourceKind, sourceId: snapshot.workspace.id, reason: 'MONEY_TOTAL_REQUIRES_EXPLICIT_RECONCILIATION' });
    }
    return [{ sourceKind: pair.sourceKind, sourceRows: sourceEntities.length, targetKind: pair.targetKind, targetRows: normalizedTargetRows, sourceAmountMinor: sourceAmount.toString(), targetAmountMinor: targetAmount.toString(), status }];
  });
  const hashInput = {
    workspace: snapshot.workspace,
    entities: entities.map(entity => ({ kind: entity.entity_kind, id: entity.entity_id, payload: payloads.get(`${entity.entity_kind}\0${entity.entity_id}`) })),
    rootDocuments: roots.map(root => ({ key: root.document_key, payload: parsePayload(root.payload_json) })),
    files
  };
  const sourceSha256 = createHash('sha256').update(canonical(hashInput)).digest('hex');
  const sourceCount = sourceRows.length;
  const targetCount = reconciledTargetCount;
  const blockers = missingFiles.length + orphanRows.length + unmappedRows.length + reconciliationIssues.length;

  return {
    runId,
    workspaceId: snapshot.workspace.id,
    sourceSchemaVersion: snapshot.workspace.schema_version,
    targetSchemaVersion,
    installedApplicationSchemaVersion,
    sourceSha256,
    status: 'DRY_RUN',
    validationStatus: blockers === 0 ? 'VALIDATED' : 'BLOCKED',
    businessRecordsChanged: false,
    auditMetadataRecorded: false,
    sourceCount,
    targetCount,
    counts: {
      sourceByKind,
      rootDocuments: rootCounts,
      targetByKind: targetCounts,
      committedFiles: files.filter(file => file.state === 'COMMITTED').length
    },
    reconciliationByTarget,
    moneyTotals: {
      sourceNativeUnits: Object.fromEntries(Object.entries(sourceMoney).map(([key, value]) => [key, value.toString()])),
      targetQarMinorUnits: targetMoneyTotals,
      reconciliation: moneyReconciliation
    },
    missingFiles,
    orphanRows,
    unmappedRows,
    reconciliationIssues,
    fieldReconciliation,
    blockers
  };
}
