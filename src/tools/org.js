import { apiClient } from "../auth.js";

export const orgTools = [
  {
    name: "uiiq_org_list",
    description: "List organisations.",
    inputSchema: { type: "object", properties: { search: { type: "string" } } },
    async handler({ search } = {}) {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await apiClient()(`/organisations${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_org_get",
    description: "Get an organisation by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/organisations/${id}`);
      if (!res.ok) throw new Error(`Organisation not found: ${id}`);
      return res.json();
    },
  },
  {
    name: "uiiq_org_features",
    description: "Get feature flags / entitlements for an organisation.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/organisations/${id}/features`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
