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

// Section keys seeded by POST /plan (lib/plan/constants.ts in the app).
const DOCUMENT_KEYS = ["executive_summary", "problem", "problem_worth_solving", "our_solution", "target_market", "competition", "marketing_plan", "sales_plan", "operations", "milestones_metrics", "overview_history", "team", "revenue_model", "financial_highlights", "funding_needs", "valuation"];
const CANVAS_KEYS = ["problems", "target_market", "solutions", "competition", "advantages", "channels", "marketing", "revenue_sources", "major_costs"];

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

  // ── The plan row itself ──
  { name: "uiiq_plan_get", description: "The tenant's BusinessPlan row ({ plan: null } when none has been created yet).", inputSchema: SCHEMA, handler: get("/plan") },
  {
    name: "uiiq_plan_create",
    description: "Get-or-create the tenant's BusinessPlan, seeding the document sections and idea-canvas entries. Idempotent: an existing plan is returned (created=false) with any missing template sections backfilled.",
    inputSchema: SCHEMA,
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/plan", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Written document sections + idea canvas ──
  {
    name: "uiiq_plan_document_get",
    description: `One written section of the plan document (content + status). sectionKey is one of: ${DOCUMENT_KEYS.join(", ")}.`,
    inputSchema: { type: "object", required: ["sectionKey"], properties: { sectionKey: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ sectionKey, tenant }) {
      const res = await api(tenant)(`/plan/document/${encodeURIComponent(sectionKey)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_document_update",
    description: "Write a plan document section's content and/or status (NOT_STARTED | IN_PROGRESS | READY). 404 when the tenant has no plan.",
    inputSchema: {
      type: "object",
      required: ["sectionKey"],
      properties: { sectionKey: { type: "string" }, content: { type: "string" }, status: { type: "string", enum: ["NOT_STARTED", "IN_PROGRESS", "READY"] }, tenant: TENANT_PROP },
    },
    async handler({ sectionKey, tenant, ...body }) {
      const res = await api(tenant)(`/plan/document/${encodeURIComponent(sectionKey)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_canvas_get",
    description: `One idea-canvas box (items, summary, status). sectionKey is one of: ${CANVAS_KEYS.join(", ")}.`,
    inputSchema: { type: "object", required: ["sectionKey"], properties: { sectionKey: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ sectionKey, tenant }) {
      const res = await api(tenant)(`/plan/canvas/${encodeURIComponent(sectionKey)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_canvas_update",
    description: "Set an idea-canvas box's items (array of strings), summary and/or status. 404 when the tenant has no plan.",
    inputSchema: {
      type: "object",
      required: ["sectionKey"],
      properties: { sectionKey: { type: "string" }, items: { type: "array", items: { type: "string" } }, summary: { type: "string" }, status: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ sectionKey, tenant, ...body }) {
      const res = await api(tenant)(`/plan/canvas/${encodeURIComponent(sectionKey)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Forecast lines: direct costs (COGS), expenses, personnel, assets ──
  { name: "uiiq_plan_direct_costs", description: "Business plan — direct-cost (COGS) forecast lines, each with monthlyData { 'YYYY-MM': pence } or a percent of revenue.", inputSchema: SCHEMA, handler: get("/plan/direct-costs") },
  {
    name: "uiiq_plan_direct_cost_add",
    description: "Add a direct-cost (COGS) forecast line. Either monthlyData { 'YYYY-MM': pence } or isPercentOfRevenue=true + percentValue. 404 when the tenant has no plan.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        isPercentOfRevenue: { type: "boolean" },
        percentValue: { type: "number" },
        monthlyData: { type: "object", additionalProperties: { type: "number" } },
        assumptions: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/plan/direct-costs", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_direct_cost_update",
    description: "Edit a direct-cost forecast line (name, monthlyData, percent-of-revenue, assumptions). monthlyData REPLACES the whole map.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        isPercentOfRevenue: { type: "boolean" },
        percentValue: { type: "number" },
        monthlyData: { type: "object", additionalProperties: { type: "number" } },
        assumptions: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/plan/direct-costs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_direct_cost_delete",
    description: "DELETE a direct-cost forecast line.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/plan/direct-costs/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_expense_update",
    description: "Edit an expense forecast line (see uiiq_plan_expenses): name, category, frequency MONTHLY|QUARTERLY|ANNUALLY|ONE_OFF, monthlyData { 'YYYY-MM': pence } (replaces the map), assumptions.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        category: { type: "string" },
        frequency: { type: "string", enum: ["MONTHLY", "QUARTERLY", "ANNUALLY", "ONE_OFF"] },
        monthlyData: { type: "object", additionalProperties: { type: "number" } },
        assumptions: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/plan/expenses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_expense_delete",
    description: "DELETE an expense forecast line.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/plan/expenses/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_personnel_update",
    description: "Edit a personnel plan entry (see uiiq_plan_personnel): jobTitle, department, headcount, annualSalary, startMonth/endMonth (YYYY-MM), burdenRate, assumptions.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        jobTitle: { type: "string" },
        department: { type: "string" },
        headcount: { type: "number" },
        annualSalary: { type: "number" },
        startMonth: { type: "string" },
        endMonth: { type: "string" },
        burdenRate: { type: "number" },
        assumptions: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/plan/personnel/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_personnel_delete",
    description: "DELETE a personnel plan entry.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/plan/personnel/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_asset_delete",
    description: "DELETE an asset register entry (see uiiq_plan_assets). Cost bills linked to it lose their asset link.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/plan/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Milestones ──
  {
    name: "uiiq_plan_milestone_update",
    description: "Edit a plan milestone (see uiiq_plan_milestones): name, description, dueDate (ISO; empty clears), status NOT_STARTED|IN_PROGRESS|COMPLETE|CANCELLED, category.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        dueDate: { type: "string" },
        status: { type: "string", enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "CANCELLED"] },
        category: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/plan/milestones/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_milestone_delete",
    description: "DELETE a plan milestone.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/plan/milestones/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Product / service ideas (viability workbench) ──
  {
    name: "uiiq_plan_idea_add",
    description: "Add a product or service idea to the plan's ideas workbench. type PRODUCT (default) | SERVICE. 400 until the tenant has a plan (uiiq_plan_create).",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        type: { type: "string", enum: ["PRODUCT", "SERVICE"] },
        description: { type: "string" },
        targetCustomer: { type: "string" },
        problemSolved: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/plan/ideas", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_idea_get",
    description: "One product/service idea with its full viability worksheet (costs, pricing, demand, break-even, score, decision).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/plan/ideas/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_idea_update",
    description: "Update any worksheet fields of an idea. Money in pounds (numbers). Setting pricePoint / unitCost / monthlyUnits auto-recomputes marginPercent, monthlyRevenue and monthlyProfit. status DRAFT|EVALUATING|VIABLE|NOT_VIABLE|PARKED.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        type: { type: "string", enum: ["PRODUCT", "SERVICE"] },
        status: { type: "string", enum: ["DRAFT", "EVALUATING", "VIABLE", "NOT_VIABLE", "PARKED"] },
        description: { type: "string" },
        targetCustomer: { type: "string" },
        problemSolved: { type: "string" },
        uniqueValue: { type: "string" },
        marketGap: { type: "string" },
        differentiation: { type: "string" },
        developmentCost: { type: "number" },
        unitCost: { type: "number" },
        fixedCosts: { type: "number" },
        setupInvestment: { type: "number" },
        pricePoint: { type: "number" },
        marginPercent: { type: "number" },
        pricingNotes: { type: "string" },
        monthlyUnits: { type: "number" },
        growthRate: { type: "number" },
        seasonality: { type: "string" },
        demandNotes: { type: "string" },
        breakEvenUnits: { type: "number" },
        breakEvenMonths: { type: "number" },
        monthlyRevenue: { type: "number" },
        monthlyProfit: { type: "number" },
        roiMonths: { type: "number" },
        viabilityScore: { type: "number" },
        risks: { type: "string" },
        nextSteps: { type: "string" },
        decision: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/plan/ideas/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_idea_delete",
    description: "DELETE a product/service idea and its worksheet.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/plan/ideas/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Commercial proposal templates (used by uiiq_estimates_proposal_create) ──
  {
    name: "uiiq_plan_proposal_template_add",
    description: "Create a commercial proposal template (cover title, intro, terms, footer, accent colour, logo). isDefault=true makes it the template proposals use when none is named, clearing the previous default.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        coverTitle: { type: "string" },
        introText: { type: "string" },
        termsText: { type: "string" },
        footerText: { type: "string" },
        accentColor: { type: "string" },
        logoUrl: { type: "string" },
        isDefault: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/plan/proposals/templates", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_proposal_template_update",
    description: "Edit a commercial proposal template. isDefault=true clears the previous default.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        coverTitle: { type: "string" },
        introText: { type: "string" },
        termsText: { type: "string" },
        footerText: { type: "string" },
        accentColor: { type: "string" },
        logoUrl: { type: "string" },
        isDefault: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/plan/proposals/templates/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_proposal_template_delete",
    description: "DELETE a commercial proposal template. Proposal versions already generated from it keep their content.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/plan/proposals/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Planning calendar items (/planning/[id]) ──
  {
    name: "uiiq_plan_planning_item_get",
    description: "One planning-calendar item (type SOCIAL|EVENT|CONTENT|TASK, dates, status, assignee, tags, colour, metadata).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/planning/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_planning_item_update",
    description: "Edit a planning-calendar item: title, description, type SOCIAL|EVENT|CONTENT|TASK, startDate/endDate (ISO), allDay, status PLANNED|IN_PROGRESS|COMPLETED|CANCELLED, assignee, tags, colour, metadata.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        type: { type: "string", enum: ["SOCIAL", "EVENT", "CONTENT", "TASK"] },
        startDate: { type: "string" },
        endDate: { type: "string" },
        allDay: { type: "boolean" },
        status: { type: "string", enum: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] },
        assignee: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        colour: { type: "string" },
        metadata: { type: "object" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/planning/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_plan_planning_item_delete",
    description: "DELETE a planning-calendar item.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/planning/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return { ok: true };
    },
  },
];
