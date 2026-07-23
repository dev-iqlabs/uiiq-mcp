import { apiClient } from "../auth.js";

export const billingTools = [
  {
    name: "uiiq_billing_info",
    description: "Get the tenant's billing information (plan, status, balance).",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/billing");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_invoices",
    description: "List the tenant's invoices.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/billing/invoices");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_usage",
    description:
      "The tenant's live 'My Plan & Usage' statement: this month's plan base, accruing credit overage (billed in arrears), and the platform fee already collected off sales (GMV) — plus the all-in cost this period and any active discount deal. The platform fee is shown for transparency but is netted off sales payouts, not on the UIIQ invoice.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/billing/usage");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_billing_override_get",
    description:
      "List a tenant's per-tenant billing overrides (discount deals, newest first) plus the cost floor and list credit rate for the UI. SUPER_ADMIN-only on the API (the tool just calls the endpoint; the API enforces the gate).",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: { type: "string" } } },
    async handler({ tenantId } = {}) {
      const res = await apiClient()(`/admin/tenants/${tenantId}/billing-override`);
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
    async handler({ tenantId, reason, label, basePctOff, creditRatePerCredit, platformFeePct, startsAt, endsAt } = {}) {
      const body = { reason };
      if (label !== undefined) body.label = label;
      if (basePctOff !== undefined) body.basePctOff = basePctOff;
      if (creditRatePerCredit !== undefined) body.creditRatePerCredit = creditRatePerCredit;
      if (platformFeePct !== undefined) body.platformFeePct = platformFeePct;
      if (startsAt !== undefined) body.startsAt = startsAt;
      if (endsAt !== undefined) body.endsAt = endsAt;
      const res = await apiClient()(`/admin/tenants/${tenantId}/billing-override`, {
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
    async handler({ tenantId, overrideId } = {}) {
      const qs = overrideId ? `?overrideId=${encodeURIComponent(overrideId)}` : "";
      const res = await apiClient()(`/admin/tenants/${tenantId}/billing-override${qs}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
