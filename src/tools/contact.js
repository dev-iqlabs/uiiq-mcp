import { apiClient } from "../auth.js";

export const contactTools = [
  {
    name: "uiiq_contact_list",
    description: "List UIIQ contacts. Optionally search by name or email.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number", description: "Max results (default 50)" }
      }
    },
    async handler({ search, limit = 50 } = {}) {
      const params = new URLSearchParams({ limit });
      if (search) params.set("search", search);
      const res = await apiClient()(`/contacts?${params}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.contacts ?? [];
    }
  },
  {
    name: "uiiq_contact_get",
    description: "Get a UIIQ contact by ID.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/contacts/${id}`);
      if (!res.ok) throw new Error(`Contact not found: ${id}`);
      return res.json();
    }
  },
];
