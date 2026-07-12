import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/block-menu-position.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/block-menu-position.mjs"
});

const { calculateBlockMenuPlacement } = await import("./.tmp/block-menu-position.mjs");

const baseInput = {
	pillTop: 100,
	pillBottom: 122,
	naturalMenuHeight: 360,
	viewportHeight: 800,
	viewportPadding: 8,
	gap: 6,
	minimumBelowRatio: 0.5
};

assert.deepEqual(calculateBlockMenuPlacement(baseInput), {
	opensAbove: false,
	top: 128,
	maxHeight: 360
});

const exactlyHalfBelow = calculateBlockMenuPlacement({
	...baseInput,
	pillTop: 584,
	pillBottom: 606
});
assert.deepEqual(exactlyHalfBelow, {
	opensAbove: false,
	top: 612,
	maxHeight: 180
});
assert.equal(exactlyHalfBelow.top - 606, 6);

const lessThanHalfBelow = calculateBlockMenuPlacement({
	...baseInput,
	pillTop: 585,
	pillBottom: 607
});
assert.deepEqual(lessThanHalfBelow, {
	opensAbove: true,
	top: 219,
	maxHeight: 360
});
assert.equal(585 - (lessThanHalfBelow.top + lessThanHalfBelow.maxHeight), 6);

const constrainedBelow = calculateBlockMenuPlacement({
	...baseInput,
	pillTop: 130,
	pillBottom: 152,
	viewportHeight: 300
});
assert.deepEqual(constrainedBelow, {
	opensAbove: false,
	top: 158,
	maxHeight: 134
});

const nearViewportBottom = calculateBlockMenuPlacement({
	...baseInput,
	pillTop: 250,
	pillBottom: 272,
	viewportHeight: 300
});
assert.deepEqual(nearViewportBottom, {
	opensAbove: true,
	top: 8,
	maxHeight: 236
});
assert.equal(nearViewportBottom.top, baseInput.viewportPadding);

const smallerThanFormerOuterPadding = calculateBlockMenuPlacement({
	...baseInput,
	pillTop: 15,
	pillBottom: 37,
	viewportHeight: 45
});
assert.deepEqual(smallerThanFormerOuterPadding, {
	opensAbove: true,
	top: 8,
	maxHeight: 1
});

console.log("block menu position tests passed");
