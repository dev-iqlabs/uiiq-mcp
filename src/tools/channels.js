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


export const channelsTools = [
  {
    name: "uiiq_channels_connections",
    description: "List marketplace channel connections.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/channels/connections");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_channels_connect",
    description: "Connect a marketplace channel (EBAY, AMAZON, GOOGLE_MERCHANT, TIKTOK, ETSY, FACEBOOK).",
    inputSchema: {
      type: "object",
      required: ["channel"],
      properties: {
        channel: { type: "string" },
        accountId: { type: "string" },
        accountName: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ channel, accountId, accountName, tenant }) {
      const res = await api(tenant)("/channels/connections", {
        method: "POST",
        body: JSON.stringify({ channel, accountId, accountName }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_channels_disconnect",
    description: "Remove a channel connection by id.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" },
        tenant: TENANT_PROP,
      } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/channels/connections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return { ok: true };
    },
  },
  {
    name: "uiiq_channels_sync_status",
    description: "Product sync status across channels.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/channels/sync");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_channels_sync",
    description: "Trigger a product sync for a channel connection.",
    inputSchema: {
      type: "object",
      required: ["channel", "connectionId"],
      properties: { channel: { type: "string" }, connectionId: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ channel, connectionId, tenant }) {
      const res = await api(tenant)("/channels/sync", {
        method: "POST",
        body: JSON.stringify({ channel, connectionId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_channels_commission",
    description: "Channel commission summary.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/channels/commission");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
