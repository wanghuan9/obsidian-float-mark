import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/reading-selection-toolbar.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/reading-selection-toolbar.mjs",
	plugins: [{
		name: "obsidian-mock",
		setup(build) {
			build.onResolve({ filter: /^obsidian$/ }, () => ({
				path: "obsidian-mock",
				namespace: "obsidian-mock"
			}));
			build.onLoad({ filter: /.*/, namespace: "obsidian-mock" }, () => ({
				contents: "export function setIcon() {}",
				loader: "js"
			}));
		}
	}]
});

const { ReadingSelectionToolbar } = await import("./.tmp/reading-selection-toolbar.mjs");

const dom = new JSDOM("<body></body>");
const activeWindow = dom.window;
const activeDocument = activeWindow.document;
const timers = new Map();
const animationFrames = [];
let nextTimerId = 1;
let nextFrameId = 1;

activeWindow.setTimeout = (callback, delay) => {
	const timerId = nextTimerId;
	nextTimerId += 1;
	timers.set(timerId, { callback, delay });
	return timerId;
};
activeWindow.clearTimeout = (timerId) => {
	timers.delete(timerId);
};
activeWindow.requestAnimationFrame = (callback) => {
	const frameId = nextFrameId;
	nextFrameId += 1;
	animationFrames.push(callback);
	return frameId;
};

activeWindow.HTMLElement.prototype.createDiv = function createDiv(options = {}) {
	const element = activeDocument.createElement("div");
	if (options.cls) {
		element.className = options.cls;
	}
	this.appendChild(element);
	return element;
};
activeWindow.HTMLElement.prototype.createEl = function createEl(tagName, options = {}) {
	const element = activeDocument.createElement(tagName);
	if (options.cls) {
		element.className = options.cls;
	}
	for (const [name, value] of Object.entries(options.attr || {})) {
		element.setAttribute(name, value);
	}
	this.appendChild(element);
	return element;
};
activeWindow.HTMLElement.prototype.hide = function hide() {
	this.style.display = "none";
};
activeWindow.HTMLElement.prototype.show = function show() {
	this.style.display = "";
};
activeWindow.HTMLElement.prototype.addClass = function addClass(className) {
	this.classList.add(className);
};
activeWindow.HTMLElement.prototype.removeClass = function removeClass(className) {
	this.classList.remove(className);
};
activeWindow.HTMLElement.prototype.hasClass = function hasClass(className) {
	return this.classList.contains(className);
};

globalThis.window = activeWindow;
activeWindow.activeDocument = activeDocument;

const toolbar = new ReadingSelectionToolbar(() => undefined, (key) => key);
const toolbarEl = activeDocument.querySelector(".side-mark-reading-selection-toolbar");
assert.ok(toolbarEl);
assert.equal(toolbarEl.style.display, "none");

toolbar.hide();
assert.equal(timers.size, 1);
assert.equal(Array.from(timers.values())[0].delay, 140);

toolbar.show(new activeWindow.DOMRect(100, 100, 50, 20));
assert.equal(timers.size, 0);
assert.equal(toolbarEl.style.display, "");
assert.equal(toolbarEl.classList.contains("is-visible"), false);

for (const callback of animationFrames.splice(0)) {
	callback();
}
assert.equal(toolbarEl.classList.contains("is-visible"), true);

toolbar.destroy();
assert.equal(timers.size, 0);
assert.equal(activeDocument.querySelector(".side-mark-reading-selection-toolbar"), null);

console.log("reading selection toolbar tests passed");
