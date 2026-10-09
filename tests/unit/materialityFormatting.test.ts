import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRawDifferencePercent, formatRawQar } from '../../src/components/business/materialityFormatting';

test('materiality raw calculation displays fractional minor units without losing precision', () => {
  assert.equal(formatRawQar('1000000', '10000'), 'QAR 1.00');
  assert.equal(formatRawQar('100005', '10000'), 'QAR 0.100005');
  assert.equal(formatRawQar('1234567890000', '10000'), 'QAR 1,234,567.89');
});

test('materiality variance stays on the original raw basis and includes signed five-percent boundaries', () => {
  assert.equal(formatRawDifferencePercent('1000000', '1', '1050000'), '+5.0000%');
  assert.equal(formatRawDifferencePercent('1000000', '1', '950000'), '-5.0000%');
  assert.equal(formatRawDifferencePercent('1000000', '1', '1000000'), '0.0000%');
  assert.equal(formatRawDifferencePercent('1000000', '1', '1050001'), '+5.0001%');
});

test('materiality raw formatting rejects invalid denominators and reports undefined variance bases', () => {
  assert.equal(formatRawQar('100', '0'), 'Unavailable');
  assert.equal(formatRawDifferencePercent('0', '10000', '0'), 'Unavailable');
});
