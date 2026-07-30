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


// ── Workshop / Journeys ───────────────────────────────────────────────────
//
// The WORKSHOP is UIIQ's "get things done" surface: each Workshop card launches
// a guided *journey* (an ordered sequence of IQEX automations the user steps
// through as one form flow — e.g. "make-a-trail", "make-an-avatar").
//
// Journey DATA lives in IQEX; the user-facing RUNNER is a UIIQ concern. UIIQ
// proxies the IQEX journey engine through session-authed routes under
// /api/journeys/** (start / advance / status / ready / resume). Each /start
// returns a signed `runToken` that binds the run to the caller's tenant — it
// MUST be echoed on every advance/status/ready call for that run, or UIIQ
// refuses with 403. Per-step credits are charged IQEX-side on /advance; callers
// never debit credits themselves.
//
// uiiq_journey_list reads the tenant-facing catalogue at GET /api/journeys —
// the entitlement-filtered Workshop cards for the caller's tenant (same filter
// the Workshop page applies). It is NOT the SuperAdmin CRUD at
// /api/admin/workshop-cards, so a normal tenant user gets their entitled
// journeys, not every card.

async function jsonOrThrow(res) {
  if (!res.ok) {
    let msg;
    try {
      const body = await res.json();
      msg = body?.error ?? JSON.stringify(body);
    } catch {
      msg = await res.text();
    }
    const err = new Error(msg || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const journeyTools = [
  {
    name: "uiiq_journey_list",
    description:
      "List the Workshop catalogue for the signed-in user's tenant — the deliverable-action cards, each of which launches a journey via its journeySlug. Returns only the cards the tenant is entitled to (its enabled features), via the tenant-facing GET /api/journeys. Cards without a journeySlug are defined but not yet wired to a runnable journey.",
    inputSchema: {
      type: "object",
      properties: {
        runnableOnly: {
          type: "boolean",
          description: "Only return active cards that have a journeySlug (i.e. actually launchable).",
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ runnableOnly, tenant } = {}) {
      const qs = runnableOnly ? "?runnable=1" : "";
      const res = await api(tenant)(`/journeys${qs}`);
      const data = await jsonOrThrow(res);
      const cards = Array.isArray(data) ? data : data.cards ?? [];
      return cards.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.journeySlug ?? null,
        category: c.category ?? null,
        featureKey: c.featureKey ?? null,
        active: c.active,
        runnable: Boolean(c.journeySlug),
        description: c.description ?? null,
      }));
    },
  },
  {
    name: "uiiq_journey_start",
    description:
      "Start a Workshop journey run for the caller's tenant (e.g. slug 'make-a-trail', 'make-an-avatar'). Returns runId, runToken (carry this into every advance/status/ready call), iqexRunToken (used by embedded step forms), totalSteps and the first step descriptor. Per-step credits are charged on /advance — not here. 402 means the tenant has insufficient credits.",
    inputSchema: {
      type: "object",
      required: ["slug"],
      properties: {
        slug: { type: "string", description: "Journey slug, e.g. make-a-trail" },
        creditCap: {
          type: "number",
          description: "Optional per-run credit ceiling; the run stops before exceeding it.",
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ slug, creditCap, tenant } = {}) {
      const body = {};
      if (typeof creditCap === "number" && creditCap > 0) body.creditCap = creditCap;
      const res = await api(tenant)(`/journeys/${encodeURIComponent(slug)}/start`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return jsonOrThrow(res);
    },
  },
  {
    name: "uiiq_journey_status",
    description:
      "Get a journey run's status (read-only). Surfaces the final result link once any async finishing workflow completes (e.g. the Trail project id). Requires the runToken returned by uiiq_journey_start.",
    inputSchema: {
      type: "object",
      required: ["runId", "runToken"],
      properties: {
        runId: { type: "number", description: "Run id from uiiq_journey_start." },
        runToken: { type: "string", description: "Signed run token from uiiq_journey_start." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ runId, runToken, tenant } = {}) {
      const res = await api(tenant)(
        `/journeys/runs/${runId}/status?runToken=${encodeURIComponent(runToken)}`,
      );
      return jsonOrThrow(res);
    },
  },
  {
    name: "uiiq_journey_ready",
    description:
      "Check whether a journey run's review checkpoint is ready to confirm — i.e. no async jobs it kicked off (e.g. a custom avatar render) are still processing. Read-only. Requires the runToken from uiiq_journey_start.",
    inputSchema: {
      type: "object",
      required: ["runId", "runToken"],
      properties: {
        runId: { type: "number" },
        runToken: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ runId, runToken, tenant } = {}) {
      const res = await api(tenant)(
        `/journeys/runs/${runId}/ready?runToken=${encodeURIComponent(runToken)}`,
      );
      return jsonOrThrow(res);
    },
  },
  {
    name: "uiiq_journey_advance",
    description:
      "Advance a journey run: record the just-completed step's output, charge that step's credits to the org (IQEX-side), and return the next prefilled step — or { done: true, context } when finished. Requires the runToken from uiiq_journey_start. 402 means out of credits.",
    inputSchema: {
      type: "object",
      required: ["runId", "runToken"],
      properties: {
        runId: { type: "number" },
        runToken: { type: "string" },
        output: {
          type: "object",
          description: "The completed step's field/value outputs (object). Defaults to {} for a native review confirm.",
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ runId, runToken, output, tenant } = {}) {
      const res = await api(tenant)(`/journeys/runs/${runId}/advance`, {
        method: "POST",
        body: JSON.stringify({ runToken, output: output ?? {} }),
      });
      return jsonOrThrow(res);
    },
  },
  {
    name: "uiiq_journey_resume",
    description:
      "Mint a resume link for a journey run whose embedded form saved progress, and email it to the signed-in user. Returns { resumeUrl, emailed }. Needs the IQEX progressToken the step form reported on save.",
    inputSchema: {
      type: "object",
      required: ["slug", "runId", "progressToken"],
      properties: {
        slug: { type: "string", description: "Journey slug the run belongs to." },
        runId: { type: "number" },
        progressToken: { type: "string", description: "IQEX FormProgress token from the saved step." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ slug, runId, progressToken, tenant } = {}) {
      const res = await api(tenant)(`/journeys/${encodeURIComponent(slug)}/resume`, {
        method: "POST",
        body: JSON.stringify({ runId, progressToken }),
      });
      return jsonOrThrow(res);
    },
  },
];
