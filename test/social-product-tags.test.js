// node --test — Instagram product tags (UiiQ-platform #1230): uiiq_social_product_tags (GET
// /api/socials/product-tags?accountIds=), and productTags on uiiq_social_post_create (POST),
// _update (PATCH) and _save (PUT), against a local stand-in for UIIQ (a throwaway HOME with a
// fake session, so no real login is read or sent anywhere). Nothing is published.
//
// What these hold still: create forwards productTags by name (its handler sends named fields
// only), update and save send it as given, null is sent as null (that is how UiiQ clears), a
// photo address that isn't one of mediaUrls is refused before any request (UiiQ would drop its
// tags without a word), and UiiQ's refusals come back in its own words.
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
  const { socialTools } = await import("../src/tools/social.js");
  tools = Object.fromEntries(socialTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, answer = [500, { error: "nothing should have been called" }]) {
  reply = answer;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

const PHOTO = "https://cdn.example/coin-robin.jpg";
const PHOTO2 = "https://cdn.example/coin-wren.jpg";
const TAGS = { [PHOTO]: [{ sku: "UC-ROBIN", x: 0.5, y: 0.4 }] };
const ELIGIBILITY = {
  enabled: true, show: true,
  accounts: [{ id: "acc_ig", name: "ultimatecoins", eligible: true, reason: null }],
  products: [{ sku: "UC-ROBIN", title: "Robin coin", imageUrl: PHOTO }],
  productsError: null,
};

test("product_tags: one GET with the account ids, UiiQ's answer passed back unchanged", async () => {
  const { result, requests } = await call("uiiq_social_product_tags", { accountIds: ["acc_ig", "acc_ig2"] }, [200, ELIGIBILITY]);
  assert.deepEqual(requests, [{ method: "GET", path: "/socials/product-tags?accountIds=acc_ig%2Cacc_ig2" }]);
  assert.deepEqual(result, ELIGIBILITY);
});

test("product_tags: UiiQ's refusal comes back in its own words", async () => {
  await assert.rejects(
    call("uiiq_social_product_tags", { accountIds: ["acc_fb"] }, [400, { error: "Those aren't this workspace's Instagram accounts" }]),
    (e) => e.message === "Those aren't this workspace's Instagram accounts",
  );
});

test("product_tags: the schema takes 1 to 10 account ids and nothing else; it says it only reads", () => {
  const t = tools.uiiq_social_product_tags;
  assert.deepEqual(t.inputSchema.required, ["accountIds"]);
  assert.equal(t.inputSchema.additionalProperties, false);
  assert.equal(t.inputSchema.properties.accountIds.minItems, 1);
  assert.equal(t.inputSchema.properties.accountIds.maxItems, 10);
  assert.match(t.description, /instagram_product_tags/);
  assert.match(t.description, /Reads only\.$/);
});

test("create: productTags is forwarded by name, with the named fields only", async () => {
  const { requests } = await call(
    "uiiq_social_post_create",
    { content: "Coin of the week", targetAccountIds: ["acc_ig"], mediaUrls: [PHOTO], productTags: TAGS, scheduledAt: "2026-10-26T09:00:00Z" },
    [201, { id: "post_1", productTags: TAGS, targets: [] }],
  );
  assert.deepEqual(requests, [{ method: "POST", path: "/socials/posts", body: { content: "Coin of the week", targetAccountIds: ["acc_ig"], mediaUrls: [PHOTO], productTags: TAGS } }]);
});

test("create: no productTags given, no productTags key sent; null is sent as null", async () => {
  let { requests } = await call("uiiq_social_post_create", { content: "c", targetAccountIds: ["acc_ig"], mediaUrls: [PHOTO] }, [201, { id: "p" }]);
  assert.equal("productTags" in requests[0].body, false);
  ({ requests } = await call("uiiq_social_post_create", { content: "c", targetAccountIds: ["acc_ig"], mediaUrls: [PHOTO], productTags: null }, [201, { id: "p" }]));
  assert.equal(requests[0].body.productTags, null);
});

test("create and save: a photo address that isn't one of mediaUrls is refused before any request", async () => {
  const off = { "https://cdn.example/typo.jpg": [{ sku: "UC-ROBIN", x: 0.5, y: 0.5 }] };
  for (const [name, args, why] of [
    ["uiiq_social_post_create", { content: "c", targetAccountIds: ["acc_ig"], mediaUrls: [PHOTO], productTags: off }, /typo\.jpg isn't one of mediaUrls.*Nothing was sent/],
    ["uiiq_social_post_create", { content: "c", targetAccountIds: ["acc_ig"], productTags: TAGS }, /isn't one of mediaUrls/],
    ["uiiq_social_post_save", { id: "post_1", content: "c", targetAccountIds: ["acc_ig"], mediaUrls: [PHOTO2], productTags: TAGS, status: "QUEUED", confirm: true }, /coin-robin\.jpg isn't one of mediaUrls/],
  ]) {
    await assert.rejects(call(name, args, [200, {}]), why);
    assert.deepEqual(seen, [], name);
  }
});

test("create: an address with no tags left on it ({ url: [] }) is no refusal", async () => {
  const { requests } = await call("uiiq_social_post_create", { content: "c", targetAccountIds: ["acc_ig"], mediaUrls: [PHOTO], productTags: { ...TAGS, "https://cdn.example/gone.jpg": [] } }, [201, { id: "p" }]);
  assert.equal(requests.length, 1);
});

test("update: productTags sent in the PATCH as given; a DRAFT edit needs no confirm", async () => {
  const { result, requests } = await call("uiiq_social_post_update", { id: "post 1", productTags: TAGS }, [200, { id: "post 1", productTags: TAGS }]);
  assert.deepEqual(requests, [{ method: "PATCH", path: "/socials/posts/post%201", body: { productTags: TAGS } }]);
  assert.deepEqual(result.productTags, TAGS);
});

test("update: null clears them (sent as null)", async () => {
  const { requests } = await call("uiiq_social_post_update", { id: "post_1", productTags: null }, [200, { id: "post_1", productTags: null }]);
  assert.deepEqual(requests[0].body, { productTags: null });
});

test("save: productTags sent in the PUT with the rest of the composer save", async () => {
  const { requests } = await call(
    "uiiq_social_post_save",
    { id: "post_1", content: "c", targetAccountIds: ["acc_ig"], mediaUrls: [PHOTO, PHOTO2], productTags: TAGS, status: "DRAFT" },
    [200, { id: "post_1" }],
  );
  assert.deepEqual(requests, [{ method: "PUT", path: "/socials/posts/post_1", body: { content: "c", targetAccountIds: ["acc_ig"], mediaUrls: [PHOTO, PHOTO2], productTags: TAGS, status: "DRAFT" } }]);
});

test("UiiQ's refusals of tags come back in its own words (feature off, a broken rule)", async () => {
  await assert.rejects(
    call("uiiq_social_post_update", { id: "post_1", productTags: TAGS }, [403, { error: "Instagram product tags aren't switched on for this workspace" }]),
    (e) => e.message === "Instagram product tags aren't switched on for this workspace",
  );
  await assert.rejects(
    call("uiiq_social_post_save", { id: "post_1", content: "c", targetAccountIds: ["acc_ig"], mediaUrls: [PHOTO, PHOTO2], productTags: TAGS }, [400, { error: "A photo can have at most 5 product tags" }]),
    (e) => e.message === "A photo can have at most 5 product tags",
  );
});

test("productTags is on create, update and save's schemas; get and publish_status say they return it", () => {
  for (const name of ["uiiq_social_post_create", "uiiq_social_post_update", "uiiq_social_post_save"]) {
    const p = tools[name].inputSchema.properties.productTags;
    assert.ok(p, name);
    assert.deepEqual(p.type, ["object", "null"]);
    assert.deepEqual(p.additionalProperties.items.required, ["sku", "x", "y"]);
    assert.equal(p.additionalProperties.items.properties.x.maximum, 1);
    assert.match(p.description, /5 on each photo of a carousel/);
  }
  assert.match(tools.uiiq_social_post_create.description, /productTags/);
  assert.match(tools.uiiq_social_post_get.description, /productTags/);
  assert.match(tools.uiiq_social_post_publish_status.description, /productTags/);
  assert.match(tools.uiiq_social_post_publish_status.description, /outcome: \{ asked, tagged, notes \}/);
});
