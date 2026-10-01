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
const send = async (tenant, path, method, body) => {
  const res = await api(tenant)(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
  if (!res.ok) throw await fail(res);
  return res.json();
};

// INTEGRATIONS — the tenant's ImportSources (WooCommerce, generic API, Xero):
// list / add / remove, pull contacts from one, the Sell→contacts sync, and the
// Xero sales-side pieces (revenue accounts, sales account config, P&L +
// invoices). Credentials are encrypted at rest and never returned.
//
// Not here on purpose: GET /integrations/xero/authorize and /callback are the
// browser OAuth hop (a redirect to login.xero.com with a state cookie), and
// POST /integrations/posm/booking-event is POSM's webhook, authenticated by a
// per-tenant Bearer secret — a machine contract, not a tool. The cost-side
// Xero import lives in costs.js (uiiq_costs_xero_*).
export const integrationsTools = [
  {
    name: "uiiq_integrations_list",
    description: "The tenant's connected import sources: id, provider (WOOCOMMERCE | API | XERO…), name, status, lastSyncedAt, lastSyncCount and non-secret config. Credentials are never returned.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    handler: ({ tenant } = {}) => send(tenant, "/integrations", "GET"),
  },
  {
    name: "uiiq_integrations_add",
    description: "Add an import source with its credentials (encrypted at rest). WOOCOMMERCE: { siteUrl, consumerKey, consumerSecret }. API: { url, apiKey?, emailField?, nameField? }. Xero is connected through the browser OAuth flow at /dashboard/integrations, not here.",
    inputSchema: {
      type: "object",
      required: ["provider", "name"],
      properties: {
        provider: { type: "string", description: "WOOCOMMERCE | API" },
        name: { type: "string" },
        credentials: { type: "object", additionalProperties: true },
        tenant: TENANT_PROP,
      },
    },
    handler: ({ tenant, ...body }) => send(tenant, "/integrations", "POST", body),
  },
  {
    name: "uiiq_integrations_delete",
    description: "DELETE an import source and its stored credentials. Contacts and bills already imported from it are kept. Removing a XERO source disconnects Xero for cost import and funding invoices too.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    handler: ({ id, tenant }) => send(tenant, `/integrations/${encodeURIComponent(id)}`, "DELETE"),
  },
  {
    name: "uiiq_integrations_sync",
    description: "Pull contacts from an import source into the tenant's contact list (new emails only, tagged by provider, UNSUBSCRIBED from email and SMS — a customer list is not marketing consent; existing contacts keep their subscription): WooCommerce customers, a generic API list, or Xero customers. Returns { imported, skipped }. 422 for a provider with no sync.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    handler: ({ id, tenant }) => send(tenant, `/integrations/${encodeURIComponent(id)}/sync`, "POST"),
  },
  {
    name: "uiiq_integrations_posm_sync",
    description: "Sync the tenant's own Sell bookings and memberships into contacts: creates missing contacts UNSUBSCRIBED from email and SMS (existing contacts keep their subscription) and adds posm/booking/member/plan tags to existing ones. Returns { imported, updated, skipped, total, sources }.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    handler: ({ tenant } = {}) => send(tenant, "/integrations/posm/sync", "POST"),
  },

  // ── Xero (sales side) ──
  {
    name: "uiiq_integrations_xero_accounts",
    description: "The REVENUE accounts in the Xero organisation behind a XERO import source (sourceId from uiiq_integrations_list) — pick one for uiiq_integrations_xero_config_set.",
    inputSchema: { type: "object", required: ["sourceId"], properties: { sourceId: { type: "string" }, tenant: TENANT_PROP } },
    handler: ({ sourceId, tenant }) => send(tenant, `/integrations/xero/accounts?sourceId=${encodeURIComponent(sourceId)}`, "GET"),
  },
  {
    name: "uiiq_integrations_xero_config_set",
    description: "Set the Xero sales account code that UIIQ sales invoices post to, on a XERO import source. OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["sourceId", "salesAccountCode"], properties: { sourceId: { type: "string" }, salesAccountCode: { type: "string" }, tenant: TENANT_PROP } },
    handler: ({ tenant, ...body }) => send(tenant, "/integrations/xero/config", "POST", body),
  },
  {
    name: "uiiq_integrations_xero_financials",
    description: "Xero headline financials for a period (default: this month to date): income, expenses, net profit from the P&L report, plus the 20 most recently updated paid/authorised sales invoices. 404 when Xero isn't connected.",
    inputSchema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" }, tenant: TENANT_PROP } },
    async handler({ from, to, tenant } = {}) {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const qs = p.toString() ? `?${p}` : "";
      return send(tenant, `/integrations/xero/financials${qs}`, "GET");
    },
  },
];
