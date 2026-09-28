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

// MAIL — the virtual-office mailroom: post received at a location for the
// tenant, logged by staff and then scanned, forwarded, collected or shredded.
const MAIL_ACTIONS = ["scan", "forward", "forwarded", "collect", "shred", "notify"];

export const mailTools = [
  {
    name: "uiiq_mail_list",
    description: "Mail items received for the tenant, newest first, with the location name: optional status (RECEIVED | NOTIFIED | SCANNED | FORWARDING | FORWARDED | COLLECTED | SHREDDED), page, limit (max 100). Returns { items, total, page, limit }.",
    inputSchema: { type: "object", properties: { status: { type: "string" }, page: { type: "integer", minimum: 1 }, limit: { type: "integer", minimum: 1, maximum: 100 }, tenant: TENANT_PROP } },
    async handler({ status, page, limit, tenant } = {}) {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (page) p.set("page", String(page));
      if (limit) p.set("limit", String(limit));
      const qs = p.toString() ? `?${p}` : "";
      const res = await api(tenant)(`/mail${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_mail_get",
    description: "One mail item with its location's address.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/mail/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_mail_log",
    description: "Log a newly received mail item (status RECEIVED): locationId (required), sender, type (default LETTER), notes, scanUrl. OWNER, ADMIN or SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["locationId"], properties: { locationId: { type: "string" }, sender: { type: "string" }, type: { type: "string", description: "e.g. LETTER, PARCEL" }, notes: { type: "string" }, scanUrl: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/mail", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_mail_update",
    description: `Move a mail item on: action ${MAIL_ACTIONS.join(" | ")} sets the matching status (scan takes scanUrl; forward takes trackingNumber and forwardingAddressId, whose address is written into the notes; forwarded takes trackingNumber). Without an action, notes / scanUrl / trackingNumber are updated in place. shred records that the item was destroyed.`,
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, action: { type: "string", enum: MAIL_ACTIONS }, scanUrl: { type: "string" }, trackingNumber: { type: "string" }, notes: { type: "string" }, forwardingAddressId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/mail/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
