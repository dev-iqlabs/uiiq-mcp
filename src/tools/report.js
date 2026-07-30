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


export const reportTools = [
  {
    name: "uiiq_report_revenue",
    description: "Get UIIQ revenue report. Optionally filter by date range.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date YYYY-MM-DD" },
        to: { type: "string", description: "End date YYYY-MM-DD" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ from, to, tenant } = {}) {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to)   params.set("to", to);
      const qs = params.toString() ? "?" + params : "";
      const res = await api(tenant)("/reports/revenue" + qs);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_report_usage",
    description: "Get UIIQ platform usage stats (sends, contacts, workflows).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/usage");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
];
