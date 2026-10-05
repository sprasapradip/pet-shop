import { describe, expect, it } from 'vitest';
import { buildEsewaForm, decodeEsewaCallback, esewaSign } from '../../src/modules/payments/esewa.js';

const TEST_SECRET = '8gBm/:&EnhH.1/q';

describe('eSewa ePay v2', () => {
  it('matches the HTML form example from the eSewa developer docs', () => {
    expect(esewaSign('total_amount=110,transaction_uuid=241028,product_code=EPAYTEST', TEST_SECRET)).toBe(
      'i94zsd3oXF6ZsSr/kGqT4sSzYQzjj1W/waxjWyRwaME=',
    );
  });

  it('builds a signed form', () => {
    const form = buildEsewaForm('O1-abc', '1500');
    expect(form.fields.total_amount).toBe('1500');
    expect(form.fields.signed_field_names).toBe('total_amount,transaction_uuid,product_code');
    expect(form.fields.signature).toBe(esewaSign(`total_amount=1500,transaction_uuid=O1-abc,product_code=${form.fields.product_code}`));
    expect(form.fields.failure_url).toContain('tx=O1-abc');
  });

  const callback = (overrides: Record<string, string> = {}) => {
    const payload: Record<string, string> = {
      transaction_code: '000AWEO',
      status: 'COMPLETE',
      total_amount: '1000.0',
      transaction_uuid: 'O5-xyz',
      product_code: 'EPAYTEST',
      signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
    };
    const message = payload.signed_field_names!.split(',').map((f) => `${f}=${payload[f]}`).join(',');
    payload.signature = esewaSign(message, TEST_SECRET);
    return Buffer.from(JSON.stringify({ ...payload, ...overrides })).toString('base64');
  };

  it('accepts a correctly signed callback', () => {
    const p = decodeEsewaCallback(callback(), TEST_SECRET);
    expect(p.transaction_uuid).toBe('O5-xyz');
  });

  it('rejects a tampered amount', () => {
    expect(() => decodeEsewaCallback(callback({ total_amount: '1.0' }), TEST_SECRET)).toThrow(/signature/);
  });

  it('rejects garbage', () => {
    expect(() => decodeEsewaCallback('!!!not-base64', TEST_SECRET)).toThrow();
  });
});
