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

// A form's raw responses (the CSV export) and a published form's completion per member and per child aren't here:
// they are personal data about named parents and children, which UiiQ serves to a browser only (Steve, 22 Oct 2026:
// no AI session reads children's records; UiiQ-platform #1168). They are in the UiiQ dashboard.

function resultsQuery({ classId, group, fundedProjectId, from, to }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ classId, group, fundedProjectId, from, to })) if (v) params.set(k, v);
  return params.toString() ? `?${params}` : "";
}

// FORMS — two things. (1) Signup forms (/forms): the embeddable website
// forms, which double as SURVEYS when isSurvey is set with a surveyUrl and an
// IQEX surveyFormKey — then they can be sent to an audience and their
// responses counted (results are OWNER/ADMIN: they carry parents' free text
// and, in the CSV, names and emails). (2) Members-App forms (/forms/app): the
// venue's own IQForms published into its Members App for an audience
// (everyone | plan | parents | class | group), with completion tracking.
const AUDIENCE_TYPES = ["everyone", "plan", "parents", "class", "group"];
const PURPOSE_PROP = { type: ["string", "null"], enum: ["add_child", null], description: "\"add_child\" = the Members App's \"Add another child\" form (family registration); null = a normal form" };
const RESULTS_FILTER = {
  classId: { type: "string" }, group: { type: "string" }, fundedProjectId: { type: "string" },
  from: { type: "string", description: "ISO date" }, to: { type: "string", description: "ISO date" },
};

export const formsTools = [
  // ── Signup forms / surveys ──
  {
    name: "uiiq_form_list",
    description: "The workspace's signup forms and surveys, newest first (id, name, type inline|popup|slide-in, fields, tags, active, isSurvey, surveyUrl, surveyFormKey, fundedProjectId).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/forms");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_form_create",
    description: "Create a signup form (type inline default | popup | slide-in; fields default email + name; tags are applied to signups). For a survey set isSurvey with surveyUrl (the link sent out) and surveyFormKey (the IQEX form slug its answers arrive under — refused when reserved or claimed by another workspace), optionally fundedProjectId. Counts against the plan's forms limit.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" }, type: { type: "string", enum: ["inline", "popup", "slide-in"] },
        fields: { type: "array", items: { type: "object", required: ["name"], properties: { name: { type: "string" }, required: { type: "boolean" } } } },
        tags: { type: "array", items: { type: "string" } }, settings: { type: "object" },
        isSurvey: { type: "boolean" }, surveyUrl: { type: "string" }, surveyFormKey: { type: "string" }, fundedProjectId: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/forms", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_form_get",
    description: "One signup form / survey in full.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/forms/${encodeURIComponent(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_form_update",
    description: "Update a signup form / survey — only the fields you send change (fields/tags/settings are replaced wholesale when sent). Empty surveyUrl / surveyFormKey / fundedProjectId clears it, so a survey can be un-wired without deleting the form.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }, name: { type: "string" }, type: { type: "string", enum: ["inline", "popup", "slide-in"] },
        fields: { type: "array", items: { type: "object" } }, tags: { type: "array", items: { type: "string" } }, settings: { type: "object" }, active: { type: "boolean" },
        isSurvey: { type: "boolean" }, surveyUrl: { type: "string" }, surveyFormKey: { type: "string" }, fundedProjectId: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      const res = await api(tenant)(`/forms/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_form_delete",
    description: "DELETE a signup form / survey permanently.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/forms/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return { ok: true, id };
    },
  },
  {
    name: "uiiq_form_embed",
    description: "The embed snippet for an active signup form: the <script> tag to paste into any website, plus the iframe URL.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/forms/${encodeURIComponent(id)}/embed`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_form_send",
    description: "SEND a survey's link BY EMAIL to an audience — every subscribed, unsuppressed contact the audience matches (audience: { type:'all' } | { type:'tag', value } | { type:'segment', value:segmentId } | { type:'class', value:<class spec> }; omit for everyone). The form must be a survey with a surveyUrl. Counts against the monthly email limit. The response says sent vs suppressed — when outbound comms are off nothing leaves.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, audience: { type: "object" }, subject: { type: "string" }, intro: { type: "string" }, fundedProjectId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant, ...body }) {
      const res = await post(tenant, `/forms/${encodeURIComponent(id)}/send`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_form_results",
    description: "A survey's numbers — response rate against invitations, per-question aggregates and free-text answers verbatim — filtered by classId, group, fundedProjectId, from, to. OWNER/ADMIN (the answers are parents' prose about children).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, ...RESULTS_FILTER, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...filter }) {
      const qs = resultsQuery(filter);
      const res = await api(tenant)(`/forms/${encodeURIComponent(id)}/results${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Members App forms (published IQForms) ──
  {
    name: "uiiq_form_app_list",
    description: "The IQForms published to the venue's Members App (title, iqformId, audienceType/Value, required, perChild, dueAt, active, position, done count) plus the audience pickers (plans, classes, groups) the office chooses from.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/forms/app");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_form_app_iqforms",
    description: "The venue's own IQEX forms available to publish (id, title, whether Public — only those can go in the app — and whether already published), plus createUrl for the guided IQForm builder. forms is null with a reason when IQEX cannot list them.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/forms/app/iqforms");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_form_app_publish",
    description: "PUBLISH an IQForm into the Members App: ref is the IQForm id or a link containing form-id= (must exist on the venue's own IQEX org and be Public). audienceType everyone|plan|parents|class|group with audienceValue (plan/class/group id); required default true; perChild = one submission per child (not for plan); dueAt ISO date. 409 if already published. purpose \"add_child\" publishes it instead as the Members App Family tab's \"Add another child\" form (children added through it wait for the office's check in the UiiQ dashboard's Awaiting check): it needs family registration switched on (403 otherwise), only one can be active per tenant (409 naming the other), and it always takes one shape whatever else is sent: audience parents, not required, not per child, no due date. Omit purpose (or null) for a normal form.",
    inputSchema: {
      type: "object",
      required: ["ref"],
      properties: {
        ref: { type: "string" }, title: { type: "string" }, audienceType: { type: "string", enum: AUDIENCE_TYPES }, audienceValue: { type: "string" },
        required: { type: "boolean" }, perChild: { type: "boolean" }, dueAt: { type: "string" },
        purpose: PURPOSE_PROP,
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/forms/app", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_form_app_update",
    description: "Update a published Members-App form: title, audience (audienceType + audienceValue), required, perChild, active, position, dueAt (null clears), purpose. Only the fields you send change. purpose \"add_child\" makes it the Members App Family tab's \"Add another child\" form (null makes it a normal form again): while it is one it keeps that form's shape (audience parents, not required, not per child, no due date) whatever else the edit says, and making it the add-a-child form, or showing a hidden one again (active true), needs family registration switched on (403 otherwise) and no other active add-a-child form (409 naming it).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }, title: { type: "string" }, audienceType: { type: "string", enum: AUDIENCE_TYPES }, audienceValue: { type: ["string", "null"] },
        required: { type: "boolean" }, perChild: { type: "boolean" }, active: { type: "boolean" }, position: { type: "number" }, dueAt: { type: ["string", "null"] },
        purpose: PURPOSE_PROP,
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      const res = await api(tenant)(`/forms/app/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_form_app_remove",
    description: "Take a form out of the Members App (deletes the publication; the IQForm itself and its submissions on IQEX are untouched).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/forms/app/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
