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
async function req(tenant, path, method = "GET", body) {
  const res = await api(tenant)(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
  if (!res.ok) throw await fail(res);
  return res.status === 204 ? { ok: true } : res.json();
}
// SUPER_ADMIN control plane — never impersonated.
const op = (path, method, body) => req(null, path, method, body);
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// WORKFLOW — the film / keepsake order workflow. The SUPER_ADMIN side
// configures it per tenant: workflow types (what a site sells), their tiers,
// keepsake products, and the WordPress sites that push orders in. The tenant
// side works it: the board, email triggers per status, assigning and asking
// the customer to approve a stage. Templates and instances (uiiq_workflow_list,
// uiiq_workflow_instances, uiiq_workflow_trigger) live in automation.js.
//
// Not here: /workflow/approve/<token> is the emailed customer approval link.
const TYPE_PROPS = {
  siteSlug: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, shortDescription: { type: "string" }, longDescription: { type: "string" },
  iqformTemplateId: { type: "string" }, automationRecipeId: { type: "string" }, minQuestionsRequired: { type: "number", description: "default 15" },
  deliveryDaysSla: { type: "number", description: "default 14" }, sortOrder: { type: "number" },
};
const TIER_PROPS = {
  name: { type: "string" }, slug: { type: "string" }, priceGbp: { type: "number" }, description: { type: "string" }, features: { type: "array", items: { type: "string" } },
  keepsakeId: { type: ["string", "null"] }, includesHumanEdit: { type: "boolean" }, isGiftAvailable: { type: "boolean", description: "default true" },
  sortOrder: { type: "number" }, wcProductId: { type: ["number", "null"], description: "WooCommerce product id" },
};
const KEEPSAKE_PROPS = {
  name: { type: "string" }, sku: { type: "string" }, description: { type: "string" }, addonPriceGbp: { type: ["number", "null"] },
  nfcCompatible: { type: "boolean" }, qrCompatible: { type: "boolean" }, sortOrder: { type: "number" },
};
const TRIGGER_PROPS = {
  status: { type: "string", description: "Order status that fires it, e.g. FILM_READY" }, recipient: { type: "string", description: "CUSTOMER (default) or STAFF" },
  subject: { type: "string" }, bodyTemplate: { type: "string" }, enabled: { type: "boolean" }, workflowTypeId: { type: ["string", "null"], description: "Limit to one workflow type; null = all" },
};
const tenantQs = (tenantId) => (tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "");

export const workflowTools = [
  // ── Keepsake products (SUPER_ADMIN) ──
  {
    name: "uiiq_workflow_keepsake_list",
    description: "Keepsake products (the physical add-on a tier can ship), across tenants or for one tenantId. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: { tenantId: { type: "string" } } },
    async handler({ tenantId } = {}) { return op(`/admin/workflow/keepsakes${tenantQs(tenantId)}`); },
  },
  {
    name: "uiiq_workflow_keepsake_create",
    description: "Add a keepsake product to a tenant's site (sku is upper-cased). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["tenantId", "siteSlug", "name", "sku"], properties: { tenantId: { type: "string" }, siteSlug: { type: "string" }, ...KEEPSAKE_PROPS } },
    async handler(body) { return op("/admin/workflow/keepsakes", "POST", body); },
  },
  {
    name: "uiiq_workflow_keepsake_update",
    description: "Edit a keepsake product; only the fields sent change. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, status: { type: "string" }, ...KEEPSAKE_PROPS } },
    async handler({ id, ...body }) { return op(`/admin/workflow/keepsakes/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_workflow_keepsake_delete",
    description: "Delete a keepsake product. Refused (409) while any tier uses it. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/workflow/keepsakes/${encodeURIComponent(id)}`, "DELETE"); },
  },

  // ── Workflow sites (SUPER_ADMIN) ──
  {
    name: "uiiq_workflow_site_list",
    description: "The WordPress sites registered to push workflow orders in, with their tenant and status. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() { return op("/admin/workflow/sites"); },
  },
  {
    name: "uiiq_workflow_site_create",
    description: "Register a site for a tenant. Returns the site's API token ONCE — it is hashed at rest and never shown again. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["tenantId", "siteSlug", "label"], properties: { tenantId: { type: "string" }, siteSlug: { type: "string" }, label: { type: "string" } } },
    async handler(body) { return op("/admin/workflow/sites", "POST", body); },
  },
  {
    name: "uiiq_workflow_site_rotate",
    description: "Rotate a site's API token: the old token stops working immediately and the new one is returned once. Update the WP plugin straight after. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/workflow/sites/${encodeURIComponent(id)}/rotate`, "POST", {}); },
  },
  {
    name: "uiiq_workflow_site_update",
    description: "Rename a site or set its status (ACTIVE / REVOKED — revoked sites can't push orders). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, label: { type: "string" }, status: { type: "string", enum: ["ACTIVE", "REVOKED"] } } },
    async handler({ id, ...body }) { return op(`/admin/workflow/sites/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_workflow_site_delete",
    description: "Delete a site registration; its token stops working. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/workflow/sites/${encodeURIComponent(id)}`, "DELETE"); },
  },

  // ── Workflow types + tiers (SUPER_ADMIN) ──
  {
    name: "uiiq_workflow_type_list",
    description: "Workflow types (what a site sells, e.g. a legacy film) with their tiers and order counts, across tenants or for one tenantId. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: { tenantId: { type: "string" } } },
    async handler({ tenantId } = {}) { return op(`/admin/workflow/types${tenantQs(tenantId)}`); },
  },
  {
    name: "uiiq_workflow_type_get",
    description: "One workflow type with its tiers (and their keepsakes) and order count. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/workflow/types/${encodeURIComponent(id)}`); },
  },
  {
    name: "uiiq_workflow_type_create",
    description: "Create a workflow type for a tenant's site. iqformTemplateId is the IQEX form the customer fills; automationRecipeId the IQEX recipe that renders. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["tenantId", "siteSlug", "name", "slug"], properties: { tenantId: { type: "string" }, ...TYPE_PROPS } },
    async handler(body) { return op("/admin/workflow/types", "POST", body); },
  },
  {
    name: "uiiq_workflow_type_update",
    description: "Edit a workflow type; only the fields sent change. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, status: { type: "string" }, ...TYPE_PROPS } },
    async handler({ id, ...body }) { return op(`/admin/workflow/types/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_workflow_type_delete",
    description: "Delete a workflow type. Refused (409) once it has orders. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) { return op(`/admin/workflow/types/${encodeURIComponent(id)}`, "DELETE"); },
  },
  {
    name: "uiiq_workflow_tier_create",
    description: "Add a price tier to a workflow type (name, slug, priceGbp required). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["typeId", "name", "slug", "priceGbp"], properties: { typeId: { type: "string" }, ...TIER_PROPS } },
    async handler({ typeId, ...body }) { return op(`/admin/workflow/types/${encodeURIComponent(typeId)}/tiers`, "POST", body); },
  },
  {
    name: "uiiq_workflow_tier_update",
    description: "Edit a tier; only the fields sent change. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["typeId", "tierId"], properties: { typeId: { type: "string" }, tierId: { type: "string" }, status: { type: "string" }, ...TIER_PROPS } },
    async handler({ typeId, tierId, ...body }) { return op(`/admin/workflow/types/${encodeURIComponent(typeId)}/tiers/${encodeURIComponent(tierId)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_workflow_tier_delete",
    description: "Delete a tier. Refused (409) once it has orders. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["typeId", "tierId"], properties: { typeId: { type: "string" }, tierId: { type: "string" } } },
    async handler({ typeId, tierId }) { return op(`/admin/workflow/types/${encodeURIComponent(typeId)}/tiers/${encodeURIComponent(tierId)}`, "DELETE"); },
  },

  // ── The working board (tenant) ──
  {
    name: "uiiq_workflow_board",
    description: "The tenant's workflow order board: columns (intake, in progress, review, fulfilment, complete, issues) with the live orders in each and any pending approval.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) { return req(tenant, "/workflow/board"); },
  },
  {
    name: "uiiq_workflow_email_trigger_list",
    description: "The tenant's status-change email triggers (which order status emails whom, with what template).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) { return req(tenant, "/workflow/email-triggers"); },
  },
  {
    name: "uiiq_workflow_email_trigger_create",
    description: "Add an email trigger: when an order reaches `status`, email the recipient with subject + bodyTemplate. Enabled by default.",
    inputSchema: { type: "object", required: ["status", "subject", "bodyTemplate"], properties: { ...TRIGGER_PROPS, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) { return req(tenant, "/workflow/email-triggers", "POST", defined(body)); },
  },
  {
    name: "uiiq_workflow_email_trigger_update",
    description: "Edit an email trigger; only the fields sent change (enabled false switches it off).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, ...TRIGGER_PROPS, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) { return req(tenant, `/workflow/email-triggers/${encodeURIComponent(id)}`, "PATCH", defined(body)); },
  },
  {
    name: "uiiq_workflow_email_trigger_delete",
    description: "Delete an email trigger.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) { return req(tenant, `/workflow/email-triggers/${encodeURIComponent(id)}`, "DELETE"); },
  },
  {
    name: "uiiq_workflow_order_assign",
    description: "Assign a workflow order to a user in the tenant (assignedUserId null unassigns).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Order id" }, assignedUserId: { type: ["string", "null"] }, tenant: TENANT_PROP } },
    async handler({ id, assignedUserId = null, tenant }) { return req(tenant, `/workflow/orders/${encodeURIComponent(id)}/assign`, "PATCH", { assignedUserId }); },
  },
  {
    name: "uiiq_workflow_order_request_approval",
    description: "Ask the customer to approve a stage of their order: creates an approval link, moves the order to AWAITING_APPROVAL and EMAILS the customer. stage defaults to 'review', the link expires after expiryDays (14).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Order id" }, stage: { type: "string" }, message: { type: "string" }, previewUrl: { type: "string" }, expiryDays: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) { return req(tenant, `/workflow/orders/${encodeURIComponent(id)}/request-approval`, "POST", defined(body)); },
  },
];
