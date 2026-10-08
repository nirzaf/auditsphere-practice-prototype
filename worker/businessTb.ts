import * as z from 'zod';
import * as XLSX from 'xlsx';
import type { Env } from './env';
import { sha256Hex } from './http';
import { ApiError } from './errors';
import { requireWorkspace } from './db';
import type { BusinessContext, BusinessMutation } from './business';

const id = z.uuid();
const minor = z.string().regex(/^-?(0|[1-9]\d{0,15})$/).refine(value => Number.isSafeInteger(Number(value)), 'Amount is outside supported QAR minor-unit precision.');
const columnMap = z.strictObject({
  headerRow: z.number().int().min(1).max(10000),
  accountCodeColumn: z.number().int().min(0).max(255),
  accountNameColumn: z.number().int().min(0).max(255),
  balanceColumn: z.number().int().min(0).max(255).optional(),
  debitColumn: z.number().int().min(0).max(255).optional(),
  creditColumn: z.number().int().min(0).max(255).optional(),
  priorBalanceColumn: z.number().int().min(0).max(255).optional(),
  currencyColumn: z.number().int().min(0).max(255).optional()
}).superRefine((value, ctx) => {
  if (value.balanceColumn === undefined && (value.debitColumn === undefined || value.creditColumn === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['balanceColumn'], message: 'Select one signed balance column or both debit and credit columns.' });
  }
  if (value.balanceColumn !== undefined && (value.debitColumn !== undefined || value.creditColumn !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['balanceColumn'], message: 'Choose signed balance or debit/credit columns, not both.' });
  }
  const selected = [value.accountCodeColumn, value.accountNameColumn, value.balanceColumn, value.debitColumn, value.creditColumn, value.priorBalanceColumn, value.currencyColumn]
    .filter((column): column is number => column !== undefined);
  if (new Set(selected).size !== selected.length) ctx.addIssue({ code: 'custom', path: ['accountCodeColumn'], message: 'Each imported field must use a different source column.' });
});

const tbImport = z.strictObject({ type: z.literal('tb.import'), payload: z.strictObject({
  engagementId: id, fileVersionId: id, worksheet: z.string().trim().max(200).optional(), columnMap
}) });
const tbActivate = z.strictObject({ type: z.literal('tb.activate'), payload: z.strictObject({ engagementId: id, importId: id, contentSha256: z.string().regex(/^[a-f0-9]{64}$/) }) });
const mappingPropose = z.strictObject({ type: z.literal('tb.mapping.propose'), payload: z.strictObject({ engagementId: id, tbVersionId: id }) });
const mappingSet = z.strictObject({ type: z.literal('tb.mapping.set'), payload: z.strictObject({ draftId: id, tbLineId: id, expectedVersion: z.number().int().positive(), fsliId: id.nullable(), reason: z.string().trim().min(10).max(2000).optional() }) });
const mappingApprove = z.strictObject({ type: z.literal('tb.mapping.approve'), payload: z.strictObject({ engagementId: id, draftId: id, draftHash: z.string().regex(/^[a-f0-9]{64}$/) }) });
const adjustments = z.array(z.strictObject({ description: z.string().trim().min(5).max(1000), amountMinor: minor, evidenceFileId: id })).max(100);
const rawRates = z.strictObject({ benchmarkRateBps: z.number().int(), performanceRateBps: z.number().int(), sadRateBps: z.number().int() });
const materialityCalculate = z.strictObject({ type: z.literal('materiality.calculate'), payload: z.strictObject({
  engagementId: id, tbVersionId: id, mappingVersionId: id, benchmark: z.enum(['PBT','REVENUE','TOTAL_ASSETS','EQUITY']),
  ...rawRates.shape, adjustments: adjustments.default([]), normalizationReason: z.string().trim().min(10).max(2000).optional(),
  planningMinor: minor.optional(), performanceMinor: minor.optional(), sadMinor: minor.optional(), roundingReason: z.string().trim().min(10).max(2000).optional()
}).refine(value => [value.planningMinor, value.performanceMinor, value.sadMinor].every(item => item === undefined)
  || [value.planningMinor, value.performanceMinor, value.sadMinor].every(item => item !== undefined), 'All three adjusted materiality values must be provided together.') });
const materialityAdjust = z.strictObject({ type: z.literal('materiality.adjust'), payload: z.strictObject({
  materialityVersionId: id, planningMinor: minor, performanceMinor: minor, sadMinor: minor,
  reason: z.string().trim().min(10).max(2000)
}) });
const riskSet = z.strictObject({ type: z.literal('fsli.risk.set'), payload: z.strictObject({
  engagementId: id, materialityVersionId: id, fsliId: id, inherentRisk: z.enum(['LOW','MODERATE','HIGH']),
  criticalEstimate: z.boolean(), rationale: z.string().trim().min(10).max(2000)
}) });
const planningCompile = z.strictObject({ type: z.literal('planning.compile'), payload: z.strictObject({
  engagementId: id, tbVersionId: id, mappingVersionId: id, materialityVersionId: id,
  scopeText: z.string().trim().min(10).max(10000), strategyText: z.string().trim().min(10).max(10000)
}) });
const planningApprove = z.strictObject({ type: z.literal('planning.approve'), payload: z.strictObject({
  engagementId: id, planningVersionId: id, dependencyHash: z.string().regex(/^[a-f0-9]{64}$/), rationale: z.string().trim().min(10).max(10000)
}) });

export const businessTbCommands = [tbImport, tbActivate, mappingPropose, mappingSet, mappingApprove, materialityCalculate,
  materialityAdjust, riskSet, planningCompile, planningApprove] as const;
export const businessTbCommandSchema = z.discriminatedUnion('type', businessTbCommands);
export type BusinessTbCommand = z.infer<typeof businessTbCommandSchema>;
export function isBusinessTbCommand(command: { type: string }): command is BusinessTbCommand {
  return command.type.startsWith('tb.') || command.type.startsWith('materiality.') || command.type === 'fsli.risk.set' || command.type.startsWith('planning.');
}

const FSLIS = [
  ['CASH','Cash and cash equivalents','BALANCE_SHEET','ASSET','DEBIT',1],
  ['RECEIVABLES','Trade and other receivables','BALANCE_SHEET','ASSET','DEBIT',2],
  ['INVENTORIES','Inventories','BALANCE_SHEET','ASSET','DEBIT',3],
  ['OTHER_CURRENT_ASSETS','Other current assets','BALANCE_SHEET','ASSET','DEBIT',4],
  ['PROPERTY_EQUIPMENT','Property, plant and equipment','BALANCE_SHEET','ASSET','DEBIT',5],
  ['OTHER_NONCURRENT_ASSETS','Other non-current assets','BALANCE_SHEET','ASSET','DEBIT',6],
  ['PAYABLES','Trade and other payables','BALANCE_SHEET','LIABILITY','CREDIT',7],
  ['BORROWINGS','Borrowings','BALANCE_SHEET','LIABILITY','CREDIT',8],
  ['PROVISIONS','Provisions','BALANCE_SHEET','LIABILITY','CREDIT',9],
  ['OTHER_LIABILITIES','Other liabilities','BALANCE_SHEET','LIABILITY','CREDIT',10],
  ['EQUITY','Equity','BALANCE_SHEET','EQUITY','CREDIT',11],
  ['REVENUE','Revenue','PROFIT_LOSS','REVENUE','CREDIT',12],
  ['COST_OF_SALES','Cost of sales','PROFIT_LOSS','EXPENSE','DEBIT',13],
  ['OTHER_INCOME','Other income','PROFIT_LOSS','REVENUE','CREDIT',14],
  ['ADMIN_EXPENSE','Administrative expenses','PROFIT_LOSS','EXPENSE','DEBIT',15],
  ['FINANCE_COST','Finance costs','PROFIT_LOSS','EXPENSE','DEBIT',16],
  ['INCOME_TAX','Income tax expense','PROFIT_LOSS','EXPENSE','DEBIT',17],
  ['OTHER_EXPENSE','Other expenses','PROFIT_LOSS','EXPENSE','DEBIT',18]
] as const;

type Engagement = { id: string; client_id: string; lifecycle_state: string; period_start: string; period_end: string; locked_at: string | null; standards_profile_id: string };
type MappingLine = { id: string; account_code: string; current_minor: number; fsli_id: string; fsli_code: string; category: string; statement: string; inherent_risk?: string; critical_estimate?: number; rationale?: string; risk_id?: string; risk_revision?: number; band?: string };

function requireInternalRead(context: BusinessContext): void {
  if (!context.allowedActions.includes('planning.read') || context.actor.persona === 'CLIENT') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Internal trial-balance and planning access is required.');
  }
}
function requireTbWriter(context: BusinessContext, reviewer = false): void {
  if (!context.allowedActions.includes('tb.manage') || context.actor.persona === 'CLIENT'
    || (reviewer && context.actor.persona !== 'REVIEWER' && context.actor.persona !== 'APPROVER')) {
    throw new ApiError('PERSONA_ACTION_DENIED', 'This internal persona cannot perform the requested trial-balance or planning action.');
  }
}
function requirePartner(context: BusinessContext): void {
  if (context.actor.persona !== 'APPROVER' || context.actor.staffGrade !== 'PARTNER') {
    throw new ApiError('PERSONA_ACTION_DENIED', 'Only a PARTNER APPROVER can sign off the planning version.');
  }
}
async function getEngagement(env: Env, workspaceId: string, context: BusinessContext, engagementId: string): Promise<Engagement> {
  const row = await env.DB.prepare(`SELECT id,client_id,lifecycle_state,period_start,period_end,locked_at,standards_profile_id
    FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId, engagementId).first<Engagement>();
  if (!row) throw new ApiError('NOT_FOUND', 'The engagement was not found.');
  if ((context.scope.clientId && context.scope.clientId !== row.client_id) || (context.scope.engagementId && context.scope.engagementId !== row.id)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The engagement is outside the selected planning context.');
  }
  if (row.locked_at || row.lifecycle_state === 'ARCHIVED_READ_ONLY') throw new ApiError('WORKSPACE_FROZEN', 'Archived engagements are read-only.');
  return row;
}

export function toSheetRows(bytes: Uint8Array, worksheet?: string): { workbook: XLSX.WorkBook; sheetName: string; sheet: XLSX.WorkSheet } {
  // Office encrypts OOXML workbooks into an OLE Compound File Binary container.
  // Reject that format before asking SheetJS to parse it; password-protected
  // workbooks cannot be safely previewed or imported by this workflow.
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
    && bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1) {
    throw new ApiError('VALIDATION_FAILED', 'Password-protected or legacy binary Excel workbooks are not supported. If password-protected, remove the password, then export a non-macro XLSX or CSV file with static values and retry.');
  }
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(bytes, { type: 'array', raw: true, cellFormula: true, cellNF: false, bookVBA: true, bookFiles: true, WTF: true }); }
  catch { throw new ApiError('VALIDATION_FAILED', 'The workbook is encrypted, corrupt, or unsupported. Export a non-macro CSV/XLSX file with static values and retry.'); }
  if ((workbook as XLSX.WorkBook & { vbaraw?: unknown }).vbaraw) throw new ApiError('VALIDATION_FAILED', 'Macro-enabled workbooks are not accepted. Save a non-macro XLSX or CSV copy.');
  const workbookFiles = workbook as XLSX.WorkBook & { keys?: string[] };
  if ((workbookFiles.keys ?? []).some(key => /^\/?xl\/externalLinks\//i.test(key))) {
    throw new ApiError('VALIDATION_FAILED', 'Workbooks with external links are not accepted. Replace linked cells with supported static values.');
  }
  const sheetName = worksheet ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !workbook.SheetNames.includes(sheetName)) throw new ApiError('VALIDATION_FAILED', 'Choose a worksheet that exists in the uploaded workbook.');
  return { workbook, sheetName, sheet };
}
function cellValue(sheet: XLSX.WorkSheet, row: number, column: number): unknown {
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v;
}
function displayedCell(sheet: XLSX.WorkSheet, row: number, column: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
  if (!cell) return '';
  if (cell.f) return '[formula: static value required]';
  return String(cell.w ?? cell.v ?? '').slice(0, 500);
}

export async function getBusinessTrialBalancePreview(env: Env, workspaceId: string, context: BusinessContext,
  fileVersionId: string, worksheet?: string) {
  requireTbWriter(context);
  const file = await env.DB.prepare(`SELECT id,client_id,engagement_id,folder_id,purpose,state,immutable,media_type,size_bytes,sha256,object_key,original_name
    FROM file_versions WHERE workspace_id=? AND id=?`).bind(workspaceId, fileVersionId).first<{
      id: string; client_id: string; engagement_id: string; folder_id: string | null; purpose: string; state: string; immutable: number;
      media_type: string; size_bytes: number; sha256: string | null; object_key: string; original_name: string
    }>();
  if (!file || file.purpose !== 'TB' || file.state !== 'COMMITTED' || file.immutable !== 1 || !file.sha256) {
    throw new ApiError('GATE_BLOCKED', 'Select an exact committed immutable TB source file.');
  }
  if (!file.engagement_id || (context.scope.engagementId && context.scope.engagementId !== file.engagement_id)
    || (context.scope.clientId && context.scope.clientId !== file.client_id)) throw new ApiError('FORBIDDEN_SCOPE', 'The TB file is outside the selected client engagement.');
  const folder = await env.DB.prepare(`SELECT code FROM engagement_folders WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=?`)
    .bind(workspaceId, file.folder_id, file.client_id, file.engagement_id).first<{ code: string }>();
  if (!folder || folder.code !== 'TB_SCHEDULES') throw new ApiError('GATE_BLOCKED', 'Put the TB source in the engagement TB & Schedules folder before importing it.');
  const object = await env.FILES.get(file.object_key);
  if (!object) throw new ApiError('UNAVAILABLE', 'The committed TB source bytes are unavailable in private file storage.');
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (await digestBytes(bytes) !== file.sha256) throw new ApiError('UNAVAILABLE', 'The stored TB bytes do not match the committed source hash.');
  const { workbook, sheetName, sheet } = toSheetRows(bytes, worksheet);
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
  const preview = [] as string[][];
  for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 9); row += 1) {
    preview.push(Array.from({ length: Math.min(range.e.c + 1, 32) }, (_, column) => displayedCell(sheet, row, column)));
  }
  return { file: { id: file.id, name: file.original_name, mediaType: file.media_type, sizeBytes: file.size_bytes, sha256: file.sha256 },
    worksheetNames: workbook.SheetNames, selectedWorksheet: sheetName, preview, previewStartsAtRow: range.s.r + 1, maxColumns: Math.min(range.e.c + 1, 32) };
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

type ParsedTbLine = { id: string; rowNumber: number; accountCode: string | null; accountName: string | null; currentMinor: number | null; priorMinor: number | null; sourceText: string; errors: string[] };
export type TrialBalanceColumnMap = z.infer<typeof columnMap>;
type ColumnMap = TrialBalanceColumnMap;
type ImportRow = { id: string; workspace_id: string; client_id: string; engagement_id: string; file_version_id: string; worksheet: string | null; column_map_json: string; source_sha256: string };

function exactMinor(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const scaled = value * 100;
    const rounded = Math.round(scaled);
    return Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) < 1e-7 ? rounded : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const match = text.match(/^(-?)(0|[1-9]\d*)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const units = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0') || '0');
  const signed = match[1] ? -units : units;
  const numeric = Number(signed);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

export function parseTrialBalanceSheet(sheet: XLSX.WorkSheet, config: TrialBalanceColumnMap): {
  lines: ParsedTbLine[]; errors: Array<{ row: number; code: string; message: string }>;
  debits: number; credits: number; priorDebits: number | null; priorCredits: number | null
} {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
  if (config.headerRow > range.e.r + 1) throw new ApiError('VALIDATION_FAILED', 'The configured header row is below the worksheet data range.');
  if (range.e.c + 1 > 256) throw new ApiError('VALIDATION_FAILED', 'This TB sheet exceeds the 256-column parser limit.');
  if (range.e.r + 1 - config.headerRow > 20000) throw new ApiError('VALIDATION_FAILED', 'This TB exceeds the 20,000-row import limit. Split it into supported ledger periods before retrying.');
  const lines: ParsedTbLine[] = [];
  const errors: Array<{ row: number; code: string; message: string }> = [];
  const seen = new Map<string, number>();
  let debits = 0n; let credits = 0n; let priorDebits = 0n; let priorCredits = 0n; let hasPrior = config.priorBalanceColumn !== undefined;
  for (let row = config.headerRow; row <= range.e.r; row += 1) {
    const fields = [config.accountCodeColumn, config.accountNameColumn, config.balanceColumn, config.debitColumn, config.creditColumn, config.priorBalanceColumn, config.currencyColumn]
      .filter((column): column is number => column !== undefined);
    const values = fields.map(column => cellValue(sheet, row, column));
    if (values.every(value => value === undefined || value === null || value === '')) continue;
    const rowNumber = row + 1;
    const rowErrors: string[] = [];
    for (const column of fields) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell?.f || (typeof cell?.v === 'string' && cell.v.trim().startsWith('='))) {
        rowErrors.push(`Formula at ${XLSX.utils.encode_cell({ r: row, c: column })} has no accepted static source value.`);
      }
    }
    const codeCell = sheet[XLSX.utils.encode_cell({ r: row, c: config.accountCodeColumn })];
    const accountCode = String(codeCell?.w ?? codeCell?.v ?? '').trim();
    const accountName = String(cellValue(sheet, row, config.accountNameColumn) ?? '').trim();
    if (config.currencyColumn !== undefined) {
      const currencyValue = cellValue(sheet, row, config.currencyColumn);
      const currency = typeof currencyValue === 'string' || typeof currencyValue === 'number' ? String(currencyValue).trim().toUpperCase() : '';
      if (currency !== 'QAR') rowErrors.push('Currency must be QAR for this workspace; convert the source before importing.');
    }
    if (!accountCode) rowErrors.push('Account code is required.');
    if (!accountName) rowErrors.push('Account name is required.');
    if (accountCode && seen.has(accountCode)) rowErrors.push(`Duplicate account code also appears at source row ${seen.get(accountCode)}.`);
    if (accountCode && !seen.has(accountCode)) seen.set(accountCode, rowNumber);
    let currentMinor: number | null = null;
    if (config.balanceColumn !== undefined) {
      currentMinor = exactMinor(cellValue(sheet, row, config.balanceColumn));
      if (currentMinor === null) rowErrors.push('Current balance is missing, non-finite, or has more than two decimal places.');
    } else {
      const debit = exactMinor(cellValue(sheet, row, config.debitColumn!));
      const credit = exactMinor(cellValue(sheet, row, config.creditColumn!));
      if (debit === null || credit === null || debit < 0 || credit < 0) rowErrors.push('Debit and credit must be supplied as non-negative QAR amounts with at most two decimals.');
      else currentMinor = debit - credit;
    }
    let priorMinor: number | null = null;
    if (hasPrior) {
      priorMinor = exactMinor(cellValue(sheet, row, config.priorBalanceColumn!));
      if (priorMinor === null) rowErrors.push('Prior-year balance is missing, non-finite, or has more than two decimal places.');
    }
    if (currentMinor !== null) { if (currentMinor >= 0) debits += BigInt(currentMinor); else credits += BigInt(-currentMinor); }
    if (priorMinor !== null) { if (priorMinor >= 0) priorDebits += BigInt(priorMinor); else priorCredits += BigInt(-priorMinor); }
    const sourceText = JSON.stringify({ accountCode, accountName,
      current: config.balanceColumn !== undefined ? cellValue(sheet, row, config.balanceColumn) : { debit: cellValue(sheet, row, config.debitColumn!), credit: cellValue(sheet, row, config.creditColumn!) },
      prior: hasPrior ? cellValue(sheet, row, config.priorBalanceColumn!) : null,
      currency: config.currencyColumn === undefined ? 'QAR' : cellValue(sheet, row, config.currencyColumn) });
    const line: ParsedTbLine = { id: crypto.randomUUID(), rowNumber, accountCode: accountCode || null, accountName: accountName || null,
      currentMinor, priorMinor, sourceText, errors: rowErrors };
    lines.push(line);
    for (const message of rowErrors) errors.push({ row: rowNumber, code: message.startsWith('Formula') ? 'FORMULA_VALUE_REQUIRED' : message.startsWith('Duplicate') ? 'DUPLICATE_ACCOUNT' : 'INVALID_ROW', message });
  }
  if (!lines.length) errors.push({ row: config.headerRow + 1, code: 'EMPTY_TRIAL_BALANCE', message: 'No account rows were found below the selected header.' });
  if (debits > BigInt(Number.MAX_SAFE_INTEGER) || credits > BigInt(Number.MAX_SAFE_INTEGER)
    || priorDebits > BigInt(Number.MAX_SAFE_INTEGER) || priorCredits > BigInt(Number.MAX_SAFE_INTEGER)) {
    errors.push({ row: 0, code: 'AMOUNT_OVERFLOW', message: 'The trial-balance control totals exceed supported QAR precision.' });
  }
  if (!errors.length && debits !== credits) errors.push({ row: 0, code: 'UNBALANCED_TB', message: `Current-period debit and credit totals differ by ${Number(debits - credits)} minor units.` });
  if (!errors.length && hasPrior && priorDebits !== priorCredits) errors.push({ row: 0, code: 'UNBALANCED_PRIOR_TB', message: `Prior-period debit and credit totals differ by ${Number(priorDebits - priorCredits)} minor units.` });
  return { lines, errors, debits: Number(debits), credits: Number(credits), priorDebits: hasPrior ? Number(priorDebits) : null, priorCredits: hasPrior ? Number(priorCredits) : null };
}

/** Worker-side import processor. Chunked rows remain hidden in staging until tb.activate's final atomic batch. */
export async function prepareTrialBalanceImport(env: Env, job: { id: string; workspace_id: string; aggregate_id: string; payload_json: string }) {
  let parsed: ReturnType<typeof parseTrialBalanceSheet> | null = null;
  let failure: { row: number; code: string; message: string } | null = null;
  const imported = await env.DB.prepare(`SELECT id,workspace_id,client_id,engagement_id,file_version_id,worksheet,column_map_json,source_sha256
    FROM tb_imports WHERE workspace_id=? AND id=?`).bind(job.workspace_id, job.aggregate_id).first<ImportRow>();
  if (!imported) throw new ApiError('NOT_FOUND', 'The staged TB import no longer exists.');
  const file = await env.DB.prepare(`SELECT object_key,sha256,state,immutable,media_type FROM file_versions WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=? AND purpose='TB'`)
    .bind(job.workspace_id, imported.file_version_id, imported.client_id, imported.engagement_id)
    .first<{ object_key: string; sha256: string | null; state: string; immutable: number; media_type: string }>();
  if (!file || file.state !== 'COMMITTED' || file.immutable !== 1 || !file.sha256 || file.sha256 !== imported.source_sha256) {
    failure = { row: 0, code: 'COMMITTED_TB_SOURCE_REQUIRED', message: 'The exact committed immutable TB source is unavailable or changed.' };
  }
  let rows: ParsedTbLine[] = [];
  if (!failure && file) {
    try {
      const object = await env.FILES.get(file.object_key);
      if (!object) throw new ApiError('UNAVAILABLE', 'The committed TB file bytes are missing from private storage.');
      const bytes = new Uint8Array(await object.arrayBuffer());
      if (await digestBytes(bytes) !== file.sha256) throw new ApiError('UNAVAILABLE', 'The committed TB source bytes do not match their immutable hash.');
      const { sheet } = toSheetRows(bytes, imported.worksheet ?? undefined);
      const config = columnMap.parse(JSON.parse(imported.column_map_json));
      parsed = parseTrialBalanceSheet(sheet, config);
      rows = parsed.lines;
    } catch (error) {
      failure = { row: 0, code: error instanceof ApiError ? error.code : 'TB_PARSE_FAILED',
        message: error instanceof Error ? error.message : 'The TB could not be parsed. Select a non-macro CSV/XLSX source with static values.' };
    }
  }
  for (let offset = 0; offset < rows.length; offset += 40) {
    const chunk = rows.slice(offset, offset + 40);
    const statements = chunk.map(line => env.DB.prepare(`INSERT OR IGNORE INTO tb_staging_lines(id,workspace_id,import_id,source_row_number,account_code,account_name,current_minor,prior_minor,source_text_json,errors_json)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(line.id, job.workspace_id, imported.id, line.rowNumber, line.accountCode, line.accountName,
      line.currentMinor, line.priorMinor, line.sourceText, JSON.stringify(line.errors)));
    statements.push(env.DB.prepare(`UPDATE tb_imports SET status='VALIDATING',row_count=(SELECT COUNT(*) FROM tb_staging_lines WHERE workspace_id=? AND import_id=?),updated_at=?
      WHERE workspace_id=? AND id=? AND status IN ('STAGED','VALIDATING')`).bind(job.workspace_id, imported.id, new Date().toISOString(), job.workspace_id, imported.id));
    await env.DB.batch(statements);
  }
  if (!parsed && !failure) failure = { row: 0, code: 'TB_PARSE_FAILED', message: 'The TB import ended without a parse result.' };
  const errors = failure ? [failure] : parsed!.errors;
  const status = errors.length ? 'INVALID' : 'READY';
  const updated = new Date().toISOString();
  const errorJson = JSON.stringify(errors.slice(0, 100));
  const rawCommand = JSON.parse(job.payload_json) as { commandId?: string };
  const result = { importId: imported.id, status, rowCount: parsed?.lines.length ?? 0, errorCount: errors.length,
    errors: errors.slice(0, 50), currentDebitsMinor: parsed?.debits ?? null, currentCreditsMinor: parsed?.credits ?? null };
  return {
    entityType: 'TB_IMPORT', entityId: imported.id, clientId: imported.client_id, engagementId: imported.engagement_id,
    details: { importId: imported.id, status, errorCount: errors.length }, result,
    statements: [
      env.DB.prepare(`UPDATE tb_imports SET status=?,row_count=?,current_debits_minor=?,current_credits_minor=?,prior_debits_minor=?,prior_credits_minor=?,error_count=?,errors_json=?,updated_at=?
        WHERE workspace_id=? AND id=? AND status IN ('STAGED','VALIDATING')`)
        .bind(status, parsed?.lines.length ?? 0, parsed?.debits ?? null, parsed?.credits ?? null, parsed?.priorDebits ?? null, parsed?.priorCredits ?? null,
          errors.length, errorJson, updated, job.workspace_id, imported.id),
      env.DB.prepare(`UPDATE outbox_jobs SET status='SUCCEEDED',result_json=?,last_error_code=NULL,completed_at=?,lease_until=NULL,updated_at=?,version=version+1
        WHERE workspace_id=? AND id=? AND status='RUNNING'`)
        .bind(JSON.stringify(result), updated, updated, job.workspace_id, job.id)
    ]
  };
}

async function seedFsliCatalog(env: Env, workspaceId: string, framework: string, now: string): Promise<D1PreparedStatement[]> {
  return FSLIS.map(([code, name, statement, category, normalSide, order]) => env.DB.prepare(`INSERT OR IGNORE INTO fsli_catalog
    (id,workspace_id,reporting_framework,code,name,statement,category,normal_side,display_sign,presentation_order,active)
    VALUES(?,?,?,?,?,?,?,?,?,?,1)`).bind(crypto.randomUUID(), workspaceId, framework, code, name, statement, category,
      normalSide, normalSide === 'DEBIT' ? 1 : -1, order));
}

type TbSources = { engagement: Engagement; active_tb_version_id: string | null; active_mapping_version_id: string | null; active_materiality_version_id: string | null; approved_planning_version_id: string | null; portal_frozen_at: string | null };
async function getTbSources(env: Env, workspaceId: string, context: BusinessContext, engagementId: string, allowArchivedRead = false): Promise<TbSources> {
  const engagement = await env.DB.prepare(`SELECT e.id,e.client_id,e.lifecycle_state,e.period_start,e.period_end,e.locked_at,e.standards_profile_id,
      e.active_tb_version_id,e.active_mapping_version_id,e.active_materiality_version_id,e.approved_planning_version_id,e.portal_frozen_at
    FROM engagements e WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId, engagementId)
    .first<Engagement & Omit<TbSources,'engagement'>>();
  if (!engagement) throw new ApiError('NOT_FOUND', 'The engagement was not found.');
  if ((context.scope.clientId && context.scope.clientId !== engagement.client_id) || (context.scope.engagementId && context.scope.engagementId !== engagement.id)) {
    throw new ApiError('FORBIDDEN_SCOPE', 'The engagement is outside the selected TB and planning context.');
  }
  if (!allowArchivedRead && (engagement.locked_at || engagement.lifecycle_state === 'ARCHIVED_READ_ONLY')) throw new ApiError('WORKSPACE_FROZEN', 'Archived engagements are read-only.');
  const { id: _id, client_id: _clientId, lifecycle_state: _lifecycle, period_start: _start, period_end: _end,
    locked_at: _locked, standards_profile_id: _standards, ...pins } = engagement;
  return { engagement: { id: engagement.id, client_id: engagement.client_id, lifecycle_state: engagement.lifecycle_state,
    period_start: engagement.period_start, period_end: engagement.period_end, locked_at: engagement.locked_at,
    standards_profile_id: engagement.standards_profile_id }, ...pins };
}

function requirePlanningStage(engagement: Engagement): void {
  if (engagement.lifecycle_state !== 'PORTAL_ACTIVE_PLANNING') {
    throw new ApiError('INVALID_STATE', 'TB and planning revisions are available only while the engagement is in active planning.');
  }
}

async function importCommand(env: Env, workspaceId: string, context: BusinessContext, command: Extract<BusinessTbCommand,{type:'tb.import'}>, commandId: string, now: string): Promise<BusinessMutation> {
  requireTbWriter(context);
  const { engagementId, fileVersionId, worksheet, columnMap: config } = command.payload;
  const sources = await getTbSources(env, workspaceId, context, engagementId);
  requirePlanningStage(sources.engagement);
  const file = await env.DB.prepare(`SELECT f.id,f.purpose,f.state,f.immutable,f.sha256,f.media_type,f.object_key,f.folder_id
      FROM file_versions f WHERE f.workspace_id=? AND f.id=? AND f.client_id=? AND f.engagement_id=?`)
    .bind(workspaceId, fileVersionId, sources.engagement.client_id, engagementId)
    .first<{ id: string; purpose: string; state: string; immutable: number; sha256: string | null; media_type: string; object_key: string; folder_id: string | null }>();
  if (!file || file.purpose !== 'TB' || file.state !== 'COMMITTED' || file.immutable !== 1 || !file.sha256) {
    throw new ApiError('GATE_BLOCKED', 'Select a committed, immutable TB source file for this engagement.');
  }
  if (!['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(file.media_type)) {
    throw new ApiError('VALIDATION_FAILED', 'TB import supports CSV and non-macro XLSX files only.');
  }
  const folder = await env.DB.prepare(`SELECT code FROM engagement_folders WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=?`)
    .bind(workspaceId, file.folder_id, sources.engagement.client_id, engagementId).first<{ code: string }>();
  if (!folder || folder.code !== 'TB_SCHEDULES') throw new ApiError('GATE_BLOCKED', 'The TB source must be filed under TB & Schedules before import.');
  const standard = await env.DB.prepare(`SELECT reporting_framework FROM standards_profiles WHERE workspace_id=? AND id=?`)
    .bind(workspaceId, sources.engagement.standards_profile_id).first<{ reporting_framework: string }>();
  if (!standard) throw new ApiError('GATE_BLOCKED', 'An active standards profile is required to seed scoped FSLI definitions.');
  const importId = crypto.randomUUID(); const jobId = crypto.randomUUID();
  const payloadJson = JSON.stringify({ commandId, importId, engagementId, clientId: sources.engagement.client_id });
  const timestamp = new Date(now).toISOString();
  return { statements: [
    ...await seedFsliCatalog(env, workspaceId, standard.reporting_framework, timestamp),
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,98,CASE WHEN EXISTS(SELECT 1 FROM engagements e JOIN file_versions f ON f.workspace_id=e.workspace_id AND f.client_id=e.client_id AND f.engagement_id=e.id
        WHERE e.workspace_id=? AND e.id=? AND e.version=(SELECT version FROM engagements WHERE workspace_id=? AND id=?)
          AND e.lifecycle_state='PORTAL_ACTIVE_PLANNING' AND e.locked_at IS NULL AND e.portal_frozen_at IS NULL
          AND f.id=? AND f.purpose='TB' AND f.state='COMMITTED' AND f.immutable=1 AND f.sha256=? AND f.folder_id=?
          AND EXISTS(SELECT 1 FROM engagement_folders d WHERE d.workspace_id=f.workspace_id AND d.id=f.folder_id AND d.code='TB_SCHEDULES'))
        THEN 1 ELSE 0 END`)
      .bind(workspaceId, workspaceId, engagementId, workspaceId, engagementId, fileVersionId, file.sha256, file.folder_id),
    env.DB.prepare(`INSERT INTO tb_imports(id,workspace_id,version,client_id,engagement_id,file_version_id,status,worksheet,column_map_json,row_count,source_sha256,
      current_debits_minor,current_credits_minor,prior_debits_minor,prior_credits_minor,error_count,errors_json,created_by_actor_id,created_at,updated_at)
      VALUES(?,?,1,?,?,?,'STAGED',?,?,0,?,NULL,NULL,NULL,NULL,0,'[]',?,?,?)`)
      .bind(importId, workspaceId, sources.engagement.client_id, engagementId, fileVersionId, worksheet ?? null, JSON.stringify(config), file.sha256, context.actor.id, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,
      next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
      VALUES(?,?,1,'IMPORT_TB',?,1,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
      .bind(jobId, workspaceId, importId, payloadJson, `tb-import:${importId}`, now, timestamp, timestamp)
  ], result: { importId, jobId, status: 'STAGED', sourceSha256: file.sha256 }, entityType: 'TB_IMPORT', entityId: importId,
    beforeVersion: null, afterVersion: 1, auditDetails: { engagementId, fileVersionId, sourceSha256: file.sha256 } };
}

export async function activateTrialBalance(env: Env, workspaceId: string, context: BusinessContext,
  command: Extract<BusinessTbCommand,{type:'tb.activate'}>, now: string): Promise<BusinessMutation> {
  requireTbWriter(context);
  const sources = await getTbSources(env, workspaceId, context, command.payload.engagementId);
  requirePlanningStage(sources.engagement);
  const imported = await env.DB.prepare(`SELECT id,client_id,engagement_id,file_version_id,status,row_count,source_sha256,current_debits_minor,current_credits_minor,
      prior_debits_minor,prior_credits_minor,error_count FROM tb_imports WHERE workspace_id=? AND id=? AND engagement_id=?`)
    .bind(workspaceId, command.payload.importId, command.payload.engagementId).first<{ id: string; client_id: string; engagement_id: string; file_version_id: string;
      status: string; row_count: number; source_sha256: string; current_debits_minor: number | null; current_credits_minor: number | null;
      prior_debits_minor: number | null; prior_credits_minor: number | null; error_count: number }>();
  if (!imported || imported.status !== 'READY' || imported.source_sha256 !== command.payload.contentSha256 || imported.error_count !== 0
    || imported.row_count <= 0 || imported.current_debits_minor !== imported.current_credits_minor) {
    throw new ApiError('GATE_BLOCKED', 'Only a ready, error-free, balanced TB import with the exact verified content hash can be activated.');
  }
  const staged = await env.DB.prepare(`SELECT id,source_row_number,account_code,account_name,current_minor,prior_minor,source_text_json
    FROM tb_staging_lines WHERE workspace_id=? AND import_id=? ORDER BY source_row_number`).bind(workspaceId, imported.id).all<Record<string,unknown>>();
  if ((staged.results?.length ?? 0) !== imported.row_count) throw new ApiError('VERSION_CONFLICT', 'Staged TB row count changed. Re-run validation before activation.');
  const contentHash = await sha256Hex(JSON.stringify((staged.results ?? []).map(row => [row.source_row_number,row.account_code,row.account_name,row.current_minor,row.prior_minor])));
  const lineErrors = await env.DB.prepare(`SELECT source_row_number,errors_json FROM tb_staging_lines WHERE workspace_id=? AND import_id=? AND errors_json<>'[]' LIMIT 1`)
    .bind(workspaceId, imported.id).first<{ source_row_number: number; errors_json: string }>();
  if (lineErrors) throw new ApiError('VALIDATION_FAILED', `Source row ${lineErrors.source_row_number} contains invalid values and cannot be activated.`);
  const revision = (await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS revision FROM tb_versions WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId, imported.engagement_id).first<{ revision: number }>())?.revision ?? 1;
  const tbVersionId = crypto.randomUUID();
  const priorPresent = imported.prior_debits_minor !== null && imported.prior_credits_minor !== null;
  const timestamp = new Date(now).toISOString();
  const staleId = crypto.randomUUID();
  const hasApprovedPlan = Boolean(sources.approved_planning_version_id);
  const statements = [
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok)
      SELECT ?,99,CASE WHEN EXISTS(SELECT 1 FROM tb_imports i JOIN engagements e ON e.workspace_id=i.workspace_id AND e.id=i.engagement_id
        JOIN file_versions f ON f.workspace_id=i.workspace_id AND f.id=i.file_version_id AND f.client_id=i.client_id AND f.engagement_id=i.engagement_id
        WHERE i.workspace_id=? AND i.id=? AND i.status='READY' AND i.source_sha256=? AND i.row_count=? AND i.error_count=0
          AND i.current_debits_minor=i.current_credits_minor AND e.lifecycle_state='PORTAL_ACTIVE_PLANNING' AND e.locked_at IS NULL
          AND e.active_tb_version_id IS ? AND f.state='COMMITTED' AND f.immutable=1 AND f.sha256=i.source_sha256
          AND f.purpose='TB' AND EXISTS(SELECT 1 FROM engagement_folders d WHERE d.workspace_id=f.workspace_id AND d.id=f.folder_id AND d.code='TB_SCHEDULES')
          AND NOT EXISTS(SELECT 1 FROM tb_staging_lines s WHERE s.workspace_id=i.workspace_id AND s.import_id=i.id AND s.errors_json<>'[]'))
        THEN 1 ELSE 0 END`)
      .bind(workspaceId, workspaceId, imported.id, command.payload.contentSha256, imported.row_count, sources.active_tb_version_id),
    env.DB.prepare(`INSERT INTO tb_versions(id,workspace_id,client_id,engagement_id,revision,import_id,period_start,period_end,currency,current_debits_minor,
      current_credits_minor,prior_debits_minor,prior_credits_minor,prior_present,row_count,content_sha256,accepted_by_actor_id,accepted_at)
      VALUES(?,?,?,?,?,?,?,?,'QAR',?,?,?,?,?,?,?, ?,?)`)
      .bind(tbVersionId, workspaceId, imported.client_id, imported.engagement_id, revision, imported.id, sources.engagement.period_start,
        sources.engagement.period_end, imported.current_debits_minor, imported.current_credits_minor, imported.prior_debits_minor,
        imported.prior_credits_minor, priorPresent ? 1 : 0, imported.row_count, contentHash, context.actor.id, timestamp),
    env.DB.prepare(`INSERT INTO tb_lines(id,workspace_id,client_id,engagement_id,tb_version_id,source_row_number,account_code,account_name,current_minor,prior_minor,source_text_json)
      SELECT s.id,s.workspace_id,i.client_id,i.engagement_id,?,s.source_row_number,s.account_code,s.account_name,s.current_minor,s.prior_minor,s.source_text_json
        FROM tb_staging_lines s JOIN tb_imports i ON i.workspace_id=s.workspace_id AND i.id=s.import_id
        WHERE s.workspace_id=? AND s.import_id=? AND s.errors_json='[]' ORDER BY s.source_row_number`)
      .bind(tbVersionId, workspaceId, imported.id),
    env.DB.prepare(`UPDATE engagements SET active_tb_version_id=?,active_mapping_version_id=NULL,active_materiality_version_id=NULL,
      approved_planning_version_id=NULL,version=version+1,updated_at=?,updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND lifecycle_state='PORTAL_ACTIVE_PLANNING' AND active_tb_version_id IS ? AND locked_at IS NULL`)
      .bind(tbVersionId, timestamp, context.actor.id, workspaceId, imported.engagement_id, sources.active_tb_version_id),
    env.DB.prepare(`UPDATE tb_imports SET status='ACTIVATED',version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND status='READY'`)
      .bind(timestamp, workspaceId, imported.id)
  ];
  if (hasApprovedPlan && sources.approved_planning_version_id) statements.splice(4, 0,
    env.DB.prepare(`INSERT INTO planning_stale_events(id,workspace_id,planning_version_id,source_type,source_id,reason,recorded_at)
      VALUES(?,?,?,'TB_VERSION',?,'A newer accepted TB source changed the approved planning basis.',?)`)
      .bind(staleId, workspaceId, sources.approved_planning_version_id, tbVersionId, timestamp));
  return { statements, result: { tbVersionId, revision, rowCount: imported.row_count, contentSha256: contentHash,
    currentDebitsMinor: String(imported.current_debits_minor), currentCreditsMinor: String(imported.current_credits_minor), priorPresent },
    entityType: 'TB_VERSION', entityId: tbVersionId, beforeVersion: sources.active_tb_version_id ? 1 : null, afterVersion: revision,
    auditDetails: { importId: imported.id, fileVersionId: imported.file_version_id, contentSha256: contentHash, invalidatedPlanningVersionId: sources.approved_planning_version_id } };
}

type MappingDraftRow = { id: string; version: number; tb_line_id: string; account_code: string; account_name: string; current_minor: number; prior_minor: number | null;
  fsli_id: string | null; origin: string | null; source_historical_mapping_id: string | null; history_period_end: string | null;
  history_mapping_revision: number | null; suggestion_kind: string | null; suggestion_score: number | null;
  confirmed: number; reason: string | null };
function mappingNameTokens(value: string): Set<string> {
  const ignored = new Set(['account','accounts','balance','balances','current','noncurrent','and','or','the','other']);
  return new Set(value.normalize('NFKD').toLocaleLowerCase('en-US').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter(token => token.length > 1 && !ignored.has(token)));
}
function mappingNameSimilarity(left: string, right: string): number {
  const leftTokens = mappingNameTokens(left); const rightTokens = mappingNameTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return Math.round(intersection / new Set([...leftTokens, ...rightTokens]).size * 100);
}
function nameSimilaritySuggestion(accountName: string, definitions: Array<{ id: string; name: string }>) {
  const ranked = definitions.map(definition => ({ fsliId: definition.id, score: mappingNameSimilarity(accountName, definition.name) }))
    .sort((left, right) => right.score - left.score || left.fsliId.localeCompare(right.fsliId));
  const best = ranked[0]; const second = ranked[1];
  if (!best || best.score < 60 || (second && best.score - second.score < 15)) return null;
  return best;
}
async function mappingDraftRows(env: Env, workspaceId: string, draftId: string): Promise<MappingDraftRow[]> {
  const result = await env.DB.prepare(`SELECT d.id,d.version,d.tb_line_id,l.account_code,l.account_name,l.current_minor,l.prior_minor,d.fsli_id,d.origin,
      d.source_historical_mapping_id,history.effective_period_end AS history_period_end,source_version.revision AS history_mapping_revision,
      d.suggestion_kind,d.suggestion_score,d.confirmed,d.reason
    FROM mapping_draft_lines d JOIN tb_lines l ON l.workspace_id=d.workspace_id AND l.id=d.tb_line_id
    LEFT JOIN mapping_memory history ON history.workspace_id=d.workspace_id AND history.id=d.source_historical_mapping_id
    LEFT JOIN mapping_versions source_version ON source_version.workspace_id=history.workspace_id AND source_version.id=history.source_mapping_version_id
    WHERE d.workspace_id=? AND d.draft_id=? ORDER BY l.source_row_number,l.account_code`)
    .bind(workspaceId,draftId).all<MappingDraftRow>();
  return result.results ?? [];
}
async function hashMappingDraft(rows: MappingDraftRow[]): Promise<string> {
  return sha256Hex(JSON.stringify(rows.map(row => [row.tb_line_id,row.fsli_id,row.origin,row.source_historical_mapping_id,
    row.suggestion_kind,row.suggestion_score,row.confirmed,row.reason])));
}

async function proposeMapping(env: Env, workspaceId: string, context: BusinessContext,
  command: Extract<BusinessTbCommand,{type:'tb.mapping.propose'}>, now: string): Promise<BusinessMutation> {
  requireTbWriter(context);
  const sources = await getTbSources(env, workspaceId, context, command.payload.engagementId);
  requirePlanningStage(sources.engagement);
  if (sources.active_tb_version_id !== command.payload.tbVersionId) throw new ApiError('VERSION_CONFLICT', 'Choose the current active TB version before proposing mappings.');
  const standard = await env.DB.prepare(`SELECT reporting_framework FROM standards_profiles WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,sources.engagement.standards_profile_id).first<{ reporting_framework: string }>();
  if (!standard) throw new ApiError('GATE_BLOCKED', 'The engagement reporting framework is unavailable.');
  const lines = await env.DB.prepare(`SELECT l.id,l.account_code,l.account_name,l.current_minor,
      (SELECT mm.id FROM mapping_memory mm WHERE mm.workspace_id=l.workspace_id AND mm.client_id=l.client_id AND mm.reporting_framework=? AND mm.account_code=l.account_code
        AND mm.effective_period_end<?
        ORDER BY mm.effective_period_end DESC,mm.id DESC LIMIT 1) AS history_id,
      (SELECT mm.fsli_id FROM mapping_memory mm WHERE mm.workspace_id=l.workspace_id AND mm.client_id=l.client_id AND mm.reporting_framework=? AND mm.account_code=l.account_code
        AND mm.effective_period_end<?
        ORDER BY mm.effective_period_end DESC,mm.id DESC LIMIT 1) AS history_fsli_id
    FROM tb_lines l WHERE l.workspace_id=? AND l.engagement_id=? AND l.tb_version_id=? ORDER BY l.source_row_number,l.account_code`)
    .bind(standard.reporting_framework,sources.engagement.period_start,standard.reporting_framework,sources.engagement.period_start,
      workspaceId,command.payload.engagementId,command.payload.tbVersionId)
    .all<{id:string;account_code:string;account_name:string;current_minor:number;history_id:string|null;history_fsli_id:string|null}>();
  if (!(lines.results?.length)) throw new ApiError('GATE_BLOCKED', 'The selected TB version contains no accepted account rows.');
  const catalog = await env.DB.prepare(`SELECT id,name FROM fsli_catalog WHERE workspace_id=? AND reporting_framework=? AND active=1`)
    .bind(workspaceId,standard.reporting_framework).all<{ id: string; name: string }>();
  const definitions = catalog.results ?? [];
  const revision = (await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS revision FROM mapping_drafts WHERE workspace_id=? AND engagement_id=? AND tb_version_id=?`)
    .bind(workspaceId,command.payload.engagementId,command.payload.tbVersionId).first<{revision:number}>())?.revision ?? 1;
  const draftId = crypto.randomUUID();
  const initial = (lines.results ?? []).map(line => ({ line, id: crypto.randomUUID(),
    suggestion: line.history_fsli_id ? null : nameSimilaritySuggestion(line.account_name, definitions) }));
  const previewRows = initial.map(({line,suggestion}) => ({tb_line_id:line.id,fsli_id:line.history_fsli_id??suggestion?.fsliId??null,
    origin:line.history_id?'EXACT_HISTORY':null,source_historical_mapping_id:line.history_id,history_period_end:null,history_mapping_revision:null,
    suggestion_kind:suggestion?'NAME_SIMILARITY':null,suggestion_score:suggestion?.score??null,confirmed:0,reason:null} as MappingDraftRow));
  const draftHash = await hashMappingDraft(previewRows);
  const nowIso = new Date(now).toISOString();
  return { statements: [
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,100,CASE WHEN EXISTS(
      SELECT 1 FROM engagements e JOIN tb_versions t ON t.workspace_id=e.workspace_id AND t.id=e.active_tb_version_id
      WHERE e.workspace_id=? AND e.id=? AND e.active_tb_version_id=? AND e.lifecycle_state='PORTAL_ACTIVE_PLANNING' AND e.locked_at IS NULL)
      THEN 1 ELSE 0 END`).bind(workspaceId,workspaceId,command.payload.engagementId,command.payload.tbVersionId),
    env.DB.prepare(`INSERT INTO mapping_drafts(id,workspace_id,client_id,engagement_id,tb_version_id,revision,status,reporting_framework,content_sha256,created_by_actor_id,created_at)
      VALUES(?,?,?,?,?,?,'DRAFT',?,?,?,?)`).bind(draftId,workspaceId,sources.engagement.client_id,command.payload.engagementId,command.payload.tbVersionId,
        revision,standard.reporting_framework,draftHash,context.actor.id,nowIso),
    ...initial.map(({line,id:lineId,suggestion}) => env.DB.prepare(`INSERT INTO mapping_draft_lines(id,workspace_id,draft_id,tb_line_id,fsli_id,origin,source_historical_mapping_id,suggestion_kind,suggestion_score,confirmed,reason)
      VALUES(?,?,?,?,?,?,?,?,?,0,NULL)`).bind(lineId,workspaceId,draftId,line.id,line.history_fsli_id??suggestion?.fsliId??null,
        line.history_id?'EXACT_HISTORY':null,line.history_id,suggestion?'NAME_SIMILARITY':null,suggestion?.score??null))
  ], result: { draftId, revision, draftHash, suggestedCount: initial.filter(({line})=>line.history_fsli_id).length,
    nameSimilaritySuggestedCount:initial.filter(({suggestion})=>suggestion).length,
    unmappedCount: initial.filter(({line,suggestion})=>!line.history_fsli_id&&!suggestion).length }, entityType:'MAPPING_DRAFT',entityId:draftId,beforeVersion:null,afterVersion:revision,
    auditDetails:{engagementId:command.payload.engagementId,tbVersionId:command.payload.tbVersionId,reportingFramework:standard.reporting_framework} };
}

async function setMapping(env: Env, workspaceId: string, context: BusinessContext,
  command: Extract<BusinessTbCommand,{type:'tb.mapping.set'}>, now: string): Promise<BusinessMutation> {
  requireTbWriter(context);
  const { draftId,tbLineId,fsliId,expectedVersion }=command.payload;
  const draft=await env.DB.prepare(`SELECT d.id,d.status,d.client_id,d.engagement_id,d.tb_version_id,d.reporting_framework,e.lifecycle_state,e.period_start
    FROM mapping_drafts d JOIN engagements e ON e.workspace_id=d.workspace_id AND e.id=d.engagement_id WHERE d.workspace_id=? AND d.id=?`)
    .bind(workspaceId,draftId).first<{id:string;status:string;client_id:string;engagement_id:string;tb_version_id:string;reporting_framework:string;lifecycle_state:string;period_start:string}>();
  if(!draft)throw new ApiError('NOT_FOUND','The mapping draft was not found.');
  await getTbSources(env,workspaceId,context,draft.engagement_id);
  if(draft.status!=='DRAFT'||draft.lifecycle_state!=='PORTAL_ACTIVE_PLANNING')throw new ApiError('INVALID_STATE','Only a draft for the active planning stage can be mapped.');
  const row=await env.DB.prepare(`SELECT d.id,d.version,d.tb_line_id,l.account_code,d.fsli_id,d.source_historical_mapping_id,d.suggestion_kind,d.suggestion_score,d.confirmed,d.reason
    FROM mapping_draft_lines d JOIN tb_lines l ON l.workspace_id=d.workspace_id AND l.id=d.tb_line_id
    WHERE d.workspace_id=? AND d.draft_id=? AND d.tb_line_id=?`).bind(workspaceId,draftId,tbLineId)
    .first<{id:string;version:number;tb_line_id:string;account_code:string;fsli_id:string|null;source_historical_mapping_id:string|null;
      suggestion_kind:string|null;suggestion_score:number|null;confirmed:number;reason:string|null}>();
  if(!row)throw new ApiError('NOT_FOUND','The TB account is not part of this mapping draft.');
  if(row.version!==expectedVersion)throw new ApiError('VERSION_CONFLICT','This account mapping changed. Reload that row and apply your choice to its current version.');
  let historicalId:string|null=null; let historicalFsli:string|null=null;
  const history=await env.DB.prepare(`SELECT id,fsli_id FROM mapping_memory WHERE workspace_id=? AND client_id=? AND reporting_framework=? AND account_code=?
    AND effective_period_end<?
    ORDER BY effective_period_end DESC,id DESC LIMIT 1`).bind(workspaceId,draft.client_id,draft.reporting_framework,row.account_code,draft.period_start)
    .first<{id:string;fsli_id:string}>();
  historicalId=history?.id??null;historicalFsli=history?.fsli_id??null;
  let origin:string|null=null;let sourceHistory:string|null=null;
  if(fsliId){
    const fsli=await env.DB.prepare(`SELECT id FROM fsli_catalog WHERE workspace_id=? AND id=? AND reporting_framework=? AND active=1`)
      .bind(workspaceId,fsliId,draft.reporting_framework).first<{id:string}>();
    if(!fsli)throw new ApiError('FORBIDDEN_SCOPE','The selected FSLI is outside this engagement reporting framework.');
    if(historicalFsli&&historicalFsli!==fsliId&&(!command.payload.reason||command.payload.reason.trim().length<10)){
      throw new ApiError('VALIDATION_FAILED','Changing an approved historical account mapping requires a reason of at least 10 characters.');
    }
    if(historicalFsli===fsliId&&historicalId){origin='EXACT_HISTORY';sourceHistory=historicalId;}else origin='MANUAL';
  }
  const rows=await mappingDraftRows(env,workspaceId,draftId);
  const nextRows=rows.map(item=>item.tb_line_id!==tbLineId?item:{...item,fsli_id:fsliId,origin,source_historical_mapping_id:sourceHistory,
    suggestion_kind:item.suggestion_kind==='NAME_SIMILARITY'&&item.fsli_id===fsliId?item.suggestion_kind:null,
    suggestion_score:item.suggestion_kind==='NAME_SIMILARITY'&&item.fsli_id===fsliId?item.suggestion_score:null,
    confirmed:fsliId?1:0,reason:command.payload.reason??null});
  const nextHash=await hashMappingDraft(nextRows);
  const statements=[
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,101,CASE WHEN EXISTS(SELECT 1 FROM mapping_drafts d JOIN mapping_draft_lines l
      ON l.workspace_id=d.workspace_id AND l.draft_id=d.id WHERE d.workspace_id=? AND d.id=? AND d.status='DRAFT' AND l.tb_line_id=? AND l.version=?
      AND EXISTS(SELECT 1 FROM engagements e WHERE e.workspace_id=d.workspace_id AND e.id=d.engagement_id AND e.lifecycle_state='PORTAL_ACTIVE_PLANNING'))
      THEN 1 ELSE 0 END`).bind(workspaceId,workspaceId,draftId,tbLineId,expectedVersion),
    env.DB.prepare(`UPDATE mapping_draft_lines SET version=version+1,fsli_id=?,origin=?,source_historical_mapping_id=?,suggestion_kind=?,suggestion_score=?,confirmed=?,reason=?
      WHERE workspace_id=? AND draft_id=? AND tb_line_id=? AND version=?`)
      .bind(fsliId,origin,sourceHistory,row.suggestion_kind==='NAME_SIMILARITY'&&row.fsli_id===fsliId?row.suggestion_kind:null,
        row.suggestion_kind==='NAME_SIMILARITY'&&row.fsli_id===fsliId?row.suggestion_score:null,
        fsliId?1:0,command.payload.reason??null,workspaceId,draftId,tbLineId,expectedVersion),
    env.DB.prepare(`UPDATE mapping_drafts SET content_sha256=? WHERE workspace_id=? AND id=? AND status='DRAFT'`).bind(nextHash,workspaceId,draftId)
  ];
  return {statements,result:{draftId,tbLineId,version:expectedVersion+1,fsliId,confirmed:Boolean(fsliId),draftHash:nextHash},entityType:'MAPPING_DRAFT_LINE',entityId:row.id,
    beforeVersion:expectedVersion,afterVersion:expectedVersion+1,auditDetails:{draftId,accountCode:row.account_code,fsliId,sourceHistoricalMappingId:sourceHistory,reason:command.payload.reason??null}};
}

async function approveMapping(env: Env, workspaceId: string, context: BusinessContext,
  command: Extract<BusinessTbCommand,{type:'tb.mapping.approve'}>, now:string):Promise<BusinessMutation>{
  requireTbWriter(context,true);
  const sources=await getTbSources(env,workspaceId,context,command.payload.engagementId);requirePlanningStage(sources.engagement);
  const draft=await env.DB.prepare(`SELECT id,client_id,engagement_id,tb_version_id,revision,status,reporting_framework,content_sha256
    FROM mapping_drafts WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(workspaceId,command.payload.draftId,command.payload.engagementId)
    .first<{id:string;client_id:string;engagement_id:string;tb_version_id:string;revision:number;status:string;reporting_framework:string;content_sha256:string}>();
  if(!draft||draft.status!=='DRAFT')throw new ApiError('INVALID_STATE','Only the current editable mapping draft can be approved.');
  if(sources.active_tb_version_id!==draft.tb_version_id)throw new ApiError('VERSION_CONFLICT','The TB source changed after this mapping draft was created.');
  const rows=await mappingDraftRows(env,workspaceId,draft.id);const draftHash=await hashMappingDraft(rows);
  if(draftHash!==command.payload.draftHash||draft.content_sha256!==draftHash)throw new ApiError('VERSION_CONFLICT','Mapping inputs changed. Reload the draft and approve its current hash.');
  const unmapped=rows.filter(row=>!row.confirmed||!row.fsli_id);
  const material=unmapped.filter(row=>row.current_minor!==0||(row.prior_minor??0)!==0);
  if(material.length)throw new ApiError('GATE_BLOCKED',`Map each nonzero current- or prior-period TB account before approving the mapping. Unmapped: ${material.slice(0,20).map(row=>`${row.account_code} (current ${row.current_minor}; prior ${row.prior_minor??'not supplied'} minor units)`).join(', ')}.`,
    {blockers:material.slice(0,50).map(row=>({code:'UNMAPPED_TB_ACCOUNT',entityId:row.tb_line_id,accountCode:row.account_code,balanceMinor:String(row.current_minor),
      currentMinor:String(row.current_minor),priorMinor:row.prior_minor==null?null:String(row.prior_minor),route:'trial-balance'}))});
  const revision=(await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS revision FROM mapping_versions WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId,draft.engagement_id).first<{revision:number}>())?.revision??1;
  const mappingVersionId=crypto.randomUUID();const nowIso=new Date(now).toISOString();
  const activeLines=rows.filter(row=>row.confirmed&&row.fsli_id);
  const mappingHash=await sha256Hex(JSON.stringify(activeLines.map(row=>[row.tb_line_id,row.fsli_id,row.origin,row.source_historical_mapping_id,row.reason])));
  const statements: D1PreparedStatement[]=[
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,102,CASE WHEN EXISTS(SELECT 1 FROM mapping_drafts d JOIN engagements e
      ON e.workspace_id=d.workspace_id AND e.id=d.engagement_id WHERE d.workspace_id=? AND d.id=? AND d.status='DRAFT' AND d.content_sha256=?
        AND e.lifecycle_state='PORTAL_ACTIVE_PLANNING' AND e.active_tb_version_id=d.tb_version_id AND e.locked_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM mapping_draft_lines ml JOIN tb_lines tl ON tl.workspace_id=ml.workspace_id AND tl.id=ml.tb_line_id
          WHERE ml.workspace_id=d.workspace_id AND ml.draft_id=d.id AND (ml.confirmed=0 OR ml.fsli_id IS NULL)
            AND (tl.current_minor<>0 OR COALESCE(tl.prior_minor,0)<>0)))
      THEN 1 ELSE 0 END`).bind(workspaceId,workspaceId,draft.id,draftHash),
    env.DB.prepare(`INSERT INTO mapping_versions(id,workspace_id,client_id,engagement_id,tb_version_id,draft_id,revision,reporting_framework,content_sha256,approved_by_actor_id,approved_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(mappingVersionId,workspaceId,draft.client_id,draft.engagement_id,draft.tb_version_id,draft.id,revision,draft.reporting_framework,mappingHash,context.actor.id,nowIso),
    env.DB.prepare(`INSERT INTO tb_mappings(id,workspace_id,mapping_version_id,tb_line_id,fsli_id,origin,source_historical_mapping_id,rationale)
      SELECT lower(hex(randomblob(16))),workspace_id,?,tb_line_id,fsli_id,origin,source_historical_mapping_id,reason FROM mapping_draft_lines
      WHERE workspace_id=? AND draft_id=? AND confirmed=1 AND fsli_id IS NOT NULL`).bind(mappingVersionId,workspaceId,draft.id),
    env.DB.prepare(`INSERT INTO mapping_memory(id,workspace_id,client_id,account_code,reporting_framework,source_mapping_version_id,fsli_id,effective_period_end)
      SELECT lower(hex(randomblob(16))),tl.workspace_id,tl.client_id,tl.account_code,?, ?,ml.fsli_id,e.period_end
      FROM mapping_draft_lines ml JOIN tb_lines tl ON tl.workspace_id=ml.workspace_id AND tl.id=ml.tb_line_id
      JOIN engagements e ON e.workspace_id=tl.workspace_id AND e.id=tl.engagement_id
      WHERE ml.workspace_id=? AND ml.draft_id=? AND ml.confirmed=1 AND ml.fsli_id IS NOT NULL`)
      .bind(draft.reporting_framework,mappingVersionId,workspaceId,draft.id),
    env.DB.prepare(`UPDATE mapping_drafts SET status='APPROVED' WHERE workspace_id=? AND id=? AND status='DRAFT'`).bind(workspaceId,draft.id),
    env.DB.prepare(`UPDATE engagements SET active_mapping_version_id=?,active_materiality_version_id=NULL,approved_planning_version_id=NULL,
      version=version+1,updated_at=?,updated_by_actor_id=? WHERE workspace_id=? AND id=? AND active_tb_version_id=? AND lifecycle_state='PORTAL_ACTIVE_PLANNING'`)
      .bind(mappingVersionId,nowIso,context.actor.id,workspaceId,draft.engagement_id,draft.tb_version_id)
  ];
  return {statements,result:{mappingVersionId,revision,contentSha256:mappingHash,mappedCount:activeLines.length,unmappedCount:unmapped.length},
    entityType:'MAPPING_VERSION',entityId:mappingVersionId,beforeVersion:sources.active_mapping_version_id?1:null,afterVersion:revision,
    auditDetails:{draftId:draft.id,draftHash,tbVersionId:draft.tb_version_id,mappedCount:activeLines.length,unmappedCount:unmapped.length}};
}

type MaterialitySource = { id:string;revision:number;tb_version_id:string;mapping_version_id:string;benchmark:string;benchmark_minor:number;normalization_minor:number;
  normalization_reason:string|null;benchmark_rate_bps:number;performance_rate_bps:number;sad_rate_bps:number;pm_raw_numerator:string;pm_raw_denominator:string;
  te_raw_numerator:string;te_raw_denominator:string;sad_raw_numerator:string;sad_raw_denominator:string;planning_minor:number;performance_minor:number;sad_minor:number;
  rounding_reason:string|null;source_sha256:string;client_id:string;engagement_id:string };
type MaterialityLine={fsli_id:string;code:string;name:string;category:string;statement:string;balance_minor:number;account_ids:string[];account_codes:string[]};
async function mappedMaterialityLines(env:Env,workspaceId:string,engagementId:string,tbVersionId:string,mappingVersionId:string):Promise<MaterialityLine[]>{
  const rows=await env.DB.prepare(`SELECT c.id AS fsli_id,c.code,c.name,c.category,c.statement,
      COALESCE(SUM(l.current_minor),0) AS balance_minor,COUNT(l.id) AS account_count,
      json_group_array(l.id) AS account_ids,json_group_array(l.account_code) AS account_codes
    FROM tb_mappings m JOIN tb_lines l ON l.workspace_id=m.workspace_id AND l.id=m.tb_line_id
    JOIN fsli_catalog c ON c.workspace_id=m.workspace_id AND c.id=m.fsli_id
    WHERE m.workspace_id=? AND l.engagement_id=? AND l.tb_version_id=? AND m.mapping_version_id=?
    GROUP BY c.id,c.code,c.name,c.category,c.statement ORDER BY c.presentation_order,c.code`)
    .bind(workspaceId,engagementId,tbVersionId,mappingVersionId).all<{fsli_id:string;code:string;name:string;category:string;statement:string;balance_minor:number;account_count:number;account_ids:string;account_codes:string}>();
  return (rows.results??[]).map(row=>({fsli_id:row.fsli_id,code:row.code,name:row.name,category:row.category,statement:row.statement,balance_minor:row.balance_minor,
    account_ids:JSON.parse(row.account_ids),account_codes:JSON.parse(row.account_codes)}));
}
function assertRateRanges(benchmark:string,benchmarkRate:number,performanceRate:number,sadRate:number):void{
  const baseRanges:Record<string,[number,number]>={PBT:[500,1000],REVENUE:[50,200],TOTAL_ASSETS:[50,100],EQUITY:[100,200]};
  const [min,max]=baseRanges[benchmark];
  if(benchmarkRate<min||benchmarkRate>max)throw new ApiError('VALIDATION_FAILED',`${benchmark} rate must be between ${min/100}% and ${max/100}%.`);
  if(performanceRate<5000||performanceRate>7500)throw new ApiError('VALIDATION_FAILED','Performance materiality must be 50% through 75% of planning materiality.');
  if(sadRate<300||sadRate>500)throw new ApiError('VALIDATION_FAILED','The clearly trivial SAD must be 3% through 5% of planning materiality.');
}
function roundRational(numerator:bigint,denominator:bigint):bigint{
  if(denominator<=0n)throw new Error('invalid denominator');
  return (numerator*2n+denominator)/(denominator*2n);
}
function amountBigInt(value:string):bigint{
  const result=BigInt(value);
  if(result>BigInt(Number.MAX_SAFE_INTEGER)||result<BigInt(Number.MIN_SAFE_INTEGER))throw new ApiError('VALIDATION_FAILED','The amount exceeds supported minor-unit precision.');
  return result;
}
function withinRounding(rawNum:bigint,rawDen:bigint,adjusted:bigint):boolean{
  const difference=adjusted*rawDen-rawNum;const absolute=difference<0n?-difference:difference;
  return absolute*100n<=rawNum*5n;
}
function validateAdjustedThresholds(raw:{pmN:bigint;pmD:bigint;teN:bigint;teD:bigint;sadN:bigint;sadD:bigint},values:{pm:bigint;te:bigint;sad:bigint},reason?:string):void{
  if(values.pm<=0n||values.te<=0n||values.sad<=0n)throw new ApiError('VALIDATION_FAILED','Planning, performance and SAD amounts must be positive.');
  if(!withinRounding(raw.pmN,raw.pmD,values.pm)||!withinRounding(raw.teN,raw.teD,values.te)||!withinRounding(raw.sadN,raw.sadD,values.sad)){
    throw new ApiError('VALIDATION_FAILED','Each adjusted materiality tier must remain within the inclusive ±5.0% of its own original raw value.');
  }
  if(!(values.sad<values.te&&values.te<values.pm))throw new ApiError('VALIDATION_FAILED','Thresholds must satisfy 0 < SAD < TE < PM.');
  if(values.te*100n<values.pm*50n||values.te*100n>values.pm*75n)throw new ApiError('VALIDATION_FAILED','Adjusted TE/PM must remain between 50% and 75%.');
  if(values.sad*100n<values.pm*3n||values.sad*100n>values.pm*5n)throw new ApiError('VALIDATION_FAILED','Adjusted SAD/PM must remain between 3% and 5%.');
  if(reason!==undefined&&reason.trim().length<10)throw new ApiError('VALIDATION_FAILED','Rounding adjustments require a meaningful reviewer rationale.');
}
function bandFor(balance:number,pm:number,te:number,inherentRisk:string,critical:boolean):'GREEN'|'AMBER'|'RED'{
  const absolute=Math.abs(balance);
  if(critical||inherentRisk==='HIGH'||absolute>pm)return 'RED';
  if(inherentRisk==='MODERATE'||absolute>=te)return 'AMBER';
  return 'GREEN';
}

export function benchmarkContributingLines<T extends {code:string;statement:string;category:string}>(lines:T[],benchmark:string):T[]{
  // PBT is profit BEFORE tax, so the income-tax FSLI must never reduce the benchmark.
  return benchmark==='PBT'?lines.filter(row=>row.statement==='PROFIT_LOSS'&&row.code!=='INCOME_TAX')
    :benchmark==='REVENUE'?lines.filter(row=>row.category==='REVENUE')
      :benchmark==='TOTAL_ASSETS'?lines.filter(row=>row.category==='ASSET'):lines.filter(row=>row.category==='EQUITY');
}

async function calculateMateriality(env:Env,workspaceId:string,context:BusinessContext,
  command:Extract<BusinessTbCommand,{type:'materiality.calculate'}>,now:string):Promise<BusinessMutation>{
  requireTbWriter(context,true);
  const p=command.payload;const sources=await getTbSources(env,workspaceId,context,p.engagementId);requirePlanningStage(sources.engagement);
  if(sources.active_tb_version_id!==p.tbVersionId||sources.active_mapping_version_id!==p.mappingVersionId){
    throw new ApiError('VERSION_CONFLICT','Materiality must use the active TB and approved FSLI mapping versions.');
  }
  const mapping=await env.DB.prepare(`SELECT id,content_sha256 FROM mapping_versions WHERE workspace_id=? AND id=? AND engagement_id=? AND tb_version_id=?`)
    .bind(workspaceId,p.mappingVersionId,p.engagementId,p.tbVersionId).first<{id:string;content_sha256:string}>();
  const tb=await env.DB.prepare(`SELECT id,revision,content_sha256 FROM tb_versions WHERE workspace_id=? AND id=? AND engagement_id=?`)
    .bind(workspaceId,p.tbVersionId,p.engagementId).first<{id:string;revision:number;content_sha256:string}>();
  if(!mapping||!tb)throw new ApiError('NOT_FOUND','The selected source version is unavailable.');
  assertRateRanges(p.benchmark,p.benchmarkRateBps,p.performanceRateBps,p.sadRateBps);
  const lines=await mappedMaterialityLines(env,workspaceId,p.engagementId,p.tbVersionId,p.mappingVersionId);
  if(!lines.length)throw new ApiError('GATE_BLOCKED','An approved non-empty FSLI mapping is required to calculate materiality.');
  const contributing=benchmarkContributingLines(lines,p.benchmark);
  const signed=contributing.reduce((sum,row)=>sum+BigInt(row.balance_minor),0n);
  const rawBase=p.benchmark==='PBT'?-signed:(signed<0n?-signed:signed);
  let normalization=0n;
  const adjustmentFiles: Array<{id:string;amount:bigint;description:string}> = [];
  for(const adjustment of p.adjustments){
    const file=await env.DB.prepare(`SELECT id FROM file_versions WHERE workspace_id=? AND id=? AND client_id=? AND engagement_id=? AND purpose IN ('EVIDENCE','PBC')
      AND state='COMMITTED' AND immutable=1 AND sha256 IS NOT NULL`).bind(workspaceId,adjustment.evidenceFileId,sources.engagement.client_id,p.engagementId).first<{id:string}>();
    if(!file)throw new ApiError('GATE_BLOCKED','Each benchmark normalization adjustment needs a committed, immutable supporting evidence file in this engagement.');
    const amount=amountBigInt(adjustment.amountMinor);normalization+=amount;
    adjustmentFiles.push({id:adjustment.evidenceFileId,amount,description:adjustment.description});
  }
  if(p.benchmark!=='PBT'&&(adjustmentFiles.length||p.normalizationReason))throw new ApiError('VALIDATION_FAILED','Normalization adjustments are available only for a PBT benchmark.');
  if(adjustmentFiles.length&&(!p.normalizationReason||p.normalizationReason.length<10))throw new ApiError('VALIDATION_FAILED','PBT normalization needs an itemized reviewer rationale.');
  const benchmarkValue=rawBase+normalization;
  if(benchmarkValue<=0n){throw new ApiError('VALIDATION_FAILED','PBT is zero or loss-making. Select a supported alternative benchmark or provide documented, evidenced normalization; loss is never treated as positive profit.');}
  if(benchmarkValue>BigInt(Number.MAX_SAFE_INTEGER))throw new ApiError('VALIDATION_FAILED','The selected benchmark exceeds supported minor-unit precision.');
  const pmN=benchmarkValue*BigInt(p.benchmarkRateBps),pmD=10000n;
  const teN=pmN*BigInt(p.performanceRateBps),teD=pmD*10000n;
  const sadN=pmN*BigInt(p.sadRateBps),sadD=pmD*10000n;
  const values={pm:p.planningMinor!==undefined?amountBigInt(p.planningMinor):roundRational(pmN,pmD),
    te:p.performanceMinor!==undefined?amountBigInt(p.performanceMinor):roundRational(teN,teD),
    sad:p.sadMinor!==undefined?amountBigInt(p.sadMinor):roundRational(sadN,sadD)};
  const anyAdjusted=p.planningMinor!==undefined;
  validateAdjustedThresholds({pmN,pmD,teN,teD,sadN,sadD},values,anyAdjusted?p.roundingReason:undefined);
  const contributingAccounts=contributing.flatMap(line=>line.account_ids.map((accountId,index)=>({id:accountId,code:line.account_codes[index],fsliId:line.fsli_id,fsliCode:line.code}))).sort((a,b)=>a.code.localeCompare(b.code));
  const sourceHash=await sha256Hex(JSON.stringify({tbVersionId:p.tbVersionId,tbRevision:tb.revision,tbHash:tb.content_sha256,mappingVersionId:p.mappingVersionId,
    mappingHash:mapping.content_sha256,benchmark:p.benchmark,benchmarkMinor:benchmarkValue.toString(),normalizationMinor:normalization.toString(),
    benchmarkRateBps:p.benchmarkRateBps,performanceRateBps:p.performanceRateBps,sadRateBps:p.sadRateBps,
    raw:[pmN.toString(),pmD.toString(),teN.toString(),teD.toString(),sadN.toString(),sadD.toString()],contributingAccounts}));
  const revision=(await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS revision FROM materiality_versions WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId,p.engagementId).first<{revision:number}>())?.revision??1;
  const materialityVersionId=crypto.randomUUID();const nowIso=new Date(now).toISOString();
  const statements: D1PreparedStatement[]=[
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,103,CASE WHEN EXISTS(SELECT 1 FROM engagements e
      JOIN tb_versions t ON t.workspace_id=e.workspace_id AND t.id=e.active_tb_version_id JOIN mapping_versions m ON m.workspace_id=e.workspace_id AND m.id=e.active_mapping_version_id
      WHERE e.workspace_id=? AND e.id=? AND e.lifecycle_state='PORTAL_ACTIVE_PLANNING' AND e.active_tb_version_id=? AND e.active_mapping_version_id=?
        AND t.content_sha256=? AND m.content_sha256=? AND e.locked_at IS NULL)
      THEN 1 ELSE 0 END`).bind(workspaceId,workspaceId,p.engagementId,p.tbVersionId,p.mappingVersionId,tb.content_sha256,mapping.content_sha256),
    env.DB.prepare(`INSERT INTO materiality_versions(id,workspace_id,client_id,engagement_id,revision,tb_version_id,mapping_version_id,benchmark,benchmark_minor,
      normalization_minor,normalization_reason,benchmark_rate_bps,performance_rate_bps,sad_rate_bps,pm_raw_numerator,pm_raw_denominator,te_raw_numerator,
      te_raw_denominator,sad_raw_numerator,sad_raw_denominator,planning_minor,performance_minor,sad_minor,rounding_reason,calculated_by_actor_id,calculated_at,source_sha256)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(materialityVersionId,workspaceId,sources.engagement.client_id,p.engagementId,revision,p.tbVersionId,
        p.mappingVersionId,p.benchmark,Number(benchmarkValue),Number(normalization),p.normalizationReason??null,p.benchmarkRateBps,p.performanceRateBps,p.sadRateBps,
        pmN.toString(),pmD.toString(),teN.toString(),teD.toString(),sadN.toString(),sadD.toString(),Number(values.pm),Number(values.te),Number(values.sad),
        p.roundingReason??null,context.actor.id,nowIso,sourceHash),
    ...adjustmentFiles.map(adjustment=>env.DB.prepare(`INSERT INTO benchmark_adjustments(id,workspace_id,materiality_version_id,description,amount_minor,evidence_file_id)
      VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),workspaceId,materialityVersionId,adjustment.description,Number(adjustment.amount),adjustment.id)),
    env.DB.prepare(`UPDATE engagements SET active_materiality_version_id=?,approved_planning_version_id=NULL,version=version+1,updated_at=?,updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND active_tb_version_id=? AND active_mapping_version_id=? AND lifecycle_state='PORTAL_ACTIVE_PLANNING'`)
      .bind(materialityVersionId,nowIso,context.actor.id,workspaceId,p.engagementId,p.tbVersionId,p.mappingVersionId)
  ];
  return {statements,result:{materialityVersionId,revision,benchmark:p.benchmark,benchmarkMinor:benchmarkValue.toString(),planningMinor:String(values.pm),
    performanceMinor:String(values.te),sadMinor:String(values.sad),raw:{planning:{numerator:pmN.toString(),denominator:pmD.toString()},performance:{numerator:teN.toString(),denominator:teD.toString()},
      sad:{numerator:sadN.toString(),denominator:sadD.toString()}},sourceAccounts:contributingAccounts,sourceHash},entityType:'MATERIALITY_VERSION',entityId:materialityVersionId,
    beforeVersion:sources.active_materiality_version_id?1:null,afterVersion:revision,auditDetails:{tbVersionId:p.tbVersionId,mappingVersionId:p.mappingVersionId,benchmark:p.benchmark,
      benchmarkMinor:benchmarkValue.toString(),planningMinor:String(values.pm),performanceMinor:String(values.te),sadMinor:String(values.sad),sourceHash}};
}

async function adjustMateriality(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessTbCommand,{type:'materiality.adjust'}>,now:string):Promise<BusinessMutation>{
  requireTbWriter(context,true);
  const prior=await env.DB.prepare(`SELECT * FROM materiality_versions WHERE workspace_id=? AND id=?`).bind(workspaceId,command.payload.materialityVersionId).first<MaterialitySource>();
  if(!prior)throw new ApiError('NOT_FOUND','The materiality version was not found.');
  const sources=await getTbSources(env,workspaceId,context,prior.engagement_id);requirePlanningStage(sources.engagement);
  if(sources.active_materiality_version_id!==prior.id||sources.active_tb_version_id!==prior.tb_version_id||sources.active_mapping_version_id!==prior.mapping_version_id){
    throw new ApiError('VERSION_CONFLICT','Only the current materiality source version can be adjusted. Recalculate against active TB and mapping sources.');
  }
  const values={pm:amountBigInt(command.payload.planningMinor),te:amountBigInt(command.payload.performanceMinor),sad:amountBigInt(command.payload.sadMinor)};
  validateAdjustedThresholds({pmN:BigInt(prior.pm_raw_numerator),pmD:BigInt(prior.pm_raw_denominator),teN:BigInt(prior.te_raw_numerator),teD:BigInt(prior.te_raw_denominator),
    sadN:BigInt(prior.sad_raw_numerator),sadD:BigInt(prior.sad_raw_denominator)},values,command.payload.reason);
  const revision=(await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS revision FROM materiality_versions WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId,prior.engagement_id).first<{revision:number}>())?.revision??prior.revision+1;
  const newId=crypto.randomUUID();const timestamp=new Date(now).toISOString();
  const adjustedHash=await sha256Hex(JSON.stringify({prior:prior.source_sha256,priorId:prior.id,values:{pm:String(values.pm),te:String(values.te),sad:String(values.sad)},reason:command.payload.reason}));
  const statements:D1PreparedStatement[]=[
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,104,CASE WHEN EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND id=?
      AND active_materiality_version_id=? AND active_tb_version_id=? AND active_mapping_version_id=? AND lifecycle_state='PORTAL_ACTIVE_PLANNING') THEN 1 ELSE 0 END`)
      .bind(workspaceId,workspaceId,prior.engagement_id,prior.id,prior.tb_version_id,prior.mapping_version_id),
    env.DB.prepare(`INSERT INTO materiality_versions(id,workspace_id,client_id,engagement_id,revision,tb_version_id,mapping_version_id,benchmark,benchmark_minor,
      normalization_minor,normalization_reason,benchmark_rate_bps,performance_rate_bps,sad_rate_bps,pm_raw_numerator,pm_raw_denominator,te_raw_numerator,
      te_raw_denominator,sad_raw_numerator,sad_raw_denominator,planning_minor,performance_minor,sad_minor,rounding_reason,calculated_by_actor_id,calculated_at,source_sha256)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(newId,workspaceId,prior.client_id,prior.engagement_id,revision,prior.tb_version_id,prior.mapping_version_id,
        prior.benchmark,prior.benchmark_minor,prior.normalization_minor,prior.normalization_reason,prior.benchmark_rate_bps,prior.performance_rate_bps,prior.sad_rate_bps,
        prior.pm_raw_numerator,prior.pm_raw_denominator,prior.te_raw_numerator,prior.te_raw_denominator,prior.sad_raw_numerator,prior.sad_raw_denominator,
        Number(values.pm),Number(values.te),Number(values.sad),command.payload.reason,context.actor.id,timestamp,adjustedHash),
    env.DB.prepare(`INSERT INTO benchmark_adjustments(id,workspace_id,materiality_version_id,description,amount_minor,evidence_file_id)
      SELECT lower(hex(randomblob(16))),workspace_id,?,description,amount_minor,evidence_file_id FROM benchmark_adjustments WHERE workspace_id=? AND materiality_version_id=?`)
      .bind(newId,workspaceId,prior.id),
    env.DB.prepare(`INSERT INTO fsli_risks(id,workspace_id,client_id,engagement_id,fsli_id,materiality_version_id,revision,balance_minor,inherent_risk,critical_estimate,band,rationale,source_sha256,created_at)
      SELECT lower(hex(randomblob(16))),r.workspace_id,r.client_id,r.engagement_id,r.fsli_id,?,(SELECT COALESCE(MAX(r2.revision),0)+1 FROM fsli_risks r2 WHERE r2.workspace_id=r.workspace_id AND r2.engagement_id=r.engagement_id AND r2.fsli_id=r.fsli_id),
        r.balance_minor,r.inherent_risk,r.critical_estimate,
        CASE WHEN r.critical_estimate=1 OR r.inherent_risk='HIGH' OR ABS(r.balance_minor)>? THEN 'RED'
          WHEN r.inherent_risk='MODERATE' OR ABS(r.balance_minor)>=? THEN 'AMBER' ELSE 'GREEN' END,
        r.rationale,?,? FROM fsli_risks r WHERE r.workspace_id=? AND r.materiality_version_id=?
          AND r.revision=(SELECT MAX(r3.revision) FROM fsli_risks r3 WHERE r3.workspace_id=r.workspace_id AND r3.engagement_id=r.engagement_id AND r3.fsli_id=r.fsli_id)`)
      .bind(newId,Number(values.pm),Number(values.te),adjustedHash,timestamp,workspaceId,prior.id),
    env.DB.prepare(`UPDATE engagements SET active_materiality_version_id=?,approved_planning_version_id=NULL,version=version+1,updated_at=?,updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND active_materiality_version_id=? AND lifecycle_state='PORTAL_ACTIVE_PLANNING'`)
      .bind(newId,timestamp,context.actor.id,workspaceId,prior.engagement_id,prior.id)
  ];
  return {statements,result:{materialityVersionId:newId,revision,planningMinor:String(values.pm),performanceMinor:String(values.te),sadMinor:String(values.sad),
    adjustedFrom:prior.id,reason:command.payload.reason,sourceHash:adjustedHash},entityType:'MATERIALITY_VERSION',entityId:newId,beforeVersion:prior.revision,afterVersion:revision,
    auditDetails:{adjustedFrom:prior.id,values:{pm:String(values.pm),te:String(values.te),sad:String(values.sad)},reason:command.payload.reason}};
}

async function setFsliRisk(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessTbCommand,{type:'fsli.risk.set'}>,now:string):Promise<BusinessMutation>{
  requireTbWriter(context,true);const p=command.payload;const sources=await getTbSources(env,workspaceId,context,p.engagementId);requirePlanningStage(sources.engagement);
  if(sources.active_materiality_version_id!==p.materialityVersionId||!sources.active_tb_version_id||!sources.active_mapping_version_id){
    throw new ApiError('VERSION_CONFLICT','Risk assessment must use the current materiality, TB and approved mapping versions.');
  }
  const materiality=await env.DB.prepare(`SELECT id,planning_minor,performance_minor,source_sha256,tb_version_id,mapping_version_id FROM materiality_versions
    WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(workspaceId,p.materialityVersionId,p.engagementId)
    .first<{id:string;planning_minor:number;performance_minor:number;source_sha256:string;tb_version_id:string;mapping_version_id:string}>();
  const fsli=await env.DB.prepare(`SELECT id,code FROM fsli_catalog WHERE workspace_id=? AND id=? AND active=1`)
    .bind(workspaceId,p.fsliId).first<{id:string;code:string}>();
  if(!materiality||!fsli||materiality.tb_version_id!==sources.active_tb_version_id||materiality.mapping_version_id!==sources.active_mapping_version_id)
    throw new ApiError('FORBIDDEN_SCOPE','The FSLI is outside the active materiality mapping.');
  const balance=await env.DB.prepare(`SELECT COALESCE(SUM(l.current_minor),0) AS balance FROM tb_mappings m JOIN tb_lines l ON l.workspace_id=m.workspace_id AND l.id=m.tb_line_id
    WHERE m.workspace_id=? AND m.mapping_version_id=? AND m.fsli_id=?`).bind(workspaceId,materiality.mapping_version_id,p.fsliId).first<{balance:number}>();
  const balanceMinor=balance?.balance??0;const band=bandFor(balanceMinor,materiality.planning_minor,materiality.performance_minor,p.inherentRisk,p.criticalEstimate);
  const revision=(await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS revision FROM fsli_risks WHERE workspace_id=? AND engagement_id=? AND fsli_id=?`)
    .bind(workspaceId,p.engagementId,p.fsliId).first<{revision:number}>())?.revision??1;
  const riskId=crypto.randomUUID();const sourceHash=await sha256Hex(JSON.stringify({tbVersionId:materiality.tb_version_id,mappingVersionId:materiality.mapping_version_id,
    materialityVersionId:materiality.id,fsliId:p.fsliId,balanceMinor,inherentRisk:p.inherentRisk,criticalEstimate:p.criticalEstimate}));
  const timestamp=new Date(now).toISOString();
  return {statements:[
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,105,CASE WHEN EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND id=?
      AND active_tb_version_id=? AND active_mapping_version_id=? AND active_materiality_version_id=? AND lifecycle_state='PORTAL_ACTIVE_PLANNING')
      AND EXISTS(SELECT 1 FROM tb_mappings WHERE workspace_id=? AND mapping_version_id=? AND fsli_id=?) THEN 1 ELSE 0 END`)
      .bind(workspaceId,workspaceId,p.engagementId,materiality.tb_version_id,materiality.mapping_version_id,materiality.id,workspaceId,materiality.mapping_version_id,p.fsliId),
    env.DB.prepare(`INSERT INTO fsli_risks(id,workspace_id,client_id,engagement_id,fsli_id,materiality_version_id,revision,balance_minor,inherent_risk,critical_estimate,band,rationale,source_sha256,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(riskId,workspaceId,sources.engagement.client_id,p.engagementId,p.fsliId,materiality.id,revision,balanceMinor,p.inherentRisk,p.criticalEstimate?1:0,band,p.rationale,sourceHash,timestamp),
    env.DB.prepare(`UPDATE engagements SET approved_planning_version_id=NULL,version=version+1,updated_at=?,updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND active_materiality_version_id=?`).bind(timestamp,context.actor.id,workspaceId,p.engagementId,materiality.id)
  ],result:{riskId,revision,fsliId:p.fsliId,fsliCode:fsli.code,balanceMinor:String(balanceMinor),inherentRisk:p.inherentRisk,criticalEstimate:p.criticalEstimate,band,sourceHash},
    entityType:'FSLI_RISK',entityId:riskId,beforeVersion:null,afterVersion:revision,auditDetails:{materialityVersionId:materiality.id,fsliId:p.fsliId,band,sourceHash}};
}

type PlanningDependencySnapshot={
  engagementId:string;clientId:string;lifecycleState:string;tbVersionId:string|null;mappingVersionId:string|null;materialityVersionId:string|null;
  standardsProfileId:string;tbHash:string|null;mappingHash:string|null;materialityHash:string|null;
  tb:{rowCount:number;debitsMinor:number;creditsMinor:number;priorPresent:boolean}|null;
  mapping:{mappedCount:number;unmappedCount:number;nonzeroUnmapped:Array<{id:string;accountCode:string;balanceMinor:string;priorBalanceMinor:string|null}>}|null;
  materiality:{benchmark:string;benchmarkMinor:string;planningMinor:string;performanceMinor:string;sadMinor:string;sourceHash:string}|null;
  staffing:Array<Record<string,unknown>>;milestones:Array<Record<string,unknown>>;pbc:Array<Record<string,unknown>>;folders:Array<Record<string,unknown>>;risks:Array<Record<string,unknown>>;
  blockers:Array<{code:string;entityId?:string;description:string;route:string;details?:Record<string,unknown>}>;dependencyHash:string;
};

async function collectPlanningDependencies(env:Env,workspaceId:string,context:BusinessContext,engagementId:string,allowArchivedRead=false):Promise<PlanningDependencySnapshot>{
  requireInternalRead(context);const sources=await getTbSources(env,workspaceId,context,engagementId,allowArchivedRead);const engagement=sources.engagement;
  const blockers:PlanningDependencySnapshot['blockers']=[];
  let tb:PlanningDependencySnapshot['tb']=null;let tbHash:string|null=null;
  if(!sources.active_tb_version_id){blockers.push({code:'ACTIVE_TB_REQUIRED',description:'Accept a balanced immutable trial-balance version before planning sign-off.',route:'trial-balance'});}
  else{
    const row=await env.DB.prepare(`SELECT id,content_sha256,row_count,current_debits_minor,current_credits_minor,prior_present FROM tb_versions WHERE workspace_id=? AND id=? AND engagement_id=?`)
      .bind(workspaceId,sources.active_tb_version_id,engagementId).first<{id:string;content_sha256:string;row_count:number;current_debits_minor:number;current_credits_minor:number;prior_present:number}>();
    if(row){tbHash=row.content_sha256;tb={rowCount:row.row_count,debitsMinor:row.current_debits_minor,creditsMinor:row.current_credits_minor,priorPresent:Boolean(row.prior_present)};
      if(row.current_debits_minor!==row.current_credits_minor)blockers.push({code:'UNBALANCED_TB',description:'The active TB control totals are not balanced.',route:'trial-balance'});}
    else blockers.push({code:'ACTIVE_TB_MISSING',description:'The engagement points at a missing TB version.',route:'trial-balance'});
  }
  let mapping:PlanningDependencySnapshot['mapping']=null;let mappingHash:string|null=null;
  if(!sources.active_mapping_version_id){blockers.push({code:'APPROVED_MAPPING_REQUIRED',description:'Approve an FSLI mapping for the active TB version.',route:'trial-balance'});}
  else{
    const version=await env.DB.prepare(`SELECT content_sha256,tb_version_id FROM mapping_versions WHERE workspace_id=? AND id=? AND engagement_id=?`)
      .bind(workspaceId,sources.active_mapping_version_id,engagementId).first<{content_sha256:string;tb_version_id:string}>();
    if(!version||version.tb_version_id!==sources.active_tb_version_id)blockers.push({code:'STALE_MAPPING',description:'The mapping is not pinned to the active TB version.',route:'trial-balance'});
    else{
      mappingHash=version.content_sha256;
      const unmapped=await env.DB.prepare(`SELECT l.id,l.account_code,l.current_minor,l.prior_minor FROM tb_lines l LEFT JOIN tb_mappings m
        ON m.workspace_id=l.workspace_id AND m.tb_line_id=l.id AND m.mapping_version_id=?
        WHERE l.workspace_id=? AND l.engagement_id=? AND l.tb_version_id=? AND (m.id IS NULL OR m.fsli_id IS NULL)
        ORDER BY l.source_row_number,l.account_code`).bind(sources.active_mapping_version_id,workspaceId,engagementId,sources.active_tb_version_id)
        .all<{id:string;account_code:string;current_minor:number;prior_minor:number|null}>();
      const allMapped=await env.DB.prepare(`SELECT COUNT(*) AS count FROM tb_mappings WHERE workspace_id=? AND mapping_version_id=?`)
        .bind(workspaceId,sources.active_mapping_version_id).first<{count:number}>();
      const nonzero=(unmapped.results??[]).filter(line=>line.current_minor!==0||(line.prior_minor??0)!==0);
      mapping={mappedCount:allMapped?.count??0,unmappedCount:unmapped.results?.length??0,nonzeroUnmapped:nonzero.slice(0,50).map(line=>({id:line.id,accountCode:line.account_code,
        balanceMinor:String(line.current_minor),priorBalanceMinor:line.prior_minor==null?null:String(line.prior_minor)}))};
      if(nonzero.length)blockers.push({code:'UNMAPPED_TB_ACCOUNTS',description:`${nonzero.length} current- or prior-period TB accounts have no approved FSLI mapping: ${nonzero.slice(0,10).map(line=>line.account_code).join(', ')}.`,route:'trial-balance',
        details:{accounts:nonzero.slice(0,50).map(line=>({id:line.id,accountCode:line.account_code,balanceMinor:String(line.current_minor),currentMinor:String(line.current_minor),
          priorMinor:line.prior_minor==null?null:String(line.prior_minor)}))}});
    }
  }
  let materiality:PlanningDependencySnapshot['materiality']=null;let materialityHash:string|null=null;
  if(!sources.active_materiality_version_id){blockers.push({code:'CURRENT_MATERIALITY_REQUIRED',description:'Calculate and review materiality from the active TB and mapping.',route:'audit-planning'});}
  else{
    const value=await env.DB.prepare(`SELECT id,benchmark,benchmark_minor,planning_minor,performance_minor,sad_minor,source_sha256,tb_version_id,mapping_version_id
      FROM materiality_versions WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(workspaceId,sources.active_materiality_version_id,engagementId)
      .first<{id:string;benchmark:string;benchmark_minor:number;planning_minor:number;performance_minor:number;sad_minor:number;source_sha256:string;tb_version_id:string;mapping_version_id:string}>();
    if(!value||value.tb_version_id!==sources.active_tb_version_id||value.mapping_version_id!==sources.active_mapping_version_id){
      blockers.push({code:'STALE_MATERIALITY',description:'Materiality does not refer to the active TB and mapping versions.',route:'audit-planning'});
    }else{
      materialityHash=value.source_sha256;materiality={benchmark:value.benchmark,benchmarkMinor:String(value.benchmark_minor),planningMinor:String(value.planning_minor),
        performanceMinor:String(value.performance_minor),sadMinor:String(value.sad_minor),sourceHash:value.source_sha256};
      const currentFsli=await env.DB.prepare(`SELECT DISTINCT fsli_id FROM tb_mappings WHERE workspace_id=? AND mapping_version_id=? ORDER BY fsli_id`)
        .bind(workspaceId,sources.active_mapping_version_id).all<{fsli_id:string}>();
      const latestRisks=await env.DB.prepare(`SELECT r.id,r.fsli_id,c.code,c.name,r.revision,r.balance_minor,r.inherent_risk,r.critical_estimate,r.band,r.rationale,r.source_sha256,r.materiality_version_id
        FROM fsli_risks r JOIN fsli_catalog c ON c.workspace_id=r.workspace_id AND c.id=r.fsli_id
        WHERE r.workspace_id=? AND r.engagement_id=? AND r.materiality_version_id=?
          AND r.revision=(SELECT MAX(r2.revision) FROM fsli_risks r2 WHERE r2.workspace_id=r.workspace_id AND r2.engagement_id=r.engagement_id AND r2.fsli_id=r.fsli_id)
        ORDER BY c.presentation_order,c.code`).bind(workspaceId,engagementId,value.id).all<Record<string,unknown>>();
      const risks=latestRisks.results??[];const riskyIds=new Set(risks.map(row=>String(row.fsli_id)));
      const missing=(currentFsli.results??[]).filter(row=>!riskyIds.has(row.fsli_id));
      if(missing.length)blockers.push({code:'FSLI_RISK_ASSESSMENT_REQUIRED',description:`Record inherent-risk assessments for ${missing.length} mapped FSLI areas.`,route:'audit-risks',
        details:{fsliIds:missing.map(row=>row.fsli_id)}});
      (materiality as any).riskRows=risks; (materiality as any).riskCount=risks.length;
      if(risks.some(row=>row.band==='RED')){
        const manager=await env.DB.prepare(`SELECT 1 AS found FROM engagement_assignments a JOIN staff_members sm ON sm.workspace_id=a.workspace_id AND sm.id=a.staff_member_id
          WHERE a.workspace_id=? AND a.engagement_id=? AND a.phase='FIELDWORK' AND a.persona IN ('PREPARER','REVIEWER') AND sm.grade='MANAGER' LIMIT 1`)
          .bind(workspaceId,engagementId).first<{found:number}>();
        if(!manager)blockers.push({code:'RED_RISK_MANAGER_REQUIRED',description:'Assign a Manager-grade staff member to execute Red-risk fieldwork.',route:'scheduling'});
      }
    }
  }
  const staffingResult=await env.DB.prepare(`SELECT a.id,a.staff_member_id AS staffMemberId,sm.display_name AS displayName,sm.grade,a.persona,a.phase,a.start_date AS startDate,a.end_date AS endDate,a.planned_minutes AS plannedMinutes,
      COALESCE(json_group_array(json_object('date',d.work_date,'minutes',d.planned_minutes)) FILTER(WHERE d.id IS NOT NULL),'[]') AS dailyMinutes
    FROM engagement_assignments a JOIN staff_members sm ON sm.workspace_id=a.workspace_id AND sm.id=a.staff_member_id
    LEFT JOIN engagement_assignment_days d ON d.workspace_id=a.workspace_id AND d.assignment_id=a.id
    WHERE a.workspace_id=? AND a.engagement_id=? AND a.phase IN ('PLANNING','FIELDWORK','REVIEW') GROUP BY a.id ORDER BY a.phase,a.start_date,sm.display_name,a.id`)
    .bind(workspaceId,engagementId).all<Record<string,unknown>>();
  const staffing:Array<Record<string,unknown>>=(staffingResult.results??[]).map(row=>({...row,dailyMinutes:JSON.parse(String(row.dailyMinutes)) as unknown[]}));
  const covered=new Set(staffing.map(row=>String(row.persona)));
  if(!covered.has('PREPARER'))blockers.push({code:'PREPARER_ASSIGNMENT_REQUIRED',description:'Assign a PREPARER with explicit daily minutes for planning or fieldwork.',route:'scheduling'});
  if(!covered.has('REVIEWER'))blockers.push({code:'REVIEWER_ASSIGNMENT_REQUIRED',description:'Assign a REVIEWER with explicit daily minutes for planning or fieldwork.',route:'scheduling'});
  const partnerAssigned=await env.DB.prepare(`SELECT 1 AS found FROM engagement_assignments a JOIN staff_members sm ON sm.workspace_id=a.workspace_id AND sm.id=a.staff_member_id
    WHERE a.workspace_id=? AND a.engagement_id=? AND a.phase IN ('PLANNING','REVIEW') AND a.persona='APPROVER' AND sm.grade='PARTNER' LIMIT 1`)
    .bind(workspaceId,engagementId).first<{found:number}>();
  if(!partnerAssigned)blockers.push({code:'PARTNER_ASSIGNMENT_REQUIRED',description:'Assign a PARTNER approver to the planning and review phases.',route:'scheduling'});
  const capacity=await env.DB.prepare(`WITH total AS(SELECT a.staff_member_id,d.work_date,SUM(d.planned_minutes) AS minutes
      FROM engagement_assignment_days d JOIN engagement_assignments a ON a.workspace_id=d.workspace_id AND a.id=d.assignment_id
      WHERE a.workspace_id=? GROUP BY a.staff_member_id,d.work_date)
    SELECT a.id,a.staff_member_id,d.work_date,sm.display_name,COALESCE(total.minutes,0) AS assigned,sa.scheduled_minutes-sa.approved_leave_minutes+COALESCE((SELECT SUM(x.excess_minutes)
      FROM capacity_exceptions x WHERE x.workspace_id=a.workspace_id AND x.staff_member_id=a.staff_member_id AND x.work_date=d.work_date),0) AS capacity
    FROM engagement_assignments a JOIN engagement_assignment_days d ON d.workspace_id=a.workspace_id AND d.assignment_id=a.id
    JOIN staff_members sm ON sm.workspace_id=a.workspace_id AND sm.id=a.staff_member_id LEFT JOIN staff_availability sa
      ON sa.workspace_id=a.workspace_id AND sa.staff_member_id=a.staff_member_id AND sa.work_date=d.work_date
    LEFT JOIN total ON total.staff_member_id=a.staff_member_id AND total.work_date=d.work_date
    WHERE a.workspace_id=? AND a.engagement_id=? AND a.phase IN ('PLANNING','FIELDWORK') AND (sa.id IS NULL OR total.minutes>sa.scheduled_minutes-sa.approved_leave_minutes+COALESCE((
      SELECT SUM(x.excess_minutes) FROM capacity_exceptions x WHERE x.workspace_id=a.workspace_id AND x.staff_member_id=a.staff_member_id AND x.work_date=d.work_date),0))
    GROUP BY a.id,d.work_date ORDER BY d.work_date,sm.display_name`).bind(workspaceId,workspaceId,engagementId)
    .all<{id:string;staff_member_id:string;work_date:string;display_name:string;assigned:number;capacity:number|null}>();
  if(capacity.results?.length)blockers.push({code:'CAPACITY_CONFLICT',description:`${capacity.results.length} assigned staff-day(s) lack sufficient approved capacity.`,route:'scheduling',
    details:{staffDays:capacity.results.slice(0,50).map(row=>({assignmentId:row.id,staffMemberId:row.staff_member_id,workDate:row.work_date,assignedMinutes:row.assigned,availableMinutes:row.capacity}))}});
  const milestonesResult=await env.DB.prepare(`SELECT id,version,code,target_date AS targetDate,source_reference AS sourceReference,approved_by_actor_id AS approvedByActorId
    FROM milestones WHERE workspace_id=? AND engagement_id=? ORDER BY code`).bind(workspaceId,engagementId).all<Record<string,unknown>>();
  const milestones=milestonesResult.results??[];
  if(!milestones.some(item=>item.code==='STATUTORY_CUTOFF'))blockers.push({code:'STATUTORY_CUTOFF_REQUIRED',description:'Record the firm-supplied statutory cutoff and source reference.',route:'scheduling'});
  const pbcResult=await env.DB.prepare(`SELECT id,title,status,due_date AS dueDate,category,required_for_planning AS requiredForPlanning
    FROM pbc_requests WHERE workspace_id=? AND engagement_id=? AND required_for_planning=1 ORDER BY due_date,title,id`).bind(workspaceId,engagementId).all<Record<string,unknown>>();
  const pbc=pbcResult.results??[];const pending=pbc.filter(item=>item.status!=='APPROVED');
  if(pending.length)blockers.push({code:'REQUIRED_PBC_PENDING',description:`${pending.length} required PBC item(s) remain unaccepted.`,route:'documents',details:{requests:pending}});
  const folderResult=await env.DB.prepare(`SELECT id,code,display_name AS displayName,ordinal FROM engagement_folders WHERE workspace_id=? AND engagement_id=? ORDER BY ordinal`)
    .bind(workspaceId,engagementId).all<Record<string,unknown>>();
  const folders=folderResult.results??[];
  if(folders.length!==5)blockers.push({code:'ENGAGEMENT_FOLDERS_REQUIRED',description:'Provision the exact five engagement folders through current Partner risk clearance.',route:'onboarding',details:{count:folders.length}});
  const riskRows=((materiality as any)?.riskRows??[]) as Array<Record<string,unknown>>;
  const standard=await env.DB.prepare(`SELECT id,name,version,reporting_framework,isa_220_edition,isa_570_edition,presentation_edition FROM standards_profiles WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,engagement.standards_profile_id).first<Record<string,unknown>>();
  if(!standard)blockers.push({code:'STANDARDS_PROFILE_REQUIRED',description:'The engagement standards profile is unavailable.',route:'audit-planning'});
  const deps={engagementId,clientId:engagement.client_id,lifecycleState:engagement.lifecycle_state,tbVersionId:sources.active_tb_version_id,
    mappingVersionId:sources.active_mapping_version_id,materialityVersionId:sources.active_materiality_version_id,standardsProfileId:engagement.standards_profile_id,
    tbHash,mappingHash,materialityHash,tb,mapping,materiality,staffing,milestones,pbc,folders,risks:riskRows,standard};
  const dependencyHash=await sha256Hex(JSON.stringify(deps));
  return {engagementId,clientId:engagement.client_id,lifecycleState:engagement.lifecycle_state,tbVersionId:sources.active_tb_version_id,
    mappingVersionId:sources.active_mapping_version_id,materialityVersionId:sources.active_materiality_version_id,standardsProfileId:engagement.standards_profile_id,
    tbHash,mappingHash,materialityHash,tb,mapping,materiality,staffing,milestones,pbc,folders,risks:riskRows,blockers,dependencyHash};
}

export async function getBusinessPlanningReadiness(env:Env,workspaceId:string,context:BusinessContext,engagementId:string){
  const snapshot=await collectPlanningDependencies(env,workspaceId,context,engagementId,true);
  return {ready:snapshot.blockers.length===0,blockers:snapshot.blockers,dependencies:{tbVersionId:snapshot.tbVersionId,mappingVersionId:snapshot.mappingVersionId,
    materialityVersionId:snapshot.materialityVersionId,standardsProfileId:snapshot.standardsProfileId,tbHash:snapshot.tbHash,mappingHash:snapshot.mappingHash,
    materialityHash:snapshot.materialityHash,staffingCount:snapshot.staffing.length,milestoneCount:snapshot.milestones.length,requiredPbcCount:snapshot.pbc.length,
    folderCount:snapshot.folders.length,riskCount:snapshot.risks.length},dependencyHash:snapshot.dependencyHash};
}

export async function getBusinessTrialBalanceWorkspace(env:Env,workspaceId:string,context:BusinessContext,engagementId:string){
  const workspace=await requireWorkspace(env,workspaceId);if(workspace.data_mode!=='BUSINESS')throw new ApiError('BAD_REQUEST','Trial-balance workspace requires BUSINESS mode.');
  requireInternalRead(context);const sources=await getTbSources(env,workspaceId,context,engagementId,true);const e=sources.engagement;
  const [standard,imports,folders]=await Promise.all([
    env.DB.prepare(`SELECT reporting_framework FROM standards_profiles WHERE workspace_id=? AND id=?`).bind(workspaceId,e.standards_profile_id).first<{reporting_framework:string}>(),
    env.DB.prepare(`SELECT i.id,i.file_version_id AS fileVersionId,f.original_name AS fileName,i.status,i.worksheet,i.column_map_json AS columnMapJson,i.row_count AS rowCount,
        i.source_sha256 AS sourceSha256,i.current_debits_minor AS currentDebitsMinor,i.current_credits_minor AS currentCreditsMinor,
        i.prior_debits_minor AS priorDebitsMinor,i.prior_credits_minor AS priorCreditsMinor,i.error_count AS errorCount,i.errors_json AS errorsJson,i.created_at AS createdAt
      FROM tb_imports i JOIN file_versions f ON f.workspace_id=i.workspace_id AND f.id=i.file_version_id
      WHERE i.workspace_id=? AND i.engagement_id=? ORDER BY i.created_at DESC,i.id DESC LIMIT 20`).bind(workspaceId,engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,code,display_name AS displayName,ordinal FROM engagement_folders WHERE workspace_id=? AND engagement_id=? ORDER BY ordinal`)
      .bind(workspaceId,engagementId).all<Record<string,unknown>>()
  ]);
  let tbVersion:Record<string,unknown>|null=null;let tbLines:Record<string,unknown>[]=[];
  if(sources.active_tb_version_id){
    tbVersion=await env.DB.prepare(`SELECT id,revision,period_start AS periodStart,period_end AS periodEnd,currency,current_debits_minor AS currentDebitsMinor,
      current_credits_minor AS currentCreditsMinor,prior_debits_minor AS priorDebitsMinor,prior_credits_minor AS priorCreditsMinor,prior_present AS priorPresent,
      row_count AS rowCount,content_sha256 AS contentSha256,accepted_at AS acceptedAt FROM tb_versions WHERE workspace_id=? AND id=?`)
      .bind(workspaceId,sources.active_tb_version_id).first<Record<string,unknown>>();
    const result=await env.DB.prepare(`SELECT l.id,l.source_row_number AS sourceRowNumber,l.account_code AS accountCode,l.account_name AS accountName,
        l.current_minor AS currentMinor,l.prior_minor AS priorMinor,m.fsli_id AS fsliId,c.code AS fsliCode,c.name AS fsliName,
        d.fsli_id AS draftFsliId,d.confirmed AS mappingConfirmed,d.version AS mappingRowVersion,d.origin AS mappingOrigin,d.reason AS mappingReason
      FROM tb_lines l LEFT JOIN tb_mappings m ON m.workspace_id=l.workspace_id AND m.tb_line_id=l.id AND m.mapping_version_id=?
      LEFT JOIN fsli_catalog c ON c.workspace_id=m.workspace_id AND c.id=m.fsli_id
      LEFT JOIN mapping_draft_lines d ON d.workspace_id=l.workspace_id AND d.tb_line_id=l.id AND d.draft_id=(SELECT id FROM mapping_drafts
        WHERE workspace_id=l.workspace_id AND engagement_id=l.engagement_id AND tb_version_id=l.tb_version_id AND status='DRAFT' ORDER BY revision DESC LIMIT 1)
      WHERE l.workspace_id=? AND l.engagement_id=? AND l.tb_version_id=? ORDER BY l.source_row_number,l.account_code LIMIT 20000`)
      .bind(sources.active_mapping_version_id,workspaceId,engagementId,sources.active_tb_version_id).all<Record<string,unknown>>();
    tbLines=result.results??[];
  }
  let mappingDraft:Record<string,unknown>|null=null;
  if(sources.active_tb_version_id){
    mappingDraft=await env.DB.prepare(`SELECT id,revision,status,reporting_framework AS reportingFramework,content_sha256 AS draftHash,created_at AS createdAt
      FROM mapping_drafts WHERE workspace_id=? AND engagement_id=? AND tb_version_id=? AND status='DRAFT' ORDER BY revision DESC LIMIT 1`)
      .bind(workspaceId,engagementId,sources.active_tb_version_id).first<Record<string,unknown>>();
    if(mappingDraft){
      const draftLines=await mappingDraftRows(env,workspaceId,String(mappingDraft.id));
      const actualHash=await hashMappingDraft(draftLines);
      mappingDraft={...mappingDraft,draftHash:actualHash,lines:draftLines.map(row=>({id:row.id,version:row.version,tbLineId:row.tb_line_id,accountCode:row.account_code,
        accountName:row.account_name,balanceMinor:String(row.current_minor),priorBalanceMinor:row.prior_minor==null?null:String(row.prior_minor),fsliId:row.fsli_id,origin:row.origin,sourceHistoricalMappingId:row.source_historical_mapping_id,
        historyPeriodEnd:row.history_period_end,historyMappingRevision:row.history_mapping_revision,
        suggestionKind:row.suggestion_kind,suggestionScore:row.suggestion_score,
        confirmed:Boolean(row.confirmed),reason:row.reason}))};
    }
  }
  const catalog=standard?await env.DB.prepare(`SELECT id,code,name,statement,category,normal_side AS normalSide,display_sign AS displaySign,presentation_order AS presentationOrder
      FROM fsli_catalog WHERE workspace_id=? AND reporting_framework=? AND active=1 ORDER BY presentation_order,code`)
    .bind(workspaceId,standard.reporting_framework).all<Record<string,unknown>>():{results:[]};
  let materiality:Record<string,unknown>|null=null;
  if(sources.active_materiality_version_id){
    const value=await env.DB.prepare(`SELECT id,revision,tb_version_id AS tbVersionId,mapping_version_id AS mappingVersionId,benchmark,benchmark_minor AS benchmarkMinor,
        normalization_minor AS normalizationMinor,normalization_reason AS normalizationReason,benchmark_rate_bps AS benchmarkRateBps,
        performance_rate_bps AS performanceRateBps,sad_rate_bps AS sadRateBps,pm_raw_numerator AS pmRawNumerator,pm_raw_denominator AS pmRawDenominator,
        te_raw_numerator AS teRawNumerator,te_raw_denominator AS teRawDenominator,sad_raw_numerator AS sadRawNumerator,sad_raw_denominator AS sadRawDenominator,
        planning_minor AS planningMinor,performance_minor AS performanceMinor,sad_minor AS sadMinor,rounding_reason AS roundingReason,source_sha256 AS sourceHash,calculated_at AS calculatedAt
      FROM materiality_versions WHERE workspace_id=? AND id=?`).bind(workspaceId,sources.active_materiality_version_id).first<Record<string,unknown>>();
    if(value){
      const risks=await env.DB.prepare(`SELECT r.id,r.revision,r.fsli_id AS fsliId,c.code,c.name,CAST(r.balance_minor AS TEXT) AS balanceMinor,r.inherent_risk AS inherentRisk,
          r.critical_estimate AS criticalEstimate,r.band,r.rationale,r.source_sha256 AS sourceHash
        FROM fsli_risks r JOIN fsli_catalog c ON c.workspace_id=r.workspace_id AND c.id=r.fsli_id WHERE r.workspace_id=? AND r.engagement_id=? AND r.materiality_version_id=?
          AND r.revision=(SELECT MAX(r2.revision) FROM fsli_risks r2 WHERE r2.workspace_id=r.workspace_id AND r2.engagement_id=r.engagement_id AND r2.fsli_id=r.fsli_id)
        ORDER BY c.presentation_order,c.code`).bind(workspaceId,engagementId,value.id).all<Record<string,unknown>>();
      materiality={...value,risks:risks.results??[]};
    }
  }
  const readiness=await collectPlanningDependencies(env,workspaceId,context,engagementId,true);
  const latestPlanning=await env.DB.prepare(`SELECT p.id,p.revision,p.tb_version_id AS tbVersionId,p.mapping_version_id AS mappingVersionId,
      p.materiality_version_id AS materialityVersionId,p.scope_text AS scopeText,p.strategy_text AS strategyText,p.source_sha256 AS sourceHash,p.prepared_at AS preparedAt,
      s.id AS signoffId,s.approved_at AS approvedAt,s.rationale AS signoffRationale,
      (SELECT COUNT(*) FROM planning_stale_events x WHERE x.workspace_id=p.workspace_id AND x.planning_version_id=p.id) AS staleEventCount
    FROM planning_versions p LEFT JOIN planning_signoffs s ON s.workspace_id=p.workspace_id AND s.planning_version_id=p.id
    WHERE p.workspace_id=? AND p.engagement_id=? ORDER BY p.revision DESC LIMIT 1`).bind(workspaceId,engagementId).first<Record<string,unknown>>();
  return {engagement:{id:e.id,clientId:e.client_id,code:(await env.DB.prepare(`SELECT code FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId,e.id).first<{code:string}>())?.code,
      lifecycleState:e.lifecycle_state,periodStart:e.period_start,periodEnd:e.period_end,activeTbVersionId:sources.active_tb_version_id,
      activeMappingVersionId:sources.active_mapping_version_id,activeMaterialityVersionId:sources.active_materiality_version_id,approvedPlanningVersionId:sources.approved_planning_version_id},
    imports:(imports.results??[]).map(row=>({...row,columnMap:JSON.parse(String(row.columnMapJson)),errors:JSON.parse(String(row.errorsJson))})),folders:folders.results??[],
    tbVersion,tbLines,mappingDraft,fsliCatalog:catalog.results??[],materiality,planning:latestPlanning,readiness:{ready:readiness.blockers.length===0,blockers:readiness.blockers,
      dependencyHash:readiness.dependencyHash,dependencies:{tbVersionId:readiness.tbVersionId,mappingVersionId:readiness.mappingVersionId,materialityVersionId:readiness.materialityVersionId}}};
}

export async function getBusinessTrialBalanceImport(env:Env,workspaceId:string,context:BusinessContext,engagementId:string,importId:string){
  requireInternalRead(context);await getTbSources(env,workspaceId,context,engagementId,true);
  const row=await env.DB.prepare(`SELECT i.id,i.status,i.row_count AS rowCount,i.error_count AS errorCount,i.errors_json AS errorsJson,
      i.current_debits_minor AS currentDebitsMinor,i.current_credits_minor AS currentCreditsMinor,i.prior_debits_minor AS priorDebitsMinor,
      i.prior_credits_minor AS priorCreditsMinor,i.source_sha256 AS sourceSha256,i.file_version_id AS fileVersionId,i.worksheet,i.column_map_json AS columnMapJson
    FROM tb_imports i WHERE i.workspace_id=? AND i.id=? AND i.engagement_id=?`).bind(workspaceId,importId,engagementId)
    .first<Record<string,unknown>>();
  if(!row)throw new ApiError('NOT_FOUND','The TB import was not found in this engagement.');
  const preview=await env.DB.prepare(`SELECT source_row_number AS sourceRowNumber,account_code AS accountCode,account_name AS accountName,
      CAST(current_minor AS TEXT) AS currentMinor,CAST(prior_minor AS TEXT) AS priorMinor,errors_json AS errors
    FROM tb_staging_lines WHERE workspace_id=? AND import_id=? ORDER BY source_row_number LIMIT 100`)
    .bind(workspaceId,importId).all<Record<string,unknown>>();
  return {...row,errors:JSON.parse(String(row.errorsJson)),columnMap:JSON.parse(String(row.columnMapJson)),preview:preview.results??[]};
}

export async function buildBusinessTbMutation(env:Env,workspaceId:string,context:BusinessContext,command:BusinessTbCommand,commandId:string,now:string):Promise<BusinessMutation>{
  switch(command.type){
    case 'tb.import': return importCommand(env,workspaceId,context,command,commandId,now);
    case 'tb.activate': return activateTrialBalance(env,workspaceId,context,command,now);
    case 'tb.mapping.propose': return proposeMapping(env,workspaceId,context,command,now);
    case 'tb.mapping.set': return setMapping(env,workspaceId,context,command,now);
    case 'tb.mapping.approve': return approveMapping(env,workspaceId,context,command,now);
    case 'materiality.calculate': return calculateMateriality(env,workspaceId,context,command,now);
    case 'materiality.adjust': return adjustMateriality(env,workspaceId,context,command,now);
    case 'fsli.risk.set': return setFsliRisk(env,workspaceId,context,command,now);
    case 'planning.compile': return compilePlanning(env,workspaceId,context,command,commandId,now);
    case 'planning.approve': return approvePlanning(env,workspaceId,context,command,commandId,now);
  }
}

async function compilePlanning(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessTbCommand,{type:'planning.compile'}>,commandId:string,now:string):Promise<BusinessMutation>{
  requireTbWriter(context,true);const p=command.payload;const snapshot=await collectPlanningDependencies(env,workspaceId,context,p.engagementId);
  if(!snapshot.tbVersionId||!snapshot.mappingVersionId||!snapshot.materialityVersionId){
    throw new ApiError('GATE_BLOCKED','A planning version needs an accepted TB, approved mapping and calculated materiality as its version-pinned sources.',
      {blockers:snapshot.blockers.filter(item=>['ACTIVE_TB_REQUIRED','ACTIVE_TB_MISSING','APPROVED_MAPPING_REQUIRED','CURRENT_MATERIALITY_REQUIRED'].includes(item.code))});
  }
  if(snapshot.tbVersionId!==p.tbVersionId||snapshot.mappingVersionId!==p.mappingVersionId||snapshot.materialityVersionId!==p.materialityVersionId){
    throw new ApiError('VERSION_CONFLICT','Compile against the current active TB, mapping and materiality revisions.');
  }
  const sourceHash=await sha256Hex(JSON.stringify({dependencyHash:snapshot.dependencyHash,tbVersionId:p.tbVersionId,mappingVersionId:p.mappingVersionId,
    materialityVersionId:p.materialityVersionId,standardsProfileId:snapshot.standardsProfileId,scopeText:p.scopeText,strategyText:p.strategyText}));
  const revision=(await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS revision FROM planning_versions WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId,p.engagementId).first<{revision:number}>())?.revision??1;
  const versionId=crypto.randomUUID();const timestamp=new Date(now).toISOString();
  const currentEngagement=await env.DB.prepare(`SELECT version FROM engagements WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,p.engagementId).first<{version:number}>();
  const statements=[
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,106,CASE WHEN EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND id=?
      AND version=? AND lifecycle_state='PORTAL_ACTIVE_PLANNING' AND active_tb_version_id=? AND active_mapping_version_id=? AND active_materiality_version_id=? AND locked_at IS NULL)
      THEN 1 ELSE 0 END`).bind(workspaceId,workspaceId,p.engagementId,currentEngagement?.version??-1,p.tbVersionId,p.mappingVersionId,p.materialityVersionId),
    env.DB.prepare(`INSERT INTO planning_versions(id,workspace_id,client_id,engagement_id,revision,tb_version_id,mapping_version_id,materiality_version_id,standards_profile_id,
      scope_text,strategy_text,staffing_snapshot_json,milestone_snapshot_json,risk_snapshot_json,pbc_dependency_snapshot_json,source_sha256,prepared_by_actor_id,prepared_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(versionId,workspaceId,snapshot.clientId,p.engagementId,revision,p.tbVersionId,p.mappingVersionId,p.materialityVersionId,
        snapshot.standardsProfileId,p.scopeText,p.strategyText,JSON.stringify(snapshot.staffing),JSON.stringify(snapshot.milestones),JSON.stringify(snapshot.risks),
        JSON.stringify(snapshot.pbc),sourceHash,context.actor.id,timestamp)
  ];
  return {statements,result:{planningVersionId:versionId,revision,blockers:snapshot.blockers,sourceHash,dependencyHash:snapshot.dependencyHash},
    entityType:'PLANNING_VERSION',entityId:versionId,beforeVersion:null,afterVersion:revision,
    auditDetails:{engagementId:p.engagementId,tbVersionId:p.tbVersionId,mappingVersionId:p.mappingVersionId,materialityVersionId:p.materialityVersionId,sourceHash,blockerCount:snapshot.blockers.length}};
}

async function approvePlanning(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessTbCommand,{type:'planning.approve'}>,commandId:string,now:string):Promise<BusinessMutation>{
  requirePartner(context);const p=command.payload;const snapshot=await collectPlanningDependencies(env,workspaceId,context,p.engagementId);
  if(snapshot.blockers.length){
    throw new ApiError('GATE_BLOCKED',`Planning sign-off is blocked by ${snapshot.blockers.length} unresolved prerequisite(s).`,{blockers:snapshot.blockers});
  }
  const plan=await env.DB.prepare(`SELECT id,client_id,engagement_id,revision,tb_version_id,mapping_version_id,materiality_version_id,standards_profile_id,
      scope_text,strategy_text,staffing_snapshot_json,milestone_snapshot_json,risk_snapshot_json,pbc_dependency_snapshot_json,source_sha256,prepared_by_actor_id
    FROM planning_versions WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(workspaceId,p.planningVersionId,p.engagementId)
    .first<{id:string;client_id:string;engagement_id:string;revision:number;tb_version_id:string;mapping_version_id:string;materiality_version_id:string;standards_profile_id:string;
      scope_text:string;strategy_text:string;staffing_snapshot_json:string;milestone_snapshot_json:string;risk_snapshot_json:string;pbc_dependency_snapshot_json:string;source_sha256:string;prepared_by_actor_id:string}>();
  if(!plan)throw new ApiError('NOT_FOUND','The planning version was not found.');
  if(plan.tb_version_id!==snapshot.tbVersionId||plan.mapping_version_id!==snapshot.mappingVersionId||plan.materiality_version_id!==snapshot.materialityVersionId
    ||plan.standards_profile_id!==snapshot.standardsProfileId)throw new ApiError('VERSION_CONFLICT','A planning source version changed after compilation. Compile a new plan against current sources.');
  const recomputedHash=await sha256Hex(JSON.stringify({dependencyHash:snapshot.dependencyHash,tbVersionId:plan.tb_version_id,mappingVersionId:plan.mapping_version_id,
    materialityVersionId:plan.materiality_version_id,standardsProfileId:plan.standards_profile_id,scopeText:plan.scope_text,strategyText:plan.strategy_text}));
  if(plan.source_sha256!==p.dependencyHash||plan.source_sha256!==recomputedHash){
    throw new ApiError('VERSION_CONFLICT','The compiled planning dependency hash is stale. Review the current blockers and compile again.');
  }
  const stale=await env.DB.prepare(`SELECT id,reason FROM planning_stale_events WHERE workspace_id=? AND planning_version_id=? ORDER BY recorded_at,id LIMIT 1`)
    .bind(workspaceId,plan.id).first<{id:string;reason:string}>();
  if(stale)throw new ApiError('VERSION_CONFLICT',`This planning version is stale: ${stale.reason}`);
  const preparer=await env.DB.prepare(`SELECT sm.natural_person_key FROM actor_profiles ap JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
    WHERE ap.workspace_id=? AND ap.id=?`).bind(workspaceId,plan.prepared_by_actor_id).first<{natural_person_key:string}>();
  const approver=await env.DB.prepare(`SELECT sm.natural_person_key FROM actor_profiles ap JOIN staff_members sm ON sm.workspace_id=ap.workspace_id AND sm.id=ap.staff_member_id
    WHERE ap.workspace_id=? AND ap.id=?`).bind(workspaceId,context.actor.id).first<{natural_person_key:string}>();
  if(preparer&&approver&&preparer.natural_person_key===approver.natural_person_key){
    throw new ApiError('PERSONA_ACTION_DENIED','The planning approver must be a different natural-person record from the plan preparer.');
  }
  const engagement=await env.DB.prepare(`SELECT version,lifecycle_state FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId,p.engagementId)
    .first<{version:number;lifecycle_state:string}>();
  if(!engagement||engagement.lifecycle_state!=='PORTAL_ACTIVE_PLANNING')throw new ApiError('INVALID_STATE','The engagement is no longer in active planning.');
  const signoffId=crypto.randomUUID();const decisionId=crypto.randomUUID();const transitionId=crypto.randomUUID();const timestamp=new Date(now).toISOString();
  const actorSnapshot=JSON.stringify({actorId:context.actor.id,persona:context.actor.persona,displayName:context.actor.displayName,staffGrade:context.actor.staffGrade,assurance:'SELF_ASSERTED'});
  const statements=[
    env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,107,CASE WHEN EXISTS(SELECT 1 FROM engagements e JOIN planning_versions p
      ON p.workspace_id=e.workspace_id AND p.engagement_id=e.id WHERE e.workspace_id=? AND e.id=? AND e.version=? AND e.lifecycle_state='PORTAL_ACTIVE_PLANNING'
        AND e.active_tb_version_id=p.tb_version_id AND e.active_mapping_version_id=p.mapping_version_id AND e.active_materiality_version_id=p.materiality_version_id
        AND e.locked_at IS NULL AND e.portal_frozen_at IS NULL AND p.id=? AND p.source_sha256=?
        AND NOT EXISTS(SELECT 1 FROM planning_stale_events s WHERE s.workspace_id=p.workspace_id AND s.planning_version_id=p.id)
        AND (SELECT COUNT(*) FROM engagement_folders f WHERE f.workspace_id=e.workspace_id AND f.engagement_id=e.id)=5
        AND NOT EXISTS(SELECT 1 FROM pbc_requests r WHERE r.workspace_id=e.workspace_id AND r.engagement_id=e.id AND r.required_for_planning=1 AND r.status<>'APPROVED')
        AND NOT EXISTS(SELECT 1 FROM tb_lines l LEFT JOIN tb_mappings m ON m.workspace_id=l.workspace_id AND m.tb_line_id=l.id AND m.mapping_version_id=p.mapping_version_id
          WHERE l.workspace_id=e.workspace_id AND l.engagement_id=e.id AND l.tb_version_id=p.tb_version_id AND (l.current_minor<>0 OR COALESCE(l.prior_minor,0)<>0) AND m.id IS NULL)
        AND (SELECT COUNT(DISTINCT m.fsli_id) FROM tb_mappings m WHERE m.workspace_id=e.workspace_id AND m.mapping_version_id=p.mapping_version_id)
          =(SELECT COUNT(DISTINCT r.fsli_id) FROM fsli_risks r WHERE r.workspace_id=e.workspace_id AND r.engagement_id=e.id AND r.materiality_version_id=p.materiality_version_id
            AND r.revision=(SELECT MAX(r2.revision) FROM fsli_risks r2 WHERE r2.workspace_id=r.workspace_id AND r2.engagement_id=r.engagement_id AND r2.fsli_id=r.fsli_id))
        AND EXISTS(SELECT 1 FROM engagement_assignments a WHERE a.workspace_id=e.workspace_id AND a.engagement_id=e.id AND a.phase IN ('PLANNING','FIELDWORK') AND a.persona='PREPARER')
        AND EXISTS(SELECT 1 FROM engagement_assignments a WHERE a.workspace_id=e.workspace_id AND a.engagement_id=e.id AND a.phase IN ('PLANNING','FIELDWORK') AND a.persona='REVIEWER')
        AND EXISTS(SELECT 1 FROM engagement_assignments a JOIN staff_members sm ON sm.workspace_id=a.workspace_id AND sm.id=a.staff_member_id WHERE a.workspace_id=e.workspace_id
          AND a.engagement_id=e.id AND a.phase IN ('PLANNING','REVIEW') AND a.persona='APPROVER' AND sm.grade='PARTNER')
        AND EXISTS(SELECT 1 FROM milestones m WHERE m.workspace_id=e.workspace_id AND m.engagement_id=e.id AND m.code='STATUTORY_CUTOFF')
        AND NOT EXISTS(SELECT 1 FROM engagement_assignment_days d JOIN engagement_assignments a ON a.workspace_id=d.workspace_id AND a.id=d.assignment_id
          LEFT JOIN staff_availability sa ON sa.workspace_id=a.workspace_id AND sa.staff_member_id=a.staff_member_id AND sa.work_date=d.work_date
          WHERE a.workspace_id=e.workspace_id AND a.engagement_id=e.id AND a.phase IN ('PLANNING','FIELDWORK') AND (sa.id IS NULL OR
            (SELECT SUM(d2.planned_minutes) FROM engagement_assignment_days d2 JOIN engagement_assignments a2 ON a2.workspace_id=d2.workspace_id AND a2.id=d2.assignment_id
              WHERE a2.workspace_id=a.workspace_id AND a2.staff_member_id=a.staff_member_id AND d2.work_date=d.work_date)
              > sa.scheduled_minutes-sa.approved_leave_minutes+COALESCE((SELECT SUM(x.excess_minutes) FROM capacity_exceptions x WHERE x.workspace_id=a.workspace_id
                AND x.staff_member_id=a.staff_member_id AND x.work_date=d.work_date),0)))
      ) THEN 1 ELSE 0 END`).bind(workspaceId,workspaceId,p.engagementId,engagement.version,plan.id,plan.source_sha256),
    env.DB.prepare(`INSERT INTO approval_decisions(id,workspace_id,client_id,engagement_id,version,subject_type,subject_id,subject_version,decision,rationale,actor_snapshot_json,decided_at,supersedes_decision_id)
      VALUES(?,?,?, ?,1,'PLANNING_VERSION',?,?, 'APPROVE',?,?,?,NULL)`)
      .bind(decisionId,workspaceId,plan.client_id,plan.engagement_id,plan.id,plan.revision,p.rationale,actorSnapshot,timestamp),
    env.DB.prepare(`INSERT INTO planning_signoffs(id,workspace_id,planning_version_id,partner_actor_id,approved_at,rationale,dependency_sha256)
      VALUES(?,?,?,?,?,?,?)`).bind(signoffId,workspaceId,plan.id,context.actor.id,timestamp,p.rationale,plan.source_sha256),
    env.DB.prepare(`UPDATE engagements SET approved_planning_version_id=?,lifecycle_state='FIELDWORK_EXECUTION',version=version+1,updated_at=?,updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state='PORTAL_ACTIVE_PLANNING' AND active_tb_version_id=? AND active_mapping_version_id=? AND active_materiality_version_id=?`)
      .bind(plan.id,timestamp,context.actor.id,workspaceId,plan.engagement_id,engagement.version,plan.tb_version_id,plan.mapping_version_id,plan.materiality_version_id),
    env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at)
      VALUES(?,?,?, ?,1,'PORTAL_ACTIVE_PLANNING','FIELDWORK_EXECUTION',?,?,?,?)`)
      .bind(transitionId,workspaceId,plan.client_id,plan.engagement_id,commandId,p.rationale,plan.source_sha256,timestamp)
  ];
  return {statements,result:{signoffId,approvalDecisionId:decisionId,planningVersionId:plan.id,state:'FIELDWORK_EXECUTION',engagementVersion:engagement.version+1,
    dependencyHash:plan.source_sha256,transitionId},entityType:'PLANNING_SIGNOFF',entityId:signoffId,beforeVersion:engagement.version,afterVersion:engagement.version+1,
    auditDetails:{planningVersionId:plan.id,sourceHash:plan.source_sha256,partnerActorId:context.actor.id,transitionId}};
}
