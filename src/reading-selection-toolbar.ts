import { setIcon } from "obsidian";
import { getActiveBody } from "./dom-utils";

type ReadingSelectionAction = "highlight" | "comment";

interface ReadingButton {
	id: ReadingSelectionAction;
	icon: string;
	title: string;
}

const READING_BUTTONS: ReadingButton[] = [
	{ id: "highlight", icon: "highlighter", title: "高亮标注" },
	{ id: "comment", icon: "message-square-text", title: "评论" }
];

export class ReadingSelectionToolbar {
	private readonly el: HTMLDivElement;
	private hideTimer: number | null = null;

	constructor(private readonly onAction: (action: ReadingSelectionAction) => void) {
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
			setIcon(buttonEl, button.icon);
			buttonEl.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.onAction(button.id);
				this.hide();
			});
		}
	}

	show(rect: DOMRect, boundary?: DOMRect): void {
		this.cancelHide();
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
		this.el.removeClass("is-visible");
		window.setTimeout(() => {
			if (!this.el.hasClass("is-visible")) {
				this.el.hide();
			}
		}, 140);
	}

	destroy(): void {
		this.cancelHide();
		this.el.remove();
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
