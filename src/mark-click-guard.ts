export function shouldOpenMarkForSelection(hasTextSelection: boolean): boolean {
	return !hasTextSelection;
}

export function hasNonEmptyDomSelection(selection: Selection | null): boolean {
	return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}
