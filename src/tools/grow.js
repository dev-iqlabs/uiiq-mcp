import { apiClient } from "../auth.js";

const CHANNELS = ["google", "meta", "tiktok", "pinterest", "bing", "linkedin"];

export const growTools = [
  {
    name: "uiiq_grow_campaign_brief_generate",
    description:
      "Generate channel-native ad copy for a marketing campaign across multiple ad networks in one call. " +
      "One brief in → 6-channel ad copy out (Google, Meta, TikTok, Pinterest, Bing, LinkedIn). " +
      "Optionally kicks off a video asset in parallel via the existing video generator. " +
      "Character limits per channel are enforced post-generation with warnings. " +
      "Returns per-channel copy + token usage + (optionally) a video job ID.",
    inputSchema: {
      type: "object",
      required: ["productOrService", "audience", "valueProp", "channels"],
      properties: {
        productOrService: { type: "string", description: "e.g. 'Beetag QR pet tags · annual subscription'" },
        audience:         { type: "string", description: "e.g. 'UK dog owners aged 25-55 who care about safety'" },
        valueProp:        { type: "string", description: "The headline benefit / why-it-matters" },
        tone:             { type: "string", description: "friendly | professional | playful | bold | luxury | urgent | informative", default: "friendly" },
        callToAction:     { type: "string", description: "Preferred CTA (omit to let AI choose)" },
        channels: {
          type: "array",
          description: `Channels to generate for. Valid: ${CHANNELS.join(", ")}`,
          items: { type: "string", enum: CHANNELS },
          minItems: 1
        },
        generateVideo:    { type: "boolean", description: "Also kick off a video asset", default: false },
        videoStyle:       { type: "string", description: "talking_head | product | cinematic", default: "talking_head" },
        videoDuration:    { type: "number", description: "Video length in seconds", default: 15 }
      }
    },
    async handler(body) {
      const res = await apiClient()("/ads/campaign-brief", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_grow_brief_morning",
    description:
      "Fetch the latest UIIQ Grow Morning Brief — a daily AI-generated performance summary across all connected ad channels. Returns { briefDate, content: { summary, highlights[] }, emailSent }.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/admin/ads/brief").catch(() => null);
      if (!res || !res.ok) {
        const fallback = await apiClient()("/ads/brief");
        if (!fallback.ok) throw new Error(await fallback.text());
        return fallback.json();
      }
      return res.json();
    }
  },
  {
    name: "uiiq_grow_brief_morning_generate",
    description:
      "Generate (or refresh) today's UIIQ Grow Morning Brief by calling the IQEX ads platform endpoint. Pulls live performance data from all connected ad accounts. Optional sendEmail flag emails the brief to the caller's user email.",
    inputSchema: {
      type: "object",
      properties: {
        sendEmail: { type: "boolean", description: "Email the brief to the calling user", default: false }
      }
    },
    async handler({ sendEmail } = {}) {
      const res = await apiClient()("/ads/brief/generate", {
        method: "POST",
        body: JSON.stringify({ sendEmail: !!sendEmail }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  }
];
