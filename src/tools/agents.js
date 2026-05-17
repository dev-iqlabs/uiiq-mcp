import { apiClient } from "../auth.js";

export const agentTools = [
  {
    name: "uiiq_agent_list",
    description: "List all Mastermind Team agents with their type, role, enabled status, and skill/reference counts.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["OPERATIONAL", "ADVISORY", "UTILITY"], description: "Filter by agent type" },
        enabled: { type: "boolean", description: "Filter by enabled status" },
      }
    },
    async handler({ type, enabled } = {}) {
      const res = await apiClient()("/api/admin/agents");
      if (!res.ok) throw new Error(await res.text());
      let agents = await res.json();
      if (type) agents = agents.filter(a => a.type === type);
      if (enabled !== undefined) agents = agents.filter(a => a.enabled === enabled);
      return agents;
    }
  },

  {
    name: "uiiq_agent_get",
    description: "Get full config for one agent by slug — includes all skills and references with their content.",
    inputSchema: {
      type: "object",
      required: ["slug"],
      properties: {
        slug: { type: "string", description: "Agent slug e.g. lisa, mark, troy" }
      }
    },
    async handler({ slug }) {
      const res = await apiClient()(`/api/admin/agents/${slug}`);
      if (!res.ok) throw new Error(`Agent not found: ${slug}`);
      return res.json();
    }
  },

  {
    name: "uiiq_agent_skill_get",
    description: "Get a specific skill's content for an agent. Returns the skill name, description, and full markdown content.",
    inputSchema: {
      type: "object",
      required: ["slug", "skill"],
      properties: {
        slug: { type: "string", description: "Agent slug e.g. lisa, mark" },
        skill: { type: "string", description: "Skill name (case-insensitive partial match)" }
      }
    },
    async handler({ slug, skill }) {
      const res = await apiClient()(`/api/admin/agents/${slug}`);
      if (!res.ok) throw new Error(`Agent not found: ${slug}`);
      const agent = await res.json();

      const term = skill.toLowerCase();
      const found = agent.skills?.find(s => s.name.toLowerCase().includes(term));
      if (!found) {
        const names = agent.skills?.map(s => s.name).join(", ") || "none";
        throw new Error(`Skill "${skill}" not found for agent ${slug}. Available: ${names}`);
      }
      return { agent: slug, skill: found.name, description: found.description, content: found.content };
    }
  },

  {
    name: "uiiq_agent_reference_get",
    description: "Get a specific reference document for an agent. Returns the reference name and full markdown content.",
    inputSchema: {
      type: "object",
      required: ["slug", "reference"],
      properties: {
        slug: { type: "string", description: "Agent slug e.g. lisa, mark" },
        reference: { type: "string", description: "Reference name (case-insensitive partial match)" }
      }
    },
    async handler({ slug, reference }) {
      const res = await apiClient()(`/api/admin/agents/${slug}`);
      if (!res.ok) throw new Error(`Agent not found: ${slug}`);
      const agent = await res.json();

      const term = reference.toLowerCase();
      const found = agent.references?.find(r => r.name.toLowerCase().includes(term));
      if (!found) {
        const names = agent.references?.map(r => r.name).join(", ") || "none";
        throw new Error(`Reference "${reference}" not found for agent ${slug}. Available: ${names}`);
      }
      return { agent: slug, reference: found.name, content: found.content };
    }
  },
];
