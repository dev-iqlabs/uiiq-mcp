import { apiClient } from "../auth.js";

// PRICING — leads captured by the public pricing calculator. Admin-scoped:
// the underlying /api/admin/pricing-leads route is SUPER_ADMIN-only and reads
// across tenants, so (like uiiq_tenant_list) these ride the stored SUPER_ADMIN
// login directly — no tenant impersonation.
export const pricingTools = [
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
