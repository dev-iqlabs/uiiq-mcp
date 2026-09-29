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
  // ── Postroom HQ requests: the shop asks, a code is generated (Kim's in-app terms) ──
  // A shop's OWNER or ADMIN requests Postroom HQ in its Postroom settings,
  // accepting the terms; or a platform admin raises it on the shop's behalf
  // with the evidence of how they asked. "Show in Postroom HQ" can be ticked
  // on only while that request is ACTIVE. Accepting and withdrawing are
  // refused while impersonating, so those two tools only work signed in as
  // the shop's own owner or admin, never through a tenant argument.
  {
    name: "uiiq_postroom_hq_request_status",
    description:
      "This workspace's Postroom HQ request: status (not_requested, pending, active, on, withdrawn, lapsed), its code (PHQ-<SLUG>-<YYYYMMDD>-<4>), who accepted and when, whether re-acceptance is needed, whether this workspace may request at all (group companies, or once external tenants are switched on), and the terms to show: text, version, url and hash. Read this and SHOW THE TERMS TEXT to the user before uiiq_postroom_hq_request_create.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/postroom/hq-request");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_hq_request_create",
    description:
      "Request Postroom HQ for this workspace: the signed-in OWNER or ADMIN accepts the in-app terms (postroom-hq-terms-v1) for it, and a code is generated. accept_terms must be true, and only after the user has read the terms text from uiiq_postroom_hq_request_status and agreed: it is recorded as their acceptance, with the hash of that text. Accepting also activates a request our team raised for the shop that is pending. Refused while impersonating, for STAFF, and for a workspace Postroom HQ isn't available to yet. Audited.",
    inputSchema: {
      type: "object",
      required: ["accept_terms"],
      properties: {
        accept_terms: { type: "boolean", description: "true: the user has read the terms and accepts them for the workspace" },
      },
    },
    async handler({ accept_terms }) {
      if (accept_terms !== true) throw new Error("accept_terms must be true: show the terms (uiiq_postroom_hq_request_status) and get the user's agreement first.");
      const statusRes = await api(null)("/postroom/hq-request");
      if (!statusRes.ok) throw await fail(statusRes);
      const { terms } = await statusRes.json();
      const res = await api(null)("/postroom/hq-request", { method: "POST", body: JSON.stringify({ acceptTerms: true, termsVersion: terms.version, termsHash: terms.hash }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_hq_request_withdraw",
    description:
      "Withdraw this workspace's Postroom HQ request: it ends at once and Show in Postroom HQ switches off straight away (parcels packed but not posted come back to the workspace's own board). OWNER or ADMIN, not while impersonating. Audited.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await api(null)("/postroom/hq-request", { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_postroom_hq_log",
    description:
      "This workspace's Postroom HQ log for the last 12 months: every HQ view, print and action on its parcels, every request step, and every switch of Show in Postroom HQ. Never an address. format json (default) or csv. OWNER or ADMIN.",
    inputSchema: { type: "object", properties: { format: { type: "string", enum: ["json", "csv"] }, tenant: TENANT_PROP } },
    async handler({ format, tenant } = {}) {
      const res = await api(tenant)(format === "csv" ? "/postroom/hq-log?format=csv" : "/postroom/hq-log");
      if (!res.ok) throw await fail(res);
      return format === "csv" ? res.text() : res.json();
    },
  },
  {
    name: "uiiq_admin_postroom_hq_request_status",
    description: "A tenant's Postroom HQ request as the shop sees it, plus groupCompany and whether it may request. SUPER_ADMIN, not while impersonating.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: { type: "string", description: "Tenant id" } } },
    async handler({ tenantId }) {
      const res = await api(null)(`/admin/tenants/${encodeURIComponent(tenantId)}/postroom-hq-request`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_admin_postroom_hq_request_raise",
    description:
      "Raise a Postroom HQ request on a tenant's behalf, ONLY when the tenant asked us and you can show how. Every evidence field is required. channel email or letter with terms_agreed_in_writing true: ACTIVE at once. Phone, in_person, or not agreed in writing: PENDING written confirmation (lapses after 14 days; the tick stays locked). With a request already PENDING, written evidence (email/letter, agreed) confirms it. The evidence is kept and shown to the tenant. SUPER_ADMIN, not while impersonating. Audited.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "requester_name", "requester_role", "authority", "requester_email", "channel", "received_at", "message_ref", "terms_agreed_in_writing"],
      properties: {
        tenantId: { type: "string", description: "Tenant id" },
        requester_name: { type: "string", description: "The person who asked" },
        requester_role: { type: "string", description: "Their role at the tenant, e.g. Director" },
        authority: { type: "string", enum: ["owner_admin_user", "director", "other_authorised"], description: "owner_admin_user needs authority_user_id; other_authorised needs notes" },
        authority_user_id: { type: "string", description: "authority owner_admin_user: the tenant's OWNER/ADMIN user id" },
        requester_email: { type: "string" },
        channel: { type: "string", enum: ["email", "letter", "phone", "in_person"] },
        received_at: { type: "string", description: "When they asked (ISO date-time), not when you enter it" },
        message_ref: { type: "string", description: "Email: sender + subject (+ Message-ID). Letter: date + scan. Phone: number + time. In person: where + who else was there." },
        terms_agreed_in_writing: { type: "boolean", description: "true only if the terms link was sent in writing and they agreed in writing" },
        attachment_note: { type: "string", description: "Where the saved email or scan is kept (no upload in v1)" },
        notes: { type: "string" },
      },
    },
    async handler({ tenantId, ...a }) {
      const body = {
        requesterName: a.requester_name, requesterRole: a.requester_role, authority: a.authority, authorityUserId: a.authority_user_id,
        requesterEmail: a.requester_email, channel: a.channel, receivedAt: a.received_at, messageRef: a.message_ref,
        termsAgreedInWriting: a.terms_agreed_in_writing, attachmentNote: a.attachment_note, notes: a.notes,
      };
      const res = await api(null)(`/admin/tenants/${encodeURIComponent(tenantId)}/postroom-hq-request`, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_admin_postroom_hq_request_withdraw",
    description: "Record a withdrawal the tenant sent us (email, letter, phone, in person): the request ends and Show in Postroom HQ switches off at once. Do it within one business day of their asking. SUPER_ADMIN, not while impersonating. Audited.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "requester_name", "channel", "received_at", "message_ref"],
      properties: {
        tenantId: { type: "string", description: "Tenant id" },
        requester_name: { type: "string" },
        channel: { type: "string", enum: ["email", "letter", "phone", "in_person"] },
        received_at: { type: "string", description: "ISO date-time" },
        message_ref: { type: "string" },
      },
    },
    async handler({ tenantId, requester_name, channel, received_at, message_ref }) {
      const body = { requesterName: requester_name, channel, receivedAt: received_at, messageRef: message_ref };
      const res = await api(null)(`/admin/tenants/${encodeURIComponent(tenantId)}/postroom-hq-request`, { method: "DELETE", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_admin_postroom_hq_log",
    description: "One tenant's Postroom HQ log for the last 12 months (HQ views, prints, actions, request steps, switches; never an address), to send the tenant on request. format json (default) or csv. SUPER_ADMIN, not while impersonating. The export is audited.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: { type: "string" }, format: { type: "string", enum: ["json", "csv"] } } },
    async handler({ tenantId, format }) {
      const qs = format === "csv" ? "?format=csv" : "";
      const res = await api(null)(`/admin/tenants/${encodeURIComponent(tenantId)}/postroom-hq-log${qs}`);
      if (!res.ok) throw await fail(res);
      return format === "csv" ? res.text() : res.json();
    },
  },
  {
    name: "uiiq_admin_tenant_group_company_set",
    description: "Flag a tenant as a group company (Ultimate Image Ltd / IQLabs): it may request Postroom HQ before external tenants can. SUPER_ADMIN read live, not while impersonating. Audited (tenant.group_company).",
    inputSchema: { type: "object", required: ["tenantId", "groupCompany"], properties: { tenantId: { type: "string" }, groupCompany: { type: "boolean" } } },
    async handler({ tenantId, groupCompany }) {
      const res = await api(null)(`/admin/tenants/${encodeURIComponent(tenantId)}`, { method: "PATCH", body: JSON.stringify({ groupCompany }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  // ── Postroom HQ (SUPER_ADMIN): every tenant's parcels on one board ──
  // Only tenants with Postroom, "Show in Postroom HQ" (feature postroom_hq,
  // off by default; ticked with uiiq_tenant_features enable=postroom_hq once
  // the tenant has an ACTIVE Postroom HQ request) and that request are on it.
  // Operator scope: never sent with a tenant context, and refused by the
  // API while impersonating. Every action is audit-logged.
  {
    name: "uiiq_admin_postroom_board",
    description:
      "Postroom HQ: every tenant on Postroom HQ (Postroom + 'Show in Postroom HQ' switched on + an ACTIVE Postroom HQ request, whose code is on each tenant), each with its own board — parcels, pick list, postage check — as uiiq_postroom_list gives one tenant. tenantId (id or slug) narrows it to one; site (with tenantId) to one of its shops. SUPER_ADMIN, not while impersonating.",
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
