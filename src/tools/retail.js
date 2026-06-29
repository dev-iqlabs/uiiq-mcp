import { apiClient } from "../auth.js";

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
      },
    },
    async handler({ q, category, includeInactive, page, pageSize } = {}) {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (category) p.set("category", category);
      if (includeInactive) p.set("includeInactive", "1");
      if (page) p.set("page", String(page));
      if (pageSize) p.set("pageSize", String(pageSize));
      const res = await apiClient()(`/retail/products?${p}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_product_get",
    description: "Get a retail product by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/retail/products/${id}`);
      if (!res.ok) throw new Error(`Product not found: ${id}`);
      return res.json();
    },
  },
  {
    name: "uiiq_retail_low_stock",
    description: "List retail products at or below their reorder point.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/retail/low-stock");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_reports",
    description: "Retail sales/stock report summary.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/retail/reports");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_suppliers",
    description: "List retail suppliers.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/retail/suppliers");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_shops",
    description: "List the tenant's connected WooCommerce stores (creds never returned).",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/retail/shops");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_shop_sync",
    description: "Push the retail catalogue (products flagged Online Shop) to the connected WooCommerce store(s) — name, price, photo, barcode, stock, category. Returns a per-shop summary.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/retail/shops/sync", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_orders_pull",
    description: "Pull recent orders from the connected WooCommerce store(s) and decrement till stock for matched products (idempotent). Returns a per-shop summary.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/retail/shops/pull-orders", { method: "POST" });
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
      },
    },
    async handler({ direction, includeInactive } = {}) {
      const p = new URLSearchParams();
      if (direction) p.set("direction", direction);
      if (includeInactive) p.set("includeInactive", "1");
      const qs = p.toString();
      const res = await apiClient()(`/retail/stock-reasons${qs ? `?${qs}` : ""}`);
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
      },
    },
    async handler({ label, direction } = {}) {
      const res = await apiClient()("/retail/stock-reasons", {
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
      },
    },
    async handler({ id, ...patch } = {}) {
      const res = await apiClient()(`/retail/stock-reasons/${id}`, {
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
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id } = {}) {
      const res = await apiClient()(`/retail/stock-reasons/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // --- Managed product categories (#189) ---
  {
    name: "uiiq_retail_categories",
    description: "List the tenant's managed retail product categories. Optional includeInactive.",
    inputSchema: { type: "object", properties: { includeInactive: { type: "boolean" } } },
    async handler({ includeInactive } = {}) {
      const res = await apiClient()(`/retail/categories${includeInactive ? "?includeInactive=1" : ""}`);
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
      properties: { name: { type: "string" }, color: { type: "string" } },
    },
    async handler({ name, color } = {}) {
      const res = await apiClient()("/retail/categories", {
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
      },
    },
    async handler({ id, ...patch } = {}) {
      const res = await apiClient()(`/retail/categories/${id}`, {
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
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id } = {}) {
      const res = await apiClient()(`/retail/categories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
