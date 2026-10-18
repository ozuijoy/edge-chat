import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const androidDirectory = fileURLToPath(new URL("../android/", import.meta.url));
const command = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const tasks = process.argv.slice(2);
const javaHomeArgument = process.env.JAVA_HOME
	? [`-Dorg.gradle.java.home=${process.env.JAVA_HOME}`]
	: [];
const result = spawnSync(
	command,
	[
		...javaHomeArgument,
		...(tasks.length
			? tasks
			: [
			":app:testDebugUnitTest",
			":app:lintDebug",
			":app:assembleDebug",
			":app:assembleDebugAndroidTest",
			]),
	],
	{
		cwd: androidDirectory,
		stdio: "inherit",
		shell: process.platform === "win32",
	},
);

process.exit(result.status ?? 1);
