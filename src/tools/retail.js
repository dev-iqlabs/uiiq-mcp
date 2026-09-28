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
  // ── Catalogue, CSV import, labels, stock movements, shop listings, suppliers ──
  {
    name: "uiiq_retail_catalogue",
    description: "The tenant's listable catalogue: its visible assortment (the admin-curated / sector / branded set, not the whole shared catalogue), each with a suggested retail, the cost floor and the platform/tenant split. Pass siteId (a connected shop) to see which items are already listed on it.",
    inputSchema: { type: "object", properties: { siteId: { type: "string", description: "A tenant-owned shop's site id (from uiiq_retail_shops)" }, tenant: TENANT_PROP } },
    async handler({ siteId, tenant } = {}) {
      const qs = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
      const res = await api(tenant)(`/retail/catalogue${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_import",
    description: "Bulk create/update retail products from already-mapped rows (max 5000). Matched by SKU first, then exact name: a match is updated, anything else is created (source CSV_IMPORT). Returns { created, updated, total }.",
    inputSchema: {
      type: "object",
      required: ["products"],
      properties: {
        products: {
          type: "array",
          description: "Rows of { name, retailPricePence } plus optional sku, barcode, costPricePence, tillCategory, stockLevel, description, vatClass (STANDARD | REDUCED | ZERO | EXEMPT), imageUrl",
          items: { type: "object", required: ["name", "retailPricePence"], properties: { name: { type: "string" }, retailPricePence: { type: "number" } }, additionalProperties: true },
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ products, tenant }) {
      const res = await api(tenant)("/retail/import", { method: "POST", body: JSON.stringify({ products }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_labels",
    description: "The data to print labels / price tags for a set of products: name, price, barcode, sku, image. Any product without a barcode gets one minted and SAVED here so the printed code matches what the till scans. withPhotos inlines each image as base64 (host-guarded, 3 MB cap).",
    inputSchema: { type: "object", required: ["productIds"], properties: { productIds: { type: "array", items: { type: "string" } }, withPhotos: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ productIds, withPhotos, tenant }) {
      const res = await api(tenant)("/retail/labels", { method: "POST", body: JSON.stringify({ productIds, withPhotos: withPhotos === true }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_stock_movements",
    description: "A retail product's stock movement history (last 100: type, delta, balanceAfter, reason, when) with its current stockLevel and trackStock flag.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Retail product id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/retail/products/${encodeURIComponent(id)}/stock`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_stock_adjust",
    description: "Receive or adjust stock on a retail product. type RECEIPT = a delivery (delta must be positive); ADJUSTMENT = stock-take / damage (any non-zero delta, plus or minus). Writes a movement, updates the cached level (never below 0) and switches stock tracking on for the product.",
    inputSchema: { type: "object", required: ["id", "type", "delta"], properties: { id: { type: "string" }, type: { type: "string", enum: ["RECEIPT", "ADJUSTMENT"] }, delta: { type: "number" }, reason: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, type, delta, reason, tenant }) {
      const res = await api(tenant)(`/retail/products/${encodeURIComponent(id)}/stock`, { method: "POST", body: JSON.stringify({ type, delta, reason }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_shop_listings",
    description: "The resold catalogue products listed on one of the tenant's connected shops: retail price, platform/tenant split, WooCommerce product id, last sync and any sync error.",
    inputSchema: { type: "object", required: ["siteId"], properties: { siteId: { type: "string", description: "Tenant-owned shop site id (from uiiq_retail_shops)" }, tenant: TENANT_PROP } },
    async handler({ siteId, tenant }) {
      const res = await api(tenant)(`/retail/shops/${encodeURIComponent(siteId)}/listings`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_shop_listing_add",
    description: "List a catalogue product on one of the tenant's shops and PUSH it to WooCommerce. The product must be in the tenant's visible assortment (403 otherwise); retailPence defaults to the assortment price, else the catalogue default, else the cost floor, and is refused below the floor (400 with minRetailPence). OWNER or ADMIN only. Returns { pushed, breakdown }.",
    inputSchema: { type: "object", required: ["siteId", "catalogProductId"], properties: { siteId: { type: "string" }, catalogProductId: { type: "string", description: "From uiiq_retail_catalogue" }, retailPence: { type: "number" }, tenant: TENANT_PROP } },
    async handler({ siteId, catalogProductId, retailPence, tenant }) {
      const res = await api(tenant)(`/retail/shops/${encodeURIComponent(siteId)}/listings`, { method: "POST", body: JSON.stringify({ catalogProductId, ...(retailPence != null ? { retailPence } : {}) }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_supplier_update",
    description: "Edit a retail (stock) supplier: name, contact details, payout notes, default consignment commission percent. Only the fields sent change; an empty string clears a field (name cannot be cleared).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, contactName: { type: "string" }, contactEmail: { type: "string" }, contactPhone: { type: "string" }, payoutNotes: { type: "string" }, defaultCommissionPct: { type: "number", description: "0-100" }, tenant: TENANT_PROP } },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (!Object.keys(body).length) throw new Error("Send at least one field to change");
      const res = await api(tenant)(`/retail/suppliers/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_supplier_delete",
    description: "Deactivate a retail supplier (soft delete: it drops out of the list; products keep their supplier link for provenance).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/retail/suppliers/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_supplier_statement",
    description: "What is owed to a consignment supplier: the unsettled entries (qty, gross, commission percent, supplier due) with a total, plus the all-time settled total.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/retail/suppliers/${encodeURIComponent(id)}/statement`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_retail_supplier_settle",
    description: "Mark ALL of a supplier's unsettled consignment entries as paid, stamping settledAt now and the optional settlementRef (e.g. the bank reference). Not reversible. Returns { ok, settled: count }.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, settlementRef: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, settlementRef, tenant }) {
      const res = await api(tenant)(`/retail/suppliers/${encodeURIComponent(id)}/statement`, { method: "POST", body: JSON.stringify({ settlementRef }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
