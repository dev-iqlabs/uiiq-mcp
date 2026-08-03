import { BASE } from "../config.js";
import { ambientImpersonation } from "../auth.js";

// Report any impersonation session the CLI has established, because every tool
// here inherits it. Without this the operator has no way to tell, from the MCP
// side, that calls are landing in a client's tenant rather than their own.
function actingAs() {
  const imp = ambientImpersonation();
  if (!imp) return { actingAs: "your own tenant" };
  const minutesLeft = Math.max(1, Math.round((Date.parse(imp.expiresAt) - Date.now()) / 60000));
  return {
    actingAs: imp.tenantName ?? imp.tenantSlug ?? imp.tenantId,
    impersonation: {
      tenantId: imp.tenantId,
      tenantSlug: imp.tenantSlug ?? null,
      writeEnabled: Boolean(imp.writeEnabled),
      minutesLeft,
      note: imp.writeEnabled
        ? "Started by `uiiq tenant impersonate --write`. Every tool call WRITES to this tenant until it expires or `uiiq tenant impersonate-exit` is run."
        : "Read-only session started by `uiiq tenant impersonate`. Reads land in this tenant; writes will be refused by the server.",
    },
  };
}

export const statusTools = [
  {
    name: "uiiq_status",
    description: "Check health and latency of the UIIQ platform, and which tenant tool calls are currently acting as. Use this to verify the platform is up before running other tools.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const start = Date.now();
      try {
        const res = await fetch(BASE + "/api/health", { signal: AbortSignal.timeout(5000) });
        return { app: "uiiq", base: BASE, status: res.ok ? "up" : "degraded", latency: (Date.now() - start) + "ms", code: res.status, ...actingAs() };
      } catch {
        return { app: "uiiq", base: BASE, status: "down", latency: (Date.now() - start) + "ms", code: null, ...actingAs() };
      }
    }
  },
];
