import { addIcon, type Command, Editor, getLanguage, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import type { ChangeDesc } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createSideMarkEditorExtension } from "./editor-extension";
import { mergePendingEditorAnchorUpdates, reconcileEditorMarks } from "./editor-anchor-tracker";
import { CommentPopover } from "./comment-popover";
import { HoverBlockToolbar, type HoverBlockAction, type HoverBlockTarget } from "./hover-block-toolbar";
import { MarkStylePopover, type MarkStyleChoice } from "./mark-style-popover";
import { ReadingSelectionToolbar } from "./reading-selection-toolbar";
import { SelectionToolbar, type SelectionFormatAction, type ToolbarAction } from "./selection-toolbar";
import { type MarkAnchorUpdate, SideMarkStore } from "./storage";
import { DEFAULT_SETTINGS, type MarkColor, normalizeScopeControlStyle, type RemoteSyncState, type ScopeControlStyle, type SideMark, type SideMarkDocument, type SideMarkSettings } from "./types";
import { SIDE_MARK_VIEW_TYPE, SideMarkSidebarView } from "./sidebar-view";
import {
	canSyncMarkToLark,
	deleteLarkComment,
	deleteLarkCommentReply,
	getLarkSyncPluginStatus,
	getLarkSyncPluginStatusClass,
	getLarkSyncPluginStatusText,
	setLarkCommentResolved,
	syncMarkToLark as syncMarkToLarkBridge
} from "./lark-bridge";
import {
	buildSourceLineStarts,
	getReadingMarkElements,
	getReadingMarksForSection,
	renderReadingMarks
} from "./reading-view-renderer";
import {
	findSourceRangeForReadingSelection,
	getReadingSelectionContext,
	getReadingSelectionRect
} from "./reading-selection";
import { FLOAT_MARK_ICON_ID, FLOAT_MARK_ICON_SVG } from "./icons";
import { getActiveDocument, getActiveSelection, isHtmlElement } from "./dom-utils";
import { getDefaultCommentAuthorName, getInitialPluginLanguage, normalizePluginLanguage, translate, type I18nKey, type PluginLanguage } from "./i18n";
import { NavigationGuard } from "./navigation-guard";
import { resolvePreviewSectionBounds, selectPreviewSections, type PreviewSectionBounds } from "./preview-sections";

const READING_SELECTION_TOOLBAR_DELAY_MS = 100;
const READING_SELECTION_HIGHLIGHT_NAME = "side-mark-reading-selection";
const EDITOR_DOCUMENT_SAVE_DELAY_MS = 150;

type CssHighlightRegistry = {
	set(name: string, highlight: unknown): void;
	delete(name: string): void;
};

type HighlightConstructor = new (...ranges: Range[]) => unknown;

interface PreviewObserverState {
	root: HTMLElement;
	observer: MutationObserver;
	isObserving: boolean;
}

interface PreviewSection extends PreviewSectionBounds {
	el: HTMLElement;
}

interface SourceLineStartsCacheEntry {
	mtime: number;
	size: number;
	lineStarts: number[];
}

interface ReadingRenderSnapshot {
	source: string;
	document: SideMarkDocument;
	lineStarts: number[];
}

interface ReadingRenderSnapshotLoad {
	sourceVersion: string;
	storeRevision: number;
	load: Promise<ReadingRenderSnapshot>;
}

export default class SideMarkPlugin extends Plugin {
	settings!: SideMarkSettings;
	store!: SideMarkStore;
	currentDocument: SideMarkDocument | null = null;
	private toolbar!: SelectionToolbar;
	private readingToolbar!: ReadingSelectionToolbar;
	private blockToolbar!: HoverBlockToolbar;
	private commentPopover!: CommentPopover;
	private markStylePopover!: MarkStylePopover;
	private settingTab!: SideMarkSettingTab;
	private ribbonIconEl: HTMLElement | null = null;
	private registeredCommandIds: string[] = [];
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
	private readingSelectionUnresolved = false;
	private readonly editorDocumentSaveTimers = new Map<string, number>();
	private readonly pendingEditorAnchorUpdatesByFile = new Map<string, Map<string, MarkAnchorUpdate>>();
	private readingSelectionRequestId = 0;
	private lastMarkdownFilePath = "";
	private readonly previewObservers = new Map<MarkdownView, PreviewObserverState>();
	private readonly previewRenderTimers = new Map<MarkdownView, number>();
	private readonly previewRenderGenerations = new Map<MarkdownView, number>();
	private readonly readingContainerGenerations = new WeakMap<HTMLElement, number>();
	private readonly readingRenderSnapshots = new Map<string, ReadingRenderSnapshotLoad>();
	private readonly sourceLineStartsCache = new Map<string, SourceLineStartsCacheEntry>();
	private readonly documentMarkNavigation = new NavigationGuard();
	private scopeControlStyleSave: Promise<void> = Promise.resolve();

	override async onload(): Promise<void> {
		await this.loadSettings();
		addIcon(FLOAT_MARK_ICON_ID, FLOAT_MARK_ICON_SVG);
		this.store = new SideMarkStore(this.app, this.settings);
		this.createFloatingControls();

		this.registerEditorExtension(createSideMarkEditorExtension(this));
		this.registerMarkdownPostProcessor((element, context) => {
			void this.renderReadingModeMarks(element, context.sourcePath, context);
		});
		this.registerView(SIDE_MARK_VIEW_TYPE, (leaf: WorkspaceLeaf) => new SideMarkSidebarView(leaf, this));
		this.ribbonIconEl = this.addRibbonIcon(FLOAT_MARK_ICON_ID, this.t("app.openSidebar"), () => void this.openSidebar());
		this.registerLocalizedCommands();
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
			void this.reloadCurrentDocument();
			this.syncPreviewMarkObservers();
		}));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.syncPreviewMarkObservers()));
		this.registerDomEvent(getActiveDocument(), "selectionchange", () => this.handleReadingSelectionChange());
		this.registerEvent(this.app.vault.on("modify", (file) => {
			if (file instanceof TFile && file.extension === "md") {
				this.invalidateReadingRenderSnapshot(file.path);
				this.sourceLineStartsCache.delete(file.path);
				if (file.path === this.getActiveMarkdownFile()?.path) {
					void this.reloadCurrentDocument();
				}
			}
		}));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			if (file instanceof TFile && file.extension === "md") {
				this.invalidateReadingRenderSnapshot(oldPath);
				this.invalidateReadingRenderSnapshot(file.path);
				this.sourceLineStartsCache.delete(oldPath);
				this.sourceLineStartsCache.delete(file.path);
				void this.handleMarkdownRename(file.path, oldPath).catch((error) => {
					console.error(`FloatMark: failed to migrate sidecar from ${oldPath} to ${file.path}`, error);
				});
			}
		}));
		this.registerEvent(this.app.vault.on("delete", (file) => {
			if (file instanceof TFile && file.extension === "md") {
				this.invalidateReadingRenderSnapshot(file.path);
				this.sourceLineStartsCache.delete(file.path);
				void this.handleMarkdownDelete(file.path).catch((error) => {
					console.error(`FloatMark: failed to delete sidecar for ${file.path}`, error);
				});
			}
		}));
		this.settingTab = new SideMarkSettingTab(this);
		this.addSettingTab(this.settingTab);
		await this.reloadCurrentDocument();
		this.syncPreviewMarkObservers();
	}

	override onunload(): void {
		this.clearPreviewMarkObservers();
		this.readingRenderSnapshots.clear();
		this.sourceLineStartsCache.clear();
		this.clearReadingSelectionTimer();
		this.flushPendingEditorAnchorUpdates();
		this.clearEditorDocumentSaveTimers();
		this.clearReadingSelectionHighlight();
		this.toolbar?.destroy();
		this.readingToolbar?.destroy();
		this.blockToolbar?.destroy();
		this.commentPopover?.destroy();
		this.markStylePopover?.destroy();
	}

	async loadSettings(): Promise<void> {
		const saved = await this.loadData() as Partial<SideMarkSettings> | null;
		const hasSavedLanguage = saved?.language === "zh-CN" || saved?.language === "en";
		const language = hasSavedLanguage
			? saved.language as PluginLanguage
			: getInitialPluginLanguage(this.app, getLanguage());
		const commentAuthorName = saved?.commentAuthorName || getDefaultCommentAuthorName(language);
		const scopeControlStyle = normalizeScopeControlStyle(saved?.scopeControlStyle);
		this.settings = {
			...DEFAULT_SETTINGS,
			...(saved || {}),
			language,
			commentAuthorName,
			scopeControlStyle
		};
		if (!hasSavedLanguage) {
			await this.saveData(this.settings);
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.store?.updateSettings(this.settings);
	}

	t(key: I18nKey, params?: Record<string, string | number>): string {
		return translate(this.settings.language, key, params);
	}

	async setLanguage(language: PluginLanguage): Promise<void> {
		const nextLanguage = normalizePluginLanguage(language, "zh-CN");
		if (this.settings.language === nextLanguage) {
			return;
		}
		this.settings.language = nextLanguage;
		await this.saveSettings();
		await this.refreshLanguage();
	}

	async setScopeControlStyle(style: ScopeControlStyle): Promise<void> {
		if (this.settings.scopeControlStyle === style) {
			return;
		}
		this.settings.scopeControlStyle = style;
		this.scopeControlStyleSave = this.scopeControlStyleSave.catch(() => undefined).then(() => this.saveSettings());
		await this.scopeControlStyleSave;
		await this.refreshSidebar();
	}

	private async refreshLanguage(): Promise<void> {
		this.toolbar?.destroy();
		this.readingToolbar?.destroy();
		this.blockToolbar?.destroy();
		this.commentPopover?.destroy();
		this.markStylePopover?.destroy();
		this.createFloatingControls();
		this.refreshRibbonTooltip();
		this.refreshLocalizedCommands();
		this.settingTab?.display();
		await this.refreshSidebar();
	}

	private registerLocalizedCommands(): void {
		this.registerCommand({
			id: "open-side-mark-sidebar",
			name: this.t("app.openSidebar"),
			callback: () => void this.openSidebar()
		});
		this.registerCommand({
			id: "create-side-comment",
			name: this.t("app.createCommentFromSelection"),
			editorCallback: (_editor) => void this.createCommentFromActiveSelection("")
		});
	}

	private registerCommand(command: Command): void {
		const registeredCommand = this.addCommand(command);
		this.registeredCommandIds.push(registeredCommand.id);
	}

	private refreshLocalizedCommands(): void {
		for (const commandId of this.registeredCommandIds) {
			this.removeCommand(commandId);
		}
		this.registeredCommandIds = [];
		this.registerLocalizedCommands();
	}

	private refreshRibbonTooltip(): void {
		const label = this.t("app.openSidebar");
		this.ribbonIconEl?.setAttr("aria-label", label);
		this.ribbonIconEl?.setAttr("title", label);
	}

	private createFloatingControls(): void {
		this.toolbar = new SelectionToolbar((action) => void this.handleToolbarAction(action), (key) => this.t(key));
		this.readingToolbar = new ReadingSelectionToolbar((action) => void this.handleReadingToolbarAction(action), (key) => this.t(key));
		this.blockToolbar = new HoverBlockToolbar((action, target) => void this.handleBlockAction(action, target), (key) => this.t(key));
		this.commentPopover = new CommentPopover((key) => this.t(key));
		this.markStylePopover = new MarkStylePopover((key) => this.t(key));
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
			this.refreshEditorDecorations();
			await this.refreshSidebar();
			return;
		}
		const source = await this.app.vault.read(file);
		this.currentDocument = await this.store.relocateDocument(file.path, source);
		this.refreshEditorDecorations();
		await this.refreshSidebar();
	}

	handleEditorDocumentChange(filePath: string, source: string, changes: ChangeDesc): void {
		if (!this.currentDocument || this.currentDocument.filePath !== filePath) {
			return;
		}
		const previousMarks = this.currentDocument.marks;
		const nextMarks = reconcileEditorMarks(previousMarks, source, changes);
		this.currentDocument = {
			...this.currentDocument,
			marks: nextMarks
		};
		this.scheduleEditorDocumentSave(filePath, previousMarks, nextMarks);
	}

	private scheduleEditorDocumentSave(filePath: string, previousMarks: SideMark[], nextMarks: SideMark[]): void {
		if (!this.currentDocument || this.currentDocument.filePath !== filePath) {
			return;
		}
		const pending = this.pendingEditorAnchorUpdatesByFile.get(filePath) || new Map<string, MarkAnchorUpdate>();
		mergePendingEditorAnchorUpdates(pending, previousMarks, nextMarks);
		if (pending.size === 0) {
			return;
		}
		this.pendingEditorAnchorUpdatesByFile.set(filePath, pending);
		this.scheduleEditorDocumentSaveTimer(filePath);
	}

	private scheduleEditorDocumentSaveTimer(filePath: string): void {
		this.clearEditorDocumentSaveTimer(filePath);
		const timer = window.setTimeout(() => {
			this.editorDocumentSaveTimers.delete(filePath);
			const pending = this.pendingEditorAnchorUpdatesByFile.get(filePath);
			if (!pending) {
				return;
			}
			this.pendingEditorAnchorUpdatesByFile.delete(filePath);
			void this.saveEditorMarkAnchors(filePath, Array.from(pending.values()));
		}, EDITOR_DOCUMENT_SAVE_DELAY_MS);
		this.editorDocumentSaveTimers.set(filePath, timer);
	}

	private clearEditorDocumentSaveTimer(filePath: string): void {
		const timer = this.editorDocumentSaveTimers.get(filePath);
		if (timer === undefined) {
			return;
		}
		window.clearTimeout(timer);
		this.editorDocumentSaveTimers.delete(filePath);
	}

	private clearEditorDocumentSaveTimers(): void {
		for (const filePath of this.editorDocumentSaveTimers.keys()) {
			this.clearEditorDocumentSaveTimer(filePath);
		}
	}

	private migratePendingEditorAnchorUpdates(oldFilePath: string, newFilePath: string): void {
		const pending = this.pendingEditorAnchorUpdatesByFile.get(oldFilePath);
		this.clearEditorDocumentSaveTimer(oldFilePath);
		if (!pending) {
			return;
		}
		this.pendingEditorAnchorUpdatesByFile.delete(oldFilePath);
		this.pendingEditorAnchorUpdatesByFile.set(newFilePath, pending);
		this.scheduleEditorDocumentSaveTimer(newFilePath);
	}

	private discardPendingEditorAnchorUpdates(filePath: string): void {
		this.clearEditorDocumentSaveTimer(filePath);
		this.pendingEditorAnchorUpdatesByFile.delete(filePath);
	}

	private flushPendingEditorAnchorUpdates(): void {
		for (const [filePath, pending] of this.pendingEditorAnchorUpdatesByFile) {
			const updates = Array.from(pending.values());
			void this.store.updateMarkAnchors(filePath, updates).catch((error) => {
				console.error(`FloatMark: failed to flush editor anchors for ${filePath}`, error);
			});
		}
		this.pendingEditorAnchorUpdatesByFile.clear();
	}

	private async saveEditorMarkAnchors(filePath: string, updates: MarkAnchorUpdate[]): Promise<void> {
		try {
			const result = await this.store.updateMarkAnchors(filePath, updates);
			if (!result.changed) {
				return;
			}
			this.invalidateReadingRenderSnapshot(filePath);
			const document = this.currentDocument?.filePath === filePath
				? this.currentDocument
				: result.document;
			const refreshes = [this.renderPreviewMarksForFile(filePath, document)];
			if (result.statusChanged) {
				refreshes.push(this.refreshSidebar());
			}
			await Promise.all(refreshes);
		} catch (error) {
			console.error(`FloatMark: failed to save editor anchors for ${filePath}`, error);
		}
	}

	private async handleMarkdownRename(newFilePath: string, oldFilePath: string): Promise<void> {
		this.migratePendingEditorAnchorUpdates(oldFilePath, newFilePath);
		await this.store.renameDocument(oldFilePath, newFilePath);
		await this.reloadCurrentDocument();
	}

	private async handleMarkdownDelete(filePath: string): Promise<void> {
		this.discardPendingEditorAnchorUpdates(filePath);
		await this.store.deleteDocument(filePath);
		if (this.currentDocument?.filePath === filePath) {
			this.currentDocument = null;
		}
		await this.refreshSidebar();
	}

	async focusMark(markId: string): Promise<void> {
		await this.openSidebar();
		const view = this.getSidebarView();
		view?.focusMark(markId);
	}

	async updateMarkNote(markId: string, noteContent: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!file) return;
		this.currentDocument = await this.store.updateMark(file.path, markId, { noteContent });
		await this.refreshMarkViews(file.path, mark);
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
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!file || !mark) return;
		this.currentDocument = await this.store.deleteReply(file.path, markId, replyId);
		await this.refreshMarkViews(file.path, mark);
		this.deleteRemoteCommentReplyInBackground(file, mark, replyId);
	}

	async toggleResolved(markId: string): Promise<void> {
		const file = this.getActiveMarkdownFile();
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!file || !mark) return;
		const nextStatus = mark.status === "resolved" ? "active" : "resolved";
		this.currentDocument = await this.store.updateMark(file.path, markId, {
			status: nextStatus
		});
		await this.refreshMarkViews(file.path, mark);
		this.syncRemoteCommentResolutionInBackground(mark, nextStatus === "resolved");
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
		await this.refreshMarkViews(file.path, mark);
	}

	async updateMarkAppearance(markId: string, choice: MarkStyleChoice): Promise<void> {
		const file = this.getActiveMarkdownFile();
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!file || !mark) return;
		if (isDefaultHighlightAppearance(choice)) {
			this.currentDocument = await this.store.deleteMark(file.path, markId);
			this.markStylePopover.hide();
			await this.refreshMarkViews(file.path, mark);
			return;
		}
		this.currentDocument = await this.store.updateMark(file.path, markId, {
			mark: {
				...mark.mark,
				textColor: choice.textColor,
				backgroundColor: choice.backgroundColor
			}
		});
		await this.refreshMarkViews(file.path, mark);
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
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!file || !mark) return;
		this.currentDocument = await this.store.deleteMark(file.path, markId);
		this.markStylePopover.hide();
		await this.refreshMarkViews(file.path, mark);
		this.deleteRemoteCommentInBackground(mark);
	}

	async jumpToMark(markId: string): Promise<void> {
		const generation = this.documentMarkNavigation.begin();
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!mark) {
			return;
		}
		const file = this.app.vault.getFileByPath(mark.filePath);
		if (!(file instanceof TFile) || file.extension !== "md") {
			return;
		}
		const view = await this.ensureMarkdownViewForFile(mark.filePath);
		if (!view || !this.isCurrentDocumentMarkNavigation(generation, mark.filePath, file, view)) {
			return;
		}
		const isCurrent = () => this.isCurrentDocumentMarkNavigation(generation, mark.filePath, file, view);
		await this.locateMarkInView(view, mark, isCurrent);
		if (!isCurrent()) {
			return;
		}
	}

	async jumpToDocumentMark(filePath: string, markId: string): Promise<void> {
		const generation = this.documentMarkNavigation.begin();
		const file = this.app.vault.getFileByPath(filePath);
		if (!(file instanceof TFile) || file.extension !== "md") {
			new Notice(this.t("notice.markFileUnavailable"));
			return;
		}
		let view: MarkdownView | null;
		try {
			view = await this.ensureMarkdownViewForFile(filePath);
		} catch (error) {
			if (!this.isCurrentDocumentMarkNavigation(generation, filePath, file)) {
				return;
			}
			console.warn(`FloatMark: failed to open Markdown view ${filePath}`, error);
			new Notice(this.t("notice.markFileUnavailable"));
			return;
		}
		if (!this.isCurrentDocumentMarkNavigation(generation, filePath, file, view)) {
			return;
		}
		if (!view) {
			new Notice(this.t("notice.markFileUnavailable"));
			return;
		}
		let document: SideMarkDocument;
		try {
			const source = await this.app.vault.read(file);
			if (!this.isCurrentDocumentMarkNavigation(generation, filePath, file, view)) {
				return;
			}
			document = await this.store.relocateDocument(filePath, source);
		} catch (error) {
			if (!this.isCurrentDocumentMarkNavigation(generation, filePath, file, view)) {
				return;
			}
			console.warn(`FloatMark: failed to open mark source ${filePath}`, error);
			new Notice(this.t("notice.markFileUnavailable"));
			return;
		}
		if (!this.isCurrentDocumentMarkNavigation(generation, filePath, file, view)) {
			return;
		}
		this.currentDocument = document;
		this.lastMarkdownFilePath = filePath;
		const mark = document.marks.find((item) => item.id === markId);
		if (!mark) {
			new Notice(this.t("notice.markUnavailable"));
			return;
		}
		const isCurrent = () => this.isCurrentDocumentMarkNavigation(generation, filePath, file, view);
		await this.locateMarkInView(view, mark, isCurrent);
		if (!isCurrent()) {
			return;
		}
	}

	private isCurrentDocumentMarkNavigation(
		generation: number,
		filePath: string,
		file: TFile,
		view?: MarkdownView | null
	): boolean {
		const vaultFile = this.app.vault.getFileByPath(filePath);
		const activeFile = view ? this.app.workspace.getActiveViewOfType(MarkdownView)?.file : undefined;
		return this.documentMarkNavigation.isCurrent(generation, filePath, file, vaultFile, view?.file, activeFile);
	}

	private async locateMarkInView(
		view: MarkdownView,
		mark: SideMark,
		isCurrent: () => boolean = () => true
	): Promise<void> {
		if (!isCurrent()) {
			return;
		}
		if (view.getMode() === "preview") {
			if (this.jumpToReadingMark(mark.id)) {
				return;
			}
			await this.setMarkdownViewMode(view, "source");
			if (!isCurrent()) {
				return;
			}
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

	private syncRemoteCommentResolutionInBackground(mark: SideMark, isSolved: boolean): void {
		if (!shouldSyncRemoteComment(mark)) {
			return;
		}
		void (async () => {
			await setLarkCommentResolved(this, mark, isSolved);
		})().catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(this.t("notice.larkStatusSyncFailed", { message }), 8000);
		});
	}

	private deleteRemoteCommentInBackground(mark: SideMark): void {
		if (!shouldSyncRemoteComment(mark)) {
			return;
		}
		void (async () => {
			await deleteLarkComment(this, mark);
		})().catch((error) => {
			if (isMissingRemoteCommentError(error)) {
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			new Notice(this.t("notice.larkDeleteCommentFailed", { message }), 8000);
		});
	}

	private deleteRemoteCommentReplyInBackground(file: TFile, mark: SideMark, replyId: string): void {
		if (!shouldSyncRemoteComment(mark)) {
			return;
		}
		void (async () => {
			const remote = await deleteLarkCommentReply(this, mark, replyId);
			if (!remote) {
				return;
			}
			const currentFile = this.app.vault.getFileByPath(file.path);
			if (!(currentFile instanceof TFile) || currentFile !== file || currentFile.extension !== "md") {
				return;
			}
			const document = await this.store.updateMark(file.path, mark.id, { remote });
			if (this.currentDocument?.filePath === file.path) {
				this.currentDocument = document;
				await this.refreshSidebar();
			}
		})().catch((error) => {
			if (isMissingRemoteCommentError(error)) {
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			new Notice(this.t("notice.larkDeleteReplyFailed", { message }), 8000);
		});
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
		this.readingSelectionUnresolved = false;
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || !selection.toString().trim()) {
			this.readingSelection = null;
			this.readingToolbar.hide();
			return;
		}
		this.readingToolbar.hide();
		this.readingSelectionTimer = window.setTimeout(() => {
			this.readingSelectionTimer = null;
			this.updateReadingSelectionToolbar(requestId);
		}, READING_SELECTION_TOOLBAR_DELAY_MS);
	}

	private updateReadingSelectionToolbar(requestId: number): void {
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
		const rect = getReadingSelectionRect(range);
		if (!rect) {
			this.readingSelection = null;
			this.readingToolbar.hide();
			return;
		}
		if (requestId !== this.readingSelectionRequestId) {
			return;
		}
		const source = view.data;
		const sections = getSelectedPreviewSections(view, range);
		if (sections.length === 0) {
			this.showUnresolvedReadingSelection(rect, view.contentEl.getBoundingClientRect());
			return;
		}
		const lineStarts = this.getSourceLineStarts(file, source);
		const firstSection = sections[0];
		const lastSection = sections[sections.length - 1];
		const context = getReadingSelectionContext(sections.map((section) => section.el), range);
		const sourceRange = findSourceRangeForReadingSelection(source, selectedText, {
			sourceStartOffset: firstSection.sourceStartOffset ?? lineStarts[firstSection.lineStart] ?? source.length,
			sourceEndOffset: lastSection.sourceEndOffset ?? lineStarts[lastSection.lineEnd + 1] ?? source.length,
			...context
		});
		if (!sourceRange) {
			this.showUnresolvedReadingSelection(rect, view.contentEl.getBoundingClientRect());
			return;
		}
		this.readingSelectionUnresolved = false;
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
			const contentRange = getActiveDocument().createRange();
			contentRange.selectNodeContents(view.contentEl);
			const startsInView = range.compareBoundaryPoints(Range.START_TO_START, contentRange) >= 0
				&& range.compareBoundaryPoints(Range.START_TO_END, contentRange) <= 0;
			const endsInView = range.compareBoundaryPoints(Range.END_TO_START, contentRange) >= 0
				&& range.compareBoundaryPoints(Range.END_TO_END, contentRange) <= 0;
			if (startsInView || endsInView) {
				return view;
			}
		}
		return null;
	}

	private async handleReadingToolbarAction(action: "highlight" | "comment"): Promise<void> {
		const selection = this.readingSelection;
		if (!selection) {
			if (this.readingSelectionUnresolved) {
				this.readingSelectionUnresolved = false;
				this.readingToolbar.hide();
				new Notice(this.t("notice.readingSelectionUnresolved"));
			}
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
			new Notice(this.t("notice.blockCopied"));
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
		this.showMarkStylePopoverForNewMark(popoverRect, (choice) => this.createMarkFromOffsets(
			view,
			selection.from,
			selection.to,
			"highlight",
			"",
			choice,
			false
		));
	}

	private showMarkStylePopoverForReadingSelection(
		selection: NonNullable<SideMarkPlugin["readingSelection"]>
	): void {
		this.showMarkStylePopoverForNewMark(selection.rect, (choice) => this.createReadingMark(
			selection,
			"highlight",
			"",
			choice,
			false
		));
	}

	private showMarkStylePopoverForNewMark(
		rect: DOMRect,
		createMark: (choice: MarkStyleChoice) => Promise<SideMark | null>
	): void {
		let markId = "";
		let createPromise: Promise<SideMark | null> | null = null;
		let latestChoice = defaultHighlightAppearance();
		let resetRequested = false;
		this.markStylePopover.show(rect, latestChoice, (choice) => {
			latestChoice = choice;
			if (markId) {
				void this.updateMarkAppearance(markId, choice);
				return;
			}
			if (createPromise) {
				return;
			}
			const createdChoice = choice;
			const pendingCreate = createMark(choice);
			createPromise = pendingCreate;
			void (async () => {
				const createdMark = await pendingCreate;
				markId = createdMark?.id || "";
				if (!markId) {
					return;
				}
				if (resetRequested) {
					await this.deleteMark(markId);
					return;
				}
				if (!isSameHighlightAppearance(createdChoice, latestChoice)) {
					await this.updateMarkAppearance(markId, latestChoice);
				}
			})();
		}, () => {
			resetRequested = true;
			if (markId) {
				void this.deleteMark(markId);
			}
		});
	}

	private async createCommentFromActiveSelection(noteContent: string): Promise<void> {
		const view = this.activeEditorView;
		if (!view) {
			new Notice(this.t("notice.noEditorSelection"));
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
		await this.refreshMarkViews(selection.file.path, createdMark);
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
		await this.refreshMarkViews(file.path, createdMark);
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
		this.readingSelectionUnresolved = false;
		window.getSelection()?.removeAllRanges();
	}

	private showUnresolvedReadingSelection(rect: DOMRect, boundary: DOMRect): void {
		this.readingSelection = null;
		this.readingSelectionUnresolved = true;
		this.readingToolbar.show(rect, boundary);
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

	private async refreshMarkViews(filePath: string, affectedMark?: SideMark): Promise<void> {
		this.invalidateReadingRenderSnapshot(filePath);
		this.refreshEditorDecorations();
		const document = this.currentDocument?.filePath === filePath ? this.currentDocument : undefined;
		await Promise.all([
			this.renderPreviewMarksForFile(filePath, document, affectedMark),
			this.refreshSidebar()
		]);
	}

	private syncMarkToLarkInBackground(markId: string): void {
		if (!this.settings.autoSyncToLark || getLarkSyncPluginStatus(this) !== "enabled") {
			return;
		}
		void this.syncMarkToLarkIfReady(markId).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(this.t("notice.autoSyncLarkFailed", { message }), 8000);
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
		const generation = (this.readingContainerGenerations.get(container) || 0) + 1;
		this.readingContainerGenerations.set(container, generation);
		const file = this.app.vault.getFileByPath(sourcePath);
		if (!file || file.extension !== "md") {
			return;
		}
		const { source, document, lineStarts } = await this.getReadingRenderSnapshot(file);
		if (this.readingContainerGenerations.get(container) !== generation) {
			return;
		}
		const section = context?.getSectionInfo(container);
		const marks = section
			? getReadingMarksForSection(source, document.marks, section.lineStart, section.lineEnd, lineStarts)
			: [];
		renderReadingMarks(container, source, marks, (markId, rect) => void this.openMark(markId, rect));
	}

	private getReadingRenderSnapshot(file: TFile): Promise<ReadingRenderSnapshot> {
		const sourceVersion = `${file.stat.mtime}:${file.stat.size}`;
		const storeRevision = this.store.getRevision();
		const cached = this.readingRenderSnapshots.get(file.path);
		if (cached?.sourceVersion === sourceVersion && cached.storeRevision === storeRevision) {
			return cached.load;
		}

		const load = this.loadReadingRenderSnapshot(file);
		const entry = { sourceVersion, storeRevision, load };
		this.readingRenderSnapshots.set(file.path, entry);
		void load.then(
			() => {
				if (this.readingRenderSnapshots.get(file.path) === entry) {
					entry.storeRevision = this.store.getRevision();
				}
			},
			() => {
				if (this.readingRenderSnapshots.get(file.path) === entry) {
					this.readingRenderSnapshots.delete(file.path);
				}
			}
		);
		return load;
	}

	private async loadReadingRenderSnapshot(file: TFile): Promise<ReadingRenderSnapshot> {
		const source = await this.app.vault.read(file);
		const document = await this.store.relocateDocument(file.path, source);
		const lineStarts = this.getSourceLineStarts(file, source);
		return { source, document, lineStarts };
	}

	private invalidateReadingRenderSnapshot(filePath: string): void {
		this.readingRenderSnapshots.delete(filePath);
	}

	private syncPreviewMarkObservers(): void {
		const activeViews = new Set<MarkdownView>();
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.getMode() === "preview" && view.file?.extension === "md") {
				activeViews.add(view);
				this.ensurePreviewObserver(view);
				this.schedulePreviewViewRender(view);
			}
		}
		for (const [view, state] of this.previewObservers) {
			if (!activeViews.has(view)) {
				state.observer.disconnect();
				this.previewObservers.delete(view);
				this.clearPreviewRenderTimer(view);
				this.previewRenderGenerations.delete(view);
			}
		}
	}

	private ensurePreviewObserver(view: MarkdownView): PreviewObserverState {
		const root = view.contentEl;
		const existing = this.previewObservers.get(view);
		if (existing?.root === root) {
			this.observePreviewState(existing);
			return existing;
		}
		existing?.observer.disconnect();
		const observer = new MutationObserver(() => this.schedulePreviewViewRender(view));
		const state = { root, observer, isObserving: false };
		this.previewObservers.set(view, state);
		this.observePreviewState(state);
		return state;
	}

	private observePreviewState(state: PreviewObserverState): void {
		if (state.isObserving) {
			return;
		}
		state.observer.observe(state.root, { childList: true, subtree: true });
		state.isObserving = true;
	}

	private disconnectPreviewState(state: PreviewObserverState): void {
		state.observer.disconnect();
		state.isObserving = false;
	}

	private schedulePreviewViewRender(view: MarkdownView): void {
		this.clearPreviewRenderTimer(view);
		const generation = this.nextPreviewRenderGeneration(view);
		const timer = window.setTimeout(() => {
			this.previewRenderTimers.delete(view);
			void this.renderPreviewMarksForView(view, generation);
		}, 60);
		this.previewRenderTimers.set(view, timer);
	}

	private clearPreviewRenderTimer(view: MarkdownView): void {
		const timer = this.previewRenderTimers.get(view);
		if (timer === undefined) {
			return;
		}
		window.clearTimeout(timer);
		this.previewRenderTimers.delete(view);
	}

	private nextPreviewRenderGeneration(view: MarkdownView): number {
		const generation = (this.previewRenderGenerations.get(view) || 0) + 1;
		this.previewRenderGenerations.set(view, generation);
		return generation;
	}

	private getSourceLineStarts(file: TFile, source: string): number[] {
		const cached = this.sourceLineStartsCache.get(file.path);
		if (cached?.mtime === file.stat.mtime && cached.size === file.stat.size) {
			return cached.lineStarts;
		}
		const lineStarts = buildSourceLineStarts(source);
		this.sourceLineStartsCache.set(file.path, {
			mtime: file.stat.mtime,
			size: file.stat.size,
			lineStarts
		});
		return lineStarts;
	}

	private clearPreviewMarkObservers(): void {
		for (const state of this.previewObservers.values()) {
			state.observer.disconnect();
		}
		this.previewObservers.clear();
		for (const timer of this.previewRenderTimers.values()) {
			window.clearTimeout(timer);
		}
		this.previewRenderTimers.clear();
		this.previewRenderGenerations.clear();
	}

	private async renderPreviewMarksForFile(
		filePath: string,
		document?: SideMarkDocument,
		affectedMark?: SideMark
	): Promise<void> {
		const renders: Promise<void>[] = [];
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || view.file?.path !== filePath || view.getMode() !== "preview") {
				continue;
			}
			this.clearPreviewRenderTimer(view);
			const generation = this.nextPreviewRenderGeneration(view);
			renders.push(this.renderPreviewMarksForView(view, generation, document, affectedMark));
		}
		await Promise.all(renders);
	}

	private async renderPreviewMarksForView(
		view: MarkdownView,
		generation: number,
		document?: SideMarkDocument,
		affectedMark?: SideMark
	): Promise<void> {
		const file = view.file;
		if (!file || file.extension !== "md" || view.getMode() !== "preview") {
			return;
		}
		const filePath = file.path;
		const source = document?.filePath === filePath
			? view.data
			: await this.app.vault.read(file);
		if (!this.isCurrentPreviewRender(view, filePath, generation)) {
			return;
		}
		const resolvedDocument = document?.filePath === filePath
			? document
			: await this.store.relocateDocument(filePath, source);
		if (!this.isCurrentPreviewRender(view, filePath, generation)) {
			return;
		}
		const onClick = (markId: string, rect: DOMRect) => void this.openMark(markId, rect);
		const observerState = this.ensurePreviewObserver(view);
		this.disconnectPreviewState(observerState);
		try {
			const sections = getPreviewSections(view);
			if (sections.length > 0) {
				const lineStarts = this.getSourceLineStarts(file, source);
				const sectionsToRender = this.getPreviewSectionsToRender(source, sections, lineStarts, affectedMark);
				for (const section of sectionsToRender) {
					const marks = getReadingMarksForSection(
						source,
						resolvedDocument.marks,
						section.lineStart,
						section.lineEnd,
						lineStarts
					);
					renderReadingMarks(section.el, source, marks, onClick);
				}
				return;
			}
			return;
		} finally {
			if (this.isCurrentPreviewRender(view, filePath, generation)) {
				this.ensurePreviewObserver(view);
			}
		}
	}

	private getPreviewSectionsToRender(
		source: string,
		sections: PreviewSection[],
		lineStarts: number[],
		affectedMark?: SideMark
	): PreviewSection[] {
		if (!affectedMark) {
			return sections;
		}
		const affectedSections = sections.filter((section) => getReadingMarksForSection(
			source,
			[affectedMark],
			section.lineStart,
			section.lineEnd,
			lineStarts
		).length > 0);
		return affectedSections.length > 0 ? affectedSections : sections;
	}

	private isCurrentPreviewRender(view: MarkdownView, filePath: string, generation: number): boolean {
		return this.previewRenderGenerations.get(view) === generation
			&& view.getMode() === "preview"
			&& view.file?.path === filePath;
	}

	private jumpToReadingMark(markId: string): boolean {
		const mark = this.currentDocument?.marks.find((item) => item.id === markId);
		if (!mark) {
			return false;
		}
		const markEls = this.findReadingMarkElements(markId, mark.filePath);
		if (markEls.length === 0) {
			return false;
		}
		markEls[0].scrollIntoView({ block: "center", behavior: "smooth" });
		for (const markEl of markEls) {
			markEl.addClass("side-mark-reading-flash");
		}
		window.setTimeout(() => {
			for (const markEl of markEls) {
				markEl.removeClass("side-mark-reading-flash");
			}
		}, 1200);
		return true;
	}

	private findReadingMarkElements(markId: string, filePath: string): HTMLElement[] {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || view.file?.path !== filePath || view.getMode() !== "preview") {
				continue;
			}
			const elements = getReadingMarkElements(view.contentEl, markId);
			if (elements.length > 0) {
				void this.app.workspace.revealLeaf(leaf);
				return elements;
			}
		}
		return [];
	}

	private async ensureMarkdownViewForFile(filePath: string): Promise<MarkdownView | null> {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === filePath) {
				await this.app.workspace.revealLeaf(leaf);
				return leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath ? leaf.view : null;
			}
		}
		const file = this.app.vault.getFileByPath(filePath);
		if (!(file instanceof TFile) || file.extension !== "md") {
			return null;
		}
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
		await this.app.workspace.revealLeaf(leaf);
		return leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath ? leaf.view : null;
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
			await this.app.workspace.revealLeaf(leaf);
			await this.refreshSidebar();
		}
	}

	private getSidebarView(): SideMarkSidebarView | null {
		return this.app.workspace.getLeavesOfType(SIDE_MARK_VIEW_TYPE)[0]?.view as SideMarkSidebarView | null;
	}

	private async refreshSidebar(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(SIDE_MARK_VIEW_TYPE)) {
			if (leaf.view instanceof SideMarkSidebarView) {
				await leaf.view.render();
			}
		}
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

function shouldSyncRemoteComment(mark: SideMark): boolean {
	return mark.mark.kind === "comment" && Boolean(mark.remote?.larkCommentId);
}

function isMissingRemoteCommentError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	const normalized = message.toLowerCase();
	return normalized.includes("docs had been deleted")
		|| normalized.includes("had been deleted")
		|| normalized.includes("not found")
		|| normalized.includes("not exist")
		|| normalized.includes("does not exist")
		|| normalized.includes("1069304")
		|| message.includes("不存在")
		|| message.includes("已删除");
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
	const selection = getActiveSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		return null;
	}
	const range = selection.getRangeAt(0);
	const common = range.commonAncestorContainer;
	const element = isHtmlElement(common) ? common : common.parentElement;
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

function isSameHighlightAppearance(left: MarkStyleChoice, right: MarkStyleChoice): boolean {
	return left.textColor === right.textColor && left.backgroundColor === right.backgroundColor;
}

function getPreviewSections(view: MarkdownView): PreviewSection[] {
	const preview = view.previewMode as unknown as {
		renderer?: { sections?: Array<{
			el?: unknown;
			lineStart?: unknown;
			lineEnd?: unknown;
			start?: { line?: unknown; offset?: unknown };
			end?: { line?: unknown; offset?: unknown };
		}> };
	} | undefined;
	const sections = preview?.renderer?.sections;
	if (!Array.isArray(sections)) {
		return [];
	}
	const result: PreviewSection[] = [];
	for (const section of sections) {
		const bounds = resolvePreviewSectionBounds(section);
		if (section?.el instanceof HTMLElement && bounds) {
			result.push({ el: section.el, ...bounds });
		}
	}
	return result;
}

function getSelectedPreviewSections(view: MarkdownView, range: Range): PreviewSection[] {
	return selectPreviewSections(getPreviewSections(view), range);
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

		new Setting(containerEl)
			.setName(this.plugin.t("settings.language.name"))
			.setDesc(this.plugin.t("settings.language.desc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("zh-CN", this.plugin.t("settings.language.zh"))
					.addOption("en", this.plugin.t("settings.language.en"))
					.setValue(this.plugin.settings.language || "zh-CN")
					.onChange(async (value) => {
						await this.plugin.setLanguage(value as PluginLanguage);
					});
			});

		new Setting(containerEl)
			.setName(this.plugin.t("settings.autoOpenSidebar.name"))
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoOpenSidebar).onChange(async (value) => {
					this.plugin.settings.autoOpenSidebar = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(this.plugin.t("settings.scopeControlStyle.name"))
			.setDesc(this.plugin.t("settings.scopeControlStyle.desc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("tabs", this.plugin.t("settings.scopeControlStyle.tabs"))
					.addOption("dropdown", this.plugin.t("settings.scopeControlStyle.dropdown"))
					.addOption("swap", this.plugin.t("settings.scopeControlStyle.swap"))
					.addOption("switch", this.plugin.t("settings.scopeControlStyle.switch"))
					.setValue(this.plugin.settings.scopeControlStyle)
					.onChange(async (value) => {
						await this.plugin.setScopeControlStyle(value as ScopeControlStyle);
					});
			});

		this.renderLarkSyncSetting(containerEl);

		new Setting(containerEl)
			.setName(this.plugin.t("settings.commentAuthorName.name"))
			.setDesc(this.plugin.t("settings.commentAuthorName.desc"))
			.addText((text) => {
				text.setValue(this.plugin.settings.commentAuthorName).onChange(async (value) => {
					const language = this.plugin.settings.language || "zh-CN";
					this.plugin.settings.commentAuthorName = value.trim() || getDefaultCommentAuthorName(language);
					await this.plugin.saveSettings();
				});
			});
	}

	private renderLarkSyncSetting(containerEl: HTMLElement): void {
		const status = getLarkSyncPluginStatus(this.plugin);
		const canEnableSync = status === "enabled";
		const setting = new Setting(containerEl)
			.setName(this.plugin.t("settings.larkSync.name"))
			.setDesc(this.plugin.t("settings.larkSync.desc"))
			.addToggle((toggle) => {
				toggle.setValue(canEnableSync && this.plugin.settings.autoSyncToLark).onChange(async (value) => {
					if (value && !canEnableSync) {
						toggle.setValue(false);
						this.plugin.settings.autoSyncToLark = false;
						await this.plugin.saveSettings();
						new Notice(this.plugin.t("settings.larkSync.enableBlocked", {
							status: getLarkSyncPluginStatusText(status, this.plugin.settings.language)
						}), 8000);
						return;
					}
					this.plugin.settings.autoSyncToLark = value;
					await this.plugin.saveSettings();
				});
			});
		const statusEl = setting.descEl.createDiv({
			cls: `side-mark-lark-sync-plugin-status ${getLarkSyncPluginStatusClass(status)}`,
			text: getLarkSyncPluginStatusText(status, this.plugin.settings.language)
		});
		statusEl.setAttr("aria-live", "polite");
	}
}
