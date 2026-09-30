// Module 04: Proposals, Terms & Commercial Review (VP-010, VP-011)
import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, ProposalContentTemplate, ProposalItem, ProposalRecord, ProposalServiceDefinition } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { Notice, EmptyTableRow } from '../common/Feedback';
import { StatusBadge } from '../common/StatusBadge';
import { formatCurrency } from '../../services/calculations';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { visibleClientIds, hasAnyRole } from '../../services/guards';

interface ProposalsViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const ProposalsView: React.FC<ProposalsViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [selectedProposal, setSelectedProposal] = useState<ProposalRecord | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Review state
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewApproved, setReviewApproved] = useState(true);

  // Response state
  const [responseType, setResponseType] = useState<'Accepted' | 'Declined' | 'Withdrawn'>('Accepted');
  const [responseMethod, setResponseMethod] = useState<'Email' | 'WhatsApp' | 'Meeting' | 'Letter'>('Email');
  const [responseContact, setResponseContact] = useState('');
  const [responseDate, setResponseDate] = useState(state.asOfDate);
  const [responseNotes, setResponseNotes] = useState('');
  const [responseEvidenceRef, setResponseEvidenceRef] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalLead, setProposalLead] = useState('');
  const [proposalClientId, setProposalClientId] = useState('');
  const [proposalScope, setProposalScope] = useState('');
  const [proposalExclusions, setProposalExclusions] = useState('');
  const [proposalDeliverables, setProposalDeliverables] = useState('');
  const [proposalResponsibilities, setProposalResponsibilities] = useState('');
  const [proposalTerms, setProposalTerms] = useState('50% advance deposit payable upon contract signing / EL execution; 50% final balance payable upon issuance of draft audit deliverables bundle.');
  const [proposalMode, setProposalMode] = useState<'Brief Quotation' | 'Comprehensive Technical Proposal'>('Brief Quotation');
  const [firmHistory, setFirmHistory] = useState('');
  const [deliveryTimeline, setDeliveryTimeline] = useState('');
  const [firmProfile, setFirmProfile] = useState('Established licensed audit firm authorized under QFC / MOCI / QCB regulations with dedicated audit, assurance and financial advisory practice.');
  const [regulatoryRegistrations, setRegulatoryRegistrations] = useState('QFC Regulatory Authority, Qatar Ministry of Commerce & Industry (MOCI), Qatar Central Bank (QCB) Approved Auditor');
  const [teamCredentials, setTeamCredentials] = useState('Engagement Partner: Daniel James (FCA, 18 yrs exp); Audit Manager: Layla Rahman (CPA, 10 yrs exp); Senior Auditor: Associate (ACCA, 5 yrs exp)');
  const [industryExperience, setIndustryExperience] = useState('Statutory financial statement audits under IFRS / ISA across Energy, Financial Services, Real Estate, and Commercial Trading in Qatar.');
  const [auditMethodology, setAuditMethodology] = useState('Risk-based ISA audit methodology conforming to ISA 200–720 and IFRS, utilizing 3-tier materiality (PM/TE/SAD), dual-key governance, and rigorous sampling.');
  const [proposalAmount, setProposalAmount] = useState(0);
  const [proposalCurrency, setProposalCurrency] = useState('QAR');
  const [proposalPeriod, setProposalPeriod] = useState('');
  const [proposalPeriodStart, setProposalPeriodStart] = useState('');
  const [proposalPeriodEnd, setProposalPeriodEnd] = useState('');
  const [proposalServiceId, setProposalServiceId] = useState('');
  const [proposalServiceRevision, setProposalServiceRevision] = useState<number | undefined>(undefined);
  const [proposalTemplateId, setProposalTemplateId] = useState('');
  const [proposalTemplateRevision, setProposalTemplateRevision] = useState<number | undefined>(undefined);
  const [proposalFeeModel, setProposalFeeModel] = useState<ProposalItem['feeModel']>('Fixed');
  const [proposalQuantity, setProposalQuantity] = useState(1);
  const [proposalRate, setProposalRate] = useState(0);
  const [proposalDependencies, setProposalDependencies] = useState('');
  const [additionalProposalLines, setAdditionalProposalLines] = useState<ProposalItem[]>([]);
  const [showCatalogue, setShowCatalogue] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [serviceDraft, setServiceDraft] = useState<ProposalServiceDefinition | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<ProposalContentTemplate | null>(null);
  const proposalServices = state.proposalServices || [];
  const proposalTemplates = state.proposalTemplates || [];
  const proposalDraft = { proposalTitle, proposalLead, proposalScope, proposalExclusions, proposalDeliverables, proposalResponsibilities, proposalTerms, proposalMode, firmProfile, firmHistory, deliveryTimeline, regulatoryRegistrations, teamCredentials, industryExperience, auditMethodology, proposalAmount, proposalCurrency, proposalPeriod, proposalDependencies, proposalFeeModel, proposalQuantity, proposalRate, additionalProposalLines };
  const initialProposalDraft = useRef(JSON.stringify(proposalDraft));
  const saveProposalDraft = () => {
    if (!showNewModal) return true;
    const lead = state.leads.find(item => item.id === proposalLead);
    const editing = selectedProposal?.state === 'Draft' ? selectedProposal : undefined;
    const id = editing?.id || `PROP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      const service = proposalServices.find(item => item.id === proposalServiceId) || proposalServices.find(item => item.name === lead?.service) || proposalServices[0];
      const lineAmount = proposalFeeModel === 'Fixed' ? proposalAmount : proposalQuantity * proposalRate;
      const item: ProposalItem = { id: `${id}-1`, serviceId: service?.id, serviceRevision: proposalServiceRevision ?? service?.revision, serviceName: service?.name || lead?.service || editing?.items[0]?.serviceName || 'Professional services', description: proposalScope, scope: proposalScope, exclusions: proposalExclusions, deliverables: proposalDeliverables, clientResponsibilities: proposalResponsibilities, dependencies: proposalDependencies, period: proposalPeriod.trim(), periodStart: proposalPeriodStart, periodEnd: proposalPeriodEnd, feeModel: proposalFeeModel, quantity: proposalQuantity, rate: proposalFeeModel === 'Fixed' ? proposalAmount : proposalRate, amount: lineAmount };
      const items = [item, ...additionalProposalLines.map((line, index) => ({ ...line, id: `${id}-${index + 2}` }))];
      const totalAmount = items.reduce((sum, line) => sum + line.amount, 0);
      const prop: ProposalRecord = { id, leadId: editing?.leadId || lead?.id, clientId: editing?.clientId || lead?.convertedClientId || proposalClientId || undefined, title: proposalTitle.trim(), revision: editing?.revision || 1, predecessorId: editing?.predecessorId, preparedBy: editing?.preparedBy || state.currentPerson, preparedAt: editing?.preparedAt || new Date().toISOString().slice(0, 10), currency: proposalCurrency, totalAmount, items, terms: proposalTerms, teamCredentials, proposalMode, firmHistory, deliveryTimeline, firmProfile: proposalMode === 'Comprehensive Technical Proposal' ? firmProfile : undefined, regulatoryRegistrations: proposalMode === 'Comprehensive Technical Proposal' ? regulatoryRegistrations.split(',').map(s=>s.trim()).filter(Boolean) : undefined, industryExperience: proposalMode === 'Comprehensive Technical Proposal' ? industryExperience : undefined, auditMethodology: proposalMode === 'Comprehensive Technical Proposal' ? auditMethodology : undefined, period: proposalPeriod.trim(), periodStart: proposalPeriodStart, periodEnd: proposalPeriodEnd, templateId: proposalTemplateId || undefined, templateRevision: proposalTemplateRevision, state: 'Draft' };
      editing ? prototypeStore.updateProposal(prop) : prototypeStore.addProposal(prop);
      setShowNewModal(false);
      setSelectedProposal(prototypeStore.getSnapshot().proposals.find(item => item.id === prop.id) || null);
      initialProposalDraft.current = JSON.stringify(proposalDraft);
      return true;
    } catch (error: any) { setNotice({ type: 'error', text: error.message }); return false; }
  };

  const startProposal = () => {
    const service = proposalServices.find(item => item.active);
    setAdditionalProposalLines([]);
    setSelectedProposal(null); setProposalTitle(''); setProposalLead(''); setProposalClientId(''); setProposalScope(service?.scope || ''); setProposalExclusions(service?.exclusions || ''); setProposalDeliverables(service?.deliverables || ''); setProposalResponsibilities(service?.clientResponsibilities || ''); setProposalDependencies(service?.dependencies || ''); setProposalPeriod(service?.period || ''); setProposalPeriodStart(service?.periodStart || ''); setProposalPeriodEnd(service?.periodEnd || ''); setProposalTemplateId(''); setProposalTemplateRevision(undefined);
    setProposalTerms('50% advance deposit payable upon contract signing / EL execution; 50% final balance payable upon issuance of draft audit deliverables bundle.'); setProposalMode('Brief Quotation'); setProposalAmount(service?.feeModel === 'Fixed' ? service.rate : (service?.quantity || 1) * (service?.rate || 0)); setProposalQuantity(service?.quantity || 1); setProposalRate(service?.rate || 0); setProposalFeeModel(service?.feeModel || 'Fixed'); setProposalCurrency(service?.currency || 'QAR'); setProposalServiceId(service?.id || ''); setProposalServiceRevision(service?.revision); setShowNewModal(true);
  };

  const loadProposalDraft = (proposal: ProposalRecord) => {
    const primary = proposal.items[0];
    if (!primary) return;
    setTeamCredentials(typeof proposal.teamCredentials === 'string' ? proposal.teamCredentials : (proposal.teamCredentials || []).map(t => `${t.name} · ${t.role} · ${t.qualification} · ${t.experience}`).join('; '));
    setFirmHistory(proposal.firmHistory || ''); setDeliveryTimeline(proposal.deliveryTimeline || ''); setProposalTitle(proposal.title); setProposalLead(proposal.leadId || ''); setProposalClientId(proposal.clientId || ''); setProposalTemplateId(proposal.templateId || ''); setProposalTemplateRevision(proposal.templateRevision); setProposalServiceId(primary.serviceId || proposalServices.find(service => service.name === primary.serviceName)?.id || ''); setProposalServiceRevision(primary.serviceRevision); setProposalScope(primary.scope); setProposalExclusions(primary.exclusions || ''); setProposalDeliverables(primary.deliverables); setProposalResponsibilities(primary.clientResponsibilities || ''); setProposalDependencies(primary.dependencies || ''); setProposalPeriod(primary.period || proposal.period || ''); setProposalPeriodStart(primary.periodStart || proposal.periodStart || ''); setProposalPeriodEnd(primary.periodEnd || proposal.periodEnd || ''); setProposalFeeModel(primary.feeModel); setProposalQuantity(primary.quantity || 1); setProposalRate(primary.rate ?? primary.amount); setProposalAmount(primary.amount); setProposalCurrency(proposal.currency); setProposalTerms(proposal.terms); setProposalMode(proposal.proposalMode || 'Brief Quotation'); if (proposal.firmProfile) setFirmProfile(proposal.firmProfile); if (proposal.regulatoryRegistrations) setRegulatoryRegistrations(proposal.regulatoryRegistrations.join(', ')); if (proposal.industryExperience) setIndustryExperience(proposal.industryExperience); if (proposal.auditMethodology) setAuditMethodology(proposal.auditMethodology); setAdditionalProposalLines(proposal.items.slice(1).map(item=>structuredClone(item))); setShowNewModal(true);
  };

  const addProposalServiceLine = () => {
    const service = proposalServices.find(item => item.active && item.currency === proposalCurrency && item.id !== proposalServiceId) || proposalServices.find(item => item.active && item.currency === proposalCurrency);
    if (!service) return;
    setAdditionalProposalLines(lines => [...lines, { id: `draft-${crypto.randomUUID()}`, serviceId: service.id, serviceRevision: service.revision, serviceName: service.name, description: service.description, scope: service.scope, exclusions: service.exclusions, deliverables: service.deliverables, clientResponsibilities: service.clientResponsibilities, dependencies: service.dependencies, period: service.period, periodStart: service.periodStart, periodEnd: service.periodEnd, feeModel: service.feeModel, quantity: service.quantity, rate: service.rate, amount: service.feeModel === 'Fixed' ? service.rate : service.quantity * service.rate }]);
  };

  const applyProposalTemplate = (templateId: string) => {
    setProposalTemplateId(templateId);
    const template = proposalTemplates.find(item => item.id === templateId && item.active);
    setProposalTemplateRevision(template?.revision);
    if (!template) return;
    setProposalTitle(template.title); setProposalScope(template.scope); setProposalExclusions(template.exclusions); setProposalDeliverables(template.deliverables); setProposalResponsibilities(template.clientResponsibilities); setProposalDependencies(template.dependencies); setProposalPeriod(template.period); setProposalPeriodStart(template.periodStart || ''); setProposalPeriodEnd(template.periodEnd || ''); setProposalFeeModel(template.feeModel); setProposalQuantity(template.quantity); setProposalRate(template.rate); setProposalAmount(template.feeModel === 'Fixed' ? template.rate : template.quantity * template.rate); setProposalCurrency(template.currency); setProposalTerms(template.terms); setProposalServiceId(template.serviceId); setProposalServiceRevision(template.serviceRevision);
  };

  const persistServiceDefinition = (): boolean => {
    if (!serviceDraft) return true;
    const current = prototypeStore.getSnapshot();
    const services = current.proposalServices || [];
    if (!serviceDraft.name.trim() || !serviceDraft.scope.trim() || !serviceDraft.deliverables.trim() || !serviceDraft.periodStart || !serviceDraft.periodEnd || serviceDraft.periodStart > serviceDraft.periodEnd || !Number.isFinite(serviceDraft.rate) || serviceDraft.rate < 0 || !Number.isFinite(serviceDraft.quantity) || serviceDraft.quantity <= 0) { setNotice({ type: 'error', text: 'Service requires a name, scope, deliverables, valid start and end dates, positive quantity and nonnegative rate.' }); return false; }
    const next = { ...serviceDraft, name: serviceDraft.name.trim(), revision: (services.find(item => item.id === serviceDraft.id)?.revision || 0) + 1 };
    try { prototypeStore.saveProposalService(next, services.find(item => item.id === next.id)?.revision); }
    catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : String(error) }); return false; }
    setEditingServiceId(null); setServiceDraft(null);
    return true;
  };

  const persistProposalTemplate = (): boolean => {
    if (!templateDraft) return true;
    const current = prototypeStore.getSnapshot();
    const templates = current.proposalTemplates || [];
    if (!templateDraft.name.trim() || !templateDraft.title.trim() || !templateDraft.scope.trim() || !templateDraft.deliverables.trim() || !templateDraft.period.trim() || !templateDraft.periodStart || !templateDraft.periodEnd || templateDraft.periodStart > templateDraft.periodEnd || !templateDraft.terms.trim() || !Number.isFinite(templateDraft.quantity) || templateDraft.quantity <= 0 || !Number.isFinite(templateDraft.rate) || templateDraft.rate < 0) { setNotice({ type: 'error', text: 'Template requires title, scope, deliverables, valid period dates, terms, positive quantity and nonnegative rate.' }); return false; }
    const next = { ...templateDraft, name: templateDraft.name.trim(), revision: (templates.find(item => item.id === templateDraft.id)?.revision || 0) + 1 };
    try { prototypeStore.saveProposalTemplate(next, templates.find(item => item.id === next.id)?.revision); }
    catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : String(error) }); return false; }
    setEditingTemplateId(null); setTemplateDraft(null);
    return true;
  };

  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    onRegisterUnsavedForm({ label: 'supported service draft', isDirty: () => Boolean(serviceDraft), save: persistServiceDefinition, discard: () => { setEditingServiceId(null); setServiceDraft(null); } }, 'proposal-service-catalogue');
    return () => onRegisterUnsavedForm(null, 'proposal-service-catalogue');
  }, [onRegisterUnsavedForm, serviceDraft]);

  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    onRegisterUnsavedForm({ label: 'proposal content template draft', isDirty: () => Boolean(templateDraft), save: persistProposalTemplate, discard: () => { setEditingTemplateId(null); setTemplateDraft(null); } }, 'proposal-content-template');
    return () => onRegisterUnsavedForm(null, 'proposal-content-template');
  }, [onRegisterUnsavedForm, templateDraft]);

  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const key = 'proposal-draft';
    const guard: UnsavedFormGuard = {
      label: 'Proposal draft',
      isDirty: () => showNewModal,
      save: saveProposalDraft,
      discard: () => { setProposalTitle(''); setProposalLead(''); setProposalScope(''); setProposalExclusions(''); setProposalDeliverables(''); setProposalResponsibilities(''); setProposalTerms('Payment due within 30 days of invoice.'); setProposalAmount(0); setProposalCurrency('QAR'); setShowNewModal(false); initialProposalDraft.current = JSON.stringify({ proposalTitle: '', proposalLead: '', proposalScope: '', proposalExclusions: '', proposalDeliverables: '', proposalResponsibilities: '', proposalTerms: 'Payment due within 30 days of invoice.', proposalAmount: 0, proposalCurrency: 'QAR' }); }
    };
    onRegisterUnsavedForm(guard, key);
    return () => onRegisterUnsavedForm(null, key);
  }, [showNewModal, proposalDraft, selectedProposal, state.leads, state.currentPerson, onRegisterUnsavedForm]);

  const proposals = state.proposals;

  const createProposal = (e: React.FormEvent) => {
    e.preventDefault();
    if (saveProposalDraft()) setNotice({ type: 'success', text: 'Proposal draft saved.' });
  };

  const handleCommercialReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProposal) return;

    try {
      prototypeStore.reviewProposal(selectedProposal.id, reviewApproved, reviewNotes);
      setShowReviewModal(false);
      setSelectedProposal(null);
      setNotice({ type: 'success', text: `Proposal ${selectedProposal.title} commercial review recorded.` });
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const handleRecordResponse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProposal) return;

    try {
      prototypeStore.recordProposalResponse(selectedProposal.id, {
        responseType,
        contact: responseContact,
        date: responseDate,
        method: responseMethod,
        notes: responseNotes,
        evidenceRef: responseEvidenceRef
      });
      setShowResponseModal(false);
      setSelectedProposal(null);
      setResponseContact('');
      setResponseNotes('');
      setResponseEvidenceRef('');
      setNotice({ type: 'success', text: `Client ${responseType.toLowerCase()} response recorded with evidence.` });
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const openResponseForm = (proposal: ProposalRecord) => {
    setSelectedProposal(proposal);
    setResponseType('Accepted');
    setResponseMethod('Email');
    setResponseDate(state.asOfDate);
    setResponseContact(state.contacts.find(contact => contact.clientId === proposal.clientId && contact.active)?.name || '');
    setResponseNotes('');
    setResponseEvidenceRef('');
    setShowResponseModal(true);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Proposals & Engagement Terms</h1>
          <p>Standardized service deliverables, independent commercial review, and client acceptance recording.</p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}><button className="btn sm" onClick={() => setShowCatalogue(value => !value)}>{showCatalogue ? 'Hide Service Catalogue' : 'Services & Templates'}</button><button className="btn primary sm" onClick={startProposal}><Icon name="plus" /> New Proposal</button></div>
      </div>

      {showCatalogue && <div className="grid2">
        <section className="panel panel-pad stack" style={{ gap: 10 }}><div className="between"><div><h3>Supported Service Catalogue</h3><p className="sub">Reusable service defaults are copied into proposals when selected.</p></div><button className="btn sm primary" onClick={() => { setEditingServiceId(null); setServiceDraft({ id: `SVC-${crypto.randomUUID().slice(0,8).toUpperCase()}`, name: '', description: '', scope: '', exclusions: '', deliverables: '', clientResponsibilities: '', dependencies: '', period: '', periodStart: new Date().toISOString().slice(0,10), periodEnd: new Date().toISOString().slice(0,10), feeModel: 'Fixed', quantity: 1, rate: 0, currency: 'QAR', active: true, revision: 0 }); }}>Add Service</button></div>
          {proposalServices.map(service => <div className="borderbox" key={service.id}><div className="between"><b>{service.name}</b><button className="btn xs" onClick={() => { setEditingServiceId(service.id); setServiceDraft(structuredClone(service)); }}>Edit</button></div><p className="sub">{service.description} · {service.feeModel} · Rev {service.revision} · {service.active ? 'Active' : 'Inactive'}</p></div>)}
        </section>
        <section className="panel panel-pad stack" style={{ gap: 10 }}><div className="between"><div><h3>Proposal Content Templates</h3><p className="sub">Template defaults copy once; editing a proposal does not change this source.</p></div><button className="btn sm primary" onClick={() => { const service = proposalServices.find(item => item.active) || proposalServices[0]; setEditingTemplateId(null); setTemplateDraft({ id: `PT-${crypto.randomUUID().slice(0,8).toUpperCase()}`, name: '', description: '', serviceId: service?.id || '', serviceRevision: service?.revision, title: '', scope: service?.scope || '', exclusions: service?.exclusions || '', deliverables: service?.deliverables || '', clientResponsibilities: service?.clientResponsibilities || '', dependencies: service?.dependencies || '', period: service?.period || '', periodStart: service?.periodStart || '', periodEnd: service?.periodEnd || '', feeModel: service?.feeModel || 'Fixed', quantity: service?.quantity || 1, rate: service?.rate || 0, currency: service?.currency || 'QAR', terms: 'Payment due within 30 days of invoice.', revision: 0, active: true }); }}>Add Template</button></div>
          {proposalTemplates.map(template => <div className="borderbox" key={template.id}><div className="between"><b>{template.name}</b><button className="btn xs" onClick={() => { setEditingTemplateId(template.id); setTemplateDraft(structuredClone(template)); }}>Edit</button></div><p className="sub">{template.title} · {template.period} · Rev {template.revision} · {template.active ? 'Active' : 'Inactive'}</p></div>)}
        </section>
      </div>}

      {serviceDraft && <div className="modal-backdrop" onClick={() => { setServiceDraft(null); setEditingServiceId(null); }}><form className="modal" style={{ maxWidth: 680 }} onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); persistServiceDefinition(); }}><div className="modal-head"><h2>{editingServiceId ? 'Edit Supported Service' : 'Add Supported Service'}</h2><button type="button" className="icon-btn" onClick={() => setServiceDraft(null)}>✕</button></div><div className="modal-body stack"><label className="caption">Service name<input className="input" required value={serviceDraft.name} onChange={event => setServiceDraft({ ...serviceDraft, name: event.target.value })}/></label><label className="caption">Description<textarea className="input" required value={serviceDraft.description} onChange={event => setServiceDraft({ ...serviceDraft, description: event.target.value })}/></label><label className="caption">Default scope<textarea className="input" required value={serviceDraft.scope} onChange={event => setServiceDraft({ ...serviceDraft, scope: event.target.value })}/></label><label className="caption">Exclusions<textarea className="input" value={serviceDraft.exclusions} onChange={event => setServiceDraft({ ...serviceDraft, exclusions: event.target.value })}/></label><label className="caption">Deliverables<textarea className="input" required value={serviceDraft.deliverables} onChange={event => setServiceDraft({ ...serviceDraft, deliverables: event.target.value })}/></label><label className="caption">Client responsibilities<textarea className="input" value={serviceDraft.clientResponsibilities} onChange={event => setServiceDraft({ ...serviceDraft, clientResponsibilities: event.target.value })}/></label><label className="caption">Dependencies<textarea className="input" value={serviceDraft.dependencies} onChange={event => setServiceDraft({ ...serviceDraft, dependencies: event.target.value })}/></label><label className="caption">Default period<input className="input" required value={serviceDraft.period} onChange={event => setServiceDraft({ ...serviceDraft, period: event.target.value })}/></label><div className="grid2"><label className="caption">Period start<input className="input" type="date" required value={serviceDraft.periodStart || ''} onChange={event => setServiceDraft({ ...serviceDraft, periodStart: event.target.value })}/></label><label className="caption">Period end<input className="input" type="date" required value={serviceDraft.periodEnd || ''} onChange={event => setServiceDraft({ ...serviceDraft, periodEnd: event.target.value })}/></label></div><div className="grid2"><label className="caption">Fee model<select className="input" value={serviceDraft.feeModel} onChange={event => setServiceDraft({ ...serviceDraft, feeModel: event.target.value as ProposalItem['feeModel'] })}><option>Fixed</option><option>Time & Materials</option><option>Retainer</option></select></label><label className="caption">Currency<select className="input" value={serviceDraft.currency} onChange={event => setServiceDraft({ ...serviceDraft, currency: event.target.value })}><option>QAR</option><option>USD</option><option>EUR</option><option>GBP</option></select></label><label className="caption">Quantity<input className="input" type="number" min="0.01" step="0.01" required value={serviceDraft.quantity} onChange={event => setServiceDraft({ ...serviceDraft, quantity: Number(event.target.value) })}/></label><label className="caption">Rate<input className="input" type="number" min="0" step="0.01" required value={serviceDraft.rate} onChange={event => setServiceDraft({ ...serviceDraft, rate: Number(event.target.value) })}/></label></div><label><input type="checkbox" checked={serviceDraft.active} onChange={event => setServiceDraft({ ...serviceDraft, active: event.target.checked })}/> Active and available for proposals</label></div><div className="modal-foot"><button type="button" className="btn ghost sm" onClick={() => setServiceDraft(null)}>Cancel</button><button className="btn primary sm" type="submit">Save Service</button></div></form></div>}

      {templateDraft && <div className="modal-backdrop" onClick={() => setTemplateDraft(null)}><form className="modal" style={{ maxWidth: 680 }} onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); persistProposalTemplate(); }}><div className="modal-head"><h2>{editingTemplateId ? 'Edit Proposal Template' : 'Add Proposal Template'}</h2><button type="button" className="icon-btn" onClick={() => setTemplateDraft(null)}>✕</button></div><div className="modal-body stack"><label className="caption">Template name<input className="input" required value={templateDraft.name} onChange={event => setTemplateDraft({ ...templateDraft, name: event.target.value })}/></label><label className="caption">Description<textarea className="input" required value={templateDraft.description} onChange={event => setTemplateDraft({ ...templateDraft, description: event.target.value })}/></label><label className="caption">Supported service<select className="input" value={templateDraft.serviceId} onChange={event => setTemplateDraft({ ...templateDraft, serviceId: event.target.value, serviceRevision: proposalServices.find(service => service.id === event.target.value)?.revision })}>{proposalServices.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label className="caption">Proposal title<input className="input" required value={templateDraft.title} onChange={event => setTemplateDraft({ ...templateDraft, title: event.target.value })}/></label><label className="caption">Scope<textarea className="input" required value={templateDraft.scope} onChange={event => setTemplateDraft({ ...templateDraft, scope: event.target.value })}/></label><label className="caption">Exclusions<textarea className="input" value={templateDraft.exclusions} onChange={event => setTemplateDraft({ ...templateDraft, exclusions: event.target.value })}/></label><label className="caption">Deliverables<textarea className="input" required value={templateDraft.deliverables} onChange={event => setTemplateDraft({ ...templateDraft, deliverables: event.target.value })}/></label><label className="caption">Client responsibilities<textarea className="input" value={templateDraft.clientResponsibilities} onChange={event => setTemplateDraft({ ...templateDraft, clientResponsibilities: event.target.value })}/></label><label className="caption">Dependencies<textarea className="input" value={templateDraft.dependencies} onChange={event => setTemplateDraft({ ...templateDraft, dependencies: event.target.value })}/></label><label className="caption">Period<input className="input" required value={templateDraft.period} onChange={event => setTemplateDraft({ ...templateDraft, period: event.target.value })}/></label><div className="grid2"><label className="caption">Period start<input className="input" type="date" required value={templateDraft.periodStart || ''} onChange={event => setTemplateDraft({ ...templateDraft, periodStart: event.target.value })}/></label><label className="caption">Period end<input className="input" type="date" required value={templateDraft.periodEnd || ''} onChange={event => setTemplateDraft({ ...templateDraft, periodEnd: event.target.value })}/></label></div><div className="grid2"><label className="caption">Fee model<select className="input" value={templateDraft.feeModel} onChange={event => setTemplateDraft({ ...templateDraft, feeModel: event.target.value as ProposalItem['feeModel'] })}><option>Fixed</option><option>Time & Materials</option><option>Retainer</option></select></label><label className="caption">Currency<select className="input" value={templateDraft.currency} onChange={event => setTemplateDraft({ ...templateDraft, currency: event.target.value })}><option>QAR</option><option>USD</option><option>EUR</option><option>GBP</option></select></label><label className="caption">Quantity<input className="input" type="number" min="0.01" step="0.01" required value={templateDraft.quantity} onChange={event => setTemplateDraft({ ...templateDraft, quantity: Number(event.target.value) })}/></label><label className="caption">Rate<input className="input" type="number" min="0" step="0.01" required value={templateDraft.rate} onChange={event => setTemplateDraft({ ...templateDraft, rate: Number(event.target.value) })}/></label></div><label className="caption">Terms<textarea className="input" required value={templateDraft.terms} onChange={event => setTemplateDraft({ ...templateDraft, terms: event.target.value })}/></label><label><input type="checkbox" checked={templateDraft.active} onChange={event => setTemplateDraft({ ...templateDraft, active: event.target.checked })}/> Active for new proposal drafts</label></div><div className="modal-foot"><button type="button" className="btn ghost sm" onClick={() => setTemplateDraft(null)}>Cancel</button><button className="btn primary sm" type="submit">Save Template</button></div></form></div>}

      {notice && <Notice tone={notice.type} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="panel">
        <div className="panel-head">
          <h3>Commercial Proposals Register</h3>
          <span className="caption">Revisions & Governance</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Proposal Title</th>
                <th>Revision</th>
                <th>Total Fee</th>
                <th>Prepared By</th>
                <th>Commercial Review</th>
                <th>Client Response</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {proposals.length === 0 && <EmptyTableRow colSpan={8} title="No proposals drafted yet" description="Use “New Proposal” to draft service terms from the reusable catalogue. Drafts pass independent commercial review, are presented to the client, and — once accepted — unlock engagement creation." />}
              {proposals.map(p => (
                <tr key={p.id}>
                  <td>
                    <b>{p.title}</b>
                    <div className="cell-sub">{p.id} · Currency: {p.currency}</div>
                  </td>
                  <td>v{p.revision}</td>
                  <td><b>{formatCurrency(p.totalAmount, p.currency)}</b></td>
                  <td>{p.preparedBy}</td>
                  <td>
                    {p.commercialReview ? (
                      <span className={`badge ${p.commercialReview.approved ? 'green' : 'amber'}`}>
                        {p.commercialReview.approved ? 'Approved' : 'Returned'} by {p.commercialReview.reviewedBy}
                      </span>
                    ) : (
                      <StatusBadge status="Pending Review" kind={p.state === 'Internal review' ? 'review' : 'draft'} />
                    )}
                  </td>
                  <td>
                    {p.clientResponse ? (
                      <span className="badge teal">
                        {p.clientResponse.responseType} ({p.clientResponse.contact}) · {p.clientResponse.method} · {p.clientResponse.date} · {p.clientResponse.evidenceRef}
                      </span>
                    ) : (
                      <span className="caption">Awaiting response</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={p.state} />
                    {p.state === 'Draft' && p.commercialReview && !p.commercialReview.approved && <div className="mt4"><StatusBadge status="Returned" title={p.commercialReview.notes || 'Returned by the commercial reviewer'} /></div>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        className="btn sm"
                        onClick={() => setSelectedProposal(p)}
                      >
                        Preview
                      </button>
                      {p.state === 'Draft' && (
                        <button
                          className="btn sm ghost"
                          onClick={() => {
                            setSelectedProposal(p);
                            setReviewApproved(hasAnyRole(state, ['partner']));
                            setShowReviewModal(true);
                          }}
                        >
                          Review
                        </button>
                      )}
                      {p.state === 'Approved to send' && (
                        <>
                        <button
                          className="btn sm ghost"
                          onClick={() => {
                            try { prototypeStore.presentProposal(p.id); } catch (error: any) { setNotice({ type: 'error', text: error.message }); }
                          }}
                        >
                          Dispatch by Email (simulated)
                        </button>
                        <button className="btn sm ghost" onClick={() => { try { prototypeStore.presentProposal(p.id, 'WhatsApp'); } catch (error: any) { setNotice({ type: 'error', text: error.message }); } }}>Dispatch by WhatsApp (simulated)</button>
                        </>
                      )}
                      {['Draft', 'Approved to send', 'Presented', 'Declined', 'Withdrawn'].includes(p.state) && <button className="btn sm ghost" onClick={() => { try { const next = prototypeStore.createProposalRevision(p.id); setSelectedProposal(next); } catch (error: any) { setNotice({ type: 'error', text: error.message }); } }}>New Revision</button>}
                      {p.state === 'Presented' && <button className="btn sm ghost" onClick={() => openResponseForm(p)}>Record Client Response</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Proposal Preview Modal */}
      {selectedProposal && !showReviewModal && !showResponseModal && (
        <div className="modal-backdrop" onClick={() => setSelectedProposal(null)}>
          <div className="modal proposal-preview" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div className="proposal-brand"><div className="proposal-brand-mark">STE</div><div><strong>STE Audit &amp; Assurance</strong><span>Professional services proposal · Demonstration firm identity placeholder</span></div><span className="proposal-doc-label">COMMERCIAL PROPOSAL</span></div>
            <div className="modal-head">
              <h2>{selectedProposal.title}</h2>
              <button className="icon-btn" onClick={() => setSelectedProposal(null)}>✕</button>
            </div>
            <div className="modal-body stack" style={{ gap: 16 }}>
              <div className="info-grid">
                <div><label>Revision</label><span>Rev {selectedProposal.presentedSnapshot?.revision || selectedProposal.revision}</span></div>
                <div><label>Prepared By</label><span>{selectedProposal.preparedBy}</span></div>
                <div><label>Date</label><span>{selectedProposal.preparedAt}</span></div>
                <div><label>Client</label><span>{state.clients.find(client => client.id === selectedProposal.clientId)?.name || 'Not linked'}</span></div>
                <div><label>Opportunity</label><span>{state.leads.find(lead => lead.id === selectedProposal.leadId)?.name || 'Not linked'}</span></div>
                <div><label>Period</label><span>{selectedProposal.period || selectedProposal.items[0]?.period || 'Period to be agreed'}</span></div>
                {(selectedProposal.periodStart || selectedProposal.periodEnd) && <div><label>Reporting dates</label><span>{selectedProposal.periodStart || 'Not set'} – {selectedProposal.periodEnd || 'Not set'}</span></div>}
                <div><label>Total Fee</label><span>{formatCurrency(selectedProposal.presentedSnapshot?.totalAmount ?? selectedProposal.totalAmount, selectedProposal.presentedSnapshot?.currency || selectedProposal.currency)}</span></div>
              </div>

              {(() => {
                const presented = selectedProposal.presentedSnapshot || selectedProposal;
                if (presented.proposalMode !== 'Comprehensive Technical Proposal') return null;
                const team = typeof presented.teamCredentials === 'string' ? presented.teamCredentials : presented.teamCredentials?.map((person: { name: string; role: string; qualification: string; experience: string }) => `${person.name} · ${person.role} · ${person.qualification} · ${person.experience}`).join('\n');
                return <>{[
                  ['Firm Profile', presented.firmProfile], ['Firm History', presented.firmHistory],
                  ['Commercial Registrations', presented.regulatoryRegistrations?.join('\n')], ['Partner / Team CVs', team],
                  ['Industry Credentials / Portfolio', presented.industryExperience], ['ISA Audit Methodology', presented.auditMethodology]
                ].map(([heading, content]) => <section key={heading}><h4>{heading}</h4><p style={{whiteSpace:'pre-line'}}>{content || 'Not recorded in this revision'}</p></section>)}</>;
              })()}
              <h4>Fee Schedule, Scope &amp; Deliverables</h4>
              <div className="stack" style={{ gap: 10 }}>
                {(selectedProposal.presentedSnapshot?.items || selectedProposal.items).map(item => (
                  <div key={item.id} className="borderbox" style={{ padding: 12 }}>
                    <div className="between">
                      <b>{item.serviceName}</b>
                      <span className="mono">{formatCurrency(item.amount, selectedProposal.presentedSnapshot?.currency || selectedProposal.currency)}</span>
                    </div>
                    <p className="sub mt8">{item.description}</p>
                    <p><b>Scope</b><br/>{item.scope}</p><p><b>Exclusions</b><br/>{item.exclusions || 'None stated'}</p><p><b>Deliverables</b><br/>{item.deliverables}</p><p><b>Client responsibilities</b><br/>{item.clientResponsibilities || 'As agreed during engagement acceptance'}</p><p><b>Dependencies</b><br/>{item.dependencies || 'None stated'}</p><p><b>Period</b><br/>{item.period || selectedProposal.period || 'Period to be agreed'}</p><p><b>Fee basis</b><br/>{item.feeModel === 'Fixed' ? `Fixed fee: ${formatCurrency(item.amount, selectedProposal.presentedSnapshot?.currency || selectedProposal.currency)}` : `${item.quantity ?? 1} × ${formatCurrency(item.rate ?? item.amount, selectedProposal.presentedSnapshot?.currency || selectedProposal.currency)} = ${formatCurrency(item.amount, selectedProposal.presentedSnapshot?.currency || selectedProposal.currency)}`}</p>
                  </div>
                ))}
              </div>

              <h4>Deliverables Timeline</h4>
              <p>{(selectedProposal.presentedSnapshot || selectedProposal).deliveryTimeline || 'Not recorded in this revision'}</p>
              <h4>Standard Terms</h4>
              <p className="sub" style={{ fontSize: 12 }}>{selectedProposal.presentedSnapshot?.terms || selectedProposal.terms}</p>
              <p className="caption">This preview is illustrative. It is not a signed engagement letter, tax/payroll service, recurring-work authorization, payment request or provider-generated document.</p>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setSelectedProposal(null)}>Close</button>
              <button className="btn sm ghost no-print" onClick={() => window.print()}>Print Proposal</button>
              {selectedProposal.state === 'Draft' && <><button className="btn sm ghost" onClick={() => loadProposalDraft(selectedProposal)}>Edit Draft</button><button className="btn sm ghost" onClick={() => { try { const revised = prototypeStore.createProposalRevision(selectedProposal.id); setSelectedProposal(revised); loadProposalDraft(revised); } catch (error: any) { setNotice({ type: 'error', text: error.message }); } }}>Create Revision</button></>}
              {selectedProposal.state === 'Draft' && (
                <button className="btn primary sm" onClick={() => setShowReviewModal(true)}>
                  Independent Commercial Review
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Commercial Review Modal */}
      {showReviewModal && selectedProposal && (
        <div className="modal-backdrop" onClick={() => setShowReviewModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Independent Commercial Review</h2>
              <button className="icon-btn" onClick={() => setShowReviewModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCommercialReview}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <p className="sub">
                  An independent reviewer must inspect fee consistency, terms, and billing schedule prior to client presentation.
                </p>
                <div>
                  <label className="caption">Review Decision</label>
                  <select
                    className="input"
                    value={reviewApproved ? 'approve' : 'return'}
                    onChange={e => setReviewApproved(e.target.value === 'approve')}
                  >
                    <option value="approve" disabled={!hasAnyRole(state, ['partner'])}>Partner Authorization for Client Presentation</option>
                    <option value="return">Return for Amendments</option>
                  </select>
                </div>
                <div>
                  <label className="caption">Review Comments / Notes</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder={reviewApproved ? 'Document review considerations...' : 'Required: explain what must be revised...'}
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                    required={!reviewApproved}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowReviewModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary sm">
                  Record Review Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client Response Modal */}
      {showResponseModal && selectedProposal && (
        <div className="modal-backdrop" onClick={() => setShowResponseModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
            <h2>Record Client Response</h2>
              <button className="icon-btn" onClick={() => setShowResponseModal(false)}>✕</button>
            </div>
            <form onSubmit={handleRecordResponse}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Client Response Type<select
                    className="input"
                    value={responseType}
                    onChange={e => setResponseType(e.target.value as any)}
                  >
                    <option value="Accepted">Accepted by Client</option>
                    <option value="Declined">Declined</option>
                    <option value="Withdrawn">Withdrawn</option>
                  </select></label>
                </div>
                <div>
                  <label className="caption">Active Client Contact</label>
                  <select className="input" value={responseContact} onChange={e => setResponseContact(e.target.value)} required>
                    <option value="" disabled>Select contact</option>
                    {state.contacts.filter(contact => contact.clientId === selectedProposal.clientId && contact.active).map(contact => <option key={contact.id} value={contact.name}>{contact.name}{contact.isPrimary ? ' · Primary' : ''}</option>)}
                  </select>
                </div>
                <label className="caption">Response date<input className="input" type="date" value={responseDate} onChange={e => setResponseDate(e.target.value)} required /></label>
                <label className="caption">Response method
                  <select className="input" value={responseMethod} onChange={e => setResponseMethod(e.target.value as any)}>
                    <option value="Email">Email (Official electronic dispatch)</option>
                    <option value="WhatsApp">WhatsApp (Direct communication channel)</option>
                    <option value="Meeting">Meeting</option>
                    <option value="Letter">Formal Letter</option>
                  </select>
                </label>
                <label className="caption">Response notes<textarea
                    className="input"
                    rows={3}
                    placeholder="Summarize the client's response..."
                    value={responseNotes}
                    onChange={e => setResponseNotes(e.target.value)}
                    required
                  /></label>
                <label className="caption">Document or communication evidence reference<input className="input" value={responseEvidenceRef} onChange={e => setResponseEvidenceRef(e.target.value)} required /></label>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowResponseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary sm">
                  Record Response
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNewModal && <div className="modal-backdrop" onClick={() => setShowNewModal(false)}><form className="modal" style={{ maxWidth: 760 }} onSubmit={createProposal} onClick={e => e.stopPropagation()}><div className="modal-head"><h2>Draft Commercial Proposal</h2><button type="button" className="icon-btn" onClick={() => setShowNewModal(false)}>✕</button></div><div className="modal-body stack" style={{ gap: 12 }}>
        <div className="grid2">
          <label className="caption">Proposal Format Mode
            <select className="input" value={proposalMode} onChange={e => setProposalMode(e.target.value as any)}>
              <option value="Brief Quotation">Brief Quotation (1–2 Pages, Fast Turnaround)</option>
              <option value="Comprehensive Technical Proposal">Comprehensive Technical Proposal (Full Profile, CVs & ISA Methodology)</option>
            </select>
          </label>
          <label className="caption">Reusable proposal template<select className="input" value={proposalTemplateId} onChange={event => applyProposalTemplate(event.target.value)}><option value="">Start without a template</option>{proposalTemplates.filter(template => template.active).map(template => <option key={template.id} value={template.id}>{template.name} · Rev {template.revision}</option>)}</select></label>
        </div>
        <label className="caption">Title<input className="input" required value={proposalTitle} onChange={e => setProposalTitle(e.target.value)} /></label>
        <div className="grid2">
          <label className="caption">Opportunity (optional)<select className="input" value={proposalLead} onChange={e => { const id=e.target.value;setProposalLead(id);const lead=state.leads.find(item=>item.id===id);if(lead?.convertedClientId)setProposalClientId(lead.convertedClientId); }}><option value="">Unlinked</option>{state.leads.filter(l => l.stage !== 'Lost').map(l => <option key={l.id} value={l.id}>{l.name} · {l.id}</option>)}</select></label>
          <label className="caption">Client (optional when an opportunity is not yet converted)<select className="input" value={proposalClientId} onChange={event=>setProposalClientId(event.target.value)}><option value="">No client linked</option>{state.clients.filter(client=>{const visible=visibleClientIds(state);return visible==='ALL'||visible.includes(client.id)}).map(client=><option key={client.id} value={client.id}>{client.name} · {client.id}</option>)}</select></label>
        </div>

        <label className="caption">Deliverables timeline<textarea className="input" rows={2} value={deliveryTimeline} onChange={event => setDeliveryTimeline(event.target.value)} required /></label>
        {proposalMode === 'Comprehensive Technical Proposal' && (
          <div className="panel panel-pad stack" style={{ gap: 8, background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}>
            <h4>Comprehensive Technical Proposal Modules</h4>
            <label className="caption">Firm History<textarea className="input" rows={2} value={firmHistory} onChange={event => setFirmHistory(event.target.value)} required /></label><label className="caption">Firm Profile
              <textarea className="input" rows={2} value={firmProfile} onChange={e => setFirmProfile(e.target.value)} />
            </label>
            <label className="caption">Regulatory Registrations &amp; Licenses
              <input className="input" value={regulatoryRegistrations} onChange={e => setRegulatoryRegistrations(e.target.value)} placeholder="QFC Regulatory Authority, MOCI, QCB Approved Auditor" />
            </label>
            <label className="caption">Key Engagement Team Credentials &amp; Staff CVs
              <textarea className="input" rows={2} value={teamCredentials} onChange={e => setTeamCredentials(e.target.value)} />
            </label>
            <label className="caption">Industry Credentials &amp; Track Record
              <textarea className="input" rows={2} value={industryExperience} onChange={e => setIndustryExperience(e.target.value)} />
            </label>
            <label className="caption">Technical Audit Methodology (ISA / IFRS)
              <textarea className="input" rows={2} value={auditMethodology} onChange={e => setAuditMethodology(e.target.value)} />
            </label>
          </div>
        )}

        <label className="caption">Service<select className="input" required value={proposalServiceId} onChange={event => { const value = event.target.value; setProposalServiceId(value); const service = proposalServices.find(item => item.id === value); setProposalServiceRevision(service?.revision); if (service) { setProposalScope(service.scope); setProposalExclusions(service.exclusions); setProposalDeliverables(service.deliverables); setProposalResponsibilities(service.clientResponsibilities); setProposalDependencies(service.dependencies); setProposalPeriod(service.period); setProposalPeriodStart(service.periodStart || ''); setProposalPeriodEnd(service.periodEnd || ''); setProposalFeeModel(service.feeModel); setProposalQuantity(service.quantity); setProposalRate(service.rate); setProposalCurrency(service.currency); setProposalAmount(service.quantity * service.rate); } }}><option value="">Select a supported service</option>{proposalServices.filter(service => service.active).map(service => <option key={service.id} value={service.id}>{service.name} · Rev {service.revision}</option>)}</select></label>
        <label className="caption">Scope<textarea className="input" required rows={3} value={proposalScope} onChange={e => setProposalScope(e.target.value)} /></label>
        <label className="caption">Exclusions<textarea className="input" required rows={2} value={proposalExclusions} onChange={e => setProposalExclusions(e.target.value)} /></label>
        <label className="caption">Deliverables<textarea className="input" required rows={2} value={proposalDeliverables} onChange={e => setProposalDeliverables(e.target.value)} /></label>
        <label className="caption">Client responsibilities<textarea className="input" required rows={2} value={proposalResponsibilities} onChange={e => setProposalResponsibilities(e.target.value)} /></label>
        <label className="caption">Dependencies<textarea className="input" required value={proposalDependencies} onChange={e => setProposalDependencies(e.target.value)} /></label><label className="caption">Reporting period<input className="input" required value={proposalPeriod} onChange={e => setProposalPeriod(e.target.value)} /></label><div className="grid2"><label className="caption">Period start<input className="input" type="date" required value={proposalPeriodStart} onChange={e => setProposalPeriodStart(e.target.value)} /></label><label className="caption">Period end<input className="input" type="date" required value={proposalPeriodEnd} onChange={e => setProposalPeriodEnd(e.target.value)} /></label></div>
        <div className="grid2"><label className="caption">Fee model<select className="input" value={proposalFeeModel} onChange={event => setProposalFeeModel(event.target.value as ProposalItem['feeModel'])}><option>Fixed</option><option>Time & Materials</option><option>Retainer</option></select></label><label className="caption">Currency<select className="input" disabled={additionalProposalLines.length>0} value={proposalCurrency} onChange={e => setProposalCurrency(e.target.value)}><option>QAR</option><option>USD</option><option>EUR</option><option>GBP</option></select></label><label className="caption">Quantity<input className="input" type="number" min="0.01" step="0.01" required value={proposalQuantity} onChange={e => { setProposalQuantity(Number(e.target.value)); setProposalAmount(Number(e.target.value) * proposalRate); }} /></label><label className="caption">Rate<input className="input" type="number" min="0" step="0.01" required value={proposalRate} onChange={e => { setProposalRate(Number(e.target.value)); setProposalAmount(proposalQuantity * Number(e.target.value)); }} /></label>{proposalFeeModel === 'Fixed' && <label className="caption">Fixed fee<input className="input" type="number" min="0" step="0.01" required value={proposalAmount} onChange={e => { setProposalAmount(Number(e.target.value)); setProposalRate(Number(e.target.value)); }} /></label>}</div><p className="caption">Line total: <b>{formatCurrency(proposalAmount, proposalCurrency)}</b></p>
        {additionalProposalLines.map((line,index)=><fieldset className="stack" key={line.id} style={{gap:8}}><legend>Additional Service Line {index+2}</legend><label className="caption">Service<select className="input" value={line.serviceId} onChange={event=>{const service=proposalServices.find(item=>item.id===event.target.value);if(service)setAdditionalProposalLines(lines=>lines.map((item,i)=>i===index?{...item,serviceId:service.id,serviceRevision:service.revision,serviceName:service.name,description:service.description,scope:service.scope,exclusions:service.exclusions,deliverables:service.deliverables,clientResponsibilities:service.clientResponsibilities,dependencies:service.dependencies,period:service.period,periodStart:service.periodStart,periodEnd:service.periodEnd,feeModel:service.feeModel,quantity:service.quantity,rate:service.rate,amount:service.feeModel==='Fixed'?service.rate:service.quantity*service.rate}:item));}}>{proposalServices.filter(service=>service.active&&service.currency===proposalCurrency).map(service=><option key={service.id} value={service.id}>{service.name}</option>)}</select></label>{(['description','scope','exclusions','deliverables','clientResponsibilities','dependencies','period'] as const).map(field=><label className="caption" key={field}>{field==='clientResponsibilities'?'Client responsibilities':field[0].toUpperCase()+field.slice(1)}<textarea required className="input" value={line[field]||''} onChange={event=>setAdditionalProposalLines(lines=>lines.map((item,i)=>i===index?{...item,[field]:event.target.value}:item))}/></label>)}<div className="grid2"><label className="caption">Fee model<select className="input" value={line.feeModel} onChange={event=>setAdditionalProposalLines(lines=>lines.map((item,i)=>i===index?{...item,feeModel:event.target.value as ProposalItem['feeModel'],amount:event.target.value==='Fixed'?item.rate||0:(item.quantity||1)*(item.rate||0)}:item))}><option>Fixed</option><option>Time &amp; Materials</option><option>Retainer</option></select></label><label className="caption">Quantity<input type="number" min="0.01" step="0.01" required className="input" value={line.quantity||1} onChange={event=>setAdditionalProposalLines(lines=>lines.map((item,i)=>i===index?{...item,quantity:Number(event.target.value),amount:item.feeModel==='Fixed'?item.rate||0:Number(event.target.value)*(item.rate||0)}:item))}/></label><label className="caption">Rate<input type="number" min="0" step="0.01" required className="input" value={line.rate||0} onChange={event=>setAdditionalProposalLines(lines=>lines.map((item,i)=>i===index?{...item,rate:Number(event.target.value),amount:item.feeModel==='Fixed'?Number(event.target.value):(item.quantity||1)*Number(event.target.value)}:item))}/></label></div><p className="caption">Line total: <b>{formatCurrency(line.amount,proposalCurrency)}</b></p><button type="button" className="btn xs danger" onClick={()=>setAdditionalProposalLines(lines=>lines.filter((_,i)=>i!==index))}>Remove Line</button></fieldset>)}
        <div className="between"><button type="button" className="btn sm" onClick={addProposalServiceLine}>Add Service Line</button><p className="caption">Proposal total: <b>{formatCurrency(proposalAmount+additionalProposalLines.reduce((sum,line)=>sum+line.amount,0),proposalCurrency)}</b></p></div>
        <label className="caption">Commercial Payment Terms (50/50 Structure Required)<textarea className="input" required rows={2} value={proposalTerms} onChange={e => setProposalTerms(e.target.value)} /></label>
      </div><div className="modal-foot"><button type="button" className="btn ghost sm" onClick={() => setShowNewModal(false)}>Cancel</button><button className="btn primary sm" type="submit">Create Draft</button></div></form></div>}
    </div>
  );
};
