// node --test — which tenant a `tenant` argument names (Lucas R112-1, the twin of
// uiiq-cli's --tenant lookup). It took the first of the newest 200 tenants whose
// id, slug OR name matched, so a newer tenant whose owner renamed it to another's
// slug captured every call for that slug. Now an id is looked up directly, and a
// slug or name two tenants answer to is refused with both listed. Against a local
// stand-in with UiiQ's lookup semantics (a throwaway HOME with a fake session).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")).version;
const UC = { id: "ten_uc", slug: "ultimatecoins", name: "Ultimate Coins" };
const SB = { id: "ten_sb", slug: "streetbeat", name: "Streetbeat" };
// A NEWER tenant whose owner renamed it to UC's slug. UiiQ lists newest first.
const IMPOSTOR = { id: "ten_evil", slug: "evil-co", name: "ultimatecoins" };

let server, home, seen, tenants, directOverride, tools, auth;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const path = url.pathname.replace(/^\/api/, "");
      seen.push({ method: req.method, path: path + url.search, cookie: req.headers.cookie ?? "", ua: req.headers["user-agent"] ?? "", ...(body ? { body: JSON.parse(body) } : {}) });
      const json = (status, data, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(data)); };
      // UiiQ: /admin/tenants/<id> by id only; ?search= is name-or-slug contains, newest first, up to ?limit (500 at most).
      const direct = /^\/admin\/tenants\/([^/]+)$/.exec(path);
      if (direct && req.method === "GET") {
        if (directOverride) return json(200, directOverride);
        const t = tenants.find((x) => x.id === decodeURIComponent(direct[1]));
        return t ? json(200, t) : json(404, { error: "Tenant not found" });
      }
      if (path === "/admin/tenants" && req.method === "GET") {
        const q = (url.searchParams.get("search") ?? "").toLowerCase();
        const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);
        return json(200, tenants.filter((t) => t.slug.includes(q) || t.name.toLowerCase().includes(q)).slice(0, limit));
      }
      if (path === "/admin/impersonate" && req.method === "POST") {
        const { tenantId } = JSON.parse(body);
        return json(200, { tenantId }, { "set-cookie": `ubms_impersonate=imp-${tenantId}; Path=/; HttpOnly` });
      }
      if (path === "/admin/impersonate/exit") return json(200, { ok: true });
      if (path === "/assets") return json(200, { total: 0, assets: [] });
      json(500, { error: `unexpected ${req.method} ${path}` });
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
  auth = await import("../src/auth.js");
  const { mediaTools } = await import("../src/tools/media.js");
  tools = Object.fromEntries(mediaTools.map((t) => [t.name, t]));
});

beforeEach(() => {
  seen = [];
  tenants = [UC, SB];
  directOverride = null;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

const lines = () => seen.map((q) => `${q.method} ${q.path}`);
const list = (tenant) => tools.uiiq_media_list.handler({ tenant });
const LOOKUP = (ref) => [`GET /admin/tenants/${encodeURIComponent(ref)}`, `GET /admin/tenants?search=${encodeURIComponent(ref)}&limit=500`];

// Refusals first: they're never cached, and a success for the same ref would be (5 minutes).
test("a newer tenant renamed to another's slug is refused with both listed, before any impersonation", async () => {
  tenants = [IMPOSTOR, UC];
  await assert.rejects(list("ultimatecoins"), (e) => {
    assert.equal(e.message, 'Tenant "ultimatecoins" matches 2 tenants: ultimatecoins (evil-co, ten_evil), Ultimate Coins (ultimatecoins, ten_uc). Pass the id. Nothing was sent.');
    return true;
  });
  assert.deepEqual(lines(), LOOKUP("ultimatecoins"));
});

test("withTenant refuses the same way, and its batch never runs", async () => {
  tenants = [IMPOSTOR, UC];
  let ran = false;
  await assert.rejects(auth.withTenant("ultimatecoins", async () => { ran = true; }), /matches 2 tenants/);
  assert.equal(ran, false);
  assert.ok(!lines().includes("POST /admin/impersonate"));
});

test("two tenants with the same name are refused, each listed", async () => {
  tenants = [{ id: "ten_rb", slug: "riverside-b", name: "Riverside Dance" }, { id: "ten_ra", slug: "riverside-a", name: "Riverside Dance" }];
  await assert.rejects(list("Riverside Dance"), (e) => {
    assert.equal(e.message, 'Tenant "Riverside Dance" matches 2 tenants: Riverside Dance (riverside-b, ten_rb), Riverside Dance (riverside-a, ten_ra). Pass the id. Nothing was sent.');
    return true;
  });
  assert.deepEqual(lines(), LOOKUP("Riverside Dance"));
});

test("a full page is refused, even with one exact match: what was cut off could be the one meant", async () => {
  tenants = [IMPOSTOR, ...Array.from({ length: 499 }, (_, i) => ({ id: `ten_${i}`, slug: `ultimatecoins-${i}`, name: `Coins ${i}` })), UC];
  await assert.rejects(list("ultimatecoins"), /^Error: Too many tenants match "ultimatecoins" to be sure of the one meant\. Pass the id\. Nothing was sent\.$/);
  assert.ok(!lines().includes("POST /admin/impersonate"));
});

test("an unknown ref is refused", async () => {
  await assert.rejects(list("nosuchplace"), /^Error: Unknown tenant: nosuchplace \(pass a tenant id, slug or exact name\)$/);
  assert.deepEqual(lines(), LOOKUP("nosuchplace"));
});

test("the id goes straight to its tenant, beside an impostor; every request says it's uiiq-mcp", async () => {
  tenants = [IMPOSTOR, UC];
  assert.deepEqual(await list("ten_uc"), { total: 0, assets: [] });
  assert.deepEqual(lines(), ["GET /admin/tenants/ten_uc", "POST /admin/impersonate", "GET /assets", "POST /admin/impersonate/exit"]);
  assert.deepEqual(seen[1].body, { tenantId: "ten_uc", writeEnabled: false });
  assert.match(seen[2].cookie, /ubms_impersonate=imp-ten_uc/);
  for (const q of seen) assert.equal(q.ua, `uiiq-mcp/${VERSION}`, `${q.method} ${q.path}`);
});

test("a slug only one tenant answers to goes through; an answer by id is taken only for that id", async () => {
  // A direct answer for some other id (a stand-in, or a route that ever matched loosely) isn't trusted.
  directOverride = IMPOSTOR;
  await list("streetbeat");
  assert.deepEqual(lines().slice(0, 3), [...LOOKUP("streetbeat"), "POST /admin/impersonate"]);
  assert.deepEqual(seen[2].body, { tenantId: "ten_sb", writeEnabled: false });
});
