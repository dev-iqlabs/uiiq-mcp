import { apiClient } from "../auth.js";

function range(from, to) {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const googleTools = [
  {
    name: "uiiq_google_analytics",
    description: "Google Analytics summary. Optional from/to (YYYY-MM-DD).",
    inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } },
    async handler({ from, to } = {}) {
      const res = await apiClient()(`/google/analytics${range(from, to)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_google_search_console",
    description: "Google Search Console summary. Optional from/to (YYYY-MM-DD).",
    inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } },
    async handler({ from, to } = {}) {
      const res = await apiClient()(`/google/search-console${range(from, to)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_google_ads",
    description: "Google Ads summary. Optional from/to (YYYY-MM-DD).",
    inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } },
    async handler({ from, to } = {}) {
      const res = await apiClient()(`/google/ads${range(from, to)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
