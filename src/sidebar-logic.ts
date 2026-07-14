import type { MarkColor, SideMark, SideMarkDocument } from "./types";

export type SidebarScope = "current" | "vault";
export type SidebarTab = "comments" | "marks";
export type SideMarkFilter = "active" | "resolved" | "orphaned" | "all";
export type SideMarkColorFilter = MarkColor | "all";

export interface VaultMarkGroup {
	filePath: string;
	marks: SideMark[];
}

export interface VaultFilterOptions {
	tab: SidebarTab;
	status: SideMarkFilter;
	color: SideMarkColorFilter;
	query: string;
}

export interface VaultFilterResult {
	groups: VaultMarkGroup[];
	counts: Record<SidebarTab, number>;
}

export function toggleSidebarScope(scope: SidebarScope): SidebarScope {
	return scope === "current" ? "vault" : "current";
}

export function sortMarksByCreatedAt(marks: SideMark[]): SideMark[] {
	return [...marks].sort((left, right) => {
		const leftTime = Date.parse(left.note.createdAt);
		const rightTime = Date.parse(right.note.createdAt);
		if (Number.isNaN(leftTime)) {
			return Number.isNaN(rightTime) ? 0 : -1;
		}
		if (Number.isNaN(rightTime)) {
			return 1;
		}
		return leftTime - rightTime;
	});
}

export function summarizeVaultDocuments(
	documents: SideMarkDocument[],
	options: VaultFilterOptions
): VaultFilterResult {
	const query = options.query.trim().toLowerCase();
	const counts: Record<SidebarTab, number> = { comments: 0, marks: 0 };
	const groups: VaultMarkGroup[] = [];
	for (const document of documents) {
		const marks: SideMark[] = [];
		for (const mark of document.marks) {
			if (!matchesCommonFilters(mark, document.filePath, options, query)) {
				continue;
			}
			const tab = mark.mark.kind === "comment" ? "comments" : mark.mark.kind === "highlight" ? "marks" : null;
			if (!tab) {
				continue;
			}
			counts[tab] += 1;
			if (tab === options.tab) {
				marks.push(mark);
			}
		}
		if (marks.length > 0) {
			groups.push({ filePath: document.filePath, marks: sortMarksByCreatedAt(marks) });
		}
	}
	groups.sort((left, right) => left.filePath.localeCompare(right.filePath));
	return { groups, counts };
}

export function filterVaultDocuments(
	documents: SideMarkDocument[],
	options: VaultFilterOptions
): VaultMarkGroup[] {
	return summarizeVaultDocuments(documents, options).groups;
}

export function bindVaultCardNavigation(card: HTMLElement, label: string, navigate: () => void): void {
	card.setAttribute("role", "button");
	card.tabIndex = 0;
	card.setAttribute("aria-label", label);
	card.addEventListener("click", navigate);
	card.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}
		event.preventDefault();
		navigate();
	});
}

function matchesCommonFilters(
	mark: SideMark,
	filePath: string,
	options: VaultFilterOptions,
	query: string
): boolean {
	if (options.status !== "all" && mark.status !== options.status) {
		return false;
	}
	if (mark.mark.kind === "comment" && options.color !== "all" && mark.mark.color !== options.color) {
		return false;
	}
	if (!query) {
		return true;
	}
	const searchableText = [
		filePath,
		mark.anchor.selectedText,
		mark.note.content,
		...(mark.replies || []).map((reply) => reply.content)
	].join("\n").toLowerCase();
	return searchableText.includes(query);
}
