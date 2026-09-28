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
const send = (tenant, path, method, body) => api(tenant)(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
const POST_STATUS = ["DRAFT", "QUEUED", "SCHEDULED"];


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

  // ── Posts (one) ──
  {
    name: "uiiq_social_post_get",
    description: "One social post with its targets (account, platform, status, permalink, error).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/socials/posts/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_post_update",
    description: "Partial update of a DRAFT, QUEUED or SCHEDULED post: content, hashtags, scheduledAt (ISO, null to unschedule), status. Published posts are refused (409). Targets are not changed here — use uiiq_social_post_save for that.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, content: { type: "string" }, hashtags: { type: "array", items: { type: "string" } }, scheduledAt: { type: ["string", "null"] }, status: { type: "string", enum: POST_STATUS }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, `/socials/posts/${encodeURIComponent(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_post_save",
    description: "The full composer save of a DRAFT, QUEUED or SCHEDULED post: content (required), mediaUrls, hashtags, targetAccountIds (at least one connected account; Instagram needs a media URL), status DRAFT | QUEUED | SCHEDULED (+ scheduledAt). PENDING targets are replaced to match the selection; published/failed ones are history and kept.",
    inputSchema: { type: "object", required: ["id", "content", "targetAccountIds"], properties: { id: { type: "string" }, content: { type: "string" }, mediaUrls: { type: "array", items: { type: "string" } }, hashtags: { type: "array", items: { type: "string" } }, targetAccountIds: { type: "array", items: { type: "string" } }, status: { type: "string", enum: POST_STATUS }, scheduledAt: { type: "string", description: "ISO datetime, with status SCHEDULED" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, `/socials/posts/${encodeURIComponent(id)}`, "PUT", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_post_delete",
    description: "DELETE a social post and its targets. Cannot be undone; what was already published stays on the platforms.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, `/socials/posts/${encodeURIComponent(id)}`, "DELETE");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_post_duplicate",
    description: "Copy a post (content, media, hashtags, same target accounts) as a new DRAFT.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, `/socials/posts/${encodeURIComponent(id)}/duplicate`, "POST");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_post_publish",
    description: "PUBLISH a DRAFT, QUEUED or SCHEDULED post to every PENDING target now — Facebook/Instagram through IQEX, LinkedIn direct. Goes public and cannot be recalled. Returns { post, published, failed }; a target that fails is marked FAILED with the reason and the post ends PUBLISHED, PARTIALLY_PUBLISHED or FAILED.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, `/socials/posts/${encodeURIComponent(id)}/publish`, "POST");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Accounts ──
  {
    name: "uiiq_social_account_remove",
    description: "REMOVE a connected social account from the workspace (its stored tokens go with it; posts targeting it lose that target). Reconnecting means going through Connect again.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, `/socials/accounts/${encodeURIComponent(id)}`, "DELETE");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Hashtag groups (need the `socials` feature) ──
  {
    name: "uiiq_social_hashtag_groups",
    description: "The workspace's saved hashtag groups (name + hashtags). Needs the `socials` feature.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/socials/hashtags");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_hashtag_group_create",
    description: "Save a named hashtag group (leading # optional, at least one tag).",
    inputSchema: { type: "object", required: ["name", "hashtags"], properties: { name: { type: "string" }, hashtags: { type: "array", items: { type: "string" } }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await send(tenant, "/socials/hashtags", "POST", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_hashtag_group_update",
    description: "Rename a hashtag group or replace its hashtags.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, hashtags: { type: "array", items: { type: "string" } }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, `/socials/hashtags/${encodeURIComponent(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_hashtag_group_delete",
    description: "DELETE a hashtag group. Cannot be undone.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, `/socials/hashtags/${encodeURIComponent(id)}`, "DELETE");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Inbox ──
  {
    name: "uiiq_social_inbox",
    description: "Comments and messages received on the connected accounts (newest 100): filter unread (default) | read | archived | all. Each carries its account and, when it is on one of our posts, the target and permalink.",
    inputSchema: { type: "object", properties: { filter: { type: "string", enum: ["unread", "read", "archived", "all"] }, tenant: TENANT_PROP } },
    async handler({ filter, tenant } = {}) {
      const qs = filter ? `?filter=${encodeURIComponent(filter)}` : "";
      const res = await api(tenant)(`/socials/inbox${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_inbox_update",
    description: "Mark an inbox message read/unread and/or archived/unarchived.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, read: { type: "boolean" }, archived: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, `/socials/inbox/${encodeURIComponent(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Settings ──
  {
    name: "uiiq_social_settings",
    description: "The workspace's publishing mode: autoPublish (does a post go out by itself at its scheduled time, or wait for Publish — off by default) and minGapMinutes between automatic posts.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/socials/settings");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_settings_update",
    description: "Set autoPublish and/or minGapMinutes (0-1440). Turning autoPublish on lets the 5-minute cron PUBLISH every scheduled post that is already due — the reply's dueNow says how many go out at once.",
    inputSchema: { type: "object", properties: { autoPublish: { type: "boolean" }, minGapMinutes: { type: "integer", minimum: 0, maximum: 1440 }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body } = {}) {
      const res = await send(tenant, "/socials/settings", "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── AI content brief ──
  {
    name: "uiiq_social_ai_config",
    description: "The IQEX form behind 'Write with AI' in the composer: formKey, formId, formUrl, label, the tenant, canGenerate, and — for an owner/admin who may write — a signed ctx token (1 hour) that lets IQEX generate and bill a post for this org. formKey is null when the system form is not configured.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/socials/ai-config");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
