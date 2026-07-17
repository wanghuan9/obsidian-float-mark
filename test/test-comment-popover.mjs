import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/comment-popover.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/comment-popover.mjs",
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

const { CommentPopover } = await import("./.tmp/comment-popover.mjs");
const dom = new JSDOM("<body><div class=\"outside\"></div></body>");
const activeWindow = dom.window;
const activeDocument = activeWindow.document;
const timers = new Map();
const animationFrames = new Map();
let nextTimerId = 1;
let nextFrameId = 1;

activeWindow.setTimeout = (callback, delay) => {
	const timerId = nextTimerId;
	nextTimerId += 1;
	timers.set(timerId, {
		callback: () => {
			timers.delete(timerId);
			callback();
		},
		delay
	});
	return timerId;
};
activeWindow.requestAnimationFrame = (callback) => {
	const frameId = nextFrameId;
	nextFrameId += 1;
	animationFrames.set(frameId, callback);
	return frameId;
};

function applyElementOptions(element, options = {}) {
	if (options.cls) {
		element.className = options.cls;
	}
	if (options.text) {
		element.textContent = options.text;
	}
	for (const [name, value] of Object.entries(options.attr || {})) {
		element.setAttribute(name, value);
	}
}

activeWindow.HTMLElement.prototype.createDiv = function createDiv(options = {}) {
	const element = activeDocument.createElement("div");
	applyElementOptions(element, options);
	this.appendChild(element);
	return element;
};
activeWindow.HTMLElement.prototype.createSpan = function createSpan(options = {}) {
	const element = activeDocument.createElement("span");
	applyElementOptions(element, options);
	this.appendChild(element);
	return element;
};
activeWindow.HTMLElement.prototype.createEl = function createEl(tagName, options = {}) {
	const element = activeDocument.createElement(tagName);
	applyElementOptions(element, options);
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

function flushAnimationFrames() {
	for (const callback of animationFrames.values()) {
		callback();
	}
	animationFrames.clear();
}

const popover = new CommentPopover((key) => key);
const popoverEl = activeDocument.querySelector(".side-mark-comment-popover");
const textarea = activeDocument.querySelector(".side-mark-comment-textarea");
assert.ok(popoverEl);
assert.ok(textarea);
assert.equal(popoverEl.style.display, "none");

let savedContent = null;
let hideCount = 0;
popover.show(
	new activeWindow.DOMRect(100, 100, 50, 20),
	(content) => {
		savedContent = content;
	},
	() => {
		hideCount += 1;
	}
);
flushAnimationFrames();
assert.equal(popoverEl.classList.contains("is-visible"), true);

popoverEl.dispatchEvent(new activeWindow.MouseEvent("mouseleave"));
activeDocument.querySelector(".outside").dispatchEvent(new activeWindow.MouseEvent("mousedown", { bubbles: true }));
assert.equal(popoverEl.classList.contains("is-visible"), true);
assert.equal(timers.size, 0);
assert.equal(hideCount, 0);

textarea.value = "拼音评论";
textarea.dispatchEvent(new activeWindow.KeyboardEvent("keydown", { key: "Enter", isComposing: true }));
assert.equal(savedContent, null);
assert.equal(popoverEl.classList.contains("is-visible"), true);

textarea.dispatchEvent(new activeWindow.KeyboardEvent("keydown", { key: "Enter" }));
assert.equal(savedContent, "拼音评论");
assert.equal(hideCount, 1);
assert.equal(popoverEl.classList.contains("is-visible"), false);
assert.equal(Array.from(timers.values())[0].delay, 150);
Array.from(timers.values())[0].callback();
assert.equal(popoverEl.style.display, "none");

popover.show(new activeWindow.DOMRect(100, 100, 50, 20), () => undefined, () => {
	hideCount += 1;
});
popover.show(new activeWindow.DOMRect(120, 120, 50, 20), () => undefined, () => {
	hideCount += 1;
});
assert.equal(hideCount, 2);

const cancelButton = Array.from(popoverEl.querySelectorAll("button")).find((button) => button.textContent === "popover.cancel");
assert.ok(cancelButton);
cancelButton.click();
assert.equal(hideCount, 3);
assert.equal(popoverEl.classList.contains("is-visible"), false);

popover.destroy();
assert.equal(activeDocument.querySelector(".side-mark-comment-popover"), null);

console.log("comment popover tests passed");
