// node --test — family details check tools against a local stand-in for UIIQ
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

const SUMMARY = { enabled: true, children: 12, families: 9, reachableByEmail: 7, draftCampaignId: null };

test("details check reads GET /students/details-check with no body", async () => {
  const r = await call("uiiq_students_details_check", {}, [200, SUMMARY]);
  assert.deepEqual(r.requests, [{ method: "GET", path: "/students/details-check" }]);
  assert.deepEqual(r.result, SUMMARY);
});

test("details check draft POSTs /students/details-check with no body and returns the draft", async () => {
  let r = await call("uiiq_students_details_check_draft", {}, [201, { campaignId: "cmp1", created: true, sent: false }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/students/details-check" }]);
  assert.deepEqual(r.result, { campaignId: "cmp1", created: true, sent: false });
  r = await call("uiiq_students_details_check_draft", {}, [200, { campaignId: "cmp1", created: false, sent: false }]);
  assert.equal(r.result.created, false);
});

test("a refused draft surfaces the API's reason", async () => {
  await assert.rejects(
    call("uiiq_students_details_check_draft", {}, [409, { error: "The Members App isn't switched on for this workspace, so parents have nowhere to check their details." }]),
    { message: /Members App isn't switched on/ },
  );
});

test("the draft tool says it never sends and a human sends it from Campaigns", () => {
  const d = tools.uiiq_students_details_check_draft.description;
  assert.match(d, /NEVER sent by this tool/);
  assert.match(d, /a human reviews it and presses Send in Campaigns/);
});

test("update sends dobChangeChecked in the PATCH body", async () => {
  const r = await call("uiiq_students_update", { id: "stu1", dobChangeChecked: true }, [200, { ok: true }]);
  assert.deepEqual(r.requests, [{ method: "PATCH", path: "/students/stu1", body: { dobChangeChecked: true } }]);
  assert.equal(tools.uiiq_students_update.inputSchema.properties.dobChangeChecked.type, "boolean");
});
