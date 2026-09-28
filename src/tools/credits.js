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

  {
    name: "uiiq_credits_checkout",
    description: "Start a credit top-up: asks IQEX (which owns credit purchasing) for a Stripe Checkout session for one of the packs in uiiq_credits_ledger and RETURNS A CHECKOUT URL for a person to open and pay — nothing is charged until they complete it. 409 when the workspace isn't linked to an IQEX organisation. OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["packId"], properties: { packId: { type: "number", description: "IQEX CreditPack id (see the packs in uiiq_credits_ledger)" }, tenant: TENANT_PROP } },
    async handler({ packId, tenant }) {
      const res = await api(tenant)("/credits/checkout", { method: "POST", body: JSON.stringify({ packId }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
