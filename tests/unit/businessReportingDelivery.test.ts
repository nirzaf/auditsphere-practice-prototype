import assert from 'node:assert/strict';
import { it } from 'node:test';
import { buildBusinessReportingMutation, businessReportingCommands } from '../../worker/businessReporting.js';
import type { Env } from '../../worker/env.js';

const workspaceId='33333333-3333-4333-8333-333333333333';
const bundleId='11111111-1111-4111-8111-111111111111';
const dispatchId='22222222-2222-4222-8222-222222222222';
const engagementId='44444444-4444-4444-8444-444444444444';
const clientId='55555555-5555-4555-8555-555555555555';
const reportFileId='66666666-6666-4666-8666-666666666666';
const digest='a'.repeat(64);

function reportingContext(persona:'APPROVER'|'REVIEWER'|'CLIENT'='REVIEWER'){
  return { actor:{id:'77777777-7777-4777-8777-777777777777',persona,staffGrade:persona==='APPROVER'?'PARTNER':persona==='CLIENT'?null:'MANAGER',clientId:persona==='CLIENT'?clientId:null},
    scope:{clientId,engagementId},allowedActions:['reporting.read'],readOnlyReasons:[] } as any;
}

function deliveryEnv(dispatchAccepted=true,retryStatus='FAILED',retryJobStatus='PERMANENT_FAILED'){
  const sql:string[]=[];
  const reportBundle={id:bundleId,client_id:clientId,engagement_id:engagementId,released_at:'2026-10-01T09:00:00.000Z',lifecycle_state:'COMPLIANCE_COUNTDOWN',
    locked_at:null,archive_due_at:'2026-11-30T09:00:00.000Z',report_file_id:reportFileId,report_sha256:digest,file_sha256:digest,report_immutable:1};
  const db:any={prepare(query:string){
    sql.push(query);
    const statement:any={bind(..._values:unknown[]){return statement;},async first(){
      if(query.includes('FROM deliverable_bundles b JOIN engagements e'))return reportBundle;
      if(query.includes("FROM dispatches WHERE workspace_id=? AND id=? AND client_id=?"))return dispatchAccepted?{id:dispatchId}:null;
      if(query.includes('FROM dispatches d JOIN outbox_jobs j'))return {id:dispatchId,version:1,client_id:clientId,engagement_id:engagementId,
        file_version_id:reportFileId,recipient_snapshot_json:JSON.stringify({contactRouteId:'route-1',contactRouteVersion:1,contactId:'contact-1',name:'Morgan Sample',email:'morgan@example.invalid'}),
        status:retryStatus,job_id:'job-1',job_status:retryJobStatus,kind:'EMAIL',payload_json:JSON.stringify({documentType:'COMMERCIAL_EMAIL',purpose:'BUNDLE',fileVersionId:reportFileId})};
      if(query.includes('SELECT COUNT(*) AS count FROM dispatches'))return {count:1};
      throw new Error(`Unexpected first() query: ${query}`);
    }};
    return statement;
  }};
  return {env:{DB:db} as unknown as Env,sql};
}

const deliverySchema=businessReportingCommands.find(schema=>schema.shape.type.value==='bundle.record-delivery')!;
const retrySchema=businessReportingCommands.find(schema=>schema.shape.type.value==='bundle.delivery.retry')!;

it('US-REP-005 validates delivery methods and records provider-accepted email without changing lifecycle dates',async()=>{
  const email={type:'bundle.record-delivery',payload:{bundleId,method:'EMAIL',dispatchId,evidenceFileId:null}};
  assert.doesNotThrow(()=>deliverySchema.parse(email));
  assert.throws(()=>deliverySchema.parse({type:'bundle.record-delivery',payload:{bundleId,method:'SMS'}}));
  const {env,sql}=deliveryEnv();
  const mutation=await buildBusinessReportingMutation(env,workspaceId,reportingContext(),email as any,'command-1','2026-10-07T12:00:00.000Z');
  assert.equal(mutation.entityType,'BUNDLE_DELIVERY');
  assert.equal(mutation.result.method,'EMAIL');
  assert.equal(mutation.result.bundleId,bundleId);
  assert.equal(mutation.result.deliveredAt,'2026-10-07T12:00:00.000Z');
  assert.ok(mutation.statements.length>=2);
  assert.ok(sql.every(statement=>!statement.includes('UPDATE engagements')),'recording delivery must not change the compliance clock');
});

it('US-REP-005 requires provider acceptance and permits a scoped CLIENT portal acknowledgement only',async()=>{
  const email={type:'bundle.record-delivery',payload:{bundleId,method:'EMAIL',dispatchId,evidenceFileId:null}};
  await assert.rejects(()=>buildBusinessReportingMutation(deliveryEnv(false).env,workspaceId,reportingContext(),email as any,'command-2','2026-10-07T12:00:00.000Z'),
    (error:unknown)=>Boolean(error&&typeof error==='object'&&(error as {code?:string}).code==='GATE_BLOCKED'));
  const clientAck={type:'bundle.record-delivery',payload:{bundleId,method:'PORTAL_ACKNOWLEDGEMENT',dispatchId:null,evidenceFileId:null}};
  const result=await buildBusinessReportingMutation(deliveryEnv().env,workspaceId,reportingContext('CLIENT'),clientAck as any,'command-3','2026-10-07T12:00:00.000Z');
  assert.equal(result.entityType,'BUNDLE_DELIVERY');
  assert.equal(result.result.method,'PORTAL_ACKNOWLEDGEMENT');
  const clientEmail={...email,payload:{...email.payload,method:'EMAIL'}};
  await assert.rejects(()=>buildBusinessReportingMutation(deliveryEnv().env,workspaceId,reportingContext('CLIENT'),clientEmail as any,'command-4','2026-10-07T12:00:00.000Z'),
    (error:unknown)=>Boolean(error&&typeof error==='object'&&(error as {code?:string}).code==='PERSONA_ACTION_DENIED'));
});

it('US-REP-005 retries only a definitively failed email with the same immutable report and no invoice or deadline mutation',async()=>{
  const retry={type:'bundle.delivery.retry',payload:{bundleId,dispatchId,expectedDispatchVersion:1}};
  assert.doesNotThrow(()=>retrySchema.parse(retry));
  assert.throws(()=>retrySchema.parse({type:'bundle.delivery.retry',payload:{bundleId,dispatchId,expectedDispatchVersion:0}}));
  const {env,sql}=deliveryEnv();
  const mutation=await buildBusinessReportingMutation(env,workspaceId,reportingContext('APPROVER'),retry as any,'command-5','2026-10-07T12:00:00.000Z');
  assert.equal(mutation.entityType,'DISPATCH');
  assert.equal(mutation.result.status,'QUEUED');
  assert.equal(mutation.result.retryOfDispatchId,dispatchId);
  assert.equal(mutation.statements.length,3,'the retry writes one assertion, outbox job and new dispatch');
  assert.ok(sql.every(statement=>!statement.includes('UPDATE engagements')&&!statement.includes('INSERT INTO invoices')),
    'a retry leaves the released report deadline and final invoice untouched');
  await assert.rejects(()=>buildBusinessReportingMutation(deliveryEnv(false,'UNKNOWN','RUNNING').env,workspaceId,reportingContext('APPROVER'),retry as any,'command-6','2026-10-07T12:00:00.000Z'),
    (error:unknown)=>Boolean(error&&typeof error==='object'&&(error as {code?:string}).code==='INVALID_STATE'));
});
