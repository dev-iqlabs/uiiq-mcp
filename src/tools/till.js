import fs from "fs";
import path from "path";
import { apiClient } from "../auth.js";
import { BASE } from "../config.js";

/**
 * The till floor (catalog, sales, food orders, stock write-offs, scans) is
 * device-authed (cookie uiiq_till_device), not the NextAuth session the other
 * tools use. Provide the device token via env UIIQ_TILL_DEVICE_TOKEN (obtain it
 * by pairing a device — `uiiq till connect` in the CLI, or uiiq_till_pairing_code
 * + uiiq_till_register here).
 *
 * Sales additionally need a staff-PIN session (uiiq_till_staff cookie). Because
 * the MCP is stateless, uiiq_till_verify_pin returns the staff session token and
 * the caller passes it to uiiq_till_sale. These tools process REAL payments.
 *
 * The back office (devices, staff, day close, daily summary, refunds, payment
 * config, tables, kitchen display) is a normal dashboard session and takes the
 * usual optional `tenant`.
 */
const DEVICE_COOKIE = "uiiq_till_device";
const STAFF_COOKIE = "uiiq_till_staff";

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
const send = (tenant, p, method, body) =>
  api(tenant)(p, body === undefined ? { method } : { method, body: JSON.stringify(body) });

const STAFF_TOKEN_PROP = { type: "string", description: "staffSessionToken from uiiq_till_verify_pin" };
const ORDER_ITEMS_PROP = {
  type: "array",
  minItems: 1,
  description: "[{label, quantity>=1, unitPricePence>=0, menuItemId?, modifiers?:[{groupId,groupName,optionId,optionName,pricePence}], notes?}] — menuItemId snapshots the kitchen station/course",
  items: { type: "object" },
};
const PAYMENT_PROVIDERS = ["STRIPE_TERMINAL", "STRIPE_TAP_TO_PAY", "SUMUP", "PAYPAL_ZETTLE", "CASH", "GIFT_CARD", "MANUAL_OTHER"];
const KDS_STATIONS = ["GRILL", "COLD", "PREP", "BAR", "PASTRY", "ANY"];

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
    description: "Create a card PaymentIntent on the tenant's connected account. lines = [{source,amountPence,costPence?}] for per-source fees: lines are optional; when sent, every line needs source OWN or RESELL and a whole positive amountPence (costPence optional, whole), at most 500 lines, and the lines must add up exactly to amountPence or the server answers 400. The platform fee never goes below the till rate on the whole charge.",
    inputSchema: {
      type: "object",
      required: ["amountPence"],
      properties: {
        amountPence: { type: "number" },
        paymentMethodTypes: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        lines: {
          type: "array",
          maxItems: 500,
          description: "Optional. Must add up exactly to amountPence.",
          items: {
            type: "object",
            required: ["source", "amountPence"],
            properties: {
              source: { type: "string", enum: ["OWN", "RESELL"] },
              amountPence: { type: "integer", minimum: 1 },
              costPence: { type: "integer", minimum: 0 },
            },
          },
        },
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
  {
    name: "uiiq_till_outcome_code",
    description:
      "The till scanned an outcome code (garden plan today; bookings/briefs later). Same answer as uiiq_till_iqplant_plan_code under its new name: pick list (pickUrl), lines, total, expired flag, the programme voucher to apply or voucherReason. { found: false } when nothing matches this centre. Device token + staffSessionToken.",
    inputSchema: {
      type: "object",
      required: ["code", "staffSessionToken"],
      properties: { code: { type: "string", description: "The code as scanned" }, staffSessionToken: STAFF_TOKEN_PROP },
    },
    async handler({ code, staffSessionToken }) {
      const res = await tillClient(staffSessionToken)("/till/outcome-code", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_gift_card_check",
    description: "Check a gift card code at the till before taking it as payment: { valid, remainingPence, originalPence, expiresAt } or { valid: false, reason }. Device token + staffSessionToken.",
    inputSchema: {
      type: "object",
      required: ["code", "staffSessionToken"],
      properties: { code: { type: "string" }, staffSessionToken: STAFF_TOKEN_PROP },
    },
    async handler({ code, staffSessionToken }) {
      const res = await tillClient(staffSessionToken)("/till/payment/gift-card/check", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_stripe_cancel",
    description: "Cancel an in-flight card PaymentIntent (cashier cancelled mid-tap, reader timed out). The tenant's connected account must own it. Device token.",
    inputSchema: { type: "object", required: ["paymentIntentId"], properties: { paymentIntentId: { type: "string" } } },
    async handler({ paymentIntentId }) {
      const res = await tillClient()("/till/payment/stripe/cancel", {
        method: "POST",
        body: JSON.stringify({ paymentIntentId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_stock_adjust",
    description: "Write off retail stock from the till (faulty, perished, damaged, wastage): reduces the product's stock level by qty and logs an ADJUSTMENT movement with the reason. Not reversible. Device token + staffSessionToken.",
    inputSchema: {
      type: "object",
      required: ["productId", "qty", "staffSessionToken"],
      properties: {
        productId: { type: "string" },
        qty: { type: "integer", minimum: 1 },
        reason: { type: "string", description: "Default Wastage" },
        staffSessionToken: STAFF_TOKEN_PROP,
      },
    },
    async handler({ productId, qty, reason, staffSessionToken }) {
      const res = await tillClient(staffSessionToken)("/till/stock-adjust", {
        method: "POST",
        body: JSON.stringify({ productId, qty, reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Food orders (tabs) — device-authed ──
  {
    name: "uiiq_till_food_orders_list",
    description: "Open food orders (tabs) for the device's venue — everything not yet completed or cancelled, with table and live lines. Device token.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await tillClient()("/till/food-orders");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_food_order_get",
    description: "One food order with its table and every line (including voided ones). Device token.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await tillClient()(`/till/food-orders/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_food_order_create",
    description: "Open a tab (optionally on a table) with one or more lines; fire=true sends it straight to the kitchen, otherwise it stays OPEN until fired. Prices are as sent (the till is trusted). Device token + staffSessionToken.",
    inputSchema: {
      type: "object",
      required: ["items", "staffSessionToken"],
      properties: {
        items: ORDER_ITEMS_PROP,
        tableId: { type: "string", description: "A table from uiiq_till_table_floor" },
        customerName: { type: "string" },
        notes: { type: "string" },
        fire: { type: "boolean" },
        staffSessionToken: STAFF_TOKEN_PROP,
      },
    },
    async handler({ staffSessionToken, ...body }) {
      const res = await tillClient(staffSessionToken)("/till/food-orders", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_food_order_update",
    description: "Change an open food order: action addItems (items), fire (send to kitchen), cancel (void the whole order), voidItem (itemId + reason — drops the line and its value, even if already sent), updateMeta (customerName/notes). Completed or cancelled orders answer 409. Device token.",
    inputSchema: {
      type: "object",
      required: ["id", "action"],
      properties: {
        id: { type: "string" },
        action: { type: "string", enum: ["addItems", "fire", "cancel", "voidItem", "updateMeta"] },
        items: { ...ORDER_ITEMS_PROP, description: "addItems: " + ORDER_ITEMS_PROP.description },
        itemId: { type: "string", description: "voidItem: the line to void" },
        reason: { type: "string", description: "voidItem: why (default Void)" },
        customerName: { type: "string", description: "updateMeta" },
        notes: { type: "string", description: "updateMeta" },
      },
    },
    async handler({ id, ...body }) {
      const res = await tillClient()(`/till/food-orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_food_order_settle",
    description: "Close a tab at the till: records the payment(s) as a TillSale of MENU_ITEM lines, links it to the order and marks it PAID + COMPLETED. Records REAL money — payments must cover the order total (change is returned). Device token + staffSessionToken.",
    inputSchema: {
      type: "object",
      required: ["id", "payments", "staffSessionToken"],
      properties: {
        id: { type: "string" },
        payments: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["provider", "amountPence"],
            properties: {
              provider: { type: "string", enum: PAYMENT_PROVIDERS },
              amountPence: { type: "integer", minimum: 1 },
              tenderedPence: { type: "integer" },
              providerRef: { type: "string" },
            },
          },
        },
        customerEmail: { type: "string" },
        staffSessionToken: STAFF_TOKEN_PROP,
      },
    },
    async handler({ id, staffSessionToken, ...body }) {
      const res = await tillClient(staffSessionToken)(`/till/food-orders/${encodeURIComponent(id)}/settle`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_table_floor",
    description: "The till's floor view: active tables with area, seats and the open order on each (or null). Device token; uiiq_till_table_list is the back-office equivalent.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await tillClient()("/till/tables");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Pairing — session mints the code, the device redeems it ──
  {
    name: "uiiq_till_pairing_code",
    description: "Mint a 6-character till pairing code (valid 15 minutes) for a new device to redeem with uiiq_till_register. OWNER/ADMIN only.",
    inputSchema: { type: "object", properties: { deviceName: { type: "string", description: "Default 'Paired device'" }, tenant: TENANT_PROP } },
    async handler({ deviceName, tenant } = {}) {
      const res = await send(tenant, "/till/pairing", "POST", { deviceName });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_register",
    description: "Redeem a pairing code and register a new till device. No session — the code is the credential. Returns the device token ONCE: put it in UIIQ_TILL_DEVICE_TOKEN for the device-authed till tools; it is not shown again.",
    inputSchema: { type: "object", required: ["code"], properties: { code: { type: "string", description: "The 6-character pairing code" } } },
    async handler({ code }) {
      const res = await fetch(BASE + "/api/till/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: String(code).trim().toUpperCase() }),
      });
      if (!res.ok) throw await fail(res);
      const sc = res.headers.get("set-cookie") ?? "";
      const m = sc.match(new RegExp(`${DEVICE_COOKIE}=([^;]+)`));
      const d = await res.json().catch(() => ({}));
      return { ...d, deviceToken: m ? decodeURIComponent(m[1]) : null };
    },
  },

  // ── Back office — dashboard session ──
  {
    name: "uiiq_till_devices_list",
    description: "The tenant's registered till devices: name, active, platform, assigned menus (empty = all), last seen.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/till/devices");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_device_update",
    description: "Rename a till device, switch it on/off (active=false stops the till but keeps its sales), or set which menus it serves (menuIds; [] = all menus).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        active: { type: "boolean" },
        menuIds: { type: "array", items: { type: "string" }, maxItems: 50 },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, `/till/devices/${encodeURIComponent(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_device_delete",
    description: "Permanently un-register a till device. Refused (409) once it has any sales on record — deactivate those with uiiq_till_device_update instead. OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/till/devices/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_staff_list",
    description: "Till staff (cashiers and managers) with role, active, last used and any PIN lockout. PINs are never returned.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/till/staff");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_staff_create",
    description: "Add a till staff member with a PIN (CASHIER 4–8 digits, MANAGER 6–8 digits; a PIN already in use by active staff is refused). Managers can cash up and are needed for uiiq_till_day_close. OWNER/ADMIN only.",
    inputSchema: {
      type: "object",
      required: ["name", "pin"],
      properties: {
        name: { type: "string" },
        pin: { type: "string" },
        role: { type: "string", enum: ["CASHIER", "MANAGER"], description: "Default CASHIER" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await send(tenant, "/till/staff", "POST", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_daily_summary",
    description: "The daily sales summary for one day (default today): headline revenue, refunds, discounts, tax, transaction count, expected cash drawer; sales by item kind; cash movement by payment method. csvPath writes the CSV export to that local file instead.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD" },
        deviceId: { type: "string", description: "One till only" },
        csvPath: { type: "string", description: "Local file to write the CSV to" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ date, deviceId, csvPath, tenant } = {}) {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (deviceId) params.set("deviceId", deviceId);
      if (csvPath) params.set("format", "csv");
      const qs = params.toString() ? `?${params}` : "";
      const res = await api(tenant)(`/till/daily-summary${qs}`);
      if (!res.ok) throw await fail(res);
      if (!csvPath) return res.json();
      const csv = await res.text();
      fs.mkdirSync(path.dirname(path.resolve(csvPath)), { recursive: true });
      fs.writeFileSync(csvPath, csv, "utf8");
      return { saved: csvPath, bytes: Buffer.byteLength(csv, "utf8") };
    },
  },
  {
    name: "uiiq_till_day_close_list",
    description: "The last 30 till cash-ups (day closes): period, opening float, declared vs expected cash, variance, sales total, who closed.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/till/day-close");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_day_close",
    description: "Cash up: records a day close for one device (deviceId) or the whole venue (omit it) — expected cash = opening float + CASH takings in the window, variance = declared − expected. The window defaults to everything since the last close for that scope. Needs a MANAGER's till PIN; writes a permanent record. (A paired device can also call this route for its own drawer.)",
    inputSchema: {
      type: "object",
      required: ["managerPin", "declaredCashPence"],
      properties: {
        managerPin: { type: "string", description: "A till MANAGER's PIN (4–8 digits)" },
        declaredCashPence: { type: "integer", minimum: 0, description: "Cash counted in the drawer" },
        openingFloatPence: { type: "integer", minimum: 0, description: "Default 0" },
        deviceId: { type: "string" },
        periodStart: { type: "string", description: "ISO datetime; default = last close" },
        periodEnd: { type: "string", description: "ISO datetime; default = now" },
        notes: { type: "string", maxLength: 500 },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await send(tenant, "/till/day-close", "POST", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_sale_refund",
    description: "Refund a PAID till sale: marks it REFUNDED (daily summary nets it off), reverses its COGS and puts retail stock back via RETURN movements. The card money itself is reversed by staff in the provider (SumUp / Stripe / drawer) — this records it. Not reversible.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, reason: { type: "string", description: "Default Refund" }, tenant: TENANT_PROP } },
    async handler({ id, reason, tenant }) {
      const res = await send(tenant, `/till/sales/${encodeURIComponent(id)}/refund`, "POST", { reason });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_payment_config_set",
    description: "Set up a till payment method for the venue (one row per provider): enabled on/off plus configJson — SUMUP {affiliateKey, appId?, merchantCode?, currency?}, STRIPE_TERMINAL / STRIPE_TAP_TO_PAY {locationId}; the others take no config. Unknown keys are refused. The SumUp affiliate key decides where card money settles. OWNER/ADMIN only.",
    inputSchema: {
      type: "object",
      required: ["provider"],
      properties: {
        provider: { type: "string", enum: PAYMENT_PROVIDERS },
        enabled: { type: "boolean", description: "Default true" },
        configJson: { type: "object" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await send(tenant, "/till/payment-config", "PUT", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Kitchen display ──
  {
    name: "uiiq_till_kds_tickets",
    description: "Live kitchen tickets: orders fired to the kitchen and not yet served, oldest first, with their live lines; station narrows to one kitchen station. Dashboard session (a paired kitchen tablet uses the same route with its device cookie).",
    inputSchema: { type: "object", properties: { station: { type: "string", enum: KDS_STATIONS }, tenant: TENANT_PROP } },
    async handler({ station, tenant } = {}) {
      const qs = station ? `?station=${encodeURIComponent(station)}` : "";
      const res = await api(tenant)(`/kds/tickets${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_kds_item_bump",
    description: "Bump a kitchen line forward (NEW→PREPARING→READY→SERVED) or set an explicit status; the parent order's status is recomputed from its lines. Returns { itemStatus, orderStatus }.",
    inputSchema: {
      type: "object",
      required: ["itemId"],
      properties: {
        itemId: { type: "string" },
        status: { type: "string", enum: ["NEW", "PREPARING", "READY", "SERVED", "CANCELLED"], description: "Omit to bump one step" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ itemId, status, tenant }) {
      const body = status ? { status } : { action: "bump" };
      const res = await send(tenant, `/kds/items/${encodeURIComponent(itemId)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Tables (back office) ──
  {
    name: "uiiq_till_table_list",
    description: "All the venue's tables (active or not) with label, area, seats, display order and QR token.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/tables");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_table_create",
    description: "Add a table; its customer-ordering QR token is generated for it (print it with uiiq_till_table_qr).",
    inputSchema: {
      type: "object",
      required: ["label"],
      properties: {
        label: { type: "string" },
        area: { type: "string" },
        seats: { type: "integer", minimum: 0 },
        displayOrder: { type: "integer" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await send(tenant, "/tables", "POST", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_table_update",
    description: "Edit a table (label, area, seats, displayOrder, active) or rotateToken=true to issue a new QR token — the old printed QR stops working.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        area: { type: "string" },
        seats: { type: "integer", minimum: 0 },
        displayOrder: { type: "integer" },
        active: { type: "boolean" },
        rotateToken: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await send(tenant, `/tables/${encodeURIComponent(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_table_delete",
    description: "Delete a table. Its open orders survive with no table; the printed QR stops working. Not reversible.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/tables/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_till_table_qr",
    description: "Save a table's customer-ordering QR code (600px PNG encoding /order/<slug>/<token>) to a local file for printing. Default outPath: ./table-<id>.png.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, outPath: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, outPath, tenant }) {
      const res = await api(tenant)(`/tables/${encodeURIComponent(id)}/qr.png`);
      if (!res.ok) throw await fail(res);
      const bytes = Buffer.from(await res.arrayBuffer());
      const target = path.resolve(outPath || `table-${id}.png`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      return { path: target, bytes: bytes.length };
    },
  },
];
