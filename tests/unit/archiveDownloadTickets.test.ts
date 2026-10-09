import assert from 'node:assert/strict';
import { it } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { consumeBusinessArchiveDownloadTicket, createBusinessArchiveDownloadTicket } from '../../worker/businessReportingQuery.js';
import { sha256Hex } from '../../worker/http.js';
import type { Env } from '../../worker/env.js';

const workspaceId='33333333-3333-4333-8333-333333333333';
const engagementId='44444444-4444-4444-8444-444444444444';
const actorId='77777777-7777-4777-8777-777777777777';
const manifestId='88888888-8888-4888-8888-888888888888';
const archiveId='99999999-9999-4999-8999-999999999999';
const at='2026-10-08T12:00:00.000Z';

async function digest(bytes:Uint8Array):Promise<string>{
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function reviewContext(persona:'REVIEWER'|'APPROVER'|'CLIENT'='REVIEWER'){
  return {actor:{id:actorId,persona,displayName:'Reviewer',staffGrade:persona==='APPROVER'?'PARTNER':'MANAGER',clientId:null,staffMemberId:null},
    scope:{clientId:'55555555-5555-4555-8555-555555555555',engagementId},allowedActions:['reporting.read'],readOnlyReasons:[]} as any;
}

async function ticketEnv(sealed=true){
  const manifest={format:'AuditSphere sealed archive manifest v1',engagementId,bundleId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auditChainHead:'b'.repeat(64),recordCount:0,files:[]};
  const manifestBytes=strToU8(JSON.stringify(manifest));
  const manifestHash=await digest(manifestBytes);
  const archiveBytes=zipSync({'manifest.json':manifestBytes});
  const archiveHash=await digest(archiveBytes);
  const files=[
    {id:manifestId,original_name:'archive-manifest.json',media_type:'text/plain',size_bytes:manifestBytes.byteLength,sha256:manifestHash,object_key:'manifest',purpose:'ARCHIVE',immutable:1,state:'COMMITTED'},
    {id:archiveId,original_name:'sealed-audit-archive.zip',media_type:'application/zip',size_bytes:archiveBytes.byteLength,sha256:archiveHash,object_key:'archive',purpose:'ARCHIVE',immutable:1,state:'COMMITTED'}
  ];
  const tickets=new Map<string,Record<string,unknown>>();
  const used=new Set<string>();
  const writes:Array<{sql:string;values:unknown[]}> = [];
  const seal={id:engagementId,client_id:'55555555-5555-4555-8555-555555555555',lifecycle_state:sealed?'ARCHIVED_READ_ONLY':'COMPLIANCE_COUNTDOWN',locked_at:sealed?at:null,
    run_status:sealed?'SEALED':'ASSEMBLING',seal_id:sealed?'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb':null,bundle_id:manifest.bundleId,
    manifest_file_id:manifestId,archive_file_id:archiveId,manifest_sha256:manifestHash,archive_sha256:archiveHash,audit_chain_head:manifest.auditChainHead,record_count:0,file_count:0};
  const db:any={prepare(sql:string){
    const statement:any={values:[] as unknown[],bind(...values:unknown[]){statement.values=values;return statement;},
      async first(){
        const values=statement.values as unknown[];
        if(sql.includes('FROM engagements e LEFT JOIN archive_runs r')&&sql.includes('assembly_status'))return {id:engagementId,client_id:seal.client_id,
          lifecycle_state:seal.lifecycle_state,report_signed_at:at,report_date:'2026-10-08',archive_due_at:'2026-12-07T12:00:00.000Z',locked_at:seal.locked_at,
          run_id:'run',assembly_status:seal.run_status,missing_files_json:'[]',error_code:null,seal_id:seal.seal_id,sealed_at:seal.locked_at};
        if(sql.includes('FROM archive_download_tickets WHERE token_sha256=?'))return [...tickets.values()].find(row=>row.token_sha256===values[0]&&String(row.expires_at)>String(values[1]))??null;
        if(sql.startsWith('INSERT INTO archive_download_ticket_uses')){
          const ticketId=String(values[1]);
          if(used.has(ticketId))return null;
          const row=tickets.get(ticketId);if(!row||String(row.expires_at)<=String(values[6])||row.token_sha256!==values[5])return null;
          used.add(ticketId);writes.push({sql,values});return {ticket_id:ticketId};
        }
        if(sql.includes('FROM actor_profiles ap JOIN staff_members'))return {persona:'REVIEWER',active:1,grade:'MANAGER',staff_active:1};
        if(sql.includes('FROM engagements e LEFT JOIN archive_runs r')&&sql.includes('run_status'))return seal;
        return null;
      },
      async all(){return {results:files};},
      async run(){
        const values=statement.values as unknown[];writes.push({sql,values});
        if(sql.startsWith('INSERT INTO archive_download_tickets'))tickets.set(String(values[1]),{
          workspace_id:values[0],id:values[1],token_sha256:values[2],engagement_id:values[3],actor_id:values[4],actor_persona:values[5],actor_staff_grade:values[6],expires_at:values[7],created_at:values[8]
        });
        return {success:true};
      }};
    return statement;
  }};
  const env={DB:db,FILES:{async get(key:string){
    const bytes=key==='manifest'?manifestBytes: key==='archive'?archiveBytes:null;
    if(!bytes)return null;
    return {size:bytes.byteLength,body:new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes.slice());controller.close();}}),async arrayBuffer(){return bytes.slice().buffer;}};
  }}} as unknown as Env;
  return {env,manifestBytes,archiveBytes,tickets,used,writes};
}

it('issues a five-minute single-use native-download ticket without storing its bearer token in a URL',async()=>{
  const {env,tickets,writes}=await ticketEnv();
  const issued=await createBusinessArchiveDownloadTicket(env,workspaceId,reviewContext(),engagementId,at);
  const token=issued.token;
  assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal('downloadUrl' in issued,false);
  assert.equal(issued.expiresAt,'2026-10-08T12:05:00.000Z');
  const ticket=[...tickets.values()][0]!;
  assert.equal(ticket.token_sha256,await sha256Hex(token));
  assert.notEqual(ticket.token_sha256,token);
  assert.equal(writes.some(write=>write.sql.startsWith('INSERT INTO archive_download_tickets')),true);
  await assert.rejects(()=>createBusinessArchiveDownloadTicket(env,workspaceId,reviewContext('CLIENT'),engagementId,at),/Only a Reviewer or Partner/);
  const {env:unsealed}=await ticketEnv(false);
  await assert.rejects(()=>createBusinessArchiveDownloadTicket(unsealed,workspaceId,reviewContext(),engagementId,at),/successfully sealed archive/);
});

it('consumes a native-download ticket once, rechecks the seal, and streams verified bytes',async()=>{
  const {env,archiveBytes,tickets,used}=await ticketEnv();
  const issued=await createBusinessArchiveDownloadTicket(env,workspaceId,reviewContext(),engagementId,at);
  const token=issued.token;
  const download=await consumeBusinessArchiveDownloadTicket(env,token,'2026-10-08T12:01:00.000Z');
  assert.equal(download.sizeBytes,archiveBytes.byteLength);
  assert.equal(download.fileName,'sealed-audit-archive.zip');
  assert.deepEqual(new Uint8Array(await new Response(download.body).arrayBuffer()),archiveBytes);
  assert.equal(used.size,1);
  await assert.rejects(()=>consumeBusinessArchiveDownloadTicket(env,token,'2026-10-08T12:01:01.000Z'),/invalid, expired, or already used/);
  assert.equal(used.size,1);
});

it('rejects expired, malformed and unknown native-download capabilities',async()=>{
  const {env}=await ticketEnv();
  await assert.rejects(()=>consumeBusinessArchiveDownloadTicket(env,'not-a-token',at),/invalid or expired/);
  await assert.rejects(()=>consumeBusinessArchiveDownloadTicket(env,'a'.repeat(64),'2026-10-08T12:06:00.000Z'),/invalid or expired/);
});
