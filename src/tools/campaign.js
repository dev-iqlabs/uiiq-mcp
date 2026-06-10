import { apiClient } from "../auth.js";

/**
 * Campaign + segment tools. NB: uiiq_campaign_list already lives in
 * automation.js — these add the rest of the CLI `campaign` group.
 */
export const campaignTools = [
  {
    name: "uiiq_campaign_get",
    description: "Get an email campaign by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/campaigns/${id}`);
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
      },
    },
    async handler({ name, subject, templateId, segmentId }) {
      const res = await apiClient()("/campaigns", {
        method: "POST",
        body: JSON.stringify({ name, subject, templateId, segmentId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_campaign_duplicate",
    description: "Duplicate an existing campaign.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/campaigns/${id}/duplicate`, { method: "POST" });
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
      properties: { id: { type: "string" }, email: { type: "string" } },
    },
    async handler({ id, email }) {
      const res = await apiClient()("/campaigns/test-send", {
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
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/segments");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_segment_preview",
    description: "Preview which contacts match a segment.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()("/segments/preview", {
        method: "POST",
        body: JSON.stringify({ segmentId: id }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
