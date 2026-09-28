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

// EVENTS — a venue's events (optionally tied to a bookable experience) and
// the marketing fan-out: one generate call drafts social posts, an email
// campaign, a press release and a display board slide, all as DRAFTS that a
// human approves piece by piece from the Content tab. Needs the `events`
// feature.
export const eventsTools = [
  {
    name: "uiiq_event_list",
    description: "The workspace's events, soonest first (id, slug, name, tagline, image, start/end, status DRAFT|PUBLISHED|ARCHIVED, linked experience). Needs the `events` feature.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/events");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_event_create",
    description: "Create an event (slug derived from the name, unique per workspace). startsAt/endsAt are ISO date-times; experienceId links a bookable experience of this workspace. Needs the `events` feature.",
    inputSchema: {
      type: "object",
      required: ["name", "startsAt"],
      properties: { name: { type: "string" }, startsAt: { type: "string" }, endsAt: { type: "string" }, tagline: { type: "string" }, description: { type: "string" }, experienceId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/events", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_event_get",
    description: "One event with its linked experience (id, name, slug, status).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/events/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_event_update",
    description: "Edit an event: name, tagline, description, imageUrl, venueNote, startsAt, endsAt (null clears), status DRAFT|PUBLISHED|ARCHIVED, experienceId (null unlinks). Only the fields you send change.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }, name: { type: "string" }, tagline: { type: "string" }, description: { type: "string" }, imageUrl: { type: "string" }, venueNote: { type: "string" },
        startsAt: { type: "string" }, endsAt: { type: ["string", "null"] }, status: { type: "string", enum: ["DRAFT", "PUBLISHED", "ARCHIVED"] }, experienceId: { type: ["string", "null"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      const res = await api(tenant)(`/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_event_delete",
    description: "DELETE an event and its unapproved generated drafts (draft social posts, draft campaign, draft press release); approved pieces stay in their own systems and the event's display board token is revoked so screens go dark.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/events/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_event_generate",
    description: "Generate the event's marketing in one go: social posts + email campaign drafted by Anthropic, a press release via the IQEX Chris pipeline, and a display board slide. Everything lands as a DRAFT to approve with uiiq_event_content_review; regenerating replaces unapproved drafts only. SPENDS CREDITS (tariff grow_event_fanout; 402 when short). Slow (up to 2 min).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await post(tenant, `/events/${encodeURIComponent(id)}/generate`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_event_content",
    description: "The event's generated marketing, assembled live: social posts (with platforms + approved), the email campaign, the press release, the display board (with its /board URL) and how many social accounts are connected. { generated:false } before a generate.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/events/${encodeURIComponent(id)}/content`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_event_content_review",
    description: "Approve or discard one generated piece. approve: social → SCHEDULED at its slot (the publish cron then POSTS IT; needs a connected social account), campaign → confirmed (still a DRAFT in Campaigns to send from there), press → APPROVED (distribute from Press Releases), board → no-op. discard DELETES an unapproved draft (board discard revokes the token). pieceId is the social post id (only for piece=social).",
    inputSchema: {
      type: "object",
      required: ["id", "action", "piece"],
      properties: { id: { type: "string" }, action: { type: "string", enum: ["approve", "discard"] }, piece: { type: "string", enum: ["social", "campaign", "press", "board"] }, pieceId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant, ...body }) {
      const res = await post(tenant, `/events/${encodeURIComponent(id)}/content`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
