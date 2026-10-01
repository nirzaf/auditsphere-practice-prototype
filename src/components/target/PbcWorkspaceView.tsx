import React, { useState } from 'react';
import { prototypeStore } from '../../store/prototypeStore';
import { isClientRole, visibleEngagementIds } from '../../services/guards';
import { persistArtifact } from '../../services/artifactStore';
import { sha256OfFile } from '../../services/fileMetadata';
import { validatePbcUpload } from '../../services/pbcUpload';
import { currentDeliverables, isFrozen } from '../../services/targetLifecycle';
import { formatCurrency } from '../../services/calculations';
import { getRoutedContact } from '../../services/contactRouting';
import { ActionButton, ArtifactLink, Field, TargetForm, value, type TargetViewProps } from './TargetCommon';

export function PbcWorkspaceView(props: TargetViewProps & { client?: boolean }) {
  const s = prototypeStore.getSnapshot(),
    allowed = visibleEngagementIds(s),
    e = s.engagements.find(
      (eng) => eng.id === s.selectedEngagement && (allowed === 'ALL' || allowed.includes(eng.id))
    );

  const client = isClientRole(s.currentRole) || props.client;
  const contacts = e ? s.contacts.filter(c => c.clientId === e.client && Boolean(getRoutedContact([c], 'pbc_requests'))) : [];
  const set = e ? currentDeliverables(s, e) : undefined;
  const frozen = e ? isFrozen(e) : false;
  const releasedSets = (e?.auditLifecycle?.deliverables || []).filter(d => Boolean(d.deliveredAt));
  const isUploadLocked = frozen || releasedSets.length > 0;

  const [activeClientTab, setActiveClientTab] = useState<'requests' | 'invoices' | 'holding_letters' | 'deliverables'>('requests');
  const passwordResetCompleted = Boolean(s.portalPasswordChanges?.some(p => p.userId === s.currentUserId));
  const [newPassword, setNewPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');

  if (!e)
    return (
      <section className="panel panel-pad">
        <h2>No Authorized Engagement Selected</h2>
        <p>Please select an engagement within your current access scope.</p>
      </section>
    );

  const clientEntity = s.clients.find((c) => c.id === e.client);
  const holdingLetters = (e.auditLifecycle?.holdingLetters || []).filter(l => l.simulatedDispatchStatus === 'Issued (simulated)');

  const invoices = s.invoices.filter(inv => inv.clientId === e.client && (inv.engagementId || inv.eng) === e.id && ['Issued', 'Paid'].includes(inv.status));
  const receipts = s.receipts.filter(r => r.clientId === e.client && r.allocations.length > 0 && r.allocations.every(allocation => invoices.some(inv => inv.id === allocation.invoiceId)));

  const handlePasswordReset = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (newPassword.length < 8) {
      setPasswordNotice('Password must be at least 8 characters long.');
      return;
    }
    prototypeStore.lifecycle.simulatePasswordChange();
    setPasswordNotice('Password successfully updated. Document submission access unlocked.');
  };

  // Status mapping for PBC requests
  const getPbcStatusBadge = (pbcItem: (typeof e.pbc)[0]) => {
    if (pbcItem.status === 'Draft' || pbcItem.status === 'Requested') {
      return { label: 'Pending Upload', color: '#b45309', bg: '#fef3c7' };
    }
    if (pbcItem.status === 'Received') {
      return { label: 'Under Review', color: '#0369a1', bg: '#e0f2fe' };
    }
    if (pbcItem.status === 'Accepted') {
      return { label: 'Approved', color: '#15803d', bg: '#dcfce7' };
    }
    if (pbcItem.status === 'Needs clarification') {
      return { label: 'Rejected / Re-upload Required', color: '#b91c1c', bg: '#fee2e2' };
    }
    return { label: pbcItem.status, color: '#475569', bg: '#f1f5f9' };
  };

  return (
    <div className="target-stack">
      {/* Top Banner */}
      <section className="panel panel-pad">
        <div className="flex-between">
          <div>
            <span className="tag blue mb8">
              {client ? 'SECURE CLIENT AUDIT PORTAL (PBC)' : 'MODULE 1 & 2: ENGAGEMENT WORKSPACE & PBC'}
            </span>
            <h2>{client ? 'Client Information & PBC Workspace' : '5-Folder Engagement Taxonomy & PBC Workspace'}</h2>
            <p className="caption">
              Client Entity: <strong>{clientEntity?.name}</strong> · Engagement: <strong>{e.id}</strong> ({e.period}) ·
              Auditing Standards: <strong>ISA &amp; IFRS Governance</strong>
            </p>
          </div>
          <div className="text-right">
            <span className={`tag ${isUploadLocked ? 'red' : 'green'}`}>
              {isUploadLocked ? 'PORTAL ACCESS FROZEN (READ-ONLY)' : 'UPLOAD WINDOW ACTIVE'}
            </span>
          </div>
        </div>

        {/* Temporal Lock Notice */}
        {isUploadLocked && (
          <div className="mt12 p12 borderbox bg-red-subtle" style={{ borderRadius: 6, border: '1px solid #f87171' }}>
            <strong style={{ color: '#991b1b' }}>🔒 Temporal Lock Active:</strong>
            <p className="caption mt4" style={{ color: '#7f1d1d' }}>
              Final certified audit deliverables have been released or compliance archive locking has commenced. In accordance with ISA 230 governance, client document uploads are permanently frozen. You may download all invoices, receipts, holding letters, and certified final audit bundles.
            </p>
          </div>
        )}

        {/* Mandatory First-Login Password Reset Gate */}
        {client && !passwordResetCompleted && (
          <div className="mt16 p16 borderbox" style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 8 }}>
            <h3 style={{ color: '#b45309', margin: '0 0 6px 0' }}>⚠️ Mandatory First Login Security Requirement</h3>
            <p className="sub mb12">
              For compliance with data protection and auditor-client governance, you must reset your temporary credentials before document submission privileges are unlocked.
            </p>
            <form onSubmit={handlePasswordReset} className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="target-field" style={{ minWidth: 260 }}>
                <span>Create New Secure Password</span>
                <input
                  type="password"
                  required
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={(ev) => setNewPassword(ev.target.value)}
                />
              </label>
              <button type="submit" className="btn primary sm">
                Reset Password &amp; Unlock Uploads
              </button>
            </form>
            {passwordNotice && <p className="caption mt8" style={{ color: '#b45309', fontWeight: 600 }}>{passwordNotice}</p>}
          </div>
        )}
      </section>

      {/* Internal Staff View: Directory Provisioning */}
      {!client && (
        <section className="panel panel-pad">
          <div className="flex-between">
            <div>
              <h3>Standard 5-Folder Directory Provisioning (Taxonomy)</h3>
              <p className="caption">
                Provisioned upon Partner acceptance of engagement terms:
              </p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <ActionButton
                action={() => prototypeStore.prepareClientWorkspace(e.client, e.year, e.id)}
              >
                Auto-Provision 5-Folder Taxonomy
              </ActionButton>
              <ActionButton
                action={() =>
                  prototypeStore.lifecycle.verifyWorkspaceAccess(
                    e.id,
                    'Five engagement folders and client-scoped access inspected in the simulation.'
                  )
                }
              >
                Verify Workspace Access
              </ActionButton>
            </div>
          </div>

          <div className="row mt12" style={{ gap: 12, flexWrap: 'wrap' }}>
            {[
              '01_Administration & Planning',
              '02_Trial Balance & Schedules',
              '03_Fieldwork & Testing',
              '04_Drafts & Deliverables',
              '05_Final Signed Archive'
            ].map((folderName, index) => (
              <div key={folderName} className="panel panel-pad" style={{ flex: '1 1 180px', background: '#f8fafc' }}>
                <span className="caption">Folder {index + 1}</span>
                <strong>{folderName}</strong>
                <div className="caption text-muted">Status: Active &amp; Scoped</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Client Portal Tab Navigation */}
      {client && (
        <div className="tabs">
          <button
            className={`tab-btn ${activeClientTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveClientTab('requests')}
          >
            1. Requested Documentation ({e.pbc.length})
          </button>
          <button
            className={`tab-btn ${activeClientTab === 'invoices' ? 'active' : ''}`}
            onClick={() => setActiveClientTab('invoices')}
          >
            2. Commercial Invoices &amp; Receipts ({invoices.length + receipts.length})
          </button>
          <button
            className={`tab-btn ${activeClientTab === 'holding_letters' ? 'active' : ''}`}
            onClick={() => setActiveClientTab('holding_letters')}
          >
            3. Formal Holding Letters ({holdingLetters.length})
          </button>
          <button
            className={`tab-btn ${activeClientTab === 'deliverables' ? 'active' : ''}`}
            onClick={() => setActiveClientTab('deliverables')}
          >
            4. Final Certified Deliverables ({releasedSets.length})
          </button>
        </div>
      )}

      {/* TAB 1: PBC DOCUMENT REQUESTS */}
      {(!client || activeClientTab === 'requests') && (
        <>
          {!client && (
            <TargetForm
              title="Issue Client Document / Schedule Request (PBC)"
              button="Dispatch PBC Request to Client"
              formId="pbc-create"
              onRegisterUnsavedForm={props.onRegisterUnsavedForm}
              onCommit={(d) => {
                const requestId = `PBC-${crypto.randomUUID()}`;
                prototypeStore.addPbcRequest(e.id, {
                  id: requestId,
                  title: value(d, 'title'),
                  category: value(d, 'category'),
                  description: value(d, 'description'),
                  owner: s.currentPerson,
                  contributor: value(d, 'recipient'),
                  due: value(d, 'due'),
                  status: 'Draft',
                  version: 1,
                  thread: []
                });
                prototypeStore.presentPbcRequest(e.id, requestId);
              }}
            >
              <Field label="Request Title" name="title" placeholder="e.g. FY 2026 Trial Balance & General Ledger Export" />
              <Field label="Audit Category" name="category" defaultValue="Financial Schedules">
                <option value="Financial Schedules">Financial Schedules &amp; Trial Balance</option>
                <option value="Bank Statements">Bank Statements &amp; Reconciliations</option>
                <option value="Fixed Assets">Fixed Assets Register &amp; Depreciation</option>
                <option value="Payroll">Payroll Summary &amp; WPS Transfer Slips</option>
                <option value="Tax & Corporate">Corporate Registration &amp; Tax Cards</option>
                <option value="Vouchers">Substantive Sample Vouchers &amp; Invoices</option>
              </Field>
              <Field label="Detailed Instructions for Client" name="description" type="textarea" placeholder="Specify file format (Excel/CSV/PDF), date cutoff, and mandatory supporting schedules..." />
              <Field label="Client Audit Liaison" name="recipient">
                {contacts.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({c.title || c.responsibility || 'Client Contact'})
                  </option>
                ))}
              </Field>
              <Field label="Submission Due Date" name="due" type="date" defaultValue={s.asOfDate} />
            </TargetForm>
          )}

          <section className="panel panel-pad">
            <h3>PBC Information Requests Register</h3>
            <p className="caption mb12">
              Real-time audit review status badges reflect whether uploaded schedules and voucher evidence are approved or require re-upload.
            </p>

            <div className="stack" style={{ gap: 12 }}>
              {e.pbc
                .filter(p => !client || !['Draft', 'Cancelled'].includes(p.status))
                .map((p) => {
                  const badge = getPbcStatusBadge(p);
                  return (
                    <div
                      key={p.id}
                      className="borderbox p16"
                      style={{
                        borderRadius: 6,
                        borderLeft: `4px solid ${badge.color}`,
                        background: '#ffffff'
                      }}
                    >
                      <div className="flex-between">
                        <div>
                          <strong>{p.title}</strong>
                          <span className="caption text-muted ml8">({p.category})</span>
                        </div>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: 4,
                            fontSize: '12px',
                            fontWeight: 700,
                            backgroundColor: badge.bg,
                            color: badge.color
                          }}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <p className="sub mt8">{p.description}</p>
                      <div className="caption text-muted mt4">
                        Assigned To: {p.contributor} · Submission Cutoff: {p.due} · Revision: v{p.version}
                      </div>

                      {/* Display of Mandatory Rejection Reason */}
                      {p.status === 'Needs clarification' && p.thread && p.thread.length > 0 && (
                        <div className="mt12 p12 borderbox" style={{ background: '#fef2f2', border: '1px solid #f87171', borderRadius: 4 }}>
                          <strong style={{ color: '#991b1b' }}>⚠️ Auditor Rejection Reason / Clarification Required:</strong>
                          <p className="sub mt4" style={{ color: '#7f1d1d' }}>
                            {p.clarificationNote || p.thread.filter(item => item.clientVisible && item.kind === 'clarification').at(-1)?.text || 'Ask the audit liaison for the recorded clarification reason.'}
                          </p>
                        </div>
                      )}

                      {/* Shared Files list */}
                      {p.sharedFiles && p.sharedFiles.length > 0 && (
                        <div className="mt12 pt8 border-top">
                          <span className="caption font-medium">Shared files:</span>
                          <div className="stack mt4" style={{ gap: 4 }}>
                            {p.sharedFiles.map((f) => (
                              <div key={f.id} className="row justify-between caption bg-muted-subtle p4" style={{ borderRadius: 4 }}>
                                <span>📄 {f.name} (v{f.version})</span>
                                <span className="mono text-muted">{f.sha ? `${f.sha.slice(0, 12)}...` : 'Verified'}</span>
                                {f.artifact ? <ArtifactLink artifact={f.artifact} /> : <span>Original download metadata unavailable</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <section className="mt12 pt12 border-top" aria-label={`Conversation for ${p.title}`}>
                        <h4>Staff–client conversation</h4>
                        <ol className="stack" style={{ listStyle: 'none', padding: 0, overflowWrap: 'anywhere' }}>
                          {(p.thread || []).filter(message => !client || message.clientVisible === true).map(message => {
                            const attachment = p.sharedFiles?.find(file => message.fileId ? file.id === message.fileId : file.name === message.file && file.version === message.version);
                            return <li key={message.id} className="borderbox p12">
                              <strong>{message.author}</strong> <span className="caption">{isClientRole(message.role as typeof s.currentRole) ? 'Client' : 'Staff'} · <time dateTime={message.time}>{new Date(message.time).toLocaleString()}</time>{!message.clientVisible && ' · Internal only'}</span>
                              <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
                              {attachment?.artifact && <ArtifactLink artifact={attachment.artifact} />}
                            </li>;
                          })}
                        </ol>
                        {!p.thread?.some(message => !client || message.clientVisible) && <p className="caption">No messages yet.</p>}
                        {!isUploadLocked && ['Requested','Needs clarification','Received','Under review','Accepted'].includes(p.status) && (client ? passwordResetCompleted && p.contributor === s.currentPerson : ['manager','partner','preparer','reviewer'].includes(s.currentRole)) ? <TargetForm
                          title={`Reply to: ${p.title}`} button="Send reply" formId={`pbc-reply-${p.id}`} onRegisterUnsavedForm={props.onRegisterUnsavedForm}
                          onCommit={async data => {
                            const file = data.get('attachment') as File | null;
                            let attachment;
                            if (file?.size) {
                              const error = validatePbcUpload(file); if (error) throw Error(error);
                              attachment = { id: `PBC-STAFF-${crypto.randomUUID()}`, name: file.name, kind: 'PBC' as const, mimeType: file.type || 'application/octet-stream', size: file.size, sha256: await sha256OfFile(file) };
                              await persistArtifact(attachment, new Blob([file], { type: attachment.mimeType }));
                            }
                            prototypeStore.replyToPbcRequest(e.id, p.id, value(data, 'message'), attachment);
                          }}>
                          <label className="target-field"><span>Message to {client ? 'audit staff' : 'client'}</span><textarea name="message" required maxLength={2000} /></label>
                          {!client && <label className="target-field"><span>Attach a file (optional)</span><input type="file" name="attachment" /></label>}
                          {client && <p className="caption">Use Upload Evidence below to send files for audit review.</p>}
                        </TargetForm> : <p className="caption">Conversation is read-only until access is unlocked, or after release, cancellation or archive.</p>}
                        <p className="caption">File originals are stored in this browser; cloud demo sync transfers conversation metadata only.</p>
                      </section>

                      {/* Upload Form for Client */}
                      {client && ['Requested', 'Needs clarification', 'Draft'].includes(p.status) && (
                        <div className="mt12 pt12 border-top">
                          {!isUploadLocked && passwordResetCompleted ? (
                            <TargetForm
                              title={`Upload Evidence for: ${p.title}`}
                              button="Upload Schedule / Document"
                              onRegisterUnsavedForm={props.onRegisterUnsavedForm}
                              onCommit={async (d) => {
                                const file = d.get('file') as File;
                                const error = validatePbcUpload(file);
                                if (error) throw Error(error);
                                const id = `DOC-PBC-${crypto.randomUUID()}`;
                                const sha256 = await sha256OfFile(file);
                                const blob = new Blob([file], { type: file.type || 'application/octet-stream' });
                                await persistArtifact(
                                  {
                                    id,
                                    name: file.name,
                                    kind: 'PBC',
                                    mimeType: blob.type,
                                    size: blob.size,
                                    sha256
                                  },
                                  blob
                                );
                                prototypeStore.uploadPbcResponse(e.id, p.id, {
                                  id,
                                  name: file.name,
                                  size: file.size,
                                  sha256,
                                  type: file.type
                                });
                              }}
                            >
                              <label className="target-field">
                                <span>Select Document (Excel / CSV / PDF)</span>
                                <input name="file" type="file" required />
                              </label>
                            </TargetForm>
                          ) : (
                            <p className="caption text-muted">
                              {isUploadLocked ? 'Uploads locked (Report finalized)' : 'Please reset temporary password above to unlock uploads'}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Auditor Review Actions */}
                      {!client && p.status === 'Received' && (
                        <div className="mt12 pt12 border-top row" style={{ gap: 10 }}>
                          <ActionButton action={() => prototypeStore.acceptPbcResponse(e.id, p.id)}>
                            ✓ Approve Uploaded Evidence
                          </ActionButton>
                          <TargetForm
                            title={`Reject & Return for Re-upload: ${p.title}`}
                            button="Reject &amp; Require Re-upload"
                            onRegisterUnsavedForm={props.onRegisterUnsavedForm}
                            onCommit={(d) =>
                              prototypeStore.requestPbcClarification(e.id, p.id, value(d, 'note'))
                            }
                          >
                            <Field label="Mandatory Rejection Rationale (Surfaces on client screen)" name="note" type="textarea" placeholder="Detail reason for rejection and required correction..." />
                          </TargetForm>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
        </>
      )}

      {/* TAB 2: INVOICES & RECEIPTS */}
      {client && activeClientTab === 'invoices' && (
        <section className="panel panel-pad">
          <h3>Commercial Invoices &amp; Official Receipts</h3>
          <p className="caption mb12">
            Contracted 50% Advance Invoices, Balance Fee Notes, and Official Receipt Vouchers.
          </p>

          <div className="stack" style={{ gap: 12 }}>
            <h4 style={{ margin: '8px 0 4px 0' }}>Commercial Invoices:</h4>
            {invoices.map((inv) => (
              <div key={inv.id} className="borderbox p12 flex-between" style={{ background: '#f8fafc', borderRadius: 6 }}>
                <div>
                  <strong>{inv.invoiceNumber}</strong>
                  <div className="caption text-muted">Issued: {inv.issueDate || '—'} · Due: {inv.due}</div>
                </div>
                <div className="text-right">
                  <div className="mono font-medium">{formatCurrency(inv.amount, inv.currency)}</div>
                  <span className={`tag ${inv.status === 'Paid' ? 'green' : 'amber'}`}>{inv.status}</span>
                </div>
              </div>
            ))}

            <h4 style={{ margin: '16px 0 4px 0' }}>Official Payment Receipts:</h4>
            {receipts.map((rec) => (
              <div key={rec.id} className="borderbox p12 flex-between" style={{ background: '#ecfdf5', border: '1px solid #10b981', borderRadius: 6 }}>
                <div>
                  <strong style={{ color: '#047857' }}>Official Receipt: {rec.receiptNumber}</strong>
                  <div className="caption text-muted">Payment Date: {rec.date} · Ref: {rec.externalRef} ({rec.method})</div>
                  <strong>{rec.allocations.every(a => a.reversed) ? 'Reversed — historical receipt, no current settlement' : `Effective settlement: ${rec.allocations.filter(a => !a.reversed).reduce((sum,a) => sum+a.amount,0)} ${rec.currency}${rec.allocations.some(a => a.reversed) ? ' · partially reversed historical receipt' : ''}`}</strong>
                  {e.auditLifecycle?.receiptDocuments.filter(document => document.receiptIds.includes(rec.id)).map(document => <ArtifactLink key={document.artifact.id} artifact={document.artifact} />)}
                </div>
                <div className="mono font-medium" style={{ color: '#047857' }}>
                  {formatCurrency(rec.amount, rec.currency)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 3: HOLDING LETTERS */}
      {client && activeClientTab === 'holding_letters' && (
        <section className="panel panel-pad">
          <h3>Formal Audit Holding Letters</h3>
          <p className="caption mb12">
            Formal notices issued when critical third-party audit confirmations remain pending.
          </p>

          {holdingLetters.length > 0 ? (
            <div className="borderbox p16" style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 6 }}>
              <div className="flex-between">
                <div>
                  <strong style={{ color: '#b45309' }}>Pending Confirmation / Holding Letter</strong>
                  <p className="sub mt4">
                    In accordance with ISA 505 governance, release of the final certified audit report is held pending receipt of critical external confirmations:
                  </p>
                </div>
                <span className="tag amber">ACTION REQUIRED</span>
              </div>
              <ul className="mt8 caption" style={{ paddingLeft: 20 }}>
                {holdingLetters.map(letter => <li key={letter.id}>
                  <strong>{letter.id} · v{letter.revision}</strong> · {letter.generatedAt} · {letter.recipientName} · {letter.simulatedDispatchStatus}
                  <ul>{letter.sourceBlockers.map((blocker, i) => <li key={i}>{blocker}</li>)}</ul>
                  {letter.artifact && <ArtifactLink artifact={letter.artifact} />}
                </li>)}
              </ul>
            </div>
          ) : (
            <p className="caption text-muted">No Holding Letters have been issued for this engagement.</p>
          )}
        </section>
      )}

      {/* TAB 4: FINAL DELIVERABLES */}
      {client && activeClientTab === 'deliverables' && (
        <section className="panel panel-pad">
          <h3>Certified Final Deliverables Bundle</h3>
          <p className="caption mb12">
            Certified, sealed, and digitally signed audit reports, management letters, and representation letters.
          </p>

          {releasedSets.length > 0 ? (
            <div className="stack" style={{ gap: 12 }}>
              {releasedSets.map((d) => (
                <div key={d.id} data-testid="client-release-set" className="borderbox p16" style={{ background: '#f8fafc', borderRadius: 6 }}>
                  <div className="flex-between">
                    <div>
                      <strong>Final Audit Deliverables Package (Revision v{d.revision})</strong>
                      <div className="caption text-muted">Released on {d.deliveredAt} · Report date: {d.reportDate} · Opinion: {e.auditLifecycle?.opinions.find(o => o.revision === d.opinionRevision)?.value || 'Unavailable'}</div>
                    </div>
                    <span className="tag green">CERTIFIED &amp; SEALED</span>
                  </div>

                  <div className="stack mt12" style={{ gap: 8 }}>
                    {d.artifacts.map((a) => (
                      <div key={a.id} className="flex-between p8 borderbox bg-white" style={{ borderRadius: 4 }}>
                        <div>
                          <strong>{a.name}</strong>
                          <div className="caption text-muted">{a.deliverable || a.name}</div>
                        </div>
                        <ArtifactLink artifact={a} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="caption text-muted">Final certified deliverables have not yet been authorized by the Engagement Partner.</p>
          )}
        </section>
      )}
    </div>
  );
}
