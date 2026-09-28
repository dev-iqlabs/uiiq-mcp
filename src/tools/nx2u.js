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
const EVENT_KINDS = ["OPEN_MIC", "FUNERAL", "WEDDING", "SHOW", "CORPORATE", "CHARITY", "AUCTION", "OTHER"];
const TIERS = ["CREW", "SELF"];
const ACCESS = ["PUBLIC", "UNLISTED", "PIN"];

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
      `A new event. kind is one of ${EVENT_KINDS.join(", ")}; a FUNERAL must be PIN access. access PUBLIC, UNLISTED (default) or PIN — a PIN is minted and returned ONCE in this response. Provisioning the stream is a separate owner/admin step (uiiq_nx2u_event_provision). Returns { event: { id, slug, watchUrl }, pin }.`,
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
    description: "Edit an event: title, kind, scheduledStart, scheduledEnd, access, tier, replayDays, licenceRef. Switching access to PIN mints one, returned once.",
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
    name: "uiiq_nx2u_usage",
    description: "The tenant's last twelve months of NX2U delivery: viewer-seconds, GB, events.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/nx2u/usage");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
