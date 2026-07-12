import { gs } from '../utils/settings';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * UddoktaPay integration — mirrors Laravel UddoktaPay.php.
 * Endpoints: {base}/checkout-v2 (create), {base}/verify-payment (verify).
 * Auth header: RT-UDDOKTAPAY-API-KEY.
 */

interface CreatePaymentInput {
  full_name: string;
  email: string;
  amount: number | string;
  metadata: Record<string, unknown>;
  redirect_url: string;
  cancel_url: string;
  webhook_url?: string;
}

export interface UddoktaVerifyResult {
  status: string; // 'COMPLETED' | 'PENDING' | ...
  amount?: string;
  invoice_id?: string;
  transaction_id?: string;
  payment_method?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

async function creds() {
  const s = await gs();
  const apiKey = (s.str('uddoktapay_api_key') || env.UDDOKTAPAY_API_KEY || '').trim();
  let baseUrl = (s.str('uddoktapay_api_url') || env.UDDOKTAPAY_BASE_URL || '').replace(
    /\/+$/,
    '',
  );
  // Endpoints are {domain}/api/checkout-v2 & /api/verify-payment. Accept the
  // URL with or without the trailing /api and normalize it.
  if (baseUrl && !/\/api$/i.test(baseUrl)) baseUrl += '/api';
  return { apiKey, baseUrl };
}

async function request<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const { apiKey, baseUrl } = await creds();
  if (!baseUrl || !apiKey) throw new Error('UddoktaPay is not configured.');

  const res = await fetch(baseUrl + endpoint, {
    method: 'POST',
    headers: {
      'RT-UDDOKTAPAY-API-KEY': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return json;
}

/** Create a hosted checkout; returns the payment_url to redirect the user to. */
export async function createPayment(data: CreatePaymentInput): Promise<string> {
  const response = await request<{ payment_url?: string; message?: string }>('/checkout-v2', {
    full_name: data.full_name,
    email: data.email,
    amount: String(data.amount),
    metadata: data.metadata,
    redirect_url: data.redirect_url,
    return_type: 'GET',
    cancel_url: data.cancel_url,
    webhook_url: data.webhook_url ?? data.redirect_url,
  });

  if (response.payment_url) return response.payment_url;
  throw new Error(response.message ?? 'UddoktaPay payment initialization failed.');
}

/** Verify a payment by invoice id. Throws unless status is COMPLETED. */
export async function verifyPayment(invoiceId: string): Promise<UddoktaVerifyResult> {
  const response = await request<UddoktaVerifyResult>('/verify-payment', {
    invoice_id: invoiceId,
  });
  logger.info(`UddoktaPay verify ${invoiceId}: ${response.status}`);
  if (response.status === 'COMPLETED') return response;
  throw new Error((response.message as string) ?? 'Payment verification failed.');
}
