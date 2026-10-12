import { writeFile, mkdir } from "fs/promises";
import { dirname, resolve } from "path";
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

// An empty class list must never quietly mean "all classes" (Lucas, #769 L5):
// only null or leaving it out does. The API refuses it too; this says why first.
function noEmptyClassIds(classIds) {
  if (Array.isArray(classIds) && classIds.length === 0) {
    throw new Error("classIds is empty: give at least one class id, or leave it out (null) for all classes.");
  }
}

// STUDENTS — children's records for the classes sector. Every route here is
// OWNER/ADMIN/SUPER_ADMIN only (the API answers 403 otherwise) except
// uiiq_students_groups, which is labels and counts. Medical, SEND, allergy
// and emergency fields come back from uiiq_students_get alone — the list is a
// guardian-grouped directory without them.

const STUDENT_FIELDS = {
  firstName: { type: "string" },
  lastName: { type: "string" },
  dob: { type: ["string", "null"], description: "YYYY-MM-DD" },
  medicalNotes: { type: ["string", "null"] },
  sendNeeds: { type: ["string", "null"] },
  allergies: { type: ["string", "null"] },
  emergencyName: { type: ["string", "null"] },
  emergencyPhone: { type: ["string", "null"] },
  photoConsent: { type: "boolean" },
  notes: { type: ["string", "null"] },
  birthdayNote: { type: ["string", "null"], description: "Teacher's one-liner merged into the birthday message, cleared once sent" },
  groups: { type: "array", items: { type: "string" }, description: "Free-text group labels (troupe, squad…)" },
  guardianContactId: { type: "string", description: "An existing Contact" },
};

export const studentsTools = [
  {
    name: "uiiq_students_list",
    description: "The student directory grouped by guardian (name, email, phone, owed balance) with each child's dob, groups, photo consent, active enrolments, owed balance and printed-card status. `q` matches child or guardian name/email. No medical data. Children a parent registered who are still waiting for the office's check are not here (see uiiq_students_registrations_list). OWNER/ADMIN only.",
    inputSchema: { type: "object", properties: { q: { type: "string" }, includeInactive: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ q, includeInactive, tenant } = {}) {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (includeInactive) params.set("includeInactive", "1");
      const qs = params.toString() ? `?${params}` : "";
      const res = await api(tenant)(`/students${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_get",
    description: "One student in full — the ONLY place medical notes, SEND needs, allergies and emergency contact are returned — plus guardian, policy acknowledgements, costumes, shows and every enrolment with its ledger. OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/students/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_create",
    description: "Create a student. The guardian is an existing Contact (guardianContactId) or given inline as guardian { name, email, phone? } — upserted by email, so a known parent is never duplicated. OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["firstName", "lastName"], properties: { ...STUDENT_FIELDS, guardian: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" } } }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await send(tenant, "POST", "/students", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_update",
    description: "Partial update of a student: any of the record fields, plus active (false = the child has left; keeps every register), tshirtSize and costumes (full replace of the per-show ledger). Sending active for a child whose registration is waiting for the office's check is a 409: approve it with uiiq_students_registration_approve instead. OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, ...STUDENT_FIELDS, active: { type: "boolean" }, tshirtSize: { type: ["string", "null"] }, costumes: { type: "array", items: { type: "object" } }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, "PATCH", `/students/${encodeURIComponent(id)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_delete_impact",
    description: "What hard-deleting a student would destroy and what forbids it (registers, payments…). Read before uiiq_students_delete.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/students/${encodeURIComponent(id)}/delete-impact`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_delete",
    description: "HARD-DELETE a student record — for a duplicate or test row only. Refused (409, with the blockers) when the child has any history; a child who has left should be set active=false instead. Audit-logged. OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, "DELETE", `/students/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Progress ──
  {
    name: "uiiq_students_progress_list",
    description: "A student's progression notes (newest first, up to 100) and star tally with the 20 most recent stars. Parents see these in the portal.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/students/${encodeURIComponent(id)}/progress`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_progress_add",
    description: "Add a progression note (visible to the parent): what they're working on, what they've achieved and/or a level — at least one — optionally against a class.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, classId: { type: "string" }, workingOn: { type: "string", description: "Up to 2000 chars" }, achieved: { type: "string" }, level: { type: "string", description: "Up to 80 chars" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, "POST", `/students/${encodeURIComponent(id)}/progress`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_progress_delete",
    description: "DELETE a progression note (the parent may already have seen it).",
    inputSchema: { type: "object", required: ["id", "noteId"], properties: { id: { type: "string", description: "Student id" }, noteId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, noteId, tenant }) {
      const qs = `?noteId=${encodeURIComponent(noteId)}`;
      const res = await send(tenant, "DELETE", `/students/${encodeURIComponent(id)}/progress${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Check-in card ──
  {
    name: "uiiq_students_card_status",
    description: "Whether a child has a check-in card token, when it was issued and when it was last used. The token itself is never returned.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/students/${encodeURIComponent(id)}/scan-token`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_card_issue",
    description: "Mint a child's check-in token if they have none; with regenerate=true REPLACE it (card lost): the old card, printed sheet and NFC tag stop working at once and the print status goes back to NOT_SENT. 409 while a printed card is mid-production. The token is not returned — fetch the QR with uiiq_students_scan_qr.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, regenerate: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ id, regenerate, tenant }) {
      const res = await send(tenant, "POST", `/students/${encodeURIComponent(id)}/scan-token`, { regenerate: regenerate === true });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_scan_qr",
    description: "A child's check-in QR as an SVG (mints the token on first call). Returns the SVG text and base64; with outPath it is also written to that file. The image encodes a URL only — no name is drawn into or encoded in it; print the name beside it if you must. OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, outPath: { type: "string", description: "Write the SVG here (e.g. ./card.svg)" }, tenant: TENANT_PROP } },
    async handler({ id, outPath, tenant }) {
      const res = await api(tenant)(`/students/${encodeURIComponent(id)}/scan-qr`);
      if (!res.ok) throw await fail(res);
      const svg = await res.text();
      const out = { studentId: id, contentType: res.headers.get("content-type") ?? "image/svg+xml", base64: Buffer.from(svg, "utf8").toString("base64") };
      if (outPath) {
        const target = resolve(outPath);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, svg, "utf8");
        return { ...out, path: target };
      }
      return { ...out, svg };
    },
  },

  // ── Absences (illness and time off) ──
  // Behind the workspace's `student_absence` switch: every call is a 404 until
  // it is ticked. Illness is a child's health information — the note is a
  // short staff note, never symptoms, and never audited.
  {
    name: "uiiq_students_absences_list",
    description: "A student's recorded absences (illness, holiday, appointment, other), newest first (up to 200): dates (inclusive), the classes covered (null = all), status (REPORTED / APPROVED / REQUESTED / DECLINED / CANCELLED), excused (true = left out of attendance rates, the lapse check and the \"Missed class\" message), authorised, who recorded and reviewed it. The staff note and review note are left out (hasNote says one exists) unless includeNotes=true: they are a child's health information, so ask for them only when the person needs them, and don't repeat them beyond that person. OWNER/ADMIN only; 404 unless the workspace has student absences switched on.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Student id" },
        includeNotes: { type: "boolean", description: "Include each absence's staff note and review note (default false)" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, includeNotes, tenant }) {
      const res = await api(tenant)(`/students/${encodeURIComponent(id)}/absences`);
      if (!res.ok) throw await fail(res);
      const body = await res.json();
      if (includeNotes === true || !Array.isArray(body?.absences)) return body;
      // Notes are opt-in so a child's health note never lands in the model's
      // context just because someone asked for a list (Lucas, #769 L4).
      return {
        ...body,
        absences: body.absences.map(({ note, reviewNote, ...a }) => ({ ...a, hasNote: !!note || !!reviewNote })),
        notesOmitted: true,
      };
    },
  },
  {
    name: "uiiq_students_absences_record",
    description: "Record an absence for a student, as staff (a parent rang, a holiday was agreed). kind HOLIDAY is recorded APPROVED; ILLNESS, APPOINTMENT and OTHER are REPORTED (no approval step). Excused at once: the register shows it, no \"Missed class\" message is sent and it doesn't count against their attendance, and any Absent mark it covers is linked to it. Overlapping one of the child's live absences (waiting, approved or reported) on a shared class and day is a 409 naming it (overlapsWith): edit that one instead. startDate YYYY-MM-DD; endDate defaults to the same day (inclusive, at most 366 days); classIds limits it to those classes (omit for all); note up to 500 chars, staff only — keep it minimal, no symptoms; authorised defaults to true. Audited with the kind, never the note. OWNER/ADMIN only; 404 unless switched on.",
    inputSchema: {
      type: "object",
      required: ["id", "kind", "startDate"],
      properties: {
        id: { type: "string", description: "Student id" },
        kind: { type: "string", enum: ["HOLIDAY", "ILLNESS", "APPOINTMENT", "OTHER"] },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD, inclusive; default = startDate" },
        classIds: { type: "array", minItems: 1, items: { type: "string" }, description: "Only these classes (at least one); omit for all the student's classes" },
        note: { type: "string", description: "Up to 500 chars, staff only" },
        authorised: { type: "boolean", description: "Default true" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      noEmptyClassIds(body.classIds);
      const res = await send(tenant, "POST", `/students/${encodeURIComponent(id)}/absences`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_absences_update",
    description: "Edit or cancel a recorded absence. action=\"cancel\" withdraws it: kept as CANCELLED history of the dates, its note is cleared, and it counts as an ordinary absence again. Otherwise send any of kind, startDate, endDate, classIds (null = all classes; an empty list is refused), note (null or \"\" clears it), authorised. Shortening the dates or narrowing the classes unlinks register marks it no longer covers; a staff absence changed to HOLIDAY becomes APPROVED with you as the reviewer, and back to another kind becomes REPORTED. A cancelled or declined absence can't be edited (409), nor moved onto another live absence of the child's (409, overlapsWith). Audited with the field names, never the note. OWNER/ADMIN only; 404 unless switched on. To erase one recorded in error, use uiiq_students_absences_delete.",
    inputSchema: {
      type: "object",
      required: ["id", "absenceId"],
      properties: {
        id: { type: "string", description: "Student id" },
        absenceId: { type: "string" },
        action: { type: "string", enum: ["cancel"], description: "Omit to edit" },
        kind: { type: "string", enum: ["HOLIDAY", "ILLNESS", "APPOINTMENT", "OTHER"] },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD, inclusive" },
        classIds: { type: ["array", "null"], minItems: 1, items: { type: "string" }, description: "At least one class id; null = all classes" },
        note: { type: ["string", "null"] },
        authorised: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, absenceId, tenant, ...body }) {
      noEmptyClassIds(body.classIds);
      const res = await send(tenant, "PATCH", `/students/${encodeURIComponent(id)}/absences/${encodeURIComponent(absenceId)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_absences_delete",
    description: "ERASE an absence that was recorded in error (the wrong child, a mistaken illness). PERMANENT: the absence is gone, not cancelled. Any register marks linked to it stay and are unlinked. Audited with the id and kind only. Use uiiq_students_absences_update action=\"cancel\" instead for a real absence that has been withdrawn. OWNER/ADMIN only; 404 unless switched on.",
    inputSchema: {
      type: "object",
      required: ["id", "absenceId"],
      properties: { id: { type: "string", description: "Student id" }, absenceId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, absenceId, tenant }) {
      const res = await send(tenant, "DELETE", `/students/${encodeURIComponent(id)}/absences/${encodeURIComponent(absenceId)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  {
    name: "uiiq_students_absences_approve",
    description: "Approve a parent's time-off request that is waiting (status REQUESTED; 409 for any other status, or if it changed meanwhile). You are stamped as the reviewer; it becomes APPROVED and authorised, excuses the child at once and links any Absent marks it covers. `message` (optional, up to 500 chars) is SHOWN TO THE PARENT on their child's page as a message from the school, so write it to them, never an internal note. No email or notification is sent yet (phase 2b). OWNER/ADMIN only; 404 unless student absences are switched on. Find waiting requests with uiiq_classes_absences_list status=[\"REQUESTED\"].",
    inputSchema: {
      type: "object",
      required: ["id", "absenceId"],
      properties: {
        id: { type: "string", description: "Student id" },
        absenceId: { type: "string" },
        message: { type: "string", description: "Up to 500 chars; the parent sees it" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, absenceId, message, tenant }) {
      const res = await send(tenant, "PATCH", `/students/${encodeURIComponent(id)}/absences/${encodeURIComponent(absenceId)}`, { action: "approve", message });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_absences_decline",
    description: "Decline a parent's time-off request that is waiting (status REQUESTED; 409 otherwise). You are stamped as the reviewer; it becomes DECLINED and unauthorised, so it excuses nothing (if the child stays away anyway, that counts as an ordinary absence). Final: a declined request can't be reopened. `message` (optional, up to 500 chars) is SHOWN TO THE PARENT as the school's reason, so write it to them. No email or notification is sent yet (phase 2b). OWNER/ADMIN only; 404 unless student absences are switched on.",
    inputSchema: {
      type: "object",
      required: ["id", "absenceId"],
      properties: {
        id: { type: "string", description: "Student id" },
        absenceId: { type: "string" },
        message: { type: "string", description: "Up to 500 chars; the parent sees it" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, absenceId, message, tenant }) {
      const res = await send(tenant, "PATCH", `/students/${encodeURIComponent(id)}/absences/${encodeURIComponent(absenceId)}`, { action: "decline", message });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Family registration ("Awaiting check") ──
  // A parent registers on the school's public form (parent only), then adds
  // each child from the Members App. A child added that way is PENDING until
  // the office approves it, and is left out of the directory, enrolments,
  // registers and absences until then. Approving needs the workspace's
  // `family_registration` switch; listing, declining and removing a parent
  // work with it off too, so leftovers can be cleared.
  {
    name: "uiiq_students_registrations_list",
    description: "The office's \"Awaiting check\": { enabled, registrations, parents }. registrations = children parents added that wait for the office's check, oldest first: the child (name, dob, age), the class they asked about, medical notes, SEND needs, allergies, emergency contact, photo consent, the guardian contact (and what the form said about the parent when it differs from the contact on file), any existing family it matched, the consents given, how it came in (form_add_child = the Members App's Add a child form, form_register = an older registration) and when. parents = parents who registered and have added no child yet (contactId, name, email, phone, registeredAt, classInterest, and signedIn: whether they have signed in to the Members App since, which proves the address; false = not signed in yet). enabled = whether family registration is switched on: with it off both lists still come back so leftovers can be declined or removed, but nothing can be approved. It carries children's health information on purpose, because that is what the office checks: show it only to the person doing the check. Act on it with uiiq_students_registration_approve / _decline (children) and uiiq_students_registered_parent_remove (parents). Until approved a child is not in uiiq_students_list and can't be enrolled, marked on a register or given absences. OWNER/ADMIN only (403 otherwise).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/students/registrations");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_registration_approve",
    description: "Approve a child a parent added (from uiiq_students_registrations_list): the child goes on the roll as an active student (so they can be enrolled, put on registers and given absences), and you are stamped as the reviewer. Approving only puts the child on the roll: it no longer subscribes anyone to marketing (that is the parent's own tick when they register), and nothing is sent to the parent. Confirm with the person before calling. 409 if the registration has already been checked (approved or declined meanwhile); 404 if the child isn't found or family registration is switched off. OWNER/ADMIN only. Audited without the child's details.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Student id (a PENDING registration)" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, "POST", `/students/${encodeURIComponent(id)}/registration`, { action: "approve" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_students_registration_decline",
    description: "DECLINE a child a parent added. This deletes a family's data and can't be undone: the child's record is DELETED (data minimisation), and so is the guardian contact when a registration created it, the parent has no registration of their own left, and nothing else hangs off it (guardianContactRemoved says which). A parent who registered keeps their registration: remove them with uiiq_students_registered_parent_remove. `reason` (optional, at most 200 characters, longer or not text is a 400, cleaned to one line; a short code or a few words, never anything about the child) is kept for 30 days on a refusal record with only the guardian's email and the date, then deleted; the audit log records only whether a reason was given. Nothing is sent to the parent. Confirm with the person before calling. Works with family registration switched off, so leftovers can be cleared. 409 if it has already been checked; 409 with `blockers` if the child already has history here (enrolments, payments…), in which case approve it instead (and set active=false with uiiq_students_update if the child won't be coming). 404 if not found. OWNER/ADMIN only. Audited without the child's details.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Student id (a PENDING registration)" }, reason: { type: "string", maxLength: 200, description: "Optional, at most 200 characters, one line; kept 30 days on a refusal record (guardian email, date, reason), nothing about the child" }, tenant: TENANT_PROP } },
    async handler({ id, reason, tenant }) {
      const res = await send(tenant, "POST", `/students/${encodeURIComponent(id)}/registration`, reason === undefined ? { action: "decline" } : { action: "decline", reason });
      if (!res.ok) {
        const text = await res.text();
        let j = null;
        try { j = JSON.parse(text); } catch { /* not JSON */ }
        if (Array.isArray(j?.blockers)) throw new Error(`${j.error} Blockers: ${j.blockers.join("; ")}`);
        throw new Error(j?.error || text || `HTTP ${res.status}`);
      }
      return res.json();
    },
  },
  {
    name: "uiiq_students_registered_parent_remove",
    description: "REMOVE a parent who registered on the school's form and has added no child (a parent from the `parents` list of uiiq_students_registrations_list): the office's decline for a parent. This deletes a family's data and can't be undone: their registrations are deleted, so they can no longer sign in to the Members App on the strength of one, and the contact is DELETED too, unless it existed before the registration, something else is attached to it, or it is a PROVEN marketing opt-in. A registration subscribes nobody until the parent's first Members App sign-in proves the email, so only a parent who ticked marketing, has since signed in and is still subscribed keeps the contact (subscribed, consent record kept); an opt-in who never signed in proves nothing about the address and is deleted like anyone else. The 90-day sweep follows the same rule. Returns { ok, contactRemoved }; contactRemoved false = the contact was kept (they signed in and asked for news, it was there before the registration, or something else uses it). Nothing is sent to the parent. Confirm with the person before calling. 409 if the parent has a child here (decline the child with uiiq_students_registration_decline instead); 404 if the contact isn't a registered parent here. Works with family registration switched off, so leftovers can be cleared. OWNER/ADMIN only. Audited without personal details.",
    inputSchema: { type: "object", required: ["contactId"], properties: { contactId: { type: "string", description: "The parent's contact id (parents[].contactId)" }, tenant: TENANT_PROP } },
    async handler({ contactId, tenant }) {
      const res = await send(tenant, "DELETE", `/students/registered-parents/${encodeURIComponent(contactId)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  {
    name: "uiiq_students_groups",
    description: "The distinct group labels in use across active students, with a student count each (the group picker for notices, campaigns and SMS).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/students/groups");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
