# Task 1 Code Review Report: 块级浮框菜单定位

> **Review Date**: 2026-07-12
> **Task**: Task 1 — 实现块菜单 50% 阈值定位与滚动
> **Scope**: obsidian-float-mark，5 个功能与测试文件
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

## 1. Review Scope

### 改动文件清单

1. `src/block-menu-position.ts` — 新增无 DOM 依赖的定位纯函数。
2. `src/hover-block-toolbar.ts` — 接入 50% 阈值、方向类和无重叠坐标。
3. `styles.css` — 隔离主菜单盒模型并按方向执行入场动画。
4. `test/test-block-menu-position.mjs` — 覆盖阈值、双侧紧张和极小空间。
5. `package.json` — 将定位测试加入完整测试命令。

### 关联文档

- Spec: `spec.md` §2-4
- Tasks: `tasks.md` Task 1

### 关键设计决策

1. 下方可展示自然菜单高度至少 50% 时向下并滚动，否则在上方空间更大时上浮。
2. 菜单上下方向都与浮框保持 6px 间距。
3. 主菜单盒模型与子菜单隔离，不改变子菜单定位。

## 2. Round 1: Findings

### 2.1 性能类

无。

### 2.2 健壮性类

**F-1 (P1) — 下展动画会在起始阶段贴近浮框**
- **位置**: `styles.css`、`src/hover-block-toolbar.ts`
- **问题**: 统一的 `translateY(-6px)` 会让下展菜单从 0px 间距过渡到 6px。
- **证据**: 下展最终 top 为 `pillBottom + 6px`，初态向上偏移 6px 后恰好贴住浮框。

**F-2 (P1) — 极小高度可能被外层 padding 撑破**
- **位置**: `styles.css`、`src/block-menu-position.ts`
- **问题**: `maxHeight` 小于 8px 时，外层 4px 上下 padding 可能使真实盒子超出计算边界。
- **证据**: `maxHeight=1px` 时 content/padding 盒无法按计算结果压缩。

### 2.3 工程规范类

**F-3 (P1) — 主菜单盒模型修改连带影响子菜单**
- **位置**: `styles.css`
- **问题**: 共用选择器上的 `border-box` 会把子菜单外宽从 198px 改为 190px。
- **证据**: 子菜单同时带有 `side-mark-block-menu side-mark-block-submenu` 两个类。

### 2.4 契约破坏类

无。

### 2.5 需求/设计符合度类

无。

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 动画初态贴近浮框 | 根据展开方向设置远离浮框的初态偏移 | 执行遗漏 |
| F-2 | P1 | 极小高度被 padding 撑破 | 外层 padding 归零，4px padding 移入可裁剪列表 | 设计考虑不足 |
| F-3 | P1 | 子菜单宽度被改变 | 盒模型、宽度和 padding 规则只限定到非子菜单主菜单 | 执行遗漏 |

## 4. Round 2: Re-review

- F-1：向上和向下动画均从 12px 间距过渡到 6px，PASS。
- F-2：主菜单外层可压缩到 1px，内部内容由 overflow 裁剪，PASS。
- F-3：子菜单继续使用原 190px content-box 与 4px padding，PASS。
- 无新增 finding。
- **结论: PASS**

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep，已修复 | 动画 transform 可直接推导出初态间距为 0px |
| F-2 | robustness | P1 | keep，已修复 | CSS padding 是不可忽略的盒模型尺寸 |
| F-3 | standards | P1 | keep，已修复 | 子菜单 DOM 确实复用主菜单类 |

## 6. 总体结论: PASS

50% 阈值、滚动高度、无重叠间距、动画和子菜单隔离均通过双路复审。

## 7. 正式问题

无。

## 8. Follow-up Items

无。

## 9. Review Summary

- **Review 轮次**: 2 轮（Round 1 3 项 P1 → 修复 3 项 → Round 2 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 3 项
- **P2 keep**: 0 项
- **Follow-up**: 0 项
- **最终结论**: PASS

## 10. Phase 3 测试结果

- `npm test`：9 个测试脚本全部 PASS。
- `npx tsc --noEmit`：PASS。
- `npm run build`：PASS，生产 `main.js` 已生成。
- `git diff --check`：PASS。
- 代码规范格式检查：PASS（本次无 Java/XML 变更）。
- 安装校验：`main.js`、`styles.css` 与目标 Vault 中产物 SHA-256 完全一致。
- Obsidian 1.12.7 实机：中部菜单向下并可滚动，底部菜单上浮且不遮挡浮框，子菜单尺寸未变化。
