# 实施任务清单

> 由 spec.md 生成
> 任务总数: 2
> 核心原则: 一次完成安全分片渲染、section 裁剪和生命周期控制，保持每个提交状态可编译可验证

## 依赖关系总览

Task 1 (阅读模式渲染根因修复与完整验证)
  → Task 2 (修复行内背景断点)

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `src/reading-view-renderer.ts` | 修改 | Task 1 | 改为节点内分片和重叠标注单次构建 |
| `src/main.ts` | 修改 | Task 1 | section 裁剪、observer 根节点和渲染代次控制 |
| `test/test-reading-view-renderer.mjs` | 修改 | Task 1 | 增加 DOM、跨块、重叠和清理测试 |
| `package.json` | 修改 | Task 1 | 增加 DOM 测试依赖并保持测试入口 |
| `package-lock.json` | 修改 | Task 1 | 锁定测试依赖 |
| `src/reading-view-renderer.ts` | 修改 | Task 2 | 纳入块内空白节点并提升完整代码元素 wrapper |
| `styles.css` | 修改 | Task 2 | 让完整覆盖的行内代码背景由标注 wrapper 统一绘制 |
| `test/test-reading-view-renderer.mjs` | 修改 | Task 2 | 增加连续背景与部分代码选区回归测试 |
| `main.js` | 生成 | Task 2 | 更新插件构建产物 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `renderReadingMarks()` | 内部实现重写，签名保持 | `src/main.ts` | Task 1 |
| `getMarksInRenderedSection()` | 替换为 section 局部 anchor 构建 | `src/main.ts` | Task 1 |

### 构建系统变更

- `package.json`：增加 `jsdom` 测试依赖。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | Obsidian section 行号为 0 基 | Task 1 | 延续现有过滤逻辑，并用源码行偏移测试边界 |
| 2 | 重叠标注点击只能打开一个标注 | Task 1 | 最具体的内层标注优先，与编辑模式 closest 元素行为一致 |
| 3 | Preview 根节点可能被替换 | Task 1 | 每次同步 observer 时比较实际根节点并重新连接 |

## 任务列表

### 任务 1: [x] 阅读模式渲染根因修复与完整验证
- 文件: `src/reading-view-renderer.ts`（修改）, `src/main.ts`（修改）, `test/test-reading-view-renderer.mjs`（修改）, `package.json`（修改）, `package-lock.json`（修改）
- 依赖: 无
- spec 映射: 4.1, 4.2, 4.3, 4.4
- 说明: 用节点内分片替换跨块 Range 抽取，补齐 section 和生命周期控制，并完成自动化及实机验证
- context:
  - `src/reading-view-renderer.ts:renderReadingMarks()` — 直接修改目标，负责匹配、清理和 DOM 包装
  - `src/main.ts:renderReadingModeMarks()` — Markdown post-processor 上游入口
  - `src/main.ts:renderPreviewMarksForView()` — Preview observer 上游入口
  - `src/editor-extension.ts:createSideMarkEditorExtension()` — 编辑模式样式语义参考
  - `src/storage.ts:relocateDocument()` — anchor 状态和持久化下游
- 验收标准:
  - [x] `npm run build` 通过且无新 warning
  - [x] `npm test` 全部通过
  - [x] Code Review PASS
  - [x] 跨块和重叠 DOM 测试验证原结构可恢复
  - [x] 截图对应真实笔记连续切换模式 10 次无异常
- 子任务:
  - [x] 1.1: 安装并配置 DOM 测试依赖
  - [x] 1.2: 实现节点内分片和重叠标注构建
  - [x] 1.3: 实现 section 局部 anchor 裁剪
  - [x] 1.4: 修复 Preview observer 根节点和异步代次控制
  - [x] 1.5: 补充自动化测试并完成实机回归

### 任务 2: [x] 修复行内背景断点
- 文件: `src/reading-view-renderer.ts`（修改）, `styles.css`（修改）, `test/test-reading-view-renderer.mjs`（修改）, `main.js`（生成）
- 依赖: Task 1
- spec 映射: 4.1, 4.4, 5
- 说明: 保持块级 DOM 安全分片，同时覆盖块内空格和完整行内代码盒，消除整段背景白缝
- 验收标准:
  - [x] 同一块内空格节点位于背景 wrapper 内
  - [x] 完整选中的 `code` 左右 padding 由连续背景覆盖
  - [x] 部分代码选区不扩张到整个 `code`
  - [x] 清理和重复渲染后原 DOM 完整恢复
  - [x] Code Review PASS
  - [x] `npm test`、`npm run build`、`git diff --check` 全部通过
  - [x] 构建并安装到目标 Obsidian Vault
- 子任务:
  - [x] 2.1: 增加空格与完整代码盒复现测试
  - [x] 2.2: 实现安全行内 wrapper 提升与清理
  - [x] 2.3: 完成回归、构建和安装

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 4.1 | Task 1 | 节点内分片与重叠标注 |
| 4.2 | Task 1 | 跨 section 局部 anchor |
| 4.3 | Task 1 | observer 和渲染代次 |
| 4.4 | Task 1 | 自动化与实机测试 |
| 4.1 | Task 2 | 块内空格与完整行内代码连续背景 |
| 4.4 | Task 2 | DOM 连续性和部分选区回归测试 |
| 5 | Task 2 | 构建与安装验收 |
