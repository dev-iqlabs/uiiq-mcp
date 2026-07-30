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


export const merchSetTools = [
  {
    name: "uiiq_merch_set_list",
    description:
      "List curated merch sets (super-admin). Returns each set with its items and the number of brands that have adopted it.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/admin/merch-sets");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_merch_set_create",
    description:
      "Create a merch set (super-admin). name + slug are required; optional description, targetAudience (string array), and items (array of { catalogProductId, notes? } — product IDs from the partner catalogue).",
    inputSchema: {
      type: "object",
      required: ["name", "slug"],
      properties: {
        name: { type: "string" },
        slug: { type: "string" },
        description: { type: "string" },
        targetAudience: { type: "array", items: { type: "string" } },
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["catalogProductId"],
            properties: {
              catalogProductId: { type: "string" },
              notes: { type: "string" },
            },
          },
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ name, slug, description, targetAudience, items, tenant } = {}) {
      const res = await api(tenant)("/admin/merch-sets", {
        method: "POST",
        body: JSON.stringify({ name, slug, description, targetAudience, items }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
