// node --test — uiiq_workflow_types_mine: the workspace's own workflow types
// (GET /api/workflow/types), against a local stand-in for UIIQ (a throwaway
// HOME with a fake session, so no real login is read or sent). With `tenant`,
// the call goes through an impersonation of that tenant, as the module's
// other tenant tools do.
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
      // The re-login's body is a form, not JSON.
      const parsed = (() => { try { return JSON.parse(body); } catch { return body; } })();
      seen.push({ method: req.method, path, cookie: req.headers.cookie ?? "", ...(body ? { body: parsed } : {}) });
      const json = (status, data, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(data)); };
      // The impersonation the client makes for `tenant`.
      if (path === "/admin/tenants") return json(200, TENANTS);
      if (path === "/admin/impersonate" && req.method === "POST") return json(200, { ok: true }, { "set-cookie": `${IMP}; Path=/; HttpOnly` });
      if (path === "/admin/impersonate/exit") return json(200, { ok: true });
      // The client's one re-login after a 401.
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
  const { workflowTools } = await import("../src/tools/workflow.js");
  tools = Object.fromEntries(workflowTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(args, response) {
  reply = response;
  seen = [];
  const result = await tools.uiiq_workflow_types_mine.handler(args);
  return { result, requests: seen };
}

const TYPES = [
  { id: "wt_1", name: "Legacy film", slug: "legacy-film", status: "ACTIVE" },
  { id: "wt_2", name: "Memorial keepsake", slug: "memorial-keepsake", status: "DRAFT" },
];

test("one GET /workflow/types, no body, and UiiQ's list passed back unchanged", async () => {
  for (const args of [undefined, {}]) {
    reply = [200, TYPES];
    seen = [];
    const result = await tools.uiiq_workflow_types_mine.handler(args);
    assert.deepEqual(seen.map(({ method, path, body }) => ({ method, path, body })), [{ method: "GET", path: "/workflow/types", body: undefined }]);
    assert.doesNotMatch(seen[0].cookie, /ubms_impersonate/);
    assert.deepEqual(result, TYPES);
  }
  const { result } = await call({}, [200, []]);
  assert.deepEqual(result, []);
});

test("with tenant, the read goes through an impersonation of that tenant (read-only), then exits", async () => {
  const { result, requests } = await call({ tenant: "ultimatecoins" }, [200, TYPES]);
  assert.deepEqual(result, TYPES);
  const read = requests.filter((r) => r.path === "/workflow/types");
  assert.equal(read.length, 1);
  assert.equal(read[0].method, "GET");
  assert.match(read[0].cookie, /ubms_impersonate=imp-uc-1/);
  const start = requests.find((r) => r.path === "/admin/impersonate");
  assert.deepEqual(start.body, { tenantId: "ten_uc", writeEnabled: false });
  assert.ok(requests.some((r) => r.path === "/admin/impersonate/exit" && r.method === "POST"));
  assert.ok(requests.findIndex((r) => r.path === "/admin/impersonate") < requests.findIndex((r) => r.path === "/workflow/types"));
});

test("UiiQ's refusal comes back in its own words: a login with no workspace gets its 401 'Unauthorized' after the one re-login", async () => {
  // A 401 reads as an expired session, so the client logs in again once and
  // retries. A login that's fine but has no workspace is refused again, and
  // that refusal is shown as UiiQ wrote it.
  const creds = join(home, ".uiiq", "credentials.json");
  const plain = JSON.parse((await import("node:fs")).readFileSync(creds, "utf8"));
  writeFileSync(creds, JSON.stringify({ ...plain, email: "operator@example.com", password: "test-only" }));
  try {
    reply = [401, { error: "Unauthorized" }];
    seen = [];
    await assert.rejects(tools.uiiq_workflow_types_mine.handler({}), (e) => e.message === "Unauthorized");
    assert.deepEqual(seen.filter((r) => r.path === "/workflow/types").map((r) => r.method), ["GET", "GET"]);
  } finally {
    writeFileSync(creds, JSON.stringify(plain));
  }
  await assert.rejects(call({}, [500, { error: "Internal error" }]), (e) => e.message === "Internal error");
  await assert.rejects(call({}, [403, { error: "Forbidden" }]), (e) => e.message === "Forbidden");
});

test("the description says it's this workspace's own short list, and points to the operator's tool; the operator's points back", () => {
  const mine = tools.uiiq_workflow_types_mine;
  assert.ok(mine.inputSchema.properties.tenant, "tenant");
  assert.deepEqual(Object.keys(mine.inputSchema.properties), ["tenant"]);
  assert.match(mine.description, /^This workspace's own workflow types/);
  assert.match(mine.description, /\[\{ id, name, slug, status \}\]/);
  assert.match(mine.description, /The full rows across tenants, with tiers and order counts, are the operator's: uiiq_workflow_type_list \(SUPER_ADMIN only\)/);
  const op = tools.uiiq_workflow_type_list.description;
  assert.match(op, /across tenants or for one tenantId\. SUPER_ADMIN only\./);
  assert.match(op, /A workspace's own short list is uiiq_workflow_types_mine/);
});
