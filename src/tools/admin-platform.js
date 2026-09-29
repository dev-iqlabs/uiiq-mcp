import { apiClient } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const TENANT_ID = { type: "string", description: "The target tenant's id (the tenant is named in the path, not the session)." };
const api = (tenant) => apiClient(tenant ? { tenant } : {});

async function fail(res) {
  const text = await res.text();
  try { const j = JSON.parse(text); if (j?.error) return new Error(j.error); } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}
const send = async (tenant, path, method, body) => {
  const res = await api(tenant)(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
  if (!res.ok) throw await fail(res);
  return res.json();
};
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const enc = encodeURIComponent;

// PLATFORM ADMIN — the operator's control plane and the /admin settings
// surface, beyond what tenant.js (tenant CRUD, features, Connect key) already
// covers. Two kinds of route live here:
//   - SUPER_ADMIN control plane, where the target tenant is in the PATH
//     (/admin/tenants/<id>/…, /admin/users, /admin/sites, /admin/vat …):
//     these take `tenantId` and never a `tenant` context — see the
//     OPERATOR_SCOPE note in auth.js.
//   - tenant-scoped /admin routes (staff, groups, venues, sessions, add-ons,
//     booking emails, API keys, ElevenLabs key, payments, OTA): these take the
//     usual optional `tenant`.
// Tools that return or set a key/secret say so; the value is shown once and
// never logged here.
const ROLES = ["OWNER", "ADMIN", "STAFF"];
const PRODUCTS = ["GROW", "RUN", "SELL", "UIIQ", "AI"];
const ADS_TIERS = ["STARTER", "GROWTH", "SCALE"];
const EMAIL_TYPES = ["confirmation", "reminder", "followup", "cancellation", "deposit_reminder", "gift_card", "membership"];

export const adminPlatformTools = [
  // ── Gift programmes (per tenant, SUPER_ADMIN) ──
  {
    name: "uiiq_admin_gift_programme_list",
    description: "A tenant's Gift Programme registry (Garden Plan Gift and any others): key, label, enabled, value ladder, journey form, outcome. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: TENANT_ID } },
    async handler({ tenantId }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/gift-programmes`, "GET");
    },
  },
  {
    name: "uiiq_admin_gift_programme_create",
    description: "Create a Gift Programme for a tenant. key is lower snake_case; values = [{ valuePence, feePence }] (max £10,000, fee <= value); journey.formId is the IQForm that collects the recipient's answers; outcome.kind is what the voucher produces. 409 if the key exists (use update). SUPER_ADMIN.",
    inputSchema: {
      type: "object", required: ["tenantId", "key", "label", "values", "journey", "outcome"],
      properties: {
        tenantId: TENANT_ID, key: { type: "string" }, label: { type: "string" }, enabled: { type: "boolean" },
        values: { type: "array", items: { type: "object", properties: { valuePence: { type: "number" }, feePence: { type: "number" } } } },
        feeKind: { type: "string" }, journey: { type: "object", description: "{ formId, ... }" }, outcome: { type: "object", description: "{ kind, ... }" }, artwork: { type: "object" },
      },
    },
    async handler({ tenantId, ...body }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/gift-programmes`, "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_gift_programme_update",
    description: "Update one of a tenant's Gift Programmes by key — only the fields you send change (journey and outcome are merged). Saving the garden programme also mirrors it into the legacy iqplantSettings. SUPER_ADMIN.",
    inputSchema: {
      type: "object", required: ["tenantId", "key"],
      properties: {
        tenantId: TENANT_ID, key: { type: "string" }, label: { type: "string" }, enabled: { type: "boolean" },
        values: { type: "array", items: { type: "object", properties: { valuePence: { type: "number" }, feePence: { type: "number" } } } },
        feeKind: { type: "string" }, journey: { type: "object" }, outcome: { type: "object" }, artwork: { type: "object" },
      },
    },
    async handler({ tenantId, ...body }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/gift-programmes`, "PATCH", defined(body));
    },
  },

  // ── IQEX link, delivery, org key (per tenant, SUPER_ADMIN) ──
  {
    name: "uiiq_admin_iqex_link_set",
    description: "Link a tenant to an IQEX organisation (orgId) or unlink it (orgId null). Sets Tenant.iqexOrgId, pushes the slug to IQEX and pairs IQEX's iqlink connection with the tenant's Connect key — minting a Connect key if the tenant has none (never rotating an existing one). Reports iqexLinked, connectKeyMinted, connectKeySent. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: TENANT_ID, orgId: { type: ["number", "null"], description: "IQEX org id, or null to unlink" } } },
    async handler({ tenantId, orgId = null }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/iqex-link`, "POST", { orgId });
    },
  },
  {
    name: "uiiq_admin_iqex_delivery_get",
    description: "Whether a tenant's IQEX delivery connection (how IQEX sends briefs back to UIIQ) is in place: state = unlinked | no_connect_key | blocked | not_connected | connected, plus the connection count. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: TENANT_ID } },
    async handler({ tenantId }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/iqex-delivery`, "GET");
    },
  },
  {
    name: "uiiq_admin_iqex_delivery_connect",
    description: "Create or refresh a tenant's IQEX delivery connection: sends the tenant's Connect key to IQEX server-to-server (it never comes back here) and maps every active brief form as a destination. Needs the tenant linked to an IQEX org with a readable Connect key. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: TENANT_ID } },
    async handler({ tenantId }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/iqex-delivery`, "POST");
    },
  },
  {
    name: "uiiq_admin_iqex_org_key_status",
    description: "Probe a tenant's IQEX Org API key without reading or rotating it: state = readable | needs_rotation | blocked | unlinked | unreachable. Never returns the key. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: TENANT_ID } },
    async handler({ tenantId }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/iqex-org-key`, "GET");
    },
  },
  {
    name: "uiiq_admin_iqex_org_key_rotate",
    description: "ROTATE a tenant's IQEX Org API key and RETURN THE NEW KEY ONCE (a secret: handle it as one). The old key stops working everywhere at once; sites on uiiq-connect >= 3.4.0 pick the new one up on their next config sync, older plugins need it pasted in. UIIQ never stores it. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: TENANT_ID } },
    async handler({ tenantId }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/iqex-org-key`, "POST");
    },
  },

  // ── Members and users of a tenant (SUPER_ADMIN) ──
  {
    name: "uiiq_admin_member_list",
    description: "The members of a tenant (TenantUser rows): membership id, role, user { id, name, email }. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: TENANT_ID } },
    async handler({ tenantId }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/members`, "GET");
    },
  },
  {
    name: "uiiq_admin_member_add",
    description: "Add an EXISTING user (by email) to a tenant with a role (OWNER, ADMIN, STAFF). 404 if no user has that email; 409 if already a member. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId", "email", "role"], properties: { tenantId: TENANT_ID, email: { type: "string" }, role: { type: "string", enum: ROLES } } },
    async handler({ tenantId, email, role }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/members`, "POST", { email, role });
    },
  },
  {
    name: "uiiq_admin_member_remove",
    description: "REMOVE a user's membership of a tenant (by the user's id, not the membership id). The user account itself is kept. SUPER_ADMIN; refused under read-only impersonation.",
    inputSchema: { type: "object", required: ["tenantId", "userId"], properties: { tenantId: TENANT_ID, userId: { type: "string" } } },
    async handler({ tenantId, userId }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/members/${enc(userId)}`, "DELETE");
    },
  },
  {
    name: "uiiq_admin_tenant_user_create",
    description: "Create a NEW user account inside a tenant (name, email, password >= 8 chars, role OWNER/ADMIN/STAFF, default STAFF). 400 if the email is in use. To add an existing user use uiiq_admin_member_add. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId", "name", "email", "password"], properties: { tenantId: TENANT_ID, name: { type: "string" }, email: { type: "string" }, password: { type: "string" }, role: { type: "string", enum: ROLES } } },
    async handler({ tenantId, ...body }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/users`, "POST", defined(body));
    },
  },

  // ── Per-tenant switches (SUPER_ADMIN) ──
  {
    name: "uiiq_admin_posm_secret_rotate",
    description: "ROTATE a tenant's POSM webhook secret and RETURN THE NEW SECRET ONCE (handle as a secret). Whatever signs POSM webhooks with the old one stops verifying at once. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: TENANT_ID } },
    async handler({ tenantId }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/posm-secret`, "POST");
    },
  },
  {
    name: "uiiq_admin_product_set",
    description: "Set a tenant's entitlement to a product (GROW, RUN, SELL, UIIQ, AI): status ACTIVE, TRIAL, SUSPENDED or CANCELLED — or omit status to remove the product row entirely. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId", "product"], properties: { tenantId: TENANT_ID, product: { type: "string", enum: PRODUCTS }, status: { type: "string", enum: ["ACTIVE", "TRIAL", "SUSPENDED", "CANCELLED"], description: "Omit to remove the product from the tenant" } } },
    async handler({ tenantId, product, status = null }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/products`, "PATCH", { product, status });
    },
  },
  {
    name: "uiiq_admin_tenant_settings_set",
    description: "The operator-side settings on a tenant (distinct from uiiq_tenant_settings_update, which is the tenant's own profile): giftCardMaxPence (cap, <= 1,000,000), allowedBookingModes (non-empty subset of the booking modes), iqplantSettings { giftEnabled, giftValues: [{ valuePence, feePence }] } (legacy — prefer the gift programme tools). Only the fields you send change. SUPER_ADMIN.",
    inputSchema: {
      type: "object", required: ["tenantId"],
      properties: {
        tenantId: TENANT_ID, giftCardMaxPence: { type: "number" },
        allowedBookingModes: { type: "array", items: { type: "string" } },
        iqplantSettings: { type: "object" },
      },
    },
    async handler({ tenantId, ...body }) {
      const data = defined(body);
      if (!Object.keys(data).length) throw new Error("Send at least one setting to change");
      return send(null, `/admin/tenants/${enc(tenantId)}/settings`, "PATCH", data);
    },
  },
  {
    name: "uiiq_admin_tenant_stripe_set",
    description: "Set the platform fee on a tenant's connected payment account: applicationFeePercent (0–50) and/or passFeesToCustomer. The tenant cannot change these themselves. 500 if the tenant has no payment account yet. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: TENANT_ID, applicationFeePercent: { type: "number" }, passFeesToCustomer: { type: "boolean" } } },
    async handler({ tenantId, ...body }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/stripe`, "PATCH", defined(body));
    },
  },
  {
    name: "uiiq_admin_tenant_website_pages_set",
    description: "A tenant's Website Pages generation settings and internal flag: websitePagesModel (HAIKU_4_5, SONNET_4_6, OPUS_4_7), websitePagesBackend (DIRECT or IQEX), selfApproveWebsitePages, isInternal. Only the fields you send change. SUPER_ADMIN.",
    inputSchema: {
      type: "object", required: ["tenantId"],
      properties: {
        tenantId: TENANT_ID, websitePagesModel: { type: "string", enum: ["HAIKU_4_5", "SONNET_4_6", "OPUS_4_7"] },
        websitePagesBackend: { type: "string", enum: ["DIRECT", "IQEX"] }, selfApproveWebsitePages: { type: "boolean" }, isInternal: { type: "boolean" },
      },
    },
    async handler({ tenantId, ...body }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/website-pages`, "PATCH", defined(body));
    },
  },

  // ── Users (platform-wide) ──
  {
    name: "uiiq_admin_user_list",
    description: "The user accounts in a tenant (id, name, email, role), sorted by name. Reads the session's tenant — pass tenant to look at another.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return send(tenant, "/admin/users", "GET");
    },
  },
  {
    name: "uiiq_admin_user_create",
    description: "Create a user anywhere on the platform, or with promote:true change an existing user's role (and tenant). role is OWNER, ADMIN, STAFF (tenantId required) or SUPER_ADMIN (no tenant). A new user with no password gets a random one, RETURNED ONCE as generatedPassword — treat it as a secret. Cannot change your own role or demote the last super-admin; refused while impersonating when granting SUPER_ADMIN. Audit-logged. SUPER_ADMIN.",
    inputSchema: {
      type: "object", required: ["email", "role"],
      properties: {
        email: { type: "string" }, role: { type: "string", enum: [...ROLES, "SUPER_ADMIN"] }, name: { type: "string", description: "Required for a new user" },
        password: { type: "string" }, tenantId: { type: "string" }, promote: { type: "boolean", description: "Change an existing user's role instead of failing with 409" },
      },
    },
    async handler(body) {
      return send(null, "/admin/users", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_user_update",
    description: "Change a user's role (OWNER, ADMIN, STAFF, SUPER_ADMIN), status (ACTIVE or SUSPENDED) or name. Cannot change your own role, suspend yourself, or remove the last active super-admin. Audit-logged. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, role: { type: "string", enum: [...ROLES, "SUPER_ADMIN"] }, status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] }, name: { type: "string" } } },
    async handler({ id, ...body }) {
      return send(null, `/admin/users/${enc(id)}`, "PATCH", defined(body));
    },
  },
  {
    name: "uiiq_admin_user_send_reset",
    description: "SENDS a password-reset EMAIL to a user (link valid 1 hour, single use). Returns sent:false with a reason when the user has no password or is not ACTIVE. Audit-logged. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      return send(null, `/admin/users/${enc(id)}/send-reset`, "POST");
    },
  },
  {
    name: "uiiq_admin_user_set_password",
    description: "SET a user's password directly (a secret: it is sent, not shown, and never logged) and sign them out everywhere. Weak passwords are refused. Audit-logged. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["id", "password"], properties: { id: { type: "string" }, password: { type: "string" } } },
    async handler({ id, password }) {
      return send(null, `/admin/users/${enc(id)}/set-password`, "POST", { password });
    },
  },

  // ── API keys (tenant-scoped; OWNER/ADMIN to change) ──
  {
    name: "uiiq_admin_api_key_list",
    description: "The workspace's API keys: id, name, prefix, permissions, last used, expiry, active. The key material itself is never returned.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return send(tenant, "/admin/api-keys", "GET");
    },
  },
  {
    name: "uiiq_admin_api_key_create",
    description: "Mint an API key for the workspace and RETURN IT ONCE (plus a signingSecret for an auction-only key) — both are secrets that are never shown again. permissions default to [\"read\"]; mode live (default) or test. OWNER/ADMIN. Audit-logged.",
    inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string" }, permissions: { type: "array", items: { type: "string" } }, mode: { type: "string", enum: ["live", "test"] }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      return send(tenant, "/admin/api-keys", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_api_key_update",
    description: "Rename, enable/disable (isActive) or re-permission an API key. Giving a key auctions:bid-only permissions issues a signing secret, RETURNED ONCE; taking them away clears it. OWNER/ADMIN.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, isActive: { type: "boolean" }, permissions: { type: "array", items: { type: "string" } }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      return send(tenant, `/admin/api-keys/${enc(id)}`, "PATCH", defined(body));
    },
  },
  {
    name: "uiiq_admin_api_key_secret_rotate",
    description: "ROTATE the signing secret of an auction key (auctions:bid) and RETURN THE NEW SECRET ONCE. The old secret stops verifying at once. OWNER/ADMIN. Audit-logged.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      return send(tenant, `/admin/api-keys/${enc(id)}`, "PATCH", { action: "rotate-signing-secret" });
    },
  },
  {
    name: "uiiq_admin_api_key_delete",
    description: "DELETE an API key permanently — anything using it fails from the next call. To pause instead, set isActive false with uiiq_admin_api_key_update. OWNER/ADMIN.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      return send(tenant, `/admin/api-keys/${enc(id)}`, "DELETE");
    },
  },

  // ── Feature registry, ElevenLabs key, VAT, audit log ──
  {
    name: "uiiq_admin_feature_create",
    description: "Register a new feature flag in the platform catalogue (key is lower-cased, spaces to _; product GROW, RUN, SELL or AI). Tenants are then switched onto it with uiiq_tenant_features. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["key", "name", "product"], properties: { key: { type: "string" }, name: { type: "string" }, description: { type: "string" }, product: { type: "string", enum: ["GROW", "RUN", "SELL", "AI"] } } },
    async handler(body) {
      return send(null, "/admin/features", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_elevenlabs_key_get",
    description: "Whether the workspace has its own ElevenLabs API key set, with a masked preview (first 8 and last 4 characters). The key itself is never returned.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return send(tenant, "/admin/settings/elevenlabs", "GET");
    },
  },
  {
    name: "uiiq_admin_elevenlabs_key_set",
    description: "SET the workspace's ElevenLabs API key (a secret: sent, never shown or logged), or clear it with apiKey null. OWNER/ADMIN.",
    inputSchema: { type: "object", properties: { apiKey: { type: ["string", "null"], description: "The key, or null to clear" }, tenant: TENANT_PROP } },
    async handler({ apiKey = null, tenant } = {}) {
      return send(tenant, "/admin/settings/elevenlabs", "POST", { apiKey });
    },
  },
  {
    name: "uiiq_admin_vat_get",
    description: "The platform VAT rates (GB): standardPct, reducedPct, zeroPct and when they were last changed. SUPER_ADMIN.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return send(null, "/admin/vat", "GET");
    },
  },
  {
    name: "uiiq_admin_vat_set",
    description: "Change the platform VAT rates (each 0–100; only the ones you send change). Every inc-VAT price on the platform is worked out from these. SUPER_ADMIN.",
    inputSchema: { type: "object", properties: { standardPct: { type: "number" }, reducedPct: { type: "number" }, zeroPct: { type: "number" } } },
    async handler(body) {
      const data = defined(body);
      if (!Object.keys(data).length) throw new Error("Send at least one rate to change");
      return send(null, "/admin/vat", "PATCH", data);
    },
  },
  {
    name: "uiiq_admin_audit_log",
    description: "The platform audit log, newest first: filter by resource, resourceId, userId, action (prefix match, e.g. admin.user) and since (ISO date); limit up to 200 (default 100). Returns { entries, total, limit }. SUPER_ADMIN.",
    inputSchema: { type: "object", properties: { resource: { type: "string" }, resourceId: { type: "string" }, userId: { type: "string" }, action: { type: "string" }, since: { type: "string" }, limit: { type: "number" } } },
    async handler(filters = {}) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(defined(filters))) params.set(k, String(v));
      const qs = params.toString() ? `?${params}` : "";
      return send(null, `/admin/audit-log${qs}`, "GET");
    },
  },

  // ── Sell: sessions, staff, groups, venues, add-ons, booking emails, OTA (tenant-scoped) ──
  {
    name: "uiiq_admin_session_list",
    description: "The bookable sessions of one experience (experienceId required), optionally between dateFrom and dateTo (ISO dates), up to limit (default 50). For bookings themselves see uiiq_sell_booking_list.",
    inputSchema: { type: "object", required: ["experienceId"], properties: { experienceId: { type: "string" }, dateFrom: { type: "string" }, dateTo: { type: "string" }, limit: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...filters }) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(defined(filters))) params.set(k, String(v));
      return send(tenant, `/admin/sessions?${params}`, "GET");
    },
  },
  {
    name: "uiiq_admin_session_create",
    description: "Add one session to an experience: date (YYYY-MM-DD), startTime and endTime (HH:MM), capacity, optional performerId (a staff member) and resourceIds (active resources, each allocated once). To generate many from a schedule use uiiq_sell_session_generate.",
    inputSchema: {
      type: "object", required: ["experienceId", "date", "startTime", "endTime", "capacity"],
      properties: { experienceId: { type: "string" }, date: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" }, capacity: { type: "number" }, performerId: { type: "string" }, resourceIds: { type: "array", items: { type: "string" } }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      return send(tenant, "/admin/sessions", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_staff_list",
    description: "The workspace's Sell staff (performers): internal staff linked to a user, and external ones, with type, role, contact details, tags, price guide and active flag.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return send(tenant, "/admin/staff", "GET");
    },
  },
  {
    name: "uiiq_admin_staff_create",
    description: "Add a staff member: staffType INTERNAL (userId required — one profile per user) or EXTERNAL; name required; optional role, bio, contactEmail, contactPhone, tags, priceGuidePence, travelRadius. The slug comes from the name. OWNER/ADMIN.",
    inputSchema: {
      type: "object", required: ["name", "staffType"],
      properties: { name: { type: "string" }, staffType: { type: "string", enum: ["INTERNAL", "EXTERNAL"] }, userId: { type: "string" }, role: { type: "string" }, bio: { type: "string" }, contactEmail: { type: "string" }, contactPhone: { type: "string" }, tags: { type: "array", items: { type: "string" } }, priceGuidePence: { type: "number" }, travelRadius: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      return send(tenant, "/admin/staff", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_staff_get",
    description: "One staff member by id, with the linked user if internal.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      return send(tenant, `/admin/staff/${enc(id)}`, "GET");
    },
  },
  {
    name: "uiiq_admin_staff_update",
    description: "Edit a Venue Staff profile (Sell performer): name, role, bio, contactEmail, contactPhone, tags, priceGuidePence (whole pence, or null), travelRadius — only the fields you send change (empty string clears a text field). isActive false DEACTIVATES them: hidden from Venue Staff's default list, the calendar and the session pickers, and a new session can't be given to them (409); existing sessions and bookings stay. isActive true brings them back. Audited. OWNER/ADMIN. For the HR staff record use uiiq_hr_staff_update / uiiq_hr_staff_deactivate.",
    inputSchema: {
      type: "object", required: ["id"],
      properties: { id: { type: "string" }, name: { type: "string" }, role: { type: "string" }, bio: { type: "string" }, contactEmail: { type: "string" }, contactPhone: { type: "string" }, tags: { type: "array", items: { type: "string" } }, priceGuidePence: { type: "number" }, travelRadius: { type: "string" }, isActive: { type: "boolean" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant, ...body }) {
      return send(tenant, `/admin/staff/${enc(id)}`, "PATCH", defined(body));
    },
  },
  {
    name: "uiiq_admin_staff_delete",
    description: "Remove a Venue Staff profile. Someone with sessions, bookings or availability on record is HIDDEN instead (isActive false; the response says deactivated: true with the reason); only a profile with none of those is deleted permanently. A linked user account is kept either way. OWNER/ADMIN.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      return send(tenant, `/admin/staff/${enc(id)}`, "DELETE");
    },
  },
  {
    name: "uiiq_admin_group_list",
    description: "The workspace's experience groups in display order, each with its non-archived experiences.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return send(tenant, "/admin/groups", "GET");
    },
  },
  {
    name: "uiiq_admin_group_create",
    description: "Create an experience group: name (<= 200) and slug (lowercase, hyphens, <= 100, unique) required; optional description and imageUrl (must be on the platform's image hosts). Goes last in the order.",
    inputSchema: { type: "object", required: ["name", "slug"], properties: { name: { type: "string" }, slug: { type: "string" }, description: { type: "string" }, imageUrl: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      return send(tenant, "/admin/groups", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_group_reorder",
    description: "Set the display order of experience groups: order = [{ id, position }] (up to 500; positions are whole numbers from 0).",
    inputSchema: { type: "object", required: ["order"], properties: { order: { type: "array", items: { type: "object", required: ["id", "position"], properties: { id: { type: "string" }, position: { type: "number" } } } }, tenant: TENANT_PROP } },
    async handler({ order, tenant }) {
      return send(tenant, "/admin/groups", "PATCH", { order });
    },
  },
  {
    name: "uiiq_admin_group_update",
    description: "Edit an experience group: name, slug, description (null clears), imageUrl (null clears), isPublished. Unknown fields are refused.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, description: { type: ["string", "null"] }, imageUrl: { type: ["string", "null"] }, isPublished: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      return send(tenant, `/admin/groups/${enc(id)}`, "PATCH", defined(body));
    },
  },
  {
    name: "uiiq_admin_group_delete",
    description: "DELETE an experience group permanently. Its experiences are not deleted.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      return send(tenant, `/admin/groups/${enc(id)}`, "DELETE");
    },
  },
  {
    name: "uiiq_admin_venue_list",
    description: "The workspace's venues (physical sites experiences and resources belong to) with experience and resource counts.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return send(tenant, "/admin/venues", "GET");
    },
  },
  {
    name: "uiiq_admin_venue_create",
    description: "Create a venue: name required (the slug comes from it; 409 if a venue with that name exists), optional description, addressLine1, city, postcode. Timezone is Europe/London.",
    inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" }, addressLine1: { type: "string" }, city: { type: "string" }, postcode: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      return send(tenant, "/admin/venues", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_venue_get",
    description: "One venue with its active classes, pending compliance reminders and counts (experiences, resources, bills, recurring costs).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      return send(tenant, `/admin/venues/${enc(id)}`, "GET");
    },
  },
  {
    name: "uiiq_admin_venue_update",
    description: "Edit a venue: name, description, addressLine1, addressLine2, city, postcode (null clears), isActive, rebookBy (YYYY-MM-DD or null — keeps the venue's rebook reminder in step).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, description: { type: ["string", "null"] }, addressLine1: { type: ["string", "null"] }, addressLine2: { type: ["string", "null"] }, city: { type: ["string", "null"] }, postcode: { type: ["string", "null"] }, isActive: { type: "boolean" }, rebookBy: { type: ["string", "null"] }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      return send(tenant, `/admin/venues/${enc(id)}`, "PATCH", defined(body));
    },
  },
  {
    name: "uiiq_admin_add_on_list",
    description: "The workspace's booking add-ons (extras sold with an experience), optionally for one experienceId.",
    inputSchema: { type: "object", properties: { experienceId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ experienceId, tenant } = {}) {
      const qs = experienceId ? `?experienceId=${enc(experienceId)}` : "";
      return send(tenant, `/admin/add-ons${qs}`, "GET");
    },
  },
  {
    name: "uiiq_admin_add_on_create",
    description: "Create an add-on: name and priceInPence required; optional experienceId (omit for a workspace-wide add-on), description, imageUrl (platform image hosts only), maxQuantity (default 10), perPerson. Goes last in its experience's order.",
    inputSchema: { type: "object", required: ["name", "priceInPence"], properties: { name: { type: "string" }, priceInPence: { type: "number" }, experienceId: { type: "string" }, description: { type: "string" }, imageUrl: { type: "string" }, maxQuantity: { type: "number" }, perPerson: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      return send(tenant, "/admin/add-ons", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_add_on_update",
    description: "Edit an add-on: name, description, priceInPence, imageUrl, maxQuantity, perPerson, isActive, position. Unknown fields are refused.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, description: { type: ["string", "null"] }, priceInPence: { type: "number" }, imageUrl: { type: ["string", "null"] }, maxQuantity: { type: "number" }, perPerson: { type: "boolean" }, isActive: { type: "boolean" }, position: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      return send(tenant, `/admin/add-ons/${enc(id)}`, "PATCH", defined(body));
    },
  },
  {
    name: "uiiq_admin_add_on_delete",
    description: "DELETE an add-on permanently. To take it off sale instead, set isActive false.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      return send(tenant, `/admin/add-ons/${enc(id)}`, "DELETE");
    },
  },
  {
    name: "uiiq_admin_booking_email_list",
    description: "The workspace's booking email templates (confirmation, reminder, followup, cancellation, deposit_reminder, gift_card, membership): subject, HTML body, enabled, send offset.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return send(tenant, "/admin/emails", "GET");
    },
  },
  {
    name: "uiiq_admin_booking_email_set",
    description: "Create or replace one booking email template by type: subject and bodyHtml required; enabled (default true); sendOffsetHours for timed ones (reminder/followup). Nothing is sent by this call.",
    inputSchema: { type: "object", required: ["type", "subject", "bodyHtml"], properties: { type: { type: "string", enum: EMAIL_TYPES }, subject: { type: "string" }, bodyHtml: { type: "string" }, enabled: { type: "boolean" }, sendOffsetHours: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      return send(tenant, "/admin/emails", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_ota_channels",
    description: "The OTA distribution channels (Beyonk, Airbnb Experiences, Viator, FareHarbor) and their connection state. None can be connected yet — every channel reports disconnected.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return send(tenant, "/admin/ota", "GET");
    },
  },

  // ── Payments (tenant-scoped) ──
  {
    name: "uiiq_admin_payments_connect_get",
    description: "The workspace's connected payment account (Stripe or PayPal): provider, account id, charges/payouts enabled (refreshed from the provider), platform fee, statement descriptor, payout schedule. connected:false when none.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return send(tenant, "/admin/payments/connect", "GET");
    },
  },
  {
    name: "uiiq_admin_payments_connect_start",
    description: "Start payment onboarding: CREATES a connected account at the provider (STRIPE default, or PAYPAL) if the workspace has none, then returns an onboardingUrl for the owner to complete in a browser. Idempotent per tenant. Refused under read-only impersonation.",
    inputSchema: { type: "object", properties: { email: { type: "string", description: "Account email; defaults to the session user's" }, provider: { type: "string", enum: ["STRIPE", "PAYPAL"] }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body } = {}) {
      return send(tenant, "/admin/payments/connect", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_payments_connect_update",
    description: "Change the workspace's statementDescriptor (<= 22 chars) or payoutSchedule. The platform fee cannot be changed here (403) — that is uiiq_admin_tenant_stripe_set.",
    inputSchema: { type: "object", properties: { statementDescriptor: { type: ["string", "null"] }, payoutSchedule: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body } = {}) {
      return send(tenant, "/admin/payments/connect", "PATCH", defined(body));
    },
  },

  // ── Platform catalogues: sites, locations, credit costs, ads tiers ──
  {
    name: "uiiq_admin_site_list",
    description: "The platform's websites (umbrella and shop sites): slug, name, kind, domain, active, staging/live URLs, connected shop, and whether a WP bridge secret is set (never the secret). SUPER_ADMIN.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return send(null, "/admin/sites", "GET");
    },
  },
  {
    name: "uiiq_admin_site_create",
    description: "Register a website: slug, name, domain required (normalised); kind (default UMBRELLA), stagingUrl, liveUrl, ownerTenantId, wpBridgeSecret (a secret: stored, never shown again). 409 on a slug or domain clash. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["slug", "name", "domain"], properties: { slug: { type: "string" }, name: { type: "string" }, domain: { type: "string" }, kind: { type: "string" }, stagingUrl: { type: "string" }, liveUrl: { type: "string" }, ownerTenantId: { type: "string" }, wpBridgeSecret: { type: "string" } } },
    async handler(body) {
      return send(null, "/admin/sites", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_site_update",
    description: "Edit a website: slug, name, domain, kind, active, acceptsCustomerDesigns, stagingUrl, liveUrl, ownerTenantId, wpBridgeSecret (a secret; never shown), stackcpPackageId (a numeric 20i package id, \"auto\" to look it up from the live URL, or empty to clear). Renaming the slug links any orphan connected shop of that slug. SUPER_ADMIN.",
    inputSchema: {
      type: "object", required: ["id"],
      properties: { id: { type: "string" }, slug: { type: "string" }, name: { type: "string" }, domain: { type: "string" }, kind: { type: "string" }, active: { type: "boolean" }, acceptsCustomerDesigns: { type: "boolean" }, stagingUrl: { type: ["string", "null"] }, liveUrl: { type: ["string", "null"] }, ownerTenantId: { type: ["string", "null"] }, wpBridgeSecret: { type: ["string", "null"] }, stackcpPackageId: { type: ["string", "null"] } },
    },
    async handler({ id, ...body }) {
      return send(null, `/admin/sites/${enc(id)}`, "PATCH", defined(body));
    },
  },
  {
    name: "uiiq_admin_location_list",
    description: "The platform's physical locations (virtual-office and mailroom addresses) with virtual office and mail item counts. SUPER_ADMIN.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return send(null, "/admin/locations", "GET");
    },
  },
  {
    name: "uiiq_admin_location_create",
    description: "Add a physical location: name, addressLine1, city, postcode required; addressLine2, country (default GB). SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["name", "addressLine1", "city", "postcode"], properties: { name: { type: "string" }, addressLine1: { type: "string" }, addressLine2: { type: "string" }, city: { type: "string" }, postcode: { type: "string" }, country: { type: "string" } } },
    async handler(body) {
      return send(null, "/admin/locations", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_credit_cost_list",
    description: "The credit tariff: what each platform action costs in credits (stored rows plus defaults), with category and active flag. SUPER_ADMIN.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return send(null, "/admin/credit-costs", "GET");
    },
  },
  {
    name: "uiiq_admin_credit_cost_create",
    description: "Add a tariff row: action_key required, credit_cost (whole credits, default 1), description, category, active (default true). Changes what tenants are charged from the next call. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["action_key"], properties: { action_key: { type: "string" }, credit_cost: { type: "number" }, description: { type: "string" }, category: { type: "string" }, active: { type: "boolean" } } },
    async handler(body) {
      return send(null, "/admin/credit-costs", "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_credit_cost_update",
    description: "Change a tariff row by action key: credit_cost, description, category, active. Takes effect on the next charge. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["key"], properties: { key: { type: "string" }, credit_cost: { type: "number" }, description: { type: "string" }, category: { type: "string" }, active: { type: "boolean" } } },
    async handler({ key, ...body }) {
      return send(null, `/admin/credit-costs/${enc(key)}`, "PATCH", defined(body));
    },
  },
  {
    name: "uiiq_admin_ads_tiers_get",
    description: "The Ads & Search tier configs (STARTER, GROWTH, SCALE: monthly price, video and keyword limits) and the feature gates (which tier each ads feature needs). SUPER_ADMIN.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return send(null, "/admin/ads/tiers", "GET");
    },
  },
  {
    name: "uiiq_admin_ads_tier_update",
    description: "Change an ads tier: priceMonthlyPence (whole pence), videoLimit and/or keywordLimit (null = unlimited). Applies to every tenant on that tier. SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["tier"], properties: { tier: { type: "string", enum: ADS_TIERS }, priceMonthlyPence: { type: "number" }, videoLimit: { type: ["number", "null"] }, keywordLimit: { type: ["number", "null"] } } },
    async handler({ tier, ...body }) {
      return send(null, `/admin/ads/tiers/${enc(tier)}`, "PATCH", defined(body));
    },
  },
  {
    name: "uiiq_admin_ads_gate_update",
    description: "Set the minimum tier (STARTER, GROWTH, SCALE) an ads feature gate needs, by gate key (from uiiq_admin_ads_tiers_get). SUPER_ADMIN.",
    inputSchema: { type: "object", required: ["key", "minTier"], properties: { key: { type: "string" }, minTier: { type: "string", enum: ADS_TIERS } } },
    async handler({ key, minTier }) {
      return send(null, `/admin/ads/gates/${enc(key)}`, "PATCH", { minTier });
    },
  },

  // ── Daily briefing, seeds ──
  {
    name: "uiiq_admin_briefing_list",
    description: "The last 10 operator daily briefs (date, summary, sections). SUPER_ADMIN.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return send(null, "/admin/briefing", "GET");
    },
  },
  {
    name: "uiiq_admin_briefing_run",
    description: "RUN today's daily briefing now: builds the agenda and generates the brief with the AI (spends LLM usage), upserting today's row. Rate-limited per caller; normally the cron does this. SUPER_ADMIN.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return send(null, "/admin/briefing/run", "POST");
    },
  },
  {
    name: "uiiq_admin_workflow_templates_seed",
    description: "Seed or refresh the platform's global task-workflow templates (Service Appointment, Field Job Dispatch, …): existing ones are overwritten with the built-in definition. Reports created/updated per template. SUPER_ADMIN.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return send(null, "/admin/seed/workflow-templates", "POST");
    },
  },
];
