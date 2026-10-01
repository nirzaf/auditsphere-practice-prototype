import sources from './projectTemplates.json';
import type { RouteKey } from '../types';

export interface ProjectTemplate {
  id: string;
  file: string;
  title: string;
  format: string;
  category: string;
  routes: string[];
  qfcOnly: boolean;
  instructions: string;
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = sources;

export function templateUrl(template: ProjectTemplate, base = (import.meta as ImportMeta & { env?: Record<string,string> }).env?.BASE_URL || '/'): string {
  // Vite's public-file lookup decodes spaces but retains URI-reserved commas
  // and ampersands. Keep those literal so the original filenames resolve.
  return encodeURI(`${base.replace(/\/?$/, '/')}templates/${template.file}`).replace(/[?#]/g, encodeURIComponent);
}

export function templatesForRoute(route: RouteKey, jurisdiction = ''): readonly ProjectTemplate[] {
  const qfc = /\bQFC\b|Qatar Financial Cent(?:re|er)/i.test(jurisdiction);
  return PROJECT_TEMPLATES.filter(template => template.routes.includes(route) && (!template.qfcOnly || qfc)
    && template.category !== 'QFC resolution'
    && !(template.category === 'Confirmation request' && /Cash Confirmation|Partners|Related Party/i.test(template.title)));
}
