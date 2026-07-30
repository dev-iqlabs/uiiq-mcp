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


export const contactTools = [
  {
    name: "uiiq_contact_list",
    description: "List UIIQ contacts. Optionally search by name or email.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number", description: "Max results (default 50)" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ search, limit = 50, tenant } = {}) {
      const params = new URLSearchParams({ limit });
      if (search) params.set("search", search);
      const res = await api(tenant)(`/contacts?${params}`);
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
      properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/contacts/${id}`);
      if (!res.ok) throw new Error(`Contact not found: ${id}`);
      return res.json();
    }
  },
];
