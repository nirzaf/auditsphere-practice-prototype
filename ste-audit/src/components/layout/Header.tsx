'use client';

import React from 'react';
import {
  Shield,
  Building,
  User,
  CheckCircle2,
  ChevronDown,
  Layers,
  Sparkles,
  Lock
} from 'lucide-react';
import type { RoleKey } from '@/domain/types';

interface HeaderProps {
  currentRole: RoleKey;
  onRoleChange: (role: RoleKey) => void;
  clientLegalName: string;
  engagementService: string;
  reportingYear: number;
}

export function Header({
  currentRole,
  onRoleChange,
  clientLegalName,
  engagementService,
  reportingYear
}: HeaderProps) {
  const personas: Array<{ role: RoleKey; name: string; title: string; badgeColor: string }> = [
    {
      role: 'PREPARER',
      name: 'Tariq Al-Mansoor',
      title: 'Junior Auditor / Preparer (200 QAR/hr)',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    {
      role: 'REVIEWER',
      name: 'Fatima Al-Kuwari, CPA',
      title: 'Audit Manager / Senior (750 QAR/hr)',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
    },
    {
      role: 'APPROVER',
      name: 'Sheikh Khalid Al-Thani',
      title: 'Engagement Partner (1,000 QAR/hr)',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200'
    },
    {
      role: 'CLIENT',
      name: 'Rashid Al-Nuaimi',
      title: 'Client CFO / Audit Liaison (External PBC)',
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200'
    }
  ];

  const currentPersona = personas.find(p => p.role === currentRole) ?? personas[0]!;

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left Branding */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shadow-blue-500/20 text-white font-bold text-base">
            STE
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-900 tracking-tight text-sm">
                STE Audit Management Tool
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                v2.1 Prod
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Qatar / QAR • ISA/IFRS
              </span>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center space-x-1.5 mt-0.5">
              <Building className="w-3 h-3 text-blue-600" />
              <span className="font-medium text-slate-700">{clientLegalName}</span>
              <span>•</span>
              <span className="text-slate-600 font-medium">{engagementService} {reportingYear}</span>
            </div>
          </div>
        </div>

        {/* Right Persona Switcher */}
        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-900">{currentPersona.name}</div>
            <div className="text-[10px] text-slate-500">{currentPersona.title}</div>
          </div>

          <div className="relative">
            <select
              value={currentRole}
              onChange={e => onRoleChange(e.target.value as RoleKey)}
              aria-label="Active Persona & RBAC Scope"
              className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition cursor-pointer appearance-none pr-8 shadow-xs hover:border-slate-400"
            >
              {personas.map(p => (
                <option key={p.role} value={p.role}>
                  {p.role}: {p.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
