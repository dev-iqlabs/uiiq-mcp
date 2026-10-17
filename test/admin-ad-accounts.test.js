// node --test — uiiq_admin_ad_accounts_get / uiiq_admin_ad_account_set
// (GET/PUT /api/admin/tenants/:id/ad-accounts), against a local stand-in for
// UIIQ (a throwaway HOME with a fake session, so no real login is read or sent).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, data] = reply;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  home = mkdtempSync(join(tmpdir(), "uiiq-mcp-test-home-"));
  mkdirSync(join(home, ".uiiq"));
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "test", cookieName: "authjs.session-token" }));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.UIIQ_BASE = base;
  delete process.env.UIIQ_MCP_INHERIT_IMPERSONATION;
  const mod = await import("../src/tools/admin-platform.js");
  const list = Object.values(mod).find((v) => Array.isArray(v) && v.some((t) => t?.name === "uiiq_admin_ad_account_set"));
  tools = Object.fromEntries(list.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, response) {
  reply = response;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

test("get: one GET for the tenant", async () => {
  const { result, requests } = await call("uiiq_admin_ad_accounts_get", { tenantId: "ten 1" }, [200, { accounts: [], settable: ["META"] }]);
  assert.deepEqual(requests, [{ method: "GET", path: "/admin/tenants/ten%201/ad-accounts" }]);
  assert.deepEqual(result.settable, ["META"]);
});

test("set: one PUT with only the platform and account; null removes it", async () => {
  let r = await call("uiiq_admin_ad_account_set", { tenantId: "ten_1", platform: "META", accountId: "act_123456" }, [200, { platform: "META", accountId: "act_123456" }]);
  assert.deepEqual(r.requests, [{ method: "PUT", path: "/admin/tenants/ten_1/ad-accounts", body: { platform: "META", accountId: "act_123456" } }]);
  r = await call("uiiq_admin_ad_account_set", { tenantId: "ten_1", platform: "GOOGLE", accountId: null }, [200, { platform: "GOOGLE", accountId: null }]);
  assert.deepEqual(r.requests[0].body, { platform: "GOOGLE", accountId: null });
});

test("UiiQ's refusal is thrown with its words", async () => {
  await assert.rejects(call("uiiq_admin_ad_account_set", { tenantId: "ten_1", platform: "META", accountId: "act_9" }, [409, { error: "That account is already set on ultimate-image" }]), /already set on ultimate-image/);
});

test("the schemas are closed; set takes only META, GOOGLE or LINKEDIN", () => {
  for (const n of ["uiiq_admin_ad_accounts_get", "uiiq_admin_ad_account_set"]) assert.equal(tools[n].inputSchema.additionalProperties, false);
  assert.deepEqual(tools.uiiq_admin_ad_account_set.inputSchema.properties.platform.enum, ["META", "GOOGLE", "LINKEDIN"]);
});
