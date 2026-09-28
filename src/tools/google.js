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

async function fail(res) {
  const text = await res.text();
  try { const j = JSON.parse(text); if (j?.error) return new Error(j.error); } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}

function range(from, to) {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  const s = p.toString();
  return s ? `?${s}` : "";
}
const daysQs = (days) => (days ? `?days=${encodeURIComponent(days)}` : "");
const DAYS_PROP = { type: "integer", minimum: 1, maximum: 365, description: "Window in days, default 30" };

export const googleTools = [
  {
    name: "uiiq_google_analytics",
    description: "Google Analytics summary. Optional from/to (YYYY-MM-DD).",
    inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ from, to, tenant } = {}) {
      const qs = range(from, to);
      const res = await api(tenant)(`/google/analytics${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_google_search_console",
    description: "Google Search Console keywords and pages for the last `days` days (default 30, max 365). Needs Google connected and a site chosen (uiiq_google_properties_set).",
    inputSchema: { type: "object", properties: { days: DAYS_PROP, tenant: TENANT_PROP } },
    async handler({ days, tenant } = {}) {
      const qs = daysQs(days);
      const res = await api(tenant)(`/google/search-console${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_google_ads",
    description: "Google Ads campaigns, clicks and cost for the last `days` days (default 30, max 365), read through GA4. Needs Google connected, a GA4 property chosen and Ads linked to it.",
    inputSchema: { type: "object", properties: { days: DAYS_PROP, tenant: TENANT_PROP } },
    async handler({ days, tenant } = {}) {
      const qs = daysQs(days);
      const res = await api(tenant)(`/google/ads${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_google_properties",
    description: "The connected Google account (googleEmail), what is chosen (ga4PropertyId, gscSiteUrl) and what it can see: ga4Properties [{id, name}] and gscSites [{siteUrl, permissionLevel}]. 400 when Google is not connected (connecting is a browser OAuth flow from Settings).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/google/properties");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_google_properties_set",
    description: "Choose the GA4 property (ga4PropertyId, e.g. properties/123456) and Search Console site (gscSiteUrl) the reports read from. Omit one to clear it.",
    inputSchema: { type: "object", properties: { ga4PropertyId: { type: "string" }, gscSiteUrl: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ ga4PropertyId, gscSiteUrl, tenant } = {}) {
      const res = await api(tenant)("/google/properties", { method: "POST", body: JSON.stringify({ ga4PropertyId, gscSiteUrl }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_google_merchant_set",
    description: "Set (or clear, with no merchantId) the Google Merchant Center id on the tenant's Google connection.",
    inputSchema: { type: "object", properties: { merchantId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ merchantId, tenant } = {}) {
      const res = await api(tenant)("/google/merchant", { method: "POST", body: JSON.stringify({ merchantId: merchantId ?? null }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_google_disconnect",
    description: "DISCONNECT Google: revokes the tokens with Google and deletes the connection (GA4, Search Console, Ads and Merchant settings go with it). Reconnecting is a browser OAuth flow from Settings.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/google/disconnect", { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
