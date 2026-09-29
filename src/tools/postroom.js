import { apiClient } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

// POSTROOM — one parcel per shop order that has to be posted. Mirrors the UIIQ
// /postroom API (BUILD-PLAN-uiiq-postroom.md; UiiQtask 23 step 6). Gated on the
// `postroom` feature: a tenant without it gets a clear refusal from the API.
const SERVICES = ["2nd Class", "1st Class", "Tracked 48", "Tracked 24", "Special Delivery", "Other"];

async function fail(res) {
  const text = await res.text();
  try { const j = JSON.parse(text); if (j?.error) return new Error(j.error); } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}

export const postroomTools = [
  {
    name: "uiiq_postroom_list",
    description:
      "The Postroom board: every open parcel (Waiting on product, Waiting on stock, Ready to pack, Label printed) plus the last week's dispatched, with the pick list against My Retail stock and the postage check. Optional site = one shop's URL. Needs the postroom feature.",
    inputSchema: { type: "object", properties: { site: { type: "string", description: "One shop's site URL, exactly as listed" }, tenant: TENANT_PROP } },
    async handler({ site, tenant } = {}) {
      const qs = site ? `?site=${encodeURIComponent(site)}` : "";
      const res = await api(tenant)(`/postroom/shipments${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_product_ready",
    description: "Waiting on product → Ready to pack, by hand: the product is made (a DTF print finished, or a print-ready signal that never arrived). Staff and above.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "shipment id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/postroom/shipments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action: "product_ready" }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_label_printed",
    description: "Ready to pack → Label printed. Refused until the parcel has a name, first address line and postcode. The label itself is GET /api/postroom/shipments/<id>/label in the browser.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/postroom/shipments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action: "label_printed" }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_dispatch",
    description:
      `Mark a parcel dispatched. service is one of ${SERVICES.join(", ")} (default 2nd Class); a tracked service needs trackingNumber. postagePaid is what the post office charged, in pounds (e.g. 3.35), for the postage check. If 'Dispatched tells the shop' is on for the workspace, the shop's WooCommerce order is completed and the customer emailed the tracking number.`,
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        service: { type: "string", enum: SERVICES },
        trackingNumber: { type: "string" },
        postagePaid: { type: "string", description: "Pounds, e.g. '3.35'" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...rest }) {
      const res = await api(tenant)(`/postroom/shipments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action: "dispatch", ...rest }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_reopen",
    description: "Dispatched → Label printed: dispatch was pressed by mistake.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/postroom/shipments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action: "reopen" }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_tell_shop",
    description: "A dispatched parcel whose shop was not told (the write-back failed): try again. Only does anything when 'Dispatched tells the shop' is on.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/postroom/shipments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action: "tell_shop" }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_correct",
    description: "Correct a parcel before it goes: the address (any of shipName, shipCompany, shipPhone, shipAddress1, shipAddress2, shipCity, shipPostcode, shipCountry — blank clears), service, weightGrams, trackingNumber, postagePaid.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        address: { type: "object", description: "Any of the ship* fields to change" },
        service: { type: "string", enum: SERVICES },
        weightGrams: { type: "number" },
        trackingNumber: { type: "string" },
        postagePaid: { type: "string", description: "Pounds" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...rest }) {
      const res = await api(tenant)(`/postroom/shipments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(rest) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_add_recent",
    description: "'Add recent orders': make parcels for shop orders from the last N hours that have none, because they arrived before Postroom was switched on. Owner or admin. Idempotent.",
    inputSchema: { type: "object", required: ["hours"], properties: { hours: { type: "number", description: "1 to the API's maximum (a few days)" }, tenant: TENANT_PROP } },
    async handler({ hours, tenant }) {
      const res = await api(tenant)("/postroom/shipments/recent", { method: "POST", body: JSON.stringify({ hours }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_settings",
    description: "Postroom settings: the return address printed on every label (null = the workspace's own address), what a label prints now, and the reorder-task board.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/postroom/settings");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_settings_update",
    description: "Set the return address (one line per array entry, at most 7; empty = the workspace's own address) and/or the board that reorder tasks go on (taskBoardId, null = none). Owner or admin; audited.",
    inputSchema: {
      type: "object",
      properties: {
        returnAddress: { type: "array", items: { type: "string" }, description: "Lines of the address; [] to use the workspace's own" },
        taskBoardId: { type: ["string", "null"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, returnAddress, taskBoardId }) {
      const body = {};
      if (returnAddress !== undefined) body.returnAddress = Array.isArray(returnAddress) ? returnAddress.join("\n") : returnAddress;
      if (taskBoardId !== undefined) body.taskBoardId = taskBoardId;
      const res = await api(tenant)("/postroom/settings", { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  // ── Postroom HQ (SUPER_ADMIN): every tenant's parcels on one board ──
  // Only tenants with Postroom AND "Show in Postroom HQ" (feature postroom_hq,
  // off by default; set with uiiq_tenant_features enable=postroom_hq plus
  // instruction_ref, the tenant's documented instruction) are on
  // it. Operator scope: never sent with a tenant context, and refused by the
  // API while impersonating. Every action is audit-logged.
  {
    name: "uiiq_admin_postroom_board",
    description:
      "Postroom HQ: every tenant on Postroom HQ (Postroom + 'Show in Postroom HQ' switched on), each with its own board — parcels, pick list, postage check — as uiiq_postroom_list gives one tenant. tenantId (id or slug) narrows it to one; site (with tenantId) to one of its shops. SUPER_ADMIN, not while impersonating.",
    inputSchema: {
      type: "object",
      properties: {
        tenantId: { type: "string", description: "Only this tenant (id or slug). It must be on Postroom HQ." },
        site: { type: "string", description: "With tenantId: one shop's site URL, exactly as listed" },
      },
    },
    async handler({ tenantId, site } = {}) {
      const q = new URLSearchParams();
      if (tenantId) q.set("tenant", tenantId);
      if (tenantId && site) q.set("site", site);
      const qs = q.toString() ? `?${q}` : "";
      const res = await api(null)(`/admin/postroom/shipments${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_admin_postroom_action",
    description:
      `Postroom HQ: work any tenant's parcel by its shipment id — the same moves as the uiiq_postroom_* tools, run in the tenant the shipment belongs to (refused with 403 if that tenant isn't on Postroom HQ). action: product_ready, label_printed, dispatch (service one of ${SERVICES.join(", ")}; a tracked one needs trackingNumber; postagePaid in pounds; may email the customer if the tenant has 'tell the shop' on), reopen, tell_shop, or correct (address / service / weightGrams / trackingNumber / postagePaid). Audited. SUPER_ADMIN, not while impersonating.`,
    inputSchema: {
      type: "object",
      required: ["id", "action"],
      properties: {
        id: { type: "string", description: "shipment id (from uiiq_admin_postroom_board)" },
        action: { type: "string", enum: ["product_ready", "label_printed", "dispatch", "reopen", "tell_shop", "correct"] },
        service: { type: "string", enum: SERVICES },
        trackingNumber: { type: "string" },
        postagePaid: { type: "string", description: "Pounds, e.g. '3.35'" },
        address: { type: "object", description: "correct: any of the ship* fields to change" },
        weightGrams: { type: "number", description: "correct: parcel weight" },
      },
    },
    async handler({ id, action, ...rest }) {
      const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      const body = action === "correct" ? fields : { action, ...fields };
      const res = await api(null)(`/admin/postroom/shipments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  // ── Mail forwarding addresses (Office → Mail; the id is what uiiq_mail_update's forwardingAddressId takes) ──
  {
    name: "uiiq_postroom_forwarding_address_update",
    description: "Edit a saved mail forwarding address (label, address lines, city, postcode, country). Only the fields sent change; isDefault true makes it the default and un-defaults the previous one.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, label: { type: "string" }, addressLine1: { type: "string" }, addressLine2: { type: "string" }, city: { type: "string" }, postcode: { type: "string" }, country: { type: "string" }, isDefault: { type: "boolean" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (!Object.keys(body).length) throw new Error("Send at least one field to change");
      const res = await api(tenant)(`/forwarding/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_forwarding_address_delete",
    description: "Delete a saved mail forwarding address. Not reversible; mail items that were forwarded to it keep the address text in their notes.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/forwarding/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
