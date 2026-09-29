import { TargetScopeView } from './components/target/TargetScopeView';
import { TargetSamplingView } from './components/target/TargetSamplingView';
import { PbcWorkspaceView } from './components/target/PbcWorkspaceView';
import { FieldworkView } from './components/target/FieldworkView';
import { PracticeView } from './components/target/PracticeView';
import { LifecycleOverviewView } from './components/target/LifecycleOverviewView';
import { EngagementBillingView } from './components/target/EngagementBillingView';
import { SchedulingView } from './components/target/SchedulingView';
import { TrialBalanceView } from './components/target/TrialBalanceView';
import { AuditFinancialView } from './components/target/AuditFinancialView';
import { ConfirmationsView } from './components/target/ConfirmationsView';
import { ReviewSRMView } from './components/target/ReviewSRMView';
import { OpinionDeliverablesView } from './components/target/OpinionDeliverablesView';
import { FreezeArchiveView } from './components/target/FreezeArchiveView';
import { TargetLifecycleHeader } from './components/target/TargetCommon';
// AuditSphere Main Application Component
// Subscribes to the shared store and renders the target audit lifecycle.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RouteKey } from './types';
import { prototypeStore } from './store/prototypeStore';
import { canOpenRoute, isClientRole, hasSelectedEngagementScope } from './services/guards';
import { Shell } from './components/layout/Shell';

// Practice & CRM Modules
import { ClientsView } from './components/modules/ClientsView';
import { ClientDetailView } from './components/modules/ClientDetailView';
import { LeadsPipelineView } from './components/modules/LeadsPipelineView';
import { ProposalsView } from './components/modules/ProposalsView';
import { EngagementsView } from './components/modules/EngagementsView';

// Work & Collaboration Modules

// Economics & Billing Modules

// Accounting Workbench & Reporting

// Audit & Assurance Modules
import { AuditAcceptanceView } from './components/modules/AuditAcceptanceView';
import { AuditPlanningView } from './components/modules/AuditPlanningView';
import { AuditRisksProgramsView } from './components/modules/AuditRisksProgramsView';
import { EvidenceCatalogueView } from './components/modules/EvidenceCatalogueView';
import { FindingsView } from './components/modules/FindingsView';

// Client Services, Admin & Specifications
import { AdministrationView } from './components/modules/AdministrationView';
import { M365SetupView } from './components/modules/M365SetupView';
import { UnsavedFormGuard } from './services/unsavedFormGuard';
import { resolveRouteHash, canonicalRoute } from './services/legacyRoutes';

const ENGAGEMENT_CONTEXT_ROUTES = new Set<string>([
  'onboarding', 'audit-acceptance', 'jobs', 'job-templates', 'documents', 'communications',
  'my-time', 'time-tracking', 'budgets', 'billing', 'receivables', 'accounting-setup',
  'trial-balance', 'gl-transactions', 'account-mappings', 'adjustments', 'reconciliations',
  'financial-statements', 'financial-packages', 'audit-planning', 'audit-risks',
  'audit-fieldwork', 'sampling', 'audit', 'evidence', 'findings', 'reviews', 'approvals',
  'quality', 'delivery', 'records', 'm365-setup', 'scheduling', 'confirmations'
]);

const ACTIVE_DIALOG_GUARD = '__active-dialog__';
type WorkflowSelection = { route: RouteKey; context: { clientId?: string; engagementId?: string; recordId?: string } };

export const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<RouteKey>(() => resolveRouteHash(window.location.hash)?.route || 'overview');
  const [selectedClientId, setSelectedClientId] = useState<string>('CL-001');
  const [searchTargetId, setSearchTargetId] = useState<string | undefined>();
  const [workflowSelection, setWorkflowSelection] = useState<WorkflowSelection | null>(null);
  const [, setTick] = useState(0);
  const [guideOrigin, setGuideOrigin] = useState<RouteKey>('overview');
  const unsavedForms = useRef<Map<string, UnsavedFormGuard>>(new Map());
  const acceptedRouteHash = useRef(`#${resolveRouteHash(window.location.hash)?.route || 'overview'}`);
  const [pendingTransition, setPendingTransition] = useState<{ run: () => void; label: string } | null>(null);
  const [transitionError, setTransitionError] = useState('');
  // VP-003-E01: dialog whose Escape/backdrop dismissal is waiting for an explicit discard decision.
  const [dismissPrompt, setDismissPrompt] = useState<HTMLElement | null>(null);
  const dismissActions = useRef<{ discard: () => void; keep: () => void }>({ discard: () => undefined, keep: () => undefined });

  const registerUnsavedForm = useCallback((guard: UnsavedFormGuard | null, key = 'default') => {
    if (guard) unsavedForms.current.set(key, guard);
    else unsavedForms.current.delete(key);
  }, []);
  const reportWorkflowSelection = useCallback((route: RouteKey, context: WorkflowSelection['context']) => {
    setWorkflowSelection(previous => previous?.route === route && previous.context.clientId === context.clientId && previous.context.engagementId === context.engagementId && previous.context.recordId === context.recordId
      ? previous
      : { route, context });
  }, []);
  const reportJobsWorkflowContext = useCallback((context: WorkflowSelection['context']) => reportWorkflowSelection('jobs', context), [reportWorkflowSelection]);
  const reportSamplingWorkflowContext = useCallback((context: WorkflowSelection['context']) => reportWorkflowSelection('sampling', context), [reportWorkflowSelection]);
  const requestContextChange = useCallback((run: () => void) => {
    const dirtyGuards = () => [...unsavedForms.current.values()].filter(guard => guard.isDirty());
    const decide = (dirty: UnsavedFormGuard[]) => {
      if (dirty.length) setPendingTransition({ run, label: [...new Set(dirty.map(guard => guard.label))].join(' and ') });
      else run();
    };
    const dirty = dirtyGuards();
    setTransitionError('');
    const dialogGuard = unsavedForms.current.get(ACTIVE_DIALOG_GUARD);
    // A dialog action that saves, closes and navigates in one handler still has its dialog in
    // the DOM here; re-check the open-dialog guard after React commits that close.
    if (dirty.length && dirty.every(guard => guard === dialogGuard)) setTimeout(() => decide(dirtyGuards()), 0);
    else decide(dirty);
  }, []);
  const resolveTransition = async (choice: 'save' | 'discard') => {
    const pending = pendingTransition;
    // The shared open-dialog guard runs last, after the owning form had its chance to save.
    const dialogGuard = unsavedForms.current.get(ACTIVE_DIALOG_GUARD);
    const dirty = [...unsavedForms.current.values()].filter(guard => guard.isDirty()).sort((a, b) => Number(a === dialogGuard) - Number(b === dialogGuard));
    if (!pending || !dirty.length) return;
    if (choice === 'save') {
      // A rejected save keeps the user, the remaining drafts and the context unchanged.
      for (const guard of dirty) {
        try {
          if (!await guard.save()) {
            setTransitionError(guard === unsavedForms.current.get(ACTIVE_DIALOG_GUARD)
              ? 'The open dialog could not be saved from navigation. Stay and use the dialog\'s own action, or discard its changes.'
              : `${guard.label} could not be saved. Check its message, or stay here and finish or discard the draft.`);
            return;
          }
        } catch (error: any) {
          setTransitionError(`${guard.label} could not be saved: ${error?.message || 'unexpected error'}`);
          return;
        }
      }
    } else {
      // An explicit-only dialog cannot be dismissed from here; keep the context rather than
      // leaving it open against a different client, engagement or persona.
      if (dirty.some(guard => guard.blocksDiscard?.())) {
        setTransitionError('The open dialog can only be closed with its own Cancel or Save. Stay and close it first.');
        return;
      }
      dirty.forEach(guard => guard.discard());
      // The shared open-dialog guard stays registered for the next dialog.
      dirty.forEach(guard => { for (const [key, registered] of unsavedForms.current) if (registered === guard && key !== ACTIVE_DIALOG_GUARD) unsavedForms.current.delete(key); });
    }
    setPendingTransition(null);
    setTransitionError('');
    pending.run();
  };

  // Subscribe to store updates
  useEffect(() => {
    const unsubscribe = prototypeStore.subscribe(() => {
      setTick(t => t + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const syncFromLocation = (event?: Event) => {
      const resolved = resolveRouteHash(window.location.hash);
      if (!resolved) return;
      // A hash/popstate event that lands on the already-accepted route changes nothing, so it
      // must not raise an unsaved-changes decision. The initial sync (no event) still applies
      // the route policy.
      if (event && !resolved.redirected && `#${resolved.route}` === acceptedRouteHash.current) return;
      requestContextChange(() => {
        const snapshot = prototypeStore.getSnapshot();
        const active = snapshot.users.find(user => user.id === snapshot.currentUserId)?.status === 'Active';
        const allowedRoute = canOpenRoute(snapshot.currentRole, resolved.route, active)
          ? resolved.route
          : active && isClientRole(snapshot.currentRole) ? 'portal' : active ? 'overview' : 'requirements';
        setCurrentRoute(allowedRoute);
        acceptedRouteHash.current = `#${allowedRoute}`;
        if (window.location.hash !== `#${allowedRoute}`) window.history.replaceState(null, '', `#${allowedRoute}`);
      });
    };
    window.addEventListener('hashchange', syncFromLocation);
    window.addEventListener('popstate', syncFromLocation);
    syncFromLocation();
    return () => {
      window.removeEventListener('hashchange', syncFromLocation);
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, [requestContextChange]);

  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let returnFocus: HTMLElement | null = null;
    let lastDialogTrigger: HTMLElement | null = null;
    let dialogSequence = 0;
    // Shared dismissal guard: Escape and backdrop clicks never silently drop edited
    // dialog fields. Dialogs that already confirm through their own close handler
    // (onBeforeContextChange / window.confirm) opt out with data-dismiss-guard.
    // Per-dialog baseline, so a stacked prompt closing does not reset an edited dialog.
    const dialogDrafts = new WeakMap<HTMLElement, { baseline: string; edited: boolean }>();
    const draftOf = (dialog: HTMLElement) => {
      let draft = dialogDrafts.get(dialog);
      if (!draft) { draft = { baseline: dialogFields(dialog), edited: false }; dialogDrafts.set(dialog, draft); }
      return draft;
    };
    let promptOpen = false;
    let bypassDismissGuard = false;
    const dialogFields = (dialog: HTMLElement) => JSON.stringify([...dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')]
      .filter(field => !field.closest('[data-dismiss-prompt]'))
      .map(field => field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')
        ? field.checked
        : field instanceof HTMLInputElement && field.type === 'file' ? [...(field.files || [])].map(file => `${file.name}:${file.size}`).join('|') : field.value));
    const backdropOf = (dialog: HTMLElement | null) => dialog?.closest<HTMLElement>('.modal-backdrop') || dialog?.closest<HTMLElement>('.modal-overlay') || null;
    const closePrompt = () => { promptOpen = false; setDismissPrompt(null); };
    dismissActions.current = {
      keep: () => {
        closePrompt();
        if (activeDialog) (focusable(activeDialog).find(element => !element.closest('[data-dismiss-prompt]')) || activeDialog).focus();
      },
      discard: () => {
        const backdrop = backdropOf(activeDialog);
        closePrompt();
        if (!backdrop) return;
        bypassDismissGuard = true;
        try { backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true })); } finally { bypassDismissGuard = false; }
      }
    };
    const dialogIsDirty = (dialog: HTMLElement | null = activeDialog) => {
      const backdrop = backdropOf(dialog);
      if (!dialog || !backdrop || backdrop.dataset.dismissGuard === 'self' || backdrop.dataset.dismissGuard === 'none') return false;
      const draft = draftOf(dialog);
      return draft.edited && dialogFields(dialog) !== draft.baseline;
    };
    // The topmost business dialog, looking beneath the shared "Unsaved changes" prompt.
    const guardedDialog = () => [...document.querySelectorAll<HTMLElement>('.modal-backdrop .modal, .modal-overlay .modal-card')]
      .reverse().find(dialog => backdropOf(dialog)?.dataset.dismissGuard !== 'none') || null;
    // Fallback navigation guard for an edited dialog without its own registered draft
    // guard: route, hash, back/forward and context switches ask first, and generic
    // "Save and continue" never submits the dialog's decision on the user's behalf.
    const dialogGuard: UnsavedFormGuard = {
      label: 'the open dialog',
      // Always reported when the open dialog is edited, even alongside a page draft, so
      // navigation never drops dialog edits without naming them.
      isDirty: () => dialogIsDirty(guardedDialog()),
      // Generic navigation never submits the dialog. It succeeds only if an earlier guard's
      // own save already closed or committed this dialog (checked after React re-renders).
      save: async () => {
        const dialog = guardedDialog();
        // Macrotask waits (not animation frames, which a hidden tab may never deliver) let React commit a close.
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => setTimeout(resolve, 0));
        return !dialog || !dialog.isConnected || !dialogIsDirty(dialog);
      },
      blocksDiscard: () => {
        const dialog = guardedDialog();
        return backdropOf(dialog)?.dataset.dismissGuard === 'explicit' && dialogIsDirty(dialog);
      },
      discard: () => {
        const dialog = guardedDialog();
        const backdrop = backdropOf(dialog);
        // Explicit-only dialogs have no dismissal handler; they close when the route changes.
        if (!backdrop || backdrop.dataset.dismissGuard === 'explicit') return;
        bypassDismissGuard = true;
        try { backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true })); } finally { bypassDismissGuard = false; }
      }
    };
    unsavedForms.current.set(ACTIVE_DIALOG_GUARD, dialogGuard);
    const onDismissClick = (event: MouseEvent) => {
      const backdrop = backdropOf(activeDialog);
      if (bypassDismissGuard || !activeDialog || !backdrop || event.target !== backdrop) return;
      if (backdrop.dataset.dismissGuard === 'explicit' || !dialogIsDirty()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      promptOpen = true;
      setDismissPrompt(activeDialog);
    };
    const onDialogInput = (event: Event) => {
      if (activeDialog && event.target instanceof Node && activeDialog.contains(event.target)) draftOf(activeDialog).edited = true;
    };
    const focusable = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )].filter(element => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
    const syncDialogs = () => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('.modal-backdrop .modal, .modal-overlay .modal-card')];
      dialogs.forEach(dialog => {
        if (!dialog.hasAttribute('role')) dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        if (!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
          const title = dialog.querySelector<HTMLElement>('h1,h2,h3');
          if (title) {
            title.id ||= `dialog-title-${++dialogSequence}`;
            dialog.setAttribute('aria-labelledby', title.id);
          } else {
            const triggerName = lastDialogTrigger?.getAttribute('aria-label')
              || lastDialogTrigger?.getAttribute('title')
              || lastDialogTrigger?.innerText.trim();
            if (triggerName) dialog.setAttribute('aria-label', triggerName);
          }
        }
        if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
      });
      const next = dialogs.at(-1) || null;
      if (next === activeDialog) {
        // Late-populated defaults are part of the baseline until the user edits.
        if (next && !draftOf(next).edited) draftOf(next).baseline = dialogFields(next);
        return;
      }
      const previous = activeDialog;
      activeDialog = next;
      if (next) draftOf(next);
      if (promptOpen) closePrompt();
      if (next) {
        if (!previous) {
          returnFocus = lastDialogTrigger?.isConnected
            ? lastDialogTrigger
            : document.activeElement instanceof HTMLElement ? document.activeElement : null;
          lastDialogTrigger = null;
        }
        (focusable(next)[0] || next).focus();
      } else {
        const target = returnFocus;
        returnFocus = null;
        if (target?.isConnected) target.focus();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeDialog) return;
      if (event.key === 'Escape') {
        const backdrop = activeDialog.closest<HTMLElement>('.modal-backdrop') || activeDialog.closest<HTMLElement>('.modal-overlay');
        if (!backdrop) return;
        event.preventDefault();
        event.stopPropagation();
        // Escape while the discard prompt is open means "keep editing", never discard.
        if (promptOpen) { dismissActions.current.keep(); return; }
        backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      } else if (event.key === 'Tab') {
        const items = focusable(activeDialog);
        if (!items.length) { event.preventDefault(); activeDialog.focus(); return; }
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (activeDialog && event.target instanceof Node && !activeDialog.contains(event.target)) (focusable(activeDialog)[0] || activeDialog).focus();
    };
    const rememberDialogTrigger = (event: MouseEvent) => {
      if (activeDialog || !(event.target instanceof Element)) return;
      const trigger = event.target.closest<HTMLElement>('button:not([disabled]),a[href],[role="button"],input[type="button"],input[type="submit"]');
      if (trigger) lastDialogTrigger = trigger;
    };
    const observer = new MutationObserver(syncDialogs);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', rememberDialogTrigger, true);
    document.addEventListener('click', onDismissClick, true);
    document.addEventListener('input', onDialogInput, true);
    document.addEventListener('change', onDialogInput, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocus, true);
    syncDialogs();
    return () => {
      observer.disconnect();
      unsavedForms.current.delete(ACTIVE_DIALOG_GUARD);
      document.removeEventListener('click', onDismissClick, true);
      document.removeEventListener('input', onDialogInput, true);
      document.removeEventListener('change', onDialogInput, true);
      document.removeEventListener('click', rememberDialogTrigger, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocus, true);
    };
  }, []);

  const state = prototypeStore.getSnapshot();
  const isClient = isClientRole(state.currentRole);
  const activeIdentity = state.users.find(user => user.id === state.currentUserId)?.status === 'Active';
  const navigate = (route: RouteKey, targetId?: string) => {
    route = canonicalRoute(route);
    if (route === 'module-guide' && effectiveRoute !== 'module-guide') setGuideOrigin(effectiveRoute);
    requestContextChange(() => {
      const current = prototypeStore.getSnapshot();
      const active = current.users.find(user => user.id === current.currentUserId)?.status === 'Active';
      setSearchTargetId(targetId);
      setWorkflowSelection(null);
      const nextRoute = canOpenRoute(current.currentRole, route, active) ? route : active && isClientRole(current.currentRole) ? 'portal' : active ? 'overview' : 'requirements';
      setCurrentRoute(nextRoute);
      acceptedRouteHash.current = `#${nextRoute}`;
      if (window.location.hash !== `#${nextRoute}`) window.history.pushState(null, '', `#${nextRoute}`);
    });
  };
  const navigateToPbcRequest = (clientId: string, requestId: string) => {
    requestContextChange(() => {
      const current = prototypeStore.getSnapshot();
      const active = current.users.find(user => user.id === current.currentUserId)?.status === 'Active';
      const route: RouteKey = canOpenRoute(current.currentRole, 'client-detail', active) ? 'client-detail' : active && isClientRole(current.currentRole) ? 'portal' : 'overview';
      setSelectedClientId(clientId);
      setSearchTargetId(requestId);
      setWorkflowSelection(null);
      setCurrentRoute(route);
      acceptedRouteHash.current = `#${route}`;
      if (window.location.hash !== `#${route}`) window.history.pushState(null, '', `#${route}`);
    });
  };
  const effectiveRoute: RouteKey = !activeIdentity
    ? 'requirements'
    : isClient
    ? currentRoute === 'requirements' || currentRoute === 'client-requirements' || currentRoute === 'module-guide' ? currentRoute : 'portal'
    : canOpenRoute(state.currentRole, currentRoute, activeIdentity) ? currentRoute : 'overview';

  const stayOnCurrentRoute = () => {
    setPendingTransition(null);
    setTransitionError('');
    if (window.location.hash !== acceptedRouteHash.current) window.history.replaceState(null, '', acceptedRouteHash.current);
  };

  const renderModule = () => {
    if (ENGAGEMENT_CONTEXT_ROUTES.has(effectiveRoute) && !hasSelectedEngagementScope(state)) {
      return <div className="panel panel-pad" role="alert" data-testid="engagement-context-unavailable">
        <h2>Engagement selection unavailable</h2>
        <p className="sub mt8">The current engagement selection is outside your access scope or has expired. Engagement records and counts have not been loaded. Return to an authorized workspace and select a permitted engagement.</p>
      </div>;
    }
    switch (effectiveRoute) {
      // Practice & CRM
      case 'overview':
        return <LifecycleOverviewView onNavigate={navigate} />;
      case 'clients':
        return (
          <ClientsView
            onNavigate={navigate}
            onBeforeContextChange={requestContextChange}
            onRegisterUnsavedForm={registerUnsavedForm}
            onSelectClientDetail={(cid) => {
              setSelectedClientId(cid);
              navigate('client-detail');
            }}
          />
        );
      case 'client-detail':
        return (
          <ClientDetailView
            key={`${selectedClientId}:${searchTargetId || ''}`}
            clientId={selectedClientId}
            searchTargetId={searchTargetId}
            onBack={() => navigate('clients')}
            onNavigate={navigate}
            onBeforeContextChange={requestContextChange}
            onRegisterUnsavedForm={registerUnsavedForm}
          />
        );
      case 'acquisition':
      case 'crm' as any:
        return <LeadsPipelineView onNavigate={navigate} onBeforeContextChange={requestContextChange} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'proposals':
        return <ProposalsView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'engagements':
        return <EngagementsView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} onBeforeContextChange={requestContextChange} />;
      case 'onboarding':
      case 'audit-acceptance' as any:
        return <AuditAcceptanceView key={state.selectedEngagement} onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;

      // Work & Collaboration
      case 'documents':
        return <PbcWorkspaceView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;

      // Economics & Billing
      case 'billing':
        return <EngagementBillingView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;

      // Accounting Workbench
      case 'trial-balance':
        return <TrialBalanceView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'scheduling':
        return <SchedulingView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'confirmations':
        return <ConfirmationsView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'financial-statements':
        return <AuditFinancialView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;

      // Audit & Assurance
      case 'audit-planning':
        return <AuditPlanningView key={state.selectedEngagement} onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'audit-risks':
      case 'audit-fieldwork':
        return <FieldworkView programId={searchTargetId} onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'sampling':
        return <TargetSamplingView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'evidence':
        return <EvidenceCatalogueView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'findings':
        return <FindingsView key={`${state.selectedEngagement}:${searchTargetId || ''}`} searchTargetId={searchTargetId} onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} onBeforeContextChange={requestContextChange} />;
      case 'reviews':
        return <ReviewSRMView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'approvals':
      case 'quality':
        return <ReviewSRMView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'delivery':
        return <OpinionDeliverablesView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'records':
        return <FreezeArchiveView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;

      // Client Services & Admin
      case 'portal':
      case 'client-portal' as any:
        return <PbcWorkspaceView client onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'practice-ledger':
        return <PracticeView ledger onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'reports':
      case 'reporting-centre' as any:
        return <PracticeView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} />;
      case 'administration':
      case 'services':
        return <AdministrationView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} onBeforeContextChange={requestContextChange} />;
      case 'm365-setup':
        return <M365SetupView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} onBeforeContextChange={requestContextChange} />;
      case 'requirements':
      case 'role-guide':
        return <TargetScopeView onNavigate={navigate} />;
      case 'client-requirements':
        return <TargetScopeView onNavigate={navigate} />;
      case 'module-guide':
        return <TargetScopeView onNavigate={navigate} />;

      default:
        return <LifecycleOverviewView onNavigate={navigate} />;
    }
  };

  return (
    <Shell currentRoute={effectiveRoute} onRouteChange={navigate} onSelectClient={(clientId) => requestContextChange(() => { setSelectedClientId(clientId); setWorkflowSelection(null); })} onBeforeContextChange={requestContextChange}>
      {!isClient && ENGAGEMENT_CONTEXT_ROUTES.has(effectiveRoute) && <TargetLifecycleHeader route={effectiveRoute} onNavigate={navigate} />}
      {renderModule()}

      {dismissPrompt && createPortal(<div data-dismiss-prompt="" role="alert" className="banner amber mt12" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <span>This dialog has unsaved changes. Nothing has been saved.</span>
        <span className="row" style={{ gap: 8 }}><button type="button" className="btn sm" onClick={() => dismissActions.current.keep()}>Keep editing</button><button type="button" className="btn ghost sm" onClick={() => dismissActions.current.discard()}>Discard changes</button></span>
      </div>, dismissPrompt)}
      {pendingTransition && <div className="modal-backdrop" data-dismiss-guard="none" onClick={stayOnCurrentRoute}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-changes-title" style={{ maxWidth: 480 }} onClick={event => event.stopPropagation()}>
        <div className="modal-head"><h2 id="unsaved-changes-title">Unsaved changes</h2><button type="button" className="icon-btn" aria-label="Cancel navigation" onClick={stayOnCurrentRoute}>✕</button></div>
        <div className="modal-body"><p>{pendingTransition.label} has unsaved changes. Save them before leaving, discard them, or stay here.</p>{transitionError && <p className="banner amber mt12" role="alert">{transitionError}</p>}</div>
        <div className="modal-foot"><button type="button" className="btn ghost sm" onClick={() => resolveTransition('discard')}>Discard and continue</button><button type="button" className="btn sm" onClick={stayOnCurrentRoute}>Stay</button><button type="button" className="btn primary sm" onClick={() => void resolveTransition('save')}>Save and continue</button></div>
      </section></div>}
    </Shell>
  );
};
export default App;
