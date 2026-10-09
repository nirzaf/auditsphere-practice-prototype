import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const qatarDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

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

async function ensureBrowsers(): Promise<void> {
  assert.ok(server);
  if (browserA && browserB && tabA && tabB) return;
  const executable = chromeExecutable();
  assert.ok(executable, 'Chrome or Edge is available for the browser acceptance journeys.');
  browserA = await launchHeadlessChrome(executable, { profilePrefix: 'auditsphere-conflict-a-', timeoutMs: 45000 });
  browserB = await launchHeadlessChrome(executable, { profilePrefix: 'auditsphere-conflict-b-', timeoutMs: 45000 });
  [tabA, tabB] = await Promise.all([connectTab(browserA, server.origin), connectTab(browserB, server.origin)]);
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

async function waitForStable(tab: CdpTab, label: string, predicate: string, requiredObservations = 3, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let consecutiveObservations = 0;
  while (Date.now() < deadline) {
    if (await tab.evaluate<boolean>(predicate)) {
      consecutiveObservations++;
      if (consecutiveObservations >= requiredObservations) return;
    } else {
      consecutiveObservations = 0;
    }
    await sleep(80);
  }
  const diagnostic = await tab.evaluate<string>(`(() => [
    document.querySelector('.business-fieldwork-panel > .business-alert')?.textContent?.trim() ?? '',
    document.querySelector('.business-fieldwork-panel')?.innerText ?? document.body.innerText.slice(-3000)
  ].join('\\n'))()`);
  throw new Error(`Timed out waiting for stable ${label}. Fieldwork diagnostics: ${diagnostic}`);
}

async function installStoredFileDownloadCapture(tab: CdpTab): Promise<void> {
  await tab.evaluate(`(() => {
    if (window.__qaStoredFileDownloadCapture) return;
    const state = { urls: new Map(), downloads: [], errors: [], originalClick: HTMLAnchorElement.prototype.click };
    const createObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = createObjectUrl(blob);
      state.urls.set(url, blob);
      return url;
    };
    HTMLAnchorElement.prototype.click = function() {
      if (!this.download) return state.originalClick.call(this);
      const blob = state.urls.get(this.href);
      if (!blob) { state.errors.push('Download link did not refer to a captured object URL.'); return; }
      const item = { fileName: this.download, size: blob.size, type: blob.type, base64: '', done: false };
      state.downloads.push(item);
      blob.arrayBuffer().then(buffer => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 32768) {
          binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 32768, bytes.length)));
        }
        item.base64 = btoa(binary);
        item.done = true;
      }).catch(error => state.errors.push(String(error)));
    };
    window.__qaStoredFileDownloadCapture = state;
  })()`);
  assert.equal(await tab.evaluate<boolean>('Boolean(window.__qaStoredFileDownloadCapture?.downloads)'), true,
    'the browser download capture is installed in the active document');
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
  runFixtureSql(`INSERT INTO policy_activations(id,workspace_id,policy_kind,workprogram_template_id,sampling_policy_id,charge_out_rate_id,
    action,effective_from,reason,approved_by_actor_id,approved_at)
    VALUES(?,?,'WORKPROGRAM_TEMPLATE',?,NULL,NULL,'ACTIVATE',?,?,?,?)`, randomUUID(),workspaceId,ids.templateId,
    qatarDate(),'Synthetic E2E approval activates this approved immutable template.',workspace.actorProfileId,now);
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

  return { ...workspace, ...ids, samplingSource, name: `Conflict Journey ${key.slice(0, 8)}` };
}

function addTimeEntryPreparer(fixture: Awaited<ReturnType<typeof createFieldworkFixture>>) {
  const now = new Date().toISOString();
  const workDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const staffMemberId = randomUUID(), actorId = randomUUID(), assignmentId = randomUUID();
  const unique = randomUUID();
  runFixtureSql(`INSERT INTO staff_members(id,workspace_id,version,natural_person_key,display_name,email,grade,active,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?,?,'ASSOCIATE',1,?,?,?,?)`, staffMemberId, fixture.workspaceId, `QA-TIME-${unique}`,
  'QA Time Entry Preparer', `time.preparer.${unique}@example.invalid`, now, now, fixture.actorProfileId, fixture.actorProfileId);
  runFixtureSql(`INSERT INTO actor_profiles(id,workspace_id,version,persona,staff_member_id,contact_id,active,created_at,updated_at)
    VALUES(?,?,1,'PREPARER',?,NULL,1,?,?)`, actorId, fixture.workspaceId, staffMemberId, now, now);
  runFixtureSql(`INSERT INTO staff_availability(id,workspace_id,staff_member_id,work_date,version,scheduled_minutes,approved_leave_minutes,updated_by_actor_id,updated_at)
    VALUES(?,?,?,?,1,60,0,?,?)`, randomUUID(), fixture.workspaceId, staffMemberId, workDate, fixture.actorProfileId, now);
  runFixtureSql(`INSERT INTO engagement_assignments(id,workspace_id,version,client_id,engagement_id,staff_member_id,persona,phase,start_date,end_date,planned_minutes,created_by_actor_id,created_at)
    VALUES(?,?,1,?,?,?,'PREPARER','FIELDWORK',?, ?,480,?,?)`, assignmentId, fixture.workspaceId,
  fixture.clientId, fixture.engagementId, staffMemberId, workDate, workDate, fixture.actorProfileId, now);
  return { staffMemberId, actorId, assignmentId, workDate };
}

async function selectPracticeWorkspace(tab: CdpTab, fixture: Awaited<ReturnType<typeof createFieldworkFixture>>,
  actorId: string, persona: 'PREPARER' | 'APPROVER', grade: string): Promise<void> {
  await tab.command('Page.navigate', { url: server!.origin });
  await waitFor(tab, 'the isolated local BUSINESS app origin', `location.origin === ${JSON.stringify(new URL(server!.origin).origin)}`);
  await tab.evaluate(`localStorage.removeItem('auditsphere.business-context.v1')`);
  await tab.command('Page.reload');
  await waitFor(tab, 'the isolated local BUSINESS landing page', `document.querySelector('#production-workspace-heading')?.textContent?.trim() === 'Open your business workspace'`);
  const preference = { version: 1, workspaceId: fixture.workspaceId, actorId, persona, clientId: fixture.clientId, engagementId: fixture.engagementId };
  await tab.evaluate(`localStorage.setItem('auditsphere.business-context.v1', ${JSON.stringify(JSON.stringify(preference))})`);
  await tab.command('Page.reload');
  await waitFor(tab, `the selected ${persona} profile and BUSINESS workspace`, `
    document.querySelector('#business-workspace-heading')?.textContent?.trim() === ${JSON.stringify(fixture.name)} &&
    document.querySelector('#business-active-persona')?.selectedOptions[0]?.textContent?.includes(${JSON.stringify(persona)}) &&
    document.querySelector('.business-actor-summary')?.textContent?.includes(${JSON.stringify(grade)})`);
  await waitFor(tab, 'the Worker-projected practice management panel', `
    !!document.querySelector('[aria-labelledby="business-practice-${fixture.engagementId}"]')`);
}

async function setPracticeFieldByLabel(tab: CdpTab, engagementId: string, labelText: string, value: string, optionText?: string): Promise<void> {
  const set = await tab.evaluate<boolean>(`(() => {
    const panel = document.querySelector('[aria-labelledby="business-practice-${engagementId}"]');
    const form = [...(panel?.querySelectorAll('form') ?? [])].find(item => item.querySelector('h3')?.textContent?.trim() === 'Record actual time');
    const label = [...(form?.querySelectorAll('label.business-field') ?? [])].find(item => item.querySelector('span')?.textContent?.trim() === ${JSON.stringify(labelText)});
    const control = label?.querySelector('input,select,textarea');
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
    return control.value === nextValue;
  })()`);
  assert.equal(set, true, `the visible practice field "${labelText}" accepted the intended value`);
}

async function setPracticeReportDate(tab: CdpTab, engagementId: string, labelText: 'Report from' | 'Report through', value: string): Promise<void> {
  const set = await tab.evaluate<boolean>(`(() => {
    const panel = document.querySelector('[aria-labelledby="business-practice-${engagementId}"]');
    const label = [...(panel?.querySelectorAll('label.business-field') ?? [])].find(item => item.querySelector('span')?.textContent?.trim() === ${JSON.stringify(labelText)});
    const input = label?.querySelector('input[type="date"]');
    if (!(input instanceof HTMLInputElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    setter?.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === ${JSON.stringify(value)};
  })()`);
  assert.equal(set, true, `the visible practice period field "${labelText}" accepted the intended Qatar work date`);
}

async function readPracticeTimeRow(tab: CdpTab, engagementId: string, procedureTitle: string, minutes: number) {
  return tab.evaluate<{ text: string; status: string; hasSubmit: boolean; hasApprove: boolean; amount: string } | null>(`(() => {
    const panel = document.querySelector('[aria-labelledby="business-practice-${engagementId}"]');
    const row = [...(panel?.querySelectorAll('table tbody tr') ?? [])].find(item => item.textContent?.includes(${JSON.stringify(procedureTitle)}) &&
      item.textContent?.includes(${JSON.stringify(String(minutes))}));
    if (!row) return null;
    const cells = [...row.querySelectorAll('td')];
    return { text: row.textContent?.trim() ?? '', status: cells[6]?.textContent?.trim() ?? '',
      hasSubmit: [...row.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Submit'),
      hasApprove: [...row.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Approve'),
      amount: cells[5]?.textContent?.trim() ?? '' };
  })()`);
}

async function clickPracticeAction(tab: CdpTab, engagementId: string, label: string, procedureTitle?: string, minutes?: number): Promise<void> {
  const clicked = await tab.evaluate<boolean>(`(() => {
    const panel = document.querySelector('[aria-labelledby="business-practice-${engagementId}"]');
    const scope = ${procedureTitle ? ` [...(panel?.querySelectorAll('table tbody tr') ?? [])].find(item => item.textContent?.includes(${JSON.stringify(procedureTitle)}) && item.textContent?.includes(${JSON.stringify(String(minutes))}))` : 'panel'};
    const button = [...(scope?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === ${JSON.stringify(label)});
    if (!button || button.disabled || !button.getClientRects().length) return false;
    button.click(); return true;
  })()`);
  assert.equal(clicked, true, `the visible practice action "${label}" was enabled`);
}

async function captureUiFailure(tab: CdpTab, label: string, engagementId: string): Promise<string> {
  await tab.evaluate(`document.querySelector('[aria-labelledby="business-practice-${engagementId}"]')?.scrollIntoView({ block: 'center' })`);
  const capture = await tab.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }) as { data: string };
  const path = join(tmpdir(), `auditsphere-${label}-${Date.now()}.png`);
  writeFileSync(path, Buffer.from(capture.data, 'base64'));
  return path;
}

async function readPracticeDiagnostics(tab: CdpTab, engagementId: string): Promise<string> {
  return tab.evaluate<string>(`(() => {
    const panel = document.querySelector('[aria-labelledby="business-practice-${engagementId}"]');
    return JSON.stringify({
      alerts: [...(panel?.querySelectorAll('[role="alert"]') ?? [])].map(item => item.textContent?.trim()),
      messages: [...(panel?.querySelectorAll('[role="status"]') ?? [])].map(item => item.textContent?.trim()),
      rows: [...(panel?.querySelectorAll('table tbody tr') ?? [])].map(item => item.textContent?.trim())
    });
  })()`);
}

async function selectWorkspace(tab: CdpTab, fixture: Awaited<ReturnType<typeof createFieldworkFixture>>, actorId: string): Promise<void> {
  await tab.command('Page.navigate', { url: server!.origin });
  await waitFor(tab, 'the isolated local BUSINESS app origin', `location.origin === ${JSON.stringify(new URL(server!.origin).origin)}`);
  await tab.evaluate(`localStorage.removeItem('auditsphere.business-context.v1')`);
  await tab.command('Page.reload');
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
  const statementUi = await tab.evaluate<{ paneTitles: string[]; revenueRowText: string; actions: string[] }>(`(() => {
    const body = document.querySelector('.business-fieldwork-body');
    const panes = [...(body?.querySelectorAll(':scope > .business-fieldwork-card') ?? [])];
    const revenue = panes[0]?.querySelector('tbody tr');
    return {
      paneTitles: panes.map(pane => pane.querySelector('h3')?.textContent?.trim() ?? ''),
      revenueRowText: revenue?.innerText ?? '',
      actions: [...(revenue?.querySelectorAll('.business-fieldwork-row-actions button') ?? [])].map(button => button.textContent?.trim() ?? '')
    };
  })()`);
  assert.deepEqual(statementUi.paneTitles.slice(0, 2), ['Profit and loss', 'Balance sheet'], 'profit and loss precedes the balance sheet');
  assert.match(statementUi.revenueRowText, /NO COMPARATIVE/, 'a source without prior balances labels the missing comparative explicitly');
  assert.ok(statementUi.actions.includes('AR Test') && statementUi.actions.includes('Audit Workprogram'),
    'each substantive statement row exposes both analysis and workprogram actions');
  await tab.command('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: false, screenWidth: 390, screenHeight: 844
  });
  try {
    const mobileLayout = await tab.evaluate<{ width: number; pnlTop: number; pnlBottom: number; balanceTop: number; actionsVisible: boolean }>(`(() => {
      const body = document.querySelector('.business-fieldwork-body');
      const panes = [...(body?.querySelectorAll(':scope > .business-fieldwork-card') ?? [])];
      const pnl = panes[0]?.getBoundingClientRect();
      const balance = panes[1]?.getBoundingClientRect();
      const actions = panes[0]?.querySelector('.business-fieldwork-row-actions button');
      return { width: window.innerWidth, pnlTop: pnl?.top ?? -1, pnlBottom: pnl?.bottom ?? -1,
        balanceTop: balance?.top ?? -1, actionsVisible: !!actions?.getClientRects().length };
    })()`);
    assert.equal(mobileLayout.width, 390);
    assert.ok(mobileLayout.pnlTop >= 0 && mobileLayout.balanceTop >= mobileLayout.pnlBottom,
      'the same P&L and balance-sheet panes stack vertically at mobile width');
    assert.equal(mobileLayout.actionsVisible, true, 'row actions remain visible without hover at mobile width');
  } finally {
    await tab.command('Emulation.clearDeviceMetricsOverride');
  }
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
  await ensureBrowsers();
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

it('US-FLD-005 displays a not-applicable rationale before independent Partner approval', { timeout: 120000 }, async () => {
  await ensureBrowsers();
  assert.ok(server && tabA && tabB);
  const fixture = await createFieldworkFixture();
  const procedureTitle = 'Same-row concurrent edits';
  const rationale = 'The retained source and account policy show this zero balance has no foreign-currency activity.';
  await selectWorkspace(tabA, fixture, fixture.actorProfileId);
  await openWorkprograms(tabA);

  // Observe the blank reason and disabled action before requesting an exception.
  const initialAction = await tabA.evaluate<{ reason: string; disabled: boolean }>(`(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(procedureTitle)}));
    const reason = [...(article?.querySelectorAll('label.business-field') ?? [])].find(item => item.querySelector('span')?.textContent?.trim() === 'Reason this step is not applicable')?.querySelector('textarea');
    const action = [...(article?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === 'Propose N/A');
    return { reason: reason?.value ?? '', disabled: action?.disabled ?? false };
  })()`);
  assert.deepEqual(initialAction, { reason: '', disabled: true }, 'an N/A proposal cannot be submitted without a reason');

  await setVisibleFieldByLabel(tabA, 'Reason this step is not applicable', rationale);
  await clickProcedureButton(tabA, procedureTitle, 'Propose N/A');
  await waitFor(tabA, 'the submitted N/A decision and its reason in the preparer view', `(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(procedureTitle)}));
    return article?.textContent?.includes('SUBMITTED') && article.textContent.includes(${JSON.stringify(rationale)});
  })()`);

  // Switch identity only after verifying the submission; the second Partner sees the same Worker record.
  await selectWorkspace(tabB, fixture, fixture.actorB);
  await openWorkprograms(tabB);
  await waitFor(tabB, 'the independent reviewer to see the reason and explicit N/A decision', `(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(procedureTitle)}));
    return article?.textContent?.includes('SUBMITTED') && article.textContent.includes('Not-applicable rationale: ' + ${JSON.stringify(rationale)}) &&
      [...(article?.querySelectorAll('button') ?? [])].some(item => item.textContent?.trim() === 'Approve N/A');
  })()`);
  await setVisibleFieldByLabel(tabB, 'Independent review rationale', 'I inspected the recorded scope and approve the documented not-applicable conclusion.');
  await clickProcedureButton(tabB, procedureTitle, 'Approve N/A');
  await waitFor(tabB, 'the independently approved N/A decision', `(() => {
    const article = [...document.querySelectorAll('.business-fieldwork-procedure')].find(item => item.querySelector('.business-section-heading strong')?.textContent?.includes(${JSON.stringify(procedureTitle)}));
    return article?.textContent?.includes('REVIEWED') && article.textContent.includes(${JSON.stringify(rationale)}) && ![...(article?.querySelectorAll('button') ?? [])].some(item => item.textContent?.trim() === 'Approve N/A');
  })()`);

  assert.ok(tabA.requests.some(url => new URL(url).pathname.endsWith('/commands')));
  assert.ok(tabB.requests.some(url => new URL(url).pathname.endsWith('/commands')));
  assert.deepEqual(tabA.exceptions, [], 'preparer browser has no uncaught JavaScript exceptions');
  assert.deepEqual(tabB.exceptions, [], 'independent reviewer browser has no uncaught JavaScript exceptions');
  assert.deepEqual(tabA.blockedExternalRequests, []);
  assert.deepEqual(tabB.blockedExternalRequests, []);
});

it('E05-S03 explains the going-concern forecast and material-uncertainty states at desktop and mobile widths', { timeout: 120000 }, async () => {
  await ensureBrowsers();
  assert.ok(server && tabA);
  const fixture = await createFieldworkFixture();
  await selectWorkspace(tabA, fixture, fixture.actorProfileId);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await tabA.command('Emulation.setDeviceMetricsOverride', {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false,
      screenWidth: viewport.width, screenHeight: viewport.height
    });
    try {
      const initial = await tabA.evaluate<{ width: number; conclusion: string; forecastHint: boolean; uncertaintyHint: boolean }>(`(() => {
        const form = [...document.querySelectorAll('.business-fieldwork-card form')]
          .find(item => item.querySelector('label span')?.textContent?.trim() === 'Assessment start');
        const conclusion = [...(form?.querySelectorAll('label.business-field') ?? [])]
          .find(item => item.querySelector('span')?.textContent?.trim() === 'Conclusion')?.querySelector('select');
        const text = form?.innerText ?? '';
        return { width: window.innerWidth, conclusion: conclusion?.value ?? '',
          forecastHint: text.includes('Cash-flow forecasts are not available.'),
          uncertaintyHint: text.includes('Material Uncertainty Related to Going Concern') };
      })()`);
      assert.equal(initial.width, viewport.width);
      assert.equal(initial.conclusion, 'UNASSESSED', `the first visible assessment conclusion is Unassessed: ${JSON.stringify(initial)}`);
      assert.equal(initial.forecastHint, false);
      assert.equal(initial.uncertaintyHint, false);

      await setVisibleFieldByLabel(tabA, 'Conclusion', 'NO_MATERIAL_UNCERTAINTY', 'No material uncertainty');
      const noForecastHint = await tabA.evaluate<boolean>(`[...document.querySelectorAll('.business-fieldwork-card form')]
        .find(item => item.querySelector('label span')?.textContent?.trim() === 'Assessment start')?.querySelector('[role="status"]')?.textContent?.includes('Cash-flow forecasts are not available.') ?? false`);
      assert.equal(noForecastHint, true, `missing forecasts explain the required support at ${viewport.width}px`);

      await setVisibleFieldByLabel(tabA, 'Conclusion', 'MATERIAL_UNCERTAINTY', 'Material uncertainty');
      const uncertaintyHint = await tabA.evaluate<boolean>(`[...document.querySelectorAll('.business-fieldwork-card form')]
        .find(item => item.querySelector('label span')?.textContent?.trim() === 'Assessment start')?.querySelector('[role="status"]')?.textContent?.includes('Material Uncertainty Related to Going Concern') ?? false`);
      assert.equal(uncertaintyHint, true, `material uncertainty explains its reporting consequence at ${viewport.width}px`);
      await setVisibleFieldByLabel(tabA, 'Conclusion', 'UNASSESSED', 'Unassessed');
    } finally {
      await tabA.command('Emulation.clearDeviceMetricsOverride');
    }
  }
  assert.deepEqual(tabA.exceptions, [], 'the form state changes produce no uncaught browser exceptions');
  assert.deepEqual(tabA.blockedExternalRequests, [], 'the local form interaction makes no external requests');
});

it('E05-S01 pre-fills an editable suggested schedule and saves only after submit', { timeout: 120000 }, async () => {
  await ensureBrowsers();
  assert.ok(server && tabA);
  const fixture = await createFieldworkFixture();
  await selectWorkspace(tabA, fixture, fixture.actorProfileId);
  await waitFor(tabA, 'the planning panel and unsaved suggestion control', `
    !!document.querySelector('#business-planning-heading') &&
    [...document.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Suggest dates')`);
  const startingCount = server.db.prepare('SELECT COUNT(*) AS count FROM milestones WHERE workspace_id=? AND engagement_id=?')
    .bind(fixture.workspaceId, fixture.engagementId).first<{ count: number }>()?.count;
  assert.equal(startingCount, 0, 'the planning fixture begins without saved milestones');

  const clicked = await tabA.evaluate<boolean>(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Suggest dates');
    if (!button || button.disabled || !button.getClientRects().length) return false;
    button.click(); return true;
  })()`);
  assert.equal(clicked, true, 'the visible date-suggestion action is enabled');
  await waitFor(tabA, 'the editable date suggestions', `
    document.querySelector('#business-planning-suggested-fieldwork')?.value === '2027-01-03' &&
    document.querySelector('#business-planning-suggested-draft')?.value === '2027-02-15' &&
    document.querySelector('#business-planning-suggested-final')?.value === '2027-03-15'`);
  const beforeSubmit = server.db.prepare('SELECT COUNT(*) AS count FROM milestones WHERE workspace_id=? AND engagement_id=?')
    .bind(fixture.workspaceId, fixture.engagementId).first<{ count: number }>()?.count;
  assert.equal(beforeSubmit, 0, 'suggesting and reviewing dates does not persist them');

  const edited = await tabA.evaluate<boolean>(`(() => {
    const input = document.querySelector('#business-planning-suggested-fieldwork');
    if (!(input instanceof HTMLInputElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    setter?.call(input, '2027-01-10');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === '2027-01-10';
  })()`);
  assert.equal(edited, true, 'the suggested date remains editable before submission');
  const submitted = await tabA.evaluate<boolean>(`(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Save suggested schedule');
    if (!button || button.disabled || !button.getClientRects().length) return false;
    button.click(); return true;
  })()`);
  assert.equal(submitted, true);
  await waitFor(tabA, 'the applied fieldwork date and cutoff-blocked report suggestions', `
    document.querySelector('.business-planning-panel [role="status"]')?.textContent?.includes('1 suggested milestones applied') === true`);
  const saved = server.db.prepare(`SELECT code,target_date,source_reference FROM milestones WHERE workspace_id=? AND engagement_id=? ORDER BY code`)
    .bind(fixture.workspaceId, fixture.engagementId).all<{ code: string; target_date: string; source_reference: string }>().results ?? [];
  assert.deepEqual(saved.map(item => [item.code, item.target_date]), [['FIELDWORK_START', '2027-01-10']]);
  assert.equal(saved[0].source_reference, 'Suggested from period end 2026-12-31 (default rule v1)');
  assert.deepEqual(tabA.exceptions, [], 'the suggestion journey produces no uncaught browser exceptions');
});

it('US-FLD-007, US-FLD-008 and US-FLD-009 verify MUS, systematic and stratified sampling', { timeout: 120000 }, async () => {
  await ensureBrowsers();
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
  await waitFor(tabA, 'the saved physical-only evidence awaiting review', `document.body.innerText.includes(${JSON.stringify(evidenceTitle)}) && document.body.innerText.includes('PENDING VERIFICATION') && document.body.innerText.includes('No digital hash') && document.body.innerText.includes('Revenue binder A')`);

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
  await waitForStable(tabA, 'the committed sampling source loaded from the Worker file query', `
    (() => {
      const label = [...document.querySelectorAll('label.business-field')].find(item => item.querySelector('span')?.textContent?.trim() === 'Committed source file');
      return [...(label?.querySelectorAll('select option') ?? [])].some(option => option.textContent?.includes('qa-sampling-population.csv'));
    })()`);
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

  // Observe: a matching editable procedure is available before linking a plan.
  const sampleProcedureOptions = await tabA.evaluate<{ options: string[]; selected: string }>(`(() => {
    const label = [...document.querySelectorAll('label.business-field')].find(item => item.querySelector('span')?.textContent?.trim() === 'Procedure supported by this sample plan (optional)');
    const select = label?.querySelector('select');
    return { options: [...(select?.options ?? [])].map(option => option.textContent?.trim() ?? ''), selected: select?.value ?? '' };
  })()`);
  assert.ok(sampleProcedureOptions.options.some(option => option.includes('Same-row concurrent edits')),
    `the compatible editable procedure is offered: ${JSON.stringify(sampleProcedureOptions)}`);
  assert.equal(sampleProcedureOptions.selected, '', 'the plan starts unlinked');
  // Plan: link this sample to the matching FSLI procedure. Act: choose its visible label.
  await setVisibleFieldByLabel(tabA, 'Procedure supported by this sample plan (optional)', '', 'Same-row concurrent edits');
  // Verify the control reflects that selection before the plan is created.
  const selectedSampleProcedure = await tabA.evaluate<string>(`[...document.querySelectorAll('label.business-field')]
    .find(item => item.querySelector('span')?.textContent?.trim() === 'Procedure supported by this sample plan (optional)')?.querySelector('select')?.value ?? ''`);
  assert.ok(selectedSampleProcedure, 'the sample plan is linked to the selected procedure');

  await setVisibleFieldByLabel(tabA, 'Tolerable misstatement (QAR)', '50000.00');
  await clickVisibleButton(tabA, 'Create sample plan');
  await waitFor(tabA, 'the 59-draw immutable MUS plan', `document.body.innerText.includes('59 selected draws') && document.body.innerText.includes('server seed')`);
  const linkedProcedureVisible = await tabA.evaluate<boolean>(`document.body.innerText.includes('Procedure Same-row concurrent edits')`);
  assert.equal(linkedProcedureVisible, true, 'the persisted plan summary shows its supported procedure');
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
  await waitForStable(tabA, 'the sampling evaluation and reloaded exact evidence selection', `
    document.body.innerText.includes('WITHIN TOLERANCE') &&
    [...document.querySelectorAll('.business-fieldwork-sample-test select')]
      .some(select => select.selectedOptions[0]?.textContent?.includes(${JSON.stringify(evidenceTitle)}))
  `);

  const finalUi = await tabA.evaluate<{ withinToleranceVisible: boolean; boundVisible: boolean; evidenceVisible: boolean; evidenceOptions: Array<{ value: string; selectedText: string; options: string[] }>; alert: string | null }>(`({
    withinToleranceVisible: document.body.innerText.includes('WITHIN TOLERANCE'),
    boundVisible: document.body.innerText.includes('49,507.61'),
    evidenceOptions: [...document.querySelectorAll('.business-fieldwork-sample-test select')].map(select => ({
      value: select.value,
      selectedText: select.selectedOptions[0]?.textContent?.trim() ?? '',
      options: [...select.options].map(option => option.textContent?.trim() ?? '')
    })),
    evidenceVisible: [...document.querySelectorAll('.business-fieldwork-sample-test select')]
      .some(select => select.selectedOptions[0]?.textContent?.includes(${JSON.stringify(evidenceTitle)})),
    alert: document.querySelector('.business-fieldwork-panel > .business-alert')?.textContent?.trim() ?? null
  })`);
  assert.equal(finalUi.alert, null, `sampling evaluation was rejected: ${finalUi.alert}`);
  assert.equal(finalUi.evidenceVisible, true, `the selected exact evidence remains available after evaluation: ${JSON.stringify(finalUi.evidenceOptions)}`);
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

  // Continue through US-FLD-009 with separate assumptions and a visible partial-stratum evaluation.
  await setVisibleFieldByLabel(tabA, 'Sampling method', '', 'Stratified attribute');
  await clickVisibleButton(tabA, 'Create draft policy');
  await waitFor(tabA, 'the draft stratified attribute policy approval control', `document.body.innerText.includes('STRATIFIED ATTRIBUTE') && !![...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Partner methodology approval rationale')`);
  await setVisibleFieldByLabel(tabA, 'Partner methodology approval rationale', 'Partner approved finite-population attribute testing with separate justified strata and Bonferroni family confidence.');
  await clickVisibleButton(tabA, 'Partner approve');
  await waitFor(tabA, 'the Partner-approved stratified attribute policy', `document.body.innerText.includes('STRATIFIED ATTRIBUTE') && document.body.innerText.includes('APPROVED') && ![...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Partner methodology approval rationale')`);

  for (let index = 1; index <= 12; index++) {
    const sourceKey = `SYS-${String(index).padStart(2, '0')}`;
    const stratumKey = index <= 6 ? 'A' : 'B';
    const assigned = await tabA.evaluate<boolean>(`(() => {
      const input = document.querySelector('input[aria-label="Stratum for ${sourceKey}"]');
      if (!(input instanceof HTMLInputElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
      setter?.call(input, '${stratumKey}'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true;
    })()`);
    assert.equal(assigned, true, `the visible population row ${sourceKey} can be assigned to stratum ${stratumKey}`);
    await waitFor(tabA, `the ${sourceKey} stratum assignment`, `document.querySelector('input[aria-label="Stratum for ${sourceKey}"]')?.value === '${stratumKey}'`);
  }
  await waitFor(tabA, 'two independent assumption groups', `!![...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Expected deviation (%) · Stratum A') && !![...document.querySelectorAll('label.business-field span')].find(item => item.textContent?.trim() === 'Expected deviation (%) · Stratum B')`);
  const disabledUntilStrataAreJustified = await tabA.evaluate<boolean>(`[...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Create sample plan')?.disabled ?? false`);
  assert.equal(disabledUntilStrataAreJustified, true, 'sample planning stays disabled until each stratum has rates and a reviewer rationale');
  await setVisibleFieldByLabel(tabA, 'Expected deviation (%) · Stratum A', '0');
  await setVisibleFieldByLabel(tabA, 'Tolerable deviation (%) · Stratum A', '10');
  await setVisibleFieldByLabel(tabA, 'Rationale · Stratum A', 'Low-risk revenue items have a justified zero expected deviation and 10% tolerance.');
  await setVisibleFieldByLabel(tabA, 'Expected deviation (%) · Stratum B', '5');
  await setVisibleFieldByLabel(tabA, 'Tolerable deviation (%) · Stratum B', '25');
  await setVisibleFieldByLabel(tabA, 'Rationale · Stratum B', 'Higher expected and tolerable deviation rates are justified by this higher-risk transaction group.');
  const stratifiedButtonEnabled = await tabA.evaluate<boolean>(`[...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Create sample plan')?.disabled === false`);
  assert.equal(stratifiedButtonEnabled, true, 'separate, valid rationale and rate assumptions enable stratified planning');
  await clickVisibleButton(tabA, 'Create sample plan');
  await waitFor(tabA, 'the finite-population plan with independent stratum counts', `document.body.innerText.includes('11 selected draws') && document.body.innerText.includes('Frozen stratum assumptions') && document.body.innerText.includes('Higher expected and tolerable deviation rates are justified')`);
  const stratifiedDesignUi = await tabA.evaluate<{ text: string; rows: number; assumptions: string[][]; alert: string | null }>(`({
    text: document.body.innerText,
    rows: [...document.querySelectorAll('.business-fieldwork-scroll')].find(section => section.innerText.includes('Frozen stratum assumptions'))?.querySelectorAll('tbody tr').length ?? 0,
    assumptions: [...([...document.querySelectorAll('.business-fieldwork-scroll')].find(section => section.innerText.includes('Frozen stratum assumptions'))?.querySelectorAll('tbody tr') ?? [])]
      .map(row => [...row.querySelectorAll('td')].map(cell => cell.innerText.trim())),
    alert: document.querySelector('.business-fieldwork-panel > .business-alert')?.textContent?.trim() ?? null
  })`);
  assert.equal(stratifiedDesignUi.alert, null);
  assert.equal(stratifiedDesignUi.rows, 2);
  assert.deepEqual(stratifiedDesignUi.assumptions.map(row => row.slice(0, 6)), [
    ['A', '6', '0%', '10%', '500/20000 (2.50%)', '6'],
    ['B', '6', '5%', '25%', '500/20000 (2.50%)', '5']
  ]);
  assert.ok(stratifiedDesignUi.text.includes('Stratum A'));
  assert.ok(stratifiedDesignUi.text.includes('Stratum B'));
  assert.ok(stratifiedDesignUi.text.includes('Expected deviation (%) · Stratum B'));

  const stratumAEvidence = await tabA.evaluate<{ id: string | null; rows: string[] }>(`(() => {
    const form = [...document.querySelectorAll('.business-fieldwork-sample-test')].find(item => item.querySelector('strong')?.textContent?.trim() === 'SYS-01');
    const select = form?.querySelector('select');
    const option = [...(select?.options ?? [])].find(item => item.textContent?.includes(${JSON.stringify(evidenceTitle)}));
    return { id: option?.value ?? null, rows: [...document.querySelectorAll('.business-fieldwork-sample-test strong')].map(item => item.textContent?.trim() ?? '') };
  })()`);
  assert.ok(stratumAEvidence.id, `an adequate retained evidence item is available for attribute tests: ${JSON.stringify(stratumAEvidence)}`);
  for (let index = 1; index <= 6; index++) {
    const sourceKey = `SYS-${String(index).padStart(2, '0')}`;
    const saved = await tabA.evaluate<boolean>(`(() => {
      const form = [...document.querySelectorAll('.business-fieldwork-sample-test')].find(item => item.querySelector('strong')?.textContent?.trim() === '${sourceKey}');
      const conclusion = form?.querySelector('textarea'); const evidence = form?.querySelector('select'); const submit = form?.querySelector('button[type="submit"]');
      if (!(conclusion instanceof HTMLTextAreaElement) || !(evidence instanceof HTMLSelectElement) || !(submit instanceof HTMLButtonElement) || submit.disabled) return false;
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(conclusion), 'value')?.set;
      setter?.call(conclusion, 'The selected control evidence supports the recorded attribute conclusion.');
      conclusion.dispatchEvent(new Event('input', { bubbles: true }));
      const selectSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(evidence), 'value')?.set;
      selectSetter?.call(evidence, ${JSON.stringify(stratumAEvidence.id)}); evidence.dispatchEvent(new Event('change', { bubbles: true }));
      submit.click(); return true;
    })()`);
    assert.equal(saved, true, `the visible selected item ${sourceKey} accepts a conclusion and adequate evidence`);
    await waitFor(tabA, `the saved attribute test for ${sourceKey}`, `(() => { const form = [...document.querySelectorAll('.business-fieldwork-sample-test')].find(item => item.querySelector('strong')?.textContent?.trim() === '${sourceKey}'); return form?.innerText.includes('test v1') ?? false; })()`);
  }
  await clickWhenEnabled(tabA, 'Evaluate current tests');
  await waitFor(tabA, 'the incomplete stratum outcome and finite-population table', `document.body.innerText.includes('INCOMPLETE') && document.body.innerText.includes('Finite-population result by stratum') && document.body.innerText.includes('6/6') && document.body.innerText.includes('0/5')`);
  const stratifiedEvaluationUi = await tabA.evaluate<{ text: string; alert: string | null }>(`({
    text: document.body.innerText,
    alert: document.querySelector('.business-fieldwork-panel > .business-alert')?.textContent?.trim() ?? null
  })`);
  assert.equal(stratifiedEvaluationUi.alert, null);
  assert.ok(stratifiedEvaluationUi.text.includes('Stratum A'));
  assert.ok(stratifiedEvaluationUi.text.includes('Stratum B'));
  assert.ok(stratifiedEvaluationUi.text.includes('WITHIN TOLERANCE'));
  assert.ok(stratifiedEvaluationUi.text.includes('0/6 (0.00%)'), 'the fully tested census stratum reports its observed finite-population deviation rate directly');
  assert.ok(stratifiedEvaluationUi.text.includes('Not computed while incomplete'));
  assert.deepEqual(tabA.exceptions, [], 'the stratified finite-population workflow has no unhandled JavaScript exceptions');
  assert.deepEqual(tabA.blockedExternalRequests, []);
});

it('US-FLD-010 retains hybrid provenance, links Findings, and preserves replacement and unlink history', { timeout: 120000 }, async () => {
  await ensureBrowsers();
  assert.ok(server && tabA);
  const fixture = await createFieldworkFixture();
  await selectWorkspace(tabA, fixture, fixture.actorProfileId);

  const expectedSamplingHash = sha256(fixture.samplingSource);
  const sourceFileRow = await tabA.evaluate<{ text: string; downloadButton: boolean }>(`(() => {
    const row = [...document.querySelectorAll('.business-file-list > li')]
      .find(item => item.querySelector('strong')?.textContent?.trim() === 'qa-sampling-population.csv');
    return { text: row?.innerText ?? '', downloadButton: [...(row?.querySelectorAll('button') ?? [])]
      .some(button => button.textContent?.trim() === 'Download verified bytes' && !button.disabled) };
  })()`);
  assert.ok(sourceFileRow.text.includes(expectedSamplingHash.slice(0, 16)), 'the stored-file list exposes the pinned source SHA-256 prefix');
  assert.equal(sourceFileRow.downloadButton, true, 'the pinned source file has its real verified-download control');
  await installStoredFileDownloadCapture(tabA);
  await tabA.evaluate(`(() => {
    const row = [...document.querySelectorAll('.business-file-list > li')]
      .find(item => item.querySelector('strong')?.textContent?.trim() === 'qa-sampling-population.csv');
    [...(row?.querySelectorAll('button') ?? [])].find(button => button.textContent?.trim() === 'Download verified bytes')?.click();
  })()`);
  await waitFor(tabA, 'the pinned sampling source bytes from the verified download',
    'Boolean(window.__qaStoredFileDownloadCapture?.downloads[0]?.done)');
  const capturedSource = await tabA.evaluate<{ fileName: string; size: number; base64: string; done: boolean }>(
    'window.__qaStoredFileDownloadCapture.downloads[0]');
  assert.equal(capturedSource.done, true);
  assert.equal(capturedSource.fileName, 'qa-sampling-population.csv');
  const downloadedSourceBytes = Buffer.from(capturedSource.base64, 'base64');
  assert.equal(capturedSource.size, downloadedSourceBytes.byteLength, 'downloaded browser Blob size matches its bytes');
  assert.deepEqual(downloadedSourceBytes, Buffer.from(fixture.samplingSource, 'utf8'), 'opened/downloaded bytes exactly match the immutable fixture source');
  assert.equal(createHash('sha256').update(downloadedSourceBytes).digest('hex'), expectedSamplingHash,
    'the independently recomputed downloaded-byte SHA-256 matches the pinned file version');

  // Observe the settled Worker-backed workspace before the evidence journey.
  const initialUi = await tabA.evaluate<{ heading: string; persona: string; evidenceTabVisible: boolean }>(`({
    heading: document.querySelector('#business-fieldwork-heading')?.textContent?.trim() ?? '',
    persona: document.querySelector('#business-active-persona')?.selectedOptions[0]?.textContent?.trim() ?? '',
    evidenceTabVisible: [...document.querySelectorAll('.business-fieldwork-tabs button')].some(button => button.textContent?.trim() === 'Evidence')
  })`);
  assert.ok(initialUi.heading.length > 0);
  assert.ok(initialUi.persona.includes('APPROVER'));
  assert.equal(initialUi.evidenceTabVisible, true);

  const evidenceTitleV1 = 'Hybrid invoice evidence v1';
  const externalSourceUrl = 'https://evidence.example.invalid/invoice-source.pdf';
  await clickVisibleButton(tabA, 'Evidence');
  await waitFor(tabA, 'the settled hybrid evidence form', `!![...document.querySelectorAll('.business-fieldwork-card h3')].find(item => item.textContent?.trim() === 'Retain digital, physical or hybrid evidence')`);
  await setVisibleFieldByLabel(tabA, 'Evidence mode', '', 'Hybrid');
  await waitFor(tabA, 'the selected hybrid mode and visible physical locator inputs', `(() => {
    const mode = [...document.querySelectorAll('label.business-field')].find(item => item.querySelector('span')?.textContent?.trim() === 'Evidence mode')?.querySelector('select');
    const index = [...document.querySelectorAll('label.business-field')].find(item => item.querySelector('span')?.textContent?.trim() === 'Physical index code')?.querySelector('input');
    return mode?.value === 'HYBRID' && !!index?.getClientRects().length;
  })()`);
  await setVisibleFieldByLabel(tabA, 'Evidence title', evidenceTitleV1);
  await setVisibleFieldByLabel(tabA, 'Committed retained file', '', 'qa-sampling-population.csv');
  await setVisibleFieldByLabel(tabA, 'Physical index code', 'INV-UI-01');
  await setVisibleFieldByLabel(tabA, 'Physical description', 'Signed supplier invoice inspected and agreed to the ledger.');
  await setVisibleFieldByLabel(tabA, 'Binder', 'Purchases binder 2');
  await setVisibleFieldByLabel(tabA, 'Box', '3');
  await setVisibleFieldByLabel(tabA, 'Shelf', 'B');
  await setVisibleFieldByLabel(tabA, 'External source URL (optional)', externalSourceUrl);
  await setVisibleFieldByLabel(tabA, 'Retrieved at', '2026-10-01T12:30');
  await clickVisibleButton(tabA, 'Create evidence record');
  await waitFor(tabA, 'the committed hybrid evidence metadata and exact source hash prefix', `document.body.innerText.includes(${JSON.stringify(evidenceTitleV1)}) && document.body.innerText.includes('SHA-256 ${expectedSamplingHash.slice(0, 16)}') && document.body.innerText.includes('Purchases binder 2') && document.body.innerText.includes('Box 3') && document.body.innerText.includes('Shelf B') && document.body.innerText.includes(${JSON.stringify(externalSourceUrl)})`);

  await selectWorkspace(tabA, fixture, fixture.actorB);
  await clickVisibleButton(tabA, 'Evidence');
  await waitFor(tabA, 'independent adequacy review for hybrid evidence', `!![...document.querySelectorAll('.business-fieldwork-card h3')].find(item => item.textContent?.trim() === 'Independent evidence adequacy review')`);
  await setVisibleFieldByLabel(tabA, 'Exact evidence version', '', evidenceTitleV1);
  await setVisibleFieldByLabel(tabA, 'Reviewer rationale', 'The immutable source bytes and physical invoice location agree to the test objective.');
  await clickVisibleButton(tabA, 'Save evidence review');
  await waitFor(tabA, 'the independently adequate hybrid evidence version', `document.body.innerText.includes(${JSON.stringify(evidenceTitleV1)}) && document.body.innerText.includes('ADEQUATE')`);

  await selectWorkspace(tabA, fixture, fixture.actorProfileId);
  await clickVisibleButton(tabA, 'Findings & SRM');
  await waitFor(tabA, 'the finding entry form', `!![...document.querySelectorAll('.business-fieldwork-card h3')].find(item => item.textContent?.trim() === 'Record an audit finding')`);
  const findingTitle = 'Invoice cut-off evidence finding';
  await setVisibleFieldByLabel(tabA, 'Affected FSLI', '', 'QA-REV');
  await setVisibleFieldByLabel(tabA, 'Finding title', findingTitle);
  await setVisibleFieldByLabel(tabA, 'Condition, criteria and proposed correction', 'The selected invoice indicates a cut-off condition that requires documented audit follow-up.');
  await clickVisibleButton(tabA, 'Save finding');
  await waitFor(tabA, 'the saved finding', `document.body.innerText.includes(${JSON.stringify(findingTitle)})`);

  await clickVisibleButton(tabA, 'Evidence');
  await waitFor(tabA, 'the Finding target option', `[...document.querySelectorAll('label.business-field')].some(item => item.querySelector('span')?.textContent?.trim() === 'Audit target type')`);
  await setVisibleFieldByLabel(tabA, 'Current evidence version', '', evidenceTitleV1);
  await setVisibleFieldByLabel(tabA, 'Audit target type', '', 'Finding');
  await setVisibleFieldByLabel(tabA, 'Target revision', '', findingTitle);
  const findingId = await tabA.evaluate<string>(`(() => {
    const label = [...document.querySelectorAll('label.business-field')].find(item => item.querySelector('span')?.textContent?.trim() === 'Target revision');
    return label?.querySelector('select')?.value ?? '';
  })()`);
  assert.ok(findingId, 'the visible target selector resolves the exact finding ID');
  await clickVisibleButton(tabA, 'Link exact evidence version');
  await waitFor(tabA, 'the version-pinned evidence link to the Finding', `document.body.innerText.includes(${JSON.stringify('FINDING · ' + findingId)}) && document.body.innerText.includes('Evidence')`);

  const evidenceTitleV2 = 'Hybrid invoice evidence v2';
  await setVisibleFieldByLabel(tabA, 'Evidence title', evidenceTitleV2);
  await setVisibleFieldByLabel(tabA, 'Supersedes evidence version (optional)', '', evidenceTitleV1);
  await setVisibleFieldByLabel(tabA, 'Committed retained file', '', 'qa-systematic-population.csv');
  await setVisibleFieldByLabel(tabA, 'Evidence mode', '', 'Hybrid');
  await waitFor(tabA, 'hybrid locator inputs for the replacement revision', `(() => {
    const mode = [...document.querySelectorAll('label.business-field')].find(item => item.querySelector('span')?.textContent?.trim() === 'Evidence mode')?.querySelector('select');
    const index = [...document.querySelectorAll('label.business-field')].find(item => item.querySelector('span')?.textContent?.trim() === 'Physical index code')?.querySelector('input');
    return mode?.value === 'HYBRID' && !!index?.getClientRects().length;
  })()`);
  await setVisibleFieldByLabel(tabA, 'Physical index code', 'INV-UI-02');
  await setVisibleFieldByLabel(tabA, 'Physical description', 'Replacement signed invoice copy captured and inspected.');
  await setVisibleFieldByLabel(tabA, 'Binder', 'Purchases binder 2');
  await setVisibleFieldByLabel(tabA, 'Box', '3');
  await setVisibleFieldByLabel(tabA, 'Shelf', 'B');
  await setVisibleFieldByLabel(tabA, 'External source URL (optional)', 'https://evidence.example.invalid/invoice-source-v2.pdf');
  await setVisibleFieldByLabel(tabA, 'Retrieved at', '2026-10-02T09:15');
  await clickVisibleButton(tabA, 'Create evidence record');
  await waitFor(tabA, 'the replacement evidence revision and stale prior pin', `document.body.innerText.includes(${JSON.stringify(evidenceTitleV2)}) && document.body.innerText.includes('STALE EVIDENCE PIN') && document.body.innerText.includes('current v2')`);

  await selectWorkspace(tabA, fixture, fixture.actorB);
  await clickVisibleButton(tabA, 'Evidence');
  await waitFor(tabA, 'review controls for replacement evidence', `!![...document.querySelectorAll('.business-fieldwork-card h3')].find(item => item.textContent?.trim() === 'Independent evidence adequacy review')`);
  await setVisibleFieldByLabel(tabA, 'Exact evidence version', '', evidenceTitleV2);
  await setVisibleFieldByLabel(tabA, 'Reviewer rationale', 'The replacement immutable bytes and physical locator were independently inspected.');
  await clickVisibleButton(tabA, 'Save evidence review');
  await waitFor(tabA, 'the reviewed replacement revision', `document.body.innerText.includes(${JSON.stringify(evidenceTitleV2)}) && document.body.innerText.includes('ADEQUATE')`);

  await selectWorkspace(tabA, fixture, fixture.actorProfileId);
  await clickVisibleButton(tabA, 'Evidence');
  await waitFor(tabA, 'the current replacement evidence target controls', `document.body.innerText.includes(${JSON.stringify(evidenceTitleV2)})`);
  await setVisibleFieldByLabel(tabA, 'Current evidence version', '', evidenceTitleV2);
  await setVisibleFieldByLabel(tabA, 'Audit target type', '', 'Finding');
  await setVisibleFieldByLabel(tabA, 'Target revision', '', findingTitle);
  await clickVisibleButton(tabA, 'Link exact evidence version');
  await waitFor(tabA, 'the new exact finding evidence pin and automatic historical unlink', `document.body.innerText.includes('Superseded by a new evidence target-version pin') && !document.body.innerText.includes('STALE EVIDENCE PIN')`);

  await clickVisibleButton(tabA, 'Unlink with reason');
  await setVisibleFieldByLabel(tabA, 'Reason for unlinking this evidence reference', 'The replacement reference is no longer relied upon after reassessment.');
  await clickVisibleButton(tabA, 'Record unlink');
  await waitFor(tabA, 'the append-only manual unlink history', `document.body.innerText.includes('UNLINKED') && document.body.innerText.includes('The replacement reference is no longer relied upon after reassessment.')`);
  await clickVisibleButton(tabA, 'Refresh records');
  await waitFor(tabA, 'the refreshed append-only link and unlink history', `document.body.innerText.includes('The replacement reference is no longer relied upon after reassessment.') && document.body.innerText.includes('Superseded by a new evidence target-version pin')`);

  assert.deepEqual(tabA.exceptions, [], 'the evidence and Finding workflow has no uncaught JavaScript exceptions');
  assert.deepEqual(tabA.blockedExternalRequests, [], 'the local acceptance journey makes no external network request');
});

it('US-FLD-012 compiles and clears a Worker SRM, then rejects clearance after an input changes', { timeout: 120000 }, async () => {
  assert.ok(server);
  const fixture = await createFieldworkFixture();
  const now = new Date().toISOString();
  const managerStaffId = randomUUID();
  const managerActorId = randomUUID();
  const idempotencyKey = () => randomUUID();
  const send = async (actorId: string, persona: string, command: Record<string, unknown>) => {
    const key = idempotencyKey();
    const payload = command.payload as Record<string, unknown>;
    const expectedVersions = ['procedure.update', 'procedure.mark-not-applicable', 'procedure.submit', 'procedure.review'].includes(String(command.type))
      ? [{ entity: 'Procedure', id: payload.procedureId, version: payload.expectedVersion }]
      : [];
    const response = await fetch(`${server!.origin}/api/workspaces/${fixture.workspaceId}/commands`, {
      method: 'POST',
      headers: {
        Origin: server!.origin,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        'X-Actor-Id': actorId,
        'X-Active-Persona': persona,
        'X-Client-Id': fixture.clientId,
        'X-Engagement-Id': fixture.engagementId
      },
      body: JSON.stringify({
        actor: { actorId, persona },
        context: { clientId: fixture.clientId, engagementId: fixture.engagementId },
        expectedVersions,
        command
      })
    });
    const body = await response.json() as { code?: string; message?: string; result?: Record<string, any> };
    return { response, body: { ...body, commandType: String(command.type) } };
  };
  const readWorkflowStage = async (expectedState: string) => {
    const response = await fetch(`${server!.origin}/api/workspaces/${fixture.workspaceId}/engagements/${fixture.engagementId}/workflow`, {
      headers: { Origin: server!.origin, 'X-Actor-Id': fixture.actorProfileId, 'X-Active-Persona': 'APPROVER',
        'X-Client-Id': fixture.clientId, 'X-Engagement-Id': fixture.engagementId }
    });
    const body = await response.json() as { state?: string; stages?: Array<{ id: string; blockerCoverage: string; blockers: Array<{ code: string }> }> };
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.state, expectedState);
    const stage = body.stages?.find(item => item.id === expectedState);
    assert.ok(stage, `the workflow returns the ${expectedState} stage`);
    assert.equal(stage.blockerCoverage, 'evaluated', `${expectedState} blockers come from current Worker records`);
    return stage;
  };
  const initialFieldworkStage = await readWorkflowStage('FIELDWORK_EXECUTION');
  assert.ok(initialFieldworkStage.blockers.some(item => item.code === 'FIELDWORK_PROCEDURES_NOT_ACCEPTED'),
    'the fieldwork stage names outstanding independently reviewed procedures');

  runFixtureSql(`INSERT INTO staff_members(id,workspace_id,version,natural_person_key,display_name,email,grade,active,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?,?,'MANAGER',1,?,?,?,?)`, managerStaffId, fixture.workspaceId, `QA-SRM-MANAGER-${managerStaffId}`, 'QA SRM Manager',
  'srm.manager@example.invalid', now, now, fixture.actorProfileId, fixture.actorProfileId);
  runFixtureSql(`INSERT INTO actor_profiles(id,workspace_id,version,persona,staff_member_id,contact_id,active,created_at,updated_at)
    VALUES(?,?,1,'REVIEWER',?,NULL,1,?,?)`, managerActorId, fixture.workspaceId, managerStaffId, now, now);
  const clientContactId = randomUUID();
  const clientActorId = randomUUID();
  const adjustmentOffsetFsliId = randomUUID();
  runFixtureSql(`INSERT INTO contacts(id,workspace_id,version,client_id,full_name,email,title,role,is_primary,is_signatory,active,effective_from,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?,'client@example.invalid','Chief Accountant','CHIEF_ACCOUNTANT_LIAISON',1,1,1,'2026-01-01',?,?,?,?)`,
  clientContactId, fixture.workspaceId, fixture.clientId, 'QA Client Contact', now, now, fixture.actorProfileId, fixture.actorProfileId);
  runFixtureSql(`INSERT INTO actor_profiles(id,workspace_id,version,persona,staff_member_id,contact_id,active,created_at,updated_at)
    VALUES(?,?,1,'CLIENT',NULL,?,1,?,?)`, clientActorId, fixture.workspaceId, clientContactId, now, now);
  runFixtureSql(`INSERT INTO fsli_catalog(id,workspace_id,reporting_framework,code,name,statement,category,normal_side,display_sign,presentation_order,active)
    VALUES(?,?,'QA IFRS','QA-EXP','Synthetic expense','PROFIT_LOSS','EXPENSE','DEBIT',1,2,1)`, adjustmentOffsetFsliId, fixture.workspaceId);

  const retainedEvidence = await send(fixture.actorProfileId, 'APPROVER', { type: 'evidence.create', payload: {
    engagementId: fixture.engagementId, mode: 'DIGITAL', title: 'Synthetic SRM procedure evidence', fileVersionId: fixture.samplingFileId
  } });
  assert.equal(retainedEvidence.response.status, 200, JSON.stringify(retainedEvidence.body));
  const reviewedEvidence = await send(managerActorId, 'REVIEWER', { type: 'evidence.review', payload: {
    evidenceId: retainedEvidence.body.result?.evidenceId, evidenceVersion: 1, status: 'ADEQUATE',
    rationale: 'The committed synthetic source bytes were independently inspected and support the procedure.'
  } });
  assert.equal(reviewedEvidence.response.status, 200, JSON.stringify(reviewedEvidence.body));

  const procedureRows = server.db.prepare(`SELECT id FROM procedures WHERE workspace_id=? AND workprogram_id=? ORDER BY ordinal`)
    .bind(fixture.workspaceId, fixture.workprogramId).all<any>().results;
  assert.equal(procedureRows.length, 2, 'the synthetic FSLI has two applicable procedures');
  for (const [index, procedure] of procedureRows.entries()) {
    const prepared = await send(fixture.actorProfileId, 'APPROVER', { type: 'procedure.update', payload: {
      procedureId: procedure.id, expectedVersion: 1,
      workPerformed: `The Partner inspected synthetic source evidence for procedure ${index + 1} and reperformed the stated assertion.`,
      conclusion: `The retained synthetic evidence supports the documented conclusion for procedure ${index + 1}.`
    } });
    assert.equal(prepared.response.status, 200, JSON.stringify(prepared.body));
    const evidenceLink = await send(fixture.actorProfileId, 'APPROVER', { type: 'evidence.link', payload: {
      evidenceId: retainedEvidence.body.result?.evidenceId, evidenceVersion: 1, targetVersion: 2, procedureId: procedure.id
    } });
    assert.equal(evidenceLink.response.status, 200, JSON.stringify(evidenceLink.body));
    const submitted = await send(fixture.actorProfileId, 'APPROVER', { type: 'procedure.submit', payload: {
      procedureId: procedure.id, expectedVersion: 3
    } });
    assert.equal(submitted.response.status, 200, JSON.stringify(submitted.body));
    const accepted = await send(managerActorId, 'REVIEWER', { type: 'procedure.review', payload: {
      procedureId: procedure.id, expectedVersion: 4, decision: 'ACCEPT',
      comments: 'The exact current procedure submission and its version-pinned evidence were independently inspected.'
    } });
    assert.equal(accepted.response.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.result?.status, 'REVIEWED');
  }

  const submittedWorkprogram = await send(fixture.actorProfileId, 'APPROVER', { type: 'review.submit', payload: {
    targetKind: 'WORKPROGRAM', targetId: fixture.workprogramId, targetVersion: 1
  } });
  assert.equal(submittedWorkprogram.response.status, 200, JSON.stringify(submittedWorkprogram.body));
  const acceptedWorkprogram = await send(managerActorId, 'REVIEWER', { type: 'review.decide', payload: {
    submissionId: submittedWorkprogram.body.result?.submissionId, decision: 'ACCEPT',
    comment: 'All current procedures and the exact workprogram snapshot were independently accepted.'
  } });
  assert.equal(acceptedWorkprogram.response.status, 200, JSON.stringify(acceptedWorkprogram.body));

  const goingConcern = await send(fixture.actorProfileId, 'APPROVER', { type: 'going-concern.save', payload: {
    engagementId: fixture.engagementId, assessmentStart: '2026-01-01', assessmentEnd: '2027-01-01',
    checklist: { managementAssessment: false, cashFlowForecasts: false, financingAndCovenants: false,
      adverseEvents: false, mitigatingPlans: false, uncertaintyEvaluation: false },
    evidenceFileIds: [], eventsText: '', mitigatingPlansText: 'Management supplied no cash-flow forecast; current receipts and financing remain available for the assessment.',
    conclusion: 'NO_MATERIAL_UNCERTAINTY', rationale: 'The synthetic assessment found no material uncertainty at the reporting date.'
  } });
  assert.equal(goingConcern.response.status, 200, JSON.stringify(goingConcern.body));
  const submittedGoingConcern = await send(fixture.actorProfileId, 'APPROVER', { type: 'review.submit', payload: {
    targetKind: 'GOING_CONCERN', targetId: goingConcern.body.result?.assessmentId, targetVersion: 1
  } });
  assert.equal(submittedGoingConcern.response.status, 200, JSON.stringify(submittedGoingConcern.body));
  const acceptedGoingConcern = await send(managerActorId, 'REVIEWER', { type: 'review.decide', payload: {
    submissionId: submittedGoingConcern.body.result?.submissionId, decision: 'ACCEPT',
    comment: 'The current going-concern conclusion and its source pins were independently accepted.'
  } });
  assert.equal(acceptedGoingConcern.response.status, 200, JSON.stringify(acceptedGoingConcern.body));

  const holdingContactId = randomUUID();
  const holdingLetterRouteId = randomUUID();
  runFixtureSql(`INSERT INTO contacts(id,workspace_id,version,client_id,full_name,email,title,role,is_primary,is_signatory,active,effective_from,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,'QA Handover Managing Director','holding-md@example.invalid','Managing Director','MD_GM',0,1,1,'2026-01-01',?,?,?,?)`,
  holdingContactId, fixture.workspaceId, fixture.clientId, now, now, fixture.actorProfileId, fixture.actorProfileId);
  runFixtureSql(`INSERT INTO contact_routes(id,workspace_id,version,client_id,purpose,contact_id,is_primary,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,'HOLDING_LETTER',?,1,?,?,?,?)`, holdingLetterRouteId, fixture.workspaceId, fixture.clientId, holdingContactId,
  now, now, fixture.actorProfileId, fixture.actorProfileId);
  runFixtureSql(`INSERT INTO firm_profiles(id,workspace_id,version,legal_name,registration_number,address,profile_text,methodology_text,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,'QA Fieldwork Firm','CR-QA-FLD-013','Doha, Qatar','Synthetic firm profile for local Holding Letter acceptance.',
      'Synthetic test data only; not professional methodology.',?,?,?,?)`, randomUUID(), fixture.workspaceId, now, now, fixture.actorProfileId, fixture.actorProfileId);
  const localEmailPurposes: string[] = [];
  server.setEmailProvider(async request => {
    assert.equal(new URL(request.url).host, 'email-provider.local');
    const form = await request.formData();
    const message = JSON.parse(String(form.get('message'))) as { to?: string; purpose?: string };
    assert.match(message.to ?? '', /@example\.invalid$/);
    assert.ok(request.headers.get('Idempotency-Key'));
    localEmailPurposes.push(message.purpose ?? '');
    return Response.json({ messageId: `local-handover-provider-${localEmailPurposes.length}` }, { status: 202 });
  });
  const handoverConfirmation = await send(fixture.actorProfileId, 'APPROVER', { type: 'confirmation.create', payload: {
    engagementId: fixture.engagementId, type: 'BANK', fsliId: fixture.fsliId,
    externalPartyName: 'Synthetic Handover Gate Bank', externalPartyAddress: '1 Example Street, Doha', externalPartyEmail: 'bank@example.invalid',
    recipientVerificationText: 'Verified against the synthetic engagement contact record.', critical: true,
    criticalityReason: 'This confirmation is individually material to the synthetic audit fieldwork.', dueDate: '2026-12-31'
  } });
  assert.equal(handoverConfirmation.response.status, 200, JSON.stringify(handoverConfirmation.body));
  const handoverConfirmationId = String(handoverConfirmation.body.result?.confirmationId ?? '');
  assert.ok(handoverConfirmationId);
  const blockedManagerHandover = await send(managerActorId, 'REVIEWER', { type: 'fieldwork.handover-manager', payload: {
    engagementId: fixture.engagementId, expectedVersion: 1,
    reason: 'Current workprograms, procedures and going-concern assessment have independent review.'
  } });
  assert.equal(blockedManagerHandover.response.status, 200, JSON.stringify(blockedManagerHandover.body));
  assert.equal(blockedManagerHandover.body.result?.blocked, true, 'the Worker returns a blocker result for the critical confirmation');
  assert.ok((blockedManagerHandover.body.result?.blockers as Array<{ entityId: string }>).some(item => item.entityId === handoverConfirmationId));
  const handoverHoldingJobId = String(blockedManagerHandover.body.result?.holdingLetterJobId ?? '');
  assert.ok(handoverHoldingJobId, 'Manager handover queues an idempotent Holding Letter job');
  assert.equal(server.db.prepare('SELECT lifecycle_state FROM engagements WHERE workspace_id=? AND id=?')
    .bind(fixture.workspaceId, fixture.engagementId).first<{ lifecycle_state: string }>()?.lifecycle_state, 'FIELDWORK_EXECUTION',
    'the blocked handover does not advance the engagement lifecycle');
  assert.equal(server.db.prepare(`SELECT COUNT(*) AS count FROM outbox_jobs WHERE workspace_id=? AND id=? AND deduplication_key LIKE 'holding-letter:%'`)
    .bind(fixture.workspaceId, handoverHoldingJobId).first<{ count: number }>()?.count, 1);
  let handoverLetter: { id: string; dispatch_status: string } | null = null;
  for (let attempt = 0; attempt < 8 && handoverLetter?.dispatch_status !== 'ACCEPTED'; attempt += 1) {
    await server.runScheduled();
    handoverLetter = server.db.prepare(`SELECT h.id,d.status AS dispatch_status FROM holding_letters h
      JOIN dispatches d ON d.workspace_id=h.workspace_id AND d.id=h.dispatch_id
      WHERE h.workspace_id=? AND h.engagement_id=?`).bind(fixture.workspaceId, fixture.engagementId)
      .first<{ id: string; dispatch_status: string }>();
  }
  const handoverJobDiagnostic = server.db.prepare('SELECT status,last_error_code FROM outbox_jobs WHERE workspace_id=? AND id=?')
    .bind(fixture.workspaceId, handoverHoldingJobId).first<{ status: string; last_error_code: string | null }>();
  assert.ok(handoverLetter?.id, `the Worker outbox generates the blocked handover Holding Letter; job=${JSON.stringify(handoverJobDiagnostic)}`);
  assert.equal(handoverLetter.dispatch_status, 'ACCEPTED');
  assert.ok(localEmailPurposes.includes('HOLDING_LETTER'));
  const partnerScopeReassessment = await send(fixture.actorProfileId, 'APPROVER', { type: 'confirmation.scope-reassess', payload: {
    confirmationId: handoverConfirmationId, expectedVersion: 1,
    rationale: 'The Partner reviewed the current fieldwork sources and approved a noncritical replacement confirmation scope.',
    replacementCritical: false, replacementCriticalityReason: null
  } });
  assert.equal(partnerScopeReassessment.response.status, 200, JSON.stringify(partnerScopeReassessment.body));
  assert.equal(partnerScopeReassessment.body.result?.status, 'CANCELLED');
  assert.equal(partnerScopeReassessment.body.result?.replacementCritical, false);

  const managerHandover = await send(managerActorId, 'REVIEWER', { type: 'fieldwork.handover-manager', payload: {
    engagementId: fixture.engagementId, expectedVersion: 1,
    reason: 'Current workprograms, procedures and going-concern assessment have independent review.'
  } });
  assert.equal(managerHandover.response.status, 200, JSON.stringify(managerHandover.body));
  assert.equal(managerHandover.body.result?.state, 'MANAGERIAL_REVIEW');
  const managerialStage = await readWorkflowStage('MANAGERIAL_REVIEW');
  assert.ok(managerialStage.blockers.some(item => item.code === 'PARTNER_AREA_CLEARANCE_REQUIRED'));
  assert.ok(managerialStage.blockers.some(item => item.code === 'MANAGER_SRM_REQUIRED'));

  const currentProgram = server.db.prepare(`SELECT version,source_hash,planning_version_id FROM workprograms WHERE workspace_id=? AND id=?`)
    .bind(fixture.workspaceId, fixture.workprogramId).first<any>();
  const currentProcedures = server.db.prepare(`SELECT id,version,status,source_hash,evidence_set_hash FROM procedures WHERE workspace_id=? AND workprogram_id=? ORDER BY ordinal`)
    .bind(fixture.workspaceId, fixture.workprogramId).all<any>().results;
  const areaDependencyHash = sha256(JSON.stringify({
    workprogramSourceHash: currentProgram.source_hash,
    planningVersionId: currentProgram.planning_version_id,
    tbVersionId: fixture.tbVersionId,
    mappingVersionId: fixture.mappingVersionId,
    dependencies: currentProcedures.map((row: any) => ({
      id: row.id, version: row.version, status: row.status, sourceHash: row.source_hash, evidenceSetHash: row.evidence_set_hash
    }))
  }));
  const areaClearance = await send(fixture.actorProfileId, 'APPROVER', { type: 'partner.clear-area', payload: {
    workprogramId: fixture.workprogramId, submissionId: submittedWorkprogram.body.result?.submissionId,
    dependencyHash: areaDependencyHash,
    rationale: 'The Partner reviewed the exact accepted workprogram, current procedures and evidence pins.'
  } });
  assert.equal(areaClearance.response.status, 200, JSON.stringify(areaClearance.body));

  const positiveFinding = await send(fixture.actorProfileId, 'APPROVER', { type: 'finding.create', payload: {
    engagementId: fixture.engagementId, fsliId: fixture.fsliId, title: 'Synthetic recorded overstatement',
    description: 'The synthetic ledger contains a recorded amount requiring evaluation against its retained source evidence.',
    severity: 'MODERATE', qualitativeSignificance: false
  } });
  assert.equal(positiveFinding.response.status, 200, JSON.stringify(positiveFinding.body));
  const positiveDifference = await send(fixture.actorProfileId, 'APPROVER', { type: 'difference.create', payload: {
    findingId: positiveFinding.body.result?.findingId, fsliId: fixture.fsliId, amountMinor: '300000', nature: 'FACTUAL',
    qualitativeSignificance: false, disposition: 'UNADJUSTED', dispositionReason: 'Retain the current synthetic overstatement for aggregate assessment.'
  } });
  assert.equal(positiveDifference.response.status, 200, JSON.stringify(positiveDifference.body));
  const negativeDifference = await send(fixture.actorProfileId, 'APPROVER', { type: 'difference.create', payload: {
    findingId: positiveFinding.body.result?.findingId, fsliId: fixture.fsliId, amountMinor: '-250000', nature: 'PROJECTED',
    qualitativeSignificance: false, disposition: 'UNADJUSTED', dispositionReason: 'Retain the unrelated projected understatement without netting away its gross amount.'
  } });
  assert.equal(negativeDifference.response.status, 200, JSON.stringify(negativeDifference.body));
  const qualitativeFinding = await send(fixture.actorProfileId, 'APPROVER', { type: 'finding.create', payload: {
    engagementId: fixture.engagementId, fsliId: fixture.fsliId, title: 'Synthetic management integrity concern',
    description: 'A low-value synthetic exception remains qualitatively significant because it concerns management integrity.',
    severity: 'HIGH', qualitativeSignificance: true
  } });
  assert.equal(qualitativeFinding.response.status, 200, JSON.stringify(qualitativeFinding.body));
  const qualitativeDifference = await send(fixture.actorProfileId, 'APPROVER', { type: 'difference.create', payload: {
    findingId: qualitativeFinding.body.result?.findingId, fsliId: fixture.fsliId, amountMinor: '10000', nature: 'JUDGMENTAL',
    qualitativeSignificance: true, disposition: 'UNADJUSTED', dispositionReason: 'Retain the low-value qualitative exception for Partner assessment.'
  } });
  assert.equal(qualitativeDifference.response.status, 200, JSON.stringify(qualitativeDifference.body));

  const compiled = await send(managerActorId, 'REVIEWER', { type: 'srm.compile', payload: {
    engagementId: fixture.engagementId,
    managerRecommendation: 'The synthetic unadjusted and qualitative matters remain visible for Partner consideration.',
    estimatesText: 'The synthetic engagement contains no material accounting estimates requiring a separate conclusion.'
  } });
  assert.equal(compiled.response.status, 200, JSON.stringify(compiled.body));
  assert.equal(compiled.body.result?.grossUnadjustedMinor, '560000', 'the SRM carries gross exposure without netting the positive and negative items');
  assert.equal(compiled.body.result?.signedUnadjustedMinor, '60000');
  assert.equal(compiled.body.result?.reviewSnapshot?.goingConcern?.decision, 'ACCEPT');
  assert.equal(compiled.body.result?.reviewSnapshot?.procedures?.every((row: any) => row.status === 'REVIEWED'), true);
  assert.equal(compiled.body.result?.reviewSnapshot?.partnerAreaClearances?.length, 1);

  const partnerHandover = await send(fixture.actorProfileId, 'APPROVER', { type: 'fieldwork.handover-partner', payload: {
    engagementId: fixture.engagementId, expectedVersion: 2,
    reason: 'The Manager recommendation and every current area clearance are ready for Partner approval.'
  } });
  assert.equal(partnerHandover.response.status, 200, JSON.stringify(partnerHandover.body));
  assert.equal(partnerHandover.body.result?.state, 'PARTNER_APPROVAL');

  const partnerClearance = await send(fixture.actorB, 'APPROVER', { type: 'srm.clear', payload: {
    srmVersionId: compiled.body.result?.srmVersionId, dependencyHash: compiled.body.result?.dependencyHash,
    rationale: 'The Partner cleared the exact current Manager SRM after independent review.'
  } });
  assert.equal(partnerClearance.response.status, 200, JSON.stringify(partnerClearance.body));
  assert.equal(partnerClearance.body.result?.dependencyHash, compiled.body.result?.dependencyHash);
  const partnerStage = await readWorkflowStage('PARTNER_APPROVAL');
  assert.ok(partnerStage.blockers.some(item => item.code === 'FIVE_PART_BUNDLE_CANDIDATE_REQUIRED'),
    'Partner approval identifies the final reporting package as the remaining stage gate');

  const statementBeforeLateAje = await fetch(`${server!.origin}/api/workspaces/${fixture.workspaceId}/engagements/${fixture.engagementId}/financial-statements`, {
    headers: { Origin: server!.origin, 'X-Actor-Id': fixture.actorProfileId, 'X-Active-Persona': 'APPROVER', 'X-Client-Id': fixture.clientId, 'X-Engagement-Id': fixture.engagementId }
  });
  assert.equal(statementBeforeLateAje.status, 200);
  const basisBeforeLateAje = await statementBeforeLateAje.json() as { sourceHash: string };
  const lateAdjustment = await send(fixture.actorProfileId, 'APPROVER', { type: 'adjustment.create', payload: {
    engagementId: fixture.engagementId, tbVersionId: fixture.tbVersionId,
    description: 'A late client-accepted correction changes the financial basis after the prior Partner SRM clearance.',
    evidenceIds: [retainedEvidence.body.result?.evidenceId],
    lines: [
      { fsliId: adjustmentOffsetFsliId, accountCode: 'EXP-900', debitMinor: '25000', creditMinor: '0' },
      { fsliId: fixture.fsliId, accountCode: 'REV-900', debitMinor: '0', creditMinor: '25000' }
    ]
  } });
  assert.equal(lateAdjustment.response.status, 200, JSON.stringify(lateAdjustment.body));
  const lateAdjustmentId = String(lateAdjustment.body.result?.adjustmentId);
  const lateAjeProposal = await send(fixture.actorProfileId, 'APPROVER', { type: 'adjustment.propose', payload: {
    adjustmentId: lateAdjustmentId, expectedVersion: 1
  } });
  assert.equal(lateAjeProposal.response.status, 200, JSON.stringify(lateAjeProposal.body));
  const lateClientResponse = await send(clientActorId, 'CLIENT', { type: 'adjustment.client-respond', payload: {
    adjustmentId: lateAdjustmentId, expectedVersion: 2, decision: 'ACCEPTED',
    responseText: 'Management accepts the supported correction and will record it in the accounting records.'
  } });
  assert.equal(lateClientResponse.response.status, 200, JSON.stringify(lateClientResponse.body));
  const lateAjeApproval = await send(managerActorId, 'REVIEWER', { type: 'adjustment.approve', payload: {
    adjustmentId: lateAdjustmentId, expectedVersion: 3, sourceHash: lateClientResponse.body.result?.sourceHash
  } });
  assert.equal(lateAjeApproval.response.status, 200, JSON.stringify(lateAjeApproval.body));
  assert.equal(lateAjeApproval.body.result?.status, 'REVIEW_APPROVED');
  const statementAfterLateAje = await fetch(`${server!.origin}/api/workspaces/${fixture.workspaceId}/engagements/${fixture.engagementId}/financial-statements`, {
    headers: { Origin: server!.origin, 'X-Actor-Id': fixture.actorProfileId, 'X-Active-Persona': 'APPROVER', 'X-Client-Id': fixture.clientId, 'X-Engagement-Id': fixture.engagementId }
  });
  assert.equal(statementAfterLateAje.status, 200);
  const basisAfterLateAje = await statementAfterLateAje.json() as { sourceHash: string };
  assert.notEqual(basisAfterLateAje.sourceHash, basisBeforeLateAje.sourceHash, 'the newly accepted AJE changes the financial statement basis');
  const staleClearance = await send(fixture.actorB, 'APPROVER', { type: 'srm.clear', payload: {
    srmVersionId: compiled.body.result?.srmVersionId, dependencyHash: compiled.body.result?.dependencyHash,
    rationale: 'A stale clearance attempt must not accept changed inputs.'
  } });
  assert.equal(staleClearance.response.status, 409, JSON.stringify(staleClearance.body));
  assert.equal(staleClearance.body.code, 'STALE_DEPENDENCY');
  assert.equal(staleClearance.body.commandType, 'srm.clear');
  assert.equal(server.db.prepare(`SELECT COUNT(*) AS count FROM srm_clearances WHERE workspace_id=? AND srm_version_id=?`)
    .bind(fixture.workspaceId, compiled.body.result?.srmVersionId).first<any>()?.count, 1,
  'the immutable prior clearance remains historical after new fieldwork input invalidates it');
});

it('US-PRC-001 records procedure-linked time in the browser and requires independent approval', { timeout: 120000 }, async () => {
  await ensureBrowsers();
  assert.ok(server && tabA && tabB);
  const fixture = await createFieldworkFixture();
  const preparer = addTimeEntryPreparer(fixture);
  const procedureTitle = 'Same-row concurrent edits';
  const practiceSelector = `[aria-labelledby="business-practice-${fixture.engagementId}"]`;

  try {
    await Promise.all([
      selectPracticeWorkspace(tabA, fixture, preparer.actorId, 'PREPARER', 'ASSOCIATE'),
      selectPracticeWorkspace(tabB, fixture, fixture.actorProfileId, 'APPROVER', 'PARTNER')
    ]);
    await waitFor(tabA, 'the time-entry form and engagement procedures', `(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      const form = [...(panel?.querySelectorAll('form') ?? [])].find(item => item.querySelector('h3')?.textContent?.trim() === 'Record actual time');
      const procedure = [...(form?.querySelectorAll('label.business-field') ?? [])].find(item => item.querySelector('span')?.textContent?.trim() === 'Procedure (optional)')?.querySelector('select');
      return !!procedure && [...procedure.options].some(option => option.value === ${JSON.stringify(fixture.procedureA)} && option.textContent?.includes(${JSON.stringify(procedureTitle)}));
    })()`);

    const observedForm = await tabA.evaluate<{ procedureVisible: boolean; procedureOptionCount: number; defaultMinutes: string }>(`(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      const form = [...(panel?.querySelectorAll('form') ?? [])].find(item => item.querySelector('h3')?.textContent?.trim() === 'Record actual time');
      const labels = [...(form?.querySelectorAll('label.business-field') ?? [])];
      const procedure = labels.find(item => item.querySelector('span')?.textContent?.trim() === 'Procedure (optional)')?.querySelector('select');
      const minutes = labels.find(item => item.querySelector('span')?.textContent?.trim() === 'Actual minutes')?.querySelector('input');
      return { procedureVisible: !!procedure?.getClientRects().length, procedureOptionCount: procedure?.options.length ?? 0, defaultMinutes: minutes?.value ?? '' };
    })()`);
    assert.equal(observedForm.procedureVisible, true, 'the optional procedure selector is visible before interaction');
    assert.ok(observedForm.procedureOptionCount > 1, 'the active engagement procedures populate the selector');

    await setPracticeFieldByLabel(tabA, fixture.engagementId, 'Procedure (optional)', fixture.procedureA, procedureTitle);
    await waitFor(tabA, 'the selected procedure FSLI to populate the time entry', `(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      const form = [...(panel?.querySelectorAll('form') ?? [])].find(item => item.querySelector('h3')?.textContent?.trim() === 'Record actual time');
      const labels = [...(form?.querySelectorAll('label.business-field') ?? [])];
      const fsli = labels.find(item => item.querySelector('span')?.textContent?.trim() === 'FSLI (optional)')?.querySelector('select');
      return fsli?.value === ${JSON.stringify(fixture.fsliId)};
    })()`);
    await setPracticeFieldByLabel(tabA, fixture.engagementId, 'Actual minutes', '90');
    await setPracticeFieldByLabel(tabA, fixture.engagementId, 'Description', 'Reviewed retained evidence for the selected synthetic procedure.');

    await clickPracticeAction(tabA, fixture.engagementId, 'Save draft time entry');
    await waitFor(tabA, 'the saved draft time row', `(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      return [...(panel?.querySelectorAll('table tbody tr') ?? [])].some(row => row.textContent?.includes(${JSON.stringify(procedureTitle)}) &&
        row.textContent?.includes('90') && row.textContent?.includes('DRAFT'));
    })()`);
    const draftRow = await readPracticeTimeRow(tabA, fixture.engagementId, procedureTitle, 90);
    assert.ok(draftRow, 'the saved entry is shown with its selected procedure');
    assert.equal(draftRow.status, 'DRAFT');
    assert.equal(draftRow.hasSubmit, true, 'the preparer can submit their draft');
    assert.equal(draftRow.hasApprove, false, 'the preparer cannot approve their own time');

    await clickPracticeAction(tabA, fixture.engagementId, 'Submit', procedureTitle, 90);
    await waitFor(tabA, 'the submitted time row without an approval action for the preparer', `(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      const row = [...(panel?.querySelectorAll('table tbody tr') ?? [])].find(item => item.textContent?.includes(${JSON.stringify(procedureTitle)}) && item.textContent?.includes('90'));
      return !!row && row.textContent?.includes('SUBMITTED') && ![...row.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Approve');
    })()`);

    await clickPracticeAction(tabB, fixture.engagementId, 'Refresh practice data');
    await waitFor(tabB, 'the Partner-visible submitted time row', `(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      const row = [...(panel?.querySelectorAll('table tbody tr') ?? [])].find(item => item.textContent?.includes(${JSON.stringify(procedureTitle)}) && item.textContent?.includes('90'));
      return !!row && row.textContent?.includes('SUBMITTED') && [...row.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Approve');
    })()`);
    await clickPracticeAction(tabB, fixture.engagementId, 'Approve', procedureTitle, 90);
    await waitFor(tabB, 'independent approval and the QAR 300 charge-out value', `(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      const row = [...(panel?.querySelectorAll('table tbody tr') ?? [])].find(item => item.textContent?.includes(${JSON.stringify(procedureTitle)}) && item.textContent?.includes('90'));
      const cells = [...(row?.querySelectorAll('td') ?? [])];
      return cells[6]?.textContent?.trim() === 'APPROVED' && cells[5]?.textContent?.trim() === 'QAR 300.00';
    })()`);
    const approvedRow = await readPracticeTimeRow(tabB, fixture.engagementId, procedureTitle, 90);
    assert.equal(approvedRow?.status, 'APPROVED');
    assert.equal(approvedRow?.amount, 'QAR 300.00');

    await clickPracticeAction(tabA, fixture.engagementId, 'Refresh practice data');
    await waitFor(tabA, 'the final approved time row in the preparer workspace', `(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      const row = [...(panel?.querySelectorAll('table tbody tr') ?? [])].find(item => item.textContent?.includes(${JSON.stringify(procedureTitle)}) && item.textContent?.includes('90'));
      const cells = [...(row?.querySelectorAll('td') ?? [])];
      return cells[6]?.textContent?.trim() === 'APPROVED' && cells[5]?.textContent?.trim() === 'QAR 300.00';
    })()`);

    await waitFor(tabA, 'the report date controls and initial utilization panel', `(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      const from = [...(panel?.querySelectorAll('label.business-field') ?? [])].find(item => item.querySelector('span')?.textContent?.trim() === 'Report from')?.querySelector('input[type="date"]');
      const table = panel?.querySelector('.business-utilization-table');
      return !!from && !!table && [...(table.querySelectorAll('thead th') ?? [])].some(item => item.textContent?.trim() === 'Recorded');
    })()`);
    await setPracticeReportDate(tabA, fixture.engagementId, 'Report from', preparer.workDate);
    await waitFor(tabA, 'the inclusive one-day Qatar utilization period', `(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      const title = [...(panel?.querySelectorAll('h3') ?? [])].find(item => item.textContent?.startsWith('Utilization'));
      const card = title?.closest('.business-record-list');
      return card?.querySelector('p.business-muted')?.textContent?.includes(${JSON.stringify(`Inclusive Qatar work dates ${preparer.workDate} to ${preparer.workDate}`)}) ?? false;
    })()`);
    await waitFor(tabA, 'the inclusive-date utilization row and over-capacity alert', `(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      const table = panel?.querySelector('.business-utilization-table');
      const row = [...(table?.querySelectorAll('tbody tr') ?? [])].find(item => item.textContent?.includes('QA Time Entry Preparer'));
      const headers = [...(table?.querySelectorAll('thead th') ?? [])].map(item => item.textContent?.trim());
      return headers.includes('Recorded') && headers.includes('Approved') && headers.includes('Nonbillable') &&
        !!row && row.textContent?.includes('90 min') && row.textContent?.includes('60 min') &&
        row.textContent?.includes('150.00%') && row.textContent?.includes('Over capacity') && row.textContent?.includes('30 min');
    })()`);
    const utilizationEvidence = await tabA.evaluate<string>(`(() => {
      const panel = document.querySelector(${JSON.stringify(practiceSelector)});
      return [...(panel?.querySelectorAll('.business-utilization-table tbody tr') ?? [])]
        .find(item => item.textContent?.includes('QA Time Entry Preparer'))?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
    })()`);
    assert.match(utilizationEvidence, /150\.00%.*Over capacity.*30 min/, 'the approved 90 minutes against 60 available is visibly identified as 150% utilization and 30 minutes over capacity');
  } catch (error) {
    const diagnostics = await Promise.allSettled([readPracticeDiagnostics(tabA, fixture.engagementId), readPracticeDiagnostics(tabB, fixture.engagementId)]);
    const uiDiagnostics = diagnostics.map((result, index) => `browser${index + 1}=${result.status === 'fulfilled' ? result.value : 'diagnostics unavailable'}`).join(' ');
    const evidence = await Promise.allSettled([captureUiFailure(tabA, 'practice-preparer', fixture.engagementId), captureUiFailure(tabB, 'practice-approver', fixture.engagementId)]);
    const screenshots = evidence.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    throw new Error(`${error instanceof Error ? error.message : String(error)}. UI diagnostics: ${uiDiagnostics}. Browser evidence: ${screenshots.join(', ') || 'screenshot capture failed'}`, { cause: error });
  }
});
