// Module 01: Practice Dashboard (VP-005, VP-060)
import React, { useState } from 'react';
import { RouteKey, JobRecord, JobTaskItem, PbcRequestItem, ReviewNoteItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { canOpenRoute, visibleEngagementIds, hasAnyRole } from '../../services/guards';
import { calculateReceivablesAging, formatCurrency } from '../../services/calculations';
import { Icon } from '../common/Icons';
import { StatusBadge } from '../common/StatusBadge';
import { EmptyTableRow } from '../common/Feedback';
import { buildWorkQueues, QueueId, readyForReleaseEngagements } from '../../services/workQueues';

type DashboardItem = { id: string; engagementId: string; label: string; status: string; due?: string; route: RouteKey; kind: string };

interface DashboardViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [asOfDate, setAsOfDate] = useState(state.asOfDate);
  const [clientFilter, setClientFilter] = useState('ALL');
  const [engagementFilter, setEngagementFilter] = useState('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');
  const [periodFilter, setPeriodFilter] = useState('ALL');
  const [activeList, setActiveList] = useState<'engagements' | 'reviews' | 'pbc' | 'ready' | 'tasks' | 'overdue' | ''>('');
  const [activeQueue, setActiveQueue] = useState<QueueId | ''>('');
  const visibleIds = visibleEngagementIds(state);
  const permittedEngagements = visibleIds === 'ALL' ? state.engagements : state.engagements.filter(e => visibleIds.includes(e.id));
  const availableYears = [...new Set(permittedEngagements.map(e => String(e.year)))].sort().reverse();
  const clientScopedEngagements = permittedEngagements.filter(e => clientFilter === 'ALL' || e.client === clientFilter);
  const periodScopedEngagements = clientScopedEngagements.filter(e => periodFilter === 'ALL' || String(e.year) === periodFilter);
  const availableEngagements = periodScopedEngagements;
  const engagements = periodScopedEngagements.filter(e => engagementFilter === 'ALL' || e.id === engagementFilter);
  const engagementSet = new Set(engagements.map(e => e.id));
  const clientIds = new Set(engagements.map(e => e.client));
  const clients = state.clients.filter(c => clientIds.has(c.id));
  const activeEngagements = engagements.filter(e => !e.archive).length;
  const reviews: Array<DashboardItem & { record: ReviewNoteItem }> = engagements.flatMap(e => e.reviews.filter(r => r.status !== 'Cleared' && (assigneeFilter === 'ALL' || r.assigned === assigneeFilter)).map(r => ({ id: r.id, engagementId: e.id, label: r.title, status: r.status, due: r.due, route: 'reviews', kind: 'Review point', record: r })));
  const pbc: Array<DashboardItem & { record: PbcRequestItem }> = engagements.flatMap(e => e.pbc.filter(p => !['Accepted', 'Cancelled', 'Draft'].includes(p.status) && (assigneeFilter === 'ALL' || p.owner === assigneeFilter)).map(p => ({ id: p.id, engagementId: e.id, label: p.title, status: p.status, due: p.due, route: 'documents', kind: 'Client request', record: p })));
  const jobs: Array<DashboardItem & { record: JobRecord }> = state.jobs.filter(j => engagementSet.has(j.engagementId) && (assigneeFilter === 'ALL' || j.owner === assigneeFilter)).map(j => ({ id: j.id, engagementId: j.engagementId, label: j.title, status: j.status, due: j.dueDate, route: 'jobs', kind: 'Job', record: j }));
  const jobIds = new Set(jobs.map(j => j.id));
  const tasks: Array<DashboardItem & { record: JobTaskItem }> = state.jobTasks.filter(t => jobIds.has(t.jobId) && (assigneeFilter === 'ALL' || t.assignee === assigneeFilter)).map(t => ({ id: t.id, engagementId: state.jobs.find(j => j.id === t.jobId)!.engagementId, label: t.title, status: t.status, due: t.dueDate, route: 'jobs', kind: 'Task', record: t }));
  const myTasks = tasks.filter(t => t.record.assignee === state.currentPerson && !['Completed', 'Cancelled'].includes(t.status));
  const openPbc = pbc;
  const readyEngagements = readyForReleaseEngagements(engagements);
  const ready = readyEngagements.length;
  const overdue: DashboardItem[] = [
    ...jobs.filter(j => j.due && j.due < asOfDate && !['Completed', 'Cancelled'].includes(j.status)),
    ...tasks.filter(t => t.due && t.due < asOfDate && !['Completed', 'Cancelled'].includes(t.status)),
    ...pbc.filter(p => p.due && p.due < asOfDate && !['Accepted', 'Cancelled', 'Draft'].includes(p.status))
  ];

  const currentEng = engagements.find(e => e.id === state.selectedEngagement) || engagements[0];
  const scopedActivity = engagements.flatMap(eng => eng.events.map(event => ({ ...event, engagementId: eng.id, clientId: eng.client })));
  const events = scopedActivity.filter(ev => assigneeFilter === 'ALL' || ev.text.includes(assigneeFilter)).slice(0, 4);
  const recentClients = [...new Set(events.map(ev => ev.clientId))].map(id => state.clients.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const assignees = [...new Set([...jobs.map(j => j.record.owner), ...tasks.map(t => t.record.assignee), ...pbc.map(p => p.record.owner), ...reviews.map(r => r.record.assigned)].filter(Boolean))].sort();
  const financialVisible = canOpenRoute(state.currentRole, 'billing') && canOpenRoute(state.currentRole, 'receivables');
  const visibleInvoices = financialVisible ? state.invoices.filter(i => engagementSet.has(i.engagementId || i.eng)) : [];
  const invoiceCurrencies = [...new Set(visibleInvoices.map(i => i.currency))];
  const receivables = invoiceCurrencies.map(currency => {
    const invoices = visibleInvoices.filter(i => i.currency === currency);
    const invoiceIds = new Set(invoices.map(i => i.id));
    const credits = state.creditNotes.filter(c => invoiceIds.has(c.invoiceId));
    const receipts = state.receipts.filter(r => clients.some(c => c.id === r.clientId) && r.currency === currency);
    return { currency, ...calculateReceivablesAging(invoices, credits, receipts, asOfDate) };
  });
  const listItems: DashboardItem[] = activeList === 'engagements' ? engagements.filter(e => !e.archive).map(e => ({ id: e.id, engagementId: e.id, label: `${state.clients.find(c => c.id === e.client)?.name || e.client} · ${e.service}`, status: e.stage, due: e.due, route: 'engagements', kind: 'Engagement' }))
    : activeList === 'reviews' ? reviews
    : activeList === 'pbc' ? pbc
    : activeList === 'ready' ? readyEngagements.map(e => ({ id: e.id, engagementId: e.id, label: `${state.clients.find(c => c.id === e.client)?.name || e.client} · ${e.service}`, status: e.stage, due: e.due, route: 'delivery', kind: 'Engagement' }))
    : activeList === 'tasks' ? myTasks
    : activeList === 'overdue' ? overdue : [];
  const attention = [...overdue, ...reviews, ...pbc, ...tasks].filter(item => item.due).sort((a, b) => (a.due || '').localeCompare(b.due || ''))[0];
  const jobStatusCounts = ['Not started', 'In progress', 'Blocked', 'Completed', 'Cancelled'].map(status => ({ status, count: jobs.filter(job => job.status === status).length }));
  const maxJobCount = Math.max(1, ...jobStatusCounts.map(item => item.count));
  const openItem = (item: Pick<DashboardItem, 'engagementId' | 'route'>) => { if (item.engagementId) prototypeStore.setSelectedEngagement(item.engagementId); onNavigate(item.route); };
  // Role work queues use the same client/engagement/period filters as the metrics above.
  const queues = buildWorkQueues(state, { engagementIds: engagementSet });
  const openQueue = queues.find(queue => queue.id === activeQueue);
  const persona = state.users.find(user => user.id === state.currentUserId);
  const metric = (label: string, value: number, detail: string, tone: string, list: typeof activeList, icon: string) => (
    <button type="button" className={`metric ${tone}`} aria-label={`${label}: ${value}. ${detail}`} aria-pressed={activeList === list} onClick={() => setActiveList(activeList === list ? '' : list)} style={{ cursor: 'pointer', color: 'inherit', textAlign: 'left', width: '100%' }}>
      <div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon name={icon} /></span></div>
      <div className="metric-value">{value}</div><span className="metric-caption">{detail}</span>
    </button>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Header */}
      <div className="pagehead">
        <div>
          <h1>A clear view of every engagement.</h1>
          <p>Your practice, in sync. Client work, reviews, and deadlines in one place.</p>
          <div className="record-meta"><span>Simulated identity <b>{state.currentPerson}</b></span><span>Role <b>{persona?.label || state.currentRole}</b></span><span>Scope <b>{permittedEngagements.length} permitted {permittedEngagements.length === 1 ? 'engagement' : 'engagements'}</b></span></div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="btn sm">
            <Icon name="calendar" />
            {new Date(`${state.asOfDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })} · As of date
          </span>
          {hasAnyRole(state, ['manager', 'partner']) && <button className="btn primary sm" onClick={() => onNavigate('engagements')}>
            <Icon name="plus" />
            New Engagement
          </button>}
        </div>
      </div>

      <div className="panel panel-pad filter-grid" aria-label="Dashboard filters">
        <label>Client
          <select className="input" aria-label="Dashboard client filter" value={clientFilter} onChange={e => { setClientFilter(e.target.value); setEngagementFilter('ALL'); }}>
            <option value="ALL">All permitted clients</option>{state.clients.filter(c => permittedEngagements.some(eng => eng.client === c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Engagement
          <select className="input" aria-label="Dashboard engagement filter" value={engagementFilter} onChange={e => setEngagementFilter(e.target.value)}>
            <option value="ALL">All permitted engagements</option>{availableEngagements.map(eng => <option key={eng.id} value={eng.id}>{eng.id} · {eng.service}</option>)}
          </select>
        </label>
        <label>Period
          <select className="input" aria-label="Dashboard period filter" value={periodFilter} onChange={e => { setPeriodFilter(e.target.value); setEngagementFilter('ALL'); }}>
            <option value="ALL">All periods</option>{availableYears.map(year => <option key={year} value={year}>FY {year}</option>)}
          </select>
        </label>
        <label>Assignee
          <select className="input" aria-label="Dashboard assignee filter" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
            <option value="ALL">All assignees</option>{assignees.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label>As-of date
          <input className="input" aria-label="Dashboard as-of date" type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />
        </label>
      </div>

      <section className="panel panel-pad" aria-labelledby="work-queues-title">
        <div className="section-title"><div><h2 id="work-queues-title">My work queues</h2><p className="sub">What needs {state.currentPerson} now, projected from current records in your permitted scope and the filters above. No automation or scheduling.</p></div></div>
        <div className="queue-grid mt12">
          {queues.map(queue => <button key={queue.id} type="button" className={`queue-card tone-${queue.tone}${queue.items.length ? ' has-items' : ''}`} aria-pressed={activeQueue === queue.id} aria-label={`${queue.title}: ${queue.items.length}. ${queue.description}`} onClick={() => setActiveQueue(activeQueue === queue.id ? '' : queue.id)}>
            <span className="queue-top"><span>{queue.title}</span><span className="queue-count">{queue.items.length}</span></span>
            <span className="queue-desc">{queue.description}</span>
          </button>)}
        </div>
      </section>

      {openQueue && <div className="panel" data-testid="work-queue-list">
        <div className="panel-head between"><div><h2>{openQueue.title}</h2><p className="sub">{openQueue.items.length} record(s) in this queue · {openQueue.description}</p></div><button className="btn sm ghost" onClick={() => setActiveQueue('')}>Close queue</button></div>
        <div className="tablewrap"><table><thead><tr><th>Type</th><th>Record</th><th>Engagement</th><th>Status</th><th>Why it is here</th><th>Due</th><th /></tr></thead><tbody>
          {openQueue.items.map(item => <tr key={`${item.kind}-${item.id}`}><td>{item.kind}</td><td><b>{item.label}</b><div className="cell-sub">{item.id}</div></td><td>{item.engagementId || '—'}</td><td><StatusBadge status={item.status} /></td><td className="small">{item.reason}</td><td className="nowrap">{item.due || '—'}</td><td><button className="btn sm" onClick={() => openItem(item)}>Open</button></td></tr>)}
          {!openQueue.items.length && <EmptyTableRow colSpan={7} title="Nothing in this queue" description="Nothing needs your action here within the current scope and filters." />}
        </tbody></table></div>
      </div>}

      {/* Metrics Row */}
      <div className="metric-grid">
        {metric('Active Engagements', activeEngagements, `${clients.length} permitted ${clients.length === 1 ? 'client' : 'clients'}`, '', 'engagements', 'brief')}
        {metric('Awaiting Review', reviews.length, 'Open review points', 'purple', 'reviews', 'message')}
        {metric('Client Requests', openPbc.length, 'Awaiting client or review', 'blue', 'pbc', 'folder')}
        {metric('Ready to Release', ready, 'All visible workpapers and reviews cleared', 'amber', 'ready', 'shield')}
        {metric('My Open Tasks', myTasks.length, `Assigned to ${state.currentPerson}`, 'green', 'tasks', 'checkcircle')}
        {metric('Overdue Work', overdue.length, `As of ${asOfDate}`, 'red', 'overdue', 'clock')}
      </div>

      {activeList && <div className="panel">
        <div className="panel-head between"><div><h2>Filtered work list</h2><p className="sub">{listItems.length} record(s) for the selected dashboard metric and filters · as of {asOfDate}</p></div><button className="btn sm ghost" onClick={() => setActiveList('')}>Close</button></div>
        <div className="tablewrap"><table><thead><tr><th>Type</th><th>Record</th><th>Engagement</th><th>Status</th><th>Due</th><th /></tr></thead><tbody>
          {listItems.map(item => <tr key={`${item.kind}-${item.id}`}><td>{item.kind}</td><td><b>{item.label}</b><div className="cell-sub">{item.id}</div></td><td>{item.engagementId}</td><td><StatusBadge status={item.status} /></td><td className="nowrap">{item.due || '—'}</td><td><button className="btn sm" onClick={() => openItem(item)}>Open</button></td></tr>)}
          {!listItems.length && <EmptyTableRow colSpan={6} variant="filtered" title="No matching records." description="Nothing in your permitted scope matches this metric and the current filters." />}
        </tbody></table></div>
      </div>}

      {financialVisible && <div className="panel panel-pad">
        <div className="panel-head"><div><h2>Billing & Receivables</h2><p className="sub">Issued invoice balances at the practice as-of date, kept separate by currency.</p></div></div>
        <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
          {receivables.map(row => <button key={row.currency} className="btn sm" onClick={() => onNavigate('receivables')}><b>{row.currency}</b> · {formatCurrency(row.totalOutstanding)} outstanding · {row.invoiceBreakdown.length} invoices</button>)}
          {!receivables.length && <span className="sub">No issued invoice balances in this scope.</span>}
        </div>
      </div>}

      {/* Main Grid: Left = Table & Activity; Right = Focus & Distribution */}
      <div className="grid-main">
        <div className="stack" style={{ gap: 20 }}>
          {/* Engagement Portfolio */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Engagement Deadlines</h2>
                <p className="sub">Permitted engagements in target-date order.</p>
              </div>
              <span className="tag gray">As of {asOfDate}</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Client & Engagement</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Target Date</th>
                    <th>Manager</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {engagements.filter(eng => !eng.archive).sort((a, b) => a.due.localeCompare(b.due)).map(eng => {
                    const c = clients.find(x => x.id === eng.client);
                    return (
                      <tr key={eng.id}>
                        <td>
                          <b>{c?.name || 'Client'}</b>
                          <div className="cell-sub">{eng.id} · FY {eng.year}</div>
                        </td>
                        <td>{eng.service}</td>
                        <td>
                          <StatusBadge status={eng.stage} />
                          {eng.lifecycleStatus && eng.lifecycleStatus !== 'Active' && <div className="mt4"><StatusBadge status={eng.lifecycleStatus} /></div>}
                        </td>
                        <td className="nowrap">{eng.due}</td>
                        <td>{eng.manager}</td>
                        <td>
                          <button
                            className="btn sm"
                            onClick={() => {
                              prototypeStore.setSelectedEngagement(eng.id);
                              onNavigate('engagements');
                            }}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!engagements.some(eng => !eng.archive) && <EmptyTableRow colSpan={6} variant={permittedEngagements.length ? 'filtered' : 'scope'} title={permittedEngagements.length ? 'No engagements match these filters' : 'No engagements in your current scope'} description={permittedEngagements.length ? 'Clear the client, engagement or period filter to see the full portfolio.' : undefined} />}
                </tbody>
              </table>
            </div>
          </div>

          {/* Current, data-backed priorities */}
          <div className="panel panel-pad">
            <h3>Your Attention, Where It Matters</h3>
            <p className="sub" style={{ marginBottom: 16 }}>Current work for selected engagement ({currentEng?.id || 'none in scope'}).</p>
            <div className="stack" style={{ gap: 12 }}>
              {myTasks.slice(0, 4).map(item => <div className="taskrow" key={item.id}><div className="taskcheck blue"><Icon name="checkcircle" /></div><div style={{ flex: 1 }}><h4>{item.label}</h4><p className="sub">{item.engagementId} · <StatusBadge status={item.status} /> · Due {item.due || 'not dated'}</p></div><button className="btn sm" onClick={() => openItem(item)}>Open task</button></div>)}
              {!myTasks.length && <p className="sub">No open tasks assigned to you in this scope.</p>}
            </div>
          </div>
        </div>

        {/* Right Stack */}
        <div className="stack" style={{ gap: 20 }}>
          {/* The nearest dated item from the filtered registers */}
          <div className="focus-card">
            <div className="focus-label">Next Attention Item</div>
            {attention ? <><div className="focus-title">{attention.label}</div><p style={{ margin: '10px 0 16px 0', fontSize: 13 }}>{attention.kind} · {attention.engagementId} · {attention.status} · Due {attention.due}</p><button className="btn primary sm" onClick={() => openItem(attention)}>Open work</button></> : <><div className="focus-title">No dated open work</div><p style={{ margin: '10px 0 16px 0', fontSize: 13 }}>No matching tasks, requests, reviews or jobs have a due date.</p></>}
          </div>

          {/* Jobs by status, computed from permitted job records */}
          <div className="panel panel-pad">
            <h3>Jobs by Status</h3>
            <p className="sub" style={{ marginBottom: 12 }}>Filtered to permitted engagements and selected assignee.</p>
            <div className="stage-bars">
              {jobStatusCounts.map(({ status, count }) => <div className="stage-col" key={status}><b>{count}</b><i style={{ height: `${Math.round(count / maxJobCount * 60)}px` }} /><span>{status}</span></div>)}
            </div>
            {!jobs.length && <p className="sub">No jobs in this scope.</p>}
          </div>

          <div className="panel panel-pad"><h3>Recent Clients</h3><div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{recentClients.map(recent => <button key={recent.id} className="btn sm" onClick={() => { setClientFilter(recent.id); setEngagementFilter('ALL'); }}>{recent.name}</button>)}{!recentClients.length && <p className="sub">No recent client activity in this scope.</p>}</div></div>

          {/* Recent Activity */}
          <div className="panel panel-pad">
            <div className="between" style={{ marginBottom: 12 }}>
              <h3>Recent Demo Activity</h3>
              <span className="caption">In-memory log</span>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {events.map((ev, i) => (
                <div key={i} className="activity">
                  <div className="activity-dot">
                    <Icon name={ev.type} size="sm" />
                  </div>
                  <div>
                    <p style={{ fontSize: 12 }}>{ev.text}</p>
                    <small>{ev.ref} · {ev.time}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
