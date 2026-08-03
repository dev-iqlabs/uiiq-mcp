import { BASE } from "../config.js";
import { impersonationState } from "../auth.js";

// Report which tenant calls act as — including sessions that exist but are NOT
// being honoured. Reporting only honoured ones would mean a lapsed or opted-out
// session reads as a clean "your own tenant", which is the exact blind spot
// this is here to remove.
const NOTES = {
  expired:
    "This session has EXPIRED. Tool calls raise rather than silently running as your own tenant. Run `uiiq tenant impersonate-exit`, or re-impersonate.",
  "not-opted-in":
    "NOT being honoured — this MCP server did not opt in. Calls run as your own tenant. Set UIIQ_MCP_INHERIT_IMPERSONATION=1 to follow the CLI session, or pass an explicit `tenant` to a tool.",
  "write-not-opted-in":
    "Honoured for reads only. Writes raise rather than land in this tenant unattended — set UIIQ_MCP_INHERIT_WRITE=1 to allow them, or pass an explicit `tenant`.",
  honoured:
    "Honoured. Tool calls with no explicit `tenant` act as this tenant until it expires or `uiiq tenant impersonate-exit` is run.",
};

function actingAs() {
  const s = impersonationState();
  if (!s.present) return { actingAs: "your own tenant" };

  const imp = s.imp;
  const who = imp.tenantName ?? imp.tenantSlug ?? imp.tenantId;
  const msLeft = Date.parse(imp.expiresAt) - Date.now();
  return {
    // Only claim to be acting as the tenant when calls actually will.
    actingAs: s.honoured ? who : "your own tenant",
    impersonation: {
      tenant: who,
      tenantId: imp.tenantId,
      tenantSlug: imp.tenantSlug ?? null,
      honoured: s.honoured,
      writeEnabled: Boolean(imp.writeEnabled),
      writesAllowed: Boolean(s.honoured && imp.writeEnabled && !s.writeBlocked),
      expired: Boolean(s.expired),
      minutesLeft: s.expired ? 0 : Math.max(1, Math.round(msLeft / 60000)),
      note: NOTES[s.reason] ?? s.reason,
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
