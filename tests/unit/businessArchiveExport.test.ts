import assert from 'node:assert/strict';
import { it } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { getBusinessArchiveExport, getBusinessArchiveStatus } from '../../worker/businessReportingQuery.js';
import type { Env } from '../../worker/env.js';

const workspaceId='33333333-3333-4333-8333-333333333333';
const engagementId='44444444-4444-4444-8444-444444444444';
const actorId='77777777-7777-4777-8777-777777777777';
const manifestId='88888888-8888-4888-8888-888888888888';
const archiveId='99999999-9999-4999-8999-999999999999';

async function sha256(bytes:Uint8Array):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',bytes.slice().buffer);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function context(persona:'REVIEWER'|'CLIENT'='REVIEWER'){
  return {actor:{id:actorId,persona,staffGrade:persona==='REVIEWER'?'MANAGER':null,clientId:persona==='CLIENT'?'55555555-5555-4555-8555-555555555555':null},
    scope:{clientId:'55555555-5555-4555-8555-555555555555',engagementId},allowedActions:['reporting.read'],readOnlyReasons:[]} as any;
}

async function archiveEnv(options:{tamperManifest?:boolean;streamArchive?:boolean;largeArchive?:boolean;badArchiveChecksum?:boolean}={}){
  const manifest={format:'AuditSphere sealed archive manifest v1',engagementId,bundleId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    auditChainHead:'b'.repeat(64),recordCount:0,files:[]};
  const manifestBytes=strToU8(JSON.stringify(manifest));
  const archiveBytes=zipSync({'manifest.json':manifestBytes});
  const storedArchiveSize=options.largeArchive?129*1024*1024:archiveBytes.byteLength;
  const manifestHash=await sha256(manifestBytes),archiveHash=await sha256(archiveBytes);
  const storedManifest=options.tamperManifest?strToU8(JSON.stringify({...manifest,recordCount:1})):manifestBytes;
  const rows=[
    {id:manifestId,original_name:'archive-manifest.json',media_type:'text/plain',size_bytes:manifestBytes.byteLength,sha256:manifestHash,
      object_key:'manifest-object',purpose:'ARCHIVE',immutable:1,state:'COMMITTED'},
    {id:archiveId,original_name:'sealed-audit-archive.zip',media_type:'application/zip',size_bytes:storedArchiveSize,sha256:archiveHash,
      object_key:'archive-object',purpose:'ARCHIVE',immutable:1,state:'COMMITTED'}
  ];
  const inserted:Array<unknown[]> = [];
  const stats={archiveArrayBufferCalls:0};
  const db:any={prepare(sql:string){
    const statement:any={bind(...values:unknown[]){statement.values=values;return statement;},
      async first(){return {id:engagementId,client_id:'55555555-5555-4555-8555-555555555555',lifecycle_state:'ARCHIVED_READ_ONLY',locked_at:'2026-10-01T00:00:00.000Z',
        run_status:'SEALED',seal_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',bundle_id:manifest.bundleId,manifest_file_id:manifestId,archive_file_id:archiveId,
        manifest_sha256:manifestHash,archive_sha256:archiveHash,audit_chain_head:manifest.auditChainHead,record_count:0,file_count:0};},
      async all(){return {results:rows};},
      async run(){inserted.push([sql,...(statement.values??[])]);return {success:true};}};
    return statement;
  }};
  const env={DB:db,FILES:{async get(key:string){const bytes=key==='manifest-object'?storedManifest:key==='archive-object'?archiveBytes:null;
    if(!bytes)return null;
    return {size:key==='archive-object'?storedArchiveSize:bytes.byteLength,...(key==='archive-object'&&options.streamArchive?{
      checksums:{sha256:Uint8Array.from(archiveHash.match(/.{2}/g)!.map(value=>Number.parseInt(value,16))).map((value,index)=>options.badArchiveChecksum&&index===0?value^0xff:value).buffer},
      body:new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes.slice());controller.close();}})
    }:{}),async arrayBuffer(){if(key==='archive-object')stats.archiveArrayBufferCalls++;return bytes.slice().buffer;}};}}} as unknown as Env;
  return {env,archiveBytes,manifestBytes,manifestHash,archiveHash,inserted,stats};
}

it('US-REP-007 exposes read-only status without client archive hashes and logs access separately',async()=>{
  const {env,inserted}=await archiveEnv();
  const status=await getBusinessArchiveStatus(env,workspaceId,context('CLIENT'),engagementId,'2026-10-07T12:00:00.000Z');
  assert.equal(status.sealed,true);
  assert.equal(status.effectiveReadOnly,true);
  assert.deepEqual(status.missingFiles,[]);
  assert.equal('archiveSha256' in status,false);
  assert.equal('manifestSha256' in status,false);
  assert.equal(inserted.length,1);
  assert.equal(inserted[0][6],'READ');
});

it('US-REP-007 restricts exports to review roles and rechecks the immutable ZIP and manifest',async()=>{
  const {env,archiveBytes,manifestBytes,archiveHash,manifestHash,inserted}=await archiveEnv();
  await assert.rejects(()=>getBusinessArchiveExport(env,workspaceId,context('CLIENT'),engagementId),
    (error:unknown)=>Boolean(error&&typeof error==='object'&&(error as {code?:string}).code==='PERSONA_ACTION_DENIED'));
  const archive=await getBusinessArchiveExport(env,workspaceId,context(),engagementId);
  assert.deepEqual(archive.bytes,archiveBytes);
  assert.equal(archive.archiveSha256,archiveHash);
  assert.equal(archive.manifestSha256,manifestHash);
  const manifest=await getBusinessArchiveExport(env,workspaceId,context(),engagementId,'manifest');
  assert.deepEqual(manifest.bytes,manifestBytes);
  assert.equal(inserted.length,2);
  assert.ok(inserted.every(row=>row[6]==='EXPORT'));
});

it('streams a checksummed archive from R2 without buffering the ZIP in the Worker',async()=>{
  const {env,archiveBytes,archiveHash,stats}=await archiveEnv({streamArchive:true});
  const archive=await getBusinessArchiveExport(env,workspaceId,context(),engagementId);
  assert.equal(archive.archiveSha256,archiveHash);
  assert.equal(archive.bytes,undefined);
  assert.ok(archive.body);
  assert.equal(stats.archiveArrayBufferCalls,0);
  assert.deepEqual(new Uint8Array(await new Response(archive.body).arrayBuffer()),archiveBytes);
});

it('allows a large checksummed archive to stream without the legacy 128 MiB buffer limit',async()=>{
  const {env,stats}=await archiveEnv({streamArchive:true,largeArchive:true});
  const archive=await getBusinessArchiveExport(env,workspaceId,context(),engagementId);
  assert.equal(archive.sizeBytes,129*1024*1024);
  assert.ok(archive.body);
  assert.equal(stats.archiveArrayBufferCalls,0);
});

it('rejects a checksummed R2 archive whose stored checksum differs from its seal',async()=>{
  const {env,stats}=await archiveEnv({streamArchive:true,badArchiveChecksum:true});
  await assert.rejects(()=>getBusinessArchiveExport(env,workspaceId,context(),engagementId),
    (error:unknown)=>Boolean(error&&typeof error==='object'&&(error as {code?:string}).code==='INTEGRITY_MISMATCH'));
  assert.equal(stats.archiveArrayBufferCalls,0);
});

it('US-REP-007 rejects stored manifest bytes that do not match the separate seal',async()=>{
  const {env}=await archiveEnv({tamperManifest:true});
  await assert.rejects(()=>getBusinessArchiveExport(env,workspaceId,context(),engagementId),
    (error:unknown)=>Boolean(error&&typeof error==='object'&&(error as {code?:string}).code==='INTEGRITY_MISMATCH'));
});
