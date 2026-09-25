// GET /api/admin/me  →  查当前是否登录
const auth = require('../../lib/auth');

async function handler(req, res) {
  const r = await auth.requireAuth(req.headers.cookie);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ authenticated: r.ok }));
}
module.exports = handler;
