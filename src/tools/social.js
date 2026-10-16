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

// Scheduling is a publish path: on a workspace with auto-publish on, the
// 5-minute cron publishes a SCHEDULED post once it is due (a past scheduledAt
// means at once), with nobody pressing Publish. So setting SCHEDULED or a
// scheduledAt needs confirm: true, like publishing does (Lucas, after #80).
const CONFIRM_SCHEDULE_PROP = { type: "boolean", description: "Required (true) when setting status SCHEDULED or a scheduledAt; without it nothing is saved and a dry run is returned" };
async function scheduleDryRun(tenant, id, body, confirm) {
  const scheduling = body.status === "SCHEDULED" || (body.scheduledAt !== undefined && body.scheduledAt !== null);
  if (!scheduling || confirm === true) return null;
  const settings = await api(tenant)("/socials/settings");
  if (!settings.ok) throw await fail(settings);
  const { autoPublish } = await settings.json();
  return {
    dryRun: true,
    message: autoPublish
      ? "Nothing was saved. Auto-publish is ON for this workspace, so a SCHEDULED post is published by the cron when it falls due, with nobody pressing Publish. Pass confirm: true only once the person responsible has seen this post."
      : "Nothing was saved. Auto-publish is off here, so a SCHEDULED post waits for someone to press Publish; it is still a scheduling step, so pass confirm: true to go ahead.",
    autoPublish: !!autoPublish,
    wouldSet: { id, status: body.status, scheduledAt: body.scheduledAt },
  };
}
// Per-platform text (UiiQ-platform #890): replaces the main content for that
// platform's targets, e.g. Instagram "Tap the link in our bio" while Facebook
// carries the URL. null (or "") clears a platform; a platform left out keeps
// its text. UiiQ shows each platform's exact caption before anything goes out.
const PLATFORM_CONTENT_PROP = {
  type: ["object", "null"],
  description: "Per-platform text, keyed FACEBOOK | INSTAGRAM | TWITTER | LINKEDIN | TIKTOK; replaces the main content for that platform. null/\"\" clears one platform; null for the whole field clears all. Needs UiiQ-platform #890.",
  properties: Object.fromEntries(["FACEBOOK", "INSTAGRAM", "TWITTER", "LINKEDIN", "TIKTOK"].map((p) => [p, { type: ["string", "null"] }])),
  additionalProperties: false,
};


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
    name: "uiiq_social_post_create",
    description: "Creates a DRAFT only. It is never published or scheduled by this tool; a person reviews and publishes it in UiiQ. Takes content and targetAccountIds (at least one, ids from uiiq_social_accounts), plus optional mediaUrls (public URLs; Instagram needs at least one), hashtags (stored without '#'; published as #tags) and platformContent (different text per platform). Returns the draft with its targets.",
    inputSchema: { type: "object", required: ["content", "targetAccountIds"], properties: { content: { type: "string" }, targetAccountIds: { type: "array", items: { type: "string" } }, mediaUrls: { type: "array", items: { type: "string" } }, hashtags: { type: "array", items: { type: "string" } }, platformContent: PLATFORM_CONTENT_PROP, tenant: TENANT_PROP } },
    // Only these fields reach the API. The route makes a post with scheduledAt
    // SCHEDULED, which the cron publishes on an auto-publish workspace, so
    // forwarding "...body" would let a stray key schedule a post (Lucas,
    // uiiq-mcp #80 H1).
    async handler({ tenant, content, targetAccountIds, mediaUrls, hashtags, platformContent }) {
      const body = { content, targetAccountIds };
      if (mediaUrls !== undefined) body.mediaUrls = mediaUrls;
      if (hashtags !== undefined) body.hashtags = hashtags;
      if (platformContent !== undefined) body.platformContent = platformContent;
      const res = await send(tenant, "/socials/posts", "POST", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
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
    description: "Partial update of a DRAFT, QUEUED or SCHEDULED post: content, hashtags, platformContent (per-platform text, PENDING targets only), scheduledAt (ISO, null to unschedule), status. Published posts are refused (409). Which accounts it targets is not changed here — use uiiq_social_post_save for that. Setting status SCHEDULED or a scheduledAt needs confirm: true (on an auto-publish workspace the cron then publishes it when due); without it this is a dry run and nothing is saved.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, content: { type: "string" }, hashtags: { type: "array", items: { type: "string" } }, platformContent: PLATFORM_CONTENT_PROP, scheduledAt: { type: ["string", "null"] }, status: { type: "string", enum: POST_STATUS }, confirm: CONFIRM_SCHEDULE_PROP, tenant: TENANT_PROP } },
    async handler({ id, tenant, confirm, ...body }) {
      const dry = await scheduleDryRun(tenant, id, body, confirm);
      if (dry) return dry;
      const res = await send(tenant, `/socials/posts/${encodeURIComponent(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_post_save",
    description: "The full composer save of a DRAFT, QUEUED or SCHEDULED post: content (required), mediaUrls, hashtags, targetAccountIds (at least one connected account; Instagram needs a media URL), status DRAFT | QUEUED | SCHEDULED (+ scheduledAt), platformContent (per-platform text). PENDING targets are replaced to match the selection; published/failed ones are history and kept. Setting status SCHEDULED or a scheduledAt needs confirm: true (on an auto-publish workspace the cron then publishes it when due); without it this is a dry run and nothing is saved.",
    inputSchema: { type: "object", required: ["id", "content", "targetAccountIds"], properties: { id: { type: "string" }, content: { type: "string" }, mediaUrls: { type: "array", items: { type: "string" } }, hashtags: { type: "array", items: { type: "string" } }, platformContent: PLATFORM_CONTENT_PROP, targetAccountIds: { type: "array", items: { type: "string" } }, status: { type: "string", enum: POST_STATUS }, scheduledAt: { type: "string", description: "ISO datetime, with status SCHEDULED" }, confirm: CONFIRM_SCHEDULE_PROP, tenant: TENANT_PROP } },
    async handler({ id, tenant, confirm, ...body }) {
      const dry = await scheduleDryRun(tenant, id, body, confirm);
      if (dry) return dry;
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
    description: "PUBLISH a DRAFT, QUEUED or SCHEDULED post to every PENDING target now — Facebook/Instagram through IQEX, LinkedIn direct. Goes public and cannot be recalled. Without confirm: true this is a DRY RUN: it returns the post and the accounts it would go to, and publishes nothing. Only pass confirm: true when the person responsible has seen this exact post and said to publish it. Returns { post, published, failed }; a target that fails is marked FAILED with the reason and the post ends PUBLISHED, PARTIALLY_PUBLISHED or FAILED.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, confirm: { type: "boolean", description: "true to really publish; anything else is a dry run" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, confirm }) {
      if (confirm !== true) {
        const preview = await api(tenant)(`/socials/posts/${encodeURIComponent(id)}`);
        if (!preview.ok) throw await fail(preview);
        const post = await preview.json();
        return {
          dryRun: true,
          message: "Nothing was published. Pass confirm: true to publish, only once the person responsible has seen this post.",
          post: { id: post.id, status: post.status, content: post.content, mediaUrls: post.mediaUrls, hashtags: post.hashtags },
          wouldPublishTo: (post.targets ?? [])
            .filter((t) => t.status === "PENDING")
            .map((t) => ({ platform: t.platform, account: t.socialAccount?.accountName ?? t.socialAccountId })),
        };
      }
      const res = await send(tenant, `/socials/posts/${encodeURIComponent(id)}/publish`, "POST");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  {
    name: "uiiq_social_post_insights",
    description: "Refresh a published post's engagement figures now. Each Facebook and Instagram target is read through IQEX (not if it was read in the last 5 minutes), and every target comes back as { id, platform, outcome: updated | failed | fresh | skipped, insights }. insights is { fetchedAt, metrics: { name: count }, missing: [names], error?, errorAt? }, or null when never read (other platforms, targets not published). A name in missing is a figure Meta didn't give: show it as unavailable, never as 0. On a failed read, error says why and the last good figures are kept. The latest figures are also on uiiq_social_post_get's targets[].metrics; UiiQ reads the last 30 days' posts once a day by itself. Reads only: nothing is posted.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, `/socials/posts/${encodeURIComponent(id)}/insights`, "POST");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Accounts ──
  {
    name: "uiiq_social_account_remove",
    description: "REMOVE a connected social account from the workspace. Facebook/Instagram are disconnected in IQEX, which holds the connection (a Page takes its Instagram account with it; nothing is revoked at Meta), and stay in UiiQ as inactive so post history is kept. LinkedIn/TikTok rows and their tokens are deleted. Reconnecting means going through Connect again. Before UiiQ-platform #885 is live, Facebook/Instagram only disappear until the next accounts read.",
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
    description: "Set autoPublish and/or minGapMinutes (0-1440). Turning autoPublish on lets the 5-minute cron PUBLISH every scheduled post that is already due — the reply's dueNow says how many go out at once. Turning it ON needs confirm: true; without it nothing changes and the reply says what would happen. Only confirm when the workspace owner has asked for automatic publishing.",
    inputSchema: { type: "object", properties: { autoPublish: { type: "boolean" }, minGapMinutes: { type: "integer", minimum: 0, maximum: 1440 }, confirm: { type: "boolean", description: "Required (true) to turn autoPublish on" }, tenant: TENANT_PROP } },
    async handler({ tenant, confirm, autoPublish, minGapMinutes } = {}) {
      if (autoPublish === true && confirm !== true) {
        const cur = await api(tenant)("/socials/settings");
        if (!cur.ok) throw await fail(cur);
        return {
          dryRun: true,
          message: "Auto-publish was NOT turned on. With it on, the cron publishes every SCHEDULED post as it falls due, with nobody pressing Publish. Pass confirm: true only if the workspace owner asked for that.",
          current: await cur.json(),
        };
      }
      const body = {};
      if (autoPublish !== undefined) body.autoPublish = autoPublish;
      if (minGapMinutes !== undefined) body.minGapMinutes = minGapMinutes;
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
