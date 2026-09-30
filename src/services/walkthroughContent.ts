// Client-facing "1-minute walkthrough" copy for every module (MOD-01..MOD-39).
// Deliberately short and jargon-free: what the module is for, three things to try, and the
// result to expect. The presenter-oriented detail (personas, failure paths, prototype limits)
// stays in moduleGuideContent.ts; nothing here is a second requirements source.
import type { RouteKey } from '../types';
import { ROUTE_CATALOG } from './routeCatalog';

export interface WalkthroughStep { title: string; action: string; see: string }
export interface ModuleWalkthrough { id: string; name: string; purpose: string; steps: WalkthroughStep[]; result: string }

const s = (title: string, action: string, see: string): WalkthroughStep => ({ title, action, see });
const w = (id: string, name: string, purpose: string, steps: WalkthroughStep[], result: string): ModuleWalkthrough => ({ id, name, purpose, steps, result });

export const WALKTHROUGHS: ModuleWalkthrough[] = [
  w('MOD-01', 'Practice Overview', 'See the health of the whole practice on one screen.', [
    s('Pick your focus', 'Use the client and engagement filters at the top.', 'Every number narrows to what you selected.'),
    s('Follow a number', 'Click an overdue or open-work counter.', 'The list behind it opens, and its total matches the counter.'),
    s('Change the date', 'Adjust the as-of date or assignee.', 'Counts update, so you can see how the picture shifts over time.'),
  ], 'A trustworthy, drill-down view of workload and risk, limited to what you are allowed to see.'),
  w('MOD-02', 'Client Portfolio', 'Keep one shared record for every client and contact.', [
    s('Open a client', 'Select a client from the portfolio list.', 'The Client 360 page shows profile, contacts and linked work.'),
    s('Check the contacts', 'Open Contacts and find the primary contact.', 'Each contact has a role and a clear owner.'),
    s('Jump to related work', 'Open a linked engagement, invoice or document.', 'You land on it and can return to the same client.'),
  ], 'One client identity that follows the client across every module.'),
  w('MOD-03', 'Acquisition & Pipeline', 'Track prospective work from first enquiry to won or lost.', [
    s('Open an enquiry', 'Select an item in the pipeline.', 'Service interest, expected fee and stage history appear.'),
    s('Move it forward', 'Qualify the enquiry.', 'Open pipeline totals update, kept separate by currency.'),
    s('Convert a win', 'Mark it Won and convert it to a prospect.', 'A new prospect is created. Formal acceptance is still a separate step.'),
  ], 'A clear pipeline and a clean hand-off to onboarding, with no duplicate records.'),
  w('MOD-04', 'Proposals & Engagements', 'Turn an opportunity into a signed-off, active engagement.', [
    s('Draft a proposal', 'Create a proposal with service, period, fee and terms.', 'The proposal is saved as a draft you can review.'),
    s('Review and present', 'Submit it, then have a second person review and present it.', 'Each decision is recorded with who made it.'),
    s('Activate the engagement', 'Record the client response, then create and activate the engagement.', 'Team and due dates are set, and history is kept.'),
  ], 'Commercial agreement, professional acceptance and activation stay separate and traceable.'),
  w('MOD-05', 'Jobs & Tasks', 'Plan who does what, and by when.', [
    s('Open a job', 'Select a job to see its tasks.', 'Tasks show assignee, order and status.'),
    s('Assign and update', 'Change an assignee or task status, and add a note.', 'The change is saved and attributed.'),
    s('Watch progress', 'Return to the job list.', 'Progress reflects the updated task statuses.'),
  ], 'Everyone can see the work, the owner and the status. Assigning a task does not grant approval rights.'),
  w('MOD-06', 'Job Templates', 'Reuse a proven job structure instead of starting from scratch.', [
    s('Choose a template', 'Open a template from the list.', 'Its tasks and order are shown.'),
    s('Create a job from it', 'Use the template to start a new job.', 'The new job has the same structure.'),
    s('Check what is copied', 'Open the new job.', 'Only the structure is copied. There is no earlier evidence or sign-off.'),
  ], 'Consistent setup every time, without carrying old work forward.'),
  w('MOD-07', 'Team Collaboration', 'Keep internal discussion next to the work.', [
    s('Add a note', 'Write an internal note on a job or communication.', 'The note appears with your name and time.'),
    s('Reply or edit', 'Respond to a colleague or edit your own note.', 'Edits are attributed and never overwrite history.'),
    s('Check the scope', 'Look for a message marked local.', 'It stays inside the demo and is not sent as email or chat.'),
  ], 'A shared, attributed record of team discussion.'),
  w('MOD-08', 'Client Portal', 'Give clients a safe place to respond and follow progress.', [
    s('See what is asked of you', 'Open the portal home.', 'Your outstanding requests and items to approve are listed.'),
    s('Send a file', 'Upload a response to a request.', 'Your firm sees it. Each new version is kept.'),
    s('Approve where allowed', 'Open an item waiting for approval.', 'Only people with the right permission can approve it.'),
  ], 'Clients see only their own information and know exactly what is expected.'),
  w('MOD-09', 'Client Requests (PBC)', 'Ask for information once and track every reply.', [
    s('Raise a request', 'Open a client and its Requests tab.', 'Each request shows due date, owner and status.'),
    s('Receive a response', 'View the client’s upload in the portal.', 'Receipt is recorded against the same request.'),
    s('Review it', 'Mark the response reviewed or ask for a fix.', 'Receiving a file and accepting it are separate steps.'),
  ], 'One thread per request, with every version kept.'),
  w('MOD-10', 'Documents & SharePoint', 'Store engagement files in one organised structure.', [
    s('Browse the library', 'Open a client or engagement folder.', 'Files are grouped by type and engagement.'),
    s('Add a document', 'Upload a file and tag it.', 'It appears in the folder with its version and owner.'),
    s('Check storage status', 'Open a file’s details.', 'The screen says whether the file is saved in this browser or only simulated.'),
  ], 'A predictable home for every document. SharePoint is simulated in this demo.'),
  w('MOD-11', 'Communications', 'Draft and log client correspondence.', [
    s('Start a message', 'Create a new communication for a client.', 'A draft opens with the client and engagement filled in.'),
    s('Log it', 'Save or mark it as sent.', 'It is added to the client’s history.'),
    s('Find it later', 'Filter by client or engagement.', 'The full trail appears in date order.'),
  ], 'A single place to see what was said to a client. Nothing is actually emailed from this demo.'),
  w('MOD-12', 'Time Tracking', 'Record hours and get them approved.', [
    s('Log time', 'Add hours against a job.', 'The entry shows in your timesheet.'),
    s('Submit for approval', 'Submit the week.', 'A manager can approve or return it.'),
    s('See the effect', 'Open totals after approval.', 'Only approved time counts, at the agreed rate.'),
  ], 'Approved hours feed budgets and billing with a clear audit trail.'),
  w('MOD-13', 'Budgets & Variances', 'Compare what was planned with what happened.', [
    s('Open an engagement budget', 'Choose an engagement.', 'Planned hours and fees are shown.'),
    s('Compare with actuals', 'Look at the variance columns.', 'Over or under budget is highlighted.'),
    s('Read the cost gaps', 'Look for Unknown values.', 'Missing cost is shown as Unknown rather than guessed.'),
  ], 'Early warning on overruns, with honest gaps rather than assumed figures.'),
  w('MOD-14', 'Billing & Invoices', 'Turn approved work into an invoice.', [
    s('Pick billable work', 'Open an engagement’s billable items.', 'Approved time and agreed fees are listed.'),
    s('Create the invoice', 'Draft and issue an invoice.', 'A numbered invoice is produced with the right client and currency.'),
    s('Review the record', 'Open the issued invoice.', 'Lines, totals and status are shown and cannot be silently changed.'),
  ], 'A clean invoice record. This is a demo record, not a payment request.'),
  w('MOD-15', 'Receivables & Receipts', 'See who owes what, and for how long.', [
    s('Open the ageing view', 'Go to Receivables.', 'Balances are grouped by how overdue they are.'),
    s('Record a receipt', 'Apply a payment or credit to an invoice.', 'The balance drops and the history is kept.'),
    s('Check the result', 'Look at the invoice again.', 'Remaining balance and ageing band are up to date.'),
  ], 'An accurate list of what is still owed.'),
  w('MOD-16', 'Report Centre', 'Get ready-made reports from your data.', [
    s('Choose a report', 'Pick one from the list.', 'It opens with the current filters.'),
    s('Narrow it down', 'Filter by client, period or engagement.', 'Figures update instantly.'),
    s('Export', 'Use the export button.', 'A file is downloaded for sharing.'),
  ], 'Reports that explain the records in the system. They are not statutory accounts.'),
  w('MOD-17', 'Search & Client View', 'Find anything, and go straight to it.', [
    s('Open search', 'Press / or click the search bar.', 'A search box opens over the page.'),
    s('Type a name or number', 'Search a client, job, workpaper or invoice.', 'Matching records are grouped by type.'),
    s('Go to the record', 'Select a result.', 'You land on that exact record, not just the module home.'),
  ], 'Any record is a few keystrokes away.'),
  w('MOD-18', 'Microsoft 365 Setup', 'See how the firm would connect to Microsoft 365.', [
    s('Open setup', 'Go through the connection steps.', 'Each step explains what access is requested.'),
    s('Run a check', 'Test the connection.', 'The result is clearly labelled Simulated.'),
    s('Review access', 'Look at the scoped permissions.', 'Connecting does not by itself give anyone access to client data.'),
  ], 'A clear picture of the integration, with no live connection in this demo.'),
  w('MOD-19', 'Identity & Access', 'Control who can see and do what.', [
    s('Open Administration', 'Go to users and roles.', 'Each person has a role and a scope.'),
    s('Switch identity', 'Use the identity selector at the top.', 'Menus and data change to match that person.'),
    s('Try a restricted action', 'Attempt something outside that role.', 'It is blocked with a clear explanation.'),
  ], 'Permissions that visibly match roles. The identity switch is a demo aid, not a real login.'),
  w('MOD-20', 'Accounting Setup', 'Prepare the client’s books for reporting.', [
    s('Select the client and period', 'Choose the reporting context.', 'The same context is used on every accounting screen.'),
    s('Import a source', 'Load a trial balance or ledger file.', 'A preview shows what will be imported.'),
    s('Confirm the import', 'Accept the preview.', 'The source is saved and cannot be edited afterwards.'),
  ], 'A single, consistent accounting context for the client.'),
  w('MOD-21', 'Trial Balance & GL', 'Load and inspect the client’s figures.', [
    s('Open the trial balance', 'View the imported balances.', 'Debits and credits are shown by account.'),
    s('Drill into the ledger', 'Open GL Transactions for an account.', 'The underlying entries are listed.'),
    s('Check the totals', 'Compare with the trial balance.', 'They agree, or the difference is flagged.'),
  ], 'Traceable figures from balance down to transaction.'),
  w('MOD-22', 'Adjustment Journals', 'Propose corrections and get them approved.', [
    s('Draft an adjustment', 'Create a journal with debit and credit lines.', 'It must balance before it can be submitted.'),
    s('Submit for approval', 'Send it to a reviewer.', 'The reviewer sees the exact proposed entry.'),
    s('See the effect', 'Open the statements after approval.', 'Only approved adjustments change the reported totals.'),
  ], 'Every adjustment is proposed, reviewed and traceable. Nothing is posted to a real ledger.'),
  w('MOD-23', 'Reconciliations', 'Prove two sets of figures agree.', [
    s('Open a reconciliation', 'Choose an account to reconcile.', 'Source balance and comparison balance are shown.'),
    s('Explain the difference', 'Add a timing item.', 'The unexplained difference shrinks.'),
    s('Submit for review', 'Send it for approval.', 'The reviewer sees the full working.'),
  ], 'Differences are either explained or clearly left open.'),
  w('MOD-24', 'Financial Statements', 'Produce statements from the accepted figures.', [
    s('Open the statements', 'Choose the period.', 'Balance sheet and income statement appear.'),
    s('Trace a line', 'Click a figure.', 'You see the accounts and adjustments behind it.'),
    s('Check reconciliation', 'Look at the checks panel.', 'Statements tie back to the trial balance.'),
  ], 'Statements that can be traced to their source.'),
  w('MOD-25', 'Financial Packages', 'Bundle the statements into a reviewed client package.', [
    s('Assemble a package', 'Select statements and supporting files.', 'They are listed with their versions.'),
    s('Review it', 'Send it for review and approval.', 'Approval is recorded against that exact version.'),
    s('Export', 'Download the approved package.', 'The file has a fingerprint so later changes can be detected.'),
  ], 'A final package whose contents can be verified.'),
  w('MOD-26', 'Group Consolidation', 'Combine several entities into group figures.', [
    s('Choose the components', 'Select the entities to include.', 'Each entity’s figures are pinned to a fixed version.'),
    s('Apply rates and eliminations', 'Set the exchange rate and intercompany eliminations.', 'Group totals update.'),
    s('Review the output', 'Open the result.', 'Group totals equal the components plus approved eliminations.'),
  ], 'Group reporting that shows its working. Component books are never changed.'),
  w('MOD-27', 'Acceptance & KYC', 'Decide whether the firm can take on a client.', [
    s('Open the checklist', 'Select a prospect.', 'Required checks and evidence are listed.'),
    s('Record the checks', 'Attach evidence and mark items complete.', 'Progress updates.'),
    s('Record the decision', 'A senior person accepts or declines.', 'The decision, date and decision-maker are kept.'),
  ], 'A recorded, reviewable acceptance decision. It is not a live screening service.'),
  w('MOD-28', 'Audit Planning', 'Set the basis for the audit.', [
    s('Set materiality', 'Enter the benchmark and percentage.', 'Overall and performance materiality are calculated.'),
    s('Record the assumptions', 'Add the reasoning.', 'It is saved with the plan.'),
    s('Approve the plan', 'Submit for review.', 'The approved version is locked for the team.'),
  ], 'A documented plan that the rest of the audit follows.'),
  w('MOD-29', 'Risks & Audit Programs', 'Link each risk to the work that addresses it.', [
    s('Add a risk', 'Record a risk with its rating.', 'It appears in the risk register.'),
    s('Link procedures', 'Attach audit procedures from a program.', 'Each risk shows the tests planned.'),
    s('Check coverage', 'Look for risks with no procedure.', 'Gaps are highlighted.'),
  ], 'Every significant risk has planned work against it.'),
  w('MOD-30', 'Audit Fieldwork', 'Carry out and track each procedure.', [
    s('Open a procedure', 'Select it from the program.', 'Its objective and status are shown.'),
    s('Record the work', 'Add results and link evidence.', 'The procedure moves to ready for review.'),
    s('Follow the review', 'Watch the reviewer’s decision.', 'Submitting is not clearance. A reviewer must accept it.'),
  ], 'A live view of what is done, what is in review, and what is left.'),
  w('MOD-31', 'Sampling & Populations', 'Select items to test from a full population.', [
    s('Load the population', 'Import the list of items.', 'Count and total are checked against the source.'),
    s('Select a sample', 'Choose a method and size.', 'Selected items are listed and reproducible.'),
    s('Record exceptions', 'Mark items that failed the test.', 'Exceptions are counted and can be sent to findings.'),
  ], 'A documented sample and its results. No statistical conclusion is implied.'),
  w('MOD-32', 'Audit Workpapers', 'Prepare and review the audit documentation.', [
    s('Open a workpaper', 'Pick one from the list.', 'You see its template, preparer and status.'),
    s('Prepare and submit', 'Complete it and submit for review.', 'The version at submission is kept.'),
    s('Track clearance', 'Wait for the reviewer.', 'Preparation, submission and clearance are shown as separate steps.'),
  ], 'A complete, versioned audit file.'),
  w('MOD-33', 'Evidence Catalogue', 'Keep track of the proof behind each conclusion.', [
    s('Browse the evidence', 'Open the catalogue.', 'Each item shows its source and version.'),
    s('See where it is used', 'Open an item.', 'Linked workpapers and procedures are listed.'),
    s('Add a new version', 'Upload a replacement.', 'The earlier version is kept, not overwritten.'),
  ], 'Every piece of evidence is findable and traceable to the work that relies on it.'),
  w('MOD-34', 'Findings & Differences', 'Record issues found and decide what to do.', [
    s('Log a finding', 'Create one from a test exception.', 'It carries the amount and the linked evidence.'),
    s('Decide the response', 'Choose a disposition and explain it.', 'The decision is recorded with who made it.'),
    s('Track it to close', 'Watch its status.', 'Open findings can block release.'),
  ], 'Nothing found is lost, and each item has a decision.'),
  w('MOD-35', 'Review Desk', 'Manage reviewer questions and responses.', [
    s('See your points', 'Open the Review Desk.', 'Points are grouped by status.'),
    s('Respond', 'Answer a point and link the fix.', 'It moves to Responded.'),
    s('Clear or reopen', 'The reviewer clears it or reopens it.', 'Every state change is attributed.'),
  ], 'A clear list of what reviewers still need.'),
  w('MOD-36', 'Sign-offs & EQR', 'Record who approved the work.', [
    s('Open the sign-off list', 'Select an engagement.', 'Required sign-offs and their status are shown.'),
    s('Record a decision', 'Approve or return with a reason.', 'The decision is saved with name and date.'),
    s('Independent review', 'Open the quality review.', 'An independent reviewer records their own decision.'),
  ], 'A clear approval trail. This demo does not carry legal signatures.'),
  w('MOD-37', 'Release & Completion', 'Check readiness and release the final output.', [
    s('Check readiness', 'Open the release checklist.', 'Anything blocking release is listed.'),
    s('Fix a blocker', 'Follow a link to resolve it.', 'The checklist updates.'),
    s('Release', 'Once clear, record the release.', 'The exact released version is recorded. Nothing is emailed.'),
  ], 'A release only happens when everything required is in place.'),
  w('MOD-38', 'Records & Archive', 'Keep the completed file for the record.', [
    s('Open completed engagements', 'Go to Records.', 'Released files are listed with their dates.'),
    s('Archive one', 'Move a completed engagement to the archive.', 'It becomes read-only.'),
    s('View the history', 'Open the archive log.', 'Each archive event shows who and when.'),
  ], 'A retained, read-only copy. Retention rules are not enforced by this demo.'),
  w('MOD-39', 'Firm Administration', 'Configure the practice.', [
    s('Open settings', 'Go to Administration.', 'Settings are grouped by area, each with an owner.'),
    s('Change a setting', 'Edit a value and save.', 'The screen states when the change takes effect.'),
    s('Review the log', 'Open the change history.', 'Every change is recorded.'),
  ], 'Firm-wide settings that are visible and controlled.'),
];

/** Routes that host an extra module's feature without owning a route of their own. */
const HOSTED: Partial<Record<RouteKey, string[]>> = {
  overview: ['MOD-17'], jobs: ['MOD-07'], documents: ['MOD-09'], communications: ['MOD-07'], administration: ['MOD-19'], services: ['MOD-19'],
  'client-detail': ['MOD-09'], portal: ['MOD-09']
};

export function walkthroughsForRoute(route: RouteKey): ModuleWalkthrough[] {
  const info = ROUTE_CATALOG[route];
  if (!info || info.moduleId === 'REF') return [];
  const ids = [info.moduleId, ...(HOSTED[route] || [])];
  return ids.map(id => WALKTHROUGHS.find(entry => entry.id === id)).filter((entry): entry is ModuleWalkthrough => Boolean(entry));
}

// Where each module sits in the source specification (v2.1): its business module and the
// canonical lifecycle stage(s) it serves. Shown as one quiet line so a client can place
// the screen in the overall engagement journey. Routes without an entry show no line.
export const LIFECYCLE_STATES = [
  'LEAD_INGESTION', 'PROPOSAL_GENERATION', 'DUAL_KEY_PENDING', 'ADVANCE_BILLING', 'PORTAL_ACTIVE_PLANNING', 'FIELDWORK_EXECUTION',
  'MANAGERIAL_REVIEW', 'PARTNER_APPROVAL', 'DELIVERABLE_RELEASE', 'COMPLIANCE_COUNTDOWN', 'ARCHIVED_READ_ONLY'
] as const;
export type LifecycleState = typeof LIFECYCLE_STATES[number];
export interface JourneyPlacement { specModule: string; states: LifecycleState[] }

const M1 = 'Module 1 · Commercial & CRM', M2 = 'Module 2 · Governance & Planning', M3 = 'Module 3 · Fieldwork',
  M4 = 'Module 4 · Reporting & Deliverables', M5 = 'Module 5 · Practice Analytics', PBC = 'Client PBC Portal';

export const JOURNEY: Partial<Record<RouteKey, JourneyPlacement>> = {
  clients: { specModule: M1, states: ['LEAD_INGESTION'] },
  'client-detail': { specModule: M1, states: ['LEAD_INGESTION', 'PORTAL_ACTIVE_PLANNING'] },
  acquisition: { specModule: M1, states: ['LEAD_INGESTION', 'PROPOSAL_GENERATION'] },
  proposals: { specModule: M1, states: ['PROPOSAL_GENERATION', 'DUAL_KEY_PENDING'] },
  engagements: { specModule: M1, states: ['DUAL_KEY_PENDING', 'ADVANCE_BILLING'] },
  onboarding: { specModule: M2, states: ['DUAL_KEY_PENDING'] },
  portal: { specModule: PBC, states: ['PORTAL_ACTIVE_PLANNING', 'FIELDWORK_EXECUTION'] },
  documents: { specModule: M2, states: ['PORTAL_ACTIVE_PLANNING'] },
  jobs: { specModule: M2, states: ['PORTAL_ACTIVE_PLANNING', 'FIELDWORK_EXECUTION'] },
  'audit-planning': { specModule: M2, states: ['PORTAL_ACTIVE_PLANNING'] },
  'accounting-setup': { specModule: M2, states: ['PORTAL_ACTIVE_PLANNING'] },
  'trial-balance': { specModule: M2, states: ['PORTAL_ACTIVE_PLANNING'] },
  'account-mappings': { specModule: M2, states: ['PORTAL_ACTIVE_PLANNING'] },
  'audit-risks': { specModule: M3, states: ['FIELDWORK_EXECUTION'] },
  'audit-fieldwork': { specModule: M3, states: ['FIELDWORK_EXECUTION'] },
  sampling: { specModule: M3, states: ['FIELDWORK_EXECUTION'] },
  audit: { specModule: M3, states: ['FIELDWORK_EXECUTION', 'MANAGERIAL_REVIEW'] },
  evidence: { specModule: M3, states: ['FIELDWORK_EXECUTION'] },
  findings: { specModule: M3, states: ['FIELDWORK_EXECUTION', 'MANAGERIAL_REVIEW'] },
  reviews: { specModule: M3, states: ['MANAGERIAL_REVIEW'] },
  approvals: { specModule: M3, states: ['MANAGERIAL_REVIEW', 'PARTNER_APPROVAL'] },
  quality: { specModule: M3, states: ['PARTNER_APPROVAL'] },
  'financial-statements': { specModule: M4, states: ['PARTNER_APPROVAL', 'DELIVERABLE_RELEASE'] },
  'financial-packages': { specModule: M4, states: ['DELIVERABLE_RELEASE'] },
  delivery: { specModule: M4, states: ['DELIVERABLE_RELEASE', 'COMPLIANCE_COUNTDOWN'] },
  records: { specModule: M4, states: ['COMPLIANCE_COUNTDOWN', 'ARCHIVED_READ_ONLY'] },
  'my-time': { specModule: M5, states: ['FIELDWORK_EXECUTION'] },
  budgets: { specModule: M5, states: ['FIELDWORK_EXECUTION'] },
  billing: { specModule: M5, states: ['ADVANCE_BILLING', 'DELIVERABLE_RELEASE'] },
  receivables: { specModule: M5, states: ['ADVANCE_BILLING', 'DELIVERABLE_RELEASE'] },
  reports: { specModule: M5, states: [] }
};

export const journeyForRoute = (route: RouteKey): JourneyPlacement | undefined => JOURNEY[route];
