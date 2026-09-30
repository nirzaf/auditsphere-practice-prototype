import { engagementProgress } from './targetLifecycle';
// Workflow progress engine: derives real-state progress, steps, counts, and answers
// to the 6 enterprise questions for every screen and stateful record across AuditSphere.
// Rule: Derived strictly from current store state and scoped permissions. Never hardcoded.

import type {
  PrototypeState,
  RouteKey,
  EngagementRecord,
  AdjustmentJournalItem,
  AuditProcedureItem,
  SamplePopulationRow,
  EvidenceItem,
  ArchiveRecord
} from '../types';
import { visibleEngagementIds, visibleClientIds, scopedInvoices, hasConsolidationGroupScope } from './guards';
import { consolidationOutputFingerprint } from './consolidationOutput';
import { isSampleFrameReconciled } from './samplingReadiness';
import { evaluateReleaseReadiness } from './releaseReadiness';
import { archiveForRelease, releaseForPackage } from './packageLineage';
import { ROUTE_CATALOG } from './routeCatalog';

export type ProgressStepState = 'completed' | 'current' | 'pending' | 'blocked' | 'returned' | 'stale' | 'skipped' | 'na';
export type ProgressApplicability = 'workflow' | 'summary' | 'reference' | 'unavailable';

export interface WorkflowProgressContext {
  engagementId?: string;
  clientId?: string;
  recordId?: string;
  portalResolved?: boolean;
}

export interface WorkflowStep {
  id: string;
  label: string;
  state: ProgressStepState;
  detail?: string;
  targetRoute?: RouteKey;
  targetSection?: string;
  targetRecordId?: string;
}

export interface WorkflowCounts {
  completed: number;
  current?: number;
  pending: number;
  blocked: number;
  skipped?: number;
  notApplicable?: number;
  total: number;
  returned?: number;
  stale?: number;
}

export interface ModuleWorkflowProgress {
  moduleId: string;
  moduleName: string;
  route: RouteKey;
  currentSection: string; // "Where am I?"
  steps: WorkflowStep[];
  percentComplete: number | null; // null means no applicable workflow measure
  applicability?: ProgressApplicability;
  metricLabel?: string;
  scopeLabel?: string;
  selectedRecordId?: string;
  recordSummary?: string;
  actorEligible?: boolean;
  actorEligibilityReason?: string;
  counts: WorkflowCounts;
  completedSummary: string; // "What is complete?"
  pendingSummary: string; // "What is pending?"
  blockedSummary?: string; // "What is blocked?"
  blockers: string[]; // Specific reasons and what is required next
  nextAction: string; // "What can I do next?"
  whoActsNext: string; // "Who acts next?"
  reworkNotes?: string[];
  isStale?: boolean;
}

export interface WorkflowStepAggregate {
  valid: boolean;
  counts: WorkflowCounts;
  percentComplete: number | null;
}

/** Deterministic equal-weight aggregation for a single set of lifecycle milestones. */
export function aggregateWorkflowSteps(steps: WorkflowStep[]): WorkflowStepAggregate {
  const seenIds = new Set<string>();
  const allowedStates: ProgressStepState[] = ['completed', 'current', 'pending', 'blocked', 'returned', 'stale', 'skipped', 'na'];
  const valid = !steps.some(step => !step.id || seenIds.has(step.id) || !seenIds.add(step.id) || !allowedStates.includes(step.state));
  if (!valid) {
    return {
      valid: false,
      counts: { completed: 0, current: 0, pending: 0, blocked: 0, returned: 0, stale: 0, skipped: 0, notApplicable: 0, total: 0 },
      percentComplete: null
    };
  }
  const count = (state: ProgressStepState) => steps.filter(step => step.state === state).length;
  const total = steps.filter(step => step.state !== 'na').length;
  const completed = count('completed');
  const counts: WorkflowCounts = {
    completed,
    current: count('current'),
    pending: count('pending'),
    blocked: count('blocked'),
    returned: count('returned'),
    stale: count('stale'),
    skipped: count('skipped'),
    notApplicable: count('na'),
    total
  };
  const percentComplete = total === 0 ? null : completed === total ? 100 : Math.min(99.9, Math.floor((completed / total) * 1000) / 10);
  return { valid: true, counts, percentComplete };
}

export function isEngagementReleaseReady(e: EngagementRecord, state: PrototypeState): boolean {
  return evaluateReleaseReadiness(e, state).ready;
}

const ENGAGEMENT_CONTEXT_ROUTES = new Set<RouteKey>([
  'onboarding', 'documents', 'my-time', 'billing', 'trial-balance',
  'financial-statements', 'audit-planning', 'audit-risks', 'audit-fieldwork', 'sampling',
  'evidence', 'findings', 'reviews', 'delivery', 'records', 'scheduling', 'confirmations'
]);

export function computeModuleWorkflowProgress(
  route: RouteKey,
  state: PrototypeState,
  context?: string | WorkflowProgressContext
): ModuleWorkflowProgress {
  const selection = typeof context === 'string' ? { engagementId: context } : context || {};
  const routeInfo = ROUTE_CATALOG[route];
  const emptyCounts: WorkflowCounts = { completed: 0, current: 0, pending: 0, blocked: 0, returned: 0, stale: 0, skipped: 0, notApplicable: 0, total: 0 };
  if (routeInfo.progressMode !== 'workflow') {
    const isReference = routeInfo.progressMode === 'reference';
    return {
      moduleId: routeInfo.moduleId,
      moduleName: routeInfo.label,
      route,
      currentSection: isReference ? 'Reference material' : 'Read-only portfolio summary',
      steps: [],
      percentComplete: null,
      applicability: isReference ? 'reference' : 'summary',
      metricLabel: 'No workflow completion applies',
      scopeLabel: 'Current permitted view',
      counts: emptyCounts,
      completedSummary: isReference ? 'This screen provides reference material.' : 'This screen summarizes permitted records across workflows.',
      pendingSummary: isReference ? 'No workflow actions are tracked from reference material.' : 'Open a stateful module to work on its current records.',
      blockers: [],
      nextAction: isReference ? 'Use the reference content or return to a workspace.' : 'Open a relevant work queue or select a client and engagement.',
      whoActsNext: 'No workflow actor applies'
    };
  }

  const allowedEngagementIds = visibleEngagementIds(state);
  const requestedEngagementId = selection.engagementId ?? state.selectedEngagement;
  const activeEngagement = state.engagements.find(engagement => engagement.id === requestedEngagementId && (allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(engagement.id)));
  const allowedClientIds = visibleClientIds(state);
  const selectedClient = route === 'client-detail' || route === 'portal'
    ? state.clients.find(client => client.id === selection.clientId && (allowedClientIds === 'ALL' || allowedClientIds.includes(client.id)))
    : undefined;
  const explicitEngagementUnavailable = Boolean(selection.engagementId && !activeEngagement);
  const portalContextUnavailable = route === 'portal' && selection.portalResolved && (!selectedClient || !activeEngagement || activeEngagement.client !== selectedClient.id);
  if (explicitEngagementUnavailable || ENGAGEMENT_CONTEXT_ROUTES.has(route) && !activeEngagement || route === 'client-detail' && !selectedClient || portalContextUnavailable) {
    const scope = route === 'client-detail' ? 'the selected client' : 'the selected engagement';
    return {
      moduleId: routeInfo.moduleId, moduleName: routeInfo.label, route, currentSection: routeInfo.label,
      steps: [], percentComplete: null, applicability: 'unavailable', metricLabel: 'Unavailable',
      scopeLabel: 'Selection is missing or outside your permitted scope', selectedRecordId: selection.recordId,
      counts: emptyCounts,
      completedSummary: 'No records or scope details were loaded.',
      pendingSummary: `Select an authorized record for ${scope} to calculate progress.`, blockers: [],
      nextAction: route === 'client-detail' ? 'Return to Client Portfolio and select an accessible client.' : 'Select an authorized engagement in the workspace.',
      whoActsNext: 'A permitted user must select the context'
    };
  }

  if (['confirmations','scheduling'].includes(route) && activeEngagement) {
    const stages=engagementProgress(state,activeEngagement).filter(stage=>stage.route===route);
    const steps:WorkflowStep[]=stages.map(stage=>({id:stage.id,label:stage.label,state:stage.status==='Completed'?'completed':stage.status==='Current'?'current':stage.status==='Needs Rework'?'stale':stage.status==='Blocked'?'blocked':'pending',detail:stage.blockers.join(' '),targetRoute:stage.route}));
    return reconcileProgress({moduleId:routeInfo.moduleId,moduleName:routeInfo.label,route,currentSection:routeInfo.label,steps,percentComplete:null,applicability:'workflow',counts:emptyCounts,completedSummary:'Recorded milestones',pendingSummary:'Current predecessor gates',blockers:stages.flatMap(s=>s.blockers),nextAction:'Record the next eligible action.',whoActsNext:stages[0]?.owner||'Scoped staff'},routeInfo,selection,activeEngagement.id,activeEngagement.client);
  }
  const raw = computeLegacyModuleWorkflowProgress(route, state, { ...selection, engagementId: activeEngagement?.id });
  return reconcileProgress(raw, routeInfo, selection, activeEngagement?.id, selectedClient?.id);
}

function reconcileProgress(
  raw: ModuleWorkflowProgress,
  routeInfo: (typeof ROUTE_CATALOG)[RouteKey],
  selection: WorkflowProgressContext,
  engagementId?: string,
  clientId?: string
): ModuleWorkflowProgress {
  const aggregate = aggregateWorkflowSteps(raw.steps);
  if (!aggregate.valid) {
    return {
      moduleId: routeInfo.moduleId, moduleName: routeInfo.label, route: raw.route, currentSection: raw.currentSection,
      steps: [], percentComplete: null, applicability: 'unavailable', metricLabel: 'Unavailable', scopeLabel: 'Progress data is inconsistent',
      selectedRecordId: selection.recordId,
      counts: { completed: 0, current: 0, pending: 0, blocked: 0, returned: 0, stale: 0, skipped: 0, notApplicable: 0, total: 0 },
      completedSummary: 'No completion value was calculated because progress data failed validation.',
      pendingSummary: 'Refresh the workspace and inspect the current record state.', blockers: [],
      nextAction: 'Refresh the current workspace before taking a workflow action.', whoActsNext: 'Workspace user'
    };
  }

  if (raw.applicability === 'unavailable') {
    return {
      ...raw,
      moduleId: routeInfo.moduleId,
      moduleName: routeInfo.label,
      percentComplete: null,
      applicability: 'unavailable',
      metricLabel: 'Unavailable',
      counts: { completed: 0, current: 0, pending: 0, blocked: 0, returned: 0, stale: 0, skipped: 0, notApplicable: 0, total: 0 },
      selectedRecordId: selection.recordId
    };
  }

  const { completed, current = 0, pending, blocked, returned = 0, stale = 0, skipped = 0, notApplicable = 0, total } = aggregate.counts;
  const { percentComplete } = aggregate;
  const blockers = blocked || returned || stale
    ? (raw.blockers.length ? raw.blockers : raw.steps.filter(step => ['blocked', 'returned', 'stale'].includes(step.state)).map(step => `${step.label}: ${step.detail || step.state}.`))
    : [];
  const unresolved = [
    current ? `${current} current` : '', pending ? `${pending} pending` : '', blocked ? `${blocked} blocked` : '',
    returned ? `${returned} returned for rework` : '', stale ? `${stale} stale` : '', skipped ? `${skipped} skipped` : ''
  ].filter(Boolean);
  const recordSummary = raw.recordSummary || [raw.completedSummary, raw.pendingSummary, raw.blockedSummary]
    .filter((summary): summary is string => Boolean(summary?.trim())).join(' ');

  return {
    ...raw,
    moduleId: routeInfo.moduleId,
    moduleName: routeInfo.label,
    percentComplete,
    applicability: 'workflow',
    metricLabel: total ? 'lifecycle steps' : 'No applicable steps',
    scopeLabel: selection.portalResolved ? `Client ${clientId || 'unavailable'} · Engagement ${engagementId || 'unavailable'}`
      : clientId ? `Client ${clientId}` : engagementId ? `Engagement ${engagementId}` : 'Permitted records in the current view',
    selectedRecordId: selection.recordId,
    counts: { completed, current, pending, blocked, returned, stale, skipped, notApplicable, total },
    completedSummary: total ? `${completed} of ${total} applicable lifecycle steps complete.` : 'No applicable lifecycle steps are currently recorded.',
    pendingSummary: unresolved.length ? `${unresolved.join(' · ')}.` : total ? 'No current, pending, blocked or rework steps.' : 'There is no applicable workflow for the current record.',
    blockedSummary: blocked ? `${blocked} lifecycle step(s) blocked.` : undefined,
    blockers,
    recordSummary: recordSummary || undefined,
    isStale: stale > 0
  };
}

function computeLegacyModuleWorkflowProgress(
  route: RouteKey,
  state: PrototypeState,
  context: WorkflowProgressContext
): ModuleWorkflowProgress {
  // Retired-route compatibility selectors: module identity derives from the (legacy) catalog
  // entry, never a hardcoded historical module name.
  const routeInfo = ROUTE_CATALOG[route];
  const allowedEngIds = visibleEngagementIds(state);
  const scopedEngagements: EngagementRecord[] = state.engagements.filter(
    e => allowedEngIds === 'ALL' || allowedEngIds.includes(e.id)
  );
  const activeEng = scopedEngagements.find(e => e.id === (context.engagementId || state.selectedEngagement));
  const allowedClientIds = visibleClientIds(state);
  const scopedClients = state.clients.filter(
    c => allowedClientIds === 'ALL' || allowedClientIds.includes(c.id)
  );

  switch (route) {
    case 'overview': {
      const activeEngs = scopedEngagements.filter(e => (e.lifecycleStatus || 'Active') === 'Active');
      const awaitingReviewCount = (activeEng?.reviews || []).filter(r => r.status !== 'Cleared').length;
      const clientRequestsCount = (activeEng?.pbc || []).filter(p => p.status !== 'Accepted').length;
      const readyForRelease = scopedEngagements.filter(e => isEngagementReleaseReady(e, state)).length;

      const steps: WorkflowStep[] = [
        { id: 'practice-setup', label: 'Practice Context', state: scopedClients.length > 0 ? 'completed' : 'pending', detail: `${scopedClients.length} permitted clients in scope` },
        { id: 'active-engagements', label: 'Active Engagements', state: activeEngs.length > 0 ? 'completed' : 'pending', detail: `${activeEngs.length} active engagements`, targetRoute: 'engagements' },
        { id: 'fieldwork-tasks', label: 'Work Delivery', state: state.jobs.length > 0 ? 'current' : 'pending', detail: `${state.jobs.length} jobs tracked`, targetRoute: 'jobs' },
        { id: 'review-desk', label: 'Technical Review', state: awaitingReviewCount > 0 ? 'current' : 'completed', detail: `${awaitingReviewCount} review items pending`, targetRoute: 'reviews' },
        { id: 'release-readiness', label: 'Release Readiness', state: readyForRelease > 0 ? 'completed' : 'pending', detail: `${readyForRelease} ready to release`, targetRoute: 'delivery' }
      ];

      const completed = steps.filter(s => s.state === 'completed').length;
      const percent = Math.round((completed / steps.length) * 100);

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'overview',
        currentSection: 'Practice Operations Dashboard',
        steps,
        percentComplete: percent,
        counts: {
          completed: activeEngs.length,
          pending: awaitingReviewCount + clientRequestsCount,
          blocked: 0,
          total: scopedEngagements.length
        },
        completedSummary: `${activeEngs.length} engagement(s) active in your current access scope.`,
        pendingSummary: `${awaitingReviewCount} review point(s) and ${clientRequestsCount} client request(s) awaiting attention.`,
        blockers: [],
        nextAction: awaitingReviewCount > 0 ? 'Review open review points and returned workpapers in the Review Desk' : 'Inspect active engagements or drill into work queues',
        whoActsNext: awaitingReviewCount > 0 ? 'Independent Reviewer / Manager' : 'Practice Team'
      };
    }

    case 'clients':
    case 'client-detail': {
      const viewClients = route === 'client-detail' ? scopedClients.filter(client => client.id === context.clientId) : scopedClients;
      const viewClientIds = new Set(viewClients.map(client => client.id));
      const viewEngagements = scopedEngagements.filter(engagement => viewClientIds.has(engagement.client));
      const activeClients = viewClients.filter(c => c.status === 'Active');
      const prospectClients = viewClients.filter(c => c.status === 'Prospect');
      const suspendedClients = viewClients.filter(c => c.status === 'Suspended');
      const acceptanceCases = (state.acceptanceCases || []).filter(item => viewClientIds.has(item.clientId));
      const acceptedCases = acceptanceCases.filter(item => item.decisionStatus === 'Accepted' && item.independenceConfirmed && item.amlKycCompleted && item.conflictsCleared && item.prohibitionsChecked && item.competenceConfirmed);
      const contacts = state.contacts.filter(contact => viewClientIds.has(contact.clientId) && contact.active);

      const steps: WorkflowStep[] = [
        { id: 'intake', label: 'Intake / Prospect', state: viewClients.length ? 'completed' : 'pending', detail: `${prospectClients.length} prospect(s)` },
        { id: 'onboarding-kyc', label: 'Acceptance & KYC', state: acceptedCases.length ? 'completed' : acceptanceCases.some(item => item.decisionStatus === 'Declined') ? 'blocked' : 'pending', detail: `${acceptedCases.length} accepted case(s) with completed screening checks`, targetRoute: 'onboarding' },
        { id: 'profile-contacts', label: 'Profile & Active Contacts', state: contacts.length && activeClients.length ? 'completed' : viewClients.length ? 'current' : 'pending', detail: `${contacts.length} active contact(s)` },
        { id: 'engagements', label: 'Linked Engagements', state: viewEngagements.length ? 'completed' : viewClients.length ? 'current' : 'pending', detail: `${viewEngagements.length} permitted engagement(s) linked`, targetRoute: 'engagements' },
        { id: 'ongoing-service', label: 'Active Client Relationships', state: activeClients.length ? 'completed' : prospectClients.length ? 'current' : suspendedClients.length ? 'blocked' : 'pending', detail: `${activeClients.length} active client(s)` }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'clients',
        currentSection: route === 'client-detail' ? 'Client 360 & Relationship Profile' : 'Client Portfolio Directory',
        steps,
        percentComplete: 0,
        counts: {
          completed: activeClients.length,
          pending: prospectClients.length,
          blocked: suspendedClients.length,
          total: viewClients.length
        },
        completedSummary: `${acceptedCases.length} visible client(s) have accepted cases with required screening evidence; ${activeClients.length} client(s) are active.`,
        pendingSummary: `${prospectClients.length} prospect client(s); ${viewEngagements.length} engagement(s) linked.`,
        blockedSummary: suspendedClients.length > 0 ? `${suspendedClients.length} suspended client(s) blocked from new operations.` : undefined,
        blockers: suspendedClients.map(c => `Client ${c.id} (${c.name}) is suspended.`),
        nextAction: prospectClients.length > 0 ? 'Complete professional acceptance and create engagement proposal' : 'Manage client profile, contacts, and relationship groups',
        whoActsNext: 'Relationship Lead / Manager'
      };
    }

    case 'acquisition': {
      const leads = state.leads || [];
      const won = leads.filter(l => l.stage === 'Won');
      const lost = leads.filter(l => l.stage === 'Lost' || l.stage === 'Unqualified');
      const open = leads.filter(l => l.stage !== 'Won' && l.stage !== 'Lost' && l.stage !== 'Unqualified');

      const steps: WorkflowStep[] = [
        { id: 'inquiry', label: 'Inquiry', state: leads.length ? 'completed' : 'pending' },
        { id: 'discovery', label: 'Discovery', state: leads.some(l => l.stage === 'Discovery') ? 'current' : open.length ? 'completed' : 'pending' },
        { id: 'evaluation', label: 'Evaluation', state: leads.some(l => l.stage === 'Evaluation') ? 'current' : 'pending' },
        { id: 'proposal', label: 'Proposal Terms', state: leads.some(l => l.stage === 'Proposal') ? 'current' : won.length ? 'completed' : 'pending', targetRoute: 'proposals' },
        { id: 'won', label: 'Won Conversion', state: won.length > 0 ? 'completed' : 'pending' }
      ];

      const percent = leads.length > 0 ? Math.round((won.length / leads.length) * 100) : 0;

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'acquisition',
        currentSection: 'Commercial Acquisition Pipeline',
        steps,
        percentComplete: percent,
        counts: {
          completed: won.length,
          pending: open.length,
          blocked: lost.length,
          total: leads.length
        },
        completedSummary: `${won.length} commercial opportunity(ies) successfully converted to client prospects.`,
        pendingSummary: `${open.length} active lead(s) currently progressing through discovery and evaluation.`,
        blockedSummary: lost.length > 0 ? `${lost.length} disqualified/lost lead(s) archived with reasons.` : undefined,
        blockers: lost.map(l => `${l.id} (${l.name}): Marked ${l.stage} - ${l.lostReason || 'No reason specified'}`),
        nextAction: open.length > 0 ? `Advance ${open[0].id} to the next pipeline stage or convert to prospect` : 'Log new commercial opportunity',
        whoActsNext: 'Relationship Lead'
      };
    }

    case 'proposals': {
      const proposals = state.proposals || [];
      const accepted = proposals.filter(p => p.state === 'Accepted');
      const inReview = proposals.filter(p => p.state === 'Internal review');
      const approvedToSend = proposals.filter(p => p.state === 'Approved to send');
      const presented = proposals.filter(p => p.state === 'Presented');
      const draft = proposals.filter(p => p.state === 'Draft');
      const returned = draft.filter(p => p.commercialReview && !p.commercialReview.approved);
      const declined = proposals.filter(p => p.state === 'Declined' || p.state === 'Withdrawn');

      const steps: WorkflowStep[] = [
        { id: 'prop-draft', label: 'Draft Scope', state: draft.length ? 'current' : proposals.length ? 'completed' : 'pending' },
        { id: 'prop-review', label: 'Independent Review', state: inReview.length ? 'current' : returned.length ? 'returned' : approvedToSend.length || presented.length || accepted.length ? 'completed' : 'pending' },
        { id: 'prop-approved', label: 'Approved to Send', state: approvedToSend.length ? 'completed' : 'pending' },
        { id: 'prop-presented', label: 'Presented', state: presented.length ? 'current' : accepted.length ? 'completed' : 'pending' },
        { id: 'prop-accepted', label: 'Accepted Terms', state: accepted.length ? 'completed' : 'pending' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'proposals',
        currentSection: 'Commercial Engagement Proposals',
        steps,
        percentComplete: proposals.length ? Math.round((accepted.length / proposals.length) * 100) : 0,
        counts: {
          completed: accepted.length,
          pending: inReview.length + approvedToSend.length + presented.length + draft.length,
          blocked: declined.length,
          total: proposals.length,
          returned: returned.length
        },
        completedSummary: `${accepted.length} proposal(s) accepted by client management with recorded terms.`,
        pendingSummary: `${inReview.length} awaiting review, ${presented.length} presented to client, ${draft.length} in draft.`,
        blockedSummary: returned.length ? `${returned.length} proposal(s) returned by reviewer for rework.` : undefined,
        reworkNotes: returned.map(p => `${p.id}: ${p.commercialReview?.notes || 'Returned for revision'}`),
        blockers: returned.map(p => `${p.id} returned by independent reviewer: ${p.commercialReview?.notes || 'Review notes pending resolution'}`),
        nextAction: inReview.length ? 'Perform independent technical review on submitted proposal' : presented.length ? 'Record client management response' : 'Submit draft proposal for review',
        whoActsNext: inReview.length ? 'Independent Reviewer / Partner' : presented.length ? 'Client Management / Relationship Lead' : 'Relationship Lead'
      };
    }

    case 'engagements': {
      const active = scopedEngagements.filter(e => (e.lifecycleStatus || 'Active') === 'Active');
      const suspended = scopedEngagements.filter(e => e.lifecycleStatus === 'Suspended');
      const closed = scopedEngagements.filter(e => e.lifecycleStatus === 'Closed' || e.lifecycleStatus === 'Cancelled');
      const selectedProposal = activeEng?.proposalId ? state.proposals.find(proposal => proposal.id === activeEng.proposalId && (!proposal.clientId || scopedClients.some(client => client.id === proposal.clientId))) : undefined;
      const acceptance = activeEng ? (state.acceptanceCases || []).find(item => item.clientId === activeEng.client && item.year === activeEng.year && item.decisionStatus === 'Accepted' && item.independenceConfirmed && item.amlKycCompleted && item.conflictsCleared && item.prohibitionsChecked && item.competenceConfirmed) : undefined;
      const selectedJobs = activeEng ? state.jobs.filter(job => job.engagementId === activeEng.id) : [];

      const steps: WorkflowStep[] = [
        { id: 'terms', label: 'Agreed Proposal Terms', state: selectedProposal?.state === 'Accepted' && activeEng?.terms ? 'completed' : activeEng ? 'pending' : 'current', targetRoute: 'proposals' },
        { id: 'kyc', label: 'Professional Acceptance & KYC', state: acceptance && activeEng?.acceptance ? 'completed' : activeEng ? 'pending' : 'current', targetRoute: 'onboarding' },
        { id: 'active', label: 'Engagement Status', state: activeEng?.lifecycleStatus === 'Suspended' ? 'blocked' : activeEng?.lifecycleStatus === 'Cancelled' ? 'skipped' : activeEng?.lifecycleStatus === 'Closed' ? 'completed' : activeEng?.acceptance && activeEng?.terms ? 'completed' : activeEng ? 'current' : 'pending' },
        { id: 'delivery', label: 'Job Delivery', state: selectedJobs.some(job => job.status === 'Blocked') ? 'blocked' : selectedJobs.some(job => job.status === 'In progress' || job.status === 'Not started') ? 'current' : selectedJobs.length && selectedJobs.every(job => job.status === 'Completed') ? 'completed' : selectedJobs.length && selectedJobs.every(job => job.status === 'Cancelled') ? 'skipped' : 'pending', targetRoute: 'jobs' },
        { id: 'completion', label: 'Release Readiness', state: activeEng ? isEngagementReleaseReady(activeEng, state) ? 'completed' : activeEng.lifecycleStatus === 'Cancelled' ? 'skipped' : 'pending' : 'pending', targetRoute: 'delivery' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'engagements',
        currentSection: 'Professional Engagements Workspace',
        steps,
        percentComplete: 0,
        counts: {
          completed: active.length,
          pending: scopedEngagements.length - active.length - suspended.length - closed.length,
          blocked: suspended.length,
          total: scopedEngagements.length
        },
        completedSummary: `${active.length} engagement(s) active with professional acceptance and scoped team.`,
        pendingSummary: `${scopedEngagements.length - active.length} engagement(s) in setup, suspension, or completion.`,
        blockedSummary: suspended.length ? `${suspended.length} engagement(s) currently suspended.` : undefined,
        blockers: suspended.map(e => `Engagement ${e.id} is suspended: Pending partner resolution`),
        nextAction: activeEng ? 'Navigate to jobs or audit planning for the active engagement' : 'Select an authorized engagement',
        whoActsNext: 'Engagement Partner / Manager'
      };
    }

    case 'onboarding': {
      const cases = (state.acceptanceCases || []).filter(item => allowedClientIds === 'ALL' || allowedClientIds.includes(item.clientId));
      const accepted = cases.filter(c => c.decisionStatus === 'Accepted');
      const pending = cases.filter(c => c.decisionStatus === 'Pending');
      const declined = cases.filter(c => c.decisionStatus === 'Declined');

      const steps: WorkflowStep[] = [
        { id: 'screening', label: 'Screening Checks', state: cases.length ? cases.some(c => c.riskRating === 'Prohibited' || !c.independenceConfirmed || !c.conflictsCleared || !c.prohibitionsChecked) ? 'blocked' : 'completed' : 'pending' },
        { id: 'evidence', label: 'Evidence Collection', state: cases.length && cases.every(c => c.screeningEvidence && Object.keys(c.screeningEvidence).length >= 3) ? 'completed' : cases.length ? 'current' : 'pending' },
        { id: 'recommendation', label: 'Manager Review', state: pending.length ? 'current' : accepted.length ? 'completed' : 'pending' },
        { id: 'partner-decision', label: 'Partner Acceptance', state: accepted.length ? 'completed' : 'pending' },
        { id: 'continuance', label: 'Continuance Rollforward', state: 'na' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'onboarding',
        currentSection: 'Client Acceptance & Continuance Review',
        steps,
        percentComplete: 0,
        counts: {
          completed: accepted.length,
          pending: pending.length,
          blocked: declined.length,
          total: cases.length
        },
        completedSummary: `${accepted.length} acceptance case(s) verified and approved by the engagement partner.`,
        pendingSummary: `${pending.length} acceptance case(s) pending partner decision.`,
        blockedSummary: declined.length ? `${declined.length} mandate(s) declined due to prohibitive risks or independence conflicts.` : undefined,
        blockers: declined.map(c => `${c.id}: Mandate declined due to risk assessment`),
        nextAction: pending.length ? 'Record partner decision on pending acceptance recommendation' : 'Complete screening questionnaire and attach evidence',
        whoActsNext: pending.length ? 'Engagement Partner' : 'Compliance / Onboarding Lead'
      };
    }

    case 'jobs': {
      const requestedJobId = context.recordId && state.jobs.some(job => job.id === context.recordId)
        ? context.recordId
        : context.recordId ? state.jobTasks.find(task => task.id === context.recordId)?.jobId : undefined;
      const selectedJob = requestedJobId ? state.jobs.find(job => job.id === requestedJobId && scopedEngagements.some(engagement => engagement.id === job.engagementId && engagement.client === job.clientId)) : undefined;
      if (context.recordId && !selectedJob) return {
        moduleId: routeInfo.moduleId, moduleName: routeInfo.label, route, currentSection: 'Selected Job', steps: [], percentComplete: null,
        applicability: 'unavailable', metricLabel: 'Unavailable', scopeLabel: 'The selected job is missing or outside the current permitted scope.', selectedRecordId: context.recordId,
        counts: { completed: 0, current: 0, pending: 0, blocked: 0, returned: 0, stale: 0, skipped: 0, notApplicable: 0, total: 0 },
        completedSummary: 'No job record was loaded.', pendingSummary: 'Select a job that is visible in the current job register.', blockers: [],
        nextAction: 'Choose a permitted job from the register.', whoActsNext: 'Workspace user'
      };
      const engJobs = selectedJob ? [selectedJob] : state.jobs.filter(job => job.engagementId === activeEng?.id && scopedEngagements.some(engagement => engagement.id === job.engagementId && engagement.client === job.clientId));
      const jobIds = new Set(engJobs.map(j => j.id));
      const tasks = state.jobTasks.filter(t => jobIds.has(t.jobId));
      const activeTasks = tasks.filter(task => task.status !== 'Cancelled');
      const completedTasks = activeTasks.filter(t => t.status === 'Completed');
      const blockedTasks = activeTasks.filter(t => t.status === 'Blocked');
      const openTasks = activeTasks.filter(t => t.status === 'Not started' || t.status === 'In progress');
      const cancelledTasks = tasks.filter(task => task.status === 'Cancelled');
      const selectedJobCancelled = selectedJob?.status === 'Cancelled';

      const steps: WorkflowStep[] = [
        { id: 'jobs-init', label: 'Job Record', state: selectedJob ? selectedJob.status === 'Cancelled' ? 'skipped' : 'completed' : engJobs.length ? 'completed' : 'pending', detail: selectedJob ? `${selectedJob.title} · ${selectedJob.id}` : `${engJobs.length} job(s) in the selected engagement` },
        { id: 'task-decomposition', label: 'Task Breakdown', state: activeTasks.length ? 'completed' : selectedJobCancelled || cancelledTasks.length ? 'skipped' : engJobs.length ? 'current' : 'pending' },
        { id: 'staff-assignment', label: 'Staff Assignment', state: activeTasks.length && activeTasks.every(task => task.assignee.trim()) ? 'completed' : activeTasks.length ? 'current' : 'pending' },
        { id: 'execution', label: 'Task Execution', state: blockedTasks.length ? 'blocked' : openTasks.length ? 'current' : completedTasks.length && completedTasks.length === activeTasks.length ? 'completed' : cancelledTasks.length && activeTasks.length === 0 ? 'skipped' : 'pending' },
        { id: 'sign-off', label: 'Job Completion', state: selectedJob?.status === 'Completed' ? 'completed' : selectedJob?.status === 'Blocked' ? 'blocked' : selectedJobCancelled ? 'skipped' : selectedJob ? 'current' : engJobs.length && engJobs.every(job => job.status === 'Completed') ? 'completed' : 'pending' }
      ];

      const percent = tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'jobs',
        currentSection: 'Engagement Delivery & Task Hierarchy',
        steps,
        percentComplete: percent,
        counts: {
          completed: completedTasks.length,
          pending: openTasks.length,
          blocked: blockedTasks.length,
          total: tasks.length
        },
        completedSummary: `${completedTasks.length} of ${activeTasks.length} active task(s) completed across ${engJobs.length} selected job(s); ${cancelledTasks.length} cancelled task(s) remain terminal history.`,
        pendingSummary: `${openTasks.length} task(s) in progress or awaiting start.`,
        blockedSummary: blockedTasks.length ? `${blockedTasks.length} task(s) marked as Blocked.` : undefined,
        blockers: blockedTasks.map(t => `Task ${t.id} (${t.title}): ${t.blockedReason || 'Blocked waiting on input'}`),
        nextAction: blockedTasks.length ? `Resolve blocker on task ${blockedTasks[0].id}` : openTasks.length ? `Progress task ${openTasks[0].id}` : selectedJobCancelled ? 'Review the cancelled job history' : selectedJob?.status === 'Completed' ? 'Review the completed job history' : selectedJob ? 'Add or assign a task to this job' : 'Select a permitted job to review its lifecycle',
        whoActsNext: blockedTasks[0]?.assignee || openTasks[0]?.assignee || selectedJob?.owner || 'Task Owner / Engagement Manager',
        selectedRecordId: selectedJob?.id || undefined,
        recordSummary: selectedJob ? `${selectedJob.title} · ${selectedJob.id} · ${selectedJob.status}; ${activeTasks.length} active task(s), ${completedTasks.length} complete, ${openTasks.length} open, ${blockedTasks.length} blocked, ${cancelledTasks.length} cancelled.` : `${engJobs.length} permitted job(s) for the selected engagement.`
      };
    }

    case 'job-templates': {
      const templates = state.jobTemplates || [];
      const published = templates.filter(t => t.status === 'Published');
      const drafts = templates.filter(t => t.status === 'Draft');
      const retired = templates.filter(t => t.status === 'Retired');
      const instantiatedTemplateIds = new Set(state.jobs.filter(job => job.engagementId && (allowedEngIds === 'ALL' || allowedEngIds.includes(job.engagementId))).map(job => job.fromTemplateId).filter((id): id is string => Boolean(id)));
      const validPublished = published.filter(template => template.tasks.length > 0 && template.tasks.every(task => task.title.trim()));

      const steps: WorkflowStep[] = [
        { id: 'authoring', label: 'Draft Authoring', state: drafts.length ? 'current' : templates.length ? 'completed' : 'pending' },
        { id: 'structure', label: 'Task Hierarchy', state: templates.some(template => template.tasks.length && template.tasks.every(task => task.title.trim())) ? 'completed' : templates.length ? 'current' : 'pending' },
        { id: 'publishing', label: 'Published Templates', state: validPublished.length ? 'completed' : drafts.length ? 'current' : 'pending' },
        { id: 'instantiation', label: 'Engagement Application', state: instantiatedTemplateIds.size ? 'completed' : validPublished.length ? 'current' : 'pending' },
        { id: 'versioning', label: 'Revision & Retirement History', state: retired.length ? 'completed' : templates.some(template => template.revision > 1) ? 'completed' : 'pending' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'job-templates',
        currentSection: 'Standardized Delivery Templates',
        steps,
        percentComplete: templates.length ? Math.round((published.length / templates.length) * 100) : 0,
        counts: {
          completed: published.length,
          pending: drafts.length,
          blocked: 0,
          total: templates.length
        },
        completedSummary: `${published.length} job template(s) published and available for application to engagements.`,
        pendingSummary: `${drafts.length} draft template(s) in authoring.`,
        blockers: [],
        nextAction: drafts.length ? 'Review and publish draft template' : 'Apply published template to an active engagement',
        whoActsNext: 'Practice Manager'
      };
    }

    case 'communications': {
      const comms = activeEng ? (state.communications || []).filter(item =>
        item.clientId === activeEng.client && (item.engagementId ? item.engagementId === activeEng.id : item.scopeKind === 'Client')
      ) : [];
      const linked = comms.filter(item => item.engagementId === activeEng?.id || item.scopeKind === 'Client' || Boolean(item.jobId && state.jobs.some(job => job.id === item.jobId && job.clientId === activeEng?.client && job.engagementId === activeEng?.id)));
      const outcomesRecorded = comms.filter(item => item.status).length;
      const steps: WorkflowStep[] = [
        { id: 'recipient', label: 'Contact & Participants', state: comms.length ? 'completed' : 'pending' },
        { id: 'channel', label: 'Communication Channel', state: comms.length ? 'completed' : 'pending' },
        { id: 'logging', label: 'Communication Record', state: comms.length ? 'completed' : 'current' },
        { id: 'outcome', label: 'Recorded Local Outcome', state: outcomesRecorded === comms.length && comms.length > 0 ? 'completed' : comms.length ? 'current' : 'pending' },
        { id: 'linked-records', label: 'Permitted Client / Engagement Link', state: linked.length === comms.length && comms.length > 0 ? 'completed' : comms.length ? 'current' : 'pending' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'communications',
        currentSection: 'Inter-Team & Client Communication Trail',
        steps,
        percentComplete: 0,
        counts: {
          completed: comms.length,
          pending: 0,
          blocked: 0,
          total: comms.length
        },
        completedSummary: `${comms.length} communication log(s) and simulated messages preserved with full attribution.`,
        pendingSummary: `${comms.length - outcomesRecorded} communication(s) have no recorded simulation or manual outcome.`,
        blockers: [],
        nextAction: 'Log communication note, client meeting record, or internal team collaboration',
        whoActsNext: 'Team Member / Preparer'
      };
    }

    case 'portal': {
      const portalClient = scopedClients.find(client => client.id === context.clientId);
      const portalEngagement = activeEng?.client === portalClient?.id ? activeEng : undefined;
      const pbc = portalEngagement?.pbc.filter(request => request.status !== 'Draft' && request.status !== 'Cancelled') || [];
      const returnedPbc = pbc.filter(p => p.status === 'Needs clarification');
      const pendingPbc = pbc.filter(p => p.status === 'Requested');
      const receivedPbc = pbc.filter(p => p.status === 'Received' || p.status === 'Under review');
      const acceptedPbc = pbc.filter(p => p.status === 'Accepted');
      const sharedDocs = portalClient && portalEngagement ? state.documents.filter(d => d.visibility === 'Client shared' && d.clientId === portalClient.id && (!d.engagementId || d.engagementId === portalEngagement.id)) : [];
      const issuedInvoices = portalClient && portalEngagement ? state.invoices.filter(i => i.clientId === portalClient.id && (i.engagementId || i.eng) === portalEngagement.id && (i.status === 'Issued' || i.status === 'Paid')) : [];
      const managementDecisionApplicable = Boolean(portalEngagement?.managementPresentation && portalEngagement.managementPresentation.generation === portalEngagement.generation && portalEngagement.managementPresentation.sourceVersion === portalEngagement.sourceVersion && portalEngagement.managementPresentation.packageRevision === portalEngagement.packageRevision);
      const managementDecisionCurrent = Boolean(managementDecisionApplicable && portalEngagement?.managementPackageDecision?.decision === 'Acknowledged' && portalEngagement.managementPackageDecision.generation === portalEngagement.generation && portalEngagement.managementPackageDecision.sourceVersion === portalEngagement.sourceVersion && portalEngagement.managementPackageDecision.packageRevision === portalEngagement.packageRevision);

      const steps: WorkflowStep[] = [
        { id: 'portal-context', label: 'Authorized Client Context', state: portalClient && portalEngagement ? 'completed' : 'pending', detail: `${portalClient?.id || 'No client'} · ${portalEngagement?.id || 'No engagement'}` },
        { id: 'pbc-requests', label: 'Information Requests', state: !pbc.length ? 'na' : returnedPbc.length ? 'returned' : pendingPbc.length || receivedPbc.length ? 'current' : acceptedPbc.length === pbc.length ? 'completed' : 'pending', detail: `${acceptedPbc.length} accepted of ${pbc.length} visible requests` },
        { id: 'clarifications', label: 'Clarifications', state: returnedPbc.length ? 'returned' : pbc.some(p => p.status === 'Received' || p.status === 'Under review') ? 'current' : pbc.length ? 'completed' : 'na', detail: returnedPbc.map(item => `${item.id}: ${item.clarificationNote || 'Replacement required'}`).join('; ') || 'No clarification is currently requested' },
        { id: 'documents', label: 'Shared Documents', state: sharedDocs.length ? 'completed' : 'na', detail: `${sharedDocs.length} documents visible to this client and engagement` },
        { id: 'invoices', label: 'Issued Invoices', state: issuedInvoices.length ? 'completed' : 'na', detail: `${issuedInvoices.length} issued or paid invoices visible to this client and engagement` },
        { id: 'management-decision', label: 'Management Package Decision', state: !managementDecisionApplicable ? 'na' : managementDecisionCurrent ? 'completed' : portalEngagement?.managementPackageDecision?.decision === 'Rejected' ? 'returned' : 'current', detail: managementDecisionApplicable ? `Package revision ${portalEngagement?.managementPresentation?.packageRevision}` : 'No current package is presented for decision' }
      ];

      const percent = pbc.length ? Math.round((acceptedPbc.length / pbc.length) * 100) : 100;

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'portal',
        currentSection: 'Client Secure Portal',
        steps,
        percentComplete: percent,
        counts: {
          completed: acceptedPbc.length,
          pending: pendingPbc.length + receivedPbc.length,
          blocked: 0,
          returned: returnedPbc.length,
          total: pbc.length
        },
        completedSummary: `${acceptedPbc.length} requested information item(s) accepted; ${sharedDocs.length} shared document(s) available.`,
        pendingSummary: `${pendingPbc.length} client request(s) require file upload; ${receivedPbc.length} under staff review.`,
        blockedSummary: returnedPbc.length > 0 ? `${returnedPbc.length} request(s) require clarification or re-upload.` : undefined,
        reworkNotes: returnedPbc.map(p => `${p.id}: Returned for clarification`),
        blockers: [],
        nextAction: returnedPbc.length ? 'Respond to staff clarification note and upload revised PBC document' : pendingPbc.length ? 'Upload requested file for outstanding PBC items' : !portalEngagement ? 'Select an engagement assigned to this client' : managementDecisionApplicable && !managementDecisionCurrent ? 'Review the current package and record the management decision' : 'Review shared documents or issued invoices',
        whoActsNext: returnedPbc.length || pendingPbc.length ? 'Client Finance Contributor' : 'Client Administrator'
      };
    }

    case 'documents': {
      const pbc = activeEng?.pbc || [];
      const returnedPbc = pbc.filter(p => p.status === 'Needs clarification');
      const underReviewPbc = pbc.filter(p => p.status === 'Received' || p.status === 'Under review');
      const acceptedPbc = pbc.filter(p => p.status === 'Accepted');
      const draftPbc = pbc.filter(p => p.status === 'Draft');

      const inScopeDocs = state.documents.filter(document => document.clientId === activeEng?.client && (!document.engagementId || document.engagementId === activeEng?.id));
      const steps: WorkflowStep[] = [
        { id: 'draft-pbc', label: 'Draft Request', state: draftPbc.length ? 'current' : 'completed' },
        { id: 'requested-pbc', label: 'Requested from Client', state: pbc.some(p => p.status === 'Requested') ? 'current' : pbc.some(p => !['Draft', 'Cancelled'].includes(p.status)) ? 'completed' : 'pending' },
        { id: 'received-review', label: 'Received & Review', state: returnedPbc.length ? 'returned' : underReviewPbc.length ? 'current' : 'pending' },
        { id: 'evidence-acceptance', label: 'Accepted as Evidence', state: acceptedPbc.length ? 'completed' : 'pending' },
        { id: 'browser-storage', label: 'Browser-Local Record', state: inScopeDocs.length || acceptedPbc.some(request => request.file) ? 'completed' : 'pending', detail: 'Document originals and request records remain in local prototype storage.' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'documents',
        currentSection: 'Document Management & Client PBC Requests',
        steps,
        percentComplete: 0,
        counts: {
          completed: acceptedPbc.length,
          pending: underReviewPbc.length + draftPbc.length,
          blocked: 0,
          total: pbc.length,
          returned: returnedPbc.length
        },
        completedSummary: `${acceptedPbc.length} PBC response(s) accepted with verifiable file hashes.`,
        pendingSummary: `${underReviewPbc.length} response(s) under review, ${draftPbc.length} request(s) in draft.`,
        blockedSummary: returnedPbc.length ? `${returnedPbc.length} response(s) flagged for clarification/rework.` : undefined,
        blockers: returnedPbc.map(p => `${p.id}: Clarification requested - ${p.clarificationNote || 'Replacement file required'}`),
        nextAction: underReviewPbc.length ? 'Review and accept uploaded PBC response' : draftPbc.length ? 'Present draft PBC request to client' : 'Register document or manage folder structure',
        whoActsNext: underReviewPbc.length ? 'Assigned Reviewer' : 'Preparer / Manager'
      };
    }

    case 'my-time': {
      const timeEntries = (state.times || []).filter(t => t.engagementId === activeEng?.id && (allowedClientIds === 'ALL' || allowedClientIds.includes(t.clientId)));
      const userEntries = timeEntries.filter(t => t.person === state.currentPerson && t.status !== 'Superseded');
      const approved = userEntries.filter(t => t.status === 'Approved');
      const submitted = userEntries.filter(t => t.status === 'Submitted');
      const returned = userEntries.filter(t => t.status === 'Returned');
      const drafts = userEntries.filter(t => t.status === 'Draft');
      const jobs = state.jobs.filter(job => job.engagementId === activeEng?.id);
      const visibleJobIds = new Set(jobs.map(job => job.id));
      const taskIds = new Set(state.jobTasks.filter(task => visibleJobIds.has(task.jobId)).map(task => task.id));
      const codedEntries = userEntries.filter(entry => Boolean(entry.jobId && entry.taskId && visibleJobIds.has(entry.jobId) && taskIds.has(entry.taskId)));

      const steps: WorkflowStep[] = [
        { id: 'entry', label: 'Time Entry', state: drafts.length ? 'current' : userEntries.length ? 'completed' : 'pending' },
        { id: 'job-coding', label: 'Job & Task Coding', state: codedEntries.length === userEntries.length && userEntries.length > 0 ? 'completed' : userEntries.length ? 'current' : 'pending' },
        { id: 'submission', label: 'Submitted for Review', state: returned.length ? 'returned' : submitted.length ? 'current' : 'pending' },
        { id: 'manager-approval', label: 'Manager Approved', state: approved.length ? 'completed' : 'pending' },
        { id: 'billing-allocation', label: 'Available for Billing', state: approved.length ? 'completed' : 'pending', targetRoute: 'billing' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'my-time',
        currentSection: 'Staff Time Registration & Timesheet Review',
        steps,
        percentComplete: 0,
        counts: {
          completed: approved.length,
          pending: submitted.length + drafts.length,
          blocked: 0,
          total: userEntries.length,
          returned: returned.length
        },
        completedSummary: `${approved.length} time entry(ies) approved and locked for billing pool.`,
        pendingSummary: `${submitted.length} submitted awaiting manager review; ${drafts.length} in draft.`,
        blockedSummary: returned.length ? `${returned.length} entry(ies) returned with reviewer notes.` : undefined,
        blockers: returned.map(t => `${t.id}: Returned - ${t.returnReason || 'Revise hours and resubmit'}`),
        nextAction: returned.length ? `Resubmit returned time entry ${returned[0].id}` : submitted.length ? 'Awaiting independent manager review' : 'Record time against assigned task',
        whoActsNext: returned.length ? 'Time Entry Owner' : submitted.length ? 'Engagement Manager' : 'Staff Member'
      };
    }

    case 'budgets': {
      const budget = (state.budgets || []).filter(b => b.engagementId === activeEng?.id).sort((a, b) => b.version - a.version)[0];
      const actualEntries = (state.times || []).filter(entry => entry.engagementId === activeEng?.id && entry.status === 'Approved');
      const plannedMinutes = budget?.lines.reduce((total, line) => total + line.plannedMinutes, 0) || 0;
      const actualMinutes = actualEntries.reduce((total, entry) => total + entry.durationMinutes, 0);
      const hasActuals = actualEntries.length > 0;
      const steps: WorkflowStep[] = [
        { id: 'hours-budget', label: 'Approved Hours & Rates Plan', state: budget?.status === 'Approved' && plannedMinutes > 0 ? 'completed' : budget ? 'current' : 'pending' },
        { id: 'actual-capture', label: 'Approved Actual Time', state: hasActuals ? 'completed' : 'pending', targetRoute: 'my-time', detail: `${actualEntries.length} approved time entries` },
        { id: 'variance-analysis', label: 'Planned vs Actual Hours', state: budget && hasActuals ? 'completed' : 'pending', detail: `${plannedMinutes} planned minutes · ${actualMinutes} approved actual minutes` },
        { id: 'margin-review', label: 'Fee Recovery Inputs', state: budget && hasActuals && activeEng && activeEng.agreedFee > 0 ? 'completed' : 'pending' },
        { id: 'revision', label: 'Budget Revision History', state: budget && (budget.history?.length || 0) > 0 ? 'completed' : 'pending' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'budgets',
        currentSection: 'Engagement Budget & Recovery Analysis',
        steps,
        percentComplete: 0,
        counts: {
          completed: 0,
          pending: 0,
          blocked: 0,
          total: 1
        },
        completedSummary: budget ? `Budget v${budget.version} configured with rate snapshot.` : 'Default baseline rates active.',
        pendingSummary: 'Monitoring actual hours vs planned allocation in real time.',
        blockers: [],
        nextAction: 'Review fee recovery percentage and labor variance by role',
        whoActsNext: 'Engagement Manager'
      };
    }

    case 'billing': {
      const invoices = scopedInvoices(state);
      const paid = invoices.filter(i => i.status === 'Paid');
      const issued = invoices.filter(i => i.status === 'Issued');
      const approved = invoices.filter(i => i.status === 'Approved');
      const draft = invoices.filter(i => i.status === 'Draft');
      const inReview = invoices.filter(i => i.status === 'In review');
      const cancelled = invoices.filter(i => i.status === 'Cancelled');
      const approvedTime = (state.times || []).filter(entry => (allowedClientIds === 'ALL' || allowedClientIds.includes(entry.clientId)) && (allowedEngIds === 'ALL' || allowedEngIds.includes(entry.engagementId)) && entry.status === 'Approved' && !entry.billedInvoiceId);
      const sourceAvailable = approvedTime.length > 0 || invoices.some(invoice => invoice.lines.some(line => line.sourceType === 'Fixed service' || line.sourceType === 'Time entry'));
      const activeInvoices = invoices.filter(invoice => invoice.status !== 'Cancelled');

      const steps: WorkflowStep[] = [
        { id: 'time-billing-source', label: 'Approved Time or Fee Source', state: sourceAvailable ? 'completed' : 'pending', targetRoute: 'my-time' },
        { id: 'invoice-draft', label: 'Invoice Draft', state: draft.length ? 'current' : activeInvoices.length ? 'completed' : 'pending' },
        { id: 'independent-review', label: 'Independent Review', state: inReview.length ? 'current' : approved.length || issued.length || paid.length ? 'completed' : draft.length ? 'pending' : 'pending' },
        { id: 'issue-record', label: 'Invoice Issue', state: issued.length || paid.length ? 'completed' : approved.length ? 'current' : 'pending' },
        { id: 'receipt-settlement', label: 'Settlement & Receipts', state: paid.length ? 'completed' : issued.length ? 'current' : 'pending', targetRoute: 'receivables' }
      ];

        const percent = 0;

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'billing',
        currentSection: 'Invoicing & Fee Realization Register',
        steps,
        percentComplete: percent,
        counts: {
          completed: paid.length + issued.length,
          pending: approved.length + draft.length + inReview.length,
          blocked: cancelled.length,
          total: invoices.length
        },
        completedSummary: `${issued.length} invoice(s) issued; ${paid.length} fully settled.`,
        pendingSummary: `${draft.length} draft, ${inReview.length} in review, and ${approved.length} approved invoice(s) awaiting issue.`,
        blockedSummary: cancelled.length ? `${cancelled.length} invoice(s) cancelled with unreserved time.` : undefined,
        blockers: cancelled.map(i => `Invoice ${i.invoiceNumber || i.id} was cancelled.`),
        nextAction: approved.length ? `Issue approved invoice ${approved[0].invoiceNumber || approved[0].id}` : draft.length ? 'Submit or approve draft invoice (SoD required)' : 'Draft invoice from approved time',
        whoActsNext: approved.length ? 'Billing Specialist / Partner' : 'Independent Reviewer'
      };
    }

    case 'receivables': {
      const invoices = scopedInvoices(state).filter(i => i.status === 'Issued' || i.status === 'Paid');
      const outstanding = invoices.filter(i => i.status === 'Issued');
      const invoiceIds = new Set(invoices.map(invoice => invoice.id));
      const receipts = (state.receipts || []).filter(receipt =>
        (allowedClientIds === 'ALL' || allowedClientIds.includes(receipt.clientId)) &&
        (activeEng ? invoices.some(invoice => invoice.clientId === receipt.clientId && (invoice.engagementId || invoice.eng) === activeEng.id) : true) &&
        receipt.allocations.some(allocation => invoiceIds.has(allocation.invoiceId))
      );
      const allocationsComplete = receipts.length > 0 && receipts.every(receipt => receipt.allocations.filter(allocation => !allocation.reversed && invoiceIds.has(allocation.invoiceId)).reduce((sum, allocation) => sum + allocation.amount, 0) >= receipt.allocatedAmount);
      const scenarioDate = new Date(`${state.asOfDate}T00:00:00`);
      const overdue = outstanding.filter(invoice => new Date(`${invoice.due}T00:00:00`) < scenarioDate);

      const steps: WorkflowStep[] = [
        { id: 'receivable-ledger', label: 'Issued Invoices', state: invoices.length ? 'completed' : 'pending', targetRoute: 'billing' },
        { id: 'aging-categorization', label: 'Scenario-Date Aging', state: invoices.length ? 'completed' : 'pending', detail: `${overdue.length} issued invoice(s) overdue as of ${state.asOfDate}` },
        { id: 'receipt-intake', label: 'Offline Receipt Records', state: receipts.length ? 'completed' : outstanding.length ? 'current' : 'pending' },
        { id: 'split-allocation', label: 'Invoice Allocations', state: allocationsComplete ? 'completed' : receipts.length ? 'current' : outstanding.length ? 'pending' : 'pending' },
        { id: 'reconciliation', label: 'Settled Accounts', state: outstanding.length === 0 && invoices.length > 0 ? 'completed' : 'current' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'receivables',
        currentSection: 'Accounts Receivable & Cash Allocation',
        steps,
        percentComplete: 0,
        counts: {
          completed: invoices.length - outstanding.length,
          pending: outstanding.length,
          blocked: 0,
          total: invoices.length
        },
        completedSummary: `${invoices.length - outstanding.length} invoice(s) fully settled via allocated receipts.`,
        pendingSummary: `${outstanding.length} invoice(s) outstanding across aging categories.`,
        blockers: [],
        nextAction: outstanding.length ? 'Record offline payment receipt and allocate to outstanding invoices' : 'All issued invoices reconciled',
        whoActsNext: 'Billing / Finance Team'
      };
    }

    case 'reports': {
      const steps: WorkflowStep[] = [
        { id: 'catalogue', label: 'Report Catalogue', state: 'completed' },
        { id: 'scoping', label: 'Scope & Parameters', state: 'current' },
        { id: 'aggregation', label: 'Record Aggregation', state: 'completed' },
        { id: 'export-csv', label: 'CSV Export', state: 'current' },
        { id: 'print-preview', label: 'Print & Audit Trail', state: 'current' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'reports',
        currentSection: 'Practice Operational & Financial Reports',
        steps,
        percentComplete: 85,
        counts: {
          completed: 16,
          pending: 0,
          blocked: 0,
          total: 16
        },
        completedSummary: '16 practice and engagement reports available with deterministic real-record binding.',
        pendingSummary: 'Reports update dynamically based on active filter parameters.',
        blockers: [],
        nextAction: 'Select a report, filter by client/engagement, and export or print',
        whoActsNext: 'Partner / Manager / Billing'
      };
    }

    case 'm365-setup': {
      const config = state.m365Config;
      const verifs = config?.verificationResults || {};
      const idOk = verifs.identity?.outcome === 'success';
      const spOk = verifs.sharepoint?.outcome === 'success';
      const mailOk = verifs.mail?.outcome === 'success';

      const steps: WorkflowStep[] = [
        { id: 'tenant-id', label: 'Synthetic Tenant', state: config?.tenantId ? 'completed' : 'current' },
        { id: 'identity-mapping', label: 'Identity Simulation', state: idOk ? 'completed' : 'current' },
        { id: 'sharepoint', label: 'SharePoint Library', state: spOk ? 'completed' : 'pending' },
        { id: 'mail-simulation', label: 'Mail Simulation', state: mailOk ? 'completed' : 'pending' },
        { id: 'freeze', label: 'Configuration Status', state: config?.status === 'Simulated verified' ? 'completed' : 'current' }
      ];

      const okCount = [idOk, spOk, mailOk].filter(Boolean).length;

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'm365-setup',
        currentSection: 'Simulated Microsoft 365 Environment',
        steps,
        percentComplete: Math.round((okCount / 3) * 100),
        counts: {
          completed: okCount,
          pending: 3 - okCount,
          blocked: 0,
          total: 3
        },
        completedSummary: `${okCount} of 3 simulated capabilities verified. liveConnected remains strictly false.`,
        pendingSummary: `${3 - okCount} simulated test(s) outstanding.`,
        blockers: [],
        nextAction: 'Execute capability verification tests in simulated environment',
        whoActsNext: 'Firm Administrator'
      };
    }

    case 'administration':
    case 'services': {
      const users = state.users || [];
      const invites = state.simulatedInvitations || [];
      const pendingInvites = invites.filter(i => i.status === 'Pending');
      const activeUsers = users.filter(u => u.status === 'Active');
      const currentGrants = state.roleGrants.filter(grant => (!grant.effectiveFrom || grant.effectiveFrom <= state.asOfDate) && (!grant.expiresAt || grant.expiresAt >= state.asOfDate));
      const settings = state.firmSettings;
      const firmSettingsComplete = Boolean(settings.firmName.trim() && settings.firmLegalName.trim() && settings.jurisdiction.trim() && settings.currency.trim() && settings.timezone.trim() && settings.invoiceNumberPrefix.trim() && settings.creditNumberPrefix.trim() && settings.locale.trim());
      const accessEvents = state.roleGrantHistory || [];

      const steps: WorkflowStep[] = [
        { id: 'user-dir', label: 'Active User Directory', state: activeUsers.length ? 'completed' : 'pending', detail: `${activeUsers.length} active of ${users.length} identities` },
        { id: 'role-grants', label: 'Current Role & Scope Grants', state: currentGrants.length ? 'completed' : 'pending', detail: `${currentGrants.length} effective grant(s) as of ${state.asOfDate}` },
        { id: 'invitations', label: 'Simulated Invitations', state: pendingInvites.length ? 'current' : invites.length ? 'completed' : 'pending' },
        { id: 'firm-settings', label: 'Firm Parameters', state: firmSettingsComplete ? 'completed' : 'current' },
        { id: 'access-audit', label: 'Grant Change History', state: accessEvents.length ? 'completed' : 'pending', detail: `${accessEvents.length} attributable grant history event(s)` }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'administration',
        currentSection: 'User Directory, Role Grants & Firm Settings',
        steps,
        percentComplete: 0,
        counts: {
          completed: activeUsers.length,
          pending: pendingInvites.length,
          blocked: 0,
          total: users.length
        },
        completedSummary: `${activeUsers.length} active user identity(ies), ${currentGrants.length} effective role grants, and ${accessEvents.length} grant history event(s).`,
        pendingSummary: `${pendingInvites.length} simulated invitation(s) pending acceptance; firm parameters ${firmSettingsComplete ? 'saved' : 'need completion'}.`,
        blockers: [],
        nextAction: 'Manage user roles, grant engagement scopes, or configure practice defaults',
        whoActsNext: 'Firm Administrator'
      };
    }

    case 'accounting-setup': {
      const client = scopedClients.find(item => item.id === activeEng?.client);
      const profile = client?.accountingProfile;
      const profileSaved = Boolean(profile?.revision && profile.legalEntityName.trim() && profile.reportingBasis !== 'Not selected' && /^[A-Z]{3}$/.test(profile.baseCurrency));
      const periodBook = profile?.periodBooks.find(book => book.id === activeEng?.accountingPeriodBookId && book.ownerEngagementId === activeEng?.id);
      const activeAccounts = profile?.accounts.filter(account => account.active && account.posting) || [];
      const steps: WorkflowStep[] = [
        { id: 'accounting-profile', label: 'Entity & Reporting Profile', state: profileSaved ? 'completed' : 'current', detail: profileSaved ? `Profile revision ${profile?.revision}` : 'Save a legal entity, reporting basis and currency.' },
        { id: 'period-book', label: 'Engagement Period & Book', state: periodBook ? 'completed' : profileSaved ? 'current' : 'pending', detail: periodBook?.name || 'Select a period book owned by this engagement.' },
        { id: 'chart-of-accounts', label: 'Active Posting Accounts', state: activeAccounts.length ? 'completed' : profileSaved ? 'current' : 'pending', detail: `${activeAccounts.length} active posting account(s)` }
      ];
      return {
        moduleId: routeInfo.moduleId, moduleName: routeInfo.label, route, currentSection: 'Client Accounting Setup', steps, percentComplete: 0,
        counts: { completed: 0, pending: 0, blocked: 0, total: steps.length },
        completedSummary: profileSaved ? `Saved accounting profile revision ${profile?.revision}.` : 'Accounting setup has not been saved with a complete reporting profile.',
        pendingSummary: !periodBook ? 'Choose and save the period book for this engagement.' : !activeAccounts.length ? 'Add and save active posting accounts before importing a trial balance.' : 'Accounting context is available for this engagement.',
        blockers: [], nextAction: !profileSaved ? 'Complete and save the entity reporting profile' : !periodBook ? 'Select this engagement’s period book' : !activeAccounts.length ? 'Add active chart of accounts' : 'Continue to Trial Balance',
        whoActsNext: 'Accounting Preparer'
      };
    }

    case 'trial-balance': {
      const sourceExists = Boolean(activeEng?.sourceVersion && activeEng.rows.length);
      const accepted = Boolean(activeEng?.sourceAccepted && sourceExists);
      const steps: WorkflowStep[] = [
        { id: 'tb-import', label: 'Trial Balance Source', state: sourceExists ? 'completed' : 'current', detail: sourceExists ? `Source v${activeEng?.sourceVersion} · ${activeEng?.rows.length} account rows` : 'Import or enter a source for the selected engagement.' },
        { id: 'tb-acceptance', label: 'Source Review & Acceptance', state: accepted ? 'completed' : sourceExists ? 'current' : 'pending', detail: accepted ? 'Current source accepted.' : 'Review and accept the current source before downstream work.' },
        { id: 'tb-mapping', label: 'Statement Mapping', state: activeEng?.mappingApproved ? 'completed' : sourceExists ? 'current' : 'pending', targetRoute: 'account-mappings' }
      ];
      return {
        moduleId: routeInfo.moduleId, moduleName: routeInfo.label, route, currentSection: 'Trial Balance', steps, percentComplete: 0,
        counts: { completed: 0, pending: 0, blocked: 0, total: steps.length },
        completedSummary: sourceExists ? `Current trial-balance source v${activeEng?.sourceVersion} contains ${activeEng?.rows.length} row(s).` : 'No trial-balance source is recorded for this engagement.',
        pendingSummary: !sourceExists ? 'Import or enter a trial balance.' : !accepted ? 'Review and accept the current trial-balance source.' : !activeEng?.mappingApproved ? 'Complete current account mappings.' : 'Current trial balance and mapping are accepted.',
        blockers: [], nextAction: !sourceExists ? 'Import trial balance' : !accepted ? 'Review and accept source' : !activeEng?.mappingApproved ? 'Review account mappings' : 'Open General Ledger',
        whoActsNext: !accepted ? 'Engagement Preparer / Manager' : 'Accounting Preparer'
      };
    }

    case 'gl-transactions': {
      const latestGL = activeEng?.glSourceHistory?.at(-1);
      const transactions = (state.glTransactions || []).filter(item => item.engagementId === activeEng?.id);
      const sourceCurrent = Boolean(latestGL && activeEng?.sourceVersion && latestGL.transactions.length >= 0);
      const transactionCount = latestGL?.transactions.length ?? transactions.length;
      const hasIntegrityDigest = Boolean(latestGL?.sha256 && /^[0-9a-f]{64}$/i.test(latestGL.sha256));
      const steps: WorkflowStep[] = [
        { id: 'gl-source', label: 'GL Source Revision', state: sourceCurrent ? 'completed' : 'current', detail: latestGL ? `${latestGL.fileName} · revision ${latestGL.revision}` : 'No GL import revision is recorded.' },
        { id: 'gl-transactions', label: 'Imported Transactions', state: transactionCount > 0 ? 'completed' : latestGL ? 'blocked' : 'pending', detail: `${transactionCount} transaction(s) in the selected engagement source` },
        { id: 'gl-integrity', label: 'Source Integrity Digest', state: hasIntegrityDigest ? 'completed' : latestGL ? 'pending' : 'pending', detail: hasIntegrityDigest ? 'SHA-256 digest recorded.' : 'A source digest is not recorded for this revision.' }
      ];
      return {
        moduleId: routeInfo.moduleId, moduleName: routeInfo.label, route, currentSection: 'General Ledger Transactions', steps, percentComplete: 0,
        counts: { completed: 0, pending: 0, blocked: 0, total: steps.length },
        completedSummary: latestGL ? `GL source revision ${latestGL.revision} is recorded for this engagement.` : 'No GL source revision is recorded.',
        pendingSummary: transactionCount ? (hasIntegrityDigest ? 'Imported transaction source is available for review.' : 'Review the source integrity details before relying on this import.') : 'Import a GL source containing transactions.',
        blockers: transactionCount === 0 && latestGL ? ['The current GL revision contains no transactions. Re-import or correct the source file.'] : [],
        nextAction: !latestGL ? 'Import a GL source' : !transactionCount ? 'Correct or replace the empty GL source' : 'Review transaction completeness and account mapping',
        whoActsNext: 'Accounting Preparer'
      };
    }

    case 'account-mappings': {
      const mappingHistory = (state.accountMappingRevisions || []).filter(item => item.engagementId === activeEng?.id).sort((a, b) => b.revision - a.revision);
      const latestMapping = mappingHistory[0];
      const accountCodes = new Set(activeEng?.rows.map(row => row.code) || []);
      const mappedCodes = new Set(latestMapping?.mappings.filter(mapping => mapping.targets.length > 0 && mapping.targets.reduce((total, target) => total + target.percentage, 0) === 100).map(mapping => mapping.accountCode) || []);
      const unmapped = [...accountCodes].filter(code => !mappedCodes.has(code));
      const approvedCurrent = Boolean(activeEng?.mappingApproved && latestMapping?.status === 'Approved' && unmapped.length === 0);
      const steps: WorkflowStep[] = [
        { id: 'mapping-coverage', label: 'Current Account Coverage', state: accountCodes.size === 0 ? 'pending' : unmapped.length ? 'current' : 'completed', detail: `${mappedCodes.size} of ${accountCodes.size} trial-balance accounts mapped` },
        { id: 'mapping-review', label: 'Independent Mapping Approval', state: approvedCurrent ? 'completed' : latestMapping?.status === 'Draft' ? 'current' : 'pending', detail: latestMapping ? `Mapping revision ${latestMapping.revision} · ${latestMapping.status}` : 'No mapping revision is recorded.' },
        { id: 'mapping-statements', label: 'Statement Preparation', state: approvedCurrent ? 'current' : 'pending', targetRoute: 'financial-statements' }
      ];
      return {
        moduleId: routeInfo.moduleId, moduleName: routeInfo.label, route, currentSection: 'Account Mapping', steps, percentComplete: 0,
        counts: { completed: 0, pending: 0, blocked: 0, total: steps.length },
        completedSummary: approvedCurrent ? `Mapping revision ${latestMapping?.revision} is approved across all ${accountCodes.size} current TB accounts.` : `${mappedCodes.size} current TB account(s) have complete mapping targets.`,
        pendingSummary: accountCodes.size === 0 ? 'Load the current trial balance before preparing mappings.' : unmapped.length ? `${unmapped.length} account(s) need complete 100% statement-line allocations.` : 'Submit the current mapping revision for independent approval.',
        blockers: [], nextAction: accountCodes.size === 0 ? 'Open Trial Balance and load source rows' : unmapped.length ? 'Complete unmapped or incomplete account allocations' : !approvedCurrent ? 'Submit current mapping for independent approval' : 'Prepare financial statements',
        whoActsNext: approvedCurrent ? 'Accounting Preparer' : 'Independent Accounting Reviewer'
      };
    }

    case 'adjustments': {
      const journals: AdjustmentJournalItem[] = (state.adjustmentJournals || []).filter(item => item.engagementId === activeEng?.id);
      const rejected = journals.filter(item => item.status === 'Rejected');
      const drafts = journals.filter(item => item.status === 'Draft');
      const technical = journals.filter(item => item.status === 'Technical review');
      const accepted = journals.filter(item => item.status === 'Management accepted' || item.status === 'Reporting included');
      const staleReflection = accepted.filter(item => item.reflectionStatus !== 'Reflected in TB' || item.reflectionSourceVersion !== activeEng?.sourceVersion);
      const steps: WorkflowStep[] = [
        { id: 'journal-draft', label: 'Adjustment Journal Drafts', state: drafts.length ? 'current' : journals.length ? 'completed' : 'pending', detail: `${journals.length} journal(s), ${drafts.length} draft(s)` },
        { id: 'journal-review', label: 'Technical Review', state: rejected.length ? 'returned' : technical.length ? 'current' : journals.length ? 'completed' : 'pending', detail: `${technical.length} awaiting independent review` },
        { id: 'journal-acceptance', label: 'Management Decision', state: rejected.length ? 'returned' : accepted.length ? 'completed' : 'pending', detail: `${accepted.length} accepted or included` },
        { id: 'journal-reflection', label: 'Current TB Reflection', state: staleReflection.length ? 'stale' : accepted.length ? 'completed' : 'pending', detail: `${staleReflection.length} accepted journal(s) need current source reflection` }
      ];
      return {
        moduleId: routeInfo.moduleId, moduleName: routeInfo.label, route, currentSection: 'Adjustment Journals', steps, percentComplete: 0,
        counts: { completed: 0, pending: 0, blocked: 0, total: steps.length },
        completedSummary: `${accepted.length} journal(s) have reached management acceptance or reporting inclusion.`,
        pendingSummary: `${drafts.length} draft(s), ${technical.length} in technical review, ${staleReflection.length} reflection(s) needing current-source confirmation.`,
        blockers: rejected.map(item => `Journal ${item.id} was rejected: ${item.reviewNote || 'reviewer correction is required.'}`),
        nextAction: rejected.length ? `Amend rejected journal ${rejected[0].id}` : drafts.length ? `Submit draft journal ${drafts[0].id} for technical review` : technical.length ? `Complete independent review of journal ${technical[0].id}` : staleReflection.length ? `Confirm journal reflection against TB v${activeEng?.sourceVersion}` : 'Create a supported adjustment if required, or continue to Reconciliations',
        whoActsNext: rejected.length || staleReflection.length ? 'Assigned Preparer' : technical.length ? 'Independent Accounting Reviewer' : 'Accounting Preparer'
      };
    }

    case 'reconciliations': {
      const schedules = (activeEng?.reconciliations || []).filter(item => item.engagementId === activeEng?.id || !item.engagementId);
      const stale = schedules.filter(item => item.status === 'Stale' || item.sourceVersion !== undefined && item.sourceVersion !== activeEng?.sourceVersion);
      const returned = schedules.filter(item => item.status === 'Returned');
      const inReview = schedules.filter(item => item.status === 'In Review');
      const drafts = schedules.filter(item => item.status === 'Draft' || item.status === 'In progress' || item.status === 'Differences noted');
      const cleared = schedules.filter(item => item.status === 'Approved' || item.status === 'Cleared');
      const steps: WorkflowStep[] = [
        { id: 'rec-schedule', label: 'Reconciliation Schedules', state: schedules.length ? 'completed' : 'current', detail: `${schedules.length} schedule(s) in the selected engagement` },
        { id: 'rec-current-source', label: 'Current TB Source', state: stale.length ? 'stale' : schedules.length && activeEng?.sourceVersion ? 'completed' : 'pending', detail: stale.length ? `${stale.length} schedule(s) reference an older TB source.` : `TB source v${activeEng?.sourceVersion || 0}` },
        { id: 'rec-review', label: 'Independent Review', state: returned.length ? 'returned' : inReview.length ? 'current' : drafts.length ? 'pending' : cleared.length ? 'completed' : 'pending', detail: `${cleared.length} approved or cleared` }
      ];
      return {
        moduleId: routeInfo.moduleId, moduleName: routeInfo.label, route, currentSection: 'Reconciliations', steps, percentComplete: 0,
        counts: { completed: 0, pending: 0, blocked: 0, total: steps.length },
        completedSummary: `${cleared.length} schedule(s) approved or cleared against the current engagement source.`,
        pendingSummary: `${drafts.length} draft/in-progress, ${inReview.length} awaiting independent review, ${stale.length} stale.`,
        blockers: [...stale.map(item => `Reconciliation ${item.ref} uses an older trial-balance source; reload and resubmit.`), ...returned.map(item => `Reconciliation ${item.ref} returned: ${item.reviewNote || 'address reviewer notes.'}`)],
        nextAction: stale.length ? `Refresh reconciliation ${stale[0].ref} against TB v${activeEng?.sourceVersion}` : returned.length ? `Revise returned reconciliation ${returned[0].ref}` : drafts.length ? `Submit reconciliation ${drafts[0].ref} for review` : inReview.length ? `Review reconciliation ${inReview[0].ref}` : schedules.length ? 'Review reconciliations or continue to financial statements' : 'Create a reconciliation for an account requiring support',
        whoActsNext: returned.length || stale.length || drafts.length ? 'Accounting Preparer' : inReview.length ? 'Independent Accounting Reviewer' : 'Accounting Preparer / Manager'
      };
    }

    case 'financial-statements': {
      const mappingRevision = Math.max(0, ...(state.accountMappingRevisions || []).filter(item => item.engagementId === activeEng?.id).map(item => item.revision));
      const mapping = (state.accountMappingRevisions || []).filter(item => item.engagementId === activeEng?.id).sort((a, b) => b.revision - a.revision)[0];
      const latestLayout = (state.statementLayoutRevisions || []).filter(item => item.engagementId === activeEng?.id).sort((a, b) => b.revision - a.revision)[0];
      const latestStatement = (state.statementSetRevisions || []).filter(item => item.engagementId === activeEng?.id).sort((a, b) => b.revision - a.revision)[0];
      const latestCashFlow = (activeEng?.cashFlowScheduleHistory || []).slice().sort((a, b) => b.revision - a.revision)[0];
      const sourceAndMappingReady = Boolean(activeEng?.sourceAccepted && activeEng.mappingApproved && mapping?.status === 'Approved' && mapping.revision === mappingRevision);
      const layoutCurrent = Boolean(sourceAndMappingReady && latestLayout && latestLayout.sourceVersion === activeEng?.sourceVersion && latestLayout.mappingRevision === mappingRevision);
      const statementCurrent = Boolean(sourceAndMappingReady && latestStatement && latestStatement.sourceVersion === activeEng?.sourceVersion && latestStatement.mappingRevision === mappingRevision && latestStatement.status !== 'Stale');
      const cashFlowCurrent = Boolean(latestCashFlow && latestCashFlow.sourceVersion === activeEng?.sourceVersion && latestCashFlow.mappingRevision === mappingRevision && latestCashFlow.status !== 'Stale');
      const disclosureHistory = activeEng?.disclosureHistory || [];
      const disclosureReviewComplete = disclosureHistory.length > 0 && disclosureHistory.every(record => record.status === 'Reviewed' && (record.applicability === 'Not applicable' ? Boolean(record.rationale?.trim()) : Boolean(record.text.trim())));
      const packageCurrent = (activeEng?.packageHistory || []).some(pkg => pkg.sourceVersion === activeEng?.sourceVersion && pkg.mappingRevision === mappingRevision && pkg.validation.passed);
      const steps: WorkflowStep[] = [
        { id: 'mapping-source', label: 'Accepted Source & Current Mapping', state: sourceAndMappingReady ? 'completed' : activeEng?.sourceVersion ? 'current' : 'blocked', detail: `TB source v${activeEng?.sourceVersion || 0} · mapping revision ${mappingRevision}`, targetRoute: 'account-mappings' },
        { id: 'statement-layout', label: 'Current Statement Layout', state: layoutCurrent ? 'completed' : latestLayout && latestLayout.sourceVersion !== activeEng?.sourceVersion ? 'stale' : sourceAndMappingReady ? 'current' : 'pending' },
        { id: 'statement-set', label: 'Statement Set Review', state: statementCurrent ? latestStatement?.status === 'Reviewed' ? 'completed' : 'current' : latestStatement?.status === 'Stale' ? 'stale' : sourceAndMappingReady ? 'current' : 'pending' },
        { id: 'schedules', label: 'Current Cash Flow Schedule', state: cashFlowCurrent ? latestCashFlow?.status === 'Reviewed' ? 'completed' : 'current' : latestCashFlow?.status === 'Stale' ? 'stale' : 'pending' },
        { id: 'notes', label: 'Disclosure Review', state: disclosureReviewComplete ? 'completed' : disclosureHistory.length ? 'current' : 'pending' },
        { id: 'package-ready', label: 'Current Validated Package', state: packageCurrent ? 'completed' : 'pending', targetRoute: 'financial-packages' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'financial-statements',
        currentSection: 'Statement Set & Supporting Schedules',
        steps,
        percentComplete: 0,
        counts: {
          completed: 0,
          pending: 0,
          blocked: 0,
          total: steps.length
        },
        completedSummary: `Current evidence: layout ${layoutCurrent ? 'available' : 'missing or stale'}, statement set ${statementCurrent ? 'available' : 'missing or stale'}, cash flow ${cashFlowCurrent ? 'available' : 'missing or stale'}.`,
        pendingSummary: !sourceAndMappingReady ? 'Accept the current trial-balance source and independently approve its mapping.' : !statementCurrent ? 'Generate or review a statement set pinned to the current source and mapping revisions.' : !cashFlowCurrent ? 'Prepare and review the cash flow schedule against current revisions.' : !disclosureReviewComplete ? 'Complete the applicable disclosure review.' : 'Continue to financial package validation.',
        blockedSummary: !sourceAndMappingReady ? 'Statement preparation is blocked until current source acceptance and mapping approval are recorded.' : undefined,
        blockers: !sourceAndMappingReady ? ['Current source acceptance and independent mapping approval are required before statement preparation.'] : latestStatement?.status === 'Stale' ? ['The latest statement set is stale; regenerate it against the current trial-balance and mapping revisions.'] : [],
        nextAction: !sourceAndMappingReady ? 'Accept source and approve current account mappings' : !statementCurrent || !layoutCurrent ? 'Generate or refresh the statement layout and set' : !cashFlowCurrent ? 'Prepare a current cash flow schedule' : !disclosureReviewComplete ? 'Review applicable disclosures' : 'Open Financial Packages',
        whoActsNext: sourceAndMappingReady ? 'Financial Preparer / Reviewer' : 'Independent Accounting Reviewer'
      };
    }

    case 'financial-packages': {
      const latestPackage = (activeEng?.packageHistory || []).slice().sort((a, b) => b.revision - a.revision)[0];
      const mappingRevision = Math.max(0, ...(state.accountMappingRevisions || []).filter(item => item.engagementId === activeEng?.id).map(item => item.revision));
      const latestGL = activeEng?.glSourceHistory?.at(-1);
      const isCurrentPackage = Boolean(latestPackage && latestPackage.revision === activeEng?.packageRevision && latestPackage.sourceVersion === activeEng?.sourceVersion && latestPackage.mappingRevision === mappingRevision && latestPackage.glSourceRevision === latestGL?.revision && latestPackage.glSourceSha256 === latestGL?.sha256);
      const isAssembled = Boolean(isCurrentPackage);
      const artifactsValid = Boolean(latestPackage && latestPackage.artifacts.length === 3 && latestPackage.artifacts.every(artifact => artifact.id && artifact.name && artifact.mimeType && artifact.size > 0 && /^[0-9a-f]{64}$/i.test(artifact.sha256)));
      const isPresented = Boolean(isCurrentPackage && activeEng?.managementPresentation && activeEng.managementPresentation.generation === activeEng.generation && activeEng.managementPresentation.sourceVersion === activeEng.sourceVersion && activeEng.managementPresentation.packageRevision === activeEng.packageRevision);
      const isAck = Boolean(isPresented && activeEng?.managementPackageDecision?.decision === 'Acknowledged' && activeEng.managementPackageDecision.generation === activeEng.generation && activeEng.managementPackageDecision.sourceVersion === activeEng.sourceVersion && activeEng.managementPackageDecision.packageRevision === activeEng.packageRevision);

      const steps: WorkflowStep[] = [
        { id: 'assembly', label: 'Package Assembly', state: isAssembled ? 'completed' : 'current' },
        { id: 'format-gen', label: 'Artifact Generation', state: isAssembled && artifactsValid ? 'completed' : isAssembled ? 'blocked' : 'pending' },
        { id: 'validation', label: 'Technical Validation', state: latestPackage?.validation?.passed && isCurrentPackage ? 'completed' : latestPackage && !isCurrentPackage ? 'stale' : isAssembled ? 'current' : 'pending' },
        { id: 'presentation', label: 'Management Presentation', state: isPresented ? 'completed' : latestPackage?.validation?.passed ? 'current' : 'pending' },
        { id: 'management-decision', label: 'Management Sign-off', state: isAck ? 'completed' : isPresented ? 'current' : 'pending' }
      ];

      const percent = 0;

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'financial-packages',
        currentSection: 'Financial Statements Package Assembly & Artifacts',
        steps,
        percentComplete: percent,
        counts: {
          completed: 0,
          pending: 0,
          blocked: 0,
          total: steps.length
        },
        completedSummary: isAck ? `Current package revision ${latestPackage?.revision} was acknowledged by management.` : isAssembled ? `Current package revision ${latestPackage?.revision} is assembled.` : latestPackage ? 'A package exists, but it does not match the current source, mapping or revision.' : 'No package revision is assembled for this engagement.',
        pendingSummary: !isAck && isPresented ? 'Awaiting client management acknowledgement.' : !isPresented && latestPackage?.validation?.passed ? 'Awaiting presentation to client management.' : 'Package generation pending.',
        blockedSummary: latestPackage && !latestPackage.validation.passed ? 'Package validation reports unresolved balances or other validation errors.' : !isCurrentPackage && latestPackage ? 'The latest package is stale against current source or mapping revisions.' : undefined,
        blockers: latestPackage && !latestPackage.validation.passed ? ['Resolve package validation errors before presenting it.'] : !isCurrentPackage && latestPackage ? ['Regenerate the package against the current trial-balance and mapping revisions.'] : [],
        nextAction: isPresented && !isAck ? 'Record the management decision for this exact package revision' : latestPackage?.validation?.passed && isCurrentPackage ? 'Present this validated package revision to management' : 'Assemble and validate a current package revision',
        whoActsNext: isPresented ? 'Client Management' : 'Engagement Manager'
      };
    }

    case 'consolidation': {
      const groups = state.consolidationGroups || [];
      const group = groups.find(item => item.id === context.recordId) || groups[0];
      if (group && !hasConsolidationGroupScope(state, group.id)) {
        return {
          moduleId: routeInfo.moduleId, moduleName: routeInfo.label, route, currentSection: 'Consolidation Group', steps: [], percentComplete: null,
          applicability: 'unavailable', metricLabel: 'Unavailable', scopeLabel: 'The selected group is outside the current permitted scope.',
          counts: { completed: 0, current: 0, pending: 0, blocked: 0, returned: 0, stale: 0, skipped: 0, notApplicable: 0, total: 0 },
          completedSummary: 'No group progress was loaded.', pendingSummary: 'Select an authorized consolidation group.', blockers: [],
          nextAction: 'Return to an authorized group workspace.', whoActsNext: 'A permitted user'
        };
      }
      const elims = group?.eliminations || [];
      const approvedElims = elims.filter(e => e.status === 'Approved');
      const pendingElims = elims.filter(e => e.status === 'Submitted' || e.status === 'Draft');
      const returnedElims = elims.filter(e => e.status === 'Returned');
      const outputPkg = (group?.outputPackages || []).slice().sort((a, b) => b.revision - a.revision)[0];
      const groupCurrency = group?.presentationCurrency || group?.currency;
      const foreignCurrencies = [...new Set((group?.components || []).map(component => component.currency).filter(currency => currency !== groupCurrency))];
      const fxCurrent = foreignCurrencies.every(currency => Number.isFinite(group?.fxRates[currency]) && (group?.fxRates[currency] || 0) > 0);
      const componentPinsCurrent = Boolean(group?.components.length && group.components.every(component => {
        const source = state.engagements.find(item => item.id === component.componentId);
        const packageRevision = source?.packageHistory?.find(item => item.revision === component.packageRevisionPinned);
        return component.status === 'Ready' && packageRevision && component.packageReview?.packageRevision === packageRevision.revision && component.packageReview.sourceVersion === source?.sourceVersion;
      }));
      const outputFingerprint = group ? consolidationOutputFingerprint(group, state) : undefined;
      const outputCurrent = Boolean(outputPkg && outputFingerprint && outputPkg.fingerprint === outputFingerprint && outputPkg.status === 'Approved' && outputPkg.approvedFingerprint === outputFingerprint && outputPkg.artifact.size > 0 && /^[0-9a-f]{64}$/i.test(outputPkg.artifact.sha256));
      const allEliminationsCurrent = Boolean(elims.length && approvedElims.length === elims.length && approvedElims.every(item => item.approvedPerimeterRevision === (group?.perimeterRevision || 1)));

      const steps: WorkflowStep[] = [
        { id: 'perimeter', label: 'Current Group Perimeter', state: group?.status === 'Draft' ? 'current' : group ? 'completed' : 'pending', detail: group ? `Perimeter revision ${group.perimeterRevision || 1}` : 'No group is configured.' },
        { id: 'component-sources', label: 'Pinned Current Component Packages', state: componentPinsCurrent ? 'completed' : group?.components.length ? group.components.some(component => component.status === 'Stale') ? 'stale' : 'current' : 'pending' },
        { id: 'fx-rates', label: 'Applicable FX Rates', state: foreignCurrencies.length === 0 ? 'na' : fxCurrent ? 'completed' : 'current', detail: foreignCurrencies.length ? `${foreignCurrencies.length} foreign component currency(ies)` : 'All components use the presentation currency.' },
        { id: 'eliminations', label: 'Current Intercompany Eliminations', state: returnedElims.length ? 'returned' : pendingElims.length ? 'current' : allEliminationsCurrent ? 'completed' : 'pending' },
        { id: 'output', label: 'Current Reviewed Group Output', state: outputCurrent ? 'completed' : outputPkg && outputPkg.status === 'Approved' ? 'stale' : outputPkg?.status === 'Returned' ? 'returned' : 'pending' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'consolidation',
        currentSection: 'Multi-Entity Group Elimination Records',
        steps,
        percentComplete: 0,
        counts: {
          completed: approvedElims.length,
          pending: pendingElims.length,
          blocked: 0,
          total: elims.length || 1
        },
        completedSummary: `${approvedElims.length} of ${elims.length} elimination(s) approved; component pins ${componentPinsCurrent ? 'current' : 'incomplete or stale'}; output ${outputCurrent ? 'current' : 'not current'}.`,
        pendingSummary: `${pendingElims.length} draft/submitted and ${returnedElims.length} returned elimination(s); ${foreignCurrencies.length} applicable FX currency(ies).`,
        blockers: [...returnedElims.map(item => `Elimination ${item.id} was returned; revise it against the current group inputs.`), ...(group?.components.some(component => component.status === 'Stale') ? ['A component package pin is stale; refresh the perimeter source and reviews.'] : [])],
        nextAction: returnedElims.length ? `Revise returned elimination ${returnedElims[0].id}` : !componentPinsCurrent ? 'Refresh and review component package pins' : !fxCurrent ? 'Record the required current FX translation rates' : pendingElims.length ? 'Submit or review pending elimination entries' : !allEliminationsCurrent ? 'Assess whether intercompany eliminations are required and record supported entries' : 'Prepare or review the current group output package',
        whoActsNext: returnedElims.length || pendingElims.some(item => item.status === 'Draft') ? 'Group Preparer' : pendingElims.length ? 'Group Reviewer' : 'Group Reviewer / Partner'
      };
    }

    case 'audit-planning': {
      const plan = (state.auditPlans || []).find(p => p.engagementId === activeEng?.id);
      const isApproved = plan?.status === 'Approved';
      const isUnderReview = plan?.status === 'Under review';
      const risks = (state.auditRisks || []).filter(item => item.engagementId === activeEng?.id);
      const hasMateriality = Boolean(plan?.overallMateriality && Number.isFinite(plan.overallMateriality) && plan.overallMateriality > 0);
      const hasEngagementAcceptance = Boolean(activeEng?.acceptance && activeEng.terms);
      const hasAssignedTeam = Boolean(activeEng?.team.length && activeEng.manager && activeEng.partner);

      const steps: WorkflowStep[] = [
        { id: 'context', label: 'Accepted Engagement Context', state: hasEngagementAcceptance ? 'completed' : 'blocked' },
        { id: 'materiality', label: 'Materiality Calculation', state: hasMateriality ? 'completed' : plan ? 'current' : 'pending' },
        { id: 'risks-scope', label: 'Engagement Risk Scoping', state: risks.length ? 'completed' : plan ? 'current' : 'pending', targetRoute: 'audit-risks' },
        { id: 'milestones', label: 'Assigned Team', state: hasAssignedTeam ? 'completed' : 'pending' },
        { id: 'plan-approval', label: 'Independent Plan Approval', state: isApproved ? 'completed' : isUnderReview ? 'current' : plan ? 'pending' : 'pending' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'audit-planning',
        currentSection: 'Materiality, Audit Strategy & Milestones',
        steps,
        percentComplete: 0,
        counts: {
          completed: isApproved ? 1 : 0,
          pending: isApproved ? 0 : 1,
          blocked: 0,
          total: 1
        },
        completedSummary: isApproved ? `Audit plan v${plan?.version || 1} approved with overall materiality recorded.` : plan ? `Audit plan v${plan.version} is ${plan.status.toLowerCase()}.` : 'No audit plan is recorded for this engagement.',
        pendingSummary: isUnderReview ? 'Audit plan submitted for independent review.' : 'Plan drafting in progress.',
        blockers: [],
        nextAction: isUnderReview ? 'Perform independent review on audit plan' : !isApproved ? 'Submit audit plan for review' : 'Proceed to risk assessment and audit programs',
        whoActsNext: isUnderReview ? 'Audit Partner / Manager' : 'Assigned Preparer'
      };
    }

    case 'audit-risks':
    case 'audit-fieldwork': {
      const risks = (state.auditRisks || []).filter(r => r.engagementId === activeEng?.id);
      const programs = (state.auditPrograms || []).filter(p => !activeEng || p.engagementId === activeEng.id);
      const procs: AuditProcedureItem[] = programs.flatMap(pr => pr.procedures || []);
      const cleared = procs.filter((p: AuditProcedureItem) => p.status === 'Cleared' || p.status === 'Completed');
      const submitted = procs.filter((p: AuditProcedureItem) => p.status === 'Submitted');
      const inProgress = procs.filter((p: AuditProcedureItem) => p.status === 'In progress');
      const exceptions = procs.filter((p: AuditProcedureItem) => p.status === 'Exceptions noted' || p.status === 'Exception noted');

      const isRiskRoute = route === 'audit-risks';
      const steps: WorkflowStep[] = isRiskRoute ? [
        { id: 'risk-register', label: 'Scoped Risk Register', state: risks.length ? 'completed' : 'current', detail: `${risks.length} risk(s) recorded` },
        { id: 'risk-response', label: 'Risk Response', state: risks.length && risks.every(item => item.response.trim()) ? 'completed' : risks.length ? 'current' : 'pending' },
        { id: 'audit-programs', label: 'Linked Audit Programs', state: programs.length ? 'completed' : risks.length ? 'current' : 'pending', targetRoute: 'audit-fieldwork' }
      ] : [
        { id: 'program-design', label: 'Scoped Audit Procedures', state: procs.length ? 'completed' : 'pending', detail: `${procs.length} procedure(s) in the selected engagement` },
        { id: 'fieldwork', label: 'Procedure Execution', state: exceptions.length ? 'returned' : inProgress.length ? 'current' : procs.length && (submitted.length + cleared.length) === procs.length ? 'completed' : procs.length ? 'pending' : 'pending' },
        { id: 'review-clearance', label: 'Independent Procedure Clearance', state: exceptions.length ? 'returned' : submitted.length ? 'current' : procs.length && cleared.length === procs.length ? 'completed' : 'pending' },
        { id: 'exceptions-findings', label: 'Finding Linkage', state: exceptions.length ? 'current' : procs.length && cleared.length === procs.length ? 'completed' : 'pending', targetRoute: 'findings' }
      ];

      const percent = procs.length ? Math.round((cleared.length / procs.length) * 100) : 0;

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route,
        currentSection: isRiskRoute ? 'Engagement Risk Register' : 'Audit Program & Fieldwork Execution',
        steps,
        percentComplete: percent,
        counts: {
          completed: cleared.length,
          pending: inProgress.length + submitted.length,
          blocked: exceptions.length,
          total: procs.length,
          returned: exceptions.length
        },
        completedSummary: `${cleared.length} of ${procs.length} audit procedure(s) cleared by reviewer.`,
        pendingSummary: `${submitted.length} submitted awaiting clearance; ${inProgress.length} in progress.`,
        blockedSummary: exceptions.length ? `${exceptions.length} procedure(s) with exceptions noted.` : undefined,
        blockers: exceptions.map((p: AuditProcedureItem) => `Procedure ${p.id}: Exceptions noted - link to finding or obtain additional audit evidence`),
        nextAction: isRiskRoute ? risks.length ? programs.length ? 'Execute linked procedures in Audit Fieldwork' : 'Design audit programs for the scoped risks' : 'Record an engagement risk assessment' : exceptions.length ? `Link exceptions in ${exceptions[0].id} to findings register` : submitted.length ? `Clear submitted procedure ${submitted[0].id}` : 'Execute assigned audit procedures',
        whoActsNext: submitted.length ? 'Assigned Reviewer' : 'Audit Senior / Preparer'
      };
    }

    case 'sampling': {
      const populations = (state.samplePopulations || []).filter(population => population.engagementId === activeEng?.id);
      const explicitPopulationUnavailable = Boolean(context.recordId && !populations.some(population => population.id === context.recordId));
      if (explicitPopulationUnavailable) {
        return {
          moduleId: routeInfo.moduleId, moduleName: routeInfo.label, route: 'sampling', currentSection: 'Audit Sampling & Substantive Testing',
          steps: [], percentComplete: null, applicability: 'unavailable', metricLabel: 'Unavailable',
          scopeLabel: 'Selected population is missing or outside the engagement', selectedRecordId: context.recordId,
          counts: { completed: 0, current: 0, pending: 0, blocked: 0, returned: 0, stale: 0, skipped: 0, notApplicable: 0, total: 0 },
          completedSummary: 'No sample progress was calculated for the missing population.',
          pendingSummary: 'Select a population from the current engagement.', blockers: [],
          nextAction: 'Choose an authorized population in Sampling & Populations.', whoActsNext: 'Workspace user'
        };
      }
      const pop = context.recordId ? populations.find(population => population.id === context.recordId) : populations[0];
      const items: SamplePopulationRow[] = pop?.items || [];
      const selected = items.filter((i: SamplePopulationRow) => i.selected);
      const tested = selected.filter((i: SamplePopulationRow) => i.tested);
      const frameCurrent = Boolean(pop && isSampleFrameReconciled(state, pop));
      const latestReview = pop?.selectionReviews?.slice().sort((a, b) => b.version - a.version)[0];
      const reviewCurrent = Boolean(latestReview && pop && latestReview.version === (pop.selectionVersion || 0) && latestReview.sourceRevision === (pop.sourceRevision || 1) && latestReview.selectedCount === selected.length && latestReview.testedCount === tested.length);

      const steps: WorkflowStep[] = [
        { id: 'population-intake', label: 'Population Source', state: pop ? 'completed' : 'pending', detail: pop ? `${pop.totalPopulationCount} population row(s) · source revision ${pop.sourceRevision || 1}` : 'No population is registered for this engagement.' },
        { id: 'gl-reconciliation', label: 'Mapped GL Reconciliation', state: frameCurrent ? 'completed' : pop?.sourceComplete ? 'blocked' : 'pending' },
        { id: 'selection', label: 'Current Sample Selection', state: selected.length ? 'completed' : pop && frameCurrent ? 'current' : 'pending' },
        { id: 'testing', label: 'Substantive Testing', state: tested.length === selected.length && selected.length > 0 ? 'completed' : tested.length > 0 ? 'current' : 'pending' },
        { id: 'evaluation', label: 'Current Sample Evaluation', state: reviewCurrent ? 'completed' : latestReview ? 'stale' : selected.length ? 'current' : 'pending' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'sampling',
        currentSection: 'Audit Sampling & Substantive Testing',
        steps,
        percentComplete: 0,
        counts: {
          completed: tested.length,
          pending: selected.length - tested.length,
          blocked: 0,
          total: selected.length || items.length
        },
        completedSummary: `${tested.length} of ${selected.length} selected sample item(s) tested; current frame reconciliation ${frameCurrent ? 'passed' : 'not established'}.`,
        pendingSummary: `${selected.length - tested.length} selected item(s) awaiting testing.`,
        blockers: pop && !frameCurrent ? ['Population source does not reconcile to the mapped GL balance, engagement period and currency. Refresh or correct the source before selection/review.'] : [],
        nextAction: !pop ? 'Import a population for this engagement' : !frameCurrent ? 'Reconcile the population source to the current mapped GL' : !selected.length ? 'Select a supported sample from the reconciled population' : tested.length < selected.length ? 'Complete substantive testing for selected items' : 'Evaluate and independently review current sample results',
        whoActsNext: tested.length < selected.length ? 'Assigned Preparer' : 'Audit Reviewer'
      };
    }

    case 'audit': {
      const wps = activeEng?.workpapers || [];
      const cleared = wps.filter(w => w.status === 'Cleared');
      const currentCleared = cleared.filter(w => w.clearance?.version === w.version && w.clearance.sourceVersion === activeEng?.sourceVersion && w.clearance.generation === activeEng?.generation);
      const submitted = wps.filter(w => w.status === 'Submitted');
      const rework = wps.filter(w => w.status === 'Changes required');
      const inProgress = wps.filter(w => w.status === 'In progress');
      const planned = wps.filter(w => w.status === 'Planned');
      const na = wps.filter(w => w.status === 'Not applicable');
      const applicable = wps.filter(w => w.applicable && w.status !== 'Not applicable');
      const allNotApplicable = wps.length > 0 && applicable.length === 0;

      const steps: WorkflowStep[] = [
        { id: 'wp-setup', label: 'Workpaper Scope & Template', state: wps.length && wps.every(w => Boolean(w.template?.name && w.template?.ref)) ? 'completed' : wps.length ? 'current' : 'pending' },
        { id: 'wp-execution', label: 'Preparation', state: allNotApplicable ? 'na' : rework.length ? 'returned' : inProgress.length ? 'current' : planned.length ? 'pending' : currentCleared.length ? 'completed' : 'pending' },
        { id: 'wp-evidence', label: 'Supporting Evidence', state: allNotApplicable ? 'na' : wps.length && applicable.length > 0 && applicable.every(w => w.supportingEvidence.length > 0) ? 'completed' : wps.length ? 'current' : 'pending', targetRoute: 'evidence' },
        { id: 'wp-submitted', label: 'Independent Review', state: allNotApplicable ? 'na' : submitted.length ? 'current' : rework.length ? 'returned' : currentCleared.length ? 'completed' : 'pending' },
        { id: 'wp-cleared', label: 'Current Workpaper Clearances', state: allNotApplicable ? 'na' : currentCleared.length === applicable.length && applicable.length > 0 ? 'completed' : cleared.length > currentCleared.length ? 'stale' : rework.length ? 'returned' : applicable.length ? 'current' : 'pending' }
      ];

      const percent = applicable.length ? Math.round((cleared.length / applicable.length) * 100) : 0;

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'audit',
        currentSection: 'Audit Workpapers & Lead Schedules',
        steps,
        percentComplete: percent,
        counts: {
          completed: currentCleared.length,
          pending: submitted.length + inProgress.length + planned.length,
          blocked: rework.length,
          total: wps.length,
          returned: rework.length
        },
        completedSummary: `${currentCleared.length} of ${applicable.length} applicable workpaper(s) have current independent clearance; ${na.length} marked not applicable with separate rationale.`,
        pendingSummary: `${submitted.length} submitted awaiting review; ${inProgress.length} in progress.`,
        blockedSummary: rework.length ? `${rework.length} workpaper(s) marked 'Changes required' due to evidence/source updates.` : undefined,
        blockers: rework.map(w => `${w.id} (${w.title}): Rework required - review note or evidence revision invalidated submission`),
        nextAction: rework.length ? `Revise workpaper ${rework[0].id} and resubmit` : submitted.length ? `Clear submitted workpaper ${submitted[0].id}` : 'Complete open audit fieldwork workpapers',
        whoActsNext: rework.length ? 'Assigned Preparer' : submitted.length ? 'Assigned Reviewer' : 'Audit Team'
      };
    }

    case 'evidence': {
      const docs = (state.documents || []).filter(document => document.clientId === activeEng?.client && document.engagementId === activeEng?.id);
      const docById = new Map(docs.map(document => [document.id, document]));
      const evidence = (state.evidenceCatalogue || []).filter(item => docById.has(item.documentId));
      const adequate = evidence.filter(item => item.adequacyStatus === 'Adequate' && docById.get(item.documentId)?.version === item.version && !docById.get(item.documentId)?.brokenLink);
      const deficient = evidence.filter(item => item.adequacyStatus === 'Deficient');
      const pending = evidence.filter(item => item.adequacyStatus === 'Pending verification' || item.adequacyStatus === 'Adequate' && docById.get(item.documentId)?.version !== item.version);
      const hashRecorded = docs.filter(document => Boolean(document.sha && /^[0-9a-f]{64}$/i.test(document.sha)));
      const linkedEvidence = adequate.filter(item => item.linkedProcedures.length > 0);

      const steps: WorkflowStep[] = [
        { id: 'intake', label: 'In-Scope Evidence Documents', state: docs.length ? 'completed' : 'pending', detail: `${docs.length} document(s) for the selected engagement` },
        { id: 'hash', label: 'Recorded Source Digests', state: hashRecorded.length === docs.length && docs.length > 0 ? 'completed' : docs.length ? 'current' : 'pending', detail: `${hashRecorded.length} of ${docs.length} documents have a SHA-256 digest` },
        { id: 'adequacy', label: 'Current Adequacy Assessment', state: deficient.length ? 'blocked' : pending.length ? 'current' : adequate.length ? 'completed' : 'pending' },
        { id: 'linkage', label: 'Procedure Linkage', state: linkedEvidence.length === adequate.length && adequate.length > 0 ? 'completed' : adequate.length ? 'current' : 'pending', targetRoute: 'audit' },
        { id: 'retention', label: 'Release Preservation', state: activeEng?.releases?.length ? 'completed' : 'na', detail: activeEng?.releases?.length ? 'Released evidence follows the engagement archive lineage.' : 'Applicable only after an exact engagement release.' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'evidence',
        currentSection: 'Audit Evidence & Corroborating Documentation',
        steps,
        percentComplete: 0,
        counts: {
          completed: adequate.length,
          pending: pending.length,
          blocked: deficient.length,
          total: evidence.length || docs.length
        },
        completedSummary: `${adequate.length} evidence artifact(s) verified as Adequate.`,
        pendingSummary: `${pending.length} item(s) pending adequacy review.`,
        blockedSummary: deficient.length ? `${deficient.length} evidence item(s) marked Deficient/Inadequate.` : undefined,
        blockers: deficient.map(e => `Evidence ${e.id}: Marked ${e.adequacyStatus} - requires replacement documentation`),
        nextAction: deficient.length ? 'Request replacement document from client or prepare alternate evidence' : 'Assess adequacy on pending evidence items',
        whoActsNext: 'Audit Reviewer / Preparer'
      };
    }

    case 'findings': {
      const findings = (state.findings || []).filter(f => !activeEng || f.engagementId === activeEng.id);
      const resolved = findings.filter(f => f.disposition === 'Corrected in TB' || f.disposition === 'Corrected by client' || f.disposition === 'Waived as immaterial');
      const open = findings.filter(f => f.disposition === 'Uncorrected' || f.disposition === 'Proposed for correction' || f.disposition === 'Management agreed');
      const quantified = findings.filter(f => Number.isFinite(f.amount) && f.amount !== undefined && f.amount >= 0);

      const steps: WorkflowStep[] = [
        { id: 'id', label: 'Difference Identification', state: findings.length ? 'completed' : 'pending' },
        { id: 'quant', label: 'Quantification', state: quantified.length === findings.length && findings.length > 0 ? 'completed' : findings.length ? 'current' : 'pending' },
        { id: 'discussion', label: 'Management Discussion', state: open.length ? 'current' : findings.length ? 'completed' : 'pending' },
        { id: 'disposition', label: 'Disposition Recorded', state: resolved.length ? 'completed' : 'pending' },
        { id: 'tb-reflection', label: 'TB Reflection / Waiver', state: resolved.length === findings.length && findings.length > 0 ? 'completed' : findings.length ? 'current' : 'pending' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'findings',
        currentSection: 'Audit Differences & Findings Register',
        steps,
        percentComplete: 0,
        counts: {
          completed: resolved.length,
          pending: open.length,
          blocked: 0,
          total: findings.length
        },
        completedSummary: `${resolved.length} of ${findings.length} finding(s) resolved with recorded disposition.`,
        pendingSummary: `${open.length} uncorrected finding(s) under review.`,
        blockers: [],
        nextAction: open.length ? `Determine disposition for finding ${open[0].id}` : 'All audit differences cleared or waived',
        whoActsNext: open.length ? 'Engagement Partner / Manager' : 'Audit Team'
      };
    }

    case 'reviews': {
      const notes = activeEng?.reviews || [];
      const cleared = notes.filter(n => n.status === 'Cleared');
      const open = notes.filter(n => n.status === 'Open');
      const responded = notes.filter(n => n.status === 'Responded');
      const reopened = notes.filter(n => n.status === 'Reopened');

      const assigned = notes.filter(note => {
        const user = state.users.find(person => person.id === note.assignedUserId) || state.users.find(person => person.name === (note.assignee || note.assigned));
        if (!user || user.status !== 'Active') return false;
        const visible = visibleEngagementIds(state, user.id);
        return visible === 'ALL' || Boolean(activeEng && visible.includes(activeEng.id));
      });
      const steps: WorkflowStep[] = [
        { id: 'query', label: 'Review Query Raised', state: notes.length ? 'completed' : 'current' },
        { id: 'assignment', label: 'Active Scoped Reviewer Assignment', state: notes.length && assigned.length === notes.length ? 'completed' : notes.length ? 'current' : 'pending' },
        { id: 'response', label: 'Preparer Response', state: reopened.length ? 'returned' : responded.length ? 'completed' : open.length ? 'current' : cleared.length ? 'completed' : 'pending' },
        { id: 'clearance', label: 'Reviewer Clearance', state: cleared.length === notes.length && notes.length > 0 ? 'completed' : responded.length ? 'current' : 'pending' },
        { id: 'resolution', label: 'Engagement Sign-off', state: cleared.length === notes.length && notes.length > 0 ? 'completed' : 'pending' }
      ];

      const percent = 0;

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'reviews',
        currentSection: 'Cross-Engagement Technical Review Points',
        steps,
        percentComplete: percent,
        counts: {
          completed: cleared.length,
          pending: open.length + responded.length,
          blocked: reopened.length,
          total: notes.length,
          returned: reopened.length
        },
        completedSummary: `${cleared.length} of ${notes.length} review query(ies) formally cleared.`,
        pendingSummary: `${open.length} open query(ies) require response; ${responded.length} require reviewer clearance.`,
        blockedSummary: reopened.length ? `${reopened.length} review point(s) reopened due to updated subject.` : undefined,
        blockers: reopened.map(n => `Review point ${n.id}: Reopened - subject revision changed`),
        nextAction: responded.length ? `Clear responded query ${responded[0].id}` : open.length ? `Provide response to query ${open[0].id}` : 'All review points cleared',
        whoActsNext: responded.length ? 'Reviewer' : open.length ? 'Assigned Preparer' : 'Engagement Team'
      };
    }

    case 'approvals':
    case 'quality': {
      const apprs = activeEng?.approvals || { manager: null, client: null, partner: null, eqr: null };
      const readiness = evaluateReleaseReadiness(activeEng, state);
      const mgr = readiness.approvals.manager;
      const client = readiness.approvals.client;
      const partner = readiness.approvals.partner;
      const eqr = readiness.approvals.eqr;
      const managementAck = readiness.approvals.managementAcknowledgement;
      const eqrRequired = Boolean(activeEng?.eqrRequired);

      const steps: WorkflowStep[] = [
        { id: 'mgr-approval', label: 'Current Independent Manager Sign-off', state: mgr ? 'completed' : apprs.manager ? 'stale' : 'current', detail: mgr ? `Generation ${activeEng?.generation}` : 'Requires current generation and separation from partner.' },
        { id: 'client-approval', label: 'Client Management Representation', state: client ? 'completed' : apprs.client ? 'stale' : mgr ? 'current' : 'pending', detail: 'Client representation is separate from package acknowledgement.' },
        { id: 'management-package-ack', label: 'Current Package Acknowledgement', state: managementAck ? 'completed' : activeEng?.managementPackageDecision ? 'stale' : 'pending', detail: managementAck ? `Package revision ${activeEng?.packageRevision}` : 'Requires a presentation and acknowledgement for the current package.' },
        { id: 'partner-approval', label: 'Current Partner Sign-off', state: partner ? 'completed' : apprs.partner ? 'stale' : client && managementAck ? 'current' : 'pending' },
        { id: 'eqr-approval', label: eqrRequired ? 'Applicable EQR Concurrence' : 'EQR Concurrence (Not Required)', state: !eqrRequired ? 'na' : eqr ? 'completed' : apprs.eqr ? 'stale' : partner ? 'current' : 'pending' },
        { id: 'release-auth', label: 'Authoritative Release Readiness', state: readiness.ready ? 'completed' : 'blocked', targetRoute: 'delivery', detail: readiness.ready ? 'Readiness helper agrees all store release preconditions are satisfied.' : readiness.reason }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'approvals',
        currentSection: 'Engagement Final Approvals & Quality Review',
        steps,
        percentComplete: 0,
        counts: {
          completed: 0,
          pending: 0,
          blocked: 0,
          total: steps.length
        },
        completedSummary: `${[mgr, client, managementAck, partner, !eqrRequired || eqr, readiness.ready].filter(Boolean).length} approval and release conditions currently satisfied.`,
        pendingSummary: readiness.ready ? 'Current approvals and release preconditions agree.' : `${readiness.blockers.length} authoritative release precondition(s) remain.`,
        blockers: readiness.blockers,
        nextAction: !mgr ? 'Record a current manager approval by a person independent from the partner' : !client ? 'Record current client management representation' : !managementAck ? 'Present the current package and record management acknowledgement' : !partner ? 'Record current partner sign-off' : eqrRequired && !eqr ? 'Record current independent EQR concurrence' : !readiness.ready ? readiness.reason || 'Resolve the first outstanding release precondition' : 'Proceed to Release & Completion',
        whoActsNext: !mgr ? 'Engagement Manager' : !client || !managementAck ? 'Client Management' : !partner ? 'Engagement Partner' : eqrRequired && !eqr ? 'Independent EQR Partner' : readiness.ready ? 'Engagement Partner' : 'Engagement Team'
      };
    }

    case 'delivery': {
      const readiness = evaluateReleaseReadiness(activeEng, state);
      const currentPackage = activeEng?.packageHistory?.find(item => item.revision === activeEng.packageRevision);
      const currentRelease = currentPackage ? releaseForPackage(activeEng!, currentPackage) : undefined;
      const candidateCurrent = Boolean(activeEng?.candidate && activeEng.candidate.generation === activeEng.generation && activeEng.candidate.sourceVersion === activeEng.sourceVersion && activeEng.candidate.packageRevision === activeEng.packageRevision && currentPackage && activeEng.candidate.packageDefinitionId === currentPackage.id);
      const isReady = readiness.ready;
      const isCandidate = candidateCurrent;
      const isReleased = Boolean(currentRelease);
      const isArchived = Boolean(currentRelease && archiveForRelease(activeEng!, currentRelease.id));
      const blockers = readiness.blockers;

      const steps: WorkflowStep[] = [
        { id: 'readiness-gates', label: 'Store-Equivalent Readiness', state: isReady ? 'completed' : 'blocked', detail: readiness.reason },
        { id: 'candidate-prep', label: 'Candidate Preparation', state: isCandidate || isReleased ? 'completed' : isReady ? 'current' : 'pending' },
        { id: 'partner-issue', label: 'Partner Release', state: isReleased ? 'completed' : isCandidate ? 'current' : 'pending' },
        { id: 'post-release', label: 'Archival & Handover', state: isArchived ? 'completed' : isReleased ? 'current' : 'pending', targetRoute: 'records' },
        { id: 'lineage', label: 'Exact Package Release Lineage', state: isReleased ? 'completed' : 'pending', detail: currentRelease ? `Release ${currentRelease.id} for package ${currentPackage?.id}` : 'No release matches the current package revision.' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'delivery',
        currentSection: 'Final Release Gates & Artifact Packaging',
        steps,
        percentComplete: 0,
        counts: {
          completed: 0,
          pending: 0,
          blocked: 0,
          total: steps.length
        },
        completedSummary: isReleased ? `Current package ${currentPackage?.id} has exact release manifest ${currentRelease?.id}.` : isReady ? 'Store release preconditions are currently satisfied.' : 'Authoritative release preconditions are not all satisfied.',
        pendingSummary: isReleased ? 'Release issued.' : isCandidate ? 'Release candidate frozen; awaiting partner issue.' : 'Readiness gates have outstanding requirements.',
        blockedSummary: !isReady ? `${blockers.length} gate blocker(s) prevent release candidate preparation.` : undefined,
        blockers: isReady ? [] : blockers,
        nextAction: isReleased ? 'Proceed to Records & Archive' : isCandidate ? 'Issue release candidate as Partner' : isReady ? 'Freeze release candidate' : 'Resolve outstanding release gate blockers',
        whoActsNext: isCandidate ? 'Engagement Partner' : isReady ? 'Partner / Manager' : 'Engagement Team'
      };
    }

    case 'records': {
      const currentPackage = activeEng?.packageHistory?.find(item => item.revision === activeEng.packageRevision);
      const currentRelease = currentPackage ? releaseForPackage(activeEng!, currentPackage) : undefined;
      const isArchived = Boolean(currentRelease && archiveForRelease(activeEng!, currentRelease.id));
      const isReleased = Boolean(currentRelease);
      const onHold = Boolean(activeEng?.archive?.onApplicationHold);

      const steps: WorkflowStep[] = [
        { id: 'ingestion', label: 'Current Package Release Ingestion', state: isReleased ? 'completed' : activeEng?.releases?.length ? 'stale' : 'pending', targetRoute: 'delivery', detail: isReleased ? `Exact current release ${currentRelease?.id}` : 'A historic release does not close the current package.' },
        { id: 'archive-record', label: 'Archive for Current Release', state: isArchived ? 'completed' : activeEng?.archive ? 'stale' : isReleased ? 'current' : 'pending' },
        { id: 'retention-policy', label: 'Retention Hold', state: onHold ? 'blocked' : isArchived ? 'completed' : 'pending' },
        { id: 'handover', label: 'Handover Log', state: isArchived ? 'current' : 'pending' },
        { id: 'custody', label: 'Permanent Record', state: isArchived ? 'completed' : 'pending' }
      ];

      return {
        moduleId: routeInfo.moduleId,
        moduleName: routeInfo.label,
        route: 'records',
        currentSection: 'Logical Archive, Lineage & Handover',
        steps,
        percentComplete: 0,
        counts: {
          completed: 0,
          pending: 0,
          blocked: onHold ? 1 : 0,
          total: steps.length
        },
        completedSummary: isArchived ? `Archive ${activeEng?.archive?.releaseId} matches current release ${currentRelease?.id}.` : activeEng?.archive ? `Historical archive ${activeEng.archive.releaseId} is retained; it does not match the current package release.` : 'No archive record matches the current package release.',
        pendingSummary: !isArchived ? 'Engagement must be Released before it can be archived.' : 'Archive record complete.',
        blockers: !isArchived && !isReleased ? ['The current package has not been released.'] : onHold ? [`Retention application hold in place: ${activeEng?.archive?.holdReason || 'Hold active'}`] : [],
        nextAction: !isArchived ? 'Release engagement in Release & Completion' : 'Manage archive retention hold or record handover',
        whoActsNext: 'Records Manager / Archivist'
      };
    }

    default: {
      return {
        moduleId: ROUTE_CATALOG[route].moduleId,
        moduleName: ROUTE_CATALOG[route].label,
        route,
        currentSection: ROUTE_CATALOG[route].label,
        steps: [],
        percentComplete: null,
        applicability: 'unavailable',
        metricLabel: 'Unavailable',
        scopeLabel: 'No progress selector is registered for this workflow route.',
        counts: { completed: 0, current: 0, pending: 0, blocked: 0, returned: 0, stale: 0, skipped: 0, notApplicable: 0, total: 0 },
        completedSummary: 'No workflow progress was calculated.',
        pendingSummary: 'The route needs an explicit, record-backed progress selector.',
        blockers: [],
        nextAction: 'Open the module workspace and select a permitted record.',
        whoActsNext: 'Workspace user'
      };
    }
  }
}
