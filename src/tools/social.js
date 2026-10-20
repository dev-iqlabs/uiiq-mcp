import { randomUUID } from "node:crypto";
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
// Enabling the campaign alone runs nothing (iqex-backend #1384): said wherever a carousel ad is made.
const CAROUSEL_FOLLOW = (id, rid, video = false) => `IQEX is making it (${video ? "up to 12 minutes: Meta processes the video first" : "about a minute"}). Ask uiiq_social_carousel_ad_status with id "${id}" and requestId "${rid}" every ${video ? "10 seconds" : "few seconds"} until it says done, failed or unknown; never make a new request meanwhile.`;
const CAROUSEL_RUN_IT = "To run it, the campaign, its ad set AND its ad must each be switched on in Ads Manager: enabling the campaign alone runs nothing. A budget changed in Ads Manager isn't held to UiiQ's £10 a day.";

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

  {
    name: "uiiq_social_promo_templates",
    description: "The promo layouts this workspace can use (IQEX's promo-media templates: headline, big figure, steps, collage, compare, timeline, end card, and the shop 'collection' ad: a large product photo, headline, price and a CTA bar, then four product cards). Each: { slug, name, layout, size, width, height, fields: { name: { type text|colour|image, label, max_chars, default } }, photoSlots, previewUrl }, plus brandDefaults and maxPhotos. Needs the Social Templates feature switched on.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/socials/promo-templates");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_promo_products",
    description: "The workspace's shop products for promo photos, from its UiiQ Connect product feed on its own website: [{ id, title, price (as a card shows it, e.g. £19.99), link, images (the main photo, then the mockups) }]. Pass an image as { url } in uiiq_social_promo_create's photos; for a collection's cards, title and price are what item1_name/item1_price etc. take.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/socials/promo-products");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_promo_create",
    description: "Make a promo layout into a DRAFT social post: IQEX renders it with these words and photos (charging the workspace's credits) and UiiQ saves a draft carrying it. Nothing is posted, and the image stays PRIVATE until the post is published (it is made public only then, and private again if the post is deleted): media_url is UiiQ's own address for it, which only the workspace's signed-in members can open. At most 30 an hour per workspace. template: a slug from uiiq_social_promo_templates. fields: its text fields only; words are printed exactly as sent or refused with a 400 naming the field (about how many characters fit), never cut. photos: in slot order, each { assetId } (a media-library image) or { url } (https), with fit 'fill' (the default: it fills its box, cropped) or 'whole' (all of it on a blur of itself, so a round coin keeps its rim); a collection needs five, the main product first. colours: the layout's colour fields as hex. requestId: leave it out for a fresh one; pass the SAME one to retry a Create that failed or timed out, and it isn't charged twice. Returns { success, post_id, media_url, template, charged, warnings }: warnings are IQEX's notes on the image it made (a photo slot left blank, the logo left off); when there are any, tell the person and have them check the image before publishing. Photos sent and NONE placed is a 422 and no draft is saved; IQEX has usually charged by then, and the message says so.",
    inputSchema: {
      type: "object",
      required: ["template"],
      properties: {
        template: { type: "string", description: "A slug from uiiq_social_promo_templates, e.g. promo-collection-4x5" },
        fields: { type: "object", additionalProperties: { type: "string" }, description: "The layout's text fields, e.g. { headline, price_line, cta, item1_name, item1_price }" },
        photos: { type: "array", items: { type: "object", properties: { assetId: { type: "integer" }, url: { type: "string" }, fit: { type: "string", enum: ["fill", "whole"], description: "fill (default) or whole: the whole photo on a blur of itself (round products keep their rim)" } } }, description: "In slot order: { assetId } or { url } (https), each with fit?" },
        colours: { type: "object", additionalProperties: { type: "string" }, description: "The layout's colour fields as hex, e.g. { bg_colour: '#020017' }" },
        content: { type: "string", description: "The post's own text" },
        hashtags: { type: "array", items: { type: "string" } },
        requestId: { type: "string", description: "Leave out for a fresh one; the same one retries without a second charge" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, requestId, ...body }) {
      const id = requestId || `promo-${randomUUID()}`;
      const res = await send(tenant, "/socials/promo-templates", "POST", { ...body, requestId: id });
      if (!res.ok) throw await fail(res);
      return { ...(await res.json()), requestId: id };
    },
  },
  {
    name: "uiiq_social_post_carousel_ad",
    description: `Make a Meta carousel ad from a PUBLISHED promo post (its image is public then; a draft's never is): a NEW campaign, ad set and ad in the workspace's own Meta ad account, ALL PAUSED. Card 1 is the post's collection image, or a video (collectionVideo: one of the context's videos[].ref, a published post's MP4 or the media library's); then 1 to 9 of the shop's products, each { productId, photoIndex } from uiiq_social_promo_products (photoIndex 0 = the main photo, then the mockups): UiiQ reads each one's photo and page from the shop's feed itself, so no other image or link can get into an ad. linkUrl must be on the workspace's website or its shop. Website events go on the workspace's own Meta pixel (trackWebsiteEvents, default on when it has one; a pixel is never named here); objective OUTCOME_TRAFFIC (default) or OUTCOME_SALES, which needs website events; urlTags are the URL parameters on every card's link (key=value joined by &, no spaces, at most 1000 characters; "" for none; left out, UiiQ's UTM default). Without confirm: true this is a DRY RUN: it returns the form's context (adAccount, the connected Facebook pages to pick pageId from, collectionImage, videos, pixelId, defaults), each card's type (photo or video) and what would be sent, and nothing is made. Only pass confirm: true once the person responsible has seen it and said to make it. ${CAROUSEL_RUN_IT} dailyBudgetPence: 100 to 1000 (£1 to £10 a day). Owners and admins only, at most 10 an hour, needs the Social Templates feature. requestId: leave it out for a fresh one; after a timeout (504) retry with the SAME one, which never makes a second ad. A 409 means that request has ENDED (it failed, or Meta may already have made it): it is never sent again, and you never send it again with a new requestId by yourself; a new requestId is only for the person's own Try again, after they've checked Ads Manager. A 429 means IQEX has three going and nothing was made: the SAME requestId can go again in a minute. "Meta ads aren't switched on for this workspace yet" (a 502) and a 403 that the ad account or Page isn't registered are both for UiiQ support. Meta's own reason comes back in error, as a 502. Returns { campaignId, adSetId, adId, adsManagerUrl, status: PAUSED, duplicate, requestId } when it's made at once. IQEX usually takes about a minute and makes it in the background: then this returns { status: "running", requestId } (also when UiiQ didn't answer in time), and uiiq_social_carousel_ad_status with the same id and requestId says when it's done (ask every few seconds, for up to about 3 minutes; with a video card, every 10 seconds for up to 12 minutes, while Meta processes the video: the answer says video: true).`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", description: "The published promo post" },
        pageId: { type: "string", description: "One of the context's pages[].id: the Facebook Page the ad runs as" },
        name: { type: "string", description: "The campaign/ad name, at most 200 characters" },
        dailyBudgetPence: { type: "integer", minimum: 100, maximum: 1000, description: "100 to 1000 (£1 to £10 a day)" },
        countries: { type: "array", items: { type: "string" }, description: "Two-letter codes, e.g. [\"GB\"]" },
        primaryText: { type: "string", description: "The ad's text, at most 2000 characters" },
        headline: { type: "string", description: "At most 255 characters" },
        ctaType: { type: "string", enum: ["SHOP_NOW", "LEARN_MORE", "ORDER_NOW", "BUY_NOW", "SIGN_UP", "SUBSCRIBE", "GET_OFFER", "CONTACT_US", "BOOK_TRAVEL"] },
        linkUrl: { type: "string", description: "https: where the collection card (card 1) goes, usually the shop" },
        collectionName: { type: "string", description: "Card 1's name, at most 100 characters" },
        products: {
          type: "array", minItems: 1, maxItems: 9,
          items: { type: "object", additionalProperties: false, required: ["productId"], properties: { productId: { type: "string", description: "A product id from uiiq_social_promo_products" }, photoIndex: { type: "integer", minimum: 0, description: "Which of its photos: 0 = the main one (default), then the mockups" }, name: { type: "string", description: "The card's name, at most 100 characters (default: \"title · price\")" }, description: { type: "string", description: "At most 200 characters" } } },
          description: "Cards 2 to 10, in order: the shop's products",
        },
        collectionVideo: {
          type: "object", additionalProperties: false,
          properties: { postId: { type: "string", description: "A published post with a public MP4 (the context's videos[].ref)" }, assetId: { type: "integer", description: "A media library video (the context's videos[].ref)" } },
          description: "Card 1 as a video instead of the collection image: exactly one of postId or assetId, from the context's videos",
        },
        trackWebsiteEvents: { type: "boolean", description: "Website events on the workspace's own Meta pixel (default: on when it has one)" },
        urlTags: { type: "string", description: "URL parameters on every card's link: key=value pairs joined by &, no spaces, at most 1000 characters; \"\" for none; left out, UiiQ's UTM default" },
        objective: { type: "string", enum: ["OUTCOME_TRAFFIC", "OUTCOME_SALES"], description: "OUTCOME_TRAFFIC (default) or OUTCOME_SALES (needs website events)" },
        requestId: { type: "string", description: "Leave out for a fresh one; the same one retries without making a second" },
        confirm: { type: "boolean", description: "true to really make the (paused) ad; anything else is a dry run" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, confirm, requestId, pageId, name, dailyBudgetPence, countries, primaryText, headline, ctaType, linkUrl, collectionName, products, collectionVideo, trackWebsiteEvents, urlTags, objective }) {
      const path = `/socials/posts/${encodeURIComponent(id)}/carousel-ad`;
      // Named fields only, whatever else a caller passes (Lucas, on #109 L1).
      const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
      const body = defined({
        pageId, name, dailyBudgetPence, countries, primaryText, headline, ctaType, linkUrl, collectionName,
        products: Array.isArray(products) ? products.map((p) => defined({ productId: p?.productId, photoIndex: p?.photoIndex, name: p?.name, description: p?.description })) : products,
        collectionVideo: collectionVideo && typeof collectionVideo === "object" ? defined({ postId: collectionVideo.postId, assetId: collectionVideo.assetId }) : collectionVideo,
        trackWebsiteEvents, urlTags, objective,
      });
      // Each card's type, for the person to see: card 1 a video when collectionVideo is set; the products are photos.
      const cards = [{ card: 1, type: body.collectionVideo ? "video" : "photo" }, ...(Array.isArray(body.products) ? body.products : []).map((p, i) => ({ card: i + 2, type: "photo", productId: p.productId }))];
      if (confirm !== true) {
        const preview = await api(tenant)(path);
        if (!preview.ok) throw await fail(preview);
        return {
          dryRun: true,
          message: `Nothing was made. Pass confirm: true to make it, only once the person responsible has seen this. ${CAROUSEL_RUN_IT}`,
          context: await preview.json(),
          cards,
          wouldSend: body,
        };
      }
      const rid = requestId || `ad-${randomUUID()}`;
      const res = await send(tenant, path, "POST", { ...body, requestId: rid }).catch(() => null);
      // Being made in the background (202), or no answer in time: follow it with the status tool.
      if (!res || res.status === 202 || res.status === 504) {
        // A video card: IQEX says video: true (and Meta processes it for up to 10 minutes).
        let first = null;
        if (res) {
          const text = await res.text().catch(() => "");
          try { first = JSON.parse(text); } catch { /* not JSON */ }
        }
        const video = !!body.collectionVideo || first?.video === true;
        return { status: "running", requestId: rid, video, next: CAROUSEL_FOLLOW(id, rid, video) };
      }
      if (!res.ok) {
        // The id this call made, so a 504 or a "still being made" 409 can be retried with it, never a second ad (Lucas, on #111 L-D).
        const e = await fail(res);
        // 429: nothing made, the same id can go again. 409: that request has ended, never send it again (Gatekeeper and Lucas, 19 Oct 2026).
        e.message += res.status === 429
          ? ` (requestId: ${rid}: nothing was made; the same one can go again in a minute)`
          : res.status === 409
            ? ` (requestId: ${rid} has ended: never send it again; a new requestId only if the person asks, after checking Ads Manager)`
            : ` (requestId: ${rid})`;
        throw e;
      }
      return { ...(await res.json()), requestId: rid, note: CAROUSEL_RUN_IT };
    },
  },
  {
    name: "uiiq_social_post_collection_ad",
    description: `Make a Meta COLLECTION ad from a PUBLISHED promo post: the post's image as the hero picture, with a shop collection's products underneath (collection: one of the context's collections[].label, the feed's custom_label_0; IQEX keeps the set in step with the feed; at least 4 products) or 4 to 50 hand-picked productIds from uiiq_social_promo_products. Each opens its own product (an Instant Experience). A NEW campaign, ad set and ad in the workspace's own Meta ad account, ALL PAUSED. Needs the workspace's Meta product catalogue set by a platform admin (uiiq_admin_ad_account_set platform META_CATALOG); the context's catalogue: false means "No product catalogue is connected yet" and nothing can be made. Without confirm: true this is a DRY RUN: UiiQ checks everything and answers what would be made (wouldSend, the collection's products) plus the form's context (pages, instagram, collections with counts, pixelId, defaults); nothing is made. Only pass confirm: true once the person responsible has seen it and said to make it. ${CAROUSEL_RUN_IT} dailyBudgetPence: 100 to 1000 (£1 to £10 a day). ctaType: SHOP_NOW, LEARN_MORE, BUY_NOW or ORDER_NOW. Website events (trackWebsiteEvents) are only ever on the workspace's own pixel (default on when it has one); objective OUTCOME_SALES needs them; urlTags are added to every link (default UiiQ's utm tags, "" for none). Owners and admins only, at most 10 an hour, needs the Social Templates feature. IQEX makes it in the background (about a minute): a 202 answers { status: running, requestId }; follow it with uiiq_social_post_collection_ad_status and that requestId, never by making it again. requestId: leave it out for a fresh one (coll-…); retrying the SAME one never makes a second ad. A failure carries Meta's own words; a 409 "may already have made" means check Ads Manager first. Done: { campaignId, adSetId, adId, creativeId, canvasId, productSetId, adsManagerUrl, status: PAUSED }.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", description: "The published promo post" },
        collection: { type: "string", maxLength: 100, description: "A shop collection: one of the context's collections[].label (e.g. \"Calm & Wellbeing Collection\")" },
        productIds: { type: "array", minItems: 4, maxItems: 50, items: { type: "string" }, description: "Or 4 to 50 hand-picked product ids from uiiq_social_promo_products" },
        pageId: { type: "string", description: "One of the context's pages[].id: the Facebook Page the ad runs as" },
        instagramActorId: { type: "string", description: "Optional: one of the context's instagram[].id (on that Page)" },
        name: { type: "string", description: "The campaign/ad name, at most 200 characters" },
        dailyBudgetPence: { type: "integer", minimum: 100, maximum: 1000, description: "100 to 1000 (£1 to £10 a day)" },
        countries: { type: "array", items: { type: "string" }, description: "Two-letter codes, e.g. [\"GB\"]" },
        primaryText: { type: "string", description: "The ad's text, at most 2000 characters" },
        headline: { type: "string", description: "At most 255 characters" },
        ctaType: { type: "string", enum: ["SHOP_NOW", "LEARN_MORE", "BUY_NOW", "ORDER_NOW"] },
        linkUrl: { type: "string", description: "https: where the button goes (default: the collection's page from the post's text)" },
        trackWebsiteEvents: { type: "boolean", description: "Website events on the workspace's own Meta pixel (default: on when it has one)" },
        urlTags: { type: "string", maxLength: 1000, description: "URL parameters on every link; \"\" for none" },
        objective: { type: "string", enum: ["OUTCOME_TRAFFIC", "OUTCOME_SALES"], description: "Traffic (default) or Sales (needs website events)" },
        requestId: { type: "string", description: "Leave out for a fresh one (coll-…); the same one retries without making a second" },
        confirm: { type: "boolean", description: "true to really make the (paused) ad; anything else is a dry run" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, confirm, requestId, collection, productIds, pageId, instagramActorId, name, dailyBudgetPence, countries, primaryText, headline, ctaType, linkUrl, trackWebsiteEvents, urlTags, objective }) {
      const path = `/socials/posts/${encodeURIComponent(id)}/collection-ad`;
      const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
      const body = defined({ collection, productIds, pageId, instagramActorId, name, dailyBudgetPence, countries, primaryText, headline, ctaType, linkUrl, trackWebsiteEvents, urlTags, objective });
      if (confirm !== true) {
        const preview = await api(tenant)(path);
        if (!preview.ok) throw await fail(preview);
        const context = await preview.json();
        // UiiQ's own dry run (nothing kept or sent), with the context's defaults for what wasn't given.
        const d = context.defaults ?? {};
        const dry = await send(tenant, path, "POST", {
          pageId: context.pages?.[0]?.id, name: d.name, primaryText: d.primaryText, linkUrl: d.linkUrl, ctaType: d.ctaType, countries: d.countries, dailyBudgetPence: d.dailyBudgetPence,
          ...body, dryRun: true,
        });
        const wouldMake = dry.ok ? await dry.json() : { refused: (await fail(dry)).message };
        return {
          dryRun: true,
          message: `Nothing was made. Pass confirm: true to make it, only once the person responsible has seen this. ${CAROUSEL_RUN_IT}`,
          context,
          wouldMake,
        };
      }
      const rid = requestId || `coll-${randomUUID()}`;
      const res = await send(tenant, path, "POST", { ...body, requestId: rid });
      if (!res.ok) {
        const e = await fail(res);
        e.message += ` (requestId: ${rid})`;
        throw e;
      }
      const out = await res.json();
      if (res.status === 202) return { ...out, requestId: rid, note: `Being made. Ask uiiq_social_post_collection_ad_status with requestId ${rid} every few seconds, for up to about 3 minutes. ${CAROUSEL_RUN_IT}` };
      return { ...out, requestId: rid, note: CAROUSEL_RUN_IT };
    },
  },
  {
    name: "uiiq_social_post_collection_ad_status",
    description: "Where a collection ad of a post is (after uiiq_social_post_collection_ad answered running): { status: running | done | failed | unknown, requestId, ... }. running: ask again in a few seconds, for up to about 3 minutes. done: campaignId, adSetId, adId, creativeId, canvasId, productSetId, adsManagerUrl, adStatus PAUSED. failed: nothing was made; error carries Meta's own words; make it again only as a new ad (a new requestId). unknown: Meta may already have made it: tell the person to check Ads Manager, and never make it again yourself. Without requestId, the post's latest. Asking never makes a second ad (it may send the SAME request to IQEX again, which IQEX never makes twice). Owners and admins only.",
    inputSchema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" }, requestId: { type: "string", description: "The coll-… id the make call returned" }, tenant: TENANT_PROP } },
    async handler({ id, requestId, tenant }) {
      const qs = requestId ? `?requestId=${encodeURIComponent(requestId)}` : "";
      const res = await api(tenant)(`/socials/posts/${encodeURIComponent(id)}/collection-ad/status${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_post_publish_status",
    description: "Where a post's Facebook and Instagram targets are while IQEX posts them in the background (after uiiq_social_post_publish answered posting; it can take a minute): { status, posting, targets: [{ id, platform, status, label, permalink, errorMessage }] }. A target's status is PUBLISHING (still posting: ask again in a few seconds, for up to about 3 minutes), PUBLISHED (with its link), FAILED (nothing was posted), or NEEDS_CHECK: it may have been posted, so tell the person to check the Page/Instagram before posting again, and never publish it again yourself. Asking never posts anything again.",
    inputSchema: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/socials/posts/${encodeURIComponent(id)}/publish-status`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_social_carousel_post",
    description: "Make a DRAFT carousel post from a shop collection promo post (any status): slide 1 is its promo card, then 1 to 9 of the shop's products in the order given, each { productId, photoIndex } from uiiq_social_promo_products (photoIndex 0 = the main photo, then the mockups). UiiQ reads each photo from the shop's feed itself, so no other image can get in. The new draft gets the promo post's text, hashtags and accounts. NOTHING IS PUBLISHED: a person reviews and publishes it in UiiQ. Facebook and Instagram take a post of 2 or more images only once UiiQ's multi-image switch is on; until then publishing it to them is refused (409). A post that isn't a collection promo's is refused (400). Needs the Social Templates feature; at most 30 an hour. Returns { postId, mediaUrls, slides }.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "products"],
      properties: {
        id: { type: "string", description: "The shop collection promo post" },
        products: {
          type: "array", minItems: 1, maxItems: 9,
          items: { type: "object", additionalProperties: false, required: ["productId"], properties: { productId: { type: "string", description: "A product id from uiiq_social_promo_products" }, photoIndex: { type: "integer", minimum: 0, description: "Which of its photos: 0 = the main one (default), then the mockups" } } },
          description: "Slides 2 to 10, in order: the shop's products",
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, products }) {
      // Only each product's id and photo number, whatever else a caller passes.
      const picks = Array.isArray(products) ? products.map((p) => Object.fromEntries(Object.entries({ productId: p?.productId, photoIndex: p?.photoIndex }).filter(([, v]) => v !== undefined))) : products;
      const res = await send(tenant, `/socials/posts/${encodeURIComponent(id)}/carousel-post`, "POST", { products: picks });
      if (!res.ok) throw await fail(res);
      return { ...(await res.json()), note: "A DRAFT: nothing was published. A person reviews and publishes it in UiiQ." };
    },
  },

  {
    name: "uiiq_social_carousel_ad_status",
    description: `Where a carousel ad made with uiiq_social_post_carousel_ad is, after it answered { status: "running" }: IQEX makes it in the background (about a minute). Ask every few seconds, for up to about 3 minutes; for a video ad (video: true) every 10 seconds for up to 12 minutes, while Meta processes the video (step: "processing_video"). Returns { status: "running", requestId, video, step? } while it's being made; { status: "done", campaignId, adSetId, adId, adsManagerUrl, adStatus: "PAUSED" } once made (${CAROUSEL_RUN_IT}); { status: "failed", error } when it ended without an ad (nothing is sent again; a new requestId only when the person asks to try again); or { status: "unknown", error }: Meta may have made it, so check Ads Manager before making another. Without requestId, the post's latest carousel ad. Asking never makes a second ad. Owners and admins only; needs the Social Templates feature.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", description: "The promo post the ad was made from" },
        requestId: { type: "string", description: "The requestId uiiq_social_post_carousel_ad returned (default: the post's latest)" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, requestId, tenant }) {
      const qs = requestId ? `?requestId=${encodeURIComponent(requestId)}` : "";
      const res = await api(tenant)(`/socials/posts/${encodeURIComponent(id)}/carousel-ad/status${qs}`);
      if (!res.ok) throw await fail(res);
      const s = await res.json();
      return s.status === "done" ? { ...s, note: CAROUSEL_RUN_IT } : s;
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
