/** The five current AuditSphere modules, plus the client portal and reference routes. */
export const BUSINESS_MODULES = [
  { id: 'commercial', label: 'Commercial & CRM', defaultRoute: 'overview' },
  { id: 'governance', label: 'Governance & Planning', defaultRoute: 'onboarding' },
  { id: 'fieldwork', label: 'Technical Execution & Fieldwork', defaultRoute: 'trial-balance' },
  { id: 'reporting', label: 'Reporting & Deliverables', defaultRoute: 'delivery' },
  { id: 'practice', label: 'Practice Management', defaultRoute: 'my-time' }
] as const;

export type BusinessModuleId = typeof BUSINESS_MODULES[number]['id'];
export type FieldworkTab = 'statements' | 'workprograms' | 'sampling' | 'evidence' | 'confirmations' | 'findings' | 'reviews';
export interface RouteInfo {
  section: string;
  label: string;
  moduleId: BusinessModuleId | 'client-portal' | 'reference';
  targetId: string;
  fieldworkTab?: FieldworkTab;
}

/** Only routes that lead to a current BUSINESS surface are listed here. */
export const ROUTE_CATALOG = {
  overview: { section: 'Commercial & CRM', label: 'Lifecycle Overview', moduleId: 'commercial', targetId: 'route-overview' },
  clients: { section: 'Commercial & CRM', label: 'Client Profiles', moduleId: 'commercial', targetId: 'route-clients' },
  'client-detail': { section: 'Commercial & CRM', label: 'Client Profile', moduleId: 'commercial', targetId: 'route-client-detail' },
  acquisition: { section: 'Commercial & CRM', label: 'Lead Ingestion', moduleId: 'commercial', targetId: 'route-acquisition' },
  proposals: { section: 'Commercial & CRM', label: 'Quotes & Proposals', moduleId: 'commercial', targetId: 'route-proposals' },
  engagements: { section: 'Commercial & CRM', label: 'Engagement Letter', moduleId: 'commercial', targetId: 'route-engagements' },
  billing: { section: 'Commercial & CRM', label: '50% Advance Invoice & Receipt', moduleId: 'commercial', targetId: 'route-billing' },
  onboarding: { section: 'Governance & Planning', label: 'Acceptance / Continuance', moduleId: 'governance', targetId: 'route-onboarding' },
  documents: { section: 'Governance & Planning', label: 'Engagement Directory / PBC Workspace', moduleId: 'governance', targetId: 'route-documents' },
  'trial-balance': { section: 'Governance & Planning', label: 'Trial Balance Ingestion & Mapping', moduleId: 'governance', targetId: 'route-trial-balance' },
  'audit-planning': { section: 'Governance & Planning', label: 'Materiality & Planning', moduleId: 'governance', targetId: 'route-audit-planning' },
  scheduling: { section: 'Governance & Planning', label: 'Resource Scheduling', moduleId: 'governance', targetId: 'route-scheduling' },
  'financial-statements': { section: 'Technical Execution & Fieldwork', label: 'Split P&L / Balance Sheet Dashboard', moduleId: 'fieldwork', targetId: 'route-financial-statements', fieldworkTab: 'statements' },
  'audit-risks': { section: 'Technical Execution & Fieldwork', label: 'Workprograms & Evidence', moduleId: 'fieldwork', targetId: 'route-audit-risks', fieldworkTab: 'workprograms' },
  'audit-fieldwork': { section: 'Technical Execution & Fieldwork', label: 'Workprograms & Evidence', moduleId: 'fieldwork', targetId: 'route-audit-fieldwork', fieldworkTab: 'workprograms' },
  sampling: { section: 'Technical Execution & Fieldwork', label: 'Sampling', moduleId: 'fieldwork', targetId: 'route-sampling', fieldworkTab: 'sampling' },
  confirmations: { section: 'Technical Execution & Fieldwork', label: 'External Confirmations', moduleId: 'fieldwork', targetId: 'route-confirmations', fieldworkTab: 'confirmations' },
  evidence: { section: 'Technical Execution & Fieldwork', label: 'Evidence', moduleId: 'fieldwork', targetId: 'route-evidence', fieldworkTab: 'evidence' },
  findings: { section: 'Technical Execution & Fieldwork', label: 'Findings & Differences', moduleId: 'fieldwork', targetId: 'route-findings', fieldworkTab: 'findings' },
  reviews: { section: 'Technical Execution & Fieldwork', label: 'Review / SRM', moduleId: 'fieldwork', targetId: 'route-reviews', fieldworkTab: 'reviews' },
  delivery: { section: 'Reporting & Deliverables', label: 'Audit Opinion & 5-Part Bundle', moduleId: 'reporting', targetId: 'route-delivery' },
  records: { section: 'Reporting & Deliverables', label: '60-Day File Completion / Archive', moduleId: 'reporting', targetId: 'route-records' },
  'my-time': { section: 'Practice Management', label: 'Daily Engagement / FSLI Time', moduleId: 'practice', targetId: 'route-my-time' },
  reports: { section: 'Practice Management', label: 'Profitability & Utilization', moduleId: 'practice', targetId: 'route-reports' },
  'practice-ledger': { section: 'Practice Management', label: 'Internal Firm Ledger / TB / P&L / AR Aging', moduleId: 'practice', targetId: 'route-practice-ledger' },
  portal: { section: 'Client Portal', label: 'PBC Client Portal', moduleId: 'client-portal', targetId: 'route-portal' },
  requirements: { section: 'Reference / Specification', label: 'Functional Requirements', moduleId: 'reference', targetId: 'route-requirements' },
  'client-requirements': { section: 'Reference / Specification', label: 'Client Requirements', moduleId: 'reference', targetId: 'route-client-requirements' },
  'role-guide': { section: 'Reference / Specification', label: 'Role Guide', moduleId: 'reference', targetId: 'route-role-guide' },
  'module-guide': { section: 'Reference / Specification', label: 'Module Guide', moduleId: 'reference', targetId: 'route-module-guide' }
} as const satisfies Record<string, RouteInfo>;

export type RouteKey = keyof typeof ROUTE_CATALOG;

export function isRouteKey(value: string): value is RouteKey {
  return Object.hasOwn(ROUTE_CATALOG, value);
}

/** Return only a current route; unknown hashes stay unknown and never revive a retired module. */
export function resolveRouteHash(hash: string): RouteKey | null {
  const value = hash.replace(/^#/, '').trim();
  return isRouteKey(value) ? value : null;
}

export const routeHash = (route: RouteKey): string => `#${route}`;
