import { apiClient } from "../auth.js";

// SISTER ORGANISATIONS (UiiQ-platform sister organisations 2/7) — a
// workspace's billing organisations: its own (MAIN) and any SISTER, e.g. a
// not-for-profit run from the same workspace, each with its own Stripe
// account. Needs the workspace's `sister_organisations` feature (404 when off).
// Changes are for the workspace OWNER only (or a platform admin in their own
// session), read live; an ADMIN reads; nothing changes while impersonating.
// Creating, connecting or removing a sister is a dry run unless confirm: true.
// The changing tools act in your own signed-in workspace and take no
// `tenant`: naming one would impersonate, which UIIQ refuses for these.

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const TENANT_ID = { type: "string", description: "The target tenant's id (the tenant is named in the path, not the session)." };
const CONFIRM_PROP = { type: "boolean", description: "true = do it; omit for the dry run, which changes nothing" };
const api = (tenant) => apiClient(tenant ? { tenant } : {});
const enc = encodeURIComponent;
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

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
const dryRun = (wouldDo, details) => ({
  dryRun: true,
  changed: false,
  wouldDo,
  ...details,
  note: "Nothing was changed. Check this with the workspace owner, then call again with confirm: true.",
});

const ORG_FIELDS = {
  legalName: { type: "string", description: "The organisation's legal name" },
  displayName: { type: ["string", "null"], description: "The name on receipts; null = the legal name" },
  statementDescriptor: { type: ["string", "null"], description: "What a payer's bank statement shows: up to 22 characters, at least one letter, none of < > \\ ' \" *" },
};
const SISTER_FIELDS = {
  vatNumber: { type: ["string", "null"], description: "Only if the sister is VAT-registered: no VAT is charged on its sales otherwise" },
  isCharity: { type: "boolean", description: "Charity or not-for-profit: takes the reduced Charity / NFP sister platform fee" },
  charityNumber: { type: ["string", "null"] },
};

export const billingOrganisationsTools = [
  {
    name: "uiiq_billing_org_list",
    description: "The workspace's billing organisations: its own (MAIN) and its SISTER organisations, each with its payment account's status (connected, charges and payouts enabled; never the Stripe account id), VAT and charity status, and whether it is switched on. canManage says whether this session may change them (the workspace owner only). addOnMonthlyPence is the monthly price of having sisters (0 = no charge). Needs the sister_organisations feature (404 when off); OWNER or ADMIN.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return send(tenant, "/billing-organisations", "GET");
    },
  },
  {
    name: "uiiq_billing_org_create",
    description: "Owner only: ADD a sister organisation (a second legal entity the workspace takes some payments as). Without confirm: true it is ALWAYS a dry run that shows what would be created and changes nothing. legalName is required. Refused (403) for anyone but the workspace owner, read live, and while impersonating; 404 when the sister_organisations feature is off.",
    inputSchema: {
      type: "object",
      required: ["legalName"],
      properties: { ...ORG_FIELDS, ...SISTER_FIELDS, confirm: CONFIRM_PROP },
    },
    async handler({ confirm, ...body }) {
      const data = defined(body);
      if (confirm !== true) return dryRun("create_sister_organisation", { organisation: data });
      return send(null, "/billing-organisations", "POST", data);
    },
  },
  {
    name: "uiiq_billing_org_update",
    description: "Owner only: change a billing organisation. Any organisation: legalName, displayName, statementDescriptor (written to the organisation and its payment account together). A SISTER also: vatNumber, isCharity, charityNumber, and active (false switches it off: nothing can be billed through it). The workspace's own organisation takes VAT and charity status from the workspace settings (400 here), and a change to its legal name is logged. Refused (403) for anyone but the workspace owner, read live, and while impersonating; 404 for another workspace's organisation or with the feature off.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, ...ORG_FIELDS, ...SISTER_FIELDS, active: { type: "boolean" } },
    },
    async handler({ id, ...body }) {
      const data = defined(body);
      if (!Object.keys(data).length) throw new Error("Send at least one field to change");
      return send(null, `/billing-organisations/${enc(id)}`, "PATCH", data);
    },
  },
  {
    name: "uiiq_billing_org_delete",
    description: "Owner only: REMOVE a sister organisation that has no payment account. One with a payment account is refused (409): switch it off instead (uiiq_billing_org_update active:false). The workspace's own organisation is never removed. Without confirm: true it is ALWAYS a dry run that changes nothing.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, confirm: CONFIRM_PROP } },
    async handler({ id, confirm }) {
      if (confirm !== true) return dryRun("remove_sister_organisation", { id });
      return send(null, `/billing-organisations/${enc(id)}`, "DELETE");
    },
  },
  {
    name: "uiiq_billing_org_connect_start",
    description: "Owner only: CONNECT a sister organisation's own Stripe account: creates the connected account for THAT organisation (once; keyed on the organisation) and returns an onboardingUrl for the owner to finish in a browser. A Stripe account already attached to another organisation is refused (409); a switched-off sister is refused (409). The workspace's own account is connected with uiiq_admin_payments_connect_start. Without confirm: true it is ALWAYS a dry run that changes nothing.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, email: { type: "string", description: "Account email; defaults to the session user's" }, provider: { type: "string", enum: ["STRIPE", "PAYPAL"] }, confirm: CONFIRM_PROP },
    },
    async handler({ id, confirm, ...body }) {
      if (confirm !== true) return dryRun("connect_sister_organisation_payments", { id, ...defined(body) });
      return send(null, `/billing-organisations/${enc(id)}/connect`, "POST", defined(body));
    },
  },
  {
    name: "uiiq_admin_billing_org_list",
    description: "A workspace's billing organisations as a platform admin sees them: its own (MAIN) and every sister, each with its payment account's status and fee terms (applicationFeePercent, passFeesToCustomer), and whether the sister_organisations feature is on. SUPER_ADMIN, read live.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: TENANT_ID } },
    async handler({ tenantId }) {
      return send(null, `/admin/tenants/${enc(tenantId)}/billing-organisations`, "GET");
    },
  },
  {
    name: "uiiq_admin_billing_org_update",
    description: "Platform admin: turn a workspace's SISTER organisation off or on (active), or set the fee terms on its payment account (applicationFeePercent 0–50, passFeesToCustomer), as uiiq_admin_tenant_stripe_set does for the workspace's own account. Turning a sister on needs the workspace's sister_organisations feature; the feature can't be switched off while any sister is on. SUPER_ADMIN, read live, never while impersonating; audited.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "orgId"],
      properties: { tenantId: TENANT_ID, orgId: { type: "string" }, active: { type: "boolean" }, applicationFeePercent: { type: "number" }, passFeesToCustomer: { type: "boolean" } },
    },
    async handler({ tenantId, orgId, ...body }) {
      const data = defined(body);
      if (!Object.keys(data).length) throw new Error("Send active, applicationFeePercent or passFeesToCustomer");
      return send(null, `/admin/tenants/${enc(tenantId)}/billing-organisations/${enc(orgId)}`, "PATCH", data);
    },
  },
];
