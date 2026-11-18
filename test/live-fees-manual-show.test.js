// node --test — uiiq_admin_live_fee_manual_show_add against a local stand-in for UIIQ (a throwaway HOME with a fake
// session, so no real login is read or sent). A show within a show length of one already added is refused by UiiQ
// (409 "Already added ..."); another: true says it is another show, and is sent only when set (Lucas R159-14).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tool;
const PATH = "/admin/tenants/t1/live-fees/statements/2026-11/lines";
const ARGS = { tenantId: "t1", period: "2026-11", title: "YouTube only", showAt: "2026-11-20T15:40:00Z", reason: "Not on NX2U" };
const ALREADY = 'Already added: "YouTube only" at 2026-11-20T15:00:00.000Z (line ln_1).';

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
  const { liveFeesTools } = await import("../src/tools/live-fees.js");
  tool = liveFeesTools.find((t) => t.name === "uiiq_admin_live_fee_manual_show_add");
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(args, response) {
  reply = response;
  seen = [];
  try {
    return { result: await tool.handler(args), requests: seen };
  } catch (error) {
    return { error, requests: seen };
  }
}

test("another is an optional boolean, sent only when true", async () => {
  assert.equal(tool.inputSchema.properties.another.type, "boolean");
  assert.ok(!tool.inputSchema.required.includes("another"));
  for (const extra of [{}, { another: false }, { another: "yes" }]) {
    const r = await call({ ...ARGS, ...extra }, [201, { ok: true, id: "ln_2" }]);
    assert.ifError(r.error);
    assert.deepEqual(r.requests, [{ method: "POST", path: PATH, body: { kind: "MANUAL_SHOW", title: ARGS.title, showAt: ARGS.showAt, reason: ARGS.reason } }]);
  }
  const r = await call({ ...ARGS, another: true }, [201, { ok: true, id: "ln_3" }]);
  assert.deepEqual(r.result, { ok: true, id: "ln_3" });
  assert.deepEqual(r.requests[0].body, { kind: "MANUAL_SHOW", title: ARGS.title, showAt: ARGS.showAt, reason: ARGS.reason, another: true });
});

test("UiiQ's 409 \"Already added ...\" is the tool's error, saying first that the line named is likely the same show (NX2U-C-01)", async () => {
  const hint = "If line ln_1 is the show you meant, it is already added: do nothing. Only a different show takes another: true.";
  let r = await call(ARGS, [409, { error: ALREADY }]);
  assert.equal(r.requests.length, 1);
  assert.equal(r.error.message, `${ALREADY} ${hint}`);
  // UiiQ's own words name another: true too: the do-nothing case is still said.
  const own = `${ALREADY} If this is another show, send it again with another: true`;
  r = await call(ARGS, [409, { error: own }]);
  assert.equal(r.error.message, `${own}. ${hint}`);
  r = await call(ARGS, [409, { error: "Already added near that time" }]);
  assert.match(r.error.message, /If that line is the show you meant/);
  // Any other refusal is passed on as UiiQ sent it.
  r = await call(ARGS, [409, { error: "The month is closed" }]);
  assert.match(r.error.message, /The month is closed/);
  assert.doesNotMatch(r.error.message, /another: true/);
});
