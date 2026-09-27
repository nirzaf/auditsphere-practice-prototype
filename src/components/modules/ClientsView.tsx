// Module 02: Client Portfolio & CRM (VP-006, VP-007, VP-008)
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ClientRecord, RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { visibleClientIds, visibleEngagementIds, hasAnyRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { ClientProfileModal } from './ClientProfileModal';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

import { ModuleIdentityLine, ListState, StatusBadge } from '../common/Enterprise';
interface ClientsViewProps {
  onNavigate: (route: RouteKey) => void;
  onSelectClientDetail: (clientId: string) => void;
  onBeforeContextChange: (change: () => void) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({ onNavigate, onSelectClientDetail, onBeforeContextChange, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const filterStorageKey = `ste-auditsphere-client-list-filters:${state.currentRole}`;
  const [filterText, setFilterText] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(filterStorageKey) || '{}').filterText || ''; }
    catch { return ''; }
  });
  const [statusFilter, setStatusFilter] = useState<ClientRecord['status'] | 'All'>(() => {
    try {
      const status = JSON.parse(sessionStorage.getItem(filterStorageKey) || '{}').statusFilter;
      return ['All', 'Active', 'Suspended', 'Archived'].includes(status) ? status : 'All';
    } catch { return 'All'; }
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const addClientButton = useRef<HTMLButtonElement>(null);
  const modalTriggerId = useRef<string>('');
  const restoreModalFocus = useCallback(() => {
    const triggerId = modalTriggerId.current;
    window.requestAnimationFrame(() => {
      const trigger = triggerId ? document.getElementById(triggerId) : null;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
      else if (addClientButton.current?.isConnected) addClientButton.current.focus();
    });
  }, []);
  const closeProfileModal = useCallback(() => {
    setShowAddModal(false);
    setEditingClient(null);
    restoreModalFocus();
  }, [restoreModalFocus]);
  const requestProfileClose = useCallback(() => onBeforeContextChange(closeProfileModal), [onBeforeContextChange, closeProfileModal]);

  useEffect(() => {
    if (!showAddModal && !editingClient) return;
    const modal = document.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="client-profile-title"]');
    const controls = () => [...(modal?.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
      .filter(control => !control.hasAttribute('disabled') && control.getAttribute('aria-hidden') !== 'true');
    controls()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestProfileClose();
      } else if (event.key === 'Tab') {
        const items = controls();
        if (!items.length) return;
        if (event.shiftKey && (document.activeElement === items[0] || !modal?.contains(document.activeElement))) {
          event.preventDefault(); items.at(-1)?.focus();
        } else if (!event.shiftKey && (document.activeElement === items.at(-1) || !modal?.contains(document.activeElement))) {
          event.preventDefault(); items[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showAddModal, editingClient, closeProfileModal, requestProfileClose]);

  const allowedClientIds = visibleClientIds(state);
  const allowedEngagementIds = visibleEngagementIds(state);
  const canCreateClient = hasAnyRole(state, ['relationship', 'manager', 'partner']) && allowedClientIds === 'ALL';
  const filteredClients = state.clients.filter(c => {
    const q = filterText.toLowerCase();
    return (allowedClientIds === 'ALL' || allowedClientIds.includes(c.id))
      && (statusFilter === 'All' || c.status === statusFilter)
      && (c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  });

  useEffect(() => {
    try { sessionStorage.setItem(filterStorageKey, JSON.stringify({ filterText, statusFilter })); }
    catch { /* Keep the current in-memory filter when session storage is unavailable. */ }
  }, [filterStorageKey, filterText, statusFilter]);

  const handleSaveClient = (draft: Omit<ClientRecord, 'accountingProfile' | 'customFields' | 'relationshipGroupId'>, expectedRevision?: number) => {
    if (editingClient) prototypeStore.updateClient({ ...editingClient, ...draft }, expectedRevision ?? 0);
    else prototypeStore.addClient(draft as ClientRecord);
    closeProfileModal();
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Client Portfolio</h1>
          <p>Separate legal relationships, entities, and multi-service engagement scopes.</p>
        </div>
        {canCreateClient && (
          <button id="add-client-profile-trigger" ref={addClientButton} className="btn primary sm" onClick={() => { modalTriggerId.current = 'add-client-profile-trigger'; setShowAddModal(true); }}>
            <Icon name="plus" />
            Add Client Profile
          </button>
        )}
      </div>

      <div className="toolbar">
        <div className="input-search" style={{ flex: 1, maxWidth: 400 }}>
          <Icon name="search" />
          <input
            type="text"
            className="input"
            aria-label="Filter clients"
            placeholder="Filter clients by name, code or industry..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
        </div>
        <label className="caption">Status
          <select className="input" aria-label="Client status filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value as ClientRecord['status'] | 'All')}>
            {(['All', 'Prospect', 'Active', 'Suspended', 'Archived'] as const).map(status => <option key={status}>{status}</option>)}
          </select>
        </label>
        <span className="tag gray">{filteredClients.length} clients registered</span>
      </div>

      <div className="grid3">
        {/* A filtered search must never look like an empty practice. */}
        {filteredClients.length === 0 && (
          state.clients.length === 0
            ? <ListState kind="empty" message="No client records yet" hint="Client profiles appear here once the practice onboards its first client." />
            : <ListState
                kind="no-match"
                message="No clients match these filters"
                hint={`${state.clients.length} client record(s) exist in your scope but none match “${filterText || statusFilter}”. Clear the search or reset the status filter to see them.`}
              />
        )}
        {filteredClients.map(client => {
          const clientEngs = state.engagements.filter(e => e.client === client.id && (allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(e.id)));
          const clientContacts = state.contacts.filter(c => c.clientId === client.id);

          return (
            <div key={client.id} className="client-card">
              <div className="between">
                <div className="row" style={{ gap: 10 }}>
                  <div className="firmavatar" style={{ background: 'var(--teal-light)', color: 'var(--teal)' }}>
                    {client.initials}
                  </div>
                  <div>
                    <h3>{client.name}</h3>
                    <div className="cell-sub">{client.industry}</div>
                  </div>
                </div>
                <span className={`badge ${client.status === 'Active' ? 'green' : 'gray'}`}>
                  <StatusBadge status={client.status} />
                </span>
              </div>

              <div className="row mt12" style={{ gap: 8 }}>
                <span className="caption">{client.id} ({client.code})</span>
                <span className={`badge ${client.risk === 'Low' ? 'green' : 'amber'}`}>
                  {client.risk} Risk
                </span>
              </div>

              <div className="clientstats mt12">
                <div>
                  <small>Active Engagements</small>
                  <b>{clientEngs.length}</b>
                </div>
                <div>
                  <small>Primary Contact</small>
                  <span className="small">{client.contact}</span>
                </div>
              </div>

              <div className="between mt20">
                {hasAnyRole(state, ['relationship', 'manager', 'partner']) && (allowedClientIds === 'ALL' || allowedClientIds.includes(client.id)) && <button id={`client-edit-trigger-${client.id}`} className="btn sm ghost" onClick={() => { modalTriggerId.current = `client-edit-trigger-${client.id}`; setEditingClient(client); }}>
                  Edit Profile
                </button>}
                <button
                  className="btn sm ghost"
                  onClick={() => onSelectClientDetail(client.id)}
                >
                  Client 360 Workspace
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    if (clientEngs.length > 0) {
                      prototypeStore.setSelectedEngagement(clientEngs[0].id);
                      onNavigate('engagements');
                    }
                  }}
                >
                  <Icon name="arrow" />
                  Open Work
                </button>
              </div>
            </div>
          );
        })}
        {!filteredClients.length && <p className="caption">No client profiles are available under the current access scope.</p>}
      </div>

      {(showAddModal || editingClient) && <ClientProfileModal
        existing={editingClient || undefined}
        currentPerson={state.currentPerson}
        state={state}
        onClose={closeProfileModal}
        onRequestClose={requestProfileClose}
        onSave={handleSaveClient}
        onRegisterUnsavedForm={onRegisterUnsavedForm}
      />}
    </div>
  );
};
