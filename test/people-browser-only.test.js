// node --test — R252: how the MCP meets UiiQ-platform R249 (Lucas M2), the classes-DPA default deny. In a workspace
// under the classes data processing agreement, UiiQ refuses a machine session's call to any route that isn't on its
// no-people list with a 307 to /api/people-browser-only, which answers a 403 with code contacts_browser_only and rule
// classes-dpa-default-deny. Either ends the call with "This workspace's people data can only be read in UiiQ in a
// browser.": never a new sign-in, never a retry. An ordinary 401 still signs in again. Against a local stand-in for
// UiiQ (a throwaway HOME with a fake session and stored login, so no real login is read or sent anywhere).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, base, routes, seen, tools, verdict;

const REFUSAL = {
  error: "This workspace's people data opens only in UiiQ in a person's browser (its data processing agreement).",
  code: "contacts_browser_only",
  rule: "classes-dpa-default-deny",
};
const WORDS = "This workspace's people data can only be read in UiiQ in a browser.";

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const path = req.url.replace(/^\/api/, "");
      seen.push({ method: req.method, path });
      const send = (status, data, headers = {}) => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(data === undefined ? "" : JSON.stringify(data));
      };
      if (path === "/auth/csrf") return send(200, { csrfToken: "csrf-test" }, { "set-cookie": "authjs.csrf-token=csrf-test; Path=/" });
      if (path === "/auth/callback/credentials") return send(200, { url: "/" }, { "set-cookie": "authjs.session-token=renewed; Path=/; HttpOnly" });
      const route = routes[`${req.method} ${path}`];
      const [status, data, headers] = (typeof route === "function" ? route() : route) ?? [404, { error: "not here" }];
      send(status, data, headers);
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
  const { hrTools } = await import("../src/tools/hr.js");
  tools = Object.fromEntries(hrTools.map((t) => [t.name, t]));
  ({ verdict } = await import("../src/auth.js"));
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

// A stored login (email and password), so an expired session can sign in again by itself.
function writeCreds() {
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "old", cookieName: "authjs.session-token", email: "office@workspace.test", password: "pw-test" }));
}
function prepare(r) {
  writeCreds();
  routes = r;
  seen = [];
}
const seq = (...answers) => () => (answers.length > 1 ? answers.shift() : answers[0]);
const signIns = () => seen.filter((q) => q.path === "/auth/callback/credentials");
const STAFF = { staff: [{ id: "s1", firstName: "Fixture", lastName: "Person" }] };
const browserOnly = (e) => {
  assert.equal(e.code, "contacts_browser_only");
  assert.ok(e.message.startsWith(WORDS), e.message);
  assert.match(e.message, /not an expired session: don't retry or sign in again/);
  return true;
};

test("the 307 to /api/people-browser-only ends the call with the browser-only words: one request, no sign-in, not followed", async () => {
  prepare({ "GET /hr/staff": [307, undefined, { location: "/api/people-browser-only" }] });
  await assert.rejects(tools.uiiq_hr_staff_list.handler({}), browserOnly);
  assert.deepEqual(seen.map((q) => `${q.method} ${q.path}`), ["GET /hr/staff"]);
});

test("the same with an absolute Location", async () => {
  prepare({ "GET /hr/staff": [307, undefined, { location: `${base}/api/people-browser-only` }] });
  await assert.rejects(tools.uiiq_hr_staff_list.handler({}), browserOnly);
  assert.equal(signIns().length, 0);
});

test("the refusal route's own 403 (code and rule), as a client that follows redirects would see it: the same words, no sign-in", async () => {
  prepare({ "GET /hr/staff": [403, REFUSAL] });
  await assert.rejects(tools.uiiq_hr_staff_list.handler({}), browserOnly);
  assert.deepEqual(seen.map((q) => `${q.method} ${q.path}`), ["GET /hr/staff"]);
});

test("after an expired session's one sign-in, the refusal ends it there: no second sign-in", async () => {
  prepare({ "GET /hr/staff": seq([401, { error: "Unauthorized" }], [307, undefined, { location: "/api/people-browser-only" }]) });
  await assert.rejects(tools.uiiq_hr_staff_list.handler({}), browserOnly);
  assert.equal(signIns().length, 1);
  assert.equal(seen.filter((q) => q.path === "/hr/staff").length, 2);
});

test("an ordinary 401 still signs in again and retries once", async () => {
  prepare({ "GET /hr/staff": seq([401, { error: "Unauthorized" }], [200, STAFF]) });
  const result = await tools.uiiq_hr_staff_list.handler({});
  assert.equal(JSON.stringify(result).includes("Fixture"), true);
  assert.equal(signIns().length, 1);
});

test("a 307 to /login is still an expired session (signs in again); a 403 with the code but another rule is the route's own refusal, as before", async () => {
  prepare({ "GET /hr/staff": seq([307, undefined, { location: "/login?callbackUrl=%2Fapi%2Fhr%2Fstaff" }], [200, STAFF]) });
  await tools.uiiq_hr_staff_list.handler({});
  assert.equal(signIns().length, 1);

  prepare({ "GET /hr/staff": [403, { error: "Contacts in this workspace are browser-only.", code: "contacts_browser_only" }] });
  await assert.rejects(tools.uiiq_hr_staff_list.handler({}), (e) => e.message === "Contacts in this workspace are browser-only." && e.code === undefined);
  assert.equal(signIns().length, 0);
});

test("verdict(): the redirect and the 403 are browser-only; nothing else is", () => {
  const res = (status, headers = {}) => new Response(null, { status, headers });
  assert.equal(verdict(res(307, { location: "/api/people-browser-only" }), null), "browser-only");
  assert.equal(verdict(res(303, { location: "https://app.uiiq.co.uk/api/people-browser-only" }), null), "browser-only");
  assert.equal(verdict(res(403), REFUSAL), "browser-only");
  assert.equal(verdict(res(403), { ...REFUSAL, rule: "something-else" }), "ok");
  assert.equal(verdict(res(307, { location: "/api/people-browser-only-not" }), null), "ok");
  assert.equal(verdict(res(307, { location: "/login" }), null), "expired");
  assert.equal(verdict(res(401), null), "expired");
  assert.equal(verdict(res(403), { code: "child_records_browser_only" }), "refused");
});
