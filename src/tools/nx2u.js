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

// NX2U — the live streaming engine (Phase 1): channels, events, the control
// room (provision a stream, running order, slate, end, replay) and the
// tenant's video library. GATED: needs the `nx2u` feature AND the platform
// switches, which are OFF until Steve turns them on; until then the API
// refuses with a clear message. Stream keys and PINs are returned once, by
// deliberate acts that are audit-logged — never stored by these tools.
const EVENT_KINDS = ["OPEN_MIC", "FUNERAL", "WEDDING", "SHOW", "CORPORATE", "CHARITY", "AUCTION", "SHOPPING", "OTHER"];
const TIERS = ["CREW", "SELF"];
const ACCESS = ["PUBLIC", "UNLISTED", "PIN"];
const COMMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

/** A copy with every key that names an email dropped, at any depth: a viewer's email never leaves through a tool. */
export function withoutEmail(value) {
  if (Array.isArray(value)) return value.map(withoutEmail);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => !/e[\W_]*mail/i.test(k)).map(([k, v]) => [k, withoutEmail(v)]));
}

export const nx2uTools = [
  {
    name: "uiiq_nx2u_channel_list",
    description: "The tenant's NX2U channels (each a public face at its own URL) with event counts. Needs the nx2u feature.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/nx2u/channels");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_channel_create",
    description: "A new channel (owner/admin). visibility PUBLIC (listed) or UNLISTED (default); defaultAccess is what new events get.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" }, slug: { type: "string" }, visibility: { type: "string", enum: ["PUBLIC", "UNLISTED"] }, defaultAccess: { type: "string", enum: ACCESS }, branding: { type: "object" }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/nx2u/channels", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_channel_update",
    description: "Edit a channel's name, slug, visibility, defaultAccess or branding (owner/admin).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, visibility: { type: "string", enum: ["PUBLIC", "UNLISTED"] }, defaultAccess: { type: "string", enum: ACCESS }, branding: { type: "object" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/nx2u/channels/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_channel_delete",
    description: "Delete a channel (owner/admin). Refused while it has events.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/nx2u/channels/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_list",
    description: "The tenant's events, newest first, optionally one channel's. Status is derived without asking the provider, so a live event shows READY until its control room is opened.",
    inputSchema: { type: "object", properties: { channelId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ channelId, tenant } = {}) {
      const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : "";
      const res = await api(tenant)(`/nx2u/events${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_get",
    description: "The control room's view of one event: the provider is asked, so status and viewers are live. The stream key is never here (uiiq_nx2u_event_ingest).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/nx2u/events/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_create",
    description:
      `A new event. kind is one of ${EVENT_KINDS.join(", ")}; a FUNERAL must be PIN access; a SHOPPING event (a presenter selling the shop's own products) must be PUBLIC or UNLISTED, never PIN. access PUBLIC, UNLISTED (default) or PIN — a PIN is minted and returned ONCE in this response. An UNLISTED event's link carries a random slug, nothing from the title. Provisioning the stream is a separate owner/admin step (uiiq_nx2u_event_provision). Returns { event: { id, slug, watchUrl }, pin }.`,
    inputSchema: {
      type: "object",
      required: ["title", "scheduledStart"],
      properties: {
        title: { type: "string" }, kind: { type: "string", enum: EVENT_KINDS }, channelId: { type: "string" },
        scheduledStart: { type: "string", description: "ISO date-time" }, scheduledEnd: { type: "string" },
        access: { type: "string", enum: ACCESS }, tier: { type: "string", enum: TIERS, description: "CREW = we run it; SELF = the tenant runs it" }, replayDays: { type: "number" }, recordVod: { type: "boolean" },
        licenceRef: { type: "string" }, externalRef: { type: "string" }, tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/nx2u/events", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_update",
    description: "Edit an event: title, kind, scheduledStart, scheduledEnd, access, tier, replayDays, licenceRef. Switching access to PIN mints one, returned once. A FUNERAL stays PIN and a SHOPPING event never becomes PIN (checked against the stored event too). Switching to UNLISTED gives the event a new random slug, so its old link stops working.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }, title: { type: "string" }, kind: { type: "string", enum: EVENT_KINDS }, scheduledStart: { type: "string" }, scheduledEnd: { type: ["string", "null"] },
        access: { type: "string", enum: ACCESS }, tier: { type: "string", enum: TIERS }, replayDays: { type: "number" }, licenceRef: { type: ["string", "null"] }, tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/nx2u/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_provision",
    description: "Create the stream on the provider and return the encoder settings, KEY INCLUDED (owner/admin; audit-logged). Idempotent: calling again returns the same key. Anyone with the key can broadcast as this event — handle it like a password.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/nx2u/events/${encodeURIComponent(id)}/provision`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_ingest",
    description: "Show the encoder settings (with the key) again for a provisioned event. Owner/admin; audit-logged.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/nx2u/events/${encodeURIComponent(id)}/ingest`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_pin_rotate",
    description: "A new PIN for a PIN-protected event, returned once; the old one stops working at once, so the family needs the new link. Owner/admin.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/nx2u/events/${encodeURIComponent(id)}/pin`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_segments_set",
    description: "Replace an event's running order. Each segment: { position, label, kind (PERFORMANCE, CLASS, LOT, SPEAKER, SERVICE_PART, RECORDED_MUSIC, BREAK; default PERFORMANCE), musicType (NONE|LIVE|RECORDED), consentStream, consentClips, isMinor, doNotStream, externalRef? }. A segment without consentStream is slated; recorded music is slated under the licence profile; the engine derives the state rather than trusting one.",
    inputSchema: { type: "object", required: ["id", "segments"], properties: { id: { type: "string" }, segments: { type: "array", items: { type: "object" } }, tenant: TENANT_PROP } },
    async handler({ id, segments, tenant }) {
      const res = await api(tenant)(`/nx2u/events/${encodeURIComponent(id)}/segments`, { method: "PUT", body: JSON.stringify(segments) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_segment_mark",
    description: "The control room's big buttons: this part is on now (start), has finished (end), or clear the marker. Starting one ends whatever was running.",
    inputSchema: { type: "object", required: ["id", "segmentId", "action"], properties: { id: { type: "string" }, segmentId: { type: "string" }, action: { type: "string", enum: ["start", "end", "clear"] }, tenant: TENANT_PROP } },
    async handler({ id, segmentId, action, tenant }) {
      const res = await api(tenant)(`/nx2u/events/${encodeURIComponent(id)}/segments/${encodeURIComponent(segmentId)}`, { method: "POST", body: JSON.stringify({ action }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_slate",
    description: "'Slate now' (on: true) shows viewers the holding card within ~10 s; 'Back on air' (on: false). Any staff member.",
    inputSchema: { type: "object", required: ["id", "on"], properties: { id: { type: "string" }, on: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ id, on, tenant }) {
      const res = await api(tenant)(`/nx2u/events/${encodeURIComponent(id)}/slate`, { method: "POST", body: JSON.stringify({ on }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_end",
    description: "The event is over: the replay window starts and the recording is looked for. Cannot be undone.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/nx2u/events/${encodeURIComponent(id)}/end`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_event_replay_check",
    description: "Ask the provider again for the recording of an ended event. Returns { hasReplay }.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/nx2u/events/${encodeURIComponent(id)}/replay`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_library",
    description: "The tenant's video library (Bunny or Cloudflare), keys masked.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/nx2u/library");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_library_set",
    description: "Record (or re-key) the tenant's video library (owner/admin). The apiKey is verified against the provider before anything is stored; it is a credential that spends the tenant's delivery.",
    inputSchema: {
      type: "object",
      required: ["libraryId", "playbackHost"],
      properties: { provider: { type: "string", enum: ["BUNNY", "CLOUDFLARE"] }, libraryId: { type: "string" }, apiKey: { type: "string" }, tokenAuthKey: { type: ["string", "null"] }, playbackHost: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/nx2u/library", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_library_verify",
    description: "Check again whether the tenant's video library ENFORCES token authentication with its stored signing key (owner/admin): UIIQ asks the pull zone for an unsigned and a signed address and records the answer. PIN and UNLISTED streams play only while it is verified; run it after switching token authentication on in the library, and on every library with a key after UiiQ's R150 follow-up is deployed. Returns { library: { tokenAuthVerified, tokenAuthCheckedAt, … }, tokenAuth: { verified, reason } }.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/nx2u/library/verify", { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_nx2u_usage",
    description: "The tenant's last twelve months of NX2U delivery: viewer-seconds, GB, events.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/nx2u/usage");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // Live shopping comments and ratings from the shop's /live page (NX2U plan section 8). Every comment waits
  // for staff approval before it shows, and shows only while the show is live; only the shop replies. A
  // viewer's email is never returned: UIIQ sends none, and these tools drop any key named like one anyway.
  {
    name: "uiiq_nx2u_comment_shows",
    description: "The tenant's live shows that have viewer comments, latest first: { shows: [{ showRef, title, start, pending, approved, rejected, lastAt }] }. showRef is the show's reference from the shop's Connect ('wc-' + its show id). Needs the nx2u feature.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/nx2u/comments/shows");
      if (!res.ok) throw await fail(res);
      return withoutEmail(await res.json());
    },
  },
  {
    name: "uiiq_nx2u_comment_list",
    description: `One show's viewer comments in one state: ${COMMENT_STATUSES.join(", ")} (default PENDING, the queue to approve). Each is { id, showRef, firstName, text, status, at, moderatedAt, reply }. Never the viewer's email.`,
    inputSchema: {
      type: "object",
      required: ["show"],
      properties: { show: { type: "string", description: "The show's reference (uiiq_nx2u_comment_shows)" }, status: { type: "string", enum: COMMENT_STATUSES }, tenant: TENANT_PROP },
    },
    async handler({ show, status = "PENDING", tenant }) {
      const res = await api(tenant)(`/nx2u/comments?show=${encodeURIComponent(show)}&status=${encodeURIComponent(status)}`);
      if (!res.ok) throw await fail(res);
      return withoutEmail(await res.json());
    },
  },
  {
    name: "uiiq_nx2u_comment_moderate",
    description: "Approve a viewer's comment so it shows on the shop's /live page while the show is live (optionally with the shop's reply), reject it (its reply goes too), or reply to an approved one (reply: '' takes the reply off). Only the shop can reply; viewers can't reply to each other. Returns { comment }, never the viewer's email.",
    inputSchema: {
      type: "object",
      required: ["id", "action"],
      properties: {
        id: { type: "string" },
        action: { type: "string", enum: ["approve", "reject", "reply"] },
        reply: { type: "string", description: "The shop's reply, plain text, up to 500 characters. Needed for reply; optional with approve." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, action, reply, tenant }) {
      const body = reply === undefined ? { action } : { action, reply };
      const res = await api(tenant)(`/nx2u/comments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return withoutEmail(await res.json());
    },
  },
  {
    name: "uiiq_nx2u_comment_settings_get",
    description: "Whether the shop's /live page takes comments and ratings (off until an owner or admin turns it on), how many days viewers' emails and comments not approved are kept (default 30), and the words for the page, the privacy notice and staff (Kim's; nothing is taken while they are placeholders: wordsReady false).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/nx2u/comments/settings");
      if (!res.ok) throw await fail(res);
      return withoutEmail(await res.json());
    },
  },
  {
    name: "uiiq_nx2u_comment_settings_set",
    description: "Turn live comments and ratings on or off for the shop's /live page, or set the retention period in days, 1 to 90 (owner/admin). A shorter period applies to comments already held; a longer one only to new ones.",
    inputSchema: { type: "object", properties: { enabled: { type: "boolean" }, retentionDays: { type: "number", minimum: 1, maximum: 90 }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/nx2u/comments/settings", { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return withoutEmail(await res.json());
    },
  },
];
