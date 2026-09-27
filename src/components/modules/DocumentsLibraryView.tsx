// Module 10 & 18: SharePoint Document Browser & Library (VP-020, VP-021)
import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, DocumentItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { Notice } from '../common/Feedback';
import { sha256OfFile } from '../../services/fileMetadata';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { consequencePrompt } from '../../services/terminalActions';

interface DocumentsLibraryViewProps {
  onNavigate: (route: RouteKey, targetId?: string) => void;
  onNavigateToPbc: (clientId: string, requestId: string) => void;
  searchTargetId?: string;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const DocumentsLibraryView: React.FC<DocumentsLibraryViewProps> = ({ onNavigate, onNavigateToPbc, searchTargetId, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [selectedFolder, setSelectedFolder] = useState<string>(() => state.documents.find(document => document.id === searchTargetId)?.folderPath || '/Engagements/2026/');
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showOneDriveModal, setShowOneDriveModal] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [editingFolderPath, setEditingFolderPath] = useState<string | null>(null);
  const [folderLabelDraft, setFolderLabelDraft] = useState('');

  // New file form
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [classification, setClassification] = useState<DocumentItem['classification']>('Working paper');
  const [folderPath, setFolderPath] = useState('/Engagements/2026/Audit/');
  const uploadBaseline = useRef({ uploadFile, classification, folderPath });

  const documents = state.documents;
  const filteredDocs = selectedFolder === '/'
    ? documents
    : documents.filter(d => d.folderPath.startsWith(selectedFolder));
  const previewEngagement = previewDoc && state.engagements.find(engagement => engagement.id === previewDoc.engagementId && engagement.client === previewDoc.clientId);
  const linkedPbc = previewDoc?.linkedPbcId && previewEngagement?.pbc.find(request => request.id === previewDoc.linkedPbcId);
  const linkedWorkpaper = previewDoc?.linkedWorkpaperId && previewEngagement?.workpapers.find(workpaper => workpaper.id === previewDoc.linkedWorkpaperId);
  const linkedJob = previewDoc?.linkedJobId && state.jobs.find(job => job.id === previewDoc.linkedJobId && job.clientId === previewDoc.clientId && job.engagementId === previewDoc.engagementId);

  const folders = (state.folders && state.folders.length > 0)
    ? state.folders
    : [
        { path: '/Engagements/2026/', label: 'All 2026 Engagements' },
        { path: '/Engagements/2026/Accounting/', label: 'Accounting & Trial Balances' },
        { path: '/Engagements/2026/Audit/', label: 'Audit Substantive Testing' },
        { path: '/Engagements/2026/Deliverables/', label: 'Published Deliverables' },
        { path: '/PBC/', label: 'Client PBC Submissions' }
      ];

  const saveUploadDraft = async (): Promise<boolean> => {
    if (!uploadFile) return false;

    const currentEng = state.engagements.find(e => e.id === state.selectedEngagement);
    if (!currentEng) { setNotice({ tone: 'warning', text: 'Select an engagement before registering a file.' }); return false; }
    const sha = await sha256OfFile(uploadFile);
    const newDoc: DocumentItem = {
      id: `DOC-${crypto.randomUUID()}`,
      clientId: currentEng.client,
      engagementId: currentEng.id,
      name: uploadFile.name,
      folderPath,
      version: 1,
      size: uploadFile.size,
      sha,
      classification,
      visibility: classification === 'Deliverable' ? 'Client shared' : 'Internal',
      source: 'Local In-Session',
      uploadedBy: state.currentPerson,
      uploadedAt: new Date().toISOString()
    };

    try {
      prototypeStore.addDocument(newDoc);
      discardUploadDraft();
      setNotice({ tone: 'success', text: `${uploadFile.name} metadata recorded (SHA-256 ${sha.slice(0, 12)}…). File bytes remain local and are not saved or uploaded.` });
      return true;
    } catch (err) { setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Document metadata could not be recorded.' }); return false; }
  };
  const handleUploadSubmit = async (e: React.FormEvent) => { e.preventDefault(); await saveUploadDraft(); };

  const discardUploadDraft = () => { setShowUploadModal(false); setUploadFile(null); setClassification('Working paper'); setFolderPath('/Engagements/2026/Audit/'); };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    onRegisterUnsavedForm({ label: 'document registration draft', isDirty: () => showUploadModal && (uploadFile !== uploadBaseline.current.uploadFile || classification !== uploadBaseline.current.classification || folderPath !== uploadBaseline.current.folderPath), save: saveUploadDraft, discard: discardUploadDraft }, 'documents-upload-draft');
    return () => onRegisterUnsavedForm(null, 'documents-upload-draft');
  }, [onRegisterUnsavedForm, showUploadModal, uploadFile, classification, folderPath]);
  const openUploadModal = () => { uploadBaseline.current = { uploadFile, classification, folderPath }; setShowUploadModal(true); };

  const handleImportFromOneDrive = (name: string) => {
    const currentEng = state.engagements.find(e => e.id === state.selectedEngagement);
    const result = state.m365Config.verificationResults?.onedrive;
    if (!currentEng || !state.m365Config.oneDriveEnabled || result?.outcome !== 'success' || result.configRevision !== state.m365Config.configRevision) {
      setNotice({ tone: 'warning', text: 'OneDrive import simulation requires an enabled option and a current success result for this configuration.' });
      return;
    }
    const newDoc: DocumentItem = {
      id: `DOC-${crypto.randomUUID()}`,
      clientId: currentEng.client,
      engagementId: currentEng.id,
      name,
      folderPath: '/Engagements/2026/Audit/',
      version: 1,
      size: 65000,
      classification: 'Client provided',
      visibility: 'Internal',
      source: 'OneDrive Import',
      uploadedBy: state.currentPerson,
      uploadedAt: new Date().toISOString()
    };

    prototypeStore.addDocument(newDoc);
    setShowOneDriveModal(false);
  };

  const handleReplacementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Captured before the await: the recorded file must not linger in the form as an unsaved draft.
    const form = e.currentTarget as HTMLFormElement;
    if (!previewDoc || !replacementFile) return;
    try {
      const sha = await sha256OfFile(replacementFile);
      const revision = prototypeStore.replaceDocumentRevision(previewDoc.id, { name: replacementFile.name, size: replacementFile.size, sha256: sha });
      setNotice({ tone: 'success', text: `Replacement v${revision.version} recorded. ${previewDoc.name} v${previewDoc.version} remains pinned for existing evidence; file bytes are not uploaded.` });
      setReplacementFile(null);
      form.reset();
    } catch (err) { setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Document replacement could not be recorded.' }); }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Documents & SharePoint Library</h1>
          <p>SharePoint-first file structures, version pinned references, and Microsoft 365 file access.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => setShowOneDriveModal(true)}>
            <Icon name="folder" /> Import from OneDrive
          </button>
          <button className="btn primary sm" onClick={openUploadModal}>
            <Icon name="plus" /> Register File
          </button>
        </div>
      </div>

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="grid-main">
        {/* Left: Folder Hierarchy */}
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel-pad">
            <h3>SharePoint Folders</h3>
            <p className="sub" style={{ marginBottom: 12 }}>
              Site: <code>ClientEngagements/2026</code>
            </p>
            <div className="stack" style={{ gap: 8 }}>
              {folders.map(f => (
                <div key={f.path} className="stack" style={{ gap: 4 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <button
                      className={`navitem ${selectedFolder === f.path ? 'active' : ''}`}
                      onClick={() => setSelectedFolder(f.path)}
                      style={{ textAlign: 'left', flex: 1, minWidth: 0, fontSize: 13 }}
                    >
                      <Icon name="folder" />
                      <span>{f.label}</span>
                    </button>
                    {hasAnyRole(state, ['manager', 'partner']) && f.clientId && (
                      <button
                        type="button"
                        className="btn sm ghost"
                        aria-label={`Rename display name for ${f.label}`}
                        onClick={() => { setEditingFolderPath(f.path); setFolderLabelDraft(f.label); }}
                      >Rename</button>
                    )}
                  </div>
                  {editingFolderPath === f.path && (
                    <form
                      className="panel panel-pad stack"
                      aria-label={`Rename folder display name for ${f.label}`}
                      onSubmit={event => {
                        event.preventDefault();
                        try {
                          prototypeStore.renameClientWorkspaceFolder(f.path, folderLabelDraft);
                          setEditingFolderPath(null);
                          setNotice({ tone: 'success', text: 'Folder display name updated. Its path, document references, and linked evidence are unchanged.' });
                        } catch (err) {
                          setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Folder display name could not be updated.' });
                        }
                      }}
                    >
                      <label htmlFor="workspace-folder-display-name">Folder display name</label>
                      <input
                        id="workspace-folder-display-name"
                        aria-label="Folder display name"
                        value={folderLabelDraft}
                        onChange={event => setFolderLabelDraft(event.target.value)}
                        maxLength={120}
                        required
                      />
                      <span className="caption">Changing this label does not move the folder or alter file/evidence links.</span>
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn primary sm" type="submit">Save name</button>
                        <button className="btn sm" type="button" onClick={() => setEditingFolderPath(null)}>Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>

            <div className="divider" />
            <button
              className="btn sm"
              style={{ width: '100%' }}
              onClick={() => {
                const engagement = state.engagements.find(item => item.id === state.selectedEngagement);
                if (!engagement) { setNotice({ tone: 'warning', text: 'Select an engagement before preparing its client workspace.' }); return; }
                try {
                  prototypeStore.prepareClientWorkspace(engagement.client, engagement.year, engagement.id);
                  setNotice({ tone: 'success', text: 'Local workspace folders were verified under the configured synthetic SharePoint root. No remote folders were provisioned.' });
                  setTimeout(() => setNotice(null), 4000);
                } catch (err) {
                  setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Workspace folders could not be prepared.' });
                }
              }}
            >
              Prepare Selected Client Workspace
            </button>
          </div>
        </div>

        {/* Right: Files in Folder */}
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Files in {selectedFolder}</h3>
                <span className="caption">{filteredDocs.length} items in view</span>
              </div>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Document Name</th>
                    <th>Version</th>
                    <th>Classification</th>
                    <th>Client visibility</th>
                    <th>Source</th>
                    <th>Uploaded By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map(doc => (
                    <tr key={doc.id} data-search-target={doc.id === searchTargetId ? 'true' : undefined} className={doc.id === searchTargetId ? 'selected-row' : undefined}>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <Icon name="file" />
                          <div>
                            <b>{doc.name}</b>
                            <div className="cell-sub">{doc.id} · {(doc.size / 1024).toFixed(1)} KB</div>
                            {doc.brokenLink && <span className="tag red">Reference unavailable</span>}
                          </div>
                        </div>
                      </td>
                      <td><span className="mono">v{doc.version}</span></td>
                      <td><span className="tag gray">{doc.classification}</span></td>
                      <td><span className={`tag ${doc.visibility === 'Client shared' ? 'green' : 'gray'}`}>{doc.visibility === 'Client shared' ? 'Shared' : 'Internal'}</span></td>
                      <td>
                        <span className={`tag ${doc.source === 'SharePoint' ? 'blue' : 'purple'}`}>
                          {doc.source}
                        </span>
                      </td>
                      <td>{doc.uploadedBy}</td>
                      <td>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn sm" disabled={doc.brokenLink} onClick={() => setPreviewDoc(doc)}>{doc.brokenLink ? 'Unavailable' : 'Open in M365'}</button>
                          {hasAnyRole(state, ['relationship', 'manager', 'partner', 'admin']) && <button className="btn sm ghost" aria-label={`${doc.visibility === 'Client shared' ? 'Withdraw sharing' : 'Share with client'} ${doc.name}`} onClick={() => {
                            const shared = doc.visibility !== 'Client shared';
                            const reason = window.prompt(consequencePrompt('document-sharing', doc.name, `Why ${shared ? 'share this document with the client' : 'withdraw client sharing'}?`)) || '';
                            if (!reason.trim()) return;
                            try { prototypeStore.setDocumentClientSharing(doc.id, shared, reason); setNotice({ tone: 'success', text: `Client sharing ${shared ? 'enabled' : 'withdrawn'} for ${doc.name}.` }); }
                            catch (err) { setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Client sharing could not be updated.' }); }
                          }}>{doc.visibility === 'Client shared' ? 'Withdraw sharing' : 'Share with client'}</button>}
                          {hasAnyRole(state, ['manager', 'partner']) && <button className="btn sm ghost" onClick={() => {
                            const name = window.prompt('Document name', doc.name);
                            if (name === null) return;
                            const path = window.prompt('Existing library folder path', doc.folderPath);
                            if (path === null) return;
                            try { prototypeStore.updateDocumentReference(doc.id, name, path); setNotice({ tone: 'success', text: `Document reference ${doc.id} updated; its identity and evidence links remain unchanged.` }); }
                            catch (err) { setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Document reference could not be updated.' }); }
                          }}>Rename / Move</button>}
                          {hasAnyRole(state, ['manager', 'partner']) && <button className="btn sm ghost" onClick={() => {
                            const reason = doc.brokenLink ? '' : window.prompt(consequencePrompt('document-unavailable', doc.name, 'Why is this reference unavailable?')) || '';
                            if (!doc.brokenLink && !reason) return;
                            try { prototypeStore.setDocumentAvailability(doc.id, !doc.brokenLink, reason); setNotice({ tone: 'success', text: doc.brokenLink ? `Document reference ${doc.id} restored.` : `Document reference ${doc.id} marked unavailable.` }); }
                            catch (err) { setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Availability could not be updated.' }); }
                          }}>{doc.brokenLink ? 'Restore reference' : 'Simulate unavailable'}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Simulated M365 Viewer Modal */}
      {previewDoc && (
        <div className="modal-backdrop" onClick={() => setPreviewDoc(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="row" style={{ gap: 10 }}>
                <Icon name="file" />
                <div>
                  <h3>Local metadata preview: {previewDoc.name}</h3>
                  <div className="cell-sub">No original file bytes are stored in this prototype</div>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setPreviewDoc(null)}>✕</button>
            </div>
            <div className="modal-body stack" style={{ gap: 16 }}>
              <div className="borderbox" style={{ background: '#f8fafc', padding: 16 }}>
                <div className="between">
                  <b>Metadata & Governance</b>
                  <span className="mono">v{previewDoc.version}</span>
                </div>
                <div className="info-grid mt12">
                  <div><label>Classification</label><span>{previewDoc.classification}</span></div>
                  <div><label>Storage Source</label><span>{previewDoc.source}</span></div>
                  <div><label>SHA-256</label><span className="mono" style={{ fontSize: 11 }}>{previewDoc.sha ? `${previewDoc.sha.slice(0, 24)}…` : 'Not available for sample metadata'}</span></div>
                  <div><label>Uploaded By</label><span>{previewDoc.uploadedBy}</span></div>
                  <div><label>Uploaded Date</label><span>{new Date(previewDoc.uploadedAt).toLocaleDateString('en-GB')}</span></div>
                  <div><label>Client Visibility</label><span>{previewDoc.visibility}</span></div>
                </div>
                {(previewDoc.sharingHistory || []).length > 0 && <details className="mt12"><summary>Sharing history ({previewDoc.sharingHistory!.length})</summary><ul>{previewDoc.sharingHistory!.map((event, index) => <li key={`${event.at}-${index}`}>{event.from} → {event.to} · {event.by} · {new Date(event.at).toLocaleString('en-GB')} · {event.reason}</li>)}</ul></details>}
              </div>

              <div className="borderbox" style={{ padding: 16, minHeight: 120 }}>
                <h4>Sample preview</h4>
                <p className="sub mt8" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  Original file content is unavailable. This screen shows metadata only.<br />
                  Linked to engagement: {previewDoc.engagementId || 'No engagement'}
                </p>
              </div>
              <div className="borderbox stack" style={{ padding: 16, gap: 8 }}>
                <b>Related records</b>
                {linkedJob && <button type="button" className="btn sm ghost" onClick={() => { setPreviewDoc(null); onNavigate('jobs', linkedJob.id); }}>Open job: {linkedJob.title} ({linkedJob.id})</button>}
                {linkedPbc && <button type="button" className="btn sm ghost" onClick={() => onNavigateToPbc(previewDoc.clientId, linkedPbc.id)}>Open PBC request: {linkedPbc.title} ({linkedPbc.id})</button>}
                {linkedWorkpaper && <button type="button" className="btn sm ghost" onClick={() => { setPreviewDoc(null); onNavigate('audit', linkedWorkpaper.id); }}>Open workpaper: {linkedWorkpaper.title} ({linkedWorkpaper.id})</button>}
                {!linkedJob && !linkedPbc && !linkedWorkpaper && <span className="caption">No linked job, request or workpaper.</span>}
              </div>
              <form className="borderbox stack" style={{ padding: 16, gap: 10 }} onSubmit={handleReplacementSubmit}>
                <b>Register a replacement revision</b>
                <label className="caption">Choose replacement file<input type="file" className="input" onChange={e => setReplacementFile(e.target.files?.[0] || null)} required /></label>
                <span className="caption">The new revision is registered separately. Evidence stays pinned to this exact version until reviewed.</span>
                <button className="btn sm" type="submit" disabled={!replacementFile}>Record Replacement v{previewDoc.version + 1}</button>
              </form>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setPreviewDoc(null)}>Close Viewer</button>
            </div>
          </div>
        </div>
      )}

      {/* Register File Modal */}
      {showUploadModal && (
        <div className="modal-backdrop" onClick={discardUploadDraft}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Register Document into SharePoint</h2>
              <button type="button" className="icon-btn" aria-label="Close document registration dialog" onClick={discardUploadDraft}>✕</button>
            </div>
            <form onSubmit={handleUploadSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                    <label className="caption">Choose a local file</label>
                    <input
                    type="file"
                    className="input"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    required
                  />
                  <span className="caption">Metadata is recorded locally. The original file is not uploaded or persisted by this prototype.</span>
                </div>
                <div>
                  <label className="caption">Target SharePoint Folder</label>
                  <select
                    className="input"
                    value={folderPath}
                    onChange={e => setFolderPath(e.target.value)}
                  >
                    <option value="/Engagements/2026/Accounting/">/Engagements/2026/Accounting/</option>
                    <option value="/Engagements/2026/Audit/">/Engagements/2026/Audit/</option>
                    <option value="/Engagements/2026/Audit/Workpapers/">/Engagements/2026/Audit/Workpapers/</option>
                    <option value="/Engagements/2026/Deliverables/">/Engagements/2026/Deliverables/</option>
                  </select>
                </div>
                <div>
                  <label className="caption">Classification</label>
                  <select
                    className="input"
                    value={classification}
                    onChange={e => setClassification(e.target.value as any)}
                  >
                    <option value="Client provided">Client provided</option>
                    <option value="Working paper">Working paper</option>
                    <option value="Deliverable">Deliverable</option>
                    <option value="Correspondence">Correspondence</option>
                  </select>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardUploadDraft}>Cancel</button>
                <button type="submit" className="btn primary sm" disabled={!uploadFile}>Record file metadata</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OneDrive Import Modal */}
      {showOneDriveModal && (
        <div className="modal-backdrop" onClick={() => setShowOneDriveModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Import from OneDrive for Business</h2>
              <button className="icon-btn" onClick={() => setShowOneDriveModal(false)}>✕</button>
            </div>
            <div className="modal-body stack" style={{ gap: 12 }}>
              <p className="sub">This local fixture list represents optional OneDrive selection. No Microsoft connection or file import occurs.</p>
              <div className="stack" style={{ gap: 8 }}>
                {[
                  'Fixed_Asset_Additions_Schedule_2026.xlsx',
                  'Board_Minutes_Approval_FY2026.pdf',
                  'Intercompany_Reconciliation_Memo.docx'
                ].map(file => (
                  <div key={file} className="between borderbox" style={{ padding: 10 }}>
                    <span style={{ fontSize: 13 }}>{file}</span>
                    <button
                      className="btn sm"
                      onClick={() => handleImportFromOneDrive(file)}
                    >
                      Record sample metadata
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setShowOneDriveModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
