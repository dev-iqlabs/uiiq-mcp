// node --test: uiiq_classes_register_payment (UiiQ-platform, Lucas L1 on #1083). A drop-in or
// plan payment must pass sessionDate; the tool says so, passes it on, and surfaces the 400/409.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, replies, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, json] = replies.length > 1 ? replies.shift() : replies[0];
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

test("the tool tells the agent that sessionDate is required for a drop-in or plan payment", () => {
  const t = tools.uiiq_classes_register_payment;
  assert.match(t.description, /DROP_IN or PLAN payment MUST pass sessionDate/);
  assert.match(t.inputSchema.properties.sessionDate.description, /Required for a DROP_IN or PLAN enrolment/);
});

test("passes sessionDate through to the register payment route", async () => {
  replies = [[201, { ok: true, paymentId: "pay_1", tillSaleId: "sale_1" }]];
  seen = [];
  const out = await tools.uiiq_classes_register_payment.handler({ enrolmentId: "en_1", amountPence: 800, method: "CASH", sessionDate: "2026-10-19" });
  assert.equal(out.paymentId, "pay_1");
  assert.deepEqual(seen, [{ method: "POST", path: "/classes/registers/payment", body: { enrolmentId: "en_1", amountPence: 800, method: "CASH", sessionDate: "2026-10-19" } }]);
});

test("the server's 400 without a session, and its 409 on a second take, reach the agent in its words", async () => {
  replies = [[400, { error: "sessionDate (YYYY-MM-DD) is required for a drop-in or plan payment: it is the session being paid for." }]];
  seen = [];
  await assert.rejects(tools.uiiq_classes_register_payment.handler({ enrolmentId: "en_1", amountPence: 800, method: "CASH" }), /sessionDate \(YYYY-MM-DD\) is required/);
  replies = [[409, { error: "Already paid for this session." }]];
  await assert.rejects(tools.uiiq_classes_register_payment.handler({ enrolmentId: "en_1", amountPence: 800, method: "CASH", sessionDate: "2026-10-19" }), /Already paid for this session/);
});
