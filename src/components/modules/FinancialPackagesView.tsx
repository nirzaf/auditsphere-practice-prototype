// Module 25: Financial Packages Assembly & DOCX Export (VP-042)
// Package assembly, section selection and ordering, multi-revision lineage,
// interactive validation summary, and genuine Word / PDF deliverable exports.

import React, { useEffect, useRef, useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { hasAnyRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { exportService } from '../../services/exportService';
import { applyReportingAdjustments, calculateIncomeStatement } from '../../services/calculations';
import { artifactSha256, downloadVerifiedArtifact, persistArtifacts } from '../../services/artifactStore';
import { FinancialPackageRevision, GeneratedArtifactRecord } from '../../types';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';
import { isReleaseBlockingFinding } from '../../services/findings';

const DEFAULT_SECTIONS = [
  { id: 'rpt', title: 'Independent Auditor Report', desc: 'Standard unmodified opinion under ISA 700 with key audit matters.', enabled: true },
  { id: 'bs', title: 'Statement of Financial Position', desc: 'Comparative balance sheet verified to underlying trial balance.', enabled: true },
  { id: 'pnl', title: 'Statement of Comprehensive Income', desc: 'Operating results, gross margin, and tax provisions.', enabled: true },
  { id: 'eq', title: 'Statement of Changes in Equity', desc: 'Unavailable until opening equity and evidence-backed movements are independently reviewed.', enabled: false },
  { id: 'cf', title: 'Statement of Cash Flows', desc: 'Unavailable until a current cash-flow schedule is independently reviewed.', enabled: false },
  { id: 'notes', title: 'Statutory Notes & Disclosures', desc: 'Summary of significant IFRS accounting policies and risk disclosures.', enabled: true }
];

interface FinancialPackagesViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const FinancialPackagesView: React.FC<FinancialPackagesViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);
  const savedPackage = selectedEng?.packageHistory?.find(p => p.revision === selectedEng.packageRevision);
  const currentMapping = [...(state.accountMappingRevisions || []).filter(item => item.engagementId === selectedEng?.id)].sort((a, b) => b.revision - a.revision)[0];
  const currentGLSource = selectedEng?.glSourceHistory?.at(-1);
  const cashFlowSchedule = selectedEng?.cashFlowScheduleHistory?.at(-1);
  const cashFlowReady = Boolean(selectedEng && cashFlowSchedule?.status === 'Reviewed' && cashFlowSchedule.sourceVersion === selectedEng.sourceVersion && cashFlowSchedule.mappingRevision === currentMapping?.revision && currentMapping.status === 'Approved');
  const equityMovements = cashFlowSchedule?.movements.filter(item => ['Equity contribution', 'Equity distribution'].includes(item.category)) || [];
  const equityNetMovement = equityMovements.reduce((sum, item) => sum + item.amount, 0);
  const equityReady = Boolean(cashFlowReady && cashFlowSchedule?.openingEquity !== undefined);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [packageNotes, setPackageNotes] = useState(savedPackage?.notes || '');
  const [noteApplicability, setNoteApplicability] = useState<NonNullable<FinancialPackageRevision['noteApplicability']>>(savedPackage?.noteApplicability || 'Not assessed');
  const [disclosures, setDisclosures] = useState(selectedEng?.disclosureHistory?.length ? selectedEng.disclosureHistory : [{ id: 'DISC-01', title: 'Significant accounting policies', applicability: 'Applicable' as const, text: '', sharedWithClient: false, revision: 0, status: 'Draft' as const, preparedByUserId: '' }]);
  const [sections, setSections] = useState(savedPackage?.sections.slice().sort((a, b) => a.order - b.order).map(section => ({ ...section, enabled: section.enabled && (section.id === 'cf' ? cashFlowReady : section.id === 'eq' ? equityReady : true) })) || DEFAULT_SECTIONS.map(section => section.id === 'cf' ? { ...section, desc: 'Requires a current independently reviewed cash-flow schedule.', enabled: cashFlowReady } : section.id === 'eq' ? { ...section, enabled: equityReady } : section));
  const [assembling, setAssembling] = useState(false);
  const initialDraft = useRef(JSON.stringify({ packageNotes, noteApplicability, disclosures, sections }));
  useEffect(() => {
    const key = 'financial-package-draft';
    if (!onRegisterUnsavedForm) return;
    const guard: UnsavedFormGuard = {
      label: 'Financial package and disclosures',
      isDirty: () => JSON.stringify({ packageNotes, noteApplicability, disclosures, sections }) !== initialDraft.current,
      save: () => {
        try {
          const current = prototypeStore.getSnapshot().engagements.find(item => item.id === selectedEng.id);
          if (selectedEng && !current) return false;
          if (selectedEng) disclosures.filter(item => item.status === 'Draft' && item.title.trim()).forEach(item => prototypeStore.saveDisclosureReview(selectedEng.id, { id: item.id, title: item.title, applicability: item.applicability, text: item.text, evidenceRef: item.evidenceRef, rationale: item.rationale, sharedWithClient: item.sharedWithClient }));
          initialDraft.current = JSON.stringify({ packageNotes, noteApplicability, disclosures, sections });
          return true;
        } catch (error: any) { triggerNotice('error', error.message); return false; }
      },
      discard: () => {
        const saved = prototypeStore.getSnapshot().engagements.find(item => item.id === selectedEng.id)?.disclosureHistory || [];
        setDisclosures(saved);
        setPackageNotes(savedPackage?.notes || '');
        setNoteApplicability(savedPackage?.noteApplicability || 'Not assessed');
        setSections(savedPackage?.sections.slice().sort((a, b) => a.order - b.order).map(section => ({ ...section })) || DEFAULT_SECTIONS.map(section => ({ ...section })));
      }
    };
    onRegisterUnsavedForm(guard, key);
    return () => onRegisterUnsavedForm(null, key);
  }, [packageNotes, noteApplicability, disclosures, sections, selectedEng?.id, onRegisterUnsavedForm]);

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="archive" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to compile and export financial packages.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  // Pre-release validation summary gates
  const adjustmentResult = applyReportingAdjustments(selectedEng.rows, state.adjustmentJournals.filter(j => j.engagementId === selectedEng.id), selectedEng.sourceVersion, prototypeStore.getAdjustmentSupportIssues(selectedEng.id));
  const packageRows = adjustmentResult.rows;
  const equityClosing = (cashFlowSchedule?.openingEquity ?? 0) + equityNetMovement + calculateIncomeStatement(packageRows).netProfit;
  const tbSum = packageRows.reduce((sum, r) => sum + r.balance, 0);
  const tbBalanced = Math.abs(tbSum) < 1;
  const workpapersCleared = selectedEng.workpapers.every(w => !w.applicable || w.status === 'Cleared' || w.status === 'Not applicable');
  const reviewNotesCleared = selectedEng.reviews.every(r => r.status === 'Cleared');
  const findingsImmaterial = state.findings.filter(f => f.engagementId === selectedEng.id && isReleaseBlockingFinding(f)).length === 0;
  const mappingHistory = (state.accountMappingRevisions || []).filter(item => item.engagementId === selectedEng.id);
  const unmappedAccounts = selectedEng.rows.filter(row => !currentMapping?.mappings.some(mapping => mapping.accountCode === row.code));
  const mappingsReady = Boolean(currentMapping?.status === 'Approved' && unmappedAccounts.length === 0);

  const disclosureRequired = sections.some(section => section.id === 'notes' && section.enabled);
  const disclosuresReady = !disclosureRequired || disclosures.length > 0 && disclosures.every(item => item.status === 'Reviewed' && item.reviewedByUserId);
  const cashFlowRequired = sections.some(section => section.id === 'cf' && section.enabled);
  const equityRequired = sections.some(section => section.id === 'eq' && section.enabled);
  const allValid = tbBalanced && workpapersCleared && reviewNotesCleared && findingsImmaterial && adjustmentResult.unapplied.length === 0 && mappingsReady && disclosuresReady && (!cashFlowRequired || cashFlowReady) && (!equityRequired || equityReady);
  const packageSections = sections.map(section => section.id === 'cf' ? { ...section, desc: cashFlowReady && cashFlowSchedule ? `Reviewed cash-flow schedule v${cashFlowSchedule.revision}; ${selectedEng!.currency}.` : DEFAULT_SECTIONS.find(item => item.id === 'cf')!.desc, enabled: section.enabled && cashFlowReady } : section.id === 'eq' ? { ...section, desc: equityReady && cashFlowSchedule ? `Reviewed opening equity and evidence-backed movements in schedule v${cashFlowSchedule.revision}; ${selectedEng!.currency}.` : DEFAULT_SECTIONS.find(item => item.id === 'eq')!.desc, enabled: section.enabled && equityReady } : section);

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setSections(prev => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === sections.length - 1) return;
    setSections(prev => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleToggleSection = (index: number) => {
    if (sections[index].id === 'cf' && !cashFlowReady) return;
    if (sections[index].id === 'eq' && !equityReady) return;
    setSections(prev => prev.map((s, i) => i === index ? { ...s, enabled: !s.enabled } : s));
  };

  const packageLines = (revision: number, included: typeof sections) => [
    `Client Legal Name: ${client?.name || 'Example Trading Entity'}`,
    `Reporting Period: ${selectedEng.period}`,
    `Engagement Service: ${selectedEng.service}`,
    `Audit Signatory: ${selectedEng.partner} (Partner)`,
    `Quality Reviewer: ${selectedEng.eqrRequired ? 'Dr. Tariq Al-Sayed (EQR)' : 'N/A (EQR not required)'}`,
    `Package Revision: Version ${revision}`,
    `Source Revision: TB v${selectedEng.sourceVersion}`,
    ...(currentGLSource ? [`GL Source Revision: v${currentGLSource.revision} · SHA-256 ${currentGLSource.sha256}`] : []),
    `Mapping Revision: v${currentMapping?.revision || 0}`,
    ...(included.some(section => section.id === 'cf') && cashFlowSchedule ? [`Cash-flow Schedule Revision: v${cashFlowSchedule.revision}`] : []),
    ...(included.some(section => section.id === 'eq') && cashFlowSchedule ? [`Equity Schedule Revision: v${cashFlowSchedule.revision}`] : []),
    `Auditor Opinion: ${selectedEng.opinion}`,
    `Signed trial-balance total: ${tbSum.toFixed(2)} ${selectedEng.currency}`,
    `Total assets: ${packageRows.filter(r => r.type === 'asset').reduce((sum, r) => sum + r.balance, 0).toFixed(2)} ${selectedEng.currency}`,
    `Total liabilities: ${(0 - packageRows.filter(r => r.type === 'liability').reduce((sum, r) => sum + r.balance, 0)).toFixed(2)} ${selectedEng.currency}`,
    `Included accepted unreflected adjustments: ${adjustmentResult.applied.join(', ') || 'None'}`,
    '', 'TABLE OF CONTENTS (ORDERED SECTIONS):',
    ...included.map((s, idx) => `${idx + 1}. ${s.title} — ${s.desc}`),
    ...(included.some(section => section.id === 'cf') && cashFlowSchedule ? ['', 'STATEMENT OF CASH FLOWS', `Opening cash: ${cashFlowSchedule.openingCash.toFixed(2)} ${selectedEng.currency}`, ...cashFlowSchedule.movements.map(item => `${item.category} · ${item.description}: ${item.amount.toFixed(2)} ${selectedEng.currency} · Evidence ${item.evidenceRef}`), `Closing cash: ${cashFlowSchedule.closingCash.toFixed(2)} ${selectedEng.currency}`] : []),
    ...(included.some(section => section.id === 'eq') && cashFlowSchedule?.openingEquity !== undefined ? ['', 'STATEMENT OF CHANGES IN EQUITY', `Opening total equity: ${cashFlowSchedule.openingEquity.toFixed(2)} ${selectedEng.currency}`, ...equityMovements.map(item => `${item.category} · ${item.description}: ${item.amount.toFixed(2)} ${selectedEng.currency} · Evidence ${item.evidenceRef}`), `Current-period result: ${calculateIncomeStatement(packageRows).netProfit.toFixed(2)} ${selectedEng.currency}`, `Closing total equity: ${equityClosing.toFixed(2)} ${selectedEng.currency}`, 'Component breakdown unavailable because the approved mapping combines equity accounts.'] : []),
    '', ...disclosures.filter(item => item.sharedWithClient).flatMap(item => [`${item.title} — ${item.applicability}`, item.applicability === 'Applicable' ? `${item.text} · Evidence ${item.evidenceRef}` : `Not applicable: ${item.rationale}`])
  ];

  const handleAssembleNewRevision = async () => {
    setAssembling(true);
    try {
      if (prototypeStore.isSessionOnlyMode()) throw new Error('Browser storage is in session-only mode; package files cannot be committed as a durable revision.');
      const revision = selectedEng.packageRevision + 1;
      const included = packageSections.filter(s => s.enabled);
      const title = `Financial Reporting Package - ${client?.name || 'Example Trading Entity'} - Rev ${revision}`;
      const lines = packageLines(revision, included);
      const fileBase = `Financial_Report_Package_${client?.code || 'CL001'}_v${revision}`;
      const rows = [
        ['Account code', 'Account name', 'Type', `Signed balance (${selectedEng.currency})`],
        ...packageRows.map(r => [r.code, r.name, r.type, r.balance]),
        ...(included.some(section => section.id === 'cf') && cashFlowSchedule ? [
          ['', 'Statement of Cash Flows', '', ''],
          ['', 'Opening cash', '', cashFlowSchedule.openingCash],
          ...cashFlowSchedule.movements.map(item => ['', `${item.category}: ${item.description} · ${item.evidenceRef}`, item.category, item.amount]),
          ['', 'Closing cash', '', cashFlowSchedule.closingCash]
        ] : []),
        ...(included.some(section => section.id === 'eq') && cashFlowSchedule?.openingEquity !== undefined ? [
          ['', 'Statement of Changes in Equity', '', ''],
          ['', 'Opening total equity', '', cashFlowSchedule.openingEquity],
          ...equityMovements.map(item => ['', `${item.category}: ${item.description} · ${item.evidenceRef}`, item.category, item.amount]),
          ['', 'Current-period result', '', calculateIncomeStatement(packageRows).netProfit],
          ['', 'Closing total equity', '', equityClosing]
        ] : []),
        ['Total', '', '', tbSum],
        ['Source revision', '', '', selectedEng.sourceVersion],
        ...(currentGLSource ? [['GL source revision', '', '', currentGLSource.revision], ['GL source SHA-256', '', '', currentGLSource.sha256]] : []),
        ['Mapping revision', '', '', currentMapping?.revision || 0],
        ['Package revision', '', '', revision]
      ];
      const blobs = [
        { kind: 'XLSX' as const, name: `${fileBase}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', blob: exportService.createXLSXBlob(title, rows) },
        { kind: 'DOCX' as const, name: `${fileBase}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', blob: await exportService.createDOCXBlob(title, lines) },
        { kind: 'PDF' as const, name: `${fileBase}.pdf`, mimeType: 'application/pdf', blob: exportService.createPDFBlob(title, lines) }
      ];
      const artifacts: GeneratedArtifactRecord[] = await Promise.all(blobs.map(async item => ({ id: `${selectedEng.id}-PKG-${revision}-${item.kind}-${crypto.randomUUID()}`, name: item.name, kind: item.kind, mimeType: item.mimeType, size: item.blob.size, sha256: await artifactSha256(item.blob) })));
      await persistArtifacts(blobs.map((item, index) => ({ record: artifacts[index], blob: item.blob })));
      const record: FinancialPackageRevision = {
        id: `${selectedEng.id}-PKG-${revision}`,
        engagementId: selectedEng.id,
        revision,
        generation: selectedEng.generation + 1,
        sourceVersion: selectedEng.sourceVersion,
        glSourceRevision: currentGLSource?.revision,
        glSourceSha256: currentGLSource?.sha256,
        mappingRevision: currentMapping?.revision || 0,
        cashFlowScheduleRevision: (cashFlowRequired && cashFlowReady || equityRequired && equityReady) ? cashFlowSchedule!.revision : undefined,
        notes: packageNotes,
        noteApplicability,
        noteRevision: revision,
        disclosures: structuredClone(disclosures),
        sections: packageSections.map((s, order) => ({ ...s, order: order + 1 })),
        validation: { passed: allValid, trialBalanceNet: tbSum, pendingWorkpapers: selectedEng.workpapers.filter(w => w.applicable && w.status !== 'Cleared' && w.status !== 'Not applicable').length, openReviews: selectedEng.reviews.filter(r => r.status !== 'Cleared').length, materialFindings: state.findings.filter(f => f.engagementId === selectedEng.id && isReleaseBlockingFinding(f)).length },
        artifacts,
        createdAt: new Date().toISOString(),
        createdBy: state.currentPerson,
        createdByUserId: state.currentUserId
      };
      prototypeStore.saveFinancialPackageRevision(record);
      triggerNotice(allValid ? 'success' : 'error', `Package revision ${revision} saved with exact XLSX, DOCX and PDF files${allValid ? '.' : '; validation remains blocked until all package gates are cleared.'}`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    } finally {
      setAssembling(false);
    }
  };

  const handleDownload = async (kind: GeneratedArtifactRecord['kind']) => {
    const revision = selectedEng.packageHistory?.find(p => p.revision === selectedEng.packageRevision);
    const artifact = revision?.artifacts.find(a => a.kind === kind);
    if (!artifact) { triggerNotice('error', 'Assemble this package revision first to create its exact saved outputs.'); return; }
    try { await downloadVerifiedArtifact(artifact); triggerNotice('success', `Downloaded ${artifact.name} after SHA-256 verification.`); }
    catch (err: any) { triggerNotice('error', err.message); }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Financial Reporting Packages</h1>
          <p>Exact package revisions with persisted sections, notes, source lineage and generated XLSX, DOCX and PDF files.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" disabled={!savedPackage} onClick={() => handleDownload('XLSX')}>
            <Icon name="download" /> Download XLSX
          </button>
          <button className="btn sm ghost" disabled={!savedPackage} onClick={() => handleDownload('PDF')}>
            <Icon name="download" /> Download PDF
          </button>
          <button className="btn primary sm" disabled={!savedPackage} onClick={() => handleDownload('DOCX')}>
            <Icon name="download" /> Download DOCX
          </button>
        </div>
      </div>

      {notice && (
        <div
          className="panel panel-pad"
          style={{
            background: notice.type === 'success' ? '#f0fdf4' : '#fef2f2',
            borderColor: notice.type === 'success' ? '#86efac' : '#fca5a5',
            color: notice.type === 'success' ? '#166534' : '#991b1b',
            padding: '10px 16px'
          }}
        >
          <b>{notice.type === 'success' ? '✓ ' : '⚠ '}</b>
          {notice.text}
        </div>
      )}

      {/* Package Header & Revision Info */}
      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">ACTIVE PACKAGE LINEAGE</span>
            <h2>{client?.name} · Rev {selectedEng.packageRevision}</h2>
            <p className="sub">TB v{savedPackage?.sourceVersion ?? 'not assembled'} · GL {savedPackage?.glSourceRevision === undefined ? 'not configured' : `v${savedPackage.glSourceRevision} · SHA-256 ${savedPackage.glSourceSha256}`} · Mapping v{savedPackage?.mappingRevision ?? 'not assembled'} · Generation {selectedEng.generation}</p>
          </div>
          <button className="btn sm" disabled={assembling || !hasAnyRole(state, ['manager', 'preparer'])} onClick={handleAssembleNewRevision}>
            {assembling ? 'Saving exact artifacts…' : `+ Assemble New Revision (Rev ${selectedEng.packageRevision + 1})`}
          </button>
        </div>

        <div className="info-grid mt16">
          <div><label>Engagement Service</label><span>{selectedEng.service}</span></div>
          <div><label>Period Under Audit</label><span>{selectedEng.period}</span></div>
          <div><label>Lead Signing Partner</label><span>{selectedEng.partner}</span></div>
          <div><label>Auditor Opinion Proposed</label><b>{selectedEng.opinion}</b></div>
        </div>
      </div>

      {savedPackage && (
        <div className="panel panel-pad">
          <h3>Saved Revision {savedPackage.revision} · {savedPackage.generation === selectedEng.generation && savedPackage.sourceVersion === selectedEng.sourceVersion && savedPackage.glSourceRevision === currentGLSource?.revision && savedPackage.glSourceSha256 === currentGLSource?.sha256 && savedPackage.mappingRevision === (currentMapping?.revision || 0) ? (savedPackage.validation.passed ? 'Validated' : 'Validation blocked') : 'Stale'}</h3>
          <p className="sub mt4">Notes revision {savedPackage.noteRevision} · assembled by {savedPackage.createdBy} · {new Date(savedPackage.createdAt).toLocaleString('en-GB')}</p>
          {savedPackage.sourceVersion !== selectedEng.sourceVersion && <p role="status" className="mt8">This package is pinned to TB source v{savedPackage.sourceVersion}; current source is v{selectedEng.sourceVersion}. Assemble a new revision before release.</p>}
          {(savedPackage.glSourceRevision !== currentGLSource?.revision || savedPackage.glSourceSha256 !== currentGLSource?.sha256) && <p role="status" className="mt8">This package is pinned to GL source {savedPackage.glSourceRevision === undefined ? 'not configured' : `v${savedPackage.glSourceRevision} (${savedPackage.glSourceSha256})`}; current GL source is {currentGLSource ? `v${currentGLSource.revision} (${currentGLSource.sha256})` : 'not configured'}. Assemble a new revision before release.</p>}
          {savedPackage.generation !== selectedEng.generation && <p role="status" className="mt8">This package is pinned to generation {savedPackage.generation}; accounting or engagement context changed to generation {selectedEng.generation}. Assemble a new revision before release.</p>}
          {savedPackage.mappingRevision !== (currentMapping?.revision || 0) && <p role="status" className="mt8">This package is pinned to mapping v{savedPackage.mappingRevision}; the current mapping is v{currentMapping?.revision || 0}. Assemble a new revision before release.</p>}
          <div className="tablewrap mt8"><table>
            <thead><tr><th>Artifact</th><th>Exact identity</th><th>Type / bytes</th><th>SHA-256</th></tr></thead>
            <tbody>{savedPackage.artifacts.map(artifact => <tr key={artifact.id}>
              <td>{artifact.name}</td><td className="mono">{artifact.id}</td><td>{artifact.kind} · {artifact.size}</td><td className="mono">{artifact.sha256}</td>
            </tr>)}</tbody>
          </table></div>
        </div>
      )}

      {/* Validation Summary Panel */}
      <div className="panel panel-pad">
        <div className="between">
          <div>
            <h3>Pre-Publication Validation Summary</h3>
            <p className="sub">Comprehensive integrity gates required before deliverable freezing and client release.</p>
          </div>
          <span className={`badge ${allValid ? 'green' : 'amber'}`}>
            {allValid ? 'All Gates Cleared' : 'Action Required'}
          </span>
        </div>
        {!mappingsReady && <div role="alert" className="badge danger mt12" style={{ display: 'block', padding: 12 }}>Package validation blocked: account mappings must be independently approved and cover every trial balance account. Unmapped: {unmappedAccounts.map(row => row.code).join(', ') || 'none'}.</div>}
        {!disclosuresReady && <div role="alert" className="badge amber mt12" style={{ display: 'block', padding: 12 }}>Package validation blocked: every disclosure must be prepared, supported or justified, and independently reviewed.</div>}

        <div className="grid4 mt16" style={{ gap: 12 }}>
          <div className="borderbox" style={{ padding: 12 }}>
            <span className="caption">Trial Balance Net Zero</span>
            <div className="mt4">
              <span className={`badge ${tbBalanced ? 'green' : 'red'}`}>
                {tbBalanced ? 'Balanced (Net 0)' : `Unbalanced (${tbSum})`}
              </span>
            </div>
          </div>

          <div className="borderbox" style={{ padding: 12 }}>
            <span className="caption">Accepted Adjustments</span>
            <div className="mt4"><span className={`badge ${adjustmentResult.unapplied.length ? 'red' : 'green'}`}>
              {adjustmentResult.unapplied.length ? `${adjustmentResult.unapplied.length} require resolution` : `${adjustmentResult.applied.length} included once`}
            </span></div>
            {adjustmentResult.unapplied.map(item => <div className="caption mt4" key={item.journalId}>{item.journalId}: {item.reason}</div>)}
          </div>

          <div className="borderbox" style={{ padding: 12 }}>
            <span className="caption">Working Papers Clearance</span>
            <div className="mt4">
              <span className={`badge ${workpapersCleared ? 'green' : 'amber'}`}>
                {workpapersCleared ? 'All WPs Cleared' : 'Pending WPs'}
              </span>
            </div>
          </div>

          <div className="borderbox" style={{ padding: 12 }}>
            <span className="caption">Review Notes Clearance</span>
            <div className="mt4">
              <span className={`badge ${reviewNotesCleared ? 'green' : 'amber'}`}>
                {reviewNotesCleared ? 'Zero Open Notes' : 'Pending Notes'}
              </span>
            </div>
          </div>

          <div className="borderbox" style={{ padding: 12 }}>
            <span className="caption">Significant / Material Findings</span>
            <div className="mt4">
              <span className={`badge ${findingsImmaterial ? 'green' : 'red'}`}>
                {findingsImmaterial ? 'Immaterial / Cleared' : 'Uncorrected Found'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Contents Selection & Ordering */}
      <div className="panel">
        <div className="panel-head between">
          <div>
            <h3>Interactive Package Section Selection &amp; Ordering</h3>
            <span className="caption">Toggle sections and reorder sections for export package generation</span>
          </div>
          <span className="caption">{sections.filter(s => s.enabled).length} of {sections.length} active</span>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 60 }}>Include</th>
                <th style={{ width: 60 }}>Order</th>
                <th>Section Title</th>
                <th>Description</th>
                <th>Order Controls</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec, idx) => (
                <tr key={sec.id} style={{ opacity: sec.enabled ? 1 : 0.5 }}>
                  <td>
                      <input
                      type="checkbox"
                      checked={sec.enabled}
                      disabled={sec.id === 'cf' && !cashFlowReady || sec.id === 'eq' && !equityReady}
                      aria-label={`Include ${sec.title}`}
                      onChange={() => handleToggleSection(idx)}
                    />
                  </td>
                  <td><b>#{idx + 1}</b></td>
                  <td><b>{sec.title}</b></td>
                  <td><span className="cell-sub">{packageSections[idx].desc}</span></td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        className="btn sm ghost"
                        disabled={idx === 0}
                        onClick={() => handleMoveUp(idx)}
                      >
                        ▲ Up
                      </button>
                      <button
                        className="btn sm ghost"
                        disabled={idx === sections.length - 1}
                        onClick={() => handleMoveDown(idx)}
                      >
                        ▼ Down
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel-pad">
          <h3>Disclosure register</h3>
          {disclosures.map(item => <div className="borderbox mt8 panel-pad" key={item.id}>
            <b>{item.title} · v{item.revision} · {item.status}</b>
            <div className="grid2 mt8">
              <label className="caption">Disclosure title<input aria-label="Disclosure title" className="input mt4" value={item.title} disabled={item.status === 'Reviewed'} onChange={e => setDisclosures(items => items.map(row => row.id === item.id ? { ...row, title: e.target.value } : row))} /></label>
              <label className="caption">Applicability<select aria-label={`${item.title} applicability`} className="input mt4" value={item.applicability} disabled={item.status === 'Reviewed'} onChange={e => setDisclosures(items => items.map(row => row.id === item.id ? { ...row, applicability: e.target.value as typeof row.applicability } : row))}><option>Applicable</option><option>Not applicable</option></select></label>
            </div>
            {item.applicability === 'Applicable' ? <><textarea className="input mt8" aria-label={`${item.title} disclosure text`} value={item.text} disabled={item.status === 'Reviewed'} placeholder="Prepared disclosure content" onChange={e => setDisclosures(items => items.map(row => row.id === item.id ? { ...row, text: e.target.value } : row))} /><label className="caption mt8">Evidence document ID<input aria-label="Evidence document ID" className="input mt4" value={item.evidenceRef || ''} disabled={item.status === 'Reviewed'} onChange={e => setDisclosures(items => items.map(row => row.id === item.id ? { ...row, evidenceRef: e.target.value } : row))} /></label></> : <textarea className="input mt8" aria-label={`${item.title} not-applicable rationale`} value={item.rationale || ''} disabled={item.status === 'Reviewed'} placeholder="Reason this disclosure is not applicable" onChange={e => setDisclosures(items => items.map(row => row.id === item.id ? { ...row, rationale: e.target.value } : row))} />}
            <label className="caption mt8"><input type="checkbox" aria-label={`${item.title} client sharing`} checked={item.sharedWithClient} disabled={item.status === 'Reviewed'} onChange={e => setDisclosures(items => items.map(row => row.id === item.id ? { ...row, sharedWithClient: e.target.checked } : row))} /> Include this note in the client package</label>
            {item.status === 'Reviewed' && hasAnyRole(state, ['manager', 'preparer']) && <button className="btn sm mt8" onClick={() => setDisclosures(items => items.map(row => row.id === item.id ? { ...row, status: 'Draft', reviewedByUserId: undefined, reviewedAt: undefined } : row))}>Revise disclosure</button>}
            {item.status === 'Draft' && hasAnyRole(state, ['manager', 'preparer']) && <button className="btn sm mt8" onClick={() => { try { prototypeStore.saveDisclosureReview(selectedEng.id, { id: item.id, title: item.title, applicability: item.applicability, text: item.text, evidenceRef: item.evidenceRef, rationale: item.rationale, sharedWithClient: item.sharedWithClient }); const saved = prototypeStore.getSnapshot().engagements.find(eng => eng.id === selectedEng.id)?.disclosureHistory || []; setDisclosures(saved); initialDraft.current = JSON.stringify({ packageNotes, noteApplicability, disclosures: saved, sections }); triggerNotice('success', 'Disclosure saved as a new draft revision.'); } catch (err: any) { triggerNotice('error', err.message); } }}>Save preparer draft</button>}
            {item.status === 'Draft' && hasAnyRole(state, ['reviewer', 'partner', 'eqr']) && <button className="btn sm mt8" onClick={() => { try { prototypeStore.reviewDisclosure(selectedEng.id, item.id, item.revision); const saved = prototypeStore.getSnapshot().engagements.find(eng => eng.id === selectedEng.id)?.disclosureHistory || []; setDisclosures(saved); initialDraft.current = JSON.stringify({ packageNotes, noteApplicability, disclosures: saved, sections }); triggerNotice('success', 'Disclosure independently reviewed.'); } catch (err: any) { triggerNotice('error', err.message); } }}>Review independently</button>}
          </div>)}
          {hasAnyRole(state, ['manager', 'preparer']) && <button className="btn sm mt8" onClick={() => setDisclosures(items => [...items, { id: crypto.randomUUID(), title: '', applicability: 'Applicable', text: '', sharedWithClient: false, revision: 0, status: 'Draft', preparedByUserId: '' }])}>Add disclosure</button>}
        </div>
      </div>
    </div>
  );
};
