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
];
