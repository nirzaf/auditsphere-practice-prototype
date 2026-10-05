import assert from 'node:assert/strict';
import type { CdpTab } from './cdp';

/** Business transitions use rendered controls. Reset and simulated identity grants are harness setup. */
export async function runVisibleAlignmentJourney(tab: CdpTab) {
  const pause = (ms = 80) => new Promise(r => setTimeout(r, ms));
  const wait = async (expression: string) => {
    for (let i = 0; i < 100; i++) { if (await tab.evaluate<boolean>(expression)) return; await pause(); }
    throw Error(`Visible journey timed out: ${expression}\n${await tab.evaluate<string>('document.body.innerText')}`);
  };
  const button = async (text: string, scope = 'document') => {
    await wait(`Array.from(${scope}.querySelectorAll('button')).some(b => b.textContent.trim().replace(/\s*\(\d+\)$/,'')===${JSON.stringify(text)} && !b.matches(':disabled'))`);
    await tab.evaluate(`Array.from(${scope}.querySelectorAll('button')).find(b => b.textContent.trim().replace(/\s*\(\d+\)$/,'')===${JSON.stringify(text)} && !b.matches(':disabled')).click()`); await pause();
  };
  const fill = async (selector: string, value: string) => {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    await tab.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e.matches(':disabled'))throw Error('Disabled input');const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); await pause();
  };
  const label = async (text: string, value: string, scope = 'document') => {
    const selector = await tab.evaluate<string>(`(()=>{const label=Array.from(${scope}.querySelectorAll('label')).find(l=>l.childNodes[0]?.textContent.trim()===${JSON.stringify(text)} || l.textContent.trim()===${JSON.stringify(text)});if(!label)throw Error('Missing label: '+${JSON.stringify(text)});const e=label.querySelector('input,select,textarea') || label.nextElementSibling;if(!e?.matches('input,select,textarea'))throw Error('Missing label control');e.dataset.visibleTestControl='active';return '[data-visible-test-control="active"]'})()`);
    await fill(selector, value); await tab.evaluate(`document.querySelector(${JSON.stringify(selector)})?.removeAttribute('data-visible-test-control')`);
  };
  const route = async (id: string, expected: string) => {
    await tab.evaluate(`location.hash=${JSON.stringify(id)}`);
    await wait(`location.hash===${JSON.stringify('#' + id)} && document.querySelector('main')?.innerText.includes(${JSON.stringify(expected.replaceAll('_',' '))})`);
  };
  const actor = async (id: string) => {
    // The supported UI selector exposes four workflow personas. Distinct seeded
    // actors used to exercise legacy internal duties are harness setup; business
    // transitions below still go through visible forms and guarded commands.
    await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.setPersona(${JSON.stringify(id)}))`);
    await pause();
  };
  const submit = async (selector: string) => {
    const invalid = await tab.evaluate<string[]>(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});return Array.from(f.querySelectorAll(':invalid')).map(e=>e.name||e.getAttribute('aria-label')||e.outerHTML)})()`);
    assert.deepEqual(invalid, [], 'all visible form requirements filled');
    await tab.evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`); await pause(180);
  };
  const upload = async (selector: string, name: string, content: string, type = 'text/csv') => {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    await tab.evaluate(`(()=>{const d=new DataTransfer();d.items.add(new File([${JSON.stringify(content)}],${JSON.stringify(name)},{type:${JSON.stringify(type)}}));const e=document.querySelector(${JSON.stringify(selector)});e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`); await pause(150);
  };
  const inspect = <T>(expression: string) => tab.evaluate<T>(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>{const state=s.getSnapshot(),e=state.engagements.find(e=>e.id===state.selectedEngagement);return ${expression}})`);
  const form = async (title: string) => {
    await tab.evaluate(`document.querySelectorAll('[data-visible-test-form]').forEach(f=>f.removeAttribute('data-visible-test-form'))`);
    await wait(`Array.from(document.querySelectorAll('form')).some(f=>f.querySelector('h3')?.textContent.startsWith(${JSON.stringify(title)}))`);
    await tab.evaluate(`Array.from(document.querySelectorAll('form')).find(f=>f.querySelector('h3')?.textContent.startsWith(${JSON.stringify(title)})).dataset.visibleTestForm='active'`);
    return '[data-visible-test-form="active"]';
  };
  const row = (id: string) => `Array.from(document.querySelectorAll('tr')).find(r=>r.innerText.includes(${JSON.stringify(id)}))`;
  const checkpoints: string[] = [];
  const state = async (expected: string) => {
    await route('overview', 'Current Gate to Advance');
    const display = await tab.evaluate<string>(`import('/src/services/targetLifecycle.ts').then(m=>m.SYSTEM_LIFECYCLE_STATES.find(s=>s.state===${JSON.stringify(expected)}).label)`);
    await wait(`document.querySelector('main')?.innerText.includes('Active State:') && document.querySelector('main')?.innerText.includes(${JSON.stringify(display)})`);
    assert.equal(await tab.evaluate<string>(`import('/src/store/prototypeStore.ts').then(async({prototypeStore:s})=>{const state=s.getSnapshot(),e=state.engagements.find(e=>e.id===state.selectedEngagement);return (await import('/src/services/targetLifecycle.ts')).computeSystemState(state,e).state})`), expected);
    checkpoints.push(expected); console.log('Visible checkpoint:',expected);
  };
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.loadScenario('target-lifecycle'))`);
  await actor('relationship');
  await route('acquisition', 'New Inquiry'); await button('New Inquiry');
  await label('Prospective Client Name', 'Visible Alignment Audit Ltd');
  await label('Primary Contact', 'Visible Executive');
  await label('Estimated Fee (QAR)', '1000'); await button('Register Inquiry');
  assert.equal(await inspect<number>('state.leads.length'), 1);
  checkpoints.push('LEAD_INGESTION — inquiry registered through visible form');
  await tab.evaluate(`Array.from(document.querySelectorAll('.lead-card')).find(c=>c.innerText.includes('Visible Alignment')).click()`); await pause();
  await label('Update stage', 'Won'); await button('Convert Won Opportunity to Prospect');
  await route('client-detail', 'Contacts'); await button('Contacts');
  for (const [name, title, role] of [['Visible Executive','Managing Director','MD/GM'],['Visible Finance','Chief Financial Officer','CFO/Finance Director'],['Rami Nasser','Chief Accountant','Chief Accountant/Audit Liaison']]) {
    await button('Add Contact'); await label('Full Name', name); await label('Job Title', title);
    await label('Email Address', `${role==='MD/GM'?'executive':role==='CFO/Finance Director'?'finance':'liaison'}@example.demo`);
    await fill('[aria-label="Communication Routing Role"]', role); await button('Save Contact');
  }
  await route('proposals', 'New Proposal'); await button('New Proposal');
  await label('Reusable proposal template', await inspect<string>('state.proposalTemplates[0].id'));
  await label('Title', 'Visible alignment statutory audit');
  await label('Deliverables timeline','Draft and final reports after completion of the agreed evidence and review gates.');
  const ids = await inspect<{ lead: string; client: string; manager: string; partner: string }>(`({lead:state.leads[0].id,client:state.clients[0].id,manager:state.users.find(u=>u.id==='manager').name,partner:state.users.find(u=>u.id==='partner').name})`);
  await label('Opportunity (optional)', ids.lead); await label('Client (optional when an opportunity is not yet converted)', ids.client);
  await label('Fixed fee', '1000'); await button('Create Draft');
  await wait("import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().proposals.length===1)");
  const proposalId = await inspect<string>('state.proposals[0].id');
  await wait(`document.querySelector('main').innerText.includes('Visible alignment statutory audit')`);
  checkpoints.push('PROPOSAL_GENERATION — draft created through visible form');
  await actor('partner'); await route('proposals', 'Visible alignment statutory audit'); await button('Review');
  await label('Review Comments / Notes', 'Independent Partner verified scope, current service, reporting period and fee.'); await button('Record Review Decision');
  await actor('relationship'); await route('proposals', 'Visible alignment statutory audit'); await button('Dispatch by Email (simulated)');
  await button('Record Client Response'); await label('Active Client Contact', 'Visible Executive');
  await label('Response notes', 'Executive accepted the current dispatched statutory audit scope and fee.');
  await label('Document or communication evidence reference', 'VISIBLE-CLIENT-ACCEPTANCE'); await button('Record Response');
  await actor('manager'); await route('engagements', 'New Engagement'); await button('New Engagement');
  await label('Accepted proposal (optional)', proposalId); await label('Engagement Manager', ids.manager); await label('Signing Partner', ids.partner); await button('Create Engagement');
  const engagementId = await inspect<string>('state.selectedEngagement'); assert.ok(engagementId);
  await route('billing', 'Pin accepted'); await submit('[data-target-form="pin-proposal"]'); await state('DUAL_KEY_PENDING');
  await route('onboarding', 'Compliance Recommendation');
  await tab.evaluate(`document.querySelectorAll('main input[type="checkbox"]').forEach(e=>{if(!e.checked)e.click()})`); await pause();
  for(const ref of ['independence','AML/KYC','conflicts','prohibitions','competence','management integrity','financial viability']) {
    const selector = await tab.evaluate<string>(`(()=>{const e=Array.from(document.querySelectorAll('main input[aria-label]')).find(e=>e.getAttribute('aria-label').toLowerCase().includes(${JSON.stringify('evidence reference for '+ref.toLowerCase())}));if(!e)throw Error('Screening ref '+${JSON.stringify(ref)});return '[aria-label="'+e.getAttribute('aria-label')+'"]'})()`);
    await fill(selector, 'VISIBLE-SCREENING-'+ref);
  }
  await fill('[aria-label="Compliance recommendation summary"]','All current screening checks independently evidenced; recommend acceptance.'); await button('Save Recommendation');
  await actor('partner'); await route('onboarding', 'Final Decision Status'); await fill('[aria-label="Final decision status"]','Accepted');
  await fill('[aria-label="Partner acceptance rationale"]','Independent Partner accepts this low-risk statutory audit based on complete screening evidence.'); await button('Record Partner Decision');
  await state('ADVANCE_BILLING'); await route('engagements', 'Engagement Letter'); await button('Engagement Letter (ISA 210 / ISRS 4400)');
  await label('Signing Partner Name & Title', ids.partner); await button('Generate & Compile Engagement Letter');
  await fill('input[placeholder^="Countersigned EL Evidence"]','VISIBLE-SIGNED-EL'); await button('Record Signed Copy'); await button('Close', 'document.querySelector(".modal")');
  await actor('billing'); await route('billing', 'Record advance manually');
  await fill('[data-target-form="advance"] [name="reference"]','VISIBLE-ADVANCE'); await submit('[data-target-form="advance"]');
  await wait(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().engagements[0].auditLifecycle.receiptDocuments.length===1)`);
  await state('PORTAL_ACTIVE_PLANNING');
  assert.equal(await inspect<number>('state.invoices.length'),1); assert.equal(await inspect<number>('state.folders.length'),5);
  await actor('manager'); await route('documents', '5-Folder'); await button('Verify Workspace Access');
  await route('scheduling', 'staffing');
  const staffingRowKeys = await tab.evaluate<string[]>(`Array.from(document.querySelectorAll('[data-target-form="staffing"] fieldset.target-staff-row')).map(f => f.querySelector('input[name^="capacity-"]').name.slice('capacity-'.length))`);
  for(const key of staffingRowKeys) {
    await fill(`[data-target-form="staffing"] [name="capacity-${key}"]`,'80');
    await fill(`[data-target-form="staffing"] [name="start-${key}"]`, '2026-10-01');
    await fill(`[data-target-form="staffing"] [name="end-${key}"]`, '2026-10-15');
  }
  await fill('[data-target-form="staffing"] [name="reason"]','Initial visible four-role team allocation and recorded charge-out rates.'); await submit('[data-target-form="staffing"]');
  assert.equal(await inspect<number>('e.auditLifecycle.staffing.at(-1).allocations.length'),4);
  await actor('preparer'); await route('trial-balance', 'Trial balance source ingestion');
  await upload('[aria-label="Trial balance source file"]','visible-tb.csv','code,name,balance\n1000,Cash,1500\n3000,Capital,-1000\n4000,Revenue,-1000\n5000,Operating expense,500');
  await label('Signed amount column','2'); await button('Preview & validate'); await button('Commit as new source revision');
  await wait(`!!document.querySelector('[data-target-form="mapping"]')`); await submit('[data-target-form="mapping"]');
  await route('audit-planning','Materiality Strategy'); await button('Use current TB benchmark');
  await fill('[aria-label="Applied benchmark rate percentage"]','2'); await fill('[aria-label="Performance materiality rate percentage"]','75');
  await fill('[aria-label="Clearly trivial threshold percentage"]','5'); await fill('[aria-label="Planning strategy memo and scope rationale"]','Revenue is appropriate for this statutory audit; thresholds deliberately selected from current TB.');
  await button('Team & Section Allocations'); await button('Add allocation');
  await fill('[aria-label="Team member name 1"]','Adam Khan'); await fill('[aria-label="Team member role 1"]','Preparer'); await fill('[aria-label="Team member start 1"]','2026-10-01'); await fill('[aria-label="Team member end 1"]','2026-10-15');
  await button('Save Version 1');
  assert.equal(await inspect<number>('state.auditPlans.length'),1,await tab.evaluate<string>('document.querySelector("main").innerText')); await actor('partner'); await route('audit-planning','Audit Planning'); await button('Plan Versions & Review (v1)');
  await fill('[aria-label="Review notes and sign-off basis"]','Assigned Partner independently checked current TB-derived materiality and audit strategy.'); await button('Lead Partner Sign-off (Approve Plan Strategy)');
  await state('FIELDWORK_EXECUTION');
  // The prototype has no real identity provider: provision only the test client's scoped grant.
  await actor('admin');
  await tab.evaluate(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.grantAccess('client_finance','client_finance','Engagement',${JSON.stringify(engagementId)},'Synthetic identity fixture for visible PBC upload',{requestRef:'VISIBLE-PBC-IDENTITY'}))`);
  await actor('manager'); await route('documents','Issue Client Document');
  await fill('[data-target-form="pbc-create"] [name="title"]','Visible digital audit evidence');
  await fill('[data-target-form="pbc-create"] [name="description"]','Provide current cash, revenue, expense and going concern support for the selected reporting period.');
  await fill('[data-target-form="pbc-create"] [name="recipient"]','Rami Nasser'); await submit('[data-target-form="pbc-create"]');
  await actor('client_finance'); await route('portal','Client Information');
  await fill('input[placeholder="Min 8 characters"]','Synthetic-password-2026'); await button('Reset Password & Unlock Uploads');
  await wait(`!document.querySelector('input[placeholder="Min 8 characters"]')`);
  await upload('input[name="file"]','visible-audit-evidence.txt','Synthetic cash, revenue, expense and going concern corroboration for the current audit.','text/plain');
  await submit(await form('Upload Evidence for:'));
  await wait(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().documents.length===1)`);
  assert.equal(await tab.evaluate<boolean>(`/Adjusting journals|Propose balanced AJE|Management decision|Internal SRM|Charge-out/.test(document.querySelector('main').innerText)`),false);
  await actor('manager'); await route('documents','Visible digital audit evidence'); await button('✓ Approve Uploaded Evidence');
  let replyForm=await form('Reply to: Visible digital');
  await fill(`${replyForm} [name="message"]`,'Staff reply with the requested reconciliation example.');
  await upload(`${replyForm} [name="attachment"]`,'staff-example.csv','account,amount\nCash,1500'); await submit(replyForm);
  await actor('client_finance'); await route('portal','Staff reply with the requested reconciliation example.');
  assert.equal(await tab.evaluate<boolean>(`document.querySelector('main').innerText.includes('staff-example.csv')`),true);
  replyForm=await form('Reply to: Visible digital'); await fill(`${replyForm} [name="message"]`,'Client confirms receipt of the reconciliation example.'); await submit(replyForm);
  await tab.evaluate(`window.__pbcURL=URL.createObjectURL;URL.createObjectURL=function(blob){window.__pbcDownload=blob;return window.__pbcURL.call(URL,blob)};Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Download staff-example.csv').click()`);
  await wait(`!!window.__pbcDownload?.size`);
  assert.equal(await tab.evaluate<string>(`window.__pbcDownload.text()`),'account,amount\nCash,1500');
  await tab.evaluate(`URL.createObjectURL=window.__pbcURL`);
  await actor('manager'); await route('documents','Client confirms receipt of the reconciliation example.');
  const documentId = await inspect<string>('state.documents[0].id');
  await route('audit-fieldwork','Prepare standard audit programs'); await button('Prepare standard audit programs');
  const programs = await inspect<Array<{id:string;title:string;area:string;procedures:Array<{id:string}>}>>('state.auditPrograms');
  assert.ok(programs.length>=6);
  // R04: one substantive program per mapped FSLI plus Analytical Review and Going Concern.
  for(const area of ['Analytical Review','Going Concern'])assert.ok(programs.some(p=>p.area===area),area);
  const mappedFslis = await inspect<string[]>('[...new Set(e.rows.map(r=>r.mappedStatementLine).filter(Boolean))]');
  for(const line of mappedFslis) assert.ok(programs.some(p=>p.area===line && p.procedures.length===5),`FSLI program ${line}`);
  await actor('manager'); await route('financial-statements','Split Financial Statement'); await button('Generate current P&L / BS snapshot');
  await button('[AR Test]', row('Revenue'));
  await label('Auditor Analysis & Investigation Notes:','Current revenue corroborated with management enquiries and current-period evidence.');
  for(const key of ['operatingCashFlows','debtCovenantsCompliant','workingCapitalAdequate','noMaterialDisruptions']) await fill(`[aria-label="${key}"]`,'true');
  await fill('#ar-conclusion','Current cash flow forecasts, financing and working capital evidence support twelve months of continued operations.'); await button('Sign Off Analytical Review Procedure');
  await button('[Audit Workprogram]',row('Revenue'));
  await wait(`document.querySelector('main').innerText.includes('substantive procedures defined')`);
  const evidenceId = await inspect<string>('state.evidenceCatalogue[0].id');
  await route('evidence','Registered Audit Evidence');
  for(const program of programs) for(const procedure of program.procedures) {
    await fill(`[aria-label="Procedure to link ${evidenceId}"]`,procedure.id); await button('Link',row(evidenceId));
  }
  console.log('Visible checkpoint: digital evidence linked to all procedures');
  await route('audit-fieldwork','Audit Program Areas');
  for(const program of programs) {
    await button(program.title);
    for(const procedure of program.procedures) {
      await button('Record fieldwork',row(procedure.id));
      await fill(`[aria-label="Work performed for ${procedure.id}"]`,'Performed current substantive tests against the accepted corroborating evidence.');
      await fill(`[aria-label="Conclusion for ${procedure.id}"]`,'No exceptions; current evidence supports this procedure conclusion.'); await button('Save fieldwork',row(procedure.id));
      assert.ok(await inspect<boolean>(`state.auditPrograms.flatMap(p=>p.procedures).find(p=>p.id===${JSON.stringify(procedure.id)}).workPerformed?.includes('Performed current')`),await tab.evaluate<string>('document.querySelector("main").innerText'));
      await tab.evaluate(`document.querySelectorAll('[data-visible-test-control]').forEach(e=>e.removeAttribute('data-visible-test-control'));${row(procedure.id)}.querySelector('select').dataset.visibleTestControl='status'`);
      await fill('[data-visible-test-control="status"]','Submitted');
    }
  }
  await actor('partner'); await route('audit-fieldwork','Audit Program Areas');
  for(const program of programs) {
    await button(program.title);
    for(const procedure of program.procedures) {
      await tab.evaluate(`document.querySelectorAll('[data-visible-test-control]').forEach(e=>e.removeAttribute('data-visible-test-control'));${row(procedure.id)}.querySelector('select').dataset.visibleTestControl='status'`);
      await fill('[data-visible-test-control="status"]','Cleared');
    }
  }
  console.log('Visible checkpoint: independent fieldwork clearance');
  assert.equal(await inspect<boolean>(`state.auditPrograms.every(p=>p.procedures.every(p=>p.status==='Cleared'))`),true);
  await actor('preparer'); await route('sampling','Import a complete sampling population');
  await upload('input[name="source"]','visible-population.csv','itemRef,date,counterparty,amount\nCASH-1,2026-09-01,Demo customer,500\nCASH-2,2026-09-01,Demo customer,500\nCASH-3,2026-09-01,Demo customer,500');
  await submit(await form('Import a complete')); await wait(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().samplePopulations.length===1)`);
  let selectedForm=await form('Generate sample:'); await fill(`${selectedForm} [name="method"]`,'Systematic Random Sampling'); await fill(`${selectedForm} [name="count"]`,'2');
  await fill(`${selectedForm} [name="samplingBasis"]`,'Cash existence is tested by a reproducible systematic selection over the complete reconciled population.');
  await fill(`${selectedForm} [name="sizeDetermination"]`,'Two items recorded as a documented professional override for this demonstration scope.');
  await submit(selectedForm);
  const items=await inspect<Array<{itemRef:string}>>('state.samplePopulations[0].items.filter(i=>i.selected)'); assert.equal(items.length,2);
  for(const item of items) {
    selectedForm=await form(`Test ${item.itemRef}`); await fill(`${selectedForm} [name="notes"]`,'Compared current sample amount with accepted digital evidence; no exception.'); await submit(selectedForm);
    selectedForm=await form(`Digital evidence for ${item.itemRef}`); await fill(`${selectedForm} [name="document"]`,documentId); await submit(selectedForm);
  }
  assert.equal(await inspect<boolean>('state.samplePopulations[0].items.filter(i=>i.selected).every(i=>i.tested && i.evidenceMode===\'Digital\' && !i.physicalReference)'),true);
  await route('confirmations','Track a new confirmation');
  assert.deepEqual(await tab.evaluate<string[]>(`Array.from(document.querySelector('[data-target-form="confirmation"] [name="type"]').options).map(o=>o.value)`),['Bank','Accounts Receivable','Accounts Payable','Inventory','Legal']);
  await fill('[data-target-form="confirmation"] [name="counterparty"]','Visible Demo Bank'); await submit('[data-target-form="confirmation"]');
  for(const status of ['Requested','Awaiting','Received']) {
    selectedForm=await form('Update confirmation:'); await fill(`${selectedForm} [name="status"]`,status); await fill(`${selectedForm} [name="note"]`,'Current bank confirmation tracked with attributable response evidence.');
    if(status==='Received')await fill(`${selectedForm} [name="evidence"]`,documentId); await submit(selectedForm);
  }
  await actor('reviewer'); await route('confirmations','Visible Demo Bank');
  for(const status of ['Reviewed','Cleared']) {
    selectedForm=await form('Update confirmation:'); await fill(`${selectedForm} [name="status"]`,status); await fill(`${selectedForm} [name="note"]`,'Independent reviewer corroborated the current bank response and resolved the critical blocker.'); await submit(selectedForm);
  }
  console.log('Visible checkpoint: sampling and confirmations');
  // R04: every mapped FSLI in this fixture exceeds PM, so all program workpapers are RED —
  // manager-executed and partner-reviewed. The manager prepares and submits; the assigned
  // partner reviewer clears the rework point and each workpaper.
  await actor('manager'); await route('reviews','Preparer → Manager');
  const workpapers=await inspect<Array<{id:string}>>('e.workpapers.filter(w=>w.applicable)');
  for(const wp of workpapers) {
    selectedForm=await form(`Link accepted evidence to ${wp.id}`); await fill(`${selectedForm} [name="document"]`,documentId); await submit(selectedForm);
    selectedForm=await form(`Prepare / revise ${wp.id}`); await fill(`${selectedForm} [name="work"]`,'Recorded current procedures, digital source verification and current supporting evidence.'); await fill(`${selectedForm} [name="conclusion"]`,'The current evidence supports the recorded audit area conclusion without unresolved exceptions.'); await submit(selectedForm);
    await button('Mark ready for independent review',`Array.from(document.querySelectorAll('form[data-target-form="workpaper"]')).find(f=>f.innerText.includes(${JSON.stringify(wp.id)})).closest('section')`);
  }
  selectedForm=await form(`Return a review point on ${workpapers[0].id}`); await fill(`${selectedForm} [name="title"]`,'Clarify current evidence basis'); await fill(`${selectedForm} [name="note"]`,'Expand the source verification and cross-reference the current digital evidence.'); await submit(selectedForm);
  selectedForm=await form(`Prepare / revise ${workpapers[0].id}`); await fill(`${selectedForm} [name="work"]`,'Revised source verification explicitly cross-references the current accepted digital source and sample tests.'); await fill(`${selectedForm} [name="conclusion"]`,'Current source corroboration supports the revised conclusion without exceptions.'); await submit(selectedForm);
  selectedForm=await form('Preparer response:'); await fill(`${selectedForm} [name="response"]`,'Revised workpaper source verification and linked current digital evidence address the returned point.'); await submit(selectedForm);
  await button('Mark ready for independent review',`Array.from(document.querySelectorAll('form[data-target-form="workpaper"]')).find(f=>f.innerText.includes(${JSON.stringify(workpapers[0].id)})).closest('section')`);
  await actor('partner'); await route('reviews','Preparer → Manager'); await button('Independent clearance of review point');
  for(const wp of workpapers) await button('Partner reviewer clears RED workpaper',`Array.from(document.querySelectorAll('form[data-target-form="workpaper"]')).find(f=>f.innerText.includes(${JSON.stringify(wp.id)})).closest('section')`);
  await actor('manager'); await route('reviews','Preparer → Manager');
  await fill('[data-target-form="manager-clearance"] [name="notes"]','Current workpapers, digital sample evidence, confirmations and the resolved rework loop support Manager clearance.'); await submit('[data-target-form="manager-clearance"]');
  await wait(`import('/src/store/prototypeStore.ts').then(({prototypeStore:s})=>s.getSnapshot().engagements[0].auditLifecycle.srms.length===1)`);
  await state('PARTNER_APPROVAL');
  return { engagementId, checkpoints, programs:programs.length, digitalSamples:items.length, reviewLoop:true, approvalFixture:await inspect<any>('state'), mode: 'Visible commercial, planning and fieldwork controls; only reset, scoped synthetic grant and leaving client persona use harness setup' };
}
