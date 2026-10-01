'use client';

import React, { useState } from 'react';
import {
  FileCheck2,
  Stamp,
  Lock,
  Unlock,
  Download,
  Send,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Clock,
  History,
  Hash,
  ExternalLink
} from 'lucide-react';
import { OPINIONS, OPINION_REPORT_LABEL, DELIVERABLE_PARTS, MIN_MODIFIED_OPINION_RATIONALE } from '@/domain/constants';
import { formatQar } from '@/lib/utils';

interface Module4ReportingProps {
  userRole: string;
  engagement: any;
  fslis: any[];
  onApplySignature?: (opinion: string, rationale: string, affectedFslis: string[]) => void;
  onLockArchive?: () => void;
}

export function Module4Reporting({
  userRole,
  engagement,
  fslis,
  onApplySignature,
  onLockArchive
}: Module4ReportingProps) {
  const [activeTab, setActiveTab] = useState<'opinion' | 'bundle' | 'lock'>('opinion');
  const [selectedOpinion, setSelectedOpinion] = useState<'Clean' | 'Qualified' | 'Disclaimer' | 'Adverse'>('Clean');
  const [affectedFslis, setAffectedFslis] = useState<string[]>([]);
  const [basisRationale, setBasisRationale] = useState<string>(
    'In our opinion, the accompanying financial statements present fairly, in all material respects, the financial position of Doha Pearl Contracting W.L.L. as at December 31, 2026, and its financial performance and cash flows for the year then ended in accordance with International Financial Reporting Standards (IFRS) and the Qatar Commercial Companies Law.'
  );
  const [signatureApplied, setSignatureApplied] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(engagement?.state === 'ARCHIVED_READ_ONLY');

  const isNonClean = selectedOpinion !== 'Clean';
  const rationaleValid = !isNonClean || basisRationale.trim().length >= MIN_MODIFIED_OPINION_RATIONALE;
  const fslisValid = !isNonClean || affectedFslis.length > 0;

  const handleApplyPartnerSignature = () => {
    if (!rationaleValid || !fslisValid) return;
    setSignatureApplied(true);
    onApplySignature?.(selectedOpinion, basisRationale, affectedFslis);
    alert('Partner Digital Signature & Cryptographic Seal applied to certified deliverable bundle.');
  };

  const handleLockNow = () => {
    setIsLocked(true);
    onLockArchive?.();
    alert('ISA 230 Regulatory File Lock executed. Engagement is now permanently Read-Only.');
  };

  return (
    <div className="space-y-6">
      {/* Sub navigation */}
      <div className="flex border-b border-slate-200 space-x-2 pb-2 text-xs">
        <button
          onClick={() => setActiveTab('opinion')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeTab === 'opinion'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Stamp className="w-3.5 h-3.5" />
          <span>ISA 700 / 705 Audit Opinion &amp; Digital Seal</span>
        </button>

        <button
          onClick={() => setActiveTab('bundle')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeTab === 'bundle'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>Mandatory 5-Part Commercial Deliverables</span>
        </button>

        <button
          onClick={() => setActiveTab('lock')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeTab === 'lock'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>ISA 230 60-Day Lock &amp; Audit Trail</span>
          {isLocked && <span className="w-2 h-2 rounded-full bg-emerald-600" />}
        </button>
      </div>

      {/* ── TAB: OPINION BUILDER ────────────────────────────────────────────── */}
      {activeTab === 'opinion' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">ISA 700 / 705 Audit Opinion Engine &amp; Digital Credentials</h3>
              <p className="text-xs text-slate-500">
                Partner electronic sign-off embeds verified digital signature and firm seal onto certified financial statements.
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              signatureApplied ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              {signatureApplied ? 'Certified & Signed' : 'Pending Partner Signature'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Opinion Selection Form */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-5 shadow-xs">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                  Select Opinion Category (ISA 700 / 705)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['Clean', 'Qualified', 'Disclaimer', 'Adverse'] as const).map(op => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => {
                        setSelectedOpinion(op);
                        if (op === 'Clean') {
                          setBasisRationale(
                            'In our opinion, the accompanying financial statements present fairly, in all material respects, the financial position of Doha Pearl Contracting W.L.L. as at December 31, 2026, and its financial performance and cash flows for the year then ended in accordance with International Financial Reporting Standards (IFRS) and the Qatar Commercial Companies Law.'
                          );
                        } else {
                          setBasisRationale('');
                        }
                      }}
                      className={`p-3 rounded-xl border text-left transition ${
                        selectedOpinion === op
                          ? 'bg-blue-50/80 border-blue-400 text-blue-900 shadow-xs ring-1 ring-blue-400/30'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900">{op}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{OPINION_REPORT_LABEL[op]}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional Qualification Builder if Non-Clean */}
              {isNonClean && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2 text-amber-900 text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Mandatory Conditional Qualification Enforcement</span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-800 mb-1">
                      1. Select Affected FSLI Accounts <span className="text-rose-600">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {fslis.map(f => {
                        const checked = affectedFslis.includes(f.id);
                        return (
                          <label
                            key={f.id}
                            className={`p-2 rounded-lg border flex items-center space-x-2 cursor-pointer transition ${
                              checked
                                ? 'bg-amber-100/70 border-amber-300 text-amber-900'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                if (e.target.checked) setAffectedFslis([...affectedFslis, f.id]);
                                else setAffectedFslis(affectedFslis.filter(id => id !== f.id));
                              }}
                              className="accent-amber-600"
                            />
                            <span className="font-mono text-[11px] font-bold text-slate-900">{f.code}</span>
                            <span className="truncate">{f.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-800 mb-1.5">
                  Basis for {isNonClean ? 'Modified' : 'Unmodified'} Opinion Text <span className="text-rose-600">*</span>
                </label>
                <textarea
                  value={basisRationale}
                  onChange={e => setBasisRationale(e.target.value)}
                  rows={4}
                  placeholder="Enter detailed audit opinion basis rationale..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                />
                {isNonClean && (
                  <div className="text-[11px] text-slate-500 mt-1">
                    Minimum length: {basisRationale.length}/{MIN_MODIFIED_OPINION_RATIONALE} characters required.
                  </div>
                )}
              </div>
            </div>

            {/* Digital Credentials & Seal Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 flex flex-col justify-between shadow-xs">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-3">
                  Partner Seal &amp; Digital Sign-Off
                </h4>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-blue-500 flex items-center justify-center bg-blue-50 text-blue-700 shadow-xs">
                      <Stamp className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">STE Audit Firm Seal</div>
                      <div className="text-[10px] text-slate-500">Doha, State of Qatar • MOCI Reg #8841</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 text-xs space-y-1">
                    <div className="text-slate-500 text-[11px]">Authorized Signatory:</div>
                    <div className="font-bold text-slate-900">Sheikh Khalid Al-Thani</div>
                    <div className="text-[10px] text-slate-500 font-mono">Engagement Partner (ID: QA-4412)</div>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-slate-700 space-y-1">
                  <div className="font-bold text-blue-700 text-[11px]">Report Issuance Details:</div>
                  <div>Jurisdiction: Doha, State of Qatar</div>
                  <div>Currency: Qatari Riyal (QAR)</div>
                  <div>Standards: ISA &amp; IFRS (2026 Edition)</div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                {signatureApplied ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2 font-medium">
                    <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600" />
                    <span>Cryptographic Partner signature applied &amp; deliverables compiled</span>
                  </div>
                ) : (
                  <button
                    onClick={handleApplyPartnerSignature}
                    disabled={userRole !== 'APPROVER' || !rationaleValid || !fslisValid}
                    className={`w-full py-2.5 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-2 ${
                      userRole === 'APPROVER' && rationaleValid && fslisValid
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    }`}
                  >
                    <Stamp className="w-4 h-4" />
                    <span>{userRole === 'APPROVER' ? 'Apply Partner Digital Signature' : 'Requires APPROVER Persona'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: DELIVERABLES BUNDLE ────────────────────────────────────────── */}
      {activeTab === 'bundle' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Mandatory 5-Part Commercial Deliverables Bundle (§4.4.2)</h3>
              <p className="text-xs text-slate-500">
                All 5 parts must be compiled, certified, and issued simultaneously. Uploads freeze automatically upon release.
              </p>
            </div>
            <button
              onClick={() => alert('Deliverable bundle released. Client portal uploads frozen. Final 50% invoice generated.')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center space-x-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Release Bundle &amp; Issue Final Invoice</span>
            </button>
          </div>

          <div className="space-y-3">
            {[
              {
                partNum: 1,
                title: "Independent Auditor's Report & Certified Financial Statements",
                desc: 'Full signed and sealed PDF with balance sheet, P&L, statement of cash flows, and notes.',
                format: 'Certified PDF (A4 Vector)',
                size: '1.4 MB'
              },
              {
                partNum: 2,
                title: 'Management Letter (Observation -> Operating Risk -> Recommendation)',
                desc: 'Internal control deficiencies, IT access segregation findings, and remediation matrix.',
                format: 'Formal Report PDF',
                size: '420 KB'
              },
              {
                partNum: 3,
                title: 'Letter of Representation (LOR)',
                desc: 'Client management representations formally executed on company letterhead.',
                format: 'Executed PDF',
                size: '280 KB'
              },
              {
                partNum: 4,
                title: 'Management Correspondences Audit Trail',
                desc: 'Complete log of queries, bank certificates, confirmations, and auditor communications.',
                format: 'Comprehensive Dossier PDF',
                size: '890 KB'
              },
              {
                partNum: 5,
                title: 'Final Balance Fee Note (Remaining 50% Settlement)',
                desc: 'Automated invoice for remaining 60,000 QAR release under contracted 50/50 payment terms.',
                format: 'Tax Fee Note (QAR 60,000)',
                size: '190 KB'
              }
            ].map(item => (
              <div
                key={item.partNum}
                className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between hover:border-slate-300 shadow-xs transition"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold text-xs">
                    0{item.partNum}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <div className="text-xs font-mono text-emerald-700 font-semibold">{item.format}</div>
                    <div className="text-[10px] text-slate-400">{item.size}</div>
                  </div>
                  <button
                    onClick={() => alert(`Downloading Part 0${item.partNum}: ${item.title}`)}
                    className="p-2 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: REGULATORY FILE LOCK ───────────────────────────────────────── */}
      {activeTab === 'lock' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">ISA 230 Regulatory File Lock &amp; Countdown</h3>
              <p className="text-xs text-slate-500">
                60-day mandatory archive lock period. Permanent transition to immutable Read-Only state.
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              isLocked ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {isLocked ? 'ARCHIVED_READ_ONLY (Terminal)' : 'Countdown Active'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">60-Day Regulatory Countdown</h4>
                  <p className="text-xs text-slate-500">ISA 230 file assembly deadline</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Signature Date:</span>
                  <span className="font-mono text-slate-900 font-medium">30 Sep 2026</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mandatory Lock Date:</span>
                  <span className="font-mono text-amber-800 font-semibold">29 Nov 2026 (60 days)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Remaining Days:</span>
                  <span className="font-mono font-bold text-blue-700">60 Days Remaining</span>
                </div>
              </div>

              <div className="pt-2">
                {isLocked ? (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center space-x-2 font-medium">
                    <Lock className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>File is permanently locked. All edits &amp; mutations strictly disallowed.</span>
                  </div>
                ) : (
                  <button
                    onClick={handleLockNow}
                    disabled={userRole !== 'APPROVER'}
                    className={`w-full py-2.5 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-2 ${
                      userRole === 'APPROVER'
                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                    <span>{userRole === 'APPROVER' ? 'Trigger Immediate Manual Lock (Partner Key)' : 'Partner Key Required for Early Lock'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Cryptographic Hash Audit Trail */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl space-y-4 shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl">
                  <Hash className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Cryptographic Manifest &amp; Audit Trail</h4>
                  <p className="text-xs text-slate-500">SHA-256 chained hash integrity verification</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs font-mono">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Root Manifest Hash:</div>
                <div className="text-emerald-700 break-all text-[11px] font-bold">
                  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
                </div>
                <div className="pt-2 text-[10px] text-slate-500 font-sans">
                  Tamper-evident verification: Every working paper, review note, and deliverable revision is mathematically sealed.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
