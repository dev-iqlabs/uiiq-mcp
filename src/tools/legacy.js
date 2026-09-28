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


export const legacyTools = [
  {
    name: "uiiq_legacy_films_list",
    description: "List films in the UIIQ legacy film archive.",
    inputSchema: { type: "object", properties: { search: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ search, tenant } = {}) {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await api(tenant)(`/legacy/films${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_legacy_film_get",
    description: "Get a legacy film by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/legacy/films/${id}`);
      if (!res.ok) throw new Error(`Film not found: ${id}`);
      return res.json();
    },
  },
  {
    name: "uiiq_legacy_film_renew",
    description: "Re-sign a legacy film's Bunny delivery URL (a fresh signed link and expiry, saved on the film). Needs the film to have a Bunny video id and the tenant's Bunny settings to be configured (422 otherwise). Returns { success, id, deliveryUrl, deliveryUrlExpiresAt }.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/legacy/films/${encodeURIComponent(id)}/renew`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_legacy_bunny_settings_get",
    description: "The tenant's Bunny Stream settings for legacy film delivery: libraryId, pullZoneHost, playerCss, filmDeliveryBaseUrl, and whether the API key and token-auth key are set (the keys themselves are never returned). null when not configured.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/legacy/settings/bunny");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_legacy_bunny_settings_set",
    description: "Save (upsert) the tenant's Bunny Stream settings for legacy film delivery. libraryId, apiKey, tokenAuthKey and pullZoneHost are all required every time — this replaces the whole record. Optional playerCss and filmDeliveryBaseUrl.",
    inputSchema: {
      type: "object",
      required: ["libraryId", "apiKey", "tokenAuthKey", "pullZoneHost"],
      properties: { libraryId: { type: "string" }, apiKey: { type: "string" }, tokenAuthKey: { type: "string" }, pullZoneHost: { type: "string", description: "e.g. vz-xxxx.b-cdn.net" }, playerCss: { type: "string" }, filmDeliveryBaseUrl: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ tenant, ...body }) {
      const res = await api(tenant)("/legacy/settings/bunny", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
