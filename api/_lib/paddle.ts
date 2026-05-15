import { createHmac, timingSafeEqual } from 'node:crypto';

export type PaddlePlan = 'pro_monthly' | 'pro_yearly';

export type PaddleWebhookEvent = {
  event_id?: string;
  event_type: string;
  data: Record<string, any>;
};

const API_BASE_URL = process.env.PADDLE_ENV === 'sandbox'
  ? 'https://sandbox-api.paddle.com'
  : 'https://api.paddle.com';

export function getPaddleApiKey() {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing PADDLE_API_KEY.');
  }

  return apiKey;
}

export function planFromPaddlePrice(priceId?: string | null): PaddlePlan | null {
  if (!priceId) {
    return null;
  }

  if (priceId === (process.env.PADDLE_YEARLY_PRICE_ID || process.env.VITE_PADDLE_YEARLY_PRICE_ID)) {
    return 'pro_yearly';
  }

  if (priceId === (process.env.PADDLE_MONTHLY_PRICE_ID || process.env.VITE_PADDLE_MONTHLY_PRICE_ID)) {
    return 'pro_monthly';
  }

  return null;
}

export function verifyPaddleWebhook(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET || process.env.PADDLE_WEBHOOK_SECRET_KEY;
  if (!secret) {
    throw new Error('Missing PADDLE_WEBHOOK_SECRET.');
  }

  if (!signatureHeader) {
    throw new Error('Missing Paddle-Signature header.');
  }

  const values = new Map<string, string[]>();
  signatureHeader.split(';').forEach((part) => {
    const [key, value] = part.split('=');
    if (!key || !value) return;
    values.set(key, [...(values.get(key) || []), value]);
  });

  const timestamp = values.get('ts')?.[0];
  const signatures = values.get('h1') || [];
  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid Paddle-Signature header.');
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) {
    throw new Error('Invalid Paddle webhook timestamp.');
  }

  const fiveMinutesMs = 5 * 60 * 1000;
  if (Math.abs(Date.now() - timestampMs) > fiveMinutesMs) {
    throw new Error('Expired Paddle webhook timestamp.');
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}:${rawBody}`, 'utf8')
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  const isValid = signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature, 'hex');
    return signatureBuffer.length === expectedBuffer.length
      && timingSafeEqual(signatureBuffer, expectedBuffer);
  });

  if (!isValid) {
    throw new Error('Invalid Paddle webhook signature.');
  }
}

export async function createPaddlePortalSession(customerId: string) {
  const response = await fetch(`${API_BASE_URL}/customers/${customerId}/portal-sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getPaddleApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.detail || payload?.error?.message || 'Failed to create Paddle portal session.');
  }

  const url = payload?.data?.urls?.general?.overview;
  if (!url) {
    throw new Error('Paddle portal session response did not include an overview URL.');
  }

  return url as string;
}
