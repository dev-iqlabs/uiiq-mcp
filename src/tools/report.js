import { apiClient } from "../auth.js";

export const reportTools = [
  {
    name: "uiiq_report_revenue",
    description: "Get UBMS revenue report. Optionally filter by date range.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date YYYY-MM-DD" },
        to: { type: "string", description: "End date YYYY-MM-DD" }
      }
    },
    async handler({ from, to } = {}) {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to)   params.set("to", to);
      const qs = params.toString() ? "?" + params : "";
      const res = await apiClient("ubms")("/reports/revenue" + qs);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_report_usage",
    description: "Get UBMS platform usage stats (sends, contacts, workflows).",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient("ubms")("/usage");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
];
