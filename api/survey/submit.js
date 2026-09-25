// POST /api/survey/submit
const store = require('../../lib/store');
const crypto = require('crypto');

function generateLotteryId() {
  const now = new Date();
  const d = `${now.getMonth()+1}${now.getDate()}`.padStart(4, '0');
  return `Q${d}-${Math.floor(Math.random()*900000+100000)}`;
}

function handler(req, res) {
  // Vercel Serverless 自动 parse JSON body
  const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!payload || !payload.meta || !payload.answers) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'invalid payload' }));
  }
  if (!payload.meta.lotteryId) payload.meta.lotteryId = generateLotteryId();
  payload.meta.submittedAt = payload.meta.submittedAt || Date.now();

  store.appendSurvey({
    id: crypto.randomUUID(),
    lotteryId: payload.meta.lotteryId,
    meta: payload.meta,
    answers: payload.answers,
    createdAt: Date.now(),
  }).then(db => {
    const saved = db.surveys[db.surveys.length - 1];
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ code: 0, data: { surveyId: saved.id, lotteryId: saved.lotteryId } }));
  }).catch(e => {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  });
}

module.exports = handler;
