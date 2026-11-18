// node --test — the NX2U live shopping fee tools (UiiQ lib/live-fees). Each calls its route (UiiQ's
// scripts/client-coverage.mjs scans this source for the paths); the money ones are the operator's own and never
// impersonate; none can switch invoicing on; and none reaches a payment service.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { liveFeesTools } from "../src/tools/live-fees.js";

const SRC = readFileSync(new URL("../src/tools/live-fees.js", import.meta.url), "utf8");
const tool = (name) => liveFeesTools.find((t) => t.name === name);

test("every route has its tool", () => {
  for (const path of [
    "/admin/tenants/${enc(tenantId)}/live-fees`",
    "/admin/live-fees/settings",
    "/admin/tenants/${enc(tenantId)}/live-fees/statements`",
    "/admin/tenants/${enc(tenantId)}/live-fees/statements/${enc(period)}",
    "/live-fees/statements/${enc(period)}/close`",
    "/live-fees/statements/${enc(period)}/manual-shows`",
    "/live-fees/statements/${enc(period)}/manual-shows/${enc(lineId)}`",
    "/billing/live-fees",
  ]) assert.ok(SRC.includes(path), path);
  assert.equal(liveFeesTools.length, 10);
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

test("closing needs the period typed back, before anything is sent", async () => {
  const t = tool("uiiq_admin_live_fee_statement_close");
  assert.deepEqual(t.inputSchema.required, ["tenantId", "period", "confirm"]);
  await assert.rejects(t.handler({ tenantId: "t", period: "2026-11", confirm: "2026-10" }), /confirm must repeat the period/);
});

test("it reaches nothing but UiiQ's live-fee routes: no other import, no fetch, no other path", () => {
  assert.deepEqual([...SRC.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]), ["../auth.js"]);
  assert.ok(!/\bfetch\s*\(/.test(SRC));
  const paths = [...SRC.matchAll(/[`"](\/[^`"\s]*)[`"]/g)].map((m) => m[1]);
  assert.ok(paths.length >= 10, String(paths.length));
  for (const p of paths) assert.match(p, /^\/(admin\/tenants\/\$\{enc\(tenantId\)\}\/live-fees|admin\/live-fees\/settings|billing\/live-fees)/, p);
});
