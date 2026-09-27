// Isolated source-function probes, NOT an execution of the repository test suite.
// Source: nirzaf/auditsphere-visual-prototype@27357ef0d0f9b2aabe1e786ca2b323f987cec5bd
// src/services/calculations.ts. Only TypeScript type annotations and export keywords removed.
function formatCurrency(amount, currency = 'QAR') {
  return `${currency} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
function calculateBalanceSheet(rows) {
  const assets = rows.filter(r => r.type === 'asset');
  const liabilities = rows.filter(r => r.type === 'liability');
  const equity = rows.filter(r => r.type === 'equity');
  const currentPeriodResult = calculateIncomeStatement(rows).netProfit;
  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + Math.abs(l.balance), 0);
  const totalEquity = equity.reduce((s, e) => s + Math.abs(e.balance), 0) + currentPeriodResult;
  const difference = Math.abs(totalAssets - (totalLiabilities + totalEquity));
  const isBalanced = difference === 0;
  return {assets,liabilities,equity,totalAssets,totalLiabilities,totalEquity,currentPeriodResult,difference,isBalanced};
}
function calculateIncomeStatement(rows) {
  const revenues = rows.filter(r => r.type === 'revenue');
  const expenses = rows.filter(r => r.type === 'expense');
  const revenue = revenues.reduce((s, r) => s + Math.abs(r.balance), 0);
  const costOfSales = expenses.filter(e => e.name.toLowerCase().includes('cost') || e.code.startsWith('50')).reduce((s, e) => s + e.balance, 0);
  const operatingExpenses = expenses.filter(e => !e.name.toLowerCase().includes('cost') && !e.code.startsWith('50')).reduce((s, e) => s + e.balance, 0);
  const grossProfit = revenue - costOfSales;
  const netProfit = grossProfit - operatingExpenses;
  return {revenue,costOfSales,grossProfit,operatingExpenses,netProfit};
}
const fixtures=[
  {id:'CONTRA-REVENUE',expectedRevenue:800,expectedEquity:800,rows:[
    {code:'1000',name:'Cash',type:'asset',balance:800},
    {code:'4000',name:'Revenue',type:'revenue',balance:-1000},
    {code:'4090',name:'Sales returns mapped to Revenue',type:'revenue',balance:200}]},
  {id:'DEBIT-EQUITY',expectedRevenue:0,expectedEquity:80,rows:[
    {code:'1000',name:'Cash',type:'asset',balance:80},
    {code:'3000',name:'Share capital',type:'equity',balance:-100},
    {code:'3090',name:'Debit balance in equity',type:'equity',balance:20}]},
  {id:'ORDINARY-CONTROL',expectedRevenue:1000,expectedEquity:800,rows:[
    {code:'1000',name:'Cash',type:'asset',balance:800},
    {code:'4000',name:'Revenue',type:'revenue',balance:-1000},
    {code:'6000',name:'Expense',type:'expense',balance:200}]},
];
const results=fixtures.map(f=>{const inc=calculateIncomeStatement(f.rows),bs=calculateBalanceSheet(f.rows); return {id:f.id,sourceSignedTotal:f.rows.reduce((s,r)=>s+r.balance,0),expectedRevenue:f.expectedRevenue,actualRevenue:inc.revenue,expectedEquity:f.expectedEquity,actualEquity:bs.totalEquity,reportedBalanceDifference:bs.difference,passes:inc.revenue===f.expectedRevenue&&bs.totalEquity===f.expectedEquity&&bs.difference===0};});
console.log(JSON.stringify({sourceCommit:'27357ef0d0f9b2aabe1e786ca2b323f987cec5bd',method:'Isolated manually extracted source functions; no app, store or browser execution',results,currencyProbe:{engagementCurrency:'USD',callUsedByPlanningView:'formatCurrency(amount)',actual:formatCurrency(1000),expectedWithExplicitCurrency:formatCurrency(1000,'USD')}},null,2));
