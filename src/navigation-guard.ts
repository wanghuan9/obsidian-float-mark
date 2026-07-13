export interface NavigationFile {
	path: string;
}

export class NavigationGuard {
	private generation = 0;

	begin(): number {
		return ++this.generation;
	}

	isCurrent(
		generation: number,
		filePath: string,
		expectedFile: NavigationFile,
		vaultFile: NavigationFile | null,
		viewFile?: NavigationFile | null,
		activeFile?: NavigationFile | null
	): boolean {
		return generation === this.generation
			&& expectedFile.path === filePath
			&& vaultFile === expectedFile
			&& (viewFile === undefined || viewFile === expectedFile)
			&& (activeFile === undefined || activeFile === expectedFile);
	}
}
