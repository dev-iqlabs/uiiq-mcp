// node --test — uiiq_boardroom_tts against UiiQ's ElevenLabs-only route (UiiQ-platform fix/boardroom-tts-off-personal-login,
// Lucas R105): the Chatterbox backup and its poll are gone, so speak answers with audio or with the route's
// { audio: false, reason }, and there is no poll tool. Against a local stand-in for UiiQ (a throwaway HOME with a fake
// session), so no real login is read or sent anywhere.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, cwd, reply, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      if (reply.audio) {
        res.writeHead(200, { "content-type": "audio/mpeg", "x-tts-provider": "elevenlabs" });
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
const saved = () => readdirSync(cwd).filter((f) => f.startsWith("tts-"));

test("speak saves the ElevenLabs audio", async () => {
  const out = await call("uiiq_boardroom_tts", { audio: true }, { text: "Hello", agentSlug: "cara" });
  assert.deepEqual(seen, [{ method: "POST", path: "/boardroom/tts", body: { text: "Hello", agentSlug: "cara" } }]);
  assert.deepEqual(out, { path: join(cwd, "tts-cara.mp3"), bytes: 3, provider: "elevenlabs" });
  assert.deepEqual([...readFileSync(join(cwd, "tts-cara.mp3"))], [1, 2, 3]);
  rmSync(join(cwd, "tts-cara.mp3"));
});

test("speak with no voice hands back the route's { audio: false, reason } and saves nothing", async () => {
  const out = await call("uiiq_boardroom_tts", { status: 200, json: { audio: false, reason: "no-voice" } }, { text: "Hello" });
  assert.deepEqual(out, { audio: false, reason: "no-voice" });
  assert.deepEqual(seen, [{ method: "POST", path: "/boardroom/tts", body: { text: "Hello" } }]);
  assert.deepEqual(saved(), []);
});

test("speak shows the route's refusal", async () => {
  await assert.rejects(call("uiiq_boardroom_tts", { status: 403, json: { error: "No tenant" } }, { text: "Hello" }), /No tenant/);
});

test("there is no poll tool, and speak describes the answer without Chatterbox or a poll token", () => {
  assert.equal(tools.uiiq_boardroom_tts_poll, undefined);
  const { description } = tools.uiiq_boardroom_tts;
  assert.match(description, /ElevenLabs only/);
  assert.match(description, /\{ audio: false, reason \}/);
  assert.doesNotMatch(description, /chatterbox|pollToken|poll/i);
  const source = readFileSync(new URL("../src/tools/boardroom.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /pollToken|chatterbox/i);
});
