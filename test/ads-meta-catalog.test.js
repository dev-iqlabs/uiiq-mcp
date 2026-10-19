// node --test — uiiq_ads_meta_catalog, _check and _watch (GET /api/ads/meta/catalog,
// POST .../check, PUT .../monitoring), against a local stand-in for UIIQ (a
// throwaway HOME with a fake session). Switching on spends credits every day:
// without confirm: true it's a dry run that says the daily cost and changes
// nothing. No org id is ever sent: UiiQ takes it from the workspace.
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
  const { adsTools } = await import("../src/tools/ads.js");
  tools = Object.fromEntries(adsTools.map((t) => [t.name, t]));
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
const UC = "28614534538167887";
const OFF = { connected: true, catalogs: [{ catalogId: UC, enabled: false }], estimate: { products: 59, capped: false, creditsPerDay: 1 } };

test("health: one GET, the catalogue when named; the answer as given", async () => {
  const a = await call("uiiq_ads_meta_catalog", {}, [200, OFF]);
  assert.deepEqual(a.requests, [{ method: "GET", path: "/ads/meta/catalog" }]);
  assert.deepEqual(a.result, OFF);
  const b = await call("uiiq_ads_meta_catalog", { catalogId: UC }, [200, OFF]);
  assert.equal(b.requests[0].path, `/ads/meta/catalog?catalogId=${UC}`);
});

test("check now: one POST with the catalogue, nothing else", async () => {
  const { requests, result } = await call("uiiq_ads_meta_catalog_check", { catalogId: UC }, [200, { connected: true, catalogs: [], tooSoon: true }]);
  assert.deepEqual(requests, [{ method: "POST", path: "/ads/meta/catalog/check", body: { catalogId: UC } }]);
  assert.equal(result.tooSoon, true);
});

test("switching on without confirm: a dry run with the daily cost; nothing is changed", async () => {
  for (const confirm of [undefined, false, "true", 1]) {
    const { requests, result } = await call("uiiq_ads_meta_catalog_watch", { enabled: true, confirm }, [200, OFF]);
    assert.deepEqual(requests, [{ method: "GET", path: "/ads/meta/catalog" }]);
    assert.equal(result.dryRun, true);
    assert.equal(result.creditsPerDay, 1);
    assert.match(result.message, /Nothing was changed\. Watching would cost about 1 credit\(s\) a day\. The cost grows with the number of products/);
  }
});

test("confirm: true switches it on; switching off needs no confirm; only enabled and catalogId are sent, never an org id", async () => {
  const on = await call("uiiq_ads_meta_catalog_watch", { enabled: true, confirm: true, catalogId: UC, org_id: 999 }, [200, { catalogId: UC, enabled: true }]);
  assert.deepEqual(on.requests, [{ method: "PUT", path: "/ads/meta/catalog/monitoring", body: { enabled: true, catalogId: UC } }]);
  const off = await call("uiiq_ads_meta_catalog_watch", { enabled: false }, [200, { catalogId: UC, enabled: false }]);
  assert.deepEqual(off.requests, [{ method: "PUT", path: "/ads/meta/catalog/monitoring", body: { enabled: false } }]);
});

test("UiiQ's refusal is thrown with its words", async () => {
  await assert.rejects(call("uiiq_ads_meta_catalog_watch", { enabled: false }, [409, { error: "No Meta catalogue is connected yet" }]), /No Meta catalogue is connected yet/);
  await assert.rejects(call("uiiq_ads_meta_catalog", {}, [403, { error: "You don't have permission to do that." }]), /permission/);
});

test("the schemas are closed; the descriptions say it spends daily and grows with the products", () => {
  for (const n of ["uiiq_ads_meta_catalog", "uiiq_ads_meta_catalog_check", "uiiq_ads_meta_catalog_watch"]) assert.equal(tools[n].inputSchema.additionalProperties, false, n);
  assert.match(tools.uiiq_ads_meta_catalog_watch.description, /ON SPENDS IQEX CREDITS EVERY DAY/);
  assert.match(tools.uiiq_ads_meta_catalog_watch.description, /50,000 = 500 a day\)\. There's no daily limit/);
  assert.equal("orgId" in tools.uiiq_ads_meta_catalog_watch.inputSchema.properties || "org_id" in tools.uiiq_ads_meta_catalog_watch.inputSchema.properties, false);
});
