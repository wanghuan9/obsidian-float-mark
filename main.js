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
var import_view2 = require("@codemirror/view");

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

// src/editor-decorations.ts
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");

// src/mark-appearance.ts
function hasContinuousMarkPaint(mark) {
  return mark.mark.kind === "comment" || mark.mark.kind === "highlight" && mark.mark.backgroundColor !== "none";
}
function resolveMarkBackground(mark, marks) {
  if (mark.mark.backgroundColor !== "none") {
    return { color: mark.mark.backgroundColor, inherited: false };
  }
  if (mark.mark.kind !== "highlight" || mark.status !== "active") {
    return { color: "none", inherited: false };
  }
  let inheritedMark = null;
  let inheritedIndex = -1;
  for (let index = 0; index < marks.length; index += 1) {
    const candidate = marks[index];
    if (!candidate) {
      continue;
    }
    if (!isInheritedBackgroundCandidate(mark, candidate)) {
      continue;
    }
    if (inheritedMark && compareMarkRangeSpecificity(candidate, inheritedMark, index, inheritedIndex) >= 0) {
      continue;
    }
    inheritedMark = candidate;
    inheritedIndex = index;
  }
  return inheritedMark ? { color: inheritedMark.mark.backgroundColor, inherited: true } : { color: "none", inherited: false };
}
function compareMarkRangeSpecificity(left, right, leftIndex, rightIndex) {
  const leftLength = left.anchor.endOffset - left.anchor.startOffset;
  const rightLength = right.anchor.endOffset - right.anchor.startOffset;
  return leftLength - rightLength || left.anchor.startOffset - right.anchor.startOffset || rightIndex - leftIndex || left.id.localeCompare(right.id);
}
function isInheritedBackgroundCandidate(mark, candidate) {
  return candidate.id !== mark.id && candidate.filePath === mark.filePath && candidate.mark.kind === "highlight" && candidate.status === "active" && candidate.mark.backgroundColor !== "none" && candidate.anchor.startOffset <= mark.anchor.startOffset && candidate.anchor.endOffset >= mark.anchor.endOffset;
}

// src/editor-decorations.ts
function buildEditorDecorationLayers(marks, docLength, pendingSelection) {
  const regularRanges = [];
  const outerRanges = [];
  for (const mark of marks) {
    if (mark.status === "orphaned" || mark.status === "resolved") {
      continue;
    }
    const from = clampOffset(mark.anchor.startOffset, docLength);
    const to = Math.max(from, clampOffset(mark.anchor.endOffset, docLength));
    if (from === to) {
      continue;
    }
    const hasContinuousPaint = hasContinuousMarkPaint(mark);
    const regularBackground = hasContinuousPaint ? "none" : mark.mark.backgroundColor;
    regularRanges.push(import_view.Decoration.mark({
      class: [
        "side-mark",
        hasContinuousPaint ? "side-mark-editor-content" : "",
        `side-mark--${mark.mark.kind}`,
        `side-mark--${mark.mark.color}`,
        `side-mark--text-${mark.mark.textColor}`,
        `side-mark--background-${regularBackground}`
      ].filter(Boolean).join(" "),
      attributes: {
        "data-side-mark-id": mark.id,
        title: mark.note.content || "FloatMark"
      }
    }).range(from, to));
    if (hasContinuousPaint) {
      outerRanges.push(import_view.Decoration.mark({
        class: buildOuterPaintClasses(mark)
      }).range(from, to));
    }
  }
  addPendingSelection(regularRanges, pendingSelection, docLength);
  return {
    decorations: import_state.RangeSet.of(regularRanges, true),
    outerDecorations: import_state.RangeSet.of(outerRanges, true)
  };
}
function buildOuterPaintClasses(mark) {
  const paintClass = mark.mark.kind === "comment" ? `side-mark--${mark.mark.color}` : `side-mark--background-${mark.mark.backgroundColor}`;
  return [
    "side-mark-editor-background",
    `side-mark--${mark.mark.kind}`,
    paintClass
  ].join(" ");
}
function addPendingSelection(ranges, pendingSelection, docLength) {
  if (!pendingSelection) {
    return;
  }
  const from = clampOffset(pendingSelection.from, docLength);
  const to = Math.max(from, clampOffset(pendingSelection.to, docLength));
  if (from === to) {
    return;
  }
  ranges.push(import_view.Decoration.mark({
    class: "side-mark-pending-comment-selection"
  }).range(from, to));
}
function clampOffset(offset, docLength) {
  return Math.max(0, Math.min(offset, docLength));
}

// src/mark-click-guard.ts
function shouldOpenMarkForSelection(hasTextSelection) {
  return !hasTextSelection;
}
function hasNonEmptyDomSelection(selection) {
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

// src/editor-extension.ts
function createSideMarkEditorExtension(plugin) {
  return import_view2.ViewPlugin.fromClass(
    class SideMarkEditorPlugin {
      constructor(view) {
        this.view = view;
        this.selectionTimer = null;
        const layers = this.buildDecorationLayers();
        this.decorations = layers.decorations;
        this.outerDecorations = layers.outerDecorations;
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
          const layers = this.buildDecorationLayers();
          this.decorations = layers.decorations;
          this.outerDecorations = layers.outerDecorations;
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
      buildDecorationLayers() {
        var _a;
        const filePath = this.getFilePath();
        if (!filePath || ((_a = plugin.currentDocument) == null ? void 0 : _a.filePath) !== filePath) {
          return {
            decorations: import_view2.Decoration.none,
            outerDecorations: import_view2.Decoration.none
          };
        }
        const docLength = this.view.state.doc.length;
        const pendingCommentSelection = plugin.getPendingCommentSelection(filePath);
        return buildEditorDecorationLayers(plugin.currentDocument.marks, docLength, pendingCommentSelection);
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
        const hasTextSelection = !this.view.state.selection.main.empty;
        if (!shouldOpenMarkForSelection(hasTextSelection)) {
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
      decorations: (value) => value.decorations,
      provide: (editorPlugin) => import_view2.EditorView.outerDecorations.of(
        (view) => {
          var _a;
          return ((_a = view.plugin(editorPlugin)) == null ? void 0 : _a.outerDecorations) || import_view2.Decoration.none;
        }
      )
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
  constructor(t) {
    this.t = t;
    this.onSave = null;
    this.onHide = null;
    this.hideTimer = null;
    this.outsideMouseDownHandler = (event) => this.handleOutsideMouseDown(event);
    this.el = getActiveBody().createDiv({ cls: "side-mark-comment-popover" });
    this.el.hide();
    this.el.addEventListener("mouseenter", () => this.cancelHide());
    this.el.addEventListener("mouseleave", () => this.scheduleHide());
    const header = this.el.createDiv({ cls: "side-mark-comment-popover-header" });
    header.createSpan({ text: this.t("popover.commentTitle") });
    const closeButton = header.createEl("button", {
      cls: "side-mark-icon-button",
      attr: { type: "button", "aria-label": this.t("popover.close") }
    });
    (0, import_obsidian2.setIcon)(closeButton, "x");
    closeButton.addEventListener("click", () => this.hide());
    this.textarea = this.el.createEl("textarea", {
      cls: "side-mark-comment-textarea",
      attr: { placeholder: this.t("popover.commentPlaceholder") }
    });
    const actions = this.el.createDiv({ cls: "side-mark-comment-actions" });
    const cancel = actions.createEl("button", {
      text: this.t("popover.cancel"),
      cls: "side-mark-secondary-button",
      attr: { type: "button" }
    });
    cancel.addEventListener("click", () => this.hide());
    const save = actions.createEl("button", {
      text: this.t("popover.save"),
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

// src/block-menu-position.ts
function calculateBlockMenuPlacement(input) {
  const naturalMenuHeight = Math.max(0, input.naturalMenuHeight);
  const spaceBelow = Math.max(0, input.viewportHeight - input.pillBottom - input.gap - input.viewportPadding);
  const spaceAbove = Math.max(0, input.pillTop - input.gap - input.viewportPadding);
  const minimumBelowHeight = naturalMenuHeight * input.minimumBelowRatio;
  const opensAbove = spaceBelow < minimumBelowHeight && spaceAbove > spaceBelow;
  const availableHeight = opensAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.min(naturalMenuHeight, availableHeight);
  const top = opensAbove ? input.pillTop - input.gap - maxHeight : input.pillBottom + input.gap;
  return { opensAbove, top, maxHeight };
}

// src/hover-block-toolbar.ts
var HEADING_SUBMENU_BUTTONS = [
  { action: "heading-4", labelKey: "toolbar.heading4", shortcut: "H4", compact: true },
  { action: "heading-5", labelKey: "toolbar.heading5", shortcut: "H5", compact: true },
  { action: "heading-6", labelKey: "toolbar.heading6", shortcut: "H6", compact: true }
];
var FORMAT_BUTTONS = [
  { action: "paragraph", labelKey: "toolbar.paragraph", shortcut: "T", compact: true },
  { action: "heading-1", labelKey: "toolbar.heading1", shortcut: "H1", compact: true },
  { action: "heading-2", labelKey: "toolbar.heading2", shortcut: "H2", compact: true },
  { action: "heading-3", labelKey: "toolbar.heading3", shortcut: "H3", compact: true },
  { labelKey: "toolbar.otherHeadings", shortcut: "Hn", compact: true, submenu: HEADING_SUBMENU_BUTTONS },
  { action: "number-list", icon: "list-ordered", labelKey: "toolbar.numberList" },
  { action: "bullet-list", icon: "list", labelKey: "toolbar.bulletList" },
  { action: "task-list", icon: "square-check", labelKey: "toolbar.taskList" },
  { action: "code-block", icon: "braces", labelKey: "toolbar.codeBlock" },
  { action: "quote", icon: "quote", labelKey: "toolbar.quote" }
];
var ACTION_BUTTONS = [
  { action: "comment", icon: "message-square-text", labelKey: "toolbar.comment" },
  { action: "copy", icon: "copy", labelKey: "toolbar.copy" },
  { action: "delete", icon: "trash-2", labelKey: "toolbar.delete", danger: true }
];
var MENU_VIEWPORT_PADDING = 8;
var MENU_PILL_GAP = 6;
var MENU_DEFAULT_MAX_HEIGHT = 360;
var MENU_MINIMUM_BELOW_RATIO = 0.5;
var HoverBlockToolbar = class {
  constructor(onAction, t) {
    this.onAction = onAction;
    this.t = t;
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
      attr: { type: "button", "aria-label": this.t("toolbar.blockFormat") }
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
    for (const item of ACTION_BUTTONS) {
      this.renderButton(list, item, true);
    }
  }
  renderButton(container, item, closeSubmenuOnHover) {
    const label = this.t(item.labelKey);
    const button = container.createEl("button", {
      cls: item.compact ? `side-mark-block-menu-compact${item.submenu ? " has-submenu" : ""}` : `side-mark-block-menu-row${item.danger ? " is-danger" : ""}`,
      attr: {
        type: "button",
        title: label,
        "aria-label": label
      }
    });
    const icon = button.createSpan({ cls: "side-mark-block-menu-row-icon" });
    if (item.icon) {
      (0, import_obsidian3.setIcon)(icon, item.icon);
    } else {
      icon.setText(item.shortcut || label);
    }
    button.createSpan({ cls: "side-mark-block-menu-row-label", text: label });
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
    const placement = calculateBlockMenuPlacement({
      pillTop: pillRect.top,
      pillBottom: pillRect.bottom,
      naturalMenuHeight,
      viewportHeight: window.innerHeight,
      viewportPadding: MENU_VIEWPORT_PADDING,
      gap: MENU_PILL_GAP,
      minimumBelowRatio: MENU_MINIMUM_BELOW_RATIO
    });
    const left = clamp2(pillRect.left, MENU_VIEWPORT_PADDING, window.innerWidth - menuWidth - MENU_VIEWPORT_PADDING);
    if (placement.opensAbove) {
      this.menu.addClass("is-above");
    } else {
      this.menu.removeClass("is-above");
    }
    this.menu.style.maxHeight = `${placement.maxHeight}px`;
    this.menu.style.left = `${left}px`;
    this.menu.style.top = `${placement.top}px`;
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
  { color: "default", labelKey: "style.text.default" },
  { color: "gray", labelKey: "style.text.gray" },
  { color: "red", labelKey: "style.text.red" },
  { color: "orange", labelKey: "style.text.orange" },
  { color: "yellow", labelKey: "style.text.yellow" },
  { color: "green", labelKey: "style.text.green" },
  { color: "blue", labelKey: "style.text.blue" },
  { color: "purple", labelKey: "style.text.purple" }
];
var BACKGROUND_COLORS = [
  { color: "none", labelKey: "style.background.none" },
  { color: "gray-light", labelKey: "style.background.grayLight" },
  { color: "red-light", labelKey: "style.background.redLight" },
  { color: "orange-light", labelKey: "style.background.orangeLight" },
  { color: "yellow-light", labelKey: "style.background.yellowLight" },
  { color: "green-light", labelKey: "style.background.greenLight" },
  { color: "blue-light", labelKey: "style.background.blueLight" },
  { color: "purple-light", labelKey: "style.background.purpleLight" },
  { color: "gray", labelKey: "style.background.gray" },
  { color: "red", labelKey: "style.background.red" },
  { color: "orange", labelKey: "style.background.orange" },
  { color: "yellow", labelKey: "style.background.yellow" },
  { color: "green", labelKey: "style.background.green" },
  { color: "blue", labelKey: "style.background.blue" },
  { color: "purple", labelKey: "style.background.purple" }
];
var MarkStylePopover = class {
  constructor(t) {
    this.t = t;
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
    header.createSpan({ text: this.t("popover.markTitle") });
    const closeButton = header.createEl("button", {
      cls: "side-mark-icon-button",
      attr: { type: "button", "aria-label": this.t("popover.close") }
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
    this.el.createDiv({ cls: "side-mark-style-section-title", text: this.t("popover.textColor") });
    const row = this.el.createDiv({ cls: "side-mark-style-text-row" });
    for (const item of TEXT_COLORS) {
      const label = this.t(item.labelKey);
      const button = row.createEl("button", {
        cls: `side-mark-style-text-color is-${item.color}`,
        attr: { type: "button", title: label, "aria-label": label }
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
    this.el.createDiv({ cls: "side-mark-style-section-title", text: this.t("popover.backgroundColor") });
    const grid = this.el.createDiv({ cls: "side-mark-style-background-grid" });
    for (const item of BACKGROUND_COLORS) {
      const label = this.t(item.labelKey);
      const button = grid.createEl("button", {
        cls: `side-mark-style-background-color is-${item.color}`,
        attr: { type: "button", title: label, "aria-label": label }
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
      text: this.t("popover.resetDefault"),
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
  { id: "highlight", icon: "highlighter", titleKey: "toolbar.highlight" },
  { id: "comment", icon: "message-square-text", titleKey: "toolbar.comment" }
];
var ReadingSelectionToolbar = class {
  constructor(onAction, t) {
    this.onAction = onAction;
    this.t = t;
    this.hideTimer = null;
    this.el = getActiveBody().createDiv({ cls: "side-mark-toolbar side-mark-reading-selection-toolbar" });
    this.el.hide();
    this.el.addEventListener("mousedown", (event) => event.preventDefault());
    this.el.addEventListener("mouseenter", () => this.cancelHide());
    this.el.addEventListener("mouseleave", () => this.scheduleHide());
    for (const button of READING_BUTTONS) {
      const title = this.t(button.titleKey);
      const buttonEl = this.el.createEl("button", {
        cls: "side-mark-toolbar-button",
        attr: {
          type: "button",
          title,
          "aria-label": title
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
  { id: "heading-4", labelKey: "toolbar.heading4", shortcut: "H4" },
  { id: "heading-5", labelKey: "toolbar.heading5", shortcut: "H5" },
  { id: "heading-6", labelKey: "toolbar.heading6", shortcut: "H6" }
];
var FORMAT_ITEMS = [
  { id: "paragraph", labelKey: "toolbar.paragraph", shortcut: "T" },
  { id: "heading-1", labelKey: "toolbar.heading1", shortcut: "H1" },
  { id: "heading-2", labelKey: "toolbar.heading2", shortcut: "H2" },
  { id: "heading-3", labelKey: "toolbar.heading3", shortcut: "H3" },
  { labelKey: "toolbar.otherHeadings", shortcut: "Hn", submenu: HEADING_SUBMENU_ITEMS },
  { id: "number-list", icon: "list-ordered", labelKey: "toolbar.numberList" },
  { id: "bullet-list", icon: "list", labelKey: "toolbar.bulletList" },
  { id: "task-list", icon: "square-check", labelKey: "toolbar.taskList" },
  { id: "code-block", icon: "braces", labelKey: "toolbar.codeBlock" },
  { id: "quote", icon: "quote", labelKey: "toolbar.quote" }
];
var BUTTONS = [
  { id: "bold", icon: "bold", titleKey: "toolbar.bold" },
  { id: "strike", icon: "strikethrough", titleKey: "toolbar.strike" },
  { id: "italic", icon: "italic", titleKey: "toolbar.italic" },
  { id: "underline", icon: "underline", titleKey: "toolbar.underline" },
  { id: "link", icon: "link", titleKey: "toolbar.link" },
  { id: "code", icon: "code", titleKey: "toolbar.code" },
  { id: "highlight", icon: "highlighter", titleKey: "toolbar.highlight" },
  { id: "comment", icon: "message-square-text", titleKey: "toolbar.comment" }
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
  constructor(onAction, t) {
    this.onAction = onAction;
    this.t = t;
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
      attr: { type: "button", title: this.t("toolbar.format"), "aria-label": this.t("toolbar.format") }
    });
    this.formatLabel = format.createSpan({ text: this.t("toolbar.paragraph") });
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
      const title = this.t(button.titleKey);
      const buttonEl = this.el.createEl("button", {
        cls: "side-mark-toolbar-button",
        attr: {
          type: "button",
          title,
          "aria-label": title
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
      const label = this.t(item.labelKey);
      const row = this.menu.createEl("button", {
        cls: item.submenu ? "side-mark-selection-menu-row has-submenu" : "side-mark-selection-menu-row",
        attr: { type: "button", title: label, "aria-label": label }
      });
      const iconWrap = row.createSpan({ cls: "side-mark-selection-menu-icon" });
      if (item.icon) {
        (0, import_obsidian6.setIcon)(iconWrap, item.icon);
      } else {
        iconWrap.setText(item.shortcut || "");
      }
      row.createSpan({ cls: "side-mark-selection-menu-label", text: label });
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
          this.formatLabel.setText(item.shortcut || label);
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
      const label = this.t(item.labelKey);
      const row = this.submenu.createEl("button", {
        cls: "side-mark-selection-menu-row",
        attr: { type: "button", title: label, "aria-label": label }
      });
      row.createSpan({ cls: "side-mark-selection-menu-icon", text: item.shortcut || "" });
      row.createSpan({ cls: "side-mark-selection-menu-label", text: label });
      row.createSpan({ cls: "side-mark-selection-menu-check" });
      if (isSelectionFormatAction(item.id)) {
        this.formatRows.set(item.id, row);
      }
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (item.id) {
          this.formatLabel.setText(item.shortcut || label);
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

// src/i18n.ts
var TRANSLATIONS = {
  "zh-CN": {
    "app.openSidebar": "\u6253\u5F00\u6B63\u6587\u6807\u6CE8",
    "app.createCommentFromSelection": "\u4ECE\u5F53\u524D\u9009\u533A\u521B\u5EFA\u8BC4\u8BBA",
    "settings.language.name": "\u8BED\u8A00",
    "settings.language.desc": "\u9009\u62E9 FloatMark \u754C\u9762\u8BED\u8A00\u3002",
    "settings.language.zh": "\u7B80\u4F53\u4E2D\u6587",
    "settings.language.en": "English",
    "settings.autoOpenSidebar.name": "\u521B\u5EFA\u6807\u6CE8\u540E\u6253\u5F00\u4FA7\u680F",
    "settings.commentAuthorName.name": "\u8BC4\u8BBA\u663E\u793A\u540D\u79F0",
    "settings.commentAuthorName.desc": "\u7528\u4E8E\u4FA7\u8FB9\u680F\u8BC4\u8BBA\u7EBF\u7A0B\u91CC\u7684\u4F5C\u8005\u540D\u3002",
    "settings.larkSync.name": "\u6807\u6CE8\u540C\u6B65\u98DE\u4E66",
    "settings.larkSync.desc": "\u5F00\u542F\u540E\uFF0C\u6DFB\u52A0\u672C\u5730\u8BC4\u8BBA\u6216\u56DE\u590D\u4F1A\u901A\u8FC7 Feishu Lark CLI Sync \u540C\u6B65\u5230\u98DE\u4E66\u3002CLI \u914D\u7F6E\u7531\u8BE5\u63D2\u4EF6\u7BA1\u7406\u3002",
    "settings.larkSync.enableBlocked": "{status} \u65E0\u6CD5\u5F00\u542F\u6807\u6CE8\u540C\u6B65\uFF0C\u8BF7\u5148\u5B89\u88C5\u5E76\u542F\u7528\u8BE5\u63D2\u4EF6\u3002",
    "toolbar.format": "\u683C\u5F0F",
    "toolbar.paragraph": "\u6B63\u6587",
    "toolbar.heading1": "\u4E00\u7EA7\u6807\u9898",
    "toolbar.heading2": "\u4E8C\u7EA7\u6807\u9898",
    "toolbar.heading3": "\u4E09\u7EA7\u6807\u9898",
    "toolbar.heading4": "\u56DB\u7EA7\u6807\u9898",
    "toolbar.heading5": "\u4E94\u7EA7\u6807\u9898",
    "toolbar.heading6": "\u516D\u7EA7\u6807\u9898",
    "toolbar.otherHeadings": "\u5176\u4ED6\u6807\u9898",
    "toolbar.numberList": "\u6709\u5E8F\u5217\u8868",
    "toolbar.bulletList": "\u65E0\u5E8F\u5217\u8868",
    "toolbar.taskList": "\u4EFB\u52A1",
    "toolbar.codeBlock": "\u4EE3\u7801\u5757",
    "toolbar.quote": "\u5F15\u7528",
    "toolbar.bold": "\u52A0\u7C97",
    "toolbar.strike": "\u5220\u9664\u7EBF",
    "toolbar.italic": "\u659C\u4F53",
    "toolbar.underline": "\u4E0B\u5212\u7EBF",
    "toolbar.link": "\u94FE\u63A5",
    "toolbar.code": "\u884C\u5185\u4EE3\u7801",
    "toolbar.highlight": "\u9AD8\u4EAE\u6807\u6CE8",
    "toolbar.comment": "\u8BC4\u8BBA",
    "toolbar.copy": "\u590D\u5236",
    "toolbar.delete": "\u5220\u9664",
    "toolbar.blockFormat": "\u5757\u683C\u5F0F",
    "popover.close": "\u5173\u95ED",
    "popover.commentTitle": "\u8BC4\u8BBA",
    "popover.commentPlaceholder": "\u586B\u5199\u8BC4\u8BBA",
    "popover.cancel": "\u53D6\u6D88",
    "popover.save": "\u4FDD\u5B58",
    "popover.markTitle": "\u6807\u8BB0",
    "popover.textColor": "\u5B57\u4F53\u989C\u8272",
    "popover.backgroundColor": "\u80CC\u666F\u989C\u8272",
    "popover.resetDefault": "\u6062\u590D\u9ED8\u8BA4",
    "style.text.default": "\u9ED8\u8BA4\u5B57\u4F53",
    "style.text.gray": "\u7070\u8272\u5B57\u4F53",
    "style.text.red": "\u7EA2\u8272\u5B57\u4F53",
    "style.text.orange": "\u6A59\u8272\u5B57\u4F53",
    "style.text.yellow": "\u9EC4\u8272\u5B57\u4F53",
    "style.text.green": "\u7EFF\u8272\u5B57\u4F53",
    "style.text.blue": "\u84DD\u8272\u5B57\u4F53",
    "style.text.purple": "\u7D2B\u8272\u5B57\u4F53",
    "style.background.none": "\u65E0\u80CC\u666F",
    "style.background.grayLight": "\u6D45\u7070\u80CC\u666F",
    "style.background.redLight": "\u6D45\u7EA2\u80CC\u666F",
    "style.background.orangeLight": "\u6D45\u6A59\u80CC\u666F",
    "style.background.yellowLight": "\u6D45\u9EC4\u80CC\u666F",
    "style.background.greenLight": "\u6D45\u7EFF\u80CC\u666F",
    "style.background.blueLight": "\u6D45\u84DD\u80CC\u666F",
    "style.background.purpleLight": "\u6D45\u7D2B\u80CC\u666F",
    "style.background.gray": "\u7070\u8272\u80CC\u666F",
    "style.background.red": "\u7EA2\u8272\u80CC\u666F",
    "style.background.orange": "\u6A59\u8272\u80CC\u666F",
    "style.background.yellow": "\u9EC4\u8272\u80CC\u666F",
    "style.background.green": "\u7EFF\u8272\u80CC\u666F",
    "style.background.blue": "\u84DD\u8272\u80CC\u666F",
    "style.background.purple": "\u7D2B\u8272\u80CC\u666F",
    "sidebar.title": "\u6B63\u6587\u6807\u6CE8",
    "sidebar.emptyDocument": "\u5F53\u524D\u6587\u6863\u8FD8\u6CA1\u6709\u6807\u6CE8\u3002",
    "sidebar.emptyComments": "\u5F53\u524D\u7B5B\u9009\u4E0B\u6CA1\u6709\u8BC4\u8BBA\u3002",
    "sidebar.emptyMarks": "\u5F53\u524D\u7B5B\u9009\u4E0B\u6CA1\u6709\u6807\u8BB0\u3002",
    "sidebar.comments": "\u8BC4\u8BBA",
    "sidebar.marks": "\u6807\u8BB0",
    "sidebar.status": "\u72B6\u6001",
    "sidebar.color": "\u989C\u8272",
    "sidebar.tag": "\u6807\u7B7E",
    "sidebar.active": "\u6D3B\u52A8",
    "sidebar.all": "\u5168\u90E8",
    "sidebar.resolved": "\u5DF2\u89E3\u51B3",
    "sidebar.orphaned": "\u5931\u8054",
    "sidebar.yellow": "\u9EC4\u8272",
    "sidebar.blue": "\u84DD\u8272",
    "sidebar.green": "\u7EFF\u8272",
    "sidebar.red": "\u7EA2\u8272",
    "sidebar.searchComments": "\u641C\u7D22\u8BC4\u8BBA",
    "sidebar.searchMarks": "\u641C\u7D22\u6807\u8BB0",
    "sidebar.currentDocumentStats": "\u5F53\u524D\u6587\u6863\uFF0C\u5171 {count} \u6761{kind}",
    "sidebar.currentFilterStats": "\u5F53\u524D\u7B5B\u9009\uFF0C\u5171 {filtered} / {total} \u6761{kind}",
    "sidebar.locate": "\u5B9A\u4F4D",
    "sidebar.style": "\u6837\u5F0F",
    "sidebar.editNote": "\u7F16\u8F91\u5907\u6CE8",
    "sidebar.addNote": "\u6DFB\u52A0\u5907\u6CE8",
    "sidebar.more": "\u66F4\u591A",
    "sidebar.font": "\u5B57\u4F53",
    "sidebar.background": "\u80CC\u666F",
    "sidebar.inherited": "\u7EE7\u627F",
    "sidebar.inheritedBackground": "\u80CC\u666F\u7EE7\u627F\u81EA\u8986\u76D6\u5F53\u524D\u6587\u672C\u7684\u6807\u8BB0",
    "sidebar.editNoteTitle": "\u53CC\u51FB\u4FEE\u6539\u5907\u6CE8",
    "sidebar.deleteNote": "\u5220\u9664\u5907\u6CE8",
    "sidebar.notePlaceholder": "\u5199\u4E00\u6761\u5907\u6CE8",
    "sidebar.pickColor": "\u989C\u8272",
    "sidebar.restore": "\u6062\u590D",
    "sidebar.resolve": "\u89E3\u51B3",
    "sidebar.emptyThread": "\u8FD8\u6CA1\u6709\u8BC4\u8BBA\uFF0C\u7EE7\u7EED\u8F93\u5165\u7B2C\u4E00\u6761\u3002",
    "sidebar.editCommentTitle": "\u53CC\u51FB\u4FEE\u6539\u8BC4\u8BBA",
    "sidebar.deleteComment": "\u5220\u9664\u8BC4\u8BBA",
    "sidebar.replyTrigger": "\u56DE\u590D...",
    "sidebar.replyPlaceholder": "\u7EE7\u7EED\u8BC4\u8BBA",
    "sidebar.reply": "\u56DE\u590D",
    "sidebar.confirmDelete": "\u786E\u8BA4\u5220\u9664",
    "sidebar.confirm": "\u786E\u8BA4",
    "sidebar.syncedToLark": "\u5DF2\u540C\u6B65\u5230\u98DE\u4E66",
    "sidebar.syncLarkFailed": "\u540C\u6B65\u98DE\u4E66\u5931\u8D25",
    "sidebar.syncToLark": "\u540C\u6B65\u5230\u98DE\u4E66",
    "sidebar.justNow": "\u521A\u521A",
    "sidebar.minutesAgo": "{count} \u5206\u949F\u524D",
    "sidebar.hoursAgo": "{count} \u5C0F\u65F6\u524D",
    "notice.larkStatusSyncFailed": "\u540C\u6B65\u98DE\u4E66\u8BC4\u8BBA\u72B6\u6001\u5931\u8D25\uFF1A{message}",
    "notice.larkDeleteCommentFailed": "\u5220\u9664\u98DE\u4E66\u8BC4\u8BBA\u5931\u8D25\uFF1A{message}",
    "notice.larkDeleteReplyFailed": "\u5220\u9664\u98DE\u4E66\u8BC4\u8BBA\u56DE\u590D\u5931\u8D25\uFF1A{message}",
    "notice.blockCopied": "\u5DF2\u590D\u5236\u5F53\u524D\u5757\u3002",
    "notice.noEditorSelection": "\u6CA1\u6709\u53EF\u7528\u7684\u7F16\u8F91\u5668\u9009\u533A\u3002",
    "notice.autoSyncLarkFailed": "\u81EA\u52A8\u540C\u6B65\u98DE\u4E66\u5931\u8D25\uFF1A{message}",
    "notice.syncedToLark": "\u5DF2\u540C\u6B65\u6807\u6CE8\u5230\u98DE\u4E66\u8BC4\u8BBA\u3002",
    "error.emptyComment": "\u8BC4\u8BBA\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\u3002",
    "error.noLarkBinding": "\u5F53\u524D\u7B14\u8BB0\u6CA1\u6709 lark_doc_url \u6216 lark_doc_token\u3002\u8BF7\u5148\u7528 Feishu Lark CLI Sync \u540C\u6B65\u8FD9\u7BC7\u6587\u6863\u3002",
    "error.noLarkBlockMap": "\u6CA1\u6709\u627E\u5230\u98DE\u4E66 block \u6620\u5C04\u3002\u8BF7\u5148\u7528 Feishu Lark CLI Sync \u540C\u6B65\u4E00\u6B21\u5F53\u524D\u6587\u6863\u3002",
    "error.noLarkBlock": "\u6CA1\u6709\u627E\u5230\u8BE5\u6807\u6CE8\u547D\u4E2D\u7684\u7B2C\u4E00\u4E2A\u98DE\u4E66 block\u3002",
    "error.larkCreateCommentFailed": "lark-cli \u6DFB\u52A0\u8BC4\u8BBA\u5931\u8D25\u3002",
    "error.larkCreateReplyFailed": "lark-cli \u6DFB\u52A0\u56DE\u590D\u5931\u8D25\u3002",
    "error.larkUpdateCommentFailed": "lark-cli \u66F4\u65B0\u8BC4\u8BBA\u72B6\u6001\u5931\u8D25\u3002",
    "error.missingLarkReplyId": "\u7F3A\u5C11\u98DE\u4E66\u56DE\u590D ID\uFF0C\u65E0\u6CD5\u5220\u9664\u8FDC\u7AEF\u8BC4\u8BBA\u3002",
    "error.larkDeleteReplyFailed": "lark-cli \u5220\u9664\u8BC4\u8BBA\u56DE\u590D\u5931\u8D25\u3002",
    "error.localReplyNotFound": "\u627E\u4E0D\u5230\u8981\u5220\u9664\u7684\u672C\u5730\u8BC4\u8BBA\u56DE\u590D\u3002",
    "error.missingRemoteReplyId": "\u7F3A\u5C11\u98DE\u4E66\u56DE\u590D ID\uFF0C\u65E0\u6CD5\u5220\u9664\u8FDC\u7AEF\u8BC4\u8BBA\u56DE\u590D\u3002",
    "error.missingLarkCommentInfo": "\u7F3A\u5C11\u98DE\u4E66\u8BC4\u8BBA\u540C\u6B65\u4FE1\u606F\uFF0C\u65E0\u6CD5\u64CD\u4F5C\u8FDC\u7AEF\u8BC4\u8BBA\u3002",
    "error.missingLarkCommentId": "\u7F3A\u5C11\u98DE\u4E66\u8BC4\u8BBA ID\uFF0C\u65E0\u6CD5\u8FFD\u52A0\u56DE\u590D\u3002",
    "error.missingSyncRecord": "\u7F3A\u5C11\u4E0A\u6B21\u540C\u6B65\u8BB0\u5F55\uFF0C\u65E0\u6CD5\u5224\u65AD\u54EA\u4E9B\u56DE\u590D\u5DF2\u540C\u6B65\u3002\u8BF7\u5728\u98DE\u4E66\u4E2D\u786E\u8BA4\u540E\u91CD\u65B0\u521B\u5EFA\u8BC4\u8BBA\u3002",
    "error.commentAnchorChanged": "\u8BC4\u8BBA\u5B9A\u4F4D\u6587\u672C\u5DF2\u53D8\u5316\uFF0C\u65E0\u6CD5\u5B89\u5168\u8FFD\u52A0\u98DE\u4E66\u56DE\u590D\u3002\u8BF7\u91CD\u65B0\u521B\u5EFA\u8BC4\u8BBA\u3002",
    "error.syncedCommentChanged": "\u5DF2\u540C\u6B65\u7684\u65E7\u8BC4\u8BBA\u5185\u5BB9\u53D1\u751F\u53D8\u5316\uFF0C\u6682\u4E0D\u652F\u6301\u540C\u6B65\u7F16\u8F91\u6216\u5220\u9664\u540E\u7684\u56DE\u590D\u3002",
    "error.larkGetRepliesFailed": "lark-cli \u83B7\u53D6\u8BC4\u8BBA\u56DE\u590D\u5931\u8D25\u3002",
    "error.larkPluginUnavailable": "{status} \u8BF7\u5148\u5B89\u88C5\u5E76\u542F\u7528\u8BE5\u63D2\u4EF6\u3002",
    "error.larkPluginNoCli": "Feishu Lark CLI Sync \u672A\u66B4\u9732 CLI \u6267\u884C\u80FD\u529B\uFF0C\u8BF7\u5347\u7EA7\u8BE5\u63D2\u4EF6\u3002",
    "error.larkNoCommentId": "lark-cli \u672A\u8FD4\u56DE comment_id\u3002",
    "lark.emptyComment": "\uFF08\u65E0\u8BC4\u8BBA\uFF09",
    "lark.status.enabled": "\u72B6\u6001\uFF1AFeishu Lark CLI Sync \u5DF2\u542F\u7528\u3002",
    "lark.status.disabled": "\u72B6\u6001\uFF1AFeishu Lark CLI Sync \u5DF2\u5B89\u88C5\u4F46\u672A\u542F\u7528\u3002",
    "lark.status.notInstalled": "\u72B6\u6001\uFF1A\u672A\u5B89\u88C5 Feishu Lark CLI Sync\u3002",
    "lark.status.unknown": "\u72B6\u6001\uFF1A\u65E0\u6CD5\u68C0\u6D4B Feishu Lark CLI Sync\u3002"
  },
  en: {
    "app.openSidebar": "Open FloatMark sidebar",
    "app.createCommentFromSelection": "Create comment from selection",
    "settings.language.name": "Language",
    "settings.language.desc": "Choose the FloatMark interface language.",
    "settings.language.zh": "\u7B80\u4F53\u4E2D\u6587",
    "settings.language.en": "English",
    "settings.autoOpenSidebar.name": "Open sidebar after creating a mark",
    "settings.commentAuthorName.name": "Comment display name",
    "settings.commentAuthorName.desc": "Author name shown in sidebar comment threads.",
    "settings.larkSync.name": "Sync marks to Feishu",
    "settings.larkSync.desc": "When enabled, local comments and replies are synced to Feishu through Feishu Lark CLI Sync. CLI configuration is managed by that plugin.",
    "settings.larkSync.enableBlocked": "{status} Cannot enable mark sync. Install and enable the plugin first.",
    "toolbar.format": "Format",
    "toolbar.paragraph": "Text",
    "toolbar.heading1": "Heading 1",
    "toolbar.heading2": "Heading 2",
    "toolbar.heading3": "Heading 3",
    "toolbar.heading4": "Heading 4",
    "toolbar.heading5": "Heading 5",
    "toolbar.heading6": "Heading 6",
    "toolbar.otherHeadings": "More headings",
    "toolbar.numberList": "Numbered list",
    "toolbar.bulletList": "Bulleted list",
    "toolbar.taskList": "Task",
    "toolbar.codeBlock": "Code block",
    "toolbar.quote": "Quote",
    "toolbar.bold": "Bold",
    "toolbar.strike": "Strikethrough",
    "toolbar.italic": "Italic",
    "toolbar.underline": "Underline",
    "toolbar.link": "Link",
    "toolbar.code": "Inline code",
    "toolbar.highlight": "Highlight",
    "toolbar.comment": "Comment",
    "toolbar.copy": "Copy",
    "toolbar.delete": "Delete",
    "toolbar.blockFormat": "Block format",
    "popover.close": "Close",
    "popover.commentTitle": "Comment",
    "popover.commentPlaceholder": "Write a comment",
    "popover.cancel": "Cancel",
    "popover.save": "Save",
    "popover.markTitle": "Mark",
    "popover.textColor": "Text color",
    "popover.backgroundColor": "Background color",
    "popover.resetDefault": "Reset to default",
    "style.text.default": "Default text",
    "style.text.gray": "Gray text",
    "style.text.red": "Red text",
    "style.text.orange": "Orange text",
    "style.text.yellow": "Yellow text",
    "style.text.green": "Green text",
    "style.text.blue": "Blue text",
    "style.text.purple": "Purple text",
    "style.background.none": "No background",
    "style.background.grayLight": "Light gray background",
    "style.background.redLight": "Light red background",
    "style.background.orangeLight": "Light orange background",
    "style.background.yellowLight": "Light yellow background",
    "style.background.greenLight": "Light green background",
    "style.background.blueLight": "Light blue background",
    "style.background.purpleLight": "Light purple background",
    "style.background.gray": "Gray background",
    "style.background.red": "Red background",
    "style.background.orange": "Orange background",
    "style.background.yellow": "Yellow background",
    "style.background.green": "Green background",
    "style.background.blue": "Blue background",
    "style.background.purple": "Purple background",
    "sidebar.title": "FloatMark",
    "sidebar.emptyDocument": "No marks in the current document yet.",
    "sidebar.emptyComments": "No comments match the current filters.",
    "sidebar.emptyMarks": "No marks match the current filters.",
    "sidebar.comments": "Comments",
    "sidebar.marks": "Marks",
    "sidebar.status": "Status",
    "sidebar.color": "Color",
    "sidebar.tag": "Tag",
    "sidebar.active": "Active",
    "sidebar.all": "All",
    "sidebar.resolved": "Resolved",
    "sidebar.orphaned": "Orphaned",
    "sidebar.yellow": "Yellow",
    "sidebar.blue": "Blue",
    "sidebar.green": "Green",
    "sidebar.red": "Red",
    "sidebar.searchComments": "Search comments",
    "sidebar.searchMarks": "Search marks",
    "sidebar.currentDocumentStats": "Current document, {count} {kind}",
    "sidebar.currentFilterStats": "Current filter, {filtered} / {total} {kind}",
    "sidebar.locate": "Locate",
    "sidebar.style": "Style",
    "sidebar.editNote": "Edit note",
    "sidebar.addNote": "Add note",
    "sidebar.more": "More",
    "sidebar.font": "Text",
    "sidebar.background": "Background",
    "sidebar.inherited": "Inherited",
    "sidebar.inheritedBackground": "Background inherited from a mark covering this text",
    "sidebar.editNoteTitle": "Double-click to edit note",
    "sidebar.deleteNote": "Delete note",
    "sidebar.notePlaceholder": "Write a note",
    "sidebar.pickColor": "Color",
    "sidebar.restore": "Restore",
    "sidebar.resolve": "Resolve",
    "sidebar.emptyThread": "No comments yet. Keep typing the first one.",
    "sidebar.editCommentTitle": "Double-click to edit comment",
    "sidebar.deleteComment": "Delete comment",
    "sidebar.replyTrigger": "Reply...",
    "sidebar.replyPlaceholder": "Continue commenting",
    "sidebar.reply": "Reply",
    "sidebar.confirmDelete": "Confirm delete",
    "sidebar.confirm": "Confirm",
    "sidebar.syncedToLark": "Synced to Feishu",
    "sidebar.syncLarkFailed": "Feishu sync failed",
    "sidebar.syncToLark": "Sync to Feishu",
    "sidebar.justNow": "Just now",
    "sidebar.minutesAgo": "{count} minutes ago",
    "sidebar.hoursAgo": "{count} hours ago",
    "notice.larkStatusSyncFailed": "Failed to sync Feishu comment status: {message}",
    "notice.larkDeleteCommentFailed": "Failed to delete Feishu comment: {message}",
    "notice.larkDeleteReplyFailed": "Failed to delete Feishu comment reply: {message}",
    "notice.blockCopied": "Current block copied.",
    "notice.noEditorSelection": "No editor selection is available.",
    "notice.autoSyncLarkFailed": "Auto sync to Feishu failed: {message}",
    "notice.syncedToLark": "Mark synced to a Feishu comment.",
    "error.emptyComment": "Comment content cannot be empty.",
    "error.noLarkBinding": "The current note has no lark_doc_url or lark_doc_token. Sync this document with Feishu Lark CLI Sync first.",
    "error.noLarkBlockMap": "No Feishu block map was found. Sync the current document once with Feishu Lark CLI Sync first.",
    "error.noLarkBlock": "No Feishu block was found for this mark.",
    "error.larkCreateCommentFailed": "lark-cli failed to add the comment.",
    "error.larkCreateReplyFailed": "lark-cli failed to add the reply.",
    "error.larkUpdateCommentFailed": "lark-cli failed to update the comment status.",
    "error.missingLarkReplyId": "Missing Feishu reply ID. Cannot delete the remote comment.",
    "error.larkDeleteReplyFailed": "lark-cli failed to delete the comment reply.",
    "error.localReplyNotFound": "The local comment reply to delete was not found.",
    "error.missingRemoteReplyId": "Missing Feishu reply ID. Cannot delete the remote comment reply.",
    "error.missingLarkCommentInfo": "Missing Feishu comment sync information. Cannot operate on the remote comment.",
    "error.missingLarkCommentId": "Missing Feishu comment ID. Cannot append replies.",
    "error.missingSyncRecord": "Missing the previous sync record. Confirm in Feishu, then recreate the comment.",
    "error.commentAnchorChanged": "The comment anchor text has changed. Recreate the comment before safely appending Feishu replies.",
    "error.syncedCommentChanged": "The synced comment content changed. Editing or deleting synced replies is not supported yet.",
    "error.larkGetRepliesFailed": "lark-cli failed to get comment replies.",
    "error.larkPluginUnavailable": "{status} Install and enable the plugin first.",
    "error.larkPluginNoCli": "Feishu Lark CLI Sync does not expose CLI execution. Upgrade that plugin.",
    "error.larkNoCommentId": "lark-cli did not return comment_id.",
    "lark.emptyComment": "(No comment)",
    "lark.status.enabled": "Status: Feishu Lark CLI Sync is enabled.",
    "lark.status.disabled": "Status: Feishu Lark CLI Sync is installed but disabled.",
    "lark.status.notInstalled": "Status: Feishu Lark CLI Sync is not installed.",
    "lark.status.unknown": "Status: Unable to detect Feishu Lark CLI Sync."
  }
};
function translate(language, key, params = {}) {
  const normalizedLanguage = normalizePluginLanguage(language, "zh-CN");
  const template = TRANSLATIONS[normalizedLanguage][key] || TRANSLATIONS["zh-CN"][key] || key;
  return template.replace(/\{(\w+)}/g, (match, name) => {
    var _a;
    return String((_a = params[name]) != null ? _a : match);
  });
}
function normalizePluginLanguage(value, fallback) {
  return value === "en" || value === "zh-CN" ? value : fallback;
}
function getDefaultCommentAuthorName(language) {
  return language === "en" ? "Me" : "\u6211";
}
function getInitialPluginLanguage(app, currentObsidianLanguage = "") {
  const language = currentObsidianLanguage || getObsidianLanguage(app);
  return isChineseLanguage(language) ? "zh-CN" : "en";
}
function getObsidianLanguage(app) {
  var _a;
  const vaultWithConfig = app.vault;
  const configuredLanguage = (_a = vaultWithConfig.getConfig) == null ? void 0 : _a.call(vaultWithConfig, "userLanguage");
  if (typeof configuredLanguage === "string" && configuredLanguage.trim()) {
    return configuredLanguage;
  }
  const appWithLocale = app;
  return typeof appWithLocale.locale === "string" ? appWithLocale.locale : "";
}
function isChineseLanguage(language) {
  const normalized = language.toLowerCase();
  return normalized === "zh" || normalized.startsWith("zh-") || normalized.startsWith("zh_");
}

// src/types.ts
var DATA_DIR = ".obsidian-float-marks";
var DEFAULT_SETTINGS = {
  dataDir: DATA_DIR,
  language: void 0,
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
      throw new Error(translate(this.settings.language, "error.emptyComment"));
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
      throw new Error(translate(this.settings.language, "error.emptyComment"));
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
  { color: "yellow", labelKey: "sidebar.yellow" },
  { color: "blue", labelKey: "sidebar.blue" },
  { color: "green", labelKey: "sidebar.green" },
  { color: "red", labelKey: "sidebar.red" }
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
  t(key, params) {
    return this.plugin.t(key, params);
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
    titleRow.createEl("h3", { text: this.t("sidebar.title") });
    const doc = this.plugin.currentDocument;
    const allMarks = (doc == null ? void 0 : doc.marks) || [];
    const toolbarRow = header.createDiv({ cls: "side-mark-sidebar-toolbar-row" });
    this.renderTabs(toolbarRow, allMarks);
    const controls = toolbarRow.createDiv({ cls: "side-mark-sidebar-controls" });
    if (!doc || doc.marks.length === 0) {
      this.renderFilters(header, controls, [], []);
      this.restoreSearchInputFocus();
      container.createDiv({ text: this.t("sidebar.emptyDocument"), cls: "setting-item-description" });
      return;
    }
    const tabMarks = this.getTabMarks(doc.marks);
    const marks = this.getFilteredMarks(tabMarks);
    this.renderFilters(header, controls, tabMarks, marks);
    this.restoreSearchInputFocus();
    if (marks.length === 0) {
      container.createDiv({
        text: this.activeTab === "comments" ? this.t("sidebar.emptyComments") : this.t("sidebar.emptyMarks"),
        cls: "setting-item-description"
      });
      return;
    }
    for (const mark of marks) {
      if (this.activeTab === "comments") {
        this.renderCard(container, mark);
      } else {
        this.renderMarkCard(container, mark, allMarks);
      }
    }
  }
  renderTabs(container, marks) {
    const tabs = container.createDiv({ cls: "side-mark-sidebar-tabs" });
    this.renderTab(tabs, "comments", this.t("sidebar.comments"), this.getFilteredMarks(this.getTabMarks(marks, "comments"), "comments").length);
    this.renderTab(tabs, "marks", this.t("sidebar.marks"), this.getFilteredMarks(this.getTabMarks(marks, "marks"), "marks").length);
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
    this.renderSelect(controls, this.t("sidebar.status"), this.filter, [
      { value: "active", label: this.t("sidebar.active") },
      { value: "all", label: this.t("sidebar.all") },
      { value: "resolved", label: this.t("sidebar.resolved") },
      { value: "orphaned", label: this.t("sidebar.orphaned") }
    ], (value) => {
      this.filter = value;
      void this.render();
    });
    if (this.activeTab === "comments") {
      this.renderSelect(controls, this.t("sidebar.color"), this.colorFilter, [
        { value: "all", label: this.t("sidebar.all") },
        { value: "yellow", label: this.t("sidebar.yellow") },
        { value: "blue", label: this.t("sidebar.blue") },
        { value: "green", label: this.t("sidebar.green") },
        { value: "red", label: this.t("sidebar.red") }
      ], (value) => {
        this.colorFilter = value;
        void this.render();
      });
    }
    this.renderSelect(controls, this.t("sidebar.tag"), this.tagFilter, [
      { value: "all", label: this.t("sidebar.all") }
    ], (value) => {
      this.tagFilter = value;
      void this.render();
    });
    const searchWrap = container.createDiv({ cls: "side-mark-sidebar-search" });
    const search = searchWrap.createEl("input", {
      cls: "side-mark-sidebar-search-input",
      attr: {
        type: "search",
        placeholder: this.activeTab === "comments" ? this.t("sidebar.searchComments") : this.t("sidebar.searchMarks"),
        "aria-label": this.activeTab === "comments" ? this.t("sidebar.searchComments") : this.t("sidebar.searchMarks")
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
      text: allMarks.length === filteredMarks.length ? this.t("sidebar.currentDocumentStats", {
        count: allMarks.length,
        kind: this.activeTab === "comments" ? this.t("sidebar.comments") : this.t("sidebar.marks")
      }) : this.t("sidebar.currentFilterStats", {
        filtered: filteredMarks.length,
        total: allMarks.length,
        kind: this.activeTab === "comments" ? this.t("sidebar.comments") : this.t("sidebar.marks")
      })
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
  renderMarkCard(container, mark, marks) {
    const background = resolveMarkBackground(mark, marks);
    const card = container.createDiv({
      cls: `side-mark-card side-mark-marker-card is-background-${background.color}${mark.status === "resolved" ? " is-resolved" : ""}`
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
    this.addIconAction(toolbar, "chevrons-up", this.t("sidebar.locate"), () => void this.plugin.jumpToMark(mark.id));
    this.addIconAction(toolbar, "palette", this.t("sidebar.style"), () => {
      const rect = card.getBoundingClientRect();
      void this.plugin.openMark(mark.id, rect);
    });
    this.addIconAction(toolbar, "sticky-note", mark.note.content.trim() ? this.t("sidebar.editNote") : this.t("sidebar.addNote"), (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.renderMarkerNoteEditor(card, mark);
    });
    this.addDeleteIconAction(toolbar, this.t("toolbar.delete"), () => void this.deleteMark(mark.id));
    const more = toolbar.createEl("button", {
      cls: "side-mark-card-icon-button",
      attr: { type: "button", title: this.t("sidebar.more"), "aria-label": this.t("sidebar.more") }
    });
    (0, import_obsidian8.setIcon)(more, "more-horizontal");
    const menu = card.createDiv({ cls: "side-mark-card-menu" });
    menu.hide();
    this.addMenuAction(menu, "trash-2", this.t("toolbar.delete"), () => void this.deleteMark(mark.id));
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
      cls: `side-mark-card-quote side-mark-marker-preview side-mark--highlight side-mark--text-${mark.mark.textColor} side-mark--background-${background.color}`
    });
    quote.createDiv({
      cls: "side-mark-card-quote-text",
      text: mark.anchor.selectedText
    });
    this.renderMarkerNote(card, mark);
    const meta = card.createDiv({ cls: "side-mark-marker-meta" });
    const textSwatch = meta.createSpan({ cls: `side-mark-marker-swatch is-text-${mark.mark.textColor}` });
    textSwatch.setAttr("aria-hidden", "true");
    meta.createSpan({ text: this.t("sidebar.font") });
    const inheritedClass = background.inherited ? " is-inherited" : "";
    const backgroundSwatch = meta.createSpan({
      cls: `side-mark-marker-swatch is-background-${background.color}${inheritedClass}`
    });
    backgroundSwatch.setAttr("aria-hidden", "true");
    if (background.inherited) {
      backgroundSwatch.setAttr("title", this.t("sidebar.inheritedBackground"));
    }
    const backgroundLabel = meta.createSpan({
      text: background.inherited ? `${this.t("sidebar.background")}(${this.t("sidebar.inherited")})` : this.t("sidebar.background")
    });
    if (background.inherited) {
      backgroundLabel.setAttr("title", this.t("sidebar.inheritedBackground"));
      backgroundLabel.setAttr("aria-label", this.t("sidebar.inheritedBackground"));
    }
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
      attr: { title: this.t("sidebar.editNoteTitle") }
    });
    this.addInlineDeleteAction(display, this.t("sidebar.deleteNote"), () => {
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
      attr: { placeholder: this.t("sidebar.notePlaceholder") }
    });
    const actions = note.createDiv({ cls: "side-mark-marker-note-actions" });
    const cancel = actions.createEl("button", {
      text: this.t("popover.cancel"),
      cls: "side-mark-secondary-button",
      attr: { type: "button" }
    });
    const save = actions.createEl("button", {
      text: this.t("popover.save"),
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
      const label = this.t(item.labelKey);
      const button = menu.createEl("button", {
        cls: `side-mark-color-option is-${item.color}${item.color === mark.mark.color ? " is-active" : ""}`,
        attr: { type: "button", title: label, "aria-label": label }
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
    this.addIconAction(toolbar, "chevrons-up", this.t("sidebar.locate"), () => void this.plugin.jumpToMark(mark.id));
    this.addSyncAction(toolbar, mark);
    this.addIconAction(toolbar, "palette", this.t("sidebar.pickColor"), (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleColorPicker(card);
    });
    this.addIconAction(
      toolbar,
      mark.status === "resolved" ? "circle" : "circle-check",
      mark.status === "resolved" ? this.t("sidebar.restore") : this.t("sidebar.resolve"),
      () => void this.toggleResolved(mark.id)
    );
    const more = toolbar.createEl("button", {
      cls: "side-mark-card-icon-button",
      attr: { type: "button", title: this.t("sidebar.more"), "aria-label": this.t("sidebar.more") }
    });
    (0, import_obsidian8.setIcon)(more, "more-horizontal");
    const menu = card.createDiv({ cls: "side-mark-card-menu is-compact" });
    menu.hide();
    this.addMenuAction(menu, "trash-2", this.t("toolbar.delete"), () => void this.deleteMark(mark.id));
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
      thread.createDiv({ cls: "side-mark-empty-thread", text: this.t("sidebar.emptyThread") });
      return;
    }
    for (const [index, reply] of replies.entries()) {
      const isThreadHead = index === 0;
      const row = thread.createDiv({ cls: `side-mark-reply${isThreadHead ? " is-thread-head" : " is-continuation"}` });
      if (isThreadHead) {
        const authorName = reply.authorName || this.plugin.settings.commentAuthorName;
        const avatar = row.createDiv({ cls: "side-mark-avatar", text: authorName.slice(0, 1) || this.plugin.settings.commentAuthorName.slice(0, 1) });
        avatar.setAttr("aria-hidden", "true");
      }
      const body = row.createDiv({ cls: "side-mark-reply-body" });
      const meta = body.createDiv({ cls: "side-mark-reply-meta" });
      if (isThreadHead) {
        meta.createSpan({
          cls: "side-mark-reply-author",
          text: reply.authorName || this.plugin.settings.commentAuthorName
        });
      }
      meta.createSpan({ cls: "side-mark-reply-time", text: formatReplyTime(reply.createdAt, (key, params) => this.t(key, params)) });
      const content = body.createDiv({
        cls: "side-mark-reply-content",
        text: reply.content,
        attr: { title: this.t("sidebar.editCommentTitle") }
      });
      this.addInlineDeleteAction(content, this.t("sidebar.deleteComment"), () => {
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
      text: this.t("popover.cancel"),
      cls: "side-mark-secondary-button",
      attr: { type: "button" }
    });
    const save = actions.createEl("button", {
      text: this.t("popover.save"),
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
      text: this.t("sidebar.replyTrigger"),
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
      attr: { placeholder: this.t("sidebar.replyPlaceholder") }
    });
    textarea.hide();
    const row = composer.createDiv({ cls: "side-mark-reply-composer-actions" });
    row.hide();
    const cancel = row.createEl("button", {
      text: this.t("popover.cancel"),
      cls: "side-mark-secondary-button",
      attr: { type: "button" }
    });
    const submit = row.createEl("button", {
      text: this.t("sidebar.reply"),
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
      button.setAttr("title", this.t("sidebar.confirmDelete"));
      button.setAttr("aria-label", this.t("sidebar.confirmDelete"));
      button.empty();
      button.createSpan({ text: this.t("sidebar.confirm") });
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
    const label = status === "synced" ? this.t("sidebar.syncedToLark") : status === "failed" ? this.t("sidebar.syncLarkFailed") : this.t("sidebar.syncToLark");
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
        button.setAttr("title", this.t("sidebar.confirmDelete"));
        button.setAttr("aria-label", this.t("sidebar.confirmDelete"));
        iconEl.empty();
        labelEl.setText(this.t("sidebar.confirm"));
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
      new import_obsidian8.Notice(this.t("notice.syncedToLark"));
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
function formatReplyTime(value, t) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const diffMs = Date.now() - timestamp;
  if (diffMs < 6e4) {
    return t("sidebar.justNow");
  }
  if (diffMs < 36e5) {
    return t("sidebar.minutesAgo", { count: Math.floor(diffMs / 6e4) });
  }
  if (diffMs < 864e5) {
    return t("sidebar.hoursAgo", { count: Math.floor(diffMs / 36e5) });
  }
  return new Date(timestamp).toLocaleDateString();
}

// src/lark-bridge.ts
var import_obsidian9 = require("obsidian");

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

// src/lark-cli-bridge.ts
async function executeLarkCliCommand(syncPlugin, args, missingCommandMessage) {
  const runLarkCliCommand = (syncPlugin == null ? void 0 : syncPlugin.runLarkCliCommand) || (syncPlugin == null ? void 0 : syncPlugin.runLarkCli);
  if (!runLarkCliCommand) {
    throw new Error(missingCommandMessage);
  }
  return await runLarkCliCommand.call(syncPlugin, args);
}
function buildLarkReplyListArgs(fileToken, commentId) {
  return [
    "drive",
    "file.comment.replys",
    "list",
    "--as",
    "user",
    "--file-token",
    fileToken,
    "--file-type",
    "docx",
    "--comment-id",
    commentId,
    "--page-size",
    "100",
    "--json"
  ];
}
function getLarkReplyIds(result) {
  var _a;
  const items = ((_a = result.data) == null ? void 0 : _a.items) || result.items || [];
  return items.map((item) => item.reply_id || "").filter(Boolean);
}
function assertLarkCommandOk(result, fallbackMessage) {
  var _a, _b;
  if (result.ok === false) {
    throw new Error(((_a = result.error) == null ? void 0 : _a.message) || ((_b = result.error) == null ? void 0 : _b.hint) || fallbackMessage);
  }
}

// src/lark-bridge.ts
var LARK_SYNC_PLUGIN_ID = "feishu-lark-cli-sync";
var SYNC_STATE_FILE = "lark-sync-state.json";
async function syncMarkToLark(plugin, file, source, mark) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const binding = readLarkBinding(source);
  if (!binding.doc) {
    throw new Error(plugin.t("error.noLarkBinding"));
  }
  const replies = getReplies(plugin, mark);
  if ((_a = mark.remote) == null ? void 0 : _a.larkCommentId) {
    return await syncRepliesToExistingLarkComment(plugin, binding, mark, replies);
  }
  const syncState = await readSyncState(plugin);
  const docState = findDocumentState(syncState, binding.doc);
  if (!docState || !docState.titleBlockId && !docState.units.length) {
    throw new Error(plugin.t("error.noLarkBlockMap"));
  }
  const blockId = findRemoteBlockId(
    source,
    docState.units,
    mark.anchor.startOffset,
    mark.anchor.endOffset,
    docState.titleBlockId
  );
  if (!blockId) {
    throw new Error(plugin.t("error.noLarkBlock"));
  }
  const [firstReply, ...restReplies] = replies.length ? replies : [{ content: plugin.t("lark.emptyComment") }];
  const result = await runLarkCreateComment(plugin, {
    doc: binding.doc,
    blockId,
    content: buildCommentElements(firstReply.content)
  });
  if (!result.ok) {
    throw new Error(((_b = result.error) == null ? void 0 : _b.message) || ((_c = result.error) == null ? void 0 : _c.hint) || plugin.t("error.larkCreateCommentFailed"));
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
        throw new Error(((_f = replyResult.error) == null ? void 0 : _f.message) || ((_g = replyResult.error) == null ? void 0 : _g.hint) || plugin.t("error.larkCreateReplyFailed"));
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
  const { doc, commentId } = getRemoteCommentReference(plugin, mark);
  const result = await runLarkPatchComment(plugin, { doc, commentId, isSolved });
  assertLarkCommandOk(result, plugin.t("error.larkUpdateCommentFailed"));
}
async function deleteLarkComment(plugin, mark) {
  const { doc, commentId } = getRemoteCommentReference(plugin, mark);
  const storedReplyIds = getDeleteAllLarkReplyIds(mark.remote);
  const replies = getReplies(plugin, mark);
  const idsToDelete = storedReplyIds.length >= replies.length ? storedReplyIds : await findLarkReplyIds(plugin, doc, commentId);
  if (idsToDelete.length === 0) {
    throw new Error(plugin.t("error.missingLarkReplyId"));
  }
  for (const replyId of [...idsToDelete].reverse()) {
    const result = await runLarkDeleteReply(plugin, { doc, commentId, replyId });
    assertLarkCommandOk(result, plugin.t("error.larkDeleteReplyFailed"));
  }
}
async function deleteLarkCommentReply(plugin, mark, replyId) {
  var _a, _b;
  const { doc, commentId } = getRemoteCommentReference(plugin, mark);
  const replies = getReplies(plugin, mark);
  const replyIndex = replies.findIndex((reply) => reply.id === replyId);
  if (replyIndex === -1) {
    throw new Error(plugin.t("error.localReplyNotFound"));
  }
  const syncedReplyCount = findSyncedReplyCount(plugin, mark, replies);
  if (replyIndex >= syncedReplyCount) {
    return null;
  }
  const storedReplyIds = getStoredLarkReplyIdList(mark.remote);
  const shouldUseLegacyLastReplyId = replyIndex === syncedReplyCount - 1 && Boolean((_a = mark.remote) == null ? void 0 : _a.larkReplyId);
  const remoteReplyIds = storedReplyIds.length >= syncedReplyCount || shouldUseLegacyLastReplyId ? storedReplyIds : await findLarkReplyIds(plugin, doc, commentId);
  const remoteReplyId = remoteReplyIds[replyIndex] || (replyIndex === syncedReplyCount - 1 ? (_b = mark.remote) == null ? void 0 : _b.larkReplyId : "");
  if (!remoteReplyId) {
    throw new Error(plugin.t("error.missingRemoteReplyId"));
  }
  const result = await runLarkDeleteReply(plugin, { doc, commentId, replyId: remoteReplyId });
  assertLarkCommandOk(result, plugin.t("error.larkDeleteReplyFailed"));
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
function getRemoteCommentReference(plugin, mark) {
  var _a, _b, _c;
  const doc = ((_a = mark.remote) == null ? void 0 : _a.larkDocToken) || ((_b = mark.remote) == null ? void 0 : _b.larkDocUrl) || "";
  const commentId = ((_c = mark.remote) == null ? void 0 : _c.larkCommentId) || "";
  if (!doc || !commentId) {
    throw new Error(plugin.t("error.missingLarkCommentInfo"));
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
function getLarkSyncPluginStatusText(status, language = "zh-CN") {
  switch (status) {
    case "enabled":
      return translate(language, "lark.status.enabled");
    case "disabled":
      return translate(language, "lark.status.disabled");
    case "not-installed":
      return translate(language, "lark.status.notInstalled");
    case "unknown":
      return translate(language, "lark.status.unknown");
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
    throw new Error(plugin.t("error.missingLarkCommentId"));
  }
  const syncedReplyCount = findSyncedReplyCount(plugin, mark, replies);
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
      throw new Error(((_c = result.error) == null ? void 0 : _c.message) || ((_d = result.error) == null ? void 0 : _d.hint) || plugin.t("error.larkCreateReplyFailed"));
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
function findSyncedReplyCount(plugin, mark, replies) {
  var _a;
  const syncedHash = (_a = mark.remote) == null ? void 0 : _a.syncedHash;
  if (syncedHash === void 0) {
    throw new Error(plugin.t("error.missingSyncRecord"));
  }
  const syncedThreadContent = readSyncedThreadContent(syncedHash, mark.anchor.selectedText);
  if (syncedThreadContent === null) {
    throw new Error(plugin.t("error.commentAnchorChanged"));
  }
  for (let index = 0; index <= replies.length; index++) {
    if (getThreadContent(replies.slice(0, index)) === syncedThreadContent) {
      return index;
    }
  }
  throw new Error(plugin.t("error.syncedCommentChanged"));
}
function readSyncedThreadContent(syncedHash, selectedText) {
  const prefix = `${selectedText}
`;
  if (!syncedHash.startsWith(prefix)) {
    return null;
  }
  return syncedHash.slice(prefix.length);
}
function getReplies(plugin, mark) {
  var _a;
  return ((_a = mark.replies) == null ? void 0 : _a.length) ? mark.replies : mark.note.content.trim() ? [{
    authorName: plugin.settings.commentAuthorName,
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
    return normalizeLarkCommentResult(plugin, await runLarkCliViaSyncPlugin(plugin, [
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
    return normalizeLarkCommentResult(plugin, await runLarkCliViaSyncPlugin(plugin, [
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
    const args = buildLarkReplyListArgs(extractDocumentToken(doc), commentId);
    const result = await runLarkCliViaSyncPlugin(plugin, args);
    assertLarkCommandOk(result, plugin.t("error.larkGetRepliesFailed"));
    return getLarkReplyIds(result);
  } catch (error) {
    const message = getExecErrorMessage(error);
    if (message) {
      throw new Error(message);
    }
    throw error;
  }
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
    throw new Error(plugin.t("error.larkPluginUnavailable", {
      status: getLarkSyncPluginStatusText(status, plugin.settings.language)
    }));
  }
  const syncPlugin = getLarkSyncPluginBridge(plugin);
  return await executeLarkCliCommand(syncPlugin, args, plugin.t("error.larkPluginNoCli"));
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
function normalizeLarkCommentResult(plugin, result) {
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
      message: plugin.t("error.larkNoCommentId")
    }
  };
}

// src/reading-view-renderer.ts
var READING_BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th, dt, dd";
var ANCHOR_CONTEXT_LENGTH = 40;
var originalReadingMarks = /* @__PURE__ */ new WeakMap();
function renderReadingMarks(container, source, marks, onClick) {
  clearReadingMarks(container);
  const activeMarks = marks.map((mark, sourceIndex) => ({
    mark,
    sourceIndex,
    specificityMark: originalReadingMarks.get(mark) || mark
  })).filter(({ mark }) => mark.status !== "orphaned" && mark.status !== "resolved" && mark.anchor.selectedText);
  const ranges = collectTextNodes(container);
  const fullText = ranges.map((range) => range.separatorBefore + range.node.data).join("");
  const plannedMarks = activeMarks.map(({ mark, sourceIndex, specificityMark }) => {
    const match = findBestRenderedMatch(fullText, mark);
    return match ? { mark, match, sourceIndex, specificityMark } : null;
  }).filter((item) => item !== null);
  applyReadingMarkFragments(ranges, plannedMarks, onClick);
  promoteFullyMarkedInlineCodeElements(container);
}
function clearReadingMarks(container) {
  const inlineElements = Array.from(container.querySelectorAll(".side-mark-reading-inline-content"));
  for (const element of inlineElements) {
    element.classList.remove("side-mark-reading-inline-content");
    if (!element.className) {
      element.removeAttribute("class");
    }
  }
  const wrappers = Array.from(container.querySelectorAll(".side-mark-reading"));
  for (const wrapper of wrappers.reverse()) {
    wrapper.replaceWith(...Array.from(wrapper.childNodes));
  }
  container.normalize();
}
function applyReadingMarkFragments(ranges, plannedMarks, onClick) {
  for (const range of ranges) {
    const segments = planNodeSegments(range, plannedMarks);
    if (segments.length === 0) {
      continue;
    }
    replaceTextNodeWithSegments(range.node, segments, onClick);
  }
}
function promoteFullyMarkedInlineCodeElements(container) {
  const codeElements = Array.from(container.querySelectorAll("code")).filter((code) => !code.closest("pre"));
  for (const code of codeElements) {
    const commonWrappers = getCommonReadingMarkWrappers(code);
    if (!commonWrappers.some(hasContinuousReadingPaint)) {
      continue;
    }
    for (const wrapper of commonWrappers) {
      const markId = wrapper.dataset.sideMarkReadingId;
      const fragments = Array.from(code.querySelectorAll(".side-mark-reading")).filter((fragment) => fragment.dataset.sideMarkReadingId === markId);
      for (const fragment of fragments.reverse()) {
        fragment.replaceWith(...Array.from(fragment.childNodes));
      }
      code.replaceWith(wrapper);
      wrapper.append(code);
    }
    code.classList.add("side-mark-reading-inline-content");
  }
}
function getCommonReadingMarkWrappers(code) {
  var _a;
  const nodeFilter = (_a = code.ownerDocument.defaultView) == null ? void 0 : _a.NodeFilter;
  if (!nodeFilter) {
    return [];
  }
  const walker = code.ownerDocument.createTreeWalker(code, nodeFilter.SHOW_TEXT);
  const wrapperPaths = [];
  let node = walker.nextNode();
  while (node) {
    if (node.data.length > 0) {
      const wrappers = [];
      let element = node.parentElement;
      while (element && element !== code) {
        if (element.classList.contains("side-mark-reading")) {
          wrappers.push(element);
        }
        element = element.parentElement;
      }
      wrapperPaths.push(wrappers);
    }
    node = walker.nextNode();
  }
  if (wrapperPaths.length === 0) {
    return [];
  }
  const commonMarkIds = new Set(wrapperPaths[0].map((wrapper) => wrapper.dataset.sideMarkReadingId));
  for (const wrappers of wrapperPaths.slice(1)) {
    const markIds = new Set(wrappers.map((wrapper) => wrapper.dataset.sideMarkReadingId));
    for (const markId of commonMarkIds) {
      if (!markIds.has(markId)) {
        commonMarkIds.delete(markId);
      }
    }
  }
  return wrapperPaths[0].filter((wrapper) => commonMarkIds.has(wrapper.dataset.sideMarkReadingId)).reverse();
}
function hasContinuousReadingPaint(wrapper) {
  return wrapper.classList.contains("side-mark-reading-continuous-paint");
}
function planNodeSegments(range, plannedMarks) {
  const intersections = plannedMarks.map((item) => intersectMarkWithNode(range, item)).filter((intersection) => intersection !== null);
  if (intersections.length === 0) {
    return [];
  }
  const boundaries = Array.from(new Set(intersections.flatMap((intersection) => [intersection.start, intersection.end]))).sort((left, right) => left - right);
  const segments = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index] || 0;
    const end = boundaries[index + 1] || start;
    const items = intersections.filter((intersection) => intersection.start < end && intersection.end > start).map((intersection) => intersection.item).sort(compareReadingMarkSpecificity);
    if (start < end && items.length > 0) {
      segments.push({ start, end, items });
    }
  }
  return segments;
}
function intersectMarkWithNode(range, item) {
  const start = Math.max(range.start, item.match.start);
  const end = Math.min(range.end, item.match.end);
  if (start >= end) {
    return null;
  }
  return {
    item,
    start: start - range.start,
    end: end - range.start
  };
}
function compareReadingMarkSpecificity(left, right) {
  return compareMarkRangeSpecificity(
    left.specificityMark,
    right.specificityMark,
    left.sourceIndex,
    right.sourceIndex
  );
}
function replaceTextNodeWithSegments(node, segments, onClick) {
  const document = node.ownerDocument;
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const segment of segments) {
    if (cursor < segment.start) {
      fragment.append(document.createTextNode(node.data.slice(cursor, segment.start)));
    }
    let content = document.createTextNode(node.data.slice(segment.start, segment.end));
    for (const item of segment.items) {
      const wrapper = createReadingMarkWrapper(document, item.mark, onClick);
      wrapper.append(content);
      content = wrapper;
    }
    fragment.append(content);
    cursor = segment.end;
  }
  if (cursor < node.data.length) {
    fragment.append(document.createTextNode(node.data.slice(cursor)));
  }
  node.replaceWith(fragment);
}
function createReadingMarkWrapper(document, mark, onClick) {
  const wrapper = document.createElement("span");
  wrapper.className = [
    "side-mark",
    "side-mark-reading",
    hasContinuousMarkPaint(mark) ? "side-mark-reading-continuous-paint" : "",
    `side-mark--${mark.mark.kind}`,
    `side-mark--${mark.mark.color}`,
    `side-mark--text-${mark.mark.textColor}`,
    `side-mark--background-${mark.mark.backgroundColor}`
  ].filter(Boolean).join(" ");
  wrapper.dataset.sideMarkReadingId = mark.id;
  wrapper.title = mark.note.content || "FloatMark";
  wrapper.addEventListener("click", (event) => {
    const hasTextSelection = hasNonEmptyDomSelection(wrapper.ownerDocument.getSelection());
    if (!shouldOpenMarkForSelection(hasTextSelection)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onClick(mark.id, wrapper.getBoundingClientRect());
  });
  return wrapper;
}
function collectTextNodes(container) {
  var _a, _b, _c;
  const nodes = [];
  const nodeFilter = (_a = container.ownerDocument.defaultView) == null ? void 0 : _a.NodeFilter;
  if (!nodeFilter) {
    return nodes;
  }
  const walker = container.ownerDocument.createTreeWalker(container, nodeFilter.SHOW_TEXT, {
    acceptNode(node2) {
      var _a2;
      const parent = node2.parentElement;
      if (!parent || parent.closest(".side-mark-reading")) {
        return nodeFilter.FILTER_REJECT;
      }
      if (parent.closest("script, style")) {
        return nodeFilter.FILTER_REJECT;
      }
      if ((_a2 = node2.textContent) == null ? void 0 : _a2.trim()) {
        return nodeFilter.FILTER_ACCEPT;
      }
      return node2.textContent && parent.closest(READING_BLOCK_SELECTOR) ? nodeFilter.FILTER_ACCEPT : nodeFilter.FILTER_SKIP;
    }
  });
  const textNodes = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node);
    node = walker.nextNode();
  }
  const nextContentBlocks = new Array(textNodes.length).fill(null);
  let nextContentBlock = null;
  for (let index = textNodes.length - 1; index >= 0; index -= 1) {
    nextContentBlocks[index] = nextContentBlock;
    const text = textNodes[index];
    if (text == null ? void 0 : text.data.trim()) {
      nextContentBlock = ((_b = text.parentElement) == null ? void 0 : _b.closest(READING_BLOCK_SELECTOR)) || null;
    }
  }
  let previousContentBlock = null;
  const acceptedNodes = textNodes.filter((text, index) => {
    var _a2, _b2;
    if (text.data.trim()) {
      previousContentBlock = ((_a2 = text.parentElement) == null ? void 0 : _a2.closest(READING_BLOCK_SELECTOR)) || null;
      return true;
    }
    const block = (_b2 = text.parentElement) == null ? void 0 : _b2.closest(READING_BLOCK_SELECTOR);
    return Boolean(block && previousContentBlock === block && nextContentBlocks[index] === block);
  });
  let offset = 0;
  let previousBlock = null;
  let previousText = null;
  for (const text of acceptedNodes) {
    const block = ((_c = text.parentElement) == null ? void 0 : _c.closest(READING_BLOCK_SELECTOR)) || text.parentElement;
    const hasStructuralBreak = previousText ? hasLineBreakBetween(previousText, text) : false;
    const separatorBefore = nodes.length > 0 && (block !== previousBlock || hasStructuralBreak) ? "\n" : "";
    offset += separatorBefore.length;
    const length = text.data.length;
    nodes.push({ node: text, start: offset, end: offset + length, separatorBefore });
    offset += length;
    previousBlock = block;
    previousText = text;
  }
  return nodes;
}
function hasLineBreakBetween(previous, current) {
  const range = previous.ownerDocument.createRange();
  range.setStart(previous, previous.data.length);
  range.setEnd(current, 0);
  return Boolean(range.cloneContents().querySelector("br"));
}
function buildSourceLineStarts(source) {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }
  return lineStarts;
}
function getReadingMarksForSection(source, marks, sectionLineStart, sectionLineEnd, lineStarts = buildSourceLineStarts(source)) {
  const sectionStartOffset = getLineStartOffset(source, lineStarts, sectionLineStart);
  const sectionEndOffset = getLineStartOffset(source, lineStarts, sectionLineEnd + 1);
  return marks.map((mark) => clipMarkToSection(
    source,
    lineStarts,
    mark,
    sectionStartOffset,
    sectionEndOffset,
    sectionLineStart
  )).filter((mark) => mark !== null);
}
function clipMarkToSection(source, lineStarts, mark, sectionStartOffset, sectionEndOffset, sectionLineStart) {
  const start = Math.max(mark.anchor.startOffset, sectionStartOffset);
  const end = Math.min(mark.anchor.endOffset, sectionEndOffset);
  if (start >= end) {
    return null;
  }
  const startPosition = offsetToLineColumn2(lineStarts, start);
  const endPosition = offsetToLineColumn2(lineStarts, end);
  const clippedMark = {
    ...mark,
    anchor: {
      startOffset: start,
      endOffset: end,
      selectedText: source.slice(start, end),
      prefix: source.slice(Math.max(0, start - ANCHOR_CONTEXT_LENGTH), start),
      suffix: source.slice(end, end + ANCHOR_CONTEXT_LENGTH),
      position: {
        lineStart: Math.max(1, startPosition.line - sectionLineStart),
        lineEnd: Math.max(1, endPosition.line - sectionLineStart),
        columnStart: startPosition.column,
        columnEnd: endPosition.column
      }
    }
  };
  originalReadingMarks.set(clippedMark, originalReadingMarks.get(mark) || mark);
  return clippedMark;
}
function getLineStartOffset(source, lineStarts, zeroBasedLine) {
  var _a;
  return (_a = lineStarts[zeroBasedLine]) != null ? _a : source.length;
}
function offsetToLineColumn2(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineStart = lineStarts[middle] || 0;
    if (lineStart <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const lineIndex = Math.max(0, high);
  return {
    line: lineIndex + 1,
    column: offset - (lineStarts[lineIndex] || 0) + 1
  };
}
function findBestRenderedMatch(renderedText, mark) {
  const context = getRenderedAnchorContext(mark);
  for (const selectedText of toRenderedTextCandidates(mark)) {
    const start = findBestRenderedTextStart(renderedText, selectedText, mark, context);
    if (start >= 0) {
      return { start, end: start + selectedText.length };
    }
    const flexibleMatch = findWhitespaceInsensitiveMatch(
      renderedText,
      selectedText,
      mark,
      context
    );
    if (flexibleMatch) {
      return flexibleMatch;
    }
  }
  return null;
}
function findBestRenderedTextStart(renderedText, selectedText, mark, context) {
  const preferredOffset = estimateRenderedPositionOffset(
    renderedText,
    mark.anchor.position.lineStart,
    mark.anchor.position.columnStart
  );
  return findBestTextStartNearOffset(renderedText, selectedText, preferredOffset, context);
}
function getRenderedAnchorContext(mark) {
  return {
    prefix: normalizeRenderedContext(stripMarkdownSyntax(mark.anchor.prefix)).slice(-80),
    suffix: normalizeRenderedContext(stripMarkdownSyntax(mark.anchor.suffix)).slice(0, 80)
  };
}
function normalizeRenderedContext(text) {
  return text.replace(/\s+/g, " ");
}
function findBestTextStartNearOffset(text, selectedText, preferredOffset, context) {
  const candidates = [];
  let searchFrom = 0;
  while (searchFrom <= text.length) {
    const index = text.indexOf(selectedText, searchFrom);
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
  return chooseBestCandidate(candidates, (start) => start + selectedText.length, text, preferredOffset, context);
}
function chooseBestCandidate(candidates, getEnd, text, preferredOffset, context) {
  return candidates.sort((left, right) => {
    const rightScore = scoreCandidate(right, getEnd(right), text, preferredOffset, context);
    const leftScore = scoreCandidate(left, getEnd(left), text, preferredOffset, context);
    return rightScore - leftScore;
  })[0] || candidates[0] || 0;
}
function scoreCandidate(start, end, text, preferredOffset, context) {
  const renderedPrefix = text.slice(Math.max(0, start - context.prefix.length), start);
  const renderedSuffix = text.slice(end, end + context.suffix.length);
  const contextScore = commonSuffixLength(renderedPrefix, context.prefix) + commonPrefixLength(renderedSuffix, context.suffix);
  const distanceScore = 1 / (1 + Math.abs(start - preferredOffset));
  return contextScore * 1e3 + distanceScore;
}
function commonSuffixLength(left, right) {
  let length = 0;
  while (length < left.length && length < right.length && left[left.length - length - 1] === right[right.length - length - 1]) {
    length += 1;
  }
  return length;
}
function commonPrefixLength(left, right) {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) {
    length += 1;
  }
  return length;
}
function toRenderedTextCandidates(mark) {
  const selectedText = mark.anchor.selectedText;
  const normalized = normalizeWhitespace(selectedText).trim();
  const stripped = normalizeWhitespace(stripMarkdownSyntax(selectedText)).trim();
  const truncatedCodeBoundaries = getTruncatedCodeBoundaries(mark);
  const boundaryStripped = truncatedCodeBoundaries ? normalizeWhitespace(stripMarkdownSyntax(selectedText, truncatedCodeBoundaries)).trim() : "";
  const candidates = [
    selectedText,
    normalized,
    stripped,
    boundaryStripped
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}
function stripMarkdownSyntax(text, truncatedBoundaries) {
  const sentinel = findUnusedSentinel(text);
  const protectedCodeContents = [];
  const protectedText = stripInlineCodeSyntax(text, truncatedBoundaries, (content) => {
    const index = protectedCodeContents.push(content) - 1;
    return `${sentinel}${index}${sentinel}`;
  });
  const stripped = protectedText.replace(/^[\t ]*(?:[-+*]|\d+[.)])[\t ]+/gm, "").replace(/^[\t ]{0,3}#{1,6}[\t ]+/gm, "").replace(/^[\t ]{0,3}>[\t ]?/gm, "").replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\]\([^)]+\)/g, "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/(^|[^\w])__([^\n]+?)__(?=$|[^\w])/g, "$1$2").replace(/\*([^*\n]+)\*/g, "$1").replace(/(^|[^\w])_([^\n]+?)_(?=$|[^\w])/g, "$1$2").replace(/~~(.*?)~~/g, "$1").replace(/<[^>]+>/g, "");
  const tokenPattern = new RegExp(`${escapeRegExp(sentinel)}(\\d+)${escapeRegExp(sentinel)}`, "gu");
  return stripped.replace(tokenPattern, (_match, index) => protectedCodeContents[Number(index)] || "");
}
function findUnusedSentinel(text) {
  const usedCharacters = new Set(text);
  const privateUseRanges = [[57344, 63743], [983040, 1048573], [1048576, 1114109]];
  for (const [start, end] of privateUseRanges) {
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      const candidate = String.fromCodePoint(codePoint);
      if (!usedCharacters.has(candidate)) {
        return candidate;
      }
    }
  }
  const fallbackCharacter = "\uE000";
  const occurrenceCount = Array.from(text).filter((character) => character === fallbackCharacter).length;
  return fallbackCharacter.repeat(occurrenceCount + 1);
}
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stripInlineCodeSyntax(text, truncatedBoundaries, protectContent) {
  var _a;
  const truncatedRuns = findTruncatedCodeRuns(text, truncatedBoundaries);
  const removableRuns = truncatedRuns.allStarts;
  const closingRuns = buildClosingCodeRuns(text, removableRuns);
  let result = "";
  let index = 0;
  const prefixStart = truncatedRuns.prefixClosingStarts.values().next().value;
  if (prefixStart !== void 0) {
    result += protectContent(text.slice(0, prefixStart));
    index = prefixStart + countCodeTicks(text, prefixStart);
  }
  while (index < text.length) {
    if (text[index] === "\\") {
      const backslashCount = countBackslashes(text, index);
      index += backslashCount;
      if (text[index] !== "`") {
        result += "\\".repeat(backslashCount);
        continue;
      }
      if (truncatedRuns.prefixClosingStarts.has(index)) {
        result += "\\".repeat(backslashCount);
        continue;
      }
      result += "\\".repeat(Math.floor(backslashCount / 2));
      if (backslashCount % 2 === 1) {
        result += "`";
        index += 1;
        continue;
      }
    }
    if (text[index] !== "`") {
      result += text[index];
      index += 1;
      continue;
    }
    const runLength = countCodeTicks(text, index);
    const contentStart = index + runLength;
    if (removableRuns.has(index)) {
      if (truncatedRuns.suffixOpeningStarts.has(index)) {
        result += protectContent(text.slice(contentStart));
        index = text.length;
        continue;
      }
      index = contentStart;
      continue;
    }
    const closingStart = (_a = closingRuns.get(index)) != null ? _a : -1;
    if (closingStart >= 0) {
      result += protectContent(text.slice(contentStart, closingStart));
      index = closingStart + runLength;
      continue;
    }
    result += "`".repeat(runLength);
    index = contentStart;
  }
  return result;
}
function findTruncatedCodeRuns(text, boundaries) {
  const allStarts = /* @__PURE__ */ new Set();
  const prefixClosingStarts = /* @__PURE__ */ new Set();
  const suffixOpeningStarts = /* @__PURE__ */ new Set();
  if (!boundaries) {
    return { allStarts, prefixClosingStarts, suffixOpeningStarts };
  }
  const allCodeRuns = findAllCodeTickRuns(text);
  const unescapedCodeRuns = findCodeTickRuns(text);
  if (boundaries.prefixRunLength > 0) {
    const prefixMatch = allCodeRuns.find((run) => run.length === boundaries.prefixRunLength);
    if (prefixMatch) {
      allStarts.add(prefixMatch.start);
      prefixClosingStarts.add(prefixMatch.start);
    }
  }
  if (boundaries.suffixRunLength > 0) {
    const suffixMatch = findLastCodeRunByLength(unescapedCodeRuns, boundaries.suffixRunLength, allStarts);
    if (suffixMatch) {
      allStarts.add(suffixMatch.start);
      suffixOpeningStarts.add(suffixMatch.start);
    }
  }
  return { allStarts, prefixClosingStarts, suffixOpeningStarts };
}
function findCodeTickRuns(text) {
  const runs = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] === "\\") {
      const backslashCount = countBackslashes(text, index);
      index += backslashCount;
      if (text[index] !== "`") {
        continue;
      }
      if (backslashCount % 2 === 1) {
        index += 1;
        continue;
      }
    }
    if (text[index] !== "`") {
      index += 1;
      continue;
    }
    const runLength = countCodeTicks(text, index);
    runs.push({ start: index, length: runLength });
    index += runLength;
  }
  return runs;
}
function findLastCodeRunByLength(runs, length, excludedStarts) {
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    if (runs[index].length === length && !excludedStarts.has(runs[index].start)) {
      return runs[index];
    }
  }
  return void 0;
}
function buildClosingCodeRuns(text, excludedStarts) {
  const closingStartsByLength = /* @__PURE__ */ new Map();
  for (const run of findAllCodeTickRuns(text)) {
    if (excludedStarts.has(run.start)) {
      continue;
    }
    const starts = closingStartsByLength.get(run.length) || [];
    starts.push(run.start);
    closingStartsByLength.set(run.length, starts);
  }
  const closingStartByOpeningStart = /* @__PURE__ */ new Map();
  for (const run of findCodeTickRuns(text)) {
    if (excludedStarts.has(run.start)) {
      continue;
    }
    const starts = closingStartsByLength.get(run.length) || [];
    const closingStart = findFirstStartAtOrAfter(starts, run.start + run.length);
    if (closingStart !== void 0) {
      closingStartByOpeningStart.set(run.start, closingStart);
    }
  }
  return closingStartByOpeningStart;
}
function findFirstStartAtOrAfter(starts, minimum) {
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] < minimum) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return starts[low];
}
function findAllCodeTickRuns(text) {
  const runs = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] !== "`") {
      index += 1;
      continue;
    }
    const length = countCodeTicks(text, index);
    runs.push({ start: index, length });
    index += length;
  }
  return runs;
}
function countBackslashes(text, start) {
  let end = start;
  while (text[end] === "\\") {
    end += 1;
  }
  return end - start;
}
function countCodeTicks(text, start) {
  let end = start;
  while (text[end] === "`") {
    end += 1;
  }
  return end - start;
}
function getTruncatedCodeBoundaries(mark) {
  const prefixRunLength = getBoundaryCodeRunLength(mark.anchor.prefix, "end");
  const suffixRunLength = getBoundaryCodeRunLength(mark.anchor.suffix, "start");
  return prefixRunLength > 0 || suffixRunLength > 0 ? { prefixRunLength, suffixRunLength } : void 0;
}
function getBoundaryCodeRunLength(text, side) {
  if (side === "start") {
    return text[0] === "`" ? countCodeTicks(text, 0) : 0;
  }
  let start = text.length;
  while (start > 0 && text[start - 1] === "`") {
    start -= 1;
  }
  if (start === text.length || isEscapedAt(text, start)) {
    return 0;
  }
  return text.length - start;
}
function isEscapedAt(text, index) {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}
function normalizeWhitespace(text) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
}
function findWhitespaceInsensitiveMatch(renderedText, selectedText, mark, context) {
  const rendered = buildNonWhitespaceIndex(renderedText);
  const selected = selectedText.replace(/\s+/g, "");
  if (!selected) {
    return null;
  }
  const preferredOriginalOffset = estimateRenderedPositionOffset(
    renderedText,
    mark.anchor.position.lineStart,
    mark.anchor.position.columnStart
  );
  const candidates = [];
  let searchFrom = 0;
  while (searchFrom <= rendered.text.length) {
    const index = rendered.text.indexOf(selected, searchFrom);
    if (index < 0) {
      break;
    }
    candidates.push(index);
    searchFrom = index + Math.max(1, selected.length);
  }
  if (candidates.length === 0) {
    return null;
  }
  const start = candidates.sort((left, right) => {
    var _a, _b;
    const leftStart = rendered.offsets[left] || 0;
    const rightStart = rendered.offsets[right] || 0;
    const leftEnd = ((_a = rendered.offsets[left + selected.length - 1]) != null ? _a : leftStart) + 1;
    const rightEnd = ((_b = rendered.offsets[right + selected.length - 1]) != null ? _b : rightStart) + 1;
    const rightScore = scoreCandidate(rightStart, rightEnd, renderedText, preferredOriginalOffset, context);
    const leftScore = scoreCandidate(leftStart, leftEnd, renderedText, preferredOriginalOffset, context);
    return rightScore - leftScore;
  })[0] || candidates[0] || 0;
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
function estimateRenderedPositionOffset(renderedText, lineNumber, columnNumber) {
  var _a;
  if (lineNumber <= 1) {
    return Math.min(renderedText.length, Math.max(0, columnNumber - 1));
  }
  const lines = renderedText.split(/\n/);
  let offset = 0;
  for (let index = 0; index < Math.min(lineNumber - 1, lines.length); index += 1) {
    offset += (((_a = lines[index]) == null ? void 0 : _a.length) || 0) + 1;
  }
  return Math.min(renderedText.length, offset + Math.max(0, columnNumber - 1));
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
    this.ribbonIconEl = null;
    this.registeredCommandIds = [];
    this.activeEditorView = null;
    this.pendingCommentSelection = null;
    this.readingSelection = null;
    this.readingSelectionTimer = null;
    this.readingSelectionRequestId = 0;
    this.lastMarkdownFilePath = "";
    this.previewObservers = /* @__PURE__ */ new Map();
    this.previewRenderTimers = /* @__PURE__ */ new Map();
    this.previewRenderGenerations = /* @__PURE__ */ new Map();
    this.readingContainerGenerations = /* @__PURE__ */ new WeakMap();
    this.sourceLineStartsCache = /* @__PURE__ */ new Map();
  }
  async onload() {
    await this.loadSettings();
    (0, import_obsidian10.addIcon)(FLOAT_MARK_ICON_ID, FLOAT_MARK_ICON_SVG);
    this.store = new SideMarkStore(this.app, this.settings);
    this.createFloatingControls();
    this.registerEditorExtension(createSideMarkEditorExtension(this));
    this.registerMarkdownPostProcessor((element, context) => {
      void this.renderReadingModeMarks(element, context.sourcePath, context);
    });
    this.registerView(SIDE_MARK_VIEW_TYPE, (leaf) => new SideMarkSidebarView(leaf, this));
    this.ribbonIconEl = this.addRibbonIcon(FLOAT_MARK_ICON_ID, this.t("app.openSidebar"), () => void this.openSidebar());
    this.registerLocalizedCommands();
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
    this.settingTab = new SideMarkSettingTab(this);
    this.addSettingTab(this.settingTab);
    await this.reloadCurrentDocument();
    this.syncPreviewMarkObservers();
  }
  onunload() {
    var _a, _b, _c, _d, _e;
    this.clearPreviewMarkObservers();
    this.sourceLineStartsCache.clear();
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
    const hasSavedLanguage = (saved == null ? void 0 : saved.language) === "zh-CN" || (saved == null ? void 0 : saved.language) === "en";
    const language = hasSavedLanguage ? saved.language : getInitialPluginLanguage(this.app, (0, import_obsidian10.getLanguage)());
    const commentAuthorName = (saved == null ? void 0 : saved.commentAuthorName) || getDefaultCommentAuthorName(language);
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved || {},
      language,
      commentAuthorName
    };
    if (!hasSavedLanguage) {
      await this.saveData(this.settings);
    }
  }
  async saveSettings() {
    var _a;
    await this.saveData(this.settings);
    (_a = this.store) == null ? void 0 : _a.updateSettings(this.settings);
  }
  t(key, params) {
    return translate(this.settings.language, key, params);
  }
  async setLanguage(language) {
    const nextLanguage = normalizePluginLanguage(language, "zh-CN");
    if (this.settings.language === nextLanguage) {
      return;
    }
    this.settings.language = nextLanguage;
    await this.saveSettings();
    await this.refreshLanguage();
  }
  async refreshLanguage() {
    var _a, _b, _c, _d, _e, _f;
    (_a = this.toolbar) == null ? void 0 : _a.destroy();
    (_b = this.readingToolbar) == null ? void 0 : _b.destroy();
    (_c = this.blockToolbar) == null ? void 0 : _c.destroy();
    (_d = this.commentPopover) == null ? void 0 : _d.destroy();
    (_e = this.markStylePopover) == null ? void 0 : _e.destroy();
    this.createFloatingControls();
    this.refreshRibbonTooltip();
    this.refreshLocalizedCommands();
    (_f = this.settingTab) == null ? void 0 : _f.display();
    await this.refreshSidebar();
  }
  registerLocalizedCommands() {
    this.registerCommand({
      id: "open-side-mark-sidebar",
      name: this.t("app.openSidebar"),
      callback: () => void this.openSidebar()
    });
    this.registerCommand({
      id: "create-side-comment",
      name: this.t("app.createCommentFromSelection"),
      editorCallback: (_editor) => void this.createCommentFromActiveSelection("")
    });
  }
  registerCommand(command) {
    const registeredCommand = this.addCommand(command);
    this.registeredCommandIds.push(registeredCommand.id);
  }
  refreshLocalizedCommands() {
    for (const commandId of this.registeredCommandIds) {
      this.removeCommand(commandId);
    }
    this.registeredCommandIds = [];
    this.registerLocalizedCommands();
  }
  refreshRibbonTooltip() {
    var _a, _b;
    const label = this.t("app.openSidebar");
    (_a = this.ribbonIconEl) == null ? void 0 : _a.setAttr("aria-label", label);
    (_b = this.ribbonIconEl) == null ? void 0 : _b.setAttr("title", label);
  }
  createFloatingControls() {
    this.toolbar = new SelectionToolbar((action) => void this.handleToolbarAction(action), (key) => this.t(key));
    this.readingToolbar = new ReadingSelectionToolbar((action) => void this.handleReadingToolbarAction(action), (key) => this.t(key));
    this.blockToolbar = new HoverBlockToolbar((action, target) => void this.handleBlockAction(action, target), (key) => this.t(key));
    this.commentPopover = new CommentPopover((key) => this.t(key));
    this.markStylePopover = new MarkStylePopover((key) => this.t(key));
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
      new import_obsidian10.Notice(this.t("notice.larkStatusSyncFailed", { message }), 8e3);
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
      new import_obsidian10.Notice(this.t("notice.larkDeleteCommentFailed", { message }), 8e3);
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
      new import_obsidian10.Notice(this.t("notice.larkDeleteReplyFailed", { message }), 8e3);
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
      new import_obsidian10.Notice(this.t("notice.blockCopied"));
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
      new import_obsidian10.Notice(this.t("notice.noEditorSelection"));
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
      new import_obsidian10.Notice(this.t("notice.autoSyncLarkFailed", { message }), 8e3);
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
    const generation = (this.readingContainerGenerations.get(container) || 0) + 1;
    this.readingContainerGenerations.set(container, generation);
    const file = this.app.vault.getFileByPath(sourcePath);
    if (!file || file.extension !== "md") {
      return;
    }
    const source = await this.app.vault.read(file);
    if (this.readingContainerGenerations.get(container) !== generation) {
      return;
    }
    const document = await this.store.relocateDocument(file.path, source);
    if (this.readingContainerGenerations.get(container) !== generation) {
      return;
    }
    const section = context == null ? void 0 : context.getSectionInfo(container);
    const lineStarts = this.getSourceLineStarts(file, source);
    const marks = section ? getReadingMarksForSection(source, document.marks, section.lineStart, section.lineEnd, lineStarts) : document.marks;
    renderReadingMarks(container, source, marks, (markId, rect) => void this.openMark(markId, rect));
  }
  syncPreviewMarkObservers() {
    var _a;
    const activeViews = /* @__PURE__ */ new Set();
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof import_obsidian10.MarkdownView && view.getMode() === "preview" && ((_a = view.file) == null ? void 0 : _a.extension) === "md") {
        activeViews.add(view);
        this.ensurePreviewObserver(view);
        this.schedulePreviewViewRender(view);
      }
    }
    for (const [view, state] of this.previewObservers) {
      if (!activeViews.has(view)) {
        state.observer.disconnect();
        this.previewObservers.delete(view);
        this.clearPreviewRenderTimer(view);
        this.previewRenderGenerations.delete(view);
      }
    }
  }
  ensurePreviewObserver(view) {
    const root = view.contentEl;
    const existing = this.previewObservers.get(view);
    if ((existing == null ? void 0 : existing.root) === root) {
      this.observePreviewState(existing);
      return existing;
    }
    existing == null ? void 0 : existing.observer.disconnect();
    const observer = new MutationObserver(() => this.schedulePreviewViewRender(view));
    const state = { root, observer, isObserving: false };
    this.previewObservers.set(view, state);
    this.observePreviewState(state);
    return state;
  }
  observePreviewState(state) {
    if (state.isObserving) {
      return;
    }
    state.observer.observe(state.root, { childList: true, subtree: true });
    state.isObserving = true;
  }
  disconnectPreviewState(state) {
    state.observer.disconnect();
    state.isObserving = false;
  }
  schedulePreviewViewRender(view) {
    this.clearPreviewRenderTimer(view);
    const generation = this.nextPreviewRenderGeneration(view);
    const timer = window.setTimeout(() => {
      this.previewRenderTimers.delete(view);
      void this.renderPreviewMarksForView(view, generation);
    }, 60);
    this.previewRenderTimers.set(view, timer);
  }
  clearPreviewRenderTimer(view) {
    const timer = this.previewRenderTimers.get(view);
    if (timer === void 0) {
      return;
    }
    window.clearTimeout(timer);
    this.previewRenderTimers.delete(view);
  }
  nextPreviewRenderGeneration(view) {
    const generation = (this.previewRenderGenerations.get(view) || 0) + 1;
    this.previewRenderGenerations.set(view, generation);
    return generation;
  }
  getSourceLineStarts(file, source) {
    const cached = this.sourceLineStartsCache.get(file.path);
    if ((cached == null ? void 0 : cached.mtime) === file.stat.mtime && cached.size === file.stat.size) {
      return cached.lineStarts;
    }
    const lineStarts = buildSourceLineStarts(source);
    this.sourceLineStartsCache.set(file.path, {
      mtime: file.stat.mtime,
      size: file.stat.size,
      lineStarts
    });
    return lineStarts;
  }
  clearPreviewMarkObservers() {
    for (const state of this.previewObservers.values()) {
      state.observer.disconnect();
    }
    this.previewObservers.clear();
    for (const timer of this.previewRenderTimers.values()) {
      window.clearTimeout(timer);
    }
    this.previewRenderTimers.clear();
    this.previewRenderGenerations.clear();
  }
  async renderPreviewMarksForFile(filePath) {
    var _a;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian10.MarkdownView) || ((_a = view.file) == null ? void 0 : _a.path) !== filePath || view.getMode() !== "preview") {
        continue;
      }
      this.clearPreviewRenderTimer(view);
      const generation = this.nextPreviewRenderGeneration(view);
      await this.renderPreviewMarksForView(view, generation);
    }
  }
  async renderPreviewMarksForView(view, generation) {
    const file = view.file;
    if (!file || file.extension !== "md" || view.getMode() !== "preview") {
      return;
    }
    const filePath = file.path;
    const source = await this.app.vault.read(file);
    if (!this.isCurrentPreviewRender(view, filePath, generation)) {
      return;
    }
    const document = await this.store.relocateDocument(file.path, source);
    if (!this.isCurrentPreviewRender(view, filePath, generation)) {
      return;
    }
    const onClick = (markId, rect) => void this.openMark(markId, rect);
    const observerState = this.ensurePreviewObserver(view);
    this.disconnectPreviewState(observerState);
    try {
      const sections = getPreviewSections(view);
      if (sections.length > 0) {
        const lineStarts = this.getSourceLineStarts(file, source);
        for (const section of sections) {
          const marks = getReadingMarksForSection(
            source,
            document.marks,
            section.lineStart,
            section.lineEnd,
            lineStarts
          );
          renderReadingMarks(section.el, source, marks, onClick);
        }
        return;
      }
      const previewRoot = getPreviewSectionsContainer(view);
      renderReadingMarks(previewRoot, source, document.marks, onClick);
    } finally {
      if (this.isCurrentPreviewRender(view, filePath, generation)) {
        this.ensurePreviewObserver(view);
      }
    }
  }
  isCurrentPreviewRender(view, filePath, generation) {
    var _a;
    return this.previewRenderGenerations.get(view) === generation && view.getMode() === "preview" && ((_a = view.file) == null ? void 0 : _a.path) === filePath;
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
    new import_obsidian10.Setting(containerEl).setName(this.plugin.t("settings.language.name")).setDesc(this.plugin.t("settings.language.desc")).addDropdown((dropdown) => {
      dropdown.addOption("zh-CN", this.plugin.t("settings.language.zh")).addOption("en", this.plugin.t("settings.language.en")).setValue(this.plugin.settings.language || "zh-CN").onChange(async (value) => {
        await this.plugin.setLanguage(value);
      });
    });
    new import_obsidian10.Setting(containerEl).setName(this.plugin.t("settings.autoOpenSidebar.name")).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.autoOpenSidebar).onChange(async (value) => {
        this.plugin.settings.autoOpenSidebar = value;
        await this.plugin.saveSettings();
      });
    });
    this.renderLarkSyncSetting(containerEl);
    new import_obsidian10.Setting(containerEl).setName(this.plugin.t("settings.commentAuthorName.name")).setDesc(this.plugin.t("settings.commentAuthorName.desc")).addText((text) => {
      text.setValue(this.plugin.settings.commentAuthorName).onChange(async (value) => {
        const language = this.plugin.settings.language || "zh-CN";
        this.plugin.settings.commentAuthorName = value.trim() || getDefaultCommentAuthorName(language);
        await this.plugin.saveSettings();
      });
    });
  }
  renderLarkSyncSetting(containerEl) {
    const status = getLarkSyncPluginStatus(this.plugin);
    const canEnableSync = status === "enabled";
    const setting = new import_obsidian10.Setting(containerEl).setName(this.plugin.t("settings.larkSync.name")).setDesc(this.plugin.t("settings.larkSync.desc")).addToggle((toggle) => {
      toggle.setValue(canEnableSync && this.plugin.settings.autoSyncToLark).onChange(async (value) => {
        if (value && !canEnableSync) {
          toggle.setValue(false);
          this.plugin.settings.autoSyncToLark = false;
          await this.plugin.saveSettings();
          new import_obsidian10.Notice(this.plugin.t("settings.larkSync.enableBlocked", {
            status: getLarkSyncPluginStatusText(status, this.plugin.settings.language)
          }), 8e3);
          return;
        }
        this.plugin.settings.autoSyncToLark = value;
        await this.plugin.saveSettings();
      });
    });
    const statusEl = setting.descEl.createDiv({
      cls: `side-mark-lark-sync-plugin-status ${getLarkSyncPluginStatusClass(status)}`,
      text: getLarkSyncPluginStatusText(status, this.plugin.settings.language)
    });
    statusEl.setAttr("aria-live", "polite");
  }
};
