// node --test — uiiq_social_post_insights: Refresh figures on a post
// (POST /api/socials/posts/{id}/insights), against a local stand-in for UIIQ
// (a throwaway HOME with a fake session, so no real login is read or sent).
// With `tenant`, the call goes through an impersonation of that tenant, write
// enabled (the route refuses read-only impersonation), as the module's other
// tenant tools do.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools;

const TENANTS = [{ id: "ten_uc", slug: "ultimatecoins", name: "Ultimate Coins" }];
const IMP = "ubms_impersonate=imp-uc-1";

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const path = req.url.replace(/^\/api/, "");
      const parsed = (() => { try { return JSON.parse(body); } catch { return body; } })();
      seen.push({ method: req.method, path, cookie: req.headers.cookie ?? "", ...(body ? { body: parsed } : {}) });
      const json = (status, data, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(data)); };
      if (path === "/admin/tenants") return json(200, TENANTS);
      if (path === "/admin/impersonate" && req.method === "POST") return json(200, { ok: true }, { "set-cookie": `${IMP}; Path=/; HttpOnly` });
      if (path === "/admin/impersonate/exit") return json(200, { ok: true });
      if (path === "/auth/csrf") return json(200, { csrfToken: "csrf-test" }, { "set-cookie": "authjs.csrf-token=csrf-test; Path=/" });
      if (path === "/auth/callback/credentials") return json(200, { url: "/" }, { "set-cookie": "authjs.session-token=renewed; Path=/; HttpOnly" });
      const [status, data] = reply;
      json(status, data);
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
  const result = await tools.uiiq_social_post_insights.handler(args);
  return { result, requests: seen };
}

const ANSWER = {
  targets: [
    { id: "t_fb", platform: "FACEBOOK", outcome: "updated", insights: { source: "iqex", fetchedAt: "2026-10-16T12:00:00.000Z", metrics: { post_clicks: 4, post_reactions_by_type_total: 9 }, missing: ["post_video_views"] } },
    { id: "t_li", platform: "LINKEDIN", outcome: "skipped", insights: null },
  ],
};

test("one POST to /socials/posts/{id}/insights, no body, and UiiQ's answer passed back unchanged", async () => {
  const { result, requests } = await call({ id: "post 1/x" }, [200, ANSWER]);
  assert.deepEqual(requests.map(({ method, path, body }) => ({ method, path, body })), [{ method: "POST", path: "/socials/posts/post%201%2Fx/insights", body: undefined }]);
  assert.doesNotMatch(requests[0].cookie, /ubms_impersonate/);
  assert.deepEqual(result, ANSWER);
});

test("with tenant, it goes through a write-enabled impersonation of that tenant, then exits", async () => {
  const { result, requests } = await call({ id: "p1", tenant: "ultimatecoins" }, [200, ANSWER]);
  assert.deepEqual(result, ANSWER);
  const read = requests.filter((r) => r.path === "/socials/posts/p1/insights");
  assert.equal(read.length, 1);
  assert.match(read[0].cookie, /ubms_impersonate=imp-uc-1/);
  assert.deepEqual(requests.find((r) => r.path === "/admin/impersonate").body, { tenantId: "ten_uc", writeEnabled: true });
  assert.ok(requests.some((r) => r.path === "/admin/impersonate/exit" && r.method === "POST"));
});

test("UiiQ's refusals come back in its own words", async () => {
  await assert.rejects(call({ id: "p1" }, [404, { error: "Not found" }]), (e) => e.message === "Not found");
  await assert.rejects(call({ id: "p1" }, [403, { error: "Read-only impersonation" }]), (e) => e.message === "Read-only impersonation");
});

test("the description says unavailable is never 0, what comes back, and that nothing is posted", () => {
  const t = tools.uiiq_social_post_insights;
  assert.deepEqual(t.inputSchema.required, ["id"]);
  assert.deepEqual(Object.keys(t.inputSchema.properties), ["id", "tenant"]);
  assert.match(t.description, /^Refresh a published post's engagement figures now/);
  assert.match(t.description, /outcome: updated \| failed \| fresh \| skipped/);
  assert.match(t.description, /show it as unavailable, never as 0/);
  assert.match(t.description, /Reads only: nothing is posted\.$/);
});
