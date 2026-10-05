import React, { useState } from 'react';
import type { RouteKey } from '../../types';
import { templatesForRoute, templateUrl } from '../../services/projectTemplates';

export function ProjectTemplates({ route, jurisdiction }: { route: RouteKey; jurisdiction?: string }) {
  const [query, setQuery] = useState('');
  const templates = templatesForRoute(route, jurisdiction);
  if (!templates.length) return null;
  const matches = templates.filter(template => `${template.title} ${template.category}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <details className="panel panel-pad mt16" data-testid="project-templates">
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Working templates · {templates.length} available</summary>
      <p className="caption mt12">Download a working copy, update client names, dates and scope, then upload the completed document through this engagement’s evidence workflow. These source forms may contain historical examples; downloading does not approve, issue or share a document.</p>
      <label className="caption">Find a template
        <input className="input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search account or document name" />
      </label>
      <div className="target-stack mt12">
        {matches.map(template => (
          <article className="borderbox" key={template.id}>
            <div className="flex-between" style={{ gap: 12 }}>
              <strong>{template.title}</strong>
              <a className="btn sm" href={templateUrl(template)} download={template.file.split('/').at(-1)} aria-label={`Download ${template.title} (${template.format})`}>Download {template.format}</a>
            </div>
            <p className="caption">{template.category}{template.qfcOnly ? ' · QFC only' : ''}</p>
            <p className="caption">{template.instructions}</p>
          </article>
        ))}
        {!matches.length && <p role="status">No templates match this search.</p>}
      </div>
    </details>
  );
}
