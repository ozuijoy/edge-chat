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

// 只發布聊天編輯器真正會請求的運行時，避免把公式、圖表和全量高亮包帶進站點。
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
