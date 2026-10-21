// node --test — uiiq_social_carousel_post (POST
// /api/socials/posts/:id/carousel-post), against a local stand-in for UIIQ (a
// throwaway HOME with a fake session, so no real login is read or sent).
// A DRAFT only: one POST carrying only each product's id and photo number,
// in slide order; nothing is published.
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
  const result = await tools.uiiq_social_carousel_post.handler(args);
  return { result, requests: seen };
}

const MADE = { postId: "post_9", slides: 3, mediaUrls: ["https://app.uiiq.co.uk/api/socials/promo-media/901", "https://shop.test/robin-mockup.jpg", "https://shop.test/eotm.jpg"] };

test("one POST with only the products' ids and photo numbers, in slide order; the draft back, saying nothing was published", async () => {
  const { result, requests } = await call({ id: "post 1", products: [{ productId: "UC-ROBIN", photoIndex: 1, imageUrl: "https://evil.test/x.png" }, { productId: "UC-EOTM" }], mediaUrls: ["https://evil.test/y.png"] }, [201, MADE]);
  assert.deepEqual(requests, [{ method: "POST", path: "/socials/posts/post%201/carousel-post", body: { products: [{ productId: "UC-ROBIN", photoIndex: 1 }, { productId: "UC-EOTM" }] } }]);
  assert.deepEqual(result, { ...MADE, note: "A DRAFT: nothing was published. A person reviews and publishes it in UiiQ." });
});

test("UiiQ's refusal comes back as the error", async () => {
  await assert.rejects(call({ id: "post_1", products: [{ productId: "UC-ROBIN" }] }, [400, { error: "A carousel post is made from a shop collection promo" }]), /made from a shop collection promo/);
});

test("the schema: 1 to 9 products, id required, nothing else accepted", () => {
  const s = tools.uiiq_social_carousel_post.inputSchema;
  assert.deepEqual(s.required, ["id", "products"]);
  assert.equal(s.additionalProperties, false);
  assert.equal(s.properties.products.minItems, 1);
  assert.equal(s.properties.products.maxItems, 9);
  assert.deepEqual(Object.keys(s.properties.products.items.properties), ["productId", "photoIndex"]);
  assert.equal(s.properties.products.items.additionalProperties, false);
});

// A product's spin video first (UiiQ-platform #1139: video { productId, kind?, ratio? }).
test("video: only its product, kind and shape are sent; UiiQ's note on where each part goes is kept with the draft's", async () => {
  const made = { ...MADE, slides: 4, note: "Facebook: the video only. Instagram: the video and 3 photos." };
  const { result, requests } = await call({ id: "post_1", products: [{ productId: "UC-ROBIN" }], video: { productId: "UC-ROBIN", kind: "spin", ratio: "4:5", url: "https://evil.test/v.mp4" } }, [201, made]);
  assert.deepEqual(requests[0].body, { products: [{ productId: "UC-ROBIN" }], video: { productId: "UC-ROBIN", kind: "spin", ratio: "4:5" } });
  assert.equal(result.note, "Facebook: the video only. Instagram: the video and 3 photos. A DRAFT: nothing was published. A person reviews and publishes it in UiiQ.");
  // No video: none sent; just the product: the server picks the kind and shape.
  const none = await call({ id: "post_1", products: [{ productId: "UC-ROBIN" }] }, [201, MADE]);
  assert.equal("video" in none.requests[0].body, false);
  const bare = await call({ id: "post_1", products: [{ productId: "UC-ROBIN" }], video: { productId: "UC-ROBIN" } }, [201, MADE]);
  assert.deepEqual(bare.requests[0].body.video, { productId: "UC-ROBIN" });
});

test("the video's schema: closed, a product id required, endcard or spin, 1:1 or 4:5; described", () => {
  const t = tools.uiiq_social_carousel_post;
  const v = t.inputSchema.properties.video;
  assert.equal(v.additionalProperties, false);
  assert.deepEqual(v.required, ["productId"]);
  assert.deepEqual(v.properties.kind.enum, ["endcard", "spin"]);
  assert.deepEqual(v.properties.ratio.enum, ["1:1", "4:5"]);
  assert.match(t.description, /then 1 to 8 products/);
  assert.match(t.description, /Facebook then posts the video alone and Instagram the whole carousel/);
});
