import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, EvidenceItem, AuditProcedureItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { Notice } from '../common/Feedback';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { visibleEngagementIds } from '../../services/guards';

interface EvidenceCatalogueViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const EvidenceCatalogueView: React.FC<EvidenceCatalogueViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const allowedEngagementIds = visibleEngagementIds(state);
  const selectedEngagement = state.engagements.find(engagement => engagement.id === state.selectedEngagement && (allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(engagement.id)));
  const scopedDocuments = selectedEngagement ? state.documents.filter(document => document.clientId === selectedEngagement.client && document.engagementId === selectedEngagement.id) : [];
  const scopedDocumentIds = new Set(scopedDocuments.map(document => document.id));
  const evidenceList = state.evidenceCatalogue.filter(item => scopedDocumentIds.has(item.documentId));
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const linkSelectionBaseline = useRef<Record<string, string>>({});

  useEffect(() => {
    onRegisterUnsavedForm({
      label: 'evidence procedure-link draft',
      isDirty: () => JSON.stringify(linkSelections) !== JSON.stringify(linkSelectionBaseline.current),
      save: () => { throw new Error('Use the row-specific Link action to create the evidence relationship; navigation cannot apply a staged selection.'); },
      discard: () => setLinkSelections({ ...linkSelectionBaseline.current }),
    }, 'evidence-procedure-links');
    return () => onRegisterUnsavedForm(null, 'evidence-procedure-links');
  }, [linkSelections, onRegisterUnsavedForm]);
  const latestDocument = (documentId: string) => {
    let latest = scopedDocuments.find(doc => doc.id === documentId);
    while (latest) {
      const replacement = scopedDocuments.find(doc => doc.supersedesDocumentId === latest!.id);
      if (!replacement) return latest;
      latest = replacement;
    }
    return undefined;
  };
  const pinnedDocument = (documentId: string) => scopedDocuments.find(doc => doc.id === documentId);
  const linkableProcedures = (item: EvidenceItem): AuditProcedureItem[] => {
    const document = scopedDocuments.find(doc => doc.id === item.documentId);
    if (!document || document.version !== item.version || item.adequacyStatus !== 'Adequate') return [];
    if (!selectedEngagement || document.engagementId !== selectedEngagement.id || document.clientId !== selectedEngagement.client) return [];
    return state.auditPrograms.filter(program => program.engagementId === selectedEngagement.id).flatMap(program => program.procedures.filter(procedure =>
      (procedure.engagementId || program.engagementId) === selectedEngagement.id && !item.linkedProcedures.includes(procedure.id)
    ));
  };

  const handleToggleAdequacy = (id: string, current: EvidenceItem['adequacyStatus']) => {
    try {
      if (current === 'Adequate') {
        const rationale = prompt('Record the rationale for flagging this evidence as deficient:');
        if (rationale === null) return;
        prototypeStore.setEvidenceAdequacy(id, 'Deficient', rationale || 'Flagged deficient in review');
        setNotice({ type: 'success', text: 'Evidence marked deficient with attributable rationale.' });
      } else {
        prototypeStore.setEvidenceAdequacy(id, 'Adequate');
        setNotice({ type: 'success', text: 'Evidence status updated to Adequate.' });
      }
      setTimeout(() => setNotice(null), 4000);
    } catch (e) {
      setNotice({ type: 'error', text: (e as Error).message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const handleUnlink = (evidenceId: string, procedureId: string) => {
    const reason = prompt(`Why unlink ${procedureId} from ${evidenceId}?`);
    if (reason === null) return;
    try {
      prototypeStore.unlinkEvidenceProcedure(evidenceId, procedureId, reason);
      setNotice({ type: 'success', text: 'Evidence link removed; prior link retained in history and the procedure requires reassessment.' });
    } catch (e) {
      setNotice({ type: 'error', text: (e as Error).message });
    }
  };

  const handleLink = (evidenceId: string, procedureId: string) => {
    try {
      prototypeStore.linkEvidenceProcedure(evidenceId, procedureId);
      linkSelectionBaseline.current = { ...linkSelectionBaseline.current, [evidenceId]: '' };
      setLinkSelections(current => ({ ...current, [evidenceId]: '' }));
      setNotice({ type: 'success', text: `${evidenceId} linked to ${procedureId}.` });
    } catch (e) {
      setNotice({ type: 'error', text: (e as Error).message });
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Evidence Catalogue</h1>
          <p>Version-pinned document references, cryptographic SHA checksums, and adequacy determinations.</p>
        </div>
        <button className="btn sm ghost" onClick={() => onNavigate('documents')}>
          <Icon name="folder" /> SharePoint Document Library
        </button>
      </div>

      {notice && <Notice tone={notice.type} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="panel panel-pad" style={{ background: '#fffbeb', borderLeft: '4px solid #d97706' }}>
        <b>Prototype note — evidence replacement impact.</b>
        <p className="sub mt4">
          Adequacy changes here are persisted and attributable. Flagging an evidence version as
          deficient remains an explicit review action. Replacing a document preserves the old pin,
          creates a pending-verification evidence reference, and marks linked procedures and
          version-pinned workpapers for reassessment. New evidence and fieldwork still require human
          verification and independent clearance.
        </p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Registered Audit Evidence ({evidenceList.length})</h3>
          <span className="caption">ISA 500 Audit Evidence Pinned References</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Evidence Item</th>
                <th>File Reference</th>
                <th>Source & Provider</th>
                <th>Recorded Digest</th>
                <th>Linked Procedures</th>
                <th>Adequacy Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {evidenceList.map((item: any) => (
                <tr key={item.id}>
                  <td>
                    <b>{item.name || item.title}</b>
                    <div className="cell-sub">{item.id}</div>
                  </td>
                  <td>
                    <span className="mono">{item.documentId}</span>
                    <div className="cell-sub">Pinned v{item.version}{pinnedDocument(item.documentId)?.brokenLink && <span className="tag red" role="status"> Reference unavailable</span>}{(latestDocument(item.documentId)?.version ?? item.version) > item.version && <span className="tag amber"> Newer version available</span>}</div>
                  </td>
                  <td>{item.provider || item.owner}</td>
                  <td><span className="mono" style={{ fontSize: 11 }}>{item.sha ? `${item.sha.slice(0, 16)}…` : 'No file digest recorded'}</span></td>
                  <td>
                    {(item.linkedProcedures || []).map((p: string) => (
                      <span key={p} className="tag gray" style={{ marginRight: 4 }}>{p} <button className="btn sm ghost" aria-label={`Unlink ${p} from ${item.id}`} onClick={() => handleUnlink(item.id, p)}>×</button></span>
                    ))}
                    {(item.linkedProcedureHistory || []).length > 0 && <div className="cell-sub">{item.linkedProcedureHistory.length} link history events</div>}
                    {linkableProcedures(item).length > 0 && <div className="row mt4" style={{ gap: 6 }}>
                      <select className="input sm" aria-label={`Procedure to link ${item.id}`} value={linkSelections[item.id] || ''} onChange={event => setLinkSelections(current => ({ ...current, [item.id]: event.target.value }))}>
                        <option value="">Link to procedure…</option>
                        {linkableProcedures(item).map(procedure => <option key={procedure.id} value={procedure.id}>{procedure.id} · {procedure.title || procedure.text}</option>)}
                      </select>
                      <button className="btn sm ghost" aria-label={`Link ${item.id} to selected procedure`} disabled={!linkSelections[item.id]} onClick={() => handleLink(item.id, linkSelections[item.id])}>Link</button>
                    </div>}
                  </td>
                  <td>
                    <span className={`badge ${pinnedDocument(item.documentId)?.brokenLink ? 'red' : item.adequacyStatus === 'Adequate' ? 'green' : 'amber'}`}>
                      {pinnedDocument(item.documentId)?.brokenLink ? 'Unavailable' : item.adequacyStatus}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn sm ghost"
                      disabled={!!pinnedDocument(item.documentId)?.brokenLink}
                      onClick={() => handleToggleAdequacy(item.id, item.adequacyStatus)}
                    >
                      {item.adequacyStatus === 'Adequate' ? 'Flag Deficient' : 'Mark Adequate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
