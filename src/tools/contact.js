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


export const contactTools = [
  {
    name: "uiiq_contact_list",
    description: "List UIIQ contacts. Optionally search by name or email.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string" },
        limit: { type: "number", description: "Max results (default 50)" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ search, limit = 50, tenant } = {}) {
      const params = new URLSearchParams({ limit });
      // The API reads `q`, not `search`. This sent `search`, which the API
      // ignored — so a filtered call returned page one alphabetically with a
      // clean 200, and looked like the contact simply wasn't there. Silently
      // wrong is the dangerous kind of broken; send the name the API reads.
      if (search) params.set("q", search);
      const res = await api(tenant)(`/contacts?${params}`);
      const data = await res.json();
      return Array.isArray(data) ? data : data.contacts ?? [];
    }
  },
  {
    name: "uiiq_contact_get",
    description: "Get a UIIQ contact by ID.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      }
    },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/contacts/${id}`);
      if (!res.ok) throw new Error(`Contact not found: ${id}`);
      return res.json();
    }
  },
  {
    name: "uiiq_contact_update",
    description:
      "Edit one contact, or archive / restore it. Only the fields you send change. tags replaces the whole list. email must be valid and unique in the tenant (409 otherwise). archived: false restores a removed contact.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        tags: { type: "array", items: { type: "string" }, description: "Replaces the whole tag list" },
        subscribed: { type: "boolean", description: "Email marketing opt-in" },
        smsSubscribed: { type: "boolean", description: "SMS marketing opt-in" },
        archived: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (Object.keys(body).length === 0) throw new Error("Send at least one field to change");
      const res = await api(tenant)(`/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_contact_delete",
    description:
      "Remove a contact — SOFT: it is archived, leaving every list and every campaign audience, but its send history, donations and student links survive so past campaign stats stay honest. Restore with uiiq_contact_update { archived: false }.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/contacts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { ok: true, archived: id }
    },
  },
  {
    name: "uiiq_contact_convert",
    description:
      "Move marketing Contacts into the relationship layer as Businesses (PROSPECT / CUSTOMER / SUPPLIER / PARTNER) — for the Xero-export-landed-in-the-mailing-list case. By default the contacts are archived afterwards (a client is not a campaign audience); pass archiveContacts false to keep them live in both places. Safe to run twice: a live Business whose name already matches is reused, not duplicated. Max 500 ids per call.",
    inputSchema: {
      type: "object",
      required: ["contactIds", "type"],
      properties: {
        contactIds: { type: "array", items: { type: "string" }, description: "Up to 500" },
        type: { type: "string", enum: ["PROSPECT", "CUSTOMER", "SUPPLIER", "PARTNER"] },
        archiveContacts: { type: "boolean", description: "Default true" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ contactIds, type, archiveContacts, tenant }) {
      const res = await api(tenant)("/contacts/convert", {
        method: "POST",
        body: JSON.stringify({ contactIds, type, ...(archiveContacts !== undefined ? { archiveContacts } : {}) }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { ok, type, created, linked, archived, total, businessIds }
    },
  },
];
