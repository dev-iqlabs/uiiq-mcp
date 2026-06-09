import { apiClient } from "../auth.js";

export const boardroomTools = [
  {
    name: "uiiq_boardroom_ask",
    description: "Ask a boardroom AI agent a single question (single-shot). agentSlug from uiiq_agent_list.",
    inputSchema: {
      type: "object",
      required: ["agentSlug", "message"],
      properties: { agentSlug: { type: "string" }, message: { type: "string" } },
    },
    async handler({ agentSlug, message }) {
      const res = await apiClient()("/boardroom/run", {
        method: "POST",
        body: JSON.stringify({ agentId: agentSlug, messages: [{ role: "user", content: message }] }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_boardroom_sessions",
    description: "List your recent boardroom meeting sessions.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/boardroom/meeting/sessions");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_boardroom_start",
    description: "Start a new boardroom meeting session.",
    inputSchema: { type: "object", properties: { title: { type: "string" } } },
    async handler({ title } = {}) {
      const res = await apiClient()("/boardroom/meeting/sessions", {
        method: "POST",
        body: JSON.stringify({ title: title ?? null }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
