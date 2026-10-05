import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBusinessBootstrapInput,
  parseBusinessCommandEnvelope
} from '../../worker/business.js';

describe('BUSINESS workspace and directory contracts', () => {
  it('normalizes the required QAR / Qatar bootstrap and partner details', () => {
    assert.deepEqual(parseBusinessBootstrapInput({
      name: '  STE Audit  ',
      currency: 'QAR',
      timezone: 'Asia/Qatar',
      initialPartner: {
        displayName: '  Aisha Partner  ',
        naturalPersonKey: ' PERSON-0001 ',
        email: '  AISHA@example.com '
      }
    }), {
      name: 'STE Audit',
      currency: 'QAR',
      timezone: 'Asia/Qatar',
      initialPartner: {
        displayName: 'Aisha Partner',
        naturalPersonKey: 'PERSON-0001',
        email: 'aisha@example.com'
      }
    });
  });

  it('rejects demo fields, unknown fields, and non-canonical workspace settings', () => {
    const valid = {
      name: 'STE Audit',
      currency: 'QAR',
      timezone: 'Asia/Qatar',
      initialPartner: { displayName: 'Aisha Partner', naturalPersonKey: 'PERSON-0001', email: 'aisha@example.com' }
    };
    assert.throws(() => parseBusinessBootstrapInput({ ...valid, seedId: 'commercial' }), /invalid/i);
    assert.throws(() => parseBusinessBootstrapInput({ ...valid, currency: 'USD' }), /invalid/i);
    assert.throws(() => parseBusinessBootstrapInput({ ...valid, initialPartner: { ...valid.initialPartner, extra: true } }), /invalid/i);
  });

  it('accepts only the implemented strict directory command families', () => {
    assert.deepEqual(parseBusinessCommandEnvelope({
      idempotencyKey: 'test-key-0001',
      command: { type: 'actor-profile.assign', payload: { persona: 'APPROVER', staffMemberId: '00000000-0000-4000-8000-000000000001' } }
    }).command.type, 'actor-profile.assign');
    assert.throws(() => parseBusinessCommandEnvelope({
      idempotencyKey: 'test-key-0002',
      command: { type: 'staff.create', payload: { displayName: 'Aisha', naturalPersonKey: 'P1', grade: 'PARTNER', isSuperuser: true } }
    }), /invalid/i);
    assert.throws(() => parseBusinessCommandEnvelope({
      idempotencyKey: 'test-key-0003',
      command: { type: 'workspace.status.set', payload: { state: 'PARTNER_APPROVAL' } }
    }), /invalid/i);
  });
});
