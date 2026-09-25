// ============================================================
// server.js · 问卷本地开发入口（Express）
// 数据层复用 lib/store.js，本地用 surveys.json，部署 Vercel 自动切 KV
// ============================================================

const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const store = require('./lib/store');
const auth = require('./lib/auth');

const PORT = process.env.PORT || 3000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;  // 8 小时
console.log('[STORE] 当前存储后端:', store.USE_KV ? 'Vercel KV' : 'local JSON');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(__dirname)); // 问卷前端 / admin 页都静态提供

// Express 版 auth 中间件
async function requireAuth(req, res, next) {
  const r = await auth.requireAuth(req.cookies);
  if (!r.ok) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function generateLotteryId() {
  const now = new Date();
  const d = `${now.getMonth()+1}${now.getDate()}`.padStart(4, '0');
  return `Q${d}-${Math.floor(Math.random()*900000+100000)}`;
}

// ============================================================
// 受访者提交
// ============================================================
app.post('/api/survey/submit', async (req, res) => {
  const payload = req.body;
  if (!payload || !payload.meta || !payload.answers) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  if (!payload.meta.lotteryId) payload.meta.lotteryId = generateLotteryId();
  payload.meta.submittedAt = payload.meta.submittedAt || Date.now();

  const db = await store.appendSurvey({
    id: crypto.randomUUID(),
    lotteryId: payload.meta.lotteryId,
    meta: payload.meta,
    answers: payload.answers,
    createdAt: Date.now(),
  });
  const saved = db.surveys[db.surveys.length - 1];
  console.log(`[SUBMIT] ${saved.lotteryId} | branch=${saved.meta.branch} | attenFailed=${saved.meta.attenCheckFailed} | n=${db.surveys.length}`);
  res.json({ code: 0, data: { surveyId: saved.id, lotteryId: saved.lotteryId } });
});

// ============================================================
// Admin 鉴权
// ============================================================
app.post('/api/admin/login', async (req, res) => {
  const pw = (req.body && req.body.password) || '';
  if (pw !== auth.ADMIN_PASSWORD) return res.status(401).json({ error: '密码错误' });
  const token = auth.makeToken();
  await store.setSession(token, Date.now());
  res.cookie('admin_token', token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_TTL_MS });
  res.json({ ok: true });
});

app.post('/api/admin/logout', async (req, res) => {
  const token = req.cookies && req.cookies.admin_token;
  if (token) await store.deleteSession(token);
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

app.get('/api/admin/me', async (req, res) => {
  const r = await auth.requireAuth(req.cookies);
  res.json({ authenticated: r.ok });
});

// ============================================================
// Admin 数据接口
// ============================================================
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  const db = await store.getAllSurveys();
  const surveys = db.surveys;
  const total = surveys.length;
  if (total === 0) return res.json({ total: 0 });

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
  res.json({
    total, attenFailed, attenRate: +(attenFailed/total).toFixed(3),
    branchA, branchB, avgDur: Math.round(durSum/total),
    dayCounts, latest: surveys[surveys.length-1],
  });
});

app.get('/api/admin/surveys', requireAuth, async (req, res) => {
  const db = await store.getAllSurveys();
  res.json({ total: db.surveys.length, surveys: db.surveys.slice().reverse() });
});

app.get('/api/admin/export', requireAuth, async (req, res) => {
  const fmt = req.query.format || 'csv';
  const db = await store.getAllSurveys();
  const surveys = db.surveys;

  if (fmt === 'json') {
    const filename = `surveys_${new Date().toISOString().slice(0,10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(db, null, 2));
  }

  const allQids = new Set();
  for (const s of surveys) for (const k of Object.keys(s.answers || {})) allQids.add(k);
  const qidList = Array.from(allQids).sort();
  const header = ['lotteryId', 'createdAt', 'branch', 'attenFailed', 'durationSec', ...qidList];
  const rows = surveys.map(s => {
    const row = [
      s.lotteryId,
      new Date(s.createdAt).toISOString().slice(0,19).replace('T',' '),
      s.meta.branch || '', s.meta.attenCheckFailed || 0, s.meta.durationSec || '',
    ];
    for (const qid of qidList) {
      const a = (s.answers || {})[qid];
      let v = '';
      if (!a) v = '';
      else if (Array.isArray(a.value)) v = a.value.join('|') + (a.other ? `|OTHER:${a.other}` : '');
      else if (a.value !== undefined && a.value !== null) v = String(a.value);
      row.push(csvEscape(v));
    }
    return row;
  });
  const csv = '\ufeff' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  const filename = `surveys_${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

app.delete('/api/admin/surveys', requireAuth, async (req, res) => {
  if (req.query.confirm === 'all') {
    const n = await store.clearAllSurveys();
    return res.json({ cleared: n });
  }
  const id = req.query.id;
  if (id) {
    const info = await store.deleteSurvey(id);
    return res.json(info);
  }
  res.status(400).json({ error: '需要 ?id=xxx 或 ?confirm=all' });
});

function csvEscape(s) {
  if (s === undefined || s === null) return '';
  s = String(s);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ============================================================
// 启动
// ============================================================
app.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   正大杯问卷后端 已启动                        ║');
  console.log('╠═══════════════════════════════════════════════╣');
  console.log('║   问卷:  http://localhost:' + PORT + '/                    ║');
  console.log('║   Admin: http://localhost:' + PORT + '/admin.html         ║');
  console.log('║   密码:  ' + auth.ADMIN_PASSWORD.padEnd(38) + '║');
  console.log('╚═══════════════════════════════════════════════╝\n');
});
