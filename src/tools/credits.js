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


export const creditsTools = [
  {
    name: "uiiq_credits_balance",
    description: "Get the tenant's credit balance and this month's usage.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/credits?summary=1");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_credits_ledger",
    description:
      "Get the tenant's full credit picture from the IQEX ledger: balance, recent transactions, and the purchasable credit packs. Use this (not uiiq_credits_balance) when you need spend history or top-up options.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/credits");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
