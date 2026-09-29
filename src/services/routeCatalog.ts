// Route catalogue: navigation section + human module name for every route, used by the shell
// breadcrumb and cross-module handoff links. Exhaustive over RouteKey (compile-time checked).
import type { RouteKey } from '../types';

export type RouteProgressMode = 'workflow' | 'summary' | 'reference';
export interface RouteInfo { section: string; label: string; moduleId: string; progressMode: RouteProgressMode }

export const ROUTE_CATALOG: Record<RouteKey, RouteInfo> = {
  'overview': { section: 'Practice', label: 'Practice Overview', moduleId: 'MOD-01', progressMode: 'summary' },
  'clients': { section: 'Practice', label: 'Client Portfolio', moduleId: 'MOD-02', progressMode: 'workflow' },
  'client-detail': { section: 'Practice', label: 'Client 360', moduleId: 'MOD-02', progressMode: 'workflow' },
  'acquisition': { section: 'Practice', label: 'Acquisition & Pipeline', moduleId: 'MOD-03', progressMode: 'workflow' },
  'proposals': { section: 'Practice', label: 'Proposals & Terms', moduleId: 'MOD-04', progressMode: 'workflow' },
  'engagements': { section: 'Practice', label: 'Engagements', moduleId: 'MOD-04', progressMode: 'workflow' },
  'onboarding': { section: 'Practice', label: 'Acceptance & KYC', moduleId: 'MOD-27', progressMode: 'workflow' },
  'jobs': { section: 'Work & Collaboration', label: 'Jobs & Tasks', moduleId: 'MOD-05', progressMode: 'workflow' },
  'job-templates': { section: 'Work & Collaboration', label: 'Job Templates', moduleId: 'MOD-06', progressMode: 'workflow' },
  'communications': { section: 'Work & Collaboration', label: 'Communications', moduleId: 'MOD-11', progressMode: 'workflow' },
  'documents': { section: 'Work & Collaboration', label: 'Documents & SharePoint', moduleId: 'MOD-10', progressMode: 'workflow' },
  'my-time': { section: 'Economics & Billing', label: 'Time Tracking', moduleId: 'MOD-12', progressMode: 'workflow' },
  'budgets': { section: 'Economics & Billing', label: 'Budgets & Variances', moduleId: 'MOD-13', progressMode: 'workflow' },
  'billing': { section: 'Economics & Billing', label: 'Billing & Invoices', moduleId: 'MOD-14', progressMode: 'workflow' },
  'receivables': { section: 'Economics & Billing', label: 'Receivables & Receipts', moduleId: 'MOD-15', progressMode: 'workflow' },
  'accounting-setup': { section: 'Accounting Workbench', label: 'Accounting Setup', moduleId: 'MOD-20', progressMode: 'workflow' },
  'trial-balance': { section: 'Accounting Workbench', label: 'Trial Balance', moduleId: 'MOD-21', progressMode: 'workflow' },
  'gl-transactions': { section: 'Accounting Workbench', label: 'GL Transactions', moduleId: 'MOD-21', progressMode: 'workflow' },
  'account-mappings': { section: 'Accounting Workbench', label: 'Account Mappings', moduleId: 'MOD-20', progressMode: 'workflow' },
  'adjustments': { section: 'Accounting Workbench', label: 'Adjustment Journals', moduleId: 'MOD-22', progressMode: 'workflow' },
  'reconciliations': { section: 'Accounting Workbench', label: 'Reconciliations', moduleId: 'MOD-23', progressMode: 'workflow' },
  'financial-statements': { section: 'Accounting Workbench', label: 'Financial Statements', moduleId: 'MOD-24', progressMode: 'workflow' },
  'financial-packages': { section: 'Accounting Workbench', label: 'Financial Packages', moduleId: 'MOD-25', progressMode: 'workflow' },
  'consolidation': { section: 'Accounting Workbench', label: 'Group Consolidation', moduleId: 'MOD-26', progressMode: 'workflow' },
  'audit-planning': { section: 'Audit & Assurance', label: 'Audit Planning & Materiality', moduleId: 'MOD-28', progressMode: 'workflow' },
  'audit-risks': { section: 'Audit & Assurance', label: 'Risks & Audit Programs', moduleId: 'MOD-29', progressMode: 'workflow' },
  'audit-fieldwork': { section: 'Audit & Assurance', label: 'Audit Fieldwork', moduleId: 'MOD-30', progressMode: 'workflow' },
  'sampling': { section: 'Audit & Assurance', label: 'Sampling & Populations', moduleId: 'MOD-31', progressMode: 'workflow' },
  'audit': { section: 'Audit & Assurance', label: 'Audit Workpapers', moduleId: 'MOD-32', progressMode: 'workflow' },
  'evidence': { section: 'Audit & Assurance', label: 'Evidence Catalogue', moduleId: 'MOD-33', progressMode: 'workflow' },
  'findings': { section: 'Audit & Assurance', label: 'Findings & Differences', moduleId: 'MOD-34', progressMode: 'workflow' },
  'reviews': { section: 'Audit & Assurance', label: 'Review Desk', moduleId: 'MOD-35', progressMode: 'workflow' },
  'approvals': { section: 'Audit & Assurance', label: 'Sign-offs & EQR', moduleId: 'MOD-36', progressMode: 'workflow' },
  'quality': { section: 'Audit & Assurance', label: 'Sign-offs & EQR', moduleId: 'MOD-36', progressMode: 'workflow' },
  'delivery': { section: 'Audit & Assurance', label: 'Release & Completion', moduleId: 'MOD-37', progressMode: 'workflow' },
  'records': { section: 'Audit & Assurance', label: 'Records & Archive', moduleId: 'MOD-38', progressMode: 'workflow' },
  'portal': { section: 'Client Services', label: 'Client Portal', moduleId: 'MOD-08', progressMode: 'workflow' },
  'reports': { section: 'Client Services & Admin', label: 'Report Centre', moduleId: 'MOD-16', progressMode: 'summary' },
  'administration': { section: 'Client Services & Admin', label: 'Firm Administration', moduleId: 'MOD-39', progressMode: 'workflow' },
  'services': { section: 'Client Services & Admin', label: 'Firm Administration', moduleId: 'MOD-39', progressMode: 'workflow' },
  'm365-setup': { section: 'Client Services & Admin', label: 'Microsoft 365 Setup', moduleId: 'MOD-18', progressMode: 'workflow' },
  'requirements': { section: 'Reference', label: 'Requirements & PRD', moduleId: 'REF', progressMode: 'reference' },
  'client-requirements': { section: 'Reference', label: 'Client Requirements', moduleId: 'REF', progressMode: 'reference' },
  'role-guide': { section: 'Reference', label: 'Role Guide', moduleId: 'REF', progressMode: 'reference' },
  'module-guide': { section: 'Reference', label: 'Module Guide & Tour', moduleId: 'REF', progressMode: 'reference' }
};

/** Stable uppercase route code shown in the breadcrumb (matches the historical crumb text). */
export const routeCode = (route: RouteKey) => route.toUpperCase().replace('-', ' ');
