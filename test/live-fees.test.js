// node --test — the NX2U live shopping fee tools (UiiQ lib/live-fees). Each calls its route (UiiQ's
// scripts/client-coverage.mjs scans this source for the paths); the money ones are the operator's own and never
// impersonate; what only a person may do (close a month, add a correction, confirm a high rate, switch invoicing on,
// move the soft ceilings) is not here (Lucas R159-07, R159-08); and none reaches a payment service.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { liveFeesTools } from "../src/tools/live-fees.js";

const SRC = readFileSync(new URL("../src/tools/live-fees.js", import.meta.url), "utf8");
const CODE = SRC.replace(/^\s*\/\/.*$/gm, "");
const tool = (name) => liveFeesTools.find((t) => t.name === name);

test("every route a tool may call has its tool", () => {
  for (const path of [
    "/admin/tenants/${enc(tenantId)}/live-fees`",
    "/admin/live-fees/settings",
    "/admin/tenants/${enc(tenantId)}/live-fees/statements`",
    "/admin/tenants/${enc(tenantId)}/live-fees/statements/${enc(period)}`",
    "/live-fees/statements/${enc(period)}/lines`",
    "/live-fees/statements/${enc(period)}/lines/${enc(lineId)}`",
    "/billing/live-fees",
  ]) assert.ok(SRC.includes(path), path);
  assert.deepEqual(liveFeesTools.map((t) => t.name), [
    "uiiq_admin_live_fees_get", "uiiq_admin_live_fees_set", "uiiq_admin_live_fees_platform_get", "uiiq_admin_live_fees_platform_set",
    "uiiq_admin_live_fee_statements", "uiiq_admin_live_fee_statement_get", "uiiq_admin_live_fee_manual_show_add", "uiiq_admin_live_fee_show_exclude",
    "uiiq_admin_live_fee_line_remove", "uiiq_billing_live_fees",
  ]);
});

test("closing a month is not a tool: it freezes the month for good, so it is a person's act (Lucas R159-07)", () => {
  assert.equal(liveFeesTools.some((t) => /close/.test(t.name)), false);
  assert.ok(!/\/close\b/.test(CODE));
});

test("a correction of any amount, a high-rate confirmation and the soft ceilings are not sent from here (R159-02, R159-08)", async () => {
  assert.ok(!/ADJUSTMENT|confirmHigh|softMax/.test(CODE));
  assert.deepEqual(Object.keys(tool("uiiq_admin_live_fees_set").inputSchema.properties).sort(), ["liveSaleBps", "retailerLiveEnabled", "showFeePence", "tenantId"]);
});

test("the admin tools are SUPER_ADMIN only, and never take a tenant to impersonate", () => {
  for (const t of liveFeesTools.filter((x) => x.name.startsWith("uiiq_admin_live_fee"))) {
    assert.match(t.description, /SUPER_ADMIN only/, t.name);
    assert.equal(t.inputSchema.properties.tenant, undefined, t.name);
  }
});

test("invoicing can't be switched on from the MCP", async () => {
  const t = tool("uiiq_admin_live_fees_platform_set");
  assert.deepEqual(Object.keys(t.inputSchema.properties).sort(), ["graceMinutes", "showLengthMinutes"]);
  await assert.rejects(t.handler({ invoicingEnabled: true }), /Give showLengthMinutes or graceMinutes/);
  assert.ok(!/invoicingEnabled\s*=|body\.invoicingEnabled/.test(SRC));
});

test("the line tools send only their own kind", () => {
  assert.match(SRC, /kind: "MANUAL_SHOW", title, showAt, reason/);
  assert.match(SRC, /kind: "EXCLUDE_SHOW", nx2uEventId, reason/);
  assert.deepEqual(tool("uiiq_admin_live_fee_show_exclude").inputSchema.required, ["tenantId", "period", "nx2uEventId", "reason"]);
});

test("it reaches nothing but UiiQ's live-fee routes: no other import, no fetch, no other path", () => {
  assert.deepEqual([...SRC.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]), ["../auth.js"]);
  assert.ok(!/\bfetch\s*\(/.test(SRC));
  const paths = [...SRC.matchAll(/[`"](\/[^`"\s]*)[`"]/g)].map((m) => m[1]);
  assert.ok(paths.length >= 9, String(paths.length));
  for (const p of paths) assert.match(p, /^\/(admin\/tenants\/\$\{enc\(tenantId\)\}\/live-fees|admin\/live-fees\/settings|billing\/live-fees)/, p);
});
