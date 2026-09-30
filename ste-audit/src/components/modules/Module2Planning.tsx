'use client';

import React, { useState } from 'react';
import {
  FolderTree,
  Calendar,
  ShieldCheck,
  Calculator,
  CheckCircle2,
  Clock,
  UserCheck,
  FileCheck2,
  Stamp,
  ArrowRight
} from 'lucide-react';
import { MaterialityEngineView } from './MaterialityEngineView';
import { ENGAGEMENT_FOLDER_TAXONOMY } from '@/domain/constants';
import { formatDate } from '@/lib/utils';

interface Module2PlanningProps {
  userRole: string;
  engagement: any;
  acceptance: any;
  folders: any[];
  staffing: any[];
  materiality: any[];
}

export function Module2Planning({
  userRole,
  engagement,
  acceptance,
  folders,
  staffing,
  materiality
}: Module2PlanningProps) {
  const [subTab, setSubTab] = useState<'materiality' | 'screening' | 'taxonomy' | 'scheduling'>('materiality');
  const [partnerCleared, setPartnerCleared] = useState<boolean>(acceptance?.decision === 'ACCEPTED');

  return (
    <div className="space-y-6">
      {/* Sub-navigation tabs */}
      <div className="flex border-b border-slate-200 space-x-2 pb-2 text-xs">
        <button
          onClick={() => setSubTab('materiality')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            subTab === 'materiality'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>ISA 320 Materiality Engine</span>
        </button>

        <button
          onClick={() => setSubTab('screening')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            subTab === 'screening'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Acceptance &amp; Continuance Risk Gate</span>
        </button>

        <button
          onClick={() => setSubTab('taxonomy')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            subTab === 'taxonomy'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5" />
          <span>5-Tier Directory Taxonomy</span>
        </button>

        <button
          onClick={() => setSubTab('scheduling')}
          className={`px-3 py-2 rounded-xl font-medium transition flex items-center space-x-1.5 ${
            subTab === 'scheduling'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Resource Scheduling &amp; Gantt Milestones</span>
        </button>
      </div>

      {/* ── SUB-TAB: MATERIALITY ────────────────────────────────────────────── */}
      {subTab === 'materiality' && (
        <MaterialityEngineView
          userRole={userRole}
          currentRevision={
            materiality[0]
              ? {
                  benchmark: materiality[0].benchmark,
                  benchmarkValue: Number(materiality[0].benchmarkValue),
                  materialityRate: Number(materiality[0].materialityRate),
                  planningMateriality: Number(materiality[0].planningMateriality),
                  tolerableErrorRate: Number(materiality[0].tolerableErrorRate),
                  tolerableError: Number(materiality[0].tolerableError),
                  sadRate: Number(materiality[0].sadRate),
                  sadThreshold: Number(materiality[0].sadThreshold),
                  rationale: materiality[0].rationale
                }
              : undefined
          }
        />
      )}

      {/* ── SUB-TAB: ACCEPTANCE & RISK SCREENING ────────────────────────────── */}
      {subTab === 'screening' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Acceptance &amp; Continuance Risk Gatekeeper (ISA 220)</h3>
              <p className="text-xs text-slate-500">
                Track A (New Client) &amp; Track B (Recurring Client) integrity, KYC, and conflict verification.
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              partnerCleared ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              {partnerCleared ? 'Cleared & Approved' : 'Partner Sign-off Required'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Screening Checklist (Track A: New Client Onboarding)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {[
                  { label: 'UBO Beneficial Ownership Verified', desc: 'QCB Registry confirmation obtained', status: true },
                  { label: 'AML & PEP Sanctions Clearance', desc: 'Zero adverse regulatory listings', status: true },
                  { label: 'Management Integrity Assessed', desc: 'No fraud or litigation records', status: true },
                  { label: 'Firm Independence Confirmed', desc: 'No financial or personal entanglements', status: true },
                  { label: 'Conflict of Interest Checks', desc: 'Cross-checked against existing client base', status: true },
                  { label: 'Financial Viability & Credit', desc: 'Audited statements show solvent ongoing trade', status: true }
                ].map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start space-x-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900 text-xs">{item.label}</div>
                      <div className="text-[11px] text-slate-500">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                <div className="text-slate-600 font-semibold uppercase text-[10px] tracking-wider">Acceptance Conditions</div>
                <div className="text-slate-700">
                  • Direct construction contract verifications for projects exceeding 15M QAR.
                  <br />
                  • Mandatory positive circularization of top 5 subcontractors and operating bank accounts.
                </div>
              </div>
            </div>

            {/* Partner Gate execution */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 flex flex-col justify-between shadow-xs">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                  Partner Electronic Signature Gate
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Project launch and fieldwork workprograms remain hard-blocked until the Engagement Partner applies their digital signature to the acceptance memo.
                </p>

                <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="text-slate-500 text-[11px]">Signing Partner:</div>
                  <div className="font-bold text-slate-900">Sheikh Khalid Al-Thani</div>
                  <div className="text-[10px] text-slate-400 font-mono">QICPA Lic: #QA-4412</div>
                  <div className="text-[11px] text-emerald-700 mt-2 flex items-center space-x-1 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Risk Rating: MEDIUM (Approved)</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                {partnerCleared ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center space-x-2 font-medium">
                    <Stamp className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>Electronic signature applied &amp; locked</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setPartnerCleared(true)}
                    disabled={userRole !== 'APPROVER'}
                    className={`w-full py-2.5 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-2 ${
                      userRole === 'APPROVER'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    }`}
                  >
                    <Stamp className="w-4 h-4" />
                    <span>{userRole === 'APPROVER' ? 'Execute Partner Sign-off' : 'Requires APPROVER Persona'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-TAB: 5-TIER DIRECTORY TAXONOMY ──────────────────────────────── */}
      {subTab === 'taxonomy' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">5-Tier Directory Taxonomy Provisioning (§4.2.3)</h3>
              <p className="text-xs text-slate-500">
                Automated directory structure synchronized with SharePoint Online / Graph API &amp; local storage.
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 font-semibold">
              5/5 Tiers Provisioned
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {ENGAGEMENT_FOLDER_TAXONOMY.map((folderName, idx) => (
              <div
                key={folderName}
                className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 hover:border-blue-400 hover:shadow-xs transition"
              >
                <div className="p-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl w-fit">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Tier 0{idx + 1}</div>
                  <h4 className="text-xs font-bold text-slate-900 mt-0.5 leading-snug">{folderName}</h4>
                </div>
                <div className="text-[11px] text-slate-600">
                  {idx === 0 && 'Acceptance, engagement letters, planning memos, risk rating.'}
                  {idx === 1 && 'Trial balance, lead schedules, fuzzy mapping memory.'}
                  {idx === 2 && 'Substantive testing, confirmations, physical binder indices.'}
                  {idx === 3 && 'Draft financial statements, SRM, review notes.'}
                  {idx === 4 && 'Certified PDFs, signed deliverables, 60-day file lock.'}
                </div>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-emerald-700 font-medium">
                  <span className="flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Provisioned</span>
                  </span>
                  <span className="text-slate-400 font-mono">Sync: OK</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SUB-TAB: SCHEDULING & GANTT ────────────────────────────────────── */}
      {subTab === 'scheduling' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-900">Resource Allocation &amp; Milestone Calendar</h3>
              <p className="text-xs text-slate-500">
                Staff allocation across planning, fieldwork, review, and reporting relative to statutory deadlines.
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Statutory Cutoff: <span className="font-bold text-amber-700">30 Nov 2026</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-6 shadow-xs">
            {/* Visual Milestones Bar */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Statutory Milestones Timeline</div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-semibold">15 Aug 2026</div>
                  <div className="font-bold text-slate-900 mt-0.5">Planning &amp; Materiality</div>
                  <div className="text-[10px] text-emerald-700 font-semibold mt-1">Completed</div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-300 rounded-xl shadow-xs">
                  <div className="text-[10px] text-blue-700 font-semibold">01 Sep – 15 Oct 2026</div>
                  <div className="font-bold text-slate-900 mt-0.5">Fieldwork &amp; Substantive</div>
                  <div className="text-[10px] text-blue-700 mt-1 font-semibold flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>In Progress</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-semibold">15 Oct – 25 Oct 2026</div>
                  <div className="font-bold text-slate-700 mt-0.5">Manager Review &amp; SRM</div>
                  <div className="text-[10px] text-slate-400 mt-1">Upcoming</div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-semibold">01 Nov 2026</div>
                  <div className="font-bold text-slate-700 mt-0.5">Final Certified Release</div>
                  <div className="text-[10px] text-slate-400 mt-1">Target Issuance</div>
                </div>
              </div>
            </div>

            {/* Staff Allocation Table */}
            <div>
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Team Allocation &amp; Budgeted Hours</div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Auditor / Persona</th>
                      <th className="p-3">Assigned Role</th>
                      <th className="p-3">Audit Phase</th>
                      <th className="p-3 text-right">Standard Rate</th>
                      <th className="p-3 text-right">Planned Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {staffing.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-semibold text-slate-900">
                          {s.chargeOutRole === 'PARTNER' && 'Sheikh Khalid Al-Thani'}
                          {s.chargeOutRole === 'MANAGER' && 'Fatima Al-Kuwari'}
                          {s.chargeOutRole === 'SENIOR' && 'Ahmed Mansoor'}
                          {s.chargeOutRole === 'JUNIOR' && 'Tariq Al-Mansoor'}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            {s.chargeOutRole}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700">{s.phase}</td>
                        <td className="p-3 text-right font-mono text-slate-700">
                          {s.chargeOutRole === 'PARTNER' && '1,000 QAR/hr'}
                          {s.chargeOutRole === 'MANAGER' && '750 QAR/hr'}
                          {s.chargeOutRole === 'SENIOR' && '500 QAR/hr'}
                          {s.chargeOutRole === 'JUNIOR' && '200 QAR/hr'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">{Number(s.plannedHours)} hrs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
