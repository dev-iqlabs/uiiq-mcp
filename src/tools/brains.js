import { apiClient } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

export const brainsTools = [
  {
    name: "uiiq_brains_list",
    description: "List the Office Brains available to this tenant.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/brains");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_ask",
    description: "Ask an Office Brain a question. Returns the answer + citations.",
    inputSchema: {
      type: "object",
      required: ["brainCategoryId", "prompt"],
      properties: {
        brainCategoryId: { type: "string", description: "Brain to query (from uiiq_brains_list)" },
        prompt: { type: "string" },
      },
    },
    async handler({ brainCategoryId, prompt }) {
      const res = await apiClient()("/brains/query", {
        method: "POST",
        body: JSON.stringify({ brainCategoryId, prompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Per-Brain modules: pulse, community Q&A, products, tools, training,
  // reviews research, sector report, analytics. brainCategoryId is the
  // numeric id from uiiq_brains_list. "Manager" = OWNER, ADMIN or SUPER_ADMIN.
  {
    name: "uiiq_brains_pulse",
    description: "The latest Pulse digest for a Brain (items + generatedAt) from IQEX. Empty when the workspace is not linked to IQEX.",
    inputSchema: { type: "object", required: ["brainCategoryId"], properties: { brainCategoryId: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ brainCategoryId, tenant }) {
      const qs = `?brainCategoryId=${encodeURIComponent(brainCategoryId)}`;
      const res = await api(tenant)(`/brains/pulse${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_community_list",
    description: "The workspace's community questions for a Brain (latest 50) with their answers and the Brain's grounded auto-answer.",
    inputSchema: { type: "object", required: ["brainCategoryId"], properties: { brainCategoryId: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ brainCategoryId, tenant }) {
      const qs = `?brainCategoryId=${encodeURIComponent(brainCategoryId)}`;
      const res = await api(tenant)(`/brains/community${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_community_ask",
    description: "Post a community question to a Brain. The Brain answers immediately (grounded, via IQEX) when the workspace is linked; the question is posted either way and is visible to the whole workspace.",
    inputSchema: { type: "object", required: ["brainCategoryId", "body"], properties: { brainCategoryId: { type: "number" }, body: { type: "string", description: "The question" }, tenant: TENANT_PROP } },
    async handler({ brainCategoryId, body, tenant }) {
      const res = await api(tenant)("/brains/community", { method: "POST", body: JSON.stringify({ brainCategoryId, body }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_products",
    description: "Curated sector products for a Brain (catalogue products tagged with the Brain's sector; up to 60). A message explains when the Brain has no sector mapping.",
    inputSchema: { type: "object", required: ["brainCategoryId"], properties: { brainCategoryId: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ brainCategoryId, tenant }) {
      const qs = `?brainCategoryId=${encodeURIComponent(brainCategoryId)}`;
      const res = await api(tenant)(`/brains/products${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_tools_list",
    description: "Curated tools (links) for a Brain, in order, plus canManage for the caller.",
    inputSchema: { type: "object", required: ["brainCategoryId"], properties: { brainCategoryId: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ brainCategoryId, tenant }) {
      const qs = `?brainCategoryId=${encodeURIComponent(brainCategoryId)}`;
      const res = await api(tenant)(`/brains/tools${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_tool_add",
    description: "Add a curated tool (label + url, optional description, toolType default 'link', order) to a Brain. Managers only (OWNER/ADMIN/SUPER_ADMIN).",
    inputSchema: {
      type: "object",
      required: ["brainCategoryId", "label", "url"],
      properties: { brainCategoryId: { type: "number" }, label: { type: "string" }, url: { type: "string" }, description: { type: "string" }, toolType: { type: "string" }, order: { type: "number" }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/brains/tools", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_tool_remove",
    description: "Remove a curated tool from a Brain by its id. Managers only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Tool id (from uiiq_brains_tools_list)" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const qs = `?id=${encodeURIComponent(id)}`;
      const res = await api(tenant)(`/brains/tools${qs}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_training",
    description: "A Brain's training courses with their modules (video + optional knowledge-check form), this user's progress per module, and canManage.",
    inputSchema: { type: "object", required: ["brainCategoryId"], properties: { brainCategoryId: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ brainCategoryId, tenant }) {
      const qs = `?brainCategoryId=${encodeURIComponent(brainCategoryId)}`;
      const res = await api(tenant)(`/brains/training${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_training_progress",
    description: "Record this user's progress on a training module (status default 'completed').",
    inputSchema: { type: "object", required: ["moduleId"], properties: { moduleId: { type: "string" }, status: { type: "string", description: "e.g. completed, started" }, tenant: TENANT_PROP } },
    async handler({ moduleId, status, tenant }) {
      const res = await api(tenant)("/brains/training", { method: "POST", body: JSON.stringify({ action: "progress", moduleId, status }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_course_create",
    description: "Create a training course on a Brain (title, description, order). Managers only.",
    inputSchema: { type: "object", required: ["brainCategoryId", "title"], properties: { brainCategoryId: { type: "number" }, title: { type: "string" }, description: { type: "string" }, order: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/brains/training", { method: "POST", body: JSON.stringify({ action: "course", ...body }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_module_create",
    description: "Add a module to a training course: title + videoRef (videoType default 'youtube'), optional order and knowledgeCheckFormId (an IQForm id). Managers only.",
    inputSchema: {
      type: "object",
      required: ["courseId", "title", "videoRef"],
      properties: { courseId: { type: "string" }, title: { type: "string" }, videoRef: { type: "string" }, videoType: { type: "string" }, order: { type: "number" }, knowledgeCheckFormId: { type: "number" }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/brains/training", { method: "POST", body: JSON.stringify({ action: "module", ...body }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_reviews",
    description: "Research a subject across the Brain's configured review sources (IQEX). Needs the workspace linked to IQEX.",
    inputSchema: { type: "object", required: ["brainCategoryId", "subject"], properties: { brainCategoryId: { type: "number" }, subject: { type: "string", description: "What to look up reviews of" }, tenant: TENANT_PROP } },
    async handler({ brainCategoryId, subject, tenant }) {
      const res = await api(tenant)("/brains/reviews", { method: "POST", body: JSON.stringify({ brainCategoryId, subject }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_sector_report",
    description: "Generate a full sector intelligence report over a Brain the workspace is entitled to (no prompt: IQEX reports across the whole Brain). SPENDS CREDITS (tariff brains_sector_report; 402 when the org cannot afford it). Synchronous and slow.",
    inputSchema: { type: "object", required: ["brainCategoryId"], properties: { brainCategoryId: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ brainCategoryId, tenant }) {
      const res = await api(tenant)("/brains/sector-report", { method: "POST", body: JSON.stringify({ brainCategoryId }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_analytics",
    description: "Per-Brain usage for this workspace: query count, community questions, training completions and the 8 most recent questions. Managers only.",
    inputSchema: { type: "object", required: ["brainCategoryId"], properties: { brainCategoryId: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ brainCategoryId, tenant }) {
      const qs = `?brainCategoryId=${encodeURIComponent(brainCategoryId)}`;
      const res = await api(tenant)(`/brains/analytics${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
