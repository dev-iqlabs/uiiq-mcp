import { apiClient } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});
const enc = encodeURIComponent;

async function fail(res) {
  const text = await res.text();
  try { const j = JSON.parse(text); if (j?.error) return new Error(j.error); } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}

async function call(tenant, path, init) {
  const res = await api(tenant)(path, init);
  if (!res.ok) throw await fail(res);
  return res.json();
}
const send = (method, body) => ({ method, body: JSON.stringify(body) });

const ROUND_PROPS = {
  theme: { type: "string", description: "Up to 120 characters, e.g. \"Remembrance\"" },
  opensAt: { type: "string", description: "ISO date-time" },
  closesAt: { type: "string", description: "ISO date-time; after opensAt, at most 92 days later" },
  shortlistAt: { type: ["string", "null"], description: "ISO date-time the shortlist is announced" },
  winnerAt: { type: ["string", "null"], description: "ISO date-time the winner is announced" },
};

// COMPETITIONS — a competition that runs in rounds (e.g. Ultimate Coins'
// "Coin of the Week"): entries come in through an IQForm, judges score them
// against weighted criteria, a judge decides each round after it closes.
// Mirrors the UIIQ /competitions API (UiiQ-platform #946). GATED: needs the
// `competitions` feature ticked for the workspace. Setting a competition up,
// its rounds, recording what a nominee agreed to, and erasure are an
// owner/admin's; entry status and notes are any staff login's; scoring and
// Decide are the competition's judges'. Nothing here publishes a post: the
// call to enter is only ever a DRAFT in Social.
export const competitionTools = [
  {
    name: "uiiq_competition_list",
    description: "The workspace's competitions, newest first, with their round and entry counts.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return call(tenant, "/competitions");
    },
  },
  {
    name: "uiiq_competition_get",
    description: "One competition with its rounds, each with its phase (upcoming, open, closed, decided) and the entry form link for that round (share the round's link, never the bare form).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      return call(tenant, `/competitions/${enc(id)}`);
    },
  },
  {
    name: "uiiq_competition_create",
    description: "A new competition, DRAFT unless status says otherwise (owner/admin). ACTIVE needs entryFormUrl, rulesUrl, promoterName, and for a NOMINATION consentFormUrl. slug: lower-case letters, numbers and hyphens, unique in the workspace.",
    inputSchema: {
      type: "object",
      required: ["name", "slug"],
      properties: {
        name: { type: "string" },
        slug: { type: "string" },
        type: { type: "string", enum: ["NOMINATION", "ENTRY"] },
        status: { type: "string", enum: ["DRAFT", "ACTIVE", "ARCHIVED"] },
        promoterName: { type: "string" },
        promoterAddress: { type: "string" },
        prizeDescription: { type: "string" },
        prizeValuePence: { type: ["number", "null"] },
        eligibility: { type: "string", description: "Who may enter, e.g. \"UK residents aged 18 or over\"" },
        rulesUrl: { type: ["string", "null"], description: "https" },
        entryFormUrl: { type: ["string", "null"], description: "The IQForm link (www.iqex.co.uk only)" },
        entryFormId: { type: ["number", "null"] },
        consentFormUrl: { type: ["string", "null"], description: "The nominee consent IQForm link (www.iqex.co.uk only)" },
        consentFormId: { type: ["number", "null"] },
        criteria: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, weight: { type: "number" } } }, description: "Up to 10 judging criteria, each with a weight 1-100 (relative)" },
        judgeUserIds: { type: "array", items: { type: "string" }, description: "This workspace's people (uiiq_task_members); none = owners/admins judge" },
        socialAccountIds: { type: "array", items: { type: "string" }, description: "This workspace's social accounts the call post goes to (uiiq_social_accounts)" },
        postTemplates: { type: "object", description: "{ call } — the call to enter; must include {link} and {closes}. Placeholders: {competition} {round} {closes} {prize} {promoter} {eligibility} {link} {rules}" },
        entriesPerEmail: { type: "number", description: "1-20, per round" },
        retentionDays: { type: "number", description: "7-90" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      return call(tenant, "/competitions", send("POST", body));
    },
  },
  {
    name: "uiiq_competition_update",
    description: "Change a competition (owner/admin): any field of uiiq_competition_create, including status (DRAFT, ACTIVE, ARCHIVED). Photos stay off (acceptPhotos: true is refused) until the photo terms are signed off.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        slug: { type: "string" },
        type: { type: "string", enum: ["NOMINATION", "ENTRY"] },
        status: { type: "string", enum: ["DRAFT", "ACTIVE", "ARCHIVED"] },
        promoterName: { type: "string" },
        promoterAddress: { type: "string" },
        prizeDescription: { type: "string" },
        prizeValuePence: { type: ["number", "null"] },
        eligibility: { type: "string" },
        rulesUrl: { type: ["string", "null"] },
        entryFormUrl: { type: ["string", "null"] },
        entryFormId: { type: ["number", "null"] },
        consentFormUrl: { type: ["string", "null"] },
        consentFormId: { type: ["number", "null"] },
        criteria: { type: "array", items: { type: "object" } },
        judgeUserIds: { type: "array", items: { type: "string" } },
        socialAccountIds: { type: "array", items: { type: "string" } },
        postTemplates: { type: "object" },
        entriesPerEmail: { type: "number" },
        retentionDays: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      return call(tenant, `/competitions/${enc(id)}`, send("PATCH", body));
    },
  },
  {
    name: "uiiq_competition_rounds_add",
    description: "Add rounds, numbered on from the last (owner/admin). Either one round, or weekly: the same times repeated a week apart for `weeks` rounds (1-26), with optional themes in order.",
    inputSchema: {
      type: "object",
      required: ["id", "opensAt", "closesAt"],
      properties: {
        id: { type: "string", description: "The competition" },
        ...ROUND_PROPS,
        weeks: { type: "number", description: "More than 1 = weekly rounds" },
        themes: { type: "array", items: { type: "string" }, description: "With weeks: a theme per week, in order" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, weeks, themes, ...round }) {
      const body = weeks && weeks > 1 ? { weekly: { first: round, count: weeks, ...(themes ? { themes } : {}) } } : { round };
      return call(tenant, `/competitions/${enc(id)}/rounds`, send("POST", body));
    },
  },
  {
    name: "uiiq_competition_round_update",
    description: "A round's theme and times, until it's decided (owner/admin).",
    inputSchema: {
      type: "object",
      required: ["id", "roundId"],
      properties: { id: { type: "string" }, roundId: { type: "string" }, ...ROUND_PROPS, tenant: TENANT_PROP },
    },
    async handler({ id, roundId, tenant, ...body }) {
      return call(tenant, `/competitions/${enc(id)}/rounds/${enc(roundId)}`, send("PATCH", body));
    },
  },
  {
    name: "uiiq_competition_round_decide",
    description: "Decide a round after it closes: the winner and any runners-up (up to 10), from its confirmed entries that aren't rejected or withdrawn. Judges only (or owner/admin when none are named). Locks the round; the audit keeps who chose, when, and the scores.",
    inputSchema: {
      type: "object",
      required: ["id", "roundId", "winnerEntryId"],
      properties: {
        id: { type: "string" },
        roundId: { type: "string" },
        winnerEntryId: { type: "string" },
        runnerUpEntryIds: { type: "array", items: { type: "string" } },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, roundId, tenant, winnerEntryId, runnerUpEntryIds }) {
      return call(tenant, `/competitions/${enc(id)}/rounds/${enc(roundId)}/decide`, send("POST", { winnerEntryId, ...(runnerUpEntryIds ? { runnerUpEntryIds } : {}) }));
    },
  },
  {
    name: "uiiq_competition_call_post_draft",
    description: "This round's call to enter as a DRAFT social post, or the one already drafted: never scheduled or published here. Goes to the competition's social accounts, with the Meta/TikTok disclaimer and \"the link in our bio\" on Instagram and TikTok. Returns { postId, created, warnings }; schedule it in Social after a look.",
    inputSchema: {
      type: "object",
      required: ["id", "roundId"],
      properties: { id: { type: "string" }, roundId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, roundId, tenant }) {
      return call(tenant, `/competitions/${enc(id)}/rounds/${enc(roundId)}/call-post`, { method: "POST" });
    },
  },
  {
    name: "uiiq_competition_entries",
    description: "A competition's entries, ranked by weighted score (earlier entry first on a tie), each with what may be published about its nominee. roundId and status narrow it.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        roundId: { type: "string" },
        status: { type: "string", enum: ["UNCONFIRMED", "NEW", "SHORTLISTED", "WINNER", "RUNNER_UP", "REJECTED", "WITHDRAWN"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, roundId, status, tenant }) {
      const q = new URLSearchParams({ ...(roundId ? { roundId } : {}), ...(status ? { status } : {}) }).toString();
      return call(tenant, `/competitions/${enc(id)}/entries${q ? `?${q}` : ""}`);
    },
  },
  {
    name: "uiiq_competition_entry_get",
    description: "One entry: the entrant, the reason, the consents as ticked, the nominee's provisional answer and what was confirmed with them, the scores (photo as a 10-minute link).",
    inputSchema: { type: "object", required: ["entryId"], properties: { entryId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ entryId, tenant }) {
      return call(tenant, `/competitions/entries/${enc(entryId)}`);
    },
  },
  {
    name: "uiiq_competition_entry_update",
    description: "An entry's status (NEW, SHORTLISTED, REJECTED, WITHDRAWN: only a confirmed entry can be New or Shortlisted), staff notes, or your own judge's scores ({ criterionKey: 0-10 }). Locked once its round is decided. Audited.",
    inputSchema: {
      type: "object",
      required: ["entryId"],
      properties: {
        entryId: { type: "string" },
        status: { type: "string", enum: ["NEW", "SHORTLISTED", "REJECTED", "WITHDRAWN"] },
        notes: { type: "string" },
        scores: { type: "object", description: "{ criterionKey: 0-10 } for the criteria on the competition" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ entryId, tenant, ...body }) {
      return call(tenant, `/competitions/entries/${enc(entryId)}`, send("PATCH", body));
    },
  },
  {
    name: "uiiq_competition_nominee_confirm",
    description: "Record what was agreed directly with the nominee, or with their parent or guardian if under 18, e.g. at the prize handover (owner/admin): the only thing that lets their name, the quote or a photo be published. All four items must be given; a later record replaces this one, a withdrawal included. Audited.",
    inputSchema: {
      type: "object",
      required: ["entryId", "answeredBy", "how", "items"],
      properties: {
        entryId: { type: "string" },
        answeredBy: { type: "string", enum: ["nominee", "guardian"] },
        how: { type: "string", enum: ["in-person", "phone", "email", "letter"] },
        items: {
          type: "object",
          required: ["publishFirstName", "publishReason", "publishPhoto", "publishDelivery"],
          properties: {
            publishFirstName: { type: "boolean" },
            publishReason: { type: "boolean" },
            publishPhoto: { type: "boolean" },
            publishDelivery: { type: "boolean" },
          },
        },
        note: { type: "string", description: "Up to 500 characters" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ entryId, tenant, ...body }) {
      return call(tenant, `/competitions/entries/${enc(entryId)}/nominee-confirmation`, send("POST", body));
    },
  },
  {
    name: "uiiq_competition_entry_erase",
    description: "Erase one entry for good, its photo included, e.g. when a nominee asks (owner/admin). Can't be undone; the audit keeps only that it happened.",
    inputSchema: { type: "object", required: ["entryId"], properties: { entryId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ entryId, tenant }) {
      return call(tenant, `/competitions/entries/${enc(entryId)}`, { method: "DELETE" });
    },
  },
  {
    name: "uiiq_competition_erase_address",
    description: "A person's erasure request: every entry their email address sent to this workspace's competitions, photos included (owner/admin). Can't be undone; the audit keeps the address only as a hash. Returns { erased, photosDeleted }.",
    inputSchema: { type: "object", required: ["email"], properties: { email: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ email, tenant }) {
      return call(tenant, "/competitions/erase", send("POST", { email }));
    },
  },
];
