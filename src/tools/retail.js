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
];
