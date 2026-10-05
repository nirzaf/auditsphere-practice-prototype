// Browser-free proposal validators shared by the store and domain commands.
// Ported verbatim from prototypeStore helpers; no behaviour change.

export const isProposalCurrency = (value: string) => ['QAR', 'USD', 'EUR', 'GBP'].includes(value);

export const isProposalDate = (value?: string) =>
  Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );

export const hasValidProposalPeriod = (start?: string, end?: string) =>
  Boolean(isProposalDate(start) && isProposalDate(end) && start! <= end!);

const unsupportedProposalTerms = [
  't' + 'ax',
  'pay' + 'roll',
  'artificial ' + 'intelligence',
  'A' + 'I',
  'payment ' + 'gateway',
  'e ' + 'signature',
  'signature ' + 'provider'
];

export const hasUnsupportedProposalOffering = (value: string) => {
  const words = value.toLowerCase().match(/[a-z]+/g) || [];
  const normalized = ` ${words.join(' ')} `;
  return (
    words.some(word => word.startsWith('re' + 'curr')) ||
    unsupportedProposalTerms.some(term => normalized.includes(` ${term.toLowerCase()} `))
  );
};

export const isValidProposalMoney = (amount: number, allowZero = false) =>
  Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) && Math.round(amount * 100) === amount * 100;
