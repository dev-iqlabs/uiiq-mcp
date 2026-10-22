// node --test — how the MCP meets UiiQ-platform #1168 (children's records for browser sessions only):
// its sign-in says client=uiiq-mcp, no request carries Origin or Sec-Fetch-Site, and a 403 with code
// child_records_browser_only ends the call with UiiQ's words: never retried, never a new sign-in.
// Against a local stand-in for UIIQ (a throwaway HOME with a fake session and stored login, so no real
// login is read or sent anywhere).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let server, home, base, routes, seen, tools;

const REFUSED = { error: "Children's records are open in the UiiQ dashboard in a browser only.", code: "child_records_browser_only", rule: "Steve, 22 Oct 2026", reason: "machine_session" };

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const path = req.url.replace(/^\/api/, "");
      seen.push({ method: req.method, path, headers: req.headers, body });
      const send = (status, data, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(data)); };
      if (path === "/auth/csrf") return send(200, { csrfToken: "csrf-test" }, { "set-cookie": "authjs.csrf-token=csrf-test; Path=/" });
      if (path === "/auth/callback/credentials") return send(200, { url: "/" }, { "set-cookie": "authjs.session-token=renewed; Path=/; HttpOnly" });
      const route = routes[`${req.method} ${path}`];
      const [status, data] = (typeof route === "function" ? route() : route) ?? [404, { error: "not here" }];
      send(status, data);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  home = mkdtempSync(join(tmpdir(), "uiiq-mcp-test-home-"));
  mkdirSync(join(home, ".uiiq"));
  writeCreds();
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.UIIQ_BASE = base;
  delete process.env.UIIQ_MCP_INHERIT_IMPERSONATION;
  const { classesTools } = await import("../src/tools/classes.js");
  tools = Object.fromEntries(classesTools.map((t) => [t.name, t]));
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

// A stored login (email and password), so an expired session can sign in again by itself.
function writeCreds() {
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "old", cookieName: "authjs.session-token", email: "office@sbda.test", password: "pw-test" }));
}
function prepare(r) {
  writeCreds();
  routes = r;
  seen = [];
}
const seq = (...answers) => () => (answers.length > 1 ? answers.shift() : answers[0]);
const signIns = () => seen.filter((q) => q.path === "/auth/callback/credentials");
const CLASS = { id: "cls1", name: "Junior Ballet", courseRuns: [] };

test("a sign-in says client=uiiq-mcp, and no request carries Origin or Sec-Fetch-Site", async () => {
  prepare({ "GET /classes/cls1": seq([401, { error: "Unauthorized" }], [200, CLASS]) });
  const result = await tools.uiiq_classes_get.handler({ id: "cls1" });
  assert.equal(result.name, "Junior Ballet");
  assert.equal(signIns().length, 1);
  const form = new URLSearchParams(signIns()[0].body);
  assert.equal(form.get("client"), "uiiq-mcp");
  assert.equal(form.get("email"), "office@sbda.test");
  assert.equal(form.get("csrfToken"), "csrf-test");
  assert.deepEqual(seen.map((q) => `${q.method} ${q.path}`), ["GET /classes/cls1", "GET /auth/csrf", "POST /auth/callback/credentials", "GET /classes/cls1"]);
  for (const q of seen) {
    assert.equal(q.headers.origin, undefined, `${q.method} ${q.path} sent Origin`);
    assert.equal(q.headers["sec-fetch-site"], undefined, `${q.method} ${q.path} sent Sec-Fetch-Site`);
  }
});

test("a child-records 403 ends the call with UiiQ's words: one request, no new sign-in, no retry", async () => {
  prepare({ "GET /classes/cls1": [403, REFUSED] });
  await assert.rejects(tools.uiiq_classes_get.handler({ id: "cls1" }), (e) => {
    assert.equal(e.code, "child_records_browser_only");
    assert.match(e.message, /^Children's records are open in the UiiQ dashboard in a browser only\./);
    assert.match(e.message, /not an expired session: don't retry or sign in again/);
    return true;
  });
  assert.deepEqual(seen.map((q) => `${q.method} ${q.path}`), ["GET /classes/cls1"]);
});

test("a child-records 403 after an expired session's one sign-in ends there: no second sign-in", async () => {
  prepare({ "GET /classes/cls1": seq([401, { error: "Unauthorized" }], [403, REFUSED]) });
  await assert.rejects(tools.uiiq_classes_get.handler({ id: "cls1" }), { code: "child_records_browser_only" });
  assert.equal(signIns().length, 1);
  assert.equal(seen.filter((q) => q.path === "/classes/cls1").length, 2);
});

test("any other 403 is the tool's own refusal, as before: UiiQ's words, no new sign-in", async () => {
  prepare({ "GET /classes/cls1": [403, { error: "You don't have permission to view classes." }] });
  await assert.rejects(tools.uiiq_classes_get.handler({ id: "cls1" }), (e) => e.message === "You don't have permission to view classes." && e.code === undefined);
  assert.deepEqual(seen.map((q) => `${q.method} ${q.path}`), ["GET /classes/cls1"]);
});

test("no source file sets an Origin or Sec-Fetch-* header", () => {
  const files = [];
  const walk = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (n === "node_modules" || n.startsWith(".")) continue; if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p); } };
  walk(join(ROOT, "src"));
  // A header key (quoted, or a bare Origin / Sec-Fetch-*), or headers.set/append of one. A body field named origin is fine.
  const quoted = /["'`](?:origin|sec-fetch-[a-z-]+)["'`]\s*:|\.(?:set|append)\(\s*["'`](?:origin|sec-fetch-[a-z-]+)["'`]/i;
  const bare = /\b(?:Origin|Sec-Fetch-[A-Za-z-]+)\s*:/;
  const found = files.filter((f) => { const src = readFileSync(f, "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""); return quoted.test(src) || bare.test(src); });
  assert.deepEqual(found, []);
});
