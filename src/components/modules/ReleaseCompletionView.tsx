// Module 37: Final Release Completion, Gates & Delivery (VP-057, VP-058)
// Rigorous pre-release verification gates, exact generation freezing, artifact dispatch, and reissue lineage.

import React, { useEffect, useRef, useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole, hasRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { Notice, EmptyTableRow } from '../common/Feedback';
import { StatusBadge } from '../common/StatusBadge';
import { LifecyclePanel } from '../common/Lifecycle';
import { lifecycleById } from '../../services/lifecycles';
import { loadVerifiedArtifact } from '../../services/artifactStore';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { isReleaseBlockingFinding } from '../../services/findings';
import { evaluateReleaseReadiness } from '../../services/releaseReadiness';
import { archiveForRelease, releaseForPackage } from '../../services/packageLineage';

interface ReleaseCompletionViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const ReleaseCompletionView: React.FC<ReleaseCompletionViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [dispatchNote, setDispatchNote] = useState('');
  const [recipientText, setRecipientText] = useState('');
  const [amendReason, setAmendReason] = useState('');
  const [showAmendModal, setShowAmendModal] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const dispatchBaseline = useRef({ dispatchNote, recipientText });
  const amendBaseline = useRef(amendReason);

  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="archive" size="lg" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to access the release and final completion desk.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const client = state.clients.find(c => c.id === selectedEng.client);

  // Comprehensive 4-part release gate checklist (VP-057)
  const readiness = evaluateReleaseReadiness(selectedEng, state);
  const allWpCleared = !readiness.blockers.includes('One or more workpapers are not cleared or marked N/A');
  const currentClearedWorkpapers = selectedEng.workpapers.filter(workpaper =>
    !workpaper.applicable || workpaper.status === 'Not applicable' || (
      workpaper.status === 'Cleared' && workpaper.clearance?.version === workpaper.version && workpaper.clearance.sourceVersion === selectedEng.sourceVersion
    )
  ).length;
  const noOpenReviews = selectedEng.reviews.every(r => r.status === 'Cleared');

  // Gate 3: Findings resolution (no unresolved material misstatements)
  const openBlockingFindings = state.findings.filter(f => f.engagementId === selectedEng.id && isReleaseBlockingFinding(f));
  const noMaterialFindings = openBlockingFindings.length === 0;

  // Gate 4: Multi-stage sign-offs recorded and valid for current generation
  const approvalsValid = readiness.approvals.manager && readiness.approvals.client && readiness.approvals.partner && (!selectedEng.eqrRequired || readiness.approvals.eqr) && readiness.approvals.managementAcknowledgement;
  const commercialReady = selectedEng.acceptance && selectedEng.terms;
  const planningReady = selectedEng.planning && selectedEng.sourceAccepted && selectedEng.mappingApproved;

  const packageDefinition = selectedEng.packageHistory?.find(p => p.revision === selectedEng.packageRevision);
  const packageArtifactsReady = !readiness.blockers.includes('Assemble a valid current package revision with current TB/GL source, mapping and XLSX, DOCX and PDF artifacts first');
  const gatesPass = readiness.ready;

  const handleFreezeCandidate = async () => {
    if (!gatesPass) {
      triggerNotice('error', 'Cannot freeze release candidate: One or more release gates remain unfulfilled.');
      return;
    }
    try {
      if (!packageDefinition) throw new Error('Assemble the current package revision first.');
      for (const artifact of packageDefinition.artifacts) await loadVerifiedArtifact(artifact);
      prototypeStore.prepareReleaseCandidate(selectedEng.id);
      triggerNotice('success', `Release candidate frozen with ${packageDefinition.artifacts.length} verified artifacts for Generation ${selectedEng.generation}.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleIssueRelease = async (): Promise<boolean> => {
    if (!selectedEng.candidate) {
      triggerNotice('error', 'Must freeze release candidate first before issuing delivery.');
      return false;
    }
    if (!hasRole(state, 'partner')) return false;
    try {
      for (const artifact of selectedEng.candidate.manifest) await loadVerifiedArtifact(artifact);
      prototypeStore.issueRelease(selectedEng.id, dispatchNote, recipientText.split(/[;,\n]/));
      triggerNotice('success', 'Local release record created with frozen file identities and SHA-256 digests. No files were sent.');
      setDispatchNote(''); setRecipientText('');
      return true;
    } catch (err: any) {
      triggerNotice('error', err.message);
      return false;
    }
  };

  const saveAmendDraft = () => {
    if (!amendReason.trim()) return false;

    try {
      prototypeStore.reopenReleaseForAmendment(selectedEng.id, amendReason.trim());
      setShowAmendModal(false);
      setAmendReason('');
      triggerNotice('success', `Release re-opened for amendment. Partner clearance invalidated for Generation ${selectedEng.generation + 1}.`);
      return true;
    } catch (err: any) {
      triggerNotice('error', err.message);
      return false;
    }
  };
  const handleAmendSubmit = (e: React.FormEvent) => { e.preventDefault(); saveAmendDraft(); };
  const discardDispatchDraft = () => { setDispatchNote(''); setRecipientText(''); };
  const discardAmendDraft = () => { setShowAmendModal(false); setAmendReason(''); };
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    onRegisterUnsavedForm({ label: 'release dispatch details', isDirty: () => Boolean(selectedEng.candidate) && (dispatchNote !== dispatchBaseline.current.dispatchNote || recipientText !== dispatchBaseline.current.recipientText), save: handleIssueRelease, discard: discardDispatchDraft }, 'release-dispatch-draft');
    onRegisterUnsavedForm({ label: 'release amendment reason', isDirty: () => showAmendModal && amendReason !== amendBaseline.current, save: saveAmendDraft, discard: discardAmendDraft }, 'release-amend-draft');
    return () => { onRegisterUnsavedForm(null, 'release-dispatch-draft'); onRegisterUnsavedForm(null, 'release-amend-draft'); };
  }, [onRegisterUnsavedForm, selectedEng.candidate, dispatchNote, recipientText, showAmendModal, amendReason]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Release &amp; Final Completion Desk</h1>
          <p>Rigorous pre-release verification gates, exact generation freezing, artifact dispatch, and reissue lineage.</p>
        </div>
        <button className="btn sm ghost" onClick={() => onNavigate('records')}>
          <Icon name="archive" /> Logical Records Archive
        </button>
      </div>

      {notice && <Notice tone={notice.type} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {(() => {
        const currentRelease = releaseForPackage(selectedEng, packageDefinition);
        const currentArchive = archiveForRelease(selectedEng, currentRelease?.id);
        const archived = Boolean(currentArchive);
        const latestRelease = selectedEng.releases.at(-1);
        const candidateCurrent = Boolean(selectedEng.candidate && selectedEng.candidate.generation === selectedEng.generation && selectedEng.candidate.sourceVersion === selectedEng.sourceVersion && selectedEng.candidate.packageRevision === selectedEng.packageRevision && selectedEng.candidate.packageDefinitionId === packageDefinition?.id);
        const releaseStatus = archived ? 'Archived' : currentRelease ? 'Released' : candidateCurrent ? 'Candidate' : gatesPass ? 'Ready' : 'Blocked';
        const blockers = readiness.blockers;
        const next = releaseStatus === 'Blocked' ? 'Clear the blocked gates below; each links to its module.'
          : releaseStatus === 'Ready' ? `Freeze the release candidate for generation ${selectedEng.generation}.`
          : releaseStatus === 'Candidate' ? 'Issue the release (dispatch is simulated — no email is sent).'
          : releaseStatus === 'Released' ? 'Archive the release in Records & Archive, or reopen for amendment with a reason.'
          : 'Archived — view the archive record or its handover history.';
        return <LifecyclePanel
          definition={lifecycleById('release')}
          subject={`${selectedEng.id} · Generation ${selectedEng.generation}`}
          status={releaseStatus}
          headingLevel="h4"
          facts={[
          { label: 'Latest release', value: latestRelease ? `v${latestRelease.version} · ${latestRelease.releasedBy}${currentRelease?.id === latestRelease.id ? '' : ' · historical for this source'}` : 'None' },
          { label: 'Candidate', value: candidateCurrent ? `Generation ${selectedEng.candidate!.generation} · ${selectedEng.candidate!.preparedBy}` : selectedEng.candidate ? 'Stale candidate' : 'Not frozen' },
            { label: 'Signing partner', value: selectedEng.partner },
            { label: 'EQR', value: selectedEng.eqrRequired ? 'Required' : 'Not required' }
          ]}
          blockers={releaseStatus === 'Blocked' ? blockers : undefined}
          nextAction={next}
          downstream="Any change to workpapers, reviews, findings or source data advances the generation, clears the candidate and resets current sign-offs; prior releases stay as history."
        />;
      })()}

      {/* Gates Checklist */}
      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">PRE-RELEASE VERIFICATION GATES · {selectedEng.id}</span>
            <h2>Deliverable Readiness Evaluation (Generation {selectedEng.generation})</h2>
            <p className="sub">Every prerequisite gate must be satisfied before candidate generation is permitted.</p>
          </div>
          <span className={`badge ${gatesPass ? 'green' : 'amber'}`}>
            {gatesPass ? 'All Gates Cleared' : 'Gates Incomplete'}
          </span>
        </div>

        <div className="stack mt20" style={{ gap: 10 }}>
          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Icon name={commercialReady && planningReady ? 'checkcircle' : 'target'} className={commercialReady && planningReady ? 'text-green' : 'text-amber'} />
              <div>
                <b>0. Acceptance, terms, planning, source and mapping</b> <StatusBadge status={commercialReady && planningReady ? 'Passed' : 'Blocked'} kind={commercialReady && planningReady ? 'approved' : 'blocked'} />
                <div className="cell-sub">{commercialReady ? 'Professional acceptance and terms recorded' : 'Professional acceptance or agreed terms are missing'} · {planningReady ? 'Planning, accepted source and approved mapping are current' : 'Planning, accepted source or approved mapping is missing'}</div>
              </div>
            </div>
            <button type="button" className="btn sm ghost" onClick={() => onNavigate(commercialReady ? 'account-mappings' : 'onboarding')}>Inspect prerequisites</button>
          </div>
          {/* Gate 1: Workpapers */}
          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Icon name={allWpCleared ? 'checkcircle' : 'target'} className={allWpCleared ? 'text-green' : 'text-amber'} />
              <div>
                <b>1. All Audit Workpapers Cleared</b> <StatusBadge status={allWpCleared ? 'Passed' : 'Blocked'} kind={allWpCleared ? 'approved' : 'blocked'} />
                <div className="cell-sub">
                  {currentClearedWorkpapers} of {selectedEng.workpapers.length} cleared / N/A at the current workpaper and source revisions
                </div>
              </div>
            </div>
            <button className="btn sm ghost" onClick={() => onNavigate('audit')}>Inspect Workpapers</button>
          </div>

          {/* Gate 2: Review Desk */}
          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Icon name={noOpenReviews ? 'checkcircle' : 'message'} className={noOpenReviews ? 'text-green' : 'text-amber'} />
              <div>
                <b>2. Review Desk Queries Cleared</b> <StatusBadge status={noOpenReviews ? 'Passed' : 'Blocked'} kind={noOpenReviews ? 'approved' : 'blocked'} />
                <div className="cell-sub">
                  {selectedEng.reviews.filter(r => r.status === 'Cleared').length} of {selectedEng.reviews.length} review points cleared
                </div>
              </div>
            </div>
            <button className="btn sm ghost" onClick={() => onNavigate('reviews')}>Inspect Desk</button>
          </div>

          {/* Gate 3: Significant and material findings */}
          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Icon name={noMaterialFindings ? 'checkcircle' : 'shield'} className={noMaterialFindings ? 'text-green' : 'text-amber'} />
              <div>
                <b>3. No Unresolved Significant/Material Findings</b> <StatusBadge status={noMaterialFindings ? 'Passed' : 'Blocked'} kind={noMaterialFindings ? 'approved' : 'blocked'} />
                <div className="cell-sub">
                  {openBlockingFindings.length === 0
                    ? 'All audit findings resolved or classified as trivial'
                    : `${openBlockingFindings.length} unresolved significant/material finding(s) pending resolution`}
                </div>
              </div>
            </div>
            <button className="btn sm ghost" onClick={() => onNavigate('findings')}>Inspect Findings</button>
          </div>

          {/* Gate 4: Multi-stage approvals */}
          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Icon name={approvalsValid ? 'checkcircle' : 'shield'} className={approvalsValid ? 'text-green' : 'text-amber'} />
              <div>
                <b>4. Current approvals and management package acknowledgement for Generation {selectedEng.generation}</b> <StatusBadge status={approvalsValid ? 'Passed' : 'Blocked'} kind={approvalsValid ? 'approved' : 'blocked'} />
                <div className="cell-sub">
                  Manager: {readiness.approvals.manager ? '✓' : '✗'} ·
                  Client Rep: {readiness.approvals.client ? '✓' : '✗'} ·
                  Partner: {readiness.approvals.partner ? '✓' : '✗'} ·
                  Management package: {readiness.approvals.managementAcknowledgement ? '✓' : '✗'} ·
                  EQR: {!selectedEng.eqrRequired ? 'N/A' : readiness.approvals.eqr ? '✓' : '✗'}
                </div>
              </div>
            </div>
            <button className="btn sm ghost" onClick={() => onNavigate('approvals')}>Inspect Approvals</button>
          </div>
        </div>

        {/* Release Actions */}
        <div className="row mt20" style={{ gap: 10 }}>
          {!selectedEng.candidate ? (
            <button
              className={`btn ${gatesPass ? 'primary' : 'ghost'} sm`}
              onClick={handleFreezeCandidate}
              disabled={!gatesPass || !packageArtifactsReady}
            >
              Freeze Release Candidate (Generation {selectedEng.generation})
            </button>
          ) : (
            <div className="stack" style={{ width: '100%', gap: 12 }}>
              <div className="borderbox" style={{ background: '#f0fdf4', padding: 16 }}>
                <div className="between">
                  <b>Release Candidate Frozen (Generation {selectedEng.candidate.generation})</b>
              <span className="mono">Exact artifact candidate · Generation {selectedEng.candidate.generation}</span>
                </div>
                <div className="cell-sub mt8">
                  Prepared by {selectedEng.candidate.preparedBy} on {new Date(selectedEng.candidate.preparedAt).toLocaleString('en-GB')}
                </div>
                <div className="tablewrap mt8"><table>
                  <thead><tr><th>Artifact</th><th>Type</th><th>Bytes</th><th>SHA-256</th></tr></thead>
                  <tbody>{selectedEng.candidate.manifest.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.kind}</td><td>{item.size}</td><td className="mono">{item.sha256}</td></tr>)}</tbody>
                </table></div>
                <div className="mt12">
                  <label className="caption">Local release note</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={dispatchNote}
                    onChange={e => setDispatchNote(e.target.value)}
                  />
                </div>
                <div className="mt8">
                  <label className="caption">Recipient metadata (comma separated)</label>
                  <input className="input" value={recipientText} onChange={e => setRecipientText(e.target.value)} placeholder="Enter intended recipients" />
                </div>
                <p className="caption mt8">The frozen manifest identifies the verified generated files and digests. The local release record does not send them to recipients.</p>
                <div className="row mt12" style={{ gap: 10 }}>
                  <button className="btn primary sm" onClick={handleIssueRelease} disabled={!hasRole(state, 'partner')}>
                    Record Local Release
                  </button>
                  <button className="btn ghost sm" onClick={() => { amendBaseline.current = amendReason; setShowAmendModal(true); }}>
                    Re-open for Amendment
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dispatched Releases History */}
      <div className="panel">
        <div className="panel-head">
          <h3>Release Records ({selectedEng.releases.length})</h3>
          <span className="caption">Local metadata manifest and revision lineage · no delivery or cryptographic hash claim</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Release ID</th>
                <th>Version</th>
                <th>Gen</th>
                <th>Predecessor</th>
                <th>Status</th>
                <th>Recorded At</th>
                <th>Recorded By</th>
                <th>Recipients</th>
                <th>Local Note</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {selectedEng.releases.length === 0 ? (
                <EmptyTableRow colSpan={10} variant="none" title="No local release records exist for this engagement." />
              ) : (
                selectedEng.releases.map(rel => (
                  <tr key={rel.id}>
                    <td><b>{rel.id}</b></td>
                    <td>v{rel.version}</td>
                    <td>Gen {rel.generation}</td>
                    <td><span className="mono">{rel.predecessorId || 'Initial Release'}</span></td>
                    <td>
                      <span className={`badge ${selectedEng.releases.some(next => next.predecessorId === rel.id) ? 'amber' : 'green'}`}>
                        {selectedEng.releases.some(next => next.predecessorId === rel.id) ? 'Superseded' : 'Recorded locally · not delivered'}
                      </span>
                    </td>
                    <td>{new Date(rel.releasedAt).toLocaleDateString('en-GB')}</td>
                    <td>{rel.releasedBy}</td>
                    <td>{(rel.recipients || []).join(', ')}</td>
                    <td>{rel.dispatchNote}</td>
                    <td>
                      {!selectedEng.releases.some(next => next.predecessorId === rel.id) && (
                        <button className="btn sm ghost" disabled={!hasAnyRole(state, ['manager', 'partner'])} onClick={() => { amendBaseline.current = amendReason; setShowAmendModal(true); }}>
                          Re-open for Amendment
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Amend Modal */}
      {showAmendModal && (
        <div className="modal-backdrop" onClick={discardAmendDraft}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Re-open Package for Amendment</h2>
              <button type="button" className="icon-btn" aria-label="Close release amendment dialog" onClick={discardAmendDraft}>✕</button>
            </div>
            <form onSubmit={handleAmendSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <p className="sub">
                  Re-opening a release preserves the prior record, increments the generation, and requires fresh approvals. It does not alter the predecessor record.
                </p>
                <div>
                  <label className="caption">Amendment Reason (Required Governance Record)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Specify the subsequent event, client adjustment, or note disclosure requirement..."
                    value={amendReason}
                    onChange={e => setAmendReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={discardAmendDraft}>Cancel</button>
                <button type="submit" className="btn primary sm">Confirm Amendment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
