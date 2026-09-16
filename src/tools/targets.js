import { apiClient } from "../auth.js";

// Every tool takes an optional `tenant` (id, slug or exact name). Without it the
// call lands in whatever tenant the stored login belongs to; with it the client
// impersonates that tenant for that one call (SUPER_ADMIN only — see auth.js).
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

async function body(res) {
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// TARGETS BOARD — every product's target against its actual, per week, month or
// fiscal year, coloured by pace (100%+ exceeding, 85–99% close, under 85% behind).
// The targets ARE the business plan's revenue forecast (one "stream" per
// product, monthly figures on Business Plan → Forecast → Revenue); actuals come
// from sources on each stream (UIIQ sales, a WooCommerce shop, figures entered
// by hand, IQEX credit sales). The wall screen is a TARGETS token board — mint
// one with uiiq_display_board_create kind=TARGETS. Every route is gated by the
// tenant's `targets_board` feature; writes are admin-grade.
export const targetsTools = [
  {
    name: "uiiq_targets_board",
    description:
      "The targets board as the signed-in dashboard sees it: tiles grouped by company, each with target, expected-by-today, actual, % of pace and a state (EXCEEDING / CLOSE / BEHIND / NOT_STARTED / PRE_LAUNCH 'Launches <month>' / IN_RND / NO_TARGET / NO_DATA '?' = no working feed), plus company and overall totals. `period` week | month | year (fiscal); `date` YYYY-MM-DD picks which one (default today, London). Pence throughout. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["week", "month", "year"], description: "Default month" },
        date: { type: "string", description: "YYYY-MM-DD inside the period to show; default today" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ period, date, tenant } = {}) {
      const q = new URLSearchParams();
      if (period) q.set("period", period);
      if (date) q.set("date", date);
      return body(await api(tenant)(`/targets/board${q.size ? `?${q}` : ""}`));
    },
  },
  {
    name: "uiiq_targets_streams",
    description:
      "Every product line (revenue stream) on the tenant's business plan with its board settings — onBoard, boardLabel, groupLabel (company), measure (REVENUE / FEE_INCOME / UNITS), colour, position, stage (null = live, NOT_LAUNCHED, RND), launchMonth — this fiscal year's target in pence, and its sources with their health (lastSuccessAt / lastError; secrets never included). Returns { plan, streams }. Read-only.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return body(await api(tenant)("/targets/streams"));
    },
  },
  {
    name: "uiiq_targets_stream_create",
    description:
      "Add a product line to the tenant's business plan (creating the plan if it has none); it goes on the board. Type its monthly targets afterwards with uiiq_targets_stream_update `monthly`, or on Business Plan → Forecast → Revenue. Admin-grade.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Product name, up to 120 characters" },
        boardLabel: { type: "string", description: "Shorter tile name, up to 40 characters" },
        groupLabel: { type: "string", description: "Company / group the tile sits under, up to 80 characters" },
        measure: { type: "string", enum: ["REVENUE", "FEE_INCOME", "UNITS"], description: "Default REVENUE" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ name, boardLabel, groupLabel, measure, tenant } = {}) {
      return body(await api(tenant)("/targets/streams", { method: "POST", body: JSON.stringify({ name, boardLabel, groupLabel, measure }) }));
    },
  },
  {
    name: "uiiq_targets_stream_update",
    description:
      "Change one product line's board settings. Only the fields you pass change. `stage`: null = live (shows its figures), 'NOT_LAUNCHED' (tile says 'Launches <month>' whatever the numbers; its target still counts in totals), 'RND' (tile says 'In R&D'). `launchMonth` YYYY-MM, or null to derive it from the first month with a target. `monthly` { 'YYYY-MM': pence } is merged into the targets (null removes a month) — these ARE the business plan's revenue forecast. `colour` #rrggbb or null. Admin-grade.",
    inputSchema: {
      type: "object",
      required: ["streamId"],
      properties: {
        streamId: { type: "string" },
        onBoard: { type: "boolean" },
        boardLabel: { type: ["string", "null"] },
        groupLabel: { type: ["string", "null"] },
        colour: { type: ["string", "null"], description: "#rrggbb or null" },
        measure: { type: "string", enum: ["REVENUE", "FEE_INCOME", "UNITS"] },
        position: { type: "number", description: "Whole number, board order" },
        stage: { type: ["string", "null"], enum: ["NOT_LAUNCHED", "RND", null] },
        launchMonth: { type: ["string", "null"], description: "YYYY-MM or null" },
        monthly: { type: "object", description: "{ 'YYYY-MM': pence | null } merged into the monthly targets", additionalProperties: { type: ["number", "null"] } },
        tenant: TENANT_PROP,
      },
    },
    async handler({ streamId, tenant, ...fields } = {}) {
      const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      return body(await api(tenant)(`/targets/streams/${encodeURIComponent(streamId)}`, { method: "PATCH", body: JSON.stringify(patch) }));
    },
  },
  {
    name: "uiiq_targets_manual_figure",
    description:
      "Type an actual figure into a MANUAL ('Entered by hand') source. `period` day | week | month: a week or month figure is spread evenly over that period's days and REPLACES what was there. `value` in pence (or units for a UNITS stream). Uploaded past-figure sources refuse this — upload the file again instead. Admin-grade: this is what the screen shows as revenue.",
    inputSchema: {
      type: "object",
      required: ["sourceId", "date", "value"],
      properties: {
        sourceId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD (for week/month: any day inside it)" },
        period: { type: "string", enum: ["day", "week", "month"], description: "Default day" },
        value: { type: "number", description: "Pence, or units for a UNITS stream; 0 or more" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ sourceId, date, period, value, tenant } = {}) {
      return body(await api(tenant)("/targets/manual", { method: "POST", body: JSON.stringify({ sourceId, date, period, value }) }));
    },
  },
  {
    name: "uiiq_targets_source_add",
    description:
      "Add where a product line's actual comes from. `kind`: UIIQ_TENANT (this workspace's till / bookings / hosted-shop / membership sales; `config.include` toggles each), WOO_SHOP (a WooCommerce shop's sales sent by UiiQ Connect, goods only, less refunds), MANUAL (figures entered by hand), IQEX_CREDITS (IQ Labs' platform credit sales — SuperAdmin only, and only on a workspace with the targets_iqex_credits feature). Stripe and Xero are not available yet. A source can only read this venue's own sales. Admin-grade.",
    inputSchema: {
      type: "object",
      required: ["streamId", "kind"],
      properties: {
        streamId: { type: "string" },
        kind: { type: "string", enum: ["UIIQ_TENANT", "WOO_SHOP", "MANUAL", "IQEX_CREDITS"] },
        label: { type: "string", description: "Optional name for the source, up to 80 characters" },
        config: { type: "object", description: "Kind-specific settings, e.g. UIIQ_TENANT { include: { till, bookings, shop, memberships } }" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ streamId, kind, label, config, tenant } = {}) {
      return body(await api(tenant)("/targets/sources", { method: "POST", body: JSON.stringify({ streamId, kind, label, config }) }));
    },
  },
  {
    name: "uiiq_targets_source_update",
    description:
      "Rename a source, change its settings, or pause / resume it (`active`). A paused source's figures stop counting on the board. The kind can't change — add a new source instead. Admin-grade.",
    inputSchema: {
      type: "object",
      required: ["sourceId"],
      properties: {
        sourceId: { type: "string" },
        label: { type: ["string", "null"] },
        config: { type: "object" },
        active: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ sourceId, tenant, ...fields } = {}) {
      const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      return body(await api(tenant)(`/targets/sources/${encodeURIComponent(sourceId)}`, { method: "PATCH", body: JSON.stringify(patch) }));
    },
  },
  {
    name: "uiiq_targets_source_remove",
    description:
      "Remove a source AND every daily figure it recorded (cannot be undone). To stop it counting but keep its figures, pause it with uiiq_targets_source_update active=false instead. Admin-grade.",
    inputSchema: {
      type: "object",
      required: ["sourceId"],
      properties: { sourceId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ sourceId, tenant } = {}) {
      return body(await api(tenant)(`/targets/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" }));
    },
  },
  {
    name: "uiiq_targets_source_test",
    description:
      "The 'Test' button: read yesterday's and today's figure from a source WITHOUT storing anything, to prove a feed works before it feeds the screen. Returns { ok, yesterday: { date, value }, today: { date, value } } in pence, or { ok: false, error }.",
    inputSchema: {
      type: "object",
      required: ["sourceId"],
      properties: { sourceId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ sourceId, tenant } = {}) {
      return body(await api(tenant)(`/targets/sources/${encodeURIComponent(sourceId)}/test`, { method: "POST" }));
    },
  },
];
