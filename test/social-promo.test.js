// node --test — uiiq_social_promo_templates and uiiq_social_promo_create
// (GET/POST /api/socials/promo-templates), against a local stand-in for UIIQ
// (a throwaway HOME with a fake session, so no real login is read or sent).
// The create tool makes a DRAFT only; a fresh requestId per call unless one
// is passed, and a passed one is sent as is (a retry isn't charged twice).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools;

const TENANTS = [{ id: "ten_uc", slug: "ultimatecoins", name: "Ultimate Coins" }];
const IMP = "ubms_impersonate=imp-uc-1";

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const path = req.url.replace(/^\/api/, "");
      const parsed = (() => { try { return JSON.parse(body); } catch { return body; } })();
      seen.push({ method: req.method, path, cookie: req.headers.cookie ?? "", ...(body ? { body: parsed } : {}) });
      const json = (status, data, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(data)); };
      if (path === "/admin/tenants") return json(200, TENANTS);
      if (path === "/admin/impersonate" && req.method === "POST") return json(200, { ok: true }, { "set-cookie": `${IMP}; Path=/; HttpOnly` });
      if (path === "/admin/impersonate/exit") return json(200, { ok: true });
      if (path === "/auth/csrf") return json(200, { csrfToken: "csrf-test" }, { "set-cookie": "authjs.csrf-token=csrf-test; Path=/" });
      if (path === "/auth/callback/credentials") return json(200, { url: "/" }, { "set-cookie": "authjs.session-token=renewed; Path=/; HttpOnly" });
      const [status, data] = reply;
      json(status, data);
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
  const { socialTools } = await import("../src/tools/social.js");
  tools = Object.fromEntries(socialTools.map((t) => [t.name, t]));
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

const LIST = { templates: [{ slug: "promo-collection-4x5", layout: "collection", size: "4x5", photoSlots: 5 }], brandDefaults: {}, maxPhotos: 5 };
const MADE = { success: true, post_id: "post_1", media_url: "https://media.test/p.png", template: "promo-collection-4x5", charged: [] };

test("templates: one GET /socials/promo-templates, UiiQ's answer back unchanged", async () => {
  const { result, requests } = await call("uiiq_social_promo_templates", {}, [200, LIST]);
  assert.deepEqual(requests.map(({ method, path }) => ({ method, path })), [{ method: "GET", path: "/socials/promo-templates" }]);
  assert.deepEqual(result, LIST);
});

test("create: one POST with the body, a fresh promo- requestId, and that id returned", async () => {
  const args = { template: "promo-collection-4x5", fields: { headline: "Coin" }, photos: [{ assetId: 11 }], content: "New in" };
  const a = await call("uiiq_social_promo_create", args, [200, MADE]);
  const b = await call("uiiq_social_promo_create", args, [200, MADE]);
  assert.equal(a.requests.length, 1);
  assert.equal(a.requests[0].method, "POST");
  assert.equal(a.requests[0].path, "/socials/promo-templates");
  const { requestId, ...rest } = a.requests[0].body;
  assert.deepEqual(rest, args);
  assert.match(requestId, /^promo-[0-9a-f-]{36}$/);
  assert.equal(a.result.requestId, requestId);
  assert.notEqual(b.requests[0].body.requestId, requestId);
  assert.deepEqual({ ...a.result, requestId: undefined }, { ...MADE, requestId: undefined });
});

test("create: a requestId passed is sent as is (the retry of a Create)", async () => {
  const { requests, result } = await call("uiiq_social_promo_create", { template: "promo-collection-4x5", requestId: "promo-retry-1" }, [200, MADE]);
  assert.equal(requests[0].body.requestId, "promo-retry-1");
  assert.equal(result.requestId, "promo-retry-1");
});

test("create with tenant: a write-enabled impersonation, then exit", async () => {
  const { requests } = await call("uiiq_social_promo_create", { template: "promo-collection-4x5", tenant: "ultimatecoins" }, [200, MADE]);
  assert.deepEqual(requests.find((r) => r.path === "/admin/impersonate").body, { tenantId: "ten_uc", writeEnabled: true });
  assert.match(requests.find((r) => r.path === "/socials/promo-templates").cookie, /ubms_impersonate=imp-uc-1/);
  assert.ok(requests.some((r) => r.path === "/admin/impersonate/exit"));
});

test("UiiQ's refusals come back in its own words", async () => {
  await assert.rejects(call("uiiq_social_promo_create", { template: "x" }, [400, { error: "fields.headline is too wide" }]), (e) => e.message === "fields.headline is too wide");
  await assert.rejects(call("uiiq_social_promo_templates", {}, [403, { error: "Feature not available on your current plan" }]), (e) => e.message === "Feature not available on your current plan");
});

test("create: IQEX's warnings on the draft come back with it, and the description says to check the image", async () => {
  const warnings = ["photo2: the photo could not be fetched; the card shows a placeholder"];
  const { result } = await call("uiiq_social_promo_create", { template: "promo-collection-4x5" }, [200, { ...MADE, warnings }]);
  assert.deepEqual(result.warnings, warnings);
  assert.match(tools.uiiq_social_promo_create.description, /charged, warnings }/);
  assert.match(tools.uiiq_social_promo_create.description, /check the image before publishing/);
});

test("create: photos sent and none placed is UiiQ's 422, in its own words (credits already spent said)", async () => {
  const msg = "None of the photos could be placed in the layout, so no draft was kept: photo: gone. IQEX had already charged 6 credits for making the image.";
  await assert.rejects(call("uiiq_social_promo_create", { template: "promo-collection-4x5", photos: [{ assetId: 11 }] }, [422, { error: msg, warnings: ["photo: gone"] }]), (e) => e.message === msg);
  assert.match(tools.uiiq_social_promo_create.description, /NONE placed is a 422 and no draft is saved/);
});

test("products: one GET /socials/promo-products, UiiQ's answer back unchanged", async () => {
  const PRODUCTS = { products: [{ id: "UC-ROBIN", title: "Robin", price: "£19.99", link: "https://shop.test/p", images: ["https://shop.test/a.jpg"] }], source: "https://shop.test/wp-json/uiiq/v1/feed/meta.csv" };
  const { result, requests } = await call("uiiq_social_promo_products", {}, [200, PRODUCTS]);
  assert.deepEqual(requests.map(({ method, path }) => ({ method, path })), [{ method: "GET", path: "/socials/promo-products" }]);
  assert.deepEqual(result, PRODUCTS);
});

test("the descriptions say it's a draft only, never cut, and how a retry works", () => {
  const c = tools.uiiq_social_promo_create.description;
  assert.match(c, /DRAFT social post/);
  assert.match(c, /Nothing is posted, and the image stays PRIVATE until the post is published/);
  assert.doesNotMatch(c, /permanent URL/);
  assert.match(c, /never cut/);
  assert.match(c, /pass the SAME one to retry/);
  assert.deepEqual(tools.uiiq_social_promo_create.inputSchema.required, ["template"]);
  assert.match(tools.uiiq_social_promo_templates.description, /collection/);
});

test("a photo's fit (fill or whole) goes to UiiQ as given; the schema names only those two", async () => {
  const { requests } = await call("uiiq_social_promo_create", { template: "promo-collection-4x5", photos: [{ assetId: 11, fit: "whole" }, { url: "https://shop.test/b.jpg" }] }, [200, MADE]);
  assert.deepEqual(requests[0].body.photos, [{ assetId: 11, fit: "whole" }, { url: "https://shop.test/b.jpg" }]);
  assert.deepEqual(tools.uiiq_social_promo_create.inputSchema.properties.photos.items.properties.fit.enum, ["fill", "whole"]);
  assert.match(tools.uiiq_social_promo_create.description, /'whole' \(all of it on a blur of itself, so a round coin keeps its rim\)/);
});

test("uiiq_social_post_publish_status: one GET for the post; UiiQ's answer as given; NEEDS_CHECK means tell the person, never publish again", async () => {
  const status = { status: "PUBLISHED", posting: 1, targets: [{ id: "t_ig", platform: "INSTAGRAM", status: "PUBLISHING", label: "Posting…", permalink: null, errorMessage: null }] };
  const { requests, result } = await call("uiiq_social_post_publish_status", { id: "post/1" }, [200, status]);
  assert.deepEqual(requests.map((r) => [r.method, r.path]), [["GET", "/socials/posts/post%2F1/publish-status"]]);
  assert.deepEqual(result, status);
  await assert.rejects(call("uiiq_social_post_publish_status", { id: "post_1" }, [404, { error: "Not found" }]), /Not found/);
  const t = tools.uiiq_social_post_publish_status;
  assert.match(t.description, /NEEDS_CHECK: it may have been posted.*never publish it again yourself/);
  assert.equal(t.inputSchema.additionalProperties, false);
});
