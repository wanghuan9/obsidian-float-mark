import { setIcon } from "obsidian";

export type HoverBlockAction =
	| "paragraph"
	| "heading-1"
	| "heading-2"
	| "heading-3"
	| "heading-4"
	| "heading-5"
	| "bullet-list"
	| "number-list"
	| "task-list"
	| "quote"
	| "code-block"
	| "comment"
	| "copy"
	| "delete";

export interface HoverBlockTarget {
	from: number;
	to: number;
	label: string;
	rect: DOMRect;
}

interface MenuButton {
	action: HoverBlockAction;
	icon?: string;
	label: string;
	shortcut?: string;
	compact?: boolean;
	danger?: boolean;
}

const FORMAT_BUTTONS: MenuButton[] = [
	{ action: "paragraph", label: "正文", shortcut: "T", compact: true },
	{ action: "heading-1", label: "一级标题", shortcut: "H1", compact: true },
	{ action: "heading-2", label: "二级标题", shortcut: "H2", compact: true },
	{ action: "heading-3", label: "三级标题", shortcut: "H3", compact: true },
	{ action: "heading-4", label: "其他标题", shortcut: "Hn", compact: true },
	{ action: "number-list", icon: "list-ordered", label: "有序列表" },
	{ action: "bullet-list", icon: "list", label: "无序列表" },
	{ action: "task-list", icon: "square-check", label: "任务" },
	{ action: "code-block", icon: "braces", label: "代码块" },
	{ action: "quote", icon: "quote", label: "引用" }
];

const ACTION_BUTTONS: MenuButton[] = [
	{ action: "comment", icon: "message-square-text", label: "评论" },
	{ action: "copy", icon: "copy", label: "复制" },
	{ action: "delete", icon: "trash-2", label: "删除", danger: true }
];

export class HoverBlockToolbar {
	private readonly pill: HTMLDivElement;
	private readonly menu: HTMLDivElement;
	private readonly pointerMoveHandler: (event: MouseEvent) => void;
	private target: HoverBlockTarget | null = null;
	private hideTimer: number | null = null;
	private openTimer: number | null = null;

	constructor(private readonly onAction: (action: HoverBlockAction, target: HoverBlockTarget) => void) {
		this.pointerMoveHandler = (event) => this.handlePointerMove(event);
		this.pill = document.body.createDiv({ cls: "side-mark-block-pill" });
		this.pill.hide();
		this.pill.addEventListener("mousedown", (event) => event.preventDefault());
		this.pill.addEventListener("mouseenter", () => this.scheduleOpen());
		this.pill.addEventListener("mouseleave", () => this.scheduleHide());

		const label = this.pill.createEl("button", {
			cls: "side-mark-block-pill-label",
			attr: { type: "button", "aria-label": "块格式" }
		});
		this.pill.createDiv({
			cls: "side-mark-block-pill-arrow",
		});
		const drag = this.pill.createDiv({ cls: "side-mark-block-pill-drag" });
		setIcon(drag, "grip-vertical");

		this.menu = document.body.createDiv({ cls: "side-mark-block-menu" });
		this.menu.hide();
		this.menu.addEventListener("mousedown", (event) => event.preventDefault());
		this.menu.addEventListener("mouseenter", () => this.cancelHide());
		this.menu.addEventListener("mouseleave", () => this.scheduleHide());
		this.renderMenu();
	}

	show(target: HoverBlockTarget): void {
		if (this.isMenuOpen()) {
			return;
		}
		this.target = target;
		this.cancelHide();
		this.pill.show();
		this.pill.addClass("is-visible");
		this.pill.querySelector(".side-mark-block-pill-label")?.setText(target.label);
		const left = clamp(target.rect.left - 58, 8, window.innerWidth - 82);
		const pillHeight = this.pill.offsetHeight || 22;
		const visualOffset = target.label.startsWith("H") ? 2 : 0;
		const top = clamp(target.rect.top + target.rect.height / 2 - pillHeight / 2 + visualOffset, 8, window.innerHeight - pillHeight - 8);
		this.pill.style.left = `${left}px`;
		this.pill.style.top = `${top}px`;
	}

	hide(): void {
		this.cancelOpen();
		this.cancelHide();
		document.removeEventListener("mousemove", this.pointerMoveHandler);
		this.pill.removeClass("is-visible");
		this.pill.removeClass("is-open");
		this.menu.removeClass("is-open");
		window.setTimeout(() => {
			if (!this.pill.hasClass("is-visible")) {
				this.pill.hide();
			}
			if (!this.menu.hasClass("is-open")) {
				this.menu.hide();
			}
		}, 140);
		this.target = null;
	}

	scheduleHide(): void {
		this.cancelOpen();
		if (this.hideTimer !== null) {
			return;
		}
		this.hideTimer = window.setTimeout(() => this.hide(), 220);
	}

	destroy(): void {
		this.cancelHide();
		this.cancelOpen();
		document.removeEventListener("mousemove", this.pointerMoveHandler);
		this.pill.remove();
		this.menu.remove();
	}

	private renderMenu(): void {
		const list = this.menu.createDiv({ cls: "side-mark-block-menu-list" });
		for (const item of FORMAT_BUTTONS) {
			this.renderButton(list, item);
		}
		this.menu.createDiv({ cls: "side-mark-block-menu-separator" });
		this.renderSubmenuRow(list, "align-start-horizontal", "缩进和对齐");
		this.renderSubmenuRow(list, "paintbrush", "颜色");
		this.menu.createDiv({ cls: "side-mark-block-menu-separator" });
		for (const item of ACTION_BUTTONS) {
			this.renderButton(list, item);
		}
	}

	private renderButton(container: HTMLElement, item: MenuButton): void {
		const button = container.createEl("button", {
			cls: item.compact
				? "side-mark-block-menu-compact"
				: `side-mark-block-menu-row${item.danger ? " is-danger" : ""}`,
			attr: {
				type: "button",
				title: item.label,
				"aria-label": item.label
			}
		});
		const icon = button.createSpan({ cls: "side-mark-block-menu-row-icon" });
		if (item.icon) {
			setIcon(icon, item.icon);
		} else {
			icon.setText(item.shortcut || item.label);
		}
		button.createSpan({ cls: "side-mark-block-menu-row-label", text: item.label });
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (this.target) {
				this.onAction(item.action, this.target);
			}
			this.hide();
		});
	}

	private renderSubmenuRow(container: HTMLElement, icon: string, label: string): void {
		const row = container.createDiv({ cls: "side-mark-block-menu-row is-disabled" });
		const iconEl = row.createSpan({ cls: "side-mark-block-menu-row-icon" });
		setIcon(iconEl, icon);
		row.createSpan({ cls: "side-mark-block-menu-row-label", text: label });
		const arrow = row.createSpan({ cls: "side-mark-block-menu-row-arrow" });
		setIcon(arrow, "chevron-right");
	}

	private scheduleOpen(): void {
		this.cancelHide();
		this.cancelOpen();
		this.openTimer = window.setTimeout(() => this.openMenu(), 70);
	}

	private openMenu(): void {
		if (!this.target) {
			return;
		}
		this.pill.addClass("is-open");
		document.addEventListener("mousemove", this.pointerMoveHandler);
		this.menu.show();
		this.positionMenu();
		window.requestAnimationFrame(() => this.menu.addClass("is-open"));
	}

	private positionMenu(): void {
		if (!this.target) return;
		const left = clamp(this.target.rect.left - 58, 8, window.innerWidth - 240);
		const top = clamp(this.target.rect.top + 22, 8, window.innerHeight - 340);
		this.menu.style.left = `${left}px`;
		this.menu.style.top = `${top}px`;
	}

	private isMenuOpen(): boolean {
		return this.menu.isShown() || this.menu.hasClass("is-open");
	}

	private handlePointerMove(event: MouseEvent): void {
		if (!this.isMenuOpen()) {
			return;
		}
		if (isInsideWithPadding(event, this.pill, 8) || isInsideWithPadding(event, this.menu, 8)) {
			this.cancelHide();
			return;
		}
		this.scheduleHide();
	}

	private cancelHide(): void {
		if (this.hideTimer !== null) {
			window.clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	}

	private cancelOpen(): void {
		if (this.openTimer !== null) {
			window.clearTimeout(this.openTimer);
			this.openTimer = null;
		}
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, Math.max(min, max)));
}

function isInsideWithPadding(event: MouseEvent, element: HTMLElement, padding: number): boolean {
	if (!element.isShown()) {
		return false;
	}
	const rect = element.getBoundingClientRect();
	return (
		event.clientX >= rect.left - padding &&
		event.clientX <= rect.right + padding &&
		event.clientY >= rect.top - padding &&
		event.clientY <= rect.bottom + padding
	);
}
