import { ItemView, Menu, Notice, setIcon, WorkspaceLeaf } from "obsidian";
import type SideMarkPlugin from "./main";
import type { CommentReply, MarkColor, SideMark, SideMarkDocument } from "./types";
import { FLOAT_MARK_ICON_ID } from "./icons";
import { isHtmlElement, isInputEvent } from "./dom-utils";
import type { I18nKey } from "./i18n";
import { resolveMarkBackground } from "./mark-appearance";
import {
	bindVaultCardNavigation,
	sortMarksByCreatedAt,
	summarizeVaultDocuments,
	toggleSidebarScope,
	type SidebarScope,
	type SidebarTab,
	type SideMarkColorFilter,
	type SideMarkFilter
} from "./sidebar-logic";

export const SIDE_MARK_VIEW_TYPE = "side-mark-sidebar";

type SideMarkTagFilter = "all";
const RETROMA_THEME_CLASS = "side-mark-theme-retroma";
const RETROMA_THEME_PROPERTY = "--retroma-folder-bg-color";
const MARK_COLORS: Array<{ color: MarkColor; labelKey: I18nKey }> = [
	{ color: "yellow", labelKey: "sidebar.yellow" },
	{ color: "blue", labelKey: "sidebar.blue" },
	{ color: "green", labelKey: "sidebar.green" },
	{ color: "red", labelKey: "sidebar.red" }
];

export class SideMarkSidebarView extends ItemView {
	private focusedMarkId = "";
	private viewScope: SidebarScope = "current";
	private renderGeneration = 0;
	private activeTab: SidebarTab = "comments";
	private filter: SideMarkFilter = "active";
	private tagFilter: SideMarkTagFilter = "all";
	private colorFilter: SideMarkColorFilter = "all";
	private searchQuery = "";
	private restoreSearchFocus = false;
	private searchSelectionStart: number | null = null;
	private searchSelectionEnd: number | null = null;
	private isSearchComposing = false;
	private restoreScopeControlFocus = false;

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

	private t(key: I18nKey, params?: Record<string, string | number>): string {
		return this.plugin.t(key, params);
	}

	private updateThemeCompatibilityClass(): void {
		const view = this.contentEl.ownerDocument.defaultView;
		const retromaThemeProperty = view?.getComputedStyle(this.contentEl).getPropertyValue(RETROMA_THEME_PROPERTY);
		this.contentEl.toggleClass(RETROMA_THEME_CLASS, Boolean(retromaThemeProperty?.trim()));
	}

	async onOpen(): Promise<void> {
		this.registerEvent(this.app.workspace.on("css-change", () => this.updateThemeCompatibilityClass()));
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
		const generation = ++this.renderGeneration;
		const container = this.contentEl;
		container.empty();
		container.addClass("side-mark-sidebar");
		this.updateThemeCompatibilityClass();
		const header = container.createDiv({ cls: "side-mark-sidebar-header" });
		const titleRow = header.createDiv({ cls: "side-mark-sidebar-title-row" });
		titleRow.createEl("h3", { text: this.t("sidebar.title") });
		this.renderScopeControl(titleRow);
		this.restoreScopeFocus();
		if (this.viewScope === "vault") {
			const documents = await this.plugin.store.loadAllDocuments();
			if (generation !== this.renderGeneration || this.viewScope !== "vault") {
				return;
			}
			this.renderVault(container, header, documents);
			return;
		}
		this.renderCurrentDocument(container, header);
	}

	private renderCurrentDocument(container: HTMLElement, header: HTMLElement): void {
		const doc = this.plugin.currentDocument;
		const allMarks = doc?.marks || [];
		const toolbarRow = header.createDiv({ cls: "side-mark-sidebar-toolbar-row" });
		this.renderTabs(toolbarRow, allMarks);
		const controls = toolbarRow.createDiv({ cls: "side-mark-sidebar-controls" });

		if (!doc || doc.marks.length === 0) {
			this.renderFilters(header, controls, [], []);
			this.restoreSearchInputFocus();
			container.createDiv({ text: this.t("sidebar.emptyDocument"), cls: "setting-item-description" });
			return;
		}

		const tabMarks = this.getTabMarks(doc.marks);
		const marks = this.getFilteredMarks(tabMarks);
		this.renderFilters(header, controls, tabMarks, marks);
		this.restoreSearchInputFocus();

		if (marks.length === 0) {
			container.createDiv({
				text: this.activeTab === "comments" ? this.t("sidebar.emptyComments") : this.t("sidebar.emptyMarks"),
				cls: "setting-item-description"
			});
			return;
		}

		for (const mark of marks) {
			if (this.activeTab === "comments") {
				this.renderCard(container, mark);
			} else {
				this.renderMarkCard(container, mark, allMarks);
			}
		}
	}

	private renderScopeControl(container: HTMLElement): void {
		switch (this.plugin.settings.scopeControlStyle) {
			case "dropdown":
				this.renderScopeDropdown(container);
				return;
			case "swap":
				this.renderScopeSwap(container);
				return;
			case "switch":
				this.renderScopeSwitch(container);
				return;
			default:
				this.renderScopeTabs(container);
		}
	}

	private renderScopeTabs(container: HTMLElement): void {
		const control = container.createDiv({ cls: "side-mark-sidebar-scope is-tabs" });
		this.renderScopeButton(control, "current", this.t("sidebar.scopeCurrent"));
		this.renderScopeButton(control, "vault", this.t("sidebar.scopeVault"));
	}

	private renderScopeDropdown(container: HTMLElement): void {
		const control = container.createDiv({ cls: "side-mark-sidebar-scope is-dropdown" });
		const label = this.viewScope === "current" ? this.t("sidebar.scopeCurrent") : this.t("sidebar.scopeVault");
		const button = control.createEl("button", {
			cls: "side-mark-sidebar-scope-dropdown",
			attr: {
				type: "button",
				"aria-haspopup": "menu",
				"aria-label": label,
				"data-side-mark-scope-control": ""
			}
		});
		button.createSpan({ cls: "side-mark-sidebar-scope-dot" });
		button.createSpan({ text: label });
		const chevron = button.createSpan({ cls: "side-mark-sidebar-scope-chevron" });
		setIcon(chevron, "chevron-down");
		button.addEventListener("click", (event) => {
			const menu = new Menu();
			button.setAttr("aria-expanded", "true");
			menu.onHide(() => button.setAttr("aria-expanded", "false"));
			for (const option of [
				{ scope: "current" as const, label: this.t("sidebar.scopeCurrent") },
				{ scope: "vault" as const, label: this.t("sidebar.scopeVault") }
			]) {
				menu.addItem((item) => item
					.setTitle(option.label)
					.setChecked(this.viewScope === option.scope)
					.onClick(() => this.setViewScope(option.scope)));
			}
			if (event.detail > 0) {
				menu.showAtMouseEvent(event);
				return;
			}
			const rect = button.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom, width: rect.width }, button.ownerDocument);
		});
	}

	private renderScopeSwap(container: HTMLElement): void {
		const control = container.createDiv({ cls: "side-mark-sidebar-scope is-swap" });
		const label = this.viewScope === "current" ? this.t("sidebar.scopeCurrent") : this.t("sidebar.scopeVault");
		const nextLabel = this.viewScope === "current" ? this.t("sidebar.scopeVault") : this.t("sidebar.scopeCurrent");
		control.createSpan({ cls: "side-mark-sidebar-scope-signal" });
		control.createSpan({ cls: "side-mark-sidebar-scope-swap-label", text: label });
		const button = control.createEl("button", {
			cls: "side-mark-sidebar-scope-swap-button",
			attr: {
				type: "button",
				"aria-label": this.t("sidebar.switchScope", { scope: nextLabel }),
				"data-side-mark-scope-control": ""
			}
		});
		setIcon(button, "arrow-left-right");
		button.addEventListener("click", (event) => {
			event.preventDefault();
			this.toggleViewScope();
		});
	}

	private renderScopeSwitch(container: HTMLElement): void {
		const control = container.createDiv({ cls: "side-mark-sidebar-scope is-switch" });
		const isVault = this.viewScope === "vault";
		control.createSpan({
			cls: `side-mark-sidebar-scope-switch-label${isVault ? "" : " is-active"}`,
			text: this.t("sidebar.scopeCurrentShort")
		});
		const button = control.createEl("button", {
			cls: "side-mark-sidebar-scope-switch",
			attr: {
				type: "button",
				"role": "switch",
				"aria-checked": String(isVault),
				"aria-label": this.t("sidebar.scopeSwitchLabel"),
				"data-side-mark-scope-control": ""
			}
		});
		const track = button.createSpan({ cls: "side-mark-sidebar-scope-switch-track" });
		track.createSpan({ cls: "side-mark-sidebar-scope-switch-knob" });
		control.createSpan({
			cls: `side-mark-sidebar-scope-switch-label${isVault ? " is-active" : ""}`,
			text: this.t("sidebar.scopeVaultShort")
		});
		button.addEventListener("click", (event) => {
			event.preventDefault();
			this.toggleViewScope();
		});
	}

	private renderScopeButton(container: HTMLElement, scope: SidebarScope, label: string): void {
		const button = container.createEl("button", {
			cls: `side-mark-sidebar-scope-button${this.viewScope === scope ? " is-active" : ""}`,
			text: label,
			attr: { type: "button", "aria-pressed": String(this.viewScope === scope) }
		});
		if (this.viewScope === scope) {
			button.dataset.sideMarkScopeControl = "";
		}
		button.addEventListener("click", (event) => {
			event.preventDefault();
			this.setViewScope(scope);
		});
	}

	private setViewScope(scope: SidebarScope): void {
		if (this.viewScope === scope) {
			return;
		}
		this.viewScope = scope;
		this.searchQuery = "";
		this.restoreScopeControlFocus = true;
		void this.render();
	}

	private toggleViewScope(): void {
		this.setViewScope(toggleSidebarScope(this.viewScope));
	}

	private restoreScopeFocus(): void {
		if (!this.restoreScopeControlFocus) {
			return;
		}
		this.restoreScopeControlFocus = false;
		this.contentEl.querySelector<HTMLButtonElement>("[data-side-mark-scope-control]")?.focus();
	}

	private renderVault(container: HTMLElement, header: HTMLElement, documents: SideMarkDocument[]): void {
		const allMarks = documents.flatMap((document) => document.marks);
		const toolbarRow = header.createDiv({ cls: "side-mark-sidebar-toolbar-row" });
		const result = summarizeVaultDocuments(documents, {
			tab: this.activeTab,
			status: this.filter,
			color: this.colorFilter,
			query: this.searchQuery
		});
		this.renderTabs(toolbarRow, allMarks, result.counts);
		const controls = toolbarRow.createDiv({ cls: "side-mark-sidebar-controls" });
		const tabMarks = this.getTabMarks(allMarks);
		const groups = result.groups;
		const filteredMarks = groups.flatMap((group) => group.marks);
		this.renderFilters(header, controls, tabMarks, filteredMarks);
		this.restoreSearchInputFocus();

		if (groups.length === 0) {
			container.createDiv({ text: this.t("sidebar.emptyVault"), cls: "setting-item-description" });
			return;
		}

		for (const group of groups) {
			const section = container.createDiv({ cls: "side-mark-vault-file-group" });
			const groupHeader = section.createDiv({ cls: "side-mark-vault-file-header" });
			groupHeader.createDiv({ cls: "side-mark-vault-file-name", text: getFileName(group.filePath) });
			groupHeader.createDiv({ cls: "side-mark-vault-file-path", text: group.filePath });
			for (const mark of group.marks) {
				this.renderVaultCard(section, group.filePath, mark);
			}
		}
	}

	private renderVaultCard(container: HTMLElement, filePath: string, mark: SideMark): void {
		const card = container.createDiv({
			cls: `side-mark-card side-mark-vault-card is-color-${mark.mark.color}${mark.status === "resolved" ? " is-resolved" : ""}`
		});
		card.dataset.sideMarkCardId = mark.id;
		const locate = () => void this.plugin.jumpToDocumentMark(filePath, mark.id);
		const label = `${this.t("sidebar.locate")}: ${filePath} — ${mark.anchor.selectedText}`;
		bindVaultCardNavigation(card, label, locate);
		const quote = card.createDiv({ cls: "side-mark-card-quote" });
		quote.createDiv({ cls: "side-mark-card-quote-text", text: mark.anchor.selectedText });
		const summary = getVaultMarkSummary(mark);
		if (summary) {
			card.createDiv({ cls: "side-mark-vault-summary", text: summary });
		}
		card.createDiv({ cls: `side-mark-vault-status is-${mark.status}`, text: this.t(`sidebar.${mark.status}`) });
	}

	private renderTabs(
		container: HTMLElement,
		marks: SideMark[],
		counts?: Record<SidebarTab, number>
	): void {
		const tabs = container.createDiv({ cls: "side-mark-sidebar-tabs" });
		const commentCount = counts?.comments
			?? this.getFilteredMarks(this.getTabMarks(marks, "comments"), "comments").length;
		const markCount = counts?.marks
			?? this.getFilteredMarks(this.getTabMarks(marks, "marks"), "marks").length;
		this.renderTab(tabs, "comments", this.t("sidebar.comments"), commentCount);
		this.renderTab(tabs, "marks", this.t("sidebar.marks"), markCount);
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
		this.renderSelect(controls, this.t("sidebar.status"), this.filter, [
			{ value: "active", label: this.t("sidebar.active") },
			{ value: "all", label: this.t("sidebar.all") },
			{ value: "resolved", label: this.t("sidebar.resolved") },
			{ value: "orphaned", label: this.t("sidebar.orphaned") }
		], (value) => {
			this.filter = value as SideMarkFilter;
			void this.render();
		});
		if (this.activeTab === "comments") {
			this.renderSelect(controls, this.t("sidebar.color"), this.colorFilter, [
				{ value: "all", label: this.t("sidebar.all") },
				{ value: "yellow", label: this.t("sidebar.yellow") },
				{ value: "blue", label: this.t("sidebar.blue") },
				{ value: "green", label: this.t("sidebar.green") },
				{ value: "red", label: this.t("sidebar.red") }
			], (value) => {
				this.colorFilter = value as SideMarkColorFilter;
				void this.render();
			});
		}
		this.renderSelect(controls, this.t("sidebar.tag"), this.tagFilter, [
			{ value: "all", label: this.t("sidebar.all") }
		], (value) => {
			this.tagFilter = value as SideMarkTagFilter;
			void this.render();
		});

		const searchWrap = container.createDiv({ cls: "side-mark-sidebar-search" });
		const search = searchWrap.createEl("input", {
			cls: "side-mark-sidebar-search-input",
			attr: {
				type: "search",
				placeholder: this.activeTab === "comments" ? this.t("sidebar.searchComments") : this.t("sidebar.searchMarks"),
				"aria-label": this.activeTab === "comments" ? this.t("sidebar.searchComments") : this.t("sidebar.searchMarks")
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
				? this.t(this.viewScope === "vault" ? "sidebar.vaultStats" : "sidebar.currentDocumentStats", {
					count: allMarks.length,
					kind: this.activeTab === "comments" ? this.t("sidebar.comments") : this.t("sidebar.marks")
				})
				: this.t(this.viewScope === "vault" ? "sidebar.vaultFilterStats" : "sidebar.currentFilterStats", {
					filtered: filteredMarks.length,
					total: allMarks.length,
					kind: this.activeTab === "comments" ? this.t("sidebar.comments") : this.t("sidebar.marks")
				})
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
		return sortMarksByCreatedAt(marks.filter((mark) => {
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
		}));
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

	private renderMarkCard(container: HTMLElement, mark: SideMark, marks: SideMark[]): void {
		const background = resolveMarkBackground(mark, marks);
		const card = container.createDiv({
			cls: `side-mark-card side-mark-marker-card is-background-${background.color}${mark.status === "resolved" ? " is-resolved" : ""}`
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
		this.addIconAction(toolbar, "chevrons-up", this.t("sidebar.locate"), () => void this.plugin.jumpToMark(mark.id));
		this.addIconAction(toolbar, "palette", this.t("sidebar.style"), () => {
			const rect = card.getBoundingClientRect();
			void this.plugin.openMark(mark.id, rect);
		});
		this.addIconAction(toolbar, "sticky-note", mark.note.content.trim() ? this.t("sidebar.editNote") : this.t("sidebar.addNote"), (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.renderMarkerNoteEditor(card, mark);
		});
		this.addDeleteIconAction(toolbar, this.t("toolbar.delete"), () => void this.deleteMark(mark.id));
		const more = toolbar.createEl("button", {
			cls: "side-mark-card-icon-button",
			attr: { type: "button", title: this.t("sidebar.more"), "aria-label": this.t("sidebar.more") }
		});
		setIcon(more, "more-horizontal");
		const menu = card.createDiv({ cls: "side-mark-card-menu" });
		menu.hide();
		this.addMenuAction(menu, "trash-2", this.t("toolbar.delete"), () => void this.deleteMark(mark.id));
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
			cls: `side-mark-card-quote side-mark-marker-preview side-mark--highlight side-mark--text-${mark.mark.textColor} side-mark--background-${background.color}`
		});
		quote.createDiv({
			cls: "side-mark-card-quote-text",
			text: mark.anchor.selectedText
		});
		this.renderMarkerNote(card, mark);
		const meta = card.createDiv({ cls: "side-mark-marker-meta" });
		const textSwatch = meta.createSpan({ cls: `side-mark-marker-swatch is-text-${mark.mark.textColor}` });
		textSwatch.setAttr("aria-hidden", "true");
		meta.createSpan({ text: this.t("sidebar.font") });
		const inheritedClass = background.inherited ? " is-inherited" : "";
		const backgroundSwatch = meta.createSpan({
			cls: `side-mark-marker-swatch is-background-${background.color}${inheritedClass}`
		});
		backgroundSwatch.setAttr("aria-hidden", "true");
		if (background.inherited) {
			backgroundSwatch.setAttr("title", this.t("sidebar.inheritedBackground"));
		}
		const backgroundLabel = meta.createSpan({
			text: background.inherited
				? `${this.t("sidebar.background")}(${this.t("sidebar.inherited")})`
				: this.t("sidebar.background")
		});
		if (background.inherited) {
			backgroundLabel.setAttr("title", this.t("sidebar.inheritedBackground"));
			backgroundLabel.setAttr("aria-label", this.t("sidebar.inheritedBackground"));
		}
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
			attr: { title: this.t("sidebar.editNoteTitle") }
		});
		this.addInlineDeleteAction(display, this.t("sidebar.deleteNote"), () => {
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
			attr: { placeholder: this.t("sidebar.notePlaceholder") }
		});
		const actions = note.createDiv({ cls: "side-mark-marker-note-actions" });
		const cancel = actions.createEl("button", {
			text: this.t("popover.cancel"),
			cls: "side-mark-secondary-button",
			attr: { type: "button" }
		});
		const save = actions.createEl("button", {
			text: this.t("popover.save"),
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
			const label = this.t(item.labelKey);
			const button = menu.createEl("button", {
				cls: `side-mark-color-option is-${item.color}${item.color === mark.mark.color ? " is-active" : ""}`,
				attr: { type: "button", title: label, "aria-label": label }
			});
			if (item.color === mark.mark.color) {
				setIcon(button, "check");
			}
			button.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				menu.hide();
				card.removeClass("is-color-picker-open");
				void this.plugin.updateMarkColor(mark.id, item.color);
			});
		}
		card.addEventListener("mouseleave", () => {
			menu.hide();
			card.removeClass("is-color-picker-open");
		});
	}

	private toggleColorPicker(card: HTMLElement): void {
		const menu = card.querySelector<HTMLElement>(".side-mark-color-menu");
		const cardMenu = card.querySelector<HTMLElement>(".side-mark-card-menu");
		if (!menu) {
			return;
		}
		if (menu.isShown()) {
			menu.hide();
			card.removeClass("is-color-picker-open");
			return;
		}
		cardMenu?.hide();
		this.positionColorMenu(card);
		menu.show();
		card.addClass("is-color-picker-open");
	}

	private positionColorMenu(card: HTMLElement): void {
		const menu = card.querySelector<HTMLElement>(".side-mark-color-menu");
		const toolbar = card.querySelector<HTMLElement>(".side-mark-card-toolbar");
		if (!menu || !toolbar) {
			return;
		}
		menu.style.top = `${toolbar.offsetTop + toolbar.offsetHeight + 4}px`;
		menu.style.right = `${Math.max(4, card.clientWidth - toolbar.offsetLeft - toolbar.offsetWidth)}px`;
	}

	private renderCardToolbar(card: HTMLElement, mark: SideMark): void {
		const toolbar = card.createDiv({ cls: "side-mark-card-toolbar" });
		this.addIconAction(toolbar, "chevrons-up", this.t("sidebar.locate"), () => void this.plugin.jumpToMark(mark.id));
		this.addSyncAction(toolbar, mark);
		this.addIconAction(toolbar, "palette", this.t("sidebar.pickColor"), (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.toggleColorPicker(card);
		});
		this.addIconAction(
			toolbar,
			mark.status === "resolved" ? "circle" : "circle-check",
			mark.status === "resolved" ? this.t("sidebar.restore") : this.t("sidebar.resolve"),
			() => void this.toggleResolved(mark.id)
		);
		const more = toolbar.createEl("button", {
			cls: "side-mark-card-icon-button",
			attr: { type: "button", title: this.t("sidebar.more"), "aria-label": this.t("sidebar.more") }
		});
		setIcon(more, "more-horizontal");
		const menu = card.createDiv({ cls: "side-mark-card-menu is-compact" });
		menu.hide();
		this.addMenuAction(menu, "trash-2", this.t("toolbar.delete"), () => void this.deleteMark(mark.id));
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
			thread.createDiv({ cls: "side-mark-empty-thread", text: this.t("sidebar.emptyThread") });
			return;
		}

		for (const [index, reply] of replies.entries()) {
			const isThreadHead = index === 0;
			const row = thread.createDiv({ cls: `side-mark-reply${isThreadHead ? " is-thread-head" : " is-continuation"}` });
			if (isThreadHead) {
				const authorName = reply.authorName || this.plugin.settings.commentAuthorName;
				const avatar = row.createDiv({ cls: "side-mark-avatar", text: authorName.slice(0, 1) || this.plugin.settings.commentAuthorName.slice(0, 1) });
				avatar.setAttr("aria-hidden", "true");
			}
			const body = row.createDiv({ cls: "side-mark-reply-body" });
			const meta = body.createDiv({ cls: "side-mark-reply-meta" });
			if (isThreadHead) {
				meta.createSpan({
					cls: "side-mark-reply-author",
					text: reply.authorName || this.plugin.settings.commentAuthorName
				});
			}
			meta.createSpan({ cls: "side-mark-reply-time", text: formatReplyTime(reply.createdAt, (key, params) => this.t(key, params)) });
			const content = body.createDiv({
				cls: "side-mark-reply-content",
				text: reply.content,
				attr: { title: this.t("sidebar.editCommentTitle") }
			});
			this.addInlineDeleteAction(content, this.t("sidebar.deleteComment"), () => {
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
			text: this.t("popover.cancel"),
			cls: "side-mark-secondary-button",
			attr: { type: "button" }
		});
		const save = actions.createEl("button", {
			text: this.t("popover.save"),
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
			text: this.t("sidebar.replyTrigger"),
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
			attr: { placeholder: this.t("sidebar.replyPlaceholder") }
		});
		textarea.hide();
		const row = composer.createDiv({ cls: "side-mark-reply-composer-actions" });
		row.hide();
		const cancel = row.createEl("button", {
			text: this.t("popover.cancel"),
			cls: "side-mark-secondary-button",
			attr: { type: "button" }
		});
		const submit = row.createEl("button", {
			text: this.t("sidebar.reply"),
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
			button.setAttr("title", this.t("sidebar.confirmDelete"));
			button.setAttr("aria-label", this.t("sidebar.confirmDelete"));
			button.empty();
			button.createSpan({ text: this.t("sidebar.confirm") });
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
			? this.t("sidebar.syncedToLark")
			: status === "failed"
				? this.t("sidebar.syncLarkFailed")
				: this.t("sidebar.syncToLark");
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
				button.setAttr("title", this.t("sidebar.confirmDelete"));
				button.setAttr("aria-label", this.t("sidebar.confirmDelete"));
				iconEl.empty();
				labelEl.setText(this.t("sidebar.confirm"));
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
			new Notice(this.t("notice.syncedToLark"));
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

function getFileName(filePath: string): string {
	return filePath.split("/").pop() || filePath;
}

function getVaultMarkSummary(mark: SideMark): string {
	const replies = (mark.replies || []).map((reply) => reply.content.trim()).filter(Boolean);
	if (replies.length > 0) {
		return replies.join(" · ");
	}
	return mark.note.content.trim();
}

function formatReplyTime(value: string, t: (key: I18nKey, params?: Record<string, string | number>) => string): string {
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) {
		return "";
	}
	const diffMs = Date.now() - timestamp;
	if (diffMs < 60_000) {
		return t("sidebar.justNow");
	}
	if (diffMs < 3_600_000) {
		return t("sidebar.minutesAgo", { count: Math.floor(diffMs / 60_000) });
	}
	if (diffMs < 86_400_000) {
		return t("sidebar.hoursAgo", { count: Math.floor(diffMs / 3_600_000) });
	}
	return new Date(timestamp).toLocaleDateString();
}
