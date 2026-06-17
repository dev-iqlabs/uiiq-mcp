import { apiClient } from "../auth.js";

export const merchSetTools = [
  {
    name: "uiiq_merch_set_list",
    description:
      "List curated merch sets (super-admin). Returns each set with its items and the number of brands that have adopted it.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/admin/merch-sets");
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
      },
    },
    async handler({ name, slug, description, targetAudience, items } = {}) {
      const res = await apiClient()("/admin/merch-sets", {
        method: "POST",
        body: JSON.stringify({ name, slug, description, targetAudience, items }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
