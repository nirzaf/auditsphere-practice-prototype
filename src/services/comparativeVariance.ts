export function comparativeVariance(current: number, prior?: number) {
  if (prior === undefined) return { movement: undefined, percent: null, label: 'Missing comparative' };
  const movement=current-prior;
  if (prior===0 && current!==0) return {movement,percent:null,label:'New balance — percentage not meaningful'};
  return {movement,percent:prior===0?0:movement/Math.abs(prior)*100,label:prior===0?'Unchanged zero':'Percentage movement'};
}
