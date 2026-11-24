// R308 (Lucas R307-01): the IQEX form spec tools ask for an HTML page, and UiiQ answers with one (200 text/html).
// Before this, the client read any HTML answer below 500 as an expired session, so every call signed in again with
// the stored password, rewrote credentials.json and sent the GET twice (and never worked without a stored password).
// Now a call that says it expects HTML takes the page as its answer. A 401 and a 307 to /login still sign in again.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, base, routes, seen, tools, verdict, apiClient;

const SHEET = "<!DOCTYPE html><html><head><title>IQEX form specs</title></head><body><h1>Spec sheet</h1></body></html>";
const HTML = { "content-type": "text/html; charset=utf-8" };

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const path = req.url.replace(/^\/api/, "");
      seen.push({ method: req.method, path });
      const json = (status, data, headers = {}) => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(data));
      };
      if (path === "/auth/csrf") return json(200, { csrfToken: "csrf-test" }, { "set-cookie": "authjs.csrf-token=csrf-test; Path=/" });
      if (path === "/auth/callback/credentials") return json(200, { url: "/" }, { "set-cookie": "authjs.session-token=renewed; Path=/; HttpOnly" });
      const route = routes[`${req.method} ${path}`];
      const [status, text, headers] = (typeof route === "function" ? route() : route) ?? [404, '{"error":"not here"}', {}];
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(text);
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
  const { adminOpsTools } = await import("../src/tools/admin-ops.js");
  tools = Object.fromEntries(adminOpsTools.map((t) => [t.name, t]));
  ({ verdict, apiClient } = await import("../src/auth.js"));
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

// A stored login (email and password), so an expired session can sign in again by itself.
function writeCreds(withPassword = true) {
  const creds = { base, sessionToken: "old", cookieName: "authjs.session-token", email: "office@workspace.test" };
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify(withPassword ? { ...creds, password: "pw-test" } : creds));
}
function prepare(r, withPassword = true) {
  writeCreds(withPassword);
  routes = r;
  seen = [];
}
const seq = (...answers) => () => (answers.length > 1 ? answers.shift() : answers[0]);
const signIns = () => seen.filter((q) => q.path === "/auth/callback/credentials");
const gets = (path) => seen.filter((q) => q.method === "GET" && q.path === path);

for (const [tool, path] of [["uiiq_iqex_form_spec", "/admin/iqex-forms/pdf"], ["uiiq_iqex_form_system_spec", "/admin/iqex-forms/system-pdf"]]) {
  test(`${tool}: the HTML page is the answer: one GET, no sign-in`, async () => {
    prepare({ [`GET ${path}`]: [200, SHEET, HTML] });
    const out = await tools[tool].handler({});
    assert.deepEqual(out, { contentType: "text/html", html: SHEET });
    assert.equal(gets(path).length, 1);
    assert.equal(signIns().length, 0);
  });
}

test("with no stored password the spec sheet still comes back (it used to stop at 'session expired')", async () => {
  prepare({ "GET /admin/iqex-forms/pdf": [200, SHEET, HTML] }, false);
  const out = await tools.uiiq_iqex_form_spec.handler({});
  assert.equal(out.html, SHEET);
  assert.equal(signIns().length, 0);
});

test("a 307 to /login is still an expired session for a spec call: one sign-in, then the sheet", async () => {
  prepare({ "GET /admin/iqex-forms/pdf": seq([307, "", { location: "/login?callbackUrl=%2Fapi%2Fadmin%2Fiqex-forms%2Fpdf" }], [200, SHEET, HTML]) });
  const out = await tools.uiiq_iqex_form_spec.handler({});
  assert.equal(out.html, SHEET);
  assert.equal(signIns().length, 1);
  assert.equal(gets("/admin/iqex-forms/pdf").length, 2);
});

test("a 401 is still an expired session for a spec call: one sign-in, then the sheet", async () => {
  prepare({ "GET /admin/iqex-forms/system-pdf": seq([401, '{"error":"Unauthorized"}', {}], [200, SHEET, HTML]) });
  const out = await tools.uiiq_iqex_form_system_spec.handler({});
  assert.equal(out.html, SHEET);
  assert.equal(signIns().length, 1);
});

test("an HTML 504 on a spec call fails with its status: one GET, no sign-in", async () => {
  prepare({ "GET /admin/iqex-forms/pdf": seq([504, "<html><body>504 Gateway Timeout</body></html>", HTML], [200, SHEET, HTML]) });
  await assert.rejects(tools.uiiq_iqex_form_spec.handler({}), /504 Gateway Timeout/);
  assert.equal(gets("/admin/iqex-forms/pdf").length, 1);
  assert.equal(signIns().length, 0);
});

test("a call that doesn't ask for HTML is unchanged: an HTML 200 still signs in again (R307's rule below 500)", async () => {
  prepare({ "GET /charged/thing": seq([200, "<html><body>Sign in</body></html>", HTML], [200, '{"ok":true}', {}]) });
  const res = await apiClient()("/charged/thing");
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(signIns().length, 1);
});

test("verdict(): expectHtml makes an HTML page the answer; a 401 and a 307 to /login stay expired", () => {
  const res = (status, headers = {}) => new Response(null, { status, headers });
  assert.equal(verdict(res(200, HTML), null, { expectHtml: true }), "ok");
  assert.equal(verdict(res(200, HTML), null), "expired");
  assert.equal(verdict(res(200, HTML), null, {}), "expired");
  assert.equal(verdict(res(401), null, { expectHtml: true }), "expired");
  assert.equal(verdict(res(307, { location: "/login" }), null, { expectHtml: true }), "expired");
  assert.equal(verdict(res(403), { code: "child_records_browser_only" }, { expectHtml: true }), "refused");
  assert.equal(verdict(res(307, { location: "/api/people-browser-only" }), null, { expectHtml: true }), "browser-only");
});
