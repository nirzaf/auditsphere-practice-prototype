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
import { validateMaterialityRates, calculateMateriality, calculateBalanceSheet, calculateIncomeStatement, formatCurrency } from '../../services/calculations';
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
  const [managerRoundedPM, setManagerRoundedPM] = useState<number | ''>(existingPlan?.overallMateriality ?? '');
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

  // Practical rounding & risk stratification calculations per STE v2.1 spec
  const effectivePM = managerRoundedPM !== '' && Number.isFinite(Number(managerRoundedPM))
    ? Number(managerRoundedPM)
    : (materiality?.overallMateriality ?? 0);

  const roundingTolerancePct = materiality && materiality.overallMateriality > 0 && effectivePM > 0
    ? ((effectivePM - materiality.overallMateriality) / materiality.overallMateriality) * 100
    : 0;

  const isRoundingExceeded = Math.abs(roundingTolerancePct) > 5.0001;

  const effectiveTE = materiality && effectivePM > 0
    ? Math.round((Number(performanceRate) / 100) * effectivePM)
    : (materiality?.performanceMateriality ?? 0);

  const effectiveSAD = materiality && effectivePM > 0
    ? Math.round((Number(trivialRate) / 100) * effectivePM)
    : (materiality?.clearlyTrivialThreshold ?? 0);

  const tbRows = selectedEng?.rows || [];
  const bsCalc = React.useMemo(() => calculateBalanceSheet(tbRows), [tbRows]);
  const isCalc = React.useMemo(() => calculateIncomeStatement(tbRows), [tbRows]);

  const riskStratification = React.useMemo(() => {
    if (!effectiveTE || !effectivePM || !tbRows.length) return null;
    let greenCount = 0;
    let greenTotal = 0;
    let amberCount = 0;
    let amberTotal = 0;
    let redCount = 0;
    let redTotal = 0;

    for (const r of tbRows) {
      const bal = Math.abs(r.balance);
      const isCritical = /estimate|provision|fair value|impairment|ecl|expected credit loss|allowance|obsolesc|warranty|goodwill|contingenc|going concern/i.test(r.name) ||
        Boolean(r.mappedStatementLine && /estimate|provision|fair value|impairment|ecl|expected credit loss|allowance|obsolesc|warranty|goodwill|contingenc|going concern/i.test(r.mappedStatementLine));
      if (isCritical || bal > effectivePM) {
        redCount++;
        redTotal += bal;
      } else if (bal >= effectiveTE) {
        amberCount++;
        amberTotal += bal;
      } else {
        greenCount++;
        greenTotal += bal;
      }
    }

    return {
      greenCount, greenTotal,
      amberCount, amberTotal,
      redCount, redTotal,
      totalCount: tbRows.length
    };
  }, [effectiveTE, effectivePM, tbRows]);

  // VP-003: register the planning draft so route/persona/engagement changes cannot
  // silently drop deliberately entered work.
  const initialDraft = useRef(JSON.stringify({ benchmarkType, benchmarkValue, percentage, performanceRate, trivialRate, scopeNotes, teamAllocations, milestones, significantAreas, reviewNotes, managerRoundedPM }));
  const draftSnapshot = () => JSON.stringify({ benchmarkType, benchmarkValue, percentage, performanceRate, trivialRate, scopeNotes, teamAllocations, milestones, significantAreas, reviewNotes, managerRoundedPM });
  const resetDraft = () => {
    const initial = JSON.parse(initialDraft.current);
    setBenchmarkType(initial.benchmarkType);
    setBenchmarkValue(initial.benchmarkValue);
    setPercentage(initial.percentage);
    setPerformanceRate(initial.performanceRate);
    setTrivialRate(initial.trivialRate);
    setManagerRoundedPM(initial.managerRoundedPM ?? '');
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
  }, [benchmarkType, benchmarkValue, percentage, performanceRate, trivialRate, managerRoundedPM, scopeNotes, teamAllocations, milestones, significantAreas, reviewNotes, onRegisterUnsavedForm]);

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
      const pct = Number(percentage);
      const perf = Number(performanceRate);
      const triv = Number(trivialRate);
      if (percentage === '' || !Number.isFinite(pct) || pct <= 0) {
        throw new Error('Enter an applied benchmark rate.');
      }
      if (performanceRate === '' || trivialRate === '') throw new Error('Enter explicit TE and SAD rates.');
      validateMaterialityRates(benchmarkType, pct, perf, triv);
      if (isRoundingExceeded) {
        throw new Error(`Manager practical rounding exceeds the ±5.0% maximum limit (current: ${roundingTolerancePct > 0 ? '+' : ''}${roundingTolerancePct.toFixed(1)}%). Adjust rounding to within ±5% of ${formatCurrency(materiality?.overallMateriality || 0, selectedEng.currency)}.`);
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
        overallMateriality: effectivePM,
        performanceMateriality: effectiveTE,
        clearlyTrivialThreshold: effectiveSAD,
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
      if (approved && !hasAnyRole(state, ['partner'])) {
        throw new Error('Formal sign-off of the ISA 320 audit plan is retained strictly by the lead statutory audit partner.');
      }
      if (!approved && !reviewNotes.trim()) {
        throw new Error('Record the rework reasons in the review notes before returning the plan.');
      }
      prototypeStore.reviewAuditPlan(existingPlan.id, approved, reviewNotes);
      triggerNotice('success', approved
        ? `Audit Plan ${existingPlan.id} approved by Partner ${state.currentPerson}. The engagement planning gate is cleared for this version.`
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

          <div className="banner info mt12" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', padding: '10px 14px' }}>
            <span><strong>ISA 320 Benchmark Standards:</strong></span>
            <span>Profit Before Tax: <strong>5.0% – 10.0%</strong></span>
            <span>Total Revenue: <strong>0.5% – 2.0%</strong></span>
            <span>Total Assets: <strong>0.5% – 1.0%</strong></span>
            <span>Net Equity: <strong>1.0% – 2.0%</strong></span>
            <span>Tolerable Error (TE): <strong>50% – 75%</strong></span>
            <span>SAD Threshold: <strong>3% – 5%</strong></span>
          </div>

          {tbRows.length > 0 && (
            <div className="row mt12" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="caption" style={{ fontWeight: 600 }}>Pull Ingested Trial Balance Base:</span>
              <button type="button" className="btn sm ghost" onClick={() => { setBenchmarkType('revenue'); setBenchmarkValue(Math.abs(isCalc.revenue)); if (!percentage) setPercentage(1.0); }}>
                Revenue: {formatCurrency(Math.abs(isCalc.revenue), selectedEng.currency)}
              </button>
              <button type="button" className="btn sm ghost" onClick={() => { setBenchmarkType('profit'); setBenchmarkValue(Math.max(0, isCalc.netProfit)); if (!percentage) setPercentage(5.0); }}>
                Profit: {formatCurrency(Math.max(0, isCalc.netProfit), selectedEng.currency)}
              </button>
              <button type="button" className="btn sm ghost" onClick={() => { setBenchmarkType('assets'); setBenchmarkValue(Math.abs(bsCalc.totalAssets)); if (!percentage) setPercentage(1.0); }}>
                Assets: {formatCurrency(Math.abs(bsCalc.totalAssets), selectedEng.currency)}
              </button>
              <button type="button" className="btn sm ghost" onClick={() => { setBenchmarkType('equity'); setBenchmarkValue(Math.abs(bsCalc.totalEquity)); if (!percentage) setPercentage(1.5); }}>
                Equity: {formatCurrency(Math.abs(bsCalc.totalEquity), selectedEng.currency)}
              </button>
            </div>
          )}

          <div className="grid3 mt20">
            <div>
              <label className="caption">Financial Benchmark Basis</label>
              <select
                aria-label="Financial benchmark basis"
                className="input"
                value={benchmarkType}
                onChange={e => setBenchmarkType(e.target.value as any)}
              >
                <option value="revenue">Annual Gross Revenue (0.5% – 2.0%)</option>
                <option value="profit">Profit Before Tax (5.0% – 10.0%)</option>
                <option value="assets">Total Balance Sheet Assets (0.5% – 1.0%)</option>
                <option value="equity">Net Equity (1.0% – 2.0%)</option>
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
              <label className="caption">Performance Materiality / Tolerable Error (TE % of PM) *</label>
              <input
                type="number"
                step={1}
                min={1}
                max={100}
                className="input"
                aria-label="Performance materiality rate percentage"
                placeholder="Standard: 50% to 75%"
                value={performanceRate}
                onChange={e => setPerformanceRate(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <div>
              <label className="caption">Clearly Trivial Threshold / SAD (% of PM) *</label>
              <input
                type="number"
                step={0.5}
                min={0}
                max={100}
                className="input"
                aria-label="Clearly trivial threshold percentage"
                placeholder="Standard: 3% to 5%"
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
            <>
              <div className="metric-grid mt20">
                <div className="metric purple">
                  <span className="metric-label">Overall Planning Materiality (PM)</span>
                  <div className="metric-val">{formatCurrency(effectivePM, selectedEng.currency)}</div>
                  <span className="metric-sub">{percentage}% of {formatCurrency(Number(benchmarkValue), selectedEng.currency)}</span>
                </div>

                <div className="metric blue">
                  <span className="metric-label">Tolerable Error (TE: {materiality.performancePct}%)</span>
                  <div className="metric-val">{formatCurrency(effectiveTE, selectedEng.currency)}</div>
                  <span className="metric-sub">Substantive testing threshold</span>
                </div>

                <div className="metric amber">
                  <span className="metric-label">SAD / Trivial Threshold ({materiality.trivialPct}%)</span>
                  <div className="metric-val">{formatCurrency(effectiveSAD, selectedEng.currency)}</div>
                  <span className="metric-sub">Differences below this are not accumulated</span>
                </div>
              </div>

              {/* Practical Rounding Tolerance */}
              <div className="panel panel-pad mt16" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--stroke)' }}>
                <div className="between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '13px' }}>Manager Practical Rounding Tolerance (Strict ±5.0% Limit)</h4>
                    <p className="caption mt4" style={{ margin: 0 }}>
                      Auditing standards permit managers to round raw computed materiality to practical figures (e.g., 53,421 &rarr; 53,000) within a strict ±5% boundary before Partner approval.
                    </p>
                  </div>
                  {managerRoundedPM !== '' && (
                    <span className={`tag ${isRoundingExceeded ? 'red' : 'green'}`} style={{ fontWeight: 600 }}>
                      {isRoundingExceeded
                        ? `Exceeds Limit: ${roundingTolerancePct > 0 ? '+' : ''}${roundingTolerancePct.toFixed(1)}%`
                        : `Within Tolerance: ${roundingTolerancePct > 0 ? '+' : ''}${roundingTolerancePct.toFixed(1)}%`}
                    </span>
                  )}
                </div>
                <div className="row mt12" style={{ gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <label className="caption">Manager Rounded Planning Materiality ({selectedEng.currency})</label>
                    <input
                      type="number"
                      className="input"
                      aria-label="Manager rounded planning materiality"
                      placeholder={`Computed: ${materiality.overallMateriality.toLocaleString()}`}
                      value={managerRoundedPM}
                      onChange={e => setManagerRoundedPM(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                  <div style={{ minWidth: '220px' }}>
                    <span className="caption">Allowable ±5% Band:</span>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      {formatCurrency(Math.round(materiality.overallMateriality * 0.95), selectedEng.currency)} &mdash; {formatCurrency(Math.round(materiality.overallMateriality * 1.05), selectedEng.currency)}
                    </div>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="btn sm ghost mt16"
                      onClick={() => setManagerRoundedPM(Math.round(materiality.overallMateriality / 1000) * 1000)}
                      title="Round computed PM to nearest 1,000 QAR"
                    >
                      Auto-Round (1k)
                    </button>
                  </div>
                </div>
              </div>

              {/* Account Risk Stratification */}
              {riskStratification && (
                <div className="panel panel-pad mt16" style={{ border: '1px solid var(--stroke)' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '13px' }}>Account Risk Stratification (Trial Balance Mapping)</h4>
                    <p className="caption mt4" style={{ margin: 0 }}>
                      Dynamic classification of {riskStratification.totalCount} Trial Balance accounts against Tolerable Error ({formatCurrency(effectiveTE, selectedEng.currency)}) and Planning Materiality ({formatCurrency(effectivePM, selectedEng.currency)}).
                    </p>
                  </div>
                  <div className="grid3 mt12" style={{ gap: '12px' }}>
                    <div className="panel panel-pad" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: '#166534', fontWeight: 700, fontSize: '12px' }}>GREEN · LOW RISK</span>
                        <span className="badge green">{riskStratification.greenCount} Accounts</span>
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#14532d', marginTop: '6px' }}>
                        {formatCurrency(riskStratification.greenTotal, selectedEng.currency)}
                      </div>
                      <div className="caption mt4" style={{ color: '#166534' }}>
                        Balance &lt; TE. Standard automated audit programs; assignable to junior staff (Preparers).
                      </div>
                    </div>

                    <div className="panel panel-pad" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: '#92400e', fontWeight: 700, fontSize: '12px' }}>AMBER · MODERATE RISK</span>
                        <span className="badge amber">{riskStratification.amberCount} Accounts</span>
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#78350f', marginTop: '6px' }}>
                        {formatCurrency(riskStratification.amberTotal, selectedEng.currency)}
                      </div>
                      <div className="caption mt4" style={{ color: '#92400e' }}>
                        Balance between TE and PM. Requires senior substantive testing and sampling.
                      </div>
                    </div>

                    <div className="panel panel-pad" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: '#991b1b', fontWeight: 700, fontSize: '12px' }}>RED · CRITICAL RISK</span>
                        <span className="badge red">{riskStratification.redCount} Accounts</span>
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#7f1d1d', marginTop: '6px' }}>
                        {formatCurrency(riskStratification.redTotal, selectedEng.currency)}
                      </div>
                      <div className="caption mt4" style={{ color: '#991b1b' }}>
                        Balance &gt; PM or High Inherent Risk. Mandatory Manager execution and Partner direct review.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
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
                  disabled={!existingPlan || existingPlan.status !== 'Under review' || !hasAnyRole(state, ['partner'])}
                >
                  Lead Partner Sign-off (Approve Plan Strategy)
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
