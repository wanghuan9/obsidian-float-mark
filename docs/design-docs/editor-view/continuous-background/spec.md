# 编辑模式连续背景修复

Status: Approved

## 1. 背景

编辑模式使用普通 CodeMirror `Decoration.mark()` 绘制标注。CodeMirror 会在 Markdown 语法、行内代码、其他 decoration 和换行边界拆分普通 mark，当前 CSS 因而对多个独立片段分别绘制背景，产生白缝。阅读模式已使用独立 DOM wrapper 方案修复，不属于本次修改范围。

## 2. 目标

- 编辑模式中，同一背景标注覆盖的普通空格和多个行内代码背景连续。
- 背景层位于 Markdown 语法、文字颜色和点击 decoration 外层。
- 局部文字颜色、点击标注 ID、部分选区和跨行范围保持原语义。
- 阅读模式渲染、sidecar schema、侧边栏和同步协议不变。

## 3. 设计

将显式背景高亮拆成两层：背景层通过 `EditorView.outerDecorations` 提供，只携带背景样式；普通 decoration 继续携带文字颜色、标注 ID、标题和点击能力，但不重复绘制显式背景。无显式背景的高亮和评论标注保持现有普通 decoration 行为。

背景与普通 decoration 从同一个纯函数构建，确保使用相同的原始源码范围和状态过滤。插件更新时一次计算两组 `DecorationSet`，避免重复遍历标注。

## 4. 验收标准

- 普通空格、多个行内代码和完整显式背景进入 outer decoration。
- 局部文字色和点击 ID只存在于普通 decoration。
- 纯文字色、部分选区、跨行和评论标注不被错误提升。
- 自动化测试、TypeScript、构建、差异检查和格式检查全部通过。
- Obsidian 1.12.7 编辑模式背景连续，阅读模式无回归，构建产物安装到目标 Vault。
