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
const post = (tenant, path, body) => api(tenant)(path, { method: "POST", body: JSON.stringify(body) });

// SMART PAGES — the approval door for IQEX smart pages (tributes, memorials)
// and their guestbook messages. A page approved here goes PUBLIC; a guestbook
// message approved here shows on the tribute. Tenant scope: the `smart_pages`
// feature must be enabled, the caller OWNER/ADMIN and the workspace linked to
// IQEX. staff:true = every workspace's queue, SUPER_ADMIN in their own session.
const STAFF_PROP = { type: "boolean", description: "UIIQ staff view across every workspace (SUPER_ADMIN, not impersonating)" };

export const smartPagesTools = [
  {
    name: "uiiq_smart_pages_approvals",
    description: "Smart pages and guestbook messages waiting for approval — this workspace's, or every workspace's with staff:true. Needs the `smart_pages` feature enabled and OWNER/ADMIN.",
    inputSchema: { type: "object", properties: { staff: STAFF_PROP, tenant: TENANT_PROP } },
    async handler({ staff, tenant } = {}) {
      const qs = staff ? "?scope=staff" : "";
      const res = await api(tenant)(`/smart-pages/approvals${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_smart_pages_page_approve",
    description: "APPROVE a smart page by slug — it goes PUBLIC. IQEX records the approver, the door and the optional orderRef. Needs the `smart_pages` feature and OWNER/ADMIN (or staff:true as SUPER_ADMIN).",
    inputSchema: { type: "object", required: ["slug"], properties: { slug: { type: "string" }, orderRef: { type: "string", description: "Order reference to file with the approval" }, staff: STAFF_PROP, tenant: TENANT_PROP } },
    async handler({ slug, orderRef, staff, tenant }) {
      const body = { action: "approve", orderRef, ...(staff ? { scope: "staff" } : {}) };
      const res = await post(tenant, `/smart-pages/approvals/${encodeURIComponent(slug)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_smart_pages_page_send_back",
    description: "Send a smart page back to its author with a note saying what needs changing (it stays unpublished). Needs the `smart_pages` feature and OWNER/ADMIN (or staff:true as SUPER_ADMIN).",
    inputSchema: { type: "object", required: ["slug", "note"], properties: { slug: { type: "string" }, note: { type: "string" }, staff: STAFF_PROP, tenant: TENANT_PROP } },
    async handler({ slug, note, staff, tenant }) {
      const body = { action: "send_back", note, ...(staff ? { scope: "staff" } : {}) };
      const res = await post(tenant, `/smart-pages/approvals/${encodeURIComponent(slug)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_smart_pages_message_moderate",
    description: "Approve or reject a guestbook message on a smart page (numeric message id). Nothing a visitor writes shows on the tribute until it is approved here. Needs the `smart_pages` feature and OWNER/ADMIN (or staff:true as SUPER_ADMIN).",
    inputSchema: { type: "object", required: ["id", "action"], properties: { id: { type: "number" }, action: { type: "string", enum: ["approve", "reject"] }, staff: STAFF_PROP, tenant: TENANT_PROP } },
    async handler({ id, action, staff, tenant }) {
      const body = { action, ...(staff ? { scope: "staff" } : {}) };
      const res = await post(tenant, `/smart-pages/messages/${encodeURIComponent(id)}`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
