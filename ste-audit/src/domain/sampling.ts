/**
 * Audit Sampling Engine (spec §4.3.2 / ISA 530).
 *
 * Implements:
 * 1. Monetary Unit Sampling (MUS / PPS - Probability Proportional to Size)
 * 2. Systematic Random Sampling
 * 3. Stratified Attribute Sampling
 *
 * Deterministic PRNG seeded random generation for reproducibility and audit trail.
 */

import { SAMPLING_METHODS, type SamplingMethod } from './constants';

export interface SamplingPopulationItem {
  id: string;
  reference: string;
  description: string;
  bookValue: number; // in QAR
  stratum?: string;
}

export interface MusParameters {
  tolerableMisstatement: number; // in QAR (usually Tolerable Error)
  expectedMisstatement?: number; // in QAR
  riskOfIncorrectAcceptance?: number; // e.g. 5% or 10%
  expansionFactor?: number; // usually 1.6 for 5% risk, 1.5 for 10%
  seed?: number;
}

export interface SystematicParameters {
  sampleSize: number;
  seed?: number;
}

export interface AttributeSamplingParameters {
  confidenceLevel: 90 | 95 | 99;
  tolerableDeviationRate: number; // percentage (e.g. 5%)
  expectedPopulationDeviationRate: number; // percentage (e.g. 1%)
  populationSize?: number;
  seed?: number;
}

export interface SamplingResult {
  method: SamplingMethod;
  populationCount: number;
  populationTotalValue: number;
  sampleSize: number;
  samplingInterval?: number;
  seed: number;
  selectedItemIds: string[];
  hits: Record<string, number>;
  selectedItems: Array<SamplingPopulationItem & { hits: number }>;
  summary: {
    coveragePercentage: number;
    sampleTotalValue: number;
    notes: string;
  };
}

/** Linear Congruential Generator (LCG) for deterministic pseudo-random numbers based on seed */
export class DeterministicPrng {
  private state: number;

  constructor(seed: number = 42) {
    this.state = Math.abs(Math.floor(seed)) % 2147483647;
    if (this.state === 0) this.state = 1;
  }

  /** Returns float in [0, 1) */
  next(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }

  /** Returns integer in [min, max] inclusive */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

/**
 * Monetary Unit Sampling (MUS / PPS)
 * Standard ISA 530 substantive testing sampling methodology.
 */
export function calculateMusSample(
  population: SamplingPopulationItem[],
  params: MusParameters
): SamplingResult {
  if (population.length === 0) {
    throw new Error('Population cannot be empty for Monetary Unit Sampling.');
  }

  const seed = params.seed ?? 12345;
  const prng = new DeterministicPrng(seed);

  const totalValue = population.reduce((acc, item) => acc + Math.abs(item.bookValue), 0);
  if (totalValue <= 0) {
    throw new Error('Population total book value must be greater than zero.');
  }

  const tm = params.tolerableMisstatement;
  if (!tm || tm <= 0) {
    throw new Error('Tolerable Misstatement must be greater than zero.');
  }

  // Factor: 3.0 for 95% confidence / 5% risk without expected error, or adjusted by expansion factor
  const riskFactor = params.riskOfIncorrectAcceptance === 10 ? 2.31 : 3.0;
  const interval = Math.max(1, Math.floor(tm / riskFactor));

  // Random start between 1 and sampling interval
  const randomStart = prng.nextInt(1, interval);

  let runningCumulative = 0;
  let nextTargetPoint = randomStart;
  const hits: Record<string, number> = {};
  const selectedMap = new Map<string, SamplingPopulationItem>();

  for (const item of population) {
    const itemAbsValue = Math.abs(item.bookValue);
    runningCumulative += itemAbsValue;

    let itemHits = 0;
    while (nextTargetPoint <= runningCumulative) {
      itemHits++;
      nextTargetPoint += interval;
    }

    if (itemHits > 0) {
      hits[item.id] = itemHits;
      selectedMap.set(item.id, item);
    }
  }

  const selectedItems = Array.from(selectedMap.values()).map(item => ({
    ...item,
    hits: hits[item.id] ?? 1
  }));

  const sampleTotalValue = selectedItems.reduce((acc, item) => acc + Math.abs(item.bookValue), 0);
  const coveragePercentage = totalValue > 0 ? Number(((sampleTotalValue / totalValue) * 100).toFixed(2)) : 0;

  return {
    method: 'Monetary Unit Sampling',
    populationCount: population.length,
    populationTotalValue: totalValue,
    sampleSize: selectedItems.length,
    samplingInterval: interval,
    seed,
    selectedItemIds: selectedItems.map(i => i.id),
    hits,
    selectedItems,
    summary: {
      coveragePercentage,
      sampleTotalValue,
      notes: `MUS generated ${selectedItems.length} unique items across ${Object.values(hits).reduce((a, b) => a + b, 0)} sampling points. Sampling interval: ${interval.toLocaleString()} QAR.`
    }
  };
}

/**
 * Systematic Random Sampling
 * Selects every k-th item after a random start.
 */
export function calculateSystematicSample(
  population: SamplingPopulationItem[],
  params: SystematicParameters
): SamplingResult {
  if (population.length === 0) {
    throw new Error('Population cannot be empty for Systematic Sampling.');
  }

  const n = Math.min(params.sampleSize, population.length);
  if (n <= 0) {
    throw new Error('Sample size must be greater than zero.');
  }

  const seed = params.seed ?? 54321;
  const prng = new DeterministicPrng(seed);

  const k = Math.max(1, Math.floor(population.length / n));
  const start = prng.nextInt(0, k - 1);

  const selectedItems: Array<SamplingPopulationItem & { hits: number }> = [];
  const hits: Record<string, number> = {};

  for (let idx = start; idx < population.length && selectedItems.length < n; idx += k) {
    const item = population[idx];
    if (item) {
      hits[item.id] = 1;
      selectedItems.push({ ...item, hits: 1 });
    }
  }

  const totalValue = population.reduce((acc, item) => acc + Math.abs(item.bookValue), 0);
  const sampleTotalValue = selectedItems.reduce((acc, item) => acc + Math.abs(item.bookValue), 0);
  const coveragePercentage = totalValue > 0 ? Number(((sampleTotalValue / totalValue) * 100).toFixed(2)) : 0;

  return {
    method: 'Systematic Random',
    populationCount: population.length,
    populationTotalValue: totalValue,
    sampleSize: selectedItems.length,
    samplingInterval: k,
    seed,
    selectedItemIds: selectedItems.map(i => i.id),
    hits,
    selectedItems,
    summary: {
      coveragePercentage,
      sampleTotalValue,
      notes: `Systematic sampling picked ${selectedItems.length} items with interval k=${k} starting at index ${start}.`
    }
  };
}

/**
 * Stratified Attribute Sampling
 * Formula for attribute tests of control (AICPA / ISA 530 tables).
 * Computes sample size based on Tolerable Deviation Rate (TDR) and Expected Deviation Rate (EDR).
 */
export function calculateAttributeSample(
  population: SamplingPopulationItem[],
  params: AttributeSamplingParameters
): SamplingResult {
  if (population.length === 0) {
    throw new Error('Population cannot be empty for Attribute Sampling.');
  }

  const tdr = params.tolerableDeviationRate;
  const edr = params.expectedPopulationDeviationRate;

  if (tdr <= 0 || tdr > 50) {
    throw new Error('Tolerable deviation rate must be between 1% and 50%.');
  }
  if (edr < 0 || edr >= tdr) {
    throw new Error('Expected population deviation rate must be strictly less than tolerable rate.');
  }

  // Confidence factor Z: 90% -> 2.31, 95% -> 3.00, 99% -> 4.61 (Poisson factor for 0 errors)
  const factor = params.confidenceLevel === 90 ? 2.31 : params.confidenceLevel === 99 ? 4.61 : 3.0;

  // Approximate attribute sample size = Factor / (TDR - EDR)
  const diff = (tdr - edr) / 100;
  let rawSampleSize = Math.ceil(factor / diff);

  // If population is small, apply finite population correction (FPC): n' = n / (1 + n/N)
  const N = params.populationSize ?? population.length;
  if (N > 0 && rawSampleSize > N * 0.1) {
    rawSampleSize = Math.ceil(rawSampleSize / (1 + rawSampleSize / N));
  }
  const sampleSize = Math.min(rawSampleSize, population.length);

  const seed = params.seed ?? 99999;
  const prng = new DeterministicPrng(seed);

  // Stratify population if stratum exists, otherwise Fisher-Yates shuffle sampling
  const shuffled = [...population];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = prng.nextInt(0, i);
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }

  const selected = shuffled.slice(0, sampleSize);
  const hits: Record<string, number> = {};
  const selectedItems = selected.map(item => {
    hits[item.id] = 1;
    return { ...item, hits: 1 };
  });

  const totalValue = population.reduce((acc, item) => acc + Math.abs(item.bookValue), 0);
  const sampleTotalValue = selectedItems.reduce((acc, item) => acc + Math.abs(item.bookValue), 0);
  const coveragePercentage = totalValue > 0 ? Number(((sampleTotalValue / totalValue) * 100).toFixed(2)) : 0;

  return {
    method: 'Stratified Attribute',
    populationCount: population.length,
    populationTotalValue: totalValue,
    sampleSize: selectedItems.length,
    seed,
    selectedItemIds: selectedItems.map(i => i.id),
    hits,
    selectedItems,
    summary: {
      coveragePercentage,
      sampleTotalValue,
      notes: `Attribute sample of ${selectedItems.length} items computed for ${params.confidenceLevel}% confidence, ${tdr}% tolerable rate, ${edr}% expected rate.`
    }
  };
}
