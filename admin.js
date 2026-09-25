// ============================================================
// admin.js · 管理后台交互
// 登录 → stats + 答卷列表 + 导出 + 单条/全部删除
// ============================================================
(() => {
  'use strict';

  const $loginView = document.getElementById('loginView');
  const $adminView = document.getElementById('adminView');
  const $loginForm = document.getElementById('loginForm');
  const $loginPw = document.getElementById('adminPw');
  const $loginError = document.getElementById('loginError');
  const $statsBox = document.getElementById('statsBox');
  const $surveyBody = document.getElementById('surveyBody');
  const $emptyTip = document.getElementById('emptyTip');
  const $qFilter = document.getElementById('qFilter');
  const $surveyCount = document.getElementById('surveyCount');

  // ------ Boot ------
  async function boot() {
    const res = await fetch('/api/admin/me');
    const data = await res.json();
    if (data.authenticated) showAdmin(); else showLogin();
  }
  boot();

  // ------ Views ------
  function showLogin() {
    $loginView.hidden = false;
    $adminView.hidden = true;
    setTimeout(() => $loginPw.focus(), 100);
  }
  function showAdmin() {
    $loginView.hidden = true;
    $adminView.hidden = false;
    loadAll();
  }

  // ------ Login / Logout ------
  $loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    $loginError.hidden = true;
    const pw = $loginPw.value;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        $loginError.hidden = false;
        return;
      }
      showAdmin();
    } catch {
      $loginError.textContent = '网络错误';
      $loginError.hidden = false;
    }
  });
  document.getElementById('btnLogout').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    showLogin();
    $loginPw.value = '';
  });

  // ------ Load ------
  async function loadAll() {
    await Promise.all([loadStats(), loadSurveys()]);
  }

  async function loadStats() {
    const res = await fetch('/api/admin/stats');
    if (!res.ok) return;
    const d = await res.json();
    if (!d.total) { $statsBox.innerHTML = ''; return; }
    $statsBox.innerHTML = `
      <div class="stat-card">
        <div class="stat-card__value">${d.total}</div>
        <div class="stat-card__label">答卷总数</div>
      </div>
      <div class="stat-card stat-card--accent">
        <div class="stat-card__value">${d.attenFailed} <span style="font-size:14px;color:inherit">/ ${d.total}</span></div>
        <div class="stat-card__label">注意力检测未通过（${(d.attenRate*100).toFixed(1)}%）</div>
      </div>
      <div class="stat-card stat-card--success">
        <div class="stat-card__value">${d.branchA}</div>
        <div class="stat-card__label">A 卷（有辅导经历）</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value">${d.branchB}</div>
        <div class="stat-card__label">B 卷（无辅导经历）</div>
      </div>
      <div class="stat-card stat-card--warning">
        <div class="stat-card__value">${d.avgDur}s</div>
        <div class="stat-card__label">平均答题时长</div>
      </div>
    `;
  }

  async function loadSurveys() {
    const res = await fetch('/api/admin/surveys');
    if (!res.ok) {
      if (res.status === 401) { showLogin(); $loginPw.value = ''; }
      return;
    }
    const d = await res.json();
    renderSurveys(d.surveys || []);
  }

  function renderSurveys(list) {
    const filter = $qFilter.value.trim().toLowerCase();
    const filtered = filter
      ? list.filter(s =>
          (s.lotteryId || '').toLowerCase().includes(filter) ||
          (s.meta && String(s.meta.branch || '').toLowerCase().includes(filter)) ||
          JSON.stringify(s.answers || {}).toLowerCase().includes(filter)
        )
      : list;

    $surveyCount.textContent = filtered.length;
    if (filtered.length === 0) {
      $surveyBody.innerHTML = '';
      $emptyTip.hidden = false;
      return;
    }
    $emptyTip.hidden = true;

    $surveyBody.innerHTML = filtered.map(s => {
      const attenBad = (s.meta.attenCheckFailed || 0) === 0
        ? '<span class="atten-ok">✓ 通过</span>'
        : `<span class="atten-bad">✗ ${s.meta.attenCheckFailed} 题未过</span>`;
      const dur = s.meta.durationSec || '-';
      const time = new Date(s.createdAt).toLocaleString('zh-CN', { hour12: false }).replace(/\//g,'-');
      const answersHtml = buildAnswersHtml(s.answers || {});
      return `
        <tr>
          <td><span class="lottery-cell">${s.lotteryId || '—'}</span></td>
          <td><span class="branch-pill branch-pill--${s.meta.branch || 'A'}">${s.meta.branch || '?'}</span></td>
          <td class="meta-cell">${dur}s</td>
          <td class="atten-cell">${attenBad}</td>
          <td>
            <button class="collapse-btn" data-expand="${s.id}">展开 / 收起答卷 ${answersHtml.total} 题</button>
            <div class="row-detail" data-detail="${s.id}">
              <h4>答卷快照 · ${s.lotteryId}</h4>
              <dl>${answersHtml.html}</dl>
            </div>
          </td>
          <td class="time-cell">${time}</td>
          <td><button class="del-btn" data-del="${s.id}">删除</button></td>
        </tr>`;
    }).join('');

    // 绑定展开/收起 + 删除
    $surveyBody.querySelectorAll('[data-expand]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.expand;
        const row = $surveyBody.querySelector(`[data-detail="${id}"]`);
        row.classList.toggle('open');
      });
    });
    $surveyBody.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('删除这份答卷？不可恢复')) return;
        const res = await fetch('/api/admin/surveys/' + btn.dataset.del, { method: 'DELETE' });
        if (res.ok) await loadAll();
      });
    });
  }

  function buildAnswersHtml(answers) {
    // 按 Q 字母排序输出
    const entries = Object.entries(answers);
    entries.sort(([a],[b]) => a.localeCompare(b));
    const rows = entries.map(([qid, a]) => {
      let v = '';
      if (Array.isArray(a.value)) v = a.value.join(', ') + (a.other ? ` / OTHER: ${a.other}` : '');
      else if (a.value !== undefined && a.value !== null) v = String(a.value);
      return `<dt>${qid}</dt><dd>${escapeHtml(v) || '<span class="empty">空</span>'}</dd>`;
    });
    return { total: entries.length, html: rows.join('') || '<dt>—</dt><dd class="empty">（无）</dd>' };
  }

  // ------ Toolbar actions ------
  document.getElementById('btnRefresh').addEventListener('click', loadAll);
  document.getElementById('btnExportCsv').addEventListener('click', () => window.location.href = '/api/admin/export?format=csv');
  document.getElementById('btnExportJson').addEventListener('click', () => window.location.href = '/api/admin/export?format=json');
  document.getElementById('btnClear').addEventListener('click', async () => {
    if (!confirm('⚠ 清空全部答卷？此操作不可恢复')) return;
    if (!confirm('请再次确认，所有答卷将被永久删除')) return;
    const res = await fetch('/api/admin/surveys?confirm=all', { method: 'DELETE' });
    if (res.ok) await loadAll();
  });
  $qFilter.addEventListener('input', () => {
    // 轻量过滤：不 reload，直接用现有 list（重新 loadSurveys 最保险）
    loadSurveys();
  });

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
