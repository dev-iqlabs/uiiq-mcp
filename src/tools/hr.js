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


export const hrTools = [
  {
    name: "uiiq_hr_staff_list",
    description: "List UIIQ staff members. Optionally filter by department or status.",
    inputSchema: {
      type: "object",
      properties: {
        department: { type: "string" },
        status: { type: "string", description: "active | inactive | onboarding" },
        search: { type: "string", description: "Search by name or email" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ department, status, search, tenant } = {}) {
      const params = new URLSearchParams();
      if (department) params.set("department", department);
      if (status)     params.set("status", status);
      if (search)     params.set("search", search);
      const qs = params.toString() ? "?" + params : "";
      const res = await api(tenant)(`/hr/staff${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.staff ?? [];
    }
  },
  {
    name: "uiiq_hr_staff_get",
    description: "Get full profile for a UIIQ staff member by ID, including roles, training, and leave balance.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, tenant }) {
      const api = api(tenant);
      const [profile, training, leave] = await Promise.all([
        api(`/hr/staff/${id}`).then(r => r.json()),
        api(`/hr/staff/${id}/training`).then(r => r.json()).catch(() => []),
        api(`/hr/staff/${id}/leave-balance`).then(r => r.json()).catch(() => null),
      ]);
      return { ...profile, training, leaveBalance: leave };
    }
  },
  {
    name: "uiiq_hr_timesheet_list",
    description: "List UIIQ timesheet entries. Filter by staff member or date range.",
    inputSchema: {
      type: "object",
      properties: {
        staffId: { type: "string" },
        from: { type: "string", description: "Start date YYYY-MM-DD" },
        to: { type: "string", description: "End date YYYY-MM-DD" },
        approved: { type: "boolean", description: "Filter by approval status" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ staffId, from, to, approved, tenant } = {}) {
      const params = new URLSearchParams();
      if (staffId)          params.set("staffId", staffId);
      if (from)             params.set("from", from);
      if (to)               params.set("to", to);
      if (approved != null) params.set("approved", approved);
      const qs = params.toString() ? "?" + params : "";
      const res = await api(tenant)(`/hr/timesheets${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.timesheets ?? [];
    }
  },
  {
    name: "uiiq_hr_timesheet_approve",
    description: "Approve or reject a UIIQ timesheet entry by ID.",
    inputSchema: {
      type: "object",
      required: ["id", "approved"],
      properties: {
        id: { type: "string" },
        approved: { type: "boolean" },
        note: { type: "string", description: "Optional note for rejection" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, approved, note, tenant }) {
      const res = await api(tenant)(`/hr/timesheets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ approved, note }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { id, approved };
    }
  },
  {
    name: "uiiq_hr_clockin_list",
    description: "List UIIQ QR clock-in records. Filter by staff member or date.",
    inputSchema: {
      type: "object",
      properties: {
        staffId: { type: "string" },
        date: { type: "string", description: "Filter by date YYYY-MM-DD" },
        limit: { type: "number", description: "Max results (default 50)" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ staffId, date, limit = 50, tenant } = {}) {
      const params = new URLSearchParams({ limit });
      if (staffId) params.set("staffId", staffId);
      if (date)    params.set("date", date);
      const res = await api(tenant)(`/hr/clockins?${params}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.clockins ?? [];
    }
  },
  {
    name: "uiiq_hr_leave_list",
    description: "List UIIQ leave requests. Filter by staff member or status.",
    inputSchema: {
      type: "object",
      properties: {
        staffId: { type: "string" },
        status: { type: "string", description: "pending | approved | rejected" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ staffId, status, tenant } = {}) {
      const params = new URLSearchParams();
      if (staffId) params.set("staffId", staffId);
      if (status)  params.set("status", status);
      const qs = params.toString() ? "?" + params : "";
      const res = await api(tenant)(`/hr/leave${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.requests ?? [];
    }
  },
  {
    name: "uiiq_hr_leave_approve",
    description: "Approve or reject a UIIQ leave request.",
    inputSchema: {
      type: "object",
      required: ["id", "approved"],
      properties: {
        id: { type: "string" },
        approved: { type: "boolean" },
        note: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, approved, note, tenant }) {
      const res = await api(tenant)(`/hr/leave/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ approved, note }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { id, approved };
    }
  },

  // ── Payroll ─────────────────────────────────────────────────────────────
  {
    name: "uiiq_hr_payroll_run",
    description: "Fetch the monthly UIIQ Run pay-run for a given month (defaults to current). Returns gross pay, employer NI estimate, total cost and hours worked per staff. Cost-projection only — not a real payroll engine.",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM (defaults to current month)" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ month, tenant } = {}) {
      const qs = month ? `?month=${encodeURIComponent(month)}` : "";
      const res = await api(tenant)(`/hr/payroll${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_hr_payroll_export_url",
    description: "Returns the URL to download a UIIQ Run pay-run as CSV for the given month. Hand this URL to the user for browser download.",
    inputSchema: {
      type: "object",
      required: ["month"],
      properties: {
        month: { type: "string", description: "YYYY-MM" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ month, tenant }) {
      return { url: `https://app.uiiq.co.uk/api/hr/payroll?month=${encodeURIComponent(month)}&format=csv` };
    }
  }
];
