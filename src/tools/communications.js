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


export const communicationsTools = [
  // ── Press Releases ──────────────────────────────────────────────────────

  {
    name: "uiiq_press_release_list",
    description:
      "List press releases for the current tenant. Returns headline, brand, announcement type, status (GENERATING | DRAFT | APPROVED | SENT | ARCHIVED), and dates. " +
      "Optionally filter by status.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by status: GENERATING | DRAFT | APPROVED | SENT | ARCHIVED",
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ status, tenant } = {}) {
      const qs = status ? `?status=${status}` : "";
      const res = await api(tenant)(`/communications/press-releases${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  {
    name: "uiiq_press_release_get",
    description:
      "Get a single press release by ID, including the full headline, body, notes to editors, distribution log, and embargo date.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Press release ID" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/communications/press-releases/${id}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  {
    name: "uiiq_press_release_create",
    description:
      "Create a new press release from a brief and trigger Chris (AI Communications Lead) to draft it. " +
      "The release starts in GENERATING status; poll uiiq_press_release_get until status is DRAFT (usually 10–30 seconds). " +
      "brief_data fields: brand, announcement_type, key_facts (required), quote1_from, quote1_text, press_enquiries_contact, " +
      "headline_suggestion, quote2_from, quote2_text, target_audience, embargo_date, background.",
    inputSchema: {
      type: "object",
      required: ["brand", "announcementType", "briefData"],
      properties: {
        brand: {
          type: "string",
          description: "uiiq | iqex | acts-direct | milestone-ranch | ultimate-image",
        },
        announcementType: {
          type: "string",
          description: "Product launch | New feature | Partnership | Event | Award / milestone | General release",
        },
        briefData: {
          type: "object",
          description: "Raw brief — key_facts, quote1_from, quote1_text, press_enquiries_contact required; all other fields optional",
        },
        tenant: TENANT_PROP,
      },
    },
    async handler(body) {
      const res = await api(tenant)("/communications/press-releases", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  {
    name: "uiiq_press_release_update",
    description:
      "Update a press release body, headline, or notes to editors. Only works when status is GENERATING, DRAFT, or APPROVED.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id:             { type: "string" },
        headline:       { type: "string" },
        body:           { type: "string" },
        notesToEditors: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...rest }) {
      const res = await api(tenant)(`/communications/press-releases/${id}`, {
        method: "PATCH",
        body: JSON.stringify(rest),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  {
    name: "uiiq_press_release_approve",
    description:
      "Approve a press release (must be in DRAFT status). Moves it to APPROVED and enables distribution.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/communications/press-releases/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  {
    name: "uiiq_press_release_redraft",
    description:
      "Ask Chris (AI Communications Lead) to produce a new draft of the press release. Returns the new draft without overwriting — caller must call uiiq_press_release_update to apply it. " +
      "Optionally supply extraContext to steer the redraft (e.g. 'focus more on the local angle').",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id:           { type: "string" },
        extraContext: { type: "string", description: "Additional direction for this draft" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, extraContext, tenant }) {
      const res = await api(tenant)(`/communications/press-releases/${id}/redraft`, {
        method: "POST",
        body: JSON.stringify({ extraContext }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  {
    name: "uiiq_press_release_distribute",
    description:
      "Distribute an APPROVED press release. Select wire services (pressat, prlog) and/or email journalist contacts by ID. " +
      "Email sends immediately via SendGrid; Pressat/PRLog trigger the n8n wire workflow. Returns distribution result per channel.",
    inputSchema: {
      type: "object",
      required: ["id", "targets"],
      properties: {
        id:         { type: "string" },
        targets: {
          type: "array",
          description: "One or more of: pressat | prlog | email",
          items: { type: "string", enum: ["pressat", "prlog", "email"] },
          minItems: 1,
        },
        contactIds: {
          type: "array",
          description: "Journalist contact IDs to email (required when 'email' is in targets)",
          items: { type: "string" },
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, targets, contactIds = [], tenant }) {
      const res = await api(tenant)(`/communications/press-releases/${id}/distribute`, {
        method: "POST",
        body: JSON.stringify({ targets, contactIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Journalist Contacts ─────────────────────────────────────────────────

  {
    name: "uiiq_journalist_contact_list",
    description:
      "List journalist contacts available to this tenant — includes global platform contacts (Grimsby Live, BBC Humberside, TechCrunch, etc.) plus any contacts the tenant has added. " +
      "Use contact IDs from this list when calling uiiq_press_release_distribute.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/communications/journalist-contacts");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  {
    name: "uiiq_journalist_contact_add",
    description: "Add a journalist contact for this tenant.",
    inputSchema: {
      type: "object",
      required: ["name", "email", "publication"],
      properties: {
        name:        { type: "string" },
        email:       { type: "string" },
        publication: { type: "string" },
        beat:        { type: "string", description: "e.g. local, tech, events" },
        region:      { type: "string", description: "e.g. Lincolnshire" },
        notes:       { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler(body) {
      const res = await api(tenant)("/communications/journalist-contacts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
