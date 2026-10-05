'use client';

import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Calculator,
  Plus,
  Paperclip,
  FolderArchive,
  Mail,
  ShieldAlert,
  ArrowRight,
  Clock,
  Sparkles,
  Search,
  Check,
  RotateCcw
} from 'lucide-react';
import { formatQar } from '@/lib/utils';
import { SamplingCalculatorModal } from './SamplingCalculatorModal';
import { ReviewNoteRejectionModal } from './ReviewNoteRejectionModal';

interface Module3FieldworkProps {
  userRole: string;
  fslis: any[];
  tbRows: any[];
  confirmations: any[];
  onToggleLock?: (fsliId: string) => void;
  onSubmitProcedure?: (procId: string) => void;
  onClearProcedure?: (procId: string) => void;
  onRejectProcedure?: (procId: string, reason: string) => void;
}

export function Module3Fieldwork({
  userRole,
  fslis,
  tbRows,
  confirmations,
  onToggleLock,
  onSubmitProcedure,
  onClearProcedure,
  onRejectProcedure
}: Module3FieldworkProps) {
  const [activeView, setActiveView] = useState<'split-fs' | 'workprograms' | 'confirmations' | 'srm'>('split-fs');
  const [selectedFsliId, setSelectedFsliId] = useState<string>(fslis[0]?.id ?? '');
  const [samplingModalOpen, setSamplingModalOpen] = useState(false);
  const [rejectionModalProc, setRejectionModalProc] = useState<{ id: string; ref: string; title: string; assigned: string } | null>(null);

  // Local state for locked FSLIs to provide instant checkout feedback
  const [lockedMap, setLockedMap] = useState<Record<string, { lockedBy: string; lockedAt: string }>>({});

  // Local state for procedures
  const [localFslis, setLocalFslis] = useState(fslis);

  const selectedFsli = localFslis.find(f => f.id === selectedFsliId) ?? localFslis[0];

  const plFslis = localFslis.filter(f => f.section === 'PROFIT_AND_LOSS' || f.section === 'PROFIT_LOSS');
  const bsFslis = localFslis.filter(f => f.section === 'BALANCE_SHEET');

  const handleToggleCheckout = (fsli: any) => {
    const isLocked = Boolean(lockedMap[fsli.id]);
    if (isLocked) {
      const copy = { ...lockedMap };
      delete copy[fsli.id];
      setLockedMap(copy);
    } else {
      setLockedMap({
        ...lockedMap,
        [fsli.id]: {
          lockedBy: userRole === 'PREPARER' ? 'Tariq Al-Mansoor (Junior)' : 'Fatima Al-Kuwari (Manager)',
          lockedAt: new Date().toLocaleTimeString()
        }
      });
    }
    onToggleLock?.(fsli.id);
  };

  const handleProcedureStatusChange = (procId: string, newStatus: string) => {
    setLocalFslis(prev =>
      prev.map(f => ({
        ...f,
        workPrograms: f.workPrograms?.map((wp: any) => ({
          ...wp,
          procedures: wp.procedures?.map((p: any) =>
            p.id === procId ? { ...p, status: newStatus } : p
          )
        }))
      }))
    );
  };

  const handleAddAdHoc = () => {
    const title = prompt('Enter procedural step title:');
    if (!title) return;
    const newProc = {
      id: `proc-adhoc-${Date.now()}`,
      ref: `ADHOC-${Date.now().toString().slice(-4)}`,
      title,
      instructions: 'Custom substantive procedure added dynamically during fieldwork.',
      assertions: ['Existence', 'Completeness'],
      status: 'IN_PROGRESS',
      adHoc: true,
      adHocReason: 'Specific transaction anomaly identified during audit sampling.',
      evidence: []
    };

    setLocalFslis(prev =>
      prev.map(f => {
        if (f.id !== selectedFsliId) return f;
        const wp = f.workPrograms?.[0];
        if (!wp) return f;
        return {
          ...f,
          workPrograms: [{ ...wp, procedures: [...(wp.procedures ?? []), newProc] }]
        };
      })
    );
  };

  return (
    <div className="space-y-6">
      {/* Sub navigation */}
      <div className="flex border-b border-slate-200 space-x-2 pb-2 text-xs">
        <button
          onClick={() => setActiveView('split-fs')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeView === 'split-fs'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Split Financial Statement Dashboard (Row Locks)</span>
        </button>

        <button
          onClick={() => setActiveView('workprograms')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeView === 'workprograms'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>Substantive Workprograms &amp; Hybrid Evidence</span>
        </button>

        <button
          onClick={() => setActiveView('confirmations')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeView === 'confirmations'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Confirmations Dashboard &amp; Gatekeeper</span>
        </button>

        <button
          onClick={() => setActiveView('srm')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeView === 'srm'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Summary Review Memorandum (SRM)</span>
        </button>
      </div>

      {/* ── VIEW: SPLIT FINANCIAL STATEMENT DASHBOARD ──────────────────────── */}
      {activeView === 'split-fs' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Split Financial Statement Dashboard (ISA 315/330)</h3>
              <p className="text-xs text-slate-500">
                Upper Pane: Profit &amp; Loss (P/L) • Lower Pane: Balance Sheet (B/S) with Row-Level Concurrency Locks.
              </p>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <span className="flex items-center space-x-1 text-slate-600 font-medium">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>Row Checkout Lock Active</span>
              </span>
            </div>
          </div>

          {/* Upper Pane: Profit & Loss */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center space-x-2">
                <span>Pane 1: Profit &amp; Loss Statement (P/L)</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">QAR Currency</span>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="p-3">Lock</th>
                  <th className="p-3">FSLI Code &amp; Label</th>
                  <th className="p-3 text-right">CY 2026 (QAR)</th>
                  <th className="p-3 text-right">PY 2025 (QAR)</th>
                  <th className="p-3 text-right">Variance %</th>
                  <th className="p-3 text-center">Risk Stratum</th>
                  <th className="p-3 text-right">Action Launchers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plFslis.map(f => {
                  const cy = Number(f.currentYear);
                  const py = Number(f.priorYear);
                  const variancePct = py > 0 ? (((cy - py) / py) * 100).toFixed(1) : '—';
                  const isLocked = Boolean(lockedMap[f.id]);

                  return (
                    <tr key={f.id} className="hover:bg-slate-50 transition">
                      <td className="p-3">
                        <button
                          onClick={() => handleToggleCheckout(f)}
                          className={`p-1.5 rounded-lg border transition ${
                            isLocked
                              ? 'bg-amber-100 border-amber-300 text-amber-800'
                              : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-900'
                          }`}
                          title={isLocked ? `Locked by ${lockedMap[f.id]?.lockedBy}` : 'Click to lock row for testing'}
                        >
                          {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-[11px] text-blue-600 font-bold mr-2">{f.code}</span>
                        <span className="font-bold text-slate-900">{f.label}</span>
                        {isLocked && (
                          <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                            Checked out: {lockedMap[f.id]?.lockedBy}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">{formatQar(cy)}</td>
                      <td className="p-3 text-right font-mono text-slate-500">{formatQar(py)}</td>
                      <td className="p-3 text-right font-mono text-emerald-700 font-semibold">+{variancePct}%</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          f.riskStratum === 'RED'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : f.riskStratum === 'AMBER'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {f.riskStratum}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedFsliId(f.id);
                            setActiveView('workprograms');
                          }}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-[11px] transition shadow-xs"
                        >
                          [Audit Workprogram]
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Lower Pane: Balance Sheet */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-700 flex items-center space-x-2">
                <span>Pane 2: Balance Sheet Statement (B/S)</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">QAR Currency</span>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-600 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="p-3">Lock</th>
                  <th className="p-3">FSLI Code &amp; Label</th>
                  <th className="p-3 text-right">CY 2026 (QAR)</th>
                  <th className="p-3 text-right">PY 2025 (QAR)</th>
                  <th className="p-3 text-right">Variance %</th>
                  <th className="p-3 text-center">Risk Stratum</th>
                  <th className="p-3 text-right">Action Launchers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bsFslis.map(f => {
                  const cy = Number(f.currentYear);
                  const py = Number(f.priorYear);
                  const variancePct = py > 0 ? (((cy - py) / py) * 100).toFixed(1) : '—';
                  const isLocked = Boolean(lockedMap[f.id]);

                  return (
                    <tr key={f.id} className="hover:bg-slate-50 transition">
                      <td className="p-3">
                        <button
                          onClick={() => handleToggleCheckout(f)}
                          className={`p-1.5 rounded-lg border transition ${
                            isLocked
                              ? 'bg-amber-100 border-amber-300 text-amber-800'
                              : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-900'
                          }`}
                          title={isLocked ? `Locked by ${lockedMap[f.id]?.lockedBy}` : 'Click to lock row for testing'}
                        >
                          {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-[11px] text-blue-600 font-bold mr-2">{f.code}</span>
                        <span className="font-bold text-slate-900">{f.label}</span>
                        {isLocked && (
                          <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                            Checked out: {lockedMap[f.id]?.lockedBy}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">{formatQar(cy)}</td>
                      <td className="p-3 text-right font-mono text-slate-500">{formatQar(py)}</td>
                      <td className="p-3 text-right font-mono text-emerald-700 font-semibold">+{variancePct}%</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          f.riskStratum === 'RED'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : f.riskStratum === 'AMBER'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {f.riskStratum}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        {f.code === 'AST-02' && (
                          <button
                            onClick={() => {
                              setSelectedFsliId(f.id);
                              setSamplingModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg text-[11px] transition shadow-xs"
                          >
                            [AR Test / Sampling]
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedFsliId(f.id);
                            setActiveView('workprograms');
                          }}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-[11px] transition shadow-xs"
                        >
                          [Audit Workprogram]
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── VIEW: SUBSTANTIVE WORKPROGRAMS & HYBRID EVIDENCE ────────────────── */}
      {activeView === 'workprograms' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <span className="text-[10px] font-mono text-blue-600 font-bold uppercase">
                Active FSLI Workprogram: {selectedFsli?.code}
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">{selectedFsli?.label}</h3>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setSamplingModalOpen(true)}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-xs"
              >
                <Calculator className="w-3.5 h-3.5 text-blue-600" />
                <span>Launch Sampling Calculator (MUS)</span>
              </button>
              <button
                onClick={handleAddAdHoc}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Insert Ad-Hoc Step</span>
              </button>
            </div>
          </div>

          {/* Procedures list */}
          <div className="space-y-4">
            {selectedFsli?.workPrograms?.[0]?.procedures?.map((proc: any) => {
              const isSubmitted = proc.status === 'SUBMITTED';
              const isUnderRework = proc.status === 'UNDER_REWORK';
              const isCleared = proc.status === 'CLEARED';

              return (
                <div
                  key={proc.id}
                  className={`p-5 rounded-2xl border transition shadow-xs ${
                    isUnderRework
                      ? 'bg-rose-50/50 border-rose-300'
                      : isCleared
                      ? 'bg-emerald-50/30 border-emerald-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs text-blue-600 font-bold">{proc.ref}</span>
                        <h4 className="text-sm font-bold text-slate-900">{proc.title}</h4>
                        {proc.adHoc && (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[10px] font-semibold">
                            Ad-Hoc Step
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{proc.instructions}</p>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                      isUnderRework
                        ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                        : isCleared
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : isSubmitted
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {proc.status}
                    </span>
                  </div>

                  {/* Assertion badges */}
                  <div className="mt-3 flex items-center space-x-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Assertions:</span>
                    {proc.assertions?.map((ass: string) => (
                      <span
                        key={ass}
                        className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] text-slate-700 font-mono"
                      >
                        {ass}
                      </span>
                    ))}
                  </div>

                  {/* Hybrid Evidence Linking Section */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-700 flex items-center space-x-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                      <span>Hybrid Evidence Attachments (Digital PDF/Excel + Physical Binder Indices):</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {proc.evidence?.map((ev: any) => (
                        <div
                          key={ev.id}
                          className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between"
                        >
                          <div className="space-y-0.5">
                            <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                              {ev.kind === 'DIGITAL' ? 'Digital Document' : 'Physical Binder Archive'}
                            </div>
                            <div className="text-slate-900 font-medium text-xs">{ev.description}</div>
                            {ev.physicalIndex && (
                              <div className="text-[11px] text-amber-800 font-mono font-semibold">
                                Binder Code: {ev.physicalIndex} • {ev.physicalBox} • {ev.physicalShelf}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Review Notes Loop display if under rework */}
                  {isUnderRework && proc.reviewNotes?.length > 0 && (
                    <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1 text-xs">
                      <div className="flex items-center space-x-1.5 text-rose-800 font-bold">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Mandatory Managerial Rework Flag:</span>
                      </div>
                      <div className="text-rose-900 pl-5 italic font-medium">
                        &quot;{proc.reviewNotes[0]?.text}&quot;
                      </div>
                    </div>
                  )}

                  {/* Action buttons based on Role */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end space-x-3">
                    {userRole === 'PREPARER' && !isSubmitted && !isCleared && (
                      <button
                        onClick={() => handleProcedureStatusChange(proc.id, 'SUBMITTED')}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition shadow-sm flex items-center space-x-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Submit for Manager Review</span>
                      </button>
                    )}

                    {(userRole === 'REVIEWER' || userRole === 'APPROVER') && (
                      <>
                        <button
                          onClick={() =>
                            setRejectionModalProc({
                              id: proc.id,
                              ref: proc.ref,
                              title: proc.title,
                              assigned: 'Tariq Al-Mansoor'
                            })
                          }
                          className="px-3 py-1.5 bg-rose-50 border border-rose-300 hover:bg-rose-100 text-rose-800 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reject &amp; Enforce Rework</span>
                        </button>

                        <button
                          onClick={() => handleProcedureStatusChange(proc.id, 'CLEARED')}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition shadow-sm flex items-center space-x-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Clear Procedure</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── VIEW: CONFIRMATIONS DASHBOARD ──────────────────────────────────── */}
      {activeView === 'confirmations' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">External Confirmations Dashboard &amp; Gatekeeper (ISA 505)</h3>
              <p className="text-xs text-slate-500">
                Tracking Bank, Accounts Receivable, Accounts Payable, and Legal Letters.
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Critical Outstanding Blocker: <span className="text-emerald-700 font-bold">0 Pending</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="p-3">Type</th>
                  <th className="p-3">Counterparty Institution</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3">Outcome Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {confirmations.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-semibold text-blue-700">{c.type}</td>
                    <td className="p-3 text-slate-900 font-medium">{c.counterparty}</td>
                    <td className="p-3 text-slate-500 font-mono">25 Sep 2026</td>
                    <td className="p-3">
                      {c.critical ? (
                        <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px] font-bold">
                          Critical Blocker
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Standard</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {c.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 text-[11px]">{c.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── VIEW: SUMMARY REVIEW MEMORANDUM (SRM) ───────────────────────────── */}
      {activeView === 'srm' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Summary Review Memorandum (SRM) — ISA 220 / 330</h3>
              <p className="text-xs text-slate-500">
                Aggregates unadjusted differences against SAD/PM, AJEs, significant accounting estimates, and manager recommendation.
              </p>
            </div>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
              SRM Compiled &amp; Cleared
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Unadjusted Audit Differences</div>
              <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">4,200 QAR</div>
              <div className="text-[11px] text-slate-500 mt-1">Below SAD Threshold (10,800 QAR) • Clearly Trivial</div>
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Adjusted Journal Entries (AJEs)</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">1 Entry (120,000 QAR)</div>
              <div className="text-[11px] text-slate-500 mt-1">Labor dispute legal provision booked by client</div>
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Open Critical Red Risks</div>
              <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">0 Open</div>
              <div className="text-[11px] text-slate-500 mt-1">All Red risk areas cleared for Partner approval</div>
            </div>
          </div>
        </div>
      )}

      {/* Sampling Calculator Modal */}
      <SamplingCalculatorModal
        isOpen={samplingModalOpen}
        onClose={() => setSamplingModalOpen(false)}
        fsliLabel={selectedFsli?.label ?? 'Trade Receivables & Retentions'}
        tolerableErrorQar={175500}
      />

      {/* Rejection Modal */}
      {rejectionModalProc && (
        <ReviewNoteRejectionModal
          isOpen={Boolean(rejectionModalProc)}
          onClose={() => setRejectionModalProc(null)}
          procedureRef={rejectionModalProc.ref}
          procedureTitle={rejectionModalProc.title}
          assignedUserName={rejectionModalProc.assigned}
          onSubmit={reason => {
            handleProcedureStatusChange(rejectionModalProc.id, 'UNDER_REWORK');
            onRejectProcedure?.(rejectionModalProc.id, reason);
            setRejectionModalProc(null);
          }}
        />
      )}
    </div>
  );
}
