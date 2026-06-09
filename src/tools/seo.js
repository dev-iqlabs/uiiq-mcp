import { apiClient } from "../auth.js";

export const seoTools = [
  {
    name: "uiiq_seo_audits",
    description: "List SEO audits for the tenant.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/seo/audits");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_seo_audit",
    description: "Run an SEO audit for a URL.",
    inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" } } },
    async handler({ url }) {
      const res = await apiClient()("/seo/audit", { method: "POST", body: JSON.stringify({ url }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_seo_pagespeed",
    description: "Run a PageSpeed check for a URL.",
    inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" } } },
    async handler({ url }) {
      const res = await apiClient()("/seo/pagespeed", { method: "POST", body: JSON.stringify({ url }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_seo_fix",
    description: "Apply/suggest a fix for an SEO audit finding.",
    inputSchema: { type: "object", required: ["auditId"], properties: { auditId: { type: "string" } } },
    async handler({ auditId }) {
      const res = await apiClient()("/seo/fix", { method: "POST", body: JSON.stringify({ auditId }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
