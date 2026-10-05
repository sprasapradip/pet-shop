import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

export const esewaSign = (message: string, secret = env.ESEWA_SECRET_KEY) =>
  createHmac('sha256', secret).update(message).digest('base64');

export function buildEsewaForm(transactionUuid: string, amountRupees: string) {
  const fields = {
    amount: amountRupees,
    tax_amount: '0',
    total_amount: amountRupees,
    transaction_uuid: transactionUuid,
    product_code: env.ESEWA_PRODUCT_CODE,
    product_service_charge: '0',
    product_delivery_charge: '0',
    success_url: `${env.APP_URL}/payments/esewa/success`,
    failure_url: `${env.APP_URL}/payments/esewa/failure?tx=${encodeURIComponent(transactionUuid)}`,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
  };
  const signature = esewaSign(
    `total_amount=${fields.total_amount},transaction_uuid=${fields.transaction_uuid},product_code=${fields.product_code}`,
  );
  return { action: env.ESEWA_FORM_URL, fields: { ...fields, signature } };
}

export interface EsewaCallbackPayload {
  transaction_code?: string;
  status?: string;
  total_amount?: string;
  transaction_uuid?: string;
  product_code?: string;
  signed_field_names?: string;
  signature?: string;
  [k: string]: string | undefined;
}

/** Decodes the base64 `data` param eSewa sends to success_url and checks its HMAC signature. */
export function decodeEsewaCallback(encoded: string, secret = env.ESEWA_SECRET_KEY): EsewaCallbackPayload {
  let payload: EsewaCallbackPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as EsewaCallbackPayload;
  } catch {
    throw new Error('eSewa payload is not valid base64 JSON');
  }
  if (!payload.signed_field_names) throw new Error('eSewa payload missing signed_field_names');
  const message = payload.signed_field_names
    .split(',')
    .map((f) => `${f}=${payload[f] ?? ''}`)
    .join(',');
  const expected = Buffer.from(esewaSign(message, secret));
  const received = Buffer.from(payload.signature ?? '');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error('eSewa signature mismatch');
  }
  return payload;
}

/** Verifies the callback signature, then confirms with the eSewa status API. Never trust the query string alone. */
export async function verifyEsewaCallback(encoded: string) {
  const payload = decodeEsewaCallback(encoded);

  const url = new URL(env.ESEWA_STATUS_URL);
  url.searchParams.set('product_code', env.ESEWA_PRODUCT_CODE);
  url.searchParams.set('total_amount', payload.total_amount!);
  url.searchParams.set('transaction_uuid', payload.transaction_uuid!);
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const status = (await res.json()) as { status: string; ref_id?: string; total_amount?: number | string };

  return {
    ok: status.status === 'COMPLETE',
    transactionUuid: payload.transaction_uuid!,
    refId: status.ref_id ?? payload.transaction_code,
    amountRupees: Number(status.total_amount ?? payload.total_amount),
    payload: { callback: payload, status },
  };
}
