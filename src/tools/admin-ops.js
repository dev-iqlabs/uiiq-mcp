import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
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
// One call, JSON in/out; a 204 answers { ok: true }.
async function req(tenant, path, method = "GET", body) {
  const res = await api(tenant)(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
  if (!res.ok) throw await fail(res);
  return res.status === 204 ? { ok: true } : res.json();
}
// Operator control plane: SUPER_ADMIN routes that read across tenants. Never
// impersonated (impersonation maps the role to OWNER, which these refuse).
const op = (path, method, body) => req(null, path, method, body);
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
async function save(outPath, data) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, data);
  return { path: outPath, bytes: Buffer.byteLength(data) };
}

// ADMIN OPS — the tenant-side admin lists (blockouts, calendar, check-in,
// custom booking fields, waivers, ticket types, refunds, member sign-out,
// promo codes) and the SuperAdmin control-plane lists (launcher / workshop
// cards, task recipes, merch-set sectors, platform pricing, press
// distribution keys, journalist contacts, design briefs, Acts Direct records,
// IQEX form registry, sector presets). Tenant-scoped tools take `tenant`;
// SUPER_ADMIN tools do not.
const CUSTOM_FIELD_TYPES = ["text", "textarea", "select", "number", "email", "phone", "date", "checkbox"];
const RECIPE_CATEGORIES = ["APPAREL", "COIN", "MUG", "STATIONERY", "OTHER"];
const BRIEF_STATUSES = ["NEW", "IN_REVIEW", "IN_PROGRESS", "DELIVERED", "CANCELLED"];
const PRESS_SERVICES = ["pressat", "prlog", "openpr"];
const ACTS_EVENTS = ["booking.confirmed", "booking.cancelled", "booking.updated", "artist.approved", "artist.suspended", "payment.released"];
const RECIPE_STEP = {
  type: "object", required: ["code", "name"],
  properties: { code: { type: "string" }, name: { type: "string" }, description: { type: "string" }, assigneeRole: { type: "string" }, estimatedMinutes: { type: "number" }, isStockOp: { type: "boolean" }, blockingOnPrev: { type: "boolean", description: "default true" } },
};
const CARD_PROPS = {
  description: { type: "string" }, iconUrl: { type: "string" }, colour: { type: "string" },
  featureKey: { type: "string", description: "Only tenants with this feature see the card; empty = everyone" },
  active: { type: "boolean" }, sortOrder: { type: "number" },
};
const PRESET_PROPS = {
  name: { type: "string" }, description: { type: "string" }, terminology: { type: "object", description: "Label overrides, e.g. { customer: 'Member' }" },
  featureKeys: { type: "array", items: { type: "string" } }, commerceActive: { type: "boolean" },
};

export const adminOpsTools = [
  // ── Blockouts ──
  {
    name: "uiiq_blockout_list",
    description: "The workspace's blockout periods (dates no sessions can be booked), earliest first.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) { return req(tenant, "/admin/blockouts"); },
  },
  {
    name: "uiiq_blockout_create",
    description: "Add a blockout period. experienceId limits it to one experience; appliesToAll defaults to true when no experienceId is given.",
    inputSchema: { type: "object", required: ["name", "startDate", "endDate"], properties: { name: { type: "string" }, startDate: { type: "string", description: "YYYY-MM-DD" }, endDate: { type: "string", description: "YYYY-MM-DD" }, reason: { type: "string" }, experienceId: { type: "string" }, appliesToAll: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) { return req(tenant, "/admin/blockouts", "POST", body); },
  },
  {
    name: "uiiq_blockout_update",
    description: "Edit a blockout period; only the fields sent change. experienceId null clears the per-experience limit.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, startDate: { type: "string" }, endDate: { type: "string" }, reason: { type: "string" }, experienceId: { type: ["string", "null"] }, appliesToAll: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) { return req(tenant, `/admin/blockouts/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_blockout_delete",
    description: "Delete a blockout period. Sessions in those dates become bookable again.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) { return req(tenant, `/admin/blockouts/${encodeURIComponent(id)}`, "DELETE"); },
  },

  // ── Calendar ──
  {
    name: "uiiq_calendar_month",
    description: "A month of the booking calendar: per date, seats booked, capacity and which experiences run. month is 1-12; defaults to the current month.",
    inputSchema: { type: "object", properties: { year: { type: "number" }, month: { type: "number", minimum: 1, maximum: 12 }, tenant: TENANT_PROP } },
    async handler({ year, month, tenant } = {}) {
      const p = new URLSearchParams();
      if (year != null) p.set("year", String(year));
      if (month != null) p.set("month", String(month - 1));
      const qs = p.toString() ? `?${p}` : "";
      return req(tenant, `/admin/calendar${qs}`);
    },
  },

  // ── Check-in ──
  {
    name: "uiiq_checkin_today",
    description: "Today's booking check-in: how many are checked in, how many are expected, and the last 20 arrivals.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) { return req(tenant, "/admin/checkin"); },
  },
  {
    name: "uiiq_checkin_booking",
    description: "Check a booking in by its reference (the door action for bookings without per-seat tickets). Answers alreadyCheckedIn when it was done before.",
    inputSchema: { type: "object", required: ["reference"], properties: { reference: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ reference, tenant }) { return req(tenant, "/admin/checkin", "POST", { reference }); },
  },
  {
    name: "uiiq_checkin_member_today",
    description: "Today's member check-ins: count, unique members, active memberships, and the last 20 check-ins.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) { return req(tenant, "/admin/checkin/member"); },
  },
  {
    name: "uiiq_checkin_member",
    description: "Record a member check-in from a customer card token (or /c/<slug>/<token> URL) or a MEM- member code. The membership must be usable today (active, in date, residency cleared). Any staff role.",
    inputSchema: { type: "object", properties: { token: { type: "string" }, code: { type: "string" }, source: { type: "string", enum: ["MANUAL", "QR", "NFC", "CARD"] }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body } = {}) { return req(tenant, "/admin/checkin/member", "POST", defined(body)); },
  },

  // ── Custom booking fields ──
  {
    name: "uiiq_custom_field_list",
    description: "The custom booking-form fields on one experience, in position order.",
    inputSchema: { type: "object", required: ["experienceId"], properties: { experienceId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ experienceId, tenant }) { return req(tenant, `/admin/custom-fields?experienceId=${encodeURIComponent(experienceId)}`); },
  },
  {
    name: "uiiq_custom_field_create",
    description: `Add a custom booking-form field to an experience (placed last). type one of ${CUSTOM_FIELD_TYPES.join(", ")}; a select needs options.`,
    inputSchema: { type: "object", required: ["experienceId", "label", "type"], properties: { experienceId: { type: "string" }, label: { type: "string" }, type: { type: "string", enum: CUSTOM_FIELD_TYPES }, options: { type: "array", items: { type: "string" } }, isRequired: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) { return req(tenant, "/admin/custom-fields", "POST", defined(body)); },
  },
  {
    name: "uiiq_custom_field_update",
    description: "Edit a custom booking field: label, type, options (null clears), isRequired, position. Nothing else is accepted.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, label: { type: "string" }, type: { type: "string", enum: CUSTOM_FIELD_TYPES }, options: { type: ["array", "null"], items: { type: "string" } }, isRequired: { type: "boolean" }, position: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) { return req(tenant, `/admin/custom-fields/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_custom_field_delete",
    description: "Delete a custom booking field.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) { return req(tenant, `/admin/custom-fields/${encodeURIComponent(id)}`, "DELETE"); },
  },

  // ── Waivers ──
  {
    name: "uiiq_waiver_create",
    description: "Set the waiver an experience shows at booking (one per experience: creates or replaces it). bodyHtml is sanitised server-side; requireSign defaults to true.",
    inputSchema: { type: "object", required: ["experienceId", "title", "bodyHtml"], properties: { experienceId: { type: "string" }, title: { type: "string" }, bodyHtml: { type: "string" }, requireSign: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) { return req(tenant, "/admin/waivers", "POST", body); },
  },
  {
    name: "uiiq_waiver_delete",
    description: "Remove a waiver template by its id (the waiver's id, not the experience's).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) { return req(tenant, `/admin/waivers/${encodeURIComponent(id)}`, "DELETE"); },
  },

  // ── Launcher cards (SUPER_ADMIN) ──
  {
    name: "uiiq_launcher_card_list",
    description: "The sidebar launcher cards every tenant can see (subject to featureKey), plus the feature keys available for gating. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() { return op("/admin/launcher-cards"); },
  },
  {
    name: "uiiq_launcher_card_create",
    description: "Add a launcher card (name + href required). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["name", "href"], properties: { name: { type: "string" }, href: { type: "string" }, ...CARD_PROPS } },
    async handler(body) { return op("/admin/launcher-cards", "POST", body); },
  },
  {
    name: "uiiq_launcher_card_update",
    description: "Edit a launcher card; only the fields sent change. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, href: { type: "string" }, ...CARD_PROPS } },
    async handler({ id, ...body }) { return op(`/admin/launcher-cards/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_launcher_card_delete",
    description: "Delete a launcher card. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/launcher-cards/${encodeURIComponent(id)}`, "DELETE"); },
  },

  // ── Workshop cards (SUPER_ADMIN) ──
  {
    name: "uiiq_workshop_card_list",
    description: "The Workshop module's cards (each launches a journey by journeySlug), plus the feature keys available for gating. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() { return op("/admin/workshop-cards"); },
  },
  {
    name: "uiiq_workshop_card_create",
    description: "Add a workshop card. parentId nests it under another card; journeySlug is the journey it opens. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string" }, category: { type: "string" }, parentId: { type: "string" }, journeySlug: { type: "string" }, ...CARD_PROPS } },
    async handler(body) { return op("/admin/workshop-cards", "POST", body); },
  },
  {
    name: "uiiq_workshop_card_update",
    description: "Edit a workshop card; only the fields sent change (parentId null makes it top-level). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, category: { type: "string" }, parentId: { type: ["string", "null"] }, journeySlug: { type: "string" }, ...CARD_PROPS } },
    async handler({ id, ...body }) { return op(`/admin/workshop-cards/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_workshop_card_delete",
    description: "Delete a workshop card; its sub-cards become top-level. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/workshop-cards/${encodeURIComponent(id)}`, "DELETE"); },
  },

  // ── Task recipes (staff read, SUPER_ADMIN write) ──
  {
    name: "uiiq_task_recipe_list",
    description: `Production task recipes (ordered steps a product's fulfilment follows) with step and linked-product counts. Active only unless includeInactive. category one of ${RECIPE_CATEGORIES.join(", ")}. Staff roles.`,
    inputSchema: { type: "object", properties: { category: { type: "string", enum: RECIPE_CATEGORIES }, includeInactive: { type: "boolean" } } },
    async handler({ category, includeInactive } = {}) {
      const p = new URLSearchParams();
      if (category) p.set("category", category);
      if (includeInactive) p.set("includeInactive", "1");
      const qs = p.toString() ? `?${p}` : "";
      return op(`/admin/task-recipes${qs}`);
    },
  },
  {
    name: "uiiq_task_recipe_get",
    description: "One task recipe with its steps and up to 100 linked catalogue products. Staff roles.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/task-recipes/${encodeURIComponent(id)}`); },
  },
  {
    name: "uiiq_task_recipe_create",
    description: "Create a task recipe with its steps in order. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug", "name"], properties: { slug: { type: "string" }, name: { type: "string" }, description: { type: "string" }, productCategory: { type: "string", enum: RECIPE_CATEGORIES }, steps: { type: "array", items: RECIPE_STEP } } },
    async handler(body) { return op("/admin/task-recipes", "POST", body); },
  },
  {
    name: "uiiq_task_recipe_update",
    description: "Edit a recipe's name, description, category, active flag or version. Sending steps REPLACES every existing step. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, productCategory: { type: "string", enum: RECIPE_CATEGORIES }, active: { type: "boolean" }, version: { type: "number" }, steps: { type: "array", items: RECIPE_STEP } } },
    async handler({ id, ...body }) { return op(`/admin/task-recipes/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_task_recipe_delete",
    description: "Retire a recipe (soft delete: active=false). hard=true removes it outright, refused with 409 while any product still links it. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, hard: { type: "boolean" } } },
    async handler({ id, hard }) {
      const qs = hard ? "?hard=1" : "";
      return op(`/admin/task-recipes/${encodeURIComponent(id)}${qs}`, "DELETE");
    },
  },

  // ── Ticket types ──
  {
    name: "uiiq_ticket_type_create",
    description: "Add a ticket type (name + price in pence) to an experience, placed last.",
    inputSchema: { type: "object", required: ["experienceId", "name", "priceInPence"], properties: { experienceId: { type: "string" }, name: { type: "string" }, priceInPence: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) { return req(tenant, "/admin/ticket-types", "POST", body); },
  },
  {
    name: "uiiq_ticket_type_update",
    description: "Edit a ticket type: name, description, priceInPence, isActive only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, description: { type: ["string", "null"] }, priceInPence: { type: "number" }, isActive: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) { return req(tenant, `/admin/ticket-types/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_ticket_type_delete",
    description: "Delete a ticket type.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) { return req(tenant, `/admin/ticket-types/${encodeURIComponent(id)}`, "DELETE"); },
  },

  // ── Tickets ──
  {
    name: "uiiq_ticket_booking_pdf",
    description: "The printable PDF of every ticket on a booking (one page each). Written to outPath when given, otherwise returned as base64. Refused (413) over the per-booking ticket cap.",
    inputSchema: { type: "object", required: ["bookingId"], properties: { bookingId: { type: "string" }, outPath: { type: "string", description: "Save here instead of returning base64" }, tenant: TENANT_PROP } },
    async handler({ bookingId, outPath, tenant }) {
      const res = await api(tenant)(`/admin/tickets/booking/${encodeURIComponent(bookingId)}/pdf`);
      if (!res.ok) throw await fail(res);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (outPath) return save(outPath, bytes);
      return { contentType: "application/pdf", bytes: bytes.length, base64: bytes.toString("base64") };
    },
  },
  {
    name: "uiiq_ticket_forward_update",
    description: "Edit a scan fan-out target: active, targetUrl, secret (empty clears), externalEventId. OWNER/ADMIN.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, active: { type: "boolean" }, targetUrl: { type: "string" }, secret: { type: "string" }, externalEventId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) { return req(tenant, `/admin/tickets/forwards/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },

  // ── Bookings ──
  {
    name: "uiiq_booking_refund",
    description: "REFUNDS MONEY through the tenant's payment provider for an online booking. Omit amountPence for everything still refundable; a partial amount is capped at that. reason: requested_by_customer (default), duplicate or fraudulent. OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Booking id" }, amountPence: { type: "number" }, reason: { type: "string", enum: ["requested_by_customer", "duplicate", "fraudulent"] }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) { return req(tenant, `/admin/bookings/${encodeURIComponent(id)}/refund`, "POST", defined(body)); },
  },

  // ── Members ──
  {
    name: "uiiq_member_sign_out",
    description: "Sign a member out of the Members App on every phone at this venue (lost phone, disputed account). Audited. OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["email"], properties: { email: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ email, tenant }) { return req(tenant, "/admin/members/sign-out", "POST", { email }); },
  },
  {
    name: "uiiq_membership_subscriber_qr",
    description: "A member's pass QR as SVG (points at the staff check-in page with their code). Assigns a member code first if they have none. Written to outPath when given, otherwise returned inline.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Membership id" }, outPath: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, outPath, tenant }) {
      const res = await api(tenant)(`/admin/memberships/subscribers/${encodeURIComponent(id)}/qr`);
      if (!res.ok) throw await fail(res);
      const svg = await res.text();
      if (outPath) return save(outPath, svg);
      return { contentType: "image/svg+xml", svg };
    },
  },

  // ── Merch sets (SUPER_ADMIN) ──
  {
    name: "uiiq_merch_set_update",
    description: "Set a merch set's sector links (sectorPresetIds replaces them wholesale) and/or active flag. applyToExisting also adopts the set for tenants already on those sectors. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, sectorPresetIds: { type: "array", items: { type: "string" } }, active: { type: "boolean" }, applyToExisting: { type: "boolean" } } },
    async handler({ id, ...body }) { return op(`/admin/merch-sets/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },

  // ── Platform pricing (SUPER_ADMIN) ──
  {
    name: "uiiq_pricing_quote",
    description: "An internal sales quote for an existing tenant: its real usage priced at list across every size. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: { type: "string" } } },
    async handler({ tenantId }) { return op(`/admin/pricing/quote?tenantId=${encodeURIComponent(tenantId)}`); },
  },
  {
    name: "uiiq_pricing_config_get",
    description: "The live platform pricing config (tiers, unit credit rates, top-up rate, marketing tariff, platform fee), the defaults, and the last 20 changes. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() { return op("/admin/pricing-config"); },
  },
  {
    name: "uiiq_pricing_config_set",
    description: "Replace the platform pricing config (audited). Send the whole config object as returned by uiiq_pricing_config_get, edited; the API validates the shape. This changes what every tenant is charged. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["config"], properties: { config: { type: "object" } } },
    async handler({ config }) { return op("/admin/pricing-config", "PUT", { config }); },
  },
  {
    name: "uiiq_pricing_lead_delete",
    description: "GDPR-erase a pricing-calculator lead: deletes it AND suppresses the email so a later form can't recreate it. Audited. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/pricing-leads/${encodeURIComponent(id)}`, "DELETE"); },
  },

  // ── Promo codes ──
  {
    name: "uiiq_promo_code_update",
    description: "Edit or (de)activate a promo code; only the fields sent change and the code text itself is immutable. discountValue is percent for PERCENTAGE, pence for FIXED; maxUses/maxUsesPerEmail/validFrom/validUntil null clears.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, discountType: { type: "string", enum: ["PERCENTAGE", "FIXED"] }, discountValue: { type: "number" }, maxUses: { type: ["number", "null"] }, maxUsesPerEmail: { type: ["number", "null"] }, validFrom: { type: ["string", "null"] }, validUntil: { type: ["string", "null"] }, isActive: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) { return req(tenant, `/admin/promo-codes/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_promo_code_delete",
    description: "Delete a promo code that was never used. Refused (409) once bookings carry it: deactivate instead.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) { return req(tenant, `/admin/promo-codes/${encodeURIComponent(id)}`, "DELETE"); },
  },

  // ── Press distribution (SUPER_ADMIN) ──
  {
    name: "uiiq_press_distribution_list",
    description: "The press-release distribution services (Pressat, PRLog, OpenPR): enabled flag and a masked key preview. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() { return op("/admin/press-distribution"); },
  },
  {
    name: "uiiq_press_distribution_set",
    description: "Set a distribution service's API key (stored encrypted) and/or enabled flag. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["service"], properties: { service: { type: "string", enum: PRESS_SERVICES }, apiKey: { type: "string" }, isEnabled: { type: "boolean" } } },
    async handler(body) { return op("/admin/press-distribution", "POST", defined(body)); },
  },

  // ── Journalist contacts, platform-wide (SUPER_ADMIN) ──
  {
    name: "uiiq_journalist_admin_list",
    description: "Every journalist contact on the platform, global ones first. (A tenant's own list is uiiq_journalist_contact_list.) SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() { return op("/admin/journalist-contacts"); },
  },
  {
    name: "uiiq_journalist_admin_create",
    description: "Add a journalist contact; isGlobal makes it available to every tenant. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["name", "email", "publication"], properties: { name: { type: "string" }, email: { type: "string" }, publication: { type: "string" }, beat: { type: "string" }, region: { type: "string" }, notes: { type: "string" }, isGlobal: { type: "boolean" } } },
    async handler(body) { return op("/admin/journalist-contacts", "POST", body); },
  },
  {
    name: "uiiq_journalist_admin_update",
    description: "Edit a journalist contact; only the fields sent change. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, email: { type: "string" }, publication: { type: "string" }, beat: { type: "string" }, region: { type: "string" }, notes: { type: "string" }, isGlobal: { type: "boolean" }, isActive: { type: "boolean" } } },
    async handler({ id, ...body }) { return op(`/admin/journalist-contacts/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_journalist_admin_delete",
    description: "Delete a journalist contact. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/journalist-contacts/${encodeURIComponent(id)}`, "DELETE"); },
  },

  // ── Design briefs (staff read, SUPER_ADMIN write) ──
  {
    name: "uiiq_design_brief_list",
    description: `Customer design briefs, newest first, with status counts. Filter by status (${BRIEF_STATUSES.join(", ")}), siteId, tenantId, assignedToUserId, search (email, name, title); page/limit (max 100). Staff roles.`,
    inputSchema: { type: "object", properties: { status: { type: "string", enum: BRIEF_STATUSES }, siteId: { type: "string" }, tenantId: { type: "string" }, assignedToUserId: { type: "string" }, search: { type: "string" }, page: { type: "number" }, limit: { type: "number" } } },
    async handler(filters = {}) {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(defined(filters))) p.set(k, String(v));
      const qs = p.toString() ? `?${p}` : "";
      return op(`/admin/design-briefs${qs}`);
    },
  },
  {
    name: "uiiq_design_brief_get",
    description: "One design brief with its site, tenant and resulting design. Staff roles.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/design-briefs/${encodeURIComponent(id)}`); },
  },
  {
    name: "uiiq_design_brief_create",
    description: "Log a design brief by hand (phone-in / email-in customer). assignTo true assigns it to you. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["customerEmail", "title", "description"], properties: { customerEmail: { type: "string" }, customerName: { type: "string" }, title: { type: "string" }, description: { type: "string" }, colourPreference: { type: "string" }, deadline: { type: "string", description: "ISO date" }, moodboardUrls: { type: "array", items: { type: "string" } }, referencePhotoUrls: { type: "array", items: { type: "string" } }, orderRef: { type: "string" }, siteSlug: { type: "string" }, tenantSlug: { type: "string" }, assignTo: { type: "boolean" } } },
    async handler(body) { return op("/admin/design-briefs", "POST", body); },
  },
  {
    name: "uiiq_design_brief_update",
    description: "Move a brief's status, assign it, link the resulting design, or edit its text. DELIVERED needs a resultingDesignId (sent or already set). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, status: { type: "string", enum: BRIEF_STATUSES }, assignedToUserId: { type: ["string", "null"] }, resultingDesignId: { type: ["string", "null"] }, title: { type: "string" }, description: { type: "string" }, colourPreference: { type: ["string", "null"] } } },
    async handler({ id, ...body }) { return op(`/admin/design-briefs/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },

  // ── Acts Direct records (SUPER_ADMIN) ──
  {
    name: "uiiq_acts_direct_list",
    description: "Acts Direct integration records (artists / bookings mirrored from acts.direct), newest first. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() { return op("/admin/acts-direct"); },
  },
  {
    name: "uiiq_acts_direct_update",
    description: "Edit an Acts Direct record: posmVendorSlug, stripeCustomerId, stripeSubscriptionId, status, ticketsActive. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, posmVendorSlug: { type: ["string", "null"] }, stripeCustomerId: { type: ["string", "null"] }, stripeSubscriptionId: { type: ["string", "null"] }, status: { type: "string" }, ticketsActive: { type: "boolean" } } },
    async handler({ id, ...body }) { return op(`/admin/acts-direct/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_acts_direct_fire_webhook",
    description: `Re-fire an Acts Direct webhook for a record (event one of ${ACTS_EVENTS.join(", ")}). Sends to acts.direct; fire-and-forget. SUPER_ADMIN only.`,
    inputSchema: { type: "object", required: ["id", "event"], properties: { id: { type: "string" }, event: { type: "string", enum: ACTS_EVENTS } } },
    async handler({ id, event }) { return op(`/admin/acts-direct/${encodeURIComponent(id)}`, "POST", { event }); },
  },

  // ── IQEX form registry ──
  {
    name: "uiiq_iqex_form_list",
    description: "The registered IQEX forms (formKey, label, formId, formUrl, plan/canvas sections, active). SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() { return op("/admin/iqex-forms"); },
  },
  {
    name: "uiiq_iqex_form_upsert",
    description: "Register or replace an IQEX form config by formKey (idempotent). formUrl must be https. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["formKey", "label"], properties: { formKey: { type: "string" }, label: { type: "string" }, formId: { type: "number" }, formUrl: { type: "string" }, sections: { type: "array", items: { type: "string" } }, canvas: { type: "array", items: { type: "string" } }, description: { type: "string" } } },
    async handler(body) { return op("/admin/iqex-forms", "POST", body); },
  },
  {
    name: "uiiq_iqex_form_update",
    description: "Edit an IQEX form config by id; only the fields sent change (isActive toggles it). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, label: { type: "string" }, formId: { type: ["number", "null"] }, formUrl: { type: ["string", "null"] }, description: { type: ["string", "null"] }, sections: { type: "array", items: { type: "string" } }, canvas: { type: "array", items: { type: "string" } }, isActive: { type: "boolean" } } },
    async handler({ id, ...body }) { return op(`/admin/iqex-forms/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_iqex_form_delete",
    description: "Remove an IQEX form config. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/iqex-forms/${encodeURIComponent(id)}`, "DELETE"); },
  },
  {
    name: "uiiq_iqex_form_spec",
    description: "The printable spec sheet of the active IQEX forms (or one, by formKey) — the HTML IQEX's PDF import reads; open it in a browser to print. Written to outPath when given. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: { formKey: { type: "string" }, outPath: { type: "string" } } },
    async handler({ formKey, outPath } = {}) {
      const qs = formKey ? `?formKey=${encodeURIComponent(formKey)}` : "";
      const res = await api()(`/admin/iqex-forms/pdf${qs}`);
      if (!res.ok) throw await fail(res);
      const html = await res.text();
      if (outPath) return save(outPath, html);
      return { contentType: "text/html", html };
    },
  },
  {
    name: "uiiq_iqex_form_system_json",
    description: "The platform's system IQEX form definitions as JSON — questions, hints, the webhook field each maps to — for one slug or all, expanded per active site. Staff roles.",
    inputSchema: { type: "object", properties: { slug: { type: "string" } } },
    async handler({ slug } = {}) {
      const qs = slug ? `?slug=${encodeURIComponent(slug)}` : "";
      return op(`/admin/iqex-forms/system-json${qs}`);
    },
  },
  {
    name: "uiiq_iqex_form_system_spec",
    description: "The printable spec sheet of the system IQEX forms (one slug or all) in the layout IQEX's PDF import reads. HTML; written to outPath when given. Staff roles.",
    inputSchema: { type: "object", properties: { slug: { type: "string" }, outPath: { type: "string" } } },
    async handler({ slug, outPath } = {}) {
      const qs = slug ? `?slug=${encodeURIComponent(slug)}` : "";
      const res = await api()(`/admin/iqex-forms/system-pdf${qs}`);
      if (!res.ok) throw await fail(res);
      const html = await res.text();
      if (outPath) return save(outPath, html);
      return { contentType: "text/html", html };
    },
  },

  // ── Sector presets (SUPER_ADMIN) ──
  {
    name: "uiiq_preset_list",
    description: "Sector presets (named feature bundles + terminology per business sector) with their features and tenant counts. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() { return op("/admin/presets"); },
  },
  {
    name: "uiiq_preset_create",
    description: "Create a sector preset (key is slugified; must be unique). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["key", "name"], properties: { key: { type: "string" }, ...PRESET_PROPS } },
    async handler(body) { return op("/admin/presets", "POST", body); },
  },
  {
    name: "uiiq_preset_update",
    description: "Edit a preset (featureKeys replaces its feature list). Snapshot semantics: no tenant changes until uiiq_preset_reapply. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, ...PRESET_PROPS } },
    async handler({ id, ...body }) { return op(`/admin/presets/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_preset_delete",
    description: "Delete a preset; tenants on it are detached and keep their copied flags. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/presets/${encodeURIComponent(id)}`, "DELETE"); },
  },
  {
    name: "uiiq_preset_apply",
    description: "Apply a preset to one tenant: copies its features and terminology onto the tenant, overwriting that tenant's feature tweaks. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id", "tenantId"], properties: { id: { type: "string" }, tenantId: { type: "string" } } },
    async handler({ id, tenantId }) { return op(`/admin/presets/${encodeURIComponent(id)}/apply`, "POST", { tenantId }); },
  },
  {
    name: "uiiq_preset_reapply",
    description: "Re-apply an edited preset to EVERY tenant on it, overwriting their per-tenant feature tweaks. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/presets/${encodeURIComponent(id)}/reapply`, "POST", {}); },
  },
];
