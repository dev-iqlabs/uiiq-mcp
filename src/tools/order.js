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


export const orderTools = [
  {
    name: "uiiq_order_list",
    description: "List UIIQ workflow orders. Filter by status or tenant slug.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "pending | in-progress | complete | on-hold" },
        tenant: { type: "string", description: "Tenant slug" },
        limit: { type: "number" }
      }
    },
    async handler({ status, tenant, limit = 50 } = {}) {
      const params = new URLSearchParams({ limit });
      if (status) params.set("status", status);
      if (tenant) params.set("tenant", tenant);
      const res = await api(tenant)(`/wf/orders?${params}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.orders ?? [];
    }
  },
  {
    name: "uiiq_order_get",
    description: "Get full detail for a workflow order by reference number.",
    inputSchema: {
      type: "object",
      required: ["ref"],
      properties: { ref: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ ref, tenant }) {
      const res = await api(tenant)(`/wf/orders/${ref}`);
      if (!res.ok) throw new Error(`Order not found: ${ref}`);
      return res.json();
    }
  },
  {
    name: "uiiq_order_note",
    description: "Add a note to a workflow order.",
    inputSchema: {
      type: "object",
      required: ["ref", "body"],
      properties: { ref: { type: "string" }, body: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ ref, body, tenant }) {
      const res = await api(tenant)(`/wf/orders/${ref}/notes`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_order_hold",
    description: "Put a workflow order on hold.",
    inputSchema: {
      type: "object",
      required: ["ref", "reason"],
      properties: { ref: { type: "string" }, reason: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ ref, reason, tenant }) {
      const res = await api(tenant)(`/wf/orders/${ref}/hold`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { success: true, ref };
    }
  },
];
