// Route catalogue: navigation section + human module name for every route, used by the shell
// breadcrumb and cross-module handoff links.
// STE Audit Management Tool v2.1: CURRENT_ROUTE_CATALOG is the authoritative business surface —
// the five visible modules, the client PBC portal and reference routes. Retired historical routes
// live in LEGACY_ROUTE_INFO as redirect metadata only (see legacyRoutes.ts); they are not current
// product surfaces, carry no module claims, and never appear in current navigation.
import type { CurrentRouteKey, LegacyRouteId, RouteKey } from '../types';

export type RouteProgressMode = 'workflow' | 'summary' | 'reference';
export interface RouteInfo { section: string; label: string; moduleId: string; progressMode: RouteProgressMode }

export const CURRENT_ROUTE_CATALOG: Record<CurrentRouteKey, RouteInfo> = {
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

// Retired historical routes kept only so old bookmarks and persisted hashes redirect to the
// current surface (services/legacyRoutes.ts). The intersection Record keeps the current/legacy
// partition exhaustive at compile time: CurrentRouteKey ∪ LegacyRouteId === RouteKey.
const LEGACY_ROUTE_INFO: Record<LegacyRouteId, RouteInfo> & Record<Exclude<RouteKey, CurrentRouteKey>, RouteInfo> = {
  'jobs': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'job-templates': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'communications': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'budgets': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'receivables': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'accounting-setup': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'gl-transactions': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'account-mappings': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'adjustments': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'reconciliations': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'financial-packages': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'consolidation': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'audit': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'approvals': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'quality': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'administration': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'm365-setup': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' },
  'services': { section: 'Legacy Redirect', label: 'Retired route — redirects to the current workspace', moduleId: 'LEGACY', progressMode: 'workflow' }
};

/**
 * Derived runtime catalogue covering every bookmarkable RouteKey. Current routes keep their
 * product metadata; retired entries are redirect placeholders. Current-facing code should
 * prefer CURRENT_ROUTE_CATALOG.
 */
export const ROUTE_CATALOG: Record<RouteKey, RouteInfo> = { ...CURRENT_ROUTE_CATALOG, ...LEGACY_ROUTE_INFO };

/** Stable uppercase route code shown in the breadcrumb (matches the historical crumb text). */
export const routeCode = (route: RouteKey) => route.toUpperCase().replace('-', ' ');
