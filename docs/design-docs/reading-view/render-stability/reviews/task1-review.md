# Task 1 Code Review Report: 阅读模式渲染稳定性修复

> **Review Date**: 2026-07-12
> **Task**: Task 1 — 阅读模式渲染根因修复与完整验证
> **Scope**: obsidian-float-mark，5 个源代码/测试/配置文件
> **Reviewers**: correctness-reviewer + quality-reviewer

## 1. Review Scope

1. `src/reading-view-renderer.ts` — 节点内分片、section 裁剪和文本匹配
2. `src/main.ts` — Preview observer、fallback 和异步渲染代次
3. `test/test-reading-view-renderer.mjs` — DOM 与真实数据回归测试
4. `package.json` — jsdom 测试依赖
5. `package-lock.json` — 依赖锁定

关联文档：`spec.md` 4.1-4.4，`tasks.md` Task 1。

## 2. Review Findings

| ID | 优先级 | 问题 | 最终处置 |
|----|--------|------|----------|
| F-1 | P0 | 无 section 元数据 fallback 逐 section 清除跨 section 标注 | 修复后关闭 |
| F-2 | P1 | observer 监听可替换根节点，无法感知根替换 | 修复后关闭 |
| F-3 | P1 | 重复文本缺少块/列/上下文消歧 | 修复后关闭 |
| F-4 | P1 | section 行偏移按 section 重扫全文 | 修复后关闭 |
| F-5 | P1 | 行内代码下划线被误判为 Markdown 强调 | 修复后关闭 |
| F-6 | P1 | `<br>` 软换行未进入渲染行映射 | 修复后关闭 |
| F-7 | P1 | 源码列号与 Markdown 渲染列号不一致 | 修复后关闭 |
| F-8 | P1 | 40 字符截断链接上下文和 section 临时上下文失效 | 修复后关闭 |

## 3. Fixes

| ID | 修复方式 | 犯错原因 |
|----|----------|----------|
| F-1 | fallback 改为 preview root 单次渲染 | 设计考虑不足 |
| F-2 | observer 改为监听稳定的 `view.contentEl` | 设计考虑不足 |
| F-3 | 增加块换行、列位置和 prefix/suffix 评分 | 执行遗漏 |
| F-4 | 按文件缓存 source line starts，偏移使用数组和二分 | 性能考虑不足 |
| F-5 | 强调定界符增加词边界并保护下划线内容 | 执行遗漏 |
| F-6 | 相邻 Text 节点间检测 `<br>` | 执行遗漏 |
| F-7 | 用渲染上下文优先于源码列距离选择候选 | 设计考虑不足 |
| F-8 | 清理截断链接尾部并重建 section 局部上下文 | 执行遗漏 |

## 4. Re-review

- Round 2：关闭 F-1、F-2、F-4、F-5，继续修复重复文本边界。
- Round 3：关闭同一行和 `<br>` 重复文本问题，继续修复 Markdown 列偏移。
- Round 4：关闭上下文列偏移，继续修复真实 40 字符截断上下文。
- Round 5：correctness-reviewer 与 quality-reviewer 均 PASS，无新增 P0/P1。

## 5. 裁决明细

所有 finding 均基于测试或真实 sidecar 数据复现并保留，完成修复后经定向复审关闭。

## 6. 总体结论: PASS

阅读模式跨块结构、跨 section、重叠、重复文本和生命周期问题均已通过双 reviewer 审查。

## 7. 正式问题

无。

## 8. Follow-up Items

无阻塞项。`sourceLineStartsCache` 仅在插件卸载时清空，长期访问大量文件时可考虑增加淘汰策略，当前占用有限。

## 9. Review Summary

- **Review 轮次**: 5 轮
- **P0 修复**: 1 项
- **P1 修复**: 7 项
- **P2 keep**: 0 项
- **最终结论**: PASS

## 10. Test Result

- `npm test`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS
- 真实 Obsidian 1.12.7 回归：同一问题标注连续切换编辑/阅读模式 10 次，5 段目标文本每次均可见
- 最终阅读模式截图确认：标题、4 条列表、行内代码和后续块结构正常，无空白块、错位或样式缺失
- 安装校验：源码、`Documents/obsidian` 和当前 `opt-knowledge` 仓库插件产物 SHA-256 一致
- DOM 回归覆盖：跨块、行内代码、section、节点边界、重叠、幂等清理、重复文本、`<br>`、截断 Markdown 上下文
