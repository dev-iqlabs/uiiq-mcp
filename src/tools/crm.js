import { apiClient } from "../auth.js";

// Prospects, suppliers and partners — the tenant's BUSINESS relationships, as
// distinct from marketing contacts. Backed by UiiQ's Business model
// (UiiQ-platform #450): a company with a type, a six-stage pipeline, address,
// notes, tags, and free custom fields so nothing from an imported list is lost.
//
// ⚠️ Not the same thing as uiiq_retail_suppliers, which is the RetailSupplier
// stock-purchasing list. These are the relationships; that is the stock ledger.
//
// Nothing here can create a marketing audience. A business's people are
// BusinessPerson rows and only become a Contact when someone records an opt-in.

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

const TYPES = ["PROSPECT", "CUSTOMER", "SUPPLIER", "PARTNER"];
const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "QUOTED", "WON", "LOST"];

export const crmTools = [
  {
    name: "uiiq_prospect_list",
    description:
      "List a tenant's prospects (or suppliers / partners / business customers) with pipeline stage counts. " +
      "Filter by type, stage, or a search across name, town, postcode and category. " +
      "This is the relationship list — for stock suppliers use uiiq_retail_suppliers.",
    inputSchema: {
      type: "object",
      properties: {
        type:  { type: "string", enum: TYPES, description: "Defaults to PROSPECT" },
        stage: { type: "string", enum: STAGES, description: "Only businesses at this pipeline stage" },
        q:     { type: "string", description: "Search name / town / postcode / category" },
        archived: { type: "boolean", description: "Show archived instead of live (default false)" },
        limit: { type: "number", description: "Max rows, up to 1000 (default 200)" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ type = "PROSPECT", stage, q, archived, limit, tenant } = {}) {
      const params = new URLSearchParams({ type });
      if (stage) params.set("stage", stage);
      if (q) params.set("q", q);
      if (archived) params.set("archived", "1");
      if (limit != null) params.set("limit", String(limit));
      const res = await api(tenant)(`/businesses?${params}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { businesses, stageCounts }
    },
  },

  {
    name: "uiiq_prospect_get",
    description: "Get one business — full record including its people and any custom fields from import.",
    inputSchema: {
      type: "object",
      required: ["businessId"],
      properties: { businessId: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ businessId, tenant }) {
      const res = await api(tenant)(`/businesses/${encodeURIComponent(businessId)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  {
    name: "uiiq_prospect_create",
    description:
      "Add a prospect (or supplier / partner) by hand. Only name is required. " +
      "Use customFields for anything that doesn't fit a standard field — it is kept as-is.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name:     { type: "string", description: "Business name" },
        type:     { type: "string", enum: TYPES, description: "Defaults to PROSPECT" },
        stage:    { type: "string", enum: STAGES, description: "Defaults to NEW" },
        category: { type: "string", description: "e.g. 'Local Garden Centre (LGC)'" },
        website:  { type: "string" }, phone: { type: "string" }, email: { type: "string" },
        address1: { type: "string" }, address2: { type: "string" }, town: { type: "string" },
        county:   { type: "string" }, postcode: { type: "string" }, country: { type: "string" },
        notes:    { type: "string" },
        tags:     { type: "array", items: { type: "string" } },
        customFields: { type: "object", description: "Any extra fields, keyed however you like" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/businesses", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  {
    name: "uiiq_prospect_update",
    description:
      "Update a business — most often to move it along the pipeline: { stage: 'CONTACTED' }. " +
      "Only the fields you send change. Set archived true to soft-delete.",
    inputSchema: {
      type: "object",
      required: ["businessId"],
      properties: {
        businessId: { type: "string" },
        stage:    { type: "string", enum: STAGES },
        type:     { type: "string", enum: TYPES },
        name:     { type: "string" }, category: { type: "string" }, website: { type: "string" },
        phone:    { type: "string" }, email: { type: "string" },
        address1: { type: "string" }, address2: { type: "string" }, town: { type: "string" },
        county:   { type: "string" }, postcode: { type: "string" }, country: { type: "string" },
        notes:    { type: "string" },
        tags:     { type: "array", items: { type: "string" }, description: "Replaces the whole tag list" },
        customFields: { type: "object", description: "Replaces the whole custom-fields object" },
        archived: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ businessId, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (Object.keys(body).length === 0) throw new Error("Send at least one field to change");
      const res = await api(tenant)(`/businesses/${encodeURIComponent(businessId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  {
    name: "uiiq_prospect_import",
    description:
      "Bulk-import businesses from already-parsed rows (e.g. after reading a CSV yourself). " +
      "Upserts by name: existing businesses keep their curated fields (only blanks are filled), tags and custom fields merge. " +
      "Never touches marketing contacts. Max 10,000 rows.",
    inputSchema: {
      type: "object",
      required: ["businesses"],
      properties: {
        type: { type: "string", enum: TYPES, description: "What to import them as. Defaults to PROSPECT" },
        businesses: {
          type: "array",
          description: "Rows. Each needs at least { name }. Optional: category, website, phone, email, address1, address2, town, county, postcode, country, notes, tags[], customFields{}, contact:{name,email,phone,role}",
          items: { type: "object", required: ["name"], properties: { name: { type: "string" } }, additionalProperties: true },
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ type = "PROSPECT", businesses, tenant }) {
      const res = await api(tenant)("/businesses/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, businesses }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json(); // { created, updated, peopleCreated, total, type }
    },
  },
];
