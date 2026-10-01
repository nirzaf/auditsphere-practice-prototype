// Module 18: Microsoft 365 setup simulation — VP-017 (wizard) + VP-022 (failure/recovery)
// Simulated Entra identity, SharePoint (canonical), basic Exchange mail (optional),
// bounded OneDrive import (optional, disabled by default). No Purview anywhere.
// No OAuth, credentials, tokens, external fetch/XHR or tenant provisioning.
// liveConnected is always false. SharePoint/mail/OneDrive readiness is independent:
// a failed optional mail test never blocks SharePoint or local work.

import React, { useState, useEffect, useCallback } from 'react';
import { RoleKey, RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

interface M365SetupViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null) => void;
  onBeforeContextChange: (change: () => void) => void;
}

type CardKey = 'identity' | 'sharepoint' | 'mail' | 'onedrive';
type SimOutcome = 'success' | 'access-denied' | 'missing-resource' | 'expired-session' | 'throttled' | 'unavailable';
type SetupStep = -1 | 0 | 1 | 2 | 3;
const SETUP_STEPS = ['Tenant & people', 'SharePoint library', 'Optional services', 'Review & save'];

const OUTCOMES: Array<{ key: SimOutcome; label: string; detail: string }> = [
  { key: 'success', label: 'Success (simulated)', detail: 'Local scenario fixture reports the selected synthetic resource as reachable.' },
  { key: 'access-denied', label: 'Access denied (simulated)', detail: 'The selected synthetic identity lacks permission for the chosen resource. Pick a permitted person or resource, then retry.' },
  { key: 'missing-resource', label: 'Missing resource (simulated)', detail: 'The site, library, folder or sender does not exist in the synthetic tenant. Correct the selection, then retry.' },
  { key: 'expired-session', label: 'Expired session (simulated)', detail: 'The demonstration session expired. Re-run the setup simulation to refresh local state.' },
  { key: 'throttled', label: 'Throttled (simulated)', detail: 'The local fixture reports throttling. Wait, then retry — no background polling occurs.' },
  { key: 'unavailable', label: 'Service unavailable (simulated)', detail: 'The synthetic provider is unavailable. Local business modules keep working with fixture data.' }
];
const ASSIGNABLE_ROLES: RoleKey[] = ['relationship', 'onboarding', 'compliance', 'partner', 'manager', 'preparer', 'reviewer', 'eqr', 'client_admin', 'client_finance', 'client', 'billing', 'records', 'admin'];

export const M365SetupView: React.FC<M365SetupViewProps> = ({ onNavigate, onRegisterUnsavedForm, onBeforeContextChange }) => {
  const state = prototypeStore.getSnapshot();
  const config = state.m365Config;

  const [tenantId, setTenantId] = useState(config.tenantId);
  const [tenantName, setTenantName] = useState(config.tenantName);
  const [siteUrl, setSiteUrl] = useState(config.sharePointSite);
  const [library, setLibrary] = useState(config.sharePointLibrary);
  const [folderRoot, setFolderRoot] = useState(config.folderRoot);
  const [mailSender, setMailSender] = useState(config.mailSenderAccount);
  const [oneDriveEnabled, setOneDriveEnabled] = useState(config.oneDriveEnabled);
  const [permittedUsers, setPermittedUsers] = useState(config.permittedUsers || []);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<SetupStep>(-1);
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement);
  const workspaceClient = state.clients.find(c => c.id === selectedEng?.client);

  const markDirty = () => setDirty(true);

  const saveConfiguration = useCallback(() => {
    try {
      prototypeStore.updateM365Config({
        ...prototypeStore.getSnapshot().m365Config,
        tenantId,
        tenantName,
        permittedUsers,
        sharePointSite: siteUrl,
        sharePointLibrary: library,
        folderRoot,
        mailSenderAccount: mailSender,
        oneDriveEnabled
      });
      setDirty(false);
      setNotice('Simulated configuration saved.');
      return true;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Configuration could not be saved.');
      return false;
    }
  }, [tenantId, tenantName, permittedUsers, siteUrl, library, folderRoot, mailSender, oneDriveEnabled]);
  const discardConfiguration = useCallback(() => {
    const saved = prototypeStore.getSnapshot().m365Config;
    setTenantId(saved.tenantId); setTenantName(saved.tenantName); setPermittedUsers(saved.permittedUsers || []);
    setSiteUrl(saved.sharePointSite); setLibrary(saved.sharePointLibrary); setFolderRoot(saved.folderRoot);
    setMailSender(saved.mailSenderAccount); setOneDriveEnabled(saved.oneDriveEnabled); setDirty(false);
    setNotice('Unsaved configuration changes were discarded.');
  }, []);
  useEffect(() => {
    const guard: UnsavedFormGuard = { label: 'Microsoft 365 setup', isDirty: () => dirty, save: saveConfiguration, discard: discardConfiguration };
    onRegisterUnsavedForm(guard);
    return () => onRegisterUnsavedForm(null);
  }, [dirty, saveConfiguration, discardConfiguration, onRegisterUnsavedForm]);
  const handleSave = (e: React.FormEvent) => { e.preventDefault(); saveConfiguration(); };

  const runTest = (card: CardKey, outcome: SimOutcome) => {
    if (dirty) {
      setNotice('Save the selected configuration before running its local verification.');
      return;
    }
    try {
      prototypeStore.simulateM365Verification(card, outcome);
      setNotice(`${card} result saved for configuration revision ${prototypeStore.getSnapshot().m365Config.configRevision}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Verification could not be recorded.');
    }
  };

  const handleDisconnect = () => {
    onBeforeContextChange(() => {
      prototypeStore.simulateM365Disconnect();
      onNavigate('overview');
    });
  };

  const cardStatus = (card: CardKey): string => {
    const r = config.verificationResults?.[card];
    if (!r) return 'Not tested';
    return `${r.outcome}${r.configRevision !== (config.configRevision || 1) ? ' (stale — configuration changed)' : ''} · ${new Date(r.testedAt).toLocaleString('en-GB')}`;
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Microsoft 365 Setup (Simulated)</h1>
          <p>Guided Microsoft-only simulation: Entra identity concept, SharePoint canonical library, basic outgoing mail, optional bounded OneDrive import. No live connection.</p>
        </div>
        <span className="tag blue">liveConnected: false</span>
      </div>

      {notice && <div role="status" className="panel panel-pad">{notice}</div>}

      <div className="panel panel-pad" style={{ background: '#f8fafc', borderLeft: '4px solid var(--teal)' }}>
        <b>Simulation boundary</b>
        <p className="sub mt4">
          This wizard stores synthetic IDs and resource selections only. It never opens a Microsoft sign-in,
          asks for credentials or secrets, provisions a tenant resource, or performs an external fetch/XHR.
          Configuration may be skipped: disconnected simulation never locks unrelated local modules.
          SharePoint, mail and OneDrive readiness are independent. Microsoft Purview is not part of this product.
        </p>
      </div>

      {wizardStep === -1 ? <div className="panel panel-pad stack">
        <h2>Start a local setup demonstration</h2>
        <p className="sub">Review synthetic tenant identity, selected SharePoint storage, optional services and the permission summary. Starting this flow does not contact Microsoft or change saved configuration.</p>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn primary sm" onClick={() => setWizardStep(0)}>Start setup</button>
          <button type="button" className="btn sm ghost" onClick={() => onBeforeContextChange(() => onNavigate('overview'))}>Skip setup</button>
        </div>
      </div> : <>
      <nav aria-label="Setup progress" className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {SETUP_STEPS.map((step, index) => <button key={step} type="button" className={`btn sm ${wizardStep === index ? 'primary' : 'ghost'}`} aria-current={wizardStep === index ? 'step' : undefined} onClick={() => setWizardStep(index as SetupStep)}>{index + 1}. {step}</button>)}
      </nav>

      <form onSubmit={handleSave} className="panel panel-pad stack" style={{ gap: 16 }}>
        {wizardStep === 0 && <>
        <h3>1 · Synthetic tenant &amp; people</h3>
        <div className="grid2">
          <div>
            <label className="caption">Synthetic tenant ID (fixture)</label>
            <input type="text" className="input mono" value={tenantId} onChange={e => { setTenantId(e.target.value); markDirty(); }} required />
          </div>
          <div>
            <label className="caption">Synthetic tenant domain (fixture)</label>
            <input type="text" className="input mono" value={tenantName} onChange={e => { setTenantName(e.target.value); markDirty(); }} required />
          </div>
        </div>
        <fieldset className="borderbox stack" style={{ gap: 8, padding: 12 }}>
          <legend className="caption">Permitted people and initial AuditSphere role mappings</legend>
          <p className="caption">These are local identity mappings only. They do not create invitations or role grants; assign scoped access separately in Administration.</p>
          {state.users.filter(user => user.status === 'Active').map(user => {
            const mapping = permittedUsers.find(item => item.userId === user.id);
            return <div className="between" key={user.id}>
              <label className="row" style={{ gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={Boolean(mapping)} onChange={e => {
                  setPermittedUsers(current => e.target.checked ? [...current, { userId: user.id, role: user.role }] : current.filter(item => item.userId !== user.id));
                  markDirty();
                }} />
                <span>{user.name} <span className="caption">({user.email})</span></span>
              </label>
              {mapping && <select className="input" aria-label={`AuditSphere role for ${user.name}`} value={mapping.role} onChange={e => {
                setPermittedUsers(current => current.map(item => item.userId === user.id ? { ...item, role: e.target.value as RoleKey } : item));
                markDirty();
              }}>{ASSIGNABLE_ROLES.map(role => <option key={role} value={role}>{role}</option>)}</select>}
            </div>;
          })}
        </fieldset>
        </>}

        {wizardStep === 1 && <>
        <h3>2 · SharePoint canonical library</h3>
        <div>
          <label className="caption">SharePoint site (synthetic)</label>
          <input type="text" className="input mono" value={siteUrl} onChange={e => { setSiteUrl(e.target.value); markDirty(); }} required />
        </div>
        <div className="grid2">
          <div>
            <label className="caption">Library</label>
            <input type="text" className="input" value={library} onChange={e => { setLibrary(e.target.value); markDirty(); }} required />
          </div>
          <div>
            <label className="caption">Folder root</label>
            <input type="text" className="input mono" value={folderRoot} onChange={e => { setFolderRoot(e.target.value); markDirty(); }} required />
          </div>
        </div>
        </>}

        {wizardStep === 2 && <>
        <h3>3 · Optional mail sender</h3>
        <div>
          <label className="caption">Exchange Online outbound sender (synthetic mailbox label)</label>
          <input type="email" className="input" value={mailSender} onChange={e => { setMailSender(e.target.value); markDirty(); }} />
          <span className="caption">Leave blank to disable simulated outbound email.</span>
        </div>

        <h3>4 · Optional bounded OneDrive access (disabled by default)</h3>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={oneDriveEnabled} onChange={e => { setOneDriveEnabled(e.target.checked); markDirty(); }} />
          <span>Enable bounded OneDrive file selection/import simulation (never a second canonical archive)</span>
        </label>
        </>}

        {wizardStep === 3 && <>
          <h3>4 · Review configuration</h3>
          <dl className="grid2">
            <div><dt className="caption">Synthetic tenant</dt><dd>{tenantName || 'Not set'} <span className="mono">({tenantId || 'No fixture ID'})</span></dd></div>
            <div><dt className="caption">Permitted people</dt><dd>{permittedUsers.length} local role mapping(s); no access grants created</dd></div>
            <div><dt className="caption">SharePoint canonical location</dt><dd>{siteUrl || 'Not set'} · {library || 'No library'} · {folderRoot || 'No folder root'}</dd></div>
            <div><dt className="caption">Optional services</dt><dd>Mail {mailSender.trim() ? `enabled (${mailSender})` : 'disabled'} · OneDrive {oneDriveEnabled ? 'enabled' : 'disabled'}</dd></div>
          </dl>
          <p className="caption">Saving records only this synthetic configuration. It does not connect to Microsoft or create authorization grants.</p>
        </>}

        <div className="row mt12" style={{ gap: 10 }}>
          <button type="submit" className="btn primary sm">Save simulated configuration</button>
          {dirty && <span className="tag amber">Unsaved changes — prior verification is stale until re-tested</span>}
          <button type="button" className="btn sm ghost" onClick={() => setWizardStep((wizardStep - 1) as SetupStep)}>Back</button>
          <button type="button" className="btn sm ghost" disabled={wizardStep === 3} onClick={() => setWizardStep((wizardStep + 1) as SetupStep)}>Continue</button>
          <button type="button" className="btn sm ghost" onClick={() => { discardConfiguration(); setWizardStep(-1); }}>Cancel setup</button>
          <button type="button" className="btn sm ghost" onClick={handleDisconnect}>Simulate disconnect</button>
        </div>
      </form>

      {(['identity', 'sharepoint', 'mail', 'onedrive'] as CardKey[]).map(card => (
        <div key={card} className="panel panel-pad">
          <div className="between">
            <h3 style={{ textTransform: 'capitalize' }}>{card === 'onedrive' ? 'OneDrive (optional)' : card} — simulated test</h3>
            <span className="tag gray">{cardStatus(card)}</span>
          </div>
          {card === 'onedrive' && !oneDriveEnabled && (
            <p className="sub mt4">OneDrive simulation is disabled. Enabling it never changes the canonical archive away from SharePoint.</p>
          )}
          <div className="grid3 mt12">
            {OUTCOMES.map(o => (
              <button
                key={o.key}
                type="button"
                className="btn sm ghost"
                disabled={dirty || (card === 'onedrive' && !oneDriveEnabled) || (card === 'mail' && !mailSender.trim())}
                onClick={() => runTest(card, o.key)}
                title={o.detail}
              >
                Simulate: {o.label}
              </button>
            ))}
          </div>
          {card === 'sharepoint' && (
            <div className="mt12">
              <button
                type="button"
                className="btn sm primary"
                disabled={dirty || !workspaceClient || config.verificationResults?.sharepoint?.outcome !== 'success' || config.verificationResults.sharepoint.configRevision !== (config.configRevision || 1)}
                onClick={() => {
                  if (!workspaceClient) return;
                  try {
                    if (!selectedEng) return;
                    prototypeStore.prepareClientWorkspace(workspaceClient.id, selectedEng.year, selectedEng.id);
                    setNotice(`Canonical local workspace prepared for ${workspaceClient.name}.`);
                  } catch (err) {
                    setNotice(err instanceof Error ? err.message : 'Workspace preparation failed.');
                  }
                }}
              >Prepare selected client workspace</button>
              <span className="caption" style={{ marginLeft: 8 }}>{workspaceClient?.name || 'No scoped client selected'}</span>
            </div>
          )}
          {config.verificationResults?.[card] && config.verificationResults[card]!.outcome !== 'success' && (
            <div className="borderbox mt8" style={{ background: '#fef2f2', padding: 12 }}>
              <b>Recovery (local, no background polling): </b>
              <span>{OUTCOMES.find(o => o.key === config.verificationResults?.[card]?.outcome)?.detail} </span>
              <button type="button" className="btn sm" style={{ marginLeft: 8 }} disabled={dirty || (card === 'mail' && !mailSender.trim())} onClick={() => runTest(card, 'success')}>
                Retry with success fixture
              </button>
            </div>
          )}
        </div>
      ))}

      <div className="panel panel-pad">
        <b>What disconnect does</b>
        <p className="sub mt4">
          Simulating disconnect preserves metadata and history and marks provider-dependent actions as
          simulated-unavailable. It never deletes clients, engagements or archive records. No success or
          error banner here describes simulated state as production readiness.
        </p>
      </div>
      </>}
    </div>
  );
};
