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


// Summary fields only. The API now returns these anyway, but projecting here
// too means a future API change can't silently blow the context again — this
// list used to arrive with blockers, milestones and boards inlined per row.
const PROJECT_SUMMARY = [
  "id", "name", "slug", "status", "progress", "domain", "tenantId",
  "colour", "sortOrder", "autoProgress",
  "blockerCount", "milestoneCount", "taskBoardCount",
];

const project = (row, fields) =>
  Object.fromEntries(fields.filter((f) => row[f] !== undefined).map((f) => [f, row[f]]));

export const portfolioTools = [
  {
    name: "uiiq_portfolio_list",
    description:
      "List UIIQ portfolio projects (summary rows). Optionally filter by status. Use uiiq_portfolio_get for a project's blockers and milestones.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "live | soft-launch | in-dev | planned | concept" },
        limit: { type: "number", description: "Max projects to return (default 50)" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ status, limit, tenant } = {}) {
      const params = new URLSearchParams({ limit: String(limit ?? 50) });
      if (status) params.set("status", status);
      const res = await api(tenant)(`/portfolio/projects?${params}`);
      const data = await res.json();
      const rows = Array.isArray(data) ? data : data.projects ?? [];
      return rows.map((p) => project(p, PROJECT_SUMMARY));
    }
  },
  {
    name: "uiiq_portfolio_get",
    description: "Get a portfolio project by ID, including its blockers and milestones.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, tenant }) {
      const api = api(tenant);
      const [proj, blockers, milestones] = await Promise.all([
        api(`/portfolio/projects/${id}`).then(r => r.json()),
        api(`/portfolio/projects/${id}/blockers`).then(r => r.json()).catch(() => []),
        api(`/portfolio/projects/${id}/milestones`).then(r => r.json()).catch(() => []),
      ]);
      return {
        ...proj,
        blockers: Array.isArray(blockers) ? blockers : blockers.blockers ?? [],
        milestones: Array.isArray(milestones) ? milestones : milestones.milestones ?? [],
      };
    }
  },
  {
    name: "uiiq_portfolio_update",
    description: "Update a portfolio project status or progress percentage.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        status: { type: "string", description: "live | soft-launch | in-dev | planned | concept" },
        progress: { type: "number", description: "0–100" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, status, progress, tenant }) {
      const body = {};
      if (status) body.status = status;
      if (progress != null) body.progress = progress;
      const res = await api(tenant)(`/portfolio/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_portfolio_blocker_add",
    description: "Add a blocker to a portfolio project.",
    inputSchema: {
      type: "object",
      required: ["id", "title"],
      properties: { id: { type: "string" }, title: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, title, tenant }) {
      const res = await api(tenant)(`/portfolio/projects/${id}/blockers`, {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_portfolio_blocker_resolve",
    description: "Mark a portfolio project blocker as resolved.",
    inputSchema: {
      type: "object",
      required: ["projectId", "blockerId"],
      properties: {
        projectId: { type: "string" },
        blockerId: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ projectId, blockerId, tenant }) {
      const res = await api(tenant)(`/portfolio/projects/${projectId}/blockers/${blockerId}`, {
        method: "PATCH",
        body: JSON.stringify({ resolved: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { success: true, blockerId };
    }
  },
];
