import { setIcon } from "obsidian";
import { getActiveBody } from "./dom-utils";

export type ToolbarAction =
	| "paragraph"
	| "heading-1"
	| "heading-2"
	| "heading-3"
	| "heading-4"
	| "heading-5"
	| "heading-6"
	| "number-list"
	| "bullet-list"
	| "task-list"
	| "quote"
	| "code-block"
	| "bold"
	| "italic"
	| "strike"
	| "underline"
	| "link"
	| "code"
	| "highlight"
	| "comment";

export type SelectionFormatAction = Extract<
	ToolbarAction,
	| "paragraph"
	| "heading-1"
	| "heading-2"
	| "heading-3"
	| "heading-4"
	| "heading-5"
	| "heading-6"
	| "number-list"
	| "bullet-list"
	| "task-list"
	| "quote"
	| "code-block"
>;

interface ToolbarButton {
	id: ToolbarAction;
	icon: string;
	title: string;
}

interface FormatItem {
	id?: ToolbarAction;
	icon?: string;
	label: string;
	shortcut?: string;
	submenu?: FormatItem[];
}

const HEADING_SUBMENU_ITEMS: FormatItem[] = [
	{ id: "heading-4", label: "四级标题", shortcut: "H4" },
	{ id: "heading-5", label: "五级标题", shortcut: "H5" },
	{ id: "heading-6", label: "六级标题", shortcut: "H6" }
];

const FORMAT_ITEMS: FormatItem[] = [
	{ id: "paragraph", label: "正文", shortcut: "T" },
	{ id: "heading-1", label: "一级标题", shortcut: "H1" },
	{ id: "heading-2", label: "二级标题", shortcut: "H2" },
	{ id: "heading-3", label: "三级标题", shortcut: "H3" },
	{ label: "其他标题", shortcut: "Hn", submenu: HEADING_SUBMENU_ITEMS },
	{ id: "number-list", icon: "list-ordered", label: "有序列表" },
	{ id: "bullet-list", icon: "list", label: "无序列表" },
	{ id: "task-list", icon: "square-check", label: "任务" },
	{ id: "code-block", icon: "braces", label: "代码块" },
	{ id: "quote", icon: "quote", label: "引用" }
];

const BUTTONS: ToolbarButton[] = [
	{ id: "bold", icon: "bold", title: "加粗" },
	{ id: "strike", icon: "strikethrough", title: "删除线" },
	{ id: "italic", icon: "italic", title: "斜体" },
	{ id: "underline", icon: "underline", title: "下划线" },
	{ id: "link", icon: "link", title: "链接" },
	{ id: "code", icon: "code", title: "行内代码" },
	{ id: "highlight", icon: "highlighter", title: "高亮标注" },
	{ id: "comment", icon: "message-square-text", title: "评论" }
];

const FORMAT_LABELS: Partial<Record<SelectionFormatAction, string>> = {
	paragraph: "T",
	"heading-1": "H1",
	"heading-2": "H2",
	"heading-3": "H3",
	"heading-4": "H4",
	"heading-5": "H5",
	"heading-6": "H6"
};

const FORMAT_ICONS: Partial<Record<SelectionFormatAction, string>> = {
	"number-list": "list-ordered",
	"bullet-list": "list",
	"task-list": "square-check",
	quote: "quote",
	"code-block": "braces"
};

export class SelectionToolbar {
	private readonly el: HTMLDivElement;
	private readonly menu: HTMLDivElement;
	private readonly submenu: HTMLDivElement;
	private readonly formatLabel: HTMLSpanElement;
	private readonly formatRows = new Map<SelectionFormatAction, HTMLButtonElement>();
	private hideTimer: number | null = null;
	private readonly pointerMoveHandler: (event: MouseEvent) => void;

	constructor(private readonly onAction: (action: ToolbarAction) => void) {
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
			attr: { type: "button", title: "格式", "aria-label": "格式" }
		});
		this.formatLabel = format.createSpan({ text: "正文" });
		const chevron = format.createSpan({ cls: "side-mark-toolbar-format-chevron" });
		setIcon(chevron, "chevron-down");
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
			setIcon(buttonEl, button.icon);
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
				setIcon(iconWrap, item.icon);
			} else {
				iconWrap.setText(item.shortcut || "");
			}
			row.createSpan({ cls: "side-mark-selection-menu-label", text: item.label });
			const check = row.createSpan({ cls: "side-mark-selection-menu-check" });
			if (item.submenu) {
				setIcon(check, "chevron-right");
				row.addEventListener("mouseenter", () => this.openSubmenu(row));
				row.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					this.openSubmenu(row);
				});
				continue;
			}
			if (item.id === "paragraph") {
				setIcon(check, "check");
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

	show(rect: DOMRect, boundary?: DOMRect, format = "paragraph" as SelectionFormatAction): void {
		this.cancelHide();
		this.el.doc.addEventListener("mousemove", this.pointerMoveHandler);
		this.el.show();
		this.el.removeClass("is-visible");
		this.closeSubmenu();
		this.setCurrentFormat(format);
		const width = this.el.offsetWidth;
		const height = this.el.offsetHeight;
		const minLeft = Math.max(8, boundary?.left ?? 8);
		const maxLeft = Math.min(window.innerWidth - width - 8, (boundary?.right ?? window.innerWidth - 8) - width);
		const left = clamp(rect.left + rect.width / 2 - width / 2, minLeft, maxLeft);
		const aboveTop = rect.top - height - 10;
		const belowTop = rect.bottom + 10;
		const minTop = Math.max(8, boundary?.top ?? 8);
		const maxTop = Math.min(window.innerHeight - height - 8, (boundary?.bottom ?? window.innerHeight - 8) - height);
		const preferredTop = aboveTop >= minTop ? aboveTop : belowTop;
		const top = clamp(preferredTop, minTop, maxTop);
		this.el.style.left = `${left}px`;
		this.el.style.top = `${top}px`;
		window.requestAnimationFrame(() => this.el.addClass("is-visible"));
	}

	hide(): void {
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

	isVisible(): boolean {
		return this.el.isShown() && this.el.hasClass("is-visible");
	}

	destroy(): void {
		this.cancelHide();
		this.el.doc.removeEventListener("mousemove", this.pointerMoveHandler);
		this.el.remove();
		this.menu.remove();
		this.submenu.remove();
	}

	private scheduleHide(): void {
		this.cancelHide();
		this.hideTimer = window.setTimeout(() => this.hide(), 260);
	}

	private cancelHide(): void {
		if (this.hideTimer !== null) {
			window.clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	}

	private handlePointerMove(event: MouseEvent): void {
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
		if (
			event.clientX >= safeRect.left &&
			event.clientX <= safeRect.right &&
			event.clientY >= safeRect.top &&
			event.clientY <= safeRect.bottom
		) {
			this.cancelHide();
			return;
		}
		if (
			menuRect &&
			event.clientX >= menuRect.left - 16 &&
			event.clientX <= menuRect.right + 16 &&
			event.clientY >= menuRect.top - 16 &&
			event.clientY <= menuRect.bottom + 16
		) {
			this.cancelHide();
			return;
		}
		if (
			submenuRect &&
			event.clientX >= submenuRect.left - 16 &&
			event.clientX <= submenuRect.right + 16 &&
			event.clientY >= submenuRect.top - 16 &&
			event.clientY <= submenuRect.bottom + 16
		) {
			this.cancelHide();
			return;
		}
		this.scheduleHide();
	}

	private toggleMenu(): void {
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

	private renderHeadingSubmenu(): void {
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

	private setCurrentFormat(format: SelectionFormatAction): void {
		this.formatLabel.empty();
		const icon = FORMAT_ICONS[format];
		if (icon) {
			setIcon(this.formatLabel, icon);
		} else {
			this.formatLabel.setText(FORMAT_LABELS[format] || "T");
		}
		for (const [action, row] of this.formatRows) {
			row.toggleClass("is-active", action === format);
		}
	}

	private openMenu(): void {
		this.cancelHide();
		const rect = this.el.getBoundingClientRect();
		this.menu.show();
		this.menu.style.left = `${clamp(rect.left, 8, window.innerWidth - this.menu.offsetWidth - 8)}px`;
		this.menu.style.top = `${clamp(rect.bottom + 8, 8, window.innerHeight - this.menu.offsetHeight - 8)}px`;
		window.requestAnimationFrame(() => this.menu.addClass("is-open"));
	}

	private openSubmenu(row: HTMLElement): void {
		const rowRect = row.getBoundingClientRect();
		this.submenu.show();
		const submenuWidth = this.submenu.offsetWidth;
		const submenuHeight = this.submenu.offsetHeight;
		const preferredLeft = rowRect.right + 8;
		const fallbackLeft = rowRect.left - submenuWidth - 8;
		const left = preferredLeft + submenuWidth <= window.innerWidth - 8 ? preferredLeft : fallbackLeft;
		this.submenu.style.left = `${clamp(left, 8, window.innerWidth - submenuWidth - 8)}px`;
		this.submenu.style.top = `${clamp(rowRect.top, 8, window.innerHeight - submenuHeight - 8)}px`;
		window.requestAnimationFrame(() => this.submenu.addClass("is-open"));
	}

	private closeSubmenu(): void {
		this.submenu.removeClass("is-open");
		window.setTimeout(() => {
			if (!this.submenu.hasClass("is-open")) {
				this.submenu.hide();
			}
		}, 120);
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, Math.max(min, max)));
}

function isSelectionFormatAction(action: ToolbarAction | undefined): action is SelectionFormatAction {
	return (
		action === "paragraph" ||
		action === "heading-1" ||
		action === "heading-2" ||
		action === "heading-3" ||
		action === "heading-4" ||
		action === "heading-5" ||
		action === "heading-6" ||
		action === "number-list" ||
		action === "bullet-list" ||
		action === "task-list" ||
		action === "quote" ||
		action === "code-block"
	);
}
