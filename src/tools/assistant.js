import { apiClient } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

async function fail(res) {
  const text = await res.text();
  try { const j = JSON.parse(text); if (j?.error) return new Error(j.error); } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}

// ASSISTANT — the in-app UIIQ assistant: a tool-using Anthropic loop over the
// workspace's own data. Every query is a session row (tokens + tool calls) and
// spends credits on the ai_assistant_query tariff.
export const assistantTools = [
  {
    name: "uiiq_assistant_starters",
    description: "The workspace's conversation starters (prompt templates from IQEX: id, name, template). Empty when the workspace is not linked to IQEX.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/assistant/starters");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_assistant_ask",
    description: "Ask the UIIQ assistant a question about the workspace; it runs a tool-using loop over the workspace's data and answers. Pass message (and history — earlier [{ role, content }] turns — to continue a conversation). SPENDS CREDITS (tariff ai_assistant_query; 402 when short). Returns { message, inputTokens, outputTokens, toolCalls }.",
    inputSchema: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
        history: { type: "array", items: { type: "object", required: ["role", "content"], properties: { role: { type: "string", enum: ["user", "assistant"] }, content: {} } }, description: "Earlier turns, oldest first" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ message, history = [], tenant }) {
      const messages = [...history, { role: "user", content: message }];
      const res = await api(tenant)("/assistant", { method: "POST", body: JSON.stringify({ messages }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
