import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/popover-position.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/popover-position.mjs"
});

const dom = new JSDOM();
globalThis.DOMRect = dom.window.DOMRect;
const { calculatePopoverPosition } = await import("./.tmp/popover-position.mjs");

assert.deepEqual(
	calculatePopoverPosition(new DOMRect(100, 100, 50, 20), { width: 286, height: 180 }, { width: 1000, height: 800 }),
	{ left: 156, top: 100 }
);
assert.deepEqual(
	calculatePopoverPosition(new DOMRect(900, 100, 50, 20), { width: 286, height: 180 }, { width: 1000, height: 800 }),
	{ left: 608, top: 100 }
);
assert.deepEqual(
	calculatePopoverPosition(new DOMRect(100, 750, 50, 20), { width: 286, height: 180 }, { width: 1000, height: 800 }),
	{ left: 156, top: 612 }
);

console.log("popover position tests passed");
