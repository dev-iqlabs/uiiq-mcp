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
const post = (tenant, path, body) => api(tenant)(path, { method: "POST", body: JSON.stringify(body) });

// ADS & SEARCH — the Ads module beyond briefs (grow.js) and competitors
// (competitor.js): the overview, keyword research and rank tracking, the
// keyword gap against a competitor, local search (map pack, local keywords,
// nearby competitors), YouTube research, advert videos (generate on an
// engine, approve, publish, SEO copy, thumbnails), Google campaign controls,
// Pinterest alerts, Google review reply drafts. Every route needs the
// `ads_search` feature; most research calls spend IQEX credits (the API
// answers 402 when the workspace can't afford one).
//
// Not here on purpose: GET /ads/<channel> answers mock figures for every
// channel until the channels are connected (UiiQtask 9), and /ads/approve/
// <token> is the emailed-approval link, a public HMAC flow.
const ENGINES = ["topview", "runway", "wan"];
const PLATFORMS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "pinterest", "x"];

export const adsTools = [
  // ── Overview ──
  {
    name: "uiiq_ads_overview",
    description: "The Ads & Search overview: spend, results and status per channel, keyword ranks, local pack, reviews. Figures for a channel that is not connected are samples, and are labelled so.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/ads/overview");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_advert_briefs",
    description: "The workspace's guided Ad-Brief adverts (channel + generated copy) from IQEX.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/ads/advert-briefs");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Campaign brief diagrams (Napkin text → diagram) ──
  {
    name: "uiiq_ads_diagram_start",
    description: "Start a diagram from text (Napkin, via IQEX): content = the text to draw, context = what it is for, numberOfVisuals 1 or 2, format svg (default) or png. Returns 202 with request_id and a signed token; poll with uiiq_ads_diagram_poll. Needs the workspace linked to IQEX.",
    inputSchema: { type: "object", required: ["content"], properties: { content: { type: "string" }, context: { type: "string" }, numberOfVisuals: { type: "number", enum: [1, 2] }, format: { type: "string", enum: ["svg", "png"] }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/ads/campaign-brief/diagram", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_diagram_poll",
    description: "Check on a diagram with the requestId and token from uiiq_ads_diagram_start (name = what to file it as). A POST on purpose: the poll that finds it finished is what makes IQEX store and CHARGE it. A request id without this workspace's token is refused.",
    inputSchema: { type: "object", required: ["requestId", "token"], properties: { requestId: { type: "string" }, token: { type: "string" }, name: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ requestId, tenant, ...body }) {
      const res = await post(tenant, `/ads/campaign-brief/diagram/${encodeURIComponent(requestId)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Keywords ──
  {
    name: "uiiq_ads_keyword_research",
    description: "Keyword ideas from seed terms (IQEX keyword research): volume, competition, suggested bids. Spends credits.",
    inputSchema: { type: "object", required: ["seeds"], properties: { seeds: { type: "string", description: "Comma-separated seed keywords" }, tenant: TENANT_PROP } },
    async handler({ seeds, tenant }) {
      const res = await api(tenant)(`/ads/keywords?seeds=${encodeURIComponent(seeds)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_keyword_track",
    description: "Track a keyword's rank for the workspace (optionally for one target URL). Rank checks spend credits; there is no cap on how many you track, credits are the limit.",
    inputSchema: { type: "object", required: ["keyword"], properties: { keyword: { type: "string" }, targetUrl: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ keyword, targetUrl, tenant }) {
      const res = await post(tenant, "/ads/keywords", { keyword, targetUrl });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_keyword_untrack",
    description: "Stop tracking a keyword (by its id from the overview).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/ads/keywords?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_keyword_gap",
    description: "Keywords a competitor's domain ranks for that we don't. competitorDomain is a bare domain (acme.com). Refused for a business on the research block list. Spends credits.",
    inputSchema: { type: "object", required: ["ourKeywords", "competitorDomain"], properties: { ourKeywords: { type: "array", items: { type: "string" } }, competitorDomain: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ ourKeywords, competitorDomain, tenant }) {
      const res = await post(tenant, "/ads/keywords/gap", { our_keywords: ourKeywords, competitor_domain: competitorDomain });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Local search ──
  {
    name: "uiiq_ads_local",
    description: "The workspace's local-search state: the Google Business profile, tracked local keywords and their map-pack positions, recent reviews.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/ads/local");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_local_pack",
    description: "Who is in the Google map pack for a keyword near a postcode, right now. Spends credits.",
    inputSchema: { type: "object", required: ["keyword", "postcode"], properties: { keyword: { type: "string" }, postcode: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ keyword, postcode, tenant }) {
      const res = await post(tenant, "/ads/local/pack", { keyword, postcode });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_local_keywords",
    description: "The local keywords (keyword + postcode) the workspace tracks in the map pack.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/ads/local/keywords");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_local_keyword_track",
    description: "Track a keyword's map-pack position near a postcode.",
    inputSchema: { type: "object", required: ["keyword", "postcode"], properties: { keyword: { type: "string" }, postcode: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ keyword, postcode, tenant }) {
      const res = await post(tenant, "/ads/local/keywords", { keyword, postcode });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_local_keyword_untrack",
    description: "Stop tracking a local keyword (by id).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/ads/local/keywords?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_local_competitors",
    description: "Nearby businesses in a category around a postcode, compared with our own name / reviews / rating / photo count when given. Spends credits.",
    inputSchema: {
      type: "object",
      required: ["postcode", "category"],
      properties: { postcode: { type: "string" }, category: { type: "string", description: "e.g. garden centre" }, radiusMetres: { type: "number", description: "default 5000" }, ownName: { type: "string" }, ownReviews: { type: "number" }, ownRating: { type: "number" }, ownPhotos: { type: "number" }, tenant: TENANT_PROP },
    },
    async handler({ tenant, postcode, category, radiusMetres, ownName, ownReviews, ownRating, ownPhotos }) {
      const res = await post(tenant, "/ads/local/competitors", { postcode, category, radius_metres: radiusMetres, own_name: ownName, own_reviews: ownReviews, own_rating: ownRating, own_photos: ownPhotos });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── YouTube research ──
  {
    name: "uiiq_ads_youtube_search",
    description: "Search YouTube for a query (research: what already ranks). Refused for a query on the research block list. Spends credits.",
    inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, maxResults: { type: "number" }, order: { type: "string", description: "relevance | viewCount | date | rating" }, tenant: TENANT_PROP } },
    async handler({ query, maxResults, order, tenant }) {
      const res = await post(tenant, "/ads/youtube/search", { query, max_results: maxResults, order });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_youtube_channels",
    description: "Stats for YouTube channels by id (subscribers, views, uploads).",
    inputSchema: { type: "object", required: ["channelIds"], properties: { channelIds: { type: "array", items: { type: "string" } }, tenant: TENANT_PROP } },
    async handler({ channelIds, tenant }) {
      const res = await post(tenant, "/ads/youtube/channels", { channel_ids: channelIds });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_youtube_intel",
    description: "YouTube intelligence for a topic in a region: top channels, formats and titles that work. Spends credits.",
    inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, regionCode: { type: "string", description: "e.g. GB" }, tenant: TENANT_PROP } },
    async handler({ query, regionCode, tenant }) {
      const res = await post(tenant, "/ads/youtube/intel", { query, region_code: regionCode });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Advert videos ──
  {
    name: "uiiq_ads_video_capabilities",
    description: `The text-to-video engines and what each accepts (aspect ratios × durations). Engines: ${ENGINES.join(", ")}. Check before uiiq_ads_video_generate: an unsupported combination is refused.`,
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/ads/video/capabilities");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_profiles",
    description: "The organisation, service and object profiles on IQEX an advert can be grounded in (their ids go to generate / ai-assist).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/ads/video/profiles");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_ai_assist",
    description: "Turn a rough brief into a script, key message, CTA and visual style for an advert, grounded in the profiles given. Spends credits.",
    inputSchema: { type: "object", required: ["brief"], properties: { brief: { type: "string" }, duration: { type: "number", description: "seconds, default 30" }, style: { type: "string" }, orgProfileId: { type: "number" }, serviceProfileId: { type: "number" }, objectProfileId: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/ads/video/ai-assist", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_generate",
    description: `Generate an advert video on an engine (${ENGINES.join(", ")}) from a grounded brief. aspectRatio (default 9:16) and duration (default 15) must be a combination the engine accepts (uiiq_ads_video_capabilities). advertProfileId grounds it in an IQEX AdvertProfile. Spends credits; returns the asset with a job to poll (uiiq_ads_video_get).`,
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ENGINES }, script: { type: "string" }, product: { type: "string" }, keyMessage: { type: "string" }, cta: { type: "string" },
        cta_in_video: { type: "boolean" }, visualStyle: { type: "string" }, duration: { type: "number" }, aspectRatio: { type: "string", description: "9:16, 16:9, 1:1, 3:4 …" },
        referenceUrl: { type: "string" }, advertProfileId: { type: "number" }, orgProfileId: { type: "number" }, serviceProfileId: { type: "number" }, objectProfileId: { type: "number" },
        platforms: { type: "array", items: { type: "string", enum: PLATFORMS } }, tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/ads/video/generate", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_get",
    description: "An advert video asset with its render status (asked of IQEX), master URL when ready, platform variants, SEO copy and approval state.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/ads/video/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_seo_set",
    description: "Set a video's SEO copy by hand: seoTitle, seoDescription, seoTags.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, seoTitle: { type: "string" }, seoDescription: { type: "string" }, seoTags: { type: "array", items: { type: "string" } }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/ads/video/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_delete",
    description: "Delete an advert video asset.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/ads/video/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_seo_generate",
    description: "Generate SEO title, description and tags for a video for one platform (default youtube) from its brief. Spends credits.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, platform: { type: "string", enum: PLATFORMS }, tenant: TENANT_PROP } },
    async handler({ id, platform, tenant }) {
      const res = await post(tenant, `/ads/video/${encodeURIComponent(id)}/seo-generate`, platform ? { platform } : {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_thumbnails_generate",
    description: "Start generating thumbnail variants for a video from its brief. Returns variants with generation ids to poll (uiiq_ads_video_thumbnail_status). Spends credits.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await post(tenant, `/ads/video/${encodeURIComponent(id)}/thumbnails`, {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_thumbnail_status",
    description: "Poll one thumbnail generation: { status, urls }. The poll that finds it finished is what makes IQEX store and charge it.",
    inputSchema: { type: "object", required: ["id", "generationId"], properties: { id: { type: "string" }, generationId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, generationId, tenant }) {
      const res = await api(tenant)(`/ads/video/${encodeURIComponent(id)}/thumbnails/status/${encodeURIComponent(generationId)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_thumbnails_set",
    description: "Save the chosen thumbnail variants on a video (the array from generate/status, edited).",
    inputSchema: { type: "object", required: ["id", "variants"], properties: { id: { type: "string" }, variants: { type: "array", items: { type: "object" } }, tenant: TENANT_PROP } },
    async handler({ id, variants, tenant }) {
      const res = await api(tenant)(`/ads/video/${encodeURIComponent(id)}/thumbnails`, { method: "PATCH", body: JSON.stringify({ variants }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_approve",
    description: "Approve a video (queues organic posts on the given platforms, or the brief's) or reject it with a note.",
    inputSchema: { type: "object", required: ["id", "action"], properties: { id: { type: "string" }, action: { type: "string", enum: ["approve", "reject"] }, platforms: { type: "array", items: { type: "string", enum: PLATFORMS } }, note: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await post(tenant, `/ads/video/${encodeURIComponent(id)}/approve`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_publish",
    description: "Publish an approved video as organic posts on platforms the workspace has connected (uiiq_social_accounts). Returns which were queued.",
    inputSchema: { type: "object", required: ["id", "platforms"], properties: { id: { type: "string" }, platforms: { type: "array", items: { type: "string", enum: PLATFORMS } }, tenant: TENANT_PROP } },
    async handler({ id, platforms, tenant }) {
      const res = await post(tenant, `/ads/video/${encodeURIComponent(id)}/publish`, { platforms });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_video_publish_paid",
    description: "Submit a finished video to the paid campaign managers for the platforms given. Today this marks it queued for the campaign workflow; the direct ad-platform upload lands when IQEX stg is promoted.",
    inputSchema: { type: "object", required: ["id", "platforms"], properties: { id: { type: "string" }, platforms: { type: "array", items: { type: "string" } }, tenant: TENANT_PROP } },
    async handler({ id, platforms, tenant }) {
      const res = await post(tenant, `/ads/video/${encodeURIComponent(id)}/publish-paid`, { platforms });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Channel controls and alerts ──
  {
    name: "uiiq_ads_google_campaign_control",
    description: "Pause or enable a Google Ads campaign, or set its daily budget (budgetMicros = pounds × 1,000,000). Needs a connected Google Ads account.",
    inputSchema: { type: "object", required: ["id", "action"], properties: { id: { type: "string", description: "campaign id" }, action: { type: "string", enum: ["pause", "enable", "budget"] }, budgetMicros: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ id, action, budgetMicros, tenant }) {
      const res = await api(tenant)(`/ads/google/campaigns/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action, budget_micros: budgetMicros }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_pinterest_alert_dismiss",
    description: "Dismiss a Pinterest trend alert (from the overview).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/ads/pinterest/alerts/${encodeURIComponent(id)}`, { method: "PATCH", body: "{}" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ads_review_draft_reply",
    description: "Draft a reply to a Google review (by the review's id from uiiq_ads_local) in the workspace's voice. Returns { id, draftText }; it is a draft to check, not posted. Spends credits.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Google review id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await post(tenant, `/ads/reviews/${encodeURIComponent(id)}/draft`, {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
