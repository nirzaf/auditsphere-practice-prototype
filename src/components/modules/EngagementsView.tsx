// Module 04: Engagements Workspace & Lifecycle Handoff (VP-012)
import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, EngagementRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';
import { visibleClientIds, visibleEngagementIds } from '../../services/guards';
import { InternalNotesPanel } from '../common/InternalNotesPanel';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

import { ListState, ModuleIdentityLine, ModuleLifecycleHint, StatusBadge, WorkflowProgressTracker } from '../common/Enterprise';
import { deriveEngagementJourney } from '../../services/engagementJourney';
interface EngagementsViewProps {
  onNavigate: (route: RouteKey) => void;
  onBeforeContextChange: (run: () => void) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const EngagementsView: React.FC<EngagementsViewProps> = ({ onNavigate, onBeforeContextChange, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const visibleClients = visibleClientIds(state);
  const visibleEngagements = visibleEngagementIds(state);
  const scopedClients = state.clients.filter(client => visibleClients === 'ALL' || visibleClients.includes(client.id));
  const scopedEngagements = state.engagements.filter(engagement => visibleEngagements === 'ALL' || visibleEngagements.includes(engagement.id));
  const [showNewEngModal, setShowNewEngModal] = useState(false);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [showEditAdminModal, setShowEditAdminModal] = useState(false);
  const [editService, setEditService] = useState('');
  const [editYear, setEditYear] = useState(2026);
  const [editPeriod, setEditPeriod] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editManager, setEditManager] = useState('');
  const [editPartner, setEditPartner] = useState('');
  const [editTeam, setEditTeam] = useState<string[]>([]);

  // New engagement form
  const [clientId, setClientId] = useState(scopedClients[0]?.id || '');
  const [service, setService] = useState('External audit');
  const [year, setYear] = useState(2026);
  const [manager, setManager] = useState('Layla Rahman');
  const [partner, setPartner] = useState('Daniel James');
  const [fee, setFee] = useState(500000);
  const [proposalId, setProposalId] = useState('');
  const newEngagementBaseline = useRef('');
  const acceptedProposals = state.proposals.filter(p => p.state === 'Accepted' && p.clientId && (visibleClients === 'ALL' || visibleClients.includes(p.clientId)) && p.clientResponse?.evidenceRef && p.presentedSnapshot?.revision === p.revision);

  const selectedEng = scopedEngagements.find(e => e.id === state.selectedEngagement) || scopedEngagements[0];
  const client = scopedClients.find(c => c.id === selectedEng?.client);
  const lifecycleStatus = selectedEng?.lifecycleStatus || 'Active';
  const updateLifecycle = (status: NonNullable<EngagementRecord['lifecycleStatus']>) => {
    const reason = window.prompt(`Reason for ${status.toLowerCase()} engagement:`);
    if (!reason?.trim()) return;
    try { prototypeStore.setEngagementLifecycle(selectedEng!.id, status, reason); }
    catch (error) { window.alert(error instanceof Error ? error.message : String(error)); }
  };
  const openAdminEditor = () => {
    if (!selectedEng) return;
    setEditService(selectedEng.service);
    setEditYear(selectedEng.year);
    setEditPeriod(selectedEng.period);
    setEditDue(selectedEng.due);
    setEditManager(selectedEng.manager);
    setEditPartner(selectedEng.partner);
    setEditTeam([...selectedEng.team]);
    setShowEditAdminModal(true);
  };
  const commitAdminChanges = (): boolean => {
    if (!selectedEng) return false;
    try {
      prototypeStore.updateEngagement({ ...selectedEng, service: editService, year: editYear, period: editPeriod, due: editDue, manager: editManager, partner: editPartner, team: editTeam });
      setShowEditAdminModal(false);
      return true;
    } catch (error) { window.alert(error instanceof Error ? error.message : String(error)); return false; }
  };
  const saveAdminChanges = (event: React.FormEvent) => { event.preventDefault(); commitAdminChanges(); };
  const assignedPeople = state.users.filter(user => {
    const visible = visibleEngagementIds(state, user.id);
    return user.status === 'Active' && user.group === 'Professional' && selectedEng && (visible === 'ALL' || visible.includes(selectedEng.id));
  });
  const engagementScopeChanged = Boolean(selectedEng && (editService !== selectedEng.service || editYear !== selectedEng.year || editPeriod !== selectedEng.period));
  const engagementTeamChanged = Boolean(selectedEng && (editManager !== selectedEng.manager || editPartner !== selectedEng.partner || JSON.stringify(editTeam) !== JSON.stringify(selectedEng.team)));

  const newEngagementDraft = () => JSON.stringify({ clientId, service, year, manager, partner, fee, proposalId });
  const discardNewEngagementDraft = () => {
    if (!newEngagementBaseline.current) return;
    const baseline = JSON.parse(newEngagementBaseline.current);
    setClientId(baseline.clientId); setService(baseline.service); setYear(baseline.year);
    setManager(baseline.manager); setPartner(baseline.partner); setFee(baseline.fee); setProposalId(baseline.proposalId);
  };
  const closeNewEngagement = () => onBeforeContextChange(() => setShowNewEngModal(false));
  const closeEditEngagement = () => onBeforeContextChange(() => setShowEditAdminModal(false));

  useEffect(() => {
    if (!showNewEngModal) { onRegisterUnsavedForm(null, 'engagement-create'); return; }
    onRegisterUnsavedForm({
      label: 'new engagement draft',
      isDirty: () => Boolean(newEngagementBaseline.current && newEngagementDraft() !== newEngagementBaseline.current),
      save: () => commitNewEngagement(),
      discard: discardNewEngagementDraft,
    }, 'engagement-create');
    return () => onRegisterUnsavedForm(null, 'engagement-create');
  }, [showNewEngModal, clientId, service, year, manager, partner, fee, proposalId, onRegisterUnsavedForm]);

  useEffect(() => {
    if (!showEditAdminModal || !selectedEng) { onRegisterUnsavedForm(null, 'engagement-edit'); return; }
    onRegisterUnsavedForm({
      label: 'engagement administration draft',
      isDirty: () => editService !== selectedEng.service || editYear !== selectedEng.year || editPeriod !== selectedEng.period || editDue !== selectedEng.due || editManager !== selectedEng.manager || editPartner !== selectedEng.partner || JSON.stringify(editTeam) !== JSON.stringify(selectedEng.team),
      save: () => commitAdminChanges(),
      discard: () => {
        setEditService(selectedEng.service); setEditYear(selectedEng.year); setEditPeriod(selectedEng.period); setEditDue(selectedEng.due);
        setEditManager(selectedEng.manager); setEditPartner(selectedEng.partner); setEditTeam([...selectedEng.team]);
      },
    }, 'engagement-edit');
    return () => onRegisterUnsavedForm(null, 'engagement-edit');
  }, [showEditAdminModal, selectedEng, editService, editYear, editPeriod, editDue, editManager, editPartner, editTeam, onRegisterUnsavedForm]);

  // The journey tracker is derived from this engagement's own records: its
  // acceptance decision, reviewed plan, linked risks, workpapers, findings,
  // review points, sign-offs and releases. Nothing here is positional.
  const engagementProgress = selectedEng
    ? deriveEngagementJourney({ state, engagement: selectedEng, clientName: scopedClients.find(item => item.id === selectedEng.client)?.name })
    : null;

  if (!scopedEngagements.length) return <div className="panel panel-pad"><h2>No engagement access</h2><p className="sub mt8">No engagements are available under the active scope grant.</p></div>;

  const commitNewEngagement = (): boolean => {
    const proposal = state.proposals.find(item => item.id === proposalId);
    if (proposalId && !acceptedProposals.some(item => item.id === proposalId)) { window.alert('Select a currently accepted proposal with client response evidence.'); return false; }
    const newId = `ENG-2600${state.engagements.length + 1}`;
    const newEng: EngagementRecord = {
      id: newId,
      client: proposal?.clientId || clientId,
      service: proposal?.items.map(item => item.serviceName).join(' + ') || service,
      stage: proposal ? 'Draft' : 'Planning',
      year,
      mode: service === 'External audit' ? 'External books' : 'Client accounting records',
      period: `01 Jan – 31 Dec ${year}`,
      due: `${year}-10-31`,
      manager,
      partner,
      team: [manager, partner, 'Adam Khan', 'Sara Malik'],
      agreedFee: proposal?.totalAmount ?? fee,
      currency: proposal?.currency || 'QAR',
      proposalId: proposal?.id,
      acceptance: !proposal,
      terms: !proposal,
      planning: true,
      sourceAccepted: false,
      mappingApproved: false,
      generation: 1,
      packageRevision: 1,
      builtGeneration: 1,
      sourceVersion: 1,
      eqrRequired: service === 'External audit',
      opinion: 'Standard unmodified',
      releases: [],
      approvals: { manager: null, client: null, partner: null, eqr: null },
      rows: [
        { code: '1000', name: 'Cash and bank balances', type: 'asset', balance: 500000 },
        { code: '1100', name: 'Trade receivables', type: 'asset', balance: 300000 },
        { code: '2000', name: 'Trade payables', type: 'liability', balance: -200000 },
        { code: '3000', name: 'Share capital', type: 'equity', balance: -600000 }
      ],
      adjustment: 0,
      journalState: 'Applied',
      sourceReflection: true,
      supplements: true,
      reconciliations: [],
      workpapers: [],
      reviews: [],
      pbc: [],
      annual: { confirmed: [], decision: null, nextId: null },
      questionnaire: { answers: { 0: true, 1: true, 2: true, 3: true }, status: 'Completed' },
      events: []
    };

    try { prototypeStore.addEngagement(newEng); setShowNewEngModal(false); setProposalId(''); return true; }
    catch (error: any) { window.alert(error.message); return false; }
  };
  const handleCreateEngagement = (event: React.FormEvent) => { event.preventDefault(); commitNewEngagement(); };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Engagements</h1>
          <p>One legal scope, one reporting period, one accountable team.</p>
        </div>
        <button className="btn primary sm" onClick={() => { newEngagementBaseline.current = newEngagementDraft(); setShowNewEngModal(true); }}>
          <Icon name="plus" /> New Engagement
        </button>
        <ModuleIdentityLine />
        <ModuleLifecycleHint />
      </div>

      {/* Selected Engagement Card */}
      {selectedEng && (
        <div className="panel panel-pad">
          <div className="between">
            <div>
              <span className="eyebrow">SELECTED ENGAGEMENT · {selectedEng.id}</span>
              <h2 className="mt8">{client?.name}</h2>
              <p className="sub">{selectedEng.service} · {selectedEng.period} · {selectedEng.mode}</p>
            </div>
            <div className="stack" style={{ justifyItems: 'end', gap: 6 }}><StatusBadge status={selectedEng.stage} /><span className={`badge ${lifecycleStatus === 'Active' ? 'green' : lifecycleStatus === 'Suspended' ? 'amber' : 'red'}`}>{lifecycleStatus}</span></div>
          </div>

          {/* Workflow progress tracker — every number is derived from this
              engagement's own records, reviews, findings, approvals and releases.
              It replaces the previous index-based bar, which could not express a
              blocked, returned or stale step. */}
          <div className="mt16">
            {engagementProgress && (
              <WorkflowProgressTracker
                progress={engagementProgress}
                onStepSelect={step => {
                  const route = step.targetSection as RouteKey | undefined;
                  if (route) onNavigate(route);
                }}
              />
            )}
          </div>

          <div className="info-grid mt16">
            <div><label>Engagement Manager</label><span>{selectedEng.manager}</span></div>
            <div><label>Professional Signatory</label><span>{selectedEng.partner}</span></div>
            <div><label>Management Contact</label><span>{client?.contact}</span></div>
            <div><label>Effective Terms</label><span className={`badge ${selectedEng.terms ? 'green' : 'amber'}`}>{selectedEng.terms ? 'Recorded' : 'Pending'}</span></div>
            <div><label>Professional Acceptance</label><span className={`badge ${selectedEng.professionalAcceptance ? 'green' : selectedEng.acceptance ? 'green' : 'amber'}`}>{selectedEng.professionalAcceptance ? `Accepted by ${selectedEng.professionalAcceptance.by}` : selectedEng.acceptance ? 'Recorded' : 'Pending'}</span></div>
            <div><label>Agreed Fee</label><span>{formatCurrency(selectedEng.agreedFee, selectedEng.currency)}</span></div>
          </div>

          <div className="row mt20 wrap" style={{ gap: 10 }}>
            {!['Cancelled', 'Closed'].includes(lifecycleStatus) && <button className="btn sm" onClick={openAdminEditor}>Edit Engagement Details</button>}
            {selectedEng.stage === 'Draft' && <button className="btn primary sm" onClick={() => { const evidence = window.prompt('Professional acceptance evidence reference:'); if (evidence?.trim()) { try { prototypeStore.activateEngagement(selectedEng.id, evidence); } catch (error: any) { window.alert(error.message); } } }}>Activate Engagement</button>}
            {lifecycleStatus === 'Active' && <><button className="btn sm" onClick={() => updateLifecycle('Suspended')}>Suspend Engagement</button><button className="btn sm danger" onClick={() => updateLifecycle('Cancelled')}>Cancel Engagement</button><button className="btn sm ghost" onClick={() => updateLifecycle('Closed')}>Close Engagement</button></>}
            {lifecycleStatus === 'Suspended' && <><button className="btn sm primary" onClick={() => updateLifecycle('Active')}>Resume Engagement</button><button className="btn sm danger" onClick={() => updateLifecycle('Cancelled')}>Cancel Engagement</button><button className="btn sm ghost" onClick={() => updateLifecycle('Closed')}>Close Engagement</button></>}
            <button className="btn sm" onClick={() => onNavigate('accounting-setup')}>
              <Icon name="calculator" /> Accounting Workbench
            </button>
            <button className="btn sm" onClick={() => onNavigate('audit')}>
              <Icon name="checkboard" /> Audit Workpapers
            </button>
            <button className="btn sm" onClick={() => onNavigate('delivery')}>
              <Icon name="archive" /> Release Gates
            </button>
            <button className="btn sm ghost" onClick={() => setShowScopeModal(true)}>
              <Icon name="layers" /> View Scope & Duties
            </button>
          </div>
          {selectedEng.events?.some(event => event.type === 'lifecycle' || event.text.startsWith('Engagement administration changed')) && <div className="borderbox mt16"><b>Engagement lifecycle and change history</b><ul className="mt8">{selectedEng.events.filter(event => event.type === 'lifecycle' || event.text.startsWith('Engagement administration changed')).slice().reverse().map((event, index) => <li key={`${event.time}-${index}`}>{new Date(event.time).toLocaleString('en-GB')} · {event.text}</li>)}</ul></div>}
        </div>
      )}

      {showEditAdminModal && selectedEng && (
        <div className="modal-backdrop" data-dismiss-guard="self" onClick={event => { if (event.target === event.currentTarget) closeEditEngagement(); }}>
          <form className="modal" style={{ maxWidth: 620 }} onSubmit={saveAdminChanges} onClick={event => event.stopPropagation()}>
            <div className="modal-head"><h2>Edit Engagement Details</h2><button type="button" className="icon-btn" onClick={closeEditEngagement}>✕</button></div>
            <div className="modal-body stack" style={{ gap: 12 }}>
              <div className="grid2"><label>Service scope<select aria-label="Engagement service" className="input" value={editService} onChange={event => setEditService(event.target.value)}>{[...new Set(state.engagements.map(engagement => engagement.service))].sort().map(service => <option key={service}>{service}</option>)}</select></label><label>Reporting year<input aria-label="Engagement reporting year" className="input" type="number" min="1900" max="2100" value={editYear} onChange={event => setEditYear(Number(event.target.value))} required /></label></div>
              <label>Reporting period<input aria-label="Engagement reporting period" className="input" value={editPeriod} onChange={event => setEditPeriod(event.target.value)} required /></label>
              <label>Target date<input aria-label="Engagement target date" className="input" type="date" value={editDue} onChange={event => setEditDue(event.target.value)} required /></label>
              <div className="grid2">
                <label>Engagement manager<select aria-label="Engagement manager" className="input" value={editManager} onChange={event => setEditManager(event.target.value)}>{assignedPeople.filter(user => user.role === 'manager').map(user => <option key={user.id}>{user.name}</option>)}</select></label>
                <label>Signing partner<select aria-label="Signing partner" className="input" value={editPartner} onChange={event => setEditPartner(event.target.value)}>{assignedPeople.filter(user => user.role === 'partner').map(user => <option key={user.id}>{user.name}</option>)}</select></label>
              </div>
              <fieldset className="stack"><legend>Assigned professional team</legend>{assignedPeople.filter(user => ['manager', 'partner', 'preparer', 'reviewer', 'eqr'].includes(user.role)).map(user => <label key={user.id}><input type="checkbox" checked={editTeam.includes(user.name)} onChange={event => setEditTeam(current => event.target.checked ? [...new Set([...current, user.name])] : current.filter(name => name !== user.name))} /> {user.label} — {user.name}</label>)}</fieldset>
               <p className="sub">Agreed fee and currency remain pinned to the accepted commercial proposal; this administrative edit does not amend them. Team members need active access to this engagement.</p>
               {engagementScopeChanged && <div className="borderbox mt8" role="status" style={{ borderColor: '#d97706', background: '#fffbeb' }}><b>Scope or period change impact</b><p>Saving will clear planning, source acceptance and mapping approval; mark statement, reconciliation and cash-flow reviews stale; supersede the active audit plan; require reassessment of performed procedures; and invalidate release approvals.</p></div>}
               {engagementTeamChanged && <div className="borderbox mt8" role="status" style={{ borderColor: '#d97706', background: '#fffbeb' }}><b>Team change impact</b><p>Saving will supersede the active audit-plan review and require reassessment of performed procedures. Existing records stay linked to this engagement; access is still checked for every assigned person.</p></div>}
               <p className="sub">Any saved administration change is recorded in history and invalidates prior release approvals.</p>
            </div>
            <div className="modal-foot"><button type="button" className="btn sm ghost" onClick={closeEditEngagement}>Cancel</button><button type="submit" className="btn sm primary">Save Engagement Details</button></div>
          </form>
        </div>
      )}

      {/* All Engagements Table */}
      <div className="panel">
        <div className="panel-head">
          <h3>Engagement Portfolio ({scopedEngagements.length})</h3>
          <span className="caption">Multi-entity Practice Delivery</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Engagement ID</th>
                <th>Service</th>
                <th>Period</th>
                <th>Stage</th>
                <th>Signatories</th>
                <th>Fee</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scopedEngagements.length === 0 && (
                <ListState
                  colSpan={8}
                  kind="no-match"
                  message="No engagements match the current scope and filters"
                  hint="Engagements exist for this practice but none are reachable with your current client, status and search filters. Clear a filter, or confirm the engagement has been accepted and activated."
                />
              )}
              {scopedEngagements.map(eng => {
                const c = scopedClients.find(x => x.id === eng.client);
                return (
                  <tr key={eng.id}>
                    <td><b>{c?.name}</b></td>
                    <td><span className="mono">{eng.id}</span></td>
                    <td>{eng.service}</td>
                    <td>{eng.period}</td>
                    <td><StatusBadge status={eng.stage} /></td>
                    <td>
                      <div className="cell-sub">Mgr: {eng.manager}</div>
                      <div className="cell-sub">Ptnr: {eng.partner}</div>
                    </td>
                    <td>{formatCurrency(eng.agreedFee, eng.currency)}</td>
                    <td>
                      <button
                        className="btn sm"
                        onClick={() => prototypeStore.setSelectedEngagement(eng.id)}
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedEng && <InternalNotesPanel subjectType="engagement" subjectId={selectedEng.id} onBeforeContextChange={onBeforeContextChange} onRegisterUnsavedForm={onRegisterUnsavedForm} />}

      {/* Scope Modal */}
      {showScopeModal && selectedEng && (
        <div className="modal-backdrop" onClick={() => setShowScopeModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Service Scope: {selectedEng.service}</h2>
              <button className="icon-btn" onClick={() => setShowScopeModal(false)}>✕</button>
            </div>
            <div className="modal-body stack" style={{ gap: 12 }}>
              <div className="borderbox" style={{ padding: 12 }}>
                <h4>Engagement Mandate</h4>
                <p className="sub mt8">
                  Governed by International Standards on Auditing (ISA) and the regulatory framework of {client?.jurisdiction}. Includes independent audit of financial position, comprehensive substantive testing, and management letter issuance.
                </p>
              </div>
              <div className="borderbox" style={{ padding: 12 }}>
                <h4>Governance & Approvals</h4>
                <p className="sub mt8">
                  Strict separation of duties: Preparer (Adam Khan) performs fieldwork, Senior Reviewer (Sara Malik) evaluates sufficiency, Manager (Layla Rahman) reviews file consistency, and Partner (Daniel James) retains sole release authorization.
                </p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setShowScopeModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Engagement Modal */}
      {showNewEngModal && (
        <div className="modal-backdrop" data-dismiss-guard="self" onClick={event => { if (event.target === event.currentTarget) closeNewEngagement(); }}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Launch New Engagement</h2>
              <button className="icon-btn" onClick={closeNewEngagement}>✕</button>
            </div>
            <form onSubmit={handleCreateEngagement}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Accepted proposal (optional)</label>
                  <select className="input" value={proposalId} onChange={e => { const id = e.target.value; setProposalId(id); const p = acceptedProposals.find(item => item.id === id); if (p) setClientId(p.clientId!); }}>
                    <option value="">Create from separately recorded acceptance</option>
                    {acceptedProposals.map(p => <option key={p.id} value={p.id}>{p.title} · Rev {p.revision} · {formatCurrency(p.totalAmount, p.currency)}</option>)}
                  </select>
                </div>
                {proposalId && <p className="sub">A draft will inherit the accepted proposal’s client, service and fee. Partner activation remains a separate recorded decision.</p>}
                <div>
                  <label className="caption">Client Entity</label>
                  <select
                    className="input"
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                  >
                    {scopedClients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                    ))}
                  </select>
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Service</label>
                    <select
                      className="input"
                      value={service}
                      onChange={e => setService(e.target.value)}
                    >
                      <option value="External audit">External audit</option>
                      <option value="Annual accounts">Annual accounts</option>
                      <option value="Internal audit">Internal audit</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Reporting Year</label>
                    <input
                      type="number"
                      className="input"
                      value={year}
                      onChange={e => setYear(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Engagement Manager</label>
                    <input
                      type="text"
                      className="input"
                      value={manager}
                      onChange={e => setManager(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="caption">Signing Partner</label>
                    <input
                      type="text"
                      className="input"
                      value={partner}
                      onChange={e => setPartner(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="caption">Agreed Professional Fee (QAR)</label>
                  <input
                    type="number"
                    className="input"
                    value={fee}
                    onChange={e => setFee(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={closeNewEngagement}>Cancel</button>
                <button type="submit" className="btn primary sm">Create Engagement</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
