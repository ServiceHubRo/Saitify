/* global process, URL, URLSearchParams, console */
// A small stand-in for Stripe's HTTP API, used ONLY by the end-to-end tests. The application talks to it through the real
// Stripe SDK, so request building and response parsing are exercised for real; only the remote service is replaced.
// It never runs in production and is never imported by application code.
import http from 'node:http';

const PORT = Number(process.env.STRIPE_MOCK_PORT || 3199);
const subs = new Map();
const calls = [];
const customers = new Map(); // email -> customer id
let n = 0;

const form = (body) => {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
};
const json = (res, status, obj) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};
const subObject = (s) => ({
  id: s.id, object: 'subscription', status: s.status, customer: s.customer, cancel_at_period_end: s.cancel_at_period_end, canceled_at: s.status === 'canceled' ? Math.floor(Date.now() / 1000) : null,
  items: { object: 'list', data: [{ id: 'si_mock', object: 'subscription_item', price: { id: s.price }, current_period_start: s.start, current_period_end: s.end }] },
  current_period_start: s.start, current_period_end: s.end, trial_end: null,
});

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const b = form(raw);
    calls.push({ method: req.method, path: p, body: b, auth: req.headers.authorization ? 'present' : 'missing', idem: req.headers['idempotency-key'] ?? null });
    if (p === '/__customer') return json(res, 200, { id: customers.get(url.searchParams.get('email')) ?? null });
    if (p === '/__calls') return json(res, 200, calls);
    if (p === '/__reset') { calls.length = 0; return json(res, 200, {}); }
    if (p === '/__sub' && req.method === 'POST') { const s = JSON.parse(raw); subs.set(s.id, s); return json(res, 200, {}); }
    if (p === '/v1/customers' && req.method === 'POST') {
      const id = `cus_mock_${++n}_${(b['metadata[user_id]'] || '').slice(0, 6)}`;
      customers.set(b.email, id);
      return json(res, 200, { id, object: 'customer', email: b.email });
    }
    if (p === '/v1/checkout/sessions' && req.method === 'POST') return json(res, 200, { id: `cs_mock_${++n}`, object: 'checkout.session', url: b.success_url });
    if (p === '/v1/billing_portal/sessions' && req.method === 'POST') return json(res, 200, { id: `bps_mock_${++n}`, object: 'billing_portal.session', url: `${b.return_url}?portal=1` });
    const price = p.match(/^\/v1\/prices\/(.+)$/);
    if (price && req.method === 'GET') {
      const id = price[1];
      if (id.includes('missing')) return json(res, 404, { error: { type: 'invalid_request_error', message: 'No such price' } });
      const year = id.includes('_y');
      return json(res, 200, { id, object: 'price', active: !id.includes('archived'), currency: 'eur', unit_amount: year ? 19000 : 1900, product: 'prod_e2emock', recurring: { interval: year ? 'year' : 'month', interval_count: 1 } });
    }
    const sub = p.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (sub) {
      const s = subs.get(sub[1]);
      if (!s) return json(res, 404, { error: { type: 'invalid_request_error', message: 'No such subscription' } });
      if (req.method === 'POST') {
        if (b['items[0][price]']) s.price = b['items[0][price]'];
        if (b.cancel_at_period_end !== undefined) s.cancel_at_period_end = b.cancel_at_period_end === 'true';
      }
      if (req.method === 'DELETE') s.status = 'canceled';
      return json(res, 200, subObject(s));
    }
    json(res, 404, { error: { type: 'invalid_request_error', message: `mock: no route ${req.method} ${p}` } });
  });
}).listen(PORT, '127.0.0.1', () => console.log(`stripe mock on ${PORT}`));
