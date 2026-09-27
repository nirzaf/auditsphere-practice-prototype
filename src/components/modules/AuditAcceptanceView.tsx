// Module 27: Acceptance, Continuance & KYC Questionnaire (VP-047)
// Engagement onboarding, independence evaluation, conditions management, partner sign-off, and persisted acceptance cases.

import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, AcceptanceCaseRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole, hasRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { ModuleIdentityLine, ModuleLifecycleHint } from '../common/Enterprise';

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
    c => c.clientId === (client?.id || selectedEng?.client) && c.year === (selectedEng?.year || 2026)
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
  const [screeningEvidence, setScreeningEvidence] = useState<NonNullable<AcceptanceCaseRecord['screeningEvidence']>>(existingCase?.screeningEvidence || {});

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
  const draftState = () => ({ riskRating, independenceConfirmed, amlKycCompleted, conflictsCleared, prohibitionsChecked, competenceConfirmed, screeningEvidence, conditions, newCondition, recommendationNotes, partnerDecision, partnerRationale, changedFacts });
  const persistedDraftState = () => ({
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
  const draftBaseline = useRef(JSON.stringify(persistedDraftState()));
  const currentDraft = useRef({ current: draftState(), saved: persistedDraftState() });
  currentDraft.current = { current: draftState(), saved: persistedDraftState() };
  const markDraftClean = (savedFields: Partial<ReturnType<typeof draftState>>) => {
    const baseline = JSON.parse(draftBaseline.current) as ReturnType<typeof draftState>;
    draftBaseline.current = JSON.stringify({ ...baseline, ...savedFields });
  };
  const discardDraft = () => {
    const saved = currentDraft.current.saved;
    setRiskRating(saved.riskRating as typeof riskRating);
    setIndependenceConfirmed(saved.independenceConfirmed); setAmlKycCompleted(saved.amlKycCompleted);
    setConflictsCleared(saved.conflictsCleared); setProhibitionsChecked(saved.prohibitionsChecked);
    setCompetenceConfirmed(saved.competenceConfirmed); setScreeningEvidence(saved.screeningEvidence);
    setConditions([...saved.conditions]); setNewCondition(saved.newCondition);
    setRecommendationNotes(saved.recommendationNotes); setPartnerDecision(saved.partnerDecision as typeof partnerDecision);
    setPartnerRationale(saved.partnerRationale); setChangedFacts(saved.changedFacts);
    draftBaseline.current = JSON.stringify(saved);
  };
  useEffect(() => {
    const key = `audit-acceptance:${selectedEng?.id || 'none'}`;
    if (!selectedEng) return;
    onRegisterUnsavedForm({
      label: 'client acceptance and continuance draft',
      isDirty: () => JSON.stringify(currentDraft.current.current) !== draftBaseline.current,
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
        screeningEvidence,
        conditions,
        recommendationBy: state.currentPerson,
        recommendationDate: new Date().toISOString(),
        recommendationNotes,
        decisionStatus: 'Pending'
      };

      prototypeStore.saveAcceptanceCase(caseRecord);
      setPartnerDecision('Pending');
      markDraftClean({ riskRating, independenceConfirmed, amlKycCompleted, conflictsCleared, prohibitionsChecked, competenceConfirmed, screeningEvidence: { ...screeningEvidence }, conditions: [...conditions], recommendationNotes, partnerDecision: 'Pending' });
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

  const allChecksPass = riskRating !== 'Prohibited' && independenceConfirmed && amlKycCompleted && conflictsCleared && prohibitionsChecked && competenceConfirmed && ['amlKyc', 'independence', 'conflicts', 'prohibitions', 'competence'].every(key => !!screeningEvidence[key as keyof typeof screeningEvidence]?.trim());
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
        <ModuleIdentityLine />
        <ModuleLifecycleHint />
      </div>

      {selectedEng.continuanceFromEngagementId && (
        <div className="panel panel-pad" role="status">
          <b>Fresh-period draft · FY {selectedEng.year}</b>
          <p className="sub mt4">Continued manually from {selectedEng.continuanceFromEngagementId} under prior case {selectedEng.continuanceCaseId}. Changed facts: {selectedEng.continuanceNotes}</p>
          <p className="caption mt4">This draft has no carried balances, tasks, evidence, workpapers, reviews, approvals or releases. Complete a new recommendation and a separate assigned-partner decision.</p>
        </div>
      )}

      {notice && (
        <div
          className="panel panel-pad"
          style={{
            background: notice.type === 'success' ? '#f0fdf4' : '#fef2f2',
            borderColor: notice.type === 'success' ? '#86efac' : '#fca5a5',
            color: notice.type === 'success' ? '#166534' : '#991b1b',
            padding: '10px 16px'
          }}
        >
          <b>{notice.type === 'success' ? '✓ ' : '⚠ '}</b>
          {notice.text}
        </div>
      )}

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

          <label className="borderbox row" style={{ padding: 12, gap: 10, alignItems: 'center', cursor: 'pointer', gridColumn: 'span 2' }}>
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

      {existingCase?.decisionStatus === 'Accepted' && selectedEng.acceptance && (
        <div className="panel panel-pad">
          <h3>Manual Annual Continuance</h3>
          <p className="sub mt4">Record what changed since FY {selectedEng.year}; creating the next-period draft does not carry forward balances, tasks, evidence, workpapers, reviews, approvals or releases.</p>
          {existingCase.continuedToEngagementId ? (
            <p className="mt12">Next-period draft: <b>{existingCase.continuedToEngagementId}</b></p>
          ) : (
            <>
              <label className="caption mt12" htmlFor="continuance-changed-facts">Current-period changes from prior period</label>
              <textarea id="continuance-changed-facts" className="input mt4" rows={3} value={changedFacts} onChange={e => setChangedFacts(e.target.value)} placeholder="Record changed ownership, activities, risks, independence or other relevant facts" />
              <button className="btn primary sm mt12" onClick={handleCreateContinuance} disabled={!hasAnyRole(state, ['manager', 'partner']) || !changedFacts.trim()}>
                Create Fresh FY{selectedEng.year + 1} Draft
              </button>
            </>
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
                      <span className={`badge ${c.decisionStatus === 'Accepted' ? 'green' : c.decisionStatus === 'Declined' ? 'red' : 'gray'}`}>
                        {c.decisionStatus}
                      </span>
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
