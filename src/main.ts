import { addIcon, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { createSideMarkEditorExtension } from "./editor-extension";
import { CommentPopover } from "./comment-popover";
import { HoverBlockToolbar, type HoverBlockAction, type HoverBlockTarget } from "./hover-block-toolbar";
import { ReadingSelectionToolbar } from "./reading-selection-toolbar";
import { SelectionToolbar, type ToolbarAction } from "./selection-toolbar";
import { SideMarkStore } from "./storage";
import { DEFAULT_SETTINGS, type MarkColor, type SideMarkDocument, type SideMarkSettings } from "./types";
import { SIDE_MARK_VIEW_TYPE, SideMarkSidebarView } from "./sidebar-view";
import { getLarkSyncPluginStatus, getLarkSyncPluginStatusClass, getLarkSyncPluginStatusText, syncMarkToLark as syncMarkToLarkBridge } from "./lark-bridge";
import { renderReadingMarks } from "./reading-view-renderer";
import { FLOAT_MARK_ICON_ID, FLOAT_MARK_ICON_SVG } from "./icons";

export default class SideMarkPlugin extends Plugin {
	settings!: SideMarkSettings;
	store!: SideMarkStore;
	currentDocument: SideMarkDocument | null = null;
	private toolbar!: SelectionToolbar;
	private readingToolbar!: ReadingSelectionToolbar;
	private blockToolbar!: HoverBlockToolbar;
	private commentPopover!: CommentPopover;
	private activeEditorView: EditorView | null = null;
	private readingSelection: {
		file: TFile;
		source: string;
		from: number;
		to: number;
		rect: DOMRect;
	} | null = null;
	private lastMarkdownFilePath = "";

	override async onload(): Promise<void> {
		await this.loadSettings();
		addIcon(FLOAT_MARK_ICON_ID, FLOAT_MARK_ICON_SVG);
		this.store = new SideMarkStore(this.app, this.settings);
		this.toolbar = new SelectionToolbar((action) => void this.handleToolbarAction(action));
		this.readingToolbar = new ReadingSelectionToolbar((action) => void this.handleReadingToolbarAction(action));
		this.blockToolbar = new HoverBlockToolbar((action, target) => void this.handleBlockAction(action, target));
		this.commentPopover = new CommentPopover();

		this.registerEditorExtension(createSideMarkEditorExtension(this));
		this.registerMarkdownPostProcessor((element, context) => {
			void this.renderReadingModeMarks(element, context.sourcePath);
		});
		this.registerView(SIDE_MARK_VIEW_TYPE, (leaf: WorkspaceLeaf) => new SideMarkSidebarView(leaf, this));
		this.addRibbonIcon(FLOAT_MARK_ICON_ID, "打开正文标注", () => void this.openSidebar());
		this.addCommand({
			id: "open-side-mark-sidebar",
			name: "打开正文标注",
			callback: () => void this.openSidebar()
		});
		this.addCommand({
			id: "create-side-comment",
			name: "从当前选区创建评论",
			editorCallback: (_editor) => void this.createCommentFromActiveSelection("")
		});
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => void this.reloadCurrentDocument()));
		this.registerDomEvent(document, "selectionchange", () => this.handleReadingSelectionChange());
		this.registerEvent(this.app.vault.on("modify", (file) => {
			if (file instanceof TFile && file.extension === "md" && file.path === this.getActiveMarkdownFile()?.path) {
				void this.reloadCurrentDocument();
			}
		}));
		this.addSettingTab(new SideMarkSettingTab(this));
		await this.reloadCurrentDocument();
	}

	override onunload(): void {
		this.toolbar?.destroy();
		this.readingToolbar?.destroy();
		this.blockToolbar?.destroy();
		this.commentPopover?.destroy();
	}

	async loadSettings(): Promise<void> {
		const saved = await this.loadData() as Partial<SideMarkSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...(saved || {})
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.store?.updateSettings(this.settings);
	}

	getActiveMarkdownFile(): TFile | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view?.file;
		if (file instanceof TFile && file.extension === "md") {
			this.lastMarkdownFilePath = file.path;
			return file;
		}
		if (!this.lastMarkdownFilePath) {
			return null;
		}
		const lastFile = this.app.vault.getFileByPath(this.lastMarkdownFilePath);
		return lastFile instanceof TFile && lastFile.extension === "md" ? lastFile : null;
	}

	showSelectionToolbar(view: EditorView, rect: DOMRect, boundary?: DOMRect): void {
		this.activeEditorView = view;
		this.blockToolbar.hide();
		this.toolbar.show(rect, boundary);
	}

	hideSelectionToolbar(): void {
		this.toolbar.hide();
	}

	showBlockToolbar(view: EditorView, target: HoverBlockTarget): void {
		if (this.toolbar.isVisible()) {
			this.blockToolbar.hide();
			return;
		}
		this.activeEditorView = view;
		this.blockToolbar.show(target);
	}

	scheduleHideBlockToolbar(): void {
		this.blockToolbar.scheduleHide();
	}

	hideBlockToolbar(): void {
		this.blockToolbar.hide();
	}

	async reloadCurrentDocument(): Promise<void> {
		const file = this.getActiveMarkdownFile();
		if (!file) {
			this.currentDocument = null;
			await this.refreshSidebar();
			return;
		}
		const source = await this.app.vault.read(file);
		this.currentDocument = await this.store.relocateDocument(file.path, source);
		await this.refreshSidebar();
	}

	async focusMark(markId: string): Promise<void> {
		await this.openSidebar();
		const view = this.getSidebarView();
		view?.focusMark(markId);
	}

	async updateMarkNote(markId: string, noteContent: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		if (!file) return;
		this.currentDocument = await this.store.updateMark(file.path, markId, { noteContent });
		await this.refreshSidebar();
	}

	async addMarkReply(markId: string, content: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		if (!file) return;
		this.currentDocument = await this.store.addReply(file.path, markId, content);
		await this.refreshSidebar();
		this.syncMarkToLarkInBackground(markId);
	}

	async updateMarkReply(markId: string, replyId: string, content: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		if (!file) return;
		this.currentDocument = await this.store.updateReply(file.path, markId, replyId, content);
		await this.refreshSidebar();
	}

	async toggleResolved(markId: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!file || !mark) return;
		this.currentDocument = await this.store.updateMark(file.path, markId, {
			status: mark.status === "resolved" ? "active" : "resolved"
		});
		await this.refreshSidebar();
	}

	async updateMarkColor(markId: string, color: MarkColor): Promise<void> {
		const file = this.getActiveMarkdownFile();
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!file || !mark) return;
		this.currentDocument = await this.store.updateMark(file.path, markId, {
			mark: {
				...mark.mark,
				color
			}
		});
		this.activeEditorView?.dispatch({ effects: [] });
		await this.refreshSidebar();
	}

	async deleteMark(markId: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		if (!file) return;
		this.currentDocument = await this.store.deleteMark(file.path, markId);
		await this.refreshSidebar();
	}

	async jumpToMark(markId: string): Promise<void> {
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!mark) return;
		const view = await this.ensureMarkdownViewForFile(mark.filePath);
		if (!mark || !view) return;
		if (view.getMode() === "preview") {
			if (this.jumpToReadingMark(markId)) {
				return;
			}
			await this.setMarkdownViewMode(view, "source");
		}
		view.editor.setSelection(
			view.editor.offsetToPos(mark.anchor.startOffset),
			view.editor.offsetToPos(mark.anchor.endOffset)
		);
		view.editor.scrollIntoView({
			from: view.editor.offsetToPos(mark.anchor.startOffset),
			to: view.editor.offsetToPos(mark.anchor.endOffset)
		}, true);
	}

	async syncMarkToLark(markId: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!file || !mark) {
			return;
		}
		const source = await this.app.vault.read(file);
		try {
			const remote = await syncMarkToLarkBridge(this, file, source, mark);
			this.currentDocument = await this.store.updateMark(file.path, markId, { remote });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.currentDocument = await this.store.updateMark(file.path, markId, {
				remote: {
					...mark.remote,
					status: "failed",
					error: message
				}
			});
			throw error;
		} finally {
			await this.refreshSidebar();
		}
	}

	private async handleToolbarAction(action: ToolbarAction): Promise<void> {
		const view = this.activeEditorView;
		if (!view) return;
		if (action === "highlight") {
			await this.createMarkFromView(view, "highlight", "");
			return;
		}
		if (action === "comment") {
			this.showCommentPopover(view);
			return;
		}
		if (isSelectionBlockAction(action)) {
			this.applySelectionBlockStyle(view, action);
			return;
		}
		this.applyMarkdownStyle(action);
	}

	private handleReadingSelectionChange(): void {
		window.setTimeout(() => void this.updateReadingSelectionToolbar(), 0);
	}

	private async updateReadingSelectionToolbar(): Promise<void> {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || !selection.toString().trim()) {
			this.readingSelection = null;
			this.readingToolbar.hide();
			return;
		}
		const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
		if (!range) {
			this.readingSelection = null;
			this.readingToolbar.hide();
			return;
		}
		const view = this.findMarkdownPreviewView(range.commonAncestorContainer);
		const file = view?.file;
		if (!view || !(file instanceof TFile) || view.getMode() !== "preview") {
			this.readingSelection = null;
			this.readingToolbar.hide();
			return;
		}
		const selectedText = selection.toString().trim();
		const source = await this.app.vault.read(file);
		const sourceRange = findSourceRangeForReadingSelection(source, selectedText);
		if (!sourceRange) {
			this.readingSelection = null;
			this.readingToolbar.hide();
			return;
		}
		const rect = range.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) {
			this.readingSelection = null;
			this.readingToolbar.hide();
			return;
		}
		this.readingSelection = {
			file,
			source,
			from: sourceRange.from,
			to: sourceRange.to,
			rect
		};
		this.readingToolbar.show(rect, view.contentEl.getBoundingClientRect());
	}

	private findMarkdownPreviewView(node: Node): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.getMode() === "preview" && view.contentEl.contains(node)) {
				return view;
			}
		}
		return null;
	}

	private async handleReadingToolbarAction(action: "highlight" | "comment"): Promise<void> {
		const selection = this.readingSelection;
		if (!selection) {
			return;
		}
		if (action === "highlight") {
			await this.createReadingMark(selection, "highlight", "");
			return;
		}
		this.commentPopover.show(selection.rect, (content) => {
			void this.createReadingMark(selection, "comment", content);
		});
	}

	private async handleBlockAction(action: HoverBlockAction, target: HoverBlockTarget): Promise<void> {
		const view = this.activeEditorView;
		if (!view) return;
		if (action === "comment") {
			await this.createMarkFromOffsets(view, target.from, target.to, "comment", "");
			return;
		}
		if (action === "copy") {
			await navigator.clipboard.writeText(view.state.doc.sliceString(target.from, target.to));
			new Notice("已复制当前块。");
			return;
		}
		this.applyBlockStyle(view, target, action);
	}

	private applyBlockStyle(view: EditorView, target: HoverBlockTarget, action: HoverBlockAction): void {
		const doc = view.state.doc;
		const line = doc.lineAt(target.from);
		const text = line.text;
		const stripped = stripBlockPrefix(text);
		let replacement = text;
		switch (action) {
			case "paragraph":
				replacement = stripped;
				break;
			case "heading-1":
			case "heading-2":
			case "heading-3":
			case "heading-4":
			case "heading-5":
				replacement = `${"#".repeat(Number(action.slice(-1)))} ${stripped}`;
				break;
			case "bullet-list":
				replacement = `- ${stripped}`;
				break;
			case "number-list":
				replacement = `1. ${stripped}`;
				break;
			case "task-list":
				replacement = `- [ ] ${stripped}`;
				break;
			case "quote":
				replacement = `> ${stripped}`;
				break;
			case "code-block":
				replacement = `\`\`\`\n${stripped}\n\`\`\``;
				break;
			case "delete": {
				const deleteTo = line.to < doc.length ? line.to + 1 : line.to;
				view.dispatch({ changes: { from: line.from, to: deleteTo, insert: "" } });
				return;
			}
		}
		view.dispatch({
			changes: {
				from: line.from,
				to: line.to,
				insert: replacement
			}
		});
	}

	private applyMarkdownStyle(action: ToolbarAction): void {
		const editor = this.getActiveEditor();
		if (!editor) return;
		const selected = editor.getSelection();
		if (!selected) return;
		const wrappers: Partial<Record<ToolbarAction, [string, string]>> = {
			bold: ["**", "**"],
			italic: ["*", "*"],
			strike: ["~~", "~~"],
			underline: ["<u>", "</u>"],
			link: ["[", "](https://)"],
			code: ["`", "`"]
		};
		const wrapper = wrappers[action];
		if (!wrapper) return;
		editor.replaceSelection(`${wrapper[0]}${selected}${wrapper[1]}`);
	}

	private applySelectionBlockStyle(view: EditorView, action: ToolbarAction): void {
		const selection = view.state.selection.main;
		const doc = view.state.doc;
		const fromLine = doc.lineAt(selection.from);
		const toLine = doc.lineAt(selection.to);
		const changes = [];
		for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber++) {
			const line = doc.line(lineNumber);
			const stripped = stripBlockPrefix(line.text);
			let replacement = stripped;
			switch (action) {
				case "paragraph":
					replacement = stripped;
					break;
				case "heading-1":
				case "heading-2":
				case "heading-3":
					replacement = `${"#".repeat(Number(action.slice(-1)))} ${stripped}`;
					break;
				case "bullet-list":
					replacement = `- ${stripped}`;
					break;
				case "number-list":
					replacement = `1. ${stripped}`;
					break;
				case "task-list":
					replacement = `- [ ] ${stripped}`;
					break;
				case "quote":
					replacement = `> ${stripped}`;
					break;
				case "code-block":
					if (fromLine.number === toLine.number) {
						replacement = `\`\`\`\n${stripped}\n\`\`\``;
					} else {
						continue;
					}
					break;
				default:
					continue;
			}
			changes.push({ from: line.from, to: line.to, insert: replacement });
		}
		if (changes.length > 0) {
			view.dispatch({ changes });
		}
	}

	private showCommentPopover(view: EditorView): void {
		const selection = view.state.selection.main;
		const rect = view.coordsAtPos(selection.to);
		if (!rect) return;
		const popoverRect = new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
		this.commentPopover.show(popoverRect, (content) => {
			void this.createMarkFromView(view, "comment", content);
		});
	}

	private async createCommentFromActiveSelection(noteContent: string): Promise<void> {
		const view = this.activeEditorView;
		if (!view) {
			new Notice("没有可用的编辑器选区。");
			return;
		}
		await this.createMarkFromView(view, "comment", noteContent);
	}

	private async createMarkFromView(view: EditorView, kind: "highlight" | "comment", noteContent: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		const selection = view.state.selection.main;
		if (!file || selection.empty) {
			return;
		}
		await this.createMarkFromOffsets(view, selection.from, selection.to, kind, noteContent);
	}

	private async createReadingMark(
		selection: NonNullable<SideMarkPlugin["readingSelection"]>,
		kind: "highlight" | "comment",
		noteContent: string
	): Promise<void> {
		const previousMarkIds = new Set((this.currentDocument?.marks || []).map((mark) => mark.id));
		this.currentDocument = await this.store.createMark({
			filePath: selection.file.path,
			source: selection.source,
			startOffset: selection.from,
			endOffset: selection.to,
			kind,
			color: "yellow",
			noteContent
		});
		const createdMark = this.currentDocument.marks.find((mark) => !previousMarkIds.has(mark.id));
		await this.refreshSidebar();
		await this.renderPreviewMarksForFile(selection.file.path);
		this.readingSelection = null;
		window.getSelection()?.removeAllRanges();
		if (this.settings.autoOpenSidebar) {
			await this.openSidebar();
		}
		if (kind === "comment" && createdMark && noteContent.trim()) {
			this.syncMarkToLarkInBackground(createdMark.id);
		}
	}

	private async createMarkFromOffsets(
		view: EditorView,
		from: number,
		to: number,
		kind: "highlight" | "comment",
		noteContent: string
	): Promise<void> {
		const file = this.getActiveMarkdownFile();
		if (!file || from === to) {
			return;
		}
		const previousMarkIds = new Set((this.currentDocument?.marks || []).map((mark) => mark.id));
		this.currentDocument = await this.store.createMark({
			filePath: file.path,
			source: view.state.doc.toString(),
			startOffset: from,
			endOffset: to,
			kind,
			color: "yellow",
			noteContent
		});
		const createdMark = this.currentDocument.marks.find((mark) => !previousMarkIds.has(mark.id));
		await this.refreshSidebar();
		if (this.settings.autoOpenSidebar) {
			await this.openSidebar();
		}
		if (kind === "comment" && createdMark && noteContent.trim()) {
			this.syncMarkToLarkInBackground(createdMark.id);
		}
	}

	private syncMarkToLarkInBackground(markId: string): void {
		if (!this.settings.autoSyncToLark) {
			return;
		}
		void this.syncMarkToLark(markId).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`自动同步飞书失败：${message}`, 8000);
		});
	}

	private getActiveEditor(): Editor | null {
		return this.app.workspace.getActiveViewOfType(MarkdownView)?.editor || null;
	}

	private async renderReadingModeMarks(container: HTMLElement, sourcePath: string): Promise<void> {
		const file = this.app.vault.getFileByPath(sourcePath);
		if (!file || file.extension !== "md") {
			return;
		}
		const [source, document] = await Promise.all([
			this.app.vault.read(file),
			this.store.loadDocument(file.path)
		]);
		renderReadingMarks(container, source, document.marks, (markId) => void this.focusMark(markId));
	}

	private async renderPreviewMarksForFile(filePath: string): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || view.file?.path !== filePath || view.getMode() !== "preview") {
				continue;
			}
			await this.renderReadingModeMarks(view.contentEl, filePath);
		}
	}

	private jumpToReadingMark(markId: string): boolean {
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!mark) {
			return false;
		}
		const markEl = this.findReadingMarkElement(markId, mark.filePath);
		if (!markEl) {
			return false;
		}
		markEl.scrollIntoView({ block: "center", behavior: "smooth" });
		markEl.addClass("side-mark-reading-flash");
		window.setTimeout(() => markEl.removeClass("side-mark-reading-flash"), 1200);
		return true;
	}

	private findReadingMarkElement(markId: string, filePath: string): HTMLElement | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || view.file?.path !== filePath || view.getMode() !== "preview") {
				continue;
			}
			const element = view.contentEl.querySelector<HTMLElement>(`[data-side-mark-reading-id="${markId}"]`);
			if (element) {
				this.app.workspace.revealLeaf(leaf);
				return element;
			}
		}
		return null;
	}

	private async ensureMarkdownViewForFile(filePath: string): Promise<MarkdownView | null> {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === filePath) {
				this.app.workspace.revealLeaf(leaf);
				return view;
			}
		}
		const file = this.app.vault.getFileByPath(filePath);
		if (!file) {
			return null;
		}
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		return leaf.view instanceof MarkdownView ? leaf.view : null;
	}

	private async setMarkdownViewMode(view: MarkdownView, mode: "source" | "preview"): Promise<void> {
		const state = view.leaf.getViewState();
		await view.leaf.setViewState({
			...state,
			state: {
				...(state.state || {}),
				mode
			}
		});
	}

	private async openSidebar(): Promise<void> {
		let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(SIDE_MARK_VIEW_TYPE)[0] || null;
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: SIDE_MARK_VIEW_TYPE, active: true });
		}
		if (leaf) {
			this.app.workspace.revealLeaf(leaf);
			await this.refreshSidebar();
		}
	}

	private getSidebarView(): SideMarkSidebarView | null {
		return this.app.workspace.getLeavesOfType(SIDE_MARK_VIEW_TYPE)[0]?.view as SideMarkSidebarView | null;
	}

	private async refreshSidebar(): Promise<void> {
		await this.getSidebarView()?.render();
	}
}

function stripBlockPrefix(text: string): string {
	return text
		.replace(/^#{1,6}\s+/, "")
		.replace(/^\s*>\s?/, "")
		.replace(/^\s*\[(?: |x|X)\]\s+/, "")
		.replace(/^\s*[-+*]\s+\[(?: |x|X)\]\s+/, "")
		.replace(/^\s*(?:[-+*]|\d+\.)\s+/, "")
		.trim();
}

function isSelectionBlockAction(action: ToolbarAction): boolean {
	return [
		"paragraph",
		"heading-1",
		"heading-2",
		"heading-3",
		"bullet-list",
		"number-list",
		"task-list",
		"quote",
		"code-block"
	].includes(action);
}

function findSourceRangeForReadingSelection(source: string, selectedText: string): { from: number; to: number } | null {
	const directIndex = source.indexOf(selectedText);
	if (directIndex >= 0) {
		return {
			from: directIndex,
			to: directIndex + selectedText.length
		};
	}
	const sourceIndex = buildRenderedSourceIndex(source);
	const renderedSelection = normalizeReadingSelection(selectedText);
	const renderedIndex = sourceIndex.text.indexOf(renderedSelection);
	if (renderedIndex < 0) {
		return null;
	}
	const from = sourceIndex.offsets[renderedIndex];
	const to = sourceIndex.offsets[renderedIndex + renderedSelection.length - 1];
	if (from === undefined || to === undefined) {
		return null;
	}
	return {
		from,
		to: to + 1
	};
}

function buildRenderedSourceIndex(source: string): { text: string; offsets: number[] } {
	let rendered = "";
	const offsets: number[] = [];
	let index = 0;
	const linePrefixPattern = /^(?:[\t ]{0,3}#{1,6}[\t ]+|[\t ]*(?:[-+*]|\d+[.)])[\t ]+|[\t ]{0,3}>[\t ]?)/;
	while (index < source.length) {
		const lineStart = index === 0 || source[index - 1] === "\n";
		if (lineStart) {
			const prefix = source.slice(index).match(linePrefixPattern);
			if (prefix?.[0]) {
				index += prefix[0].length;
				continue;
			}
		}
		const char = source[index] || "";
		if (isMarkdownMarkerAt(source, index)) {
			index += markerLengthAt(source, index);
			continue;
		}
		if (/\s/.test(char)) {
			index += 1;
			continue;
		}
		rendered += char;
		offsets.push(index);
		index += 1;
	}
	return { text: rendered, offsets };
}

function normalizeReadingSelection(text: string): string {
	return text.replace(/\s+/g, "");
}

function isMarkdownMarkerAt(source: string, index: number): boolean {
	return markerLengthAt(source, index) > 0;
}

function markerLengthAt(source: string, index: number): number {
	const marker = source.slice(index, index + 2);
	if (marker === "**" || marker === "__" || marker === "~~") {
		return 2;
	}
	const char = source[index];
	if (char === "*" || char === "_" || char === "`") {
		return 1;
	}
	return 0;
}

class SideMarkSettingTab extends PluginSettingTab {
	constructor(private readonly plugin: SideMarkPlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "FloatMark" });

		new Setting(containerEl)
			.setName("创建标注后打开侧栏")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoOpenSidebar).onChange(async (value) => {
					this.plugin.settings.autoOpenSidebar = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("标注同步飞书")
			.setDesc("开启后，添加本地评论或回复会通过 Feishu Lark CLI Sync 同步到飞书。CLI 配置由该插件管理。")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoSyncToLark).onChange(async (value) => {
					this.plugin.settings.autoSyncToLark = value;
					await this.plugin.saveSettings();
				});
			});
		this.renderLarkSyncPluginStatus(containerEl);

		new Setting(containerEl)
			.setName("评论显示名称")
			.setDesc("用于侧边栏评论线程里的作者名。")
			.addText((text) => {
				text.setValue(this.plugin.settings.commentAuthorName).onChange(async (value) => {
					this.plugin.settings.commentAuthorName = value.trim() || DEFAULT_SETTINGS.commentAuthorName;
					await this.plugin.saveSettings();
				});
			});
	}

	private renderLarkSyncPluginStatus(containerEl: HTMLElement): void {
		const status = getLarkSyncPluginStatus(this.plugin);
		const setting = new Setting(containerEl)
			.setName("Feishu Lark CLI Sync")
			.setDesc("FloatMark 只检测插件状态；飞书 CLI 路径、登录和执行能力由 Feishu Lark CLI Sync 管理。");
		const statusEl = setting.descEl.createDiv({
			cls: `side-mark-lark-sync-plugin-status ${getLarkSyncPluginStatusClass(status)}`,
			text: getLarkSyncPluginStatusText(status)
		});
		statusEl.setAttr("aria-live", "polite");
	}
}
