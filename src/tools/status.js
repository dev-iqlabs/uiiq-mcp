import { BASE } from "../config.js";

export const statusTools = [
  {
    name: "uiiq_status",
    description: "Check health and latency of the UIIQ platform. Use this to verify the platform is up before running other tools.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const start = Date.now();
      try {
        const res = await fetch(BASE + "/api/health", { signal: AbortSignal.timeout(5000) });
        return { app: "uiiq", base: BASE, status: res.ok ? "up" : "degraded", latency: (Date.now() - start) + "ms", code: res.status };
      } catch {
        return { app: "uiiq", base: BASE, status: "down", latency: (Date.now() - start) + "ms", code: null };
      }
    }
  },
];
