import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
	new URL("../.github/workflows/deploy-worker.yml", import.meta.url),
	"utf8",
).replaceAll("\r\n", "\n");

function getStep(name) {
	const marker = `      - name: ${name}\n`;
	const start = workflow.indexOf(marker);
	assert.notEqual(start, -1, `部署工作流缺少步驟：${name}`);
	const next = workflow.indexOf("      - name: ", start + marker.length);
	return workflow.slice(start, next === -1 ? undefined : next);
}

test("Cloudflare 生產憑據只注入實際調用 Cloudflare 的步驟", () => {
	const deployJobStart = workflow.indexOf("  deploy:\n");
	const stepsStart = workflow.indexOf("    steps:\n", deployJobStart);
	assert.notEqual(deployJobStart, -1);
	assert.notEqual(stepsStart, -1);
	assert.doesNotMatch(
		workflow.slice(deployJobStart, stepsStart),
		/CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)/,
	);

	for (const name of [
		"Checkout",
			"Setup Node.js",
			"Install dependencies",
			"Run tests",
			"Build frontend assets",
		"Generate wrangler config for CI",
		"Generate admin bootstrap SQL (optional)",
	]) {
		assert.doesNotMatch(getStep(name), /CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)/);
	}

	for (const name of [
		"Ensure Cloudflare resources",
		"Initialize D1 schema (first creation only)",
			"Prepare D1 migrations",
			"Apply D1 migrations",
			"Ensure admin user (optional)",
				"Verify login administrator",
			"Prepare Worker encryption secret",
			"Deploy worker",
	]) {
		const step = getStep(name);
		assert.match(step, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
		assert.match(step, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
	}
});

test("Actions 在管理員初始化後、發佈前驗證可登錄超管，並拒絕只填一項憑據", () => {
	const generation = getStep("Generate admin bootstrap SQL (optional)");
	assert.match(generation, /elif \[\[ -n "\$EDGECHAT_ADMIN_USERNAME" \|\| -n "\$EDGECHAT_ADMIN_PASSWORD" \]\]/);
	assert.match(generation, /exit 1/);
	assert.match(getStep("Verify login administrator"), /prepare-d1-migrations\.mjs --verify-admin/);
	assert.match(getStep("Verify login administrator"), /EDGECHAT_D1_DATABASE_ID: \$\{\{ steps\.ensure_resources\.outputs\.d1_database_id \}\}/);
	assert.ok(workflow.indexOf("      - name: Ensure admin user") < workflow.indexOf("      - name: Verify login administrator"));
	assert.ok(workflow.indexOf("      - name: Verify login administrator") < workflow.indexOf("      - name: Deploy worker"));
});

test("生產部署在創建或修改雲資源前運行完整測試", () => {
	const testsStart = workflow.indexOf("      - name: Run tests\n");
	const resourcesStart = workflow.indexOf("      - name: Ensure Cloudflare resources\n");
	assert.notEqual(testsStart, -1);
	assert.equal(testsStart < resourcesStart, true);
	assert.match(getStep("Run tests"), /run: npm test/);
});

test("Actions 通過倉庫變量配置保留天數，並在雲資源操作前拒絕非法值", () => {
	const validation = getStep("Validate message retention");
	assert.match(validation, /MESSAGE_RETENTION_DAYS: \$\{\{ vars.MESSAGE_RETENTION_DAYS \|\| '7' \}\}/);
	assert.match(validation, /\^\[1-9\]\[0-9\]\*\$/);
	assert.match(validation, /exit 1/);
	assert.ok(workflow.indexOf("      - name: Validate message retention") < workflow.indexOf("      - name: Ensure Cloudflare resources"));
	const config = getStep("Generate wrangler config for CI");
	assert.match(config, /MESSAGE_RETENTION_DAYS: \$\{\{ vars.MESSAGE_RETENTION_DAYS \|\| '7' \}\}/);
	assert.ok(config.includes('MESSAGE_RETENTION_DAYS = \\"${MESSAGE_RETENTION_DAYS}\\"'));
});

test("首次部署自動創建密鑰，普通部署保留密鑰，手動輪換才允許更新", () => {
	const prepareStep = getStep("Prepare Worker encryption secret");
	assert.match(prepareStep, /prepare-worker-encryption-secret\.mjs/);
	assert.match(
		prepareStep,
		/EDGECHAT_ENCRYPTION_KEYRING: \$\{\{ secrets\.EDGECHAT_ENCRYPTION_KEYRING \}\}/,
	);
	assert.match(prepareStep, /EDGECHAT_APPLY_ENCRYPTION_KEYRING:/);
	assert.match(prepareStep, /EDGECHAT_ROTATE_ENCRYPTION_KEY:/);
	assert.match(workflow, /apply_encryption_keyring:/);
	assert.match(workflow, /rotate_encryption_key:/);

	const deployStep = getStep("Deploy worker");
	assert.match(deployStep, /if \[\[ -f \.tmp\/worker-secrets\.json \]\]/);
	assert.match(deployStep, /wrangler deploy --config wrangler\.ci\.toml --secrets-file/);
	assert.match(deployStep, /wrangler deploy --config wrangler\.ci\.toml/);
});

test("資源確認腳本僅複用配置的 KV 標題，避免隱式共享會話存儲", () => {
	const script = readFileSync(
		new URL("../.github/scripts/ensure-cloudflare-resources.mjs", import.meta.url),
		"utf8",
	).replaceAll("\r\n", "\n");

	assert.doesNotMatch(script, /PRODUCTION_KV_NAMESPACE_TITLE/);
	assert.match(
		script,
		/namespace\.title === kvNamespaceTitle && namespace\.id/,
	);
	assert.match(script, /setOutput\("kv_namespace_title", kv\.title\);/);

	const resourceStep = getStep("Ensure Cloudflare resources");
	assert.match(
		resourceStep,
		/EDGECHAT_KV_NAMESPACE_TITLE: \$\{\{ vars\.EDGECHAT_KV_NAMESPACE_TITLE \|\| 'cfchat-sessions' \}\}/,
	);
});

test("R2 未開通時工作流移除 FILES binding，已開通時保留目標 bucket", () => {
	const configStep = getStep("Generate wrangler config for CI");
	assert.match(
		configStep,
		/R2_AVAILABLE: \$\{\{ steps\.ensure_resources\.outputs\.r2_available \}\}/,
	);
	assert.match(
		configStep,
		/R2_BUCKET_NAME: \$\{\{ steps\.ensure_resources\.outputs\.r2_bucket_name \}\}/,
	);
	assert.match(configStep, /if \[\[ "\$R2_AVAILABLE" == "true" \]\]/);
	assert.match(configStep, /bucket_name = \\"\$\{R2_BUCKET_NAME\}\\"/);
	assert.match(configStep, /\^\\\[\\\[r2_buckets\\\]\\\]\$\/,\/\^\$\/d/);
});
