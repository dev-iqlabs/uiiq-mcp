import { apiClient } from "../auth.js";

export const tenantTools = [
  {
    name: "uiiq_tenant_list",
    description: "List all UIIQ tenants. Optionally filter by search term.",
    inputSchema: {
      type: "object",
      properties: { search: { type: "string", description: "Search by name or slug" } }
    },
    async handler({ search } = {}) {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await apiClient()(`/admin/tenants${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.tenants ?? [];
    }
  },
  {
    name: "uiiq_tenant_get",
    description: "Get full detail for a UIIQ tenant by ID.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Tenant ID" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/admin/tenants/${id}`);
      if (!res.ok) throw new Error(`Tenant not found: ${id}`);
      return res.json();
    }
  },
  {
    name: "uiiq_tenant_create",
    description: "Create a new UIIQ tenant.",
    inputSchema: {
      type: "object",
      required: ["name", "slug"],
      properties: {
        name: { type: "string" },
        slug: { type: "string" },
        plan: { type: "string", description: "Plan tier e.g. starter, pro" }
      }
    },
    async handler({ name, slug, plan }) {
      const res = await apiClient()("/admin/tenants", {
        method: "POST",
        body: JSON.stringify({ name, slug, plan }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_tenant_api_key",
    description: "Generate or retrieve the UBMS API key for a tenant (used for the ubms-connect WordPress plugin).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Tenant ID" } }
    },
    async handler({ id }) {
      const impRes = await apiClient()("/admin/impersonate", {
        method: "POST",
        body: JSON.stringify({ tenantId: id }),
      });
      if (!impRes.ok) throw new Error(await impRes.text());
      const res = await apiClient()("/api/seo/api-key", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_tenant_features",
    description: "Get or set feature flags for a UIIQ tenant. Pass enable or disable to toggle a specific flag.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        enable: { type: "string", description: "Feature flag name to enable" },
        disable: { type: "string", description: "Feature flag name to disable" }
      }
    },
    async handler({ id, enable, disable }) {
      const api = apiClient();
      if (enable || disable) {
        const body = enable ? { [enable]: true } : { [disable]: false };
        const res = await api(`/admin/tenants/${id}/features`, { method: "PATCH", body: JSON.stringify(body) });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      }
      const res = await api(`/admin/tenants/${id}/features`);
      if (!res.ok) throw new Error(`Tenant not found: ${id}`);
      return res.json();
    }
  },
  {
    name: "uiiq_tenant_usage",
    description: "Get usage stats for a UIIQ tenant (sends, contacts, API calls).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/admin/tenants/${id}/usage`);
      if (!res.ok) throw new Error(`Tenant not found: ${id}`);
      return res.json();
    }
  },
];
