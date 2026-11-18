// node --test — the live comment moderation tools: what they call, and that a viewer's email never comes back
// through them, even from a UIIQ that (wrongly) sent one. A local stand-in for UIIQ and a throwaway HOME with
// a fake session, so no real login is read or sent. The routes are checked by UIIQ's client-coverage script.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools, withoutEmail;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      res.writeHead(reply[0], { "content-type": "application/json" });
      res.end(JSON.stringify(reply[1]));
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
  const mod = await import("../src/tools/nx2u.js");
  tools = Object.fromEntries(mod.nx2uTools.map((t) => [t.name, t]));
  withoutEmail = mod.withoutEmail;
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

const EMAIL = "hidden.viewer@example.com";
const leaky = { id: "c1", showRef: "wc-a1b2c3d4e5f6", firstName: "Sam", text: "Lovely", status: "PENDING", email: EMAIL, viewerEmail: EMAIL, reply: { text: "Thanks", e_mail: EMAIL } };

test("the five tools are there", () => {
  for (const n of ["uiiq_nx2u_comment_shows", "uiiq_nx2u_comment_list", "uiiq_nx2u_comment_moderate", "uiiq_nx2u_comment_settings_get", "uiiq_nx2u_comment_settings_set"]) assert.ok(tools[n], n);
});

test("shows and list call the queue routes; list defaults to the waiting comments", async () => {
  let r = await call("uiiq_nx2u_comment_shows", {}, [200, { shows: [] }]);
  assert.deepEqual(r.requests, [{ method: "GET", path: "/nx2u/comments/shows" }]);
  r = await call("uiiq_nx2u_comment_list", { show: "wc-a1b2c3d4e5f6" }, [200, { comments: [] }]);
  assert.deepEqual(r.requests, [{ method: "GET", path: "/nx2u/comments?show=wc-a1b2c3d4e5f6&status=PENDING" }]);
  r = await call("uiiq_nx2u_comment_list", { show: "wc-a1b2c3d4e5f6", status: "APPROVED" }, [200, { comments: [] }]);
  assert.equal(r.requests[0].path, "/nx2u/comments?show=wc-a1b2c3d4e5f6&status=APPROVED");
});

test("moderate sends only the action and the reply", async () => {
  let r = await call("uiiq_nx2u_comment_moderate", { id: "c1", action: "approve" }, [200, { comment: {} }]);
  assert.deepEqual(r.requests, [{ method: "PATCH", path: "/nx2u/comments/c1", body: { action: "approve" } }]);
  r = await call("uiiq_nx2u_comment_moderate", { id: "c1", action: "reply", reply: "Ships Monday." }, [200, { comment: {} }]);
  assert.deepEqual(r.requests[0].body, { action: "reply", reply: "Ships Monday." });
});

test("settings get and set", async () => {
  let r = await call("uiiq_nx2u_comment_settings_get", {}, [200, { settings: {} }]);
  assert.deepEqual(r.requests, [{ method: "GET", path: "/nx2u/comments/settings" }]);
  r = await call("uiiq_nx2u_comment_settings_set", { enabled: true, retentionDays: 14 }, [200, { settings: {} }]);
  assert.deepEqual(r.requests, [{ method: "PUT", path: "/nx2u/comments/settings", body: { enabled: true, retentionDays: 14 } }]);
});

test("SABOTAGE CHECK: no tool returns a viewer's email, even when UIIQ sends one", async () => {
  const answers = [
    (await call("uiiq_nx2u_comment_list", { show: "wc-a1b2c3d4e5f6" }, [200, { comments: [leaky] }])).result,
    (await call("uiiq_nx2u_comment_moderate", { id: "c1", action: "approve" }, [200, { comment: leaky }])).result,
    (await call("uiiq_nx2u_comment_shows", {}, [200, { shows: [{ showRef: "wc-a1b2c3d4e5f6", email: EMAIL }] }])).result,
    (await call("uiiq_nx2u_comment_settings_get", {}, [200, { settings: { enabled: true, email: EMAIL } }])).result,
  ];
  for (const a of answers) assert.ok(!JSON.stringify(a).includes(EMAIL), JSON.stringify(a));
  assert.deepEqual(answers[0].comments[0], { id: "c1", showRef: "wc-a1b2c3d4e5f6", firstName: "Sam", text: "Lovely", status: "PENDING", reply: { text: "Thanks" } });
});

test("withoutEmail keeps everything else, at any depth", () => {
  assert.deepEqual(withoutEmail({ a: [{ b: 1, Email: "x" }], c: null, words: { boxNotice: "Your email is never shown" } }), { a: [{ b: 1 }], c: null, words: { boxNotice: "Your email is never shown" } });
});
