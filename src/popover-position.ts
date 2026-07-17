const POPOVER_GAP = 6;
const VIEWPORT_PADDING = 8;
const BELOW_HORIZONTAL_OFFSET = 8;

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

export type PopoverPlacement = "side" | "below";

export function calculatePopoverPosition(
	anchor: DOMRect,
	popover: PopoverSize,
	viewport: ViewportSize,
	placement: PopoverPlacement = "side"
): PopoverPosition {
	if (placement === "below") {
		const maxLeft = viewport.width - popover.width - VIEWPORT_PADDING;
		const preferredTop = anchor.bottom + POPOVER_GAP;
		const fallbackTop = anchor.top - popover.height - POPOVER_GAP;
		const maxTop = viewport.height - popover.height - VIEWPORT_PADDING;
		return {
			left: clamp(anchor.right - popover.width + BELOW_HORIZONTAL_OFFSET, VIEWPORT_PADDING, maxLeft),
			top: preferredTop <= maxTop
				? preferredTop
				: fallbackTop >= VIEWPORT_PADDING
					? fallbackTop
					: clamp(preferredTop, VIEWPORT_PADDING, maxTop)
		};
	}

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
