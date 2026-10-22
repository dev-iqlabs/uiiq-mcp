// node --test — uiiq_social_post_carousel_ad with spin video cards (UiiQ-platform #1151):
// products[].video { ratio? } makes a product card the product's plain spin video, and
// collectionVideo { productId, ratio? } makes card 1 one. Only the product and the shape are
// sent (UiiQ reads the video from the shop's feed), and anything else is refused before any
// request. Against a local stand-in for UIIQ (a throwaway HOME with a fake session).
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

async function call(args, response) {
  reply = response;
  seen = [];
  const result = await tools.uiiq_social_post_carousel_ad.handler(args);
  return { result, requests: seen };
}
async function refusedBeforeAnyRequest(args, message) {
  reply = [200, { ok: true }];
  seen = [];
  await assert.rejects(tools.uiiq_social_post_carousel_ad.handler(args), message);
  assert.deepEqual(seen, [], JSON.stringify(args));
}

const SPIN = "https://iqex-assets.test/design-spins";
const AD = { pageId: "555", name: "Coins", dailyBudgetPence: 500, countries: ["GB"], primaryText: "New", headline: "Shop", ctaType: "SHOP_NOW", linkUrl: "https://shop.test", collectionName: "The collection" };
const CONTEXT = {
  adAccount: true, pages: [{ id: "555", name: "Ultimate Coins" }], collectionImage: "https://media.test/public/901.png", videos: [], defaults: { dailyBudgetPence: 500 },
  productVideos: [
    { productId: "UC-ROBIN", title: "Robin", photoUrl: "https://shop.test/robin.jpg", videos: [{ ratio: "1:1", url: `${SPIN}/robin-1x1.mp4`, posterUrl: null }, { ratio: "4:5", url: `${SPIN}/robin-4x5.mp4`, posterUrl: `${SPIN}/robin-4x5.jpg` }] },
    { productId: "UC-EOTM", title: "Employee of the Month", photoUrl: null, videos: [{ ratio: "4:5", url: `${SPIN}/eotm-4x5.mp4`, posterUrl: null }] },
  ],
};
const MADE = { campaignId: "c1", adSetId: "s1", adId: "a1", adsManagerUrl: null, status: "PAUSED", duplicate: false };

test("products[].video: only its shape is sent ({} for UiiQ's default), never an address; a card without it stays a photo", async () => {
  const products = [
    { productId: "UC-ROBIN", photoIndex: 1, video: { ratio: "4:5", url: "https://evil.test/v.mp4", video_url: "https://evil.test/v.mp4" } },
    { productId: "UC-EOTM", video: {} },
    { productId: "UC-OWL", photoIndex: 0 },
    { productId: "UC-ROBIN", video: null },
  ];
  const { requests } = await call({ id: "post_1", ...AD, products, confirm: true }, [200, MADE]);
  assert.deepEqual(requests[0].body.products, [
    { productId: "UC-ROBIN", photoIndex: 1, video: { ratio: "4:5" } },
    { productId: "UC-EOTM", video: {} },
    { productId: "UC-OWL", photoIndex: 0 },
    { productId: "UC-ROBIN" },
  ]);
  assert.equal(/evil\.test|\.mp4/.test(JSON.stringify(requests[0].body)), false);
});

test("collectionVideo { productId, ratio? }: card 1 a product's spin, only the product and its shape; postId and assetId as before", async () => {
  const products = [{ productId: "UC-OWL" }];
  let { requests } = await call({ id: "post_1", ...AD, products, collectionVideo: { productId: "UC-EOTM", ratio: "4:5", url: "https://evil.test/v.mp4" }, confirm: true }, [200, MADE]);
  assert.deepEqual(requests[0].body.collectionVideo, { productId: "UC-EOTM", ratio: "4:5" });
  ({ requests } = await call({ id: "post_1", ...AD, products, collectionVideo: { productId: "UC-ROBIN" }, confirm: true }, [200, MADE]));
  assert.deepEqual(requests[0].body.collectionVideo, { productId: "UC-ROBIN" });
  ({ requests } = await call({ id: "post_1", ...AD, products, collectionVideo: { assetId: 77 }, confirm: true }, [200, MADE]));
  assert.deepEqual(requests[0].body.collectionVideo, { assetId: 77 });
  ({ requests } = await call({ id: "post_1", ...AD, products, collectionVideo: null, confirm: true }, [200, MADE]));
  assert.equal("collectionVideo" in requests[0].body, false);
});

test("refused before any request: a shape other than 1:1 or 4:5, a video that isn't { ratio? }, and a card 1 that isn't exactly one video", async () => {
  const products = (video) => [{ productId: "UC-ROBIN", video }];
  for (const video of [{ ratio: "16:9" }, { ratio: "" }, "4:5", true, ["4:5"]]) {
    for (const confirm of [true, undefined]) await refusedBeforeAnyRequest({ id: "post_1", ...AD, products: products(video), confirm }, /products\[0\]\.video/);
  }
  const plain = [{ productId: "UC-OWL" }];
  for (const [collectionVideo, said] of [
    [{ productId: "UC-ROBIN", ratio: "9:16" }, /collectionVideo\.ratio is "1:1" or "4:5"/],
    [{ productId: "UC-ROBIN", postId: "post_vid" }, /exactly one of/],
    [{ postId: "post_vid", assetId: 77 }, /exactly one of/],
    [{}, /exactly one of/],
    [{ assetId: 77, ratio: "4:5" }, /ratio goes with productId/],
    ["product:UC-ROBIN", /collectionVideo is \{ postId \}, \{ assetId \} or \{ productId, ratio\? \}/],
  ]) {
    await refusedBeforeAnyRequest({ id: "post_1", ...AD, products: plain, collectionVideo, confirm: true }, said);
  }
});

test("the dry run: each card's type with the shape UiiQ will use, and why it would refuse a spin; the context's productVideos as UiiQ sent it", async () => {
  const products = [{ productId: "UC-ROBIN", video: {} }, { productId: "UC-EOTM", video: {} }, { productId: "UC-OWL" }, { productId: "UC-EOTM", video: { ratio: "1:1" } }, { productId: "UC-OWL", video: {} }];
  const { result, requests } = await call({ id: "post_1", ...AD, products, collectionVideo: { productId: "UC-ROBIN", ratio: "4:5" } }, [200, CONTEXT]);
  assert.deepEqual(requests, [{ method: "GET", path: "/socials/posts/post_1/carousel-ad" }]);
  assert.equal(result.dryRun, true);
  assert.deepEqual(result.context.productVideos, CONTEXT.productVideos);
  assert.deepEqual(result.cards, [
    { card: 1, type: "spin video", productId: "UC-ROBIN", ratio: "4:5" },
    { card: 2, type: "spin video", productId: "UC-ROBIN", ratio: "1:1" },
    { card: 3, type: "spin video", productId: "UC-EOTM", ratio: "4:5" },
    { card: 4, type: "photo", productId: "UC-OWL" },
    { card: 5, type: "spin video", productId: "UC-EOTM", ratio: "1:1", problem: "UiiQ will refuse this card: UC-EOTM has no 1:1 spin video IQEX can use (it has 4:5)" },
    { card: 6, type: "spin video", productId: "UC-OWL", ratio: null, problem: "UiiQ will refuse this card: UC-OWL has no spin video IQEX can use (it isn't in the context's productVideos)" },
  ]);
  assert.match(result.message, /Meta processes the video cards first: up to 10 minutes/);
  // An older UiiQ without productVideos: every spin card says it will be refused.
  const old = await call({ id: "post_1", ...AD, products: [{ productId: "UC-ROBIN", video: {} }] }, [200, { ...CONTEXT, productVideos: undefined }]);
  assert.match(old.result.cards[1].problem, /doesn't list product spin videos \(productVideos\) yet/);
  // No spin, no video: no processing note.
  const photos = await call({ id: "post_1", ...AD, products: [{ productId: "UC-OWL" }] }, [200, CONTEXT]);
  assert.equal(/Meta processes/.test(photos.result.message), false);
});

test("an ad with a spin card is followed as a video ad (every 10 seconds, up to 12 minutes), even when the 202 doesn't say video", async () => {
  for (const args of [{ products: [{ productId: "UC-ROBIN", video: {} }] }, { products: [{ productId: "UC-OWL" }], collectionVideo: { productId: "UC-ROBIN" } }]) {
    const { result } = await call({ id: "post_1", ...AD, ...args, requestId: "ad-s", confirm: true }, [202, { status: "running", requestId: "ad-s" }]);
    assert.equal(result.video, true, JSON.stringify(args));
    assert.match(result.next, /up to 12 minutes.*every 10 seconds/s);
  }
});

test("the schema: video and collectionVideo closed, the shapes 1:1 and 4:5, no address field anywhere", () => {
  const s = tools.uiiq_social_post_carousel_ad.inputSchema.properties;
  const v = s.products.items.properties.video;
  assert.equal(v.additionalProperties, false);
  assert.deepEqual(Object.keys(v.properties), ["ratio"]);
  assert.deepEqual(v.properties.ratio.enum, ["1:1", "4:5"]);
  assert.equal(s.collectionVideo.additionalProperties, false);
  assert.deepEqual(Object.keys(s.collectionVideo.properties), ["postId", "assetId", "productId", "ratio"]);
  assert.deepEqual(s.collectionVideo.properties.ratio.enum, ["1:1", "4:5"]);
  assert.equal(/url/i.test(JSON.stringify(Object.keys(v.properties)) + JSON.stringify(Object.keys(s.collectionVideo.properties))), false);
});

test("the description says it in plain words: spins from the shop's feed, IQEX's own render only, never an address, up to 10 minutes", () => {
  const d = tools.uiiq_social_post_carousel_ad.description;
  assert.match(d, /a product card can be the product's spin video instead of its photo, with video \{ ratio\? \}/);
  assert.match(d, /Card 1 can be any shop product's spin too: collectionVideo \{ productId, ratio\? \}/);
  assert.match(d, /never the end card, and only IQEX's own render: UiiQ reads it from the shop's feed when the ad is made, so no video address can be sent/);
  assert.match(d, /productVideos/);
  assert.match(d, /Meta processes every video card before the ad is made, which can take up to 10 minutes/);
});
