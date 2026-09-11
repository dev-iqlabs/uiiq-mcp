import { apiClient } from "../auth.js";

// What "local" means to a tenant: named lists of postcode areas, districts or
// sectors on the company profile. Milestone Ranch's Isle of Axholme is
// DN9 1, DN9 2 and DN17 4. The platform matches on parsed postcode parts,
// never by substring, so "DN9" never admits DN90.
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

const PATTERNS_PROP = {
  type: "array",
  items: { type: "string" },
  description:
    "Postcode areas ('DN'), districts ('DN9') or sectors ('DN9 1'). Each is matched at its own level. A full postcode is taken as its sector. Unreadable entries are returned in `rejected`, not stored.",
};

export const localityTools = [
  {
    name: "uiiq_locality_list",
    description: "The tenant's local areas — each a name and its postcode patterns — active first.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/localities");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_locality_create",
    description:
      "Define a local area: a name and a list of postcode patterns. Returns the area with its patterns normalised, plus any entries that were not postcodes.",
    inputSchema: {
      type: "object",
      required: ["name", "patterns"],
      properties: {
        name: { type: "string", description: "e.g. 'Isle of Axholme'" },
        description: { type: "string", description: "e.g. 'Epworth, Haxey, Crowle and the villages between'" },
        patterns: PATTERNS_PROP,
        isActive: { type: "boolean", description: "Default true." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ name, description, patterns, isActive, tenant }) {
      const body = { name, patterns };
      if (description !== undefined) body.description = description;
      if (isActive !== undefined) body.isActive = isActive;
      const res = await api(tenant)("/localities", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_locality_update",
    description: "Change a local area. Only the fields you send change; sending `patterns` replaces the whole list.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        patterns: PATTERNS_PROP,
        isActive: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, name, description, patterns, isActive, tenant }) {
      const body = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      if (patterns !== undefined) body.patterns = patterns;
      if (isActive !== undefined) body.isActive = isActive;
      const res = await api(tenant)(`/localities/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_locality_delete",
    description: "Delete a local area. Anything using it to decide who is local stops working.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/localities/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_locality_check",
    description:
      "Is a postcode local? Checks it against every active local area (or one, with localityId). Three distinct answers: not a UK postcode (valid=false), not local (local=false), or local with which area and pattern matched. For checking a signup off a form.",
    inputSchema: {
      type: "object",
      required: ["postcode"],
      properties: {
        postcode: { type: "string", description: "A full UK postcode, any case or spacing." },
        localityId: { type: "string", description: "Check one area only." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ postcode, localityId, tenant }) {
      const qs = new URLSearchParams({ postcode });
      if (localityId) qs.set("localityId", localityId);
      const res = await api(tenant)(`/localities/check?${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
