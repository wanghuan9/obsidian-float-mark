const CHINESE_CHARACTER_PATTERN = /\p{Script=Han}/u;

export function validateChineseReleaseNotes(content, file) {
	const lines = content
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	if (lines.length === 0) {
		throw new Error(`Release notes cannot be empty: ${file}`);
	}

	const contentLines = lines.filter((line) => !/^#\s+\d+\.\d+\.\d+$/.test(line));
	if (contentLines.length === 0 || !contentLines.some((line) => line.startsWith("- "))) {
		throw new Error(`Release notes must contain at least one Chinese list item: ${file}`);
	}

	const nonChineseLine = contentLines.find((line) => !CHINESE_CHARACTER_PATTERN.test(line));
	if (nonChineseLine) {
		throw new Error(`Release notes must be written in Chinese: ${file}\nInvalid line: ${nonChineseLine}`);
	}
}
