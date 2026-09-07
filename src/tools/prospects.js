import { apiClient } from "../auth.js";
import { BASE } from "../config.js";

// Find Prospects, beyond the search itself: saved presets and town sweeps,
// Prospect Jobs (tenders / funding calls adopted as bids), the super-admin
// source registry, the personalised video invite for an adopted candidate,
// and the ingest route that turns a business enquiry into a prospect.
// All proxied through UIIQ's own APIs so the server-side rules (tenant
// scoping, adopt-creates-the-card, subscription-sources-are-never-read)
// apply unchanged.
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

// A preset body is validated whole by the platform (lib/prospect-presets):
// PATCH replaces every field, so both create and update take the same shape.
const PRESET_PROPS = {
  name: { type: "string", description: "Preset name (max 80). Defaults to the first 60 chars of `what`" },
  mode: { type: "string", enum: ["businesses", "acts"], description: "Which engine the preset runs (default businesses)" },
  what: { type: "string", description: "The search phrase — who you're looking for (max 500)" },
  role: { type: "string", description: "Who to reach — owner, buyer, events manager… (max 100)" },
  signals: { type: "string", description: "Signals that matter (max 500)" },
  intent: { type: "string", description: "Why the tenant wants them / what it offers (max 300)" },
  count: { type: "number", description: "Candidates per town (default 10, max 50)" },
  towns: {
    type: "array",
    items: { type: "string" },
    description: "The towns a sweep of this preset covers (max 60, 80 chars each)",
  },
};

const JOB_STATUSES = ["NEW", "ADOPTED", "DISMISSED", "all"];

export const prospectTools = [
  // ── Presets ──
  {
    name: "uiiq_prospect_preset_list",
    description: "The tenant's saved Find Prospects briefs — press one, type a town, go. The unit of a town sweep.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/crm/prospect-presets");
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { presets }
    },
  },
  {
    name: "uiiq_prospect_preset_create",
    description: "Save a Find Prospects brief as a preset. Only `what` is required; towns[] are what uiiq_prospect_sweep_start will cover by default.",
    inputSchema: {
      type: "object",
      required: ["what"],
      properties: { ...PRESET_PROPS, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/crm/prospect-presets", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { preset }
    },
  },
  {
    name: "uiiq_prospect_preset_update",
    description:
      "Replace a preset. Send the WHOLE preset — the platform validates the body as one unit, so any field you leave out is reset to blank (count to 10, mode to businesses). Read it with uiiq_prospect_preset_list first.",
    inputSchema: {
      type: "object",
      required: ["presetId", "what"],
      properties: { presetId: { type: "string" }, ...PRESET_PROPS, tenant: TENANT_PROP },
    },
    async handler({ presetId, tenant, ...body }) {
      const res = await api(tenant)(`/crm/prospect-presets/${encodeURIComponent(presetId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { ok: true }
    },
  },
  {
    name: "uiiq_prospect_preset_delete",
    description: "Delete a saved preset. Searches already run from it are untouched.",
    inputSchema: {
      type: "object",
      required: ["presetId"],
      properties: { presetId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ presetId, tenant }) {
      const res = await api(tenant)(`/crm/prospect-presets/${encodeURIComponent(presetId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { ok: true }
    },
  },

  // ── Sweeps ──
  {
    name: "uiiq_prospect_sweep_start",
    description:
      "A town sweep: one preset × many towns = one job, one review list. Creates one PENDING search per town (all sharing a sweepId) and returns their ids — it does NOT run them. Start each with uiiq_prospect_search_rerun { wait: false }, one at a time; the engine delivers as each finishes. Towns default to the preset's own list; max 60.",
    inputSchema: {
      type: "object",
      required: ["presetId"],
      properties: {
        presetId: { type: "string" },
        towns: { type: "array", items: { type: "string" }, description: "Override the preset's towns for this sweep (max 60)" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ presetId, towns, tenant }) {
      const res = await api(tenant)("/crm/prospect-sweeps", {
        method: "POST",
        body: JSON.stringify({ presetId, ...(towns ? { towns } : {}) }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { sweepId, searches: [{ id, town }] }
    },
  },

  // ── Prospect Jobs (tenders / funding) ──
  {
    name: "uiiq_prospect_job_list",
    description:
      "The tenant's tenders and funding calls found by Find Prospects (mode tenders/funding), soonest deadline first. NEW by default — pass status 'all' for everything. Each carries buyer/funder, value, deadline, eligibility, notice URL and the reason it was picked.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: JOB_STATUSES, description: "Defaults to NEW" },
        searchId: { type: "string", description: "Only jobs from this search" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ status, searchId, tenant } = {}) {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (searchId) params.set("search", searchId);
      const qs = params.toString() ? `?${params}` : "";
      const res = await api(tenant)(`/crm/prospect-jobs${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { jobs }
    },
  },
  {
    name: "uiiq_prospect_job_update",
    description:
      "Review one tender / funding call: 'adopt' turns it into a task card on the tenant's 'Prospect Jobs' board (created on first use) — due two days before the deadline (HIGH inside a fortnight), or 'write to them' in a fortnight for a funder with no deadline. 'dismiss' closes it. Nothing is filed in the Business pipeline either way.",
    inputSchema: {
      type: "object",
      required: ["jobId", "action"],
      properties: {
        jobId: { type: "string" },
        action: { type: "string", enum: ["adopt", "dismiss"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ jobId, action, tenant }) {
      const res = await api(tenant)(`/crm/prospect-jobs/${encodeURIComponent(jobId)}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { ok, status, taskId? }
    },
  },

  // ── Source registry (SUPER_ADMIN; lives on IQEX, proxied by UIIQ) ──
  {
    name: "uiiq_prospect_source_list",
    description:
      "SUPER_ADMIN. The Find Prospects source registry — the portals Tenders and Funding are allowed to read. Each row carries `readable` and a `blocked_reason` (a blocked source with no reason is a bug). Not tenant-scoped.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["procurement", "funding"] },
        status: { type: "string", enum: ["candidate", "active", "retired"] },
      },
    },
    async handler({ kind, status } = {}) {
      const params = new URLSearchParams();
      if (kind) params.set("kind", kind);
      if (status) params.set("status", status);
      const qs = params.toString() ? `?${params}` : "";
      const res = await apiClient()(`/api/admin/prospect-sources${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { sources, summary }
    },
  },
  {
    name: "uiiq_prospect_source_create",
    description:
      "SUPER_ADMIN. Propose a source portal. Always filed as a CANDIDATE — approval is a separate, human uiiq_prospect_source_update. `subscription` sources are never read whatever anyone sets; that rule is IQEX's.",
    inputSchema: {
      type: "object",
      required: ["name", "url"],
      properties: {
        name: { type: "string", description: "max 200" },
        url: { type: "string", description: "max 500" },
        kind: { type: "string", enum: ["procurement", "funding"], description: "Default procurement" },
        access: { type: "string", enum: ["api", "open-data", "page", "subscription"], description: "How it is read (default page)" },
        region: { type: "string", description: "max 120" },
        tos_note: { type: "string", description: "Terms-of-service note — why reading it is allowed (max 1000)" },
      },
    },
    async handler(body) {
      const res = await apiClient()("/api/admin/prospect-sources", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_prospect_source_update",
    description: "SUPER_ADMIN. Approve, retire or annotate a source: status candidate|active|retired, reading_allowed, tos_note. Send at least one.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Source id from uiiq_prospect_source_list" },
        status: { type: "string", enum: ["candidate", "active", "retired"] },
        reading_allowed: { type: "boolean" },
        tos_note: { type: "string", description: "max 1000" },
      },
    },
    async handler({ id, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (Object.keys(body).length === 0) throw new Error("Send at least one of status, reading_allowed, tos_note");
      const res = await apiClient()("/api/admin/prospect-sources", {
        method: "PATCH",
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Video invite ──
  {
    name: "uiiq_prospect_video_invite_create",
    description:
      "Render a personalised 'we'd love you on board' talking-head video for an ADOPTED candidate (IQEX HeyGen path; charged to the tenant's IQEX org on success, idempotent per candidate). The script is composed from the engine's reason/opener + the brief's intent + the tenant name unless you pass your own (>20 chars, max 900). Needs the workspace linked to an IQEX org (409 otherwise). Returns the pending invite; poll with uiiq_prospect_video_invite_get.",
    inputSchema: {
      type: "object",
      required: ["candidateId"],
      properties: {
        candidateId: { type: "string", description: "The candidate id (from uiiq_prospect_search_get) — must already be adopted" },
        script: { type: "string", description: "Your own script instead of the composed one (>20 chars, max 900)" },
        presenter: { type: "string", description: "Presenter name to sign the composed script with" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ candidateId, script, presenter, tenant }) {
      const res = await api(tenant)(`/crm/prospect-candidates/${encodeURIComponent(candidateId)}/video-invite`, {
        method: "POST",
        body: JSON.stringify({ ...(script ? { script } : {}), ...(presenter ? { presenter } : {}) }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { invite, note? }
    },
  },
  {
    name: "uiiq_prospect_video_invite_get",
    description:
      "Poll an adopted candidate's video invite: { invite: null } when none was started; status pending | complete (with url) | failed. The URL is stored on the adopted Business's customFields.videoInvite once complete.",
    inputSchema: {
      type: "object",
      required: ["candidateId"],
      properties: { candidateId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ candidateId, tenant }) {
      const res = await api(tenant)(`/crm/prospect-candidates/${encodeURIComponent(candidateId)}/video-invite`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Ingest (Connect-key auth, not the session) ──
  {
    name: "uiiq_prospect_ingest",
    description:
      "A business enquiry becomes a prospect — the route IQForms (via iqlink) and website forms feed lead generation through. Dedupes on the BUSINESS (website, then name+postcode, then exact name), so two enquiries from one venue are one prospect with two interactions. The enquiry is logged as the first (INBOUND NOTE) interaction. NO marketing Contact is created. " +
      "Auth is the tenant's Connect key (X-API-Key) — get it with uiiq_tenant_api_key or set UIIQ_CONNECT_API_KEY; a uiiq_live_… platform key is the wrong kind and is refused.",
    inputSchema: {
      type: "object",
      required: ["business_name"],
      properties: {
        business_name: { type: "string", description: "Whose enquiry this is (max 200)" },
        contact_name: { type: "string" },
        role: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        website: { type: "string" },
        town: { type: "string" },
        postcode: { type: "string" },
        category: { type: "string" },
        notes: { type: "string", description: "The enquiry text / form answers (max 5000)" },
        source: { type: "string", description: "Where it came from (default iqforms)" },
        apiKey: { type: "string", description: "The tenant's Connect key. Falls back to env UIIQ_CONNECT_API_KEY" },
      },
    },
    async handler({ apiKey, ...body }) {
      const key = apiKey ?? process.env.UIIQ_CONNECT_API_KEY;
      if (!key) throw new Error("No Connect key. Pass apiKey (see uiiq_tenant_api_key) or set UIIQ_CONNECT_API_KEY.");
      const res = await fetch(`${BASE}/api/crm/prospects/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": key },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { businessId, personId?, created, deduplicated? }
    },
  },
];
