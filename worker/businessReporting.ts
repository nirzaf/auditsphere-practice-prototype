// Version-pinned report preparation, publication, and archive lifecycle.
// Persona checks here are workflow checks only; the deployment has no identity assurance.
import * as z from 'zod';
import type { Env } from './env';
import { ApiError } from './errors';
import { sha256Hex } from './http';
import type { BusinessContext, BusinessMutation } from './business';
import { renderReportingPdf, type ReportingPdfInput } from './reportingDocument';
import { prepareBusinessInvoiceJournal } from './businessPractice';

const id=z.uuid(),date=z.iso.date(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const text=(min=10,max=10000)=>z.string().trim().min(min).max(max);
const phases=['COMMERCIAL','PLANNING','FIELDWORK','REVIEW','REPORTING','ARCHIVE'] as const;
const affected=z.strictObject({fsliId:id,amountMinor:z.string().regex(/^-?(0|[1-9]\d{0,15})$/).nullable().optional(),explanation:text(10)});
const opinionSelect=z.strictObject({type:z.literal('opinion.select'),payload:z.strictObject({engagementId:id,category:z.enum(['UNMODIFIED','QUALIFIED','DISCLAIMER','ADVERSE']).optional(),
  affectedFslis:z.array(affected).max(100).default([]),rationale:text(10),materialityAssessment:text(10),pervasivenessAssessment:text(10),basisText:z.string().trim().max(10000).optional(),
  goingConcernReportingText:z.string().trim().max(10000).optional(),additionalSections:z.array(z.strictObject({heading:text(1,200),body:text(10,5000)})).max(30).default([]),
  aupReportType:z.string().trim().min(1).max(200).optional(),aupProcedureSummary:text(20).optional()})});
const signatureRegister=z.strictObject({type:z.literal('signature-asset.register'),payload:z.strictObject({staffMemberId:id,signatureFileId:id,sealFileId:id,label:z.string().trim().min(1).max(200)})});
const fsSave=z.strictObject({type:z.literal('financial-statements.save-disclosures'),payload:z.strictObject({engagementId:id,statementSnapshotId:id,accountingPolicies:text(20,30000),ociApplicable:z.boolean(),
  notes:z.array(z.strictObject({noteNumber:z.string().trim().min(1).max(40),title:z.string().trim().min(1).max(300),body:text(10,30000),amountMinor:z.string().regex(/^-?(0|[1-9]\d{0,15})$/).nullable().optional(),supportingFileId:id.nullable().optional(),sortOrder:z.number().int().min(0).max(5000)})).max(200),
  supplementLines:z.array(z.strictObject({section:z.enum(['CASH_FLOW','EQUITY_CHANGE','OCI']),code:z.string().trim().min(1).max(80),label:z.string().trim().min(1).max(500),currentMinor:z.string().regex(/^-?(0|[1-9]\d{0,15})$/),priorMinor:z.string().regex(/^-?(0|[1-9]\d{0,15})$/).nullable().optional(),supportingFileId:id.nullable().optional(),rationale:text(10,10000)})).max(500)})});
const fsApprove=z.strictObject({type:z.literal('financial-statements.approve'),payload:z.strictObject({draftId:id,sourceHash:hash})});
const reportPrepare=z.strictObject({type:z.literal('report.prepare'),payload:z.strictObject({engagementId:id,opinionVersionId:id,financialStatementApprovalId:id,signatureAssetId:id,proposedReportDate:date})});
const reportConsent=z.strictObject({type:z.literal('report.consent'),payload:z.strictObject({engagementId:id,reportCandidateId:id,signatureAssetId:id,candidateContentHash:hash,proposedReportDate:date,consentText:text(10,10000)})});
const managementPrepare=z.strictObject({type:z.literal('management-letter.prepare'),payload:z.strictObject({engagementId:id,items:z.array(z.strictObject({findingId:id,impact:text(10,10000),recommendation:text(10,10000),responsibleParty:z.string().trim().max(300).optional(),targetDate:date.optional()})).max(300),noReportableDeficienciesReason:z.string().trim().max(10000).optional()})});
const representationPrepare=z.strictObject({type:z.literal('representation.prepare'),payload:z.strictObject({engagementId:id,proposedReportDate:date,requiredSignatories:z.array(z.string().trim().min(1).max(200)).min(1).max(20),contactRouteId:id})});
const representationSend=z.strictObject({type:z.literal('representation.send'),payload:z.strictObject({requestId:id})});
const representationReceive=z.strictObject({type:z.literal('representation.receive'),payload:z.strictObject({requestId:id,signedFileId:id,representationDate:date,signatoryNames:text(1,2000)})});
const representationReview=z.strictObject({type:z.literal('representation.review'),payload:z.strictObject({requestId:id,returnId:id,decision:z.enum(['ACCEPT','REJECT']),reviewReason:text(10),dependencyHash:hash,
  identityConfirmed:z.boolean(),capacityConfirmed:z.boolean(),completenessConfirmed:z.boolean(),periodConfirmed:z.boolean(),dateConfirmed:z.boolean(),consistencyConfirmed:z.boolean()})});
const bundlePrepare=z.strictObject({type:z.literal('bundle.prepare'),payload:z.strictObject({engagementId:id,reportCandidateId:id,managementLetterVersionId:id,representationRequestId:id})});
const reportRelease=z.strictObject({type:z.literal('report.release'),payload:z.strictObject({candidateId:id,expectedContentHash:hash,proposedReportDate:date})});
const retentionSave=z.strictObject({type:z.literal('retention-policy.save'),payload:z.strictObject({name:z.string().trim().min(1).max(200),retentionYears:z.number().int().positive().max(100).nullable(),retainIndefinitely:z.boolean(),legalBasis:text(10)})});
const archiveLock=z.strictObject({type:z.literal('archive.lock'),payload:z.strictObject({engagementId:id,reason:z.literal('EARLY_PARTNER_LOCK'),rationale:text(10)})});
const archiveNote=z.strictObject({type:z.literal('archive.note'),payload:z.strictObject({engagementId:id,text:text(10),relatedRecordType:z.string().trim().min(1).max(120),relatedRecordId:id})});

export const businessReportingCommands=[opinionSelect,signatureRegister,fsSave,fsApprove,reportPrepare,reportConsent,managementPrepare,representationPrepare,representationSend,representationReceive,representationReview,bundlePrepare,reportRelease,retentionSave,archiveLock,archiveNote] as const;
export type BusinessReportingCommand=z.infer<(typeof businessReportingCommands)[number]>;
export function isBusinessReportingCommand(command:{type:string}):command is BusinessReportingCommand{return businessReportingCommands.some(schema=>schema.shape.type.value===command.type);}

function partner(context:BusinessContext):void{if(context.actor.persona!=='APPROVER'||context.actor.staffGrade!=='PARTNER')throw new ApiError('PERSONA_ACTION_DENIED','Only a PARTNER APPROVER can make this reporting decision.');}
function reviewer(context:BusinessContext):void{if(!(context.actor.persona==='REVIEWER'||context.actor.persona==='APPROVER'&&context.actor.staffGrade==='PARTNER'))throw new ApiError('PERSONA_ACTION_DENIED','A REVIEWER or PARTNER APPROVER is required.');}
async function sha256BytesHex(bytes:Uint8Array):Promise<string>{
  const copy=new ArrayBuffer(bytes.byteLength);new Uint8Array(copy).set(bytes);
  const digest=await crypto.subtle.digest('SHA-256',copy);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
function mut(statements:D1PreparedStatement[],result:Record<string,unknown>,entityType:string,entityId:string,beforeVersion:number|null,afterVersion:number,details?:Record<string,unknown>):BusinessMutation{
  return {statements,result,entityType,entityId,beforeVersion,afterVersion,auditDetails:details};
}
function assertDb(env:Env,workspaceId:string,seq:number,sql:string,...values:unknown[]):D1PreparedStatement{
  return env.DB.prepare(`INSERT INTO command_assertions(workspace_id,seq,ok) SELECT ?,?,CASE WHEN (${sql}) THEN 1 ELSE 0 END`).bind(workspaceId,seq,...values);
}
function outboxJob(env:Env,workspaceId:string,idValue:string,aggregateId:string,aggregateVersion:number,payload:Record<string,unknown>,dedup:string,now:string,kind:'GENERATE_DOCUMENT'|'SEAL_ARCHIVE'='GENERATE_DOCUMENT'):D1PreparedStatement{
  return env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
    VALUES(?,?,1,?,?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
    .bind(idValue,workspaceId,kind,aggregateId,aggregateVersion,JSON.stringify(payload),dedup,now,now,now);
}
function emailOutboxJob(env:Env,workspaceId:string,idValue:string,aggregateId:string,aggregateVersion:number,payload:Record<string,unknown>,dedup:string,now:string):D1PreparedStatement{
  return env.DB.prepare(`INSERT INTO outbox_jobs(id,workspace_id,version,kind,aggregate_id,aggregate_version,payload_json,deduplication_key,status,attempts,next_attempt_at,lease_until,last_error_code,provider_reference,result_file_id,result_json,completed_at,created_at,updated_at)
    VALUES(?,?,1,'EMAIL',?,?,?,?,'PENDING',0,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`)
    .bind(idValue,workspaceId,aggregateId,aggregateVersion,JSON.stringify(payload),dedup,now,now,now);
}
function addDays(dateValue:string,days:number):string{return new Date(Date.parse(`${dateValue}T00:00:00.000Z`)+days*86_400_000).toISOString().slice(0,10);}
function basisHeading(category:string):string{return category==='QUALIFIED'?'Basis for Qualified Opinion':category==='DISCLAIMER'?'Basis for Disclaimer of Opinion':category==='ADVERSE'?'Basis for Adverse Opinion':'';}
function currentQatarDate():string{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
async function engagementRow(env:Env,workspaceId:string,context:BusinessContext,engagementId:string){
  const row=await env.DB.prepare(`SELECT e.id,e.version,e.client_id,e.code,e.period_start,e.period_end,e.engagement_type,e.lifecycle_state,e.contract_fee_minor,e.active_proposal_version_id,
      e.active_tb_version_id,e.active_mapping_version_id,e.active_materiality_version_id,e.approved_planning_version_id,e.standards_profile_id,e.report_signed_at,e.report_date,e.released_at,e.archive_due_at,e.locked_at,e.portal_frozen_at,
      c.legal_name AS client_name,fp.legal_name AS firm_name FROM engagements e JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id
      JOIN firm_profiles fp ON fp.workspace_id=e.workspace_id WHERE e.workspace_id=? AND e.id=?`).bind(workspaceId,engagementId)
    .first<Record<string,unknown>&{id:string;version:number;client_id:string;code:string;period_start:string;period_end:string;engagement_type:string;lifecycle_state:string;contract_fee_minor:number;
      active_proposal_version_id:string|null;active_tb_version_id:string|null;active_mapping_version_id:string|null;active_materiality_version_id:string|null;approved_planning_version_id:string|null;standards_profile_id:string;
      locked_at:string|null;portal_frozen_at:string|null;client_name:string;firm_name:string}>();
  if(!row)throw new ApiError('NOT_FOUND','The engagement was not found.');
  if(context.scope.clientId&&context.scope.clientId!==row.client_id||context.scope.engagementId&&context.scope.engagementId!==row.id)throw new ApiError('FORBIDDEN_SCOPE','The engagement is outside the selected scope.');
  return row;
}
async function currentSrm(env:Env,workspaceId:string,engagementId:string){
  const srm=await env.DB.prepare(`SELECT s.*,c.id AS clearance_id,c.dependency_hash AS clearance_hash FROM srm_versions s LEFT JOIN srm_clearances c
    ON c.workspace_id=s.workspace_id AND c.srm_version_id=s.id WHERE s.workspace_id=? AND s.engagement_id=? ORDER BY s.revision DESC,c.signed_at DESC LIMIT 1`)
    .bind(workspaceId,engagementId).first<Record<string,unknown>&{id:string;revision:number;statement_snapshot_id:string;dependency_hash:string;clearance_id:string|null;clearance_hash:string|null}>();
  if(!srm||!srm.clearance_id||srm.clearance_hash!==srm.dependency_hash)throw new ApiError('GATE_BLOCKED','A current Partner-cleared SRM is required before report preparation.');
  return srm;
}
async function reportPins(env:Env,workspaceId:string,engagementId:string){
  const engagement=await env.DB.prepare(`SELECT id,active_tb_version_id,active_mapping_version_id,active_materiality_version_id,approved_planning_version_id,standards_profile_id
    FROM engagements WHERE workspace_id=? AND id=?`).bind(workspaceId,engagementId)
    .first<{id:string;active_tb_version_id:string|null;active_mapping_version_id:string|null;active_materiality_version_id:string|null;approved_planning_version_id:string|null;standards_profile_id:string}>();
  if(!engagement)throw new ApiError('NOT_FOUND','The engagement was not found.');
  const srm=await currentSrm(env,workspaceId,engagementId);
  const snapshot=await env.DB.prepare(`SELECT id,source_hash,tb_version_id,mapping_version_id,standards_profile_id FROM statement_snapshots WHERE workspace_id=? AND id=? AND engagement_id=?`)
    .bind(workspaceId,srm.statement_snapshot_id,engagementId).first<{id:string;source_hash:string;tb_version_id:string;mapping_version_id:string;standards_profile_id:string}>();
  if(!snapshot||snapshot.tb_version_id!==engagement.active_tb_version_id||snapshot.mapping_version_id!==engagement.active_mapping_version_id||snapshot.standards_profile_id!==engagement.standards_profile_id)
    throw new ApiError('STALE_DEPENDENCY','The latest SRM statement snapshot does not match the current TB, mapping and standards profile.');
  const profile=await env.DB.prepare(`SELECT id,presentation_edition,effective_period_start,effective_period_end,content_sha256 FROM standards_profiles WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,engagement.standards_profile_id).first<{id:string;presentation_edition:string;effective_period_start:string;effective_period_end:string|null;content_sha256:string}>();
  if(!profile)throw new ApiError('GATE_BLOCKED','An approved reporting standards profile is required.');
  if(engagement.approved_planning_version_id===null||engagement.active_materiality_version_id===null)throw new ApiError('GATE_BLOCKED','Current planning and materiality pins are required before reporting.');
  return {engagement,srm,snapshot,profile};
}
async function criticalConfirmationBlockers(env:Env,workspaceId:string,engagementId:string){
  const rows=(await env.DB.prepare(`SELECT c.id,c.status,c.tb_version_id,c.mapping_version_id,c.materiality_version_id,c.reliance_frozen,e.active_tb_version_id,e.active_mapping_version_id,e.active_materiality_version_id,
      EXISTS(SELECT 1 FROM confirmation_scope_reassessments r WHERE r.workspace_id=c.workspace_id AND r.prior_confirmation_id=c.id) AS reassessed
    FROM confirmations c JOIN engagements e ON e.workspace_id=c.workspace_id AND e.id=c.engagement_id WHERE c.workspace_id=? AND c.engagement_id=? AND c.critical=1`)
    .bind(workspaceId,engagementId).all<Record<string,unknown>>()).results??[];
  return rows.filter(row=>{
    if(row.status==='CANCELLED'&&Number(row.reassessed)===1)return false;
    return row.status!=='RETURNED_VERIFIED'||row.tb_version_id!==row.active_tb_version_id||row.mapping_version_id!==row.active_mapping_version_id||row.materiality_version_id!==row.active_materiality_version_id;
  }).map(row=>`Critical confirmation ${String(row.id).slice(0,8)} is unresolved, stale or lacks an approved scope reassessment.`);
}
async function readPngAsset(env:Env,workspaceId:string,fileId:string,purpose:'SIGNATURE'|'SEAL'){
  const row=await env.DB.prepare(`SELECT id,media_type,purpose,state,immutable,sha256,size_bytes,object_key FROM file_versions WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,fileId).first<{id:string;media_type:string;purpose:string;state:string;immutable:number;sha256:string;size_bytes:number;object_key:string}>();
  if(!row||row.purpose!==purpose||row.media_type!=='image/png'||row.state!=='COMMITTED'||row.immutable!==1)throw new ApiError('GATE_BLOCKED',`Choose a committed immutable PNG with purpose ${purpose}.`);
  const object=await env.FILES.get(row.object_key);if(!object)throw new ApiError('INTEGRITY_MISMATCH','The signature asset is missing from object storage.');
  const bytes=new Uint8Array(await object.arrayBuffer());if(bytes.byteLength!==row.size_bytes||await sha256BytesHex(bytes)!==row.sha256)throw new ApiError('INTEGRITY_MISMATCH','The signature asset bytes do not match their stored hash.');
  const cleanPng=(data:Uint8Array)=>{
    if(data.length<33||data[0]!==0x89||data[1]!==0x50||data[2]!==0x4e||data[3]!==0x47||new TextDecoder().decode(data.subarray(12,16))!=='IHDR')return null;
    const width=new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(16),height=new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(20);
    if(width<1||height<1||width>4096||height>4096)return null;
    // Reject textual, EXIF, and unknown ancillary chunks instead of retaining untrusted metadata.
    const safe=new Set(['IHDR','IDAT','IEND','PLTE','tRNS','sRGB','gAMA','cHRM','pHYs']);let offset=8;
    while(offset+12<=data.length){const length=new DataView(data.buffer,data.byteOffset+offset,4).getUint32(0),kind=new TextDecoder().decode(data.subarray(offset+4,offset+8));
      if(!safe.has(kind)||length>data.length||offset+12+length>data.length)return null;offset+=12+length;if(kind==='IEND')break;}
    return {width,height};
  };
  const dimensions=cleanPng(bytes);if(!dimensions)throw new ApiError('UNSUPPORTED_MEDIA_TYPE','The PNG contains unsupported metadata or invalid image chunks. Re-export a clean static PNG asset.');
  return {...row,bytes,...dimensions};
}

async function buildOpinionSelect(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'opinion.select'}>,now:string){
  partner(context);const p=command.payload,engagement=await engagementRow(env,workspaceId,context,p.engagementId);
  if(engagement.lifecycle_state!=='PARTNER_APPROVAL'||engagement.locked_at)throw new ApiError('INVALID_STATE','An opinion can be selected only during unlocked Partner Approval.');
  const pins=await reportPins(env,workspaceId,engagement.id),reportType=engagement.engagement_type==='AGREED_UPON_PROCEDURES'?'ISRS_4400_AUP':'ISA_AUDIT';
  if(reportType==='ISRS_4400_AUP'&&(!p.aupReportType||!p.aupProcedureSummary))throw new ApiError('VALIDATION_FAILED','An AUP engagement needs its approved report type and actual procedure summary; an ISA audit opinion is not available.');
  if(reportType==='ISA_AUDIT'&&!p.category)throw new ApiError('VALIDATION_FAILED','Choose one of the four supported audit opinion categories.');
  if(reportType==='ISA_AUDIT'&&p.category!=='UNMODIFIED'&&(!p.affectedFslis.length||!p.basisText||p.basisText.trim().length<20))throw new ApiError('VALIDATION_FAILED','A modified opinion requires at least one affected FSLI and substantive basis text.');
  if(reportType==='ISA_AUDIT'&&p.category==='UNMODIFIED'&&(p.affectedFslis.length||p.basisText))throw new ApiError('VALIDATION_FAILED','An unmodified opinion cannot contain a modified-opinion basis or affected FSLI.');
  const going=await env.DB.prepare(`SELECT conclusion FROM going_concern_assessments WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC LIMIT 1`).bind(workspaceId,engagement.id).first<{conclusion:string}>();
  if(going?.conclusion==='MATERIAL_UNCERTAINTY'&&!p.goingConcernReportingText?.trim())throw new ApiError('GATE_BLOCKED','The assessed material going-concern uncertainty needs a Partner-completed reporting section.');
  const fsliRows=p.affectedFslis.length?await env.DB.prepare(`SELECT id FROM fsli_catalog WHERE workspace_id=? AND active=1 AND id IN (${p.affectedFslis.map(()=>'?').join(',')})`)
    .bind(workspaceId,...p.affectedFslis.map(item=>item.fsliId)).all<{id:string}>():{results:[] as Array<{id:string}>};
  if((fsliRows.results??[]).length!==p.affectedFslis.length||new Set(p.affectedFslis.map(row=>row.fsliId)).size!==p.affectedFslis.length)throw new ApiError('VALIDATION_FAILED','Each affected FSLI must be active and appear once.');
  const revision=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS value FROM opinion_versions WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId,engagement.id).first<{value:number}>();
  const idValue=crypto.randomUUID(),category=reportType==='ISRS_4400_AUP'?null:p.category!,heading=category?basisHeading(category):null;
  const canonical={engagementId:engagement.id,revision:Number(revision?.value??1),srmVersionId:pins.srm.id,standardsProfileId:engagement.standards_profile_id,reportType,category,
    rationale:p.rationale,materialityAssessment:p.materialityAssessment,pervasivenessAssessment:p.pervasivenessAssessment,basisHeading:heading,basisText:p.basisText??null,
    goingConcernReportingText:p.goingConcernReportingText??null,additionalSections:p.additionalSections,aupReportType:p.aupReportType??null,aupProcedureSummary:p.aupProcedureSummary??null,
    affectedFslis:p.affectedFslis,statementSourceHash:pins.snapshot.source_hash};
  const dependencyHash=await sha256Hex(JSON.stringify(canonical));
  const statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO opinion_versions(id,workspace_id,client_id,engagement_id,revision,srm_version_id,standards_profile_id,report_type,category,aup_report_type,aup_procedure_summary,
      rationale,materiality_assessment,pervasiveness_assessment,basis_heading,basis_text,going_concern_reporting_text,additional_sections_json,selected_by_actor_id,selected_at,dependency_hash)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(idValue,workspaceId,engagement.client_id,engagement.id,Number(revision?.value??1),pins.srm.id,engagement.standards_profile_id,reportType,category,p.aupReportType??null,
      p.aupProcedureSummary??null,p.rationale,p.materialityAssessment,p.pervasivenessAssessment,heading,p.basisText??null,p.goingConcernReportingText??null,JSON.stringify(p.additionalSections),context.actor.id,now,dependencyHash)];
  for(const item of p.affectedFslis)statements.push(env.DB.prepare(`INSERT INTO opinion_affected_fslis(id,workspace_id,opinion_version_id,fsli_id,amount_minor,explanation) VALUES(?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,idValue,item.fsliId,item.amountMinor===undefined||item.amountMinor===null?null:Number(item.amountMinor),item.explanation));
  return mut(statements,{opinionVersionId:idValue,revision:Number(revision?.value??1),reportType,category,basisHeading:heading,dependencyHash,
    reportingBlockers:going?.conclusion==='MATERIAL_UNCERTAINTY'&&!p.goingConcernReportingText?.trim()?['Partner going-concern reporting section is incomplete.']:[]},'OPINION_VERSION',idValue,null,1,{dependencyHash,reportType,category,affectedFsliCount:p.affectedFslis.length});
}

async function buildSignatureRegister(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'signature-asset.register'}>,now:string){
  partner(context);const p=command.payload;
  const staff=await env.DB.prepare(`SELECT id,grade,active FROM staff_members WHERE workspace_id=? AND id=?`).bind(workspaceId,p.staffMemberId)
    .first<{id:string;grade:string;active:number}>();
  if(!staff||staff.grade!=='PARTNER'||staff.active!==1)throw new ApiError('GATE_BLOCKED','The image owner must be an active Partner-grade staff record.');
  const [signature,seal]=await Promise.all([readPngAsset(env,workspaceId,p.signatureFileId,'SIGNATURE'),readPngAsset(env,workspaceId,p.sealFileId,'SEAL')]);
  const assetId=crypto.randomUUID();
  return mut([env.DB.prepare(`INSERT INTO report_signature_assets(id,workspace_id,staff_member_id,signature_file_id,seal_file_id,signature_sha256,seal_sha256,signature_width,signature_height,seal_width,seal_height,label,status,uploaded_at,uploaded_by_actor_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?)`).bind(assetId,workspaceId,staff.id,signature.id,seal.id,signature.sha256,seal.sha256,signature.width,signature.height,seal.width,seal.height,p.label,now,context.actor.id)],
    {signatureAssetId:assetId,label:p.label,signatureSha256:signature.sha256,sealSha256:seal.sha256,attribution:'SELF_ASSERTED_PERSONA'},'REPORT_SIGNATURE_ASSET',assetId,null,1,
    {staffMemberId:staff.id,signatureSha256:signature.sha256,sealSha256:seal.sha256,dimensions:{signature:[signature.width,signature.height],seal:[seal.width,seal.height]}});
}

async function buildStatementDraftSave(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'financial-statements.save-disclosures'}>,now:string){
  reviewer(context);const p=command.payload,engagement=await engagementRow(env,workspaceId,context,p.engagementId);
  if(engagement.locked_at||engagement.lifecycle_state!=='PARTNER_APPROVAL')throw new ApiError('INVALID_STATE','Financial statements are editable only during unlocked Partner Approval.');
  const pins=await reportPins(env,workspaceId,engagement.id);
  if(pins.snapshot.id!==p.statementSnapshotId)throw new ApiError('STALE_DEPENDENCY','Choose the statement snapshot pinned to the latest Partner-cleared SRM.');
  const existing=await env.DB.prepare(`SELECT id,version,status,created_by_actor_id FROM financial_statement_drafts WHERE workspace_id=? AND engagement_id=? AND statement_snapshot_id=?`)
    .bind(workspaceId,engagement.id,p.statementSnapshotId).first<{id:string;version:number;status:string;created_by_actor_id:string}>();
  if(existing?.status==='APPROVED')throw new ApiError('STALE_DEPENDENCY','This financial-statement version has already been approved. Create a new statement snapshot before changing its disclosures.');
  if(new Set(p.notes.map(item=>item.noteNumber)).size!==p.notes.length||new Set(p.supplementLines.map(item=>`${item.section}:${item.code}`)).size!==p.supplementLines.length)
    throw new ApiError('VALIDATION_FAILED','Note numbers and supplement section/code pairs must be unique.');
  for(const fileId of [...p.notes.map(item=>item.supportingFileId),...p.supplementLines.map(item=>item.supportingFileId)].filter((value):value is string=>Boolean(value))){
    const file=await env.DB.prepare(`SELECT id FROM file_versions WHERE workspace_id=? AND id=? AND engagement_id=? AND state='COMMITTED' AND immutable=1`)
      .bind(workspaceId,fileId,engagement.id).first<{id:string}>();if(!file)throw new ApiError('GATE_BLOCKED','Every supporting file must be committed and scoped to this engagement.');
  }
  const sectionSet=new Set(p.supplementLines.map(item=>item.section));
  const completeness={accountingPolicies:p.accountingPolicies.trim().length>=20,notes:p.notes.length>0,cashFlow:sectionSet.has('CASH_FLOW'),equityChange:sectionSet.has('EQUITY_CHANGE'),oci:!p.ociApplicable||sectionSet.has('OCI')};
  const notesHash=await sha256Hex(JSON.stringify([...p.notes].sort((a,b)=>a.sortOrder-b.sortOrder||a.noteNumber.localeCompare(b.noteNumber))));
  const supplementHash=await sha256Hex(JSON.stringify([...p.supplementLines].sort((a,b)=>a.section.localeCompare(b.section)||a.code.localeCompare(b.code))));
  const sourceHash=await sha256Hex(JSON.stringify({statementSnapshotId:p.statementSnapshotId,statementSourceHash:pins.snapshot.source_hash,standardsProfileId:engagement.standards_profile_id,
    accountingPolicies:p.accountingPolicies,ociApplicable:p.ociApplicable,notesHash,supplementHash,completeness}));
  const draftId=existing?.id??crypto.randomUUID(),version=(existing?.version??0)+1;
  const statements:D1PreparedStatement[]=[];
  if(existing){
    statements.push(assertDb(env,workspaceId,701,`EXISTS(SELECT 1 FROM financial_statement_drafts WHERE workspace_id=? AND id=? AND version=? AND status='DRAFT')`,workspaceId,draftId,existing.version));
    statements.push(env.DB.prepare(`UPDATE financial_statement_drafts SET version=?,accounting_policies=?,oci_applicable=?,completeness_checklist_json=?,source_hash=?,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='DRAFT'`)
      .bind(version,p.accountingPolicies,p.ociApplicable?1:0,JSON.stringify(completeness),sourceHash,now,workspaceId,draftId,existing.version));
    statements.push(env.DB.prepare(`DELETE FROM disclosure_notes WHERE workspace_id=? AND draft_id=?`).bind(workspaceId,draftId),
      env.DB.prepare(`DELETE FROM statement_supplement_lines WHERE workspace_id=? AND draft_id=?`).bind(workspaceId,draftId));
  }else statements.push(env.DB.prepare(`INSERT INTO financial_statement_drafts(id,workspace_id,client_id,engagement_id,version,statement_snapshot_id,standards_profile_id,accounting_policies,oci_applicable,completeness_checklist_json,status,source_hash,created_by_actor_id,created_at,updated_at)
      VALUES(?,?,?,?,1,?,?,?,?,?,'DRAFT',?,?,?,?)`).bind(draftId,workspaceId,engagement.client_id,engagement.id,p.statementSnapshotId,engagement.standards_profile_id,p.accountingPolicies,p.ociApplicable?1:0,JSON.stringify(completeness),sourceHash,context.actor.id,now,now));
  for(const note of p.notes)statements.push(env.DB.prepare(`INSERT INTO disclosure_notes(id,workspace_id,draft_id,note_number,title,body,amount_minor,supporting_file_id,sort_order) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,draftId,note.noteNumber,note.title,note.body,note.amountMinor===undefined||note.amountMinor===null?null:Number(note.amountMinor),note.supportingFileId??null,note.sortOrder));
  for(const line of p.supplementLines)statements.push(env.DB.prepare(`INSERT INTO statement_supplement_lines(id,workspace_id,draft_id,section,code,label,current_minor,prior_minor,supporting_file_id,rationale) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),workspaceId,draftId,line.section,line.code,line.label,Number(line.currentMinor),line.priorMinor===undefined||line.priorMinor===null?null:Number(line.priorMinor),line.supportingFileId??null,line.rationale));
  return mut(statements,{draftId,version,sourceHash,notesHash,supplementHash,completeness,ready:Object.values(completeness).every(Boolean)},'FINANCIAL_STATEMENT_DRAFT',draftId,existing?.version??null,version,
    {statementSnapshotId:p.statementSnapshotId,sourceHash,notesHash,supplementHash,completeness});
}

async function naturalPersonKey(env:Env,workspaceId:string,actorId:string){
  const row=await env.DB.prepare(`SELECT s.natural_person_key FROM actor_profiles a JOIN staff_members s ON s.workspace_id=a.workspace_id AND s.id=a.staff_member_id WHERE a.workspace_id=? AND a.id=?`)
    .bind(workspaceId,actorId).first<{natural_person_key:string}>();return row?.natural_person_key??null;
}
async function buildStatementApprove(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'financial-statements.approve'}>,now:string){
  reviewer(context);const p=command.payload;
  const draft=await env.DB.prepare(`SELECT id,version,client_id,engagement_id,statement_snapshot_id,standards_profile_id,accounting_policies,oci_applicable,completeness_checklist_json,status,source_hash,created_by_actor_id
    FROM financial_statement_drafts WHERE workspace_id=? AND id=?`).bind(workspaceId,p.draftId).first<Record<string,unknown>&{id:string;version:number;client_id:string;engagement_id:string;statement_snapshot_id:string;standards_profile_id:string;accounting_policies:string;oci_applicable:number;status:string;source_hash:string;created_by_actor_id:string}>();
  if(!draft)throw new ApiError('NOT_FOUND','The financial-statement draft was not found.');
  if(draft.status!=='DRAFT'||draft.source_hash!==p.sourceHash)throw new ApiError('STALE_DEPENDENCY','The draft changed or was already approved. Save and review its current source hash.');
  const engagement=await engagementRow(env,workspaceId,context,draft.engagement_id);if(engagement.lifecycle_state!=='PARTNER_APPROVAL'||engagement.locked_at)throw new ApiError('INVALID_STATE','Financial-statement approval is available only in Partner Approval.');
  const pins=await reportPins(env,workspaceId,engagement.id);if(pins.snapshot.id!==draft.statement_snapshot_id||draft.standards_profile_id!==engagement.standards_profile_id)
    throw new ApiError('STALE_DEPENDENCY','The statement snapshot or standards profile changed after draft preparation.');
  const completeness=JSON.parse(String(draft.completeness_checklist_json)) as Record<string,boolean>;
  if(!Object.values(completeness).every(Boolean))throw new ApiError('GATE_BLOCKED','Complete the cash-flow, equity, applicable OCI, accounting-policy and disclosure-note requirements before approval.');
  const [notes,supplements]=await Promise.all([
    env.DB.prepare(`SELECT note_number,title,body,amount_minor,supporting_file_id,sort_order FROM disclosure_notes WHERE workspace_id=? AND draft_id=? ORDER BY sort_order,note_number`).bind(workspaceId,draft.id).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT section,code,label,current_minor,prior_minor,supporting_file_id,rationale FROM statement_supplement_lines WHERE workspace_id=? AND draft_id=? ORDER BY section,code`).bind(workspaceId,draft.id).all<Record<string,unknown>>()
  ]);
  const notesHash=await sha256Hex(JSON.stringify(notes.results??[])),supplementHash=await sha256Hex(JSON.stringify(supplements.results??[]));
  const preparer=await naturalPersonKey(env,workspaceId,draft.created_by_actor_id),approver=await naturalPersonKey(env,workspaceId,context.actor.id);
  if(preparer&&approver&&preparer===approver)throw new ApiError('SELF_REVIEW_BLOCKED','Financial-statement approval must be performed by a different natural person from the preparer.');
  const approvalId=crypto.randomUUID(),approvalHash=await sha256Hex(JSON.stringify({draftId:draft.id,version:draft.version,statementSnapshotId:draft.statement_snapshot_id,notesHash,supplementHash,sourceHash:draft.source_hash,approver:context.actor.id}));
  const statements=[assertDb(env,workspaceId,702,`EXISTS(SELECT 1 FROM financial_statement_drafts WHERE workspace_id=? AND id=? AND version=? AND status='DRAFT' AND source_hash=?)`,workspaceId,draft.id,draft.version,p.sourceHash),
    env.DB.prepare(`UPDATE financial_statement_drafts SET status='APPROVED',updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='DRAFT'`).bind(now,workspaceId,draft.id,draft.version),
    env.DB.prepare(`INSERT INTO financial_statement_approvals(id,workspace_id,client_id,engagement_id,draft_id,draft_version,statement_snapshot_id,notes_hash,supplement_hash,source_hash,approved_by_actor_id,approved_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(approvalId,workspaceId,draft.client_id,draft.engagement_id,draft.id,draft.version,draft.statement_snapshot_id,notesHash,supplementHash,draft.source_hash,context.actor.id,now)];
  return mut(statements,{approvalId,draftId:draft.id,draftVersion:draft.version,statementSnapshotId:draft.statement_snapshot_id,sourceHash:approvalHash,notesHash,supplementHash},'FINANCIAL_STATEMENT_APPROVAL',approvalId,null,1,
    {draftId:draft.id,sourceHash:approvalHash,statementSnapshotId:draft.statement_snapshot_id});
}

async function buildReportPrepare(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'report.prepare'}>,commandId:string,now:string){
  partner(context);const p=command.payload,engagement=await engagementRow(env,workspaceId,context,p.engagementId);
  if(engagement.lifecycle_state!=='PARTNER_APPROVAL'||engagement.locked_at)throw new ApiError('INVALID_STATE','Report candidates can be prepared only during unlocked Partner Approval.');
  if(p.proposedReportDate!==currentQatarDate())throw new ApiError('STALE_DEPENDENCY','The proposed report date must be today in Qatar; prepare a fresh candidate if signing crosses midnight.');
  const pins=await reportPins(env,workspaceId,engagement.id);
  const opinion=await env.DB.prepare(`SELECT id,revision,srm_version_id,standards_profile_id,report_type,category,dependency_hash,going_concern_reporting_text FROM opinion_versions WHERE workspace_id=? AND id=? AND engagement_id=?`)
    .bind(workspaceId,p.opinionVersionId,engagement.id).first<{id:string;revision:number;srm_version_id:string;standards_profile_id:string;report_type:string;category:string|null;dependency_hash:string;going_concern_reporting_text:string|null}>();
  if(!opinion||opinion.srm_version_id!==pins.srm.id||opinion.standards_profile_id!==engagement.standards_profile_id)throw new ApiError('STALE_DEPENDENCY','Select an opinion tied to the current SRM and standards profile.');
  const approval=await env.DB.prepare(`SELECT a.id,a.draft_id,a.draft_version,a.statement_snapshot_id,a.notes_hash,a.supplement_hash,a.source_hash,d.status,d.version,d.source_hash AS draft_hash
    FROM financial_statement_approvals a JOIN financial_statement_drafts d ON d.workspace_id=a.workspace_id AND d.id=a.draft_id
    WHERE a.workspace_id=? AND a.id=? AND a.engagement_id=?`).bind(workspaceId,p.financialStatementApprovalId,engagement.id)
    .first<{id:string;draft_id:string;draft_version:number;statement_snapshot_id:string;notes_hash:string;supplement_hash:string;source_hash:string;status:string;version:number;draft_hash:string}>();
  if(!approval||approval.status!=='APPROVED'||approval.version!==approval.draft_version||approval.statement_snapshot_id!==pins.snapshot.id||approval.draft_hash!==approval.source_hash)
    throw new ApiError('STALE_DEPENDENCY','An approved complete financial-statement draft for the current SRM snapshot is required.');
  const asset=await env.DB.prepare(`SELECT id,status,signature_sha256,seal_sha256 FROM report_signature_assets WHERE workspace_id=? AND id=? AND status='ACTIVE'`)
    .bind(workspaceId,p.signatureAssetId).first<{id:string;status:string;signature_sha256:string;seal_sha256:string}>();if(!asset)throw new ApiError('GATE_BLOCKED','Choose a registered active Partner signature and seal asset.');
  const candidateId=crypto.randomUUID(),jobId=crypto.randomUUID();
  const dependencyHash=await sha256Hex(JSON.stringify({engagementId:engagement.id,srmVersionId:pins.srm.id,srmDependencyHash:pins.srm.dependency_hash,
    opinionId:opinion.id,opinionHash:opinion.dependency_hash,approvalId:approval.id,approvalHash:approval.source_hash,snapshotHash:pins.snapshot.source_hash,
    signatureAssetId:asset.id,signatureSha256:asset.signature_sha256,sealSha256:asset.seal_sha256,proposedReportDate:p.proposedReportDate}));
  const payload={documentType:'REPORT_CANDIDATE',reportCandidateId:candidateId,engagementId:engagement.id,clientId:engagement.client_id,signatureAssetId:asset.id,
    opinionVersionId:opinion.id,financialStatementApprovalId:approval.id,proposedReportDate:p.proposedReportDate,dependencyHash,commandId};
  const statements=[env.DB.prepare(`INSERT INTO report_candidates(id,workspace_id,client_id,engagement_id,opinion_version_id,financial_statement_approval_id,report_artifact_id,proposed_report_date,dependency_hash,status,failure_code,prepared_by_actor_id,created_at,updated_at,signature_asset_id)
      VALUES(?,?,?,?,?,?,NULL,?,?,'PREPARING',NULL,?,?,?,?)`).bind(candidateId,workspaceId,engagement.client_id,engagement.id,opinion.id,approval.id,p.proposedReportDate,dependencyHash,context.actor.id,now,now,asset.id),
    outboxJob(env,workspaceId,jobId,candidateId,1,payload,`report-candidate:${candidateId}`,now)];
  return mut(statements,{jobId,reportCandidateId:candidateId,status:'PREPARING',dependencyHash,reportingBlockers:[]},'REPORT_CANDIDATE',candidateId,null,1,{jobId,dependencyHash,proposedReportDate:p.proposedReportDate});
}

async function buildReportConsent(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'report.consent'}>,now:string){
  partner(context);const p=command.payload,engagement=await engagementRow(env,workspaceId,context,p.engagementId);
  if(engagement.lifecycle_state!=='PARTNER_APPROVAL'||p.proposedReportDate!==currentQatarDate())throw new ApiError('STALE_DEPENDENCY','Report consent must be confirmed in Partner Approval for today’s Qatar calendar date.');
  const candidate=await env.DB.prepare(`SELECT c.id,c.opinion_version_id,c.report_artifact_id,c.dependency_hash,c.proposed_report_date,c.status,c.signature_asset_id,g.content_sha256,a.file_version_id
    FROM report_candidates c JOIN generated_artifacts g ON g.workspace_id=c.workspace_id AND g.id=c.report_artifact_id JOIN file_versions a ON a.workspace_id=g.workspace_id AND a.id=g.file_version_id
    WHERE c.workspace_id=? AND c.id=? AND c.engagement_id=?`).bind(workspaceId,p.reportCandidateId,engagement.id)
    .first<{id:string;opinion_version_id:string;report_artifact_id:string;dependency_hash:string;proposed_report_date:string;status:string;signature_asset_id:string;content_sha256:string;file_version_id:string}>();
  if(!candidate||candidate.status!=='READY'||candidate.proposed_report_date!==p.proposedReportDate||candidate.signature_asset_id!==p.signatureAssetId||candidate.content_sha256!==p.candidateContentHash)
    throw new ApiError('STALE_DEPENDENCY','The report candidate hash, selected assets, or proposed date changed. Generate and review a fresh candidate.');
  const pins=await reportPins(env,workspaceId,engagement.id),opinion=await env.DB.prepare(`SELECT srm_version_id,dependency_hash FROM opinion_versions WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,candidate.opinion_version_id).first<{srm_version_id:string;dependency_hash:string}>();
  if(!opinion||opinion.srm_version_id!==pins.srm.id)throw new ApiError('STALE_DEPENDENCY','The opinion is no longer tied to the current cleared SRM.');
  const asset=await env.DB.prepare(`SELECT id,signature_sha256,seal_sha256 FROM report_signature_assets WHERE workspace_id=? AND id=? AND status='ACTIVE'`)
    .bind(workspaceId,p.signatureAssetId).first<{id:string;signature_sha256:string;seal_sha256:string}>();if(!asset)throw new ApiError('STALE_DEPENDENCY','The signature asset is no longer active.');
  const consentId=crypto.randomUUID();
  const statements=[env.DB.prepare(`INSERT INTO report_signature_consents(id,workspace_id,client_id,engagement_id,actor_id,signature_asset_id,opinion_version_id,report_candidate_id,candidate_content_hash,proposed_report_date,consent_text,consented_at,attribution)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'SELF_ASSERTED_PERSONA')`).bind(consentId,workspaceId,engagement.client_id,engagement.id,context.actor.id,asset.id,candidate.opinion_version_id,candidate.id,p.candidateContentHash,p.proposedReportDate,p.consentText,now)];
  return mut(statements,{consentId,reportCandidateId:candidate.id,candidateContentHash:p.candidateContentHash,signatureSha256:asset.signature_sha256,sealSha256:asset.seal_sha256,
    attribution:'SELF_ASSERTED_PERSONA',reportDate:p.proposedReportDate},'REPORT_SIGNATURE_CONSENT',consentId,null,1,{candidateId:candidate.id,candidateContentHash:p.candidateContentHash,assetId:asset.id});
}

async function buildManagementPrepare(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'management-letter.prepare'}>,now:string){
  partner(context);const p=command.payload,engagement=await engagementRow(env,workspaceId,context,p.engagementId);
  if(engagement.lifecycle_state!=='PARTNER_APPROVAL'||engagement.locked_at)throw new ApiError('INVALID_STATE','A management letter can be prepared only during unlocked Partner Approval.');
  if(p.items.length===0&&!p.noReportableDeficienciesReason?.trim())throw new ApiError('VALIDATION_FAILED','Select findings or provide the Partner-approved no-reportable-deficiencies rationale.');
  if(p.items.length>0&&p.noReportableDeficienciesReason?.trim())throw new ApiError('VALIDATION_FAILED','A no-reportable-deficiencies rationale cannot accompany selected deficiencies.');
  if(new Set(p.items.map(item=>item.findingId)).size!==p.items.length)throw new ApiError('VALIDATION_FAILED','Select each finding only once.');
  const ids=p.items.map(item=>item.findingId),findings=ids.length?await env.DB.prepare(`SELECT id,version,title,description,severity,qualitative_significance,client_response,resolution,source_hash,tb_version_id,mapping_version_id,materiality_version_id
    FROM findings WHERE workspace_id=? AND engagement_id=? AND id IN (${ids.map(()=>'?').join(',')})`).bind(workspaceId,engagement.id,...ids).all<Record<string,unknown>>():{results:[] as Array<Record<string,unknown>>};
  const byId=new Map((findings.results??[]).map(row=>[String(row.id),row]));if(byId.size!==ids.length)throw new ApiError('NOT_FOUND','One or more selected findings are outside the engagement.');
  const items=p.items.map((item,ordinal)=>{const finding=byId.get(item.findingId)!;
    if(finding.tb_version_id!==engagement.active_tb_version_id||finding.mapping_version_id!==engagement.active_mapping_version_id||finding.materiality_version_id!==engagement.active_materiality_version_id)
      throw new ApiError('STALE_DEPENDENCY','A selected finding has stale TB, mapping or materiality pins. Refresh its review first.');
    return {findingId:finding.id,findingVersion:finding.version,deficiency:`${String(finding.title)}. ${String(finding.description)}`,impact:item.impact,
      recommendation:item.recommendation,managementResponse:typeof finding.client_response==='string'&&finding.client_response.trim()?finding.client_response:null,
      responsibleParty:item.responsibleParty??null,targetDate:item.targetDate??null,ordinal,sourceHash:finding.source_hash};});
  const revision=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS value FROM management_letter_versions WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId,engagement.id).first<{value:number}>();
  const idValue=crypto.randomUUID(),jobId=crypto.randomUUID(),rev=Number(revision?.value??1),sourceHash=await sha256Hex(JSON.stringify({engagementId:engagement.id,items,noReportableDeficienciesReason:p.noReportableDeficienciesReason??null}));
  const payload={documentType:'MANAGEMENT_LETTER',managementLetterVersionId:idValue,engagementId:engagement.id,clientId:engagement.client_id,revision:rev,items,noReportableDeficienciesReason:p.noReportableDeficienciesReason??null,sourceHash,commandId:crypto.randomUUID()};
  const statements=[env.DB.prepare(`INSERT INTO management_letter_versions(id,workspace_id,client_id,engagement_id,revision,items_snapshot_json,no_reportable_deficiencies_reason,source_hash,artifact_id,file_version_id,status,approved_by_actor_id,approved_at,created_at)
      VALUES(?,?,?,?,?,?,?, ?,NULL,NULL,'PREPARING',?,?,?)`).bind(idValue,workspaceId,engagement.client_id,engagement.id,rev,JSON.stringify(items),p.noReportableDeficienciesReason??null,sourceHash,context.actor.id,now,now),
    outboxJob(env,workspaceId,jobId,idValue,rev,payload,`management-letter:${idValue}`,now)];
  return mut(statements,{jobId,managementLetterVersionId:idValue,revision:rev,status:'PREPARING',sourceHash},'MANAGEMENT_LETTER_VERSION',idValue,null,rev,{jobId,sourceHash,itemCount:items.length});
}

async function buildRepresentationPrepare(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'representation.prepare'}>,now:string){
  reviewer(context);const p=command.payload,engagement=await engagementRow(env,workspaceId,context,p.engagementId);
  if(engagement.lifecycle_state!=='PARTNER_APPROVAL'||engagement.locked_at||p.proposedReportDate!==currentQatarDate())throw new ApiError('INVALID_STATE','Prepare the representation request during unlocked Partner Approval for the current Qatar report date.');
  const route=await env.DB.prepare(`SELECT cr.id,cr.version,cr.contact_id,ct.full_name,ct.email FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
    WHERE cr.workspace_id=? AND cr.id=? AND cr.client_id=? AND cr.purpose='FINAL_REPORT' AND cr.is_primary=1 AND ct.active=1 AND ct.email IS NOT NULL`)
    .bind(workspaceId,p.contactRouteId,engagement.client_id).first<{id:string;version:number;contact_id:string;full_name:string;email:string}>();
  if(!route)throw new ApiError('GATE_BLOCKED','Choose the active primary FINAL_REPORT contact route for management.');
  const pins=await reportPins(env,workspaceId,engagement.id),dependencyHash=await sha256Hex(JSON.stringify({engagementId:engagement.id,srmVersionId:pins.srm.id,srmHash:pins.srm.dependency_hash,
    statementSnapshotId:pins.snapshot.id,statementSourceHash:pins.snapshot.source_hash,standardsProfileId:pins.profile.id,reportDate:p.proposedReportDate,requiredSignatories:p.requiredSignatories}));
  const requestId=crypto.randomUUID(),jobId=crypto.randomUUID(),required=[...new Set(p.requiredSignatories.map(name=>name.trim()))];
  if(required.length!==p.requiredSignatories.length)throw new ApiError('VALIDATION_FAILED','Required representation signatories must be unique.');
  const payload={documentType:'REPRESENTATION_TEMPLATE',requestId,engagementId:engagement.id,clientId:engagement.client_id,requiredSignatories:required,
    proposedReportDate:p.proposedReportDate,dependencyHash,recipient:{contactRouteId:route.id,contactRouteVersion:route.version,contactId:route.contact_id,name:route.full_name,email:route.email},commandId:crypto.randomUUID()};
  const statements=[env.DB.prepare(`INSERT INTO representation_requests(id,workspace_id,client_id,engagement_id,version,template_artifact_id,template_file_id,proposed_report_date,required_signatories_json,dependency_hash,status,dispatch_id,current_return_id,created_by_actor_id,created_at,updated_at,contact_route_id)
      VALUES(?,?,?, ?,1,NULL,NULL,?,?,?,'PREPARING',NULL,NULL,?,?,?,?)`).bind(requestId,workspaceId,engagement.client_id,engagement.id,p.proposedReportDate,JSON.stringify(required),dependencyHash,context.actor.id,now,now,route.id),
    outboxJob(env,workspaceId,jobId,requestId,1,payload,`representation-template:${requestId}`,now)];
  return mut(statements,{jobId,requestId,status:'PREPARING',dependencyHash,requiredSignatories:required},'REPRESENTATION_REQUEST',requestId,null,1,{jobId,dependencyHash});
}

async function buildRepresentationSend(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'representation.send'}>,now:string){
  reviewer(context);const request=await env.DB.prepare(`SELECT r.id,r.version,r.client_id,r.engagement_id,r.template_file_id,r.proposed_report_date,r.status,r.dependency_hash,r.contact_route_id,cr.version AS route_version,cr.contact_id,ct.full_name,ct.email
    FROM representation_requests r JOIN contact_routes cr ON cr.workspace_id=r.workspace_id AND cr.id=r.contact_route_id JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.id=cr.contact_id
    WHERE r.workspace_id=? AND r.id=?`).bind(workspaceId,command.payload.requestId)
    .first<{id:string;version:number;client_id:string;engagement_id:string;template_file_id:string|null;proposed_report_date:string;status:string;dependency_hash:string;contact_route_id:string;route_version:number;contact_id:string;full_name:string;email:string}>();
  if(!request||request.status!=='PREPARED'||!request.template_file_id)throw new ApiError('INVALID_TRANSITION','Only a prepared representation template can be sent.');
  const engagement=await engagementRow(env,workspaceId,context,request.engagement_id);if(engagement.portal_frozen_at||engagement.lifecycle_state!=='PARTNER_APPROVAL')throw new ApiError('WORKSPACE_FROZEN','The representation request cannot be sent after portal freeze.');
  const pins=await reportPins(env,workspaceId,engagement.id),expected=await sha256Hex(JSON.stringify({engagementId:engagement.id,srmVersionId:pins.srm.id,srmHash:pins.srm.dependency_hash,
    statementSnapshotId:pins.snapshot.id,statementSourceHash:pins.snapshot.source_hash,standardsProfileId:pins.profile.id,reportDate:request.proposed_report_date,
    requiredSignatories:JSON.parse(String((await env.DB.prepare(`SELECT required_signatories_json FROM representation_requests WHERE workspace_id=? AND id=?`).bind(workspaceId,request.id).first<{required_signatories_json:string}>())?.required_signatories_json??'[]'))}));
  if(expected!==request.dependency_hash)throw new ApiError('STALE_DEPENDENCY','The report or statement source changed after the representation template was prepared.');
  const dispatchId=crypto.randomUUID(),jobId=crypto.randomUUID(),dedup=`representation:${request.id}:${request.version}`;
  const recipient={contactRouteId:request.contact_route_id,contactRouteVersion:request.route_version,contactId:request.contact_id,name:request.full_name,email:request.email};
  const payload={documentType:'COMMERCIAL_EMAIL',purpose:'BUNDLE',commandId:crypto.randomUUID(),engagementId:engagement.id,clientId:engagement.client_id,dispatchId,fileVersionId:request.template_file_id,recipient,
    subject:`Letter of representation · ${engagement.code}`,body:`Please review, sign and return the attached representation letter for ${engagement.client_name}, period ${engagement.period_start} to ${engagement.period_end}.`};
  const statements=[assertDb(env,workspaceId,703,`EXISTS(SELECT 1 FROM representation_requests WHERE workspace_id=? AND id=? AND version=? AND status='PREPARED' AND dependency_hash=?)`,workspaceId,request.id,request.version,request.dependency_hash),
    env.DB.prepare(`UPDATE representation_requests SET version=version+1,status='SENT',dispatch_id=?,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='PREPARED'`).bind(dispatchId,now,workspaceId,request.id,request.version),
    emailOutboxJob(env,workspaceId,jobId,dispatchId,1,payload,dedup,now),
    env.DB.prepare(`INSERT INTO dispatches(id,workspace_id,version,client_id,engagement_id,purpose,file_version_id,recipient_snapshot_json,status,provider_message_id,sent_at,deduplication_key,job_id,created_at,updated_at)
      VALUES(?,?,1,?,?, 'BUNDLE',?,?,'QUEUED',NULL,NULL,?,?,?,?)`).bind(dispatchId,workspaceId,engagement.client_id,engagement.id,request.template_file_id,JSON.stringify(recipient),dedup,jobId,now,now)];
  return mut(statements,{requestId:request.id,dispatchId,status:'QUEUED',providerOutcome:'PENDING'},'DISPATCH',dispatchId,request.version,request.version+1,{requestId:request.id,dependencyHash:request.dependency_hash});
}

async function buildRepresentationReceive(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'representation.receive'}>,now:string){
  if(context.actor.persona!=='CLIENT')throw new ApiError('PERSONA_ACTION_DENIED','Only the selected CLIENT profile may submit the signed management representation.');
  const p=command.payload,request=await env.DB.prepare(`SELECT id,version,client_id,engagement_id,proposed_report_date,required_signatories_json,status,current_return_id FROM representation_requests WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,p.requestId).first<{id:string;version:number;client_id:string;engagement_id:string;proposed_report_date:string;required_signatories_json:string;status:string;current_return_id:string|null}>();
  if(!request||context.actor.clientId!==request.client_id)throw new ApiError('FORBIDDEN_SCOPE','This representation request is outside the selected Client profile.');
  const engagement=await engagementRow(env,workspaceId,context,request.engagement_id);
  if(engagement.portal_frozen_at||engagement.locked_at||!['SENT','REJECTED'].includes(request.status)
    || (typeof engagement.archive_due_at==='string'&&engagement.archive_due_at<=now))
    throw new ApiError('WORKSPACE_FROZEN','The portal is frozen or this representation request is not open for a signed return.');
  if(p.representationDate>request.proposed_report_date)throw new ApiError('VALIDATION_FAILED','The signed representation must be dated no later than the proposed report date.');
  const file=await env.DB.prepare(`SELECT f.id,f.sha256,f.media_type,f.purpose,f.state,f.immutable,f.client_id,f.engagement_id,
      rfr.request_id AS representation_request_id,f.created_by_actor_id
    FROM file_versions f JOIN representation_file_reservations rfr ON rfr.workspace_id=f.workspace_id AND rfr.file_version_id=f.id
    WHERE f.workspace_id=? AND f.id=? AND f.client_id=? AND f.engagement_id=? AND rfr.request_id=?`)
    .bind(workspaceId,p.signedFileId,request.client_id,request.engagement_id,request.id)
    .first<{id:string;sha256:string;media_type:string;purpose:string;state:string;immutable:number;client_id:string;engagement_id:string;
      representation_request_id:string;created_by_actor_id:string|null}>();
  if(!file||file.state!=='COMMITTED'||file.immutable!==1||file.media_type!=='application/pdf'||file.purpose!=='EVIDENCE')
    throw new ApiError('GATE_BLOCKED','Upload and commit the signed PDF against this exact open representation request before submitting it.');
  const assignedContact=await env.DB.prepare(`SELECT 1 AS found FROM representation_requests r
    JOIN contact_routes cr ON cr.workspace_id=r.workspace_id AND cr.id=r.contact_route_id AND cr.client_id=r.client_id AND cr.purpose='FINAL_REPORT'
    JOIN contacts c ON c.workspace_id=cr.workspace_id AND c.client_id=cr.client_id AND c.id=cr.contact_id AND c.active=1
    JOIN actor_profiles ap ON ap.workspace_id=r.workspace_id AND ap.id=? AND ap.persona='CLIENT' AND ap.active=1 AND ap.contact_id=c.id
    WHERE r.workspace_id=? AND r.id=? AND r.client_id=? AND r.engagement_id=? AND r.status IN ('SENT','REJECTED')`)
    .bind(context.actor.id,workspaceId,request.id,request.client_id,request.engagement_id).first<{found:number}>();
  if(!assignedContact||file.created_by_actor_id!==context.actor.id)
    throw new ApiError('FORBIDDEN_SCOPE','Only the assigned client contact may submit a PDF reserved and uploaded against this request.');
  const required=JSON.parse(request.required_signatories_json) as string[];
  if(required.some(name=>!p.signatoryNames.toLocaleLowerCase().includes(name.toLocaleLowerCase())))throw new ApiError('VALIDATION_FAILED','The named signatories do not include every required management representative.');
  const revision=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS value FROM representation_returns WHERE workspace_id=? AND request_id=?`).bind(workspaceId,request.id).first<{value:number}>();
  const returnId=crypto.randomUUID(),returnRevision=Number(revision?.value??1),sourceHash=await sha256Hex(JSON.stringify({requestId:request.id,revision:returnRevision,signedFileId:file.id,fileSha256:file.sha256,
    representationDate:p.representationDate,signatoryNames:p.signatoryNames,requiredSignatories:required}));
  const statements=[env.DB.prepare(`INSERT INTO representation_returns(id,workspace_id,request_id,revision,signed_file_id,file_sha256,representation_date,signatory_names,received_by_actor_id,received_at,source_hash)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(returnId,workspaceId,request.id,returnRevision,file.id,file.sha256,p.representationDate,p.signatoryNames,context.actor.id,now,sourceHash),
    env.DB.prepare(`UPDATE representation_requests SET version=version+1,status='RECEIVED',current_return_id=?,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status IN ('SENT','REJECTED')`)
      .bind(returnId,now,workspaceId,request.id,request.version)];
  return mut(statements,{requestId:request.id,returnId,revision:returnRevision,status:'RECEIVED',fileSha256:file.sha256},'REPRESENTATION_RETURN',returnId,request.version,request.version+1,{requestId:request.id,sourceHash});
}

async function buildRepresentationReview(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'representation.review'}>,now:string){
  reviewer(context);const p=command.payload;
  const request=await env.DB.prepare(`SELECT r.id,r.version,r.client_id,r.engagement_id,r.proposed_report_date,r.dependency_hash,r.current_return_id,r.status,rr.signed_file_id,rr.file_sha256,rr.representation_date,rr.signatory_names,rr.source_hash
    FROM representation_requests r JOIN representation_returns rr ON rr.workspace_id=r.workspace_id AND rr.request_id=r.id AND rr.id=r.current_return_id
    WHERE r.workspace_id=? AND r.id=? AND rr.id=?`).bind(workspaceId,p.requestId,p.returnId)
    .first<{id:string;version:number;client_id:string;engagement_id:string;proposed_report_date:string;dependency_hash:string;current_return_id:string;status:string;signed_file_id:string;file_sha256:string;representation_date:string;signatory_names:string;source_hash:string}>();
  if(!request||request.status!=='RECEIVED')throw new ApiError('VERSION_CONFLICT','Review the current received signed representation.');
  if(request.representation_date>request.proposed_report_date)throw new ApiError('VALIDATION_FAILED','A signed representation dated after the proposed auditor’s report date cannot be accepted.');
  const engagement=await engagementRow(env,workspaceId,context,request.engagement_id),pins=await reportPins(env,workspaceId,engagement.id);
  if(engagement.portal_frozen_at||p.dependencyHash!==request.dependency_hash||p.dependencyHash!==await sha256Hex(JSON.stringify({engagementId:engagement.id,srmVersionId:pins.srm.id,srmHash:pins.srm.dependency_hash,
    statementSnapshotId:pins.snapshot.id,statementSourceHash:pins.snapshot.source_hash,standardsProfileId:pins.profile.id,reportDate:request.proposed_report_date,
    requiredSignatories:JSON.parse(String((await env.DB.prepare(`SELECT required_signatories_json FROM representation_requests WHERE workspace_id=? AND id=?`).bind(workspaceId,request.id).first<{required_signatories_json:string}>())?.required_signatories_json??'[]'))})))
    throw new ApiError('STALE_DEPENDENCY','The accepted representation would not cover the current report source pins. Prepare and review a new request.');
  const expectedDecision=p.decision==='ACCEPT';
  const evidenceChecks={identity:p.identityConfirmed,capacity:p.capacityConfirmed,completeness:p.completenessConfirmed,period:p.periodConfirmed,date:p.dateConfirmed,consistency:p.consistencyConfirmed};
  if(expectedDecision&&Object.values(evidenceChecks).some(value=>!value))
    throw new ApiError('GATE_BLOCKED','Confirm the identity, authority, completeness, period, date and report consistency checks before accepting this representation.');
  if(expectedDecision){const required=JSON.parse(String((await env.DB.prepare(`SELECT required_signatories_json FROM representation_requests WHERE workspace_id=? AND id=?`).bind(workspaceId,request.id).first<{required_signatories_json:string}>())?.required_signatories_json??'[]')) as string[];
    if(required.some(name=>!request.signatory_names.toLocaleLowerCase().includes(name.toLocaleLowerCase())))throw new ApiError('GATE_BLOCKED','The signed return does not identify every required signatory.');}
  const reviewId=crypto.randomUUID(),statements=[env.DB.prepare(`INSERT INTO representation_reviews(id,workspace_id,request_id,return_id,decision,review_reason,evidence_checks_json,dependency_hash,reviewed_by_actor_id,reviewed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(reviewId,workspaceId,request.id,request.current_return_id,p.decision,p.reviewReason,JSON.stringify(evidenceChecks),p.dependencyHash,context.actor.id,now),
    env.DB.prepare(`UPDATE representation_requests SET version=version+1,status=?,updated_at=? WHERE workspace_id=? AND id=? AND version=? AND status='RECEIVED'`)
      .bind(expectedDecision?'ACCEPTED':'REJECTED',now,workspaceId,request.id,request.version)];
  return mut(statements,{requestId:request.id,returnId:request.current_return_id,reviewId,status:expectedDecision?'ACCEPTED':'REJECTED',dependencyHash:p.dependencyHash},'REPRESENTATION_REVIEW',reviewId,request.version,request.version+1,
    {requestId:request.id,returnId:request.current_return_id,decision:p.decision,dependencyHash:p.dependencyHash,evidenceChecks});
}

async function buildBundlePrepare(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'bundle.prepare'}>,now:string){
  reviewer(context);const p=command.payload,engagement=await engagementRow(env,workspaceId,context,p.engagementId);
  if(engagement.lifecycle_state!=='PARTNER_APPROVAL'||engagement.locked_at||engagement.portal_frozen_at)throw new ApiError('INVALID_STATE','A release candidate can be prepared only during unlocked Partner Approval.');
  const report=await env.DB.prepare(`SELECT c.id,c.status,c.proposed_report_date,c.dependency_hash,c.opinion_version_id,c.financial_statement_approval_id,c.signature_asset_id,c.report_artifact_id,
      a.file_version_id,a.content_sha256,a.size_bytes FROM report_candidates c JOIN generated_artifacts a ON a.workspace_id=c.workspace_id AND a.id=c.report_artifact_id
    WHERE c.workspace_id=? AND c.id=? AND c.engagement_id=?`).bind(workspaceId,p.reportCandidateId,engagement.id)
    .first<{id:string;status:string;proposed_report_date:string;dependency_hash:string;opinion_version_id:string;financial_statement_approval_id:string;signature_asset_id:string;report_artifact_id:string;file_version_id:string;content_sha256:string;size_bytes:number}>();
  if(!report||report.status!=='READY'||report.proposed_report_date!==currentQatarDate())throw new ApiError('STALE_DEPENDENCY','A current, ready report candidate dated today in Qatar is required.');
  const management=await env.DB.prepare(`SELECT id,revision,source_hash,artifact_id,file_version_id,status FROM management_letter_versions
    WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(workspaceId,p.managementLetterVersionId,engagement.id)
    .first<{id:string;revision:number;source_hash:string;artifact_id:string|null;file_version_id:string|null;status:string}>();
  if(!management||management.status!=='READY'||!management.artifact_id||!management.file_version_id)throw new ApiError('GATE_BLOCKED','A prepared immutable Management Letter is required.');
  const representation=await env.DB.prepare(`SELECT r.id,r.version,r.status,r.dependency_hash,r.proposed_report_date,r.current_return_id,rr.source_hash AS return_hash,rr.file_sha256,rr.signed_file_id
    FROM representation_requests r JOIN representation_returns rr ON rr.workspace_id=r.workspace_id AND rr.request_id=r.id AND rr.id=r.current_return_id
    JOIN representation_reviews rv ON rv.workspace_id=rr.workspace_id AND rv.request_id=r.id AND rv.return_id=rr.id AND rv.decision='ACCEPT' AND rv.dependency_hash=r.dependency_hash
    WHERE r.workspace_id=? AND r.id=? AND r.engagement_id=? AND r.status='ACCEPTED'`).bind(workspaceId,p.representationRequestId,engagement.id)
    .first<{id:string;version:number;status:string;dependency_hash:string;proposed_report_date:string;current_return_id:string;return_hash:string;file_sha256:string;signed_file_id:string}>();
  if(!representation||representation.proposed_report_date!==report.proposed_report_date)throw new ApiError('GATE_BLOCKED','A signed and accepted representation for this exact proposed report date is required.');
  if(representation.dependency_hash!==await currentRepresentationHash(env,workspaceId,engagement.id,representation.proposed_report_date,representation.id))
    throw new ApiError('STALE_DEPENDENCY','The accepted representation is no longer pinned to the current reporting sources.');
  const blockers=await criticalConfirmationBlockers(env,workspaceId,engagement.id);if(blockers.length)throw new ApiError('GATE_BLOCKED','Resolve every critical confirmation blocker before bundle preparation.',{blockers});
  const pins=await reportPins(env,workspaceId,engagement.id);
  const commercial=await env.DB.prepare(`SELECT l.id AS letter_id,l.fee_minor,l.proposal_version_id,i.id AS advance_invoice_id,i.subtotal_minor,i.tax_policy_version_id,
      t.tax_basis_points,pv.fee_minor AS accepted_fee,cr.id AS route_id,cr.version AS route_version,ct.id AS contact_id,ct.full_name,ct.email
    FROM engagement_letters l JOIN invoices i ON i.workspace_id=l.workspace_id AND i.engagement_letter_id=l.id AND i.kind='ADVANCE' AND i.status='ISSUED'
    JOIN billing_tax_policy_versions t ON t.workspace_id=i.workspace_id AND t.id=i.tax_policy_version_id
    JOIN proposal_versions pv ON pv.workspace_id=l.workspace_id AND pv.id=l.proposal_version_id
    JOIN contact_routes cr ON cr.workspace_id=l.workspace_id AND cr.client_id=l.client_id AND cr.purpose='FINAL_REPORT' AND cr.is_primary=1
    JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id AND ct.active=1 AND ct.email IS NOT NULL
    WHERE l.workspace_id=? AND l.engagement_id=?`).bind(workspaceId,engagement.id)
    .first<{letter_id:string;fee_minor:number;proposal_version_id:string;advance_invoice_id:string;subtotal_minor:number;tax_policy_version_id:string;tax_basis_points:number;accepted_fee:number;route_id:string;route_version:number;contact_id:string;full_name:string;email:string}>();
  if(!commercial)throw new ApiError('GATE_BLOCKED','The issued advance invoice, accepted fee revision, approved tax policy and active primary report route are required.');
  if(commercial.fee_minor!==commercial.accepted_fee||commercial.fee_minor<commercial.subtotal_minor)throw new ApiError('INTEGRITY_MISMATCH','The engagement letter does not reconcile to its accepted proposal fee and original advance installment.');
  const finalFee=BigInt(commercial.fee_minor)-BigInt(commercial.subtotal_minor),tax=(finalFee*BigInt(commercial.tax_basis_points)+5000n)/10000n;
  if(finalFee<=0n||finalFee>BigInt(Number.MAX_SAFE_INTEGER)||tax>BigInt(Number.MAX_SAFE_INTEGER))throw new ApiError('GATE_BLOCKED','The contractual final installment is not a positive supported QAR amount.');
  const recipient={contactRouteId:commercial.route_id,contactRouteVersion:commercial.route_version,contactId:commercial.contact_id,name:commercial.full_name,email:commercial.email};
  const stagedInvoiceId=crypto.randomUUID(),invoiceNumber=`AS-${engagement.code.replace(/[^A-Z0-9]/gi,'').toUpperCase()}-FIN-${stagedInvoiceId.slice(0,8).toUpperCase()}`;
  const dueDate=addDays(currentQatarDate(),30),revision=await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS value FROM bundle_candidates WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId,engagement.id).first<{value:number}>();
  const candidateId=crypto.randomUUID(),jobId=crypto.randomUUID(),candidateRevision=Number(revision?.value??1);
  const dependencyHash=await sha256Hex(JSON.stringify({engagementId:engagement.id,srmId:pins.srm.id,srmHash:pins.srm.dependency_hash,statementHash:pins.snapshot.source_hash,
    reportCandidateId:report.id,reportDependencyHash:report.dependency_hash,reportSha256:report.content_sha256,opinionId:report.opinion_version_id,approvalId:report.financial_statement_approval_id,
    managementLetterId:management.id,managementSourceHash:management.source_hash,representationId:representation.id,representationDependencyHash:representation.dependency_hash,
    returnId:representation.current_return_id,returnHash:representation.return_hash,feeRevisionId:commercial.proposal_version_id,acceptedFee:commercial.fee_minor,
    advanceInvoiceId:commercial.advance_invoice_id,advanceSubtotal:commercial.subtotal_minor,taxPolicyId:commercial.tax_policy_version_id,taxBasisPoints:commercial.tax_basis_points,
    finalFee:finalFee.toString(),finalTax:tax.toString(),recipient,reportDate:report.proposed_report_date}));
  const payload={documentType:'BUNDLE_CANDIDATE',bundleCandidateId:candidateId,engagementId:engagement.id,clientId:engagement.client_id,reportCandidateId:report.id,
    managementLetterVersionId:management.id,representationRequestId:representation.id,representationReturnId:representation.current_return_id,stagedFinalInvoiceId:stagedInvoiceId,
    invoiceNumber,finalFeeMinor:finalFee.toString(),finalTaxMinor:tax.toString(),taxPolicyVersionId:commercial.tax_policy_version_id,feeRevisionId:commercial.proposal_version_id,
    engagementLetterId:commercial.letter_id,invoiceDueDate:dueDate,recipientSnapshot:recipient,dependencyHash,reportDate:report.proposed_report_date,commandId:crypto.randomUUID()};
  const statements=[env.DB.prepare(`INSERT INTO bundle_candidates(id,workspace_id,client_id,engagement_id,revision,report_candidate_id,management_letter_version_id,representation_request_id,final_invoice_id,
      staged_final_invoice_id,staged_invoice_number,final_fee_minor,final_tax_minor,tax_policy_version_id,fee_revision_id,engagement_letter_id,invoice_due_date,recipient_snapshot_json,
      dependency_hash,content_hash,status,failure_code,prepared_by_actor_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?, ?,NULL,'PREPARING',NULL,?,?,?)`).bind(candidateId,workspaceId,engagement.client_id,engagement.id,candidateRevision,report.id,management.id,representation.id,
      stagedInvoiceId,invoiceNumber,Number(finalFee),Number(tax),commercial.tax_policy_version_id,commercial.proposal_version_id,commercial.letter_id,dueDate,JSON.stringify(recipient),dependencyHash,context.actor.id,now,now),
    outboxJob(env,workspaceId,jobId,candidateId,candidateRevision,payload,`bundle-candidate:${candidateId}`,now)];
  return mut(statements,{jobId,bundleCandidateId:candidateId,status:'PREPARING',candidateRevision,parts:['REPORT_AND_FS','MANAGEMENT_LETTER','REPRESENTATION','CORRESPONDENCE_TRAIL','FINAL_FEE_NOTE'],dependencyHash,
    finalInstallmentMinor:finalFee.toString(),taxMinor:tax.toString()},'BUNDLE_CANDIDATE',candidateId,null,candidateRevision,{jobId,dependencyHash,finalFeeMinor:finalFee.toString(),taxMinor:tax.toString()});
}

async function currentRepresentationHash(env:Env,workspaceId:string,engagementId:string,reportDate:string,requestId:string){
  const pins=await reportPins(env,workspaceId,engagementId);const required=await env.DB.prepare(`SELECT required_signatories_json FROM representation_requests WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,requestId).first<{required_signatories_json:string}>();
  return sha256Hex(JSON.stringify({engagementId,srmVersionId:pins.srm.id,srmHash:pins.srm.dependency_hash,statementSnapshotId:pins.snapshot.id,
    statementSourceHash:pins.snapshot.source_hash,standardsProfileId:pins.profile.id,reportDate,requiredSignatories:JSON.parse(required?.required_signatories_json??'[]')}));
}

async function buildRetentionSave(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'retention-policy.save'}>,now:string){
  partner(context);const p=command.payload;
  if(p.retainIndefinitely===Boolean(p.retentionYears))throw new ApiError('VALIDATION_FAILED','Choose exactly one retention option: a positive retention period or indefinite retention.');
  const latest=await env.DB.prepare(`SELECT COALESCE(MAX(version),0)+1 AS value FROM retention_policies WHERE workspace_id=?`).bind(workspaceId).first<{value:number}>();
  const idValue=crypto.randomUUID(),version=Number(latest?.value??1);
  return mut([env.DB.prepare(`INSERT INTO retention_policies(id,workspace_id,version,name,assembly_days,retention_years,retain_indefinitely,legal_basis,approved_by_actor_id,approved_at)
    VALUES(?,?,?, ?,60,?,?,?,?,?)`).bind(idValue,workspaceId,version,p.name,p.retentionYears??null,p.retainIndefinitely?1:0,p.legalBasis,context.actor.id,now),
    env.DB.prepare(`UPDATE workspaces SET retention_policy_id=? WHERE id=? AND data_mode='BUSINESS'`).bind(idValue,workspaceId)],
    {retentionPolicyId:idValue,version,assemblyDays:60,retentionYears:p.retentionYears??null,retainIndefinitely:p.retainIndefinitely},'RETENTION_POLICY',idValue,null,version,{version,assemblyDays:60});
}

async function buildArchiveNote(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'archive.note'}>,now:string){
  reviewer(context);const p=command.payload,engagement=await engagementRow(env,workspaceId,context,p.engagementId);
  if(engagement.lifecycle_state!=='COMPLIANCE_COUNTDOWN'||engagement.locked_at||!engagement.released_at)throw new ApiError('WORKSPACE_FROZEN','Administrative assembly notes are available only before the archive lock.');
  const tables:Record<string,{sql:string;binds:unknown[]}>= {
    REPORT_CANDIDATE:{sql:`SELECT 1 FROM report_candidates WHERE workspace_id=? AND engagement_id=? AND id=?`,binds:[workspaceId,engagement.id,p.relatedRecordId]},
    BUNDLE_CANDIDATE:{sql:`SELECT 1 FROM bundle_candidates WHERE workspace_id=? AND engagement_id=? AND id=?`,binds:[workspaceId,engagement.id,p.relatedRecordId]},
    DELIVERABLE_BUNDLE:{sql:`SELECT 1 FROM deliverable_bundles WHERE workspace_id=? AND engagement_id=? AND id=?`,binds:[workspaceId,engagement.id,p.relatedRecordId]},
    FILE_VERSION:{sql:`SELECT 1 FROM file_versions WHERE workspace_id=? AND engagement_id=? AND id=? AND state='COMMITTED'`,binds:[workspaceId,engagement.id,p.relatedRecordId]},
    FINDING:{sql:`SELECT 1 FROM findings WHERE workspace_id=? AND engagement_id=? AND id=?`,binds:[workspaceId,engagement.id,p.relatedRecordId]},
    CONFIRMATION:{sql:`SELECT 1 FROM confirmations WHERE workspace_id=? AND engagement_id=? AND id=?`,binds:[workspaceId,engagement.id,p.relatedRecordId]},
    STATEMENT_SNAPSHOT:{sql:`SELECT 1 FROM statement_snapshots WHERE workspace_id=? AND engagement_id=? AND id=?`,binds:[workspaceId,engagement.id,p.relatedRecordId]}
  };
  const target=tables[p.relatedRecordType];if(!target||!await env.DB.prepare(target.sql).bind(...target.binds).first())throw new ApiError('NOT_FOUND','Choose a retained record from this engagement to annotate.');
  const idValue=crypto.randomUUID();return mut([env.DB.prepare(`INSERT INTO archive_assembly_notes(id,workspace_id,client_id,engagement_id,text,related_record_type,related_record_id,recorded_by_actor_id,recorded_at,administrative_only)
    VALUES(?,?,?,?,?,?,?,?,?,1)`).bind(idValue,workspaceId,engagement.client_id,engagement.id,p.text,p.relatedRecordType,p.relatedRecordId,context.actor.id,now)],
    {assemblyNoteId:idValue,administrativeOnly:true,recordedAt:now},'ARCHIVE_ASSEMBLY_NOTE',idValue,null,1,{relatedRecordType:p.relatedRecordType,relatedRecordId:p.relatedRecordId});
}

async function buildArchiveLock(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'archive.lock'}>,commandId:string,now:string){
  partner(context);const p=command.payload,engagement=await engagementRow(env,workspaceId,context,p.engagementId);
  if(engagement.lifecycle_state!=='COMPLIANCE_COUNTDOWN'||engagement.locked_at||!engagement.released_at)throw new ApiError('INVALID_STATE','An early archive lock is available only for a released engagement before it is already locked.');
  const bundle=await env.DB.prepare(`SELECT id FROM deliverable_bundles WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId,engagement.id).first<{id:string}>();
  if(!bundle)throw new ApiError('GATE_BLOCKED','A published five-part deliverable bundle is required before archive assembly.');
  const retention=await env.DB.prepare(`SELECT id FROM retention_policies WHERE workspace_id=? ORDER BY version DESC LIMIT 1`).bind(workspaceId).first<{id:string}>();
  if(!retention)throw new ApiError('GATE_BLOCKED','Approve a firm retention policy before locking an archive.');
  const runId=crypto.randomUUID(),jobId=crypto.randomUUID(),payload={documentType:'SEAL_ARCHIVE',archiveRunId:runId,engagementId:engagement.id,clientId:engagement.client_id,
    bundleId:bundle.id,reason:'EARLY_PARTNER_LOCK',lockedByActorId:context.actor.id,commandId};
  const statements=[assertDb(env,workspaceId,704,`EXISTS(SELECT 1 FROM engagements WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state='COMPLIANCE_COUNTDOWN' AND locked_at IS NULL)`
    ,workspaceId,engagement.id,engagement.version),
    env.DB.prepare(`UPDATE engagements SET locked_at=?,version=version+1,updated_at=?,updated_by_actor_id=? WHERE workspace_id=? AND id=? AND version=? AND locked_at IS NULL`)
      .bind(now,now,context.actor.id,workspaceId,engagement.id,engagement.version),
    outboxJob(env,workspaceId,jobId,runId,1,payload,`archive-seal:${engagement.id}`,now,'SEAL_ARCHIVE'),
    env.DB.prepare(`INSERT INTO archive_runs(id,workspace_id,engagement_id,status,frozen_snapshot_hash,missing_files_json,error_code,last_attempt_at,job_id,created_at,updated_at)
      VALUES(?,?,?,'QUEUED',NULL,'[]',NULL,NULL,?,?,?)`).bind(runId,workspaceId,engagement.id,jobId,now,now)];
  return mut(statements,{jobId,archiveRunId:runId,effectiveReadOnlyAt:now,status:'QUEUED'},'ARCHIVE_RUN',runId,null,1,{jobId,reason:'EARLY_PARTNER_LOCK'});
}

/** Locks every due released engagement even if archive assembly is delayed, then durably queues its seal job. */
export async function queueDueBusinessArchives(env:Env,now:string):Promise<number>{
  const due=(await env.DB.prepare(`SELECT e.id,e.workspace_id,e.client_id,e.version,e.archive_due_at
      FROM engagements e JOIN workspaces w ON w.id=e.workspace_id AND w.data_mode='BUSINESS'
      WHERE e.lifecycle_state='COMPLIANCE_COUNTDOWN' AND e.archive_due_at IS NOT NULL AND e.archive_due_at<=? AND e.locked_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM archive_runs r WHERE r.workspace_id=e.workspace_id AND r.engagement_id=e.id)
      ORDER BY e.archive_due_at,e.workspace_id,e.id LIMIT 100`).bind(now).all<{id:string;workspace_id:string;client_id:string;version:number;archive_due_at:string}>()).results??[];
  let queued=0;
  for(const engagement of due){
    const runId=crypto.randomUUID(),jobId=crypto.randomUUID(),commandId=crypto.randomUUID();
    const payload={documentType:'SEAL_ARCHIVE',archiveRunId:runId,engagementId:engagement.id,clientId:engagement.client_id,
      reason:'DEADLINE',lockedByActorId:null,commandId};
    try{
      await env.DB.batch([
        env.DB.prepare(`UPDATE engagements SET locked_at=?,version=version+1,updated_at=?,updated_by_actor_id=NULL
          WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state='COMPLIANCE_COUNTDOWN' AND locked_at IS NULL AND archive_due_at<=?`)
          .bind(now,now,engagement.workspace_id,engagement.id,engagement.version,now),
        outboxJob(env,engagement.workspace_id,jobId,runId,1,payload,`archive-seal:${engagement.id}`,now,'SEAL_ARCHIVE'),
        env.DB.prepare(`INSERT INTO archive_runs(id,workspace_id,engagement_id,status,frozen_snapshot_hash,missing_files_json,error_code,last_attempt_at,job_id,created_at,updated_at)
          VALUES(?,?,?,'QUEUED',NULL,'[]',NULL,NULL,?,?,?)`).bind(runId,engagement.workspace_id,engagement.id,jobId,now,now)
      ]);
      queued++;
    }catch(error){
      const existing=await env.DB.prepare(`SELECT 1 FROM archive_runs WHERE workspace_id=? AND engagement_id=?`).bind(engagement.workspace_id,engagement.id).first();
      if(!existing)throw error;
    }
  }
  return queued;
}

async function copyReleaseFile(env:Env,workspaceId:string,engagementId:string,fileId:string,bundleId:string,kind:string,now:string){
  const file=await env.DB.prepare(`SELECT id,original_name,media_type,size_bytes,sha256,object_key,state,immutable FROM file_versions
    WHERE workspace_id=? AND id=? AND engagement_id=? AND state='COMMITTED' AND immutable=1`).bind(workspaceId,fileId,engagementId)
    .first<{id:string;original_name:string;media_type:string;size_bytes:number;sha256:string;object_key:string;state:string;immutable:number}>();
  if(!file||!file.sha256)throw new ApiError('GATE_BLOCKED',`The ${kind} file is not a committed immutable version.`);
  const stored=await env.FILES.get(file.object_key);if(!stored)throw new ApiError('INTEGRITY_MISMATCH',`The ${kind} source bytes are missing.`);
  const bytes=new Uint8Array(await stored.arrayBuffer());if(bytes.byteLength!==file.size_bytes||await sha256BytesHex(bytes)!==file.sha256)throw new ApiError('INTEGRITY_MISMATCH',`The ${kind} source bytes failed hash verification.`);
  const idValue=crypto.randomUUID(),safe=file.original_name.replace(/[^A-Z0-9._-]/gi,'-').slice(0,160),key=`workspaces/${workspaceId}/released/${bundleId}/${kind}/${file.sha256}.pdf`;
  await env.FILES.put(key,bytes,{httpMetadata:{contentType:file.media_type},customMetadata:{sha256:file.sha256,bundleId,partKind:kind,sourceFileId:file.id}});
  const verified=await env.FILES.get(key);if(!verified||await sha256BytesHex(new Uint8Array(await verified.arrayBuffer()))!==file.sha256)throw new ApiError('INTEGRITY_MISMATCH',`The staged ${kind} release alias failed read-back verification.`);
  return {id:idValue,sourceId:file.id,originalName:safe,mediaType:file.media_type,size:file.size_bytes,sha256:file.sha256,key,now,bytes};
}

async function buildReportRelease(env:Env,workspaceId:string,context:BusinessContext,command:Extract<BusinessReportingCommand,{type:'report.release'}>,commandId:string,now:string){
  partner(context);const p=command.payload;
  const candidate=await env.DB.prepare(`SELECT b.*,e.version AS engagement_version,e.client_id AS engagement_client,e.code,e.period_start,e.period_end,e.engagement_type,e.lifecycle_state,e.locked_at,e.portal_frozen_at,
      e.active_tb_version_id,e.active_mapping_version_id,e.active_materiality_version_id,e.approved_planning_version_id,e.standards_profile_id,e.contract_fee_minor,e.released_at,
      rc.status AS report_status,rc.proposed_report_date,rc.dependency_hash AS report_dependency_hash,rc.opinion_version_id,rc.financial_statement_approval_id,rc.signature_asset_id,
      ra.content_sha256 AS report_sha256,ra.file_version_id AS report_file_id,ra.size_bytes AS report_size,op.dependency_hash AS opinion_hash,op.srm_version_id,
      fa.source_hash AS approval_hash,fa.draft_id,fa.draft_version,fd.version AS current_draft_version,fd.status AS draft_status,
      ml.status AS management_status,ml.source_hash AS management_hash,ml.file_version_id AS management_file_id,
      rr.status AS representation_status,rr.dependency_hash AS representation_hash,rr.current_return_id,ret.source_hash AS return_hash,ret.file_sha256 AS return_sha256,ret.signed_file_id,
      fs.id AS srm_id,fs.dependency_hash AS srm_hash,snap.source_hash AS statement_hash,asset.signature_sha256,asset.seal_sha256,cons.id AS consent_id,
      el.fee_minor AS accepted_fee,el.proposal_version_id,el.id AS letter_id,advance.id AS advance_invoice_id,advance.subtotal_minor AS advance_subtotal,advance.tax_policy_version_id AS advance_tax_policy,
      tax.tax_basis_points,cr.version AS current_route_version,cr.contact_id AS current_route_contact,ct.full_name AS current_route_name,ct.email AS current_route_email
    FROM bundle_candidates b JOIN engagements e ON e.workspace_id=b.workspace_id AND e.id=b.engagement_id
    JOIN report_candidates rc ON rc.workspace_id=b.workspace_id AND rc.id=b.report_candidate_id
    JOIN generated_artifacts ra ON ra.workspace_id=rc.workspace_id AND ra.id=rc.report_artifact_id
    JOIN opinion_versions op ON op.workspace_id=rc.workspace_id AND op.id=rc.opinion_version_id
    JOIN financial_statement_approvals fa ON fa.workspace_id=rc.workspace_id AND fa.id=rc.financial_statement_approval_id
    JOIN financial_statement_drafts fd ON fd.workspace_id=fa.workspace_id AND fd.id=fa.draft_id
    JOIN management_letter_versions ml ON ml.workspace_id=b.workspace_id AND ml.id=b.management_letter_version_id
    JOIN representation_requests rr ON rr.workspace_id=b.workspace_id AND rr.id=b.representation_request_id
    JOIN representation_returns ret ON ret.workspace_id=rr.workspace_id AND ret.id=rr.current_return_id
    JOIN srm_versions fs ON fs.workspace_id=e.workspace_id AND fs.engagement_id=e.id AND fs.id=op.srm_version_id
    JOIN statement_snapshots snap ON snap.workspace_id=fs.workspace_id AND snap.id=fs.statement_snapshot_id
    JOIN report_signature_assets asset ON asset.workspace_id=b.workspace_id AND asset.id=rc.signature_asset_id AND asset.status='ACTIVE'
    JOIN report_signature_consents cons ON cons.workspace_id=b.workspace_id AND cons.report_candidate_id=rc.id AND cons.opinion_version_id=op.id
      AND cons.signature_asset_id=asset.id AND cons.candidate_content_hash=ra.content_sha256 AND cons.proposed_report_date=rc.proposed_report_date
    JOIN engagement_letters el ON el.workspace_id=b.workspace_id AND el.id=b.engagement_letter_id
    JOIN invoices advance ON advance.workspace_id=b.workspace_id AND advance.engagement_letter_id=el.id AND advance.kind='ADVANCE' AND advance.status='ISSUED'
    JOIN billing_tax_policy_versions tax ON tax.workspace_id=b.workspace_id AND tax.id=b.tax_policy_version_id
    JOIN contact_routes cr ON cr.workspace_id=b.workspace_id AND cr.id=json_extract(b.recipient_snapshot_json,'$.contactRouteId') AND cr.client_id=b.client_id AND cr.purpose='FINAL_REPORT' AND cr.is_primary=1
    JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id AND ct.active=1 AND ct.email IS NOT NULL
    WHERE b.workspace_id=? AND b.id=?`).bind(workspaceId,p.candidateId).first<Record<string,any>>();
  if(!candidate||candidate.status!=='READY'||candidate.content_hash!==p.expectedContentHash||candidate.engagement_client!==candidate.client_id
    ||candidate.lifecycle_state!=='PARTNER_APPROVAL'||candidate.locked_at||candidate.portal_frozen_at||candidate.report_status!=='READY'||candidate.management_status!=='READY'
    ||candidate.representation_status!=='ACCEPTED'||candidate.current_return_id===null||candidate.draft_status!=='APPROVED'||candidate.current_draft_version!==candidate.draft_version)
    throw new ApiError('GATE_BLOCKED','The exact ready report bundle or one of its approved source records is no longer available.');
  if(candidate.proposed_report_date!==p.proposedReportDate||p.proposedReportDate!==currentQatarDate())throw new ApiError('STALE_DEPENDENCY','The report consent and candidate must match today’s Qatar date. Prepare and reconfirm a current report candidate.');
  const pins=await reportPins(env,workspaceId,candidate.engagement_id);
  if(candidate.srm_id!==pins.srm.id||candidate.statement_hash!==pins.snapshot.source_hash||candidate.srm_version_id!==pins.srm.id||candidate.standards_profile_id!==pins.profile.id)
    throw new ApiError('STALE_DEPENDENCY','The cleared SRM or statement source changed after candidate preparation.');
  const opinion=await env.DB.prepare(`SELECT dependency_hash FROM opinion_versions WHERE workspace_id=? AND id=?`).bind(workspaceId,candidate.opinion_version_id).first<{dependency_hash:string}>();
  const asset=await env.DB.prepare(`SELECT id,signature_sha256,seal_sha256 FROM report_signature_assets WHERE workspace_id=? AND id=? AND status='ACTIVE'`).bind(workspaceId,candidate.signature_asset_id)
    .first<{id:string;signature_sha256:string;seal_sha256:string}>();
  const reportDependency=await sha256Hex(JSON.stringify({engagementId:candidate.engagement_id,srmVersionId:pins.srm.id,srmDependencyHash:pins.srm.dependency_hash,opinionId:candidate.opinion_version_id,
    opinionHash:opinion?.dependency_hash,approvalId:candidate.financial_statement_approval_id,approvalHash:candidate.approval_hash,snapshotHash:pins.snapshot.source_hash,
    signatureAssetId:candidate.signature_asset_id,signatureSha256:asset?.signature_sha256,sealSha256:asset?.seal_sha256,proposedReportDate:candidate.proposed_report_date}));
  if(!opinion||!asset||reportDependency!==candidate.report_dependency_hash||asset.signature_sha256!==candidate.signature_sha256||asset.seal_sha256!==candidate.seal_sha256)
    throw new ApiError('STALE_DEPENDENCY','The Partner opinion, approved statements or exact signature asset changed after report preparation.');
  const representationHash=await currentRepresentationHash(env,workspaceId,candidate.engagement_id,candidate.proposed_report_date,candidate.representation_request_id);
  if(representationHash!==candidate.representation_hash||candidate.return_sha256!==candidate.return_hash)throw new ApiError('STALE_DEPENDENCY','The signed representation no longer covers the current approved reporting sources.');
  const critical=await criticalConfirmationBlockers(env,workspaceId,candidate.engagement_id);if(critical.length)throw new ApiError('GATE_BLOCKED','Critical confirmation clearance changed after bundle preparation.',{blockers:critical});
  const findings=(await env.DB.prepare(`SELECT id,version,source_hash FROM findings WHERE workspace_id=? AND engagement_id=?`).bind(workspaceId,candidate.engagement_id).all<{id:string;version:number;source_hash:string}>()).results??[];
  const findingById=new Map(findings.map(row=>[row.id,row]));
  const management=await env.DB.prepare(`SELECT items_snapshot_json FROM management_letter_versions WHERE workspace_id=? AND id=?`).bind(workspaceId,candidate.management_letter_version_id).first<{items_snapshot_json:string}>();
  const managementItems=JSON.parse(management?.items_snapshot_json??'[]') as Array<{findingId:string;findingVersion:number;sourceHash:string}>;
  if(managementItems.some(item=>{const finding=findingById.get(item.findingId);return !finding||finding.version!==item.findingVersion||finding.source_hash!==item.sourceHash;}))
    throw new ApiError('STALE_DEPENDENCY','A management-letter finding changed after the reviewed version was prepared.');
  const route=await env.DB.prepare(`SELECT cr.id,cr.version,cr.contact_id,ct.full_name,ct.email FROM contact_routes cr JOIN contacts ct ON ct.workspace_id=cr.workspace_id AND ct.client_id=cr.client_id AND ct.id=cr.contact_id
    WHERE cr.workspace_id=? AND cr.id=? AND cr.client_id=? AND cr.purpose='FINAL_REPORT' AND cr.is_primary=1 AND ct.active=1 AND ct.email IS NOT NULL`)
    .bind(workspaceId,JSON.parse(String(candidate.recipient_snapshot_json)).contactRouteId,candidate.client_id).first<{id:string;version:number;contact_id:string;full_name:string;email:string}>();
  if(!route||route.version!==candidate.current_route_version||route.contact_id!==candidate.current_route_contact||route.full_name!==candidate.current_route_name||route.email!==candidate.current_route_email)
    throw new ApiError('STALE_DEPENDENCY','The final report contact route changed after bundle preparation.');
  const recipient={contactRouteId:route.id,contactRouteVersion:route.version,contactId:route.contact_id,name:route.full_name,email:route.email};
  if(JSON.stringify(recipient)!==JSON.stringify(JSON.parse(candidate.recipient_snapshot_json)))throw new ApiError('STALE_DEPENDENCY','The bundle recipient snapshot changed. Prepare and review a new release candidate.');
  const fee=BigInt(candidate.accepted_fee)-BigInt(candidate.advance_subtotal),tax=(fee*BigInt(candidate.tax_basis_points)+5000n)/10000n;
  if(fee<=0n||fee!==BigInt(candidate.final_fee_minor)||tax!==BigInt(candidate.final_tax_minor)||candidate.accepted_fee!==candidate.contract_fee_minor||candidate.proposal_version_id!==candidate.fee_revision_id
    ||candidate.advance_tax_policy!==candidate.tax_policy_version_id)throw new ApiError('STALE_DEPENDENCY','The accepted commercial fee or pinned tax policy changed after bundle preparation.');
  const bundleDependency=await sha256Hex(JSON.stringify({engagementId:candidate.engagement_id,srmId:pins.srm.id,srmHash:pins.srm.dependency_hash,statementHash:pins.snapshot.source_hash,
    reportCandidateId:candidate.report_candidate_id,reportDependencyHash:candidate.report_dependency_hash,reportSha256:candidate.report_sha256,opinionId:candidate.opinion_version_id,approvalId:candidate.financial_statement_approval_id,
    managementLetterId:candidate.management_letter_version_id,managementSourceHash:candidate.management_hash,representationId:candidate.representation_request_id,representationDependencyHash:candidate.representation_hash,
    returnId:candidate.current_return_id,returnHash:candidate.return_hash,feeRevisionId:candidate.proposal_version_id,acceptedFee:candidate.accepted_fee,advanceInvoiceId:candidate.advance_invoice_id,
    advanceSubtotal:candidate.advance_subtotal,taxPolicyId:candidate.tax_policy_version_id,taxBasisPoints:candidate.tax_basis_points,finalFee:fee.toString(),finalTax:tax.toString(),recipient,reportDate:candidate.proposed_report_date}));
  if(bundleDependency!==candidate.dependency_hash)throw new ApiError('STALE_DEPENDENCY','The report, representation, original fee or recipient no longer matches the release-candidate source hash.');
  const partsResult=await env.DB.prepare(`SELECT kind,primary_file_id,sha256,size_bytes FROM bundle_candidate_parts WHERE workspace_id=? AND candidate_id=? ORDER BY kind`)
    .bind(workspaceId,candidate.id).all<{kind:string;primary_file_id:string;sha256:string;size_bytes:number}>();
  const sourceParts=partsResult.results??[];
  if(sourceParts.length!==5||new Set(sourceParts.map(row=>row.kind)).size!==5)throw new ApiError('GATE_BLOCKED','Every one of the five semantic deliverable parts must be staged exactly once.');
  const signedReturn=await env.DB.prepare(`SELECT signed_file_id,file_sha256,source_hash FROM representation_returns WHERE workspace_id=? AND id=? AND request_id=?`)
    .bind(workspaceId,candidate.signed_file_id,candidate.representation_request_id).first<{signed_file_id:string;file_sha256:string;source_hash:string}>();
  if(!signedReturn||signedReturn.file_sha256!==candidate.return_sha256)throw new ApiError('STALE_DEPENDENCY','The signed representation attachment changed.');
  const verifiedParts=[] as Array<{kind:string;primary_file_id:string;sha256:string;size_bytes:number}>;
  for(const part of sourceParts){const file=await env.DB.prepare(`SELECT sha256,size_bytes,original_name FROM file_versions WHERE workspace_id=? AND id=?`).bind(workspaceId,part.primary_file_id).first<{sha256:string;size_bytes:number;original_name:string}>();
    if(!file||file.sha256!==part.sha256||file.size_bytes!==part.size_bytes)throw new ApiError('INTEGRITY_MISMATCH',`The staged ${part.kind} metadata no longer matches its manifest.`);
    const object=await env.DB.prepare(`SELECT object_key FROM file_versions WHERE workspace_id=? AND id=?`).bind(workspaceId,part.primary_file_id).first<{object_key:string}>();
    const stored=object?await env.FILES.get(object.object_key):null;if(!stored)throw new ApiError('INTEGRITY_MISMATCH',`The staged ${part.kind} object is missing.`);
    const bytes=new Uint8Array(await stored.arrayBuffer());if(bytes.byteLength!==file.size_bytes||await sha256BytesHex(bytes)!==file.sha256)throw new ApiError('INTEGRITY_MISMATCH',`The staged ${part.kind} object failed hash verification.`);
    verifiedParts.push(part);}
  const recomputedContentHash=await sha256Hex(JSON.stringify({dependencyHash:candidate.dependency_hash,parts:verifiedParts.map(item=>({kind:item.kind,sha256:item.sha256,sizeBytes:item.size_bytes})),
    representationReturn:{id:signedReturn.signed_file_id,sha256:signedReturn.file_sha256,sourceHash:signedReturn.source_hash}}));
  if(recomputedContentHash!==candidate.content_hash||recomputedContentHash!==p.expectedContentHash)throw new ApiError('INTEGRITY_MISMATCH','The five part hashes or signed representation do not match the approved bundle content hash.');
  const currentConsent=await env.DB.prepare(`SELECT id,signature_asset_id,candidate_content_hash,proposed_report_date FROM report_signature_consents WHERE workspace_id=? AND report_candidate_id=?
    AND candidate_content_hash=? AND proposed_report_date=? AND signature_asset_id=? ORDER BY consented_at DESC LIMIT 1`)
    .bind(workspaceId,candidate.report_candidate_id,candidate.report_sha256,candidate.proposed_report_date,candidate.signature_asset_id)
    .first<{id:string;signature_asset_id:string;candidate_content_hash:string;proposed_report_date:string}>();
  if(!currentConsent)throw new ApiError('STALE_DEPENDENCY','Record Partner consent for the exact report candidate and signature asset before release.');
  const existingFinal=await env.DB.prepare(`SELECT id FROM invoices WHERE workspace_id=? AND engagement_letter_id=? AND kind='FINAL' AND status<>'VOID'`).bind(workspaceId,candidate.engagement_letter_id).first<{id:string}>();
  if(existingFinal&&existingFinal.id!==candidate.staged_final_invoice_id)throw new ApiError('VERSION_CONFLICT','A final installment invoice already exists for this engagement.');
  const readiness=await env.DB.prepare(`SELECT COUNT(*) AS value FROM srm_versions s JOIN srm_clearances c ON c.workspace_id=s.workspace_id AND c.srm_version_id=s.id AND c.dependency_hash=s.dependency_hash
    WHERE s.workspace_id=? AND s.engagement_id=? AND s.id=?`).bind(workspaceId,candidate.engagement_id,pins.srm.id).first<{value:number}>();
  if(!readiness||Number(readiness.value)!==1)throw new ApiError('GATE_BLOCKED','A current Partner-cleared SRM is required at release.');
  const bundleId=crypto.randomUUID(),bundleRevision=Number((await env.DB.prepare(`SELECT COALESCE(MAX(revision),0)+1 AS value FROM deliverable_bundles WHERE workspace_id=? AND engagement_id=?`)
    .bind(workspaceId,candidate.engagement_id).first<{value:number}>())?.value??1),releasedFiles=[] as Array<Awaited<ReturnType<typeof copyReleaseFile>>>;
  for(const part of sourceParts)releasedFiles.push(await copyReleaseFile(env,workspaceId,candidate.engagement_id,part.primary_file_id,bundleId,part.kind,now));
  const representationPart=sourceParts.find(row=>row.kind==='REPRESENTATION');if(!representationPart)throw new ApiError('GATE_BLOCKED','The LOR template is missing from the representation part.');
  const returnAlias=await copyReleaseFile(env,workspaceId,candidate.engagement_id,signedReturn.signed_file_id,bundleId,'REPRESENTATION_SIGNED_RETURN',now);
  const fileByKind=new Map(sourceParts.map((part,index)=>[part.kind,releasedFiles[index]]));
  const releaseReport=fileByKind.get('REPORT_AND_FS')!,releaseManagement=fileByKind.get('MANAGEMENT_LETTER')!,releaseLOR=fileByKind.get('REPRESENTATION')!,releaseTrail=fileByKind.get('CORRESPONDENCE_TRAIL')!,releaseFee=fileByKind.get('FINAL_FEE_NOTE')!;
  const reportArtifact=crypto.randomUUID(),managementArtifact=crypto.randomUUID(),lorArtifact=crypto.randomUUID(),trailArtifact=crypto.randomUUID(),feeInvoiceArtifact=crypto.randomUUID(),returnArtifact=crypto.randomUUID();
  const reportSignatureId=crypto.randomUUID(),representationPartId=crypto.randomUUID();
  const deliverablePartIds=new Map<string,string>([['REPORT_AND_FS',crypto.randomUUID()],['MANAGEMENT_LETTER',crypto.randomUUID()],['REPRESENTATION',representationPartId],
    ['CORRESPONDENCE_TRAIL',crypto.randomUUID()],['FINAL_FEE_NOTE',crypto.randomUUID()]]);
  const invoiceId=candidate.staged_final_invoice_id,invoiceNumber=candidate.staged_invoice_number,archiveDueAt=new Date(Date.parse(now)+60*86_400_000).toISOString(),dueDate=candidate.invoice_due_date;
  const aliasRows=[...releasedFiles,returnAlias],aliasInserts=aliasRows.map(file=>env.DB.prepare(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
    VALUES(?,?,1,?,?,?,?,?,?,?,'RELEASE','COMMITTED',?,1,?,?,?,?)`).bind(file.id,workspaceId,candidate.client_id,candidate.engagement_id,file.originalName,file.mediaType,file.size,file.sha256,file.key,now,now,now,context.actor.id,context.actor.id));
  const artifactStatements=[
    env.DB.prepare(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL)`)
      .bind(reportArtifact,workspaceId,candidate.client_id,candidate.engagement_id,'REPORT','DELIVERABLE_PART',`${bundleId}:REPORT_AND_FS`,1,releaseReport.id,releaseReport.sha256,releaseReport.size,now),
    env.DB.prepare(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL)`)
      .bind(managementArtifact,workspaceId,candidate.client_id,candidate.engagement_id,'MANAGEMENT_LETTER','DELIVERABLE_PART',`${bundleId}:MANAGEMENT_LETTER`,1,releaseManagement.id,releaseManagement.sha256,releaseManagement.size,now),
    env.DB.prepare(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL)`)
      .bind(lorArtifact,workspaceId,candidate.client_id,candidate.engagement_id,'REPRESENTATION','DELIVERABLE_PART',`${bundleId}:REPRESENTATION`,1,releaseLOR.id,releaseLOR.sha256,releaseLOR.size,now),
    env.DB.prepare(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL)`)
      .bind(trailArtifact,workspaceId,candidate.client_id,candidate.engagement_id,'RELEASE_BUNDLE','DELIVERABLE_PART',`${bundleId}:CORRESPONDENCE_TRAIL`,1,releaseTrail.id,releaseTrail.sha256,releaseTrail.size,now),
    env.DB.prepare(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL)`)
      .bind(feeInvoiceArtifact,workspaceId,candidate.client_id,candidate.engagement_id,'INVOICE','INVOICE',invoiceId,1,releaseFee.id,releaseFee.sha256,releaseFee.size,now),
    env.DB.prepare(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL)`)
      .bind(returnArtifact,workspaceId,candidate.client_id,candidate.engagement_id,'REPRESENTATION','DELIVERABLE_PART',`${bundleId}:SIGNED_RETURN`,1,returnAlias.id,returnAlias.sha256,returnAlias.size,now)
  ];
  const invoiceTotal=BigInt(candidate.final_fee_minor)+BigInt(candidate.final_tax_minor);if(invoiceTotal>BigInt(Number.MAX_SAFE_INTEGER))throw new ApiError('CALCULATION_DOMAIN_EXCEEDED','The final invoice total exceeds the supported QAR range.');
  const ledger=await prepareBusinessInvoiceJournal(env,workspaceId,{id:invoiceId,number:invoiceNumber,kind:'FINAL',clientId:candidate.client_id,engagementId:candidate.engagement_id,
    subtotalMinor:Number(candidate.final_fee_minor),taxMinor:Number(candidate.final_tax_minor),totalMinor:Number(invoiceTotal),issueDate:p.proposedReportDate,actorId:context.actor.id},now);
  const transitionOne=crypto.randomUUID(),transitionTwo=crypto.randomUUID(),portalFreezeId=crypto.randomUUID(),notificationDispatchId=crypto.randomUUID(),notificationJobId=crypto.randomUUID();
  const emailPayload={documentType:'COMMERCIAL_EMAIL',purpose:'BUNDLE',commandId,engagementId:candidate.engagement_id,clientId:candidate.client_id,dispatchId:notificationDispatchId,
    fileVersionId:releaseReport.id,recipient,subject:`Final audit deliverables · ${candidate.code}`,body:`The five-part audit deliverable package and final fee note for ${candidate.code} are available in the client portal. Portal uploads were frozen at report release.`};
  const emailDedup=`released-bundle:${bundleId}`;
  const invoiceDueDate=String(dueDate);
  const statements:D1PreparedStatement[]=[assertDb(env,workspaceId,705,`EXISTS(SELECT 1 FROM engagements e WHERE e.workspace_id=? AND e.id=? AND e.version=? AND e.lifecycle_state='PARTNER_APPROVAL' AND e.locked_at IS NULL AND e.portal_frozen_at IS NULL)
      AND EXISTS(SELECT 1 FROM bundle_candidates b WHERE b.workspace_id=? AND b.id=? AND b.status='READY' AND b.content_hash=? AND b.dependency_hash=? AND b.final_invoice_id IS NULL)
      AND (SELECT COUNT(*) FROM bundle_candidate_parts WHERE workspace_id=? AND candidate_id=?)=5
      AND EXISTS(SELECT 1 FROM report_signature_consents c WHERE c.workspace_id=? AND c.report_candidate_id=? AND c.candidate_content_hash=? AND c.proposed_report_date=? AND c.signature_asset_id=?)
      AND EXISTS(SELECT 1 FROM representation_requests r JOIN representation_reviews rv ON rv.workspace_id=r.workspace_id AND rv.request_id=r.id AND rv.return_id=r.current_return_id AND rv.decision='ACCEPT' AND rv.dependency_hash=r.dependency_hash WHERE r.workspace_id=? AND r.id=? AND r.status='ACCEPTED')
      AND NOT EXISTS(SELECT 1 FROM invoices i WHERE i.workspace_id=? AND i.engagement_letter_id=? AND i.kind='FINAL' AND i.status<>'VOID')`,workspaceId,candidate.engagement_id,candidate.engagement_version,
      workspaceId,candidate.id,p.expectedContentHash,candidate.dependency_hash,workspaceId,candidate.id,workspaceId,candidate.report_candidate_id,candidate.report_sha256,candidate.proposed_report_date,candidate.signature_asset_id,
      workspaceId,candidate.representation_request_id,workspaceId,candidate.engagement_letter_id),...aliasInserts,...artifactStatements,
    env.DB.prepare(`INSERT INTO invoices(id,workspace_id,version,client_id,engagement_id,engagement_letter_id,kind,number,fee_revision_id,tax_policy_version_id,subtotal_minor,tax_minor,total_minor,currency,issue_date,due_date,contact_route_id,recipient_snapshot_json,status,artifact_id,file_version_id,corrects_invoice_id,created_by_actor_id,issued_at,created_at,updated_at)
      VALUES(?,?,1,?,?,?,'FINAL',?,?,?,?,?,?,'QAR',?,?,?,?,'ISSUED',?,?,NULL,?,?,?,?)`).bind(invoiceId,workspaceId,candidate.client_id,candidate.engagement_id,candidate.engagement_letter_id,invoiceNumber,candidate.fee_revision_id,candidate.tax_policy_version_id,
        candidate.final_fee_minor,candidate.final_tax_minor,Number(invoiceTotal),p.proposedReportDate,invoiceDueDate,route.id,JSON.stringify(recipient),feeInvoiceArtifact,releaseFee.id,context.actor.id,now,now,now),
    ...ledger,
    env.DB.prepare(`INSERT INTO report_signatures(id,workspace_id,client_id,engagement_id,consent_id,report_artifact_id,signature_file_sha256,seal_file_sha256,signed_at,report_date,final_file_sha256,signing_method)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'IMAGE_WITH_AUDIT_PROVENANCE')`).bind(reportSignatureId,workspaceId,candidate.client_id,candidate.engagement_id,currentConsent.id,reportArtifact,candidate.signature_sha256,candidate.seal_sha256,now,p.proposedReportDate,releaseReport.sha256),
    env.DB.prepare(`INSERT INTO deliverable_bundles(id,workspace_id,client_id,engagement_id,revision,candidate_id,opinion_version_id,srm_version_id,report_candidate_id,representation_request_id,final_invoice_id,report_signature_id,content_hash,released_by_actor_id,released_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(bundleId,workspaceId,candidate.client_id,candidate.engagement_id,bundleRevision,candidate.id,candidate.opinion_version_id,pins.srm.id,candidate.report_candidate_id,candidate.representation_request_id,invoiceId,
        reportSignatureId,recomputedContentHash,context.actor.id,now),
    ...([['REPORT_AND_FS',releaseReport],['MANAGEMENT_LETTER',releaseManagement],['REPRESENTATION',releaseLOR],['CORRESPONDENCE_TRAIL',releaseTrail],['FINAL_FEE_NOTE',releaseFee]] as const).map(([kind,file])=>
      env.DB.prepare(`INSERT INTO deliverable_parts(id,workspace_id,bundle_id,kind,primary_file_id,sha256,size_bytes) VALUES(?,?,?,?,?,?,?)`).bind(deliverablePartIds.get(kind),workspaceId,bundleId,kind,file.id,file.sha256,file.size)),
    env.DB.prepare(`INSERT INTO deliverable_attachments(id,workspace_id,part_id,file_version_id,purpose) VALUES(?,?,?,?,?)`)
      .bind(crypto.randomUUID(),workspaceId,representationPartId,returnAlias.id,'SIGNED_CLIENT_REPRESENTATION'),
    env.DB.prepare(`INSERT INTO portal_freezes(id,workspace_id,client_id,engagement_id,bundle_id,frozen_at,reason,actor_id) VALUES(?,?,?,?,?,?,'FINAL_REPORT_RELEASE',?)`)
      .bind(portalFreezeId,workspaceId,candidate.client_id,candidate.engagement_id,bundleId,now,context.actor.id),
    env.DB.prepare(`UPDATE engagements SET lifecycle_state='COMPLIANCE_COUNTDOWN',version=version+1,released_at=?,report_signed_at=?,report_date=?,archive_due_at=?,portal_frozen_at=?,updated_at=?,updated_by_actor_id=?
      WHERE workspace_id=? AND id=? AND version=? AND lifecycle_state='PARTNER_APPROVAL' AND locked_at IS NULL AND portal_frozen_at IS NULL`)
      .bind(now,now,p.proposedReportDate,archiveDueAt,now,now,context.actor.id,workspaceId,candidate.engagement_id,candidate.engagement_version),
    env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at)
      VALUES(?,?,?, ?,1,'PARTNER_APPROVAL','DELIVERABLE_RELEASE',?,?,?,?)`).bind(transitionOne,workspaceId,candidate.client_id,candidate.engagement_id,commandId,
        'The Partner released the exact five-part hash-verified bundle after current reporting and representation gates passed.',candidate.dependency_hash,now),
    env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at)
      VALUES(?,?,?, ?,1,'DELIVERABLE_RELEASE','COMPLIANCE_COUNTDOWN',?,?,?,?)`).bind(transitionTwo,workspaceId,candidate.client_id,candidate.engagement_id,commandId,
        'The complete bundle was published to client portal downloads and the 60-day assembly deadline began at report signature.',candidate.dependency_hash,now),
    env.DB.prepare(`UPDATE bundle_candidates SET final_invoice_id=?,status='RELEASED',updated_at=? WHERE workspace_id=? AND id=? AND status='READY' AND content_hash=?`)
      .bind(invoiceId,now,workspaceId,candidate.id,candidate.content_hash),
    emailOutboxJob(env,workspaceId,notificationJobId,notificationDispatchId,1,emailPayload,emailDedup,now),
    env.DB.prepare(`INSERT INTO dispatches(id,workspace_id,version,client_id,engagement_id,purpose,file_version_id,recipient_snapshot_json,status,provider_message_id,sent_at,deduplication_key,job_id,created_at,updated_at)
      VALUES(?,?,1,?,?, 'BUNDLE',?,?,'QUEUED',NULL,NULL,?,?,?,?)`).bind(notificationDispatchId,workspaceId,candidate.client_id,candidate.engagement_id,releaseReport.id,JSON.stringify(recipient),emailDedup,notificationJobId,now,now)];
  return mut(statements,{bundleId,finalInvoiceId:invoiceId,reportSignedAt:now,portalFrozenAt:now,archiveDueAt,state:'COMPLIANCE_COUNTDOWN',contentHash:recomputedContentHash,
    notificationDispatchId,notificationStatus:'QUEUED'},'DELIVERABLE_BUNDLE',bundleId,null,bundleRevision,{contentHash:recomputedContentHash,finalInvoiceNumber:invoiceNumber,finalFeeMinor:candidate.final_fee_minor,finalTaxMinor:candidate.final_tax_minor,
      reportSignatureAttribution:'SELF_ASSERTED_PERSONA',notificationDispatchId});
}

export async function buildBusinessReportingMutation(env:Env,workspaceId:string,context:BusinessContext,command:BusinessReportingCommand,commandId:string,now:string):Promise<BusinessMutation>{
  switch(command.type){
    case 'opinion.select':return buildOpinionSelect(env,workspaceId,context,command,now);
    case 'signature-asset.register':return buildSignatureRegister(env,workspaceId,context,command,now);
    case 'financial-statements.save-disclosures':return buildStatementDraftSave(env,workspaceId,context,command,now);
    case 'financial-statements.approve':return buildStatementApprove(env,workspaceId,context,command,now);
    case 'report.prepare':return buildReportPrepare(env,workspaceId,context,command,commandId,now);
    case 'report.consent':return buildReportConsent(env,workspaceId,context,command,now);
    case 'management-letter.prepare':return buildManagementPrepare(env,workspaceId,context,command,now);
    case 'representation.prepare':return buildRepresentationPrepare(env,workspaceId,context,command,now);
    case 'representation.send':return buildRepresentationSend(env,workspaceId,context,command,now);
    case 'representation.receive':return buildRepresentationReceive(env,workspaceId,context,command,now);
    case 'representation.review':return buildRepresentationReview(env,workspaceId,context,command,now);
    case 'bundle.prepare':return buildBundlePrepare(env,workspaceId,context,command,now);
    case 'report.release':return buildReportRelease(env,workspaceId,context,command,commandId,now);
    case 'retention-policy.save':return buildRetentionSave(env,workspaceId,context,command,now);
    case 'archive.lock':return buildArchiveLock(env,workspaceId,context,command,commandId,now);
    case 'archive.note':return buildArchiveNote(env,workspaceId,context,command,now);
  }
}
