// node --test — uiiq_sell_subscription_change_plan (Change plan, office only):
// a dry run without confirm: true that calls nothing; with it, one POST to
// the change-plan route with planId and when; the warning rides on the
// answer; a refusal is the platform's status and message. Against a local
// stand-in for UIIQ (a throwaway HOME with a fake session).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tool;

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
  const { sellTools } = await import("../src/tools/sell.js");
  tool = sellTools.find((t) => t.name === "uiiq_sell_subscription_change_plan");
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

const call = (r, args) => { reply = r; seen = []; return tool.handler(args); };
const OK = { when: "now", mode: "stripe", plan: { id: "plan_3", name: "3 a week", priceInPence: 5475, intervalMonths: 1 }, warning: "Ava's classes use 4 classes a week; 3 a week covers 3.", membership: { id: "mem_1" } };

test("without confirm: true it is a dry run and calls nothing", async () => {
  const out = await call([200, OK], { id: "mem_1", planId: "plan_3", when: "now" });
  assert.equal(out.dryRun, true);
  assert.equal(out.changed, false);
  assert.deepEqual(out.would, { membershipId: "mem_1", planId: "plan_3", when: "now" });
  assert.deepEqual(seen, []);
  assert.match(tool.description, /without confirm: true it is ALWAYS a dry run/);
  assert.deepEqual(tool.inputSchema.required, ["id", "planId", "when"]);
  assert.deepEqual(tool.inputSchema.properties.when.enum, ["now", "next_renewal"]);
});

test("confirm: true sends one POST with planId and when, and the warning rides on the answer", async () => {
  const out = await call([200, OK], { id: "mem_1", planId: "plan_3", when: "next_renewal", confirm: true });
  assert.deepEqual(seen, [{ method: "POST", path: "/admin/memberships/subscribers/mem_1/change-plan", body: { planId: "plan_3", when: "next_renewal" } }]);
  assert.equal(out.warning, OK.warning);
  assert.equal(out.plan.name, "3 a week");
});

test("a refusal is the platform's status and message", async () => {
  await assert.rejects(
    call([409, { error: "3 a week is billed through a different organisation. A membership stays with the organisation it was taken with; to move it, cancel and sign them up again." }], { id: "mem_1", planId: "plan_3", when: "now", confirm: true }),
    /409 .*different organisation/,
  );
});

test("choosing the current plan cancels a lined-up move: the answer's undone rides through", async () => {
  const out = await call([200, { ...OK, when: "next_renewal", undone: true, warning: null }], { id: "mem_1", planId: "plan_2", when: "next_renewal", confirm: true });
  assert.deepEqual(seen, [{ method: "POST", path: "/admin/memberships/subscribers/mem_1/change-plan", body: { planId: "plan_2", when: "next_renewal" } }]);
  assert.equal(out.undone, true);
});

test("a promo code's discount: the answer's discount rides through, and the description says what each outcome means", async () => {
  for (const outcome of ["kept", "dropped", "restored"]) {
    const out = await call([200, { ...OK, discount: { code: "SPRING10", outcome } }], { id: "mem_1", planId: "plan_3", when: "now", confirm: true });
    assert.deepEqual(out.discount, { code: "SPRING10", outcome });
  }
  const none = await call([200, { ...OK, discount: null }], { id: "mem_1", planId: "plan_3", when: "now", confirm: true });
  assert.equal(none.discount, null);
  for (const re of [/`discount`/, /kept \(the code covers the new plan/, /dropped \(the code doesn't cover the new plan: removed in the same Stripe update/, /restored \(cancelling a lined-up move/, /Pass on dropped and restored/]) {
    assert.match(tool.description, re);
  }
});

test("the description carries the money rules", () => {
  for (const re of [/prorates/, /CHARGES the difference at once/, /refused card: 502 and nothing changes/, /CURRENT plan as planId cancels a move/, /undone: true/, /'now' while a move is lined up is refused/, /next_renewal/, /Recorded by the office/, /fewer places/, /fixed-term pass/, /residents-only/, /another organisation/, /ended subscription/, /If Stripe refuses, nothing is changed/, /No refund/]) {
    assert.match(tool.description, re);
  }
});
