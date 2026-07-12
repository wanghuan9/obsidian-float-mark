# Task 2 Code Review Report: 统一评论与高亮的连续视觉策略

> **Review Date**: 2026-07-12
> **Task**: Task 2 — 统一评论与高亮的连续视觉策略
> **Scope**: obsidian-float-mark，评论连续视觉、阅读匹配与对应测试
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

## 1. Review Scope

### 改动文件清单

1. `src/mark-appearance.ts` — 提取评论与显式背景高亮的共享连续视觉判定。
2. `src/editor-decorations.ts` — 评论视觉层复用 outer decorations，内容层保留交互属性。
3. `src/reading-view-renderer.ts` — 评论复用连续阅读渲染，并修复截断代码边界匹配。
4. `styles.css` — 清除评论内容层的重复背景和下划线。
5. `test/test-mark-appearance.mjs` — 覆盖连续视觉判定边界。
6. `test/test-editor-decorations.mjs` — 覆盖评论 outer decoration 与点击层。
7. `test/test-reading-view-renderer.mjs` — 覆盖真实评论、代码段和清理回归。

### 关联文档

- Spec: `spec.md` §2-4
- Tasks: `tasks.md` Task 2

### 关键设计决策

1. 评论始终具有连续视觉层；高亮仅在显式背景非 `none` 时具有连续视觉层。
2. 编辑模式视觉层进入 outer decorations，文字颜色、点击 ID 和标题保留在普通 decoration。
3. 阅读模式只提升完整被标记的行内代码，部分代码选区不得扩张。

## 2. Review Findings

### 2.1 健壮性与正确性

- **F-1 (P1)**：边界成立时删除了所有未配对反引号，可能误删不同长度的可见反引号。
- **F-2 (P1)**：反斜杠转义只检查前一字符，偶数反斜杠场景匹配失败。
- **F-3 (P1)**：prefix 对应 closing run 在边界处理前与后续同长度字面反引号误配。
- **F-4 (P1)**：转义首个反引号后紧邻反引号形成 opener 时，原始 run 合并导致配对失败。
- **F-5 (P1)**：代码内容移除 delimiter 后又被通用 Markdown 正则剥离，错误缩小标注范围。
- **F-6 (P1)**：固定占位符可能由 Markdown 清理过程间接生成并发生碰撞。

### 2.2 需求/设计符合度

- **F-7 (P2)**：共享连续视觉判定一度包含带背景的 underline，超出已批准的评论/高亮范围。

### 2.3 性能

- **F-8 (P2)**：逐个未配对 run 向后寻找 closing run，最坏复杂度为 O(n²)。
- **F-9 (P2)**：逐个代码占位符执行 `split/join`，恢复阶段为 O(k·n)。

## 3. Fixes and Root Causes

| ID | 修复方式 | 犯错原因 |
|----|----------|----------|
| F-1 | 按 prefix/suffix 方向和 run 长度只移除对应边界 delimiter | 设计考虑不足 |
| F-2 | 统一按连续反斜杠奇偶性判断转义 | 执行遗漏 |
| F-3 | 内部配对前保留 prefix closing 与 suffix opening | 设计考虑不足 |
| F-4 | 分离有效 opener 与原始 closing run，并按位置配对 | 设计考虑不足 |
| F-5 | 先保护完整及截断代码内容，清理其他 Markdown 后原样恢复 | 设计考虑不足 |
| F-6 | 使用原文未出现的 sentinel 生成占位符 | 执行遗漏 |
| F-7 | 连续判定限制为 comment 或显式背景 highlight | Spec 理解偏差 |
| F-8 | 按 run 长度预计算 closing 位置并二分查找 | 性能考虑不足 |
| F-9 | 使用单一 sentinel 和一次正则恢复全部内容 | 性能考虑不足 |

## 4. Re-review

- 共 7 轮 review/re-review。
- 每轮 P1/P2 均转换为定向回归测试后修复。
- correctness-reviewer 最终结论：PASS，无剩余 P0/P1/P2。
- quality-reviewer 最终结论：PASS，无剩余 P0/P1/P2。

## 5. 裁决明细

| ID | 最终处置 | 裁决依据 |
|----|----------|----------|
| F-1 至 F-9 | keep 并已修复 | 对应反例均可在阅读匹配或复杂度分析中复现，修复后由新增测试及双 reviewer 验证通过 |

## 6. 总体结论: PASS

评论已复用高亮的连续视觉策略，阅读匹配边界和相关性能问题已修复，最终双 reviewer 均未发现剩余问题。

## 7. 正式问题

无。

## 8. Follow-up Items

无。

## 9. Review Summary

- **Review 轮次**: 7 轮
- **P0 修复**: 0 项
- **P1 修复**: 6 项
- **P2 修复**: 3 项
- **Follow-up**: 0 项
- **最终结论**: PASS

## 10. Phase 3 测试结果

- `npm test`：8 个测试脚本全部 PASS。
- `npx tsc --noEmit`：PASS。
- `npm run build`：PASS，生产 `main.js` 已生成。
- `git diff --check`：PASS。
- 代码规范格式检查：PASS（本次无 Java/XML 变更）。
- 安装校验：`main.js`、`manifest.json`、`styles.css` 与目标 Vault 中产物 SHA-256 完全一致。
- Obsidian 1.12.7 实机：评论在编辑/阅读模式均可见且连续，同文档高亮和行内代码样式无回归。
