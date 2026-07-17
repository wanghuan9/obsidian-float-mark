export type EditorSelectionRectPlacement = "start" | "end" | "bounding";

export function resolveEditorSelectionRect(
	editorDom: HTMLElement,
	selection: Selection | null,
	placement: EditorSelectionRectPlacement = "bounding"
): DOMRect | null {
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		return null;
	}
	const range = selection.getRangeAt(0);
	const common = range.commonAncestorContainer;
	const element = common.nodeType === 1 ? common as HTMLElement : common.parentElement;
	if (!element || !editorDom.contains(element)) {
		return null;
	}
	const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
	if (rects.length === 0) {
		const rect = range.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0 ? rect : null;
	}
	if (placement === "start") {
		return cloneRect(rects[0]);
	}
	if (placement === "end") {
		return cloneRect(rects[rects.length - 1]);
	}
	const left = Math.min(...rects.map((rect) => rect.left));
	const top = Math.min(...rects.map((rect) => rect.top));
	const right = Math.max(...rects.map((rect) => rect.right));
	const bottom = Math.max(...rects.map((rect) => rect.bottom));
	return new DOMRect(left, top, right - left, bottom - top);
}

function cloneRect(rect: DOMRect | undefined): DOMRect | null {
	return rect ? new DOMRect(rect.left, rect.top, rect.width, rect.height) : null;
}
