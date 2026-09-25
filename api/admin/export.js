// GET /api/admin/export?format=csv  或  ?format=json
const store = require('../../lib/store');
const auth = require('../../lib/auth');

function csvEscape(s) {
  if (s === undefined || s === null) return '';
  s = String(s);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function handler(req, res) {
  const r = await auth.requireAuth(req.headers.cookie);
  if (!r.ok) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'unauthorized' })); }

  const fmt = (req.query && req.query.format) || 'csv';
  const db = await store.getAllSurveys();
  const surveys = db.surveys;

  if (fmt === 'json') {
    const filename = `surveys_${new Date().toISOString().slice(0,10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.end(JSON.stringify(db, null, 2));
  }

  // 默认 CSV
  const allQids = new Set();
  for (const s of surveys) for (const k of Object.keys(s.answers || {})) allQids.add(k);
  const qidList = Array.from(allQids).sort();
  const header = ['lotteryId', 'createdAt', 'branch', 'attenFailed', 'durationSec', ...qidList];
  const rows = surveys.map(s => {
    const row = [
      s.lotteryId,
      new Date(s.createdAt).toISOString().slice(0,19).replace('T',' '),
      s.meta.branch || '',
      s.meta.attenCheckFailed || 0,
      s.meta.durationSec || '',
    ];
    for (const qid of qidList) {
      const a = (s.answers || {})[qid];
      let v = '';
      if (!a) v = '';
      else if (Array.isArray(a.value)) v = a.value.join('|') + (a.other ? `|OTHER:${a.other}` : '');
      else if (a.value !== undefined && a.value !== null) v = String(a.value);
      row.push(v);
    }
    return row.map(csvEscape);
  });
  const csv = '\ufeff' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  const filename = `surveys_${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.end(csv);
}
module.exports = handler;
