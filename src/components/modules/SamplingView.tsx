// Module 31: Substantive Sampling & Population Testing (VP-051)
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';
import { hasAnyRole, visibleEngagementIds } from '../../services/guards';
import { parsePopulation, POPULATION_FILE_LIMIT } from '../../services/populationImport';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { ListState } from '../common/Enterprise';

interface SamplingViewProps {
  onNavigate: (route: RouteKey) => void;
  onBeforeContextChange: (run: () => void) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const SamplingView: React.FC<SamplingViewProps> = ({ onNavigate, onBeforeContextChange, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const visible = visibleEngagementIds(state);
  const populations = state.samplePopulations.filter(item => item.engagementId &&
    (visible === 'ALL' || visible.includes(item.engagementId)));
  const [populationId, setPopulationId] = useState(populations[0]?.id || '');
  const population = populations.find(item => item.id === populationId) || populations[0];
  const [revision, refresh] = useState(0);
  const [notice, setNotice] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const draftEdited = useRef(false);
  const persistedDraft = useRef<Record<string, { rationale: string; auditedAmount: string; notes: string; limitation: string; findingId: string }>>({});
  void revision;
  const frameEngagement = population && state.engagements.find(item => item.id === population.engagementId);
  const frameRow = frameEngagement?.rows.find(row => row.code === population?.accountCode);
  const frameValue = frameRow?.balance;
  const frameDiff = frameValue === undefined || !population ? undefined : Math.abs(frameValue - population.totalPopulationValue);
  const frameReconciled = Boolean(population?.sourceComplete && frameEngagement && frameRow && population.period === frameEngagement.year && population.currency === frameEngagement.currency && population.items.every(item => (!item.period || item.period === population.period) && (!item.currency || item.currency === population.currency)) && frameDiff !== undefined && frameDiff < 0.01);
  const run = (action: () => void) => {
    try { action(); draftEdited.current = false; refresh(value => value + 1); setNotice('Saved.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save sampling changes.'); }
  };
  const snapshotPersistedDraft = () => {
    const latest = prototypeStore.getSnapshot().samplePopulations.find(item => item.id === population?.id);
    persistedDraft.current = Object.fromEntries((latest?.items || []).map(item => [item.id, {
      rationale: item.selectionRationale || '',
      auditedAmount: String(item.auditedAmount ?? item.recordedAmount ?? item.amount),
      notes: item.notes || '',
      limitation: item.limitation || '',
      findingId: item.findingId || '',
    }]));
  };
  const readDraft = () => JSON.stringify(Array.from(editorRef.current?.querySelectorAll<HTMLElement>('[data-sample-draft]') || []).map(field => [
    field.closest('[data-sample-item]')?.getAttribute('data-sample-item') || 'evaluation',
    field.getAttribute('data-sample-draft'),
    (field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value,
  ]));
  const draftBaseline = useRef('');
  const discardDraft = () => {
    editorRef.current?.querySelectorAll<HTMLElement>('[data-sample-draft]').forEach(field => {
      const itemId = field.closest('[data-sample-item]')?.getAttribute('data-sample-item');
      const item = itemId ? persistedDraft.current[itemId] : undefined;
      const key = field.getAttribute('data-sample-draft');
      const value = item ? item[key as keyof typeof item] : '';
      (field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = value;
    });
    draftBaseline.current = readDraft();
    draftEdited.current = false;
    setNotice('Unsaved sampling edits discarded; recorded sample results and reviews are unchanged.');
  };
  useLayoutEffect(() => {
    snapshotPersistedDraft();
    // Capture controlled-by-the-DOM editors after each committed store revision.
    draftBaseline.current = readDraft();
    draftEdited.current = false;
  }, [population?.id, revision, onRegisterUnsavedForm]);
  useEffect(() => {
    if (!population) return;
    const key = `sampling-draft:${population.id}`;
    onRegisterUnsavedForm({
      label: 'sampling edits',
      isDirty: () => draftEdited.current || (Boolean(draftBaseline.current) && readDraft() !== draftBaseline.current),
      // Recording test results and independent review are explicit audit actions;
      // never infer either action from a generic navigation confirmation.
      save: () => {
        throw new Error('Use the row-specific Record test, Record limitation, or Record independent review action before leaving; these audit decisions are never submitted implicitly.');
      },
      discard: discardDraft,
    }, key);
    return () => onRegisterUnsavedForm(null, key);
  }, [population?.id, onRegisterUnsavedForm]);
  const importSource = async (file?: File) => {
    if (!file || !population) return;
    try {
      if (file.size > POPULATION_FILE_LIMIT) throw new Error('File exceeds the 10 MB population import limit.');
      const bytes = await file.arrayBuffer();
      const parsed = parsePopulation(bytes, file.name);
      if (parsed.errors.length) throw new Error(parsed.errors.join(' '));
      const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
      prototypeStore.replaceSamplePopulationSource(population.id, file.name, sha, parsed.rows);
      refresh(value => value + 1);
      setNotice(`Imported ${parsed.rows.length} population rows as source revision ${(population.sourceRevision || 1) + 1}; the predecessor and its testing remain in history.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Population import failed.'); }
  };
  const selected = population?.items.filter(item => item.selected).length || 0;
  const selectedValue = population?.items.filter(item => item.selected).reduce((sum, item) => sum + item.amount, 0) || 0;
  const tested = population?.items.filter(item => item.selected && item.tested).length || 0;
  const limited = population?.items.filter(item => item.selected && item.limitation).length || 0;
  const canReviewSelection = hasAnyRole(state, ['reviewer', 'partner']);
  const exceptions = population?.items.filter(item => item.selected && item.result === 'Exception noted').length || 0;
  const difference = population?.items.filter(item => item.selected).reduce((sum, item) => sum + (item.difference || 0), 0) || 0;

  return <div ref={editorRef} className="stack" style={{ gap: 20 }} onInput={event => { if ((event.target as HTMLElement).matches('[data-sample-draft]')) draftEdited.current = true; }} onChange={event => { if ((event.target as HTMLElement).matches('[data-sample-draft]')) draftEdited.current = true; }}>
    <div className="pagehead"><div><h1>Substantive Sampling &amp; Population Testing</h1><p>Choose population items, retain their test results, and track exceptions.</p></div>
      <div className="row" style={{ gap: 10 }}><button className="btn sm ghost" onClick={() => onNavigate('findings')}><Icon name="target" /> View Audit Findings ({state.findings.length})</button><button className="btn primary sm" onClick={() => onNavigate('audit')}><Icon name="checkboard" /> Workpapers</button></div>
    </div>
    {notice && <div role="status" className="panel panel-pad">{notice}</div>}
    {population ? <>
      {populations.length > 1 && <label className="caption">Population<select className="input" value={population.id} onChange={event => { const nextId = event.target.value; onBeforeContextChange(() => setPopulationId(nextId)); }}>{populations.map(item => <option key={item.id} value={item.id}>{item.name || item.description}</option>)}</select></label>}
      <div className="panel panel-pad">
        <span className="eyebrow">POPULATION · {population.id}</span><h2>{population.name || population.description}</h2>
        <p className="sub">Engagement: {population.engagementId} · Period: FY {population.period || '—'} · Currency: {population.currency || '—'} · Account: {population.accountCode || '—'} · {population.methodology || 'Manual selection from the recorded population items.'}</p>
        <div className="borderbox mt12" style={{ padding: 12 }}>
          <b>Source revision {population.sourceRevision || 1}: {population.sourceFileName || 'Legacy population'}</b>
          <p className="caption mt4">{population.sourceComplete ? `SHA-256 ${population.sourceSha256}` : 'Seeded excerpt only; import the complete source population before relying on totals.'}</p>
          <label className="btn sm mt8">Import or replace CSV/XLSX source<input aria-label="Import population source CSV or XLSX" type="file" accept=".csv,.xlsx" hidden onChange={event => { void importSource(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
          {(population.sourceHistory || []).length > 0 && <details className="mt8"><summary>Previous source revisions ({population.sourceHistory!.length})</summary><ul>{population.sourceHistory!.map(item => <li key={item.revision}>v{item.revision} · {item.fileName} · {item.totalPopulationCount} rows · {item.sha256 || 'seeded legacy source'} · {item.importedAt}</li>)}</ul></details>}
        </div>
        <div className="panel panel-pad mt12" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div className="between">
            <div>
              <span className="caption">General Ledger Sampling Frame Tie-Out</span>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Account: <b>{population.accountCode || 'Unmapped'} {frameRow ? `(${frameRow.name})` : ''}</b> · GL Balance: <b>{frameValue === undefined ? 'Unavailable' : formatCurrency(frameValue)}</b> · Population Total: <b>{formatCurrency(population.totalPopulationValue)}</b> · Variance: <b>{frameDiff === undefined ? 'Unavailable' : formatCurrency(frameDiff)}</b>
              </div>
            </div>
            <span className={`badge ${frameReconciled ? 'green' : 'amber'}`}>
              {frameReconciled ? 'Reconciled to GL Frame' : frameValue === undefined ? 'GL account unavailable' : population.period !== frameEngagement?.year || population.currency !== frameEngagement?.currency ? 'Period/currency mismatch' : `Variance ${formatCurrency(frameDiff || 0)}`}
            </span>
          </div>
          {!frameReconciled && <p role="status" className="caption mt8">Sampling selection and testing stay disabled until the complete population ties to this engagement’s account, period and currency.</p>}
        </div>
        <div className="metric-grid mt16">
          <div className="metric"><span className="metric-label">Population</span><div className="metric-val">{population.totalPopulationCount}</div><span className="metric-sub">{formatCurrency(population.totalPopulationValue)}</span></div>
          <div className="metric blue"><span className="metric-label">Selected</span><div className="metric-val">{selected}</div><span className="metric-sub">{formatCurrency(selectedValue)} · {population.totalPopulationValue ? Math.round(selectedValue / population.totalPopulationValue * 100) : 0}% of value</span></div>
          <div className="metric"><span className="metric-label">Tested</span><div className="metric-val">{tested}/{selected}</div><span className="metric-sub">{limited} limited · {selected - tested - limited} untested</span></div>
          <div className="metric amber"><span className="metric-label">Exceptions</span><div className="metric-val">{exceptions}</div><span className="metric-sub">Net recorded difference: {formatCurrency(difference)}</span></div>
        </div>
      </div>
      <div className="panel"><div className="panel-head between"><h3>Population items and test results</h3><span className="caption">Selection and fieldwork are saved in this engagement · Remainder: {population.totalPopulationCount - selected} items / {formatCurrency(population.totalPopulationValue - selectedValue)}</span></div>
        <div className="tablewrap"><table><thead><tr><th>Select</th><th>Selection rationale / reference</th><th>Recorded</th><th>Audited amount</th><th>Difference</th><th>Result</th><th>Testing notes</th><th>Action</th></tr></thead><tbody>
          {population.items.length === 0 && (
            <ListState
              colSpan={8}
              kind="empty"
              message="No population records exist for this engagement yet"
              hint="Import a population file or define the population frame for this engagement; items appear here once the frame is loaded and reconciled."
            />
          )}
          {population.items.map(item => <tr key={item.id} data-sample-item={item.id}>
            <td><input aria-label={`Select ${item.itemRef}`} type="checkbox" checked={Boolean(item.selected)} disabled={!frameReconciled} onChange={event => run(() => prototypeStore.setSampleItemSelected(population.id, item.id, event.target.checked, event.currentTarget.closest('tr')?.querySelector<HTMLTextAreaElement>('[data-selection-rationale]')?.value || ''))} /></td>
            <td><textarea className="input" data-sample-draft="rationale" data-selection-rationale rows={2} defaultValue={item.selectionRationale || ''} disabled={!frameReconciled || item.selected} aria-label={`Selection rationale ${item.itemRef}`} placeholder="Why this item was selected" /><b>{item.itemRef}</b><div className="cell-sub">{item.date} · {item.counterparty}</div></td>
            <td>{formatCurrency(item.recordedAmount ?? item.amount)}</td>
            <td><input className="input" data-sample-draft="auditedAmount" data-audited-amount type="number" min="0" step="0.01" aria-label={`Audited amount for ${item.itemRef}`} defaultValue={item.auditedAmount ?? item.recordedAmount ?? item.amount} disabled={!frameReconciled || !item.selected} /></td>
            <td>{item.difference ? formatCurrency(item.difference) : '—'}</td>
            <td><span className={`badge ${item.result === 'Satisfactory' ? 'green' : item.result === 'Exception noted' ? 'amber' : 'gray'}`}>{item.selected ? item.result : 'Not selected'}</span></td>
            <td><textarea className="input" data-sample-draft="notes" data-test-notes rows={2} aria-label={`Test notes for ${item.itemRef}`} defaultValue={item.notes || ''} disabled={!frameReconciled || !item.selected} placeholder="Evidence inspected and conclusion" /></td>
            <td><button className="btn sm" disabled={!frameReconciled || !item.selected} onClick={event => { const row = (event.currentTarget as HTMLButtonElement).closest('tr'); const amount = Number(row?.querySelector<HTMLInputElement>('[data-audited-amount]')?.value); const notes = row?.querySelector<HTMLTextAreaElement>('[data-test-notes]')?.value || ''; run(() => prototypeStore.recordSampleItemTest(population.id, item.id, amount, notes)); }}>{item.tested ? 'Update test' : 'Record test'}</button>{item.selected && !item.tested && <><textarea className="input mt4" data-sample-draft="limitation" data-limitation aria-label={`Testing limitation ${item.itemRef}`} rows={2} defaultValue={item.limitation || ''} placeholder="Explain any testing limitation"/><button className="btn sm ghost mt4" onClick={event => { const reason = event.currentTarget.parentElement?.querySelector<HTMLTextAreaElement>('[data-limitation]')?.value || ''; run(() => prototypeStore.recordSampleItemLimitation(population.id, item.id, reason)); }}>{item.limitation ? 'Update limitation' : 'Record limitation'}</button></>}{item.result === 'Exception noted' && !item.findingId && <><select className="input mt4" data-sample-draft="findingId" aria-label={`Finding for ${item.itemRef}`} defaultValue=""><option value="">Link finding…</option>{state.findings.filter(finding => finding.engagementId === population.engagementId).map(finding => <option key={finding.id} value={finding.id}>{finding.id} · {finding.title}</option>)}</select><button className="btn sm ghost mt4" onClick={event => { const id = event.currentTarget.parentElement?.querySelector<HTMLSelectElement>(`[aria-label="Finding for ${item.itemRef}"]`)?.value || ''; run(() => prototypeStore.linkSampleExceptionToFinding(population.id, item.id, id)); }}>{item.findingId ? 'Update finding link' : 'Link finding'}</button></>}{item.findingId && <button className="btn sm ghost mt4" onClick={() => onNavigate('findings')}>Finding {item.findingId}</button>}</td>
          </tr>)}
        </tbody></table></div>
      </div>
      <div className="panel panel-pad"><h3>Selection review and evaluation</h3>
        {(() => { const review = population.selectionReviews?.at(-1); const current = review && review.version === (population.selectionVersion || 0) && review.sourceRevision === (population.sourceRevision || 1); return <p className="caption">Selection v{population.selectionVersion || 0} · {current ? `Reviewed by ${review.reviewedBy}: ${review.testedCount} tested, ${review.limitedCount} limited, ${review.untestedCount} untested, ${review.exceptionCount} exceptions` : 'Current selection requires independent review'}</p>; })()}
        <textarea className="input" data-sample-draft="evaluation" rows={3} aria-label="Sample selection evaluation" placeholder="Evaluate tested and untested items, exceptions, and limitations" />
        <button className="btn sm mt8" disabled={!selected || !canReviewSelection} onClick={event => { const text = event.currentTarget.parentElement?.querySelector<HTMLTextAreaElement>('[aria-label="Sample selection evaluation"]')?.value || ''; run(() => prototypeStore.reviewSampleSelection(population.id, text)); }}>Record independent review</button>
        {(population.selectionReviews || []).length > 0 && <details className="mt8"><summary>Selection review history ({population.selectionReviews!.length})</summary><ul>{population.selectionReviews!.map((review, index) => <li key={`${review.version}-${index}`}>Selection v{review.version} / source v{review.sourceRevision} · {review.reviewedBy} · {review.testedCount} tested · {review.limitedCount} limited · {review.untestedCount} untested · {review.exceptionCount} exceptions · {review.evaluation}</li>)}</ul></details>}
      </div>
    </> : <div className="panel panel-pad"><h3>No scoped population</h3><p className="sub">Create or assign a population to the selected engagement before sampling.</p></div>}
  </div>;
};
