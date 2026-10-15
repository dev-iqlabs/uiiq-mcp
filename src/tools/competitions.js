import { apiClient, impersonationState } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});
const CONFIRM_PROP = { type: "boolean", description: "true = do it; omit for the dry run, which changes nothing" };

// An id that goes into a route: only the characters an id has, so "", "." or
// ".." can never turn one route into another ("/competitions/entries/.." is
// "/competitions"). Lucas, uiiq-mcp #97 L1. Called as seg(x) inside a path,
// with no quotes, so UiiQ's client-coverage scan reads the whole path.
const ID = /^[A-Za-z0-9_-]{1,64}$/;
function seg(value, name = "Each id") {
  if (typeof value !== "string" || !ID.test(value)) throw new Error(`${name} must be an id: letters, numbers, - and _ only (up to 64)`);
  return value;
}

// The workspace a call acts in: the tenant named, an impersonation this MCP
// inherits, or your own (Lucas, #97 L-b).
function actingIn(tenant) {
  if (tenant) return tenant;
  const s = impersonationState();
  if (!s.honoured) return "your own workspace";
  const who = s.imp.tenantName ?? s.imp.tenantSlug ?? s.imp.tenantId;
  return s.writeBlocked ? `${who} (inherited; the change would be refused without UIIQ_MCP_INHERIT_WRITE=1)` : `${who} (inherited impersonation)`;
}

async function fail(res) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    // An erasure that kept entries says which, besides why (their photos couldn't be deleted yet).
    if (j?.error && j.kept) return new Error(`${j.error} Erased ${j.erased ?? 0}; kept ${Array.isArray(j.kept) ? j.kept.join(", ") : j.kept}.`);
    if (j?.error) return new Error(j.error);
  } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}

async function call(tenant, path, init) {
  const res = await api(tenant)(path, init);
  if (!res.ok) throw await fail(res);
  return res.json();
}
const send = (method, body) => ({ method, body: JSON.stringify(body) });
const dryRun = (wouldDo, tenant, details, note) => ({
  dryRun: true,
  changed: false,
  wouldDo,
  tenant: actingIn(tenant),
  ...details,
  note: `Nothing was changed. ${note} Then call again with confirm: true.`,
});

// An erasure answers { erased, photosDeleted, kept }; anything kept waits for its photo.
function keptWarning(out) {
  const kept = Array.isArray(out?.kept) ? out.kept.length : out?.kept;
  return kept ? { ...out, warning: `${kept} ${kept === 1 ? "entry was" : "entries were"} kept because ${kept === 1 ? "its photo" : "their photos"} couldn't be deleted. Erase again shortly.` } : out;
}

// A round's posts (UiiQ-platform #953): the call, the shortlist and the winner; only the last two name anyone.
const POST_STAGES = ["call", "shortlist", "winner"];
const NAMING_STAGES = ["shortlist", "winner"];

const ROUND_PROPS = {
  theme: { type: "string", description: "Up to 120 characters, e.g. \"Remembrance\"" },
  opensAt: { type: "string", description: "ISO date-time" },
  closesAt: { type: "string", description: "ISO date-time; after opensAt, at most 92 days later" },
  shortlistAt: { type: ["string", "null"], description: "ISO date-time the shortlist is announced" },
  winnerAt: { type: ["string", "null"], description: "ISO date-time the winner is announced" },
};

const COMPETITION_PROPS = {
  name: { type: "string" },
  slug: { type: "string", description: "Lower-case letters, numbers and hyphens, unique in the workspace" },
  type: { type: "string", enum: ["NOMINATION", "ENTRY"] },
  status: { type: "string", enum: ["DRAFT", "ACTIVE", "ARCHIVED"] },
  promoterName: { type: "string" },
  promoterAddress: { type: "string" },
  prizeDescription: { type: "string" },
  prizeValuePence: { type: ["number", "null"] },
  eligibility: { type: "string", description: "Who may enter, e.g. \"UK residents aged 18 or over\"" },
  rulesUrl: { type: ["string", "null"], description: "https" },
  // The forms' numbers are read from their links by UiiQ (UiiQ-platform #954): no separate number is sent.
  entryFormUrl: { type: ["string", "null"], description: "The entry IQForm's page, exactly https://www.iqex.co.uk/data?form-id=<number> (nothing else after the number); UiiQ reads the form's number from it and checks it's one of the workspace's own Public forms" },
  consentFormUrl: { type: ["string", "null"], description: "The nominee consent IQForm's page, in the same form as entryFormUrl" },
  criteria: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, weight: { type: "number" } } }, description: "Up to 10 judging criteria, each with a weight 1-100 (relative)" },
  judgeUserIds: { type: "array", items: { type: "string" }, description: "This workspace's people (uiiq_task_members); none = owners/admins judge" },
  socialAccountIds: { type: "array", items: { type: "string" }, description: "This workspace's social accounts the round's posts are for (uiiq_social_accounts)" },
  postTemplates: { type: "object", description: "{ call, shortlist, winner, delivery }: the wording of each of the round's posts. Placeholders: {competition} {round} {closes} {prize} {promoter} {eligibility} {link} {rules}" },
  entriesPerEmail: { type: "number", description: "1-20, per round" },
  retentionDays: { type: "number", description: "7-90" },
  // Prize codes (UiiQ-platform #966): a workspace given the competition_prizes feature only.
  prizeAction: { type: "string", enum: ["NONE", "COUPON"], description: "COUPON: Decide makes the winner's and runners-up' single-use codes on prizeSiteId through UiiQ Connect (4.51.0 or newer) and emails each to the nominator. Needs the workspace's competition_prizes feature" },
  prizeSiteId: { type: ["string", "null"], description: "The shop the codes are made on: an active site this workspace owns, with UiiQ Connect's Prize codes module" },
  prizeWinner: { type: ["object", "null"], description: "The winner's coupon: { percent 1-100, categoryIds, productIds (WooCommerce ids; at least one between them: never the whole shop), expiryDays 1-365 }" },
  prizeRunnerUp: { type: ["object", "null"], description: "Each runner-up's coupon, the same shape; null for none" },
};

// COMPETITIONS: a competition that runs in rounds (e.g. Ultimate Coins'
// "Coin of the Week"). Entries come in through an IQForm, judges score them
// against weighted criteria, and a judge decides each round after it closes.
// Mirrors the UIIQ /competitions API (UiiQ-platform #946). GATED: needs the
// `competitions` feature ticked for the workspace. Setting a competition up,
// its rounds, recording what a nominee agreed to, and erasure are an
// owner/admin's; entry status and notes are any staff login's; scoring and
// Decide are the competition's judges'. Deciding and erasing can't be undone,
// so each takes confirm: true after a dry run. Nothing here publishes a post.
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
      return call(tenant, `/competitions/${seg(id)}`);
    },
  },
  {
    name: "uiiq_competition_create",
    description: "A new competition, DRAFT unless status says otherwise (owner/admin). ACTIVE needs entryFormUrl, rulesUrl, promoterName, and for a NOMINATION consentFormUrl.",
    inputSchema: {
      type: "object",
      required: ["name", "slug"],
      properties: { ...COMPETITION_PROPS, tenant: TENANT_PROP },
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
      properties: { id: { type: "string" }, ...COMPETITION_PROPS, tenant: TENANT_PROP },
    },
    async handler({ id, tenant, ...body }) {
      return call(tenant, `/competitions/${seg(id)}`, send("PATCH", body));
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
      return call(tenant, `/competitions/${seg(id)}/rounds`, send("POST", body));
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
      return call(tenant, `/competitions/${seg(id)}/rounds/${seg(roundId)}`, send("PATCH", body));
    },
  },
  {
    name: "uiiq_competition_round_decide",
    description: "Decide a round after it closes: the winner and any runners-up (up to 10), from its confirmed entries that aren't rejected or withdrawn. Judges only (or owner/admin when none are named). Locks the round for good; the audit keeps who chose, when, and the scores. Without confirm: true it's a dry run that changes nothing.",
    inputSchema: {
      type: "object",
      required: ["id", "roundId", "winnerEntryId"],
      properties: {
        id: { type: "string" },
        roundId: { type: "string" },
        winnerEntryId: { type: "string" },
        runnerUpEntryIds: { type: "array", items: { type: "string" } },
        confirm: CONFIRM_PROP,
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, roundId, tenant, winnerEntryId, runnerUpEntryIds, confirm }) {
      const path = `/competitions/${seg(id)}/rounds/${seg(roundId)}/decide`;
      seg(winnerEntryId, "winnerEntryId");
      // A list, never a string: for…of would walk its letters, and UiiQ would
      // decide the round for good with no runners-up (Lucas, #97 L-a).
      if (runnerUpEntryIds !== undefined && !Array.isArray(runnerUpEntryIds)) throw new Error("runnerUpEntryIds must be a list of entry ids");
      for (const r of runnerUpEntryIds ?? []) seg(r, "runnerUpEntryIds");
      const body = { winnerEntryId, ...(runnerUpEntryIds ? { runnerUpEntryIds } : {}) };
      if (confirm !== true) return dryRun("decide_round", tenant, { competitionId: id, roundId, ...body }, "Deciding locks the round for good. Check the winner and runners-up with the judges.");
      return call(tenant, path, send("POST", body));
    },
  },
  {
    name: "uiiq_competition_post_draft",
    description: "A round's post as a DRAFT social post, or the one already drafted: never scheduled or published here. stage: call (the call to enter), shortlist (before Decide: only shortlisted nominees who agreed, by first name, never a photo, with the round's card for Instagram), winner (after Decide: named only as far as they agreed). Goes to the competition's social accounts. Returns { postId, created, warnings }; check it and schedule it in Social.",
    inputSchema: {
      type: "object",
      required: ["id", "roundId", "stage"],
      properties: {
        id: { type: "string" },
        roundId: { type: "string" },
        stage: { type: "string", enum: POST_STAGES },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, roundId, stage, tenant }) {
      if (!POST_STAGES.includes(stage)) throw new Error(`stage must be one of ${POST_STAGES.join(", ")}`);
      return call(tenant, `/competitions/${seg(id)}/rounds/${seg(roundId)}/posts/${seg(stage)}`, { method: "POST" });
    },
  },
  {
    name: "uiiq_competition_round_posts",
    description: "A round's posts in Social, by stage: each one's post id, status, when it's scheduled or went out, and any mark on it (to take down, or to check after an erasure). A marked post won't be sent.",
    inputSchema: {
      type: "object",
      required: ["id", "roundId"],
      properties: { id: { type: "string" }, roundId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, roundId, tenant }) {
      return call(tenant, `/competitions/${seg(id)}/rounds/${seg(roundId)}/posts`, { method: "GET" });
    },
  },
  {
    name: "uiiq_competition_post_taken_down",
    description: "Say a marked shortlist or winner post is dealt with: down on the platforms (or, for a post that couldn't be checked, checked). Clears its mark, audited. Owner/admin only: it is a statement that the post is gone. Without confirm: true it's a dry run that changes nothing.",
    inputSchema: {
      type: "object",
      required: ["id", "roundId", "stage"],
      properties: {
        id: { type: "string" },
        roundId: { type: "string" },
        stage: { type: "string", enum: NAMING_STAGES },
        confirm: CONFIRM_PROP,
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, roundId, stage, confirm, tenant }) {
      if (!NAMING_STAGES.includes(stage)) throw new Error(`stage must be one of ${NAMING_STAGES.join(", ")}`);
      const path = `/competitions/${seg(id)}/rounds/${seg(roundId)}/posts/${seg(stage)}`;
      if (confirm !== true) return dryRun("clear_post_mark", tenant, { competitionId: id, roundId, stage }, "Make sure the post is down on every platform it went to (or checked, if it couldn't be).");
      return call(tenant, path, send("PATCH", { takenDown: true }));
    },
  },
  {
    name: "uiiq_competition_entries",
    description: "A competition's entries, ranked by weighted score (earlier entry first on a tie): each one's id, round, nominee's first name, status, score, when it came in, and what may be published about its nominee. roundId and status narrow it. uiiq_competition_entry_get has one entry in full.",
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
      const q = new URLSearchParams({ ...(roundId ? { roundId: seg(roundId) } : {}), ...(status ? { status } : {}) }).toString();
      const path = `/competitions/${seg(id)}/entries`;
      const rows = await call(tenant, q ? `${path}?${q}` : path);
      // The list carries no entrant details, reasons or photo links (Lucas, uiiq-mcp #97 L3).
      return Array.isArray(rows)
        ? rows.map((e) => ({ id: e.id, roundId: e.roundId, nomineeFirstName: e.nomineeFirstName, status: e.status, weightedScore: e.weightedScore, receivedAt: e.receivedAt, publishable: e.publishable }))
        : rows;
    },
  },
  {
    name: "uiiq_competition_entry_get",
    description: "One entry: the entrant, the reason, the consents as ticked, the nominee's provisional answer and what was confirmed with them, the scores (photo as a 10-minute link).",
    inputSchema: { type: "object", required: ["entryId"], properties: { entryId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ entryId, tenant }) {
      return call(tenant, `/competitions/entries/${seg(entryId)}`);
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
      return call(tenant, `/competitions/entries/${seg(entryId)}`, send("PATCH", body));
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
      return call(tenant, `/competitions/entries/${seg(entryId)}/nominee-confirmation`, send("POST", body));
    },
  },
  {
    name: "uiiq_competition_prize_get",
    description: "A winner's or runner-up's prize code, when it was made and any failure (owner/admin; refused to read-only impersonation). Each look is recorded, without the code. Treat the code as a secret: it's already been emailed to the nominator.",
    inputSchema: { type: "object", required: ["entryId"], properties: { entryId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ entryId, tenant }) {
      return call(tenant, `/competitions/entries/${seg(entryId)}/prize`, { method: "GET" });
    },
  },
  {
    name: "uiiq_competition_prize_issue",
    description: "Make a winner's or runner-up's prize code now: after a failure, or one Decide had no time for (owner/admin). An entry that has its code is left as it is: nothing is made or emailed again. Returns { ok, existing, emailed }.",
    inputSchema: { type: "object", required: ["entryId"], properties: { entryId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ entryId, tenant }) {
      return call(tenant, `/competitions/entries/${seg(entryId)}/prize`, { method: "POST" });
    },
  },
  {
    name: "uiiq_competition_entry_erase",
    description: "Erase one entry for good, its photo included, e.g. when a nominee asks (owner/admin). Can't be undone; the audit keeps only that it happened. Without confirm: true it's a dry run that changes nothing.",
    inputSchema: { type: "object", required: ["entryId"], properties: { entryId: { type: "string" }, confirm: CONFIRM_PROP, tenant: TENANT_PROP } },
    async handler({ entryId, tenant, confirm }) {
      const path = `/competitions/entries/${seg(entryId)}`;
      if (confirm !== true) return dryRun("erase_entry", tenant, { entryId }, "Erasing can't be undone. Check it's the right entry (uiiq_competition_entry_get) and the right workspace.");
      return keptWarning(await call(tenant, path, { method: "DELETE" }));
    },
  },
  {
    name: "uiiq_competition_erase_address",
    description: "A person's erasure request: every entry their email address sent to this workspace's competitions, photos included (owner/admin). Can't be undone; the audit keeps the address only as a hash. Returns { erased, photosDeleted, kept }; an entry whose photo couldn't be deleted is kept, and erasing again takes it. Without confirm: true it's a dry run that changes nothing.",
    inputSchema: { type: "object", required: ["email"], properties: { email: { type: "string" }, confirm: CONFIRM_PROP, tenant: TENANT_PROP } },
    async handler({ email, tenant, confirm }) {
      if (confirm !== true) return dryRun("erase_address", tenant, { email }, "Erasing can't be undone. Check the address and the workspace with the person who asked.");
      return keptWarning(await call(tenant, "/competitions/erase", send("POST", { email })));
    },
  },
];
