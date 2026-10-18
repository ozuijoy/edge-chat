import assert from "node:assert/strict";
import test from "node:test";
import { ensureCloudflareResources, ensureKvNamespace } from "../.github/scripts/ensure-cloudflare-resources.mjs";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("KV only reuses the explicitly selected namespace title", async () => {
  const requests = [];
  const result = await ensureKvNamespace(
    {
      accountId: "account",
      apiToken: "token",
      async fetchImpl(url, init) {
        requests.push({ url: String(url), method: init.method });
        return jsonResponse({
          success: true,
          result: [
            { id: "generic-id", title: "SESSIONS" },
            { id: "target-id", title: "edgechat-production-sessions" },
          ],
        });
      },
    },
    "edgechat-production-sessions",
  );

  assert.deepEqual(result, {
    id: "target-id",
    title: "edgechat-production-sessions",
    created: false,
  });
  assert.deepEqual(requests.map((request) => request.method), ["GET"]);
});

test("KV defaults to the isolated legacy title instead of generic SESSIONS", async () => {
  const requests = [];
  const responses = [
    jsonResponse({
      success: true,
      result: [{ id: "generic-id", title: "SESSIONS" }],
    }),
    jsonResponse({ success: true, result: { id: "created-id" } }),
  ];
  const result = await ensureKvNamespace({
    accountId: "account",
    apiToken: "token",
    async fetchImpl(url, init) {
      requests.push({
        url: String(url),
        method: init.method,
        body: init.body,
      });
      return responses.shift();
    },
  });

  assert.deepEqual(result, {
    id: "created-id",
    title: "cfchat-sessions",
    created: true,
  });
  assert.deepEqual(requests.map((request) => request.method), ["GET", "POST"]);
  assert.deepEqual(JSON.parse(requests[1].body), {
    title: "cfchat-sessions",
  });
});

test("resource provisioning only creates D1 and KV, never an R2 bucket", async () => {
  const requests = [];
  const responses = [
    jsonResponse({ success: true, result: [{ uuid: "d1-id", name: "cfchat-db" }] }),
    jsonResponse({ success: true, result: [{ id: "kv-id", title: "cfchat-sessions" }] }),
  ];
  const outputFile = "/tmp/edgechat-ensure-resources-output";
  const originalOutput = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = outputFile;
  try {
    const result = await ensureCloudflareResources({
      accountId: "account",
      apiToken: "token",
      env: {},
      async fetchImpl(url, init) {
        requests.push({ url: String(url), method: init.method });
        return responses.shift();
      },
    });

    assert.equal(result.d1.id, "d1-id");
    assert.equal(result.kv.id, "kv-id");
    assert.equal(result.r2, undefined);
    assert.ok(requests.every((request) => !/\/r2\//.test(request.url)));
  } finally {
    if (originalOutput === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = originalOutput;
  }
});
