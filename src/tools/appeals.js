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

// APPEALS — a fundraising appeal on one of the workspace's causes: a story,
// a target, a close date, match-funding pledges from sponsors, news updates
// emailed to supporters. Mirrors the UIIQ /appeals API (phase 1a, Sep 2026).
// GATED: needs the `appeals` feature; publishing needs a payment account that
// can take charges and the user's agreement to the Fundraising Regulator's
// Code. Supporter emails go nowhere until contact email is switched on
// platform-wide (COMMS_LAUNCHED) — the API says `suppressed` when so.
export const appealsTools = [
  {
    name: "uiiq_appeal_list",
    description: "The workspace's appeals, every status, with raised so far. Needs the appeals feature.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/appeals");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_get",
    description: "One appeal with progress, match pledges and updates.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_create",
    description: "A draft appeal on one of the workspace's causes (uiiq_donations_causes_list). One appeal per cause. targetPence is owner/admin only. Returns { id }.",
    inputSchema: {
      type: "object",
      required: ["causeId", "closesAt"],
      properties: {
        causeId: { type: "string" },
        closesAt: { type: "string", description: "ISO date-time the appeal closes" },
        opensAt: { type: "string", description: "ISO date-time; omit = when published" },
        targetPence: { type: "number" },
        story: { type: "string" },
        videoUrl: { type: "string", description: "https URL" },
        gallery: { type: "array", items: { type: "object", properties: { url: { type: "string" }, alt: { type: "string" } } }, description: "Images from the workspace's own bucket" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/appeals", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_update",
    description: "Edit an appeal: any of closesAt, opensAt, targetPence, story, videoUrl, gallery. Staff may edit a draft; a published appeal is owner/admin only, and its close date can't be moved into the past.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        closesAt: { type: "string" },
        opensAt: { type: ["string", "null"] },
        targetPence: { type: "number" },
        story: { type: ["string", "null"] },
        videoUrl: { type: ["string", "null"] },
        gallery: { type: ["array", "null"], items: { type: "object" } },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_delete",
    description: "Delete a draft appeal that has no gifts. A published appeal can't be deleted.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_publish",
    description: "Publish an appeal (owner/admin). Refused without a target, a future close, a payment account that can take charges, or the Fundraising Regulator's Code agreed: pass acceptCode: true the first time to record the user's agreement.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, acceptCode: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ id, acceptCode, tenant }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}/publish`, { method: "POST", body: JSON.stringify(acceptCode ? { acceptCode: true } : {}) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_pledge_add",
    description: "Record a sponsor's match-funding pledge (recorded, not charged through us). mode FIXED = a gift of amountPence; MATCH = matches gifts up to amountPence, at ratio (default 1). state PROMISED (default), RECEIVED or WITHDRAWN.",
    inputSchema: {
      type: "object",
      required: ["id", "sponsorName", "mode", "amountPence"],
      properties: {
        id: { type: "string", description: "appeal id" },
        sponsorName: { type: "string" },
        mode: { type: "string", enum: ["FIXED", "MATCH"] },
        amountPence: { type: "number" },
        ratio: { type: "number" },
        state: { type: "string", enum: ["PROMISED", "RECEIVED", "WITHDRAWN"] },
        sponsorLogoUrl: { type: "string", description: "https" },
        sponsorUrl: { type: "string", description: "https" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}/pledges`, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_pledge_update",
    description: "Edit a pledge, or move it PROMISED → RECEIVED / WITHDRAWN. The terms of a RECEIVED pledge can't change.",
    inputSchema: {
      type: "object",
      required: ["id", "pledgeId"],
      properties: {
        id: { type: "string" }, pledgeId: { type: "string" },
        sponsorName: { type: "string" }, mode: { type: "string", enum: ["FIXED", "MATCH"] }, amountPence: { type: "number" },
        ratio: { type: "number" }, state: { type: "string", enum: ["PROMISED", "RECEIVED", "WITHDRAWN"] },
        sponsorLogoUrl: { type: ["string", "null"] }, sponsorUrl: { type: ["string", "null"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, pledgeId, tenant, ...body }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}/pledges/${encodeURIComponent(pledgeId)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_pledge_delete",
    description: "Delete a pledge on a draft appeal. On a published appeal, set state WITHDRAWN instead.",
    inputSchema: { type: "object", required: ["id", "pledgeId"], properties: { id: { type: "string" }, pledgeId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, pledgeId, tenant }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}/pledges/${encodeURIComponent(pledgeId)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_supporters",
    description: "The people behind an appeal's gifts. Personal data: owner/admin only. Returns { supporters }; the CSV is ?format=csv in the browser.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}/supporters`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_update_add",
    description: "A news update on an appeal: title and body, optional imageUrl (https, own bucket). A draft unless publish: true.",
    inputSchema: {
      type: "object",
      required: ["id", "title", "body"],
      properties: { id: { type: "string" }, title: { type: "string" }, body: { type: "string" }, imageUrl: { type: "string" }, publish: { type: "boolean" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}/updates`, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_update_edit",
    description: "Edit an update; publish: true shows it, false hides it.",
    inputSchema: {
      type: "object",
      required: ["id", "updateId"],
      properties: { id: { type: "string" }, updateId: { type: "string" }, title: { type: "string" }, body: { type: "string" }, imageUrl: { type: ["string", "null"] }, publish: { type: "boolean" }, tenant: TENANT_PROP },
    },
    async handler({ id, updateId, tenant, ...body }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}/updates/${encodeURIComponent(updateId)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_update_delete",
    description: "Delete an update.",
    inputSchema: { type: "object", required: ["id", "updateId"], properties: { id: { type: "string" }, updateId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, updateId, tenant }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}/updates/${encodeURIComponent(updateId)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_appeal_update_email",
    description: "Email a published update, once, to the supporters who asked for updates when they gave (owner/admin). Returns { sent, failed, recipients, suppressed }: suppressed = contact email is off platform-wide (pre-launch), nothing went out, send it later.",
    inputSchema: { type: "object", required: ["id", "updateId"], properties: { id: { type: "string" }, updateId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, updateId, tenant }) {
      const res = await api(tenant)(`/appeals/${encodeURIComponent(id)}/updates/${encodeURIComponent(updateId)}/email`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_admin_appeal_suspend",
    description: "SUPER_ADMIN only, not while impersonating: suspend an appeal at once (stops gifts, shows a neutral 'paused' notice — the takedown duty under the Code of Fundraising Practice) with a reason, or lift a suspension with suspend: false. Rides the stored SUPER_ADMIN login; no tenant argument.",
    inputSchema: { type: "object", required: ["id", "suspend"], properties: { id: { type: "string" }, suspend: { type: "boolean" }, reason: { type: "string", description: "Required when suspending" } } },
    async handler({ id, suspend, reason }) {
      const res = await apiClient()(`/admin/appeals/${encodeURIComponent(id)}/suspend`, { method: "POST", body: JSON.stringify({ suspend, ...(reason ? { reason } : {}) }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
