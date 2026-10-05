'use client';

import React, { useState } from 'react';
import {
  Building2,
  Users,
  FileText,
  Key,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Send,
  Download,
  Share2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
  Sparkles
} from 'lucide-react';
import { formatQar, formatDate } from '@/lib/utils';

interface Module1CommercialProps {
  userRole: string;
  clients: any[];
  leads: any[];
  dualKeyGate: any;
  engagement: any;
  onClearDualKey?: (keyNum: 1 | 2) => void;
  onRecordAdvance?: () => void;
}

export function Module1Commercial({
  userRole,
  clients,
  leads,
  dualKeyGate,
  engagement,
  onClearDualKey,
  onRecordAdvance
}: Module1CommercialProps) {
  const [activeTab, setActiveTab] = useState<'dualkey' | 'registry' | 'proposals' | 'billing' | 'pipeline'>('dualkey');
  const [selectedProposalMode, setSelectedProposalMode] = useState<'Brief Quotation' | 'Comprehensive Technical Proposal'>('Comprehensive Technical Proposal');
  const [showOrgDetails, setShowOrgDetails] = useState<boolean>(true);

  const holding = clients.find(c => c.relationship === 'HOLDING') ?? clients[0];
  const subsidiaries = clients.filter(c => c.relationship === 'SUBSIDIARY');

  const key1Active = Boolean(dualKeyGate?.key1Approved);
  const key2Active = Boolean(dualKeyGate?.key2Approved);
  const advanceSettled = Number(engagement?.advanceRecordedQar ?? 0) >= Number(engagement?.advanceRequiredQar ?? 60000);

  return (
    <div className="space-y-6">
      {/* Sub-navigation tabs */}
      <div className="flex border-b border-slate-200 space-x-2 pb-2 text-xs">
        <button
          onClick={() => setActiveTab('dualkey')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeTab === 'dualkey'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>Dual-Key Acceptance Gate (ISA 220)</span>
          {(!key1Active || !key2Active) && (
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('registry')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeTab === 'registry'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Client Registry &amp; Org Tree</span>
        </button>

        <button
          onClick={() => setActiveTab('proposals')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeTab === 'proposals'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Proposal Engine (50/50 Terms)</span>
        </button>

        <button
          onClick={() => setActiveTab('billing')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeTab === 'billing'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>ISA 210 Letter &amp; 50% Advance</span>
          {advanceSettled ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('pipeline')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            activeTab === 'pipeline'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Multi-Channel Ingestion Pipeline</span>
        </button>
      </div>

      {/* ── TAB: DUAL KEY GATEKEEPER ────────────────────────────────────────── */}
      {activeTab === 'dualkey' && (
        <div className="space-y-6">
          <div className="p-5 bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white border border-blue-200 rounded-2xl flex items-center justify-between shadow-xs">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 px-2 py-0.5 bg-blue-100 rounded-full border border-blue-200">
                ISA 220 Quality Management Gatekeeper
              </span>
              <h3 className="text-base font-bold text-slate-900">Dual-Key Acceptance Hard-Blocker</h3>
              <p className="text-xs text-slate-600 max-w-2xl">
                The engagement cannot advance to Advance Billing, Planning, or Fieldwork until BOTH Key 1 (Client Commercial Quote Acceptance) and Key 2 (Engagement Partner AML/KYC Sign-Off) are marked active.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Gatekeeper Status</div>
              <div className={`text-sm font-bold mt-1 ${key1Active && key2Active ? 'text-emerald-700' : 'text-amber-700'}`}>
                {key1Active && key2Active ? 'CLEARED & UNLOCKED' : 'PENDING DUAL SIGN-OFF'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Key 1: Client Quote Acceptance */}
            <div className={`p-6 rounded-2xl border transition shadow-xs ${
              key1Active
                ? 'bg-white border-emerald-300 shadow-emerald-500/5'
                : 'bg-white border-amber-300'
            }`}>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-xl border ${
                    key1Active
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-amber-50 border-amber-200 text-amber-700'
                  }`}>
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Key 1: Client Commercial Acceptance</h4>
                    <p className="text-[11px] text-slate-500">Formal sign-off on 120,000 QAR fee with 50/50 terms</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  key1Active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}>
                  {key1Active ? 'Active / Approved' : 'Pending Client'}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Approved Revision:</span>
                  <span className="font-mono text-slate-900 font-medium">Revision #1</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Agreed Audit Fee:</span>
                  <span className="font-mono text-emerald-700 font-bold">{formatQar(120000)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Payment Milestones:</span>
                  <span className="text-slate-900">50% Advance (60k) / 50% Final Release (60k)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Evidence Attached:</span>
                  <span className="font-mono text-blue-600 flex items-center space-x-1 font-medium">
                    <span>Signed-Proposal-Letter-DohaPearl-2026.pdf</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
                {key1Active ? (
                  <div className="text-xs text-emerald-700 flex items-center space-x-1.5 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Client commercial acceptance logged</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onClearDualKey?.(1)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow-sm transition flex items-center space-x-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm Client Quote Acceptance</span>
                  </button>
                )}
              </div>
            </div>

            {/* Key 2: Partner AML / KYC Sign-Off */}
            <div className={`p-6 rounded-2xl border transition shadow-xs ${
              key2Active
                ? 'bg-white border-emerald-300 shadow-emerald-500/5'
                : 'bg-white border-amber-300'
            }`}>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-xl border ${
                    key2Active
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-amber-50 border-amber-200 text-amber-700'
                  }`}>
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Key 2: Partner AML/KYC Clearance</h4>
                    <p className="text-[11px] text-slate-500">ISA 220 &amp; QCB Ultimate Beneficial Owner (UBO) verification</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  key2Active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}>
                  {key2Active ? 'Active / Cleared' : 'Pending Partner'}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Screening Track:</span>
                  <span className="font-semibold text-slate-900">Track A (New Client Onboarding)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">PEP &amp; Sanctions Match:</span>
                  <span className="text-emerald-700 font-semibold">Zero Matches (QCB Registry Verified)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">UBO Declaration:</span>
                  <span className="text-slate-900 font-medium">Al Rayyan Global Holdings (100% Parent)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Signing Partner:</span>
                  <span className="text-blue-700 font-medium">Sheikh Khalid Al-Thani (Partner #QA-4412)</span>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
                {key2Active ? (
                  <div className="text-xs text-emerald-700 flex items-center space-x-1.5 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Partner AML/KYC risk clearance sealed</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onClearDualKey?.(2)}
                    disabled={userRole !== 'APPROVER'}
                    className={`px-4 py-2 font-semibold rounded-xl text-xs transition flex items-center space-x-1.5 ${
                      userRole === 'APPROVER'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{userRole === 'APPROVER' ? 'Execute Partner Sign-Off' : 'Requires APPROVER Persona'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: CLIENT REGISTRY & ORG TREE ─────────────────────────────────── */}
      {activeTab === 'registry' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Client Entity Registry &amp; Multi-Tier Organizational Tree</h3>
              <p className="text-xs text-slate-500">
                Hierarchical parent-subsidiary governance in State of Qatar (MOCI CR &amp; General Tax Authority TIN).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tree view */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Corporate Hierarchy</span>
              </div>

              {/* Holding Node */}
              <div className="p-3.5 bg-slate-50 border border-blue-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                    Holding Entity
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">CR: {holding?.crNumber}</span>
                </div>
                <div className="text-sm font-bold text-slate-900">{holding?.legalName}</div>
                <div className="text-xs text-slate-500">{holding?.legalNameArabic}</div>
              </div>

              {/* Subsidiary tree branches */}
              <div className="pl-4 border-l-2 border-slate-200 space-y-3">
                {subsidiaries.map(sub => (
                  <div
                    key={sub.id}
                    className={`p-3 rounded-xl border text-xs transition ${
                      sub.id === 'cli-dohapearl-01'
                        ? 'bg-blue-50/60 border-blue-300 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-500">Subsidiary (100%)</span>
                      <span className="font-mono text-[10px] text-slate-400">CR: {sub.crNumber}</span>
                    </div>
                    <div className="font-bold text-xs mt-1 text-slate-900">{sub.legalName}</div>
                    <div className="text-[11px] text-slate-500">{sub.legalNameArabic}</div>
                    {sub.id === 'cli-dohapearl-01' && (
                      <div className="mt-2 text-[10px] text-emerald-700 font-semibold flex items-center space-x-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Active Audit Engagement Subject</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Entity detail & Role-based contact routing */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Doha Pearl Contracting W.L.L. (Profile)</h4>
                    <p className="text-xs text-slate-500">Primary operating entity under statutory ISA financial audit</p>
                  </div>
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
                    Status: ACTIVE
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Commercial Reg (CR)</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">104829</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Tax ID (TIN / GTA)</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">0001048290001</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Jurisdiction</span>
                    <span className="font-bold text-slate-900 text-sm">State of Qatar</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Industry</span>
                    <span className="font-bold text-slate-900 text-sm">Grade A Construction</span>
                  </div>
                </div>

                <div className="pt-2">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-3">
                    Role-Based Communication Routing Matrix (Spec §4.1.1)
                  </h5>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-900">Eng. Nasser Al-Attiyah</div>
                        <div className="text-[11px] text-slate-500">Managing Director / Board Member</div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-semibold">
                          MANAGING_DIRECTOR
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1">Receives: Proposals, Engagement Letters, Final Reports</div>
                      </div>
                    </div>

                    <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-900">Rashid Al-Nuaimi</div>
                        <div className="text-[11px] text-slate-500">Chief Financial Officer (CFO)</div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-semibold">
                          CFO
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1">Receives: Invoices, Fee Notes, Payment Receipts</div>
                      </div>
                    </div>

                    <div className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-slate-900">Omar Farooq</div>
                        <div className="text-[11px] text-slate-500">Chief Accountant &amp; Audit Liaison</div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[10px] font-semibold">
                          AUDIT_LIAISON
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1">Receives: PBC Requests, Working Paper Queries</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: PROPOSALS ──────────────────────────────────────────────────── */}
      {activeTab === 'proposals' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Proposal Engine (Brief Quotation &amp; Technical Proposal)</h3>
              <p className="text-xs text-slate-500">
                Auto-merged vector proposals with mandatory 50/50 payment milestone terms.
              </p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setSelectedProposalMode('Brief Quotation')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  selectedProposalMode === 'Brief Quotation'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                Brief Quotation (1-2 pgs)
              </button>
              <button
                onClick={() => setSelectedProposalMode('Comprehensive Technical Proposal')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  selectedProposalMode === 'Comprehensive Technical Proposal'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                Comprehensive Technical (Full Deck)
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-mono text-blue-600 font-bold uppercase tracking-wider">
                  Proposal Ref: PROP-2026-001 (Rev 1)
                </span>
                <h4 className="text-lg font-bold text-slate-900 mt-1">
                  Statutory External Audit &amp; IFRS Compliance Services - FY 2026
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Client: <span className="text-slate-900 font-medium">Doha Pearl Contracting W.L.L.</span> • Terms: <span className="text-emerald-700 font-semibold">50/50 Payment Schedule</span>
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Total Fixed Audit Fee</div>
                <div className="text-2xl font-bold font-mono text-emerald-700">{formatQar(120000)}</div>
                <div className="text-[11px] text-slate-500">50% Advance: {formatQar(60000)}</div>
              </div>
            </div>

            {/* Scope & line items */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Phase / Deliverable Description</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Fee (QAR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  <tr>
                    <td className="p-3 text-slate-800">
                      Phase 1: Planning, Internal Controls Assessment &amp; Materiality Stratification (ISA 315/320)
                    </td>
                    <td className="p-3 text-center text-slate-500">1</td>
                    <td className="p-3 text-right font-mono text-slate-900 font-semibold">{formatQar(35000)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-slate-800">
                      Phase 2: Substantive Year-End Audit Procedures &amp; Construction Contract Testing (IFRS 15)
                    </td>
                    <td className="p-3 text-center text-slate-500">1</td>
                    <td className="p-3 text-right font-mono text-slate-900 font-semibold">{formatQar(65000)}</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-slate-800">
                      Phase 3: ISA 700 Deliverables Package, Management Letter &amp; Tax Pack Support
                    </td>
                    <td className="p-3 text-center text-slate-500">1</td>
                    <td className="p-3 text-right font-mono text-slate-900 font-semibold">{formatQar(20000)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => alert('Vector PDF Proposal generated. Branded with firm credentials, team profiles, and ISA methodology.')}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Branded PDF</span>
              </button>
              <button
                onClick={() => alert('Proposal dispatched via Email & WhatsApp to Nasser Al-Attiyah and Rashid Al-Nuaimi.')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center space-x-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Dispatch via Email / WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: BILLING & ADVANCE ───────────────────────────────────────────── */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">ISA 210 Engagement Letter &amp; 50% Advance Billing</h3>
              <p className="text-xs text-slate-500">
                Payment confirmation triggers automated official receipt voucher and provisions the isolated Client PBC Portal.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Advance Invoice Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-mono text-blue-600 font-semibold">INV-2026-001</span>
                  <h4 className="text-sm font-bold text-slate-900">50% Advance Payment Invoice</h4>
                </div>
                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-semibold">
                  Terms: 50% Advance
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Contracted Fee:</span>
                  <span className="font-mono text-slate-900">{formatQar(120000)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Advance Amount Due (50%):</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">{formatQar(60000)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Recipient Contact:</span>
                  <span className="text-slate-900 font-medium">Rashid Al-Nuaimi (CFO)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Wire Bank:</span>
                  <span className="text-slate-700">QNB West Bay Main • IBAN: QA91QNBA0000000010482910</span>
                </div>
              </div>
            </div>

            {/* Official Receipt & Provisioning */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-mono text-emerald-700 font-semibold">RCPT-2026-001</span>
                  <h4 className="text-sm font-bold text-slate-900">Payment Receipt Voucher</h4>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
                  Status: SETTLED
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Settled Amount:</span>
                  <span className="font-mono font-bold text-emerald-700">{formatQar(60000)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Payment Instrument:</span>
                  <span className="text-slate-900 font-medium">QNB Direct Swift MT103 Wire Transfer</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Client PBC Portal:</span>
                  <span className="text-emerald-700 font-semibold flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Auto-Provisioned &amp; Tokenized</span>
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Initial Credentials:</span>
                  <span className="text-slate-500">Temporary token dispatched; password reset enforced on first login</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: PIPELINE ───────────────────────────────────────────────────── */}
      {activeTab === 'pipeline' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">Multi-Channel Intake Ingestion (Phone, WhatsApp, Email, Web)</h3>
            <span className="text-xs text-slate-500">{leads.length} Active Leads</span>
          </div>

          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs">
            {leads.map(l => (
              <div key={l.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50 transition">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900">{l.companyName}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                      {l.channel}
                    </span>
                  </div>
                  <div className="text-slate-600">Contact: {l.contactName} ({l.contactEmail})</div>
                  <div className="text-[11px] text-slate-400 italic">&quot;{l.notes}&quot;</div>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Stage: {l.stage}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
