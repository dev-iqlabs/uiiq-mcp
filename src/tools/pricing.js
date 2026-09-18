import { apiClient } from "../auth.js";

// PRICING — leads captured by the public pricing calculator. Admin-scoped:
// the underlying /api/admin/pricing-leads route is SUPER_ADMIN-only and reads
// across tenants, so (like uiiq_tenant_list) these ride the stored SUPER_ADMIN
// login directly — no tenant impersonation.
const ITEM_TYPES = ["SERVICE", "LABOUR", "MATERIAL", "TICKET", "ADD_ON", "PACKAGE", "HIRE", "SUBSCRIPTION", "CUSTOM"];

export const pricingTools = [
  {
    name: "uiiq_price_list",
    description:
      "List the tenant's price items (the Pricing screen), 25 per page in name order. Filter by type: SERVICE, LABOUR, MATERIAL (materials & retail), TICKET, ADD_ON, PACKAGE, HIRE, SUBSCRIPTION or CUSTOM. Returns { items, total, page, pages, pageSize, type }; sellPricePence and costPricePence are in pence.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ITEM_TYPES, description: "Only items of this type. Omit for all types." },
        page: { type: "integer", minimum: 1, description: "Page number, from 1. Defaults to 1." },
        tenant: { type: "string", description: "Tenant id, slug or exact name to act in. Omit for your own tenant." },
      },
    },
    async handler({ type, page, tenant } = {}) {
      const qs = new URLSearchParams({ page: String(page ?? 1) });
      if (type) qs.set("type", type);
      const res = await apiClient(tenant ? { tenant } : {})(`/price-list?${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_pricing_leads_list",
    description:
      "List recent leads from the public pricing calculator (newest first, up to 200). Each row: email, sector, inputs, recommendedTier, estimatedTotalPence, and consent state (marketingConsent, consentVerified, consentVerifiedAt). SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/admin/pricing-leads");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
