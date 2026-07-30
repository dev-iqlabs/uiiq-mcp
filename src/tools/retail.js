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


export const retailTools = [
  {
    name: "uiiq_retail_products",
    description: "List retail products. Optional q (search), category, includeInactive, page, pageSize.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string" },
        category: { type: "string" },
        includeInactive: { type: "boolean" },
        page: { type: "number" },
        pageSize: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ q, category, includeInactive, page, pageSize, tenant } = {}) {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (category) p.set("category", category);
      if (includeInactive) p.set("includeInactive", "1");
      if (page) p.set("page", String(page));
      if (pageSize) p.set("pageSize", String(pageSize));
      const res = await api(tenant)(`/retail/products?${p}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_product_get",
    description: "Get a retail product by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/retail/products/${id}`);
      if (!res.ok) throw new Error(`Product not found: ${id}`);
      return res.json();
    },
  },
  {
    name: "uiiq_retail_low_stock",
    description: "List retail products at or below their reorder point.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/retail/low-stock");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_reports",
    description: "Retail sales/stock report summary.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/retail/reports");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_suppliers",
    description: "List retail suppliers.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/retail/suppliers");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_shops",
    description: "List the tenant's connected WooCommerce stores (creds never returned).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/retail/shops");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_shop_sync",
    description: "Push the retail catalogue (products flagged Online Shop) to the connected WooCommerce store(s) — name, price, photo, barcode, stock, category. Returns a per-shop summary.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/retail/shops/sync", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_orders_pull",
    description: "Pull recent orders from the connected WooCommerce store(s) and decrement till stock for matched products (idempotent). Returns a per-shop summary.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/retail/shops/pull-orders", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // --- Managed stock-adjustment reasons (#188) ---
  {
    name: "uiiq_retail_stock_reasons",
    description: "List the tenant's managed stock-adjustment reasons (self-seeds defaults on first use). Optional direction (IN|OUT — returns that direction plus BOTH) and includeInactive.",
    inputSchema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["IN", "OUT"] },
        includeInactive: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ direction, includeInactive, tenant } = {}) {
      const p = new URLSearchParams();
      if (direction) p.set("direction", direction);
      if (includeInactive) p.set("includeInactive", "1");
      const qs = p.toString();
      const res = await api(tenant)(`/retail/stock-reasons${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_stock_reason_add",
    description: "Add a custom stock-adjustment reason. `label` required; `direction` one of IN|OUT|BOTH (default BOTH).",
    inputSchema: {
      type: "object",
      required: ["label"],
      properties: {
        label: { type: "string" },
        direction: { type: "string", enum: ["IN", "OUT", "BOTH"] },
        tenant: TENANT_PROP,
      },
    },
    async handler({ label, direction, tenant } = {}) {
      const res = await api(tenant)("/retail/stock-reasons", {
        method: "POST",
        body: JSON.stringify({ label, ...(direction ? { direction } : {}) }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_stock_reason_update",
    description: "Update a stock-adjustment reason by ID (label, direction IN|OUT|BOTH, active, displayOrder).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        direction: { type: "string", enum: ["IN", "OUT", "BOTH"] },
        active: { type: "boolean" },
        displayOrder: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...patch } = {}) {
      const res = await api(tenant)(`/retail/stock-reasons/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_stock_reason_delete",
    description: "Delete a custom stock-adjustment reason by ID. System defaults are deactivated instead (to preserve reporting history).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ id, tenant } = {}) {
      const res = await api(tenant)(`/retail/stock-reasons/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // --- Managed product categories (#189) ---
  {
    name: "uiiq_retail_categories",
    description: "List the tenant's managed retail product categories. Optional includeInactive.",
    inputSchema: { type: "object", properties: { includeInactive: { type: "boolean" },
        tenant: TENANT_PROP,
      } },
    async handler({ includeInactive, tenant } = {}) {
      const res = await api(tenant)(`/retail/categories${includeInactive ? "?includeInactive=1" : ""}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_category_add",
    description: "Add a retail product category. `name` required; optional `color` (hex for the till button).",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" }, color: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ name, color, tenant } = {}) {
      const res = await api(tenant)("/retail/categories", {
        method: "POST",
        body: JSON.stringify({ name, ...(color ? { color } : {}) }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_category_update",
    description: "Update a retail category by ID (name — renames across every product using it; color; active; displayOrder).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        color: { type: "string" },
        active: { type: "boolean" },
        displayOrder: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...patch } = {}) {
      const res = await api(tenant)(`/retail/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_category_delete",
    description: "Delete a retail category by ID (products keep their existing category text).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ id, tenant } = {}) {
      const res = await api(tenant)(`/retail/categories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
