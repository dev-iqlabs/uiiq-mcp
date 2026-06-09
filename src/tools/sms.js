import { apiClient } from "../auth.js";

export const smsTools = [
  {
    name: "uiiq_sms_list",
    description: "List SMS messages for the tenant.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/sms");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_sms_get",
    description: "Get an SMS message by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/sms/${id}`);
      if (!res.ok) throw new Error(`SMS not found: ${id}`);
      return res.json();
    },
  },
];
