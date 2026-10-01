// AuditSphere Layout Shell
// Sidebar, Topbar, Scenario Switcher, Search Modal, and Notifications

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RouteKey, RoleKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { canOpenRoute, canReadSearchRecord, visibleClientIds, visibleEngagementIds, isClientRole, scopedInvoices } from '../../services/guards';
import { canonicalRoute } from '../../services/legacyRoutes';
import { SCENARIO_DEFINITIONS, ScenarioName } from '../../store/scenarios';
import { getPackageContextDisplay } from '../../services/calculations';
import { Icon } from '../common/Icons';
import { CURRENT_ROUTE_CATALOG, routeCode } from '../../services/routeCatalog';
import { CloudDemoControls, CloudDemoLabel } from '../common/CloudDemoControls';

interface ShellProps {
  currentRoute: RouteKey;
  onRouteChange: (route: RouteKey, targetId?: string) => void;
  onSelectClient: (clientId: string) => void;
  onBeforeContextChange: (change: () => void) => void;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({ currentRoute, onRouteChange, onSelectClient, onBeforeContextChange, children }) => {
  const state = prototypeStore.getSnapshot();
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [presenterMode, setPresenterMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRecordType, setSearchRecordType] = useState('all');
  const [searchContext, setSearchContext] = useState('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuTrigger = useRef<HTMLButtonElement>(null);
  const mobileNavigation = useRef<HTMLElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchOpener = useRef<HTMLElement | null>(null);
  const openSearch = () => {
    searchOpener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : searchTrigger.current;
    setSearchRecordType('all');
    setSearchContext('all');
    setShowSearchModal(true);
  };
  const closeSearch = () => {
    setShowSearchModal(false);
    window.requestAnimationFrame(() => searchOpener.current?.focus());
  };
  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    if (window.matchMedia?.('(max-width: 959px)').matches) mobileMenuTrigger.current?.focus();
  };
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const drawer = mobileNavigation.current;
    const focusable = () => Array.from(drawer?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    window.requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (!window.matchMedia?.('(max-width: 959px)').matches) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileMenu();
      } else if (event.key === 'Tab') {
        const targets = focusable();
        if (!targets.length) return;
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && (document.activeElement === first || !drawer?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !drawer?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);
  useLayoutEffect(() => {
    if (!showSearchModal) return;
    searchInput.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSearch();
      } else if (event.key === 'Tab') {
        const modal = document.querySelector<HTMLElement>('.global-search-dialog');
        const targets = Array.from(modal?.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
        if (!targets.length) return;
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && (document.activeElement === first || !modal?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !modal?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showSearchModal]);
  // "/" opens Global Search unless the user is typing in a field or a dialog is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (document.querySelector('.modal-backdrop, .modal-overlay, .modal')) return;
      event.preventDefault();
      if (presenterMode) openSearch();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [presenterMode]);
  // Desktop sidebar collapse is a presenter preference, persisted separately from
  // the validated business state.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {    try { return localStorage.getItem('ste-auditsphere-sidebar-collapsed') === '1'; } catch { return false; }
  });
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed(current => {
      const next = !current;
      try { localStorage.setItem('ste-auditsphere-sidebar-collapsed', next ? '1' : '0'); } catch { /* UI preference only */ }
      return next;
    });
  };
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; type?: string }>>([]);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const recoveryBannerVisible = Boolean(prototypeStore.getLoadError() || prototypeStore.isSessionOnlyMode());
  useEffect(() => {
    // A reload restores the previous scroll position, which can leave the
    // top-anchored integrity banner above the fold; surface it immediately.
    if (recoveryBannerVisible) window.scrollTo(0, 0);
  }, [recoveryBannerVisible]);
  const importInput = useRef<HTMLInputElement>(null);
  const activeIdentity = state.users.find(user => user.id === state.currentUserId)?.status === 'Active';

  const allowedClientIds = visibleClientIds(state);
  const allowedEngagementIds = visibleEngagementIds(state);
  const scopedClients = state.clients.filter(c => allowedClientIds === 'ALL' || allowedClientIds.includes(c.id));
  const scopedEngagements = state.engagements.filter(e => allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(e.id));
  const selectedEng = scopedEngagements.find(e => e.id === state.selectedEngagement);
  const selectedClient = state.clients.find(c => c.id === selectedEng?.client);
  const currentPersona = state.users.find(u => u.id === state.currentUserId) || state.users[0];

  const triggerToast = (text: string, type = '') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const clientMode = isClientRole(state.currentRole);

  const staffNavGroups: Array<[string, Array<{ key: RouteKey; label: string; icon: string; count?: number }>]> = [
    [
      "MODULE 1: COMMERCIAL & CRM",
      [
        { key: "overview", label: "Lifecycle Overview", icon: "grid" },
        { key: "acquisition", label: "Lead Ingestion", icon: "target" },
        { key: "clients", label: "Client Profiles", icon: "users" },
        { key: "proposals", label: "Quotes & Proposals", icon: "receipt" },
        { key: "engagements", label: "Engagement Letter (ISA 210)", icon: "brief" },
        { key: "billing", label: "50% Advance & Receipts", icon: "receipt" }
      ]
    ],
    [
      "MODULE 2: GOVERNANCE & PLANNING",
      [
        { key: "onboarding", label: "Dual-Key Gate & Acceptance", icon: "shield" },

        { key: "documents", label: "Client PBC Portal Handoff", icon: "folder" },
        { key: "trial-balance", label: "Trial Balance (TB)", icon: "calculator" },
        { key: "audit-planning", label: "3-Tier Materiality (ISA 320)", icon: "target" },
        { key: "scheduling", label: "Resource Scheduling & Milestones", icon: "clock" }
      ]
    ],
    [
      "MODULE 3: TECHNICAL FIELDWORK",
      [
        { key: "financial-statements", label: "Split Dashboard (P/L & B/S)", icon: "file" },
        { key: "audit-fieldwork", label: "Workprograms & Evidence", icon: "checkboard" },
        { key: "sampling", label: "Sampling & Physical Index (X-1)", icon: "checkboard" },
        { key: "confirmations", label: "External Confirmations (ISA 505)", icon: "message" },
        { key: "findings", label: "Findings & Differences", icon: "file" },
        { key: "reviews", label: "Three-Tier Review & SRM", icon: "message" }
      ]
    ],
    [
      "MODULE 4: REPORTING & ARCHIVE",
      [
        { key: "delivery", label: "Audit Opinion & 5-Part Bundle", icon: "archive" },
        { key: "records", label: "60-Day Compliance Lock (ISA 230)", icon: "archive" }
      ]
    ],
    [
      "MODULE 5: PRACTICE MANAGEMENT",
      [
        { key: "my-time", label: "Daily Engagement / FSLI Time", icon: "clock" },
        { key: "reports", label: "Real-Time Profitability & Rates", icon: "calculator" },
        { key: "practice-ledger", label: "Firm Ledger, Monthly TB & AR Aging", icon: "calculator" },

      ]
    ]
  ];

  staffNavGroups.push(['REFERENCE / SPECIFICATION', [
    { key: 'client-requirements', label: 'Requirements Presentation', icon: 'book' },
    { key: 'requirements', label: 'Functional Requirements', icon: 'book' }
  ]]);
  const clientNavGroups: Array<[string, Array<{ key: RouteKey; label: string; icon: string; count?: number }>]> = [
    [
      'CLIENT SECURE PORTAL (PBC)',
      [
        { key: 'portal', label: 'Client PBC Portal & Evidence', icon: 'globe' },
        { key: 'requirements', label: 'Functional Requirements', icon: 'book' }
      ]
    ]
  ];

  const navGroups = (clientMode ? clientNavGroups : staffNavGroups)
    .map(([name, items]) => [name, items.filter(item => canOpenRoute(state.currentRole, item.key, activeIdentity))] as [string, typeof items])
    .filter(([, items]) => items.length > 0);

  const handleRoleChange = (userId: string) => {
    onBeforeContextChange(() => {
      prototypeStore.setPersona(userId);
      const snap = prototypeStore.getSnapshot();
      if (isClientRole(snap.currentRole)) onRouteChange('portal');
      triggerToast(`Switched simulated identity to ${snap.currentPerson} (${snap.currentRole})`);
    });
  };

  const handleEngagementChange = (engId: string) => {
    onBeforeContextChange(() => {
      prototypeStore.setSelectedEngagement(engId);
      triggerToast(`Switched active engagement to ${engId}`);
    });
  };

  const handleSelectScenario = (scenId: ScenarioName) => {
    onBeforeContextChange(() => {
      prototypeStore.loadScenario(scenId);
      setShowScenarioModal(false);
      triggerToast(`Loaded scenario preset: ${scenId}`, 'success');
    });
  };

  const requestDemoReset = () => {
    onBeforeContextChange(() => setShowResetConfirmation(true));
  };
  const confirmDemoReset = () => {
    prototypeStore.resetState();
    setShowResetConfirmation(false);
    setShowScenarioModal(false);
    triggerToast('Demo state reset to initial baseline. Previous data remains available as a recovery backup.');
  };

  const downloadJSON = (filename: string, json: string) => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleImportState = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { triggerToast('State file exceeds the 10 MB import limit.', 'error'); return; }
    try {
      prototypeStore.importStateJSON(await file.text());
      triggerToast(prototypeStore.isSessionOnlyMode() ? 'Validated state imported for this session; browser storage is unavailable.' : 'Validated state imported and saved locally.', 'success');
    } catch (error) {
      triggerToast(error instanceof Error ? error.message : 'State import failed; the existing payload was preserved.', 'error');
    }
  };

  const importStateButton = <button className="btn sm" onClick={() => importInput.current?.click()}>Import validated JSON</button>;

  // Global search filtering — VP-061: deterministic local metadata search, scoped by
  // grants. Unauthorized records contribute no title, snippet, count or ordering.
  // Historical requirements text is NOT indexed here (separate Requirements view).
  const searchResults = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matches = (...values: Array<string | undefined>) => values.some(value => value?.toLowerCase().includes(q));
    const clientRole = isClientRole(state.currentRole);
    const out: Array<{ title: string; sub: string; route: RouteKey; objectId: string; clientId?: string; engagementId?: string; requiresEngagement?: boolean; clientWide?: boolean }> = [];
    const add = (item: typeof out[number]) => {
      if (canReadSearchRecord(state, item)) out.push(item);
    };
    state.clients.filter(c => matches(c.name, c.id))
      .forEach(c => add({ title: c.name, sub: `Client · ${c.id} · ${c.industry}${c.status === 'Archived' ? ' · Archived' : ''}`, route: 'client-detail', objectId: c.id, clientId: c.id }));
    state.contacts.filter(c => matches(c.name, c.id))
      .forEach(c => add({ title: c.name, sub: `Contact · ${c.clientId}`, route: 'client-detail', objectId: c.id, clientId: c.clientId }));
    if (!clientRole) {
      state.engagements.filter(e => matches(e.service, e.id))
        .forEach(e => add({ title: `${e.id} · ${e.service}`, sub: `Engagement · FY ${e.year}`, route: 'engagements', objectId: e.id, clientId: e.client, engagementId: e.id, requiresEngagement: true }));
      state.jobs.filter(j => matches(j.title, j.id))
        .forEach(j => add({ title: j.title, sub: `Job · ${j.id}`, route: 'scheduling', objectId: j.id, clientId: j.clientId, engagementId: j.engagementId, requiresEngagement: true }));
    }
    if (!clientRole) {
      state.documents.filter(d => matches(d.name, d.id))
        .forEach(d => add({ title: d.name, sub: `Document · ${d.brokenLink ? 'Unavailable · ' : ''}v${d.version}`, route: 'documents', objectId: d.id, clientId: d.clientId, engagementId: d.engagementId, requiresEngagement: true }));
      state.jobTasks.filter(t => {
        const job = state.jobs.find(j => j.id === t.jobId);
        return job && matches(t.title, t.id);
      }).forEach(t => { const j = state.jobs.find(x => x.id === t.jobId)!; add({ title: t.title, sub: `Task · ${t.id}`, route: 'scheduling', objectId: t.id, clientId: j.clientId, engagementId: j.engagementId, requiresEngagement: true }); });
      state.invoices.filter(i => matches(i.invoiceNumber, i.id))
        .forEach(i => add({ title: i.invoiceNumber, sub: `Invoice · ${i.amount} ${i.currency}`, route: 'billing', objectId: i.id, clientId: i.clientId, engagementId: i.engagementId || i.eng, requiresEngagement: true }));
      state.communications.filter(c => matches(c.summary, c.participants, c.id))
        .forEach(c => add({ title: c.summary, sub: `Communication · ${c.channel}`, route: 'documents', objectId: c.id, clientId: c.clientId, engagementId: c.engagementId, requiresEngagement: c.engagementId ? true : c.scopeKind !== 'Client', clientWide: !c.engagementId && c.scopeKind === 'Client' }));
      state.findings.filter(f => {
        return matches(f.title, f.id);
      }).forEach(f => add({ title: f.title, sub: `Finding · ${f.id}`, route: 'findings', objectId: f.id, engagementId: f.engagementId, requiresEngagement: true }));
      state.engagements.forEach(e => {
        e.workpapers.filter(w => matches(w.title, w.id))
          .forEach(w => add({ title: w.title, sub: `Workpaper · ${w.id}`, route: 'audit-fieldwork', objectId: w.id, clientId: e.client, engagementId: e.id, requiresEngagement: true }));
        e.pbc.filter(p => matches(p.title, p.id))
          .forEach(p => add({ title: p.title, sub: `PBC · ${p.id}`, route: 'client-detail', objectId: p.id, clientId: e.client, engagementId: e.id, requiresEngagement: true }));
      });
    } else {
      // Client projection: only explicitly shared documents/packages surface.
      state.documents.filter(d => d.visibility === 'Client shared' && matches(d.name, d.id))
        .forEach(d => add({ title: d.name, sub: `Shared document · ${d.brokenLink ? 'Unavailable · ' : ''}v${d.version}`, route: 'portal', objectId: d.id, clientId: d.clientId, engagementId: d.engagementId, requiresEngagement: true }));
    }
    return out;
  })();
  const searchTypes = [...new Set(searchResults.map(item => item.sub.split(' · ')[0]))].sort();
  const filteredSearchResults = searchResults.filter(item => {
    const kind = item.sub.split(' · ')[0];
    if (searchRecordType !== 'all' && kind !== searchRecordType) return false;
    if (searchContext.startsWith('client:') && item.clientId !== searchContext.slice(7)) return false;
    if (searchContext.startsWith('engagement:') && item.engagementId !== searchContext.slice(11)) return false;
    return true;
  }).slice(0, 30);

  if (prototypeStore.hasStorageConflict()) {
    return (
      <div id="app-root" className="panel panel-pad" role="alert" style={{ background: '#fef2f2', color: '#991b1b', margin: 12 }}>
        <b>Another tab saved newer demo data.</b> This workspace is hidden until the saved-state conflict is resolved.
        <div className="row mt8" style={{ gap: 8 }}>
          <button className="btn sm primary" onClick={() => {
            try { prototypeStore.resolveStorageConflict('reload'); window.location.reload(); }
            catch (e) { triggerToast(e instanceof Error ? e.message : 'Reload failed', 'error'); }
          }}>Reload newer state</button>
          <button className="btn sm ghost" onClick={() => {
            try { prototypeStore.resolveStorageConflict('keep-local'); }
            catch (e) { triggerToast(e instanceof Error ? e.message : 'Could not preserve the other tab state', 'error'); }
          }}>Keep this tab and replace newer state</button>
        </div>
        <div id="toasts" aria-live="polite">
          {toasts.map(toast => <div key={toast.id} className={`toast ${toast.type || ''}`}>{toast.text}</div>)}
        </div>
      </div>
    );
  }

  return (
    <div id="app-root" className={sidebarCollapsed ? 'sidebar-collapsed' : undefined}>
      <a className="skip-link" href="#main">Skip to main content</a>
      <input ref={importInput} type="file" accept="application/json,.json" aria-label="Import validated state JSON" onChange={handleImportState} style={{ display: 'none' }} />
      {recoveryBannerVisible && (
        <div role="status" className="panel panel-pad recovery-banner" style={{ background: '#fff7ed', color: '#9a3412' }}>
          {prototypeStore.getLoadError() || 'Browser storage is unavailable; changes last only for this session.'}
          <div className="row mt8" style={{ gap: 8 }}>
            {clientMode ? (
              <span className="caption">Please contact your accountant before continuing; this browser cannot save changes right now.</span>
            ) : <>
              <button className="btn sm" onClick={() => downloadJSON(`auditsphere-state-${state.asOfDate}.json`, prototypeStore.exportStateJSON())}>Export current state</button>
              {prototypeStore.getPreservedStateJSON() && <button className="btn sm" onClick={() => downloadJSON(`auditsphere-preserved-${state.asOfDate}.json`, prototypeStore.getPreservedStateJSON()!)}>Export preserved payload</button>}
              {importStateButton}
              <button className="btn sm ghost" onClick={requestDemoReset}>Reset to default</button>
              <span className="caption">A reset keeps the current payload as a recovery backup.</span>
            </>}
          </div>
        </div>
      )}
      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={closeMobileMenu}
        />
      )}

      {/* Main Sidebar */}
      <aside ref={mobileNavigation} id="primary-sidebar" aria-label="Primary navigation" className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brandmark">
            <Icon name="layers" />
          </div>
          <div className="brandname">
            STE <span>Audit Tool</span>
          </div>
        </div>

        <div className="workspaceselect">
          <span className="firmavatar">STE</span>
          <span>
            <b>STE Audit & Accounting</b>
            <div style={{ fontSize: '10.5px', color: 'var(--chrome-muted)', marginTop: '1px' }}>
              STE Audit Management Tool v2.1 · Doha, Qatar
            </div>
          </span>
        </div>

        {presenterMode && state.currentRole === 'superuser' && <div className="banner amber" role="status" aria-label="Superuser full prototype access">
          <b>SUPERUSER · FULL PROTOTYPE ACCESS</b>
          <div className="caption mt4">Synthetic testing identity · overrides are logged</div>
        </div>}

        <nav id="primary-navigation" className="side-scroll" aria-label="Main navigation">
          {navGroups.map(([groupName, items]) => (
            <React.Fragment key={groupName}>
              <div className="nav-label">{groupName}</div>
              {items.map(item => (
                <button
                  key={item.key}
                  className={`navitem ${currentRoute === item.key ? 'active' : ''}`}
                  aria-current={currentRoute === item.key ? 'page' : undefined}
                  title={item.label}
                  aria-label={sidebarCollapsed ? item.label : undefined}
                  onClick={() => {
                    onRouteChange(item.key);
                    closeMobileMenu();
                  }}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="count">{item.count}</span>
                  )}
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <div className="side-footer">
          <div className="side-demo">
            <strong>
              <span className="demo-dot" style={{ display: 'inline-block', marginRight: '6px' }} />
              Interactive Prototype
            </strong>
            <br />
            Synthetic records. Business services are simulated. Local or cloud demo storage.
          </div>
          <button
            className="navitem"
            aria-label={sidebarCollapsed ? 'Reset Demo State' : undefined}
            title="Reset Demo State"
            hidden={!presenterMode}
            onClick={requestDemoReset}
          >
            <Icon name="refresh" />
            <span>Reset Demo State</span>
          </button>
        </div>
      </aside>

      {/* Main Shell Content */}
      <div className="shell">
        <header className={presenterMode ? 'topbar presenter-topbar' : 'topbar'}>
          <div className="topbar-left">
            <button
              className="icon-btn sidebar-toggle"
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
              aria-controls="primary-sidebar"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Icon name="arrow" />
            </button>
            <button
              ref={mobileMenuTrigger}
              className="icon-btn mobile-menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileMenuOpen}
              aria-controls="primary-sidebar"
            >
              <Icon name="menu" />
            </button>
            <nav className="crumb" aria-label="Breadcrumb">
              <span className="crumb-section">{CURRENT_ROUTE_CATALOG[canonicalRoute(currentRoute)]?.section || 'Workspace'}</span>
              <span className="crumb-sep" aria-hidden="true">/</span>
              <span className="crumb-module" aria-current="page">{CURRENT_ROUTE_CATALOG[canonicalRoute(currentRoute)]?.label || currentRoute}</span>

            </nav>
            <button
              ref={searchTrigger}
              className="search-trigger"
              hidden={!presenterMode}
              aria-label="Open global search"
              onClick={openSearch}
            >
              <Icon name="search" />
              <span>Search clients, engagements, evidence, invoices…</span>
              <kbd>/</kbd>
            </button>
          </div>

          <div className="topbar-right">
            <button className="btn sm" aria-pressed={presenterMode} onClick={() => setPresenterMode(v => !v)}>Presenter / Demo Controls</button>
            <span className="demo-pill">
              <span className="demo-dot" />
              <CloudDemoLabel />
            </span>
            <button
              className="btn sm tour-header"
              hidden={!presenterMode}
              onClick={() => setShowScenarioModal(true)}
            >
              <Icon name="layers" />
              Explore Scenarios
            </button>
            <div className="persona" hidden={!presenterMode}>
              <div className="firmavatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                {currentPersona.initials}
              </div>
              <div>
                <label htmlFor="role-select">SIMULATED IDENTITY (NOT LIVE AUTH)</label>
                <select
                  id="role-select"
                  value={state.currentUserId}
                  onChange={e => handleRoleChange(e.target.value)}
                >
                  <optgroup label="Core User Personas (STE Specification 1.2)">
                    {state.users.filter(u => ['preparer', 'reviewer', 'partner', 'client'].includes(u.id)).map(u => {
                      const specLabel = u.id === 'preparer' ? 'PREPARER (Associate)' :
                                        u.id === 'reviewer' ? 'REVIEWER (Senior / Manager)' :
                                        u.id === 'partner' ? 'APPROVER (Partner)' :
                                        'CLIENT (Coordinator / CFO)';
                      return (
                        <option key={u.id} value={u.id}>
                          {specLabel} — {u.name}
                        </option>
                      );
                    })}
                  </optgroup>
                  <optgroup label="Other Internal / Simulated Identities">
                    {state.users.filter(u => !['preparer', 'reviewer', 'partner', 'client'].includes(u.id)).map(u => (
                      <option key={u.id} value={u.id}>
                        {u.label} — {u.name}{u.status !== 'Active' ? ' (disabled)' : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          </div>
        </header>

        {/* Global Context Bar */}
        <div className="contextbar">
          <div className="context-item">
            <label>Client / Engagement</label>
            <select
              value={selectedEng?.id || ''}
              onChange={e => handleEngagementChange(e.target.value)}
              aria-label="Selected engagement"
              disabled={!scopedEngagements.length}
            >
              {!scopedEngagements.length && <option value="">No permitted engagement</option>}
              {scopedEngagements.map(eng => {
                const c = state.clients.find(x => x.id === eng.client);
                return (
                  <option key={eng.id} value={eng.id}>
                    {c?.name || 'Client'} · FY {eng.year} ({eng.service})
                  </option>
                );
              })}
            </select>
          </div>
          <div className="context-item">
            <label>Service</label>
            <span>{selectedEng?.service || 'Unavailable'}</span>
          </div>
          <div className="context-item">
            <label>Period</label>
            <span>{selectedEng ? selectedEng.period || `FY ${selectedEng.year}` : 'Unavailable'}</span>
          </div>
          <div className="context-item">
            <label>Mode / Currency</label>
            <span>{selectedEng ? `${selectedEng.mode} · ${selectedEng.currency}` : 'Unavailable'}</span>
          </div>
          <div className="context-item" hidden={!presenterMode}>
            <label hidden={!presenterMode}>Scenario</label>
            {(() => {
              // Presentation only: the last "Loaded scenario preset" event in the local log (not a stored field).
              const loaded = state.events.find(event => event.text.startsWith('Loaded scenario preset: '));
              const id = loaded?.text.replace('Loaded scenario preset: ', '');
              const title = SCENARIO_DEFINITIONS.find(item => item.id === id)?.title;
              return <span title={loaded ? 'Most recent preset loaded in this browser; later edits are local changes' : 'No preset loaded in the retained event log'}>{title || id || 'Local audit lifecycle'}</span>;
            })()}
          </div>
          <div className="context-item">
            <label>Report set</label>
            {(() => {
              if (selectedEng?.auditLifecycle) { const set=selectedEng.auditLifecycle.deliverables.at(-1); return <span>{set ? `v${set.revision} · ${selectedEng.auditLifecycle.archiveControl.freezeStatus==='Frozen'?'Frozen':set.deliveredAt?'Delivered':'Generated'}` : 'Not generated'}</span>; }
              const display = getPackageContextDisplay(selectedEng);
              if (!display.revision) return <span>{display.status}</span>;
              return <>
                <span className="mono">{display.revision}</span>
                <span className={`tag ${display.status === 'Current' ? 'green' : 'amber'}`} style={{ marginLeft: 6 }}>{display.status}</span>
              </>;
            })()}
          </div>
        </div>

        {/* Main Content Area */}
        <main className="main" id="main" tabIndex={-1}>
          <CloudDemoControls visible={presenterMode} onBeforeContextChange={onBeforeContextChange} />
          {children}
        </main>
      </div>

      {/* Scenario Chooser Modal */}
      {showScenarioModal && (
        <div className="modal-backdrop" data-dismiss-guard="none" onClick={() => setShowScenarioModal(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Select Demo Scenario Preset</h2>
              <button className="icon-btn" onClick={() => setShowScenarioModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="sub" style={{ marginBottom: 16 }}>
                Start a fresh synthetic audit lifecycle. Existing local records are replaced only after confirming the scenario change.
              </p>
              <div className="stack" style={{ gap: 10 }}>
                {SCENARIO_DEFINITIONS.filter(s => s.id === 'target-lifecycle' || s.id === 'empty-practice').map(scen => (
                  <button
                    type="button"
                    key={scen.id}
                    className="borderbox scenario-option"
                    aria-label={`Load scenario preset: ${scen.title}`}
                    onClick={() => handleSelectScenario(scen.id)}
                  >
                    <span className="between">
                      <b>{scen.title}</b>
                      <span className="tag blue">Load Preset</span>
                    </span>
                    <span className="sub block" style={{ marginTop: 6, fontSize: 12 }}>{scen.description}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn ghost sm" onClick={() => setShowScenarioModal(false)}>Cancel</button>
              <button className="btn sm" onClick={() => downloadJSON(`auditsphere-state-${state.asOfDate}.json`, prototypeStore.exportStateJSON())}>Export state JSON</button>
              {importStateButton}
              <button
                className="btn sm"
                onClick={() => {
                  requestDemoReset();
                }}
              >
                Reset Default
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirmation && (
        <div className="modal-backdrop" onClick={() => setShowResetConfirmation(false)}>
          <section className="modal" role="alertdialog" aria-labelledby="reset-demo-title" aria-describedby="reset-demo-description" style={{ maxWidth: 480 }} onClick={event => event.stopPropagation()}>
            <div className="modal-head">
              <h2 id="reset-demo-title">Reset local demo data?</h2>
              <button className="icon-btn" aria-label="Cancel reset" onClick={() => setShowResetConfirmation(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p id="reset-demo-description">This replaces the current browser demo state with the default baseline. The current payload is retained as a recovery backup; unsaved drafts must first be saved or discarded.</p>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setShowResetConfirmation(false)}>Cancel reset</button>
              <button className="btn sm" onClick={confirmDemoReset}>Confirm reset</button>
            </div>
          </section>
        </div>
      )}

      {/* Global Search Modal */}
      {showSearchModal && (
        <div className="modal-backdrop" data-dismiss-guard="none" onClick={closeSearch}>
          <div className="modal global-search-dialog" role="dialog" aria-modal="true" aria-label="Global search" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="row" style={{ flex: 1, gap: 10 }}>
                <Icon name="search" />
                <input
                  ref={searchInput}
                  type="text"
                  className="input"
                  aria-label="Search practice records"
                  style={{ flex: 1 }}
                  placeholder="Search clients, engagements, documents..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <button className="icon-btn" aria-label="Close global search" onClick={closeSearch}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: 380, overflowY: 'auto' }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <label className="caption" htmlFor="global-search-type">Record type</label>
                <select id="global-search-type" className="input sm" value={searchRecordType} onChange={e => setSearchRecordType(e.target.value)}>
                  <option value="all">All types</option>
                  {searchTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
                <label className="caption" htmlFor="global-search-context">Context</label>
                <select id="global-search-context" className="input sm" value={searchContext} onChange={e => setSearchContext(e.target.value)}>
                  <option value="all">All permitted contexts</option>
                  {scopedClients.map(client => <option key={`client:${client.id}`} value={`client:${client.id}`}>Client · {client.name}</option>)}
                  {scopedEngagements.map(engagement => <option key={`engagement:${engagement.id}`} value={`engagement:${engagement.id}`}>Engagement · {engagement.id}</option>)}
                </select>
              </div>
              {filteredSearchResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)' }}>
                  {searchQuery ? 'No matching records found in demo state.' : 'Type a query to search all practice records.'}
                </div>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {filteredSearchResults.map((item, idx) => {
                    const kind = item.sub.split(' · ')[0];
                    return <React.Fragment key={`${kind}:${item.objectId}`}>
                      {idx === 0 || filteredSearchResults[idx - 1].sub.split(' · ')[0] !== kind ? <h4 className="eyebrow">{kind}</h4> : null}
                      <button
                        className="borderbox"
                        style={{ textAlign: 'left', width: '100%', cursor: 'pointer', padding: 10 }}
                        onClick={() => {
                          onBeforeContextChange(() => {
                            const currentState = prototypeStore.getSnapshot();
                            if (!canReadSearchRecord(currentState, item)) {
                              triggerToast('This search result is no longer available in your current access scope.', 'error');
                              return;
                            }
                            if (item.clientId) onSelectClient(item.clientId);
                            if (item.engagementId) prototypeStore.setSelectedEngagement(item.engagementId);
                            onRouteChange(item.route, item.objectId);
                            closeSearch();
                          });
                        }}
                      >
                        <b>{item.title}</b>
                        <div className="cell-sub">{item.sub}</div>
                      </button>
                    </React.Fragment>;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <div id="toasts">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type || ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
};
