import { ENGAGEMENT_WORKFLOW_SUBSTEPS } from './targetLifecycle';

const steps: Record<string,string[]> = {
  acquisition: ['Validate the legal entity and a reachable contact.', 'Record intake, owner and next action; convert the opportunity with traceable references.'],
  proposals: ['Prepare, independently approve, present and dispatch the current proposal revision.', 'Capture client acceptance; pin exact engagement service, period, currency and fee.'],
  engagements: ['Complete both commercial and professional acceptance keys.', 'Prepare the EL as Manager; the assigned Partner issues it with actual period and deadline.'],
  billing: ['Inspect the issued unpaid advance invoice.', 'Record effective 50% settlement once; generate or retry its receipt and simulated onboarding.'],
  onboarding: ['Complete acceptance/continuance and independent assigned-Partner approval.', 'Inspect the automatic five-folder workspace and simulated liaison invitation.'],
  'audit-planning': ['Import and approve mapping for the current balanced TB.', 'Derive benchmark and explain normalization; assign milestones and obtain assigned-Partner plan approval.'],
  scheduling: ['Allocate staff by phase with captured role rates, dates, capacity and leave.', 'Resolve overlapping capacity before saving; assignments do not confer permissions.'],
  'trial-balance': ['Upload CSV/XLSX and inspect signed balances and source digest.', 'Retain source bytes, approve the current mapping and reconfirm planning after replacement.'],
  'financial-statements': ['Inspect mapped P&L and Balance Sheet lines and shared FSLI risk.', 'Open the exact substantive program or record a distinct Analytical Review and Going Concern conclusion.'],
  'audit-risks': ['Execute the assigned Green, Amber or Red procedures in the FSLI workpaper.', 'Link current adequate evidence and submit; resolve returned rows before independent clearance.'],
  sampling: ['Reconcile the complete source population to the current TB control account.', 'Select reproducible samples; record tests and current Digital, Physical or Hybrid evidence.'],
  confirmations: ['Create scoped Bank, AR, AP, Inventory or Legal confirmations.', 'Record outcomes/evidence; unresolved critical items generate a Holding Letter and block release.'],
  findings: ['Quantify differences and propose balanced AJEs using current TB accounts.', 'Obtain independent review; record evidenced management correspondence and current-source reflection without double adjustment.'],
  reviews: ['Clear applicable workpapers independently and resolve blocking findings.', 'Record meaningful Manager clearance; inspect or retry the current SRM and obtain assigned-Partner approval.'],
  delivery: ['Choose a justified Partner opinion and compile the current exact five-part bundle.', 'Attach management-signed LOR; release the current bundle and inspect its linked final invoice.'],
  records: ['Inspect effective report-date plus 60-day closure or assigned-Partner early lock.', 'Download scoped records and verified archived originals; inspect missing-byte exceptions separately.'],
  reports: ['Compare budget and recorded time using historically captured rates.', 'Inspect realization, cost and utilization; missing inputs remain Unknown.'],
  'practice-ledger': ['Record dated firm expenses and Partner withdrawals.', 'Reconcile monthly TB/P&L and month-end AR using the common invoice/receipt/reversal projection.'],
  portal: ['Complete the simulated first-login reset and upload requested files.', 'Review rejection reasons and replace evidence; inspect issued invoices and released files within engagement scope.']
};

export const TARGET_GUIDES = Object.entries(steps).map(([route,actions]) => ({
  id: `WORKFLOW-${route}`, route, name: ENGAGEMENT_WORKFLOW_SUBSTEPS.find(s => s.route === route)?.label || route.replaceAll('-',' '),
  steps: actions, outcome: 'Inspect the saved source revision, actor and history before the next handover.',
  limits: 'Synthetic prototype: professional decisions are explicit; external delivery, provisioning and authentication are simulations.'
}));
