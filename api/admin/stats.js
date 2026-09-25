// GET /api/admin/stats  →  总体指标
const store = require('../../lib/store');
const auth = require('../../lib/auth');

async function handler(req, res) {
  const r = await auth.requireAuth(req.headers.cookie);
  if (!r.ok) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'unauthorized' })); }

  const db = await store.getAllSurveys();
  const surveys = db.surveys;
  const total = surveys.length;

  if (total === 0) {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ total: 0 }));
  }

  let attenFailed = 0, branchA = 0, branchB = 0, durSum = 0;
  const dayCounts = {};
  for (const s of surveys) {
    if ((s.meta.attenCheckFailed || 0) > 0) attenFailed++;
    if (s.meta.branch === 'A') branchA++;
    else if (s.meta.branch === 'B') branchB++;
    durSum += (s.meta.durationSec || 0);
    const d = new Date(s.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    dayCounts[key] = (dayCounts[key] || 0) + 1;
  }

  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    total, attenFailed, attenRate: +(attenFailed/total).toFixed(3),
    branchA, branchB, avgDur: Math.round(durSum/total),
    dayCounts,
    latest: surveys[surveys.length-1],
  }));
}
module.exports = handler;
