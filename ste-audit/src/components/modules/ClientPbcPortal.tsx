'use client';

import React, { useState } from 'react';
import {
  UploadCloud,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Lock,
  KeyRound,
  ShieldCheck,
  Building2,
  ExternalLink
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface ClientPbcPortalProps {
  engagement: any;
  pbcRequests: any[];
  onUploadFile?: (requestId: string, fileName: string) => void;
}

export function ClientPbcPortal({
  engagement,
  pbcRequests = [],
  onUploadFile
}: ClientPbcPortalProps) {
  const [mustResetPassword, setMustResetPassword] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);
  const [localRequests, setLocalRequests] = useState(pbcRequests);

  // Upload privileges freeze upon final release states
  const uploadsFrozen =
    engagement?.state === 'DELIVERABLE_RELEASE' ||
    engagement?.state === 'COMPLIANCE_COUNTDOWN' ||
    engagement?.state === 'ARCHIVED_READ_ONLY';

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length >= 8) {
      setMustResetPassword(false);
      setPasswordResetSuccess(true);
    }
  };

  const handleSimulateUpload = (requestId: string) => {
    if (uploadsFrozen) return;
    const fakeFileName = prompt('Enter document name to simulate upload (e.g. Lusail_Snag_Clearance.pdf):', 'Signed_Audit_Schedule_2026.pdf');
    if (!fakeFileName) return;

    setLocalRequests(prev =>
      prev.map(r => (r.id === requestId ? { ...r, status: 'UNDER_REVIEW' } : r))
    );
    onUploadFile?.(requestId, fakeFileName);
    alert(`File "${fakeFileName}" uploaded successfully. Status updated to "Under Review".`);
  };

  return (
    <div className="space-y-6">
      {/* Client Portal Header */}
      <div className="p-6 bg-gradient-to-r from-blue-50/80 via-white to-indigo-50/50 border border-blue-200 rounded-2xl flex items-center justify-between shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 border border-blue-300 rounded-full text-[10px] font-bold uppercase tracking-wider">
              Client PBC Portal (External Secure View)
            </span>
            <span className="text-xs text-slate-600">Authenticated: Rashid Al-Nuaimi (CFO)</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">Doha Pearl Contracting W.L.L. — Audit PBC Workspace</h2>
          <p className="text-xs text-slate-500">
            Provided by Client (PBC) document ingest for Statutory Audit FY2026.
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-500 font-medium">Upload Privileges</div>
          <div className={`text-xs font-bold mt-1 flex items-center space-x-1 justify-end ${
            uploadsFrozen ? 'text-rose-600' : 'text-emerald-700'
          }`}>
            {uploadsFrozen ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Uploads Frozen (Report Issued)</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Active &amp; Open</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mandatory First-Login Password Reset Simulation */}
      {mustResetPassword && (
        <div className="p-5 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3 shadow-xs">
          <div className="flex items-center space-x-2.5 text-amber-900 font-bold text-xs">
            <KeyRound className="w-5 h-5 text-amber-600 shrink-0" />
            <span>Mandatory Security Requirement: Reset Temporary First-Login Credentials</span>
          </div>
          <p className="text-xs text-amber-800">
            In accordance with QCB data security standards, you must change your initial temporary onboarding password before continuing.
          </p>
          <form onSubmit={handlePasswordSubmit} className="flex items-center space-x-3 max-w-md pt-1">
            <input
              type="password"
              placeholder="Enter new strong password (min 8 chars)"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-600 flex-1"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs transition"
            >
              Update Password
            </button>
          </form>
        </div>
      )}

      {passwordResetSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Password updated successfully. Client portal credentials secured.</span>
        </div>
      )}

      {uploadsFrozen && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex items-center space-x-3 shadow-xs">
          <Lock className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <div className="font-bold">Client Ingest Privileges Frozen</div>
            <div>
              Final independent audit report has been issued and locked. No further document uploads can be accepted under ISA 230 regulations.
            </div>
          </div>
        </div>
      )}

      {/* PBC Items List */}
      <div className="space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">Outstanding &amp; Submitted PBC Requests</h3>
          <span className="text-xs text-slate-500 font-medium">{localRequests.length} Total Requests</span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {localRequests.map(req => {
            const isPending = req.status === 'PENDING_UPLOAD';
            const isUnderReview = req.status === 'UNDER_REVIEW';
            const isApproved = req.status === 'APPROVED';
            const isRejected = req.status === 'REJECTED_REUPLOAD' || req.status === 'REJECTED_REUPLOAD_REQUIRED';

            return (
              <div
                key={req.id}
                className={`p-5 rounded-2xl border transition shadow-xs ${
                  isRejected
                    ? 'bg-rose-50/50 border-rose-200'
                    : isApproved
                    ? 'bg-white border-emerald-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[11px] text-blue-600 font-bold">{req.id}</span>
                      <h4 className="text-sm font-bold text-slate-900">{req.title}</h4>
                    </div>
                    <p className="text-xs text-slate-600">{req.description}</p>
                    <div className="text-[11px] text-slate-500">
                      Due Date: <span className="font-mono text-slate-700 font-medium">{formatDate(req.dueAt)}</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    isApproved
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : isUnderReview
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : isRejected
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {isApproved && 'Approved'}
                    {isUnderReview && 'Under Review'}
                    {isRejected && 'Rejected / Re-upload Required'}
                    {isPending && 'Pending Upload'}
                  </span>
                </div>

                {/* Mandatory auditor rejection reason banner */}
                {isRejected && req.rejectionReason && (
                  <div className="mt-3.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center space-x-1.5 text-rose-800 font-bold">
                      <RotateCcw className="w-4 h-4 text-rose-600" />
                      <span>Auditor Rejection Reason:</span>
                    </div>
                    <div className="text-rose-700 pl-5 italic font-medium">
                      &quot;{req.rejectionReason}&quot;
                    </div>
                  </div>
                )}

                {/* Upload action */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    Acceptable formats: PDF, XLSX, ZIP • Max 25 MB
                  </div>
                  {!uploadsFrozen && (
                    <button
                      onClick={() => handleSimulateUpload(req.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 ${
                        isRejected
                          ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                          : isApproved
                          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                      }`}
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>{isRejected ? 'Upload Replacement Evidence' : isApproved ? 'Replace Evidence' : 'Upload File'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
