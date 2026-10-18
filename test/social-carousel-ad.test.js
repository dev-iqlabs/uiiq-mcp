// node --test — uiiq_social_post_carousel_ad (GET/POST
// /api/socials/posts/:id/carousel-ad), against a local stand-in for UIIQ (a
// throwaway HOME with a fake session, so no real login is read or sent).
// Without confirm: true it only reads the form's context: nothing is made.
// With it, a fresh requestId per call unless one is passed (a retry never
// makes a second ad), and the reply says enabling the campaign runs nothing.
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
      const path = req.url.replace(/^\/api/, "");
      seen.push({ method: req.method, path, ...(body ? { body: JSON.parse(body) } : {}) });
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
  const { socialTools } = await import("../src/tools/social.js");
  tools = Object.fromEntries(socialTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(args, response) {
  reply = response;
  seen = [];
  const result = await tools.uiiq_social_post_carousel_ad.handler(args);
  return { result, requests: seen };
}

const AD = { pageId: "555", name: "Coins", dailyBudgetPence: 500, countries: ["GB"], primaryText: "New", headline: "Shop", ctaType: "SHOP_NOW", linkUrl: "https://shop.test", collectionName: "The collection", products: [{ productId: "UC-ROBIN", photoIndex: 1, name: "Robin · £19.99" }] };
const CONTEXT = { adAccount: true, pages: [{ id: "555", name: "Ultimate Coins" }], collectionImage: "https://media.test/public/901.png", defaults: { dailyBudgetPence: 500 } };

test("without confirm: a dry run that only reads the context; nothing is made", async () => {
  for (const confirm of [undefined, false, "true", 1]) {
    const { result, requests } = await call({ id: "post 1", ...AD, confirm }, [200, CONTEXT]);
    assert.deepEqual(requests, [{ method: "GET", path: "/socials/posts/post%201/carousel-ad" }]);
    assert.equal(result.dryRun, true);
    assert.deepEqual(result.context, CONTEXT);
    assert.deepEqual(result.wouldSend, AD);
    assert.match(result.message, /Nothing was made.*ad set AND its ad.*enabling the campaign alone runs nothing/);
  }
});

test("confirm: true makes it with a fresh requestId each time, and says the campaign alone runs nothing", async () => {
  const made = { campaignId: "c1", adSetId: "s1", adId: "a1", adsManagerUrl: null, status: "PAUSED", duplicate: false };
  const a = await call({ id: "post_1", ...AD, confirm: true }, [200, made]);
  const b = await call({ id: "post_1", ...AD, confirm: true }, [200, made]);
  assert.equal(a.requests.length, 1);
  assert.equal(a.requests[0].method, "POST");
  assert.equal(a.requests[0].path, "/socials/posts/post_1/carousel-ad");
  const { requestId, ...sent } = a.requests[0].body;
  assert.deepEqual(sent, AD);
  assert.match(requestId, /^ad-[0-9a-f-]{36}$/);
  assert.notEqual(requestId, b.requests[0].body.requestId);
  assert.equal(a.result.requestId, requestId);
  assert.equal(a.result.status, "PAUSED");
  assert.match(a.result.note, /enabling the campaign alone runs nothing.*isn't held to UiiQ's £10/);
  assert.equal("confirm" in a.requests[0].body || "tenant" in a.requests[0].body || "id" in a.requests[0].body, false);
});

test("a passed requestId is sent as is (a retry after a timeout never makes a second)", async () => {
  const { requests } = await call({ id: "post_1", ...AD, requestId: "ad-retry-1", confirm: true }, [200, { adId: "a1", duplicate: true }]);
  assert.equal(requests[0].body.requestId, "ad-retry-1");
});

test("UiiQ's refusal is thrown with its words (IQEX's ceiling, 'may already exist')", async () => {
  await assert.rejects(call({ id: "post_1", ...AD, confirm: true }, [503, { error: "The Meta daily budget ceiling isn't set" }]), /ceiling isn't set/);
  // The id this call made is in the error, to retry a "still being made" 409 with (Lucas, on #111 L-D).
  await assert.rejects(call({ id: "post_1", ...AD, requestId: "ad-mine", confirm: true }, [409, { error: "Still being made" }]), /Still being made \(requestId: ad-mine, retry with this one\)/);
  await assert.rejects(call({ id: "post_1", ...AD }, [409, { error: "Publish the post first" }]), /Publish the post first/);
});

test("the description says it's paused, the ad set and ad need switching on, and the budget is £1 to £10", () => {
  const t = tools.uiiq_social_post_carousel_ad;
  assert.match(t.description, /ALL PAUSED/);
  assert.match(t.description, /ad set AND its ad/);
  assert.match(t.description, /409 "still being made": retry the SAME requestId/);
  assert.match(t.description, /use a new requestId only if it isn't there/);
  assert.equal(t.inputSchema.additionalProperties, false);
  assert.equal(t.inputSchema.properties.products.items.additionalProperties, false);
  assert.deepEqual(t.inputSchema.properties.products.items.required, ["productId"]);
  assert.equal(t.inputSchema.properties.dailyBudgetPence.maximum, 1000);
  assert.equal(t.inputSchema.properties.dailyBudgetPence.minimum, 100);
});

test("only named fields are sent: a stray top-level key or a product's imageUrl/linkUrl never reach UiiQ (Lucas, on #109 L1)", async () => {
  const { requests } = await call({ id: "post_1", ...AD, adAccountId: "act_999", products: [{ productId: "UC-ROBIN", photoIndex: 0, imageUrl: "https://evil.test/x.jpg", linkUrl: "https://evil.test" }], confirm: true }, [200, { adId: "a1" }]);
  const body = requests[0].body;
  assert.equal("adAccountId" in body, false);
  assert.deepEqual(body.products, [{ productId: "UC-ROBIN", photoIndex: 0 }]);
});

// IQEX makes it in the background (about a minute): 202, then uiiq_social_carousel_ad_status.
test("202 (or a 504, no answer in time): { status: running, requestId } and what to ask next; never thrown", async () => {
  for (const [code, body] of [[202, { status: "running", requestId: "ad-x" }], [504, { error: "The server took too long" }]]) {
    const { result, requests } = await call({ id: "post_1", ...AD, requestId: "ad-x", confirm: true }, [code, body]);
    assert.equal(requests.length, 1, String(code));
    assert.equal(result.status, "running");
    assert.equal(result.requestId, "ad-x");
    assert.match(result.next, /uiiq_social_carousel_ad_status with id "post_1" and requestId "ad-x".*never make a new request/);
  }
  assert.match(tools.uiiq_social_post_carousel_ad.description, /status: "running", requestId.*uiiq_social_carousel_ad_status/);
});

async function status(args, response) {
  reply = response;
  seen = [];
  const result = await tools.uiiq_social_carousel_ad_status.handler(args);
  return { result, requests: seen };
}

test("uiiq_social_carousel_ad_status: GET the status route with the requestId; done carries the switch-on reminder", async () => {
  const done = { status: "done", requestId: "ad-x", campaignId: "c1", adSetId: "s1", adId: "a1", adsManagerUrl: "https://adsmanager.facebook.com/x", adStatus: "PAUSED" };
  const a = await status({ id: "post 1", requestId: "ad x" }, [200, done]);
  assert.deepEqual(a.requests, [{ method: "GET", path: "/socials/posts/post%201/carousel-ad/status?requestId=ad%20x" }]);
  assert.deepEqual({ ...a.result, note: undefined }, { ...done, note: undefined });
  assert.match(a.result.note, /ad set AND its ad/);
  for (const r of [{ status: "running", requestId: "ad-x" }, { status: "failed", requestId: "ad-x", error: "The ad set wasn't made" }, { status: "unknown", requestId: "ad-x", error: "Check Ads Manager" }]) {
    assert.deepEqual((await status({ id: "post_1", requestId: "ad-x" }, [200, r])).result, r);
  }
});

test("uiiq_social_carousel_ad_status: no requestId asks for the latest; a refusal is thrown with its words; only id, requestId, tenant accepted", async () => {
  const { requests } = await status({ id: "post_1" }, [200, { status: "running", requestId: "ad-y" }]);
  assert.equal(requests[0].path, "/socials/posts/post_1/carousel-ad/status");
  await assert.rejects(status({ id: "post_1" }, [404, { error: "No carousel ad has been asked for on this post" }]), /No carousel ad has been asked for/);
  const s = tools.uiiq_social_carousel_ad_status.inputSchema;
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(Object.keys(s.properties).sort(), ["id", "requestId", "tenant"]);
  assert.deepEqual(s.required, ["id"]);
  assert.match(tools.uiiq_social_carousel_ad_status.description, /unknown.*check Ads Manager before making another/);
});
