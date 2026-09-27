import React, { FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ClientRecord, PrototypeState } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

type ClientDraft = Omit<ClientRecord, 'accountingProfile' | 'customFields' | 'relationshipGroupId'>;

interface ClientProfileModalProps {
  existing?: ClientRecord;
  currentPerson: string;
  state: PrototypeState;
  onClose: () => void;
  onRequestClose: () => void;
  onSave: (draft: ClientDraft, expectedProfileRevision?: number) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

const eligibleUsers = (state: PrototypeState, clientId: string | undefined, roles: string[]) => state.users.filter(user => {
  if (user.status !== 'Active' || !roles.includes(user.role)) return false;
  if (!clientId) return true;
  const grant = state.roleGrants.filter(item => item.userId === user.id && item.role === user.role && (!item.expiresAt || item.expiresAt >= state.asOfDate) && (!item.effectiveFrom || item.effectiveFrom <= state.asOfDate));
  return grant.some(item => item.scopeKind === 'Global' || item.scopeKind === 'Client' && item.scopeId === clientId || item.scopeKind === 'Engagement' && state.engagements.some(engagement => engagement.id === item.scopeId && engagement.client === clientId));
});

export const ClientProfileModal: React.FC<ClientProfileModalProps> = ({ existing, currentPerson, state, onClose, onRequestClose, onSave, onRegisterUnsavedForm }) => {
  const [draft, setDraft] = useState<ClientDraft>(() => ({
    id: existing?.id || '',
    code: existing?.code || '',
    name: existing?.name || '',
    clientType: existing?.clientType || 'Company',
    profileRevision: existing?.profileRevision || 0,
    tradingName: existing?.tradingName || '',
    initials: existing?.initials || '',
    color: existing?.color,
    industry: existing?.industry || '',
    contact: existing?.contact || '',
    email: existing?.email || '',
    phone: existing?.phone || '',
    address: existing?.address || '',
    website: existing?.website || '',
    jurisdiction: existing?.jurisdiction || '',
    registrationNumber: existing?.registrationNumber || '',
    status: existing?.status || 'Prospect',
    risk: existing?.risk || 'Moderate',
    revenue: existing?.revenue || 0,
    relationshipOwner: existing?.relationshipOwner || currentPerson,
    partner: existing?.partner || '',
    manager: existing?.manager || '',
    notes: existing?.notes || '',
  }));
  const initialDraft = useRef(JSON.stringify(draft));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const saveDraftRef = useRef<() => boolean>(() => false);
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  const clients = state.clients.filter(client => client.id !== existing?.id);
  const similarWarnings = prototypeStore.getClientProfileWarnings(draft, existing?.id);
  const owners = eligibleUsers(state, existing?.id, ['relationship', 'manager', 'partner']);
  const managers = eligibleUsers(state, existing?.id, ['manager']);
  const partners = eligibleUsers(state, existing?.id, ['partner']);
  const set = <K extends keyof ClientDraft>(key: K, value: ClientDraft[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const saveDraft = (): boolean => {
    if (!form.current?.reportValidity()) return false;
    setError('');
    try {
      const assignedOwners = eligibleUsers(state, existing?.id, ['relationship', 'manager', 'partner']).map(user => user.name);
      const code = draft.code.trim().toUpperCase();
      if (clients.some(client => client.code.trim().toUpperCase() === code)) throw new Error(`Client code "${code}" is already in use.`);
      const id = existing?.id || (() => {
        const numbers = state.clients.map(client => Number(client.id.match(/^CL-(\d+)$/)?.[1] || 0));
        return `CL-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
      })();
      if (!assignedOwners.includes(draft.relationshipOwner)) throw new Error('Choose an active, in-scope relationship owner.');
      const normalized = { ...draft, id, code, initials: (draft.name.trim().slice(0, 2) || 'CL').toUpperCase(), industry: draft.industry.trim() || 'Unspecified', jurisdiction: draft.jurisdiction.trim() || 'Unspecified', contact: draft.contact.trim(), email: draft.email?.trim() || '', phone: draft.phone?.trim() || '', address: draft.address?.trim() || '', website: draft.website?.trim() || '', tradingName: draft.tradingName?.trim(), registrationNumber: draft.registrationNumber?.trim(), manager: draft.manager || undefined, partner: draft.partner || undefined, notes: draft.notes?.trim() || '', revenue: Number(draft.revenue) };
      try {
        onSave(normalized, existing ? existing.profileRevision || 0 : undefined);
        return true;
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Client profile could not be saved.');
        return false;
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Client profile could not be saved.');
      return false;
    }
  };
  saveDraftRef.current = saveDraft;
  const submit = (event: FormEvent) => { event.preventDefault(); saveDraft(); };

  useLayoutEffect(() => {
    const guard: UnsavedFormGuard = {
      label: existing ? 'client profile' : 'new client profile',
      isDirty: () => JSON.stringify(draftRef.current) !== initialDraft.current,
      save: () => saveDraftRef.current(),
      discard: onClose,
    };
    onRegisterUnsavedForm(guard, 'client-profile');
    return () => onRegisterUnsavedForm(null, 'client-profile');
  }, [existing, onClose, onRegisterUnsavedForm]);
  const input = (label: string, key: keyof ClientDraft, type = 'text', required = false) => (
    <label className="caption">{label}
      <input className="input" aria-label={label} type={type} value={(draft[key] as string | number | undefined) ?? ''} required={required}
        min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined}
        onChange={event => set(key, (type === 'number' ? Number(event.target.value) : event.target.value) as ClientDraft[typeof key])} />
    </label>
  );

  return <div className="modal-backdrop" data-dismiss-guard="self" onClick={onRequestClose}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="client-profile-title" style={{ maxWidth: 720 }} onClick={event => event.stopPropagation()}>
      <div className="modal-head">
        <h2 id="client-profile-title">{existing ? 'Edit Client Profile' : 'Create Client Profile'}</h2>
      <button type="button" className="icon-btn" aria-label="Close client profile" onClick={onRequestClose}>✕</button>
      </div>
      <form ref={form} onSubmit={submit}>
        <div className="modal-body stack" style={{ gap: 12, maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="grid2">
            {input('Client Code', 'code', 'text', true)}
            {input('Legal Entity Name', 'name', 'text', true)}
          </div>
          {similarWarnings.map(warning => <div className="panel panel-pad" style={{ color: 'var(--amber)' }} role="status" key={warning}>{warning}</div>)}
          <div className="grid2">
            <label className="caption">Client type
              <select className="input" aria-label="Client type" value={draft.clientType || ''} required onChange={event => set('clientType', event.target.value as ClientDraft['clientType'])}>
                {['Company', 'Individual', 'Partnership', 'Government', 'Nonprofit', 'Other'].map(type => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label className="caption">Client status
              <select className="input" aria-label="Client status" value={draft.status} onChange={event => set('status', event.target.value as ClientDraft['status'])}>
                {(['Prospect', 'Active', 'Suspended', 'Archived'] as const).map(status => <option key={status}>{status}</option>)}
              </select>
            </label>
          </div>
          <p className="caption">Client status records the relationship lifecycle. Commercial conversion creates a Prospect; professional acceptance and engagement activation are separate decisions.</p>
          <div className="grid2">
            {input('Trading name', 'tradingName')}
            {input('Registration number', 'registrationNumber')}
            {input('Industry', 'industry')}
            {input('Jurisdiction', 'jurisdiction')}
            {input('Address', 'address')}
            {input('Phone', 'phone', 'tel')}
            {input('Email', 'email', 'email')}
            {input('Website', 'website', 'url')}
            {input('Primary Contact Person', 'contact')}
            {input('Contact Email', 'email', 'email')}
            {input('Annual revenue (QAR)', 'revenue', 'number')}
          </div>
          <div className="grid2">
            <label className="caption">Relationship owner
              <select className="input" aria-label="Relationship owner" value={draft.relationshipOwner} required onChange={event => set('relationshipOwner', event.target.value)}>
                <option value="">Choose an owner…</option>{owners.map(user => <option key={user.id} value={user.name}>{user.name} · {user.label}</option>)}
              </select>
            </label>
            <label className="caption">Assigned partner
              <select className="input" aria-label="Assigned partner" value={draft.partner || ''} onChange={event => set('partner', event.target.value)}>
                <option value="">Not assigned</option>{partners.map(user => <option key={user.id} value={user.name}>{user.name}</option>)}
              </select>
            </label>
            <label className="caption">Assigned manager
              <select className="input" aria-label="Assigned manager" value={draft.manager || ''} onChange={event => set('manager', event.target.value)}>
                <option value="">Not assigned</option>{managers.map(user => <option key={user.id} value={user.name}>{user.name}</option>)}
              </select>
            </label>
            <label className="caption">Risk classification
              <select className="input" aria-label="Risk classification" value={draft.risk} onChange={event => set('risk', event.target.value as ClientDraft['risk'])}>
                {(['Low', 'Moderate', 'High'] as const).map(risk => <option key={risk}>{risk}</option>)}
              </select>
            </label>
          </div>
          <label className="caption">Notes<textarea className="input" aria-label="Client profile notes" value={draft.notes || ''} onChange={event => set('notes', event.target.value)} /></label>
          {error && <div className="panel panel-pad" style={{ color: 'var(--red)' }} role="alert">{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost sm" onClick={onRequestClose}>Cancel</button>
          <button type="submit" className="btn primary sm">{existing ? 'Save Client Profile' : 'Create Client'}</button>
        </div>
      </form>
    </div>
  </div>;
};
