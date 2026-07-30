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
 * Costs & Expenses tools — bills, categories, cost centres, recurring costs,
 * spend summary + gross margin, the monthly KPI roll, period locks,
 * cost-centre allocations and VAT settings. Mirrors the retail tools; all
 * money is integer pence. Requires the tenant to have the `cost_tracking`
 * feature enabled. Bill mutations inside a locked period return 423.
 */
export const costsTools = [
  {
    name: "uiiq_costs_summary",
    description: "Spend summary + gross margin for a period. Optional from/to (YYYY-MM-DD, default month-to-date), dateBasis=paid|issue. Returns totals, by-category, by-centre (allocation-aware), top payees, revenue/COGS/gross-margin, VAT treatment (vatScheme, vatReclaimPence, trueCostPence) and the accruals view.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        dateBasis: { type: "string", enum: ["paid", "issue"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ from, to, dateBasis, tenant } = {}) {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (dateBasis) p.set("dateBasis", dateBasis);
      const res = await api(tenant)(`/costs/summary?${p}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_categories",
    description: "List the tenant's cost categories (HMRC-aligned managed list). Self-seeds defaults on first call.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/costs/categories");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_centers",
    description: "List the tenant's cost centres (departments/sites).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/costs/centers");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_bills",
    description: "List/filter cost bills. Optional from/to (YYYY-MM-DD), categoryId, status (DUE|PART_PAID|PAID|OVERDUE|DISPUTED|VOID), q (payee/ref search), page, pageSize. Returns { bills, totals }.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        categoryId: { type: "string" },
        status: { type: "string" },
        q: { type: "string" },
        page: { type: "number" },
        pageSize: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ from, to, categoryId, status, q, page, pageSize, tenant } = {}) {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (categoryId) p.set("categoryId", categoryId);
      if (status) p.set("status", status);
      if (q) p.set("q", q);
      if (page) p.set("page", String(page));
      if (pageSize) p.set("pageSize", String(pageSize));
      const res = await api(tenant)(`/costs/bills?${p}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_bill_add",
    description: "Record a cost bill. Amounts in integer pence. categoryId + netPence + issueDate (YYYY-MM-DD) required. Payee is either retailSupplierId or free-text payeeName. paid=true stamps paidDate=issueDate and status=PAID. For a prepayment spread across a service window pass isPrepayment + serviceStart/serviceEnd; link a capital purchase to the plan's asset register via assetEntryId. Fails 423 when the bill's period is locked.",
    inputSchema: {
      type: "object",
      required: ["categoryId", "netPence", "issueDate"],
      properties: {
        categoryId: { type: "string" },
        netPence: { type: "number" },
        vatPence: { type: "number" },
        payeeName: { type: "string" },
        retailSupplierId: { type: "string" },
        costCenterId: { type: "string" },
        reference: { type: "string" },
        issueDate: { type: "string" },
        paid: { type: "boolean" },
        isPrepayment: { type: "boolean", description: "Spread the cost across the service window in the accruals view" },
        serviceStart: { type: "string", description: "YYYY-MM-DD — service window start (prepayments)" },
        serviceEnd: { type: "string", description: "YYYY-MM-DD — service window end (prepayments)" },
        assetEntryId: { type: "string", description: "Plan asset register entry to link this capital bill to (see uiiq_plan_assets)" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ categoryId, netPence, vatPence, payeeName, retailSupplierId, costCenterId, reference, issueDate, paid, isPrepayment, serviceStart, serviceEnd, assetEntryId, tenant } = {}) {
      const body = {
        categoryId,
        netPence,
        vatPence: vatPence ?? 0,
        payeeName: payeeName || undefined,
        retailSupplierId: retailSupplierId || undefined,
        costCenterId: costCenterId || undefined,
        reference: reference || undefined,
        issueDate,
        paidDate: paid ? issueDate : undefined,
        status: paid ? "PAID" : "DUE",
        isPrepayment: isPrepayment || undefined,
        serviceStart: serviceStart || undefined,
        serviceEnd: serviceEnd || undefined,
        assetEntryId: assetEntryId || undefined,
      };
      const res = await api(tenant)("/costs/bills", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_bill_allocations_get",
    description: "A bill's cost-centre split. Returns { billNetPence, allocations[] } (each with costCenter.name).",
    inputSchema: {
      type: "object",
      required: ["billId"],
      properties: { billId: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ billId, tenant }) {
      const res = await api(tenant)(`/costs/bills/${encodeURIComponent(billId)}/allocations`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_bill_allocations_set",
    description: "Replace a bill's cost-centre split. Shares must sum to the bill's net EXACTLY (integer pence); an empty array clears the split so reports fall back to the bill's single costCenterId. Fails 423 when the bill's period is locked.",
    inputSchema: {
      type: "object",
      required: ["billId", "allocations"],
      properties: {
        billId: { type: "string" },
        allocations: {
          type: "array",
          items: {
            type: "object",
            required: ["costCenterId", "netPence"],
            properties: {
              costCenterId: { type: "string" },
              netPence: { type: "number", description: "Integer pence share" },
              note: { type: "string" },
            },
          },
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ billId, allocations, tenant }) {
      const res = await api(tenant)(`/costs/bills/${encodeURIComponent(billId)}/allocations`, {
        method: "PUT",
        body: JSON.stringify({ allocations }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_period_lock_list",
    description: "List every cost period lock (active and unlocked, newest first). Rows are never deleted — the history is the audit trail.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/costs/period-locks");
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      return d.locks ?? d;
    },
  },
  {
    name: "uiiq_costs_period_lock_create",
    description: "Lock a cost period so its bills can no longer be changed (mutations return 423). Pass month (YYYY-MM) or an explicit from/to date range. Owner/admin only.",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM — locks that whole month" },
        from: { type: "string", description: "YYYY-MM-DD (alternative to month)" },
        to: { type: "string", description: "YYYY-MM-DD" },
        reason: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ month, from, to, reason, tenant } = {}) {
      const body = {};
      if (month) body.month = month;
      if (from) body.from = from;
      if (to) body.to = to;
      if (reason) body.reason = reason;
      const res = await api(tenant)("/costs/period-locks", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_period_lock_toggle",
    description: "Unlock (active=false) or re-lock (active=true) a period lock by id; optionally update the reason. Owner/admin only.",
    inputSchema: {
      type: "object",
      required: ["id", "active"],
      properties: {
        id: { type: "string" },
        active: { type: "boolean", description: "false = unlock, true = re-lock" },
        reason: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, active, reason, tenant } = {}) {
      const body = { active };
      if (reason != null) body.reason = reason;
      const res = await api(tenant)(`/costs/period-locks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_settings_get",
    description: "The tenant's cost settings — VAT scheme (STANDARD | FLAT_RATE | NOT_REGISTERED), flatRatePct, vatRegistered. Self-seeds STANDARD on first read.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/costs/settings");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_settings_set",
    description: "Set the tenant's VAT scheme and/or flat-rate percentage. NOT_REGISTERED implies vatRegistered=false. Owner/admin only — this changes how every cost report treats input VAT.",
    inputSchema: {
      type: "object",
      properties: {
        vatScheme: { type: "string", enum: ["STANDARD", "FLAT_RATE", "NOT_REGISTERED"] },
        flatRatePct: { type: "number", description: "0-100 (FLAT_RATE scheme); null to clear" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ vatScheme, flatRatePct, tenant } = {}) {
      const body = {};
      if (vatScheme !== undefined) body.vatScheme = vatScheme;
      if (flatRatePct !== undefined) body.flatRatePct = flatRatePct;
      const res = await api(tenant)("/costs/settings", { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_recurring",
    description: "List recurring cost templates (rent, broadband, electricity…). Optional includeInactive.",
    inputSchema: { type: "object", properties: { includeInactive: { type: "boolean" },
        tenant: TENANT_PROP,
      } },
    async handler({ includeInactive, tenant } = {}) {
      const res = await api(tenant)(`/costs/recurring${includeInactive ? "?includeInactive=1" : ""}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_recurring_generate",
    description: "Generate any due bills from the recurring cost templates (idempotent). Admin-only. Returns { generated, templates }.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/costs/recurring/generate", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_kpi_roll",
    description: "Roll a month's cost/margin actuals into the plan's KpiActual (idempotent). Admin-only. Optional month (YYYY-MM, default current). Returns the computed metrics.",
    inputSchema: { type: "object", properties: { month: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ month, tenant } = {}) {
      const res = await api(tenant)("/costs/kpi-roll", { method: "POST", body: JSON.stringify({ month: month || undefined }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
