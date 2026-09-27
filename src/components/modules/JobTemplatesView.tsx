// Module 06: Job Template Authoring & Instantiation (VP-015)
// Reusable template authoring, lifecycle gates (Draft -> Published -> Retired), and instantiation.

import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, JobTemplateItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { visibleEngagementIds } from '../../services/guards';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { Icon } from '../common/Icons';
import { Notice } from '../common/Feedback';
import { consequencePrompt } from '../../services/terminalActions';
import { keyboardActivate } from '../common/keyboardActivate';

interface JobTemplatesViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const JobTemplatesView: React.FC<JobTemplatesViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(state.jobTemplates[0]?.id || '');
  const [showInstantiateModal, setShowInstantiateModal] = useState(false);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [revisionSourceId, setRevisionSourceId] = useState<string | null>(null);
  const [templateOperationId, setTemplateOperationId] = useState('');
  const instantiationOpen = useRef(false);
  const templateAuthorOpen = useRef(false);
  const [instantiationContext, setInstantiationContext] = useState<{
    userId: string; role: string; activeEngagementId: string; targetEngagementId: string;
    templateId: string; templateRevision: number;
  } | null>(null);
  const [templateDraftContext, setTemplateDraftContext] = useState<{
    userId: string; role: string; sourceId: string | null; sourceRevision: number | null;
  } | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Instantiation form
  const [targetEngId, setTargetEngId] = useState(state.selectedEngagement);
  const [jobTitle, setJobTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [owner, setOwner] = useState('');

  // New Template form
  const [newTplName, setNewTplName] = useState('');
  const [newTplService, setNewTplService] = useState('External Statutory Audit');
  const [newTplDescription, setNewTplDescription] = useState('');
  const [newTplDefaultJobTitle, setNewTplDefaultJobTitle] = useState('');
  const [newTplTasksText, setNewTplTasksText] = useState('Planning & Risk Assessment\nSubstantive Fieldwork Procedures\nReporting & Final Deliverables');

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const openInstantiation = (template: JobTemplateItem) => {
    const current = prototypeStore.getSnapshot();
    setSelectedTemplateId(template.id);
    setJobTitle(template.defaultJobTitle);
    setTemplateOperationId(crypto.randomUUID());
    setTargetEngId(current.selectedEngagement);
    setInstantiationContext({ userId: current.currentUserId, role: current.currentRole, activeEngagementId: current.selectedEngagement, targetEngagementId: current.selectedEngagement, templateId: template.id, templateRevision: template.revision });
    setStartDate('');
    setDueDate('');
    setOwner('');
    instantiationOpen.current = true;
    setShowInstantiateModal(true);
  };

  const closeInstantiation = () => {
    instantiationOpen.current = false;
    setShowInstantiateModal(false);
    setInstantiationContext(null);
  };

  const openNewTemplate = () => {
    const current = prototypeStore.getSnapshot();
    setRevisionSourceId(null);
    setNewTplName('');
    setNewTplDescription('');
    setNewTplDefaultJobTitle('');
    setNewTplTasksText('Planning & Risk Assessment\nSubstantive Fieldwork Procedures\nReporting & Final Deliverables');
    setTemplateDraftContext({ userId: current.currentUserId, role: current.currentRole, sourceId: null, sourceRevision: null });
    templateAuthorOpen.current = true;
    setShowNewTemplateModal(true);
  };

  const openTemplateRevision = (template: JobTemplateItem) => {
    const current = prototypeStore.getSnapshot();
    setRevisionSourceId(template.id);
    setNewTplName(template.name);
    setNewTplService(template.service);
    setNewTplDescription(template.description);
    setNewTplDefaultJobTitle(template.defaultJobTitle);
    setNewTplTasksText(template.tasks.map(task => task.title).join('\n'));
    setTemplateDraftContext({ userId: current.currentUserId, role: current.currentRole, sourceId: template.id, sourceRevision: template.revision });
    templateAuthorOpen.current = true;
    setShowNewTemplateModal(true);
  };

  const closeTemplateAuthoring = () => {
    templateAuthorOpen.current = false;
    setShowNewTemplateModal(false);
    setTemplateDraftContext(null);
    setRevisionSourceId(null);
  };

  const templates = state.jobTemplates;
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];

  const saveInstantiation = (navigateAfterSave: boolean): boolean => {
    const current = prototypeStore.getSnapshot();
    const context = instantiationContext;
    const template = context && current.jobTemplates.find(item => item.id === context.templateId);
    const engagement = context && current.engagements.find(item => item.id === context.targetEngagementId);
    const visible = visibleEngagementIds(current);
    if (!context || !template || !engagement || current.currentUserId !== context.userId || current.currentRole !== context.role
      || current.selectedEngagement !== context.activeEngagementId || targetEngId !== context.targetEngagementId
      || template.revision !== context.templateRevision || template.status !== 'Published'
      || (visible !== 'ALL' && !visible.includes(context.targetEngagementId))) {
      triggerNotice('error', 'The template or target engagement changed or is no longer permitted. Reopen the job draft and verify its context.');
      return false;
    }
    if (!jobTitle.trim() || !startDate || !dueDate || !owner) {
      triggerNotice('error', 'Complete the job title, start date, delivery date and accountable owner before saving.');
      return false;
    }
    try {
      prototypeStore.applyJobTemplate(
        template.id,
        context.targetEngagementId,
        jobTitle,
        dueDate,
        owner,
        templateOperationId,
        startDate
      );
      closeInstantiation();
      if (navigateAfterSave) onNavigate('jobs');
      return true;
    } catch (err: any) {
      triggerNotice('error', err.message);
      return false;
    }
  };

  const handleInstantiate = (e: React.FormEvent) => {
    e.preventDefault();
    saveInstantiation(true);
  };

  const handlePublishTemplate = (tplId: string) => {
    try {
      prototypeStore.publishJobTemplate(tplId);
      triggerNotice('success', 'Template published successfully. It is now eligible for job instantiation.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleRetireTemplate = (tplId: string) => {
    const reason = window.prompt(consequencePrompt('template-retired', tplId, 'Reason for retiring this template'));
    if (!reason?.trim()) return;
    try {
      prototypeStore.retireJobTemplate(tplId, reason);
      triggerNotice('success', 'Template retired with a recorded reason. Existing jobs remain unaffected, but new instantiation is blocked.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const saveTemplateDraft = (): boolean => {
    const current = prototypeStore.getSnapshot();
    const context = templateDraftContext;
    const revisionSource = context?.sourceId ? current.jobTemplates.find(template => template.id === context.sourceId) : undefined;
    if (!context || current.currentUserId !== context.userId || current.currentRole !== context.role
      || (context.sourceId && (!revisionSource || revisionSource.revision !== context.sourceRevision || revisionSource.status !== 'Published'))
      || (!context.sourceId && revisionSourceId)) {
      triggerNotice('error', 'The template authoring identity or source revision changed. Reopen the draft and verify its context.');
      return false;
    }
    if (!newTplName.trim() || !newTplTasksText.split('\n').some(line => line.trim())) {
      triggerNotice('error', 'Provide a template name and at least one non-empty phase before saving.');
      return false;
    }

    const taskLines = newTplTasksText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const templateFields = {
      name: newTplName.trim(),
      service: newTplService,
      description: newTplDescription.trim() || 'Custom practice workflow template.',
      defaultJobTitle: newTplDefaultJobTitle.trim() || newTplName.trim(),
      tasks: taskLines.map((t, index) => ({
        ...(revisionSource?.tasks[index] || { roleSuggestion: 'Engagement Associate', subtasks: ['Review prior documentation', 'Perform detailed substantive test', 'Assemble working paper evidence'] }),
        title: t
      }))
    };

    try {
      let newTemplate: JobTemplateItem;
      if (revisionSource) newTemplate = prototypeStore.createJobTemplateRevision(revisionSource.id, templateFields);
      else {
        newTemplate = { ...templateFields, id: `TPL-${crypto.randomUUID()}`, status: 'Draft', revision: 1 };
        prototypeStore.addJobTemplate(newTemplate);
      }
      setSelectedTemplateId(newTemplate.id);
      closeTemplateAuthoring();
      setNewTplName('');
      setNewTplDescription('');
      setNewTplDefaultJobTitle('');
      triggerNotice('success', `Draft template "${newTemplate.name}" authored (${newTemplate.id}). Publish it when ready.`);
      return true;
    } catch (err: any) {
      triggerNotice('error', err.message);
      return false;
    }
  };

  const handleCreateTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveTemplateDraft();
  };

  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    if (!showInstantiateModal) {
      onRegisterUnsavedForm(null, 'template-instantiation');
      return;
    }
    const guard: UnsavedFormGuard = { label: 'Job instantiation', isDirty: () => instantiationOpen.current, save: () => saveInstantiation(false), discard: closeInstantiation };
    onRegisterUnsavedForm(guard, 'template-instantiation');
    return () => onRegisterUnsavedForm(null, 'template-instantiation');
  }, [onRegisterUnsavedForm, showInstantiateModal, instantiationContext, targetEngId, jobTitle, startDate, dueDate, owner, templateOperationId]);

  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    if (!showNewTemplateModal) {
      onRegisterUnsavedForm(null, 'template-authoring');
      return;
    }
    const guard: UnsavedFormGuard = { label: 'Job template authoring', isDirty: () => templateAuthorOpen.current, save: saveTemplateDraft, discard: closeTemplateAuthoring };
    onRegisterUnsavedForm(guard, 'template-authoring');
    return () => onRegisterUnsavedForm(null, 'template-authoring');
  }, [onRegisterUnsavedForm, showNewTemplateModal, templateDraftContext, revisionSourceId, newTplName, newTplService, newTplDescription, newTplDefaultJobTitle, newTplTasksText]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Job Delivery Templates</h1>
          <p>Reusable workflow structures with defined phases and substantive subtasks.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary sm" onClick={openNewTemplate}>
            <Icon name="plus" /> Author New Template
          </button>
        </div>
      </div>

      {notice && <Notice tone={notice.type} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="grid-main">
        {/* Template List */}
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Available Job Templates ({templates.length})</h3>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Template Name</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Phases</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px 12px' }}>
                      <b>No job templates yet</b>
                      <p className="sub mt8">Use “Author New Template” to define reusable phases and subtasks. Templates are published before use, instantiated into real jobs, revised as new drafts, and retired with a recorded reason.</p>
                    </td></tr>
                  )}
                  {templates.map(tpl => (
                    <tr {...keyboardActivate}
                      key={tpl.id}
                      className={tpl.id === selectedTemplate?.id ? 'selected-row' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                    >
                      <td>
                        <b>{tpl.name}</b>
                        <div className="cell-sub">{tpl.id} · Rev {tpl.revision}</div>
                      </td>
                      <td>{tpl.service}</td>
                      <td>
                        <span
                          className={`badge ${
                            tpl.status === 'Published'
                              ? 'green'
                              : tpl.status === 'Retired'
                              ? 'red'
                              : 'amber'
                          }`}
                        >
                          {tpl.status}
                        </span>
                      </td>
                      <td>{tpl.tasks.length} phases</td>
                      <td>
                        <button
                          className="btn sm"
                          disabled={tpl.status !== 'Published'}
                          title={tpl.status !== 'Published' ? 'Only Published templates can be instantiated' : 'Instantiate job'}
                          onClick={e => {
                            e.stopPropagation();
                            if (tpl.status !== 'Published') {
                              triggerNotice('error', 'Only Published templates can be instantiated (VP-015).');
                              return;
                            }
                            openInstantiation(tpl);
                          }}
                        >
                          Use Template
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Selected Template Details */}
        {selectedTemplate && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel panel-pad">
              <div className="between">
                <div>
                  <span className="eyebrow">TEMPLATE STRUCTURE · {selectedTemplate.id}</span>
                  <h2>{selectedTemplate.name}</h2>
                  <p className="sub">{selectedTemplate.description}</p>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {selectedTemplate.status === 'Draft' && (
                    <button
                      className="btn sm primary"
                      onClick={() => handlePublishTemplate(selectedTemplate.id)}
                    >
                      Publish Template
                    </button>
                  )}
                  {selectedTemplate.status === 'Published' && (
                    <>
                      <button
                        className="btn primary sm"
                        onClick={() => openInstantiation(selectedTemplate)}
                      >
                        <Icon name="plus" /> Create Job from Template
                      </button>
                      <button className="btn sm ghost" onClick={() => openTemplateRevision(selectedTemplate)}>Create New Revision</button>
                      <button
                        className="btn sm ghost"
                        onClick={() => handleRetireTemplate(selectedTemplate.id)}
                      >
                        Retire Template
                      </button>
                    </>
                  )}
                  {selectedTemplate.status === 'Retired' && (
                    <span className="tag red">Retired — No new jobs</span>
                  )}
                </div>
              </div>

              {selectedTemplate.status !== 'Published' && (
                <div className="borderbox mt12" style={{ background: '#fffbeb', padding: 10, borderColor: '#fde68a' }}>
                  <span className="caption" style={{ color: '#92400e' }}>
                    <strong>Governance notice:</strong> This template is currently in '{selectedTemplate.status}' status. Only published templates can be instantiated to create engagement jobs.
                  </span>
                </div>
              )}

              <h4 className="mt20">Predefined Tasks &amp; Subtasks</h4>
              <div className="stack mt12" style={{ gap: 10 }}>
                {selectedTemplate.tasks.map((task, idx) => (
                  <div key={idx} className="borderbox" style={{ padding: 12 }}>
                    <b>{task.title}</b>
                    <span className="cell-sub" style={{ marginLeft: 8 }}>
                      (Suggested: {task.roleSuggestion})
                    </span>
                    {task.subtasks && task.subtasks.length > 0 && (
                      <ul style={{ margin: '8px 0 0 20px', fontSize: 13, color: '#4a6265' }}>
                        {task.subtasks.map((sub, sIdx) => (
                          <li key={sIdx}>{sub}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instantiate Modal */}
      {showInstantiateModal && selectedTemplate && (
        <div className="modal-backdrop" data-dismiss-guard="explicit">
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Create Job from "{selectedTemplate.name}"</h2>
              <button className="icon-btn" aria-label="Discard job instantiation draft" onClick={closeInstantiation}>✕</button>
            </div>
            <form onSubmit={handleInstantiate}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Target Engagement</label>
                  <select
                    className="input"
                    value={targetEngId}
                    onChange={e => {
                      const value = e.target.value;
                      setTargetEngId(value);
                      setInstantiationContext(current => current ? { ...current, targetEngagementId: value } : current);
                    }}
                  >
                    {state.engagements.filter(eng => {
                      const visible = visibleEngagementIds(state);
                      return visible === 'ALL' || visible.includes(eng.id);
                    }).map(eng => {
                      const c = state.clients.find(x => x.id === eng.client);
                      return (
                        <option key={eng.id} value={eng.id}>
                          {c?.name} · {eng.id} ({eng.service})
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="caption">Job Title</label>
                  <input
                    type="text"
                    className="input"
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Start Date</label>
                    <input
                      type="date"
                      className="input"
                      aria-label="Job start date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="caption">Target Delivery Date</label>
                    <input
                      type="date"
                      className="input"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="caption">Accountable Owner</label>
                    <select
                      className="input"
                      required
                      value={owner}
                      onChange={e => setOwner(e.target.value)}
                    >
                      <option value="">Select an owner</option>
                      {state.users.map(u => (
                        <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={closeInstantiation}>Discard draft</button>
                <button type="submit" className="btn primary sm">Instantiate Job</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Author New Template Modal */}
      {showNewTemplateModal && (
        <div className="modal-backdrop" data-dismiss-guard="explicit">
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{revisionSourceId ? `Revise ${templates.find(template => template.id === revisionSourceId)?.name}` : 'Author New Job Template'}</h2>
              <button className="icon-btn" aria-label="Discard template draft" onClick={closeTemplateAuthoring}>✕</button>
            </div>
            <form onSubmit={handleCreateTemplateSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Template Name</label>
                  <input
                    type="text"
                    className="input"
                    value={newTplName}
                    onChange={e => setNewTplName(e.target.value)}
                    placeholder="e.g. Statutory Audit — Mid-tier Manufacturing"
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Practice Service Line</label>
                    <select
                      className="input"
                      value={newTplService}
                      onChange={e => setNewTplService(e.target.value)}
                    >
                      <option value="External Statutory Audit">External Statutory Audit</option>
                      <option value="Internal Audit Review">Internal Audit Review</option>
                      <option value="Accounting & Financial Statement Compilation">Accounting Compilation</option>
                      <option value="Agreed-Upon Procedures (AUP)">Agreed-Upon Procedures (AUP)</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Default Job Title</label>
                    <input
                      type="text"
                      className="input"
                      value={newTplDefaultJobTitle}
                      onChange={e => setNewTplDefaultJobTitle(e.target.value)}
                      placeholder="e.g. FY2026 Financial Audit"
                    />
                  </div>
                </div>
                <div>
                  <label className="caption">Template Description</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={newTplDescription}
                    onChange={e => setNewTplDescription(e.target.value)}
                    placeholder="Describe the methodology, standard phases, and applicability..."
                  />
                </div>
                <div>
                  <label className="caption">Standard Phases (One per line)</label>
                  <textarea
                    className="input mono"
                    rows={4}
                    value={newTplTasksText}
                    onChange={e => setNewTplTasksText(e.target.value)}
                    placeholder="Phase 1&#10;Phase 2&#10;Phase 3"
                    required
                  />
                  <span className="caption" style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                    New templates are saved in Draft status and must be published prior to job instantiation.
                  </span>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={closeTemplateAuthoring}>Discard draft</button>
                <button type="submit" className="btn primary sm">{revisionSourceId ? 'Save Draft Revision' : 'Create Draft Template'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
