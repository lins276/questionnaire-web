# Bug 修复 Plan · 问卷网页 v3

## 根因分析（已定位）

### Bug 1：明明答了还报「请先作答」，提交按钮走不动

**操作序列：** 用户先点「提交问卷」→ 校验扫到未答题 → `flashMissing()` 在题目下挂红色 DOM 提示 → 用户再点选作答 → state.answers 里值更新了 → 但旧的 `.missing-note` DOM **永远不会被移除** → 视觉上就像"明明答了还报没答"。

**代码根因：** `flashMissing()` 只负责「新增」红提示 DOM（[script.js:209-225](file:///c:/Users/%E6%9E%97%E6%9F%8F%E7%BF%B0/OneDrive/Desktop/%E9%97%AE%E5%8D%B7/questionnaire-web/script.js#L209-L225)），但整个文件**没有任何一处**在用户作答后主动清理 `.missing-note` DOM。`onInputChange` 里 radio 选中后也没移除 hint。

### Bug 2：选完选项后，已选状态不够直观

**截图观察：** D5 选项块其实已经有视觉反馈（深青色底 + 左侧 3px 竖条 + radio 小圆点），但用户说"不直观"，推测是：
- radio 选中后的实心圆点 CSS 里是 `inset: 3px`（外框 16px → 内圆 10px），且用的是白色背景圆，在深青色容器里对比度不够
- 左侧竖条只有 3px，和整块 option 宽度比偏细
- 量表 1-5 的选中态（深蓝底 + 白字）可能和未选中态（浅灰）在手机上对比度不够强

---

## 修复方案（每个问题 2-3 个可选改法，等用户选）

### Fix Bug 1 · 清理遗留红提示

| 方案 | 描述 | 改动范围 |
|---|---|---|
| **A（推荐）** | 在 `onInputChange` 和 `onInputText` 里，每次用户作答后，主动移除对应 question 下的 `.missing-note` DOM。加一个 `clearMissingHint(qid)` 辅助函数，single/multi/scale/matrix 各分支里统一调用 | script.js 约 +30 行 |
| B | 每次 `nextSection` / `submit` 前，全局扫一遍 `.missing-note[data-missing]`，如果该题已经在 state.answers 里有值，就移除 | script.js 约 +15 行 |
| C | 把红提示改成「浮动 toast」，3 秒后自动消失，不挂在 DOM 里 → 提交失败时弹 toast，不持久化 | 改 UX，加 toast 组件约 +40 行 |

### Fix Bug 2 · 强化选中态视觉反馈

| 方案 | 描述 | 改动范围 |
|---|---|---|
| **A（推荐）** | 三处一起加强：① radio 选中圆点改实心 + 外发光；② 左侧竖条加粗到 4px 并加 box-shadow；③ 量表选中格加 `box-shadow: 0 0 0 2px var(--c-primary-soft)` 外描边 | style.css 约改 6 处，不改 JS |
| B | 方案 A + 每个已选选项尾部加一个小 ✓ icon（check-circle SVG 16px，主色） | style.css 同上 + script.js renderSingle/renderMulti 各加 1 行条件渲染 |
| C | 保留现有样式，只把选项容器整体加上 `.option--selected` class（CSS 已经有这个 class 但只写了 inset 竖条，补上 `box-shadow` + `border-width: 2px`） | 纯 CSS 改，最省事 |

---

## 待用户确认

1. Bug 1 选哪个方案？A / B / C
2. Bug 2 选哪个方案？A / B / C

（默认推荐 A+A，改代码最少、体验提升最直接）
