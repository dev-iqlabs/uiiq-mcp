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

test("charity: the owner claims, a platform admin verifies (only then the reduced fee)", () => {
  assert.match(tool("uiiq_admin_billing_org_update").description, /VERIFY the owner's charity/);
  assert.ok("charityVerified" in tool("uiiq_admin_billing_org_update").inputSchema.properties);
  assert.equal("charityVerified" in tool("uiiq_billing_org_update").inputSchema.properties, false);
  assert.match(tool("uiiq_billing_org_create").inputSchema.properties.isCharity.description, /only once a platform admin verifies it/);
});

test("admin: verifying charity or changing fee terms is a dry run without confirm: true, and calls nothing (Lucas #899 L2)", async () => {
  const admin = tool("uiiq_admin_billing_org_update");
  const seen = { charityVerified: true, expectedLegalName: "Streetbeat College", expectedCharityNumber: "1234567" };
  for (const change of [seen, { ...seen, expectedCharityNumber: null }, { applicationFeePercent: 1.5 }, { passFeesToCustomer: false }, { active: true, applicationFeePercent: 0 }]) {
    const out = await admin.handler({ tenantId: "sbda", orgId: "bo_college", ...change });
    assert.equal(out.dryRun, true, JSON.stringify(change));
    assert.equal(out.changed, false);
    assert.deepEqual(out.change, change);
  }
  assert.ok("confirm" in admin.inputSchema.properties);
  assert.match(admin.description, /without confirm: true a call with any of them is ALWAYS a dry run/);
});

test("admin: verifying carries the claim that was checked, or is refused before anything is sent (UiiQ-platform #899 L1)", async () => {
  const admin = tool("uiiq_admin_billing_org_update");
  const props = admin.inputSchema.properties;
  assert.ok("expectedLegalName" in props && "expectedCharityNumber" in props);
  assert.deepEqual(props.expectedCharityNumber.type, ["string", "null"]);
  assert.match(admin.description, /MUST carry the claim you checked/);
  let called = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ((called = true), new Response("{}"));
  try {
    for (const partial of [{}, { expectedLegalName: "Streetbeat College" }, { expectedCharityNumber: "1234567" }]) {
      await assert.rejects(admin.handler({ tenantId: "sbda", orgId: "bo_college", charityVerified: true, confirm: true, ...partial }), /send what you checked/);
    }
    assert.equal(called, false, "nothing reached UIIQ");
    // Un-verifying needs no claim.
    const out = await admin.handler({ tenantId: "sbda", orgId: "bo_college", charityVerified: false, confirm: true }).catch((e) => e);
    assert.doesNotMatch(String(out?.message ?? ""), /send what you checked/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("admin: switching off takes a reason the owner sees, and only an admin switches it back on", () => {
  const admin = tool("uiiq_admin_billing_org_update");
  assert.ok("reason" in admin.inputSchema.properties);
  assert.match(admin.description, /the owner can't switch it back on/);
  assert.match(tool("uiiq_billing_org_update").description, /switched off by UiiQ .* can't be switched back on here \(409/);
});

test("the platform admin tools are SUPER_ADMIN and say so", () => {
  for (const name of ["uiiq_admin_billing_org_list", "uiiq_admin_billing_org_update"]) {
    assert.match(tool(name).description, /SUPER_ADMIN/, name);
  }
});
