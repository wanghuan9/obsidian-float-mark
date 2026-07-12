export interface BlockMenuPlacementInput {
	pillTop: number;
	pillBottom: number;
	naturalMenuHeight: number;
	viewportHeight: number;
	viewportPadding: number;
	gap: number;
	minimumBelowRatio: number;
}

export interface BlockMenuPlacement {
	opensAbove: boolean;
	top: number;
	maxHeight: number;
}

export function calculateBlockMenuPlacement(input: BlockMenuPlacementInput): BlockMenuPlacement {
	const naturalMenuHeight = Math.max(0, input.naturalMenuHeight);
	const spaceBelow = Math.max(0, input.viewportHeight - input.pillBottom - input.gap - input.viewportPadding);
	const spaceAbove = Math.max(0, input.pillTop - input.gap - input.viewportPadding);
	const minimumBelowHeight = naturalMenuHeight * input.minimumBelowRatio;
	const opensAbove = spaceBelow < minimumBelowHeight && spaceAbove > spaceBelow;
	const availableHeight = opensAbove ? spaceAbove : spaceBelow;
	const maxHeight = Math.min(naturalMenuHeight, availableHeight);
	const top = opensAbove
		? input.pillTop - input.gap - maxHeight
		: input.pillBottom + input.gap;
	return { opensAbove, top, maxHeight };
}
