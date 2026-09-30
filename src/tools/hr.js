import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
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

async function fail(res) {
  const text = await res.text();
  try { const j = JSON.parse(text); if (j?.error) return new Error(j.error); } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}
const send = (tenant, path, method, body) =>
  api(tenant)(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
const post = (tenant, path, body) => send(tenant, path, "POST", body);

// Compliance documents and training certificates go to the PRIVATE bucket via a
// presigned POST (same three-step flow as the Document Vault): presign → bytes
// straight to S3 → register the row. The platform's own allowlists, mirrored.
const DOC_MIME = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const CERT_MIME = { ...DOC_MIME, heic: "image/heic" };
const MB = 1024 * 1024;

async function loadLocal(path, mimes, maxBytes) {
  const filename = basename(path);
  const mime = mimes[extname(filename).slice(1).toLowerCase()];
  if (!mime) throw new Error(`Unsupported file type: ${filename}. Takes ${Object.keys(mimes).join(", ").toUpperCase()}.`);
  const bytes = await readFile(path);
  if (!bytes.length) throw new Error("That file is empty.");
  if (bytes.length > maxBytes) throw new Error(`${filename} is ${(bytes.length / MB).toFixed(1)} MB — the limit is ${maxBytes / MB} MB.`);
  return { bytes, filename, mime };
}
async function s3Post(url, fields, bytes, mime, filename) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([bytes], { type: mime }), filename);
  const s3 = await fetch(url, { method: "POST", body: form });
  if (!s3.ok) throw new Error(`Storage refused the upload: HTTP ${s3.status} ${(await s3.text()).slice(0, 200)}`);
}
// The caller runs with redirect: "manual" on purpose — a session cookie must
// never ride along to S3. Take the Location and fetch it plain.
async function followToFile(hop, targetFor) {
  const location = hop.headers.get("location");
  if (!location) throw hop.ok ? new Error("The platform returned no download link.") : await fail(hop);
  const file = await fetch(location);
  if (!file.ok) throw new Error(`Storage refused the download: HTTP ${file.status}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const target = targetFor(extname(new URL(location).pathname));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return { path: target, bytes: bytes.length };
}
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, "_");


export const hrTools = [
  {
    name: "uiiq_hr_staff_list",
    description: "List HR staff records: id, name, job title, department, employment type, status and leaving date (no pay or contact details). status: active (default — ACTIVE and ON_LEAVE, the people working here), inactive (deactivated leavers) or all. department and search (name) are matched here on the returned list.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "inactive", "all"], description: "Default active" },
        department: { type: "string", description: "Exact department, case-insensitive" },
        search: { type: "string", description: "Part of a first or last name" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ department, status, search, tenant } = {}) {
      const qs = status ? "?status=" + encodeURIComponent(status) : "";
      const res = await api(tenant)("/hr/staff" + qs);
      if (!res.ok) throw await fail(res);
      const data = await res.json();
      let rows = Array.isArray(data) ? data : data.staff ?? [];
      if (department) rows = rows.filter((s) => (s.department ?? "").toLowerCase() === department.toLowerCase());
      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
      }
      return rows;
    }
  },
  {
    name: "uiiq_hr_staff_get",
    description: "One HR staff record in full (contact, employment dates, salary in pence, holiday allowance, emergency contact, notes, status). An owner/admin can read anyone's; anyone else only their own (403 otherwise).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/hr/staff/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    }
  },
  {
    name: "uiiq_hr_staff_create",
    description: "Add an HR staff record. firstName, lastName, email (unique in the workspace) and startDate (YYYY-MM-DD) required. annualSalary is in POUNDS (stored as pence). employmentType FULL_TIME (default) | PART_TIME | CONTRACT | FREELANCE; salaryFrequency ANNUAL (default) | MONTHLY | WEEKLY | HOURLY; holidayAllowanceDays default 28. Starts the tenant's onboarding checklist when it has exactly one template (or templateId). Owner/admin only.",
    inputSchema: {
      type: "object",
      required: ["firstName", "lastName", "email", "startDate"],
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        phone: { type: "string" },
        jobTitle: { type: "string" },
        department: { type: "string" },
        employmentType: { type: "string", enum: ["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"] },
        annualSalary: { type: "number", description: "Pounds, e.g. 24500.50" },
        salaryFrequency: { type: "string", enum: ["ANNUAL", "MONTHLY", "WEEKLY", "HOURLY"] },
        holidayAllowanceDays: { type: "number" },
        emergencyContactName: { type: "string" },
        emergencyContactPhone: { type: "string" },
        notes: { type: "string" },
        canTeach: { type: "boolean", description: "Offer them in the class Teacher picker (default true)" },
        userId: { type: "string", description: "Link to a platform user so they can sign in to their own record" },
        templateId: { type: "string", description: "Onboarding template to start" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/hr/staff", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    }
  },
  {
    name: "uiiq_hr_staff_update",
    description: "Edit an HR staff record — only the fields you send change; an empty string clears an optional one. annualSalary is in POUNDS. endDate (YYYY-MM-DD) is a planned leaving date and does NOT deactivate them (use uiiq_hr_staff_deactivate); an inactive record's leaving date can be changed but not cleared. Email must stay unique (409). Every change is audited; salary, notes and personal details as 'changed' without values. Owner/admin only, except avatarUrl, which a person may set on their own record. dateOfBirth is owner/admin only too (it gates age-restricted till sales); a person can see theirs but not set or clear it. Status is not edited here.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        jobTitle: { type: "string" },
        department: { type: "string" },
        employmentType: { type: "string", enum: ["FULL_TIME", "PART_TIME", "CONTRACT", "FREELANCE"] },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD, or empty to clear (active records only)" },
        annualSalary: { type: "number", description: "Pounds; send null to clear" },
        salaryFrequency: { type: "string", enum: ["ANNUAL", "MONTHLY", "WEEKLY", "HOURLY"] },
        holidayAllowanceDays: { type: "number" },
        emergencyContactName: { type: "string" },
        emergencyContactPhone: { type: "string" },
        notes: { type: "string" },
        canTeach: { type: "boolean" },
        dateOfBirth: { type: "string", description: "YYYY-MM-DD, or empty to clear. Owner/admin only." },
        avatarUrl: { type: "string", description: "https URL of their photo" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, `/hr/staff/${encodeURIComponent(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    }
  },
  {
    name: "uiiq_hr_staff_deactivate",
    description: "Deactivate someone who is leaving: status INACTIVE and their leaving date (endDate YYYY-MM-DD, default today in the UK; never in the future). They drop off rotas, pickers and lists, new shifts/classes/cover/leave/workshops/timesheets for them are refused (timesheets up to the leaving date still go through — final pay), clock-in stops and their staff badge reads invalid. History and the final pay run are kept. By default also disables their linked till PIN and hides their Venue Staff profile (set disableTillStaff / hidePerformer false to keep those). Their UIIQ login is NOT changed unless removeAccess is true: then their membership of THIS workspace only is removed (never the user, never other workspaces), their Members App devices here are signed out, and open sessions lose the workspace within seconds — refused (409) for yourself and for the workspace's last owner. The response's accessRemoved says what happened. Audited. Owner/admin only.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        endDate: { type: "string", description: "Leaving date YYYY-MM-DD (default today)" },
        disableTillStaff: { type: "boolean", description: "Default true" },
        hidePerformer: { type: "boolean", description: "Default true" },
        removeAccess: { type: "boolean", description: "Also remove their access to this workspace. Default false (the dashboard pre-ticks it for an owner or admin)." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...rest }) {
      // action LAST: nothing in `rest` may turn a deactivate into a reactivate.
      const res = await post(tenant, `/hr/staff/${encodeURIComponent(id)}/status`, { ...rest, action: "deactivate" });
      if (!res.ok) throw await fail(res);
      return res.json();
    }
  },
  {
    name: "uiiq_hr_staff_reactivate",
    description: "Reactivate a deactivated staff record: status ACTIVE, leaving date cleared, badge valid again. A till PIN or Venue Staff profile switched off when they left stays off — turn those back on separately (till staff, uiiq_admin_staff_update isActive). Audited. Owner/admin only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await post(tenant, `/hr/staff/${encodeURIComponent(id)}/status`, { action: "reactivate" });
      if (!res.ok) throw await fail(res);
      return res.json();
    }
  },
  {
    name: "uiiq_hr_timesheet_list",
    description: "List UIIQ timesheet entries. Filter by staff member or date range.",
    inputSchema: {
      type: "object",
      properties: {
        staffId: { type: "string" },
        from: { type: "string", description: "Start date YYYY-MM-DD" },
        to: { type: "string", description: "End date YYYY-MM-DD" },
        approved: { type: "boolean", description: "Filter by approval status" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ staffId, from, to, approved, tenant } = {}) {
      const params = new URLSearchParams();
      if (staffId)          params.set("staffId", staffId);
      if (from)             params.set("from", from);
      if (to)               params.set("to", to);
      if (approved != null) params.set("approved", approved);
      const qs = params.toString() ? "?" + params : "";
      const res = await api(tenant)(`/hr/timesheets${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.timesheets ?? [];
    }
  },
  {
    name: "uiiq_hr_timesheet_approve",
    description: "Approve or reject a UIIQ timesheet entry by ID.",
    inputSchema: {
      type: "object",
      required: ["id", "approved"],
      properties: {
        id: { type: "string" },
        approved: { type: "boolean" },
        note: { type: "string", description: "Optional note for rejection" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, approved, note, tenant }) {
      const res = await api(tenant)(`/hr/timesheets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: approved ? "approve" : "reject", note }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { id, approved };
    }
  },
  {
    name: "uiiq_hr_clockin_list",
    description: "List UIIQ QR clock-in records. Filter by staff member or date.",
    inputSchema: {
      type: "object",
      properties: {
        staffId: { type: "string" },
        date: { type: "string", description: "Filter by date YYYY-MM-DD" },
        limit: { type: "number", description: "Max results (default 50)" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ staffId, date, limit = 50, tenant } = {}) {
      const params = new URLSearchParams({ limit });
      if (staffId) params.set("staffId", staffId);
      if (date)    params.set("date", date);
      const res = await api(tenant)(`/hr/clockins?${params}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.clockins ?? [];
    }
  },
  {
    name: "uiiq_hr_leave_list",
    description: "List UIIQ leave requests. Filter by staff member or status.",
    inputSchema: {
      type: "object",
      properties: {
        staffId: { type: "string" },
        status: { type: "string", description: "pending | approved | rejected" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ staffId, status, tenant } = {}) {
      const params = new URLSearchParams();
      if (staffId) params.set("staffId", staffId);
      if (status)  params.set("status", status);
      const qs = params.toString() ? "?" + params : "";
      const res = await api(tenant)(`/hr/leave${qs}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.requests ?? [];
    }
  },
  {
    name: "uiiq_hr_leave_approve",
    description: "Approve or reject a UIIQ leave request. Approving a HOLIDAY request that would exceed the staff member's allowance is refused (400) with the used/remaining figures.",
    inputSchema: {
      type: "object",
      required: ["id", "approved"],
      properties: {
        id: { type: "string" },
        approved: { type: "boolean" },
        note: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, approved, note, tenant }) {
      const res = await api(tenant)(`/hr/leave/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: approved ? "approve" : "reject", reviewNote: note }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { id, approved };
    }
  },

  // ── Payroll ─────────────────────────────────────────────────────────────
  {
    name: "uiiq_hr_payroll_run",
    description: "Fetch the monthly UIIQ Run pay-run for a given month (defaults to current). Returns gross pay, employer NI estimate, total cost and hours worked per staff. Cost-projection only — not a real payroll engine.",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM (defaults to current month)" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ month, tenant } = {}) {
      const qs = month ? `?month=${encodeURIComponent(month)}` : "";
      const res = await api(tenant)(`/hr/payroll${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_hr_payroll_export_url",
    description: "Returns the URL to download a UIIQ Run pay-run as CSV for the given month. Hand this URL to the user for browser download.",
    inputSchema: {
      type: "object",
      required: ["month"],
      properties: {
        month: { type: "string", description: "YYYY-MM" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ month, tenant }) {
      return { url: `https://app.uiiq.co.uk/api/hr/payroll?month=${encodeURIComponent(month)}&format=csv` };
    }
  },

  // ── Timesheets from taught work ─────────────────────────────────────────
  {
    name: "uiiq_hr_timesheet_from_session",
    description: "Raise a timesheet line straight from a class register session: the class supplies the teacher, start time and duration. staffMemberId overrides the class's own teacher (cover — tag appliesTo 'cover' so the rate card prices it). Idempotent per (class, teacher, date): a repeat returns the existing entry with alreadyLogged true.",
    inputSchema: {
      type: "object",
      required: ["classId", "sessionDate"],
      properties: {
        classId: { type: "string" },
        sessionDate: { type: "string", description: "YYYY-MM-DD" },
        staffMemberId: { type: "string", description: "The teacher who actually taught it, if not the class's own" },
        appliesTo: { type: "string", description: "Rate-card tag, e.g. 'cover'" },
        billable: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/hr/timesheets/from-session", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Onboarding ──────────────────────────────────────────────────────────
  {
    name: "uiiq_hr_onboarding_step_complete",
    description: "Mark an onboarding step complete (by step id). When it was the last open step the whole onboarding instance is marked complete too.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Onboarding step id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, `/hr/onboarding/steps/${encodeURIComponent(id)}`, "PUT", {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Scan tags (QR clock-in points) ──────────────────────────────────────
  {
    name: "uiiq_hr_scan_tag_update",
    description: "Edit a QR clock-in tag: name, description, taskId, active, radiusMeters (5–5000). recalibrate true clears its location so the next scan re-captures it; latitude + longitude together set the geofence centre by hand.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        taskId: { type: "string" },
        active: { type: "boolean" },
        radiusMeters: { type: "number" },
        recalibrate: { type: "boolean" },
        latitude: { type: "number" },
        longitude: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, `/hr/scan-tags/${encodeURIComponent(id)}`, "PUT", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_scan_tag_delete",
    description: "Delete a QR clock-in tag. Printed copies of its QR stop working. No undo.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, `/hr/scan-tags/${encodeURIComponent(id)}`, "DELETE");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_scan_tag_qr",
    description: "Save a clock-in tag's QR code as an SVG (320px, points at the app's /scan/<code> page) and return the path. Default: ./scan-tag-<id>.svg.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, outPath: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, outPath, tenant }) {
      const res = await api(tenant)(`/hr/scan-tags/${encodeURIComponent(id)}/qr`);
      if (!res.ok) throw await fail(res);
      const svg = await res.text();
      const target = outPath || join(process.cwd(), `scan-tag-${safe(id)}.svg`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, svg, "utf8");
      return { path: target, bytes: Buffer.byteLength(svg, "utf8") };
    },
  },

  // ── Shifts (the rota) ───────────────────────────────────────────────────
  {
    name: "uiiq_hr_shift_list",
    description: "The rota for one week: active staff, their shifts keyed by staff id then YYYY-MM-DD, and weekly minutes per person. weekStart is any date in the week (normalised to Monday; default this week).",
    inputSchema: { type: "object", properties: { weekStart: { type: "string", description: "YYYY-MM-DD" }, tenant: TENANT_PROP } },
    async handler({ weekStart, tenant } = {}) {
      const qs = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : "";
      const res = await api(tenant)(`/hr/shifts${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_shift_set",
    description: "Put a staff member on the rota for a day (one shift per person per day — an existing shift on that date is overwritten). Times are HH:MM, end after start.",
    inputSchema: {
      type: "object",
      required: ["staffMemberId", "date", "startTime", "endTime"],
      properties: {
        staffMemberId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        startTime: { type: "string", description: "HH:MM" },
        endTime: { type: "string", description: "HH:MM" },
        breakMinutes: { type: "number" },
        notes: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/hr/shifts", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_shift_update",
    description: "Change a shift's times (HH:MM), break or notes by shift id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        breakMinutes: { type: "number" },
        notes: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, `/hr/shifts/${encodeURIComponent(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_shift_delete",
    description: "Take a shift off the rota by shift id. No undo.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, `/hr/shifts/${encodeURIComponent(id)}`, "DELETE");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Teachers ────────────────────────────────────────────────────────────
  {
    name: "uiiq_hr_teacher_month",
    description: "The Teacher month view: per teaching staff member, every class session (with cancellations and cover applied), rota shift, workshop booking and venue in the month. month = YYYY-MM (default this month).",
    inputSchema: { type: "object", properties: { month: { type: "string", description: "YYYY-MM" }, tenant: TENANT_PROP } },
    async handler({ month, tenant } = {}) {
      const qs = month ? `?month=${encodeURIComponent(month)}` : "";
      const res = await api(tenant)(`/hr/teachers${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Staff ID badges (IQBadges smart pages) ──────────────────────────────
  {
    name: "uiiq_hr_staff_badge_get",
    description: "The staff member's current ID-badge code (what the badge page carries — treat it like a key), with issued/revoked dates. Owner/admin only.",
    inputSchema: { type: "object", required: ["staffId"], properties: { staffId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ staffId, tenant }) {
      const res = await api(tenant)(`/hr/staff/${encodeURIComponent(staffId)}/badge`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_staff_badge_issue",
    description: "Issue a staff member's ID-badge code, or REPLACE the existing one — the old badge page stops working at once. Owner/admin only.",
    inputSchema: { type: "object", required: ["staffId"], properties: { staffId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ staffId, tenant }) {
      const res = await post(tenant, `/hr/staff/${encodeURIComponent(staffId)}/badge`, {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_staff_badge_revoke",
    description: "Revoke a staff member's ID badge: the badge page says 'no longer valid' on the next scan. Owner/admin only.",
    inputSchema: { type: "object", required: ["staffId"], properties: { staffId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ staffId, tenant }) {
      const res = await send(tenant, `/hr/staff/${encodeURIComponent(staffId)}/badge`, "DELETE");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Staff documents (DBS, passport, right-to-work, contracts) ───────────
  {
    name: "uiiq_hr_staff_document_list",
    description: "A staff member's compliance documents. Owners/admins see all; a STAFF user sees only their own record, and only rows whose visibility admits them.",
    inputSchema: { type: "object", required: ["staffId"], properties: { staffId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ staffId, tenant }) {
      const res = await api(tenant)(`/hr/staff/${encodeURIComponent(staffId)}/documents`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_staff_document_add",
    description: "Attach a compliance document to a staff member: either a local file (path — PDF, JPEG, PNG or WebP, 15 MB max; uploaded to the private bucket via presign) or an external link (fileUrl). type e.g. DBS, PASSPORT, RIGHT_TO_WORK, CONTRACT (default OTHER); visibility ADMIN_ONLY (default) | STAFF_ALL | OWNER_ONLY. Owner/admin only.",
    inputSchema: {
      type: "object",
      required: ["staffId"],
      properties: {
        staffId: { type: "string" },
        path: { type: "string", description: "Local file to upload. One of path or fileUrl." },
        fileUrl: { type: "string", description: "External link to record instead of uploading." },
        name: { type: "string" },
        type: { type: "string" },
        visibility: { type: "string", enum: ["ADMIN_ONLY", "STAFF_ALL", "OWNER_ONLY"] },
        expiryDate: { type: "string", description: "YYYY-MM-DD" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ staffId, path, fileUrl, tenant, ...rest }) {
      if (!path && !fileUrl) throw new Error("Give a local path to upload, or a fileUrl to link.");
      const client = api(tenant);
      const body = { ...rest };
      if (path) {
        const { bytes, filename, mime } = await loadLocal(path, DOC_MIME, 15 * MB);
        const presign = await client(`/hr/staff/${encodeURIComponent(staffId)}/documents/presign`, {
          method: "POST",
          body: JSON.stringify({ fileName: filename, contentType: mime }),
        });
        if (!presign.ok) throw await fail(presign);
        const { url, fields, key } = await presign.json();
        await s3Post(url, fields, bytes, mime, filename);
        body.fileKey = key;
        body.name ??= filename;
      } else {
        body.fileUrl = fileUrl;
      }
      const res = await client(`/hr/staff/${encodeURIComponent(staffId)}/documents`, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_staff_document_download",
    description: "Fetch a staff document's file to a local path and return it. The platform issues a signed link that lasts about two minutes; this follows it once. Visibility is enforced by the platform. Default: ./staff-doc-<docId>.<ext>.",
    inputSchema: {
      type: "object",
      required: ["staffId", "docId"],
      properties: { staffId: { type: "string" }, docId: { type: "string" }, outPath: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ staffId, docId, outPath, tenant }) {
      const hop = await api(tenant)(`/hr/staff/${encodeURIComponent(staffId)}/documents/${encodeURIComponent(docId)}/download`);
      return followToFile(hop, (ext) => outPath || join(process.cwd(), `staff-doc-${safe(docId)}${ext}`));
    },
  },
  {
    name: "uiiq_hr_staff_document_delete",
    description: "Delete a staff document and its stored file. No undo.",
    inputSchema: { type: "object", required: ["staffId", "docId"], properties: { staffId: { type: "string" }, docId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ staffId, docId, tenant }) {
      const res = await send(tenant, `/hr/staff/${encodeURIComponent(staffId)}/documents/${encodeURIComponent(docId)}`, "DELETE");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Pay rates (the rate card the pay run prices timesheets with) ────────
  {
    name: "uiiq_hr_pay_rate_list",
    description: "A staff member's whole rate card, newest first, retired rows included (they are what past runs paid).",
    inputSchema: { type: "object", required: ["staffId"], properties: { staffId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ staffId, tenant }) {
      const res = await api(tenant)(`/hr/staff/${encodeURIComponent(staffId)}/pay-rates`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_pay_rate_add",
    description: "Add a rate to a staff member's rate card. rateType HOURLY | PER_SESSION | PER_DAY; amountPence a whole number; effectiveFrom YYYY-MM-DD. classId pins it to one class; appliesTo tags it (e.g. 'workshop', 'cover'); isDefault makes it the fallback. A pay rise is a NEW row from the day it applies, never an edit. Owner/admin only.",
    inputSchema: {
      type: "object",
      required: ["staffId", "label", "rateType", "amountPence", "effectiveFrom"],
      properties: {
        staffId: { type: "string" },
        label: { type: "string" },
        rateType: { type: "string", enum: ["HOURLY", "PER_SESSION", "PER_DAY"] },
        amountPence: { type: "number" },
        effectiveFrom: { type: "string" },
        effectiveTo: { type: "string" },
        classId: { type: "string" },
        appliesTo: { type: "string" },
        isDefault: { type: "boolean" },
        notes: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ staffId, tenant, ...body }) {
      const res = await post(tenant, `/hr/staff/${encodeURIComponent(staffId)}/pay-rates`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_pay_rate_update",
    description: "Edit one rate-card line. label, isDefault, notes and effectiveTo (null clears) are always editable. amountPence, rateType, classId, appliesTo and effectiveFrom are FROZEN once the rate has started (409): end-date it and add a new rate instead. Owner/admin only.",
    inputSchema: {
      type: "object",
      required: ["staffId", "rateId"],
      properties: {
        staffId: { type: "string" },
        rateId: { type: "string" },
        label: { type: "string" },
        isDefault: { type: "boolean" },
        notes: { type: "string" },
        effectiveTo: { type: ["string", "null"], description: "YYYY-MM-DD, or null to clear" },
        amountPence: { type: "number" },
        rateType: { type: "string", enum: ["HOURLY", "PER_SESSION", "PER_DAY"] },
        classId: { type: ["string", "null"] },
        appliesTo: { type: "string" },
        effectiveFrom: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ staffId, rateId, tenant, ...body }) {
      const res = await send(tenant, `/hr/staff/${encodeURIComponent(staffId)}/pay-rates/${encodeURIComponent(rateId)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_pay_rate_delete",
    description: "Delete a rate-card line that has NOT started yet. A rate that has been live is refused (409) — end-date it with uiiq_hr_pay_rate_update instead. Owner/admin only.",
    inputSchema: { type: "object", required: ["staffId", "rateId"], properties: { staffId: { type: "string" }, rateId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ staffId, rateId, tenant }) {
      const res = await send(tenant, `/hr/staff/${encodeURIComponent(staffId)}/pay-rates/${encodeURIComponent(rateId)}`, "DELETE");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Training ────────────────────────────────────────────────────────────
  {
    name: "uiiq_hr_training_matrix",
    description: "The training matrix in one payload: active courses, active staff, every training record (with certificate presence) and the role → required-course map. Owner/admin only (compliance data).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/hr/training/matrix");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_training_export",
    description: "The training matrix as an audit-pack CSV (one row per staff × course that is required or recorded). Owner/admin only. Returns the CSV text; pass savePath to also write it to disk.",
    inputSchema: { type: "object", properties: { savePath: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ savePath, tenant } = {}) {
      const res = await api(tenant)("/hr/training/export");
      if (!res.ok) throw await fail(res);
      const csv = await res.text();
      const m = (res.headers.get("content-disposition") ?? "").match(/filename="?([^"]+)"?/);
      const filename = m ? m[1] : `training-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
      if (savePath) {
        await mkdir(dirname(savePath), { recursive: true });
        await writeFile(savePath, csv, "utf8");
        return { saved: savePath, filename, bytes: Buffer.byteLength(csv, "utf8") };
      }
      return { filename, csv };
    },
  },
  {
    name: "uiiq_hr_training_record_set",
    description: "Log or update a staff member's training record for a course (one row per staff × course; a second call overwrites). status NOT_STARTED | IN_PROGRESS | COMPLETED (default) | EXPIRED | EXEMPT; expiresAt is derived from completedAt + the course's renewal months unless given. certificatePath uploads a certificate (PDF, JPEG, PNG, WebP or HEIC, 20 MB max) to the private bucket first. Owner/admin only.",
    inputSchema: {
      type: "object",
      required: ["staffMemberId", "courseId"],
      properties: {
        staffMemberId: { type: "string" },
        courseId: { type: "string" },
        status: { type: "string", enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "EXPIRED", "EXEMPT"] },
        completedAt: { type: "string", description: "ISO date" },
        expiresAt: { type: "string", description: "ISO date, overrides the computed expiry" },
        certificatePath: { type: "string", description: "Local certificate file to upload" },
        notes: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ certificatePath, tenant, ...body }) {
      const client = api(tenant);
      if (certificatePath) {
        const { bytes, filename, mime } = await loadLocal(certificatePath, CERT_MIME, 20 * MB);
        const presign = await client("/hr/training/certificate-upload", {
          method: "POST",
          body: JSON.stringify({ staffMemberId: body.staffMemberId, courseId: body.courseId, fileName: filename, contentType: mime, fileSize: bytes.length }),
        });
        if (!presign.ok) throw await fail(presign);
        const { post: form, key } = await presign.json();
        await s3Post(form.url, form.fields, bytes, mime, filename);
        body.certificateKey = key;
      }
      const res = await client("/hr/training/records", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_training_record_delete",
    description: "Delete a training record outright — only for one logged in error; prefer status EXEMPT so the history stays traceable. Owner/admin only. No undo.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Training record id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, `/hr/training/records?id=${encodeURIComponent(id)}`, "DELETE");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_training_certificate_download",
    description: "Fetch a training record's certificate to a local path and return it (signed link, ~2 minutes, followed once). Owner/admin only. Default: ./certificate-<recordId>.<ext>.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Training record id" }, outPath: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, outPath, tenant }) {
      const hop = await api(tenant)(`/hr/training/records/${encodeURIComponent(id)}/certificate`);
      return followToFile(hop, (ext) => outPath || join(process.cwd(), `certificate-${safe(id)}${ext}`));
    },
  },

  // ── Workshops (a teacher booked onto a workshop for a fee) ──────────────
  {
    name: "uiiq_hr_workshop_list",
    description: "Workshop bookings. Filter by month (YYYY-MM), staffMemberId, status (DRAFT | SENT | ACCEPTED | DECLINED | CANCELLED | COMPLETED). The office sees every booking; a teacher sees only their own.",
    inputSchema: { type: "object", properties: { month: { type: "string" }, staffMemberId: { type: "string" }, status: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ month, staffMemberId, status, tenant } = {}) {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      if (staffMemberId) params.set("staffMemberId", staffMemberId);
      if (status) params.set("status", status);
      const qs = params.toString() ? "?" + params : "";
      const res = await api(tenant)(`/hr/workshops${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_workshop_get",
    description: "One workshop booking. The teacher it belongs to can read their own.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/hr/workshops/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_workshop_fee_suggest",
    description: "What the teacher's rate card says a workshop slot is worth (amount, rate, basis), plus a clash warning for the same slot. startsAt/endsAt ISO datetimes. Owner/admin only (reads pay rates).",
    inputSchema: {
      type: "object",
      required: ["staffMemberId", "startsAt", "endsAt"],
      properties: { staffMemberId: { type: "string" }, startsAt: { type: "string" }, endsAt: { type: "string" }, appliesTo: { type: "string", description: "Rate tag, default 'workshop'" }, excludeBookingId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...q }) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(q)) if (v != null) params.set(k, v);
      const qs = "?" + params;
      const res = await api(tenant)(`/hr/workshops/fee-suggestion${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_workshop_create",
    description: "Book a teacher onto a workshop. Omit feePence to take the rate-card suggestion (refused if the teacher has no applicable rate); give one and it is recorded as MANUAL if it differs. Overlaps warn (clashWarning) but do not block. Owner/admin only.",
    inputSchema: {
      type: "object",
      required: ["title", "staffMemberId", "startsAt", "endsAt"],
      properties: {
        title: { type: "string" },
        staffMemberId: { type: "string" },
        startsAt: { type: "string", description: "ISO datetime" },
        endsAt: { type: "string", description: "ISO datetime" },
        feePence: { type: "number" },
        appliesTo: { type: "string", description: "Rate tag for the suggestion, default 'workshop'" },
        venueId: { type: "string" },
        locationText: { type: "string" },
        clientName: { type: "string" },
        clientBusinessId: { type: "string" },
        fundingHeadingId: { type: "string" },
        notes: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/hr/workshops", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_workshop_update",
    description: "Edit a workshop booking; moving the date or teacher re-runs the fee suggestion. status may be DRAFT | SENT | CANCELLED | COMPLETED — ACCEPTED/DECLINED go through uiiq_hr_workshop_accept. Owner/admin only.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        staffMemberId: { type: "string" },
        startsAt: { type: "string" },
        endsAt: { type: "string" },
        feePence: { type: "number" },
        status: { type: "string", enum: ["DRAFT", "SENT", "CANCELLED", "COMPLETED"] },
        venueId: { type: ["string", "null"] },
        locationText: { type: ["string", "null"] },
        clientName: { type: ["string", "null"] },
        clientBusinessId: { type: ["string", "null"] },
        fundingHeadingId: { type: ["string", "null"] },
        notes: { type: ["string", "null"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, `/hr/workshops/${encodeURIComponent(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_workshop_delete",
    description: "Remove a workshop booking. The generated contract stays in the teacher's documents. Owner/admin only. No undo.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await send(tenant, `/hr/workshops/${encodeURIComponent(id)}`, "DELETE");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_workshop_accept",
    description: "Accept (default) or decline a workshop booking. A teacher may do this on their own booking; the office on anyone's. Records who pressed it and when — this stands in place of a signature on the contract.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, decision: { type: "string", enum: ["ACCEPTED", "DECLINED"] }, tenant: TENANT_PROP } },
    async handler({ id, decision, tenant }) {
      const res = await post(tenant, `/hr/workshops/${encodeURIComponent(id)}/accept`, { decision });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_workshop_contract",
    description: "Generate the workshop contract PDF into the teacher's documents (visibility OWNER_ONLY) and move a DRAFT booking to SENT. Re-running issues a new document and keeps the old one. Returns the download path. Owner/admin only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await post(tenant, `/hr/workshops/${encodeURIComponent(id)}/contract`, {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_workshop_fund",
    description: "Charge the workshop's cost to a funding heading (a PAYROLL-type allocation in the Funding Tracker). Defaults: the booking's own heading, fee and start date, one unit. Not idempotent — a second call allocates again. Needs the `cost_tracking` feature. Owner/admin only.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, headingId: { type: "string" }, amountPence: { type: "number" }, incurredOn: { type: "string", description: "YYYY-MM-DD" }, units: { type: "number" }, description: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant, ...body }) {
      const res = await post(tenant, `/hr/workshops/${encodeURIComponent(id)}/funding`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_hr_workshop_timesheet",
    description: "Raise the pay-run timesheet line for a COMPLETED workshop (billable, tagged 'workshop'). Idempotent: a repeat returns the existing entry with alreadyLogged true. Owner/admin only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await post(tenant, `/hr/workshops/${encodeURIComponent(id)}/timesheet`, {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
