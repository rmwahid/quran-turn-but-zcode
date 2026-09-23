import { MIN_AMOUNT, isProduction, sendJson, snapScriptUrl } from '../_midtrans.js';

// GET /api/donations/config: the public client key Snap needs. Never the server key.
export default function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  if (!clientKey || !process.env.MIDTRANS_SERVER_KEY) return sendJson(res, 200, { enabled: false });
  return sendJson(res, 200, {
    enabled: true,
    client_key: clientKey,
    is_production: isProduction(),
    snap_script_url: snapScriptUrl(),
    min_amount: MIN_AMOUNT,
  });
}
