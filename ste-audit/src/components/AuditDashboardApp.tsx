'use client';

import React, { useState } from 'react';
import type { RoleKey } from '@/domain/types';
import type { EngagementState } from '@/domain/lifecycle/states';
import { Header } from '@/components/layout/Header';
import { StateStepper } from '@/components/layout/StateStepper';
import { Module1Commercial } from '@/components/modules/Module1Commercial';
import { Module2Planning } from '@/components/modules/Module2Planning';
import { Module3Fieldwork } from '@/components/modules/Module3Fieldwork';
import { Module4Reporting } from '@/components/modules/Module4Reporting';
import { Module5Practice } from '@/components/modules/Module5Practice';
import { ClientPbcPortal } from '@/components/modules/ClientPbcPortal';
import {
  Building2,
  Calendar,
  FileSpreadsheet,
  FileCheck2,
  TrendingUp,
  UploadCloud,
  ShieldCheck,
  AlertTriangle,
  Sparkles
} from 'lucide-react';

interface AuditDashboardAppProps {
  initialData: any;
}

export function AuditDashboardApp({ initialData }: AuditDashboardAppProps) {
  const [currentRole, setCurrentRole] = useState<RoleKey>('APPROVER');
  const [activeModule, setActiveModule] = useState<'m1' | 'm2' | 'm3' | 'm4' | 'm5' | 'client'>('m3');
  const [engagementState, setEngagementState] = useState<EngagementState>(
    initialData?.engagement?.state ?? 'FIELDWORK_EXECUTION'
  );

  const [dualKeyGate, setDualKeyGate] = useState(initialData?.engagement?.dualKeyGate);
  const [fslis, setFslis] = useState(initialData?.engagement?.fsliItems ?? []);
  const [pbcRequests, setPbcRequests] = useState(initialData?.engagement?.pbcRequests ?? []);
  const [notice, setNotice] = useState<{ type: 'success' | 'warn'; msg: string } | null>(null);

  const handleRoleChange = (newRole: RoleKey) => {
    setCurrentRole(newRole);
    if (newRole === 'CLIENT') {
      setActiveModule('client');
      setNotice({
        type: 'warn',
        msg: 'Switched to CLIENT persona (Rashid Al-Nuaimi, CFO). Access restricted strictly to external PBC portal.'
      });
    } else {
      if (activeModule === 'client') setActiveModule('m3');
      setNotice({
        type: 'success',
        msg: `Active persona switched to ${newRole}. RBAC vertical authorization applied.`
      });
    }
  };

  const handleClearDualKey = (keyNum: 1 | 2) => {
    setDualKeyGate((prev: any) => ({
      ...prev,
      [`key${keyNum}Approved`]: true
    }));
    setNotice({
      type: 'success',
      msg: `Dual-Key Gate: Key ${keyNum} confirmed and recorded in audit trail.`
    });
  };

  const handleAdvanceStep = (targetState: EngagementState) => {
    setEngagementState(targetState);
    setNotice({
      type: 'success',
      msg: `Engagement advanced to state: ${targetState}.`
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Header */}
      <Header
        currentRole={currentRole}
        onRoleChange={handleRoleChange}
        clientLegalName={initialData?.engagement?.client?.legalName ?? 'Doha Pearl Contracting W.L.L.'}
        engagementService={initialData?.engagement?.service ?? 'Statutory Financial Audit'}
        reportingYear={initialData?.engagement?.reportingYear ?? 2026}
      />

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* State Machine Stepper */}
        <StateStepper
          currentState={engagementState}
          onSelectState={handleAdvanceStep}
          userRole={currentRole}
        />

        {/* Global Notification Banner */}
        {notice && (
          <div className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between shadow-xs transition animate-in fade-in duration-200 ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 shrink-0 text-blue-600" />
              <span>{notice.msg}</span>
            </div>
            <button
              onClick={() => setNotice(null)}
              className="text-slate-400 hover:text-slate-700 font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Primary Module Navigation Tabs */}
        {currentRole !== 'CLIENT' && (
          <div className="flex border-b border-slate-200 space-x-1 pb-3 text-xs overflow-x-auto">
            <button
              onClick={() => setActiveModule('m1')}
              className={`px-4 py-2.5 rounded-xl font-semibold transition flex items-center space-x-2 ${
                activeModule === 'm1'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Module 1: CRM &amp; Commercial</span>
            </button>

            <button
              onClick={() => setActiveModule('m2')}
              className={`px-4 py-2.5 rounded-xl font-semibold transition flex items-center space-x-2 ${
                activeModule === 'm2'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Module 2: Planning &amp; Governance</span>
            </button>

            <button
              onClick={() => setActiveModule('m3')}
              className={`px-4 py-2.5 rounded-xl font-semibold transition flex items-center space-x-2 ${
                activeModule === 'm3'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Module 3: Fieldwork Execution</span>
            </button>

            <button
              onClick={() => setActiveModule('m4')}
              className={`px-4 py-2.5 rounded-xl font-semibold transition flex items-center space-x-2 ${
                activeModule === 'm4'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileCheck2 className="w-4 h-4" />
              <span>Module 4: Reporting &amp; Deliverables</span>
            </button>

            <button
              onClick={() => setActiveModule('m5')}
              className={`px-4 py-2.5 rounded-xl font-semibold transition flex items-center space-x-2 ${
                activeModule === 'm5'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Module 5: Practice Management</span>
            </button>

            <button
              onClick={() => setActiveModule('client')}
              className={`px-4 py-2.5 rounded-xl font-semibold transition flex items-center space-x-2 ${
                activeModule === 'client'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                  : 'text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Client PBC View</span>
            </button>
          </div>
        )}

        {/* Active Module Content */}
        <div className="transition-all">
          {activeModule === 'm1' && (
            <Module1Commercial
              userRole={currentRole}
              clients={initialData?.clients ?? []}
              leads={initialData?.leads ?? []}
              dualKeyGate={dualKeyGate}
              engagement={initialData?.engagement}
              onClearDualKey={handleClearDualKey}
            />
          )}

          {activeModule === 'm2' && (
            <Module2Planning
              userRole={currentRole}
              engagement={initialData?.engagement}
              acceptance={initialData?.engagement?.acceptance}
              folders={initialData?.engagement?.folders ?? []}
              staffing={initialData?.engagement?.staffing ?? []}
              materiality={initialData?.engagement?.materiality ?? []}
            />
          )}

          {activeModule === 'm3' && (
            <Module3Fieldwork
              userRole={currentRole}
              fslis={fslis}
              tbRows={initialData?.engagement?.trialBalanceRows ?? []}
              confirmations={initialData?.engagement?.confirmations ?? []}
              onRejectProcedure={(id, reason) => {
                setNotice({
                  type: 'warn',
                  msg: `Procedure rejected and reverted to "Under Rework". Mandatory comment logged.`
                });
              }}
            />
          )}

          {activeModule === 'm4' && (
            <Module4Reporting
              userRole={currentRole}
              engagement={initialData?.engagement}
              fslis={fslis}
              onApplySignature={() => {
                setNotice({
                  type: 'success',
                  msg: 'Partner digital signature and firm seal applied to certified deliverable bundle.'
                });
              }}
              onLockArchive={() => {
                setEngagementState('ARCHIVED_READ_ONLY');
                setNotice({
                  type: 'warn',
                  msg: 'ISA 230 File Lock applied. Engagement is now permanently Read-Only.'
                });
              }}
            />
          )}

          {activeModule === 'm5' && (
            <Module5Practice
              userRole={currentRole}
              timeEntries={initialData?.engagement?.timeEntries ?? []}
              practiceLedger={initialData?.practiceLedger ?? []}
              contractedFeeQar={Number(initialData?.engagement?.agreedFee ?? 120000)}
            />
          )}

          {activeModule === 'client' && (
            <ClientPbcPortal
              engagement={initialData?.engagement}
              pbcRequests={pbcRequests}
              onUploadFile={(reqId, fileName) => {
                setPbcRequests((prev: any[]) =>
                  prev.map(r => (r.id === reqId ? { ...r, status: 'UNDER_REVIEW' } : r))
                );
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
