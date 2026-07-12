# 实施任务清单

> 由 spec.md 生成
> 任务总数: 2
> 核心原则: 先定义并测试统一点击策略，再接入两种模式并验证重叠样式

## 依赖关系总览

Task 1 (建立标注点击隔离策略)
  ↓
Task 2 (接入编辑/阅读模式并完成回归验证)  ← 依赖 Task 1

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `src/mark-click-guard.ts` | 新建 | Task 1 | 统一非空选区点击隔离策略 |
| `test/test-mark-click-guard.mjs` | 新建 | Task 1 | 点击策略和 DOM Selection 单测 |
| `src/editor-extension.ts` | 修改 | Task 2 | 编辑模式阻止选区触发旧标注点击 |
| `src/reading-view-renderer.ts` | 修改 | Task 2 | 阅读模式阻止选区触发旧标注点击 |
| `test/test-reading-view-renderer.mjs` | 修改 | Task 2 | 相似文本重叠样式和点击回归 |
| `package.json` | 修改 | Task 1 | 增加点击策略测试入口 |
| `main.js` | 生成 | Task 2 | 更新插件构建产物 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `shouldOpenMarkForSelection()` | 新增内部函数 | 编辑扩展、阅读渲染器 | Task 1, Task 2 |
| `hasNonEmptyDomSelection()` | 新增内部函数 | 阅读渲染器 | Task 1, Task 2 |
| `SideMarkEditorPlugin.handleMarkClick()` | 内部行为调整 | CodeMirror 点击事件 | Task 2 |
| `createReadingMarkWrapper()` | 内部行为调整 | 阅读模式 wrapper 点击事件 | Task 2 |

### 构建系统变更

- `package.json`：把 `test/test-mark-click-guard.mjs` 加入现有 `npm test` 链路。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | DOM Selection 可能只含空白 | Task 1, Task 2 | 仅非折叠且 `toString().trim()` 非空时视为有效选区 |
| 2 | 无选区点击旧标注可能回归 | Task 1, Task 2 | 单测同时验证允许路径，并做实机点击检查 |
| 3 | 重叠标注可能互相覆盖样式 | Task 2 | 使用截图相似文本断言外层背景类与内层文字类分别存在 |

## 任务列表

### 任务 1: [x] 建立标注点击隔离策略
- 文件: `src/mark-click-guard.ts`（新建）, `test/test-mark-click-guard.mjs`（新建）, `package.json`（修改）
- 依赖: 无
- spec 映射: 4.1, 5
- 说明: 提供编辑/阅读模式共享的“有选区不打开旧标注”判断，并用纯函数和 JSDOM Selection 验证两条分支
- context:
  - `src/editor-extension.ts:handleMarkClick()` — 编辑模式上游调用方
  - `src/reading-view-renderer.ts:createReadingMarkWrapper()` — 阅读模式上游调用方
  - `src/dom-utils.ts:getActiveSelection()` — DOM Selection 获取方式参考
- 验收标准:
  - [x] `node test/test-mark-click-guard.mjs` 通过
  - [x] 非空选区返回禁止打开，空选区返回允许打开
  - [x] TypeScript 编译通过且无新 warning
- 子任务:
  - [x] 1.1: 先编写失败测试
  - [x] 1.2: 实现最小点击策略
  - [x] 1.3: 把测试加入 `npm test`

### 任务 2: [x] 接入两种模式并完成回归验证
- 文件: `src/editor-extension.ts`（修改）, `src/reading-view-renderer.ts`（修改）, `test/test-reading-view-renderer.mjs`（修改）, `main.js`（生成）
- 依赖: Task 1
- spec 映射: 4.2, 4.3, 5
- 说明: 在旧标注点击入口接入策略，并验证截图相似文本的外层背景与内层文字色只作用于各自范围
- context:
  - `src/mark-click-guard.ts:shouldOpenMarkForSelection()` — Task 1 产出的策略
  - `src/editor-extension.ts:handleMarkClick()` — 编辑模式直接修改目标
  - `src/reading-view-renderer.ts:createReadingMarkWrapper()` — 阅读模式直接修改目标
  - `src/main.ts:showMarkStylePopoverForView()` — 选区工具栏创建短范围标注的下游
  - `src/main.ts:openMark()` — 必须避免误调用的旧标注编辑入口
- 验收标准:
  - [x] 相似文本 DOM 测试仅短范围 wrapper 带文字色类
  - [x] 阅读模式有选区点击不回调、无选区点击正常回调
  - [x] `npm test`、`npm run build`、`git diff --check` 全部通过
  - [x] 真实 Obsidian 编辑/阅读模式验证通过
  - [x] Code Review PASS
- 子任务:
  - [x] 2.1: 接入编辑模式点击隔离
  - [x] 2.2: 接入阅读模式点击隔离
  - [x] 2.3: 补充截图相似文本和点击回归测试
  - [x] 2.4: 构建、安装并完成实机验收

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 4.1 | Task 1 | 统一点击策略与单测 |
| 4.2 | Task 2 | 编辑/阅读模式接入 |
| 4.3 | Task 2 | 外层背景与内层文字色重叠渲染 |
| 5 | Task 1, Task 2 | 自动化、构建和实机验收 |
