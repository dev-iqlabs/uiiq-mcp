import { apiClient } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

async function fail(res) {
  const text = await res.text();
  try { const j = JSON.parse(text); if (j?.error) return new Error(j.error); } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}
const send = (tenant, method, path, body) => api(tenant)(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
const post = (tenant, path, body) => send(tenant, "POST", path, body);

// CLASSES — the dance-school / classes sector: classes, terms and course runs,
// session cover/cancellation, parent notices, the policies parents
// acknowledge, the family registration form's settings and the register
// settings. No feature flag on these routes; the register-settings PATCH and
// parent-policies PUT are OWNER/ADMIN only.
//
// Children's records aren't available from the MCP (Steve, 22 Oct 2026, from
// Kim's DPIA, DPA 6.6: no AI session reads children's records): enrolments,
// parents' enrolments, the registers (marks, payments, stars, costumes, scan
// check-in, check-in cards), attendance reports, absences, a session's
// audience and costume refunds are used in the UiiQ dashboard in a browser,
// and so is picking a class photo (children may be identifiable in it).
// uiiq_classes_get leaves the class's roster out. test/no-child-records keeps
// it that way.

const CLASS_FIELDS = {
  name: { type: "string" },
  description: { type: "string" },
  dayOfWeek: { type: "number", description: "0 (Sunday) to 6 (Saturday)" },
  startTime: { type: "string", description: "HH:MM" },
  durationMins: { type: "number" },
  capacity: { type: "number" },
  level: { type: "string" },
  ageMin: { type: "number" },
  ageMax: { type: "number" },
  staffMemberId: { type: "string", description: "Lead teacher (staff member id)" },
  teachers: { type: "array", description: "Extra teachers: [{ staffMemberId, role }]", items: { type: "object", properties: { staffMemberId: { type: "string" }, role: { type: "string" } } } },
  instructorResourceId: { type: "string", description: "Bookings resource acting as instructor" },
  venueId: { type: "string" },
  showEventId: { type: "string", description: "The show (event) this class performs in" },
  published: { type: "boolean", description: "On the public timetable (default true)" },
  scheduleType: { type: "string", enum: ["TERM", "ROLLING"], description: "Default ROLLING" },
  dropInPricePence: { type: "number" },
  termFeePence: { type: "number" },
  instalmentsAllowed: { type: "boolean" },
  signOutRequired: { type: "boolean", description: "A second scan at the end records the child leaving" },
  byAudition: { type: "boolean", description: "By audition: parents can't enrol in the Members App, which says \"By audition, please contact us\" instead (default false). Owner or admin only to change (403 otherwise). Kept as it is when omitted." },
  runsFrom: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD: a class that runs only between dates (a holiday club, a one-off day). With runsUntil; both null = every week. The public timetable shows the dates and drops it after runsUntil. Kept as it is when omitted." },
  runsUntil: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD, on or after runsFrom: the last date it runs. Kept as it is when omitted." },
  bookingNote: { type: ["string", "null"], maxLength: 120, description: "Booked elsewhere, e.g. 'Book via EEQU' (at most 120 characters): shown publicly instead of the enrol link, so level can hold real levels. Kept as it is when omitted." },
  bookingUrl: { type: ["string", "null"], pattern: "^(https://|$)", maxLength: 500, description: "https link for the booking note. Kept as it is when omitted. With bookingNote, owner or admin only to change (403 otherwise): it replaces the public enrol link." },
  coveredByPlanIds: { type: "array", items: { type: "string" }, description: "MembershipPlan ids whose members attend on their plan" },
  coverSlots: { type: "integer", minimum: 1, maximum: 14, description: "How many of a weekly plan's slots one session uses (default 1): 2 for a double-length class, so it counts as two classes on a 'N classes a week' plan. Owner or admin only to change (403 otherwise). Kept as it is when omitted. Raising coverSlots can put existing 1-a-week members over their weekly limit; check atRisk." },
  planCover: { type: "string", enum: ["AUTO", "COVERED", "NOT_COVERED"], description: "Covered by weekly plans (Steve, 19 Oct 2026). AUTO (the default): covered when the class is the workspace's own (academy), not when it is run for or billed through a sister organisation (college). COVERED / NOT_COVERED override that either way. A class that isn't covered is covered by no plan, listed ones included, and doesn't count towards a plan's classes a week; a free (funded) class is never covered and can't be set to COVERED. Owner or admin only to change (403 otherwise). Kept as it is when omitted." },
  active: { type: "boolean" },
};
const CLASS_REQUIRED = ["name", "dayOfWeek", "startTime", "durationMins", "capacity"];

// The class photo: children may be identifiable in it, and picking one means
// confirming every one of their parents agreed, so it is the dashboard's, never
// an AI session's (Steve, 22 Oct 2026). Refused here before any request; an
// omitted photo is kept as it is.
const NO_CLASS_PHOTO =
  "Class photos aren't available from the MCP: children may be identifiable in them (Steve, 22 Oct 2026: no AI session handles children's records). Pick, replace or remove the photo in the UiiQ dashboard in a browser. Nothing was sent.";
function noClassPhoto(body) {
  if (body.imageMediaId !== undefined || body.photoPermissionConfirmed !== undefined) throw new Error(NO_CLASS_PHOTO);
}

export const classesTools = [
  // ── Classes ──
  {
    name: "uiiq_classes_list",
    description: "List the school's classes (active only unless includeInactive) with teachers, venue, show, schedule type, prices and the active-enrolment count. Each has planCover (AUTO | COVERED | NOT_COVERED) and coveredByWeeklyPlans: whether weekly membership plans cover it.",
    inputSchema: { type: "object", properties: { includeInactive: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ includeInactive, tenant } = {}) {
      const qs = includeInactive ? "?includeInactive=1" : "";
      const res = await api(tenant)(`/classes${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_get",
    description: "One class: editor fields, every teacher and its course runs, without the roster: children's records aren't available from the MCP (Steve, 22 Oct 2026: no AI session reads children's records), so the answer carries rosterCount (how many are on it) and rosterOmitted: true instead; the roster itself is in the UiiQ dashboard. coverSlots is how many of a weekly plan's slots one session uses (coverSlotsNote 'uses 2 slots' when more than one); canSetCoverSlots says whether you may change it. fundingMode (NONE | FREE | SUBSIDISED) and funding ('Funded, free' / 'Funded, subsidised' / null) say whether it is run for a sister organisation and whether families pay; set with uiiq_classes_billing_set. planCover (AUTO | COVERED | NOT_COVERED) is the 'Covered by weekly plans' setting, coveredByWeeklyPlans what it comes to, planCoverAutomatic what AUTO would be, and organisation { id, name, sister } the organisation the class belongs to (the workspace's own, or the sister it is run for or billed through).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/classes/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      // The roster (children's names and their guardians) never reaches the model: only how many are on it.
      const { roster, ...cls } = await res.json();
      return { ...cls, rosterCount: Array.isArray(roster) ? roster.length : 0, rosterOmitted: true };
    },
  },
  {
    name: "uiiq_classes_plan_cover_impact",
    description: "Who changes with 'Covered by weekly plans' (read-only): the classes weekly plans covered under the rule before planCover and don't now, with today's settings. Returns { classes: [{ classId, className, organisation { id, name, sister }, planCover, scheduleType, dropInPricePence, affectedFamilies }] }: affectedFamilies is how many families on plans it leaves paying at the register (a family on plans in two of them counts in each); dropInPricePence is what the register collects per session from a family on a plan once the class isn't covered (null = none set, so NOTHING is collected: set one on the class before turning cover off); scheduleType is TERM or ROLLING (a TERM class's families stay on their plan, with no term fee, until they are enrolled again). Class and organisation names and counts only, never a family's or child's name. An empty list means nothing changed for anyone. Owner or admin only (403 otherwise).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/classes/plan-cover/impact");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_create",
    description: "Create a class. Requires name, dayOfWeek (0-6), startTime (HH:MM), durationMins and capacity; the slug is generated from the name. Linked ids (staffMemberId, venueId, showEventId, instructorResourceId) must belong to the tenant. Prices (dropInPricePence, termFeePence), coveredByPlanIds, coverSlots above 1 and a planCover other than AUTO need an owner or admin (403). The class photo is picked in the UiiQ dashboard, not here (children may be identifiable in it).",
    inputSchema: { type: "object", required: CLASS_REQUIRED, properties: { ...CLASS_FIELDS, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      noClassPhoto(body);
      const res = await post(tenant, "/classes", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_update",
    description: "Replace a class's details. NOT a partial update: the API validates the full class, so send every field you want kept (name, dayOfWeek, startTime, durationMins, capacity are required; an omitted staffMemberId/venueId is reset to empty). Teachers are only rewritten when `teachers` is sent. The owner/admin settings (dropInPricePence, termFeePence, coveredByPlanIds, coverSlots, planCover) are kept as they are when omitted, and changing any of them needs an owner or admin (403). Raising coverSlots can put existing 1-a-week members over their weekly limit; check atRisk. When a coverSlots change would newly put families on plans over their weekly classes, the API answers 409 { needsConfirmation: true, atRisk, error } and saves NOTHING. Only resend confirmAtRisk after the user explicitly agrees, and send the COUNT the 409 gave (confirmAtRisk: <n>): if more families are at risk by then, the API asks again. The answer's atRisk says how many families it put over. Turning planCover so the class is no longer covered by weekly plans leaves the families on plans in it paying at the register: the API answers 409 { needsConfirmation: true, affected, confirmCoverChange, error } and saves NOTHING. Only resend confirmCoverChange after the user explicitly agrees, with the COUNT the 409 gave (confirmCoverChange: <n>); the API asks again if more by then. The answer's affected says how many families it left paying at the register. The class photo is kept as it is: picking, replacing or removing it is done in the UiiQ dashboard (children may be identifiable in it).",
    inputSchema: { type: "object", required: ["id", ...CLASS_REQUIRED], properties: { id: { type: "string" }, ...CLASS_FIELDS, confirmAtRisk: { type: "integer", minimum: 0, description: "The atRisk count the user agreed to (from the 409): save the coverSlots change even though it puts that many families on plans over their weekly classes. Never send it without the user's explicit agreement." }, confirmCoverChange: { type: "integer", minimum: 0, description: "The affected count the user agreed to (from the 409): save the planCover change even though it leaves that many families on plans paying at the register. Never send it without the user's explicit agreement." }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      noClassPhoto(body);
      const res = await send(tenant, "PATCH", `/classes/${encodeURIComponent(id)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_billing_set",
    description: "Owner or admin only: a class's billing (UiiQ-platform sister organisations 3/7, 4/7 and 3d). runForBillingOrganisationId: null = the workspace's own class, or one of its SISTER organisations (funded). fundingMode says what funded means (Steve, 13 Oct 2026): FREE = nobody pays (plans don't cover it; switching clears its term fee, drop-in price, instalments, plan cover and Billed through); SUBSIDISED = families pay the class fee, taken by the organisation running it (its Billed through follows its Run for; only plans billed through that organisation cover it). Run for a sister without fundingMode = FREE, as before; NONE only with runForBillingOrganisationId null. billingOrganisationId: what a PAID class of the workspace's own is BILLED THROUGH (whose Stripe takes its term fees, instalments and balances), null = the workspace's own or a sister; refused on a funded class (400: a free one takes nothing, a subsidised one's follows Run for); a plan only covers classes billed through the same organisation. REFUSED (409, with the paying families) while families pay for it: making it free, and any change to the organisation its fees go to (Billed through, or a subsidised class's Run for). costumePricePence / costumePayBy (YYYY-MM-DD): this routine's costume price and pay-by date, overriding its show's. Without confirm: true it is ALWAYS a dry run that changes nothing. Acts in your own signed-in workspace (no tenant: changes are refused while impersonating).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        runForBillingOrganisationId: { type: ["string", "null"] },
        fundingMode: { type: "string", enum: ["NONE", "FREE", "SUBSIDISED"], description: "What funded means for a class run for a sister: FREE = nobody pays; SUBSIDISED = families pay the class fee, taken by the organisation running it. NONE only with runForBillingOrganisationId null." },
        billingOrganisationId: { type: ["string", "null"], description: "Billed through, for a paid class: null = the workspace's own, or a sister's id" },
        costumePricePence: { type: ["integer", "null"] },
        costumePayBy: { type: ["string", "null"] },
        confirm: { type: "boolean", description: "true = do it; omit for the dry run" },
      },
    },
    async handler({ id, confirm, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (!Object.keys(body).length) throw new Error("Send runForBillingOrganisationId, fundingMode, billingOrganisationId, costumePricePence or costumePayBy");
      if (confirm !== true) return { dryRun: true, changed: false, wouldDo: "set_class_billing", id, ...body, note: "Nothing was changed. Check this with the workspace owner, then call again with confirm: true." };
      const res = await send(undefined, "PATCH", `/classes/${encodeURIComponent(id)}/billing`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_delete",
    description: "DELETE a class outright. Refused (409) when it has any enrolments — set active=false with uiiq_classes_update instead so history is kept.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, "DELETE", `/classes/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Terms ──
  {
    name: "uiiq_classes_terms_list",
    description: "The school's terms (newest first) with dates, excluded dates and how many course runs each has.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/classes/terms");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_term_create",
    description: "Create a term: name, startDate and endDate (YYYY-MM-DD), optional excludedDates (half-term etc.) and active.",
    inputSchema: { type: "object", required: ["name", "startDate", "endDate"], properties: { name: { type: "string" }, startDate: { type: "string" }, endDate: { type: "string" }, excludedDates: { type: "array", items: { type: "string" } }, active: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/classes/terms", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_term_update",
    description: "Replace a term's name, dates, excluded dates and active flag (all of name/startDate/endDate are required — this is a full replace).",
    inputSchema: { type: "object", required: ["id", "name", "startDate", "endDate"], properties: { id: { type: "string" }, name: { type: "string" }, startDate: { type: "string" }, endDate: { type: "string" }, excludedDates: { type: "array", items: { type: "string" } }, active: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, "PATCH", `/classes/terms/${encodeURIComponent(id)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_term_delete",
    description: "DELETE a term. Refused (409) while it has course runs — delete those first or mark the term inactive.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, "DELETE", `/classes/terms/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Course runs (a TERM class × a term) ──
  {
    name: "uiiq_classes_runs_list",
    description: "Course runs (a TERM class running in a term), optionally filtered by classId and/or termId, with fee, session dates, capacity, status and active enrolments.",
    inputSchema: { type: "object", properties: { classId: { type: "string" }, termId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ classId, termId, tenant } = {}) {
      const params = new URLSearchParams();
      if (classId) params.set("classId", classId);
      if (termId) params.set("termId", termId);
      const qs = params.toString() ? `?${params}` : "";
      const res = await api(tenant)(`/classes/course-runs${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_run_create",
    description: "Create a course run for a TERM class in a term. sessionDates defaults to weekly dates on the class's day within the term minus the term's excluded dates; feePence defaults to the class term fee; status defaults to OPEN. 409 if the class already has a run for that term.",
    inputSchema: { type: "object", required: ["classId", "termId"], properties: { classId: { type: "string" }, termId: { type: "string" }, feePence: { type: "number" }, sessionDates: { type: "array", items: { type: "string" }, description: "YYYY-MM-DD list; omit to generate" }, capacity: { type: "number", description: "Overrides the class capacity for this run" }, status: { type: "string", enum: ["PLANNED", "OPEN", "RUNNING", "COMPLETED"] }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/classes/course-runs", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_run_update",
    description: "Update a course run's feePence, sessionDates, capacity (null = use the class's) or status. Send at least one.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, feePence: { type: "number" }, sessionDates: { type: "array", items: { type: "string" } }, capacity: { type: ["number", "null"] }, status: { type: "string", enum: ["PLANNED", "OPEN", "RUNNING", "COMPLETED"] }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, "PATCH", `/classes/course-runs/${encodeURIComponent(id)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_run_delete",
    description: "DELETE a course run. Refused (409) when it has enrolments — set its status to COMPLETED instead.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, "DELETE", `/classes/course-runs/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Session overrides: cancel / cover / move one dated session ──
  {
    name: "uiiq_classes_session_overrides",
    description: "Dated changes to sessions (CANCELLED / COVERED / MOVED): by classId and/or a from-to window, or every class's changes on one date (the register's view).",
    inputSchema: { type: "object", properties: { classId: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD — one day, every class" }, from: { type: "string" }, to: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ classId, date, from, to, tenant } = {}) {
      const params = new URLSearchParams();
      if (classId) params.set("classId", classId);
      if (date) params.set("date", date);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString() ? `?${params}` : "";
      const res = await api(tenant)(`/classes/sessions${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_session_override",
    description: "Cancel, arrange cover for, or move ONE session of a class on a date — and TELL PEOPLE: unless notifyParents=false this messages every household in the class and the covering teacher (email/SMS through the tenant's comms; suppressed pre-launch, in which case the reply says so). COVERED needs coveringStaffMemberId. The class must actually run on that date. Re-posting the same class+date replaces the earlier change.",
    inputSchema: { type: "object", required: ["classId", "date", "status"], properties: { classId: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" }, status: { type: "string", enum: ["CANCELLED", "COVERED", "MOVED"] }, coveringStaffMemberId: { type: "string" }, venueId: { type: "string", description: "New room (COVERED/MOVED)" }, startTime: { type: "string", description: "New HH:MM (COVERED/MOVED)" }, durationMins: { type: "number" }, reason: { type: "string", description: "Up to 500 chars, shown to parents" }, notifyParents: { type: "boolean", description: "Default true" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/classes/sessions", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_session_restore",
    description: "Remove the dated change for a class on a date, putting the ordinary session back. Nobody is messaged — if families were already told, post a fresh override or a notice.",
    inputSchema: { type: "object", required: ["classId", "date"], properties: { classId: { type: "string" }, date: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ classId, date, tenant }) {
      const qs = `?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`;
      const res = await send(tenant, "DELETE", `/classes/sessions${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Parent notices (family portal) ──
  {
    name: "uiiq_classes_notices_list",
    description: "Parent notices (drafts and published, newest first) with their audience, plus the classes and group labels available to address one to.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/classes/notices");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_notice_create",
    description: "Create a parent notice for an audience ({ classIds, groups, all } — at least one). publishedAt null = draft; setting it PUBLISHES the notice to every matching guardian's family portal until expiresAt. No email or SMS is sent.",
    inputSchema: { type: "object", required: ["title", "body", "audience"], properties: { title: { type: "string", description: "Up to 200 chars" }, body: { type: "string", description: "Up to 10,000 chars" }, audience: { type: "object", properties: { classIds: { type: "array", items: { type: "string" } }, groups: { type: "array", items: { type: "string" } }, all: { type: "boolean" } } }, publishedAt: { type: ["string", "null"], description: "ISO datetime; omit for a draft" }, expiresAt: { type: ["string", "null"] }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/classes/notices", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_notice_update",
    description: "Replace a notice's title, body, audience, publishedAt and expiresAt (full replace — all of title/body/audience are required). Setting publishedAt publishes it.",
    inputSchema: { type: "object", required: ["id", "title", "body", "audience"], properties: { id: { type: "string" }, title: { type: "string" }, body: { type: "string" }, audience: { type: "object", properties: { classIds: { type: "array", items: { type: "string" } }, groups: { type: "array", items: { type: "string" } }, all: { type: "boolean" } } }, publishedAt: { type: ["string", "null"] }, expiresAt: { type: ["string", "null"] }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await send(tenant, "PATCH", "/classes/notices", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_notice_delete",
    description: "DELETE a parent notice (it disappears from every family portal at once).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, "DELETE", `/classes/notices?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Parent policies ──
  {
    name: "uiiq_classes_policies_get",
    description: "The policies guardians are asked to acknowledge in the family portal (key, title, version, url, documentId) with how many have acknowledged each at its current version, and the list's revision (send it back with uiiq_classes_policies_set).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/classes/parent-policies");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_policies_set",
    description: "Replace the WHOLE parent-policy list (max 25; each needs a unique key and a title; url must be https://). A policy's document is a link (url) or a Document Vault file (documentId, from uiiq_document_list; it must be this workspace's): a vault file is served only to signed-in guardians, by a short-lived link. OWNER/ADMIN only. Bumping a policy's version re-raises the banner for every guardian until they acknowledge again — old acknowledgements stay on file. A policy left out of the list is removed; its acknowledgements stay on file. A version guardians already confirmed is refused (409), and so is a new link or vault file under such a version: on a 409, give the policy a NEW version; set reuseVersion only when the admin confirms the text is unchanged (it is audited). Replacing a linked vault file (uiiq_document_replace) re-asks too: it bumps the policy's version unless keepVersion is set. Send revision (from uiiq_classes_policies_get): a list parents have confirmed is refused without it, and a list changed since you read it is a 409 (read it again).",
    inputSchema: { type: "object", additionalProperties: false, required: ["policies"], properties: { policies: { type: "array", items: { type: "object", required: ["key", "title"], properties: { key: { type: "string" }, title: { type: "string" }, version: { type: "string", description: "Default \"1\"" }, url: { type: "string" }, documentId: { type: ["string", "null"], description: "A Document Vault document id; wins over url" } } } }, revision: { type: "string", description: "The revision uiiq_classes_policies_get returned: refused (409) if the list changed since. Required once parents have confirmed any policy." }, reuseVersion: { type: "boolean", description: "Only when the admin confirms the policy text is unchanged: earlier confirmations then cover the current link/file. On a 409, choose a new version instead. Audited. Default false." }, tenant: TENANT_PROP } },
    async handler({ policies, revision, reuseVersion, tenant }) {
      const res = await send(tenant, "PUT", "/classes/parent-policies", {
        policies,
        ...(typeof revision === "string" ? { revision } : {}),
        ...(reuseVersion === true ? { reuseVersion: true } : {}),
      });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Family registration form ──
  {
    name: "uiiq_classes_registration_form_get",
    description: "The school's public \"Register your family\" IQForm, which the Register button on the class enrol pages opens, and whether children parents add are approved automatically: { enabled, iqformId, url, autoApprove }. enabled=false (and nothing else) when the workspace doesn't have family registration switched on. iqformId and url are null until one is set. Any signed-in user of the workspace.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/classes/registration-form");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_registration_form_set",
    description: "Set or clear the school's public \"Register your family\" IQForm, and/or whether children parents add are approved automatically. ref is the IQForm's id or a link with form-id= in it; it must exist, be Public and belong to the venue's own IQEX org (400 with the reason otherwise). ref null or \"\" clears it, which takes the Register button off the enrol pages. autoApprove true = a child a signed-in parent adds in the Members App goes on the roll at once, BEFORE the office has checked them (the office is emailed and keeps or removes it in the UiiQ dashboard's Awaiting check); false (the default) = each child waits for the office to approve it. Turning it on changes the school's safeguarding: only send autoApprove true after the owner has explicitly agreed to it. Each is changed only when sent; send at least one. Returns { ok, iqformId, title, url, autoApprove }. Children registered through it are listed under uiiq_students_registrations_list. OWNER/ADMIN only; 404 unless the workspace has family registration switched on.",
    inputSchema: { type: "object", properties: { ref: { type: ["string", "number", "null"], description: "IQForm id or link with form-id=; null or \"\" clears it; omit to leave it" }, autoApprove: { type: "boolean", description: "Approve children parents add automatically; omit to leave it" }, tenant: TENANT_PROP } },
    async handler({ ref, autoApprove, tenant } = {}) {
      if (ref === undefined && autoApprove === undefined) throw new Error("Send ref, autoApprove or both");
      const body = { ...(ref !== undefined ? { ref } : {}), ...(autoApprove !== undefined ? { autoApprove } : {}) };
      const res = await send(tenant, "PUT", "/classes/registration-form", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Register settings (the registers themselves list children: not here) ──
  {
    name: "uiiq_classes_register_settings",
    description: "The register-hook settings: lapseWeeks, arrearsGraceDays, lowAttendancePct, lateGraceMins; ageBands (the timetable's age groups); timetablePageUrl (the timetable page on the school's website, where a class page's \"Back to timetable\" goes when the visitor didn't come from the timetable; null when none is set: \"Back to website\"). With student absences switched on, also absenceApprovalRequired (\"Parents' time-off requests need approval\", default false: a parent's time off is approved at once; true: it waits for an owner or admin). The key is absent when student absences are off.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/classes/registers/settings");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_register_settings_set",
    description: "Update any of lapseWeeks (1-52), arrearsGraceDays (0-90), lowAttendancePct (1-100), lateGraceMins (0-120), and, only while student absences are switched on, absenceApprovalRequired (true = parents' time-off requests wait for approval; false = approved at once; illness never waits; the change is audited), and timetablePageUrl (the timetable page on the school's website, e.g. https://sbda.online/timetable/; null or \"\" clears it; audited). OWNER/ADMIN only.",
    inputSchema: {
      type: "object",
      properties: {
        lapseWeeks: { type: "number" }, arrearsGraceDays: { type: "number" }, lowAttendancePct: { type: "number" }, lateGraceMins: { type: "number" },
        absenceApprovalRequired: { type: "boolean", description: "Student absences on only: parents' time-off requests need approval" },
        timetablePageUrl: { type: ["string", "null"], description: "The timetable page on the school's website: where a class page's \"Back to timetable\" goes when the visitor didn't come from the timetable (a shared link, the app, a search result). Must be an https page on the workspace's current website or a subdomain of it (www either way), else 400 \"The timetable page must be on your website (<host>)\". null or \"\" clears it (back to \"Back to website\"). Kept as it is when omitted." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await send(tenant, "PATCH", "/classes/registers/settings", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
