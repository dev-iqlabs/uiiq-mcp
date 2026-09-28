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
const send = async (tenant, path, method, body) => {
  const res = await api(tenant)(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
  if (!res.ok) throw await fail(res);
  return res.json();
};

// VIRTUAL OFFICE — compliance reminders: dated obligations (insurance renewal,
// licence, tax, Companies House filing, contract, certification…) with a
// pending / completed / dismissed status. No feature flag.
const TYPES = ["insurance", "licence", "tax", "companies_house", "contract", "certification", "venue_rebook", "other"];

export const virtualOfficeTools = [
  {
    name: "uiiq_virtual_office_compliance_list",
    description: "Every compliance reminder for the tenant (pending first, then by due date): type, title, dueDate, status pending|completed|dismissed, completedAt, notes.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    handler: ({ tenant } = {}) => send(tenant, "/virtual-office/compliance", "GET"),
  },
  {
    name: "uiiq_virtual_office_compliance_add",
    description: `Add a compliance reminder: title + dueDate (ISO date) required; type ${TYPES.join("|")} (default other).`,
    inputSchema: {
      type: "object",
      required: ["title", "dueDate"],
      properties: { title: { type: "string" }, dueDate: { type: "string" }, type: { type: "string", enum: TYPES }, notes: { type: "string" }, tenant: TENANT_PROP },
    },
    handler: ({ tenant, ...body }) => send(tenant, "/virtual-office/compliance", "POST", body),
  },
  {
    name: "uiiq_virtual_office_compliance_update",
    description: "Set a reminder's status (pending | completed | dismissed — completed stamps completedAt unless you pass one; empty string clears it) and/or notes.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["pending", "completed", "dismissed"] },
        completedAt: { type: "string" },
        notes: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    handler: ({ id, tenant, ...body }) => send(tenant, `/virtual-office/compliance/${encodeURIComponent(id)}`, "PATCH", body),
  },
  {
    name: "uiiq_virtual_office_compliance_delete",
    description: "DELETE a compliance reminder.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    handler: ({ id, tenant }) => send(tenant, `/virtual-office/compliance/${encodeURIComponent(id)}`, "DELETE"),
  },
];
