// Module 02 & 17: Centralized Client 360 Workspace (VP-008)
// 12 Tabs: Overview, Contacts, Engagements, Jobs, Documents, Requests, Communications, Time/Budgets, Billing, Accounting, Audit, Activity

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RouteKey, ClientContact, PbcRequestItem, CustomFieldDefinition } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency, formatMinutesToHours, getEffectiveTimeEntries } from '../../services/calculations';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { InternalNotesPanel } from '../common/InternalNotesPanel';
import { visibleEngagementIds } from '../../services/guards';
import { filterPbcRequests, getOutstandingPbcRequestCount, getPbcRequestRecipient, PbcRequestDueFilter, PbcRequestStatusFilter } from '../../services/pbcRequestFilters';

type ClientPbcRequest = PbcRequestItem & { engagementId: string };

interface ClientDetailViewProps {
  clientId: string;
  searchTargetId?: string;
  onBack: () => void;
  onNavigate: (route: RouteKey) => void;
  onBeforeContextChange: (change: () => void) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const ClientDetailView: React.FC<ClientDetailViewProps> = ({ clientId, searchTargetId, onBack, onNavigate, onBeforeContextChange, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const searchContact = state.contacts.find(contact => contact.id === searchTargetId && contact.clientId === clientId);
  const engagementScope = visibleEngagementIds(state);
  const canViewEngagement = (engagementId?: string) => engagementScope === 'ALL' ? true : Boolean(engagementId && engagementScope.includes(engagementId));
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'contacts'
    | 'engagements'
    | 'jobs'
    | 'documents'
    | 'requests'
    | 'communications'
    | 'time'
    | 'billing'
    | 'accounting'
    | 'audit'
    | 'activity'
  >(searchContact ? 'contacts' : searchTargetId && state.engagements.some(engagement => engagement.client === clientId && canViewEngagement(engagement.id) && engagement.pbc.some(request => request.id === searchTargetId)) ? 'requests' : 'overview');

  const [showAddContact, setShowAddContact] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactResponsibility, setContactResponsibility] = useState('');
  const [contactEffectiveFrom, setContactEffectiveFrom] = useState('');
  const [contactEffectiveTo, setContactEffectiveTo] = useState('');
  const [contactActive, setContactActive] = useState(true);
  const contactForm = useRef<HTMLFormElement>(null);
  const [customFieldId, setCustomFieldId] = useState(state.customFields.find(f => f.enabled !== false)?.id || '');
  const [customFieldValue, setCustomFieldValue] = useState('');
  const [clientNotice, setClientNotice] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldDefinition['type']>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const client = state.clients.find(c => c.id === clientId) || state.clients[0];
  const contacts = state.contacts.filter(c => c.clientId === client.id);
  const engagements = state.engagements.filter(e => e.client === client.id && canViewEngagement(e.id));
  const scopedEngagementIds = new Set(engagements.map(engagement => engagement.id));
  const jobs = state.jobs.filter(j => j.clientId === client.id && scopedEngagementIds.has(j.engagementId));
  const documents = state.documents.filter(d => d.clientId === client.id && (engagementScope === 'ALL' ? !d.engagementId || scopedEngagementIds.has(d.engagementId) : scopedEngagementIds.has(d.engagementId || '')));
  const communications = state.communications.filter(c => c.clientId === client.id && (engagementScope === 'ALL' ? !c.engagementId || scopedEngagementIds.has(c.engagementId) : scopedEngagementIds.has(c.engagementId || '')));
  const times = getEffectiveTimeEntries(state.times).filter(t => t.clientId === client.id && scopedEngagementIds.has(t.engagementId));
  const invoices = state.invoices.filter(i => i.clientId === client.id && scopedEngagementIds.has(i.engagementId || i.eng || ''));
  const invoiceIds = new Set(invoices.map(invoice => invoice.id));
  const receipts = state.receipts.filter(r => r.clientId === client.id && r.allocations.some(allocation => invoiceIds.has(allocation.invoiceId)));
  const activeCustomFields = state.customFields.filter(field => field.enabled !== false);
  const defaultPbcContributor = contacts.find(contact => contact.active && contact.name === client.contact)?.name || contacts.find(contact => contact.active)?.name || '';

  const [showPbcForm, setShowPbcForm] = useState(false);
  const [pbcEngagementId, setPbcEngagementId] = useState(engagements[0]?.id || '');
  const [pbcTitle, setPbcTitle] = useState('');
  const [pbcCategory, setPbcCategory] = useState('Financial records');
  const [pbcDue, setPbcDue] = useState(state.asOfDate);
  const [pbcContributor, setPbcContributor] = useState(defaultPbcContributor);
  const pbcForm = useRef<HTMLFormElement>(null);
  const initialPbcDraft = useRef({ engagementId: engagements[0]?.id || '', title: '', category: 'Financial records', due: state.asOfDate, contributor: defaultPbcContributor });
  const [clarification, setClarification] = useState<{ engagementId: string; request: PbcRequestItem } | null>(null);
  const [clarificationText, setClarificationText] = useState('');
  const clarificationForm = useRef<HTMLFormElement>(null);
  // VP-023: request edit/reassignment/cancellation with attribution and retained history.
  const [editingRequest, setEditingRequest] = useState<ClientPbcRequest | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editRecipient, setEditRecipient] = useState('');
  const [editReason, setEditReason] = useState('');
  const editRequestForm = useRef<HTMLFormElement>(null);
  const [requestNotice, setRequestNotice] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<PbcRequestStatusFilter>('All');
  const [requestDueFilter, setRequestDueFilter] = useState<PbcRequestDueFilter>('All dates');
  const [requestRecipientFilter, setRequestRecipientFilter] = useState('');
  const [requestSearch, setRequestSearch] = useState('');

  const pbcRequests = engagements.flatMap(e => e.pbc.map(request => ({ ...request, engagementId: e.id })));
  const requestRecipients = [...new Set(pbcRequests.map(getPbcRequestRecipient).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const visiblePbcRequests = filterPbcRequests(pbcRequests, { status: requestStatusFilter, due: requestDueFilter, recipient: requestRecipientFilter, search: requestSearch }, state.asOfDate);
  const outstandingPbcRequestCount = getOutstandingPbcRequestCount(pbcRequests);
  const workpapers = engagements.flatMap(e => e.workpapers);
  const visibleActivityRefs = new Set([client.id, ...engagements.map(item => item.id), ...contacts.map(item => item.id), ...jobs.map(item => item.id), ...documents.map(item => item.id), ...communications.map(item => item.id), ...times.map(item => item.id), ...invoices.map(item => item.id), ...receipts.map(item => item.id), ...pbcRequests.map(item => item.id), ...workpapers.map(item => item.id)]);

  const navigateWithClientEngagement = (route: RouteKey) => {
    const engagement = engagements.find(item => item.id === state.selectedEngagement) || engagements[0];
    if (engagement) prototypeStore.setSelectedEngagement(engagement.id);
    onNavigate(route);
  };

  const tabs: Array<{ key: typeof activeTab; label: string; count?: number }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'contacts', label: 'Contacts', count: contacts.length },
    { key: 'engagements', label: 'Engagements', count: engagements.length },
    { key: 'jobs', label: 'Jobs', count: jobs.length },
    { key: 'documents', label: 'Documents', count: documents.length },
    { key: 'requests', label: 'PBC Requests', count: pbcRequests.length },
    { key: 'communications', label: 'Communications', count: communications.length },
    { key: 'time', label: 'Time & Budgets' },
    { key: 'billing', label: 'Billing & AR', count: invoices.length },
    { key: 'accounting', label: 'Accounting' },
    { key: 'audit', label: 'Audit & Reviews', count: workpapers.length },
    { key: 'activity', label: 'Audit Log' }
  ];

  const saveContact = useCallback(() => {
    if (!showAddContact || !contactForm.current?.reportValidity() || !contactName.trim()) return false;
    try {
      if (editingContactId) {
        prototypeStore.updateClientContact(client.id, editingContactId, { name: contactName, email: contactEmail, phone: contactPhone, title: contactTitle, responsibility: contactResponsibility, effectiveFrom: contactEffectiveFrom || undefined, effectiveTo: contactEffectiveTo || undefined, active: contactActive });
      } else {
        const newContact: ClientContact = {
          id: `CNT-${crypto.randomUUID()}`,
          clientId: client.id,
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
          title: contactTitle,
          responsibility: contactResponsibility,
          effectiveFrom: contactEffectiveFrom || undefined,
          effectiveTo: contactEffectiveTo || undefined,
          isPrimary: contacts.length === 0,
          active: true,
          portalAccessRequested: false
        };
        prototypeStore.addContact(newContact);
      }
    }
    catch (error) { setClientNotice(error instanceof Error ? error.message : 'Contact could not be saved.'); return false; }
    setShowAddContact(false);
    setEditingContactId(null);
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    setContactTitle('');
    setContactResponsibility('');
    setContactEffectiveFrom('');
    setContactEffectiveTo('');
    setContactActive(true);
    return true;
  }, [showAddContact, editingContactId, contactName, contactEmail, contactPhone, contactTitle, contactResponsibility, contactEffectiveFrom, contactEffectiveTo, contactActive, contacts.length, client.id]);
  const discardContact = useCallback(() => {
    setShowAddContact(false);
    setEditingContactId(null);
    setContactName(''); setContactEmail(''); setContactTitle(''); setContactResponsibility('');
    setContactPhone(''); setContactActive(true);
    setContactEffectiveFrom(''); setContactEffectiveTo('');
  }, []);
  useEffect(() => {
    onRegisterUnsavedForm({
      label: 'client contact',
      isDirty: () => showAddContact && (Boolean(editingContactId) || Boolean(contactName.trim() || contactEmail.trim() || contactPhone.trim() || contactTitle.trim() || contactResponsibility.trim() || contactEffectiveFrom || contactEffectiveTo)),
      save: saveContact,
      discard: discardContact
    }, 'client-contact');
    return () => onRegisterUnsavedForm(null, 'client-contact');
  }, [onRegisterUnsavedForm, showAddContact, editingContactId, contactName, contactEmail, contactPhone, contactTitle, contactResponsibility, contactEffectiveFrom, contactEffectiveTo, saveContact, discardContact]);
  const editContact = (contact: ClientContact) => {
    setEditingContactId(contact.id); setContactName(contact.name); setContactEmail(contact.email); setContactPhone(contact.phone || ''); setContactTitle(contact.title || ''); setContactResponsibility(contact.responsibility || ''); setContactEffectiveFrom(contact.effectiveFrom || ''); setContactEffectiveTo(contact.effectiveTo || ''); setContactActive(contact.active); setShowAddContact(true);
  };
  const openAddContact = () => { discardContact(); setShowAddContact(true); };
  const handleAddContact = (e: React.FormEvent) => { e.preventDefault(); saveContact(); };

  const handleSaveCustomField = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      prototypeStore.setClientCustomField(client.id, customFieldId, customFieldValue);
      setClientNotice('Custom value saved to this client profile.');
      setCustomFieldValue('');
    } catch (error) { setClientNotice(error instanceof Error ? error.message : 'Custom value could not be saved.'); }
  };

  const savePbcDraft = () => {
    if (!pbcForm.current?.reportValidity()) return false;
    try {
      const request: PbcRequestItem = { id: `PBC-${crypto.randomUUID()}`, title: pbcTitle, category: pbcCategory, status: 'Draft', due: pbcDue, owner: state.currentPerson, contributor: pbcContributor, version: 1 };
      prototypeStore.addPbcRequest(pbcEngagementId, request);
      setRequestNotice('Draft information request saved. Present it when ready for the client portal.');
      setShowPbcForm(false);
      setPbcTitle('');
      return true;
    } catch (err) { setRequestNotice(err instanceof Error ? err.message : 'Request could not be saved.'); return false; }
  };
  const handleCreatePbc = (e: React.FormEvent) => { e.preventDefault(); savePbcDraft(); };

  useEffect(() => {
    const guard: UnsavedFormGuard = {
      label: 'PBC request draft',
      isDirty: () => showPbcForm && JSON.stringify({ engagementId: pbcEngagementId, title: pbcTitle, category: pbcCategory, due: pbcDue, contributor: pbcContributor }) !== JSON.stringify(initialPbcDraft.current),
      save: savePbcDraft,
      discard: () => { setShowPbcForm(false); setPbcTitle(''); setPbcCategory(initialPbcDraft.current.category); setPbcDue(initialPbcDraft.current.due); setPbcContributor(initialPbcDraft.current.contributor); setPbcEngagementId(initialPbcDraft.current.engagementId); }
    };
    onRegisterUnsavedForm(guard, 'client-pbc-create');
    return () => onRegisterUnsavedForm(null, 'client-pbc-create');
  }, [showPbcForm, pbcEngagementId, pbcTitle, pbcCategory, pbcDue, pbcContributor, onRegisterUnsavedForm]);

  const handlePresentPbc = (engagementId: string, requestId: string) => {
    try { prototypeStore.presentPbcRequest(engagementId, requestId); setRequestNotice('Information request presented to the client portal.'); }
    catch (err) { setRequestNotice(err instanceof Error ? err.message : 'Request could not be presented.'); }
  };

  const handleAcceptPbc = (engagementId: string, requestId: string) => {
    try { prototypeStore.acceptPbcResponse(engagementId, requestId); setRequestNotice('Client response accepted.'); }
    catch (err) { setRequestNotice(err instanceof Error ? err.message : 'Response could not be accepted.'); }
  };

  const saveClarification = () => {
    if (!clarification || !clarificationForm.current?.reportValidity()) return false;
    try {
      prototypeStore.requestPbcClarification(clarification.engagementId, clarification.request.id, clarificationText);
      setClarification(null);
      setClarificationText('');
      setRequestNotice('Clarification requested; the client can replace its response.');
      return true;
    } catch (err) { setRequestNotice(err instanceof Error ? err.message : 'Clarification could not be recorded.'); return false; }
  };
  const handleClarification = (e: React.FormEvent) => { e.preventDefault(); saveClarification(); };

  const savePbcUpdate = () => {
    if (!editingRequest || !editRequestForm.current?.reportValidity()) return false;
    try {
      prototypeStore.updatePbcRequest(editingRequest.engagementId, editingRequest.id, { title: editTitle, description: editDescription, due: editDue, contributor: editRecipient }, editReason);
      setEditingRequest(null);
      setRequestNotice('Request updated; the edit is recorded in its thread with the reason and actor.');
      return true;
    } catch (err) { setRequestNotice(err instanceof Error ? err.message : 'Request could not be updated.'); return false; }
  };
  const handleUpdatePbc = (e: React.FormEvent) => { e.preventDefault(); savePbcUpdate(); };

  useEffect(() => {
    const clarificationGuard: UnsavedFormGuard = {
      label: 'PBC clarification message',
      isDirty: () => Boolean(clarification && clarificationText.trim()),
      save: saveClarification,
      discard: () => { setClarification(null); setClarificationText(''); }
    };
    const editGuard: UnsavedFormGuard = {
      label: 'PBC request edit',
      isDirty: () => Boolean(editingRequest && (editTitle !== editingRequest.title || editDescription !== (editingRequest.description || '') || editDue !== editingRequest.due || editRecipient !== (editingRequest.contributor || '') || editReason.trim())),
      save: savePbcUpdate,
      discard: () => { setEditingRequest(null); setEditReason(''); }
    };
    onRegisterUnsavedForm(clarificationGuard, 'client-pbc-clarification');
    onRegisterUnsavedForm(editGuard, 'client-pbc-edit');
    return () => {
      onRegisterUnsavedForm(null, 'client-pbc-clarification');
      onRegisterUnsavedForm(null, 'client-pbc-edit');
    };
  }, [clarification, clarificationText, editingRequest, editTitle, editDescription, editDue, editRecipient, editReason, onRegisterUnsavedForm]);

  const requestClarificationClose = () => onBeforeContextChange(() => { setClarification(null); setClarificationText(''); });
  const requestPbcEditClose = () => onBeforeContextChange(() => { setEditingRequest(null); setEditReason(''); });

  const handleCancelPbc = (p: ClientPbcRequest) => {
    const reason = window.prompt('Reason for cancelling this information request (required):');
    if (!reason || !reason.trim()) return;
    try {
      prototypeStore.cancelPbcRequest(p.engagementId, p.id, reason);
      setRequestNotice('Request cancelled; shared files and prior history are retained.');
    } catch (err) { setRequestNotice(err instanceof Error ? err.message : 'Request could not be cancelled.'); }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Top breadcrumb & back button */}
      <div className="between">
        <button className="btn sm ghost" onClick={onBack}>
          <Icon name="arrow" /> Back to Portfolio
        </button>
        <span className="caption">Client ID: {client.id} · Code: {client.code}</span>
      </div>
      {clientNotice && <div role="status" className="panel panel-pad">{clientNotice}</div>}

      {/* Client Header Card */}
      <div className="panel panel-pad">
        <div className="between">
          <div className="row" style={{ gap: 16 }}>
            <div className="firmavatar" style={{ width: 48, height: 48, fontSize: 18 }}>
              {client.initials}
            </div>
            <div>
              <h2>{client.name}</h2>
              <div className="cell-sub">{client.tradingName || client.industry} · {client.jurisdiction}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <span className={`badge ${client.status === 'Active' ? 'green' : 'gray'}`}>
              {client.status}
            </span>
            <span className={`badge ${client.risk === 'Low' ? 'green' : 'amber'}`}>
              {client.risk} Risk
            </span>
          </div>
        </div>

        {/* Workspace Tab Bar */}
        <div className="tabs mt16">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="count" style={{ marginLeft: 6 }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid-main">
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel panel-pad">
              <h3>Legal Entity Information</h3>
              <div className="info-grid mt12">
                <div><label>Registration Number</label><span>{client.registrationNumber || 'N/A'}</span></div>
                <div><label>Jurisdiction</label><span>{client.jurisdiction}</span></div>
                <div><label>Industry</label><span>{client.industry}</span></div>
                <div><label>Annual Revenue</label><span>{formatCurrency(client.revenue)}</span></div>
                <div><label>Relationship Owner</label><span>{client.relationshipOwner}</span></div>
                <div><label>Engagement Partner</label><span>{client.partner || 'Daniel James'}</span></div>
              </div>
            </div>

            <div className="panel panel-pad">
              <h3>Custom Bounded Fields</h3>
              <div className="info-grid mt12">
                {client.customFields && Object.entries(client.customFields).map(([id, value]) => (
                  <div key={id}><label>{state.customFields.find(f => f.id === id)?.label || id}</label><span>{String(value)}</span></div>
                ))}
              </div>
              {activeCustomFields.length > 0 && <form className="row mt12" onSubmit={handleSaveCustomField}>
                <select className="input" aria-label="Custom field" value={customFieldId} onChange={event => { setCustomFieldId(event.target.value); setCustomFieldValue(''); }}>
                  {activeCustomFields.map(field => <option key={field.id} value={field.id}>{field.label} · {field.type}</option>)}
                </select>
                {(() => {
                  const field = activeCustomFields.find(item => item.id === customFieldId);
                  if (field?.type === 'choice') return <select className="input" aria-label="Custom field value" value={customFieldValue} onChange={event => setCustomFieldValue(event.target.value)} required><option value="">Choose…</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select>;
                  return <input className="input" aria-label="Custom field value" type={field?.type === 'date' ? 'date' : field?.type === 'number' ? 'number' : 'text'} step={field?.type === 'number' ? 'any' : undefined} value={customFieldValue} onChange={event => setCustomFieldValue(event.target.value)} required />;
                })()}
                <button className="btn sm" type="submit">Save custom value</button>
              </form>}
              <details className="mt12">
                <summary className="caption">Manage bounded custom fields</summary>
                <div className="stack mt8" style={{ gap: 6 }}>
                  {state.customFields.map(field => <div className="row between" key={field.id}>
                    <span>{field.label} · {field.type}{field.enabled === false ? ' · Disabled (saved values retained)' : ''}</span>
                    <button className="btn xs ghost" type="button" onClick={() => {
                      try { prototypeStore.setCustomFieldDefinitionEnabled(field.id, field.enabled === false); setClientNotice(`${field.label} ${field.enabled === false ? 'enabled' : 'disabled'}; saved client values are retained.`); }
                      catch (error) { setClientNotice(error instanceof Error ? error.message : 'Custom field could not be changed.'); }
                    }}>{field.enabled === false ? 'Enable' : 'Disable'}</button>
                  </div>)}
                  <form className="grid2 mt8" onSubmit={event => {
                    event.preventDefault();
                    try {
                      const options = newFieldOptions.split(',').map(item => item.trim()).filter(Boolean);
                      prototypeStore.addCustomFieldDefinition(newFieldLabel, newFieldType, options);
                      setNewFieldLabel(''); setNewFieldOptions('');
                      setClientNotice('Bounded custom field added to the shared client schema.');
                    } catch (error) { setClientNotice(error instanceof Error ? error.message : 'Custom field could not be added.'); }
                  }}>
                    <label className="caption">New field<input className="input mt4" aria-label="New custom field label" value={newFieldLabel} onChange={event => setNewFieldLabel(event.target.value)} required /></label>
                    <label className="caption">Value type<select className="input mt4" aria-label="New custom field type" value={newFieldType} onChange={event => setNewFieldType(event.target.value as CustomFieldDefinition['type'])}><option value="text">Text</option><option value="date">Date</option><option value="number">Number</option><option value="choice">Choice</option></select></label>
                    {newFieldType === 'choice' && <label className="caption" style={{ gridColumn: '1 / -1' }}>Choices (comma separated)<input className="input mt4" aria-label="New custom field choices" value={newFieldOptions} onChange={event => setNewFieldOptions(event.target.value)} required /></label>}
                    <button className="btn sm ghost" type="submit">Add bounded field</button>
                  </form>
                </div>
              </details>
              <div className="row mt12">
                <label className="caption" htmlFor="relationship-group">Non-authorizing relationship group</label>
                <select id="relationship-group" className="input" value={client.relationshipGroupId || ''} onChange={event => {
                  try { prototypeStore.assignClientRelationshipGroup(client.id, event.target.value || undefined); setClientNotice('Relationship group updated. Group membership does not grant client access.'); }
                  catch (error) { setClientNotice(error instanceof Error ? error.message : 'Relationship group could not be updated.'); }
                }}>
                  <option value="">No relationship group</option>
                  {state.relationshipGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </div>
              <form className="row mt8" onSubmit={event => {
                event.preventDefault();
                try { prototypeStore.createClientRelationshipGroup(client.id, newGroupName); setNewGroupName(''); setClientNotice('Relationship group created. Group membership does not grant client access.'); }
                catch (error) { setClientNotice(error instanceof Error ? error.message : 'Relationship group could not be created.'); }
              }}>
                <input className="input" aria-label="New relationship group" placeholder="New group name" value={newGroupName} onChange={event => setNewGroupName(event.target.value)} required />
                <button className="btn sm ghost" type="submit">Create group</button>
              </form>
            </div>
          </div>

          <div className="stack" style={{ gap: 16 }}>
            <div className="panel panel-pad">
              <h3>Quick Actions</h3>
              <div className="stack mt12" style={{ gap: 8 }}>
                <button
                  className="btn sm"
                  onClick={() => {
                    const engagement = engagements.find(item => item.id === state.selectedEngagement) || engagements[0];
                    if (!engagement) { setClientNotice('Select an engagement before preparing its client workspace.'); return; }
                    try {
                      prototypeStore.prepareClientWorkspace(client.id, engagement.year, engagement.id);
                      setClientNotice('Local workspace folders were verified under the configured synthetic SharePoint root. No remote folders were provisioned.');
                    } catch (error) {
                      setClientNotice(error instanceof Error ? error.message : 'Workspace folders could not be prepared.');
                    }
                  }}
                >
                  <Icon name="folder" /> Prepare Local Workspace Folders
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    onNavigate('portal');
                  }}
                >
                  <Icon name="globe" /> Preview Client Portal
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    onNavigate('acquisition');
                  }}
                >
                  <Icon name="target" /> View Commercial Pipeline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Contacts */}
      {activeTab === 'contacts' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Registered Contacts ({contacts.length})</h3>
            <button className="btn primary sm" onClick={openAddContact}>
              <Icon name="plus" /> Add Contact
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Title</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Responsibility period</th>
                  <th>Portal Access</th>
                  <th>Status / actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px 12px' }}>
                    <b>No contacts recorded for this client</b>
                    <p className="sub mt8">Add a contact to record responsibility periods and portal-access requests. Contact changes are versioned with before/after history.</p>
                  </td></tr>
                )}
                {contacts.map(c => (
                  <tr key={c.id} data-search-target={c.id === searchTargetId ? 'true' : undefined} className={c.id === searchTargetId ? 'selected-row' : undefined}>
                    <td><b>{c.name}</b> {c.isPrimary && <span className="tag blue">Primary</span>}{Boolean(c.history?.length) && <details className="mt4"><summary className="caption">Revision history ({c.history!.length})</summary>{c.history!.map(entry => <div className="cell-sub" key={`${entry.revision}-${entry.changedAt}`}>Rev {entry.revision} · {new Date(entry.changedAt).toLocaleString()} · by {state.users.find(user => user.id === entry.changedByUserId)?.name || entry.changedByUserId}{entry.after.email !== entry.before.email ? ` · email ${entry.before.email} → ${entry.after.email}` : ''}{entry.after.active !== entry.before.active ? ` · ${entry.before.active ? 'active' : 'inactive'} → ${entry.after.active ? 'active' : 'inactive'}` : ''}{entry.after.isPrimary !== entry.before.isPrimary ? ` · primary ${entry.before.isPrimary ? 'yes' : 'no'} → ${entry.after.isPrimary ? 'yes' : 'no'}` : ''}</div>)}</details>}</td>
                    <td>{c.title || 'Finance'}</td>
                    <td>{c.email}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.responsibility || 'Management Contact'}</td>
                    <td>{c.effectiveFrom || 'No start'} – {c.effectiveTo || 'Open ended'}</td>
                    <td>
                      <span className={`badge ${c.portalAccessRequested ? 'amber' : 'gray'}`}>
                        {c.portalAccessRequested ? 'Request pending' : 'No portal access'}
                      </span>
                      {!c.isPrimary && c.active && <button className="btn xs ghost ml8" onClick={() => prototypeStore.setPrimaryContact(client.id, c.id)}>Make primary</button>}
                    </td>
                    <td><span className={`badge ${c.active ? 'green' : 'gray'}`}>{c.active ? 'Active' : 'Inactive'}</span><button className="btn xs ghost ml8" onClick={() => editContact(c)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Engagements */}
      {activeTab === 'engagements' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Active & Historical Engagements</h3>
            <button className="btn primary sm" onClick={() => navigateWithClientEngagement('engagements')}>
              <Icon name="plus" /> New Engagement
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Engagement ID</th>
                  <th>Service</th>
                  <th>Period</th>
                  <th>Stage</th>
                  <th>Manager</th>
                  <th>Agreed Fee</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {engagements.length === 0 && <tr><td colSpan={8} className="sub text-center" style={{ padding: 16 }}>No engagements for this client yet. Accept a proposal or a client-acceptance case to create one.</td></tr>}
                {engagements.map(e => (
                  <tr key={e.id}>
                    <td><b>{e.id}</b></td>
                    <td>{e.service}</td>
                    <td>{e.period}</td>
                    <td><span className="badge teal">{e.stage}</span></td>
                    <td>{e.manager}</td>
                    <td>{formatCurrency(e.agreedFee, e.currency)}</td>
                    <td>
                      <button
                        className="btn sm"
                        onClick={() => {
                          prototypeStore.setSelectedEngagement(e.id);
                          onNavigate('engagements');
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Jobs */}
      {activeTab === 'jobs' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Jobs & Delivery Containers</h3>
            <button className="btn primary sm" onClick={() => navigateWithClientEngagement('jobs')}>
              <Icon name="plus" /> Go to Jobs
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Owner</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Budget</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 && <tr><td colSpan={7} className="sub text-center" style={{ padding: 16 }}>No jobs registered for this client. Jobs appear here once created in Jobs &amp; Tasks for one of this client's engagements.</td></tr>}
                {jobs.map(j => (
                  <tr key={j.id}>
                    <td><b>{j.title}</b><div className="cell-sub">{j.id}</div></td>
                    <td>{j.owner}</td>
                    <td>{j.dueDate}</td>
                    <td><span className="badge gray">{j.status}</span></td>
                    <td>{j.budgetHours ? `${j.budgetHours} hrs` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Documents */}
      {activeTab === 'documents' && (
        <div className="panel">
          <div className="panel-head">
            <h3>SharePoint Document Repository</h3>
            <button className="btn sm" onClick={() => navigateWithClientEngagement('documents')}>
              <Icon name="folder" /> Open Document Browser
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Path</th>
                  <th>Version</th>
                  <th>Classification</th>
                  <th>Uploaded By</th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 && <tr><td colSpan={7} className="sub text-center" style={{ padding: 16 }}>No documents registered for this client. Documents added through client uploads, the library, or workspace preparation appear here.</td></tr>}
                {documents.map(d => (
                  <tr key={d.id}>
                    <td><b>{d.name}</b></td>
                    <td><span className="mono">{d.folderPath}</span></td>
                    <td>v{d.version}</td>
                    <td><span className="tag gray">{d.classification}</span></td>
                    <td>{d.uploadedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: Requests */}
      {activeTab === 'requests' && (
        <div className="panel">
          <div className="panel-head">
            <h3>PBC Information Requests</h3>
            <div className="row" style={{ gap: 10 }}>
              <span className="caption">Outstanding: {outstandingPbcRequestCount} · Total: {pbcRequests.length}</span>
              <button className="btn primary sm" onClick={() => showPbcForm ? onBeforeContextChange(() => setShowPbcForm(false)) : setShowPbcForm(true)}>{showPbcForm ? 'Close request form' : 'New PBC Request'}</button>
            </div>
          </div>
          {requestNotice && <div role="status" className="panel-pad sub">{requestNotice}</div>}
          <div className="row panel-pad" style={{ gap: 10, flexWrap: 'wrap' }}>
            <label className="caption">Status <select aria-label="Filter PBC requests by status" className="input" value={requestStatusFilter} onChange={event => setRequestStatusFilter(event.target.value as PbcRequestStatusFilter)}><option value="All">All statuses</option>{(['Draft', 'Requested', 'Received', 'Under review', 'Needs clarification', 'Accepted', 'Cancelled'] as const).map(status => <option key={status}>{status}</option>)}</select></label>
            <label className="caption">Due date <select aria-label="Filter PBC requests by due date" className="input" value={requestDueFilter} onChange={event => setRequestDueFilter(event.target.value as PbcRequestDueFilter)}>{(['All dates', 'Overdue', 'Due today', 'Upcoming'] as const).map(due => <option key={due}>{due}</option>)}</select></label>
            <label className="caption">Client recipient <select aria-label="Filter PBC requests by client recipient" className="input" value={requestRecipientFilter} onChange={event => setRequestRecipientFilter(event.target.value)}><option value="">All recipients</option>{requestRecipients.map(recipient => <option key={recipient} value={recipient}>{recipient}</option>)}</select></label>
            <label className="caption">Search requests <input aria-label="Search PBC requests" className="input" value={requestSearch} onChange={event => setRequestSearch(event.target.value)} placeholder="Title, ID, category or contact" /></label>
            <span className="caption" role="status" aria-live="polite">Showing {visiblePbcRequests.length} of {pbcRequests.length} requests · {outstandingPbcRequestCount} outstanding</span>
            {(requestStatusFilter !== 'All' || requestDueFilter !== 'All dates' || requestRecipientFilter || requestSearch) && <button className="btn sm ghost" onClick={() => { setRequestStatusFilter('All'); setRequestDueFilter('All dates'); setRequestRecipientFilter(''); setRequestSearch(''); }}>Clear filters</button>}
          </div>
          {showPbcForm && <form ref={pbcForm} className="panel-pad grid2" onSubmit={handleCreatePbc}>
            <div><label className="caption">Engagement</label><select className="input" value={pbcEngagementId} onChange={e => setPbcEngagementId(e.target.value)} required>{engagements.map(e => <option key={e.id} value={e.id}>{e.id} · FY {e.year} · {e.service}</option>)}</select></div>
            <div><label className="caption">Request title</label><input className="input" value={pbcTitle} onChange={e => setPbcTitle(e.target.value)} required /></div>
            <div><label className="caption">Category</label><input className="input" value={pbcCategory} onChange={e => setPbcCategory(e.target.value)} required /></div>
            <div><label className="caption">Due date</label><input type="date" className="input" value={pbcDue} onChange={e => setPbcDue(e.target.value)} required /></div>
            <div><label className="caption">Client recipient</label><select className="input" value={pbcContributor} onChange={e => setPbcContributor(e.target.value)} required><option value="">Select active client contact</option>{contacts.filter(contact => contact.active).map(contact => <option key={contact.id} value={contact.name}>{contact.name} · {contact.email}</option>)}</select>{!contacts.some(contact => contact.active) && <span className="caption">Add an active client contact before creating a request.</span>}</div>
            <div className="row" style={{ alignItems: 'end' }}><button className="btn primary sm" type="submit">Save Draft Request</button></div>
          </form>}
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Request Title</th>
                  <th>Category</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Current File</th>
                  <th>History / Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePbcRequests.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px 12px' }}>
                    <b>{pbcRequests.length === 0 ? 'No PBC requests for this client yet' : 'No requests match the current filter'}</b>
                    <p className="sub mt8">{pbcRequests.length === 0 ? 'Use “New PBC Request” to draft an information request. Drafts are presented to the client, answered through the portal, clarified or accepted, and retained with full version history.' : 'Adjust the status filter or search text to see saved requests.'}</p>
                  </td></tr>
                )}
                {visiblePbcRequests.map(p => (
                  <tr key={p.id} data-search-target={p.id === searchTargetId ? 'true' : undefined} className={p.id === searchTargetId ? 'selected-row' : undefined}>
                    <td><b>{p.title}</b><div className="cell-sub">{p.id}</div>{p.clarificationNote && <div className="cell-sub">Clarification: {p.clarificationNote}</div>}{Boolean(p.sharedFiles?.length) && <details className="mt4"><summary className="caption">Submitted files ({p.sharedFiles!.length})</summary>{p.sharedFiles!.map((file, index) => <div className="cell-sub" key={`${file.id}-${index}`}>v{file.version} · {file.name} · {new Date(file.uploadedAt).toLocaleDateString()} · by {file.uploadedBy}</div>)}</details>}{Boolean(p.acceptanceHistory?.length) && <details className="mt4"><summary className="caption">Acceptance history ({p.acceptanceHistory!.length})</summary>{p.acceptanceHistory!.map(entry => <div className="cell-sub" key={`${entry.version}-${entry.acceptedAt}`}>v{entry.version} accepted by {entry.acceptedBy} · {new Date(entry.acceptedAt).toLocaleString()}</div>)}</details>}</td>
                    <td>{p.category}</td>
                    <td>{p.due}</td>
                    <td><span className={`badge ${p.status === 'Accepted' ? 'green' : p.status === 'Received' ? 'blue' : 'amber'}`}>{p.status}</span></td>
                    <td>{p.file || 'Awaiting upload'}{state.documents.some(document => document.linkedPbcId === p.id && document.clientId === client.id && document.engagementId === p.engagementId && document.brokenLink) && <div className="tag red" role="status">Reference unavailable</div>}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        {p.status === 'Draft' && <button className="btn sm" onClick={() => handlePresentPbc(p.engagementId, p.id)}>Present request</button>}
                        {!['Accepted', 'Cancelled'].includes(p.status) && <button className="btn sm ghost" onClick={() => { setEditingRequest(p); setEditTitle(p.title); setEditDescription(p.description || ''); setEditDue(p.due); setEditRecipient(p.contributor || ''); setEditReason(''); }}>Edit / reassign</button>}
                        {p.status !== 'Cancelled' && <button className="btn sm ghost" onClick={() => handleCancelPbc(p)}>Cancel request</button>}
                        {p.status === 'Cancelled' && <span className="caption">Cancelled — history retained</span>}
                        {p.status === 'Received' && <><button className="btn sm" onClick={() => { setClarification({ engagementId: p.engagementId, request: p }); setClarificationText(''); }}>Request clarification</button><button className="btn sm primary" onClick={() => handleAcceptPbc(p.engagementId, p.id)}>Accept response</button></>}
                        {p.status === 'Accepted' && <button className="btn sm" onClick={() => { setClarification({ engagementId: p.engagementId, request: p }); setClarificationText(''); }}>Request replacement</button>}
                        {p.thread?.length ? <details><summary className="caption">Conversation &amp; timeline ({p.thread.length})</summary><div className="stack mt8" role="log" aria-label={`Conversation timeline for ${p.id}`} style={{ gap: 6 }}>{p.thread.map(message => <div className="borderbox" key={message.id} style={{ padding: 8 }}><div className="between"><b>{message.author} · {message.role}</b><span className="caption">{Number.isNaN(Date.parse(message.time)) ? message.time : new Date(message.time).toLocaleString('en-GB')}</span></div><div className="cell-sub">{message.kind}{message.file ? ` · ${message.file}${message.version ? ` · v${message.version}` : ''}` : ''}{message.clientVisible === false ? ' · staff only' : ' · client visible'}</div><p className="sub mt4" style={{ whiteSpace: 'pre-line' }}>{message.text}</p></div>)}</div></details> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 7: Communications */}
      {activeTab === 'communications' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Client Communications Register</h3>
            <button className="btn primary sm" onClick={() => navigateWithClientEngagement('communications')}>
              <Icon name="message" /> Compose Email / Note
            </button>
          </div>
          <div className="stack panel-pad" style={{ gap: 12 }}>
            {communications.map(c => (
              <div key={c.id} className="borderbox" style={{ padding: 12 }}>
                <div className="between">
                  <b>{c.summary}</b>
                  <span className="tag gray">{c.channel} · {c.direction}</span>
                </div>
                <p className="sub mt8" style={{ whiteSpace: 'pre-line' }}>{c.body}</p>
                <div className="cell-sub mt8">{c.author} · {new Date(c.date).toLocaleDateString('en-GB')} · {c.visibility}{c.jobId ? ` · Job: ${state.jobs.find(job => job.id === c.jobId)?.title || c.jobId}` : ''}{c.linkedDocumentId ? ` · Document: ${state.documents.find(document => document.id === c.linkedDocumentId)?.name || 'Reference unavailable'}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 8: Time */}
      {activeTab === 'time' && (
        <div className="panel panel-pad">
          <h3>Logged Staff Hours</h3>
          <p className="sub" style={{ marginBottom: 12 }}>Total recorded time for this client.</p>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-label">Approved Minutes</span>
              <div className="metric-val">{times.reduce((s, t) => s + (t.status === 'Approved' ? t.durationMinutes : 0), 0)} min</div>
              <span className="metric-sub">{formatMinutesToHours(times.reduce((s, t) => s + (t.status === 'Approved' ? t.durationMinutes : 0), 0))}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 9: Billing */}
      {activeTab === 'billing' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Invoices & Receipts</h3>
            <button className="btn primary sm" onClick={() => navigateWithClientEngagement('billing')}>
              <Icon name="receipt" /> Go to Billing Desk
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Status</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td><b>{inv.invoiceNumber}</b></td>
                    <td>{inv.description}</td>
                    <td>{formatCurrency(inv.amount, inv.currency)}</td>
                    <td>{formatCurrency(inv.paid, inv.currency)}</td>
                    <td><span className={`badge ${inv.status === 'Paid' ? 'green' : 'amber'}`}>{inv.status}</span></td>
                    <td>{inv.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 10: Accounting */}
      {activeTab === 'accounting' && (
        <div className="panel panel-pad">
          <h3>Trial Balance & Ledgers</h3>
          <p className="sub" style={{ marginBottom: 16 }}>Imported accounting books for active external audit.</p>
          <button className="btn primary sm" onClick={() => navigateWithClientEngagement('accounting-setup')}>
            <Icon name="calculator" /> Open Accounting Workbench
          </button>
        </div>
      )}

      {/* Tab 11: Audit */}
      {activeTab === 'audit' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Assurance Workpapers ({workpapers.length})</h3>
            <button className="btn primary sm" onClick={() => navigateWithClientEngagement('audit')}>
              <Icon name="checkboard" /> Open Workpaper Desk
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>WP Ref</th>
                  <th>Title</th>
                  <th>Objective</th>
                  <th>Status</th>
                  <th>Reviewer</th>
                </tr>
              </thead>
              <tbody>
                {workpapers.map(w => (
                  <tr key={w.id}>
                    <td><b>{w.id}</b></td>
                    <td>{w.title}</td>
                    <td>{w.objective}</td>
                    <td><span className={`badge ${w.status === 'Cleared' ? 'green' : 'amber'}`}>{w.status}</span></td>
                    <td>{w.reviewer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 12: Activity */}
      {activeTab === 'activity' && (
        <div className="stack" style={{ gap: 16 }}>
          <InternalNotesPanel subjectType="client" subjectId={client.id} />
          <div className="panel panel-pad">
          <h3>Client Activity & Audit Events</h3>
          <div className="stack mt12" style={{ gap: 8 }}>
            {state.events.filter(e => visibleActivityRefs.has(e.ref)).map((ev, i) => (
              <div key={i} className="activity">
                <div className="activity-dot"><Icon name={ev.type} size="sm" /></div>
                <div>
                  <p>{ev.text}</p>
                  <small>{ev.ref} · {ev.time}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="modal-backdrop" onClick={discardContact}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{editingContactId ? 'Edit Contact' : 'Add Contact'} to {client.name}</h2>
              <button className="icon-btn" onClick={discardContact}>✕</button>
            </div>
            <form ref={contactForm} onSubmit={handleAddContact}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Full Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Fatima Al-Kuwari"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Job Title</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Finance Controller"
                    value={contactTitle}
                    onChange={e => setContactTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="caption">Email Address</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="fatima@client.demo"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    required
                  />
                </div>
                <label className="caption">Phone<input type="tel" className="input" aria-label="Contact phone" value={contactPhone} onChange={e => setContactPhone(e.target.value)} /></label>
                <div>
                  <label className="caption">Responsibility</label>
                  <input type="text" className="input" aria-label="Contact responsibility" placeholder="e.g. Financial reporting" value={contactResponsibility} onChange={e => setContactResponsibility(e.target.value)} />
                </div>
                <div className="grid2">
                  <label className="caption">Effective From<input type="date" className="input" aria-label="Contact effective from" value={contactEffectiveFrom} onChange={e => setContactEffectiveFrom(e.target.value)} /></label>
                  <label className="caption">Effective To<input type="date" className="input" aria-label="Contact effective to" value={contactEffectiveTo} onChange={e => setContactEffectiveTo(e.target.value)} /></label>
                </div>
                {editingContactId && <label className="caption">Contact status<select className="input" aria-label="Contact status" value={contactActive ? 'Active' : 'Inactive'} onChange={event => setContactActive(event.target.value === 'Active')}><option>Active</option><option>Inactive</option></select></label>}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardContact}>
                  Cancel
                </button>
                <button type="submit" className="btn primary sm">
                  {editingContactId ? 'Save Contact Changes' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {clarification && <div className="modal-backdrop" onClick={requestClarificationClose}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="pbc-clarification-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h2 id="pbc-clarification-title">Request Clarification</h2><button type="button" className="icon-btn" onClick={requestClarificationClose}>✕</button></div>
        <form ref={clarificationForm} onSubmit={handleClarification}><div className="modal-body stack" style={{ gap: 10 }}>
          <p className="sub">{clarification.request.title} · {clarification.request.id}. This message is visible to the client in the local portal.</p>
          <label className="caption">Clarification details<textarea className="input" value={clarificationText} onChange={e => setClarificationText(e.target.value)} required /></label>
        </div><div className="modal-foot"><button type="button" className="btn ghost sm" onClick={requestClarificationClose}>Cancel</button><button type="submit" className="btn primary sm">Send clarification</button></div></form>
      </div></div>}
      {editingRequest && <div className="modal-backdrop" onClick={requestPbcEditClose}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="pbc-edit-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h2 id="pbc-edit-title">Edit information request</h2><button type="button" className="icon-btn" onClick={requestPbcEditClose}>✕</button></div>
        <form ref={editRequestForm} onSubmit={handleUpdatePbc}><div className="modal-body stack" style={{ gap: 10 }}>
          <p className="sub">{editingRequest.id} · identity, attribution and prior submissions are retained; the edit is recorded in the request thread.</p>
          <label className="caption">Request title<input className="input" value={editTitle} onChange={e => setEditTitle(e.target.value)} required /></label>
          <label className="caption">Client-facing description<textarea className="input" rows={2} value={editDescription} onChange={e => setEditDescription(e.target.value)} /></label>
          <div className="grid2">
            <label className="caption">Due date<input type="date" className="input" value={editDue} onChange={e => setEditDue(e.target.value)} required /></label>
            <label className="caption">Client recipient<select className="input" value={editRecipient} onChange={e => setEditRecipient(e.target.value)} required><option value="">Select active client contact</option>{contacts.filter(contact => contact.active).map(contact => <option key={contact.id} value={contact.name}>{contact.name} · {contact.email}</option>)}</select></label>
          </div>
          <label className="caption">Reason for this edit (required, recorded with your name) *<input className="input" value={editReason} onChange={e => setEditReason(e.target.value)} required /></label>
        </div><div className="modal-foot"><button type="button" className="btn ghost sm" onClick={requestPbcEditClose}>Close</button><button type="submit" className="btn primary sm">Save edit</button></div></form>
      </div></div>}
    </div>
  );
};
