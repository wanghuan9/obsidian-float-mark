import { setIcon } from "obsidian";

export type ToolbarAction =
	| "paragraph"
	| "heading-1"
	| "heading-2"
	| "heading-3"
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

interface ToolbarButton {
	id: ToolbarAction;
	icon: string;
	title: string;
}

interface FormatItem {
	id: ToolbarAction;
	icon?: string;
	label: string;
	shortcut?: string;
}

const FORMAT_ITEMS: FormatItem[] = [
	{ id: "paragraph", label: "正文", shortcut: "T" },
	{ id: "heading-1", label: "一级标题", shortcut: "H1" },
	{ id: "heading-2", label: "二级标题", shortcut: "H2" },
	{ id: "heading-3", label: "三级标题", shortcut: "H3" },
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

export class SelectionToolbar {
	private readonly el: HTMLDivElement;
	private readonly menu: HTMLDivElement;
	private readonly formatLabel: HTMLSpanElement;
	private hideTimer: number | null = null;
	private readonly pointerMoveHandler: (event: MouseEvent) => void;

	constructor(private readonly onAction: (action: ToolbarAction) => void) {
		this.el = document.body.createDiv({ cls: "side-mark-toolbar" });
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
		this.menu = document.body.createDiv({ cls: "side-mark-selection-menu" });
		this.menu.hide();
		this.menu.addEventListener("mousedown", (event) => event.preventDefault());
		this.menu.addEventListener("mouseenter", () => this.cancelHide());
		this.menu.addEventListener("mouseleave", () => this.scheduleHide());
		for (const item of FORMAT_ITEMS) {
			const row = this.menu.createEl("button", {
				cls: "side-mark-selection-menu-row",
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
			if (item.id === "paragraph") {
				setIcon(check, "check");
				row.addClass("is-active");
			}
			row.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.formatLabel.setText(item.shortcut || item.label);
				this.onAction(item.id);
				this.hide();
			});
		}
	}

	show(rect: DOMRect, boundary?: DOMRect): void {
		this.cancelHide();
		document.addEventListener("mousemove", this.pointerMoveHandler);
		this.el.show();
		this.el.removeClass("is-visible");
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
		document.removeEventListener("mousemove", this.pointerMoveHandler);
		this.el.removeClass("is-visible");
		this.menu.removeClass("is-open");
		window.setTimeout(() => {
			if (!this.el.hasClass("is-visible")) {
				this.el.hide();
			}
			if (!this.menu.hasClass("is-open")) {
				this.menu.hide();
			}
		}, 140);
	}

	isVisible(): boolean {
		return this.el.isShown() && this.el.hasClass("is-visible");
	}

	destroy(): void {
		this.cancelHide();
		document.removeEventListener("mousemove", this.pointerMoveHandler);
		this.el.remove();
		this.menu.remove();
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
		this.scheduleHide();
	}

	private toggleMenu(): void {
		if (this.menu.hasClass("is-open")) {
			this.menu.removeClass("is-open");
			window.setTimeout(() => {
				if (!this.menu.hasClass("is-open")) {
					this.menu.hide();
				}
			}, 120);
			return;
		}
		this.openMenu();
	}

	private openMenu(): void {
		this.cancelHide();
		const rect = this.el.getBoundingClientRect();
		this.menu.show();
		this.menu.style.left = `${clamp(rect.left, 8, window.innerWidth - this.menu.offsetWidth - 8)}px`;
		this.menu.style.top = `${clamp(rect.bottom + 8, 8, window.innerHeight - this.menu.offsetHeight - 8)}px`;
		window.requestAnimationFrame(() => this.menu.addClass("is-open"));
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, Math.max(min, max)));
}
