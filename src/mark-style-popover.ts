import { setIcon } from "obsidian";
import type { MarkBackgroundColor, MarkTextColor } from "./types";

export interface MarkStyleChoice {
	textColor: MarkTextColor;
	backgroundColor: MarkBackgroundColor;
}

interface TextColorItem {
	color: MarkTextColor;
	label: string;
}

interface BackgroundColorItem {
	color: MarkBackgroundColor;
	label: string;
}

const TEXT_COLORS: TextColorItem[] = [
	{ color: "default", label: "默认字体" },
	{ color: "gray", label: "灰色字体" },
	{ color: "red", label: "红色字体" },
	{ color: "orange", label: "橙色字体" },
	{ color: "yellow", label: "黄色字体" },
	{ color: "green", label: "绿色字体" },
	{ color: "blue", label: "蓝色字体" },
	{ color: "purple", label: "紫色字体" }
];

const BACKGROUND_COLORS: BackgroundColorItem[] = [
	{ color: "none", label: "无背景" },
	{ color: "gray-light", label: "浅灰背景" },
	{ color: "red-light", label: "浅红背景" },
	{ color: "orange-light", label: "浅橙背景" },
	{ color: "yellow-light", label: "浅黄背景" },
	{ color: "green-light", label: "浅绿背景" },
	{ color: "blue-light", label: "浅蓝背景" },
	{ color: "purple-light", label: "浅紫背景" },
	{ color: "gray", label: "灰色背景" },
	{ color: "red", label: "红色背景" },
	{ color: "orange", label: "橙色背景" },
	{ color: "yellow", label: "黄色背景" },
	{ color: "green", label: "绿色背景" },
	{ color: "blue", label: "蓝色背景" },
	{ color: "purple", label: "紫色背景" }
];

export class MarkStylePopover {
	private readonly el: HTMLDivElement;
	private readonly textColorButtons = new Map<MarkTextColor, HTMLButtonElement>();
	private readonly backgroundColorButtons = new Map<MarkBackgroundColor, HTMLButtonElement>();
	private textColor: MarkTextColor = "default";
	private backgroundColor: MarkBackgroundColor = "none";
	private onChange: ((choice: MarkStyleChoice) => void) | null = null;
	private onReset: (() => void) | null = null;
	private hideTimer: number | null = null;

	constructor() {
		this.el = document.body.createDiv({ cls: "side-mark-style-popover" });
		this.el.hide();
		this.el.addEventListener("mouseenter", () => this.cancelHide());
		this.el.addEventListener("mouseleave", () => this.scheduleHide());
		const header = this.el.createDiv({ cls: "side-mark-style-popover-header" });
		header.createSpan({ text: "标记" });
		const closeButton = header.createEl("button", {
			cls: "side-mark-icon-button",
			attr: { type: "button", "aria-label": "关闭" }
		});
		setIcon(closeButton, "x");
		closeButton.addEventListener("click", () => this.hide());

		this.renderTextColors();
		this.renderBackgroundColors();
		this.renderResetButton();
	}

	show(
		rect: DOMRect,
		choice: MarkStyleChoice,
		onChange: (choice: MarkStyleChoice) => void,
		onReset: () => void
	): void {
		this.cancelHide();
		this.textColor = choice.textColor;
		this.backgroundColor = choice.backgroundColor;
		this.onChange = onChange;
		this.onReset = onReset;
		this.renderActiveState();
		this.el.show();
		this.el.removeClass("is-visible");
		const width = this.el.offsetWidth;
		const left = clamp(rect.right + 12, 8, window.innerWidth - width - 8);
		const top = clamp(rect.top, 8, window.innerHeight - this.el.offsetHeight - 8);
		this.el.style.left = `${left}px`;
		this.el.style.top = `${top}px`;
		window.requestAnimationFrame(() => this.el.addClass("is-visible"));
	}

	hide(): void {
		this.cancelHide();
		this.el.removeClass("is-visible");
		this.onChange = null;
		this.onReset = null;
		window.setTimeout(() => {
			if (!this.el.hasClass("is-visible")) {
				this.el.hide();
			}
		}, 150);
	}

	destroy(): void {
		this.cancelHide();
		this.el.remove();
	}

	private renderTextColors(): void {
		this.el.createDiv({ cls: "side-mark-style-section-title", text: "字体颜色" });
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

	private renderBackgroundColors(): void {
		this.el.createDiv({ cls: "side-mark-style-section-title", text: "背景颜色" });
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

	private renderResetButton(): void {
		const button = this.el.createEl("button", {
			cls: "side-mark-style-reset",
			text: "恢复默认",
			attr: { type: "button" }
		});
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.onReset?.();
			this.hide();
		});
	}

	private renderActiveState(): void {
		for (const [color, button] of this.textColorButtons) {
			button.toggleClass("is-active", color === this.textColor);
		}
		for (const [color, button] of this.backgroundColorButtons) {
			button.toggleClass("is-active", color === this.backgroundColor);
		}
	}

	private emitChange(): void {
		this.onChange?.({
			textColor: this.textColor,
			backgroundColor: this.backgroundColor
		});
	}

	private scheduleHide(): void {
		this.cancelHide();
		this.hideTimer = window.setTimeout(() => this.hide(), 420);
	}

	private cancelHide(): void {
		if (this.hideTimer !== null) {
			window.clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, Math.max(min, max)));
}
