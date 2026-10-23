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
    name: "uiiq_event_billing_set",
    description: "Owner or admin only: an event's billing (UiiQ-platform sister organisations 3/7 and 4/7). billingOrganisationId: what its TICKETS are billed through, null = the workspace's own or one of its SISTER organisations; every ticket type (through its experience) inherits it; 409 when another event sharing its experience is billed differently, or once its tickets have a paid booking. costumeBillingOrganisationId: what its show COSTUMES are billed through, set separately; 409 once a costume has been paid for. A sister switched off meanwhile is refused (409). costumePricePence / costumePayBy (YYYY-MM-DD): the show's default costume price and pay-by date, which a class can override. Without confirm: true it is ALWAYS a dry run that changes nothing. Acts in your own signed-in workspace (no tenant: changes are refused while impersonating).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        billingOrganisationId: { type: ["string", "null"], description: "Tickets: null = the workspace's own, or a sister's id" },
        costumeBillingOrganisationId: { type: ["string", "null"], description: "Show costumes: null = the workspace's own, or a sister's id" },
        costumePricePence: { type: ["integer", "null"] },
        costumePayBy: { type: ["string", "null"] },
        confirm: { type: "boolean", description: "true = do it; omit for the dry run" },
      },
    },
    async handler({ id, confirm, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (!Object.keys(body).length) throw new Error("Send billingOrganisationId, costumeBillingOrganisationId, costumePricePence or costumePayBy");
      if (confirm !== true) return { dryRun: true, changed: false, wouldDo: "set_event_billing", id, ...body, note: "Nothing was changed. Check this with the workspace owner, then call again with confirm: true." };
      const res = await api(undefined)(`/events/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
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
  // TICKETS — selling an event through UiiQ. The API is owner-or-admin and
  // writes an `event.tickets_link_changed` audit entry for every change,
  // because it moves where ticket money goes.
  {
    name: "uiiq_event_tickets",
    description: "Whether this event sells tickets through UiiQ, and what it is selling: `on`, `managed` (UiiQ made the ticketing, as opposed to a linked experience of the workspace's own), `live` (on AND the event is PUBLISHED \u2014 nothing is on public sale until it is), the sell-elsewhere link, and the experience behind it with its performances (date, times, seats, sold, left, status) and ticket types (price, ages, per-order limit, how many on sale, how many sold, which performance). Needs the `events` feature.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/events/${encodeURIComponent(id)}/tickets`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_event_tickets_on",
    description: "Switch UiiQ ticket sales ON for this event. Idempotent: an event already selling comes back unchanged, and switching back on after a switch-off restores the SAME performances, prices and sales history rather than making a second set. It reopens ONLY the performances that switch-off closed: a night the office shut by hand with uiiq_event_performance_set stays shut, as does one whose date has passed. Owner or admin. Nothing is on PUBLIC sale until the event itself is PUBLISHED. Without confirm: true it is ALWAYS a dry run that changes nothing. Add performances with the sessions route and prices with uiiq_ticket_type_create, using the experience id this returns.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        confirm: { type: "boolean", description: "true = do it; omit for the dry run" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, confirm }) {
      // It reopens the performances a switch-off closed, so it changes what the
      // public can buy and takes the same dry run as _off (Lucas L-b).
      if (confirm !== true) {
        return { dryRun: true, changed: false, wouldDo: "switch_tickets_on", id, note: "Nothing was changed. This puts tickets on sale and reopens the performances a switch-off closed — not ones closed by hand, and not ones already over. Call again with confirm: true." };
      }
      const res = await post(tenant, `/events/${encodeURIComponent(id)}/tickets`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_event_tickets_off",
    description: "Switch ticket sales OFF for this event: the performances are closed and the ticketing is archived, so nothing more can be bought. REFUSED (409) once any seat is booked \u2014 refund or cancel those first, or close individual performances instead. Nothing is destroyed: the performances, prices and sales stay, and uiiq_event_tickets_on brings back the ones this closed (not a night closed by hand, and not one already over). To stop selling ONE performance instead, use uiiq_event_performance_set. Without confirm: true it is ALWAYS a dry run that changes nothing. Owner or admin.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        confirm: { type: "boolean", description: "true = do it; omit for the dry run" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, confirm }) {
      if (confirm !== true) {
        return { dryRun: true, changed: false, wouldDo: "switch_tickets_off", id, note: "Nothing was changed. This stops the public buying tickets. Call again with confirm: true." };
      }
      const res = await api(tenant)(`/events/${encodeURIComponent(id)}/tickets`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_event_performance_set",
    description: "Stop selling ONE of an event's performances, or put it back: action 'close' or 'open'. This is what the switch-off's refusal means by \"close the performances\" when a seat is already booked \u2014 it stops further sales for that night and leaves the seats already sold with their tickets. A night closed this way is the OFFICE's decision, so uiiq_event_tickets_on leaves it shut; one closed by a switch-off comes back. Opening sets it FULL or OPEN on what is actually sold. REFUSED (409): a CANCELLED performance, a performance whose night has already finished (open only), an event whose ticket sales are switched off anyway, and an event changed by someone else while this was saving. Already in the asked-for state is a no-op, not an error. CANCELLING a performance is not here \u2014 that has to deal with the seats already sold. Without confirm: true it is ALWAYS a dry run that changes nothing. Owner or admin; needs the `events` feature.",
    inputSchema: {
      type: "object",
      required: ["id", "performanceId", "action"],
      properties: {
        id: { type: "string", description: "The event's id" },
        performanceId: { type: "string", description: "The performance (session) id, from uiiq_event_tickets" },
        action: { type: "string", enum: ["close", "open"], description: "close = stop selling this night; open = put it back on sale" },
        confirm: { type: "boolean", description: "true = do it; omit for the dry run" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, performanceId, action, tenant, confirm }) {
      if (action !== "close" && action !== "open") {
        throw new Error("action must be 'close' or 'open'");
      }
      // It changes what the public can buy, so it takes the same dry run as the
      // switch-off does.
      if (confirm !== true) {
        return {
          dryRun: true,
          changed: false,
          wouldDo: action === "close" ? "close_performance" : "open_performance",
          id,
          performanceId,
          note:
            action === "close"
              ? "Nothing was changed. This stops the public buying THIS performance; seats already sold keep their tickets. Call again with confirm: true."
              : "Nothing was changed. This puts THIS performance back on sale. Call again with confirm: true.",
        };
      }
      const res = await api(tenant)(`/events/${encodeURIComponent(id)}/tickets/performances`, {
        method: "PATCH",
        body: JSON.stringify({ performanceId, action }),
      });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_event_tickets_link_set",
    description: "Sell this event's tickets on ANOTHER site instead of through UiiQ \u2014 a button label and an https link, the way a class links to EEQU. Give ticketsLabel AND ticketsUrl together, or clear: true to put it back on UiiQ's own checkout; omitting the fields is NOT a clear, because that would quietly move ticket money back to UiiQ. Set, they win over UiiQ's checkout wherever a Buy tickets button is drawn (the event page, the Members App, the website). Without confirm: true it is ALWAYS a dry run that changes nothing. Owner or admin.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        ticketsLabel: { type: "string", description: "Button label, e.g. \"Book on EEQU\". Required with ticketsUrl unless clear: true." },
        ticketsUrl: { type: "string", description: "Where it goes. https only, no embedded credentials." },
        clear: { type: "boolean", description: "true = back to UiiQ's own checkout. Use this rather than omitting the fields." },
        confirm: { type: "boolean", description: "true = do it; omit for the dry run" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ticketsLabel, ticketsUrl, clear, confirm }) {
      // Lucas L2 then L-a: defaulting both to "" meant a call that sent
      // NEITHER field silently cleared the link and moved ticket money back to
      // UiiQ's checkout; testing only for `undefined` then let "" or null do
      // the same, while the dry run still called it "set_tickets_link". Blank
      // is not a value here — say clear: true, or send two real strings.
      const given = (v) => typeof v === "string" && v.trim() !== "";
      if (clear === true && (ticketsLabel !== undefined || ticketsUrl !== undefined)) {
        throw new Error("Send clear: true on its own, or ticketsLabel and ticketsUrl together \u2014 not both.");
      }
      if (clear !== true && !(given(ticketsLabel) && given(ticketsUrl))) {
        throw new Error("Send ticketsLabel and ticketsUrl together, both non-blank, or clear: true to go back to UiiQ's checkout.");
      }
      const body = clear === true ? { ticketsLabel: "", ticketsUrl: "" } : { ticketsLabel, ticketsUrl };
      if (confirm !== true) {
        return {
          dryRun: true,
          changed: false,
          wouldDo: clear === true ? "clear_tickets_link" : "set_tickets_link",
          id,
          ...body,
          note: "Nothing was changed. This decides where ticket money goes. Call again with confirm: true.",
        };
      }
      const res = await api(tenant)(`/events/${encodeURIComponent(id)}/tickets`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
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
