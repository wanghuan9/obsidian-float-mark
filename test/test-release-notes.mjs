import assert from "node:assert/strict";
import { validateChineseReleaseNotes } from "../scripts/release-notes.mjs";

assert.doesNotThrow(() => validateChineseReleaseNotes(`# 0.1.11

## 修复

- 修复编辑模式中的连续背景显示。
`, "release-notes/0.1.11.md"));

assert.throws(
	() => validateChineseReleaseNotes("", "release-notes/0.1.11.md"),
	/Release notes cannot be empty/
);

assert.throws(
	() => validateChineseReleaseNotes(`# 0.1.11

## Fixed

- 修复连续背景显示。
`, "release-notes/0.1.11.md"),
	/Release notes must be written in Chinese/
);

assert.throws(
	() => validateChineseReleaseNotes(`# 0.1.11

## 修复

- Fix continuous background rendering.
`, "release-notes/0.1.11.md"),
	/Release notes must be written in Chinese/
);

assert.throws(
	() => validateChineseReleaseNotes(`# 0.1.11

## 修复
`, "release-notes/0.1.11.md"),
	/at least one Chinese list item/
);

console.log("release notes tests passed");
