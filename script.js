// ============================================================
// script.js · 问卷交互逻辑核心
// 状态 / 渲染 / 跳转 / 校验 / 存储 / 导出
// ============================================================

(() => {
  'use strict';

  // ------ 常量 ------
  const STORAGE_KEY = 'survey_ai_tutoring_v3';   // 问卷版本号，后续改问卷时换 key 防旧数据干扰
  const API_ENDPOINT_SUBMIT = '/api/survey/submit'; // 未来后端的占位，见 apiStub 注释
  const ESTIMATED_TOTAL_QUESTIONS = 55;            // 用于进度条百分比

  // ------ 全局状态 ------
  // state.answers = { questionId: { type:'single'|'multi'|'scale'|'matrix', value: ..., other:'...' } }
  // state.lotteryId = 抽奖编号（提交时生成）
  // state.startedAt = 开始时间戳
  // state.submittedAt = 提交时间戳
  // state.branch = 'A' | 'B' —— Q2 分流结果
  // state.sectionIndex = 当前所在 section 索引
  let state = null;

  // DOM 根
  const $root = document.getElementById('root');
  const $progressFill = document.getElementById('progressFill');
  const $progressInfo = document.getElementById('progressInfo');

  // ------ 初始化 ------
  function init() {
    state = loadState() || createFreshState();
    // 先根据已答的 Q2 确定分支
    state.branch = determineBranch(state.answers);

    // 如果有完成标记，直接跳到 end 页
    if (state.submittedAt) {
      gotoSectionByKind(state.q1Failed ? 'end-noqual' : 'end', true);
      return;
    }
    renderCurrent();
    bindGlobalEvents();
  }

  function createFreshState() {
    return {
      answers: {},
      lotteryId: null,
      startedAt: Date.now(),
      submittedAt: null,
      branch: null,
      sectionIndex: 0,
      q1Failed: false,  // Q1 选 B
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      // 版本 / 字段 完整性校验
      if (!s || typeof s !== 'object' || !s.answers) return null;
      return s;
    } catch (e) {
      console.warn('loadState failed:', e);
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* 忽略 */ }
  }

  // debounce 存
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 180);
  }

  function clearState() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ------ 分支判定 ------
  function determineBranch(answers) {
    const q2 = answers['Q2'];
    if (!q2 || !q2.value) return null;
    const v = typeof q2.value === 'string' ? q2.value : '';
    return ['A', 'B'].includes(v) ? 'A' : 'B';
  }

  // ------ Section 导航 ------
  // SECTIONS 顺序：intro → part1 → part2 → part3 → part4 → part5 → end → end-noqual
  function gotoSectionByKind(kind, silent = false) {
    const idx = window.SECTIONS.findIndex(s => s.kind === kind);
    if (idx < 0) return;
    state.sectionIndex = idx;
    // 终态页不需要存储 state
    if (!['end', 'end-noqual'].includes(kind)) scheduleSave();
    renderCurrent();
  }

  function currentSection() { return window.SECTIONS[state.sectionIndex]; }

  function nextSection() {
    // 先校验当前 section
    const sec = currentSection();
    const missing = validateSection(sec);
    if (missing.length) {
      focusQuestion(missing[0]);
      flashMissing(missing[0]);
      return;
    }

    // 前置逻辑跳转
    if (sec.kind === 'part1') {
      const q1ans = state.answers['Q1'];
      if (q1ans && q1ans.value === 'B') {
        state.q1Failed = true;
        gotoSectionByKind('end-noqual');
        return;
      }
      // Q2 确定分支
      state.branch = determineBranch(state.answers);
    }

    // 正常进入下一个
    if (state.sectionIndex < window.SECTIONS.length - 1) {
      state.sectionIndex++;
      renderCurrent();
    }
  }

  function prevSection() {
    // intro 之前没有，保持
    if (state.sectionIndex > 0) {
      state.sectionIndex--;
      renderCurrent();
    }
  }

  // ------ 校验 ------
  // 返回缺失 questionId 数组
  function validateSection(sec) {
    const missing = [];
    if (!sec || !sec.data || sec.kind === 'intro' || sec.kind === 'part3') {
      // intro 无作答，part3（量表）单独处理
      if (sec && sec.kind === 'part3') missing.push(...validateScaleSection());
      return missing;
    }
    if (sec.kind !== 'part4') {
      // part1 / part2 / part5
      for (const q of sec.data.questions) {
        if (q.visibleWhen && !q.visibleWhen(state)) continue;
        if (q.required && !isQuestionAnswered(q.id)) missing.push(q.id);
      }
    } else {
      // part4 矩阵：每行必须选一个
      for (const row of sec.data.rows) {
        const key = 'S:' + row.id;
        if (!state.answers[key] || state.answers[key].value === undefined) missing.push(key);
      }
    }
    return missing;
  }

  function validateScaleSection() {
    const missing = [];
    for (const group of window.PART3_GROUPS) {
      for (const item of group.items) {
        const qid = 'SCALE:' + item.id;
        if (!state.answers[qid] || state.answers[qid].value === undefined) missing.push(qid);
      }
    }
    return missing;
  }

  function isQuestionAnswered(qid) {
    const a = state.answers[qid];
    if (!a) return false;
    if (typeof a.value === 'string') return !!a.value;
    if (Array.isArray(a.value)) return a.value.length > 0;
    if (typeof a.value === 'number') return true;
    return false;
  }

  function focusQuestion(qid) {
    // 矩阵行 key 格式 S:S1；量表 key 格式 SCALE:PE1；题目 key 直接是 Qx/Dx
    let sel;
    if (qid.startsWith('S:')) {
      const rowId = qid.substring(2);
      sel = `[data-matrix-row="${rowId}"]`;
    } else if (qid.startsWith('SCALE:')) {
      const itemId = qid.substring(6);
      sel = `[data-scale-item="${itemId}"]`;
    } else {
      sel = `[data-qid="${qid}"]`;
    }
    const el = document.querySelector(sel);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('question--focus');
      setTimeout(() => el.classList.remove('question--focus'), 1300);
    }
  }

  function flashMissing(qid) {
    // 在对应 question 下显示缺失提示
    setTimeout(() => {
      const existing = document.querySelector(`.missing-note[data-missing="${qid}"]`);
      if (existing) return;
      let sel;
      if (qid.startsWith('S:')) sel = `[data-matrix-row="${qid.substring(2)}"]`;
      else if (qid.startsWith('SCALE:')) sel = `[data-scale-item="${qid.substring(6)}"]`;
      else sel = `[data-qid="${qid}"]`;
      const qEl = document.querySelector(sel);
      if (!qEl) return;
      const note = document.createElement('div');
      note.className = 'missing-note';
      note.dataset.missing = qid;
      note.innerHTML = svgIcon('alert-circle') + '<span>请先作答此题目</span>';
      qEl.appendChild(note);
      // 下次点击该 question 自动移除
      const remover = () => {
        if (note.parentNode) note.parentNode.removeChild(note);
        qEl.removeEventListener('click', remover);
      };
      qEl.addEventListener('click', remover);
    }, 200);
  }

  // ------ 渲染分发 ------
  function renderCurrent() {
    updateProgress();
    const sec = currentSection();
    let html = '';
    if (sec.kind === 'intro')       html = renderIntro();
    else if (sec.kind === 'part1')  html = renderPart1(sec.data);
    else if (sec.kind === 'part2')  html = renderPart2(sec.data);
    else if (sec.kind === 'part3')  html = renderPart3(sec.data);
    else if (sec.kind === 'part4')  html = renderPart4(sec.data);
    else if (sec.kind === 'part5')  html = renderPart5(sec.data);
    else if (sec.kind === 'end')    html = renderEnd();
    else if (sec.kind === 'end-noqual') html = renderEndNoQual();

    $root.innerHTML = `<div class="section-enter">${html}</div>`;
    bindSectionEvents();
  }

  // ------ Renderers ------

  function renderIntro() {
    const meta = window.SURVEY_META;
    const hasProgress = !!state.answers && Object.keys(state.answers).length > 0 && !state.submittedAt;
    return `
      <div class="intro">
        <h1 class="survey-title">${meta.title}</h1>
        <div class="survey-subtitle">${meta.team}</div>
        ${hasProgress ? renderResumeBanner() : ''}
        <div class="intro__content">${escapeMarkdownLike(window.INTRO_TEXT)}</div>
        <div class="intro__meta">
          <span>${svgIcon('clock')} ${meta.estimateMinutes}</span>
          <span>${svgIcon('file-text')} ${meta.targetQuestions}</span>
          <span>${svgIcon('lock')} 匿名填写</span>
        </div>
        <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
          ${hasProgress ? `<button class="btn btn--ghost" id="btnRestart">${svgIcon('rotate-ccw')} 重新开始</button>` : ''}
          <button class="btn btn--primary" id="btnStart">${svgIcon('arrow-right')} ${hasProgress ? '继续填写' : '开始填写'}</button>
        </div>
      </div>
    `;
  }
  function renderResumeBanner() {
    const answered = Object.keys(state.answers || {}).length;
    return `
      <div class="resume-banner">
        ${svgIcon('file-edit')}
        <div class="resume-banner__text">
          检测到您此前的填写进度，已作答 <strong>${answered}</strong> 题。
        </div>
      </div>
    `;
  }
  function escapeMarkdownLike(text) {
    // 保留 \n，安全转义 HTML
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderPart1(data) {
    return renderStandardSection(data, 'intro', null);
  }
  function renderPart2(data) {
    return renderStandardSection(data, 'part1', 'part3');
  }
  function renderPart5(data) {
    return renderStandardSection(data, 'part4', 'end');
  }

  function renderStandardSection(data, prevKind, nextKind) {
    // 渲染标准题目组（single / multi）
    const questions = (data.questions || [])
      .filter(q => !q.visibleWhen || q.visibleWhen(state))
      .map(q => renderQuestion(q)).join('');
    return `
      <div class="card">
        <div class="section-title">${data.title}</div>
        ${data.note ? `<div class="section-note">${data.note}</div>` : ''}
        ${questions}
        ${renderNav(prevKind, nextKind)}
      </div>
    `;
  }

  function renderQuestion(q) {
    let body = '';
    if (q.type === 'single') body = renderSingle(q);
    else if (q.type === 'multi') body = renderMulti(q);
    else body = '<div class="text">未知题型</div>';

    let req = q.required ? `<span class="question__required">*</span>` : '';
    return `
      <div class="question" data-qid="${q.id}">
        <div class="question__text" data-id="${q.id}">${q.text}${req}</div>
        ${body}
      </div>
    `;
  }

  function renderSingle(q) {
    const cur = state.answers[q.id];
    const curVal = cur && cur.value;
    let opts = q.options.map((o, i) => {
      const optLabel = extractOptLabel(o); // 'A' / 'B' ...
      const checked = curVal === optLabel ? 'checked' : '';
      return `
        <label class="option">
          <input type="radio" name="q_${q.id}" value="${optLabel}" ${checked} data-opt="${optLabel}" />
          <span class="option__indicator"></span>
          <span class="option__label">${escapeHtml(o)}</span>
        </label>`;
    }).join('');
    return `<div class="options" data-qid="${q.id}">${opts}</div>`;
  }

  function renderMulti(q) {
    const cur = state.answers[q.id];
    const curVals = (cur && cur.value) || [];
    const curOther = cur && cur.other;
    let opts = q.options.map(o => {
      const optLabel = extractOptLabel(o);
      const checked = curVals.includes(optLabel) ? 'checked' : '';
      return `
        <label class="option option--multi">
          <input type="checkbox" name="q_${q.id}" value="${optLabel}" ${checked} data-opt="${optLabel}" />
          <span class="option__indicator"></span>
          <span class="option__label">${escapeHtml(o)}</span>
        </label>`;
    }).join('');
    if (q.allowOther) {
      opts += `
        <label class="option option--multi" style="align-items:center;">
          <input type="checkbox" name="q_${q.id}_other" value="OTHER" ${curVals.includes('OTHER') ? 'checked' : ''} data-opt="OTHER" />
          <span class="option__indicator"></span>
          <input type="text" class="option__other" placeholder="${q.otherPlaceholder || '其他'}" value="${escapeHtml(curOther || '')}" data-other-for="${q.id}" />
        </label>`;
    }
    return `<div class="options" data-qid="${q.id}">${opts}</div>`;
  }

  function renderPart3(groups) {
    const note = state.branch === 'A' ? window.PART3_NOTE_A : window.PART3_NOTE_B;
    const groupsHtml = groups.map(g => renderScaleGroup(g)).join('');
    return `
      <div class="card">
        <div class="section-title">
          第三部分 · 核心量表
          <span style="font-family:var(--font-mono); font-size:11px; font-weight:400; color:var(--c-text-3); margin-left:auto;">
            当前分支：${state.branch || '未判定'}卷
          </span>
        </div>
        <div class="section-note">${note}</div>
        ${groupsHtml}
        ${renderNav('part2', 'part4')}
      </div>
    `;
  }

  function renderScaleGroup(group) {
    const items = group.items.map(item => {
      const qid = 'SCALE:' + item.id;
      const cur = state.answers[qid];
      const curVal = cur && cur.value;
      const textKey = state.branch === 'B' ? 'b' : 'a';
      const text = item[textKey] || item.a;
      const attenClass = item.attenCheck ? 'question question--atten' : 'question';

      const cells = window.SCALE_VALUES.map((v, i) => {
        const selected = curVal === v ? 'scale__cell--selected' : '';
        const checked = curVal === v ? 'checked' : '';
        return `
          <label class="scale__cell ${selected}">
            <input type="radio" name="scale_${item.id}" value="${v}" ${checked} />
            <span class="scale__num">${v}</span>
            <span>${window.SCALE_LABELS[i]}</span>
          </label>`;
      }).join('');

      // 只给注意力检测题生成警示块，默认隐藏；答对/答错时动态切换
      const attenWarnHtml = item.attenCheck
        ? `<div class="attention-warn" data-atten="${item.id}" hidden>
            ${svgIcon('alert-circle')}
            <span>请按题干指示选择正确的一项（检测题未按要求作答将影响问卷有效性）</span>
          </div>`
        : '';

      return `
        <div class="${attenClass}" data-scale-item="${item.id}">
          <div class="question__text" data-id="${item.id}">${escapeHtml(text)}${item.reverseScore ? ' <span style="font-size:11px; color:var(--c-text-3);">[反向计分]</span>' : ''}</div>
          <div class="scale">${cells}</div>
          ${attenWarnHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="scale-group">
        <div class="group-title">${group.name}</div>
        <div class="group-source">来源：${group.source}</div>
        ${items}
      </div>
    `;
  }

  function renderPart4(data) {
    // 场景矩阵
    const colsHtml = data.columns.map(c => `<div>${c.label}</div>`).join('');
    const rowsHtml = data.rows.map(row => {
      const key = 'S:' + row.id;
      const cur = state.answers[key];
      const curVal = cur && cur.value;
      const cellsHtml = data.columns.map(col => {
        const sel = curVal === col.val ? 'checked' : '';
        return `<div class="matrix-row__cell">
          <input type="radio" name="matrix_${row.id}" value="${col.val}" ${sel} />
        </div>`;
      }).join('');
      return `
        <div class="matrix-row" data-matrix-row="${row.id}">
          <div class="matrix-row__label" data-id="${row.id}">${escapeHtml(row.text)}</div>
          ${cellsHtml}
        </div>`;
    }).join('');

    return `
      <div class="card">
        <div class="section-title">${data.title}</div>
        <div class="section-note">${data.note}</div>
        <div class="matrix-wrap">
          <div class="matrix-header">
            <div>辅导类型</div>
            ${colsHtml}
          </div>
          ${rowsHtml}
        </div>
        ${renderNav('part3', 'part5')}
      </div>
    `;
  }

  function renderNav(prevKind, nextKind) {
    const secIndex = state.sectionIndex;
    const isIntro = secIndex === 0;
    const prevDisabled = isIntro || !prevKind;
    // part1 的 prev = intro；part2 的 prev = part1；part3 prev = part2；part4 prev = part3；part5 prev = part4
    // 这里用 kind 匹配最可靠：当前 kind → prev kind
    const currentKind = currentSection().kind;
    const prevKindMap = {
      part1: 'intro',
      part2: 'part1',
      part3: 'part2',
      part4: 'part3',
      part5: 'part4',
    };
    const actualPrev = prevKindMap[currentKind] || prevKind;

    // next
    const nextKindMap = {
      part1: 'part2',
      part2: 'part3',
      part3: 'part4',
      part4: 'part5',
      part5: 'end',
    };
    const actualNext = nextKindMap[currentKind] || nextKind;
    const isFinal = currentKind === 'part5';
    const canGoPrev = !!actualPrev && currentKind !== 'intro';

    return `
      <div class="nav">
        <div class="nav__info">
          Section ${secIndex} / ${window.SECTIONS.length - 2} · 已答 ${countAnswered()} 题
        </div>
        <div class="nav__actions">
          ${canGoPrev ? `<button class="btn btn--ghost" data-go="${actualPrev}">${svgIcon('chevron-left')} 上一页</button>` : ''}
          ${isFinal
            ? `<button class="btn btn--primary" id="btnSubmit">${svgIcon('send')} 提交问卷</button>`
            : `<button class="btn btn--primary" data-go-next>${svgIcon('arrow-right')} 下一页</button>`
          }
        </div>
      </div>
    `;
  }

  function renderEnd() {
    const q = state.lotteryId || generateLotteryId();
    state.lotteryId = q;
    // 校验注意力检测题是否答对
    const attenResults = checkAttentionChecks();
    // 仅 URL 带 ?admin=1 才显示管理工具（导出），受访者默认看不到
    const isAdmin = new URLSearchParams(location.search).get('admin') === '1';
    const adminRow = isAdmin ? `
        <div class="download-row">
          <button class="btn" id="btnExportJSON">${svgIcon('download')} 导出 JSON</button>
          <button class="btn" id="btnExportCSV">${svgIcon('download')} 导出 CSV</button>
          <button class="btn btn--ghost" id="btnRestart2">${svgIcon('rotate-ccw')} 重新开始</button>
        </div>` : '';
    const adminNote = isAdmin
      ? '<p style="margin-top:20px; font-size:11px; color: var(--c-text-3);">[管理模式] 带 ?admin=1 访问才显示导出按钮</p>'
      : '';
    return `
      <div class="end-page">
        <div class="end-icon">${svgIcon('check-circle')}</div>
        <h2 class="end-page__title">问卷提交成功！</h2>
        <p class="end-page__text">
          感谢您的认真填写！您的回答对我们的研究非常重要。<br/>
          请妥善保存下方抽奖编号，按卷首语说明参与抽奖。
        </p>
        <div class="lot-box">
          <div class="lot-box__label">您的抽奖编号</div>
          <div class="lot-box__code">${q}</div>
        </div>
        ${attenResults.failedCount > 0 ? `
          <div style="max-width:520px; margin: 0 auto 16px; font-size:12px; color: var(--c-accent); text-align:center; line-height:1.6;">
            ${svgIcon('alert-circle')}
            <div style="margin-top:4px;">您有 ${attenResults.failedCount} 道注意力检测题未按要求作答，<br/>研究团队将在数据预处理中根据情况判别问卷有效性。</div>
          </div>` : ''}
        ${isAdmin
          ? adminRow
          : `<div class="download-row"><button class="btn btn--ghost" id="btnRestart2">${svgIcon('rotate-ccw')} 重新开始填写</button></div>`}
        ${adminNote}
      </div>
    `;
  }

  function renderEndNoQual() {
    return `
      <div class="end-page">
        <div class="end-icon" style="background: var(--c-warning);">${svgIcon('skip-forward')}</div>
        <h2 class="end-page__title">感谢您的参与</h2>
        <p class="end-page__text" style="max-width: 520px; margin: 0 auto;">
          根据第一题的筛选条件，您当前不满足本次调研的样本要求（未使用过 AI 大模型进行学习相关活动）。<br/><br/>
          我们尊重并感谢您的诚实填写。您可以关闭此页面或重新填写。
        </p>
        <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap; margin-top:24px;">
          <button class="btn btn--primary" id="btnRestart3">${svgIcon('rotate-ccw')} 重新填写</button>
        </div>
      </div>
    `;
  }

  // ------ Attention Check ------
  function checkAttentionChecks() {
    let failedCount = 0;
    const failedIds = [];
    for (const group of window.PART3_GROUPS) {
      for (const item of group.items) {
        if (!item.attenCheck) continue;
        const key = 'SCALE:' + item.id;
        const a = state.answers[key];
        if (!a || a.value !== item.attenAnswer) {
          failedCount++;
          failedIds.push(item.id);
        }
      }
    }
    return { failedCount, failedIds };
  }

  // ------ 全局事件绑定 ------
  function bindGlobalEvents() {
    // 全局委托：checkbox / radio 变化更新 state
    $root.addEventListener('change', onInputChange);
    // 清除缺失提示
    $root.addEventListener('input', onInputText);
    // 点击 .attention-warn 不冒泡
    $root.addEventListener('click', e => {
      // 导航按钮
      const goBtn = e.target.closest('[data-go]');
      if (goBtn) {
        e.preventDefault();
        gotoSectionByKind(goBtn.dataset.go);
        return;
      }
      const nextBtn = e.target.closest('[data-go-next]');
      if (nextBtn) { e.preventDefault(); nextSection(); return; }
      if (e.target.closest('#btnSubmit')) { e.preventDefault(); submit(); return; }
      if (e.target.closest('#btnStart')) { e.preventDefault(); nextSection(); return; }
      if (e.target.closest('#btnRestart') || e.target.closest('#btnRestart2') || e.target.closest('#btnRestart3')) {
        e.preventDefault();
        if (confirm('确定要重新填写吗？当前进度将被清除。')) {
          clearState();
          state = createFreshState();
          renderCurrent();
        }
        return;
      }
      if (e.target.closest('#btnExportJSON')) { e.preventDefault(); exportJSON(); return; }
      if (e.target.closest('#btnExportCSV')) { e.preventDefault(); exportCSV(); return; }
    });
  }

  function bindSectionEvents() {
    // 这里其实已经在 bindGlobalEvents 里用事件委托统一处理了
  }

  function onInputChange(e) {
    const t = e.target;
    // 处理单选
    if (t.matches('input[type="radio"]')) {
      // 判断属于哪个 question
      // 量表组：name = scale_XXX，value 是数字
      if (t.name.startsWith('scale_')) {
        const itemId = t.name.substring(6);
        const qid = 'SCALE:' + itemId;
        const val = Number(t.value);
        state.answers[qid] = { type: 'scale', value: val };
        clearMissingHint(qid);
        // 注意力检测题：答对 → 隐藏警示；答错 → 显示警示
        const attenGroup = findAttenItem(itemId);
        const warnEl = document.querySelector(`[data-scale-item="${itemId}"] .attention-warn`);
        if (attenGroup && warnEl) {
          warnEl.hidden = (val === attenGroup.attenAnswer);
        }
      } else if (t.name.startsWith('matrix_')) {
        const rowId = t.name.substring(7);
        const key = 'S:' + rowId;
        const val = t.value === 'NA' ? 'NA' : Number(t.value);
        state.answers[key] = { type: 'matrix', value: val };
        clearMissingHint(key);
      } else {
        // 普通单选（single type）
        const qid = t.name.startsWith('q_') ? t.name.substring(2) : t.name;
        const val = t.value;
        state.answers[qid] = { type: 'single', value: val };
        clearMissingHint(qid);
      }
      scheduleSave();
      updateProgress();
    } else if (t.matches('input[type="checkbox"]')) {
      // 多选
      const parent = t.closest('.options');
      if (!parent) return;
      let qid = parent.dataset.qid;
      if (!qid) return;

      // 取所有该题勾选的 value
      const boxes = parent.querySelectorAll('input[type="checkbox"]:checked');
      const values = Array.from(boxes).map(b => b.value);
      // 其他
      const otherInput = parent.querySelector('[data-other-for="' + qid + '"]');
      const other = otherInput ? otherInput.value.trim() : '';

      state.answers[qid] = {
        type: 'multi',
        value: values,
        other: values.includes('OTHER') ? other : '',
      };
      clearMissingHint(qid);
      scheduleSave();
      updateProgress();
    }
  }

  function onInputText(e) {
    const t = e.target;
    const otherFor = t.dataset.otherFor;
    if (otherFor) {
      // 同步更新 other
      const cur = state.answers[otherFor] || { type: 'multi', value: [], other: '' };
      cur.other = t.value.trim();
      state.answers[otherFor] = cur;
      scheduleSave();
    }
  }

  // ------ 进度 ------
  function countAnswered() {
    return Object.keys(state.answers || {}).length;
  }
  function updateProgress() {
    const n = countAnswered();
    const pct = Math.min(100, Math.round(n / ESTIMATED_TOTAL_QUESTIONS * 100));
    $progressFill.style.width = pct + '%';
    if ($progressInfo) $progressInfo.textContent = `${n} / ${ESTIMATED_TOTAL_QUESTIONS}`;
  }

  // ------ Submit ------
  async function submit() {
    // 1) 完整校验
    const missing = validateSection(window.SECTIONS[state.sectionIndex]);
    if (missing.length) {
      focusQuestion(missing[0]);
      flashMissing(missing[0]);
      return;
    }
    const allMissing = validateAllVisible();
    if (allMissing.length) {
      focusQuestion(allMissing[0]);
      flashMissing(allMissing[0]);
      alert(`还有 ${allMissing.length} 题未作答，请补全后再提交。`);
      return;
    }

    // 2) 生成抽奖编号，打时间戳
    if (!state.lotteryId) state.lotteryId = generateLotteryId();
    state.submittedAt = Date.now();

    // 3) 尝试提交到后端 API；后端不可用时（file:// 打开）静默降级
    let serverAccepted = false;
    try {
      const res = await fetch('/api/survey/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.lotteryId) state.lotteryId = data.lotteryId;
        serverAccepted = true;
      }
    } catch (e) {
      // file:// 协议下 fetch 会失败，静默忽略
    }

    // 4) 清 localStorage 避免续填串号（已提交就不要再续了）
    clearState();
    state.submittedAt = Date.now();
    state.lotteryId = state.lotteryId; // 保留
    gotoSectionByKind('end', true);
  }

  function validateAllVisible() {
    const missing = [];
    for (const sec of window.SECTIONS) {
      if (sec.kind === 'intro' || sec.kind === 'end' || sec.kind === 'end-noqual') continue;
      const secMissing = validateSection(sec);
      missing.push(...secMissing);
    }
    return missing;
  }

  function generateLotteryId() {
    const now = new Date();
    const d = `${now.getMonth()+1}${now.getDate()}`.padStart(4, '0');
    const rand = Math.floor(Math.random() * 900000 + 100000);
    return `Q${d}-${rand}`;
  }

  // ------ 后端 API stub ------
  const apiStub = {
    async submitSurvey(payload) {
      await delay(500);
      // TODO: fetch('/api/survey/submit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      return { code: 0, data: { surveyId: 'Q' + Date.now() } };
    },
  };
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  function buildPayload() {
    // 导出成一份便于后端 / 分析的结构
    const attenResults = checkAttentionChecks();
    return {
      meta: {
        surveyTitle: window.SURVEY_META.title,
        version: 3,
        startedAt: state.startedAt,
        submittedAt: state.submittedAt,
        durationSec: Math.round((state.submittedAt - state.startedAt) / 1000),
        lotteryId: state.lotteryId,
        branch: state.branch,
        attenCheckFailed: attenResults.failedCount,
        attenCheckFailedIds: attenResults.failedIds,
      },
      answers: state.answers,
    };
  }

  // ------ 导出 ------
  function exportJSON() {
    const payload = buildPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `survey_${state.lotteryId}_${Date.now()}.json`);
  }

  function exportCSV() {
    const payload = buildPayload();
    // 扁平化 answers
    const rows = [];
    for (const [qid, ans] of Object.entries(payload.answers)) {
      let val = '';
      if (ans.type === 'multi') {
        val = (ans.value || []).join('|');
        if (ans.other) val += `|OTHER:${ans.other}`;
      } else if (ans.value !== undefined) {
        val = ans.value;
      }
      rows.push([qid, ans.type, val].map(csvEscape));
    }
    // meta 也写成两行
    const header = ['question_id', 'type', 'answer'];
    const csv = '\ufeff' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `survey_${state.lotteryId}_${Date.now()}.csv`);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function csvEscape(s) {
    s = String(s ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  // ------ Helper ------
  function extractOptLabel(o) {
    // 'A. 是' → 'A'；纯 '是'（没前缀）直接返回全文
    const m = /^([A-Z])[\.\、]\s*/.exec(o);
    if (m) return m[1];
    return o;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function findAttenItem(itemId) {
    for (const g of window.PART3_GROUPS) {
      for (const it of g.items) {
        if (it.id === itemId && it.attenCheck) return it;
      }
    }
    return null;
  }
  function clearMissingHint(qid) {
    // 移除对应 question 下挂的红色"请先作答"提示 DOM
    let sel;
    if (qid.startsWith('S:'))          sel = `[data-matrix-row="${qid.substring(2)}"]`;
    else if (qid.startsWith('SCALE:')) sel = `[data-scale-item="${qid.substring(6)}"]`;
    else                               sel = `[data-qid="${qid}"]`;
    const el = document.querySelector(sel);
    if (!el) return;
    const note = el.querySelector('.missing-note');
    if (note) note.remove();
  }

  // ------ Lucide inline SVG icons（零外部依赖）------
  // 每个 icon 内联 SVG 字符串，stroke-width 1.75；统一注入 width/height 防止尺寸失控
  function svgIcon(name) {
    const map = {
      'arrow-right':  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
      'chevron-left': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
      'send':         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
      'check-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
      'alert-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
      'skip-forward': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/></svg>',
      'download':     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
      'rotate-ccw':   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
      'clock':        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      'file-text':    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
      'lock':         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
      'file-edit':    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    };
    const raw = map[name] || '';
    // 统一补 width/height，避免 SVG 尺寸失控
    return raw.replace('<svg ', '<svg width="16" height="16" ');
  }

  // ------ Boot ------
  document.addEventListener('DOMContentLoaded', init);
})();
