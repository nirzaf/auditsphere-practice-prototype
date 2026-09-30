// Route catalogue: navigation section + human module name for every route, used by the shell
// breadcrumb and cross-module handoff links. Exhaustive over RouteKey (compile-time checked).
import type { RouteKey } from '../types';

export type RouteProgressMode = 'workflow' | 'summary' | 'reference';
export interface RouteInfo { section: string; label: string; moduleId: string; progressMode: RouteProgressMode }

export const ROUTE_CATALOG: Record<RouteKey, RouteInfo> = {
  'confirmations': { section: 'Module 3 — Technical Fieldwork', label: 'External Confirmations', moduleId: 'M3-CONF', progressMode: 'workflow' },
  'practice-ledger': { section: 'Module 5 — Practice Management', label: 'Internal Firm Ledger / TB / P&L / AR Aging', moduleId: 'M5-LEDGER', progressMode: 'summary' },
  'scheduling': { section: 'Module 2 — Governance & Planning', label: 'Resource Scheduling', moduleId: 'M2-STAFFING', progressMode: 'workflow' },
  'overview': { section: 'Module 1 — Commercial & CRM', label: 'Lifecycle Overview', moduleId: 'M1-OVERVIEW', progressMode: 'summary' },
  'clients': { section: 'Module 1 — Commercial & CRM', label: 'Client Profiles', moduleId: 'M1-CLIENTS', progressMode: 'workflow' },
  'client-detail': { section: 'Module 1 — Commercial & CRM', label: 'Client Profile', moduleId: 'M1-CLIENTS', progressMode: 'workflow' },
  'acquisition': { section: 'Module 1 — Commercial & CRM', label: 'Lead Ingestion', moduleId: 'M1-LEADS', progressMode: 'workflow' },
  'proposals': { section: 'Module 1 — Commercial & CRM', label: 'Quotes & Proposals', moduleId: 'M1-PROPOSALS', progressMode: 'workflow' },
  'engagements': { section: 'Module 1 — Commercial & CRM', label: 'Engagement Letter', moduleId: 'M1-EL', progressMode: 'workflow' },
  'onboarding': { section: 'Module 2 — Governance & Planning', label: 'Acceptance / Continuance', moduleId: 'M2-ACCEPTANCE', progressMode: 'workflow' },
  'jobs': { section: 'Work & Collaboration', label: 'Jobs & Tasks', moduleId: 'MOD-05', progressMode: 'workflow' },
  'job-templates': { section: 'Work & Collaboration', label: 'Job Templates', moduleId: 'MOD-06', progressMode: 'workflow' },
  'communications': { section: 'Work & Collaboration', label: 'Communications', moduleId: 'MOD-11', progressMode: 'workflow' },
  'documents': { section: 'Module 2 — Governance & Planning', label: 'Engagement Directory / PBC Workspace', moduleId: 'M2-PBC', progressMode: 'workflow' },
  'my-time': { section: 'Module 5 — Practice Management', label: 'Daily Engagement / FSLI Time', moduleId: 'M5-TIME', progressMode: 'workflow' },
  'budgets': { section: 'Economics & Billing', label: 'Budgets & Variances', moduleId: 'MOD-13', progressMode: 'workflow' },
  'billing': { section: 'Module 1 — Commercial & CRM', label: '50% Advance Invoice & Receipt', moduleId: 'M1-BILLING', progressMode: 'workflow' },
  'receivables': { section: 'Economics & Billing', label: 'Receivables & Receipts', moduleId: 'MOD-15', progressMode: 'workflow' },
  'accounting-setup': { section: 'Accounting Workbench', label: 'Accounting Setup', moduleId: 'MOD-20', progressMode: 'workflow' },
  'trial-balance': { section: 'Module 2 — Governance & Planning', label: 'Trial Balance Ingestion & Mapping', moduleId: 'M2-TB', progressMode: 'workflow' },
  'gl-transactions': { section: 'Accounting Workbench', label: 'GL Transactions', moduleId: 'MOD-21', progressMode: 'workflow' },
  'account-mappings': { section: 'Accounting Workbench', label: 'Account Mappings', moduleId: 'MOD-20', progressMode: 'workflow' },
  'adjustments': { section: 'Accounting Workbench', label: 'Adjustment Journals', moduleId: 'MOD-22', progressMode: 'workflow' },
  'reconciliations': { section: 'Accounting Workbench', label: 'Reconciliations', moduleId: 'MOD-23', progressMode: 'workflow' },
  'financial-statements': { section: 'Module 3 — Technical Fieldwork', label: 'Split P&L / Balance Sheet Dashboard', moduleId: 'M3-FS', progressMode: 'workflow' },
  'financial-packages': { section: 'Accounting Workbench', label: 'Financial Packages', moduleId: 'MOD-25', progressMode: 'workflow' },
  'consolidation': { section: 'Accounting Workbench', label: 'Group Consolidation', moduleId: 'MOD-26', progressMode: 'workflow' },
  'audit-planning': { section: 'Module 2 — Governance & Planning', label: 'Materiality & Planning', moduleId: 'M2-PLANNING', progressMode: 'workflow' },
  'audit-risks': { section: 'Module 3 — Technical Fieldwork', label: 'Workprograms & Evidence', moduleId: 'M3-PROGRAMS', progressMode: 'workflow' },
  'audit-fieldwork': { section: 'Module 3 — Technical Fieldwork', label: 'Workprograms & Evidence', moduleId: 'M3-PROGRAMS', progressMode: 'workflow' },
  'sampling': { section: 'Module 3 — Technical Fieldwork', label: 'Sampling', moduleId: 'M3-SAMPLES', progressMode: 'workflow' },
  'audit': { section: 'Audit & Assurance', label: 'Audit Workpapers', moduleId: 'MOD-32', progressMode: 'workflow' },
  'evidence': { section: 'Module 3 — Technical Fieldwork', label: 'Evidence', moduleId: 'M3-EVIDENCE', progressMode: 'workflow' },
  'findings': { section: 'Module 3 — Technical Fieldwork', label: 'Findings & Differences', moduleId: 'M3-FINDINGS', progressMode: 'workflow' },
  'reviews': { section: 'Module 3 — Technical Fieldwork', label: 'Review / SRM', moduleId: 'M3-REVIEW', progressMode: 'workflow' },
  'approvals': { section: 'Audit & Assurance', label: 'Sign-offs & EQR', moduleId: 'MOD-36', progressMode: 'workflow' },
  'quality': { section: 'Audit & Assurance', label: 'Sign-offs & EQR', moduleId: 'MOD-36', progressMode: 'workflow' },
  'delivery': { section: 'Module 4 — Reporting & Archive', label: 'Audit Opinion & 5-Part Bundle', moduleId: 'M4-DELIVERY', progressMode: 'workflow' },
  'records': { section: 'Module 4 — Reporting & Archive', label: '60-Day File Completion / Archive', moduleId: 'M4-ARCHIVE', progressMode: 'workflow' },
  'portal': { section: 'Client Portal', label: 'PBC Client Portal', moduleId: 'CLIENT-PBC', progressMode: 'workflow' },
  'reports': { section: 'Module 5 — Practice Management', label: 'Profitability & Utilization', moduleId: 'M5-ANALYTICS', progressMode: 'summary' },
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
