const POPOVER_GAP = 6;
const VIEWPORT_PADDING = 8;

export interface PopoverSize {
	width: number;
	height: number;
}

export interface ViewportSize {
	width: number;
	height: number;
}

export interface PopoverPosition {
	left: number;
	top: number;
}

export function calculatePopoverPosition(
	anchor: DOMRect,
	popover: PopoverSize,
	viewport: ViewportSize
): PopoverPosition {
	const preferredLeft = anchor.right + POPOVER_GAP;
	const fallbackLeft = anchor.left - popover.width - POPOVER_GAP;
	const maxLeft = viewport.width - popover.width - VIEWPORT_PADDING;
	const left = preferredLeft <= maxLeft
		? preferredLeft
		: fallbackLeft >= VIEWPORT_PADDING
			? fallbackLeft
			: clamp(preferredLeft, VIEWPORT_PADDING, maxLeft);
	const maxTop = viewport.height - popover.height - VIEWPORT_PADDING;
	return {
		left,
		top: clamp(anchor.top, VIEWPORT_PADDING, maxTop)
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, Math.max(min, max)));
}
