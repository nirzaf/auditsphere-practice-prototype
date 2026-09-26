// Module 39: Firm Settings & Persona Directory (VP-019, VP-062)
// Simulated identity directory, explicit scoped grants, grant authoring & revocation, and 14-role RBAC catalogue.

import React, { useEffect, useState } from 'react';
import { RoleKey, RouteKey, UserPersona } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { roleRequiresApprovalEvidence, isSuperuserRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

interface AdministrationViewProps {
  onNavigate: (route: RouteKey) => void;
  onBeforeContextChange: (run: () => void) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const AdministrationView: React.FC<AdministrationViewProps> = ({ onNavigate, onBeforeContextChange, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'users' | 'identities' | 'grants' | 'history' | 'firm' | 'permissions'>('users');
  const [selectedUser, setSelectedUser] = useState<UserPersona | null>(null);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantScopeKind, setGrantScopeKind] = useState<'Global' | 'Client' | 'Engagement' | 'Group'>('Client');
  const [grantClientId, setGrantClientId] = useState(state.clients[0]?.id || 'CL-001');
  const [grantEngagementId, setGrantEngagementId] = useState(state.engagements[0]?.id || 'ENG-26001');
  const [grantGroupId, setGrantGroupId] = useState(state.consolidationGroups[0]?.id || '');
  const [grantEffectiveFrom, setGrantEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [grantExpiresAt, setGrantExpiresAt] = useState('');
  const [grantRequestRef, setGrantRequestRef] = useState('');
  const [grantApprovalEvidenceRef, setGrantApprovalEvidenceRef] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [identityName, setIdentityName] = useState('');
  const [identityEmail, setIdentityEmail] = useState('');
  const [identityRole, setIdentityRole] = useState<RoleKey>('preparer');
  const [inviteScope, setInviteScope] = useState<'Global' | 'Client' | 'Engagement'>('Client');
  const [inviteScopeId, setInviteScopeId] = useState(state.clients[0]?.id || 'CL-001');

  const resetIdentityDraft = () => {
    setIdentityName('');
    setIdentityEmail('');
    setIdentityRole('preparer');
    setInviteScope('Client');
    setInviteScopeId(state.clients[0]?.id || 'CL-001');
  };

  useEffect(() => {
    onRegisterUnsavedForm({
      label: 'identity and invitation draft',
      isDirty: () => Boolean(identityName || identityEmail || identityRole !== 'preparer' || inviteScope !== 'Client' || inviteScopeId !== (state.clients[0]?.id || 'CL-001')),
      // Creating identities/invitations is an explicit business action; never submit it implicitly during navigation.
      save: () => false,
      discard: resetIdentityDraft,
    }, 'administration-identities');
    return () => onRegisterUnsavedForm(null, 'administration-identities');
  }, [identityName, identityEmail, identityRole, inviteScope, inviteScopeId, onRegisterUnsavedForm, state.clients]);

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const handleResetApp = () => onBeforeContextChange(() => {
    if (confirm('Reset prototype to factory initial state? All in-memory changes will be reset to default synthetic data.')) {
      prototypeStore.resetState();
      window.location.reload();
    }
  });

  const changeTab = (tab: typeof activeTab) => onBeforeContextChange(() => setActiveTab(tab));

  const handleGrantAccess = () => {
    if (!selectedUser) return;
    try {
      const scopeId = grantScopeKind === 'Client' ? grantClientId : grantScopeKind === 'Engagement' ? grantEngagementId : grantScopeKind === 'Group' ? grantGroupId : undefined;
      prototypeStore.grantAccess(selectedUser.id, selectedUser.role, grantScopeKind, scopeId, grantReason, { effectiveFrom: grantEffectiveFrom, expiresAt: grantExpiresAt || undefined, requestRef: grantRequestRef, approvalEvidenceRef: grantApprovalEvidenceRef });
      setShowGrantModal(false);
      setGrantApprovalEvidenceRef('');
      triggerNotice('success', `Granted ${grantScopeKind} scope to ${selectedUser.name} as ${selectedUser.role}.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleRevokeAccess = (grant: typeof state.roleGrants[0]) => {
    try {
      const reason = window.prompt('Reason for revoking this access grant:');
      if (reason === null) return;
      prototypeStore.revokeAccess(grant.userId, grant.role, grant.scopeId, reason);
      triggerNotice('success', 'Access grant revoked. User authority narrowed or zeroed if last grant removed.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const userGrants = (u: UserPersona) => state.roleGrants.filter(g => g.userId === u.id);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Practice Administration &amp; Access Control</h1>
          <p>Firm settings, simulated persona directory, explicit scope grant authoring, and revocation lifecycle.</p>
        </div>
        <button className="btn sm ghost" onClick={handleResetApp} style={{ color: '#ef4444' }}>
          Reset All Data to Factory Defaults
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

      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => changeTab('users')}>
          Practice Personas ({state.users.length})
        </button>
        <button className={`tab-btn ${activeTab === 'identities' ? 'active' : ''}`} onClick={() => changeTab('identities')}>
          Identity Lifecycle ({state.simulatedInvitations?.length || 0} invitations)
        </button>
        <button className={`tab-btn ${activeTab === 'grants' ? 'active' : ''}`} onClick={() => changeTab('grants')}>
          Active Access Grants ({state.roleGrants.length})
        </button>
        <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => changeTab('history')}>
          Access History ({state.roleGrantHistory.length})
        </button>
        <button className={`tab-btn ${activeTab === 'firm' ? 'active' : ''}`} onClick={() => changeTab('firm')}>
          Firm Legal Details &amp; Branding
        </button>
        <button className={`tab-btn ${activeTab === 'permissions' ? 'active' : ''}`} onClick={() => changeTab('permissions')}>
          Role-Based Access Control (RBAC)
        </button>
      </div>

      {activeTab === 'identities' && <div className="stack" style={{ gap: 16 }}>
        <div className="panel panel-pad">
          <div className="between"><div><h3>Local demo identities</h3><p className="sub">Simulated directory records only. Creating or inviting an identity never creates a scope grant.</p></div><span className="badge blue">No live account or message</span></div>
          <form className="grid4 mt12" onSubmit={e => { e.preventDefault(); try { prototypeStore.createDemoIdentity({ name: identityName, email: identityEmail, role: identityRole, label: identityRole }); resetIdentityDraft(); triggerNotice('success', 'Simulated identity created without access grants.'); } catch (err: any) { triggerNotice('error', err.message); } }}>
            <input className="input" aria-label="Demo identity name" placeholder="Full name" value={identityName} onChange={e => setIdentityName(e.target.value)} required />
            <input className="input" type="email" aria-label="Demo identity email" placeholder="name@example.demo" value={identityEmail} onChange={e => setIdentityEmail(e.target.value)} required />
            <select className="input" aria-label="Demo identity role" value={identityRole} onChange={e => setIdentityRole(e.target.value as RoleKey)}>{(['relationship','onboarding','compliance','partner','manager','preparer','reviewer','eqr','client_admin','client_finance','client','billing','records','admin'] as RoleKey[]).map(role => <option key={role} value={role}>{role}</option>)}</select>
            <button className="btn primary" type="submit">Add local identity</button>
          </form>
          <div className="tablewrap mt12"><table><thead><tr><th>Identity</th><th>Role</th><th>Status</th><th>Explicit access grants</th><th>Lifecycle action</th></tr></thead><tbody>{state.users.map(user => <tr key={user.id}><td>{user.name}<div className="caption">{user.email} · ID {user.id}</div></td><td>{user.label}</td><td>{user.status}</td><td>{userGrants(user).length || 'None'}</td><td>{user.id !== state.currentUserId && <button className="btn sm ghost" onClick={() => { const next = user.status === 'Active' ? 'Disabled' : 'Active'; const reason = next === 'Disabled' ? window.prompt(`Reason for disabling ${user.name}:`) : `Reactivated by ${state.currentPerson}`; if (reason !== null) try { prototypeStore.setUserStatus(user.id, next, reason); } catch (err: any) { triggerNotice('error', err.message); } }}>{user.status === 'Active' ? 'Disable' : 'Reactivate'}</button>}</td></tr>)}</tbody></table></div>
        </div>
        <div className="panel panel-pad">
          <h3>Simulated invitations</h3><p className="sub">Pending, expired, accepted and revoked states are local fixtures. No invitation is sent externally.</p>
          <form className="grid4 mt12" onSubmit={e => { e.preventDefault(); try { const scopeId = inviteScope === 'Global' ? undefined : inviteScope === 'Client' ? (state.clients.some(c => c.id === inviteScopeId) ? inviteScopeId : state.clients[0]?.id) : inviteScopeId; prototypeStore.sendSimulatedInvitation({ email: identityEmail, name: identityName, role: identityRole, scopeKind: inviteScope, scopeId }); resetIdentityDraft(); triggerNotice('success', 'Simulated invitation recorded locally; no message was sent.'); } catch (err: any) { triggerNotice('error', err.message); } }}>
            <input className="input" aria-label="Invitation name" placeholder="Recipient name" value={identityName} onChange={e => setIdentityName(e.target.value)} required />
            <input className="input" type="email" aria-label="Invitation email" placeholder="name@example.demo" value={identityEmail} onChange={e => setIdentityEmail(e.target.value)} required />
            <select className="input" aria-label="Invitation scope" value={inviteScope} onChange={e => setInviteScope(e.target.value as typeof inviteScope)}><option>Client</option><option>Engagement</option><option>Global</option></select>
            {inviteScope === 'Client' ? <select className="input" aria-label="Invitation scope identifier" value={inviteScopeId} onChange={e => setInviteScopeId(e.target.value)}>{state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : inviteScope === 'Engagement' ? <select className="input" aria-label="Invitation scope identifier" value={inviteScopeId} onChange={e => setInviteScopeId(e.target.value)}>{state.engagements.map(e => <option key={e.id} value={e.id}>{e.id}</option>)}</select> : <select className="input" aria-label="Invitation role" value={identityRole} onChange={e => setIdentityRole(e.target.value as RoleKey)}>{(['relationship','onboarding','compliance','partner','manager','preparer','reviewer','eqr','client_admin','client_finance','client','billing','records','admin'] as RoleKey[]).map(role => <option key={role}>{role}</option>)}</select>}
            <button className="btn primary" type="submit">Record simulated invite</button>
          </form>
          <div className="tablewrap mt12"><table><thead><tr><th>Recipient</th><th>Role / Scope</th><th>Status</th><th>Expiry</th><th>Actions</th></tr></thead><tbody>{(state.simulatedInvitations || []).map(invite => { const expired = invite.status === 'Pending' && Date.parse(invite.expiresAt) <= Date.now(); const status = expired ? 'Expired' : invite.status; return <tr key={invite.id}><td>{invite.name}<div className="caption">{invite.email} · {invite.id}</div></td><td>{invite.role} · {invite.scopeKind}{invite.scopeId ? ` ${invite.scopeId}` : ''}</td><td>{status}</td><td>{new Date(invite.expiresAt).toLocaleDateString()}</td><td className="row">{invite.status === 'Pending' && !expired && <button className="btn sm ghost" onClick={() => { const reason = window.prompt('Reason for revoking this simulated invitation:'); if (reason) try { prototypeStore.revokeSimulatedInvitation(invite.id, reason); } catch (err: any) { triggerNotice('error', err.message); } }}>Revoke</button>}{invite.status !== 'Accepted' && <button className="btn sm ghost" onClick={() => { try { prototypeStore.resendSimulatedInvitation(invite.id); } catch (err: any) { triggerNotice('error', err.message); } }}>Renew 7 days</button>}{invite.status === 'Pending' && !expired && <button className="btn sm" onClick={() => { try { prototypeStore.acceptSimulatedInvitation(invite.id); triggerNotice('success', 'Simulated recipient accepted; this created no access grant.'); } catch (err: any) { triggerNotice('error', err.message); } }}>Simulate acceptance</button>}</td></tr>; })}</tbody></table></div>
          <details className="mt12"><summary className="caption">Identity lifecycle history ({state.identityStatusHistory?.length || 0})</summary><div className="tablewrap"><table><thead><tr><th>Time</th><th>Action</th><th>Identity</th><th>Actor</th><th>Reason</th></tr></thead><tbody>{(state.identityStatusHistory || []).map(event => <tr key={event.id}><td>{event.timestamp}</td><td>{event.action}</td><td>{event.userName} · {event.role}</td><td>{event.actor}</td><td>{event.reason || '—'}</td></tr>)}</tbody></table></div></details>
        </div>
      </div>}

      {/* Users Directory */}
      {activeTab === 'users' && (
        <div className="panel">
          <div className="panel-head between">
            <div>
              <h3>Registered Practice Personas</h3>
              <span className="caption">Click any persona to view assigned scoped grants and manage access</span>
            </div>
            <span className="badge blue">Simulated Identities (No live SSO)</span>
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Persona Name</th>
                  <th>Practice Role</th>
                  <th>Email Account</th>
                  <th>Status</th>
                  <th>Explicit Grants</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.users.map(u => {
                  const grants = userGrants(u);
                  return (
                    <tr
                      key={u.id}
                      style={{
                        background: u.id === state.currentUserId ? '#f0fdf4' : 'inherit',
                        cursor: 'pointer'
                      }}
                      onClick={() => setSelectedUser(u)}
                    >
                      <td>
                        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                          <div className="firmavatar sm">{u.name.split(' ').map(n => n[0]).join('')}</div>
                          <div>
                            <b>{u.name}</b>
                            {u.id === state.currentUserId && <span className="tag green" style={{ marginLeft: 6 }}>Active Persona</span>}
                          </div>
                        </div>
                      </td>
                      <td>{u.label}</td>
                      <td><span className="mono">{u.email}</span></td>
                      <td>
                        <span className={`badge ${u.status === 'Active' ? 'green' : 'red'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td>
                        <b>{grants.length} grants</b>
                        {grants.length > 0 && <span className="cell-sub"> ({grants.map(g => g.scopeKind).join(', ')})</span>}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }} onClick={e => e.stopPropagation()}>
                          <button
                            className="btn sm"
                            onClick={() => {
                              setSelectedUser(u);
                              setGrantApprovalEvidenceRef(''); setGrantGroupId(state.consolidationGroups[0]?.id || '');
                              setShowGrantModal(true);
                            }}
                          >
                            + Grant Scope
                          </button>
                          {u.id !== state.currentUserId && (
                            <button
                              className="btn sm ghost"
                              onClick={() => {
                                prototypeStore.setPersona(u.id);
                                triggerNotice('success', `Switched active session persona to ${u.name} (${u.role}).`);
                              }}
                            >
                              Switch Persona
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grants Register */}
      {activeTab === 'grants' && (
        <div className="panel">
          <div className="panel-head between">
            <div>
              <h3>Explicit Access Grants Register</h3>
              <span className="caption">Revoking a person's last grant strictly zeros their access (no role fallback)</span>
            </div>
            <span className="caption">Total active grants: {state.roleGrants.length}</span>
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Granted Person</th>
                  <th>Assigned Role</th>
                  <th>Scope Kind</th>
                  <th>Bound Entity / Context</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.roleGrants.map((g, idx) => (
                  <tr key={idx}>
                    <td><b>{g.userId}</b></td>
                    <td><span className="tag gray">{g.role}</span></td>
                    <td>
                      <span className={`badge ${g.scopeKind === 'Global' ? 'purple' : g.scopeKind === 'Client' ? 'blue' : 'teal'}`}>
                        {g.scopeKind}
                      </span>
                    </td>
                    <td>
                      {g.scopeKind === 'Global' && <span>Firm-wide unrestricted practice</span>}
                      {g.scopeKind === 'Client' && <b>Client: {g.scopeId}</b>}
                      {g.scopeKind === 'Engagement' && <b>Engagement: {g.scopeId}</b>}
                      <div className="caption">Effective {g.effectiveFrom || 'immediately'}{g.expiresAt ? ` · expires ${g.expiresAt}` : ' · no expiry'} · Request {g.requestRef || 'legacy'}{g.approvalEvidenceRef ? ` · Approval evidence ${g.approvalEvidenceRef}` : ''}</div>
                    </td>
                    <td>
                      <button
                        className="btn sm ghost text-danger"
                        onClick={() => handleRevokeAccess(g)}
                      >
                        Revoke Grant
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="panel">
          <div className="panel-head"><h3>Immutable Access Grant History</h3><span className="caption">New grants append here; revocation never erases its grant event.</span></div>
          <div className="tablewrap"><table><thead><tr><th>Time</th><th>Action</th><th>Person</th><th>Role</th><th>Scope</th><th>Actor</th><th>Effective window</th><th>Access request</th><th>Approval evidence</th><th>Reason</th></tr></thead><tbody>
            {[...state.roleGrantHistory].reverse().map(event => <tr key={event.id}>
              <td>{event.at}</td><td><span className={`badge ${event.action === 'Granted' ? 'green' : 'amber'}`}>{event.action}</span></td>
              <td>{state.users.find(user => user.id === event.userId)?.name || event.userId}</td><td>{event.role}</td>
              <td>{event.scopeKind}{event.scopeId ? ` · ${event.scopeId}` : ''}</td>
              <td>{state.users.find(user => user.id === event.actorUserId)?.name || event.actorUserId}</td><td>{event.effectiveFrom || 'Immediate'}{event.expiresAt ? ` – ${event.expiresAt}` : ''}</td><td>{event.requestRef || '—'}</td><td>{event.approvalEvidenceRef || '—'}</td><td>{event.reason || '—'}</td>
            </tr>)}
          </tbody></table></div>
          {state.roleGrantHistory.length === 0 && <p className="sub panel-pad">No access changes have been recorded in this browser state.</p>}
        </div>
      )}

      {/* Firm Legal Details */}
      {activeTab === 'firm' && (
        <FirmSettingsPanel
          state={state}
          onRegisterUnsavedForm={onRegisterUnsavedForm}
          onSaved={(text) => triggerNotice('success', text)}
          onError={(text) => triggerNotice('error', text)}
        />
      )}

      {/* RBAC Catalogue */}
      {activeTab === 'permissions' && (
        <div className="panel panel-pad">
          <h3>The 10 Prototype Application Roles</h3>
          <p className="sub mt4">Explicit separation of duties catalogue enforced across all business commands.</p>
          <div className="grid2 mt16" style={{ gap: 12 }}>
            {[
              { role: 'manager', label: 'Engagement Manager', scope: 'Assigned engagements; prepares candidates, review notes, and TB adjustments.' },
              { role: 'partner', label: 'Engagement Partner', scope: 'Final statutory sign-off, release authorization, and proposal approvals.' },
              { role: 'preparer', label: 'Audit Preparer', scope: 'Drafts workpapers, uploads client evidence, logs substantive testing.' },
              { role: 'reviewer', label: 'Senior Reviewer', scope: 'Clears working papers, raises review notes, verifies checklists.' },
              { role: 'eqr', label: 'Engagement Quality Reviewer', scope: 'Independent quality concurrence and EQR concern logging.' },
              { role: 'billing', label: 'Billing Officer', scope: 'Drafts invoices, applies credit notes, and manages offline receipts.' },
              { role: 'admin', label: 'System Administrator', scope: 'Firm settings, persona management, and explicit scope grant authoring.' },
              { role: 'client', label: 'Management Approver', scope: 'Formal approval of financial packages and representation letters.' },
              { role: 'client_admin', label: 'Client Administrator', scope: 'Client organization user management (not management accounts).' },
              { role: 'client_finance', label: 'Client Contributor', scope: 'Uploads PBC evidence and views published billing invoices.' }
            ].map((r, i) => (
              <div key={i} className="borderbox" style={{ padding: 12 }}>
                <div className="between">
                  <b>{r.label}</b>
                  <span className="mono tag gray">{r.role}</span>
                </div>
                <div className="cell-sub mt4">{r.scope}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Detail Drawer */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal-card" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="between">
              <h3>User Detail: {selectedUser.name}</h3>
              <button className="btn sm ghost" onClick={() => setSelectedUser(null)}>✕</button>
            </div>

            <div className="info-grid mt16">
              <div><label>Practice Role</label><span>{selectedUser.label}</span></div>
              <div><label>Role Code</label><span className="mono">{selectedUser.role}</span></div>
              <div><label>Email</label><span className="mono">{selectedUser.email}</span></div>
              <div><label>Account Status</label><span className={`badge ${selectedUser.status === 'Active' ? 'green' : 'red'}`}>{selectedUser.status}</span></div>
            </div>

            <div className="divider mt16" />

            <div className="between mt16">
              <h4>Assigned Explicit Scope Grants ({userGrants(selectedUser).length})</h4>
              <button
                className="btn sm primary"
                onClick={() => { setGrantApprovalEvidenceRef(''); setGrantGroupId(state.consolidationGroups[0]?.id || ''); setShowGrantModal(true); }}
              >
                + New Grant
              </button>
            </div>

            {userGrants(selectedUser).length === 0 ? (
              <div className="borderbox mt12 text-center" style={{ padding: 16 }}>
                <b>No active grants assigned.</b>
                <p className="sub mt4">Under the least-privilege contract, this identity has zero access authority.</p>
              </div>
            ) : (
              <div className="stack mt12" style={{ gap: 8 }}>
                {userGrants(selectedUser).map((g, idx) => (
                  <div key={idx} className="between borderbox" style={{ padding: 10 }}>
                    <div>
                      <span className={`badge ${g.scopeKind === 'Global' ? 'purple' : g.scopeKind === 'Client' ? 'blue' : 'teal'}`}>
                        {g.scopeKind}
                      </span>
                      <span style={{ marginLeft: 8 }}>
                        {g.scopeKind === 'Global' && 'Unrestricted firm access'}
                        {g.scopeKind === 'Client' && `Client: ${g.scopeId}`}
                        {g.scopeKind === 'Engagement' && `Engagement: ${g.scopeId}`}
                      </span>
                    </div>
                    <button
                      className="btn sm ghost text-danger"
                      onClick={() => handleRevokeAccess(g)}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grant Creation Modal */}
      {showGrantModal && selectedUser && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <div className="between">
              <h3>Grant Access Scope</h3>
              <button className="btn sm ghost" onClick={() => { setGrantApprovalEvidenceRef(''); setShowGrantModal(false); }}>✕</button>
            </div>
            <p className="sub mt4">Author an approved, dated scope grant for {selectedUser.name}.</p>

            <div className="stack mt16" style={{ gap: 12 }}>
              <div>
                <label className="caption">Scope Kind</label>
                <select
                  className="input"
                  value={grantScopeKind}
                  onChange={e => setGrantScopeKind(e.target.value as any)}
                >
                  <option value="Client">Client Scope (Restricted to one client)</option>
                  <option value="Engagement">Engagement Scope (Restricted to one engagement)</option>
                  <option value="Group">Group Reporting Scope (named consolidation group only)</option>
                  <option value="Global">Global Scope (Practice-wide)</option>
                </select>
              </div>

              {grantScopeKind === 'Client' && (
                <div>
                  <label className="caption">Target Client</label>
                  <select
                    className="input"
                    value={grantClientId}
                    onChange={e => setGrantClientId(e.target.value)}
                  >
                    {state.clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                    ))}
                  </select>
                </div>
              )}

              {grantScopeKind === 'Engagement' && (
                <div>
                  <label className="caption">Target Engagement</label>
                  <select
                    className="input"
                    value={grantEngagementId}
                    onChange={e => setGrantEngagementId(e.target.value)}
                  >
                    {state.engagements.map(eng => (
                      <option key={eng.id} value={eng.id}>{eng.id} · {eng.client} · {eng.service}</option>
                    ))}
                  </select>
                </div>
              )}

              {grantScopeKind === 'Group' && (
                <div>
                  <label className="caption">Target Consolidation Group</label>
                  <select className="input" aria-label="Target consolidation group" value={grantGroupId} onChange={event => setGrantGroupId(event.target.value)}>
                    {state.consolidationGroups.map(group => <option key={group.id} value={group.id}>{group.name} ({group.id})</option>)}
                  </select>
                  <p className="caption mt4">This grant exposes this group reporting workspace only; it does not grant client or engagement access to group members.</p>
                </div>
              )}

              <div>
                <label className="caption">Requested persona role</label>
                <input className="input" value={selectedUser.role} readOnly />
              </div>
              <div className="grid2">
                <label className="caption">Effective from<input className="input mt4" aria-label="Grant effective from" type="date" required value={grantEffectiveFrom} onChange={e => setGrantEffectiveFrom(e.target.value)} /></label>
                <label className="caption">Expires on (optional)<input className="input mt4" aria-label="Grant expiry date" type="date" value={grantExpiresAt} onChange={e => setGrantExpiresAt(e.target.value)} /></label>
              </div>
              <label className="caption">Approved request reference<input className="input mt4" aria-label="Approved access request reference" required value={grantRequestRef} onChange={e => setGrantRequestRef(e.target.value)} placeholder="e.g. AR-2026-0042" /></label>
              {roleRequiresApprovalEvidence(selectedUser.role) && <label className="caption">Separate professional / management approval evidence reference<input className="input mt4" aria-label="Professional or management approval evidence reference" required value={grantApprovalEvidenceRef} onChange={e => setGrantApprovalEvidenceRef(e.target.value)} placeholder="e.g. HR-CREDENTIAL-2026-014" /></label>}
              <label className="caption">Reason<textarea className="input mt4" aria-label="Access grant reason" required value={grantReason} onChange={e => setGrantReason(e.target.value)} placeholder="Why this person needs this role and scope" /></label>
            </div>

            <div className="row mt20" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn sm ghost" onClick={() => { setGrantApprovalEvidenceRef(''); setShowGrantModal(false); }}>Cancel</button>
              <button className="btn primary sm" onClick={handleGrantAccess}>
                Record approved grant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Module 39 (VP-062): editable firm profile. Changes apply prospectively —
 *  issued invoices, released packages and archived records keep their original
 *  captured identity; new PDF exports and generated artifacts use the saved values. */
const FirmSettingsPanel: React.FC<{
  state: ReturnType<typeof prototypeStore.getSnapshot>;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
  onSaved: (text: string) => void;
  onError: (text: string) => void;
}> = ({ state, onRegisterUnsavedForm, onSaved, onError }) => {
  const firm = state.firmSettings;
  const [draft, setDraft] = useState({ ...firm });
  const [reason, setReason] = useState('');
  const isAdmin = isSuperuserRole(state.currentRole) || (state.currentRole === 'admin' && state.roleGrants.some(g => g.userId === state.currentUserId && g.role === 'admin' && g.scopeKind === 'Global'));
  const firmEvents = state.events.filter(event => event.ref === 'FIRM').slice(0, 5);
  const changed = JSON.stringify(draft) !== JSON.stringify(firm);

  useEffect(() => {
    onRegisterUnsavedForm({
      label: 'firm settings draft',
      isDirty: () => JSON.stringify(draft) !== JSON.stringify(firm) || Boolean(reason.trim()),
      save: () => {
        try {
          prototypeStore.updateFirmSettings(draft, reason.trim() || 'firm profile update');
          setReason('');
          onSaved('Firm settings saved. Changes apply prospectively; existing issued invoices, releases and archives are unchanged.');
          return true;
        } catch (err: any) {
          onError(err.message);
          return false;
        }
      },
      discard: () => { setDraft({ ...firm }); setReason(''); },
    }, 'administration-firm-settings');
    return () => onRegisterUnsavedForm(null, 'administration-firm-settings');
  }, [draft, firm, onError, onRegisterUnsavedForm, onSaved, reason]);

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      prototypeStore.updateFirmSettings(draft, reason.trim() || 'firm profile update');
      onSaved('Firm settings saved. Changes apply prospectively; existing issued invoices, releases and archives are unchanged.');
      setReason('');
    } catch (err: any) {
      onError(err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <form className="panel panel-pad stack" onSubmit={handleSave} style={{ gap: 12 }}>
        <div>
          <h3>Firm Statutory Profile</h3>
          <p className="sub mt4">Saved values flow into new invoice and credit-note PDF exports and future generated artifacts. Previously issued documents retain the identity captured at their creation.</p>
        </div>
        {!isAdmin && (
          <div className="panel panel-pad" style={{ background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e', padding: '8px 12px' }}>
            Only administrators with an active Global grant can change firm settings. The form is read-only for your role.
          </div>
        )}
        <div className="grid2" style={{ gap: 16 }}>
          <div>
            <label className="caption" htmlFor="firm-name">Firm Trading Name</label>
            <input id="firm-name" type="text" className="input" required maxLength={120} disabled={!isAdmin} value={draft.firmName} onChange={e => setDraft({ ...draft, firmName: e.target.value })} />
          </div>
          <div>
            <label className="caption" htmlFor="firm-legal-name">Firm Legal Name</label>
            <input id="firm-legal-name" type="text" className="input" required maxLength={200} disabled={!isAdmin} value={draft.firmLegalName} onChange={e => setDraft({ ...draft, firmLegalName: e.target.value })} />
          </div>
          <div>
            <label className="caption" htmlFor="firm-jurisdiction">Licensed Jurisdiction</label>
            <input id="firm-jurisdiction" type="text" className="input" required maxLength={80} disabled={!isAdmin} value={draft.jurisdiction} onChange={e => setDraft({ ...draft, jurisdiction: e.target.value })} />
          </div>
          <div>
            <label className="caption" htmlFor="firm-currency">Firm Reporting Currency (ISO code)</label>
            <input id="firm-currency" type="text" className="input" required maxLength={3} minLength={3} disabled={!isAdmin} value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <label className="caption" htmlFor="firm-inv-prefix">Invoice Number Prefix</label>
            <input id="firm-inv-prefix" type="text" className="input" required maxLength={16} aria-label="Invoice number prefix" disabled={!isAdmin} value={draft.invoiceNumberPrefix} onChange={e => setDraft({ ...draft, invoiceNumberPrefix: e.target.value })} />
          </div>
          <div>
            <label className="caption" htmlFor="firm-inv-next">Next Invoice Number</label>
            <input id="firm-inv-next" type="number" className="input" required min={1} step={1} disabled={!isAdmin} value={draft.invoiceNextNumber} onChange={e => setDraft({ ...draft, invoiceNextNumber: Number(e.target.value) })} />
          </div>
          <div>
            <label className="caption" htmlFor="firm-credit-prefix">Credit Number Prefix</label>
            <input id="firm-credit-prefix" type="text" className="input" required maxLength={16} disabled={!isAdmin} value={draft.creditNumberPrefix} onChange={e => setDraft({ ...draft, creditNumberPrefix: e.target.value })} />
          </div>
          <div>
            <label className="caption" htmlFor="firm-credit-next">Next Credit Number</label>
            <input id="firm-credit-next" type="number" className="input" required min={1} step={1} disabled={!isAdmin} value={draft.creditNextNumber} onChange={e => setDraft({ ...draft, creditNextNumber: Number(e.target.value) })} />
          </div>
          <div>
            <label className="caption" htmlFor="firm-terms">Default Payment Terms (days)</label>
            <input id="firm-terms" type="number" className="input" required min={0} max={365} step={1} disabled={!isAdmin} value={draft.paymentTermsDays} onChange={e => setDraft({ ...draft, paymentTermsDays: Number(e.target.value) })} />
          </div>
          <div>
            <label className="caption" htmlFor="firm-locale">Locale</label>
            <input id="firm-locale" type="text" className="input" required maxLength={16} disabled={!isAdmin} value={draft.locale} onChange={e => setDraft({ ...draft, locale: e.target.value })} />
          </div>
          <div>
            <label className="caption" htmlFor="firm-timezone">Display Timezone</label>
            <input id="firm-timezone" type="text" className="input" required maxLength={32} disabled={!isAdmin} value={draft.timezone} onChange={e => setDraft({ ...draft, timezone: e.target.value })} />
          </div>
          <div>
            <label className="caption" htmlFor="firm-logo">Firm Logo Reference (optional)</label>
            <input id="firm-logo" type="text" className="input" maxLength={80} disabled={!isAdmin} value={draft.logoRef || ''} onChange={e => setDraft({ ...draft, logoRef: e.target.value || undefined })} placeholder="e.g. brand/firm-logo-2026" />
          </div>
        </div>
        <div className="borderbox" style={{ padding: 12 }}>
          <b className="caption">Firm logo placeholder</b>
          <div className="sub mt4">{draft.logoRef ? <>Reference “{draft.logoRef}” recorded. This browser-local prototype stores no image payload, so generated outputs continue to render the firm name in text.</> : <>No logo reference is configured. Generated outputs render the firm name in text — this is the expected placeholder state, not an error.</>}</div>
        </div>
        <label className="caption" htmlFor="firm-reason">Reason for this change</label>
        <input id="firm-reason" type="text" className="input" maxLength={200} disabled={!isAdmin} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Annual legal-name refresh" />
        <div className="row" style={{ gap: 10 }}>
          <button type="submit" className="btn primary sm" disabled={!isAdmin || !changed}>Save Firm Settings</button>
          <button type="button" className="btn ghost sm" disabled={!isAdmin || !changed} onClick={() => { setDraft({ ...firm }); setReason(''); }}>Discard Changes</button>
          {changed && <span className="caption">Unsaved changes — settings apply only after saving.</span>}
        </div>
      </form>
      <div className="panel panel-pad">
        <h4>Recent Firm Settings Changes</h4>
        {firmEvents.length === 0 ? (
          <p className="sub mt4">No firm settings changes recorded in this browser session.</p>
        ) : (
          <div className="stack mt8" style={{ gap: 6 }}>
            {firmEvents.map((event, index) => (
              <div className="caption" key={index}>· {event.text} — {event.time}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
