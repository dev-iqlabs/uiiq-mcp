// node --test — uiiq_social_inbox_check_now: "Check for new messages" in the
// socials inbox (POST /api/socials/inbox/check-now, UiiQ-platform
// feat/socials-inbox-controls), against a local stand-in for UIIQ (a throwaway
// HOME with a fake session, so no real login is read or sent). It asks once,
// whatever the answer: a 429 is never asked again, and says how long to wait.
// Nothing feature-detects: an older UiiQ's answer comes back in its words.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools;

const TENANTS = [{ id: "ten_uc", slug: "ultimatecoins", name: "Ultimate Coins" }];
const IMP = "ubms_impersonate=imp-uc-1";
const CHECK = "/socials/inbox/check-now";

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const path = req.url.replace(/^\/api/, "");
      const parsed = (() => { try { return JSON.parse(body); } catch { return body; } })();
      seen.push({ method: req.method, path, cookie: req.headers.cookie ?? "", ...(body ? { body: parsed } : {}) });
      const json = (status, data, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(data)); };
      if (path.split("?")[0] === "/admin/tenants") return json(200, TENANTS);
      if (path === "/admin/impersonate" && req.method === "POST") return json(200, { ok: true }, { "set-cookie": `${IMP}; Path=/; HttpOnly` });
      if (path === "/admin/impersonate/exit") return json(200, { ok: true });
      const [status, data, headers = {}] = reply;
      // No body at all (Next's 405 for a method the route doesn't have).
      if (data === undefined) { res.writeHead(status, headers); return res.end(); }
      json(status, data, headers);
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
  const result = await tools.uiiq_social_inbox_check_now.handler(args);
  return { result, requests: seen };
}
async function refused(args, response) {
  reply = response;
  seen = [];
  const e = await tools.uiiq_social_inbox_check_now.handler(args).then(() => null, (x) => x);
  assert.ok(e, "expected a refusal");
  // Anything asked again after the refusal would land here.
  await new Promise((r) => setTimeout(r, 50));
  return { e, requests: seen };
}
const ONCE = [{ method: "POST", path: CHECK, cookie: "authjs.session-token=test" }];

test("one POST to /socials/inbox/check-now with no body; UiiQ's { stored, retryAfter } as it sent it", async () => {
  let { result, requests } = await call({}, [200, { stored: 3, retryAfter: 60 }]);
  assert.deepEqual(requests, ONCE);
  assert.deepEqual(result, { stored: 3, retryAfter: 60 });
  ({ result, requests } = await call(undefined, [200, { stored: 0, retryAfter: 60 }]));
  assert.deepEqual(requests, ONCE);
  assert.deepEqual(result, { stored: 0, retryAfter: 60 });
});

test("the schema takes nothing but tenant, and nothing else is ever sent", async () => {
  const t = tools.uiiq_social_inbox_check_now;
  assert.deepEqual(Object.keys(t.inputSchema.properties), ["tenant"]);
  assert.equal(t.inputSchema.additionalProperties, false);
  assert.equal(t.inputSchema.required, undefined);
  const { requests } = await call({ stored: 5, tenantId: "ten_other", force: true }, [200, { stored: 0, retryAfter: 60 }]);
  assert.deepEqual(requests, ONCE);
});

test("with tenant: a write-enabled impersonation (the route refuses read-only), the check, then exit", async () => {
  const { result, requests } = await call({ tenant: "ten_uc" }, [200, { stored: 2, retryAfter: 60 }]);
  assert.deepEqual(result, { stored: 2, retryAfter: 60 });
  const imp = requests.find((r) => r.path === "/admin/impersonate");
  assert.deepEqual(imp.body, { tenantId: "ten_uc", writeEnabled: true });
  const checks = requests.filter((r) => r.path === CHECK);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].method, "POST");
  assert.ok(checks[0].cookie.includes(IMP), checks[0].cookie);
  assert.equal(checks[0].body, undefined);
  assert.equal(requests.at(-1).path, "/admin/impersonate/exit");
});

test("a 429 is never asked again: UiiQ's words, with retryAfter in seconds", async () => {
  const minute = { error: "Checked a moment ago: try again in 60 seconds", code: "rate_limited", retryAfter: 60 };
  let { e, requests } = await refused({}, [429, minute, { "retry-after": "60" }]);
  assert.deepEqual(requests, ONCE);
  assert.equal(e.status, 429);
  assert.equal(e.retryAfter, 60);
  assert.ok(e.message.startsWith("Checked a moment ago: try again in 60 seconds ("), e.message);
  assert.match(e.message, /retryAfter: 60 seconds/);
  assert.match(e.message, /not asked again: wait that long before asking, or leave it, since the inbox also refreshes by itself every 10 minutes/);

  const hour = { error: "That's a lot of checks this hour. New messages still come in by themselves every 10 minutes.", code: "rate_limited", retryAfter: 3600 };
  ({ e, requests } = await refused({}, [429, hour, { "retry-after": "3600" }]));
  assert.deepEqual(requests, ONCE);
  assert.equal(e.retryAfter, 3600);
  assert.ok(e.message.startsWith(hour.error), e.message);
  assert.match(e.message, /retryAfter: 3600 seconds/);

  // Only the Retry-After header: still surfaced, still asked once.
  ({ e, requests } = await refused({}, [429, { error: "Too many requests" }, { "retry-after": "45" }]));
  assert.deepEqual(requests, ONCE);
  assert.equal(e.retryAfter, 45);
  assert.match(e.message, /^Too many requests \(retryAfter: 45 seconds; not asked again/);
});

test("refusals come back in UiiQ's words, asked once: nothing to check, IQEX failing (with what was stored), the guards, an older UiiQ", async () => {
  const cases = [
    [[409, { error: "There's no Facebook Page or Instagram account here to check.", code: "nothing_to_check" }], "There's no Facebook Page or Instagram account here to check."],
    [[502, { error: "Couldn't check just now. Try again in a minute.", code: "failed", stored: 1, retryAfter: 60 }], "Couldn't check just now. Try again in a minute. (stored: 1 new before it stopped; retryAfter: 60 seconds)"],
    [[502, { error: "Couldn't check just now. Try again in a minute.", code: "failed", retryAfter: 60 }], "Couldn't check just now. Try again in a minute. (retryAfter: 60 seconds)"],
    [[403, { error: "Read-only impersonation — exit or re-start with writeEnabled=true" }], "Read-only impersonation — exit or re-start with writeEnabled=true"],
    [[403, { error: "You don't have permission to do that.", code: "role_access" }], "You don't have permission to do that."],
    // An older UiiQ, before the route: its 404 as it answers...
    [[404, { error: "Not found" }], "Not found"],
    // ...and today's, where the inbox's message route (PATCH only) answers for "check-now" with Next's bare 405.
    [[405, undefined, { allow: "PATCH" }], "HTTP 405 Method Not Allowed, with no body"],
  ];
  for (const [response, words] of cases) {
    const { e, requests } = await refused({}, response);
    assert.equal(e.message, words, `${response[0]}`);
    assert.equal(e.status, response[0]);
    assert.deepEqual(requests, ONCE, `${response[0]}: asked once`);
  }
});

test("the description: what it does, the limits, never retried (wait retryAfter, or leave it: 10 minutes), the refusals", () => {
  const d = tools.uiiq_social_inbox_check_now.description;
  assert.match(d, /^Check for new messages now: UiiQ collects this workspace's new Facebook and Instagram comments and messages through IQEX at once, as it does by itself every 10 minutes/);
  assert.match(d, /Takes nothing but tenant\. Answers \{ stored, retryAfter \}: stored is how many new ones were collected \(0: nothing new\)/);
  assert.match(d, /At most once a minute and 20 times an hour per workspace, whoever asks: past that UiiQ refuses \(429\) in its own words, with retryAfter in seconds\./);
  assert.ok(d.includes("This tool never asks again by itself, and neither do you: wait retryAfter seconds before asking again, or leave it, since the inbox also refreshes by itself every 10 minutes."));
  assert.match(d, /409 \(nothing_to_check\)/);
  assert.match(d, /502: IQEX couldn't be asked just now; stored says what was collected before it stopped/);
  assert.match(d, /Needs Socials write; refused under a read-only impersonation/);
  assert.match(d, /Every refusal comes back in UiiQ's words, and so does a UiiQ without this route/);
});

test("the README row, in lockstep", () => {
  const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const row = readme.split("\n").find((l) => l.startsWith("| `uiiq_social_inbox_check_now` |"));
  assert.ok(row, "no README row");
  assert.match(row, /`\{ stored, retryAfter \}`/);
  assert.match(row, /At most once a minute and 20 an hour per workspace: a 429 comes back in UiiQ's words with `retryAfter` \(seconds\) and is never retried/);
  assert.match(row, /every 10 minutes/);
  assert.match(row, /409 `nothing_to_check`/);
  assert.match(row, /502 when IQEX failed, with what was stored/);
});
