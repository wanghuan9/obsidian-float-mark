# 实施任务清单

> 由 spec.md 生成
> 任务总数: 1
> 核心原则: 先用纯函数锁定定位契约，再接入现有块菜单

## 依赖关系总览

Task 1（块菜单 50% 阈值定位与滚动）

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `src/block-menu-position.ts` | 新建 | Task 1 | 无 DOM 依赖的定位纯函数 |
| `src/hover-block-toolbar.ts` | 修改 | Task 1 | 接入定位结果 |
| `styles.css` | 修改 | Task 1 | 将菜单 padding 计入最大高度 |
| `test/test-block-menu-position.mjs` | 新建 | Task 1 | 50% 阈值与无重叠测试 |
| `package.json` | 修改 | Task 1 | 将新测试加入完整测试命令 |
| `main.js` | 生成 | Task 1 | 生产构建产物 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `calculateBlockMenuPlacement()` | 新增内部纯函数 | `HoverBlockToolbar.positionMenu()` | Task 1 |

### 构建系统变更

- `package.json`：增加 `test/test-block-menu-position.mjs`。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | 极小视口上下均无法展示半个菜单 | Task 1 | 选择空间更大的一侧并限制高度，始终保持 6px 间距 |
| 2 | 菜单滚动能力是否需新增 CSS | Task 1 | 现有 `.side-mark-block-menu` 已有 `overflow-y: auto`，不重复修改 |

## 任务列表

### 任务 1: [x] 实现块菜单 50% 阈值定位与滚动
- 文件: `src/block-menu-position.ts`（新建）, `src/hover-block-toolbar.ts`（修改）, `styles.css`（修改）, `test/test-block-menu-position.mjs`（新建）, `package.json`（修改）, `main.js`（生成）
- 依赖: 无
- spec 映射: 2, 3, 4
- 说明: 将定位计算提取为纯函数，块菜单按 50% 可见阈值选择上下方向并限制高度。
- context:
  - `src/hover-block-toolbar.ts:positionMenu()` — 当前翻转、最大高度和 DOM 样式写入逻辑
  - `styles.css:.side-mark-block-menu` — 已有最大高度和纵向滚动能力
  - `src/editor-extension.ts` — 块级浮框显示和滚动关闭的上游调用
- 验收标准:
  - [x] 下方完整、恰好 50%、低于 50%、极小视口定位测试通过
  - [x] 向上和向下的菜单边界均与浮框保持 6px 间距
  - [x] Code Review PASS
  - [x] `npm test`、`npm run build`、`git diff --check` 和格式检查通过
  - [x] 安装到目标 Vault 并在 Obsidian 1.12.7 实机验证通过
- 子任务:
  - [x] 1.1: 编写定位纯函数失败测试
  - [x] 1.2: 实现纯函数并接入块菜单
  - [x] 1.3: 完成评审、构建、安装和实机验收

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 2 | Task 1 | 覆盖方向、滚动和隔离范围 |
| 3 | Task 1 | 覆盖纯函数与接入规则 |
| 4 | Task 1 | 覆盖全部可执行验收项 |
