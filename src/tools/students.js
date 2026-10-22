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

// STUDENTS. Children's records aren't available from the MCP (Steve, 22 Oct
// 2026, from Kim's DPIA, DPA 6.6: no AI session reads children's records): the
// student records, registrations, health, SEND and allergies, emergency
// contacts, photos, photo and health consent, progress notes, check-in cards
// and absences are used in the UiiQ dashboard in a browser. The platform
// refuses those routes for CLI, MCP and API-key sessions too. What stays is
// the group picker: labels and counts, no child named (test/no-child-records).

export const studentsTools = [
  {
    name: "uiiq_students_groups",
    description: "The distinct group labels in use across active students, with a student count each (the group picker for notices, campaigns and SMS). Labels and counts only: children's records aren't available from the MCP (Steve, 22 Oct 2026: no AI session reads children's records); use the UiiQ dashboard in a browser.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/students/groups");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
