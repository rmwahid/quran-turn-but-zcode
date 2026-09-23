// Thin Midtrans Snap helper for quran.allrize.tech (ported from lpdp_univ/api/midtrans.py).
// Runs on Cloudflare Pages Functions. Keys live only in the Pages project's settings:
//   MIDTRANS_SERVER_KEY (secret), MIDTRANS_CLIENT_KEY, MIDTRANS_IS_PRODUCTION (default "true"), SITE_URL
// This file sits outside public/, so it is bundled into the functions and never served.

export const MIN_AMOUNT = 5000;
export const MAX_AMOUNT = 10_000_000;

export const isProduction = (env) =>
  ['1', 'true', 'yes'].includes(String(env.MIDTRANS_IS_PRODUCTION ?? 'true').toLowerCase());

const snapBase = (env) => (isProduction(env) ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com');
export const snapScriptUrl = (env) => `${snapBase(env)}/snap/snap.js`;
export const siteUrl = (env) => (env.SITE_URL || 'https://quran.allrize.tech').replace(/\/$/, '');

export function parseAmount(value) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isInteger(n) ? n : null;
}

export const formatIdr = (n) => `Rp${n.toLocaleString('id-ID')}`;

export function donationPayload(amount, env, { now = Date.now(), rand = crypto.randomUUID().slice(0, 8) } = {}) {
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
    callbacks: { finish: `${siteUrl(env)}/?sedekah=success` },
  };
}

export async function createSnapTransaction(payload, env, fetchImpl = fetch) {
  const key = env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error('MIDTRANS_SERVER_KEY is missing');
  const res = await fetchImpl(`${snapBase(env)}/snap/v1/transactions`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${key}:`)}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error_messages || []).join(', ') || data.status_message || `Midtrans HTTP ${res.status}`;
    throw new Error(msg);
  }
  return { token: data.token, redirect_url: data.redirect_url };
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
