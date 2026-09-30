import { describe, expect, it } from 'vitest';
import {
  calculateMusSample,
  calculateSystematicSample,
  calculateAttributeSample,
  type SamplingPopulationItem
} from '../domain/sampling';

describe('Audit Sampling Calculators (ISA 530)', () => {
  const dummyPopulation: SamplingPopulationItem[] = [
    { id: 'item-1', reference: 'INV-1001', description: 'Major machinery supplier invoice', bookValue: 500_000 },
    { id: 'item-2', reference: 'INV-1002', description: 'Steel pipes bulk consignment', bookValue: 250_000 },
    { id: 'item-3', reference: 'INV-1003', description: 'HVAC parts local delivery', bookValue: 80_000 },
    { id: 'item-4', reference: 'INV-1004', description: 'Electrical cables and switches', bookValue: 45_000 },
    { id: 'item-5', reference: 'INV-1005', description: 'Safety equipment batch', bookValue: 25_000 },
    { id: 'item-6', reference: 'INV-1006', description: 'Warehouse consumables', bookValue: 12_000 },
    { id: 'item-7', reference: 'INV-1007', description: 'Diesel generator maintenance', bookValue: 60_000 },
    { id: 'item-8', reference: 'INV-1008', description: 'Site logistics transport freight', bookValue: 150_000 },
    { id: 'item-9', reference: 'INV-1009', description: 'Scaffolding lease monthly fee', bookValue: 35_000 },
    { id: 'item-10', reference: 'INV-1010', description: 'Cement bags pallet delivery', bookValue: 95_000 }
  ];

  it('performs Monetary Unit Sampling (MUS) with probability proportional to size', () => {
    // Total value = 1,252,000 QAR
    // Tolerable misstatement: 150,000 QAR -> sampling interval = 150,000 / 3 = 50,000 QAR
    const result = calculateMusSample(dummyPopulation, {
      tolerableMisstatement: 150_000,
      seed: 42
    });

    expect(result.method).toBe('Monetary Unit Sampling');
    expect(result.populationTotalValue).toBe(1_252_000);
    expect(result.sampleSize).toBeGreaterThan(0);
    expect(result.selectedItemIds.length).toBe(result.sampleSize);

    // item-1 (500k) is 10x the interval (50k), so it must be selected and receive multiple hits
    expect(result.selectedItemIds).toContain('item-1');
    expect(result.hits['item-1']).toBeGreaterThanOrEqual(9);

    // Coverage percentage is calculated
    expect(result.summary.coveragePercentage).toBeGreaterThan(50);
  });

  it('performs Systematic Random Sampling selecting every k-th item', () => {
    const result = calculateSystematicSample(dummyPopulation, {
      sampleSize: 4,
      seed: 101
    });

    expect(result.method).toBe('Systematic Random');
    expect(result.sampleSize).toBe(4);
    expect(result.samplingInterval).toBe(Math.floor(dummyPopulation.length / 4)); // 10 / 4 = 2
    expect(new Set(result.selectedItemIds).size).toBe(4);
  });

  it('performs Stratified Attribute Sampling with AICPA confidence tables', () => {
    const result = calculateAttributeSample(dummyPopulation, {
      confidenceLevel: 95,
      tolerableDeviationRate: 5,
      expectedPopulationDeviationRate: 1,
      seed: 777
    });

    expect(result.method).toBe('Stratified Attribute');
    expect(result.sampleSize).toBeGreaterThan(0);
    expect(result.sampleSize).toBeLessThanOrEqual(dummyPopulation.length);
  });

  it('throws descriptive error on invalid inputs', () => {
    expect(() => calculateMusSample([], { tolerableMisstatement: 50_000 })).toThrow(
      'Population cannot be empty'
    );

    expect(() =>
      calculateAttributeSample(dummyPopulation, {
        confidenceLevel: 95,
        tolerableDeviationRate: 2,
        expectedPopulationDeviationRate: 3 // EDR > TDR is invalid
      })
    ).toThrow('strictly less than tolerable rate');
  });
});
