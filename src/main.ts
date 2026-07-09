import { addIcon, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { createSideMarkEditorExtension } from "./editor-extension";
import { CommentPopover } from "./comment-popover";
import { HoverBlockToolbar, type HoverBlockAction, type HoverBlockTarget } from "./hover-block-toolbar";
import { MarkStylePopover, type MarkStyleChoice } from "./mark-style-popover";
import { ReadingSelectionToolbar } from "./reading-selection-toolbar";
import { SelectionToolbar, type SelectionFormatAction, type ToolbarAction } from "./selection-toolbar";
import { SideMarkStore } from "./storage";
import { DEFAULT_SETTINGS, type MarkBackgroundColor, type MarkColor, type MarkTextColor, type SideMark, type SideMarkDocument, type SideMarkSettings } from "./types";
import { SIDE_MARK_VIEW_TYPE, SideMarkSidebarView } from "./sidebar-view";
import { canSyncMarkToLark, getLarkSyncPluginStatus, getLarkSyncPluginStatusClass, getLarkSyncPluginStatusText, syncMarkToLark as syncMarkToLarkBridge } from "./lark-bridge";
import { renderReadingMarks } from "./reading-view-renderer";
import { findSourceRangeForReadingSelection, getReadingSelectionRect, getReadingSelectionRenderedOffset } from "./reading-selection";
import { FLOAT_MARK_ICON_ID, FLOAT_MARK_ICON_SVG } from "./icons";

const READING_SELECTION_TOOLBAR_DELAY_MS = 300;
const READING_SELECTION_HIGHLIGHT_NAME = "side-mark-reading-selection";

type CssHighlightRegistry = {
	set(name: string, highlight: unknown): void;
	delete(name: string): void;
};

type HighlightConstructor = new (...ranges: Range[]) => unknown;

export default class SideMarkPlugin extends Plugin {
	settings!: SideMarkSettings;
	store!: SideMarkStore;
	currentDocument: SideMarkDocument | null = null;
	private toolbar!: SelectionToolbar;
	private readingToolbar!: ReadingSelectionToolbar;
	private blockToolbar!: HoverBlockToolbar;
	private commentPopover!: CommentPopover;
	private markStylePopover!: MarkStylePopover;
	private activeEditorView: EditorView | null = null;
	private pendingCommentSelection: {
		filePath: string;
		from: number;
		to: number;
	} | null = null;
	private readingSelection: {
		file: TFile;
		source: string;
		from: number;
		to: number;
		rect: DOMRect;
		range: Range;
	} | null = null;
	private readingSelectionTimer: number | null = null;
	private readingSelectionRequestId = 0;
	private lastMarkdownFilePath = "";

	override async onload(): Promise<void> {
		await this.loadSettings();
		addIcon(FLOAT_MARK_ICON_ID, FLOAT_MARK_ICON_SVG);
		this.store = new SideMarkStore(this.app, this.settings);
		this.toolbar = new SelectionToolbar((action) => void this.handleToolbarAction(action));
		this.readingToolbar = new ReadingSelectionToolbar((action) => void this.handleReadingToolbarAction(action));
		this.blockToolbar = new HoverBlockToolbar((action, target) => void this.handleBlockAction(action, target));
		this.commentPopover = new CommentPopover();
		this.markStylePopover = new MarkStylePopover();

		this.registerEditorExtension(createSideMarkEditorExtension(this));
		this.registerMarkdownPostProcessor((element, context) => {
			void this.renderReadingModeMarks(element, context.sourcePath, context);
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
		this.clearReadingSelectionTimer();
		this.clearReadingSelectionHighlight();
		this.toolbar?.destroy();
		this.readingToolbar?.destroy();
		this.blockToolbar?.destroy();
		this.commentPopover?.destroy();
		this.markStylePopover?.destroy();
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
		const format = getSelectionFormat(view);
		this.toolbar.show(rect, boundary, format);
	}

	setActiveEditorView(view: EditorView): void {
		this.activeEditorView = view;
	}

	hideSelectionToolbar(): void {
		this.toolbar.hide();
	}

	getPendingCommentSelection(filePath: string): { from: number; to: number } | null {
		if (!this.pendingCommentSelection || this.pendingCommentSelection.filePath !== filePath) {
			return null;
		}
		return {
			from: this.pendingCommentSelection.from,
			to: this.pendingCommentSelection.to
		};
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
		await this.refreshMarkViews(file.path);
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

	async deleteMarkReply(markId: string, replyId: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		if (!file) return;
		this.currentDocument = await this.store.deleteReply(file.path, markId, replyId);
		await this.refreshMarkViews(file.path);
	}

	async toggleResolved(markId: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!file || !mark) return;
		this.currentDocument = await this.store.updateMark(file.path, markId, {
			status: mark.status === "resolved" ? "active" : "resolved"
		});
		await this.refreshMarkViews(file.path);
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
		await this.refreshMarkViews(file.path);
	}

	async updateMarkAppearance(markId: string, choice: MarkStyleChoice): Promise<void> {
		const file = this.getActiveMarkdownFile();
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!file || !mark) return;
		if (isDefaultHighlightAppearance(choice)) {
			this.currentDocument = await this.store.deleteMark(file.path, markId);
			this.markStylePopover.hide();
			await this.refreshMarkViews(file.path);
			return;
		}
		this.currentDocument = await this.store.updateMark(file.path, markId, {
			mark: {
				...mark.mark,
				textColor: choice.textColor,
				backgroundColor: choice.backgroundColor
			}
		});
		await this.refreshMarkViews(file.path);
	}

	async openMark(markId: string, rect: DOMRect): Promise<void> {
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!mark) return;
		if (mark.mark.kind !== "highlight") {
			await this.focusMark(markId);
			return;
		}
		this.markStylePopover.show(rect, {
			textColor: mark.mark.textColor,
			backgroundColor: mark.mark.backgroundColor
		}, (choice) => {
			void this.updateMarkAppearance(mark.id, choice);
		}, () => {
			void this.deleteMark(mark.id);
		});
	}

	async deleteMark(markId: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		if (!file) return;
		this.currentDocument = await this.store.deleteMark(file.path, markId);
		this.markStylePopover.hide();
		await this.refreshMarkViews(file.path);
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
			this.showMarkStylePopoverForView(view);
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
		this.clearReadingSelectionTimer();
		const requestId = ++this.readingSelectionRequestId;
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || !selection.toString().trim()) {
			this.readingSelection = null;
			this.readingToolbar.hide();
			return;
		}
		this.readingToolbar.hide();
		this.readingSelectionTimer = window.setTimeout(() => {
			this.readingSelectionTimer = null;
			void this.updateReadingSelectionToolbar(requestId);
		}, READING_SELECTION_TOOLBAR_DELAY_MS);
	}

	private async updateReadingSelectionToolbar(requestId: number): Promise<void> {
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
		const view = this.findMarkdownPreviewViewForRange(range);
		const file = view?.file;
		if (!view || !(file instanceof TFile) || view.getMode() !== "preview") {
			this.readingSelection = null;
			this.readingToolbar.hide();
			return;
		}
		const selectedText = selection.toString().trim();
		const source = await this.app.vault.read(file);
		if (requestId !== this.readingSelectionRequestId) {
			return;
		}
		const renderedOffset = getReadingSelectionRenderedOffset(view.contentEl, range);
		const sourceRange = findSourceRangeForReadingSelection(source, selectedText, renderedOffset);
		if (!sourceRange) {
			this.readingSelection = null;
			this.readingToolbar.hide();
			return;
		}
		const rect = getReadingSelectionRect(range);
		if (!rect) {
			this.readingSelection = null;
			this.readingToolbar.hide();
			return;
		}
		this.readingSelection = {
			file,
			source,
			from: sourceRange.from,
			to: sourceRange.to,
			rect,
			range: range.cloneRange()
		};
		this.readingToolbar.show(rect, view.contentEl.getBoundingClientRect());
	}

	private clearReadingSelectionTimer(): void {
		if (this.readingSelectionTimer !== null) {
			window.clearTimeout(this.readingSelectionTimer);
			this.readingSelectionTimer = null;
		}
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

	private findMarkdownPreviewViewForRange(range: Range): MarkdownView | null {
		return this.findMarkdownPreviewView(range.commonAncestorContainer)
			|| this.findMarkdownPreviewView(range.startContainer)
			|| this.findMarkdownPreviewView(range.endContainer)
			|| this.findMarkdownPreviewViewByContainedRange(range);
	}

	private findMarkdownPreviewViewByContainedRange(range: Range): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || view.getMode() !== "preview") {
				continue;
			}
			const contentRange = document.createRange();
			contentRange.selectNodeContents(view.contentEl);
			const startsInView = range.compareBoundaryPoints(Range.START_TO_START, contentRange) >= 0
				&& range.compareBoundaryPoints(Range.START_TO_END, contentRange) <= 0;
			const endsInView = range.compareBoundaryPoints(Range.END_TO_START, contentRange) >= 0
				&& range.compareBoundaryPoints(Range.END_TO_END, contentRange) <= 0;
			contentRange.detach();
			if (startsInView || endsInView) {
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
			this.showMarkStylePopoverForReadingSelection(selection);
			return;
		}
		const hasPersistentHighlight = this.showReadingSelectionHighlight(selection);
		this.commentPopover.show(selection.rect, (content) => {
			if (!content.trim()) {
				return;
			}
			this.clearReadingSelectionHighlight();
			void this.createReadingMark(selection, "comment", content);
		}, () => {
			this.clearReadingSelectionHighlight();
			this.clearReadingSelection();
		}, { focus: hasPersistentHighlight });
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
			case "heading-6":
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
				case "heading-4":
				case "heading-5":
				case "heading-6":
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
		const rect = getEditorSelectionRect(view) || view.coordsAtPos(selection.to);
		const file = this.getActiveMarkdownFile();
		if (!rect || selection.empty || !file) return;
		const popoverRect = new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
		const from = selection.from;
		const to = selection.to;
		this.pendingCommentSelection = {
			filePath: file.path,
			from,
			to
		};
		this.refreshEditorDecorations();
		this.commentPopover.show(popoverRect, (content) => {
			void this.createMarkFromOffsets(view, from, to, "comment", content);
		}, () => {
			this.clearPendingCommentSelection();
		});
	}

	private showMarkStylePopoverForView(view: EditorView): void {
		const selection = view.state.selection.main;
		const rect = view.coordsAtPos(selection.to);
		if (!rect || selection.empty) return;
		const popoverRect = new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
		let markId = "";
		let createPromise: Promise<SideMark | null> | null = null;
		this.markStylePopover.show(popoverRect, defaultHighlightAppearance(), (choice) => {
			void (async () => {
				if (!markId) {
					if (!createPromise) {
						createPromise = this.createMarkFromOffsets(
							view,
							selection.from,
							selection.to,
							"highlight",
							"",
							choice,
							false
						);
					}
					const createdMark = await createPromise;
					markId = createdMark?.id || "";
					if (markId) {
						await this.updateMarkAppearance(markId, choice);
					}
					return;
				}
				await this.updateMarkAppearance(markId, choice);
			})();
		}, () => {
			if (markId) {
				void this.deleteMark(markId);
			}
		});
	}

	private showMarkStylePopoverForReadingSelection(
		selection: NonNullable<SideMarkPlugin["readingSelection"]>
	): void {
		let markId = "";
		let createPromise: Promise<SideMark | null> | null = null;
		this.markStylePopover.show(selection.rect, defaultHighlightAppearance(), (choice) => {
			void (async () => {
				if (!markId) {
					if (!createPromise) {
						createPromise = this.createReadingMark(
							selection,
							"highlight",
							"",
							choice,
							false
						);
					}
					const createdMark = await createPromise;
					markId = createdMark?.id || "";
					if (markId) {
						await this.updateMarkAppearance(markId, choice);
					}
					return;
				}
				await this.updateMarkAppearance(markId, choice);
			})();
		}, () => {
			if (markId) {
				void this.deleteMark(markId);
			}
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

	private async createMarkFromView(view: EditorView, kind: "highlight" | "comment", noteContent: string): Promise<SideMark | null> {
		const file = this.getActiveMarkdownFile();
		const selection = view.state.selection.main;
		if (!file || selection.empty) {
			return null;
		}
		return this.createMarkFromOffsets(view, selection.from, selection.to, kind, noteContent);
	}

	private async createReadingMark(
		selection: NonNullable<SideMarkPlugin["readingSelection"]>,
		kind: "highlight" | "comment",
		noteContent: string,
		appearance: MarkStyleChoice = defaultHighlightAppearance(),
		autoOpenSidebar = true
	): Promise<SideMark | null> {
		const previousMarkIds = new Set((this.currentDocument?.marks || []).map((mark) => mark.id));
		this.currentDocument = await this.store.createMark({
			filePath: selection.file.path,
			source: selection.source,
			startOffset: selection.from,
			endOffset: selection.to,
			kind,
			color: "yellow",
			textColor: appearance.textColor,
			backgroundColor: appearance.backgroundColor,
			noteContent
		});
		const createdMark = this.currentDocument.marks.find((mark) => !previousMarkIds.has(mark.id));
		await this.refreshSidebar();
		await this.renderPreviewMarksForFile(selection.file.path);
		this.readingSelection = null;
		window.getSelection()?.removeAllRanges();
		if (autoOpenSidebar && this.settings.autoOpenSidebar) {
			await this.openSidebar();
		}
		if (kind === "comment" && createdMark && noteContent.trim()) {
			this.syncMarkToLarkInBackground(createdMark.id);
		}
		return createdMark || null;
	}

	private async createMarkFromOffsets(
		view: EditorView,
		from: number,
		to: number,
		kind: "highlight" | "comment",
		noteContent: string,
		appearance: MarkStyleChoice = defaultHighlightAppearance(),
		autoOpenSidebar = true
	): Promise<SideMark | null> {
		const file = this.getActiveMarkdownFile();
		if (!file || from === to) {
			return null;
		}
		const previousMarkIds = new Set((this.currentDocument?.marks || []).map((mark) => mark.id));
		this.currentDocument = await this.store.createMark({
			filePath: file.path,
			source: view.state.doc.toString(),
			startOffset: from,
			endOffset: to,
			kind,
			color: "yellow",
			textColor: appearance.textColor,
			backgroundColor: appearance.backgroundColor,
			noteContent
		});
		const createdMark = this.currentDocument.marks.find((mark) => !previousMarkIds.has(mark.id));
		await this.refreshSidebar();
		this.refreshEditorDecorations();
		if (autoOpenSidebar && this.settings.autoOpenSidebar) {
			await this.openSidebar();
		}
		if (kind === "comment" && createdMark && noteContent.trim()) {
			this.syncMarkToLarkInBackground(createdMark.id);
		}
		return createdMark || null;
	}

	private refreshEditorDecorations(): void {
		this.activeEditorView?.dispatch({ effects: [] });
	}

	private clearPendingCommentSelection(): void {
		if (!this.pendingCommentSelection) {
			return;
		}
		this.pendingCommentSelection = null;
		this.refreshEditorDecorations();
	}

	private clearReadingSelection(): void {
		this.readingSelection = null;
		window.getSelection()?.removeAllRanges();
	}

	private showReadingSelectionHighlight(selection: NonNullable<SideMarkPlugin["readingSelection"]>): boolean {
		const highlights = getCssHighlights();
		const Highlight = getHighlightConstructor();
		if (!highlights || !Highlight) {
			return false;
		}
		this.clearReadingSelectionHighlight();
		highlights.set(READING_SELECTION_HIGHLIGHT_NAME, new Highlight(selection.range.cloneRange()));
		return true;
	}

	private clearReadingSelectionHighlight(): void {
		getCssHighlights()?.delete(READING_SELECTION_HIGHLIGHT_NAME);
	}

	private async refreshMarkViews(filePath: string): Promise<void> {
		this.refreshEditorDecorations();
		await this.refreshSidebar();
		await this.renderPreviewMarksForFile(filePath);
	}

	private syncMarkToLarkInBackground(markId: string): void {
		if (!this.settings.autoSyncToLark || getLarkSyncPluginStatus(this) !== "enabled") {
			return;
		}
		void this.syncMarkToLarkIfReady(markId).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`自动同步飞书失败：${message}`, 8000);
		});
	}

	private async syncMarkToLarkIfReady(markId: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		if (!file) {
			return;
		}
		const source = await this.app.vault.read(file);
		if (!await canSyncMarkToLark(this, source)) {
			return;
		}
		await this.syncMarkToLark(markId);
	}

	private getActiveEditor(): Editor | null {
		return this.app.workspace.getActiveViewOfType(MarkdownView)?.editor || null;
	}

	private async renderReadingModeMarks(container: HTMLElement, sourcePath: string, context?: MarkdownPostProcessorContext): Promise<void> {
		const file = this.app.vault.getFileByPath(sourcePath);
		if (!file || file.extension !== "md") {
			return;
		}
		const source = await this.app.vault.read(file);
		const document = await this.store.relocateDocument(file.path, source);
		const section = context?.getSectionInfo(container);
		const marks = section ? getMarksInRenderedSection(document.marks, section.lineStart, section.lineEnd) : document.marks;
		renderReadingMarks(container, source, marks, (markId, rect) => void this.openMark(markId, rect));
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
		"heading-4",
		"heading-5",
		"heading-6",
		"bullet-list",
		"number-list",
		"task-list",
		"quote",
		"code-block"
	].includes(action);
}

function getSelectionFormat(view: EditorView): SelectionFormatAction {
	const selection = view.state.selection.main;
	const line = view.state.doc.lineAt(selection.from);
	const heading = line.text.match(/^(#{1,6})\s+/);
	if (heading) {
		const level = heading[1]?.length || 1;
		return `heading-${level}` as SelectionFormatAction;
	}
	if (/^\s*[-+*]\s+\[(?: |x|X)\]\s+/.test(line.text)) {
		return "task-list";
	}
	if (/^\s*\d+\.\s+/.test(line.text)) {
		return "number-list";
	}
	if (/^\s*[-+*]\s+/.test(line.text)) {
		return "bullet-list";
	}
	if (/^\s*>/.test(line.text)) {
		return "quote";
	}
	if (/^\s*```/.test(line.text)) {
		return "code-block";
	}
	return "paragraph";
}

function getEditorSelectionRect(view: EditorView): DOMRect | null {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		return null;
	}
	const range = selection.getRangeAt(0);
	const common = range.commonAncestorContainer;
	const element = common instanceof HTMLElement ? common : common.parentElement;
	if (!element || !view.dom.contains(element)) {
		return null;
	}
	const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
	if (rects.length === 0) {
		const rect = range.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0 ? rect : null;
	}
	return getBoundingRect(rects);
}

function getBoundingRect(rects: DOMRect[]): DOMRect | null {
	const first = rects[0];
	if (!first) {
		return null;
	}
	const left = Math.min(...rects.map((rect) => rect.left));
	const top = Math.min(...rects.map((rect) => rect.top));
	const right = Math.max(...rects.map((rect) => rect.right));
	const bottom = Math.max(...rects.map((rect) => rect.bottom));
	return new DOMRect(left, top, right - left, bottom - top);
}

function defaultHighlightAppearance(): MarkStyleChoice {
	return {
		textColor: "default",
		backgroundColor: "none"
	};
}

function isDefaultHighlightAppearance(choice: MarkStyleChoice): boolean {
	return choice.textColor === "default" && choice.backgroundColor === "none";
}

function getMarksInRenderedSection(marks: SideMark[], sectionLineStart: number, sectionLineEnd: number): SideMark[] {
	return marks.filter((mark) => {
		const markLineStart = mark.anchor.position.lineStart - 1;
		const markLineEnd = mark.anchor.position.lineEnd - 1;
		return markLineEnd >= sectionLineStart && markLineStart <= sectionLineEnd;
	});
}

function getCssHighlights(): CssHighlightRegistry | null {
	if (typeof CSS === "undefined") {
		return null;
	}
	const css = CSS as typeof CSS & { highlights?: CssHighlightRegistry };
	return css.highlights || null;
}

function getHighlightConstructor(): HighlightConstructor | null {
	const globalWindow = window as Window & { Highlight?: HighlightConstructor };
	return typeof globalWindow.Highlight === "function" ? globalWindow.Highlight : null;
}

class SideMarkSettingTab extends PluginSettingTab {
	constructor(private readonly plugin: SideMarkPlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName("FloatMark").setHeading();

		new Setting(containerEl)
			.setName("创建标注后打开侧栏")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoOpenSidebar).onChange(async (value) => {
					this.plugin.settings.autoOpenSidebar = value;
					await this.plugin.saveSettings();
				});
			});

		this.renderLarkSyncSetting(containerEl);

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

	private renderLarkSyncSetting(containerEl: HTMLElement): void {
		const status = getLarkSyncPluginStatus(this.plugin);
		const canEnableSync = status === "enabled";
		const setting = new Setting(containerEl)
			.setName("标注同步飞书")
			.setDesc("开启后，添加本地评论或回复会通过 Feishu Lark CLI Sync 同步到飞书。CLI 配置由该插件管理。")
			.addToggle((toggle) => {
				toggle.setValue(canEnableSync && this.plugin.settings.autoSyncToLark).onChange(async (value) => {
					if (value && !canEnableSync) {
						toggle.setValue(false);
						this.plugin.settings.autoSyncToLark = false;
						await this.plugin.saveSettings();
						new Notice(`${getLarkSyncPluginStatusText(status)} 无法开启标注同步，请先安装并启用该插件。`, 8000);
						return;
					}
					this.plugin.settings.autoSyncToLark = value;
					await this.plugin.saveSettings();
				});
			});
		const statusEl = setting.descEl.createDiv({
			cls: `side-mark-lark-sync-plugin-status ${getLarkSyncPluginStatusClass(status)}`,
			text: getLarkSyncPluginStatusText(status)
		});
		statusEl.setAttr("aria-live", "polite");
	}
}
