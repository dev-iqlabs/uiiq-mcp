// node --test — the role template tools call the routes UiiQ has, and say what UiiQ said when it refuses. Against a
// local stand-in for UiiQ (a throwaway HOME with a fake session), so no real login is read or sent anywhere.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, json] = reply;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
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
  const mod = await import("../src/tools/admin-ops.js");
  const list = Object.values(mod).find((v) => Array.isArray(v) && v.some((t) => t.name === "uiiq_role_template_list"));
  tools = Object.fromEntries(list.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

const call = (name, r, args = {}) => { reply = r; seen = []; return tools[name].handler(args); };

test("list, create, update and delete hit the admin routes with what they're given", async () => {
  await call("uiiq_role_template_list", [200, { templates: [] }]);
  assert.deepEqual(seen, [{ method: "GET", path: "/admin/role-templates" }]);

  const body = { name: "Front desk", levels: { classes: "read" }, sectorPresetIds: ["s1"] };
  await call("uiiq_role_template_create", [201, { template: {} }], body);
  assert.deepEqual(seen, [{ method: "POST", path: "/admin/role-templates", body }]);

  await call("uiiq_role_template_update", [200, { template: {} }], { id: "tpl 1", name: "Office" });
  assert.deepEqual(seen, [{ method: "PATCH", path: "/admin/role-templates/tpl%201", body: { name: "Office" } }]);

  await call("uiiq_role_template_delete", [200, { deleted: true, copiesKept: 0 }], { id: "tpl_1" });
  assert.deepEqual(seen, [{ method: "DELETE", path: "/admin/role-templates/tpl_1" }]);
});

test("offered and copy hit the workspace routes, and copy sends only the name", async () => {
  await call("uiiq_role_template_offered", [200, { templates: [] }]);
  assert.deepEqual(seen, [{ method: "GET", path: "/roles/templates" }]);

  await call("uiiq_role_template_copy", [201, { role: {}, leftOut: [] }], { id: "tpl_1" });
  assert.deepEqual(seen, [{ method: "POST", path: "/roles/templates/tpl_1/copy", body: {} }]);

  await call("uiiq_role_template_copy", [201, { role: {}, leftOut: [] }], { id: "tpl_1", name: "Teacher two" });
  assert.deepEqual(seen, [{ method: "POST", path: "/roles/templates/tpl_1/copy", body: { name: "Teacher two" } }]);
});

test("a refusal comes back as what UiiQ said", async () => {
  await assert.rejects(call("uiiq_role_template_create", [400, { error: "A template can't give access to student details", code: "workspace_decides" }], { name: "X", levels: { "perm.student.health": "read" } }), /student details/);
  await assert.rejects(call("uiiq_role_template_copy", [409, { error: "You already have a role with this name", code: "role_name_taken" }], { id: "tpl_1" }), /already have a role/);
});
