import fs from "fs";
import path from "path";
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

async function saveAudio(res, outPath) {
  const bytes = Buffer.from(await res.arrayBuffer());
  const target = path.resolve(outPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return { path: target, bytes: bytes.length, provider: res.headers.get("x-tts-provider") ?? "elevenlabs" };
}


export const boardroomTools = [
  {
    name: "uiiq_boardroom_ask",
    description: "Ask a boardroom AI agent a single question (single-shot). agentSlug from uiiq_agent_list.",
    inputSchema: {
      type: "object",
      required: ["agentSlug", "message"],
      properties: { agentSlug: { type: "string" }, message: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ agentSlug, message, tenant }) {
      const res = await api(tenant)("/boardroom/run", {
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
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/boardroom/meeting/sessions");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_boardroom_start",
    description: "Start a new boardroom meeting session.",
    inputSchema: { type: "object", properties: { title: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ title, tenant } = {}) {
      const res = await api(tenant)("/boardroom/meeting/sessions", {
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
      properties: { sessionId: { type: "string" }, content: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ sessionId, content, tenant }) {
      const res = await api(tenant)(`/boardroom/meeting/${sessionId}/message`, {
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

  // ── Agent voices, meeting turns and text-to-speech ──
  {
    name: "uiiq_boardroom_agent_voice_get",
    description: "The ElevenLabs voice id configured for a boardroom agent in this workspace (null = the platform default).",
    inputSchema: { type: "object", required: ["agentSlug"], properties: { agentSlug: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ agentSlug, tenant }) {
      const res = await api(tenant)(`/boardroom/agent/${encodeURIComponent(agentSlug)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_boardroom_agent_voice_set",
    description: "Set (or clear with null) the ElevenLabs voice id a boardroom agent speaks with in this workspace.",
    inputSchema: { type: "object", required: ["agentSlug"], properties: { agentSlug: { type: "string" }, voiceId: { type: ["string", "null"] }, tenant: TENANT_PROP } },
    async handler({ agentSlug, voiceId = null, tenant }) {
      const res = await api(tenant)(`/boardroom/agent/${encodeURIComponent(agentSlug)}`, { method: "PATCH", body: JSON.stringify({ voiceId }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_boardroom_meeting_turn",
    description: "One agent's turn in a multi-agent meeting thread: pass the whole thread as messages [{ role:'user'|'assistant', content, agentSlug?, agentName? }] and the agent answers in 2–4 sentences seeing every other member's contribution. Runs an Anthropic call. Returns { agentSlug, agentName, content }.",
    inputSchema: {
      type: "object",
      required: ["agentSlug", "messages"],
      properties: {
        agentSlug: { type: "string" },
        messages: { type: "array", items: { type: "object", required: ["role", "content"], properties: { role: { type: "string", enum: ["user", "assistant"] }, content: { type: "string" }, agentSlug: { type: "string" }, agentName: { type: "string" } } } },
        tenant: TENANT_PROP,
      },
    },
    async handler({ agentSlug, messages, tenant }) {
      const res = await api(tenant)("/boardroom/meeting", { method: "POST", body: JSON.stringify({ agentSlug, messages }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_boardroom_tts",
    description: "Speak text in a boardroom agent's voice (agentSlug default quinn), ElevenLabs only. With a voice, the audio is saved to outPath (default ./tts-<agentSlug>.mp3), { path, bytes, provider } is returned, and the characters are LOGGED TO IQEX FOR CREDIT DEDUCTION. With no ElevenLabs key or voice for the agent, or ElevenLabs failing, nothing is spoken or charged and the route's { audio: false, reason } comes back (reason: no-key, no-voice or unavailable).",
    inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" }, agentSlug: { type: "string" }, outPath: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ text, agentSlug, outPath, tenant }) {
      const res = await api(tenant)("/boardroom/tts", { method: "POST", body: JSON.stringify({ text, agentSlug }) });
      if (!res.ok) throw new Error(await res.text());
      if (!(res.headers.get("content-type") ?? "").startsWith("audio/")) return res.json();
      return saveAudio(res, outPath || `tts-${agentSlug || "quinn"}.mp3`);
    },
  },
];
