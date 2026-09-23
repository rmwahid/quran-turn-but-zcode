// Thin Midtrans Snap helper for quran-turn.org (ported from lpdp_univ/api/midtrans.py).
// Keys come only from environment variables on the host (Vercel):
//   MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY, MIDTRANS_IS_PRODUCTION (default "true"), SITE_URL
// Files starting with "_" are not exposed as routes on Vercel.

export const MIN_AMOUNT = 5000;
export const MAX_AMOUNT = 10_000_000;

export const isProduction = () =>
  ['1', 'true', 'yes'].includes(String(process.env.MIDTRANS_IS_PRODUCTION ?? 'true').toLowerCase());

const snapBase = () => (isProduction() ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com');
export const snapScriptUrl = () => `${snapBase()}/snap/snap.js`;
export const siteUrl = () => (process.env.SITE_URL || 'https://quran-turn.org').replace(/\/$/, '');

export function parseAmount(value) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isInteger(n) ? n : null;
}

export const formatIdr = (n) => `Rp${n.toLocaleString('id-ID')}`;

export function donationPayload(amount, { now = Date.now(), rand = Math.random().toString(16).slice(2, 10) } = {}) {
  return {
    transaction_details: { order_id: `QT-SDKH-${Math.floor(now / 1000)}-${rand}`, gross_amount: amount },
    item_details: [{
      id: 'sedekah',
      price: amount,
      quantity: 1,
      name: 'Sedekah Quran Turn',
      category: 'Donation',
      merchant_name: 'Quran Turn',
    }],
    customer_details: { first_name: 'Supporter' },
    callbacks: { finish: `${siteUrl()}/?sedekah=success` },
  };
}

export async function createSnapTransaction(payload, fetchImpl = fetch) {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error('MIDTRANS_SERVER_KEY is missing');
  const res = await fetchImpl(`${snapBase()}/snap/v1/transactions`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error_messages || []).join(', ') || data.status_message || `Midtrans HTTP ${res.status}`;
    throw new Error(msg);
  }
  return { token: data.token, redirect_url: data.redirect_url };
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
