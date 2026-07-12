# 实施任务清单

> 由 spec.md 生成
> 任务总数: 1
> 核心原则: 先用纯函数确定有效背景，再把结果接入侧边栏预览和继承标识

## 依赖关系总览

Task 1 (解析并展示继承背景)

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `src/mark-appearance.ts` | 新建 | Task 1 | 解析标注的有效背景及继承状态 |
| `src/sidebar-view.ts` | 修改 | Task 1 | 卡片预览和元信息使用有效背景 |
| `src/i18n.ts` | 修改 | Task 1 | 增加继承标签与说明文案 |
| `styles.css` | 修改 | Task 1 | 虚线色环和继承胶囊样式 |
| `test/test-mark-appearance.mjs` | 新建 | Task 1 | 有效背景规则测试 |
| `test/test-i18n.mjs` | 修改 | Task 1 | 中英文继承文案测试 |
| `package.json` | 修改 | Task 1 | 增加测试入口 |
| `main.js` | 生成 | Task 1 | 更新插件构建产物 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `resolveMarkBackground()` | 新增内部纯函数 | `SideMarkSidebarView.renderMarkCard()` | Task 1 |
| `SideMarkSidebarView.renderMarkCard()` | 增加同文档 marks 入参 | `render()` | Task 1 |

### 构建系统变更

- `package.json`：把 `test/test-mark-appearance.mjs` 加入 `npm test`。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | 多个背景同时覆盖 | Task 1 | 选择最小完整覆盖范围，同范围取文档靠后项 |
| 2 | 部分覆盖无法用单色表达 | Task 1 | 不显示继承，保留无背景状态 |
| 3 | 继承标识被误认为可单独编辑 | Task 1 | 使用虚线环和说明文案明确其来源，不改变样式编辑行为 |

## 任务列表

### 任务 1: [x] 解析并展示继承背景
- 文件: `src/mark-appearance.ts`（新建）, `src/sidebar-view.ts`（修改）, `src/i18n.ts`（修改）, `styles.css`（修改）, `test/test-mark-appearance.mjs`（新建）, `test/test-i18n.mjs`（修改）, `package.json`（修改）, `main.js`（生成）
- 依赖: 无
- spec 映射: 3, 4, 5
- 说明: 计算完整覆盖当前标注的有效背景，并按方案 B 在侧边栏预览、色点和标签中展示
- context:
  - `src/sidebar-view.ts:renderMarkCard()` — 直接接入目标
  - `src/reading-view-renderer.ts:sortPlannedMarks()` — 重叠范围优先级参考
  - `src/types.ts:SideMark` — 标注范围、状态和样式结构
  - `styles.css:.side-mark-marker-meta` — 当前侧边栏样式元信息
- 验收标准:
  - [x] `node test/test-mark-appearance.mjs` 通过
  - [x] 侧边栏继承背景规则测试覆盖完整覆盖、自身背景、部分覆盖和状态边界
  - [x] 中英文继承文案测试通过
  - [x] Code Review PASS
  - [x] `npm test`、`npm run build`、`git diff --check` 全部通过
  - [x] 真实 Obsidian 侧边栏显示虚线色环和“继承”标签
- 子任务:
  - [x] 1.1: 编写失败测试
  - [x] 1.2: 实现有效背景解析
  - [x] 1.3: 接入侧边栏预览和元信息
  - [x] 1.4: 增加继承视觉与中英文文案
  - [x] 1.5: 构建、安装并完成实机验收

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 3 | Task 1 | 有效背景计算规则 |
| 4 | Task 1 | 方案 B 侧边栏表现 |
| 5 | Task 1 | 自动化、构建和实机验收 |
