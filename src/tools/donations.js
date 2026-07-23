import fs from "fs";
import { apiClient } from "../auth.js";

export const donationsTools = [
  {
    name: "uiiq_donations_causes_list",
    description:
      "List the tenant's donation causes (the charity's giving options). By default only active causes are returned; pass includeInactive to see all.",
    inputSchema: {
      type: "object",
      properties: { includeInactive: { type: "boolean" } },
    },
    async handler({ includeInactive } = {}) {
      const res = await apiClient()(`/donations/causes${includeInactive ? "?includeInactive=1" : ""}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_donations_cause_get",
    description:
      "Get a single donation cause by ID. There is no dedicated single-cause endpoint, so this reads the tenant's full cause list (including inactive) and returns the matching one.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()("/donations/causes?includeInactive=1");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const cause = (data.causes ?? []).find((c) => c.id === id);
      if (!cause) throw new Error(`Cause not found: ${id}`);
      return cause;
    },
  },
  {
    name: "uiiq_donations_cause_create",
    description:
      "Create a donation cause. `name` is required; optional `description` and `imageUrl`. The URL slug and display order are assigned automatically.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        imageUrl: { type: "string" },
      },
    },
    async handler({ name, description, imageUrl } = {}) {
      const body = { name };
      if (description !== undefined) body.description = description;
      if (imageUrl !== undefined) body.imageUrl = imageUrl;
      const res = await apiClient()("/donations/causes", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_donations_cause_update",
    description:
      "Update a donation cause by ID — rename, edit description/image, reorder (displayOrder) or (de)activate. Only the fields you pass are changed.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        imageUrl: { type: "string" },
        active: { type: "boolean" },
        displayOrder: { type: "number" },
      },
    },
    async handler({ id, ...patch } = {}) {
      const res = await apiClient()(`/donations/causes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_donations_cause_delete",
    description:
      "Delete a donation cause by ID. A cause that already has donations cannot be deleted (returns 409) — deactivate it instead to hide it from the widget while keeping its history.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id } = {}) {
      const res = await apiClient()(`/donations/causes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_donations_report",
    description:
      "The charity's donation dashboard (tenant-scoped, owners/admins only): all-time and this-month totals, per-cause breakdown, recurring-donor count, Gift-Aid totals (incl. the +25% HMRC top-up) and the 50 most recent SUCCEEDED donations.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/donations/report");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_donations_gift_aid_export",
    description:
      "Download the HMRC-ready Gift Aid CSV of eligible SUCCEEDED donations (donor name, address, postcode, amount, date). Owners/admins only. Returns the CSV text; pass `savePath` to also write it to disk.",
    inputSchema: {
      type: "object",
      properties: {
        savePath: { type: "string", description: "Optional local file path to write the CSV to." },
      },
    },
    async handler({ savePath } = {}) {
      const res = await apiClient()("/donations/gift-aid-export");
      if (!res.ok) throw new Error(await res.text());
      const csv = await res.text();
      const disp = res.headers.get("content-disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const filename = m ? m[1] : `gift-aid-${new Date().toISOString().slice(0, 10)}.csv`;
      if (savePath) {
        fs.writeFileSync(savePath, csv, "utf8");
        return { saved: savePath, filename, bytes: Buffer.byteLength(csv, "utf8") };
      }
      return { filename, csv };
    },
  },
  {
    name: "uiiq_donations_subscription_cancel",
    description:
      "Cancel a recurring (monthly) donation by its Stripe subscription ID. Tenant-scoped — the subscription must belong to one of this tenant's donations. Past donations keep their SUCCEEDED status. Idempotent (an already-cancelled sub still returns ok).",
    inputSchema: {
      type: "object",
      required: ["subscriptionId"],
      properties: { subscriptionId: { type: "string" } },
    },
    async handler({ subscriptionId } = {}) {
      const res = await apiClient()("/donations/subscription/cancel", {
        method: "POST",
        body: JSON.stringify({ subscriptionId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
