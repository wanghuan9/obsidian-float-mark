import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/mark-style-popover.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/mark-style-popover.mjs",
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

const dom = new JSDOM("<body></body>", { pretendToBeVisual: true });
const activeWindow = dom.window;
const activeDocument = activeWindow.document;
activeWindow.activeDocument = activeDocument;
activeWindow.requestAnimationFrame = (callback) => {
	callback();
	return 1;
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
activeWindow.HTMLElement.prototype.toggleClass = function toggleClass(className, enabled) {
	this.classList.toggle(className, enabled);
};
Object.defineProperty(activeWindow.HTMLElement.prototype, "doc", {
	get() {
		return this.ownerDocument;
	}
});

globalThis.window = activeWindow;
globalThis.document = activeDocument;

const { MarkStylePopover } = await import("./.tmp/mark-style-popover.mjs");
const popover = new MarkStylePopover((key) => key);
const customControl = activeDocument.querySelector(".side-mark-style-custom-color");
const customInput = activeDocument.querySelector(".side-mark-style-custom-color-input");
assert.ok(customControl instanceof activeWindow.HTMLLabelElement);
assert.ok(customInput instanceof activeWindow.HTMLInputElement);
assert.equal(customInput.type, "color");
assert.equal(customInput.tabIndex, 0);
assert.equal(customInput.closest("button"), null);
assert.equal(customInput.getAttribute("aria-label"), "style.background.custom");

const changes = [];
popover.show(
	new activeWindow.DOMRect(10, 10, 20, 20),
	{ textColor: "default", backgroundColor: "custom-#a1b2c3" },
	(choice) => changes.push(choice),
	() => undefined
);
assert.equal(customControl.classList.contains("is-active"), true);
assert.equal(customInput.value, "#a1b2c3");

customInput.value = "#123456";
customInput.dispatchEvent(new activeWindow.Event("input", { bubbles: true }));
assert.equal(changes.length, 1);
assert.deepEqual(changes.at(-1), {
	textColor: "default",
	backgroundColor: "custom-#123456"
});
assert.equal(customControl.style.getPropertyValue("--side-mark-custom-picker-color"), "#123456");
customInput.dispatchEvent(new activeWindow.Event("change", { bubbles: true }));
assert.equal(changes.length, 1);
assert.deepEqual(changes.at(-1), {
	textColor: "default",
	backgroundColor: "custom-#123456"
});

activeDocument.querySelector("button.side-mark-style-background-color.is-red").click();
assert.deepEqual(changes.at(-1), { textColor: "default", backgroundColor: "red" });
assert.equal(customControl.classList.contains("is-active"), false);

popover.destroy();
assert.equal(activeDocument.querySelector(".side-mark-style-popover"), null);

console.log("mark style popover tests passed");
