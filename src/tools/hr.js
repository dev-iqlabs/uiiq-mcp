import { apiClient } from "../auth.js";

export const hrTools = [
  {
    name: "uiiq_hr_staff_list",
    description: "List UVOS staff members. Optionally filter by department or status.",
    inputSchema: {
      type: "object",
      properties: {
        department: { type: "string" },
        status: { type: "string", description: "active | inactive | onboarding" },
        search: { type: "string", description: "Search by name or email" }
      }
    },
    async handler({ department, status, search } = {}) {
      const params = new URLSearchParams();
      if (department) params.set("department", department);
      if (status)     params.set("status", status);
      if (search)     params.set("search", search);
      const qs = params.toString() ? "?" + params : "";
      const res = await apiClient("uvos")(`/hr/staff${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.staff ?? [];
    }
  },
  {
    name: "uiiq_hr_staff_get",
    description: "Get full profile for a UVOS staff member by ID, including roles, training, and leave balance.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } }
    },
    async handler({ id }) {
      const api = apiClient("uvos");
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
    description: "List UVOS timesheet entries. Filter by staff member or date range.",
    inputSchema: {
      type: "object",
      properties: {
        staffId: { type: "string" },
        from: { type: "string", description: "Start date YYYY-MM-DD" },
        to: { type: "string", description: "End date YYYY-MM-DD" },
        approved: { type: "boolean", description: "Filter by approval status" }
      }
    },
    async handler({ staffId, from, to, approved } = {}) {
      const params = new URLSearchParams();
      if (staffId)          params.set("staffId", staffId);
      if (from)             params.set("from", from);
      if (to)               params.set("to", to);
      if (approved != null) params.set("approved", approved);
      const qs = params.toString() ? "?" + params : "";
      const res = await apiClient("uvos")(`/hr/timesheets${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.timesheets ?? [];
    }
  },
  {
    name: "uiiq_hr_timesheet_approve",
    description: "Approve or reject a UVOS timesheet entry by ID.",
    inputSchema: {
      type: "object",
      required: ["id", "approved"],
      properties: {
        id: { type: "string" },
        approved: { type: "boolean" },
        note: { type: "string", description: "Optional note for rejection" }
      }
    },
    async handler({ id, approved, note }) {
      const res = await apiClient("uvos")(`/hr/timesheets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ approved, note }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { id, approved };
    }
  },
  {
    name: "uiiq_hr_clockin_list",
    description: "List UVOS QR clock-in records. Filter by staff member or date.",
    inputSchema: {
      type: "object",
      properties: {
        staffId: { type: "string" },
        date: { type: "string", description: "Filter by date YYYY-MM-DD" },
        limit: { type: "number", description: "Max results (default 50)" }
      }
    },
    async handler({ staffId, date, limit = 50 } = {}) {
      const params = new URLSearchParams({ limit });
      if (staffId) params.set("staffId", staffId);
      if (date)    params.set("date", date);
      const res = await apiClient("uvos")(`/hr/clockins?${params}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.clockins ?? [];
    }
  },
  {
    name: "uiiq_hr_leave_list",
    description: "List UVOS leave requests. Filter by staff member or status.",
    inputSchema: {
      type: "object",
      properties: {
        staffId: { type: "string" },
        status: { type: "string", description: "pending | approved | rejected" }
      }
    },
    async handler({ staffId, status } = {}) {
      const params = new URLSearchParams();
      if (staffId) params.set("staffId", staffId);
      if (status)  params.set("status", status);
      const qs = params.toString() ? "?" + params : "";
      const res = await apiClient("uvos")(`/hr/leave${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.requests ?? [];
    }
  },
  {
    name: "uiiq_hr_leave_approve",
    description: "Approve or reject a UVOS leave request.",
    inputSchema: {
      type: "object",
      required: ["id", "approved"],
      properties: {
        id: { type: "string" },
        approved: { type: "boolean" },
        note: { type: "string" }
      }
    },
    async handler({ id, approved, note }) {
      const res = await apiClient("uvos")(`/hr/leave/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ approved, note }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { id, approved };
    }
  },
];
