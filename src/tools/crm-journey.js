import { apiClient } from "../auth.js";

// The CRM journey (UIIQ #485/#487) and Find Prospects (#486): log what
// happened with a prospect, see what's due, run discovery searches and
// review their candidates. All proxied through UIIQ's session APIs so the
// server-side rules (tenant scoping, adopt-creates-the-opening-note,
// candidates-never-enter-the-pipeline-unreviewed) apply unchanged.
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

const INTERACTION_TYPES = ["CALL", "EMAIL", "MEETING", "NOTE", "TASK", "SOCIAL"];
const CALL_OUTCOMES = ["CONNECTED", "NO_ANSWER", "LEFT_VOICEMAIL", "BUSY", "WRONG_NUMBER"];

export const crmJourneyTools = [
  {
    name: "uiiq_interaction_log",
    description:
      "Log an interaction on a business/prospect — a call (with structured outcome), email (paste it in), meeting, note, or SOCIAL outreach (a DM on the prospect's socials; put the platform in `subject`, e.g. 'Facebook DM'). Backdatable via occurredAt (when it HAPPENED, not when typed). Optionally schedule a follow-up; due follow-ups surface on the Prospects page and via uiiq_followups_due.",
    inputSchema: {
      type: "object",
      required: ["businessId", "type", "body"],
      properties: {
        businessId: { type: "string", description: "The Business id (from uiiq_prospect_list/get)" },
        type: { type: "string", enum: INTERACTION_TYPES },
        body: { type: "string", description: "What happened / what was said / the pasted message" },
        occurredAt: { type: "string", description: "ISO datetime when it happened (default now; not future)" },
        direction: { type: "string", enum: ["INBOUND", "OUTBOUND"], description: "For EMAIL/SOCIAL (default OUTBOUND)" },
        outcome: { type: "string", enum: CALL_OUTCOMES, description: "CALL only" },
        subject: { type: "string", description: "EMAIL subject, or SOCIAL platform ('Facebook DM')" },
        durationMinutes: { type: "number", description: "CALL/MEETING length" },
        followUpAt: { type: "string", description: "ISO date to follow up" },
        followUpNote: { type: "string", description: "…to do what (e.g. 'send quote')" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ businessId, tenant, ...rest }) {
      const res = await api(tenant)(`/businesses/${businessId}/interactions`, {
        method: "POST",
        body: JSON.stringify(rest),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_interaction_list",
    description:
      "The journey on one business — every logged call, email, meeting, note and social outreach, newest-happened-first.",
    inputSchema: {
      type: "object",
      required: ["businessId"],
      properties: { businessId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ businessId, tenant }) {
      const res = await api(tenant)(`/businesses/${businessId}/interactions`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_followups_due",
    description:
      "Every due or overdue follow-up on the tenant's businesses, oldest first — the 'what should I chase today' list.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/crm/followups");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_prospect_search_start",
    description:
      "Start a Find Prospects discovery search: describe who you're looking for and where; the research engine (IQEX) returns candidates with a reason and source each, for review. The search sits PENDING until the engine delivers — that state is honest, not stuck.",
    inputSchema: {
      type: "object",
      required: ["what"],
      properties: {
        what: { type: "string", description: 'Who you\'re looking for, e.g. "agents that have bands" or "garden centres with a café"' },
        where: { type: "string", description: "Location restriction, e.g. Doncaster" },
        role: { type: "string", description: "Who to reach — owner, buyer, events manager…" },
        signals: { type: "string", description: "Signals that matter — gigging now, runs events…" },
        count: { type: "number", description: "How many candidates wanted (default 10, max 50)" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...brief }) {
      const res = await api(tenant)("/crm/prospect-searches", {
        method: "POST",
        body: JSON.stringify(brief),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_prospect_search_list",
    description: "List the tenant's Find Prospects searches with status and candidate counts.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/crm/prospect-searches");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_prospect_search_get",
    description:
      "One search with its candidates: business, contact, reason, source_url, opener, and whether each already exists in the pipeline.",
    inputSchema: {
      type: "object",
      required: ["searchId"],
      properties: { searchId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ searchId, tenant }) {
      const res = await api(tenant)(`/crm/prospect-searches/${searchId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_prospect_search_review",
    description:
      "Review one candidate: 'adopt' creates the Business (source contact-hunter) + person + an opening NOTE carrying the reason and source — or attaches a note to the existing business when the candidate was flagged as already known. 'dismiss' closes it. Candidates never enter the pipeline any other way.",
    inputSchema: {
      type: "object",
      required: ["searchId", "candidateId", "action"],
      properties: {
        searchId: { type: "string" },
        candidateId: { type: "string" },
        action: { type: "string", enum: ["adopt", "dismiss"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ searchId, candidateId, action, tenant }) {
      const res = await api(tenant)(`/crm/prospect-searches/${searchId}`, {
        method: "PATCH",
        body: JSON.stringify({ candidateId, action }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
