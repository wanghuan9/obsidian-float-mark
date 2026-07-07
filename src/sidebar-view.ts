import { ItemView, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import type SideMarkPlugin from "./main";
import type { MarkColor, SideMark } from "./types";

export const SIDE_MARK_VIEW_TYPE = "side-mark-sidebar";

type SideMarkFilter = "active" | "resolved" | "orphaned" | "all";
type SideMarkTagFilter = "all";
type SideMarkColorFilter = MarkColor | "all";
const MARK_COLORS: Array<{ color: MarkColor; label: string }> = [
	{ color: "yellow", label: "黄色" },
	{ color: "blue", label: "蓝色" },
	{ color: "green", label: "绿色" },
	{ color: "red", label: "红色" }
];

export class SideMarkSidebarView extends ItemView {
	private focusedMarkId = "";
	private filter: SideMarkFilter = "active";
	private tagFilter: SideMarkTagFilter = "all";
	private colorFilter: SideMarkColorFilter = "all";
	private searchQuery = "";
	private restoreSearchFocus = false;
	private searchSelectionStart: number | null = null;
	private searchSelectionEnd: number | null = null;
	private isSearchComposing = false;
	private isRefreshing = false;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: SideMarkPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return SIDE_MARK_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "FloatMark";
	}

	getIcon(): string {
		return "highlighter";
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	focusMark(markId: string): void {
		this.focusedMarkId = markId;
		void this.render();
		window.setTimeout(() => {
			this.containerEl.querySelector<HTMLElement>(`[data-side-mark-card-id="${markId}"]`)?.scrollIntoView({
				block: "center"
			});
		});
	}

	async render(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("side-mark-sidebar");
		const header = container.createDiv({ cls: "side-mark-sidebar-header" });
		const titleRow = header.createDiv({ cls: "side-mark-sidebar-title-row" });
		titleRow.createEl("h3", { text: "正文标注" });
		const controls = titleRow.createDiv({ cls: "side-mark-sidebar-controls" });
		const refresh = titleRow.createEl("button", {
			cls: `side-mark-icon-button side-mark-refresh-button${this.isRefreshing ? " is-refreshing" : ""}`,
			attr: { type: "button", "aria-label": "刷新" }
		});
		refresh.disabled = this.isRefreshing;
		setIcon(refresh, "refresh-cw");
		refresh.addEventListener("click", () => void this.refreshCurrentDocument());

		const doc = this.plugin.currentDocument;
		if (!doc || doc.marks.length === 0) {
			this.renderFilters(header, controls, [], []);
			this.restoreSearchInputFocus();
			container.createDiv({ text: "当前文档还没有标注。", cls: "setting-item-description" });
			return;
		}

		const marks = this.getFilteredMarks(doc.marks);
		this.renderFilters(header, controls, doc.marks, marks);
		this.restoreSearchInputFocus();

		if (marks.length === 0) {
			container.createDiv({
				text: "当前筛选下没有标注。",
				cls: "setting-item-description"
			});
			return;
		}

		for (const mark of marks) {
			this.renderCard(container, mark);
		}
	}

	private renderFilters(
		container: HTMLElement,
		controls: HTMLElement,
		allMarks: SideMark[],
		filteredMarks: SideMark[]
	): void {
		this.renderSelect(controls, "状态", this.filter, [
			{ value: "all", label: "全部" },
			{ value: "active", label: "活动" },
			{ value: "resolved", label: "已解决" },
			{ value: "orphaned", label: "失联" }
		], (value) => {
			this.filter = value as SideMarkFilter;
			void this.render();
		});
		this.renderSelect(controls, "颜色", this.colorFilter, [
			{ value: "all", label: "全部" },
			{ value: "yellow", label: "黄色" },
			{ value: "blue", label: "蓝色" },
			{ value: "green", label: "绿色" },
			{ value: "red", label: "红色" }
		], (value) => {
			this.colorFilter = value as SideMarkColorFilter;
			void this.render();
		});
		this.renderSelect(controls, "标签", this.tagFilter, [
			{ value: "all", label: "全部" }
		], (value) => {
			this.tagFilter = value as SideMarkTagFilter;
			void this.render();
		});

		const searchWrap = container.createDiv({ cls: "side-mark-sidebar-search" });
		const search = searchWrap.createEl("input", {
			cls: "side-mark-sidebar-search-input",
			attr: {
				type: "search",
				placeholder: "搜索标注",
				"aria-label": "搜索标注"
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
			if (this.isSearchComposing || (event instanceof InputEvent && event.isComposing)) {
				return;
			}
			this.updateSearchQuery(search);
		});
		container.createDiv({
			cls: "side-mark-sidebar-stats",
			text: allMarks.length === filteredMarks.length
				? `当前文档，共 ${allMarks.length} 条标注`
				: `当前筛选，共 ${filteredMarks.length} / ${allMarks.length} 条标注`
		});
	}

	private renderSelect(
		container: HTMLElement,
		label: string,
		value: string,
		options: Array<{ value: string; label: string }>,
		onChange: (value: string) => void
	): void {
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
		setIcon(chevron, "chevron-down");
		const menu = field.createDiv({ cls: "side-mark-filter-menu" });
		menu.hide();
		for (const option of options) {
			const item = menu.createEl("button", {
				cls: `side-mark-filter-menu-item${option.value === value ? " is-active" : ""}`,
				attr: { type: "button" }
			});
			const check = item.createSpan({ cls: "side-mark-filter-menu-check" });
			if (option.value === value) {
				setIcon(check, "check");
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
			this.containerEl.querySelectorAll<HTMLElement>(".side-mark-filter-menu").forEach((other) => {
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

	private getFilteredMarks(marks: SideMark[]): SideMark[] {
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
			if (this.colorFilter !== "all" && mark.mark.color !== this.colorFilter) {
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

	private updateSearchQuery(search: HTMLInputElement): void {
		this.searchQuery = search.value;
		this.restoreSearchFocus = true;
		this.searchSelectionStart = search.selectionStart;
		this.searchSelectionEnd = search.selectionEnd;
		void this.render();
	}

	private restoreSearchInputFocus(): void {
		if (!this.restoreSearchFocus) {
			return;
		}
		this.restoreSearchFocus = false;
		const search = this.containerEl.querySelector<HTMLInputElement>(".side-mark-sidebar-search-input");
		if (!search) {
			return;
		}
		search.focus();
		const start = this.searchSelectionStart ?? search.value.length;
		const end = this.searchSelectionEnd ?? start;
		search.setSelectionRange(start, end);
	}

	private async refreshCurrentDocument(): Promise<void> {
		if (this.isRefreshing) {
			return;
		}
		this.isRefreshing = true;
		await this.render();
		try {
			await this.plugin.reloadCurrentDocument();
			new Notice("标注已刷新。");
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error), 8000);
		} finally {
			this.isRefreshing = false;
			await this.render();
		}
	}

	private renderCard(container: HTMLElement, mark: SideMark): void {
		const card = container.createDiv({
			cls: `side-mark-card is-color-${mark.mark.color}${mark.status === "resolved" ? " is-resolved" : ""}`
		});
		card.dataset.sideMarkCardId = mark.id;
		if (mark.id === this.focusedMarkId) {
			card.addClass("is-focused");
		}
		card.addEventListener("click", (event) => {
			const target = event.target instanceof HTMLElement ? event.target : null;
			const interactive = target?.closest(
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
		this.renderColorPicker(card, quote, mark);
		quote.createDiv({
			cls: "side-mark-card-quote-text",
			text: mark.anchor.selectedText
		});
		this.renderThread(card, mark);
		this.renderReplyComposer(card, mark);
	}

	private renderColorPicker(card: HTMLElement, quote: HTMLElement, mark: SideMark): void {
		const menu = card.createDiv({ cls: "side-mark-color-menu" });
		menu.hide();
		for (const item of MARK_COLORS) {
			const button = menu.createEl("button", {
				cls: `side-mark-color-option is-${item.color}${item.color === mark.mark.color ? " is-active" : ""}`,
				attr: { type: "button", title: item.label, "aria-label": item.label }
			});
			if (item.color === mark.mark.color) {
				setIcon(button, "check");
			}
			button.addEventListener("click", async (event) => {
				event.preventDefault();
				event.stopPropagation();
				menu.hide();
				await this.plugin.updateMarkColor(mark.id, item.color);
			});
		}
		quote.addEventListener("click", (event) => {
			if (event.offsetX > 14) {
				return;
			}
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

	private renderCardToolbar(card: HTMLElement, mark: SideMark): void {
		const toolbar = card.createDiv({ cls: "side-mark-card-toolbar" });
		this.addIconAction(toolbar, "chevrons-up", "定位", () => void this.plugin.jumpToMark(mark.id));
		this.addSyncAction(toolbar, mark);
		this.addIconAction(
			toolbar,
			mark.status === "resolved" ? "circle" : "circle-check",
			mark.status === "resolved" ? "恢复" : "解决",
			() => void this.plugin.toggleResolved(mark.id)
		);
		const more = toolbar.createEl("button", {
			cls: "side-mark-card-icon-button",
			attr: { type: "button", title: "更多", "aria-label": "更多" }
		});
		setIcon(more, "more-horizontal");
		const menu = card.createDiv({ cls: "side-mark-card-menu" });
		menu.hide();
		this.addMenuAction(menu, "删除", () => void this.deleteMark(mark.id));
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

	private renderThread(card: HTMLElement, mark: SideMark): void {
		const thread = card.createDiv({ cls: "side-mark-thread" });
		const replies = mark.replies?.length
			? mark.replies
			: mark.note.content.trim()
				? [{
					id: "legacy-note",
					authorName: this.plugin.settings.commentAuthorName,
					content: mark.note.content,
					createdAt: mark.note.createdAt,
					updatedAt: mark.note.updatedAt
				}]
				: [];

		if (!replies.length) {
			thread.createDiv({ cls: "side-mark-empty-thread", text: "还没有评论，继续输入第一条。" });
			return;
		}

		for (const reply of replies) {
			const row = thread.createDiv({ cls: "side-mark-reply" });
			const avatar = row.createDiv({ cls: "side-mark-avatar", text: reply.authorName.slice(0, 1) || "我" });
			avatar.setAttr("aria-hidden", "true");
			const body = row.createDiv({ cls: "side-mark-reply-body" });
			const meta = body.createDiv({ cls: "side-mark-reply-meta" });
			meta.createSpan({ cls: "side-mark-reply-author", text: reply.authorName || "我" });
			meta.createSpan({ cls: "side-mark-reply-time", text: formatReplyTime(reply.createdAt) });
			const content = body.createDiv({
				cls: "side-mark-reply-content",
				text: reply.content,
				attr: { title: "双击修改评论" }
			});
			content.addEventListener("dblclick", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.renderReplyEditor(body, mark.id, reply.id, reply.content);
			});
		}
	}

	private renderReplyEditor(body: HTMLElement, markId: string, replyId: string, content: string): void {
		body.querySelector(".side-mark-reply-content")?.remove();
		const editor = body.createDiv({ cls: "side-mark-reply-editor" });
		const textarea = editor.createEl("textarea", { text: content });
		const actions = editor.createDiv({ cls: "side-mark-reply-editor-actions" });
		const cancel = actions.createEl("button", {
			text: "取消",
			cls: "side-mark-secondary-button",
			attr: { type: "button" }
		});
		const save = actions.createEl("button", {
			text: "保存",
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
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				void submit();
			}
		});
		textarea.addEventListener("blur", () => {
			window.setTimeout(() => {
				if (!editor.contains(document.activeElement)) {
					void submit();
				}
			}, 80);
		});
		textarea.focus();
		textarea.select();
	}

	private renderReplyComposer(card: HTMLElement, mark: SideMark): void {
		const composer = card.createDiv({ cls: "side-mark-reply-composer" });
		const trigger = composer.createEl("button", {
			text: "回复...",
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
			attr: { placeholder: "继续评论" }
		});
		textarea.hide();
		const row = composer.createDiv({ cls: "side-mark-reply-composer-actions" });
		row.hide();
		const cancel = row.createEl("button", {
			text: "取消",
			cls: "side-mark-secondary-button",
			attr: { type: "button" }
		});
		const submit = row.createEl("button", {
			text: "回复",
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
		submit.addEventListener("click", async () => {
			const content = textarea.value.trim();
			if (!content) {
				return;
			}
			await this.plugin.addMarkReply(mark.id, content);
			closeComposer();
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
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				submit.click();
			}
		});
	}

	private addIconAction(container: HTMLElement, icon: string, label: string, onClick: () => void): void {
		const button = container.createEl("button", {
			cls: "side-mark-card-icon-button",
			attr: { type: "button", title: label, "aria-label": label }
		});
		setIcon(button, icon);
		button.addEventListener("click", onClick);
	}

	private addSyncAction(container: HTMLElement, mark: SideMark): void {
		const status = mark.remote?.status || "pending";
		const label = status === "synced"
			? "已同步到飞书"
			: status === "failed"
				? "同步飞书失败"
				: "同步到飞书";
		const button = container.createEl("button", {
			cls: `side-mark-card-icon-button side-mark-sync-action is-${status}`,
			attr: { type: "button", title: label, "aria-label": label }
		});
		setIcon(button, "link");
		if (status === "synced" || status === "failed") {
			const badge = button.createSpan({ cls: "side-mark-sync-action-badge" });
			setIcon(badge, status === "synced" ? "check" : "x");
		}
		button.addEventListener("click", () => void this.syncMark(mark.id));
	}

	private addMenuAction(container: HTMLElement, label: string, onClick: () => void): void {
		const button = container.createEl("button", {
			text: label,
			cls: "side-mark-card-menu-item",
			attr: { type: "button" }
		});
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			container.hide();
			onClick();
		});
	}

	private async syncMark(markId: string): Promise<void> {
		try {
			await this.plugin.syncMarkToLark(markId);
			new Notice("已同步标注到飞书评论。");
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error), 8000);
		}
		await this.render();
	}

	private async deleteMark(markId: string): Promise<void> {
		if (!window.confirm("删除这条标注？")) {
			return;
		}
		await this.plugin.deleteMark(markId);
	}
}

function formatReplyTime(value: string): string {
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) {
		return "";
	}
	const diffMs = Date.now() - timestamp;
	if (diffMs < 60_000) {
		return "刚刚";
	}
	if (diffMs < 3_600_000) {
		return `${Math.floor(diffMs / 60_000)} 分钟前`;
	}
	if (diffMs < 86_400_000) {
		return `${Math.floor(diffMs / 3_600_000)} 小时前`;
	}
	return new Date(timestamp).toLocaleDateString();
}
