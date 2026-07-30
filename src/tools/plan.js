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
];
