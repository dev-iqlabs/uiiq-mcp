import { apiClient } from "../auth.js";

// Materials Sourcing — discover, compare & adopt suppliers for materials a
// business buys; plus scheduled price watches. Mirrors the UIIQ /materials API.
export const materialsTools = [
  {
    name: "uiiq_materials_list",
    description: "List sourcing materials with candidate count, best landed cost, and watch status.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/materials");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_material_get",
    description: "Get a sourcing material with its candidates (compare table), price history, runs and watch.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/materials/${id}`);
      if (!res.ok) throw new Error(`Material not found: ${id}`);
      return res.json();
    },
  },
  {
    name: "uiiq_material_create",
    description: "Create a material to source. Costs are in pence. currentUnitCostPence is the baseline to beat.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "e.g. Blank 38mm brass coins" },
        unitLabel: { type: "string", description: "e.g. per coin" },
        targetQty: { type: "number", description: "typical order quantity" },
        currentSupplierName: { type: "string" },
        currentUnitCostPence: { type: "number", description: "current unit cost in pence" },
        currentSourceUrl: { type: "string" },
        spec: { type: "object", description: "free-form attributes, e.g. { metal: brass, diameter: 38mm }" },
        notes: { type: "string" },
      },
    },
    async handler(body) {
      const res = await apiClient()("/materials", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_material_candidate_add",
    description: "Manually add a candidate supplier to a material. Prices in pence. Landed cost is computed.",
    inputSchema: {
      type: "object",
      required: ["id", "supplierName"],
      properties: {
        id: { type: "string", description: "material id" },
        supplierName: { type: "string" },
        url: { type: "string" },
        currency: { type: "string", description: "ISO code the prices are in (GBP default); landed cost is converted to GBP" },
        unitPricePence: { type: "number", description: "in the currency's minor units" },
        moq: { type: "number", description: "minimum order quantity" },
        leadTimeDays: { type: "number" },
        shippingPence: { type: "number", description: "order-level shipping in pence" },
        qualityNotes: { type: "string" },
      },
    },
    async handler({ id, ...body }) {
      const res = await apiClient()(`/materials/${id}/candidates`, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_material_discover",
    description: "Run AI supplier discovery for a material — returns candidate LEADS (not quotes) to verify. Deducts credits (charged only when leads are found).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "material id" } } },
    async handler({ id }) {
      const res = await apiClient()(`/materials/${id}/discover`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_material_candidate_status",
    description: "Set a candidate's status: SHORTLIST, REJECTED or NEW.",
    inputSchema: {
      type: "object",
      required: ["id", "candidateId", "status"],
      properties: {
        id: { type: "string", description: "material id" },
        candidateId: { type: "string" },
        status: { type: "string", enum: ["NEW", "SHORTLIST", "REJECTED"] },
      },
    },
    async handler({ id, candidateId, status }) {
      const res = await apiClient()(`/materials/${id}/candidates/${candidateId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_material_verify",
    description: "Mark a candidate as human-checked (verified) or clear it. Distinguishes confirmed prices from raw AI estimates.",
    inputSchema: {
      type: "object",
      required: ["id", "candidateId"],
      properties: {
        id: { type: "string", description: "material id" },
        candidateId: { type: "string" },
        verified: { type: "boolean", description: "default true" },
      },
    },
    async handler({ id, candidateId, verified = true }) {
      const res = await apiClient()(`/materials/${id}/candidates/${candidateId}`, {
        method: "PATCH",
        body: JSON.stringify({ verified }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_material_adopt",
    description: "Adopt a candidate as the supplier for a material — creates a RetailSupplier and moves the baseline to the adopted landed cost.",
    inputSchema: {
      type: "object",
      required: ["id", "candidateId"],
      properties: {
        id: { type: "string", description: "material id" },
        candidateId: { type: "string" },
      },
    },
    async handler({ id, candidateId }) {
      const res = await apiClient()(`/materials/${id}/candidates/${candidateId}/adopt`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_material_watch_set",
    description: "Create or update a price watch on a material (scheduled re-pricing + cheaper-supplier alert). Set active:false to pause.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "material id" },
        cadence: { type: "string", enum: ["WEEKLY", "MONTHLY"] },
        beatThresholdPct: { type: "number", description: "alert when cheapest beats current by more than this %" },
        active: { type: "boolean" },
      },
    },
    async handler({ id, ...body }) {
      const res = await apiClient()(`/materials/${id}/watch`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_material_watch_remove",
    description: "Stop and remove the price watch on a material.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "material id" } } },
    async handler({ id }) {
      const res = await apiClient()(`/materials/${id}/watch`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
