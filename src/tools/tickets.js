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
    description: "Admit (or undo) a single ticket by its code — the door-scan action. Per-ticket check-in with double-scan prevention. Returns ADMITTED, ALREADY, UNDONE, VOID, INVALID, or PIN_REQUIRED/PIN_WRONG.",
    inputSchema: {
      type: "object",
      required: ["code"],
      properties: {
        code: { type: "string", description: "The ticket code (from the scanned QR, or the /t/<code> URL tail)" },
        pin:  { type: "string", description: "Gate PIN, if the experience uses one" },
        undo: { type: "boolean", description: "Undo a previous admission instead of admitting" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ code, pin, undo, tenant }) {
      const res = await api(tenant)("/admin/tickets/scan", {
        method: "POST",
        body: JSON.stringify({ code, pin, undo: undo === true }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_ticket_scan_stats",
    description: "Today's door-scan stats for the tenant: tickets admitted today and total issued.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/admin/tickets/scan");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
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
];
