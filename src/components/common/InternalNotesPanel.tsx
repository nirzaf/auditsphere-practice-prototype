import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CommentItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole, isSuperuserRole } from '../../services/guards';
import { canOpenRoute, isClientRole, visibleClientIds, visibleEngagementIds } from '../../services/guards';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

type SubjectType = 'client' | 'engagement';

interface InternalNotesPanelProps {
  subjectType: SubjectType;
  subjectId: string;
  onBeforeContextChange?: (run: () => void) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export function InternalNotesPanel({ subjectType, subjectId, onBeforeContextChange, onRegisterUnsavedForm }: InternalNotesPanelProps) {
  const state = prototypeStore.getSnapshot();
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const draftBaseline = useRef(JSON.stringify({ subjectType, subjectId, editingId: null, text: '', mentions: [] as string[] }));
  const comments = state.comments.filter(comment => comment.subjectType === subjectType && comment.subjectId === subjectId && comment.visibility === 'internal');
  const eligibleUsers = useMemo(() => state.users.filter(user => {
    if (user.status !== 'Active' || isClientRole(user.role) || !canOpenRoute(user.role, 'jobs')) return false;
    if (subjectType === 'client') {
      const visible = visibleClientIds(state, user.id);
      return visible === 'ALL' || visible.includes(subjectId);
    }
    const visible = visibleEngagementIds(state, user.id);
    return visible === 'ALL' || visible.includes(subjectId);
  }), [state, subjectType, subjectId]);
  const localNotices = (state.localNotices || []).filter(item => {
    if (item.recipientUserId !== state.currentUserId) return false;
    const comment = state.comments.find(record => record.id === item.commentId);
    return comment?.subjectType === subjectType && comment.subjectId === subjectId;
  });
  const isModerator = hasAnyRole(state, ['manager', 'partner']);

  const currentDraft = () => JSON.stringify({ subjectType, subjectId, editingId, text, mentions });
  const discardDraft = () => {
    setEditingId(null); setText(''); setMentions([]);
    draftBaseline.current = JSON.stringify({ subjectType, subjectId, editingId: null, text: '', mentions: [] as string[] });
  };
  const commitDraft = (): boolean => {
    const original = JSON.parse(draftBaseline.current) as { subjectType: SubjectType; subjectId: string; editingId: string | null };
    if (!text.trim()) { setNotice('Enter a note before saving.'); return false; }
    try {
      if (original.editingId) prototypeStore.editComment(original.editingId, text);
      else {
        const comment: CommentItem = {
          id: `CMT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          subjectType: original.subjectType, subjectId: original.subjectId, author: state.currentPerson, authorRole: state.currentRole,
          createdAt: new Date().toISOString(), text: text.trim(), visibility: 'internal', mentions
        };
        prototypeStore.addComment(comment);
      }
      const wasEditing = Boolean(original.editingId);
      setText(''); setMentions([]); setEditingId(null); setNotice(wasEditing ? 'Internal note updated.' : 'Internal note saved.');
      draftBaseline.current = JSON.stringify({ subjectType, subjectId, editingId: null, text: '', mentions: [] as string[] });
      return true;
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); return false; }
  };
  const save = (event: React.FormEvent) => { event.preventDefault(); commitDraft(); };

  useEffect(() => {
    // A mounted workspace can change its selected client/engagement. Rebase only an
    // untouched blank composer; a real draft remains pinned to its original subject.
    if (!editingId && !text && mentions.length === 0) {
      draftBaseline.current = JSON.stringify({ subjectType, subjectId, editingId: null, text: '', mentions: [] as string[] });
    }
  }, [subjectType, subjectId]);

  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const key = `internal-note:${subjectType}:${subjectId}`;
    const guard: UnsavedFormGuard = {
      label: editingId ? 'internal note edit' : 'internal note draft',
      isDirty: () => currentDraft() !== draftBaseline.current,
      save: commitDraft,
      discard: discardDraft,
    };
    onRegisterUnsavedForm(guard, key);
    return () => onRegisterUnsavedForm(null, key);
  }, [onRegisterUnsavedForm, subjectType, subjectId, editingId, text, mentions]);

  return <section className="panel panel-pad stack" aria-label="Internal notes" style={{ gap: 12 }}>
    <div><h3>Internal notes</h3><p className="caption">Visible to authorized staff only. Mentions create local notices for the selected people.</p></div>
    {notice && <div role="status" className="caption">{notice}</div>}
    <form className="stack" onSubmit={save}>
      <label className="caption" htmlFor={`internal-note-${subjectId}`}>Add a note<textarea id={`internal-note-${subjectId}`} aria-label="Internal note text" className="input" required maxLength={5000} value={text} onChange={event => setText(event.target.value)} /></label>
      <label className="caption">Mention authorized staff (optional)<select aria-label="Internal note mentions" className="input" multiple value={mentions} onChange={event => setMentions([...event.target.selectedOptions].map(option => option.value))}>{eligibleUsers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
      <div className="row"><button className="btn primary sm" type="submit">{editingId ? 'Save Note Changes' : 'Save Internal Note'}</button>{editingId && <button className="btn ghost sm" type="button" onClick={() => onBeforeContextChange ? onBeforeContextChange(discardDraft) : discardDraft()}>Cancel edit</button>}</div>
    </form>
    {localNotices.length > 0 && <div className="borderbox stack" aria-label="My Local Notices"><b>My Local Notices ({localNotices.filter(item => !item.readAt).length} unread)</b>{localNotices.map(item => <div className="row" key={item.id}><span className="caption">Someone mentioned you on this {subjectType}.</span>{!item.readAt && <button type="button" className="btn sm ghost" onClick={() => prototypeStore.markLocalNoticeRead(item.id)}>Mark read</button>}</div>)}</div>}
    {comments.length ? comments.map(comment => {
      const hidden = comment.moderationHistory?.at(-1)?.action === 'Hidden';
      if (hidden && !isModerator) return null;
      return <article className="borderbox stack" key={comment.id} style={{ gap: 6 }}>
        <div className="between"><b>{comment.author}{comment.edited ? ' · edited' : ''}</b><time className="caption">{new Date(comment.createdAt).toLocaleString()}</time></div>
        <p>{comment.text}</p>
        {hidden && <p className="caption">Hidden by moderator · {comment.moderationHistory?.at(-1)?.reason}</p>}
        {!hidden && (comment.author === state.currentPerson || isSuperuserRole(state.currentRole)) && <button type="button" className="btn sm ghost" aria-label={`Edit internal note ${comment.id}`} onClick={() => { draftBaseline.current = JSON.stringify({ subjectType, subjectId, editingId: comment.id, text: comment.text, mentions: comment.mentions || [] }); setEditingId(comment.id); setText(comment.text); setMentions(comment.mentions || []); }}>Edit note</button>}
      </article>;
    }) : <p className="caption">No internal notes yet.</p>}
  </section>;
}
