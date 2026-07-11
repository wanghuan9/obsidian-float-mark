import { setIcon } from "obsidian";
import { getActiveBody } from "./dom-utils";
import type { I18nKey } from "./i18n";

export class CommentPopover {
	private readonly el: HTMLDivElement;
	private readonly textarea: HTMLTextAreaElement;
	private onSave: ((content: string) => void) | null = null;
	private onHide: (() => void) | null = null;
	private hideTimer: number | null = null;
	private readonly outsideMouseDownHandler = (event: MouseEvent) => this.handleOutsideMouseDown(event);

	constructor(private readonly t: (key: I18nKey) => string) {
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
		setIcon(closeButton, "x");
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
			this.onSave?.(this.textarea.value);
			this.hide();
		});
		this.textarea.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
				return;
			}
			event.preventDefault();
			this.onSave?.(this.textarea.value);
			this.hide();
		});
	}

	show(rect: DOMRect, onSave: (content: string) => void, onHide?: () => void, options?: { focus?: boolean }): void {
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
		if (options?.focus !== false) {
			this.textarea.focus();
		}
	}

	hide(): void {
		this.cancelHide();
		this.el.doc.removeEventListener("mousedown", this.outsideMouseDownHandler);
		this.el.removeClass("is-visible");
		this.onSave = null;
		this.onHide?.();
		this.onHide = null;
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

	private scheduleHide(): void {
		if (this.textarea.value.trim()) {
			return;
		}
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

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, Math.max(min, max)));
}

function getPopoverAxisPosition(preferred: number, size: number, fallback: number, viewportSize: number): number {
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
