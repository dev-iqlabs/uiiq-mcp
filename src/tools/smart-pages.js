import { apiClient } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

const RECHECK = "Re-list the pending pages with uiiq_smart_pages_approvals and check the page again before approving.";

async function fail(res) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    if (j?.error) {
      // 409 "changed": never hand back IQEX's new version, so nothing can approve
      // it without the page being looked at again. "busy" means try again.
      if (j.kind === "changed") return new Error(`${j.error} ${RECHECK}`);
      return new Error(j.error);
    }
  } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}
const post = (tenant, path, body) => api(tenant)(path, { method: "POST", body: JSON.stringify(body) });

// SMART PAGES — the approval door for IQEX smart pages (tributes, memorials)
// and their guestbook messages. A page approved here goes PUBLIC; a guestbook
// message approved here shows on the tribute. Tenant scope: the `smart_pages`
// feature must be enabled, the caller OWNER/ADMIN and the workspace linked to
// IQEX. staff:true = every workspace's queue, SUPER_ADMIN in their own session.
const STAFF_PROP = { type: "boolean", description: "UIIQ staff view across every workspace (SUPER_ADMIN, not impersonating)" };

// Live pages (take down / put back) use separate staff routes under /admin,
// which UIIQ answers only for a live SUPER_ADMIN who is not impersonating, so
// staff:true can't be combined with a tenant.
function livePath(staff, tenant, slug) {
  if (staff && tenant) throw new Error("staff:true acts across every workspace; leave tenant out.");
  if (slug === undefined) return staff ? "/admin/smart-pages/pages" : "/smart-pages/pages";
  const s = encodeURIComponent(slug);
  return staff ? `/admin/smart-pages/pages/${s}` : `/smart-pages/pages/${s}`;
}
const LIVE_STAFF_PROP = { type: "boolean", description: "As UIIQ staff, any workspace's page (SUPER_ADMIN in their own session; not with tenant)" };
const LIST_STATUSES = ["published", "pending_approval", "draft", "taken_down"];
const CONFIRM_PROP = { type: "boolean", description: "true = do it; omit for the dry run" };

/** The page as the live list shows it (newest 200 of that status), or null. */
async function findLivePage(staff, tenant, slug, status) {
  const res = await api(staff ? null : tenant)(livePath(staff, tenant) + "?status=" + encodeURIComponent(status));
  if (!res.ok) throw await fail(res);
  const d = await res.json();
  if (d.available === false) return { unavailable: true };
  const p = (d.pages ?? []).find((x) => x.slug === slug);
  return p ? { page: { slug: p.slug, name: p.name ?? null, workspace: p.org_name ?? null, status: p.status, url: p.url, taken_down: p.taken_down ?? null } } : null;
}

/**
 * Take-down and put-back act on PUBLIC pages, and the lists an agent reads
 * first carry public text (page names, guestbook messages). So without
 * confirm: true they only say what they would do and change nothing (Lucas,
 * uiiq-mcp #74 M1).
 */
async function dryRun(action, { slug, staff, tenant }) {
  const status = action === "take_down" ? "published" : "taken_down";
  const found = await findLivePage(staff, tenant, slug, status);
  const out = { dryRun: true, wouldDo: action, door: staff ? "staff" : "workspace", changed: false };
  if (found?.unavailable) return { ...out, note: "Taking pages down isn't available yet: IQEX needs updating." };
  if (!found) return { ...out, page: null, note: `No ${status} page ${slug} among the newest 200 ${status} pages for this ${staff ? "platform" : "workspace"}.` };
  const note = action === "put_back" && found.page.taken_down && found.page.taken_down.can_put_back === false
    ? "Taken down by support: only staff:true can put it back."
    : "Check this is the page the person means, then call again with confirm: true.";
  return { ...out, page: found.page, note };
}

export const smartPagesTools = [
  {
    name: "uiiq_smart_pages_approvals",
    description: "Smart pages and guestbook messages waiting for approval — this workspace's, or every workspace's with staff:true. Each page carries `version` (from an IQEX with take-down): pass it to uiiq_smart_pages_page_approve after checking the page. Needs the `smart_pages` feature enabled and OWNER/ADMIN.",
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
    description: "APPROVE a smart page by slug — it goes PUBLIC. IQEX records the approver, the door and the optional orderRef. `version` is REQUIRED whenever the page's row in uiiq_smart_pages_approvals has one: take it from that list after checking the page. If the page changed since, IQEX refuses with 409 \"The page changed since you checked it\": re-list with uiiq_smart_pages_approvals and check it again. Only a row with no version (an older IQEX) approves without one. Needs the `smart_pages` feature and OWNER/ADMIN (or staff:true as SUPER_ADMIN).",
    inputSchema: {
      type: "object",
      required: ["slug"],
      properties: {
        slug: { type: "string" },
        orderRef: { type: "string", description: "Order reference to file with the approval" },
        version: { type: "string", description: "The page's `version` from uiiq_smart_pages_approvals: what was checked. Required when that row has one." },
        staff: STAFF_PROP,
        tenant: TENANT_PROP,
      },
    },
    async handler({ slug, orderRef, version, staff, tenant }) {
      if (!version) {
        // Allowed only when the pending row has none (an older IQEX).
        const res = await api(tenant)(`/smart-pages/approvals${staff ? "?scope=staff" : ""}`);
        if (!res.ok) throw await fail(res);
        const row = ((await res.json()).pages ?? []).find((p) => p.slug === slug);
        if (row?.version) throw new Error(`This page has a version: check the page in uiiq_smart_pages_approvals and pass its version.`);
      }
      const body = { action: "approve", orderRef, ...(version ? { version } : {}), ...(staff ? { scope: "staff" } : {}) };
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
  {
    name: "uiiq_smart_pages_live_pages",
    description: "Smart pages by status, newest first, at most 200: this workspace's, or every workspace's with staff:true. Default status published (the live ones); taken_down lists pages taken down, each with taken_down {at, by, reason, from, by_staff, can_put_back}. `available: false` means IQEX can't list pages yet. Needs the `smart_pages` feature and OWNER/ADMIN.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: LIST_STATUSES, description: "Default published" },
        staff: LIVE_STAFF_PROP,
        tenant: TENANT_PROP,
      },
    },
    async handler({ status = "published", staff, tenant } = {}) {
      const path = livePath(staff, tenant) + "?status=" + encodeURIComponent(status);
      const res = await api(staff ? null : tenant)(path);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_smart_pages_page_take_down",
    description: "TAKE DOWN a published smart page: scanners see \"This page is not available\" until it is put back. Without confirm: true it is ALWAYS a dry run that shows the page (name, workspace, status) and changes nothing. The reason is required and the organisation sees it (as staff, don't name the person who complained). A take-down with staff:true can only be put back by staff. 409 \"being made\" means IQEX was busy: try again. Confirm with the person before calling with confirm: true.",
    inputSchema: {
      type: "object",
      required: ["slug", "reason"],
      properties: {
        slug: { type: "string" },
        reason: { type: "string", maxLength: 1000, description: "Why the page is coming down" },
        staff: LIVE_STAFF_PROP,
        tenant: TENANT_PROP,
        confirm: CONFIRM_PROP,
      },
    },
    async handler({ slug, reason, staff, tenant, confirm }) {
      const path = livePath(staff, tenant, slug);
      if (confirm !== true) return dryRun("take_down", { slug, staff, tenant });
      const res = await post(staff ? null : tenant, path, { action: "take_down", reason });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_smart_pages_page_put_back",
    description: "Put a taken-down smart page back on its address. Without confirm: true it is ALWAYS a dry run that shows the page and who took it down, and changes nothing. A page taken down by support (staff) answers 403 to a workspace: only staff:true can put it back. 409 \"being made\" means IQEX was busy: try again. Confirm with the person before calling with confirm: true.",
    inputSchema: {
      type: "object",
      required: ["slug"],
      properties: { slug: { type: "string" }, staff: LIVE_STAFF_PROP, tenant: TENANT_PROP, confirm: CONFIRM_PROP },
    },
    async handler({ slug, staff, tenant, confirm }) {
      const path = livePath(staff, tenant, slug);
      if (confirm !== true) return dryRun("put_back", { slug, staff, tenant });
      const res = await post(staff ? null : tenant, path, { action: "put_back" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
