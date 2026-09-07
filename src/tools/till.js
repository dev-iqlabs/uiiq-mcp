import { BASE } from "../config.js";

/**
 * Till is device-authed (cookie uiiq_till_device), not the NextAuth session the
 * other tools use. Provide the device token via env UIIQ_TILL_DEVICE_TOKEN
 * (obtain it by pairing a device — e.g. `uiiq till connect` in the CLI).
 *
 * Sales additionally need a staff-PIN session (uiiq_till_staff cookie). Because
 * the MCP is stateless, uiiq_till_verify_pin returns the staff session token and
 * the caller passes it to uiiq_till_sale. These tools process REAL payments.
 */
const DEVICE_COOKIE = "uiiq_till_device";
const STAFF_COOKIE = "uiiq_till_staff";

function deviceToken() {
  const token = process.env.UIIQ_TILL_DEVICE_TOKEN;
  if (!token) {
    throw new Error(
      "No till device token. Set UIIQ_TILL_DEVICE_TOKEN (pair a device, e.g. `uiiq till connect`).",
    );
  }
  return token;
}

function tillClient(staffToken) {
  const cookie =
    `${DEVICE_COOKIE}=${encodeURIComponent(deviceToken())}` +
    (staffToken ? `; ${STAFF_COOKIE}=${encodeURIComponent(staffToken)}` : "");
  // The till JSON API lives under /api like everything else; callers pass bare
  // paths ("/till/catalog") as the session tools do. Was `${BASE}${path}`,
  // which hit the /till/* PAGE routes and came back as an HTML 404.
  const toUrl = (p) => `${BASE}${p.startsWith("/api") ? p : "/api" + p}`;
  return (path, init = {}) =>
    fetch(toUrl(path), {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers ?? {}) },
    });
}

function staffTokenFromResponse(res) {
  const sc = res.headers.get("set-cookie") ?? "";
  const m = sc.match(new RegExp(`${STAFF_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export const tillTools = [
  {
    name: "uiiq_till_catalog",
    description: "List the till catalog (device-scoped). Requires UIIQ_TILL_DEVICE_TOKEN.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await tillClient()("/till/catalog");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_ping",
    description: "Till device heartbeat — confirm the device is registered and active.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await tillClient()("/till/ping", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json().catch(() => ({ ok: true }));
    },
  },
  {
    name: "uiiq_till_verify_pin",
    description: "Start a staff session with a PIN. Returns { staff, staffSessionToken } — pass staffSessionToken to uiiq_till_sale.",
    inputSchema: { type: "object", required: ["pin"], properties: { pin: { type: "string" } } },
    async handler({ pin }) {
      const res = await tillClient()("/till/staff/verify-pin", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) throw new Error(await res.text());
      const staffSessionToken = staffTokenFromResponse(res);
      const d = await res.json().catch(() => ({}));
      return { ...d, staffSessionToken };
    },
  },
  {
    name: "uiiq_till_payment_intent",
    description: "Create a card PaymentIntent on the tenant's connected account. lines = [{source,amountPence,costPence?}] for per-source fees.",
    inputSchema: {
      type: "object",
      required: ["amountPence"],
      properties: {
        amountPence: { type: "number" },
        paymentMethodTypes: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        lines: { type: "array", items: { type: "object" } },
      },
    },
    async handler({ amountPence, paymentMethodTypes, description, lines }) {
      const res = await tillClient()("/till/payment/intent", {
        method: "POST",
        body: JSON.stringify({ amountPence, paymentMethodTypes, description, lines }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_sale",
    description: "Ring up a till sale. Processes REAL payments. Requires staffSessionToken from uiiq_till_verify_pin.",
    inputSchema: {
      type: "object",
      required: ["items", "payments", "staffSessionToken"],
      properties: {
        items: { type: "array", items: { type: "object" }, description: "[{kind,label,sourceId?,quantity,unitPricePence,modifiers?}]" },
        payments: { type: "array", items: { type: "object" }, description: "[{provider,amountPence,...}]" },
        staffSessionToken: { type: "string" },
        email: { type: "string", description: "Customer email for receipt" },
      },
    },
    async handler({ items, payments, staffSessionToken, email }) {
      const res = await tillClient(staffSessionToken)("/till/sales/checkout", {
        method: "POST",
        body: JSON.stringify({ items, payments, customer: email ? { email } : undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_iqplant_plan_code",
    description:
      "The till scanned an IQPlant garden-plan code (the QR in the customer's email / on their phone). Answers with the pick list to print (pickUrl), line count, total, whether the plan is older than 30 days, and — when the plan was sized to a Garden Plan Gift — the voucher to apply to the sale (or voucherReason when it can't be). { found: false } when no plan matches this centre. Requires staffSessionToken from uiiq_till_verify_pin.",
    inputSchema: {
      type: "object",
      required: ["code", "staffSessionToken"],
      properties: {
        code: { type: "string", description: "The plan code as scanned" },
        staffSessionToken: { type: "string" },
      },
    },
    async handler({ code, staffSessionToken }) {
      const res = await tillClient(staffSessionToken)("/till/iqplant/plan-code", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
