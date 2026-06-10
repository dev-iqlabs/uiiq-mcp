import { apiClient } from "../auth.js";

export const channelsTools = [
  {
    name: "uiiq_channels_connections",
    description: "List marketplace channel connections.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/channels/connections");
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
      },
    },
    async handler({ channel, accountId, accountName }) {
      const res = await apiClient()("/channels/connections", {
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
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/channels/connections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return { ok: true };
    },
  },
  {
    name: "uiiq_channels_sync_status",
    description: "Product sync status across channels.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/channels/sync");
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
      properties: { channel: { type: "string" }, connectionId: { type: "string" } },
    },
    async handler({ channel, connectionId }) {
      const res = await apiClient()("/channels/sync", {
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
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/channels/commission");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
