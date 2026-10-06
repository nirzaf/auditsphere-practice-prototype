import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { after, before, it } from 'node:test';
import { CdpTab } from '../helpers/cdp.js';
import { launchHeadlessChrome, stopHeadlessChrome, type HeadlessChromeInstance } from '../helpers/headlessChrome.js';
import { startBusinessE2eServer, type BusinessE2eServer } from '../helpers/businessE2eServer.js';

let server: BusinessE2eServer | undefined;
let browserA: HeadlessChromeInstance | undefined;
let browserB: HeadlessChromeInstance | undefined;
let tabA: CdpTab | undefined;
let tabB: CdpTab | undefined;

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function chromeExecutable(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    ...(process.platform === 'win32' ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ] : process.platform === 'darwin' ? [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ] : [
      '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'
    ])
  ];
  return candidates.find(path => path && existsSync(path));
}

async function connectTab(browser: HeadlessChromeInstance, origin: string): Promise<CdpTab> {
  const target = await fetch(`http://127.0.0.1:${browser.port}/json/new?${origin}`, { method: 'PUT' })
    .then(response => response.json()) as { webSocketDebuggerUrl: string };
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('The BUSINESS fieldwork browser could not connect over CDP.')), { once: true });
  });
  const tab = new CdpTab(socket, origin);
  await tab.command('Runtime.enable');
  await tab.command('Page.enable');
  await tab.command('Network.enable');
  await tab.blockExternalHttp();
  return tab;
}

async function waitFor(tab: CdpTab, label: string, predicate: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tab.evaluate<boolean>(predicate)) return;
    await sleep(80);
  }
  const diagnostic = await tab.evaluate<string>(`(() => [
    document.querySelector('.business-fieldwork-panel > .business-alert')?.textContent?.trim() ?? '',
    document.querySelector('.business-fieldwork-panel')?.innerText ?? document.body.innerText.slice(-3000)
  ].join('\\n'))()`);
  throw new Error(`Timed out waiting for ${label}. Fieldwork diagnostics: ${diagnostic}`);
}

function runFixtureSql(sql: string, ...values: unknown[]): void {
  assert.ok(server);
  server.db.prepare(sql).bind(...values).run();
}

async function createFieldworkFixture() {
  assert.ok(server);
  const now = new Date().toISOString();
  const key = randomUUID();
  const response = await fetch(`${server.origin}/api/workspaces`, {
    method: 'POST',
    headers: { Origin: server.origin, 'Content-Type': 'application/json', 'Idempotency-Key': `fieldwork-${key}` },
    body: JSON.stringify({
      name: `Conflict Journey ${key.slice(0, 8)}`,
      currency: 'QAR',
      timezone: 'Asia/Qatar',
      initialPartner: { displayName: 'QA Partner A', naturalPersonKey: `QA-PARTNER-A-${key}`, email: 'partner.a@example.invalid' }
    })
  });
  assert.equal(response.status, 201, 'real Worker bootstrap creates an isolated BUSINESS workspace');
  const workspace = await response.json() as { workspaceId: string; staffMemberId: string; actorProfileId: string };
  const ids = {
    clientId: randomUUID(), standardsId: randomUUID(), engagementId: randomUUID(),
    fileId: randomUUID(), samplingFileId: randomUUID(), systematicSamplingFileId: randomUUID(), importId: randomUUID(), tbVersionId: randomUUID(), tbLineId: randomUUID(),
    fsliId: randomUUID(), mappingDraftId: randomUUID(), mappingDraftLineId: randomUUID(),
    mappingVersionId: randomUUID(), mappingId: randomUUID(), materialityId: randomUUID(),
    planningId: randomUUID(), templateId: randomUUID(), templateStepA: randomUUID(), templateStepB: randomUUID(),
    workprogramId: randomUUID(), procedureA: randomUUID(), procedureB: randomUUID(),
    staffB: randomUUID(), actorB: randomUUID()
  };
  const workspaceId = workspace.workspaceId;
  const contentHash = sha256(`fieldwork-fixture:${key}`);
  const emptyEvidenceHash = sha256('[]');
  const samplingSource = 'reference,amount,description\nMUS-UI-001,1000000.00,Positive invoice for UI sampling acceptance\nMUS-UI-NEG,-25.00,Negative balance for alternate procedures\nMUS-UI-ZERO,0.00,Zero balance for alternate procedures';
  const samplingSourceBytes = new TextEncoder().encode(samplingSource);
  const samplingObjectKey = `e2e/${key}/sampling-population.csv`;
  server!.putTestObject(samplingObjectKey, samplingSourceBytes);
  const systematicSamplingSource = ['reference,amount,description', ...Array.from({ length: 12 }, (_, index) =>
    `SYS-${String(index + 1).padStart(2, '0')},5000.00,Class ${index % 3 + 1}`)].join('\n');
  const systematicSamplingSourceBytes = new TextEncoder().encode(systematicSamplingSource);
  const systematicSamplingObjectKey = `e2e/${key}/systematic-population.csv`;
  server!.putTestObject(systematicSamplingObjectKey, systematicSamplingSourceBytes);

  // This is a setup-only local SQLite fixture. Both browsers read and mutate the same
  // real Worker-backed rows; the fixture itself uses valid persisted provenance pins.
  runFixtureSql(`INSERT INTO staff_members(id,workspace_id,version,natural_person_key,display_name,email,grade,active,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?,?,'PARTNER',1,?,?,?,?)`, ids.staffB, workspaceId, `QA-PARTNER-B-${key}`, 'QA Partner B', 'partner.b@example.invalid', now, now, workspace.actorProfileId, workspace.actorProfileId);
  runFixtureSql(`INSERT INTO actor_profiles(id,workspace_id,version,persona,staff_member_id,contact_id,active,created_at,updated_at)
    VALUES(?,?,1,'APPROVER',?,NULL,1,?,?)`, ids.actorB, workspaceId, ids.staffB, now, now);
  runFixtureSql(`INSERT INTO clients(id,workspace_id,version,code,legal_name,entity_type,industry,address,country_code,active,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,'QA Conflict Client WLL','STANDALONE','Professional services','Doha, Qatar','QA',1,?,?,?,?)`,
  ids.clientId, workspaceId, `QA-${key.slice(0, 12)}`, now, now, workspace.actorProfileId, workspace.actorProfileId);
  runFixtureSql(`INSERT INTO standards_profiles(id,workspace_id,version,name,effective_period_start,effective_period_end,isa_220_edition,isa_570_edition,
    reporting_framework,presentation_edition,early_adoption,approved_by_actor_id,approved_at,content_sha256,created_at,updated_at)
    VALUES(?,?,1,'QA approved standards','2026-01-01','2026-12-31','ISA 220 QA edition','ISA 570 QA edition','QA IFRS','IAS1',0,?,?,?,?,?)`,
  ids.standardsId, workspaceId, workspace.actorProfileId, now, contentHash, now, now);
  runFixtureSql(`INSERT INTO engagements(id,workspace_id,version,client_id,code,period_start,period_end,engagement_type,lifecycle_state,contract_fee_minor,
    standards_profile_id,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?,'2026-01-01','2026-12-31','STATUTORY_AUDIT','FIELDWORK_EXECUTION',0,?,?,?,?,?)`,
  ids.engagementId, workspaceId, ids.clientId, `QA-ENG-${key.slice(0, 12)}`, ids.standardsId, now, now, workspace.actorProfileId, workspace.actorProfileId);
  runFixtureSql(`INSERT INTO file_versions(id,workspace_id,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,?,?,'qa-trial-balance.csv','text/csv',0,?,?,'TB','COMMITTED',?,1,?,?,?,?)`,
  ids.fileId, workspaceId, ids.clientId, ids.engagementId, contentHash, `e2e/${key}/tb.csv`, now, now, now, workspace.actorProfileId, workspace.actorProfileId);
  runFixtureSql(`INSERT INTO file_versions(id,workspace_id,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,?,?,'qa-sampling-population.csv','text/csv',?,?,?,'EVIDENCE','COMMITTED',?,1,?,?,?,?)`,
  ids.samplingFileId, workspaceId, ids.clientId, ids.engagementId, samplingSourceBytes.length, sha256(samplingSource), samplingObjectKey,
  now, now, now, workspace.actorProfileId, workspace.actorProfileId);
  runFixtureSql(`INSERT INTO file_versions(id,workspace_id,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,?,?,'qa-systematic-population.csv','text/csv',?,?,?,'EVIDENCE','COMMITTED',?,1,?,?,?,?)`,
  ids.systematicSamplingFileId, workspaceId, ids.clientId, ids.engagementId, systematicSamplingSourceBytes.length, sha256(systematicSamplingSource), systematicSamplingObjectKey,
  now, now, now, workspace.actorProfileId, workspace.actorProfileId);
  runFixtureSql(`INSERT INTO tb_imports(id,workspace_id,version,client_id,engagement_id,file_version_id,status,worksheet,column_map_json,row_count,source_sha256,
    current_debits_minor,current_credits_minor,prior_debits_minor,prior_credits_minor,error_count,errors_json,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,1,?,? ,?,'ACTIVATED','Sheet1','{}',1,?,0,0,NULL,NULL,0,'[]',?,?,?)`,
  ids.importId, workspaceId, ids.clientId, ids.engagementId, ids.fileId, contentHash, workspace.actorProfileId, now, now);
  runFixtureSql(`INSERT INTO tb_versions(id,workspace_id,client_id,engagement_id,revision,import_id,period_start,period_end,currency,current_debits_minor,current_credits_minor,
    prior_debits_minor,prior_credits_minor,prior_present,row_count,content_sha256,accepted_by_actor_id,accepted_at)
    VALUES(?,?,?, ?,1,?,'2026-01-01','2026-12-31','QAR',0,0,NULL,NULL,0,1,?,?,?)`,
  ids.tbVersionId, workspaceId, ids.clientId, ids.engagementId, ids.importId, contentHash, workspace.actorProfileId, now);
  runFixtureSql(`INSERT INTO tb_lines(id,workspace_id,client_id,engagement_id,tb_version_id,source_row_number,account_code,account_name,current_minor,prior_minor,source_text_json)
    VALUES(?,?,?,?,?,1,'QA-000','Synthetic zero balance',0,NULL,'{}')`,
  ids.tbLineId, workspaceId, ids.clientId, ids.engagementId, ids.tbVersionId);
  runFixtureSql(`INSERT INTO fsli_catalog(id,workspace_id,reporting_framework,code,name,statement,category,normal_side,display_sign,presentation_order,active)
    VALUES(?,?,'QA IFRS','QA-REV','Synthetic revenue','PROFIT_LOSS','REVENUE','CREDIT',1,1,1)`, ids.fsliId, workspaceId);
  runFixtureSql(`INSERT INTO mapping_drafts(id,workspace_id,client_id,engagement_id,tb_version_id,revision,status,reporting_framework,content_sha256,created_by_actor_id,created_at)
    VALUES(?,?,?,?,?,1,'APPROVED','QA IFRS',?,?,?)`,
  ids.mappingDraftId, workspaceId, ids.clientId, ids.engagementId, ids.tbVersionId, contentHash, workspace.actorProfileId, now);
  runFixtureSql(`INSERT INTO mapping_draft_lines(id,workspace_id,version,draft_id,tb_line_id,fsli_id,origin,confirmed,reason)
    VALUES(?,?,1,?,?,?,'MANUAL',1,'Synthetic accepted FSLI mapping')`,
  ids.mappingDraftLineId, workspaceId, ids.mappingDraftId, ids.tbLineId, ids.fsliId);
  runFixtureSql(`INSERT INTO mapping_versions(id,workspace_id,client_id,engagement_id,tb_version_id,draft_id,revision,reporting_framework,content_sha256,approved_by_actor_id,approved_at)
    VALUES(?,?,?,?,?,?,1,'QA IFRS',?,?,?)`,
  ids.mappingVersionId, workspaceId, ids.clientId, ids.engagementId, ids.tbVersionId, ids.mappingDraftId, contentHash, workspace.actorProfileId, now);
  runFixtureSql(`INSERT INTO tb_mappings(id,workspace_id,mapping_version_id,tb_line_id,fsli_id,origin,rationale)
    VALUES(?,?,?, ?,?,'MANUAL','Synthetic accepted mapping')`,
  ids.mappingId, workspaceId, ids.mappingVersionId, ids.tbLineId, ids.fsliId);
  runFixtureSql(`INSERT INTO materiality_versions(id,workspace_id,client_id,engagement_id,revision,tb_version_id,mapping_version_id,benchmark,benchmark_minor,
    normalization_minor,benchmark_rate_bps,performance_rate_bps,sad_rate_bps,pm_raw_numerator,pm_raw_denominator,te_raw_numerator,te_raw_denominator,
    sad_raw_numerator,sad_raw_denominator,planning_minor,performance_minor,sad_minor,calculated_by_actor_id,calculated_at,source_sha256)
    VALUES(?,?,?,?,1,?,?,'REVENUE',100000,0,1000,750,100,'10000','1000000','1000','1000000','100','1000000',10000,1000,100,?,?,?)`,
  ids.materialityId, workspaceId, ids.clientId, ids.engagementId, ids.tbVersionId, ids.mappingVersionId, workspace.actorProfileId, now, contentHash);
  runFixtureSql(`INSERT INTO planning_versions(id,workspace_id,client_id,engagement_id,revision,tb_version_id,mapping_version_id,materiality_version_id,standards_profile_id,
    scope_text,strategy_text,staffing_snapshot_json,milestone_snapshot_json,risk_snapshot_json,pbc_dependency_snapshot_json,source_sha256,prepared_by_actor_id,prepared_at)
    VALUES(?,?,?,?,1,?,?,?,?, 'Synthetic fieldwork scope','Synthetic audit strategy','{}','[]','[]','[]',?,?,?)`,
  ids.planningId, workspaceId, ids.clientId, ids.engagementId, ids.tbVersionId, ids.mappingVersionId, ids.materialityId, ids.standardsId, contentHash, workspace.actorProfileId, now);
  runFixtureSql(`INSERT INTO planning_signoffs(id,workspace_id,planning_version_id,partner_actor_id,approved_at,rationale,dependency_sha256)
    VALUES(?,?,?, ?,?,'QA fixture approval for local browser acceptance',?)`, randomUUID(), workspaceId, ids.planningId, workspace.actorProfileId, now, contentHash);
  runFixtureSql(`UPDATE engagements SET active_tb_version_id=?,active_mapping_version_id=?,active_materiality_version_id=?,approved_planning_version_id=? WHERE workspace_id=? AND id=?`,
    ids.tbVersionId, ids.mappingVersionId, ids.materialityId, ids.planningId, workspaceId, ids.engagementId);
  runFixtureSql(`INSERT INTO workprogram_templates(id,workspace_id,version,fsli_code,revision,title,standards_profile_id,procedures_json,status,approved_by_actor_id,approved_at,created_by_actor_id,created_at)
    VALUES(?,?,1,'QA-REV',1,'Synthetic conflict workprogram',?,?,'APPROVED',?,?,?,?)`,
  ids.templateId, workspaceId, ids.standardsId,
  JSON.stringify([
    { title: 'Same-row concurrent edits', instructions: 'Inspect the synthetic source row and preserve the review trail.', assertion: 'COMPLETENESS', mandatory: true },
    { title: 'Explicit draft discard', instructions: 'Inspect the synthetic source row and preserve the review trail.', assertion: 'VALUATION', mandatory: true }
  ]), workspace.actorProfileId, now, workspace.actorProfileId, now);
  runFixtureSql(`INSERT INTO procedure_templates(id,workspace_id,template_id,ordinal,title,instructions,assertion,mandatory)
    VALUES(?,?,?,1,'Same-row concurrent edits','Inspect the synthetic source row and preserve the review trail.','COMPLETENESS',1)`,
  ids.templateStepA, workspaceId, ids.templateId);
  runFixtureSql(`INSERT INTO procedure_templates(id,workspace_id,template_id,ordinal,title,instructions,assertion,mandatory)
    VALUES(?,?,?,2,'Explicit draft discard','Inspect the synthetic source row and preserve the review trail.','VALUATION',1)`,
  ids.templateStepB, workspaceId, ids.templateId);
  runFixtureSql(`INSERT INTO workprograms(id,workspace_id,version,client_id,engagement_id,fsli_id,template_id,planning_version_id,risk_band,assigned_staff_id,status,source_hash,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,1,?,?,?,?,?,'GREEN',?,'IN_PROGRESS',?,?,?,?)`,
  ids.workprogramId, workspaceId, ids.clientId, ids.engagementId, ids.fsliId, ids.templateId, ids.planningId,
  workspace.staffMemberId, contentHash, workspace.actorProfileId, now, now);
  const steps = [
    { id: ids.procedureA, stepId: ids.templateStepA, ordinal: 1, title: 'Same-row concurrent edits', assertion: 'COMPLETENESS' },
    { id: ids.procedureB, stepId: ids.templateStepB, ordinal: 2, title: 'Explicit draft discard', assertion: 'VALUATION' }
  ];
  for (const step of steps) {
    const snapshot = JSON.stringify({ version: 1, workprogramId: ids.workprogramId, ordinal: step.ordinal, title: step.title,
      instructions: 'Inspect the synthetic source row and preserve the review trail.', assertion: step.assertion,
      origin: 'STANDARD', mandatory: true, scopeReason: null, workPerformed: null, conclusion: null, applicable: true, status: 'NOT_STARTED' });
    runFixtureSql(`INSERT INTO procedures(id,workspace_id,version,workprogram_id,template_step_id,ordinal,title,instructions,assertion,origin,mandatory,scope_reason,
      work_performed,conclusion,applicable,not_applicable_reason,status,prepared_by_staff_id,executed_by_staff_id,evidence_set_hash,source_hash,created_at,updated_at)
      VALUES(?,?,1,?,?,?,?,? ,?,'STANDARD',1,NULL,NULL,NULL,1,NULL,'NOT_STARTED',NULL,NULL,?,?,?,?)`,
    step.id, workspaceId, ids.workprogramId, step.stepId, step.ordinal, step.title,
    'Inspect the synthetic source row and preserve the review trail.', step.assertion, emptyEvidenceHash, contentHash, now, now);
    runFixtureSql(`INSERT INTO procedure_revisions(id,workspace_id,procedure_id,row_version,content_snapshot_json,evidence_set_hash,changed_by_actor_id,changed_at,reason)
      VALUES(?,?,?,1,?,?,?, ?,NULL)`, randomUUID(), workspaceId, step.id, snapshot, emptyEvidenceHash, workspace.actorProfileId, now);
  }

  return { ...workspace, ...ids, name: `Conflict Journey ${key.slice(0, 8)}` };
}

async function selectWorkspace(tab: CdpTab, fixture: Awaited<ReturnType<typeof createFieldworkFixture>>, actorId: string): Promise<void> {
  await tab.evaluate(`localStorage.removeItem('auditsphere.business-context.v1')`);
  await tab.command('Page.navigate', { url: server!.origin });
  await waitFor(tab, 'the isolated local BUSINESS landing page', `document.querySelector('#production-workspace-heading')?.textContent?.trim() === 'Open your business workspace'`);
  const preference = { version: 1, workspaceId: fixture.workspaceId, actorId, persona: 'APPROVER', clientId: fixture.clientId, engagementId: fixture.engagementId };
  await tab.evaluate(`localStorage.setItem('auditsphere.business-context.v1', ${JSON.stringify(JSON.stringify(preference))})`);
  await tab.command('Page.reload');
  await waitFor(tab, 'the selected distinct Partner profile and BUSINESS workspace', `
    document.querySelector('#business-workspace-heading')?.textContent?.trim() === ${JSON.stringify(fixture.name)} &&
    document.querySelector('#business-active-persona')?.selectedOptions[0]?.textContent?.includes('APPROVER') &&
    document.querySelector('.business-actor-summary')?.textContent?.includes('PARTNER')`);
  await waitFor(tab, 'the Worker-projected engagement fieldwork panel', `
    document.querySelector('#business-fieldwork-heading')?.getClientRects().length === 1 &&
    !!document.querySelector('.business-fieldwork-tabs button')`);
  const observed = await tab.evaluate<{ workspaceId: string; actorId: string; procedureCount: number }>(`({
    workspaceId: JSON.parse(localStorage.getItem('auditsphere.business-context.v1') ?? '{}').workspaceId,
    actorId: JSON.parse(localStorage.getItem('auditsphere.business-context.v1') ?? '{}').actorId,
    procedureCount: document.querySelectorAll('.business-fieldwork-procedure').length
  })`);
  assert.equal(observed.workspaceId, fixture.workspaceId);
  assert.equal(observed.actorId, actorId);
  assert.equal(observed.procedureCount, 0, 'procedures remain behind the visible Workprograms tab');
}

async function openWorkprograms(tab: CdpTab): Promise<void> {
  const visibleTabs = await tab.evaluate<string[]>(`[...document.querySelectorAll('.business-fieldwork-tabs button')].map(button => button.textContent?.trim() ?? '')`);
  assert.ok(visibleTabs.includes('Workprograms'), 'the observed fieldwork tab navigation includes Workprograms');
  const clicked = await tab.evaluate<boolean>(`(() => {
    const button = [...document.querySelectorAll('.business-fieldwork-tabs button')].find(item => item.textContent?.trim() === 'Workprograms');
    if (!button || button.disabled || !button.getClientRects().length) return false;
    button.click(); return true;
  })()`);
  assert.equal(clicked, true, 'the visible Workprograms tab is actionable');
  await waitFor(tab, 'the two server-backed procedures', `document.querySelectorAll('.business-fieldwork-procedure').length === 2`);
}

async function readProcedure(tab: CdpTab, title: string): Promise<{ version: string; workPerformed: string; conclusion: string; conflict: boolean; saveDisabled: boolean } | null> {
  return tab.evaluate<{ version: string; workPerformed: string; conclusion: string; conflict: boolean; saveDisabled: boolean } | null>(`(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(title)}));
    if (!article) return null;
    const fields = [...article.querySelectorAll('label')];
    const work = fields.find(item => item.textContent?.includes('Work performed'))?.querySelector('textarea');
    const conclusion = fields.find(item => item.textContent?.includes('Conclusion'))?.querySelector('textarea');
    const save = [...article.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Save work');
    return { version: article.querySelector('.business-section-heading > span')?.textContent?.trim() ?? '',
      workPerformed: work?.value ?? '', conclusion: conclusion?.value ?? '',
      conflict: !!article.querySelector('.business-fieldwork-conflict'), saveDisabled: save?.disabled ?? true };
  })()`);
}

async function editProcedure(tab: CdpTab, title: string, workPerformed: string, conclusion: string): Promise<void> {
  const observed = await readProcedure(tab, title);
  assert.ok(observed, `procedure ${title} is visible before editing`);
  const filled = await tab.evaluate<boolean>(`(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(title)}));
    if (!article) return false;
    const fields = [...article.querySelectorAll('label')];
    const work = fields.find(item => item.textContent?.includes('Work performed'))?.querySelector('textarea');
    const conclusion = fields.find(item => item.textContent?.includes('Conclusion'))?.querySelector('textarea');
    if (!(work instanceof HTMLTextAreaElement) || !(conclusion instanceof HTMLTextAreaElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(work, ${JSON.stringify(workPerformed)}); work.dispatchEvent(new Event('input', { bubbles: true })); work.dispatchEvent(new Event('change', { bubbles: true }));
    setter?.call(conclusion, ${JSON.stringify(conclusion)}); conclusion.dispatchEvent(new Event('input', { bubbles: true })); conclusion.dispatchEvent(new Event('change', { bubbles: true }));
    return work.value === ${JSON.stringify(workPerformed)} && conclusion.value === ${JSON.stringify(conclusion)};
  })()`);
  assert.equal(filled, true, 'both visible draft fields accepted the intended changes');
}

async function clickProcedureButton(tab: CdpTab, title: string, buttonLabel: string): Promise<void> {
  const clicked = await tab.evaluate<boolean>(`(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(title)}));
    const button = [...(article?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === ${JSON.stringify(buttonLabel)});
    if (!button || button.disabled || !button.getClientRects().length) return false;
    button.click(); return true;
  })()`);
  assert.equal(clicked, true, `visible enabled "${buttonLabel}" action exists for ${title}`);
}

async function clickVisibleButton(tab: CdpTab, buttonLabel: string): Promise<void> {
  const clicked = await tab.evaluate<boolean>(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === ${JSON.stringify(buttonLabel)});
    if (!button || button.disabled || !button.getClientRects().length) return false;
    button.click(); return true;
  })()`);
  assert.equal(clicked, true, `visible enabled "${buttonLabel}" action is available`);
}

async function clickWhenEnabled(tab: CdpTab, buttonLabel: string, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const clicked = await tab.evaluate<boolean>(`(() => {
      const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === ${JSON.stringify(buttonLabel)});
      if (!button || button.disabled || !button.getClientRects().length) return false;
      button.click(); return true;
    })()`);
    if (clicked) return;
    await sleep(80);
  }
  const state = await tab.evaluate<string>(`[...document.querySelectorAll('button')]
    .filter(item => item.textContent?.trim() === ${JSON.stringify(buttonLabel)})
    .map(item => JSON.stringify({ disabled: item.disabled, visible: !!item.getClientRects().length, text: item.textContent?.trim() }))
    .join('; ')`);
  throw new Error(`Timed out waiting to click "${buttonLabel}". Matching controls: ${state || 'none'}`);
}

async function setVisibleFieldByLabel(tab: CdpTab, labelText: string, value: string, optionText?: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const filled = await tab.evaluate<boolean>(`(() => {
      const control = [...document.querySelectorAll('label.business-field')]
        .filter(item => item.querySelector('span')?.textContent?.trim() === ${JSON.stringify(labelText)})
        .map(item => item.querySelector('input,textarea,select'))
        .find(item => !!item?.getClientRects().length);
      if (!control) return false;
      let nextValue = ${JSON.stringify(value)};
      if (control instanceof HTMLSelectElement && ${JSON.stringify(optionText ?? null)}) {
        const option = [...control.options].find(item => item.textContent?.includes(${JSON.stringify(optionText ?? '')}));
        if (!option) return false;
        nextValue = option.value;
      }
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value')?.set;
      setter?.call(control, nextValue);
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (filled) return;
    await sleep(80);
  }
  const availableFields = await tab.evaluate<string[]>(`[...document.querySelectorAll('label.business-field span')].map(item => item.textContent?.trim() ?? '')`);
  const matchingFields = await tab.evaluate<Array<{ visible: boolean; tag: string | null }>>(`([...document.querySelectorAll('label.business-field')]
    .filter(item => item.querySelector('span')?.textContent?.trim() === ${JSON.stringify(labelText)})
    .map(item => { const control = item.querySelector('input,textarea,select'); return { visible: !!control?.getClientRects().length, tag: control?.tagName ?? null }; }))`);
  assert.fail(`the visible "${labelText}" field did not accept the intended value. Matching fields: ${JSON.stringify(matchingFields)}. Available fields: ${availableFields.join(', ')}`);
}

before(async () => {
  server = await startBusinessE2eServer();
  const executable = chromeExecutable();
  assert.ok(executable, 'Chrome or Edge is available for the two-browser acceptance journey.');
  browserA = await launchHeadlessChrome(executable, { profilePrefix: 'auditsphere-conflict-a-', timeoutMs: 45000 });
  browserB = await launchHeadlessChrome(executable, { profilePrefix: 'auditsphere-conflict-b-', timeoutMs: 45000 });
  [tabA, tabB] = await Promise.all([connectTab(browserA, server.origin), connectTab(browserB, server.origin)]);
}, { timeout: 120000 });

after(async () => {
  tabA?.close();
  tabB?.close();
  if (browserA) {
    await stopHeadlessChrome(browserA.child);
    rmSync(browserA.profileDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
  if (browserB) {
    await stopHeadlessChrome(browserB.child);
    rmSync(browserB.profileDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
  if (server) await server.close();
});

it('US-FLD-006 preserves same-procedure drafts across a two-browser version conflict and requires rebase or discard', { timeout: 120000 }, async () => {
  assert.ok(server && tabA && tabB);
  const fixture = await createFieldworkFixture();

  // Observe each isolated browser before switching into the same BUSINESS workspace.
  await Promise.all([selectWorkspace(tabA, fixture, fixture.actorProfileId), selectWorkspace(tabB, fixture, fixture.actorB)]);
  const actors = await Promise.all([tabA, tabB].map(tab => tab!.evaluate<{ actorId: string; persona: string }>(`(() => {
    const preference = JSON.parse(localStorage.getItem('auditsphere.business-context.v1') ?? '{}');
    return { actorId: preference.actorId, persona: preference.persona };
  })()`)));
  assert.deepEqual(actors, [
    { actorId: fixture.actorProfileId, persona: 'APPROVER' },
    { actorId: fixture.actorB, persona: 'APPROVER' }
  ], 'the two browser profiles hold separate Partner identities for one shared engagement');
  await Promise.all([openWorkprograms(tabA), openWorkprograms(tabB)]);

  const firstTitle = 'Same-row concurrent edits';
  const baseA = await readProcedure(tabA, firstTitle);
  const baseB = await readProcedure(tabB, firstTitle);
  assert.equal(baseA?.version, 'v1');
  assert.equal(baseB?.version, 'v1');
  assert.equal(baseA?.workPerformed, '');
  assert.equal(baseB?.workPerformed, '');

  // Act: each profile edits the same row while both still observe v1.
  const workA = 'Partner A inspected the synthetic source row and matched its zero balance.';
  const conclusionA = 'Partner A found no exception in the synthetic source record.';
  const workB = 'Partner B reperformed the synthetic source check and retained separate notes.';
  const conclusionB = 'Partner B agrees the record is complete after independent reperformance.';
  await Promise.all([editProcedure(tabA, firstTitle, workA, conclusionA), editProcedure(tabB, firstTitle, workB, conclusionB)]);
  assert.equal((await readProcedure(tabA, firstTitle))?.workPerformed, workA);
  assert.equal((await readProcedure(tabB, firstTitle))?.workPerformed, workB);

  // Both browsers submit while holding v1. Exactly one request may create v2;
  // the other must surface the server's conflict with its local draft intact.
  await Promise.all([
    clickProcedureButton(tabA, firstTitle, 'Save work'),
    clickProcedureButton(tabB, firstTitle, 'Save work')
  ]);
  const waitForConcurrentOutcome = async (tab: CdpTab, actor: string) => waitFor(tab, `${actor} concurrent v1 write outcome`, `(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(firstTitle)}));
    return article?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v2' &&
      (!!article.querySelector('.business-fieldwork-conflict') ||
        document.querySelector('.business-fieldwork-panel [role="status"]')?.textContent?.includes('Procedure work and conclusion saved'));
  })()`);
  await Promise.all([waitForConcurrentOutcome(tabA, 'Partner A'), waitForConcurrentOutcome(tabB, 'Partner B')]);
  const resultA = await readProcedure(tabA, firstTitle);
  const resultB = await readProcedure(tabB, firstTitle);
  assert.equal(resultA?.version, 'v2');
  assert.equal(resultB?.version, 'v2');
  assert.notEqual(resultA?.conflict, resultB?.conflict, 'exactly one browser sees the stale-write conflict');
  const winnerIsA = resultA?.conflict === false;
  const winnerActor = winnerIsA ? fixture.actorProfileId : fixture.actorB;
  const loserActor = winnerIsA ? fixture.actorB : fixture.actorProfileId;
  const winnerWork = winnerIsA ? workA : workB;
  const loserWork = winnerIsA ? workB : workA;
  const loserConclusion = winnerIsA ? conclusionB : conclusionA;
  const loserTab = winnerIsA ? tabB : tabA;
  const winnerView = winnerIsA ? resultA : resultB;
  const loserView = winnerIsA ? resultB : resultA;
  assert.equal(winnerView?.workPerformed, winnerWork);
  assert.equal(loserView?.workPerformed, loserWork, 'the stale writer keeps its own draft after the 409');
  assert.equal(loserView?.conflict, true);
  assert.equal(loserView?.saveDisabled, true, 'the ordinary save action cannot silently overwrite a newer row');
  const visibleConflict = await loserTab.evaluate<boolean>(`(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(firstTitle)}));
    const conflict = article?.querySelector('.business-fieldwork-conflict');
    return !!conflict?.textContent?.includes('base is v1; the server is now v2') &&
      !!conflict.textContent.includes(${JSON.stringify(winnerWork)}) && !!conflict.textContent.includes(${JSON.stringify(loserWork)});
  })()`);
  assert.equal(visibleConflict, true, 'base, local, and server values are visible together for deliberate resolution');

  const beforeRebase = server.db.prepare(`SELECT version,
      (SELECT COUNT(*) FROM procedure_revisions r WHERE r.workspace_id=p.workspace_id AND r.procedure_id=p.id) AS revisions,
      (SELECT changed_by_actor_id FROM procedure_revisions r WHERE r.workspace_id=p.workspace_id AND r.procedure_id=p.id AND r.row_version=2) AS v2_actor,
      (SELECT COUNT(*) FROM audit_events e WHERE e.workspace_id=p.workspace_id AND e.entity_id=p.id AND e.command_type='procedure.update') AS update_events
    FROM procedures p WHERE p.workspace_id=? AND p.id=?`).bind(fixture.workspaceId, fixture.procedureA)
    .first<{ version: number; revisions: number; v2_actor: string; update_events: number }>();
  assert.ok(beforeRebase);
  assert.deepEqual({ ...beforeRebase }, { version: 2, revisions: 2, v2_actor: winnerActor, update_events: 1 },
    'the race produces one v2 row revision and one corresponding audit event');

  // The losing Partner explicitly rebases onto the reviewed v2 and commits v3.
  await clickProcedureButton(loserTab, firstTitle, 'Rebase draft onto v2 and save');
  await waitFor(loserTab, 'the explicit v3 rebase to save and clear the conflict', `(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(firstTitle)}));
    return article?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v3' &&
      !article.querySelector('.business-fieldwork-conflict') &&
      document.querySelector('.business-fieldwork-panel [role="status"]')?.textContent?.includes('saved against the server version you reviewed');
  })()`);
  const savedFirst = server.db.prepare(`SELECT p.version,p.work_performed,p.conclusion,
      (SELECT COUNT(*) FROM procedure_revisions r WHERE r.workspace_id=p.workspace_id AND r.procedure_id=p.id) AS revisions,
      (SELECT changed_by_actor_id FROM procedure_revisions r WHERE r.workspace_id=p.workspace_id AND r.procedure_id=p.id AND r.row_version=2) AS v2_actor,
      (SELECT changed_by_actor_id FROM procedure_revisions r WHERE r.workspace_id=p.workspace_id AND r.procedure_id=p.id AND r.row_version=3) AS v3_actor,
      (SELECT COUNT(*) FROM audit_events e WHERE e.workspace_id=p.workspace_id AND e.entity_id=p.id AND e.command_type='procedure.update') AS update_events
    FROM procedures p WHERE p.workspace_id=? AND p.id=?`).bind(fixture.workspaceId, fixture.procedureA)
    .first<{ version: number; work_performed: string; conclusion: string; revisions: number; v2_actor: string; v3_actor: string; update_events: number }>();
  assert.ok(savedFirst);
  assert.deepEqual({ ...savedFirst }, {
    version: 3, work_performed: loserWork, conclusion: loserConclusion, revisions: 3, update_events: 2,
    v2_actor: winnerActor, v3_actor: loserActor
  }, 'the Worker stores both concurrent revisions with the correct distinct human actors');

  // Repeat the stale write for the second row, then explicitly discard B and keep A's server revision.
  const secondTitle = 'Explicit draft discard';
  assert.equal((await readProcedure(tabA, secondTitle))?.version, 'v1');
  assert.equal((await readProcedure(tabB, secondTitle))?.version, 'v1');
  const discardWorkA = 'Partner A inspected the second source row and documented the comparison.';
  const discardConclusionA = 'Partner A retained the server copy after checking the source row.';
  const discardWorkB = 'Partner B wrote an alternative draft that must not overwrite the server.';
  const discardConclusionB = 'Partner B keeps this local draft only until choosing discard.';
  await Promise.all([editProcedure(tabA, secondTitle, discardWorkA, discardConclusionA), editProcedure(tabB, secondTitle, discardWorkB, discardConclusionB)]);
  await clickProcedureButton(tabA, secondTitle, 'Save work');
  await waitFor(tabA, 'Partner A saves the second row as v2', `(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(secondTitle)}));
    return article?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v2';
  })()`);
  await clickProcedureButton(tabB, secondTitle, 'Save work');
  await waitFor(tabB, 'the second v1-to-v2 conflict', `(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(secondTitle)}));
    return article?.querySelector('.business-fieldwork-conflict')?.textContent?.includes('base is v1; the server is now v2');
  })()`);
  await clickProcedureButton(tabB, secondTitle, 'Discard draft and use server version');
  await waitFor(tabB, 'discard to remove the conflict and replace both fields with server v2', `(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(secondTitle)}));
    const fields = [...article.querySelectorAll('label')];
    const work = fields.find(item => item.textContent?.includes('Work performed'))?.querySelector('textarea');
    const conclusion = fields.find(item => item.textContent?.includes('Conclusion'))?.querySelector('textarea');
    return article?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v2' &&
      !article.querySelector('.business-fieldwork-conflict') && work?.value === ${JSON.stringify(discardWorkA)} &&
      conclusion?.value === ${JSON.stringify(discardConclusionA)};
  })()`);
  const discarded = server.db.prepare(`SELECT version,work_performed,conclusion,
      (SELECT COUNT(*) FROM procedure_revisions r WHERE r.workspace_id=p.workspace_id AND r.procedure_id=p.id) AS revisions,
      (SELECT COUNT(*) FROM audit_events e WHERE e.workspace_id=p.workspace_id AND e.entity_id=p.id AND e.command_type='procedure.update') AS update_events
    FROM procedures p WHERE p.workspace_id=? AND p.id=?`).bind(fixture.workspaceId, fixture.procedureB)
    .first<{ version: number; work_performed: string; conclusion: string; revisions: number; update_events: number }>();
  assert.ok(discarded);
  assert.deepEqual({ ...discarded }, { version: 2, work_performed: discardWorkA, conclusion: discardConclusionA, revisions: 2, update_events: 1 },
    'discard preserves the server revision and creates no revision or audit event for the local draft');

  // Independent procedure rows are not serialized behind a workspace-wide expectedVersion.
  await Promise.all([clickVisibleButton(tabA, 'Refresh records'), clickVisibleButton(tabB, 'Refresh records')]);
  await Promise.all([
    waitFor(tabA, 'Partner A to refresh the current row versions', `(() => {
      const first = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(firstTitle)}));
      const second = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(secondTitle)}));
      return first?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v3' && second?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v2';
    })()`),
    waitFor(tabB, 'Partner B to refresh the current row versions', `(() => {
      const first = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(firstTitle)}));
      const second = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(secondTitle)}));
      return first?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v3' && second?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v2';
    })()`)
  ]);
  const independentWorkA = 'Partner A completed a separate row while Partner B handled another procedure.';
  const independentConclusionA = 'Partner A recorded a conclusion scoped only to the first procedure.';
  const independentWorkB = 'Partner B completed a different row without changing Partner A work.';
  const independentConclusionB = 'Partner B recorded a conclusion scoped only to the second procedure.';
  await Promise.all([
    editProcedure(tabA, firstTitle, independentWorkA, independentConclusionA),
    editProcedure(tabB, secondTitle, independentWorkB, independentConclusionB)
  ]);
  await Promise.all([
    clickProcedureButton(tabA, firstTitle, 'Save work'),
    clickProcedureButton(tabB, secondTitle, 'Save work')
  ]);
  await Promise.all([
    waitFor(tabA, 'the independent first-row save at v4', `(() => {
      const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(firstTitle)}));
      return article?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v4' && !article.querySelector('.business-fieldwork-conflict');
    })()`),
    waitFor(tabB, 'the independent second-row save at v3', `(() => {
      const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(secondTitle)}));
      return article?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v3' && !article.querySelector('.business-fieldwork-conflict');
    })()`)
  ]);
  const independentRows = server.db.prepare(`SELECT p.id,p.version,p.work_performed,p.conclusion,
      (SELECT COUNT(*) FROM audit_events e WHERE e.workspace_id=p.workspace_id AND e.entity_id=p.id AND e.command_type='procedure.update') AS update_events
    FROM procedures p WHERE p.workspace_id=? AND p.id IN (?,?) ORDER BY p.ordinal`)
    .bind(fixture.workspaceId, fixture.procedureA, fixture.procedureB).all<{ id: string; version: number; work_performed: string; conclusion: string; update_events: number }>().results;
  assert.deepEqual(independentRows.map(row => ({ ...row })), [
    { id: fixture.procedureA, version: 4, work_performed: independentWorkA, conclusion: independentConclusionA, update_events: 3 },
    { id: fixture.procedureB, version: 3, work_performed: independentWorkB, conclusion: independentConclusionB, update_events: 2 }
  ], 'simultaneous writes to different procedure rows both commit with row-local versions and one audit event per write');

  // Partner A captures the current cursor. A later change from B must advance that
  // cursor and refresh A's server rows while retaining any local drafts.
  await clickVisibleButton(tabA, 'Refresh records');
  await waitFor(tabA, 'Partner A to observe current rows before advancing the change cursor', `(() => {
    const first = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(firstTitle)}));
    const second = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(secondTitle)}));
    return first?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v4' && second?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v3';
  })()`);
  await clickVisibleButton(tabA, 'Evidence');
  await waitFor(tabA, 'the review queue change feed', `!![...document.querySelectorAll('.business-fieldwork-card h3')].find(item => item.textContent?.trim() === 'Change feed')`);
  const cursorBefore = await tabA.evaluate<number>(`(() => {
    const text = [...document.querySelectorAll('.business-fieldwork-card p')].find(item => item.textContent?.trim().startsWith('Cursor '))?.textContent ?? '';
    return Number(text.match(/Cursor (\\d+)/)?.[1] ?? -1);
  })()`);
  assert.ok(cursorBefore >= 5, 'Partner A has observed the preceding procedure change events');

  const changeWorkB = 'Partner B added another scoped note after Partner A captured the cursor.';
  const changeConclusionB = 'Partner B refreshed the second procedure without editing the first row.';
  await editProcedure(tabB, secondTitle, changeWorkB, changeConclusionB);
  await clickProcedureButton(tabB, secondTitle, 'Save work');
  await waitFor(tabB, 'Partner B saves a new event beyond Partner A cursor', `(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(secondTitle)}));
    return article?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v4';
  })()`);

  await clickVisibleButton(tabA, 'Read next events');
  await waitFor(tabA, 'change-cursor retrieval to report the new event count', `document.querySelector('.business-fieldwork-panel [role="status"]')?.textContent?.includes('changes loaded') === true`);
  await waitFor(tabA, 'the refreshed fieldwork navigation', `!!document.querySelector('.business-fieldwork-tabs button')`);
  await clickVisibleButton(tabA, 'Workprograms');
  await waitFor(tabA, 'change-cursor retrieval to reload Partner B v4 into Partner A rows', `(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(secondTitle)}));
    return article?.querySelector('.business-section-heading > span')?.textContent?.trim() === 'v4' &&
      article.textContent.includes(${JSON.stringify(changeWorkB)});
  })()`);
  await clickVisibleButton(tabA, 'Evidence');
  await waitFor(tabA, 'the advanced review queue cursor', `!![...document.querySelectorAll('.business-fieldwork-card h3')].find(item => item.textContent?.trim() === 'Change feed')`);
  const cursorAfter = await tabA.evaluate<number>(`(() => {
    const text = [...document.querySelectorAll('.business-fieldwork-card p')].find(item => item.textContent?.trim().startsWith('Cursor '))?.textContent ?? '';
    return Number(text.match(/Cursor (\\d+)/)?.[1] ?? -1);
  })()`);
  assert.ok(cursorAfter > cursorBefore, 'a new row event advances the cursor and triggers a current-row refresh');

  assert.ok(tabA.requests.some(url => new URL(url).pathname.endsWith('/fieldwork-workspace')));
  assert.ok(tabA.requests.some(url => new URL(url).pathname.endsWith('/changes')));
  assert.ok(tabA.requests.some(url => new URL(url).pathname.endsWith('/commands')));
  assert.ok(tabB.requests.some(url => new URL(url).pathname.endsWith('/commands')));
  assert.deepEqual(tabA.exceptions, [], 'Partner A browser has no uncaught JavaScript exceptions');
  assert.deepEqual(tabB.exceptions, [], 'Partner B browser has no uncaught JavaScript exceptions');
  assert.deepEqual(tabA.blockedExternalRequests, []);
  assert.deepEqual(tabB.blockedExternalRequests, []);
});

it('US-FLD-007 and US-FLD-008 verify MUS evaluation and systematic sampling with periodicity review', { timeout: 120000 }, async () => {
  assert.ok(server && tabA);
  const fixture = await createFieldworkFixture();
  await selectWorkspace(tabA, fixture, fixture.actorProfileId);

  // Observe the rendered, settled fieldwork shell before starting the UI journey.
  const initialUi = await tabA.evaluate<{ heading: string; persona: string; tabs: string[] }>(`({
    heading: document.querySelector('#business-fieldwork-heading')?.textContent?.trim() ?? '',
    persona: document.querySelector('#business-active-persona')?.selectedOptions[0]?.textContent?.trim() ?? '',
    tabs: [...document.querySelectorAll('.business-fieldwork-tabs button')].map(button => button.textContent?.trim() ?? '')
  })`);
  assert.ok(initialUi.heading.length > 0);
  assert.ok(initialUi.persona.includes('APPROVER'));
  assert.ok(initialUi.tabs.includes('Evidence') && initialUi.tabs.includes('Sampling'));

  await clickVisibleButton(tabA, 'Evidence');
  await waitFor(tabA, 'the physical evidence record form', `!![...document.querySelectorAll('.business-fieldwork-card h3')].find(item => item.textContent?.trim() === 'Retain digital, physical or hybrid evidence')`);
  const evidenceTitle = 'UI sample invoice inspection evidence';
  await setVisibleFieldByLabel(tabA, 'Evidence mode', '', 'Physical');
  await waitFor(tabA, 'physical evidence inputs', `!![...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Physical index code')`);
  await setVisibleFieldByLabel(tabA, 'Evidence title', evidenceTitle);
  await setVisibleFieldByLabel(tabA, 'Physical index code', 'MUS-UI-01');
  await setVisibleFieldByLabel(tabA, 'Physical description', 'Original invoice inspected and traced to the customer ledger.');
  const commandsBeforeInvalidPhysicalEvidence = tabA.requests.filter(url => new URL(url).pathname.endsWith('/commands')).length;
  await clickVisibleButton(tabA, 'Create evidence record');
  await waitFor(tabA, 'the physical locator validation message', `document.body.innerText.includes('Physical and hybrid evidence require at least one binder, box or shelf locator.')`);
  assert.equal(tabA.requests.filter(url => new URL(url).pathname.endsWith('/commands')).length, commandsBeforeInvalidPhysicalEvidence,
    'invalid physical evidence is stopped in the form before a request reaches the Worker');
  await setVisibleFieldByLabel(tabA, 'Binder', 'Revenue binder A');
  await clickVisibleButton(tabA, 'Create evidence record');
  await waitFor(tabA, 'the saved evidence awaiting review', `document.body.innerText.includes(${JSON.stringify(evidenceTitle)}) && document.body.innerText.includes('PENDING VERIFICATION')`);

  // The second Partner is a distinct natural person and independently reviews the evidence.
  await selectWorkspace(tabA, fixture, fixture.actorB);
  await clickVisibleButton(tabA, 'Evidence');
  await waitFor(tabA, 'the independent evidence review controls', `!![...document.querySelectorAll('.business-fieldwork-card h3')].find(item => item.textContent?.trim() === 'Independent evidence adequacy review')`);
  await setVisibleFieldByLabel(tabA, 'Exact evidence version', '', evidenceTitle);
  await setVisibleFieldByLabel(tabA, 'Reviewer rationale', 'The physical invoice was inspected and supports the tested positive balance.');
  await clickVisibleButton(tabA, 'Save evidence review');
  await waitFor(tabA, 'the independently verified evidence version', `document.body.innerText.includes(${JSON.stringify(evidenceTitle)}) && document.body.innerText.includes('ADEQUATE')`);

  await selectWorkspace(tabA, fixture, fixture.actorProfileId);
  await clickVisibleButton(tabA, 'Sampling');
  await waitFor(tabA, 'sampling methodology and population forms', `!![...document.querySelectorAll('.business-fieldwork-card h3')].find(item => item.textContent?.trim() === 'Firm sampling methodology')`);
  await clickVisibleButton(tabA, 'Create draft policy');
  await waitFor(tabA, 'the draft MUS policy approval field', `document.body.innerText.includes('MUS_BINOMIAL_PPS') && !![...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Partner methodology approval rationale')`);
  await setVisibleFieldByLabel(tabA, 'Partner methodology approval rationale', 'Partner approved the conservative binomial MUS assumptions for this synthetic audit population.');
  await clickVisibleButton(tabA, 'Partner approve');
  await waitFor(tabA, 'the approved MUS methodology and ready population form', `document.body.innerText.includes('APPROVED') &&
    !![...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Population name')`);

  const populationName = 'UI MUS population with explicit exclusions';
  await setVisibleFieldByLabel(tabA, 'Population name', populationName);
  const samplingSourceOptions = await tabA.evaluate<{ labelFound: boolean; options: string[] }>(`(() => {
    const label = [...document.querySelectorAll('label.business-field')].find(item => item.querySelector('span')?.textContent?.trim() === 'Committed source file');
    return { labelFound: !!label, options: [...(label?.querySelectorAll('select option') ?? [])].map(option => option.textContent?.trim() ?? '') };
  })()`);
  assert.ok(samplingSourceOptions.options.some(option => option.includes('qa-sampling-population.csv')),
    `the committed sampling source appears in the selection list: ${JSON.stringify(samplingSourceOptions)}`);
  await setVisibleFieldByLabel(tabA, 'Committed source file', '', 'qa-sampling-population.csv');
  await waitFor(tabA, 'the active QA-REV FSLI option', `(() => {
    const label = [...document.querySelectorAll('label.business-field')].find(item => item.querySelector('span')?.textContent?.trim() === 'FSLI');
    return [...(label?.querySelectorAll('select option') ?? [])].some(option => option.textContent?.includes('QA-REV'));
  })()`);
  await setVisibleFieldByLabel(tabA, 'FSLI', '', 'QA-REV');
  await setVisibleFieldByLabel(tabA, 'Zero and negative item alternate-procedure rationale', 'Test the credit and zero balances separately using completeness and understatement procedures.');
  await clickVisibleButton(tabA, 'Import population');
  await waitFor(tabA, 'the imported positive population and two excluded rows', `document.body.innerText.includes(${JSON.stringify(populationName)}) && document.body.innerText.includes('2 excluded')`);
  await clickVisibleButton(tabA, 'Assign and select');
  await waitFor(tabA, 'the selected population and MUS inputs', `!![...document.querySelectorAll('.business-fieldwork-card h3')].find(item => item.textContent?.includes(${JSON.stringify(populationName)})) && !![...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Expected tainted book-value (%)')`);

  await setVisibleFieldByLabel(tabA, 'Tolerable misstatement (QAR)', '50000.00');
  await clickVisibleButton(tabA, 'Create sample plan');
  await waitFor(tabA, 'the 59-draw immutable MUS plan', `document.body.innerText.includes('59 selected draws') && document.body.innerText.includes('server seed')`);
  const visiblePlan = await tabA.evaluate<{ distinctRows: number; draws: number; selectedEvidenceLabel: string }>(`(() => ({
    distinctRows: document.querySelectorAll('.business-fieldwork-sample-test').length,
    draws: document.querySelectorAll('.business-fieldwork-scroll table tbody tr').length,
    selectedEvidenceLabel: [...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Adequate evidence item')?.textContent?.trim() ?? ''
  }))()`);
  assert.equal(visiblePlan.distinctRows, 1, '59 monetary draws remain one document test for the single positive invoice');
  assert.equal(visiblePlan.draws, 59);
  assert.equal(visiblePlan.selectedEvidenceLabel, 'Adequate evidence item');

  await setVisibleFieldByLabel(tabA, 'Audited amount (QAR)', '1000000.00');
  await setVisibleFieldByLabel(tabA, 'Conclusion', 'Inspected invoice agrees with the customer ledger and retained source.');
  await setVisibleFieldByLabel(tabA, 'Adequate evidence item', '', evidenceTitle);
  const misstatementDefault = await tabA.evaluate<boolean>(`[...document.querySelectorAll('label.business-check-field')]
    .find(item => item.textContent?.includes('Misstatement identified'))?.querySelector('input')?.checked ?? true`);
  assert.equal(misstatementDefault, false);
  await clickVisibleButton(tabA, 'Save test');
  await waitFor(tabA, 'the version-pinned tested item', `document.querySelector('.business-fieldwork-panel [role="status"]')?.textContent?.includes('Sample test saved with exact evidence version.')`);
  await clickWhenEnabled(tabA, 'Evaluate current tests');
  await waitFor(tabA, 'the sampling evaluation response', `document.body.innerText.includes('WITHIN TOLERANCE') || !!document.querySelector('.business-fieldwork-panel > .business-alert')`);

  const finalUi = await tabA.evaluate<{ withinToleranceVisible: boolean; boundVisible: boolean; evidenceVisible: boolean; alert: string | null }>(`({
    withinToleranceVisible: document.body.innerText.includes('WITHIN TOLERANCE'),
    boundVisible: document.body.innerText.includes('49,507.61'),
    evidenceVisible: document.body.innerText.includes(${JSON.stringify(evidenceTitle)}),
    alert: document.querySelector('.business-fieldwork-panel > .business-alert')?.textContent?.trim() ?? null
  })`);
  assert.equal(finalUi.alert, null, `sampling evaluation was rejected: ${finalUi.alert}`);
  assert.equal(finalUi.evidenceVisible, true);
  assert.equal(finalUi.withinToleranceVisible, true);
  assert.equal(finalUi.boundVisible, true);
  assert.ok(tabA.requests.some(url => new URL(url).pathname.includes('/sampling-plans/')));
  assert.deepEqual(tabA.exceptions, [], 'the sampling acceptance screen has no unhandled JavaScript exceptions');
  assert.deepEqual(tabA.blockedExternalRequests, []);

  // Continue through the reviewer-sized systematic workflow and its periodicity review.
  await setVisibleFieldByLabel(tabA, 'Sampling method', '', 'Systematic · reviewer-sized');
  await clickVisibleButton(tabA, 'Create draft policy');
  await waitFor(tabA, 'the draft systematic policy approval control', `document.body.innerText.includes('SYSTEMATIC') && !![...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Partner methodology approval rationale')`);
  await setVisibleFieldByLabel(tabA, 'Partner methodology approval rationale', 'Partner approved reviewer-sized systematic selection with exact order and start retention.');
  await clickVisibleButton(tabA, 'Partner approve');
  await waitFor(tabA, 'the Partner-approved systematic policy', `document.body.innerText.includes('SYSTEMATIC') && document.body.innerText.includes('APPROVED') && ![...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Partner methodology approval rationale')`);

  const systematicPopulationName = 'UI systematic sample with a repeated source-order pattern';
  await setVisibleFieldByLabel(tabA, 'Population name', systematicPopulationName);
  await setVisibleFieldByLabel(tabA, 'Committed source file', '', 'qa-systematic-population.csv');
  await waitFor(tabA, 'the systematic population FSLI selection', `(() => {
    const label = [...document.querySelectorAll('label.business-field')].find(item => item.querySelector('span')?.textContent?.trim() === 'FSLI');
    return [...(label?.querySelectorAll('select option') ?? [])].some(option => option.textContent?.includes('QA-REV'));
  })()`);
  await setVisibleFieldByLabel(tabA, 'FSLI', '', 'QA-REV');
  await setVisibleFieldByLabel(tabA, 'Zero and negative item alternate-procedure rationale', 'No nonpositive rows are present; retain this import rationale with the source population.');
  await clickVisibleButton(tabA, 'Import population');
  await waitFor(tabA, 'the imported 12-row systematic population', `document.body.innerText.includes(${JSON.stringify(systematicPopulationName)}) && document.body.innerText.includes('12 rows')`);
  const selectedSystematicPopulation = await tabA.evaluate<boolean>(`(() => {
    const row = [...document.querySelectorAll('.business-fieldwork-row')].find(item => item.textContent?.includes(${JSON.stringify(systematicPopulationName)}));
    const button = [...(row?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === 'Assign and select');
    button?.click(); return !!button;
  })()`);
  assert.equal(selectedSystematicPopulation, true, 'the exact periodic source population is selected');
  await waitFor(tabA, 'the periodic-order warning and review field', `document.body.innerText.includes('Potential periodic source ordering detected.') && !![...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Periodicity assessment')`);
  const periodicUi = await tabA.evaluate<{ warning: string; orderLabels: string[] }>(`({
    warning: [...document.querySelectorAll('[role="alert"]')].map(item => item.innerText).find(text => text.includes('Potential periodic source ordering detected.')) ?? '',
    orderLabels: [...document.querySelectorAll('label.business-field span')].map(item => item.textContent?.trim() ?? '')
  })`);
  assert.ok(periodicUi.warning.includes('Description repeats in a 3-row pattern across 4 cycles (eligible-order positions 1–12).'), periodicUi.warning);
  assert.ok(periodicUi.orderLabels.includes('Periodicity assessment'));
  const planDisabledBeforeAssessment = await tabA.evaluate<boolean>(`[...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Create sample plan')?.disabled ?? false`);
  assert.equal(planDisabledBeforeAssessment, true, 'the detected pattern requires a reviewer assessment before the plan can be frozen');
  await setVisibleFieldByLabel(tabA, 'Reviewer-selected count', '6');
  await setVisibleFieldByLabel(tabA, 'Frozen source ordering', '', 'Server-seeded unbiased shuffle');
  await setVisibleFieldByLabel(tabA, 'Sample-size rationale', 'Select six distinct items for reviewer-assessed coverage; no confidence is inferred.');
  await setVisibleFieldByLabel(tabA, 'Periodicity assessment', 'The source description repeats every three rows. Use the recorded unbiased shuffle before freezing the sample order.');
  const planEnabledAfterAssessment = await tabA.evaluate<boolean>(`[...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Create sample plan')?.disabled === false`);
  assert.equal(planEnabledAfterAssessment, true, 'a complete periodicity assessment enables the reviewer-sized plan');
  await clickVisibleButton(tabA, 'Create sample plan');
  await waitFor(tabA, 'the shuffled six-item systematic plan', `document.body.innerText.includes('6 selected draws') && document.body.innerText.includes('SERVER_SEEDED_SHUFFLE') && document.body.innerText.includes('Periodicity assessment: The source description repeats every three rows.')`);
  const systematicPlanUi = await tabA.evaluate<{ details: string; sampleRows: number; alert: string | null }>(`({
    details: document.body.innerText,
    sampleRows: document.querySelectorAll('.business-fieldwork-scroll table tbody tr').length,
    alert: document.querySelector('.business-fieldwork-panel > .business-alert')?.textContent?.trim() ?? null
  })`);
  assert.equal(systematicPlanUi.alert, null);
  assert.equal(systematicPlanUi.sampleRows, 6);
  assert.ok(systematicPlanUi.details.includes('Interval N/n = 12/6.'));
  assert.ok(systematicPlanUi.details.includes('no statistical confidence is inferred'));
  assert.ok(systematicPlanUi.details.includes('Ordering: SERVER_SEEDED_SHUFFLE'));
  assert.deepEqual(tabA.exceptions, [], 'the periodicity review screen has no unhandled JavaScript exceptions');
  assert.deepEqual(tabA.blockedExternalRequests, []);
});
