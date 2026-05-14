import { apiClient } from "../auth.js";

export const posmTools = [
  {
    name: "uiiq_posm_booking_list",
    description: "List UIIQ experience bookings. Filter by status.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", description: "confirmed | pending | cancelled | completed" } }
    },
    async handler({ status } = {}) {
      const qs = status ? "?status=" + encodeURIComponent(status) : "";
      const res = await apiClient()("/v1/bookings" + qs);
      const data = await res.json();
      return Array.isArray(data) ? data : data.bookings ?? [];
    }
  },
  {
    name: "uiiq_posm_experience_list",
    description: "List UIIQ experiences available for booking.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/admin/experiences");
      const data = await res.json();
      return Array.isArray(data) ? data : data.experiences ?? [];
    }
  },
  {
    name: "uiiq_posm_subscription_list",
    description: "List UIIQ membership subscribers. Filter by status.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", description: "active | cancelled | expired" } }
    },
    async handler({ status } = {}) {
      const qs = status ? "?status=" + encodeURIComponent(status) : "";
      const res = await apiClient()("/admin/memberships/subscribers" + qs);
      const data = await res.json();
      return Array.isArray(data) ? data : data.subscribers ?? [];
    }
  },
  {
    name: "uiiq_posm_promo_create",
    description: "Create a UIIQ promo discount code.",
    inputSchema: {
      type: "object",
      required: ["code", "discount", "type"],
      properties: {
        code: { type: "string" },
        discount: { type: "number" },
        type: { type: "string", description: "percent | fixed" },
        expires: { type: "string", description: "Expiry date YYYY-MM-DD" }
      }
    },
    async handler({ code, discount, type, expires }) {
      const body = { code, discount, type };
      if (expires) body.expiresAt = expires;
      const res = await apiClient()("/admin/promo-codes", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_posm_gift_card_issue",
    description: "Issue a UIIQ gift card to an email address.",
    inputSchema: {
      type: "object",
      required: ["value", "email"],
      properties: {
        value: { type: "number", description: "Gift card value in GBP" },
        email: { type: "string" }
      }
    },
    async handler({ value, email }) {
      const res = await apiClient()("/admin/gift-cards", {
        method: "POST",
        body: JSON.stringify({ value, email }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_posm_gift_card_balance",
    description: "Check the remaining balance on a UIIQ gift card by code.",
    inputSchema: {
      type: "object",
      required: ["code"],
      properties: { code: { type: "string", description: "Gift card code" } }
    },
    async handler({ code }) {
      const res = await apiClient()(`/admin/gift-cards/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error(`Gift card not found: ${code}`);
      return res.json();
    }
  },
  {
    name: "uiiq_posm_booking_get",
    description: "Get a UIIQ booking by ID.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/v1/bookings/${id}`);
      if (!res.ok) throw new Error(`Booking not found: ${id}`);
      return res.json();
    }
  },
  {
    name: "uiiq_posm_booking_create",
    description: "Create a new UIIQ booking for an experience or session.",
    inputSchema: {
      type: "object",
      required: ["experienceId", "customerEmail", "date"],
      properties: {
        experienceId: { type: "string", description: "Experience ID to book" },
        customerEmail: { type: "string" },
        customerName: { type: "string" },
        date: { type: "string", description: "ISO date string for the booking slot" },
        notes: { type: "string" },
        quantity: { type: "number", description: "Number of places (default 1)" }
      }
    },
    async handler({ experienceId, customerEmail, customerName, date, notes, quantity = 1 }) {
      const res = await apiClient()("/v1/bookings", {
        method: "POST",
        body: JSON.stringify({ experienceId, customerEmail, customerName, date, notes, quantity }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_posm_booking_cancel",
    description: "Cancel a UIIQ booking by ID. Optionally provide a reason.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        reason: { type: "string" }
      }
    },
    async handler({ id, reason }) {
      const res = await apiClient()(`/v1/bookings/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      return { success: true, id };
    }
  },
];
