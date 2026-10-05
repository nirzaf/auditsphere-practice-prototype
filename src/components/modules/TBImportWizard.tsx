// Trial-balance intake wizard — VP-035
// Bounded CSV + genuine XLSX parsing (workbook format, not renamed CSV).
// Header mapping, signed-net vs debit/credit convention, preview, row-level
// validation, commit as a new source revision. Source bytes stay in-session only;
// only parsed rows persist as bounded demo records. Macros/formulas never execute.

import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { TrialBalanceRow } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { captureSourceOriginal } from '../../services/artifactStore';

export const TB_ROW_LIMIT = 2000;
export const TB_FILE_BYTES_LIMIT = 2 * 1024 * 1024;

interface TBImportWizardProps {
  engagementId: string;
  onCommitted: () => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

type Convention = 'signed-net' | 'debit-credit';

const isZipOfficeWorkbook = (bytes: ArrayBuffer) => {
  if (bytes.byteLength < 4) return false;
  const signature = new Uint8Array(bytes, 0, 4);
  return signature[0] === 0x50 && signature[1] === 0x4b && signature[2] === 0x03 && signature[3] === 0x04;
};

export function parseTBWorkbook(
  fileName: string,
  bytes: ArrayBuffer,
  mapping: { code: number; name: number; debit: number; credit: number; signed: number; dimension?: { id: string; index: number } },
  convention: Convention,
  dimension?: { id: string; name: string; values: string[] }
): { rows: TrialBalanceRow[]; errors: string[]; format: 'XLSX' | 'CSV' } {
  const errors: string[] = [];
  const rows: TrialBalanceRow[] = [];
  const lower = fileName.toLowerCase();
  const isXlsx = lower.endsWith('.xlsx') || lower.endsWith('.xlsm') || lower.endsWith('.xls');
  const isCsv = lower.endsWith('.csv');

  let grid: unknown[][] = [];
  if (isXlsx) {
    // Genuine workbook parse — a CSV renamed to .xlsx fails here and is rejected.
    if ((lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) && !isZipOfficeWorkbook(bytes)) {
      return { rows, errors: ['CSV or text renamed to .xlsx is rejected.'], format: 'XLSX' };
    }
    const wb = XLSX.read(bytes, { type: 'array', sheetStubs: false });
    if (!wb.SheetNames.length) {
      return { rows, errors: ['Workbook contains no worksheets.'], format: 'XLSX' };
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });
  } else if (isCsv) {
    const text = new TextDecoder().decode(bytes);
    grid = text.split(/\r?\n/).filter(l => l.trim().length > 0).map(line =>
      line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    );
  } else {
    return { rows, errors: [`Unsupported extension for "${fileName}". Use .csv or genuine .xlsx.`], format: 'CSV' };
  }

  if (grid.length < 2) {
    errors.push('No data rows found (header + at least one row required).');
    return { rows, errors, format: isXlsx ? 'XLSX' : 'CSV' };
  }
  if (grid.length - 1 > TB_ROW_LIMIT) {
    errors.push(`Row limit exceeded: ${grid.length - 1} data rows (limit ${TB_ROW_LIMIT}). Nothing was committed.`);
    return { rows, errors, format: isXlsx ? 'XLSX' : 'CSV' };
  }
  const headers = grid[0].map(value => String(value ?? '').trim());
  const requiredColumns = convention === 'signed-net' ? [mapping.code, mapping.name, mapping.signed] : [mapping.code, mapping.name, mapping.debit, mapping.credit];
  if (new Set(requiredColumns).size !== requiredColumns.length || requiredColumns.some(index => !headers[index])) {
    return { rows, errors: ['Missing required headers or ambiguous column mapping. Map account code, account name, and the selected amount columns to distinct named headers.'], format: isXlsx ? 'XLSX' : 'CSV' };
  }
  if (mapping.dimension && (!headers[mapping.dimension.index] || requiredColumns.includes(mapping.dimension.index))) {
    return { rows, errors: ['The optional dimension must map to a distinct named header.'], format: isXlsx ? 'XLSX' : 'CSV' };
  }

  const dataRows = grid.slice(1);
  const seenCodes = new Set<string>();
  dataRows.forEach((cells, i) => {
    const lineNo = i + 2;
    const code = String(cells[mapping.code] ?? '').trim();
    const name = String(cells[mapping.name] ?? '').trim();
    if (!code && !name) return; // skip blank lines
    if (!code) { errors.push(`Row ${lineNo}: missing account code.`); return; }
    if (!name) { errors.push(`Row ${lineNo}: missing account name.`); return; }
    if (seenCodes.has(code)) { errors.push(`Row ${lineNo}: duplicate account code "${code}".`); return; }
    seenCodes.add(code);

    const dimensionValue = mapping.dimension ? String(cells[mapping.dimension.index] ?? '').trim() : '';
    if (mapping.dimension && (!dimension || dimension.id !== mapping.dimension.id || !dimension.values.includes(dimensionValue))) {
      errors.push(`Row ${lineNo} (${code}): unknown or missing ${dimension?.name || 'dimension'} value "${dimensionValue}".`);
      return;
    }

    const num = (v: unknown): number | null => {
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const s = String(v ?? '').trim().replace(/,/g, '');
      if (s === '') return null;
      if (/^=/.test(s)) return null; // formula cell: rejected, never executed
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    let balance = 0;
    if (convention === 'signed-net') {
      const v = num(cells[mapping.signed]);
      if (v === null) { errors.push(`Row ${lineNo} (${code}): signed amount is missing/not numeric; formula cells are rejected.`); return; }
      balance = v;
    } else {
      const d = num(cells[mapping.debit]);
      const c = num(cells[mapping.credit]);
      if (d === null && c === null) { errors.push(`Row ${lineNo} (${code}): debit and credit are both missing/not numeric.`); return; }
      balance = (d || 0) - (c || 0);
    }
    const prefix = code.slice(0, 1);
    const type: TrialBalanceRow['type'] =
      prefix === '1' ? 'asset' : prefix === '2' ? 'liability' : prefix === '3' ? 'equity' :
      prefix === '4' ? 'revenue' : prefix === '5' ? 'expense' : 'asset';
    rows.push({ code, name, type, balance, ...(mapping.dimension ? { dimensions: { [mapping.dimension.id]: dimensionValue }, ...(dimension?.name === 'Department' ? { dimensionDept: dimensionValue } : {}) } : {}) });
  });

  const net = rows.reduce((s, r) => s + r.balance, 0);
  if (rows.length > 0 && Math.abs(net) > 0.005) {
    errors.push(`Unbalanced preview: signed total is ${net.toFixed(2)} (must net to 0). Nothing was committed.`);
  }
  return { rows, errors, format: isXlsx ? 'XLSX' : 'CSV' };
}

export const TBImportWizard: React.FC<TBImportWizardProps> = ({ engagementId, onCommitted, onRegisterUnsavedForm }) => {
  const [fileName, setFileName] = useState('');
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ code: number; name: number; debit: number; credit: number; signed: number; dimension?: { id: string; index: number } }>({ code: 0, name: 1, debit: 2, credit: 3, signed: 2 });
  const [convention, setConvention] = useState<Convention>('signed-net');
  const [preview, setPreview] = useState<TrialBalanceRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [format, setFormat] = useState<'XLSX' | 'CSV' | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // VP-003: a staged import is deliberate work; navigation cannot silently drop it.
  // There is no safe silent auto-commit for an import, so "save" explicitly refuses
  // and keeps the staging intact — the user stays in context and decides.
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const guard: UnsavedFormGuard = {
      label: 'Trial-balance import',
      isDirty: () => bytes !== null,
      save: () => {
        setFileError('Commit or cancel the staged trial-balance import in the wizard before leaving. Nothing was committed.');
        return false;
      },
      discard: () => {
        setFileName('');
        setBytes(null);
        setHeaders([]);
        setMapping({ code: 0, name: 1, debit: 2, credit: 3, signed: 2 });
        setConvention('signed-net');
        setPreview(null);
        setErrors([]);
        setFormat(null);
        setFileError(null);
      },
    };
    onRegisterUnsavedForm(guard, 'tb-import-wizard');
    return () => onRegisterUnsavedForm(null, 'tb-import-wizard');
  }, [bytes, onRegisterUnsavedForm]);
  const storeSnapshot = prototypeStore.getSnapshot();
  const currentEngagement = storeSnapshot.engagements.find(e => e.id === engagementId);
  const sourceHistory = currentEngagement?.sourceHistory || [];
  const accountingProfile = storeSnapshot.clients.find(c => c.id === currentEngagement?.client)?.accountingProfile;
  const accountingBook = accountingProfile?.periodBooks.find(book => book.id === currentEngagement?.accountingPeriodBookId);
  const activeDimensions = accountingProfile?.dimensions.filter(dimension => dimension.active) || [];

  const handleFile = async (f: File | undefined) => {
    setPreview(null); setErrors([]); setFormat(null); setFileError(null);
    if (!f) return;
    if (f.size > TB_FILE_BYTES_LIMIT) {
      setFileError(`File exceeds the ${(TB_FILE_BYTES_LIMIT / 1024 / 1024).toFixed(0)} MB demo limit. Nothing was committed.`);
      return;
    }
    const buf = await f.arrayBuffer();
    setFileName(f.name);
    setBytes(buf);
    try {
      const lower = f.name.toLowerCase();
      let headerRow: string[] = [];
      if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm') || lower.endsWith('.xls')) {
        if ((lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) && !isZipOfficeWorkbook(buf)) throw new Error('CSV or text renamed to .xlsx is rejected.');
        const wb = XLSX.read(buf, { type: 'array', sheetStubs: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
        headerRow = (grid[0] || []).map(c => String(c));
      } else {
        const text = new TextDecoder().decode(buf.slice(0, 65536));
        const first = text.split(/\r?\n/)[0] || '';
        headerRow = first.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      }
      setHeaders(headerRow);
      // Sensible default mapping by header labels
      const idx = (names: string[]) => {
        const h = headerRow.map(x => x.toLowerCase());
        for (const n of names) {
          const i = h.findIndex(x => x.includes(n));
          if (i >= 0) return i;
        }
        return 0;
      };
      const dimension = activeDimensions.find(item => headerRow.some(header => header.toLowerCase().includes(item.name.toLowerCase())));
      const dimensionIndex = dimension ? headerRow.findIndex(header => header.toLowerCase().includes(dimension.name.toLowerCase())) : -1;
      setMapping({
        code: idx(['code', 'gl', 'account']),
        name: idx(['name', 'description', 'account']) === 0 ? 1 : idx(['name', 'description']),
        debit: idx(['debit']),
        credit: idx(['credit']),
        signed: idx(['balance', 'amount', 'net', 'signed']),
        ...(dimension && dimensionIndex >= 0 ? { dimension: { id: dimension.id, index: dimensionIndex } } : {})
      });
    } catch (e) {
      setFileError(`Could not parse "${f.name}" as its stated format (a CSV renamed to .xlsx is rejected). ${(e as Error).message}`);
    }
  };

  const runPreview = () => {
    if (!bytes) return;
    const selectedDimension = mapping.dimension && activeDimensions.find(item => item.id === mapping.dimension!.id);
    const result = parseTBWorkbook(fileName, bytes, mapping, convention, selectedDimension);
    if (result.errors.length === 0) {
      if (!currentEngagement?.auditLifecycle && (!currentEngagement || !accountingProfile || accountingProfile.reportingBasis === 'Not selected' || !accountingBook || currentEngagement.accountingProfileRevision !== accountingProfile.revision || currentEngagement.accountingChartRevision !== accountingProfile.chartRevision)) {
        result.errors.push('Complete or reload the client accounting setup and select this engagement’s period book before importing.');
      } else if (!currentEngagement?.auditLifecycle && result.rows.some(row => !accountingProfile?.accounts.some(account => account.code === row.code && account.active && account.posting))) {
        result.errors.push('Imported accounts must exist as active posting accounts in the selected chart.');
      }
    }
    setPreview(result.rows);
    setErrors(result.errors);
    setFormat(result.format);
  };

  const commit = async () => {
    if (!preview || errors.length > 0 || preview.length === 0) return;
    if (!bytes || !globalThis.crypto?.subtle) {
      setFileError('This browser cannot calculate the source SHA-256 digest. Nothing was committed.');
      return;
    }
    try {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    const importRows = currentEngagement?.auditLifecycle ? prototypeStore.lifecycle.importMappedTB.bind(prototypeStore.lifecycle) : prototypeStore.updateTrialBalanceRows.bind(prototypeStore);
    const originalArtifact = currentEngagement?.auditLifecycle ? await captureSourceOriginal(fileName, bytes, format === 'XLSX' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv') : undefined;
    importRows(engagementId, preview, {
      fileName,
      format: format || 'CSV',
      sha256,
      originalArtifact,
      mapping: { ...mapping, convention }
    });
    setPreview(null);
    setBytes(null);
    setFileName('');
    onCommitted();
    } catch(error) { setFileError(error instanceof Error ? error.message : String(error)); }
  };

  return (
    <div className="panel panel-pad stack" style={{ gap: 12 }}>
      <div className="between">
        <div>
          <h3>Trial-Balance Intake (CSV / genuine XLSX)</h3>
          <p className="sub">Limits: {TB_ROW_LIMIT.toLocaleString()} rows · {(TB_FILE_BYTES_LIMIT / 1024 / 1024).toFixed(0)} MB · formulas/macros never execute · bytes stay in-session only.</p>
        </div>
        {format && <span className="tag blue">Detected format: {format}</span>}
      </div>
      {currentEngagement?.auditLifecycle ? <p className="caption">Audit source: {currentEngagement.id} · {currentEngagement.year} · {currentEngagement.currency} · mapped source ingestion only</p> : <p className="caption" aria-label="Active accounting context">Import context: {accountingProfile?.legalEntityName || 'Setup required'} · {accountingProfile?.reportingBasis || 'No basis'} · {accountingProfile?.baseCurrency || currentEngagement?.currency || 'No currency'} · {accountingBook ? `${accountingBook.name} / ${accountingBook.bookName}` : 'No period book'} · Profile Rev {currentEngagement?.accountingProfileRevision || 0} / Chart Rev {currentEngagement?.accountingChartRevision || 0}</p>}


      <details>
        <summary className="caption">Trial-balance source history ({sourceHistory.length} revisions)</summary>
        <div className="tablewrap mt8"><table>
          <thead><tr><th>Revision</th><th>Source</th><th>Imported by / at</th><th>Rows / signed total</th><th>SHA-256</th></tr></thead>
          <tbody>{[...sourceHistory].sort((a, b) => b.version - a.version).map(item => (
            <tr key={item.version}>
              <td>v{item.version}</td>
              <td>{item.fileName || 'Legacy source'} · {item.format || 'Legacy'}</td>
              <td>{item.importedBy} · {item.importedAt}</td>
              <td>{item.rows.length} · {item.rows.reduce((sum, row) => sum + row.balance, 0).toFixed(2)}</td>
              <td className="mono">{item.sha256 || 'Unavailable for legacy source'}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="caption mt4">Parsed rows and source digests are retained as local history; original uploaded file bytes remain session-only.</p>
      </details>

      <div className="grid2">
        <div>
          <label className="caption">Source file (synthetic fixture or your CSV/XLSX)</label>
          <input
            type="file"
            aria-label="Trial balance source file"
            accept=".csv,.xlsx,.xls,.xlsm"
            className="input"
            onChange={e => handleFile(e.target.files?.[0])}
          />
          {fileError && <div className="cell-sub" style={{ color: '#b91c1c', marginTop: 6 }}>{fileError}</div>}
          {fileName && <div className="cell-sub mt4">Selected: <span className="mono">{fileName}</span> (bytes held in-session only; reload requires reselection).</div>}
        </div>
        <div>
          <label className="caption">Amount convention</label>
          <select className="input" aria-label="Trial balance amount convention" value={convention} onChange={e => setConvention(e.target.value as Convention)}>
            <option value="signed-net">Signed net amount (one column)</option>
            <option value="debit-credit">Debit / credit columns</option>
          </select>
        </div>
      </div>

      {headers.length > 0 && (
        <div className="grid3">
          <div>
            <label className="caption">Code column</label>
            <select className="input" value={mapping.code} onChange={e => setMapping({ ...mapping, code: Number(e.target.value) })}>
              {headers.map((h, i) => <option key={i} value={i}>{i}: {h || '(blank)'}</option>)}
            </select>
          </div>
          {activeDimensions.length > 0 && <div>
            <label className="caption">Optional dimension column</label>
            <select className="input" value={mapping.dimension ? `${mapping.dimension.id}:${mapping.dimension.index}` : ''} onChange={e => {
              const [id, index] = e.target.value.split(':');
              setMapping({ ...mapping, dimension: id ? { id, index: Number(index) } : undefined });
            }}>
              <option value="">None</option>
              {activeDimensions.flatMap(dimension => headers.map((header, index) => <option key={`${dimension.id}:${index}`} value={`${dimension.id}:${index}`}>{dimension.name} · {index}: {header || '(blank)'}</option>))}
            </select>
          </div>}
          <div>
            <label className="caption">Name column</label>
            <select className="input" value={mapping.name} onChange={e => setMapping({ ...mapping, name: Number(e.target.value) })}>
              {headers.map((h, i) => <option key={i} value={i}>{i}: {h || '(blank)'}</option>)}
            </select>
          </div>
          {convention === 'signed-net' ? (
            <div>
              <label className="caption">Signed amount column</label>
              <select className="input" value={mapping.signed} onChange={e => setMapping({ ...mapping, signed: Number(e.target.value) })}>
                {headers.map((h, i) => <option key={i} value={i}>{i}: {h || '(blank)'}</option>)}
              </select>
            </div>
          ) : (
            <div className="grid2">
              <div>
                <label className="caption">Debit column</label>
                <select className="input" value={mapping.debit} onChange={e => setMapping({ ...mapping, debit: Number(e.target.value) })}>
                  {headers.map((h, i) => <option key={i} value={i}>{i}: {h || '(blank)'}</option>)}
                </select>
              </div>
              <div>
                <label className="caption">Credit column</label>
                <select className="input" value={mapping.credit} onChange={e => setMapping({ ...mapping, credit: Number(e.target.value) })}>
                  {headers.map((h, i) => <option key={i} value={i}>{i}: {h || '(blank)'}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sm" disabled={!bytes} onClick={runPreview}>Preview &amp; validate</button>
        <button type="button" className="btn sm primary" disabled={!preview || preview.length === 0 || errors.length > 0} onClick={commit}>
          Commit as new source revision
        </button>
      </div>

      {errors.length > 0 && (
        <div className="borderbox" style={{ background: '#fef2f2', padding: 12 }}>
          <b>Validation errors — nothing was committed; previous accepted source is untouched:</b>
          {errors.map((e, i) => <div key={i} className="cell-sub" style={{ color: '#b91c1c' }}>· {e}</div>)}
        </div>
      )}
      {preview && errors.length === 0 && (
        <div className="borderbox" style={{ background: '#f0fdf4', padding: 12 }}>
          <b>Preview ready:</b> {preview.length} rows, net {preview.reduce((s, r) => s + r.balance, 0).toFixed(2)}. Committing preserves the prior source and stales dependent reviews/packages.
        </div>
      )}
    </div>
  );
};
