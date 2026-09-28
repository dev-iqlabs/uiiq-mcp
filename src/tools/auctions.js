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

// AUCTIONS — the seller's side of the auction engine (Phase 1): draft an
// auction, add lots, publish, read bids, withdraw, and the workspace's
// defaults. Buyers bid through the public /api/v1/auctions API from the
// auction site, not here. GATED: needs the `auctions` feature; Phase 2
// (scheduled close / settlement) is not built.
export const auctionsTools = [
  {
    name: "uiiq_auction_list",
    description: "The workspace's auctions, every status. Needs the auctions feature.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/auctions");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_auction_get",
    description: "The seller's live view of one auction: its lots, current bids, status.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/auctions/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_auction_create",
    description: "A draft auction. Returns { id }. It copies the workspace's auction settings (increment ladder, soft close, Buy Now, currency) at creation.",
    inputSchema: {
      type: "object",
      required: ["title", "opensAt", "closesAt"],
      properties: { title: { type: "string" }, description: { type: "string" }, opensAt: { type: "string", description: "ISO date-time" }, closesAt: { type: "string", description: "ISO date-time" }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/auctions", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_auction_update",
    description: "Edit an auction's title, description, opensAt or closesAt, or change its state with action: 'publish' (in front of buyers) or 'cancel'. Publishing and cancelling are owner/admin only.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, opensAt: { type: "string" }, closesAt: { type: "string" },
        action: { type: "string", enum: ["publish", "cancel"] }, tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/auctions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_auction_lot_add",
    description: "Add a lot (quantity 1). Money in pence: startPence required; reservePence and buyNowPence optional. attributes = a JSON object (e.g. { ring: 'GB-2026-1234', sex: 'hen' }); mediaRefs = an array of image refs. Adding to a PUBLISHED auction is owner/admin only. Returns { id, lotNumber }.",
    inputSchema: {
      type: "object",
      required: ["id", "title", "startPence"],
      properties: {
        id: { type: "string", description: "auction id" }, title: { type: "string" }, description: { type: "string" },
        startPence: { type: "number" }, reservePence: { type: "number" }, buyNowPence: { type: "number" }, lotNumber: { type: "number" },
        attributes: { type: "object" }, mediaRefs: { type: "array", items: {} }, tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/auctions/${encodeURIComponent(id)}/lots`, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_auction_lot_bids",
    description: "A lot's bid history. Never a hidden maximum; bidder refs for owners/admins only.",
    inputSchema: { type: "object", required: ["id", "lotId"], properties: { id: { type: "string" }, lotId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, lotId, tenant }) {
      const res = await api(tenant)(`/auctions/${encodeURIComponent(id)}/lots/${encodeURIComponent(lotId)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_auction_lot_update",
    description: "Edit a lot (title, description, attributes, mediaRefs, startPence, reservePence, buyNowPence) or withdraw it with action: 'withdraw' (owner/admin). The whole lot freezes at its first bid, so money fields can't change after that.",
    inputSchema: {
      type: "object",
      required: ["id", "lotId"],
      properties: {
        id: { type: "string" }, lotId: { type: "string" }, title: { type: "string" }, description: { type: "string" },
        startPence: { type: "number" }, reservePence: { type: ["number", "null"] }, buyNowPence: { type: ["number", "null"] },
        attributes: { type: "object" }, mediaRefs: { type: "array", items: {} }, action: { type: "string", enum: ["withdraw"] }, tenant: TENANT_PROP,
      },
    },
    async handler({ id, lotId, tenant, ...body }) {
      const res = await api(tenant)(`/auctions/${encodeURIComponent(id)}/lots/${encodeURIComponent(lotId)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_auction_settings",
    description: "The workspace's auction defaults that new auctions copy: the increment ladder, softCloseSeconds, buyNowAllowed, currency, maxBidPence.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/auctions/settings");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_auction_settings_update",
    description: "Change the defaults (owner/admin). Only the fields sent change. ladder = [{ fromPence, stepPence }, …]: from each amount upwards, bids step by stepPence. Auctions already created keep their own copy.",
    inputSchema: {
      type: "object",
      properties: {
        ladder: { type: "array", items: { type: "object" } }, softCloseSeconds: { type: "number" }, buyNowAllowed: { type: "boolean" },
        currency: { type: "string", description: "ISO 4217, e.g. GBP" }, maxBidPence: { type: "number" }, tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/auctions/settings", { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
