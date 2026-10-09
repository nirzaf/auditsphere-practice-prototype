export function formatRawQar(numerator: string, denominator: string): string {
  const rawNumerator = BigInt(numerator);
  const rawDenominator = BigInt(denominator);
  if (rawDenominator <= 0n) return 'Unavailable';
  const negative = rawNumerator < 0n;
  const absoluteNumerator = negative ? -rawNumerator : rawNumerator;
  const divisor = rawDenominator * 100n;
  const scaled = (absoluteNumerator * 1_000_000n + divisor / 2n) / divisor;
  const whole = (scaled / 1_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fractional = (scaled % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${negative ? '-' : ''}QAR ${whole}.${fractional}`;
}

export function formatRawDifferencePercent(numerator: string, denominator: string, adjustedMinor: string | number): string {
  const rawNumerator = BigInt(numerator);
  const rawDenominator = BigInt(denominator);
  if (rawNumerator === 0n || rawDenominator <= 0n) return 'Unavailable';
  const difference = BigInt(String(adjustedMinor)) * rawDenominator - rawNumerator;
  const absoluteDifference = difference < 0n ? -difference : difference;
  const absoluteRaw = rawNumerator < 0n ? -rawNumerator : rawNumerator;
  const percentScaled = (absoluteDifference * 1_000_000n + absoluteRaw / 2n) / absoluteRaw;
  const percent = `${percentScaled / 10_000n}.${(percentScaled % 10_000n).toString().padStart(4, '0')}%`;
  return `${difference > 0n ? '+' : difference < 0n ? '-' : ''}${percent}`;
}
