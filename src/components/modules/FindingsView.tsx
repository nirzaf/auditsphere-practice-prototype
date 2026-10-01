// Module 3: Audit findings and differences (VP-054)
import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, AuditFindingItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { StatusBadge } from '../common/StatusBadge';
import { formatCurrency } from '../../services/calculations';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { AdjustmentPanel } from '../target/AdjustmentPanel';

interface FindingsViewProps {
  onNavigate: (route: RouteKey, targetId?: string) => void;
  searchTargetId?: string;
  onBeforeContextChange: (run: () => void) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const FindingsView: React.FC<FindingsViewProps> = ({ onNavigate, searchTargetId, onBeforeContextChange, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const findings = state.findings.filter(item => item.engagementId === state.selectedEngagement);
  const [showAddModal, setShowAddModal] = useState(false);
  const [notice, setNotice] = useState('');
  const canDisposition = hasAnyRole(state, ['manager', 'reviewer', 'partner']);

  // New finding form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<AuditFindingItem['category']>('Monetary misstatement');
  const [severity, setSeverity] = useState<AuditFindingItem['severity']>('Material');
  const [accounts, setAccounts] = useState('1200 - Property, Plant & Equipment');
  const [amount, setAmount] = useState(28000);
  const [currency, setCurrency] = useState('QAR');
  const [condition, setCondition] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [managementResponse, setManagementResponse] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [proposedCorrection, setProposedCorrection] = useState('');
  const [owner, setOwner] = useState(state.currentPerson);
  const [assertion, setAssertion] = useState('Valuation');
  const [evidenceId, setEvidenceId] = useState('');
  const [procedureId, setProcedureId] = useState('');
  const [workpaperId, setWorkpaperId] = useState('');
  const [samplePopulationId, setSamplePopulationId] = useState('');
  const [sampleItemId, setSampleItemId] = useState('');
  const [journalId, setJournalId] = useState('');
  const [reviewNoteId, setReviewNoteId] = useState('');
  const engagement = state.engagements.find(item => item.id === state.selectedEngagement);
  const findingDraftBaseline = useRef('');
  const findingDraft = () => JSON.stringify({
    engagementId: state.selectedEngagement, title, category, severity, accounts, amount, currency, condition,
    recommendation, managementResponse, proposedCorrection, owner, assertion, evidenceId, procedureId,
    workpaperId, samplePopulationId, sampleItemId, journalId, reviewNoteId,
  });
  const discardFindingDraft = () => {
    if (!findingDraftBaseline.current) return;
    const draft = JSON.parse(findingDraftBaseline.current);
    setTitle(draft.title); setCategory(draft.category); setSeverity(draft.severity); setAccounts(draft.accounts);
    setAmount(draft.amount); setCurrency(draft.currency); setCondition(draft.condition); setRecommendation(draft.recommendation);
    setManagementResponse(draft.managementResponse); setProposedCorrection(draft.proposedCorrection); setOwner(draft.owner);
    setAssertion(draft.assertion); setEvidenceId(draft.evidenceId); setProcedureId(draft.procedureId); setWorkpaperId(draft.workpaperId);
    setSamplePopulationId(draft.samplePopulationId); setSampleItemId(draft.sampleItemId); setJournalId(draft.journalId); setReviewNoteId(draft.reviewNoteId);
  };
  const closeFindingModal = () => onBeforeContextChange(() => setShowAddModal(false));
  // Reset the inline submit-attempt error whenever the finding modal closes or reopens.
  useEffect(() => { if (!showAddModal) setSubmitAttempted(false); }, [showAddModal]);

  useEffect(() => {
    if (!showAddModal || !engagement) { onRegisterUnsavedForm(null, 'finding-create'); return; }
    onRegisterUnsavedForm({
      label: 'audit finding draft',
      isDirty: () => Boolean(findingDraftBaseline.current && findingDraft() !== findingDraftBaseline.current),
      save: () => commitFinding(),
      discard: discardFindingDraft,
    }, 'finding-create');
    return () => onRegisterUnsavedForm(null, 'finding-create');
  }, [showAddModal, state.selectedEngagement, title, category, severity, accounts, amount, currency, condition, recommendation, managementResponse, proposedCorrection, owner, assertion, evidenceId, procedureId, workpaperId, samplePopulationId, sampleItemId, journalId, reviewNoteId, onRegisterUnsavedForm]);
  if (!engagement) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="checkboard" size="xl" className="text-muted mb16" />
        <h3>No Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Findings are recorded per engagement. Select an engagement you are granted access to in order to raise and disposition findings.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }
  const approvedPlan = state.auditPlans?.filter(plan => plan.engagementId === state.selectedEngagement && plan.status === 'Approved').sort((a, b) => b.version - a.version)[0];
  const availableProcedures = state.auditPrograms.filter(program => program.engagementId === state.selectedEngagement || (!program.engagementId && state.selectedEngagement === state.engagements[0]?.id)).flatMap(program => program.procedures);
  const availableEvidence = state.evidenceCatalogue.filter(item => {
    const document = state.documents.find(candidate => candidate.id === item.documentId);
    return !!document && document.clientId === engagement?.client && (!document.engagementId || document.engagementId === state.selectedEngagement);
  });
  const availableSamples = state.samplePopulations.filter(population => population.engagementId === state.selectedEngagement).flatMap(population => population.items.filter(item => ['Exception noted', 'Exception'].includes(item.result)).map(item => ({ population, item })));

  const monetaryTotals = findings.filter(item => item.category === 'Monetary misstatement').reduce((totals, item) => {
    const key = item.currency || 'QAR';
    const total = totals.get(key) || { gross: 0, net: 0 };
    total.gross += item.grossMisstatement ?? Math.abs(item.amount || 0);
    total.net += item.netMisstatement ?? item.amount ?? 0;
    totals.set(key, total);
    return totals;
  }, new Map<string, { gross: number; net: number }>());

  const commitFinding = (): boolean => {
    try {
      prototypeStore.addFinding({
        engagementId: state.selectedEngagement, title: title.trim(), category, severity,
        financialStatementLine: accounts.trim(), affectedAccount: accounts.trim(), assertion,
        condition: condition.trim(), description: condition.trim(), recommendation: recommendation.trim(), owner,
        managementResponse: managementResponse.trim() || undefined, proposedCorrection: proposedCorrection.trim() || undefined,
        amount: category === 'Monetary misstatement' ? amount : undefined,
        currency: category === 'Monetary misstatement' ? currency : undefined,
        linkedEvidenceId: evidenceId || undefined, linkedProcedureId: procedureId || undefined,
        linkedWorkpaperId: workpaperId || undefined,
        linkedSamplePopulationId: samplePopulationId || undefined, linkedSampleItemId: sampleItemId || undefined,
        linkedJournalId: journalId || undefined, linkedReviewNoteId: reviewNoteId || undefined
      });
      setShowAddModal(false);
      setNotice('Finding saved with its source references.');
      return true;
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save finding.'); return false; }
  };
  const handleAddFinding = (event: React.FormEvent) => { event.preventDefault(); setSubmitAttempted(true); commitFinding(); };

  const handleDisposition = (finding: AuditFindingItem, disposition: AuditFindingItem['disposition']) => {
    const rationale = prompt(`Rationale for ${disposition}:`);
    if (rationale === null) return;
    try { prototypeStore.setFindingDisposition(finding.id, disposition, rationale); setNotice('Finding disposition and rationale recorded.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update finding.'); }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Audit Findings & Unadjusted Differences</h1>
          <p>ISA 450 evaluation of misstatements, control deficiencies, and management correction tracking.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => document.querySelector('[data-testid="adjustment-panel"]')?.scrollIntoView({ behavior: 'smooth' })}>
            <Icon name="calculator" /> Propose Journal
          </button>
          <button className="btn primary sm" onClick={() => { findingDraftBaseline.current = findingDraft(); setShowAddModal(true); }}>
            <Icon name="plus" /> Raise Finding
          </button>
        </div>
      </div>

      {notice && <div role="status" className="panel panel-pad">{notice}</div>}
      <AdjustmentPanel onRegisterUnsavedForm={onRegisterUnsavedForm} />

      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Identified Findings</span>
          <div className="metric-val">{findings.length}</div>
          <span className="metric-sub">Across all audit substantive areas</span>
        </div>
        <div className="metric amber">
          <span className="metric-label">Accumulated Monetary Errors</span>
          <div className="metric-val">{monetaryTotals.size ? [...monetaryTotals].map(([code, total]) => <div key={code}>{code} gross {formatCurrency(total.gross, code)} · net {formatCurrency(total.net, code)}</div>) : '—'}</div>
          <span className="metric-sub">Gross and signed net totals are separate by currency. Approved overall materiality {approvedPlan ? `(${engagement?.currency || 'QAR'} ${formatCurrency(approvedPlan.overallMateriality, engagement?.currency || 'QAR')})` : 'is not approved'} is context only; it does not determine finding disposition.</span>
        </div>
        <div className="metric purple">
          <span className="metric-label">Control Deficiencies</span>
          <div className="metric-val">{findings.filter(f => f.category === 'Internal control deficiency' || (f.category as any) === 'Control deficiency').length}</div>
          <span className="metric-sub">ISA 265 management letter items</span>
        </div>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        {findings.length === 0 && (
          <div className="panel panel-pad text-center" style={{ padding: '32px 20px' }}>
            <h3>No findings recorded for this engagement</h3>
            <p className="sub max-w-md mx-auto mt8">
              Raise a finding to record misstatements, control deficiencies, or disclosure omissions. Each disposition requires a rationale and feeds the package-validation and release gates.
            </p>
          </div>
        )}
        {findings.map(f => (
          <div key={f.id} data-search-target={f.id === searchTargetId ? 'true' : undefined} className="panel panel-pad" style={f.id === searchTargetId ? { outline: '2px solid var(--focus-ring)' } : undefined}>
            <div className="between">
              <div className="row" style={{ gap: 10 }}>
                <span className={`badge ${f.severity === 'Material' ? 'red' : f.severity === 'Significant' ? 'amber' : f.severity ? 'blue' : 'gray'}`}>
                  {f.severity || 'Unclassified'}
                </span>
                <div>
                  <h3>{f.title}</h3>
                  <div className="cell-sub">{f.id} · Category: {f.category || f.type || 'Not classified'} · Account: {f.financialStatementLine || f.affectedAccount || '—'}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <StatusBadge status={f.disposition} />
                {canDisposition ? (
                  <select className="input" aria-label={`Disposition for ${f.id}`} value={f.disposition} onChange={e => handleDisposition(f, e.target.value as AuditFindingItem['disposition'])}>
                    {['Uncorrected', 'Management agreed', 'Proposed for correction', 'Corrected by client', 'Corrected in TB', 'Waived as immaterial', 'Uncorrected waived'].map(value => <option key={value}>{value}</option>)}
                  </select>
                ) : (
                  <span className="caption">Dispositions are recorded by manager, reviewer, or partner roles</span>
                )}
              </div>
            </div>

            {f.category === 'Monetary misstatement' && (
              <div className="row mt12" style={{ gap: 20 }}>
                <div><span className="caption">Gross Misstatement:</span> <b>{formatCurrency(f.grossMisstatement ?? Math.abs(f.amount || 0), f.currency || 'QAR')}</b></div>
                <div><span className="caption">Signed Net Unadjusted:</span> <b>{formatCurrency(f.netMisstatement ?? f.amount ?? 0, f.currency || 'QAR')}</b></div>
              </div>
            )}

            <div className="borderbox mt12" style={{ padding: 12 }}>
              <b>Condition & Cause:</b>
              <p className="sub mt4">{f.condition || f.description || 'Not recorded'}</p>
              <b className="mt12" style={{ display: 'block' }}>Auditor Recommendation:</b>
              <p className="sub mt4">{f.recommendation || 'Not recorded'}</p>
              <p className="cell-sub">Assertion: {f.assertion || '—'} · Evidence: {f.linkedEvidenceId || '—'} · Procedure: {f.linkedProcedureId || '—'} · Workpaper: {f.linkedWorkpaperId || '—'} · Journal: {f.linkedJournalId || '—'} · Review: {f.linkedReviewNoteId || '—'}{f.linkedSampleItemId ? ` · Sample: ${f.linkedSamplePopulationId}/${f.linkedSampleItemId}` : ''}</p>
              {f.managementResponse && <p className="cell-sub">Management response: {f.managementResponse}</p>}
              {f.proposedCorrection && <p className="cell-sub">Proposed correction: {f.proposedCorrection}</p>}
              {(f.linkedWorkpaperId || f.linkedJournalId || f.linkedEvidenceId || f.linkedProcedureId || f.linkedSamplePopulationId) && <div className="handoff-bar mt8" aria-label={`Records linked to ${f.id}`}><span className="eyebrow">Linked records</span>
                {f.linkedWorkpaperId && <a className="btn sm" href="#reviews" onClick={event => { event.preventDefault(); onNavigate('reviews', f.linkedWorkpaperId); }}>Open workpaper {f.linkedWorkpaperId}</a>}
                {f.linkedJournalId && <a className="btn sm" href="#findings" onClick={event => { event.preventDefault(); onNavigate('findings'); }}>Open related journal {f.linkedJournalId}</a>}
                {f.linkedEvidenceId && <a className="btn sm" href="#evidence" onClick={event => { event.preventDefault(); onNavigate('evidence'); }}>View supporting evidence</a>}
                {f.linkedProcedureId && <a className="btn sm" href="#audit-risks" onClick={event => { event.preventDefault(); onNavigate('audit-risks'); }}>Open procedure {f.linkedProcedureId}</a>}
                {f.linkedSamplePopulationId && <a className="btn sm" href="#sampling" onClick={event => { event.preventDefault(); onNavigate('sampling'); }}>Open sample population</a>}
              </div>}
              {(f.dispositionHistory || []).map((event, index) => <p key={index} className="cell-sub">{event.from} → {event.disposition} · {event.rationale} · {event.actorId} · {new Date(event.at).toLocaleString()}</p>)}
            </div>
          </div>
        ))}
      </div>

      {/* Add Finding Modal */}
      {showAddModal && (
        <div className="modal-backdrop" data-dismiss-guard="self" onClick={event => { if (event.target === event.currentTarget) closeFindingModal(); }}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Raise Audit Finding</h2>
              <button className="icon-btn" onClick={closeFindingModal}>✕</button>
            </div>
            <form onSubmit={handleAddFinding}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Finding Title</label>
                  {submitAttempted && !title.trim() && <p className="field-error" role="alert">Finding title is required.</p>}
                    <input
                      type="text"
                      className="input"
                      aria-label="Finding title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Unreconciled inventory cutoff discrepancy"
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Category</label>
                    <select
                      className="input"
                      aria-label="Finding category"
                      value={category}
                      onChange={e => setCategory(e.target.value as any)}
                    >
                      <option value="Monetary misstatement">Monetary misstatement</option>
                      <option value="Internal control deficiency">Internal control deficiency</option>
                      <option value="Disclosure omission">Disclosure omission</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Severity</label>
                    <select
                      className="input"
                      aria-label="Finding severity"
                      value={severity}
                      onChange={e => setSeverity(e.target.value as any)}
                    >
                      <option value="Material">Material</option>
                      <option value="Significant">Significant</option>
                      <option value="Minor">Minor</option>
                      <option value="Trivial">Trivial</option>
                    </select>
                  </div>
                </div>
                {category === 'Monetary misstatement' && (
                  <div>
                    <label className="caption">Signed net difference</label>
                    <input
                      type="number"
                      className="input"
                      aria-label="Finding signed amount"
                      value={amount}
                      onChange={e => setAmount(Number(e.target.value))}
                      required
                    />
                    <select className="input" aria-label="Finding currency" value={currency} onChange={e => setCurrency(e.target.value)}><option>QAR</option><option>USD</option></select>
                  </div>
                )}
                <div>
                  <label className="caption">Financial Statement Line</label>
                  <input
                    type="text"
                    className="input"
                    value={accounts}
                    onChange={e => setAccounts(e.target.value)}
                  />
                </div>
                <div>
                  <label className="caption">Affected Assertion</label>
                  <select className="input" aria-label="Finding assertion" value={assertion} onChange={e => setAssertion(e.target.value)}>{['Existence', 'Completeness', 'Valuation', 'Rights and obligations', 'Presentation'].map(value => <option key={value}>{value}</option>)}</select>
                  <label className="caption">Condition & Cause</label>
                  <textarea
                    className="input"
                    aria-label="Finding condition"
                    rows={2}
                    value={condition}
                    onChange={e => setCondition(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Auditor Recommendation</label>
                  <textarea
                    className="input"
                    aria-label="Finding recommendation"
                    rows={2}
                    value={recommendation}
                    onChange={e => setRecommendation(e.target.value)}
                    required
                  />
                </div>
                <label className="caption">Linked procedure<select className="input" aria-label="Finding procedure" value={procedureId} onChange={e => setProcedureId(e.target.value)}><option value="">None</option>{availableProcedures.map(item => <option key={item.id} value={item.id}>{item.ref || item.id} · {item.title}</option>)}</select></label>
                <label className="caption">Linked evidence<select className="input" aria-label="Finding evidence" value={evidenceId} onChange={e => setEvidenceId(e.target.value)}><option value="">None</option>{availableEvidence.map(item => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></label>
                <label className="caption">Linked workpaper<select className="input" aria-label="Finding workpaper" value={workpaperId} onChange={e => setWorkpaperId(e.target.value)}><option value="">None</option>{engagement?.workpapers.map(item => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></label>
                <label className="caption">Linked sampled exception<select className="input" aria-label="Finding sample exception" value={sampleItemId ? `${samplePopulationId}/${sampleItemId}` : ''} onChange={e => { const [population, item] = e.target.value.split('/'); setSamplePopulationId(population || ''); setSampleItemId(item || ''); }}><option value="">None</option>{availableSamples.map(({ population, item }) => <option key={`${population.id}/${item.id}`} value={`${population.id}/${item.id}`}>{population.id} · {item.itemRef} · {item.result}</option>)}</select></label>
                <label className="caption">Linked adjustment journal<select className="input" aria-label="Finding journal" value={journalId} onChange={e => setJournalId(e.target.value)}><option value="">None</option>{state.adjustmentJournals.filter(item => item.engagementId === state.selectedEngagement).map(item => <option key={item.id} value={item.id}>{item.id} · {item.title} · {item.status}</option>)}</select></label>
                <label className="caption">Linked review point<select className="input" aria-label="Finding review point" value={reviewNoteId} onChange={e => setReviewNoteId(e.target.value)}><option value="">None</option>{engagement?.reviews.map(item => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></label>
                <label className="caption">Responsible owner<select className="input" aria-label="Finding owner" value={owner} onChange={e => setOwner(e.target.value)}>{state.users.filter(user => user.status === 'Active' && ['preparer','manager','partner','reviewer','eqr'].includes(user.role)).map(user => <option key={user.id}>{user.name}</option>)}</select></label>
                <label className="caption">Management response<textarea className="input" aria-label="Management response" value={managementResponse} onChange={e => setManagementResponse(e.target.value)} rows={2} /></label>
                <label className="caption">Proposed correction<textarea className="input" aria-label="Proposed correction" value={proposedCorrection} onChange={e => setProposedCorrection(e.target.value)} rows={2} /></label>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={closeFindingModal}>Cancel</button>
                <button type="submit" className="btn primary sm">Record Finding</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
