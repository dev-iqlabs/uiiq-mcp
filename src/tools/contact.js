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
      // The API reads `q`, not `search`. This sent `search`, which the API
      // ignored — so a filtered call returned page one alphabetically with a
      // clean 200, and looked like the contact simply wasn't there. Silently
      // wrong is the dangerous kind of broken; send the name the API reads.
      if (search) params.set("q", search);
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
