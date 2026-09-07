import { apiClient } from "../auth.js";

// IQPlant for a garden centre tenant: the garden plans the planner has
// delivered to it, and the stock map that tells the planner which species
// the centre actually stocks (slug ↔ product + bay + pot size + 360-tour
// spot). The till-side plan-code scan lives in till.js (device-authed).
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

export const iqplantTools = [
  {
    name: "uiiq_iqplant_garden_plan_list",
    description:
      "The tenant's delivered garden plans, newest first (up to 100): plan code, door (kiosk / home / voucher), level, total, stocked vs not-stocked line counts, the lead (contact — only when the customer consented) and the voucher the plan was sized to. Plus this month's summary: plans by door and leads delivered.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/iqplant/garden-plans");
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { summary, plans }
    },
  },
  {
    name: "uiiq_iqplant_stock_map_list",
    description:
      "The tenant's IQPlant stock mapping — every species slug mapped to a product / bay / size / tour spot — plus recommendedNotStocked: species the planner keeps recommending that have no mapping, most-seen first (the buying signal).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/iqplant/stock-map");
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { mappings, recommendedNotStocked }
    },
  },
  {
    name: "uiiq_iqplant_stock_map_set",
    description:
      "Upsert one species mapping { slug, productId?, bay?, size?, tourSweep?, tourPoint? } — the whole row is replaced, so resend fields you want kept. " +
      "Or bulk-import UI3D's bays.json as bays: { '<slug>': { sweep, pointId } } (only tour fields are touched; product/bay/size are left alone). productId must be in the tenant's catalogue.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Species slug (lower-cased, max 120). Required unless bays is given" },
        productId: { type: "string", description: "VenueProduct id in this tenant's catalogue" },
        bay: { type: "string", description: "Where it sits in the centre (max 40)" },
        size: { type: "string", description: "Pot size (max 20)" },
        tourSweep: { type: "string", description: "360-tour sweep id (max 120)" },
        tourPoint: { type: "string", description: "360-tour point id (max 120)" },
        bays: {
          type: "object",
          description: "Bulk import: { '<slug>': { sweep, pointId } } — UI3D's bays.json",
          additionalProperties: { type: "object", properties: { sweep: { type: "string" }, pointId: { type: "string" } } },
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (!body.bays && !body.slug) throw new Error("Send slug (one mapping) or bays (bulk import)");
      const res = await api(tenant)("/iqplant/stock-map", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { mapping } or { ok, updated }
    },
  },
  {
    name: "uiiq_iqplant_stock_map_delete",
    description: "Remove a species mapping by slug. The species goes back to 'recommended, not stocked'.",
    inputSchema: {
      type: "object",
      required: ["slug"],
      properties: { slug: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ slug, tenant }) {
      const res = await api(tenant)(`/iqplant/stock-map?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { ok: true }
    },
  },
];
