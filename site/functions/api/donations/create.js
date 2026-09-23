import {
  MAX_AMOUNT, MIN_AMOUNT, createSnapTransaction, donationPayload, formatIdr, json, parseAmount,
} from '../../../lib/midtrans.js';

// POST /api/donations/create {amount}: creates a Snap transaction and returns its token.
// Nothing is stored; Midtrans' dashboard is the record of donations.
export async function onRequestPost({ request, env }) {
  if (!env.MIDTRANS_SERVER_KEY) return json(503, { error: 'Pembayaran belum dikonfigurasi' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  const amount = parseAmount(body?.amount);
  if (amount === null) return json(400, { error: 'Nominal tidak valid' });
  if (amount < MIN_AMOUNT) return json(400, { error: `Nominal minimal ${formatIdr(MIN_AMOUNT)}` });
  if (amount > MAX_AMOUNT) return json(400, { error: 'Nominal terlalu besar' });

  const payload = donationPayload(amount, env);
  try {
    const snap = await createSnapTransaction(payload, env);
    return json(200, { token: snap.token, order_id: payload.transaction_details.order_id, amount });
  } catch (err) {
    return json(502, { error: err.message });
  }
}
