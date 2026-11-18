import { apiClient } from "../auth.js";

// NX2U live shopping fees (UiiQ lib/live-fees): a workspace's percentage on live-show sales and flat fee per show,
// its "Live shopping for retailers" switch, and its monthly statements. Statements only: nothing here charges,
// finalises, sends or invoices anything, and UiiQ has no draft-invoice path for a statement.
//
// Every uiiq_admin_live_fee* tool is a platform admin's (SUPER_ADMIN, checked live by UiiQ on every call, reads
// included), and runs as the signed-in operator: none takes `tenant`, so none impersonates. The platform's
// "invoicing enabled" switch is NOT settable here: a person sets it in UiiQ's admin (Steve's call).
const api = () => apiClient();
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const PERIOD = { type: "string", description: "The month, YYYY-MM (Europe/London)." };
const enc = encodeURIComponent;

async function ok(res) {
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const liveFeesTools = [
  {
    name: "uiiq_admin_live_fees_get",
    description:
      "A workspace's live shopping fees: liveSaleBps (the percentage on live-show sales before VAT, basis points, 1000 = 10%), showFeePence (flat fee per show) and retailerLiveEnabled ('Live shopping for retailers'), with the defaults (0, 0, off) and the platform's window settings. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: { type: "string" } } },
    async handler({ tenantId }) {
      return ok(await api()(`/admin/tenants/${enc(tenantId)}/live-fees`));
    },
  },
  {
    name: "uiiq_admin_live_fees_set",
    description:
      "Set a workspace's live shopping fees: liveSaleBps (0 to 10000; 1000 = 10% of the sale before VAT), showFeePence (pence), retailerLiveEnabled (true/false). Only the fields given change; each change is audited. SUPER_ADMIN only. Charges nothing.",
    inputSchema: {
      type: "object",
      required: ["tenantId"],
      properties: {
        tenantId: { type: "string" },
        liveSaleBps: { type: "integer", minimum: 0, maximum: 10000 },
        showFeePence: { type: "integer", minimum: 0 },
        retailerLiveEnabled: { type: "boolean" },
      },
    },
    async handler({ tenantId, liveSaleBps, showFeePence, retailerLiveEnabled }) {
      const body = {};
      if (liveSaleBps !== undefined) body.liveSaleBps = liveSaleBps;
      if (showFeePence !== undefined) body.showFeePence = showFeePence;
      if (retailerLiveEnabled !== undefined) body.retailerLiveEnabled = retailerLiveEnabled;
      return ok(await api()(`/admin/tenants/${enc(tenantId)}/live-fees`, { method: "PATCH", body: JSON.stringify(body) }));
    },
  },
  {
    name: "uiiq_admin_live_fees_platform_get",
    description:
      "The platform's live-fee settings: invoicingEnabled (off; no draft-invoice path exists, so it moves no money), showLengthMinutes (a show's length for its window, default 60) and graceMinutes (after the planned end, default 60). SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return ok(await api()("/admin/live-fees/settings"));
    },
  },
  {
    name: "uiiq_admin_live_fees_platform_set",
    description:
      "Set the platform's live-fee window: showLengthMinutes (5 to 720) and graceMinutes (0 to 1440). Audited. SUPER_ADMIN only. The 'invoicing enabled' switch is not settable from here: a person sets it in UiiQ's admin.",
    inputSchema: {
      type: "object",
      properties: { showLengthMinutes: { type: "integer", minimum: 5, maximum: 720 }, graceMinutes: { type: "integer", minimum: 0, maximum: 1440 } },
    },
    async handler({ showLengthMinutes, graceMinutes } = {}) {
      const body = {};
      if (showLengthMinutes !== undefined) body.showLengthMinutes = showLengthMinutes;
      if (graceMinutes !== undefined) body.graceMinutes = graceMinutes;
      if (Object.keys(body).length === 0) throw new Error("Give showLengthMinutes or graceMinutes");
      return ok(await api()("/admin/live-fees/settings", { method: "PATCH", body: JSON.stringify(body) }));
    },
  },
  {
    name: "uiiq_admin_live_fee_statements",
    description: "A workspace's live-fee statements, newest first (period, OPEN or CLOSED, totals), with the last closed and the next that may close. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: { type: "string" } } },
    async handler({ tenantId }) {
      return ok(await api()(`/admin/tenants/${enc(tenantId)}/live-fees/statements`));
    },
  },
  {
    name: "uiiq_admin_live_fee_statement_get",
    description:
      "One month's live-fee statement for a workspace: a CLOSED month as it was closed, an open one worked out now (sales from the final orders, shows, adjustments to closed months, totals, and what stops it closing). format 'csv' returns the CSV text. SUPER_ADMIN only.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "period"],
      properties: { tenantId: { type: "string" }, period: PERIOD, format: { type: "string", enum: ["json", "csv"] } },
    },
    async handler({ tenantId, period, format }) {
      const path = `/admin/tenants/${enc(tenantId)}/live-fees/statements/${enc(period)}`;
      const res = await api()(format === "csv" ? `${path}?format=csv` : path);
      if (!res.ok) throw new Error(await res.text());
      return format === "csv" ? { csv: await res.text() } : res.json();
    },
  },
  {
    name: "uiiq_admin_live_fee_statement_close",
    description:
      "CLOSE a workspace's live-fee statement for a month: every line and total is written and frozen for good (UiiQ refuses any later change; a later refund becomes an adjustment on the next month). Refused while the month isn't over or an earlier month is still open. confirm must repeat the period. A person's decision: closing can't be undone. Charges, invoices and sends nothing. SUPER_ADMIN only.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "period", "confirm"],
      properties: { tenantId: { type: "string" }, period: PERIOD, confirm: { type: "string", description: "The period again, to confirm." } },
    },
    async handler({ tenantId, period, confirm }) {
      if (confirm !== period) throw new Error("confirm must repeat the period exactly");
      return ok(await api()(`/admin/tenants/${enc(tenantId)}/live-fees/statements/${enc(period)}/close`, { method: "POST", body: JSON.stringify({ confirm }) }));
    },
  },
  {
    name: "uiiq_admin_live_fee_manual_show_add",
    description:
      "Add a show to a workspace's OPEN live-fee month by hand (one NX2U didn't stream, such as YouTube only), with a reason. Only when NX2U counted no show that month. Audited. SUPER_ADMIN only.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "period", "title", "showAt", "reason"],
      properties: {
        tenantId: { type: "string" },
        period: PERIOD,
        title: { type: "string", maxLength: 200 },
        showAt: { type: "string", description: "When the show was, ISO 8601, inside the period." },
        reason: { type: "string", maxLength: 500 },
      },
    },
    async handler({ tenantId, period, title, showAt, reason }) {
      return ok(await api()(`/admin/tenants/${enc(tenantId)}/live-fees/statements/${enc(period)}/manual-shows`, { method: "POST", body: JSON.stringify({ title, showAt, reason }) }));
    },
  },
  {
    name: "uiiq_admin_live_fee_manual_show_remove",
    description: "Take a manual show line off a workspace's live-fee month while it is still open. Audited. SUPER_ADMIN only.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "period", "lineId"],
      properties: { tenantId: { type: "string" }, period: PERIOD, lineId: { type: "string" } },
    },
    async handler({ tenantId, period, lineId }) {
      return ok(await api()(`/admin/tenants/${enc(tenantId)}/live-fees/statements/${enc(period)}/manual-shows/${enc(lineId)}`, { method: "DELETE" }));
    },
  },
  {
    name: "uiiq_billing_live_fees",
    description:
      "The workspace's own live shopping statements, read-only: CLOSED months only, and only while 'Live shopping for retailers' is on for it (otherwise not found). Owner or admin. A statement, not an invoice.",
    inputSchema: { type: "object", properties: { period: PERIOD, tenant: TENANT_PROP } },
    async handler({ period, tenant } = {}) {
      const qs = period ? `?period=${enc(period)}` : "";
      return ok(await apiClient(tenant ? { tenant } : {})(`/billing/live-fees${qs}`));
    },
  },
];
