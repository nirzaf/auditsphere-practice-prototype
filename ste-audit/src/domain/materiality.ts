/**
 * ISA 320 — 3-tier materiality engine (spec §3.2 / §4.2.4).
 *
 * Planning Materiality (PM) = benchmark base × benchmark rate (within the band)
 * Tolerable Error (TE)      = PM × 50% (high risk) … 75% (low risk)
 * SAD threshold             = PM × 3% … 5% (clearly trivial)
 *
 * Practical rounding of PM/TE is permitted strictly within ±5.0% of the computed
 * value and requires formal Partner sign-off (spec §4.2.4).
 */
import {
  MATERIALITY_BENCHMARKS,
  ROUNDING_TOLERANCE_PCT,
  SAD_THRESHOLD_BAND,
  TOLERABLE_ERROR_BAND,
  type MaterialityBenchmark,
  type RiskStratum
} from './constants';

export interface MaterialityInput {
  benchmark: MaterialityBenchmark;
  /** Benchmark base amount in QAR (e.g. normalized profit before tax). */
  benchmarkValue: number;
  /** Selected percentage, must sit within the benchmark band. */
  materialityRate: number;
  /** Tolerable-error rate as a percentage of PM (50–75). */
  tolerableErrorRate: number;
  /** SAD (clearly trivial) rate as a percentage of PM (3–5). */
  sadRate: number;
  rationale: string;
}

export interface MaterialityComputation {
  benchmark: MaterialityBenchmark;
  benchmarkValue: number;
  materialityRate: number;
  planningMateriality: number;
  tolerableErrorRate: number;
  tolerableError: number;
  sadRate: number;
  sadThreshold: number;
  rationale: string;
}

/** Round to whole QAR: materiality thresholds are set in whole riyals. */
export const roundQar = (value: number): number => Math.round(value);

export class MaterialityError extends Error {
  readonly violations: string[];
  constructor(violations: string[]) {
    super(violations.join(' '));
    this.name = 'MaterialityError';
    this.violations = violations;
  }
}

export function validateMaterialityInput(input: MaterialityInput): string[] {
  const violations: string[] = [];
  const band = MATERIALITY_BENCHMARKS[input.benchmark];

  if (!Number.isFinite(input.benchmarkValue) || input.benchmarkValue <= 0)
    violations.push('Benchmark base must be a positive QAR amount.');

  if (
    !Number.isFinite(input.materialityRate) ||
    input.materialityRate < band.min ||
    input.materialityRate > band.max
  )
    violations.push(
      `${band.label} benchmark rate must be between ${band.min}% and ${band.max}% (received ${input.materialityRate}%).`
    );

  if (
    !Number.isFinite(input.tolerableErrorRate) ||
    input.tolerableErrorRate < TOLERABLE_ERROR_BAND.min ||
    input.tolerableErrorRate > TOLERABLE_ERROR_BAND.max
  )
    violations.push(
      `Tolerable Error rate must be between ${TOLERABLE_ERROR_BAND.min}% and ${TOLERABLE_ERROR_BAND.max}% of PM (received ${input.tolerableErrorRate}%).`
    );

  if (
    !Number.isFinite(input.sadRate) ||
    input.sadRate < SAD_THRESHOLD_BAND.min ||
    input.sadRate > SAD_THRESHOLD_BAND.max
  )
    violations.push(
      `SAD threshold rate must be between ${SAD_THRESHOLD_BAND.min}% and ${SAD_THRESHOLD_BAND.max}% of PM (received ${input.sadRate}%).`
    );

  if (!input.rationale || input.rationale.trim().length < 10)
    violations.push('A planning rationale of at least 10 characters is required.');

  return violations;
}

export function computeMateriality(input: MaterialityInput): MaterialityComputation {
  const violations = validateMaterialityInput(input);
  if (violations.length) throw new MaterialityError(violations);

  const planningMateriality = roundQar(input.benchmarkValue * (input.materialityRate / 100));
  const tolerableError = roundQar(planningMateriality * (input.tolerableErrorRate / 100));
  const sadThreshold = roundQar(planningMateriality * (input.sadRate / 100));

  return {
    benchmark: input.benchmark,
    benchmarkValue: input.benchmarkValue,
    materialityRate: input.materialityRate,
    planningMateriality,
    tolerableErrorRate: input.tolerableErrorRate,
    tolerableError,
    sadRate: input.sadRate,
    sadThreshold,
    rationale: input.rationale.trim()
  };
}

export interface RoundingValidation {
  /** Absolute variance of the applied value from the computed value, in QAR. */
  varianceQar: number;
  /** Variance as a percentage of the computed value. */
  variancePct: number;
  withinTolerance: boolean;
  /** True whenever the applied figure differs from the computed figure. */
  partnerSignOffRequired: boolean;
  violations: string[];
}

/**
 * Spec §4.2.4 — practical rounding strictly within ±5.0% of the computed value.
 * Zero-variance rounding (re-entering the exact figure) never needs sign-off.
 */
export function validateRounding(computed: number, applied: number): RoundingValidation {
  if (!Number.isFinite(applied)) {
    return {
      varianceQar: NaN,
      variancePct: NaN,
      withinTolerance: false,
      partnerSignOffRequired: false,
      violations: ['Applied value must be a finite number.']
    };
  }
  const varianceQar = roundQar(applied - computed);
  const variancePct = computed === 0 ? 0 : (varianceQar / computed) * 100;
  const withinTolerance = Math.abs(variancePct) <= ROUNDING_TOLERANCE_PCT + 1e-9;
  const violations: string[] = [];
  if (!withinTolerance)
    violations.push(
      `Rounding of ${applied} deviates ${variancePct.toFixed(2)}% from the computed ${computed}; the ±${ROUNDING_TOLERANCE_PCT}% limit is exceeded.`
    );
  if (varianceQar !== 0 && !Number.isInteger(applied))
    violations.push('Manually rounded thresholds must be whole QAR amounts.');
  return {
    varianceQar,
    variancePct: Number(variancePct.toFixed(4)),
    withinTolerance,
    partnerSignOffRequired: varianceQar !== 0,
    violations
  };
}

export interface RiskStratificationInput {
  /** FSLI or account balance (absolute amount) in QAR. */
  balance: number;
  planningMateriality: number;
  tolerableError: number;
  /** High inherent risk assessment (e.g. ISA 315 significant risk). */
  highInherentRisk?: boolean;
  /** Complex accounting estimate (e.g. ECL, impairment, fair value). */
  criticalAccountingEstimate?: boolean;
  /** Estimate subject to high estimation uncertainty. */
  highEstimationUncertainty?: boolean;
}

export interface RiskStratificationResult {
  stratum: RiskStratum;
  reason: string;
  /** Per spec §4.2.4: Red requires Manager execution and Partner direct review. */
  requiredReviewer: 'Junior staff' | 'Senior substantive testing' | 'Manager + Partner direct review';
}

/** Spec §4.2.4 — Green / Amber / Red visual risk stratification. */
export function stratifyRisk(input: RiskStratificationInput): RiskStratificationResult {
  const balance = Math.abs(input.balance);

  if (
    input.highInherentRisk ||
    input.criticalAccountingEstimate ||
    input.highEstimationUncertainty ||
    balance >= input.planningMateriality
  ) {
    const reason = input.highInherentRisk
      ? 'High inherent risk rating'
      : input.criticalAccountingEstimate
        ? 'Critical accounting estimate'
        : input.highEstimationUncertainty
          ? 'High estimation uncertainty'
          : `Balance ≥ Planning Materiality (${input.planningMateriality} QAR)`;
    return { stratum: 'RED', reason, requiredReviewer: 'Manager + Partner direct review' };
  }

  if (balance >= input.tolerableError) {
    return {
      stratum: 'AMBER',
      reason: `Balance ≥ Tolerable Error (${input.tolerableError} QAR) and below Planning Materiality`,
      requiredReviewer: 'Senior substantive testing'
    };
  }

  return {
    stratum: 'GREEN',
    reason: `Balance below Tolerable Error (${input.tolerableError} QAR)`,
    requiredReviewer: 'Junior staff'
  };
}

/**
 * Confirms a downstream threshold still derives from the *applied* PM, so a
 * manually rounded PM cannot silently leave inconsistent TE/SAD figures behind.
 */
export function assertThresholdsDeriveFromAppliedPm(input: {
  appliedPm: number;
  tolerableErrorRate: number;
  tolerableError: number;
  sadRate: number;
  sadThreshold: number;
  /** Allow ±1 QAR for whole-riyal rounding of each derived threshold. */
  toleranceQar?: number;
}): string[] {
  const tolerance = input.toleranceQar ?? 1;
  const violations: string[] = [];
  const expectedTe = roundQar(input.appliedPm * (input.tolerableErrorRate / 100));
  const expectedSad = roundQar(input.appliedPm * (input.sadRate / 100));
  if (Math.abs(input.tolerableError - expectedTe) > tolerance)
    violations.push(
      `Tolerable Error ${input.tolerableError} must derive from the applied PM ${input.appliedPm} at ${input.tolerableErrorRate}% (expected ${expectedTe}).`
    );
  if (Math.abs(input.sadThreshold - expectedSad) > tolerance)
    violations.push(
      `SAD threshold ${input.sadThreshold} must derive from the applied PM ${input.appliedPm} at ${input.sadRate}% (expected ${expectedSad}).`
    );
  return violations;
}
