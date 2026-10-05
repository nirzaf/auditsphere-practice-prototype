// Route catalogue: the single authoritative navigation surface. It carries the
// section, human label, module id and progress mode for every route in the current
// STE Audit Management Tool prototype: the five visible modules, the client PBC
// portal and the reference routes.
//
// There is no legacy complement. `RouteKey` and `ROUTE_CATALOG` describe the same
// set, and retired identifiers no longer exist in the type model, so a retired route
// cannot reach navigation, search, workflow progress or route authorization.
import type { RouteKey } from '../types';

export type RouteProgressMode = 'workflow' | 'summary' | 'reference';
export interface RouteInfo { section: string; label: string; moduleId: string; progressMode: RouteProgressMode }

export const ROUTE_CATALOG: Record<RouteKey, RouteInfo> = {
  // Module 1 — Commercial & CRM
  'overview': { section: 'Module 1 — Commercial & CRM', label: 'Lifecycle Overview', moduleId: 'M1-OVERVIEW', progressMode: 'summary' },
  'clients': { section: 'Module 1 — Commercial & CRM', label: 'Client Profiles', moduleId: 'M1-CLIENTS', progressMode: 'workflow' },
  'client-detail': { section: 'Module 1 — Commercial & CRM', label: 'Client Profile', moduleId: 'M1-CLIENTS', progressMode: 'workflow' },
  'acquisition': { section: 'Module 1 — Commercial & CRM', label: 'Lead Ingestion', moduleId: 'M1-LEADS', progressMode: 'workflow' },
  'proposals': { section: 'Module 1 — Commercial & CRM', label: 'Quotes & Proposals', moduleId: 'M1-PROPOSALS', progressMode: 'workflow' },
  'engagements': { section: 'Module 1 — Commercial & CRM', label: 'Engagement Letter', moduleId: 'M1-EL', progressMode: 'workflow' },
  'billing': { section: 'Module 1 — Commercial & CRM', label: '50% Advance Invoice & Receipt', moduleId: 'M1-BILLING', progressMode: 'workflow' },
  // Module 2 — Governance & Planning
  'onboarding': { section: 'Module 2 — Governance & Planning', label: 'Acceptance / Continuance', moduleId: 'M2-ACCEPTANCE', progressMode: 'workflow' },
  'documents': { section: 'Module 2 — Governance & Planning', label: 'Engagement Directory / PBC Workspace', moduleId: 'M2-PBC', progressMode: 'workflow' },
  'trial-balance': { section: 'Module 2 — Governance & Planning', label: 'Trial Balance Ingestion & Mapping', moduleId: 'M2-TB', progressMode: 'workflow' },
  'audit-planning': { section: 'Module 2 — Governance & Planning', label: 'Materiality & Planning', moduleId: 'M2-PLANNING', progressMode: 'workflow' },
  'scheduling': { section: 'Module 2 — Governance & Planning', label: 'Resource Scheduling', moduleId: 'M2-STAFFING', progressMode: 'workflow' },
  // Module 3 — Technical Fieldwork
  'financial-statements': { section: 'Module 3 — Technical Fieldwork', label: 'Split P&L / Balance Sheet Dashboard', moduleId: 'M3-FS', progressMode: 'workflow' },
  'audit-risks': { section: 'Module 3 — Technical Fieldwork', label: 'Workprograms & Evidence', moduleId: 'M3-PROGRAMS', progressMode: 'workflow' },
  'audit-fieldwork': { section: 'Module 3 — Technical Fieldwork', label: 'Workprograms & Evidence', moduleId: 'M3-PROGRAMS', progressMode: 'workflow' },
  'sampling': { section: 'Module 3 — Technical Fieldwork', label: 'Sampling', moduleId: 'M3-SAMPLES', progressMode: 'workflow' },
  'confirmations': { section: 'Module 3 — Technical Fieldwork', label: 'External Confirmations', moduleId: 'M3-CONF', progressMode: 'workflow' },
  'evidence': { section: 'Module 3 — Technical Fieldwork', label: 'Evidence', moduleId: 'M3-EVIDENCE', progressMode: 'workflow' },
  'findings': { section: 'Module 3 — Technical Fieldwork', label: 'Findings & Differences', moduleId: 'M3-FINDINGS', progressMode: 'workflow' },
  'reviews': { section: 'Module 3 — Technical Fieldwork', label: 'Review / SRM', moduleId: 'M3-REVIEW', progressMode: 'workflow' },
  // Module 4 — Reporting & Archive
  'delivery': { section: 'Module 4 — Reporting & Archive', label: 'Audit Opinion & 5-Part Bundle', moduleId: 'M4-DELIVERY', progressMode: 'workflow' },
  'records': { section: 'Module 4 — Reporting & Archive', label: '60-Day File Completion / Archive', moduleId: 'M4-ARCHIVE', progressMode: 'workflow' },
  // Module 5 — Practice Management
  'my-time': { section: 'Module 5 — Practice Management', label: 'Daily Engagement / FSLI Time', moduleId: 'M5-TIME', progressMode: 'workflow' },
  'reports': { section: 'Module 5 — Practice Management', label: 'Profitability & Utilization', moduleId: 'M5-ANALYTICS', progressMode: 'summary' },
  'practice-ledger': { section: 'Module 5 — Practice Management', label: 'Internal Firm Ledger / TB / P&L / AR Aging', moduleId: 'M5-LEDGER', progressMode: 'summary' },
  // Client PBC Portal
  'portal': { section: 'Client Portal', label: 'PBC Client Portal', moduleId: 'CLIENT-PBC', progressMode: 'workflow' },
  // Reference / Specification
  'requirements': { section: 'Reference / Specification', label: 'Functional Requirements', moduleId: 'REF', progressMode: 'reference' },
  'client-requirements': { section: 'Reference / Specification', label: 'Requirements Presentation', moduleId: 'REF', progressMode: 'reference' },
  'role-guide': { section: 'Reference / Specification', label: 'Role Guide', moduleId: 'REF', progressMode: 'reference' },
  'module-guide': { section: 'Reference / Specification', label: 'Module Guide & Tour', moduleId: 'REF', progressMode: 'reference' }
};

/** Stable uppercase route code shown in the breadcrumb (matches the historical crumb text). */
export const routeCode = (route: RouteKey) => route.toUpperCase().replace('-', ' ');
