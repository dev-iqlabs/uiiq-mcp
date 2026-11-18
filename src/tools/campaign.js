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

// UiiQ answers a refusal as { error }; that sentence is the error, in its words.
async function fail(res) {
  const text = await res.text();
  try { const j = JSON.parse(text); if (j?.error) return new Error(j.error); } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}

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
    name: "uiiq_campaign_update",
    description:
      "Edit a DRAFT or SCHEDULED email campaign: name, subject, bodyHtml and previewText (the inbox preview line). " +
      "Only the fields given are sent and changed; give at least one. name and subject can't be empty or blank (refused " +
      "before anything is sent). Editing the body here replaces any blocks made in " +
      "the editor: the editor then opens this HTML. A SENT or SENDING campaign is refused (409), in UiiQ's words. " +
      "Returns the updated campaign.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string", minLength: 1, description: "Internal label; can't be empty" },
        subject: { type: "string", minLength: 1, description: "Email subject line; can't be empty" },
        bodyHtml: { type: "string", description: "The whole email body as HTML. Editing the body here replaces any blocks made in the editor" },
        previewText: { type: "string", description: "The inbox preview line shown after the subject; an empty string clears it" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, name, subject, bodyHtml, previewText }) {
      const body = Object.fromEntries(Object.entries({ name, subject, bodyHtml, previewText }).filter(([, v]) => v !== undefined));
      if (Object.keys(body).length === 0) throw new Error("Give at least one of name, subject, bodyHtml or previewText.");
      // The route stores a blank subject as none, which would blank the draft's subject line.
      const blank = (v) => typeof v !== "string" || !v.trim();
      if ("name" in body && blank(body.name)) throw new Error("Name can't be empty");
      if ("subject" in body && blank(body.subject)) throw new Error("Subject can't be empty");
      const res = await api(tenant)(`/campaigns/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
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
    description: "Send a test email for a campaign. The address must be the caller's own, a person on this workspace's team, or on its test list (otherwise refused with 403); at most 20 test emails per user per hour (429).",
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
    name: "uiiq_campaign_review",
    description:
      "Ask the IQEX email reviewer about a DRAFT or SCHEDULED campaign (free): the subject's verdict and its spam words, the tone " +
      "against the workspace's Organisation profile, the facts against the Object or Service profile an AI draft was written " +
      "from, readability, the call to action and a hero image brief. The answer is kept on the campaign (aiReview) and returned " +
      "as { review }; it is advice and changes nothing in the email. Checks the saved campaign unless subject, preheader or " +
      "bodyHtml are given. Needs the workspace's email_ai_drafting switch (403); 503 \"The reviewer isn't available yet\" " +
      "until IQEX's endpoint is configured; 30 checks an hour per workspace (429).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        subject: { type: "string", description: "Check this subject instead of the saved one" },
        preheader: { type: "string", description: "Check this preview text instead of the saved one" },
        bodyHtml: { type: "string", description: "Check this body instead of the saved one" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, subject, preheader, bodyHtml, tenant }) {
      const res = await api(tenant)(`/campaigns/${encodeURIComponent(id)}/review`, {
        method: "POST",
        body: JSON.stringify({ subject, preheader, bodyHtml }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_campaign_live_show_drafts",
    description:
      "Make a live shopping show's emails as DRAFT campaigns, in Kim's words: invite (to the 'Live show invites: marketing " +
      "allowed' segment, advised three days before), today (on the show's day; 'tonight' only from 5pm), reminder (a service " +
      "message to everyone who asked on /live, tagged live-show:<ref>, sent within the 2 hours before the start) and replay " +
      "(after the show, at least 2 hours before the offer ends). Nothing is scheduled or sent: staff check and send each one, " +
      "and every send stays behind the workspace's launch stage. At send time the replay is refused once that margin has " +
      "passed, and the reminder if its words were changed; anything still holding a [PENDING ...] placeholder is refused. The show is " +
      "given in Connect's fields: ref, title, start (UTC seconds or ISO with zone), length (minutes), liveUrl (the /live " +
      "page on one of the workspace's own sites), products [{ name, imageUrl?, pricePence: the current price with VAT }], " +
      "delivery (the delivery line) and offer? { code, what, endsAt: the coupon's expiry }. Prices are one per product, never " +
      "a 'was' price. Asking again returns the drafts already made unless replace is set (remakes those still in Drafts). " +
      "dryRun renders them and writes nothing. 400 a bad show; 409 while the workspace is set to soft opt-in (not built); " +
      "30 an hour per workspace (429).",
    inputSchema: {
      type: "object",
      required: ["show"],
      properties: {
        show: {
          type: "object",
          required: ["ref", "title", "start", "liveUrl", "products", "delivery"],
          properties: {
            ref: { type: "string", description: "The show's id in Connect (6 to 64 lower-case letters, digits or hyphens)" },
            plannerId: { type: "string", description: "The NX2U show planner's id, when there is one" },
            title: { type: "string" },
            description: { type: "string" },
            start: { description: "UTC seconds, or an ISO date-time with its zone (Z or +01:00)", oneOf: [{ type: "integer" }, { type: "string" }] },
            length: { type: "integer", description: "Minutes, 5 to 720 (default 60)" },
            liveUrl: { type: "string", description: "https address of the shop's /live page" },
            products: {
              type: "array",
              minItems: 1,
              maxItems: 12,
              items: {
                type: "object",
                required: ["name", "pricePence"],
                properties: { name: { type: "string" }, imageUrl: { type: "string" }, pricePence: { type: "integer", description: "The current price including VAT, in pence" } },
              },
            },
            delivery: { type: "string", description: "The delivery line shown beside the prices, e.g. \"Free UK delivery\"" },
            returns: { type: "string", description: "The shop's returns line for the show (Connect's setting)" },
            youtubeId: { type: "string", description: "The show's YouTube video id, for the reminder's \"Or on YouTube\" line" },
            offer: {
              type: "object",
              required: ["code", "what", "endsAt"],
              properties: {
                code: { type: "string" },
                what: { type: "string", description: "What the code does, from the coupon's settings, e.g. \"10% off\"" },
                endsAt: { description: "The coupon's expiry: UTC seconds or an ISO date-time with its zone", oneOf: [{ type: "integer" }, { type: "string" }] },
                conditions: { type: "string", description: "Its key conditions, from the coupon's settings, e.g. \"One use per customer.\"" },
              },
            },
          },
        },
        sends: { type: "array", items: { type: "string", enum: ["invite", "today", "reminder", "replay"] }, description: "Which to make (default all four)" },
        replace: { type: "boolean", description: "Remake the ones still in Drafts" },
        change: {
          type: "string",
          enum: ["moved", "cancelled"],
          description:
            "The show has moved (give the show at its new time) or is cancelled (Kim K6.5): its unsent emails are removed, " +
            "and a moved or cancelled service message is made for everyone who asked for a reminder (with the four made again " +
            "at the new time for a move). Drafts only. A cancelled message takes each person it reaches off the reminder list.",
        },
        dryRun: { type: "boolean", description: "Render them and write nothing" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ show, sends, replace, change, dryRun, tenant }) {
      const res = await api(tenant)("/campaigns/live-show", {
        method: "POST",
        body: JSON.stringify({ show, sends, replace, change, dryRun }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
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
  {
    name: "uiiq_campaign_send",
    description: "SEND an email campaign to its audience now (subscribed contacts, or the CRM pipeline for a prospects campaign — gated on `prospect_campaigns`). Counts against the plan's monthly email allowance and cannot be recalled. With test: true only ONE copy goes to testEmail (default: you) and nothing else changes. Returns { recipients, sent, failed }.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, test: { type: "boolean" }, testEmail: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, test, testEmail, tenant }) {
      const res = await api(tenant)(`/campaigns/${encodeURIComponent(id)}/send`, { method: "POST", body: JSON.stringify(test ? { test: true, testEmail } : {}) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_campaign_ab_test_get",
    description: "The A/B subject-line test on a campaign (subjectA/B, splitPercent, winnerMetric, winnerPickAt), or null when there is none.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/campaigns/${encodeURIComponent(id)}/ab-test`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_campaign_ab_test_set",
    description: "Create or replace the A/B subject-line test on a DRAFT or SCHEDULED campaign: subjectA, subjectB, splitPercent 5-45 (default 20), winnerMetric open (default) | click, winnerPickAt (ISO). Not available on a campaign to prospects.",
    inputSchema: { type: "object", required: ["id", "subjectA", "subjectB"], properties: { id: { type: "string" }, subjectA: { type: "string" }, subjectB: { type: "string" }, splitPercent: { type: "integer", minimum: 5, maximum: 45 }, winnerMetric: { type: "string", enum: ["open", "click"] }, winnerPickAt: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/campaigns/${encodeURIComponent(id)}/ab-test`, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_campaign_ab_test_delete",
    description: "REMOVE the A/B test from a campaign (back to a single subject).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/campaigns/${encodeURIComponent(id)}/ab-test`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_marketing_calendar",
    description: "The marketing calendar for a window of up to 100 days: events (start to end), scheduled/published social posts (snippet, platforms) and campaign sends. Each series is left out when its feature (events / socials / email_campaigns) is off for the tenant.",
    inputSchema: { type: "object", required: ["from", "to"], properties: { from: { type: "string", description: "ISO date" }, to: { type: "string", description: "ISO date" }, tenant: TENANT_PROP } },
    async handler({ from, to, tenant }) {
      const qs = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const res = await api(tenant)(`/marketing/calendar${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
