import {
  MAX_AMOUNT, MIN_AMOUNT, createSnapTransaction, donationPayload, formatIdr, parseAmount, sendJson,
} from '../_midtrans.js';

// POST /api/donations/create {amount}: creates a Snap transaction and returns its token.
// Nothing is stored; Midtrans' dashboard is the record of donations.
export default async function handler(req, res, { fetchImpl } = {}) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!process.env.MIDTRANS_SERVER_KEY) return sendJson(res, 503, { error: 'Pembayaran belum dikonfigurasi' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
  }
  const amount = parseAmount(body?.amount);
  if (amount === null) return sendJson(res, 400, { error: 'Nominal tidak valid' });
  if (amount < MIN_AMOUNT) return sendJson(res, 400, { error: `Nominal minimal ${formatIdr(MIN_AMOUNT)}` });
  if (amount > MAX_AMOUNT) return sendJson(res, 400, { error: 'Nominal terlalu besar' });

  const payload = donationPayload(amount);
  try {
    const snap = await createSnapTransaction(payload, fetchImpl);
    return sendJson(res, 200, { token: snap.token, order_id: payload.transaction_details.order_id, amount });
  } catch (err) {
    return sendJson(res, 502, { error: err.message });
  }
}
