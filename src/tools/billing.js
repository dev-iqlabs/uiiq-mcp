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


export const billingTools = [
  {
    name: "uiiq_billing_info",
    description: "Get the tenant's billing information (plan, status, balance).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/billing");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_invoices",
    description: "List the tenant's invoices.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/billing/invoices");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_usage",
    description:
      "The tenant's live 'My Plan & Usage' statement: this month's plan base, accruing credit overage (billed in arrears), and the platform fee already collected off sales (GMV) — plus the all-in cost this period and any active discount deal. The platform fee is shown for transparency but is netted off sales payouts, not on the UIIQ invoice.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/billing/usage");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_override_get",
    description:
      "List a tenant's per-tenant billing overrides (discount deals, newest first) plus the cost floor and list credit rate for the UI. SUPER_ADMIN-only on the API (the tool just calls the endpoint; the API enforces the gate).",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: { type: "string" } } },
    async handler({ tenantId, tenant } = {}) {
      const res = await api(tenant)(`/admin/tenants/${tenantId}/billing-override`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_override_set",
    description:
      "Add a dated per-tenant billing override (discount deal). Append-only — a taper is several dated rows; an overlapping active row is retired. `reason` is required (FOUNDING|NEGOTIATED|LOYALTY|CHARITY|ANNUAL_COMMIT|MIGRATION). Guardrails (enforced API-side): creditRatePerCredit >= the cost floor, platformFeePct is a FRACTION 0.01-1 (1%-100%), basePctOff is a PERCENT 0-100. SUPER_ADMIN-only; blocked while impersonating.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "reason"],
      properties: {
        tenantId: { type: "string" },
        reason: {
          type: "string",
          enum: ["FOUNDING", "NEGOTIATED", "LOYALTY", "CHARITY", "ANNUAL_COMMIT", "MIGRATION"],
        },
        label: { type: "string", description: "Optional human label for the deal." },
        basePctOff: { type: "number", description: "Percent off the plan base, 0-100." },
        creditRatePerCredit: { type: "number", description: "Discounted credit rate in £/credit (>= cost floor)." },
        platformFeePct: { type: "number", description: "Platform fee as a fraction, e.g. 0.02 = 2% (min 0.01, max 1)." },
        startsAt: { type: "string", description: "ISO date/time the deal starts (optional; null = now/-inf)." },
        endsAt: { type: "string", description: "ISO date/time the deal ends (optional; null = forever)." },
      },
    },
    async handler({ tenantId, reason, label, basePctOff, creditRatePerCredit, platformFeePct, startsAt, endsAt, tenant } = {}) {
      const body = { reason };
      if (label !== undefined) body.label = label;
      if (basePctOff !== undefined) body.basePctOff = basePctOff;
      if (creditRatePerCredit !== undefined) body.creditRatePerCredit = creditRatePerCredit;
      if (platformFeePct !== undefined) body.platformFeePct = platformFeePct;
      if (startsAt !== undefined) body.startsAt = startsAt;
      if (endsAt !== undefined) body.endsAt = endsAt;
      const res = await api(tenant)(`/admin/tenants/${tenantId}/billing-override`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_override_clear",
    description:
      "Deactivate a tenant's billing override(s) — reverting to list pricing and tearing down any Stripe base-%-off coupon. Pass overrideId to clear one row, else all active overrides are cleared. SUPER_ADMIN-only; blocked while impersonating.",
    inputSchema: {
      type: "object",
      required: ["tenantId"],
      properties: {
        tenantId: { type: "string" },
        overrideId: { type: "string", description: "Optional — clear just this override; omit to clear all active." },
      },
    },
    async handler({ tenantId, overrideId, tenant } = {}) {
      const qs = overrideId ? `?overrideId=${encodeURIComponent(overrideId)}` : "";
      const res = await api(tenant)(`/admin/tenants/${tenantId}/billing-override${qs}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Plan sizes, right-size estimate, Stripe checkout + portal ──
  {
    name: "uiiq_billing_tiers",
    description: "The subscription sizes this tenant can buy (only sizes with a Stripe price configured): tier START|GROW|SCALE, basePence, monthlyCredits, platformFeePct — plus the tenant's currentTier.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/billing/tiers");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_estimate",
    description: "The 'right-size' what-if: this month's real usage priced across every plan size at list price, and the cheapest size that fits. { estimate: null } when billing isn't configured.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/billing/estimate");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_checkout",
    description: "Start a paid UIIQ subscription (trial → paid): creates a Stripe Checkout session and RETURNS A CHECKOUT URL for a person to open and pay — nothing is charged until they complete it. tier START|GROW|SCALE (omit for the legacy single platform price). Any active base-%-off override is applied as a coupon. Refused on a read-only impersonation session.",
    inputSchema: { type: "object", properties: { tier: { type: "string", enum: ["START", "GROW", "SCALE"] }, tenant: TENANT_PROP } },
    async handler({ tier, tenant } = {}) {
      const res = await api(tenant)("/billing/checkout", { method: "POST", body: JSON.stringify(tier ? { tier } : {}) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_portal",
    description: "Open the Stripe customer billing portal: RETURNS A URL where the tenant can change card, view invoices or cancel. 400 when the tenant has no Stripe customer yet. OWNER/ADMIN only.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/billing/portal", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
