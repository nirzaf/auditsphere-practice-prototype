import React from 'react';
import type { RouteKey } from '../../types';
import { TARGET_GUIDES } from '../../services/currentWorkflowGuides';
const plain = (text: string) => text.replace(/`/g, '');
const routeTokens = (route: string) => route.split(/[^a-z0-9-]+/i).filter(Boolean);
export const ModuleGuideStrip: React.FC<{ route: RouteKey }> = ({ route }) => {
  const guide = TARGET_GUIDES.find(g => routeTokens(g.route).includes(route));
  if (!guide) return null;
  return <details className="module-guide" data-testid="module-guide-strip">
    <summary>Workflow guidance · {guide.name}</summary>
    <ol>{guide.steps.map((step, i) => <li key={i}>{plain(step)}</li>)}</ol>
    <p>{guide.outcome}</p><p className="caption">{guide.limits}</p>
  </details>;
};
