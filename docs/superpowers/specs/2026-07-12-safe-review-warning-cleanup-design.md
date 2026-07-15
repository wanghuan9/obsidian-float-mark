# Obsidian 审核告警安全优化设计

## 背景

Obsidian 社区插件审核页基于 `main@27dabd6` 报告 49 条 Warning：45 条 CSS `!important`、1 条 Shell Execution、1 条不安全数组赋值、1 条冗余类型断言、1 条 README 缺少英文正文。

本次以功能和主题兼容为最高优先级，只处理能够从代码和调用链证明不改变现有行为的告警。

## 目标

- 消除 4 条可安全修复的非 CSS Warning。
- 删除 8 条同一规则内被前置 `background` 简写完全覆盖的冗余 CSS 声明。
- 保留其余 37 条承担第三方主题兼容职责的 `!important`。
- 不改变标注、评论、浮动工具栏、远端评论同步和现有主题下的视觉行为。

## 非目标

- 不以 Warning 数量清零为目标。
- 不批量移除用于 Cupertino、Primary 等主题兼容的 `!important`。
- 不修改插件权限、同步开关、数据结构或用户操作流程。
- 不处理审核页 Info 级提示。

## 修改设计

### 1. 飞书命令执行

`findLarkReplyIds` 改用现有 `runLarkCliViaSyncPlugin`，与创建、回复、解决和删除操作统一复用 Feishu Lark CLI Sync 插件公开的 `runLarkCliCommand` 接口。

删除 FloatMark 自己的 `child_process`、`promisify`、CLI 路径解析和环境构造代码。命令参数、返回结构及错误处理保持不变。伴生插件已经负责命令队列、重试、CLI 版本检查、环境构造和 JSON 解析。

### 2. TypeScript 静态告警

- 为 `nextContentBlocks` 的数组构造器显式指定 `Element | null` 泛型，避免 `any[]` 到目标类型的不安全赋值。
- 删除 Set 迭代结果上不会改变推断类型的 `as number | undefined` 断言。

两项修改均不改变运行时代码分支或数据值。

### 3. README 语言

仓库根 `README.md` 保持中文，并在中文简介后增加一段完整英文简介，使社区审核器能够识别英文正文。完整英文说明保存在 `README.en.md`，两个文件互相提供语言切换链接。

### 4. CSS 严格冗余声明

仅删除以下 8 条被同一规则内、同优先级 `background: ... !important` 完全覆盖的声明：

- 选区菜单：重复的 `background-color`、`background-image`。
- 块菜单：重复的 `background-color`、`background-image`。
- 侧栏四种颜色选项：重复的 `background-color`。

其余 37 条 `!important` 保留，因为历史提交表明它们用于抵抗第三方主题按钮和图标规则覆盖。

## 验证

- 添加静态回归检查，确认运行时源码不再直接引用 `child_process`，并确认目标冗余 CSS 声明已删除。
- 覆盖飞书回复 ID 查询仍通过伴生插件桥接传递原命令参数并解析返回条目。
- 运行现有全量测试、TypeScript 检查和生产构建。
- 检查根 README 为中文、包含英文简介，并能跳转到完整英文文档。
- 对比修改前后相关 CSS 规则，确认保留的有效声明值与优先级不变。

## 验收标准

- Obsidian Warning 预计由 49 条降至 37 条。
- Shell Execution、unsafe assignment、unnecessary assertion、README English 四类 Warning 消失。
- 现有 37 条主题兼容 `!important` 不变。
- 全量测试和构建通过，飞书评论同步接口契约不变。
