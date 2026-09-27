// Modules 29 & 30: Audit Risk Register & Fieldwork Audit Programs (VP-049, VP-050)
import React, { useEffect, useState } from 'react';
import { RouteKey, AuditProcedureItem, AuditProgramTemplate, AuditRiskItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { eligibleAuditRiskOwners, hasAnyRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { consequencePrompt } from '../../services/terminalActions';

interface AuditRisksProgramsViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const AuditRisksProgramsView: React.FC<AuditRisksProgramsViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'risks' | 'programs' | 'templates'>('programs');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('PRG-01');
  const [notice, setNotice] = useState<string | null>(null);
  const [editingProcedureId, setEditingProcedureId] = useState<string | null>(null);
  const [workPerformed, setWorkPerformed] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [evidenceLimitation, setEvidenceLimitation] = useState('');
  const [riskDraft, setRiskDraft] = useState<AuditRiskItem | null>(null);
  const [templateDraft, setTemplateDraft] = useState<Omit<AuditProgramTemplate, 'id' | 'version' | 'status'> | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const eligibleRiskOwners = selectedEng ? eligibleAuditRiskOwners(state, selectedEng.id) : [];

  // VP-003: the risk, template and fieldwork draft panels are inline edit surfaces.
  // Register them so route/persona/engagement changes cannot silently drop typed work.
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const guard: UnsavedFormGuard = {
      label: 'Audit risks & programs',
      isDirty: () => riskDraft !== null || templateDraft !== null || editingProcedureId !== null,
      save: () => {
        try {
          const snapshot = prototypeStore.getSnapshot();
          const eng = snapshot.engagements.find(item => item.id === snapshot.selectedEngagement) || snapshot.engagements[0];
          if (!eng) return false;
          if (editingProcedureId) {
            prototypeStore.updateAuditProcedureExecution(eng.id, editingProcedureId, workPerformed, conclusion, evidenceLimitation);
            setEditingProcedureId(null);
          }
          if (riskDraft) {
            prototypeStore.updateAuditRisk(eng.id, riskDraft.id, {
              title: riskDraft.title, area: riskDraft.area, assertions: riskDraft.assertions,
              description: riskDraft.description, rationale: riskDraft.rationale,
              response: riskDraft.response, owner: riskDraft.owner, rating: riskDraft.rating,
              linkedProcedureIds: riskDraft.linkedProcedureIds
            });
            setRiskDraft(null);
          }
          if (templateDraft) {
            if (editingTemplateId) prototypeStore.reviseAuditProgramTemplate(editingTemplateId, templateDraft);
            else prototypeStore.createAuditProgramTemplate(templateDraft);
            setTemplateDraft(null);
            setEditingTemplateId(null);
          }
          setNotice('Open drafts were saved before the context changed.');
          return true;
        } catch (error) {
          setNotice(error instanceof Error ? error.message : 'Draft changes could not be saved.');
          return false;
        }
      },
      discard: () => {
        setRiskDraft(null);
        setTemplateDraft(null);
        setEditingTemplateId(null);
        setEditingProcedureId(null);
        setWorkPerformed('');
        setConclusion('');
        setEvidenceLimitation('');
      },
    };
    onRegisterUnsavedForm(guard, 'audit-risks-programs');
    return () => onRegisterUnsavedForm(null, 'audit-risks-programs');
  }, [riskDraft, templateDraft, editingProcedureId, editingTemplateId, workPerformed, conclusion, evidenceLimitation, onRegisterUnsavedForm]);

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="shield" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to define audit risks and tailor substantive audit programs.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const programs = state.auditPrograms.filter(program => program.engagementId === selectedEng.id || (!program.engagementId && selectedEng.id === state.engagements[0]?.id));
  const risks = state.auditRisks.filter(risk => risk.engagementId === selectedEng.id || (!risk.engagementId && selectedEng.id === state.engagements[0]?.id));
  const templates = state.auditProgramTemplates || [];
  const activeProgram = programs.find(program => program.id === selectedProgramId) || programs[0];
  const supportedAuditAreas = [...new Set([...state.auditPrograms.map(program => program.area), ...templates.map(template => template.area)])].sort();
  const coverageGaps = [
    ...risks.filter(risk => !programs.some(program => program.procedures.some(procedure => procedure.linkedRiskIds?.includes(risk.id) && risk.linkedProcedureIds.includes(procedure.id)))).map(risk => `Risk ${risk.id} (${risk.title}) has no reciprocal procedure link.`),
    ...programs.flatMap(program => program.procedures.filter(procedure => risks.length > 0 && !procedure.linkedRiskIds?.some(id => risks.some(risk => risk.id === id && risk.linkedProcedureIds.includes(procedure.id)))).map(procedure => `Procedure ${procedure.id} (${procedure.title || procedure.text}) has no reciprocal risk link.`))
  ];
  const coverageGapPanel = <div className="panel panel-pad" role="status"><b>Unresolved risk coverage gaps ({coverageGaps.length})</b>{coverageGaps.length ? <ul className="sub">{coverageGaps.map(gap => <li key={gap}>{gap}</li>)}</ul> : <p className="sub">Every risk and procedure has a reciprocal link.</p>}</div>;

  const handleUpdateProcedureStatus = (procId: string, status: AuditProcedureItem['status'], procedure?: AuditProcedureItem) => {
    const isReturn = (procedure?.status === 'Submitted' || procedure?.status === 'Cleared') && ['Not started', 'In progress', 'Blocked'].includes(status);
    let reason = '';
    if (isReturn) {
      const entered = window.prompt(consequencePrompt('fieldwork-returned', procId, 'Reason for returning this fieldwork to the preparer'));
      if (!entered?.trim()) return;
      reason = entered;
    }
    try {
      prototypeStore.updateAuditProcedureStatus(selectedEng.id, procId, status, reason);
      setNotice(`Procedure ${procId} saved as ${status}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Procedure status could not be saved.');
    }
  };

  const handleSaveExecution = (procId: string) => {
    try {
      prototypeStore.updateAuditProcedureExecution(selectedEng.id, procId, workPerformed, conclusion, evidenceLimitation);
      setEditingProcedureId(null);
      setNotice(`Fieldwork for ${procId} saved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Fieldwork could not be saved.');
    }
  };

  const handleSaveRisk = () => {
    if (!riskDraft) return;
    try {
      if (riskDraft.id === 'NEW') {
        const createdId = prototypeStore.createAuditRisk(selectedEng.id, {
          title: riskDraft.title, area: riskDraft.area, assertions: riskDraft.assertions,
          description: riskDraft.description, rationale: riskDraft.rationale,
          response: riskDraft.response, owner: riskDraft.owner, rating: riskDraft.rating,
          linkedProcedureIds: riskDraft.linkedProcedureIds
        });
        setRiskDraft(null);
        setNotice(`Risk ${createdId} added to the assessment with its procedure links.`);
        return;
      }
      const current = risks.find(risk => risk.id === riskDraft.id);
      if (!current) throw new Error('Risk is no longer in this engagement.');
      prototypeStore.updateAuditRisk(selectedEng.id, riskDraft.id, {
        title: riskDraft.title, area: riskDraft.area, assertions: riskDraft.assertions,
        description: riskDraft.description, rationale: riskDraft.rationale,
        response: riskDraft.response, owner: riskDraft.owner, rating: riskDraft.rating,
        linkedProcedureIds: riskDraft.linkedProcedureIds
      });
      setRiskDraft(null);
      setNotice(`Risk ${riskDraft.id} and its procedure links were saved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Risk could not be saved.');
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Audit Risks & Substantive Programs</h1>
          <p>ISA 315 identified risks, financial statement assertions, and substantive testing execution.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => onNavigate('sampling')}>
            <Icon name="checkboard" /> Sampling Desk
          </button>
          <button className="btn primary sm" onClick={() => onNavigate('audit')}>
            <Icon name="checkboard" /> Workpaper Workspace
          </button>
        </div>
      </div>

      {notice && <div role="status" className="panel panel-pad">{notice}</div>}

      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'programs' ? 'active' : ''}`} aria-pressed={activeTab === 'programs'} onClick={() => setActiveTab('programs')}>
          Substantive Audit Programs ({programs.length})
        </button>
        <button className={`tab-btn ${activeTab === 'risks' ? 'active' : ''}`} aria-pressed={activeTab === 'risks'} onClick={() => setActiveTab('risks')}>
          Identified Risk Register ({risks.length})
        </button>
        <button className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`} aria-pressed={activeTab === 'templates'} onClick={() => setActiveTab('templates')}>
          Reusable Program Templates ({templates.length})
        </button>
      </div>

      {activeTab === 'templates' && <div className="stack" style={{ gap: 16 }}>
        <div className="panel panel-pad">
          <div className="between"><div><h3>Reusable audit program templates</h3><p className="sub">Published versions are copied into the selected engagement with new procedure identities; later template edits do not alter applied programs.</p></div><button className="btn sm" onClick={() => { setTemplateDraft({ name: '', area: '', description: '', procedures: [{ title: '', objective: '', instructions: '', defaultAssertions: ['Existence'], requiredEvidenceType: '' }] }); setEditingTemplateId(null); }}>New template</button></div>
          {(templates.length === 0) && <p className="sub mt12">No reusable templates yet.</p>}
          <div className="stack mt12" style={{ gap: 10 }}>{templates.map(template => <div className="borderbox panel-pad" key={template.id}>
            <div className="between"><div><b>{template.name} · v{template.version}</b><div className="caption">{template.area} · {template.status} · {template.procedures.length} procedures</div><p className="sub mt4">{template.description}</p></div><div className="row">{template.status === 'Draft' && <button className="btn sm primary" onClick={() => { try { prototypeStore.publishAuditProgramTemplate(template.id); setNotice(`Published ${template.name} v${template.version}.`); } catch (err: any) { setNotice(err.message); } }}>Publish</button>}{template.status === 'Published' && <button className="btn sm" onClick={() => { try { const id = prototypeStore.applyAuditProgramTemplate(selectedEng.id, template.id); setSelectedProgramId(id); setActiveTab('programs'); setNotice(`Applied ${template.name} v${template.version} to ${selectedEng.id}.`); } catch (err: any) { setNotice(err.message); } }}>Apply to engagement</button>}<button className="btn sm ghost" disabled={template.status === 'Retired'} onClick={() => { setTemplateDraft({ name: template.name, area: template.area, description: template.description, procedures: structuredClone(template.procedures) }); setEditingTemplateId(template.id); }}>Revise</button>{template.status !== 'Retired' && <button className="btn sm ghost" aria-label={`Retire ${template.name}`} onClick={() => { if (window.confirm(`Retire ${template.name}? Existing engagement programs will remain unchanged.`)) try { prototypeStore.retireAuditProgramTemplate(template.id); setNotice(`Retired ${template.name} v${template.version}.`); } catch (err: any) { setNotice(err.message); } }}>Retire</button>}</div></div>
            {(state.auditProgramTemplateHistory || []).filter(version => version.id === template.id).map(version => <div className="caption" key={version.version}>Archived v{version.version} · {version.status}</div>)}
          </div>)}</div>
        </div>
        {templateDraft && <form className="panel panel-pad stack" onSubmit={e => { e.preventDefault(); try { if (editingTemplateId) prototypeStore.reviseAuditProgramTemplate(editingTemplateId, templateDraft); else prototypeStore.createAuditProgramTemplate(templateDraft); setTemplateDraft(null); setEditingTemplateId(null); setNotice('Template draft saved. Publish it before applying.'); } catch (err: any) { setNotice(err.message); } }}>
          <h3>{editingTemplateId ? 'Save a new template revision' : 'Create a reusable template draft'}</h3>
          <div className="grid2"><label className="caption">Name<input className="input mt4" aria-label="Template name" required value={templateDraft.name} onChange={e => setTemplateDraft({ ...templateDraft, name: e.target.value })} /></label><label className="caption">Supported audit area<select className="input mt4" aria-label="Template audit area" required value={templateDraft.area} onChange={e => setTemplateDraft({ ...templateDraft, area: e.target.value })}><option value="">Select a supported area</option>{supportedAuditAreas.map(area => <option key={area} value={area}>{area}</option>)}</select></label></div>
          <label className="caption">Purpose<textarea className="input mt4" aria-label="Template purpose" required value={templateDraft.description} onChange={e => setTemplateDraft({ ...templateDraft, description: e.target.value })} /></label>
          {templateDraft.procedures.map((procedure, index) => <fieldset className="borderbox stack" key={index}><legend className="caption">Procedure {index + 1}</legend><input className="input" aria-label={`Template procedure title ${index + 1}`} placeholder="Procedure title" required value={procedure.title} onChange={e => setTemplateDraft({ ...templateDraft, procedures: templateDraft.procedures.map((p, i) => i === index ? { ...p, title: e.target.value } : p) })} /><input className="input" placeholder="Objective" required value={procedure.objective} onChange={e => setTemplateDraft({ ...templateDraft, procedures: templateDraft.procedures.map((p, i) => i === index ? { ...p, objective: e.target.value } : p) })} /><textarea className="input" placeholder="Instructions" required value={procedure.instructions} onChange={e => setTemplateDraft({ ...templateDraft, procedures: templateDraft.procedures.map((p, i) => i === index ? { ...p, instructions: e.target.value } : p) })} /><div className="grid2"><input className="input" placeholder="Assertions, comma separated" required value={procedure.defaultAssertions.join(', ')} onChange={e => setTemplateDraft({ ...templateDraft, procedures: templateDraft.procedures.map((p, i) => i === index ? { ...p, defaultAssertions: e.target.value.split(',').map(x => x.trim()).filter(Boolean) } : p) })} /><input className="input" placeholder="Required evidence type" required value={procedure.requiredEvidenceType} onChange={e => setTemplateDraft({ ...templateDraft, procedures: templateDraft.procedures.map((p, i) => i === index ? { ...p, requiredEvidenceType: e.target.value } : p) })} /></div><button type="button" className="btn sm ghost" disabled={templateDraft.procedures.length === 1} onClick={() => setTemplateDraft({ ...templateDraft, procedures: templateDraft.procedures.filter((_, i) => i !== index) })}>Remove procedure</button></fieldset>)}
          <button type="button" className="btn sm" onClick={() => setTemplateDraft({ ...templateDraft, procedures: [...templateDraft.procedures, { title: '', objective: '', instructions: '', defaultAssertions: ['Existence'], requiredEvidenceType: '' }] })}>Add procedure</button>
          <div className="row"><button className="btn primary sm" type="submit">{editingTemplateId ? 'Save new draft revision' : 'Save template draft'}</button><button className="btn sm ghost" type="button" onClick={() => { setTemplateDraft(null); setEditingTemplateId(null); }}>Cancel</button></div>
        </form>}
      </div>}

      {/* Programs Tab */}
      {activeTab === 'programs' && (
        <div className="stack" style={{ gap: 16 }}>{coverageGapPanel}<div className="grid-main">
          {/* Left: Program List */}
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel">
              <div className="panel-head">
                <h3>Audit Program Areas</h3>
              </div>
              <div className="stack panel-pad" style={{ gap: 8 }}>
                {programs.map(prg => (
                  <button
                    key={prg.id}
                    className={`navitem ${prg.id === activeProgram?.id ? 'active' : ''}`}
                    onClick={() => setSelectedProgramId(prg.id)}
                    style={{ textAlign: 'left', width: '100%' }}
                  >
                    <Icon name="folder" />
                    <span>{prg.title || prg.area}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Procedures Table */}
          <div className="stack" style={{ gap: 16 }}>
            {!activeProgram ? <div className="panel panel-pad">No audit programs are assigned to this engagement.</div> : <div className="panel panel-pad">
              <div className="between">
                <div>
                  <span className="eyebrow">{activeProgram.area.toUpperCase()} · LEAD WP: {activeProgram.leadWorkpaperRef}</span>
                  <h2>{activeProgram.title || activeProgram.area}</h2>
                  <p className="sub">{activeProgram.procedures.length} substantive procedures defined</p>
                </div>
                <button
                  className="btn sm"
                  onClick={() => onNavigate('audit')}
                >
                  Open Lead Workpaper ({activeProgram.leadWorkpaperRef})
                </button>
              </div>

              <div className="tablewrap mt16">
                <table>
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Substantive Procedure Description</th>
                      <th>Work performed</th>
                      <th>Conclusion</th>
                      <th>Assertion</th>
                      <th>Method</th>
                      <th>Fieldwork Status</th>
                      <th>Sign-off</th>
                      <th>Linked risks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProgram.procedures.map(p => (
                      <tr key={p.id}>
                        <td><b>{p.ref || p.stepNumber}</b><div className="cell-sub mono">{p.id}</div></td>
                        <td>
                          <b>{p.title || p.text}</b>
                          {p.instructions && <div className="cell-sub">{p.instructions}</div>}
                          {p.scopeReassessmentRequired && <div className="badge amber mt4">{p.scopeReassessmentReason || 'Planning scope changed'} — reassessment required</div>}
                          {p.evidenceReassessmentRequired && <div className="badge amber mt4">Changed evidence — reassessment required</div>}
                          {p.sampleSize && <div className="cell-sub">Sample size tested: {p.sampleSize} items</div>}
                        </td>
                        <td>
                          {editingProcedureId === p.id ? <div className="stack">
                            <textarea className="input" aria-label={`Work performed for ${p.id}`} value={workPerformed} onChange={e => setWorkPerformed(e.target.value)} placeholder="Describe procedures performed and results" />
                            <input className="input" aria-label={`Evidence limitation for ${p.id}`} value={evidenceLimitation} onChange={e => setEvidenceLimitation(e.target.value)} placeholder="Evidence limitation, if no linked adequate evidence" />
                            <button className="btn sm primary" onClick={() => handleSaveExecution(p.id)}>Save fieldwork</button>
                          </div> : <>
                            {p.workPerformed || 'Not recorded'}{p.hasExceptions && <div className="badge amber mt4">Exception recorded</div>}
                            <button className="btn sm ghost mt4" onClick={() => { setEditingProcedureId(p.id); setWorkPerformed(p.workPerformed || ''); setConclusion(p.conclusion || ''); setEvidenceLimitation(p.evidenceLimitation || ''); }}>Record fieldwork</button>
                          </>}
                        </td>
                        <td>{editingProcedureId === p.id ? <input className="input" aria-label={`Conclusion for ${p.id}`} value={conclusion} onChange={e => setConclusion(e.target.value)} placeholder="Conclusion" /> : p.conclusion || 'Pending'}</td>
                        <td><span className="tag gray">{p.assertion || '—'}</span></td>
                        <td>{p.method || '—'}</td>
                        <td>
                          <select
                            className="input sm"
                            value={p.status}
                            onChange={e => handleUpdateProcedureStatus(p.id, e.target.value as any, p)}
                          >
                            <option value="Not started">Not started</option>
                            <option value="In progress">In progress</option>
                            <option value="Submitted">Submitted</option>
                            <option value="Exceptions noted">Exceptions noted</option>
                            <option value="Cleared">Cleared</option>
                          </select>
                        </td>
                        <td>{p.reviewedByUserId ? `Reviewed by ${state.users.find(user => user.id === p.reviewedByUserId)?.name || p.reviewedByUserId}` : p.preparedByUserId ? `Prepared by ${state.users.find(user => user.id === p.preparedByUserId)?.name || p.preparedByUserId}` : 'No sign-off'}
                          {p.returnReason && <div className="caption text-danger mt4">Returned: {p.returnReason}</div>}
                          {Boolean(p.history?.length) && <details className="mt4"><summary className="caption">Fieldwork change history ({p.history?.length})</summary><ol className="sub mt4">{p.history?.map(entry => <li key={entry.id} className="mb8"><b>Revision {entry.revision}: {entry.action}</b> · {entry.occurredAt.slice(0, 10)} · {state.users.find(user => user.id === entry.actorUserId)?.name || entry.actorUserId}<div className="caption">Program {entry.programId}{entry.sourceTemplateVersion ? ` · template v${entry.sourceTemplateVersion}` : ''} · {entry.status}</div>{entry.reason && <div className="caption text-danger">Reason: {entry.reason}</div>}{entry.previous && <div className="caption">Prior state: {entry.previous.status}{entry.previous.workPerformed ? ` · Work: ${entry.previous.workPerformed}` : ''}{entry.previous.conclusion ? ` · Conclusion: ${entry.previous.conclusion}` : ''}</div>}{entry.workPerformed && <div className="caption">Work: {entry.workPerformed}</div>}{entry.conclusion && <div className="caption">Conclusion: {entry.conclusion}</div>}{entry.evidenceLimitation && <div className="caption">Evidence limitation: {entry.evidenceLimitation}</div>}</li>)}</ol></details>}
                          {Boolean(p.scopeReassessmentHistory?.length) && <details className="mt4"><summary className="caption">Reassessment history ({p.scopeReassessmentHistory?.length})</summary>{p.scopeReassessmentHistory?.map((entry, index) => <div className="caption" key={`${entry.invalidatedAt}-${index}`}>{entry.invalidatedAt.slice(0, 10)} · was {entry.previousStatus} · {entry.reason}</div>)}</details>}
                        </td>
                        <td>{p.linkedRiskIds?.length ? p.linkedRiskIds.map(id => <span className="tag gray" key={id}>{id}</span>) : <span className="badge amber">Unlinked</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>}
          </div>
        </div></div>
      )}

      {/* Risks Tab */}
      {activeTab === 'risks' && (
        <div className="stack">{coverageGapPanel}
          <div className="panel">
            <div className="panel-head between"><h3>ISA 315 Assessed Risks of Material Misstatement · {risks.length}</h3>{hasAnyRole(state, ['manager', 'preparer']) && <button className="btn primary sm" onClick={() => setRiskDraft({ id: 'NEW', engagementId: selectedEng.id, title: '', area: '', assertions: [], description: '', rationale: '', response: '', owner: '', rating: 'Medium', linkedProcedureIds: [], revisions: [] })}><Icon name="plus" size="sm" /> Add assessed risk</button>}</div>
            <div className="tablewrap"><table>
              <thead><tr><th>Risk</th><th>Area / Rating</th><th>Assertions</th><th>Rationale</th><th>Planned response</th><th>Owner</th><th>Linked procedures</th><th>Action</th></tr></thead>
              <tbody>{risks.map(risk => <tr key={risk.id}>
                <td><b>{risk.title}</b><div className="cell-sub mono">{risk.id}</div><div className="cell-sub">{risk.description}</div>{Boolean(risk.revisions?.length) && <details className="mt4"><summary className="caption">Revision history ({risk.revisions?.length})</summary>{risk.revisions?.map((revision, index) => <div className="caption" key={`${revision.changedAt}-${index}`}>Revision {index + 1} prior state · {revision.changedAt} · {revision.changedBy}: {revision.title} · {revision.area || 'area unavailable'} · {revision.assertions?.join(', ') || 'assertions unavailable'} · {revision.rating} · {revision.owner || 'owner unavailable'} · {revision.response}{revision.rationale ? ` · change rationale: ${revision.rationale}` : ''}{revision.reviewImpact ? ` · ${revision.reviewImpact}` : ''}</div>)}</details>}</td>
                <td>{risk.area}<div className={`badge ${risk.rating === 'Significant' ? 'amber' : 'green'}`}>{risk.rating}</div></td>
                <td>{risk.assertions.join(', ')}</td><td>{risk.rationale}</td><td>{risk.response}</td><td>{risk.owner}</td>
                <td>{risk.linkedProcedureIds.map(id => <span className="tag gray" key={id}>{id}</span>)}</td>
                <td><button className="btn sm" disabled={!hasAnyRole(state, ['manager', 'preparer'])} onClick={() => setRiskDraft(structuredClone(risk))}>Edit risk</button></td>
              </tr>)}</tbody>
            </table></div>
          </div>
          {riskDraft && <div className="panel panel-pad stack">
            <h3>{riskDraft.id === 'NEW' ? 'Add assessed risk' : `Edit ${riskDraft.id}`}</h3>
            <div className="grid2">
              <label className="caption">Risk title<input className="input mt4" value={riskDraft.title} onChange={e => setRiskDraft({...riskDraft, title:e.target.value})} /></label>
              <label className="caption">Area<input className="input mt4" value={riskDraft.area} onChange={e => setRiskDraft({...riskDraft, area:e.target.value})} /></label>
              <label className="caption">Description<textarea className="input mt4" value={riskDraft.description} onChange={e => setRiskDraft({...riskDraft, description:e.target.value})} /></label>
              <label className="caption">Rationale<textarea className="input mt4" value={riskDraft.rationale} onChange={e => setRiskDraft({...riskDraft, rationale:e.target.value})} /></label>
              <label className="caption">Planned response<textarea className="input mt4" value={riskDraft.response} onChange={e => setRiskDraft({...riskDraft, response:e.target.value})} /></label>
              <label className="caption">Assertions (comma separated)<input className="input mt4" value={riskDraft.assertions.join(', ')} onChange={e => setRiskDraft({...riskDraft, assertions:e.target.value.split(',').map(value=>value.trim()).filter(Boolean)})} /></label>
              <label className="caption">Owner<select className="input mt4" aria-label="Assessed risk owner" required value={riskDraft.owner} onChange={e => setRiskDraft({...riskDraft, owner:e.target.value})}><option value="">Choose an in-scope professional</option>{eligibleRiskOwners.map(owner => <option key={owner.id} value={owner.name}>{owner.name}</option>)}</select></label>
              <label className="caption">Rating<select className="input mt4" value={riskDraft.rating} onChange={e => setRiskDraft({...riskDraft, rating:e.target.value as AuditRiskItem['rating']})}><option>Low</option><option>Medium</option><option>Significant</option></select></label>
            </div>
            <fieldset className="borderbox"><legend className="caption">Linked procedures</legend><div className="grid2">{programs.flatMap(program=>program.procedures).map(procedure=><label key={procedure.id} className="row" style={{gap:8}}><input type="checkbox" checked={riskDraft.linkedProcedureIds.includes(procedure.id)} onChange={e=>setRiskDraft({...riskDraft,linkedProcedureIds:e.target.checked?[...new Set([...riskDraft.linkedProcedureIds,procedure.id])]:riskDraft.linkedProcedureIds.filter(id=>id!==procedure.id)})} />{procedure.id} · {procedure.title || procedure.text}</label>)}</div></fieldset>
            <div className="row"><button className="btn primary sm" onClick={handleSaveRisk}>Save assessed risk</button><button className="btn sm ghost" onClick={()=>setRiskDraft(null)}>Cancel</button></div>
          </div>}
        </div>
      )}
    </div>
  );
};
