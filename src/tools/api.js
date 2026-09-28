import fs from "node:fs";
import path from "node:path";
import { BASE } from "../config.js";
import { apiClient } from "../auth.js";

// The API itself: the unauthenticated liveness ping and the OpenAPI document
// (both public — no login, no tenant), plus the SUPER_ADMIN Sentry self-test.
// For "is the platform up and who am I acting as" use uiiq_status.
const PING = "/ping";
const OPENAPI = "/openapi.json";

export const apiTools = [
  {
    name: "uiiq_api_ping",
    description: "The API's bare liveness ping: { ok: true, t: <server ms> } plus the round-trip latency. Public, no login. Use uiiq_status for the fuller health check and the impersonation state.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const start = Date.now();
      const res = await fetch(`${BASE}/api${PING}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ...(await res.json()), latencyMs: Date.now() - start };
    },
  },
  {
    name: "uiiq_api_openapi",
    description: "The merged OpenAPI 3.1 document for the UIIQ platform API (the public Booking API under /api/v1 plus the documented admin routes, with per-operation security schemes). Public, no login. Large: give outPath to save it to a file and get back { path, bytes, paths } instead of the whole document.",
    inputSchema: { type: "object", properties: { outPath: { type: "string", description: "Save the JSON here instead of returning it" } } },
    async handler({ outPath } = {}) {
      const res = await fetch(`${BASE}/api${OPENAPI}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const spec = await res.json();
      if (!outPath) return spec;
      const target = path.resolve(outPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const text = JSON.stringify(spec, null, 2);
      fs.writeFileSync(target, text);
      return { path: target, bytes: Buffer.byteLength(text), paths: Object.keys(spec.paths ?? {}).length };
    },
  },
  {
    name: "uiiq_api_sentry_selftest",
    description: "Fire a test exception through the deployed app's Sentry pipeline and return its event id, to prove the wiring end to end. SUPER_ADMIN only. Creates a real Sentry event in the uiiq project.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/sentry-selftest");
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { ok, sentry_event_id }
    },
  },
];
