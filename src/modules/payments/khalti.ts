import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

const headers = () => ({ Authorization: `Key ${env.KHALTI_SECRET_KEY}`, 'Content-Type': 'application/json' });

export interface KhaltiInitiateInput {
  purchaseOrderId: string;
  purchaseOrderName: string;
  amountPaisa: number;
  customer: { name: string; phone: string; email?: string | null };
}

/** KPG-2 initiate: returns the hosted payment URL and pidx. Amount is in paisa. */
export async function initiateKhalti(input: KhaltiInitiateInput) {
  const res = await fetch(`${env.KHALTI_BASE_URL}/epayment/initiate/`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      return_url: `${env.APP_URL}/payments/khalti/return`,
      website_url: env.APP_URL,
      amount: input.amountPaisa,
      purchase_order_id: input.purchaseOrderId,
      purchase_order_name: input.purchaseOrderName.slice(0, 100),
      customer_info: { name: input.customer.name, phone: input.customer.phone, email: input.customer.email ?? undefined },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { pidx?: string; payment_url?: string; detail?: string };
  if (!res.ok || !body.pidx || !body.payment_url) {
    throw new AppError(502, 'gateway_error', 'Khalti is not reachable right now. Please try another payment method.', body);
  }
  return { pidx: body.pidx, paymentUrl: body.payment_url };
}

export interface KhaltiLookup {
  pidx: string;
  total_amount: number;
  status: 'Completed' | 'Pending' | 'Initiated' | 'Refunded' | 'Expired' | 'User canceled' | string;
  transaction_id: string | null;
}

export async function lookupKhalti(pidx: string): Promise<KhaltiLookup> {
  const res = await fetch(`${env.KHALTI_BASE_URL}/epayment/lookup/`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ pidx }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as KhaltiLookup;
  if (!res.ok && !body.status) throw new AppError(502, 'gateway_error', 'Could not verify the Khalti payment');
  return body;
}
