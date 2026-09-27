// Module 28: Audit Planning & Materiality (VP-048)
// ISA 320 quantitative materiality thresholds, versioned audit plan persistence,
// team section allocations, timing milestones, and independent plan review.

import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, AuditPlanRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole } from '../../services/guards';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { Icon } from '../common/Icons';
import { StatusBadge } from '../common/StatusBadge';
import { Notice, EmptyTableRow, EmptyState } from '../common/Feedback';
import { calculateMateriality, formatCurrency } from '../../services/calculations';
import { LifecyclePanel } from '../common/Lifecycle';
import { lifecycleById } from '../../services/lifecycles';

interface AuditPlanningViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const AuditPlanningView: React.FC<AuditPlanningViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const [activeTab, setActiveTab] = useState<'materiality' | 'team' | 'milestones' | 'history'>('materiality');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Existing plan if any
  const existingPlan = (state.auditPlans || []).filter(p => p.engagementId === selectedEng?.id).sort((a, b) => b.version - a.version)[0];
  const planHistory = (state.auditPlans || []).filter(p => p.engagementId === selectedEng?.id).sort((a, b) => b.version - a.version);

  // VP-048: quantitative assumptions start empty and must be entered deliberately.
  // Historical plans without captured component rates remain visible as history; their
  // missing rates are never inferred from rounded saved amounts.
  const [benchmarkType, setBenchmarkType] = useState<'profit' | 'revenue' | 'assets' | 'equity'>(
    (existingPlan?.benchmark as any) || 'revenue'
  );
  const [benchmarkValue, setBenchmarkValue] = useState<number | ''>(existingPlan?.benchmarkValue ?? '');
  const [percentage, setPercentage] = useState<number | ''>(existingPlan?.materialityRate ?? '');
  const [performanceRate, setPerformanceRate] = useState<number | ''>(existingPlan?.performanceMaterialityRate ?? '');
  const [trivialRate, setTrivialRate] = useState<number | ''>(existingPlan?.clearlyTrivialRate ?? '');
  const [scopeNotes, setScopeNotes] = useState(
    existingPlan?.rationales?.[0] || ''
  );

  const [teamAllocations, setTeamAllocations] = useState<AuditPlanRecord['teamAllocations']>(
    existingPlan?.teamAllocations || []
  );

  const [milestones, setMilestones] = useState<AuditPlanRecord['timingMilestones']>(
    existingPlan?.timingMilestones || []
  );

  const [significantAreas, setSignificantAreas] = useState(
    (existingPlan?.significantAreas || []).join(', ')
  );

  const [reviewNotes, setReviewNotes] = useState('');

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const hasValidCalculationInputs = benchmarkValue !== '' && Number.isFinite(Number(benchmarkValue)) && Number(benchmarkValue) > 0 &&
    percentage !== '' && Number.isFinite(Number(percentage)) && Number(percentage) > 0 && Number(percentage) <= 100 &&
    performanceRate !== '' && Number.isFinite(Number(performanceRate)) && Number(performanceRate) > 0 && Number(performanceRate) <= 100 &&
    trivialRate !== '' && Number.isFinite(Number(trivialRate)) && Number(trivialRate) >= 0 && Number(trivialRate) <= 100 &&
    Boolean(scopeNotes.trim());
  const materiality = !hasValidCalculationInputs
    ? null
    : calculateMateriality(
        Number(benchmarkValue),
        Number(percentage),
        Number(performanceRate),
        Number(trivialRate),
        scopeNotes.trim()
      );

  // VP-003: register the planning draft so route/persona/engagement changes cannot
  // silently drop deliberately entered work.
  const initialDraft = useRef(JSON.stringify({ benchmarkType, benchmarkValue, percentage, performanceRate, trivialRate, scopeNotes, teamAllocations, milestones, significantAreas, reviewNotes }));
  const draftSnapshot = () => JSON.stringify({ benchmarkType, benchmarkValue, percentage, performanceRate, trivialRate, scopeNotes, teamAllocations, milestones, significantAreas, reviewNotes });
  const resetDraft = () => {
    const initial = JSON.parse(initialDraft.current);
    setBenchmarkType(initial.benchmarkType);
    setBenchmarkValue(initial.benchmarkValue);
    setPercentage(initial.percentage);
    setPerformanceRate(initial.performanceRate);
    setTrivialRate(initial.trivialRate);
    setScopeNotes(initial.scopeNotes);
    setTeamAllocations(initial.teamAllocations);
    setMilestones(initial.milestones);
    setSignificantAreas(initial.significantAreas);
    setReviewNotes(initial.reviewNotes);
  };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const guard: UnsavedFormGuard = {
      label: 'Audit planning',
      isDirty: () => draftSnapshot() !== initialDraft.current,
      save: () => handleSavePlan(),
      discard: resetDraft,
    };
    onRegisterUnsavedForm(guard, 'audit-planning');
    return () => onRegisterUnsavedForm(null, 'audit-planning');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmarkType, benchmarkValue, percentage, performanceRate, trivialRate, scopeNotes, teamAllocations, milestones, significantAreas, reviewNotes, onRegisterUnsavedForm]);

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="target" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to calculate materiality and establish audit strategy.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const handleSavePlan = (): boolean => {
    try {
      if (benchmarkValue === '' || !Number.isFinite(Number(benchmarkValue)) || Number(benchmarkValue) <= 0) {
        throw new Error('Enter the benchmark value deliberately before saving; the form does not assume one.');
      }
      if (percentage === '' || !Number.isFinite(Number(percentage)) || Number(percentage) <= 0 || Number(percentage) > 100) {
        throw new Error('Enter an applied benchmark rate greater than 0 and no more than 100 percent.');
      }
      if (performanceRate === '' || !Number.isFinite(Number(performanceRate)) || Number(performanceRate) <= 0 || Number(performanceRate) > 100) {
        throw new Error('Enter a performance materiality rate greater than 0 and no more than 100 percent.');
      }
      if (trivialRate === '' || !Number.isFinite(Number(trivialRate)) || Number(trivialRate) < 0 || Number(trivialRate) > 100) {
        throw new Error('Enter a clearly trivial rate from 0 through 100 percent.');
      }
      if (!scopeNotes.trim()) {
        throw new Error('Record the planning rationale (ISA 320 basis) before saving; the form does not prefill one.');
      }
      if (!materiality) {
        throw new Error('Materiality cannot be calculated from the current inputs.');
      }
      const nextVersion = (existingPlan?.version || 0) + 1;
      const plan: AuditPlanRecord = {
        id: `PLAN-${selectedEng.id}-V${nextVersion}`,
        engagementId: selectedEng.id,
        version: nextVersion,
        status: 'Under review',
        benchmark: benchmarkType,
        benchmarkValue: Number(benchmarkValue),
        materialityRate: Number(percentage),
        performanceMaterialityRate: Number(performanceRate),
        clearlyTrivialRate: Number(trivialRate),
        overallMateriality: materiality.overallMateriality,
        performanceMateriality: materiality.performanceMateriality,
        clearlyTrivialThreshold: materiality.clearlyTrivialThreshold,
        rationales: scopeNotes.trim() ? [scopeNotes.trim()] : [],
        teamAllocations,
        timingMilestones: milestones,
        significantAreas: significantAreas.split(',').map(area => area.trim()).filter(Boolean),
        preparedBy: state.currentPerson,
        preparedAt: new Date().toISOString()
      };

      prototypeStore.saveAuditPlan(plan);
      triggerNotice('success', `Audit Plan Version ${nextVersion} saved and submitted for independent review.`);
      initialDraft.current = draftSnapshot();
      return true;
    } catch (err: any) {
      triggerNotice('error', err.message);
      return false;
    }
  };

  const handleReviewPlan = (approved: boolean) => {
    if (!existingPlan) return;
    try {
      if (!approved && !reviewNotes.trim()) {
        throw new Error('Record the rework reasons in the review notes before returning the plan.');
      }
      prototypeStore.reviewAuditPlan(existingPlan.id, approved, reviewNotes);
      triggerNotice('success', approved
        ? `Audit Plan ${existingPlan.id} approved by ${state.currentPerson}. The engagement planning gate is cleared for this version.`
        : `Audit Plan ${existingPlan.id} returned by ${state.currentPerson}. The planning gate remains open — address the recorded notes and resubmit a new version.`);
      initialDraft.current = draftSnapshot();
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Audit Planning & Materiality Determination</h1>
          <p>ISA 320 quantitative materiality thresholds, team allocations, timing milestones, and independent plan review.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => onNavigate('audit-risks')}>
            <Icon name="shield" /> Audit Risk Register
          </button>
              <button className="btn primary sm" onClick={handleSavePlan} disabled={!hasAnyRole(state, ['manager', 'preparer', 'partner'])}>
            <Icon name="check" /> Save Version {(existingPlan?.version || 0) + 1}
          </button>
        </div>
      </div>

      {notice && <Notice tone={notice.type} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {existingPlan ? <LifecyclePanel
        definition={lifecycleById('audit-plan')}
        subject={`${existingPlan.id} · Version ${existingPlan.version}`}
        status={existingPlan.status}
        returned={existingPlan.status === 'Draft' && Boolean(existingPlan.reviewNotes)}
        headingLevel="h4"
        facts={[
          { label: 'Prepared by', value: existingPlan.preparedBy || '—' },
          { label: 'Reviewed by', value: existingPlan.reviewedBy || (existingPlan.status === 'Under review' ? 'Awaiting manager/partner' : '—') },
          { label: 'Review notes', value: existingPlan.reviewNotes || '—' },
          { label: 'Superseded reason', value: existingPlan.supersededReason || '—' }
        ]}
        nextAction={existingPlan.status === 'Draft' ? 'Complete materiality, team and milestones, then submit the plan for review.' : existingPlan.status === 'Under review' ? 'A manager or partner independent of the preparer approves or returns this version.' : existingPlan.status === 'Approved' ? 'Proceed to risks and programs. A later risk change opens a new plan version; this approval stays in history.' : 'Superseded by a later version — open the latest version.'}
        downstream="Approved materiality drives sampling thresholds and finding classification; changing the plan creates a new version and never rewrites the approved one."
      /> : <div className="panel"><EmptyState title="No audit plan recorded yet" description="Enter benchmark, materiality rates, team allocations and milestones, then submit version 1 for independent review." /></div>}

      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'materiality' ? 'active' : ''}`} aria-pressed={activeTab === 'materiality'} onClick={() => setActiveTab('materiality')}>
          Materiality Strategy (ISA 320)
        </button>
        <button className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`} aria-pressed={activeTab === 'team'} onClick={() => setActiveTab('team')}>
          Team &amp; Section Allocations
        </button>
        <button className={`tab-btn ${activeTab === 'milestones' ? 'active' : ''}`} aria-pressed={activeTab === 'milestones'} onClick={() => setActiveTab('milestones')}>
          Timing &amp; Milestones ({milestones.length})
        </button>
        <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} aria-pressed={activeTab === 'history'} onClick={() => setActiveTab('history')}>
          Plan Versions &amp; Review ({existingPlan ? `v${existingPlan.version}` : 'Draft'})
        </button>
      </div>

      {/* Tab 1: Materiality */}
      {activeTab === 'materiality' && (
        <div className="panel panel-pad">
          <div className="between">
            <div>
              <span className="eyebrow">ISA 320 QUANTITATIVE BENCHMARK</span>
              <h2>{client?.name} · Materiality Strategy</h2>
              <p className="sub">Engagement: {selectedEng.id} · Currency: {selectedEng.currency} · Status: {existingPlan?.status || 'Draft'}</p>
            </div>
            <StatusBadge status={existingPlan?.status || 'Draft Plan'} />
          </div>

          <div className="grid3 mt20">
            <div>
              <label className="caption">Financial Benchmark Basis</label>
              <select
                aria-label="Financial benchmark basis"
                className="input"
                value={benchmarkType}
                onChange={e => setBenchmarkType(e.target.value as any)}
              >
                <option value="revenue">Annual Gross Revenue</option>
                <option value="profit">Profit Before Tax</option>
                <option value="assets">Total Balance Sheet Assets</option>
                <option value="equity">Net Equity</option>
              </select>
            </div>
            <div>
              <label className="caption">Benchmark Value ({selectedEng.currency}) *</label>
              <input
                type="number"
                className="input"
                aria-label="Benchmark value"
                placeholder="Enter deliberately — nothing is assumed"
                value={benchmarkValue}
                onChange={e => setBenchmarkValue(e.target.value === '' ? '' : Number(e.target.value))}
              />
              {client?.revenue != null && (
                <span className="caption">Client master-data reference: {formatCurrency(client.revenue, selectedEng.currency)} — confirm or replace with the filed figure.</span>
              )}
            </div>
            <div>
              <label className="caption">Applied Benchmark Rate (%) *</label>
              <input
                type="number"
                step={0.1}
                min={0.1}
                max={100}
                className="input"
                aria-label="Applied benchmark rate percentage"
                placeholder="Enter deliberately"
                value={percentage}
                onChange={e => setPercentage(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid3 mt12">
            <div>
              <label className="caption">Performance Materiality (% of Overall Materiality) *</label>
              <input
                type="number"
                step={1}
                min={1}
                max={100}
                className="input"
                aria-label="Performance materiality rate percentage"
                placeholder="Enter deliberately"
                value={performanceRate}
                onChange={e => setPerformanceRate(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <div>
              <label className="caption">Clearly Trivial Threshold (% of Overall Materiality) *</label>
              <input
                type="number"
                step={0.5}
                min={0}
                max={100}
                className="input"
                aria-label="Clearly trivial threshold percentage"
                placeholder="Enter deliberately"
                value={trivialRate}
                onChange={e => setTrivialRate(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <div>
              <label className="caption">Significant Areas (comma separated)</label>
              <input
                type="text"
                className="input"
                aria-label="Significant areas"
                placeholder="e.g. Revenue &amp; Receivables, Cash &amp; Bank"
                value={significantAreas}
                onChange={e => setSignificantAreas(e.target.value)}
              />
            </div>
          </div>

          <div className="panel panel-pad mt12" role="note" aria-label="Professional judgment notice">
            <b>Illustrative calculation — not a recommendation.</b>
            <p className="sub mt4">This calculator applies the assumptions you enter; it does not recommend a benchmark or threshold. Plan approval records workflow status only and does not confer professional authority or sign an audit conclusion.</p>
          </div>

          {/* Calculated Thresholds */}
          {materiality ? (
            <div className="metric-grid mt20">
              <div className="metric purple">
                <span className="metric-label">Overall Planning Materiality (PM)</span>
                <div className="metric-val">{formatCurrency(materiality.overallMateriality, selectedEng.currency)}</div>
                <span className="metric-sub">{percentage}% of {formatCurrency(Number(benchmarkValue), selectedEng.currency)}</span>
              </div>

              <div className="metric blue">
                <span className="metric-label">Performance Materiality (Haircut {materiality.performancePct}%)</span>
                <div className="metric-val">{formatCurrency(materiality.performanceMateriality, selectedEng.currency)}</div>
                <span className="metric-sub">Substantive testing threshold</span>
              </div>

              <div className="metric amber">
                <span className="metric-label">Clearly Trivial Threshold ({materiality.trivialPct}%)</span>
                <div className="metric-val">{formatCurrency(materiality.clearlyTrivialThreshold, selectedEng.currency)}</div>
                <span className="metric-sub">Differences below this are not accumulated</span>
              </div>
            </div>
          ) : (
            <div className="panel panel-pad mt20" role="status" style={{ background: '#fffbeb', borderLeft: '4px solid #d97706' }}>
              <b>Enter the benchmark, applied rate, performance rate, clearly trivial rate and rationale.</b>
              <p className="sub mt4">The form does not prefill any quantitative planning assumption. Overall, performance and clearly-trivial amounts appear after all inputs are deliberately entered.</p>
            </div>
          )}

          <div className="mt20">
            <label className="caption">Planning Strategy Memo &amp; Scope Rationales *</label>
            <textarea
              className="input"
              rows={3}
              aria-label="Planning strategy memo and scope rationale"
              placeholder="Record the ISA 320 basis for the benchmark, rate and thresholds — required before the plan can be saved."
              value={scopeNotes}
              onChange={e => setScopeNotes(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Tab 2: Team Allocations */}
      {activeTab === 'team' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Staff Resourcing &amp; Section Allocations</h3>
            <span className="caption">Target start and completion windows — entered deliberately, nothing is prefilled</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Team Member</th>
                  <th>Assigned Audit Role</th>
                  <th>Scheduled Start</th>
                  <th>Scheduled End</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {teamAllocations.length === 0 && (
                  <EmptyTableRow colSpan={6} variant="none" title="No team allocations recorded yet." description="Add the professionals deliberately assigned to this engagement." />
                )}
                {teamAllocations.map((alloc, idx) => (
                  <tr key={idx}>
                    <td><input aria-label={`Team member name ${idx + 1}`} className="input sm" value={alloc.person} onChange={e => setTeamAllocations(prev => prev.map((item, i) => i === idx ? { ...item, person: e.target.value } : item))} /></td>
                    <td><input aria-label={`Team member role ${idx + 1}`} className="input sm" value={alloc.role} onChange={e => setTeamAllocations(prev => prev.map((item, i) => i === idx ? { ...item, role: e.target.value } : item))} /></td>
                    <td><input aria-label={`Team member start ${idx + 1}`} type="date" className="input sm" value={alloc.scheduledStart} onChange={e => setTeamAllocations(prev => prev.map((item, i) => i === idx ? { ...item, scheduledStart: e.target.value } : item))} /></td>
                    <td><input aria-label={`Team member end ${idx + 1}`} type="date" className="input sm" value={alloc.scheduledEnd} onChange={e => setTeamAllocations(prev => prev.map((item, i) => i === idx ? { ...item, scheduledEnd: e.target.value } : item))} /></td>
                    <td><span className="badge green">Assigned</span></td>
                    <td><button className="btn sm ghost" aria-label={`Remove allocation ${idx + 1}`} onClick={() => setTeamAllocations(prev => prev.filter((_, i) => i !== idx))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row mt12">
            <button className="btn sm" onClick={() => setTeamAllocations(prev => [...prev, { person: '', role: '', scheduledStart: '', scheduledEnd: '' }])}>Add allocation</button>
          </div>
        </div>
      )}

      {/* Tab 3: Milestones */}
      {activeTab === 'milestones' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Engagement Timing &amp; Milestones</h3>
            <span className="caption">Deadlines mapped to deliverable commitments</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Phase / Milestone</th>
                  <th>Target Completion Date</th>
                  <th>Milestone Status</th>
                  <th>Action</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {milestones.length === 0 && (
                  <EmptyTableRow colSpan={5} variant="none" title="No timing milestones recorded yet." description="Add the phases this engagement commits to." />
                )}
                {milestones.map((m, idx) => (
                  <tr key={idx}>
                    <td><input aria-label={`Milestone phase ${idx + 1}`} className="input sm" value={m.phase} onChange={e => setMilestones(prev => prev.map((item, i) => i === idx ? { ...item, phase: e.target.value } : item))} /></td>
                    <td><input aria-label={`Milestone target date ${idx + 1}`} type="date" className="input sm" value={m.targetDate} onChange={e => setMilestones(prev => prev.map((item, i) => i === idx ? { ...item, targetDate: e.target.value } : item))} /></td>
                    <td>
                      <select aria-label={`Milestone status ${idx + 1}`} className="input sm" value={m.status} onChange={e => setMilestones(prev => prev.map((item, i) => i === idx ? { ...item, status: e.target.value as typeof m.status } : item))}>
                        <option value="Planned">Planned</option>
                        <option value="In progress">In progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </td>
                    <td>
                      {m.status !== 'Completed' && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            setMilestones(prev => prev.map((item, i) => i === idx ? { ...item, status: 'Completed' } : item));
                            triggerNotice('success', `Milestone "${m.phase}" marked as Completed.`);
                          }}
                        >
                          Mark Completed
                        </button>
                      )}
                    </td>
                    <td><button className="btn sm ghost" aria-label={`Remove milestone ${idx + 1}`} onClick={() => setMilestones(prev => prev.filter((_, i) => i !== idx))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row mt12">
            <button className="btn sm" onClick={() => setMilestones(prev => [...prev, { phase: '', targetDate: '', status: 'Planned' as const }])}>Add milestone</button>
          </div>
        </div>
      )}

      {/* Tab 4: Version History & Independent Review */}
      {activeTab === 'history' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel-pad">
            <h3>Independent Plan Review</h3>
            <p className="sub mt4">
              Audit strategy and materiality thresholds require a recorded review by someone other than the preparer.
            </p>

            <div className="borderbox mt16" style={{ padding: 16, background: '#f8fafc' }}>
              <div className="info-grid">
                <div><label>Plan ID</label><span className="mono">{existingPlan?.id || `PLAN-${selectedEng.id}`}</span></div>
                <div><label>Current Revision</label><b>v{existingPlan?.version || 1}</b></div>
                <div><label>Prepared By</label><span>{existingPlan?.preparedBy || state.currentPerson}</span></div>
                <div><label>Approval Status</label><b>{existingPlan?.status || 'Draft'}</b></div>
              </div>

              {existingPlan?.reviewedBy && (
                <div className="mt12">
                  <span className="badge green">Reviewed by {existingPlan.reviewedBy} on {new Date(existingPlan.reviewedAt || '').toLocaleDateString()}</span>
                  <div className="cell-sub mt4">Notes: {existingPlan.reviewNotes || 'Approved without exception.'}</div>
                </div>
              )}

              <div className="mt16">
                <label className="caption">Review Notes &amp; Sign-off Basis *</label>
                <textarea
                  className="input"
                  rows={2}
                  aria-label="Review notes and sign-off basis"
                  placeholder="Record the reviewer's basis — required for both approval and return."
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                />
              </div>

              <div className="row mt12" style={{ gap: 10 }}>
                <button
                  className="btn primary sm"
                  onClick={() => handleReviewPlan(true)}
                  disabled={!existingPlan || existingPlan.status !== 'Under review' || !hasAnyRole(state, ['manager', 'reviewer', 'partner'])}
                >
                  Approve Audit Plan Strategy
                </button>
                <button
                  className="btn sm ghost"
                  onClick={() => handleReviewPlan(false)}
                  disabled={!existingPlan || existingPlan.status !== 'Under review' || !hasAnyRole(state, ['manager', 'reviewer', 'partner'])}
                >
                  Return for Rework
                </button>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Saved Plan Revisions ({planHistory.length})</h3><span className="caption">Older revisions remain visible; only the latest approved revision clears planning.</span></div>
            <div className="tablewrap"><table><thead><tr><th>Version</th><th>Status</th><th>Prepared By</th><th>Reviewed By</th><th>Review Notes</th></tr></thead><tbody>
              {planHistory.map(plan => <tr key={plan.id}><td><b>v{plan.version}</b></td><td>{plan.status}</td><td>{plan.preparedBy || 'Unknown'}</td><td>{plan.reviewedBy || '—'}</td><td>{[plan.reviewNotes, plan.supersededReason].filter(Boolean).join(' · ') || '—'}</td></tr>)}
            </tbody></table></div>
          </div>
        </div>
      )}
    </div>
  );
};
