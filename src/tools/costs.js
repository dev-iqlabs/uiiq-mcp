import { apiClient } from "../auth.js";

/**
 * Costs & Expenses tools — bills, categories, cost centres, recurring costs,
 * spend summary + gross margin, and the monthly KPI roll. Mirrors the retail
 * tools; all money is integer pence. Requires the tenant to have the
 * `cost_tracking` feature enabled.
 */
export const costsTools = [
  {
    name: "uiiq_costs_summary",
    description: "Spend summary + gross margin for a period. Optional from/to (YYYY-MM-DD, default month-to-date), dateBasis=paid|issue. Returns totals, by-category, top payees, revenue/COGS/gross-margin.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
        dateBasis: { type: "string", enum: ["paid", "issue"] },
      },
    },
    async handler({ from, to, dateBasis } = {}) {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (dateBasis) p.set("dateBasis", dateBasis);
      const res = await apiClient()(`/costs/summary?${p}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_categories",
    description: "List the tenant's cost categories (HMRC-aligned managed list). Self-seeds defaults on first call.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/costs/categories");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_centers",
    description: "List the tenant's cost centres (departments/sites).",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/costs/centers");
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
      },
    },
    async handler({ from, to, categoryId, status, q, page, pageSize } = {}) {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (categoryId) p.set("categoryId", categoryId);
      if (status) p.set("status", status);
      if (q) p.set("q", q);
      if (page) p.set("page", String(page));
      if (pageSize) p.set("pageSize", String(pageSize));
      const res = await apiClient()(`/costs/bills?${p}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_bill_add",
    description: "Record a cost bill. Amounts in integer pence. categoryId + netPence + issueDate (YYYY-MM-DD) required. Payee is either retailSupplierId or free-text payeeName. paid=true stamps paidDate=issueDate and status=PAID.",
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
      },
    },
    async handler({ categoryId, netPence, vatPence, payeeName, retailSupplierId, costCenterId, reference, issueDate, paid } = {}) {
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
      };
      const res = await apiClient()("/costs/bills", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_recurring",
    description: "List recurring cost templates (rent, broadband, electricity…). Optional includeInactive.",
    inputSchema: { type: "object", properties: { includeInactive: { type: "boolean" } } },
    async handler({ includeInactive } = {}) {
      const res = await apiClient()(`/costs/recurring${includeInactive ? "?includeInactive=1" : ""}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_recurring_generate",
    description: "Generate any due bills from the recurring cost templates (idempotent). Admin-only. Returns { generated, templates }.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/costs/recurring/generate", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_costs_kpi_roll",
    description: "Roll a month's cost/margin actuals into the plan's KpiActual (idempotent). Admin-only. Optional month (YYYY-MM, default current). Returns the computed metrics.",
    inputSchema: { type: "object", properties: { month: { type: "string" } } },
    async handler({ month } = {}) {
      const res = await apiClient()("/costs/kpi-roll", { method: "POST", body: JSON.stringify({ month: month || undefined }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
