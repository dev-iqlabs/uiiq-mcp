import fs from "fs";
import path from "path";
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

const MEDIA_TYPES = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
function readMenuFile(filePath, base64, mediaType) {
  if (filePath) {
    const type = MEDIA_TYPES[path.extname(filePath).toLowerCase()];
    if (!type) throw new Error("Use a PDF, PNG, JPEG, WEBP or GIF file");
    return { base64: fs.readFileSync(path.resolve(filePath)).toString("base64"), mediaType: type };
  }
  if (!base64 || !mediaType) throw new Error("Pass a file path, or the base64 body with its mediaType");
  return { base64, mediaType };
}


// IQMENU — saved menu documents (the .uiiqmenu designer format, stored per
// org in IQEX) plus the live-menu bridge that turns a designed menu's
// catalogue links into a Menu/Section/Placement set powering the menu boards
// and the till. Doc format v2: { layouts:[{ id, format:'print'|'display',
// label, artwork, payload, style, options }], linkedMenuId? }. A saved doc is
// publicly viewable at /menu-board/<tenantSlug>/doc/<docId> with optional
// ?layout=<layoutId|print|display>&bg=<hex>&bgUrl=<url>&qr=<url>.
export const menuTools = [
  {
    name: "uiiq_menu_documents_list",
    description: "List the tenant's saved menu documents (id, name, kind, timestamps — no doc body). Optionally filter by kind.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["overlay", "compose"], description: "overlay = price-artwork menus, compose = built-from-scratch menus" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ kind, tenant } = {}) {
      const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
      const res = await api(tenant)(`/menu/documents${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_document_get",
    description: "Load one saved menu document including its doc body (format v2: layouts[] + linkedMenuId). The public board URL is /menu-board/<tenantSlug>/doc/<docId> (?layout=<layoutId|print|display>&bg=&bgUrl=&qr=).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "number", description: "Menu document id" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/menu/documents/${id}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_document_update",
    description: "Update a saved menu document — rename and/or replace the doc body (e.g. set doc.linkedMenuId after uiiq_menu_build_live). Fetch the current doc first and send it back modified; the doc is replaced wholesale.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "number" },
        name: { type: "string" },
        doc: { type: "object", description: "Full replacement doc (format v2)" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, name, doc, tenant } = {}) {
      const body = {};
      if (name != null) body.name = name;
      if (doc != null) body.doc = doc;
      const res = await api(tenant)(`/menu/documents/${id}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_document_delete",
    description: "Delete a saved menu document by id.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" },
        tenant: TENANT_PROP,
      } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/menu/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_build_live",
    description: "Create or refresh a LIVE menu from a designed menu's catalogue-linked products so one item set powers print, the menu boards and the till. Pass productIds (flat, price-artwork) OR sections (compose — one live section per name). Pass menuId to refresh an existing live menu (additive — never removes placements). Returns { menuId, menuSlug, added, alreadyPresent, skippedMissing } — store menuId back on the doc as linkedMenuId.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Live menu name (used when creating)" },
        productIds: { type: "array", items: { type: "string" }, description: "Flat catalogue product ids → the menu's first section" },
        sections: {
          type: "array",
          description: "Compose shape: one bucket per section, matched by name within the menu (created when missing)",
          items: {
            type: "object",
            required: ["name", "productIds"],
            properties: {
              name: { type: "string" },
              productIds: { type: "array", items: { type: "string" } },
            },
          },
        },
        menuId: { type: "string", description: "Existing live menu id to refresh (from a previous build — doc.linkedMenuId)" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ name, productIds, sections, menuId, tenant } = {}) {
      const body = { name };
      if (productIds?.length) body.productIds = productIds;
      if (sections?.length) body.sections = sections;
      if (menuId) body.menuId = menuId;
      const res = await api(tenant)("/menu/build-live", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_products",
    description: "The tenant's catalogue products for placing onto a menu (id, name, pricePence, description, imageUrl, showInMenu, tillCategory; max 200). Defaults to showInMenu products; pass all=true to include the full retail catalogue, q to search by name, or ids for an exact lookup (the catalogue-price refresh).",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Name search" },
        ids: { type: "array", items: { type: "string" }, description: "Exact product ids to fetch (bypasses q)" },
        all: { type: "boolean", description: "Include products not yet flagged showInMenu" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ q, ids, all, tenant } = {}) {
      const params = new URLSearchParams();
      if (ids?.length) params.set("ids", ids.join(","));
      else if (q) params.set("q", q);
      if (all) params.set("all", "1");
      const qs = params.toString() ? `?${params}` : "";
      const res = await api(tenant)(`/menu/products${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_kit_generate",
    description: "Generate the F&B print kit for the tenant's live menu — IQEX batch-renders the print family (allergen card + shelf label per item + one table QR) from the products flagged Show-in-menu and charges the org pool per piece. Returns { pieces:[{type,label,url}], count, itemCount } — the downloadable/printable image URLs. Optionally pass table_qr to personalise the table QR piece.",
    inputSchema: {
      type: "object",
      properties: {
        table_qr: {
          type: "object",
          description: "Optional table-QR personalisation",
          properties: {
            venue:  { type: "string", description: "Venue name shown on the QR piece" },
            prompt: { type: "string", description: "Call-to-action text" },
            table:  { type: "string", description: "Table number/label" },
            qr_url: { type: "string", description: "URL the QR encodes (e.g. the public menu board)" },
          },
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ table_qr, tenant } = {}) {
      const body = {};
      if (table_qr) body.table_qr = table_qr;
      const res = await api(tenant)("/menu/kit", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Live menu structure: menus → sections → placements (products) ──
  // Every mutation below needs a write-enabled session (read-only
  // impersonation answers 403). Backgrounds come from the tenant's IQEX org.
  {
    name: "uiiq_menu_backgrounds",
    description: "The tenant's IQEX image assets usable as a menu background (id, name, url). Needs the workspace linked to IQEX (412 otherwise).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/menu/backgrounds");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_background_get",
    description: "One menu background as a base64 data URL (for embedding in a designed menu). Needs the workspace linked to IQEX.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "IQEX asset id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/menu/backgrounds/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_categories",
    description: "The tenant's till categories — the distinct tillCategory values on active products, each with a product count and till button colour. A null name is the uncategorised bucket.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/menu/categories");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_category_update",
    description: "Rename a till category across every product carrying it (from → to) and/or set the till button colour for that group (tillColour, empty string clears). Returns { ok, updated }.",
    inputSchema: {
      type: "object",
      required: ["from"],
      properties: {
        from: { type: "string", description: "Current category name" },
        to: { type: "string", description: "New category name" },
        tillColour: { type: "string", description: "Hex colour for the till button; empty string clears" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ from, to, tillColour, tenant }) {
      const body = { from };
      if (to !== undefined) body.to = to;
      if (tillColour !== undefined) body.tillColour = tillColour;
      const res = await api(tenant)("/menu/categories", { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_compose_extract",
    description: "Read an existing menu (PDF or PNG/JPEG/WEBP/GIF image) with AI and return its structure: sections[] with items (name, price in pounds, description). Pass filePath (media type from the extension) or fileBase64 + mediaType. Spends an Anthropic vision call.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Local menu file to read" },
        fileBase64: { type: "string", description: "Base64 file body (instead of filePath)" },
        mediaType: { type: "string", enum: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"], description: "Required with fileBase64" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ filePath, fileBase64, mediaType, tenant }) {
      const file = readMenuFile(filePath, fileBase64, mediaType);
      const res = await api(tenant)("/menu/compose/extract", { method: "POST", body: JSON.stringify({ fileBase64: file.base64, mediaType: file.mediaType }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_price_overlay_extract",
    description: "Read a photo/scan of a printed menu (PNG/JPEG/WEBP/GIF) with AI and return every priced item with its printed price and a suggested price position (x, y as 0–1 fractions) for the price-overlay designer. Pass imagePath or imageBase64 + mediaType. Spends an Anthropic vision call.",
    inputSchema: {
      type: "object",
      properties: {
        imagePath: { type: "string", description: "Local image to read" },
        imageBase64: { type: "string", description: "Base64 image body (instead of imagePath)" },
        mediaType: { type: "string", enum: ["image/png", "image/jpeg", "image/webp", "image/gif"], description: "Required with imageBase64" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ imagePath, imageBase64, mediaType, tenant }) {
      const file = readMenuFile(imagePath, imageBase64, mediaType);
      const res = await api(tenant)("/menu/price-overlay/extract", { method: "POST", body: JSON.stringify({ imageBase64: file.base64, mediaType: file.mediaType }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Menu areas (/menus) ──
  {
    name: "uiiq_menu_menus_list",
    description: "The tenant's menu areas (Diner, Playbarn …) with section counts. Active only by default; all=true includes inactive menus.",
    inputSchema: { type: "object", properties: { all: { type: "boolean", description: "Include inactive menus" }, tenant: TENANT_PROP } },
    async handler({ all, tenant } = {}) {
      const qs = all ? "?all=1" : "";
      const res = await api(tenant)(`/menus${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_menu_create",
    description: "Create a menu area. The slug is derived from the name and made unique per tenant.",
    inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ name, description, tenant }) {
      const res = await api(tenant)("/menus", { method: "POST", body: JSON.stringify({ name, description }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_menu_update",
    description: "Rename, reorder, describe or activate/deactivate a menu area. Only the fields you send change.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, displayOrder: { type: "number" }, active: { type: "boolean" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      const res = await api(tenant)(`/menus/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_menu_delete",
    description: "DELETE a menu area. Refused (409) while it still has active sections unless force=true, which cascades every section and placement in it; till devices pointing at it fall back to all menus.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, force: { type: "boolean", description: "Delete even with sections (cascades)" }, tenant: TENANT_PROP } },
    async handler({ id, force, tenant }) {
      const qs = force ? "?force=1" : "";
      const res = await api(tenant)(`/menus/${encodeURIComponent(id)}${qs}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_menu_placements",
    description: "Every placement across a menu area's sections (placement id, sectionId, productId, displayOrder, available, descriptionOverride, product summary).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Menu id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/menus/${encodeURIComponent(id)}/placements`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_placement_add",
    description: "Place an existing catalogue product into one of a menu area's sections (flags the product showInMenu). 409 if it is already in that section.",
    inputSchema: {
      type: "object",
      required: ["id", "productId", "sectionId"],
      properties: {
        id: { type: "string", description: "Menu id" }, productId: { type: "string" }, sectionId: { type: "string" },
        displayOrder: { type: "number" }, descriptionOverride: { type: "string" }, available: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...body }) {
      const res = await api(tenant)(`/menus/${encodeURIComponent(id)}/placements`, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Sections ──
  {
    name: "uiiq_menu_sections_list",
    description: "The tenant's active menu sections with item counts, optionally for one menu area (menuId).",
    inputSchema: { type: "object", properties: { menuId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ menuId, tenant } = {}) {
      const qs = menuId ? `?menuId=${encodeURIComponent(menuId)}` : "";
      const res = await api(tenant)(`/menu/sections${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_section_create",
    description: "Create a section in a menu area (defaults to the tenant's Main Menu when menuId is omitted). availableFrom/To are HH:MM, availableDays are 0–6 (Sunday = 0).",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" }, menuId: { type: "string" }, description: { type: "string" },
        availableFrom: { type: "string" }, availableTo: { type: "string" },
        availableDays: { type: "array", items: { type: "number" } }, imageUrl: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/menu/sections", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_section_update",
    description: "Update a section — name, description, availability window/days, image, displayOrder. Only the fields you send change.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }, name: { type: "string" }, description: { type: "string" },
        availableFrom: { type: "string" }, availableTo: { type: "string" },
        availableDays: { type: "array", items: { type: "number" } }, imageUrl: { type: "string" }, displayOrder: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      const res = await api(tenant)(`/menu/sections/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_section_delete",
    description: "Soft-delete a section. Refused (409) while it still holds active items — move or remove them first.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/menu/sections/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Items (product + placement) ──
  {
    name: "uiiq_menu_items_list",
    description: "Menu items (a product placed in a section: id = product id, plus placementId, sectionId, price, dietary, allergens, course, station, available), optionally for one section.",
    inputSchema: { type: "object", properties: { sectionId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ sectionId, tenant } = {}) {
      const qs = sectionId ? `?sectionId=${encodeURIComponent(sectionId)}` : "";
      const res = await api(tenant)(`/menu/items${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_item_create",
    description: "Create a menu product and place it in a section. vatRate STANDARD|REDUCED|ZERO, course STARTER|MAIN|DESSERT|SIDE|DRINK|ANY, kitchenStation GRILL|COLD|PREP|BAR|PASTRY|ANY, dietary VEGETARIAN|VEGAN|GLUTEN_FREE|DAIRY_FREE|HALAL|KOSHER, allergens the UK 14. modifierGroups: [{ name, required?, minSelect?, maxSelect?, options:[{ name, pricePence }] }].",
    inputSchema: {
      type: "object",
      required: ["name", "sectionId"],
      properties: {
        name: { type: "string" }, sectionId: { type: "string" }, pricePence: { type: "number" }, description: { type: "string" },
        imageUrl: { type: "string" }, sku: { type: "string" }, vatRate: { type: "string", enum: ["STANDARD", "REDUCED", "ZERO"] },
        dietary: { type: "array", items: { type: "string" } }, allergens: { type: "array", items: { type: "string" } },
        calories: { type: "number" }, course: { type: "string" }, kitchenStation: { type: "string" },
        modifierGroups: { type: "array", items: { type: "object" } }, available: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/menu/items", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_item_update",
    description: "Update a menu item by product id — shared product fields (name, price, dietary, modifiers — modifierGroups replaces them all) and its placement (available, sectionId to move it). Only the fields you send change.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Product id (the item's id)" }, name: { type: "string" }, description: { type: "string" },
        pricePence: { type: "number" }, imageUrl: { type: "string" }, sku: { type: "string" }, vatRate: { type: "string", enum: ["STANDARD", "REDUCED", "ZERO"] },
        dietary: { type: "array", items: { type: "string" } }, allergens: { type: "array", items: { type: "string" } },
        calories: { type: "number" }, course: { type: "string" }, kitchenStation: { type: "string" }, active: { type: "boolean" },
        modifierGroups: { type: "array", items: { type: "object" } }, available: { type: "boolean" }, sectionId: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      const res = await api(tenant)(`/menu/items/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_item_delete",
    description: "Soft-delete a menu product (active=false) — it leaves every menu, board and the till.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Product id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/menu/items/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── Placements ──
  {
    name: "uiiq_menu_placement_update",
    description: "Update one placement: reorder (displayOrder), 86 it (available=false) or override the description shown on this menu.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Placement id" }, displayOrder: { type: "number" }, available: { type: "boolean" }, descriptionOverride: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      const res = await api(tenant)(`/menu/placements/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_placement_delete",
    description: "Remove a product from a menu section (deletes the placement; the product itself stays).",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", description: "Placement id" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/menu/placements/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
