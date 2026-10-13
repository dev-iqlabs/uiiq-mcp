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
  statementDescriptor: { type: ["string", "null"], description: "What a payer's bank statement shows after the account's short name: up to 18 characters, Latin characters only, at least one letter, none of < > \\ ' \" *" },
};
const SISTER_FIELDS = {
  vatNumber: { type: ["string", "null"], description: "Only if the sister is VAT-registered: no VAT is charged on its sales otherwise" },
  isCharity: { type: "boolean", description: "The owner's claim: charity or not-for-profit. The reduced Charity / NFP sister fee applies only once a platform admin verifies it (uiiq_admin_billing_org_update charityVerified); unticking it or changing the charity number clears the verification" },
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
    description: "Owner only: change a billing organisation. Any organisation: legalName, displayName, statementDescriptor (written to the organisation and its payment account together). A SISTER also: vatNumber, isCharity, charityNumber, and active (false switches it off: nothing can be billed through it). A sister switched off by UiiQ (adminDisabled in uiiq_billing_org_list) can't be switched back on here (409, with UiiQ's reason). Changing the legal name, the charity number or unticking charity clears a platform admin's charity verification. The workspace's own organisation takes VAT and charity status from the workspace settings (400 here), and a change to its legal name is logged. Refused (403) for anyone but the workspace owner, read live, and while impersonating; 404 for another workspace's organisation or with the feature off.",
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
    description: "Platform admin: turn a workspace's SISTER organisation off or on (active; off is UiiQ's switch-off, with an optional reason the owner sees, and the owner can't switch it back on: only active: true here clears it); VERIFY the owner's charity / not-for-profit claim (charityVerified: true records who and when, and only then the reduced Charity / NFP sister fee applies. It MUST carry the claim you checked, as uiiq_admin_billing_org_list showed it: expectedLegalName and expectedCharityNumber, null when it has none. It lands only if the organisation still says exactly that: 409 if the owner hasn't claimed it or has changed the claim since. false clears it and needs neither); or set the fee terms on its payment account (applicationFeePercent 0–50, passFeesToCustomer), as uiiq_admin_tenant_stripe_set does for the workspace's own account. charityVerified: true, applicationFeePercent and passFeesToCustomer change what the sister is charged: without confirm: true a call with any of them is ALWAYS a dry run that changes nothing. Switching off, switching on and un-verifying need no confirm. Turning a sister on needs the workspace's sister_organisations feature; the feature can't be switched off while any sister is on. SUPER_ADMIN, read live, never while impersonating; audited.",
    inputSchema: {
      type: "object",
      required: ["tenantId", "orgId"],
      properties: {
        tenantId: TENANT_ID,
        orgId: { type: "string" },
        active: { type: "boolean" },
        reason: { type: "string", description: "With active: false, why UiiQ switched it off (shown to the owner; at most 300 characters)" },
        charityVerified: { type: "boolean" },
        expectedLegalName: { type: "string", description: "With charityVerified: true, the legal name you checked (from uiiq_admin_billing_org_list)" },
        expectedCharityNumber: { type: ["string", "null"], description: "With charityVerified: true, the charity number you checked; null when the claim has none" },
        applicationFeePercent: { type: "number" },
        passFeesToCustomer: { type: "boolean" },
        confirm: CONFIRM_PROP,
      },
    },
    async handler({ tenantId, orgId, confirm, ...body }) {
      const data = defined(body);
      if (!Object.keys(data).length) throw new Error("Send active, charityVerified, applicationFeePercent or passFeesToCustomer");
      // A verification is of the claim that was checked (UiiQ-platform #899 L1).
      if (data.charityVerified === true && (typeof data.expectedLegalName !== "string" || !("expectedCharityNumber" in data))) {
        throw new Error("Read the claim with uiiq_admin_billing_org_list first, then send what you checked: expectedLegalName and expectedCharityNumber (null when it has none).");
      }
      const changesCharges = data.charityVerified === true || "applicationFeePercent" in data || "passFeesToCustomer" in data;
      if (changesCharges && confirm !== true) return dryRun("change_sister_organisation_fee_terms", { tenantId, orgId, change: data });
      return send(null, `/admin/tenants/${enc(tenantId)}/billing-organisations/${enc(orgId)}`, "PATCH", data);
    },
  },
  {
    name: "uiiq_admin_billing_org_cancel_subscriptions",
    description: "Platform admin: END the membership subscriptions still collecting on a SISTER organisation UiiQ has switched off (sister organisations 4b, Lucas #913 M2). Switching a sister off closes what it had open (pending bookings, open checkouts) but leaves live subscriptions running so a family's cover doesn't vanish, and refuses new ones; uiiq_admin_billing_org_list shows how many are still collecting (liveSubscriptions). This cancels each the way the workspace cancels one: at the end of its paid period, on the account it lives on; the workspace's own emails tell the family. Only a sister, only once UiiQ switched it off (409 before), never the workspace's own organisation (400). Returns live, cancelled, alreadyEnding and failed (207 if any failed: call again for the rest). Without confirm: true it is ALWAYS a dry run that changes nothing. SUPER_ADMIN, read live, never while impersonating; audited with the counts.",
    inputSchema: { type: "object", required: ["tenantId", "orgId"], properties: { tenantId: TENANT_ID, orgId: { type: "string" }, confirm: CONFIRM_PROP } },
    async handler({ tenantId, orgId, confirm }) {
      if (confirm !== true) return dryRun("cancel_sister_organisation_subscriptions", { tenantId, orgId });
      return send(null, `/admin/tenants/${enc(tenantId)}/billing-organisations/${enc(orgId)}/cancel-subscriptions`, "POST");
    },
  },
  {
    name: "uiiq_admin_payment_reviews",
    description: "Platform admin: the payments flagged for a look (payment_attribution_reviews; sister organisations 4b): a Stripe payment that arrived on an account the server didn't expect (reason account), for the wrong amount (amount) or not in pounds (currency). Nothing was created or confirmed for it; the family or customer may need a refund or a manual record, and every row is also raised in Sentry. Unresolved ones by default (scope unresolved), newest first, with the workspace (slug, name) and the organisation whose account received the money; scope all includes resolved ones. Filter by reason or tenantId; limit 1-200 (default 100). Ids and the reason only, no amounts, no personal data. Tick one off with uiiq_admin_payment_review_resolve. SUPER_ADMIN, read live.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["unresolved", "all"] },
        reason: { type: "string", enum: ["account", "amount", "currency"] },
        tenantId: { type: "string", description: "Only this workspace's" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    },
    async handler({ scope, reason, tenantId, limit }) {
      const q = new URLSearchParams(Object.entries(defined({ scope, reason, tenantId, limit })).map(([k, v]) => [k, String(v)]));
      const path = "/admin/payments/reviews";
      return send(null, q.size ? `${path}?${q}` : path, "GET");
    },
  },
  {
    name: "uiiq_admin_payment_review_resolve",
    description: "Platform admin: tick a flagged payment (from uiiq_admin_payment_reviews) as resolved, with an optional note of what was done (refunded, recorded by hand, nothing owed; at most 500 characters), recording who and when; resolved: false reopens it. Resolving one already resolved, or reopening one that isn't, is refused (409). Audited (admin.payment_review.resolved / reopened) with the note. SUPER_ADMIN, read live.",
    inputSchema: { type: "object", required: ["id", "resolved"], properties: { id: { type: "string" }, resolved: { type: "boolean" }, note: { type: "string" } } },
    async handler({ id, ...body }) {
      return send(null, `/admin/payments/reviews/${enc(id)}`, "PATCH", defined(body));
    },
  },
];
