// node --test — "Billed through" and "Run for" tools (UiiQ-platform sister organisations 3/7):
// owner or admin only, explicit (dry run without confirm: true, calling nothing), and
// acting in the signed-in workspace (no tenant: UIIQ refuses these while impersonating).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classesTools } from "../src/tools/classes.js";
import { eventsTools } from "../src/tools/events.js";

const all = [...classesTools, ...eventsTools];
const tool = (name) => all.find((t) => t.name === name);

for (const [name, args] of [
  ["uiiq_event_billing_set", { id: "ev_show", billingOrganisationId: "bo_college", costumePricePence: 2500 }],
  ["uiiq_classes_billing_set", { id: "cls_line", runForBillingOrganisationId: "bo_college" }],
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

test("the register costume tool takes the routine (classId) for a per-routine paid tick", () => {
  const t = tool("uiiq_classes_register_costume");
  assert.ok("classId" in t.inputSchema.properties);
  assert.match(t.description, /THAT ROUTINE's costume paid at the office/);
});
