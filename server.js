// BANA <-> Nia-Hub secure backend proxy.
//
// WHY THIS EXISTS:
//   The Nia-Hub API secret can sign withdrawals/orders, so it must NEVER reach
//   the browser. This Express server holds the key/secret (from .env), signs
//   every request, and exposes only safe routes to the frontend.
//
//   Browser  ->  this server (holds secret)  ->  https://api.niawallet.com
//
// Auth scheme (from the Nia-Hub SPOT B2B docs):
//   headers: X-Nia-Tenant-Key, X-Nia-Signature, X-Nia-Timestamp, X-Nia-Nonce
//   payload = timestamp + nonce + METHOD + path + (bodyString | queryString)
//   signature = HMAC_SHA256(secret, payload) as hex

import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  NIA_API_KEY = '',
  NIA_API_SECRET = '',
  NIA_BROKER_ID = '',
  NIA_BASE_URL = 'https://api.niawallet.com',
  NIA_DEFAULT_USER_ID = '',
  NIA_WEBHOOK_SECRET = '',
  PORT = 8787,
} = process.env;

const isConfigured = () => Boolean(NIA_API_KEY && NIA_API_SECRET);

// --- Signing ----------------------------------------------------------------

function buildHeaders(method, requestPath, signedBodyOrQuery) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${timestamp}${nonce}${method}${requestPath}${signedBodyOrQuery}`;
  const signature = crypto
    .createHmac('sha256', NIA_API_SECRET)
    .update(payload)
    .digest('hex');

  const headers = {
    'X-Nia-Tenant-Key': NIA_API_KEY,
    'X-Nia-Signature': signature,
    'X-Nia-Timestamp': timestamp,
    'X-Nia-Nonce': nonce,
    'Content-Type': 'application/json',
  };
  // Broker/Tenant ID — sent as an extra header (headers aren't signed, so this
  // is harmless if Nia-Hub ignores it). Adjust the header name if their docs differ.
  if (NIA_BROKER_ID) headers['X-Nia-Tenant-Id'] = NIA_BROKER_ID;
  return headers;
}

/**
 * Make a signed call to Nia-Hub.
 * @param {string} method  HTTP verb
 * @param {string} apiPath e.g. "/api/v1/orders" (no query string)
 * @param {object} opts    { query?: object, body?: object }
 */
async function niaRequest(method, apiPath, { query, body } = {}) {
  if (!isConfigured()) {
    const err = new Error('Nia-Hub API credentials are not configured on the server.');
    err.status = 503;
    throw err;
  }

  let url = `${NIA_BASE_URL}${apiPath}`;
  let signedPart = '';
  const fetchOpts = { method, headers: {} };

  if (method === 'GET' || method === 'DELETE') {
    // Drop undefined/null/empty params — otherwise URLSearchParams emits
    // "symbol=undefined", which breaks Nia-Hub's signature canonicalization.
    const clean = {};
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') clean[k] = v;
      }
    }
    const qs = new URLSearchParams(clean).toString();
    // Nia-Hub signs the query string WITH its leading "?" as part of the path.
    signedPart = qs ? `?${qs}` : '';
    if (qs) url += `?${qs}`;
    if (method === 'DELETE' && body) {
      // Some DELETE calls take a JSON body (cancel order) — sign the body instead.
      signedPart = JSON.stringify(body);
      fetchOpts.body = signedPart;
    }
  } else {
    signedPart = JSON.stringify(body || {});
    fetchOpts.body = signedPart;
  }

  fetchOpts.headers = buildHeaders(method, apiPath, signedPart);

  const res = await fetch(url, fetchOpts);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `Nia-Hub responded ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  // Unwrap Nia's {success|ok, data} envelope so the frontend gets clean data.
  if (data && typeof data === 'object' && 'data' in data && ('success' in data || 'ok' in data)) {
    return data.data;
  }
  return data;
}

// --- Wallet / Settlement / Options API signing ------------------------------
// This API family uses a DIFFERENT scheme than the trading API above:
//   headers : X-Api-Key, X-Timestamp, X-Nonce, X-Signature
//   payload : [timestamp, nonce, METHOD, /full/path?query, body].join('\n')
//   nonce   : UUID v4 ; timestamp tolerance ±60s
function buildWalletHeaders(method, fullPath, bodyStr) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  // NOTE: despite the docs showing "\n" separators, the live API verifies a
  // plain concatenation: timestamp + nonce + METHOD + /full/path?query + body.
  const signString = `${timestamp}${nonce}${method}${fullPath}${bodyStr}`;
  const signature = crypto.createHmac('sha256', NIA_API_SECRET).update(signString).digest('hex');
  return {
    'X-Api-Key': NIA_API_KEY,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': signature,
    'Content-Type': 'application/json',
  };
}

async function niaWalletRequest(method, apiPath, { query, body } = {}) {
  if (!isConfigured()) {
    const err = new Error('Nia-Hub API credentials are not configured on the server.');
    err.status = 503;
    throw err;
  }

  const clean = {};
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') clean[k] = v;
    }
  }
  const qs = new URLSearchParams(clean).toString();
  const fullPath = apiPath + (qs ? `?${qs}` : '');
  const bodyStr = method === 'GET' ? '' : JSON.stringify(body || {});

  const fetchOpts = { method, headers: buildWalletHeaders(method, fullPath, bodyStr) };
  if (method !== 'GET') fetchOpts.body = bodyStr;

  const res = await fetch(`${NIA_BASE_URL}${fullPath}`, fetchOpts);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok || data?.success === false) {
    const err = new Error(data?.message || data?.error || `Nia-Hub responded ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  if (data && typeof data === 'object' && 'data' in data && ('success' in data || 'ok' in data)) {
    return data.data;
  }
  return data;
}

// --- App --------------------------------------------------------------------

const app = express();
app.use(express.json());

// Resolve which user we're acting for (B2B = per end-user "userId").
const resolveUserId = (req) =>
  req.query.userId || req.body?.userId || NIA_DEFAULT_USER_ID;

const wrap = (handler) => async (req, res) => {
  try {
    const data = await handler(req, res);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message, details: e.data });
  }
};

// Health/status — safe: never returns the secret, only whether it's set.
app.get('/api/nia/status', (req, res) => {
  res.json({
    ok: true,
    configured: isConfigured(),
    baseUrl: NIA_BASE_URL,
    brokerId: NIA_BROKER_ID || null,
    hasDefaultUser: Boolean(NIA_DEFAULT_USER_ID),
    keyPreview: NIA_API_KEY ? `${NIA_API_KEY.slice(0, 4)}••••${NIA_API_KEY.slice(-4)}` : null,
  });
});

// Market info (public-ish, but still signed per B2B spec)
app.get('/api/nia/markets', wrap(() => niaRequest('GET', '/api/v1/markets')));

// Open & filled orders (history)
app.get('/api/nia/orders', wrap((req) =>
  niaRequest('GET', '/api/v1/orders', {
    query: { userId: resolveUserId(req), symbol: req.query.symbol, status: req.query.status },
  })
));

// Trades & fee receipts (history)
app.get('/api/nia/trades', wrap((req) =>
  niaRequest('GET', '/api/v1/trades', {
    query: { userId: resolveUserId(req), symbol: req.query.symbol, orderId: req.query.orderId },
  })
));

// Place order
app.post('/api/nia/orders', wrap((req) =>
  niaRequest('POST', '/api/v1/orders', {
    body: { ...req.body, userId: resolveUserId(req), engineType: 'SPOT' },
  })
));

// Cancel order
app.delete('/api/nia/orders', wrap((req) =>
  niaRequest('DELETE', '/api/v1/orders', {
    body: { ...req.body, userId: resolveUserId(req), engineType: 'SPOT' },
  })
));

// ---- Wallet & Assets (new API family) ----

// Wallet balances (SPOT / FUTURES / INSURANCE / BONUS)
app.get('/api/nia/balance', wrap((req) =>
  niaWalletRequest('GET', '/api/v1/wallets', {
    query: { userId: resolveUserId(req), walletType: req.query.walletType, currency: req.query.currency },
  })
));

// Wallet change history (deposits/withdraws/transfers/fees…)
app.get('/api/nia/wallet-history', wrap((req) =>
  niaWalletRequest('GET', '/api/v1/wallets/history', {
    query: {
      userId: resolveUserId(req), currency: req.query.currency, walletType: req.query.walletType,
      type: req.query.type, startTime: req.query.startTime, endTime: req.query.endTime,
      page: req.query.page, limit: req.query.limit,
    },
  })
));

// Deposit history
app.get('/api/nia/deposits', wrap((req) =>
  niaWalletRequest('GET', '/api/v1/deposits', {
    query: { userId: resolveUserId(req), currency: req.query.currency, page: req.query.page, limit: req.query.limit },
  })
));

// Withdrawal history
app.get('/api/nia/withdrawals', wrap((req) =>
  niaWalletRequest('GET', '/api/v1/withdrawals', {
    query: { userId: resolveUserId(req), currency: req.query.currency, page: req.query.page, limit: req.query.limit },
  })
));

// Request a withdrawal (deducts from SPOT wallet)
app.post('/api/nia/withdrawals', wrap((req) =>
  niaWalletRequest('POST', '/api/v1/withdrawals', {
    body: {
      userId: resolveUserId(req), currency: req.body.currency, network: req.body.network,
      amount: req.body.amount, toAddress: req.body.toAddress,
    },
  })
));

// Transfer between wallet types (e.g. SPOT -> FUTURES)
app.post('/api/nia/transfer', wrap((req) =>
  niaWalletRequest('POST', '/api/v1/wallets/transfer', {
    body: {
      userId: resolveUserId(req), currency: req.body.currency,
      fromType: req.body.fromType, toType: req.body.toType, amount: req.body.amount,
    },
  })
));

// ---- Settlement (broker/admin — filtered by API key, no userId needed) ----

// Accumulated commission not yet settled
app.get('/api/nia/settlement/unsettled', wrap(() =>
  niaWalletRequest('GET', '/api/v1/settlement/unsettled')
));

// Past settlement records for the broker
app.get('/api/nia/settlement/history', wrap((req) =>
  niaWalletRequest('GET', '/api/v1/settlement/history', {
    query: { startTime: req.query.startTime, endTime: req.query.endTime, page: req.query.page, limit: req.query.limit },
  })
));

// Webhook receiver — Nia-Hub pushes fills/liquidations/deposits here.
// (Stub: verifies optional shared-secret header, logs, ack. Wire real handling later.)
app.post('/api/nia/webhook', express.json(), (req, res) => {
  if (NIA_WEBHOOK_SECRET) {
    const provided = req.get('X-Nia-Webhook-Secret');
    if (provided !== NIA_WEBHOOK_SECRET) {
      return res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
    }
  }
  console.log('[nia webhook]', JSON.stringify(req.body).slice(0, 500));
  res.json({ ok: true });
});

// In production, serve the built frontend from /dist.
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => err && next());
});

app.listen(PORT, () => {
  console.log(`BANA backend on http://localhost:${PORT}`);
  console.log(`Nia-Hub: ${isConfigured() ? 'configured ✓' : 'NOT configured — set NIA_API_KEY/NIA_API_SECRET in .env'}`);
});
