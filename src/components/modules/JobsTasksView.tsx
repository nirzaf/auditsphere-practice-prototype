// Module 05: Jobs & Tasks Management (VP-013, VP-014)
// Delivery containers with strictly 1 level of subtasks, leaf-task progress, reassignment governance, and job creation.

import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, JobRecord, JobTaskItem, CommentItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { getEffectiveTimeEntries } from '../../services/calculations';
import { Icon } from '../common/Icons';
import { StatusBadge } from '../common/StatusBadge';
import { Notice, EmptyTableRow } from '../common/Feedback';
import { visibleEngagementIds, isClientRole, canOpenRoute, hasAnyRole, isSuperuserRole } from '../../services/guards';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { consequencePrompt } from '../../services/terminalActions';
import { keyboardActivate } from '../common/keyboardActivate';

interface JobsTasksViewProps {
  onNavigate: (route: RouteKey) => void;
  searchTargetId?: string;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const JobsTasksView: React.FC<JobsTasksViewProps> = ({ onNavigate, searchTargetId, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const allowedEngagementIds = visibleEngagementIds(state);
  const scopedEngagements = state.engagements.filter(e => allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(e.id));
  const scopedClients = state.clients.filter(c => scopedEngagements.some(e => e.client === c.id));
  const scopedJobs = state.jobs.filter(job => allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(job.engagementId));
  const scopedJobIds = new Set(scopedJobs.map(job => job.id));
  const [clientFilter, setClientFilter] = useState('ALL');
  const [engagementFilter, setEngagementFilter] = useState('ALL');
  const [ownerFilter, setOwnerFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>(() => state.jobs.find(job => job.id === searchTargetId || state.jobTasks.some(task => task.id === searchTargetId && task.jobId === job.id))?.id || scopedJobs.find(job => job.engagementId === state.selectedEngagement)?.id || scopedJobs[0]?.id || '');
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState<JobRecord | null>(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [taskToReassign, setTaskToReassign] = useState<JobTaskItem | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<JobTaskItem | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');
  const [editTaskDueDate, setEditTaskDueDate] = useState('');
  const [newAssignee, setNewAssignee] = useState('Adam Khan');
  const [reassignReason, setReassignReason] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New task form state
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [noteSubject, setNoteSubject] = useState<{ type: 'job' | 'task'; id: string; label: string }>({ type: 'job', id: '', label: 'Job' });
  const [noteText, setNoteText] = useState('');
  const [noteMentions, setNoteMentions] = useState<string[]>([]);
  const [taskDocumentChoices, setTaskDocumentChoices] = useState<Record<string, string>>({});
  const [parentTaskIdForSubtask, setParentTaskIdForSubtask] = useState<string | undefined>(undefined);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('Adam Khan');

  // New job form state
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobClientId, setNewJobClientId] = useState(scopedClients.find(client => client.id === scopedEngagements.find(engagement => engagement.id === state.selectedEngagement)?.client)?.id || scopedClients[0]?.id || '');
  const [newJobEngId, setNewJobEngId] = useState(scopedEngagements.find(e => e.id === state.selectedEngagement)?.id || scopedEngagements[0]?.id || '');
  const [newJobOwner, setNewJobOwner] = useState(state.currentPerson || 'Adam Khan');
  const [newJobDueDate, setNewJobDueDate] = useState('2026-10-31');
  const [newJobDescription, setNewJobDescription] = useState('');
  const newJobBaseline = useRef({ newJobTitle, newJobClientId, newJobEngId, newJobOwner, newJobDueDate, newJobDescription });
  const newTaskBaseline = useRef({ taskTitle, taskAssignee, parentTaskIdForSubtask });
  const noteBaseline = useRef({ subjectType: noteSubject.type, subjectId: noteSubject.id, editingCommentId, noteText, noteMentions: noteMentions.join('|') });
  const editJobBaseline = useRef<JobRecord | null>(null);
  const editTaskBaseline = useRef({ id: '', title: '', description: '', dueDate: '' });
  const reassignBaseline = useRef({ taskId: '', assignee: 'Adam Khan', reason: '' });

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const closeAddJobModal = () => {
    setShowAddJobModal(false);
    setNewJobTitle('');
    setNewJobDescription('');
    setNewJobClientId(scopedClients.find(client => client.id === scopedEngagements.find(engagement => engagement.id === state.selectedEngagement)?.client)?.id || scopedClients[0]?.id || '');
    setNewJobEngId(scopedEngagements.find(engagement => engagement.id === state.selectedEngagement)?.id || scopedEngagements[0]?.id || '');
    setNewJobOwner(state.currentPerson || 'Adam Khan');
    setNewJobDueDate('2026-10-31');
  };
  const openAddJobModal = () => { newJobBaseline.current = { newJobTitle, newJobClientId, newJobEngId, newJobOwner, newJobDueDate, newJobDescription }; setShowAddJobModal(true); };
  const discardAddTaskDraft = () => { setShowAddTaskModal(false); setTaskTitle(''); setTaskAssignee('Adam Khan'); setParentTaskIdForSubtask(undefined); };
  const openAddTaskModal = (parentTaskId?: string) => { setTaskTitle(''); setTaskAssignee('Adam Khan'); setParentTaskIdForSubtask(parentTaskId); newTaskBaseline.current = { taskTitle: '', taskAssignee: 'Adam Khan', parentTaskIdForSubtask: parentTaskId }; setShowAddTaskModal(true); };
  const discardNoteDraft = () => { setShowNoteModal(false); setEditingCommentId(null); setNoteText(''); setNoteMentions([]); };
  const openNoteModal = (subject: { type: 'job' | 'task'; id: string; label: string }, comment?: CommentItem) => { setNoteSubject(subject); setEditingCommentId(comment?.id || null); setNoteText(comment?.text || ''); setNoteMentions([]); noteBaseline.current = { subjectType: subject.type, subjectId: subject.id, editingCommentId: comment?.id || null, noteText: comment?.text || '', noteMentions: '' }; setShowNoteModal(true); };
  const discardJobEdit = () => setEditingJob(null);
  const openJobEdit = (job: JobRecord) => { const copy = structuredClone(job); editJobBaseline.current = structuredClone(copy); setEditingJob(copy); };
  const discardTaskEdit = () => { setTaskToEdit(null); setEditTaskTitle(''); setEditTaskDescription(''); setEditTaskDueDate(''); };
  const openTaskEdit = (task: JobTaskItem) => { setTaskToEdit(task); setEditTaskTitle(task.title); setEditTaskDescription(task.description || ''); setEditTaskDueDate(task.dueDate || ''); editTaskBaseline.current = { id: task.id, title: task.title, description: task.description || '', dueDate: task.dueDate || '' }; };
  const discardReassignment = () => { setShowReassignModal(false); setTaskToReassign(null); setReassignReason(''); setNewAssignee('Adam Khan'); };
  const openReassignment = (task: JobTaskItem) => { setTaskToReassign(task); setNewAssignee(task.assignee); setReassignReason(''); reassignBaseline.current = { taskId: task.id, assignee: task.assignee, reason: '' }; setShowReassignModal(true); };

  const filteredJobs = scopedJobs.filter(job =>
    (clientFilter === 'ALL' || job.clientId === clientFilter) &&
    (engagementFilter === 'ALL' || job.engagementId === engagementFilter) &&
    (ownerFilter === 'ALL' || job.owner === ownerFilter) &&
    (statusFilter === 'ALL' || job.status === statusFilter) &&
    (!overdueOnly || job.dueDate < state.asOfDate && !['Completed', 'Cancelled'].includes(job.status))
  );
  const selectedJob = filteredJobs.find(j => j.id === selectedJobId) || filteredJobs[0];
  const client = scopedClients.find(c => c.id === selectedJob?.clientId);

  // Filter tasks for selected job
  const jobTasks = state.jobTasks.filter(t => scopedJobIds.has(t.jobId) && t.jobId === selectedJob?.id);
  const parentTasks = jobTasks.filter(t => !t.parentTaskId).sort((a, b) => a.order - b.order);
  const isModerator = hasAnyRole(state, ['manager', 'partner']);
  const isHidden = (comment: CommentItem) => comment.moderationHistory?.at(-1)?.action === 'Hidden';
  const jobComments = state.comments.filter(comment => comment.subjectType === 'job' && comment.subjectId === selectedJob?.id && comment.visibility === 'internal' && (isModerator || !isHidden(comment)));
  const taskComments = state.comments.filter(comment => comment.subjectType === 'task' && jobTasks.some(task => task.id === comment.subjectId) && comment.visibility === 'internal' && (isModerator || !isHidden(comment)));
  const taskLinkableDocuments = state.documents.filter(document => document.clientId === selectedJob?.clientId && document.engagementId === selectedJob?.engagementId && !document.linkedTaskId);
  const myLocalNotices = (state.localNotices || []).filter(item => {
    if (item.recipientUserId !== state.currentUserId) return false;
    const comment = state.comments.find(record => record.id === item.commentId);
    const job = comment?.subjectType === 'task' ? state.jobs.find(record => record.id === state.jobTasks.find(task => task.id === comment.subjectId)?.jobId) : comment?.subjectType === 'job' ? state.jobs.find(record => record.id === comment.subjectId) : undefined;
    return Boolean(job && scopedJobIds.has(job.id));
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const jobDocuments = state.documents.filter(document => document.linkedJobId === selectedJob?.id);
  const jobCommunications = state.communications.filter(item => item.jobId === selectedJob?.id);
  const jobTimeEntries = state.times.filter(entry => entry.jobId === selectedJob?.id);
  const effectiveJobTimeEntries = getEffectiveTimeEntries(jobTimeEntries);
  const mentionableUsers = state.users.filter(user => { const visible = visibleEngagementIds(state, user.id); return user.status === 'Active' && !isClientRole(user.role) && canOpenRoute(user.role, 'jobs') && selectedJob && (visible === 'ALL' || visible.includes(selectedJob.engagementId)); });
  const assigneesFor = (engagementId: string) => state.users.filter(user => { const visible = visibleEngagementIds(state, user.id); return user.status === 'Active' && !isClientRole(user.role) && canOpenRoute(user.role, 'jobs') && (visible === 'ALL' || visible.includes(engagementId)); });

  const saveAddJobDraft = () => {
    if (!newJobTitle.trim()) return false;
    const newJobId = `JOB-260${prototypeStore.getSnapshot().jobs.length + 1}`;
    const newJob: JobRecord = { id: newJobId, clientId: newJobClientId, engagementId: newJobEngId, title: newJobTitle.trim(), description: newJobDescription.trim(), owner: newJobOwner, startDate: new Date().toISOString().split('T')[0], dueDate: newJobDueDate, status: 'Not started', createdAt: new Date().toISOString() };
    try { prototypeStore.addJob(newJob); prototypeStore.addTask({ id: `TSK-${newJobId}-1`, jobId: newJobId, title: 'Initial Scoping & Team Briefing', assignee: newJobOwner, status: 'Not started', order: 1 }); setSelectedJobId(newJobId); closeAddJobModal(); triggerNotice('success', `Job "${newJob.title}" scheduled (${newJob.id}).`); return true; }
    catch (error) { triggerNotice('error', error instanceof Error ? error.message : 'Could not create job.'); return false; }
  };
  const saveAddTaskDraft = () => {
    if (!taskTitle.trim() || !selectedJob) return false;
    const newTaskId = `TSK-${selectedJob.id}-${Date.now().toString().slice(-4)}`;
    const newTask: JobTaskItem = { id: newTaskId, jobId: selectedJob.id, title: taskTitle.trim(), assignee: taskAssignee, status: 'Not started', order: jobTasks.length + 1, parentTaskId: parentTaskIdForSubtask };
    try { prototypeStore.addTask(newTask); discardAddTaskDraft(); triggerNotice('success', `Task "${newTask.title}" created.`); return true; }
    catch (error) { triggerNotice('error', error instanceof Error ? error.message : 'Could not create task.'); return false; }
  };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    onRegisterUnsavedForm({ label: 'new job draft', isDirty: () => showAddJobModal && (newJobTitle !== newJobBaseline.current.newJobTitle || newJobClientId !== newJobBaseline.current.newJobClientId || newJobEngId !== newJobBaseline.current.newJobEngId || newJobOwner !== newJobBaseline.current.newJobOwner || newJobDueDate !== newJobBaseline.current.newJobDueDate || newJobDescription !== newJobBaseline.current.newJobDescription), save: saveAddJobDraft, discard: closeAddJobModal }, 'jobs-add-job-draft');
    onRegisterUnsavedForm({ label: 'new task draft', isDirty: () => showAddTaskModal && (taskTitle !== newTaskBaseline.current.taskTitle || taskAssignee !== newTaskBaseline.current.taskAssignee || parentTaskIdForSubtask !== newTaskBaseline.current.parentTaskIdForSubtask), save: saveAddTaskDraft, discard: discardAddTaskDraft }, 'jobs-add-task-draft');
    onRegisterUnsavedForm({ label: editingCommentId ? 'internal note edit' : 'internal note draft', isDirty: () => showNoteModal && (noteSubject.type !== noteBaseline.current.subjectType || noteSubject.id !== noteBaseline.current.subjectId || editingCommentId !== noteBaseline.current.editingCommentId || noteText !== noteBaseline.current.noteText || noteMentions.join('|') !== noteBaseline.current.noteMentions), save: saveNoteDraft, discard: discardNoteDraft }, 'jobs-note-draft');
    onRegisterUnsavedForm({ label: 'edit job details', isDirty: () => Boolean(editingJob && editJobBaseline.current && (editingJob.title !== editJobBaseline.current.title || editingJob.description !== editJobBaseline.current.description || editingJob.owner !== editJobBaseline.current.owner || editingJob.dueDate !== editJobBaseline.current.dueDate)), save: saveJobDetailsDraft, discard: discardJobEdit }, 'jobs-edit-job-draft');
    onRegisterUnsavedForm({ label: 'edit task details', isDirty: () => Boolean(taskToEdit && (editTaskTitle !== editTaskBaseline.current.title || editTaskDescription !== editTaskBaseline.current.description || editTaskDueDate !== editTaskBaseline.current.dueDate)), save: saveTaskDetailsDraft, discard: discardTaskEdit }, 'jobs-edit-task-draft');
    onRegisterUnsavedForm({ label: 'task reassignment', isDirty: () => Boolean(showReassignModal && taskToReassign && (taskToReassign.id !== reassignBaseline.current.taskId || newAssignee !== reassignBaseline.current.assignee || reassignReason !== reassignBaseline.current.reason)), save: saveReassignmentDraft, discard: discardReassignment }, 'jobs-reassign-draft');
    return () => { onRegisterUnsavedForm(null, 'jobs-add-job-draft'); onRegisterUnsavedForm(null, 'jobs-add-task-draft'); onRegisterUnsavedForm(null, 'jobs-note-draft'); onRegisterUnsavedForm(null, 'jobs-edit-job-draft'); onRegisterUnsavedForm(null, 'jobs-edit-task-draft'); onRegisterUnsavedForm(null, 'jobs-reassign-draft'); };
  }, [onRegisterUnsavedForm, showAddJobModal, newJobTitle, newJobClientId, newJobEngId, newJobOwner, newJobDueDate, newJobDescription, showAddTaskModal, taskTitle, taskAssignee, parentTaskIdForSubtask, showNoteModal, noteSubject, editingCommentId, noteText, noteMentions, selectedJob?.id, editingJob, taskToEdit, editTaskTitle, editTaskDescription, editTaskDueDate, showReassignModal, taskToReassign, newAssignee, reassignReason]);

  const saveNoteDraft = () => {
    if (!selectedJob || !noteText.trim()) return false;
    if (editingCommentId) {
      try { prototypeStore.editComment(editingCommentId, noteText); discardNoteDraft(); triggerNotice('success', 'Internal note updated.'); return true; }
      catch (error: any) { triggerNotice('error', error.message); return false; }
    }
    const comment: CommentItem = { id: `CMT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, subjectType: noteSubject.type, subjectId: noteSubject.id || selectedJob.id, author: state.currentPerson, authorRole: state.currentRole, createdAt: new Date().toISOString(), text: noteText.trim(), visibility: 'internal', mentions: noteMentions };
    try { prototypeStore.addComment(comment); const mentionCount = noteMentions.length; discardNoteDraft(); triggerNotice('success', `Internal note saved${mentionCount ? `; ${mentionCount} local mention${mentionCount === 1 ? '' : 's'} recorded` : ''}.`); return true; }
    catch (error: any) { triggerNotice('error', error.message); return false; }
  };
  const handleAddInternalNote = (e: React.FormEvent) => { e.preventDefault(); saveNoteDraft(); };

  // Compute leaf task progress
  const leafTasks = jobTasks.filter(t => t.status !== 'Cancelled' && !jobTasks.some(sub => sub.parentTaskId === t.id && sub.status !== 'Cancelled'));
  const completedLeafTasks = leafTasks.filter(t => t.status === 'Completed').length;
  const progressPercent = leafTasks.length ? Math.round((completedLeafTasks / leafTasks.length) * 100) : 0;

  const handleReassignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveReassignmentDraft();
  };
  const saveReassignmentDraft = () => {
    if (!taskToReassign || !reassignReason.trim()) return false;
    try {
      prototypeStore.reassignTask(taskToReassign.id, newAssignee, reassignReason);
      discardReassignment();
      triggerNotice('success', `Task reassigned to ${newAssignee}.`);
      return true;
    } catch (err: any) {
      triggerNotice('error', err.message);
      return false;
    }
  };

  const handleAddTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveAddTaskDraft();
  };

  const handleAddJobSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveAddJobDraft();
  };

  const saveJobDetailsDraft = () => {
    if (!editingJob) return false;
    try {
      prototypeStore.updateJob(editingJob);
      discardJobEdit();
      triggerNotice('success', 'Job details updated.');
      return true;
    } catch (err: any) {
      triggerNotice('error', err.message);
      return false;
    }
  };
  const saveJobDetails = (event: React.FormEvent) => { event.preventDefault(); saveJobDetailsDraft(); };

  const handleUpdateTaskStatus = (task: JobTaskItem, completed: boolean) => {
    handleSetTaskStatus(task, completed ? 'Completed' : 'In progress');
  };

  const handleSetTaskStatus = (task: JobTaskItem, status: JobTaskItem['status']) => {
    let blockedReason = task.blockedReason;
    let statusChangeReason = '';
    if (status === 'Blocked') {
      blockedReason = window.prompt(consequencePrompt('task-blocked', task.title, 'Why is this task blocked?'))?.trim();
      if (!blockedReason) return;
    } else blockedReason = undefined;
    if (status === 'Cancelled') statusChangeReason = window.prompt(consequencePrompt('task-cancelled', task.title, 'Why is this task being cancelled?'))?.trim() || '';
    else if (task.status === 'Cancelled') statusChangeReason = window.prompt(consequencePrompt('task-reopened', task.title, 'Why is this cancelled task being reopened?'))?.trim() || '';
    if ((status === 'Cancelled' || task.status === 'Cancelled') && !statusChangeReason) return;
    try {
      prototypeStore.updateTask({
        ...task,
        status,
        blockedReason,
        statusChangeReason
      });
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const moveTask = (task: JobTaskItem, direction: -1 | 1) => {
    const siblings = jobTasks.filter(item => item.parentTaskId === task.parentTaskId).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex(item => item.id === task.id);
    const other = siblings[index + direction];
    if (!other) return;
    try {
      prototypeStore.updateTask({ ...task, order: other.order });
      prototypeStore.updateTask({ ...other, order: task.order });
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const saveTaskDetailsDraft = () => {
    if (!taskToEdit || !editTaskTitle.trim()) return false;
    try {
      prototypeStore.updateTask({ ...taskToEdit, title: editTaskTitle.trim(), description: editTaskDescription.trim(), dueDate: editTaskDueDate || undefined });
      discardTaskEdit();
      triggerNotice('success', 'Task details updated.');
      return true;
    } catch (err: any) {
      triggerNotice('error', err.message);
      return false;
    }
  };
  const saveTaskDetails = (event: React.FormEvent) => { event.preventDefault(); saveTaskDetailsDraft(); };

  const handleUpdateJobStatus = (job: JobRecord, status: JobRecord['status']) => {
    let blockedReason = job.blockedReason;
    let cancellationReason = job.cancellationReason;
    if (status === 'Blocked') {
      blockedReason = window.prompt(consequencePrompt('job-blocked', job.title, 'Why is this job blocked?'))?.trim();
      if (!blockedReason) return;
    }
    if (status === 'Cancelled') {
      cancellationReason = window.prompt(consequencePrompt('job-cancelled', job.title, 'Why is this job being cancelled?'))?.trim();
      if (!cancellationReason) return;
    }
    try {
      prototypeStore.updateJob({ ...job, status, blockedReason, cancellationReason });
      triggerNotice('success', status === 'Cancelled' ? 'Job cancelled; linked tasks and records were retained.' : `Job status changed to ${status}.`);
    } catch (error) {
      triggerNotice('error', error instanceof Error ? error.message : 'Job status could not be changed.');
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Jobs & Task Delivery Containers</h1>
          <p>Organize engagement deliverables into tracked jobs with exactly one level of subtasks.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => onNavigate('job-templates')}>
            <Icon name="layers" /> Job Templates
          </button>
          {isModerator ? (
            <button className="btn primary sm" onClick={openAddJobModal}>
              <Icon name="plus" /> New Job
            </button>
          ) : (
            <span className="caption">Jobs are registered by managers or partners.</span>
          )}
        </div>
      </div>

      {myLocalNotices.length > 0 && <section className="panel panel-pad" aria-label="My local notices"><div className="between"><div><h3>My Local Notices</h3><p className="caption">Only notices addressed to this identity in jobs it can currently access.</p></div><span className="badge blue">{myLocalNotices.filter(item => !item.readAt).length} unread</span></div><div className="stack mt8">{myLocalNotices.map(item => {const comment = state.comments.find(record => record.id === item.commentId)!;const job = comment.subjectType === 'task' ? state.jobs.find(record => record.id === state.jobTasks.find(task => task.id === comment.subjectId)?.jobId)! : state.jobs.find(record => record.id === comment.subjectId)!;return <div className="borderbox panel-pad" key={item.id}><div className="between"><span><b>{comment.author}</b> mentioned you on {comment.subjectType} · {job.title}{!item.readAt && <span className="tag blue ml8">Unread</span>}</span><div className="row"><button className="btn sm ghost" onClick={() => setSelectedJobId(job.id)}>Open job</button>{!item.readAt && <button className="btn sm" onClick={() => { try { prototypeStore.markLocalNoticeRead(item.id); } catch (err: any) { triggerNotice('error', err.message); } }}>Mark read</button>}</div></div></div>;})}</div></section>}

      {notice && <Notice tone={notice.type} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {scopedJobs.length === 0 ? (
        <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
          <Icon name="checkboard" size="xl" className="text-muted mb16" />
          <h3>No Jobs Registered</h3>
          <p className="sub max-w-md mx-auto mt8">
            Create a custom job or instantiate a standard delivery template to begin tracking engagement deliverables.
          </p>
          <div className="row mt16" style={{ justifyContent: 'center', gap: 10 }}>
            {isModerator && (
              <button className="btn primary sm" onClick={openAddJobModal}>
                <Icon name="plus" /> Create New Job
              </button>
            )}
            <button className="btn ghost sm" onClick={() => onNavigate('job-templates')}>
              Browse Templates
            </button>
          </div>
        </div>
      ) : (
        <div className="master-detail">
          {/* Left: Jobs List */}
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel">
              <div className="panel-head">
                <h3>Practice Jobs Register ({filteredJobs.length} of {scopedJobs.length})</h3>
              </div>
              <div className="filter-grid filter-grid-compact" style={{ paddingTop: 0 }}>
                <label>Client<select aria-label="Jobs client filter" value={clientFilter} onChange={e => setClientFilter(e.target.value)}><option value="ALL">All permitted clients</option>{scopedClients.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label>Engagement<select aria-label="Jobs engagement filter" value={engagementFilter} onChange={e => setEngagementFilter(e.target.value)}><option value="ALL">All permitted engagements</option>{scopedEngagements.filter(item => clientFilter === 'ALL' || item.client === clientFilter).map(item => <option key={item.id} value={item.id}>{item.id} · FY{item.year}</option>)}</select></label>
                <label>Owner<select aria-label="Jobs owner filter" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}><option value="ALL">All owners</option>{[...new Set(scopedJobs.map(job => job.owner))].sort().map(owner => <option key={owner}>{owner}</option>)}</select></label>
                <label>Status<select aria-label="Jobs status filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="ALL">All statuses</option>{['Not started', 'In progress', 'Blocked', 'Completed', 'Cancelled'].map(status => <option key={status}>{status}</option>)}</select></label>
                <label className="row" style={{ alignItems: 'center', gap: 8 }}><input aria-label="Overdue jobs only" type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} /> Overdue only</label>
                <button className="btn sm ghost" onClick={() => { setClientFilter('ALL'); setEngagementFilter('ALL'); setOwnerFilter('ALL'); setStatusFilter('ALL'); setOverdueOnly(false); }}>Clear filters</button>
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Job Title</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map(job => (
                      <tr {...keyboardActivate}
                        key={job.id}
                        className={job.id === selectedJob?.id ? 'selected-row' : ''}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedJobId(job.id)}
                      >
                        <td>
                          <b>{job.title}</b>
                          <div className="cell-sub">{job.id} · {job.owner}</div>
                        </td>
                        <td>
                          <StatusBadge status={job.status} />
                        </td>
                      </tr>
                    ))}
                    {filteredJobs.length === 0 && <EmptyTableRow colSpan={2} variant="filtered" title="No jobs match these filters." />}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Selected Job Workspace */}
          {selectedJob && (
            <div className="stack" style={{ gap: 16 }}>
              <div className="panel panel-pad">
                <div className="between">
                  <div>
                    <span className="eyebrow">JOB WORKSPACE · {selectedJob.id}</span>
                    <h2>{selectedJob.title}</h2>
                    <p className="sub">{client?.name || selectedJob.clientId} · Due: {selectedJob.dueDate} · Owner: {selectedJob.owner}</p>
                    <div className="mt4"><StatusBadge status={selectedJob.status} />{!['Completed', 'Cancelled'].includes(selectedJob.status) && selectedJob.dueDate < state.asOfDate && <> <StatusBadge status="Overdue" kind="blocked" title={`Due ${selectedJob.dueDate}; as of ${state.asOfDate}`} /></>}</div>
                    {isModerator && selectedJob.status !== 'Cancelled' && <button className="btn sm ghost mt8" onClick={() => openJobEdit(selectedJob)}>Edit Job Details</button>}
                    <label className="caption block mt8">Manual job status<select aria-label="Selected job status" value={selectedJob.status} disabled={!isModerator || selectedJob.status === 'Cancelled'} onChange={e => handleUpdateJobStatus(selectedJob, e.target.value as JobRecord['status'])}>{['Not started', 'In progress', 'Blocked', 'Completed', 'Cancelled'].map(status => <option key={status}>{status}</option>)}</select></label>
                    {selectedJob.status === 'Blocked' && <p className="blocked-line mt4">Blocked: {selectedJob.blockedReason}</p>}
                    {selectedJob.status === 'Cancelled' && <p className="caption mt4" role="status">Cancelled by {selectedJob.cancelledByUserId || 'recorded user'} on {selectedJob.cancelledAt || 'date unavailable'} · {selectedJob.cancellationReason || 'No reason recorded'}. Tasks and linked records are retained.</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="caption">Leaf Task Progress</span>
                    <div className="progress mt8" style={{ width: 140 }}>
                      <i style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className="caption">{leafTasks.length ? `${completedLeafTasks} of ${leafTasks.length} leaf tasks (${progressPercent}%)` : 'No active leaf tasks (0%)'}</span>
                  </div>
                </div>

                {/* Task Tree */}
                <div className="between mt20">
                  <h4>Ordered Substantive Tasks</h4>
                  <button
                    className="btn sm primary"
                    disabled={selectedJob.status === 'Cancelled'}
                    onClick={() => {
                      setParentTaskIdForSubtask(undefined);
                      openAddTaskModal();
                    }}
                  >
                    <Icon name="plus" /> Add Main Task
                  </button>
                </div>

                <div className="stack mt12" style={{ gap: 10 }}>
                  {parentTasks.length === 0 ? (
                    <p className="sub">No tasks defined for this job yet.</p>
                  ) : (
                    parentTasks.map(parent => {
                      const subtasks = jobTasks.filter(t => t.parentTaskId === parent.id).sort((a, b) => a.order - b.order);
                      return (
                        <div key={parent.id} data-search-target={searchTargetId === parent.id ? 'true' : undefined} className="borderbox" style={{ padding: 12, outline: searchTargetId === parent.id ? '2px solid #0f766e' : undefined }}>
                          <div className="between">
                            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                aria-label={`Mark task ${parent.title} complete`}
                                checked={parent.status === 'Completed'}
                                disabled={selectedJob.status === 'Cancelled'}
                                onChange={e => handleUpdateTaskStatus(parent, e.target.checked)}
                              />
                              <div>
                                <b style={{ textDecoration: parent.status === 'Completed' ? 'line-through' : 'none' }}>
                                  {parent.title}
                                </b>
                                <div className="cell-sub">Assigned: {parent.assignee} · Status: {parent.status}</div>
                                {parent.statusHistory?.length ? <div className="cell-sub">Status history: {parent.statusHistory.map(event => `${event.from} → ${event.to} by ${event.by}${event.reason ? `: ${event.reason}` : ''}`).join(' · ')}</div> : null}
                                {parent.reassignmentHistory?.length ? <div className="cell-sub">Reassignment history: {parent.reassignmentHistory.map(event => `${event.from} → ${event.to} on ${event.date.slice(0, 10)}${event.reason ? `: ${event.reason}` : ''}`).join(' · ')}</div> : null}
                                {parent.status === 'Blocked' && <div className="blocked-line">Blocked: {parent.blockedReason}</div>}
                                <select className="input sm mt4" aria-label={`Task status ${parent.id}`} value={parent.status} disabled={selectedJob.status === 'Cancelled'} onChange={e => handleSetTaskStatus(parent, e.target.value as JobTaskItem['status'])}>{['Not started', 'In progress', 'Blocked', 'Completed', 'Cancelled'].map(status => <option key={status}>{status}</option>)}</select>
                              </div>
                            </div>
                            <div className="row" style={{ gap: 6 }}>
                              <button className="btn sm ghost" aria-label={`Edit task ${parent.id}`} disabled={selectedJob.status === 'Cancelled'} onClick={() => openTaskEdit(parent)}>Edit</button>
                              <button className="btn sm ghost" aria-label={`Move ${parent.title} up`} disabled={selectedJob.status === 'Cancelled' || parentTasks[0]?.id === parent.id} onClick={() => moveTask(parent, -1)}>↑</button>
                              <button className="btn sm ghost" aria-label={`Move ${parent.title} down`} disabled={selectedJob.status === 'Cancelled' || parentTasks.at(-1)?.id === parent.id} onClick={() => moveTask(parent, 1)}>↓</button>
                              <button
                                className="btn sm ghost"
                                disabled={selectedJob.status === 'Cancelled' || !isModerator}
                                title={!isModerator ? 'Reassignment requires a manager or partner' : undefined}
                                onClick={() => openReassignment(parent)}
                              >
                                Reassign
                              </button>
                              <button
                                className="btn sm ghost"
                                disabled={selectedJob.status === 'Cancelled'}
                                onClick={() => {
                                  setParentTaskIdForSubtask(parent.id);
                                  openAddTaskModal(parent.id);
                                }}
                              >
                                + Subtask
                              </button>
                            </div>
                          </div>

                          {/* Exactly One Level of Subtasks */}
                          {subtasks.length > 0 && (
                            <div className="stack mt12" style={{ gap: 6, paddingLeft: 24, borderLeft: '2px solid var(--border)' }}>
                              {subtasks.map(sub => (
                                <div key={sub.id} className="between" style={{ padding: '6px 0' }}>
                                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                                    <input
                                      type="checkbox"
                                      aria-label={`Mark subtask ${sub.title} complete`}
                                      checked={sub.status === 'Completed'}
                                      disabled={selectedJob.status === 'Cancelled'}
                                      onChange={e => handleUpdateTaskStatus(sub, e.target.checked)}
                                    />
                                    <div>
                                      <span style={{ fontSize: 13, textDecoration: sub.status === 'Completed' ? 'line-through' : 'none' }}>
                                        {sub.title}
                                      </span>
                                      <div className="cell-sub">{sub.assignee}</div>
                                      {sub.status === 'Blocked' && <div className="blocked-line">Blocked: {sub.blockedReason}</div>}
                                      <select className="input sm mt4" aria-label={`Task status ${sub.id}`} value={sub.status} disabled={selectedJob.status === 'Cancelled'} onChange={e => handleSetTaskStatus(sub, e.target.value as JobTaskItem['status'])}>{['Not started', 'In progress', 'Blocked', 'Completed', 'Cancelled'].map(status => <option key={status}>{status}</option>)}</select>
                                    </div>
                                  </div>
                                  <div className="row" style={{ gap: 6 }}>
                                    <button className="btn sm ghost" aria-label={`Edit task ${sub.id}`} disabled={selectedJob.status === 'Cancelled'} onClick={() => openTaskEdit(sub)}>Edit</button>
                                    <button className="btn sm ghost" aria-label={`Move ${sub.title} up`} disabled={selectedJob.status === 'Cancelled' || subtasks[0]?.id === sub.id} onClick={() => moveTask(sub, -1)}>↑</button>
                                    <button className="btn sm ghost" aria-label={`Move ${sub.title} down`} disabled={selectedJob.status === 'Cancelled' || subtasks.at(-1)?.id === sub.id} onClick={() => moveTask(sub, 1)}>↓</button>
                                    <button className="btn sm ghost" disabled={selectedJob.status === 'Cancelled' || !isModerator} title={!isModerator ? 'Reassignment requires a manager or partner' : undefined} onClick={() => openReassignment(sub)}>Reassign</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="divider mt20" />
                <div className="between"><div><h4>Internal Job Notes</h4><p className="caption">Visible to authorized staff only · mentions create local notices only</p></div><button className="btn sm ghost" onClick={() => openNoteModal({type:'job',id:selectedJob.id,label:'Job'})}>Add Internal Note</button></div>
                {jobComments.length === 0 ? <p className="sub mt8">No internal notes on this job.</p> : <div className="stack mt12">{jobComments.map(comment => {const hidden = isHidden(comment);return <div className="borderbox" style={{ padding: 12, opacity: hidden ? 0.75 : 1 }} key={comment.id}><div className="between"><p style={{ whiteSpace: 'pre-wrap' }}>{comment.text}{hidden && <span className="tag amber ml8">Hidden by moderation</span>}</p><div className="row">{(comment.author === state.currentPerson || isSuperuserRole(state.currentRole)) && !hidden && <button className="btn sm ghost" aria-label={`Edit internal note ${comment.id}`} onClick={() => openNoteModal({type:'job',id:comment.subjectId,label:'Job'}, comment)}>Edit</button>}{isModerator && <button className="btn sm ghost" onClick={() => {const reason=window.prompt(`Reason to ${hidden?'restore':'hide'} this internal note?`)||'';if(!reason.trim())return;try{prototypeStore.moderateComment(comment.id,!hidden,reason);triggerNotice('success',`Internal note ${hidden?'restored':'hidden'} with history recorded.`);}catch(err:any){triggerNotice('error',err.message);}}}>{hidden?'Restore':'Moderate'}</button>}</div></div><div className="cell-sub mt8">{comment.author} · {new Date(comment.createdAt).toLocaleString()}{comment.edited ? ` · Edited by ${comment.editedBy} at ${new Date(comment.editedAt!).toLocaleString()}` : ''} · {comment.mentions?.map(id => mentionableUsers.find(user => user.id === id)?.name || id).join(', ')}{comment.moderationHistory?.map(item => ` · ${item.action} by ${item.by}: ${item.reason}`).join('')}</div></div>;})}</div>}
                <section className="panel panel-pad mt20" aria-label="Task notes">
                  <h4>Task Notes</h4>
                  <p className="caption">Internal notes stay attached to the selected task and remain staff-only.</p>
                  <div className="stack mt8">
                    {jobTasks.map(task => (
                      <div className="borderbox panel-pad" key={task.id}>
                        <div className="between"><b>{task.title}</b><button className="btn sm ghost" disabled={selectedJob.status === 'Cancelled'} onClick={() => openNoteModal({ type: 'task', id: task.id, label: `Task: ${task.title}` })}>Add task note</button></div>
                        {taskComments.filter(comment => comment.subjectId === task.id).map(comment => {
                          const hidden = isHidden(comment);
                          return <div className="borderbox panel-pad mt8" key={comment.id} style={{ opacity: hidden ? 0.75 : 1 }}>
                            <div className="between"><p style={{ whiteSpace: 'pre-wrap' }}>{comment.text}{hidden && <span className="tag amber ml8">Hidden by moderation</span>}</p><div className="row">{(comment.author === state.currentPerson || isSuperuserRole(state.currentRole)) && !hidden && <button className="btn sm ghost" onClick={() => openNoteModal({ type: 'task', id: task.id, label: `Task: ${task.title}` }, comment)}>Edit</button>}{isModerator && <button className="btn sm ghost" onClick={() => { const reason = window.prompt(`Reason to ${hidden ? 'restore' : 'hide'} this task note?`) || ''; if (!reason.trim()) return; try { prototypeStore.moderateComment(comment.id, !hidden, reason); triggerNotice('success', `Task note ${hidden ? 'restored' : 'hidden'}.`); } catch (err: any) { triggerNotice('error', err.message); } }}>{hidden ? 'Restore' : 'Moderate'}</button>}</div></div>
                            <div className="cell-sub mt8">{comment.author} · {new Date(comment.createdAt).toLocaleString()}{comment.edited ? ` · Edited by ${comment.editedBy} at ${new Date(comment.editedAt!).toLocaleString()}` : ''} · {comment.moderationHistory?.map(item => `${item.action} by ${item.by}: ${item.reason}`).join(' · ')}</div>
                          </div>;
                        })}
                        <div className="mt8">
                          <b className="caption">Task files</b>
                          {state.documents.filter(document => document.linkedTaskId === task.id).map(document => <div className="between cell-sub mt4" key={document.id}><span>{document.name} · v{document.version}{document.brokenLink ? ' · reference unavailable' : ''}</span><button className="btn sm ghost" onClick={() => { const reason = window.prompt('Reason to unlink this task file?') || ''; if (!reason.trim()) return; try { prototypeStore.unlinkDocumentFromTask(document.id, reason); } catch (err: any) { triggerNotice('error', err.message); } }}>Unlink</button></div>)}
                          <div className="row mt4"><select className="input sm" aria-label={`Task file to link ${task.id}`} value={taskDocumentChoices[task.id] || ''} onChange={e => setTaskDocumentChoices({ ...taskDocumentChoices, [task.id]: e.target.value })}><option value="">Select a registered engagement file</option>{taskLinkableDocuments.map(document => <option key={document.id} value={document.id}>{document.name}</option>)}</select><button className="btn sm ghost" disabled={!taskDocumentChoices[task.id]} onClick={() => { try { prototypeStore.linkDocumentToTask(taskDocumentChoices[task.id], task.id); setTaskDocumentChoices({ ...taskDocumentChoices, [task.id]: '' }); } catch (err: any) { triggerNotice('error', err.message); } }}>Link file</button></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <div className="grid2 mt20">
                  <div className="panel panel-pad"><h4>Job Files ({jobDocuments.length})</h4>{jobDocuments.length ? <div className="stack mt8">{jobDocuments.map(document => <div className="between" key={document.id}><span><b>{document.name}</b><span className="cell-sub">{document.id} · v{document.version}</span></span><span className={document.brokenLink ? 'tag red' : 'tag gray'}>{document.brokenLink ? 'Reference unavailable' : document.classification}</span></div>)}</div> : <p className="sub mt8">No files are linked to this job.</p>}<button className="btn sm mt8" onClick={() => onNavigate('documents')}>Open document library</button></div>
                  <div className="panel panel-pad"><h4>Job Communications ({jobCommunications.length})</h4>{jobCommunications.length ? <div className="stack mt8">{jobCommunications.map(item => <div className="borderbox panel-pad" key={item.id}><b>{item.summary}</b><div className="cell-sub mt4">{item.direction} · {item.channel} · {item.visibility} · {item.author} · {new Date(item.date).toLocaleDateString('en-GB')}</div><p className="sub mt4" style={{whiteSpace:'pre-line'}}>{item.body}</p></div>)}</div> : <p className="sub mt8">No communication records are linked to this job.</p>}<button className="btn sm mt8" onClick={() => onNavigate('communications')}>Open communications register</button></div>
                  <div className="panel panel-pad"><h4>Job Time ({jobTimeEntries.length})</h4><p className="caption">Historical records retained · Current effective entries: {effectiveJobTimeEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0)} min · Approved: {effectiveJobTimeEntries.filter(entry => entry.status === 'Approved').reduce((sum, entry) => sum + entry.durationMinutes, 0)} min · Pending review: {effectiveJobTimeEntries.filter(entry => entry.status === 'Submitted').length}</p>{jobTimeEntries.length ? <div className="tablewrap mt8"><table><thead><tr><th>Date</th><th>Person</th><th>Task</th><th>Minutes</th><th>Status</th></tr></thead><tbody>{jobTimeEntries.map(entry => <tr key={entry.id}><td>{entry.date}</td><td>{entry.person}</td><td>{entry.taskTitle}</td><td>{entry.durationMinutes}</td><td>{entry.status}</td></tr>)}</tbody></table></div> : <p className="sub mt8">No time has been recorded against this job.</p>}<button className="btn sm mt8" onClick={() => onNavigate('my-time')}>Open time tracking</button></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Job Modal */}
      {editingJob && (
        <div className="modal-backdrop" onClick={discardJobEdit}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Edit job details" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h2>Edit Job Details</h2><button type="button" className="icon-btn" aria-label="Close edit job details" onClick={discardJobEdit}>✕</button></div>
            <form onSubmit={saveJobDetails}><div className="modal-body stack" style={{ gap: 12 }}>
              <label className="caption">Job title<input className="input mt4" aria-label="Edited job title" required value={editingJob.title} onChange={e => setEditingJob({ ...editingJob, title: e.target.value })} /></label>
              <label className="caption">Description<textarea className="input mt4" aria-label="Edited job description" value={editingJob.description || ''} onChange={e => setEditingJob({ ...editingJob, description: e.target.value })} /></label>
              <div className="grid2"><label className="caption">Owner<select className="input mt4" aria-label="Edited job owner" value={editingJob.owner} onChange={e => setEditingJob({ ...editingJob, owner: e.target.value })}>{state.users.filter(user => user.status === 'Active').map(user => <option key={user.id} value={user.name}>{user.name}</option>)}</select></label><label className="caption">Due date<input className="input mt4" aria-label="Edited job due date" type="date" required value={editingJob.dueDate} onChange={e => setEditingJob({ ...editingJob, dueDate: e.target.value })} /></label></div>
            </div><div className="modal-foot"><button type="button" className="btn ghost sm" onClick={discardJobEdit}>Cancel</button><button className="btn primary sm" type="submit">Save Job Details</button></div></form>
          </div>
        </div>
      )}

      {/* New Job Modal */}
      {showAddJobModal && (
        <div className="modal-backdrop" onClick={closeAddJobModal}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Schedule New Job</h2>
              <button type="button" className="icon-btn" onClick={closeAddJobModal}>✕</button>
            </div>
            <form onSubmit={handleAddJobSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Job Title</label>
                  <input
                    type="text"
                    className="input"
                    value={newJobTitle}
                    onChange={e => setNewJobTitle(e.target.value)}
                    placeholder="e.g. Interim Inventory Testing & Count Verification"
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Target Client</label>
                    <select
                      className="input"
                      value={newJobClientId}
                      onChange={e => {
                        setNewJobClientId(e.target.value);
                        const firstEng = scopedEngagements.find(en => en.client === e.target.value);
                        if (firstEng) setNewJobEngId(firstEng.id);
                      }}
                    >
                      {scopedClients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="caption">Target Engagement</label>
                    <select
                      className="input"
                      value={newJobEngId}
                      onChange={e => setNewJobEngId(e.target.value)}
                    >
                      {scopedEngagements
                        .filter(en => !newJobClientId || en.client === newJobClientId)
                        .map(en => (
                          <option key={en.id} value={en.id}>{en.id} ({en.service})</option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Due Date</label>
                    <input
                      type="date"
                      className="input"
                      value={newJobDueDate}
                      onChange={e => setNewJobDueDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="caption">Job Owner</label>
                    <select
                      className="input"
                      value={newJobOwner}
                      onChange={e => setNewJobOwner(e.target.value)}
                    >
                      {state.users.map(u => (
                        <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="caption">Description &amp; Deliverable Scope</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={newJobDescription}
                    onChange={e => setNewJobDescription(e.target.value)}
                    placeholder="Define substantive testing scope, required artifacts, and timeline..."
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={closeAddJobModal}>Cancel</button>
                <button type="submit" className="btn primary sm">Create Job</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {taskToEdit && (
        <div className="modal-backdrop" onClick={discardTaskEdit}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={`Edit ${taskToEdit.title}`} style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h2>Edit Task</h2><button type="button" className="icon-btn" aria-label="Close edit task" onClick={discardTaskEdit}>✕</button></div>
            <form onSubmit={saveTaskDetails}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <label className="caption">Task title<input className="input mt4" aria-label="Edited task title" required value={editTaskTitle} onChange={e => setEditTaskTitle(e.target.value)} /></label>
                <label className="caption">Description<textarea className="input mt4" aria-label="Edited task description" value={editTaskDescription} onChange={e => setEditTaskDescription(e.target.value)} /></label>
                <label className="caption">Due date<input className="input mt4" aria-label="Edited task due date" type="date" value={editTaskDueDate} onChange={e => setEditTaskDueDate(e.target.value)} /></label>
              </div>
              <div className="modal-foot"><button type="button" className="btn ghost sm" onClick={discardTaskEdit}>Cancel</button><button type="submit" className="btn primary sm">Save Task</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {showReassignModal && taskToReassign && (
        <div className="modal-backdrop" onClick={discardReassignment}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Reassign Task: {taskToReassign.title}</h2>
              <button type="button" className="icon-btn" aria-label="Close reassignment" onClick={discardReassignment}>✕</button>
            </div>
            <form onSubmit={handleReassignSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Current Assignee</label>
                  <div><b>{taskToReassign.assignee}</b></div>
                </div>
                <div>
                  <label className="caption">New Qualified Assignee</label>
                  <select
                    className="input"
                    value={newAssignee}
                    onChange={e => setNewAssignee(e.target.value)}
                  >
                    {assigneesFor(state.jobs.find(job => job.id === taskToReassign.jobId)?.engagementId || '').map(u => (
                      <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="caption">Reassignment Reason (Mandatory Governance)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Document capacity, scheduling or qualification rationale..."
                    value={reassignReason}
                    onChange={e => setReassignReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardReassignment}>Cancel</button>
                <button type="submit" className="btn primary sm">Confirm Reassignment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="modal-backdrop" onClick={discardAddTaskDraft}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{parentTaskIdForSubtask ? 'Add Subtask (1 Level)' : 'Add Main Task'}</h2>
              <button type="button" className="icon-btn" aria-label="Close new task dialog" onClick={discardAddTaskDraft}>✕</button>
            </div>
            <form onSubmit={handleAddTaskSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Task Description</label>
                  <input
                    type="text"
                    className="input"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    placeholder="e.g. Inspect purchase orders over QAR 25,000"
                    required
                  />
                </div>
                <div>
                  <label className="caption">Assignee</label>
                  <select
                    className="input"
                    value={taskAssignee}
                    onChange={e => setTaskAssignee(e.target.value)}
                  >
                    {assigneesFor(selectedJob?.engagementId || '').map(u => (
                      <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardAddTaskDraft}>Cancel</button>
                <button type="submit" className="btn primary sm">Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNoteModal && selectedJob && <div className="modal-backdrop" onClick={discardNoteDraft}><form className="modal" style={{ maxWidth: 500 }} onSubmit={handleAddInternalNote} onClick={e => e.stopPropagation()}><div className="modal-head"><h2>{editingCommentId ? `Edit Internal ${noteSubject.label} Note` : `Add Internal ${noteSubject.label} Note`}</h2><button type="button" className="icon-btn" aria-label="Close internal note dialog" onClick={discardNoteDraft}>✕</button></div><div className="modal-body stack" style={{ gap: 12 }}><label className="caption">Note (5,000 characters maximum)<textarea className="input" rows={4} maxLength={5000} required value={noteText} onChange={e => setNoteText(e.target.value)} /></label>{!editingCommentId && <><label className="caption">Mention authorized colleagues<select className="input" multiple value={noteMentions} onChange={e => setNoteMentions(Array.from(e.target.selectedOptions, option => option.value))}>{mentionableUsers.filter(user => user.id !== state.currentUserId).map(user => <option key={user.id} value={user.id}>{user.name} · {user.label}</option>)}</select></label><p className="caption">Mentions are local notices only. They do not grant access or send email.</p></>}</div><div className="modal-foot"><button type="button" className="btn ghost sm" onClick={discardNoteDraft}>Cancel</button><button className="btn primary sm" type="submit">{editingCommentId ? 'Save Note Changes' : 'Save Internal Note'}</button></div></form></div>}
    </div>
  );
};
