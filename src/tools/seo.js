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


export const seoTools = [
  {
    name: "uiiq_seo_audits",
    description: "List SEO audits for the tenant.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/seo/audits");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_seo_audit",
    description: "Run an SEO audit for a URL.",
    inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ url, tenant }) {
      const res = await api(tenant)("/seo/audit", { method: "POST", body: JSON.stringify({ url }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_seo_pagespeed",
    description: "Run a PageSpeed check for a URL.",
    inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ url, tenant }) {
      const res = await api(tenant)("/seo/pagespeed", { method: "POST", body: JSON.stringify({ url }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_seo_fix",
    description: "Apply/suggest a fix for an SEO audit finding.",
    inputSchema: { type: "object", required: ["auditId"], properties: { auditId: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ auditId, tenant }) {
      const res = await api(tenant)("/seo/fix", { method: "POST", body: JSON.stringify({ auditId }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
