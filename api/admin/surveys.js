// GET  /api/admin/surveys                  →  全量列表
// DELETE /api/admin/surveys?id=xxx         →  删单条
// DELETE /api/admin/surveys?confirm=all    →  全清
const store = require('../../lib/store');
const auth = require('../../lib/auth');

async function handler(req, res) {
  const r = await auth.requireAuth(req.headers.cookie);
  if (!r.ok) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'unauthorized' })); }

  // Vercel Serverless query params 在 req.query
  const q = req.query || {};
  const method = (req.method || 'GET').toUpperCase();

  // DELETE 单条
  if (method === 'DELETE' && q.id) {
    const info = await store.deleteSurvey(q.id);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(info));
  }
  // DELETE 全清（需 confirm=all 保护）
  if (method === 'DELETE' && q.confirm === 'all') {
    const n = await store.clearAllSurveys();
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ cleared: n }));
  }
  // GET 列表
  if (method === 'GET') {
    const db = await store.getAllSurveys();
    const list = db.surveys.slice().reverse(); // 新→旧
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ total: list.length, surveys: list }));
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'method not allowed' }));
}
module.exports = handler;
