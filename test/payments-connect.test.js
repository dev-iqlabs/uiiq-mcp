// node --test — the payments connect and integrations tools say who may use them
// (UiiQ-platform #879, #881): STAFF read only the flags and get 403 on writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminPlatformTools } from "../src/tools/admin-platform.js";
import { integrationsTools } from "../src/tools/integrations.js";

const describe = (tools, name) => tools.find((t) => t.name === name).description;

test("connect_get says STAFF get only the flags and canManage:false", () => {
  const d = describe(adminPlatformTools, "uiiq_admin_payments_connect_get");
  assert.match(d, /STAFF get only chargesEnabled and payoutsEnabled/);
  assert.match(d, /canManage/);
  assert.doesNotMatch(d, /^The workspace's connected payment account \(Stripe or PayPal\): provider, account id/);
});

test("connect start and update are OWNER/ADMIN only", () => {
  for (const name of ["uiiq_admin_payments_connect_start", "uiiq_admin_payments_connect_update"]) {
    assert.match(describe(adminPlatformTools, name), /OWNER\/ADMIN only; STAFF and read-only impersonation get 403/, name);
  }
});

test("integration writes and Xero reads are OWNER/ADMIN only", () => {
  for (const name of ["uiiq_integrations_add", "uiiq_integrations_delete", "uiiq_integrations_sync", "uiiq_integrations_posm_sync", "uiiq_integrations_xero_accounts", "uiiq_integrations_xero_financials"]) {
    assert.match(describe(integrationsTools, name), /OWNER\/ADMIN only/, name);
  }
});
