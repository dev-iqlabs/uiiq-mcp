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


export const smsTools = [
  {
    name: "uiiq_sms_list",
    description: "List SMS messages for the tenant.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/sms");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_sms_get",
    description: "Get an SMS message by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/sms/${id}`);
      if (!res.ok) throw new Error(`SMS not found: ${id}`);
      return res.json();
    },
  },
];
