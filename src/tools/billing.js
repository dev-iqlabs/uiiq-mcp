import { apiClient } from "../auth.js";

export const billingTools = [
  {
    name: "uiiq_billing_info",
    description: "Get the tenant's billing information (plan, status, balance).",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/billing");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_invoices",
    description: "List the tenant's invoices.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/billing/invoices");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
