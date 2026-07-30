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

export const socialTools = [
  {
    name: "uiiq_social_posts",
    description: "List social media posts.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/socials/posts");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_social_accounts",
    description: "List connected social media accounts.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/socials/accounts");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_social_template_list",
    description: "List the tenant's IQEX Design Studio social templates (each with field_config so a personalise form can be built). Returns { templates }.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/socials/templates");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_social_template_render",
    description: "Render an IQEX Design Studio social template with the tenant's field values (IQEX charges the org pool), then create a DRAFT SocialPost carrying the rendered PNG so it can be scheduled/published through the channels. Returns { success, post_id, media_url }.",
    inputSchema: {
      type: "object",
      required: ["template"],
      properties: {
        template: { type: "string", description: "Template id/key to render" },
        data:     { type: "object", description: "Field values for the template (keyed by field_config)" },
        content:  { type: "string", description: "Caption/body for the draft post" },
        hashtags: { type: "array", items: { type: "string" }, description: "Hashtags for the draft post (max 30, leading # optional)" },
        tenant:   TENANT_PROP,
      },
    },
    async handler({ template, data, content, hashtags, tenant }) {
      const body = { template };
      if (data) body.data = data;
      if (content) body.content = content;
      if (hashtags) body.hashtags = hashtags;
      const res = await api(tenant)("/socials/templates", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
