import React, { useCallback, useEffect, useState } from 'react';
import { BusinessWorkspaceConsole } from './components/business/BusinessWorkspace';
import { ChangePasswordPage, ProfileSelectionPage, ResetConfirmPage, ResetRequestPage, SignInPage } from './components/auth/AuthPages';
import type { AuthMe } from './shared/api/auth';
import { chooseActiveProfile, loadAuthMe, signOut } from './services/auth';
import { clearBusinessWorkspacePreference } from './services/businessWorkspace';

type AuthState = 'loading' | 'ready' | 'unavailable';

export const App: React.FC = () => {
  const [auth, setAuth] = useState<AuthMe | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState('');
  const resetRoute = window.location.pathname.replace(/\/+$/, '') === '/reset';
  const resetToken = resetRoute ? new URLSearchParams(window.location.search).get('token') ?? '' : '';

  const refreshSession = useCallback(async () => {
    setAuthState('loading'); setError('');
    try {
      const me = await loadAuthMe();
      setAuth(me); setAuthState('ready'); setSessionExpired(false);
      if (!me) clearBusinessWorkspacePreference();
    } catch (reason) {
      setAuth(null); setAuthState('unavailable');
      setError(reason instanceof Error ? reason.message : 'Authentication service is unavailable.');
    }
  }, []);

  useEffect(() => { void refreshSession(); }, [refreshSession]);
  useEffect(() => {
    const expired = () => { setAuth(null); setSessionExpired(true); clearBusinessWorkspacePreference(); };
    window.addEventListener('auditsphere:session-expired', expired);
    return () => window.removeEventListener('auditsphere:session-expired', expired);
  }, []);

  const selectProfile = useCallback(async (profileId: string) => {
    const next = await chooseActiveProfile(profileId);
    clearBusinessWorkspacePreference();
    setAuth(next); setSessionExpired(false);
  }, []);

  const doSignOut = useCallback(async () => {
    try { await signOut(); } finally {
      clearBusinessWorkspacePreference(); setAuth(null); setSessionExpired(false); setAuthState('ready');
      if (window.location.pathname !== '/') window.history.replaceState(null, '', '/');
    }
  }, []);

  if (authState === 'loading') return <main className="auth-page"><p role="status">Checking your sign-in…</p></main>;
  if (authState === 'unavailable') return <main className="auth-page"><section className="auth-card" aria-labelledby="auth-unavailable-heading">
    <h1 id="auth-unavailable-heading">Sign-in is temporarily unavailable</h1><p className="auth-error" role="alert">{error}</p>
    <button className="btn primary auth-submit" type="button" onClick={() => void refreshSession()}>Retry</button>
  </section></main>;
  if (auth?.passwordMustChange) return <ChangePasswordPage onComplete={setAuth} />;
  if (resetRoute) return resetToken ? <ResetConfirmPage token={resetToken} /> : <ResetRequestPage />;
  if (!auth) return <SignInPage sessionExpired={sessionExpired} onSignedIn={me => { setAuth(me); setSessionExpired(false); }} />;
  if (auth.profiles.length > 1 && !auth.activeProfileId) return <ProfileSelectionPage profiles={auth.profiles} onSelect={selectProfile} />;
  if (!auth.profiles.some(profile => profile.id === auth.activeProfileId)) return <main className="auth-page"><section className="auth-card" aria-labelledby="auth-no-access-heading">
    <h1 id="auth-no-access-heading">No active workspace profile</h1><p className="auth-help">Your account has no active profile. Ask a firm administrator to restore your access.</p>
    <button className="btn auth-submit" type="button" onClick={() => void doSignOut()}>Sign out</button>
  </section></main>;

  return <BusinessWorkspaceConsole key={`${auth.user.id}:${auth.activeProfileId}`} auth={auth} onProfileSwitch={selectProfile} onSignOut={doSignOut} />;
};

export default App;
