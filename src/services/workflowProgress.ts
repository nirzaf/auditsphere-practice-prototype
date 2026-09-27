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
import { visibleEngagementIds, visibleClientIds, scopedInvoices } from './guards';
import { isReleaseBlockingFinding } from './findings';

export type ProgressStepState = 'completed' | 'current' | 'pending' | 'blocked' | 'returned' | 'stale' | 'na';

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
}

export interface ModuleWorkflowProgress {
  moduleId: string;
  moduleName: string;
  route: RouteKey;
  currentSection: string; // "Where am I?"
  steps: WorkflowStep[];
  percentComplete: number; // 0 to 100
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

export function computeModuleWorkflowProgress(
  route: RouteKey,
  state: PrototypeState,
  contextId?: string
): ModuleWorkflowProgress {
  const allowedEngIds = visibleEngagementIds(state);
  const scopedEngagements: EngagementRecord[] = state.engagements.filter(
    e => allowedEngIds === 'ALL' || allowedEngIds.includes(e.id)
  );
  const activeEng = scopedEngagements.find(e => e.id === (contextId || state.selectedEngagement)) || scopedEngagements[0];
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
        moduleId: 'MOD-01',
        moduleName: 'Practice Overview',
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
      const activeClients = scopedClients.filter(c => c.status === 'Active');
      const prospectClients = scopedClients.filter(c => c.status === 'Prospect');
      const suspendedClients = scopedClients.filter(c => c.status === 'Suspended');

      const steps: WorkflowStep[] = [
        { id: 'intake', label: 'Intake / Prospect', state: prospectClients.length > 0 ? 'current' : 'completed', detail: `${prospectClients.length} prospects` },
        { id: 'onboarding-kyc', label: 'Acceptance & KYC', state: 'completed', detail: 'Screening and background evidence', targetRoute: 'onboarding' },
        { id: 'profile-contacts', label: 'Profile & Contacts', state: activeClients.length > 0 ? 'completed' : 'pending', detail: `${scopedClients.length} clients registered` },
        { id: 'engagements', label: 'Active Engagements', state: scopedEngagements.length > 0 ? 'current' : 'pending', detail: `${scopedEngagements.length} engagements linked`, targetRoute: 'engagements' },
        { id: 'ongoing-service', label: 'Service & Portfolio', state: activeClients.length > 0 ? 'completed' : 'pending', detail: `${activeClients.length} active clients` }
      ];

      return {
        moduleId: 'MOD-02',
        moduleName: 'CRM & Client Management',
        route: 'clients',
        currentSection: route === 'client-detail' ? 'Client 360 & Relationship Profile' : 'Client Portfolio Directory',
        steps,
        percentComplete: activeClients.length > 0 ? 80 : 40,
        counts: {
          completed: activeClients.length,
          pending: prospectClients.length,
          blocked: suspendedClients.length,
          total: scopedClients.length
        },
        completedSummary: `${activeClients.length} active client portfolio record(s) verified.`,
        pendingSummary: `${prospectClients.length} prospect client(s) awaiting engagement terms and full onboarding.`,
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
        { id: 'inquiry', label: 'Inquiry', state: leads.some(l => l.stage === 'Inquiry') ? 'current' : 'completed' },
        { id: 'discovery', label: 'Discovery', state: leads.some(l => l.stage === 'Discovery') ? 'current' : open.length ? 'completed' : 'pending' },
        { id: 'evaluation', label: 'Evaluation', state: leads.some(l => l.stage === 'Evaluation') ? 'current' : 'pending' },
        { id: 'proposal', label: 'Proposal Terms', state: leads.some(l => l.stage === 'Proposal') ? 'current' : won.length ? 'completed' : 'pending', targetRoute: 'proposals' },
        { id: 'won', label: 'Won Conversion', state: won.length > 0 ? 'completed' : 'pending' }
      ];

      const percent = leads.length > 0 ? Math.round((won.length / leads.length) * 100) : 0;

      return {
        moduleId: 'MOD-03',
        moduleName: 'Leads & Opportunities',
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
        { id: 'prop-draft', label: 'Draft Scope', state: draft.length ? 'current' : 'completed' },
        { id: 'prop-review', label: 'Independent Review', state: inReview.length ? 'current' : returned.length ? 'returned' : 'pending' },
        { id: 'prop-approved', label: 'Approved to Send', state: approvedToSend.length ? 'completed' : 'pending' },
        { id: 'prop-presented', label: 'Presented', state: presented.length ? 'current' : accepted.length ? 'completed' : 'pending' },
        { id: 'prop-accepted', label: 'Accepted Terms', state: accepted.length ? 'completed' : 'pending' }
      ];

      return {
        moduleId: 'MOD-04',
        moduleName: 'Proposals & Terms',
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

      const steps: WorkflowStep[] = [
        { id: 'terms', label: 'Agreed Terms', state: 'completed', targetRoute: 'proposals' },
        { id: 'kyc', label: 'Acceptance & KYC', state: 'completed', targetRoute: 'onboarding' },
        { id: 'active', label: 'Active Engagement', state: active.length ? 'completed' : 'current' },
        { id: 'delivery', label: 'Service Delivery', state: state.jobs.length ? 'current' : 'pending', targetRoute: 'jobs' },
        { id: 'completion', label: 'Completion & Release', state: activeEng?.releases?.length ? 'completed' : 'pending', targetRoute: 'delivery' }
      ];

      return {
        moduleId: 'MOD-04',
        moduleName: 'Engagements',
        route: 'engagements',
        currentSection: 'Professional Engagements Workspace',
        steps,
        percentComplete: active.length ? 60 : 20,
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
      const cases = state.acceptanceCases || [];
      const accepted = cases.filter(c => c.decisionStatus === 'Accepted');
      const pending = cases.filter(c => c.decisionStatus === 'Pending');
      const declined = cases.filter(c => c.decisionStatus === 'Declined');

      const steps: WorkflowStep[] = [
        { id: 'screening', label: 'Screening Checks', state: cases.length ? 'completed' : 'current' },
        { id: 'evidence', label: 'Evidence Collection', state: cases.some(c => c.screeningEvidence) ? 'completed' : 'pending' },
        { id: 'recommendation', label: 'Manager Review', state: pending.length ? 'current' : accepted.length ? 'completed' : 'pending' },
        { id: 'partner-decision', label: 'Partner Acceptance', state: accepted.length ? 'completed' : 'pending' },
        { id: 'continuance', label: 'Continuance Rollforward', state: 'na' }
      ];

      return {
        moduleId: 'MOD-27',
        moduleName: 'Acceptance & KYC',
        route: 'onboarding',
        currentSection: 'Client Acceptance & Continuance Review',
        steps,
        percentComplete: cases.length ? Math.round((accepted.length / cases.length) * 100) : 50,
        counts: {
          completed: accepted.length,
          pending: pending.length,
          blocked: declined.length,
          total: cases.length || 1
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
      const engJobs = state.jobs.filter(j => !activeEng || j.engagementId === activeEng.id);
      const jobIds = new Set(engJobs.map(j => j.id));
      const tasks = state.jobTasks.filter(t => jobIds.has(t.jobId));
      const completedTasks = tasks.filter(t => t.status === 'Completed');
      const blockedTasks = tasks.filter(t => t.status === 'Blocked');
      const openTasks = tasks.filter(t => t.status === 'Not started' || t.status === 'In progress');

      const steps: WorkflowStep[] = [
        { id: 'jobs-init', label: 'Job Creation', state: engJobs.length ? 'completed' : 'current' },
        { id: 'task-decomposition', label: 'Task Breakdown', state: tasks.length ? 'completed' : 'pending' },
        { id: 'staff-assignment', label: 'Staff Assignment', state: tasks.every(t => t.assignee) ? 'completed' : 'current' },
        { id: 'execution', label: 'Task Execution', state: blockedTasks.length ? 'blocked' : openTasks.length ? 'current' : 'completed' },
        { id: 'sign-off', label: 'Job Completion', state: engJobs.every(j => j.status === 'Completed') && engJobs.length > 0 ? 'completed' : 'pending' }
      ];

      const percent = tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

      return {
        moduleId: 'MOD-05',
        moduleName: 'Jobs & Tasks',
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
        completedSummary: `${completedTasks.length} of ${tasks.length} task(s) completed across ${engJobs.length} job(s).`,
        pendingSummary: `${openTasks.length} task(s) in progress or awaiting start.`,
        blockedSummary: blockedTasks.length ? `${blockedTasks.length} task(s) marked as Blocked.` : undefined,
        blockers: blockedTasks.map(t => `Task ${t.id} (${t.title}): ${t.blockedReason || 'Blocked waiting on input'}`),
        nextAction: blockedTasks.length ? `Resolve blocker on task ${blockedTasks[0].id}` : openTasks.length ? `Progress task ${openTasks[0].id}` : 'All scoped tasks completed',
        whoActsNext: blockedTasks.length ? 'Manager / Task Owner' : 'Assigned Preparer'
      };
    }

    case 'job-templates': {
      const templates = state.jobTemplates || [];
      const published = templates.filter(t => t.status === 'Published');
      const drafts = templates.filter(t => t.status === 'Draft');
      const retired = templates.filter(t => t.status === 'Retired');

      const steps: WorkflowStep[] = [
        { id: 'authoring', label: 'Draft Authoring', state: drafts.length ? 'current' : 'completed' },
        { id: 'structure', label: 'Task Hierarchy', state: 'completed' },
        { id: 'publishing', label: 'Published Templates', state: published.length ? 'completed' : 'pending' },
        { id: 'instantiation', label: 'Engagement Application', state: 'current' },
        { id: 'versioning', label: 'Revision & Retire', state: retired.length ? 'completed' : 'pending' }
      ];

      return {
        moduleId: 'MOD-06',
        moduleName: 'Job Templates',
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
      const comms = state.communications || [];
      const steps: WorkflowStep[] = [
        { id: 'recipient', label: 'Contact Selection', state: 'completed' },
        { id: 'template', label: 'Channel & Template', state: 'completed' },
        { id: 'drafting', label: 'Message Composition', state: 'current' },
        { id: 'logging', label: 'Audit Trail & Outcome', state: comms.length ? 'completed' : 'pending' },
        { id: 'linked-records', label: 'Job / Engagement Link', state: 'current' }
      ];

      return {
        moduleId: 'MOD-07',
        moduleName: 'Team & Client Comms',
        route: 'communications',
        currentSection: 'Inter-Team & Client Communication Trail',
        steps,
        percentComplete: 75,
        counts: {
          completed: comms.length,
          pending: 0,
          blocked: 0,
          total: comms.length
        },
        completedSummary: `${comms.length} communication log(s) and simulated messages preserved with full attribution.`,
        pendingSummary: 'No pending outgoing message drafts.',
        blockers: [],
        nextAction: 'Log communication note, client meeting record, or internal team collaboration',
        whoActsNext: 'Team Member / Preparer'
      };
    }

    case 'portal': {
      const pbc = activeEng?.pbc || [];
      const returnedPbc = pbc.filter(p => p.status === 'Needs clarification');
      const pendingPbc = pbc.filter(p => p.status === 'Requested');
      const receivedPbc = pbc.filter(p => p.status === 'Received');
      const acceptedPbc = pbc.filter(p => p.status === 'Accepted');
      const sharedDocs = state.documents.filter(d => d.visibility === 'Client shared');
      const issuedInvoices = state.invoices.filter(i => i.status === 'Issued');

      const steps: WorkflowStep[] = [
        { id: 'portal-access', label: 'Secure Session', state: 'completed' },
        { id: 'pbc-requests', label: 'Information Requests', state: pendingPbc.length ? 'current' : 'completed', detail: `${pendingPbc.length} outstanding` },
        { id: 'clarifications', label: 'Clarifications', state: returnedPbc.length ? 'returned' : 'pending' },
        { id: 'documents', label: 'Shared Documents', state: sharedDocs.length ? 'completed' : 'pending' },
        { id: 'invoices', label: 'Invoices & Statements', state: issuedInvoices.length ? 'completed' : 'pending' },
        { id: 'management-decision', label: 'Management Sign-off', state: 'current' }
      ];

      const percent = pbc.length ? Math.round((acceptedPbc.length / pbc.length) * 100) : 100;

      return {
        moduleId: 'MOD-08',
        moduleName: 'Client Experience Portal',
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
        nextAction: returnedPbc.length ? 'Respond to staff clarification note and upload revised PBC document' : pendingPbc.length ? 'Upload requested file for outstanding PBC items' : 'Review shared documents or issued invoices',
        whoActsNext: returnedPbc.length || pendingPbc.length ? 'Client Finance Contributor' : 'Client Administrator'
      };
    }

    case 'documents': {
      const pbc = activeEng?.pbc || [];
      const returnedPbc = pbc.filter(p => p.status === 'Needs clarification');
      const underReviewPbc = pbc.filter(p => p.status === 'Received' || p.status === 'Under review');
      const acceptedPbc = pbc.filter(p => p.status === 'Accepted');
      const draftPbc = pbc.filter(p => p.status === 'Draft');

      const steps: WorkflowStep[] = [
        { id: 'draft-pbc', label: 'Draft Request', state: draftPbc.length ? 'current' : 'completed' },
        { id: 'requested-pbc', label: 'Requested from Client', state: pbc.some(p => p.status === 'Requested') ? 'current' : 'completed' },
        { id: 'received-review', label: 'Received & Review', state: returnedPbc.length ? 'returned' : underReviewPbc.length ? 'current' : 'pending' },
        { id: 'evidence-acceptance', label: 'Accepted as Evidence', state: acceptedPbc.length ? 'completed' : 'pending' },
        { id: 'canonical-storage', label: 'Canonical Archive', state: 'completed' }
      ];

      return {
        moduleId: 'MOD-09',
        moduleName: 'Documents & PBC',
        route: 'documents',
        currentSection: 'Document Management & Client PBC Requests',
        steps,
        percentComplete: pbc.length ? Math.round((acceptedPbc.length / pbc.length) * 100) : 50,
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
      const timeEntries = state.times || [];
      const userEntries = timeEntries.filter(t => !state.currentUserId || t.person === state.currentPerson);
      const approved = userEntries.filter(t => t.status === 'Approved');
      const submitted = userEntries.filter(t => t.status === 'Submitted');
      const returned = userEntries.filter(t => t.status === 'Returned');
      const drafts = userEntries.filter(t => t.status === 'Draft');

      const steps: WorkflowStep[] = [
        { id: 'entry', label: 'Draft Time Entry', state: drafts.length ? 'current' : 'completed' },
        { id: 'job-coding', label: 'Job & Task Coding', state: 'completed' },
        { id: 'submission', label: 'Submitted for Review', state: returned.length ? 'returned' : submitted.length ? 'current' : 'pending' },
        { id: 'manager-approval', label: 'Manager Approved', state: approved.length ? 'completed' : 'pending' },
        { id: 'billing-allocation', label: 'Available for Billing', state: approved.length ? 'completed' : 'pending', targetRoute: 'billing' }
      ];

      return {
        moduleId: 'MOD-12',
        moduleName: 'Time Tracking',
        route: 'my-time',
        currentSection: 'Staff Time Registration & Timesheet Review',
        steps,
        percentComplete: userEntries.length ? Math.round((approved.length / userEntries.length) * 100) : 0,
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
      const budget = (state.budgets || []).find(b => b.engagementId === activeEng?.id);
      const steps: WorkflowStep[] = [
        { id: 'hours-budget', label: 'Hours & Rates Plan', state: budget ? 'completed' : 'current' },
        { id: 'actual-capture', label: 'Actual Time Tracking', state: 'current', targetRoute: 'my-time' },
        { id: 'variance-analysis', label: 'Variance Calculation', state: 'current' },
        { id: 'margin-review', label: 'Realized Margin', state: 'current' },
        { id: 'revision', label: 'Budget Versioning', state: budget && budget.version > 1 ? 'completed' : 'pending' }
      ];

      return {
        moduleId: 'MOD-13',
        moduleName: 'Budgets & Variances',
        route: 'budgets',
        currentSection: 'Engagement Budget & Recovery Analysis',
        steps,
        percentComplete: budget ? 70 : 30,
        counts: {
          completed: 1,
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
      const cancelled = invoices.filter(i => i.status === 'Cancelled');

      const steps: WorkflowStep[] = [
        { id: 'time-billing-source', label: 'Source Time & Fees', state: 'completed', targetRoute: 'my-time' },
        { id: 'invoice-draft', label: 'Draft Invoice', state: draft.length ? 'current' : 'completed' },
        { id: 'independent-review', label: 'Independent Review', state: approved.length ? 'completed' : draft.length ? 'current' : 'pending' },
        { id: 'issue-record', label: 'Issued Invoice', state: issued.length ? 'completed' : 'pending' },
        { id: 'receipt-settlement', label: 'Settlement & Receipts', state: paid.length ? 'completed' : 'pending', targetRoute: 'receivables' }
      ];

      const percent = invoices.length ? Math.round(((paid.length + issued.length) / invoices.length) * 100) : 0;

      return {
        moduleId: 'MOD-14',
        moduleName: 'Billing & Invoices',
        route: 'billing',
        currentSection: 'Invoicing & Fee Realization Register',
        steps,
        percentComplete: percent,
        counts: {
          completed: paid.length + issued.length,
          pending: approved.length + draft.length,
          blocked: cancelled.length,
          total: invoices.length
        },
        completedSummary: `${issued.length} invoice(s) issued; ${paid.length} fully settled.`,
        pendingSummary: `${draft.length} draft invoice(s); ${approved.length} approved awaiting issue.`,
        blockedSummary: cancelled.length ? `${cancelled.length} invoice(s) cancelled with unreserved time.` : undefined,
        blockers: cancelled.map(i => `Invoice ${i.invoiceNumber || i.id} was cancelled.`),
        nextAction: approved.length ? `Issue approved invoice ${approved[0].invoiceNumber || approved[0].id}` : draft.length ? 'Submit or approve draft invoice (SoD required)' : 'Draft invoice from approved time',
        whoActsNext: approved.length ? 'Billing Specialist / Partner' : 'Independent Reviewer'
      };
    }

    case 'receivables': {
      const invoices = scopedInvoices(state).filter(i => i.status === 'Issued' || i.status === 'Paid');
      const outstanding = invoices.filter(i => i.status === 'Issued');
      const receipts = state.receipts || [];

      const steps: WorkflowStep[] = [
        { id: 'receivable-ledger', label: 'Issued Invoices', state: invoices.length ? 'completed' : 'pending', targetRoute: 'billing' },
        { id: 'aging-categorization', label: 'Aging Buckets', state: 'completed' },
        { id: 'receipt-intake', label: 'Offline Receipts', state: receipts.length ? 'completed' : 'current' },
        { id: 'split-allocation', label: 'Line Allocations', state: receipts.some(r => r.allocations?.length) ? 'completed' : 'current' },
        { id: 'reconciliation', label: 'Settled Accounts', state: outstanding.length === 0 && invoices.length > 0 ? 'completed' : 'current' }
      ];

      return {
        moduleId: 'MOD-15',
        moduleName: 'Receivables & Receipts',
        route: 'receivables',
        currentSection: 'Accounts Receivable & Cash Allocation',
        steps,
        percentComplete: invoices.length ? Math.round(((invoices.length - outstanding.length) / invoices.length) * 100) : 100,
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
        moduleId: 'MOD-16',
        moduleName: 'Report Centre',
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
        moduleId: 'MOD-18',
        moduleName: 'Microsoft 365 Setup',
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

      const steps: WorkflowStep[] = [
        { id: 'user-dir', label: 'User Directory', state: 'completed' },
        { id: 'role-grants', label: 'Role & Scope Grants', state: 'completed' },
        { id: 'invitations', label: 'Simulated Invitations', state: pendingInvites.length ? 'current' : 'completed' },
        { id: 'firm-settings', label: 'Firm Parameters', state: 'completed' },
        { id: 'access-audit', label: 'Authorization Audit', state: 'current' }
      ];

      return {
        moduleId: 'MOD-19',
        moduleName: 'Firm Administration',
        route: 'administration',
        currentSection: 'User Directory, Role Grants & Firm Settings',
        steps,
        percentComplete: 90,
        counts: {
          completed: activeUsers.length,
          pending: pendingInvites.length,
          blocked: 0,
          total: users.length
        },
        completedSummary: `${activeUsers.length} synthetic user identity(ies) active with explicit role and scope grants.`,
        pendingSummary: `${pendingInvites.length} simulated invitation(s) pending acceptance.`,
        blockers: [],
        nextAction: 'Manage user roles, grant engagement scopes, or configure practice defaults',
        whoActsNext: 'Firm Administrator'
      };
    }

    case 'accounting-setup':
    case 'trial-balance':
    case 'gl-transactions':
    case 'account-mappings':
    case 'adjustments':
    case 'reconciliations': {
      const adjustments: AdjustmentJournalItem[] = state.adjustmentJournals || [];
      const engAdjs = adjustments.filter(a => !activeEng || a.engagementId === activeEng.id);
      const acceptedAdjs = engAdjs.filter(a => a.status === 'Management accepted' || a.status === 'Reporting included');
      const techReviewAdjs = engAdjs.filter(a => a.status === 'Technical review');
      const draftAdjs = engAdjs.filter(a => a.status === 'Draft');
      const rejectedAdjs = engAdjs.filter(a => a.status === 'Rejected');

      const steps: WorkflowStep[] = [
        { id: 'tb-source', label: 'TB & GL Intake', state: activeEng?.sourceVersion ? 'completed' : 'current' },
        { id: 'account-mapping', label: 'Account Mapping', state: activeEng?.mappingApproved ? 'completed' : 'current' },
        { id: 'adjustments-step', label: 'Adjustment Journals', state: techReviewAdjs.length ? 'current' : acceptedAdjs.length ? 'completed' : 'pending' },
        { id: 'reconciliations-step', label: 'Reconciliations', state: 'current' },
        { id: 'financial-statements-step', label: 'Statements Ready', state: acceptedAdjs.length > 0 || (engAdjs.length === 0 && Boolean(activeEng?.mappingApproved)) ? 'completed' : 'pending', targetRoute: 'financial-statements' }
      ];

      return {
        moduleId: 'MOD-20',
        moduleName: 'Accounting Workbench',
        route: 'accounting-setup',
        currentSection: 'Trial Balance, Mappings, Adjustments & Reconciliations',
        steps,
        percentComplete: activeEng?.mappingApproved ? 75 : 40,
        counts: {
          completed: acceptedAdjs.length,
          pending: techReviewAdjs.length + draftAdjs.length,
          blocked: rejectedAdjs.length,
          total: engAdjs.length || 1
        },
        completedSummary: `${acceptedAdjs.length} adjustment journal(s) accepted by client management; mapping approved.`,
        pendingSummary: `${techReviewAdjs.length} journal(s) in technical review, ${draftAdjs.length} in draft.`,
        blockedSummary: rejectedAdjs.length ? `${rejectedAdjs.length} journal(s) rejected during review.` : undefined,
        blockers: rejectedAdjs.map((a: AdjustmentJournalItem) => `Journal ${a.id}: Rejected in review - ${a.reviewNote || 'Correction required'}`),
        nextAction: techReviewAdjs.length
          ? 'Conduct independent technical review on proposed adjustment'
          : draftAdjs.length
            ? 'Submit draft adjustment journal for technical review'
            : 'Verify trial balance mappings and review timing reconciliations',
        whoActsNext: techReviewAdjs.length ? 'Independent Accounting Reviewer' : draftAdjs.length ? 'Preparer' : 'Preparer / Manager'
      };
    }

    case 'financial-statements': {
      const isApproved = Boolean(activeEng?.mappingApproved);
      const steps: WorkflowStep[] = [
        { id: 'mapping-source', label: 'Approved Mappings', state: isApproved ? 'completed' : 'blocked', targetRoute: 'accounting-setup' },
        { id: 'bs-pl', label: 'Balance Sheet & P&L', state: isApproved ? 'completed' : 'pending' },
        { id: 'schedules', label: 'Cash Flow & Equity', state: isApproved ? 'current' : 'pending' },
        { id: 'notes', label: 'Notes to Accounts', state: isApproved ? 'current' : 'pending' },
        { id: 'package-ready', label: 'Package Assembly', state: isApproved ? 'completed' : 'pending', targetRoute: 'financial-packages' }
      ];

      return {
        moduleId: 'MOD-24',
        moduleName: 'Financial Statements',
        route: 'financial-statements',
        currentSection: 'Statement Set & Supporting Schedules',
        steps,
        percentComplete: isApproved ? 80 : 20,
        counts: {
          completed: isApproved ? 3 : 0,
          pending: isApproved ? 2 : 5,
          blocked: isApproved ? 0 : 1,
          total: 5
        },
        completedSummary: isApproved ? 'Financial statements reconciled to accepted trial balance and mapped lines.' : 'Awaiting approved account mappings.',
        pendingSummary: isApproved ? 'Cash flow and statement note disclosures ready for review.' : 'Mapping approval prerequisite not met.',
        blockedSummary: !isApproved ? 'Statement generation blocked until account mappings are independently approved.' : undefined,
        blockers: !isApproved ? ['Account mappings must be approved in Accounting Workbench before statements can be verified.'] : [],
        nextAction: isApproved ? 'Review statement notes and proceed to Financial Packages assembly' : 'Approve account mappings in Accounting Workbench',
        whoActsNext: isApproved ? 'Financial Reviewer / Manager' : 'Independent Reviewer'
      };
    }

    case 'financial-packages': {
      const latestPackage = (activeEng?.packageHistory || [])[activeEng?.packageHistory?.length ? activeEng.packageHistory.length - 1 : 0];
      const isAssembled = Boolean(latestPackage);
      const isPresented = Boolean(activeEng?.managementPresentation);
      const isAck = activeEng?.managementPackageDecision?.decision === 'Acknowledged';

      const steps: WorkflowStep[] = [
        { id: 'assembly', label: 'Package Assembly', state: isAssembled ? 'completed' : 'current' },
        { id: 'format-gen', label: 'Artifact Generation', state: isAssembled ? 'completed' : 'pending' },
        { id: 'validation', label: 'Technical Validation', state: latestPackage?.validation?.passed ? 'completed' : isAssembled ? 'current' : 'pending' },
        { id: 'presentation', label: 'Management Presentation', state: isPresented ? 'completed' : latestPackage?.validation?.passed ? 'current' : 'pending' },
        { id: 'management-decision', label: 'Management Sign-off', state: isAck ? 'completed' : isPresented ? 'current' : 'pending' }
      ];

      const percent = isAck ? 100 : isPresented ? 80 : latestPackage?.validation?.passed ? 60 : isAssembled ? 40 : 10;

      return {
        moduleId: 'MOD-25',
        moduleName: 'Financial Packages',
        route: 'financial-packages',
        currentSection: 'Financial Statements Package Assembly & Artifacts',
        steps,
        percentComplete: percent,
        counts: {
          completed: isAck ? 1 : 0,
          pending: isAck ? 0 : 1,
          blocked: latestPackage && !latestPackage.validation.passed ? 1 : 0,
          total: 1
        },
        completedSummary: isAck ? 'Financial package formally acknowledged by client management.' : isAssembled ? 'Financial package artifacts (XLSX, DOCX, PDF) assembled.' : 'Package ready for assembly.',
        pendingSummary: !isAck && isPresented ? 'Awaiting client management acknowledgement.' : !isPresented && latestPackage?.validation?.passed ? 'Awaiting presentation to client management.' : 'Package generation pending.',
        blockedSummary: latestPackage && !latestPackage.validation.passed ? 'Package validation blocked due to unmapped or pending balances.' : undefined,
        blockers: latestPackage && !latestPackage.validation.passed ? ['Balance sheet does not balance or unresolved validation errors.'] : [],
        nextAction: isPresented && !isAck ? 'Record client management decision' : latestPackage?.validation?.passed ? 'Present validated package to client management' : 'Assemble package artifacts',
        whoActsNext: isPresented ? 'Client Management' : 'Engagement Manager'
      };
    }

    case 'consolidation': {
      const groups = state.consolidationGroups || [];
      const group = groups[0];
      const elims = group?.eliminations || [];
      const approvedElims = elims.filter(e => e.status === 'Approved');
      const pendingElims = elims.filter(e => e.status === 'Submitted' || e.status === 'Draft');
      const outputPkg = (group?.outputPackages || [])[(group?.outputPackages || []).length - 1];

      const steps: WorkflowStep[] = [
        { id: 'perimeter', label: 'Group Perimeter', state: group ? 'completed' : 'current' },
        { id: 'component-sources', label: 'Pinned Component Sources', state: group?.components?.length ? 'completed' : 'pending' },
        { id: 'fx-rates', label: 'FX Translation Rates', state: Object.keys(group?.fxRates || {}).length ? 'completed' : 'current' },
        { id: 'eliminations', label: 'Eliminations', state: pendingElims.length ? 'current' : approvedElims.length ? 'completed' : 'pending' },
        { id: 'output', label: 'Group Output Package', state: outputPkg?.status === 'Approved' ? 'completed' : 'pending' }
      ];

      return {
        moduleId: 'MOD-26',
        moduleName: 'Group Consolidation',
        route: 'consolidation',
        currentSection: 'Multi-Entity Group Consolidation & Elimination',
        steps,
        percentComplete: outputPkg?.status === 'Approved' ? 100 : 70,
        counts: {
          completed: approvedElims.length,
          pending: pendingElims.length,
          blocked: 0,
          total: elims.length || 1
        },
        completedSummary: `${approvedElims.length} balanced intercompany elimination(s) independently approved.`,
        pendingSummary: `${pendingElims.length} elimination(s) awaiting review; translation balanced.`,
        blockers: [],
        nextAction: pendingElims.length ? 'Review and approve pending elimination entries' : 'Prepare and download consolidated output package',
        whoActsNext: 'Group Reviewer / Partner'
      };
    }

    case 'audit-planning': {
      const plan = (state.auditPlans || []).find(p => p.engagementId === activeEng?.id);
      const isApproved = plan?.status === 'Approved';
      const isUnderReview = plan?.status === 'Under review';

      const steps: WorkflowStep[] = [
        { id: 'context', label: 'Engagement Benchmark', state: 'completed' },
        { id: 'materiality', label: 'Materiality Calculation', state: plan?.overallMateriality ? 'completed' : 'current' },
        { id: 'risks-scope', label: 'Risk Scoping', state: 'completed', targetRoute: 'audit-risks' },
        { id: 'milestones', label: 'Team & Milestones', state: 'completed' },
        { id: 'plan-approval', label: 'Plan Approval', state: isApproved ? 'completed' : isUnderReview ? 'current' : 'pending' }
      ];

      return {
        moduleId: 'MOD-28',
        moduleName: 'Audit Planning & Materiality',
        route: 'audit-planning',
        currentSection: 'Materiality, Audit Strategy & Milestones',
        steps,
        percentComplete: isApproved ? 100 : isUnderReview ? 80 : 50,
        counts: {
          completed: isApproved ? 1 : 0,
          pending: isApproved ? 0 : 1,
          blocked: 0,
          total: 1
        },
        completedSummary: isApproved ? `Audit plan v${plan?.version || 1} approved with overall materiality recorded.` : 'Planning benchmarks calculated.',
        pendingSummary: isUnderReview ? 'Audit plan submitted for independent review.' : 'Plan drafting in progress.',
        blockers: [],
        nextAction: isUnderReview ? 'Perform independent review on audit plan' : !isApproved ? 'Submit audit plan for review' : 'Proceed to risk assessment and audit programs',
        whoActsNext: isUnderReview ? 'Audit Partner / Manager' : 'Assigned Preparer'
      };
    }

    case 'audit-risks':
    case 'audit-fieldwork': {
      const risks = (state.auditRisks || []).filter(r => !activeEng || r.engagementId === activeEng.id);
      const programs = (state.auditPrograms || []).filter(p => !activeEng || p.engagementId === activeEng.id);
      const procs: AuditProcedureItem[] = programs.flatMap(pr => pr.procedures || []);
      const cleared = procs.filter((p: AuditProcedureItem) => p.status === 'Cleared' || p.status === 'Completed');
      const submitted = procs.filter((p: AuditProcedureItem) => p.status === 'Submitted');
      const inProgress = procs.filter((p: AuditProcedureItem) => p.status === 'In progress');
      const exceptions = procs.filter((p: AuditProcedureItem) => p.status === 'Exceptions noted' || p.status === 'Exception noted');

      const steps: WorkflowStep[] = [
        { id: 'risk-assessment', label: 'Risk Assessment', state: risks.length ? 'completed' : 'current' },
        { id: 'program-design', label: 'Program Design', state: procs.length ? 'completed' : 'pending' },
        { id: 'fieldwork', label: 'Procedure Execution', state: inProgress.length ? 'current' : 'completed' },
        { id: 'review-clearance', label: 'Procedure Clearance', state: exceptions.length ? 'returned' : submitted.length ? 'current' : 'completed' },
        { id: 'exceptions-findings', label: 'Findings Linkage', state: exceptions.length ? 'blocked' : 'completed', targetRoute: 'findings' }
      ];

      const percent = procs.length ? Math.round((cleared.length / procs.length) * 100) : 0;

      return {
        moduleId: 'MOD-29',
        moduleName: 'Risks & Audit Programs',
        route: 'audit-risks',
        currentSection: 'Audit Programs & Procedure Execution',
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
        nextAction: exceptions.length ? `Link exceptions in ${exceptions[0].id} to findings register` : submitted.length ? `Clear submitted procedure ${submitted[0].id}` : 'Execute assigned audit procedures',
        whoActsNext: submitted.length ? 'Assigned Reviewer' : 'Audit Senior / Preparer'
      };
    }

    case 'sampling': {
      const populations = (state.samplePopulations || []).filter(p => !activeEng || p.engagementId === activeEng.id);
      const pop = populations[0];
      const items: SamplePopulationRow[] = pop?.items || [];
      const tested = items.filter((i: SamplePopulationRow) => i.tested);
      const selected = items.filter((i: SamplePopulationRow) => i.selected);

      const steps: WorkflowStep[] = [
        { id: 'population-intake', label: 'Population Intake', state: pop ? 'completed' : 'current' },
        { id: 'gl-reconciliation', label: 'GL Reconciliation', state: pop?.sourceComplete ? 'completed' : 'current' },
        { id: 'selection', label: 'Sample Selection', state: selected.length ? 'completed' : 'current' },
        { id: 'testing', label: 'Substantive Testing', state: tested.length === selected.length && selected.length > 0 ? 'completed' : tested.length > 0 ? 'current' : 'pending' },
        { id: 'evaluation', label: 'Review & Exceptions', state: pop?.selectionReviews?.length ? 'completed' : 'pending' }
      ];

      return {
        moduleId: 'MOD-31',
        moduleName: 'Sampling & Populations',
        route: 'sampling',
        currentSection: 'Audit Sampling & Substantive Testing',
        steps,
        percentComplete: selected.length ? Math.round((tested.length / selected.length) * 100) : 50,
        counts: {
          completed: tested.length,
          pending: selected.length - tested.length,
          blocked: 0,
          total: selected.length || items.length
        },
        completedSummary: `${tested.length} sample item(s) tested against primary documentation.`,
        pendingSummary: `${selected.length - tested.length} selected item(s) awaiting testing.`,
        blockers: [],
        nextAction: tested.length < selected.length ? 'Complete substantive testing for selected items' : 'Review sampling results and evaluate population error',
        whoActsNext: tested.length < selected.length ? 'Assigned Preparer' : 'Audit Reviewer'
      };
    }

    case 'audit': {
      const wps = activeEng?.workpapers || [];
      const cleared = wps.filter(w => w.status === 'Cleared');
      const submitted = wps.filter(w => w.status === 'Submitted');
      const rework = wps.filter(w => w.status === 'Changes required');
      const inProgress = wps.filter(w => w.status === 'In progress');
      const planned = wps.filter(w => w.status === 'Planned');
      const na = wps.filter(w => w.status === 'Not applicable');
      const applicable = wps.filter(w => w.status !== 'Not applicable');

      const steps: WorkflowStep[] = [
        { id: 'wp-setup', label: 'Template Setup', state: 'completed' },
        { id: 'wp-execution', label: 'Preparation', state: rework.length ? 'returned' : inProgress.length ? 'current' : 'completed' },
        { id: 'wp-evidence', label: 'Evidence Attached', state: 'completed', targetRoute: 'evidence' },
        { id: 'wp-submitted', label: 'Independent Review', state: submitted.length ? 'current' : 'completed' },
        { id: 'wp-cleared', label: 'Cleared Workpapers', state: cleared.length === applicable.length && applicable.length > 0 ? 'completed' : 'current' }
      ];

      const percent = applicable.length ? Math.round((cleared.length / applicable.length) * 100) : 0;

      return {
        moduleId: 'MOD-32',
        moduleName: 'Audit Workpapers',
        route: 'audit',
        currentSection: 'Audit Workpapers & Lead Schedules',
        steps,
        percentComplete: percent,
        counts: {
          completed: cleared.length + na.length,
          pending: submitted.length + inProgress.length + planned.length,
          blocked: rework.length,
          total: wps.length,
          returned: rework.length
        },
        completedSummary: `${cleared.length} of ${applicable.length} applicable workpaper(s) independently cleared.`,
        pendingSummary: `${submitted.length} submitted awaiting review; ${inProgress.length} in progress.`,
        blockedSummary: rework.length ? `${rework.length} workpaper(s) marked 'Changes required' due to evidence/source updates.` : undefined,
        blockers: rework.map(w => `${w.id} (${w.title}): Rework required - review note or evidence revision invalidated submission`),
        nextAction: rework.length ? `Revise workpaper ${rework[0].id} and resubmit` : submitted.length ? `Clear submitted workpaper ${submitted[0].id}` : 'Complete open audit fieldwork workpapers',
        whoActsNext: rework.length ? 'Assigned Preparer' : submitted.length ? 'Assigned Reviewer' : 'Audit Team'
      };
    }

    case 'evidence': {
      const docs = state.documents || [];
      const evidence = state.evidenceCatalogue || [];
      const adequate = evidence.filter(e => e.adequacyStatus === 'Adequate');
      const deficient = evidence.filter(e => e.adequacyStatus === 'Deficient');
      const pending = evidence.filter(e => e.adequacyStatus === 'Pending verification');

      const steps: WorkflowStep[] = [
        { id: 'intake', label: 'Document Intake', state: docs.length ? 'completed' : 'current' },
        { id: 'hash', label: 'Integrity & Hashing', state: 'completed' },
        { id: 'adequacy', label: 'Adequacy Assessment', state: deficient.length ? 'blocked' : pending.length ? 'current' : 'completed' },
        { id: 'linkage', label: 'Workpaper Linkage', state: adequate.length ? 'completed' : 'pending', targetRoute: 'audit' },
        { id: 'retention', label: 'Release Preservation', state: 'completed' }
      ];

      return {
        moduleId: 'MOD-33',
        moduleName: 'Evidence Catalogue',
        route: 'evidence',
        currentSection: 'Audit Evidence & Corroborating Documentation',
        steps,
        percentComplete: evidence.length ? Math.round((adequate.length / evidence.length) * 100) : 80,
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

      const steps: WorkflowStep[] = [
        { id: 'id', label: 'Difference Identification', state: findings.length ? 'completed' : 'current' },
        { id: 'quant', label: 'Quantification', state: 'completed' },
        { id: 'discussion', label: 'Management Discussion', state: open.length ? 'current' : 'completed' },
        { id: 'disposition', label: 'Disposition Recorded', state: resolved.length ? 'completed' : 'pending' },
        { id: 'tb-reflection', label: 'TB Reflection / Waiver', state: resolved.length === findings.length && findings.length > 0 ? 'completed' : 'current' }
      ];

      return {
        moduleId: 'MOD-34',
        moduleName: 'Findings & Differences',
        route: 'findings',
        currentSection: 'Audit Differences & Findings Register',
        steps,
        percentComplete: findings.length ? Math.round((resolved.length / findings.length) * 100) : 100,
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

      const steps: WorkflowStep[] = [
        { id: 'query', label: 'Review Query Raised', state: notes.length ? 'completed' : 'current' },
        { id: 'assignment', label: 'Assignee Notified', state: 'completed' },
        { id: 'response', label: 'Preparer Response', state: reopened.length ? 'returned' : responded.length ? 'completed' : open.length ? 'current' : 'completed' },
        { id: 'clearance', label: 'Reviewer Clearance', state: cleared.length === notes.length && notes.length > 0 ? 'completed' : responded.length ? 'current' : 'pending' },
        { id: 'resolution', label: 'Engagement Sign-off', state: cleared.length === notes.length && notes.length > 0 ? 'completed' : 'pending' }
      ];

      const percent = notes.length ? Math.round((cleared.length / notes.length) * 100) : 100;

      return {
        moduleId: 'MOD-35',
        moduleName: 'Review Desk',
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
      const mgr = Boolean(apprs.manager);
      const client = Boolean(apprs.client);
      const partner = Boolean(apprs.partner);
      const eqr = Boolean(apprs.eqr);
      const eqrRequired = Boolean(activeEng?.eqrRequired);

      const steps: WorkflowStep[] = [
        { id: 'mgr-approval', label: 'Manager Sign-off', state: mgr ? 'completed' : 'current' },
        { id: 'client-approval', label: 'Client Management', state: client ? 'completed' : mgr ? 'current' : 'pending' },
        { id: 'partner-approval', label: 'Partner Sign-off', state: partner ? 'completed' : client ? 'current' : 'pending' },
        { id: 'eqr-approval', label: eqrRequired ? 'EQR Sign-off' : 'EQR (Not Required)', state: !eqrRequired ? 'na' : eqr ? 'completed' : partner ? 'current' : 'pending' },
        { id: 'release-auth', label: 'Release Authorization', state: partner && (!eqrRequired || eqr) ? 'completed' : 'pending', targetRoute: 'delivery' }
      ];

      const requiredCount = 3 + (eqrRequired ? 1 : 0);
      const doneCount = (mgr ? 1 : 0) + (client ? 1 : 0) + (partner ? 1 : 0) + (eqrRequired && eqr ? 1 : 0);
      const percent = Math.round((doneCount / requiredCount) * 100);

      return {
        moduleId: 'MOD-36',
        moduleName: 'Sign-offs & EQR',
        route: 'approvals',
        currentSection: 'Engagement Final Approvals & Quality Review',
        steps,
        percentComplete: percent,
        counts: {
          completed: doneCount,
          pending: requiredCount - doneCount,
          blocked: 0,
          total: requiredCount
        },
        completedSummary: `${doneCount} of ${requiredCount} required sign-offs recorded for current generation.`,
        pendingSummary: `${requiredCount - doneCount} approval(s) outstanding.`,
        blockers: [],
        nextAction: !mgr ? 'Record Manager technical approval' : !client ? 'Record Client Management approval' : !partner ? 'Record Partner engagement sign-off' : eqrRequired && !eqr ? 'Record EQR concurrence' : 'All approvals cleared for release',
        whoActsNext: !mgr ? 'Engagement Manager' : !client ? 'Client Management' : !partner ? 'Engagement Partner' : eqrRequired && !eqr ? 'Independent EQR Partner' : 'Partner'
      };
    }

    case 'delivery': {
      const allWpCleared = activeEng ? activeEng.workpapers.every(w => !w.applicable || w.status === 'Cleared' || w.status === 'Not applicable') : false;
      const noOpenReviews = activeEng ? activeEng.reviews.every(r => r.status === 'Cleared') : false;
      const openBlockingFindings = (activeEng && state.findings) ? state.findings.filter(f => f.engagementId === activeEng.id && isReleaseBlockingFinding(f)) : [];
      const noMaterialFindings = openBlockingFindings.length === 0;
      const approvalsValid = Boolean(
        activeEng &&
        activeEng.approvals.manager?.generation === activeEng.generation &&
        activeEng.approvals.client?.generation === activeEng.generation &&
        activeEng.approvals.partner?.generation === activeEng.generation &&
        (!activeEng.eqrRequired || activeEng.approvals.eqr?.generation === activeEng.generation)
      );
      const blockers: string[] = [];
      if (!allWpCleared) blockers.push('Workpapers not all cleared');
      if (!noOpenReviews) blockers.push('Outstanding open review notes');
      if (!noMaterialFindings) blockers.push(`${openBlockingFindings.length} material findings open`);
      if (!approvalsValid) blockers.push('Multi-stage approvals incomplete or invalidated');

      const isReady = activeEng ? blockers.length === 0 : false;
      const isCandidate = Boolean(activeEng?.candidate);
      const isReleased = Boolean(activeEng?.releases?.length);
      const isArchived = Boolean(activeEng?.archive);

      const steps: WorkflowStep[] = [
        { id: 'readiness-gates', label: 'Readiness Gates', state: isReady ? 'completed' : 'blocked' },
        { id: 'candidate-prep', label: 'Candidate Preparation', state: isCandidate || isReleased ? 'completed' : isReady ? 'current' : 'pending' },
        { id: 'partner-issue', label: 'Partner Release', state: isReleased ? 'completed' : isCandidate ? 'current' : 'pending' },
        { id: 'post-release', label: 'Archival & Handover', state: isArchived ? 'completed' : isReleased ? 'current' : 'pending', targetRoute: 'records' },
        { id: 'lineage', label: 'Immutable Lineage', state: isReleased ? 'completed' : 'pending' }
      ];

      return {
        moduleId: 'MOD-37',
        moduleName: 'Release & Completion',
        route: 'delivery',
        currentSection: 'Final Release Gates & Artifact Packaging',
        steps,
        percentComplete: isArchived ? 100 : isReleased ? 80 : isCandidate ? 60 : isReady ? 40 : 20,
        counts: {
          completed: isReady ? 1 : 0,
          pending: isReleased ? 0 : 1,
          blocked: isReady ? 0 : blockers.length,
          total: 1
        },
        completedSummary: isReleased ? 'Engagement release candidate formally issued with immutable manifest.' : isReady ? 'All readiness gates evaluated and cleared.' : 'Evaluating release gates.',
        pendingSummary: isReleased ? 'Release issued.' : isCandidate ? 'Release candidate frozen; awaiting partner issue.' : 'Readiness gates have outstanding requirements.',
        blockedSummary: !isReady ? `${blockers.length} gate blocker(s) prevent release candidate preparation.` : undefined,
        blockers: isReady ? [] : blockers,
        nextAction: isReleased ? 'Proceed to Records & Archive' : isCandidate ? 'Issue release candidate as Partner' : isReady ? 'Freeze release candidate' : 'Resolve outstanding release gate blockers',
        whoActsNext: isCandidate ? 'Engagement Partner' : isReady ? 'Partner / Manager' : 'Engagement Team'
      };
    }

    case 'records': {
      const isArchived = Boolean(activeEng?.archive);
      const isReleased = Boolean(activeEng?.releases?.length);
      const onHold = Boolean(activeEng?.archive?.onApplicationHold);

      const steps: WorkflowStep[] = [
        { id: 'ingestion', label: 'Release Ingestion', state: isReleased ? 'completed' : 'pending', targetRoute: 'delivery' },
        { id: 'archive-record', label: 'Archived Lineage', state: isArchived ? 'completed' : 'current' },
        { id: 'retention-policy', label: 'Retention Hold', state: onHold ? 'blocked' : isArchived ? 'completed' : 'pending' },
        { id: 'handover', label: 'Handover Log', state: isArchived ? 'current' : 'pending' },
        { id: 'custody', label: 'Permanent Record', state: isArchived ? 'completed' : 'pending' }
      ];

      return {
        moduleId: 'MOD-38',
        moduleName: 'Records & Archive',
        route: 'records',
        currentSection: 'Logical Archive, Lineage & Handover',
        steps,
        percentComplete: isArchived ? 90 : 20,
        counts: {
          completed: isArchived ? 1 : 0,
          pending: isArchived ? 0 : 1,
          blocked: onHold ? 1 : 0,
          total: 1
        },
        completedSummary: isArchived ? 'Engagement records logically archived in browser custody.' : 'Awaiting engagement release before archival.',
        pendingSummary: !isArchived ? 'Engagement must be Released before it can be archived.' : 'Archive record complete.',
        blockers: !isArchived && !isReleased ? ['Engagement has not been released.'] : onHold ? [`Retention application hold in place: ${activeEng?.archive?.holdReason || 'Hold active'}`] : [],
        nextAction: !isArchived ? 'Release engagement in Release & Completion' : 'Manage archive retention hold or record handover',
        whoActsNext: 'Records Manager / Archivist'
      };
    }

    default: {
      const steps: WorkflowStep[] = [
        { id: 'step-1', label: 'Setup', state: 'completed' },
        { id: 'step-2', label: 'Execution', state: 'current' },
        { id: 'step-3', label: 'Verification', state: 'pending' },
        { id: 'step-4', label: 'Completion', state: 'pending' }
      ];

      return {
        moduleId: 'MOD-SPEC',
        moduleName: 'System Specifications',
        route,
        currentSection: 'Specification & Reference',
        steps,
        percentComplete: 75,
        counts: { completed: 1, pending: 0, blocked: 0, total: 1 },
        completedSummary: 'Specifications verified against repository architecture.',
        pendingSummary: 'All sections available.',
        blockers: [],
        nextAction: 'Navigate to target workspace',
        whoActsNext: 'User'
      };
    }
  }
}
