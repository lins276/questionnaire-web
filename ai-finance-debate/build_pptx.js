const pptxgen = require("pptxgenjs");

let pres = new pptxgen();
pres.author = "金融学小组";
pres.title = "普惠，还是分化？——生成式 AI 冲击下的金融业";

// ============================================================
// SLIDE DIMENSIONS
// ============================================================
pres.layout = "LAYOUT_16x9";
const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN = 0.5;
const CONTENT_X = MARGIN;
const CONTENT_Y = MARGIN;
const CONTENT_W = SLIDE_W - 2 * MARGIN;
const CONTENT_H = SLIDE_H - 2 * MARGIN;
const CENTER_X = SLIDE_W / 2;

// ============================================================
// CONTAINER SYSTEM
// ============================================================
function createVirtualNode(type, data, parentX = 0, parentY = 0) {
  const opts = data.opts || {};
  const node = {
    type, data,
    absX: parentX + (opts.x || 0),
    absY: parentY + (opts.y || 0),
    w: opts.w || 0, h: opts.h || 0,
    children: []
  };
  node.addShape = function (shapeType, opts = {}) {
    const child = createVirtualNode("shape", { shapeType, opts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  node.addText = function (text, opts = {}) {
    const safeOpts = { fit: "shrink", ...opts };
    const bulletRe = /^(?:[•‣◦⁃∙·●○–—]\s*|-\s+)/;
    if (Array.isArray(text)) {
      text = text.map(item => {
        if (item && item.options && item.options.bullet && typeof item.text === "string") {
          return { ...item, text: item.text.replace(bulletRe, "") };
        }
        return item;
      });
    }
    const child = createVirtualNode("text", { text, opts: safeOpts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  node.addImage = function (opts = {}) {
    const child = createVirtualNode("image", { opts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  node.addTable = function (tableData, opts = {}) {
    const child = createVirtualNode("table", { tableData, opts }, node.absX, node.absY);
    node.children.push(child);
    return child;
  };
  return node;
}

function flattenNode(node, realSlide, pres) {
  const absOpts = { ...node.data.opts, x: node.absX, y: node.absY };
  if (node.type === "shape") realSlide.addShape(node.data.shapeType, absOpts);
  else if (node.type === "text") realSlide.addText(node.data.text, absOpts);
  else if (node.type === "image") realSlide.addImage(absOpts);
  else if (node.type === "table") realSlide.addTable(node.data.tableData, absOpts);
  node.children.forEach(child => flattenNode(child, realSlide, pres));
}

const originalAddSlide = pres.addSlide.bind(pres);
pres.addSlide = function (options) {
  const realSlide = originalAddSlide(options);
  const virtualSlide = {
    children: [],
    _realSlide: realSlide,
    set background(val) { realSlide.background = val; },
    get background() { return realSlide.background; },
    addShape: function (shapeType, opts = {}) {
      const node = createVirtualNode("shape", { shapeType, opts }, 0, 0);
      this.children.push(node);
      return node;
    },
    addText: function (text, opts = {}) {
      const safeOpts = { fit: "shrink", ...opts };
      const node = createVirtualNode("text", { text, opts: safeOpts }, 0, 0);
      this.children.push(node);
      return node;
    },
    addImage: function (opts = {}) {
      const node = createVirtualNode("image", { opts }, 0, 0);
      this.children.push(node);
      return node;
    },
    addTable: function (tableData, opts = {}) {
      const node = createVirtualNode("table", { tableData, opts }, 0, 0);
      this.children.push(node);
      return node;
    },
    addChart: function (chartType, data, opts = {}) {
      realSlide.addChart(chartType, data, opts);
    },
    render: function () {
      this.children.forEach(child => flattenNode(child, realSlide, pres));
    }
  };
  return virtualSlide;
};
// ============================================================

// ---------- Design tokens ----------
const NAVY = "0F1B2D";        // 深藏青（封面/结尾）
const NAVY_LIGHT = "1B2C44";  // 深藏青提亮
const BG = "F6F7F9";          // 浅色内容页底
const CARD = "FFFFFF";
const INK = "1E2733";         // 正文深色
const MUTED = "5C6675";       // 次要文字
const GREEN = "1DC981";       // 普惠
const GREEN_DARK = "0F9D63";
const GREEN_PALE = "E4F8EF";
const RED = "E8463A";         // 分化
const RED_DARK = "C23327";
const RED_PALE = "FCE9E7";
const LINE = "DDE2E9";

const SERIF = "Noto Serif CJK SC";
const SANS = "Noto Sans CJK SC";

const SHADOW = { type: "outer", blur: 5, offset: 2, color: "0F1B2D", opacity: 0.18 };

// ---------- Shared helpers ----------
function contentHeader(slide, kicker, title, accentColor) {
  // 顶部小标签 + 大标题 + 强调短线
  slide.addShape(pres.shapes.RECTANGLE, {
    x: CONTENT_X, y: 0.52, w: 0.09, h: 0.62, fill: { color: accentColor }, line: { type: "none" }
  });
  slide.addText(kicker, {
    x: CONTENT_X + 0.22, y: 0.44, w: CONTENT_W - 0.3, h: 0.3,
    fontFace: SANS, fontSize: 10.5, color: MUTED, charSpacing: 2, align: "left", valign: "middle", margin: 0
  });
  slide.addText(title, {
    x: CONTENT_X + 0.22, y: 0.72, w: CONTENT_W - 0.3, h: 0.55,
    fontFace: SERIF, fontSize: 26, bold: true, color: INK, charSpacing: 1.5, align: "left", valign: "middle", margin: 0
  });
  slide.addShape(pres.shapes.LINE, {
    x: CONTENT_X, y: 1.42, w: CONTENT_W, h: 0, line: { color: LINE, width: 1 }
  });
}

function pageNumber(slide, n) {
  slide.addText(`${n} / 9`, {
    x: SLIDE_W - 1.1, y: SLIDE_H - 0.42, w: 0.7, h: 0.25,
    fontFace: SANS, fontSize: 9, color: MUTED, align: "right", valign: "middle", margin: 0
  });
}

// ============================================================
// Slide 1 — 封面（深藏青）
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: NAVY };

  // 背景装饰：左下绿扇形、右上红扇形（均在画布内）
  slide.addShape(pres.shapes.PIE, {
    x: 0, y: SLIDE_H - 2.3, w: 2.3, h: 2.3, angleRange: [90, 180],
    fill: { color: GREEN, transparency: 82 }, line: { type: "none" }
  });
  slide.addShape(pres.shapes.PIE, {
    x: SLIDE_W - 2.4, y: 0, w: 2.4, h: 2.4, angleRange: [270, 360],
    fill: { color: RED, transparency: 84 }, line: { type: "none" }
  });

  // 顶部标签
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: CENTER_X - 1.55, y: 0.78, w: 3.1, h: 0.4, rectRadius: 0.2,
    fill: { color: NAVY_LIGHT }, line: { color: "3A4E6E", width: 1 }
  });
  slide.addText("《生成式人工智能与金融业变革》研读", {
    x: CENTER_X - 1.55, y: 0.78, w: 3.1, h: 0.4,
    fontFace: SANS, fontSize: 11, color: "9FB2CC", align: "center", valign: "middle", margin: 0
  });

  // 主标题
  slide.addText([
    { text: "普惠", options: { color: GREEN } },
    { text: "，还是", options: { color: "F2F5F9" } },
    { text: "分化", options: { color: RED } },
    { text: "？", options: { color: "F2F5F9" } }
  ], {
    x: 0.5, y: 1.7, w: 9, h: 1.25, fontFace: SERIF, fontSize: 52, bold: true,
    align: "center", valign: "middle", charSpacing: 2.5, margin: 0
  });

  // 中间分割线：绿-灰-红渐变式三段
  const lineY = 3.18, segW = 1.1;
  slide.addShape(pres.shapes.RECTANGLE, { x: CENTER_X - segW - 0.55, y: lineY, w: segW, h: 0.035, fill: { color: GREEN }, line: { type: "none" } });
  slide.addShape(pres.shapes.RECTANGLE, { x: CENTER_X - 0.5, y: lineY, w: 1.0, h: 0.035, fill: { color: "5B6B84" }, line: { type: "none" } });
  slide.addShape(pres.shapes.RECTANGLE, { x: CENTER_X + 0.55, y: lineY, w: segW, h: 0.035, fill: { color: RED }, line: { type: "none" } });

  // 副标题
  slide.addText("生成式 AI 冲击下的金融业", {
    x: 0.5, y: 3.42, w: 9, h: 0.6, fontFace: SERIF, fontSize: 22, color: "C9D4E5",
    align: "center", valign: "middle", charSpacing: 1.5, margin: 0
  });

  // 署名
  slide.addText("金融学小组汇报 · 2026", {
    x: 0.5, y: 4.55, w: 9, h: 0.35, fontFace: SANS, fontSize: 12, color: "8296B2",
    align: "center", valign: "middle", charSpacing: 2, margin: 0
  });

  slide.render();
}

// ============================================================
// Slide 2 — 目录
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: BG };
  contentHeader(slide, "CONTENTS", "今天讲什么", NAVY);

  const items = [
    { num: "01", title: "文献速览", desc: "一篇论文：3 个事实、4 个问题、4 条建议", accent: NAVY, pale: "E8EDF5", dark: NAVY },
    { num: "02", title: "普惠面：门槛在降低", desc: "AI 把金融服务的价格打了下来", accent: GREEN, pale: GREEN_PALE, dark: GREEN_DARK },
    { num: "03", title: "分化面：鸿沟在加深", desc: "数据、算力与岗位的新不平等", accent: RED, pale: RED_PALE, dark: RED_DARK },
    { num: "04", title: "我们的判断", desc: "方向不取决于技术，取决于制度设计", accent: "E8A33A", pale: "FBF1DE", dark: "B97E1E" }
  ];

  const rowH = 0.82, gap = 0.16, startY = 1.68;
  items.forEach((it, i) => {
    const y = startY + i * (rowH + gap);
    slide.addShape(pres.shapes.RECTANGLE, {
      x: CONTENT_X, y, w: CONTENT_W, h: rowH, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: SHADOW
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x: CONTENT_X, y, w: 0.07, h: rowH, fill: { color: it.accent }, line: { type: "none" }
    });
    slide.addShape(pres.shapes.OVAL, {
      x: CONTENT_X + 0.28, y: y + 0.17, w: 0.48, h: 0.48, fill: { color: it.pale }, line: { type: "none" }
    });
    slide.addText(it.num, {
      x: CONTENT_X + 0.28, y: y + 0.17, w: 0.48, h: 0.48,
      fontFace: SERIF, fontSize: 15, bold: true, color: it.dark, align: "center", valign: "middle", margin: 0
    });
    slide.addText(it.title, {
      x: CONTENT_X + 1.0, y: y + 0.1, w: 3.6, h: 0.62,
      fontFace: SERIF, fontSize: 17, bold: true, color: INK, align: "left", valign: "middle", charSpacing: 1, margin: 0
    });
    slide.addText(it.desc, {
      x: CONTENT_X + 4.7, y: y + 0.1, w: 4.15, h: 0.62,
      fontFace: SANS, fontSize: 11.5, color: MUTED, align: "left", valign: "middle", margin: 0
    });
  });

  pageNumber(slide, 2);
  slide.render();
}

// ============================================================
// Slide 3 — 文献速览（左文右图）
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: BG };
  contentHeader(slide, "PAPER IN BRIEF", "文献速览：一篇论文的回答", NAVY);

  const facts = [
    { k: "作者与期刊", v: "王鹏、尹伟贤，《江淮论坛》2025 年第 1 期" },
    { k: "研究对象", v: "以 ChatGPT 为例，看生成式 AI 如何改写金融业" },
    { k: "分析框架", v: "3 大典型事实 → 4 个潜在问题 → 4 项政策建议" },
    { k: "核心关切", v: "技术红利怎么分：让更多人受益，还是让差距更大？" }
  ];

  const rowH = 0.78, gap = 0.1, startY = 1.62, leftW = 5.6;
  facts.forEach((f, i) => {
    const y = startY + i * (rowH + gap);
    slide.addShape(pres.shapes.RECTANGLE, {
      x: CONTENT_X, y, w: leftW, h: rowH, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: SHADOW
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x: CONTENT_X, y, w: 0.07, h: rowH, fill: { color: NAVY }, line: { type: "none" }
    });
    slide.addText(f.k, {
      x: CONTENT_X + 0.26, y: y + 0.08, w: leftW - 0.5, h: 0.28,
      fontFace: SANS, fontSize: 12.5, bold: true, color: NAVY_LIGHT, align: "left", valign: "middle", margin: 0
    });
    slide.addText(f.v, {
      x: CONTENT_X + 0.26, y: y + 0.36, w: leftW - 0.5, h: 0.36,
      fontFace: SANS, fontSize: 11.5, color: MUTED, align: "left", valign: "top", margin: 0
    });
  });

  // 右侧论文截图（竖版 1225×1650，图注在上，图在下）
  const imgH = 3.55, imgW = imgH * (1225 / 1650);
  const imgX = SLIDE_W - MARGIN - 0.35 - imgW, imgY = 1.86;
  slide.addText("论文首页（中国知网）", {
    x: imgX - 0.06, y: 1.52, w: imgW + 0.12, h: 0.25,
    fontFace: SANS, fontSize: 9, color: MUTED, align: "center", valign: "middle", margin: 0
  });
  // 边框衬底
  slide.addShape(pres.shapes.RECTANGLE, {
    x: imgX - 0.06, y: imgY - 0.06, w: imgW + 0.12, h: imgH + 0.12,
    fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: SHADOW
  });
  slide.addImage({ path: "/workspace/ai-finance-debate/assets/paper_title_1225x1650.png", x: imgX, y: imgY, w: imgW, h: imgH });

  pageNumber(slide, 3);
  slide.render();
}

// ============================================================
// Slide 4 — 普惠面：门槛在降低（三卡片）
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: BG };
  contentHeader(slide, "FOR EVERYONE", "普惠面：门槛在降低", GREEN_DARK);

  const cards = [
    { icon: "投", title: "智能投顾下沉", desc: "定制化投资建议不再是有钱人的专属，普通人打开手机就能用", tag: "理财门槛 ↓" },
    { icon: "读", title: "信息获取提速", desc: "长桥 PortAI「万字研报秒划重点」，散户也能读懂专业研报", tag: "信息差 ↓" },
    { icon: "行", title: "服务打破时空", desc: "浙江农商联合银行接入文心一言，县域虚拟营业厅 7×24 在线", tag: "距离 ≈ 0" }
  ];

  const cardW = 2.87, cardH = 3.3, gapX = 0.2, startX = (SLIDE_W - (3 * cardW + 2 * gapX)) / 2, cardY = 1.66;
  cards.forEach((c, i) => {
    const x = startX + i * (cardW + gapX);
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y: cardY, w: cardW, h: cardH, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: SHADOW
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y: cardY, w: cardW, h: 0.09, fill: { color: GREEN }, line: { type: "none" }
    });
    slide.addShape(pres.shapes.OVAL, {
      x: x + cardW / 2 - 0.36, y: cardY + 0.35, w: 0.72, h: 0.72, fill: { color: GREEN_PALE }, line: { type: "none" }
    });
    slide.addText(c.icon, {
      x: x + cardW / 2 - 0.36, y: cardY + 0.35, w: 0.72, h: 0.72,
      fontFace: SERIF, fontSize: 24, bold: true, color: GREEN_DARK, align: "center", valign: "middle", margin: 0
    });
    slide.addText(c.title, {
      x: x + 0.2, y: cardY + 1.2, w: cardW - 0.4, h: 0.42,
      fontFace: SERIF, fontSize: 16, bold: true, color: INK, align: "center", valign: "middle", charSpacing: 1, margin: 0
    });
    slide.addText(c.desc, {
      x: x + 0.26, y: cardY + 1.72, w: cardW - 0.52, h: 1.05,
      fontFace: SANS, fontSize: 10.5, color: MUTED, align: "left", valign: "top", margin: 0
    });
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x + cardW / 2 - 0.72, y: cardY + cardH - 0.52, w: 1.44, h: 0.32, rectRadius: 0.16,
      fill: { color: GREEN_PALE }, line: { type: "none" }
    });
    slide.addText(c.tag, {
      x: x + cardW / 2 - 0.72, y: cardY + cardH - 0.52, w: 1.44, h: 0.32,
      fontFace: SANS, fontSize: 10, bold: true, color: GREEN_DARK, align: "center", valign: "middle", margin: 0
    });
  });

  pageNumber(slide, 4);
  slide.render();
}

// ============================================================
// Slide 5 — 分化面：鸿沟在加深（左文右图）
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: BG };
  contentHeader(slide, "FOR THE FEW", "分化面：鸿沟在加深", RED_DARK);

  const risks = [
    { k: "数据与算力集中", v: "头部机构垄断数据、算力与人才，数据鸿沟越拉越大" },
    { k: "算法歧视入场", v: "偏见随算法进入信贷审批，还可能遭遇「数据投毒」" },
    { k: "梯级替代冲击", v: "AI 从低端向高端逐级替代，中端岗位承压、收入两极化" }
  ];

  const rowH = 1.12, gap = 0.16, startY = 1.7, leftW = 5.6;
  risks.forEach((r, i) => {
    const y = startY + i * (rowH + gap);
    slide.addShape(pres.shapes.RECTANGLE, {
      x: CONTENT_X, y, w: leftW, h: rowH, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: SHADOW
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x: CONTENT_X, y, w: 0.07, h: rowH, fill: { color: RED }, line: { type: "none" }
    });
    slide.addShape(pres.shapes.OVAL, {
      x: CONTENT_X + 0.26, y: y + 0.32, w: 0.48, h: 0.48, fill: { color: RED_PALE }, line: { type: "none" }
    });
    slide.addText(`${i + 1}`, {
      x: CONTENT_X + 0.26, y: y + 0.32, w: 0.48, h: 0.48,
      fontFace: SERIF, fontSize: 16, bold: true, color: RED_DARK, align: "center", valign: "middle", margin: 0
    });
    slide.addText(r.k, {
      x: CONTENT_X + 0.95, y: y + 0.16, w: leftW - 1.2, h: 0.34,
      fontFace: SANS, fontSize: 13, bold: true, color: INK, align: "left", valign: "middle", margin: 0
    });
    slide.addText(r.v, {
      x: CONTENT_X + 0.95, y: y + 0.5, w: leftW - 1.2, h: 0.52,
      fontFace: SANS, fontSize: 11, color: MUTED, align: "left", valign: "top", margin: 0
    });
  });

  // 右侧论文截图（竖版，同 Slide 3）
  const imgH = 3.55, imgW = imgH * (1225 / 1650);
  const imgX = SLIDE_W - MARGIN - 0.35 - imgW, imgY = 1.86;
  slide.addText("论文「潜在问题」章节（中国知网）", {
    x: imgX - 0.06, y: 1.52, w: imgW + 0.12, h: 0.25,
    fontFace: SANS, fontSize: 9, color: MUTED, align: "center", valign: "middle", margin: 0
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: imgX - 0.06, y: imgY - 0.06, w: imgW + 0.12, h: imgH + 0.12,
    fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: SHADOW
  });
  slide.addImage({ path: "/workspace/ai-finance-debate/assets/paper_problems_1225x1650.png", x: imgX, y: imgY, w: imgW, h: imgH });

  pageNumber(slide, 5);
  slide.render();
}

// ============================================================
// Slide 6 — 天平的两端（左右对比）
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: BG };
  contentHeader(slide, "ON THE BALANCE", "天平的两端", NAVY);

  const colW = 3.8, colH = 3.5, colY = 1.62;
  const leftX = CONTENT_X, rightX = SLIDE_W - MARGIN - colW;

  // 左栏：普惠
  slide.addShape(pres.shapes.RECTANGLE, { x: leftX, y: colY, w: colW, h: colH, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: SHADOW });
  slide.addShape(pres.shapes.RECTANGLE, { x: leftX, y: colY, w: colW, h: 0.5, fill: { color: GREEN }, line: { type: "none" } });
  slide.addText("普惠 · 天平向左", {
    x: leftX, y: colY, w: colW, h: 0.5, fontFace: SERIF, fontSize: 15, bold: true,
    color: "FFFFFF", align: "center", valign: "middle", charSpacing: 1, margin: 0
  });
  const leftItems = ["服务成本大幅下降", "信息不对称得到缓解", "长尾客群首次被覆盖", "决策工具走向平民化"];
  leftItems.forEach((t, i) => {
    const y = colY + 0.72 + i * 0.68;
    slide.addShape(pres.shapes.OVAL, { x: leftX + 0.28, y: y + 0.08, w: 0.32, h: 0.32, fill: { color: GREEN_PALE }, line: { type: "none" } });
    slide.addText("✓", { x: leftX + 0.28, y: y + 0.08, w: 0.32, h: 0.32, fontFace: SANS, fontSize: 12, bold: true, color: GREEN_DARK, align: "center", valign: "middle", margin: 0 });
    slide.addText(t, { x: leftX + 0.76, y, w: colW - 1.0, h: 0.48, fontFace: SANS, fontSize: 12.5, color: INK, align: "left", valign: "middle", margin: 0 });
  });

  // 右栏：分化
  slide.addShape(pres.shapes.RECTANGLE, { x: rightX, y: colY, w: colW, h: colH, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: SHADOW });
  slide.addShape(pres.shapes.RECTANGLE, { x: rightX, y: colY, w: colW, h: 0.5, fill: { color: RED }, line: { type: "none" } });
  slide.addText("分化 · 天平向右", {
    x: rightX, y: colY, w: colW, h: 0.5, fontFace: SERIF, fontSize: 15, bold: true,
    color: "FFFFFF", align: "center", valign: "middle", charSpacing: 1, margin: 0
  });
  const rightItems = ["数据算力向巨头集中", "算法偏见固化歧视", "中端岗位被梯级替代", "技术红利马太效应"];
  rightItems.forEach((t, i) => {
    const y = colY + 0.72 + i * 0.68;
    slide.addShape(pres.shapes.OVAL, { x: rightX + 0.28, y: y + 0.08, w: 0.32, h: 0.32, fill: { color: RED_PALE }, line: { type: "none" } });
    slide.addText("!", { x: rightX + 0.28, y: y + 0.08, w: 0.32, h: 0.32, fontFace: SANS, fontSize: 12, bold: true, color: RED_DARK, align: "center", valign: "middle", margin: 0 });
    slide.addText(t, { x: rightX + 0.76, y, w: colW - 1.0, h: 0.48, fontFace: SANS, fontSize: 12.5, color: INK, align: "left", valign: "middle", margin: 0 });
  });

  // 中间天平图形：立柱 + 横梁 + 两个秤盘（全部位于两栏之间 4.3–5.7 的空档）
  const cx = CENTER_X, beamY = 2.6;
  slide.addShape(pres.shapes.ISOSCELES_TRIANGLE, { x: cx - 0.28, y: 4.35, w: 0.56, h: 0.5, fill: { color: NAVY }, line: { type: "none" } });
  slide.addShape(pres.shapes.RECTANGLE, { x: cx - 0.03, y: beamY, w: 0.06, h: 1.85, fill: { color: NAVY }, line: { type: "none" } });
  slide.addShape(pres.shapes.RECTANGLE, { x: cx - 0.5, y: beamY - 0.03, w: 1.0, h: 0.06, fill: { color: NAVY }, line: { type: "none" } });
  slide.addShape(pres.shapes.LINE, { x: cx - 0.5, y: beamY + 0.03, w: 0, h: 0.35, line: { color: NAVY, width: 1.5 } });
  slide.addShape(pres.shapes.LINE, { x: cx + 0.5, y: beamY + 0.03, w: 0, h: 0.35, line: { color: NAVY, width: 1.5 } });
  slide.addShape(pres.shapes.OVAL, { x: cx - 0.67, y: beamY + 0.38, w: 0.34, h: 0.16, fill: { color: GREEN }, line: { type: "none" } });
  slide.addShape(pres.shapes.OVAL, { x: cx + 0.33, y: beamY + 0.38, w: 0.34, h: 0.16, fill: { color: RED }, line: { type: "none" } });
  slide.addShape(pres.shapes.OVAL, { x: cx - 0.3, y: 1.7, w: 0.6, h: 0.6, fill: { color: CARD }, line: { color: NAVY, width: 1.5 } });
  slide.addText("VS", { x: cx - 0.3, y: 1.7, w: 0.6, h: 0.6, fontFace: SERIF, fontSize: 15, bold: true, color: NAVY, align: "center", valign: "middle", margin: 0 });

  pageNumber(slide, 6);
  slide.render();
}

// ============================================================
// Slide 7 — 两个真问题（讨论页）
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: BG };
  contentHeader(slide, "OPEN QUESTIONS", "两个真问题", NAVY);

  const cards = [
    {
      no: "Q1", q: "技术本身是中性的吗？",
      d: "谁掌握模型，谁就决定红利怎么分。算法背后站的，终究是人。", accent: NAVY, pale: "E8EDF5", dark: NAVY
    },
    {
      no: "Q2", q: "都用 AI，差距会缩小吗？",
      d: "散户和机构都上了 AI 的牌桌——差距是抹平了，还是换成了「算力差距」？", accent: RED, pale: RED_PALE, dark: RED_DARK
    }
  ];

  const cardW = 4.35, cardH = 2.55, gapX = 0.3, startX = (SLIDE_W - (2 * cardW + gapX)) / 2, cardY = 1.7;
  cards.forEach((c, i) => {
    const x = startX + i * (cardW + gapX);
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y: cardY, w: cardW, h: cardH, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: SHADOW
    });
    slide.addShape(pres.shapes.RECTANGLE, { x, y: cardY, w: cardW, h: 0.09, fill: { color: c.accent }, line: { type: "none" } });
    slide.addText(c.no, {
      x: x + 0.3, y: cardY + 0.3, w: 1.2, h: 0.75,
      fontFace: SERIF, fontSize: 40, bold: true, color: c.pale === "E8EDF5" ? "B9C7DE" : "F3C3BE",
      align: "left", valign: "middle", margin: 0
    });
    slide.addText(c.q, {
      x: x + 0.32, y: cardY + 1.12, w: cardW - 0.64, h: 0.5,
      fontFace: SERIF, fontSize: 17, bold: true, color: INK, align: "left", valign: "middle", charSpacing: 0.5, margin: 0
    });
    slide.addText(c.d, {
      x: x + 0.32, y: cardY + 1.68, w: cardW - 0.64, h: 0.7,
      fontFace: SANS, fontSize: 11.5, color: MUTED, align: "left", valign: "top", margin: 0
    });
  });

  // 底部「抛给大家讨论」标签
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: CENTER_X - 1.5, y: 4.62, w: 3.0, h: 0.44, rectRadius: 0.22,
    fill: { color: NAVY }, line: { type: "none" }, shadow: SHADOW
  });
  slide.addText("✋ 抛给大家讨论", {
    x: CENTER_X - 1.5, y: 4.62, w: 3.0, h: 0.44,
    fontFace: SANS, fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0
  });

  pageNumber(slide, 7);
  slide.render();
}

// ============================================================
// Slide 8 — 我们的初步判断
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: BG };
  contentHeader(slide, "OUR TAKE", "我们的初步判断", NAVY);

  const points = [
    { t: "普惠与分化同时发生", d: "二者不是二选一，方向取决于制度设计", accent: NAVY, pale: "E8EDF5", dark: NAVY },
    { t: "技术上「能用」，分配上「不均」", d: "工具普及了，但红利集中在头部", accent: RED, pale: RED_PALE, dark: RED_DARK },
    { t: "要划边界，也要给缓冲", d: "算法备案、分级监管划「四至范围」，就业政策兜底", accent: GREEN, pale: GREEN_PALE, dark: GREEN_DARK },
    { t: "普惠是政策选择", d: "它不是技术的默认结果，需要主动去争取", accent: "E8A33A", pale: "FBF1DE", dark: "B97E1E" }
  ];

  const rowH = 0.68, gap = 0.13, startY = 1.62;
  points.forEach((p, i) => {
    const y = startY + i * (rowH + gap);
    slide.addShape(pres.shapes.RECTANGLE, {
      x: CONTENT_X, y, w: CONTENT_W, h: rowH, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: SHADOW
    });
    slide.addShape(pres.shapes.RECTANGLE, { x: CONTENT_X, y, w: 0.07, h: rowH, fill: { color: p.accent }, line: { type: "none" } });
    slide.addShape(pres.shapes.OVAL, {
      x: CONTENT_X + 0.24, y: y + 0.14, w: 0.4, h: 0.4, fill: { color: p.pale }, line: { type: "none" }
    });
    slide.addText(`${i + 1}`, {
      x: CONTENT_X + 0.24, y: y + 0.14, w: 0.4, h: 0.4,
      fontFace: SERIF, fontSize: 13, bold: true, color: p.dark, align: "center", valign: "middle", margin: 0
    });
    slide.addText(p.t, {
      x: CONTENT_X + 0.85, y, w: 3.9, h: rowH,
      fontFace: SANS, fontSize: 13.5, bold: true, color: INK, align: "left", valign: "middle", margin: 0
    });
    slide.addText(p.d, {
      x: CONTENT_X + 4.85, y, w: CONTENT_W - 5.1, h: rowH,
      fontFace: SANS, fontSize: 11.5, color: MUTED, align: "left", valign: "middle", margin: 0
    });
  });

  // 底部结论条
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: CONTENT_X, y: 5.0, w: CONTENT_W, h: 0.42, rectRadius: 0.1,
    fill: { color: NAVY }, line: { type: "none" }
  });
  slide.addText("一句话：技术决定上限，制度决定方向。", {
    x: CONTENT_X, y: 5.0, w: CONTENT_W, h: 0.42,
    fontFace: SERIF, fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle", charSpacing: 1, margin: 0
  });

  pageNumber(slide, 8);
  slide.render();
}

// ============================================================
// Slide 9 — 结尾（深藏青）
// ============================================================
{
  const slide = pres.addSlide();
  slide.background = { color: NAVY };

  slide.addShape(pres.shapes.PIE, {
    x: 0, y: 0, w: 2.3, h: 2.3, angleRange: [180, 270],
    fill: { color: GREEN, transparency: 84 }, line: { type: "none" }
  });
  slide.addShape(pres.shapes.PIE, {
    x: SLIDE_W - 2.3, y: SLIDE_H - 2.3, w: 2.3, h: 2.3, angleRange: [0, 90],
    fill: { color: RED, transparency: 82 }, line: { type: "none" }
  });

  slide.addText("谢谢聆听 · 欢迎讨论", {
    x: 0.5, y: 1.75, w: 9, h: 1.0, fontFace: SERIF, fontSize: 40, bold: true,
    color: "F2F5F9", align: "center", valign: "middle", charSpacing: 2.5, margin: 0
  });

  const lineY = 2.98, segW = 1.1;
  slide.addShape(pres.shapes.RECTANGLE, { x: CENTER_X - segW - 0.55, y: lineY, w: segW, h: 0.035, fill: { color: GREEN }, line: { type: "none" } });
  slide.addShape(pres.shapes.RECTANGLE, { x: CENTER_X - 0.5, y: lineY, w: 1.0, h: 0.035, fill: { color: "5B6B84" }, line: { type: "none" } });
  slide.addShape(pres.shapes.RECTANGLE, { x: CENTER_X + 0.55, y: lineY, w: segW, h: 0.035, fill: { color: RED }, line: { type: "none" } });

  slide.addText([
    { text: "AI 是放大器：放大", options: { color: "C9D4E5" } },
    { text: "普惠", options: { color: GREEN, bold: true } },
    { text: "，也可能放大", options: { color: "C9D4E5" } },
    { text: "分化", options: { color: RED, bold: true } }
  ], {
    x: 0.5, y: 3.25, w: 9, h: 0.6, fontFace: SERIF, fontSize: 19,
    align: "center", valign: "middle", charSpacing: 1, margin: 0
  });

  slide.addText("金融学小组汇报 · 2026", {
    x: 0.5, y: 4.6, w: 9, h: 0.32, fontFace: SANS, fontSize: 11, color: "8296B2",
    align: "center", valign: "middle", charSpacing: 2, margin: 0
  });

  slide.render();
}

pres.writeFile({ fileName: "/workspace/AI让金融更普惠还是更分化.pptx" }).then(() => {
  console.log("PPTX written OK");
});
