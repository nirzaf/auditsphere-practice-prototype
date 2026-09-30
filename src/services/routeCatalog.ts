// Route catalogue: navigation section + human module name for every route, used by the shell
// breadcrumb and cross-module handoff links. Exhaustive over RouteKey (compile-time checked).
import type { RouteKey } from '../types';

export type RouteProgressMode = 'workflow' | 'summary' | 'reference';
export interface RouteInfo { section: string; label: string; moduleId: string; progressMode: RouteProgressMode }

export const ROUTE_CATALOG: Record<RouteKey, RouteInfo> = {
  'confirmations': { section: 'Module 3 — Technical Fieldwork', label: 'External Confirmations', moduleId: 'AUD-CONF', progressMode: 'workflow' },
  'practice-ledger': { section: 'Module 5 — Practice Management', label: 'Internal Firm Ledger / TB / P&L / AR Aging', moduleId: 'FIRM-LEDGER', progressMode: 'summary' },
  'scheduling': { section: 'Module 2 — Governance & Planning', label: 'Resource Scheduling', moduleId: 'STAFF', progressMode: 'workflow' },
  'overview': { section: 'Module 1 — Commercial & CRM', label: 'Lifecycle Overview', moduleId: 'MOD-01', progressMode: 'summary' },
  'clients': { section: 'Module 1 — Commercial & CRM', label: 'Client Profiles', moduleId: 'MOD-02', progressMode: 'workflow' },
  'client-detail': { section: 'Module 1 — Commercial & CRM', label: 'Client Profile', moduleId: 'MOD-02', progressMode: 'workflow' },
  'acquisition': { section: 'Module 1 — Commercial & CRM', label: 'Lead Ingestion', moduleId: 'MOD-03', progressMode: 'workflow' },
  'proposals': { section: 'Module 1 — Commercial & CRM', label: 'Quotes & Proposals', moduleId: 'MOD-04', progressMode: 'workflow' },
  'engagements': { section: 'Module 1 — Commercial & CRM', label: 'Engagement Letter', moduleId: 'MOD-04', progressMode: 'workflow' },
  'onboarding': { section: 'Module 2 — Governance & Planning', label: 'Acceptance / Continuance', moduleId: 'MOD-27', progressMode: 'workflow' },
  'jobs': { section: 'Work & Collaboration', label: 'Jobs & Tasks', moduleId: 'MOD-05', progressMode: 'workflow' },
  'job-templates': { section: 'Work & Collaboration', label: 'Job Templates', moduleId: 'MOD-06', progressMode: 'workflow' },
  'communications': { section: 'Work & Collaboration', label: 'Communications', moduleId: 'MOD-11', progressMode: 'workflow' },
  'documents': { section: 'Module 2 — Governance & Planning', label: 'Engagement Directory / PBC Workspace', moduleId: 'MOD-10', progressMode: 'workflow' },
  'my-time': { section: 'Module 5 — Practice Management', label: 'Daily Engagement / FSLI Time', moduleId: 'MOD-12', progressMode: 'workflow' },
  'budgets': { section: 'Economics & Billing', label: 'Budgets & Variances', moduleId: 'MOD-13', progressMode: 'workflow' },
  'billing': { section: 'Module 1 — Commercial & CRM', label: '50% Advance Invoice & Receipt', moduleId: 'MOD-14', progressMode: 'workflow' },
  'receivables': { section: 'Economics & Billing', label: 'Receivables & Receipts', moduleId: 'MOD-15', progressMode: 'workflow' },
  'accounting-setup': { section: 'Accounting Workbench', label: 'Accounting Setup', moduleId: 'MOD-20', progressMode: 'workflow' },
  'trial-balance': { section: 'Module 2 — Governance & Planning', label: 'Trial Balance Ingestion & Mapping', moduleId: 'MOD-21', progressMode: 'workflow' },
  'gl-transactions': { section: 'Accounting Workbench', label: 'GL Transactions', moduleId: 'MOD-21', progressMode: 'workflow' },
  'account-mappings': { section: 'Accounting Workbench', label: 'Account Mappings', moduleId: 'MOD-20', progressMode: 'workflow' },
  'adjustments': { section: 'Accounting Workbench', label: 'Adjustment Journals', moduleId: 'MOD-22', progressMode: 'workflow' },
  'reconciliations': { section: 'Accounting Workbench', label: 'Reconciliations', moduleId: 'MOD-23', progressMode: 'workflow' },
  'financial-statements': { section: 'Module 3 — Technical Fieldwork', label: 'Split P&L / Balance Sheet Dashboard', moduleId: 'MOD-24', progressMode: 'workflow' },
  'financial-packages': { section: 'Accounting Workbench', label: 'Financial Packages', moduleId: 'MOD-25', progressMode: 'workflow' },
  'consolidation': { section: 'Accounting Workbench', label: 'Group Consolidation', moduleId: 'MOD-26', progressMode: 'workflow' },
  'audit-planning': { section: 'Module 2 — Governance & Planning', label: 'Materiality & Planning', moduleId: 'MOD-28', progressMode: 'workflow' },
  'audit-risks': { section: 'Module 3 — Technical Fieldwork', label: 'Workprograms & Evidence', moduleId: 'MOD-29', progressMode: 'workflow' },
  'audit-fieldwork': { section: 'Module 3 — Technical Fieldwork', label: 'Workprograms & Evidence', moduleId: 'MOD-30', progressMode: 'workflow' },
  'sampling': { section: 'Module 3 — Technical Fieldwork', label: 'Sampling', moduleId: 'MOD-31', progressMode: 'workflow' },
  'audit': { section: 'Audit & Assurance', label: 'Audit Workpapers', moduleId: 'MOD-32', progressMode: 'workflow' },
  'evidence': { section: 'Module 3 — Technical Fieldwork', label: 'Evidence', moduleId: 'MOD-33', progressMode: 'workflow' },
  'findings': { section: 'Module 3 — Technical Fieldwork', label: 'Findings & Differences', moduleId: 'MOD-34', progressMode: 'workflow' },
  'reviews': { section: 'Module 3 — Technical Fieldwork', label: 'Review / SRM', moduleId: 'MOD-35', progressMode: 'workflow' },
  'approvals': { section: 'Audit & Assurance', label: 'Sign-offs & EQR', moduleId: 'MOD-36', progressMode: 'workflow' },
  'quality': { section: 'Audit & Assurance', label: 'Sign-offs & EQR', moduleId: 'MOD-36', progressMode: 'workflow' },
  'delivery': { section: 'Module 4 — Reporting & Archive', label: 'Audit Opinion & 5-Part Bundle', moduleId: 'MOD-37', progressMode: 'workflow' },
  'records': { section: 'Module 4 — Reporting & Archive', label: '60-Day File Completion / Archive', moduleId: 'MOD-38', progressMode: 'workflow' },
  'portal': { section: 'Client Portal', label: 'PBC Client Portal', moduleId: 'MOD-08', progressMode: 'workflow' },
  'reports': { section: 'Module 5 — Practice Management', label: 'Profitability & Utilization', moduleId: 'MOD-16', progressMode: 'summary' },
  'administration': { section: 'Client Services & Admin', label: 'Firm Administration', moduleId: 'MOD-39', progressMode: 'workflow' },
  'services': { section: 'Client Services & Admin', label: 'Firm Administration', moduleId: 'MOD-39', progressMode: 'workflow' },
  'm365-setup': { section: 'Client Services & Admin', label: 'Microsoft 365 Setup', moduleId: 'MOD-18', progressMode: 'workflow' },
  'requirements': { section: 'Reference / Specification', label: 'Functional Requirements', moduleId: 'REF', progressMode: 'reference' },
  'client-requirements': { section: 'Reference / Specification', label: 'Requirements Presentation', moduleId: 'REF', progressMode: 'reference' },
  'role-guide': { section: 'Reference', label: 'Role Guide', moduleId: 'REF', progressMode: 'reference' },
  'module-guide': { section: 'Reference', label: 'Module Guide & Tour', moduleId: 'REF', progressMode: 'reference' }
};

/** Stable uppercase route code shown in the breadcrumb (matches the historical crumb text). */
export const routeCode = (route: RouteKey) => route.toUpperCase().replace('-', ' ');
