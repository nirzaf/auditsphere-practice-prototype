const modules = [
  ['Commercial & CRM', 'Client records, public inquiries, proposals, engagement acceptance and billing.'],
  ['Governance & Planning', 'Acceptance controls, engagement documents, trial-balance preparation, materiality and staff scheduling.'],
  ['Technical Execution & Fieldwork', 'Financial statements, workprograms, sampling, evidence, confirmations, findings and independent review.'],
  ['Reporting & Deliverables', 'Opinion preparation, report release, client delivery and engagement-file retention.'],
  ['Practice Management', 'Firm time, capacity, utilization, profitability, internal ledger and receivables.']
] as const;

export function BusinessReferenceGuide() {
  return <section className="business-directory-card business-reference-guide" aria-labelledby="business-reference-heading">
    <div className="business-section-heading">
      <div><p className="business-eyebrow">CURRENT BUSINESS SURFACE</p><h2 id="business-reference-heading">Requirements and role guide</h2></div>
    </div>
    <div className="business-reference-grid">
      <article id="route-requirements" tabIndex={-1}>
        <h3>Functional requirements</h3>
        <p>This workspace exposes the current Business modules and their available records. A route may be unavailable until a workspace, client, engagement and authorized request persona are selected.</p>
      </article>
      <article id="route-client-requirements" tabIndex={-1}>
        <h3>Client requirements</h3>
        <p>Clients provide engagement documents through the PBC workspace and respond to requests using their assigned client context. The portal projection is scoped to that client and engagement.</p>
      </article>
      <article id="route-role-guide" tabIndex={-1}>
        <h3>Role guide</h3>
        <p>Available actions follow the selected request persona and staff grade. Persona selection is a local request-context choice, not authentication or identity verification; the Worker remains authoritative for authorization.</p>
        <ul><li>PREPARER records assigned work and evidence.</li><li>REVIEWER performs independent review within the assigned grade.</li><li>APPROVER records Partner decisions and approvals.</li><li>CLIENT sees only the assigned client projection.</li></ul>
      </article>
      <article id="route-module-guide" tabIndex={-1}>
        <h3>Module guide</h3>
        <ul>{modules.map(([name, description]) => <li key={name}><strong>{name}:</strong> {description}</li>)}</ul>
      </article>
    </div>
  </section>;
}
