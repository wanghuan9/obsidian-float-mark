import { ItemView, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import type SideMarkPlugin from "./main";
import type { CommentReply, MarkColor, SideMark } from "./types";
import { FLOAT_MARK_ICON_ID } from "./icons";
import { isHtmlElement, isInputEvent } from "./dom-utils";

export const SIDE_MARK_VIEW_TYPE = "side-mark-sidebar";

type SideMarkFilter = "active" | "resolved" | "orphaned" | "all";
type SideMarkTagFilter = "all";
type SideMarkColorFilter = MarkColor | "all";
type SidebarTab = "comments" | "marks";
const MARK_COLORS: Array<{ color: MarkColor; label: string }> = [
	{ color: "yellow", label: "黄色" },
	{ color: "blue", label: "蓝色" },
	{ color: "green", label: "绿色" },
	{ color: "red", label: "红色" }
];

export class SideMarkSidebarView extends ItemView {
	private focusedMarkId = "";
	private activeTab: SidebarTab = "comments";
	private filter: SideMarkFilter = "active";
	private tagFilter: SideMarkTagFilter = "all";
	private colorFilter: SideMarkColorFilter = "all";
	private searchQuery = "";
	private restoreSearchFocus = false;
	private searchSelectionStart: number | null = null;
	private searchSelectionEnd: number | null = null;
	private isSearchComposing = false;

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
		return FLOAT_MARK_ICON_ID;
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
		const doc = this.plugin.currentDocument;
		const allMarks = doc?.marks || [];
		const toolbarRow = header.createDiv({ cls: "side-mark-sidebar-toolbar-row" });
		this.renderTabs(toolbarRow, allMarks);
		const controls = toolbarRow.createDiv({ cls: "side-mark-sidebar-controls" });

		if (!doc || doc.marks.length === 0) {
			this.renderFilters(header, controls, [], []);
			this.restoreSearchInputFocus();
			container.createDiv({ text: "当前文档还没有标注。", cls: "setting-item-description" });
			return;
		}

		const tabMarks = this.getTabMarks(doc.marks);
		const marks = this.getFilteredMarks(tabMarks);
		this.renderFilters(header, controls, tabMarks, marks);
		this.restoreSearchInputFocus();

		if (marks.length === 0) {
			container.createDiv({
				text: this.activeTab === "comments" ? "当前筛选下没有评论。" : "当前筛选下没有标记。",
				cls: "setting-item-description"
			});
			return;
		}

		for (const mark of marks) {
			if (this.activeTab === "comments") {
				this.renderCard(container, mark);
			} else {
				this.renderMarkCard(container, mark);
			}
		}
	}

	private renderTabs(container: HTMLElement, marks: SideMark[]): void {
		const tabs = container.createDiv({ cls: "side-mark-sidebar-tabs" });
		this.renderTab(tabs, "comments", "评论", this.getFilteredMarks(this.getTabMarks(marks, "comments"), "comments").length);
		this.renderTab(tabs, "marks", "标记", this.getFilteredMarks(this.getTabMarks(marks, "marks"), "marks").length);
	}

	private renderTab(container: HTMLElement, tab: SidebarTab, label: string, count: number): void {
		const button = container.createEl("button", {
			cls: `side-mark-sidebar-tab${this.activeTab === tab ? " is-active" : ""}`,
			attr: { type: "button" }
		});
		button.createSpan({ cls: "side-mark-sidebar-tab-label", text: label });
		button.createSpan({ cls: "side-mark-sidebar-tab-count", text: String(count) });
		button.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			this.selectTab(tab);
		});
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.selectTab(tab);
		});
	}

	private selectTab(tab: SidebarTab): void {
		if (this.activeTab === tab) {
			return;
		}
		this.activeTab = tab;
		this.searchQuery = "";
		void this.render();
	}

	private renderFilters(
		container: HTMLElement,
		controls: HTMLElement,
		allMarks: SideMark[],
		filteredMarks: SideMark[]
	): void {
		this.renderSelect(controls, "状态", this.filter, [
			{ value: "active", label: "活动" },
			{ value: "all", label: "全部" },
			{ value: "resolved", label: "已解决" },
			{ value: "orphaned", label: "失联" }
		], (value) => {
			this.filter = value as SideMarkFilter;
			void this.render();
		});
		if (this.activeTab === "comments") {
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
		}
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
				placeholder: this.activeTab === "comments" ? "搜索评论" : "搜索标记",
				"aria-label": this.activeTab === "comments" ? "搜索评论" : "搜索标记"
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
				if (this.isSearchComposing || (isInputEvent(event) && event.isComposing)) {
				return;
			}
			this.updateSearchQuery(search);
		});
		container.createDiv({
			cls: "side-mark-sidebar-stats",
			text: allMarks.length === filteredMarks.length
				? `当前文档，共 ${allMarks.length} 条${this.activeTab === "comments" ? "评论" : "标记"}`
				: `当前筛选，共 ${filteredMarks.length} / ${allMarks.length} 条${this.activeTab === "comments" ? "评论" : "标记"}`
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

	private getFilteredMarks(marks: SideMark[], tab: SidebarTab = this.activeTab): SideMark[] {
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
			if (tab === "comments" && this.colorFilter !== "all" && mark.mark.color !== this.colorFilter) {
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

	private getTabMarks(marks: SideMark[], tab: SidebarTab = this.activeTab): SideMark[] {
		return marks.filter((mark) => tab === "comments"
			? mark.mark.kind === "comment"
			: mark.mark.kind === "highlight");
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

	private renderCard(container: HTMLElement, mark: SideMark): void {
		const card = container.createDiv({
			cls: `side-mark-card is-color-${mark.mark.color}${mark.status === "resolved" ? " is-resolved" : ""}`
		});
		card.dataset.sideMarkCardId = mark.id;
		if (mark.id === this.focusedMarkId) {
			card.addClass("is-focused");
		}
		card.addEventListener("click", (event) => {
			const target = isHtmlElement(event.target) ? event.target : null;
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
		this.renderColorPicker(card, mark);
		quote.createDiv({
			cls: "side-mark-card-quote-text",
			text: mark.anchor.selectedText
		});
		this.renderThread(card, mark);
		this.renderReplyComposer(card, mark);
	}

	private renderMarkCard(container: HTMLElement, mark: SideMark): void {
		const card = container.createDiv({
			cls: `side-mark-card side-mark-marker-card is-background-${mark.mark.backgroundColor}${mark.status === "resolved" ? " is-resolved" : ""}`
		});
		card.dataset.sideMarkCardId = mark.id;
		if (mark.id === this.focusedMarkId) {
			card.addClass("is-focused");
		}
		card.addEventListener("click", (event) => {
			const target = isHtmlElement(event.target) ? event.target : null;
			const interactive = target?.closest("button, textarea, input, a, .side-mark-card-menu, .side-mark-marker-note");
			if (interactive) {
				return;
			}
			void this.plugin.jumpToMark(mark.id);
			this.focusMark(mark.id);
		});
		const toolbar = card.createDiv({ cls: "side-mark-card-toolbar" });
		this.addIconAction(toolbar, "chevrons-up", "定位", () => void this.plugin.jumpToMark(mark.id));
		this.addIconAction(toolbar, "palette", "样式", () => {
			const rect = card.getBoundingClientRect();
			void this.plugin.openMark(mark.id, rect);
		});
		this.addIconAction(toolbar, "sticky-note", mark.note.content.trim() ? "编辑备注" : "添加备注", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.renderMarkerNoteEditor(card, mark);
		});
		this.addDeleteIconAction(toolbar, "删除", () => void this.deleteMark(mark.id));
		const more = toolbar.createEl("button", {
			cls: "side-mark-card-icon-button",
			attr: { type: "button", title: "更多", "aria-label": "更多" }
		});
		setIcon(more, "more-horizontal");
		const menu = card.createDiv({ cls: "side-mark-card-menu" });
		menu.hide();
		this.addMenuAction(menu, "trash-2", "删除", () => void this.deleteMark(mark.id));
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

		const quote = card.createDiv({
			cls: `side-mark-card-quote side-mark-marker-preview side-mark--text-${mark.mark.textColor} side-mark--background-${mark.mark.backgroundColor}`
		});
		quote.createDiv({
			cls: "side-mark-card-quote-text",
			text: mark.anchor.selectedText
		});
		this.renderMarkerNote(card, mark);
		const meta = card.createDiv({ cls: "side-mark-marker-meta" });
		const textSwatch = meta.createSpan({ cls: `side-mark-marker-swatch is-text-${mark.mark.textColor}` });
		textSwatch.setAttr("aria-hidden", "true");
		meta.createSpan({ text: "字体" });
		const backgroundSwatch = meta.createSpan({ cls: `side-mark-marker-swatch is-background-${mark.mark.backgroundColor}` });
		backgroundSwatch.setAttr("aria-hidden", "true");
		meta.createSpan({ text: "背景" });
	}

	private renderMarkerNote(card: HTMLElement, mark: SideMark): void {
		const content = mark.note.content.trim();
		if (!content) {
			return;
		}

		const note = card.createDiv({ cls: "side-mark-marker-note" });
		const display = note.createDiv({ cls: "side-mark-marker-note-display" });
		const body = display.createDiv({
			cls: "side-mark-marker-note-body",
			text: content,
			attr: { title: "双击修改备注" }
		});
		this.addInlineDeleteAction(display, "删除备注", () => {
			void this.deleteMarkerNote(mark.id);
		});
		body.addEventListener("dblclick", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.renderMarkerNoteEditor(card, mark);
		});
	}

	private renderMarkerNoteEditor(card: HTMLElement, mark: SideMark): void {
		card.addClass("is-composing");
		card.querySelector(".side-mark-marker-note")?.remove();
		const quote = card.querySelector(".side-mark-card-quote");
		const note = card.createDiv({ cls: "side-mark-marker-note is-editing" });
		const textarea = note.createEl("textarea", {
			text: mark.note.content,
			attr: { placeholder: "写一条备注" }
		});
		const actions = note.createDiv({ cls: "side-mark-marker-note-actions" });
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
		const close = () => {
			void this.render();
		};
		const submit = async () => {
			const next = textarea.value.trim();
			if (next === mark.note.content.trim()) {
				close();
				return;
			}
			await this.plugin.updateMarkNote(mark.id, next);
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
			if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
				event.preventDefault();
				void submit();
			}
		});
		if (quote?.nextSibling) {
			card.insertBefore(note, quote.nextSibling);
		} else {
			card.appendChild(note);
		}
		textarea.focus();
		textarea.select();
	}

	private renderColorPicker(card: HTMLElement, mark: SideMark): void {
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
			button.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				menu.hide();
				void this.plugin.updateMarkColor(mark.id, item.color);
			});
		}
		card.addEventListener("mouseleave", () => menu.hide());
	}

	private toggleColorPicker(card: HTMLElement): void {
		const menu = card.querySelector<HTMLElement>(".side-mark-color-menu");
		if (!menu) {
			return;
		}
		if (menu.isShown()) {
			menu.hide();
		} else {
			menu.show();
		}
	}

	private renderCardToolbar(card: HTMLElement, mark: SideMark): void {
		const toolbar = card.createDiv({ cls: "side-mark-card-toolbar" });
		this.addIconAction(toolbar, "chevrons-up", "定位", () => void this.plugin.jumpToMark(mark.id));
		this.addSyncAction(toolbar, mark);
		this.addIconAction(toolbar, "palette", "颜色", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.toggleColorPicker(card);
		});
		this.addIconAction(
			toolbar,
			mark.status === "resolved" ? "circle" : "circle-check",
			mark.status === "resolved" ? "恢复" : "解决",
			() => void this.toggleResolved(mark.id)
		);
		const more = toolbar.createEl("button", {
			cls: "side-mark-card-icon-button",
			attr: { type: "button", title: "更多", "aria-label": "更多" }
		});
		setIcon(more, "more-horizontal");
		const menu = card.createDiv({ cls: "side-mark-card-menu is-compact" });
		menu.hide();
		this.addMenuAction(menu, "trash-2", "删除", () => void this.deleteMark(mark.id));
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

		for (const [index, reply] of replies.entries()) {
			const isThreadHead = index === 0;
			const row = thread.createDiv({ cls: `side-mark-reply${isThreadHead ? " is-thread-head" : " is-continuation"}` });
			if (isThreadHead) {
				const authorName = reply.authorName || this.plugin.settings.commentAuthorName || "我";
				const avatar = row.createDiv({ cls: "side-mark-avatar", text: authorName.slice(0, 1) || "我" });
				avatar.setAttr("aria-hidden", "true");
			}
			const body = row.createDiv({ cls: "side-mark-reply-body" });
			const meta = body.createDiv({ cls: "side-mark-reply-meta" });
			if (isThreadHead) {
				meta.createSpan({
					cls: "side-mark-reply-author",
					text: reply.authorName || this.plugin.settings.commentAuthorName || "我"
				});
			}
			meta.createSpan({ cls: "side-mark-reply-time", text: formatReplyTime(reply.createdAt) });
			const content = body.createDiv({
				cls: "side-mark-reply-content",
				text: reply.content,
				attr: { title: "双击修改评论" }
			});
			this.addInlineDeleteAction(content, "删除评论", () => {
				void this.deleteReply(mark, replies, reply.id);
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
			if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
				event.preventDefault();
				void submit();
			}
		});
		textarea.addEventListener("blur", () => {
			window.setTimeout(() => {
					if (!editor.contains(editor.doc.activeElement)) {
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
			submit.addEventListener("click", () => {
				const content = textarea.value.trim();
				if (!content) {
					return;
				}
				void this.plugin.addMarkReply(mark.id, content).then(closeComposer);
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
			if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
				event.preventDefault();
				submit.click();
			}
		});
	}

	private addIconAction(container: HTMLElement, icon: string, label: string, onClick: (event: MouseEvent) => void): void {
		const button = container.createEl("button", {
			cls: "side-mark-card-icon-button",
			attr: { type: "button", title: label, "aria-label": label }
		});
		setIcon(button, icon);
		button.addEventListener("click", onClick);
	}

	private addInlineDeleteAction(container: HTMLElement, label: string, onConfirm: () => void): void {
		const button = container.createEl("button", {
			cls: "side-mark-card-icon-button side-mark-inline-delete",
			attr: { type: "button", title: label, "aria-label": label }
		});
		setIcon(button, "trash-2");
		this.bindConfirmDeleteButton(button, label, onConfirm);
	}

	private addDeleteIconAction(container: HTMLElement, label: string, onConfirm: () => void): void {
		const button = container.createEl("button", {
			cls: "side-mark-card-icon-button",
			attr: { type: "button", title: label, "aria-label": label }
		});
		setIcon(button, "trash-2");
		this.bindConfirmDeleteButton(button, label, onConfirm);
	}

	private bindConfirmDeleteButton(button: HTMLButtonElement, label: string, onConfirm: () => void): void {
		let isConfirming = false;
		let resetTimer = 0;
		const clearResetTimer = () => {
			if (resetTimer) {
				window.clearTimeout(resetTimer);
				resetTimer = 0;
			}
		};
		const reset = () => {
			clearResetTimer();
			isConfirming = false;
			button.removeClass("is-confirming");
			button.setAttr("title", label);
			button.setAttr("aria-label", label);
			button.empty();
			setIcon(button, "trash-2");
		};
		const confirm = () => {
			clearResetTimer();
			isConfirming = true;
			button.addClass("is-confirming");
			button.setAttr("title", "确认删除");
			button.setAttr("aria-label", "确认删除");
			button.empty();
			button.createSpan({ text: "确认" });
		};
		const scheduleReset = () => {
			clearResetTimer();
			resetTimer = window.setTimeout(reset, 1600);
		};
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (!isConfirming) {
				confirm();
				scheduleReset();
				return;
			}
			reset();
			onConfirm();
		});
		button.addEventListener("mouseleave", scheduleReset);
		button.addEventListener("blur", scheduleReset);
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

	private addMenuAction(container: HTMLElement, icon: string, label: string, onClick: () => void): void {
		const button = container.createEl("button", {
			cls: "side-mark-card-menu-item is-danger",
			attr: { type: "button", title: label, "aria-label": label }
		});
		const iconEl = button.createSpan({ cls: "side-mark-card-menu-item-icon" });
		setIcon(iconEl, icon);
		const labelEl = button.createSpan({ cls: "side-mark-card-menu-item-label", text: label });
		let isConfirming = false;
		let resetTimer = 0;
		const clearResetTimer = () => {
			if (resetTimer) {
				window.clearTimeout(resetTimer);
				resetTimer = 0;
			}
		};
		const reset = () => {
			clearResetTimer();
			isConfirming = false;
			button.removeClass("is-confirming");
			button.setAttr("title", label);
			button.setAttr("aria-label", label);
			iconEl.empty();
			setIcon(iconEl, icon);
			labelEl.setText(label);
		};
		const scheduleReset = () => {
			clearResetTimer();
			resetTimer = window.setTimeout(reset, 1600);
		};
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (!isConfirming) {
				clearResetTimer();
				isConfirming = true;
				button.addClass("is-confirming");
				button.setAttr("title", "确认删除");
				button.setAttr("aria-label", "确认删除");
				iconEl.empty();
				labelEl.setText("确认");
				scheduleReset();
				return;
			}
			reset();
			container.hide();
			onClick();
		});
		button.addEventListener("mouseleave", scheduleReset);
		button.addEventListener("blur", scheduleReset);
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

	private async deleteMarkerNote(markId: string): Promise<void> {
		await this.plugin.updateMarkNote(markId, "");
	}

	private async deleteReply(mark: SideMark, replies: CommentReply[], replyId: string): Promise<void> {
		if (replies.length <= 1) {
			await this.deleteMark(mark.id);
			return;
		}
		await this.plugin.deleteMarkReply(mark.id, replyId);
	}

	private async toggleResolved(markId: string): Promise<void> {
		await this.plugin.toggleResolved(markId);
	}

	private async deleteMark(markId: string): Promise<void> {
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
