// node --test — family registration tools against a local stand-in for UIIQ
// (a throwaway HOME with a fake session, so no real login is read or sent).
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
  // Imported only now: auth.js and config.js read HOME and UIIQ_BASE at load.
  const { studentsTools } = await import("../src/tools/students.js");
  tools = Object.fromEntries(studentsTools.map((t) => [t.name, t]));
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

test("decline sends the reason when one is given, and no reason key otherwise", async () => {
  let r = await call("uiiq_students_registration_decline", { id: "stu1", reason: "class full" }, [200, { ok: true, status: "DECLINED", guardianContactRemoved: false }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/students/stu1/registration", body: { action: "decline", reason: "class full" } }]);
  r = await call("uiiq_students_registration_decline", { id: "stu1" }, [200, { ok: true, status: "DECLINED", guardianContactRemoved: false }]);
  assert.deepEqual(r.requests[0].body, { action: "decline" });
  assert.equal(tools.uiiq_students_registration_decline.inputSchema.properties.reason.maxLength, 200);
});

test("a decline refused for history names the blockers", async () => {
  await assert.rejects(
    call("uiiq_students_registration_decline", { id: "stu1" }, [409, { error: "This child already has history here.", blockers: ["2 enrolments", "1 payment"] }]),
    { message: "This child already has history here. Blockers: 2 enrolments; 1 payment" },
  );
});

test("approve posts action approve", async () => {
  const r = await call("uiiq_students_registration_approve", { id: "stu 1" }, [200, { ok: true, status: "APPROVED" }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/students/stu%201/registration", body: { action: "approve" } }]);
  assert.deepEqual(r.result, { ok: true, status: "APPROVED" });
});

test("remove-parent deletes the registered parent and returns contactRemoved", async () => {
  const r = await call("uiiq_students_registered_parent_remove", { contactId: "c7" }, [200, { ok: true, contactRemoved: true }]);
  assert.deepEqual(r.requests, [{ method: "DELETE", path: "/students/registered-parents/c7" }]);
  assert.deepEqual(r.result, { ok: true, contactRemoved: true });
});

test("remove-parent says marketing opt-ins are kept", () => {
  assert.match(tools.uiiq_students_registered_parent_remove.description, /Marketing opt-ins are kept/);
  assert.match(tools.uiiq_students_registered_parent_remove.description, /they asked for news/);
});

test("approve, decline and remove-parent tell the model to confirm first", () => {
  for (const n of ["uiiq_students_registration_approve", "uiiq_students_registration_decline", "uiiq_students_registered_parent_remove"]) {
    assert.match(tools[n].description, /Confirm with the person before calling/, n);
  }
});
