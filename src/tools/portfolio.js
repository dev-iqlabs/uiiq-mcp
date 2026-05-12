import { apiClient } from "../auth.js";

export const portfolioTools = [
  {
    name: "uiiq_portfolio_list",
    description: "List UVOS portfolio projects. Optionally filter by status.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "live | soft-launch | in-dev | planned | concept" }
      }
    },
    async handler({ status } = {}) {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await apiClient()(`/portfolio/projects${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.projects ?? [];
    }
  },
  {
    name: "uiiq_portfolio_get",
    description: "Get a portfolio project by ID, including its blockers and milestones.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } }
    },
    async handler({ id }) {
      const api = apiClient();
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
        progress: { type: "number", description: "0–100" }
      }
    },
    async handler({ id, status, progress }) {
      const body = {};
      if (status) body.status = status;
      if (progress != null) body.progress = progress;
      const res = await apiClient()(`/portfolio/projects/${id}`, {
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
      properties: { id: { type: "string" }, title: { type: "string" } }
    },
    async handler({ id, title }) {
      const res = await apiClient()(`/portfolio/projects/${id}/blockers`, {
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
        blockerId: { type: "string" }
      }
    },
    async handler({ projectId, blockerId }) {
      const res = await apiClient()(`/portfolio/projects/${projectId}/blockers/${blockerId}`, {
        method: "PATCH",
        body: JSON.stringify({ resolved: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { success: true, blockerId };
    }
  },
];
