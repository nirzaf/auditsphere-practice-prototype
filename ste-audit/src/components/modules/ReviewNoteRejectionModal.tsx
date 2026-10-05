'use client';

import React, { useState } from 'react';
import { AlertTriangle, X, Send, ShieldAlert } from 'lucide-react';
import { MIN_REVIEW_NOTE_LENGTH } from '@/domain/constants';

interface ReviewNoteRejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  procedureRef: string;
  procedureTitle: string;
  assignedUserName: string;
  onSubmit: (reason: string) => void;
}

export function ReviewNoteRejectionModal({
  isOpen,
  onClose,
  procedureRef,
  procedureTitle,
  assignedUserName,
  onSubmit
}: ReviewNoteRejectionModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || reason.trim().length < MIN_REVIEW_NOTE_LENGTH) {
      setError(`A mandatory auditor rejection reason of at least ${MIN_REVIEW_NOTE_LENGTH} characters is required.`);
      return;
    }
    onSubmit(reason.trim());
    setReason('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white border border-rose-200 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-rose-100 bg-rose-50/50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-rose-100/60 border border-rose-200 text-rose-600 rounded-xl">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Issue Managerial Review Note</h3>
              <p className="text-xs text-rose-700 font-medium">Mandatory Rework Rejection Loop (ISA 220)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <div className="text-[11px] font-mono text-blue-700 uppercase tracking-wider font-semibold">{procedureRef}</div>
            <div className="text-xs font-semibold text-slate-900">{procedureTitle}</div>
            <div className="text-[11px] text-slate-500 mt-1">
              Assigned Preparer: <span className="text-slate-800 font-medium">{assignedUserName}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Specific Deficiencies &amp; Required Action <span className="text-rose-600">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              rows={4}
              placeholder="e.g. Missing supplier confirmation tie-out, or inadequate testing of subsequent receipts past cut-off date..."
              className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900 text-xs placeholder-slate-400 focus:border-rose-500 focus:outline-none transition resize-none shadow-2xs"
            />
            <div className="flex justify-between items-center mt-1 text-[11px]">
              <span className={reason.length < MIN_REVIEW_NOTE_LENGTH ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
                {reason.length}/{MIN_REVIEW_NOTE_LENGTH} chars minimum
              </span>
              <span className="text-slate-500">Status will revert to &quot;Under Rework&quot;</span>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs flex items-center space-x-1.5 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Rejection &amp; Revert</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
