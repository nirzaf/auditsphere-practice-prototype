// Module 03: Leads & Opportunities Pipeline (VP-009)
import React, { useEffect, useRef, useState } from 'react';
import { ActivityTimeline } from '../common/ActivityTimeline';
import { RouteKey, LeadOpportunity } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';
import { visibleClientIds } from '../../services/guards';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { StatusBadge } from '../common/StatusBadge';
import { LifecycleStepper } from '../common/Lifecycle';
import { lifecycleById } from '../../services/lifecycles';
import { keyboardActivate } from '../common/keyboardActivate';

interface LeadsPipelineViewProps {
  onNavigate: (route: RouteKey) => void;
  onBeforeContextChange: (change: () => void) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const LeadsPipelineView: React.FC<LeadsPipelineViewProps> = ({ onNavigate, onBeforeContextChange, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadOpportunity | null>(null);
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('pipeline');
  const [conversionClientId, setConversionClientId] = useState('');

  // New lead form
  const [leadName, setLeadName] = useState('');
  const [contact, setContact] = useState('');
  const [service, setService] = useState('External audit');
  const [value, setValue] = useState(1000000);
  const [currency, setCurrency] = useState('QAR');
  const [stage, setStage] = useState<LeadOpportunity['stage']>('Inquiry');
  const [source, setSource] = useState('');
  const [intakeChannel, setIntakeChannel] = useState<LeadOpportunity['intakeChannel']>('Email');
  const [entityStructure, setEntityStructure] = useState<LeadOpportunity['entityStructure']>('Standalone');
  const [parentEntity, setParentEntity] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [discoveryNotes, setDiscoveryNotes] = useState('');
  const leadForm = useRef<HTMLFormElement>(null);
  const initialLeadDraft = useRef({ name: '', contact: '', service: 'External audit', value: 1000000, currency: 'QAR', stage: 'Inquiry' as LeadOpportunity['stage'], source: '', intakeChannel: 'Email' as LeadOpportunity['intakeChannel'], entityStructure: 'Standalone' as LeadOpportunity['entityStructure'], parentEntity: '', targetDate: '', nextAction: '', discoveryNotes: '' });

  const stages: Array<LeadOpportunity['stage']> = ['Inquiry', 'Discovery', 'Evaluation', 'Proposal', 'Won', 'Lost', 'Unqualified'];
  const clientScope = visibleClientIds(state);
  const convertibleClients = state.clients.filter(client => clientScope === 'ALL' || clientScope.includes(client.id));

  const saveLeadDraft = () => {
    if (!leadForm.current?.reportValidity()) return false;
    const newLead: LeadOpportunity = {
      id: `LD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      name: leadName,
      contact: contact || 'Contact Person',
      service,
      value,
      currency,
      stage,
      owner: state.currentPerson,
      source: source.trim() || undefined,
      intakeChannel,
      entityStructure,
      parentEntity: parentEntity.trim() || undefined,
      targetDate: targetDate || undefined,
      nextAction: nextAction.trim() || undefined,
      discoveryNotes: discoveryNotes.trim() || undefined,
      accepted: false,
      terms: false
    };

    try {
      prototypeStore.addLead(newLead);
      setShowAddModal(false);
      setLeadName(''); setContact(''); setService('External audit'); setValue(1000000); setCurrency('QAR'); setStage('Inquiry');
      setSource(''); setIntakeChannel('Email'); setEntityStructure('Standalone'); setParentEntity(''); setTargetDate(''); setNextAction(''); setDiscoveryNotes('');
      return true;
    } catch (error) { window.alert(error instanceof Error ? error.message : String(error)); return false; }
  };
  const handleAddLead = (e: React.FormEvent) => { e.preventDefault(); saveLeadDraft(); };

  useEffect(() => {
    const guard: UnsavedFormGuard = {
      label: 'commercial inquiry draft',
      isDirty: () => showAddModal && JSON.stringify({ name: leadName, contact, service, value, currency, stage, source, intakeChannel, entityStructure, parentEntity, targetDate, nextAction, discoveryNotes }) !== JSON.stringify(initialLeadDraft.current),
      save: saveLeadDraft,
      discard: () => {
        setShowAddModal(false); setLeadName(''); setContact(''); setService('External audit'); setValue(1000000); setCurrency('QAR'); setStage('Inquiry');
        setSource(''); setIntakeChannel('Email'); setEntityStructure('Standalone'); setParentEntity(''); setTargetDate(''); setNextAction(''); setDiscoveryNotes('');
      }
    };
    onRegisterUnsavedForm(guard, 'lead-create');
    return () => onRegisterUnsavedForm(null, 'lead-create');
  }, [showAddModal, leadName, contact, service, value, currency, stage, source, targetDate, nextAction, discoveryNotes, onRegisterUnsavedForm]);

  const requestLeadClose = () => onBeforeContextChange(() => setShowAddModal(false));

  const saveLeadDetails = () => {
    if (!selectedLead) return;
    try { prototypeStore.updateLead(selectedLead); }
    catch (error) { window.alert(error instanceof Error ? error.message : String(error)); }
  };

  const handleConvert = (leadId: string) => {
    prototypeStore.convertLead(leadId, conversionClientId || undefined);
    setSelectedLead(null);
    setConversionClientId('');
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Acquisition & Commercial Pipeline</h1>
          <p>Qualify commercial opportunities without confusing inquiry with professional acceptance.</p>
        </div>
        <button className="btn primary sm" onClick={() => setShowAddModal(true)}>
          <Icon name="plus" /> New Inquiry
        </button>
        <button className="btn sm ghost" aria-pressed={viewMode === 'list'} onClick={() => setViewMode(viewMode === 'pipeline' ? 'list' : 'pipeline')}>{viewMode === 'pipeline' ? 'List view' : 'Pipeline view'}</button>
      </div>

      {/* Metrics */}
      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Open Opportunities</span>
          <div className="metric-val">{state.leads.filter(l => !['Won', 'Lost', 'Unqualified'].includes(l.stage)).length}</div>
          <span className="metric-sub">Commercial prospect pipeline</span>
        </div>
        <div className="metric purple">
          <span className="metric-label">Proposed Fees Pipeline</span>
          <div className="metric-val">
            {Array.from(new Set(state.leads.filter(l => !['Won', 'Lost', 'Unqualified'].includes(l.stage)).map(l => l.currency))).map(code => formatCurrency(state.leads.filter(l => !['Won', 'Lost', 'Unqualified'].includes(l.stage) && l.currency === code).reduce((sum, lead) => sum + lead.value, 0), code)).join(' · ') || formatCurrency(0)}
          </div>
          <span className="metric-sub">Commercial value, unbilled</span>
        </div>
        <div className="metric blue">
          <span className="metric-label">Converted / Won</span>
          <div className="metric-val">{state.leads.filter(l => l.stage === 'Won').length}</div>
          <span className="metric-sub">Ready for engagement onboarding</span>
        </div>
      </div>

      {/* Pipeline and full outcome list */}
      {state.leads.length === 0 && (
        <div className="panel panel-pad text-center" style={{ padding: '32px 20px' }}>
          <h3>No inquiries registered</h3>
          <p className="sub max-w-md mx-auto mt8">
            Use “New Inquiry” to register a commercial lead. Inquiries qualify through the pipeline to Won, Lost, or Unqualified — outcomes require a recorded reason and Won leads convert into prospect clients.
          </p>
        </div>
      )}
      {viewMode === 'list' ? <div className="panel tablewrap"><table><thead><tr><th>Opportunity</th><th>Stage</th><th>Service</th><th>Owner</th><th>Expected fee</th><th>Target date</th><th>Next action</th><th /></tr></thead><tbody>{state.leads.length === 0 && <tr><td colSpan={8} className="sub text-center" style={{ padding: 16 }}>No leads match the current view.</td></tr>}{state.leads.map(lead => <tr key={lead.id}><td>{lead.name}<div className="cell-sub">{lead.contact} · {lead.id}</div></td><td>{lead.stage}{lead.lostReason ? <div className="cell-sub">{lead.lostReason}</div> : null}</td><td>{lead.service}</td><td>{lead.owner}</td><td>{formatCurrency(lead.value, lead.currency)}</td><td>{lead.targetDate || '—'}</td><td>{lead.nextAction || '—'}</td><td><button className="btn sm ghost" onClick={() => { setSelectedLead(lead); setConversionClientId(''); }}>Details</button></td></tr>)}</tbody></table></div> : <div className="kanban">
        {stages.filter(s => !['Lost', 'Unqualified'].includes(s)).map((col, idx) => {
          const colLeads = state.leads.filter(l => l.stage === col);
          return (
            <div key={col} className="kanban-col">
              <div className="kanban-title">
                <span>{col}</span>
                <span className="tag gray">{colLeads.length}</span>
              </div>
              {colLeads.map(l => (
                <div {...keyboardActivate}
                  key={l.id}
                  className="lead-card"
                  onClick={() => { setSelectedLead(l); setConversionClientId(''); }}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className={`badge ${idx % 2 ? 'purple' : 'teal'}`}>{l.service}</span>
                    <span className="badge blue">{l.intakeChannel || 'Email'}</span>
                    {l.entityStructure && l.entityStructure !== 'Standalone' && (
                      <span className="badge gray">{l.entityStructure}</span>
                    )}
                  </div>
                  <h3 className="mt8">{l.name}</h3>
                  <p className="cell-sub">{l.contact} · {l.id}{l.parentEntity ? ` · Sub of ${l.parentEntity}` : ''}</p>
                  <div className="value mt8">{formatCurrency(l.value, l.currency)}</div>
                  <div className="between mt12">
                    <span className="caption">{l.accepted ? 'Accepted' : 'Pending'}</span>
                    <button
                      className="btn sm ghost"
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedLead(l);
                        setConversionClientId('');
                      }}
                    >
                      Details
                    </button>
                  </div>
                </div>
              ))}
              <button className="kanban-add" onClick={() => { setStage(col); setShowAddModal(true); }}>
                + Add opportunity
              </button>
            </div>
          );
        })}
      </div>}

      {/* Lead Detail & Conversion Modal */}
      {selectedLead && (
        <div className="modal-backdrop" onClick={() => setSelectedLead(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Opportunity Details: {selectedLead.name}</h2>
              <button className="icon-btn" onClick={() => { setSelectedLead(null); setConversionClientId(''); }}>✕</button>
            </div>
            <div className="modal-body stack" style={{ gap: 12 }}>
              <div className="info-grid">
                <div><label>ID</label><span>{selectedLead.id}</span></div>
                <div><label>Service</label><span>{selectedLead.service}</span></div>
                <div><label>Pipeline Value</label><span>{formatCurrency(selectedLead.value, selectedLead.currency)}</span></div>
                <div><label>Current Stage</label><span><StatusBadge status={selectedLead.stage} /></span></div>
                <div><label>Intake Channel</label><span className="badge blue">{selectedLead.intakeChannel || 'Email'}</span></div>
                <div><label>Corporate Structure</label><span>{selectedLead.entityStructure || 'Standalone'}{selectedLead.parentEntity ? ` (${selectedLead.parentEntity})` : ''}</span></div>
                <div><label>Primary Contact</label><span>{selectedLead.contact}</span></div>
              <div><label>Commercial Owner</label><span>{selectedLead.owner}</span></div>
              <div className="full"><LifecycleStepper definition={lifecycleById('lead')} status={selectedLead.stage} label={`${selectedLead.id} pipeline stage`} />{['Lost', 'Unqualified'].includes(selectedLead.stage) && <p className="caption">{selectedLead.stage} is a terminal commercial outcome and is excluded from open pipeline totals.</p>}</div>
              <div><label>Stage history</label><ActivityTimeline label="Opportunity stage history" emptyText="No stage transitions recorded yet." entries={(selectedLead.history || []).map((h, i) => ({ id: `${i}`, title: h.stage, actor: h.by, at: h.at, reason: h.reason }))} /></div>
              </div>

              {!selectedLead.convertedClientId && <div className="stack" style={{ gap: 8 }}>
                <h4>Editable Opportunity Details</h4>
                <div className="grid2">
                  <label className="caption">Commercial owner<input className="input" value={selectedLead.owner} onChange={e => setSelectedLead({ ...selectedLead, owner: e.target.value })} /></label>
                  <label className="caption">Contact<input className="input" value={selectedLead.contact} onChange={e => setSelectedLead({ ...selectedLead, contact: e.target.value })} /></label>
                  <label className="caption">Intake Channel
                    <select className="input" value={selectedLead.intakeChannel || 'Email'} onChange={e => setSelectedLead({ ...selectedLead, intakeChannel: e.target.value as any })}>
                      <option value="Phone">Phone</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Email">Email</option>
                      <option value="Web Form">Web Form</option>
                      <option value="Referral">Referral</option>
                    </select>
                  </label>
                  <label className="caption">Corporate Hierarchy
                    <select className="input" value={selectedLead.entityStructure || 'Standalone'} onChange={e => setSelectedLead({ ...selectedLead, entityStructure: e.target.value as any })}>
                      <option value="Standalone">Standalone Entity</option>
                      <option value="Holding">Holding Company (Parent)</option>
                      <option value="Subsidiary">Subsidiary</option>
                      <option value="Affiliate">Affiliate</option>
                    </select>
                  </label>
                  {(selectedLead.entityStructure === 'Subsidiary' || selectedLead.entityStructure === 'Affiliate') && (
                    <label className="caption full">Parent Holding Entity
                      <input className="input" value={selectedLead.parentEntity || ''} onChange={e => setSelectedLead({ ...selectedLead, parentEntity: e.target.value })} placeholder="e.g. Al-Sulaiti Global Holding Q.P.S.C." />
                    </label>
                  )}
                  <label className="caption">Requested service<input className="input" value={selectedLead.service} onChange={e => setSelectedLead({ ...selectedLead, service: e.target.value })} /></label>
                  <label className="caption">Expected fee<input className="input" type="number" min="0" step="0.01" value={selectedLead.value} onChange={e => setSelectedLead({ ...selectedLead, value: Number(e.target.value) })} /></label>
                  <label className="caption">Currency<select className="input" value={selectedLead.currency} onChange={e => setSelectedLead({ ...selectedLead, currency: e.target.value })}><option>QAR</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
                  <label className="caption">Inquiry source<input className="input" value={selectedLead.source || ''} onChange={e => setSelectedLead({ ...selectedLead, source: e.target.value })} /></label>
                  <label className="caption">Target date<input className="input" type="date" value={selectedLead.targetDate || ''} onChange={e => setSelectedLead({ ...selectedLead, targetDate: e.target.value || undefined })} /></label>
                </div>
                <label className="caption">Next action<input className="input" value={selectedLead.nextAction || ''} onChange={e => setSelectedLead({ ...selectedLead, nextAction: e.target.value })} /></label>
                <label className="caption">Discovery notes<textarea className="input" rows={2} value={selectedLead.discoveryNotes || ''} onChange={e => setSelectedLead({ ...selectedLead, discoveryNotes: e.target.value })} /></label>
                <button className="btn sm ghost" onClick={saveLeadDetails}>Save Opportunity Details</button>
              </div>}

              {selectedLead.stage !== 'Won' && !selectedLead.convertedClientId && <div className="grid2">
                <label className="caption">Update stage<select className="input" value={selectedLead.stage} onChange={e => { const nextStage = e.target.value as LeadOpportunity['stage']; const needsReason = ['Lost', 'Unqualified'].includes(nextStage); const reason = needsReason ? (window.prompt('Reason for lost or unqualified outcome (required):', '') || undefined) : undefined; if (needsReason && !reason?.trim()) return; const next: LeadOpportunity = { ...selectedLead, stage: nextStage, lostReason: reason }; try { prototypeStore.updateLead(next); setSelectedLead({ ...next }); } catch (error: any) { window.alert(error.message); } }}>
                  {stages.map(value => <option key={value}>{value}</option>)}
                </select></label>
                {['Lost', 'Unqualified'].includes(selectedLead.stage) && <label className="caption">Outcome reason<input className="input" value={selectedLead.lostReason || ''} readOnly placeholder="Captured when outcome was recorded" /></label>}
              </div>}

              <div className="divider" />

              <div className="borderbox" style={{ padding: 12 }}>
                <h4>Commercial Conversion Gate</h4>
                <p className="sub mt8">
                  Converting an inquiry creates a draft client and transfers to the acceptance and terms workflow. A proposal does not constitute professional engagement authorization.
                </p>
                {selectedLead.stage === 'Won' && !selectedLead.convertedClientId ? (
                  <>
                    <label className="caption mt12">Link an existing permitted client (optional)<select className="input" aria-label="Existing client for conversion" value={conversionClientId} onChange={e => setConversionClientId(e.target.value)}>
                      <option value="">Create a new Prospect</option>
                      {convertibleClients.map(client => <option key={client.id} value={client.id}>{client.name} · {client.id} · {client.status}</option>)}
                    </select></label>
                    <button className="btn primary sm mt12" onClick={() => handleConvert(selectedLead.id)}>
                      {conversionClientId ? 'Link Won Opportunity to Client' : 'Convert Won Opportunity to Prospect'}
                    </button>
                  </>
                ) : selectedLead.convertedClientId ? (
                  <span className="tag green mt12">Converted to {convertibleClients.find(client => client.id === selectedLead.convertedClientId)?.name || 'a prospect'}</span>
                ) : (
                  <span className="caption mt12">Mark this opportunity Won before converting it to a prospect.</span>
                )}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setSelectedLead(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* New Opportunity Modal */}
      {showAddModal && (
        <div className="modal-backdrop" data-dismiss-guard="self" onClick={requestLeadClose}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lead-create-title" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2 id="lead-create-title">Register Commercial Inquiry</h2>
              <button type="button" className="icon-btn" onClick={requestLeadClose}>✕</button>
            </div>
            <form ref={leadForm} onSubmit={handleAddLead}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Prospective Client Name</label>
                  <input
                    type="text"
                    className="input"
                    value={leadName}
                    onChange={e => setLeadName(e.target.value)}
                    placeholder="e.g. Oryx Petroleum W.L.L."
                    required
                  />
                </div>
                <div>
                  <label className="caption">Primary Contact</label>
                  <input
                    type="text"
                    className="input"
                    value={contact}
                    onChange={e => setContact(e.target.value)}
                    placeholder="e.g. Mansour Al-Hajri"
                  />
                </div>
                <div className="grid2">
                  <label className="caption">Intake Channel
                    <select className="input" value={intakeChannel} onChange={e => setIntakeChannel(e.target.value as any)}>
                      <option value="Phone">Phone</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Email">Email</option>
                      <option value="Web Form">Web Form</option>
                      <option value="Referral">Referral</option>
                    </select>
                  </label>
                  <label className="caption">Corporate Hierarchy
                    <select className="input" value={entityStructure} onChange={e => setEntityStructure(e.target.value as any)}>
                      <option value="Standalone">Standalone Entity</option>
                      <option value="Holding">Holding Company (Parent)</option>
                      <option value="Subsidiary">Subsidiary</option>
                      <option value="Affiliate">Affiliate</option>
                    </select>
                  </label>
                </div>
                {(entityStructure === 'Subsidiary' || entityStructure === 'Affiliate') && (
                  <div>
                    <label className="caption">Parent Holding Entity</label>
                    <input className="input" value={parentEntity} onChange={e => setParentEntity(e.target.value)} placeholder="e.g. Al-Sulaiti Global Holding Q.P.S.C." />
                  </div>
                )}
                <label className="caption">Inquiry source<input className="input" value={source} onChange={e => setSource(e.target.value)} placeholder="Referral, existing contact, or event" /></label>
                <label className="caption">Target date<input className="input" type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} /></label>
                <label className="caption">Next action<input className="input" value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="Schedule discovery call" /></label>
                <label className="caption">Discovery notes<textarea className="input" rows={2} value={discoveryNotes} onChange={e => setDiscoveryNotes(e.target.value)} /></label>
                <div className="grid2">
                  <div>
                    <label className="caption">Service Requested</label>
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
                  <label className="caption">Currency<select className="input" value={currency} onChange={e => setCurrency(e.target.value)}><option>QAR</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
                  <div>
                    <label className="caption">Estimated Fee ({currency})</label>
                    <input
                      type="number"
                      className="input"
                      value={value}
                      onChange={e => setValue(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Register Inquiry</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
