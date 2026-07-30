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


export const automationTools = [
  {
    name: "uiiq_automation_list",
    description: "List UIIQ automations. Filter by status (active | inactive).",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", description: "active | inactive" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ status, tenant } = {}) {
      const qs = status ? "?status=" + encodeURIComponent(status) : "";
      const res = await api(tenant)("/automations" + qs);
      const data = await res.json();
      return Array.isArray(data) ? data : data.automations ?? [];
    }
  },
  {
    name: "uiiq_automation_toggle",
    description: "Enable or disable a UIIQ automation by ID.",
    inputSchema: {
      type: "object",
      required: ["id", "enabled"],
      properties: { id: { type: "string" }, enabled: { type: "boolean" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, enabled, tenant }) {
      const res = await api(tenant)("/automations/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status: enabled ? "active" : "inactive" }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { id, enabled };
    }
  },
  {
    name: "uiiq_campaign_list",
    description: "List UIIQ email/SMS campaigns.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/campaigns");
      const data = await res.json();
      return Array.isArray(data) ? data : data.campaigns ?? [];
    }
  },
  {
    name: "uiiq_workflow_list",
    description: "List UIIQ workflow templates.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/tasks/workflows");
      const data = await res.json();
      return Array.isArray(data) ? data : data.workflows ?? [];
    }
  },
  {
    name: "uiiq_workflow_instances",
    description: "List active UIIQ workflow instances. Filter by status.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "in-progress | complete | on-hold" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ status, tenant } = {}) {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await api(tenant)(`/tasks/workflows/instances${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.instances ?? [];
    }
  },
  {
    name: "uiiq_workflow_trigger",
    description: "Trigger a new UIIQ workflow instance from a template.",
    inputSchema: {
      type: "object",
      required: ["workflowId"],
      properties: {
        workflowId: { type: "string", description: "Workflow template ID" },
        reference: { type: "string", description: "Label or reference for the instance (e.g. order ref)" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ workflowId, reference, tenant }) {
      const res = await api(tenant)("/tasks/workflows/trigger", {
        method: "POST",
        body: JSON.stringify({ workflowId, reference }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
];
