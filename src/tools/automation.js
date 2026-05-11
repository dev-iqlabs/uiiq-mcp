import { apiClient } from "../auth.js";

export const automationTools = [
  {
    name: "uiiq_automation_list",
    description: "List UBMS automations. Filter by status (active | inactive).",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", description: "active | inactive" } }
    },
    async handler({ status } = {}) {
      const qs = status ? "?status=" + encodeURIComponent(status) : "";
      const res = await apiClient("ubms")("/automations" + qs);
      const data = await res.json();
      return Array.isArray(data) ? data : data.automations ?? [];
    }
  },
  {
    name: "uiiq_automation_toggle",
    description: "Enable or disable a UBMS automation by ID.",
    inputSchema: {
      type: "object",
      required: ["id", "enabled"],
      properties: { id: { type: "string" }, enabled: { type: "boolean" } }
    },
    async handler({ id, enabled }) {
      const res = await apiClient("ubms")("/automations/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status: enabled ? "active" : "inactive" }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { id, enabled };
    }
  },
  {
    name: "uiiq_campaign_list",
    description: "List UBMS email/SMS campaigns.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient("ubms")("/campaigns");
      const data = await res.json();
      return Array.isArray(data) ? data : data.campaigns ?? [];
    }
  },
  {
    name: "uiiq_workflow_list",
    description: "List UVOS workflow templates.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient("uvos")("/tasks/workflows");
      const data = await res.json();
      return Array.isArray(data) ? data : data.workflows ?? [];
    }
  },
  {
    name: "uiiq_workflow_instances",
    description: "List active UVOS workflow instances. Filter by status.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "in-progress | complete | on-hold" }
      }
    },
    async handler({ status } = {}) {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await apiClient("uvos")(`/tasks/workflows/instances${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.instances ?? [];
    }
  },
  {
    name: "uiiq_workflow_trigger",
    description: "Trigger a new UVOS workflow instance from a template.",
    inputSchema: {
      type: "object",
      required: ["workflowId"],
      properties: {
        workflowId: { type: "string", description: "Workflow template ID" },
        reference: { type: "string", description: "Label or reference for the instance (e.g. order ref)" }
      }
    },
    async handler({ workflowId, reference }) {
      const res = await apiClient("uvos")("/tasks/workflows/trigger", {
        method: "POST",
        body: JSON.stringify({ workflowId, reference }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
];
