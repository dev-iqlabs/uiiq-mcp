// node --test — ticket types with an early bird price and on-sale dates (UiiQ-platform events
// tickets polish), and the fields the routes already took (ages, per-order numbers, allocation,
// performance). Against a local stand-in for UIIQ (a throwaway HOME with a fake session, so no
// real login is read or sent anywhere).
//
// What these hold still: create and update send every field under the route's own name, update
// sends only what is given and null as null (that is how the route clears), and the route's
// refusal comes back as the error.
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
  tools = Object.fromEntries(adminOpsTools.map((t) => [t.name, t]));
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

const FIELDS = ["description", "isActive", "minAge", "maxAge", "minQuantity", "maxQuantity", "totalAllocation", "sessionId", "earlyBirdPricePence", "earlyBirdUntil", "availableFrom", "availableUntil"];
const CLEARABLE = ["description", "minAge", "maxAge", "totalAllocation", "sessionId", "earlyBirdPricePence", "earlyBirdUntil", "availableFrom", "availableUntil"];
const TYPE = {
  id: "tt_adult", experienceId: "exp_show", name: "Adult", priceInPence: 1000,
  earlyBirdPricePence: 800, earlyBirdUntil: "2027-01-18T00:00:00.000Z", availableFrom: "2026-11-01T09:00:00.000Z", availableUntil: null,
};

test("both tools take every field the routes take, null where the route clears", () => {
  const create = tools.uiiq_ticket_type_create.inputSchema;
  const update = tools.uiiq_ticket_type_update.inputSchema;
  assert.deepEqual(create.required, ["experienceId", "name", "priceInPence"]);
  assert.deepEqual(update.required, ["id"]);
  for (const k of [...FIELDS, "name", "priceInPence"]) {
    assert.ok(k in create.properties, `create has no ${k}`);
    assert.ok(k in update.properties, `update has no ${k}`);
  }
  assert.equal("experienceId" in update.properties, false, "update can't move a type to another experience");
  for (const k of ["soldCount", "position"]) assert.equal(k in create.properties || k in update.properties, false, `${k} is never sent`);
  for (const k of CLEARABLE) assert.ok([update.properties[k].type].flat().includes("null"), `${k} can't be cleared`);
  for (const k of ["name", "priceInPence", "isActive", "minQuantity", "maxQuantity"]) assert.equal([update.properties[k].type].flat().includes("null"), false, `${k} isn't clearable on the route`);
  for (const k of ["earlyBirdUntil", "availableFrom", "availableUntil"]) {
    assert.match(update.properties[k].description, /YYYY-MM-DD/, k);
    assert.match(update.properties[k].description, /timezone/, k);
  }
  assert.match(update.properties.earlyBirdUntil.description, /ENDS/);
});

test("create: one POST with the early bird, its end, the on-sale window and the rest, under the route's names", async () => {
  const args = {
    experienceId: "exp_show", name: "Adult", priceInPence: 1000, description: "Over 16s", isActive: true,
    minAge: 16, maxAge: null, minQuantity: 1, maxQuantity: 8, totalAllocation: 120, sessionId: "ses_sat",
    earlyBirdPricePence: 800, earlyBirdUntil: "2027-01-18", availableFrom: "2026-11-01T09:00:00Z", availableUntil: "2027-02-20T19:00:00+00:00",
  };
  const { result, requests } = await call("uiiq_ticket_type_create", args, [201, { ticketType: TYPE }]);
  assert.deepEqual(requests, [{ method: "POST", path: "/admin/ticket-types", body: args }]);
  assert.deepEqual(result, { ticketType: TYPE });
});

test("create: with only what's required, nothing else is sent", async () => {
  const { requests } = await call("uiiq_ticket_type_create", { experienceId: "exp_show", name: "Child", priceInPence: 500 }, [201, { ticketType: TYPE }]);
  assert.deepEqual(requests, [{ method: "POST", path: "/admin/ticket-types", body: { experienceId: "exp_show", name: "Child", priceInPence: 500 } }]);
});

test("update: only the fields given, the early bird and on-sale dates as typed", async () => {
  const { result, requests } = await call("uiiq_ticket_type_update", { id: "tt/adult", earlyBirdPricePence: 800, earlyBirdUntil: "2027-01-18T00:00:00.000Z", availableFrom: "2026-11-01" }, [200, TYPE]);
  assert.deepEqual(requests, [{ method: "PATCH", path: "/admin/ticket-types/tt%2Fadult", body: { earlyBirdPricePence: 800, earlyBirdUntil: "2027-01-18T00:00:00.000Z", availableFrom: "2026-11-01" } }]);
  assert.deepEqual(result, TYPE);
});

test("update: null reaches the route as null, which clears the early bird, the window, the limit and the performance", async () => {
  const cleared = { earlyBirdPricePence: null, earlyBirdUntil: null, availableFrom: null, availableUntil: null, totalAllocation: null, sessionId: null, minAge: null, maxAge: null, description: null };
  const { requests } = await call("uiiq_ticket_type_update", { id: "tt_adult", ...cleared }, [200, TYPE]);
  assert.deepEqual(requests, [{ method: "PATCH", path: "/admin/ticket-types/tt_adult", body: cleared }]);
});

test("update: the fields the route already took (ages, per order, allocation, performance) are sent", async () => {
  const body = { minAge: 4, maxAge: 15, minQuantity: 1, maxQuantity: 6, totalAllocation: 40, sessionId: "ses_fri", isActive: false, priceInPence: 900, name: "Child" };
  const { requests } = await call("uiiq_ticket_type_update", { id: "tt_child", ...body }, [200, TYPE]);
  assert.deepEqual(requests, [{ method: "PATCH", path: "/admin/ticket-types/tt_child", body }]);
});

test("update: the route's refusal is the error", async () => {
  reply = [400, { error: "The early bird price has to be less than the normal price." }];
  seen = [];
  await assert.rejects(() => tools.uiiq_ticket_type_update.handler({ id: "tt_adult", earlyBirdPricePence: 1000, earlyBirdUntil: "2027-01-18" }), /has to be less than the normal price/);
  assert.equal(seen.length, 1);
});
