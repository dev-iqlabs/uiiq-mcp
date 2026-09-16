import { apiClient } from "../auth.js";

// Every tool takes an optional `tenant` (id, slug or exact name). Without it the
// call lands in whatever tenant the stored login belongs to; with it the client
// impersonates that tenant for that one call (SUPER_ADMIN only — see auth.js),
// riding the official impersonation audit trail.
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

// These handlers come from a factory rather than being written out per tool, so
// the tenant is threaded through the returned handler's own arguments.
const get = (route) => async ({ tenant } = {}) => {
  const res = await api(tenant)(route);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const SCHEMA = { type: "object", properties: { tenant: TENANT_PROP } };

export const planTools = [
  // /plan/estimates never existed (404). The projections/estimates live in the
  // P&L, so this is repointed to /plan/statements (same source as
  // uiiq_plan_statements) rather than left dead.
  { name: "uiiq_plan_estimates", description: "Business plan — revenue estimates & projections (from the P&L statements).", inputSchema: SCHEMA, handler: get("/plan/statements") },
  { name: "uiiq_plan_revenue", description: "Business plan — planned vs actual revenue breakdown.", inputSchema: SCHEMA, handler: get("/plan/revenue") },
  { name: "uiiq_plan_expenses", description: "Business plan — expense categories and totals.", inputSchema: SCHEMA, handler: get("/plan/expenses") },
  { name: "uiiq_plan_milestones", description: "Business plan — milestones.", inputSchema: SCHEMA, handler: get("/plan/milestones") },
  { name: "uiiq_plan_personnel", description: "Business plan — team headcount and cost plan.", inputSchema: SCHEMA, handler: get("/plan/personnel") },
  { name: "uiiq_plan_statements", description: "Business plan — profit & loss statements.", inputSchema: SCHEMA, handler: get("/plan/statements") },
  { name: "uiiq_plan_assets", description: "Business plan — asset register (capital items with purchase cost/month and useful life; the targets for capital-bill linking in cost tracking).", inputSchema: SCHEMA, handler: get("/plan/assets") },
  {
    name: "uiiq_plan_revenue_from_actuals",
    description:
      "Start a fiscal year of the revenue forecast from actuals: each product's month = the targets board's actual for the same month a year earlier × (1 + upliftPct/100), rounded. Only months with NO figure are filled unless overwrite=true; a typed 0 counts as a figure and a blank stays a gap. Months with no actual are never written; a negative month fills as 0. Actuals come from ACTIVE sources only (uploaded past figures count), as the board counts them. " +
      "`targetYear` is the year the fiscal year STARTS (a September plan's 2027 = Sep 2027–Aug 2028, filled from Sep 2026–Aug 2027). Pence, or counts for a UNITS product (`measures` says which). " +
      "Without apply=true NOTHING is written: you get per product-month fill / overwrite / keep (has a figure, overwrite off) / same, plus products with no actuals. These figures ARE the targets board's targets, so apply=true changes what the board shows; it re-works the plan and writes in one transaction. " +
      "Needs the targets_board feature (403 without). Preview: anyone who can edit the forecast. apply=true: OWNER / ADMIN only; STAFF get 403 \"You don't have permission to do that.\" — preview still works for them.",
    inputSchema: {
      type: "object",
      properties: {
        targetYear: { type: "integer", description: "Year the fiscal year to fill starts in, e.g. 2027." },
        upliftPct: { type: "number", description: "Percent added to last year's actuals, -90 to 500. Default 0." },
        overwrite: { type: "boolean", description: "Also replace months that already have a figure. Default false." },
        apply: { type: "boolean", description: "Write the fills. Default false (preview only). Owner/admin only." },
        tenant: TENANT_PROP,
      },
      required: ["targetYear"],
    },
    async handler({ targetYear, upliftPct = 0, overwrite = false, apply = false, tenant } = {}) {
      if (!Number.isInteger(targetYear)) throw new Error("targetYear must be the year the fiscal year starts, e.g. 2027.");
      const res = await api(tenant)("/plan/revenue/from-actuals", { method: "POST", body: JSON.stringify({ targetYear, upliftPct, overwrite, apply }) });
      if (res.status === 403) {
        const why = await res.text();
        throw new Error(apply
          ? `403: ${why} Filling targets needs OWNER or ADMIN (and the targets_board feature); run without apply to preview.`
          : `403: ${why} The targets_board feature may be off for this workspace, or the session is read-only.`);
      }
      if (!res.ok) throw new Error(await res.text());
      const r = await res.json();
      // Up to 12 months per product: totals per product plus the item list.
      const byProduct = {};
      for (const i of r.items ?? []) {
        if (i.status !== "fill" && i.status !== "overwrite") continue;
        const p = (byProduct[i.product] ??= { measure: r.measures?.[i.streamId], months: [], before: 0, after: 0 });
        p.months.push(i.targetMonth);
        p.before += i.current ?? 0;
        p.after += i.value;
      }
      return {
        applied: r.applied,
        targetStartYear: r.targetStartYear,
        sourceStartYear: r.sourceStartYear,
        fiscalYearStart: r.fiscalYearStart,
        upliftPct: r.upliftPct,
        overwrite: r.overwrite,
        counts: r.counts,
        toWrite: r.toWrite,
        toWriteByProduct: byProduct,
        noActuals: (r.noActuals ?? []).map((n) => n.product),
        items: r.items,
        ...(r.applied ? { updatedProducts: (r.updated ?? []).length } : {}),
      };
    },
  },
];
