import { apiClient } from "../auth.js";

export const documentTools = [
  {
    name: "uiiq_document_list",
    description: "List documents in the tenant's vault. Optional search term.",
    inputSchema: { type: "object", properties: { search: { type: "string" } } },
    async handler({ search } = {}) {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await apiClient()(`/documents${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_document_get",
    description: "Get a document by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/documents/${id}`);
      if (!res.ok) throw new Error(`Document not found: ${id}`);
      return res.json();
    },
  },
];
