// ============================================================
// lib/store.js · 问卷数据存储层
// 自动检测环境：
//   - Vercel 运行时 → 用 Vercel KV REST API（零 npm 依赖）
//   - 本地开发     → fallback 到 surveys.json 文件
// 对外 API 对两者完全一致，server.js 和 api/*.js 共用同一套
// ============================================================

const fs = require('fs');
const path = require('path');

// ------ 环境检测 ------
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const USE_KV = !!(KV_URL && KV_TOKEN);

// KV Key 约定
const K_SURVEYS = 'surveys:list';
const K_SESSION_PREFIX = 'admin:sessions:';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 小时

// 本地 fallback 路径（server.js 运行时用 cwd，Serverless 用 /tmp）
const LOCAL_DB = process.env.LOCAL_DB_PATH || path.join(process.cwd(), 'surveys.json');
const LOCAL_SESSIONS = path.join(process.cwd(), '.admin_sessions.json');

// ============================================================
// KV REST 底层
// ============================================================
async function kvGet(key) {
  const url = `${KV_URL}/GET/${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.result; // { result: "..." }
}
async function kvSet(key, value) {
  const url = `${KV_URL}/SET/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Authorization: `Bearer ${KV_TOKEN}`,
    },
    body: value,
  });
  return res.ok;
}
async function kvDel(key) {
  const url = `${KV_URL}/DEL/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  return res.ok;
}

// ============================================================
// 本地 JSON 底层
// ============================================================
function localLoad() {
  try {
    if (!fs.existsSync(LOCAL_DB)) return { surveys: [] };
    return JSON.parse(fs.readFileSync(LOCAL_DB, 'utf-8'));
  } catch { return { surveys: [] }; }
}
function localSave(db) {
  const tmp = LOCAL_DB + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, LOCAL_DB);
}
function localLoadSessions() {
  try {
    if (!fs.existsSync(LOCAL_SESSIONS)) return {};
    return JSON.parse(fs.readFileSync(LOCAL_SESSIONS, 'utf-8'));
  } catch { return {}; }
}
function localSaveSessions(s) {
  fs.writeFileSync(LOCAL_SESSIONS, JSON.stringify(s, null, 2));
}

// ============================================================
// 公共 API
// ============================================================

// --- Surveys ---
async function getAllSurveys() {
  if (USE_KV) {
    const raw = await kvGet(K_SURVEYS);
    return raw ? JSON.parse(raw) : { surveys: [] };
  }
  return localLoad();
}

async function appendSurvey(s) {
  const db = await getAllSurveys();
  db.surveys.push(s);
  if (USE_KV) {
    await kvSet(K_SURVEYS, JSON.stringify(db));
  } else {
    localSave(db);
  }
  return db;
}

async function deleteSurvey(id) {
  const db = await getAllSurveys();
  const before = db.surveys.length;
  db.surveys = db.surveys.filter(s => s.id !== id);
  if (db.surveys.length < before) {
    if (USE_KV) await kvSet(K_SURVEYS, JSON.stringify(db));
    else localSave(db);
  }
  return { removed: before - db.surveys.length, remaining: db.surveys.length };
}

async function clearAllSurveys() {
  if (USE_KV) {
    await kvDel(K_SURVEYS);
    return 0;
  }
  const db = localLoad();
  const n = db.surveys.length;
  localSave({ surveys: [] });
  return n;
}

// --- Admin Sessions ---
async function setSession(token, createdAt) {
  const sess = { createdAt };
  if (USE_KV) {
    await kvSet(K_SESSION_PREFIX + token, JSON.stringify(sess));
  } else {
    const all = localLoadSessions();
    all[token] = sess;
    localSaveSessions(all);
  }
}

async function getSession(token) {
  if (!token) return null;
  let sess;
  if (USE_KV) {
    const raw = await kvGet(K_SESSION_PREFIX + token);
    if (!raw) return null;
    try { sess = JSON.parse(raw); } catch { return null; }
  } else {
    const all = localLoadSessions();
    sess = all[token];
  }
  if (!sess) return null;
  if (Date.now() - sess.createdAt > SESSION_TTL_MS) {
    await deleteSession(token);
    return null;
  }
  return sess;
}

async function deleteSession(token) {
  if (USE_KV) {
    await kvDel(K_SESSION_PREFIX + token);
  } else {
    const all = localLoadSessions();
    delete all[token];
    localSaveSessions(all);
  }
}

module.exports = {
  getAllSurveys, appendSurvey, deleteSurvey, clearAllSurveys,
  setSession, getSession, deleteSession,
  USE_KV,
};
