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


/**
 * UIIQ Commerce platform tools — hosted shops, assortment, fee rates, resell
 * payouts, and fee-aware pricing. Mirrors the `uiiq commerce` CLI group.
 */
export const commerceTools = [
  {
    name: "uiiq_commerce_price_breakdown",
    description: "Compute the platform/tenant fee split for a sale. source RESELL or OWN; retailPence and (RESELL) costPence in pence; optional tenantId applies per-tenant rates.",
    inputSchema: {
      type: "object",
      required: ["source"],
      properties: {
        source: { type: "string", description: "RESELL or OWN" },
        retailPence: { type: "number" },
        costPence: { type: "number", description: "Our cost (RESELL only)" },
        tenantId: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ source, retailPence, costPence, tenantId, tenant }) {
      const res = await api(tenant)("/commerce/price-breakdown", {
        method: "POST",
        body: JSON.stringify({ source: String(source).toUpperCase(), retailPence, costPence, tenantId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Hosted shops (admin) ──────────────────────────────────────────
  {
    name: "uiiq_commerce_hosted_shop_list",
    description: "List StackCP-hosted tenant shops and their provisioning status.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/admin/hosted-shops");
      const d = await res.json();
      return d.shops ?? d;
    },
  },
  {
    name: "uiiq_commerce_hosted_shop_request",
    description: "Request a hosted shop for a tenant (creates the Site in REQUESTED).",
    inputSchema: {
      type: "object",
      required: ["tenantId", "name", "domain"],
      properties: {
        tenantId: { type: "string" },
        name: { type: "string" },
        domain: { type: "string", description: "e.g. shop.example.com" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenantId, name, domain, tenant }) {
      const res = await api(tenant)("/admin/hosted-shops", {
        method: "POST",
        body: JSON.stringify({ tenantId, name, domain }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_commerce_hosted_shop_provision",
    description: "Run/advance provisioning for a hosted shop (mock provisioner until live wiring).",
    inputSchema: { type: "object", required: ["siteId"], properties: { siteId: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ siteId, tenant }) {
      const res = await api(tenant)(`/admin/hosted-shops/${siteId}/provision`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_commerce_hosted_shop_go_live",
    description: "Take a provisioned hosted shop live. Returns the per-shop webhookSecret ONCE.",
    inputSchema: { type: "object", required: ["siteId"], properties: { siteId: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ siteId, tenant }) {
      const res = await api(tenant)(`/admin/hosted-shops/${siteId}/go-live`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Resell payouts (admin) ────────────────────────────────────────
  {
    name: "uiiq_commerce_payout_list",
    description: "List resell payouts owed to tenants. Optional status PENDING|PAID|FAILED|CANCELLED.",
    inputSchema: { type: "object", properties: { status: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ status, tenant } = {}) {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await api(tenant)(`/admin/resell-payouts${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_commerce_payout_settle",
    description: "Settle a resell payout (transfer the tenant's share to their connected account).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/admin/resell-payouts/${id}/settle`, { method: "POST" });
      const d = await res.json();
      if (!res.ok || d.ok === false) throw new Error(d.reason ?? "Settlement failed");
      return d;
    },
  },

  // ── Fee rates (admin, per tenant) ─────────────────────────────────
  {
    name: "uiiq_commerce_fee_rates_get",
    description: "Get a tenant's fee rates (overrides + defaults + effective split).",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ tenantId, tenant }) {
      const res = await api(tenant)(`/admin/tenants/${tenantId}/fee-rates`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_commerce_fee_rates_set",
    description: "Set a tenant's fee rates. resellTenantSharePct / ownPlatformFeePct; pass null to clear to default.",
    inputSchema: {
      type: "object",
      required: ["tenantId"],
      properties: {
        tenantId: { type: "string" },
        resellTenantSharePct: { type: ["number", "null"] },
        ownPlatformFeePct: { type: ["number", "null"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenantId, resellTenantSharePct, ownPlatformFeePct, tenant }) {
      const body = {};
      if (resellTenantSharePct !== undefined) body.resellTenantSharePct = resellTenantSharePct;
      if (ownPlatformFeePct !== undefined) body.ownPlatformFeePct = ownPlatformFeePct;
      const res = await api(tenant)(`/admin/tenants/${tenantId}/fee-rates`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Assortment (admin, per tenant) ────────────────────────────────
  {
    name: "uiiq_commerce_assortment_list",
    description: "List a tenant's catalogue assortment (what they may resell).",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ tenantId, tenant }) {
      const res = await api(tenant)(`/admin/tenants/${tenantId}/assortment`);
      const d = await res.json();
      return d.items ?? d;
    },
  },
  {
    name: "uiiq_commerce_assortment_add",
    description: "Add a catalogue product to a tenant's assortment.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "catalogProductId"],
      properties: { tenantId: { type: "string" }, catalogProductId: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenantId, catalogProductId, tenant }) {
      const res = await api(tenant)(`/admin/tenants/${tenantId}/assortment`, {
        method: "POST",
        body: JSON.stringify({ catalogProductId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_commerce_assortment_remove",
    description: "Remove a product from a tenant's assortment.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "catalogProductId"],
      properties: { tenantId: { type: "string" }, catalogProductId: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenantId, catalogProductId, tenant }) {
      const res = await api(tenant)(`/admin/tenants/${tenantId}/assortment/${catalogProductId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return { ok: true };
    },
  },

  // ── Catalogue browse (admin) ──────────────────────────────────────
  {
    name: "uiiq_commerce_catalogue",
    description: "Browse the shared catalogue. Filter by sector tag / brand slug / name; pass tenantId to flag assortment membership.",
    inputSchema: {
      type: "object",
      properties: {
        sector: { type: "string" },
        brand: { type: "string" },
        q: { type: "string" },
        tenantId: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ sector, brand, q, tenantId, tenant } = {}) {
      const params = new URLSearchParams();
      if (sector) params.set("sector", sector);
      if (brand) params.set("brand", brand);
      if (q) params.set("q", q);
      if (tenantId) params.set("tenantId", tenantId);
      const res = await api(tenant)(`/admin/catalogue?${params.toString()}`);
      const d = await res.json();
      return d.items ?? d;
    },
  },
];
