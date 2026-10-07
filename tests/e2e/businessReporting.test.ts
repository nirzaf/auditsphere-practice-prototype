import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { after, before, it } from 'node:test';
import { unzipSync, zlibSync } from 'fflate';
import { CdpTab } from '../helpers/cdp.js';
import { launchHeadlessChrome, stopHeadlessChrome, type HeadlessChromeInstance } from '../helpers/headlessChrome.js';
import { startBusinessE2eServer, type BusinessE2eServer } from '../helpers/businessE2eServer.js';

let server: BusinessE2eServer | undefined;
let browser: HeadlessChromeInstance | undefined;
let tab: CdpTab | undefined;

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');

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

async function waitFor(label: string, predicate: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tab!.evaluate<boolean>(predicate)) return;
    await sleep(80);
  }
  const text = await tab!.evaluate<string>('document.body.innerText.slice(-6000)');
  throw new Error(`Timed out waiting for ${label}. Current page text: ${text}`);
}

function runFixtureSql(sql: string, ...values: unknown[]): void {
  assert.ok(server);
  try {
    server.db.prepare(sql).bind(...values).run();
  } catch (error) {
    console.error('Reporting fixture SQL failed:', sql, error);
    throw error;
  }
}

function png(alpha: number): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const crc32 = (bytes: Uint8Array) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind: string, data: Uint8Array) => {
    const type = new TextEncoder().encode(kind);
    const body = new Uint8Array(type.length + data.length);
    body.set(type);
    body.set(data, type.length);
    const result = new Uint8Array(data.length + 12);
    const view = new DataView(result.buffer);
    view.setUint32(0, data.length);
    result.set(body, 4);
    view.setUint32(data.length + 8, crc32(body));
    return result;
  };
  const header = new Uint8Array(13);
  const dimensions = new DataView(header.buffer);
  dimensions.setUint32(0, 1);
  dimensions.setUint32(4, 1);
  header[8] = 8;
  header[9] = 6;
  const chunks = [signature, chunk('IHDR', header), chunk('IDAT', zlibSync(new Uint8Array([0, 35, 84, 127, alpha]))), chunk('IEND', new Uint8Array())];
  const result = new Uint8Array(chunks.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of chunks) { result.set(part, offset); offset += part.length; }
  return result;
}

function minimalPdf(label: string): Uint8Array {
  const safeLabel = label.replace(/[^\x20-\x7e]/g, ' ').replace(/[\\()]/g, '\\$&');
  const stream = `BT /F1 12 Tf 72 720 Td (${safeLabel}) Tj ET\n`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) { offsets.push(pdf.length); pdf += object; }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

async function seedReportingFixture(engagementType: 'STATUTORY_AUDIT' | 'AGREED_UPON_PROCEDURES' = 'STATUTORY_AUDIT') {
  assert.ok(server);
  const key = randomUUID();
  const now = new Date().toISOString();
  const todayQatar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const digest = (label: string) => sha256(label);
  const bootstrap = await fetch(`${server.origin}/api/workspaces`, {
    method: 'POST',
    headers: { Origin: server.origin, 'Content-Type': 'application/json', 'Idempotency-Key': `reporting-${key}` },
    body: JSON.stringify({
      name: `Reporting journey ${key.slice(0, 8)}`,
      currency: 'QAR',
      timezone: 'Asia/Qatar',
      initialPartner: { displayName: 'QA Reporting Partner', naturalPersonKey: `QA-PARTNER-${key}`, email: 'qa.partner@example.invalid' }
    })
  });
  assert.equal(bootstrap.status, 201, 'the local Worker creates an isolated BUSINESS workspace');
  const workspace = await bootstrap.json() as { workspaceId: string; staffMemberId: string; actorProfileId: string };
  const ids = {
    client: randomUUID(), standards: randomUUID(), engagement: randomUUID(), firmProfile: randomUUID(),
    tbFile: randomUUID(), tbImport: randomUUID(), tb: randomUUID(), mappingDraft: randomUUID(), mappingVersion: randomUUID(),
    materiality: randomUUID(), planning: randomUUID(), snapshot: randomUUID(), goingConcern: randomUUID(), srm: randomUUID(),
    draft: randomUUID(), approval: randomUUID(),
    revenueFsli: randomUUID(), assetFsli: randomUUID(), equityFsli: randomUUID(),
    revenueLine: randomUUID(), assetLine: randomUUID(), equityLine: randomUUID(),
    revenueDraftLine: randomUUID(), assetDraftLine: randomUUID(), equityDraftLine: randomUUID(),
    revenueMapping: randomUUID(), assetMapping: randomUUID(), equityMapping: randomUUID(),
    signatureFile: randomUUID(), sealFile: randomUUID(),
    managementContact: randomUUID(), clientActor: randomUUID(), reportRoute: randomUUID(), reviewerStaff: randomUUID(), reviewerActor: randomUUID(),
    proposal: randomUUID(), proposalVersion: randomUUID(), proposalDecision: randomUUID(), proposalApproval: randomUUID(), commercialAcceptance: randomUUID(),
    riskAssessment: randomUUID(), riskVersion: randomUUID(), riskDecision: randomUUID(), riskClearance: randomUUID(),
    letterTemplate: randomUUID(), signatureConsentDecision: randomUUID(), sealApproval: randomUUID(), engagementLetter: randomUUID(),
    engagementLetterFile: randomUUID(), engagementLetterArtifact: randomUUID(), taxPolicy: randomUUID(), advanceInvoice: randomUUID(),
    advanceInvoiceFile: randomUUID(), advanceInvoiceArtifact: randomUUID()
  };
  const workspaceId = workspace.workspaceId;
  const actorId = workspace.actorProfileId;
  const firmAddress = 'Doha, Qatar';
  const sourceHash = digest(`reporting-source:${key}`);

  runFixtureSql(`INSERT INTO clients(id,workspace_id,version,code,legal_name,entity_type,industry,address,country_code,active,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,'QA Reporting Client WLL','STANDALONE','Professional services',?,'QA',1,?,?,?,?)`,
  ids.client, workspaceId, `QA-${key.slice(0, 12)}`, firmAddress, now, now, actorId, actorId);
  runFixtureSql(`INSERT INTO contacts(id,workspace_id,version,client_id,full_name,email,phone,title,role,is_primary,is_signatory,active,effective_from,effective_to,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,'QA Managing Director','qa.md@example.invalid',NULL,'Managing Director','MD_GM',1,1,1,'2020-01-01',NULL,?,?,?,?)`,
  ids.managementContact, workspaceId, ids.client, now, now, actorId, actorId);
  runFixtureSql(`INSERT INTO actor_profiles(id,workspace_id,persona,staff_member_id,contact_id,active,created_at,updated_at)
    VALUES(?,?,'CLIENT',NULL,?,1,?,?)`, ids.clientActor, workspaceId, ids.managementContact, now, now);
  runFixtureSql(`INSERT INTO contact_routes(id,workspace_id,version,client_id,purpose,contact_id,is_primary,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,'FINAL_REPORT',?,1,?,?,?,?)`, ids.reportRoute, workspaceId, ids.client, ids.managementContact, now, now, actorId, actorId);
  runFixtureSql(`INSERT INTO staff_members(id,workspace_id,version,natural_person_key,display_name,email,grade,active,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,'QA Reporting Reviewer','qa.reviewer@example.invalid','MANAGER',1,?,?,?,?)`,
  ids.reviewerStaff, workspaceId, `QA-REVIEWER-${key}`, now, now, actorId, actorId);
  runFixtureSql(`INSERT INTO actor_profiles(id,workspace_id,persona,staff_member_id,contact_id,active,created_at,updated_at)
    VALUES(?,?,'REVIEWER',?,NULL,1,?,?)`, ids.reviewerActor, workspaceId, ids.reviewerStaff, now, now);
  runFixtureSql(`INSERT INTO standards_profiles(id,workspace_id,version,name,effective_period_start,effective_period_end,isa_220_edition,isa_570_edition,
      reporting_framework,presentation_edition,early_adoption,approved_by_actor_id,approved_at,content_sha256,created_at,updated_at)
    VALUES(?,?,1,'QA IFRS for SMEs profile','2020-01-01',NULL,'ISA 220 QA edition','ISA 570 QA edition','IFRS for SMEs','IAS1',0,?,?,?,?,?)`,
  ids.standards, workspaceId, actorId, now, digest('standards'), now, now);
  runFixtureSql(`INSERT INTO engagements(id,workspace_id,version,client_id,code,period_start,period_end,engagement_type,lifecycle_state,contract_fee_minor,
      standards_profile_id,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?,'2025-01-01','2025-12-31',?,'PARTNER_APPROVAL',100000,?,?,?,?,?)`,
  ids.engagement, workspaceId, ids.client, `QA-REPORT-${key.slice(0, 8)}`, engagementType, ids.standards, now, now, actorId, actorId);
  runFixtureSql(`INSERT INTO firm_profiles(id,workspace_id,version,legal_name,registration_number,address,profile_text,methodology_text,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,'QA Audit Partners WLL','CR-QA-001',?,'Synthetic audit firm profile for local browser acceptance.',
      'Synthetic local report rendering fixture. No professional assurance is represented by this test data.',?,?,?,?)`,
  ids.firmProfile, workspaceId, firmAddress, now, now, actorId, actorId);

  const tbBytes = new TextEncoder().encode('synthetic local accepted TB source');
  const tbKey = `e2e/${key}/accepted-tb.csv`;
  server.putTestObject(tbKey, tbBytes);
  runFixtureSql(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?, 'qa-reporting-tb.csv','text/csv',?,?,?,'TB','COMMITTED',?,1,?,?,?,?)`,
  ids.tbFile, workspaceId, ids.client, ids.engagement, tbBytes.length, sha256(tbBytes), tbKey, now, now, now, actorId, actorId);
  runFixtureSql(`INSERT INTO tb_imports(id,workspace_id,version,client_id,engagement_id,file_version_id,status,worksheet,column_map_json,row_count,source_sha256,
      current_debits_minor,current_credits_minor,prior_debits_minor,prior_credits_minor,error_count,errors_json,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,1,?,? ,?,'ACTIVATED','Sheet1','{}',3,?,200000,200000,180000,180000,0,'[]',?,?,?)`,
  ids.tbImport, workspaceId, ids.client, ids.engagement, ids.tbFile, sourceHash, actorId, now, now);
  runFixtureSql(`INSERT INTO tb_versions(id,workspace_id,client_id,engagement_id,revision,import_id,period_start,period_end,currency,current_debits_minor,current_credits_minor,
      prior_debits_minor,prior_credits_minor,prior_present,row_count,content_sha256,accepted_by_actor_id,accepted_at)
    VALUES(?,?,?, ?,1,?,'2025-01-01','2025-12-31','QAR',200000,200000,180000,180000,1,3,?,?,?)`,
  ids.tb, workspaceId, ids.client, ids.engagement, ids.tbImport, sourceHash, actorId, now);

  const fsliRows = [
    { id: ids.revenueFsli, code: 'QA-REV', name: 'Synthetic revenue', statement: 'PROFIT_LOSS', category: 'REVENUE', side: 'CREDIT', amount: -100000, prior: -80000 },
    { id: ids.assetFsli, code: 'QA-ASSET', name: 'Synthetic assets', statement: 'BALANCE_SHEET', category: 'ASSET', side: 'DEBIT', amount: 200000, prior: 180000 },
    { id: ids.equityFsli, code: 'QA-EQUITY', name: 'Synthetic equity', statement: 'BALANCE_SHEET', category: 'EQUITY', side: 'CREDIT', amount: -100000, prior: -100000 }
  ];
  for (let index = 0; index < fsliRows.length; index++) {
    const line = fsliRows[index];
    const tbLineId = [ids.revenueLine, ids.assetLine, ids.equityLine][index];
    const draftLineId = [ids.revenueDraftLine, ids.assetDraftLine, ids.equityDraftLine][index];
    const mappingId = [ids.revenueMapping, ids.assetMapping, ids.equityMapping][index];
    runFixtureSql(`INSERT INTO fsli_catalog(id,workspace_id,reporting_framework,code,name,statement,category,normal_side,display_sign,presentation_order,active)
      VALUES(?,?,'IFRS for SMEs',?,?,?,?,?,1,?,1)`, line.id, workspaceId, line.code, line.name, line.statement, line.category, line.side, index + 1);
    runFixtureSql(`INSERT INTO tb_lines(id,workspace_id,client_id,engagement_id,tb_version_id,source_row_number,account_code,account_name,current_minor,prior_minor,source_text_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`, tbLineId, workspaceId, ids.client, ids.engagement, ids.tb, index + 1, line.code, line.name, line.amount, line.prior, JSON.stringify({ source: 'synthetic QA fixture' }));
  }
  runFixtureSql(`INSERT INTO mapping_drafts(id,workspace_id,client_id,engagement_id,tb_version_id,revision,status,reporting_framework,content_sha256,created_by_actor_id,created_at)
    VALUES(?,?,?,?,?,1,'APPROVED','IFRS for SMEs',?,?,?)`, ids.mappingDraft, workspaceId, ids.client, ids.engagement, ids.tb, sourceHash, actorId, now);
  const draftLineIds = [ids.revenueDraftLine, ids.assetDraftLine, ids.equityDraftLine];
  const tbLineIds = [ids.revenueLine, ids.assetLine, ids.equityLine];
  const fsliIds = [ids.revenueFsli, ids.assetFsli, ids.equityFsli];
  const mappingIds = [ids.revenueMapping, ids.assetMapping, ids.equityMapping];
  for (let index = 0; index < fsliIds.length; index++) {
    runFixtureSql(`INSERT INTO mapping_draft_lines(id,workspace_id,version,draft_id,tb_line_id,fsli_id,origin,confirmed,reason)
      VALUES(?,?,1,?,?,?,'MANUAL',1,'Synthetic exact source mapping for report acceptance')`,
    draftLineIds[index], workspaceId, ids.mappingDraft, tbLineIds[index], fsliIds[index]);
  }
  runFixtureSql(`INSERT INTO mapping_versions(id,workspace_id,client_id,engagement_id,tb_version_id,draft_id,revision,reporting_framework,content_sha256,approved_by_actor_id,approved_at)
    VALUES(?,?,?,?,?,?,1,'IFRS for SMEs',?,?,?)`, ids.mappingVersion, workspaceId, ids.client, ids.engagement, ids.tb, ids.mappingDraft, sourceHash, actorId, now);
  for (let index = 0; index < fsliIds.length; index++) {
    runFixtureSql(`INSERT INTO tb_mappings(id,workspace_id,mapping_version_id,tb_line_id,fsli_id,origin,rationale)
      VALUES(?,?,?, ?,?,'MANUAL','Synthetic local report rendering fixture')`, mappingIds[index], workspaceId, ids.mappingVersion, tbLineIds[index], fsliIds[index]);
  }
  runFixtureSql(`INSERT INTO materiality_versions(id,workspace_id,client_id,engagement_id,revision,tb_version_id,mapping_version_id,benchmark,benchmark_minor,
      normalization_minor,benchmark_rate_bps,performance_rate_bps,sad_rate_bps,pm_raw_numerator,pm_raw_denominator,te_raw_numerator,te_raw_denominator,
      sad_raw_numerator,sad_raw_denominator,planning_minor,performance_minor,sad_minor,calculated_by_actor_id,calculated_at,source_sha256)
    VALUES(?,?,?,?,1,?,?,'REVENUE',100000,0,1000,750,100,'10000','1000000','1000','1000000','100','1000000',10000,1000,100,?,?,?)`,
  ids.materiality, workspaceId, ids.client, ids.engagement, ids.tb, ids.mappingVersion, actorId, now, sourceHash);
  runFixtureSql(`INSERT INTO planning_versions(id,workspace_id,client_id,engagement_id,revision,tb_version_id,mapping_version_id,materiality_version_id,standards_profile_id,
      scope_text,strategy_text,staffing_snapshot_json,milestone_snapshot_json,risk_snapshot_json,pbc_dependency_snapshot_json,source_sha256,prepared_by_actor_id,prepared_at)
    VALUES(?,?,?,?,1,?,?,?,?, 'Synthetic reporting acceptance scope','Synthetic report candidate dependency snapshot','{}','[]','[]','[]',?,?,?)`,
  ids.planning, workspaceId, ids.client, ids.engagement, ids.tb, ids.mappingVersion, ids.materiality, ids.standards, sourceHash, actorId, now);
  runFixtureSql(`INSERT INTO planning_signoffs(id,workspace_id,planning_version_id,partner_actor_id,approved_at,rationale,dependency_sha256)
    VALUES(?,?,?, ?,?,'Synthetic fixture pins the already approved planning dependency for local reporting acceptance',?)`,
  randomUUID(), workspaceId, ids.planning, actorId, now, sourceHash);
  runFixtureSql(`UPDATE engagements SET active_tb_version_id=?,active_mapping_version_id=?,active_materiality_version_id=?,approved_planning_version_id=?
    WHERE workspace_id=? AND id=?`, ids.tb, ids.mappingVersion, ids.materiality, ids.planning, workspaceId, ids.engagement);

  runFixtureSql(`INSERT INTO statement_snapshots(id,workspace_id,client_id,engagement_id,tb_version_id,mapping_version_id,adjustment_set_hash,standards_profile_id,source_hash,generated_at,generated_by_actor_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, ids.snapshot, workspaceId, ids.client, ids.engagement, ids.tb, ids.mappingVersion, digest('empty adjustment set'), ids.standards, sourceHash, now, actorId);
  const snapshotRows = [
    { id: ids.revenueLine, fsliId: ids.revenueFsli, base: 100000, prior: 80000, order: 1 },
    { id: ids.assetLine, fsliId: ids.assetFsli, base: 200000, prior: 180000, order: 2 },
    { id: ids.equityLine, fsliId: ids.equityFsli, base: 100000, prior: 100000, order: 3 }
  ];
  for (const row of snapshotRows) {
    runFixtureSql(`INSERT INTO statement_snapshot_lines(id,workspace_id,snapshot_id,fsli_id,current_base_minor,current_adjustment_minor,current_adjusted_minor,prior_minor,
        variance_numerator,variance_denominator,variance_reason,risk_band)
      VALUES(?,?,?,?,?,0,?,?,?,?,'CALCULATED','GREEN')`, row.id, workspaceId, ids.snapshot, row.fsliId, row.base, row.base, row.prior,
    String(row.base - row.prior), '1');
  }
  runFixtureSql(`INSERT INTO going_concern_assessments(id,workspace_id,version,client_id,engagement_id,revision,standards_profile_id,isa_570_edition,
      assessment_start,assessment_end,evidence_file_ids_json,checklist_json,events_text,mitigating_plans_text,conclusion,rationale,status,source_hash,prepared_by_actor_id,created_at)
    VALUES(?,?,1,?, ?,1,?,'ISA 570 QA edition','2025-01-01','2026-12-31','[]','{}','No synthetic adverse events were seeded.','No synthetic mitigation plan is required.',
      'NO_MATERIAL_UNCERTAINTY','Synthetic local reporting acceptance evidence is not professional sign-off.','REVIEWED',?,?,?)`,
  ids.goingConcern, workspaceId, ids.client, ids.engagement, ids.standards, sourceHash, actorId, now);
  const srmHash = digest('synthetic current srm dependency');
  runFixtureSql(`INSERT INTO srm_versions(id,workspace_id,client_id,engagement_id,revision,planning_version_id,statement_snapshot_id,signed_unadjusted_minor,gross_unadjusted_minor,
      materiality_snapshot_json,findings_snapshot_json,adjustments_snapshot_json,review_snapshot_json,estimates_text,going_concern_id,manager_recommendation,dependency_hash,compiled_by_actor_id,compiled_at)
    VALUES(?,?,?,?,1,?,?,0,0,'{}','{}','{}','{}','Synthetic current estimate snapshot.',?,'Synthetic Manager recommendation for local report UI acceptance.',?,?,?)`,
  ids.srm, workspaceId, ids.client, ids.engagement, ids.planning, ids.snapshot, ids.goingConcern, srmHash, actorId, now);
  runFixtureSql(`INSERT INTO srm_clearances(id,workspace_id,srm_version_id,partner_actor_id,rationale,dependency_hash,signed_at)
    VALUES(?,?,?,?,?,?,?)`, randomUUID(), workspaceId, ids.srm, actorId,
  'Synthetic fixture represents an already current Partner-cleared SRM for local report UI acceptance.', srmHash, now);

  const checklist = JSON.stringify({ cashFlow: true, equityChanges: true, accountingPolicies: true, notes: true, disclosure: true });
  runFixtureSql(`INSERT INTO financial_statement_drafts(id,workspace_id,client_id,engagement_id,version,statement_snapshot_id,standards_profile_id,accounting_policies,
      oci_applicable,completeness_checklist_json,status,source_hash,created_by_actor_id,created_at,updated_at)
    VALUES(?,?,?,?,1,?,?,?,0,?,'APPROVED',?,?,?,?)`,
  ids.draft, workspaceId, ids.client, ids.engagement, ids.snapshot, ids.standards,
  'Synthetic accounting policy disclosure for the local Worker-backed reporting browser acceptance journey.', checklist, sourceHash, actorId, now, now);
  const noteBody = 'Synthetic statement note retained for local PDF rendering and hash verification.';
  runFixtureSql(`INSERT INTO disclosure_notes(id,workspace_id,draft_id,note_number,title,body,amount_minor,supporting_file_id,sort_order)
    VALUES(?,?,?,'1','Synthetic basis of preparation',?,NULL,NULL,1)`, randomUUID(), workspaceId, ids.draft, noteBody);
  for (const line of [
    { section: 'CASH_FLOW', code: 'QA-CF', label: 'Synthetic operating cash flow', current: 25000, prior: 20000 },
    { section: 'EQUITY_CHANGE', code: 'QA-EQ', label: 'Synthetic closing equity movement', current: 25000, prior: 20000 }
  ]) {
    runFixtureSql(`INSERT INTO statement_supplement_lines(id,workspace_id,draft_id,section,code,label,current_minor,prior_minor,supporting_file_id,rationale)
      VALUES(?,?,?,?,?,?,?,?,NULL,'Synthetic supplemental schedule retained for local PDF rendering.')`, randomUUID(), workspaceId, ids.draft,
    line.section, line.code, line.label, line.current, line.prior);
  }
  runFixtureSql(`INSERT INTO financial_statement_approvals(id,workspace_id,client_id,engagement_id,draft_id,draft_version,statement_snapshot_id,notes_hash,supplement_hash,source_hash,approved_by_actor_id,approved_at)
    VALUES(?,?,?,?,?,1,?,?,?,?,?,?)`, ids.approval, workspaceId, ids.client, ids.engagement, ids.draft, ids.snapshot,
  digest('synthetic disclosure-note pin'), digest('synthetic supplemental schedule pin'), sourceHash, actorId, now);

  const signature = png(255);
  const seal = png(0);
  for (const [fileId, purpose, name, bytes] of [
    [ids.signatureFile, 'SIGNATURE', 'qa-partner-signature.png', signature],
    [ids.sealFile, 'SEAL', 'qa-partner-seal.png', seal]
  ] as const) {
    const objectKey = `e2e/${key}/${name}`;
    server.putTestObject(objectKey, bytes);
    runFixtureSql(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
      VALUES(?,?,1,NULL,NULL,?,'image/png',?,?,?,?,'COMMITTED',?,1,?,?,?,?)`,
    fileId, workspaceId, name, bytes.length, sha256(bytes), objectKey, purpose, now, now, now, actorId, actorId);
  }

  runFixtureSql(`INSERT INTO proposals(id,workspace_id,version,client_id,engagement_id,current_version_id,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?,NULL,?,?,?,?)`, ids.proposal, workspaceId, ids.client, ids.engagement, now, now, actorId, actorId);
  runFixtureSql(`INSERT INTO proposal_versions(id,workspace_id,version,client_id,engagement_id,proposal_id,revision,mode,scope,fee_minor,currency,advance_bps,final_bps,valid_until,
      timeline_json,firm_profile_snapshot_json,team_cv_file_ids_json,methodology_version,firm_profile_version,created_at,created_by_actor_id)
    VALUES(?,?,1,?,?,?,1,'FULL_PROPOSAL','Complete statutory audit and reporting deliverables for the synthetic acceptance fixture.',100000,'QAR',5000,5000,?,'[]','{}','[]','QA Methodology v1',1,?,?)`,
  ids.proposalVersion, workspaceId, ids.client, ids.engagement, ids.proposal, todayQatar, now, actorId);
  runFixtureSql(`UPDATE proposals SET current_version_id=?,updated_at=?,updated_by_actor_id=? WHERE workspace_id=? AND id=?`,
    ids.proposalVersion, now, actorId, workspaceId, ids.proposal);
  runFixtureSql(`INSERT INTO approval_decisions(id,workspace_id,client_id,engagement_id,subject_type,subject_id,subject_version,decision,rationale,actor_snapshot_json,decided_at,supersedes_decision_id)
    VALUES(?,?,?,?,?, ?,1,'APPROVE',?,?,?,NULL)`, ids.proposalDecision, workspaceId, ids.client, ids.engagement, 'PROPOSAL_VERSION', ids.proposalVersion,
  'Synthetic Partner approval pins the accepted commercial source used by this local reporting journey.', JSON.stringify({ actorId, persona: 'APPROVER', displayName: 'QA Reporting Partner' }), now);
  runFixtureSql(`INSERT INTO proposal_approvals(id,workspace_id,client_id,engagement_id,proposal_version_id,approval_decision_id,decision,rationale,decided_by_actor_id,decided_at)
    VALUES(?,?,?,?,?,?,'APPROVE','Synthetic Partner approval for the exact fee revision.',?,?)`,
  ids.proposalApproval, workspaceId, ids.client, ids.engagement, ids.proposalVersion, ids.proposalDecision, actorId, now);
  runFixtureSql(`INSERT INTO commercial_acceptances(id,workspace_id,sequence,client_id,engagement_id,proposal_version_id,contact_id,decision,accepted_fee_minor,confirmation_text,evidence_file_id,actor_id,revoked_acceptance_id,accepted_at)
    VALUES(?,?,1,?,?,?,?,'ACCEPT',100000,'QA management accepted the exact synthetic commercial revision.',NULL,?,NULL,?)`,
  ids.commercialAcceptance, workspaceId, ids.client, ids.engagement, ids.proposalVersion, ids.managementContact, ids.clientActor, now);

  runFixtureSql(`INSERT INTO risk_assessments(id,workspace_id,version,client_id,engagement_id,track,current_version_id,draft_version,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?,'NEW_CLIENT',NULL,1,?,?,?,?)`, ids.riskAssessment, workspaceId, ids.client, ids.engagement, now, now, actorId, actorId);
  const riskDependencyHash = digest('synthetic current risk assessment dependency');
  runFixtureSql(`INSERT INTO risk_assessment_versions(id,workspace_id,version,client_id,engagement_id,assessment_id,revision,assessment_source_version,source_draft_version,
      questionnaire_template_version,assessment_date,overall_risk,management_integrity_conclusion,viability_conclusion,independence_conclusion,ownership_hash,dependency_hash,submitted_by_actor_id,submitted_at)
    VALUES(?,?,1,?,?,?,1,1,1,'QA questionnaire v1',?,'MODERATE','Synthetic management integrity evidence was reviewed for this local fixture.',
      'Synthetic viability evidence is clear for the reporting acceptance fixture.','Synthetic independence evidence is clear for the reporting acceptance fixture.',?,?,?,?)`,
  ids.riskVersion, workspaceId, ids.client, ids.engagement, ids.riskAssessment, todayQatar, digest('synthetic ownership'), riskDependencyHash, actorId, now);
  runFixtureSql(`UPDATE risk_assessments SET current_version_id=?,updated_at=?,updated_by_actor_id=? WHERE workspace_id=? AND id=?`,
    ids.riskVersion, now, actorId, workspaceId, ids.riskAssessment);
  runFixtureSql(`INSERT INTO approval_decisions(id,workspace_id,client_id,engagement_id,subject_type,subject_id,subject_version,decision,rationale,actor_snapshot_json,decided_at,supersedes_decision_id)
    VALUES(?,?,?,?,?, ?,1,'APPROVE',?,?,?,NULL)`, ids.riskDecision, workspaceId, ids.client, ids.engagement, 'RISK_CLEARANCE', ids.riskVersion,
  'Synthetic Partner risk clearance for the isolated reporting acceptance fixture.', JSON.stringify({ actorId, persona: 'APPROVER', displayName: 'QA Reporting Partner' }), now);
  runFixtureSql(`INSERT INTO risk_clearances(id,workspace_id,sequence,client_id,engagement_id,assessment_version_id,approval_decision_id,decision,rationale,partner_actor_id,signature_asset_id,dependency_hash,supersedes_clearance_id,signed_at)
    VALUES(?,?,1,?,?,?,?,'CLEAR','Synthetic Partner cleared the risk source for the isolated reporting acceptance fixture.',?,?,?,NULL,?)`,
  ids.riskClearance, workspaceId, ids.client, ids.engagement, ids.riskVersion, ids.riskDecision, actorId, ids.signatureFile, riskDependencyHash, now);
  runFixtureSql(`INSERT INTO signature_asset_decisions(id,workspace_id,sequence,file_version_id,decision,partner_actor_id,rationale,decided_at)
    VALUES(?,?,1,?,'CONSENT',?,'Synthetic Partner consent authorizes this test-only engagement-letter signature asset.',?)`,
  ids.signatureConsentDecision, workspaceId, ids.signatureFile, actorId, now);
  runFixtureSql(`INSERT INTO seal_asset_approvals(id,workspace_id,sequence,file_version_id,decision,partner_actor_id,rationale,decided_at)
    VALUES(?,?,1,?,'APPROVE',?,'Synthetic Partner approval authorizes this test-only firm seal asset.',?)`,
  ids.sealApproval, workspaceId, ids.sealFile, actorId, now);
  runFixtureSql(`INSERT INTO document_template_versions(id,workspace_id,version,service_type,revision,name,clauses,content_sha256,approved_by_actor_id,approved_at)
    VALUES(?,?,1,'STATUTORY_AUDIT',1,'QA Engagement Letter Template','Synthetic local test clauses describing scope, limitations, responsibilities, fee and reporting period.',?,?,?)`,
  ids.letterTemplate, workspaceId, digest('synthetic engagement letter template'), actorId, now);

  const insertSeedPdf = (fileId: string, artifactId: string, name: string, label: string, artifactKind: 'ENGAGEMENT_LETTER' | 'INVOICE', sourceEntityType: string, sourceEntityId: string) => {
    const bytes = minimalPdf(label), objectKey = `e2e/${key}/${name}`;
    server.putTestObject(objectKey, bytes);
    runFixtureSql(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
      VALUES(?,?,1,?,?,?,'application/pdf',?,?,?,'GENERATED','COMMITTED',?,1,?,?,?,?)`,
    fileId, workspaceId, ids.client, ids.engagement, name, bytes.length, sha256(bytes), objectKey, now, now, now, actorId, actorId);
    runFixtureSql(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,NULL)`, artifactId, workspaceId, ids.client, ids.engagement, artifactKind, sourceEntityType, sourceEntityId, 1, fileId, sha256(bytes), bytes.length, now);
    return sha256(bytes);
  };
  const engagementLetterHash = insertSeedPdf(ids.engagementLetterFile, ids.engagementLetterArtifact, 'qa-engagement-letter.pdf',
    'Synthetic engagement letter for the isolated reporting journey.', 'ENGAGEMENT_LETTER', 'ENGAGEMENT_LETTER', ids.engagementLetter);
  runFixtureSql(`INSERT INTO engagement_letters(id,workspace_id,version,client_id,engagement_id,revision,proposal_version_id,commercial_acceptance_id,risk_clearance_id,
      template_version_id,artifact_id,file_version_id,signature_file_version_id,signature_consent_id,seal_file_version_id,seal_approval_id,content_sha256,fee_minor,period_start,period_end,issued_by_actor_id,issued_at)
    VALUES(?,?,1,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,'2025-01-01','2025-12-31',?,?)`, ids.engagementLetter, workspaceId, ids.client, ids.engagement,
  ids.proposalVersion, ids.commercialAcceptance, ids.riskClearance, ids.letterTemplate, ids.engagementLetterArtifact, ids.engagementLetterFile,
  ids.signatureFile, ids.signatureConsentDecision, ids.sealFile, ids.sealApproval, engagementLetterHash, 100000, actorId, now);
  runFixtureSql(`INSERT INTO billing_tax_policy_versions(id,workspace_id,version,revision,name,tax_basis_points,rationale,approved_by_actor_id,approved_at)
    VALUES(?,?,1,1,'Synthetic zero-rate test policy',0,'No tax is applied to this synthetic local acceptance journey.',?,?)`, ids.taxPolicy, workspaceId, actorId, now);
  const advanceInvoiceHash = insertSeedPdf(ids.advanceInvoiceFile, ids.advanceInvoiceArtifact, 'qa-advance-invoice.pdf',
    'Synthetic 50 percent advance invoice for the isolated reporting journey.', 'INVOICE', 'INVOICE', ids.advanceInvoice);
  const invoiceDueDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  runFixtureSql(`INSERT INTO invoices(id,workspace_id,version,client_id,engagement_id,engagement_letter_id,kind,number,fee_revision_id,tax_policy_version_id,subtotal_minor,tax_minor,total_minor,
      currency,issue_date,due_date,contact_route_id,recipient_snapshot_json,status,artifact_id,file_version_id,corrects_invoice_id,created_by_actor_id,issued_at,created_at,updated_at)
    VALUES(?,?,1,?,?,?,'ADVANCE',?,?,?,50000,0,50000,'QAR',?,?,?,?, 'ISSUED',?,?,NULL,?,?,?,?)`,
  ids.advanceInvoice, workspaceId, ids.client, ids.engagement, ids.engagementLetter, `QA-${key.slice(0, 8)}-ADV`, ids.proposalVersion, ids.taxPolicy,
  todayQatar, invoiceDueDate, ids.reportRoute, JSON.stringify({ contactId: ids.managementContact, name: 'QA Managing Director', email: 'qa.md@example.invalid' }),
  ids.advanceInvoiceArtifact, ids.advanceInvoiceFile, actorId, now, now, now);
  runFixtureSql(`UPDATE engagements SET active_proposal_version_id=?,portal_activated_at=? WHERE workspace_id=? AND id=?`,
    ids.proposalVersion, now, workspaceId, ids.engagement);
  return { workspaceId, actorId, staffMemberId: workspace.staffMemberId, clientId: ids.client, engagementId: ids.engagement,
    name: `Reporting journey ${key.slice(0, 8)}`, reportApprovalId: ids.approval, signatureFileId: ids.signatureFile, sealFileId: ids.sealFile,
    clientActorId: ids.clientActor, reviewerActorId: ids.reviewerActor, managementContactId: ids.managementContact, reportRouteId: ids.reportRoute };
}

before(async () => {
  server = await startBusinessE2eServer();
  const executable = chromeExecutable();
  assert.ok(executable, 'Chrome or Edge is available for Worker-backed reporting browser acceptance.');
  browser = await launchHeadlessChrome(executable, { profilePrefix: 'auditsphere-reporting-e2e-', timeoutMs: 45000 });
  const target = await fetch(`http://127.0.0.1:${browser.port}/json/new?${server.origin}`, { method: 'PUT' })
    .then(response => response.json()) as { webSocketDebuggerUrl: string };
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('The Worker-backed reporting browser could not connect over CDP.')), { once: true });
  });
  tab = new CdpTab(socket, server.origin);
  await tab.command('Runtime.enable');
  await tab.command('Page.enable');
  await tab.command('Network.enable');
  await tab.blockExternalHttp();
  await tab.command('Page.navigate', { url: server.origin });
  await waitFor('the clean BUSINESS landing page', `document.querySelector('#production-workspace-heading')?.textContent?.trim() === 'Open your business workspace'`);
}, { timeout: 90000 });

after(async () => {
  tab?.close();
  if (browser) await stopHeadlessChrome(browser.child);
  if (server) await server.close();
  if (browser?.profileDirectory) rmSync(browser.profileDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

async function verifyOpinionVariants(): Promise<void> {
  assert.ok(server && tab);
  const setWorkspace = async (fixture: Awaited<ReturnType<typeof seedReportingFixture>>) => {
    await tab!.evaluate(`localStorage.setItem('auditsphere.business-context.v1', ${JSON.stringify(JSON.stringify({
      version: 1, workspaceId: fixture.workspaceId, actorId: fixture.actorId, persona: 'APPROVER', clientId: fixture.clientId, engagementId: fixture.engagementId
    }))})`);
    await tab!.command('Page.reload');
    await waitFor('the isolated Partner reporting workspace', `
      document.querySelector('#business-workspace-heading')?.textContent?.trim() === ${JSON.stringify(fixture.name)} &&
      document.querySelector('.business-actor-summary')?.textContent?.includes('PARTNER') &&
      Boolean(document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section'))`);
  };
  const setField = async (fixture: Awaited<ReturnType<typeof seedReportingFixture>>, label: string, value: string, select = false) => {
    const result = await tab!.evaluate<{ found: boolean; value: string }>(`(() => {
      const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      const label = [...(report?.querySelectorAll('label') ?? [])].find(item =>
        (item.querySelector('span')?.textContent?.trim() ?? item.textContent?.trim() ?? '') === ${JSON.stringify(label)});
      const control = label?.querySelector('input,textarea,select');
      if (!control) return { found: false, value: '' };
      const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      if (!(control instanceof HTMLSelectElement)) control.dispatchEvent(new Event('change', { bubbles: true }));
      return { found: true, value: control.value };
    })()`);
    assert.equal(result.found, true, `the visible ${label} form field exists`);
    assert.equal(result.value, value, `the visible ${label} form field accepted its value`);
    if (!select) assert.ok(value.length > 0);
  };
  const saveOpinion = async (fixture: Awaited<ReturnType<typeof seedReportingFixture>>, expected: string) => {
    const clicked = await tab!.evaluate<boolean>(`(() => {
      const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      const form = [...(report?.querySelectorAll('form') ?? [])].find(item => item.querySelector('h3')?.textContent?.includes('Partner opinion and conditional basis'));
      const button = [...(form?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === 'Save new opinion version');
      if (!button || button.disabled || !button.getClientRects().length) return false;
      button.click(); return true;
    })()`);
    assert.equal(clicked, true, `the visible Partner opinion form saves ${expected}`);
    await waitFor(`the ${expected} opinion to appear in its exact preview`, `
      document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes(${JSON.stringify(expected)}) &&
      document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('Current cleared SRM')`);
  };

  const audit = await seedReportingFixture();
  await setWorkspace(audit);
  await setField(audit, 'Audit opinion', 'UNMODIFIED', true);
  await setField(audit, 'Partner rationale', 'The synthetic audit evidence supports an unmodified opinion for this local acceptance journey.');
  await setField(audit, 'Materiality assessment', 'The current synthetic amounts were compared with the approved planning materiality.');
  await setField(audit, 'Pervasiveness assessment', 'No material modification is required based on the synthetic assessed evidence.');
  await saveOpinion(audit, 'Unmodified Opinion');
  assert.equal(await tab.evaluate<boolean>(`!document.querySelector('#business-reporting-${audit.engagementId}')?.closest('section')?.innerText.includes('Basis for Unmodified Opinion')`), true,
    'the unmodified opinion preview has no modified-opinion basis section');

  for (const category of [
    { value: 'QUALIFIED', label: 'Qualified Opinion', basis: 'Basis for Qualified Opinion' },
    { value: 'DISCLAIMER', label: 'Disclaimer Opinion', basis: 'Basis for Disclaimer of Opinion' },
    { value: 'ADVERSE', label: 'Adverse Opinion', basis: 'Basis for Adverse Opinion' }
  ]) {
    await setField(audit, 'Audit opinion', category.value, true);
    await waitFor('the server-projected FSLI selector for the modified opinion', `
      (() => { const report=document.querySelector('#business-reporting-${audit.engagementId}')?.closest('section');
        return [...(report?.querySelectorAll('select') ?? [])].some(control => [...control.options].some(option => option.textContent?.includes('QA-REV'))); })()`);
    const fsliId = await tab.evaluate<string>(`(() => {
      const report = document.querySelector('#business-reporting-${audit.engagementId}')?.closest('section');
      const control = [...(report?.querySelectorAll('select') ?? [])]
        .find(item => [...item.options].some(option => option.textContent?.includes('QA-REV')));
      return [...(control?.options ?? [])].find(option => option.textContent?.includes('QA-REV'))?.value ?? '';
    })()`);
    assert.ok(fsliId, 'the server-projected current revenue FSLI is selectable');
    await setField(audit, 'Partner rationale', `The Partner's ${category.value.toLowerCase()} assessment is based on the current synthetic evidence and scope.`);
    await setField(audit, 'Materiality assessment', 'The affected synthetic revenue line exceeds the relevant assessed reporting threshold.');
    await setField(audit, 'Pervasiveness assessment', 'The current basis assessment describes the scope and pervasiveness of the affected line.');
    await setField(audit, 'Basis text', `The exact synthetic basis supporting the ${category.value.toLowerCase()} opinion is documented for this fixture.`);
    await setField(audit, 'FSLI 1', fsliId, true);
    await setField(audit, 'Nature and explanation', `The synthetic revenue line is affected under the ${category.value.toLowerCase()} case.`);
    await saveOpinion(audit, category.label);
    assert.equal(await tab.evaluate<boolean>(`document.querySelector('#business-reporting-${audit.engagementId}')?.closest('section')?.innerText.includes(${JSON.stringify(category.basis)})`), true,
      `${category.value} uses its matching basis heading in the shared preview`);
  }

  const aup = await seedReportingFixture('AGREED_UPON_PROCEDURES');
  await setWorkspace(aup);
  await waitFor('the AUP-specific report form without an audit-opinion selector', `
    [...(document.querySelector('#business-reporting-${aup.engagementId}')?.closest('section')?.querySelectorAll('label') ?? [])]
      .some(item => item.querySelector('span')?.textContent?.trim() === 'Approved AUP report type') &&
    ![...(document.querySelector('#business-reporting-${aup.engagementId}')?.closest('section')?.querySelectorAll('label') ?? [])]
      .some(item => item.querySelector('span')?.textContent?.trim() === 'Audit opinion')`);
  await setField(aup, 'Approved AUP report type', 'Synthetic agreed-upon procedures report');
  await setField(aup, 'Procedures and factual findings summary', 'The listed synthetic procedures were performed and the factual results are presented without an audit opinion.');
  await saveOpinion(aup, 'Synthetic agreed-upon procedures report');
  const aupPreview = await tab.evaluate<{ preview: string; formNotice: string }>(`(() => {
    const report = document.querySelector('#business-reporting-${aup.engagementId}')?.closest('section');
    return {
      preview: report?.querySelector('#opinion-preview-title')?.closest('section')?.innerText ?? '',
      formNotice: [...(report?.querySelectorAll('p[role="status"]') ?? [])].map(item => item.textContent?.trim() ?? '').join(' ')
    };
  })()`);
  assert.ok(aupPreview.preview.includes('Synthetic agreed-upon procedures report'));
  assert.ok(aupPreview.preview.includes('The listed synthetic procedures were performed'));
  assert.ok(!aupPreview.preview.includes('Independent Auditor'));
  assert.ok(!aupPreview.preview.includes('Basis for Qualified Opinion'));
  assert.ok(aupPreview.formNotice.includes('No ISA audit opinion or modified-opinion basis is selected.'));
  assert.equal(await tab.evaluate<boolean>(`(() => {
    const report = document.querySelector('#business-reporting-${aup.engagementId}')?.closest('section');
    return [...(report?.querySelectorAll('label') ?? [])].some(item => item.querySelector('span')?.textContent?.trim() === 'Audit opinion');
  })()`), false,
    'the AUP form and exact preview contain no ISA audit opinion selector or auditor-opinion text');
  assert.deepEqual(tab.exceptions, [], 'all visible opinion variants complete without uncaught browser exceptions');
  assert.deepEqual(tab.blockedExternalRequests, [], 'the synthetic opinion journey stays within the isolated Worker and fixture');
}

it('US-REP-001–007 covers all report categories, representation, atomic release, portal freeze and sealed archive', { timeout: 360000 }, async () => {
  assert.ok(server && tab);
  try {
  await verifyOpinionVariants();
  await tab.evaluate(`localStorage.removeItem('auditsphere.business-context.v1')`);
  await tab.command('Page.reload');
  await waitFor('the clean reporting landing page after opinion category acceptance', `document.querySelector('#production-workspace-heading')?.textContent?.trim() === 'Open your business workspace'`);
  const fixture = await seedReportingFixture();
  const beforeAction = await tab.evaluate<{ heading: string; preference: string | null }>(`({
    heading: document.querySelector('#production-workspace-heading')?.textContent?.trim() ?? '',
    preference: localStorage.getItem('auditsphere.business-context.v1')
  })`);
  assert.equal(beforeAction.heading, 'Open your business workspace');
  assert.equal(beforeAction.preference, null, 'the synthetic browser starts without stored persona or client data');
  await tab.evaluate(`localStorage.setItem('auditsphere.business-context.v1', ${JSON.stringify(JSON.stringify({
    version: 1, workspaceId: fixture.workspaceId, actorId: fixture.actorId, persona: 'APPROVER', clientId: fixture.clientId, engagementId: fixture.engagementId
  }))})`);
  await tab.command('Page.reload');
  await waitFor('the synthetic Partner and reporting workspace', `
    document.querySelector('#business-workspace-heading')?.textContent?.trim() === ${JSON.stringify(fixture.name)} &&
    document.querySelector('.business-actor-summary')?.textContent?.includes('PARTNER') &&
    Boolean(document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section'))`);
  await waitFor('the Worker-projected committed reporting files', `
    document.body.innerText.includes('qa-reporting-tb.csv') &&
    document.body.innerText.includes('qa-partner-signature.png') &&
    document.body.innerText.includes('qa-partner-seal.png')`);
  const visibleStart = await tab.evaluate<{ files: string[]; reportTitle: string; errors: string[] }>(`({
    files: [...document.querySelectorAll('.business-file-list strong')].map(item => item.textContent?.trim() ?? ''),
    reportTitle: document.querySelector('#business-reporting-${fixture.engagementId}')?.textContent?.trim() ?? '',
    errors: [...(document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.querySelectorAll('[role="alert"]') ?? [])]
      .map(item => item.textContent?.trim() ?? '')
  })`);
  assert.deepEqual(new Set(visibleStart.files), new Set(['qa-reporting-tb.csv', 'qa-partner-signature.png', 'qa-partner-seal.png',
    'qa-engagement-letter.pdf', 'qa-advance-invoice.pdf']));
  assert.match(visibleStart.reportTitle, /Reporting and final deliverables/);
  assert.deepEqual(visibleStart.errors, [], 'the initial Worker projections load without alerts');

  const fillReportField = async (labelPrefix: string, value: string, select = false) => {
    const observed = await tab!.evaluate<{ found: boolean; value: string }>(`(() => {
      const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      const labels = [...(report?.querySelectorAll('label') ?? [])];
      const labelText = item => item.querySelector('span')?.textContent?.trim() ?? item.textContent?.trim() ?? '';
      const label = labels.find(item => labelText(item) === ${JSON.stringify(labelPrefix)})
        ?? labels.find(item => labelText(item).startsWith(${JSON.stringify(labelPrefix)}));
      const control = label?.querySelector('input,textarea,select');
      if (!control) return { found: false, value: '' };
      const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      if (!(control instanceof HTMLSelectElement)) control.dispatchEvent(new Event('change', { bubbles: true }));
      return { found: true, value: control.value };
    })()`);
    assert.equal(observed.found, true, `the visible ${labelPrefix} form field exists`);
    assert.equal(observed.value, value, `the visible ${labelPrefix} form field accepted its value`);
    if (!select) assert.ok(value.length > 0);
  };
  const clickInForm = async (heading: string, buttonLabel: string) => {
    const clicked = await tab!.evaluate<boolean>(`(() => {
      const form = [...document.querySelectorAll('form')].find(item => item.querySelector('h3')?.textContent?.includes(${JSON.stringify(heading)}));
      const button = [...(form?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === ${JSON.stringify(buttonLabel)});
      if (!button || button.disabled || !button.getClientRects().length) return false;
      button.click(); return true;
    })()`);
    assert.equal(clicked, true, `the visible ${buttonLabel} action in ${heading} is enabled`);
  };
  const clickReportButton = async (buttonLabel: string) => {
    const clicked = await tab!.evaluate<boolean>(`(() => {
      const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      const button = [...(report?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === ${JSON.stringify(buttonLabel)});
      if (!button || button.disabled || !button.getClientRects().length) return false;
      button.click(); return true;
    })()`);
    assert.equal(clicked, true, `the visible reporting action ${buttonLabel} is enabled`);
  };
  const clickReportRowButton = async (rowMarker: string, buttonLabel: string) => {
    const clicked = await tab!.evaluate<boolean>(`(() => {
      const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      const row = [...(report?.querySelectorAll('.business-delivery-row') ?? [])].find(item => item.textContent?.includes(${JSON.stringify(rowMarker)}));
      const button = [...(row?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === ${JSON.stringify(buttonLabel)});
      if (!button || button.disabled || !button.getClientRects().length) return false;
      button.click(); return true;
    })()`);
    assert.equal(clicked, true, `the ${buttonLabel} action is enabled in the visible ${rowMarker} row`);
  };
  const refreshReporting = async () => {
    await clickReportButton('Refresh reporting');
    await waitFor('the refreshed reporting projection', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section') !== null`);
  };
  const switchActor = async (actorId: string, persona: 'APPROVER' | 'CLIENT' | 'REVIEWER') => {
    await tab!.evaluate(`localStorage.setItem('auditsphere.business-context.v1', ${JSON.stringify(JSON.stringify({
      version: 1, workspaceId: fixture.workspaceId, actorId, persona, clientId: fixture.clientId, engagementId: fixture.engagementId
    }))})`);
    await tab!.command('Page.reload');
    await waitFor(`the selected ${persona} actor and scoped reporting page`, `
      document.querySelector('#business-workspace-heading')?.textContent?.trim() === ${JSON.stringify(fixture.name)} &&
      document.querySelector('.business-actor-summary')?.textContent?.includes(${JSON.stringify(persona)}) &&
      Boolean(document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section'))`);
  };
  const waitForDbRow = async <T>(label: string, read: () => T | null, timeoutMs = 20000): Promise<T> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const row = read();
      if (row) return row;
      await sleep(80);
    }
    throw new Error(`Timed out waiting for ${label}.`);
  };
  const clickReportingFormButton = async (labelPrefix: string, buttonLabel: string) => {
    const observed = await tab!.evaluate<{ clicked: boolean; labelText: string; controlValue: string; formFound: boolean; buttonFound: boolean; disabled: boolean }>(`(() => {
      const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      const label = [...(report?.querySelectorAll('label') ?? [])]
        .find(item => item.textContent?.trim().startsWith(${JSON.stringify(labelPrefix)}));
      const form = label?.closest('form');
      const button = [...(form?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === ${JSON.stringify(buttonLabel)});
      const control = label?.querySelector('input,textarea,select');
      const result = { clicked: false, labelText: label?.querySelector('span')?.textContent?.trim() ?? label?.textContent?.trim() ?? '',
        controlValue: control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement ? control.value : '',
        formFound: Boolean(form), buttonFound: Boolean(button), disabled: button?.disabled ?? true };
      if (!button || button.disabled || !button.getClientRects().length) return result;
      button.click(); result.clicked = true; return result;
    })()`);
    assert.equal(observed.clicked, true, `the visible ${buttonLabel} action is enabled beside ${labelPrefix}: ${JSON.stringify(observed)}`);
  };
  const installDownloadCapture = async () => {
    await tab!.evaluate(`(() => {
      if (window.__qaDownloadCapture) return;
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
      window.__qaDownloadCapture = state;
    })()`);
    assert.equal(await tab!.evaluate<boolean>('Boolean(window.__qaDownloadCapture?.downloads)'), true, 'browser download capture is installed in the active document');
  };
  const readCapturedDownload = async (index: number, label: string) => {
    await waitFor(`${label} bytes to reach the browser download control`, `Boolean(window.__qaDownloadCapture?.downloads[${index}]?.done)`);
    const result = await tab!.evaluate<{ fileName: string; size: number; type: string; base64: string; done: boolean }>(
      `window.__qaDownloadCapture.downloads[${index}]`);
    assert.equal(result.done, true);
    const bytes = Buffer.from(result.base64, 'base64');
    assert.equal(bytes.byteLength, result.size, `${label} download size matches its captured browser Blob`);
    return { ...result, bytes };
  };

  await fillReportField('Audit opinion', 'QUALIFIED', true);
  await fillReportField('Partner rationale', 'A single synthetic revenue presentation matter is material for this test report.');
  await fillReportField('Materiality assessment', 'The affected revenue line is compared with the synthetic approved planning threshold.');
  await fillReportField('Pervasiveness assessment', 'The matter is confined to one financial statement line and is not pervasive.');
  await fillReportField('Basis text', 'A synthetic revenue source item is unsupported and remains unadjusted in this local test fixture.');
  await waitFor('the Worker-projected synthetic revenue FSLI in the opinion form', `
    [...document.querySelectorAll('select')].some(control => [...control.options].some(option => option.textContent?.includes('QA-REV')))`);
  const affectedFsliSet = await tab.evaluate<string>(`(() => {
    const control = [...document.querySelectorAll('select')].find(select => [...select.options].some(option => option.textContent?.includes('QA-REV')));
    if (!(control instanceof HTMLSelectElement)) return '';
    const option = [...control.options].find(item => item.textContent?.includes('QA-REV'));
    if (!option) return '';
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(control, option.value);
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return option.value;
  })()`);
  assert.ok(affectedFsliSet, 'the visible modified-opinion selector contains the affected revenue FSLI');
  await fillReportField('Quantifiable amount (QAR, optional)', '1000.00');
  await fillReportField('Nature and explanation', 'The synthetic source support does not substantiate the full recorded revenue amount.');
  await clickInForm('Partner opinion and conditional basis', 'Save new opinion version');
  await waitFor('the saved qualified opinion and exact basis heading', `
    document.body.innerText.includes('Exact report text preview') &&
    document.body.innerText.includes('Basis for Qualified Opinion') &&
    document.body.innerText.includes('Synthetic revenue') &&
    document.body.innerText.includes('Current cleared SRM') &&
    !document.body.innerText.includes('Report preparation is blocked')`);

  const registerForm = await tab.evaluate<{ signature: number; seal: number }>(`(() => {
    const form = [...document.querySelectorAll('form')].find(item => item.querySelector('h3')?.textContent?.includes('Register a Partner signature image and PNG seal'));
    const selects = [...(form?.querySelectorAll('select') ?? [])];
    const setByFile = (control, fileName) => {
      const option = [...(control?.options ?? [])].find(item => item.textContent?.includes(fileName));
      if (!control || !option) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(control, option.value);
      control.dispatchEvent(new Event('change', { bubbles: true })); return true;
    };
    return { signature: Number(setByFile(selects[0], 'qa-partner-signature.png')), seal: Number(setByFile(selects[1], 'qa-partner-seal.png')) };
  })()`);
  assert.deepEqual(registerForm, { signature: 1, seal: 1 }, 'the actual verified PNG bytes appear in the Partner asset selectors');
  await fillReportField('Asset label', 'QA current Partner image pair');
  await clickInForm('Register a Partner signature image and PNG seal', 'Register assets');
  await waitFor('the immutable Partner-owned signature asset in the reporting query', `
    document.body.innerText.includes('Partner signature and seal registered with immutable file hashes.') &&
    document.body.innerText.includes('QA current Partner image pair')`);
  const registered = server.db.prepare(`SELECT id,staff_member_id,signature_sha256,seal_sha256,owner_display_name,owner_grade FROM report_signature_assets
    WHERE workspace_id=? AND label='QA current Partner image pair'`).bind(fixture.workspaceId).first<{
      id: string; staff_member_id: string; signature_sha256: string; seal_sha256: string; owner_display_name: string; owner_grade: string
    }>();
  assert.ok(registered, 'the Worker registered the selected file hashes as a report signature asset');
  assert.equal(registered.staff_member_id, fixture.staffMemberId);
  assert.equal(registered.owner_display_name, 'QA Reporting Partner');
  assert.equal(registered.owner_grade, 'PARTNER');
  assert.equal(registered.signature_sha256, sha256(png(255)));
  assert.equal(registered.seal_sha256, sha256(png(0)), 'the registered seal hash pins the actual transparent PNG bytes');

  const reportFormState = await tab.evaluate<{ opinions: number; approvals: number; assets: number; blockers: string[] }>(`(() => {
    const form = [...document.querySelectorAll('form')].find(item => item.querySelector('h3')?.textContent?.includes('Prepare exact auditor-report and statement candidate'));
    const selects = [...(form?.querySelectorAll('select') ?? [])];
    return { opinions: selects[0]?.options.length ?? 0, approvals: selects[1]?.options.length ?? 0, assets: selects[2]?.options.length ?? 0,
      blockers: [...(document.querySelector('#opinion-preview-title')?.parentElement?.querySelectorAll('[role="alert"] li') ?? [])].map(item => item.textContent?.trim() ?? '') };
  })()`);
  assert.ok(reportFormState.opinions > 1 && reportFormState.approvals > 1 && reportFormState.assets > 1);
  assert.deepEqual(reportFormState.blockers, []);
  const candidateSelections = await tab.evaluate<string[]>(`(() => {
    const form = [...document.querySelectorAll('form')].find(item => item.querySelector('h3')?.textContent?.includes('Prepare exact auditor-report and statement candidate'));
    const selects = [...(form?.querySelectorAll('select') ?? [])];
    for (const select of selects) {
      const option = [...select.options].find(item => item.value.length > 0);
      if (!option) return [];
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, option.value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return selects.map(select => select.value);
  })()`);
  assert.equal(candidateSelections.length, 3);
  assert.ok(candidateSelections.every(value => value.length > 0), 'the report candidate uses an explicit Partner opinion, approved statement version and registered image asset');
  await clickInForm('Prepare exact auditor-report and statement candidate', 'Generate report candidate');
  await waitFor('the committed Worker report candidate and durable rendering job', `
    document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('Report candidate queued for PDF generation.')`);
  const preparingCandidate = server.db.prepare(`SELECT c.id,c.status,j.id AS job_id,j.status AS job_status
    FROM report_candidates c JOIN outbox_jobs j ON j.workspace_id=c.workspace_id AND j.aggregate_id=c.id
    WHERE c.workspace_id=? AND c.engagement_id=? ORDER BY c.created_at DESC LIMIT 1`).bind(fixture.workspaceId, fixture.engagementId).first<{
      id: string; status: string; job_id: string; job_status: string
    }>();
  assert.ok(preparingCandidate);
  assert.equal(preparingCandidate.status, 'PREPARING');
  await server.runScheduled();
  const generated = server.db.prepare(`SELECT c.status,c.report_artifact_id,a.file_version_id,a.content_sha256,f.media_type,f.size_bytes,f.sha256,f.object_key
    FROM report_candidates c JOIN generated_artifacts a ON a.workspace_id=c.workspace_id AND a.id=c.report_artifact_id
    JOIN file_versions f ON f.workspace_id=a.workspace_id AND f.id=a.file_version_id
    WHERE c.workspace_id=? AND c.id=?`).bind(fixture.workspaceId, preparingCandidate.id).first<{
      status: string; report_artifact_id: string; file_version_id: string; content_sha256: string; media_type: string; size_bytes: number; sha256: string; object_key: string
    }>();
  assert.ok(generated, 'the local scheduled Worker generated a persisted candidate file and artifact');
  assert.equal(generated.status, 'READY');
  assert.equal(generated.media_type, 'application/pdf');
  assert.ok(generated.size_bytes > 300);
  assert.equal(generated.content_sha256, generated.sha256);
  const renderedPdf = server.getTestObject(generated.object_key);
  assert.ok(renderedPdf, 'the immutable artifact points to bytes persisted in the local R2 fixture');
  assert.equal(renderedPdf.byteLength, generated.size_bytes);
  assert.equal(sha256(renderedPdf), generated.content_sha256);
  assert.equal(new TextDecoder().decode(renderedPdf.slice(0, 5)), '%PDF-', 'the candidate object contains PDF bytes, not a mock URL or metadata-only record');

  const refreshed = await tab.evaluate<boolean>(`(() => {
    const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    const button = [...(report?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === 'Refresh reporting');
    if (!button || button.disabled) return false;
    button.click(); return true;
  })()`);
  assert.equal(refreshed, true);
  await waitFor('the visible READY candidate and hash-verified preview action', `
    (() => {
      const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      return report?.innerText.includes(${JSON.stringify(`${preparingCandidate.id} · READY`)}) &&
        [...(report?.querySelectorAll('button') ?? [])].some(item => item.textContent?.trim() === 'Open hash-verified report preview');
    })()`);
  const openedPreview = await tab.evaluate<boolean>(`(() => {
    const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    const button = [...(report?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === 'Open hash-verified report preview');
    if (!button || button.disabled) return false;
    button.click(); return true;
  })()`);
  assert.equal(openedPreview, true);
  await waitFor('the browser-verified exact report PDF preview and explicit consent control', `
    (() => {
      const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      return !!report?.querySelector('iframe[title^="Hash-verified report preview"]') &&
        [...(report?.querySelectorAll('input[type="checkbox"]') ?? [])].some(item => item.closest('label')?.textContent?.includes('I reviewed the exact PDF above'));
    })()`);
  const previewEvidence = await tab.evaluate<{ preview: boolean; candidateHash: string; signatureHash: string; sealHash: string; opinion: string; consentDisabled: boolean }>(`(() => {
    const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    const section = report?.querySelector('.business-report-consent');
    const candidateRow = [...(report?.querySelectorAll('.business-delivery-row') ?? [])].find(item => item.innerText.includes(${JSON.stringify(preparingCandidate.id)}));
    const hashLine = [...(candidateRow?.querySelectorAll('span') ?? [])].map(item => item.textContent ?? '').find(text => text.includes('candidate content SHA-256')) ?? '';
    const candidateHash = hashLine.match(/candidate content SHA-256 ([a-f0-9]{64})/)?.[1] ?? '';
    const values = [...(section?.querySelectorAll('dl > div') ?? [])].map(item => ({ label: item.querySelector('dt')?.textContent?.trim(), value: item.querySelector('dd')?.textContent?.trim() }));
    const button = [...(section?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === 'Consent to exact report hash');
    return { preview: !!section?.querySelector('iframe'), candidateHash,
      signatureHash: values.find(item => item.label === 'Signature SHA-256')?.value ?? '',
      sealHash: values.find(item => item.label === 'Seal SHA-256')?.value ?? '',
      opinion: section?.innerText.includes('QUALIFIED') ? 'QUALIFIED' : '', consentDisabled: button?.disabled ?? true };
  })()`);
  assert.equal(previewEvidence.preview, true);
  assert.equal(previewEvidence.opinion, 'QUALIFIED');
  assert.equal(previewEvidence.candidateHash, generated.content_sha256, 'the browser exposes the same full hash as the rendered PDF');
  assert.equal(previewEvidence.signatureHash, registered.signature_sha256);
  assert.equal(previewEvidence.sealHash, registered.seal_sha256);
  assert.equal(previewEvidence.consentDisabled, true, 'consent remains disabled until the exact rendered PDF is affirmed');
  const checked = await tab.evaluate<boolean>(`(() => {
    const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    const checkbox = [...(report?.querySelectorAll('input[type="checkbox"]') ?? [])]
      .find(item => item.closest('label')?.textContent?.includes('I reviewed the exact PDF above'));
    if (!checkbox || checkbox.checked || checkbox.disabled) return false;
    checkbox.click(); return checkbox.checked;
  })()`);
  assert.equal(checked, true);
  const consentClicked = await tab.evaluate<boolean>(`(() => {
    const section = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.querySelector('.business-report-consent');
    const button = [...(section?.querySelectorAll('button') ?? [])].find(item => item.textContent?.trim() === 'Consent to exact report hash');
    if (!button || button.disabled) return false;
    button.click(); return true;
  })()`);
  assert.equal(consentClicked, true, 'the exact-hash consent action unlocks after review confirmation');
  await waitFor('the immutable Worker consent message', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('Consent recorded for candidate hash')`);
  const consent = server.db.prepare(`SELECT c.report_candidate_id,c.candidate_content_hash,c.signature_asset_id,c.actor_id,c.actor_staff_member_id,c.actor_display_name,c.actor_persona,c.attribution
    FROM report_signature_consents c WHERE c.workspace_id=? AND c.report_candidate_id=?`).bind(fixture.workspaceId, preparingCandidate.id).first<{
      report_candidate_id: string; candidate_content_hash: string; signature_asset_id: string; actor_id: string; actor_staff_member_id: string;
      actor_display_name: string; actor_persona: string; attribution: string
    }>();
  assert.ok(consent, 'the Worker persisted the candidate-specific image consent');
  assert.equal(consent.actor_id, fixture.actorId);
  assert.equal(consent.actor_staff_member_id, fixture.staffMemberId);
  assert.equal(consent.actor_display_name, 'QA Reporting Partner');
  assert.equal(consent.actor_persona, 'APPROVER');
  assert.equal(consent.attribution, 'SELF_ASSERTED_PERSONA');
  assert.equal(consent.candidate_content_hash, generated.content_sha256);
  assert.equal(consent.signature_asset_id, registered.id);
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM report_signatures WHERE workspace_id=? AND consent_id=?')
    .bind(fixture.workspaceId, server.db.prepare('SELECT id FROM report_signature_consents WHERE workspace_id=? AND report_candidate_id=?')
      .bind(fixture.workspaceId, preparingCandidate.id).first<{ id: string }>()?.id).first<{ count: number }>()?.count, 0,
  'image consent is not misrepresented as the final released report signature');

  const reportDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  await fillReportField('Partner-approved reason for no reportable deficiencies', 'No reportable deficiencies were identified in the synthetic acceptance records reviewed for this isolated test.');
  await clickInForm('Prepare management letter', 'Generate management letter');
  await waitFor('the queued management letter command result', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('Management-letter version queued from selected findings or an explicit no-deficiencies rationale.')`);
  const preparingManagement = await waitForDbRow('the management-letter render job', () => server!.db.prepare(`SELECT id,status FROM management_letter_versions
    WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC LIMIT 1`).bind(fixture.workspaceId, fixture.engagementId).first<{ id: string; status: string }>());
  assert.equal(preparingManagement.status, 'PREPARING');
  await server.runScheduled();
  const management = await waitForDbRow('the immutable rendered management-letter artifact', () => server!.db.prepare(`SELECT id,status,artifact_id,file_version_id,source_hash FROM management_letter_versions
    WHERE workspace_id=? AND id=? AND status='READY' AND artifact_id IS NOT NULL AND file_version_id IS NOT NULL`).bind(fixture.workspaceId, preparingManagement.id)
    .first<{ id: string; status: string; artifact_id: string; file_version_id: string; source_hash: string }>());
  assert.equal(management.status, 'READY');
  await refreshReporting();
  await waitFor('the Worker-projected READY management-letter version', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('v1 · READY')`);

  await fillReportField('Primary management report route', fixture.reportRouteId, true);
  await fillReportField('Required management signatories (one per line)', 'QA Managing Director');
  await clickInForm('Prepare pre-report letter of representation', 'Prepare representation template');
  await waitFor('the queued representation request', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('Representation letter template queued before report signing.')`);
  const preparingRequest = await waitForDbRow('the pre-report representation request', () => server!.db.prepare(`SELECT id,status,dependency_hash FROM representation_requests
    WHERE workspace_id=? AND engagement_id=? ORDER BY created_at DESC,id DESC LIMIT 1`).bind(fixture.workspaceId, fixture.engagementId)
    .first<{ id: string; status: string; dependency_hash: string }>());
  assert.equal(preparingRequest.status, 'PREPARING');
  await server.runScheduled();
  const preparedRequest = await waitForDbRow('the committed editable representation template', () => server!.db.prepare(`SELECT id,status,template_artifact_id,template_file_id,dependency_hash
    FROM representation_requests WHERE workspace_id=? AND id=? AND status='PREPARED' AND template_artifact_id IS NOT NULL AND template_file_id IS NOT NULL`)
    .bind(fixture.workspaceId, preparingRequest.id).first<{ id: string; status: string; template_artifact_id: string; template_file_id: string; dependency_hash: string }>());
  assert.equal(preparedRequest.dependency_hash, preparingRequest.dependency_hash);
  await refreshReporting();
  await waitFor('the prepared representation request and send control', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('PREPARED · ${reportDate}')`);
  await clickReportRowButton('PREPARED', 'Send template');
  await waitFor('the sent representation request', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('SENT · ${reportDate}')`);
  assert.equal(server.db.prepare('SELECT status FROM representation_requests WHERE workspace_id=? AND id=?').bind(fixture.workspaceId, preparedRequest.id).first<{ status: string }>()?.status, 'SENT');

  await switchActor(fixture.clientActorId, 'CLIENT');
  await waitFor('the client-visible SENT representation request and signed-PDF upload field', `(() => {
    const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    return report?.innerText.includes('SENT · proposed report date ${reportDate}') &&
      [...(report?.querySelectorAll('input[type="file"]') ?? [])].some(input => !input.disabled);
  })()`);
  const signedReturnBytes = minimalPdf('QA Managing Director signed the synthetic letter of representation.');
  const attachedSignedReturn = await tab.evaluate<boolean>(`(() => {
    const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    const label = [...(report?.querySelectorAll('label') ?? [])].find(item => item.textContent?.includes('Signed LOR PDF'));
    const input = label?.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement) || input.disabled) return false;
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(${JSON.stringify(Array.from(signedReturnBytes))})], 'qa-signed-representation.pdf', { type: 'application/pdf' }));
    Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.files?.[0]?.name === 'qa-signed-representation.pdf';
  })()`);
  assert.equal(attachedSignedReturn, true, 'the CLIENT persona selected a concrete signed PDF in the visible portal input');

  const pendingClientBytes = minimalPdf('Synthetic upload staged before report release and committed after portal freeze.');
  const clientContextHeaders = {
    Origin: server.origin, 'Content-Type': 'application/json', 'X-Actor-Id': fixture.clientActorId, 'X-Active-Persona': 'CLIENT',
    'X-Client-Id': fixture.clientId, 'X-Engagement-Id': fixture.engagementId
  };
  const pendingReservationResponse = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/files`, {
    method: 'POST', headers: { ...clientContextHeaders, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ purpose: 'EVIDENCE', originalName: 'qa-in-flight-late.pdf', mediaType: 'application/pdf', sizeBytes: pendingClientBytes.byteLength,
      clientId: fixture.clientId, engagementId: fixture.engagementId, representationRequestId: preparedRequest.id })
  });
  assert.equal(pendingReservationResponse.status, 201, await pendingReservationResponse.clone().text());
  const pendingReservation = await pendingReservationResponse.json() as { fileId: string; version: number; state: string };
  assert.equal(pendingReservation.state, 'INITIALIZED');
  const pendingStageResponse = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/files/${pendingReservation.fileId}/content`, {
    method: 'PUT', headers: { ...clientContextHeaders, 'Idempotency-Key': randomUUID(), 'X-File-Version': String(pendingReservation.version), 'Content-Type': 'application/pdf' },
    body: new Blob([pendingClientBytes], { type: 'application/pdf' })
  });
  assert.equal(pendingStageResponse.status, 200, await pendingStageResponse.clone().text());
  const pendingStage = await pendingStageResponse.json() as { fileId: string; version: number; state: string; sizeBytes: number; sha256: string };
  assert.equal(pendingStage.state, 'STAGED');
  assert.equal(server.db.prepare('SELECT state FROM file_versions WHERE workspace_id=? AND id=?').bind(fixture.workspaceId, pendingStage.fileId)
    .first<{ state: string }>()?.state, 'STAGED', 'the late upload has durable staged bytes before report release');

  await waitFor('the enabled signed-PDF upload action', `(() => { const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section'); const button=[...(report?.querySelectorAll('button')??[])].find(item=>item.textContent?.trim()==='Upload and verify signed PDF'); return Boolean(button && !button.disabled); })()`);
  await clickReportRowButton('SENT', 'Upload and verify signed PDF');
  await waitFor('the client PDF upload, byte verification and request reservation', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('qa-signed-representation.pdf is committed, hash verified, and bound to this representation request.')`);
  const uploadedSignedReturn = await waitForDbRow('the immutable signed-return file reservation', () => server!.db.prepare(`SELECT f.id,f.state,f.immutable,f.sha256,f.size_bytes,f.created_by_actor_id,rfr.request_id
    FROM file_versions f JOIN representation_file_reservations rfr ON rfr.workspace_id=f.workspace_id AND rfr.file_version_id=f.id
    WHERE f.workspace_id=? AND rfr.request_id=? AND f.original_name='qa-signed-representation.pdf'`)
    .bind(fixture.workspaceId, preparedRequest.id).first<{ id: string; state: string; immutable: number; sha256: string; size_bytes: number; created_by_actor_id: string; request_id: string }>());
  assert.equal(uploadedSignedReturn.state, 'COMMITTED');
  assert.equal(uploadedSignedReturn.immutable, 1);
  assert.equal(uploadedSignedReturn.created_by_actor_id, fixture.clientActorId);
  assert.equal(uploadedSignedReturn.request_id, preparedRequest.id);
  assert.equal(uploadedSignedReturn.sha256, sha256(signedReturnBytes));
  assert.equal(uploadedSignedReturn.size_bytes, signedReturnBytes.byteLength);
  await fillReportField('Committed PDF for this request', uploadedSignedReturn.id, true);
  await fillReportField('Representation date', reportDate);
  await fillReportField('Names as signed', 'QA Managing Director');
  await clickReportButton('Submit signed return for independent review');
  await waitFor('the client-submitted signed representation return', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('Signed representation return received and retained for independent review.')`);
  const receivedReturn = await waitForDbRow('the immutable received return', () => server!.db.prepare(`SELECT r.id,r.signed_file_id,r.file_sha256,r.source_hash,q.status,q.current_return_id
    FROM representation_returns r JOIN representation_requests q ON q.workspace_id=r.workspace_id AND q.id=r.request_id
    WHERE r.workspace_id=? AND q.id=? AND q.status='RECEIVED' AND q.current_return_id=r.id`)
    .bind(fixture.workspaceId, preparedRequest.id).first<{ id: string; signed_file_id: string; file_sha256: string; source_hash: string; status: string; current_return_id: string }>());
  assert.equal(receivedReturn.signed_file_id, uploadedSignedReturn.id);
  assert.equal(receivedReturn.file_sha256, uploadedSignedReturn.sha256);

  await switchActor(fixture.reviewerActorId, 'REVIEWER');
  await waitFor('the reviewer-projected exact signed return and six independent checks', `(() => {
    const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    const fieldset = [...(report?.querySelectorAll('fieldset') ?? [])].find(item => item.querySelector('legend')?.textContent?.includes('Independent reviewer checks for this exact return'));
    return [...(fieldset?.querySelectorAll('input[type="checkbox"]') ?? [])].length === 6;
  })()`);
  const representationChecks = await tab.evaluate<string[]>(`(() => {
    const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    const fieldset = [...(report?.querySelectorAll('fieldset') ?? [])].find(item => item.querySelector('legend')?.textContent?.includes('Independent reviewer checks for this exact return'));
    return [...(fieldset?.querySelectorAll('input[type="checkbox"]') ?? [])].map(item => item.closest('label')?.textContent?.trim() ?? '');
  })()`);
  assert.equal(representationChecks.length, 6, 'the independent review exposes all six evidence assertions');
  for (const labelText of representationChecks) {
    const beforeCheck = await tab.evaluate<boolean>(`(() => {
      const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      const label = [...(report?.querySelectorAll('label') ?? [])].find(item => item.textContent?.trim() === ${JSON.stringify(labelText)});
      const checkbox = label?.querySelector('input[type="checkbox"]'); return checkbox instanceof HTMLInputElement && checkbox.checked;
    })()`);
    assert.equal(beforeCheck, false, `the reviewer must affirm ${labelText} explicitly`);
    const clickedCheck = await tab.evaluate<boolean>(`(() => {
      const report = document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      const label = [...(report?.querySelectorAll('label') ?? [])].find(item => item.textContent?.trim() === ${JSON.stringify(labelText)});
      const checkbox = label?.querySelector('input[type="checkbox"]'); if (!(checkbox instanceof HTMLInputElement) || checkbox.disabled) return false;
      checkbox.click(); return checkbox.checked;
    })()`);
    assert.equal(clickedCheck, true, `the visible reviewer affirmed ${labelText}`);
    await waitFor(`the checked reviewer assertion: ${labelText}`, `(() => { const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section'); const label=[...(report?.querySelectorAll('label')??[])].find(item=>item.textContent?.trim()===${JSON.stringify(labelText)}); return label?.querySelector('input[type="checkbox"]')?.checked === true; })()`);
  }
  await fillReportField('Review rationale, including any discrepancy', 'The signed content, authorized management signatory, audited period and report-date consistency were checked against the current synthetic audit record.');
  await waitFor('the enabled independent acceptance action', `(() => { const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section'); const button=[...(report?.querySelectorAll('button')??[])].find(item=>item.textContent?.trim()==='Accept signed return'); return Boolean(button && !button.disabled); })()`);
  await clickReportButton('Accept signed return');
  await waitFor('the independent acceptance result for the signed return', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('Current signed return accepted against its source dependency hash.')`);
  const acceptedReview = server.db.prepare(`SELECT rv.decision,rv.reviewed_by_actor_id,rv.dependency_hash,q.status FROM representation_reviews rv
    JOIN representation_requests q ON q.workspace_id=rv.workspace_id AND q.id=rv.request_id WHERE rv.workspace_id=? AND rv.return_id=?`)
    .bind(fixture.workspaceId, receivedReturn.id).first<{ decision: string; reviewed_by_actor_id: string; dependency_hash: string; status: string }>();
  assert.ok(acceptedReview);
  assert.equal(acceptedReview.decision, 'ACCEPT');
  assert.equal(acceptedReview.reviewed_by_actor_id, fixture.reviewerActorId);
  assert.equal(acceptedReview.dependency_hash, preparedRequest.dependency_hash);
  assert.equal(acceptedReview.status, 'ACCEPTED');

  await switchActor(fixture.actorId, 'APPROVER');
  await refreshReporting();
  await waitFor('the Worker-projected report, management-letter and accepted-representation bundle choices', `(() => {
    const form = [...document.querySelectorAll('form')].find(item => item.querySelector('h3')?.textContent?.includes('Prepare private five-part deliverable bundle'));
    const values = [...(form?.querySelectorAll('select') ?? [])].map(select => [...select.options].map(option => option.value));
    return values.length === 3 && values[0].includes(${JSON.stringify(preparingCandidate.id)}) &&
      values[1].includes(${JSON.stringify(management.id)}) && values[2].includes(${JSON.stringify(preparedRequest.id)});
  })()`);
  await fillReportField('Ready report with explicit consent', preparingCandidate.id, true);
  await fillReportField('Ready management letter', management.id, true);
  await fillReportField('Accepted signed representation', preparedRequest.id, true);
  await clickInForm('Prepare private five-part deliverable bundle', 'Prepare five parts');
  await waitFor('the privately queued five-part release candidate', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('Private five-part bundle candidate queued; no client files are published yet.')`);
  const preparingBundle = await waitForDbRow('the private bundle-candidate job', () => server!.db.prepare(`SELECT id,status,dependency_hash,content_hash FROM bundle_candidates
    WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC LIMIT 1`).bind(fixture.workspaceId, fixture.engagementId)
    .first<{ id: string; status: string; dependency_hash: string; content_hash: string | null }>());
  assert.equal(preparingBundle.status, 'PREPARING');
  assert.equal(preparingBundle.content_hash, null, 'private candidates publish no content hash until all five parts are rendered and verified');
  await server.runScheduled();
  const readyBundle = await waitForDbRow('the READY five-part bundle candidate', () => server!.db.prepare(`SELECT id,status,dependency_hash,content_hash,staged_final_invoice_id,final_fee_minor,final_tax_minor
    FROM bundle_candidates WHERE workspace_id=? AND id=? AND status='READY' AND content_hash IS NOT NULL`).bind(fixture.workspaceId, preparingBundle.id)
    .first<{ id: string; status: string; dependency_hash: string; content_hash: string; staged_final_invoice_id: string; final_fee_minor: number; final_tax_minor: number }>());
  assert.equal(readyBundle.final_fee_minor, 50000, 'the final installment is the accepted fee less the issued 50% advance');
  assert.equal(readyBundle.final_tax_minor, 0);
  const stagedParts = server.db.prepare(`SELECT p.kind,p.primary_file_id,p.sha256,p.size_bytes,f.object_key,f.original_name
    FROM bundle_candidate_parts p JOIN file_versions f ON f.workspace_id=p.workspace_id AND f.id=p.primary_file_id
    WHERE p.workspace_id=? AND p.candidate_id=? ORDER BY p.kind`).bind(fixture.workspaceId, readyBundle.id).all<{
      kind: string; primary_file_id: string; sha256: string; size_bytes: number; object_key: string; original_name: string
    }>().results;
  assert.equal(stagedParts?.length, 5);
  assert.deepEqual(new Set(stagedParts?.map(part => part.kind)), new Set(['REPORT_AND_FS', 'MANAGEMENT_LETTER', 'REPRESENTATION', 'CORRESPONDENCE_TRAIL', 'FINAL_FEE_NOTE']));
  assert.equal(new Set(stagedParts?.map(part => part.kind)).size, 5, 'each semantic deliverable part is staged once');
  for (const part of stagedParts ?? []) {
    const bytes = server.getTestObject(part.object_key);
    assert.ok(bytes, `${part.kind} has real staged object bytes`);
    assert.equal(bytes.byteLength, part.size_bytes);
    assert.equal(sha256(bytes), part.sha256, `${part.kind} matches its immutable staged digest`);
  }
  await refreshReporting();
  await waitFor('the visible READY bundle and Partner release action', `(() => { const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section'); return report?.innerText.includes('READY') && [...(report?.querySelectorAll('button')??[])].some(item=>item.textContent?.trim()==='Release exact five-part bundle'); })()`);

  // FLD-013: exercise the final release route with a genuinely SENT critical
  // confirmation. Use only local synthetic addresses and an in-process email
  // provider; no external delivery is possible from this acceptance fixture.
  const localEmailPurposes: string[] = [];
  server.setEmailProvider(async request => {
    assert.equal(new URL(request.url).host, 'email-provider.local');
    const form = await request.formData();
    const message = JSON.parse(String(form.get('message'))) as { to?: string; purpose?: string };
    const attachment = form.get('attachment');
    assert.ok(attachment && typeof attachment !== 'string', 'synthetic dispatches attach the generated PDF');
    assert.match(message.to ?? '', /@example\.invalid$/, 'the local provider accepts only synthetic recipients');
    assert.ok(request.headers.get('Idempotency-Key'));
    localEmailPurposes.push(message.purpose ?? '');
    return Response.json({ messageId: `local-reporting-provider-${localEmailPurposes.length}` }, { status: 202 });
  });
  const holdingLetterRouteId = randomUUID();
  const routeNow = new Date().toISOString();
  runFixtureSql(`INSERT INTO contact_routes(id,workspace_id,version,client_id,purpose,contact_id,is_primary,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,'HOLDING_LETTER',?,1,?,?,?,?)`, holdingLetterRouteId, fixture.workspaceId, fixture.clientId,
    fixture.managementContactId, routeNow, routeNow, fixture.actorId, fixture.actorId);
  const confirmationFsli = server.db.prepare(`SELECT l.fsli_id FROM statement_snapshot_lines l
    JOIN statement_snapshots s ON s.workspace_id=l.workspace_id AND s.id=l.snapshot_id
    WHERE s.workspace_id=? AND s.engagement_id=? ORDER BY l.rowid LIMIT 1`).bind(fixture.workspaceId, fixture.engagementId)
    .first<{ fsli_id: string }>();
  assert.ok(confirmationFsli?.fsli_id, 'the release fixture has a current active statement line for confirmation scope');
  const postWorkerCommand = async (actorId: string, persona: 'REVIEWER' | 'APPROVER', type: string, payload: Record<string, unknown>) => {
    const response = await fetch(`${server!.origin}/api/workspaces/${fixture.workspaceId}/commands`, {
      method: 'POST', headers: { Origin: server!.origin, 'Content-Type': 'application/json', 'X-Actor-Id': actorId, 'X-Active-Persona': persona,
        'X-Client-Id': fixture.clientId, 'X-Engagement-Id': fixture.engagementId, 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ actor: { actorId, persona }, context: { clientId: fixture.clientId, engagementId: fixture.engagementId },
        expectedVersions: [], command: { type, payload } })
    });
    return { response, body: await response.json() as { code?: string; details?: Record<string, unknown>; result?: Record<string, unknown> } };
  };
  const createdConfirmation = await postWorkerCommand(fixture.reviewerActorId, 'REVIEWER', 'confirmation.create', {
    engagementId: fixture.engagementId, type: 'BANK', fsliId: confirmationFsli.fsli_id,
    externalPartyName: 'Synthetic Release Gate Bank', externalPartyAddress: '1 Example Street, Doha', externalPartyEmail: 'bank@example.invalid',
    recipientVerificationText: 'Verified against the synthetic engagement contact record.', critical: true,
    criticalityReason: 'The confirmation is individually material to this synthetic audit opinion.', dueDate: reportDate
  });
  assert.equal(createdConfirmation.response.status, 200, JSON.stringify(createdConfirmation.body));
  const confirmationId = String(createdConfirmation.body.result?.confirmationId ?? '');
  assert.ok(confirmationId);
  const queuedConfirmation = await postWorkerCommand(fixture.reviewerActorId, 'REVIEWER', 'confirmation.dispatch', { confirmationId, expectedVersion: 1 });
  assert.equal(queuedConfirmation.response.status, 202, JSON.stringify(queuedConfirmation.body));
  assert.equal(queuedConfirmation.body.result?.status, 'QUEUED');
  await server.runScheduled();
  await server.runScheduled();
  const sentConfirmation = server.db.prepare('SELECT status,version FROM confirmations WHERE workspace_id=? AND id=?')
    .bind(fixture.workspaceId, confirmationId).first<{ status: string; version: number }>();
  assert.equal(sentConfirmation?.status, 'SENT', 'the local provider accepted the request before release is attempted');
  assert.equal(sentConfirmation?.version, 3);
  assert.ok(localEmailPurposes.includes('CONFIRMATION'));

  let holdingLetterJobId = '';
  for (let retry = 0; retry <= 3; retry += 1) {
    const blockedRelease = await postWorkerCommand(fixture.actorId, 'APPROVER', 'report.release', {
      candidateId: readyBundle.id, expectedContentHash: readyBundle.content_hash, proposedReportDate: reportDate
    });
    assert.equal(blockedRelease.response.status, 409, JSON.stringify(blockedRelease.body), `release attempt ${retry + 1} is blocked at the Worker route`);
    assert.equal(blockedRelease.body.code, 'GATE_BLOCKED');
    assert.deepEqual(blockedRelease.body.details?.criticalConfirmationIds, [confirmationId]);
    const currentJobId = String(blockedRelease.body.details?.holdingLetterJobId ?? '');
    assert.ok(currentJobId, 'the route returns the durable Holding Letter job id');
    if (holdingLetterJobId) assert.equal(currentJobId, holdingLetterJobId, `retry ${retry} reuses one job for the unchanged blocker set`);
    holdingLetterJobId = currentJobId;
  }
  assert.equal(server.db.prepare(`SELECT COUNT(*) AS count FROM outbox_jobs WHERE workspace_id=? AND deduplication_key LIKE 'holding-letter:%'`)
    .bind(fixture.workspaceId).first<{ count: number }>()?.count, 1, 'four real release requests create only one Holding Letter job');
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM deliverable_bundles WHERE workspace_id=? AND engagement_id=?')
    .bind(fixture.workspaceId, fixture.engagementId).first<{ count: number }>()?.count, 0, 'a blocked release creates no released bundle');
  assert.equal(server.db.prepare('SELECT released_at FROM engagements WHERE workspace_id=? AND id=?')
    .bind(fixture.workspaceId, fixture.engagementId).first<{ released_at: string | null }>()?.released_at, null,
    'a blocked release does not advance engagement release state');

  let holdingLetter: { id: string; artifact_id: string; dispatch_id: string; media_type: string; immutable: number; dispatch_status: string } | null = null;
  for (let attempt = 0; attempt < 8 && holdingLetter?.dispatch_status !== 'ACCEPTED'; attempt += 1) {
    await server.runScheduled();
    holdingLetter = server.db.prepare(`SELECT h.id,h.artifact_id,h.dispatch_id,f.media_type,f.immutable,d.status AS dispatch_status
      FROM holding_letters h JOIN generated_artifacts a ON a.workspace_id=h.workspace_id AND a.id=h.artifact_id
      JOIN file_versions f ON f.workspace_id=a.workspace_id AND f.id=a.file_version_id
      JOIN dispatches d ON d.workspace_id=h.workspace_id AND d.id=h.dispatch_id
      WHERE h.workspace_id=? AND h.engagement_id=?`).bind(fixture.workspaceId, fixture.engagementId)
      .first<{ id: string; artifact_id: string; dispatch_id: string; media_type: string; immutable: number; dispatch_status: string }>();
  }
  assert.ok(holdingLetter?.id, 'the queued job renders the Holding Letter through the Worker outbox');
  assert.equal(holdingLetter.media_type, 'application/pdf');
  assert.equal(holdingLetter.immutable, 1);
  assert.equal(holdingLetter.dispatch_status, 'ACCEPTED');
  assert.ok(localEmailPurposes.includes('HOLDING_LETTER'), 'the local provider accepts the generated Holding Letter dispatch');

  const responseBytes = minimalPdf('Synthetic third-party bank confirmation response for the release-gate acceptance fixture.');
  const reviewerHeaders = { Origin: server.origin, 'Content-Type': 'application/json', 'X-Actor-Id': fixture.reviewerActorId,
    'X-Active-Persona': 'REVIEWER', 'X-Client-Id': fixture.clientId, 'X-Engagement-Id': fixture.engagementId };
  const responseReservation = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/files`, {
    method: 'POST', headers: { ...reviewerHeaders, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ purpose: 'EVIDENCE', originalName: 'qa-bank-confirmation-response.pdf', mediaType: 'application/pdf',
      sizeBytes: responseBytes.byteLength, clientId: fixture.clientId, engagementId: fixture.engagementId })
  });
  assert.equal(responseReservation.status, 201, await responseReservation.clone().text());
  const reservedResponseFile = await responseReservation.json() as { fileId: string; version: number; state: string };
  assert.equal(reservedResponseFile.state, 'INITIALIZED');
  const stagedResponse = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/files/${reservedResponseFile.fileId}/content`, {
    method: 'PUT', headers: { ...reviewerHeaders, 'Idempotency-Key': randomUUID(), 'X-File-Version': String(reservedResponseFile.version), 'Content-Type': 'application/pdf' },
    body: responseBytes
  });
  assert.equal(stagedResponse.status, 200, await stagedResponse.clone().text());
  const stagedResponseFile = await stagedResponse.json() as { fileId: string; version: number; state: string; sha256: string };
  assert.equal(stagedResponseFile.state, 'STAGED');
  const committedResponse = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/files/${reservedResponseFile.fileId}/complete`, {
    method: 'POST', headers: { ...reviewerHeaders, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ expectedVersion: stagedResponseFile.version, sizeBytes: responseBytes.byteLength, sha256: stagedResponseFile.sha256 })
  });
  assert.equal(committedResponse.status, 200, await committedResponse.clone().text());
  const recordedResponse = await postWorkerCommand(fixture.reviewerActorId, 'REVIEWER', 'confirmation.record-response', {
    confirmationId, expectedVersion: 3, responseFileId: reservedResponseFile.fileId, returnedAt: new Date(Date.now() - 1000).toISOString()
  });
  assert.equal(recordedResponse.response.status, 200, JSON.stringify(recordedResponse.body));
  assert.equal(recordedResponse.body.result?.status, 'RETURNED_UNVERIFIED');
  const unverifiedRelease = await postWorkerCommand(fixture.actorId, 'APPROVER', 'report.release', {
    candidateId: readyBundle.id, expectedContentHash: readyBundle.content_hash, proposedReportDate: reportDate
  });
  assert.equal(unverifiedRelease.response.status, 409, JSON.stringify(unverifiedRelease.body), 'a committed but unverified response still blocks the Worker release route');
  assert.deepEqual(unverifiedRelease.body.details?.criticalConfirmationIds, [confirmationId]);
  const unverifiedHoldingLetterJobId = String(unverifiedRelease.body.details?.holdingLetterJobId ?? '');
  assert.ok(unverifiedHoldingLetterJobId);
  assert.notEqual(unverifiedHoldingLetterJobId, holdingLetterJobId, 'a changed outstanding-set snapshot receives its own idempotent Holding Letter job');
  assert.equal(server.db.prepare(`SELECT COUNT(*) AS count FROM outbox_jobs WHERE workspace_id=? AND deduplication_key LIKE 'holding-letter:%'`)
    .bind(fixture.workspaceId).first<{ count: number }>()?.count, 2);
  const unverifiedJob = server.db.prepare('SELECT payload_json FROM outbox_jobs WHERE workspace_id=? AND id=?')
    .bind(fixture.workspaceId, unverifiedHoldingLetterJobId).first<{ payload_json: string }>();
  assert.ok(unverifiedJob);
  const unverifiedLetterId = String((JSON.parse(unverifiedJob.payload_json) as { holdingLetterId?: string }).holdingLetterId ?? '');
  assert.ok(unverifiedLetterId);
  let unverifiedHoldingLetter: { dispatch_id: string; dispatch_status: string; snapshot_json: string } | null = null;
  for (let attempt = 0; attempt < 8 && unverifiedHoldingLetter?.dispatch_status !== 'ACCEPTED'; attempt += 1) {
    await server.runScheduled();
    unverifiedHoldingLetter = server.db.prepare(`SELECT h.dispatch_id,h.confirmation_ids_snapshot_json AS snapshot_json,d.status AS dispatch_status
      FROM holding_letters h JOIN dispatches d ON d.workspace_id=h.workspace_id AND d.id=h.dispatch_id WHERE h.workspace_id=? AND h.id=?`)
      .bind(fixture.workspaceId, unverifiedLetterId).first<{ dispatch_id: string; dispatch_status: string; snapshot_json: string }>();
  }
  assert.ok(unverifiedHoldingLetter?.dispatch_id, 'the unverified blocker set also renders its own Holding Letter');
  assert.equal(unverifiedHoldingLetter.dispatch_status, 'ACCEPTED');
  assert.deepEqual((JSON.parse(unverifiedHoldingLetter.snapshot_json) as Array<{ status: string }>).map(item => item.status), ['RETURNED_UNVERIFIED']);
  assert.equal(localEmailPurposes.filter(purpose => purpose === 'HOLDING_LETTER').length, 2);

  const reassessedConfirmation = await postWorkerCommand(fixture.actorId, 'APPROVER', 'confirmation.scope-reassess', {
    confirmationId, expectedVersion: 4, rationale: 'The Partner reviewed the returned confirmation scope and approved a noncritical replacement for this release fixture.',
    replacementCritical: false, replacementCriticalityReason: null
  });
  assert.equal(reassessedConfirmation.response.status, 200, JSON.stringify(reassessedConfirmation.body));
  assert.equal(reassessedConfirmation.body.result?.status, 'CANCELLED');
  await refreshReporting();
  await waitFor('the still-ready bundle after the approved confirmation scope reassessment', `(() => { const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section'); return report?.innerText.includes('READY') && [...(report?.querySelectorAll('button')??[])].some(item=>item.textContent?.trim()==='Release exact five-part bundle'); })()`);

  await clickReportButton('Release exact five-part bundle');
  await waitFor('the atomic report release command result', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('Atomic release requested; delivery status will be shown separately from publication.')`);
  const released = await waitForDbRow('the immutable released five-part bundle', () => server!.db.prepare(`SELECT b.id,b.candidate_id,b.content_hash,b.released_by_actor_id,b.released_at,
      e.lifecycle_state,e.released_at AS engagement_released_at,e.report_signed_at,e.report_date,e.archive_due_at,e.portal_frozen_at,e.locked_at
    FROM deliverable_bundles b JOIN engagements e ON e.workspace_id=b.workspace_id AND e.client_id=b.client_id AND e.id=b.engagement_id
    WHERE b.workspace_id=? AND b.engagement_id=?`).bind(fixture.workspaceId, fixture.engagementId).first<{
      id: string; candidate_id: string; content_hash: string; released_by_actor_id: string; released_at: string; lifecycle_state: string;
      engagement_released_at: string; report_signed_at: string; report_date: string; archive_due_at: string; portal_frozen_at: string; locked_at: string | null
    }>());
  assert.equal(released.candidate_id, readyBundle.id);
  assert.equal(released.content_hash, readyBundle.content_hash);
  assert.equal(released.released_by_actor_id, fixture.actorId);
  assert.equal(released.lifecycle_state, 'COMPLIANCE_COUNTDOWN');
  assert.equal(released.engagement_released_at, released.released_at);
  assert.equal(released.report_signed_at, released.released_at);
  assert.equal(released.portal_frozen_at, released.released_at);
  assert.equal(released.report_date, reportDate);
  assert.equal(released.locked_at, null, 'the report release freezes client uploads but starts an unlocked 60-day archive countdown');
  assert.equal(Date.parse(released.archive_due_at), Date.parse(released.report_signed_at) + 60 * 86_400_000,
    'the deadline is exactly 60 days from the recorded report signature time');
  const countdownWorkflowResponse = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/engagements/${fixture.engagementId}/workflow`, {
    headers: { Origin: server.origin, 'X-Actor-Id': fixture.actorId, 'X-Active-Persona': 'APPROVER', 'X-Client-Id': fixture.clientId, 'X-Engagement-Id': fixture.engagementId }
  });
  const countdownWorkflow = await countdownWorkflowResponse.json() as { state: string; stages: Array<{ id: string; status: string; blockerCoverage: string; blockers: unknown[] }> };
  assert.equal(countdownWorkflowResponse.status, 200, JSON.stringify(countdownWorkflow));
  const releasedStage = countdownWorkflow.stages.find(item => item.id === 'DELIVERABLE_RELEASE');
  assert.ok(releasedStage);
  assert.equal(releasedStage.status, 'completed', 'the atomic report release remains visible as a completed lifecycle stage');
  assert.deepEqual(releasedStage.blockers, []);
  const countdownStage = countdownWorkflow.stages.find(item => item.id === 'COMPLIANCE_COUNTDOWN');
  assert.ok(countdownStage);
  assert.equal(countdownStage.blockerCoverage, 'evaluated');
  assert.equal(countdownStage.status, 'current');
  assert.deepEqual(countdownStage.blockers, [], 'the live server deadline is in the future and archive sealing is not blocked');

  const finalInvoice = server.db.prepare(`SELECT id,kind,status,subtotal_minor,tax_minor,total_minor,issued_at FROM invoices
    WHERE workspace_id=? AND engagement_id=? AND kind='FINAL' AND status='ISSUED'`).bind(fixture.workspaceId, fixture.engagementId)
    .first<{ id: string; kind: string; status: string; subtotal_minor: number; tax_minor: number; total_minor: number; issued_at: string }>();
  assert.ok(finalInvoice, 'atomic release issues exactly one final installment invoice');
  assert.deepEqual({ kind: finalInvoice.kind, status: finalInvoice.status, subtotal: finalInvoice.subtotal_minor, tax: finalInvoice.tax_minor, total: finalInvoice.total_minor },
    { kind: 'FINAL', status: 'ISSUED', subtotal: 50000, tax: 0, total: 50000 });
  assert.equal(server.db.prepare(`SELECT COUNT(*) AS count FROM invoices WHERE workspace_id=? AND engagement_id=? AND kind='FINAL' AND status<>'VOID'`)
    .bind(fixture.workspaceId, fixture.engagementId).first<{ count: number }>()?.count, 1, 'the release does not duplicate the final invoice');

  const releasedParts = server.db.prepare(`SELECT p.id AS part_id,p.kind,p.primary_file_id,p.sha256,p.size_bytes,f.original_name,f.media_type,f.state,f.immutable,f.object_key
    FROM deliverable_parts p JOIN file_versions f ON f.workspace_id=p.workspace_id AND f.id=p.primary_file_id
    WHERE p.workspace_id=? AND p.bundle_id=? ORDER BY p.kind`).bind(fixture.workspaceId, released.id).all<{
      part_id: string; kind: string; primary_file_id: string; sha256: string; size_bytes: number; original_name: string; media_type: string;
      state: string; immutable: number; object_key: string
    }>().results;
  assert.equal(releasedParts?.length, 5);
  assert.deepEqual(new Set(releasedParts?.map(part => part.kind)), new Set(['REPORT_AND_FS', 'MANAGEMENT_LETTER', 'REPRESENTATION', 'CORRESPONDENCE_TRAIL', 'FINAL_FEE_NOTE']));
  for (const part of releasedParts ?? []) {
    const bytes = server.getTestObject(part.object_key);
    assert.ok(bytes, `${part.kind} was copied to private R2 before the release transaction committed`);
    assert.equal(part.state, 'COMMITTED');
    assert.equal(part.immutable, 1);
    assert.equal(part.sha256, stagedParts?.find(row => row.kind === part.kind)?.sha256,
      `${part.kind} release preserves the exact privately verified candidate digest`);
    assert.equal(bytes.byteLength, part.size_bytes);
    assert.equal(sha256(bytes), part.sha256, `${part.kind} release bytes match the immutable part digest`);
  }
  const signature = server.db.prepare(`SELECT s.id,s.signature_file_sha256,s.seal_file_sha256,s.signed_at,s.report_date,s.final_file_sha256
    FROM report_signatures s WHERE s.workspace_id=? AND s.engagement_id=?`).bind(fixture.workspaceId, fixture.engagementId)
    .first<{ id: string; signature_file_sha256: string; seal_file_sha256: string; signed_at: string; report_date: string; final_file_sha256: string }>();
  assert.ok(signature);
  assert.equal(signature.signed_at, released.report_signed_at);
  assert.equal(signature.report_date, released.report_date);
  assert.equal(signature.signature_file_sha256, registered.signature_sha256);
  assert.equal(signature.seal_file_sha256, registered.seal_sha256);
  assert.equal(signature.final_file_sha256, releasedParts?.find(part => part.kind === 'REPORT_AND_FS')?.sha256);
  const provenanceResponse = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/engagements/${fixture.engagementId}/released-report/provenance`, {
    headers: { Origin: server.origin, 'X-Actor-Id': fixture.actorId, 'X-Active-Persona': 'APPROVER', 'X-Client-Id': fixture.clientId,
      'X-Engagement-Id': fixture.engagementId }
  });
  const provenance = await provenanceResponse.json() as {
    bundle?: { id: string; contentSha256: string };
    consent?: { candidateContentSha256: string; attribution: string };
    reportSignature?: { finalFileSha256: string; signingMethod: string };
    signatureAsset?: { owner: { grade: string }; signature: { sha256: string }; seal: { sha256: string } };
    integrity?: { hashesAndPinnedVersionsMatch: boolean; signatureAttribution: string };
  };
  assert.equal(provenanceResponse.status, 200, JSON.stringify(provenance));
  assert.equal(provenance.bundle?.id, released.id);
  assert.equal(provenance.bundle?.contentSha256, readyBundle.content_hash);
  assert.equal(provenance.consent?.candidateContentSha256, generated.content_sha256);
  assert.equal(provenance.consent?.attribution, 'SELF_ASSERTED_PERSONA');
  assert.equal(provenance.reportSignature?.finalFileSha256, signature.final_file_sha256);
  assert.equal(provenance.reportSignature?.signingMethod, 'IMAGE_WITH_AUDIT_PROVENANCE');
  assert.equal(provenance.signatureAsset?.owner.grade, 'PARTNER');
  assert.equal(provenance.signatureAsset?.signature.sha256, registered.signature_sha256);
  assert.equal(provenance.signatureAsset?.seal.sha256, registered.seal_sha256);
  assert.deepEqual(provenance.integrity, { hashesAndPinnedVersionsMatch: true, signatureAttribution: 'SELF_ASSERTED_PERSONA' });
  await refreshReporting();
  await waitFor('the released signature provenance in the Partner reporting panel', `(() => {
    const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    const panel=report?.querySelector('.business-report-provenance');
    const text=panel?.innerText ?? '';
    return text.includes('Released report signature provenance') && text.includes('SELF_ASSERTED_PERSONA') &&
      text.includes(${JSON.stringify(generated.content_sha256)}) &&
      text.includes(${JSON.stringify(registered.signature_sha256)}) && text.includes(${JSON.stringify(registered.seal_sha256)}) &&
      text.includes(${JSON.stringify(signature.final_file_sha256)});
  })()`);
  const visibleProvenance = await tab.evaluate<string>(`document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.querySelector('.business-report-provenance')?.innerText ?? ''`);
  assert.match(visibleProvenance, /not certificate-backed or verified identity/i);
  assert.match(visibleProvenance, /Consented candidate SHA-256/);
  assert.equal(server.db.prepare(`SELECT COUNT(*) AS count FROM portal_freezes WHERE workspace_id=? AND engagement_id=? AND bundle_id=? AND frozen_at=? AND reason='FINAL_REPORT_RELEASE' AND actor_id=?`)
    .bind(fixture.workspaceId, fixture.engagementId, released.id, released.released_at, fixture.actorId).first<{ count: number }>()?.count, 1);
  const releaseTransitions = server.db.prepare(`SELECT from_state,to_state FROM state_transitions WHERE workspace_id=? AND engagement_id=? AND transitioned_at=? ORDER BY version`)
    .bind(fixture.workspaceId, fixture.engagementId, released.released_at).all<{ from_state: string; to_state: string }>().results;
  assert.deepEqual(releaseTransitions?.map(item => [item.from_state, item.to_state]), [
    ['PARTNER_APPROVAL', 'DELIVERABLE_RELEASE'], ['DELIVERABLE_RELEASE', 'COMPLIANCE_COUNTDOWN']
  ], 'publication records both lifecycle transitions atomically');

  const releasedReturn = server.db.prepare(`SELECT f.id,f.original_name,f.sha256,f.size_bytes,f.object_key,a.purpose FROM deliverable_attachments a
    JOIN deliverable_parts p ON p.workspace_id=a.workspace_id AND p.id=a.part_id
    JOIN file_versions f ON f.workspace_id=a.workspace_id AND f.id=a.file_version_id
    WHERE a.workspace_id=? AND p.bundle_id=? AND a.purpose='SIGNED_CLIENT_REPRESENTATION'`).bind(fixture.workspaceId, released.id)
    .first<{ id: string; original_name: string; sha256: string; size_bytes: number; object_key: string; purpose: string }>();
  assert.ok(releasedReturn);
  assert.equal(releasedReturn.sha256, uploadedSignedReturn.sha256);
  assert.equal(releasedReturn.size_bytes, uploadedSignedReturn.size_bytes);
  assert.equal(sha256(server.getTestObject(releasedReturn.object_key) ?? new Uint8Array()), uploadedSignedReturn.sha256,
    'the accepted signed return is retained as an immutable release attachment');

  const frozenCommitResponse = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/files/${pendingStage.fileId}/complete`, {
    method: 'POST', headers: { ...clientContextHeaders, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ expectedVersion: pendingStage.version, sizeBytes: pendingStage.sizeBytes, sha256: pendingStage.sha256 })
  });
  const frozenCommit = await frozenCommitResponse.json() as { code?: string; message?: string };
  assert.equal(frozenCommitResponse.status, 423, JSON.stringify(frozenCommit));
  assert.equal(frozenCommit.code, 'PORTAL_FROZEN', 'an in-flight upload cannot cross the atomic report-release freeze');
  assert.equal(server.db.prepare('SELECT state FROM file_versions WHERE workspace_id=? AND id=?').bind(fixture.workspaceId, pendingStage.fileId)
    .first<{ state: string }>()?.state, 'STAGED');
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM representation_returns WHERE workspace_id=? AND signed_file_id=?')
    .bind(fixture.workspaceId, pendingStage.fileId).first<{ count: number }>()?.count, 0, 'a rejected stale upload cannot become signed-return evidence');

  await switchActor(fixture.clientActorId, 'CLIENT');
  await waitFor('the client release, portal freeze and retained signed return', `(() => {
    const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    return report?.innerText.includes('Read only') && report.innerText.includes('Frozen at ${released.released_at}') &&
      report.innerText.includes('COMPLIANCE COUNTDOWN') && report.innerText.includes('qa-signed-representation.pdf');
  })()`);
  const portalControls = await tab.evaluate<{ fileInputs: number; enabledFileInputs: number; enabledUploadButtons: number }>(`(() => {
    const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    const inputs=[...(report?.querySelectorAll('input[type="file"]')??[])];
    const uploads=[...(report?.querySelectorAll('button')??[])].filter(button=>/upload|submit signed return/i.test(button.textContent??''));
    return { fileInputs: inputs.length, enabledFileInputs: inputs.filter(item=>!item.disabled).length,
      enabledUploadButtons: uploads.filter(item=>!item.disabled).length };
  })()`);
  assert.equal(portalControls.enabledFileInputs, 0, 'portal freeze disables client upload fields');
  assert.equal(portalControls.enabledUploadButtons, 0, 'portal freeze disables every signed-return upload and submission action');

  await installDownloadCapture();
  const portalDownloadRows = releasedParts ?? [];
  assert.equal(portalDownloadRows.length, 5);
  for (let index = 0; index < portalDownloadRows.length; index++) {
    const part = portalDownloadRows[index]!;
    await waitFor(`the client download action for ${part.original_name}`, `(() => {
      const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      return [...(report?.querySelectorAll('.business-delivery-row')??[])].some(row=>row.innerText.includes(${JSON.stringify(part.original_name)}) &&
        [...row.querySelectorAll('button')].some(button=>button.textContent?.trim()==='Download and verify'&&!button.disabled));
    })()`);
    const beforeCount = await tab.evaluate<number>('window.__qaDownloadCapture.downloads.length');
    await clickReportRowButton(part.original_name, 'Download and verify');
    const captured = await readCapturedDownload(beforeCount, `${part.kind} portal part`);
    assert.equal(captured.size, part.size_bytes);
    assert.equal(sha256(captured.bytes), part.sha256, `${part.kind} reaches the CLIENT as the exact hash-verified released bytes`);
    await waitFor(`the completed ${part.kind} portal download control`, `(() => {
      const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
      return [...(report?.querySelectorAll('.business-delivery-row')??[])].some(row=>row.innerText.includes(${JSON.stringify(part.original_name)}) &&
        [...row.querySelectorAll('button')].some(button=>button.textContent?.trim()==='Download and verify'&&!button.disabled));
    })()`);
  }
  const representationPart = portalDownloadRows.find(part => part.kind === 'REPRESENTATION');
  assert.ok(representationPart);
  await waitFor('the accepted signed-return download action', `(() => {
    const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    return [...(report?.querySelectorAll('.business-delivery-row')??[])].some(row=>row.innerText.includes(${JSON.stringify(representationPart.original_name)}) &&
      [...row.querySelectorAll('button')].some(button=>button.textContent?.trim()==='Download accepted signed return'&&!button.disabled));
  })()`);
  const signedReturnDownloadIndex = await tab.evaluate<number>('window.__qaDownloadCapture.downloads.length');
  await clickReportRowButton(representationPart.original_name, 'Download accepted signed return');
  const capturedReturn = await readCapturedDownload(signedReturnDownloadIndex, 'accepted signed representation return');
  assert.equal(capturedReturn.size, releasedReturn.size_bytes);
  assert.equal(sha256(capturedReturn.bytes), releasedReturn.sha256);

  await switchActor(fixture.actorId, 'APPROVER');
  await refreshReporting();
  await waitFor('the Partner retention and archive controls after release', `(() => {
    const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    return report?.innerText.includes('COMPLIANCE COUNTDOWN') && Boolean([...report.querySelectorAll('button')].find(item=>item.textContent?.trim()==='Lock and seal archive now'));
  })()`);
  await fillReportField('Policy name', 'Synthetic seven-year audit retention policy');
  await fillReportField('Retention period (years)', '7');
  await fillReportField('Legal / professional basis', 'Synthetic local acceptance records are retained under the approved seven-year test schedule.');
  await clickInForm('Approve firm retention policy', 'Approve retention policy');
  await waitFor('the approved immutable retention policy result', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('New immutable firm retention policy approved.')`);
  const retention = await waitForDbRow('the seven-year firm retention policy', () => server!.db.prepare(`SELECT id,version,name,assembly_days,retention_years,retain_indefinitely,legal_basis,approved_by_actor_id
    FROM retention_policies WHERE workspace_id=? ORDER BY version DESC LIMIT 1`).bind(fixture.workspaceId).first<{
      id: string; version: number; name: string; assembly_days: number; retention_years: number | null; retain_indefinitely: number; legal_basis: string; approved_by_actor_id: string
    }>());
  assert.equal(retention.name, 'Synthetic seven-year audit retention policy');
  assert.equal(retention.assembly_days, 60);
  assert.equal(retention.retention_years, 7);
  assert.equal(retention.retain_indefinitely, 0);
  assert.equal(retention.approved_by_actor_id, fixture.actorId);

  await fillReportField('Assembly note', 'Synthetic release bundle, hash checks and retained source files were reviewed before archive sealing.');
  await fillReportField('Related record', released.id, true);
  await clickReportingFormButton('Assembly note', 'Append assembly note');
  await waitFor('the administrative-only archive assembly note', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('Administrative assembly note appended without changing audit evidence.')`);
  const assemblyNote = server.db.prepare(`SELECT text,related_record_type,related_record_id,recorded_by_actor_id,administrative_only
    FROM archive_assembly_notes WHERE workspace_id=? AND engagement_id=?`).bind(fixture.workspaceId, fixture.engagementId).first<{
      text: string; related_record_type: string; related_record_id: string; recorded_by_actor_id: string; administrative_only: number
    }>();
  assert.ok(assemblyNote);
  assert.equal(assemblyNote.related_record_type, 'DELIVERABLE_BUNDLE');
  assert.equal(assemblyNote.related_record_id, released.id);
  assert.equal(assemblyNote.recorded_by_actor_id, fixture.actorId);
  assert.equal(assemblyNote.administrative_only, 1);

  await clickReportButton('Lock and seal archive now');
  await waitFor('the immediate read-only archive lock result', `document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section')?.innerText.includes('Engagement locked read-only; archive sealing is queued.')`);
  const queuedArchive = await waitForDbRow('the locked archive sealing job', () => server!.db.prepare(`SELECT r.id,r.status,r.job_id,e.lifecycle_state,e.locked_at,e.archive_due_at
    FROM archive_runs r JOIN engagements e ON e.workspace_id=r.workspace_id AND e.id=r.engagement_id
    WHERE r.workspace_id=? AND r.engagement_id=?`).bind(fixture.workspaceId, fixture.engagementId).first<{
      id: string; status: string; job_id: string; lifecycle_state: string; locked_at: string; archive_due_at: string
    }>());
  assert.equal(queuedArchive.status, 'QUEUED');
  assert.ok(queuedArchive.locked_at, 'early lock takes effect before asynchronous archive generation');
  assert.equal(queuedArchive.lifecycle_state, 'COMPLIANCE_COUNTDOWN');
  const queuedArchiveWorkflowResponse = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/engagements/${fixture.engagementId}/workflow`, {
    headers: { Origin: server.origin, 'X-Actor-Id': fixture.actorId, 'X-Active-Persona': 'APPROVER', 'X-Client-Id': fixture.clientId, 'X-Engagement-Id': fixture.engagementId }
  });
  const queuedArchiveWorkflow = await queuedArchiveWorkflowResponse.json() as { stages: Array<{ id: string; status: string; blockerCoverage: string; blockers: unknown[] }> };
  assert.equal(queuedArchiveWorkflowResponse.status, 200, JSON.stringify(queuedArchiveWorkflow));
  const queuedArchiveStage = queuedArchiveWorkflow.stages.find(item => item.id === 'COMPLIANCE_COUNTDOWN');
  assert.ok(queuedArchiveStage);
  assert.equal(queuedArchiveStage.blockerCoverage, 'evaluated');
  assert.equal(queuedArchiveStage.status, 'current');
  assert.deepEqual(queuedArchiveStage.blockers, [], 'a queued seal remains in progress while its archive job runs');
  await server.runScheduled();
  const sealedArchive = await waitForDbRow('the verified immutable archive seal', () => server!.db.prepare(`SELECT s.id,s.sealed_at,s.reason,s.manifest_file_id,s.archive_file_id,s.audit_chain_head,s.manifest_sha256,s.archive_sha256,
      s.record_count,s.file_count,s.retention_policy_id,s.locked_by_actor_id,r.status AS run_status,r.frozen_snapshot_hash,e.lifecycle_state,e.locked_at,e.archive_due_at
    FROM archive_seals s JOIN archive_runs r ON r.workspace_id=s.workspace_id AND r.engagement_id=s.engagement_id
    JOIN engagements e ON e.workspace_id=s.workspace_id AND e.id=s.engagement_id
    WHERE s.workspace_id=? AND s.engagement_id=?`).bind(fixture.workspaceId, fixture.engagementId).first<{
      id: string; sealed_at: string; reason: string; manifest_file_id: string; archive_file_id: string; audit_chain_head: string; manifest_sha256: string; archive_sha256: string;
      record_count: number; file_count: number; retention_policy_id: string; locked_by_actor_id: string; run_status: string; frozen_snapshot_hash: string;
      lifecycle_state: string; locked_at: string; archive_due_at: string
    }>());
  assert.equal(sealedArchive.run_status, 'SEALED');
  assert.equal(sealedArchive.lifecycle_state, 'ARCHIVED_READ_ONLY');
  assert.ok(sealedArchive.locked_at);
  assert.equal(sealedArchive.reason, 'EARLY_PARTNER_LOCK');
  assert.equal(sealedArchive.locked_by_actor_id, fixture.actorId);
  assert.equal(sealedArchive.retention_policy_id, retention.id);
  assert.equal(sealedArchive.frozen_snapshot_hash, sealedArchive.manifest_sha256);
  assert.equal(sealedArchive.archive_due_at, released.archive_due_at, 'early administrative sealing does not rewrite the report-signature deadline');
  const archivedWorkflowResponse = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/engagements/${fixture.engagementId}/workflow`, {
    headers: { Origin: server.origin, 'X-Actor-Id': fixture.actorId, 'X-Active-PERSONA': 'APPROVER', 'X-Client-Id': fixture.clientId, 'X-Engagement-Id': fixture.engagementId }
  });
  const archivedWorkflow = await archivedWorkflowResponse.json() as { state: string; stages: Array<{ id: string; status: string; blockerCoverage: string; blockers: Array<{ code: string }> }> };
  assert.equal(archivedWorkflowResponse.status, 200, JSON.stringify(archivedWorkflow));
  assert.equal(archivedWorkflow.state, 'ARCHIVED_READ_ONLY');
  const archivedStage = archivedWorkflow.stages.find(item => item.id === 'ARCHIVED_READ_ONLY');
  assert.ok(archivedStage);
  assert.equal(archivedStage.blockerCoverage, 'evaluated');
  assert.equal(archivedStage.status, 'completed');
  assert.deepEqual(archivedStage.blockers, [], 'read-only completion requires committed manifest and archive files whose stored hashes match their seal');

  const archivedReadPaths = ['acceptance-gate', 'risk-workspace', 'planning-workspace', 'trial-balance-workspace', 'planning-readiness', 'folders'];
  const archivedReads = await Promise.all(archivedReadPaths.map(async path => {
    const response = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/engagements/${fixture.engagementId}/${path}`, {
      headers: { ...clientContextHeaders, 'X-Actor-Id': fixture.actorId, 'X-Active-Persona': 'APPROVER' }
    });
    return { path, status: response.status, body: response.ok ? '' : await response.text() };
  }));
  assert.deepEqual(archivedReads.map(item => [item.path, item.status]), archivedReadPaths.map(path => [path, 200]),
    `staff can read the sealed engagement without reopening it: ${JSON.stringify(archivedReads)}`);

  const archiveFiles = server.db.prepare(`SELECT id,original_name,media_type,size_bytes,sha256,object_key FROM file_versions
    WHERE workspace_id=? AND id IN (?,?) ORDER BY purpose,original_name`).bind(fixture.workspaceId, sealedArchive.manifest_file_id, sealedArchive.archive_file_id)
    .all<{ id: string; original_name: string; media_type: string; size_bytes: number; sha256: string; object_key: string }>().results;
  assert.equal(archiveFiles?.length, 2);
  const manifestFile = archiveFiles?.find(file => file.id === sealedArchive.manifest_file_id);
  const archiveFile = archiveFiles?.find(file => file.id === sealedArchive.archive_file_id);
  assert.ok(manifestFile && archiveFile);
  const manifestBytes = server.getTestObject(manifestFile.object_key);
  const archiveBytes = server.getTestObject(archiveFile.object_key);
  assert.ok(manifestBytes && archiveBytes, 'the manifest and ZIP were committed to the isolated object store');
  assert.equal(manifestBytes.byteLength, manifestFile.size_bytes);
  assert.equal(sha256(manifestBytes), sealedArchive.manifest_sha256);
  assert.equal(sha256(archiveBytes), sealedArchive.archive_sha256);
  assert.equal(archiveBytes.byteLength, archiveFile.size_bytes);
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
    format: string; engagementId: string; workspaceId: string; bundleId: string; lockedAt: string; sealedAt: string; reason: string;
    retentionPolicyId: string; auditChainHead: string; recordCount: number; records: Record<string, unknown>; files: Array<{
      id: string; originalName: string; mediaType: string; sizeBytes: number; sha256: string; purpose: string
    }>
  };
  assert.equal(manifest.format, 'AuditSphere sealed archive manifest v1');
  assert.equal(manifest.engagementId, fixture.engagementId);
  assert.equal(manifest.workspaceId, fixture.workspaceId);
  assert.equal(manifest.bundleId, released.id);
  assert.equal(manifest.lockedAt, sealedArchive.locked_at);
  assert.equal(manifest.reason, 'EARLY_PARTNER_LOCK');
  assert.equal(manifest.retentionPolicyId, retention.id);
  assert.equal(manifest.auditChainHead, sealedArchive.audit_chain_head);
  assert.equal(manifest.recordCount, sealedArchive.record_count);
  assert.equal(manifest.files.length, sealedArchive.file_count);
  const zipEntries = unzipSync(archiveBytes);
  const manifestEntry = zipEntries['manifest.json'];
  assert.ok(manifestEntry, 'the sealed archive contains its exact manifest');
  assert.equal(sha256(manifestEntry), sealedArchive.manifest_sha256);
  const expectedEntries = new Set(['manifest.json']);
  for (const file of manifest.files) {
    const safeName = file.originalName.replace(/[\\/]+/g, '_').replace(/\.\./g, '_').slice(0, 160);
    const entryName = `files/${file.purpose.toLowerCase()}/${file.id}-${safeName}`;
    expectedEntries.add(entryName);
    const bytes = zipEntries[entryName];
    assert.ok(bytes, `manifest file ${file.originalName} is present at its declared archive path`);
    assert.equal(bytes.byteLength, file.sizeBytes);
    assert.equal(sha256(bytes), file.sha256, `${file.originalName} archive bytes match their manifest digest`);
  }
  assert.deepEqual(new Set(Object.keys(zipEntries)), expectedEntries, 'the sealed ZIP contains exactly the manifest and every listed committed source file');
  assert.equal(manifest.files.some(file => file.id === pendingStage.fileId), false, 'the rejected staged upload is excluded from the committed archive file set');
  assert.equal(server.db.prepare('SELECT state FROM file_versions WHERE workspace_id=? AND id=?').bind(fixture.workspaceId, pendingStage.fileId)
    .first<{ state: string }>()?.state, 'STAGED');

  await switchActor(fixture.actorId, 'APPROVER');
  await installDownloadCapture();
  await refreshReporting();
  await waitFor('the Partner sealed archive export controls', `(() => {
    const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    return report?.innerText.includes('SEALED') && [...(report?.querySelectorAll('button')??[])].some(item=>item.textContent?.trim()==='Export verified sealed archive') &&
      [...(report?.querySelectorAll('button')??[])].some(item=>item.textContent?.trim()==='Export verified manifest');
  })()`);
  await installDownloadCapture();
  const archiveDownloadIndex = await tab.evaluate<number>('window.__qaDownloadCapture?.downloads.length ?? 0');
  await clickReportButton('Export verified sealed archive');
  const exportedArchive = await readCapturedDownload(archiveDownloadIndex, 'sealed archive export');
  assert.equal(exportedArchive.fileName, 'sealed-audit-archive.zip');
  assert.equal(exportedArchive.type, 'application/zip');
  assert.equal(sha256(exportedArchive.bytes), sealedArchive.archive_sha256, 'the UI export verifies the exact sealed ZIP hash');
  await waitFor('the enabled manifest export control', `(() => { const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section'); const button=[...(report?.querySelectorAll('button')??[])].find(item=>item.textContent?.trim()==='Export verified manifest'); return Boolean(button&&!button.disabled); })()`);
  await installDownloadCapture();
  const manifestDownloadIndex = await tab.evaluate<number>('window.__qaDownloadCapture?.downloads.length ?? 0');
  await clickReportButton('Export verified manifest');
  const exportedManifest = await readCapturedDownload(manifestDownloadIndex, 'sealed manifest export');
  assert.equal(exportedManifest.fileName, 'archive-manifest.json');
  assert.equal(exportedManifest.type, 'application/json');
  assert.equal(sha256(exportedManifest.bytes), sealedArchive.manifest_sha256, 'the UI export verifies the exact sealed manifest hash');

  const frozenArchiveWrite = await fetch(`${server.origin}/api/workspaces/${fixture.workspaceId}/commands`, {
    method: 'POST', headers: { ...clientContextHeaders, 'X-Actor-Id': fixture.reviewerActorId, 'X-Active-Persona': 'REVIEWER', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ actor: { actorId: fixture.reviewerActorId, persona: 'REVIEWER' }, context: { clientId: fixture.clientId, engagementId: fixture.engagementId },
      expectedVersions: [], command: { type: 'archive.note', payload: {
        engagementId: fixture.engagementId, text: 'Attempted post-seal assembly change must be rejected.', relatedRecordType: 'DELIVERABLE_BUNDLE', relatedRecordId: released.id
      } } })
  });
  const frozenWrite = await frozenArchiveWrite.json() as { code?: string; message?: string };
  assert.equal(frozenArchiveWrite.status, 423, JSON.stringify(frozenWrite));
  assert.equal(frozenWrite.code, 'WORKSPACE_FROZEN', 'the Worker rejects record mutation after archive sealing');
  assert.equal(server.db.prepare('SELECT COUNT(*) AS count FROM archive_assembly_notes WHERE workspace_id=? AND engagement_id=?')
    .bind(fixture.workspaceId, fixture.engagementId).first<{ count: number }>()?.count, 1, 'the denied post-seal mutation leaves no partial note');

  await switchActor(fixture.clientActorId, 'CLIENT');
  await waitFor('the sealed client portal remains read-only with archive status available', `(() => {
    const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    return report?.innerText.includes('Read only') && report.innerText.includes('ARCHIVED READ ONLY') && report.innerText.includes('SEALED');
  })()`);
  const archivedPortalControls = await tab.evaluate<{ enabledFileInputs: number; enabledUploadButtons: number }>(`(() => {
    const report=document.querySelector('#business-reporting-${fixture.engagementId}')?.closest('section');
    return { enabledFileInputs:[...(report?.querySelectorAll('input[type="file"]')??[])].filter(item=>!item.disabled).length,
      enabledUploadButtons:[...(report?.querySelectorAll('button')??[])].filter(item=>/upload|submit signed return/i.test(item.textContent??'')&&!item.disabled).length };
  })()`);
  assert.deepEqual(archivedPortalControls, { enabledFileInputs: 0, enabledUploadButtons: 0 });
  } catch (error) {
    console.error('Worker-backed reporting journey failed:', error);
    throw error;
  }
});
