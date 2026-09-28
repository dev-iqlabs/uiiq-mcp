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
const post = (tenant, path, body) => api(tenant)(path, { method: "POST", body: JSON.stringify(body) });
const patch = (tenant, path, body) => api(tenant)(path, { method: "PATCH", body: JSON.stringify(body) });
const del = (tenant, path) => api(tenant)(path, { method: "DELETE" });

// FUNDING TRACKER — grant / award money seen from the funder's side: a funded
// project has spend headings (each with a budget and an optional match-funded
// share), spend is ALLOCATED to a heading (from a bill, payroll or by hand),
// and periodic CLAIMS gather the unclaimed spend into an invoice to the funder.
// Rides on the `cost_tracking` feature; all money is integer pence. Period
// locks apply to allocations exactly as they do to bills (423).
export const fundingTools = [
  // ── Projects (awards) ──
  {
    name: "uiiq_funding_projects",
    description: "Every funded project with its money roll-up: award, budgeted across headings, allocated, claimed, received, remaining, unbudgeted and draft-claim count. Optional status DRAFT|ACTIVE|CLOSED. Needs `cost_tracking`.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["DRAFT", "ACTIVE", "CLOSED"] }, tenant: TENANT_PROP } },
    async handler({ status, tenant } = {}) {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await api(tenant)(`/funding/projects${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_project_add",
    description: "Start tracking a new award. name, funderName, startDate/endDate (YYYY-MM-DD) and totalAwardPence required; claimFrequency MONTHLY (default) | QUARTERLY; status defaults ACTIVE; xeroAccountCode = the sales account claim invoices post to. Needs `cost_tracking`.",
    inputSchema: {
      type: "object",
      required: ["name", "funderName", "startDate", "endDate", "totalAwardPence"],
      properties: {
        name: { type: "string" },
        funderName: { type: "string" },
        funderContactEmail: { type: "string" },
        reference: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        totalAwardPence: { type: "number" },
        status: { type: "string", enum: ["DRAFT", "ACTIVE", "CLOSED"] },
        claimFrequency: { type: "string", enum: ["MONTHLY", "QUARTERLY"] },
        notes: { type: "string" },
        xeroAccountCode: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/funding/projects", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_project_get",
    description: "One award in full: header, headings with roll-ups (budget, match share, spent, claimed, remaining, units), the allocations ledger, every claim with its lines, and totals. Needs `cost_tracking`.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/funding/projects/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_project_update",
    description: "Edit an award's header fields (name, funder, dates, award, status, claim frequency, notes, Xero account code). Close a finished project with status=CLOSED. Needs `cost_tracking`.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        funderName: { type: "string" },
        funderContactEmail: { type: "string" },
        reference: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        totalAwardPence: { type: "number" },
        status: { type: "string", enum: ["DRAFT", "ACTIVE", "CLOSED"] },
        claimFrequency: { type: "string", enum: ["MONTHLY", "QUARTERLY"] },
        notes: { type: "string" },
        xeroAccountCode: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await patch(tenant, `/funding/projects/${encodeURIComponent(id)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_project_delete",
    description: "DELETE a funded project with all its headings, allocations and draft claims. Refused (409) once any claim has gone to the funder — close it instead. Needs `cost_tracking`.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await del(tenant, `/funding/projects/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Headings ──
  {
    name: "uiiq_funding_headings",
    description: "A project's spend headings, each rolled up (budget, match-funded share, spent, claimed, remaining, units used of planned). Needs `cost_tracking`.",
    inputSchema: { type: "object", required: ["projectId"], properties: { projectId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ projectId, tenant }) {
      const res = await api(tenant)(`/funding/projects/${encodeURIComponent(projectId)}/headings`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_heading_add",
    description: "Add a spend heading to a project: name + budgetPence required; matchFundedPence (≤ budget) + matchSource for part-match-funded headings; plannedUnits + unitLabel for unit-based reporting; costCategoryId links it to a cost category. Needs `cost_tracking`.",
    inputSchema: {
      type: "object",
      required: ["projectId", "name", "budgetPence"],
      properties: {
        projectId: { type: "string" },
        name: { type: "string" },
        budgetPence: { type: "number" },
        matchFundedPence: { type: "number" },
        matchSource: { type: "string" },
        plannedUnits: { type: "number" },
        unitLabel: { type: "string" },
        costCategoryId: { type: "string" },
        notes: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ projectId, tenant, ...body }) {
      const res = await post(tenant, `/funding/projects/${encodeURIComponent(projectId)}/headings`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_heading_update",
    description: "Edit a heading's name, budget, match funding, units, cost category (empty string unlinks), notes or order. Match funding may not exceed the budget. Needs `cost_tracking`.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        budgetPence: { type: "number" },
        matchFundedPence: { type: "number" },
        matchSource: { type: "string" },
        plannedUnits: { type: "number" },
        unitLabel: { type: "string" },
        costCategoryId: { type: "string" },
        notes: { type: "string" },
        displayOrder: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await patch(tenant, `/funding/headings/${encodeURIComponent(id)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_heading_delete",
    description: "DELETE a spend heading. Refused (409) while any allocation is charged to it. Needs `cost_tracking`.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await del(tenant, `/funding/headings/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Allocations (spend charged to a heading) ──
  {
    name: "uiiq_funding_allocations",
    description: "The allocations ledger with totals. Filters: projectId, headingId, sourceType BILL|PAYROLL|MANUAL, sourceId, claimId, unclaimed=true (not yet on a claim), from/to (YYYY-MM-DD, incurredOn), page, pageSize (max 500). Needs `cost_tracking`.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        headingId: { type: "string" },
        sourceType: { type: "string", enum: ["BILL", "PAYROLL", "MANUAL"] },
        sourceId: { type: "string" },
        claimId: { type: "string" },
        unclaimed: { type: "boolean" },
        from: { type: "string" },
        to: { type: "string" },
        page: { type: "number" },
        pageSize: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, unclaimed, ...filters } = {}) {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== "") p.set(k, String(v));
      if (unclaimed) p.set("unclaimed", "1");
      const qs = p.toString() ? `?${p}` : "";
      const res = await api(tenant)(`/funding/allocations${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_allocation_add",
    description: "Charge spend to a funding heading: headingId, amountPence (non-zero integer) and incurredOn (YYYY-MM-DD) required. sourceType BILL (sourceId = bill id; the bill's gross caps what can be allocated across headings) | PAYROLL (sourceId) | MANUAL (default). Over-budget is allowed but comes back flagged in `budget`. Fails 423 in a locked period. Needs `cost_tracking`.",
    inputSchema: {
      type: "object",
      required: ["headingId", "amountPence", "incurredOn"],
      properties: {
        headingId: { type: "string" },
        amountPence: { type: "number" },
        incurredOn: { type: "string" },
        sourceType: { type: "string", enum: ["BILL", "PAYROLL", "MANUAL"] },
        sourceId: { type: "string" },
        description: { type: "string" },
        units: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/funding/allocations", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_allocation_update",
    description: "Edit an UNCLAIMED allocation (amount, date, heading, description, units). Spend already on a claim is frozen (409) — reopen the claim first. Both the old and new dates must be outside a locked period (423). Needs `cost_tracking`.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        headingId: { type: "string" },
        amountPence: { type: "number" },
        incurredOn: { type: "string" },
        description: { type: "string" },
        units: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await patch(tenant, `/funding/allocations/${encodeURIComponent(id)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_allocation_delete",
    description: "DELETE an unclaimed allocation from its heading. 409 if it is on a claim; 423 in a locked period. Needs `cost_tracking`.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await del(tenant, `/funding/allocations/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Claims ──
  {
    name: "uiiq_funding_claims",
    description: "A project's claims, newest period first, each with its per-heading lines. Needs `cost_tracking`.",
    inputSchema: { type: "object", required: ["projectId"], properties: { projectId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ projectId, tenant }) {
      const res = await api(tenant)(`/funding/projects/${encodeURIComponent(projectId)}/claims`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_claim_prepare",
    description: "Prepare a DRAFT claim for a period from the unclaimed spend in it, grouped by heading, less the match-funded share. Pass periodStart+periodEnd (YYYY-MM-DD) or month (YYYY-MM); with neither the period is derived from the project's claim frequency around today. Nothing is locked to the claim until it is submitted. 409 if a claim for that period exists; 400 when there is no unclaimed spend. Needs `cost_tracking`.",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string" },
        periodStart: { type: "string" },
        periodEnd: { type: "string" },
        month: { type: "string" },
        reference: { type: "string" },
        notes: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ projectId, tenant, ...body }) {
      const res = await post(tenant, `/funding/projects/${encodeURIComponent(projectId)}/claims`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_claim_get",
    description: "The claim statement: header, per-heading lines, the allocations behind them (a DRAFT shows what it WOULD take; a submitted claim shows what is stamped to it) and the tenant's address block. Needs `cost_tracking`.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/funding/claims/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_claim_update",
    description: "Move a claim through its lifecycle or edit its notes/reference. action=submit rebuilds the lines from the unclaimed spend as it stands NOW and stamps those allocations to the claim (that is what stops a pound being claimed twice) — DRAFT only. action=mark-paid (optional paidAt YYYY-MM-DD, default today) — submitted claims only. action=reopen unstamps the allocations and returns a SUBMITTED claim to DRAFT (a PAID claim can't be reopened). No action = plain edit of reference/notes. Needs `cost_tracking`.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        action: { type: "string", enum: ["submit", "mark-paid", "reopen"] },
        paidAt: { type: "string" },
        reference: { type: "string" },
        notes: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await patch(tenant, `/funding/claims/${encodeURIComponent(id)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_claim_delete",
    description: "Throw away a DRAFT claim (its allocations are released). 409 for a submitted or paid claim — reopen it first. Needs `cost_tracking`.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await del(tenant, `/funding/claims/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_funding_claim_xero_invoice",
    description: "'Raise in Xero': submits the claim (stamping its allocations, as action=submit does) and WRITES A SALES INVOICE TO THE TENANT'S XERO BOOKS — one line per heading at the funder's share, to the funder contact (found or created in Xero), AUTHORISED unless draft=true. Optional dueDate YYYY-MM-DD. 409 if already in Xero or already paid; 400 when Xero isn't connected. OWNER/ADMIN only; needs `cost_tracking`.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, draft: { type: "boolean" }, dueDate: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant, ...body }) {
      const res = await post(tenant, `/funding/claims/${encodeURIComponent(id)}/xero-invoice`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
