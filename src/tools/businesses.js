import { apiClient } from "../auth.js";

// Per-business detail beyond the pipeline row (crm.js owns list / get / create /
// update / import): the people at a company, the templated outreach email sent
// from its row, and what a hard delete would destroy. Nothing here can create
// a marketing Contact — a BusinessPerson only becomes one on a recorded opt-in.
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

export const businessesTools = [
  {
    name: "uiiq_business_delete_impact",
    description: "What a HARD delete of a business would destroy — interactions (calls, emails, notes), people at the business, prospect-search candidate links, each with a count — and any blockers that forbid it. Read this before deleting; the archive (uiiq_prospect_update archived true) is the reversible option.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Business id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/businesses/${encodeURIComponent(id)}/delete-impact`);
      if (!res.ok) throw await fail(res);
      return res.json(); // { id, name, destroys: [{ label, count }], blockers }
    },
  },

  // ── Templated outreach email from the pipeline row ──
  {
    name: "uiiq_business_email_preview",
    description: "Render an email template against a business (merge fields filled from the business, its primary person, the tenant and you) WITHOUT sending: { template, to, from, subject, html, legalFormWarning }. `to` is the primary person's email, else the business's. Same renderer as the send, so what you see is what goes. legalFormWarning is set for a sole trader / partnership (marketing to an individual needs consent).",
    inputSchema: { type: "object", required: ["id", "templateId"], properties: { id: { type: "string", description: "Business id" }, templateId: { type: "string", description: "Email template id (uiiq_template_list)" }, tenant: TENANT_PROP } },
    async handler({ id, templateId, tenant }) {
      const qs = `?templateId=${encodeURIComponent(templateId)}`;
      const res = await api(tenant)(`/businesses/${encodeURIComponent(id)}/email${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_business_email_send",
    description:
      "SEND a templated email to one business from the tenant's configured sender (reply-to = the tenant's reply-to, else you). Logs an OUTBOUND EMAIL interaction with a 5-day follow-up, moves a NEW business to CONTACTED (never regresses a later stage), and counts against the monthly email limit. " +
      "Refused (409) when the business or the recipient said no to email or the address is on the do-not-email list. responseButtons adds the three signed reply buttons (Interested / Not interested / Tell me more; responseLabels renames them). " +
      "Under the pre-launch comms gate nothing leaves: the interaction is still logged and the reply is { sent: false, suppressed: true }. Open tracking is always off for outreach (PECR).",
    inputSchema: {
      type: "object",
      required: ["id", "templateId", "to"],
      properties: {
        id: { type: "string", description: "Business id" },
        templateId: { type: "string" },
        to: { type: "string", description: "Recipient address — usually the `to` from uiiq_business_email_preview" },
        personalNote: { type: "string", description: "A note placed above the template body (max 2000 chars)" },
        responseButtons: { type: "boolean" },
        responseLabels: { type: "object", description: "Optional { INTERESTED, NOT_INTERESTED, TELL_ME_MORE } button labels", properties: { INTERESTED: { type: "string" }, NOT_INTERESTED: { type: "string" }, TELL_ME_MORE: { type: "string" } } },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/businesses/${encodeURIComponent(id)}/email`, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json(); // { sent, suppressed, to, subject, template, stage, interactionId }
    },
  },

  // ── The people at a company ──
  {
    name: "uiiq_business_people_list",
    description: "Everyone at a business, primary contact first then by name: id, name, role, email, phone, isPrimary, contactId (set only once they have opted in as a Contact).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Business id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/businesses/${encodeURIComponent(id)}/people`);
      if (!res.ok) throw await fail(res);
      return res.json(); // { people }
    },
  },
  {
    name: "uiiq_business_person_add",
    description: "Add a person to a business. name is required; email and phone are cleaned (a pasted mailto: becomes a plain address). The first person added becomes the primary contact whatever you say; isPrimary true on a later one takes the role over.",
    inputSchema: { type: "object", required: ["id", "name"], properties: { id: { type: "string", description: "Business id" }, name: { type: "string" }, role: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, isPrimary: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/businesses/${encodeURIComponent(id)}/people`, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json(); // { person }
    },
  },
  {
    name: "uiiq_business_person_update",
    description:
      "Edit one person at a business: name, role, email, phone; isPrimary true makes them the main contact (you cannot untick the only main contact — promote someone else instead). " +
      "doNotEmail true records their own no to email; setting it back to false is OWNER/ADMIN only and needs doNotEmailReason (logged on the journey).",
    inputSchema: {
      type: "object",
      required: ["id", "personId"],
      properties: { id: { type: "string", description: "Business id" }, personId: { type: "string" }, name: { type: "string" }, role: { type: ["string", "null"] }, email: { type: ["string", "null"] }, phone: { type: ["string", "null"] }, isPrimary: { type: "boolean" }, doNotEmail: { type: "boolean" }, doNotEmailReason: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, personId, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (!Object.keys(body).length) throw new Error("Send at least one field to change");
      const res = await api(tenant)(`/businesses/${encodeURIComponent(id)}/people/${encodeURIComponent(personId)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json(); // { person }
    },
  },
  {
    name: "uiiq_business_person_delete",
    description: "Remove a person from a business. Refused while they are the main contact and others remain (make someone else primary first). Notes attributed to them keep their text and lose the name; the reply says how many (notesKept).",
    inputSchema: { type: "object", required: ["id", "personId"], properties: { id: { type: "string", description: "Business id" }, personId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, personId, tenant }) {
      const res = await api(tenant)(`/businesses/${encodeURIComponent(id)}/people/${encodeURIComponent(personId)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json(); // { deleted, notesKept }
    },
  },
];
