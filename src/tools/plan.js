import { apiClient } from "../auth.js";

const get = (route) => async () => {
  const res = await apiClient()(route);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export const planTools = [
  { name: "uiiq_plan_estimates", description: "Business plan — revenue estimates and projections.", inputSchema: { type: "object", properties: {} }, handler: get("/plan/estimates") },
  { name: "uiiq_plan_revenue", description: "Business plan — planned vs actual revenue breakdown.", inputSchema: { type: "object", properties: {} }, handler: get("/plan/revenue") },
  { name: "uiiq_plan_expenses", description: "Business plan — expense categories and totals.", inputSchema: { type: "object", properties: {} }, handler: get("/plan/expenses") },
  { name: "uiiq_plan_milestones", description: "Business plan — milestones.", inputSchema: { type: "object", properties: {} }, handler: get("/plan/milestones") },
  { name: "uiiq_plan_personnel", description: "Business plan — team headcount and cost plan.", inputSchema: { type: "object", properties: {} }, handler: get("/plan/personnel") },
  { name: "uiiq_plan_statements", description: "Business plan — profit & loss statements.", inputSchema: { type: "object", properties: {} }, handler: get("/plan/statements") },
  { name: "uiiq_plan_assets", description: "Business plan — asset register (capital items with purchase cost/month and useful life; the targets for capital-bill linking in cost tracking).", inputSchema: { type: "object", properties: {} }, handler: get("/plan/assets") },
];
