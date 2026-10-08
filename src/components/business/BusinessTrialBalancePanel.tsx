import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import type {
  BusinessContextResponse,
  BusinessFileMediaType,
  BusinessFileMetadata,
  BusinessTrialBalanceImport,
  BusinessTrialBalancePreview,
  BusinessTrialBalanceWorkspace,
  BusinessWorkspacePreference
} from '../../shared/api/business';
import {
  completeBusinessFile,
  getBusinessTrialBalanceImport,
  getBusinessTrialBalancePreview,
  getBusinessTrialBalanceWorkspace,
  initializeBusinessFile,
  newBusinessIdempotencyKey,
  runBusinessCommand,
  uploadBusinessFile
} from '../../services/businessWorkspace';

type EngagementRef = { id: string; clientId: string; code: string; clientName: string; lifecycleState: string };
type ColumnMap = { headerRow: number; accountCodeColumn: number; accountNameColumn: number; balanceColumn?: number;
  debitColumn?: number; creditColumn?: number; priorBalanceColumn?: number; currencyColumn?: number };
type Benchmark = 'PBT' | 'REVENUE' | 'TOTAL_ASSETS' | 'EQUITY';
type AdjustmentDraft = { description: string; amount: string; evidenceFileId: string };
type RiskDraft = { inherentRisk: 'LOW' | 'MODERATE' | 'HIGH'; criticalEstimate: boolean; rationale: string };

const emptyColumns: ColumnMap = { headerRow: 1, accountCodeColumn: 0, accountNameColumn: 1, balanceColumn: 2 };

function fileMediaType(file: File): BusinessFileMediaType | null {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') return 'text/csv';
  if (extension === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return null;
}

function minorFromQar(value: string): string {
  const match = value.trim().match(/^(-?)(0|[1-9]\d*)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('Enter a QAR amount with no more than two decimal places.');
  const minor = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0') || '0');
  const signed = match[1] ? -minor : minor;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('The amount exceeds supported precision.');
  return signed.toString();
}

function qarFromMinor(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const minor = BigInt(String(value));
  const absolute = minor < 0n ? -minor : minor;
  return `${minor < 0n ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

function defaultBenchmarkRate(benchmark: Benchmark): string {
  return ({ PBT: '7.50', REVENUE: '1.00', TOTAL_ASSETS: '0.75', EQUITY: '1.50' })[benchmark];
}

function columnLetter(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) { const remainder = (value - 1) % 26; label = String.fromCharCode(65 + remainder) + label; value = Math.floor((value - 1) / 26); }
  return label;
}

function suggestedColumns(preview: BusinessTrialBalancePreview): ColumnMap {
  const headers = preview.preview[0] ?? [];
  const find = (pattern: RegExp, fallback: number) => {
    const index = headers.findIndex(value => pattern.test(value.toLowerCase()));
    return index >= 0 ? index : fallback;
  };
  const code = find(/account\s*(code|no|number)|^code$/, 0);
  const name = find(/account\s*(name|description)|description|^name$/, Math.min(1, preview.maxColumns - 1));
  const debit = headers.findIndex(value => /^(debit|dr)(\s|$)/i.test(value.trim()));
  const credit = headers.findIndex(value => /^(credit|cr)(\s|$)/i.test(value.trim()));
  const balance = headers.findIndex(value => /balance|amount|current/i.test(value));
  const prior = headers.findIndex(value => /prior|previous|comparative|py\b/i.test(value));
  const currency = headers.findIndex(value => /^(currency|ccy)(\b|\s|$)/i.test(value.trim()));
  const selected = new Set([code, name, debit, credit, balance, prior].filter(index => index >= 0));
  return { headerRow: preview.previewStartsAtRow, accountCodeColumn: code, accountNameColumn: name,
    ...(debit >= 0 && credit >= 0 ? { debitColumn: debit, creditColumn: credit } : { balanceColumn: balance >= 0 && balance !== code && balance !== name ? balance : Math.min(2, preview.maxColumns - 1) }),
    ...(prior >= 0 && prior !== code && prior !== name && prior !== balance && prior !== debit && prior !== credit ? { priorBalanceColumn: prior } : {}),
    ...(currency >= 0 && !selected.has(currency) ? { currencyColumn: currency } : {}) };
}

export function BusinessTrialBalancePanel({
  workspaceId, selected, context, engagement, files, onChanged
}: {
  workspaceId: string;
  selected: BusinessWorkspacePreference;
  context: BusinessContextResponse;
  engagement: EngagementRef;
  files: BusinessFileMetadata[];
  onChanged: () => void;
}) {
  const scope = useMemo(() => ({ ...selected, clientId: engagement.clientId, engagementId: engagement.id }),
    [selected.actorId, selected.persona, engagement.clientId, engagement.id]);
  const [workspace, setWorkspace] = useState<BusinessTrialBalanceWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedFileId, setSelectedFileId] = useState('');
  const [preview, setPreview] = useState<BusinessTrialBalancePreview | null>(null);
  const [columns, setColumns] = useState<ColumnMap>(emptyColumns);
  const [mappingReasons, setMappingReasons] = useState<Record<string, string>>({});
  const [importId, setImportId] = useState('');
  const [importDetail, setImportDetail] = useState<BusinessTrialBalanceImport | null>(null);
  const [benchmark, setBenchmark] = useState<Benchmark>('REVENUE');
  const [benchmarkRate, setBenchmarkRate] = useState('1.00');
  const [performanceRate, setPerformanceRate] = useState('60');
  const [sadRate, setSadRate] = useState('4');
  const [normalizationReason, setNormalizationReason] = useState('');
  const [adjustment, setAdjustment] = useState<AdjustmentDraft>({ description: '', amount: '', evidenceFileId: '' });
  const [roundingValues, setRoundingValues] = useState({ planning: '', performance: '', sad: '', reason: '' });
  const [riskDrafts, setRiskDrafts] = useState<Record<string, RiskDraft>>({});
  const [scopeText, setScopeText] = useState('Perform the statutory audit for the approved reporting period using the accepted source records.');
  const [strategyText, setStrategyText] = useState('Apply a risk-led audit strategy to material balances, significant classes and required disclosures.');
  const [signoffRationale, setSignoffRationale] = useState('I reviewed the current source versions, resolved planning blockers and approve this plan for fieldwork.');

  const canWrite = context.allowedActions.includes('tb.manage') && context.actor.persona !== 'CLIENT';
  const canReview = context.actor.persona === 'REVIEWER' || (context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER');
  const isPartner = context.actor.persona === 'APPROVER' && context.actor.staffGrade === 'PARTNER';
  const canPlan = engagement.lifecycleState === 'PORTAL_ACTIVE_PLANNING';
  const tbFolderId = workspace?.folders.find(folder => folder.code === 'TB_SCHEDULES')?.id;
  const activeImport = importDetail?.id === importId ? importDetail : null;
  const latestImport = workspace?.imports.find(item => item.id === importId) ?? workspace?.imports[0] ?? null;
  const materiality = workspace?.materiality ?? null;
  const mappingDraft = workspace?.mappingDraft ?? null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setWorkspace(null);
    getBusinessTrialBalanceWorkspace(workspaceId, engagement.id, scope, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        setWorkspace(data);
        setImportId(current => current || data.imports[0]?.id || '');
        setBenchmark(current => data.materiality?.benchmark ?? current);
        setBenchmarkRate(current => data.materiality ? (data.materiality.benchmarkRateBps / 100).toFixed(2) : current);
        if (data.materiality) { setPerformanceRate((data.materiality.performanceRateBps / 100).toFixed(2)); setSadRate((data.materiality.sadRateBps / 100).toFixed(2)); }
        if (data.materiality) setRoundingValues({ planning: qarFromMinor(data.materiality.planningMinor),
          performance: qarFromMinor(data.materiality.performanceMinor), sad: qarFromMinor(data.materiality.sadMinor), reason: data.materiality.roundingReason ?? '' });
        if (data.materiality) setRiskDrafts(Object.fromEntries(data.materiality.risks.map(risk => [risk.fsliId, {
          inherentRisk: risk.inherentRisk, criticalEstimate: Boolean(risk.criticalEstimate), rationale: risk.rationale
        }])));
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Trial-balance planning records could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, engagement.id, scope.actorId, scope.persona, scope.clientId, scope.engagementId, refresh]);

  useEffect(() => {
    if (!importId) { setImportDetail(null); return; }
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = await getBusinessTrialBalanceImport(workspaceId, engagement.id, importId, scope);
        if (cancelled) return;
        setImportDetail(next);
        if (next.status === 'STAGED' || next.status === 'VALIDATING') timer = window.setTimeout(() => void poll(), 1200);
        else setRefresh(value => value + 1);
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Import status could not be loaded.'); }
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [workspaceId, engagement.id, importId, scope.actorId, scope.persona, scope.clientId, scope.engagementId]);

  async function command(type: string, payload: Record<string, unknown>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await runBusinessCommand<{ importId?: string; materialityVersionId?: string; planningVersionId?: string }>(
        workspaceId, scope, { type, payload }, newBusinessIdempotencyKey());
      const result = response.result;
      if (result.importId) setImportId(result.importId);
      setMessage(success);
      setRefresh(value => value + 1);
      onChanged();
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The requested planning change could not be saved.');
      return null;
    } finally { setBusy(false); }
  }

  async function uploadTb(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem('tb-file') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || !tbFolderId) { setError('A TB file and the engagement TB & Schedules folder are required.'); return; }
    const mediaType = fileMediaType(file);
    if (!mediaType) { setError('Choose a static-value .csv or .xlsx file.'); return; }
    setBusy(true); setError(''); setMessage(''); setPreview(null);
    try {
      const reservation = await initializeBusinessFile(workspaceId, scope, { purpose: 'TB', originalName: file.name, mediaType,
        sizeBytes: file.size, clientId: engagement.clientId, engagementId: engagement.id, folderId: tbFolderId }, newBusinessIdempotencyKey());
      const staged = await uploadBusinessFile(workspaceId, scope, reservation, file, mediaType, newBusinessIdempotencyKey());
      const committed = await completeBusinessFile(workspaceId, scope, staged, newBusinessIdempotencyKey());
      setSelectedFileId(committed.fileId);
      const nextPreview = await getBusinessTrialBalancePreview(workspaceId, engagement.id, committed.fileId, scope);
      setPreview(nextPreview); setColumns(suggestedColumns(nextPreview));
      setMessage(`${file.name} is committed to TB & Schedules. Review the source columns and start its import.`);
      setRefresh(value => value + 1); onChanged();
      if (input) input.value = '';
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The TB file could not be verified and stored.'); }
    finally { setBusy(false); }
  }

  async function loadPreview(fileId: string, worksheet?: string) {
    setSelectedFileId(fileId); setPreview(null); setError('');
    if (!fileId) return;
    setBusy(true);
    try {
      const next = await getBusinessTrialBalancePreview(workspaceId, engagement.id, fileId, scope, worksheet);
      setPreview(next);
      setColumns(suggestedColumns(next));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The committed TB file could not be previewed.'); }
    finally { setBusy(false); }
  }

  async function startImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || !selectedFileId) return;
    const result = await command('tb.import', { engagementId: engagement.id, fileVersionId: selectedFileId,
      worksheet: preview.selectedWorksheet, columnMap: columns }, 'TB import queued for validation.');
    if (result?.importId) setImportId(result.importId);
  }

  async function activateImport() {
    if (!activeImport) return;
    await command('tb.activate', { engagementId: engagement.id, importId: activeImport.id, contentSha256: activeImport.sourceSha256 },
      'Balanced trial-balance version activated.');
  }

  async function proposeMapping() {
    if (!workspace?.engagement.activeTbVersionId) return;
    await command('tb.mapping.propose', { engagementId: engagement.id, tbVersionId: workspace.engagement.activeTbVersionId }, 'Mapping suggestions are ready for review.');
  }

  async function setMapping(line: NonNullable<typeof mappingDraft>['lines'][number], fsliId: string) {
    if (!mappingDraft) return;
    const reason = mappingReasons[line.tbLineId] ?? line.reason ?? '';
    await command('tb.mapping.set', { draftId: mappingDraft.id, tbLineId: line.tbLineId, expectedVersion: line.version,
      fsliId: fsliId || null, ...(reason.trim().length >= 10 ? { reason } : {}) }, `Account ${line.accountCode} mapping saved.`);
  }

  async function approveMapping() {
    if (!mappingDraft) return;
    await command('tb.mapping.approve', { engagementId: engagement.id, draftId: mappingDraft.id, draftHash: mappingDraft.draftHash }, 'FSLI mapping approved as a versioned record.');
  }

  async function calculateMateriality(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tbVersionId = workspace?.engagement.activeTbVersionId;
    const mappingVersionId = workspace?.engagement.activeMappingVersionId;
    if (!tbVersionId || !mappingVersionId) return;
    try {
      const rateBps = Math.round(Number(benchmarkRate) * 100);
      const tePercent = Number(performanceRate);
      const sadPercent = Number(sadRate);
      if (!Number.isFinite(tePercent) || tePercent < 50 || tePercent > 75) throw new Error('Performance materiality (TE) must be between 50% and 75% of planning materiality.');
      if (!Number.isFinite(sadPercent) || sadPercent < 3 || sadPercent > 5) throw new Error('Summary audit differences (SAD) must be between 3% and 5% of planning materiality.');
      const payload: Record<string, unknown> = { engagementId: engagement.id, tbVersionId, mappingVersionId, benchmark,
        benchmarkRateBps: rateBps, performanceRateBps: Math.round(tePercent * 100), sadRateBps: Math.round(sadPercent * 100), adjustments: [] };
      const hasAnyAdjustment = adjustment.description.trim() || adjustment.amount.trim() || adjustment.evidenceFileId;
      if (hasAnyAdjustment) {
        if (!adjustment.description.trim() || !adjustment.amount.trim() || !adjustment.evidenceFileId) throw new Error('Complete the description, QAR amount and committed evidence file for each PBT normalization item.');
        payload.adjustments = [{ description: adjustment.description.trim(), amountMinor: minorFromQar(adjustment.amount), evidenceFileId: adjustment.evidenceFileId }];
      }
      if (normalizationReason.trim()) payload.normalizationReason = normalizationReason.trim();
      await command('materiality.calculate', payload, 'Materiality calculated from the active mapped trial balance.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Check the materiality inputs.'); }
  }

  async function adjustMateriality(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!materiality) return;
    try {
      await command('materiality.adjust', { materialityVersionId: materiality.id, planningMinor: minorFromQar(roundingValues.planning),
        performanceMinor: minorFromQar(roundingValues.performance), sadMinor: minorFromQar(roundingValues.sad), reason: roundingValues.reason.trim() },
      'A bounded materiality adjustment was saved as a new version.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Check the materiality adjustment.'); }
  }

  async function saveRisk(fsliId: string) {
    if (!materiality) return;
    const draft = riskDrafts[fsliId] ?? { inherentRisk: 'LOW' as const, criticalEstimate: false, rationale: '' };
    if (draft.rationale.trim().length < 10) { setError('Risk rationale must contain at least 10 characters.'); return; }
    await command('fsli.risk.set', { engagementId: engagement.id, materialityVersionId: materiality.id, fsliId,
      inherentRisk: draft.inherentRisk, criticalEstimate: draft.criticalEstimate, rationale: draft.rationale.trim() }, 'Server-calculated FSLI risk band saved.');
  }

  async function compilePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ids = workspace?.engagement;
    if (!ids?.activeTbVersionId || !ids.activeMappingVersionId || !ids.activeMaterialityVersionId) return;
    await command('planning.compile', { engagementId: engagement.id, tbVersionId: ids.activeTbVersionId, mappingVersionId: ids.activeMappingVersionId,
      materialityVersionId: ids.activeMaterialityVersionId, scopeText: scopeText.trim(), strategyText: strategyText.trim() }, 'Planning version compiled against the current source snapshot.');
  }

  async function approvePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace?.planning) return;
    await command('planning.approve', { engagementId: engagement.id, planningVersionId: workspace.planning.id,
      dependencyHash: workspace.planning.sourceHash, rationale: signoffRationale.trim() }, 'Partner planning sign-off recorded; fieldwork handover completed.');
  }

  const columnsCount = preview?.maxColumns ?? 0;
  const previewHeaders = preview?.preview[Math.max(0, columns.headerRow - (preview?.previewStartsAtRow ?? 1))] ?? [];
  const fsliBalances = useMemo(() => {
    const totals = new Map<string, number>();
    for (const line of workspace?.tbLines ?? []) {
      const fsliId = line.fsliId ?? line.draftFsliId;
      if (fsliId) totals.set(fsliId, (totals.get(fsliId) ?? 0) + line.currentMinor);
    }
    return totals;
  }, [workspace?.tbLines]);

  function renderColumn(label: string, key: 'accountCodeColumn' | 'accountNameColumn' | 'balanceColumn' | 'debitColumn' | 'creditColumn' | 'priorBalanceColumn' | 'currencyColumn', optional = false) {
    const value = columns[key];
    return <label className="business-field" key={key}><span>{label}</span><select value={value ?? ''} required={!optional}
      onChange={event => setColumns(current => ({ ...current, [key]: event.target.value === '' ? undefined : Number(event.target.value) }))}>
      {optional && <option value="">Not provided</option>}{Array.from({ length: columnsCount }, (_, index) => <option key={index} value={index}>
        {columnLetter(index)}{previewHeaders[index] ? ` · ${previewHeaders[index]}` : ''}</option>)}
    </select></label>;
  }

  return <section className="business-tb-panel" aria-labelledby="business-tb-heading">
    <div className="business-section-heading"><div><p className="business-eyebrow">TRIAL BALANCE · GOVERNANCE · FIELDWORK</p>
      <h2 id="business-tb-heading">Trial balance, materiality and planning handover</h2>
      <p className="business-muted">{engagement.clientName} · {engagement.code} · {engagement.lifecycleState.replaceAll('_', ' ')}</p></div>
      <button type="button" className="btn sm" disabled={loading || busy} onClick={() => setRefresh(value => value + 1)}>Refresh planning data</button></div>
    {error && <p className="business-alert" role="alert">{error}</p>}
    {message && <p className="business-success-note" role="status">{message}</p>}
    {loading ? <p role="status">Loading trial-balance and planning records…</p> : !workspace ? <p className="business-muted">No planning records are available in this engagement context.</p> : <>
      <section className="business-tb-step" aria-labelledby="business-tb-import-heading">
        <div className="business-tb-step-heading"><div><span className="business-tb-step-number">1</span><h3 id="business-tb-import-heading">Import and reconcile a trial balance</h3></div>
          {workspace.tbVersion && <span className="business-tb-state">Active TB v{workspace.tbVersion.revision}</span>}</div>
        {canWrite && canPlan && <form className="business-form" onSubmit={uploadTb}>
          <label className="business-field"><span>Upload an Excel or CSV trial balance</span><input name="tb-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
            <small>Files are verified and stored as immutable versions in this engagement’s TB &amp; Schedules folder. Static values only; macros and formulas are rejected.</small></label>
          <button className="btn primary" type="submit" disabled={busy || !tbFolderId}>{busy ? 'Verifying and storing…' : 'Store trial-balance source'}</button>
        </form>}
        {canWrite && workspace.imports.length > 0 && <label className="business-field business-tb-existing-source"><span>Or preview an earlier TB source</span>
          <select value={selectedFileId} onChange={event => void loadPreview(event.target.value)}><option value="">Select a committed import source</option>
            {workspace.imports.map(item => <option key={item.fileVersionId} value={item.fileVersionId}>{item.fileName} · {item.status}</option>)}</select></label>}
        {preview && <form className="business-form business-tb-mapping-form" onSubmit={startImport}>
          <div className="business-form-grid"><div className="business-field"><span>Source file</span><strong>{preview.file.name} · SHA-256 {preview.file.sha256.slice(0, 14)}…</strong></div>
            <label className="business-field"><span>Worksheet</span><select value={preview.selectedWorksheet} onChange={event => void loadPreview(selectedFileId, event.target.value)}>
              {preview.worksheetNames.map(name => <option key={name}>{name}</option>)}</select></label>
            <label className="business-field"><span>Header row</span><input type="number" min="1" max="10000" value={columns.headerRow}
              onChange={event => setColumns(current => ({ ...current, headerRow: Number(event.target.value) }))} /></label>
            <label className="business-field"><span>Balance format</span><select value={columns.balanceColumn === undefined ? 'split' : 'signed'} onChange={event => setColumns(current => event.target.value === 'signed'
              ? { ...current, balanceColumn: current.balanceColumn ?? Math.min(2, columnsCount - 1), debitColumn: undefined, creditColumn: undefined }
              : { ...current, balanceColumn: undefined, debitColumn: current.debitColumn ?? 2, creditColumn: current.creditColumn ?? Math.min(3, columnsCount - 1) })}>
              <option value="signed">Signed balance</option><option value="split">Separate debit and credit columns</option></select></label>
          </div>
          <div className="business-form-grid">{renderColumn('Account code', 'accountCodeColumn')}{renderColumn('Account name', 'accountNameColumn')}
            {columns.balanceColumn !== undefined ? renderColumn('Signed current balance', 'balanceColumn') : <>
              {renderColumn('Current debit', 'debitColumn')}{renderColumn('Current credit', 'creditColumn')}</>}
            {renderColumn('Prior-year signed balance', 'priorBalanceColumn', true)}
            {renderColumn('Currency (QAR only)', 'currencyColumn', true)}</div>
          <div className="business-tb-preview-wrap"><table className="business-tb-preview"><caption>First worksheet rows · formula cells are identified for rejection</caption>
            <tbody>{preview.preview.slice(0, 6).map((row, index) => <tr key={index}><th scope="row">{preview.previewStartsAtRow + index}</th>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell || '—'}</td>)}</tr>)}</tbody></table></div>
          <button className="btn primary" type="submit" disabled={busy || !canPlan}>{busy ? 'Queueing import…' : 'Validate and reconcile source'}</button>
        </form>}
        {(activeImport || latestImport) && <div className="business-tb-import-result" aria-live="polite">
          <h4>Import validation · {(activeImport?.status ?? latestImport?.status)?.replaceAll('_', ' ')}</h4>
          <p>Rows: {activeImport?.rowCount ?? latestImport?.rowCount ?? 0} · Errors: {activeImport?.errorCount ?? latestImport?.errorCount ?? 0}
            {' · '}Debits QAR {qarFromMinor(activeImport?.currentDebitsMinor ?? latestImport?.currentDebitsMinor)}
            {' · '}Credits QAR {qarFromMinor(activeImport?.currentCreditsMinor ?? latestImport?.currentCreditsMinor)}</p>
          {(activeImport?.errors ?? latestImport?.errors ?? []).slice(0, 8).map((item, index) => <p className="business-alert" key={`${item.row}-${index}`}>Row {item.row}: {item.message}</p>)}
          {activeImport?.status === 'READY' && canReview && canPlan && <button type="button" className="btn primary" disabled={busy || activeImport.errorCount > 0
            || activeImport.currentDebitsMinor !== activeImport.currentCreditsMinor} onClick={() => void activateImport()}>
            {busy ? 'Activating…' : 'Activate balanced TB version'}</button>}
          {activeImport?.status === 'ACTIVATED' && <p className="business-success-note">This import has been activated as an immutable trial-balance version.</p>}
        </div>}
        {workspace.tbVersion && <div className="business-tb-reconciliation"><strong>Active version {workspace.tbVersion.revision}</strong>
          <span>{workspace.tbVersion.rowCount} rows</span><span>Debits QAR {qarFromMinor(workspace.tbVersion.currentDebitsMinor)}</span>
          <span>Credits QAR {qarFromMinor(workspace.tbVersion.currentCreditsMinor)}</span><span>SHA-256 {workspace.tbVersion.contentSha256.slice(0, 16)}…</span></div>}
      </section>

      {workspace.tbVersion && <section className="business-tb-step" aria-labelledby="business-fsli-heading">
        <div className="business-tb-step-heading"><div><span className="business-tb-step-number">2</span><h3 id="business-fsli-heading">Review financial statement mappings</h3></div>
          {workspace.engagement.activeMappingVersionId && <span className="business-tb-state">Approved mapping active</span>}</div>
        {!mappingDraft && !workspace.engagement.activeMappingVersionId && canWrite && canPlan && <button type="button" className="btn" disabled={busy || !canReview}
          onClick={() => void proposeMapping()}>Suggest mappings from scoped history</button>}
        {mappingDraft && <>
          <p className="business-note">Historical matches are suggestions scoped to this client and reporting framework. Confirm each row and add a reason when changing an approved prior mapping.</p>
          <div className="business-tb-table-wrap"><table className="business-tb-data-table"><caption>Trial-balance account mapping draft</caption>
            <thead><tr><th scope="col">Account</th><th scope="col">Current / prior balance</th><th scope="col">Suggested FSLI</th><th scope="col">Change reason</th><th scope="col">Confirmed</th></tr></thead>
            <tbody>{mappingDraft.lines.map(line => <tr key={line.tbLineId}><th scope="row"><strong>{line.accountCode}</strong><small>{line.accountName}</small></th>
              <td>Current QAR {qarFromMinor(line.balanceMinor)}<small>{line.priorBalanceMinor === null ? 'Prior period not supplied' : `Prior QAR ${qarFromMinor(line.priorBalanceMinor)}`}</small></td>
              <td><label className="business-sr-only" htmlFor={`mapping-${line.tbLineId}`}>Financial statement line for {line.accountCode} {line.accountName}</label>
                <select id={`mapping-${line.tbLineId}`} disabled={busy || !canWrite || !canPlan} value={line.fsliId ?? ''} onChange={event => void setMapping(line, event.target.value)}>
                  <option value="">Unmapped</option>{workspace.fsliCatalog.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
                <small>{line.origin === 'EXACT_HISTORY' ? 'Historical suggestion · confirm or change' : line.confirmed ? 'Manual selection' : 'Needs mapping confirmation'}</small></td>
              <td><label className="business-sr-only" htmlFor={`mapping-reason-${line.tbLineId}`}>Reason if changing prior mapping for {line.accountCode}</label>
                <input id={`mapping-reason-${line.tbLineId}`} maxLength={2000} value={mappingReasons[line.tbLineId] ?? line.reason ?? ''}
                  disabled={busy || !canWrite || !canPlan} placeholder="Required when changing history" onChange={event => setMappingReasons(current => ({ ...current, [line.tbLineId]: event.target.value }))} /></td>
              <td>{line.confirmed ? 'Confirmed' : 'Pending'}</td></tr>)}</tbody></table></div>
          <p className="business-tb-hash">Draft source hash · {mappingDraft.draftHash}</p>
          <button type="button" className="btn primary" disabled={busy || !canReview || !canPlan || mappingDraft.lines.some(line => !line.confirmed
            && (Number(line.balanceMinor) !== 0 || Number(line.priorBalanceMinor ?? 0) !== 0))}
            onClick={() => void approveMapping()}>{busy ? 'Approving…' : 'Approve confirmed mapping version'}</button>
        </>}
        {workspace.engagement.activeMappingVersionId && !mappingDraft && <div className="business-tb-reconciliation"><strong>FSLI mapping is approved</strong>
          <span>{workspace.tbLines.length} trial-balance rows</span><span>{new Set(workspace.tbLines.map(line => line.fsliId).filter(Boolean)).size} mapped statement lines</span></div>}
      </section>}

      {workspace.engagement.activeMappingVersionId && <section className="business-tb-step" aria-labelledby="business-materiality-heading">
        <div className="business-tb-step-heading"><div><span className="business-tb-step-number">3</span><h3 id="business-materiality-heading">Calculate materiality and assess FSLI risk</h3></div>
          {materiality && <span className="business-tb-state">Materiality v{materiality.revision}</span>}</div>
        {canReview && canPlan && <form className="business-form" onSubmit={calculateMateriality}>
          <div className="business-form-grid"><label className="business-field"><span>Benchmark</span><select value={benchmark} onChange={event => {
            const next = event.target.value as Benchmark; setBenchmark(next); setBenchmarkRate(defaultBenchmarkRate(next));
            if (next !== 'PBT') { setAdjustment({ description: '', amount: '', evidenceFileId: '' }); setNormalizationReason(''); } }}>
              <option value="PBT">Profit before tax</option><option value="REVENUE">Revenue</option><option value="TOTAL_ASSETS">Total assets</option><option value="EQUITY">Equity</option></select></label>
            <label className="business-field"><span>Benchmark rate (%)</span><input type="number" min={benchmark === 'PBT' ? '5' : benchmark === 'REVENUE' ? '0.5' : benchmark === 'TOTAL_ASSETS' ? '0.5' : '1'}
              max={benchmark === 'PBT' ? '10' : benchmark === 'TOTAL_ASSETS' ? '1' : '2'} step="0.01" required value={benchmarkRate} onChange={event => setBenchmarkRate(event.target.value)} />
              <small>Firm policy range is applied by the Worker.</small></label>
            <label className="business-field"><span>Performance materiality (TE) % of PM</span><input type="number" min="50" max="75" step="0.01" required value={performanceRate} onChange={event => setPerformanceRate(event.target.value)} /><small>Permitted 50–75% of planning materiality.</small></label>
            <label className="business-field"><span>Summary audit difference (SAD) % of PM</span><input type="number" min="3" max="5" step="0.01" required value={sadRate} onChange={event => setSadRate(event.target.value)} /><small>Permitted 3–5% of planning materiality.</small></label>
          </div>
          {benchmark === 'PBT' && <fieldset className="business-tb-fieldset"><legend>Optional evidenced PBT normalization</legend>
            <p className="business-note">Loss or zero PBT cannot be treated as positive profit. Any normalization requires a committed evidence file from this engagement.</p>
            <div className="business-form-grid"><label className="business-field"><span>Adjustment description</span><input maxLength={1000} value={adjustment.description} onChange={event => setAdjustment(current => ({ ...current, description: event.target.value }))} /></label>
              <label className="business-field"><span>Adjustment amount · QAR</span><input inputMode="decimal" value={adjustment.amount} onChange={event => setAdjustment(current => ({ ...current, amount: event.target.value }))} /></label>
              <label className="business-field"><span>Committed support file</span><select value={adjustment.evidenceFileId} onChange={event => setAdjustment(current => ({ ...current, evidenceFileId: event.target.value }))}>
                <option value="">Select evidence</option>{files.filter(file => ['EVIDENCE','PBC'].includes(file.purpose) && file.state === 'COMMITTED' && file.engagementId === engagement.id).map(file =>
                  <option key={file.id} value={file.id}>{file.originalName}</option>)}</select></label>
              <label className="business-field"><span>Normalization rationale</span><input minLength={10} maxLength={2000} value={normalizationReason} onChange={event => setNormalizationReason(event.target.value)} /></label></div>
          </fieldset>}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Calculating…' : materiality ? 'Recalculate from current TB and mapping' : 'Calculate materiality'}</button>
        </form>}
        {materiality && <>
          <div className="business-tb-threshold-grid"><div><span>Benchmark</span><strong>{materiality.benchmark.replaceAll('_', ' ')} · QAR {qarFromMinor(materiality.benchmarkMinor)}</strong></div>
            <div><span>Planning materiality (PM)</span><strong>QAR {qarFromMinor(materiality.planningMinor)}</strong><small>Raw {materiality.pmRawNumerator}/{materiality.pmRawDenominator} minor units</small></div>
            <div><span>Performance materiality (TE)</span><strong>QAR {qarFromMinor(materiality.performanceMinor)}</strong><small>Raw {materiality.teRawNumerator}/{materiality.teRawDenominator} minor units</small></div>
            <div><span>Clearly trivial (SAD)</span><strong>QAR {qarFromMinor(materiality.sadMinor)}</strong><small>Raw {materiality.sadRawNumerator}/{materiality.sadRawDenominator} minor units</small></div></div>
          {canReview && canPlan && <form className="business-form business-tb-rounding" onSubmit={adjustMateriality}><h4>Bounded rounding adjustment</h4>
            <p className="business-note">Each adjusted threshold is checked against ±5% of its own raw value; TE/PM and SAD/PM ratios are also enforced.</p>
            <div className="business-form-grid"><label className="business-field"><span>PM · QAR</span><input inputMode="decimal" required value={roundingValues.planning} onChange={event => setRoundingValues(current => ({ ...current, planning: event.target.value }))} /></label>
              <label className="business-field"><span>TE · QAR</span><input inputMode="decimal" required value={roundingValues.performance} onChange={event => setRoundingValues(current => ({ ...current, performance: event.target.value }))} /></label>
              <label className="business-field"><span>SAD · QAR</span><input inputMode="decimal" required value={roundingValues.sad} onChange={event => setRoundingValues(current => ({ ...current, sad: event.target.value }))} /></label>
              <label className="business-field"><span>Reviewer rationale</span><input minLength={10} maxLength={2000} required value={roundingValues.reason} onChange={event => setRoundingValues(current => ({ ...current, reason: event.target.value }))} /></label></div>
            <button className="btn" type="submit" disabled={busy}>Save adjusted thresholds as new version</button></form>}
          <h4>Risk by mapped financial statement line</h4>
          <div className="business-tb-table-wrap"><table className="business-tb-data-table"><caption>Server-calculated FSLI risk classification</caption>
            <thead><tr><th scope="col">FSLI</th><th scope="col">Balance</th><th scope="col">Inherent risk</th><th scope="col">Critical estimate</th><th scope="col">Band</th><th scope="col">Rationale and action</th></tr></thead>
            <tbody>{workspace.fsliCatalog.filter(item => fsliBalances.has(item.id)).map(item => {
              const existing = materiality.risks.find(risk => risk.fsliId === item.id);
              const draft = riskDrafts[item.id] ?? { inherentRisk: existing?.inherentRisk ?? 'LOW', criticalEstimate: Boolean(existing?.criticalEstimate), rationale: existing?.rationale ?? '' };
              return <tr key={item.id}><th scope="row">{item.code}<small>{item.name}</small></th><td>QAR {qarFromMinor(fsliBalances.get(item.id))}</td>
                <td><label className="business-sr-only" htmlFor={`risk-${item.id}`}>Inherent risk for {item.name}</label><select id={`risk-${item.id}`} disabled={busy || !canReview || !canPlan}
                  value={draft.inherentRisk} onChange={event => setRiskDrafts(current => ({ ...current, [item.id]: { ...draft, inherentRisk: event.target.value as RiskDraft['inherentRisk'] } }))}>
                  <option value="LOW">Low</option><option value="MODERATE">Moderate</option><option value="HIGH">High</option></select></td>
                <td><label className="business-tb-checkbox"><input type="checkbox" disabled={busy || !canReview || !canPlan} checked={draft.criticalEstimate}
                  onChange={event => setRiskDrafts(current => ({ ...current, [item.id]: { ...draft, criticalEstimate: event.target.checked } }))} /> Yes</label></td>
                <td><span className={`business-tb-band band-${existing?.band?.toLowerCase() ?? 'pending'}`}>{existing?.band ?? 'Not assessed'}</span></td>
                <td><label className="business-sr-only" htmlFor={`risk-reason-${item.id}`}>Risk rationale for {item.name}</label><input id={`risk-reason-${item.id}`} minLength={10} maxLength={2000} disabled={busy || !canReview || !canPlan}
                  value={draft.rationale} onChange={event => setRiskDrafts(current => ({ ...current, [item.id]: { ...draft, rationale: event.target.value } }))} />
                  {canReview && canPlan && <button type="button" className="btn sm" disabled={busy} onClick={() => void saveRisk(item.id)}>{existing ? 'Save risk revision' : 'Save risk assessment'}</button>}</td></tr>;
            })}</tbody></table></div>
        </>}
      </section>}

      {workspace.engagement.activeMaterialityVersionId && <section className="business-tb-step" aria-labelledby="business-planning-approval-heading">
        <div className="business-tb-step-heading"><div><span className="business-tb-step-number">4</span><h3 id="business-planning-approval-heading">Compile and approve the planning handover</h3></div>
          {workspace.readiness.ready ? <span className="business-tb-state is-ready">Ready for approval</span> : <span className="business-tb-state">{workspace.readiness.blockers.length} blockers</span>}</div>
        {workspace.readiness.blockers.length > 0 ? <ul className="business-tb-blockers">{workspace.readiness.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}><strong>{blocker.code.replaceAll('_', ' ')}</strong><span>{blocker.description}</span><small>Resolve in {blocker.route}</small></li>)}</ul>
          : <p className="business-success-note">TB, mapping, materiality, risk, staffing, cutoff and required PBC dependencies are current.</p>}
        {canReview && canPlan && <form className="business-form" onSubmit={compilePlan}><div className="business-form-grid">
          <label className="business-field"><span>Audit scope</span><textarea rows={3} minLength={10} maxLength={10000} required value={scopeText} onChange={event => setScopeText(event.target.value)} /></label>
          <label className="business-field"><span>Audit strategy</span><textarea rows={3} minLength={10} maxLength={10000} required value={strategyText} onChange={event => setStrategyText(event.target.value)} /></label>
        </div><button className="btn primary" type="submit" disabled={busy || !workspace.readiness.ready}>{busy ? 'Compiling…' : 'Compile version-pinned plan'}</button></form>}
        {workspace.planning && <div className="business-tb-plan-summary"><h4>Planning version {workspace.planning.revision}</h4>
          <p>{workspace.planning.scopeText}</p><p>{workspace.planning.strategyText}</p><small>Source hash · {workspace.planning.sourceHash} · Compiled {workspace.planning.preparedAt}</small>
          {workspace.planning.staleEventCount > 0 && <p className="business-alert" role="alert">This plan has {workspace.planning.staleEventCount} stale-source event(s) and cannot be approved.</p>}
          {workspace.planning.signoffId ? <p className="business-success-note">Partner sign-off recorded {workspace.planning.approvedAt}. {workspace.planning.signoffRationale}</p>
            : isPartner && canPlan && workspace.readiness.ready && <form className="business-form business-tb-signoff" onSubmit={approvePlan}>
              <label className="business-field"><span>Partner sign-off rationale</span><textarea minLength={10} maxLength={10000} required rows={3} value={signoffRationale} onChange={event => setSignoffRationale(event.target.value)} /></label>
              <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Signing off…' : 'Approve plan and start fieldwork'}</button>
            </form>}
        </div>}
      </section>}
    </>}
  </section>;
}
