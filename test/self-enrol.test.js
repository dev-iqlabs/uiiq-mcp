// node --test — UiiQ-platform self-enrolment (Members App): auto-approve on
// the registration form, and a
// class's byAudition, against a local stand-in for UIIQ (a throwaway HOME
// with a fake session, so no real login is read or sent).
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
      const [status, json] = reply();
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
  const { classesTools } = await import("../src/tools/classes.js");
  tools = Object.fromEntries(classesTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, response) {
  reply = () => response;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

test("registration form: autoApprove alone leaves the form; ref alone as before; neither is refused", async () => {
  let r = await call("uiiq_classes_registration_form_set", { autoApprove: true }, [200, { ok: true, autoApprove: true }]);
  assert.deepEqual(r.requests, [{ method: "PUT", path: "/classes/registration-form", body: { autoApprove: true } }]);
  r = await call("uiiq_classes_registration_form_set", { ref: null }, [200, { ok: true }]);
  assert.deepEqual(r.requests[0].body, { ref: null });
  r = await call("uiiq_classes_registration_form_set", { ref: "142", autoApprove: false }, [200, { ok: true }]);
  assert.deepEqual(r.requests[0].body, { ref: "142", autoApprove: false });
  seen = [];
  await assert.rejects(tools.uiiq_classes_registration_form_set.handler({}), /ref, autoApprove or both/);
  assert.deepEqual(seen, []);
  assert.equal(tools.uiiq_classes_registration_form_set.inputSchema.required, undefined);
  // Lucas F7: the description asks for the owner's agreement before switching it on.
  assert.match(tools.uiiq_classes_registration_form_set.description, /only send autoApprove true after the owner has explicitly agreed/);
});

test("classes create and update carry byAudition", async () => {
  assert.equal(tools.uiiq_classes_update.inputSchema.properties.byAudition.type, "boolean");
  assert.equal(tools.uiiq_classes_create.inputSchema.properties.byAudition.type, "boolean");
  const r = await call("uiiq_classes_update", { id: "cls1", name: "MT Company", dayOfWeek: 2, startTime: "18:00", durationMins: 90, capacity: 20, byAudition: true }, [200, { ok: true }]);
  assert.equal(r.requests[0].method, "PATCH");
  assert.equal(r.requests[0].body.byAudition, true);
});
