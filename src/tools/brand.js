import { apiClient } from "../auth.js";

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
const post = (tenant, path, body) => api(tenant)(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

// BRAND WEBSITE PAGES — AI-edited changes to a brand's WordPress pages via the
// uiiq-connect bridge. Flow: pick a site → list its pages → open a change
// request on one page → chat the change in (the model proposes patch ops) →
// apply to staging and look → publish to LIVE (owner/admin; if the tenant
// cannot self-approve it parks at APPROVED_PENDING_STAFF for UIIQ staff to
// sign off). Staging sync copies the live site over staging on 20i.
export const brandTools = [
  {
    name: "uiiq_brand_sites",
    description: "The websites bound to this workspace for page editing (id, slug, name, stagingUrl, liveUrl, whether the WordPress bridge is paired).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/brand/website-pages/sites");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_brand_pages",
    description: "The pages of a bound site, read live from its WordPress through the uiiq-connect bridge (id, slug, title, status, url). Empty when the bridge is not paired.",
    inputSchema: { type: "object", required: ["siteId"], properties: { siteId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ siteId, tenant }) {
      const qs = `?siteId=${encodeURIComponent(siteId)}`;
      const res = await api(tenant)(`/brand/website-pages/pages${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_brand_request_list",
    description: "Page change requests for the workspace, newest first (status DRAFT → PLANNING → PREVIEWED → APPROVED / APPROVED_PENDING_STAFF → APPLIED, or REJECTED), optionally for one site.",
    inputSchema: { type: "object", properties: { siteId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ siteId, tenant } = {}) {
      const qs = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
      const res = await api(tenant)(`/brand/website-pages/requests${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_brand_request_create",
    description: "Open a change request on one page of a bound site (pageId + pageSlug from uiiq_brand_pages). Then chat the change in with uiiq_brand_request_chat.",
    inputSchema: {
      type: "object",
      required: ["siteId", "pageId", "pageSlug"],
      properties: { siteId: { type: "string" }, pageId: { type: "number", description: "WordPress page id" }, pageSlug: { type: "string" }, title: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/brand/website-pages/requests", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_brand_request_get",
    description: "One change request in full: chat messages, the proposed patch ops, model + token usage, preview/apply timestamps and its site.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/brand/website-pages/requests/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_brand_request_update",
    description: "Retitle a change request, or move its status along the allowed path (DRAFT↔PLANNING→PREVIEWED→APPROVED|APPROVED_PENDING_STAFF→APPLIED, REJECTED from anywhere; 422 otherwise). Signing off APPROVED_PENDING_STAFF → APPROVED is SUPER_ADMIN only. rejectionReason goes with REJECTED.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["DRAFT", "PLANNING", "PREVIEWED", "APPROVED", "APPROVED_PENDING_STAFF", "APPLIED", "REJECTED"] },
        title: { type: "string" }, rejectionReason: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      const res = await api(tenant)(`/brand/website-pages/requests/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_brand_request_chat",
    description: "Tell the page editor what to change, in plain words. The model reads the page and replies with a proposed patch (stored on the request as patchOps). Runs an Anthropic call (token usage is recorded on the request); bounded to ~25s.",
    inputSchema: { type: "object", required: ["id", "message"], properties: { id: { type: "string" }, message: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, message, tenant }) {
      const res = await post(tenant, `/brand/website-pages/requests/${encodeURIComponent(id)}/chat`, { message });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_brand_request_apply_staging",
    description: "Push the request's patch ops to the site's STAGING WordPress so the change can be looked at (status → PREVIEWED; returns previewUrl). Needs staging configured and at least one patch op.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await post(tenant, `/brand/website-pages/requests/${encodeURIComponent(id)}/apply-staging`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_brand_request_publish",
    description: "PUBLISH a previewed request to the customer's LIVE website. OWNER/ADMIN. When the tenant may not self-approve (selfApproveWebsitePages off) this only parks it at APPROVED_PENDING_STAFF and returns published:false — nothing changes live until UIIQ staff sign it off. Irreversible once published.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await post(tenant, `/brand/website-pages/requests/${encodeURIComponent(id)}/publish`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_brand_staging_status",
    description: "Whether a site's staging can be refreshed from live through 20i (available, packageId, stagingUrl, whether the staging bridge answers, when live was last copied over). OWNER/ADMIN — it probes the customer's site.",
    inputSchema: { type: "object", required: ["siteId"], properties: { siteId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ siteId, tenant }) {
      const res = await api(tenant)(`/brand/website-pages/sites/${encodeURIComponent(siteId)}/staging-sync`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_brand_staging_sync",
    description: "COPY THE LIVE SITE OVER STAGING on 20i (queued; takes a few minutes). Everything on staging is replaced. OWNER/ADMIN; 409 when the site has no 20i package.",
    inputSchema: { type: "object", required: ["siteId"], properties: { siteId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ siteId, tenant }) {
      const res = await post(tenant, `/brand/website-pages/sites/${encodeURIComponent(siteId)}/staging-sync`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
