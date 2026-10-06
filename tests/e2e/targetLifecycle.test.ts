import { runVisibleAlignmentJourney } from '../helpers/visibleAlignmentJourney';
import { before, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { CdpTab } from '../helpers/cdp';
import { launchHeadlessChrome } from '../helpers/headlessChrome';
import { PROJECT_TEMPLATES, templateUrl } from '../../src/services/projectTemplates';
import { DECK_SLIDES } from '../../src/components/clientRequirements/deckData';
import { unzipSync } from 'fflate';
let vite: ChildProcess, chrome: ChildProcess, tab: CdpTab, profile: string, browserPort: number;
const origin = 'http://127.0.0.1:3007',
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function saveEvidence(path: string, data: string | Buffer) {
  for (let attempt = 0; ; attempt++) {
    try { writeFileSync(path, data); return; }
    catch (error) {
      if (attempt >= 7 || !['UNKNOWN','EBUSY','EPERM'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
      await sleep(150);
    }
  }
}
before(
  async () => {
    vite = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3007', '--strictPort'],
      { stdio: 'ignore', env: { ...process.env } }
    );
    for (let n = 0; n < 100; n++) {
      if (
        await fetch(origin)
          .then((r) => r.ok)
          .catch(() => false)
      )
        break;
      await sleep(100);
    }
    const path = process.env.CHROME_PATH || (process.platform === 'win32'
      ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync)
      : process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'].find(existsSync));
    assert.ok(existsSync(path));
    const browser = await launchHeadlessChrome(path, { windowSize: '1440,1000', profilePrefix: 'auditsphere-target-', timeoutMs: 45000 });
    chrome = browser.child;
    profile = browser.profileDirectory;
    browserPort = browser.port;
    const target = (await fetch(`http://127.0.0.1:${browserPort}/json/new?${origin}`, {
      method: 'PUT'
    }).then((r) => r.json())) as any;
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(Error('CDP failed')), { once: true });
    });
    tab = new CdpTab(ws, origin, process.env.TEST_CLOUD_API_URL ? [new URL(process.env.TEST_CLOUD_API_URL).origin] : []);
    await tab.command('Runtime.enable');
    await tab.command('Page.enable');
    await tab.command('Network.enable');
    await tab.blockExternalHttp();
    // Chrome on Windows can ignore the initial URL passed to /json/new; make
    // the harness navigation explicit before waiting for the React shell.
    await tab.command('Page.navigate', { url: origin });
    for (let n = 0; n < 100; n++) {
      if (await tab.evaluate<boolean>('!!document.querySelector(".sidebar")')) return;
      await sleep(100);
    }
    throw Error('React shell did not render');
  },
  { timeout: 75000 }
);
after(async () => {
  tab?.close();
  for (const child of [chrome, vite])
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((r) => child.once('exit', () => r()));
      child.kill('SIGTERM');
      await exited;
    }
  if (profile) rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});
it('US-FINAL-ALIGN-001 scenarios 1–3 use visible controls from lead through planning and fieldwork', {timeout:120000}, async()=> {
 const {approvalFixture,...result}=await runVisibleAlignmentJourney(tab);
 mkdirSync('tests/fixtures',{recursive:true});
 await saveEvidence('tests/fixtures/current-partner-approval.json',JSON.stringify(approvalFixture,null,2));
 await saveEvidence('docs/prototype/evidence/final-alignment-visible-journey.json',JSON.stringify(result,null,2));
});
it('visible Partner reporting flow retains signed LOR and releases the exact five-file bundle', async () => {
  const result=await tab.evaluate<any>(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopBeforePartner:true}))`);
  await tab.evaluate(`(()=>{const f=document.querySelector('[data-target-form="partner-clearance"]');f.querySelector('[name="notes"]').value='Current SRM and audited evidence independently evaluated for final reporting.';f.requestSubmit()})()`);await sleep(150);
  await tab.evaluate(`location.hash='delivery'`);await sleep(150);
  assert.equal(await tab.evaluate(`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const state=s.getSnapshot();return (await import('/src/services/targetLifecycle.ts')).computeSystemState(state,state.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)})).state})`),'PARTNER_APPROVAL');
  await tab.evaluate(`document.querySelector('[data-target-form="opinion"]').requestSubmit()`);await sleep(150);
  // R10: opinion selection alone is not the signature event; the state stays in
  // PARTNER_APPROVAL until the partner records the simulated signature/seal.
  assert.equal(await tab.evaluate(`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const state=s.getSnapshot();return (await import('/src/services/targetLifecycle.ts')).computeSystemState(state,state.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)})).state})`),'PARTNER_APPROVAL');
  await tab.evaluate(`(()=>{const f=document.querySelector('[data-target-form="partner-signature"]');f.querySelector('[name="note"]').value='Simulated digital signature and firm seal authorize the current reporting basis.';f.requestSubmit()})()`);await sleep(150);
  assert.equal(await tab.evaluate(`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const state=s.getSnapshot();return (await import('/src/services/targetLifecycle.ts')).computeSystemState(state,state.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)})).state})`),'DELIVERABLE_RELEASE');
  assert.equal(await tab.evaluate<boolean>(`document.body.innerText.includes('Synthetic Partner signature') && !document.body.innerText.includes('QFC-AUD-SIG-9281')`),true);
  await tab.evaluate(`document.querySelector('[data-target-form="deliverables"]').requestSubmit()`);
  const inspect=`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().engagements.find(e=>e.id===${JSON.stringify(result.engagementId)}).auditLifecycle)`;
  let lifecycle:any;
  for(let n=0;n<100;n++){lifecycle=await tab.evaluate(inspect);if(lifecycle.deliverables.length===1)break;await sleep(100);}
  assert.equal(lifecycle.deliverables[0].artifacts.length,5);assert.equal(lifecycle.deliverables[0].deliveredAt,undefined);
  await tab.evaluate(`import('/src/services/exportService.ts').then(m=>{const file=new File([m.createPDFBlob('Synthetic executive-signed LOR',['Synthetic fixture only; Managing Director and Finance Executive signatures.'])],'signed-lor.pdf',{type:'application/pdf'});const transfer=new DataTransfer();transfer.items.add(file);const f=document.querySelector('[data-target-form="signed-lor"]');f.querySelector('[name="signedLor"]').files=transfer.files;f.querySelector('[name="executive"]').value='Demo Managing Director';f.querySelector('[name="financeExecutive"]').value='Demo CFO';f.querySelector('[name="inspection"]').value='Synthetic executive signature inspection against this current bundle.';f.requestSubmit()})`);
  for(let n=0;n<100;n++){lifecycle=await tab.evaluate(inspect);if(lifecycle.signedRepresentations?.length===1)break;await sleep(100);}
  assert.equal(lifecycle.signedRepresentations.length,1);
  await tab.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Release Bundle to Client Portal')).click()`);
  await sleep(150);lifecycle=await tab.evaluate(inspect);assert.ok(lifecycle.deliverables[0].deliveredAt);
  assert.equal(lifecycle.signedRepresentations[0].deliverableSetId,lifecycle.deliverables[0].id);
  await tab.evaluate("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona('billing'))");await tab.evaluate("location.hash='billing'");await sleep(150);
  const balanceId=lifecycle.balanceInvoices[0].invoiceId;
  const balanceAmount=await tab.evaluate<number>("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().invoices.find(i=>i.id==="+JSON.stringify(balanceId)+").amount)");
  const payment=async(amount:number,reference:string)=>{await tab.evaluate("(()=>{const f=document.querySelector('[data-target-form=final-fee-payment]');f.querySelector('[name=amount]').value="+amount+";f.querySelector('[name=reference]').value="+JSON.stringify(reference)+";f.requestSubmit()})()");await sleep(150);};
  await payment(balanceAmount/2,'VISIBLE-FINAL-PARTIAL');
  assert.equal(await tab.evaluate<number>("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().invoices.find(i=>i.id==="+JSON.stringify(balanceId)+").paid)"),balanceAmount/2);
  await tab.evaluate("(()=>{const f=document.querySelector('[data-target-form=final-fee-reversal]');f.querySelector('[name=reason]').value='Synthetic incorrect allocation reversed with retained history.';f.requestSubmit()})()");await sleep(150);
  assert.equal(await tab.evaluate<number>("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().invoices.find(i=>i.id==="+JSON.stringify(balanceId)+").paid)"),0);
  await payment(balanceAmount,'VISIBLE-FINAL-SETTLED');
  assert.equal(await tab.evaluate<string>("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().invoices.find(i=>i.id==="+JSON.stringify(balanceId)+").status)"),'Paid');
  await saveEvidence('docs/prototype/evidence/review-final-fee-ui.json',JSON.stringify({partialPayment:balanceAmount/2,reversed:true,settled:balanceAmount,issuedObligations:1,method:'Visible final-fee payment and reversal forms; synthetic offline receipts.'},null,2));

  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona('client_finance'))`);
  await tab.evaluate(`location.hash='portal'`);await sleep(150);
  await tab.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('4. Final Certified Deliverables')).click()`);await sleep(100);
  assert.equal(await tab.evaluate<number>(`document.querySelectorAll('[data-testid="client-release-set"]').length`),1);
  assert.equal(await tab.evaluate<number>(`document.querySelectorAll('[data-testid="client-release-set"] button').length`),5);
  await tab.evaluate(`window.__clientURL=URL.createObjectURL;URL.createObjectURL=function(blob){window.__clientArtifact=blob;return window.__clientURL.call(URL,blob)};document.querySelector('[data-testid="client-release-set"] button').click()`);
  for(let n=0;n<100;n++){if(await tab.evaluate<boolean>(`!!window.__clientArtifact?.size`))break;await sleep(50);}
  assert.equal(await tab.evaluate<boolean>(`window.__clientArtifact?.size>0`),true,'client downloads genuine released artifact bytes');
  await tab.evaluate(`URL.createObjectURL=window.__clientURL`);
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona('records'))`);
  await tab.evaluate(`location.hash='records'`);await sleep(150);
  assert.equal(await tab.evaluate<boolean>(`document.querySelector('main').innerText.includes('Counting Down') && document.querySelector('main').innerText.includes('Days remaining')`),true);
  await tab.evaluate(`document.querySelector('[data-target-form="freeze"]').requestSubmit()`);
  const archiveInspect=`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{const e=s.getSnapshot().engagements.find(e=>e.id===${JSON.stringify(result.engagementId)});return {archive:e.archive,control:e.auditLifecycle.archiveControl}})`;
  let sealed:any;
  for(let n=0;n<100;n++){sealed=await tab.evaluate(archiveInspect);if(sealed.archive?.packagingStatus==='Verified')break;await sleep(100);}
  assert.equal(sealed.control.freezeStatus,'Frozen');assert.equal(sealed.archive.packagingStatus,'Verified');
  assert.equal(await tab.evaluate<boolean>(`!!document.querySelector('[data-testid="frozen-archive"]') && !document.querySelector('[data-target-form="freeze"]')`),true);
  await tab.evaluate(`window.__originalObjectURL=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob.type.includes('zip'))window.__inspectionDownload=blob;return window.__originalObjectURL.call(URL,blob)};Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Download complete inspection ZIP')).click()`);
  let zipBytes='';
  try {
    for(let n=0;n<100;n++){zipBytes=await tab.evaluate<string>(`window.__inspectionDownload?window.__inspectionDownload.arrayBuffer().then(buffer=>btoa(Array.from(new Uint8Array(buffer),b=>String.fromCharCode(b)).join(''))):''`);if(zipBytes)break;await sleep(100);}
  } finally {await tab.evaluate(`URL.createObjectURL=window.__originalObjectURL`);}
  const zip=unzipSync(Buffer.from(zipBytes,'base64'));
  const manifest=JSON.parse(new TextDecoder().decode(zip['audit-file-manifest.json']));
  assert.equal(manifest.exportStatus,'Verified');
  assert.ok(Object.keys(zip).some(name=>name.endsWith('signed-lor.pdf')));
  assert.ok(Object.keys(zip).some(name=>name.endsWith('target-tb.csv')));
  assert.ok(Object.keys(zip).some(name=>name.endsWith('population.csv')));
  const mutation=await tab.evaluate<string>(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('superuser');try{s.lifecycle.confirmMapping(${JSON.stringify(result.engagementId)},[]);return 'ALLOWED'}catch(error){return String(error)}})`);
  assert.match(mutation,/frozen|read-only/i);
}, {timeout:60000});
it('critical confirmation transitions through visible forms automatically issue one verified Holding Letter', async () => {
  const result=await tab.evaluate<any>(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopAtFieldwork:true}))`);
  await tab.evaluate(`location.hash='confirmations'`);await sleep(150);
  assert.deepEqual(await tab.evaluate(`[...document.querySelector('[data-target-form="confirmation"] select[name="type"]').options].map(option=>option.value)`),['Bank','Accounts Receivable','Accounts Payable','Inventory','Legal']);
  await tab.evaluate(`(()=>{const f=document.querySelector('[data-target-form="confirmation"]');f.querySelector('[name="counterparty"]').value='Synthetic Confirmation Bank';f.requestSubmit()})()`);
  await sleep(150);
  for(const status of ['Requested','Awaiting']){
    await tab.evaluate(`(()=>{const f=Array.from(document.querySelectorAll('form')).find(f=>f.textContent.includes('Update confirmation: Synthetic Confirmation Bank'));f.querySelector('[name="status"]').value=${JSON.stringify(status)};f.querySelector('[name="note"]').value='Bank confirmation requested and followed up against the current cash balance.';f.requestSubmit()})()`);
    await sleep(200);
  }
  const inspect=`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const state=s.getSnapshot(),e=state.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)});const {criticalConfirmationBlockers}=await import('/src/services/targetLifecycle.ts');return {letters:e.auditLifecycle.holdingLetters||[],blockers:criticalConfirmationBlockers(state,e)}})`;
  let completed:any;
  for(let n=0;n<100;n++){completed=await tab.evaluate(inspect);if(completed.letters.length===1)break;await sleep(100);}
  assert.equal(completed.letters.length,1);assert.ok(completed.blockers.length>0);
  assert.equal(await tab.evaluate<boolean>(`import('/src/services/artifactStore.ts').then(async m=>(await (await m.loadVerifiedArtifact(${JSON.stringify(completed.letters[0].artifact)})).text()).startsWith('%PDF-'))`),true);
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{const state=s.getSnapshot();const original=state.confirmations.find(c=>c.counterparty==='Synthetic Confirmation Bank');state.confirmations.push({...original,id:'LEGACY-DEBTOR',type:'Debtor',counterparty:'Historical Debtor',critical:false});s.importStateJSON(JSON.stringify(state))})`);await sleep(150);
  assert.equal(await tab.evaluate<boolean>(`[...document.querySelectorAll('section')].some(section=>section.querySelector('h3')?.textContent.includes('Historical Debtor') && section.querySelector('h3').textContent.includes('Historical type') && [...section.querySelectorAll('button')].some(button=>button.textContent==='Record transition' && button.matches(':disabled')))`),true);
  await tab.command('Page.reload');
  for(let n=0;n<100;n++){if(await tab.evaluate<boolean>('!!document.querySelector(".sidebar")'))break;await sleep(100);}
  assert.equal((await tab.evaluate<any>(inspect)).letters.length,1);
  assert.equal(await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.loadError)`),null);
}, {timeout:60000});
it('D5 Workprograms & Evidence opens current FSLI fieldwork rather than the retired audit redirect', async () => {
  await tab.evaluate(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopAtFieldwork:true}))`);
  await tab.evaluate(`location.hash='overview'`);await sleep(150);
  await tab.evaluate(`Array.from(document.querySelectorAll('.sidebar button')).find(button=>button.textContent.includes('Workprograms & Evidence')).click()`);await sleep(150);
  assert.equal(await tab.evaluate('location.hash'),'#audit-fieldwork');
  assert.equal(await tab.evaluate<boolean>(`document.querySelector('main').innerText.includes('Audit programs & fieldwork') && !document.querySelector('main').innerText.includes('Preparer → Manager → SRM → Partner')`),true);
  assert.ok(await tab.evaluate<number>(`document.querySelectorAll('select[name="program"] option').length`)>0);
}, {timeout:30000});
it('two real browser tabs preserve independent FSLI procedure edits after reload', async () => {
  const result=await tab.evaluate<any>(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopAtFieldwork:true}))`);
  const target=await fetch(`http://127.0.0.1:${browserPort}/json/new?${origin}`,{method:'PUT'}).then(r=>r.json()) as any;
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve,reject)=>{ws.addEventListener('open',()=>resolve(),{once:true});ws.addEventListener('error',()=>reject(Error('Second tab CDP failed')),{once:true});});
  const other=new CdpTab(ws,origin);
  try {
    await other.command('Runtime.enable');
    for(let n=0;n<100;n++){if(await other.evaluate<boolean>('!!document.querySelector(".sidebar")'))break;await sleep(100);}
    const ids=await tab.evaluate<string[]>(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().auditPrograms.filter(p=>p.engagementId===${JSON.stringify(result.engagementId)}).slice(0,2).map(p=>p.procedures[0].id))`);
    assert.equal(ids.length,2);
    assert.notEqual(ids[0],ids[1],'the two tabs exercise different procedure rows');
    const edit=(id:string,label:string)=>`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.updateAuditProcedureExecution(${JSON.stringify(result.engagementId)},${JSON.stringify(id)},${JSON.stringify(label)},'Evidence supports the recorded conclusion.',''))`;
    await Promise.all([tab.evaluate(edit(ids[0],'Independent work in first tab')),other.evaluate(edit(ids[1],'Independent work in second tab'))]);
    const inspect=`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{const state=s.getSnapshot();return state.auditPrograms.filter(p=>p.engagementId===${JSON.stringify(result.engagementId)}).flatMap(p=>p.procedures).filter(p=>${JSON.stringify(ids)}.includes(p.id)).map(p=>p.workPerformed)})`;
    for(let n=0;n<100;n++){const values=await tab.evaluate<string[]>(inspect);if(values.includes('Independent work in second tab'))break;await sleep(50);}
    await sleep(300);
    for(const page of [tab,other])assert.deepEqual(await page.evaluate(inspect),['Independent work in first tab','Independent work in second tab'],JSON.stringify(await page.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>({conflict:s.hasStorageConflict(),stored:JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditPrograms.filter(p=>p.engagementId===${JSON.stringify(result.engagementId)}).flatMap(p=>p.procedures).slice(0,2).map(p=>p.workPerformed)}))`)));
    await other.command('Page.reload');
    for(let n=0;n<100;n++){if(await other.evaluate<boolean>('!!document.querySelector(".sidebar")'))break;await sleep(100);}
    assert.deepEqual(await other.evaluate(inspect),['Independent work in first tab','Independent work in second tab']);
  } finally {other.close();await fetch(`http://127.0.0.1:${browserPort}/json/close/${target.id}`);}
}, {timeout:60000});
it('A07 visible workbook forms enforce Digital, Physical and Hybrid evidence',async()=>{
  const result=await tab.evaluate<any>("import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopBeforeManager:true}))");
  const setup=await tab.evaluate<any>("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{const state=s.getSnapshot(),e=state.engagements.find(e=>e.id==="+JSON.stringify(result.engagementId)+"),p=state.samplePopulations.find(p=>p.engagementId===e.id),program=state.auditPrograms.find(p=>p.engagementId===e.id&&p.area==='Revenue'),wp=e.workpapers.find(w=>w.id===program.leadWorkpaperRef),item=p.items.find(i=>i.selected);s.lifecycle.attachPhysicalReference(e.id,wp.id,p.id,item.id,{indexCode:'X-1',description:'Synthetic original customer invoice inspection',box:'Demo cabinet'});for(const id of wp.evidenceRefs)s.unlinkWorkpaperEvidence(e.id,wp.id,id,'Physical-only evidence readiness demonstration.');return {wp:wp.id,doc:wp.evidenceRefs[0]||state.documents.find(d=>d.engagementId===e.id&&!d.brokenLink&&!state.documents.some(n=>n.supersedesDocumentId===d.id)).id}})");
  await tab.evaluate("location.hash='reviews'");await sleep(150);
  const form="Array.from(document.querySelectorAll('[data-target-form=workpaper]')).find(f=>f.querySelector('h3')?.textContent.includes("+JSON.stringify(setup.wp)+"))";
  const inspect="import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().engagements.find(e=>e.id==="+JSON.stringify(result.engagementId)+").workpapers.find(w=>w.id==="+JSON.stringify(setup.wp)+"))";
  const initial=await tab.evaluate<any>(inspect);
  const save=async(mode:string)=>{await tab.evaluate("(()=>{const f="+form+";if(!f)throw Error('Workpaper form not found');f.querySelector('[name=evidenceMode]').value="+JSON.stringify(mode)+";f.requestSubmit()})()");await sleep(300);};
  await save('Digital');assert.equal((await tab.evaluate<any>(inspect)).version,initial.version);
  await save('Physical');const physical=await tab.evaluate<any>(inspect);assert.equal(physical.evidenceMode,'Physical');assert.ok(physical.version>initial.version);
  await save('Hybrid');assert.equal((await tab.evaluate<any>(inspect)).version,physical.version);
  await tab.evaluate("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.linkWorkpaperEvidence("+JSON.stringify(result.engagementId)+","+JSON.stringify(setup.wp)+","+JSON.stringify(setup.doc)+"))");
  await save('Hybrid');const hybrid=await tab.evaluate<any>(inspect);assert.equal(hybrid.evidenceMode,'Hybrid');assert.ok(hybrid.version>physical.version);
  const verified=await tab.evaluate<boolean>("Promise.all([import('/src/store/prototypeStore.ts'),import('/src/services/artifactStore.ts')]).then(async([{prototypeStore:s},m])=>{const w=s.getSnapshot().engagements.find(e=>e.id==="+JSON.stringify(result.engagementId)+").workpapers.find(w=>w.id==="+JSON.stringify(setup.wp)+");return (await m.loadVerifiedArtifact(w.generatedArtifact)).size>0})");assert.ok(verified);
  await saveEvidence('docs/prototype/evidence/review-evidence-modes-ui.json',JSON.stringify({digitalMissingBlocked:true,physicalWorkbookGenerated:true,hybridMissingDigitalBlocked:true,hybridWorkbookGenerated:true,genuineBytesVerified:true,workpaper:setup.wp},null,2));
});

it('A04 visible staffing preserves two associates and multiple Manager phases with date-axis leave', async()=>{
  const result=await tab.evaluate<any>("import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopAtFieldwork:true}))");
  await tab.evaluate("location.hash='scheduling'");await sleep(150);
  const setRow=async(index:number,prefix:string,value:string)=>{await tab.evaluate("(()=>{const row=document.querySelectorAll('.target-staff-row')["+index+"];const e=row.querySelector('[name^="+JSON.stringify(prefix+'-')+"]');Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()");await sleep(60);};
  const managerIndex=await tab.evaluate<number>("Array.from(document.querySelectorAll('.target-staff-row')).findIndex(row=>row.querySelector('[name^=role-]').value==='Manager')");
  await setRow(managerIndex,'phase','Planning');await setRow(managerIndex,'capacity','1000');await setRow(managerIndex,'leave','8');await setRow(managerIndex,'target','72');
  const add=async()=>{await tab.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Add allocation row')).click()");await sleep(70);return await tab.evaluate<number>("document.querySelectorAll('.target-staff-row').length-1");};
  const review=await add();await setRow(review,'role','Manager');await setRow(review,'user','manager');await setRow(review,'phase','Review');await setRow(review,'hours','12');await setRow(review,'charge','750');await setRow(review,'cost','375');await setRow(review,'start','2026-10-05');await setRow(review,'end','2026-10-11');await setRow(review,'capacity','1000');await setRow(review,'leave','8');await setRow(review,'target','72');
  const associate=await add();await setRow(associate,'user','preparer-2');await setRow(associate,'start','2026-10-05');await setRow(associate,'end','2026-10-11');await setRow(associate,'capacity','100');await setRow(associate,'target','72');
  await tab.evaluate("(()=>{const f=document.querySelector('[data-target-form=staffing]');f.querySelector('[name=reason]').value='Manager Planning/Review and two associate allocations with saved leave intervals.';f.requestSubmit()})()");await sleep(200);
  const inspect="import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().engagements.find(e=>e.id==="+JSON.stringify(result.engagementId)+").auditLifecycle.staffing.at(-1).allocations)";
  const saved=await tab.evaluate<any[]>(inspect);assert.ok(saved.some(a=>a.userId==='manager'&&a.phase==='Planning'));assert.ok(saved.some(a=>a.userId==='manager'&&a.phase==='Review'&&a.startDate==='2026-10-05'));assert.ok(saved.some(a=>a.userId==='preparer-2'));
  await tab.command('Page.reload');await sleep(200);for(let n=0;n<100;n++){if(await tab.evaluate<boolean>('!!document.querySelector(".target-staff-row")'))break;await sleep(100);}assert.deepEqual(await tab.evaluate(inspect),saved);
  assert.equal(await tab.evaluate<boolean>("document.querySelector('main').innerText.includes('72–77%') && document.querySelector('main').innerText.includes('cap') && document.querySelector('main').innerText.includes('leave')"),true);
  await saveEvidence('docs/prototype/evidence/review-staffing-ui.json',JSON.stringify({multipleAssociates:true,managerPhases:['Planning','Review'],reloadPreserved:true,leaveHours:8,targetPct:72,allocations:saved},null,2));
});

it('retired route hashes fall back safely and never reach the legacy snapshot Worker', async () => {
  // Staff persona: a retired hash lands on the safe overview default, never a redirect into
  // another module, and the hash is rewritten to a real current route.
  await tab.evaluate("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona('manager'))");await sleep(120);
  await tab.evaluate("location.hash='adjustments'");await sleep(200);
  assert.equal(await tab.evaluate<string>('location.hash'), '#overview', 'retired hash falls back to the staff default');
  assert.equal(await tab.evaluate<boolean>("document.querySelector('main').innerText.includes('Lifecycle Overview') || !!document.querySelector('main')"), true);
  // Client persona: the safe fallback is the portal.
  await tab.evaluate("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona('client'))");await sleep(120);
  await tab.evaluate("location.hash='consolidation'");await sleep(200);
  assert.equal(await tab.evaluate<string>('location.hash'), '#portal', 'retired hash falls back to the client portal');
  // Sidebar contains only current routes: every hash link names a route the resolver accepts.
  const sidebarRoutes = await tab.evaluate<string[]>("Array.from(document.querySelectorAll('#primary-sidebar a[href]')).map(a=>a.getAttribute('href').slice(1)).filter(h=>h && !h.startsWith('http'))");
  const invalid = (await Promise.all(sidebarRoutes.map(route => tab.evaluate<boolean>("import('/src/services/routes.ts').then(m=>!m.isRouteKey("+JSON.stringify(route)+"))")))).filter(isInvalid => isInvalid);
  assert.deepEqual(invalid, [], 'the sidebar only links current routes');
  // No request in this browser session may target the retired snapshot Worker hostname.
  assert.ok(!tab.requests.some(url => url.includes('steaudit-prototype-demo-api')), JSON.stringify(tab.requests.filter(url => url.includes('demo-api'))));
  await tab.evaluate("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona('manager'))");await sleep(100);
  await tab.evaluate("location.hash='overview'");await sleep(120);
});

it('cloud workspace controls degrade honestly without a cloud API and label local-only edits', async () => {
  await tab.evaluate("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('superuser');location.hash='proposals'})");await sleep(150);
  await tab.evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent==='Presenter / Demo Controls').click()");await sleep(200);
  // No /api exists on the vite dev origin: the controls must fail closed with honest copy,
  // the label stays LOCAL WORKSPACE, and no legacy snapshot Worker is ever contacted.
  await tab.evaluate("[...document.querySelectorAll('[data-testid=cloud-demo-controls] button')].find(button=>button.textContent==='Create cloud workspace').click()");await sleep(250);
  assert.equal(await tab.evaluate<boolean>("document.body.innerText.includes('LOCAL WORKSPACE')"), true);
  assert.ok(await tab.evaluate<boolean>("!!document.querySelector('[data-testid=cloud-demo-controls]')"), 'controls render');
  assert.equal(await tab.evaluate<boolean>("document.body.innerText.includes('steaudit-prototype-demo-api')"), false, 'no legacy Worker naming is surfaced');
  assert.ok(!tab.requests.some(url => url.includes('steaudit-prototype-demo-api')), 'zero requests to the retired Worker hostname');
  await tab.evaluate("location.hash='overview'");await sleep(120);
});

it('Manager clearance through the visible form automatically generates a current PDF SRM', async () => {
  const result=await tab.evaluate<any>(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopBeforeManager:true}))`);
  await tab.evaluate(`(()=>{const f=document.querySelector('[data-target-form="manager-clearance"]');const input=f.querySelector('[name="notes"]');input.value='All current workpapers and supporting evidence independently reviewed.';input.dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit()})()`);
  const inspect=`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const state=s.getSnapshot(),e=state.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)});const {currentReview}=await import('/src/services/targetLifecycle.ts');return {review:currentReview(state,e),srms:e.auditLifecycle.srms.length}})`;
  let completed:any;
  for(let n=0;n<100;n++){completed=await tab.evaluate<any>(inspect);if(completed.srms===1)break;await sleep(100);}
  assert.equal(completed.srms,1);assert.equal(completed.review.manager,true);assert.equal(completed.review.srm,true);
  assert.equal(await tab.evaluate<boolean>(`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const e=s.getSnapshot().engagements.find(e=>e.id===${JSON.stringify(result.engagementId)});const {loadVerifiedArtifact}=await import('/src/services/artifactStore.ts');return (await (await loadVerifiedArtifact(e.auditLifecycle.srms[0].artifact)).text()).startsWith('%PDF-')})`),true);
}, {timeout:60000});
it('records payment through the visible form and retries failed receipt/onboarding without duplicating payment', async () => {
  const result=await tab.evaluate<any>(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopBeforeAdvance:true}))`);
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{window.__receiptWriter=s.lifecycle.artifactWriter;s.lifecycle.artifactWriter=async()=>{throw Error('Injected IndexedDB failure')};const f=document.querySelector('[data-target-form="advance"]');f.querySelector('[name="reference"]').value='UI-RETRY-001';f.querySelector('[name="reference"]').dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit()})`);
  for(let n=0;n<100;n++){if(await tab.evaluate<boolean>(`document.body.innerText.includes('Payment recorded once; receipt/onboarding pending')`))break;await sleep(100);}
  assert.equal(await tab.evaluate<boolean>(`document.body.innerText.includes('Payment recorded once; receipt/onboarding pending')`),true);
  const inspect=`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{const state=s.getSnapshot(),e=state.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)});return {payments:e.auditLifecycle.advancePayments.length,receipts:e.auditLifecycle.receiptDocuments.length,folders:state.folders.filter(f=>f.engagementId===e.id).length,onboarding:e.auditLifecycle.onboarding}})`;
  const failed=await tab.evaluate<any>(inspect);assert.equal(failed.payments,1);assert.equal(failed.receipts,0);
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.lifecycle.artifactWriter=window.__receiptWriter;Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Generate official receipt').click()})`);
  let completed:any;
  for(let n=0;n<100;n++){completed=await tab.evaluate<any>(inspect);if(completed.receipts===1)break;await sleep(100);}
  assert.equal(completed.payments,1);assert.equal(completed.receipts,1);assert.equal(completed.folders,5);assert.equal(completed.onboarding.requiresFirstLoginReset,true);
  assert.equal(await tab.evaluate<boolean>(`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const e=s.getSnapshot().engagements.find(e=>e.id===${JSON.stringify(result.engagementId)});const {loadVerifiedArtifact}=await import('/src/services/artifactStore.ts');return (await (await loadVerifiedArtifact(e.auditLifecycle.receiptDocuments[0].artifact)).text()).startsWith('%PDF-')})`),true);
}, {timeout:60000});
it(
  'executes the complete canonical command journey in Chrome with genuine artifacts and rendered checkpoints',
  async () => {
    const result = await tab.evaluate<any>(
      `import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney())`
    );
    assert.equal(result.checkpoints.length, 17);
    assert.equal(result.artifacts.length, 5);
    assert.ok(result.archive.artifacts.length > 5, 'archive includes workpapers, receipt, SRM and final documents');
    assert.equal(result.review.partner, true);
    assert.deepEqual(result.blockers, []);
    mkdirSync('docs/prototype/evidence', { recursive: true });
    const reportBytes = await tab.evaluate<string>(`import('/src/services/artifactStore.ts').then(async m => {const s = (await import('/src/store/prototypeStore.ts')).prototypeStore.getSnapshot();const a = s.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)}).auditLifecycle.deliverables[0].artifacts[0];const bytes = new Uint8Array(await (await m.loadVerifiedArtifact(a)).arrayBuffer());return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))})`);
    await saveEvidence('docs/prototype/evidence/review-final-report.pdf',Buffer.from(reportBytes,'base64'));
    const zipBytes = await tab.evaluate<string>(`import('/src/services/archivePackage.ts').then(async m => {const s=(await import('/src/store/prototypeStore.ts')).prototypeStore.getSnapshot();const bytes=new Uint8Array(await (await m.createInspectionZip(s,s.engagements.find(e=>e.id===${JSON.stringify(result.engagementId)}))).arrayBuffer());return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))})`);
    const zip = unzipSync(Buffer.from(zipBytes,'base64'));
    const inspection = JSON.parse(new TextDecoder().decode(zip['audit-file-manifest.json']));
    assert.equal(inspection.exportStatus,'Verified');
    assert.ok(Object.keys(zip).some(name=>name.endsWith('target-tb.csv')));
    assert.ok(Object.keys(zip).some(name=>name.endsWith('population.csv')));
    assert.ok(Object.keys(zip).length>10);
    writeFileSync(
      'docs/prototype/evidence/target-browser-journey.json',
      JSON.stringify(
        {
          mode: 'Chrome command-level lifecycle with rendered checkpoints; not a click-by-click user acceptance',
          ...result,
          review: {
            manager: result.review.manager,
            srm: result.review.srm,
            partner: result.review.partner
          }
        },
        null,
        2
      )
    );
    await tab.command('Page.reload');
    await sleep(700);
    assert.equal(
      await tab.evaluate<boolean>(
        `JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements[0].auditLifecycle.archiveControl.freezeStatus==='Frozen'`
      ),
      true
    );
    for (let attempt=0;attempt<100;attempt++) {
      if(await tab.evaluate<boolean>(`document.querySelector('main')?.textContent.includes('Firm expenses')`))break;
      await sleep(100);
    }
    assert.equal(await tab.evaluate<boolean>(`document.querySelector('main')?.textContent.includes('Firm expenses')`),true);
    assert.deepEqual(tab.exceptions, []);
    await tab.evaluate(
      `import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('records');location.hash='records'})`
    );
    await sleep(150);
    assert.equal(
      await tab.evaluate<boolean>(
        `document.querySelector('[data-testid=target-lifecycle-header]').textContent.includes('Generate the final balance invoice')`
      ),
      false
    );
    const capture = await tab.command('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    writeFileSync(
      'docs/prototype/evidence/target-frozen-archive.png',
      Buffer.from(capture.data, 'base64')
    );
    assert.deepEqual(tab.blockedExternalRequests, []);
  },
  { timeout: 60000 }
);
it(
  'renders the lifecycle overview, retired hash fallbacks and mobile layout without exposing client staff economics',
  async () => {
    await tab.evaluate(
      `import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('manager');location.hash='overview'})`
    );
    await sleep(150);
    assert.equal(
      await tab.evaluate<number>(
        `document.querySelectorAll('[aria-label="System lifecycle state machine"] > li').length`
      ),
      11
    );
    assert.equal(
      await tab.evaluate<boolean>(
        `[...document.querySelectorAll('[aria-label="System lifecycle state machine"] li')].some(li => {
          const badge = li.querySelector('span:nth-child(2)');
          return badge && badge.textContent.trim() === 'PENDING';
        })`
      ),
      false,
      'No card in the 11-state state machine may use the generic PENDING badge'
    );
    assert.equal(
      await tab.evaluate<number>(
        `[...document.querySelectorAll('[aria-label="System lifecycle state machine"] li span')].filter(s => s.textContent.trim() === 'ACTIVE').length`
      ),
      1,
      'Exactly one card must be ACTIVE'
    );
    assert.equal(
      await tab.evaluate<number>(
        `[...document.querySelectorAll('[aria-label="System lifecycle state machine"] li span')].filter(s => s.textContent.trim() === 'CLEARED').length`
      ),
      10,
      'Cards 1 to 10 must be CLEARED for frozen archive'
    );
    assert.equal(
      await tab.evaluate<number>(
        `[...document.querySelectorAll('[aria-label="System lifecycle state machine"] li span')].filter(s => s.textContent.trim() === 'NEXT').length`
      ),
      0,
      'Archived state must have 0 NEXT cards'
    );
    assert.equal(
      await tab.evaluate<boolean>(
        `document.querySelector('main').textContent.includes('Current Gate to Advance:') && document.querySelector('main').textContent.includes('Next State:') && document.querySelector('main').textContent.includes('Terminal')`
      ),
      true,
      'Header must display Current Gate to Advance and Next State: Terminal'
    );
    await tab.command('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(100);
    assert.equal(
      await tab.evaluate<boolean>('document.documentElement.scrollWidth<=innerWidth+1'),
      true
    );
    await tab.evaluate(`location.hash='quality'`);
    await sleep(150);
    assert.equal(await tab.evaluate<string>('location.hash'), '#overview', 'a retired hash falls back to the staff default instead of redirecting');
    await tab.evaluate(
      `import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('client_finance');location.hash='scheduling'})`
    );
    await sleep(150);
    assert.equal(await tab.evaluate<string>('location.hash'), '#portal');
    assert.equal(
      await tab.evaluate<boolean>(
        `/Manager conclusion|Charge-out|Summary Review Memorandum/.test(document.querySelector('main').textContent)`
      ),
      false
    );
    await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona('client-northstar'))`);
    await sleep(150);
    assert.equal(await tab.evaluate<boolean>(`/Synthetic Target Audit Ltd|Audit supporting evidence/.test(document.querySelector('main').textContent)`),false,'client without an engagement grant sees no foreign client records');
    assert.deepEqual(tab.exceptions, []);
  },
  { timeout: 10000 }
);
it('US-M3-002/003 analytical review form validates, saves and restores deliberate going concern assessment', async () => {
  await tab.evaluate(`import('/tests/helpers/targetJourney.ts').then(module => module.runTargetJourney({stopAtFieldwork:true}))`);
  await tab.evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('[AR Test]')).click()`);
  await sleep(100);
  await tab.evaluate(`Array.from(document.querySelectorAll('.modal-foot button')).find(button => button.textContent.includes('Sign Off')).click()`);
  await sleep(100);
  assert.match(await tab.evaluate<string>(`document.querySelector('.modal [role="alert"]')?.textContent || ''`), /analysis|ISA 570|conclusion/i);
  await tab.evaluate(`{
    const textareas=document.querySelectorAll('.modal textarea');
    const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    setter.call(textareas[0],'Revenue supported by current sales ledger and documented management inquiry. Prior-period source is unavailable.');textareas[0].dispatchEvent(new Event('input',{bubbles:true}));
    setter.call(textareas[1],'Twelve-month forecast and committed financing support going concern; sources: accepted TB and management forecast.');textareas[1].dispatchEvent(new Event('input',{bubbles:true}));
    for (const select of document.querySelectorAll('.modal select')) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'true');select.dispatchEvent(new Event('change',{bubbles:true})); }
  }`);
  await sleep(100);
  await tab.evaluate(`Array.from(document.querySelectorAll('.modal-foot button')).find(button => button.textContent.includes('Sign Off')).click()`);
  await sleep(150);
  assert.equal(await tab.evaluate<boolean>(`!document.querySelector('.modal #ar-conclusion')`), true);
  await tab.evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('[AR Test]')).click()`);
  await sleep(100);
  assert.match(await tab.evaluate<string>(`document.querySelector('#ar-conclusion').value`), /Twelve-month forecast/);
  assert.equal(await tab.evaluate<boolean>(`Array.from(document.querySelectorAll('.modal select')).every(select => select.value === 'true')`), true);
  await tab.evaluate(`document.querySelector('.modal .icon-btn').click()`);
}, {timeout: 30000});

it('checks US-UIUX-001 responsive scope and captures twelve required surfaces', async () => {
  await tab.evaluate(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney())`);
  const routes = ['overview','proposals','onboarding','audit-planning','financial-statements','audit-fieldwork','reviews','delivery','records','reports','portal','client-requirements'];
  const results: any[] = [];
  const folder = 'docs/prototype/evidence/visual-parity';
  mkdirSync(folder, { recursive: true });
  for (const width of [320,390,760,960,1000,1024,1440,1920]) {
    const height = width === 390 ? 844 : width === 1440 ? 900 : 1000;
    await tab.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const route of routes) {
      await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona(${JSON.stringify(route==='portal'?'client_finance':'superuser')});location.hash=${JSON.stringify(route)}})`);
      await sleep(120);
      const result = await tab.evaluate<any>(`({route:location.hash,width:innerWidth,documentWidth:document.documentElement.scrollWidth, main:!!document.querySelector('main'), personaVisible:!!document.querySelector('#role-select')?.getClientRects().length, hiddenSearch:!document.querySelector('.search-trigger')?.getClientRects().length, font:getComputedStyle(document.body).fontFamily, text:getComputedStyle(document.body).color, topbar:getComputedStyle(document.querySelector('.topbar')).backgroundColor, title:document.querySelector('main h1,main h2')?.textContent, overflow:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='fixed').slice(0,8).map(e=>e.tagName+'.'+e.className)})`);
      assert.equal(await tab.evaluate<boolean>(`!!document.querySelector('[role=alertdialog]')`), false, 'navigation must not silently stall at an unsaved dialog');
      assert.equal(result.route, `#${route}`, 'the requested surface must be active');
      results.push(result);
      assert.ok(result.main && result.title, `${route} renders at ${width}`);
      assert.ok(result.documentWidth <= width + 1, `${route} at ${width}: ${JSON.stringify(result)}`);
      if (width >= 960) assert.equal(await tab.evaluate<boolean>(`document.querySelector('.sidebar').getBoundingClientRect().right <= document.querySelector('.shell').getBoundingClientRect().left + 1`),true,`sidebar must not overlap ${route} at ${width}`);
      assert.equal(result.personaVisible,true,'the four-persona selector remains visible in the normal experience');
      assert.equal(result.hiddenSearch,true,'normal experience hides global search utility');
      if ([390,1440].includes(width)) {
        await tab.evaluate('window.scrollTo(0,0)');
        const screenshot = await tab.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        await saveEvidence(`${folder}/${route}-${width}.png`,Buffer.from(screenshot.data,'base64'));
      }
    }
  }
  await saveEvidence(`${folder}/responsive-results.json`,JSON.stringify(results,null,2));
  assert.deepEqual(tab.exceptions,[]);
}, { timeout: 120000 });

it('offers native workflow templates with working downloads and keeps source examples off the client portal', async () => {
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('superuser');location.hash='confirmations'})`);
  await sleep(150);
  assert.equal(await tab.evaluate<number>(`document.querySelectorAll('[data-testid=project-templates] a[download]').length`), 4);
  await tab.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await tab.evaluate(`document.querySelector('[data-testid=project-templates]').open=true`);
  await tab.evaluate(`document.querySelector('[data-testid=project-templates]')?.scrollIntoView({block:'center'})`);
  await sleep(100);
  assert.equal(await tab.evaluate<boolean>(`document.documentElement.scrollWidth<=innerWidth+1`), true, 'expanded native template panel fits mobile');
  const templateCapture = await tab.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync('docs/prototype/evidence/visual-parity/confirmation-templates-390.png', Buffer.from(templateCapture.data, 'base64'));
  await tab.evaluate(`document.querySelector('[data-testid=project-templates]').open=true; const search=document.querySelector('[data-testid=project-templates] input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(search,'Bank');search.dispatchEvent(new Event('input',{bubbles:true}));`);
  await sleep(100);
  assert.equal(await tab.evaluate<number>(`document.querySelectorAll('[data-testid=project-templates] a[download]').length`), 1);
  for (const template of PROJECT_TEMPLATES) {
    const response = await fetch(`${origin}${templateUrl(template)}`);
    assert.equal(response.status, 200, template.file);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(`public/templates/${template.file}`), `${template.file}: download must preserve original Office bytes`);
  }
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('client_finance');location.hash='portal'})`);
  await sleep(150);
  assert.equal(await tab.evaluate<boolean>(`!!document.querySelector('[data-testid=project-templates]')`), false);
  assert.deepEqual(tab.exceptions, []);
}, { timeout: 10000 });

it('cloud workspace control structure stays honest for the /api cutover', async () => {
  // The presenter panel keeps its synthetic-data disclosure and never names the retired
  // snapshot Worker; cloud resume is exercised at API level in tests/cloud/api.test.ts.
  await tab.evaluate("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('superuser');location.hash='proposals'})");await sleep(150);
  await tab.evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent==='Presenter / Demo Controls').click()");await sleep(200);
  const panel = await tab.evaluate<string>("document.querySelector('[data-testid=cloud-demo-controls]')?.textContent ?? ''");
  assert.ok(panel.includes('Synthetic data only'), 'synthetic honesty retained');
  assert.ok(panel.includes('access code'), 'resume-by-access-code flow retained');
  assert.ok(!panel.includes('Bearer'), 'no Bearer-token session flow');
});

it('B5 visible internal AJE authoring retains evidenced management response and TB reflection without client approval UI', async () => {
  await tab.evaluate(`import('/tests/helpers/targetJourney.ts').then(m=>m.runTargetJourney({stopAtFieldwork:true}))`);
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('preparer');location.hash='findings'})`);
  await sleep(150);
  const fill = async (heading: string, fields: Record<string,string>) => {
    await tab.evaluate(`{
      const form=[...document.querySelectorAll('[data-testid="adjustment-panel"] form')].find(f=>f.querySelector('h3').textContent.startsWith(${JSON.stringify(heading)}));
      if(!form) throw Error('Visible AJE form missing: '+${JSON.stringify(heading)});
      for(const [name,value] of Object.entries(${JSON.stringify(fields)})){const input=form.elements.namedItem(name);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
      form.requestSubmit();
    }`);
    await sleep(180);
  };
  const accounts=await tab.evaluate<string[]>(`[...document.querySelectorAll('[data-testid="adjustment-panel"] select[name="debit"] option')].map(o=>o.value)`);
  await fill('Propose balanced AJE',{title:'Browser verified AJE',debit:accounts[0],credit:accounts[1],amount:'10',rationale:'Current ledger and invoice support this balanced reclassification.'});
  const status = () => tab.evaluate<string>(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().adjustmentJournals.find(j=>j.title==='Browser verified AJE')?.status || '')`);
  assert.equal(await status(),'Draft');
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona('manager'))`);await sleep(150);
  await fill('Independent review',{decision:'approve',note:'Independent review of ledger and invoice completed.'});assert.equal(await status(),'Technical review');
  await fill('Management response',{decision:'accept',note:'Management accepts the supported correction.',respondent:'Synthetic Finance Executive',reference:'CORRESPONDENCE-AJE-001'});assert.equal(await status(),'Management accepted');
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('client_finance');location.hash='portal'})`);await sleep(150);
  assert.equal(await tab.evaluate<boolean>(`!!document.querySelector('[data-testid="adjustment-panel"]')`),false);
  assert.equal(await tab.evaluate<boolean>(`/Adjusting journals|Propose balanced AJE|Management decision|Accept correction|Reject correction/.test(document.body.innerText)`),false);
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('manager');location.hash='findings'})`);await sleep(150);
  await fill('Current TB reflection',{reflection:'reflected',evidence:'Client revised ledger and current TB reviewed.'});assert.equal(await status(),'Reporting included');
  assert.deepEqual(tab.exceptions,[]);
},{timeout:30000});

it('F22 renders all detailed notes equally in React and the standalone presentation', async () => {
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('superuser');location.hash='client-requirements'})`);await sleep(150);
  await tab.evaluate(`document.querySelector('button[title="Toggle CPA Discussion Notes (N)"]').click()`);await sleep(80);
  for(let i=0;i<DECK_SLIDES.length;i++) {
    const slide=DECK_SLIDES[i];
    const text=await tab.evaluate<string>(`document.querySelector('aside[role="dialog"]').textContent`);
    assert.ok(text.includes(slide.title),slide.id+' title');
    assert.ok(text.includes(slide.note || ''),slide.id+' detailed notes');
    if(i<DECK_SLIDES.length-1){await tab.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Next →').click()`);await sleep(80);}
  }
  await tab.command('Page.navigate',{url:origin+'/Client_Requirements.html'});await sleep(250);
  assert.equal(await tab.evaluate<number>(`document.querySelectorAll('main section').length`),17);
  for(const slide of DECK_SLIDES) assert.equal(await tab.evaluate<boolean>(`document.getElementById(${JSON.stringify(slide.id)}).textContent.includes(${JSON.stringify(slide.note)})`),true,slide.id+' standalone detail');
  await tab.command('Page.navigate',{url:origin+'/#overview'});await sleep(300);
  assert.deepEqual(tab.exceptions,[]);
},{timeout:15000});

it('final alignment preserves mobile keyboard containment, route focus and modal focus restoration', async()=>{
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{s.setPersona('manager');location.hash='engagements'})`);
  await sleep(200);
  await tab.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  const key=async(key:string,code:string,vk:number,modifiers=0)=>{await tab.command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,modifiers});await tab.command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,modifiers});};
  let mobileNavigationBefore = { triggerVisible: false, expanded: null as string | null };
  const mobileNavigationDeadline = Date.now() + 5000;
  while (Date.now() < mobileNavigationDeadline) {
    mobileNavigationBefore = await tab.evaluate<{ triggerVisible: boolean; expanded: string | null }>(`(() => {
    const trigger = document.querySelector('[aria-label="Open navigation"]');
    return { triggerVisible: Boolean(trigger?.getClientRects().length), expanded: trigger?.getAttribute('aria-expanded') ?? null };
  })()`);
    if (mobileNavigationBefore.triggerVisible && mobileNavigationBefore.expanded === 'false') break;
    await sleep(25);
  }
  assert.equal(mobileNavigationBefore.triggerVisible, true, 'mobile navigation trigger is visible before opening');
  assert.equal(mobileNavigationBefore.expanded, 'false', 'the drawer starts closed');
  await tab.evaluate(`document.querySelector('[aria-label="Open navigation"]').click()`);
  let mobileNavigationAfter = { open: false, focusWithin: false };
  for (let attempt = 0; attempt < 40; attempt++) {
    mobileNavigationAfter = await tab.evaluate(`({open:document.querySelector('[aria-label="Close navigation"]')?.getAttribute('aria-expanded')==='true',focusWithin:document.querySelector('#primary-sidebar')?.contains(document.activeElement) ?? false})`);
    if (mobileNavigationAfter.open && mobileNavigationAfter.focusWithin) break;
    await sleep(25);
  }
  assert.equal(mobileNavigationAfter.open, true, 'the menu action opens the mobile drawer');
  assert.equal(mobileNavigationAfter.focusWithin, true, 'opening the drawer moves focus into its navigation');
  const targets=`Array.from(document.querySelector('#primary-sidebar').querySelectorAll('a[href],button:not([disabled]),select:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(e=>e.getClientRects().length>0&&!e.closest('[hidden],[inert]'))`;
  await tab.evaluate(`${targets}.at(-1).focus()`); await key('Tab','Tab',9);
  assert.equal(await tab.evaluate<boolean>(`document.activeElement===${targets}[0]`),true,await tab.evaluate<string>(`JSON.stringify({active:document.activeElement.outerHTML,first:${targets}[0].outerHTML,last:${targets}.at(-1).outerHTML})`));
  await key('Tab','Tab',9,8);
  assert.equal(await tab.evaluate<boolean>(`document.activeElement===${targets}.at(-1)`),true);
  await key('Escape','Escape',27); await sleep(100);
  assert.equal(await tab.evaluate<boolean>(`document.activeElement===document.querySelector('[aria-label="Open navigation"]')`),true);
  await tab.evaluate(`location.hash='overview'`); await sleep(150);
  assert.equal(await tab.evaluate<string>('document.activeElement.id'),'main');
  await tab.command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await tab.evaluate(`location.hash='engagements'`); await sleep(150);
  await tab.evaluate(`const trigger=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='New Engagement');trigger.focus();trigger.click()`); await sleep(150);
  assert.equal(await tab.evaluate<boolean>(`document.querySelector('.modal').contains(document.activeElement)`),true);
  await key('Escape','Escape',27); await sleep(150);
  assert.equal(await tab.evaluate<boolean>(`!document.querySelector('.modal') && document.activeElement.textContent.trim()==='New Engagement'`),true);
  assert.deepEqual(tab.exceptions,[]);
});

it('US-SYS-001 keeps exactly four self-selected personas visible and persistent at desktop and mobile sizes', async () => {
  await tab.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await tab.evaluate(`location.hash='overview'`);
  await sleep(180);
  const desktop = await tab.evaluate<{ options: string[]; visible: boolean; warning: string; width: number }>(`(() => {
    const select = document.querySelector('#role-select');
    const notice = document.querySelector('.persona-trust-notice');
    return {
      options: Array.from(select?.options ?? []).map(option => option.value),
      visible: Boolean(select?.getClientRects().length),
      warning: notice?.innerText ?? '',
      width: innerWidth
    };
  })()`);
  assert.deepEqual(desktop.options, ['PREPARER', 'REVIEWER', 'APPROVER', 'CLIENT']);
  assert.equal(desktop.visible, true);
  assert.match(desktop.warning, /trusted environment/i);
  assert.match(desktop.warning, /do not verify identity/i);
  assert.equal(desktop.width, 1440);

  await tab.evaluate(`(() => {
    const select = document.querySelector('#role-select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'PREPARER');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await tab.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2') ?? '{}').currentRole ?? ''`) === 'preparer') break;
    await sleep(50);
  }
  assert.equal(await tab.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2') ?? '{}').currentRole ?? ''`), 'preparer');
  await tab.command('Page.reload');
  const reloadDeadline = Date.now() + 15000;
  let reloadedPersona = '';
  while (Date.now() < reloadDeadline) {
    reloadedPersona = await tab.evaluate<string>(`document.readyState === 'complete' && document.querySelector('#role-select')?.value === 'PREPARER' && JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2') ?? '{}').currentRole === 'preparer' ? 'PREPARER' : ''`);
    if (reloadedPersona === 'PREPARER') break;
    await sleep(100);
  }
  assert.equal(reloadedPersona, 'PREPARER', 'the hydrated persona selector and persisted preference agree after reload');
  await tab.evaluate('window.scrollTo(0, 0)');
  await sleep(80);
  const desktopScreenshot = await tab.command('Page.captureScreenshot', { format: 'png' });

  await tab.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await tab.evaluate('window.scrollTo(0, 0)');
  const mobileReadyDeadline = Date.now() + 5000;
  let mobileReady = false;
  while (Date.now() < mobileReadyDeadline) {
    mobileReady = await tab.evaluate<boolean>(`Boolean(document.querySelector('#role-select')?.getClientRects().length && document.querySelector('.persona-trust-notice')?.getClientRects().length)`);
    if (mobileReady) break;
    await sleep(50);
  }
  const mobile = await tab.evaluate<{ visible: boolean; noticeVisible: boolean; warningTop: number; warningBottom: number; selectorRight: number; pageWidth: number }>(`(() => {
    const select = document.querySelector('#role-select');
    const notice = document.querySelector('.persona-trust-notice');
    const warningRect = notice?.getBoundingClientRect();
    return {
      visible: Boolean(select?.getClientRects().length),
      noticeVisible: Boolean(warningRect && warningRect.top >= 0 && warningRect.bottom <= innerHeight),
      warningTop: warningRect?.top ?? Number.NEGATIVE_INFINITY,
      warningBottom: warningRect?.bottom ?? Number.POSITIVE_INFINITY,
      selectorRight: select?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
      pageWidth: document.documentElement.scrollWidth
    };
  })()`);
  assert.equal(mobile.visible, true, JSON.stringify({ mobileReady, ...mobile }));
  assert.equal(mobile.noticeVisible, true);
  assert.ok(mobile.warningTop >= 0 && mobile.warningBottom <= 844, 'trust notice is inside the captured mobile viewport');
  assert.ok(mobile.selectorRight <= 390, `persona selector is inside the 390px viewport: ${mobile.selectorRight}`);
  assert.ok(mobile.pageWidth <= 390, `document does not overflow the 390px viewport: ${mobile.pageWidth}`);
  const mobileScreenshot = await tab.command('Page.captureScreenshot', { format: 'png' });

  const evidenceDir = 'docs/prototype/evidence/real-implementation';
  mkdirSync(evidenceDir, { recursive: true });
  await saveEvidence(`${evidenceDir}/persona-1440x900.png`, Buffer.from(desktopScreenshot.data, 'base64'));
  await saveEvidence(`${evidenceDir}/persona-390x844.png`, Buffer.from(mobileScreenshot.data, 'base64'));
  await saveEvidence(`${evidenceDir}/persona-selector.json`, JSON.stringify({ story: 'US-SYS-001', status: 'PASS', desktop, mobile }, null, 2));
  await tab.command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
});
