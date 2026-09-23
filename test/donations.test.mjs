import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import config from '../site/api/donations/config.js';
import create from '../site/api/donations/create.js';
import { donationPayload } from '../site/api/_midtrans.js';

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (b) => { res.body = JSON.parse(b); };
  return res;
}

const ENV = ['MIDTRANS_SERVER_KEY', 'MIDTRANS_CLIENT_KEY', 'MIDTRANS_IS_PRODUCTION', 'SITE_URL'];
afterEach(() => { for (const k of ENV) delete process.env[k]; });

describe('donations API (quran-turn.org)', () => {
  test('config is disabled without keys and never exposes the server key', () => {
    let res = mockRes();
    config({ method: 'GET' }, res);
    assert.deepEqual(res.body, { enabled: false });

    process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-SECRET';
    process.env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-public';
    process.env.MIDTRANS_IS_PRODUCTION = 'false';
    res = mockRes();
    config({ method: 'GET' }, res);
    assert.equal(res.body.enabled, true);
    assert.equal(res.body.client_key, 'SB-Mid-client-public');
    assert.equal(res.body.snap_script_url, 'https://app.sandbox.midtrans.com/snap/snap.js');
    assert.ok(!JSON.stringify(res.body).includes('SECRET'));
  });

  test('create validates the amount before calling Midtrans', async () => {
    process.env.MIDTRANS_SERVER_KEY = 'k';
    const never = () => { throw new Error('should not call Midtrans'); };
    for (const [amount, status] of [[4999, 400], ['abc', 400], [10_000_001, 400]]) {
      const res = mockRes();
      await create({ method: 'POST', body: { amount } }, res, { fetchImpl: never });
      assert.equal(res.statusCode, status, String(amount));
    }
    const res = mockRes();
    await create({ method: 'GET' }, res);
    assert.equal(res.statusCode, 405);
  });

  test('create returns 503 when payments are not configured', async () => {
    const res = mockRes();
    await create({ method: 'POST', body: { amount: 10000 } }, res);
    assert.equal(res.statusCode, 503);
  });

  test('create sends a Snap transaction with Basic auth and returns only the token', async () => {
    process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-SECRET';
    process.env.MIDTRANS_IS_PRODUCTION = 'false';
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url, init, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ token: 'tok_123', redirect_url: 'https://x' }) };
    };
    const res = mockRes();
    await create({ method: 'POST', body: JSON.stringify({ amount: '25.000' }) }, res, { fetchImpl });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.token, 'tok_123');
    assert.equal(res.body.amount, 25000);
    assert.equal(seen.url, 'https://app.sandbox.midtrans.com/snap/v1/transactions');
    assert.equal(seen.init.headers.Authorization, `Basic ${Buffer.from('SB-Mid-server-SECRET:').toString('base64')}`);
    assert.equal(seen.body.transaction_details.gross_amount, 25000);
    assert.match(seen.body.transaction_details.order_id, /^QT-SDKH-\d+-[0-9a-f]+$/);
    assert.equal(seen.body.callbacks.finish, 'https://quran-turn.org/?sedekah=success');
    assert.ok(!JSON.stringify(res.body).includes('SECRET'));
  });

  test('Midtrans errors surface as 502 with its message', async () => {
    process.env.MIDTRANS_SERVER_KEY = 'k';
    const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error_messages: ['Access denied'] }) });
    const res = mockRes();
    await create({ method: 'POST', body: { amount: 5000 } }, res, { fetchImpl });
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'Access denied');
  });

  test('finish callback only ever points at SITE_URL', () => {
    process.env.SITE_URL = 'https://preview.quran-turn.org/';
    assert.equal(donationPayload(5000).callbacks.finish, 'https://preview.quran-turn.org/?sedekah=success');
  });
});
