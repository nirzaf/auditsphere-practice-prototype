// Module 11: Team & Client Communications & Email Simulator (VP-026, VP-027)
import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, CommunicationItem, EmailTemplateItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

interface CommunicationsViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const CommunicationsView: React.FC<CommunicationsViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [showLogNoteModal, setShowLogNoteModal] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [noteError, setNoteError] = useState('');
  const [templateError, setTemplateError] = useState('');

  // Email form
  const [recipientEmail, setRecipientEmail] = useState('omar.nasser@example-trading.demo');
  const [emailDocumentId, setEmailDocumentId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('TPL-EM-01');
  const [subject, setSubject] = useState('AuditSphere: Document Request for Example Trading Entity');
  const [emailBody, setEmailBody] = useState(
    'Dear Omar,\n\nPlease access your client portal to review the outstanding year-end trial balance request.\n\nThank you,\nSTE Audit Team'
  );
  const [simulationOutcome, setSimulationOutcome] = useState<'Simulated accepted' | 'Simulated failed' | 'Outcome unknown'>('Simulated accepted');
  const emailAttemptRecorded = useRef(false);
  const emailSubmissionId = useRef<string>(crypto.randomUUID());
  const newEmailTemplate = (): EmailTemplateItem => ({ id: `TPL-EM-${crypto.randomUUID()}`, name: '', subject: '', body: '', placeholders: [] });
  const [templateDraft, setTemplateDraft] = useState<EmailTemplateItem>(() => state.emailTemplates[0] || newEmailTemplate());
  const templateBaseline = useRef<EmailTemplateItem>(structuredClone(state.emailTemplates[0] || newEmailTemplate()));

  // Log note form
  const [channel, setChannel] = useState<CommunicationItem['channel']>('Phone');
  const [participants, setParticipants] = useState('Omar Nasser (CFO), Layla Rahman (Manager)');
  const [noteSummary, setNoteSummary] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteDate, setNoteDate] = useState(state.asOfDate);
  const [noteVisibility, setNoteVisibility] = useState<CommunicationItem['visibility']>('Internal');
  const [noteDocumentId, setNoteDocumentId] = useState('');
  const [relatedJobId, setRelatedJobId] = useState('');
  const [editingCommunicationId, setEditingCommunicationId] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');

  const communications = state.communications;
  const selectedEngagement = state.engagements.find(engagement => engagement.id === state.selectedEngagement);
  const client = state.clients.find(item => item.id === selectedEngagement?.client) || state.clients[0];
  const clientJobs = state.jobs.filter(job => job.clientId === client?.id);
  const communicationDocuments = state.documents.filter(item => item.clientId === client?.id && (!item.engagementId || item.engagementId === state.selectedEngagement));
  const relatedJob = clientJobs.find(job => job.id === relatedJobId);

  const saveEmailDraft = (submissionId = emailSubmissionId.current) => {
    // One accepted submission per open compose draft. A deliberate new manual
    // attempt requires closing and reopening the composer.
    if (emailAttemptRecorded.current) return true;
    emailAttemptRecorded.current = true;
    try {
      prototypeStore.addCommunication({ id: `COMM-${crypto.randomUUID()}`, clientId: client?.id || 'CL-001', engagementId: state.selectedEngagement, direction: 'Outbound', channel: 'Email', participants: `${state.currentPerson} -> ${recipientEmail.trim().toLowerCase()}`, recipientEmail: recipientEmail.trim().toLowerCase(), summary: subject, body: emailBody, author: state.currentPerson, date: new Date().toISOString(), visibility: 'Client visible', status: simulationOutcome, simulationReference: `MAIL-SIM-${crypto.randomUUID()}`, simulationEvidence: `Local simulation recorded ${simulationOutcome}; no provider receipt or external delivery confirmation exists.`, simulationSubmissionId: submissionId, ...(emailDocumentId ? { linkedDocumentId: emailDocumentId } : {}) });
      emailBaseline.current = { recipientEmail, emailDocumentId, selectedTemplateId, subject, emailBody, simulationOutcome };
      setEmailError(''); setShowComposeModal(false); return true;
    } catch (error) { emailAttemptRecorded.current = false; setEmailError(error instanceof Error ? error.message : 'Simulated email could not be recorded.'); return false; }
  };
  const saveNoteDraft = () => {
    if (!noteSummary.trim()) return false;
    if (editingCommunicationId && !correctionReason.trim()) { setNoteError('A reason is required to correct this communication.'); return false; }
    try {
      const fields = { channel, participants, summary: noteSummary, body: noteBody, date: `${noteDate}T12:00:00.000Z`, visibility: noteVisibility, linkedDocumentId: noteDocumentId || undefined, jobId: relatedJob?.id };
      if (editingCommunicationId) prototypeStore.correctCommunication(editingCommunicationId, fields, correctionReason);
      else prototypeStore.addCommunication({ id: `COMM-${Date.now().toString().slice(-4)}`, clientId: client?.id || 'CL-001', engagementId: relatedJob?.engagementId || state.selectedEngagement, direction: 'Inbound', ...fields, author: state.currentPerson, status: 'Recorded manually' });
      const clean = { channel: 'Phone' as CommunicationItem['channel'], participants: 'Omar Nasser (CFO), Layla Rahman (Manager)', noteSummary: '', noteBody: '', noteDate: state.asOfDate, noteVisibility: 'Internal' as CommunicationItem['visibility'], noteDocumentId: '', relatedJobId: '', correctionReason: '' };
      noteBaseline.current = clean;
      setNoteError(''); setShowLogNoteModal(false); setEditingCommunicationId(null); setCorrectionReason(''); setChannel(clean.channel); setParticipants(clean.participants); setNoteSummary(''); setNoteBody(''); setNoteDate(state.asOfDate); setNoteVisibility('Internal'); setNoteDocumentId(''); setRelatedJobId(''); return true;
    } catch (error) { setNoteError(error instanceof Error ? error.message : 'Communication note could not be saved.'); return false; }
  };
  const saveTemplateDraft = () => {
    try {
      const saved = prototypeStore.saveEmailTemplate(templateDraft);
      templateBaseline.current = structuredClone(saved);
      setTemplateDraft(saved);
      setTemplateError('');
      setShowTemplateEditor(false);
      return true;
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'Email template could not be saved.');
      return false;
    }
  };
  const discardTemplateDraft = () => {
    setTemplateDraft(structuredClone(templateBaseline.current));
    setTemplateError('');
    setShowTemplateEditor(false);
  };
  const cancelTemplateEditor = () => {
    if (JSON.stringify(templateDraft) !== JSON.stringify(templateBaseline.current) && !window.confirm('Discard the unsaved email template changes?')) return;
    discardTemplateDraft();
  };
  const openTemplateEditor = () => {
    const first = prototypeStore.getSnapshot().emailTemplates[0] || newEmailTemplate();
    templateBaseline.current = structuredClone(first);
    setTemplateDraft(structuredClone(first));
    setTemplateError('');
    setShowTemplateEditor(true);
  };
  const beginNewTemplate = () => {
    const fresh = newEmailTemplate();
    templateBaseline.current = structuredClone(fresh);
    setTemplateDraft(fresh);
    setTemplateError('');
  };
  const selectTemplateForEdit = (id: string) => {
    const selected = prototypeStore.getSnapshot().emailTemplates.find(template => template.id === id);
    if (!selected) return;
    templateBaseline.current = structuredClone(selected);
    setTemplateDraft(structuredClone(selected));
    setTemplateError('');
  };
  const emailBaseline = useRef({ recipientEmail, emailDocumentId, selectedTemplateId, subject, emailBody, simulationOutcome });
  const noteBaseline = useRef({ channel, participants, noteSummary, noteBody, noteDate, noteVisibility, noteDocumentId, relatedJobId, correctionReason });
  const openCompose = () => {
    emailAttemptRecorded.current = false;
    emailSubmissionId.current = crypto.randomUUID();
    setEmailError('');
    setEmailDocumentId('');
    emailBaseline.current = { recipientEmail, emailDocumentId: '', selectedTemplateId, subject, emailBody, simulationOutcome };
    setShowComposeModal(true);
  };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const sameEmail = () => recipientEmail === emailBaseline.current.recipientEmail && emailDocumentId === emailBaseline.current.emailDocumentId && selectedTemplateId === emailBaseline.current.selectedTemplateId && subject === emailBaseline.current.subject && emailBody === emailBaseline.current.emailBody && simulationOutcome === emailBaseline.current.simulationOutcome;
    const sameNote = () => channel === noteBaseline.current.channel && participants === noteBaseline.current.participants && noteSummary === noteBaseline.current.noteSummary && noteBody === noteBaseline.current.noteBody && noteDate === noteBaseline.current.noteDate && noteVisibility === noteBaseline.current.noteVisibility && noteDocumentId === noteBaseline.current.noteDocumentId && relatedJobId === noteBaseline.current.relatedJobId && correctionReason === noteBaseline.current.correctionReason;
    const discardEmail = () => { setShowComposeModal(false); setRecipientEmail(emailBaseline.current.recipientEmail); setEmailDocumentId(emailBaseline.current.emailDocumentId); setSelectedTemplateId(emailBaseline.current.selectedTemplateId); setSubject(emailBaseline.current.subject); setEmailBody(emailBaseline.current.emailBody); setSimulationOutcome(emailBaseline.current.simulationOutcome); };
    const discardNote = () => { setShowLogNoteModal(false); setEditingCommunicationId(null); setChannel(noteBaseline.current.channel); setParticipants(noteBaseline.current.participants); setNoteSummary(noteBaseline.current.noteSummary); setNoteBody(noteBaseline.current.noteBody); setNoteDate(noteBaseline.current.noteDate); setNoteVisibility(noteBaseline.current.noteVisibility); setNoteDocumentId(noteBaseline.current.noteDocumentId); setRelatedJobId(noteBaseline.current.relatedJobId); setCorrectionReason(noteBaseline.current.correctionReason); };
    const sameTemplate = () => JSON.stringify(templateDraft) === JSON.stringify(templateBaseline.current);
    onRegisterUnsavedForm({ label: 'simulated email draft', isDirty: () => showComposeModal && !sameEmail(), save: saveEmailDraft, discard: discardEmail }, 'communications-email-draft');
    onRegisterUnsavedForm({ label: 'communication note draft', isDirty: () => showLogNoteModal && !sameNote(), save: saveNoteDraft, discard: discardNote }, 'communications-note-draft');
    onRegisterUnsavedForm({ label: 'email template draft', isDirty: () => showTemplateEditor && !sameTemplate(), save: saveTemplateDraft, discard: discardTemplateDraft }, 'communications-template-draft');
    return () => { onRegisterUnsavedForm(null, 'communications-email-draft'); onRegisterUnsavedForm(null, 'communications-note-draft'); onRegisterUnsavedForm(null, 'communications-template-draft'); };
  }, [showComposeModal, showLogNoteModal, showTemplateEditor, templateDraft, recipientEmail, emailDocumentId, selectedTemplateId, subject, emailBody, simulationOutcome, channel, participants, noteSummary, noteBody, noteDate, noteVisibility, noteDocumentId, relatedJobId, editingCommunicationId, correctionReason, onRegisterUnsavedForm]);

  const openNewNote = () => {
    const clean = { channel: 'Phone' as CommunicationItem['channel'], participants: 'Omar Nasser (CFO), Layla Rahman (Manager)', noteSummary: '', noteBody: '', noteDate: state.asOfDate, noteVisibility: 'Internal' as CommunicationItem['visibility'], noteDocumentId: '', relatedJobId: '', correctionReason: '' };
    noteBaseline.current = clean; setEditingCommunicationId(null); setCorrectionReason(''); setNoteError(''); setChannel(clean.channel); setParticipants(clean.participants); setNoteSummary(''); setNoteBody(''); setNoteDate(clean.noteDate); setNoteVisibility(clean.noteVisibility); setNoteDocumentId(''); setRelatedJobId(''); setShowLogNoteModal(true);
  };
  const openCorrection = (communication: CommunicationItem) => {
    const clean = { channel: communication.channel, participants: communication.participants, noteSummary: communication.summary, noteBody: communication.body || '', noteDate: communication.date.slice(0, 10), noteVisibility: communication.visibility, noteDocumentId: communication.linkedDocumentId || '', relatedJobId: communication.jobId || '', correctionReason: '' };
    noteBaseline.current = clean; setEditingCommunicationId(communication.id); setCorrectionReason(''); setNoteError(''); setChannel(clean.channel); setParticipants(clean.participants); setNoteSummary(clean.noteSummary); setNoteBody(clean.noteBody); setNoteDate(clean.noteDate); setNoteVisibility(clean.noteVisibility); setNoteDocumentId(clean.noteDocumentId); setRelatedJobId(clean.relatedJobId); setShowLogNoteModal(true);
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    if (form.dataset.attemptRecorded === 'true') return;
    form.dataset.attemptRecorded = 'true';
    if (!saveEmailDraft(form.dataset.submissionId || emailSubmissionId.current)) delete form.dataset.attemptRecorded;
  };

  const handleLogNote = (e: React.FormEvent) => {
    e.preventDefault();
    saveNoteDraft();
  };

  const handleTemplateSelect = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const tpl = state.emailTemplates.find(t => t.id === tplId);
    if (tpl) {
      setSubject(tpl.subject.replace('{client_name}', client?.name || 'Client'));
      setEmailBody(
        tpl.body
          .replace('{client_contact}', client?.contact || 'Management')
          .replace('{client_name}', client?.name || 'Client')
          .replace('{request_title}', 'Bank Statements and Reconciliations')
          .replace('{due_date}', '23 Sep 2026')
      );
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Communications & Email Simulation</h1>
          <p>Microsoft 365 synthetic mail sender, delivery simulation outcomes, and client contact log.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {hasAnyRole(state, ['relationship', 'manager', 'partner']) && <button className="btn sm ghost" onClick={openTemplateEditor}>Manage Email Templates</button>}
          <button className="btn sm ghost" onClick={openNewNote}>
            <Icon name="message" /> Log Call / Meeting Note
          </button>
          <button className="btn primary sm" onClick={openCompose}>
            <Icon name="message" /> Compose Simulated Email
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Communications Register ({communications.length})</h3>
          <span className="caption">Inbound Calls, Meetings & Outbound Notifications</span>
        </div>
        <div className="stack panel-pad" style={{ gap: 12 }}>
          {communications.length === 0 && (
            <div className="text-center" style={{ padding: '24px 0' }}>
              <b>No communications recorded</b>
              <p className="sub mt8">Compose a simulated email (accepted, failed, or unknown local outcomes) or log an inbound call/meeting note. Client-visible notes require a manager or partner confirmation and appear in the matching client portal.</p>
            </div>
          )}
          {communications.map(comm => {
            const canCorrect = comm.direction === 'Inbound' && (comm.author === state.currentPerson || hasAnyRole(state, ['manager', 'partner']));
            return <div key={comm.id} className="borderbox" style={{ padding: 16 }}>
              <div className="between">
                <div className="row" style={{ gap: 10 }}>
                  <Icon name={comm.channel === 'Email' ? 'message' : 'users'} />
                  <div>
                    <b>{comm.summary}</b>
                    <div className="cell-sub">{comm.participants}</div>
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <span className={`tag ${comm.direction === 'Outbound' ? 'blue' : 'gray'}`}>
                    {comm.direction} · {comm.channel}
                  </span>
                  <span className={`badge ${comm.status === 'Simulated accepted' ? 'green' : 'amber'}`}>
                    {comm.status}
                  </span>
                </div>
              </div>
              {comm.body && (
                <div className="sub mt12" style={{ whiteSpace: 'pre-line', fontSize: 13, background: '#f8fafc', padding: 10, borderRadius: 4 }}>
                  {comm.body}
                </div>
              )}
              {comm.simulationReference && <div className="cell-sub mt8">Simulation evidence · {comm.simulationReference} · {comm.simulationEvidence}</div>}
              {comm.jobId && <div className="cell-sub mt8">Linked job · {state.jobs.find(job => job.id === comm.jobId)?.title || comm.jobId}</div>}
              {comm.linkedDocumentId && <div className="cell-sub mt8">Linked document · {state.documents.find(document => document.id === comm.linkedDocumentId)?.name || 'Reference unavailable'}</div>}
              <div className="cell-sub mt8">
                Recorded by {comm.author} · {new Date(comm.date).toLocaleDateString('en-GB')} · Revision {comm.revision || 1}
              </div>
              {comm.correctionHistory?.map(item => <div className="cell-sub mt8" key={`${comm.id}-correction-${item.revision}`}>Correction history · Rev {item.revision} by {item.correctedBy} · {new Date(item.correctedAt).toLocaleDateString('en-GB')} · {item.reason}</div>)}
              {canCorrect && <button type="button" className="btn ghost sm mt8" onClick={() => openCorrection(comm)}>Correct Note</button>}
            </div>
          })}
        </div>
      </div>

      {/* Compose Email Modal */}
      {showComposeModal && (
        <div className="modal-backdrop" onClick={() => setShowComposeModal(false)}>
          <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Compose Simulated Microsoft Email</h2>
              <button className="icon-btn" onClick={() => setShowComposeModal(false)}>✕</button>
            </div>
            <form data-submission-id={emailSubmissionId.current} onSubmit={handleSendEmail}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div className="borderbox" style={{ background: '#f1f5f9', padding: 10, fontSize: 12 }}>
                  Sender: <code>{state.m365Config.mailSenderAccount}</code> (Microsoft 365 Exchange Online)
                </div>
                <div>
                  <label className="caption">Email Template</label>
                  <select
                    className="input"
                    value={selectedTemplateId}
                    onChange={e => handleTemplateSelect(e.target.value)}
                  >
                    {state.emailTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="caption">To Recipient</label>
                  <input
                    type="email"
                    className="input"
                    aria-label="Email recipient"
                    value={recipientEmail}
                    onChange={e => { setRecipientEmail(e.target.value); setEmailError(''); }}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Subject</label>
                  <input
                    type="text"
                    className="input"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Body</label>
                  <textarea
                    className="input"
                    rows={5}
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    required
                  />
                </div>
                <label className="caption">Shared document (optional)
                  <select className="input mt4" aria-label="Email shared document" value={emailDocumentId} onChange={event => setEmailDocumentId(event.target.value)}>
                    <option value="">No document link</option>
                    {communicationDocuments.filter(document => document.visibility === 'Client shared' && !document.brokenLink).map(document => <option key={document.id} value={document.id}>{document.name} · v{document.version}</option>)}
                  </select>
                </label>
                <div>
                  <label className="caption">Simulated Delivery Outcome</label>
                  <select
                    className="input"
                    value={simulationOutcome}
                    onChange={e => setSimulationOutcome(e.target.value as any)}
                  >
                    <option value="Simulated accepted">Simulated accepted (delivery not verified)</option>
                    <option value="Simulated failed">Simulated failed (Mailbox full / bounce)</option>
                    <option value="Outcome unknown">Outcome unknown (Pending queue)</option>
                  </select>
                </div>
                <p className="caption">One submission records one manual simulation attempt. To intentionally record another attempt, close and reopen this form; an unknown outcome is never retried automatically. No message is sent or externally confirmed.</p>
                {emailError && <div className="badge red" role="alert">{emailError}</div>}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowComposeModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Simulate Send</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTemplateEditor && (
        <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) cancelTemplateEditor(); }}>
          <div className="modal" style={{ maxWidth: 620 }} role="dialog" aria-modal="true" aria-labelledby="email-template-editor-title">
            <div className="modal-head">
              <h2 id="email-template-editor-title">Manage Email Templates</h2>
              <button type="button" className="icon-btn" aria-label="Close email template editor" onClick={cancelTemplateEditor}>✕</button>
            </div>
            <form onSubmit={event => { event.preventDefault(); saveTemplateDraft(); }}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <label className="caption">Template to edit
                  <select className="input mt4" aria-label="Template to edit" value={templateDraft.id} onChange={event => selectTemplateForEdit(event.target.value)}>
                    {prototypeStore.getSnapshot().emailTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                    {!prototypeStore.getSnapshot().emailTemplates.some(template => template.id === templateDraft.id) && <option value={templateDraft.id}>New template</option>}
                  </select>
                </label>
                <button type="button" className="btn sm ghost" onClick={beginNewTemplate}>New template</button>
                <label className="caption">Template name<input className="input mt4" aria-label="Email template name" maxLength={100} value={templateDraft.name} onChange={event => setTemplateDraft(current => ({ ...current, name: event.target.value }))} required /></label>
                <label className="caption">Subject<input className="input mt4" aria-label="Email template subject" maxLength={240} value={templateDraft.subject} onChange={event => setTemplateDraft(current => ({ ...current, subject: event.target.value }))} required /></label>
                <label className="caption">Message body<textarea className="input mt4" aria-label="Email template body" rows={7} maxLength={5000} value={templateDraft.body} onChange={event => setTemplateDraft(current => ({ ...current, body: event.target.value }))} required /></label>
                <p className="caption">Supported placeholders: {'{client_name}'}, {'{client_contact}'}, {'{request_title}'}, {'{due_date}'}. Unsupported or unresolved placeholders cannot be saved or sent.</p>
                {templateError && <div className="badge red" role="alert">{templateError}</div>}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={cancelTemplateEditor}>Cancel</button>
                <button type="submit" className="btn primary sm">Save Template</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Call/Meeting Modal */}
      {showLogNoteModal && (
        <div className="modal-backdrop" onClick={() => setShowLogNoteModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{editingCommunicationId ? 'Correct Inbound Communication' : 'Log Inbound Call or Meeting Note'}</h2>
              <button className="icon-btn" aria-label="Close communication note dialog" onClick={() => { setShowLogNoteModal(false); setEditingCommunicationId(null); }}>✕</button>
            </div>
            {noteError && <p role="alert" className="sub">{noteError}</p>}
            <form onSubmit={handleLogNote}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div className="grid2">
                  <div>
                    <label className="caption">Channel</label>
                    <select
                      className="input"
                      value={channel}
                      onChange={e => setChannel(e.target.value as any)}
                    >
                      <option value="Phone">Phone Call</option>
                      <option value="Meeting">In-Person / Teams Meeting</option>
                      <option value="Portal message">Portal Message</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Participants (500 characters maximum)</label>
                    <input
                      type="text"
                      className="input"
                      aria-label="Communication participants"
                      maxLength={500}
                      value={participants}
                      onChange={e => setParticipants(e.target.value)}
                    />
                  </div>
                </div>
                <label className="caption">Related job (optional)<select className="input mt4" value={relatedJobId} onChange={e => setRelatedJobId(e.target.value)}><option value="">No job link</option>{clientJobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
                <label className="caption">Recorded date<input type="date" className="input mt4" aria-label="Communication date" max={state.asOfDate} value={noteDate} onChange={e => setNoteDate(e.target.value)} required /></label>
                <label className="caption">Related document (optional)<select className="input mt4" aria-label="Communication document" value={noteDocumentId} onChange={event => { setNoteDocumentId(event.target.value); setNoteError(''); }}><option value="">No document link</option>{communicationDocuments.filter(document => noteVisibility !== 'Client visible' || document.visibility === 'Client shared' && !document.brokenLink).map(document => <option key={document.id} value={document.id}>{document.name} · {document.visibility}{document.brokenLink ? ' · Unavailable' : ''}</option>)}</select></label>
                {hasAnyRole(state, ['manager', 'partner']) && <label className="caption">Visibility<select className="input mt4" aria-label="Communication visibility" value={noteVisibility} onChange={event => { const next = event.target.value as CommunicationItem['visibility']; const linked = noteDocumentId ? state.documents.find(document => document.id === noteDocumentId) : undefined; if (next === 'Client visible' && linked && (linked.brokenLink || linked.visibility !== 'Client shared')) { setNoteError('An internal or unavailable document cannot be linked to a client-visible communication. Remove the document link or choose a shared document first.'); return; } if (next === 'Client visible' && !window.confirm('This note will be published in the client portal. Confirm it contains only information approved for client viewing.')) return; setNoteError(''); setNoteVisibility(next); }}><option value="Internal">Internal only</option><option value="Client visible">Client visible</option></select></label>}
                {noteVisibility === 'Client visible' && <div className="banner warning" role="note">This communication will appear in the client portal for this client and engagement.</div>}
                {editingCommunicationId && <label className="caption">Correction reason (500 characters maximum)<textarea className="input" aria-label="Communication correction reason" maxLength={500} rows={2} value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} required /></label>}
                <div>
                  <label className="caption">Summary Header (240 characters maximum)</label>
                  <input
                    type="text"
                    className="input"
                    aria-label="Communication summary"
                    maxLength={240}
                    value={noteSummary}
                    onChange={e => setNoteSummary(e.target.value)}
                    placeholder="e.g. Discussed audit clearance timeline"
                    required
                  />
                </div>
                <div>
                  <label className="caption">Discussion Notes (5,000 characters maximum)</label>
                  <textarea
                    className="input"
                    aria-label="Communication discussion notes"
                    rows={4}
                    maxLength={5000}
                    value={noteBody}
                    onChange={e => setNoteBody(e.target.value)}
                    placeholder="Record significant discussion points, commitments and agreements..."
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => { setShowLogNoteModal(false); setEditingCommunicationId(null); }}>Cancel</button>
                <button type="submit" className="btn primary sm">{editingCommunicationId ? 'Save Correction' : 'Save Note'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
