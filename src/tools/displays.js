import { apiClient } from "../auth.js";

// IQDISPLAY — digital signage. Displays are physical screens; channels are
// ordered playlists of items (an IQEX project, a URL, an image, or a menu);
// a display plays one channel. All routes require a tenant session whose
// tenant is linked to an IQEX org (the platform resolves the org from the
// session — callers never pass org_id).
export const displayTools = [
  {
    name: "uiiq_display_list",
    description: "List the tenant's displays (screens), each with its assigned channel and status.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/displays");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_create",
    description: "Register a display (screen). orientation is LANDSCAPE or PORTRAIT; channel is an optional channel id to assign.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        orientation: { type: "string", enum: ["LANDSCAPE", "PORTRAIT"] },
        location: { type: "string", description: "Where the screen physically is" },
        channel: { type: "number", description: "Channel id to assign to this display" },
      },
    },
    async handler({ name, orientation, location, channel } = {}) {
      const res = await apiClient()("/displays", {
        method: "POST",
        body: JSON.stringify({ name, orientation, location, channel }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_update",
    description: "Edit a display. Any of name, orientation, location, channel (id), active.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "number" },
        name: { type: "string" },
        orientation: { type: "string", enum: ["LANDSCAPE", "PORTRAIT"] },
        location: { type: "string" },
        channel: { type: "number" },
        active: { type: "boolean" },
      },
    },
    async handler({ id, ...patch } = {}) {
      const res = await apiClient()(`/displays/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_delete",
    description: "Delete a display by id.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" } } },
    async handler({ id }) {
      const res = await apiClient()(`/displays/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_channel_list",
    description: "List channels (playlists), each with its ordered items.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/displays/channels");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_channel_create",
    description: "Create a channel (playlist). default_duration is seconds per item; loop repeats the playlist.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        default_duration: { type: "number", description: "Default seconds per item" },
        loop: { type: "boolean" },
      },
    },
    async handler({ name, default_duration, loop } = {}) {
      const res = await apiClient()("/displays/channels", {
        method: "POST",
        body: JSON.stringify({ name, default_duration, loop }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_channel_update",
    description: "Edit a channel. Any of name, default_duration, loop.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "number" },
        name: { type: "string" },
        default_duration: { type: "number" },
        loop: { type: "boolean" },
      },
    },
    async handler({ id, ...patch } = {}) {
      const res = await apiClient()(`/displays/channels/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_channel_delete",
    description: "Delete a channel by id.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" } } },
    async handler({ id }) {
      const res = await apiClient()(`/displays/channels/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_channel_item_add",
    description: "Add an item to a channel. content_type is PROJECT|URL|IMAGE|MENU. For PROJECT pass project_id; for URL/IMAGE pass content_url. duration overrides the channel default for this item.",
    inputSchema: {
      type: "object",
      required: ["channelId", "content_type"],
      properties: {
        channelId: { type: "number" },
        content_type: { type: "string", enum: ["PROJECT", "URL", "IMAGE", "MENU"] },
        project_id: { type: "number", description: "IQEX project id (when content_type=PROJECT)" },
        content_url: { type: "string", description: "URL or image src (when content_type=URL/IMAGE)" },
        duration: { type: "number", description: "Seconds; overrides channel default" },
      },
    },
    async handler({ channelId, content_type, project_id, content_url, duration } = {}) {
      const res = await apiClient()(`/displays/channels/${channelId}/items`, {
        method: "POST",
        body: JSON.stringify({ content_type, project_id, content_url, duration }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_channel_item_update",
    description: "Edit a channel item — reorder (order), change duration, or swap content_url.",
    inputSchema: {
      type: "object",
      required: ["channelId", "itemId"],
      properties: {
        channelId: { type: "number" },
        itemId: { type: "number" },
        order: { type: "number", description: "Position in the playlist" },
        duration: { type: "number" },
        content_url: { type: "string" },
      },
    },
    async handler({ channelId, itemId, ...patch } = {}) {
      const res = await apiClient()(`/displays/channels/${channelId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_channel_item_delete",
    description: "Remove an item from a channel.",
    inputSchema: {
      type: "object",
      required: ["channelId", "itemId"],
      properties: { channelId: { type: "number" }, itemId: { type: "number" } },
    },
    async handler({ channelId, itemId }) {
      const res = await apiClient()(`/displays/channels/${channelId}/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_projects",
    description: "List the tenant's IQEX projects available to add to a channel (the PROJECT picker).",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/displays/projects");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_videos",
    description:
      "List the tenant's Bunny Stream signage videos (the picker behind the channel editor), each with its `ready` flag and `embedUrl`. Add a ready video to a channel with uiiq_display_channel_item_add (content_type=URL, content_url=embedUrl). Defaults to the Displays collection; pass all=true to show the whole library (films included). Uploading new video bytes is a browser-only flow, so it isn't exposed here.",
    inputSchema: {
      type: "object",
      properties: {
        all: { type: "boolean", description: "Show the whole library, not just the Displays collection" },
        search: { type: "string", description: "Match video titles containing this text" },
      },
    },
    async handler({ all, search } = {}) {
      const params = new URLSearchParams();
      if (all) params.set("collection", "all");
      if (search) params.set("search", search);
      const qs = params.toString() ? `?${params}` : "";
      const res = await apiClient()(`/displays/videos${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
