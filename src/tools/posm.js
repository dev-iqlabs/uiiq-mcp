import { apiClient } from "../auth.js";

export const posmTools = [
  {
    name: "uiiq_posm_booking_list",
    description: "List POSM experience bookings. Filter by status.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", description: "confirmed | pending | cancelled | completed" } }
    },
    async handler({ status } = {}) {
      const qs = status ? "?status=" + encodeURIComponent(status) : "";
      const res = await apiClient("posm")("/v1/bookings" + qs);
      const data = await res.json();
      return Array.isArray(data) ? data : data.bookings ?? [];
    }
  },
  {
    name: "uiiq_posm_experience_list",
    description: "List POSM experiences available for booking.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient("posm")("/admin/experiences");
      const data = await res.json();
      return Array.isArray(data) ? data : data.experiences ?? [];
    }
  },
  {
    name: "uiiq_posm_subscription_list",
    description: "List POSM membership subscribers. Filter by status.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", description: "active | cancelled | expired" } }
    },
    async handler({ status } = {}) {
      const qs = status ? "?status=" + encodeURIComponent(status) : "";
      const res = await apiClient("posm")("/admin/memberships/subscribers" + qs);
      const data = await res.json();
      return Array.isArray(data) ? data : data.subscribers ?? [];
    }
  },
  {
    name: "uiiq_posm_promo_create",
    description: "Create a POSM promo discount code.",
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
      const res = await apiClient("posm")("/admin/promo-codes", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_posm_gift_card_issue",
    description: "Issue a POSM gift card to an email address.",
    inputSchema: {
      type: "object",
      required: ["value", "email"],
      properties: {
        value: { type: "number", description: "Gift card value in GBP" },
        email: { type: "string" }
      }
    },
    async handler({ value, email }) {
      const res = await apiClient("posm")("/admin/gift-cards", {
        method: "POST",
        body: JSON.stringify({ value, email }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
];
