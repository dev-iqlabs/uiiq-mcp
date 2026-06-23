import { apiClient } from "../auth.js";

export const creditsTools = [
  {
    name: "uiiq_credits_balance",
    description: "Get the tenant's credit balance and this month's usage.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/credits?summary=1");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_credits_ledger",
    description:
      "Get the tenant's full credit picture from the IQEX ledger: balance, recent transactions, and the purchasable credit packs. Use this (not uiiq_credits_balance) when you need spend history or top-up options.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/credits");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
