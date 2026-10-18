// node --test — uiiq_admin_sender_bindings_get / uiiq_admin_sender_binding_set
// (GET/PUT /api/admin/tenants/:id/sender-bindings), against a local stand-in for
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
  const list = Object.values(mod).find((v) => Array.isArray(v) && v.some((t) => t?.name === "uiiq_admin_sender_binding_set"));
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
  const { result, requests } = await call("uiiq_admin_sender_bindings_get", { tenantId: "ten 1" }, [200, { bindings: [{ value: "ultimatecoins.co.uk", kind: "domain" }] }]);
  assert.deepEqual(requests, [{ method: "GET", path: "/admin/tenants/ten%201/sender-bindings" }]);
  assert.equal(result.bindings[0].value, "ultimatecoins.co.uk");
});

test("set: one PUT with only the value and bound; false unlinks it", async () => {
  let r = await call("uiiq_admin_sender_binding_set", { tenantId: "ten_1", value: "ultimatecoins.co.uk", bound: true, confirm: true }, [200, { value: "ultimatecoins.co.uk", kind: "domain", bound: true }]);
  assert.deepEqual(r.requests, [{ method: "PUT", path: "/admin/tenants/ten_1/sender-bindings", body: { value: "ultimatecoins.co.uk", bound: true } }]);
  r = await call("uiiq_admin_sender_binding_set", { tenantId: "ten_1", value: "ultimatecoins.co.uk", bound: false, confirm: true }, [200, { value: "ultimatecoins.co.uk", kind: "domain", bound: false }]);
  assert.deepEqual(r.requests[0].body, { value: "ultimatecoins.co.uk", bound: false });
});

test("UiiQ's refusal is thrown with its words", async () => {
  await assert.rejects(call("uiiq_admin_sender_binding_set", { tenantId: "ten_1", value: "milestoneranch.co.uk", bound: true, confirm: true }, [409, { error: "milestoneranch.co.uk is already linked to milestoneranch" }]), /already linked to milestoneranch/);
});

test("the schemas are closed; bound is a boolean", () => {
  for (const n of ["uiiq_admin_sender_bindings_get", "uiiq_admin_sender_binding_set"]) assert.equal(tools[n].inputSchema.additionalProperties, false);
  assert.equal(tools.uiiq_admin_sender_binding_set.inputSchema.properties.bound.type, "boolean");
});

test("without confirm: true, a dry run: nothing is sent (Lucas, #1039 L-4)", async () => {
  for (const extra of [{}, { confirm: false }, { confirm: "yes" }]) {
    const { result, requests } = await call("uiiq_admin_sender_binding_set", { tenantId: "ten_1", value: "ultimatecoins.co.uk", bound: true, ...extra }, [200, {}]);
    assert.deepEqual(requests, []);
    assert.equal(result.dryRun, true);
    assert.match(result.wouldDo, /link ultimatecoins\.co\.uk to tenant ten_1/);
  }
});
