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
// enrolments (with payment modes), the day's registers (marks, payments,
// stars, costumes, scan check-in), session cover/cancellation, parent notices
// and the policies parents acknowledge. No feature flag on these routes; the
// register-settings PATCH and parent-policies PUT are OWNER/ADMIN only, and
// the scan-cards sheet is OWNER/ADMIN because it hands out live check-in QRs.
// Registers and enrolments return names + paid state only — medical and
// emergency data lives on the student record (students.js).

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
  coveredByPlanIds: { type: "array", items: { type: "string" }, description: "MembershipPlan ids whose members attend on their plan" },
  active: { type: "boolean" },
};
const CLASS_REQUIRED = ["name", "dayOfWeek", "startTime", "durationMins", "capacity"];

export const classesTools = [
  // ── Classes ──
  {
    name: "uiiq_classes_list",
    description: "List the school's classes (active only unless includeInactive) with teachers, venue, show, schedule type, prices and the active-enrolment count.",
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
    description: "One class in full: editor fields, every teacher, its course runs, and the roster (enrolments with student names, guardian, fee/paid/owed). No medical data.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/classes/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_create",
    description: "Create a class. Requires name, dayOfWeek (0-6), startTime (HH:MM), durationMins and capacity; the slug is generated from the name. Linked ids (staffMemberId, venueId, showEventId, instructorResourceId) must belong to the tenant.",
    inputSchema: { type: "object", required: CLASS_REQUIRED, properties: { ...CLASS_FIELDS, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/classes", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_update",
    description: "Replace a class's details. NOT a partial update: the API validates the full class, so send every field you want kept (name, dayOfWeek, startTime, durationMins, capacity are required; an omitted staffMemberId/venueId/price is reset to empty). Teachers are only rewritten when `teachers` is sent.",
    inputSchema: { type: "object", required: ["id", ...CLASS_REQUIRED], properties: { id: { type: "string" }, ...CLASS_FIELDS, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, "PATCH", `/classes/${encodeURIComponent(id)}`, body);
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
  {
    name: "uiiq_classes_session_audience",
    description: "Who a message about a class would reach (one row per household, children named, unsubscribed/archived dropped), plus the staff who could cover and the rooms available. Preview before uiiq_classes_session_override.",
    inputSchema: { type: "object", required: ["classId"], properties: { classId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ classId, tenant }) {
      const res = await api(tenant)(`/classes/sessions/audience?classId=${encodeURIComponent(classId)}`);
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
    description: "The policies guardians are asked to acknowledge in the family portal (key, title, version, url) with how many have acknowledged each at its current version.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/classes/parent-policies");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_policies_set",
    description: "Replace the WHOLE parent-policy list (max 25; each needs a unique key and a title; url must be https://). OWNER/ADMIN only. Bumping a policy's version re-raises the banner for every guardian until they acknowledge again — old acknowledgements stay on file.",
    inputSchema: { type: "object", required: ["policies"], properties: { policies: { type: "array", items: { type: "object", required: ["key", "title"], properties: { key: { type: "string" }, title: { type: "string" }, version: { type: "string", description: "Default \"1\"" }, url: { type: "string" } } } }, tenant: TENANT_PROP } },
    async handler({ policies, tenant }) {
      const res = await send(tenant, "PUT", "/classes/parent-policies", { policies });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Enrolments ──
  {
    name: "uiiq_classes_enrolments_list",
    description: "Enrolments (newest first), filtered by classId and/or studentId: student and class names, term, status, payment mode, fee/paid/owed and instalment arrears.",
    inputSchema: { type: "object", properties: { classId: { type: "string" }, studentId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ classId, studentId, tenant } = {}) {
      const params = new URLSearchParams();
      if (classId) params.set("classId", classId);
      if (studentId) params.set("studentId", studentId);
      const qs = params.toString() ? `?${params}` : "";
      const res = await api(tenant)(`/classes/enrolments${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_enrolment_get",
    description: "One enrolment with its payment ledger (amount, method, till sale, date).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/classes/enrolments/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_enrol",
    description: "Enrol a student in a class. paymentMode UPFRONT | DROP_IN | INSTALMENTS | PLAN. TERM classes need courseRunId (except DROP_IN). Full class → 409 with full:true; retry with waitlist=true to WAITLIST. TAKES MONEY when asked: `payment` {method CASH|CARD, amountPence?} raises a till sale (UPFRONT only); INSTALMENTS (2-12, class must allow them, Stripe connected) returns a Stripe Checkout URL for the guardian; PLAN needs the guardian's ACTIVE membershipId whose plan covers the class.",
    inputSchema: { type: "object", required: ["studentId", "classId", "paymentMode"], properties: { studentId: { type: "string" }, classId: { type: "string" }, courseRunId: { type: "string" }, paymentMode: { type: "string", enum: ["UPFRONT", "DROP_IN", "INSTALMENTS", "PLAN"] }, feePence: { type: "number", description: "Defaults to the run/class fee (0 for DROP_IN)" }, startDate: { type: "string", description: "YYYY-MM-DD, default today" }, waitlist: { type: "boolean" }, payment: { type: "object", properties: { method: { type: "string", enum: ["CASH", "CARD"] }, amountPence: { type: "number" } } }, instalmentCount: { type: "number" }, membershipId: { type: "string" }, notes: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/classes/enrolments", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_enrolment_update",
    description: "Change an enrolment's status (TRIAL | ACTIVE | WAITLIST | CANCELLED | COMPLETED — activating re-checks capacity; CANCELLED keeps the ledger), feePence or notes. Send at least one.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, status: { type: "string", enum: ["TRIAL", "ACTIVE", "WAITLIST", "CANCELLED", "COMPLETED"] }, feePence: { type: "number" }, notes: { type: ["string", "null"] }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, "PATCH", `/classes/enrolments/${encodeURIComponent(id)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_enrolment_instalment_link",
    description: "Regenerate the Stripe Checkout link for an ACTIVE INSTALMENTS enrolment whose guardian never completed checkout. Refused (409) once billing has started (a subscription or Stripe payment exists) — take any balance at the register instead. Creates a Stripe Checkout session on the tenant's Connect account.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await post(tenant, `/classes/enrolments/${encodeURIComponent(id)}/instalment-link`, {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_enrolment_plan_options",
    description: "The student's guardian's ACTIVE memberships, each flagged with whether its plan covers the class — what to pass as membershipId for a PLAN enrolment.",
    inputSchema: { type: "object", required: ["studentId", "classId"], properties: { studentId: { type: "string" }, classId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ studentId, classId, tenant }) {
      const qs = `?studentId=${encodeURIComponent(studentId)}&classId=${encodeURIComponent(classId)}`;
      const res = await api(tenant)(`/classes/enrolments/plan-options${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Registers ──
  {
    name: "uiiq_classes_register_day",
    description: "The day's registers (default today): every class running on that date with its students, attendance marks, check-in/out times, paid chip (PAID / OWES / DROP_IN_DUE / PLAN / PLAN_OVER / ARREARS …), stars and costume ticks; cancelled sessions listed separately. Names + paid state only. With student absences switched on (absencesEnabled: true), each child with a known absence covering the session carries `absence` (linked = their Absent mark belongs to it). Its kind, label (such as \"Holiday\" or \"Ill (reported)\") and note go only to owners/admins, that class's own teachers and whoever covers the session; anyone else sees the neutral \"Away (known)\" (kind ABSENCE) and nothing about why. Each class says canMarkIll: whether you may mark ILL there on that date.",
    inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" }, tenant: TENANT_PROP } },
    async handler({ date, tenant } = {}) {
      const qs = date ? `?date=${encodeURIComponent(date)}` : "";
      const res = await api(tenant)(`/classes/registers${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_register_students",
    description: "Names-only student search (id, name, guardian name; max 20) for adding a walk-in to a register. Open to every staff user, unlike uiiq_students_list.",
    inputSchema: { type: "object", properties: { q: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ q, tenant } = {}) {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await api(tenant)(`/classes/registers/students${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_register_mark",
    description: "Mark a student PRESENT, ABSENT or LATE for a class on a date. walkIn=true enrols an unenrolled student as DROP_IN first. A mark that CHANGES to ABSENT or LATE fires the tenant's attendance automations on the guardian (may message them). 409 on a cancelled session. With student absences switched on: ILL is accepted too — stored as ABSENT, linked to a one-day ILLNESS absence (or one already covering the day), and it sends no \"Missed class\" message; instead a new ILL mark fires the tenant's \"absence_marked_ill\" automation (a neutral \"noted as unwell\" notice; its template ships as a draft). ILL is only for that class's teachers, whoever covers the session, and owners/admins (403 otherwise: mark ABSENT instead), only for a child on the class's register (an ACTIVE/TRIAL enrolment or a mark already saved), and only for today or earlier (UK). An ABSENT inside a recorded absence is linked the same way and sends no \"Missed class\" either. Changing an ILL mark to anything else removes the illness that tap made (only that one; an absence recorded elsewhere is just unlinked). The reply then carries absenceId.",
    inputSchema: { type: "object", required: ["classId", "studentId", "sessionDate", "status"], properties: { classId: { type: "string" }, studentId: { type: "string" }, sessionDate: { type: "string", description: "YYYY-MM-DD" }, status: { type: "string", enum: ["PRESENT", "ABSENT", "LATE", "ILL"], description: "ILL only when student absences are switched on (400 otherwise), by the class's teachers, cover or owners/admins (403 otherwise)" }, walkIn: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/classes/registers/attendance", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_register_payment",
    description: "TAKE A PAYMENT at the register against an enrolment (drop-in fee, plan excess or owed balance): raises a CASH/CARD till sale so it lands in daily takings, records it on the ledger, and with sessionDate stamps that day's attendance as paid (creating a PRESENT mark if none).",
    inputSchema: { type: "object", required: ["enrolmentId", "amountPence", "method"], properties: { enrolmentId: { type: "string" }, amountPence: { type: "number" }, method: { type: "string", enum: ["CASH", "CARD"] }, sessionDate: { type: "string", description: "YYYY-MM-DD" }, note: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/classes/registers/payment", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_register_star",
    description: "Toggle a star for a student in a class on a date (calling again removes it; the reply says starred true/false). Giving one fires the student_star_given automation on the guardian.",
    inputSchema: { type: "object", required: ["classId", "studentId", "sessionDate"], properties: { classId: { type: "string" }, studentId: { type: "string" }, sessionDate: { type: "string" }, note: { type: "string", description: "Up to 500 chars" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/classes/registers/star", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_register_costume",
    description: "Tick a student's costume for a show as handedOut and/or paid (send at least one). Stamped with who did it.",
    inputSchema: { type: "object", required: ["studentId", "showEventId"], properties: { studentId: { type: "string" }, showEventId: { type: "string" }, handedOut: { type: "boolean" }, paid: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/classes/registers/costume", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_attendance_report",
    description: "Attendance rate by class and by student over a date range (inclusive; default the last 8 weeks), flagging students under the tenant's low-attendance threshold. Cancelled sessions are excluded.",
    inputSchema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ from, to, tenant } = {}) {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString() ? `?${params}` : "";
      const res = await api(tenant)(`/classes/registers/report${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_register_settings",
    description: "The register-hook settings: lapseWeeks, arrearsGraceDays, lowAttendancePct, lateGraceMins. With student absences switched on, also absenceApprovalRequired (\"Parents' time-off requests need approval\", default false: a parent's time off is approved at once; true: it waits for an owner or admin). The key is absent when student absences are off.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/classes/registers/settings");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_register_settings_set",
    description: "Update any of lapseWeeks (1-52), arrearsGraceDays (0-90), lowAttendancePct (1-100), lateGraceMins (0-120), and, only while student absences are switched on, absenceApprovalRequired (true = parents' time-off requests wait for approval; false = approved at once; illness never waits; the change is audited). OWNER/ADMIN only.",
    inputSchema: { type: "object", properties: { lapseWeeks: { type: "number" }, arrearsGraceDays: { type: "number" }, lowAttendancePct: { type: "number" }, lateGraceMins: { type: "number" }, absenceApprovalRequired: { type: "boolean", description: "Student absences on only: parents' time-off requests need approval" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await send(tenant, "PATCH", "/classes/registers/settings", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Absences (student absences switched on only; 404 otherwise) ──
  {
    name: "uiiq_classes_absences_list",
    description: "Every student's absences in the workspace, for the Absences page (Classes -> Absences): parents' time-off requests waiting for a decision, who is away, and history. Filters: status (any of REQUESTED, APPROVED, REPORTED, DECLINED, CANCELLED), from (still running on or after this day), to (starting on or before this day), order (asc|desc by start, default desc), limit (1-100, default 50); pass nextCursor back as cursor for the next page. Owners/admins see everything plus `waiting` (requests to decide) and viewer.canReview; anyone else sees only excused absences, with the kind and note on the classes they teach and \"Away (known)\" (kind ABSENCE) everywhere else. Notes are a child's health information: left out (hasNote says one exists) unless includeNotes=true. To decide a request use uiiq_students_absences_approve / _decline with its studentId and id.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "array", items: { type: "string", enum: ["REQUESTED", "APPROVED", "REPORTED", "DECLINED", "CANCELLED"] }, description: "Default all" },
        from: { type: "string", description: "YYYY-MM-DD: absences ending on or after this day" },
        to: { type: "string", description: "YYYY-MM-DD: absences starting on or before this day" },
        order: { type: "string", enum: ["asc", "desc"] },
        limit: { type: "number", description: "1-100, default 50" },
        cursor: { type: "string", description: "nextCursor from the previous page" },
        includeNotes: { type: "boolean", description: "Include notes and the school's messages (default false)" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ status, from, to, order, limit, cursor, includeNotes, tenant } = {}) {
      const q = new URLSearchParams();
      if (Array.isArray(status) && status.length) q.set("status", status.join(","));
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      if (order) q.set("order", order);
      if (limit !== undefined) q.set("limit", String(limit));
      if (cursor) q.set("cursor", cursor);
      const qs = q.toString();
      const res = await api(tenant)(`/classes/absences${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw await fail(res);
      const body = await res.json();
      if (includeNotes === true || !Array.isArray(body?.absences)) return body;
      // Notes are opt-in so a child's health note never lands in the model's
      // context just because someone asked who is away (Lucas, #769 L4).
      return {
        ...body,
        absences: body.absences.map(({ note, reviewNote, ...a }) => ({ ...a, hasNote: !!note || !!reviewNote })),
        notesOmitted: true,
      };
    },
  },

  // ── Scan check-in ──
  {
    name: "uiiq_classes_register_scan",
    description: "Record ONE scan of a child's check-in card/QR/NFC tag (token = the scanned URL or token) for a date, as the signed-in staff member would from the scanner: checks the child in to the class running now (or classId), or signs them out on a second scan where the class requires it. Rate-limited; an unknown token gets the same NOT_ON_REGISTER reply as an unenrolled child.",
    inputSchema: { type: "object", required: ["token", "sessionDate"], properties: { token: { type: "string" }, sessionDate: { type: "string", description: "YYYY-MM-DD" }, classId: { type: "string", description: "Pin the scan to one class" }, signedOutBy: { type: "string", description: "Who collected the child (sign-out)" }, scannedAt: { type: "string", description: "ISO time the scan was taken" }, clientId: { type: "string", description: "Device-side id, echoed back" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/classes/registers/scan", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_register_scan_sync",
    description: "Drain an offline scan queue: up to 100 scans [{ clientId, token, sessionDate, classId?, signedOutBy?, scannedAt }] processed in order, idempotently; results keyed by clientId. Bad rows are accepted and reported, never blocking the rest.",
    inputSchema: { type: "object", required: ["scans"], properties: { scans: { type: "array", items: { type: "object", required: ["token", "sessionDate"], properties: { clientId: { type: "string" }, token: { type: "string" }, sessionDate: { type: "string" }, classId: { type: "string" }, signedOutBy: { type: "string" }, scannedAt: { type: "string" } } } }, tenant: TENANT_PROP } },
    async handler({ scans, tenant }) {
      const res = await post(tenant, "/classes/registers/scan/sync", { scans });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_classes_scan_cards",
    description: "The printable check-in card sheet for a class: each enrolled child's QR (data URI; max 120) with their name as a SEPARATE field and their printed-card status. The name is never encoded in the QR. Mints a check-in token for any child without one. OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["classId"], properties: { classId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ classId, tenant }) {
      const res = await api(tenant)(`/classes/registers/scan-cards?classId=${encodeURIComponent(classId)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
