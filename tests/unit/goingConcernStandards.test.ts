import assert from 'node:assert/strict';
import { it } from 'node:test';
import { isIsa570EditionCompatible } from '../../worker/businessFieldwork.js';

it('applies ISA 570 Revised 2024 by engagement period start, not the current date', () => {
  assert.equal(isIsa570EditionCompatible('2026-12-14', 'ISA 570 Revised 2019'), true,
    'the preceding day remains compatible with the approved older-period profile');
  assert.equal(isIsa570EditionCompatible('2026-12-15', 'ISA 570 Revised 2019'), false,
    'the effective date requires the Revised 2024 profile');
  assert.equal(isIsa570EditionCompatible('2027-01-01', 'ISA 570 Revised 2024'), true,
    'a 2027 period accepts the approved Revised 2024 profile');
  assert.equal(isIsa570EditionCompatible('2027-01-01', 'ISA 570 Revised 2024 (Qatar)'), true,
    'profile display detail does not change edition recognition');
});
