import { describe, expect, it } from 'vitest';
import {
  computeMateriality,
  validateMaterialityInput,
  validateRounding,
  stratifyRisk,
  assertThresholdsDeriveFromAppliedPm
} from '../domain/materiality';

describe('ISA 320 Materiality Engine', () => {
  it('computes PM, TE, and SAD within required benchmark bands for Profit Before Tax', () => {
    // 5-10% for Profit Before Tax
    const result = computeMateriality({
      benchmark: 'PROFIT_BEFORE_TAX',
      benchmarkValue: 2_000_000, // 2M QAR
      materialityRate: 7.5, // within 5-10%
      tolerableErrorRate: 60, // within 50-75%
      sadRate: 5, // within 3-5%
      rationale: 'Normalized earnings baseline for trading company.'
    });

    expect(result.planningMateriality).toBe(150_000); // 2M * 7.5%
    expect(result.tolerableError).toBe(90_000); // 150k * 60%
    expect(result.sadThreshold).toBe(7_500); // 150k * 5%
  });

  it('rejects out-of-band benchmark rates', () => {
    // PBT max is 10%, should reject 12%
    const violations = validateMaterialityInput({
      benchmark: 'PROFIT_BEFORE_TAX',
      benchmarkValue: 1_000_000,
      materialityRate: 12.0,
      tolerableErrorRate: 60,
      sadRate: 4,
      rationale: 'Over benchmark maximum test'
    });

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('between 5% and 10%');
  });

  it('validates manual practical rounding strictly within ±5.0%', () => {
    const computedPm = 150_000;

    // +3.33% rounding -> 155,000 QAR is within ±5%
    const validRounding = validateRounding(computedPm, 155_000);
    expect(validRounding.withinTolerance).toBe(true);
    expect(validRounding.partnerSignOffRequired).toBe(true);
    expect(validRounding.variancePct).toBeCloseTo(3.3333, 2);

    // +10% rounding -> 165,000 QAR exceeds ±5%
    const invalidRounding = validateRounding(computedPm, 165_000);
    expect(invalidRounding.withinTolerance).toBe(false);
    expect(invalidRounding.violations[0]).toContain('±5% limit is exceeded');

    // Exactly equal -> 0 variance, no partner sign-off needed
    const exactRounding = validateRounding(computedPm, 150_000);
    expect(exactRounding.withinTolerance).toBe(true);
    expect(exactRounding.partnerSignOffRequired).toBe(false);
  });

  it('stratifies risk into Green, Amber, Red categories according to ISA 320 / 315', () => {
    const pm = 100_000;
    const te = 60_000;

    // Green: Balance < TE
    const green = stratifyRisk({ balance: 45_000, planningMateriality: pm, tolerableError: te });
    expect(green.stratum).toBe('GREEN');
    expect(green.requiredReviewer).toBe('Junior staff');

    // Amber: Balance between TE and PM
    const amber = stratifyRisk({ balance: 80_000, planningMateriality: pm, tolerableError: te });
    expect(amber.stratum).toBe('AMBER');
    expect(amber.requiredReviewer).toBe('Senior substantive testing');

    // Red: Balance >= PM
    const redBalance = stratifyRisk({ balance: 120_000, planningMateriality: pm, tolerableError: te });
    expect(redBalance.stratum).toBe('RED');
    expect(redBalance.requiredReviewer).toBe('Manager + Partner direct review');

    // Red: Critical accounting estimate even if below TE
    const redEstimate = stratifyRisk({
      balance: 20_000,
      planningMateriality: pm,
      tolerableError: te,
      criticalAccountingEstimate: true
    });
    expect(redEstimate.stratum).toBe('RED');
  });

  it('asserts downstream TE and SAD derive from the applied PM', () => {
    const appliedPm = 155_000;
    const teRate = 60;
    const sadRate = 5;

    // Correct TE = 93,000 and SAD = 7,750
    const violations = assertThresholdsDeriveFromAppliedPm({
      appliedPm,
      tolerableErrorRate: teRate,
      tolerableError: 93_000,
      sadRate,
      sadThreshold: 7_750
    });
    expect(violations.length).toBe(0);

    // Stale TE left at 90,000 (derived from old PM)
    const staleViolations = assertThresholdsDeriveFromAppliedPm({
      appliedPm,
      tolerableErrorRate: teRate,
      tolerableError: 90_000,
      sadRate,
      sadThreshold: 7_750
    });
    expect(staleViolations.length).toBeGreaterThan(0);
  });
});
