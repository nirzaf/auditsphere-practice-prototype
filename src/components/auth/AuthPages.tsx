import React, { useState } from 'react';
import type { AuthMe, AuthProfile } from '../../shared/api/auth';
import { changeClientPassword, chooseActiveProfile, clientLogin, confirmPasswordReset, requestPasswordReset } from '../../services/auth';
import './auth.css';

function AuthFrame({ children }: { children: React.ReactNode }) {
  return <main className="auth-page"><section className="auth-card" aria-label="AuditSphere account access">
    <div className="auth-brand"><span className="business-brand-mark" aria-hidden="true">AS</span><div><strong>AuditSphere</strong><span>Secure audit workspace</span></div></div>
    {children}
    <p className="auth-footnote">Your account and assigned access are managed by your audit firm.</p>
  </section></main>;
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return children ? <p className="auth-error" role="alert">{children}</p> : null;
}

export function SignInPage({ onSignedIn, sessionExpired = false }: { onSignedIn: (me: AuthMe) => void; sessionExpired?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try { onSignedIn(await clientLogin(email, password)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-in failed. Check your details and retry.'); }
    finally { setBusy(false); }
  };

  return <AuthFrame>
    <div className="auth-heading"><p className="auth-eyebrow">WELCOME BACK</p><h1>Sign in to AuditSphere</h1><p>Choose your secure sign-in method.</p></div>
    {sessionExpired && <p className="auth-notice" role="status">Your session ended. Sign in again to continue.</p>}
    <a className="auth-sso" href="/api/auth/staff/login">Firm staff <span>Sign in with Microsoft</span><span aria-hidden="true">→</span></a>
    <div className="auth-divider"><span>CLIENT PORTAL</span></div>
    <form className="auth-form" onSubmit={submit}>
      <ErrorMessage>{error}</ErrorMessage>
      <label htmlFor="auth-client-email">Email address</label>
      <input id="auth-client-email" type="email" autoComplete="username" inputMode="email" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} />
      <label htmlFor="auth-client-password">Password</label>
      <input id="auth-client-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} />
      <button className="btn primary auth-submit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to client portal'}</button>
    </form>
    <a className="auth-text-link" href="/reset">Forgot your password?</a>
  </AuthFrame>;
}

export function ChangePasswordPage({ onComplete }: { onComplete: (me: AuthMe) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (newPassword !== confirmPassword) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      await changeClientPassword(currentPassword, newPassword);
      const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Your password changed, but the session could not be refreshed. Sign in again.');
      onComplete(await response.json() as AuthMe);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The password could not be changed.'); }
    finally { setBusy(false); }
  };

  return <AuthFrame><div className="auth-heading"><p className="auth-eyebrow">ACCOUNT SECURITY</p><h1>Change your password</h1><p>Set a new password before opening the client workspace.</p></div>
    <form className="auth-form" onSubmit={submit}>
      <ErrorMessage>{error}</ErrorMessage>
      <label htmlFor="auth-current-password">Temporary password</label><input id="auth-current-password" type="password" autoComplete="current-password" required maxLength={256} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
      <label htmlFor="auth-new-password">New password</label><input id="auth-new-password" type="password" autoComplete="new-password" minLength={12} required maxLength={256} value={newPassword} onChange={event => setNewPassword(event.target.value)} />
      <label htmlFor="auth-confirm-password">Confirm new password</label><input id="auth-confirm-password" type="password" autoComplete="new-password" minLength={12} required maxLength={256} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
      <p className="auth-help">Use at least 12 characters. Your new password must not contain your email name or appear in known breach lists.</p>
      <button className="btn primary auth-submit" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
    </form>
  </AuthFrame>;
}

export function ResetRequestPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await requestPasswordReset(email); setSubmitted(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The request could not be submitted. Retry.'); }
    finally { setBusy(false); }
  };
  return <AuthFrame><div className="auth-heading"><p className="auth-eyebrow">CLIENT PORTAL</p><h1>Reset your password</h1><p>Enter your account email and we’ll send a reset link if it is eligible.</p></div>
    {submitted ? <p className="auth-notice" role="status">If an active portal account matches that address, reset instructions are on their way.</p> : <form className="auth-form" onSubmit={submit}>
      <ErrorMessage>{error}</ErrorMessage><label htmlFor="auth-reset-email">Email address</label><input id="auth-reset-email" type="email" autoComplete="email" inputMode="email" required maxLength={320} value={email} onChange={event => setEmail(event.target.value)} />
      <button className="btn primary auth-submit" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Send reset link'}</button>
    </form>}
    <a className="auth-text-link" href="/">Return to sign in</a>
  </AuthFrame>;
}

export function ResetConfirmPage({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (newPassword !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try { await confirmPasswordReset(token, newPassword); setComplete(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The reset link may have expired. Request a new one.'); }
    finally { setBusy(false); }
  };
  return <AuthFrame><div className="auth-heading"><p className="auth-eyebrow">CLIENT PORTAL</p><h1>Choose a new password</h1><p>Reset links are single-use and expire automatically.</p></div>
    {complete ? <><p className="auth-notice" role="status">Your password has been reset. You can now sign in.</p><a className="btn primary auth-submit" href="/">Return to sign in</a></> : <form className="auth-form" onSubmit={submit}>
      <ErrorMessage>{error}</ErrorMessage><label htmlFor="auth-reset-new-password">New password</label><input id="auth-reset-new-password" type="password" autoComplete="new-password" minLength={12} required maxLength={256} value={newPassword} onChange={event => setNewPassword(event.target.value)} />
      <label htmlFor="auth-reset-confirm-password">Confirm new password</label><input id="auth-reset-confirm-password" type="password" autoComplete="new-password" minLength={12} required maxLength={256} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
      <p className="auth-help">Use at least 12 characters. Your password must not contain your email name or appear in known breach lists.</p>
      <button className="btn primary auth-submit" type="submit" disabled={busy || !token}>{busy ? 'Resetting…' : 'Reset password'}</button>
    </form>}
  </AuthFrame>;
}

export function ProfileSelectionPage({ profiles, onSelect }: { profiles: AuthProfile[]; onSelect: (profileId: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choose = async (profile: AuthProfile) => {
    setBusy(true); setError('');
    try { await onSelect(profile.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'That assigned profile could not be selected.'); }
    finally { setBusy(false); }
  };
  return <AuthFrame><div className="auth-heading"><p className="auth-eyebrow">ASSIGNED ACCESS</p><h1>Choose your profile</h1><p>Select one of the profiles assigned to your account. This choice is stored in your secure session.</p></div>
    <ErrorMessage>{error}</ErrorMessage><div className="auth-profile-options">{profiles.map((profile: AuthProfile) => <button className="auth-profile-option" type="button" key={profile.id} disabled={busy} onClick={() => void choose(profile)}>
      <strong>{profile.displayName}</strong><span>{profile.persona}{profile.staffGrade ? ` · ${profile.staffGrade}` : ''}</span>
    </button>)}</div>
  </AuthFrame>;
}

export function ProfileSwitcher({ me, onSwitch }: { me: AuthMe; onSwitch: (profileId: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (me.profiles.length < 2) return null;
  const active = me.profiles.find(profile => profile.id === me.activeProfileId);
  return <div className="auth-profile-switcher">
    <label htmlFor="auth-profile-switch">Profile</label>
    <select id="auth-profile-switch" value={active?.id ?? ''} disabled={busy} onChange={async event => {
      const id = event.currentTarget.value;
      if (!id || !me.profiles.some(profile => profile.id === id)) return;
      setBusy(true); setError('');
      try { await onSwitch(id); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Profile could not be switched.'); }
      finally { setBusy(false); }
    }}>
      {me.profiles.map((profile: AuthProfile) => <option key={profile.id} value={profile.id}>{profile.displayName} · {profile.persona}</option>)}
    </select>
    {error && <span className="auth-switch-error" role="alert">{error}</span>}
  </div>;
}
