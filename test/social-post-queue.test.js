// node --test — Socials Queue = next free slot (UiiQ-platform #1229): on an auto-publish
// workspace the cron now publishes a QUEUED post in the next free slot, with nobody pressing
// Publish. So uiiq_social_post_update and _save treat status QUEUED as they treat SCHEDULED:
// without confirm: true it is a dry run that reads the settings and saves nothing.
// Against a local stand-in for UIIQ (a throwaway HOME with a fake session).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, settings, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const path = req.url.replace(/^\/api/, "");
      seen.push({ method: req.method, path, ...(body ? { body: JSON.parse(body) } : {}) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(path === "/socials/settings" ? settings : { id: "post_1", status: "QUEUED" }));
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

async function call(name, args, autoPublish = true) {
  settings = { autoPublish, minGapMinutes: 60, queued: 2 };
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

const SAVE = { id: "post_1", content: "Coin of the week", targetAccountIds: ["acc_ig"], mediaUrls: ["https://cdn.example/coin.jpg"] };

test("update: QUEUED without confirm is a dry run on an auto-publish workspace: the settings read, nothing saved", async () => {
  const { result, requests } = await call("uiiq_social_post_update", { id: "post_1", status: "QUEUED" });
  assert.deepEqual(requests, [{ method: "GET", path: "/socials/settings" }]);
  assert.equal(result.dryRun, true);
  assert.equal(result.autoPublish, true);
  assert.match(result.message, /^Nothing was saved\. Auto-publish is ON .* a QUEUED post is published by the cron in the next free slot/);
  assert.deepEqual(result.wouldSet, { id: "post_1", status: "QUEUED", scheduledAt: undefined });
});

test("save: QUEUED without confirm is a dry run too; with auto-publish off it says the post waits for Publish", async () => {
  const { result, requests } = await call("uiiq_social_post_save", { ...SAVE, status: "QUEUED" }, false);
  assert.deepEqual(requests, [{ method: "GET", path: "/socials/settings" }]);
  assert.equal(result.dryRun, true);
  assert.match(result.message, /Auto-publish is off here, so a QUEUED post waits for someone to press Publish/);
});

test("QUEUED with confirm: true is saved (PATCH and PUT), the settings never read", async () => {
  let { requests } = await call("uiiq_social_post_update", { id: "post_1", status: "QUEUED", confirm: true });
  assert.deepEqual(requests, [{ method: "PATCH", path: "/socials/posts/post_1", body: { status: "QUEUED" } }]);
  ({ requests } = await call("uiiq_social_post_save", { ...SAVE, status: "QUEUED", confirm: true }));
  assert.deepEqual(requests, [{ method: "PUT", path: "/socials/posts/post_1", body: { content: SAVE.content, targetAccountIds: SAVE.targetAccountIds, mediaUrls: SAVE.mediaUrls, status: "QUEUED" } }]);
});

test("DRAFT, and an edit that sets no status, need no confirm", async () => {
  let { requests } = await call("uiiq_social_post_update", { id: "post_1", status: "DRAFT" });
  assert.deepEqual(requests.map((r) => r.method), ["PATCH"]);
  ({ requests } = await call("uiiq_social_post_update", { id: "post_1", content: "new words" }));
  assert.deepEqual(requests.map((r) => r.method), ["PATCH"]);
  ({ requests } = await call("uiiq_social_post_save", SAVE));
  assert.deepEqual(requests.map((r) => r.method), ["PUT"]);
});

test("SCHEDULED is still a dry run without confirm, with its own words", async () => {
  const { result, requests } = await call("uiiq_social_post_update", { id: "post_1", status: "SCHEDULED", scheduledAt: "2026-10-26T09:00:00Z" });
  assert.deepEqual(requests, [{ method: "GET", path: "/socials/settings" }]);
  assert.match(result.message, /a SCHEDULED post is published by the cron when it falls due/);
});

test("the descriptions say a QUEUED post goes out in the next free slot on an auto-publish workspace", () => {
  for (const name of ["uiiq_social_post_update", "uiiq_social_post_save"]) {
    assert.match(tools[name].description, /Setting status SCHEDULED or QUEUED, or a scheduledAt, needs confirm: true/, name);
    assert.match(tools[name].description, /a QUEUED one in the next free slot, with nobody pressing Publish/, name);
    assert.match(tools[name].inputSchema.properties.confirm.description, /SCHEDULED or QUEUED/, name);
  }
  assert.match(tools.uiiq_social_settings_update.description, /queued posts one at a time in the next free slots/);
});
