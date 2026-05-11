import { apiClient } from "../auth.js";

export const orderTools = [
  {
    name: "uiiq_order_list",
    description: "List UBMS workflow orders. Filter by status or tenant slug.",
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
      const res = await apiClient("ubms")(`/wf/orders?${params}`);
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
      properties: { ref: { type: "string" } }
    },
    async handler({ ref }) {
      const res = await apiClient("ubms")(`/wf/orders/${ref}`);
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
      properties: { ref: { type: "string" }, body: { type: "string" } }
    },
    async handler({ ref, body }) {
      const res = await apiClient("ubms")(`/wf/orders/${ref}/notes`, {
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
      properties: { ref: { type: "string" }, reason: { type: "string" } }
    },
    async handler({ ref, reason }) {
      const res = await apiClient("ubms")(`/wf/orders/${ref}/hold`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { success: true, ref };
    }
  },
];
