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
  const raw = computeCurrentWorkflowProgress(route, state, { ...selection, engagementId: activeEngagement?.id });
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

function computeCurrentWorkflowProgress(
  route: RouteKey,
  state: PrototypeState,
  context: WorkflowProgressContext
): ModuleWorkflowProgress {
  // Module identity derives from the single current route catalogue entry, never a
  // hardcoded module name.
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
        { id: 'fieldwork-tasks', label: 'Work Delivery', state: state.jobs.length > 0 ? 'current' : 'pending', detail: `${state.jobs.length} jobs tracked`, targetRoute: 'scheduling' },
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
        { id: 'delivery', label: 'Job Delivery', state: selectedJobs.some(job => job.status === 'Blocked') ? 'blocked' : selectedJobs.some(job => job.status === 'In progress' || job.status === 'Not started') ? 'current' : selectedJobs.length && selectedJobs.every(job => job.status === 'Completed') ? 'completed' : selectedJobs.length && selectedJobs.every(job => job.status === 'Cancelled') ? 'skipped' : 'pending', targetRoute: 'scheduling' },
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
        { id: 'receipt-settlement', label: 'Settlement & Receipts', state: paid.length ? 'completed' : issued.length ? 'current' : 'pending', targetRoute: 'billing' }
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

    case 'trial-balance': {
      const sourceExists = Boolean(activeEng?.sourceVersion && activeEng.rows.length);
      const accepted = Boolean(activeEng?.sourceAccepted && sourceExists);
      const steps: WorkflowStep[] = [
        { id: 'tb-import', label: 'Trial Balance Source', state: sourceExists ? 'completed' : 'current', detail: sourceExists ? `Source v${activeEng?.sourceVersion} · ${activeEng?.rows.length} account rows` : 'Import or enter a source for the selected engagement.' },
        { id: 'tb-acceptance', label: 'Source Review & Acceptance', state: accepted ? 'completed' : sourceExists ? 'current' : 'pending', detail: accepted ? 'Current source accepted.' : 'Review and accept the current source before downstream work.' },
        { id: 'tb-mapping', label: 'Statement Mapping', state: activeEng?.mappingApproved ? 'completed' : sourceExists ? 'current' : 'pending', targetRoute: 'trial-balance' }
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
        { id: 'mapping-source', label: 'Accepted Source & Current Mapping', state: sourceAndMappingReady ? 'completed' : activeEng?.sourceVersion ? 'current' : 'blocked', detail: `TB source v${activeEng?.sourceVersion || 0} · mapping revision ${mappingRevision}`, targetRoute: 'trial-balance' },
        { id: 'statement-layout', label: 'Current Statement Layout', state: layoutCurrent ? 'completed' : latestLayout && latestLayout.sourceVersion !== activeEng?.sourceVersion ? 'stale' : sourceAndMappingReady ? 'current' : 'pending' },
        { id: 'statement-set', label: 'Statement Set Review', state: statementCurrent ? latestStatement?.status === 'Reviewed' ? 'completed' : 'current' : latestStatement?.status === 'Stale' ? 'stale' : sourceAndMappingReady ? 'current' : 'pending' },
        { id: 'schedules', label: 'Current Cash Flow Schedule', state: cashFlowCurrent ? latestCashFlow?.status === 'Reviewed' ? 'completed' : 'current' : latestCashFlow?.status === 'Stale' ? 'stale' : 'pending' },
        { id: 'notes', label: 'Disclosure Review', state: disclosureReviewComplete ? 'completed' : disclosureHistory.length ? 'current' : 'pending' },
        { id: 'package-ready', label: 'Current Validated Package', state: packageCurrent ? 'completed' : 'pending', targetRoute: 'delivery' }
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
        { id: 'linkage', label: 'Procedure Linkage', state: linkedEvidence.length === adequate.length && adequate.length > 0 ? 'completed' : adequate.length ? 'current' : 'pending', targetRoute: 'reviews' },
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
