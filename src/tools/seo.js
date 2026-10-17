import { apiClient, impersonationState } from "../auth.js";

// Every tool takes an optional `tenant` (id, slug or exact name). Without it the
// call lands in whatever tenant the stored login belongs to; with it the client
// impersonates that tenant for that one call (SUPER_ADMIN only — see auth.js),
// riding the official impersonation audit trail.
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});
const CONFIRM_PROP = { type: "boolean", description: "true = do it; omit for the dry run, which changes nothing" };

// An id that goes into a route: only the characters an id has, so "" or ".."
// can never turn one route into another (as competitions.js). Called as
// seg(x) inside a path, with no quotes, so UiiQ's client-coverage scan reads it.
const ID = /^[A-Za-z0-9_-]{1,64}$/;
function seg(value, name = "Each id") {
  if (typeof value !== "string" || !ID.test(value)) throw new Error(`${name} must be an id: letters, numbers, - and _ only (up to 64)`);
  return value;
}
// The workspace a call acts in: the tenant named, an impersonation this MCP inherits, or your own.
function actingIn(tenant) {
  if (tenant) return tenant;
  const s = impersonationState();
  if (!s.honoured) return "your own workspace";
  const who = s.imp.tenantName ?? s.imp.tenantSlug ?? s.imp.tenantId;
  return s.writeBlocked ? `${who} (inherited; the change would be refused without UIIQ_MCP_INHERIT_WRITE=1)` : `${who} (inherited impersonation)`;
}
const dryRun = (wouldDo, tenant, details, note) => ({ dryRun: true, changed: false, wouldDo, tenant: actingIn(tenant), ...details, note: `Nothing was changed. ${note} Then call again with confirm: true.` });
async function post(tenant, path, body) {
  const res = await api(tenant)(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


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
  // Fix with AI for a category, tag or product page (UiiQ-platform, SEO term
  // and product fixes): proposed here, written to the LIVE site by
  // uiiq_seo_meta_fix_apply, put back by uiiq_seo_meta_fix_undo.
  {
    name: "uiiq_seo_meta_fix",
    description: "For an audit issue on a product category, tag or product page (Website Pages edits pages only): finds it on the live site through UiiQ Connect 4.54.0+ and proposes its SEO title, meta description or canonical (the issues 'Missing title tag', 'Title tag too short/long', 'Missing meta description', 'Meta description too short/long', 'No canonical tag'). Writes nothing. Returns { siteId, host, field, target: { kind, id, taxonomy, slug, name, permalink }, current, proposed, proposalError, emitting, limits }: review or edit the proposal, then uiiq_seo_meta_fix_apply. A page answers 422 (use uiiq_seo_fix). Needs the seo_audit feature.",
    inputSchema: { type: "object", required: ["issueTitle", "pageUrl"], properties: {
        issueTitle: { type: "string", description: "The issue's title, from uiiq_seo_audit_get" },
        pageUrl: { type: "string", description: "The issue's page (a /product-category/, /product-tag/, /category/, /tag/ or /product/ address)" },
        auditSiteUrl: { type: "string", description: "The audit's siteUrl, so the right website is used" },
        siteId: { type: "string", description: "The site, when several share the issue's host" },
        tenant: TENANT_PROP,
      } },
    async handler({ tenant, ...body }) {
      return post(tenant, "/seo/meta-fix", body);
    },
  },
  {
    name: "uiiq_seo_meta_fix_apply",
    description: "Write an SEO title, meta description and/or canonical to the LIVE site's product category, tag or product (UiiQ Connect 4.54.0+), keeping what was there so uiiq_seo_meta_fix_undo can put it back. Take siteId, kind, id and taxonomy from uiiq_seo_meta_fix; fields is { title?, description?, canonical? } (plain text; a canonical must be https on the site's own host). Owner/admin; the workspace's stage must allow write-backs; where UiiQ staff approve the workspace's website changes, only staff (impersonating). Without confirm: true it's a dry run that changes nothing. Returns { changeId, host, before, after, emitting }.",
    inputSchema: { type: "object", required: ["siteId", "kind", "id", "fields", "pageUrl"], properties: {
        siteId: { type: "string" },
        kind: { type: "string", enum: ["term", "product"] },
        id: { type: "integer", description: "The term's or product's id on the site" },
        taxonomy: { type: "string", enum: ["product_cat", "product_tag", "category", "post_tag"], description: "A term's taxonomy" },
        fields: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, canonical: { type: "string" } }, additionalProperties: false },
        pageUrl: { type: "string", description: "The audited page, kept with the change" },
        issueTitle: { type: "string" },
        confirm: CONFIRM_PROP,
        tenant: TENANT_PROP,
      } },
    async handler({ tenant, confirm, ...body }) {
      seg(body.siteId, "siteId");
      if (confirm !== true) return dryRun("seo_meta_apply", tenant, body, "This writes to the live website, where anyone can see it.");
      return post(tenant, "/seo/meta-fix/apply", body);
    },
  },
  {
    name: "uiiq_seo_meta_fix_undo",
    description: "Put back what an applied SEO fix (uiiq_seo_meta_fix_apply's changeId) replaced on the live site; a field that had nothing is cleared again. Refused (409, naming the fields) if the site has changed them since, and once undone. The same gates as applying. Without confirm: true it's a dry run that changes nothing.",
    inputSchema: { type: "object", required: ["changeId"], properties: { changeId: { type: "string" }, confirm: CONFIRM_PROP, tenant: TENANT_PROP } },
    async handler({ changeId, confirm, tenant }) {
      seg(changeId, "changeId");
      if (confirm !== true) return dryRun("seo_meta_undo", tenant, { changeId }, "This writes the old values back to the live website.");
      return post(tenant, `/seo/meta-fix/${seg(changeId)}/undo`);
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
