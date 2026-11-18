import { apiClient } from "../auth.js";

// NX2U live shopping fees (UiiQ lib/live-fees): a workspace's percentage on live-show sales and flat fee per show,
// its "Live shopping for retailers" switch, and its monthly statements. Statements only: nothing here charges,
// finalises, sends or invoices anything, and UiiQ has no draft-invoice path for a statement.
//
// Every uiiq_admin_live_fee* tool is a platform admin's (SUPER_ADMIN, checked live by UiiQ on every call, reads
// included), and runs as the signed-in operator: none takes `tenant`, so none impersonates (UiiQ refuses a live-fee
// write while impersonating anyway). What only a person may do is not here (Lucas R159-07, R159-08):
//   - closing a month (it freezes the month for good): the admin UI, or `uiiq live-fees close --yes`;
//   - a correction of any amount on a statement: the admin UI, or `uiiq live-fees adjust --yes`;
//   - a rate above the platform's soft ceiling (UiiQ answers 409 needsConfirmHigh): the admin UI or the CLI;
//   - the platform's "invoicing enabled" switch and the soft ceilings themselves: the admin UI.
const api = () => apiClient();
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const PERIOD = { type: "string", description: "The month, YYYY-MM (Europe/London)." };
const REASON = { type: "string", maxLength: 500, description: "Why, in one line (kept with the line and in UiiQ's audit log; the workspace doesn't see it)." };
const enc = encodeURIComponent;

async function ok(res) {
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const liveFeesTools = [
  {
    name: "uiiq_admin_live_fees_get",
    description:
      "A workspace's live shopping fees: liveSaleBps (the percentage on live-show sales before VAT, basis points, 1000 = 10%), showFeePence (flat fee per show) and retailerLiveEnabled ('Live shopping for retailers'), with the defaults (0, 0, off), the rate history (each sale is charged at the rate in force when it was ordered) and the platform's window settings. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: { type: "string" } } },
    async handler({ tenantId }) {
      return ok(await api()(`/admin/tenants/${enc(tenantId)}/live-fees`));
    },
  },
  {
    name: "uiiq_admin_live_fees_set",
    description:
      "Set a workspace's live shopping fees: liveSaleBps (0 to 10000; 1000 = 10% of the sale before VAT), showFeePence (pence), retailerLiveEnabled (true/false). Only the fields given change, from now on (never back over a month); each change is audited. A rate above the platform's soft ceiling (20% or £500 a show by default) is refused with needsConfirmHigh: a person confirms it in the admin UI or the CLI, not this tool. SUPER_ADMIN only. Charges nothing.",
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
      "The platform's live-fee settings: invoicingEnabled (off; no draft-invoice path exists, so it moves no money), showLengthMinutes (a show's length when neither the planner nor its mark has one, default 60), graceMinutes (after a show's planned end, default 60) and the soft ceilings (20%, £500 a show), with their history. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return ok(await api()("/admin/live-fees/settings"));
    },
  },
  {
    name: "uiiq_admin_live_fees_platform_set",
    description:
      "Set the platform's live-fee window: showLengthMinutes (5 to 720) and graceMinutes (0 to 1440), from now on. Audited. SUPER_ADMIN only. The 'invoicing enabled' switch and the soft ceilings are not settable from here: a person sets them in UiiQ's admin.",
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
      "One month's live-fee statement for a workspace: a CLOSED month as it was closed, an open one worked out now (sales from the final orders at the rate in force when each was ordered, shows, adjustments to closed months, corrections, totals; what stops it closing, what closing asks a person's reason for, and what to check). format 'csv' returns the CSV text. Reading only: closing is a person's act. SUPER_ADMIN only.",
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
    name: "uiiq_admin_live_fee_manual_show_add",
    description:
      "Add a show to a workspace's OPEN live-fee month by hand (one NX2U didn't stream, such as YouTube only), with a reason. Audited. If NX2U also counted a show that month, closing asks a person why both count. SUPER_ADMIN only.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "period", "title", "showAt", "reason"],
      properties: {
        tenantId: { type: "string" },
        period: PERIOD,
        title: { type: "string", maxLength: 200 },
        showAt: { type: "string", description: "When the show was, ISO 8601, inside the period." },
        reason: REASON,
      },
    },
    async handler({ tenantId, period, title, showAt, reason }) {
      const body = { kind: "MANUAL_SHOW", title, showAt, reason };
      return ok(await api()(`/admin/tenants/${enc(tenantId)}/live-fees/statements/${enc(period)}/lines`, { method: "POST", body: JSON.stringify(body) }));
    },
  },
  {
    name: "uiiq_admin_live_fee_show_exclude",
    description:
      "Exclude one of the workspace's NX2U shopping shows from its OPEN live-fee month, with a reason (a restarted stream counted twice, a rehearsal): it is kept on the statement and not charged. Audited; comes off again with uiiq_admin_live_fee_line_remove. SUPER_ADMIN only.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "period", "nx2uEventId", "reason"],
      properties: { tenantId: { type: "string" }, period: PERIOD, nx2uEventId: { type: "string", description: "The NX2U event's id, as the statement lists it." }, reason: REASON },
    },
    async handler({ tenantId, period, nx2uEventId, reason }) {
      const body = { kind: "EXCLUDE_SHOW", nx2uEventId, reason };
      return ok(await api()(`/admin/tenants/${enc(tenantId)}/live-fees/statements/${enc(period)}/lines`, { method: "POST", body: JSON.stringify(body) }));
    },
  },
  {
    name: "uiiq_admin_live_fee_line_remove",
    description: "Take a line a platform admin added (a manual show, an exclusion, a correction) off a workspace's live-fee month while it is still open. Audited. SUPER_ADMIN only.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "period", "lineId"],
      properties: { tenantId: { type: "string" }, period: PERIOD, lineId: { type: "string" } },
    },
    async handler({ tenantId, period, lineId }) {
      return ok(await api()(`/admin/tenants/${enc(tenantId)}/live-fees/statements/${enc(period)}/lines/${enc(lineId)}`, { method: "DELETE" }));
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
