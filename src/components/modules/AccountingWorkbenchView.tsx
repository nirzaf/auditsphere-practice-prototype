// Modules 20–23: Accounting Workbench (VP-034 through VP-039)
// 5 Tabs: Trial Balance, General Ledger, Mappings, Adjustments, Reconciliations

import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, TrialBalanceRow, AdjustmentJournalItem, AdjustmentJournalSupportLinks, ReconciliationSchedule, ClientAccountingProfile } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole } from '../../services/guards';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { Icon } from '../common/Icons';
import { calculateTrialBalanceTotals, verifyGLCompleteness, calculateReconciliationVariance, formatCurrency } from '../../services/calculations';
import { TBImportWizard } from './TBImportWizard';
import { GL_FILE_BYTES_LIMIT, GL_IMPORT_COLUMNS, GLImportColumn, parseGLWorkbook, ParsedGLSource } from '../../services/glImport';
import { exportService } from '../../services/exportService';

import { ListState, ModuleIdentityLine, ModuleLifecycleHint, StatusBadge } from '../common/Enterprise';
const AccountingSetup: React.FC<{ clientId: string; engagementId: string; profile?: ClientAccountingProfile; onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void }> = ({ clientId, engagementId, profile, onRegisterUnsavedForm }) => {
  const seed: ClientAccountingProfile = profile || { legalEntityName: '', reportingBasis: 'Not selected', baseCurrency: 'QAR', accounts: [], periodBooks: [], dimensions: [], revision: 0, chartRevision: 0, history: [] };
  const [draft, setDraft] = useState(structuredClone(seed));
  const [periodId, setPeriodId] = useState(seed.periodBooks.find(book => book.ownerEngagementId === engagementId)?.id || '');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const set = (key: keyof ClientAccountingProfile, value: any) => { setDirty(true); setDraft(current => ({ ...current, [key]: value })); };
  const updateAccount = (index: number, field: string, value: any) => set('accounts', draft.accounts.map((account, i) => i === index ? { ...account, [field]: value } : account));
  const updateBook = (index: number, field: string, value: any) => set('periodBooks', draft.periodBooks.map((book, i) => i === index ? { ...book, [field]: value } : book));
  const saveProfile = () => {
    try {
      const revision = prototypeStore.saveAccountingProfile(clientId, draft, engagementId, periodId);
      setNotice(`Accounting setup saved as Rev ${revision}. Dependent mappings and approvals may need review.`);
      setDirty(false);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Setup could not be saved.');
      return false;
    }
  };
  const save = (event: React.FormEvent) => { event.preventDefault(); saveProfile(); };
  // VP-003: the accounting-context form edits profile drafts inline; guard them.
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const guard: UnsavedFormGuard = {
      label: 'Accounting setup',
      isDirty: () => dirty,
      save: saveProfile,
      discard: () => { setDraft(structuredClone(seed)); setDirty(false); },
    };
    onRegisterUnsavedForm(guard, 'accounting-setup');
    return () => onRegisterUnsavedForm(null, 'accounting-setup');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, seed, dirty, clientId, engagementId, periodId, onRegisterUnsavedForm]);
  return <form className="panel panel-pad stack" onSubmit={save}>
    <div className="between"><div><h3>Client accounting context</h3><p className="sub">Profile Rev {seed.revision} · Chart Rev {seed.chartRevision} · Changes are versioned.</p></div><button className="btn primary sm" type="submit">Save Accounting Setup</button></div>
    {notice && <p role="status" className="tag blue">{notice}</p>}
    <div className="grid grid-3"><label>Legal entity<input required value={draft.legalEntityName} onChange={e => set('legalEntityName', e.target.value)} /></label><label>Reporting basis<select value={draft.reportingBasis} onChange={e => set('reportingBasis', e.target.value)}><option>Not selected</option><option>IFRS</option><option>Local GAAP</option><option>Other</option></select></label><label>Base currency<input required maxLength={3} value={draft.baseCurrency} onChange={e => set('baseCurrency', e.target.value.toUpperCase())} /></label></div>
    <section><div className="between"><h3>Periods and books</h3><button className="btn sm" type="button" onClick={() => { const id = `PB-${crypto.randomUUID()}`; set('periodBooks', [...draft.periodBooks, { id, name: `FY${new Date().getFullYear()}`, bookName: 'General ledger', startDate: `${new Date().getFullYear()}-01-01`, endDate: `${new Date().getFullYear()}-12-31`, ownerEngagementId: engagementId, status: 'Open' }]); setPeriodId(id); }}>Add period/book</button></div>
      {draft.periodBooks.map((book, i) => <div className="row" key={book.id}><input aria-label="Period name" value={book.name} onChange={e => updateBook(i, 'name', e.target.value)} /><input aria-label="Book name" value={book.bookName} onChange={e => updateBook(i, 'bookName', e.target.value)} /><input aria-label="Period start" type="date" value={book.startDate} onChange={e => updateBook(i, 'startDate', e.target.value)} /><input aria-label="Period end" type="date" value={book.endDate} onChange={e => updateBook(i, 'endDate', e.target.value)} /><select aria-label="Import period book" value={periodId} onChange={e => setPeriodId(e.target.value)}><option value="">Select book</option><option value={book.id}>{book.name} · {book.bookName}</option></select><select aria-label="Period status" value={book.status} onChange={e => updateBook(i, 'status', e.target.value)}><option>Open</option><option>Closed</option></select></div>)}
    </section>
    <section><div className="between"><h3>Chart of accounts</h3><button className="btn sm" type="button" onClick={() => set('accounts', [...draft.accounts, { code: '', name: '', type: 'asset', posting: true, active: true }])}>Add account</button></div><div className="tablewrap"><table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Parent</th><th>Posting</th><th>Active</th></tr></thead><tbody>{draft.accounts.map((account, i) => <tr key={`${account.code}-${i}`}><td><input aria-label="Account code" value={account.code} onChange={e => updateAccount(i, 'code', e.target.value)} /></td><td><input aria-label="Account name" value={account.name} onChange={e => updateAccount(i, 'name', e.target.value)} /></td><td><select aria-label="Account type" value={account.type} onChange={e => updateAccount(i, 'type', e.target.value)}>{['asset','liability','equity','revenue','expense'].map(type => <option key={type}>{type}</option>)}</select></td><td><select aria-label="Account parent" value={account.parentCode || ''} onChange={e => updateAccount(i, 'parentCode', e.target.value || undefined)}><option value="">None</option>{draft.accounts.filter(item => item.code !== account.code).map(item => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></td><td><input aria-label="Posting account" type="checkbox" checked={account.posting} onChange={e => updateAccount(i, 'posting', e.target.checked)} /></td><td><input aria-label="Active account" type="checkbox" checked={account.active} onChange={e => updateAccount(i, 'active', e.target.checked)} /></td></tr>)}</tbody></table></div></section>
    <section><h3>Dimensions</h3>{(['Department','Cost centre','Project'] as const).map(name => { const dimension = draft.dimensions.find(item => item.name === name); return <label key={name} className="block">{name}<input aria-label={`${name} values`} value={dimension?.values.join(', ') || ''} placeholder="Optional values, comma separated" onChange={e => { const dimensions = draft.dimensions.filter(item => item.name !== name); if (e.target.value.trim()) dimensions.push({ id: name.toLowerCase().replace(' ', '-'), name, values: e.target.value.split(',').map(value => value.trim()).filter(Boolean), active: true }); set('dimensions', dimensions); }} /></label>; })}</section>
    {seed.history.length > 0 && <details><summary>Previous revisions ({seed.history.length})</summary>{seed.history.map(history => <p key={`${history.revision}-${history.savedAt}`}>Rev {history.revision} · Chart Rev {history.chartRevision} · {history.savedAt}</p>)}</details>}
  </form>;
};

interface AccountingWorkbenchViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const AccountingWorkbenchView: React.FC<AccountingWorkbenchViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'tb' | 'gl' | 'mappings' | 'adjustments' | 'reconciliations' | 'setup'>('tb');
  const [reflectionEvidenceDrafts, setReflectionEvidenceDrafts] = useState<Record<string, string>>({});
  const [adjustmentNotice, setAdjustmentNotice] = useState('');
  const [mappingTargets, setMappingTargets] = useState<Record<string, string>>({});
  const [recDraft, setRecDraft] = useState<ReconciliationSchedule | null>(null);
  const [recNotice, setRecNotice] = useState('');
  const [glFileName, setGLFileName] = useState('');
  const [glBytes, setGLBytes] = useState<ArrayBuffer | null>(null);
  const [glPreview, setGLPreview] = useState<ParsedGLSource | null>(null);
  const [glColumnMap, setGLColumnMap] = useState<Partial<Record<GLImportColumn, number>>>({});
  const [glNotice, setGLNotice] = useState('');
  const [glAccountFilter, setGLAccountFilter] = useState('');
  const [glJournalFilter, setGLJournalFilter] = useState('');
  // TB State
  const [editRowCode, setEditRowCode] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState<number>(0);
  const [splitModalAccount, setSplitModalAccount] = useState<{
    code: string;
    name: string;
    balance: number;
    targets: { statementLine: string; percentage: number }[];
  } | null>(null);

  // Adjustment form state
  const [showAddAdjModal, setShowAddAdjModal] = useState(false);
  const [amendAdjustment, setAmendAdjustment] = useState<AdjustmentJournalItem | null>(null);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [adjTitle, setAdjTitle] = useState('Accrued audit fees and advisory expenses');
  const [adjDebitAccount, setAdjDebitAccount] = useState('5100');
  const [adjCreditAccount, setAdjCreditAccount] = useState('2100');
  const [adjAmount, setAdjAmount] = useState(35000);
  const [adjRationale, setAdjRationale] = useState('Record unbilled professional audit and consulting fees.');
  const [adjEvidenceId, setAdjEvidenceId] = useState('');
  const [adjWorkpaperId, setAdjWorkpaperId] = useState('');
  const [adjFindingId, setAdjFindingId] = useState('');
  const [journalFormNotice, setJournalFormNotice] = useState('');
  const initialAdjustmentDraft = useRef({ title: 'Accrued audit fees and advisory expenses', debit: '5100', credit: '2100', amount: 35000, rationale: 'Record unbilled professional audit and consulting fees.' });

  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);
  const engagementEvidence = selectedEng ? state.evidenceCatalogue.flatMap(evidence => {
    const document = state.documents.find(item => item.id === evidence.documentId);
    return document && document.clientId === selectedEng.client && document.engagementId === selectedEng.id ? [{ evidence, document }] : [];
  }) : [];
  const journalSupportLinksForDraft = (): AdjustmentJournalSupportLinks | undefined => {
    if (!selectedEng) return undefined;
    const evidenceLink = adjEvidenceId ? engagementEvidence.find(item => item.evidence.id === adjEvidenceId) : undefined;
    const workpaperLink = adjWorkpaperId ? selectedEng.workpapers.find(item => item.id === adjWorkpaperId) : undefined;
    const findingLink = adjFindingId ? state.findings.find(item => item.id === adjFindingId && item.engagementId === selectedEng.id) : undefined;
    if ((adjEvidenceId && !evidenceLink) || (adjWorkpaperId && !workpaperLink) || (adjFindingId && !findingLink)) throw new Error('A selected support record is no longer available in this engagement. Choose a current in-scope record or clear that link.');
    const links: AdjustmentJournalSupportLinks = {
      evidence: evidenceLink ? { id: evidenceLink.evidence.id, evidenceVersion: evidenceLink.evidence.version, documentId: evidenceLink.document.id, documentVersion: evidenceLink.document.version } : undefined,
      workpaper: workpaperLink ? { id: workpaperLink.id, version: workpaperLink.version } : undefined,
      finding: findingLink ? { id: findingLink.id, revision: findingLink.revision || 1 } : undefined,
    };
    return links.evidence || links.workpaper || links.finding ? links : undefined;
  };
  const describeJournalSupport = (links?: AdjustmentJournalSupportLinks) => {
    if (!links) return 'No linked evidence, workpaper or finding';
    const labels: string[] = [];
    if (links.evidence) {
      const record = state.evidenceCatalogue.find(item => item.id === links.evidence!.id);
      const document = state.documents.find(item => item.id === links.evidence!.documentId);
      labels.push(`Evidence ${record?.title || links.evidence.id} (${links.evidence.id} v${links.evidence.evidenceVersion}; ${document?.name || links.evidence.documentId} v${links.evidence.documentVersion})`);
    }
    if (links.workpaper) {
      const workpaper = selectedEng?.workpapers.find(item => item.id === links.workpaper!.id);
      labels.push(`Workpaper ${workpaper?.title || links.workpaper.id} (${links.workpaper.id} v${links.workpaper.version})`);
    }
    if (links.finding) {
      const finding = state.findings.find(item => item.id === links.finding!.id);
      labels.push(`Finding ${finding?.title || links.finding.id} (${links.finding.id} v${links.finding.revision})`);
    }
    return labels.join(' · ');
  };

  // VP-003: reconciliation schedules, TB balance edits and reflection-evidence drafts
  // are inline edit surfaces; register them so context changes cannot silently drop them.
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const guard: UnsavedFormGuard = {
      label: 'Accounting workbench',
      isDirty: () => recDraft !== null || editRowCode !== null || (showAddAdjModal && (adjTitle !== initialAdjustmentDraft.current.title || adjDebitAccount !== initialAdjustmentDraft.current.debit || adjCreditAccount !== initialAdjustmentDraft.current.credit || adjAmount !== initialAdjustmentDraft.current.amount || adjRationale !== initialAdjustmentDraft.current.rationale || Boolean(adjEvidenceId || adjWorkpaperId || adjFindingId))) || (amendAdjustment !== null && (adjTitle !== amendAdjustment.title || adjDebitAccount !== (amendAdjustment.lines.find(line => line.type === 'debit')?.accountCode || '') || adjCreditAccount !== (amendAdjustment.lines.find(line => line.type === 'credit')?.accountCode || '') || adjAmount !== (amendAdjustment.lines.find(line => line.type === 'debit')?.amount || 0) || adjRationale !== (amendAdjustment.rationale || '') || adjEvidenceId !== (amendAdjustment.supportLinks?.evidence?.id || '') || adjWorkpaperId !== (amendAdjustment.supportLinks?.workpaper?.id || '') || adjFindingId !== (amendAdjustment.supportLinks?.finding?.id || '') || Boolean(amendmentReason.trim()))) || Object.values(reflectionEvidenceDrafts).some(value => value.trim() !== ''),
      save: () => {
        try {
          const snapshot = prototypeStore.getSnapshot();
          const eng = snapshot.engagements.find(item => item.id === snapshot.selectedEngagement) || snapshot.engagements[0];
          if (!eng) return false;
          if (editRowCode !== null) {
            prototypeStore.updateTrialBalanceRows(eng.id, eng.rows.map(r => r.code === editRowCode ? { ...r, balance: editBalance } : r));
            setEditRowCode(null);
          }
          for (const [adjId, value] of Object.entries(reflectionEvidenceDrafts)) {
            if (value.trim() === '') continue;
            const adj = snapshot.adjustmentJournals.find(item => item.id === adjId);
            if (adj) prototypeStore.updateAdjustmentJournal({ ...adj, reflectionEvidenceRef: value.trim(), reflectionSourceVersion: eng.sourceVersion });
          }
          if (recDraft) {
            prototypeStore.saveReconciliationSchedule(eng.id, recDraft);
            setRecDraft(null);
          }
          if (showAddAdjModal || amendAdjustment) {
            if (!selectedEng || !adjTitle.trim() || !adjRationale.trim() || !Number.isFinite(adjAmount) || adjAmount <= 0) return false;
            const lines: AdjustmentJournalItem['lines'] = [
              { accountCode: adjDebitAccount, accountName: selectedEng.rows.find(r => r.code === adjDebitAccount)?.name || 'Expense', type: 'debit', amount: adjAmount, debit: adjAmount, credit: 0 },
              { accountCode: adjCreditAccount, accountName: selectedEng.rows.find(r => r.code === adjCreditAccount)?.name || 'Accruals', type: 'credit', amount: adjAmount, debit: 0, credit: adjAmount }
            ];
            const supportLinks = journalSupportLinksForDraft();
            if (amendAdjustment) {
              prototypeStore.amendAdjustmentJournal(amendAdjustment.id, { title: adjTitle, lines, rationale: adjRationale, supportLinks }, amendmentReason);
              setAmendAdjustment(null);
            } else prototypeStore.addAdjustmentJournal({ id: `AJ-${crypto.randomUUID().slice(0, 8)}`, engagementId: selectedEng.id, title: adjTitle, status: 'Draft', reflectionStatus: 'Not reflected', lines, reflectedInClientBooks: false, preparedBy: state.currentPerson, rationale: adjRationale, supportLinks });
            setShowAddAdjModal(false);
          }
          return true;
        } catch (error) {
          setJournalFormNotice(error instanceof Error ? error.message : 'The journal and its support references could not be saved.');
          return false;
        }
      },
      discard: () => {
        setRecDraft(null);
        setEditRowCode(null);
        setReflectionEvidenceDrafts({});
        setShowAddAdjModal(false);
        setAmendAdjustment(null);
        setAdjTitle(initialAdjustmentDraft.current.title);
        setAdjDebitAccount(initialAdjustmentDraft.current.debit);
        setAdjCreditAccount(initialAdjustmentDraft.current.credit);
        setAdjAmount(initialAdjustmentDraft.current.amount);
        setAdjRationale(initialAdjustmentDraft.current.rationale);
        setAmendmentReason('');
        setAdjEvidenceId('');
        setAdjWorkpaperId('');
        setAdjFindingId('');
        setJournalFormNotice('');
      },
    };
    onRegisterUnsavedForm(guard, 'accounting-workbench');
    return () => onRegisterUnsavedForm(null, 'accounting-workbench');
  }, [recDraft, editRowCode, editBalance, reflectionEvidenceDrafts, showAddAdjModal, amendAdjustment, adjTitle, adjDebitAccount, adjCreditAccount, adjAmount, adjRationale, adjEvidenceId, adjWorkpaperId, adjFindingId, amendmentReason, selectedEng, state.currentPerson, onRegisterUnsavedForm]);

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="calculator" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to work with trial balances, GL transactions, adjustments, and reconciliations.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const tbTotals = calculateTrialBalanceTotals(selectedEng.rows);
  const glSource = selectedEng.glSourceHistory?.at(-1);
  const glTransactions = glSource?.transactions || state.glTransactions.filter(line => line.engagementId === selectedEng.id);
  const glVerify = verifyGLCompleteness(glTransactions, selectedEng.rows, glSource?.openingBalances);
  const visibleGLTransactions = glTransactions.filter(line => (!glAccountFilter || line.accountCode.toLowerCase().includes(glAccountFilter.toLowerCase())) && (!glJournalFilter || line.journalId.toLowerCase().includes(glJournalFilter.toLowerCase())));
  const safeCSVText = (value: string) => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const mappingHistory = (state.accountMappingRevisions || []).filter(item => item.engagementId === selectedEng.id);
  const activeMapping = [...mappingHistory].sort((a, b) => b.revision - a.revision)[0];
  const activeMappings = activeMapping?.mappings || [];
  const statementLines = ['Cash and cash equivalents', 'Trade receivables', 'Other current assets', 'Property and equipment', 'Trade payables', 'Borrowings', 'Share capital and reserves', 'Revenue', 'Cost of sales', 'Operating expenses', 'Finance costs', 'Income tax'];

  const handleSaveTBRow = (code: string) => {
    const updatedRows = selectedEng.rows.map(r => r.code === code ? { ...r, balance: editBalance } : r);
    prototypeStore.updateTrialBalanceRows(selectedEng.id, updatedRows);
    setEditRowCode(null);
  };

  const handleAddAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const lines: AdjustmentJournalItem['lines'] = [
        { accountCode: adjDebitAccount, accountName: selectedEng.rows.find(r => r.code === adjDebitAccount)?.name || 'Expense', type: 'debit', amount: adjAmount, debit: adjAmount, credit: 0 },
        { accountCode: adjCreditAccount, accountName: selectedEng.rows.find(r => r.code === adjCreditAccount)?.name || 'Accruals', type: 'credit', amount: adjAmount, debit: 0, credit: adjAmount }
      ];
      const supportLinks = journalSupportLinksForDraft();
      if (amendAdjustment) {
        prototypeStore.amendAdjustmentJournal(amendAdjustment.id, { title: adjTitle, lines, rationale: adjRationale, supportLinks }, amendmentReason);
        setAmendAdjustment(null);
        setAmendmentReason('');
      } else {
        prototypeStore.addAdjustmentJournal({ id: `AJ-2600${state.adjustmentJournals.length + 1}`, engagementId: selectedEng.id, title: adjTitle, status: 'Draft', reflectionStatus: 'Not reflected', lines, reflectedInClientBooks: false, preparedBy: state.currentPerson, rationale: adjRationale, supportLinks });
        setShowAddAdjModal(false);
      }
      setAdjEvidenceId('');
      setAdjWorkpaperId('');
      setAdjFindingId('');
      setJournalFormNotice('');
      setAdjustmentNotice(amendAdjustment ? 'Amended journal saved as a new revision. Prior support pins and decisions remain in history.' : 'Adjustment journal proposed with its selected support revisions pinned.');
    } catch (error) {
      setJournalFormNotice(error instanceof Error ? error.message : 'The journal and its support references could not be saved.');
    }
  };

  const startAdjustmentAmendment = (journal: AdjustmentJournalItem) => {
    setAmendAdjustment(journal);
    setAdjTitle(journal.title);
    setAdjDebitAccount(journal.lines.find(line => line.type === 'debit')?.accountCode || selectedEng.rows[0]?.code || '');
    setAdjCreditAccount(journal.lines.find(line => line.type === 'credit')?.accountCode || selectedEng.rows[1]?.code || '');
    setAdjAmount(journal.lines.find(line => line.type === 'debit')?.amount || 0);
    setAdjRationale(journal.rationale || '');
    setAdjEvidenceId(journal.supportLinks?.evidence?.id || '');
    setAdjWorkpaperId(journal.supportLinks?.workpaper?.id || '');
    setAdjFindingId(journal.supportLinks?.finding?.id || '');
    setAmendmentReason('');
    setJournalFormNotice('');
  };

  const openAdjustmentProposal = () => {
    setAmendAdjustment(null);
    setAdjEvidenceId('');
    setAdjWorkpaperId('');
    setAdjFindingId('');
    setJournalFormNotice('');
    setShowAddAdjModal(true);
  };

  const closeAdjustmentModal = () => {
    const draftChanged = amendAdjustment
      ? adjTitle !== amendAdjustment.title || adjDebitAccount !== (amendAdjustment.lines.find(line => line.type === 'debit')?.accountCode || '') || adjCreditAccount !== (amendAdjustment.lines.find(line => line.type === 'credit')?.accountCode || '') || adjAmount !== (amendAdjustment.lines.find(line => line.type === 'debit')?.amount || 0) || adjRationale !== (amendAdjustment.rationale || '') || adjEvidenceId !== (amendAdjustment.supportLinks?.evidence?.id || '') || adjWorkpaperId !== (amendAdjustment.supportLinks?.workpaper?.id || '') || adjFindingId !== (amendAdjustment.supportLinks?.finding?.id || '') || Boolean(amendmentReason.trim())
      : showAddAdjModal && (adjTitle !== initialAdjustmentDraft.current.title || adjDebitAccount !== initialAdjustmentDraft.current.debit || adjCreditAccount !== initialAdjustmentDraft.current.credit || adjAmount !== initialAdjustmentDraft.current.amount || adjRationale !== initialAdjustmentDraft.current.rationale || Boolean(adjEvidenceId || adjWorkpaperId || adjFindingId));
    if (draftChanged && !window.confirm('Discard this unsaved adjustment journal draft?')) return;
    setShowAddAdjModal(false);
    setAmendAdjustment(null);
    setAdjEvidenceId('');
    setAdjWorkpaperId('');
    setAdjFindingId('');
    setJournalFormNotice('');
    setAmendmentReason('');
  };

  const handleReflectionChange = (adj: AdjustmentJournalItem, reflectionStatus: AdjustmentJournalItem['reflectionStatus']) => {
    try {
      prototypeStore.updateAdjustmentJournal({
        ...adj,
        reflectedInClientBooks: reflectionStatus === 'Reflected in TB',
        reflectionStatus,
        reflectionSourceVersion: selectedEng.sourceVersion,
        reflectionEvidenceRef: reflectionEvidenceDrafts[adj.id] ?? adj.reflectionEvidenceRef
      });
      setAdjustmentNotice('Reflection decision saved against the current trial-balance revision.');
    } catch (error) { setAdjustmentNotice(error instanceof Error ? error.message : 'Reflection decision could not be saved.'); }
  };

  const handleReflectionEvidenceSave = (adj: AdjustmentJournalItem, evidenceRef: string) => {
    try {
      prototypeStore.updateAdjustmentJournal({ ...adj, reflectionEvidenceRef: evidenceRef.trim(), reflectionSourceVersion: selectedEng.sourceVersion });
      // The staged draft is committed; clear it so the unsaved-form guard no longer
      // treats the saved evidence reference as pending work.
      setReflectionEvidenceDrafts(current => {
        const next = { ...current };
        delete next[adj.id];
        return next;
      });
      setAdjustmentNotice('Reflection evidence reference saved.');
    } catch (error) { setAdjustmentNotice(error instanceof Error ? error.message : 'Reflection evidence could not be saved.'); }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Accounting Workbench</h1>
          <p>Deterministic trial balance verification, complete GL tie-out, adjustments, and reconciliation schedules.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="tag blue">Source v{selectedEng.sourceVersion}</span>
          <button className="btn primary sm" onClick={() => onNavigate('financial-statements')}>
            <Icon name="file" /> Generate Financial Statements
          </button>
        </div>
        <ModuleIdentityLine />
        <ModuleLifecycleHint />
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'tb' ? 'active' : ''}`} onClick={() => setActiveTab('tb')}>
          Trial Balance & Intake
        </button>
        <button className={`tab-btn ${activeTab === 'gl' ? 'active' : ''}`} onClick={() => setActiveTab('gl')}>
          General Ledger & Completeness
          {!glVerify.isComplete && <span className="tag amber" style={{ marginLeft: 6 }}>Mismatch</span>}
        </button>
        <button className={`tab-btn ${activeTab === 'mappings' ? 'active' : ''}`} onClick={() => setActiveTab('mappings')}>
          Statement Mappings
        </button>
        <button className={`tab-btn ${activeTab === 'adjustments' ? 'active' : ''}`} onClick={() => setActiveTab('adjustments')}>
          Adjustments ({state.adjustmentJournals.length})
        </button>
        <button className={`tab-btn ${activeTab === 'reconciliations' ? 'active' : ''}`} onClick={() => setActiveTab('reconciliations')}>
          Reconciliations ({selectedEng.reconciliations.length})
        </button>
        <button className={`tab-btn ${activeTab === 'setup' ? 'active' : ''}`} onClick={() => setActiveTab('setup')}>Accounting Setup</button>
      </div>

      {activeTab === 'setup' && <AccountingSetup key={`${client?.id}-${selectedEng.id}`} clientId={selectedEng.client} engagementId={selectedEng.id} profile={client?.accountingProfile} onRegisterUnsavedForm={onRegisterUnsavedForm} />}

      {/* Tab 1: Trial Balance */}
      {activeTab === 'tb' && (
        <div className="stack" style={{ gap: 16 }}>
          <TBImportWizard engagementId={selectedEng.id} onCommitted={() => undefined} onRegisterUnsavedForm={onRegisterUnsavedForm} />
          {/* Status banner */}
          <div className="panel panel-pad" style={{ background: tbTotals.isBalanced ? '#f0fdf4' : '#fef2f2' }}>
            <div className="between">
              <div>
                <b>{tbTotals.isBalanced ? 'Trial Balance is Balanced (Net Zero)' : 'Trial Balance Imbalance Detected!'}</b>
                <p className="sub" style={{ fontSize: 13, marginTop: 4 }}>
                  Debits: {formatCurrency(tbTotals.totalDebits)} · Credits: {formatCurrency(tbTotals.totalCredits)} · Net Difference: {formatCurrency(tbTotals.netDifference)}
                </p>
              </div>
              <span className={`badge ${tbTotals.isBalanced ? 'green' : 'amber'}`}>
                {tbTotals.isBalanced ? 'Balanced' : 'Imbalance'}
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Trial Balance Accounts ({selectedEng.rows.length})</h3>
              <span className="caption">Click balance to edit in-memory</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Account Code</th>
                    <th>Account Name</th>
                    <th>Classification</th>
                    <th>Debit (QAR)</th>
                    <th>Credit (QAR)</th>
                    <th>Net Balance</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEng.rows.map(row => (
                    <tr key={row.code}>
                      <td><span className="mono">{row.code}</span></td>
                      <td><b>{row.name}</b></td>
                      <td><span className="tag gray">{row.type}</span></td>
                      <td>{row.balance > 0 ? formatCurrency(row.balance) : '—'}</td>
                      <td>{row.balance < 0 ? formatCurrency(Math.abs(row.balance)) : '—'}</td>
                      <td>
                        {editRowCode === row.code ? (
                          <input
                            type="number"
                            className="input sm"
                            style={{ width: 120 }}
                            value={editBalance}
                            onChange={e => setEditBalance(Number(e.target.value))}
                          />
                        ) : (
                          <b>{formatCurrency(row.balance)}</b>
                        )}
                      </td>
                      <td>
                        {editRowCode === row.code ? (
                          <div className="row" style={{ gap: 4 }}>
                            <button className="btn sm primary" onClick={() => handleSaveTBRow(row.code)}>Save</button>
                            <button className="btn sm ghost" onClick={() => setEditRowCode(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button
                            className="btn sm ghost"
                            onClick={() => {
                              setEditRowCode(row.code);
                              setEditBalance(row.balance);
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}><b>Total Practice Trial Balance</b></td>
                    <td><b>{formatCurrency(tbTotals.totalDebits)}</b></td>
                    <td><b>{formatCurrency(tbTotals.totalCredits)}</b></td>
                    <td><b>{formatCurrency(tbTotals.netDifference)}</b></td>
                    <td>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: General Ledger Completeness */}
      {activeTab === 'gl' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel-pad">
            <div className="between"><div><h3>Import engagement GL source</h3><p className="sub">CSV or genuine XLSX · {selectedEng.currency} · selected accounting period only · maximum 5,000 lines / 5 MB</p></div><span className="tag blue">Source revisions: {selectedEng.glSourceHistory?.length || 0}</span></div>
            <p className="caption mt8">Required headers: Journal ID, Line ID, Date, Account Code, Account Name, Debit, Credit, Currency, Description. Optional Opening Balance supplies an explicit prior closing balance per account.</p>
            <div className="row mt12" style={{ gap: 10 }}>
              <input aria-label="General ledger source file" type="file" accept=".csv,.xlsx" onChange={async event => {
                const file = event.target.files?.[0]; setGLPreview(null); setGLColumnMap({}); setGLNotice(''); setGLBytes(null); setGLFileName('');
                if (!file) return;
                if (file.size > GL_FILE_BYTES_LIMIT) { setGLNotice('File exceeds 5 MB; nothing was imported.'); return; }
                const bytes = await file.arrayBuffer(); setGLBytes(bytes); setGLFileName(file.name);
                const profile = state.clients.find(item => item.id === selectedEng.client)?.accountingProfile;
                const book = profile?.periodBooks.find(item => item.id === selectedEng.accountingPeriodBookId);
                if (!book) { setGLNotice('Select a current accounting period book before previewing GL files.'); return; }
                const parsed = parseGLWorkbook(file.name, bytes, selectedEng.currency, book.startDate, book.endDate);
                setGLColumnMap(parsed.columnIndexes || {}); setGLPreview(parsed);
              }} />
              <button className="btn sm" disabled={!glBytes || !glPreview || glPreview.errors.length > 0} onClick={async () => {
                if (!glBytes || !glPreview || !globalThis.crypto?.subtle) { setGLNotice('This browser cannot verify the source SHA-256; nothing was imported.'); return; }
                const digest = await crypto.subtle.digest('SHA-256', glBytes);
                const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
                try {
                  const columnMapping = Object.fromEntries(GL_IMPORT_COLUMNS.map(({ key }) => [key, glPreview.columnIndexes?.[key] !== undefined && glPreview.columnIndexes[key] >= 0 ? `${glPreview.columnIndexes[key] + 1}: ${glPreview.headers?.[glPreview.columnIndexes[key]] || ''}` : ''])) as Record<string, string>;
                  const revision = prototypeStore.importGeneralLedgerSource(selectedEng.id, { fileName: glFileName, format: glPreview.format, sha256, openingBalances: glPreview.openingBalances, transactions: glPreview.transactions, columnMapping });
                  setGLNotice(`GL source revision ${revision} saved with ${glPreview.transactions.length} lines and its column mapping. Prior revisions and dependent review history remain retained.`); setGLPreview(null); setGLBytes(null);
                } catch (error) { setGLNotice(error instanceof Error ? error.message : 'GL source was not imported.'); }
              }}>Import new revision</button>
              <button className="btn sm ghost" disabled={!visibleGLTransactions.length} onClick={() => exportService.exportCSV(`GL_${selectedEng.id}_v${glSource?.revision || 0}.csv`, [['Journal ID','Line ID','Date','Service Date','Account Code','Account Name','Department','Cost centre','Project','Debit','Credit','Currency','Description'], ...visibleGLTransactions.map(line => [line.journalId,line.lineId,safeCSVText(line.date),line.serviceDate ? safeCSVText(line.serviceDate) : '',safeCSVText(line.accountCode),safeCSVText(line.accountName),safeCSVText(line.dimensions?.Department || line.dimensionDept || ''),safeCSVText(line.dimensions?.['Cost centre'] || ''),safeCSVText(line.dimensions?.Project || ''),String(line.debit),String(line.credit),safeCSVText(line.currency),safeCSVText(line.description)])])}>Export filtered CSV</button>
            </div>
            {glNotice && <p role="status" className="mt8">{glNotice}</p>}
            {glPreview && <div className="borderbox mt12 panel-pad"><b>Preview: {glFileName}</b><p>{glPreview.transactions.length} lines · {Object.keys(glPreview.openingBalances).length} explicit opening balances · {glPreview.errors.length} validation errors</p><div className="grid grid-cols-2 gap12 mt12">{GL_IMPORT_COLUMNS.map(({ key, label, required }) => <label key={key} className="caption">{label}{required ? ' *' : ' (optional)'}<select className="input mt4" aria-label={`GL source column: ${label}`} value={glColumnMap[key] ?? -1} onChange={event => {const next = { ...glColumnMap, [key]: Number(event.target.value) }; setGLColumnMap(next); const profile = state.clients.find(item => item.id === selectedEng.client)?.accountingProfile; const book = profile?.periodBooks.find(item => item.id === selectedEng.accountingPeriodBookId); if (book && glBytes) setGLPreview(parseGLWorkbook(glFileName, glBytes, selectedEng.currency, book.startDate, book.endDate, next));}}><option value={-1}>{required ? 'Select source column' : 'Not included'}</option>{(glPreview.headers || []).map((header, index) => <option key={`${index}:${header}`} value={index}>{index + 1}: {header || '(blank header)'}</option>)}</select></label>)}</div>{glPreview.errors.map(error => <p className="text-danger" key={error}>{error}</p>)}{!glPreview.errors.length && <p className="caption">Journal balance, date/currency consistency, and period checks passed. Unmatched account codes remain visible in completeness results.</p>}</div>}
          </div>
          <div className="panel panel-pad">
            <div className="between">
              <div>
                <h3>General Ledger Completeness Verification</h3>
                <p className="sub">
                  Ensures all underlying GL transactions sum exactly to the Trial Balance line figures.
                </p>
              </div>
              <span className={`badge ${glVerify.isComplete ? 'green' : 'amber'}`}>
                {glVerify.isComplete ? 'GL Fully Reconciled to TB' : `${glVerify.discrepancies.length} Open completeness items`}
              </span>
            </div>
            {glVerify.discrepancies.length > 0 && (
              <div className="borderbox mt12" style={{ background: '#fffbeb', padding: 12 }}>
                <b>Discrepancies found:</b>
                {glVerify.discrepancies.map(d => (
                  <div key={d.accountCode} className="cell-sub" style={{ color: '#b45309' }}>
                    Account {d.accountCode} ({d.accountName}){d.missingOpening ? ' · opening balance missing' : ''}{d.unmatchedAccount ? ' · not in closing TB' : ''}: Calculated close = {d.missingOpening ? 'Unknown' : formatCurrency(d.calculatedClosing, selectedEng.currency)}, TB close = {formatCurrency(d.tbBalance, selectedEng.currency)}, Residual = {d.missingOpening ? 'Unknown' : formatCurrency(d.residual, selectedEng.currency)}
                  </div>
                ))}
              </div>
            )}
            <div className="tablewrap mt12"><table><thead><tr><th>Account</th><th>Opening</th><th>GL movement</th><th>Calculated close</th><th>TB close</th><th>Residual</th><th>Source journals</th><th>Status</th></tr></thead><tbody>
              {glVerify.checks.map(check => <tr key={check.accountCode}><td><span className="mono">{check.accountCode}</span> · {check.accountName}</td><td>{check.missingOpening ? 'Unknown' : formatCurrency(check.openingBalance, selectedEng.currency)}</td><td>{formatCurrency(check.netMovement, selectedEng.currency)}</td><td>{check.missingOpening ? 'Unknown' : formatCurrency(check.calculatedClosing, selectedEng.currency)}</td><td>{formatCurrency(check.tbBalance, selectedEng.currency)}</td><td>{check.missingOpening ? 'Unknown' : formatCurrency(check.residual, selectedEng.currency)}</td><td>{[...new Set(glTransactions.filter(line => line.accountCode === check.accountCode).map(line => line.journalId))].join(', ') || '—'}</td><td>{check.isComplete ? 'Reconciled' : check.missingOpening ? 'Missing opening' : check.unmatchedAccount ? 'Unmatched account' : 'Residual'}</td></tr>)}
            </tbody></table></div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>GL Detailed Transactions ({visibleGLTransactions.length}) · {glSource ? `Source v${glSource.revision}` : 'No imported engagement source'}</h3>
            </div>
            <div className="row panel-pad" style={{ gap: 8 }}><input className="input" aria-label="Filter GL account" placeholder="Filter account code" value={glAccountFilter} onChange={event => setGLAccountFilter(event.target.value)} /><input className="input" aria-label="Filter GL journal" placeholder="Filter journal ID" value={glJournalFilter} onChange={event => setGLJournalFilter(event.target.value)} /></div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Posting date</th>
                    <th>Service date</th>
                    <th>Journal ID</th>
                    <th>Account</th>
                    <th>Dimensions</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th>Debit (QAR)</th>
                    <th>Credit (QAR)</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGLTransactions.length === 0 && (
                    glTransactions.length === 0
                      ? <ListState colSpan={9} kind="empty" message="No general-ledger lines imported yet" hint="Import a GL journal file for this engagement; the mapped lines and their account codes appear here." />
                      : <ListState colSpan={9} kind="no-match" message="No GL lines match this account filter" hint={`${glTransactions.length} imported line(s) exist for this engagement but none match “${glAccountFilter}”. Clear the account filter to see them all.`} />
                  )}
                  {visibleGLTransactions.map(tx => (
                    <tr key={tx.id}>
                      <td>{tx.date}</td>
                      <td>{tx.serviceDate || '—'}</td>
                      <td><span className="mono">{tx.journalId}</span></td>
                      <td><span className="mono">{tx.accountCode}</span></td>
                      <td>{Object.entries(tx.dimensions || (tx.dimensionDept ? { Department: tx.dimensionDept } : {})).map(([name, value]) => `${name}: ${value}`).join(' · ') || '—'}</td>
                      <td><span className="mono">{tx.reference}</span></td>
                      <td>{tx.description}</td>
                      <td>{tx.debit > 0 ? formatCurrency(tx.debit) : '—'}</td>
                      <td>{tx.credit > 0 ? formatCurrency(tx.credit) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Account Mappings (VP-037) */}
      {activeTab === 'mappings' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel-pad">
            <div className="between">
              <div>
                <h3>Account Mapping Revision {activeMapping?.revision ?? '1 (Seeded baseline)'}</h3>
                <p className="sub">
                  Chart version: Trial Balance v{selectedEng.sourceVersion} · Status: <span className={`badge ${activeMapping?.status === 'Approved' ? 'green' : 'amber'}`}>{activeMapping?.status || 'Draft'}</span>
                  {activeMapping?.preparedBy && ` · Prepared by: ${activeMapping.preparedBy}`}
                  {activeMapping?.reviewedBy && ` · Independently approved by: ${state.users.find(u => u.id === activeMapping.reviewedBy)?.name || activeMapping.reviewedBy}`}
                </p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {activeMapping?.status === 'Draft' && hasAnyRole(state, ['reviewer', 'partner']) && (
                  <button className="btn sm primary" onClick={() => {
                    try {
                      prototypeStore.approveAccountMappings(selectedEng.id, activeMapping.revision);
                    } catch (err: any) {
                      alert(err.message);
                    }
                  }}>
                    Approve Revision v{activeMapping.revision}
                  </button>
                )}
                <button className="btn sm primary" onClick={() => {
                  try {
                    const mappings = selectedEng.rows.flatMap(row => {
                      const prior = activeMappings.find(item => item.accountCode === row.code);
                      const target = mappingTargets[row.code];
                      if (Object.hasOwn(mappingTargets, row.code)) {
                        return target ? [{ accountCode: row.code, targets: [{ statementLine: target, percentage: 100 }] }] : [];
                      }
                      return prior ? [{ accountCode: row.code, targets: prior.targets }] : [];
                    });
                    prototypeStore.saveAccountMappings(selectedEng.id, mappings);
                  } catch (err: any) {
                    alert(err.message);
                  }
                }}>
                  Save New Revision
                </button>
              </div>
            </div>
            <p className="caption mt8">
              Unmapped accounts: {selectedEng.rows.filter(row => !activeMappings.some(item => item.accountCode === row.code)).length} · Unmapped net balance: {formatCurrency(selectedEng.rows.filter(row => !activeMappings.some(item => item.accountCode === row.code)).reduce((sum, row) => sum + row.balance, 0))}. Any mapping edit saves a fresh draft revision and marks financial packages stale until independently approved.
            </p>
          </div>

          {/* Unmapped Accounts Queue */}
          {selectedEng.rows.filter(row => !activeMappings.some(item => item.accountCode === row.code)).length > 0 && (
            <div className="panel panel-pad" style={{ background: '#fffbeb', borderColor: '#fef3c7' }}>
              <div className="between">
                <div>
                  <h4 style={{ color: '#92400e' }}>⚠ Unmapped Accounts Queue ({selectedEng.rows.filter(row => !activeMappings.some(item => item.accountCode === row.code)).length})</h4>
                  <p className="caption" style={{ color: '#b45309' }}>
                    Financial statements and package validation require 100% of trial balance accounts to have approved mappings. Map these accounts below or assign targets.
                  </p>
                </div>
              </div>
              <div className="tablewrap mt12">
                <table>
                  <thead>
                    <tr>
                      <th>Account Code</th>
                      <th>Account Name</th>
                      <th>Type</th>
                      <th>Balance (QAR)</th>
                      <th>Quick Target Assignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEng.rows.filter(row => !activeMappings.some(item => item.accountCode === row.code)).map(r => (
                      <tr key={r.code}>
                        <td><span className="mono">{r.code}</span></td>
                        <td><b>{r.name}</b></td>
                        <td><span className="tag gray">{r.type}</span></td>
                        <td>{formatCurrency(r.balance)}</td>
                        <td>
                          <select
                            className="input"
                            aria-label={`Statement line for unmapped account ${r.code}`}
                            value={mappingTargets[r.code] || ''}
                            onChange={e => setMappingTargets({ ...mappingTargets, [r.code]: e.target.value })}
                          >
                            <option value="">Choose Statement Line...</option>
                            {statementLines.map(line => <option key={line} value={line}>{line}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Statement Line Mappings Table */}
          <div className="panel">
            <div className="panel-head between">
              <div>
                <h3>Trial Balance to Statement Line Allocations</h3>
                <span className="caption">Direct 100% mappings and proportional split allocations</span>
              </div>
              <span className="caption">Total Accounts: {selectedEng.rows.length}</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Account Code</th>
                    <th>Account Name</th>
                    <th>Statement Line / Note</th>
                    <th>Allocation Breakdown</th>
                    <th>Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEng.rows.map(r => {
                    const targets = activeMappings.find(item => item.accountCode === r.code)?.targets || [];
                    const target = mappingTargets[r.code] ?? targets[0]?.statementLine ?? '';
                    const isSplit = targets.length > 1;
                    return (
                      <tr key={r.code}>
                        <td><span className="mono">{r.code}</span></td>
                        <td><b>{r.name}</b></td>
                        <td>
                          {isSplit ? (
                            <span className="tag blue">Split Allocation ({targets.length} targets)</span>
                          ) : (
                            <select
                              className="input"
                              aria-label={`Statement line for account ${r.code}`}
                              value={target}
                              onChange={e => setMappingTargets({ ...mappingTargets, [r.code]: e.target.value })}
                            >
                              <option value="">Unmapped</option>
                              {statementLines.map(line => <option key={line} value={line}>{line}</option>)}
                            </select>
                          )}
                        </td>
                        <td>
                          {targets.length ? (
                            <div className="stack" style={{ gap: 2 }}>
                              {targets.map((t, idx) => (
                                <span key={idx} className="cell-sub">
                                  {t.statementLine} ({t.percentage}% = {formatCurrency(r.balance * t.percentage / 100)})
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="tag amber">Unmapped</span>
                          )}
                        </td>
                        <td>{formatCurrency(r.balance)}</td>
                        <td>
                          <button
                            className="btn sm ghost"
                            onClick={() => {
                              const existingTargets = targets.length ? structuredClone(targets) : [{ statementLine: 'Operating expenses', percentage: 100 }];
                              setSplitModalAccount({
                                code: r.code,
                                name: r.name,
                                balance: r.balance,
                                targets: existingTargets.length > 1 ? existingTargets : [
                                  { statementLine: existingTargets[0]?.statementLine || 'Operating expenses', percentage: 50 },
                                  { statementLine: 'Other current assets', percentage: 50 }
                                ]
                              });
                            }}
                          >
                            {isSplit ? 'Edit Split' : 'Define Split'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Revision History */}
          {mappingHistory.length > 0 && (
            <div className="panel panel-pad">
              <h4>Mapping Revision History</h4>
              <ul className="mt8" style={{ fontSize: 13, lineHeight: '1.8' }}>
                {mappingHistory.map(rev => (
                  <li key={rev.revision}>
                    <b>Revision {rev.revision}</b> — Status: <span className={`badge ${rev.status === 'Approved' ? 'green' : 'amber'}`}><StatusBadge status={rev.status} /></span>
                    {rev.preparedBy && ` · Prepared by: ${rev.preparedBy}`}
                    {rev.reviewedBy && ` · Approved by: ${rev.reviewedBy}`}
                    {` · Mapped Accounts: ${rev.mappings.length}/${selectedEng.rows.length}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Split Allocation Modal */}
          {splitModalAccount && (
            <div className="modal-backdrop" data-dismiss-guard="explicit">
              <div className="modal-content" style={{ maxWidth: 640 }}>
                <div className="between mb16">
                  <h3>Split Account Allocation: {splitModalAccount.code}</h3>
                  <button className="btn sm ghost" onClick={() => setSplitModalAccount(null)}>✕</button>
                </div>
                <p className="sub mb12">
                  Account: <b>{splitModalAccount.name}</b> · Balance: <b>{formatCurrency(splitModalAccount.balance)}</b>
                </p>
                <div className="stack" style={{ gap: 8 }}>
                  {splitModalAccount.targets.map((target, idx) => (
                    <div key={idx} className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <select
                        className="input"
                        style={{ flex: 2 }}
                        value={target.statementLine}
                        onChange={e => {
                          const updated = [...splitModalAccount.targets];
                          updated[idx].statementLine = e.target.value;
                          setSplitModalAccount({ ...splitModalAccount, targets: updated });
                        }}
                      >
                        {statementLines.map(line => <option key={line} value={line}>{line}</option>)}
                      </select>
                      <input
                        type="number"
                        className="input"
                        style={{ width: 90 }}
                        min="1"
                        max="100"
                        value={target.percentage}
                        onChange={e => {
                          const updated = [...splitModalAccount.targets];
                          updated[idx].percentage = Number(e.target.value);
                          setSplitModalAccount({ ...splitModalAccount, targets: updated });
                        }}
                      />
                      <span>% ({formatCurrency(splitModalAccount.balance * target.percentage / 100)})</span>
                      {splitModalAccount.targets.length > 1 && (
                        <button
                          className="btn sm ghost text-danger"
                          onClick={() => {
                            const updated = splitModalAccount.targets.filter((_, i) => i !== idx);
                            setSplitModalAccount({ ...splitModalAccount, targets: updated });
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="btn sm ghost mt4"
                    onClick={() => {
                      setSplitModalAccount({
                        ...splitModalAccount,
                        targets: [...splitModalAccount.targets, { statementLine: 'Other current assets', percentage: 0 }]
                      });
                    }}
                  >
                    + Add Allocation Target Line
                  </button>
                </div>

                <div className="panel panel-pad mt16" style={{ background: '#f8fafc' }}>
                  <div className="between">
                    <b>Total Allocation:</b>
                    <b style={{ color: splitModalAccount.targets.reduce((sum, t) => sum + t.percentage, 0) === 100 ? '#16a34a' : '#dc2626' }}>
                      {splitModalAccount.targets.reduce((sum, t) => sum + t.percentage, 0)}%
                      {splitModalAccount.targets.reduce((sum, t) => sum + t.percentage, 0) === 100 ? ' (Conserved 100%)' : ' (Must total exactly 100%)'}
                    </b>
                  </div>
                </div>

                <div className="row mt16" style={{ justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn sm ghost" onClick={() => setSplitModalAccount(null)}>Cancel</button>
                  <button
                    className="btn sm primary"
                    disabled={splitModalAccount.targets.reduce((sum, t) => sum + t.percentage, 0) !== 100}
                    onClick={() => {
                      try {
                        const newMappings = selectedEng.rows.map(row => {
                          if (row.code === splitModalAccount.code) {
                            return { accountCode: row.code, targets: structuredClone(splitModalAccount.targets) };
                          }
                          const existing = activeMappings.find(m => m.accountCode === row.code);
                          return existing || { accountCode: row.code, targets: [{ statementLine: 'Operating expenses', percentage: 100 }] };
                        });
                        prototypeStore.saveAccountMappings(selectedEng.id, newMappings);
                        setSplitModalAccount(null);
                      } catch (err: any) {
                        alert(err.message);
                      }
                    }}
                  >
                    Save Split Allocation
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {/* Tab 4: Adjustments */}
      {activeTab === 'adjustments' && (
        <div className="stack" style={{ gap: 16 }}>
          {adjustmentNotice && <div role="status" className="panel panel-pad">{adjustmentNotice}</div>}
          <div className="panel panel-pad">
            <div className="between">
              <div>
                <h3>Proposed Audit Adjustments & Corrections</h3>
                <p className="sub">
                  Proposed correcting journals. State tracks whether the client reflected the adjustment in their source ledger.
                </p>
              </div>
              <button className="btn primary sm" onClick={openAdjustmentProposal}>
                <Icon name="plus" /> Propose Adjustment Journal
              </button>
            </div>
          </div>

          <div className="stack" style={{ gap: 12 }}>
            {state.adjustmentJournals.length === 0 && (
              <div className="panel panel-pad">
                <b>No adjustment journals proposed</b>
                <p className="sub">Use “Propose Adjustment Journal” to draft a balanced correcting journal. It then moves through independent technical review, a client management decision, reflection tracking, and reporting inclusion.</p>
              </div>
            )}
            {state.adjustmentJournals.map(adj => (
              <div key={adj.id} className="panel panel-pad">
                <div className="between">
                  <div>
                    <b>{adj.title}</b>
                    <div className="cell-sub">{adj.id} · Proposed by {adj.preparedBy}</div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className={`badge ${adj.status === 'Management accepted' || adj.status === 'Reporting included' ? 'green' : adj.status === 'Rejected' ? 'red' : 'amber'}`}>
                      <StatusBadge status={adj.status} /> · Rev {adj.revision || 1}
                    </span>
                    {adj.status !== 'Draft' && hasAnyRole(state, ['preparer', 'manager', 'partner']) && <button type="button" className="btn sm ghost" aria-label={`Amend adjustment ${adj.id}`} onClick={() => startAdjustmentAmendment(adj)}>Amend journal</button>}
                    {adj.status === 'Draft' && hasAnyRole(state, ['manager', 'reviewer', 'partner']) && (adj.preparedBy !== state.currentPerson || state.currentRole === 'superuser') && <button className="btn sm ghost" onClick={() => { try { prototypeStore.reviewAdjustmentJournal(adj.id, true); setAdjustmentNotice('Technical review recorded (superuser actions are logged as test overrides).'); } catch (error) { setAdjustmentNotice(error instanceof Error ? error.message : String(error)); } }}>Approve technical review</button>}
                    {adj.status === 'Draft' && hasAnyRole(state, ['manager', 'reviewer', 'partner']) && (adj.preparedBy !== state.currentPerson || state.currentRole === 'superuser') && <button className="btn sm ghost" onClick={() => { const reason = window.prompt('Technical-review rationale for returning this adjustment to the preparer:'); if (reason?.trim()) try { prototypeStore.reviewAdjustmentJournal(adj.id, false, reason); setAdjustmentNotice('Adjustment returned to the preparer with your rationale.'); } catch (error) { setAdjustmentNotice(error instanceof Error ? error.message : String(error)); } }}>Return for rework</button>}
                    {adj.status === 'Management accepted' && hasAnyRole(state, ['manager', 'reviewer', 'partner']) && <button type="button" className="btn sm ghost" aria-label={`Record reporting inclusion for ${adj.id}`} onClick={() => { try { prototypeStore.markAdjustmentJournalReportingIncluded(adj.id); setAdjustmentNotice('Adjustment recorded as included in reporting.'); } catch (error) { setAdjustmentNotice(error instanceof Error ? error.message : String(error)); } }}>Record as included in reporting</button>}
                    {['Management accepted', 'Reporting included'].includes(adj.status) && <div className="stack" style={{ gap: 6 }}><label>Reflection on TB v{selectedEng.sourceVersion}<select aria-label={`Reflection status for ${adj.id}`} value={adj.reflectionSourceVersion === selectedEng.sourceVersion ? adj.reflectionStatus : 'Unknown'} onChange={event => handleReflectionChange(adj, event.target.value as AdjustmentJournalItem['reflectionStatus'])}><option>Not reflected</option><option>Reflected in TB</option><option>Partially reflected</option><option>Unknown</option></select></label><label>Reflection evidence reference<div className="row"><input aria-label={`Reflection evidence reference for ${adj.id}`} value={reflectionEvidenceDrafts[adj.id] ?? adj.reflectionEvidenceRef ?? ''} onChange={event => setReflectionEvidenceDrafts(current => ({ ...current, [adj.id]: event.target.value }))} maxLength={160} /><button type="button" className="btn sm ghost" aria-label={`Save reflection evidence for ${adj.id}`} onClick={() => handleReflectionEvidenceSave(adj, reflectionEvidenceDrafts[adj.id] ?? adj.reflectionEvidenceRef ?? '')}>Save evidence</button></div></label></div>}
                  </div>
                </div>
                <div className="caption mt4">Source reflection: {adj.reflectionStatus} · {adj.reflectionSourceVersion === undefined ? 'unversioned source' : `TB v${adj.reflectionSourceVersion}`}{adj.reflectionSourceVersion !== undefined && adj.reflectionSourceVersion !== selectedEng.sourceVersion ? ' · re-review required' : ''} · Prepared by {adj.preparedBy}{adj.reviewedBy ? ` · Technical review by ${adj.reviewedBy}` : ''}{adj.managementAcceptedBy ? ` · Accepted by ${adj.managementAcceptedBy}` : ''}{adj.reportingIncludedBy ? ` · Reporting inclusion by ${adj.reportingIncludedBy}` : ''}</div>
                {adj.supportLinks && <div className="caption mt4" aria-label={`Pinned journal support for ${adj.id}`}><b>Support pinned:</b> {describeJournalSupport(adj.supportLinks)}</div>}
                {prototypeStore.getAdjustmentSupportIssue(adj.engagementId, adj.supportLinks) && <p className="caption mt4" role="alert">Pinned journal support needs attention: {prototypeStore.getAdjustmentSupportIssue(adj.engagementId, adj.supportLinks)} Amend the journal to select current in-scope revisions before fresh review.</p>}
                {adj.reviewNote && <div className="caption mt4">Technical-review rationale: {adj.reviewNote}</div>}
                {adj.managementDecisionNote && <div className="caption mt4">Management decision note: {adj.managementDecisionNote}</div>}

                <div className="tablewrap mt12">
                  <table>
                    <thead>
                      <tr>
                        <th>Account Code</th>
                        <th>Account Name</th>
                        <th>Debit (QAR)</th>
                        <th>Credit (QAR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adj.lines.map((l, i) => (
                        <tr key={i}>
                          <td><span className="mono">{l.accountCode}</span></td>
                          <td>{l.accountName}</td>
                          <td>{(l.debit || 0) > 0 ? formatCurrency(l.debit || 0) : '—'}</td>
                          <td>{(l.credit || 0) > 0 ? formatCurrency(l.credit || 0) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {adj.rationale && (
                  <div className="cell-sub mt8">
                    <strong>Rationale:</strong> {adj.rationale}
                  </div>
                )}
                {Boolean(adj.amendmentHistory?.length) && <details className="mt8"><summary>Prior journal revisions ({adj.amendmentHistory!.length})</summary>{adj.amendmentHistory!.map(version => <div className="borderbox mt8" key={version.revision}><b>Revision {version.revision} · <StatusBadge status={version.status} /></b><div className="caption">Amended by {state.users.find(user => user.id === version.amendedByUserId)?.name || version.amendedByUserId} on {new Date(version.amendedAt).toLocaleString()} · {version.reason}</div><div>{version.title} · {version.reflectionStatus} on TB v{version.reflectionSourceVersion ?? '—'}{version.reflectionEvidenceRef ? ` · Evidence ${version.reflectionEvidenceRef}` : ''}</div><div className="caption">{version.lines.map(line => `${line.accountCode} ${line.type} ${formatCurrency(line.amount, selectedEng.currency)}`).join(' · ')}{version.rationale ? ` · ${version.rationale}` : ''}</div><div className="caption">Prior support pins: {describeJournalSupport(version.supportLinks)}</div>{(version.reviewedBy || version.managementAcceptedBy || version.managementDecisionNote) && <div className="caption">Prior decision: reviewer {version.reviewedBy || '—'} · management {version.managementAcceptedBy || '—'}{version.managementDecisionNote ? ` · ${version.managementDecisionNote}` : ''}</div>}</div>)}</details>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Reconciliations */}
      {activeTab === 'reconciliations' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="between"><div><h3>Manual reconciliation schedules</h3><p className="sub">Sign convention: statement balance + signed timing items = trial-balance account balance. Proposed corrections never clear the residual.</p></div><button className="btn primary sm" onClick={() => setRecDraft({ name: '', ref: '', accountCode: selectedEng.rows[0]?.code, status: 'Draft', evidence: '', asOfDate: state.asOfDate, sourceVersion: selectedEng.sourceVersion, currency: selectedEng.currency, statementBalance: 0, items: [] })}>New Schedule</button></div>
          {recNotice && <div role="status" className="panel panel-pad">{recNotice}</div>}
          {recDraft && <form className="panel panel-pad stack" onSubmit={event => { event.preventDefault(); try { prototypeStore.saveReconciliationSchedule(selectedEng.id, recDraft); setRecDraft(null); setRecNotice('Schedule saved as a new draft revision.'); } catch (error) { setRecNotice(error instanceof Error ? error.message : String(error)); } }}>
            <h3>{recDraft.id ? `Edit ${recDraft.ref}` : 'Create reconciliation schedule'}</h3>
            <div className="grid2"><label>Schedule name<input aria-label="Reconciliation name" className="input" required value={recDraft.name} onChange={event => setRecDraft({ ...recDraft, name: event.target.value })} /></label><label>Trial balance account<select aria-label="Reconciliation account" className="input" value={recDraft.accountCode || ''} onChange={event => setRecDraft({ ...recDraft, accountCode: event.target.value })}>{selectedEng.rows.map(row => <option key={row.code} value={row.code}>{row.code} · {row.name}</option>)}</select></label></div>
            <div className="grid2"><label>As-of date<input aria-label="Reconciliation as-of date" className="input" type="date" required value={recDraft.asOfDate || ''} onChange={event => setRecDraft({ ...recDraft, asOfDate: event.target.value })} /></label><label>Supporting statement balance ({selectedEng.currency})<input aria-label="Reconciliation statement balance" className="input" type="number" step="0.01" required value={recDraft.statementBalance ?? recDraft.supportingBalance ?? ''} onChange={event => setRecDraft({ ...recDraft, statementBalance: Number(event.target.value) })} /></label></div>
            <label>Schedule evidence reference<input aria-label="Reconciliation evidence" className="input" required value={recDraft.evidence} onChange={event => setRecDraft({ ...recDraft, evidence: event.target.value })} /></label>
            <div className="between"><h4>Reconciling items</h4><button type="button" className="btn sm" onClick={() => setRecDraft({ ...recDraft, items: [...(recDraft.items || []), { id: `RI-${crypto.randomUUID()}`, date: recDraft.asOfDate || state.asOfDate, description: '', amount: 0, type: 'Timing item' }] })}>Add item</button></div>
            {(recDraft.items || []).map((item, index) => <fieldset className="borderbox grid2" key={item.id}><legend>Item {index + 1}</legend><label>Description<input aria-label={`Reconciliation item description ${index + 1}`} className="input" value={item.description} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, description: event.target.value } : value) })} required /></label><label>Date<input aria-label={`Reconciliation item date ${index + 1}`} className="input" type="date" value={item.date} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, date: event.target.value } : value) })} required /></label><label>Signed amount ({selectedEng.currency})<input aria-label={`Reconciliation item amount ${index + 1}`} className="input" type="number" step="0.01" value={item.amount} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, amount: Number(event.target.value) } : value) })} required /></label><label>Item type<select aria-label={`Reconciliation item type ${index + 1}`} className="input" value={item.type} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, type: event.target.value as 'Timing item' | 'Proposed correction' } : value) })}><option>Timing item</option><option>Proposed correction</option></select></label><label>Evidence document ID<input aria-label={`Reconciliation item evidence ${index + 1}`} className="input" value={item.evidenceDoc || ''} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, evidenceDoc: event.target.value } : value) })} /></label>{item.type === 'Proposed correction' && <label>Linked adjustment journal ID<input aria-label={`Reconciliation item journal ${index + 1}`} className="input" value={item.journalId || ''} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, journalId: event.target.value } : value) })} /></label>}<button type="button" className="btn sm ghost" onClick={() => setRecDraft({ ...recDraft, items: recDraft.items!.filter((_, i) => i !== index) })}>Remove item</button></fieldset>)}
            <div className="row"><button className="btn primary sm" type="submit">Save Reconciliation Draft</button><button className="btn ghost sm" type="button" onClick={() => setRecDraft(null)}>Cancel</button></div>
          </form>}
          {(selectedEng.reconciliations || []).length === 0 && (
            <div className="panel panel-pad">
              <b>No reconciliation schedules for this engagement</b>
              <p className="sub">Use “New Schedule” to tie an external statement balance to a trial-balance account. Schedules move through draft, independent review, and reasoned return/rework, and become stale when a new trial-balance or GL source is committed.</p>
            </div>
          )}
          {(selectedEng.reconciliations || []).map((rec: any) => {
            const variance = calculateReconciliationVariance(rec);
            const glRollForward = glVerify.checks.find(check => check.accountCode === rec.accountCode);
            const hasOpeningBalance = Boolean(glRollForward && !glRollForward.missingOpening && !glRollForward.unmatchedAccount);
            return (
              <div key={rec.id || rec.ref} className="panel panel-pad">
                <div className="between">
                  <div>
                    <h3>{rec.title || rec.name}</h3>
                    <div className="cell-sub">Reconciliation Ref: {rec.id || rec.ref} · Account: {rec.accountCode || 'N/A'} · {rec.currency || selectedEng.currency} · As of {rec.asOfDate || selectedEng.period} · Source v{rec.sourceVersion ?? selectedEng.sourceVersion}</div>
                  </div>
                  <div className="stack"><span className={`badge ${rec.status === 'Approved' || rec.status === 'Cleared' ? 'green' : rec.status === 'Stale' ? 'red' : 'amber'}`}><StatusBadge status={rec.status} /></span><span className={`badge ${variance.isReconciled ? 'green' : 'amber'}`}>{variance.isReconciled ? `Reconciled (Residual ${formatCurrency(0, rec.currency || selectedEng.currency)})` : `Unexplained Diff: ${formatCurrency(variance.unexplainedDifference, rec.currency || selectedEng.currency)}`}</span></div>
                </div>

                <div className="info-grid mt16">
                  <div><label>General Ledger Balance</label><b>{formatCurrency(rec.glBalance ?? rec.sourceBalance ?? 0, rec.currency || selectedEng.currency)}</b></div>
                  <div><label>External Statement Balance</label><b>{formatCurrency(rec.statementBalance ?? rec.supportingBalance ?? 0, rec.currency || selectedEng.currency)}</b></div>
                  <div><label>Total Timing Adjustments</label><span>{formatCurrency(variance.timingSum, rec.currency || selectedEng.currency)}</span></div>
                  <div><label>Unexplained Variance</label><b>{formatCurrency(variance.unexplainedDifference, rec.currency || selectedEng.currency)}</b></div>
                  <div><label>GL Opening Balance</label><span>{hasOpeningBalance ? formatCurrency(glRollForward!.openingBalance, rec.currency || selectedEng.currency) : 'Unknown (no explicit opening balance)'}</span></div>
                  <div><label>GL Net Movement</label><span>{glRollForward ? formatCurrency(glRollForward.netMovement, rec.currency || selectedEng.currency) : 'Unavailable'}</span></div>
                  <div><label>GL Calculated Closing Balance</label><span>{hasOpeningBalance ? formatCurrency(glRollForward!.calculatedClosing, rec.currency || selectedEng.currency) : 'Unknown'}</span></div>
                </div>

                <h4 className="mt16">Timing / Reconciling Items</h4>
                <div className="tablewrap mt8">
                  <table>
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Type</th>
                        <th>Amount ({rec.currency || selectedEng.currency})</th>
                        <th>Evidence / Journal</th>
                        <th>Clearance Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rec.items || []).map((item: any) => (
                        <tr key={item.id}>
                          <td>{item.description}</td>
                          <td>{item.type}</td>
                          <td><b>{formatCurrency(item.amount, item.currency || rec.currency || selectedEng.currency)}</b></td>
                          <td>{item.evidenceDoc || 'Missing evidence'}{item.type === 'Proposed correction' && ` · ${item.journalId || 'No journal linked'}`}</td>
                          <td>{item.clearedDate || 'Outstanding'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row mt12">{rec.status !== 'Approved' && <button className="btn sm" onClick={() => setRecDraft({ ...rec, name: rec.name, asOfDate: rec.asOfDate || state.asOfDate, statementBalance: rec.statementBalance ?? rec.supportingBalance ?? 0, glBalance: rec.glBalance ?? rec.sourceBalance, sourceVersion: selectedEng.sourceVersion, items: structuredClone(rec.items || []) })}>{rec.status === 'Stale' ? 'Rework stale schedule' : 'Edit schedule'}</button>}{['Draft', 'Returned'].includes(rec.status) && <button className="btn sm primary" onClick={() => { try { prototypeStore.reviewReconciliationSchedule(selectedEng.id, rec.id, 'Approved'); setRecNotice('Independent approval recorded.'); } catch (error) { setRecNotice(error instanceof Error ? error.message : String(error)); } }}>Approve schedule</button>}{['Draft', 'Returned'].includes(rec.status) && <button className="btn sm ghost" onClick={() => { const reason = window.prompt('Reason for returning this reconciliation:'); if (reason?.trim()) try { prototypeStore.reviewReconciliationSchedule(selectedEng.id, rec.id, 'Returned', reason); } catch (error) { setRecNotice(error instanceof Error ? error.message : String(error)); } }}>Return for rework</button>}</div>
                {rec.reviewedByUserId && <p className="caption">Reviewed by {state.users.find(user => user.id === rec.reviewedByUserId)?.name || rec.reviewedByUserId} · {rec.reviewedAt}{rec.reviewNote ? ` · ${rec.reviewNote}` : ''}</p>}
                {rec.history?.length > 0 && <details><summary>Prior reconciliation revisions ({rec.history.length})</summary>{rec.history.map((version: any) => <div className="caption" key={`${version.revision}-${version.savedAt}`}>v{version.revision} · <StatusBadge status={version.status} /> · TB v{version.sourceVersion} · saved by {state.users.find(user => user.id === version.savedByUserId)?.name || version.savedByUserId}{version.reviewedByUserId ? ` · reviewed by ${state.users.find(user => user.id === version.reviewedByUserId)?.name || version.reviewedByUserId}` : ''}{version.reviewNote ? ` · review note: ${version.reviewNote}` : ''}</div>)}</details>}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Adjustment Modal */}
      {(showAddAdjModal || amendAdjustment) && (
        <div className="modal-backdrop" data-dismiss-guard="self" onClick={closeAdjustmentModal}>
          <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{amendAdjustment ? 'Amend ' + amendAdjustment.id + ' · Rev ' + ((amendAdjustment.revision || 1) + 1) : 'Propose Correcting Adjustment Journal'}</h2>
              <button type="button" className="icon-btn" aria-label="Close adjustment journal form" onClick={closeAdjustmentModal}>✕</button>
            </div>
            <form onSubmit={handleAddAdjustment}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Journal Title</label>
                  <input
                    type="text"
                    className="input"
                    value={adjTitle}
                    onChange={e => setAdjTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Debit Account</label>
                    <select
                      className="input"
                      value={adjDebitAccount}
                      onChange={e => setAdjDebitAccount(e.target.value)}
                    >
                      {selectedEng.rows.map(r => (
                        <option key={r.code} value={r.code}>{r.code} - {r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="caption">Credit Account</label>
                    <select
                      className="input"
                      value={adjCreditAccount}
                      onChange={e => setAdjCreditAccount(e.target.value)}
                    >
                      {selectedEng.rows.map(r => (
                        <option key={r.code} value={r.code}>{r.code} - {r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="caption">Adjustment Amount (QAR)</label>
                  <input
                    type="number"
                    className="input"
                    value={adjAmount}
                    onChange={e => setAdjAmount(Number(e.target.value))}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Audit Rationale</label>
                  <textarea
                    aria-label="Adjustment journal rationale"
                    className="input"
                    rows={3}
                    value={adjRationale}
                    onChange={e => setAdjRationale(e.target.value)}
                  />
                </div>
                <fieldset className="panel panel-pad stack" style={{ gap: 10 }}>
                  <legend className="caption">Supporting records · optional</legend>
                  <p className="sub">Links are restricted to this engagement and saved with exact revisions. If a source changes, amend the journal and obtain fresh review.</p>
                  <label htmlFor="adjustment-support-evidence">Evidence
                    <select id="adjustment-support-evidence" className="input" value={adjEvidenceId} onChange={event => { setAdjEvidenceId(event.target.value); setJournalFormNotice(''); }}>
                      <option value="">No evidence linked</option>
                      {engagementEvidence.map(({ evidence, document }) => {
                        const superseded = state.documents.some(item => item.supersedesDocumentId === document.id);
                        const eligible = evidence.adequacyStatus === 'Adequate' && evidence.version === document.version && !document.brokenLink && !superseded;
                        return <option key={evidence.id} value={evidence.id} disabled={!eligible}>{evidence.title || evidence.id} · {evidence.id} v{evidence.version} / {document.name} v{document.version}{eligible ? '' : ' · unavailable or stale'}</option>;
                      })}
                      {amendAdjustment?.supportLinks?.evidence && !engagementEvidence.some(item => item.evidence.id === amendAdjustment.supportLinks!.evidence!.id) && <option value={amendAdjustment.supportLinks.evidence.id} disabled>Prior pin {amendAdjustment.supportLinks.evidence.id} v{amendAdjustment.supportLinks.evidence.evidenceVersion} · unavailable</option>}
                    </select>
                  </label>
                  <label htmlFor="adjustment-support-workpaper">Workpaper
                    <select id="adjustment-support-workpaper" className="input" value={adjWorkpaperId} onChange={event => { setAdjWorkpaperId(event.target.value); setJournalFormNotice(''); }}>
                      <option value="">No workpaper linked</option>
                      {selectedEng.workpapers.map(workpaper => <option key={workpaper.id} value={workpaper.id} disabled={!workpaper.applicable || workpaper.status === 'Not applicable'}>{workpaper.title} · {workpaper.id} v{workpaper.version}{workpaper.status === 'Not applicable' ? ' · unavailable' : ''}</option>)}
                      {amendAdjustment?.supportLinks?.workpaper && !selectedEng.workpapers.some(item => item.id === amendAdjustment.supportLinks!.workpaper!.id) && <option value={amendAdjustment.supportLinks.workpaper.id} disabled>Prior pin {amendAdjustment.supportLinks.workpaper.id} v{amendAdjustment.supportLinks.workpaper.version} · unavailable</option>}
                    </select>
                  </label>
                  <label htmlFor="adjustment-support-finding">Finding
                    <select id="adjustment-support-finding" className="input" value={adjFindingId} onChange={event => { setAdjFindingId(event.target.value); setJournalFormNotice(''); }}>
                      <option value="">No finding linked</option>
                      {state.findings.filter(finding => finding.engagementId === selectedEng.id).map(finding => <option key={finding.id} value={finding.id}>{finding.title} · {finding.id} v{finding.revision || 1}</option>)}
                      {amendAdjustment?.supportLinks?.finding && !state.findings.some(item => item.id === amendAdjustment.supportLinks!.finding!.id && item.engagementId === selectedEng.id) && <option value={amendAdjustment.supportLinks.finding.id} disabled>Prior pin {amendAdjustment.supportLinks.finding.id} v{amendAdjustment.supportLinks.finding.revision} · unavailable</option>}
                    </select>
                  </label>
                  {journalFormNotice && <p className="caption" role="alert">{journalFormNotice}</p>}
                </fieldset>
                {amendAdjustment && <div><label className="caption">Reason for amendment</label><textarea aria-label="Adjustment amendment reason" className="input" rows={2} value={amendmentReason} onChange={e => setAmendmentReason(e.target.value)} required /></div>}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={closeAdjustmentModal}>Cancel</button>
                <button type="submit" className="btn primary sm">{amendAdjustment ? 'Save amended revision' : 'Propose Journal'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
