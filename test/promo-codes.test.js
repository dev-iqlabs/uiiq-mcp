// node --test — promo codes on plans (UiiQ-platform #1216): list the codes, read one with the
// members on it, create one, and edit what it does on a plan. Against a local stand-in for UIIQ
// (a throwaway HOME with a fake session, so no real login is read or sent anywhere).
//
// What these hold still: create sends the route's own names (discountType / discountValue; the
// old { code, discount, type } was refused by the route every time), only the fields given are
// sent, and the plan settings reach the route as typed.
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
  const { adminOpsTools } = await import("../src/tools/admin-ops.js");
  const { sellTools } = await import("../src/tools/sell.js");
  tools = Object.fromEntries([...adminOpsTools, ...sellTools].map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, answer = [500, { error: "nothing should have been called" }]) {
  reply = answer;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

const CODE = {
  id: "pc_spring", code: "SPRING10", discountType: "PERCENTAGE", discountValue: 10, maxUses: 20, usedCount: 3, maxUsesPerEmail: 1,
  validFrom: null, validUntil: "2027-01-31T00:00:00.000Z", isActive: true,
  appliesTo: "PLANS", planDuration: "MONTHS", planDurationMonths: 3, planIds: ["plan_2", "plan_3"],
};

const MEMBERS = {
  promoCode: CODE,
  members: [
    {
      redemptionId: "rd_2", membershipId: "mem_2", customerName: "Sam Jones", customerEmail: "sam@example.com", membershipStatus: "ACTIVE",
      plan: { id: "plan_2", name: "2 a week" }, duration: "MONTHS", durationMonths: 3, discountPence: 300,
      joinedAt: "2026-10-24T09:00:00.000Z", discountUntil: "2027-01-24T09:00:00.000Z", droppedAt: null,
    },
    {
      redemptionId: "rd_1", membershipId: "mem_1", customerName: "Jo Smith", customerEmail: "jo@example.com", membershipStatus: "ACTIVE",
      plan: { id: "plan_9", name: "Unlimited" }, duration: "MONTHS", durationMonths: 3, discountPence: 300,
      joinedAt: "2026-10-01T09:00:00.000Z", discountUntil: "2027-01-01T09:00:00.000Z", droppedAt: "2026-11-05T10:00:00.000Z",
    },
  ],
  inCheckout: 1,
};

test("the tools exist with the inputs the routes take", () => {
  assert.ok(tools.uiiq_promo_code_list);
  assert.deepEqual(tools.uiiq_promo_code_get.inputSchema.required, ["id"]);

  const create = tools.uiiq_sell_promo_create.inputSchema;
  assert.deepEqual(create.required, ["code", "discountType", "discountValue"]);
  for (const k of ["discount", "type", "expires"]) assert.ok(!(k in create.properties), `${k} is not a name the route reads`);

  const update = tools.uiiq_promo_code_update.inputSchema.properties;
  for (const schema of [create.properties, update]) {
    for (const k of ["appliesTo", "planDuration", "planDurationMonths", "planIds", "maxUsesPerEmail"]) assert.ok(k in schema, `${k} missing`);
    assert.deepEqual(schema.appliesTo.enum, ["BOOKINGS", "PLANS", "BOTH"]);
    assert.deepEqual(schema.planDuration.enum, ["FIRST_PAYMENT", "MONTHS", "EVERY_PAYMENT"]);
    assert.deepEqual(schema.discountType.enum, ["PERCENTAGE", "FIXED"]);
  }
});

test("list: one GET /admin/promo-codes, UiiQ's answer passed back", async () => {
  const answer = { codes: [{ ...CODE, membersOnPlans: 2 }] };
  const { result, requests } = await call("uiiq_promo_code_list", {}, [200, answer]);
  assert.deepEqual(requests, [{ method: "GET", path: "/admin/promo-codes" }]);
  assert.deepEqual(result, answer);
});

test("get: one GET for the code, and the members with their until-dates passed back unchanged", async () => {
  const { result, requests } = await call("uiiq_promo_code_get", { id: "pc/spring" }, [200, MEMBERS]);
  assert.deepEqual(requests, [{ method: "GET", path: "/admin/promo-codes/pc%2Fspring" }]);
  assert.deepEqual(result, MEMBERS);
  assert.match(tools.uiiq_promo_code_get.description, /discountUntil/);
  assert.match(tools.uiiq_promo_code_get.description, /null = every payment/);
  assert.match(tools.uiiq_promo_code_get.description, /droppedAt/);
});

test("get: a code that isn't the workspace's is UiiQ's 404", async () => {
  await assert.rejects(call("uiiq_promo_code_get", { id: "pc_other" }, [404, { error: "Not found" }]), /Not found/);
});

test("create: POSTs the route's own names, discountType and discountValue, with the plan settings", async () => {
  const args = {
    code: "spring10", discountType: "PERCENTAGE", discountValue: 10, maxUses: 20, maxUsesPerEmail: 1, validUntil: "2027-01-31",
    appliesTo: "PLANS", planDuration: "MONTHS", planDurationMonths: 3, planIds: ["plan_2", "plan_3"],
  };
  const { result, requests } = await call("uiiq_sell_promo_create", args, [201, { promoCode: CODE }]);
  assert.deepEqual(requests, [{ method: "POST", path: "/admin/promo-codes", body: args }]);
  assert.deepEqual(result, { promoCode: CODE });
});

test("create: only what was given is sent", async () => {
  const { requests } = await call("uiiq_sell_promo_create", { code: "TENOFF", discountType: "FIXED", discountValue: 1000 }, [201, { promoCode: CODE }]);
  assert.deepEqual(requests[0].body, { code: "TENOFF", discountType: "FIXED", discountValue: 1000 });
});

test("create: a refusal comes back in UiiQ's words", async () => {
  await assert.rejects(
    call("uiiq_sell_promo_create", { code: "X", discountType: "PERCENTAGE", discountValue: 10, planDuration: "MONTHS" }, [400, { error: "planDurationMonths must be a whole number of months, 1 to 120" }]),
    /planDurationMonths must be a whole number of months/,
  );
});

test("update: the plan settings and the per-email limit go in the PATCH; only what was given", async () => {
  const { requests } = await call(
    "uiiq_promo_code_update",
    { id: "pc_spring", appliesTo: "BOTH", planDuration: "MONTHS", planDurationMonths: 6, planIds: ["plan_3"], maxUsesPerEmail: 2 },
    [200, { promoCode: CODE }],
  );
  assert.deepEqual(requests, [{ method: "PATCH", path: "/admin/promo-codes/pc_spring", body: { appliesTo: "BOTH", planDuration: "MONTHS", planDurationMonths: 6, planIds: ["plan_3"], maxUsesPerEmail: 2 } }]);
});

test("update: planIds null (every plan) and planDurationMonths null are sent as null, not dropped", async () => {
  const { requests } = await call("uiiq_promo_code_update", { id: "pc_spring", planDuration: "EVERY_PAYMENT", planDurationMonths: null, planIds: null }, [200, { promoCode: CODE }]);
  assert.deepEqual(requests[0].body, { planDuration: "EVERY_PAYMENT", planDurationMonths: null, planIds: null });
});
