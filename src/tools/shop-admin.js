import { readFile } from "fs/promises";
import { basename, extname } from "path";
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
const post = (tenant, path, body) => api(tenant)(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const send = (tenant, path, method, body) => api(tenant)(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
const query = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const enc = encodeURIComponent;

const ARTWORK_MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", tif: "image/tiff", tiff: "image/tiff", pdf: "application/pdf" };
const PREVIEW_MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

async function s3Upload(client, presignBody, path, mimes) {
  const filename = basename(path);
  const mime = mimes[extname(filename).slice(1).toLowerCase()];
  if (!mime) throw new Error(`Unsupported file type for ${presignBody.kind}: ${filename} (takes ${Object.keys(mimes).join(", ")})`);
  const bytes = await readFile(path);
  if (bytes.length === 0) throw new Error(`${filename} is empty`);
  const presign = await client("/admin/designs/presign", { method: "POST", body: JSON.stringify({ ...presignBody, filename, contentType: mime }) });
  if (!presign.ok) throw await fail(presign);
  const { post: form, fileUrl } = await presign.json();
  const fd = new FormData();
  for (const [k, v] of Object.entries(form.fields)) fd.append(k, v);
  fd.append("file", new Blob([bytes], { type: mime }), filename);
  const s3 = await fetch(form.url, { method: "POST", body: fd });
  if (!s3.ok) throw new Error(`Storage refused the upload: HTTP ${s3.status} ${(await s3.text()).slice(0, 200)}`);
  return { fileUrl, mime, size: bytes.length };
}

// SHOP ADMIN — the UIMerch catalogue behind every tenant shop: catalog
// products (configured from supplier SKUs or print templates), their variants
// and preset bundles, per-tenant assortments, the connected WooCommerce shops
// products are pushed to, the order review queue, plus the tenant-side feeds
// (/shop/*), print products/techniques/tiers, designs and suppliers.
//
// Everything under /admin/shop, /admin/designs, /admin/print-products,
// /admin/print-techniques, /admin/suppliers and /admin/supplier-types is the
// operator's control plane: reads need a STAFF/ADMIN/SUPER_ADMIN login, writes
// SUPER_ADMIN. Those tools take no `tenant` — where a tenant matters it is a
// parameter. The /shop/* feeds, /catalogue/sync and /admin/print/* are
// tenant-scoped and do take `tenant`.
//
// Not here on purpose: POST /channels/orders is a Bearer CHANNEL_WEBHOOK_SECRET
// machine contract for marketplace channel connectors.
const DESIGN_CATEGORIES = ["DTF_APPAREL", "MUG", "COIN", "BOOK", "SIGN", "STATIONERY", "GENERIC"];
const DESIGN_ORIGINS = ["STAFF_UPLOAD", "BRAND_LOGO", "CUSTOMER_UPLOAD"];
const DESIGN_VISIBILITIES = ["GLOBAL", "TENANT_ONLY", "DRAFT"];
const REVIEW_STATUSES = ["NEW", "APPROVED", "REJECTED"];
const PRODUCT_SHAPES = ["FLAT_SKU", "PRINT_MATRIX", "SERVICE", "DIGITAL", "NONE"];
const ORDER_STATUSES = ["AWAITING_PAYMENT", "PAYMENT_DECLINED", "PAYMENT_FAILED", "PUSHING", "PENDING_REVIEW", "APPROVED", "IN_PRODUCTION", "SHIPPED", "COMPLETED", "REJECTED", "CANCELLED"];

const PLACEMENT_SCHEMA = {
  type: "array",
  description: "Decoration placements: each applies a print technique at a price tier (size). [] or omitted = undecorated.",
  items: { type: "object", required: ["techniqueId", "tierId"], properties: { techniqueId: { type: "string" }, tierId: { type: "string" }, location: { type: "string" }, xPct: { type: "number" }, yPct: { type: "number" }, rotationDeg: { type: "number" } } },
};

export const shopAdminTools = [
  // ── Tenant-side shop feeds ──
  {
    name: "uiiq_shop_product_list",
    description: "Products the workspace can order from active connected shops (up to 200): id, name, category, brand, retail and default price. Filter by shopId, category or free-text q.",
    inputSchema: { type: "object", properties: { shopId: { type: "string" }, category: { type: "string" }, q: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...f } = {}) {
      const q = query(f);
      const res = await api(tenant)(`/shop/products${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_pricing",
    description: "The workspace's assortment as priced for it: partner price per product (with any per-tenant override), the IQEX credit price where a product can be bought with credits, and the credit balance.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/shop/pricing");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_designs",
    description: "Approved designs the workspace may put on products: global ones plus its own tenant-only ones. search matches name, slug or tag; category is one of the design categories.",
    inputSchema: { type: "object", properties: { search: { type: "string" }, category: { type: "string", enum: DESIGN_CATEGORIES }, tenant: TENANT_PROP } },
    async handler({ tenant, ...f } = {}) {
      const q = query(f);
      const res = await api(tenant)(`/shop/designs${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_order_list",
    description: "The workspace's own shop orders (newest first) with line items, optionally filtered by status.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ORDER_STATUSES }, tenant: TENANT_PROP } },
    async handler({ tenant, status } = {}) {
      const q = query({ status });
      const res = await api(tenant)(`/shop/orders${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_order_place",
    description: "Place a shop order for the workspace. Default payment goes to PENDING_REVIEW for the operator to approve and invoice. paymentMethod CREDITS CHARGES the workspace's IQEX credits at once (OWNER/ADMIN only; pass idempotencyKey to make a retry safe) and pushes the order to the source shop.",
    inputSchema: {
      type: "object", required: ["items"],
      properties: {
        items: { type: "array", items: { type: "object", required: ["catalogProductId", "quantity"], properties: { catalogProductId: { type: "string" }, quantity: { type: "number" }, notes: { type: "string" } } } },
        poReference: { type: "string" }, customerNotes: { type: "string" },
        paymentMethod: { type: "string", enum: ["CREDITS"], description: "Omit to invoice; CREDITS spends credits now" },
        idempotencyKey: { type: "string" }, tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/shop/orders", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalogue_sync",
    description: "Pull a workspace's own WooCommerce import source into its product cache (published products, 100 max). Rate limited to once per 5 minutes per source.",
    inputSchema: { type: "object", required: ["importSourceId"], properties: { importSourceId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ tenant, importSourceId }) {
      const res = await post(tenant, "/catalogue/sync", { importSourceId });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Assortments (which catalog products a tenant sees) ──
  {
    name: "uiiq_shop_assortment_list",
    description: "A tenant's assortment: the catalog products it can order, in position order, with price override and custom name. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["tenantId"], properties: { tenantId: { type: "string" } } },
    async handler({ tenantId }) {
      const q = query({ tenantId });
      const res = await api()(`/admin/shop/assortments${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_assortment_add",
    description: "Add a catalog product to a tenant's assortment (409 if already there), optionally with a per-tenant price override in pence and a custom name. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["tenantId", "catalogProductId"], properties: { tenantId: { type: "string" }, catalogProductId: { type: "string" }, priceOverridePence: { type: "number" }, customName: { type: "string" } } },
    async handler(body) {
      const res = await post(undefined, "/admin/shop/assortments", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_assortment_remove",
    description: "Remove an assortment row (by its assortment id, not the product id). SUPER_ADMIN only. Deletes.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const q = query({ id });
      const res = await api()(`/admin/shop/assortments${q}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_assortment_bulk_by_sector",
    description: "Add every active, visible catalog product tagged with any of the given sectors to a tenant's assortment; products already there are skipped. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["tenantId", "sectors"], properties: { tenantId: { type: "string" }, sectors: { type: "array", items: { type: "string" } } } },
    async handler({ tenantId, sectors }) {
      const res = await send(undefined, "/admin/shop/assortments?action=bulk-by-sector", "PUT", { tenantId, sectors });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Catalog products ──
  {
    name: "uiiq_shop_catalog_list",
    description: "The UIMerch catalog, newest first, with facets (categories, shops, brands). Filters: search (name), category, shopId, sector tag, brand slug, source configurator|synced, hidden true|false, page, limit (max 100). SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: { search: { type: "string" }, category: { type: "string" }, shopId: { type: "string" }, sector: { type: "string" }, brand: { type: "string" }, source: { type: "string", enum: ["configurator", "synced"] }, hidden: { type: "boolean" }, page: { type: "number" }, limit: { type: "number" } } },
    async handler(f = {}) {
      const q = query(f);
      const res = await api()(`/admin/shop/catalog${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_get",
    description: "One catalog product in full: supplier SKU, design, recipe, placements with technique and tier, variants, assortments, site bindings and WooCommerce push state. Staff login.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/shop/catalog/${enc(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_configure",
    description: "Configurator: turn a supplier SKU into a priced catalog product. partnerPrice = ceil((wholesale + sum of placement print costs) x (1 + uimerchMarkupPct/100)). Binds it to the shop's site and PUSHES it to WooCommerce in the background. SUPER_ADMIN only.",
    inputSchema: {
      type: "object", required: ["supplierProductId", "connectedShopId", "uimerchMarkupPct"],
      properties: { supplierProductId: { type: "string" }, connectedShopId: { type: "string" }, uimerchMarkupPct: { type: "number", description: "0-500" }, designId: { type: "string" }, taskRecipeId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, productReferenceWidthCm: { type: "number", description: "5-500, the product's real width for mockup scaling" }, placements: PLACEMENT_SCHEMA },
    },
    async handler(body) {
      const res = await post(undefined, "/admin/shop/catalog/configure", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_configure_print",
    description: "Print configurator: turn a print product template + option selection into one priced catalog product PER connected shop. Base cost = the template's pricing matrix at material|size|sides|finish for the quantity x the turnaround multiplier; partner price applies uimerchMarkupPct. PUSHES each row to WooCommerce in the background. Staff login.",
    inputSchema: {
      type: "object", required: ["printProductId", "selection", "connectedShopIds", "uimerchMarkupPct"],
      properties: {
        printProductId: { type: "string" },
        selection: { type: "object", required: ["material", "size", "sides", "finish", "turnaround", "quantity"], properties: { material: { type: "string" }, size: { type: "string" }, sides: { type: "string" }, finish: { type: "string" }, turnaround: { type: "string" }, quantity: { type: "number" } } },
        connectedShopIds: { type: "array", items: { type: "string" } }, uimerchMarkupPct: { type: "number" },
        designId: { type: "string" }, taskRecipeId: { type: "string" }, name: { type: "string" }, slug: { type: "string" },
      },
    },
    async handler(body) {
      const res = await post(undefined, "/admin/shop/catalog/configure-print", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_update",
    description: "Edit a catalog product: name, slug, descriptions, images, category, sectorTags, brand, design, recipe, active, hiddenInShop, prices, creditActionKey (IQEX tariff key so tenants can pay with credits), productReferenceWidthCm. Passing placements (replaces all) or uimerchMarkupPct on a configurator-built product RECOMPUTES its partner price and its variants'. repush=true re-pushes it to every site. SUPER_ADMIN only.",
    inputSchema: {
      type: "object", required: ["id"],
      properties: {
        id: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, description: { type: "string" }, shortDescription: { type: "string" }, supplierNotes: { type: "string" },
        imageUrl: { type: "string" }, imageUrls: { type: "array", items: { type: "string" } }, category: { type: "string" }, sectorTags: { type: "array", items: { type: "string" } },
        brandSlug: { type: "string" }, brandName: { type: "string" }, brandParentSlug: { type: "string" }, designId: { type: "string" }, taskRecipeId: { type: "string" },
        active: { type: "boolean" }, hiddenInShop: { type: "boolean" }, configuratorUrl: { type: "string" }, creditActionKey: { type: "string" }, productReferenceWidthCm: { type: "number" },
        defaultPricePence: { type: "number" }, retailPricePence: { type: "number" }, uimerchMarkupPct: { type: "number" }, placements: PLACEMENT_SCHEMA, repush: { type: "boolean" },
      },
    },
    async handler({ id, ...body }) {
      const res = await send(undefined, `/admin/shop/catalog/${enc(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_push",
    description: "PUSH a catalog product to a WooCommerce site now (creates or updates the WC product). Target is the connected shop's linked site unless siteId is given. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, siteId: { type: "string" } } },
    async handler({ id, siteId }) {
      const q = query({ action: "push", siteId });
      const res = await api()(`/admin/shop/catalog/${enc(id)}${q}`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_delete",
    description: "Archive a catalog product (active=false). hard=true DELETES the row instead, refused (409) while any assortment, order item, WC push or preset still references it. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, hard: { type: "boolean" } } },
    async handler({ id, hard }) {
      const q = query({ hard: hard ? "1" : undefined });
      const res = await api()(`/admin/shop/catalog/${enc(id)}${q}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_mockup_generate",
    description: "Fire the IQEX mockup recipe for a catalog product: composites its design artwork onto the product image at the placements. Runs as an IQEX job and SPENDS credits; the result lands by callback (watch mockupStatus on the product). Needs a design with artwork, a product image and at least one placement; 409 while one is already running. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/shop/catalog/${enc(id)}/generate-mockup`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_sector_backfill",
    description: "Add an active, visible catalog product to the assortment of every tenant whose sector preset matches one of its sector tags. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/shop/catalog/${enc(id)}/sector-backfill`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Preset bundles on a catalog product ──
  {
    name: "uiiq_shop_catalog_preset_list",
    description: "Preset combos (named quantity + option bundles at a fixed price) on a catalog product. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Catalog product id" } } },
    async handler({ id }) {
      const res = await api()(`/admin/shop/catalog/${enc(id)}/presets`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_preset_add",
    description: "Add a preset combo to a catalog product: name, quantity, pricePence, optional description, options object and position. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id", "name", "quantity", "pricePence"], properties: { id: { type: "string", description: "Catalog product id" }, name: { type: "string" }, quantity: { type: "number" }, pricePence: { type: "number" }, description: { type: "string" }, options: { type: "object" }, position: { type: "number" } } },
    async handler({ id, ...body }) {
      const res = await post(undefined, `/admin/shop/catalog/${enc(id)}/presets`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_preset_update",
    description: "Edit a preset combo (by presetId) on a catalog product: name, description, options, quantity, pricePence, active, position. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id", "presetId"], properties: { id: { type: "string", description: "Catalog product id" }, presetId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, options: { type: "object" }, quantity: { type: "number" }, pricePence: { type: "number" }, active: { type: "boolean" }, position: { type: "number" } } },
    async handler({ id, ...body }) {
      const res = await send(undefined, `/admin/shop/catalog/${enc(id)}/presets`, "PUT", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_preset_remove",
    description: "Delete a preset combo from a catalog product. SUPER_ADMIN only. Deletes.",
    inputSchema: { type: "object", required: ["id", "presetId"], properties: { id: { type: "string", description: "Catalog product id" }, presetId: { type: "string" } } },
    async handler({ id, presetId }) {
      const res = await send(undefined, `/admin/shop/catalog/${enc(id)}/presets`, "DELETE", { presetId });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Variants (sibling supplier SKUs: colour/size) ──
  {
    name: "uiiq_shop_catalog_variant_list",
    description: "A catalog product's variants (linked supplier SKUs with stock and prices) plus the candidate sibling SKUs sharing its parent SKU that are not yet variants. Staff login.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Catalog product id" } } },
    async handler({ id }) {
      const res = await api()(`/admin/shop/catalog/${enc(id)}/variants`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_variant_add",
    description: "Add supplier SKUs as variants of a catalog product (upsert; partner price = wholesale + the product's print cost, at its markup). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id", "supplierProductIds"], properties: { id: { type: "string", description: "Catalog product id" }, supplierProductIds: { type: "array", items: { type: "string" } } } },
    async handler({ id, supplierProductIds }) {
      const res = await post(undefined, `/admin/shop/catalog/${enc(id)}/variants`, { supplierProductIds });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_variant_update",
    description: "Edit a variant: active, sku, imageUrl, colour, size, position, attributesJson. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id", "variantId"], properties: { id: { type: "string", description: "Catalog product id" }, variantId: { type: "string" }, active: { type: "boolean" }, sku: { type: "string" }, imageUrl: { type: "string" }, colour: { type: "string" }, size: { type: "string" }, position: { type: "number" }, attributesJson: { type: "object" } } },
    async handler({ id, variantId, ...body }) {
      const res = await send(undefined, `/admin/shop/catalog/${enc(id)}/variants/${enc(variantId)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_catalog_variant_remove",
    description: "Delete a variant from a catalog product. SUPER_ADMIN only. Deletes.",
    inputSchema: { type: "object", required: ["id", "variantId"], properties: { id: { type: "string", description: "Catalog product id" }, variantId: { type: "string" } } },
    async handler({ id, variantId }) {
      const res = await api()(`/admin/shop/catalog/${enc(id)}/variants/${enc(variantId)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Connected shops (WooCommerce stores products are pushed to / synced from) ──
  {
    name: "uiiq_shop_connected_list",
    description: "The connected WooCommerce shops with product and order counts, last sync, and whether credentials are set (keys are never returned). SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await api()("/admin/shop/connected-shops");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_connected_get",
    description: "One connected shop (credentials redacted). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/shop/connected-shops/${enc(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_connected_add",
    description: "Connect a WooCommerce shop: name, slug, url and its REST consumerKey/consumerSecret (stored encrypted). Auto-links to a Site with the same slug. Returns the webhook secret ONCE. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["name", "slug", "url", "consumerKey", "consumerSecret"], properties: { name: { type: "string" }, slug: { type: "string" }, url: { type: "string" }, consumerKey: { type: "string" }, consumerSecret: { type: "string" }, brandColor: { type: "string" }, logoUrl: { type: "string" }, taskBoardId: { type: "string" } } },
    async handler(body) {
      const res = await post(undefined, "/admin/shop/connected-shops", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_connected_update",
    description: "Edit a connected shop: name, url (https, public), consumerKey/consumerSecret, brandColor, logoUrl, active, taskBoardId. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, url: { type: "string" }, consumerKey: { type: "string" }, consumerSecret: { type: "string" }, brandColor: { type: "string" }, logoUrl: { type: "string" }, active: { type: "boolean" }, taskBoardId: { type: "string" } } },
    async handler({ id, ...body }) {
      const res = await send(undefined, `/admin/shop/connected-shops/${enc(id)}`, "PUT", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_connected_remove",
    description: "Delete a connected shop. SUPER_ADMIN only. Deletes.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/shop/connected-shops/${enc(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_connected_test",
    description: "Test a connected shop's WooCommerce credentials against its store. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/shop/connected-shops/${enc(id)}?action=test`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_connected_sync",
    description: "Pull every product from a connected shop into the catalog (upsert by WC product id; tenant-facing default price is never overwritten). Also reads product_brand terms. Rate limited to once per 5 minutes; a partial run records how far it got. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/shop/connected-shops/${enc(id)}?action=sync`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_connected_rotate_secret",
    description: "Rotate a connected shop's webhook secret; the old one stops working at once and the new one is returned ONCE. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/shop/connected-shops/${enc(id)}?action=rotate-secret`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Order review queue (operator side) ──
  {
    name: "uiiq_shop_admin_order_list",
    description: "Shop orders across every tenant, newest first, with tenant name and line items. Filter by status and tenantId; page/limit (max 100). SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ORDER_STATUSES }, tenantId: { type: "string" }, page: { type: "number" }, limit: { type: "number" } } },
    async handler(f = {}) {
      const q = query(f);
      const res = await api()(`/admin/shop/orders${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_admin_order_get",
    description: "One shop order in full: tenant, items with catalog product cost and price, source shop, linked task card. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/shop/orders/${enc(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_admin_order_approve",
    description: "Approve a pending shop order: PUSHES it to the source WooCommerce shop as a paid order (goods get made) and opens a task card. If an earlier push got no answer, the API asks you to check the shop first; pass confirmNoShopOrder=true once you have. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, reviewNotes: { type: "string" }, confirmNoShopOrder: { type: "boolean" } } },
    async handler({ id, ...body }) {
      const res = await post(undefined, `/admin/shop/orders/${enc(id)}?action=approve`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_admin_order_reject",
    description: "Reject a shop order that has not reached the shop (PENDING_REVIEW, PAYMENT_FAILED, or stale AWAITING_PAYMENT/PUSHING). A credit-paid order is REFUNDED to the workspace; if IQEX refuses the refund the order is put back. confirmNoShopOrder=true after checking the shop when an earlier push got no answer. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, reason: { type: "string" }, confirmNoShopOrder: { type: "boolean" } } },
    async handler({ id, ...body }) {
      const res = await post(undefined, `/admin/shop/orders/${enc(id)}?action=reject`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_admin_order_mark_invoiced",
    description: "Record that a shop order has been invoiced (optional invoiceNumber; stamps invoicedAt). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, invoiceNumber: { type: "string" } } },
    async handler({ id, invoiceNumber }) {
      const res = await post(undefined, `/admin/shop/orders/${enc(id)}?action=mark-invoiced`, { invoiceNumber });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_admin_order_mark_paid",
    description: "Record that a shop order's invoice has been paid (stamps paidAt). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await post(undefined, `/admin/shop/orders/${enc(id)}?action=mark-paid`, {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── WooCommerce push health + repricing ──
  {
    name: "uiiq_shop_push_status",
    description: "WooCommerce push health: product and variant pushes that errored (up to 200 each), error totals, and the sites. siteId narrows to one site; includeOk=true lists successful product pushes too. Staff login.",
    inputSchema: { type: "object", properties: { siteId: { type: "string" }, includeOk: { type: "boolean" } } },
    async handler({ siteId, includeOk } = {}) {
      const q = query({ siteId, includeOk: includeOk ? "1" : undefined });
      const res = await api()(`/admin/shop/push-status${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_shop_reprice",
    description: "Reprice configurator-built products whose supplier wholesale cost has drifted from the snapshot: recomputes partner/retail/default price at each product's markup. dryRun=true only reports the changes; otherwise it WRITES the new prices and RE-PUSHES each changed product to WooCommerce. supplierId limits to one supplier. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: { dryRun: { type: "boolean" }, supplierId: { type: "string" } } },
    async handler({ dryRun, supplierId } = {}) {
      const res = await post(undefined, "/admin/shop/reprice", { dryRun: dryRun === true, supplierId });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Printing through IQ Labs (tenant-scoped; needs the iqex_print feature) ──
  {
    name: "uiiq_print_template_list",
    description: "Print designs (IQEX Design Studio templates) the venue can print tickets and vouchers on, optionally by category (e.g. VOUCHERS). Needs the `iqex_print` feature, the platform print switch, an IQEX-linked venue and an OWNER/ADMIN/MANAGER login.",
    inputSchema: { type: "object", properties: { category: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ tenant, category } = {}) {
      const q = query({ category });
      const res = await api(tenant)(`/admin/print/templates${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_tickets_send",
    description: "SEND a booking's tickets to the IQ Labs print queue on a ticket design (template slug). ticketIds narrows to some of the booking's tickets. This orders physical printing and is charged. Needs the `iqex_print` feature.",
    inputSchema: { type: "object", required: ["bookingId", "template"], properties: { bookingId: { type: "string" }, template: { type: "string" }, ticketIds: { type: "array", items: { type: "string" } }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/admin/print/tickets", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_tickets_status",
    description: "Print status (and proof link) of each of a booking's tickets in the IQ Labs queue. Needs the `iqex_print` feature.",
    inputSchema: { type: "object", required: ["bookingId"], properties: { bookingId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ tenant, bookingId }) {
      const q = query({ bookingId });
      const res = await api(tenant)(`/admin/print/tickets${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_vouchers_send",
    description: "SEND gift vouchers (by gift card id) to the IQ Labs print queue. template defaults to the venue's first VOUCHERS design. Message cards and zero-value cards are skipped. This orders physical printing and is charged. Needs the `iqex_print` feature.",
    inputSchema: { type: "object", required: ["giftCardIds"], properties: { giftCardIds: { type: "array", items: { type: "string" } }, template: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ tenant, ...body }) {
      const res = await post(tenant, "/admin/print/vouchers", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_vouchers_status",
    description: "Print status (and proof link) of gift vouchers in the IQ Labs queue, by gift card ids. Needs the `iqex_print` feature.",
    inputSchema: { type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } }, tenant: TENANT_PROP } },
    async handler({ tenant, ids }) {
      const q = query({ ids: ids.join(",") });
      const res = await api(tenant)(`/admin/print/vouchers${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Print products (supplier templates with an options + pricing matrix) ──
  {
    name: "uiiq_print_product_list",
    description: "Active print product templates (global ones, plus a tenant's own when tenantId is given) with their options and pricing matrix. Filter by supplierId, supplierSlug, category. Staff login.",
    inputSchema: { type: "object", properties: { supplierId: { type: "string" }, supplierSlug: { type: "string" }, tenantId: { type: "string" }, category: { type: "string" } } },
    async handler(f = {}) {
      const q = query(f);
      const res = await api()(`/admin/print-products${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_product_get",
    description: "One print product template in full (options, pricing matrix, supplier, owning tenant). Staff login.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/print-products/${enc(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_product_update",
    description: "Edit a print product template: name, description, active, tenantId (null = global), imageUrls, marginPercent, defaultMaterial, defaultSize, defaultQuantity. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, active: { type: "boolean" }, tenantId: { type: ["string", "null"] }, imageUrls: { type: "array", items: { type: "string" } }, marginPercent: { type: "number" }, defaultMaterial: { type: "string" }, defaultSize: { type: "string" }, defaultQuantity: { type: "number" } } },
    async handler({ id, ...body }) {
      const res = await send(undefined, `/admin/print-products/${enc(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Print techniques + price tiers (the decoration cost formula) ──
  {
    name: "uiiq_print_technique_list",
    description: "Print techniques (DTF, embroidery, laser...) with pricing mode, formula inputs and product/tier counts. SUPER_ADMIN only.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await api()("/admin/print-techniques");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_technique_create",
    description: "Create a print technique: slug, name, baseCostPence; pricingMode AREA (needs materialAreaCm2) | VOLUME (materialMlPerUnit) | OUTSOURCED (no surcharge); supplierProductId = the consumable whose wholesale price feeds the formula; materialMarkupBasis, labourRatePerMinPence, setupCostPence. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug", "name", "baseCostPence"], properties: { slug: { type: "string" }, name: { type: "string" }, baseCostPence: { type: "number" }, description: { type: "string" }, setupCostPence: { type: "number" }, pricingMode: { type: "string", enum: ["AREA", "VOLUME", "OUTSOURCED"] }, supplierProductId: { type: "string" }, materialAreaCm2: { type: "number" }, materialMlPerUnit: { type: "number" }, materialMarkupBasis: { type: "number" }, labourRatePerMinPence: { type: "number" } } },
    async handler(body) {
      const res = await post(undefined, "/admin/print-techniques", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_technique_update",
    description: "Edit a print technique by id: any of slug, name, description, baseCostPence, setupCostPence, active, pricingMode, supplierProductId, materialAreaCm2, materialMlPerUnit, materialMarkupBasis, labourRatePerMinPence. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, slug: { type: "string" }, name: { type: "string" }, description: { type: "string" }, baseCostPence: { type: "number" }, setupCostPence: { type: "number" }, active: { type: "boolean" }, pricingMode: { type: "string", enum: ["AREA", "VOLUME", "OUTSOURCED"] }, supplierProductId: { type: ["string", "null"] }, materialAreaCm2: { type: ["number", "null"] }, materialMlPerUnit: { type: ["number", "null"] }, materialMarkupBasis: { type: ["number", "null"] }, labourRatePerMinPence: { type: ["number", "null"] } } },
    async handler(body) {
      const res = await send(undefined, "/admin/print-techniques", "PUT", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_tier_list",
    description: "A technique's price tiers (sizes or volumes) with the computed print cost of each and its breakdown ('—' when the technique is missing formula inputs). SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["techniqueId"], properties: { techniqueId: { type: "string" } } },
    async handler({ techniqueId }) {
      const res = await api()(`/admin/print-techniques/${enc(techniqueId)}/tiers`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_tier_add",
    description: "Add a price tier to a technique: name, labourMinutes, plus widthCm+heightCm (AREA/OUTSOURCED) or volumeMl (VOLUME); optional position, active. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["techniqueId", "name", "labourMinutes"], properties: { techniqueId: { type: "string" }, name: { type: "string" }, labourMinutes: { type: "number" }, widthCm: { type: "number" }, heightCm: { type: "number" }, volumeMl: { type: "number" }, position: { type: "number" }, active: { type: "boolean" } } },
    async handler({ techniqueId, ...body }) {
      const res = await post(undefined, `/admin/print-techniques/${enc(techniqueId)}/tiers`, body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_tier_update",
    description: "Edit a price tier: name, labourMinutes, widthCm/heightCm or volumeMl (by the technique's mode), position, active. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["techniqueId", "tierId"], properties: { techniqueId: { type: "string" }, tierId: { type: "string" }, name: { type: "string" }, labourMinutes: { type: "number" }, widthCm: { type: "number" }, heightCm: { type: "number" }, volumeMl: { type: "number" }, position: { type: "number" }, active: { type: "boolean" } } },
    async handler({ techniqueId, tierId, ...body }) {
      const q = query({ tierId });
      const res = await send(undefined, `/admin/print-techniques/${enc(techniqueId)}/tiers${q}`, "PUT", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_print_tier_remove",
    description: "Delete a price tier; a tier still used by product placements is disabled (active=false) instead and the response says so. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["techniqueId", "tierId"], properties: { techniqueId: { type: "string" }, tierId: { type: "string" } } },
    async handler({ techniqueId, tierId }) {
      const q = query({ tierId });
      const res = await api()(`/admin/print-techniques/${enc(techniqueId)}/tiers${q}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Designs (artwork library) ──
  {
    name: "uiiq_design_list",
    description: "The design library, newest first, with facets. Filters: search (name/slug/tag), origin, category, visibility, reviewStatus, tenantId (owner), siteId (origin site), activeOnly (default true), page, limit (max 100). Staff login.",
    inputSchema: { type: "object", properties: { search: { type: "string" }, origin: { type: "string", enum: DESIGN_ORIGINS }, category: { type: "string", enum: DESIGN_CATEGORIES }, visibility: { type: "string", enum: DESIGN_VISIBILITIES }, reviewStatus: { type: "string", enum: REVIEW_STATUSES }, tenantId: { type: "string" }, siteId: { type: "string" }, activeOnly: { type: "boolean" }, page: { type: "number" }, limit: { type: "number" } } },
    async handler({ activeOnly, ...f } = {}) {
      const q = query({ ...f, activeOnly: activeOnly === false ? "0" : undefined });
      const res = await api()(`/admin/designs${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_design_get",
    description: "One design with its owner tenant, origin site and up to 50 products using it. Staff login.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/designs/${enc(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_design_presign",
    description: "A presigned S3 POST for a design file: kind artwork (png/jpeg/webp/tiff/pdf, 200 MB, needs slug), preview (png/jpeg/webp, 10 MB, needs slug) or logo (needs tenantId; non-super-admins only their own). Returns { post: { url, fields }, fileUrl, key }: send every field then the file as multipart, and use fileUrl in uiiq_design_create/update. Staff login. uiiq_design_upload does all of this from a local path.",
    inputSchema: { type: "object", required: ["kind", "contentType"], properties: { kind: { type: "string", enum: ["artwork", "preview", "logo"] }, contentType: { type: "string" }, filename: { type: "string" }, slug: { type: "string" }, tenantId: { type: "string" } } },
    async handler(body) {
      const res = await post(undefined, "/admin/designs/presign", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_design_create",
    description: "Register a design: slug + name, optional description, tags, origin (default STAFF_UPLOAD), category (default GENERIC), visibility (default DRAFT; TENANT_ONLY needs ownerTenantId), reviewStatus (default APPROVED), previewImageUrl, artworkFileUrl (+ artworkContentType, artworkSizeBytes, artworkPageCount), sourceWidthMm/HeightMm/Dpi, siteOriginId, submittedBy (customer email). SUPER_ADMIN only.",
    inputSchema: {
      type: "object", required: ["slug", "name"],
      properties: { slug: { type: "string" }, name: { type: "string" }, description: { type: "string" }, tags: { type: "array", items: { type: "string" } }, origin: { type: "string", enum: DESIGN_ORIGINS }, category: { type: "string", enum: DESIGN_CATEGORIES }, visibility: { type: "string", enum: DESIGN_VISIBILITIES }, reviewStatus: { type: "string", enum: REVIEW_STATUSES }, previewImageUrl: { type: "string" }, artworkFileUrl: { type: "string" }, artworkContentType: { type: "string" }, artworkSizeBytes: { type: "number" }, artworkPageCount: { type: "number" }, sourceWidthMm: { type: "number" }, sourceHeightMm: { type: "number" }, sourceDpi: { type: "number" }, ownerTenantId: { type: "string" }, siteOriginId: { type: "string" }, submittedBy: { type: "string" } },
    },
    async handler(body) {
      const res = await post(undefined, "/admin/designs", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_design_upload",
    description: "Upload artwork from a local path and register it as a design in one go (presign, put to S3, create): slug, name, path, optional previewPath (png/jpeg/webp) and the same metadata as uiiq_design_create. SUPER_ADMIN only.",
    inputSchema: {
      type: "object", required: ["slug", "name", "path"],
      properties: { slug: { type: "string" }, name: { type: "string" }, path: { type: "string", description: "Local artwork file: png, jpg, webp, tiff or pdf (200 MB)" }, previewPath: { type: "string" }, description: { type: "string" }, tags: { type: "array", items: { type: "string" } }, origin: { type: "string", enum: DESIGN_ORIGINS }, category: { type: "string", enum: DESIGN_CATEGORIES }, visibility: { type: "string", enum: DESIGN_VISIBILITIES }, reviewStatus: { type: "string", enum: REVIEW_STATUSES }, sourceWidthMm: { type: "number" }, sourceHeightMm: { type: "number" }, sourceDpi: { type: "number" }, ownerTenantId: { type: "string" }, siteOriginId: { type: "string" }, submittedBy: { type: "string" } },
    },
    async handler({ path, previewPath, ...meta }) {
      const client = api();
      const art = await s3Upload(client, { kind: "artwork", slug: meta.slug }, path, ARTWORK_MIME);
      const preview = previewPath ? await s3Upload(client, { kind: "preview", slug: meta.slug }, previewPath, PREVIEW_MIME) : null;
      const res = await client("/admin/designs", { method: "POST", body: JSON.stringify({ ...meta, artworkFileUrl: art.fileUrl, artworkContentType: art.mime, artworkSizeBytes: art.size, previewImageUrl: preview?.fileUrl }) });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_design_update",
    description: "Edit a design: name, description, tags, origin, category, visibility, reviewStatus (approve/reject here), ownerTenantId, siteOriginId, previewImageUrl, artwork fields, source size/dpi, submittedBy, active. SUPER_ADMIN only.",
    inputSchema: {
      type: "object", required: ["id"],
      properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, tags: { type: "array", items: { type: "string" } }, origin: { type: "string", enum: DESIGN_ORIGINS }, category: { type: "string", enum: DESIGN_CATEGORIES }, visibility: { type: "string", enum: DESIGN_VISIBILITIES }, reviewStatus: { type: "string", enum: REVIEW_STATUSES }, ownerTenantId: { type: ["string", "null"] }, siteOriginId: { type: ["string", "null"] }, previewImageUrl: { type: "string" }, artworkFileUrl: { type: "string" }, artworkContentType: { type: "string" }, artworkSizeBytes: { type: "number" }, artworkPageCount: { type: "number" }, sourceWidthMm: { type: "number" }, sourceHeightMm: { type: "number" }, sourceDpi: { type: "number" }, submittedBy: { type: "string" }, active: { type: "boolean" } },
    },
    async handler({ id, ...body }) {
      const res = await send(undefined, `/admin/designs/${enc(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_design_delete",
    description: "Archive a design (active=false). hard=true DELETES it instead, refused (409) while any product uses it. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, hard: { type: "boolean" } } },
    async handler({ id, hard }) {
      const q = query({ hard: hard ? "1" : undefined });
      const res = await api()(`/admin/designs/${enc(id)}${q}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_design_send_proof",
    description: "SENDS a proof-approval EMAIL to the design's submittedBy address (must be a valid email) with a 7-day link; any earlier proof response is cleared. Returns the proof URL too, for when SMTP is not configured. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/designs/${enc(id)}/send-proof`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Suppliers + supplier types ──
  {
    name: "uiiq_supplier_list",
    description: "All suppliers with their type (product shape) and counts of products, imports and print products.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await api()("/admin/suppliers");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_supplier_create",
    description: "Create a supplier: slug, name, typeId (a supplier type), feedKind (MANUAL default, or the feed kinds e.g. SCRAPE), feedUrl, website, contactEmail, notes. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug", "name", "typeId"], properties: { slug: { type: "string" }, name: { type: "string" }, typeId: { type: "string" }, feedKind: { type: "string" }, feedUrl: { type: "string" }, website: { type: "string" }, contactEmail: { type: "string" }, notes: { type: "string" } } },
    async handler(body) {
      const res = await post(undefined, "/admin/suppliers", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_supplier_products",
    description: "A supplier's active SKUs (by supplier slug) with facets: search (name/SKU/parent SKU), brand, colour, productType, page, limit (max 100). Staff login.",
    inputSchema: { type: "object", required: ["slug"], properties: { slug: { type: "string" }, search: { type: "string" }, brand: { type: "string" }, colour: { type: "string" }, productType: { type: "string" }, page: { type: "number" }, limit: { type: "number" } } },
    async handler({ slug, ...f }) {
      const q = query(f);
      const res = await api()(`/admin/suppliers/${enc(slug)}/products${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_supplier_print_products",
    description: "A supplier's print product templates (by supplier slug) and the tenants that own private ones. tenantId narrows to one tenant's, or __global__ to the shared ones. Staff login.",
    inputSchema: { type: "object", required: ["slug"], properties: { slug: { type: "string" }, tenantId: { type: "string" } } },
    async handler({ slug, tenantId }) {
      const q = query({ tenantId });
      const res = await api()(`/admin/suppliers/${enc(slug)}/print-products${q}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_supplier_sync",
    description: "Run a supplier's feed sync now (pulls its SKUs, stock and wholesale prices; can take minutes). Rate limited to once per 5 minutes. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug"], properties: { slug: { type: "string" } } },
    async handler({ slug }) {
      const res = await api()(`/admin/suppliers/${enc(slug)}?action=sync`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_supplier_scrape",
    description: "Fire an IQEX services scrape of a SCRAPE-feed supplier's website into a snapshot (result arrives by callback). Runs a job and SPENDS IQEX credits; 429 while one is in flight. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug"], properties: { slug: { type: "string" } } },
    async handler({ slug }) {
      const res = await api()(`/admin/suppliers/${enc(slug)}/scrape`, { method: "POST" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_supplier_type_list",
    description: "Supplier types (the product shape a supplier's feed takes: FLAT_SKU, PRINT_MATRIX, SERVICE, DIGITAL, NONE) with supplier counts. Staff login.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await api()("/admin/supplier-types");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_supplier_type_get",
    description: "One supplier type with its suppliers. Staff login.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/supplier-types/${enc(id)}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_supplier_type_create",
    description: "Create a supplier type: slug, name, productShape (default FLAT_SKU), description, requiresDesign, hasStockLevel (default true), isInternal, isDropship, sortOrder. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["slug", "name"], properties: { slug: { type: "string" }, name: { type: "string" }, productShape: { type: "string", enum: PRODUCT_SHAPES }, description: { type: "string" }, requiresDesign: { type: "boolean" }, hasStockLevel: { type: "boolean" }, isInternal: { type: "boolean" }, isDropship: { type: "boolean" }, sortOrder: { type: "number" } } },
    async handler(body) {
      const res = await post(undefined, "/admin/supplier-types", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_supplier_type_update",
    description: "Edit a supplier type: name, description, productShape, requiresDesign, hasStockLevel, isInternal, isDropship, sortOrder. SUPER_ADMIN only.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, productShape: { type: "string", enum: PRODUCT_SHAPES }, requiresDesign: { type: "boolean" }, hasStockLevel: { type: "boolean" }, isInternal: { type: "boolean" }, isDropship: { type: "boolean" }, sortOrder: { type: "number" } } },
    async handler({ id, ...body }) {
      const res = await send(undefined, `/admin/supplier-types/${enc(id)}`, "PATCH", body);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_supplier_type_delete",
    description: "Delete a supplier type; refused (409) while any supplier uses it. SUPER_ADMIN only. Deletes.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await api()(`/admin/supplier-types/${enc(id)}`, { method: "DELETE" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
];
