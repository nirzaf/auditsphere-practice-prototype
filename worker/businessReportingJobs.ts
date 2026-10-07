import type { Env } from './env';
import { sha256Hex } from './http';
import { renderReportingPdf, type ReportingPdfInput, type ReportPdfSection } from './reportingDocument';
import { buildOpinionReportSections, opinionReportingBlockers, type OpinionAffectedFsli } from './reportingOpinion';
import { inspectReportingPng } from './reportingPng';
import { renderRepresentationTemplateDocx } from './reportingRepresentationDocument';
import { buildReportingStatementProjection, type ReportingStatementLine } from './reportingStatements';
import { archiveRetentionSegment } from './archiveRetention';
import * as XLSX from 'xlsx';
import { createStreamingArchive, verifyStreamingSha256 } from './streamingArchive';

async function sha256BytesHex(bytes:Uint8Array):Promise<string>{
  const copy=new ArrayBuffer(bytes.byteLength);new Uint8Array(copy).set(bytes);
  const digest=await crypto.subtle.digest('SHA-256',copy);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

type Job = { id:string; workspace_id:string; aggregate_id:string; aggregate_version:number; lease_until:string|null };
type Payload = Record<string,any>;
type Mutation = { entityType:string; entityId:string; clientId?:string; engagementId?:string; details:Record<string,unknown>; statements:D1PreparedStatement[]; result?:Record<string,unknown> };
type Commit = (mutation:Mutation)=>Promise<void>;

const nowIso=()=>new Date().toISOString();
const currentQatarDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Qatar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const money=(value:unknown)=>{const n=BigInt(String(value??0));const a=n<0n?-n:n;return `QAR ${n<0n?'-':''}${a/100n}.${(a%100n).toString().padStart(2,'0')}`;};

async function exactFile(env:Env,workspaceId:string,fileId:string){
  const row=await env.DB.prepare(`SELECT id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,immutable FROM file_versions WHERE workspace_id=? AND id=?`)
    .bind(workspaceId,fileId).first<{id:string;original_name:string;media_type:string;size_bytes:number;sha256:string;object_key:string;purpose:string;state:string;immutable:number}>();
  if(!row||row.state!=='COMMITTED'||row.immutable!==1||!row.sha256)throw new Error('A required reporting file is not a committed immutable version.');
  const object=await env.FILES.get(row.object_key);if(!object)throw new Error(`Stored reporting bytes are missing for ${row.original_name}.`);
  const bytes=new Uint8Array(await object.arrayBuffer());if(bytes.byteLength!==row.size_bytes||await sha256BytesHex(bytes)!==row.sha256)throw new Error(`Stored reporting bytes failed integrity verification for ${row.original_name}.`);
  return {...row,bytes};
}

async function storePdf(env:Env,job:Job,payload:Payload,input:ReportingPdfInput,kind:string,sourceType:string,sourceId:string,revision:number,category:string){
  const bytes=renderReportingPdf(input),digest=await sha256BytesHex(bytes),fileId=crypto.randomUUID(),artifactId=crypto.randomUUID(),generatedAt=nowIso();
  const key=`workspaces/${job.workspace_id}/generated/${category}/${sourceId}/${digest}.pdf`;
  await env.FILES.put(key,bytes,{httpMetadata:{contentType:'application/pdf'},customMetadata:{sha256:digest,documentType:kind,generatedByJobId:job.id}});
  const stored=await env.FILES.get(key);if(!stored)throw new Error('The generated reporting PDF could not be read back from object storage.');
  const copy=new Uint8Array(await stored.arrayBuffer());if(copy.byteLength!==bytes.byteLength||await sha256BytesHex(copy)!==digest)throw new Error('The generated reporting PDF failed object-store hash verification.');
  const fileName=`${input.number.replace(/[^A-Z0-9._-]/gi,'-')}.pdf`;
  return {fileId,artifactId,digest,size:bytes.byteLength,key,fileName,generatedAt,bytes,statements:[
    env.DB.prepare(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
      VALUES(?,?,1,?,?,?,'application/pdf',?,?,?,'GENERATED','COMMITTED',?,1,?,?,NULL,NULL)`)
      .bind(fileId,job.workspace_id,payload.clientId,payload.engagementId,fileName,bytes.byteLength,digest,key,generatedAt,generatedAt,generatedAt),
    env.DB.prepare(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(artifactId,job.workspace_id,payload.clientId,payload.engagementId,kind,sourceType,sourceId,revision,fileId,digest,bytes.byteLength,generatedAt,job.id)
  ]};
}

async function storeDocx(env:Env,job:Job,payload:Payload,number:string,bytes:Uint8Array,kind:string,sourceType:string,sourceId:string,revision:number,category:string){
  const digest=await sha256BytesHex(bytes),fileId=crypto.randomUUID(),artifactId=crypto.randomUUID(),generatedAt=nowIso();
  const key=`workspaces/${job.workspace_id}/generated/${category}/${sourceId}/${digest}.docx`;
  const mediaType='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  await env.FILES.put(key,bytes,{httpMetadata:{contentType:mediaType},customMetadata:{sha256:digest,documentType:kind,generatedByJobId:job.id}});
  const stored=await env.FILES.get(key);if(!stored)throw new Error('The generated representation DOCX could not be read back from object storage.');
  const copy=new Uint8Array(await stored.arrayBuffer());if(copy.byteLength!==bytes.byteLength||await sha256BytesHex(copy)!==digest)throw new Error('The generated representation DOCX failed object-store hash verification.');
  const fileName=`${number.replace(/[^A-Z0-9._-]/gi,'-')}.docx`;
  return {fileId,artifactId,digest,size:bytes.byteLength,key,fileName,generatedAt,bytes,statements:[
    env.DB.prepare(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
      VALUES(?,?,1,?,?,?,?,?,?,?,'GENERATED','COMMITTED',?,1,?,?,NULL,NULL)`)
      .bind(fileId,job.workspace_id,payload.clientId,payload.engagementId,fileName,mediaType,bytes.byteLength,digest,key,generatedAt,generatedAt,generatedAt),
    env.DB.prepare(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(artifactId,job.workspace_id,payload.clientId,payload.engagementId,kind,sourceType,sourceId,revision,fileId,digest,bytes.byteLength,generatedAt,job.id)
  ]};
}

async function reportCandidate(env:Env,job:Job,p:Payload,commit:Commit){
  const row=await env.DB.prepare(`SELECT c.id,c.client_id,c.engagement_id,c.opinion_version_id,c.financial_statement_approval_id,c.signature_asset_id,c.proposed_report_date,c.dependency_hash,c.status,
      e.code,e.period_start,e.period_end,e.engagement_type,e.lifecycle_state,e.active_tb_version_id,e.active_mapping_version_id,e.active_materiality_version_id,e.approved_planning_version_id,e.standards_profile_id,
      sp.name AS standards_profile_name,sp.reporting_framework,sp.presentation_edition,sp.early_adoption,sp.isa_220_edition,sp.isa_570_edition,
      c0.legal_name AS client_name,fp.legal_name AS firm_name,o.srm_version_id AS opinion_srm_version_id,o.report_type,o.category,o.aup_report_type,o.aup_procedure_summary,o.rationale,o.materiality_assessment,o.pervasiveness_assessment,o.basis_heading,o.basis_text,o.going_concern_reporting_text,o.additional_sections_json,
      fs.statement_snapshot_id,a.draft_id,a.source_hash AS approval_hash,d.version AS draft_version,d.status AS draft_status,d.source_hash AS draft_hash,d.accounting_policies,d.oci_applicable,d.completeness_checklist_json,d.id AS draft_id
    FROM report_candidates c JOIN engagements e ON e.workspace_id=c.workspace_id AND e.id=c.engagement_id
    JOIN standards_profiles sp ON sp.workspace_id=e.workspace_id AND sp.id=e.standards_profile_id
    JOIN clients c0 ON c0.workspace_id=e.workspace_id AND c0.id=e.client_id
    JOIN firm_profiles fp ON fp.workspace_id=e.workspace_id JOIN opinion_versions o ON o.workspace_id=c.workspace_id AND o.id=c.opinion_version_id
    JOIN financial_statement_approvals a ON a.workspace_id=c.workspace_id AND a.id=c.financial_statement_approval_id
    JOIN financial_statement_drafts d ON d.workspace_id=a.workspace_id AND d.id=a.draft_id
    JOIN financial_statement_approvals fs ON fs.workspace_id=c.workspace_id AND fs.id=c.financial_statement_approval_id
    WHERE c.workspace_id=? AND c.id=?`).bind(job.workspace_id,p.reportCandidateId).first<Record<string,any>>();
  if(!row||row.status!=='PREPARING'||row.engagement_id!==p.engagementId||row.client_id!==p.clientId||row.lifecycle_state!=='PARTNER_APPROVAL'
    ||row.draft_status!=='APPROVED'||row.draft_version!==Number((await env.DB.prepare(`SELECT draft_version FROM financial_statement_approvals WHERE workspace_id=? AND id=?`).bind(job.workspace_id,row.financial_statement_approval_id).first<{draft_version:number}>())?.draft_version))
    throw new Error('The report candidate source is no longer eligible for rendering.');
  if(row.proposed_report_date!==currentQatarDate())throw new Error('The report candidate crossed into a new Qatar report date before rendering; prepare and review a fresh candidate.');
  const pins=await env.DB.prepare(`SELECT s.id,s.dependency_hash,s.going_concern_id,s.statement_snapshot_id,s.statement_snapshot_id AS snapshot_id,t.source_hash,t.tb_version_id,t.mapping_version_id,t.standards_profile_id
    FROM srm_versions s JOIN statement_snapshots t ON t.workspace_id=s.workspace_id AND t.id=s.statement_snapshot_id
    JOIN srm_clearances c ON c.workspace_id=s.workspace_id AND c.srm_version_id=s.id AND c.dependency_hash=s.dependency_hash
    WHERE s.workspace_id=? AND s.engagement_id=? ORDER BY s.revision DESC,c.signed_at DESC LIMIT 1`).bind(job.workspace_id,row.engagement_id)
    .first<{id:string;dependency_hash:string;going_concern_id:string;snapshot_id:string;source_hash:string;tb_version_id:string;mapping_version_id:string;standards_profile_id:string}>();
  if(!pins||pins.id!==row.opinion_srm_version_id||pins.tb_version_id!==row.active_tb_version_id||pins.mapping_version_id!==row.active_mapping_version_id||pins.standards_profile_id!==row.standards_profile_id
    ||pins.snapshot_id!==row.statement_snapshot_id||row.approval_hash!==row.draft_hash)throw new Error('The report candidate pins are stale. Prepare a new Partner-cleared statement, opinion and approval.');
  const [going,latestGoing]=await Promise.all([
    env.DB.prepare(`SELECT id,status,conclusion FROM going_concern_assessments WHERE workspace_id=? AND id=? AND engagement_id=?`).bind(job.workspace_id,pins.going_concern_id,row.engagement_id)
      .first<{id:string;status:string;conclusion:string}>(),
    env.DB.prepare(`SELECT id,status FROM going_concern_assessments WHERE workspace_id=? AND engagement_id=? ORDER BY revision DESC LIMIT 1`).bind(job.workspace_id,row.engagement_id)
      .first<{id:string;status:string}>()
  ]);
  if(!going||going.status!=='REVIEWED'||latestGoing?.id!==going.id)throw new Error('The report candidate no longer uses the current independently reviewed going-concern assessment.');
  const reportingBlockers=opinionReportingBlockers(String(row.report_type),going.conclusion,row.going_concern_reporting_text===null?null:String(row.going_concern_reporting_text));
  if(reportingBlockers.length)throw new Error(reportingBlockers.join(' '));
  const statement=await env.DB.prepare(`SELECT l.fsli_id,c.code,c.name,c.statement,c.category,l.current_adjusted_minor,l.prior_minor,c.display_sign
    FROM statement_snapshot_lines l JOIN fsli_catalog c ON c.workspace_id=l.workspace_id AND c.id=l.fsli_id
    WHERE l.workspace_id=? AND l.snapshot_id=? ORDER BY c.presentation_order,c.code`).bind(job.workspace_id,pins.snapshot_id).all<ReportingStatementLine&Record<string,any>>();
  const lines=statement.results??[];if(!lines.length)throw new Error('The approved statement snapshot contains no presentation lines.');
  const notes=(await env.DB.prepare(`SELECT note_number,title,body,amount_minor FROM disclosure_notes WHERE workspace_id=? AND draft_id=? ORDER BY sort_order,note_number`)
    .bind(job.workspace_id,row.draft_id).all<Record<string,any>>()).results??[];
  const supplements=(await env.DB.prepare(`SELECT section,code,label,current_minor,prior_minor,rationale FROM statement_supplement_lines WHERE workspace_id=? AND draft_id=? ORDER BY section,code`)
    .bind(job.workspace_id,row.draft_id).all<Record<string,any>>()).results??[];
  const assets=await env.DB.prepare(`SELECT a.staff_member_id,a.signature_file_id,a.seal_file_id,a.signature_sha256,a.seal_sha256,a.owner_display_name AS display_name,
      a.owner_grade,s.grade AS current_grade,s.active AS current_active
    FROM report_signature_assets a JOIN staff_members s ON s.workspace_id=a.workspace_id AND s.id=a.staff_member_id
    WHERE a.workspace_id=? AND a.id=? AND a.status='ACTIVE' AND a.owner_grade='PARTNER'`).bind(job.workspace_id,row.signature_asset_id)
    .first<{staff_member_id:string;signature_file_id:string;seal_file_id:string;signature_sha256:string;seal_sha256:string;display_name:string;owner_grade:string;current_grade:string;current_active:number}>();
  if(!assets||assets.current_grade!=='PARTNER'||assets.current_active!==1||!assets.display_name)throw new Error('The approved report signature asset or active Partner owner snapshot is missing or retired.');
  const [signature,seal]=await Promise.all([exactFile(env,job.workspace_id,assets.signature_file_id),exactFile(env,job.workspace_id,assets.seal_file_id)]);
  if(signature.sha256!==assets.signature_sha256||seal.sha256!==assets.seal_sha256||signature.purpose!=='SIGNATURE'||seal.purpose!=='SEAL')throw new Error('The approved signature or seal no longer matches its immutable source hash.');
  const signaturePng=inspectReportingPng(signature.bytes),sealPng=inspectReportingPng(seal.bytes,true);
  const affected=(await env.DB.prepare(`SELECT f.code,f.name,a.amount_minor AS amountMinor,a.explanation
    FROM opinion_affected_fslis a JOIN fsli_catalog f ON f.workspace_id=a.workspace_id AND f.id=a.fsli_id
    WHERE a.workspace_id=? AND a.opinion_version_id=? ORDER BY f.presentation_order,f.code`).bind(job.workspace_id,row.opinion_version_id).all<OpinionAffectedFsli>()).results??[];
  const opinionSections=buildOpinionReportSections({reportType:String(row.report_type),category:row.category===null?null:String(row.category),aupReportType:row.aup_report_type===null?null:String(row.aup_report_type),
    aupProcedureSummary:row.aup_procedure_summary===null?null:String(row.aup_procedure_summary),rationale:String(row.rationale),materialityAssessment:String(row.materiality_assessment),
    pervasivenessAssessment:String(row.pervasiveness_assessment),basisHeading:row.basis_heading===null?null:String(row.basis_heading),basisText:row.basis_text===null?null:String(row.basis_text),
    goingConcernReportingText:row.going_concern_reporting_text===null?null:String(row.going_concern_reporting_text),additionalSections:JSON.parse(String(row.additional_sections_json))},affected);
  const statementProjection=buildReportingStatementProjection(lines);
  const sections:ReportPdfSection[]=[...opinionSections,
    {heading:'Statement of Financial Position',rows:statementProjection.balanceSheetRows},
    {heading:'Statement of Profit or Loss and Other Comprehensive Income',rows:statementProjection.profitLossRows},
    ...['CASH_FLOW','EQUITY_CHANGE','OCI'].filter(section=>supplements.some(line=>line.section===section)).map(section=>({heading:section.replaceAll('_',' '),rows:supplements.filter(line=>line.section===section).map(line=>({label:`${line.code} · ${line.label}`,current:money(line.current_minor),comparative:line.prior_minor===null?undefined:money(line.prior_minor),detail:String(line.rationale)}))})),
    {heading:'Approved Accounting Policies',paragraphs:[String(row.accounting_policies)]},
    ...notes.map(note=>({heading:`Note ${note.note_number} · ${note.title}`,paragraphs:[String(note.body),...(note.amount_minor===null?[]:[money(note.amount_minor)])]})),
    {heading:'Approved framework and standards',paragraphs:[
      `Financial reporting framework: ${row.reporting_framework}. Presentation edition: ${row.presentation_edition}${Number(row.early_adoption)===1?' (approved early adoption)':''}.`,
      `Approved standards profile: ${row.standards_profile_name} · ${row.standards_profile_id}.`,
      `ISA 220 edition: ${row.isa_220_edition}. ISA 570 edition: ${row.isa_570_edition}.`
    ]},
    {heading:'Source and completeness',paragraphs:[`Statement snapshot ${row.statement_snapshot_id} · source ${pins.source_hash}.`,
      `Presentation profile ${row.standards_profile_id}. The statement set uses approved disclosures and supporting schedules; professional review remains required.`]}];
  const input:ReportingPdfInput={number:`REPORT-${row.code}-${String(p.proposedReportDate).replaceAll('-','')}`,
    title:row.report_type==='ISRS_4400_AUP'?String(row.aup_report_type):'Independent Auditor’s Report and Financial Statements',firmName:row.firm_name,clientName:row.client_name,
    engagementCode:row.code,serviceType:row.engagement_type,periodStart:row.period_start,periodEnd:row.period_end,reportDate:p.proposedReportDate,sections,
    signatureBytes:signaturePng.sanitizedBytes,sealBytes:sealPng.sanitizedBytes,partnerName:assets.display_name};
  const output=await storePdf(env,job,p,input,'REPORT','REPORT_CANDIDATE',String(row.id),1,'reports');
  await commit({entityType:'REPORT_CANDIDATE',entityId:row.id,clientId:row.client_id,engagementId:row.engagement_id,details:{contentSha256:output.digest,dependencyHash:p.dependencyHash},
    result:{reportCandidateId:row.id,fileVersionId:output.fileId,artifactId:output.artifactId,contentSha256:output.digest,sizeBytes:output.size},statements:[...output.statements,
      env.DB.prepare(`UPDATE report_candidates SET report_artifact_id=?,status='READY',failure_code=NULL,updated_at=? WHERE workspace_id=? AND id=? AND status='PREPARING' AND dependency_hash=?`)
        .bind(output.artifactId,output.generatedAt,job.workspace_id,row.id,p.dependencyHash),
      env.DB.prepare(`UPDATE outbox_jobs SET status='SUCCEEDED',result_file_id=?,result_json=?,last_error_code=NULL,completed_at=?,lease_until=NULL,updated_at=?,version=version+1 WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(output.fileId,JSON.stringify({fileVersionId:output.fileId,artifactId:output.artifactId,contentSha256:output.digest}),output.generatedAt,output.generatedAt,job.workspace_id,job.id,job.lease_until)]});
}

async function managementLetter(env:Env,job:Job,p:Payload,commit:Commit){
  const row=await env.DB.prepare(`SELECT id,client_id,engagement_id,revision,items_snapshot_json,no_reportable_deficiencies_reason,source_hash,status FROM management_letter_versions WHERE workspace_id=? AND id=?`)
    .bind(job.workspace_id,p.managementLetterVersionId).first<Record<string,any>>();
  const engagement=row?await env.DB.prepare(`SELECT e.code,e.period_start,e.period_end,e.engagement_type,c.legal_name AS client_name,fp.legal_name AS firm_name FROM engagements e JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id JOIN firm_profiles fp ON fp.workspace_id=e.workspace_id WHERE e.workspace_id=? AND e.id=?`)
    .bind(job.workspace_id,row.engagement_id).first<Record<string,string>>():null;
  if(!row||row.status!=='PREPARING'||row.source_hash!==p.sourceHash||!engagement)throw new Error('The Management Letter source is no longer current.');
  const items=JSON.parse(String(row.items_snapshot_json)) as Array<Record<string,any>>;
  const sections:ReportPdfSection[]=items.length?items.map((item,index)=>({heading:`Deficiency ${index+1} · ${item.deficiency}`,paragraphs:[`Impact: ${item.impact}`,`Recommendation: ${item.recommendation}`,
      `Management response: ${item.managementResponse??'No response was recorded by management.'}`,`Responsible party: ${item.responsibleParty??'Not supplied'}`,`Target date: ${item.targetDate??'Not supplied'}`]})):
    [{heading:'No reportable deficiencies identified',paragraphs:[String(row.no_reportable_deficiencies_reason)]}];
  const output=await storePdf(env,job,p,{number:`ML-${engagement.code}-R${row.revision}`,title:'Management Letter',firmName:engagement.firm_name,clientName:engagement.client_name,
    engagementCode:engagement.code,serviceType:engagement.engagement_type,periodStart:engagement.period_start,periodEnd:engagement.period_end,sections},'MANAGEMENT_LETTER','MANAGEMENT_LETTER_VERSION',row.id,row.revision,'management-letters');
  await commit({entityType:'MANAGEMENT_LETTER_VERSION',entityId:row.id,clientId:row.client_id,engagementId:row.engagement_id,details:{sourceHash:row.source_hash,contentSha256:output.digest},
    result:{managementLetterVersionId:row.id,fileVersionId:output.fileId,artifactId:output.artifactId,contentSha256:output.digest},statements:[...output.statements,
      env.DB.prepare(`UPDATE management_letter_versions SET artifact_id=?,file_version_id=?,status='READY' WHERE workspace_id=? AND id=? AND status='PREPARING' AND source_hash=?`).bind(output.artifactId,output.fileId,job.workspace_id,row.id,row.source_hash),
      env.DB.prepare(`UPDATE outbox_jobs SET status='SUCCEEDED',result_file_id=?,result_json=?,last_error_code=NULL,completed_at=?,lease_until=NULL,updated_at=?,version=version+1 WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(output.fileId,JSON.stringify({fileVersionId:output.fileId,artifactId:output.artifactId,contentSha256:output.digest}),output.generatedAt,output.generatedAt,job.workspace_id,job.id,job.lease_until)]});
}

async function representationTemplate(env:Env,job:Job,p:Payload,commit:Commit){
  const row=await env.DB.prepare(`SELECT r.id,r.client_id,r.engagement_id,r.proposed_report_date,r.required_signatories_json,r.dependency_hash,r.status,e.code,e.period_start,e.period_end,e.engagement_type,
      c.legal_name AS client_name,fp.legal_name AS firm_name FROM representation_requests r JOIN engagements e ON e.workspace_id=r.workspace_id AND e.id=r.engagement_id
      JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id JOIN firm_profiles fp ON fp.workspace_id=e.workspace_id WHERE r.workspace_id=? AND r.id=?`)
    .bind(job.workspace_id,p.requestId).first<Record<string,any>>();
  if(!row||row.status!=='PREPARING'||row.dependency_hash!==p.dependencyHash||row.engagement_id!==p.engagementId)throw new Error('The representation request is no longer eligible for rendering.');
  const names=JSON.parse(String(row.required_signatories_json)) as string[];
  const snapshot=await env.DB.prepare(`SELECT s.id,s.source_hash FROM financial_statement_approvals a
      JOIN statement_snapshots s ON s.workspace_id=a.workspace_id AND s.id=a.statement_snapshot_id
      WHERE a.workspace_id=? AND a.engagement_id=? ORDER BY a.approved_at DESC,a.id DESC LIMIT 1`)
    .bind(job.workspace_id,row.engagement_id).first<{id:string;source_hash:string}>();
  if(!snapshot)throw new Error('The representation letter needs the exact approved financial statement snapshot.');
  const figureRows=await env.DB.prepare(`SELECT f.statement,f.category,SUM(l.current_adjusted_minor) AS current_minor,
      CASE WHEN COUNT(l.prior_minor)=COUNT(*) THEN SUM(l.prior_minor) ELSE NULL END AS comparative_minor
    FROM statement_snapshot_lines l JOIN fsli_catalog f ON f.workspace_id=l.workspace_id AND f.id=l.fsli_id
    WHERE l.workspace_id=? AND l.snapshot_id=? GROUP BY f.statement,f.category ORDER BY f.statement,f.category`)
    .bind(job.workspace_id,snapshot.id).all<{statement:string;category:string;current_minor:number;comparative_minor:number|null}>();
  const figures=(figureRows.results??[]).map(figure=>({
    label:`${figure.statement==='BALANCE_SHEET'?'Statement of financial position':'Statement of profit or loss'} · ${figure.category.toLowerCase()}`,
    current:money(figure.current_minor),comparative:figure.comparative_minor===null?null:money(figure.comparative_minor)
  }));
  const documentBytes=await renderRepresentationTemplateDocx({clientName:String(row.client_name),engagementCode:String(row.code),periodStart:String(row.period_start),periodEnd:String(row.period_end),
    proposedReportDate:String(row.proposed_report_date),signatories:names,statementSnapshotId:snapshot.id,statementSourceHash:snapshot.source_hash,figures});
  const output=await storeDocx(env,job,p,`LOR-${row.code}-${String(row.proposed_report_date).replaceAll('-','')}`,documentBytes,
    'REPRESENTATION','REPRESENTATION_REQUEST',row.id,1,'representations');
  await commit({entityType:'REPRESENTATION_REQUEST',entityId:row.id,clientId:row.client_id,engagementId:row.engagement_id,details:{dependencyHash:row.dependency_hash,contentSha256:output.digest},
    result:{requestId:row.id,fileVersionId:output.fileId,artifactId:output.artifactId,contentSha256:output.digest},statements:[...output.statements,
      env.DB.prepare(`UPDATE representation_requests SET template_artifact_id=?,template_file_id=?,status='PREPARED',version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND status='PREPARING' AND dependency_hash=?`)
        .bind(output.artifactId,output.fileId,output.generatedAt,job.workspace_id,row.id,row.dependency_hash),
      env.DB.prepare(`UPDATE outbox_jobs SET status='SUCCEEDED',result_file_id=?,result_json=?,last_error_code=NULL,completed_at=?,lease_until=NULL,updated_at=?,version=version+1 WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(output.fileId,JSON.stringify({fileVersionId:output.fileId,artifactId:output.artifactId,contentSha256:output.digest}),output.generatedAt,output.generatedAt,job.workspace_id,job.id,job.lease_until)]});
}

async function practiceReport(env:Env,job:Job,p:Payload,commit:Commit){
  if(!['TRIAL_BALANCE','MONTHLY_PROFIT_LOSS'].includes(String(p.kind))||!['CSV','XLSX','PDF'].includes(String(p.format))
    ||typeof p.reportSnapshotId!=='string'||typeof p.generatedByActorId!=='string'||typeof p.sourceHash!=='string'||typeof p.rowsJson!=='string')
    throw new Error('The firm report export job is missing its exact snapshot or output format.');
  const snapshot=JSON.parse(p.rowsJson) as Record<string,any>;
  if(snapshot.sourceHash!==p.sourceHash||snapshot.kind!==p.kind||snapshot.periodStart!==p.periodStart||snapshot.periodEnd!==p.periodEnd)
    throw new Error('The firm report snapshot does not match the queued source hash and period.');
  const trialBalance=p.kind==='TRIAL_BALANCE',format=String(p.format),extension=format==='XLSX'?'xlsx':format.toLowerCase();
  const rawRows:Array<Record<string,unknown>>=Array.isArray(snapshot.rows)?snapshot.rows.map((row:unknown)=>row&&typeof row==='object'?row as Record<string,unknown>:{}):[];
  const rows:Array<Record<string,unknown>>=trialBalance?rawRows.map(row=>({code:row.code,name:row.name,accountType:row.accountType,openingMinor:row.openingMinor,
    periodDebitMinor:row.periodDebitMinor,periodCreditMinor:row.periodCreditMinor,closingMinor:row.closingMinor}))
    :rawRows.map(row=>({code:row.code,name:row.name,accountType:row.accountType,amountMinor:row.amountMinor}));
  const columns=trialBalance?['code','name','accountType','openingMinor','periodDebitMinor','periodCreditMinor','closingMinor']
    :['code','name','accountType','amountMinor'];
  const labels=trialBalance?['Account code','Account name','Account type','Opening balance (QAR minor)','Period debits (QAR minor)','Period credits (QAR minor)','Closing balance (QAR minor)']
    :['Account code','Account name','Account type','Amount (QAR minor)'];
  let bytes:Uint8Array,mediaType:string;
  if(format==='CSV'){
    const csvCell=(value:unknown)=>{
      let text=String(value??'');
      // Guard values beginning with spreadsheet formula operators while keeping plain signed numbers readable.
      if(/^[=+@\t\r]/.test(text)||/^-[^0-9]/.test(text))text=`'${text}`;
      return `"${text.replaceAll('"','""')}"`;
    };
    const content=[labels,...rows.map(row=>columns.map(column=>row[column]))].map(line=>line.map(csvCell).join(',')).join('\r\n');
    bytes=new TextEncoder().encode(`\uFEFF${content}`);mediaType='text/csv';
  }else if(format==='XLSX'){
    const sheet=XLSX.utils.aoa_to_sheet([labels,...rows.map(row=>columns.map(column=>String(row[column]??'')))]);
    const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,trialBalance?'Trial Balance':'Profit and Loss');
    const output=XLSX.write(workbook,{bookType:'xlsx',type:'array'});bytes=output instanceof Uint8Array?new Uint8Array(output):new Uint8Array(output as ArrayBuffer);
    mediaType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }else{
    const firm=await env.DB.prepare(`SELECT legal_name FROM firm_profiles WHERE workspace_id=?`).bind(job.workspace_id).first<{legal_name:string}>();
    bytes=renderReportingPdf({number:`FIRM-${trialBalance?'TB':'PL'}-${String(p.periodEnd).replaceAll('-','')}`,title:trialBalance?'Internal Firm Trial Balance':'Monthly Firm Profit and Loss',
      firmName:firm?.legal_name??'AuditSphere Firm',clientName:'Internal firm records',engagementCode:'FIRM-PRACTICE',serviceType:'INTERNAL_REPORT',
      periodStart:String(p.periodStart),periodEnd:String(p.periodEnd),reportDate:String(p.asOf).slice(0,10),sections:[{heading:trialBalance?'Trial balance by account':'Revenue and expenses by account',
        rows:rows.map(row=>({label:`${String(row.code??'')} · ${String(row.name??'')} · ${String(row.accountType??'')}`,
          current:`${String(row.amountMinor??row.closingMinor??'0')} QAR minor units`}))},
        {heading:'Source and control totals',paragraphs:[`Source hash: ${String(p.sourceHash)}`,
          trialBalance?`Period debit total ${String(snapshot.debitTotalMinor)} minor units; period credit total ${String(snapshot.creditTotalMinor)} minor units; exact balance ${String(snapshot.balanced)}.`
            :`Revenue ${String(snapshot.revenueMinor)} minor units; expenses ${String(snapshot.expenseMinor)} minor units; profit ${String(snapshot.profitMinor)} minor units.`]}]});
    mediaType='application/pdf';
  }
  if(bytes.byteLength===0)throw new Error('The requested firm report export produced no document bytes.');
  const digest=await sha256BytesHex(bytes),fileId=crypto.randomUUID(),generatedAt=nowIso(),fileName=`firm-${trialBalance?'trial-balance':'profit-loss'}-${p.periodStart}-${p.periodEnd}.${extension}`;
  const key=`workspaces/${job.workspace_id}/practice-reports/${p.reportSnapshotId}/${digest}.${extension}`;
  await env.FILES.put(key,bytes,{httpMetadata:{contentType:mediaType},customMetadata:{sha256:digest,reportSnapshotId:p.reportSnapshotId,generatedByJobId:job.id}});
  const stored=await env.FILES.get(key);if(!stored)throw new Error('The firm report export could not be read back from object storage.');
  const readBack=new Uint8Array(await stored.arrayBuffer());if(readBack.byteLength!==bytes.byteLength||await sha256BytesHex(readBack)!==digest)throw new Error('The firm report export failed object-store hash verification.');
  const statements=[
    env.DB.prepare(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
      VALUES(?,?,1,NULL,NULL,?,?,?,?,?,'GENERATED','COMMITTED',?,1,?,?,?,?)`)
      .bind(fileId,job.workspace_id,fileName,mediaType,bytes.byteLength,digest,key,generatedAt,generatedAt,generatedAt,p.generatedByActorId,p.generatedByActorId),
    env.DB.prepare(`INSERT INTO firm_report_snapshots(id,workspace_id,kind,period_start,period_end,as_of,journal_cutoff_hash,rows_snapshot_json,
        debit_total_minor,credit_total_minor,profit_minor,generated_by_actor_id,generated_at,file_version_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(p.reportSnapshotId,job.workspace_id,p.kind,p.periodStart,p.periodEnd,p.asOf,p.sourceHash,p.rowsJson,
        snapshot.debitTotalMinor===null?null:Number(snapshot.debitTotalMinor),snapshot.creditTotalMinor===null?null:Number(snapshot.creditTotalMinor),
        snapshot.profitMinor===null?null:Number(snapshot.profitMinor),p.generatedByActorId,generatedAt,fileId),
    env.DB.prepare(`UPDATE outbox_jobs SET status='SUCCEEDED',result_file_id=?,result_json=?,last_error_code=NULL,completed_at=?,lease_until=NULL,updated_at=?,version=version+1
      WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
      .bind(fileId,JSON.stringify({reportSnapshotId:p.reportSnapshotId,fileVersionId:fileId,fileName,format:p.format,contentSha256:digest}),generatedAt,generatedAt,job.workspace_id,job.id,job.lease_until)
  ];
  await commit({entityType:'FIRM_REPORT_SNAPSHOT',entityId:p.reportSnapshotId,details:{kind:p.kind,format:p.format,periodStart:p.periodStart,periodEnd:p.periodEnd,sourceHash:p.sourceHash,contentSha256:digest},
    result:{reportSnapshotId:p.reportSnapshotId,fileVersionId:fileId,fileName,format:p.format,contentSha256:digest},statements});
}

export async function processBusinessReportingDocument(env:Env,job:Job,payload:Payload,commit:Commit):Promise<boolean>{
  if(payload.documentType==='REPORT_CANDIDATE'){await reportCandidate(env,job,payload,commit);return true;}
  if(payload.documentType==='MANAGEMENT_LETTER'){await managementLetter(env,job,payload,commit);return true;}
  if(payload.documentType==='REPRESENTATION_TEMPLATE'){await representationTemplate(env,job,payload,commit);return true;}
  if(payload.documentType==='BUNDLE_CANDIDATE'){await bundleCandidate(env,job,payload,commit);return true;}
  if(payload.documentType==='SEAL_ARCHIVE'){await sealArchive(env,job,payload,commit);return true;}
  if(payload.documentType==='PRACTICE_REPORT'){await practiceReport(env,job,payload,commit);return true;}
  return false;
}

async function bundleCandidate(env:Env,job:Job,p:Payload,commit:Commit){
  const candidate=await env.DB.prepare(`SELECT b.*,el.fee_minor AS original_fee_minor,e.code,e.period_start,e.period_end,e.engagement_type,c.legal_name AS client_name,fp.legal_name AS firm_name,
      ml.file_version_id AS management_file,ml.artifact_id AS management_artifact,rep.template_file_id,ret.signed_file_id,ret.file_sha256 AS return_hash,ret.source_hash AS return_source_hash,
      rp.file_version_id AS report_file,rp.content_sha256 AS report_hash,rp.size_bytes AS report_size,ra.id AS report_artifact,rep.proposed_report_date
    FROM bundle_candidates b JOIN engagements e ON e.workspace_id=b.workspace_id AND e.id=b.engagement_id JOIN clients c ON c.workspace_id=e.workspace_id AND c.id=e.client_id
    JOIN firm_profiles fp ON fp.workspace_id=e.workspace_id JOIN engagement_letters el ON el.workspace_id=b.workspace_id AND el.id=b.engagement_letter_id
    JOIN management_letter_versions ml ON ml.workspace_id=b.workspace_id AND ml.id=b.management_letter_version_id AND ml.status='READY'
    JOIN representation_requests rep ON rep.workspace_id=b.workspace_id AND rep.id=b.representation_request_id AND rep.status='ACCEPTED'
    JOIN representation_returns ret ON ret.workspace_id=rep.workspace_id AND ret.request_id=rep.id AND ret.id=rep.current_return_id
    JOIN report_candidates rc ON rc.workspace_id=b.workspace_id AND rc.id=b.report_candidate_id AND rc.status='READY'
    JOIN generated_artifacts rp ON rp.workspace_id=rc.workspace_id AND rp.id=rc.report_artifact_id
    JOIN generated_artifacts ra ON ra.workspace_id=rc.workspace_id AND ra.id=rc.report_artifact_id
    WHERE b.workspace_id=? AND b.id=?`).bind(job.workspace_id,p.bundleCandidateId).first<Record<string,any>>();
  if(!candidate||candidate.status!=='PREPARING'||candidate.engagement_id!==p.engagementId||candidate.client_id!==p.clientId||candidate.dependency_hash!==p.dependencyHash
    ||candidate.proposed_report_date!==p.reportDate||candidate.report_file===candidate.signed_file_id)throw new Error('The five-part release candidate sources are missing or changed.');
  const [report,management,template,signedReturn]=await Promise.all([exactFile(env,job.workspace_id,candidate.report_file),exactFile(env,job.workspace_id,candidate.management_file),
    exactFile(env,job.workspace_id,candidate.template_file_id),exactFile(env,job.workspace_id,candidate.signed_file_id)]);
  if(report.sha256!==candidate.report_hash||management.purpose!=='GENERATED'||template.purpose!=='GENERATED'||signedReturn.sha256!==candidate.return_hash||signedReturn.media_type!=='application/pdf')
    throw new Error('A required deliverable part or signed representation failed integrity validation.');
  const dispatches=(await env.DB.prepare(`SELECT d.purpose,d.status,d.created_at,d.sent_at,d.provider_message_id,d.recipient_snapshot_json,j.last_error_code,j.provider_reference
    FROM dispatches d LEFT JOIN outbox_jobs j ON j.workspace_id=d.workspace_id AND j.id=d.job_id WHERE d.workspace_id=? AND d.engagement_id=? ORDER BY d.created_at,d.id`)
    .bind(job.workspace_id,candidate.engagement_id).all<Record<string,any>>()).results??[];
  const confirmations=(await env.DB.prepare(`SELECT id,type,external_party_name,status,due_date,verified_at FROM confirmations WHERE workspace_id=? AND engagement_id=? ORDER BY created_at,id`)
    .bind(job.workspace_id,candidate.engagement_id).all<Record<string,any>>()).results??[];
  const correspondence:ReportPdfSection[]=[{heading:'Recorded client and third-party correspondence',paragraphs:dispatches.length?dispatches.map(item=>{
    let recipient='Recipient not recorded';try{const snapshot=JSON.parse(String(item.recipient_snapshot_json??'{}'));recipient=`${snapshot.name??'Unknown recipient'} · ${snapshot.email??'address not recorded'}`;}catch{/* preserve the raw status without trusting malformed JSON */}
    return `${item.created_at} · ${item.purpose} · ${item.status} · ${recipient}${item.sent_at?` · accepted at ${item.sent_at}`:''}${item.provider_message_id?` · provider reference ${item.provider_message_id}`:''}${item.last_error_code?` · error ${item.last_error_code}`:''}${item.provider_reference?` · provider state ${item.provider_reference}`:''}`;
  }):['No outgoing dispatches were recorded for this engagement.']},
    {heading:'External confirmations',paragraphs:confirmations.length?confirmations.map(item=>`${item.type} · ${item.external_party_name} · ${item.status} · due ${item.due_date}${item.verified_at?` · verified ${item.verified_at}`:''}`):['No confirmation records were found.'],
      rows:[]}];
  const correspondenceDoc=await storePdf(env,job,p,{number:`CORR-${candidate.code}-${candidate.revision}`,title:'Management Correspondences Audit Trail',firmName:candidate.firm_name,clientName:candidate.client_name,
    engagementCode:candidate.code,serviceType:candidate.engagement_type,periodStart:candidate.period_start,periodEnd:candidate.period_end,reportDate:candidate.proposed_report_date,sections:correspondence},
    'RELEASE_BUNDLE','BUNDLE_CANDIDATE',candidate.id,candidate.revision,'bundle-candidates');
  const finalFee=BigInt(candidate.final_fee_minor),finalTax=BigInt(candidate.final_tax_minor);
  const feeDoc=await storePdf(env,job,p,{number:candidate.staged_invoice_number,title:'Final 50% Balance Fee Note',firmName:candidate.firm_name,clientName:candidate.client_name,
    engagementCode:candidate.code,serviceType:candidate.engagement_type,periodStart:candidate.period_start,periodEnd:candidate.period_end,reportDate:candidate.proposed_report_date,
    sections:[{heading:'Contractual final installment',rows:[{label:'Accepted contract fee',current:money(candidate.original_fee_minor)},{label:'Original advance installment',current:`-${money(candidate.original_fee_minor-candidate.final_fee_minor)}`},
      {label:'Final installment subtotal',current:money(finalFee)},{label:'Tax under the pinned approved policy',current:money(finalTax)},{label:'Total due',current:money(finalFee+finalTax)}],
      paragraphs:[`Original accepted contract fee: ${money(candidate.original_fee_minor)}.`,`Original accepted fee revision: ${candidate.fee_revision_id}.`,
        'The original advance invoice remains separately outstanding or settled according to the receivables ledger.',
        `Due date: ${candidate.invoice_due_date}.`,`Tax policy: ${candidate.tax_policy_version_id}. Final installment is calculated from the contractual fee less the original advance invoice subtotal, not cash received.`]}]},
    'INVOICE','BUNDLE_CANDIDATE',candidate.id,candidate.revision,'bundle-candidates');
  const parts=[{kind:'REPORT_AND_FS',fileId:report.id,sha256:report.sha256,size:report.size_bytes},{kind:'MANAGEMENT_LETTER',fileId:management.id,sha256:management.sha256,size:management.size_bytes},
    {kind:'REPRESENTATION',fileId:template.id,sha256:template.sha256,size:template.size_bytes},{kind:'CORRESPONDENCE_TRAIL',fileId:correspondenceDoc.fileId,sha256:correspondenceDoc.digest,size:correspondenceDoc.size},
    {kind:'FINAL_FEE_NOTE',fileId:feeDoc.fileId,sha256:feeDoc.digest,size:feeDoc.size}].sort((a,b)=>a.kind.localeCompare(b.kind));
  const contentHash=await sha256Hex(JSON.stringify({dependencyHash:p.dependencyHash,parts:parts.map(item=>({kind:item.kind,sha256:item.sha256,sizeBytes:item.size})),
    representationReturn:{id:candidate.signed_file_id,sha256:signedReturn.sha256,sourceHash:candidate.return_source_hash}}));
  const at=nowIso();
  const partStatements=parts.map(item=>env.DB.prepare(`INSERT INTO bundle_candidate_parts(id,workspace_id,candidate_id,kind,primary_file_id,sha256,size_bytes) VALUES(?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),job.workspace_id,candidate.id,item.kind,item.fileId,item.sha256,item.size));
  await commit({entityType:'BUNDLE_CANDIDATE',entityId:candidate.id,clientId:candidate.client_id,engagementId:candidate.engagement_id,details:{dependencyHash:p.dependencyHash,contentHash,partCount:parts.length,
    representationReturnHash:signedReturn.sha256},result:{bundleCandidateId:candidate.id,status:'READY',contentHash,parts},statements:[...correspondenceDoc.statements,...feeDoc.statements,...partStatements,
      env.DB.prepare(`UPDATE bundle_candidates SET content_hash=?,status='READY',failure_code=NULL,updated_at=? WHERE workspace_id=? AND id=? AND status='PREPARING' AND dependency_hash=?`)
        .bind(contentHash,at,job.workspace_id,candidate.id,p.dependencyHash),
      env.DB.prepare(`UPDATE outbox_jobs SET status='SUCCEEDED',result_file_id=?,result_json=?,last_error_code=NULL,completed_at=?,lease_until=NULL,updated_at=?,version=version+1 WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(feeDoc.fileId,JSON.stringify({bundleCandidateId:candidate.id,status:'READY',contentHash,parts}),at,at,job.workspace_id,job.id,job.lease_until)]});
}

async function sealArchive(env:Env,job:Job,p:Payload,commit:Commit){
  const run=await env.DB.prepare(`SELECT r.id,r.status,e.client_id,e.lifecycle_state,e.locked_at,e.archive_due_at,e.report_signed_at,e.report_date,e.code,e.period_start,e.period_end,
      b.id AS bundle_id,b.content_hash,wp.retention_policy_id,rp.retention_years,rp.retain_indefinitely FROM archive_runs r JOIN engagements e ON e.workspace_id=r.workspace_id AND e.id=r.engagement_id
      JOIN deliverable_bundles b ON b.workspace_id=e.workspace_id AND b.engagement_id=e.id JOIN workspaces wp ON wp.id=e.workspace_id
      JOIN retention_policies rp ON rp.workspace_id=wp.id AND rp.id=wp.retention_policy_id
      WHERE r.workspace_id=? AND r.id=? AND e.id=?`).bind(job.workspace_id,p.archiveRunId,p.engagementId).first<Record<string,any>>();
  if(!run||run.status==='SEALED'||run.lifecycle_state!=='COMPLIANCE_COUNTDOWN'||!run.locked_at||run.client_id!==p.clientId||!run.retention_policy_id)throw new Error('The locked engagement archive is not ready for sealing.');
  const files=(await env.DB.prepare(`SELECT id,original_name,media_type,size_bytes,sha256,object_key,purpose FROM file_versions WHERE workspace_id=? AND engagement_id=? AND state='COMMITTED' ORDER BY purpose,original_name,id`)
    .bind(job.workspace_id,p.engagementId).all<Record<string,any>>()).results??[];
  const missing:string[]=[],verified=files.map(row=>({id:String(row.id),originalName:String(row.original_name),mediaType:String(row.media_type),
    sizeBytes:Number(row.size_bytes),sha256:String(row.sha256??''),purpose:String(row.purpose),objectKey:String(row.object_key)}));
  for(const file of verified){
    if(!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<0||!/^[a-f0-9]{64}$/.test(file.sha256)||!file.objectKey){
      missing.push(`${file.id}: committed file metadata is incomplete or invalid`);continue;
    }
    try{
      const stored=await env.FILES.head(file.objectKey);
      if(!stored)missing.push(`${file.id}: stored reporting bytes are missing`);
      else if(stored.size!==file.sizeBytes)missing.push(`${file.id}: stored reporting bytes do not match the committed size`);
    }catch(error){missing.push(`${file.id}: ${error instanceof Error?error.message:'file unavailable'}`);}
  }
  if(missing.length)throw new Error(`ARCHIVE_INCOMPLETE:${JSON.stringify(missing)}`);
  if(verified.length>65_534)throw new Error('The archive exceeds the supported ZIP entry count.');
  const [transitions,events,opinions,approvals,notes,management,representations,bundles,parts,signatures]=await Promise.all([
    env.DB.prepare(`SELECT id,from_state,to_state,command_id,reason,dependency_hash,transitioned_at FROM state_transitions WHERE workspace_id=? AND engagement_id=? ORDER BY transitioned_at,id`).bind(job.workspace_id,p.engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT sequence,command_type,entity_type,entity_id,before_version,after_version,details_json,previous_hash,event_hash FROM audit_events WHERE workspace_id=? AND engagement_id=? ORDER BY sequence`).bind(job.workspace_id,p.engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT * FROM opinion_versions WHERE workspace_id=? AND engagement_id=? ORDER BY revision`).bind(job.workspace_id,p.engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT * FROM financial_statement_approvals WHERE workspace_id=? AND engagement_id=? ORDER BY approved_at,id`).bind(job.workspace_id,p.engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT * FROM archive_assembly_notes WHERE workspace_id=? AND engagement_id=? ORDER BY recorded_at,id`).bind(job.workspace_id,p.engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT * FROM management_letter_versions WHERE workspace_id=? AND engagement_id=? ORDER BY revision`).bind(job.workspace_id,p.engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT * FROM representation_requests WHERE workspace_id=? AND engagement_id=? ORDER BY created_at,id`).bind(job.workspace_id,p.engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT * FROM deliverable_bundles WHERE workspace_id=? AND engagement_id=? ORDER BY revision`).bind(job.workspace_id,p.engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT dp.* FROM deliverable_parts dp JOIN deliverable_bundles b ON b.workspace_id=dp.workspace_id AND b.id=dp.bundle_id WHERE dp.workspace_id=? AND b.engagement_id=? ORDER BY dp.kind`).bind(job.workspace_id,p.engagementId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT * FROM report_signatures WHERE workspace_id=? AND engagement_id=?`).bind(job.workspace_id,p.engagementId).all<Record<string,unknown>>()
  ]);
  const records={engagement:{id:p.engagementId,clientId:run.client_id,code:run.code,periodStart:run.period_start,periodEnd:run.period_end,lifecycleState:'COMPLIANCE_COUNTDOWN',reportSignedAt:run.report_signed_at,reportDate:run.report_date,archiveDueAt:run.archive_due_at},
    transitions:transitions.results??[],auditEvents:events.results??[],opinions:opinions.results??[],financialStatementApprovals:approvals.results??[],assemblyNotes:notes.results??[],managementLetters:management.results??[],
    representationRequests:representations.results??[],deliverableBundles:bundles.results??[],deliverableParts:parts.results??[],reportSignatures:signatures.results??[]};
  const chain=await env.DB.prepare(`SELECT last_event_hash FROM audit_chain_heads WHERE workspace_id=? AND scope_kind='WORKSPACE' AND scope_id=?`).bind(job.workspace_id,job.workspace_id).first<{last_event_hash:string|null}>();
  const chainHead=chain?.last_event_hash??'0'.repeat(64);
  const manifest={format:'AuditSphere sealed archive manifest v1',engagementId:p.engagementId,workspaceId:job.workspace_id,bundleId:run.bundle_id,lockedAt:run.locked_at,
    sealedAt:nowIso(),reason:p.reason,retentionPolicyId:run.retention_policy_id,auditChainHead:chainHead,recordCount:Object.values(records).reduce((n,value)=>n+(Array.isArray(value)?value.length:1),0),
    records,files:verified.map(({id,originalName,mediaType,sizeBytes,sha256,purpose})=>({id,originalName,mediaType,sizeBytes,sha256,purpose}))};
  const manifestBytes=new TextEncoder().encode(JSON.stringify(manifest,null,2)),manifestHash=await sha256BytesHex(manifestBytes);
  const archiveId=crypto.randomUUID(),manifestFileId=crypto.randomUUID(),archiveArtifactId=crypto.randomUUID(),sealId=crypto.randomUUID(),at=nowIso();
  const retentionSegment=archiveRetentionSegment({retentionYears:run.retention_years,retainIndefinitely:run.retain_indefinitely});
  const archivePrefix=`sealed-archives/retention/${retentionSegment}/${job.workspace_id}/${p.engagementId}`;
  const manifestKey=`${archivePrefix}/${manifestHash}.manifest.json`;
  const archiveKey=`${archivePrefix}/${run.id}-${archiveId}.zip`;
  const archiveFiles=verified.map(file=>{
    const safe=file.originalName.replace(/[\\/]+/g,'_').replace(/\.\./g,'_').slice(0,160);
    return {path:`files/${file.purpose.toLowerCase()}/${file.id}-${safe}`,sizeBytes:file.sizeBytes,sha256:file.sha256,
      body:async()=>{
        const object=await env.FILES.get(file.objectKey);
        if(!object||object.size!==file.sizeBytes)throw new Error(`Stored reporting bytes are missing or changed for ${file.originalName}.`);
        return object.body as ReadableStream<Uint8Array>;
      }};
  });
  const archiveBuild=createStreamingArchive(manifestBytes,archiveFiles);
  const archiveWrite=env.FILES.put(archiveKey,archiveBuild.body,{httpMetadata:{contentType:'application/zip'},customMetadata:{archiveRunId:run.id}});
  let archiveInfo:{sizeBytes:number;sha256:string};
  try{
    archiveInfo=await archiveBuild.completed;
    const written=await archiveWrite;
    if(written.size!==archiveInfo.sizeBytes)throw new Error('The streamed archive size differs from the generated ZIP size.');
    const storedArchive=await env.FILES.get(archiveKey);
    if(!storedArchive||storedArchive.size!==archiveInfo.sizeBytes)throw new Error('The streamed archive could not be read back at its expected size.');
    const verifiedArchive=verifyStreamingSha256(storedArchive.body as ReadableStream<Uint8Array>,archiveInfo.sizeBytes,archiveInfo.sha256);
    const archiveReader=verifiedArchive.getReader();
    try{while(!(await archiveReader.read()).done){/* verify each chunk without retaining the archive */}}
    finally{archiveReader.releaseLock();}
  }catch(error){
    await archiveWrite.catch(()=>undefined);
    await env.FILES.delete(archiveKey).catch(()=>undefined);
    throw error;
  }
  const archiveHash=archiveInfo.sha256,archiveSizeBytes=archiveInfo.sizeBytes;
  await env.FILES.put(manifestKey,manifestBytes,{httpMetadata:{contentType:'text/plain'},customMetadata:{sha256:manifestHash,archiveRunId:run.id},sha256:hexToArrayBuffer(manifestHash)});
  const manifestObject=await env.FILES.get(manifestKey);
  if(!manifestObject||manifestObject.size!==manifestBytes.byteLength||await sha256BytesHex(new Uint8Array(await manifestObject.arrayBuffer()))!==manifestHash){
    await env.FILES.delete(archiveKey).catch(()=>undefined);
    throw new Error('The sealed archive manifest did not pass object-store read-back verification.');
  }
  const policy=await env.DB.prepare(`SELECT id FROM retention_policies WHERE workspace_id=? AND id=?`).bind(job.workspace_id,run.retention_policy_id).first<{id:string}>();if(!policy)throw new Error('The referenced retention policy is missing.');
  const systemCommandId=crypto.randomUUID(),systemRequestHash=await sha256Hex(JSON.stringify({jobId:job.id,engagementId:p.engagementId,archiveHash}));
  const stateTransitionId=crypto.randomUUID(),newBundleArtifactId=archiveArtifactId;
  const recordCount=Object.values(records).reduce((n,value)=>n+(Array.isArray(value)?value.length:1),0);
  const fileCount=verified.length;
  const statements=[env.DB.prepare(`INSERT INTO command_receipts(id,workspace_id,version,idempotency_key,request_hash,actor_snapshot_json,command_type,response_status,response_json,created_at)
    VALUES(?,?,1,?,?,?,'archive.seal',200,?,?)`).bind(systemCommandId,job.workspace_id,`archive-seal:${run.id}`,systemRequestHash,JSON.stringify({actorId:null,persona:'SYSTEM',assurance:'SYSTEM'}),JSON.stringify({archiveRunId:run.id,status:'SEALED',archiveSha256:archiveHash}),at),
    env.DB.prepare(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
      VALUES(?,?,1,?,?,'archive-manifest.json','text/plain',?,?,?,'ARCHIVE','COMMITTED',?,1,?,?,NULL,NULL)`)
      .bind(manifestFileId,job.workspace_id,run.client_id,p.engagementId,manifestBytes.byteLength,manifestHash,manifestKey,at,at,at),
    env.DB.prepare(`INSERT INTO file_versions(id,workspace_id,version,client_id,engagement_id,original_name,media_type,size_bytes,sha256,object_key,purpose,state,committed_at,immutable,created_at,updated_at,created_by_actor_id,updated_by_actor_id)
      VALUES(?,?,1,?,?,'sealed-audit-archive.zip','application/zip',?,?,?,'ARCHIVE','COMMITTED',?,1,?,?,NULL,NULL)`)
      .bind(archiveId,job.workspace_id,run.client_id,p.engagementId,archiveSizeBytes,archiveHash,archiveKey,at,at,at),
    env.DB.prepare(`INSERT INTO generated_artifacts(id,workspace_id,client_id,engagement_id,artifact_kind,source_entity_type,source_entity_id,source_revision,file_version_id,content_sha256,size_bytes,generated_at,generated_by_job_id)
      VALUES(?,?,?,?,'ARCHIVE','ARCHIVE_RUN',?,1,?,?,?,?,?)`).bind(newBundleArtifactId,job.workspace_id,run.client_id,p.engagementId,run.id,archiveId,archiveHash,archiveSizeBytes,at,job.id),
    env.DB.prepare(`UPDATE archive_runs SET status='SEALED',frozen_snapshot_hash=?,missing_files_json='[]',error_code=NULL,last_attempt_at=?,updated_at=? WHERE workspace_id=? AND id=? AND status<>'SEALED'`)
      .bind(manifestHash,at,at,job.workspace_id,run.id),
    env.DB.prepare(`UPDATE engagements SET lifecycle_state='ARCHIVED_READ_ONLY',version=version+1,updated_at=?,updated_by_actor_id=NULL WHERE workspace_id=? AND id=? AND lifecycle_state='COMPLIANCE_COUNTDOWN' AND locked_at IS NOT NULL`)
      .bind(at,job.workspace_id,p.engagementId),
    env.DB.prepare(`INSERT INTO state_transitions(id,workspace_id,client_id,engagement_id,version,from_state,to_state,command_id,reason,dependency_hash,transitioned_at)
      VALUES(?,?,?, ?,1,'COMPLIANCE_COUNTDOWN','ARCHIVED_READ_ONLY',?,?,?,?)`).bind(stateTransitionId,job.workspace_id,run.client_id,p.engagementId,systemCommandId,
        'The released audit file was assembled, all committed objects were hash-verified, and the immutable archive manifest was sealed.',manifestHash,at),
    env.DB.prepare(`INSERT INTO archive_seals(id,workspace_id,client_id,engagement_id,bundle_id,sealed_at,reason,manifest_file_id,archive_file_id,audit_chain_head,manifest_sha256,archive_sha256,record_count,file_count,retention_policy_id,locked_by_actor_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(sealId,job.workspace_id,run.client_id,p.engagementId,run.bundle_id,at,p.reason,manifestFileId,archiveId,chainHead,manifestHash,archiveHash,recordCount,fileCount,run.retention_policy_id,p.lockedByActorId??null)];
  await commit({entityType:'ARCHIVE_SEAL',entityId:sealId,clientId:run.client_id,engagementId:p.engagementId,details:{archiveRunId:run.id,manifestSha256:manifestHash,archiveSha256:archiveHash,recordCount,fileCount},
    result:{archiveRunId:run.id,status:'SEALED',manifestFileId,archiveFileId:archiveId,manifestSha256:manifestHash,archiveSha256:archiveHash},statements:[...statements,
      env.DB.prepare(`UPDATE outbox_jobs SET status='SUCCEEDED',result_file_id=?,result_json=?,last_error_code=NULL,completed_at=?,lease_until=NULL,updated_at=?,version=version+1 WHERE workspace_id=? AND id=? AND status='RUNNING' AND lease_until=?`)
        .bind(archiveId,JSON.stringify({archiveRunId:run.id,status:'SEALED',archiveFileId:archiveId,manifestFileId,archiveSha256:archiveHash}),at,at,job.workspace_id,job.id,job.lease_until)]});
}

function hexToArrayBuffer(hex:string):ArrayBuffer{
  const bytes=new Uint8Array(hex.length/2);
  for(let index=0;index<bytes.length;index++)bytes[index]=Number.parseInt(hex.slice(index*2,index*2+2),16);
  return bytes.buffer;
}
