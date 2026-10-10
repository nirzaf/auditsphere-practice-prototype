import assert from 'node:assert/strict';
import { it } from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { sha256Hex } from '../../worker/http.js';
import { renderRepresentationTemplateDocx } from '../../worker/reportingRepresentationDocument.js';
import { processBusinessReportingDocument } from '../../worker/businessReportingJobs.js';
import type { Env } from '../../worker/env.js';

it('US-REP-004 generates an editable DOCX with entity, period, approved figures and named signatories',async()=>{
  const approvedClauses=['Synthetic approved clause A for the reporting-period representation fixture.', 'Synthetic approved clause B for completeness and disclosure fixture coverage.'];
  const approvedClausesHash=await sha256Hex(JSON.stringify(approvedClauses));
  const bytes=await renderRepresentationTemplateDocx({clientName:'Northstar Trading LLC',engagementCode:'ENG-26047',periodStart:'2025-01-01',periodEnd:'2025-12-31',
    proposedReportDate:'2026-10-07',signatories:['Amina Rahman','Omar Salem'],statementSnapshotId:'snapshot-approved-7',statementSourceHash:'a'.repeat(64),
    approvedClauses,approvedClausesHash,
    figures:[{label:'Statement of financial position · assets',current:'QAR 1,250.00',comparative:'QAR 1,100.00'},
      {label:'Statement of profit or loss · revenue',current:'QAR 2,400.00',comparative:null}]});
  assert.ok(bytes.byteLength>2_000);
  const entries=unzipSync(bytes);
  assert.ok(entries['[Content_Types].xml']);
  assert.ok(entries['word/document.xml']);
  const document=strFromU8(entries['word/document.xml']);
  for(const text of ['Northstar Trading LLC','2025-01-01','2025-12-31','ENG-26047','QAR 1,250.00','Amina Rahman','Omar Salem','DRAFT TEMPLATE',
    'Firm-approved management representations',approvedClausesHash,...approvedClauses]) {
    assert.ok(document.includes(text),`missing representation text: ${text}`);
  }
  assert.ok(!document.includes('We have fulfilled our responsibilities'), 'the generated letter does not substitute unapproved built-in legal wording');
});

it('US-REP-004 stores the generated Worker template as an immutable DOCX file and artifact',async()=>{
  const requestId='11111111-1111-4111-8111-111111111111',engagementId='22222222-2222-4222-8222-222222222222';
  const clientId='33333333-3333-4333-8333-333333333333',workspaceId='44444444-4444-4444-8444-444444444444';
  const approvedClauses=['Synthetic approved clause A for the reporting-period representation fixture.'];
  const approvedClausesHash=await sha256Hex(JSON.stringify(approvedClauses)),approvalRationale='Synthetic test approval for the fixture wording only.',approvedByActorId='55555555-5555-4555-8555-555555555555';
  const request={id:requestId,client_id:clientId,engagement_id:engagementId,proposed_report_date:'2026-10-07',required_signatories_json:'["Amina Rahman"]',
    dependency_hash:'a'.repeat(64),status:'PREPARING',code:'ENG-26047',period_start:'2025-01-01',period_end:'2025-12-31',engagement_type:'STATUTORY_AUDIT',
    client_name:'Northstar Trading LLC',firm_name:'Example Audit Firm',template_approval_id:'66666666-6666-4666-8666-666666666666',clauses_json:JSON.stringify(approvedClauses),
    clauses_hash:approvedClausesHash,approval_rationale:approvalRationale,approval_source_hash:await sha256Hex(JSON.stringify({approvedClauses,approvalRationale,approvedByActorId})),approved_by_actor_id:approvedByActorId};
  const prepared:Array<{sql:string;values:unknown[]}> = [];
  const db:any={prepare(sql:string){
    const statement:any={sql,values:[] as unknown[],bind(...values:unknown[]){statement.values=values;prepared.push({sql,values});return statement;},
      async first(){if(sql.includes('FROM representation_requests r')&&sql.includes('JOIN representation_template_approvals'))return request;
        if(sql.includes('FROM financial_statement_approvals a'))return {id:'snapshot-approved-7',source_hash:'b'.repeat(64)};return null;},
      async all(){return {results:[{statement:'BALANCE_SHEET',category:'ASSET',current_minor:125000,comparative_minor:110000}]};}};
    return statement;
  }};
  const objects=new Map<string,Uint8Array>();
  const files:any={async put(key:string,bytes:Uint8Array){objects.set(key,new Uint8Array(bytes));},async get(key:string){const bytes=objects.get(key);return bytes?{async arrayBuffer(){return bytes.slice().buffer;}}:null;}};
  const env={DB:db,FILES:files} as unknown as Env;
  let committed:any;
  const handled=await processBusinessReportingDocument(env,{id:'job-1',workspace_id:workspaceId,aggregate_id:requestId,aggregate_version:1,lease_until:'lease-1'},
    {documentType:'REPRESENTATION_TEMPLATE',requestId,templateApprovalId:request.template_approval_id,approvedClausesHash,engagementId,clientId,dependencyHash:request.dependency_hash},async mutation=>{committed=mutation;});
  assert.equal(handled,true);
  assert.equal(committed.entityType,'REPRESENTATION_REQUEST');
  assert.equal(committed.result.fileVersionId.length,36);
  const fileInsert=prepared.find(statement=>statement.sql.includes('INSERT INTO file_versions'))!;
  assert.ok(fileInsert.values.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  assert.ok(String(fileInsert.values.find(value=>typeof value==='string'&&value.endsWith('.docx'))).endsWith('.docx'));
  const object=[...objects.values()][0];
  const entries=unzipSync(object);
  assert.ok(entries['word/document.xml']);
  assert.ok(committed.statements.some((statement:any)=>String(statement.sql??'').includes('INSERT INTO generated_artifacts')));
});
