import { apiClient } from "../auth.js";

const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
// Operator control plane (SUPER_ADMIN, no tenant): the error body is { error }.
async function write(path, method, body) {
  const res = await apiClient()(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
  if (res.ok) return res.json();
  const text = await res.text();
  let msg = text || `HTTP ${res.status}`;
  try { msg = JSON.parse(text)?.error ?? msg; } catch { /* not JSON */ }
  throw new Error(msg);
}

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

  // ── Writes (SUPER_ADMIN). The read tools above are open to any staff role. ──
  {
    name: "uiiq_agent_sync",
    description: "Re-import every agent's skills and references (and model from index.md) from the AGENT-VAULT markdown on the server (AGENT_VAULT_ROOT). Upserts by name; returns counts and warnings. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() { return write("/admin/agents/sync", "POST", {}); }
  },
  {
    name: "uiiq_agent_update",
    description: "Edit an agent's description, enabled flag or model (model null clears it). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug"], properties: { slug: { type: "string" }, description: { type: "string" }, enabled: { type: "boolean" }, model: { type: ["string", "null"] } } },
    async handler({ slug, ...body }) { return write(`/admin/agents/${encodeURIComponent(slug)}`, "PATCH", defined(body)); }
  },
  {
    name: "uiiq_agent_skill_create",
    description: "Add a skill (markdown content) to an agent; the name must be new for that agent. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug", "name", "content"], properties: { slug: { type: "string" }, name: { type: "string" }, description: { type: "string" }, content: { type: "string" } } },
    async handler({ slug, ...body }) { return write(`/admin/agents/${encodeURIComponent(slug)}/skills`, "POST", body); }
  },
  {
    name: "uiiq_agent_skill_update",
    description: "Edit a skill's name, description, content or enabled flag by its id. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug", "id"], properties: { slug: { type: "string" }, id: { type: "string", description: "Skill id (from uiiq_agent_get)" }, name: { type: "string" }, description: { type: ["string", "null"] }, content: { type: "string" }, enabled: { type: "boolean" } } },
    async handler({ slug, id, ...body }) { return write(`/admin/agents/${encodeURIComponent(slug)}/skills/${encodeURIComponent(id)}`, "PATCH", defined(body)); }
  },
  {
    name: "uiiq_agent_skill_delete",
    description: "Delete a skill from an agent. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug", "id"], properties: { slug: { type: "string" }, id: { type: "string" } } },
    async handler({ slug, id }) { return write(`/admin/agents/${encodeURIComponent(slug)}/skills/${encodeURIComponent(id)}`, "DELETE"); }
  },
  {
    name: "uiiq_agent_skill_evolve",
    description: "Propose an improved version of a skill: generates 8 eval scenarios, scores the current text, writes 3 rewrites (clarity / examples / failure-modes) and returns the best with before/after scores. Nothing is saved — apply it with uiiq_agent_skill_update. Spends the platform's Anthropic API budget (~15 model calls) and takes a minute. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug", "id"], properties: { slug: { type: "string" }, id: { type: "string" } } },
    async handler({ slug, id }) { return write(`/admin/agents/${encodeURIComponent(slug)}/skills/${encodeURIComponent(id)}/evolve`, "POST", {}); }
  },
  {
    name: "uiiq_agent_reference_create",
    description: "Add a reference document (markdown) to an agent; the name must be new for that agent. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug", "name", "content"], properties: { slug: { type: "string" }, name: { type: "string" }, content: { type: "string" } } },
    async handler({ slug, ...body }) { return write(`/admin/agents/${encodeURIComponent(slug)}/references`, "POST", body); }
  },
  {
    name: "uiiq_agent_reference_update",
    description: "Edit a reference's name or content by its id. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug", "id"], properties: { slug: { type: "string" }, id: { type: "string", description: "Reference id (from uiiq_agent_get)" }, name: { type: "string" }, content: { type: "string" } } },
    async handler({ slug, id, ...body }) { return write(`/admin/agents/${encodeURIComponent(slug)}/references/${encodeURIComponent(id)}`, "PATCH", defined(body)); }
  },
  {
    name: "uiiq_agent_reference_delete",
    description: "Delete a reference document from an agent. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug", "id"], properties: { slug: { type: "string" }, id: { type: "string" } } },
    async handler({ slug, id }) { return write(`/admin/agents/${encodeURIComponent(slug)}/references/${encodeURIComponent(id)}`, "DELETE"); }
  },
];
