// Module 16: Practice Reporting Centre & Business Intelligence (VP-060)
// Computed operational practice metrics, live WIP calculation from approved time & invoices,
// staff chargeability utilization, interactive filters, drill-down modals, and scoped CSV exports.

import React, { useState } from 'react';
import { RouteKey, EngagementRecord, TimeEntryItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { isSuperuserRole } from '../../services/guards';
import { Icon } from '../common/Icons';
import { calculateRecordedWipValue, calculateReceivablesAging, formatCurrency, formatMinutesToHours, getEffectiveTimeEntries } from '../../services/calculations';
import { exportService } from '../../services/exportService';
import { visibleClientIds, visibleEngagementIds } from '../../services/guards';

import { ListState, StatusBadge } from '../common/Enterprise';
interface ReportingCentreViewProps {
  onNavigate: (route: RouteKey) => void;
}

type ReportKey = 'wip' | 'utilization' | 'compliance' | 'clients' | 'jobs' | 'tasks' | 'pbc' | 'time' | 'budget' | 'invoices' | 'credits' | 'receipts' | 'ar' | 'findings' | 'reviews' | 'packages';
type ReportRow = { cells: string[]; engagementId?: string };
const REPORTS: Array<{ key: ReportKey; label: string }> = [
  { key: 'wip', label: 'WIP and billing realization' }, { key: 'utilization', label: 'Staff chargeability and utilization' },
  { key: 'compliance', label: 'Compliance calendar' }, { key: 'clients', label: 'Clients and engagements' },
  { key: 'jobs', label: 'Jobs by status and due date' }, { key: 'tasks', label: 'Tasks by status and overdue' },
  { key: 'pbc', label: 'Outstanding PBC' }, { key: 'time', label: 'Approved time by person and billing class' },
  { key: 'budget', label: 'Budget variance' }, { key: 'invoices', label: 'Invoice register' },
  { key: 'credits', label: 'Credit register' }, { key: 'receipts', label: 'Receipt register' },
  { key: 'ar', label: 'Accounts receivable aging' }, { key: 'findings', label: 'Audit findings' },
  { key: 'reviews', label: 'Review-point status' }, { key: 'packages', label: 'Package readiness' }
];

export const ReportingCentreView: React.FC<ReportingCentreViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const effectiveTimes = getEffectiveTimeEntries(state.times);
  const [selectedReport, setSelectedReport] = useState<ReportKey>('wip');
  const [clientFilter, setClientFilter] = useState<string>('ALL');
  const [drillDownEng, setDrillDownEng] = useState<EngagementRecord | null>(null);

  // Filtered engagements
  const allowedClientIds = visibleClientIds(state);
  const allowedEngagementIds = visibleEngagementIds(state);
  const scopedClients = state.clients.filter(c => allowedClientIds === 'ALL' || allowedClientIds.includes(c.id));
  const scopedEngagements = state.engagements.filter(e =>
    (allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(e.id)) &&
    (allowedClientIds === 'ALL' || allowedClientIds.includes(e.client))
  );
  const filteredEngs = scopedEngagements.filter(e => clientFilter === 'ALL' || e.client === clientFilter);

  // Compute live WIP rows from demo records
  const wipRows = filteredEngs.map(eng => {
    const cl = state.clients.find(c => c.id === eng.client);
    const approvedTimes = effectiveTimes.filter(t => t.engagementId === eng.id && t.status === 'Approved');
    const totalMinutes = approvedTimes.reduce((sum, t) => sum + t.durationMinutes, 0);
    // Use the rate pinned when time was approved; missing rates remain unknown.
    const recordedWipValue = calculateRecordedWipValue(approvedTimes);

    // Only issued invoices pinned to this engagement count; draft/approved and
    // sibling engagement invoices cannot reduce this row.
    const clientInvoices = state.invoices.filter(i => (i.engagementId || i.eng) === eng.id && (i.status === 'Issued' || i.status === 'Paid'));
    const billedAmount = clientInvoices.reduce((sum, i) => sum + i.amount, 0);
    const unbilledWip = recordedWipValue === null ? null : Math.max(0, recordedWipValue - billedAmount);

    return {
      eng,
      clientName: cl?.name || eng.client,
      service: eng.service,
      currency: eng.currency,
      approvedTimes,
      totalHours: formatMinutesToHours(totalMinutes),
      recordedWipValue,
      billedAmount,
      unbilledWip
    };
  });

  const oneCurrency = new Set(wipRows.map(r => r.currency)).size <= 1;
  const totalWipValue = oneCurrency && wipRows.every(r => r.recordedWipValue !== null) ? wipRows.reduce((sum, r) => sum + r.recordedWipValue!, 0) : null;
  const totalBilled = oneCurrency ? wipRows.reduce((sum, r) => sum + r.billedAmount, 0) : null;
  const totalUnbilled = oneCurrency && wipRows.every(r => r.unbilledWip !== null) ? wipRows.reduce((sum, r) => sum + r.unbilledWip!, 0) : null;

  // Compute live staff utilization from state.times
  const usersWithTimes = state.users.filter(u => u.group === 'Professional');
  const utilizationRows = usersWithTimes.map(user => {
    const userTimes = effectiveTimes.filter(t => t.person === user.name && t.status === 'Approved' && filteredEngs.some(e => e.id === t.engagementId));
    const billableMinutes = userTimes.filter(t => t.billable).reduce((sum, t) => sum + t.durationMinutes, 0);
    const nonBillableMinutes = userTimes.filter(t => !t.billable).reduce((sum, t) => sum + t.durationMinutes, 0);
    const totalUserMinutes = billableMinutes + nonBillableMinutes;
    const billableHours = Math.round(billableMinutes / 60);
    const nonBillableHours = Math.round(nonBillableMinutes / 60);
    const targetPct = user.role === 'partner' ? 50 : user.role === 'manager' ? 75 : 85;
    const actualPct = totalUserMinutes > 0 ? Math.round((billableMinutes / totalUserMinutes) * 100) : 0;

    return {
      name: user.name,
      role: user.label,
      billableHours,
      nonBillableHours,
      targetPct,
      actualPct
    };
  });

  const visibleReports = isSuperuserRole(state.currentRole) || ['manager', 'partner'].includes(state.currentRole) ? REPORTS : state.currentRole === 'billing'
    ? REPORTS.filter(r => ['wip', 'utilization', 'clients', 'invoices', 'credits', 'receipts', 'ar', 'time', 'budget'].includes(r.key))
    : REPORTS.filter(r => ['clients', 'jobs', 'tasks', 'compliance'].includes(r.key));
  const report = visibleReports.some(r => r.key === selectedReport) ? selectedReport : visibleReports[0]?.key || 'clients';
  const scopedJobIds = new Set(state.jobs.filter(j => filteredEngs.some(e => e.id === j.engagementId)).map(j => j.id));
  const approvedTime = effectiveTimes.filter(t => t.status === 'Approved' && filteredEngs.some(e => e.id === t.engagementId));
  const scopedInvoices = state.invoices.filter(i => filteredEngs.some(e => e.id === (i.engagementId || i.eng)));
  const scopedInvoiceIds = new Set(scopedInvoices.map(i => i.id));
  const scopedClientsSet = new Set(scopedClients.filter(c => clientFilter === 'ALL' || c.id === clientFilter).map(c => c.id));
  const scopedCredits = state.creditNotes.filter(c => scopedInvoiceIds.has(c.invoiceId) && scopedClientsSet.has(c.clientId));
  const scopedReceipts = state.receipts.filter(r => scopedClientsSet.has(r.clientId));
  const aging = calculateReceivablesAging(scopedInvoices, scopedCredits, scopedReceipts, state.asOfDate);
  const data = (headers: string[], rows: ReportRow[]) => ({ headers, rows });
  const datasets: Partial<Record<ReportKey, ReturnType<typeof data>>> = {
    wip: data(['Client', 'Engagement', 'Service', 'Currency', 'Approved hours', 'Recorded WIP', 'Billed', 'Unbilled WIP'], [
      ...wipRows.map(r => ({ engagementId: r.eng.id, cells: [r.clientName, r.eng.id, r.service, r.currency, r.totalHours, r.recordedWipValue === null ? 'Unknown' : String(r.recordedWipValue), String(r.billedAmount), r.unbilledWip === null ? 'Unknown' : String(r.unbilledWip)] })),
      { cells: ['Filtered totals', '', '', oneCurrency ? wipRows[0]?.currency || 'QAR' : 'Mixed', formatMinutesToHours(wipRows.reduce((sum, r) => sum + r.approvedTimes.reduce((n, t) => n + t.durationMinutes, 0), 0)), totalWipValue === null ? 'Unknown' : String(totalWipValue), totalBilled === null ? 'Unknown' : String(totalBilled), totalUnbilled === null ? 'Unknown' : String(totalUnbilled)] }
    ]),
    utilization: data(['Staff member', 'Role', 'Billable hours', 'Non-billable hours', 'Target utilization', 'Actual utilization'], utilizationRows.map(u => ({ cells: [u.name, u.role, String(u.billableHours), String(u.nonBillableHours), `${u.targetPct}%`, `${u.actualPct}%`] }))),
    compliance: data(['Engagement', 'Client', 'Service', 'Year', 'Due date', 'Stage', 'Partner'], filteredEngs.map(e => ({ engagementId: e.id, cells: [e.id, state.clients.find(c => c.id === e.client)?.name || e.client, e.service, String(e.year), e.due, e.stage, e.partner] }))),
    clients: data(['Client', 'Engagement', 'Service', 'Year', 'Stage', 'Manager', 'Partner', 'Currency'], filteredEngs.map(e => ({ engagementId: e.id, cells: [state.clients.find(c => c.id === e.client)?.name || e.client, e.id, e.service, String(e.year), e.stage, e.manager, e.partner, e.currency] }))),
    jobs: data(['Job', 'Engagement', 'Title', 'Owner', 'Status', 'Due', 'Overdue'], state.jobs.filter(j => scopedJobIds.has(j.id)).map(j => ({ engagementId: j.engagementId, cells: [j.id, j.engagementId, j.title, j.owner, j.status, j.dueDate, j.dueDate < state.asOfDate && !['Completed', 'Cancelled'].includes(j.status) ? 'Yes' : 'No'] }))),
    tasks: data(['Task', 'Job', 'Engagement', 'Title', 'Assignee', 'Status', 'Due', 'Overdue'], state.jobTasks.filter(t => scopedJobIds.has(t.jobId)).map(t => ({ engagementId: state.jobs.find(j => j.id === t.jobId)?.engagementId, cells: [t.id, t.jobId, state.jobs.find(j => j.id === t.jobId)?.engagementId || '', t.title, t.assignee, t.status, t.dueDate || '', Boolean(t.dueDate && t.dueDate < state.asOfDate && !['Completed', 'Cancelled'].includes(t.status)) ? 'Yes' : 'No'] }))),
    pbc: data(['Request', 'Engagement', 'Title', 'Status', 'Owner', 'Due'], filteredEngs.flatMap(e => e.pbc.filter(p => !['Accepted', 'Cancelled'].includes(p.status)).map(p => ({ engagementId: e.id, cells: [p.id, e.id, p.title, p.status, p.owner, p.due] })))),
    time: data(['Person', 'Engagement', 'Activity', 'Date', 'Minutes', 'Billing class', 'Currency', 'Amount'], approvedTime.map(t => ({ engagementId: t.engagementId, cells: [t.person, t.engagementId, t.activity, t.date, String(t.durationMinutes), t.billable ? 'Billable' : 'Non-billable', t.currency || 'Unknown', t.billable && t.billingRatePerHour !== undefined ? ((t.durationMinutes / 60) * t.billingRatePerHour).toFixed(2) : 'Unknown'] }))),
    budget: data(['Engagement', 'Job', 'Budget version', 'Currency', 'Planned minutes', 'Approved minutes', 'Variance minutes', 'Planned billable value'], state.budgets.filter(b => filteredEngs.some(e => e.id === b.engagementId)).map(b => {
      const actual = approvedTime.filter(t => t.engagementId === b.engagementId && (b.jobId ? t.jobId === b.jobId : !t.jobId));
      const plan = b.lines.reduce((sum, line) => sum + line.plannedMinutes, 0);
      const minutes = actual.reduce((sum, t) => sum + t.durationMinutes, 0);
      const amount = actual.filter(t => t.billable).every(t => t.billingRatePerHour !== undefined) ? actual.filter(t => t.billable).reduce((sum, t) => sum + t.durationMinutes / 60 * (t.billingRatePerHour || 0), 0).toFixed(2) : 'Unknown';
      return { engagementId: b.engagementId, cells: [b.engagementId, b.jobId || 'Engagement', String(b.version), b.currency, String(plan), String(minutes), String(minutes - plan), amount] };
    })),
    invoices: data(['Invoice', 'Engagement', 'Client', 'Status', 'Currency', 'Amount', 'Paid', 'Due'], scopedInvoices.filter(i => scopedClientsSet.has(i.clientId)).map(i => ({ engagementId: i.engagementId || i.eng, cells: [i.invoiceNumber, i.engagementId || i.eng, state.clients.find(c => c.id === i.clientId)?.name || i.clientId, i.status, i.currency, String(i.amount), String(i.paid), i.due] }))),
    credits: data(['Credit note', 'Invoice', 'Client', 'Status', 'Currency', 'Amount', 'Date'], scopedCredits.map(c => { const invoice = scopedInvoices.find(i => i.id === c.invoiceId); return { engagementId: invoice?.engagementId || invoice?.eng, cells: [c.creditNumber, c.invoiceId, state.clients.find(cl => cl.id === c.clientId)?.name || c.clientId, c.status, c.currency || 'Unknown', String(c.amount), c.issueDate || c.date || ''] }; })),
    receipts: data(['Receipt', 'Client', 'Date', 'Currency', 'Amount', 'Allocated', 'Unallocated'], scopedReceipts.map(r => {
      const allocated = r.allocations.filter(a => !a.reversed && scopedInvoiceIds.has(a.invoiceId)).reduce((sum, a) => sum + a.amount, 0);
      return { cells: [r.receiptNumber, state.clients.find(c => c.id === r.clientId)?.name || r.clientId, r.date, r.currency, String(r.amount), String(allocated), String(Math.max(0, r.amount - allocated))] };
    })),
    ar: data(['Invoice', 'Engagement', 'Currency', 'Due', 'Outstanding', 'Aging bucket', 'Days overdue'], aging.invoiceBreakdown.map(r => ({ engagementId: r.invoice.engagementId || r.invoice.eng, cells: [r.invoice.invoiceNumber, r.invoice.engagementId || r.invoice.eng, r.invoice.currency, r.invoice.due, String(r.outstanding), r.bucket, String(r.daysOverdue)] }))),
    findings: data(['Finding', 'Engagement', 'Title', 'Severity', 'Disposition', 'Currency', 'Amount'], state.findings.filter(f => filteredEngs.some(e => e.id === f.engagementId)).map(f => ({ engagementId: f.engagementId, cells: [f.id, f.engagementId, f.title, f.severity || 'Unrated', f.disposition, f.currency || 'Unknown', f.amount === undefined ? 'Not quantified' : String(f.amount)] }))),
    reviews: data(['Review point', 'Engagement', 'Subject', 'Severity', 'Status', 'Assigned', 'Due'], filteredEngs.flatMap(e => e.reviews.map(r => ({ engagementId: e.id, cells: [r.id, e.id, r.wp, r.severity, r.status, r.assigned, r.due] })))),
    packages: data(['Engagement', 'Client', 'Package revision', 'Source revision', 'Status', 'Artifacts', 'SHA-256 identities'], filteredEngs.map(e => {
      const p = e.packageHistory?.find(item => item.revision === e.packageRevision);
      return { engagementId: e.id, cells: [e.id, state.clients.find(c => c.id === e.client)?.name || e.client, String(e.packageRevision), p ? `TB v${p.sourceVersion}` : 'Not assembled', p ? p.validation.passed && p.sourceVersion === e.sourceVersion ? 'Ready' : 'Stale / blocked' : 'Not assembled', String(p?.artifacts.length || 0), (p?.artifacts || []).map(a => a.sha256).join('; ')] };
    }))
  };
  const activeDataset = datasets[report] || { headers: [], rows: [] };
  // Distinguishes "the practice has no records of this kind" from "your client
  // filter excludes the ones that exist" — two different answers for the reader.
  const hasAnyReportableRecord = Object.values(datasets).some(dataset => dataset.rows.length > 0);
  const drillRoute: Partial<Record<ReportKey, RouteKey>> = { clients: 'engagements', jobs: 'jobs', tasks: 'jobs', pbc: 'documents', time: 'my-time', budget: 'budgets', invoices: 'billing', credits: 'receivables', receipts: 'receivables', ar: 'receivables', findings: 'findings', reviews: 'reviews', packages: 'financial-packages', wip: 'budgets', utilization: 'my-time', compliance: 'engagements' };

  const handleExportCSV = () => exportService.exportCSV(`${report}_practice_report_${state.asOfDate}`, [activeDataset.headers, ...activeDataset.rows.map(r => r.cells)]);

  return (
    <div className="stack practice-report-page" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Practice Reporting Centre</h1>
          <p>Scoped operational and financial reports with consistent filters, drill-downs, currency context and CSV exports.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => window.print()}>
            Print Active Report
          </button>
          <button className="btn primary sm" onClick={handleExportCSV}>
            <Icon name="download" /> Export Active Report (CSV)
          </button>
        </div>
      </div>

      <div className="between">
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <label className="caption" htmlFor="report-client-filter">Filter Client:</label>
          <select
            id="report-client-filter"
            className="input sm"
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            style={{ width: 180 }}
          >
            <option value="ALL">All Clients ({scopedClients.length})</option>
            {scopedClients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel panel-pad grid2">
        <div><label className="caption" htmlFor="practice-report">Report catalogue</label>
          <select id="practice-report" className="input" value={report} onChange={e => setSelectedReport(e.target.value as ReportKey)}>
            {visibleReports.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </div>
        <div><label className="caption">Report context</label><div>{report === 'ar' ? `As of ${state.asOfDate}; each row retains its invoice currency.` : `Scoped to permitted engagements · ${filteredEngs.length} engagement(s) · ${state.asOfDate}`}</div></div>
      </div>

      {/* REPORT 1: WIP Breakdown */}
      {report === 'wip' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-label">Unbilled WIP Total</span>
              <div className="metric-val">{totalUnbilled === null ? 'Unknown' : formatCurrency(totalUnbilled, wipRows[0]?.currency || 'QAR')}</div>
              <span className="metric-sub">From approved timesheets</span>
            </div>
            <div className="metric blue">
              <span className="metric-label">Total Incurred Fees</span>
              <div className="metric-val">{totalWipValue === null ? 'Unknown' : formatCurrency(totalWipValue, wipRows[0]?.currency || 'QAR')}</div>
              <span className="metric-sub">Across {filteredEngs.length} mandate(s)</span>
            </div>
            <div className="metric green">
              <span className="metric-label">Billed Collections</span>
              <div className="metric-val">{totalBilled === null ? 'Unknown' : formatCurrency(totalBilled, wipRows[0]?.currency || 'QAR')}</div>
              <span className="metric-sub">Issued tax invoices</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head between">
              <div>
                <h3>Computed Engagement WIP Breakdown</h3>
                <span className="caption">Calculated from approved time entries and issued invoices</span>
              </div>
              <span className="caption">Count: {wipRows.length} mandates</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Client Entity</th>
                    <th>Engagement Service</th>
                    <th>Approved Hours</th>
                    <th>Recorded WIP Value</th>
                    <th>Billed Fees</th>
                    <th>Unbilled Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {wipRows.map((r, idx) => (
                    <tr key={idx}>
                      <td><b>{r.clientName}</b></td>
                      <td>{r.service}</td>
                      <td>{r.totalHours}</td>
                      <td><b>{r.recordedWipValue === null ? 'Unknown' : formatCurrency(r.recordedWipValue, r.currency)}</b></td>
                      <td>{formatCurrency(r.billedAmount, r.currency)}</td>
                      <td>
                        <span className={`badge ${r.unbilledWip === null ? 'amber' : r.unbilledWip > 0 ? 'amber' : 'green'}`}>
                          {r.unbilledWip === null ? 'Unknown' : formatCurrency(r.unbilledWip, r.currency)}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn sm ghost"
                          onClick={() => setDrillDownEng(r.eng)}
                        >
                          Drill Down ({r.approvedTimes.length} entries)
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td><b>Filtered Totals</b></td>
                    <td>—</td>
                    <td>—</td>
                    <td><b>{totalWipValue === null ? 'Unknown' : formatCurrency(totalWipValue, wipRows[0]?.currency || 'QAR')}</b></td>
                    <td><b>{totalBilled === null ? 'Unknown' : formatCurrency(totalBilled, wipRows[0]?.currency || 'QAR')}</b></td>
                    <td><b>{totalUnbilled === null ? 'Unknown' : formatCurrency(totalUnbilled, wipRows[0]?.currency || 'QAR')}</b></td>
                    <td>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REPORT 2: Staff Chargeability */}
      {report === 'utilization' && (
        <div className="panel">
          <div className="panel-head between">
            <div>
              <h3>Staff Chargeability &amp; Productivity Analysis</h3>
              <span className="caption">Computed live from approved timesheet entries grouped by persona</span>
            </div>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Practice Role</th>
                  <th>Billable Hours</th>
                  <th>Non-Billable Hours</th>
                  <th>Target Utilization</th>
                  <th>Actual Utilization</th>
                  <th>Performance Variance</th>
                </tr>
              </thead>
              <tbody>
                {utilizationRows.map((u, idx) => {
                  const varPct = u.actualPct - u.targetPct;
                  return (
                    <tr key={idx}>
                      <td><b>{u.name}</b></td>
                      <td>{u.role}</td>
                      <td><b>{u.billableHours} hrs</b></td>
                      <td>{u.nonBillableHours} hrs</td>
                      <td>{u.targetPct}%</td>
                      <td><b>{u.actualPct}%</b></td>
                      <td>
                        <span className={`badge ${varPct >= 0 ? 'green' : 'amber'}`}>
                          {varPct >= 0 ? `+${varPct}%` : `${varPct}%`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 3: Statutory Compliance Calendar */}
      {report === 'compliance' && (
        <div className="panel">
          <div className="panel-head between">
            <div>
              <h3>Mandatory Statutory Filing &amp; Compliance Calendar</h3>
              <span className="caption">Statutory audit filing deadlines across active practice engagements</span>
            </div>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Engagement</th>
                  <th>Client Entity</th>
                  <th>Service</th>
                  <th>FY Period</th>
                  <th>Filing Due Date</th>
                  <th>Engagement Stage</th>
                  <th>Signing Partner</th>
                </tr>
              </thead>
              <tbody>
                {filteredEngs.map(e => {
                  const cl = state.clients.find(c => c.id === e.client);
                  return (
                    <tr key={e.id}>
                      <td><span className="mono">{e.id}</span></td>
                      <td><b>{cl?.name || e.client}</b></td>
                      <td>{e.service}</td>
                      <td>FY {e.year}</td>
                      <td><b>{e.due}</b></td>
                      <td><StatusBadge status={e.stage} /></td>
                      <td>{e.partner}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!['wip', 'utilization', 'compliance'].includes(report) && (
        <div className="panel">
          <div className="panel-head between"><div><h3>{REPORTS.find(item => item.key === report)?.label}</h3><span className="caption">{activeDataset.rows.length} scoped record(s) · CSV export uses these same rows</span></div></div>
          <div className="tablewrap"><table>
            <thead><tr>{activeDataset.headers.map(h => <th key={h}>{h}</th>)}<th>Drill down</th></tr></thead>
            <tbody>{activeDataset.rows.map((row, index) => <tr key={`${row.engagementId || 'row'}-${index}`}>
              {row.cells.map((cell, i) => <td key={i}>{cell || '—'}</td>)}
              <td>{row.engagementId ? <button className="btn sm ghost" onClick={() => { prototypeStore.setSelectedEngagement(row.engagementId!); onNavigate(drillRoute[report] || 'engagements'); }}>Open source</button> : '—'}</td>
            </tr>)}</tbody>
          </table></div>
          {!activeDataset.rows.length && (
            hasAnyReportableRecord
              ? <ListState
                  kind="no-match"
                  message="No records match this client filter and the current role scope"
                  hint="This report is deterministic and only covers records your grant permits. Clear the client filter to widen it; records outside your scope are never counted or listed."
                />
              : <ListState
                  kind="empty"
                  message="No records exist to report on yet"
                  hint="This report is derived from existing practice records. Once engagements, time, invoices and requests exist in your scope, their rows appear here — nothing is invented to fill the table."
                />
          )}
        </div>
      )}

      {/* Drill Down Modal */}
      {drillDownEng && (
        <div className="modal-overlay" onClick={() => setDrillDownEng(null)}>
          <div className="modal-card" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div className="between">
              <h3>WIP Time Drill-Down: {drillDownEng.id}</h3>
              <button className="btn sm ghost" onClick={() => setDrillDownEng(null)}>✕</button>
            </div>
            <p className="sub mt4">
              Approved timesheet entries contributing to engagement WIP.
            </p>

            <div className="tablewrap mt16">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Team Member</th>
                    <th>Activity</th>
                    <th>Duration</th>
                    <th>Billable</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.times
                    .filter(t => t.engagementId === drillDownEng.id && t.status === 'Approved')
                    .map(t => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td><b>{t.person}</b></td>
                        <td>{t.activity}</td>
                        <td>{formatMinutesToHours(t.durationMinutes)}</td>
                        <td>{t.billable ? 'Yes' : 'No'}</td>
                        <td><StatusBadge status={t.status} /></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="row mt20" style={{ justifyContent: 'flex-end' }}>
              <button className="btn sm" onClick={() => setDrillDownEng(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
