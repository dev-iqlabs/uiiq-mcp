import { apiClient } from "../auth.js";

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
      },
    },
    async handler({ kind } = {}) {
      const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
      const res = await apiClient()(`/menu/documents${qs}`);
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
      properties: { id: { type: "number", description: "Menu document id" } },
    },
    async handler({ id }) {
      const res = await apiClient()(`/menu/documents/${id}`);
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
      },
    },
    async handler({ id, name, doc } = {}) {
      const body = {};
      if (name != null) body.name = name;
      if (doc != null) body.doc = doc;
      const res = await apiClient()(`/menu/documents/${id}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_menu_document_delete",
    description: "Delete a saved menu document by id.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" } } },
    async handler({ id }) {
      const res = await apiClient()(`/menu/documents/${id}`, { method: "DELETE" });
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
      },
    },
    async handler({ name, productIds, sections, menuId } = {}) {
      const body = { name };
      if (productIds?.length) body.productIds = productIds;
      if (sections?.length) body.sections = sections;
      if (menuId) body.menuId = menuId;
      const res = await apiClient()("/menu/build-live", { method: "POST", body: JSON.stringify(body) });
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
      },
    },
    async handler({ q, ids, all } = {}) {
      const params = new URLSearchParams();
      if (ids?.length) params.set("ids", ids.join(","));
      else if (q) params.set("q", q);
      if (all) params.set("all", "1");
      const qs = params.toString() ? `?${params}` : "";
      const res = await apiClient()(`/menu/products${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
