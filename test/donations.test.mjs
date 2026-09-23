import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { onRequestGet as config } from '../site/functions/api/donations/config.js';
import { onRequestPost as create } from '../site/functions/api/donations/create.js';
import { donationPayload } from '../site/lib/midtrans.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const post = (body) =>
  new Request('https://quran.allrize.tech/api/donations/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('donations API (Cloudflare Pages Functions)', () => {
  test('config is disabled without keys and never exposes the server key', async () => {
    let res = config({ env: {} });
    assert.deepEqual(await res.json(), { enabled: false });

    const env = { MIDTRANS_SERVER_KEY: 'SB-Mid-server-SECRET', MIDTRANS_CLIENT_KEY: 'SB-Mid-client-public', MIDTRANS_IS_PRODUCTION: 'false' };
    res = config({ env });
    const body = await res.json();
    assert.equal(body.enabled, true);
    assert.equal(body.client_key, 'SB-Mid-client-public');
    assert.equal(body.snap_script_url, 'https://app.sandbox.midtrans.com/snap/snap.js');
    assert.ok(!JSON.stringify(body).includes('SECRET'));
  });

  test('create validates the amount before calling Midtrans', async () => {
    globalThis.fetch = () => { throw new Error('should not call Midtrans'); };
    const env = { MIDTRANS_SERVER_KEY: 'k' };
    for (const amount of [4999, 'abc', 10_000_001]) {
      const res = await create({ request: post({ amount }), env });
      assert.equal(res.status, 400, String(amount));
    }
    assert.equal((await create({ request: post('{nope'), env })).status, 400);
  });

  test('create returns 503 when payments are not configured', async () => {
    const res = await create({ request: post({ amount: 10000 }), env: {} });
    assert.equal(res.status, 503);
  });

  test('create sends a Snap transaction with Basic auth and returns only the token', async () => {
    let seen;
    globalThis.fetch = async (url, init) => {
      seen = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ token: 'tok_123', redirect_url: 'https://x' }), { status: 201 });
    };
    const env = { MIDTRANS_SERVER_KEY: 'SB-Mid-server-SECRET', MIDTRANS_IS_PRODUCTION: 'false' };
    const res = await create({ request: post({ amount: '25.000' }), env });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.token, 'tok_123');
    assert.equal(body.amount, 25000);
    assert.equal(seen.url, 'https://app.sandbox.midtrans.com/snap/v1/transactions');
    assert.equal(seen.init.headers.Authorization, `Basic ${btoa('SB-Mid-server-SECRET:')}`);
    assert.equal(seen.body.transaction_details.gross_amount, 25000);
    assert.match(seen.body.transaction_details.order_id, /^QT-SDKH-\d+-[0-9a-f]+$/);
    assert.equal(seen.body.callbacks.finish, 'https://quran.allrize.tech/?sedekah=success');
    assert.ok(!JSON.stringify(body).includes('SECRET'));
  });

  test('Midtrans errors surface as 502 with its message', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error_messages: ['Access denied'] }), { status: 401 });
    const res = await create({ request: post({ amount: 5000 }), env: { MIDTRANS_SERVER_KEY: 'k' } });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error, 'Access denied');
  });

  test('finish callback only ever points at SITE_URL', () => {
    assert.equal(donationPayload(5000, { SITE_URL: 'https://preview.quran-turn.pages.dev/' }).callbacks.finish,
      'https://preview.quran-turn.pages.dev/?sedekah=success');
  });
});
