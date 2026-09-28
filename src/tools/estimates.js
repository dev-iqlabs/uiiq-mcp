import { apiClient } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

async function fail(res) {
  const text = await res.text();
  try { const j = JSON.parse(text); if (j?.error) return new Error(j.error); } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}
const send = async (tenant, path, method, body) => {
  const res = await api(tenant)(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
  if (!res.ok) throw await fail(res);
  return res.status === 204 ? { ok: true } : res.json();
};

// COMMERCIAL ESTIMATES — quotes for a job: customer + job header, priced
// lines (optionally from the price list), totals recomputed on every line
// change, a status lifecycle, and proposal versions (a frozen JSON snapshot of
// estimate + tenant + template, from which the proposal document is rendered).
// No feature flag; money is integer pence.
//
// Not here on purpose: POST /estimates/[id]/xero-quote answers 501 — quotes
// are pushed to Xero from the Grow Estimates page, not this endpoint.
const STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CONVERTED"];
const HEADER_PROPS = {
  customerName: { type: "string" },
  customerEmail: { type: "string" },
  customerPhone: { type: "string" },
  customerCompany: { type: "string" },
  jobTitle: { type: "string" },
  jobDescription: { type: "string" },
  validUntil: { type: "string", description: "ISO date" },
  notes: { type: "string" },
  currency: { type: "string", description: "Default GBP" },
};
const LINE_PROPS = {
  description: { type: "string" },
  sectionTitle: { type: "string" },
  quantity: { type: "number" },
  unitType: { type: "string", description: "item (default), hour, day, m2…" },
  unitPricePence: { type: "number" },
  unitCostPence: { type: "number" },
  discountPence: { type: "number" },
  taxRate: { type: "number", description: "Percent, default 20" },
};

export const estimatesTools = [
  {
    name: "uiiq_estimates_list",
    description: "Every estimate (newest first) with its lines and totals.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    handler: ({ tenant } = {}) => send(tenant, "/estimates", "GET"),
  },
  {
    name: "uiiq_estimates_create",
    description: "Create a DRAFT estimate (reference EST-… is generated). Add lines with uiiq_estimates_line_add.",
    inputSchema: { type: "object", properties: { ...HEADER_PROPS, tenant: TENANT_PROP } },
    handler: ({ tenant, ...body } = {}) => send(tenant, "/estimates", "POST", body),
  },
  {
    name: "uiiq_estimates_get",
    description: "One estimate with its lines, totals, deposit/balance and status timestamps.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    handler: ({ id, tenant }) => send(tenant, `/estimates/${encodeURIComponent(id)}`, "GET"),
  },
  {
    name: "uiiq_estimates_update",
    description: `Edit an estimate's header, set depositPence (balance due is derived) or move its status (${STATUSES.join("|")} — SENT/ACCEPTED/DECLINED/CONVERTED stamp their timestamp). Changing status does not send anything.`,
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, ...HEADER_PROPS, status: { type: "string", enum: STATUSES }, depositPence: { type: "number" }, tenant: TENANT_PROP },
    },
    handler: ({ id, tenant, ...body }) => send(tenant, `/estimates/${encodeURIComponent(id)}`, "PATCH", body),
  },
  {
    name: "uiiq_estimates_delete",
    description: "DELETE an estimate and its lines. DRAFT only (409 otherwise).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    handler: ({ id, tenant }) => send(tenant, `/estimates/${encodeURIComponent(id)}`, "DELETE"),
  },

  // ── Lines ──
  {
    name: "uiiq_estimates_line_add",
    description: "Add a line to an estimate; totals are recomputed. description required. priceItemId copies sell price, cost and tax rate from that price-list item (overriding unitPricePence/unitCostPence/taxRate).",
    inputSchema: {
      type: "object",
      required: ["id", "description"],
      properties: { id: { type: "string", description: "Estimate id" }, priceItemId: { type: "string" }, ...LINE_PROPS, tenant: TENANT_PROP },
    },
    handler: ({ id, tenant, ...body }) => send(tenant, `/estimates/${encodeURIComponent(id)}/lines`, "POST", body),
  },
  {
    name: "uiiq_estimates_line_update",
    description: "Edit one line of an estimate (quantity, price, cost, discount, tax, description, section, position); the line and estimate totals are recomputed.",
    inputSchema: {
      type: "object",
      required: ["id", "lineId"],
      properties: { id: { type: "string", description: "Estimate id" }, lineId: { type: "string" }, ...LINE_PROPS, position: { type: "number" }, tenant: TENANT_PROP },
    },
    handler: ({ id, tenant, ...body }) => send(tenant, `/estimates/${encodeURIComponent(id)}/lines`, "PATCH", body),
  },
  {
    name: "uiiq_estimates_line_delete",
    description: "DELETE one line from an estimate; totals are recomputed.",
    inputSchema: { type: "object", required: ["id", "lineId"], properties: { id: { type: "string", description: "Estimate id" }, lineId: { type: "string" }, tenant: TENANT_PROP } },
    handler: ({ id, lineId, tenant }) => send(tenant, `/estimates/${encodeURIComponent(id)}/lines`, "DELETE", { lineId }),
  },

  // ── Proposal versions ──
  {
    name: "uiiq_estimates_proposals",
    description: "The proposal versions generated for an estimate, newest first, each carrying its frozen contentJson.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Estimate id" }, tenant: TENANT_PROP } },
    handler: ({ id, tenant }) => send(tenant, `/estimates/${encodeURIComponent(id)}/proposals`, "GET"),
  },
  {
    name: "uiiq_estimates_proposal_create",
    description: "Generate a new proposal version for an estimate: a frozen snapshot of the estimate, its lines and totals, the tenant's branding/address/bank details and a template (templateId, else the tenant's default template, else terms only). Nothing is sent.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Estimate id" }, templateId: { type: "string" }, tenant: TENANT_PROP } },
    handler: ({ id, tenant, ...body }) => send(tenant, `/estimates/${encodeURIComponent(id)}/proposals`, "POST", body),
  },
];
