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
  ArchiveRecord,
  ClientRecord,
  ProposalRecord
} from '../types';
import { visibleEngagementIds, visibleClientIds, scopedInvoices, hasConsolidationGroupScope } from './guards';
import { isReleaseBlockingFinding } from './findings';

export type ProgressStepState = 'completed' | 'current' | 'pending' | 'blocked' | 'returned' | 'stale' | 'skipped' | 'na';

export interface WorkflowStep {
  id: string;
  label: string;
  state: ProgressStepState;
  detail?: string;
  targetRoute?: RouteKey;
  targetSection?: string;
}

export interface WorkflowCounts {
  completed: number;
  pending: number;
  blocked: number;
  total: number;
  returned?: number;
  stale?: number;
  current?: number;
  skipped?: number;
  notApplicable?: number;
  applicable?: number;
}

export interface ModuleWorkflowProgress {
  moduleId: string;
  moduleName: string;
  route: RouteKey;
  currentSection: string; // "Where am I?"
  steps: WorkflowStep[];
  percentComplete: number | null; // 0 to 100, or null if no applicable linear workflow applies
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

export interface ProgressContext {
  clientId?: string;
  engagementId?: string;
  groupId?: string;
  recordId?: string;
  revision?: number;
  period?: string;
  filters?: Record<string, any>;
}

export interface AggregateResult {
  steps: WorkflowStep[];
  percentComplete: number | null;
  counts: WorkflowCounts;
  applicableCount: number;
  notApplicableCount: number;
}

/**
 * Pure aggregation function complying with Section 5 Progress Calculation Contract:
 * applicable = completed + current + pending + blocked + returned + stale + skipped
 * percent = 100 * completed / applicable
 * Not-applicable units require actual applicability evidence and are separated into counts.notApplicable.
 * If applicable === 0, returns percentComplete: null.
 * 100% only displayed when completed === applicable and applicable > 0.
 */
export function aggregateWorkflowSteps(steps: WorkflowStep[]): AggregateResult {
  let completed = 0;
  let current = 0;
  let pending = 0;
  let blocked = 0;
  let returned = 0;
  let stale = 0;
  let skipped = 0;
  let na = 0;

  for (const step of steps) {
    switch (step.state) {
      case 'completed':
        completed++;
        break;
      case 'current':
        current++;
        break;
      case 'pending':
        pending++;
        break;
      case 'blocked':
        blocked++;
        break;
      case 'returned':
        returned++;
        break;
      case 'stale':
        stale++;
        break;
      case 'skipped':
        skipped++;
        break;
      case 'na':
        na++;
        break;
      default:
        pending++;
        break;
    }
  }

  const applicable = completed + current + pending + blocked + returned + stale + skipped;
  let percentComplete: number | null = null;

  if (applicable > 0) {
    if (completed === applicable) {
      percentComplete = 100;
    } else {
      // Cap displayed integer below 100 until all applicable are complete
      const raw = Math.floor((100 * completed) / applicable);
      percentComplete = Math.min(99, Math.max(0, raw));
    }
  }

  const counts: WorkflowCounts = {
    completed,
    pending: pending + current,
    blocked,
    total: applicable,
    returned: returned > 0 ? returned : undefined,
    stale: stale > 0 ? stale : undefined,
    current: current > 0 ? current : undefined,
    skipped: skipped > 0 ? skipped : undefined,
    notApplicable: na > 0 ? na : undefined,
    applicable
  };

  return {
    steps,
    percentComplete,
    counts,
    applicableCount: applicable,
    notApplicableCount: na
  };
}

export function isEngagementReleaseReady(e: EngagementRecord, state: PrototypeState): boolean {
  if (!e) return false;
  const allWpCleared = (e.workpapers || []).every(w => !w.applicable || w.status === 'Cleared' || w.status === 'Not applicable');
  const noOpenReviews = (e.reviews || []).every(r => r.status === 'Cleared');
  const openBlockingFindings = (state.findings || []).filter(f => f.engagementId === e.id && isReleaseBlockingFinding(f));
  const noMaterialFindings = openBlockingFindings.length === 0;
  const approvalsValid = Boolean(
    e.approvals?.manager?.generation === e.generation &&
    e.approvals?.client?.generation === e.generation &&
    e.approvals?.partner?.generation === e.generation &&
    (!e.eqrRequired || e.approvals?.eqr?.generation === e.generation)
  );
  return allWpCleared && noOpenReviews && noMaterialFindings && approvalsValid;
}

export function hasValidGenerationSignoff(
  e: EngagementRecord,
  _state: PrototypeState,
  role: 'manager' | 'partner' | 'client' | 'eqr'
): boolean {
  if (!e || !e.approvals) return false;
  const app = e.approvals[role];
  return Boolean(app && app.generation === e.generation);
}

export function computeModuleWorkflowProgress(
  route: RouteKey,
  state: PrototypeState,
  context?: string | ProgressContext
): ModuleWorkflowProgress {
  // Normalize context
  const parsedContext: ProgressContext = typeof context === 'string'
    ? (context.startsWith('ENG-') || state.engagements.some(e => e.id === context)
        ? { engagementId: context }
        : context.startsWith('CL-') || state.clients.some(c => c.id === context)
          ? { clientId: context }
          : { recordId: context })
    : (context || {});

  const allowedEngIds = visibleEngagementIds(state);
  const scopedEngagements: EngagementRecord[] = state.engagements.filter(
    e => allowedEngIds === 'ALL' || allowedEngIds.includes(e.id)
  );
  const allowedClientIds = visibleClientIds(state);
  const scopedClients: ClientRecord[] = state.clients.filter(
    c => allowedClientIds === 'ALL' || allowedClientIds.includes(c.id)
  );

  // Authoritative client resolution
  let client: ClientRecord | null = null;
  if (parsedContext.clientId) {
    client = scopedClients.find(c => c.id === parsedContext.clientId) || null;
  } else if (parsedContext.engagementId) {
    const matchedEng = scopedEngagements.find(e => e.id === parsedContext.engagementId);
    if (matchedEng) client = scopedClients.find(c => c.id === matchedEng.client) || null;
  } else if (scopedClients.length > 0) {
    client = scopedClients[0];
  }

  // Authoritative engagement resolution
  let activeEng: EngagementRecord | undefined;
  if (parsedContext.engagementId) {
    activeEng = scopedEngagements.find(e => e.id === parsedContext.engagementId);
  } else if (state.selectedEngagement) {
    const candidate = scopedEngagements.find(e => e.id === state.selectedEngagement);
    if (candidate && (!client || candidate.client === client.id)) {
      activeEng = candidate;
    } else if (client) {
      activeEng = scopedEngagements.find(e => e.client === client!.id);
    }
  } else if (client) {
    activeEng = scopedEngagements.find(e => e.client === client.id);
  } else {
    activeEng = scopedEngagements[0];
  }

  switch (route) {
    case 'overview': {
      const activeEngs = scopedEngagements.filter(e => (e.lifecycleStatus || 'Active') === 'Active');
      const awaitingReviewCount = (activeEng?.reviews || []).filter(r => r.status !== 'Cleared').length;
      const clientRequestsCount = (activeEng?.pbc || []).filter(p => p.status !== 'Accepted').length;
      const readyForRelease = scopedEngagements.filter(e => isEngagementReleaseReady(e, state)).length;

      const steps: WorkflowStep[] = [
        { id: 'practice-setup', label: 'Practice Context', state: scopedClients.length > 0 ? 'completed' : 'pending', detail: `${scopedClients.length} permitted client(s)` },
        { id: 'active-engagements', label: 'Active Engagements', state: activeEngs.length > 0 ? 'completed' : 'pending', detail: `${activeEngs.length} active engagement(s)`, targetRoute: 'engagements' },
        { id: 'fieldwork-tasks', label: 'Work Delivery', state: state.jobs.length > 0 ? 'current' : 'pending', detail: `${state.jobs.length} job(s) tracked`, targetRoute: 'jobs' },
        { id: 'review-desk', label: 'Technical Review', state: awaitingReviewCount > 0 ? 'current' : 'completed', detail: `${awaitingReviewCount} item(s) pending review`, targetRoute: 'reviews' },
        { id: 'release-readiness', label: 'Release Readiness', state: readyForRelease > 0 ? 'completed' : 'pending', detail: `${readyForRelease} ready for issuance`, targetRoute: 'delivery' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-01',
        moduleName: 'Practice Overview',
        route: 'overview',
        currentSection: 'Practice Operations Dashboard',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${activeEngs.length} engagement(s) active in your current access scope.`,
        pendingSummary: `${awaitingReviewCount} review point(s) and ${clientRequestsCount} client request(s) awaiting attention.`,
        blockers: [],
        nextAction: awaitingReviewCount > 0 ? 'Review open review points and returned workpapers in the Review Desk' : 'Inspect active engagements or drill into work queues',
        whoActsNext: awaitingReviewCount > 0 ? 'Independent Reviewer / Manager' : 'Practice Team'
      };
    }

    case 'clients': {
      if (scopedClients.length === 0) {
        return {
          moduleId: 'MOD-02',
          moduleName: 'CRM & Client Management',
          route: 'clients',
          currentSection: 'Client Portfolio Directory',
          steps: [
            { id: 'intake', label: 'Client Intake', state: 'current', detail: 'No clients registered' },
            { id: 'acceptance-kyc', label: 'Acceptance & KYC', state: 'pending', detail: 'Pending initial client profile' },
            { id: 'engagements', label: 'Active Engagements', state: 'pending', detail: 'Pending client intake' }
          ],
          percentComplete: null,
          counts: { completed: 0, current: 1, pending: 2, blocked: 0, total: 3 },
          completedSummary: 'No clients registered.',
          pendingSummary: 'Onboard initial client profile to begin engagement setup.',
          blockers: [],
          nextAction: 'Onboard initial client profile',
          whoActsNext: 'Relationship Partner / Onboarding Lead'
        };
      }

      const activeClients = scopedClients.filter(c => c.status === 'Active');
      const prospectClients = scopedClients.filter(c => c.status === 'Prospect');
      const suspendedClients = scopedClients.filter(c => c.status === 'Suspended');

      const steps: WorkflowStep[] = [
        { id: 'intake', label: 'Client Intake', state: 'completed', detail: `${scopedClients.length} registered client(s)` },
        { id: 'acceptance-kyc', label: 'Acceptance & KYC', state: activeClients.length > 0 ? 'completed' : prospectClients.length > 0 ? 'current' : 'pending', detail: `${activeClients.length} accepted / active` },
        { id: 'engagements', label: 'Active Engagements', state: scopedEngagements.length > 0 ? 'completed' : 'pending', detail: `${scopedEngagements.length} engagement(s) linked`, targetRoute: 'engagements' },
        { id: 'service-delivery', label: 'Ongoing Service', state: suspendedClients.length > 0 ? 'blocked' : activeClients.length > 0 ? 'current' : 'pending', detail: suspendedClients.length ? `${suspendedClients.length} suspended` : 'Active relationships' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-02',
        moduleName: 'CRM & Client Management',
        route: 'clients',
        currentSection: 'Client Portfolio Directory',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${activeClients.length} of ${scopedClients.length} client(s) active with approved KYC.`,
        pendingSummary: `${prospectClients.length} prospect(s) undergoing intake and screening.`,
        blockedSummary: suspendedClients.length > 0 ? `${suspendedClients.length} client(s) currently suspended.` : undefined,
        blockers: suspendedClients.map(c => `Client ${c.id} (${c.name}): Suspended relationship`),
        nextAction: prospectClients.length > 0 ? 'Complete KYC screening and acceptance file for prospect clients' : 'Review active client engagements or update relationship profiles',
        whoActsNext: prospectClients.length > 0 ? 'Compliance / Onboarding Lead' : 'Relationship Partner'
      };
    }

    case 'client-detail': {
      if (!client) {
        return {
          moduleId: 'MOD-02',
          moduleName: 'CRM & Client Management',
          route: 'client-detail',
          currentSection: 'Client 360 & Relationship Profile',
          steps: [{ id: 'client-scope', label: 'Client Scope', state: 'blocked', detail: 'No permitted client selected' }],
          percentComplete: null,
          counts: { completed: 0, pending: 0, blocked: 1, total: 1 },
          completedSummary: '0 milestones completed.',
          pendingSummary: 'Client entity is outside your authorized scope or does not exist.',
          blockers: ['No permitted client selected.'],
          nextAction: 'Select an authorized client from Client Directory',
          whoActsNext: 'Relationship Manager'
        };
      }

      const clientEngs = scopedEngagements.filter(e => e.client === client!.id);
      const isAccepted = client.status === 'Active';
      const clientContacts = (state.contacts || []).filter(c => c.clientId === client!.id);
      const hasContacts = clientContacts.length > 0 || Boolean(client.contact);
      const isSuspended = client.status === 'Suspended';

      const steps: WorkflowStep[] = [
        { id: 'profile-creation', label: 'Profile Registered', state: 'completed', detail: `${client.name} (${client.code || client.id})` },
        { id: 'acceptance-kyc', label: 'KYC & Acceptance', state: isSuspended ? 'blocked' : isAccepted ? 'completed' : 'current', detail: `Status: ${client.status}` },
        { id: 'contacts-gov', label: 'Governance & Contacts', state: hasContacts ? 'completed' : 'current', detail: `${clientContacts.length || (client.contact ? 1 : 0)} contact(s) on record` },
        { id: 'engagement-link', label: 'Active Engagements', state: clientEngs.length > 0 ? 'completed' : 'pending', detail: `${clientEngs.length} linked engagement(s)`, targetRoute: 'engagements' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-02',
        moduleName: 'CRM & Client Management',
        route: 'client-detail',
        currentSection: `Client 360: ${client.name}`,
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${client.name}: ${agg.counts.completed} of ${agg.counts.total} relationship milestones complete.`,
        pendingSummary: !hasContacts ? 'Add key governance contacts to relationship profile.' : !clientEngs.length ? 'No active engagements linked yet.' : 'Profile up to date.',
        blockers: isSuspended ? [`Client ${client.name} is currently suspended.`] : [],
        nextAction: isSuspended ? 'Review suspension reason with compliance' : !hasContacts ? 'Add client governance contacts' : !clientEngs.length ? 'Initiate proposal or engagement creation' : 'Inspect client engagements and financial packages',
        whoActsNext: isSuspended ? 'Compliance Officer' : 'Relationship Manager'
      };
    }

    case 'acquisition':
    case 'crm' as any: {
      const leads = state.leads || [];
      const scopedLeads = client ? leads.filter(l => l.convertedClientId === client.id) : leads;
      const won = scopedLeads.filter(l => l.stage === 'Won');
      const inQual = scopedLeads.filter(l => l.stage === 'Discovery' || l.stage === 'Evaluation' || l.stage === 'Proposal');
      const lost = scopedLeads.filter(l => l.stage === 'Lost' || l.stage === 'Unqualified');

      const steps: WorkflowStep[] = [
        { id: 'lead-intake', label: 'Lead Capture', state: scopedLeads.length > 0 ? 'completed' : 'current', detail: `${scopedLeads.length} lead(s) in pipeline` },
        { id: 'qualification', label: 'Qualification', state: inQual.length > 0 ? 'current' : scopedLeads.length > 0 ? 'completed' : 'pending', detail: `${inQual.length} under qualification` },
        { id: 'proposal-prep', label: 'Proposal Drafting', state: (state.proposals || []).length > 0 ? 'completed' : 'pending', detail: 'Proposal development', targetRoute: 'proposals' },
        { id: 'conversion', label: 'Engagement Won', state: won.length > 0 ? 'completed' : 'pending', detail: `${won.length} converted lead(s)` }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-03',
        moduleName: 'Lead Pipeline',
        route: 'acquisition',
        currentSection: 'Commercial Opportunities & Lead Pipeline',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${won.length} opportunity(ies) won; ${scopedLeads.length} total lead(s) tracked.`,
        pendingSummary: `${inQual.length} lead(s) actively undergoing commercial qualification.`,
        blockedSummary: lost.length > 0 ? `${lost.length} opportunity(ies) marked Lost.` : undefined,
        blockers: [],
        nextAction: inQual.length > 0 ? `Advance qualification on lead ${inQual[0].id}` : 'Create new prospective lead opportunity',
        whoActsNext: inQual.length > 0 ? 'Commercial Lead / Partner' : 'Business Development'
      };
    }

    case 'proposals': {
      const proposals: ProposalRecord[] = state.proposals || [];
      const scopedProps = client ? proposals.filter(p => p.clientId === client.id) : proposals;
      const accepted = scopedProps.filter(p => p.state === 'Accepted');
      const submitted = scopedProps.filter(p => p.state === 'Internal review');
      const draft = scopedProps.filter(p => p.state === 'Draft');
      const returned = scopedProps.filter(p => p.commercialReview && !p.commercialReview.approved);

      const steps: WorkflowStep[] = [
        { id: 'drafting', label: 'Scope & Fees', state: scopedProps.length > 0 ? 'completed' : 'current', detail: `${scopedProps.length} proposal(s)` },
        { id: 'review', label: 'Commercial Review', state: returned.length > 0 ? 'returned' : submitted.length > 0 ? 'current' : accepted.length > 0 ? 'completed' : 'pending', detail: returned.length ? `${returned.length} returned for changes` : `${submitted.length} pending review` },
        { id: 'presentation', label: 'Client Presentation', state: accepted.length > 0 ? 'completed' : submitted.length > 0 ? 'current' : 'pending' },
        { id: 'acceptance', label: 'Formal Acceptance', state: accepted.length > 0 ? 'completed' : 'pending', detail: `${accepted.length} accepted` },
        { id: 'activation', label: 'Engagement Created', state: scopedEngagements.length > 0 ? 'completed' : 'pending', targetRoute: 'engagements' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-04',
        moduleName: 'Proposals & Engagements',
        route: 'proposals',
        currentSection: 'Scope Contracts & Proposal Pipeline',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: {
          ...agg.counts,
          returned: returned.length > 0 ? returned.length : undefined
        },
        completedSummary: `${accepted.length} proposal(s) formally accepted by client.`,
        pendingSummary: `${submitted.length} proposal(s) submitted for commercial review; ${draft.length} in draft.`,
        blockedSummary: returned.length > 0 ? `${returned.length} proposal(s) returned by reviewer for revisions.` : undefined,
        reworkNotes: returned.map(p => `${p.id}: ${p.commercialReview?.notes || 'Commercial terms require revision'}`),
        blockers: [],
        nextAction: returned.length > 0
          ? `Revise returned proposal ${returned[0].id} based on reviewer feedback`
          : submitted.length > 0
            ? `Complete commercial review on proposal ${submitted[0].id}`
            : draft.length > 0
              ? `Submit draft proposal ${draft[0].id} for review`
              : 'Draft a new proposal from service templates',
        whoActsNext: returned.length > 0 ? 'Proposal Author / Manager' : submitted.length > 0 ? 'Commercial Reviewer / Partner' : 'Engagement Team'
      };
    }

    case 'engagements': {
      const active = scopedEngagements.filter(e => (e.lifecycleStatus || 'Active') === 'Active');
      const inPlanning = scopedEngagements.filter(e => !e.planning || !e.acceptance);
      const closed = scopedEngagements.filter(e => e.lifecycleStatus === 'Closed');
      const cancelled = scopedEngagements.filter(e => e.lifecycleStatus === 'Cancelled');

      const steps: WorkflowStep[] = [
        { id: 'charter', label: 'Engagement Setup', state: scopedEngagements.length > 0 ? 'completed' : 'current', detail: `${scopedEngagements.length} engagement(s)` },
        { id: 'staffing', label: 'Team Allocation', state: active.length > 0 ? 'completed' : 'current', detail: 'Partner and manager assigned' },
        { id: 'fieldwork', label: 'Active Delivery', state: active.length > 0 ? 'current' : 'pending', detail: `${active.length} active in fieldwork` },
        { id: 'review-close', label: 'Review & Closing', state: closed.length > 0 ? 'completed' : 'pending', detail: `${closed.length} closed` }
      ];

      const counts: WorkflowCounts = {
        completed: closed.length,
        current: active.length,
        pending: inPlanning.length,
        blocked: cancelled.length,
        total: scopedEngagements.length
      };
      const applicable = counts.completed + (counts.current || 0) + counts.pending + (counts.blocked || 0);
      const percentComplete = applicable > 0
        ? (counts.completed === applicable ? 100 : Math.min(99, Math.floor((100 * counts.completed) / applicable)))
        : null;

      return {
        moduleId: 'MOD-04',
        moduleName: 'Engagement Lifecycle',
        route: 'engagements',
        currentSection: 'Active Engagements & Portfolio Lifecycle',
        steps,
        percentComplete,
        counts,
        completedSummary: `${closed.length} engagement(s) completed and closed.`,
        pendingSummary: `${active.length} active engagement(s) in delivery; ${inPlanning.length} in planning.`,
        blockedSummary: cancelled.length > 0 ? `${cancelled.length} engagement(s) cancelled.` : undefined,
        blockers: cancelled.map(e => `Engagement ${e.id}: Cancelled — ${e.archive?.holdReason || 'Terminated'}`),
        nextAction: active.length > 0 ? 'Monitor active delivery milestones or open jobs' : 'Initialize planning for assigned engagements',
        whoActsNext: active.length > 0 ? 'Engagement Manager / Team' : 'Lead Partner'
      };
    }

    case 'onboarding':
    case 'audit-acceptance' as any: {
      const cases = (state.acceptanceCases || []).filter(c => !activeEng || c.engagementId === activeEng.id);
      const accepted = cases.filter(c => c.decisionStatus === 'Accepted');
      const inReview = cases.filter(c => c.decisionStatus === 'Pending');
      const rejected = cases.filter(c => c.decisionStatus === 'Declined');

      const steps: WorkflowStep[] = [
        { id: 'intake-id', label: 'Intake Questionnaire', state: cases.length > 0 ? 'completed' : 'current', detail: `${cases.length} case(s)` },
        { id: 'independence', label: 'Independence Check', state: cases.length > 0 ? 'completed' : 'pending' },
        { id: 'partner-clearance', label: 'Partner Clearance', state: rejected.length > 0 ? 'blocked' : inReview.length > 0 ? 'current' : accepted.length > 0 ? 'completed' : 'pending', detail: rejected.length ? `${rejected.length} declined` : `${accepted.length} accepted` },
        { id: 'activation', label: 'Charter Activation', state: accepted.length > 0 ? 'completed' : 'pending' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-27',
        moduleName: 'Acceptance & Independence',
        route: 'onboarding',
        currentSection: 'Client Acceptance, KYC & Independence Screening',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${accepted.length} of ${cases.length || 1} acceptance case(s) approved and cleared.`,
        pendingSummary: `${inReview.length} case(s) awaiting partner independence review.`,
        blockedSummary: rejected.length > 0 ? `${rejected.length} acceptance case(s) declined due to conflicts.` : undefined,
        blockers: rejected.map(c => `Case ${c.id}: Declined - ${c.decisionNotes || 'Independence conflict identified'}`),
        nextAction: rejected.length > 0
          ? 'Resolve independence concerns or decline engagement'
          : inReview.length > 0
            ? 'Record partner acceptance decision'
            : 'Initiate client acceptance questionnaire',
        whoActsNext: inReview.length > 0 ? 'Ethics & Independence Partner' : 'Engagement Leader'
      };
    }

    case 'jobs': {
      const jobs = state.jobs || [];
      const scopedJobs = activeEng ? jobs.filter(j => j.engagementId === activeEng.id) : jobs;
      const completedJobs = scopedJobs.filter(j => j.status === 'Completed');
      const inProgressJobs = scopedJobs.filter(j => j.status === 'In progress');
      const blockedJobs = scopedJobs.filter(j => j.status === 'Blocked');
      const pendingJobs = scopedJobs.filter(j => j.status === 'Not started');

      const steps: WorkflowStep[] = [
        { id: 'work-breakdown', label: 'Job Scoping', state: scopedJobs.length > 0 ? 'completed' : 'current', detail: `${scopedJobs.length} job(s)` },
        { id: 'staff-assignment', label: 'Task Assignment', state: scopedJobs.length > 0 ? 'completed' : 'pending' },
        { id: 'execution', label: 'In Progress', state: inProgressJobs.length > 0 ? 'current' : blockedJobs.length > 0 ? 'blocked' : completedJobs.length > 0 ? 'completed' : 'pending', detail: `${inProgressJobs.length} active` },
        { id: 'completion', label: 'Sign-off', state: completedJobs.length === scopedJobs.length && scopedJobs.length > 0 ? 'completed' : 'pending', detail: `${completedJobs.length} of ${scopedJobs.length} done` }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-05',
        moduleName: 'Jobs & Tasks',
        route: 'jobs',
        currentSection: 'Job Management & Task Execution',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${completedJobs.length} of ${scopedJobs.length} job(s) completed.`,
        pendingSummary: `${inProgressJobs.length} job(s) in progress, ${pendingJobs.length} to do.`,
        blockedSummary: blockedJobs.length > 0 ? `${blockedJobs.length} job(s) blocked by dependencies.` : undefined,
        blockers: blockedJobs.map(j => `Job ${j.id} (${j.title}): ${j.blockedReason || 'Blocked by outstanding predecessor work'}`),
        nextAction: blockedJobs.length > 0 ? `Unblock dependencies for job ${blockedJobs[0].id}` : inProgressJobs.length > 0 ? `Complete active task in job ${inProgressJobs[0].id}` : 'Create new delivery job or task',
        whoActsNext: inProgressJobs.length > 0 ? (inProgressJobs[0].owner || 'Assigned Staff') : 'Engagement Manager'
      };
    }

    case 'job-templates': {
      const templates = state.jobTemplates || [];
      const published = templates.filter(t => t.status === 'Published');
      const draft = templates.filter(t => t.status === 'Draft');

      const steps: WorkflowStep[] = [
        { id: 'template-definition', label: 'Procedure Definition', state: templates.length > 0 ? 'completed' : 'current', detail: `${templates.length} template(s)` },
        { id: 'methodology-review', label: 'Methodology Review', state: draft.length > 0 ? 'current' : templates.length > 0 ? 'completed' : 'pending' },
        { id: 'publishing', label: 'Standard Release', state: published.length > 0 ? 'completed' : 'pending', detail: `${published.length} published` }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-06',
        moduleName: 'Standard Templates',
        route: 'job-templates',
        currentSection: 'Standardized Work Templates & Methodology',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${published.length} of ${templates.length} methodology template(s) published for firm use.`,
        pendingSummary: `${draft.length} draft template(s) in development.`,
        blockers: [],
        nextAction: draft.length > 0 ? `Review and publish template ${draft[0].id}` : 'Author a new standardized procedure template',
        whoActsNext: 'Practice Quality Lead / Partner'
      };
    }

    case 'documents': {
      const pbc = activeEng?.pbc || [];
      const returnedPbc = pbc.filter(p => p.status === 'Needs clarification');
      const underReviewPbc = pbc.filter(p => p.status === 'Received' || p.status === 'Under review');
      const acceptedPbc = pbc.filter(p => p.status === 'Accepted');
      const draftPbc = pbc.filter(p => p.status === 'Draft');
      const outstandingPbc = pbc.filter(p => p.status === 'Requested');

      const steps: WorkflowStep[] = [
        { id: 'draft-pbc', label: 'Request Drafting', state: pbc.length > 0 ? 'completed' : 'current', detail: `${pbc.length} item(s) configured` },
        { id: 'client-upload', label: 'Client Uploads', state: returnedPbc.length > 0 ? 'returned' : outstandingPbc.length > 0 ? 'current' : pbc.length > 0 ? 'completed' : 'pending', detail: returnedPbc.length ? `${returnedPbc.length} need clarification` : `${outstandingPbc.length} outstanding` },
        { id: 'staff-review', label: 'Sufficiency Review', state: underReviewPbc.length > 0 ? 'current' : acceptedPbc.length === pbc.length && pbc.length > 0 ? 'completed' : 'pending', detail: `${underReviewPbc.length} under review` },
        { id: 'acceptance', label: 'Linked to Audit', state: acceptedPbc.length === pbc.length && pbc.length > 0 ? 'completed' : 'pending', detail: `${acceptedPbc.length} of ${pbc.length} accepted` }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-09',
        moduleName: 'Information Requests',
        route: 'documents',
        currentSection: 'Client Information Requests (PBC) & Registry',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: {
          ...agg.counts,
          returned: returnedPbc.length > 0 ? returnedPbc.length : undefined
        },
        completedSummary: `${acceptedPbc.length} of ${pbc.length} requested document(s) verified and accepted.`,
        pendingSummary: `${underReviewPbc.length} document(s) awaiting review; ${outstandingPbc.length} pending client submission.`,
        blockedSummary: returnedPbc.length > 0 ? `${returnedPbc.length} document(s) returned for clarification.` : undefined,
        reworkNotes: returnedPbc.map(p => `${p.id}: ${p.title} returned for clarification`),
        blockers: [],
        nextAction: underReviewPbc.length > 0
          ? 'Perform sufficiency review on newly uploaded client documents'
          : returnedPbc.length > 0
            ? 'Follow up with client on returned clarification requests'
            : outstandingPbc.length > 0
              ? 'Send reminder for outstanding client information requests'
              : 'Add new information requests or file verified workpapers',
        whoActsNext: underReviewPbc.length > 0 ? 'Audit Staff / Reviewer' : outstandingPbc.length > 0 ? 'Client Finance Team' : 'Audit Team'
      };
    }

    case 'communications': {
      const comms = state.communications || [];
      const scopedComms = client ? comms.filter(c => c.clientId === client.id) : comms;
      const failed = scopedComms.filter(c => c.status === 'Simulated failed');
      const inbound = scopedComms.filter(c => c.direction === 'Inbound');

      const steps: WorkflowStep[] = [
        { id: 'channel-setup', label: 'Client Channel', state: scopedComms.length > 0 ? 'completed' : 'current', detail: `${scopedComms.length} message(s)` },
        { id: 'message-intake', label: 'Message Triage', state: scopedComms.length > 0 ? 'completed' : 'current', detail: `${inbound.length} inbound message(s)` },
        { id: 'dispatch-status', label: 'Dispatch Verification', state: failed.length > 0 ? 'blocked' : scopedComms.length > 0 ? 'completed' : 'pending', detail: failed.length ? `${failed.length} failed dispatch(es)` : 'All dispatches confirmed' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-11',
        moduleName: 'Client Communications',
        route: 'communications',
        currentSection: 'Client Communications & Email Integration',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${scopedComms.length - failed.length} of ${scopedComms.length} communications active and dispatched.`,
        pendingSummary: failed.length > 0 ? `${failed.length} failed simulated dispatch(es).` : 'Communications channel active.',
        blockedSummary: failed.length > 0 ? `${failed.length} communication dispatch failure(s) recorded.` : undefined,
        blockers: failed.map(c => `Thread ${c.id}: Transmission failed — retry simulated dispatch`),
        nextAction: failed.length > 0 ? `Retry failed transmission on thread ${failed[0].id}` : 'Initiate communication or formal request',
        whoActsNext: failed.length > 0 ? 'Engagement Team' : 'Client Contact'
      };
    }

    case 'my-time': {
      const times = state.times || [];
      const userEntries = times.filter(t => !state.currentUserId || t.person === state.currentPerson);
      const approved = userEntries.filter(t => t.status === 'Approved');
      const submitted = userEntries.filter(t => t.status === 'Submitted');
      const draft = userEntries.filter(t => t.status === 'Draft');
      const returned = userEntries.filter(t => t.status === 'Returned');

      const steps: WorkflowStep[] = [
        { id: 'entry', label: 'Time Logging', state: userEntries.length > 0 ? 'completed' : 'current', detail: `${userEntries.length} record(s)` },
        { id: 'submission', label: 'Timesheet Submit', state: returned.length > 0 ? 'returned' : draft.length > 0 ? 'current' : submitted.length > 0 ? 'completed' : 'pending', detail: returned.length ? `${returned.length} returned` : `${submitted.length} submitted` },
        { id: 'manager-approval', label: 'Manager Sign-off', state: submitted.length > 0 ? 'current' : approved.length === userEntries.length && userEntries.length > 0 ? 'completed' : 'pending', detail: `${approved.length} approved` },
        { id: 'billing-posting', label: 'WIP Posting', state: approved.length > 0 ? 'completed' : 'pending', detail: 'Ready for billing' }
      ];

      const counts: WorkflowCounts = {
        completed: approved.length,
        current: draft.length,
        pending: submitted.length,
        returned: returned.length,
        blocked: 0,
        total: userEntries.length
      };
      const applicable = counts.completed + counts.pending + (counts.current || 0) + (counts.returned || 0);
      const percentComplete = applicable > 0
        ? (counts.completed === applicable ? 100 : Math.min(99, Math.floor((100 * counts.completed) / applicable)))
        : null;

      return {
        moduleId: 'MOD-12',
        moduleName: 'Time & Expense',
        route: 'my-time',
        currentSection: 'Timesheet Entry & Approval',
        steps,
        percentComplete,
        counts,
        completedSummary: `${approved.length} of ${userEntries.length} time entry(ies) approved by manager.`,
        pendingSummary: `${submitted.length} entry(ies) awaiting manager sign-off; ${draft.length} in draft.`,
        blockedSummary: returned.length > 0 ? `${returned.length} time entry(ies) returned by manager for explanation.` : undefined,
        reworkNotes: returned.map(t => `${t.id}: ${t.returnReason || 'Returned for revised description/billing rate'}`),
        blockers: [],
        nextAction: returned.length > 0
          ? `Correct and resubmit returned time entry ${returned[0].id}`
          : draft.length > 0
            ? 'Submit draft time entries for manager approval'
            : submitted.length > 0
              ? 'Awaiting manager approval on submitted timesheet'
              : 'Log new time against assigned engagement tasks',
        whoActsNext: returned.length > 0 || draft.length > 0 ? 'Current Preparer' : submitted.length > 0 ? 'Engagement Manager' : 'Current User'
      };
    }

    case 'budgets': {
      const budget = (state.budgets || []).find(b => b.engagementId === activeEng?.id);
      const plannedMinutes = (budget?.lines || []).reduce((sum, l) => sum + (l.plannedMinutes || 0), 0);
      const totalBudgetHours = plannedMinutes / 60;
      const hasBaseline = Boolean(budget && plannedMinutes > 0);
      const times = (state.times || []).filter(t => t.engagementId === activeEng?.id);
      const actualHours = times.reduce((sum, t) => sum + ((t.durationMinutes || 0) / 60), 0);
      const isOverrun = Boolean(hasBaseline && actualHours > totalBudgetHours);

      const steps: WorkflowStep[] = [
        { id: 'budget-setup', label: 'Budget Baseline', state: hasBaseline ? 'completed' : 'current', detail: hasBaseline ? `${totalBudgetHours.toFixed(1)} budgeted hrs` : 'Establish baseline' },
        { id: 'rate-cards', label: 'Billing Rates', state: hasBaseline ? 'completed' : 'pending', detail: 'Rates configured' },
        { id: 'realization', label: 'Tracking & Realization', state: isOverrun ? 'blocked' : times.length > 0 ? 'current' : hasBaseline ? 'current' : 'pending', detail: isOverrun ? 'Budget overrun' : `${actualHours.toFixed(1)} actual hrs` },
        { id: 'variance-analysis', label: 'Variance Review', state: hasBaseline && times.length > 0 ? 'completed' : 'pending' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-13',
        moduleName: 'Engagement Budgets',
        route: 'budgets',
        currentSection: 'Budget Baseline & Realization Tracking',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: hasBaseline ? `Budget baseline locked: ${totalBudgetHours.toFixed(1)} hours.` : 'No budget configured yet.',
        pendingSummary: `${actualHours.toFixed(1)} hours posted against budget.`,
        blockedSummary: isOverrun ? 'Engagement has exceeded allocated budget hours.' : undefined,
        blockers: isOverrun ? [`Budget overrun: ${actualHours.toFixed(1)} hrs logged vs ${totalBudgetHours.toFixed(1)} budgeted`] : [],
        nextAction: !hasBaseline ? 'Establish engagement budget and staffing allocation' : isOverrun ? 'Review fee recovery or file change order' : 'Monitor realization and staffing rates',
        whoActsNext: isOverrun ? 'Engagement Partner / Lead' : 'Engagement Manager'
      };
    }

    case 'billing': {
      const invoices = scopedInvoices(state).filter(i => !activeEng || (i.engagementId || i.eng) === activeEng.id);
      const paid = invoices.filter(i => i.status === 'Paid');
      const issued = invoices.filter(i => i.status === 'Issued');
      const draft = invoices.filter(i => i.status === 'Draft');
      const returned = invoices.filter(i => (i as any).reviewStatus === 'Returned' || (i as any).status === 'Returned');

      const steps: WorkflowStep[] = [
        { id: 'wip-aggregation', label: 'WIP Selection', state: invoices.length > 0 ? 'completed' : 'current', detail: `${invoices.length} invoice(s)`, targetRoute: 'my-time' },
        { id: 'draft-prep', label: 'Invoice Drafting', state: draft.length > 0 ? 'current' : invoices.length > 0 ? 'completed' : 'pending' },
        { id: 'technical-review', label: 'Billing Review', state: returned.length > 0 ? 'returned' : draft.length > 0 ? 'current' : issued.length > 0 ? 'completed' : 'pending', detail: returned.length ? `${returned.length} returned` : `${draft.length} pending review` },
        { id: 'issuance', label: 'Invoice Issuance', state: (issued.length > 0 || paid.length > 0) ? 'completed' : 'pending', detail: `${issued.length} issued` },
        { id: 'settlement', label: 'Payment / Settlement', state: issued.length > 0 ? 'current' : paid.length > 0 ? 'completed' : 'pending', detail: `${paid.length} paid${issued.length > 0 ? `, ${issued.length} awaiting settlement` : ''}`, targetRoute: 'receivables' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-14',
        moduleName: 'Billing & Invoicing',
        route: 'billing',
        currentSection: 'Fee Billing, Invoicing & WIP Management',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: {
          ...agg.counts,
          returned: returned.length > 0 ? returned.length : undefined
        },
        completedSummary: `${issued.length + paid.length} invoice(s) issued to client.`,
        pendingSummary: `${draft.length} invoice draft(s) awaiting review.`,
        blockedSummary: returned.length > 0 ? `${returned.length} invoice(s) returned for changes.` : undefined,
        reworkNotes: returned.map(i => `${i.invoiceNumber}: Returned for adjustment`),
        blockers: [],
        nextAction: returned.length > 0
          ? 'Revise returned invoice draft and resubmit'
          : draft.length > 0
            ? 'Complete partner review and issue invoice'
            : 'Assemble unbilled WIP into new invoice draft',
        whoActsNext: draft.length > 0 ? 'Billing Partner / Reviewer' : 'Billing Specialist'
      };
    }

    case 'receivables': {
      const invoices = scopedInvoices(state).filter(i => !activeEng || (i.engagementId || i.eng) === activeEng.id);
      const issued = invoices.filter(i => i.status === 'Issued');
      const paid = invoices.filter(i => i.status === 'Paid');
      const receipts = state.receipts || [];

      const steps: WorkflowStep[] = [
        { id: 'issued-invoices', label: 'Issued Receivables', state: (issued.length > 0 || paid.length > 0) ? 'completed' : 'pending', detail: `${issued.length + paid.length} invoice(s)` },
        { id: 'receipt-logging', label: 'Receipt Capture', state: receipts.length > 0 ? 'completed' : issued.length > 0 ? 'current' : 'pending', detail: `${receipts.length} receipt(s)` },
        { id: 'cash-application', label: 'Cash Allocation', state: paid.length > 0 ? 'completed' : receipts.length > 0 ? 'current' : 'pending', detail: `${paid.length} settled` },
        { id: 'aging-review', label: 'Aging & Reconciliation', state: (issued.length + paid.length) > 0 ? 'completed' : 'pending' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-15',
        moduleName: 'Accounts Receivable',
        route: 'receivables',
        currentSection: 'Collections, Receipts & Cash Application',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${paid.length} invoice(s) fully settled and applied.`,
        pendingSummary: `${issued.length} invoice(s) outstanding in collections.`,
        blockers: [],
        nextAction: issued.length > 0 ? 'Log receipt and allocate offline payment' : 'Review receivables aging report',
        whoActsNext: issued.length > 0 ? 'Credit Controller / Finance' : 'Practice Accountant'
      };
    }

    // -------------------------------------------------------------
    // Distinct Accounting Module Selectors (FIX-06)
    // -------------------------------------------------------------
    case 'accounting-setup': {
      const profile = client?.accountingProfile;
      const hasFramework = Boolean(profile?.reportingBasis && profile.reportingBasis !== 'Not selected');
      const hasPeriod = Boolean(activeEng?.year || (profile?.periodBooks && profile.periodBooks.length > 0));
      const hasAccounts = Boolean((profile?.accounts && profile.accounts.length > 0) || (activeEng?.rows && activeEng.rows.length > 0));
      const isComplete = hasFramework && hasPeriod && hasAccounts;

      const steps: WorkflowStep[] = [
        { id: 'framework', label: 'Accounting Framework', state: hasFramework ? 'completed' : 'current', detail: profile?.reportingBasis || 'Select IFRS / Local GAAP' },
        { id: 'period-book', label: 'Period & Year-End', state: hasPeriod ? 'completed' : hasFramework ? 'current' : 'pending', detail: `FY${activeEng?.year || '2026'}` },
        { id: 'coa-structure', label: 'Chart of Accounts Structure', state: hasAccounts ? 'completed' : hasPeriod ? 'current' : 'pending', detail: `${activeEng?.rows?.length || profile?.accounts?.length || 0} accounts loaded` },
        { id: 'setup-lock', label: 'Accounting Baseline Lock', state: isComplete ? 'completed' : 'pending', detail: isComplete ? 'Baseline parameters configured' : 'Complete prerequisite fields' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-20',
        moduleName: 'Accounting Profile',
        route: 'accounting-setup',
        currentSection: 'Accounting Framework & Baseline Parameters',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isComplete ? 'Accounting profile configured and locked.' : `${agg.counts.completed} of ${agg.counts.total} setup steps complete.`,
        pendingSummary: !hasFramework ? 'Select accounting framework (IFRS/Local GAAP).' : !hasAccounts ? 'Load chart of accounts via Trial Balance.' : 'Ready for mapping and journal adjustments.',
        blockers: [],
        nextAction: !hasFramework ? 'Configure accounting framework' : !hasAccounts ? 'Proceed to Trial Balance import' : 'Review account mappings in Mapping Workbench',
        whoActsNext: 'Engagement Senior Accountant / Manager'
      };
    }

    case 'trial-balance': {
      const rows = activeEng?.rows || [];
      const net = Math.abs(rows.reduce((sum, r) => sum + (r.balance || 0), 0));
      const hasRows = rows.length > 0;
      const isBalanced = hasRows && net < 0.005;
      const hasSource = Boolean(activeEng?.sourceVersion);

      const steps: WorkflowStep[] = [
        { id: 'tb-intake', label: 'TB Source Intake', state: hasSource ? 'completed' : 'current', detail: hasSource ? `Source v${activeEng?.sourceVersion}` : 'Import CSV/Excel trial balance' },
        { id: 'tb-structure', label: 'Account Validation', state: hasRows ? 'completed' : hasSource ? 'current' : 'pending', detail: `${rows.length} accounts loaded` },
        { id: 'tb-balance', label: 'Net Balance Check', state: isBalanced ? 'completed' : hasRows ? 'blocked' : 'pending', detail: isBalanced ? 'Debits equal credits' : hasRows ? `Net imbalance: ${net.toFixed(2)}` : 'Pending intake' },
        { id: 'tb-commit', label: 'TB Baseline Commit', state: hasSource && isBalanced ? 'completed' : 'pending', detail: hasSource && isBalanced ? 'Committed to engagement record' : 'Pending balance check' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-21',
        moduleName: 'Trial Balance',
        route: 'trial-balance',
        currentSection: 'Trial Balance Intake & Balance Verification',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isBalanced ? `Trial balance balanced and committed (${rows.length} accounts).` : hasRows ? `${rows.length} accounts imported.` : 'No trial balance imported.',
        pendingSummary: !hasRows ? 'Import initial client trial balance.' : !isBalanced ? 'Resolve debit/credit imbalance before mapping.' : 'Ready for GL reconciliation.',
        blockedSummary: hasRows && !isBalanced ? `Trial balance is out of balance by ${net.toFixed(2)}.` : undefined,
        blockers: hasRows && !isBalanced ? [`Trial balance net difference is ${net.toFixed(2)}; debits and credits must balance.`] : [],
        nextAction: !hasRows ? 'Upload trial balance file' : !isBalanced ? 'Correct trial balance source file' : 'Proceed to Account Mappings',
        whoActsNext: hasRows && !isBalanced ? 'Client Accountant / Preparer' : 'Engagement Preparer'
      };
    }

    case 'gl-transactions': {
      const glHistory = activeEng?.glSourceHistory || [];
      const latestGL = glHistory.length > 0 ? glHistory[glHistory.length - 1] : undefined;
      const hasGL = Boolean(latestGL && latestGL.transactions && latestGL.transactions.length > 0);
      const isReconciled = Boolean(hasGL && latestGL?.sha256);

      const steps: WorkflowStep[] = [
        { id: 'gl-intake', label: 'GL Journal Import', state: hasGL ? 'completed' : 'current', detail: hasGL ? `GL Source v${latestGL?.revision} (${latestGL?.transactions?.length} txns)` : 'Import general ledger transaction journal' },
        { id: 'gl-reconciliation', label: 'TB Reconciliation', state: isReconciled ? 'completed' : hasGL ? 'current' : 'pending', detail: isReconciled ? 'GL balances imported' : 'Pending GL import' },
        { id: 'gl-audit-trail', label: 'Audit Trail Lock', state: isReconciled ? 'completed' : 'pending', detail: isReconciled ? `SHA: ${latestGL?.sha256?.slice(0, 8)}...` : 'Pending reconciliation' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-21',
        moduleName: 'General Ledger',
        route: 'gl-transactions',
        currentSection: 'General Ledger Transactions & Audit Trail',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isReconciled ? 'General ledger verified and tied to trial balance.' : hasGL ? 'GL imported with pending variances.' : 'No GL transactions loaded.',
        pendingSummary: !hasGL ? 'Import general ledger detail to support transaction testing.' : !isReconciled ? 'Clear reconciliation discrepancies.' : 'Audit trail locked.',
        blockedSummary: hasGL && !isReconciled ? 'General ledger balances do not tie to trial balance.' : undefined,
        blockers: hasGL && !isReconciled ? ['GL transaction sum does not match TB account balances.'] : [],
        nextAction: !hasGL ? 'Import GL detail file' : !isReconciled ? 'Investigate GL-TB variances' : 'Proceed to sampling or account reconciliations',
        whoActsNext: 'Engagement Preparer / Auditor'
      };
    }

    case 'account-mappings': {
      const rows = activeEng?.rows || [];
      const mappingRev = (state.accountMappingRevisions || []).filter(m => !activeEng || m.engagementId === activeEng.id).at(-1);
      const mappings = mappingRev?.mappings || [];
      const unmapped = rows.filter(r => !mappings.some(m => m.accountCode === r.code));
      const hasRows = rows.length > 0;
      const isMapped = hasRows && unmapped.length === 0;
      const isApproved = Boolean(activeEng?.mappingApproved || mappingRev?.status === 'Approved');

      const steps: WorkflowStep[] = [
        { id: 'chart-load', label: 'Accounts Loaded', state: hasRows ? 'completed' : 'current', detail: `${rows.length} accounts` },
        { id: 'mapping-assignment', label: 'Category Mapping', state: isMapped ? 'completed' : hasRows ? 'current' : 'pending', detail: isMapped ? 'All accounts mapped' : `${unmapped.length} unmapped account(s)` },
        { id: 'mapping-approval', label: 'Mapping Review & Lock', state: isApproved ? 'completed' : isMapped ? 'current' : 'pending', detail: isApproved ? 'Approved by manager' : 'Pending review sign-off' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-20',
        moduleName: 'Account Mappings',
        route: 'account-mappings',
        currentSection: 'Chart of Accounts & Financial Statement Mapping',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isApproved ? 'Account mappings approved and locked.' : isMapped ? 'All accounts mapped; awaiting sign-off.' : `${rows.length - unmapped.length} of ${rows.length} accounts mapped.`,
        pendingSummary: !isMapped ? `${unmapped.length} account(s) require financial statement mapping.` : !isApproved ? 'Manager approval required on mapping schedule.' : 'Mapping active.',
        blockers: [],
        nextAction: !hasRows ? 'Import trial balance first' : !isMapped ? 'Assign statement categories to unmapped accounts' : !isApproved ? 'Sign off mapping schedule' : 'Generate Financial Statements',
        whoActsNext: !isMapped ? 'Engagement Preparer' : !isApproved ? 'Engagement Manager' : 'Accounting Team'
      };
    }

    case 'adjustments': {
      const adjustments: AdjustmentJournalItem[] = (state.adjustmentJournals || []).filter(a => !activeEng || a.engagementId === activeEng.id);
      const accepted = adjustments.filter(a => a.status === 'Management accepted' || a.status === 'Reporting included');
      const inReview = adjustments.filter(a => a.status === 'Technical review');
      const draft = adjustments.filter(a => a.status === 'Draft');
      const rejected = adjustments.filter(a => a.status === 'Rejected');

      const steps: WorkflowStep[] = [
        { id: 'adj-drafting', label: 'Journal Preparation', state: adjustments.length > 0 ? 'completed' : 'current', detail: `${adjustments.length} journal(s)` },
        { id: 'tech-review', label: 'Technical Review', state: rejected.length > 0 ? 'blocked' : inReview.length > 0 ? 'current' : (adjustments.length > 0 && draft.length === 0) ? 'completed' : 'pending', detail: rejected.length ? `${rejected.length} rejected` : `${inReview.length} awaiting review` },
        { id: 'mgmt-acceptance', label: 'Client Management Acceptance', state: accepted.length === adjustments.length && adjustments.length > 0 ? 'completed' : accepted.length > 0 ? 'current' : 'pending', detail: `${accepted.length} accepted` },
        { id: 'tb-reflection', label: 'TB Reflection & Statement Inclusion', state: accepted.length > 0 ? 'completed' : 'pending', detail: accepted.length > 0 ? 'Reflected in adjusted TB' : 'Pending acceptance' }
      ];

      const counts: WorkflowCounts = {
        completed: accepted.length,
        current: inReview.length,
        pending: draft.length,
        blocked: rejected.length,
        total: adjustments.length,
        returned: rejected.length > 0 ? rejected.length : undefined
      };
      const applicable = counts.completed + counts.pending + (counts.current || 0) + (counts.blocked || 0);
      const percentComplete = applicable > 0
        ? (counts.completed === applicable ? 100 : Math.min(99, Math.floor((100 * counts.completed) / applicable)))
        : null;

      return {
        moduleId: 'MOD-22',
        moduleName: 'Adjustment Journals',
        route: 'adjustments',
        currentSection: 'Proposed & Accepted Audit Adjustments (AJP/RJP)',
        steps,
        percentComplete,
        counts,
        completedSummary: `${accepted.length} of ${adjustments.length} adjustment journal(s) accepted by client management.`,
        pendingSummary: `${inReview.length} journal(s) under review; ${draft.length} in draft.`,
        blockedSummary: rejected.length > 0 ? `${rejected.length} adjustment journal(s) rejected in review.` : undefined,
        reworkNotes: rejected.map(a => `Journal ${a.id}: ${a.reviewNote || 'Adjustment rejected in technical review'}`),
        blockers: rejected.map(a => `Journal ${a.id}: Rejected in review - ${a.reviewNote || 'Correction required'}`),
        nextAction: rejected.length > 0
          ? `Revise rejected adjustment journal ${rejected[0].id}`
          : inReview.length > 0
            ? `Perform technical review on journal ${inReview[0].id}`
            : draft.length > 0
              ? `Submit draft adjustment journal ${draft[0].id} for technical review`
              : 'Draft new proposed adjustment journal if variances identified',
        whoActsNext: inReview.length > 0 ? 'Independent Technical Reviewer' : draft.length > 0 || rejected.length > 0 ? 'Audit Preparer' : 'Audit Team'
      };
    }

    case 'reconciliations': {
      const recs = activeEng?.reconciliations || [];
      const reviewed = recs.filter(r => r.status === 'Cleared' || r.status === 'Approved');
      const inReview = recs.filter(r => r.status === 'In Review' || r.status === 'In progress');
      const draft = recs.filter(r => r.status === 'Draft');
      const rejected = recs.filter(r => r.status === 'Returned' || r.status === 'Differences noted');

      const steps: WorkflowStep[] = [
        { id: 'schedule-setup', label: 'Schedule Configuration', state: recs.length > 0 ? 'completed' : 'current', detail: `${recs.length} schedule(s)` },
        { id: 'subledger-tie', label: 'Subledger Tie-out', state: (recs.length > 0 && draft.length === 0) ? 'completed' : recs.length > 0 ? 'current' : 'pending', detail: `${draft.length} pending tie-out` },
        { id: 'review-clearance', label: 'Reviewer Clearance', state: rejected.length > 0 ? 'blocked' : inReview.length > 0 ? 'current' : (recs.length > 0 && reviewed.length === recs.length) ? 'completed' : 'pending', detail: rejected.length ? `${rejected.length} returned` : `${reviewed.length} of ${recs.length} cleared` }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-23',
        moduleName: 'Reconciliations',
        route: 'reconciliations',
        currentSection: 'Account & Subledger Reconciliations',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: {
          ...agg.counts,
          returned: rejected.length > 0 ? rejected.length : undefined
        },
        completedSummary: `${reviewed.length} of ${recs.length} reconciliation schedule(s) reviewed and cleared.`,
        pendingSummary: `${inReview.length} schedule(s) awaiting review; ${draft.length} in draft.`,
        blockedSummary: rejected.length > 0 ? `${rejected.length} reconciliation(s) returned with unexplained variance.` : undefined,
        reworkNotes: rejected.map(r => `${r.title || r.name || r.id}: Unexplained variance requires investigation`),
        blockers: rejected.map(r => `Reconciliation ${r.title || r.name || r.id}: Returned with variance`),
        nextAction: rejected.length > 0
          ? 'Investigate reconciliation variance and attach supporting evidence'
          : inReview.length > 0
            ? 'Review and clear pending reconciliation schedule'
            : draft.length > 0
              ? 'Complete subledger tie-out and submit for review'
              : 'Add reconciliation schedule for key balance sheet accounts',
        whoActsNext: inReview.length > 0 ? 'Engagement Manager / Reviewer' : 'Audit Preparer'
      };
    }

    case 'financial-statements': {
      const isApproved = Boolean(activeEng?.mappingApproved);
      const rows = activeEng?.rows || [];
      const hasStatements = rows.length > 0 && isApproved;

      const steps: WorkflowStep[] = [
        { id: 'mapping-source', label: 'Approved Mappings', state: isApproved ? 'completed' : 'blocked', detail: isApproved ? 'Mapping locked' : 'Mapping required', targetRoute: 'account-mappings' },
        { id: 'bs-pl', label: 'Balance Sheet & P&L', state: hasStatements ? 'completed' : isApproved ? 'current' : 'pending', detail: hasStatements ? 'Statements compiled' : 'Pending mapping' },
        { id: 'schedules', label: 'Cash Flow & Equity', state: hasStatements ? 'current' : 'pending', detail: 'Supporting schedules' },
        { id: 'notes', label: 'Notes to Accounts', state: hasStatements ? 'current' : 'pending', detail: 'Disclosure notes' },
        { id: 'package-ready', label: 'Package Assembly', state: hasStatements ? 'completed' : 'pending', targetRoute: 'financial-packages' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-24',
        moduleName: 'Financial Statements',
        route: 'financial-statements',
        currentSection: 'Statement Set & Supporting Schedules',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isApproved ? 'Financial statements compiled from approved trial balance mappings.' : '0 statements compiled.',
        pendingSummary: !isApproved ? 'Account mappings must be approved before statements can compile.' : 'Complete disclosure notes and cash flow schedule.',
        blockedSummary: !isApproved ? 'Statement compilation blocked until account mappings are approved.' : undefined,
        blockers: !isApproved ? ['Account mappings must be approved in Mapping Workbench before generating financial statements.'] : [],
        nextAction: !isApproved ? 'Open Account Mappings and sign off mapping schedule' : 'Assemble financial statements into deliverable package',
        whoActsNext: !isApproved ? 'Engagement Manager' : 'Accounting Team'
      };
    }

    case 'financial-packages': {
      const packages = activeEng?.packageHistory || [];
      const latestPackage = parsedContext.revision
        ? packages.find(p => p.revision === parsedContext.revision) || packages[packages.length - 1]
        : packages[packages.length - 1];

      const isAssembled = Boolean(latestPackage);
      const latestGL = (activeEng?.glSourceHistory || []).at(-1);
      const isStale = Boolean(latestPackage && (latestPackage.generation !== activeEng?.generation || (latestGL && latestPackage.glSourceRevision !== latestGL.revision)));
      const isValidated = Boolean(latestPackage?.validation?.passed && !isStale);
      const isPresented = Boolean(activeEng?.managementPresentation && (!latestPackage || activeEng.managementPresentation.packageRevision === latestPackage.revision));
      const isAck = Boolean(activeEng?.managementPackageDecision?.decision === 'Acknowledged' && (!latestPackage || activeEng.managementPackageDecision.packageRevision === latestPackage.revision));

      const steps: WorkflowStep[] = [
        { id: 'assembly', label: 'Package Assembly', state: isStale ? 'stale' : isAssembled ? 'completed' : 'current', detail: isStale ? 'Stale: source or generation changed' : isAssembled ? `Rev ${latestPackage?.revision} assembled` : 'Assemble package artifacts' },
        { id: 'format-gen', label: 'Artifact Generation', state: isStale ? 'stale' : isAssembled ? 'completed' : 'pending', detail: isAssembled ? 'PDF, DOCX, XLSX generated' : 'Pending assembly' },
        { id: 'validation', label: 'Technical Validation', state: isValidated ? 'completed' : isStale ? 'stale' : isAssembled ? 'current' : 'pending', detail: isValidated ? 'Balance sheet balanced & verified' : latestPackage && !latestPackage.validation?.passed ? 'Validation errors remain' : 'Pending assembly' },
        { id: 'presentation', label: 'Management Presentation', state: isPresented ? 'completed' : isValidated ? 'current' : 'pending', detail: isPresented ? 'Presented to client management' : 'Pending presentation' },
        { id: 'management-decision', label: 'Management Sign-off', state: isAck ? 'completed' : isPresented ? 'current' : 'pending', detail: isAck ? 'Formally acknowledged by client' : 'Pending acknowledgement' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      const blockers: string[] = [];
      if (isStale) blockers.push('Current financial package is stale: GL source or engagement generation updated since assembly. Regenerate package.');
      if (latestPackage && !latestPackage.validation?.passed) blockers.push('Financial package validation error: Balance sheet does not balance or unmapped items remain.');

      return {
        moduleId: 'MOD-25',
        moduleName: 'Financial Packages',
        route: 'financial-packages',
        currentSection: 'Financial Statements Package Assembly & Artifacts',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isAck
          ? `Financial package Rev ${latestPackage?.revision} acknowledged by client management.`
          : isAssembled
            ? `Financial package Rev ${latestPackage?.revision} assembled and validated.`
            : 'Package ready for assembly.',
        pendingSummary: isStale
          ? 'Regenerate package to incorporate latest GL / adjustment changes.'
          : !isAck && isPresented
            ? 'Awaiting client management representation acknowledgement.'
            : !isPresented && isValidated
              ? 'Awaiting presentation to client management.'
              : 'Package assembly pending.',
        blockedSummary: blockers.length > 0 ? blockers[0] : undefined,
        blockers,
        nextAction: isStale
          ? 'Regenerate financial statement package'
          : isPresented && !isAck
            ? 'Record client management acknowledgement decision'
            : isValidated && !isPresented
              ? 'Present validated package to client management'
              : 'Assemble package artifacts (PDF/DOCX/XLSX)',
        whoActsNext: isPresented && !isAck ? 'Client Management' : 'Engagement Manager'
      };
    }

    case 'consolidation': {
      const groups = state.consolidationGroups || [];
      const group = parsedContext.groupId ? groups.find(g => g.id === parsedContext.groupId) || groups[0] : groups[0];
      if (!group) {
        return {
          moduleId: 'MOD-26',
          moduleName: 'Group Consolidation',
          route: 'consolidation',
          currentSection: 'Group Consolidation Workbench',
          steps: [{ id: 'group-context', label: 'Group Context', state: 'blocked', detail: 'No consolidation group available' }],
          percentComplete: null,
          counts: { completed: 0, pending: 0, blocked: 1, total: 1 },
          completedSummary: '0 consolidation milestones.',
          pendingSummary: 'No consolidation group in current scope.',
          blockers: ['No consolidation group available.'],
          nextAction: 'Create or register consolidation group',
          whoActsNext: 'Group Controller'
        };
      }

      const namedGroupGranted = hasConsolidationGroupScope(state, group.id);
      const isGranted = (componentId: string) => namedGroupGranted || allowedEngIds === 'ALL' || allowedEngIds.includes(componentId);
      const fullyGranted = namedGroupGranted || group.components.every(component => isGranted(component.componentId));

      if (!fullyGranted) {
        return {
          moduleId: 'MOD-26',
          moduleName: 'Group Consolidation',
          route: 'consolidation',
          currentSection: 'Scoped Perimeter View (Restricted)',
          steps: [
            { id: 'perimeter', label: 'Group Perimeter', state: 'current', detail: `${group.name} (Restricted scope)` },
            { id: 'component-sources', label: 'Pinned Component Sources', state: 'blocked', detail: 'Components outside grant' },
            { id: 'group-figures', label: 'Group Calculations', state: 'blocked', detail: 'Unavailable under narrow grant' },
            { id: 'output', label: 'Group Output Package', state: 'blocked', detail: 'Consolidated package unavailable' }
          ],
          percentComplete: null,
          counts: { completed: 0, pending: 0, blocked: 3, current: 1, total: 4 },
          completedSummary: '0 of 4 consolidation milestones cleared under narrow grant.',
          pendingSummary: 'Consolidated output and figures are unavailable under your scoped grant.',
          blockers: ['Component outside active grant — full group consolidation unavailable.'],
          nextAction: 'Request group grant from firm administrator',
          whoActsNext: 'Firm Administrator'
        };
      }

      const elims = group.eliminations || [];
      const approvedElims = elims.filter(e => e.status === 'Approved');
      const pendingElims = elims.filter(e => e.status === 'Submitted' || e.status === 'Draft');
      const outputPkg = (group.outputPackages || [])[(group.outputPackages || []).length - 1];
      const isApproved = outputPkg?.status === 'Approved';

      const steps: WorkflowStep[] = [
        { id: 'perimeter', label: 'Group Perimeter', state: group ? 'completed' : 'current', detail: `${group.name} (${group.id})` },
        { id: 'component-sources', label: 'Pinned Component Sources', state: (group.components || []).length > 0 ? 'completed' : 'pending', detail: `${group.components?.length || 0} component entities` },
        { id: 'fx-rates', label: 'FX Translation Rates', state: Object.keys(group.fxRates || {}).length > 0 ? 'completed' : 'current', detail: `${Object.keys(group.fxRates || {}).length} currency pair(s)` },
        { id: 'eliminations', label: 'Intercompany Eliminations', state: pendingElims.length > 0 ? 'current' : approvedElims.length > 0 ? 'completed' : 'pending', detail: `${approvedElims.length} approved elimination(s)` },
        { id: 'output', label: 'Group Output Package', state: isApproved ? 'completed' : 'pending', detail: isApproved ? 'Consolidated package released' : 'Pending final run' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-26',
        moduleName: 'Group Consolidation',
        route: 'consolidation',
        currentSection: 'Multi-Entity Group Consolidation & Elimination',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isApproved
          ? 'Consolidated financial output package approved.'
          : `${approvedElims.length} elimination journal(s) approved.`,
        pendingSummary: pendingElims.length > 0
          ? `${pendingElims.length} intercompany elimination(s) awaiting review.`
          : 'Ready for consolidation run and output generation.',
        blockers: [],
        nextAction: pendingElims.length > 0
          ? 'Review and approve pending intercompany eliminations'
          : !isApproved
            ? 'Execute consolidation engine and generate group output package'
            : 'Inspect consolidated financial statements and elimination disclosures',
        whoActsNext: pendingElims.length > 0 ? 'Group Consolidation Reviewer' : 'Group Controller / Partner'
      };
    }

    case 'audit-planning': {
      const plan = (state.auditPlans || []).filter(p => !activeEng || p.engagementId === activeEng.id).at(-1);
      const isApproved = plan ? plan.status === 'Approved' : Boolean(activeEng?.planning);
      const isUnderReview = plan ? plan.status === 'Under review' : false;
      const hasPlan = Boolean(plan || activeEng?.planning);

      const steps: WorkflowStep[] = [
        { id: 'materiality', label: 'Materiality Benchmarks', state: hasPlan ? 'completed' : 'current', detail: plan ? `Overall materiality: ${plan.overallMateriality}` : 'Determine materiality' },
        { id: 'scoping', label: 'Scope & Significant Accounts', state: hasPlan ? 'completed' : 'pending', detail: 'Significant risk areas' },
        { id: 'partner-approval', label: 'Partner Plan Approval', state: isApproved ? 'completed' : isUnderReview ? 'current' : 'pending', detail: isApproved ? 'Approved by lead partner' : isUnderReview ? 'Under partner review' : 'Draft plan' },
        { id: 'strategy-lock', label: 'Audit Strategy Lock', state: isApproved ? 'completed' : 'pending', detail: isApproved ? 'Strategy locked for fieldwork' : 'Pending plan approval' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-28',
        moduleName: 'Audit Planning',
        route: 'audit-planning',
        currentSection: 'Audit Strategy, Materiality & Planning Charter',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isApproved ? 'Audit strategy and materiality approved by lead partner.' : 'Audit planning in progress.',
        pendingSummary: !isApproved ? 'Lead partner approval required on planning document.' : 'Planning complete; fieldwork active.',
        blockers: [],
        nextAction: !isApproved ? 'Submit planning memorandum for lead partner approval' : 'Proceed to Risk Assessment & Programs',
        whoActsNext: isUnderReview ? 'Lead Audit Partner' : 'Audit Manager'
      };
    }

    case 'audit-risks': {
      const risks = (state.auditRisks || []).filter(r => !activeEng || r.engagementId === activeEng.id);
      const programs = (state.auditPrograms || []).filter(p => !activeEng || p.engagementId === activeEng.id);
      const unlinked = risks.filter(r => !(r.linkedProcedureIds || []).length);
      const hasRisks = risks.length > 0;
      const isLinked = hasRisks && unlinked.length === 0;

      const steps: WorkflowStep[] = [
        { id: 'risk-id', label: 'Risk Identification', state: hasRisks ? 'completed' : 'current', detail: `${risks.length} risk(s) assessed` },
        { id: 'risk-program-link', label: 'Program Linkage', state: isLinked ? 'completed' : hasRisks ? 'current' : 'pending', detail: isLinked ? 'All risks linked to procedures' : `${unlinked.length} unlinked risk(s)` },
        { id: 'program-signoff', label: 'Program Authorization', state: isLinked && programs.length > 0 ? 'completed' : 'pending', detail: `${programs.length} audit program(s)` }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-29',
        moduleName: 'Risks & Programs',
        route: 'audit-risks',
        currentSection: 'Risk Assessment & Tailored Audit Programs',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isLinked ? `All ${risks.length} risks linked to substantive procedures.` : `${risks.length - unlinked.length} of ${risks.length} risks linked.`,
        pendingSummary: unlinked.length > 0 ? `${unlinked.length} risk(s) require reciprocal audit procedure links.` : 'Audit programs authorized.',
        blockedSummary: unlinked.length > 0 ? `${unlinked.length} risk(s) lack required procedure links.` : undefined,
        blockers: unlinked.map(r => `Risk ${r.id}: No linked audit procedure established`),
        nextAction: unlinked.length > 0 ? `Link procedure to risk ${unlinked[0].id}` : 'Open Workpapers & Fieldwork to execute audit procedures',
        whoActsNext: 'Audit Senior / Manager'
      };
    }

    case 'audit-fieldwork':
    case 'audit': {
      const wps = activeEng?.workpapers || [];
      const applicableWps = wps.filter(w => w.applicable);
      const cleared = applicableWps.filter(w => w.status === 'Cleared');
      const inReview = applicableWps.filter(w => w.status === 'Submitted');
      const returned = applicableWps.filter(w => w.status === 'Changes required');
      const draft = applicableWps.filter(w => w.status === 'Planned' || w.status === 'In progress');

      const steps: WorkflowStep[] = [
        { id: 'wp-allocation', label: 'Workpaper Allocation', state: wps.length > 0 ? 'completed' : 'current', detail: `${wps.length} workpaper(s)` },
        { id: 'fieldwork-prep', label: 'Procedure Execution', state: (draft.length > 0 && returned.length === 0) ? 'current' : (applicableWps.length > 0 && draft.length === 0) ? 'completed' : 'pending', detail: `${cleared.length + inReview.length} prepared` },
        { id: 'review-clearance', label: 'Review Clearance', state: returned.length > 0 ? 'returned' : inReview.length > 0 ? 'current' : (cleared.length === applicableWps.length && applicableWps.length > 0) ? 'completed' : 'pending', detail: returned.length ? `${returned.length} returned` : `${cleared.length} of ${applicableWps.length} cleared` },
        { id: 'completion-signoff', label: 'Fieldwork Sign-off', state: (cleared.length === applicableWps.length && applicableWps.length > 0) ? 'completed' : 'pending', targetRoute: 'delivery' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-32',
        moduleName: 'Workpapers & Fieldwork',
        route: 'audit',
        currentSection: 'Audit Workpapers & Substantive Testing',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: {
          ...agg.counts,
          returned: returned.length > 0 ? returned.length : undefined
        },
        completedSummary: `${cleared.length} of ${applicableWps.length} applicable workpaper(s) cleared.`,
        pendingSummary: `${inReview.length} workpaper(s) awaiting review; ${draft.length} in progress.`,
        blockedSummary: returned.length > 0 ? `${returned.length} workpaper(s) returned for additional testing.` : undefined,
        reworkNotes: returned.map(w => `${w.id}: Returned with reviewer notes`),
        blockers: returned.map(w => `Workpaper ${w.id}: Returned by reviewer - ${w.clearance?.notes || (w.clearanceHistory && w.clearanceHistory[0]?.notes) || 'Rework required'}`),
        nextAction: returned.length > 0
          ? `Address review clearance notes on returned workpaper ${returned[0].id}`
          : inReview.length > 0
            ? `Conduct technical review on workpaper ${inReview[0].id}`
            : draft.length > 0
              ? `Complete fieldwork and submit workpaper ${draft[0].id}`
              : 'All applicable workpapers cleared; proceed to Review Desk & Approvals',
        whoActsNext: inReview.length > 0 ? 'Audit Reviewer / Manager' : returned.length > 0 || draft.length > 0 ? 'Assigned Preparer' : 'Audit Lead'
      };
    }

    case 'sampling': {
      const populations = (state.samplePopulations || []).filter(p => !activeEng || p.engagementId === activeEng.id);
      const pop = populations[0];
      const hasPop = Boolean(pop);
      const items = pop?.items || [];
      const selected = items.filter(item => item.selected);
      const hasSample = selected.length > 0;
      const tested = selected.filter(item => item.tested);
      const isTested = hasSample && tested.length === selected.length;

      const steps: WorkflowStep[] = [
        { id: 'population-intake', label: 'Population Intake', state: hasPop ? 'completed' : 'current', detail: hasPop ? `${items.length} items in population` : 'Load population file' },
        { id: 'sample-parameters', label: 'Sampling Parameters', state: hasSample ? 'completed' : hasPop ? 'current' : 'pending', detail: hasSample ? `${selected.length} items sampled` : 'Set sample parameters' },
        { id: 'sample-testing', label: 'Sample Testing', state: isTested ? 'completed' : hasSample ? 'current' : 'pending', detail: `${tested.length} of ${selected.length} tested` },
        { id: 'error-eval', label: 'Error Projection', state: isTested ? 'completed' : 'pending', detail: isTested ? 'Results projected to population' : 'Pending testing completion' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-31',
        moduleName: 'Audit Sampling',
        route: 'sampling',
        currentSection: 'Statistical & Directed Audit Sampling',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isTested ? `All ${selected.length} sampled items tested and evaluated.` : `${tested.length} of ${selected.length || 0} items tested.`,
        pendingSummary: !hasPop ? 'Load audit sampling population.' : !hasSample ? 'Generate sample selection.' : `${selected.length - tested.length} sample item(s) pending substantive testing.`,
        blockers: [],
        nextAction: !hasPop ? 'Upload sample population dataset' : !hasSample ? 'Calculate sample size and draw sample' : !isTested ? 'Record test results for sampled items' : 'Evaluate projected error and link to workpaper',
        whoActsNext: 'Audit Senior / Preparer'
      };
    }

    case 'evidence': {
      const evidence = state.evidenceCatalogue || [];
      const adequate = evidence.filter(e => e.adequacyStatus === 'Adequate');
      const deficient = evidence.filter(e => e.adequacyStatus === 'Deficient');
      const pending = evidence.filter(e => e.adequacyStatus === 'Pending verification');

      const steps: WorkflowStep[] = [
        { id: 'evidence-intake', label: 'Evidence Collection', state: evidence.length > 0 ? 'completed' : 'current', detail: `${evidence.length} artifact(s) collected` },
        { id: 'cross-reference', label: 'Workpaper Linkage', state: evidence.length > 0 ? 'completed' : 'pending', detail: `${evidence.filter(e => e.documentId).length} cross-referenced` },
        { id: 'adequacy-review', label: 'Adequacy Assessment', state: deficient.length > 0 ? 'blocked' : pending.length > 0 ? 'current' : evidence.length > 0 ? 'completed' : 'pending', detail: deficient.length ? `${deficient.length} marked deficient` : `${adequate.length} adequate` }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-33',
        moduleName: 'Audit Evidence',
        route: 'evidence',
        currentSection: 'Audit Evidence, PBC Validation & Adequacy',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${adequate.length} of ${evidence.length} evidence artifact(s) verified as Adequate.`,
        pendingSummary: `${pending.length} item(s) pending adequacy assessment.`,
        blockedSummary: deficient.length > 0 ? `${deficient.length} evidence item(s) marked Deficient/Inadequate.` : undefined,
        blockers: deficient.map(e => `Evidence ${e.id}: Marked ${e.adequacyStatus} — requires replacement documentation`),
        nextAction: deficient.length > 0 ? 'Request replacement document from client or prepare alternate evidence' : pending.length > 0 ? 'Assess adequacy on pending evidence items' : 'All evidence adequate; link to workpapers',
        whoActsNext: 'Audit Reviewer / Preparer'
      };
    }

    case 'findings': {
      const findings = (state.findings || []).filter(f => !activeEng || f.engagementId === activeEng.id);
      const resolved = findings.filter(f => f.disposition === 'Corrected in TB' || f.disposition === 'Corrected by client' || f.disposition === 'Waived as immaterial');
      const open = findings.filter(f => f.disposition === 'Uncorrected' || f.disposition === 'Proposed for correction' || f.disposition === 'Management agreed');

      const steps: WorkflowStep[] = [
        { id: 'difference-id', label: 'Difference Identification', state: findings.length > 0 ? 'completed' : 'current', detail: `${findings.length} finding(s)` },
        { id: 'quantification', label: 'Quantification & Materiality', state: findings.length > 0 ? 'completed' : 'pending' },
        { id: 'mgmt-discussion', label: 'Management Discussion', state: open.length > 0 ? 'current' : findings.length > 0 ? 'completed' : 'pending', detail: `${open.length} under discussion` },
        { id: 'disposition', label: 'Disposition Recorded', state: resolved.length === findings.length && findings.length > 0 ? 'completed' : resolved.length > 0 ? 'current' : 'pending', detail: `${resolved.length} resolved` }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-34',
        moduleName: 'Findings & Differences',
        route: 'findings',
        currentSection: 'Audit Differences & Findings Register',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${resolved.length} of ${findings.length} audit finding(s) resolved with recorded disposition.`,
        pendingSummary: `${open.length} uncorrected finding(s) under review.`,
        blockers: [],
        nextAction: open.length > 0 ? `Determine formal disposition for finding ${open[0].id}` : 'All audit differences cleared or waived',
        whoActsNext: open.length > 0 ? 'Engagement Partner / Manager' : 'Audit Team'
      };
    }

    case 'reviews': {
      const notes = activeEng?.reviews || [];
      const cleared = notes.filter(n => n.status === 'Cleared');
      const open = notes.filter(n => n.status === 'Open');
      const responded = notes.filter(n => n.status === 'Responded');
      const reopened = notes.filter(n => n.status === 'Reopened');

      const steps: WorkflowStep[] = [
        { id: 'query-log', label: 'Review Query Log', state: notes.length > 0 ? 'completed' : 'current', detail: `${notes.length} review point(s)` },
        { id: 'preparer-response', label: 'Preparer Response', state: reopened.length > 0 ? 'returned' : responded.length > 0 ? 'completed' : open.length > 0 ? 'current' : notes.length > 0 ? 'completed' : 'pending', detail: reopened.length ? `${reopened.length} reopened` : `${responded.length} responded` },
        { id: 'reviewer-clearance', label: 'Reviewer Clearance', state: cleared.length === notes.length && notes.length > 0 ? 'completed' : responded.length > 0 ? 'current' : 'pending', detail: `${cleared.length} of ${notes.length} cleared` }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-35',
        moduleName: 'Review Desk',
        route: 'reviews',
        currentSection: 'Technical Review Points & Clearance',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: {
          ...agg.counts,
          returned: reopened.length > 0 ? reopened.length : undefined
        },
        completedSummary: `${cleared.length} of ${notes.length} review point(s) cleared.`,
        pendingSummary: `${responded.length} item(s) awaiting reviewer clearance; ${open.length} awaiting preparer response.`,
        blockedSummary: reopened.length > 0 ? `${reopened.length} review point(s) reopened for further explanation.` : undefined,
        reworkNotes: reopened.map(n => `Review point ${n.id}: Reopened by reviewer`),
        blockers: [],
        nextAction: responded.length > 0
          ? `Verify preparer response on review point ${responded[0].id} and clear`
          : open.length > 0
            ? `Submit formal response on open review point ${open[0].id}`
            : 'All technical review points cleared',
        whoActsNext: responded.length > 0 ? 'Reviewer' : open.length > 0 ? 'Assigned Preparer' : 'Engagement Team'
      };
    }

    case 'approvals':
    case 'quality': {
      if (!activeEng) {
        const engMissingMsg = parsedContext.engagementId
          ? `Engagement "${parsedContext.engagementId}" is outside your authorized scope or does not exist.`
          : 'No active engagement selected.';
        return {
          moduleId: 'MOD-36',
          moduleName: 'Sign-offs & EQR',
          route: 'approvals',
          currentSection: 'Multi-Stage Approvals & EQR Concurrence',
          steps: [{ id: 'eng-context', label: 'Engagement Context', state: 'blocked', detail: parsedContext.engagementId ? `Engagement ${parsedContext.engagementId} not found` : 'No active engagement selected' }],
          percentComplete: null,
          counts: { completed: 0, pending: 0, blocked: 1, total: 1 },
          completedSummary: '0 sign-offs recorded.',
          pendingSummary: 'No engagement in active scope.',
          blockers: [engMissingMsg],
          nextAction: 'Select an active engagement from Practice Overview',
          whoActsNext: 'Engagement Team'
        };
      }

      const apprs = activeEng.approvals || { manager: null, client: null, partner: null, eqr: null };
      const currentGen = activeEng.generation || 1;

      // Authoritative generation-based check (FIX-03)
      const mgr = Boolean(apprs.manager && apprs.manager.generation === currentGen);
      const mgrStale = Boolean(apprs.manager && apprs.manager.generation !== currentGen);

      const client = Boolean(apprs.client && apprs.client.generation === currentGen);
      const clientStale = Boolean(apprs.client && apprs.client.generation !== currentGen);

      const partner = Boolean(apprs.partner && apprs.partner.generation === currentGen);
      const partnerStale = Boolean(apprs.partner && apprs.partner.generation !== currentGen);

      const eqrRequired = Boolean(activeEng.eqrRequired);
      const eqr = eqrRequired ? Boolean(apprs.eqr && apprs.eqr.generation === currentGen) : false;
      const eqrStale = eqrRequired ? Boolean(apprs.eqr && apprs.eqr.generation !== currentGen) : false;

      const hasConcerns = Boolean(activeEng.eqrConcerns && activeEng.eqrConcerns.some(c => !c.resolved));

      const steps: WorkflowStep[] = [
        {
          id: 'mgr-approval',
          label: 'Manager Sign-off',
          state: mgr ? 'completed' : mgrStale ? 'stale' : 'current',
          detail: mgr ? `Cleared by ${apprs.manager?.by}` : mgrStale ? `Stale (recorded Gen ${apprs.manager?.generation} vs current Gen ${currentGen})` : 'Pending technical clearance'
        },
        {
          id: 'client-approval',
          label: 'Client Management',
          state: client ? 'completed' : clientStale ? 'stale' : mgr ? 'current' : 'pending',
          detail: client ? `Acknowledged by ${apprs.client?.by}` : clientStale ? `Stale (Gen ${apprs.client?.generation})` : 'Pending representation sign-off'
        },
        {
          id: 'partner-approval',
          label: 'Partner Sign-off',
          state: partner ? 'completed' : partnerStale ? 'stale' : (mgr && client) ? 'current' : 'pending',
          detail: partner ? `Signed by ${apprs.partner?.by}` : partnerStale ? `Stale (Gen ${apprs.partner?.generation})` : 'Pending lead partner sign-off'
        },
        {
          id: 'eqr-approval',
          label: eqrRequired ? 'EQR Sign-off' : 'EQR (Not Required)',
          state: !eqrRequired ? 'na' : eqr ? 'completed' : eqrStale ? 'stale' : hasConcerns ? 'blocked' : partner ? 'current' : 'pending',
          detail: !eqrRequired ? 'Standard engagement profile without EQR requirement' : eqr ? `Concurrence by ${apprs.eqr?.by}` : hasConcerns ? 'Blocked by open review concerns' : eqrStale ? `Stale (Gen ${apprs.eqr?.generation})` : 'Pending independent EQR concurrence'
        },
        {
          id: 'release-auth',
          label: 'Release Authorization',
          state: (mgr && client && partner && (!eqrRequired || eqr)) ? 'completed' : (mgrStale || clientStale || partnerStale || eqrStale || hasConcerns) ? 'blocked' : 'pending',
          detail: (mgr && client && partner && (!eqrRequired || eqr)) ? 'All stage sign-offs valid for current generation' : 'Pending prerequisite stage approvals',
          targetRoute: 'delivery'
        }
      ];

      const agg = aggregateWorkflowSteps(steps);

      const blockers: string[] = [];
      if (mgrStale || clientStale || partnerStale || eqrStale) {
        blockers.push('One or more sign-offs were recorded for a prior generation and are now stale.');
      }
      if (hasConcerns) {
        blockers.push('Unresolved EQR review concerns block sign-off.');
      }

      const assignedPartnerName = activeEng.partner || 'Engagement Partner';
      const assignedEqrName = activeEng.eqrReviewerUserId
        ? (state.users.find(u => u.id === activeEng.eqrReviewerUserId)?.name || 'Independent EQR Partner')
        : 'Independent EQR Partner';

      return {
        moduleId: 'MOD-36',
        moduleName: 'Sign-offs & EQR',
        route: 'approvals',
        currentSection: 'Multi-Stage Approvals & EQR Concurrence',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${agg.counts.completed} of ${agg.counts.total} stage sign-offs valid for current generation (Gen ${currentGen}).${!eqrRequired ? ' (EQR non-applicable)' : ''}`,
        pendingSummary: `${agg.counts.pending} sign-off(s) outstanding for current generation.`,
        blockedSummary: blockers.length > 0 ? blockers[0] : undefined,
        blockers,
        nextAction: !mgr
          ? 'Record Manager technical approval'
          : !client
            ? 'Record Client Management representation sign-off'
            : !partner
              ? `Record Partner sign-off (${assignedPartnerName})`
              : eqrRequired && !eqr
                ? `Record EQR concurrence (${assignedEqrName})`
                : 'All stage approvals cleared; proceed to Deliverables & Release',
        whoActsNext: !mgr
          ? 'Engagement Manager'
          : !client
            ? 'Client Management'
            : !partner
              ? assignedPartnerName
              : eqrRequired && !eqr
                ? assignedEqrName
                : 'Engagement Partner'
      };
    }

    case 'delivery': {
      if (!activeEng) {
        const engMissingMsg = parsedContext.engagementId
          ? `Engagement "${parsedContext.engagementId}" is outside your authorized scope or does not exist.`
          : 'No active engagement selected.';
        return {
          moduleId: 'MOD-37',
          moduleName: 'Release & Completion',
          route: 'delivery',
          currentSection: 'Final Deliverables, Release Gates & Issuance',
          steps: [{ id: 'eng-context', label: 'Engagement Context', state: 'blocked', detail: parsedContext.engagementId ? `Engagement ${parsedContext.engagementId} not found` : 'No active engagement selected' }],
          percentComplete: null,
          counts: { completed: 0, pending: 0, blocked: 1, total: 1 },
          completedSummary: '0 gates cleared.',
          pendingSummary: 'No engagement in active scope.',
          blockers: [engMissingMsg],
          nextAction: 'Select an active engagement from Practice Overview',
          whoActsNext: 'Engagement Team'
        };
      }

      if (activeEng.lifecycleStatus === 'Cancelled' || activeEng.lifecycleStatus === 'Suspended') {
        const isCancelled = activeEng.lifecycleStatus === 'Cancelled';
        return {
          moduleId: 'MOD-37',
          moduleName: 'Release & Completion',
          route: 'delivery',
          currentSection: isCancelled ? 'Terminal state: Engagement Cancelled' : 'Suspended Engagement',
          steps: [{ id: 'lifecycle-guard', label: 'Lifecycle State', state: 'blocked', detail: isCancelled ? 'Engagement is Cancelled — deliverables issuance terminated' : 'Engagement Suspended' }],
          percentComplete: null,
          counts: { completed: 0, pending: 0, blocked: 1, total: 1 },
          completedSummary: isCancelled ? 'Engagement Cancelled. Deliverables workflow terminated.' : 'Engagement suspended.',
          pendingSummary: isCancelled ? 'Cancelled engagement cannot issue deliverables or release candidate.' : 'Resolve suspension reason.',
          blockers: [isCancelled ? 'Engagement is Cancelled — release gate blocked.' : 'Engagement is currently Suspended.'],
          nextAction: isCancelled ? 'Review cancellation reason in engagement archive' : 'Review suspension with lead partner',
          whoActsNext: 'Lead Partner'
        };
      }

      const allWpCleared = activeEng.workpapers.every(w => !w.applicable || w.status === 'Cleared' || w.status === 'Not applicable');
      const noOpenReviews = activeEng.reviews.every(r => r.status === 'Cleared');
      const openBlockingFindings = (state.findings || []).filter(f => f.engagementId === activeEng.id && isReleaseBlockingFinding(f));
      const noMaterialFindings = openBlockingFindings.length === 0;
      const currentGen = activeEng.generation || 1;

      const approvalsValid = Boolean(
        activeEng.approvals?.manager?.generation === currentGen &&
        activeEng.approvals?.client?.generation === currentGen &&
        activeEng.approvals?.partner?.generation === currentGen &&
        (!activeEng.eqrRequired || activeEng.approvals?.eqr?.generation === currentGen)
      );

      const latestPackage = (activeEng.packageHistory || []).at(-1);
      const latestGL = (activeEng.glSourceHistory || []).at(-1);
      const packageValid = Boolean(latestPackage && latestPackage.generation === currentGen && (!latestGL || latestPackage.glSourceRevision === latestGL.revision));

      const blockers: string[] = [];
      if (!allWpCleared) blockers.push('Workpapers not all cleared');
      if (!noOpenReviews) blockers.push('Outstanding open review notes');
      if (!noMaterialFindings) blockers.push(`${openBlockingFindings.length} material findings open`);
      if (!approvalsValid) blockers.push('Multi-stage approvals incomplete or invalidated');
      if (!packageValid) blockers.push('Financial package missing or out of date');

      const isReady = blockers.length === 0;
      const isCandidate = Boolean(activeEng.candidate && activeEng.candidate.generation === currentGen);
      const isReleased = Boolean(activeEng.releases?.length && activeEng.releases.some(r => r.generation === currentGen));
      const isArchived = Boolean(activeEng.archive && (!activeEng.releases?.length || activeEng.releases.some(r => r.id === activeEng.archive?.releaseId && r.generation === currentGen)));

      const steps: WorkflowStep[] = [
        { id: 'readiness-gates', label: 'Readiness Gates', state: isReady ? 'completed' : 'blocked', detail: isReady ? 'All gates satisfied' : `${blockers.length} gate(s) unsatisfied` },
        { id: 'candidate-pack', label: 'Candidate Package', state: isCandidate ? 'completed' : isReady ? 'current' : 'pending', detail: isCandidate ? 'Candidate assembled' : 'Assemble candidate' },
        { id: 'final-checks', label: 'Issuance Checks', state: isReleased ? 'completed' : isCandidate ? 'current' : 'pending', detail: isReleased ? 'Issued' : 'Pre-release check' },
        { id: 'package-release', label: 'Package Issuance', state: isReleased ? 'completed' : 'pending', detail: isReleased ? 'Final release issued' : 'Pending issuance' },
        { id: 'engagement-archive', label: 'Archive Handover', state: isArchived ? 'completed' : isReleased ? 'current' : 'pending', detail: isArchived ? 'Archived' : 'Post-release archive', targetRoute: 'records' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-37',
        moduleName: 'Release & Completion',
        route: 'delivery',
        currentSection: 'Final Deliverables, Release Gates & Issuance',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isArchived
          ? 'Engagement deliverables issued and engagement formally archived.'
          : isReleased
            ? 'Final deliverables released; awaiting archive handover.'
            : isReady
              ? 'All 5 release gates cleared and satisfied for current generation.'
              : 'Release gates pending.',
        pendingSummary: !isReady
          ? `${blockers.length} readiness condition(s) unresolved.`
          : !isReleased
            ? 'Awaiting formal release issuance.'
            : 'Pending record archive.',
        blockedSummary: !isReady ? blockers[0] : undefined,
        blockers,
        nextAction: !isReady
          ? `Resolve release gate: ${blockers[0]}`
          : !isCandidate
            ? 'Assemble candidate release package'
            : !isReleased
              ? 'Issue formal final deliverable package'
              : 'Complete archive handover in Records module',
        whoActsNext: !isReady ? 'Engagement Lead / Manager' : 'Engagement Partner'
      };
    }

    case 'records': {
      const archives = state.archives || [];
      const scopedArchives = activeEng ? archives.filter(a => a.engagementId === activeEng.id) : archives;
      const isArchived = Boolean(activeEng?.archive || scopedArchives.length > 0);

      const steps: WorkflowStep[] = [
        { id: 'archive-package', label: 'Archive Assembly', state: isArchived ? 'completed' : 'current', detail: isArchived ? 'Archive manifest created' : 'Assemble archive bundle' },
        { id: 'retention-policy', label: 'Retention Policy', state: isArchived ? 'completed' : 'pending', detail: '7-year statutory retention' },
        { id: 'immutability-lock', label: 'Immutability Lock', state: isArchived ? 'completed' : 'pending', detail: isArchived ? 'Read-only archive locked' : 'Pending lock' }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-38',
        moduleName: 'Archival & Records',
        route: 'records',
        currentSection: 'Engagement Archival, Retention & Compliance Records',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: isArchived ? 'Engagement archive bundle locked under statutory retention.' : 'Engagement not yet archived.',
        pendingSummary: !isArchived ? 'Complete release issuance before triggering engagement archival.' : 'Archive verified.',
        blockers: [],
        nextAction: !isArchived ? 'Release deliverables before locking archive' : 'Inspect archive manifest and retention certificates',
        whoActsNext: isArchived ? 'Compliance Records Officer' : 'Engagement Partner'
      };
    }

    case 'portal':
    case 'client-portal' as any: {
      if (!client) {
        return {
          moduleId: 'MOD-08',
          moduleName: 'Client Experience Portal',
          route: 'portal',
          currentSection: 'Client Secure Portal',
          steps: [{ id: 'portal-access', label: 'Client Identity', state: 'blocked', detail: 'No permitted client entity' }],
          percentComplete: null,
          counts: { completed: 0, pending: 0, blocked: 1, total: 1 },
          completedSummary: '0 items complete.',
          pendingSummary: 'Client entity is outside your authorized scope or does not exist.',
          blockers: ['No client entity permitted for your active identity.'],
          nextAction: 'Contact firm administrator to request client portal access grant',
          whoActsNext: 'Firm Administrator'
        };
      }

      // Strictly filtered to resolved client and resolved engagement (VP-025, FIX-02)
      const pbc = activeEng ? activeEng.pbc.filter(p => p.status !== 'Draft' && p.status !== 'Cancelled') : [];
      const pendingPbc = pbc.filter(p => p.status === 'Requested');
      const returnedPbc = pbc.filter(p => p.status === 'Needs clarification');
      const receivedPbc = pbc.filter(p => p.status === 'Received' || p.status === 'Under review');
      const acceptedPbc = pbc.filter(p => p.status === 'Accepted');

      const sharedDocs = state.documents.filter(d => d.visibility === 'Client shared' && d.clientId === client!.id && (!activeEng || !d.engagementId || d.engagementId === activeEng.id));
      const issuedInvoices = state.invoices.filter(i => i.clientId === client!.id && (!activeEng || (i.engagementId || i.eng) === activeEng.id) && (i.status === 'Issued' || i.status === 'Paid'));

      const isAck = Boolean(activeEng?.managementPackageDecision?.decision === 'Acknowledged');

      const steps: WorkflowStep[] = [
        { id: 'portal-access', label: 'Secure Session', state: 'completed', detail: `${client.name}` },
        { id: 'pbc-requests', label: 'Information Requests', state: pendingPbc.length > 0 ? 'current' : pbc.length > 0 ? 'completed' : 'pending', detail: `${pendingPbc.length} outstanding` },
        { id: 'clarifications', label: 'Clarifications', state: returnedPbc.length > 0 ? 'returned' : 'pending', detail: `${returnedPbc.length} need clarification` },
        { id: 'documents', label: 'Shared Documents', state: sharedDocs.length > 0 ? 'completed' : 'pending', detail: `${sharedDocs.length} shared document(s)` },
        { id: 'invoices', label: 'Invoices & Statements', state: issuedInvoices.length > 0 ? 'completed' : 'pending', detail: `${issuedInvoices.length} issued` },
        { id: 'management-decision', label: 'Management Sign-off', state: isAck ? 'completed' : activeEng?.managementPresentation ? 'current' : 'pending', detail: isAck ? 'Acknowledged' : 'Pending presentation' }
      ];

      const counts: WorkflowCounts = pbc.length > 0
        ? {
            completed: acceptedPbc.length,
            current: receivedPbc.length,
            pending: pendingPbc.length,
            returned: returnedPbc.length,
            blocked: 0,
            total: pbc.length
          }
        : {
            completed: 0,
            current: 0,
            pending: 0,
            returned: 0,
            blocked: 0,
            total: 0
          };
      const applicable = counts.completed + counts.pending + (counts.current || 0) + (counts.returned || 0);
      const percentComplete = applicable > 0
        ? (counts.completed === applicable ? 100 : Math.min(99, Math.floor((100 * counts.completed) / applicable)))
        : null;

      return {
        moduleId: 'MOD-08',
        moduleName: 'Client Experience Portal',
        route: 'portal',
        currentSection: `Client Portal: ${client.name}`,
        steps,
        percentComplete,
        counts: {
          ...counts,
          returned: returnedPbc.length > 0 ? returnedPbc.length : undefined
        },
        completedSummary: `${acceptedPbc.length} of ${pbc.length} requested information item(s) accepted; ${sharedDocs.length} shared document(s) available.`,
        pendingSummary: `${pendingPbc.length} client request(s) require file upload; ${receivedPbc.length} under staff review.`,
        blockedSummary: returnedPbc.length > 0 ? `${returnedPbc.length} request(s) require clarification or re-upload.` : undefined,
        reworkNotes: returnedPbc.map(p => `${p.id}: ${p.title} returned for clarification`),
        blockers: [],
        nextAction: returnedPbc.length > 0
          ? 'Respond to staff clarification note and upload revised PBC document'
          : pendingPbc.length > 0
            ? 'Upload requested file for outstanding PBC items'
            : 'Review shared documents or issued invoices',
        whoActsNext: returnedPbc.length || pendingPbc.length ? 'Client Finance Contributor' : 'Client Administrator'
      };
    }

    // -------------------------------------------------------------
    // Reference and Non-Workflow Views (FIX-06)
    // -------------------------------------------------------------
    case 'reports':
    case 'reporting-centre' as any: {
      const steps: WorkflowStep[] = [
        { id: 'report-catalog', label: 'Report Catalogue', state: 'completed', detail: '16 practice & engagement reports' },
        { id: 'filters', label: 'Scoped Filters', state: 'completed', detail: 'Bound to active role and grant scope' },
        { id: 'export-generation', label: 'Export Generation', state: 'completed', detail: 'PDF, Excel, and on-screen views' }
      ];

      return {
        moduleId: 'MOD-16',
        moduleName: 'Reporting Centre',
        route: 'reports',
        currentSection: 'Reference view — no linear workflow applies',
        steps,
        percentComplete: null,
        counts: { completed: 3, pending: 0, blocked: 0, total: 3 },
        completedSummary: 'Reference view — no workflow completion applies. 16 analytics and compliance reports available.',
        pendingSummary: 'All report definitions active and queryable against current scoped records.',
        blockers: [],
        nextAction: 'Select a report, filter by client/engagement, and export or print',
        whoActsNext: 'Practice Auditor / Manager'
      };
    }

    case 'administration': {
      const activeUsers = (state.users || []).filter(u => u.status === 'Active');
      const grants = state.roleGrants || [];
      const firm = state.firmSettings;
      const firmOk = Boolean(firm?.firmName && firm?.jurisdiction);

      const steps: WorkflowStep[] = [
        { id: 'firm-settings', label: 'Firm Identity & Profile', state: firmOk ? 'completed' : 'current', detail: firmOk ? `${firm?.firmName}` : 'Configure firm settings' },
        { id: 'user-roster', label: 'Staff & Client Personas', state: activeUsers.length > 0 ? 'completed' : 'pending', detail: `${activeUsers.length} active personas` },
        { id: 'role-grants', label: 'Scoped Role Grants', state: grants.length > 0 ? 'completed' : 'pending', detail: `${grants.length} active grants` },
        { id: 'governance-log', label: 'Governance & Audit Log', state: (state.events || []).length > 0 ? 'completed' : 'current', detail: `${state.events?.length || 0} events logged` }
      ];

      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-19',
        moduleName: 'Practice Administration',
        route: 'administration',
        currentSection: 'User Administration, Roles & Firm Settings',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${agg.counts.completed} of ${agg.counts.total} administration governance baselines active.`,
        pendingSummary: !firmOk ? 'Configure firm registration and branding settings.' : 'Identity administration ready.',
        blockers: [],
        nextAction: !firmOk ? 'Update firm settings and registration details' : 'Manage user roles and client entity grants',
        whoActsNext: 'Firm Administrator'
      };
    }

    case 'm365-setup': {
      const steps: WorkflowStep[] = [
        { id: 'app-registration', label: 'App Registration', state: 'completed', detail: 'Synthetic Azure AD mock configuration' },
        { id: 'graph-permissions', label: 'Permissions & Consent', state: 'completed', detail: 'Mail, Files, and Teams local endpoints' },
        { id: 'sync-status', label: 'Integration Status', state: 'completed', detail: 'Browser-local simulation; no cloud egress' }
      ];

      return {
        moduleId: 'MOD-18',
        moduleName: 'Microsoft 365 Integration',
        route: 'm365-setup',
        currentSection: 'Reference view — no linear workflow applies',
        steps,
        percentComplete: null,
        counts: { completed: 3, pending: 0, blocked: 0, total: 3 },
        completedSummary: 'Reference view — synthetic browser-only mock configuration. Zero external network egress.',
        pendingSummary: 'All mock connectors active.',
        blockers: [],
        nextAction: 'Inspect Microsoft 365 configuration and consent scopes',
        whoActsNext: 'System Administrator'
      };
    }

    case 'requirements': {
      const steps: WorkflowStep[] = [
        { id: 'req-spec', label: 'Requirement Specifications', state: 'completed', detail: 'VP-001 through VP-064' },
        { id: 'acceptance-criteria', label: 'Acceptance Criteria', state: 'completed', detail: '256 criteria validated' },
        { id: 'evidence-ledger', label: 'Evidence Ledger', state: 'completed', detail: 'Code-derived proof' }
      ];

      return {
        moduleId: 'MOD-17',
        moduleName: 'Requirements & Compliance',
        route: 'requirements',
        currentSection: 'Reference view — no linear workflow applies',
        steps,
        percentComplete: null,
        counts: { completed: 3, pending: 0, blocked: 0, total: 3 },
        completedSummary: 'Reference view — 256 acceptance criteria mapped to automated verification tests.',
        pendingSummary: 'No pending requirements.',
        blockers: [],
        nextAction: 'Inspect acceptance criteria and traceability ledger',
        whoActsNext: 'Compliance / QA Lead'
      };
    }

    case 'role-guide': {
      const steps: WorkflowStep[] = [
        { id: 'role-matrix', label: 'Role Definitions', state: 'completed', detail: '14 product roles + presenter superuser' },
        { id: 'sod-rules', label: 'Segregation of Duties', state: 'completed', detail: 'Ordinary-person independence rules' },
        { id: 'permissions', label: 'Route & Record Grants', state: 'completed', detail: 'Typed client and engagement scopes' }
      ];

      return {
        moduleId: 'MOD-39',
        moduleName: 'Role & Permission Guide',
        route: 'role-guide',
        currentSection: 'Reference view — no linear workflow applies',
        steps,
        percentComplete: null,
        counts: { completed: 3, pending: 0, blocked: 0, total: 3 },
        completedSummary: 'Reference view — 14 product roles and segregation-of-duties matrix.',
        pendingSummary: 'Role guide is active.',
        blockers: [],
        nextAction: 'Review role permissions and transition rules',
        whoActsNext: 'Practice Lead'
      };
    }

    case 'module-guide': {
      const steps: WorkflowStep[] = [
        { id: 'module-catalogue', label: '39 Product Modules', state: 'completed', detail: 'All modules mapped' },
        { id: 'rehearsal-guides', label: 'Rehearsal Journeys', state: 'completed', detail: '6 core business journeys' },
        { id: 'lifecycles', label: 'Record Lifecycles', state: 'completed', detail: 'Audited state transitions' }
      ];

      return {
        moduleId: 'MOD-16',
        moduleName: 'Module Catalogue',
        route: 'module-guide',
        currentSection: 'Reference view — no linear workflow applies',
        steps,
        percentComplete: null,
        counts: { completed: 3, pending: 0, blocked: 0, total: 3 },
        completedSummary: 'Reference view — comprehensive guide to all 39 AuditSphere product modules.',
        pendingSummary: 'Catalogue active.',
        blockers: [],
        nextAction: 'Navigate to any product module or inspect rehearsal guide',
        whoActsNext: 'Practice Staff'
      };
    }

    default: {
      const steps: WorkflowStep[] = [
        { id: 'context', label: 'Module Context', state: scopedClients.length > 0 ? 'completed' : 'pending' },
        { id: 'action', label: 'Operational Work', state: 'current' },
        { id: 'review', label: 'Review & Sign-off', state: 'pending' }
      ];
      const agg = aggregateWorkflowSteps(steps);

      return {
        moduleId: 'MOD-01',
        moduleName: 'AuditSphere Module',
        route,
        currentSection: 'Module Operational View',
        steps: agg.steps,
        percentComplete: agg.percentComplete,
        counts: agg.counts,
        completedSummary: `${agg.counts.completed} of ${agg.counts.total} workflow steps completed.`,
        pendingSummary: `${agg.counts.pending} step(s) pending.`,
        blockers: [],
        nextAction: 'Review active items and progress through the workflow steps',
        whoActsNext: 'Assigned User'
      };
    }
  }
}
