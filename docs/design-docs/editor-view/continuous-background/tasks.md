# 实施任务清单

> 任务总数: 2
> 核心原则: 背景层与交互/文字层分离，保持原始范围和既有交互语义

## 任务列表

### 任务 1: [x] 拆分编辑模式背景与内容 decoration
- 文件: `src/editor-decorations.ts`（新建）, `src/editor-extension.ts`（修改）, `test/test-editor-decorations.mjs`（新建）, `package.json`（修改）, `main.js`（生成）
- spec 映射: 2, 3, 4
- 验收标准:
  - [x] 显式背景使用 `EditorView.outerDecorations`
  - [x] 文字颜色、点击 ID 和标题保留在普通 decoration
  - [x] 普通空格、多个行内代码、局部文字色、部分选区、跨行和评论场景测试通过
  - [x] 阅读模式回归通过
  - [x] Code Review PASS
  - [x] `npm test`、`npm run build`、`git diff --check` 和格式检查通过
  - [x] 构建并安装到目标 Obsidian Vault，双模式实机验证通过
- 子任务:
  - [x] 1.1: 增加 decoration 分层失败测试
  - [x] 1.2: 实现纯 decoration 分层构建器并接入 ViewPlugin
  - [x] 1.3: 完成审查、回归、构建、安装和实机验收

### 任务 2: [x] 统一评论与高亮的连续视觉策略
- 文件: `src/mark-appearance.ts`（修改）, `src/editor-decorations.ts`（修改）, `src/reading-view-renderer.ts`（修改）, `styles.css`（修改）, `test/test-editor-decorations.mjs`（修改）, `test/test-reading-view-renderer.mjs`（修改）, `main.js`（生成）
- 依赖: Task 1
- spec 映射: 1, 2, 3, 4
- 验收标准:
  - [x] 编辑模式评论复用 outer decoration，背景和下划线连续
  - [x] 评论普通 decoration 保留点击 ID 和标题，不重复绘制视觉层
  - [x] 阅读模式真实未配对反引号评论可匹配并显示
  - [x] 阅读模式评论复用空格与完整行内代码提升，部分代码选区不扩张
  - [x] 高亮、局部文字色、评论点击、重复渲染和清理无回归
  - [x] Code Review PASS
  - [x] `npm test`、`npm run build`、`git diff --check` 和格式检查通过
  - [x] 构建安装到目标 Vault，编辑/阅读模式实机验证通过
- 子任务:
  - [x] 2.1: 使用真实评论数据增加失败测试
  - [x] 2.2: 提取连续视觉判定并接入编辑/阅读模式
  - [x] 2.3: 完成审查、回归、构建、安装和实机验收
