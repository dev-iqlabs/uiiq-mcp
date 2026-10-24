import fs from "node:fs";
import path from "node:path";
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

// The send route works through 50 bookings a press and allows 30 presses a
// person every 10 minutes; stopping at 30 keeps this loop from tripping it.
const SEND_PRESSES = 30;

// UIIQ shared ticketing + door-scan — issue per-seat tickets, admit at the door,
// and configure scan fan-out to downstream products (Acts Direct / CountryComp).
export const ticketsTools = [
  {
    name: "uiiq_ticket_list",
    description: "List the individual scannable tickets on a booking (one per seat), with admit status.",
    inputSchema: {
      type: "object",
      required: ["bookingId"],
      properties: { bookingId: { type: "string", description: "Booking ID" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ bookingId, tenant }) {
      const res = await api(tenant)("/admin/tickets?bookingId=" + encodeURIComponent(bookingId));
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.tickets ?? data;
    }
  },
  {
    name: "uiiq_ticket_issue",
    description: "Issue individual QR tickets for a confirmed booking (one per seat). Idempotent — safe to re-run.",
    inputSchema: {
      type: "object",
      required: ["bookingId"],
      properties: { bookingId: { type: "string", description: "Booking ID to issue tickets for" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ bookingId, tenant }) {
      const res = await api(tenant)("/admin/tickets", {
        method: "POST",
        body: JSON.stringify({ bookingId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_ticket_scan",
    description: "Scan a single ticket by its code — the door-scan action, double-scan safe. First scan admits, second signs out, third is ALREADY_OUT; undo reverses the latest step. Returns ADMITTED, SIGNED_OUT, ALREADY, ALREADY_OUT, UNDONE, SIGN_OUT_UNDONE, VOID, INVALID, PIN_REQUIRED/PIN_WRONG, or WRONG_PERFORMANCE. With performanceId (the door is set to one performance), a ticket for any other performance is refused as WRONG_PERFORMANCE, its `performance` saying which one it IS for, and nothing about it changes; without it, any of the workspace's tickets.",
    inputSchema: {
      type: "object",
      required: ["code"],
      properties: {
        code: { type: "string", description: "The ticket code (from the scanned QR, or the /t/<code> URL tail)" },
        pin:  { type: "string", description: "Gate PIN, if the experience uses one" },
        undo: { type: "boolean", description: "Undo the latest step (a sign-out first, then an admission) instead of scanning" },
        performanceId: { type: "string", description: "The performance the door is set to, from uiiq_ticket_scan_stats `performances`. Omit to accept any of the workspace's tickets" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ code, pin, undo, performanceId, tenant }) {
      const res = await api(tenant)("/admin/tickets/scan", {
        method: "POST",
        body: JSON.stringify({ code, pin, undo: undo === true, performanceId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_ticket_scan_stats",
    description: "Door-scan stats. Without performanceId: today's across the workspace (admittedToday, signedOutToday, stillIn, issuedTotal). With it: that performance's { label, eventName, sold, admitted, signedOut, stillIn }; 404 for a performance not in this workspace. Either way it lists the `performances` a door can be set to (events' performances from yesterday on, not cancelled) and `defaultPerformanceId`, the one the scanner would pick now.",
    inputSchema: {
      type: "object",
      properties: {
        performanceId: { type: "string", description: "One performance's stats instead of today's across the workspace" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ performanceId, tenant } = {}) {
      const res = await api(tenant)("/admin/tickets/scan" + (performanceId ? "?performanceId=" + encodeURIComponent(performanceId) : ""));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  // EMAIL TICKETS TO BUYERS (UiiQ-platform events and tickets 5/6). Each
  // confirmed booking is emailed the link to its tickets page once: UiiQ
  // records it, so a second send reaches only the bookings the first did not.
  {
    name: "uiiq_ticket_email_status",
    description: "How many of an event's confirmed bookings have been emailed their tickets (a link to their tickets page, a QR code per ticket), in all and per performance: { bookings, sent, performances: [{ id, bookings, sent }] }. An event that doesn't sell tickets through UiiQ answers { bookings: 0, sent: 0, performances: [] }. Needs the `events` feature.",
    inputSchema: {
      type: "object",
      required: ["eventId"],
      properties: {
        eventId: { type: "string", description: "The event's id" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ eventId, tenant }) {
      const res = await api(tenant)("/admin/tickets/send?eventId=" + encodeURIComponent(eventId));
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_ticket_email_send",
    description: "EMAIL buyers their tickets, in the workspace's name. eventId (optionally with performanceId): every CONFIRMED booking of the event, or of that one performance, not sent theirs yet; bookings already sent are skipped, so sending again after more sales reaches only the new ones. UiiQ works through 50 bookings a press; this presses again while each press is sending something (up to 30 presses, the route's limit per person every 10 minutes) and returns the totals: { sent, notSent, remaining, presses, done }. remaining = still without their tickets (a failed send is put back and counted there, and is tried again next time). bookingId instead: SEND AGAIN to that one booking, sent before or not; refused 409 for a cancelled/refunded or unconfirmed booking, 502 when nothing went. Owner or admin only; rate-limited (429) and audited. Without confirm: true it is ALWAYS a dry run that sends nothing (for an event it reads how many would be sent).",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "The event whose buyers to email" },
        performanceId: { type: "string", description: "Only this performance's buyers (with eventId), from uiiq_event_tickets" },
        bookingId: { type: "string", description: "Send again to this one booking, instead of an event" },
        confirm: { type: "boolean", description: "true = send; omit for the dry run" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ eventId, performanceId, bookingId, confirm, tenant }) {
      if (!!eventId === !!bookingId) throw new Error("Give eventId (optionally with performanceId) or bookingId, not both");
      if (bookingId && performanceId) throw new Error("performanceId goes with eventId, not bookingId");

      if (bookingId) {
        if (confirm !== true) {
          return { dryRun: true, changed: false, wouldDo: "email_tickets_again", bookingId, note: "Nothing was sent. This emails that booking's buyer the link to their tickets again, whether or not it went before. Call again with confirm: true." };
        }
        const res = await api(tenant)("/admin/tickets/send", { method: "POST", body: JSON.stringify({ bookingId }) });
        if (!res.ok) throw await fail(res);
        return { bookingId, ...(await res.json()) };
      }

      if (confirm !== true) {
        const res = await api(tenant)("/admin/tickets/send?eventId=" + encodeURIComponent(eventId));
        if (!res.ok) throw await fail(res);
        const counts = await res.json();
        const scope = performanceId ? (counts.performances ?? []).find((p) => p.id === performanceId) ?? { bookings: 0, sent: 0 } : counts;
        return {
          dryRun: true,
          changed: false,
          wouldDo: "email_tickets",
          eventId,
          ...(performanceId ? { performanceId } : {}),
          bookings: scope.bookings,
          alreadySent: scope.sent,
          wouldSend: Math.max(0, scope.bookings - scope.sent),
          note: "Nothing was sent. This emails each of those buyers the link to their tickets, in the workspace's name, once. Call again with confirm: true.",
        };
      }

      const totals = { sent: 0, notSent: 0, remaining: 0, presses: 0 };
      for (let i = 0; i < SEND_PRESSES; i++) {
        const res = await api(tenant)("/admin/tickets/send", {
          method: "POST",
          body: JSON.stringify({ eventId, ...(performanceId ? { performanceId } : {}) }),
        });
        if (!res.ok) {
          const e = await fail(res);
          if (totals.presses === 0) throw e;
          return { ...totals, done: false, stopped: e.message };
        }
        const r = await res.json();
        totals.presses++;
        totals.sent += r.sent;
        totals.notSent += r.notSent;
        totals.remaining = r.remaining;
        // Done, or a whole batch went nowhere: stop rather than press for ever.
        if (r.remaining === 0 || r.sent === 0) break;
      }
      return { ...totals, done: totals.remaining === 0 };
    },
  },
  {
    name: "uiiq_ticket_forward_list",
    description: "List this tenant's scan fan-out targets — downstream products (Acts Direct / CountryComp) that receive a presence-verified scan when a ticket is admitted.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/admin/tickets/forwards");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.forwards ?? data;
    }
  },
  {
    name: "uiiq_ticket_forward_create",
    description: "Register a downstream target that receives a scan event whenever a ticket is admitted (presence-verified reviews for Acts Direct / CountryComp).",
    inputSchema: {
      type: "object",
      required: ["kind", "targetUrl"],
      properties: {
        kind:            { type: "string", enum: ["ACTS_DIRECT", "COUNTRYCOMP", "WEBHOOK"], description: "Downstream product" },
        targetUrl:       { type: "string", description: "Receiver URL, e.g. Acts Direct /api/v1/webhooks/uiiq/ticket-scan" },
        externalEventId: { type: "string", description: "Maps this event onto the downstream's event id" },
        secret:          { type: "string", description: "HMAC secret (defaults to ACTS_DIRECT_PLATFORM_SECRET when omitted)" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ kind, targetUrl, externalEventId, secret, tenant }) {
      const res = await api(tenant)("/admin/tickets/forwards", {
        method: "POST",
        body: JSON.stringify({ kind, targetUrl, externalEventId, secret }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_ticket_forward_delete",
    description: "Remove a scan fan-out target by id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "TicketScanForward id" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, tenant }) {
      const res = await api(tenant)("/admin/tickets/forwards/" + encodeURIComponent(id), { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_ticket_qr",
    description: "Save a ticket's QR code (600px PNG encoding /t/<code>, the same image the e-ticket carries) to a local file. Default outPath: ./ticket-<code>.png. 404 for an unknown code.",
    inputSchema: { type: "object", required: ["code"], properties: { code: { type: "string", description: "Ticket code (from uiiq_ticket_list)" }, outPath: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ code, outPath, tenant }) {
      const res = await api(tenant)(`/tickets/${encodeURIComponent(code)}/qr.png`);
      if (!res.ok) throw new Error(await res.text());
      const bytes = Buffer.from(await res.arrayBuffer());
      const target = path.resolve(outPath || `ticket-${code}.png`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      return { path: target, bytes: bytes.length };
    },
  },
];
