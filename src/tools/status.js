import { BASES } from "../config.js";

export const statusTools = [
  {
    name: "uiiq_status",
    description: "Check health and latency of all UIIQ apps (UBMS, UVOS, POSM). Use this to verify the platform is up before running other tools.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const results = await Promise.all(
        Object.entries(BASES).map(async ([app, base]) => {
          const start = Date.now();
          try {
            const res = await fetch(base + "/api/health", { signal: AbortSignal.timeout(5000) });
            return { app, status: res.ok ? "up" : "degraded", latency: (Date.now() - start) + "ms", code: res.status };
          } catch {
            return { app, status: "down", latency: (Date.now() - start) + "ms", code: null };
          }
        })
      );
      return results;
    }
  },
];
