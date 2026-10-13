// node --test — "Billed through" and "Run for" tools (UiiQ-platform sister organisations 3/7):
// owner or admin only, explicit (dry run without confirm: true, calling nothing), and
// acting in the signed-in workspace (no tenant: UIIQ refuses these while impersonating).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classesTools } from "../src/tools/classes.js";
import { eventsTools } from "../src/tools/events.js";
import { sellTools } from "../src/tools/sell.js";

const all = [...classesTools, ...eventsTools, ...sellTools];
const tool = (name) => all.find((t) => t.name === name);

for (const [name, args] of [
  ["uiiq_event_billing_set", { id: "ev_show", billingOrganisationId: "bo_college", costumePricePence: 2500 }],
  ["uiiq_classes_billing_set", { id: "cls_line", runForBillingOrganisationId: "bo_college" }],
  // Sister organisations 4/7: the costumes' own organisation, a paid class's Billed through.
  ["uiiq_event_billing_set", { id: "ev_show", costumeBillingOrganisationId: "bo_college" }],
  ["uiiq_classes_billing_set", { id: "cls_jazz", billingOrganisationId: "bo_college" }],
]) {
  test(`${name}: owner or admin only, no tenant, and a dry run without confirm`, async () => {
    const t = tool(name);
    assert.match(t.description, /^Owner or admin only:/);
    assert.match(t.description, /Without confirm: true it is ALWAYS a dry run/);
    assert.equal("tenant" in t.inputSchema.properties, false);
    const out = await t.handler(args);
    assert.equal(out.dryRun, true);
    assert.equal(out.changed, false);
  });
}

test("3d: fundingMode on uiiq_classes_billing_set, a dry run like the rest; the register payment and get say what free and subsidised mean", async () => {
  const t = tool("uiiq_classes_billing_set");
  assert.deepEqual(t.inputSchema.properties.fundingMode.enum, ["NONE", "FREE", "SUBSIDISED"]);
  assert.match(t.description, /SUBSIDISED = families pay the class fee, taken by the organisation running it/);
  assert.match(t.description, /Run for a sister without fundingMode = FREE, as before/);
  const out = await t.handler({ id: "cls_line", runForBillingOrganisationId: "bo_college", fundingMode: "SUBSIDISED" });
  assert.equal(out.dryRun, true);
  assert.equal(out.fundingMode, "SUBSIDISED");
  assert.ok(tool("uiiq_classes_register_payment").description.includes("Refused (400) on a funded, FREE class"));
  assert.ok(tool("uiiq_classes_register_payment").description.includes("A funded, SUBSIDISED class takes it like any other"));
  assert.ok(tool("uiiq_classes_get").description.includes("fundingMode (NONE | FREE | SUBSIDISED)"));
});

test("4/7 fields are in the schemas and described", () => {
  assert.ok("costumeBillingOrganisationId" in tool("uiiq_event_billing_set").inputSchema.properties);
  assert.match(tool("uiiq_event_billing_set").description, /COSTUMES are billed through, set separately; 409 once a costume has been paid for/);
  assert.ok("billingOrganisationId" in tool("uiiq_classes_billing_set").inputSchema.properties);
  assert.match(tool("uiiq_classes_billing_set").description, /a plan only covers classes billed through the same organisation/);
});

test("uiiq_classes_costume_refund: owner or admin only, a dry run without confirm that calls nothing", async () => {
  const t = tool("uiiq_classes_costume_refund");
  assert.match(t.description, /^Owner or admin only: REFUND one routine's show costume/);
  assert.equal("tenant" in t.inputSchema.properties, false);
  assert.deepEqual(t.inputSchema.required, ["saleId"]);
  const out = await t.handler({ saleId: "sale_1" });
  assert.equal(out.dryRun, true);
  assert.equal(out.changed, false);
});

test("uiiq_sell_membership_plan_update: Billed through is a dry run without confirm; other edits are as before", async () => {
  const t = tool("uiiq_sell_membership_plan_update");
  assert.ok("billingOrganisationId" in t.inputSchema.properties);
  const out = await t.handler({ planId: "plan_1", billingOrganisationId: "bo_college" });
  assert.equal(out.dryRun, true);
  assert.match(t.description, /a plan only covers classes billed through the same organisation/);
});

test("the register costume tool takes the routine (classId) for a per-routine paid tick", () => {
  const t = tool("uiiq_classes_register_costume");
  assert.ok("classId" in t.inputSchema.properties);
  assert.match(t.description, /THAT ROUTINE's costume paid at the office/);
});
