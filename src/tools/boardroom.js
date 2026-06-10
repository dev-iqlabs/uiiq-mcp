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
  {
    name: "uiiq_boardroom_message",
    description: "Send a message into a meeting session. The reply streams server-side (SSE); this buffers it and returns the agents' full responses.",
    inputSchema: {
      type: "object",
      required: ["sessionId", "content"],
      properties: { sessionId: { type: "string" }, content: { type: "string" } },
    },
    async handler({ sessionId, content }) {
      const res = await apiClient()(`/boardroom/meeting/${sessionId}/message`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(await res.text());

      // Parse the SSE stream (data: {json}\n\n) and accumulate per-agent text.
      const text = await res.text();
      const responses = {};
      let respondents = [];
      for (const block of text.split("\n\n")) {
        const line = block.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line.slice(6)); } catch { continue; }
        if (msg.type === "routing") respondents = msg.respondents ?? [];
        else if (msg.type === "agent_chunk") responses[msg.agentSlug] = (responses[msg.agentSlug] ?? "") + (msg.delta ?? "");
        else if (msg.type === "agent_end") responses[msg.agentSlug] = msg.full ?? responses[msg.agentSlug] ?? "";
      }
      return {
        respondents,
        responses: Object.entries(responses).map(([agentSlug, content]) => ({ agentSlug, content })),
      };
    },
  },
];
