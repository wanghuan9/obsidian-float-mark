import { setIcon } from "obsidian";

export class CommentPopover {
	private readonly el: HTMLDivElement;
	private readonly textarea: HTMLTextAreaElement;
	private onSave: ((content: string) => void) | null = null;
	private onHide: (() => void) | null = null;
	private hideTimer: number | null = null;

	constructor() {
		this.el = document.body.createDiv({ cls: "side-mark-comment-popover" });
		this.el.hide();
		this.el.addEventListener("mouseenter", () => this.cancelHide());
		this.el.addEventListener("mouseleave", () => this.scheduleHide());
		const header = this.el.createDiv({ cls: "side-mark-comment-popover-header" });
		header.createSpan({ text: "评论" });
		const closeButton = header.createEl("button", {
			cls: "side-mark-icon-button",
			attr: { type: "button", "aria-label": "关闭" }
		});
		setIcon(closeButton, "x");
		closeButton.addEventListener("click", () => this.hide());

		this.textarea = this.el.createEl("textarea", {
			cls: "side-mark-comment-textarea",
			attr: { placeholder: "填写评论" }
		});
		const actions = this.el.createDiv({ cls: "side-mark-comment-actions" });
		const cancel = actions.createEl("button", {
			text: "取消",
			cls: "side-mark-secondary-button",
			attr: { type: "button" }
		});
		cancel.addEventListener("click", () => this.hide());
		const save = actions.createEl("button", {
			text: "保存",
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

	show(rect: DOMRect, onSave: (content: string) => void, onHide?: () => void): void {
		this.cancelHide();
		this.onSave = onSave;
		this.onHide = onHide || null;
		this.textarea.value = "";
		this.el.show();
		this.el.removeClass("is-visible");
		const width = this.el.offsetWidth;
		const left = clamp(rect.right + 12, 8, window.innerWidth - width - 8);
		const top = clamp(rect.top, 8, window.innerHeight - this.el.offsetHeight - 8);
		this.el.style.left = `${left}px`;
		this.el.style.top = `${top}px`;
		window.requestAnimationFrame(() => this.el.addClass("is-visible"));
		this.textarea.focus();
	}

	hide(): void {
		this.cancelHide();
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
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, Math.max(min, max)));
}
