import { setIcon } from "obsidian";
import { getActiveBody } from "./dom-utils";
import type { I18nKey } from "./i18n";
import { calculatePopoverPosition } from "./popover-position";

export class CommentPopover {
	private readonly el: HTMLDivElement;
	private readonly textarea: HTMLTextAreaElement;
	private onSave: ((content: string) => void) | null = null;
	private onHide: (() => void) | null = null;

	constructor(private readonly t: (key: I18nKey) => string) {
		this.el = getActiveBody().createDiv({ cls: "side-mark-comment-popover" });
		this.el.hide();
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
		if (this.onSave !== null) {
			this.finishSession();
		}
		this.onSave = onSave;
		this.onHide = onHide || null;
		this.textarea.value = "";
		this.el.show();
		this.el.removeClass("is-visible");
		const width = this.el.offsetWidth;
		const height = this.el.offsetHeight;
		const { left, top } = calculatePopoverPosition(
			rect,
			{ width, height },
			{ width: window.innerWidth, height: window.innerHeight }
		);
		this.el.style.left = `${left}px`;
		this.el.style.top = `${top}px`;
		window.requestAnimationFrame(() => this.el.addClass("is-visible"));
		if (options?.focus !== false) {
			this.textarea.focus();
		}
	}

	hide(): void {
		this.el.removeClass("is-visible");
		this.finishSession();
		window.setTimeout(() => {
			if (!this.el.hasClass("is-visible")) {
				this.el.hide();
			}
		}, 150);
	}

	destroy(): void {
		this.finishSession();
		this.el.remove();
	}

	private finishSession(): void {
		this.onSave = null;
		const onHide = this.onHide;
		this.onHide = null;
		onHide?.();
	}
}
