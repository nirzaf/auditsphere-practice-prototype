import { createInitialState } from './src/store/initialState.js';
import { prototypeStore } from './src/store/prototypeStore.js';
import type { PrototypeState } from './src/types/index.js';

function setPersona(s: PrototypeState, name: string) {
  const matches = s.users.filter((u) => u.name === name);
  const user = matches.find((u) => u.id === s.currentUserId) || matches.find((u) => u.role === s.currentRole) || matches[0];
  s.currentUserId = user?.id || '';
  s.currentPerson = name;
  if (user) s.currentRole = user.role;
}

const current = createInitialState();
(prototypeStore as any).state = current;

const eng = current.engagements[0];
eng.acceptance = false;
setPersona(current, 'Hana Ali');

try {
  prototypeStore.saveAcceptanceCase({
    id: `ACC-${eng.client}-${eng.year}`, clientId: eng.client, year: eng.year, service: eng.service,
    riskRating: 'Low', independenceConfirmed: true, amlKycCompleted: true, conflictsCleared: true,
    prohibitionsChecked: true, competenceConfirmed: true, conditions: [], recommendationBy: '',
    recommendationDate: '', recommendationNotes: 'Checks reviewed; recommend acceptance.', decisionStatus: 'Accepted'
  });
  console.log('First call succeeded (unexpected)');
} catch(e) {
  console.log('First call threw (expected):', (e as Error).message);
}

prototypeStore.saveAcceptanceCase({
  id: `ACC-${eng.client}-${eng.year}`, clientId: eng.client, year: eng.year, service: eng.service,
  riskRating: 'Low', independenceConfirmed: true, amlKycCompleted: true, conflictsCleared: true,
  prohibitionsChecked: true, competenceConfirmed: true, screeningEvidence: { amlKyc: 'KYC-101', independence: 'IND-101', conflicts: 'COI-101', prohibitions: 'ROT-101', competence: 'COMP-101' }, conditions: [], recommendationBy: '',
  recommendationDate: '', recommendationNotes: 'Checks reviewed; recommend acceptance.', decisionStatus: 'Accepted'
});

const snapshot = prototypeStore.getSnapshot();
const case0 = snapshot.acceptanceCases?.[0];
console.log('case found:', !!case0);
console.log('history length:', case0?.history?.length);
console.log('decisionStatus:', case0?.decisionStatus);
if (case0?.history?.[0]) {
  console.log('history[0] keys:', Object.keys(case0.history[0]));
  console.log('history[0].screeningEvidence:', JSON.stringify(case0.history[0].screeningEvidence));
  console.log('amlKyc:', case0.history[0].screeningEvidence?.amlKyc);
}
