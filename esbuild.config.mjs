import { builtinModules } from "node:module";
import esbuild from "esbuild";

const prod = process.argv[2] === "production";
const builtins = Array.from(new Set([
	...builtinModules,
	...builtinModules.map((moduleName) => `node:${moduleName}`)
]));

const context = await esbuild.context({
	banner: {
		js: "/* FloatMark */"
	},
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/state",
		"@codemirror/view",
		...builtins
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js"
});

if (prod) {
	await context.rebuild();
	await context.dispose();
} else {
	await context.watch();
}
