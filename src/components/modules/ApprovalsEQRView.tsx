// Module 36: Multi-Stage Sign-offs & Engagement Quality Review (EQR) (VP-056)
// Formal 4-gate sign-off register, generational invalidation protection, and persistent per-engagement EQR concerns.

import React, { useEffect, useRef, useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole, hasRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

interface ApprovalsEQRViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const ApprovalsEQRView: React.FC<ApprovalsEQRViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const [newConcern, setNewConcern] = useState('');
  const [eqrUserId, setEqrUserId] = useState(selectedEng.eqrReviewerUserId || state.users.find(user => user.role === 'eqr' && user.status === 'Active')?.id || '');
  const [eqrReason, setEqrReason] = useState('');
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const assignmentBaseline = useRef({ userId: eqrUserId, reason: '' });
  const queryBaseline = useRef('');
  const responseBaseline = useRef<Record<string, string>>({});

  useEffect(() => {
    const nextReviewer = selectedEng.eqrReviewerUserId || state.users.find(user => user.role === 'eqr' && user.status === 'Active')?.id || '';
    assignmentBaseline.current = { userId: nextReviewer, reason: '' };
    queryBaseline.current = '';
    responseBaseline.current = {};
    setEqrUserId(nextReviewer);
    setEqrReason('');
    setNewConcern('');
    setResponses({});
  }, [selectedEng.id]);

  useEffect(() => {
    const assignmentKey = `eqr-assignment:${selectedEng.id}`;
    const queryKey = `eqr-query:${selectedEng.id}`;
    const responsesKey = `eqr-responses:${selectedEng.id}`;
    const assignmentGuard: UnsavedFormGuard = {
      label: 'EQR assignment draft',
      isDirty: () => eqrUserId !== assignmentBaseline.current.userId || eqrReason !== assignmentBaseline.current.reason,
      save: () => { throw new Error('Use Assign EQR to record the reviewer and reason; navigation cannot record an assignment.'); },
      discard: () => {
        setEqrUserId(assignmentBaseline.current.userId);
        setEqrReason(assignmentBaseline.current.reason);
      },
    };
    const queryGuard: UnsavedFormGuard = {
      label: 'EQR matter draft',
      isDirty: () => newConcern !== queryBaseline.current,
      save: () => { throw new Error('Use Raise EQR Query to add the matter to the engagement quality log.'); },
      discard: () => setNewConcern(queryBaseline.current),
    };
    const responseGuard: UnsavedFormGuard = {
      label: 'EQR response draft',
      isDirty: () => Object.entries(responses).some(([id, value]) => value !== (responseBaseline.current[id] || '')),
      save: () => { throw new Error('Use Record response for each EQR matter; navigation cannot submit an EQR response.'); },
      discard: () => setResponses({ ...responseBaseline.current }),
    };
    onRegisterUnsavedForm(assignmentGuard, assignmentKey);
    onRegisterUnsavedForm(queryGuard, queryKey);
    onRegisterUnsavedForm(responseGuard, responsesKey);
    return () => {
      onRegisterUnsavedForm(null, assignmentKey);
      onRegisterUnsavedForm(null, queryKey);
      onRegisterUnsavedForm(null, responsesKey);
    };
  }, [selectedEng.id, eqrUserId, eqrReason, newConcern, responses, onRegisterUnsavedForm]);

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="shield" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to view and record multi-stage sign-offs.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const approvals = selectedEng.approvals;
  const eqrConcerns = selectedEng.eqrConcerns || [];

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const handleRecordSignOff = (roleKey: 'manager' | 'client' | 'partner' | 'eqr') => {
    try {
      prototypeStore.recordApproval(selectedEng.id, roleKey, 'Independent stage sign-off recorded in prototype.');
      triggerNotice('success', `Stage sign-off for ${roleKey.toUpperCase()} successfully recorded.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleAssignEqr = () => {
    try {
      prototypeStore.assignEqrReviewer(selectedEng.id, eqrUserId, eqrReason);
      assignmentBaseline.current = { userId: eqrUserId, reason: '' };
      setEqrReason('');
      triggerNotice('success', 'EQR assignment recorded; prior EQR concurrence was cleared.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handlePresentPackage = () => {
    try {
      prototypeStore.presentManagementPackage(selectedEng.id);
      triggerNotice('success', 'Current validated package revision presented to client management.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleAddConcern = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConcern.trim()) return;

    try {
      prototypeStore.addEqrConcern(selectedEng.id, newConcern.trim());
      queryBaseline.current = '';
      setNewConcern('');
      triggerNotice('success', 'EQR matter registered in the engagement quality log.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleToggleConcern = (id: string) => {
    try {
      prototypeStore.toggleEqrConcern(selectedEng.id, id);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleRespondConcern = (id: string) => {
    try {
      prototypeStore.respondEqrConcern(selectedEng.id, id, responses[id] || '');
      responseBaseline.current = { ...responseBaseline.current, [id]: '' };
      setResponses(prev => ({ ...prev, [id]: '' }));
      triggerNotice('success', 'EQR response saved for independent review.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Sign-offs & Engagement Quality Review</h1>
          <p>Formal multi-stage sign-off gates, generational validity protection, and independent EQR concurrence.</p>
        </div>
        <button className="btn primary sm" onClick={() => onNavigate('delivery')}>
          <Icon name="archive" /> Proceed to Release Desk
        </button>
      </div>

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
            <span className="eyebrow">STAGE SIGN-OFF GATES · {selectedEng.id}</span>
            <h2>Sign-off Register (Generation {selectedEng.generation})</h2>
            <p className="sub">
              Active Persona: <b>{state.currentPerson}</b> ({state.currentRole}). Any source file modification automatically stales approvals for prior generations.
            </p>
          </div>
          <span className="badge teal">ISA 220 Quality Management</span>
        </div>

        {/* 4 Sign-off Gate Cards */}
        <div className="grid2 mt20">
          {/* Gate 1: Manager */}
          <div className="borderbox" style={{ padding: 16 }}>
            <div className="between">
              <b>1. Engagement Manager Sign-off</b>
              <span className={`badge ${approvals.manager ? 'green' : 'amber'}`}>
                {approvals.manager ? 'Signed Off' : 'Pending'}
              </span>
            </div>
            <p className="sub mt8">
              Verification of audit file consistency, clearance of associate queries, and completeness of sampling.
            </p>
            {approvals.manager ? (
              <div className="cell-sub mt12" style={{ color: 'var(--teal-dark)' }}>
                Signed by {approvals.manager.by} on {new Date(approvals.manager.at).toLocaleString('en-GB')} (Gen {approvals.manager.generation})
              </div>
            ) : (
              <button
                className="btn primary sm mt12"
                onClick={() => handleRecordSignOff('manager')}
              >
                Sign Off as Manager ({selectedEng.manager})
              </button>
            )}
          </div>

          {/* Gate 2: Client Rep */}
          <div className="borderbox" style={{ padding: 16 }}>
            <div className="between">
              <b>2. Management Representation Sign-off</b>
              <span className={`badge ${approvals.client ? 'green' : 'amber'}`}>
                {approvals.client ? 'Signed Off' : 'Pending'}
              </span>
            </div>
            <p className="sub mt8">
              Formal receipt of signed management representation letter acknowledging responsibility for books and records.
            </p>
            {approvals.client ? (
              <div className="cell-sub mt12" style={{ color: 'var(--teal-dark)' }}>
                Signed by {approvals.client.by} on {new Date(approvals.client.at).toLocaleString('en-GB')} (Gen {approvals.client.generation})
              </div>
            ) : (
              <button
                className="btn primary sm mt12"
                onClick={() => handleRecordSignOff('client')}
              >
                Record Client Representation Receipt
              </button>
            )}
          </div>

          {/* Gate 3: Partner */}
          <div className="borderbox" style={{ padding: 16 }}>
            <div className="between">
              <b>3. Lead Audit Partner Approval</b>
              <span className={`badge ${approvals.partner ? 'green' : 'amber'}`}>
                {approvals.partner ? 'Approved' : 'Pending'}
              </span>
            </div>
            <p className="sub mt8">
              Sole professional authority to issue audit opinion and release financial statements to stakeholders.
            </p>
            {approvals.partner ? (
              <div className="cell-sub mt12" style={{ color: 'var(--teal-dark)' }}>
                Approved by {approvals.partner.by} on {new Date(approvals.partner.at).toLocaleString('en-GB')} (Gen {approvals.partner.generation})
              </div>
            ) : (
              <button
                className="btn primary sm mt12"
                onClick={() => handleRecordSignOff('partner')}
              >
                Approve as Lead Partner ({selectedEng.partner})
              </button>
            )}
          </div>

          {/* Gate 4: EQR */}
          <div className="borderbox" style={{ padding: 16 }}>
            <div className="between">
              <b>4. Engagement Quality Reviewer (EQR)</b>
              <span className={`badge ${approvals.eqr ? 'green' : 'amber'}`}>
                {approvals.eqr ? 'Concurred' : 'Pending'}
              </span>
            </div>
            <p className="sub mt8">
              Objective evaluation of significant judgments and conclusions made by the engagement team (ISQM 2).
            </p>
            <p className="cell-sub mt8">Assigned reviewer: {state.users.find(user => user.id === (selectedEng.eqrReviewerUserId || 'eqr'))?.name || 'Unassigned'}</p>
            {approvals.eqr ? (
              <div className="cell-sub mt12" style={{ color: 'var(--teal-dark)' }}>
                Concurred by {approvals.eqr.by} on {new Date(approvals.eqr.at).toLocaleString('en-GB')} (Gen {approvals.eqr.generation})
              </div>
            ) : (
              <button
                className="btn primary sm mt12"
                onClick={() => handleRecordSignOff('eqr')}
              >
                Sign Off as Assigned EQR
              </button>
            )}
            {hasAnyRole(state, ['manager', 'partner']) && <div className="row mt12">
              <select className="input" aria-label="Assigned EQR" value={eqrUserId} onChange={event => setEqrUserId(event.target.value)}>
                {state.users.filter(user => user.role === 'eqr' && user.status === 'Active').map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <input className="input" aria-label="EQR assignment reason" placeholder="Assignment or substitution reason" value={eqrReason} onChange={event => setEqrReason(event.target.value)} />
              <button className="btn sm" disabled={!eqrReason.trim() || eqrUserId === (selectedEng.eqrReviewerUserId || 'eqr')} onClick={handleAssignEqr}>Assign EQR</button>
            </div>}
          </div>
        </div>
      </div>

      {hasAnyRole(state, ['manager', 'partner']) && <div className="panel panel-pad">
        <div className="between"><div><h3>Management Package Presentation</h3><p className="sub mt4">Present the validated current package revision for an independent management decision.</p></div>
          <button className="btn primary sm" onClick={handlePresentPackage}>Present Current Package</button></div>
        {selectedEng.managementPresentation && <p className="cell-sub mt8">Presented by {selectedEng.managementPresentation.presentedBy} · Package v{selectedEng.managementPresentation.packageRevision} · Source v{selectedEng.managementPresentation.sourceVersion} · Gen {selectedEng.managementPresentation.generation}{selectedEng.managementPackageDecision ? ` · Management ${selectedEng.managementPackageDecision.decision}` : ' · Awaiting management decision'}</p>}
      </div>}

      {/* EQR Concerns Register */}
      <div className="panel panel-pad">
        <div className="between">
          <div>
            <h3>EQR Matters &amp; Concerns Register</h3>
            <p className="sub">
              All EQR matters must be marked resolved before the EQR gate can be signed off. Persisted per-engagement.
            </p>
          </div>
          <span className="caption">
            {eqrConcerns.filter(c => !c.resolved).length} Unresolved Matters
          </span>
        </div>

        <div className="stack mt16" style={{ gap: 8 }}>
          {eqrConcerns.length === 0 ? (
            <p className="sub">No EQR concerns or queries raised for this engagement.</p>
          ) : (
            eqrConcerns.map(c => (
              <div key={c.id} className="between borderbox" style={{ padding: 12 }}>
                <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    aria-label="Mark EQR concern resolved"
                    checked={c.resolved}
                    disabled={!hasRole(state, 'eqr') || (!c.resolved && !c.response)}
                    onChange={() => handleToggleConcern(c.id)}
                  />
                  <div>
                    <b style={{ textDecoration: c.resolved ? 'line-through' : 'none' }}>{c.text}</b>
                    <div className="cell-sub">
                      {c.id} · Raised by {c.raisedBy} on {new Date(c.raisedAt).toLocaleDateString('en-GB')}
                      {c.resolved && c.resolvedBy && (
                        <span> · Resolved by {c.resolvedBy}</span>
                      )}
                      {c.response && <div>Response by {c.responseBy}: {c.response}</div>}
                      {!c.resolved && (
                        <div className="row mt8" style={{ gap: 8 }}>
                          <input
                            className="input sm"
                            aria-label={`Response to ${c.id}`}
                            placeholder="Team response for EQR review"
                            value={responses[c.id] || ''}
                            onChange={e => setResponses(prev => ({ ...prev, [c.id]: e.target.value }))}
                          />
                          <button type="button" className="btn sm" onClick={() => handleRespondConcern(c.id)}>Record response</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <span className={`badge ${c.resolved ? 'green' : 'amber'}`}>
                  {c.resolved ? 'Resolved' : 'Open Matter'}
                </span>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAddConcern} className="row mt16" style={{ gap: 10 }}>
          <input
            type="text"
            className="input"
            style={{ flex: 1 }}
            aria-label="EQR query"
            placeholder="Raise new EQR quality matter or disclosure inquiry..."
            value={newConcern}
            onChange={e => setNewConcern(e.target.value)}
          />
          <button type="submit" className="btn sm primary">Raise EQR Query</button>
        </form>
      </div>
    </div>
  );
};
