// POST /api/admin/login  →  密码校验 + 下发 cookie
const store = require('../../lib/store');
const auth = require('../../lib/auth');

async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const pw = body.password || '';
  if (pw !== auth.ADMIN_PASSWORD) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: '密码错误' }));
  }
  const token = auth.makeToken();
  await store.setSession(token, Date.now());
  // httpOnly cookie（8h TTL）
  res.setHeader('Set-Cookie',
    `admin_token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${8*3600}`);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
}
module.exports = handler;
