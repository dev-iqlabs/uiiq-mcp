import { apiClient } from "../auth.js";

export const templateTools = [
  {
    name: "uiiq_template_list",
    description: "List email/campaign templates.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/templates");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_template_get",
    description: "Get a template by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/templates/${id}`);
      if (!res.ok) throw new Error(`Template not found: ${id}`);
      return res.json();
    },
  },
];
