import { performance } from 'node:perf_hooks';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { prototypeStore as store } from '../src/store/prototypeStore';
import { reviewBasis } from '../src/services/targetLifecycle';
import { createPDFBlob } from '../src/services/exportService';
import type { PrototypeState } from '../src/types';

// Same synthetic input for both implementations: defensive clone/full serialization vs
// immutable view/cached projection. This is a component benchmark, not network latency.
const state=JSON.parse(readFileSync('tests/fixtures/current-partner-approval.json','utf8')) as PrototypeState;
const source=state.engagements.find(e=>e.id===state.selectedEngagement)!;
source.rows=Array.from({length:2000},(_,i)=>({...source.rows[i%source.rows.length],code:`BENCH-${i}`}));
source.reviews=Array.from({length:500},(_,i)=>({...source.reviews[0],id:`BENCH-NOTE-${i}`,title:`Synthetic review ${i}`,body:'Synthetic observation '.repeat(10)}));
state.engagements=Array.from({length:20},(_,i)=>({...structuredClone(source),id:`BENCH-ENG-${i}`}));
state.asOfDate='2026-09-30';
(store as any).state=state;
const count=30;
function measure(action:()=>unknown){const start=performance.now();for(let i=0;i<count;i++)action();return +(performance.now()-start).toFixed(3);}
const cold=performance.now();const view=store.getReadSnapshot();const immutableColdMs=+(performance.now()-cold).toFixed(3);
const basis=reviewBasis(state,state.engagements[0]);reviewBasis(view,view.engagements[0]);
const legacyPDFStart=performance.now();const full=createPDFBlob('SRM legacy projection',[basis]);const legacyPDFMs=performance.now()-legacyPDFStart;
let hash=2166136261;for(const ch of basis)hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;
const compactPDFStart=performance.now();const compact=createPDFBlob('SRM compact projection',[`Review basis reference FNV1a:${hash.toString(16)} (full projection retained in record)`]);const compactPDFMs=performance.now()-compactPDFStart;
const result={date:new Date().toISOString(),baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dataset:{engagements:20,tbRowsPerEngagement:2000,reviewsPerEngagement:500,stateBytes:Buffer.byteLength(JSON.stringify(state))},iterations:count,
  snapshot:{defensiveCloneTotalMs:measure(()=>store.getSnapshot()),immutableColdMs,immutableCachedTotalMs:measure(()=>store.getReadSnapshot())},
  projection:{mutableFullSerializationTotalMs:measure(()=>reviewBasis(state,state.engagements[0])),frozenCachedTotalMs:measure(()=>reviewBasis(view,view.engagements[0]))},
  srmPDF:{fullBasis:{ms:+legacyPDFMs.toFixed(3),bytes:full.size,pages:(await full.text()).match(/\/Type\s*\/Page\b/g)?.length},compactReference:{ms:+compactPDFMs.toFixed(3),bytes:compact.size,pages:(await compact.text()).match(/\/Type\s*\/Page\b/g)?.length}},
  boundary:'Single-process synthetic component timings; cold snapshot includes cloning/freezing. Mutable command bases still recompute; files, cloud latency and production hardware are not measured.'};
mkdirSync('docs/prototype/evidence',{recursive:true});writeFileSync('docs/prototype/evidence/review-performance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
