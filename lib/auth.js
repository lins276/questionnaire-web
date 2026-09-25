// ============================================================
// lib/auth.js · admin session 校验
// Vercel Serverless 无 Express 中间件，这里提供 requireAuth 函数
// ============================================================
const store = require('./store');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zhengda2026';
const crypto = require('crypto');

function makeToken() { return crypto.randomBytes(16).toString('hex'); }

// 从 Vercel Serverless 的 cookies header 解析 admin_token
function readToken(cookiesHeader) {
  if (!cookiesHeader) return null;
  const match = cookiesHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('admin_token='));
  return match ? match.split('=')[1] : null;
}

// 返回 { ok: true, session } 或 { ok: false, status: 401 }
async function requireAuth(cookiesHeader) {
  const token = readToken(cookiesHeader);
  const sess = token ? await store.getSession(token) : null;
  if (!sess) return { ok: false, status: 401 };
  return { ok: true, token, session: sess };
}

module.exports = { ADMIN_PASSWORD, makeToken, readToken, requireAuth };
