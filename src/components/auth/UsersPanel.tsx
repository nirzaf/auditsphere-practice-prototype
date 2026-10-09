import React, { useEffect, useState } from 'react';
import type { BusinessActorProfile, BusinessUserSummary, BusinessWorkspacePreference } from '../../shared/api/business';
import { getBusinessActorProfiles, getBusinessUsers, newBusinessIdempotencyKey, runBusinessCommand } from '../../services/businessWorkspace';

type StaffOption = { id: string; displayName: string; grade: string; active: boolean };

export function UsersPanel({ workspaceId, selected, staffMembers = [] }: {
  workspaceId: string;
  selected: BusinessWorkspacePreference;
  staffMembers?: StaffOption[];
}) {
  const [users, setUsers] = useState<BusinessUserSummary[]>([]);
  const [profiles, setProfiles] = useState<BusinessActorProfile[]>([]);
  const [staffMemberId, setStaffMemberId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [grantSelections, setGrantSelections] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async (signal?: AbortSignal) => {
    const [nextUsers, nextProfiles] = await Promise.all([
      getBusinessUsers(workspaceId, signal), getBusinessActorProfiles(workspaceId, signal)
    ]);
    if (signal?.aborted) return;
    setUsers(nextUsers);
    setProfiles(nextProfiles);
    setGrantSelections(current => Object.fromEntries(nextUsers.map(user => [user.id,
      current[user.id] && nextProfiles.some(profile => profile.id === current[user.id]) ? current[user.id] :
        nextProfiles.find(profile => !user.grants.some(grant => grant.actorProfileId === profile.id))?.id ?? ''
    ])));
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void refresh(controller.signal).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Firm users could not be loaded.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId]);

  const run = async (label: string, command: unknown) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await runBusinessCommand(workspaceId, selected, command, newBusinessIdempotencyKey());
      await refresh(); setMessage(label);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The user management action failed.');
    } finally { setBusy(false); }
  };

  const invite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const staff = staffMembers.find(item => item.id === staffMemberId && item.active);
    if (!staff || !inviteEmail.trim()) { setError('Choose an active staff member and provide the invited email address.'); return; }
    await run(`Invitation queued for ${inviteEmail.trim()}.`, {
      type: 'user.inviteStaff', payload: { staffMemberId, email: inviteEmail.trim() }
    });
    setInviteEmail('');
  };

  return <section className="business-directory-card auth-users-panel" aria-labelledby="auth-users-heading">
    <div className="business-section-heading">
      <div><p className="business-eyebrow">FIRM ADMINISTRATION</p><h2 id="auth-users-heading">Users and assigned profiles</h2></div>
      <button type="button" className="btn sm" disabled={loading || busy} onClick={() => {
        setLoading(true); void refresh().catch(reason => setError(reason instanceof Error ? reason.message : 'Refresh failed.'))
          .finally(() => setLoading(false));
      }}>{loading ? 'Loading…' : 'Refresh users'}</button>
    </div>
    {error && <p className="business-alert" role="alert">{error}</p>}
    {message && <p className="business-command-message" role="status">{message}</p>}
    <form className="business-form business-staff-form" onSubmit={invite}>
      <h3>Invite a staff member</h3>
      <div className="business-form-grid">
        <label className="business-field" htmlFor="auth-invite-staff"><span>Active staff record</span>
          <select id="auth-invite-staff" required value={staffMemberId} onChange={event => setStaffMemberId(event.target.value)}>
            <option value="">Choose a staff member</option>
            {staffMembers.filter(staff => staff.active).map(staff => <option key={staff.id} value={staff.id}>{staff.displayName} · {staff.grade}</option>)}
          </select>
        </label>
        <label className="business-field" htmlFor="auth-invite-email"><span>Invitation email</span>
          <input id="auth-invite-email" type="email" autoComplete="email" required maxLength={254} value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} />
        </label>
      </div>
      <p className="business-note">The invitation is delivered through the configured email provider and expires after seven days.</p>
      <button className="btn primary" type="submit" disabled={busy || !staffMemberId}>{busy ? 'Sending…' : 'Send staff invitation'}</button>
    </form>
    {loading ? <p role="status">Loading user accounts…</p> : users.length ? <ul className="auth-user-list" aria-label="Firm user accounts">
      {users.map(user => <li key={user.id} className="auth-user-card">
        <div className="auth-user-heading"><div><strong>{user.displayName}</strong><span>{user.email}</span></div>
          <span className={`auth-user-status status-${user.status.toLowerCase()}`}>{user.status}</span></div>
        <p className="auth-user-meta">{user.kind}{user.staffGrade ? ` · ${user.staffGrade}` : ''}{user.isFirmAdmin ? ' · Firm administrator' : ''}{user.lastLoginAt ? ` · Last sign-in ${new Date(user.lastLoginAt).toLocaleDateString()}` : ''}</p>
        <div className="auth-user-grants"><strong>Assigned profiles</strong>
          {user.grants.length ? <ul>{user.grants.map(grant => <li key={grant.id}>
            <span>{grant.displayName} · {grant.persona}{grant.staffGrade ? ` · ${grant.staffGrade}` : ''}</span>
            {grant.revokedAt ? <span className="business-muted">Revoked</span> : <button className="btn sm" type="button" disabled={busy}
              onClick={() => void run(`Profile grant removed from ${user.displayName}.`, { type: 'user.revokeProfile', payload: { grantId: grant.id } })}>Revoke</button>}
          </li>)}</ul> : <p className="business-muted">No profile grants.</p>}
        </div>
        {user.status !== 'DISABLED' && user.status !== 'LOCKED' && <div className="auth-user-grant-action">
          <label className="business-field" htmlFor={`auth-grant-${user.id}`}><span>Grant a profile</span>
            <select id={`auth-grant-${user.id}`} value={grantSelections[user.id] ?? ''} onChange={event => setGrantSelections(current => ({ ...current, [user.id]: event.target.value }))}>
              <option value="">Choose an unassigned profile</option>
              {profiles.filter(profile => !user.grants.some(grant => !grant.revokedAt && grant.actorProfileId === profile.id)).map(profile =>
                <option key={profile.id} value={profile.id}>{profile.displayName} · {profile.persona}{profile.staffGrade ? ` · ${profile.staffGrade}` : ''}</option>)}
            </select>
          </label>
          <button type="button" className="btn sm" disabled={busy || !grantSelections[user.id]} onClick={() => void run(`Profile granted to ${user.displayName}.`, {
            type: 'user.grantProfile', payload: { userAccountId: user.id, actorProfileId: grantSelections[user.id], expectedVersion: user.version }
          })}>Grant profile</button>
        </div>}
        <div className="auth-user-actions">
          {user.status === 'LOCKED' && <button className="btn sm" type="button" disabled={busy} onClick={() => void run(`${user.displayName} was unlocked.`, {
            type: 'user.unlock', payload: { userAccountId: user.id, expectedVersion: user.version }
          })}>Unlock account</button>}
          {user.kind === 'STAFF' && user.status !== 'DISABLED' && <>
            <label className="business-field" htmlFor={`auth-user-reason-${user.id}`}><span>Reason (10–1,000 characters)</span>
              <input id={`auth-user-reason-${user.id}`} minLength={10} maxLength={1000} value={reasons[user.id] ?? ''}
                onChange={event => setReasons(current => ({ ...current, [user.id]: event.target.value }))} />
            </label>
            <button className="btn sm" type="button" disabled={busy || (reasons[user.id] ?? '').trim().length < 10} onClick={() => void run(`${user.displayName} was disabled.`, {
              type: 'user.disable', payload: { userAccountId: user.id, expectedVersion: user.version, reason: reasons[user.id].trim() }
            })}>Disable</button>
          </>}
          {user.kind === 'STAFF' && user.status === 'DISABLED' && <>
            <label className="business-field" htmlFor={`auth-user-enable-reason-${user.id}`}><span>Re-enable reason (10–1,000 characters)</span>
              <input id={`auth-user-enable-reason-${user.id}`} minLength={10} maxLength={1000} value={reasons[user.id] ?? ''}
                onChange={event => setReasons(current => ({ ...current, [user.id]: event.target.value }))} />
            </label>
            <button className="btn sm" type="button" disabled={busy || (reasons[user.id] ?? '').trim().length < 10} onClick={() => void run(`${user.displayName} was enabled.`, {
              type: 'user.enable', payload: { userAccountId: user.id, expectedVersion: user.version, reason: reasons[user.id].trim() }
            })}>Enable</button>
          </>}
        </div>
      </li>)}
    </ul> : <p className="business-muted">No user accounts are registered.</p>}
  </section>;
}
