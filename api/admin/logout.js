// POST /api/admin/logout  →  清 session
const store = require('../../lib/store');
const auth = require('../../lib/auth');

async function handler(req, res) {
  const token = auth.readToken(req.headers.cookie);
  if (token) await store.deleteSession(token);
  res.setHeader('Set-Cookie', 'admin_token=; Path=/; Max-Age=0');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
}
module.exports = handler;
