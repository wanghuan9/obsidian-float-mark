# 实施任务清单

> 任务总数: 1
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
