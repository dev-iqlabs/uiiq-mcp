// node --test: Fix with AI for a category, tag or product page, against a
// local stand-in for UIIQ (a throwaway HOME with a fake session).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
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
  const { seoTools } = await import("../src/tools/seo.js");
  tools = Object.fromEntries(seoTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args) {
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

const APPLY = { siteId: "site_uc", kind: "term", id: 7, taxonomy: "product_cat", fields: { description: "Memorial coins made to order" }, pageUrl: "https://shop.example/product-category/memorial-coins/" };

test("propose sends the issue and writes nothing", async () => {
  const r = await call("uiiq_seo_meta_fix", { issueTitle: "Missing meta description", pageUrl: APPLY.pageUrl, auditSiteUrl: "https://shop.example" });
  assert.deepEqual(r.requests, [{ method: "POST", path: "/seo/meta-fix", body: { issueTitle: "Missing meta description", pageUrl: APPLY.pageUrl, auditSiteUrl: "https://shop.example" } }]);
});

test("apply and undo: dry runs without confirm: true, sending nothing", async () => {
  for (const confirm of [undefined, false, "true", 1]) {
    let r = await call("uiiq_seo_meta_fix_apply", { ...APPLY, confirm });
    assert.deepEqual(r.requests, [], `apply confirm=${confirm}`);
    assert.equal(r.result.dryRun, true);
    r = await call("uiiq_seo_meta_fix_undo", { changeId: "chg_1", confirm });
    assert.deepEqual(r.requests, [], `undo confirm=${confirm}`);
    assert.equal(r.result.dryRun, true);
  }
});

test("apply and undo with confirm: their own routes, only what was given", async () => {
  let r = await call("uiiq_seo_meta_fix_apply", { ...APPLY, confirm: true });
  assert.deepEqual(r.requests, [{ method: "POST", path: "/seo/meta-fix/apply", body: APPLY }]);
  r = await call("uiiq_seo_meta_fix_undo", { changeId: "chg_1", confirm: true });
  assert.deepEqual(r.requests, [{ method: "POST", path: "/seo/meta-fix/chg_1/undo" }]);
});

test("an id that isn't one never reaches a route", async () => {
  await assert.rejects(() => tools.uiiq_seo_meta_fix_undo.handler({ changeId: "../x", confirm: true }), /must be an id/);
  await assert.rejects(() => tools.uiiq_seo_meta_fix_apply.handler({ ...APPLY, siteId: "..", confirm: true }), /must be an id/);
});
