// node --test — uiiq_tenant_features says what UIIQ said (never an empty
// "Error:"), and the organisation tools that called routes UIIQ has never had
// are gone. Against a local stand-in for UIIQ (a throwaway HOME with a fake
// session), so no real login is read or sent anywhere.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools, orgTools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, json, headers = {}] = reply;
      res.writeHead(status, json === null ? headers : { "content-type": "application/json", ...headers });
      res.end(json === null ? "" : JSON.stringify(json));
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
  const { tenantTools } = await import("../src/tools/tenant.js");
  tools = Object.fromEntries(tenantTools.map((t) => [t.name, t]));
  ({ orgTools } = await import("../src/tools/org.js"));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

const call = (r, args) => { reply = r; seen = []; return tools.uiiq_tenant_features.handler(args); };
const failsWith = async (r, args, re) => {
  await assert.rejects(call(r, args), (e) => { assert.match(e.message, re); return true; });
};

test("enable sends one PATCH { flag: true } and answers what UIIQ answered", async () => {
  const out = await call([200, { ok: true }], { id: "ten_1", enable: "till" });
  assert.deepEqual(out, { ok: true });
  assert.deepEqual(seen, [{ method: "PATCH", path: "/admin/tenants/ten_1/features", body: { till: true } }]);
  const off = await call([200, { ok: true }], { id: "ten_1", disable: "till" });
  assert.deepEqual(off, { ok: true });
  assert.deepEqual(seen[0].body, { till: false });
});

test("a redirect with no body (the empty 'Error:') says the status and where it went", async () => {
  await failsWith([307, null, { location: "http://127.0.0.1/dashboard" }], { id: "ten_1", enable: "till" }, /^HTTP 307 to http:\/\/127\.0\.0\.1\/dashboard$/);
});

test("UIIQ's own message comes through: a refusal, and 'no such feature' with the keys it ignored", async () => {
  await failsWith([403, { error: "Forbidden" }], { id: "ten_1", enable: "till" }, /^Forbidden$/);
  await failsWith([404, { error: "No such feature", ignored: ["tlil"] }], { id: "ten_1", enable: "tlil" }, /^No such feature: tlil$/);
  await failsWith([409, { error: "This workspace hasn't accepted the Prospect Campaigns terms (version 2) yet." }], { id: "ten_1", enable: "prospect_campaigns" }, /Prospect Campaigns terms/);
});

test("an empty 4xx/5xx body still names the status", async () => {
  await failsWith([503, null], { id: "ten_1", enable: "till" }, /^HTTP 503$/);
});

test("reading the flags: a refusal is reported as what it is, not 'not found'", async () => {
  const flags = await call([200, { till: true, shop: false }], { id: "ten_1" });
  assert.deepEqual(flags, { till: true, shop: false });
  assert.deepEqual(seen, [{ method: "GET", path: "/admin/tenants/ten_1/features" }]);
  await failsWith([403, { error: "Forbidden" }], { id: "ten_1" }, /^Forbidden$/);
});

test("the organisation tools that called routes UIIQ has never had are gone; onboarding and profile stay", () => {
  assert.deepEqual(orgTools.map((t) => t.name), ["uiiq_org_onboarding_status", "uiiq_org_profile_get", "uiiq_org_profile_update"]);
});
