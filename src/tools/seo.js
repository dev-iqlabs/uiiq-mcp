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
  // uiiq_seo_audit used to POST /seo/audit, a route that has never existed —
  // every call came back as the Next.js 404 page. Running an audit is
  // uiiq_seo_crawl; reading one back, issues included, is this.
  {
    name: "uiiq_seo_audit_get",
    description: "One SEO audit in full: scores, AIO scores and the issue list (each issue has title, fix and page). Take the id from uiiq_seo_crawl or uiiq_seo_audits. The issues are what uiiq_seo_fix takes. Needs the `seo_audit` feature.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/seo/audits/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_seo_pagespeed",
    description: "Run a PageSpeed check (mobile + desktop). url defaults to the tenant's Search Console site or website. Pass auditId (from uiiq_seo_crawl) to fold the performance score into that audit and re-score it.",
    inputSchema: { type: "object", properties: { url: { type: "string" }, auditId: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ url, auditId, tenant } = {}) {
      const res = await api(tenant)("/seo/pagespeed", { method: "POST", body: JSON.stringify({ ...(url ? { url } : {}), ...(auditId ? { auditId } : {}) }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_seo_fix",
    description: "Turn one audit issue into a Website Pages change request: opens (or reuses) a DRAFT request for the issue's page and asks the page assistant to make the fix. Nothing goes live — the draft is reviewed and published in Website Pages. Pass the issue's title, fix and page from uiiq_seo_audit_get, plus auditSiteUrl (the audit's siteUrl). Needs Website Pages set up for the brand; issues Website Pages can't action answer 422 with where to fix them instead. Returns { siteId, requestId }.",
    inputSchema: { type: "object", required: ["issueFix"], properties: {
        issueTitle: { type: "string", description: "The issue's title" },
        issueFix: { type: "string", description: "The issue's fix text" },
        pageUrl: { type: "string", description: "The issue's page" },
        auditSiteUrl: { type: "string", description: "The audit's siteUrl, so the right website is fixed" },
        siteId: { type: "string", description: "Website Pages site id, when the brand has more than one" },
        tenant: TENANT_PROP,
      } },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/seo/fix", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_seo_crawl",
    description: "Crawl the tenant's website and save an SEO + AIO audit (scores, issues, pages crawled). Needs the `seo_audit` feature. siteId picks the website when the brand is bound to more than one (the API answers 400 with the choices otherwise). Returns the audit id and pageSpeedPending: true — pass the id to uiiq_seo_pagespeed as auditId to fold in Core Web Vitals, and to uiiq_seo_audit_get to read the issues.",
    inputSchema: { type: "object", properties: { siteId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ siteId, tenant } = {}) {
      const res = await api(tenant)("/seo/crawl", { method: "POST", body: JSON.stringify(siteId ? { siteId } : {}) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
