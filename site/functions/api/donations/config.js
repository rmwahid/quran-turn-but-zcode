import { MIN_AMOUNT, isProduction, json, snapScriptUrl } from '../../../lib/midtrans.js';

// GET /api/donations/config: the public client key Snap needs. Never the server key.
export function onRequestGet({ env }) {
  if (!env.MIDTRANS_CLIENT_KEY || !env.MIDTRANS_SERVER_KEY) return json(200, { enabled: false });
  return json(200, {
    enabled: true,
    client_key: env.MIDTRANS_CLIENT_KEY,
    is_production: isProduction(env),
    snap_script_url: snapScriptUrl(env),
    min_amount: MIN_AMOUNT,
  });
}
