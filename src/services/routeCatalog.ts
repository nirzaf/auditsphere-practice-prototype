// Route catalogue: navigation section + human module name for every route, used by the shell
// breadcrumb and cross-module handoff links. Exhaustive over RouteKey (compile-time checked).
import type { RouteKey } from '../types';

export interface RouteInfo { section: string; label: string }

export const ROUTE_CATALOG: Record<RouteKey, RouteInfo> = {
  'overview': { section: 'Practice', label: 'Practice Overview' },
  'clients': { section: 'Practice', label: 'Client Portfolio' },
  'client-detail': { section: 'Practice', label: 'Client 360' },
  'acquisition': { section: 'Practice', label: 'Acquisition & Pipeline' },
  'proposals': { section: 'Practice', label: 'Proposals & Terms' },
  'engagements': { section: 'Practice', label: 'Engagements' },
  'onboarding': { section: 'Practice', label: 'Acceptance & KYC' },
  'jobs': { section: 'Work & Collaboration', label: 'Jobs & Tasks' },
  'job-templates': { section: 'Work & Collaboration', label: 'Job Templates' },
  'communications': { section: 'Work & Collaboration', label: 'Team & Client Comms' },
  'documents': { section: 'Work & Collaboration', label: 'Documents & SharePoint' },
  'my-time': { section: 'Economics & Billing', label: 'Time Tracking' },
  'budgets': { section: 'Economics & Billing', label: 'Budgets & Variances' },
  'billing': { section: 'Economics & Billing', label: 'Billing & Invoices' },
  'receivables': { section: 'Economics & Billing', label: 'Receivables & Receipts' },
  'accounting-setup': { section: 'Accounting Workbench', label: 'Accounting Workbench' },
  'trial-balance': { section: 'Accounting Workbench', label: 'Trial Balance' },
  'gl-transactions': { section: 'Accounting Workbench', label: 'GL Transactions' },
  'account-mappings': { section: 'Accounting Workbench', label: 'Account Mappings' },
  'adjustments': { section: 'Accounting Workbench', label: 'Adjustment Journals' },
  'reconciliations': { section: 'Accounting Workbench', label: 'Reconciliations' },
  'financial-statements': { section: 'Accounting Workbench', label: 'Financial Statements' },
  'financial-packages': { section: 'Accounting Workbench', label: 'Financial Packages' },
  'consolidation': { section: 'Accounting Workbench', label: 'Group Consolidation' },
  'audit-planning': { section: 'Audit & Assurance', label: 'Audit Planning & Materiality' },
  'audit-risks': { section: 'Audit & Assurance', label: 'Risks & Audit Programs' },
  'audit-fieldwork': { section: 'Audit & Assurance', label: 'Audit Fieldwork' },
  'sampling': { section: 'Audit & Assurance', label: 'Sampling & Populations' },
  'audit': { section: 'Audit & Assurance', label: 'Audit Workpapers' },
  'evidence': { section: 'Audit & Assurance', label: 'Evidence Catalogue' },
  'findings': { section: 'Audit & Assurance', label: 'Findings & Differences' },
  'reviews': { section: 'Audit & Assurance', label: 'Review Desk' },
  'approvals': { section: 'Audit & Assurance', label: 'Sign-offs & EQR' },
  'quality': { section: 'Audit & Assurance', label: 'Sign-offs & EQR' },
  'delivery': { section: 'Audit & Assurance', label: 'Release & Completion' },
  'records': { section: 'Audit & Assurance', label: 'Records & Archive' },
  'portal': { section: 'Client Services', label: 'Client Portal' },
  'reports': { section: 'Client Services & Admin', label: 'Report Centre' },
  'administration': { section: 'Client Services & Admin', label: 'Firm Administration' },
  'services': { section: 'Client Services & Admin', label: 'Firm Administration' },
  'm365-setup': { section: 'Client Services & Admin', label: 'Microsoft 365 Setup' },
  'requirements': { section: 'Reference', label: 'Requirements & PRD' },
  'role-guide': { section: 'Reference', label: 'Role Guide' },
  'module-guide': { section: 'Reference', label: 'Module Guide & Tour' }
};

/** Stable uppercase route code shown in the breadcrumb (matches the historical crumb text). */
export const routeCode = (route: RouteKey) => route.toUpperCase().replace('-', ' ');
