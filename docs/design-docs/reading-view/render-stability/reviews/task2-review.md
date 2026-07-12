# Task 2 Code Review Report: 行内背景连续性修复

> **Review Date**: 2026-07-12
> **Task**: Task 2 — 修复行内背景断点
> **Reviewers**: correctness-reviewer + quality-reviewer

## 1. Review Scope

1. `src/reading-view-renderer.ts` — 块内空白筛选、完整行内代码共同 wrapper 提升与清理
2. `styles.css` — 完整覆盖行内代码的透明背景规则
3. `test/test-reading-view-renderer.mjs` — 连续背景和对抗场景回归测试
4. `main.js` — 插件构建产物

## 2. Review Findings

| ID | 优先级 | 问题 | 最终处置 |
|----|--------|------|----------|
| F-1 | P1 | 重叠标注会把完整 code 分成多个 wrapper，单子节点判定无法提升 | 改为识别覆盖所有文本节点的共同 wrapper |
| F-2 | P1 | 纯文字色完整标注会透明化原生 code 背景 | 仅在共同 wrapper 存在显式背景时提升 |
| F-3 | P1 | fenced code block 会被误当作行内 code 提升 | 排除 `pre > code` |
| F-4 | P1 | 块间格式化空白可能被包装 | 仅接收前后内容属于同一叶子块的空白节点 |
| F-5 | P1 | 仅提升背景 wrapper 会反转完整重叠标注的嵌套层级 | 显式背景作为门槛，按原顺序提升全部共同 wrapper |

## 3. Re-review

- Round 1：发现 F-1 至 F-4，补充对抗测试并修复。
- Round 2：correctness-reviewer PASS；quality-reviewer 发现 F-5。
- Round 3：保留全部共同 wrapper 的原嵌套顺序，双 reviewer 最终 PASS。

## 4. 总体结论: PASS

同一块内普通空格和完整行内代码背景连续；部分代码选区、纯文字色、重叠标注、代码块结构和清理流程均无回归。

## 5. Test Result

- `npm test`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS
- DOM 回归：普通空格、完整/部分行内代码、重叠标注、纯文字色、`pre > code`、块间格式化空白、重复渲染和清理全部通过
- Obsidian 1.12.7 实机：截图对应整行红色背景在普通空格及行内代码左右 padding 处连续
- 安装校验：源码构建产物与 `/Users/wanghuan/Documents/obsidian/.obsidian/plugins/float-mark/` SHA-256 一致
