// node --test — sister organisation tools (UiiQ-platform sister organisations 2/7):
// changing tools say "Owner only"; create, connect and remove are dry runs
// without confirm: true and never reach the API; changing tools take no tenant
// (naming one would impersonate, which UIIQ refuses for these).
import { test } from "node:test";
import assert from "node:assert/strict";
import { billingOrganisationsTools } from "../src/tools/billing-organisations.js";

const tool = (name) => billingOrganisationsTools.find((t) => t.name === name);
const CHANGING = ["uiiq_billing_org_create", "uiiq_billing_org_update", "uiiq_billing_org_delete", "uiiq_billing_org_connect_start"];

test("every tool path is one UIIQ route", () => {
  assert.deepEqual(billingOrganisationsTools.map((t) => t.name).sort(), [
    "uiiq_admin_billing_org_list", "uiiq_admin_billing_org_update",
    "uiiq_billing_org_connect_start", "uiiq_billing_org_create", "uiiq_billing_org_delete", "uiiq_billing_org_list", "uiiq_billing_org_update",
  ]);
});

test("changing tools say Owner only and take no tenant", () => {
  for (const name of CHANGING) {
    assert.match(tool(name).description, /^Owner only:/, name);
    assert.equal("tenant" in tool(name).inputSchema.properties, false, name);
  }
});

test("create, connect and remove are dry runs without confirm: true, and call nothing", async () => {
  for (const [name, args] of [
    ["uiiq_billing_org_create", { legalName: "Streetbeat College", statementDescriptor: "STREETBEAT COLLEGE", isCharity: true }],
    ["uiiq_billing_org_connect_start", { id: "bo_college" }],
    ["uiiq_billing_org_delete", { id: "bo_college" }],
  ]) {
    const out = await tool(name).handler(args);
    assert.equal(out.dryRun, true, name);
    assert.equal(out.changed, false, name);
    assert.match(tool(name).description, /Without confirm: true it is ALWAYS a dry run/, name);
  }
});

test("the platform admin tools are SUPER_ADMIN and say so", () => {
  for (const name of ["uiiq_admin_billing_org_list", "uiiq_admin_billing_org_update"]) {
    assert.match(tool(name).description, /SUPER_ADMIN/, name);
  }
});
