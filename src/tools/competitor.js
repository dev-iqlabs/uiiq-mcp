import { apiClient } from "../auth.js";

// The companies a tenant watches (Dashboard → Ads → Competitors). A competitor
// is a company, not a domain: it can trade from several domains, and carries a
// priority, a market, a Facebook Page ID, social profiles and notes. Every
// competitor comes back with `adLibrary` — deep links to their ads in Meta's
// public Ad Library for their market. With a Page ID the link is pinned to
// that advertiser (`exact: true`); without one it is a keyword search on the
// name, which also returns anyone else using the word.
// Needs the ads_search feature and the ads tier that includes competitors.
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

const PROFILE_PROPS = {
  name: { type: "string", description: "The company's name, e.g. 'amuseapp srl'." },
  domains: {
    type: "array",
    items: { type: "string" },
    description:
      "Their website domains, e.g. ['amuseapp.art', 'amuseapp.it']. URLs are cut down to the hostname. Entries that are not domains come back in `rejected`, not stored.",
  },
  priority: { type: "string", enum: ["MAIN", "WATCH"], description: "MAIN = a direct competitor. Default WATCH." },
  market: { type: "string", description: "Two-letter country the Ad Library links open on. Default GB." },
  metaPageId: {
    type: "string",
    description:
      "Their Facebook Page ID (a number), or the Ad Library URL copied after clicking the advertiser (it carries view_all_page_id). A facebook.com/<handle> URL does not contain the ID and is refused. Check the 'Advertiser and payer' on a live ad first — same-name companies are common.",
  },
  adLibraryQuery: {
    type: "string",
    description: "Keyword for the Ad Library link when there is no Page ID. Defaults to the name.",
  },
  socialHandles: {
    type: "object",
    description: "Handles or URLs keyed by facebook, instagram, linkedin, tiktok, youtube, x.",
    properties: {
      facebook: { type: "string" },
      instagram: { type: "string" },
      linkedin: { type: "string" },
      tiktok: { type: "string" },
      youtube: { type: "string" },
      x: { type: "string" },
    },
  },
  notes: { type: "string", description: "Who they are, which of our products they compete with, what to watch for." },
};
const PROFILE_KEYS = Object.keys(PROFILE_PROPS);

function profileBody(args) {
  const body = {};
  for (const key of PROFILE_KEYS) if (args[key] !== undefined) body[key] = args[key];
  return body;
}

export const competitorTools = [
  {
    name: "uiiq_competitor_list",
    description:
      "The tenant's tracked competitors, main ones first — each with its domains, profile and `adLibrary.activeUrl` / `allUrl` links to their live (or all) ads in Meta's Ad Library.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/ads/competitors");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_competitor_add",
    description:
      "Start tracking a competitor. Give a name, at least one domain, or both. If one of the domains is already tracked, the profile is added to the competitor that owns it rather than creating a second one.",
    inputSchema: { type: "object", properties: { ...PROFILE_PROPS, tenant: TENANT_PROP } },
    async handler({ tenant, ...args } = {}) {
      const body = profileBody(args);
      if (!body.name && !body.domains?.length) throw new Error("Give the competitor a name or at least one domain.");
      const res = await api(tenant)("/ads/competitors", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      const { competitor, rejected } = await res.json();
      return { competitor, rejected };
    },
  },
  {
    name: "uiiq_competitor_update",
    description:
      "Change a competitor's profile. Only the fields you send change; sending `domains` replaces the whole list. A domain that belongs to another competitor is refused.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Competitor id from uiiq_competitor_list." },
        ...PROFILE_PROPS,
        clearMetaPageId: { type: "boolean", description: "True to remove the Facebook Page ID." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, clearMetaPageId, ...args }) {
      const body = profileBody(args);
      if (clearMetaPageId) body.metaPageId = null;
      const res = await api(tenant)(`/ads/competitors/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_competitor_remove",
    description: "Stop tracking a competitor and all of its domains.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/ads/competitors/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_competitor_research",
    description:
      "A competitor's research: run history (each source as 'N found' or 'could not look' with the reason — an unreadable source is null, never zero), what changed since the previous run, the ads from the latest run that could read them, and the repeat cadence. Also `analysis`, the figures behind the ads report: when `found` is true — counts, launchesPerMonth (silent months included), runLengths, longestLive (the winners, ranked by run length, needs no reach), reach, hooks and segments (allTime vs live; `dropped` = tried and abandoned), headlines, landingHosts, languages, platforms, targeting, localisationFlags. Any section Meta or IQEX could not supply is {available: false, reason, detail}: quote `reason`, which is written for people; `detail` is IQEX's own technical text. `newerRunFailed` set means the figures are from an older run. Who paid for the ads is deliberately never included. Costs nothing.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/ads/competitors/${encodeURIComponent(id)}/research`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_competitor_research_run",
    description:
      "Research a competitor now on IQEX (ads, Google results, keywords). SPENDS the tenant's IQEX credits — one research run per call, charged even when every source was unavailable. Takes up to 30s; `pending: true` means it outlived the wait and will finish on its own — read uiiq_competitor_research in a minute rather than running it again.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/ads/competitors/${encodeURIComponent(id)}/research`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_competitor_research_schedule",
    description:
      "How often IQEX re-researches a competitor on its own: WEEKLY, MONTHLY, or OFF. Every scheduled run spends credits like a manual one.",
    inputSchema: {
      type: "object",
      required: ["id", "cadence"],
      properties: {
        id: { type: "string" },
        cadence: { type: "string", enum: ["WEEKLY", "MONTHLY", "OFF"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, cadence, tenant }) {
      const res = await api(tenant)(`/ads/competitors/${encodeURIComponent(id)}/research/schedule`, {
        method: "PUT",
        body: JSON.stringify({ cadence: cadence === "OFF" ? null : cadence }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_competitor_signals",
    description:
      "Competitor watch hits (UiiQ #716): a rule such as 'tell me when their live ad count rises by 25/50/100/200%' fired on a research run. Unacknowledged only unless all: true. Each hit is one row per (competitor, rule, run), so a run fires once; the morning brief carries each once too.",
    inputSchema: { type: "object", properties: { all: { type: "boolean", description: "Include acknowledged hits" }, tenant: TENANT_PROP } },
    async handler({ all, tenant } = {}) {
      const res = await api(tenant)(`/ads/competitors/signals${all ? "?all=1" : ""}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_competitor_signal_acknowledge",
    description: "Mark a competitor watch hit as seen: it leaves the Triggered panel and the brief.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "signal id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/ads/competitors/signals/${encodeURIComponent(id)}`, { method: "PATCH" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_competitor_watch_rule",
    description: "Set a competitor's watch rule: watchLiveAdsJumpPct = tell me when their live ad count rises by this % between research runs (25, 50, 100 or 200), null to switch it off. Evaluated by the daily cron and after every 'Research now'.",
    inputSchema: { type: "object", required: ["id", "watchLiveAdsJumpPct"], properties: { id: { type: "string" }, watchLiveAdsJumpPct: { type: ["number", "null"] }, tenant: TENANT_PROP } },
    async handler({ id, watchLiveAdsJumpPct, tenant }) {
      const res = await api(tenant)(`/ads/competitors/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ watchLiveAdsJumpPct }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_admin_competitor_research_block",
    description:
      "SUPER_ADMIN only, not while impersonating: honour a business's objection to competitor research (Kim, LEGAL-DECISIONS-2026-09-22 s.5) across EVERY tenant. Without confirm: true it is ALWAYS a dry run listing what it would block — send that first and check the matches (a name matches every business of that name). reference is the ticket (OBJ-2026-0001) and nothing else — never the objector's name or contact details. Give name (two words or more), domains and/or metaPageId. There is no unblock. Rides the stored SUPER_ADMIN login; no tenant argument.",
    inputSchema: {
      type: "object",
      required: ["reference"],
      properties: {
        reference: { type: "string" }, name: { type: "string" }, domains: { type: "array", items: { type: "string" } }, metaPageId: { type: "string" },
        receivedAt: { type: "string", description: "ISO date the objection arrived" }, confirm: { type: "boolean", description: "true = apply; omit for the dry run" },
      },
    },
    async handler(body) {
      const res = await apiClient()("/admin/competitors/research-block", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
