// Module 26: Multi-Entity Consolidation & Eliminations (VP-043 through VP-046)
import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, TrialBalanceRow } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasConsolidationGroupScope, isSuperuserRole, visibleEngagementIds } from '../../services/guards';
import { Icon } from '../common/Icons';
import { calculateConsolidatedBalanceSheet, formatCurrency } from '../../services/calculations';
import { artifactSha256, downloadVerifiedArtifact, persistArtifact } from '../../services/artifactStore';
import { consolidationOutputFingerprint } from '../../services/consolidationOutput';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

interface ConsolidationViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

const FxRateEditor: React.FC<{ group: NonNullable<ReturnType<typeof prototypeStore.getSnapshot>['consolidationGroups'][number]>; onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void }> = ({ group, onRegisterUnsavedForm }) => {
  const currencies = [...new Set(group.components.map(component => component.currency).filter(currency => currency !== (group.presentationCurrency || group.currency)))];
  const [currency, setCurrency] = useState(currencies[0] || '');
  const [rate, setRate] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('2026-09-23');
  const [notice, setNotice] = useState('');
  const saveRate = () => {
    try {
      if (!rate.trim()) return false;
      prototypeStore.updateConsolidationFxRate(group.id, currency, Number(rate), effectiveDate);
      setNotice(`${currency} closing rate saved.`);
      setRate('');
      return true;
    } catch (error: any) { setNotice(error.message); return false; }
  };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const key = `consolidation-fx-${group.id}`;
    const guard: UnsavedFormGuard = { label: 'Consolidation FX rate', isDirty: () => Boolean(rate.trim()), save: saveRate, discard: () => setRate('') };
    onRegisterUnsavedForm(guard, key);
    return () => onRegisterUnsavedForm(null, key);
  }, [rate, currency, effectiveDate, group.id, onRegisterUnsavedForm]);
  return <div className="panel panel-pad">
    <h3>Versioned closing rates</h3>
    <p className="sub">The supported synthetic profile translates every balance-sheet line at the entered closing rate. Average and historical translation methods are unsupported and produce no result.</p>
    {currencies.length === 0 ? <p className="caption">All components use the presentation currency; no foreign rate is required.</p> : <form className="grid4 mt12" onSubmit={event => { event.preventDefault(); saveRate(); }}>
      <label className="caption">Component currency<select className="input mt4" aria-label="FX component currency" value={currency} onChange={event => setCurrency(event.target.value)}>{currencies.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="caption">Closing rate to {group.presentationCurrency || group.currency}<input className="input mt4" aria-label="FX closing rate" type="number" min="0" step="any" required value={rate} onChange={event => setRate(event.target.value)} /></label>
      <label className="caption">Effective date<input className="input mt4" aria-label="FX effective date" type="date" required value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} /></label>
      <div className="row" style={{ alignItems: 'end' }}><button className="btn primary sm" type="submit">Save closing rate</button></div>
      {notice && <p role="status" className="caption" style={{ gridColumn: '1 / -1' }}>{notice}</p>}
    </form>}
    {currencies.map(value => <div className="borderbox panel-pad mt8" key={value}>
      <b>{value} → {group.presentationCurrency || group.currency}: {group.fxRates[value] ?? 'Missing rate'}</b>
      {(group.fxRateHistory?.[value] || []).map(item => <div className="caption" key={item.revision}>v{item.revision} · Closing · {item.effectiveDate} · {item.rate} · {item.changedBy}</div>)}
    </div>)}
  </div>;
};

type ConsolidationGroup = NonNullable<ReturnType<typeof prototypeStore.getSnapshot>['consolidationGroups'][number]>;

const eliminationApprovalIsCurrent = (group: ConsolidationGroup, elimination: ConsolidationGroup['eliminations'][number], state: ReturnType<typeof prototypeStore.getSnapshot>) => {
  if (elimination.status !== 'Approved' || elimination.approvedPerimeterRevision !== (group.perimeterRevision || 1) || !elimination.approvalEvidenceRef) return false;
  return group.components.every(component => {
    const source = state.engagements.find(item => item.id === component.componentId);
    const pin = elimination.approvedComponentPins?.find(item => item.componentId === component.componentId);
    const currency = component.currency;
    const rate = currency === (group.presentationCurrency || group.currency) ? 1 : group.fxRates[currency];
    const rateRevision = group.fxRateHistory?.[currency]?.length || 0;
    const approvedRate = elimination.approvedFxRates?.[currency];
    return Boolean(source && pin && pin.packageRevision === component.packageRevisionPinned && pin.packageRevision === source.packageRevision && pin.sourceVersion === source.sourceVersion && JSON.stringify(component.packageRows) === JSON.stringify(source.rows) && approvedRate?.rate === rate && approvedRate.revision === rateRevision);
  });
};

const EliminationEditor: React.FC<{ group: ConsolidationGroup; state: ReturnType<typeof prototypeStore.getSnapshot>; onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void }> = ({ group, state, onRegisterUnsavedForm }) => {
  const emptyDraft = () => ({ id: '', title: '', counterpartyA: group.components[0]?.componentId || '', counterpartyB: group.components[1]?.componentId || '', amount: '', debitAccount: '', creditAccount: '', explanation: '', evidenceRef: '', reason: '' });
  const [draft, setDraft] = useState(emptyDraft);
  const initialDraft = useRef(JSON.stringify(draft));
  const [reviewNote, setReviewNote] = useState('');
  const [reviewEvidence, setReviewEvidence] = useState('');
  const [notice, setNotice] = useState('');
  const saveDraft = () => {
    try {
      const amount = Number(draft.amount);
      const id = prototypeStore.saveConsolidationElimination(group.id, { id: draft.id, title: draft.title, counterpartyA: draft.counterpartyA, counterpartyB: draft.counterpartyB, amount, currency: group.presentationCurrency || group.currency, status: 'Draft', explanation: draft.explanation, evidenceRef: draft.evidenceRef, debitAccount: draft.debitAccount, creditAccount: draft.creditAccount, lines: [{ account: draft.debitAccount, type: 'debit', amount }, { account: draft.creditAccount, type: 'credit', amount }] }, draft.reason);
      setNotice(`Saved ${id} as a draft.`);
      const next = emptyDraft(); setDraft(next); initialDraft.current = JSON.stringify(next);
      return true;
    } catch (error: any) { setNotice(error.message); return false; }
  };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const draftKey = `consolidation-elimination-${group.id}`;
    const reviewKey = `consolidation-elimination-review-${group.id}`;
    onRegisterUnsavedForm({ label: 'Consolidation elimination', isDirty: () => JSON.stringify(draft) !== initialDraft.current, save: saveDraft, discard: () => { const next = emptyDraft(); setDraft(next); initialDraft.current = JSON.stringify(next); } }, draftKey);
    onRegisterUnsavedForm({ label: 'Consolidation elimination review', isDirty: () => Boolean(reviewNote || reviewEvidence), save: () => false, discard: () => { setReviewNote(''); setReviewEvidence(''); } }, reviewKey);
    return () => { onRegisterUnsavedForm(null, draftKey); onRegisterUnsavedForm(null, reviewKey); };
  }, [draft, reviewNote, reviewEvidence, group.id, onRegisterUnsavedForm]);
  const accounts = [...new Map(group.components.flatMap(component => component.packageRows || []).map(row => [row.code, row])).values()];
  const edit = (entry: ConsolidationGroup['eliminations'][number]) => { const next = { id: entry.id, title: entry.title, counterpartyA: entry.counterpartyA, counterpartyB: entry.counterpartyB, amount: String(entry.amount), debitAccount: entry.lines.find(line => line.type === 'debit')?.account || '', creditAccount: entry.lines.find(line => line.type === 'credit')?.account || '', explanation: entry.explanation, evidenceRef: entry.evidenceRef || '', reason: '' }; setDraft(next); initialDraft.current = JSON.stringify(next); };
  return <div className="borderbox panel-pad mt12">
    <h4>Manual elimination journal</h4>
    <p className="caption">Draft a group-only adjustment between the selected entities. It affects the group calculation only after an independent review bound to the current component pins and closing rates.</p>
    <form className="mt8" onSubmit={event => { event.preventDefault(); saveDraft(); }}>
      <div className="grid2">
        <label className="caption">Journal title<input className="input mt4" aria-label="Elimination title" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} required /></label>
        <label className="caption">Amount ({group.presentationCurrency || group.currency})<input className="input mt4" aria-label="Elimination amount" type="number" min="0.01" step="0.01" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} required /></label>
        <label className="caption">Counterparty A<select className="input mt4" aria-label="Elimination counterparty A" value={draft.counterpartyA} onChange={event => setDraft({ ...draft, counterpartyA: event.target.value })}>{group.components.map(component => <option key={component.componentId} value={component.componentId}>{component.legalEntityName} · {component.componentId}</option>)}</select></label>
        <label className="caption">Counterparty B<select className="input mt4" aria-label="Elimination counterparty B" value={draft.counterpartyB} onChange={event => setDraft({ ...draft, counterpartyB: event.target.value })}>{group.components.map(component => <option key={component.componentId} value={component.componentId}>{component.legalEntityName} · {component.componentId}</option>)}</select></label>
        <label className="caption">Debit account<select className="input mt4" aria-label="Elimination debit account" value={draft.debitAccount} onChange={event => setDraft({ ...draft, debitAccount: event.target.value })} required><option value="">Select account</option>{accounts.map(row => <option key={`debit-${row.code}`} value={row.code}>{row.code} · {row.name}</option>)}</select></label>
        <label className="caption">Credit account<select className="input mt4" aria-label="Elimination credit account" value={draft.creditAccount} onChange={event => setDraft({ ...draft, creditAccount: event.target.value })} required><option value="">Select account</option>{accounts.map(row => <option key={`credit-${row.code}`} value={row.code}>{row.code} · {row.name}</option>)}</select></label>
        <label className="caption">Reason<textarea className="input mt4" aria-label="Elimination reason" value={draft.explanation} onChange={event => setDraft({ ...draft, explanation: event.target.value })} required /></label>
        <label className="caption">Supporting evidence reference<input className="input mt4" aria-label="Elimination evidence reference" value={draft.evidenceRef} onChange={event => setDraft({ ...draft, evidenceRef: event.target.value })} required /></label>
        <label className="caption">Change rationale<input className="input mt4" aria-label="Elimination save rationale" value={draft.reason} onChange={event => setDraft({ ...draft, reason: event.target.value })} required /></label>
      </div>
      <button className="btn primary sm mt8" type="submit">{draft.id ? 'Save elimination revision' : 'Save elimination draft'}</button>
      {notice && <p role="status" className="caption mt8">{notice}</p>}
    </form>
    {group.eliminations.map(entry => <div className="borderbox panel-pad mt8" key={`review-${entry.id}`}>
      <div className="between"><b>{entry.id} · revision {entry.revision || 1} · {entry.status}</b>{(entry.status === 'Draft' || entry.status === 'Returned') && <button className="btn sm" type="button" onClick={() => edit(entry)}>Edit draft</button>}</div>
      {entry.status === 'Draft' && <button className="btn primary sm mt8" type="button" onClick={() => { try { prototypeStore.submitConsolidationElimination(group.id, entry.id); setNotice(`${entry.id} submitted for independent review.`); } catch (error: any) { setNotice(error.message); } }}>Submit elimination for review</button>}
      {entry.status === 'Submitted' && <p className="caption mt8">Submitted by {entry.submittedByUserId} · {entry.submittedAt ? new Date(entry.submittedAt).toLocaleString() : 'time unavailable'}</p>}
      {entry.status === 'Submitted' && <>
      <label className="caption mt8">Review rationale<input className="input mt4" aria-label={`Elimination review rationale ${entry.id}`} value={reviewNote} onChange={event => setReviewNote(event.target.value)} /></label>
      <label className="caption mt8">Review evidence reference<input className="input mt4" aria-label={`Elimination review evidence ${entry.id}`} value={reviewEvidence} onChange={event => setReviewEvidence(event.target.value)} /></label>
      <div className="row mt8"><button className="btn primary sm" type="button" onClick={() => { try { prototypeStore.reviewConsolidationElimination(group.id, entry.id, 'Approved', reviewNote, reviewEvidence); setNotice(`${entry.id} approved for perimeter revision ${group.perimeterRevision || 1}.`); setReviewNote(''); setReviewEvidence(''); } catch (error: any) { setNotice(error.message); } }}>Approve elimination</button><button className="btn sm" type="button" onClick={() => { try { prototypeStore.reviewConsolidationElimination(group.id, entry.id, 'Returned', reviewNote, reviewEvidence); setNotice(`${entry.id} returned with its review history retained.`); setReviewNote(''); setReviewEvidence(''); } catch (error: any) { setNotice(error.message); } }}>Return for rework</button></div>
      </>}
      {entry.reviewHistory?.map((review, index) => <div className="caption mt4" key={`${entry.id}-review-${index}`}>{review.status} by {review.changedBy}: {review.note} · {review.evidenceRef}</div>)}
    </div>)}
  </div>;
};

const PerimeterEditor: React.FC<{ group: ConsolidationGroup; onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void }> = ({ group, onRegisterUnsavedForm }) => {
  const snapshot = prototypeStore.getSnapshot();
  const periodYear = Number(group.period.match(/\d{4}/)?.[0]);
  const subComp = group.components.find(c => c.role === 'Subsidiary');
  const [reportingBasis, setReportingBasis] = useState(group.reportingBasis || '');
  const visible = visibleEngagementIds(snapshot);
  const candidates = snapshot.engagements.filter(e =>
    e.year === periodYear &&
    (visible === 'ALL' || visible.includes(e.id)) &&
    (e.lifecycleStatus || 'Active') === 'Active'
  );
  const [dates, setDates] = useState<Record<string, string>>(() => Object.fromEntries(group.components.map(c => [c.componentId, c.effectiveDate || ''])));
  const [subsidiaryId, setSubsidiaryId] = useState(subComp?.componentId || '');
  const [reason, setReason] = useState('');
  const [reviewEvidence, setReviewEvidence] = useState('');
  const [notice, setNotice] = useState('');
  const repinCurrentPackages = () => {
    try {
      const next = structuredClone(group);
      next.reportingBasis = reportingBasis as ConsolidationGroup['reportingBasis'];
      if (next.reportingBasis !== group.reportingBasis) for (const component of next.components) { component.status = 'Pending'; delete component.packageReview; }
      for (const component of next.components) {
        const engagement = snapshot.engagements.find(item => item.id === component.componentId);
        if (!engagement) throw new Error(`Engagement "${component.componentId}" is no longer available.`);
        component.packageRevisionPinned = engagement.packageRevision;
        component.packageRows = structuredClone(engagement.rows);
        component.status = 'Pending';
        delete component.packageReview;
      }
      prototypeStore.updateConsolidationGroup(next, { reason });
      setNotice('Current component package revisions pinned; prior snapshots remain in group history.');
    } catch (error: any) { setNotice(error.message); }
  };
  const reviewCurrentPackages = () => {
    try {
      if (!reviewEvidence.trim()) throw new Error('Record the supporting package review evidence reference.');
      const next = structuredClone(group);
      for (const component of next.components) {
        const engagement = snapshot.engagements.find(item => item.id === component.componentId);
        const client = snapshot.clients.find(item => item.id === engagement?.client);
        const basis = group.reportingBasis || client?.accountingProfile?.reportingBasis;
        if (!engagement || !basis || basis === 'Not selected' || component.packageRevisionPinned !== engagement.packageRevision || JSON.stringify(component.packageRows) !== JSON.stringify(engagement.rows)) throw new Error(`Pin the exact current source, basis and period for ${component.componentId} before review.`);
        component.status = 'Ready';
        component.packageReview = { componentId: component.componentId, packageRevision: component.packageRevisionPinned!, sourceVersion: engagement.sourceVersion, reportingBasis: basis, period: group.period, reviewedByUserId: snapshot.currentUserId, reviewedAt: new Date().toISOString(), evidenceRef: reviewEvidence.trim() };
      }
      prototypeStore.updateConsolidationGroup(next, { reason });
      setNotice('Pinned component packages reviewed against the selected basis and period.');
    } catch (error: any) { setNotice(error.message); }
  };
  const perimeterDraft = { reportingBasis, dates, subsidiaryId, reason, reviewEvidence };
  const initialPerimeterDraft = useRef(JSON.stringify(perimeterDraft));
  const save = (event?: React.FormEvent) => {
    event?.preventDefault();
    try {
      const next = structuredClone(group);
      for (const component of next.components) {
        const value = (dates[component.componentId] ?? '').trim();
        if (value) component.effectiveDate = value;
        else delete component.effectiveDate;
      }
      if (subsidiaryId !== subComp?.componentId) {
        const engagement = snapshot.engagements.find(e => e.id === subsidiaryId);
        if (!engagement) throw new Error(`Engagement "${subsidiaryId}" is not available as a subsidiary component.`);
        const clientName = snapshot.clients.find(c => c.id === engagement.client)?.name || engagement.client;
        const target = next.components.find(c => c.role === 'Subsidiary');
        if (!target) throw new Error('This group has no Subsidiary slot to replace.');
        target.componentId = engagement.id;
        target.legalEntityName = `${clientName} (Subsidiary)`;
        target.currency = engagement.currency;
        target.functionalCurrency = engagement.currency;
        delete target.effectiveDate;
        target.packageRevisionPinned = engagement.packageRevision;
        target.packageRows = structuredClone(engagement.rows);
        target.status = 'Pending';
        delete target.packageReview;
      }
      prototypeStore.updateConsolidationGroup(next, { reason });
      const saved = prototypeStore.getSnapshot().consolidationGroups.find(g => g.id === group.id);
      setNotice(`Perimeter revision ${saved?.perimeterRevision || 'updated'} saved; prior perimeter retained in history.`);
      initialPerimeterDraft.current = JSON.stringify(perimeterDraft);
      return true;
    } catch (error: any) { setNotice(error.message); return false; }
  };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const key = `consolidation-perimeter-${group.id}`;
    const guard: UnsavedFormGuard = {
      label: 'Consolidation perimeter',
      isDirty: () => JSON.stringify(perimeterDraft) !== initialPerimeterDraft.current,
      save: () => save(),
      discard: () => { setReportingBasis(group.reportingBasis || ''); setDates(Object.fromEntries(group.components.map(component => [component.componentId, component.effectiveDate || '']))); setSubsidiaryId(subComp?.componentId || ''); setReason(''); setReviewEvidence(''); }
    };
    onRegisterUnsavedForm(guard, key);
    return () => onRegisterUnsavedForm(null, key);
  }, [reportingBasis, dates, subsidiaryId, reason, reviewEvidence, group.id, group.perimeterRevision, onRegisterUnsavedForm]);
  const revert = (revision: number) => {
    try {
      prototypeStore.revertConsolidationPerimeter(group.id, revision, reason);
      const saved = prototypeStore.getSnapshot().consolidationGroups.find(g => g.id === group.id);
      setNotice(`Perimeter reverted; now at revision ${saved?.perimeterRevision}.`);
    } catch (error: any) { setNotice(error.message); }
  };
  return <div className="panel panel-pad mt16">
    <h3>Edit group perimeter</h3>
    <p className="sub">Current perimeter revision {group.perimeterRevision || 1}. The Parent slot is fixed for the supported profile; the Subsidiary slot accepts a same-period permitted engagement and re-pins its exact current package. Duplicate, wrong-period and out-of-scope selections are rejected with the recorded perimeter left unchanged. Replacing the component set returns approved eliminations to draft for re-review.</p>
    <form className="mt12" onSubmit={save}>
      <div className="grid2">
        {group.components.map(component => <label className="caption" key={component.componentId}>Effective date — {component.role} ({component.componentId})<input className="input mt4" aria-label={`Effective date for ${component.role} component`} placeholder="YYYY-MM-DD" value={dates[component.componentId] ?? ''} onChange={event => setDates({ ...dates, [component.componentId]: event.target.value })} /></label>)}
      </div>
      <div className="grid2 mt8">
        <label className="caption">Group reporting basis<select className="input mt4" aria-label="Group reporting basis" value={reportingBasis} onChange={event => setReportingBasis(event.target.value)}><option value="">Select a basis</option><option>IFRS</option><option>Local GAAP</option><option>Other</option></select></label>
        <label className="caption">Subsidiary component engagement<select className="input mt4" aria-label="Subsidiary component engagement" value={subsidiaryId} onChange={event => setSubsidiaryId(event.target.value)}>{candidates.map(e => <option key={e.id} value={e.id}>{e.id} · {snapshot.clients.find(c => c.id === e.client)?.name || e.client} · FY {e.year}</option>)}</select></label>
        <label className="caption">Reason for perimeter change or revert<input className="input mt4" aria-label="Reason for perimeter change" placeholder="e.g. Correct subsidiary to the in-scope 2026 engagement" value={reason} onChange={event => setReason(event.target.value)} /></label>
      </div>
      <label className="caption mt8">Package review evidence reference<input className="input mt4" aria-label="Package review evidence reference" value={reviewEvidence} onChange={event => setReviewEvidence(event.target.value)} placeholder="e.g. GROUP-PACKAGE-REVIEW-01" /></label>
      <div className="row mt12"><button className="btn primary sm" type="submit">Save perimeter revision</button><button className="btn sm" type="button" onClick={repinCurrentPackages}>Pin current component packages</button><button className="btn sm" type="button" onClick={reviewCurrentPackages}>Review pinned component packages</button></div>
      {notice && <p role="status" className="caption mt8">{notice}</p>}
    </form>
    {(group.perimeterHistory || []).length > 0 && <div className="mt16">
      <h4>Perimeter history</h4>
      {[...(group.perimeterHistory || [])].reverse().map(entry => <div className="borderbox panel-pad mt8" key={entry.revision}>
        <div className="between"><b>Revision {entry.revision}</b><span className="caption">{entry.changedBy} · {entry.changedAt}</span></div>
        <div className="caption mt4">{entry.reason} · Components: {entry.components.map(c => `${c.role} ${c.componentId}${c.effectiveDate ? ` from ${c.effectiveDate}` : ''}`).join('; ')}</div>
        <div className="row mt8"><button className="btn sm" type="button" aria-label={`Revert to perimeter revision ${entry.revision}`} disabled={entry.revision === group.perimeterRevision} onClick={() => revert(entry.revision)}>Revert to revision {entry.revision}</button></div>
      </div>)}
    </div>}
  </div>;
};

export const ConsolidationView: React.FC<ConsolidationViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'perimeter' | 'grid' | 'eliminations' | 'fx'>('grid');
  const [outputEvidence, setOutputEvidence] = useState('');
  const [outputReviewNote, setOutputReviewNote] = useState('');
  const [outputReviewEvidence, setOutputReviewEvidence] = useState('');
  const [outputNotice, setOutputNotice] = useState('');
  const initialOutputDraft = useRef(JSON.stringify({ outputEvidence, outputReviewNote, outputReviewEvidence }));
  useEffect(() => {
    const key = 'consolidation-output-draft';
    if (!onRegisterUnsavedForm) return;
    const guard: UnsavedFormGuard = {
      label: outputEvidence ? 'Consolidation output draft' : 'Consolidation output review draft',
      isDirty: () => Boolean(outputEvidence || outputReviewNote || outputReviewEvidence),
      save: async () => {
        if (!outputEvidence.trim()) {
          setOutputNotice('An independent review draft must be completed with Approve or Return before leaving.');
          return false;
        }
        return prepareGroupOutput();
      },
      discard: () => { setOutputEvidence(''); setOutputReviewNote(''); setOutputReviewEvidence(''); }
    };
    onRegisterUnsavedForm(guard, key);
    return () => onRegisterUnsavedForm(null, key);
  }, [outputEvidence, outputReviewNote, outputReviewEvidence, onRegisterUnsavedForm]);

  const group = state.consolidationGroups[0];
  if (!group) return <div className="panel panel-pad"><h3>No consolidation group is configured.</h3><p className="sub">Create a group and select its component packages before reviewing an output.</p></div>;

  const parentComp = group.components.find(c => c.role === 'Parent');
  const subComp = group.components.find(c => c !== parentComp && c.role);
  const parentEng = parentComp && state.engagements.find(e => e.id === parentComp.componentId);
  const subEng = subComp && state.engagements.find(e => e.id === subComp.componentId);
  const groupCurrency = group.presentationCurrency || group.currency;
  const fxRate = (component: NonNullable<typeof parentComp>) => component.currency === groupCurrency ? 1 : group.fxRates[component.currency];
  const missingRoles = (['Parent', 'Subsidiary'] as const).filter(role => !group.components.some(component => component.role === role));
  const supportedProfile = group.components.length === 2 && missingRoles.length === 0 && group.components.every(component => component.ownershipPercent === 100);
  if (!supportedProfile) return <div role="alert" className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
    <h3>Unsupported Consolidation Profile</h3>
    <p className="sub max-w-md mx-auto mt8">
      {missingRoles.length
        ? `The group perimeter is incomplete (missing ${missingRoles.join(' and ')}); add the required component before calculating consolidated balances.`
        : 'This prototype calculates only one Parent and one 100% owned Subsidiary. Other ownership methods produce no result.'}
    </p>
  </div>;
  const visibleIds = visibleEngagementIds(state);
  const namedGroupGranted = hasConsolidationGroupScope(state, group.id);
  const isGranted = (componentId: string) => namedGroupGranted || visibleIds === 'ALL' || visibleIds.includes(componentId);
  const fullyGranted = namedGroupGranted || group.components.every(component => isGranted(component.componentId));
  if (!fullyGranted) {
    const ungrantedRoles = group.components.filter(component => !isGranted(component.componentId)).map(component => component.role || 'Component').join(' and ');
    return (
      <div className="stack" style={{ gap: 20 }}>
        <div className="pagehead">
          <div>
            <h1>Group Consolidation Workbench</h1>
            <p>Wholly owned Parent + Subsidiary profile · scoped projection for your grant.</p>
          </div>
        </div>
        <div className="panel panel-pad">
          <span className="eyebrow">CONSOLIDATION GROUP · {group.id}</span>
          <h2>{group.name}</h2>
          <p className="sub">Presentation Currency: {groupCurrency} · Period: {group.period} · Perimeter revision {group.perimeterRevision || 1}</p>
          <div role="alert" className="panel panel-pad mt16" style={{ background: '#fffbeb', color: '#92400e' }}>
            <b>Consolidated output is unavailable under your scoped grant.</b>
            <div className="sub mt4">Component {ungrantedRoles} is outside your grant. Group figures, eliminations, rates and perimeter editing require both pinned snapshots, and adding this component does not expand your access to its unrelated engagements.</div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Group Entity Perimeter</h3>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Client Entity</th>
                  <th>Role</th>
                  <th>Ownership %</th>
                  <th>Effective Date</th>
                  <th>Functional Currency</th>
                  <th>Pinned Reporting Package</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {group.components.map((c: any) => {
                  if (!isGranted(c.componentId)) return (
                    <tr key={c.componentId}>
                      <td><b>Restricted component</b></td>
                      <td><span className="tag gray">{c.role || 'Component'}</span></td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                      <td>—</td>
                      <td><span className="badge amber">Outside your scoped grant</span></td>
                    </tr>
                  );
                  const componentEngagement = state.engagements.find(e => e.id === c.componentId);
                  const clientRecord = state.clients.find(x => x.id === componentEngagement?.client);
                  return (
                    <tr key={c.componentId}>
                      <td><b>{clientRecord?.name || c.legalEntityName || c.componentId}</b></td>
                      <td><span className="tag gray">{c.role || 'Component'}</span></td>
                      <td>{c.ownershipPercent ?? c.ownershipPct ?? 100}%</td>
                      <td>{c.effectiveDate || '—'}</td>
                      <td>{c.functionalCurrency || c.currency}</td>
                      <td><b>Package Rev {c.pinnedPackageRev ?? c.packageRevisionPinned ?? 1}</b></td>
                      <td><span className={`badge ${c.packageRows ? 'green' : 'red'}`}>{c.packageRows ? 'Pinned snapshot' : 'Missing snapshot'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
  const missingPackage = !parentComp?.packageRows?.length || !subComp?.packageRows?.length || !parentEng || !subEng || !parentComp.packageRevisionPinned || !subComp.packageRevisionPinned;
  const missingRate = !missingPackage && (!Number.isFinite(fxRate(parentComp!)) || fxRate(parentComp!) <= 0 || !Number.isFinite(fxRate(subComp!)) || fxRate(subComp!) <= 0);
  const incompatibleBasis = group.components.filter(component => state.clients.find(client => client.id === state.engagements.find(engagement => engagement.id === component.componentId)?.client)?.accountingProfile?.reportingBasis !== group.reportingBasis);
  const unreviewedComponents = group.components.filter(component => component.status !== 'Ready' || !component.packageReview || component.packageReview.componentId !== component.componentId || component.packageReview.packageRevision !== component.packageRevisionPinned || component.packageReview.sourceVersion !== state.engagements.find(item => item.id === component.componentId)?.sourceVersion || component.packageReview.reportingBasis !== group.reportingBasis || component.packageReview.period !== group.period);
  const staleComponents = group.components.filter(component => {
    const current = state.engagements.find(engagement => engagement.id === component.componentId);
    return !current || component.packageRevisionPinned !== current.packageRevision || JSON.stringify(component.packageRows) !== JSON.stringify(current.rows);
  });

  if (missingPackage || missingRate || !group.reportingBasis || incompatibleBasis.length > 0) {
    const missingComponent = group.components.find(c => !state.engagements.some(e => e.id === c.componentId) || !c.packageRows?.length)?.componentId;
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="layers" size="xl" className="text-muted mb16" />
        <h3>{!group.reportingBasis || incompatibleBasis.length ? 'Reporting Basis Review Required' : missingPackage ? 'Pinned Component Package Required' : 'Currency Rate Required'}</h3>
        <p className="sub max-w-md mx-auto mt8">
          {!group.reportingBasis || incompatibleBasis.length
            ? `The group uses ${group.reportingBasis || 'no selected reporting basis'}; every component must use the same selected basis. Review ${incompatibleBasis.map(component => component.componentId).join(', ') || 'the group accounting setup'} before calculating.`
            : missingPackage
            ? missingRoles.length
              ? `The group perimeter is incomplete (missing ${missingRoles.join(' and ')}); add the required component before calculating consolidated balances.`
              : `Component ${missingComponent || '(unspecified)'} has no exact engagement and reporting-package snapshot.`
            : `No valid rate is configured to translate each component into ${groupCurrency}.`}
          {' '}Live engagement balances are never substituted for missing pinned data.
        </p>
        {missingRate && <div className="max-w-md mx-auto mt16"><FxRateEditor group={group} onRegisterUnsavedForm={onRegisterUnsavedForm} /></div>}
        {(missingPackage || incompatibleBasis.length > 0) && <button className="btn primary sm mt16" onClick={() => onNavigate(incompatibleBasis.length > 0 ? 'accounting-setup' : 'engagements')}>{incompatibleBasis.length > 0 ? 'Review Accounting Setup' : 'Go to Engagements'}</button>}
      </div>
    );
  }

  const translate = (rows: TrialBalanceRow[], rate: number) => rows.map(row => ({ ...row, balance: Math.round(row.balance * rate * 100) / 100 }));
  const staleEliminationApprovals = group.eliminations.filter(e => e.status === 'Approved' && !eliminationApprovalIsCurrent(group, e, state));
  const approvedEliminations = group.eliminations.filter(e => eliminationApprovalIsCurrent(group, e, state));
  const translatedParent = translate(parentComp!.packageRows!, fxRate(parentComp!));
  const translatedSub = translate(subComp!.packageRows!, fxRate(subComp!));
  const translationCheck = calculateConsolidatedBalanceSheet(translatedParent, translatedSub, []);
  const consolidated = calculateConsolidatedBalanceSheet(
    translatedParent,
    translatedSub,
    approvedEliminations
  );
  const parentClient = state.clients.find(c => c.id === parentEng!.client);
  const subClient = state.clients.find(c => c.id === subEng!.client);
  const lastPerimeterChange = (group.perimeterHistory || [])[(group.perimeterHistory || []).length - 1];
  const availableAccounts = new Set([...parentComp!.packageRows!, ...subComp!.packageRows!].flatMap(row => [row.code, row.name.toLowerCase()]));
  const unmatchedEliminationLines = approvedEliminations.flatMap(e => e.lines.filter(line => !availableAccounts.has(line.account) && !availableAccounts.has(line.account.trim().toLowerCase())).map(line => `${e.id}: ${line.account}`));
  const outputFingerprint = consolidationOutputFingerprint(group, state);
  const latestOutput = group.outputPackages?.at(-1);
  const outputIsCurrent = latestOutput?.fingerprint === outputFingerprint;
  const prepareGroupOutput = async (): Promise<boolean> => {
    try {
      if (!outputEvidence.trim()) throw new Error('Enter the group-output preparation evidence reference.');
      const payload = {
        schema: 'ste-auditsphere-group-output-v1',
        watermark: 'DEMO ONLY · SYNTHETIC PROTOTYPE DATA',
        group: { id: group.id, name: group.name, period: group.period, reportingBasis: group.reportingBasis, presentationCurrency: groupCurrency, perimeterRevision: group.perimeterRevision || 1 },
        components: group.components.map(component => ({ entityId: component.componentId, role: component.role, ownershipPercent: component.ownershipPercent, packageRevision: component.packageRevisionPinned, sourceVersion: state.engagements.find(item => item.id === component.componentId)?.sourceVersion, functionalCurrency: component.currency, closingRate: fxRate(component), rateRevision: group.fxRateHistory?.[component.currency]?.length || 0, rows: component.packageRows })),
        eliminations: group.eliminations.map(item => ({ id: item.id, revision: item.revision || 1, status: item.status, includedInOutput: approvedEliminations.some(approved => approved.id === item.id), counterparties: [item.counterpartyA, item.counterpartyB], amount: item.amount, currency: item.currency, lines: item.lines, evidenceRef: item.evidenceRef, approvalEvidenceRef: item.approvalEvidenceRef, approvedPerimeterRevision: item.approvedPerimeterRevision, approvedComponentPins: item.approvedComponentPins, approvedFxRates: item.approvedFxRates, reviewHistory: item.reviewHistory })),
        totals: { assets: consolidated.totalAssets, liabilities: consolidated.totalLiabilities, equity: consolidated.totalEquity, balanced: consolidated.isBalanced },
        // Balance-sheet lines carry the post-elimination current-period result; income-statement
        // lines are listed separately so a consumer summing `lines` never counts the result twice.
        lines: consolidated.lines.filter(line => line.category === 'asset' || line.category === 'liability' || line.category === 'equity'),
        incomeStatementLines: consolidated.lines.filter(line => line.category === 'revenue' || line.category === 'expense'),
        fingerprint: outputFingerprint
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const revision = (group.outputPackages?.length || 0) + 1;
      const record = { id: `GROUP-${group.id}-OUT-${revision}-${crypto.randomUUID()}`, revision, fingerprint: outputFingerprint, preparedByUserId: state.currentUserId, preparedAt: new Date().toISOString(), evidenceRef: outputEvidence.trim(), artifact: { id: `GROUP-${group.id}-OUT-${revision}`, name: `${group.id}-consolidated-output-r${revision}.json`, kind: 'GROUP_JSON' as const, mimeType: blob.type, size: blob.size, sha256: await artifactSha256(blob) }, status: 'Draft' as const, reviewHistory: [] };
      await persistArtifact(record.artifact, blob);
      prototypeStore.saveConsolidationOutputPackage(group.id, record);
      setOutputEvidence('');
      setOutputNotice(`Group output revision ${revision} saved for independent review.`);
      return true;
    } catch (error: any) { setOutputNotice(error.message); return false; }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Group Consolidation Workbench</h1>
          <p>Wholly owned Parent + Subsidiary profile · calculation from pinned component snapshots and approved manual eliminations.</p>
        </div>
      </div>

      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">CONSOLIDATION GROUP · {group.id}</span>
            <h2>{group.name}</h2>
          <p className="sub">Presentation Currency: {groupCurrency} · Basis: {group.reportingBasis} · Components: {group.components.length} · Period: {group.period}</p>
          </div>
          <span className="badge amber">Local calculation · not independently reviewed</span>
        </div>

        <div className="tabs mt16">
          <button className={`tab-btn ${activeTab === 'grid' ? 'active' : ''}`} onClick={() => setActiveTab('grid')}>
            Consolidated Balance Sheet Grid
          </button>
          <button className={`tab-btn ${activeTab === 'perimeter' ? 'active' : ''}`} onClick={() => setActiveTab('perimeter')}>
            Group Perimeter & Pinned Packages ({group.components.length})
          </button>
          <button className={`tab-btn ${activeTab === 'eliminations' ? 'active' : ''}`} onClick={() => setActiveTab('eliminations')}>
            Intercompany Eliminations ({group.eliminations.length})
          </button>
          <button className={`tab-btn ${activeTab === 'fx' ? 'active' : ''}`} onClick={() => setActiveTab('fx')}>
            Currency Translation (FX)
          </button>
        </div>
      </div>

      {/* Grid Tab */}
      {activeTab === 'grid' && (
        <div className="stack" style={{ gap: 16 }}>
          {staleComponents.length > 0 && <div role="alert" className="panel panel-pad" style={{ background: '#fffbeb', color: '#92400e' }}>
            <b>Stale component package pin</b>
            <div className="sub mt4">{staleComponents.map(component => `${component.role || 'Component'} ${component.componentId}`).join(', ')} has a newer source revision. Figures remain based on the exact pinned snapshot; review the perimeter and pin current component packages before relying on this output.</div>
          </div>}
          {staleEliminationApprovals.length > 0 && <div role="alert" className="panel panel-pad" style={{ background: '#fffbeb', color: '#92400e' }}>
            <b>Elimination re-review required</b>
            <div className="sub mt4">Approved entries {staleEliminationApprovals.map(entry => entry.id).join(', ')} no longer match the current perimeter, pinned component sources or FX rates. Their amounts are excluded until an independent reviewer approves the current revision.</div>
          </div>}
          {unreviewedComponents.length > 0 ? <div role="alert" className="panel panel-pad" style={{ background: '#fffbeb', color: '#92400e' }}>
            <b>Component Package Review Required</b>
            <div className="sub mt4">No consolidated figures are available until the current package revisions for {unreviewedComponents.map(component => `${component.role || 'Component'} ${component.componentId}`).join(', ')} are explicitly reviewed with an evidence reference under the selected basis and period.</div>
          </div> : <>
          {unmatchedEliminationLines.length > 0 && <div role="alert" className="panel panel-pad" style={{ background: '#fffbeb', color: '#92400e' }}>
            <b>Some approved elimination accounts do not match the pinned packages.</b>
            <div className="sub mt4">These lines were excluded from the calculation: {unmatchedEliminationLines.join('; ')}</div>
          </div>}
          <div className="panel panel-pad" style={{ background: consolidated.isBalanced ? '#f0fdf4' : '#fef2f2' }}>
            <div className="between">
              <div>
                <b>{consolidated.isBalanced ? 'Consolidated Balance Sheet Equation Satisfied (Net Zero)' : 'Consolidated Balance Discrepancy'}</b>
                <p className="sub" style={{ fontSize: 13, marginTop: 4 }}>
                  Consolidated Assets: {formatCurrency(consolidated.totalAssets)} · Consolidated Liabilities + Equity: {formatCurrency(consolidated.totalLiabilities + consolidated.totalEquity)}
                </p>
              </div>
              <span className={`badge ${consolidated.isBalanced ? 'green' : 'amber'}`}>
                {consolidated.isBalanced ? 'Balanced' : 'Imbalance'}
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Classification / Line Item</th>
                    <th style={{ textAlign: 'right' }}>{parentClient?.name || parentEng!.id} (v{parentComp!.packageRevisionPinned})</th>
                    <th style={{ textAlign: 'right' }}>{subClient?.name || subEng!.id} (v{subComp!.packageRevisionPinned})</th>
                    <th style={{ textAlign: 'right' }}>Eliminations</th>
                    <th style={{ textAlign: 'right' }}>Consolidated Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: '#f8fafc' }}><td colSpan={5}><b>ASSETS</b></td></tr>
                  {consolidated.lines.filter((l: any) => l.category === 'asset').map((l: any) => (
                    <tr key={l.code}>
                      <td>{l.name} ({l.code})</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(l.parentBalance)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(l.subsidiaryBalance)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {l.eliminationDebit !== 0 || l.eliminationCredit !== 0 ? (
                          <span style={{ color: 'red' }}>{formatCurrency(l.eliminationDebit - l.eliminationCredit)}</span>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}><b>{formatCurrency(l.consolidatedBalance)}</b></td>
                    </tr>
                  ))}
                  <tr>
                    <td><b>Total Assets</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.parentAssets)}</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.subsidiaryAssets)}</b></td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(consolidated.assetEliminationEffect)}</td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.totalAssets)}</b></td>
                  </tr>

                  <tr style={{ background: '#f8fafc' }}><td colSpan={5}><b>LIABILITIES</b></td></tr>
                  {consolidated.lines.filter((l: any) => l.category === 'liability').map((l: any) => (
                    <tr key={l.code}>
                      <td>{l.name} ({l.code})</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(-l.parentBalance)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(-l.subsidiaryBalance)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {l.eliminationDebit !== 0 || l.eliminationCredit !== 0 ? <span style={{ color: 'red' }}>{formatCurrency(l.eliminationCredit - l.eliminationDebit)}</span> : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}><b>{formatCurrency(-l.consolidatedBalance)}</b></td>
                    </tr>
                  ))}
                  <tr>
                    <td><b>Total Liabilities</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.parentLiabilities)}</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.subsidiaryLiabilities)}</b></td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(consolidated.liabilityEliminationEffect)}</td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.totalLiabilities)}</b></td>
                  </tr>

                  <tr style={{ background: '#f8fafc' }}><td colSpan={5}><b>EQUITY</b></td></tr>
                  {consolidated.lines.filter((l: any) => l.category === 'equity').map((l: any) => (
                    <tr key={l.code}>
                      <td>{l.name} ({l.code})</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(-l.parentBalance)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(-l.subsidiaryBalance)}</td>
                      <td style={{ textAlign: 'right' }}>{l.eliminationDebit !== 0 || l.eliminationCredit !== 0 ? <span style={{ color: 'red' }}>{formatCurrency(l.eliminationCredit - l.eliminationDebit)}</span> : '—'}</td>
                      <td style={{ textAlign: 'right' }}><b>{formatCurrency(-l.consolidatedBalance)}</b></td>
                    </tr>
                  ))}
                  <tr>
                    <td><b>Total Equity</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.parentEquity)}</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.subsidiaryEquity)}</b></td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(consolidated.equityEliminationEffect)}</td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.totalEquity)}</b></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel panel-pad">
            <h3>Consolidated output package</h3>
            <p className="sub">Prepare a revision-bound JSON output containing only this group, its pinned component rows, approved eliminations and rate history. A separate Partner must approve it before it is treated as reviewed.</p>
            {(!unreviewedComponents.length && !staleComponents.length && !staleEliminationApprovals.length && consolidated.isBalanced && !unmatchedEliminationLines.length) ? <>
              <label className="caption">Preparation evidence reference<input className="input mt4" aria-label="Group output preparation evidence" value={outputEvidence} onChange={event => setOutputEvidence(event.target.value)} /></label>
              <button className="btn primary sm mt8" onClick={() => void prepareGroupOutput()}>Prepare group output revision</button>
            </> : <p role="alert" className="caption">Resolve component review, stale package or elimination approvals, unmatched lines and balance issues before preparing a review package.</p>}
            {latestOutput && <div className="borderbox panel-pad mt12">
              <b>Revision {latestOutput.revision} · {outputIsCurrent ? latestOutput.status : 'Stale — rebuild required'}</b>
              <div className="caption mt4">Prepared by {latestOutput.preparedByUserId} · {latestOutput.evidenceRef} · SHA-256 {latestOutput.artifact.sha256}</div>
              {outputIsCurrent && latestOutput.status !== 'Approved' && (state.currentRole === 'partner' || isSuperuserRole(state.currentRole)) && (latestOutput.preparedByUserId !== state.currentUserId || isSuperuserRole(state.currentRole)) && <>
                <label className="caption mt8">Independent review rationale<input className="input mt4" aria-label="Group output review rationale" value={outputReviewNote} onChange={event => setOutputReviewNote(event.target.value)} /></label>
                <label className="caption mt8">Review evidence reference<input className="input mt4" aria-label="Group output review evidence" value={outputReviewEvidence} onChange={event => setOutputReviewEvidence(event.target.value)} /></label>
                <div className="row mt8"><button className="btn primary sm" onClick={() => { try { prototypeStore.reviewConsolidationOutputPackage(group.id, latestOutput.id, 'Approved', outputReviewNote, outputReviewEvidence); setOutputNotice('Group output independently approved.'); } catch (error: any) { setOutputNotice(error.message); } }}>Approve group output</button><button className="btn sm" onClick={() => { try { prototypeStore.reviewConsolidationOutputPackage(group.id, latestOutput.id, 'Returned', outputReviewNote, outputReviewEvidence); setOutputNotice('Group output returned with review history retained.'); } catch (error: any) { setOutputNotice(error.message); } }}>Return for rework</button></div>
              </>}
              {outputIsCurrent && latestOutput.status === 'Approved' && latestOutput.approvedFingerprint === outputFingerprint && <button className="btn sm mt8" onClick={() => void downloadVerifiedArtifact({ ...latestOutput.artifact, kind: 'GROUP_JSON' })}>Download verified group output</button>}
              {latestOutput.reviewHistory.map((item, index) => <div className="caption mt4" key={`${latestOutput.id}-${index}`}>{item.status} by {item.by} · {item.note} · {item.evidenceRef}</div>)}
            </div>}
            {outputNotice && <p role="status" className="caption mt8">{outputNotice}</p>}
          </div>
          </>}
        </div>
      )}

      {/* Perimeter Tab */}
      {activeTab === 'perimeter' && (
        <div className="stack" style={{ gap: 0 }}>
        <div className="panel">
          <div className="panel-head">
            <h3>Group Entity Perimeter</h3>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Client Entity</th>
                  <th>Role</th>
                  <th>Ownership %</th>
                  <th>Effective Date</th>
                  <th>Functional Currency</th>
                  <th>Pinned Reporting Package</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {group.components.map((c: any) => {
                  const componentEngagement = state.engagements.find(e => e.id === c.componentId);
                  const stale = !componentEngagement || c.packageRevisionPinned !== componentEngagement.packageRevision || JSON.stringify(c.packageRows) !== JSON.stringify(componentEngagement.rows);
                  const clientRecord = state.clients.find(x => x.id === componentEngagement?.client);
                  return (
                    <tr key={c.componentId || c.clientId}>
                      <td><b>{clientRecord?.name || c.legalEntityName || c.componentId}</b></td>
                      <td><span className="tag gray">{c.role || 'Component'}</span></td>
                      <td>{c.ownershipPercent ?? c.ownershipPct ?? 100}%</td>
                      <td>{c.effectiveDate || '—'}</td>
                      <td>{c.functionalCurrency || c.currency}</td>
                      <td><b>Package Rev {c.pinnedPackageRev ?? c.packageRevisionPinned ?? 1}</b><div className="cell-sub">{clientRecord?.accountingProfile?.reportingBasis || 'Basis not selected'} · review evidence: {c.packageReview?.evidenceRef || 'none'}</div></td>
                      <td><span className={`badge ${!c.packageRows ? 'red' : stale ? 'amber' : c.status === 'Ready' ? 'green' : 'amber'}`}>{!c.packageRows ? 'Missing snapshot' : stale ? 'Stale package pin' : c.status === 'Ready' ? 'Reviewed' : 'Review required'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <PerimeterEditor key={`${group.id}-rev-${group.perimeterRevision || 1}`} group={group} onRegisterUnsavedForm={onRegisterUnsavedForm} />
        {lastPerimeterChange && <p role="status" className="caption">Perimeter revision {group.perimeterRevision} saved — {lastPerimeterChange.reason} by {lastPerimeterChange.changedBy}.</p>}
        </div>
      )}

      {/* Eliminations Tab */}
      {activeTab === 'eliminations' && (
        <div className="panel panel-pad">
          <h3>Intercompany Elimination Entries</h3>
          <EliminationEditor group={group} state={state} onRegisterUnsavedForm={onRegisterUnsavedForm} />
          <div className="stack mt12" style={{ gap: 10 }}>
            {group.eliminations.map((e: any) => (
              <div key={e.id} className="borderbox" style={{ padding: 12 }}>
                <div className="between">
                  <b>{e.description || e.title}</b>
                  <b style={{ color: 'var(--teal-dark)' }}>{formatCurrency(e.amount, e.currency)}</b>
                </div>
                <div className="cell-sub mt8">
                  Debit: {e.debitAccount || e.counterpartyA} · Credit: {e.creditAccount || e.counterpartyB} · Status: {e.status === 'Approved' && !eliminationApprovalIsCurrent(group, e, state) ? 'Approved — re-review required' : e.status} · Evidence: {e.approvalEvidenceRef || e.evidenceRef || 'none'}
                </div>
                {e.status === 'Draft' && (e.reviewHistory || []).length > 0 && <div className="caption mt4" style={{ color: '#92400e' }}>
                  Re-review required: {e.reviewHistory[e.reviewHistory.length - 1].note} Prior approval and journal lines are preserved in history.
                </div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FX Tab */}
      {activeTab === 'fx' && (
        <div className="stack" style={{ gap: 12 }}>
          <FxRateEditor group={group} onRegisterUnsavedForm={onRegisterUnsavedForm} />
          <div className="panel panel-pad">
            <h3>Translation balancing check</h3>
            <p className="sub">Before group eliminations, translated assets less liabilities and equity: <b>{formatCurrency(Math.abs(translationCheck.totalAssets - (translationCheck.totalLiabilities + translationCheck.totalEquity)), groupCurrency)}</b>. {translationCheck.isBalanced ? 'Translated components reconcile.' : 'The difference remains unallocated; no plug is added.'}</p>
          </div>
          {group.components.map(component => {
            const rate = fxRate(component);
            const currentRate = (group.fxRateHistory?.[component.currency] || []).at(-1);
            return <div key={component.componentId} className="borderbox panel-pad">
              <div className="between"><span>{component.componentId} · {component.currency} to {groupCurrency}</span><b>{rate} ×</b></div>
              <div className="cell-sub">Pinned package revision {component.packageRevisionPinned} · basis {group.reportingBasis} · {currentRate ? `rate v${currentRate.revision}, ${currentRate.purpose}, effective ${currentRate.effectiveDate}` : 'presentation-currency rate 1'} · review {component.status === 'Ready' ? `accepted with ${component.packageReview?.evidenceRef}` : 'required'} · closing rate applies to each balance-sheet line</div>
              <div className="tablewrap mt8"><table>
                <thead><tr><th>Account / source amount ({component.currency})</th><th>Rate</th><th>Translated amount ({groupCurrency})</th><th>Rounding difference</th></tr></thead>
                <tbody>{(component.packageRows || []).map(row => {
                  const exact = row.balance * rate;
                  const translated = Math.round(exact * 100) / 100;
                  return <tr key={`${component.componentId}-${row.code}`}><td>{row.code} · {row.name} · {formatCurrency(row.balance, component.currency)}</td><td>{rate}</td><td>{formatCurrency(translated, groupCurrency)}</td><td>{(translated - exact).toFixed(4)}</td></tr>;
                })}</tbody>
              </table></div>
            </div>;
          })}
        </div>
      )}
    </div>
  );
};
