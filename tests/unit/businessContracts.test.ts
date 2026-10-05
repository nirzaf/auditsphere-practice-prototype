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

  it('accepts implemented strict directory and commercial command families only', () => {
    assert.deepEqual(parseBusinessCommandEnvelope({
      actor: { persona: 'APPROVER', actorId: '00000000-0000-4000-8000-000000000010' },
      context: {}, expectedVersions: [],
      command: { type: 'actor-profile.assign', payload: { persona: 'APPROVER', staffMemberId: '00000000-0000-4000-8000-000000000001' } }
    }, 'test-key-0001').command.type, 'actor-profile.assign');
    assert.equal(parseBusinessCommandEnvelope({
      actor: { persona: 'PREPARER', actorId: '00000000-0000-4000-8000-000000000010' },
      context: {}, expectedVersions: [],
      command: { type: 'lead.create', payload: {
        clientId: '00000000-0000-4000-8000-000000000001',
        primaryContactId: '00000000-0000-4000-8000-000000000002',
        source: 'REFERRAL', receivedAt: '2026-10-05T09:00:00Z', requestedService: 'STATUTORY_AUDIT',
        periodStart: '2026-01-01', periodEnd: '2026-12-31', estimatedFeeMinor: '100000'
      } }
    }, 'test-key-0004').command.type, 'lead.create');
    assert.throws(() => parseBusinessCommandEnvelope({
      actor: { persona: 'APPROVER', actorId: '00000000-0000-4000-8000-000000000010' },
      context: {}, expectedVersions: [],
      command: { type: 'staff.create', payload: { displayName: 'Aisha', naturalPersonKey: 'P1', grade: 'PARTNER', isSuperuser: true } }
    }, 'test-key-0002'), /invalid/i);
    assert.throws(() => parseBusinessCommandEnvelope({
      actor: { persona: 'APPROVER', actorId: '00000000-0000-4000-8000-000000000010' },
      context: {}, expectedVersions: [],
      command: { type: 'workspace.status.set', payload: { state: 'PARTNER_APPROVAL' } }
    }, 'test-key-0003'), /invalid/i);
  });
});
