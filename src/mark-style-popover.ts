import { setIcon } from "obsidian";
import { getActiveBody } from "./dom-utils";
import type { I18nKey } from "./i18n";
import { calculatePopoverPosition } from "./popover-position";
import type { MarkBackgroundColor, MarkTextColor } from "./types";

export interface MarkStyleChoice {
	textColor: MarkTextColor;
	backgroundColor: MarkBackgroundColor;
}

interface TextColorItem {
	color: MarkTextColor;
	labelKey: I18nKey;
}

interface BackgroundColorItem {
	color: MarkBackgroundColor;
	labelKey: I18nKey;
}

const TEXT_COLORS: TextColorItem[] = [
	{ color: "default", labelKey: "style.text.default" },
	{ color: "gray", labelKey: "style.text.gray" },
	{ color: "red", labelKey: "style.text.red" },
	{ color: "orange", labelKey: "style.text.orange" },
	{ color: "yellow", labelKey: "style.text.yellow" },
	{ color: "green", labelKey: "style.text.green" },
	{ color: "blue", labelKey: "style.text.blue" },
	{ color: "purple", labelKey: "style.text.purple" }
];

const BACKGROUND_COLORS: BackgroundColorItem[] = [
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

export class MarkStylePopover {
	private readonly el: HTMLDivElement;
	private readonly textColorButtons = new Map<MarkTextColor, HTMLButtonElement>();
	private readonly backgroundColorButtons = new Map<MarkBackgroundColor, HTMLButtonElement>();
	private textColor: MarkTextColor = "default";
	private backgroundColor: MarkBackgroundColor = "none";
	private onChange: ((choice: MarkStyleChoice) => void) | null = null;
	private onReset: (() => void) | null = null;
	private hideTimer: number | null = null;
	private readonly outsideMouseDownHandler = (event: MouseEvent) => this.handleOutsideMouseDown(event);

	constructor(private readonly t: (key: I18nKey) => string) {
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
		this.el.doc.addEventListener("mousedown", this.outsideMouseDownHandler);
		const width = this.el.offsetWidth;
		const { left, top } = calculatePopoverPosition(
			rect,
			{ width, height: this.el.offsetHeight },
			{ width: window.innerWidth, height: window.innerHeight }
		);
		this.el.style.left = `${left}px`;
		this.el.style.top = `${top}px`;
		window.requestAnimationFrame(() => this.el.addClass("is-visible"));
	}

	hide(): void {
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

	destroy(): void {
		this.cancelHide();
		this.el.doc.removeEventListener("mousedown", this.outsideMouseDownHandler);
		this.el.remove();
	}

	private renderTextColors(): void {
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

	private renderBackgroundColors(): void {
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

	private renderResetButton(): void {
		const button = this.el.createEl("button", {
			cls: "side-mark-style-reset",
			text: this.t("popover.resetDefault"),
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

	private handleOutsideMouseDown(event: MouseEvent): void {
		if (this.el.contains(event.target as Node | null)) {
			return;
		}
		this.hide();
	}
}
