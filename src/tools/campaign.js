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

/**
 * Campaign + segment tools. NB: uiiq_campaign_list already lives in
 * automation.js — these add the rest of the CLI `campaign` group.
 */
export const campaignTools = [
  {
    name: "uiiq_campaign_get",
    description: "Get an email campaign by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/campaigns/${id}`);
      if (!res.ok) throw new Error(`Campaign not found: ${id}`);
      return res.json();
    },
  },
  {
    name: "uiiq_campaign_create",
    description: "Create a new email campaign.",
    inputSchema: {
      type: "object",
      required: ["name", "subject"],
      properties: {
        name: { type: "string", description: "Internal label" },
        subject: { type: "string", description: "Email subject line" },
        templateId: { type: "string" },
        segmentId: { type: "string" },
        responseButtons: {
          type: "boolean",
          description:
            "Carry the three reply buttons (Interested / Not interested / Tell me more) under the email. " +
            "Each press is recorded against the recipient; Interested and Tell me more move a matched prospect to " +
            "QUALIFIED and raise a task on the tenant's CRM follow-up board (uiiq_tenant_settings_update crmFollowUpBoardId).",
        },
        responseLabels: {
          type: "object",
          description:
            "Wording for the buttons, keyed INTERESTED / NOT_INTERESTED / TELL_ME_MORE (e.g. { TELL_ME_MORE: 'Book a demo' }). " +
            "The three meanings stay fixed; only the words change. Up to 40 characters each.",
          properties: {
            INTERESTED: { type: "string" },
            NOT_INTERESTED: { type: "string" },
            TELL_ME_MORE: { type: "string" },
          },
        },
        prospectAudience: {
          type: "object",
          description:
            "Send to the CRM pipeline instead of the contact list: businesses matching these filters, one email each " +
            "(main contact, else the business address; do-not-email and anyone emailed from the CRM in the last 3 days " +
            "are left out). Each send lands on the prospect's journey. GATED: the tenant needs the `prospect_campaigns` " +
            "feature ticked or the send is refused — preview with uiiq_campaign_prospect_audience first. " +
            "Stages default to the open ones; includeClosed adds WON and LOST.",
          properties: {
            stages: { type: "array", items: { type: "string", enum: ["NEW", "CONTACTED", "QUALIFIED", "QUOTED", "WON", "LOST"] } },
            category: { type: "string", description: "Exact category, case-insensitive" },
            town: { type: "string", description: "Town contains" },
            tags: { type: "array", items: { type: "string" }, description: "Every one of these tags" },
            includeClosed: { type: "boolean" },
            type: { type: "string", enum: ["PROSPECT", "CUSTOMER", "SUPPLIER", "PARTNER"], description: "Defaults to PROSPECT" },
          },
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ name, subject, templateId, segmentId, responseButtons, responseLabels, prospectAudience, tenant }) {
      const res = await api(tenant)("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name, subject, templateId, segmentId,
          ...(responseButtons !== undefined ? { responseButtons } : {}),
          ...(responseLabels ? { responseLabels } : {}),
          ...(prospectAudience ? { sendTo: "prospects", sendToProspects: prospectAudience } : {}),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_campaign_prospect_audience",
    description:
      "Preview who a campaign to prospects would go to — nothing is sent or created. Returns `enabled` (whether the " +
      "tenant's `prospect_campaigns` feature is ticked), how many businesses matched, how many would be sent, what was " +
      "left out (not marked as a company — sole traders, partnerships and unmarked businesses are never cold-emailed / asked not to be emailed / no address / emailed in the last 3 days / duplicate address) and a sample. " +
      "Same filters as uiiq_campaign_create's prospectAudience.",
    inputSchema: {
      type: "object",
      properties: {
        stages: { type: "array", items: { type: "string", enum: ["NEW", "CONTACTED", "QUALIFIED", "QUOTED", "WON", "LOST"] } },
        category: { type: "string" },
        town: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        includeClosed: { type: "boolean" },
        type: { type: "string", enum: ["PROSPECT", "CUSTOMER", "SUPPLIER", "PARTNER"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...spec } = {}) {
      const res = await api(tenant)("/campaigns/prospect-audience", { method: "POST", body: JSON.stringify(spec) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_campaign_responses",
    description:
      "Who pressed which reply button on a campaign that carried them: counts for Tell me more / Interested / " +
      "Not interested (each recipient's latest press), one row per recipient with their contact and matched prospect " +
      "(null when they are not in the pipeline — nothing is invented), and how many presses looked like a corporate " +
      "link scanner and were ignored.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/campaigns/${encodeURIComponent(id)}/responses`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_campaign_duplicate",
    description: "Duplicate an existing campaign.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/campaigns/${id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_campaign_test_send",
    description: "Send a test email for a campaign to a given address.",
    inputSchema: {
      type: "object",
      required: ["id", "email"],
      properties: { id: { type: "string" }, email: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, email, tenant }) {
      const res = await api(tenant)("/campaigns/test-send", {
        method: "POST",
        body: JSON.stringify({ campaignId: id, email }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { ok: true, email };
    },
  },
  {
    name: "uiiq_segment_list",
    description: "List contact segments.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/segments");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_segment_preview",
    description: "Preview which contacts match a segment.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)("/segments/preview", {
        method: "POST",
        body: JSON.stringify({ segmentId: id }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
