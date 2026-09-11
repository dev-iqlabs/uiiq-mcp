import { apiClient } from "../auth.js";
import { BASE } from "../config.js";

// Every tool takes an optional `tenant` (id, slug or exact name). Without it the
// call lands in whatever tenant the stored login belongs to; with it the client
// impersonates that tenant for that one call (SUPER_ADMIN only — see auth.js),
// riding the official impersonation audit trail.
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});


// IQDISPLAY — digital signage. Displays are physical screens; channels are
// ordered playlists of items (an IQEX project, a URL, an image, or a menu);
// a display plays one channel. All routes require a tenant session whose
// tenant is linked to an IQEX org (the platform resolves the org from the
// session — callers never pass org_id).
export const displayTools = [
  {
    name: "uiiq_display_list",
    description: "List the tenant's displays (screens), each with its assigned channel and status.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/displays");
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
        tenant: TENANT_PROP,
      },
    },
    async handler({ name, orientation, location, channel, tenant } = {}) {
      const res = await api(tenant)("/displays", {
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
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...patch } = {}) {
      const res = await api(tenant)(`/displays/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_delete",
    description: "Delete a display by id.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" },
        tenant: TENANT_PROP,
      } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/displays/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_channel_list",
    description: "List channels (playlists), each with its ordered items.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/displays/channels");
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
        tenant: TENANT_PROP,
      },
    },
    async handler({ name, default_duration, loop, tenant } = {}) {
      const res = await api(tenant)("/displays/channels", {
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
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, tenant, ...patch } = {}) {
      const res = await api(tenant)(`/displays/channels/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_channel_delete",
    description: "Delete a channel by id.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" },
        tenant: TENANT_PROP,
      } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/displays/channels/${id}`, { method: "DELETE" });
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
        tenant: TENANT_PROP,
      },
    },
    async handler({ channelId, content_type, project_id, content_url, duration, tenant } = {}) {
      const res = await api(tenant)(`/displays/channels/${channelId}/items`, {
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
        tenant: TENANT_PROP,
      },
    },
    async handler({ channelId, itemId, tenant, ...patch } = {}) {
      const res = await api(tenant)(`/displays/channels/${channelId}/items/${itemId}`, {
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
      properties: { channelId: { type: "number" }, itemId: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ channelId, itemId, tenant }) {
      const res = await api(tenant)(`/displays/channels/${channelId}/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  // ── Scheduler ───────────────────────────────────────────────────────────
  // Groups bundle screens (a venue/zone); schedules swap the channel a group
  // or a single display shows by the clock. A schedule has an optional
  // default_channel and an ordered set of rules; the server resolves the live
  // channel from the tenant's clock (Europe/London). Org is resolved from the
  // session — callers never pass org_id.
  {
    name: "uiiq_display_group_list",
    description: "List display groups (venue/zone bundles of screens), each with its display_count.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/displays/groups");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_group_create",
    description: "Create a display group (a named bundle of screens to schedule together).",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ name, tenant } = {}) {
      const res = await api(tenant)("/displays/groups", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_schedule_list",
    description: "List schedules, each with its default_channel and ordered rules. A schedule targets a group or a single display and swaps its channel by the clock.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/displays/schedules");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_schedule_create",
    description: "Create a schedule. Attach it to a group (group id) XOR a single display (display id). default_channel is the channel id shown when no rule matches.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        group: { type: "number", description: "Group id to schedule (mutually exclusive with display)" },
        display: { type: "number", description: "Display id to schedule (mutually exclusive with group)" },
        default_channel: { type: "number", description: "Channel id shown when no rule matches" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ name, group, display, default_channel, tenant } = {}) {
      const res = await api(tenant)("/displays/schedules", {
        method: "POST",
        body: JSON.stringify({
          name,
          group: group ?? null,
          display: display ?? null,
          default_channel: default_channel ?? null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_schedule_rule_add",
    description: "Add a rule to a schedule: show `channel` during a time window, optionally limited to days of the week and a date range. days_of_week is a comma list Mon=0…Sun=6 (\"\" = every day); start_time/end_time are \"HH:MM\"; date_start/date_end are \"YYYY-MM-DD\" or omitted; higher priority wins on overlap.",
    inputSchema: {
      type: "object",
      required: ["scheduleId", "channel", "start_time", "end_time"],
      properties: {
        scheduleId: { type: "number", description: "Schedule id to add the rule to" },
        channel: { type: "number", description: "Channel id to show while this rule is active" },
        days_of_week: { type: "string", description: "Comma list, Mon=0…Sun=6, e.g. \"0,1,2\"; empty = every day" },
        start_time: { type: "string", description: "Window start, \"HH:MM\"" },
        end_time: { type: "string", description: "Window end, \"HH:MM\"" },
        date_start: { type: "string", description: "Optional first active date, \"YYYY-MM-DD\"" },
        date_end: { type: "string", description: "Optional last active date, \"YYYY-MM-DD\"" },
        priority: { type: "number", description: "Higher wins when rules overlap (default 0)" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ scheduleId, channel, days_of_week, start_time, end_time, date_start, date_end, priority, tenant } = {}) {
      const res = await api(tenant)(`/displays/schedules/${scheduleId}/rules`, {
        method: "POST",
        body: JSON.stringify({
          channel,
          days_of_week: days_of_week ?? "",
          start_time,
          end_time,
          date_start: date_start ?? null,
          date_end: date_end ?? null,
          priority: priority ?? 0,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_display_projects",
    description: "List the tenant's IQEX projects available to add to a channel (the PROJECT picker).",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/displays/projects");
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
        tenant: TENANT_PROP,
      },
    },
    async handler({ all, search, tenant } = {}) {
      const params = new URLSearchParams();
      if (all) params.set("collection", "all");
      if (search) params.set("search", search);
      const qs = params.toString() ? `?${params}` : "";
      const res = await api(tenant)(`/displays/videos${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  // ---- Token boards (/board/<token>) ----------------------------------------
  // A board is a public, unguessable, revocable URL a screen plays as a URL
  // item: KPI (staff numbers), SHOWCASE (auto-cycling cards with scan-to-buy /
  // scan-to-book QRs — retail products, bookable experiences, or What's On =
  // upcoming events soonest first) and EVENT (one event's card, minted by the
  // Events hub fan-out, not here). Minting is admin-grade on the platform.
  {
    name: "uiiq_display_boards",
    description:
      "List the tenant's token boards (KPI / SHOWCASE / EVENT) with their public /board/<token> URL, config and active flag. Add one to a channel with uiiq_display_channel_item_add (content_type=URL, content_url=url), or mint-and-add in one go with uiiq_display_board_create.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/boards");
      if (!res.ok) throw new Error(await res.text());
      const boards = await res.json();
      return (Array.isArray(boards) ? boards : []).map((b) => ({ ...b, url: `${BASE}/board/${b.token}` }));
    },
  },
  {
    name: "uiiq_display_board_create",
    description:
      "Mint a token board and optionally add it straight to a channel. kind=KPI reuses the tenant's active KPI board. kind=SHOWCASE needs `source`: 'retail' (till products, optional `category`), 'experience' (bookable experiences, optional `experienceType` e.g. EVENT/TIMED_ENTRY), or 'whatson' (What's On — published event experiences with a session on/after today, soonest first, date on the card, scan-to-book QR, past events drop off; no filter). `intervalSec` = seconds per card (3–120, default 10); `showPrice` default true. Pass `channelId` to add the board's URL as a URL item on that channel in the same call (`duration` overrides that channel's default seconds). Returns the board plus its public `url`. Admin-grade: the session must be an admin of the tenant.",
    inputSchema: {
      type: "object",
      required: ["kind"],
      properties: {
        kind: { type: "string", enum: ["KPI", "SHOWCASE"] },
        source: { type: "string", enum: ["retail", "experience", "whatson"], description: "SHOWCASE only" },
        category: { type: "string", description: "SHOWCASE retail: till category name" },
        experienceType: { type: "string", description: "SHOWCASE experience: ExperienceType enum value" },
        ids: { type: "array", items: { type: "string" }, description: "SHOWCASE: hand-picked product/experience ids" },
        intervalSec: { type: "number", description: "Seconds per card, 3–120 (default 10)" },
        showPrice: { type: "boolean", description: "Show prices on cards (default true)" },
        name: { type: "string", description: "Board name; defaults per kind/source" },
        channelId: { type: "number", description: "Also add the board to this channel as a URL item" },
        duration: { type: "number", description: "Seconds for that channel item; omit for the channel default" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ kind, source, category, experienceType, ids, intervalSec, showPrice, name, channelId, duration, tenant } = {}) {
      if (kind === "SHOWCASE" && !source) throw new Error("source is required for a SHOWCASE board: retail, experience or whatson");
      const body = { kind };
      if (name) body.name = name;
      if (kind === "SHOWCASE") {
        body.config = { source };
        if (category) body.config.category = category;
        if (experienceType) body.config.experienceType = experienceType;
        if (Array.isArray(ids) && ids.length) body.config.ids = ids;
        if (intervalSec !== undefined) body.config.intervalSec = intervalSec;
        if (showPrice !== undefined) body.config.showPrice = showPrice;
      }
      const res = await api(tenant)("/boards", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      const board = await res.json();
      const url = `${BASE}/board/${board.token}`;
      let item = null;
      if (channelId) {
        const add = await api(tenant)(`/displays/channels/${channelId}/items`, {
          method: "POST",
          body: JSON.stringify({ content_type: "URL", content_url: url, ...(duration ? { duration } : {}) }),
        });
        if (!add.ok) throw new Error(`Board ${board.id} minted (${url}) but adding it to channel ${channelId} failed: ${await add.text()}`);
        item = await add.json();
      }
      return { ...board, url, channelItem: item };
    },
  },
  {
    name: "uiiq_display_board_revoke",
    description:
      "Revoke a token board (active=false) so its /board/<token> URL 404s on the screen's next poll and the item goes dark — or re-enable it (active=true). Remove the channel item separately with uiiq_display_channel_item_delete if you want it out of the loop rather than dark.",
    inputSchema: {
      type: "object",
      required: ["boardId"],
      properties: {
        boardId: { type: "string" },
        active: { type: "boolean", description: "false to revoke (default), true to re-enable" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ boardId, active = false, tenant } = {}) {
      const res = await api(tenant)(`/boards/${boardId}`, { method: "PATCH", body: JSON.stringify({ active }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
