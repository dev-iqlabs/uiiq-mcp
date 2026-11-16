// node --test — a competition's call post never goes out before its round opens (UiiQ-platform
// competition call PR A; Kim, 13 Nov 2026 §7.4). UiiQ refuses scheduling or queueing one for before
// then (409) and publishing one before then (the post ends FAILED): the tools pass Kim's words
// through as UiiQ gives them. Against a local stand-in for UIIQ (a throwaway HOME with a fake session).
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

// Kim §7.4 as UiiQ words it (UiiQ-platform call-open.ts callNotOpen).
const NOT_OPEN = "This call post wasn't sent: Round 2 opens Monday 23 November, 9am (UK time), and its call can't go out before then. Schedule it for then or later.";

test("update: a call post scheduled or queued before its round opens comes back as Kim's words, exactly", async () => {
  for (const args of [{ status: "SCHEDULED", scheduledAt: "2026-11-20T09:00:00.000Z" }, { status: "QUEUED" }, { content: "The call, edited" }]) {
    const err = await call("uiiq_social_post_update", { id: "post_call", ...args, confirm: true }, [409, { error: NOT_OPEN }]).then(() => null, (e) => e);
    assert.ok(err, JSON.stringify(args));
    assert.equal(err.message, NOT_OPEN, JSON.stringify(args));
    assert.deepEqual(seen.map((r) => `${r.method} ${r.path}`), ["PATCH /socials/posts/post_call"], JSON.stringify(args));
  }
});

test("save: the same refusal on the full save, in Kim's words", async () => {
  const save = { id: "post_call", content: "The call", targetAccountIds: ["acc_fb"], status: "SCHEDULED", scheduledAt: "2026-11-20T09:00:00.000Z", confirm: true };
  await assert.rejects(call("uiiq_social_post_save", save, [409, { error: NOT_OPEN }]), (e) => e.message === NOT_OPEN);
  assert.deepEqual(seen.map((r) => `${r.method} ${r.path}`), ["PUT /socials/posts/post_call"]);
});

test("publish: a call post before its round opens is refused, and the error is Kim's words, not a status", async () => {
  await assert.rejects(call("uiiq_social_post_publish", { id: "post_call", confirm: true }, [500, { error: NOT_OPEN, published: 0, failed: 0 }]), (e) => e.message === NOT_OPEN);
  assert.deepEqual(seen.map((r) => `${r.method} ${r.path}`), ["POST /socials/posts/post_call/publish"]);
});

test("the descriptions say a call can't be scheduled, queued or published before its round opens", () => {
  for (const name of ["uiiq_social_post_update", "uiiq_social_post_save"]) {
    assert.match(tools[name].description, /A competition's call post \(sourceRef competition-call:<roundId>\) can't be scheduled for, or queued, before its round opens: UiiQ refuses it \(409\) in Kim's words/, name);
  }
  assert.match(tools.uiiq_social_post_publish.description, /A competition's call post is refused before its round opens, whatever it was scheduled for: nothing is sent, the post ends FAILED, and the error is Kim's words/);
});
