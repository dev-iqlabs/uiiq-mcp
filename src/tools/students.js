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
    description: "The student directory grouped by guardian (name, email, phone, owed balance) with each child's dob, groups, photo consent, active enrolments, owed balance and printed-card status. `q` matches child or guardian name/email. No medical data. OWNER/ADMIN only.",
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
    description: "Partial update of a student: any of the record fields, plus active (false = the child has left; keeps every register), tshirtSize and costumes (full replace of the per-show ledger). OWNER/ADMIN only.",
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
