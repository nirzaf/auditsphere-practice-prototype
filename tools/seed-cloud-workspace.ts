import { writeFileSync } from 'node:fs';
import { createTargetScenario } from '../src/store/targetScenario';
import { createInitialState } from '../src/store/initialState';
import { validateFixtures, migratePersistedState } from '../src/services/migrations';

const baseline = createInitialState();
const state = createTargetScenario();
state.firmLedger = [];
const client = structuredClone(baseline.clients[0]);
Object.assign(client, { name: 'Synthetic Demo Trading LLC', tradingName: 'Synthetic Demo Trading', contact: 'Omar Nasser', email: 'management@synthetic-demo.invalid', jurisdiction: 'Qatar', status: 'Prospect', notes: 'Fictional demo company; no professional acceptance recorded.' });
state.clients = [client];
state.contacts = baseline.contacts.filter(contact => contact.clientId === client.id).map(contact => ({ ...contact, email: `contact-${contact.id}@synthetic-demo.invalid` }));
state.roleGrants.push(...baseline.roleGrants.filter(grant => grant.scopeKind === 'Client' && grant.scopeId === client.id));
const lead = structuredClone(baseline.leads[1]);
Object.assign(lead, { name: client.name, convertedClientId: client.id, stage: 'Proposal', accepted: false, terms: false, notes: 'Seeded synthetic lead. Complete the actual proposal and dual-key workflows.' });
state.leads = [lead];
const proposal = structuredClone(baseline.proposals[0]);
Object.assign(proposal, { id: 'PROP-DEMO-001', leadId: lead.id, clientId: client.id, revision: 1, title: 'Synthetic Demo Trading · External Audit FY2026', state: 'Draft', preparedAt: state.asOfDate, clientResponse: undefined, presentedSnapshot: undefined, reviewNote: undefined, approvedBy: undefined, approvedAt: undefined, internalApproval: undefined, dispatchHistory: [] });
proposal.items = [proposal.items[0]];
proposal.commercialReview = undefined;
proposal.totalAmount = proposal.items[0].amount;
proposal.items[0].description = 'External financial statement audit under ISA.';
state.proposals = [proposal];
state.events = [];
const blank = createTargetScenario();
blank.firmLedger = [];
const seeds = [
  { id: 'commercial', title: 'Commercial pipeline', description: 'Fictional client, routed contacts and draft audit proposal. Continue the five-module workflow without fabricated approvals.', state },
  { id: 'blank', title: 'Clean audit lifecycle', description: 'Start with an empty practice and create your own synthetic client and engagement.', state: blank }
];
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
for (const seed of seeds) {
  const issues = validateFixtures(migratePersistedState(seed.state, createInitialState()).state);
  if (issues.length) throw new Error(`${seed.id}: ${issues.map(issue => issue.message).join('; ')}`);
}
writeFileSync('worker/seed.sql', seeds.map(seed => `INSERT INTO workspace_seeds(id,title,description,state_json,created_at,updated_at) VALUES(${quote(seed.id)},${quote(seed.title)},${quote(seed.description)},${quote(JSON.stringify(seed.state))}, strftime('%s','now') * 1000, strftime('%s','now') * 1000) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,state_json=excluded.state_json,updated_at=excluded.updated_at;`).join('\n') + '\n');
console.log(`Generated ${seeds.length} validated synthetic seed snapshots.`);
