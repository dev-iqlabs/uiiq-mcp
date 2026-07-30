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


export const documentTools = [
  {
    name: "uiiq_document_list",
    description: "List documents in the tenant's vault. Optional search term.",
    inputSchema: { type: "object", properties: { search: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ search, tenant } = {}) {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await api(tenant)(`/documents${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_document_get",
    description: "Get a document by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/documents/${id}`);
      if (!res.ok) throw new Error(`Document not found: ${id}`);
      return res.json();
    },
  },
];
