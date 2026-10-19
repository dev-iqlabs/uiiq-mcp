// node --test — uiiq_social_post_collection_ad (GET/POST
// /api/socials/posts/:id/collection-ad) and uiiq_social_post_collection_ad_status
// (GET .../collection-ad/status), against a local stand-in for UIIQ (a
// throwaway HOME with a fake session, so no real login is read or sent).
// Without confirm: true it only reads the form's context: nothing is made.
// With it, a fresh coll- requestId per call unless one is passed (a retry
// never makes a second ad); a 202 says to follow it with the status tool.
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

async function call(name, args, response) {
  reply = response;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}
const make = (args, response) => call("uiiq_social_post_collection_ad", args, response);

const AD = { pageId: "555", instagramActorId: "777", name: "Calm coins", dailyBudgetPence: 500, countries: ["GB"], primaryText: "New", headline: "Shop", ctaType: "SHOP_NOW", linkUrl: "https://shop.test", productIds: ["UC-A", "UC-B", "UC-C", "UC-D"] };
const CONTEXT = { adAccount: true, catalogue: false, pages: [{ id: "555", name: "Ultimate Coins" }], instagram: [], heroImage: "https://iqex-assets.s3.eu-west-2.amazonaws.com/x.png" };

test("without confirm: a dry run that only reads the context; nothing is made", async () => {
  for (const confirm of [undefined, false, "true", 1]) {
    const { result, requests } = await make({ id: "post 1", ...AD, confirm }, [200, CONTEXT]);
    assert.deepEqual(requests, [{ method: "GET", path: "/socials/posts/post%201/collection-ad" }]);
    assert.equal(result.dryRun, true);
    assert.deepEqual(result.context, CONTEXT);
    assert.deepEqual(result.wouldSend, AD);
    assert.match(result.message, /Nothing was made/);
  }
});

test("confirm: true sends a fresh coll- requestId each time; a 202 says to follow it with the status tool", async () => {
  const a = await make({ id: "post_1", ...AD, confirm: true }, [202, { status: "running", requestId: "x" }]);
  const b = await make({ id: "post_1", ...AD, confirm: true }, [202, { status: "running", requestId: "y" }]);
  assert.equal(a.requests.length, 1);
  assert.equal(a.requests[0].method, "POST");
  assert.equal(a.requests[0].path, "/socials/posts/post_1/collection-ad");
  const { requestId, ...sent } = a.requests[0].body;
  assert.deepEqual(sent, AD);
  assert.match(requestId, /^coll-[0-9a-f-]{36}$/);
  assert.notEqual(requestId, b.requests[0].body.requestId);
  assert.equal(a.result.requestId, requestId);
  assert.equal(a.result.status, "running");
  assert.match(a.result.note, new RegExp(`uiiq_social_post_collection_ad_status with requestId ${requestId}`));
});

test("made at once: the ids, and the note that the campaign alone runs nothing", async () => {
  const { result } = await make({ id: "post_1", ...AD, requestId: "coll-retry-1", confirm: true }, [200, { campaignId: "c1", adId: "a1", status: "PAUSED", duplicate: true }]);
  assert.equal(result.requestId, "coll-retry-1");
  assert.equal(result.campaignId, "c1");
  assert.match(result.note, /enabling the campaign alone runs nothing/);
});

test("only named fields are sent: a stray key (an ad account, a catalogue, a hero) never reaches UiiQ", async () => {
  const { requests } = await make({ id: "post_1", ...AD, adAccountId: "act_9", catalogId: "999", heroImageUrl: "https://evil.test/x.png", confirm: true }, [202, {}]);
  const body = requests[0].body;
  for (const k of ["adAccountId", "catalogId", "heroImageUrl", "confirm", "tenant", "id"]) assert.equal(k in body, false, k);
});

test("UiiQ's refusal is thrown with its words and the requestId", async () => {
  await assert.rejects(make({ id: "post_1", ...AD, requestId: "coll-mine", confirm: true }, [409, { error: "No product catalogue is connected yet" }]), /No product catalogue is connected yet \(requestId: coll-mine\)/);
  await assert.rejects(make({ id: "post_1", ...AD }, [409, { error: "Publish the post first" }]), /Publish the post first/);
});

test("the status tool asks the status route, with the requestId when given", async () => {
  const done = { status: "done", requestId: "coll-1", campaignId: "c1", adStatus: "PAUSED" };
  const a = await call("uiiq_social_post_collection_ad_status", { id: "post 1", requestId: "coll-1" }, [200, done]);
  assert.deepEqual(a.requests, [{ method: "GET", path: "/socials/posts/post%201/collection-ad/status?requestId=coll-1" }]);
  assert.deepEqual(a.result, done);
  const b = await call("uiiq_social_post_collection_ad_status", { id: "post_1" }, [200, { status: "running", requestId: "coll-2" }]);
  assert.equal(b.requests[0].path, "/socials/posts/post_1/collection-ad/status");
  await assert.rejects(call("uiiq_social_post_collection_ad_status", { id: "post_1" }, [404, { error: "No collection ad has been asked for on this post" }]), /No collection ad/);
});

test("the schemas: closed, paused, 4 to 50 products, the collection's four CTAs, £1 to £10", () => {
  const t = tools.uiiq_social_post_collection_ad;
  assert.match(t.description, /ALL PAUSED/);
  assert.match(t.description, /No product catalogue is connected yet/);
  assert.match(t.description, /never by making it again/);
  assert.equal(t.inputSchema.additionalProperties, false);
  assert.equal(t.inputSchema.properties.productIds.minItems, 4);
  assert.equal(t.inputSchema.properties.productIds.maxItems, 50);
  assert.deepEqual(t.inputSchema.properties.ctaType.enum, ["SHOP_NOW", "LEARN_MORE", "BUY_NOW", "ORDER_NOW"]);
  assert.equal(t.inputSchema.properties.dailyBudgetPence.minimum, 100);
  assert.equal(t.inputSchema.properties.dailyBudgetPence.maximum, 1000);
  assert.equal(tools.uiiq_social_post_collection_ad_status.inputSchema.additionalProperties, false);
  assert.match(tools.uiiq_social_post_collection_ad_status.description, /unknown: Meta may already have made it/);
});
