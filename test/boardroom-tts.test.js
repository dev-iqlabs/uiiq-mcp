// node --test — uiiq_boardroom_tts and uiiq_boardroom_tts_poll on the Chatterbox fallback (UiiQ-platform, Lucas B12-M3):
// the route takes a signed poll token now, never a bare asset id. Against a local stand-in for UiiQ (a throwaway HOME
// with a fake session), so no real login is read or sent anywhere.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOKEN = "dHA6NTU1OnRfMTox+OTk5/OmFiYw=";
let server, home, cwd, reply, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      if (reply.audio) {
        res.writeHead(200, { "content-type": "audio/wav" });
        res.end(Buffer.from([1, 2, 3]));
        return;
      }
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.json));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  home = mkdtempSync(join(tmpdir(), "uiiq-mcp-test-home-"));
  cwd = realpathSync(mkdtempSync(join(tmpdir(), "uiiq-mcp-test-cwd-")));
  mkdirSync(join(home, ".uiiq"));
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "test", cookieName: "authjs.session-token" }));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.UIIQ_BASE = base;
  process.chdir(cwd);
  const { boardroomTools } = await import("../src/tools/boardroom.js");
  tools = Object.fromEntries(boardroomTools.map((t) => [t.name, t]));
});

after(async () => {
  process.chdir(tmpdir());
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

const call = (name, r, args) => { reply = r; seen = []; return tools[name].handler(args); };

test("speak hands back the poll token the route returned", async () => {
  const out = await call("uiiq_boardroom_tts", { status: 200, json: { pollToken: TOKEN } }, { text: "Hello" });
  assert.deepEqual(out, { pollToken: TOKEN });
  assert.deepEqual(seen, [{ method: "POST", path: "/boardroom/tts", body: { text: "Hello" } }]);
});

test("the tools ask for and describe a poll token, never an assetId", () => {
  const poll = tools.uiiq_boardroom_tts_poll;
  assert.deepEqual(poll.inputSchema.required, ["pollToken"]);
  assert.ok(poll.inputSchema.properties.pollToken);
  assert.equal(poll.inputSchema.properties.assetId, undefined);
  for (const tool of [poll, tools.uiiq_boardroom_tts]) {
    assert.match(tool.description, /pollToken/);
    assert.doesNotMatch(tool.description, /assetId/);
  }
});

test("poll sends the token, encoded, and never an assetId", async () => {
  const out = await call("uiiq_boardroom_tts_poll", { status: 200, json: { ready: false } }, { pollToken: TOKEN });
  assert.deepEqual(out, { ready: false });
  assert.deepEqual(seen, [{ method: "GET", path: `/boardroom/tts?pollToken=${encodeURIComponent(TOKEN)}` }]);
});

test("poll saves the audio under a name that does not carry the token", async () => {
  const out = await call("uiiq_boardroom_tts_poll", { audio: true }, { pollToken: TOKEN });
  const saved = readdirSync(cwd).filter((f) => f.endsWith(".wav"));
  assert.equal(saved.length, 1);
  assert.match(saved[0], /^tts-\d+\.wav$/);
  assert.equal(out.path, join(cwd, saved[0]));
  assert.equal(out.bytes, 3);
  assert.deepEqual([...readFileSync(join(cwd, saved[0]))], [1, 2, 3]);
});

test("poll shows the route's refusal", async () => {
  await assert.rejects(call("uiiq_boardroom_tts_poll", { status: 403, json: { error: "Not permitted" } }, { pollToken: "expired" }), /Not permitted/);
});
