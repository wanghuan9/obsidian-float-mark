# FloatMark

[简体中文](./README.md) | [English](./README.en.md)

FloatMark 是一个为 Obsidian 准备的飞书式正文标注与评论插件：选中文本后可以就地格式化、标注或评论；鼠标移动到段落、标题、列表等内容块左侧时，可以从块级浮动菜单快速调整块格式；评论会集中显示在当前文档侧边栏中，支持编辑、回复、解决、删除、跳转和可选同步到飞书 / Lark。

它适合希望在 Obsidian 里获得类似飞书文档「选中即操作、块级快捷操作、正文可标注、侧边可讨论」体验的本地写作与协作工作流。

FloatMark brings Feishu-like floating selection actions, block-level hover actions, inline marks, side comments, and optional Lark sync to Obsidian. It is designed for users who want fast text actions, block formatting, and document-level discussions without leaving their local vault.

This plugin is intentionally separate from `obsidian-feishu-lark-cli-sync`.
It works on its own as a local marking/commenting tool. When the Feishu sync
plugin has already published the current note, FloatMark can read that plugin's
document binding and block mapping, then create a Lark comment on the first
remote block hit by the local selection.

## 功能

- **飞书式选区浮窗**：选中文本后在选区附近显示浮动工具栏，可以快速执行加粗、斜体、删除线、行内代码、高亮和评论等操作。
- **块左侧快捷浮窗**：鼠标移动到段落、标题、列表、引用或代码块等模块左侧时，显示块级快捷入口，可将当前块切换为正文、标题、列表、任务、引用、代码块，也可评论、复制或删除当前块。
- **正文标注**：支持高亮标注和评论型标注，可自定义文字色与背景色；标注在编辑模式和阅读模式中都会定位到原文。
- **评论与飞书同步**：侧边栏按当前文档展示评论线程，支持编辑、回复、解决、删除、跳转回正文，并可将本地评论同步为飞书 / Lark 文档评论。
- **本地 sidecar 存储**：评论和视觉标注保存到 `.obsidian-float-marks/`，不会把评论内容直接写进 Markdown 正文。
- **锚点重定位**：当文档内容发生轻微变化时，会尝试通过偏移、上下文和选中文本重新定位标注。

## 安装

### 手动安装

当前可以通过源码构建后手动安装到 Obsidian vault：

```bash
git clone https://github.com/wanghuan9/obsidian-float-mark.git
cd obsidian-float-mark
npm install
npm run build
```

然后将以下文件复制到你的 vault 插件目录，例如 `.obsidian/plugins/obsidian-float-mark/`：

```text
manifest.json
main.js
styles.css
```

重启 Obsidian 后，在设置 -> 社区插件中启用 `FloatMark`。

## 使用

### 选中文本快捷操作

在编辑模式或阅读模式中选中文本后，FloatMark 会显示浮动工具栏。你可以直接执行：

- 加粗、斜体、删除线、行内代码。
- 创建高亮或评论标注。
- 从评论弹窗输入第一条评论。

Markdown 格式操作会修改当前笔记正文；评论和视觉标注默认保存到 sidecar JSON，不污染 Markdown 内容。

### 块左侧快捷操作

在编辑模式中，将鼠标移动到段落、标题、列表、引用或代码块左侧，FloatMark 会显示一个块级快捷浮窗。你可以用它快速处理当前块：

- 切换为正文、一级到五级标题、有序列表、无序列表、任务列表、引用或代码块。
- 对当前块创建评论标注。
- 复制或删除当前块。

### 侧边评论管理

点击左侧栏高亮图标，或使用命令面板打开 FloatMark 侧边栏。侧边栏会展示当前文档的标注和评论线程，支持：

- 编辑评论内容。
- 继续回复评论线程。
- 将评论标记为已解决或重新打开。
- 删除本地标注。
- 跳转到正文中的对应选区。
- 手动同步到飞书 / Lark 评论。

## 与 Feishu Lark CLI Sync 的关系

FloatMark **不依赖** `obsidian-feishu-lark-cli-sync`，它可以独立作为本地标注和评论插件使用。

只有当你希望把本地评论同步到飞书 / Lark 文档时，才需要配合使用：

- `obsidian-feishu-lark-cli-sync` 负责把 Obsidian Markdown 发布或同步为飞书 / Lark 文档。
- FloatMark 负责本地选区标注、侧边评论，以及把评论同步到已发布文档的对应 block。

同步到飞书 / Lark 需要满足：

- 当前笔记包含 `lark_doc_url` 或 `lark_doc_token`。
- 已存在同步插件生成的 block 映射文件：

```text
.obsidian/plugins/feishu-lark-cli-sync/lark-sync-state.json
```

- 本机已安装并登录 `lark-cli`。

## 使用前准备：飞书 / Lark 同步

如果只使用本地标注和评论，可以跳过本节。

如需同步到飞书 / Lark，请先安装并登录 `lark-cli`：

```bash
npm install -g @larksuite/cli
lark-cli version
lark-cli auth login
lark-cli auth status
```

然后使用 [Feishu Lark CLI Sync](https://github.com/wanghuan9/obsidian-feishu-lark-cli-sync) 发布当前笔记，使笔记获得 `lark_doc_url` 绑定和 block 映射。

## 设置

- `创建标注后打开侧栏`：创建评论或标注后自动打开侧边栏。
- `标注同步飞书`：开启后，添加本地评论或回复会通过 Feishu Lark CLI Sync 同步到飞书 / Lark。
- `Feishu Lark CLI Sync`：展示同步插件状态；飞书 CLI 路径、登录和执行能力由 Feishu Lark CLI Sync 管理。
- `评论显示名称`：本地侧边栏评论线程中的作者显示名。

## 说明

- FloatMark 以本地 Obsidian vault 为主，默认不需要网络服务。
- 本地评论和视觉标注保存在 `.obsidian-float-marks/`，不是 Markdown 正文的一部分。
- 飞书 / Lark 同步通过本机 `lark-cli` 执行，不在插件中保存 App Secret、access token 或 OAuth 配置。
- 远端评论同步是可选能力；没有发布到飞书 / Lark 的笔记仍可正常使用本地标注和评论。

## 开发

```bash
npm install
npm run build
npm test
```

修改源码后，需要重新执行 `npm run build` 生成 `main.js`。

## 许可

MIT License
