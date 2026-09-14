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

// ── Online orders ────────────────────────────────────────────────────────────
// WooCommerce orders from the tenant's shops, as UiiQ Connect sends them to
// UIIQ — the Online orders page (Sell → Online Sales). Sales figures are goods
// only (no VAT or shipping) less refunds, by the UK day each order was paid.
//
// uiiq_order_list / uiiq_order_get used to call /api/wf/orders and
// /api/wf/orders/<ref>, which don't exist, so they failed every time. They now
// read online orders too. Note and hold still act on legacy workflow orders.

const LIST_PROPS = {
  status: { type: "string", enum: ["all", "paid", "open", "closed"], description: "paid = processing/completed · open = awaiting payment · closed = cancelled/refunded/failed. Default all." },
  site: { type: "string", description: "One shop's site URL, exactly as listed in the first page's `sites`." },
  search: { type: "string", description: "Order number, customer name or email." },
  from: { type: "string", description: "Paid on or after, YYYY-MM-DD (arrival date for orders from older plugin builds)." },
  to: { type: "string", description: "Paid on or before, YYYY-MM-DD." },
  limit: { type: "number", description: "Page size, 1–100. Default 50." },
};

async function listOnlineOrders({ status, site, search, from, to, cursor, limit, tenant } = {}) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (site) params.set("site", site);
  if (search) params.set("q", search);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("take", String(limit));
  const qs = params.toString() ? `?${params}` : "";
  const res = await api(tenant)(`/online-orders${qs}`);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function getOnlineOrder({ id, ref, tenant }) {
  if (id) {
    const res = await api(tenant)(`/online-orders/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(res.status === 404 ? `Online order not found: ${id}` : `${res.status} ${await res.text()}`);
    return res.json();
  }
  if (!ref) throw new Error("Provide id or ref (the WooCommerce order number)");
  // Search narrows by order number; the exact match avoids "12" finding "112".
  const page = await listOnlineOrders({ search: String(ref), limit: 20, tenant });
  const match = (page.orders ?? []).find((o) => String(o.orderRef) === String(ref));
  if (!match) throw new Error(`Online order not found: ${ref}`);
  return getOnlineOrder({ id: match.id, tenant });
}

export const orderTools = [
  {
    name: "uiiq_online_order_list",
    description:
      "List WooCommerce shop orders UiiQ Connect has sent to UIIQ (the Online orders page), newest first. " +
      "The first page (no cursor) also returns `totals` — sales today, this week and this month, goods only less refunds — " +
      "and `sites`, the tenant's shops. Each order carries status, total, refunded amount, salesPence, paid date, shop, " +
      "whether it was sent as a past order, and needsAttention (a journey didn't start, or money was refunded after credits were granted). " +
      "Page with `nextCursor`.",
    inputSchema: {
      type: "object",
      properties: { ...LIST_PROPS, cursor: { type: "string", description: "nextCursor from the previous page." }, tenant: TENANT_PROP },
    },
    handler: (args = {}) => listOnlineOrders(args),
  },
  {
    name: "uiiq_online_order_get",
    description:
      "One online order in full: line items (with coin / configurator / design / proof flags), goods, VAT, shipping, total, " +
      "refunds with dates and reasons, customer and addresses, what happened next (journey, credits granted, production work) " +
      "and a link to the order in WooCommerce admin. Pass `id`, or `ref` for the WooCommerce order number.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Online order id (from uiiq_online_order_list)." },
        ref: { type: "string", description: "WooCommerce order number." },
        tenant: TENANT_PROP,
      },
    },
    handler: (args = {}) => getOnlineOrder(args),
  },
  {
    name: "uiiq_order_list",
    description:
      "List orders — WooCommerce shop orders sent by UiiQ Connect (same data as uiiq_online_order_list; returns just the orders). " +
      "Workflow orders are no longer recorded.",
    inputSchema: {
      type: "object",
      properties: { status: LIST_PROPS.status, limit: LIST_PROPS.limit, tenant: TENANT_PROP },
    },
    async handler({ status, limit = 50, tenant } = {}) {
      const page = await listOnlineOrders({ status, limit, tenant });
      return page.orders ?? [];
    },
  },
  {
    name: "uiiq_order_get",
    description: "Get full detail for an order by its WooCommerce order number (same as uiiq_online_order_get with ref).",
    inputSchema: {
      type: "object",
      required: ["ref"],
      properties: { ref: { type: "string" }, tenant: TENANT_PROP },
    },
    handler: ({ ref, tenant }) => getOnlineOrder({ ref, tenant }),
  },
  {
    name: "uiiq_order_note",
    description: "Add a note to a legacy workflow order.",
    inputSchema: {
      type: "object",
      required: ["ref", "body"],
      properties: { ref: { type: "string" }, body: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ ref, body, tenant }) {
      const res = await api(tenant)(`/wf/orders/${ref}/notes`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_order_hold",
    description: "Put a legacy workflow order on hold.",
    inputSchema: {
      type: "object",
      required: ["ref", "reason"],
      properties: { ref: { type: "string" }, reason: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ ref, reason, tenant }) {
      const res = await api(tenant)(`/wf/orders/${ref}/hold`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { success: true, ref };
    }
  },
];
