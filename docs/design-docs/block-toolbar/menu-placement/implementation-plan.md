# 块级浮框菜单定位 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让块级菜单在下方至少可见 50% 时向下滚动展示，否则无重叠地上浮。

**Architecture:** 新增无 DOM 依赖的定位纯函数，由 `HoverBlockToolbar.positionMenu()` 读取 DOM 尺寸后调用。现有 CSS 继续负责菜单内部滚动，不改其他弹窗。

**Tech Stack:** TypeScript、DOM、esbuild、Node.js assertions。

## Global Constraints

- 下方展示阈值固定为自然菜单高度的 50%。
- 菜单与浮框固定保留 6px 间距。
- 视口安全边距保持 8px，菜单自然高度上限保持 360px。
- 不修改子菜单和其他弹窗定位。

### Task 1: 定位契约与接入

**Files:**
- Create: `src/block-menu-position.ts`
- Modify: `src/hover-block-toolbar.ts`
- Modify: `styles.css`
- Create: `test/test-block-menu-position.mjs`
- Modify: `package.json`
- Generate: `main.js`

**Interfaces:**
- Produces: `calculateBlockMenuPlacement(input: BlockMenuPlacementInput): BlockMenuPlacement`
- Consumes: 浮框矩形、菜单自然高度和视口尺寸。

- [x] **Step 1: 写入失败测试**

覆盖下方完整、恰好 50%、低于 50%、上下均紧张，并断言向上菜单底部和向下菜单顶部与浮框相距 6px。

- [x] **Step 2: 运行测试确认失败**

Run: `node test/test-block-menu-position.mjs`
Expected: FAIL，定位模块尚不存在。

- [x] **Step 3: 实现最小定位纯函数**

使用 `spaceBelow >= naturalMenuHeight * minimumBelowRatio` 作为向下条件；不足时仅在上方空间更大时上浮。最大高度取自然高度与选定方向空间的较小值。

- [x] **Step 4: 接入块菜单**

`positionMenu()` 保留 DOM 尺寸读取和横向 clamp，将纵向方向、顶部和最大高度交给纯函数。

- [x] **Step 5: 运行定向与完整验证**

Run: `node test/test-block-menu-position.mjs && npm test && npm run build && git diff --check`
Expected: 全部 PASS。
