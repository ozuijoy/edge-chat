import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = resolve(repositoryRoot, "node_modules/vditor");
const targetRoot = resolve(repositoryRoot, "frontend/public/vendor/vditor");
const packageMetadata = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const runtimeFiles = [
	"dist/css/content-theme/light.css",
	"dist/js/icons/ant.js",
	"dist/js/i18n/en_US.js",
	"dist/js/i18n/zh_CN.js",
	"dist/js/lute/lute.min.js",
];

// 只发布聊天编辑器真正会请求的运行时，避免把公式、图表和全量高亮包带进站点。
await rm(targetRoot, { recursive: true, force: true });
for (const relativePath of runtimeFiles) {
	const targetPath = resolve(targetRoot, relativePath);
	await mkdir(dirname(targetPath), { recursive: true });
	await copyFile(resolve(packageRoot, relativePath), targetPath);
}
await mkdir(targetRoot, { recursive: true });
await copyFile(resolve(packageRoot, "LICENSE"), resolve(targetRoot, "LICENSE"));
await readFile(resolve(targetRoot, "dist/js/lute/lute.min.js"));

console.log(`Prepared Vditor ${packageMetadata.version} runtime assets.`);
