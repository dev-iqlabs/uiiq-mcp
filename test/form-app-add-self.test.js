// node --test — the Members App's "Add myself" form (UiiQ-platform #1196):
// purpose "add_self" on uiiq_form_app_publish and uiiq_form_app_update, beside
// "add_child". The route takes null, "add_child", "add_self" or
// "photo_consent"; without "add_self" here it could only be set in the UiiQ
// dashboard. Against a local stand-in for UIIQ (a throwaway HOME with a fake
// session, so no real login is read or sent anywhere).
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
  const { formsTools } = await import("../src/tools/forms.js");
  tools = Object.fromEntries(formsTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, answer) {
  reply = answer;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

test("publish and update both take purpose add_self, and say what it is", () => {
  for (const name of ["uiiq_form_app_publish", "uiiq_form_app_update"]) {
    assert.deepEqual(tools[name].inputSchema.properties.purpose.enum, ["add_child", "add_self", null], name);
    assert.match(tools[name].description, /"add_self"/, name);
    assert.match(tools[name].description, /Add myself/, name);
  }
});

test("publish: purpose add_self goes in the POST as given", async () => {
  const { result, requests } = await call("uiiq_form_app_publish", { ref: "148", purpose: "add_self" }, [200, { id: "af_1", title: "Add myself", purpose: "add_self" }]);
  assert.deepEqual(requests, [{ method: "POST", path: "/forms/app", body: { ref: "148", purpose: "add_self" } }]);
  assert.equal(result.purpose, "add_self");
});

test("update: purpose add_self goes in the PATCH; null makes it a normal form", async () => {
  let r = await call("uiiq_form_app_update", { id: "af_1", purpose: "add_self" }, [200, { id: "af_1" }]);
  assert.deepEqual(r.requests, [{ method: "PATCH", path: "/forms/app/af_1", body: { purpose: "add_self" } }]);
  r = await call("uiiq_form_app_update", { id: "af_1", purpose: null }, [200, { id: "af_1" }]);
  assert.deepEqual(r.requests[0].body, { purpose: null });
});
