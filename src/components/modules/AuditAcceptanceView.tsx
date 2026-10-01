// Module 2: Acceptance, Continuance & KYC Questionnaire (VP-047)
// Engagement onboarding, independence evaluation, conditions management, partner sign-off, and persisted acceptance cases.

import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, AcceptanceCaseRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole, hasRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { StatusBadge } from '../common/StatusBadge';
import { Notice } from '../common/Feedback';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

interface AuditAcceptanceViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const AuditAcceptanceView: React.FC<AuditAcceptanceViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Existing persisted case if any
  const existingCase = (state.acceptanceCases || []).find(
    c => c.engagementId === selectedEng?.id && c.clientId === selectedEng?.client && c.year === selectedEng?.year && c.service === selectedEng?.service
  );

  const [riskRating, setRiskRating] = useState<'Low' | 'Medium' | 'High' | 'Prohibited'>(
    existingCase?.riskRating || 'Low'
  );
  const [independenceConfirmed, setIndependenceConfirmed] = useState(
    existingCase?.independenceConfirmed || false
  );
  const [amlKycCompleted, setAmlKycCompleted] = useState(
    existingCase?.amlKycCompleted || false
  );
  const [conflictsCleared, setConflictsCleared] = useState(
    existingCase?.conflictsCleared || false
  );
  const [prohibitionsChecked, setProhibitionsChecked] = useState(
    existingCase?.prohibitionsChecked || false
  );
  const [competenceConfirmed, setCompetenceConfirmed] = useState(
    existingCase?.competenceConfirmed || false
  );
  const [managementIntegrityConfirmed, setManagementIntegrityConfirmed] = useState(
    existingCase?.managementIntegrityConfirmed || false
  );
  const [financialViabilityConfirmed, setFinancialViabilityConfirmed] = useState(
    existingCase?.financialViabilityConfirmed || false
  );
  const [screeningEvidence, setScreeningEvidence] = useState<NonNullable<AcceptanceCaseRecord['screeningEvidence']>>(existingCase?.screeningEvidence || {});

  // Continuance 6-point delta checklist
  const [priorFeesSettled, setPriorFeesSettled] = useState<boolean | null>(existingCase?.continuanceDeltaChecklist?.priorFeesSettled ?? null);
  const [managementShareholdingUnchanged, setManagementShareholdingUnchanged] = useState<boolean | null>(existingCase?.continuanceDeltaChecklist?.managementShareholdingUnchanged ?? null);
  const [noNewLoansCovenants, setNoNewLoansCovenants] = useState<boolean | null>(existingCase?.continuanceDeltaChecklist?.noNewLoansCovenants ?? null);
  const [noPendingLitigation, setNoPendingLitigation] = useState<boolean | null>(existingCase?.continuanceDeltaChecklist?.noPendingLitigation ?? null);
  const [noFraudInvestigations, setNoFraudInvestigations] = useState<boolean | null>(existingCase?.continuanceDeltaChecklist?.noFraudInvestigations ?? null);
  const [noRegulatoryInquiries, setNoRegulatoryInquiries] = useState<boolean | null>(existingCase?.continuanceDeltaChecklist?.noRegulatoryInquiries ?? null);
  const [deltaExplanations, setDeltaExplanations] = useState(existingCase?.continuanceDeltaChecklist?.deltaExplanations || '');
  const [assessmentType, setAssessmentType] = useState<NonNullable<AcceptanceCaseRecord['assessmentType']>>(existingCase?.assessmentType || 'Track A (Initial)');
  const [priorPeriodEngagementId, setPriorPeriodEngagementId] = useState(existingCase?.priorPeriodEngagementId || '');

  const [conditions, setConditions] = useState<string[]>(
    existingCase?.conditions || []
  );
  const [newCondition, setNewCondition] = useState('');

  const [recommendationNotes, setRecommendationNotes] = useState(
    existingCase?.recommendationNotes || ''
  );
  const [partnerDecision, setPartnerDecision] = useState<'Pending' | 'Accepted' | 'Declined'>(
    existingCase?.decisionStatus || 'Pending'
  );
  const [partnerRationale, setPartnerRationale] = useState(
    existingCase?.decisionNotes || ''
  );
  const historicalApprovalNeedsEvidenceReview = existingCase?.decisionStatus === 'Accepted' && !selectedEng.acceptance;
  const [changedFacts, setChangedFacts] = useState('');
  const draftState = () => ({ managementIntegrityConfirmed, financialViabilityConfirmed, priorFeesSettled, managementShareholdingUnchanged, noNewLoansCovenants, noPendingLitigation, noFraudInvestigations, noRegulatoryInquiries, deltaExplanations, assessmentType, priorPeriodEngagementId, riskRating, independenceConfirmed, amlKycCompleted, conflictsCleared, prohibitionsChecked, competenceConfirmed, screeningEvidence, conditions, newCondition, recommendationNotes, partnerDecision, partnerRationale, changedFacts });
  const persistedDraftState = () => ({
    priorFeesSettled: existingCase?.continuanceDeltaChecklist?.priorFeesSettled ?? null,
    managementShareholdingUnchanged: existingCase?.continuanceDeltaChecklist?.managementShareholdingUnchanged ?? null,
    noNewLoansCovenants: existingCase?.continuanceDeltaChecklist?.noNewLoansCovenants ?? null,
    noPendingLitigation: existingCase?.continuanceDeltaChecklist?.noPendingLitigation ?? null,
    noFraudInvestigations: existingCase?.continuanceDeltaChecklist?.noFraudInvestigations ?? null,
    noRegulatoryInquiries: existingCase?.continuanceDeltaChecklist?.noRegulatoryInquiries ?? null,
    managementIntegrityConfirmed: existingCase?.managementIntegrityConfirmed ?? false,
    financialViabilityConfirmed: existingCase?.financialViabilityConfirmed ?? false,
    deltaExplanations: existingCase?.continuanceDeltaChecklist?.deltaExplanations || '',
    assessmentType: existingCase?.assessmentType || 'Track A (Initial)',
    priorPeriodEngagementId: existingCase?.priorPeriodEngagementId || '',

    riskRating: existingCase?.riskRating || 'Low',
    independenceConfirmed: existingCase?.independenceConfirmed || false,
    amlKycCompleted: existingCase?.amlKycCompleted || false,
    conflictsCleared: existingCase?.conflictsCleared || false,
    prohibitionsChecked: existingCase?.prohibitionsChecked || false,
    competenceConfirmed: existingCase?.competenceConfirmed || false,
    screeningEvidence: existingCase?.screeningEvidence || {},
    conditions: existingCase?.conditions || [],
    newCondition: '',
    recommendationNotes: existingCase?.recommendationNotes || '',
    partnerDecision: existingCase?.decisionStatus || 'Pending',
    partnerRationale: existingCase?.decisionNotes || '',
    changedFacts: '',
  });
  const draftJSON = (value: unknown) => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
  const draftBaseline = useRef(draftJSON(persistedDraftState()));
  const currentDraft = useRef({ current: draftState(), saved: persistedDraftState() });
  currentDraft.current = { current: draftState(), saved: persistedDraftState() };
  const markDraftClean = (savedFields: Partial<ReturnType<typeof draftState>>) => {
    const baseline = JSON.parse(draftBaseline.current) as ReturnType<typeof draftState>;
    draftBaseline.current = draftJSON({ ...baseline, ...savedFields });
  };
  const discardDraft = () => {
    const saved = currentDraft.current.saved;
    setManagementIntegrityConfirmed(saved.managementIntegrityConfirmed);
    setFinancialViabilityConfirmed(saved.financialViabilityConfirmed);
    setPriorFeesSettled(saved.priorFeesSettled);
    setManagementShareholdingUnchanged(saved.managementShareholdingUnchanged);
    setNoNewLoansCovenants(saved.noNewLoansCovenants);
    setNoPendingLitigation(saved.noPendingLitigation);
    setNoFraudInvestigations(saved.noFraudInvestigations);
    setNoRegulatoryInquiries(saved.noRegulatoryInquiries);
    setDeltaExplanations(saved.deltaExplanations);
    setPriorPeriodEngagementId(saved.priorPeriodEngagementId);
    setAssessmentType(saved.assessmentType as typeof assessmentType);
    setRiskRating(saved.riskRating as typeof riskRating);
    setIndependenceConfirmed(saved.independenceConfirmed); setAmlKycCompleted(saved.amlKycCompleted);
    setConflictsCleared(saved.conflictsCleared); setProhibitionsChecked(saved.prohibitionsChecked);
    setCompetenceConfirmed(saved.competenceConfirmed); setScreeningEvidence(saved.screeningEvidence);
    setConditions([...saved.conditions]); setNewCondition(saved.newCondition);
    setRecommendationNotes(saved.recommendationNotes); setPartnerDecision(saved.partnerDecision as typeof partnerDecision);
    setPartnerRationale(saved.partnerRationale); setChangedFacts(saved.changedFacts);
    draftBaseline.current = draftJSON(saved);
  };
  useEffect(() => {
    const key = `audit-acceptance:${selectedEng?.id || 'none'}`;
    if (!selectedEng) return;
    onRegisterUnsavedForm({
      label: 'client acceptance and continuance draft',
      isDirty: () => draftJSON(currentDraft.current.current) !== draftBaseline.current,
      // Recommendation, partner decision and continuance creation are explicit
      // professional actions; generic navigation must not perform them implicitly.
      save: () => { throw new Error('Use Save Recommendation, Record Partner Decision, or Create Fresh FY Draft before continuing; these professional actions are never submitted implicitly.'); },
      discard: discardDraft,
    }, key);
    return () => onRegisterUnsavedForm(null, key);
  }, [selectedEng?.id, onRegisterUnsavedForm]);

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="shield" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to perform client acceptance and KYC procedures.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const handleAddCondition = () => {
    if (!newCondition.trim()) return;
    setConditions(prev => [...prev, newCondition.trim()]);
    setNewCondition('');
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEvaluation = () => {
    if (!client) return;
    try {
      const caseRecord: AcceptanceCaseRecord = {
        id: existingCase?.id || `ACC-${client.id}-${selectedEng.year}`,
        engagementId: selectedEng.id,
        clientId: client.id,
        year: selectedEng.year,
        service: selectedEng.service,
        riskRating,
        independenceConfirmed,
        amlKycCompleted,
        conflictsCleared,
        prohibitionsChecked,
        competenceConfirmed,
        managementIntegrityConfirmed,
        financialViabilityConfirmed,
        screeningEvidence,
        assessmentType,
        priorPeriodEngagementId: priorPeriodEngagementId || undefined,
        continuanceDeltaChecklist: assessmentType === 'Track A (Initial)' ? undefined : { priorFeesSettled, managementShareholdingUnchanged, noNewLoansCovenants, noPendingLitigation, noFraudInvestigations, noRegulatoryInquiries, deltaExplanations },
        conditions,
        recommendationBy: state.currentPerson,
        recommendationDate: new Date().toISOString(),
        recommendationNotes,
        decisionStatus: 'Pending'
      };

      prototypeStore.saveAcceptanceCase(caseRecord);
      setPartnerDecision('Pending');
      markDraftClean({ managementIntegrityConfirmed, financialViabilityConfirmed, priorFeesSettled, managementShareholdingUnchanged, noNewLoansCovenants, noPendingLitigation, noFraudInvestigations, noRegulatoryInquiries, deltaExplanations, assessmentType, priorPeriodEngagementId, riskRating, independenceConfirmed, amlKycCompleted, conflictsCleared, prohibitionsChecked, competenceConfirmed, screeningEvidence: { ...screeningEvidence }, conditions: [...conditions], recommendationNotes, partnerDecision: 'Pending' });
      triggerNotice('success', `Recommendation for case ${caseRecord.id} saved. Partner decision is pending.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleRecordPartnerDecision = () => {
    if (!existingCase || partnerDecision === 'Pending') return;
    try {
      prototypeStore.decideAcceptanceCase(existingCase.id, partnerDecision, partnerRationale);
      markDraftClean({ partnerDecision, partnerRationale });
      triggerNotice('success', `Partner ${partnerDecision.toLowerCase()} decision recorded for ${existingCase.id}.${partnerDecision === 'Accepted' ? ' Prepare the client workspace separately after the synthetic SharePoint binding succeeds.' : ''}`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const baseChecksPass = riskRating !== 'Prohibited' && independenceConfirmed && amlKycCompleted && conflictsCleared && prohibitionsChecked && competenceConfirmed && ['amlKyc', 'independence', 'conflicts', 'prohibitions', 'competence'].every(key => !!screeningEvidence[key as keyof typeof screeningEvidence]?.trim());
  const allChecksPass = baseChecksPass && (assessmentType === 'Track A (Initial)' ? managementIntegrityConfirmed && financialViabilityConfirmed && !!screeningEvidence.managementIntegrity?.trim() && !!screeningEvidence.financialViability?.trim() : [priorFeesSettled, managementShareholdingUnchanged, noNewLoansCovenants, noPendingLitigation, noFraudInvestigations, noRegulatoryInquiries].every(v => v !== null) && !!priorPeriodEngagementId);

  const handleCreateContinuance = () => {
    try {
      const draft = prototypeStore.createContinuanceDraft(selectedEng.id, changedFacts);
      setChangedFacts('');
      markDraftClean({ changedFacts: '' });
      triggerNotice('success', `Fresh FY${draft.year} draft ${draft.id} created. Its recommendation and partner decision are pending.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Client Acceptance &amp; Continuance (KYC)</h1>
          <p>Annual continuance evaluation, independence verification, engagement conditions, and partner sign-off trail.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary sm" onClick={handleSaveEvaluation} disabled={!hasAnyRole(state, ['onboarding', 'compliance', 'manager', 'reviewer'])}>
            <Icon name="check" /> Save Recommendation
          </button>
        </div>
      </div>

      <section className="panel panel-pad">
        <label htmlFor="acceptance-track">Assessment track</label>
        <select id="acceptance-track" value={assessmentType} onChange={e => setAssessmentType(e.target.value as typeof assessmentType)}>
          <option>Track A (Initial)</option><option>Track B (Continuance)</option>
        </select>
        {assessmentType !== 'Track A (Initial)' && <><label htmlFor="acceptance-prior">Prior-period engagement</label>
          <select id="acceptance-prior" value={priorPeriodEngagementId} onChange={e => setPriorPeriodEngagementId(e.target.value)}>
            <option value="">Select an eligible prior period</option>
            {state.engagements.filter(e => e.client === selectedEng.client && e.service === selectedEng.service && e.year < selectedEng.year && e.acceptance).map(e => <option key={e.id} value={e.id}>{e.period} · {e.id}</option>)}
          </select></>}
      </section>
      {selectedEng.continuanceFromEngagementId && (
        <div className="panel panel-pad" role="status">
          <b>Fresh-period draft · FY {selectedEng.year}</b>
          <p className="sub mt4">Continued manually from {selectedEng.continuanceFromEngagementId} under prior case {selectedEng.continuanceCaseId}. Changed facts: {selectedEng.continuanceNotes}</p>
          <p className="caption mt4">This draft has no carried balances, tasks, evidence, workpapers, reviews, approvals or releases. Complete a new recommendation and a separate assigned-partner decision.</p>
        </div>
      )}

      {notice && <Notice tone={notice.type} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">PERSISTED CASE · {existingCase?.id || `ACC-${client?.id || 'NEW'}-${selectedEng.year}`}</span>
            <h2>{client?.name || selectedEng.client} · FY {selectedEng.year}</h2>
            <p className="sub">{selectedEng.service} · Jurisdiction: {client?.jurisdiction || 'State of Qatar'}</p>
          </div>
          <span className={`badge ${partnerDecision === 'Accepted' ? 'green' : partnerDecision === 'Declined' ? 'red' : 'amber'}`}>
            Decision: {historicalApprovalNeedsEvidenceReview ? 'Accepted · evidence review required' : partnerDecision}
          </span>
        </div>

        {/* Section 1: Statutory Compliance Checks */}
        <h3 className="mt20">1. Mandatory Onboarding &amp; Statutory Checks</h3>
        <div className="grid2 mt12" style={{ gap: 12 }}>
          <label className="borderbox row" style={{ padding: 12, gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={amlKycCompleted}
              onChange={e => setAmlKycCompleted(e.target.checked)}
            />
            <div>
              <b>Beneficial Ownership &amp; Sanctions Screening (AML/KYC)</b>
              <div className="cell-sub">Passport, Commercial Registration, and national PEP database verification.</div>
              <input className="input mt8" aria-label="Evidence reference for AML/KYC" placeholder="Evidence reference / case ID" value={screeningEvidence.amlKyc || ''} onChange={e => setScreeningEvidence(prev => ({ ...prev, amlKyc: e.target.value }))} onClick={e => e.stopPropagation()} />
            </div>
          </label>

          <label className="borderbox row" style={{ padding: 12, gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={independenceConfirmed}
              onChange={e => setIndependenceConfirmed(e.target.checked)}
            />
            <div>
              <b>Firm &amp; Personal Independence Confirmation (IESBA)</b>
              <div className="cell-sub">No prohibited non-audit services, financial interests, or family relationships.</div>
              <input className="input mt8" aria-label="Evidence reference for independence" placeholder="Evidence reference / case ID" value={screeningEvidence.independence || ''} onChange={e => setScreeningEvidence(prev => ({ ...prev, independence: e.target.value }))} onClick={e => e.stopPropagation()} />
            </div>
          </label>

          <label className="borderbox row" style={{ padding: 12, gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={conflictsCleared}
              onChange={e => setConflictsCleared(e.target.checked)}
            />
            <div>
              <b>Commercial Conflict of Interest Clearance</b>
              <div className="cell-sub">Cross-checked against existing client registers and competitive relationships.</div>
              <input className="input mt8" aria-label="Evidence reference for conflicts" placeholder="Evidence reference / case ID" value={screeningEvidence.conflicts || ''} onChange={e => setScreeningEvidence(prev => ({ ...prev, conflicts: e.target.value }))} onClick={e => e.stopPropagation()} />
            </div>
          </label>

          <label className="borderbox row" style={{ padding: 12, gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={prohibitionsChecked}
              onChange={e => setProhibitionsChecked(e.target.checked)}
            />
            <div>
              <b>Statutory Auditor Rotation &amp; Term Prohibitions</b>
              <div className="cell-sub">Verified mandate tenure complies with local mandatory rotation laws.</div>
              <input className="input mt8" aria-label="Evidence reference for prohibitions" placeholder="Evidence reference / case ID" value={screeningEvidence.prohibitions || ''} onChange={e => setScreeningEvidence(prev => ({ ...prev, prohibitions: e.target.value }))} onClick={e => e.stopPropagation()} />
            </div>
          </label>

          <label className="borderbox row" style={{ padding: 12, gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={competenceConfirmed}
              onChange={e => setCompetenceConfirmed(e.target.checked)}
            />
            <div>
              <b>Technical Industry Competence &amp; Resource Availability</b>
              <div className="cell-sub">Team staffed with licensed statutory audit practitioners and sector specialists.</div>
              <input className="input mt8" aria-label="Evidence reference for competence" placeholder="Evidence reference / case ID" value={screeningEvidence.competence || ''} onChange={e => setScreeningEvidence(prev => ({ ...prev, competence: e.target.value }))} onClick={e => e.stopPropagation()} />
            </div>
          </label>

          <label className="borderbox row" style={{ padding: 12, gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={managementIntegrityConfirmed}
              onChange={e => setManagementIntegrityConfirmed(e.target.checked)}
            />
            <div>
              <b>Management Integrity &amp; Ethical Reputation Assessment</b>
              <div className="cell-sub">Past regulatory sanctions, accounting disputes, executive reputation, and ethical background check.</div>
              <input className="input mt8" aria-label="Evidence reference for management integrity" placeholder="Integrity assessment ref / report ID" value={screeningEvidence.managementIntegrity || ''} onChange={e => setScreeningEvidence(prev => ({ ...prev, managementIntegrity: e.target.value }))} onClick={e => e.stopPropagation()} />
            </div>
          </label>

          <label className="borderbox row" style={{ padding: 12, gap: 10, alignItems: 'center', cursor: 'pointer', gridColumn: '1 / -1' }}>
            <input
              type="checkbox"
              checked={financialViabilityConfirmed}
              onChange={e => setFinancialViabilityConfirmed(e.target.checked)}
            />
            <div>
              <b>Financial Viability &amp; Solvency Evaluation</b>
              <div className="cell-sub">Client solvency evaluation, going concern indicators, working capital stability, and fee payment capacity.</div>
              <input className="input mt8" aria-label="Evidence reference for financial viability" placeholder="Viability check ref / credit report ID" value={screeningEvidence.financialViability || ''} onChange={e => setScreeningEvidence(prev => ({ ...prev, financialViability: e.target.value }))} onClick={e => e.stopPropagation()} />
            </div>
          </label>
        </div>

        {/* Section 2: Risk Rating & Engagement Conditions */}
        <h3 className="mt20">2. Risk Evaluation &amp; Engagement Pre-Conditions</h3>
        <div className="grid2 mt12" style={{ gap: 16 }}>
          <div>
            <label className="caption">Assessed Client Mandate Risk Rating</label>
            <select
              aria-label="Assessed client mandate risk rating"
              className="input"
              value={riskRating}
              onChange={e => setRiskRating(e.target.value as any)}
            >
              <option value="Low">Low Risk — Standard Mandate Controls</option>
              <option value="Medium">Medium Risk — Enhanced Manager Supervision</option>
              <option value="High">High Risk — Mandatory EQR &amp; Partner Concurrence</option>
              <option value="Prohibited">Prohibited — Mandatory Mandate Rejection</option>
            </select>
          </div>
          <div>
            <label className="caption">Statutory Compliance Status</label>
            <div className="mt4">
              <span className={`badge ${allChecksPass ? 'green' : 'amber'}`}>
                {allChecksPass ? 'All 5 Statutory Gates Passed' : 'Incomplete Screening Gates'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt16">
          <label className="caption">Engagement Conditions Precedent ({conditions.length})</label>
          <div className="stack mt8" style={{ gap: 8 }}>
            {conditions.map((cond, idx) => (
              <div key={idx} className="between borderbox" style={{ padding: 10 }}>
                <span>• {cond}</span>
                <button className="btn sm ghost text-danger" onClick={() => handleRemoveCondition(idx)}>Remove</button>
              </div>
            ))}
          </div>
          <div className="row mt8" style={{ gap: 8 }}>
            <input
              type="text"
              className="input"
              aria-label="Engagement condition precedent"
              placeholder="Add specific engagement condition precedent..."
              value={newCondition}
              onChange={e => setNewCondition(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCondition()}
            />
            <button className="btn sm" onClick={handleAddCondition}>Add Condition</button>
          </div>
        </div>

        {/* Section 3: Onboarding Recommendation */}
        <h3 className="mt20">3. Onboarding &amp; Compliance Recommendation</h3>
        <div className="mt8">
          <label className="caption">Compliance Recommendation Summary</label>
          <textarea
            aria-label="Compliance recommendation summary"
            className="input"
            rows={2}
            value={recommendationNotes}
            onChange={e => setRecommendationNotes(e.target.value)}
          />
          <div className="cell-sub mt4">
            Evaluated by: {existingCase?.recommendationBy || state.currentPerson} · Date: {existingCase?.recommendationDate ? new Date(existingCase.recommendationDate).toLocaleDateString() : 'Current evaluation'}
          </div>
        </div>

        {/* Section 4: Lead Partner Final Decision */}
        <div className="borderbox mt20" style={{ background: '#f8fafc', padding: 16 }}>
          <h4>4. Licensed Lead Audit Partner Decision</h4>
          <p className="sub mt4">
            Final engagement authority retained strictly by the lead statutory partner ({selectedEng.partner}).
          </p>

          <div className="grid2 mt12" style={{ gap: 16 }}>
            <div>
              <label className="caption">Final Decision Status</label>
              <select
                aria-label="Final decision status"
                className="input"
                value={partnerDecision}
                disabled={!hasRole(state, 'partner') || !existingCase}
                onChange={e => setPartnerDecision(e.target.value as any)}
              >
                <option value="Pending">Pending Further Clarifications / Conditions</option>
                <option value="Accepted">Accept &amp; Continue Engagement Mandate</option>
                <option value="Declined">Decline Professional Mandate</option>
              </select>
            </div>
            <div>
              <label className="caption">Signing Statutory Partner</label>
              <div className="mt4"><b>{selectedEng.partner} (Licensed Practitioner)</b></div>
            </div>
          </div>

          <div className="mt12">
            <label className="caption">Partner Acceptance Rationale</label>
            <textarea
              aria-label="Partner acceptance rationale"
              className="input"
              rows={2}
              value={partnerRationale}
              disabled={!hasRole(state, 'partner')}
              onChange={e => setPartnerRationale(e.target.value)}
            />
          </div>

          <button
            className="btn primary sm mt16"
            onClick={handleRecordPartnerDecision}
            disabled={!hasRole(state, 'partner') || !existingCase || partnerDecision === 'Pending'}
          >
            Record Partner Decision
          </button>
        </div>
      </div>

      {historicalApprovalNeedsEvidenceReview && (
        <div className="panel panel-pad" role="status">
          <b>Prior approval retained for history</b>
          <p className="sub mt4">This legacy approval has no screening evidence references and does not currently authorize engagement work. Record a new recommendation with evidence references and obtain a fresh independent partner decision.</p>
        </div>
      )}

      {(assessmentType !== 'Track A (Initial)' || (existingCase?.decisionStatus === 'Accepted' && selectedEng.acceptance)) && (
        <div className="panel panel-pad">
          <h3>Annual Client Continuance Evaluation (Track B)</h3>
          <p className="sub mt4">
            Under ISQM 1 / ISA 220, recurring clients require evaluation of changes since the prior engagement using the mandatory 6-point delta checklist. Creating the next-period draft does not carry forward balances, tasks, evidence, workpapers, reviews, approvals or releases.
          </p>
          {existingCase?.continuedToEngagementId ? (
            <p className="mt12">Next-period draft: <b>{existingCase.continuedToEngagementId}</b></p>
          ) : (
            <div className="stack mt16" style={{ gap: 12 }}>
              <div className="caption font-medium">Mandatory Continuance Delta Checklist:</div>
              <div className="grid2" style={{ gap: 10 }}>
                <label className="borderbox row" style={{ padding: 10, gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <select aria-label="priorFeesSettled" value={priorFeesSettled === null ? '' : String(priorFeesSettled)} onChange={e => setPriorFeesSettled(e.target.value === '' ? null : e.target.value === 'true')}><option value="">Not assessed</option><option value="true">Yes</option><option value="false">No — changed fact</option></select>
                  <div>
                    <b>1. Prior-period professional fees settled</b>
                    <div className="cell-sub">No outstanding or disputed audit fees that could impair auditor independence.</div>
                  </div>
                </label>

                <label className="borderbox row" style={{ padding: 10, gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <select aria-label="managementShareholdingUnchanged" value={managementShareholdingUnchanged === null ? '' : String(managementShareholdingUnchanged)} onChange={e => setManagementShareholdingUnchanged(e.target.value === '' ? null : e.target.value === 'true')}><option value="">Not assessed</option><option value="true">Yes</option><option value="false">No — changed fact</option></select>
                  <div>
                    <b>2. Stable management &amp; shareholding</b>
                    <div className="cell-sub">No significant changes in board of directors, executive management, or beneficial ownership (UBO).</div>
                  </div>
                </label>

                <label className="borderbox row" style={{ padding: 10, gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <select aria-label="noNewLoansCovenants" value={noNewLoansCovenants === null ? '' : String(noNewLoansCovenants)} onChange={e => setNoNewLoansCovenants(e.target.value === '' ? null : e.target.value === 'true')}><option value="">Not assessed</option><option value="true">Yes</option><option value="false">No — changed fact</option></select>
                  <div>
                    <b>3. No debt covenant or loan distress</b>
                    <div className="cell-sub">No newly entered bank loan covenants at risk of breach or distress financing.</div>
                  </div>
                </label>

                <label className="borderbox row" style={{ padding: 10, gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <select aria-label="noPendingLitigation" value={noPendingLitigation === null ? '' : String(noPendingLitigation)} onChange={e => setNoPendingLitigation(e.target.value === '' ? null : e.target.value === 'true')}><option value="">Not assessed</option><option value="true">Yes</option><option value="false">No — changed fact</option></select>
                  <div>
                    <b>4. No material pending litigation</b>
                    <div className="cell-sub">No threatened or ongoing legal disputes that could affect going concern or liabilities.</div>
                  </div>
                </label>

                <label className="borderbox row" style={{ padding: 10, gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <select aria-label="noFraudInvestigations" value={noFraudInvestigations === null ? '' : String(noFraudInvestigations)} onChange={e => setNoFraudInvestigations(e.target.value === '' ? null : e.target.value === 'true')}><option value="">Not assessed</option><option value="true">Yes</option><option value="false">No — changed fact</option></select>
                  <div>
                    <b>5. No fraud or whistleblower incidents</b>
                    <div className="cell-sub">No suspected or actual fraudulent acts, internal investigations, or whistleblower complaints.</div>
                  </div>
                </label>

                <label className="borderbox row" style={{ padding: 10, gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <select aria-label="noRegulatoryInquiries" value={noRegulatoryInquiries === null ? '' : String(noRegulatoryInquiries)} onChange={e => setNoRegulatoryInquiries(e.target.value === '' ? null : e.target.value === 'true')}><option value="">Not assessed</option><option value="true">Yes</option><option value="false">No — changed fact</option></select>
                  <div>
                    <b>6. No regulatory or tax inquiries</b>
                    <div className="cell-sub">No formal notices from QFC/MOCI/QCB regulatory bodies or tax authority audit sanctions.</div>
                  </div>
                </label>
              </div>

              <div>
                <label className="caption" htmlFor="continuance-delta-explanations">
                  Current-Period Delta Analysis &amp; Changed Facts *
                </label>
                <textarea
                  id="continuance-delta-explanations"
                  className="input mt4"
                  rows={3}
                  value={deltaExplanations}
                  onChange={e => setDeltaExplanations(e.target.value)}
                  placeholder="Detail changes since prior year (e.g., changes in revenue lines, new branch operations, or confirmation that 6-point checklist verified clean)..."
                />
              </div>

              <div className="row" style={{ gap: 10 }}>
                <button className="btn sm" onClick={handleSaveEvaluation} disabled={!hasAnyRole(state, ['manager', 'reviewer', 'onboarding', 'compliance'])}>Save Continuance Evaluation</button>
                <button
                  className="btn primary sm"
                  onClick={() => {
                    const deltaSummary = [
                      `Continuance Delta Checklist for FY${selectedEng.year + 1}:`,
                      `• Prior fees settled: ${priorFeesSettled ? 'Yes' : 'NO - FLAG'}`,
                      `• Management/Shareholding unchanged: ${managementShareholdingUnchanged ? 'Yes' : 'NO - CHANGES RECORDED'}`,
                      `• Loan covenants stable: ${noNewLoansCovenants ? 'Yes' : 'NO - NEW FACILITIES'}`,
                      `• No pending litigation: ${noPendingLitigation ? 'Yes' : 'NO - LITIGATION FLAG'}`,
                      `• No fraud / investigations: ${noFraudInvestigations ? 'Yes' : 'NO - INVESTIGATION FLAG'}`,
                      `• No regulatory inquiries: ${noRegulatoryInquiries ? 'Yes' : 'NO - REGULATORY INQUIRY'}`,
                      `Delta Notes: ${deltaExplanations.trim() || 'No material adverse changes verified.'}`
                    ].join('\n');
                    try {
                      const draft = prototypeStore.createContinuanceDraft(selectedEng.id, deltaSummary);
                      setDeltaExplanations('');
                      triggerNotice('success', `Fresh FY${draft.year} continuance draft ${draft.id} created.`);
                    } catch (err: any) {
                      triggerNotice('error', err.message);
                    }
                  }}
                  disabled={!hasAnyRole(state, ['manager', 'partner']) || existingCase?.decisionStatus !== 'Accepted' || !selectedEng.acceptance || [priorFeesSettled, managementShareholdingUnchanged, noNewLoansCovenants, noPendingLitigation, noFraudInvestigations, noRegulatoryInquiries].some(v => v === null) || !deltaExplanations.trim()}
                >
                  Create Fresh FY{selectedEng.year + 1} Draft with Continuance Checklist
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Case History / Prior Years Register */}
      {(state.acceptanceCases && state.acceptanceCases.length > 0) && (
        <div className="panel">
          <div className="panel-head">
            <h3>Firm Acceptance &amp; Continuance Register ({state.acceptanceCases.length})</h3>
            <span className="caption">Persisted annual continuance evaluations</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Client</th>
                  <th>FY</th>
                  <th>Risk Rating</th>
                  <th>Conditions</th>
                  <th>Recommended By</th>
                  <th>Decision</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {state.acceptanceCases.map(c => (
                  <tr key={c.id}>
                    <td><span className="mono">{c.id}</span></td>
                    <td><b>{c.clientId}</b></td>
                    <td>{c.year}</td>
                    <td><span className={`badge ${c.riskRating === 'Low' ? 'green' : 'amber'}`}>{c.riskRating}</span></td>
                    <td>{c.conditions.length} conditions</td>
                    <td>{c.recommendationBy}</td>
                    <td>{c.decisionBy || 'Pending'}</td>
                    <td>
                      <StatusBadge status={c.decisionStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
