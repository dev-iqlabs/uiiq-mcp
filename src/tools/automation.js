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
      const res = await api(tenant)(`/automations/${encodeURIComponent(id)}`, {
        method: "PUT",
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
  {
    name: "uiiq_automation_get",
    description: "Get one UIIQ automation: name, status, trigger, steps, stats and its last 50 runs (status, current step, contact).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/automations/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_automation_update",
    description: "Edit an automation. Only the fields sent change: name, description, trigger { type, value? }, steps (an array of { type, ... } — replaces the whole list), status (active | inactive | draft).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        trigger: { type: "object", required: ["type"], properties: { type: { type: "string" }, value: { type: "string" } } },
        steps: { type: "array", items: { type: "object", required: ["type"], properties: { type: { type: "string" } }, additionalProperties: true } },
        status: { type: "string", enum: ["active", "inactive", "draft"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (!Object.keys(body).length) throw new Error("Send at least one field to change");
      const res = await api(tenant)(`/automations/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_automation_delete",
    description: "Delete an automation and its run history. Not reversible.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/automations/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_workflow_packs",
    description: "List the operational task template packs available (built-in industry packs plus global packs from the database): id, name, industry, taskCount, isBuiltIn.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/tasks/workflows/packs");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.packs ?? data;
    },
  },
];
