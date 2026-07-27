import { apiClient } from "../auth.js";

const TENANT_SUMMARY = [
  "id", "name", "slug", "status", "tier", "industry", "isInternal", "iqexOrgId", "createdAt",
];

export const tenantTools = [
  {
    name: "uiiq_tenant_list",
    description:
      "List UIIQ tenants (summary rows). Filter with search (name or slug). Use uiiq_tenant_get for a tenant's features and users.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search by name or slug" },
        limit: { type: "number", description: "Max tenants to return (default 50)" }
      }
    },
    async handler({ search, limit } = {}) {
      const params = new URLSearchParams({ limit: String(limit ?? 50) });
      if (search) params.set("search", search);
      const res = await apiClient()(`/admin/tenants?${params}`);
      const data = await res.json();
      const rows = Array.isArray(data) ? data : data.tenants ?? [];
      // Project defensively: this list arrived at 1.44 MB for 41 tenants because
      // 96% of each row was feature-flag blobs. Even with the API fixed, the
      // tool only ever hands back what a list is for.
      return rows.map((t) => TENANT_SUMMARY.reduce((o, f) => (t[f] === undefined ? o : { ...o, [f]: t[f] }), {}));
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
    description: "Generate or retrieve the UIIQ Connect API key for a tenant (used for the uiiq-connect WordPress plugin).",
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
  {
    name: "uiiq_tenant_rename",
    description:
      "Change a UIIQ tenant's slug. The slug is mirrored into the linked IQEX org (uiiq_tenant_slug) and drives display resolution, so the server re-syncs IQEX automatically — the response reports iqexSlugSynced. SUPER_ADMIN.",
    inputSchema: {
      type: "object",
      required: ["id", "slug"],
      properties: {
        id: { type: "string", description: "Tenant ID" },
        slug: { type: "string", description: "New slug (must be unique)" },
      },
    },
    async handler({ id, slug }) {
      const res = await apiClient()(`/admin/tenants/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_tenant_delete",
    description:
      "Delete or restore a UIIQ tenant. SUPER_ADMIN. Default is a SOFT delete (archive): status → CANCELLED — reversible, blocks the workspace, keeps all data. Pass restore:true to un-archive (status → ACTIVE). Pass hard:true to PERMANENTLY delete the tenant and every relation (products, bookings, orders, boards, users) — irreversible, and it requires confirmSlug to equal the tenant's current slug.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Tenant ID" },
        hard: { type: "boolean", description: "Permanently delete (irreversible). Requires confirmSlug." },
        confirmSlug: { type: "string", description: "The tenant's current slug — required when hard is true." },
        restore: { type: "boolean", description: "Un-archive a soft-deleted tenant (status → ACTIVE)." },
      },
    },
    async handler({ id, hard, confirmSlug, restore }) {
      const api = apiClient();
      if (restore) {
        const res = await api(`/admin/tenants/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "ACTIVE" }),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      }
      if (hard) {
        if (!confirmSlug) throw new Error("confirmSlug (the tenant's current slug) is required for a hard delete");
        const qs = new URLSearchParams({ hard: "true", confirmSlug });
        const res = await api(`/admin/tenants/${id}?${qs}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      }
      const res = await api(`/admin/tenants/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
