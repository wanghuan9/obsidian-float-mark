/* FloatMark */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SideMarkPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian10 = require("obsidian");

// src/editor-extension.ts
var import_obsidian = require("obsidian");
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");

// src/dom-utils.ts
function getActiveDocument() {
  return window.activeDocument;
}
function getActiveBody() {
  return getActiveDocument().body;
}
function getActiveSelection() {
  return getActiveDocument().getSelection();
}
function isHtmlElement(value) {
  var _a;
  return Boolean(value && ((_a = value.instanceOf) == null ? void 0 : _a.call(value, HTMLElement)));
}
function isInputEvent(event) {
  return event.instanceOf(InputEvent);
}

// src/editor-extension.ts
function createSideMarkEditorExtension(plugin) {
  return import_view.ViewPlugin.fromClass(
    class SideMarkEditorPlugin {
      constructor(view) {
        this.view = view;
        this.selectionTimer = null;
        this.decorations = this.buildDecorations();
        this.mouseupHandler = () => this.scheduleSelectionCheck();
        this.keyupHandler = () => this.scheduleSelectionCheck();
        this.clickHandler = (event) => this.handleMarkClick(event);
        this.mousemoveHandler = (event) => this.handleMouseMove(event);
        this.mouseleaveHandler = () => plugin.scheduleHideBlockToolbar();
        this.scrollHandler = () => plugin.hideBlockToolbar();
        view.dom.addEventListener("mouseup", this.mouseupHandler);
        view.dom.addEventListener("keyup", this.keyupHandler);
        view.dom.addEventListener("click", this.clickHandler);
        view.dom.addEventListener("mousemove", this.mousemoveHandler);
        view.dom.addEventListener("mouseleave", this.mouseleaveHandler);
        view.dom.addEventListener("scroll", this.scrollHandler, true);
      }
      update(update) {
        if (update.docChanged || update.viewportChanged || update.transactions.length > 0) {
          this.decorations = this.buildDecorations();
          if (update.viewportChanged) {
            plugin.hideBlockToolbar();
          }
          if (update.docChanged) {
            plugin.hideSelectionToolbar();
          }
        }
      }
      destroy() {
        this.view.dom.removeEventListener("mouseup", this.mouseupHandler);
        this.view.dom.removeEventListener("keyup", this.keyupHandler);
        this.view.dom.removeEventListener("click", this.clickHandler);
        this.view.dom.removeEventListener("mousemove", this.mousemoveHandler);
        this.view.dom.removeEventListener("mouseleave", this.mouseleaveHandler);
        this.view.dom.removeEventListener("scroll", this.scrollHandler, true);
        if (this.selectionTimer !== null) {
          window.clearTimeout(this.selectionTimer);
          this.selectionTimer = null;
        }
      }
      scheduleSelectionCheck() {
        if (this.selectionTimer !== null) {
          window.clearTimeout(this.selectionTimer);
        }
        this.selectionTimer = window.setTimeout(() => {
          this.selectionTimer = null;
          const selection = this.view.state.selection.main;
          if (selection.empty) {
            plugin.hideSelectionToolbar();
            return;
          }
          const rect = this.getSelectionRect(selection.from, selection.to);
          if (!rect) {
            plugin.hideSelectionToolbar();
            return;
          }
          plugin.showSelectionToolbar(this.view, rect, this.view.dom.getBoundingClientRect());
        }, 120);
      }
      getSelectionRect(from, to) {
        const domRect = getDomSelectionRect(this.view.dom);
        if (domRect) {
          return domRect;
        }
        const start = this.view.coordsAtPos(from);
        const end = this.view.coordsAtPos(to);
        if (!start && !end) {
          return null;
        }
        if (!start || !end) {
          const rect = start || end;
          return rect ? new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top) : null;
        }
        const left = Math.min(start.left, end.left);
        const right = Math.max(start.right, end.right);
        const top = Math.min(start.top, end.top);
        const bottom = Math.max(start.bottom, end.bottom);
        return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
      }
      buildDecorations() {
        var _a;
        const filePath = this.getFilePath();
        if (!filePath || ((_a = plugin.currentDocument) == null ? void 0 : _a.filePath) !== filePath) {
          return import_view.Decoration.none;
        }
        const ranges = [];
        const docLength = this.view.state.doc.length;
        for (const mark of plugin.currentDocument.marks) {
          if (mark.status === "orphaned" || mark.status === "resolved") {
            continue;
          }
          const from = Math.max(0, Math.min(mark.anchor.startOffset, docLength));
          const to = Math.max(from, Math.min(mark.anchor.endOffset, docLength));
          if (from === to) {
            continue;
          }
          ranges.push(import_view.Decoration.mark({
            class: [
              "side-mark",
              `side-mark--${mark.mark.kind}`,
              `side-mark--${mark.mark.color}`,
              `side-mark--text-${mark.mark.textColor}`,
              `side-mark--background-${mark.mark.backgroundColor}`
            ].join(" "),
            attributes: {
              "data-side-mark-id": mark.id,
              title: mark.note.content || "FloatMark"
            }
          }).range(from, to));
        }
        const pendingCommentSelection = plugin.getPendingCommentSelection(filePath);
        if (pendingCommentSelection) {
          const from = Math.max(0, Math.min(pendingCommentSelection.from, docLength));
          const to = Math.max(from, Math.min(pendingCommentSelection.to, docLength));
          if (from !== to) {
            ranges.push(import_view.Decoration.mark({
              class: "side-mark-pending-comment-selection"
            }).range(from, to));
          }
        }
        return import_state.RangeSet.of(ranges, true);
      }
      getFilePath() {
        var _a, _b;
        const info = this.view.state.field(import_obsidian.editorInfoField, false);
        return ((_a = info == null ? void 0 : info.file) == null ? void 0 : _a.path) || ((_b = plugin.getActiveMarkdownFile()) == null ? void 0 : _b.path) || null;
      }
      handleMarkClick(event) {
        const target = isHtmlElement(event.target) ? event.target : null;
        const markEl = target == null ? void 0 : target.closest("[data-side-mark-id]");
        const markId = markEl == null ? void 0 : markEl.dataset.sideMarkId;
        if (!markId) {
          return;
        }
        event.preventDefault();
        plugin.setActiveEditorView(this.view);
        const rect = markEl.getBoundingClientRect();
        void plugin.openMark(markId, rect);
      }
      handleMouseMove(event) {
        if (!isHtmlElement(event.target) || !this.view.dom.contains(event.target)) {
          return;
        }
        if (!this.view.state.selection.main.empty) {
          plugin.scheduleHideBlockToolbar();
          return;
        }
        const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) {
          plugin.scheduleHideBlockToolbar();
          return;
        }
        const line = this.view.state.doc.lineAt(pos);
        if (!line.text.trim()) {
          plugin.scheduleHideBlockToolbar();
          return;
        }
        const rect = this.view.coordsAtPos(line.from);
        if (!rect) {
          plugin.scheduleHideBlockToolbar();
          return;
        }
        const lineRect = this.getLineRect(event.target, line.text);
        plugin.showBlockToolbar(this.view, {
          from: line.from,
          to: line.to,
          label: getLineLabel(line.text),
          rect: lineRect || new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)
        });
      }
      getLineRect(target, lineText) {
        const lineEl = target.closest(".cm-line");
        if (!lineEl || !this.view.dom.contains(lineEl)) {
          return null;
        }
        const lineRect = lineEl.getBoundingClientRect();
        if (lineRect.height <= 0) {
          return null;
        }
        if (/^#{1,6}\s+/.test(lineText)) {
          const headingRects = Array.from(lineEl.querySelectorAll(".cm-header")).map((element) => element.getBoundingClientRect()).filter((rect) => rect.height > 0);
          if (headingRects.length === 0) {
            return lineRect;
          }
          const top = Math.min(...headingRects.map((rect) => rect.top));
          const bottom = Math.max(...headingRects.map((rect) => rect.bottom));
          return new DOMRect(lineRect.left, top, lineRect.width, bottom - top);
        }
        const contentEl = target.closest(".cm-line > span, .cm-header, .cm-strong, .cm-emphasis");
        if (!contentEl || !lineEl.contains(contentEl)) {
          return lineRect;
        }
        const contentRect = contentEl.getBoundingClientRect();
        if (contentRect.height <= 0) {
          return lineRect;
        }
        return new DOMRect(lineRect.left, contentRect.top, lineRect.width, contentRect.height);
      }
    },
    {
      decorations: (value) => value.decorations
    }
  );
}
function getLineLabel(lineText) {
  var _a;
  const heading = lineText.match(/^(#{1,6})\s+/);
  if (heading) {
    return `H${((_a = heading[1]) == null ? void 0 : _a.length) || 1}`;
  }
  if (/^\s*(?:[-+*]|\d+\.)\s+/.test(lineText)) {
    return "List";
  }
  if (/^\s*>/.test(lineText)) {
    return "Quote";
  }
  return "T";
}
function getDomSelectionRect(editorDom) {
  const selection = getActiveSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const common = range.commonAncestorContainer;
  const element = isHtmlElement(common) ? common : common.parentElement;
  if (!element || !editorDom.contains(element)) {
    return null;
  }
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) {
    const rect = range.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }
  const first = rects[0];
  if (!first) {
    return null;
  }
  return new DOMRect(first.left, first.top, first.width, first.height);
}

// src/comment-popover.ts
var import_obsidian2 = require("obsidian");
var CommentPopover = class {
  constructor() {
    this.onSave = null;
    this.onHide = null;
    this.hideTimer = null;
    this.outsideMouseDownHandler = (event) => this.handleOutsideMouseDown(event);
    this.el = getActiveBody().createDiv({ cls: "side-mark-comment-popover" });
    this.el.hide();
    this.el.addEventListener("mouseenter", () => this.cancelHide());
    this.el.addEventListener("mouseleave", () => this.scheduleHide());
    const header = this.el.createDiv({ cls: "side-mark-comment-popover-header" });
    header.createSpan({ text: "\u8BC4\u8BBA" });
    const closeButton = header.createEl("button", {
      cls: "side-mark-icon-button",
      attr: { type: "button", "aria-label": "\u5173\u95ED" }
    });
    (0, import_obsidian2.setIcon)(closeButton, "x");
    closeButton.addEventListener("click", () => this.hide());
    this.textarea = this.el.createEl("textarea", {
      cls: "side-mark-comment-textarea",
      attr: { placeholder: "\u586B\u5199\u8BC4\u8BBA" }
    });
    const actions = this.el.createDiv({ cls: "side-mark-comment-actions" });
    const cancel = actions.createEl("button", {
      text: "\u53D6\u6D88",
      cls: "side-mark-secondary-button",
      attr: { type: "button" }
    });
    cancel.addEventListener("click", () => this.hide());
    const save = actions.createEl("button", {
      text: "\u4FDD\u5B58",
      cls: "side-mark-primary-button",
      attr: { type: "button" }
    });
    save.addEventListener("click", () => {
      var _a;
      (_a = this.onSave) == null ? void 0 : _a.call(this, this.textarea.value);
      this.hide();
    });
    this.textarea.addEventListener("keydown", (event) => {
      var _a;
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
        return;
      }
      event.preventDefault();
      (_a = this.onSave) == null ? void 0 : _a.call(this, this.textarea.value);
      this.hide();
    });
  }
  show(rect, onSave, onHide, options) {
    this.cancelHide();
    this.onSave = onSave;
    this.onHide = onHide || null;
    this.textarea.value = "";
    this.el.show();
    this.el.removeClass("is-visible");
    this.el.doc.addEventListener("mousedown", this.outsideMouseDownHandler);
    const width = this.el.offsetWidth;
    const height = this.el.offsetHeight;
    const left = getPopoverAxisPosition(rect.right + 12, width, rect.left - width - 12, window.innerWidth);
    const top = getPopoverAxisPosition(rect.bottom + 12, height, rect.top - height - 12, window.innerHeight);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    window.requestAnimationFrame(() => this.el.addClass("is-visible"));
    if ((options == null ? void 0 : options.focus) !== false) {
      this.textarea.focus();
    }
  }
  hide() {
    var _a;
    this.cancelHide();
    this.el.doc.removeEventListener("mousedown", this.outsideMouseDownHandler);
    this.el.removeClass("is-visible");
    this.onSave = null;
    (_a = this.onHide) == null ? void 0 : _a.call(this);
    this.onHide = null;
    window.setTimeout(() => {
      if (!this.el.hasClass("is-visible")) {
        this.el.hide();
      }
    }, 150);
  }
  destroy() {
    this.cancelHide();
    this.el.doc.removeEventListener("mousedown", this.outsideMouseDownHandler);
    this.el.remove();
  }
  scheduleHide() {
    if (this.textarea.value.trim()) {
      return;
    }
    this.cancelHide();
    this.hideTimer = window.setTimeout(() => this.hide(), 420);
  }
  cancelHide() {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
  handleOutsideMouseDown(event) {
    if (this.el.contains(event.target)) {
      return;
    }
    this.hide();
  }
};
function clamp(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}
function getPopoverAxisPosition(preferred, size, fallback, viewportSize) {
  const padding = 8;
  const max = viewportSize - size - padding;
  if (preferred <= max) {
    return clamp(preferred, padding, max);
  }
  if (fallback >= padding) {
    return fallback;
  }
  return clamp(preferred, padding, max);
}

// src/hover-block-toolbar.ts
var import_obsidian3 = require("obsidian");
var HEADING_SUBMENU_BUTTONS = [
  { action: "heading-4", label: "\u56DB\u7EA7\u6807\u9898", shortcut: "H4", compact: true },
  { action: "heading-5", label: "\u4E94\u7EA7\u6807\u9898", shortcut: "H5", compact: true },
  { action: "heading-6", label: "\u516D\u7EA7\u6807\u9898", shortcut: "H6", compact: true }
];
var FORMAT_BUTTONS = [
  { action: "paragraph", label: "\u6B63\u6587", shortcut: "T", compact: true },
  { action: "heading-1", label: "\u4E00\u7EA7\u6807\u9898", shortcut: "H1", compact: true },
  { action: "heading-2", label: "\u4E8C\u7EA7\u6807\u9898", shortcut: "H2", compact: true },
  { action: "heading-3", label: "\u4E09\u7EA7\u6807\u9898", shortcut: "H3", compact: true },
  { label: "\u5176\u4ED6\u6807\u9898", shortcut: "Hn", compact: true, submenu: HEADING_SUBMENU_BUTTONS },
  { action: "number-list", icon: "list-ordered", label: "\u6709\u5E8F\u5217\u8868" },
  { action: "bullet-list", icon: "list", label: "\u65E0\u5E8F\u5217\u8868" },
  { action: "task-list", icon: "square-check", label: "\u4EFB\u52A1" },
  { action: "code-block", icon: "braces", label: "\u4EE3\u7801\u5757" },
  { action: "quote", icon: "quote", label: "\u5F15\u7528" }
];
var ACTION_BUTTONS = [
  { action: "comment", icon: "message-square-text", label: "\u8BC4\u8BBA" },
  { action: "copy", icon: "copy", label: "\u590D\u5236" },
  { action: "delete", icon: "trash-2", label: "\u5220\u9664", danger: true }
];
var MENU_VIEWPORT_PADDING = 8;
var MENU_PILL_GAP = 6;
var MENU_DEFAULT_MAX_HEIGHT = 360;
var MENU_MIN_HEIGHT = 120;
var HoverBlockToolbar = class {
  constructor(onAction) {
    this.onAction = onAction;
    this.target = null;
    this.hideTimer = null;
    this.openTimer = null;
    this.pointerMoveHandler = (event) => this.handlePointerMove(event);
    this.pill = getActiveBody().createDiv({ cls: "side-mark-block-pill" });
    this.pill.hide();
    this.pill.addEventListener("mousedown", (event) => event.preventDefault());
    this.pill.addEventListener("mouseenter", () => this.scheduleOpen());
    this.pill.addEventListener("mouseleave", () => this.scheduleHide());
    this.pill.createEl("button", {
      cls: "side-mark-block-pill-label",
      attr: { type: "button", "aria-label": "\u5757\u683C\u5F0F" }
    });
    this.pill.createDiv({
      cls: "side-mark-block-pill-arrow"
    });
    const drag = this.pill.createDiv({ cls: "side-mark-block-pill-drag" });
    (0, import_obsidian3.setIcon)(drag, "grip-vertical");
    this.menu = getActiveBody().createDiv({ cls: "side-mark-block-menu" });
    this.menu.hide();
    this.menu.addEventListener("mousedown", (event) => event.preventDefault());
    this.menu.addEventListener("mouseenter", () => this.cancelHide());
    this.menu.addEventListener("mouseleave", () => this.scheduleHide());
    this.submenu = getActiveBody().createDiv({ cls: "side-mark-block-menu side-mark-block-submenu" });
    this.submenu.hide();
    this.submenu.addEventListener("mousedown", (event) => event.preventDefault());
    this.submenu.addEventListener("mouseenter", () => this.cancelHide());
    this.submenu.addEventListener("mouseleave", () => this.scheduleHide());
    this.renderMenu();
    this.renderHeadingSubmenu();
  }
  show(target) {
    var _a;
    if (this.isMenuOpen()) {
      return;
    }
    this.target = target;
    this.cancelHide();
    this.pill.show();
    this.pill.addClass("is-visible");
    (_a = this.pill.querySelector(".side-mark-block-pill-label")) == null ? void 0 : _a.setText(target.label);
    const left = clamp2(target.rect.left - 58, 8, window.innerWidth - 82);
    const pillHeight = this.pill.offsetHeight || 22;
    const top = clamp2(target.rect.top + target.rect.height / 2 - pillHeight / 2, 8, window.innerHeight - pillHeight - 8);
    this.pill.style.left = `${left}px`;
    this.pill.style.top = `${top}px`;
  }
  hide() {
    this.cancelOpen();
    this.cancelHide();
    this.pill.doc.removeEventListener("mousemove", this.pointerMoveHandler);
    this.pill.removeClass("is-visible");
    this.pill.removeClass("is-open");
    this.menu.removeClass("is-open");
    this.submenu.removeClass("is-open");
    window.setTimeout(() => {
      if (!this.pill.hasClass("is-visible")) {
        this.pill.hide();
      }
      if (!this.menu.hasClass("is-open")) {
        this.menu.hide();
      }
      if (!this.submenu.hasClass("is-open")) {
        this.submenu.hide();
      }
    }, 140);
    this.target = null;
  }
  scheduleHide() {
    this.cancelOpen();
    if (this.hideTimer !== null) {
      return;
    }
    this.hideTimer = window.setTimeout(() => this.hide(), 220);
  }
  destroy() {
    this.cancelHide();
    this.cancelOpen();
    this.pill.doc.removeEventListener("mousemove", this.pointerMoveHandler);
    this.pill.remove();
    this.menu.remove();
    this.submenu.remove();
  }
  renderMenu() {
    const list = this.menu.createDiv({ cls: "side-mark-block-menu-list" });
    for (const item of FORMAT_BUTTONS) {
      this.renderButton(list, item, true);
    }
    this.menu.createDiv({ cls: "side-mark-block-menu-separator" });
    for (const item of ACTION_BUTTONS) {
      this.renderButton(list, item, true);
    }
  }
  renderButton(container, item, closeSubmenuOnHover) {
    const button = container.createEl("button", {
      cls: item.compact ? `side-mark-block-menu-compact${item.submenu ? " has-submenu" : ""}` : `side-mark-block-menu-row${item.danger ? " is-danger" : ""}`,
      attr: {
        type: "button",
        title: item.label,
        "aria-label": item.label
      }
    });
    const icon = button.createSpan({ cls: "side-mark-block-menu-row-icon" });
    if (item.icon) {
      (0, import_obsidian3.setIcon)(icon, item.icon);
    } else {
      icon.setText(item.shortcut || item.label);
    }
    button.createSpan({ cls: "side-mark-block-menu-row-label", text: item.label });
    const arrow = button.createSpan({ cls: "side-mark-block-menu-row-arrow" });
    if (item.submenu) {
      (0, import_obsidian3.setIcon)(arrow, "chevron-right");
      button.addEventListener("mouseenter", () => this.openSubmenu(button));
      button.addEventListener("mousemove", () => this.openSubmenu(button));
      button.addEventListener("focus", () => this.openSubmenu(button));
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openSubmenu(button);
      });
      return;
    }
    if (closeSubmenuOnHover) {
      button.addEventListener("mouseenter", () => this.closeSubmenu());
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.target && item.action) {
        this.onAction(item.action, this.target);
      }
      this.hide();
    });
  }
  renderHeadingSubmenu() {
    const list = this.submenu.createDiv({ cls: "side-mark-block-menu-list" });
    for (const item of HEADING_SUBMENU_BUTTONS) {
      this.renderButton(list, item, false);
    }
  }
  scheduleOpen() {
    this.cancelHide();
    this.cancelOpen();
    this.openTimer = window.setTimeout(() => this.openMenu(), 70);
  }
  openMenu() {
    if (!this.target) {
      return;
    }
    this.pill.addClass("is-open");
    this.pill.doc.addEventListener("mousemove", this.pointerMoveHandler);
    this.menu.show();
    this.menu.scrollTop = 0;
    this.submenu.scrollTop = 0;
    this.positionMenu();
    window.requestAnimationFrame(() => this.menu.addClass("is-open"));
  }
  positionMenu() {
    if (!this.target) {
      return;
    }
    const pillRect = this.pill.getBoundingClientRect();
    const menuWidth = this.menu.offsetWidth || 240;
    const naturalMenuHeight = Math.min(this.menu.scrollHeight || this.menu.offsetHeight, MENU_DEFAULT_MAX_HEIGHT);
    const spaceBelow = window.innerHeight - pillRect.bottom - MENU_PILL_GAP - MENU_VIEWPORT_PADDING;
    const spaceAbove = pillRect.top - MENU_PILL_GAP - MENU_VIEWPORT_PADDING;
    const openAbove = spaceBelow < naturalMenuHeight && spaceAbove > spaceBelow;
    const availableHeight = Math.max(MENU_MIN_HEIGHT, openAbove ? spaceAbove : spaceBelow);
    const menuHeight = Math.min(naturalMenuHeight, availableHeight);
    const left = clamp2(pillRect.left, MENU_VIEWPORT_PADDING, window.innerWidth - menuWidth - MENU_VIEWPORT_PADDING);
    const preferredTop = openAbove ? pillRect.top - MENU_PILL_GAP - menuHeight : pillRect.bottom + MENU_PILL_GAP;
    const top = clamp2(preferredTop, MENU_VIEWPORT_PADDING, window.innerHeight - menuHeight - MENU_VIEWPORT_PADDING);
    this.menu.style.maxHeight = `${availableHeight}px`;
    this.menu.style.left = `${left}px`;
    this.menu.style.top = `${top}px`;
  }
  isMenuOpen() {
    return this.menu.isShown() || this.menu.hasClass("is-open");
  }
  handlePointerMove(event) {
    if (!this.isMenuOpen()) {
      return;
    }
    if (isInsideWithPadding(event, this.pill, 8) || isInsideWithPadding(event, this.menu, 18) || isInsideWithPadding(event, this.submenu, 18)) {
      this.cancelHide();
      return;
    }
    this.scheduleHide();
  }
  openSubmenu(row) {
    this.cancelHide();
    const rowRect = row.getBoundingClientRect();
    this.submenu.show();
    const submenuWidth = this.submenu.offsetWidth;
    const submenuHeight = this.submenu.offsetHeight;
    const preferredLeft = rowRect.right + 8;
    const fallbackLeft = rowRect.left - submenuWidth - 8;
    const left = preferredLeft + submenuWidth <= window.innerWidth - 8 ? preferredLeft : fallbackLeft;
    this.submenu.style.left = `${clamp2(left, 8, window.innerWidth - submenuWidth - 8)}px`;
    this.submenu.style.top = `${clamp2(rowRect.top, 8, window.innerHeight - submenuHeight - 8)}px`;
    window.requestAnimationFrame(() => this.submenu.addClass("is-open"));
  }
  closeSubmenu() {
    this.submenu.removeClass("is-open");
    window.setTimeout(() => {
      if (!this.submenu.hasClass("is-open")) {
        this.submenu.hide();
      }
    }, 120);
  }
  cancelHide() {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
  cancelOpen() {
    if (this.openTimer !== null) {
      window.clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }
};
function clamp2(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}
function isInsideWithPadding(event, element, padding) {
  if (!element.isShown()) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return event.clientX >= rect.left - padding && event.clientX <= rect.right + padding && event.clientY >= rect.top - padding && event.clientY <= rect.bottom + padding;
}

// src/mark-style-popover.ts
var import_obsidian4 = require("obsidian");
var TEXT_COLORS = [
  { color: "default", label: "\u9ED8\u8BA4\u5B57\u4F53" },
  { color: "gray", label: "\u7070\u8272\u5B57\u4F53" },
  { color: "red", label: "\u7EA2\u8272\u5B57\u4F53" },
  { color: "orange", label: "\u6A59\u8272\u5B57\u4F53" },
  { color: "yellow", label: "\u9EC4\u8272\u5B57\u4F53" },
  { color: "green", label: "\u7EFF\u8272\u5B57\u4F53" },
  { color: "blue", label: "\u84DD\u8272\u5B57\u4F53" },
  { color: "purple", label: "\u7D2B\u8272\u5B57\u4F53" }
];
var BACKGROUND_COLORS = [
  { color: "none", label: "\u65E0\u80CC\u666F" },
  { color: "gray-light", label: "\u6D45\u7070\u80CC\u666F" },
  { color: "red-light", label: "\u6D45\u7EA2\u80CC\u666F" },
  { color: "orange-light", label: "\u6D45\u6A59\u80CC\u666F" },
  { color: "yellow-light", label: "\u6D45\u9EC4\u80CC\u666F" },
  { color: "green-light", label: "\u6D45\u7EFF\u80CC\u666F" },
  { color: "blue-light", label: "\u6D45\u84DD\u80CC\u666F" },
  { color: "purple-light", label: "\u6D45\u7D2B\u80CC\u666F" },
  { color: "gray", label: "\u7070\u8272\u80CC\u666F" },
  { color: "red", label: "\u7EA2\u8272\u80CC\u666F" },
  { color: "orange", label: "\u6A59\u8272\u80CC\u666F" },
  { color: "yellow", label: "\u9EC4\u8272\u80CC\u666F" },
  { color: "green", label: "\u7EFF\u8272\u80CC\u666F" },
  { color: "blue", label: "\u84DD\u8272\u80CC\u666F" },
  { color: "purple", label: "\u7D2B\u8272\u80CC\u666F" }
];
var MarkStylePopover = class {
  constructor() {
    this.textColorButtons = /* @__PURE__ */ new Map();
    this.backgroundColorButtons = /* @__PURE__ */ new Map();
    this.textColor = "default";
    this.backgroundColor = "none";
    this.onChange = null;
    this.onReset = null;
    this.hideTimer = null;
    this.outsideMouseDownHandler = (event) => this.handleOutsideMouseDown(event);
    this.el = getActiveBody().createDiv({ cls: "side-mark-style-popover" });
    this.el.hide();
    this.el.addEventListener("mouseenter", () => this.cancelHide());
    this.el.addEventListener("mouseleave", () => this.scheduleHide());
    const header = this.el.createDiv({ cls: "side-mark-style-popover-header" });
    header.createSpan({ text: "\u6807\u8BB0" });
    const closeButton = header.createEl("button", {
      cls: "side-mark-icon-button",
      attr: { type: "button", "aria-label": "\u5173\u95ED" }
    });
    (0, import_obsidian4.setIcon)(closeButton, "x");
    closeButton.addEventListener("click", () => this.hide());
    this.renderTextColors();
    this.renderBackgroundColors();
    this.renderResetButton();
  }
  show(rect, choice, onChange, onReset) {
    this.cancelHide();
    this.textColor = choice.textColor;
    this.backgroundColor = choice.backgroundColor;
    this.onChange = onChange;
    this.onReset = onReset;
    this.renderActiveState();
    this.el.show();
    this.el.removeClass("is-visible");
    this.el.doc.addEventListener("mousedown", this.outsideMouseDownHandler);
    const width = this.el.offsetWidth;
    const left = clamp3(rect.right + 12, 8, window.innerWidth - width - 8);
    const top = clamp3(rect.top, 8, window.innerHeight - this.el.offsetHeight - 8);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    window.requestAnimationFrame(() => this.el.addClass("is-visible"));
  }
  hide() {
    this.cancelHide();
    this.el.doc.removeEventListener("mousedown", this.outsideMouseDownHandler);
    this.el.removeClass("is-visible");
    this.onChange = null;
    this.onReset = null;
    window.setTimeout(() => {
      if (!this.el.hasClass("is-visible")) {
        this.el.hide();
      }
    }, 150);
  }
  destroy() {
    this.cancelHide();
    this.el.doc.removeEventListener("mousedown", this.outsideMouseDownHandler);
    this.el.remove();
  }
  renderTextColors() {
    this.el.createDiv({ cls: "side-mark-style-section-title", text: "\u5B57\u4F53\u989C\u8272" });
    const row = this.el.createDiv({ cls: "side-mark-style-text-row" });
    for (const item of TEXT_COLORS) {
      const button = row.createEl("button", {
        cls: `side-mark-style-text-color is-${item.color}`,
        attr: { type: "button", title: item.label, "aria-label": item.label }
      });
      button.createSpan({ text: "A" });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.textColor = item.color;
        this.renderActiveState();
        this.emitChange();
      });
      this.textColorButtons.set(item.color, button);
    }
  }
  renderBackgroundColors() {
    this.el.createDiv({ cls: "side-mark-style-section-title", text: "\u80CC\u666F\u989C\u8272" });
    const grid = this.el.createDiv({ cls: "side-mark-style-background-grid" });
    for (const item of BACKGROUND_COLORS) {
      const button = grid.createEl("button", {
        cls: `side-mark-style-background-color is-${item.color}`,
        attr: { type: "button", title: item.label, "aria-label": item.label }
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.backgroundColor = item.color;
        this.renderActiveState();
        this.emitChange();
      });
      this.backgroundColorButtons.set(item.color, button);
    }
  }
  renderResetButton() {
    const button = this.el.createEl("button", {
      cls: "side-mark-style-reset",
      text: "\u6062\u590D\u9ED8\u8BA4",
      attr: { type: "button" }
    });
    button.addEventListener("click", (event) => {
      var _a;
      event.preventDefault();
      event.stopPropagation();
      (_a = this.onReset) == null ? void 0 : _a.call(this);
      this.hide();
    });
  }
  renderActiveState() {
    for (const [color, button] of this.textColorButtons) {
      button.toggleClass("is-active", color === this.textColor);
    }
    for (const [color, button] of this.backgroundColorButtons) {
      button.toggleClass("is-active", color === this.backgroundColor);
    }
  }
  emitChange() {
    var _a;
    (_a = this.onChange) == null ? void 0 : _a.call(this, {
      textColor: this.textColor,
      backgroundColor: this.backgroundColor
    });
  }
  scheduleHide() {
    this.cancelHide();
    this.hideTimer = window.setTimeout(() => this.hide(), 420);
  }
  cancelHide() {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
  handleOutsideMouseDown(event) {
    if (this.el.contains(event.target)) {
      return;
    }
    this.hide();
  }
};
function clamp3(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

// src/reading-selection-toolbar.ts
var import_obsidian5 = require("obsidian");
var READING_BUTTONS = [
  { id: "highlight", icon: "highlighter", title: "\u9AD8\u4EAE\u6807\u6CE8" },
  { id: "comment", icon: "message-square-text", title: "\u8BC4\u8BBA" }
];
var ReadingSelectionToolbar = class {
  constructor(onAction) {
    this.onAction = onAction;
    this.hideTimer = null;
    this.el = getActiveBody().createDiv({ cls: "side-mark-toolbar side-mark-reading-selection-toolbar" });
    this.el.hide();
    this.el.addEventListener("mousedown", (event) => event.preventDefault());
    this.el.addEventListener("mouseenter", () => this.cancelHide());
    this.el.addEventListener("mouseleave", () => this.scheduleHide());
    for (const button of READING_BUTTONS) {
      const buttonEl = this.el.createEl("button", {
        cls: "side-mark-toolbar-button",
        attr: {
          type: "button",
          title: button.title,
          "aria-label": button.title
        }
      });
      (0, import_obsidian5.setIcon)(buttonEl, button.icon);
      buttonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.onAction(button.id);
        this.hide();
      });
    }
  }
  show(rect, boundary) {
    var _a, _b, _c, _d;
    this.cancelHide();
    this.el.show();
    this.el.removeClass("is-visible");
    const width = this.el.offsetWidth;
    const height = this.el.offsetHeight;
    const minLeft = Math.max(8, (_a = boundary == null ? void 0 : boundary.left) != null ? _a : 8);
    const maxLeft = Math.min(window.innerWidth - width - 8, ((_b = boundary == null ? void 0 : boundary.right) != null ? _b : window.innerWidth - 8) - width);
    const left = clamp4(rect.left + rect.width / 2 - width / 2, minLeft, maxLeft);
    const aboveTop = rect.top - height - 10;
    const belowTop = rect.bottom + 10;
    const minTop = Math.max(8, (_c = boundary == null ? void 0 : boundary.top) != null ? _c : 8);
    const maxTop = Math.min(window.innerHeight - height - 8, ((_d = boundary == null ? void 0 : boundary.bottom) != null ? _d : window.innerHeight - 8) - height);
    const preferredTop = aboveTop >= minTop ? aboveTop : belowTop;
    const top = clamp4(preferredTop, minTop, maxTop);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    window.requestAnimationFrame(() => this.el.addClass("is-visible"));
  }
  hide() {
    this.cancelHide();
    this.el.removeClass("is-visible");
    window.setTimeout(() => {
      if (!this.el.hasClass("is-visible")) {
        this.el.hide();
      }
    }, 140);
  }
  destroy() {
    this.cancelHide();
    this.el.remove();
  }
  scheduleHide() {
    this.cancelHide();
    this.hideTimer = window.setTimeout(() => this.hide(), 420);
  }
  cancelHide() {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
};
function clamp4(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

// src/selection-toolbar.ts
var import_obsidian6 = require("obsidian");
var HEADING_SUBMENU_ITEMS = [
  { id: "heading-4", label: "\u56DB\u7EA7\u6807\u9898", shortcut: "H4" },
  { id: "heading-5", label: "\u4E94\u7EA7\u6807\u9898", shortcut: "H5" },
  { id: "heading-6", label: "\u516D\u7EA7\u6807\u9898", shortcut: "H6" }
];
var FORMAT_ITEMS = [
  { id: "paragraph", label: "\u6B63\u6587", shortcut: "T" },
  { id: "heading-1", label: "\u4E00\u7EA7\u6807\u9898", shortcut: "H1" },
  { id: "heading-2", label: "\u4E8C\u7EA7\u6807\u9898", shortcut: "H2" },
  { id: "heading-3", label: "\u4E09\u7EA7\u6807\u9898", shortcut: "H3" },
  { label: "\u5176\u4ED6\u6807\u9898", shortcut: "Hn", submenu: HEADING_SUBMENU_ITEMS },
  { id: "number-list", icon: "list-ordered", label: "\u6709\u5E8F\u5217\u8868" },
  { id: "bullet-list", icon: "list", label: "\u65E0\u5E8F\u5217\u8868" },
  { id: "task-list", icon: "square-check", label: "\u4EFB\u52A1" },
  { id: "code-block", icon: "braces", label: "\u4EE3\u7801\u5757" },
  { id: "quote", icon: "quote", label: "\u5F15\u7528" }
];
var BUTTONS = [
  { id: "bold", icon: "bold", title: "\u52A0\u7C97" },
  { id: "strike", icon: "strikethrough", title: "\u5220\u9664\u7EBF" },
  { id: "italic", icon: "italic", title: "\u659C\u4F53" },
  { id: "underline", icon: "underline", title: "\u4E0B\u5212\u7EBF" },
  { id: "link", icon: "link", title: "\u94FE\u63A5" },
  { id: "code", icon: "code", title: "\u884C\u5185\u4EE3\u7801" },
  { id: "highlight", icon: "highlighter", title: "\u9AD8\u4EAE\u6807\u6CE8" },
  { id: "comment", icon: "message-square-text", title: "\u8BC4\u8BBA" }
];
var FORMAT_LABELS = {
  paragraph: "T",
  "heading-1": "H1",
  "heading-2": "H2",
  "heading-3": "H3",
  "heading-4": "H4",
  "heading-5": "H5",
  "heading-6": "H6"
};
var FORMAT_ICONS = {
  "number-list": "list-ordered",
  "bullet-list": "list",
  "task-list": "square-check",
  quote: "quote",
  "code-block": "braces"
};
var SelectionToolbar = class {
  constructor(onAction) {
    this.onAction = onAction;
    this.formatRows = /* @__PURE__ */ new Map();
    this.hideTimer = null;
    this.el = getActiveBody().createDiv({ cls: "side-mark-toolbar" });
    this.el.hide();
    this.pointerMoveHandler = (event) => this.handlePointerMove(event);
    this.el.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    this.el.addEventListener("mouseenter", () => this.cancelHide());
    this.el.addEventListener("mouseleave", () => this.scheduleHide());
    const format = this.el.createEl("button", {
      cls: "side-mark-toolbar-format",
      attr: { type: "button", title: "\u683C\u5F0F", "aria-label": "\u683C\u5F0F" }
    });
    this.formatLabel = format.createSpan({ text: "\u6B63\u6587" });
    const chevron = format.createSpan({ cls: "side-mark-toolbar-format-chevron" });
    (0, import_obsidian6.setIcon)(chevron, "chevron-down");
    format.addEventListener("mouseenter", () => this.openMenu());
    format.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleMenu();
    });
    this.el.createDiv({ cls: "side-mark-toolbar-divider" });
    for (const button of BUTTONS) {
      const buttonEl = this.el.createEl("button", {
        cls: "side-mark-toolbar-button",
        attr: {
          type: "button",
          title: button.title,
          "aria-label": button.title
        }
      });
      (0, import_obsidian6.setIcon)(buttonEl, button.icon);
      buttonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.onAction(button.id);
        this.hide();
      });
    }
    this.menu = getActiveBody().createDiv({ cls: "side-mark-selection-menu" });
    this.menu.hide();
    this.menu.addEventListener("mousedown", (event) => event.preventDefault());
    this.menu.addEventListener("mouseenter", () => this.cancelHide());
    this.menu.addEventListener("mouseleave", () => this.scheduleHide());
    this.submenu = getActiveBody().createDiv({ cls: "side-mark-selection-menu side-mark-selection-submenu" });
    this.submenu.hide();
    this.submenu.addEventListener("mousedown", (event) => event.preventDefault());
    this.submenu.addEventListener("mouseenter", () => this.cancelHide());
    this.submenu.addEventListener("mouseleave", () => this.scheduleHide());
    this.renderHeadingSubmenu();
    for (const item of FORMAT_ITEMS) {
      const row = this.menu.createEl("button", {
        cls: item.submenu ? "side-mark-selection-menu-row has-submenu" : "side-mark-selection-menu-row",
        attr: { type: "button", title: item.label, "aria-label": item.label }
      });
      const iconWrap = row.createSpan({ cls: "side-mark-selection-menu-icon" });
      if (item.icon) {
        (0, import_obsidian6.setIcon)(iconWrap, item.icon);
      } else {
        iconWrap.setText(item.shortcut || "");
      }
      row.createSpan({ cls: "side-mark-selection-menu-label", text: item.label });
      const check = row.createSpan({ cls: "side-mark-selection-menu-check" });
      if (item.submenu) {
        (0, import_obsidian6.setIcon)(check, "chevron-right");
        row.addEventListener("mouseenter", () => this.openSubmenu(row));
        row.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.openSubmenu(row);
        });
        continue;
      }
      if (item.id === "paragraph") {
        (0, import_obsidian6.setIcon)(check, "check");
        row.addClass("is-active");
      }
      if (isSelectionFormatAction(item.id)) {
        this.formatRows.set(item.id, row);
      }
      row.addEventListener("mouseenter", () => this.closeSubmenu());
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (item.id) {
          this.formatLabel.setText(item.shortcut || item.label);
          this.onAction(item.id);
        }
        this.hide();
      });
    }
  }
  show(rect, boundary, format = "paragraph") {
    var _a, _b, _c, _d;
    this.cancelHide();
    this.el.doc.addEventListener("mousemove", this.pointerMoveHandler);
    this.el.show();
    this.el.removeClass("is-visible");
    this.closeSubmenu();
    this.setCurrentFormat(format);
    const width = this.el.offsetWidth;
    const height = this.el.offsetHeight;
    const minLeft = Math.max(8, (_a = boundary == null ? void 0 : boundary.left) != null ? _a : 8);
    const maxLeft = Math.min(window.innerWidth - width - 8, ((_b = boundary == null ? void 0 : boundary.right) != null ? _b : window.innerWidth - 8) - width);
    const left = clamp5(rect.left + rect.width / 2 - width / 2, minLeft, maxLeft);
    const aboveTop = rect.top - height - 10;
    const belowTop = rect.bottom + 10;
    const minTop = Math.max(8, (_c = boundary == null ? void 0 : boundary.top) != null ? _c : 8);
    const maxTop = Math.min(window.innerHeight - height - 8, ((_d = boundary == null ? void 0 : boundary.bottom) != null ? _d : window.innerHeight - 8) - height);
    const preferredTop = aboveTop >= minTop ? aboveTop : belowTop;
    const top = clamp5(preferredTop, minTop, maxTop);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    window.requestAnimationFrame(() => this.el.addClass("is-visible"));
  }
  hide() {
    this.cancelHide();
    this.el.doc.removeEventListener("mousemove", this.pointerMoveHandler);
    this.el.removeClass("is-visible");
    this.menu.removeClass("is-open");
    this.submenu.removeClass("is-open");
    window.setTimeout(() => {
      if (!this.el.hasClass("is-visible")) {
        this.el.hide();
      }
      if (!this.menu.hasClass("is-open")) {
        this.menu.hide();
      }
      if (!this.submenu.hasClass("is-open")) {
        this.submenu.hide();
      }
    }, 140);
  }
  isVisible() {
    return this.el.isShown() && this.el.hasClass("is-visible");
  }
  destroy() {
    this.cancelHide();
    this.el.doc.removeEventListener("mousemove", this.pointerMoveHandler);
    this.el.remove();
    this.menu.remove();
    this.submenu.remove();
  }
  scheduleHide() {
    this.cancelHide();
    this.hideTimer = window.setTimeout(() => this.hide(), 260);
  }
  cancelHide() {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
  handlePointerMove(event) {
    if (!this.el.isShown()) {
      return;
    }
    const rect = this.el.getBoundingClientRect();
    const menuRect = this.menu.isShown() ? this.menu.getBoundingClientRect() : null;
    const submenuRect = this.submenu.isShown() ? this.submenu.getBoundingClientRect() : null;
    const safeRect = {
      left: rect.left - 22,
      right: rect.right + 22,
      top: rect.top - 28,
      bottom: rect.bottom + 42
    };
    if (event.clientX >= safeRect.left && event.clientX <= safeRect.right && event.clientY >= safeRect.top && event.clientY <= safeRect.bottom) {
      this.cancelHide();
      return;
    }
    if (menuRect && event.clientX >= menuRect.left - 16 && event.clientX <= menuRect.right + 16 && event.clientY >= menuRect.top - 16 && event.clientY <= menuRect.bottom + 16) {
      this.cancelHide();
      return;
    }
    if (submenuRect && event.clientX >= submenuRect.left - 16 && event.clientX <= submenuRect.right + 16 && event.clientY >= submenuRect.top - 16 && event.clientY <= submenuRect.bottom + 16) {
      this.cancelHide();
      return;
    }
    this.scheduleHide();
  }
  toggleMenu() {
    if (this.menu.hasClass("is-open")) {
      this.menu.removeClass("is-open");
      this.submenu.removeClass("is-open");
      window.setTimeout(() => {
        if (!this.menu.hasClass("is-open")) {
          this.menu.hide();
        }
        if (!this.submenu.hasClass("is-open")) {
          this.submenu.hide();
        }
      }, 120);
      return;
    }
    this.openMenu();
  }
  renderHeadingSubmenu() {
    for (const item of HEADING_SUBMENU_ITEMS) {
      const row = this.submenu.createEl("button", {
        cls: "side-mark-selection-menu-row",
        attr: { type: "button", title: item.label, "aria-label": item.label }
      });
      row.createSpan({ cls: "side-mark-selection-menu-icon", text: item.shortcut || "" });
      row.createSpan({ cls: "side-mark-selection-menu-label", text: item.label });
      row.createSpan({ cls: "side-mark-selection-menu-check" });
      if (isSelectionFormatAction(item.id)) {
        this.formatRows.set(item.id, row);
      }
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (item.id) {
          this.formatLabel.setText(item.shortcut || item.label);
          this.onAction(item.id);
        }
        this.hide();
      });
    }
  }
  setCurrentFormat(format) {
    this.formatLabel.empty();
    const icon = FORMAT_ICONS[format];
    if (icon) {
      (0, import_obsidian6.setIcon)(this.formatLabel, icon);
    } else {
      this.formatLabel.setText(FORMAT_LABELS[format] || "T");
    }
    for (const [action, row] of this.formatRows) {
      row.toggleClass("is-active", action === format);
    }
  }
  openMenu() {
    this.cancelHide();
    const rect = this.el.getBoundingClientRect();
    this.menu.show();
    this.menu.style.left = `${clamp5(rect.left, 8, window.innerWidth - this.menu.offsetWidth - 8)}px`;
    this.menu.style.top = `${clamp5(rect.bottom + 8, 8, window.innerHeight - this.menu.offsetHeight - 8)}px`;
    window.requestAnimationFrame(() => this.menu.addClass("is-open"));
  }
  openSubmenu(row) {
    const rowRect = row.getBoundingClientRect();
    this.submenu.show();
    const submenuWidth = this.submenu.offsetWidth;
    const submenuHeight = this.submenu.offsetHeight;
    const preferredLeft = rowRect.right + 8;
    const fallbackLeft = rowRect.left - submenuWidth - 8;
    const left = preferredLeft + submenuWidth <= window.innerWidth - 8 ? preferredLeft : fallbackLeft;
    this.submenu.style.left = `${clamp5(left, 8, window.innerWidth - submenuWidth - 8)}px`;
    this.submenu.style.top = `${clamp5(rowRect.top, 8, window.innerHeight - submenuHeight - 8)}px`;
    window.requestAnimationFrame(() => this.submenu.addClass("is-open"));
  }
  closeSubmenu() {
    this.submenu.removeClass("is-open");
    window.setTimeout(() => {
      if (!this.submenu.hasClass("is-open")) {
        this.submenu.hide();
      }
    }, 120);
  }
};
function clamp5(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}
function isSelectionFormatAction(action) {
  return action === "paragraph" || action === "heading-1" || action === "heading-2" || action === "heading-3" || action === "heading-4" || action === "heading-5" || action === "heading-6" || action === "number-list" || action === "bullet-list" || action === "task-list" || action === "quote" || action === "code-block";
}

// src/storage.ts
var import_obsidian7 = require("obsidian");
var import_crypto = require("crypto");

// src/anchors.ts
var CONTEXT_LENGTH = 40;
function createTextAnchor(source, startOffset, endOffset) {
  const start = Math.max(0, Math.min(startOffset, endOffset, source.length));
  const end = Math.max(start, Math.min(Math.max(startOffset, endOffset), source.length));
  const startPosition = offsetToLineColumn(source, start);
  const endPosition = offsetToLineColumn(source, end);
  return {
    startOffset: start,
    endOffset: end,
    selectedText: source.slice(start, end),
    prefix: source.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: source.slice(end, end + CONTEXT_LENGTH),
    position: {
      lineStart: startPosition.line,
      lineEnd: endPosition.line,
      columnStart: startPosition.column,
      columnEnd: endPosition.column
    }
  };
}
function relocateAnchor(source, anchor) {
  if (!anchor.selectedText) {
    return null;
  }
  if (source.slice(anchor.startOffset, anchor.endOffset) === anchor.selectedText) {
    return anchor;
  }
  const contextual = findByContext(source, anchor);
  if (contextual) {
    return createTextAnchor(source, contextual, contextual + anchor.selectedText.length);
  }
  const matches = findExactMatches(source, anchor.selectedText);
  if (matches.length === 1) {
    return createTextAnchor(source, matches[0] || 0, (matches[0] || 0) + anchor.selectedText.length);
  }
  return null;
}
function findByContext(source, anchor) {
  let searchFrom = 0;
  let best = null;
  let ambiguous = false;
  while (searchFrom <= source.length) {
    const index = source.indexOf(anchor.selectedText, searchFrom);
    if (index < 0) {
      break;
    }
    const end = index + anchor.selectedText.length;
    const prefix = source.slice(Math.max(0, index - anchor.prefix.length), index);
    const suffix = source.slice(end, end + anchor.suffix.length);
    const score = similarity(prefix, anchor.prefix) + similarity(suffix, anchor.suffix);
    if (!best || score > best.score) {
      best = { index, score };
      ambiguous = false;
    } else if (score === best.score) {
      ambiguous = true;
    }
    searchFrom = end;
  }
  return best && best.score >= 1.4 && !ambiguous ? best.index : null;
}
function findExactMatches(source, selectedText) {
  const matches = [];
  let searchFrom = 0;
  while (searchFrom <= source.length) {
    const index = source.indexOf(selectedText, searchFrom);
    if (index < 0) {
      break;
    }
    matches.push(index);
    searchFrom = index + Math.max(1, selectedText.length);
  }
  return matches;
}
function similarity(left, right) {
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) {
    return 1;
  }
  let same = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] === right[index]) {
      same += 1;
    }
  }
  return same / maxLength;
}
function offsetToLineColumn(source, offset) {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

// src/types.ts
var DATA_DIR = ".obsidian-float-marks";
var DEFAULT_SETTINGS = {
  dataDir: DATA_DIR,
  autoOpenSidebar: true,
  autoSyncToLark: false,
  preferBodyBlockForLark: false,
  commentAuthorName: "\u6211"
};

// src/storage.ts
var SideMarkStore = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
  }
  updateSettings(settings) {
    this.settings = settings;
  }
  async loadDocument(filePath) {
    const normalizedPath = (0, import_obsidian7.normalizePath)(filePath);
    const sidecarPath = this.getSidecarPath(normalizedPath);
    if (!await this.app.vault.adapter.exists(sidecarPath)) {
      return this.createEmptyDocument(normalizedPath);
    }
    const raw = await this.app.vault.adapter.read(sidecarPath);
    const parsed = JSON.parse(raw);
    return {
      schemaVersion: 1,
      filePath: normalizedPath,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : (/* @__PURE__ */ new Date()).toISOString(),
      marks: Array.isArray(parsed.marks) ? parsed.marks.map((mark) => this.normalizeMark(mark)) : []
    };
  }
  async saveDocument(document) {
    const normalizedPath = (0, import_obsidian7.normalizePath)(document.filePath);
    const next = {
      schemaVersion: 1,
      filePath: normalizedPath,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      marks: [...document.marks].sort((left, right) => left.anchor.startOffset - right.anchor.startOffset)
    };
    const sidecarPath = this.getSidecarPath(normalizedPath);
    await this.app.vault.adapter.mkdir(this.getFilesDir());
    await this.app.vault.adapter.write(sidecarPath, JSON.stringify(next, null, 2));
    return next;
  }
  async createMark(input) {
    var _a;
    const anchor = createTextAnchor(input.source, input.startOffset, input.endOffset);
    if (!anchor.selectedText) {
      throw new Error("Cannot create a mark from an empty selection.");
    }
    const document = await this.loadDocument(input.filePath);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const mark = {
      id: crypto.randomUUID(),
      filePath: (0, import_obsidian7.normalizePath)(input.filePath),
      anchor,
      mark: {
        kind: input.kind,
        color: input.color,
        textColor: input.textColor || "default",
        backgroundColor: input.backgroundColor || "none"
      },
      note: {
        content: input.noteContent || "",
        createdAt: now,
        updatedAt: now
      },
      replies: input.kind === "comment" && ((_a = input.noteContent) == null ? void 0 : _a.trim()) ? [this.createReply(input.noteContent, now)] : [],
      status: "active",
      remote: {
        status: "pending"
      }
    };
    return this.saveDocument({
      ...document,
      marks: [...document.marks, mark]
    });
  }
  async updateMark(filePath, markId, update) {
    const document = await this.loadDocument(filePath);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return this.saveDocument({
      ...document,
      marks: document.marks.map((mark) => {
        var _a, _b, _c;
        if (mark.id !== markId) {
          return mark;
        }
        return {
          ...mark,
          status: (_a = update.status) != null ? _a : mark.status,
          remote: (_b = update.remote) != null ? _b : mark.remote,
          mark: (_c = update.mark) != null ? _c : mark.mark,
          note: update.noteContent === void 0 ? mark.note : {
            ...mark.note,
            content: update.noteContent,
            updatedAt: now
          }
        };
      })
    });
  }
  async addReply(filePath, markId, content) {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("\u8BC4\u8BBA\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\u3002");
    }
    const document = await this.loadDocument(filePath);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return this.saveDocument({
      ...document,
      marks: document.marks.map((mark) => {
        var _a;
        if (mark.id !== markId) {
          return mark;
        }
        const replies = this.getReplies(mark);
        return {
          ...mark,
          replies: [...replies, this.createReply(trimmed, now)],
          note: {
            ...mark.note,
            content: [...replies.map((reply) => reply.content), trimmed].join("\n\n"),
            updatedAt: now
          },
          remote: ((_a = mark.remote) == null ? void 0 : _a.status) === "synced" ? { ...mark.remote, status: "pending" } : mark.remote
        };
      })
    });
  }
  async updateReply(filePath, markId, replyId, content) {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("\u8BC4\u8BBA\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\u3002");
    }
    const document = await this.loadDocument(filePath);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return this.saveDocument({
      ...document,
      marks: document.marks.map((mark) => {
        var _a;
        if (mark.id !== markId) {
          return mark;
        }
        const replies = this.getReplies(mark).map((reply) => reply.id === replyId ? { ...reply, content: trimmed, updatedAt: now } : reply);
        return {
          ...mark,
          replies,
          note: {
            ...mark.note,
            content: replies.map((reply) => reply.content).join("\n\n"),
            updatedAt: now
          },
          remote: ((_a = mark.remote) == null ? void 0 : _a.status) === "synced" ? { ...mark.remote, status: "pending" } : mark.remote
        };
      })
    });
  }
  async deleteReply(filePath, markId, replyId) {
    const document = await this.loadDocument(filePath);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return this.saveDocument({
      ...document,
      marks: document.marks.map((mark) => {
        var _a;
        if (mark.id !== markId) {
          return mark;
        }
        const replies = this.getReplies(mark).filter((reply) => reply.id !== replyId);
        return {
          ...mark,
          replies,
          note: {
            ...mark.note,
            content: replies.map((reply) => reply.content).join("\n\n"),
            updatedAt: now
          },
          remote: ((_a = mark.remote) == null ? void 0 : _a.status) === "synced" ? { ...mark.remote, status: "pending" } : mark.remote
        };
      })
    });
  }
  async deleteMark(filePath, markId) {
    const document = await this.loadDocument(filePath);
    return this.saveDocument({
      ...document,
      marks: document.marks.filter((mark) => mark.id !== markId)
    });
  }
  async relocateDocument(filePath, source) {
    const document = await this.loadDocument(filePath);
    let changed = false;
    const marks = document.marks.map((mark) => {
      const anchor = relocateAnchor(source, mark.anchor);
      if (!anchor) {
        if (mark.status === "orphaned") {
          return mark;
        }
        changed = true;
        return { ...mark, status: "orphaned" };
      }
      if (anchor.startOffset === mark.anchor.startOffset && anchor.endOffset === mark.anchor.endOffset && mark.status !== "orphaned") {
        return mark;
      }
      changed = true;
      return {
        ...mark,
        anchor,
        status: mark.status === "orphaned" ? "active" : mark.status
      };
    });
    if (!changed) {
      return document;
    }
    return this.saveDocument({ ...document, marks });
  }
  createEmptyDocument(filePath) {
    return {
      schemaVersion: 1,
      filePath,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      marks: []
    };
  }
  getSidecarPath(filePath) {
    return (0, import_obsidian7.normalizePath)(`${this.getFilesDir()}/${hashPath(filePath)}.json`);
  }
  getFilesDir() {
    return (0, import_obsidian7.normalizePath)(`${this.settings.dataDir || DEFAULT_SETTINGS.dataDir}/files`);
  }
  normalizeMark(mark) {
    var _a, _b, _c;
    if (mark.mark.kind !== "comment") {
      const legacyNoteContent = ((_a = mark.note) == null ? void 0 : _a.content) || ((_c = (_b = mark.replies) == null ? void 0 : _b[0]) == null ? void 0 : _c.content) || "";
      return {
        ...mark,
        replies: [],
        note: {
          ...mark.note,
          content: legacyNoteContent
        }
      };
    }
    const replies = this.getReplies(mark);
    return {
      ...mark,
      replies,
      note: {
        ...mark.note,
        content: replies.length ? replies.map((reply) => reply.content).join("\n\n") : mark.note.content
      }
    };
  }
  getReplies(mark) {
    var _a, _b;
    if (Array.isArray(mark.replies)) {
      return mark.replies;
    }
    const content = (_b = (_a = mark.note) == null ? void 0 : _a.content) == null ? void 0 : _b.trim();
    if (!content) {
      return [];
    }
    const createdAt = mark.note.createdAt || (/* @__PURE__ */ new Date()).toISOString();
    return [this.createReply(content, createdAt)];
  }
  createReply(content, now) {
    return {
      id: crypto.randomUUID(),
      authorName: this.settings.commentAuthorName || DEFAULT_SETTINGS.commentAuthorName,
      content,
      createdAt: now,
      updatedAt: now
    };
  }
};
function hashPath(filePath) {
  return (0, import_crypto.createHash)("sha1").update((0, import_obsidian7.normalizePath)(filePath)).digest("hex");
}

// src/sidebar-view.ts
var import_obsidian8 = require("obsidian");

// src/icons.ts
var FLOAT_MARK_ICON_ID = "float-mark";
var FLOAT_MARK_ICON_SVG = `
<g fill="none" stroke="currentColor" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round">
	<path d="M20 26h60a12 12 0 0 1 12 12v28a12 12 0 0 1-12 12H56L37 94V78H20A12 12 0 0 1 8 66V38a12 12 0 0 1 12-12Z"/>
	<path d="M28 50h44"/>
	<path d="M28 64h28"/>
	<path d="M30 10h40"/>
</g>
`;

// src/sidebar-view.ts
var SIDE_MARK_VIEW_TYPE = "side-mark-sidebar";
var MARK_COLORS = [
  { color: "yellow", label: "\u9EC4\u8272" },
  { color: "blue", label: "\u84DD\u8272" },
  { color: "green", label: "\u7EFF\u8272" },
  { color: "red", label: "\u7EA2\u8272" }
];
var SideMarkSidebarView = class extends import_obsidian8.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.focusedMarkId = "";
    this.activeTab = "comments";
    this.filter = "active";
    this.tagFilter = "all";
    this.colorFilter = "all";
    this.searchQuery = "";
    this.restoreSearchFocus = false;
    this.searchSelectionStart = null;
    this.searchSelectionEnd = null;
    this.isSearchComposing = false;
  }
  getViewType() {
    return SIDE_MARK_VIEW_TYPE;
  }
  getDisplayText() {
    return "FloatMark";
  }
  getIcon() {
    return FLOAT_MARK_ICON_ID;
  }
  async onOpen() {
    await this.render();
  }
  focusMark(markId) {
    this.focusedMarkId = markId;
    void this.render();
    window.setTimeout(() => {
      var _a;
      (_a = this.containerEl.querySelector(`[data-side-mark-card-id="${markId}"]`)) == null ? void 0 : _a.scrollIntoView({
        block: "center"
      });
    });
  }
  async render() {
    const container = this.contentEl;
    container.empty();
    container.addClass("side-mark-sidebar");
    const header = container.createDiv({ cls: "side-mark-sidebar-header" });
    const titleRow = header.createDiv({ cls: "side-mark-sidebar-title-row" });
    titleRow.createEl("h3", { text: "\u6B63\u6587\u6807\u6CE8" });
    const doc = this.plugin.currentDocument;
    const allMarks = (doc == null ? void 0 : doc.marks) || [];
    const toolbarRow = header.createDiv({ cls: "side-mark-sidebar-toolbar-row" });
    this.renderTabs(toolbarRow, allMarks);
    const controls = toolbarRow.createDiv({ cls: "side-mark-sidebar-controls" });
    if (!doc || doc.marks.length === 0) {
      this.renderFilters(header, controls, [], []);
      this.restoreSearchInputFocus();
      container.createDiv({ text: "\u5F53\u524D\u6587\u6863\u8FD8\u6CA1\u6709\u6807\u6CE8\u3002", cls: "setting-item-description" });
      return;
    }
    const tabMarks = this.getTabMarks(doc.marks);
    const marks = this.getFilteredMarks(tabMarks);
    this.renderFilters(header, controls, tabMarks, marks);
    this.restoreSearchInputFocus();
    if (marks.length === 0) {
      container.createDiv({
        text: this.activeTab === "comments" ? "\u5F53\u524D\u7B5B\u9009\u4E0B\u6CA1\u6709\u8BC4\u8BBA\u3002" : "\u5F53\u524D\u7B5B\u9009\u4E0B\u6CA1\u6709\u6807\u8BB0\u3002",
        cls: "setting-item-description"
      });
      return;
    }
    for (const mark of marks) {
      if (this.activeTab === "comments") {
        this.renderCard(container, mark);
      } else {
        this.renderMarkCard(container, mark);
      }
    }
  }
  renderTabs(container, marks) {
    const tabs = container.createDiv({ cls: "side-mark-sidebar-tabs" });
    this.renderTab(tabs, "comments", "\u8BC4\u8BBA", this.getFilteredMarks(this.getTabMarks(marks, "comments"), "comments").length);
    this.renderTab(tabs, "marks", "\u6807\u8BB0", this.getFilteredMarks(this.getTabMarks(marks, "marks"), "marks").length);
  }
  renderTab(container, tab, label, count) {
    const button = container.createEl("button", {
      cls: `side-mark-sidebar-tab${this.activeTab === tab ? " is-active" : ""}`,
      attr: { type: "button" }
    });
    button.createSpan({ cls: "side-mark-sidebar-tab-label", text: label });
    button.createSpan({ cls: "side-mark-sidebar-tab-count", text: String(count) });
    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.selectTab(tab);
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.selectTab(tab);
    });
  }
  selectTab(tab) {
    if (this.activeTab === tab) {
      return;
    }
    this.activeTab = tab;
    this.searchQuery = "";
    void this.render();
  }
  renderFilters(container, controls, allMarks, filteredMarks) {
    this.renderSelect(controls, "\u72B6\u6001", this.filter, [
      { value: "active", label: "\u6D3B\u52A8" },
      { value: "all", label: "\u5168\u90E8" },
      { value: "resolved", label: "\u5DF2\u89E3\u51B3" },
      { value: "orphaned", label: "\u5931\u8054" }
    ], (value) => {
      this.filter = value;
      void this.render();
    });
    if (this.activeTab === "comments") {
      this.renderSelect(controls, "\u989C\u8272", this.colorFilter, [
        { value: "all", label: "\u5168\u90E8" },
        { value: "yellow", label: "\u9EC4\u8272" },
        { value: "blue", label: "\u84DD\u8272" },
        { value: "green", label: "\u7EFF\u8272" },
        { value: "red", label: "\u7EA2\u8272" }
      ], (value) => {
        this.colorFilter = value;
        void this.render();
      });
    }
    this.renderSelect(controls, "\u6807\u7B7E", this.tagFilter, [
      { value: "all", label: "\u5168\u90E8" }
    ], (value) => {
      this.tagFilter = value;
      void this.render();
    });
    const searchWrap = container.createDiv({ cls: "side-mark-sidebar-search" });
    const search = searchWrap.createEl("input", {
      cls: "side-mark-sidebar-search-input",
      attr: {
        type: "search",
        placeholder: this.activeTab === "comments" ? "\u641C\u7D22\u8BC4\u8BBA" : "\u641C\u7D22\u6807\u8BB0",
        "aria-label": this.activeTab === "comments" ? "\u641C\u7D22\u8BC4\u8BBA" : "\u641C\u7D22\u6807\u8BB0"
      }
    });
    search.value = this.searchQuery;
    search.addEventListener("compositionstart", () => {
      this.isSearchComposing = true;
    });
    search.addEventListener("compositionend", () => {
      this.isSearchComposing = false;
      this.updateSearchQuery(search);
    });
    search.addEventListener("input", (event) => {
      this.searchQuery = search.value;
      if (this.isSearchComposing || isInputEvent(event) && event.isComposing) {
        return;
      }
      this.updateSearchQuery(search);
    });
    container.createDiv({
      cls: "side-mark-sidebar-stats",
      text: allMarks.length === filteredMarks.length ? `\u5F53\u524D\u6587\u6863\uFF0C\u5171 ${allMarks.length} \u6761${this.activeTab === "comments" ? "\u8BC4\u8BBA" : "\u6807\u8BB0"}` : `\u5F53\u524D\u7B5B\u9009\uFF0C\u5171 ${filteredMarks.length} / ${allMarks.length} \u6761${this.activeTab === "comments" ? "\u8BC4\u8BBA" : "\u6807\u8BB0"}`
    });
  }
  renderSelect(container, label, value, options, onChange) {
    const field = container.createDiv({ cls: "side-mark-filter-field" });
    let hideTimer = 0;
    const clearHideTimer = () => {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = 0;
      }
    };
    const scheduleHideMenu = () => {
      clearHideTimer();
      hideTimer = window.setTimeout(() => {
        menu.hide();
        hideTimer = 0;
      }, 160);
    };
    const trigger = field.createEl("button", {
      cls: "side-mark-filter-trigger",
      text: label,
      attr: { type: "button", "aria-label": label }
    });
    const chevron = trigger.createSpan({ cls: "side-mark-filter-chevron" });
    (0, import_obsidian8.setIcon)(chevron, "chevron-down");
    const menu = field.createDiv({ cls: "side-mark-filter-menu" });
    menu.hide();
    for (const option of options) {
      const item = menu.createEl("button", {
        cls: `side-mark-filter-menu-item${option.value === value ? " is-active" : ""}`,
        attr: { type: "button" }
      });
      const check = item.createSpan({ cls: "side-mark-filter-menu-check" });
      if (option.value === value) {
        (0, import_obsidian8.setIcon)(check, "check");
      }
      item.createSpan({ cls: "side-mark-filter-menu-label", text: option.label });
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        clearHideTimer();
        menu.hide();
        onChange(option.value);
      });
    }
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.containerEl.querySelectorAll(".side-mark-filter-menu").forEach((other) => {
        if (other !== menu) {
          other.hide();
        }
      });
      if (menu.isShown()) {
        menu.hide();
      } else {
        clearHideTimer();
        menu.show();
      }
    });
    field.addEventListener("mouseenter", clearHideTimer);
    field.addEventListener("mouseleave", scheduleHideMenu);
    menu.addEventListener("mouseenter", clearHideTimer);
    menu.addEventListener("mouseleave", scheduleHideMenu);
  }
  getFilteredMarks(marks, tab = this.activeTab) {
    const query = this.searchQuery.trim().toLowerCase();
    return marks.filter((mark) => {
      if (this.filter === "active" && mark.status !== "active") {
        return false;
      }
      if (this.filter === "resolved" && mark.status !== "resolved") {
        return false;
      }
      if (this.filter === "orphaned" && mark.status !== "orphaned") {
        return false;
      }
      if (tab === "comments" && this.colorFilter !== "all" && mark.mark.color !== this.colorFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        mark.anchor.selectedText,
        mark.note.content,
        ...(mark.replies || []).map((reply) => reply.content)
      ].join("\n").toLowerCase();
      return haystack.includes(query);
    });
  }
  getTabMarks(marks, tab = this.activeTab) {
    return marks.filter((mark) => tab === "comments" ? mark.mark.kind === "comment" : mark.mark.kind === "highlight");
  }
  updateSearchQuery(search) {
    this.searchQuery = search.value;
    this.restoreSearchFocus = true;
    this.searchSelectionStart = search.selectionStart;
    this.searchSelectionEnd = search.selectionEnd;
    void this.render();
  }
  restoreSearchInputFocus() {
    var _a, _b;
    if (!this.restoreSearchFocus) {
      return;
    }
    this.restoreSearchFocus = false;
    const search = this.containerEl.querySelector(".side-mark-sidebar-search-input");
    if (!search) {
      return;
    }
    search.focus();
    const start = (_a = this.searchSelectionStart) != null ? _a : search.value.length;
    const end = (_b = this.searchSelectionEnd) != null ? _b : start;
    search.setSelectionRange(start, end);
  }
  renderCard(container, mark) {
    const card = container.createDiv({
      cls: `side-mark-card is-color-${mark.mark.color}${mark.status === "resolved" ? " is-resolved" : ""}`
    });
    card.dataset.sideMarkCardId = mark.id;
    if (mark.id === this.focusedMarkId) {
      card.addClass("is-focused");
    }
    card.addEventListener("click", (event) => {
      const target = isHtmlElement(event.target) ? event.target : null;
      const interactive = target == null ? void 0 : target.closest(
        "button, textarea, input, select, a, .side-mark-card-menu, .side-mark-color-menu, .side-mark-reply-content"
      );
      if (interactive) {
        return;
      }
      void this.plugin.jumpToMark(mark.id);
      this.focusMark(mark.id);
    });
    this.renderCardToolbar(card, mark);
    const quote = card.createDiv({ cls: "side-mark-card-quote" });
    this.renderColorPicker(card, mark);
    quote.createDiv({
      cls: "side-mark-card-quote-text",
      text: mark.anchor.selectedText
    });
    this.renderThread(card, mark);
    this.renderReplyComposer(card, mark);
  }
  renderMarkCard(container, mark) {
    const card = container.createDiv({
      cls: `side-mark-card side-mark-marker-card is-background-${mark.mark.backgroundColor}${mark.status === "resolved" ? " is-resolved" : ""}`
    });
    card.dataset.sideMarkCardId = mark.id;
    if (mark.id === this.focusedMarkId) {
      card.addClass("is-focused");
    }
    card.addEventListener("click", (event) => {
      const target = isHtmlElement(event.target) ? event.target : null;
      const interactive = target == null ? void 0 : target.closest("button, textarea, input, a, .side-mark-card-menu, .side-mark-marker-note");
      if (interactive) {
        return;
      }
      void this.plugin.jumpToMark(mark.id);
      this.focusMark(mark.id);
    });
    const toolbar = card.createDiv({ cls: "side-mark-card-toolbar" });
    this.addIconAction(toolbar, "chevrons-up", "\u5B9A\u4F4D", () => void this.plugin.jumpToMark(mark.id));
    this.addIconAction(toolbar, "palette", "\u6837\u5F0F", () => {
      const rect = card.getBoundingClientRect();
      void this.plugin.openMark(mark.id, rect);
    });
    this.addIconAction(toolbar, "sticky-note", mark.note.content.trim() ? "\u7F16\u8F91\u5907\u6CE8" : "\u6DFB\u52A0\u5907\u6CE8", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.renderMarkerNoteEditor(card, mark);
    });
    this.addDeleteIconAction(toolbar, "\u5220\u9664", () => void this.deleteMark(mark.id));
    const more = toolbar.createEl("button", {
      cls: "side-mark-card-icon-button",
      attr: { type: "button", title: "\u66F4\u591A", "aria-label": "\u66F4\u591A" }
    });
    (0, import_obsidian8.setIcon)(more, "more-horizontal");
    const menu = card.createDiv({ cls: "side-mark-card-menu" });
    menu.hide();
    this.addMenuAction(menu, "trash-2", "\u5220\u9664", () => void this.deleteMark(mark.id));
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (menu.isShown()) {
        menu.hide();
      } else {
        menu.show();
      }
    });
    card.addEventListener("mouseleave", () => menu.hide());
    const quote = card.createDiv({
      cls: `side-mark-card-quote side-mark-marker-preview side-mark--text-${mark.mark.textColor} side-mark--background-${mark.mark.backgroundColor}`
    });
    quote.createDiv({
      cls: "side-mark-card-quote-text",
      text: mark.anchor.selectedText
    });
    this.renderMarkerNote(card, mark);
    const meta = card.createDiv({ cls: "side-mark-marker-meta" });
    const textSwatch = meta.createSpan({ cls: `side-mark-marker-swatch is-text-${mark.mark.textColor}` });
    textSwatch.setAttr("aria-hidden", "true");
    meta.createSpan({ text: "\u5B57\u4F53" });
    const backgroundSwatch = meta.createSpan({ cls: `side-mark-marker-swatch is-background-${mark.mark.backgroundColor}` });
    backgroundSwatch.setAttr("aria-hidden", "true");
    meta.createSpan({ text: "\u80CC\u666F" });
  }
  renderMarkerNote(card, mark) {
    const content = mark.note.content.trim();
    if (!content) {
      return;
    }
    const note = card.createDiv({ cls: "side-mark-marker-note" });
    const display = note.createDiv({ cls: "side-mark-marker-note-display" });
    const body = display.createDiv({
      cls: "side-mark-marker-note-body",
      text: content,
      attr: { title: "\u53CC\u51FB\u4FEE\u6539\u5907\u6CE8" }
    });
    this.addInlineDeleteAction(display, "\u5220\u9664\u5907\u6CE8", () => {
      void this.deleteMarkerNote(mark.id);
    });
    body.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.renderMarkerNoteEditor(card, mark);
    });
  }
  renderMarkerNoteEditor(card, mark) {
    var _a;
    card.addClass("is-composing");
    (_a = card.querySelector(".side-mark-marker-note")) == null ? void 0 : _a.remove();
    const quote = card.querySelector(".side-mark-card-quote");
    const note = card.createDiv({ cls: "side-mark-marker-note is-editing" });
    const textarea = note.createEl("textarea", {
      text: mark.note.content,
      attr: { placeholder: "\u5199\u4E00\u6761\u5907\u6CE8" }
    });
    const actions = note.createDiv({ cls: "side-mark-marker-note-actions" });
    const cancel = actions.createEl("button", {
      text: "\u53D6\u6D88",
      cls: "side-mark-secondary-button",
      attr: { type: "button" }
    });
    const save = actions.createEl("button", {
      text: "\u4FDD\u5B58",
      cls: "side-mark-primary-button",
      attr: { type: "button" }
    });
    const close = () => {
      void this.render();
    };
    const submit = async () => {
      const next = textarea.value.trim();
      if (next === mark.note.content.trim()) {
        close();
        return;
      }
      await this.plugin.updateMarkNote(mark.id, next);
    };
    cancel.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });
    save.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void submit();
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void submit();
      }
    });
    if (quote == null ? void 0 : quote.nextSibling) {
      card.insertBefore(note, quote.nextSibling);
    } else {
      card.appendChild(note);
    }
    textarea.focus();
    textarea.select();
  }
  renderColorPicker(card, mark) {
    const menu = card.createDiv({ cls: "side-mark-color-menu" });
    menu.hide();
    for (const item of MARK_COLORS) {
      const button = menu.createEl("button", {
        cls: `side-mark-color-option is-${item.color}${item.color === mark.mark.color ? " is-active" : ""}`,
        attr: { type: "button", title: item.label, "aria-label": item.label }
      });
      if (item.color === mark.mark.color) {
        (0, import_obsidian8.setIcon)(button, "check");
      }
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        menu.hide();
        card.removeClass("is-color-picker-open");
        void this.plugin.updateMarkColor(mark.id, item.color);
      });
    }
    card.addEventListener("mouseleave", () => {
      menu.hide();
      card.removeClass("is-color-picker-open");
    });
  }
  toggleColorPicker(card) {
    const menu = card.querySelector(".side-mark-color-menu");
    const cardMenu = card.querySelector(".side-mark-card-menu");
    if (!menu) {
      return;
    }
    if (menu.isShown()) {
      menu.hide();
      card.removeClass("is-color-picker-open");
      return;
    }
    cardMenu == null ? void 0 : cardMenu.hide();
    this.positionColorMenu(card);
    menu.show();
    card.addClass("is-color-picker-open");
  }
  positionColorMenu(card) {
    const menu = card.querySelector(".side-mark-color-menu");
    const toolbar = card.querySelector(".side-mark-card-toolbar");
    if (!menu || !toolbar) {
      return;
    }
    menu.style.top = `${toolbar.offsetTop + toolbar.offsetHeight + 4}px`;
    menu.style.right = `${Math.max(4, card.clientWidth - toolbar.offsetLeft - toolbar.offsetWidth)}px`;
  }
  renderCardToolbar(card, mark) {
    const toolbar = card.createDiv({ cls: "side-mark-card-toolbar" });
    this.addIconAction(toolbar, "chevrons-up", "\u5B9A\u4F4D", () => void this.plugin.jumpToMark(mark.id));
    this.addSyncAction(toolbar, mark);
    this.addIconAction(toolbar, "palette", "\u989C\u8272", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleColorPicker(card);
    });
    this.addIconAction(
      toolbar,
      mark.status === "resolved" ? "circle" : "circle-check",
      mark.status === "resolved" ? "\u6062\u590D" : "\u89E3\u51B3",
      () => void this.toggleResolved(mark.id)
    );
    const more = toolbar.createEl("button", {
      cls: "side-mark-card-icon-button",
      attr: { type: "button", title: "\u66F4\u591A", "aria-label": "\u66F4\u591A" }
    });
    (0, import_obsidian8.setIcon)(more, "more-horizontal");
    const menu = card.createDiv({ cls: "side-mark-card-menu is-compact" });
    menu.hide();
    this.addMenuAction(menu, "trash-2", "\u5220\u9664", () => void this.deleteMark(mark.id));
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (menu.isShown()) {
        menu.hide();
      } else {
        menu.show();
      }
    });
    card.addEventListener("mouseleave", () => menu.hide());
  }
  renderThread(card, mark) {
    var _a;
    const thread = card.createDiv({ cls: "side-mark-thread" });
    const replies = ((_a = mark.replies) == null ? void 0 : _a.length) ? mark.replies : mark.note.content.trim() ? [{
      id: "legacy-note",
      authorName: this.plugin.settings.commentAuthorName,
      content: mark.note.content,
      createdAt: mark.note.createdAt,
      updatedAt: mark.note.updatedAt
    }] : [];
    if (!replies.length) {
      thread.createDiv({ cls: "side-mark-empty-thread", text: "\u8FD8\u6CA1\u6709\u8BC4\u8BBA\uFF0C\u7EE7\u7EED\u8F93\u5165\u7B2C\u4E00\u6761\u3002" });
      return;
    }
    for (const [index, reply] of replies.entries()) {
      const isThreadHead = index === 0;
      const row = thread.createDiv({ cls: `side-mark-reply${isThreadHead ? " is-thread-head" : " is-continuation"}` });
      if (isThreadHead) {
        const authorName = reply.authorName || this.plugin.settings.commentAuthorName || "\u6211";
        const avatar = row.createDiv({ cls: "side-mark-avatar", text: authorName.slice(0, 1) || "\u6211" });
        avatar.setAttr("aria-hidden", "true");
      }
      const body = row.createDiv({ cls: "side-mark-reply-body" });
      const meta = body.createDiv({ cls: "side-mark-reply-meta" });
      if (isThreadHead) {
        meta.createSpan({
          cls: "side-mark-reply-author",
          text: reply.authorName || this.plugin.settings.commentAuthorName || "\u6211"
        });
      }
      meta.createSpan({ cls: "side-mark-reply-time", text: formatReplyTime(reply.createdAt) });
      const content = body.createDiv({
        cls: "side-mark-reply-content",
        text: reply.content,
        attr: { title: "\u53CC\u51FB\u4FEE\u6539\u8BC4\u8BBA" }
      });
      this.addInlineDeleteAction(content, "\u5220\u9664\u8BC4\u8BBA", () => {
        void this.deleteReply(mark, replies, reply.id);
      });
      content.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.renderReplyEditor(body, mark.id, reply.id, reply.content);
      });
    }
  }
  renderReplyEditor(body, markId, replyId, content) {
    var _a;
    (_a = body.querySelector(".side-mark-reply-content")) == null ? void 0 : _a.remove();
    const editor = body.createDiv({ cls: "side-mark-reply-editor" });
    const textarea = editor.createEl("textarea", { text: content });
    const actions = editor.createDiv({ cls: "side-mark-reply-editor-actions" });
    const cancel = actions.createEl("button", {
      text: "\u53D6\u6D88",
      cls: "side-mark-secondary-button",
      attr: { type: "button" }
    });
    const save = actions.createEl("button", {
      text: "\u4FDD\u5B58",
      cls: "side-mark-primary-button",
      attr: { type: "button" }
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      void this.render();
    };
    const submit = async () => {
      if (closed) return;
      const next = textarea.value.trim();
      if (!next || next === content.trim()) {
        close();
        return;
      }
      closed = true;
      await this.plugin.updateMarkReply(markId, replyId, next);
    };
    cancel.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });
    save.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void submit();
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void submit();
      }
    });
    textarea.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!editor.contains(editor.doc.activeElement)) {
          void submit();
        }
      }, 80);
    });
    textarea.focus();
    textarea.select();
  }
  renderReplyComposer(card, mark) {
    const composer = card.createDiv({ cls: "side-mark-reply-composer" });
    const trigger = composer.createEl("button", {
      text: "\u56DE\u590D...",
      cls: "side-mark-reply-trigger",
      attr: { type: "button" }
    });
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      composer.addClass("is-editing");
      card.addClass("is-composing");
      trigger.hide();
      textarea.show();
      textarea.focus();
    });
    const textarea = composer.createEl("textarea", {
      attr: { placeholder: "\u7EE7\u7EED\u8BC4\u8BBA" }
    });
    textarea.hide();
    const row = composer.createDiv({ cls: "side-mark-reply-composer-actions" });
    row.hide();
    const cancel = row.createEl("button", {
      text: "\u53D6\u6D88",
      cls: "side-mark-secondary-button",
      attr: { type: "button" }
    });
    const submit = row.createEl("button", {
      text: "\u56DE\u590D",
      cls: "side-mark-primary-button",
      attr: { type: "button" }
    });
    const closeComposer = () => {
      textarea.value = "";
      row.hide();
      textarea.hide();
      trigger.show();
      composer.removeClass("is-editing");
      card.removeClass("is-composing");
    };
    cancel.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeComposer();
    });
    submit.addEventListener("click", () => {
      const content = textarea.value.trim();
      if (!content) {
        return;
      }
      void this.plugin.addMarkReply(mark.id, content).then(closeComposer);
    });
    textarea.addEventListener("input", () => {
      if (textarea.value.trim()) {
        row.show();
      } else {
        row.hide();
      }
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeComposer();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submit.click();
      }
    });
  }
  addIconAction(container, icon, label, onClick) {
    const button = container.createEl("button", {
      cls: "side-mark-card-icon-button",
      attr: { type: "button", title: label, "aria-label": label }
    });
    (0, import_obsidian8.setIcon)(button, icon);
    button.addEventListener("click", onClick);
  }
  addInlineDeleteAction(container, label, onConfirm) {
    const button = container.createEl("button", {
      cls: "side-mark-card-icon-button side-mark-inline-delete",
      attr: { type: "button", title: label, "aria-label": label }
    });
    (0, import_obsidian8.setIcon)(button, "trash-2");
    this.bindConfirmDeleteButton(button, label, onConfirm);
  }
  addDeleteIconAction(container, label, onConfirm) {
    const button = container.createEl("button", {
      cls: "side-mark-card-icon-button",
      attr: { type: "button", title: label, "aria-label": label }
    });
    (0, import_obsidian8.setIcon)(button, "trash-2");
    this.bindConfirmDeleteButton(button, label, onConfirm);
  }
  bindConfirmDeleteButton(button, label, onConfirm) {
    let isConfirming = false;
    let resetTimer = 0;
    const clearResetTimer = () => {
      if (resetTimer) {
        window.clearTimeout(resetTimer);
        resetTimer = 0;
      }
    };
    const reset = () => {
      clearResetTimer();
      isConfirming = false;
      button.removeClass("is-confirming");
      button.setAttr("title", label);
      button.setAttr("aria-label", label);
      button.empty();
      (0, import_obsidian8.setIcon)(button, "trash-2");
    };
    const confirm = () => {
      clearResetTimer();
      isConfirming = true;
      button.addClass("is-confirming");
      button.setAttr("title", "\u786E\u8BA4\u5220\u9664");
      button.setAttr("aria-label", "\u786E\u8BA4\u5220\u9664");
      button.empty();
      button.createSpan({ text: "\u786E\u8BA4" });
    };
    const scheduleReset = () => {
      clearResetTimer();
      resetTimer = window.setTimeout(reset, 1600);
    };
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isConfirming) {
        confirm();
        scheduleReset();
        return;
      }
      reset();
      onConfirm();
    });
    button.addEventListener("mouseleave", scheduleReset);
    button.addEventListener("blur", scheduleReset);
  }
  addSyncAction(container, mark) {
    var _a;
    const status = ((_a = mark.remote) == null ? void 0 : _a.status) || "pending";
    const label = status === "synced" ? "\u5DF2\u540C\u6B65\u5230\u98DE\u4E66" : status === "failed" ? "\u540C\u6B65\u98DE\u4E66\u5931\u8D25" : "\u540C\u6B65\u5230\u98DE\u4E66";
    const button = container.createEl("button", {
      cls: `side-mark-card-icon-button side-mark-sync-action is-${status}`,
      attr: { type: "button", title: label, "aria-label": label }
    });
    (0, import_obsidian8.setIcon)(button, "link");
    if (status === "synced" || status === "failed") {
      const badge = button.createSpan({ cls: "side-mark-sync-action-badge" });
      (0, import_obsidian8.setIcon)(badge, status === "synced" ? "check" : "x");
    }
    button.addEventListener("click", () => void this.syncMark(mark.id));
  }
  addMenuAction(container, icon, label, onClick) {
    const button = container.createEl("button", {
      cls: "side-mark-card-menu-item is-danger",
      attr: { type: "button", title: label, "aria-label": label }
    });
    const iconEl = button.createSpan({ cls: "side-mark-card-menu-item-icon" });
    (0, import_obsidian8.setIcon)(iconEl, icon);
    const labelEl = button.createSpan({ cls: "side-mark-card-menu-item-label", text: label });
    let isConfirming = false;
    let resetTimer = 0;
    const clearResetTimer = () => {
      if (resetTimer) {
        window.clearTimeout(resetTimer);
        resetTimer = 0;
      }
    };
    const reset = () => {
      clearResetTimer();
      isConfirming = false;
      button.removeClass("is-confirming");
      button.setAttr("title", label);
      button.setAttr("aria-label", label);
      iconEl.empty();
      (0, import_obsidian8.setIcon)(iconEl, icon);
      labelEl.setText(label);
    };
    const scheduleReset = () => {
      clearResetTimer();
      resetTimer = window.setTimeout(reset, 1600);
    };
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isConfirming) {
        clearResetTimer();
        isConfirming = true;
        button.addClass("is-confirming");
        button.setAttr("title", "\u786E\u8BA4\u5220\u9664");
        button.setAttr("aria-label", "\u786E\u8BA4\u5220\u9664");
        iconEl.empty();
        labelEl.setText("\u786E\u8BA4");
        scheduleReset();
        return;
      }
      reset();
      container.hide();
      onClick();
    });
    button.addEventListener("mouseleave", scheduleReset);
    button.addEventListener("blur", scheduleReset);
  }
  async syncMark(markId) {
    try {
      await this.plugin.syncMarkToLark(markId);
      new import_obsidian8.Notice("\u5DF2\u540C\u6B65\u6807\u6CE8\u5230\u98DE\u4E66\u8BC4\u8BBA\u3002");
    } catch (error) {
      new import_obsidian8.Notice(error instanceof Error ? error.message : String(error), 8e3);
    }
    await this.render();
  }
  async deleteMarkerNote(markId) {
    await this.plugin.updateMarkNote(markId, "");
  }
  async deleteReply(mark, replies, replyId) {
    if (replies.length <= 1) {
      await this.deleteMark(mark.id);
      return;
    }
    await this.plugin.deleteMarkReply(mark.id, replyId);
  }
  async toggleResolved(markId) {
    await this.plugin.toggleResolved(markId);
  }
  async deleteMark(markId) {
    await this.plugin.deleteMark(markId);
  }
};
function formatReplyTime(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const diffMs = Date.now() - timestamp;
  if (diffMs < 6e4) {
    return "\u521A\u521A";
  }
  if (diffMs < 36e5) {
    return `${Math.floor(diffMs / 6e4)} \u5206\u949F\u524D`;
  }
  if (diffMs < 864e5) {
    return `${Math.floor(diffMs / 36e5)} \u5C0F\u65F6\u524D`;
  }
  return new Date(timestamp).toLocaleDateString();
}

// src/lark-bridge.ts
var import_child_process = require("child_process");
var import_obsidian9 = require("obsidian");
var import_util = require("util");

// src/block-map.ts
var LARK_BINDING_KEYS = /* @__PURE__ */ new Set([
  "lark_doc_url",
  "lark_doc_token",
  "lark_remote_root",
  "lark_remote_parent_path"
]);
function findRemoteBlockId(markdown, units, startOffset, endOffset, titleBlockId) {
  var _a;
  const block = findFirstHitRemoteBlock(markdown, startOffset, endOffset);
  if (!block) {
    return null;
  }
  if (block.kind === "title") {
    return titleBlockId || null;
  }
  return ((_a = units[block.index]) == null ? void 0 : _a.blockId) || null;
}
function findFirstHitRemoteBlock(markdown, startOffset, endOffset) {
  const start = Math.min(startOffset, endOffset);
  const end = Math.max(startOffset, endOffset);
  return splitRemoteMarkdownBlocks(markdown).find((block) => block.endOffset > start && block.startOffset < end) || null;
}
function splitRemoteMarkdownBlocks(markdown) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const lineStarts = createLineStarts(normalized);
  const hiddenLines = findHiddenFrontmatterLines(lines);
  const metadataBlock = findMetadataFrontmatterBlock(lines, hiddenLines);
  const titleLine = findDocumentTitleLine(lines, hiddenLines, metadataBlock);
  const blocks = [];
  if (titleLine !== null) {
    pushRemoteBlock(blocks, markdown, lineStarts, titleLine, titleLine + 1, "title", -1);
  }
  if (metadataBlock) {
    pushRemoteBlock(blocks, markdown, lineStarts, metadataBlock.startLine, metadataBlock.endLine, "blockquote", 0);
  }
  let index = titleLine !== null ? titleLine + 1 : 0;
  if (metadataBlock && index < metadataBlock.endLine) {
    index = metadataBlock.endLine;
  }
  while (index < lines.length && (hiddenLines.has(index) || (lines[index] || "").trim() === "")) {
    index += 1;
  }
  let remoteBlockIndex = metadataBlock ? 1 : 0;
  while (index < lines.length) {
    const line = lines[index] || "";
    if (line.trim() === "" || hiddenLines.has(index)) {
      index += 1;
      continue;
    }
    const startLine = index;
    const kind = readRemoteBlockKind(line);
    if (kind === "heading" || kind === "hr") {
      index += 1;
    } else if (kind === "code") {
      index += 1;
      while (index < lines.length && !/^\s{0,3}```/.test(lines[index] || "")) {
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
    } else if (kind === "list") {
      index += 1;
      while (index < lines.length && (lines[index] || "").trim() !== "" && readRemoteBlockKind(lines[index] || "") === "paragraph" && !isMarkdownParagraphLabelBoundary(lines[index] || "")) {
        index += 1;
      }
    } else if (kind === "blockquote" || kind === "table") {
      index += 1;
      while (index < lines.length && readRemoteBlockKind(lines[index] || "") === kind) {
        index += 1;
      }
    } else {
      index += 1;
      while (index < lines.length && (lines[index] || "").trim() !== "" && !isRemoteBlockBoundary(lines[index] || "") && !isMarkdownParagraphLabelBoundary(lines[index] || "")) {
        index += 1;
      }
    }
    pushRemoteBlock(blocks, markdown, lineStarts, startLine, index, kind, remoteBlockIndex);
    remoteBlockIndex += 1;
  }
  return blocks;
}
function pushRemoteBlock(blocks, markdown, lineStarts, startLine, endLine, kind, index) {
  var _a;
  const startOffset = lineStarts[startLine] || 0;
  const endOffset = (_a = lineStarts[endLine]) != null ? _a : markdown.length;
  blocks.push({
    index,
    kind,
    startOffset,
    endOffset,
    content: markdown.slice(startOffset, endOffset).trim()
  });
}
function findHiddenFrontmatterLines(lines) {
  const hiddenLines = /* @__PURE__ */ new Set();
  const frontmatter = readFrontmatterRange(lines);
  if (!frontmatter) {
    return hiddenLines;
  }
  const visibleLines = getVisibleFrontmatterLines(lines, frontmatter);
  if (visibleLines.length > 0) {
    return hiddenLines;
  }
  for (let index = frontmatter.startLine; index < frontmatter.endLine; index += 1) {
    hiddenLines.add(index);
  }
  return hiddenLines;
}
function findMetadataFrontmatterBlock(lines, hiddenLines) {
  if (hiddenLines.size > 0) {
    return null;
  }
  const frontmatter = readFrontmatterRange(lines);
  if (!frontmatter) {
    return null;
  }
  const visibleLines = getVisibleFrontmatterLines(lines, frontmatter);
  return visibleLines.length > 0 ? frontmatter : null;
}
function readFrontmatterRange(lines) {
  if ((lines[0] || "").trim() !== "---") {
    return null;
  }
  for (let index = 1; index < lines.length; index += 1) {
    if ((lines[index] || "").trim() === "---") {
      return { startLine: 0, endLine: index + 1 };
    }
  }
  return null;
}
function getVisibleFrontmatterLines(lines, range) {
  return lines.slice(range.startLine + 1, range.endLine - 1).filter((line) => {
    return !LARK_BINDING_KEYS.has(getYamlKey(line));
  });
}
function getYamlKey(line) {
  var _a;
  const match = line.match(/^([^:#\s][^:]*):/);
  return ((_a = match == null ? void 0 : match[1]) == null ? void 0 : _a.trim()) || "";
}
function findDocumentTitleLine(lines, hiddenLines, metadataBlock) {
  let index = 0;
  if (metadataBlock) {
    index = metadataBlock.endLine;
  }
  while (index < lines.length && (hiddenLines.has(index) || (lines[index] || "").trim() === "")) {
    index += 1;
  }
  return /^#\s+/.test(lines[index] || "") ? index : null;
}
function isRemoteBlockBoundary(line) {
  return readRemoteBlockKind(line) !== "paragraph";
}
function isMarkdownParagraphLabelBoundary(line) {
  return /^\*\*[^*\n]+?\*\*[：:]\s*$/.test(line.trim());
}
function readRemoteBlockKind(line) {
  if (/^#{2,6}\s+/.test(line)) return "heading";
  if (/^\s{0,3}```/.test(line)) return "code";
  if (/^\s*>/.test(line)) return "blockquote";
  if (/^\s*(?:[-+*]|\d+\.)\s+/.test(line)) return "list";
  if (/^\s*[|]/.test(line)) return "table";
  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return "hr";
  return "paragraph";
}
function createLineStarts(markdown) {
  const starts = [0];
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] === "\n") {
      starts.push(index + 1);
    }
  }
  starts.push(markdown.length);
  return starts;
}

// src/lark-bridge.ts
var LARK_SYNC_PLUGIN_ID = "feishu-lark-cli-sync";
var SYNC_STATE_FILE = "lark-sync-state.json";
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
async function syncMarkToLark(plugin, file, source, mark) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const binding = readLarkBinding(source);
  if (!binding.doc) {
    throw new Error("\u5F53\u524D\u7B14\u8BB0\u6CA1\u6709 lark_doc_url \u6216 lark_doc_token\u3002\u8BF7\u5148\u7528 Feishu Lark CLI Sync \u540C\u6B65\u8FD9\u7BC7\u6587\u6863\u3002");
  }
  const replies = getReplies(mark);
  if ((_a = mark.remote) == null ? void 0 : _a.larkCommentId) {
    return await syncRepliesToExistingLarkComment(plugin, binding, mark, replies);
  }
  const syncState = await readSyncState(plugin);
  const docState = findDocumentState(syncState, binding.doc);
  if (!docState || !docState.titleBlockId && !docState.units.length) {
    throw new Error("\u6CA1\u6709\u627E\u5230\u98DE\u4E66 block \u6620\u5C04\u3002\u8BF7\u5148\u7528 Feishu Lark CLI Sync \u540C\u6B65\u4E00\u6B21\u5F53\u524D\u6587\u6863\u3002");
  }
  const blockId = findRemoteBlockId(
    source,
    docState.units,
    mark.anchor.startOffset,
    mark.anchor.endOffset,
    docState.titleBlockId
  );
  if (!blockId) {
    throw new Error("\u6CA1\u6709\u627E\u5230\u8BE5\u6807\u6CE8\u547D\u4E2D\u7684\u7B2C\u4E00\u4E2A\u98DE\u4E66 block\u3002");
  }
  const [firstReply, ...restReplies] = replies.length ? replies : [{ content: "\uFF08\u65E0\u8BC4\u8BBA\uFF09" }];
  const result = await runLarkCreateComment(plugin, {
    doc: binding.doc,
    blockId,
    content: buildCommentElements(firstReply.content)
  });
  if (!result.ok) {
    throw new Error(((_b = result.error) == null ? void 0 : _b.message) || ((_c = result.error) == null ? void 0 : _c.hint) || "lark-cli \u6DFB\u52A0\u8BC4\u8BBA\u5931\u8D25\u3002");
  }
  const commentId = (_d = result.data) == null ? void 0 : _d.comment_id;
  const replyIds = [(_e = result.data) == null ? void 0 : _e.reply_id].filter(isNonEmptyString);
  if (commentId) {
    for (const reply of restReplies) {
      const replyResult = await runLarkCreateReply(plugin, {
        doc: binding.doc,
        commentId,
        content: buildReplyBody(reply.content)
      });
      if (!replyResult.ok) {
        throw new Error(((_f = replyResult.error) == null ? void 0 : _f.message) || ((_g = replyResult.error) == null ? void 0 : _g.hint) || "lark-cli \u6DFB\u52A0\u56DE\u590D\u5931\u8D25\u3002");
      }
      if ((_h = replyResult.data) == null ? void 0 : _h.reply_id) {
        replyIds.push(replyResult.data.reply_id);
      }
    }
  }
  return {
    status: "synced",
    larkDocToken: binding.token,
    larkDocUrl: binding.url,
    larkCommentId: commentId,
    larkReplyId: replyIds.at(-1),
    larkReplyIds: replyIds.length ? replyIds : void 0,
    blockId,
    syncedHash: buildSyncedHash(mark.anchor.selectedText, replies),
    syncedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function setLarkCommentResolved(plugin, mark, isSolved) {
  const { doc, commentId } = getRemoteCommentReference(mark);
  const result = await runLarkPatchComment(plugin, { doc, commentId, isSolved });
  assertLarkCommandOk(result, "lark-cli \u66F4\u65B0\u8BC4\u8BBA\u72B6\u6001\u5931\u8D25\u3002");
}
async function deleteLarkComment(plugin, mark) {
  const { doc, commentId } = getRemoteCommentReference(mark);
  const storedReplyIds = getDeleteAllLarkReplyIds(mark.remote);
  const replies = getReplies(mark);
  const idsToDelete = storedReplyIds.length >= replies.length ? storedReplyIds : await findLarkReplyIds(plugin, doc, commentId);
  if (idsToDelete.length === 0) {
    throw new Error("\u7F3A\u5C11\u98DE\u4E66\u56DE\u590D ID\uFF0C\u65E0\u6CD5\u5220\u9664\u8FDC\u7AEF\u8BC4\u8BBA\u3002");
  }
  for (const replyId of [...idsToDelete].reverse()) {
    const result = await runLarkDeleteReply(plugin, { doc, commentId, replyId });
    assertLarkCommandOk(result, "lark-cli \u5220\u9664\u8BC4\u8BBA\u56DE\u590D\u5931\u8D25\u3002");
  }
}
async function deleteLarkCommentReply(plugin, mark, replyId) {
  var _a, _b;
  const { doc, commentId } = getRemoteCommentReference(mark);
  const replies = getReplies(mark);
  const replyIndex = replies.findIndex((reply) => reply.id === replyId);
  if (replyIndex === -1) {
    throw new Error("\u627E\u4E0D\u5230\u8981\u5220\u9664\u7684\u672C\u5730\u8BC4\u8BBA\u56DE\u590D\u3002");
  }
  const syncedReplyCount = findSyncedReplyCount(mark, replies);
  if (replyIndex >= syncedReplyCount) {
    return null;
  }
  const storedReplyIds = getStoredLarkReplyIdList(mark.remote);
  const shouldUseLegacyLastReplyId = replyIndex === syncedReplyCount - 1 && Boolean((_a = mark.remote) == null ? void 0 : _a.larkReplyId);
  const remoteReplyIds = storedReplyIds.length >= syncedReplyCount || shouldUseLegacyLastReplyId ? storedReplyIds : await findLarkReplyIds(plugin, doc, commentId);
  const remoteReplyId = remoteReplyIds[replyIndex] || (replyIndex === syncedReplyCount - 1 ? (_b = mark.remote) == null ? void 0 : _b.larkReplyId : "");
  if (!remoteReplyId) {
    throw new Error("\u7F3A\u5C11\u98DE\u4E66\u56DE\u590D ID\uFF0C\u65E0\u6CD5\u5220\u9664\u8FDC\u7AEF\u8BC4\u8BBA\u56DE\u590D\u3002");
  }
  const result = await runLarkDeleteReply(plugin, { doc, commentId, replyId: remoteReplyId });
  assertLarkCommandOk(result, "lark-cli \u5220\u9664\u8BC4\u8BBA\u56DE\u590D\u5931\u8D25\u3002");
  const syncedRepliesAfterDelete = replies.slice(0, syncedReplyCount).filter((reply) => reply.id !== replyId);
  const remainingReplies = replies.filter((reply) => reply.id !== replyId);
  const hasPendingReplies = remainingReplies.length > syncedRepliesAfterDelete.length;
  return {
    ...mark.remote,
    status: hasPendingReplies ? "pending" : "synced",
    larkCommentId: commentId,
    larkReplyId: remoteReplyIds.filter((_, index) => index !== replyIndex).at(-1) || void 0,
    larkReplyIds: remoteReplyIds.filter((_, index) => index !== replyIndex),
    syncedHash: buildSyncedHash(mark.anchor.selectedText, syncedRepliesAfterDelete),
    syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
    error: void 0
  };
}
async function canSyncMarkToLark(plugin, source) {
  const binding = readLarkBinding(source);
  if (!binding.doc) {
    return false;
  }
  const syncState = await readSyncState(plugin);
  const docState = findDocumentState(syncState, binding.doc);
  return Boolean((docState == null ? void 0 : docState.titleBlockId) || (docState == null ? void 0 : docState.units.length));
}
function getRemoteCommentReference(mark) {
  var _a, _b, _c;
  const doc = ((_a = mark.remote) == null ? void 0 : _a.larkDocToken) || ((_b = mark.remote) == null ? void 0 : _b.larkDocUrl) || "";
  const commentId = ((_c = mark.remote) == null ? void 0 : _c.larkCommentId) || "";
  if (!doc || !commentId) {
    throw new Error("\u7F3A\u5C11\u98DE\u4E66\u8BC4\u8BBA\u540C\u6B65\u4FE1\u606F\uFF0C\u65E0\u6CD5\u64CD\u4F5C\u8FDC\u7AEF\u8BC4\u8BBA\u3002");
  }
  return { doc, commentId };
}
function getDeleteAllLarkReplyIds(remote) {
  const replyIds = getStoredLarkReplyIdList(remote);
  if (replyIds.length > 0) {
    return replyIds;
  }
  return (remote == null ? void 0 : remote.larkReplyId) ? [remote.larkReplyId] : [];
}
function getStoredLarkReplyIdList(remote) {
  return ((remote == null ? void 0 : remote.larkReplyIds) || []).filter(isNonEmptyString);
}
function getLarkReplyItems(result) {
  var _a;
  return ((_a = result.data) == null ? void 0 : _a.items) || result.items || [];
}
function isNonEmptyString(value) {
  return Boolean(value);
}
function getLarkSyncPluginStatus(plugin) {
  var _a, _b, _c, _d;
  const manager = getObsidianPluginManager(plugin);
  if (!manager) {
    return "unknown";
  }
  if (!((_a = manager.manifests) == null ? void 0 : _a[LARK_SYNC_PLUGIN_ID]) && !((_b = manager.getPlugin) == null ? void 0 : _b.call(manager, LARK_SYNC_PLUGIN_ID))) {
    return "not-installed";
  }
  if (((_c = manager.enabledPlugins) == null ? void 0 : _c.has(LARK_SYNC_PLUGIN_ID)) || ((_d = manager.getPlugin) == null ? void 0 : _d.call(manager, LARK_SYNC_PLUGIN_ID))) {
    return "enabled";
  }
  return "disabled";
}
function getLarkSyncPluginStatusText(status) {
  switch (status) {
    case "enabled":
      return "\u72B6\u6001\uFF1AFeishu Lark CLI Sync \u5DF2\u542F\u7528\u3002";
    case "disabled":
      return "\u72B6\u6001\uFF1AFeishu Lark CLI Sync \u5DF2\u5B89\u88C5\u4F46\u672A\u542F\u7528\u3002";
    case "not-installed":
      return "\u72B6\u6001\uFF1A\u672A\u5B89\u88C5 Feishu Lark CLI Sync\u3002";
    case "unknown":
      return "\u72B6\u6001\uFF1A\u65E0\u6CD5\u68C0\u6D4B Feishu Lark CLI Sync\u3002";
  }
}
function getLarkSyncPluginStatusClass(status) {
  switch (status) {
    case "enabled":
      return "is-installed";
    case "disabled":
      return "is-warning";
    case "not-installed":
      return "is-error";
    case "unknown":
      return "is-muted";
  }
}
function readLarkBinding(source) {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/);
  const body = (frontmatter == null ? void 0 : frontmatter[1]) || "";
  const url = readYamlScalar(body, "lark_doc_url");
  const token = readYamlScalar(body, "lark_doc_token");
  return {
    doc: token || url,
    token,
    url
  };
}
function readYamlScalar(frontmatter, key) {
  var _a;
  const match = frontmatter.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, "m"));
  return ((_a = match == null ? void 0 : match[1]) == null ? void 0 : _a.trim()) || "";
}
async function readSyncState(plugin) {
  const adapter = plugin.app.vault.adapter;
  if (!(adapter instanceof import_obsidian9.FileSystemAdapter)) {
    return null;
  }
  const statePath = `${plugin.app.vault.configDir}/plugins/${LARK_SYNC_PLUGIN_ID}/${SYNC_STATE_FILE}`;
  if (!await adapter.exists(statePath)) {
    return null;
  }
  const parsed = JSON.parse(await adapter.read(statePath));
  if (!parsed || typeof parsed !== "object" || !("documents" in parsed)) {
    return null;
  }
  return parsed;
}
function findDocumentState(state, doc) {
  if (!state) {
    return null;
  }
  const token = extractDocumentToken(doc);
  return state.documents[token] || state.documents[doc] || null;
}
function extractDocumentToken(doc) {
  var _a, _b;
  try {
    const url = new URL(doc);
    return ((_a = url.pathname.match(/\/(?:wiki|docx|doc)\/([^/?#]+)/)) == null ? void 0 : _a[1]) || doc;
  } catch (e) {
    return ((_b = doc.match(/\/(?:wiki|docx|doc)\/([^/?#]+)/)) == null ? void 0 : _b[1]) || doc;
  }
}
function buildCommentElements(text) {
  return JSON.stringify([{ type: "text", text }]);
}
function buildReplyBody(text) {
  return JSON.stringify({
    content: {
      elements: [{
        type: "text_run",
        text_run: { text }
      }]
    }
  });
}
async function syncRepliesToExistingLarkComment(plugin, binding, mark, replies) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const commentId = (_a = mark.remote) == null ? void 0 : _a.larkCommentId;
  if (!commentId) {
    throw new Error("\u7F3A\u5C11\u98DE\u4E66\u8BC4\u8BBA ID\uFF0C\u65E0\u6CD5\u8FFD\u52A0\u56DE\u590D\u3002");
  }
  const syncedReplyCount = findSyncedReplyCount(mark, replies);
  const pendingReplies = replies.slice(syncedReplyCount);
  let lastReplyId = (_b = mark.remote) == null ? void 0 : _b.larkReplyId;
  const knownReplyIds = getStoredLarkReplyIdList(mark.remote);
  const replyIds = knownReplyIds.length === syncedReplyCount ? [...knownReplyIds] : syncedReplyCount === 1 && lastReplyId ? [lastReplyId] : [];
  for (const reply of pendingReplies) {
    const result = await runLarkCreateReply(plugin, {
      doc: binding.doc,
      commentId,
      content: buildReplyBody(reply.content)
    });
    if (!result.ok) {
      throw new Error(((_c = result.error) == null ? void 0 : _c.message) || ((_d = result.error) == null ? void 0 : _d.hint) || "lark-cli \u6DFB\u52A0\u56DE\u590D\u5931\u8D25\u3002");
    }
    lastReplyId = ((_e = result.data) == null ? void 0 : _e.reply_id) || lastReplyId;
    if ((_f = result.data) == null ? void 0 : _f.reply_id) {
      replyIds.push(result.data.reply_id);
    }
  }
  return {
    ...mark.remote,
    status: "synced",
    larkDocToken: binding.token || ((_g = mark.remote) == null ? void 0 : _g.larkDocToken),
    larkDocUrl: binding.url || ((_h = mark.remote) == null ? void 0 : _h.larkDocUrl),
    larkCommentId: commentId,
    larkReplyId: lastReplyId,
    larkReplyIds: replyIds.length === replies.length ? replyIds : void 0,
    syncedHash: buildSyncedHash(mark.anchor.selectedText, replies),
    syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
    error: void 0
  };
}
function findSyncedReplyCount(mark, replies) {
  var _a;
  const syncedHash = (_a = mark.remote) == null ? void 0 : _a.syncedHash;
  if (syncedHash === void 0) {
    throw new Error("\u7F3A\u5C11\u4E0A\u6B21\u540C\u6B65\u8BB0\u5F55\uFF0C\u65E0\u6CD5\u5224\u65AD\u54EA\u4E9B\u56DE\u590D\u5DF2\u540C\u6B65\u3002\u8BF7\u5728\u98DE\u4E66\u4E2D\u786E\u8BA4\u540E\u91CD\u65B0\u521B\u5EFA\u8BC4\u8BBA\u3002");
  }
  const syncedThreadContent = readSyncedThreadContent(syncedHash, mark.anchor.selectedText);
  if (syncedThreadContent === null) {
    throw new Error("\u8BC4\u8BBA\u5B9A\u4F4D\u6587\u672C\u5DF2\u53D8\u5316\uFF0C\u65E0\u6CD5\u5B89\u5168\u8FFD\u52A0\u98DE\u4E66\u56DE\u590D\u3002\u8BF7\u91CD\u65B0\u521B\u5EFA\u8BC4\u8BBA\u3002");
  }
  for (let index = 0; index <= replies.length; index++) {
    if (getThreadContent(replies.slice(0, index)) === syncedThreadContent) {
      return index;
    }
  }
  throw new Error("\u5DF2\u540C\u6B65\u7684\u65E7\u8BC4\u8BBA\u5185\u5BB9\u53D1\u751F\u53D8\u5316\uFF0C\u6682\u4E0D\u652F\u6301\u540C\u6B65\u7F16\u8F91\u6216\u5220\u9664\u540E\u7684\u56DE\u590D\u3002");
}
function readSyncedThreadContent(syncedHash, selectedText) {
  const prefix = `${selectedText}
`;
  if (!syncedHash.startsWith(prefix)) {
    return null;
  }
  return syncedHash.slice(prefix.length);
}
function getReplies(mark) {
  var _a;
  return ((_a = mark.replies) == null ? void 0 : _a.length) ? mark.replies : mark.note.content.trim() ? [{
    authorName: "\u6211",
    content: mark.note.content,
    createdAt: mark.note.createdAt
  }] : [];
}
function getThreadContent(replies) {
  return replies.map((reply) => reply.content).join("\n\n");
}
function buildSyncedHash(selectedText, replies) {
  return `${selectedText}
${getThreadContent(replies)}`;
}
async function runLarkCreateComment(plugin, input) {
  try {
    const replyElements = JSON.parse(input.content);
    return normalizeLarkCommentResult(await runLarkCliViaSyncPlugin(plugin, [
      "drive",
      "file.comments",
      "create_v2",
      "--as",
      "user",
      "--file-token",
      extractDocumentToken(input.doc),
      "--data",
      JSON.stringify({
        file_type: "docx",
        reply_elements: replyElements,
        anchor: {
          block_id: input.blockId
        }
      }),
      "--json"
    ]));
  } catch (error) {
    const message = getExecErrorMessage(error);
    if (message) {
      throw new Error(message);
    }
    throw error;
  }
}
async function runLarkCreateReply(plugin, input) {
  try {
    return normalizeLarkCommentResult(await runLarkCliViaSyncPlugin(plugin, [
      "drive",
      "file.comment.replys",
      "create",
      "--as",
      "user",
      "--file-token",
      extractDocumentToken(input.doc),
      "--file-type",
      "docx",
      "--comment-id",
      input.commentId,
      "--data",
      input.content,
      "--json"
    ]));
  } catch (error) {
    const message = getExecErrorMessage(error);
    if (message) {
      throw new Error(message);
    }
    throw error;
  }
}
async function runLarkPatchComment(plugin, input) {
  try {
    return await runLarkCliViaSyncPlugin(plugin, [
      "drive",
      "file.comments",
      "patch",
      "--as",
      "user",
      "--file-token",
      extractDocumentToken(input.doc),
      "--file-type",
      "docx",
      "--comment-id",
      input.commentId,
      "--data",
      JSON.stringify({ is_solved: input.isSolved }),
      "--json"
    ]);
  } catch (error) {
    const message = getExecErrorMessage(error);
    if (message) {
      throw new Error(message);
    }
    throw error;
  }
}
async function findLarkReplyIds(plugin, doc, commentId) {
  try {
    const result = await runRawLarkCliViaSyncPlugin(plugin, [
      "drive",
      "file.comment.replys",
      "list",
      "--as",
      "user",
      "--file-token",
      extractDocumentToken(doc),
      "--file-type",
      "docx",
      "--comment-id",
      commentId,
      "--page-size",
      "100",
      "--json"
    ]);
    assertLarkCommandOk(result, "lark-cli \u83B7\u53D6\u8BC4\u8BBA\u56DE\u590D\u5931\u8D25\u3002");
    const items = getLarkReplyItems(result);
    return items.map((item) => item.reply_id || "").filter(Boolean);
  } catch (error) {
    const message = getExecErrorMessage(error);
    if (message) {
      throw new Error(message);
    }
    throw error;
  }
}
async function runRawLarkCliViaSyncPlugin(plugin, args) {
  var _a, _b;
  const status = getLarkSyncPluginStatus(plugin);
  if (status !== "enabled") {
    throw new Error(`${getLarkSyncPluginStatusText(status)} \u8BF7\u5148\u5B89\u88C5\u5E76\u542F\u7528\u8BE5\u63D2\u4EF6\u3002`);
  }
  const syncPlugin = getLarkSyncPluginBridge(plugin);
  const executable = await ((_a = syncPlugin == null ? void 0 : syncPlugin.resolveLarkCliPath) == null ? void 0 : _a.call(syncPlugin)) || "lark-cli";
  const env = await ((_b = syncPlugin == null ? void 0 : syncPlugin.buildCommandEnvironment) == null ? void 0 : _b.call(syncPlugin, executable)) || process.env;
  const { stdout } = await execFileAsync(executable, args, {
    env,
    maxBuffer: 20 * 1024 * 1024
  });
  return JSON.parse(stdout.toString());
}
async function runLarkDeleteReply(plugin, input) {
  try {
    return await runLarkCliViaSyncPlugin(plugin, [
      "drive",
      "file.comment.replys",
      "delete",
      "--as",
      "user",
      "--file-token",
      extractDocumentToken(input.doc),
      "--file-type",
      "docx",
      "--comment-id",
      input.commentId,
      "--reply-id",
      input.replyId,
      "--yes",
      "--json"
    ]);
  } catch (error) {
    const message = getExecErrorMessage(error);
    if (message) {
      throw new Error(message);
    }
    throw error;
  }
}
async function runLarkCliViaSyncPlugin(plugin, args) {
  const status = getLarkSyncPluginStatus(plugin);
  if (status !== "enabled") {
    throw new Error(`${getLarkSyncPluginStatusText(status)} \u8BF7\u5148\u5B89\u88C5\u5E76\u542F\u7528\u8BE5\u63D2\u4EF6\u3002`);
  }
  const syncPlugin = getLarkSyncPluginBridge(plugin);
  const runLarkCliCommand = (syncPlugin == null ? void 0 : syncPlugin.runLarkCliCommand) || (syncPlugin == null ? void 0 : syncPlugin.runLarkCli);
  if (!runLarkCliCommand) {
    throw new Error("Feishu Lark CLI Sync \u672A\u66B4\u9732 CLI \u6267\u884C\u80FD\u529B\uFF0C\u8BF7\u5347\u7EA7\u8BE5\u63D2\u4EF6\u3002");
  }
  return await runLarkCliCommand.call(syncPlugin, args);
}
function assertLarkCommandOk(result, fallbackMessage) {
  var _a, _b;
  if (result.ok === false) {
    throw new Error(((_a = result.error) == null ? void 0 : _a.message) || ((_b = result.error) == null ? void 0 : _b.hint) || fallbackMessage);
  }
}
function getExecErrorMessage(error) {
  if (!error || typeof error !== "object") {
    return "";
  }
  const execError = error;
  return (execError.stderr || execError.stdout || execError.message || "").trim();
}
function getLarkSyncPluginBridge(plugin) {
  var _a, _b;
  return (_b = (_a = getObsidianPluginManager(plugin)) == null ? void 0 : _a.getPlugin) == null ? void 0 : _b.call(_a, LARK_SYNC_PLUGIN_ID);
}
function getObsidianPluginManager(plugin) {
  return plugin.app.plugins || null;
}
function normalizeLarkCommentResult(result) {
  if (typeof result.ok === "boolean") {
    return result;
  }
  if (result.comment_id || result.reply_id) {
    return {
      ok: true,
      data: {
        comment_id: result.comment_id,
        reply_id: result.reply_id
      }
    };
  }
  return {
    ok: false,
    error: {
      message: "lark-cli \u672A\u8FD4\u56DE comment_id\u3002"
    }
  };
}

// src/reading-view-renderer.ts
function renderReadingMarks(container, source, marks, onClick) {
  clearReadingMarks(container);
  const activeMarks = marks.filter((mark) => mark.status !== "orphaned" && mark.status !== "resolved" && mark.anchor.selectedText).map((mark) => ({ mark }));
  const ranges = collectTextNodes(container);
  const fullText = ranges.map((range) => range.node.data).join("");
  const plannedMarks = activeMarks.map(({ mark }) => {
    const match = findBestRenderedMatch(fullText, mark);
    return match ? { mark, match } : null;
  }).filter((item) => item !== null).sort((left, right) => right.match.start - left.match.start || right.match.end - left.match.end);
  for (const item of plannedMarks) {
    wrapReadingMark(ranges, item.mark, item.match, onClick);
  }
}
function clearReadingMarks(container) {
  const wrappers = Array.from(container.querySelectorAll(".side-mark-reading"));
  for (const wrapper of wrappers) {
    wrapper.replaceWith(...Array.from(wrapper.childNodes));
  }
  container.normalize();
}
function wrapReadingMark(ranges, mark, match, onClick) {
  const start = match.start;
  const end = match.end;
  const startRange = ranges.find((range) => range.start <= start && range.end >= start);
  const endRange = ranges.find((range) => range.start <= end && range.end >= end);
  if (!startRange || !endRange) {
    return;
  }
  const activeDocument = getActiveDocument();
  const domRange = activeDocument.createRange();
  domRange.setStart(startRange.node, start - startRange.start);
  domRange.setEnd(endRange.node, end - endRange.start);
  const wrapper = activeDocument.createElement("span");
  wrapper.className = [
    "side-mark",
    "side-mark-reading",
    `side-mark--${mark.mark.kind}`,
    `side-mark--${mark.mark.color}`,
    `side-mark--text-${mark.mark.textColor}`,
    `side-mark--background-${mark.mark.backgroundColor}`
  ].join(" ");
  wrapper.dataset.sideMarkReadingId = mark.id;
  wrapper.title = mark.note.content || "FloatMark";
  wrapper.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(mark.id, wrapper.getBoundingClientRect());
  });
  try {
    wrapper.append(domRange.extractContents());
    domRange.insertNode(wrapper);
  } catch (e) {
    return;
  }
}
function collectTextNodes(container) {
  const nodes = [];
  const walker = getActiveDocument().createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node2) {
      var _a;
      const parent = node2.parentElement;
      if (!parent || parent.closest(".side-mark-reading")) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.closest("script, style")) {
        return NodeFilter.FILTER_REJECT;
      }
      return ((_a = node2.textContent) == null ? void 0 : _a.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  let offset = 0;
  let node = walker.nextNode();
  while (node) {
    const text = node;
    const length = text.data.length;
    nodes.push({ node: text, start: offset, end: offset + length });
    offset += length;
    node = walker.nextNode();
  }
  return nodes;
}
function findBestRenderedMatch(renderedText, mark) {
  for (const selectedText of toRenderedTextCandidates(mark.anchor.selectedText)) {
    const start = findBestRenderedTextStart(renderedText, selectedText, mark.anchor.position.lineStart);
    if (start >= 0) {
      return { start, end: start + selectedText.length };
    }
    const flexibleMatch = findWhitespaceInsensitiveMatch(renderedText, selectedText, mark.anchor.position.lineStart);
    if (flexibleMatch) {
      return flexibleMatch;
    }
  }
  return null;
}
function findBestRenderedTextStart(renderedText, selectedText, lineStart) {
  const candidates = [];
  let searchFrom = 0;
  while (searchFrom <= renderedText.length) {
    const index = renderedText.indexOf(selectedText, searchFrom);
    if (index < 0) {
      break;
    }
    candidates.push(index);
    searchFrom = index + Math.max(1, selectedText.length);
  }
  if (candidates.length === 0) {
    return -1;
  }
  if (candidates.length === 1) {
    return candidates[0] || 0;
  }
  const preferredLineOffset = estimateRenderedLineOffset(renderedText, lineStart);
  return candidates.sort(
    (left, right) => Math.abs(left - preferredLineOffset) - Math.abs(right - preferredLineOffset)
  )[0] || candidates[0] || 0;
}
function toRenderedTextCandidates(selectedText) {
  const normalized = normalizeWhitespace(selectedText).trim();
  const stripped = normalizeWhitespace(stripMarkdownSyntax(selectedText)).trim();
  const candidates = [
    selectedText,
    normalized,
    stripped
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}
function stripMarkdownSyntax(text) {
  return text.replace(/^[\t ]*(?:[-+*]|\d+[.)])[\t ]+/gm, "").replace(/^[\t ]{0,3}#{1,6}[\t ]+/gm, "").replace(/^[\t ]{0,3}>[\t ]?/gm, "").replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/(\*\*|__)(.*?)\1/g, "$2").replace(/(\*|_)(.*?)\1/g, "$2").replace(/~~(.*?)~~/g, "$1").replace(/<[^>]+>/g, "");
}
function normalizeWhitespace(text) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
}
function findWhitespaceInsensitiveMatch(renderedText, selectedText, lineStart) {
  const rendered = buildNonWhitespaceIndex(renderedText);
  const selected = selectedText.replace(/\s+/g, "");
  if (!selected) {
    return null;
  }
  const start = findBestRenderedTextStart(rendered.text, selected, lineStart);
  if (start < 0) {
    return null;
  }
  const originalStart = rendered.offsets[start];
  const originalEnd = rendered.offsets[start + selected.length - 1];
  if (originalStart === void 0 || originalEnd === void 0) {
    return null;
  }
  return {
    start: originalStart,
    end: originalEnd + 1
  };
}
function buildNonWhitespaceIndex(text) {
  let indexedText = "";
  const offsets = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] || "";
    if (/\s/.test(char)) {
      continue;
    }
    indexedText += char;
    offsets.push(index);
  }
  return { text: indexedText, offsets };
}
function estimateRenderedLineOffset(renderedText, lineNumber) {
  var _a;
  if (lineNumber <= 1) {
    return 0;
  }
  const lines = renderedText.split(/\n/);
  let offset = 0;
  for (let index = 0; index < Math.min(lineNumber - 1, lines.length); index += 1) {
    offset += (((_a = lines[index]) == null ? void 0 : _a.length) || 0) + 1;
  }
  return offset;
}

// src/reading-selection.ts
function findSourceRangeForReadingSelection(source, selectedText, preferredRenderedOffset = 0) {
  const sourceIndex = buildRenderedSourceIndex(source);
  const directIndex = findBestSourceTextStart(source, sourceIndex, selectedText, preferredRenderedOffset);
  if (directIndex >= 0) {
    return {
      from: directIndex,
      to: directIndex + selectedText.length
    };
  }
  const renderedSelection = normalizeReadingSelection(selectedText);
  const renderedIndex = findBestRenderedTextStart2(sourceIndex.text, renderedSelection, preferredRenderedOffset);
  if (renderedIndex < 0) {
    return null;
  }
  const from = expandStartToOpeningMarker(source, sourceIndex.offsets[renderedIndex]);
  const to = sourceIndex.offsets[renderedIndex + renderedSelection.length - 1];
  if (from === void 0 || to === void 0) {
    return null;
  }
  return {
    from,
    to: to + 1
  };
}
function getReadingSelectionRenderedOffset(container, range) {
  const prefixRange = getActiveDocument().createRange();
  prefixRange.selectNodeContents(container);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  const offset = normalizeReadingSelection(prefixRange.toString()).length;
  return offset;
}
function getReadingSelectionRect(range) {
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) {
    const rect = range.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }
  return getBoundingRect(rects);
}
function getBoundingRect(rects) {
  const first = rects[0];
  if (!first) {
    return null;
  }
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}
function buildRenderedSourceIndex(source) {
  let rendered = "";
  const offsets = [];
  let index = 0;
  const linePrefixPattern = /^(?:[\t ]{0,3}#{1,6}[\t ]+|[\t ]*(?:[-+*]|\d+[.)])[\t ]+|[\t ]{0,3}>[\t ]?)/;
  while (index < source.length) {
    const lineStart = index === 0 || source[index - 1] === "\n";
    if (lineStart) {
      const prefix = source.slice(index).match(linePrefixPattern);
      if (prefix == null ? void 0 : prefix[0]) {
        index += prefix[0].length;
        continue;
      }
    }
    const char = source[index] || "";
    if (isMarkdownMarkerAt(source, index)) {
      index += markerLengthAt(source, index);
      continue;
    }
    if (isIgnoredSpacing(char)) {
      index += 1;
      continue;
    }
    rendered += char;
    offsets.push(index);
    index += 1;
  }
  return { text: rendered, offsets };
}
function findBestSourceTextStart(source, sourceIndex, selectedText, preferredRenderedOffset) {
  const candidates = [];
  let searchFrom = 0;
  while (searchFrom <= source.length) {
    const index = source.indexOf(selectedText, searchFrom);
    if (index < 0) {
      break;
    }
    candidates.push(index);
    searchFrom = index + Math.max(1, selectedText.length);
  }
  return chooseSourceCandidate(candidates, sourceIndex, preferredRenderedOffset);
}
function chooseSourceCandidate(candidates, sourceIndex, preferredRenderedOffset) {
  if (candidates.length === 0) {
    return -1;
  }
  if (candidates.length === 1) {
    return candidates[0] || 0;
  }
  return candidates.sort(
    (left, right) => Math.abs(renderedOffsetForSourceOffset(sourceIndex.offsets, left) - preferredRenderedOffset) - Math.abs(renderedOffsetForSourceOffset(sourceIndex.offsets, right) - preferredRenderedOffset)
  )[0] || candidates[0] || 0;
}
function renderedOffsetForSourceOffset(offsets, sourceOffset) {
  const index = offsets.findIndex((offset) => offset >= sourceOffset);
  return index >= 0 ? index : offsets.length;
}
function findBestRenderedTextStart2(renderedText, selectedText, preferredOffset) {
  const candidates = [];
  let searchFrom = 0;
  while (searchFrom <= renderedText.length) {
    const index = renderedText.indexOf(selectedText, searchFrom);
    if (index < 0) {
      break;
    }
    candidates.push(index);
    searchFrom = index + Math.max(1, selectedText.length);
  }
  if (candidates.length === 0) {
    return -1;
  }
  if (candidates.length === 1) {
    return candidates[0] || 0;
  }
  return candidates.sort(
    (left, right) => Math.abs(left - preferredOffset) - Math.abs(right - preferredOffset)
  )[0] || candidates[0] || 0;
}
function expandStartToOpeningMarker(source, offset) {
  if (offset === void 0) {
    return void 0;
  }
  const previousPair = source.slice(offset - 2, offset);
  if (previousPair === "**" || previousPair === "__" || previousPair === "~~") {
    return offset - 2;
  }
  const previous = source[offset - 1];
  if (previous === "*" || previous === "_" || previous === "`") {
    return offset - 1;
  }
  return offset;
}
function normalizeReadingSelection(text) {
  return text.replace(/[\u200B-\u200D\uFEFF]/g, "").split(/\n+/).map((line) => line.replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "").replace(/^\s*\[(?: |x|X)\]\s+/, "")).join("").replace(/[\s\u200B-\u200D\uFEFF]+/g, "");
}
function isMarkdownMarkerAt(source, index) {
  return markerLengthAt(source, index) > 0;
}
function markerLengthAt(source, index) {
  const marker = source.slice(index, index + 2);
  if (marker === "**" || marker === "__" || marker === "~~") {
    return 2;
  }
  const char = source[index];
  if (char === "_" && isAsciiAlphaNumeric(source[index - 1]) && isAsciiAlphaNumeric(source[index + 1])) {
    return 0;
  }
  if (char === "*" || char === "_" || char === "`") {
    return 1;
  }
  return 0;
}
function isAsciiAlphaNumeric(char) {
  return Boolean(char && /[A-Za-z0-9]/.test(char));
}
function isIgnoredSpacing(char) {
  return /\s/.test(char) || /[\u200B-\u200D\uFEFF]/.test(char);
}

// src/main.ts
var READING_SELECTION_TOOLBAR_DELAY_MS = 300;
var READING_SELECTION_HIGHLIGHT_NAME = "side-mark-reading-selection";
var SideMarkPlugin = class extends import_obsidian10.Plugin {
  constructor() {
    super(...arguments);
    this.currentDocument = null;
    this.activeEditorView = null;
    this.pendingCommentSelection = null;
    this.readingSelection = null;
    this.readingSelectionTimer = null;
    this.readingSelectionRequestId = 0;
    this.lastMarkdownFilePath = "";
    this.previewObservers = /* @__PURE__ */ new Map();
    this.previewRenderTimers = /* @__PURE__ */ new Map();
  }
  async onload() {
    await this.loadSettings();
    (0, import_obsidian10.addIcon)(FLOAT_MARK_ICON_ID, FLOAT_MARK_ICON_SVG);
    this.store = new SideMarkStore(this.app, this.settings);
    this.toolbar = new SelectionToolbar((action) => void this.handleToolbarAction(action));
    this.readingToolbar = new ReadingSelectionToolbar((action) => void this.handleReadingToolbarAction(action));
    this.blockToolbar = new HoverBlockToolbar((action, target) => void this.handleBlockAction(action, target));
    this.commentPopover = new CommentPopover();
    this.markStylePopover = new MarkStylePopover();
    this.registerEditorExtension(createSideMarkEditorExtension(this));
    this.registerMarkdownPostProcessor((element, context) => {
      void this.renderReadingModeMarks(element, context.sourcePath, context);
    });
    this.registerView(SIDE_MARK_VIEW_TYPE, (leaf) => new SideMarkSidebarView(leaf, this));
    this.addRibbonIcon(FLOAT_MARK_ICON_ID, "\u6253\u5F00\u6B63\u6587\u6807\u6CE8", () => void this.openSidebar());
    this.addCommand({
      id: "open-side-mark-sidebar",
      name: "\u6253\u5F00\u6B63\u6587\u6807\u6CE8",
      callback: () => void this.openSidebar()
    });
    this.addCommand({
      id: "create-side-comment",
      name: "\u4ECE\u5F53\u524D\u9009\u533A\u521B\u5EFA\u8BC4\u8BBA",
      editorCallback: (_editor) => void this.createCommentFromActiveSelection("")
    });
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      void this.reloadCurrentDocument();
      this.syncPreviewMarkObservers();
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.syncPreviewMarkObservers()));
    this.registerDomEvent(getActiveDocument(), "selectionchange", () => this.handleReadingSelectionChange());
    this.registerEvent(this.app.vault.on("modify", (file) => {
      var _a;
      if (file instanceof import_obsidian10.TFile && file.extension === "md" && file.path === ((_a = this.getActiveMarkdownFile()) == null ? void 0 : _a.path)) {
        void this.reloadCurrentDocument();
      }
    }));
    this.addSettingTab(new SideMarkSettingTab(this));
    await this.reloadCurrentDocument();
  }
  onunload() {
    var _a, _b, _c, _d, _e;
    this.clearPreviewMarkObservers();
    this.clearReadingSelectionTimer();
    this.clearReadingSelectionHighlight();
    (_a = this.toolbar) == null ? void 0 : _a.destroy();
    (_b = this.readingToolbar) == null ? void 0 : _b.destroy();
    (_c = this.blockToolbar) == null ? void 0 : _c.destroy();
    (_d = this.commentPopover) == null ? void 0 : _d.destroy();
    (_e = this.markStylePopover) == null ? void 0 : _e.destroy();
  }
  async loadSettings() {
    const saved = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved || {}
    };
  }
  async saveSettings() {
    var _a;
    await this.saveData(this.settings);
    (_a = this.store) == null ? void 0 : _a.updateSettings(this.settings);
  }
  getActiveMarkdownFile() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian10.MarkdownView);
    const file = view == null ? void 0 : view.file;
    if (file instanceof import_obsidian10.TFile && file.extension === "md") {
      this.lastMarkdownFilePath = file.path;
      return file;
    }
    if (!this.lastMarkdownFilePath) {
      return null;
    }
    const lastFile = this.app.vault.getFileByPath(this.lastMarkdownFilePath);
    return lastFile instanceof import_obsidian10.TFile && lastFile.extension === "md" ? lastFile : null;
  }
  showSelectionToolbar(view, rect, boundary) {
    this.activeEditorView = view;
    this.blockToolbar.hide();
    const format = getSelectionFormat(view);
    this.toolbar.show(rect, boundary, format);
  }
  setActiveEditorView(view) {
    this.activeEditorView = view;
  }
  hideSelectionToolbar() {
    this.toolbar.hide();
  }
  getPendingCommentSelection(filePath) {
    if (!this.pendingCommentSelection || this.pendingCommentSelection.filePath !== filePath) {
      return null;
    }
    return {
      from: this.pendingCommentSelection.from,
      to: this.pendingCommentSelection.to
    };
  }
  showBlockToolbar(view, target) {
    if (this.toolbar.isVisible()) {
      this.blockToolbar.hide();
      return;
    }
    this.activeEditorView = view;
    this.blockToolbar.show(target);
  }
  scheduleHideBlockToolbar() {
    this.blockToolbar.scheduleHide();
  }
  hideBlockToolbar() {
    this.blockToolbar.hide();
  }
  async reloadCurrentDocument() {
    const file = this.getActiveMarkdownFile();
    if (!file) {
      this.currentDocument = null;
      await this.refreshSidebar();
      return;
    }
    const source = await this.app.vault.read(file);
    this.currentDocument = await this.store.relocateDocument(file.path, source);
    await this.refreshSidebar();
  }
  async focusMark(markId) {
    await this.openSidebar();
    const view = this.getSidebarView();
    view == null ? void 0 : view.focusMark(markId);
  }
  async updateMarkNote(markId, noteContent) {
    const file = this.getActiveMarkdownFile();
    if (!file) return;
    this.currentDocument = await this.store.updateMark(file.path, markId, { noteContent });
    await this.refreshMarkViews(file.path);
  }
  async addMarkReply(markId, content) {
    const file = this.getActiveMarkdownFile();
    if (!file) return;
    this.currentDocument = await this.store.addReply(file.path, markId, content);
    await this.refreshSidebar();
    this.syncMarkToLarkInBackground(markId);
  }
  async updateMarkReply(markId, replyId, content) {
    const file = this.getActiveMarkdownFile();
    if (!file) return;
    this.currentDocument = await this.store.updateReply(file.path, markId, replyId, content);
    await this.refreshSidebar();
  }
  async deleteMarkReply(markId, replyId) {
    var _a;
    const file = this.getActiveMarkdownFile();
    const mark = (_a = this.currentDocument) == null ? void 0 : _a.marks.find((item) => item.id === markId);
    if (!file || !mark) return;
    this.currentDocument = await this.store.deleteReply(file.path, markId, replyId);
    await this.refreshMarkViews(file.path);
    this.deleteRemoteCommentReplyInBackground(file.path, mark, replyId);
  }
  async toggleResolved(markId) {
    var _a;
    const file = this.getActiveMarkdownFile();
    const mark = (_a = this.currentDocument) == null ? void 0 : _a.marks.find((item) => item.id === markId);
    if (!file || !mark) return;
    const nextStatus = mark.status === "resolved" ? "active" : "resolved";
    this.currentDocument = await this.store.updateMark(file.path, markId, {
      status: nextStatus
    });
    await this.refreshMarkViews(file.path);
    this.syncRemoteCommentResolutionInBackground(mark, nextStatus === "resolved");
  }
  async updateMarkColor(markId, color) {
    var _a;
    const file = this.getActiveMarkdownFile();
    const mark = (_a = this.currentDocument) == null ? void 0 : _a.marks.find((item) => item.id === markId);
    if (!file || !mark) return;
    this.currentDocument = await this.store.updateMark(file.path, markId, {
      mark: {
        ...mark.mark,
        color
      }
    });
    await this.refreshMarkViews(file.path);
  }
  async updateMarkAppearance(markId, choice) {
    var _a;
    const file = this.getActiveMarkdownFile();
    const mark = (_a = this.currentDocument) == null ? void 0 : _a.marks.find((item) => item.id === markId);
    if (!file || !mark) return;
    if (isDefaultHighlightAppearance(choice)) {
      this.currentDocument = await this.store.deleteMark(file.path, markId);
      this.markStylePopover.hide();
      await this.refreshMarkViews(file.path);
      return;
    }
    this.currentDocument = await this.store.updateMark(file.path, markId, {
      mark: {
        ...mark.mark,
        textColor: choice.textColor,
        backgroundColor: choice.backgroundColor
      }
    });
    await this.refreshMarkViews(file.path);
  }
  async openMark(markId, rect) {
    var _a;
    const mark = (_a = this.currentDocument) == null ? void 0 : _a.marks.find((item) => item.id === markId);
    if (!mark) return;
    if (mark.mark.kind !== "highlight") {
      await this.focusMark(markId);
      return;
    }
    this.markStylePopover.show(rect, {
      textColor: mark.mark.textColor,
      backgroundColor: mark.mark.backgroundColor
    }, (choice) => {
      void this.updateMarkAppearance(mark.id, choice);
    }, () => {
      void this.deleteMark(mark.id);
    });
  }
  async deleteMark(markId) {
    var _a;
    const file = this.getActiveMarkdownFile();
    const mark = (_a = this.currentDocument) == null ? void 0 : _a.marks.find((item) => item.id === markId);
    if (!file || !mark) return;
    this.currentDocument = await this.store.deleteMark(file.path, markId);
    this.markStylePopover.hide();
    await this.refreshMarkViews(file.path);
    this.deleteRemoteCommentInBackground(mark);
  }
  async jumpToMark(markId) {
    var _a;
    const mark = (_a = this.currentDocument) == null ? void 0 : _a.marks.find((item) => item.id === markId);
    if (!mark) return;
    const view = await this.ensureMarkdownViewForFile(mark.filePath);
    if (!mark || !view) return;
    if (view.getMode() === "preview") {
      if (this.jumpToReadingMark(markId)) {
        return;
      }
      await this.setMarkdownViewMode(view, "source");
    }
    view.editor.setSelection(
      view.editor.offsetToPos(mark.anchor.startOffset),
      view.editor.offsetToPos(mark.anchor.endOffset)
    );
    view.editor.scrollIntoView({
      from: view.editor.offsetToPos(mark.anchor.startOffset),
      to: view.editor.offsetToPos(mark.anchor.endOffset)
    }, true);
  }
  async syncMarkToLark(markId) {
    var _a;
    const file = this.getActiveMarkdownFile();
    const mark = (_a = this.currentDocument) == null ? void 0 : _a.marks.find((item) => item.id === markId);
    if (!file || !mark) {
      return;
    }
    const source = await this.app.vault.read(file);
    try {
      const remote = await syncMarkToLark(this, file, source, mark);
      this.currentDocument = await this.store.updateMark(file.path, markId, { remote });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.currentDocument = await this.store.updateMark(file.path, markId, {
        remote: {
          ...mark.remote,
          status: "failed",
          error: message
        }
      });
      throw error;
    } finally {
      await this.refreshSidebar();
    }
  }
  syncRemoteCommentResolutionInBackground(mark, isSolved) {
    if (!shouldSyncRemoteComment(mark)) {
      return;
    }
    void (async () => {
      await setLarkCommentResolved(this, mark, isSolved);
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian10.Notice(`\u540C\u6B65\u98DE\u4E66\u8BC4\u8BBA\u72B6\u6001\u5931\u8D25\uFF1A${message}`, 8e3);
    });
  }
  deleteRemoteCommentInBackground(mark) {
    if (!shouldSyncRemoteComment(mark)) {
      return;
    }
    void (async () => {
      await deleteLarkComment(this, mark);
    })().catch((error) => {
      if (isMissingRemoteCommentError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian10.Notice(`\u5220\u9664\u98DE\u4E66\u8BC4\u8BBA\u5931\u8D25\uFF1A${message}`, 8e3);
    });
  }
  deleteRemoteCommentReplyInBackground(filePath, mark, replyId) {
    if (!shouldSyncRemoteComment(mark)) {
      return;
    }
    void (async () => {
      var _a;
      const remote = await deleteLarkCommentReply(this, mark, replyId);
      if (!remote) {
        return;
      }
      const document = await this.store.updateMark(filePath, mark.id, { remote });
      if (((_a = this.currentDocument) == null ? void 0 : _a.filePath) === filePath) {
        this.currentDocument = document;
        await this.refreshSidebar();
      }
    })().catch((error) => {
      if (isMissingRemoteCommentError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian10.Notice(`\u5220\u9664\u98DE\u4E66\u8BC4\u8BBA\u56DE\u590D\u5931\u8D25\uFF1A${message}`, 8e3);
    });
  }
  async handleToolbarAction(action) {
    const view = this.activeEditorView;
    if (!view) return;
    if (action === "highlight") {
      this.showMarkStylePopoverForView(view);
      return;
    }
    if (action === "comment") {
      this.showCommentPopover(view);
      return;
    }
    if (isSelectionBlockAction(action)) {
      this.applySelectionBlockStyle(view, action);
      return;
    }
    this.applyMarkdownStyle(action);
  }
  handleReadingSelectionChange() {
    this.clearReadingSelectionTimer();
    const requestId = ++this.readingSelectionRequestId;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      this.readingSelection = null;
      this.readingToolbar.hide();
      return;
    }
    this.readingToolbar.hide();
    this.readingSelectionTimer = window.setTimeout(() => {
      this.readingSelectionTimer = null;
      void this.updateReadingSelectionToolbar(requestId);
    }, READING_SELECTION_TOOLBAR_DELAY_MS);
  }
  async updateReadingSelectionToolbar(requestId) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      this.readingSelection = null;
      this.readingToolbar.hide();
      return;
    }
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (!range) {
      this.readingSelection = null;
      this.readingToolbar.hide();
      return;
    }
    const view = this.findMarkdownPreviewViewForRange(range);
    const file = view == null ? void 0 : view.file;
    if (!view || !(file instanceof import_obsidian10.TFile) || view.getMode() !== "preview") {
      this.readingSelection = null;
      this.readingToolbar.hide();
      return;
    }
    const selectedText = selection.toString().trim();
    const source = await this.app.vault.read(file);
    if (requestId !== this.readingSelectionRequestId) {
      return;
    }
    const renderedOffset = getReadingSelectionRenderedOffset(view.contentEl, range);
    const sourceRange = findSourceRangeForReadingSelection(source, selectedText, renderedOffset);
    if (!sourceRange) {
      this.readingSelection = null;
      this.readingToolbar.hide();
      return;
    }
    const rect = getReadingSelectionRect(range);
    if (!rect) {
      this.readingSelection = null;
      this.readingToolbar.hide();
      return;
    }
    this.readingSelection = {
      file,
      source,
      from: sourceRange.from,
      to: sourceRange.to,
      rect,
      range: range.cloneRange()
    };
    this.readingToolbar.show(rect, view.contentEl.getBoundingClientRect());
  }
  clearReadingSelectionTimer() {
    if (this.readingSelectionTimer !== null) {
      window.clearTimeout(this.readingSelectionTimer);
      this.readingSelectionTimer = null;
    }
  }
  findMarkdownPreviewView(node) {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof import_obsidian10.MarkdownView && view.getMode() === "preview" && view.contentEl.contains(node)) {
        return view;
      }
    }
    return null;
  }
  findMarkdownPreviewViewForRange(range) {
    return this.findMarkdownPreviewView(range.commonAncestorContainer) || this.findMarkdownPreviewView(range.startContainer) || this.findMarkdownPreviewView(range.endContainer) || this.findMarkdownPreviewViewByContainedRange(range);
  }
  findMarkdownPreviewViewByContainedRange(range) {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian10.MarkdownView) || view.getMode() !== "preview") {
        continue;
      }
      const contentRange = getActiveDocument().createRange();
      contentRange.selectNodeContents(view.contentEl);
      const startsInView = range.compareBoundaryPoints(Range.START_TO_START, contentRange) >= 0 && range.compareBoundaryPoints(Range.START_TO_END, contentRange) <= 0;
      const endsInView = range.compareBoundaryPoints(Range.END_TO_START, contentRange) >= 0 && range.compareBoundaryPoints(Range.END_TO_END, contentRange) <= 0;
      if (startsInView || endsInView) {
        return view;
      }
    }
    return null;
  }
  async handleReadingToolbarAction(action) {
    const selection = this.readingSelection;
    if (!selection) {
      return;
    }
    if (action === "highlight") {
      this.showMarkStylePopoverForReadingSelection(selection);
      return;
    }
    const hasPersistentHighlight = this.showReadingSelectionHighlight(selection);
    this.commentPopover.show(selection.rect, (content) => {
      if (!content.trim()) {
        return;
      }
      this.clearReadingSelectionHighlight();
      void this.createReadingMark(selection, "comment", content);
    }, () => {
      this.clearReadingSelectionHighlight();
      this.clearReadingSelection();
    }, { focus: hasPersistentHighlight });
  }
  async handleBlockAction(action, target) {
    const view = this.activeEditorView;
    if (!view) return;
    if (action === "comment") {
      await this.createMarkFromOffsets(view, target.from, target.to, "comment", "");
      return;
    }
    if (action === "copy") {
      await navigator.clipboard.writeText(view.state.doc.sliceString(target.from, target.to));
      new import_obsidian10.Notice("\u5DF2\u590D\u5236\u5F53\u524D\u5757\u3002");
      return;
    }
    this.applyBlockStyle(view, target, action);
  }
  applyBlockStyle(view, target, action) {
    const doc = view.state.doc;
    const line = doc.lineAt(target.from);
    const text = line.text;
    const stripped = stripBlockPrefix(text);
    let replacement = text;
    switch (action) {
      case "paragraph":
        replacement = stripped;
        break;
      case "heading-1":
      case "heading-2":
      case "heading-3":
      case "heading-4":
      case "heading-5":
      case "heading-6":
        replacement = `${"#".repeat(Number(action.slice(-1)))} ${stripped}`;
        break;
      case "bullet-list":
        replacement = `- ${stripped}`;
        break;
      case "number-list":
        replacement = `1. ${stripped}`;
        break;
      case "task-list":
        replacement = `- [ ] ${stripped}`;
        break;
      case "quote":
        replacement = `> ${stripped}`;
        break;
      case "code-block":
        replacement = `\`\`\`
${stripped}
\`\`\``;
        break;
      case "delete": {
        const deleteTo = line.to < doc.length ? line.to + 1 : line.to;
        view.dispatch({ changes: { from: line.from, to: deleteTo, insert: "" } });
        return;
      }
    }
    view.dispatch({
      changes: {
        from: line.from,
        to: line.to,
        insert: replacement
      }
    });
  }
  applyMarkdownStyle(action) {
    const editor = this.getActiveEditor();
    if (!editor) return;
    const selected = editor.getSelection();
    if (!selected) return;
    const wrappers = {
      bold: ["**", "**"],
      italic: ["*", "*"],
      strike: ["~~", "~~"],
      underline: ["<u>", "</u>"],
      link: ["[", "](https://)"],
      code: ["`", "`"]
    };
    const wrapper = wrappers[action];
    if (!wrapper) return;
    editor.replaceSelection(`${wrapper[0]}${selected}${wrapper[1]}`);
  }
  applySelectionBlockStyle(view, action) {
    const selection = view.state.selection.main;
    const doc = view.state.doc;
    const fromLine = doc.lineAt(selection.from);
    const toLine = doc.lineAt(selection.to);
    const changes = [];
    for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber++) {
      const line = doc.line(lineNumber);
      const stripped = stripBlockPrefix(line.text);
      let replacement = stripped;
      switch (action) {
        case "paragraph":
          replacement = stripped;
          break;
        case "heading-1":
        case "heading-2":
        case "heading-3":
        case "heading-4":
        case "heading-5":
        case "heading-6":
          replacement = `${"#".repeat(Number(action.slice(-1)))} ${stripped}`;
          break;
        case "bullet-list":
          replacement = `- ${stripped}`;
          break;
        case "number-list":
          replacement = `1. ${stripped}`;
          break;
        case "task-list":
          replacement = `- [ ] ${stripped}`;
          break;
        case "quote":
          replacement = `> ${stripped}`;
          break;
        case "code-block":
          if (fromLine.number === toLine.number) {
            replacement = `\`\`\`
${stripped}
\`\`\``;
          } else {
            continue;
          }
          break;
        default:
          continue;
      }
      changes.push({ from: line.from, to: line.to, insert: replacement });
    }
    if (changes.length > 0) {
      view.dispatch({ changes });
    }
  }
  showCommentPopover(view) {
    const selection = view.state.selection.main;
    const rect = getEditorSelectionRect(view) || view.coordsAtPos(selection.to);
    const file = this.getActiveMarkdownFile();
    if (!rect || selection.empty || !file) return;
    const popoverRect = new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    const from = selection.from;
    const to = selection.to;
    this.pendingCommentSelection = {
      filePath: file.path,
      from,
      to
    };
    this.refreshEditorDecorations();
    this.commentPopover.show(popoverRect, (content) => {
      void this.createMarkFromOffsets(view, from, to, "comment", content);
    }, () => {
      this.clearPendingCommentSelection();
    });
  }
  showMarkStylePopoverForView(view) {
    const selection = view.state.selection.main;
    const rect = view.coordsAtPos(selection.to);
    if (!rect || selection.empty) return;
    const popoverRect = new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    let markId = "";
    let createPromise = null;
    this.markStylePopover.show(popoverRect, defaultHighlightAppearance(), (choice) => {
      void (async () => {
        if (!markId) {
          if (!createPromise) {
            createPromise = this.createMarkFromOffsets(
              view,
              selection.from,
              selection.to,
              "highlight",
              "",
              choice,
              false
            );
          }
          const createdMark = await createPromise;
          markId = (createdMark == null ? void 0 : createdMark.id) || "";
          if (markId) {
            await this.updateMarkAppearance(markId, choice);
          }
          return;
        }
        await this.updateMarkAppearance(markId, choice);
      })();
    }, () => {
      if (markId) {
        void this.deleteMark(markId);
      }
    });
  }
  showMarkStylePopoverForReadingSelection(selection) {
    let markId = "";
    let createPromise = null;
    this.markStylePopover.show(selection.rect, defaultHighlightAppearance(), (choice) => {
      void (async () => {
        if (!markId) {
          if (!createPromise) {
            createPromise = this.createReadingMark(
              selection,
              "highlight",
              "",
              choice,
              false
            );
          }
          const createdMark = await createPromise;
          markId = (createdMark == null ? void 0 : createdMark.id) || "";
          if (markId) {
            await this.updateMarkAppearance(markId, choice);
          }
          return;
        }
        await this.updateMarkAppearance(markId, choice);
      })();
    }, () => {
      if (markId) {
        void this.deleteMark(markId);
      }
    });
  }
  async createCommentFromActiveSelection(noteContent) {
    const view = this.activeEditorView;
    if (!view) {
      new import_obsidian10.Notice("\u6CA1\u6709\u53EF\u7528\u7684\u7F16\u8F91\u5668\u9009\u533A\u3002");
      return;
    }
    await this.createMarkFromView(view, "comment", noteContent);
  }
  async createMarkFromView(view, kind, noteContent) {
    const file = this.getActiveMarkdownFile();
    const selection = view.state.selection.main;
    if (!file || selection.empty) {
      return null;
    }
    return this.createMarkFromOffsets(view, selection.from, selection.to, kind, noteContent);
  }
  async createReadingMark(selection, kind, noteContent, appearance = defaultHighlightAppearance(), autoOpenSidebar = true) {
    var _a, _b;
    const previousMarkIds = new Set((((_a = this.currentDocument) == null ? void 0 : _a.marks) || []).map((mark) => mark.id));
    this.currentDocument = await this.store.createMark({
      filePath: selection.file.path,
      source: selection.source,
      startOffset: selection.from,
      endOffset: selection.to,
      kind,
      color: "yellow",
      textColor: appearance.textColor,
      backgroundColor: appearance.backgroundColor,
      noteContent
    });
    const createdMark = this.currentDocument.marks.find((mark) => !previousMarkIds.has(mark.id));
    await this.refreshSidebar();
    await this.renderPreviewMarksForFile(selection.file.path);
    this.readingSelection = null;
    (_b = window.getSelection()) == null ? void 0 : _b.removeAllRanges();
    if (autoOpenSidebar && this.settings.autoOpenSidebar) {
      await this.openSidebar();
    }
    if (kind === "comment" && createdMark && noteContent.trim()) {
      this.syncMarkToLarkInBackground(createdMark.id);
    }
    return createdMark || null;
  }
  async createMarkFromOffsets(view, from, to, kind, noteContent, appearance = defaultHighlightAppearance(), autoOpenSidebar = true) {
    var _a;
    const file = this.getActiveMarkdownFile();
    if (!file || from === to) {
      return null;
    }
    const previousMarkIds = new Set((((_a = this.currentDocument) == null ? void 0 : _a.marks) || []).map((mark) => mark.id));
    this.currentDocument = await this.store.createMark({
      filePath: file.path,
      source: view.state.doc.toString(),
      startOffset: from,
      endOffset: to,
      kind,
      color: "yellow",
      textColor: appearance.textColor,
      backgroundColor: appearance.backgroundColor,
      noteContent
    });
    const createdMark = this.currentDocument.marks.find((mark) => !previousMarkIds.has(mark.id));
    await this.refreshSidebar();
    this.refreshEditorDecorations();
    await this.renderPreviewMarksForFile(file.path);
    if (autoOpenSidebar && this.settings.autoOpenSidebar) {
      await this.openSidebar();
    }
    if (kind === "comment" && createdMark && noteContent.trim()) {
      this.syncMarkToLarkInBackground(createdMark.id);
    }
    return createdMark || null;
  }
  refreshEditorDecorations() {
    var _a;
    (_a = this.activeEditorView) == null ? void 0 : _a.dispatch({ effects: [] });
  }
  clearPendingCommentSelection() {
    if (!this.pendingCommentSelection) {
      return;
    }
    this.pendingCommentSelection = null;
    this.refreshEditorDecorations();
  }
  clearReadingSelection() {
    var _a;
    this.readingSelection = null;
    (_a = window.getSelection()) == null ? void 0 : _a.removeAllRanges();
  }
  showReadingSelectionHighlight(selection) {
    const highlights = getCssHighlights();
    const Highlight = getHighlightConstructor();
    if (!highlights || !Highlight) {
      return false;
    }
    this.clearReadingSelectionHighlight();
    highlights.set(READING_SELECTION_HIGHLIGHT_NAME, new Highlight(selection.range.cloneRange()));
    return true;
  }
  clearReadingSelectionHighlight() {
    var _a;
    (_a = getCssHighlights()) == null ? void 0 : _a.delete(READING_SELECTION_HIGHLIGHT_NAME);
  }
  async refreshMarkViews(filePath) {
    this.refreshEditorDecorations();
    await this.refreshSidebar();
    await this.renderPreviewMarksForFile(filePath);
  }
  syncMarkToLarkInBackground(markId) {
    if (!this.settings.autoSyncToLark || getLarkSyncPluginStatus(this) !== "enabled") {
      return;
    }
    void this.syncMarkToLarkIfReady(markId).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian10.Notice(`\u81EA\u52A8\u540C\u6B65\u98DE\u4E66\u5931\u8D25\uFF1A${message}`, 8e3);
    });
  }
  async syncMarkToLarkIfReady(markId) {
    const file = this.getActiveMarkdownFile();
    if (!file) {
      return;
    }
    const source = await this.app.vault.read(file);
    if (!await canSyncMarkToLark(this, source)) {
      return;
    }
    await this.syncMarkToLark(markId);
  }
  getActiveEditor() {
    var _a;
    return ((_a = this.app.workspace.getActiveViewOfType(import_obsidian10.MarkdownView)) == null ? void 0 : _a.editor) || null;
  }
  async renderReadingModeMarks(container, sourcePath, context) {
    const file = this.app.vault.getFileByPath(sourcePath);
    if (!file || file.extension !== "md") {
      return;
    }
    const source = await this.app.vault.read(file);
    const document = await this.store.relocateDocument(file.path, source);
    const section = context == null ? void 0 : context.getSectionInfo(container);
    const marks = section ? getMarksInRenderedSection(document.marks, section.lineStart, section.lineEnd) : document.marks;
    renderReadingMarks(container, source, marks, (markId, rect) => void this.openMark(markId, rect));
  }
  syncPreviewMarkObservers() {
    var _a;
    const activeViews = /* @__PURE__ */ new Set();
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof import_obsidian10.MarkdownView && view.getMode() === "preview" && ((_a = view.file) == null ? void 0 : _a.extension) === "md") {
        activeViews.add(view);
        if (!this.previewObservers.has(view)) {
          this.attachPreviewObserver(view);
        }
        this.schedulePreviewViewRender(view);
      }
    }
    for (const [view, observer] of this.previewObservers) {
      if (!activeViews.has(view)) {
        observer.disconnect();
        this.previewObservers.delete(view);
        const timer = this.previewRenderTimers.get(view);
        if (timer !== void 0) {
          window.clearTimeout(timer);
          this.previewRenderTimers.delete(view);
        }
      }
    }
  }
  attachPreviewObserver(view) {
    const observer = new MutationObserver(() => this.schedulePreviewViewRender(view));
    observer.observe(getPreviewSectionsContainer(view), { childList: true });
    this.previewObservers.set(view, observer);
  }
  schedulePreviewViewRender(view) {
    const existing = this.previewRenderTimers.get(view);
    if (existing !== void 0) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(() => {
      this.previewRenderTimers.delete(view);
      void this.renderPreviewMarksForView(view);
    }, 60);
    this.previewRenderTimers.set(view, timer);
  }
  clearPreviewMarkObservers() {
    for (const observer of this.previewObservers.values()) {
      observer.disconnect();
    }
    this.previewObservers.clear();
    for (const timer of this.previewRenderTimers.values()) {
      window.clearTimeout(timer);
    }
    this.previewRenderTimers.clear();
  }
  async renderPreviewMarksForFile(filePath) {
    var _a;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian10.MarkdownView) || ((_a = view.file) == null ? void 0 : _a.path) !== filePath || view.getMode() !== "preview") {
        continue;
      }
      await this.renderPreviewMarksForView(view);
    }
  }
  async renderPreviewMarksForView(view) {
    const file = view.file;
    if (!file || file.extension !== "md" || view.getMode() !== "preview") {
      return;
    }
    const source = await this.app.vault.read(file);
    const document = await this.store.relocateDocument(file.path, source);
    const onClick = (markId, rect) => void this.openMark(markId, rect);
    const sections = getPreviewSections(view);
    if (sections.length > 0) {
      for (const section of sections) {
        const marks = getMarksInRenderedSection(document.marks, section.lineStart, section.lineEnd);
        renderReadingMarks(section.el, source, marks, onClick);
      }
      return;
    }
    const sectionEls = Array.from(view.contentEl.querySelectorAll(".markdown-preview-section"));
    if (sectionEls.length > 0) {
      for (const el of sectionEls) {
        renderReadingMarks(el, source, document.marks, onClick);
      }
      return;
    }
    renderReadingMarks(view.contentEl, source, document.marks, onClick);
  }
  jumpToReadingMark(markId) {
    var _a;
    const mark = (_a = this.currentDocument) == null ? void 0 : _a.marks.find((item) => item.id === markId);
    if (!mark) {
      return false;
    }
    const markEl = this.findReadingMarkElement(markId, mark.filePath);
    if (!markEl) {
      return false;
    }
    markEl.scrollIntoView({ block: "center", behavior: "smooth" });
    markEl.addClass("side-mark-reading-flash");
    window.setTimeout(() => markEl.removeClass("side-mark-reading-flash"), 1200);
    return true;
  }
  findReadingMarkElement(markId, filePath) {
    var _a;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian10.MarkdownView) || ((_a = view.file) == null ? void 0 : _a.path) !== filePath || view.getMode() !== "preview") {
        continue;
      }
      const element = view.contentEl.querySelector(`[data-side-mark-reading-id="${markId}"]`);
      if (element) {
        void this.app.workspace.revealLeaf(leaf);
        return element;
      }
    }
    return null;
  }
  async ensureMarkdownViewForFile(filePath) {
    var _a;
    for (const leaf2 of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf2.view;
      if (view instanceof import_obsidian10.MarkdownView && ((_a = view.file) == null ? void 0 : _a.path) === filePath) {
        void this.app.workspace.revealLeaf(leaf2);
        return view;
      }
    }
    const file = this.app.vault.getFileByPath(filePath);
    if (!file) {
      return null;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    return leaf.view instanceof import_obsidian10.MarkdownView ? leaf.view : null;
  }
  async setMarkdownViewMode(view, mode) {
    const state = view.leaf.getViewState();
    await view.leaf.setViewState({
      ...state,
      state: {
        ...state.state || {},
        mode
      }
    });
  }
  async openSidebar() {
    let leaf = this.app.workspace.getLeavesOfType(SIDE_MARK_VIEW_TYPE)[0] || null;
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await (leaf == null ? void 0 : leaf.setViewState({ type: SIDE_MARK_VIEW_TYPE, active: true }));
    }
    if (leaf) {
      await this.app.workspace.revealLeaf(leaf);
      await this.refreshSidebar();
    }
  }
  getSidebarView() {
    var _a;
    return (_a = this.app.workspace.getLeavesOfType(SIDE_MARK_VIEW_TYPE)[0]) == null ? void 0 : _a.view;
  }
  async refreshSidebar() {
    var _a;
    await ((_a = this.getSidebarView()) == null ? void 0 : _a.render());
  }
};
function stripBlockPrefix(text) {
  return text.replace(/^#{1,6}\s+/, "").replace(/^\s*>\s?/, "").replace(/^\s*\[(?: |x|X)\]\s+/, "").replace(/^\s*[-+*]\s+\[(?: |x|X)\]\s+/, "").replace(/^\s*(?:[-+*]|\d+\.)\s+/, "").trim();
}
function isSelectionBlockAction(action) {
  return [
    "paragraph",
    "heading-1",
    "heading-2",
    "heading-3",
    "heading-4",
    "heading-5",
    "heading-6",
    "bullet-list",
    "number-list",
    "task-list",
    "quote",
    "code-block"
  ].includes(action);
}
function shouldSyncRemoteComment(mark) {
  var _a;
  return mark.mark.kind === "comment" && Boolean((_a = mark.remote) == null ? void 0 : _a.larkCommentId);
}
function isMissingRemoteCommentError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes("docs had been deleted") || normalized.includes("had been deleted") || normalized.includes("not found") || normalized.includes("not exist") || normalized.includes("does not exist") || normalized.includes("1069304") || message.includes("\u4E0D\u5B58\u5728") || message.includes("\u5DF2\u5220\u9664");
}
function getSelectionFormat(view) {
  var _a;
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.from);
  const heading = line.text.match(/^(#{1,6})\s+/);
  if (heading) {
    const level = ((_a = heading[1]) == null ? void 0 : _a.length) || 1;
    return `heading-${level}`;
  }
  if (/^\s*[-+*]\s+\[(?: |x|X)\]\s+/.test(line.text)) {
    return "task-list";
  }
  if (/^\s*\d+\.\s+/.test(line.text)) {
    return "number-list";
  }
  if (/^\s*[-+*]\s+/.test(line.text)) {
    return "bullet-list";
  }
  if (/^\s*>/.test(line.text)) {
    return "quote";
  }
  if (/^\s*```/.test(line.text)) {
    return "code-block";
  }
  return "paragraph";
}
function getEditorSelectionRect(view) {
  const selection = getActiveSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const common = range.commonAncestorContainer;
  const element = isHtmlElement(common) ? common : common.parentElement;
  if (!element || !view.dom.contains(element)) {
    return null;
  }
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) {
    const rect = range.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }
  return getBoundingRect2(rects);
}
function getBoundingRect2(rects) {
  const first = rects[0];
  if (!first) {
    return null;
  }
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}
function defaultHighlightAppearance() {
  return {
    textColor: "default",
    backgroundColor: "none"
  };
}
function isDefaultHighlightAppearance(choice) {
  return choice.textColor === "default" && choice.backgroundColor === "none";
}
function getPreviewSectionsContainer(view) {
  var _a;
  return view.contentEl.querySelector(".markdown-preview-sections") || ((_a = view.contentEl.querySelector(".markdown-preview-section")) == null ? void 0 : _a.parentElement) || view.contentEl;
}
function getPreviewSections(view) {
  var _a;
  const preview = view.previewMode;
  const sections = (_a = preview == null ? void 0 : preview.renderer) == null ? void 0 : _a.sections;
  if (!Array.isArray(sections)) {
    return [];
  }
  const result = [];
  for (const section of sections) {
    if ((section == null ? void 0 : section.el) instanceof HTMLElement && typeof section.lineStart === "number" && typeof section.lineEnd === "number") {
      result.push({ el: section.el, lineStart: section.lineStart, lineEnd: section.lineEnd });
    }
  }
  return result;
}
function getMarksInRenderedSection(marks, sectionLineStart, sectionLineEnd) {
  return marks.filter((mark) => {
    const markLineStart = mark.anchor.position.lineStart - 1;
    const markLineEnd = mark.anchor.position.lineEnd - 1;
    return markLineEnd >= sectionLineStart && markLineStart <= sectionLineEnd;
  });
}
function getCssHighlights() {
  if (typeof CSS === "undefined") {
    return null;
  }
  const css = CSS;
  return css.highlights || null;
}
function getHighlightConstructor() {
  const globalWindow = window;
  return typeof globalWindow.Highlight === "function" ? globalWindow.Highlight : null;
}
var SideMarkSettingTab = class extends import_obsidian10.PluginSettingTab {
  constructor(plugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian10.Setting(containerEl).setName("\u521B\u5EFA\u6807\u6CE8\u540E\u6253\u5F00\u4FA7\u680F").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.autoOpenSidebar).onChange(async (value) => {
        this.plugin.settings.autoOpenSidebar = value;
        await this.plugin.saveSettings();
      });
    });
    this.renderLarkSyncSetting(containerEl);
    new import_obsidian10.Setting(containerEl).setName("\u8BC4\u8BBA\u663E\u793A\u540D\u79F0").setDesc("\u7528\u4E8E\u4FA7\u8FB9\u680F\u8BC4\u8BBA\u7EBF\u7A0B\u91CC\u7684\u4F5C\u8005\u540D\u3002").addText((text) => {
      text.setValue(this.plugin.settings.commentAuthorName).onChange(async (value) => {
        this.plugin.settings.commentAuthorName = value.trim() || DEFAULT_SETTINGS.commentAuthorName;
        await this.plugin.saveSettings();
      });
    });
  }
  renderLarkSyncSetting(containerEl) {
    const status = getLarkSyncPluginStatus(this.plugin);
    const canEnableSync = status === "enabled";
    const setting = new import_obsidian10.Setting(containerEl).setName("\u6807\u6CE8\u540C\u6B65\u98DE\u4E66").setDesc("\u5F00\u542F\u540E\uFF0C\u6DFB\u52A0\u672C\u5730\u8BC4\u8BBA\u6216\u56DE\u590D\u4F1A\u901A\u8FC7 Feishu Lark CLI Sync \u540C\u6B65\u5230\u98DE\u4E66\u3002CLI \u914D\u7F6E\u7531\u8BE5\u63D2\u4EF6\u7BA1\u7406\u3002").addToggle((toggle) => {
      toggle.setValue(canEnableSync && this.plugin.settings.autoSyncToLark).onChange(async (value) => {
        if (value && !canEnableSync) {
          toggle.setValue(false);
          this.plugin.settings.autoSyncToLark = false;
          await this.plugin.saveSettings();
          new import_obsidian10.Notice(`${getLarkSyncPluginStatusText(status)} \u65E0\u6CD5\u5F00\u542F\u6807\u6CE8\u540C\u6B65\uFF0C\u8BF7\u5148\u5B89\u88C5\u5E76\u542F\u7528\u8BE5\u63D2\u4EF6\u3002`, 8e3);
          return;
        }
        this.plugin.settings.autoSyncToLark = value;
        await this.plugin.saveSettings();
      });
    });
    const statusEl = setting.descEl.createDiv({
      cls: `side-mark-lark-sync-plugin-status ${getLarkSyncPluginStatusClass(status)}`,
      text: getLarkSyncPluginStatusText(status)
    });
    statusEl.setAttr("aria-live", "polite");
  }
};
