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
const post = (tenant, path, body) => api(tenant)(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

// TEAM — the Mastermind team on IQEX: provisioning the workspace's IQEX org,
// creating the owner's avatar character, and chatting with a team agent
// (UIIQ signs the request with UIIQ_MASTERMIND_SECRET and proxies IQEX's SSE
// stream, which the chat tool buffers into one reply).
export const teamTools = [
  {
    name: "uiiq_team_provision",
    description: "Make sure the workspace has an IQEX organisation, creating one when missing (idempotent: alreadyProvisioned:true when it exists). Returns { orgId, alreadyProvisioned }. Most IQEX-backed features (brains, smart pages, credits) need this.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await post(tenant, "/team/provision");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_team_owner_avatar_create",
    description: "Create the owner's avatar character on IQEX (character id = the tenant slug) with a display name, optional system prompt and personality traits. Provisions the IQEX org first if needed. Idempotent: an existing avatar answers alreadyProvisioned:true and is not changed.",
    inputSchema: {
      type: "object",
      required: ["displayName"],
      properties: { displayName: { type: "string" }, systemPrompt: { type: "string" }, personalityTraits: { type: "array", items: { type: "string" } }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/team/owner-avatar", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_team_chat",
    description: "Chat with a Mastermind team agent (agentId from uiiq_agent_list) on IQEX. Pass message (and history — earlier [{ role, content }] turns) and optionally a model override. The reply streams from IQEX; this buffers it and returns { reply }. Runs an LLM call on the workspace's IQEX org.",
    inputSchema: {
      type: "object",
      required: ["agentId", "message"],
      properties: {
        agentId: { type: "string" }, message: { type: "string" },
        history: { type: "array", items: { type: "object", required: ["role", "content"], properties: { role: { type: "string", enum: ["user", "assistant"] }, content: { type: "string" } } } },
        model: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ agentId, message, history = [], model, tenant }) {
      const messages = [...history, { role: "user", content: message }];
      const res = await post(tenant, "/team/chat", { agentId, messages, ...(model ? { model } : {}) });
      if (!res.ok) throw await fail(res);
      const text = await res.text();
      let reply = "";
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") break;
        let msg;
        try { msg = JSON.parse(raw); } catch { continue; }
        if (msg.error) throw new Error(msg.error);
        if (msg.delta) reply += msg.delta;
      }
      return { agentId, reply: reply || text };
    },
  },
];
