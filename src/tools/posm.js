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
    description: "Cancel a UIIQ Sell booking by ID. Optionally provide a reason.",
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
  {
    name: "uiiq_posm_calendar_week",
    description: "Get the UIIQ Sell week calendar — sessions grouped by day, active staff (performers), and per-staff availability blocks. Week is anchored to the Monday of whatever date is supplied (defaults to current week).",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Any date YYYY-MM-DD inside the target week. Omit for current week." }
      }
    },
    async handler({ date } = {}) {
      const qs = date ? `?date=${encodeURIComponent(date)}` : "";
      const res = await apiClient()(`/admin/calendar/week${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_posm_staff_availability_list",
    description: "List availability blocks (full-day or time-range) for a UIIQ Sell staff member. Optionally filter by date range.",
    inputSchema: {
      type: "object",
      required: ["staffId"],
      properties: {
        staffId: { type: "string", description: "Staff member (Performer) ID" },
        from:    { type: "string", description: "Start date YYYY-MM-DD" },
        to:      { type: "string", description: "End date YYYY-MM-DD" }
      }
    },
    async handler({ staffId, from, to }) {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to)   params.set("to",   to);
      const qs = params.toString() ? `?${params}` : "";
      const res = await apiClient()(`/admin/staff/${encodeURIComponent(staffId)}/availability${qs}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return Array.isArray(data) ? data : data.data ?? [];
    }
  },
  {
    name: "uiiq_posm_staff_availability_block",
    description: "Block a UIIQ Sell staff member's availability on a date. Pass startTime+endTime (HH:MM) for a partial block, omit them for a full-day block.",
    inputSchema: {
      type: "object",
      required: ["staffId", "date"],
      properties: {
        staffId:   { type: "string", description: "Staff member (Performer) ID" },
        date:      { type: "string", description: "Date YYYY-MM-DD" },
        startTime: { type: "string", description: "Block start HH:MM (omit for full day)" },
        endTime:   { type: "string", description: "Block end HH:MM" },
        reason:    { type: "string", description: "Reason for the block" }
      }
    },
    async handler({ staffId, date, startTime, endTime, reason }) {
      const body = { date };
      if (startTime) body.startTime = startTime;
      if (endTime)   body.endTime   = endTime;
      if (reason)    body.reason    = reason;
      const res = await apiClient()(`/admin/staff/${encodeURIComponent(staffId)}/availability`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_posm_staff_availability_unblock",
    description: "Remove a UIIQ Sell staff availability block. Pass date to clear the whole day, or recordId to delete a single block record. Exactly one of date or recordId must be supplied.",
    inputSchema: {
      type: "object",
      required: ["staffId"],
      properties: {
        staffId:  { type: "string", description: "Staff member (Performer) ID" },
        date:     { type: "string", description: "Date YYYY-MM-DD to fully unblock" },
        recordId: { type: "string", description: "Specific availability record ID to delete" }
      }
    },
    async handler({ staffId, date, recordId }) {
      if (!date && !recordId) throw new Error("Provide date (full day) or recordId (specific block)");
      const params = new URLSearchParams();
      if (recordId) params.set("recordId", recordId);
      else          params.set("date",     date);
      const res = await apiClient()(`/admin/staff/${encodeURIComponent(staffId)}/availability?${params}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },

  // ── Resources (rooms, treatment chairs, equipment, vehicles) ────────────────
  {
    name: "uiiq_posm_resource_list",
    description: "List UIIQ Sell bookable resources (rooms, equipment, vehicles). Optionally filter by venue.",
    inputSchema: {
      type: "object",
      properties: { venueId: { type: "string" } }
    },
    async handler({ venueId } = {}) {
      const qs = venueId ? `?venueId=${encodeURIComponent(venueId)}` : "";
      const res = await apiClient()(`/admin/resources${qs}`);
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      return d.resources ?? [];
    }
  },
  {
    name: "uiiq_posm_resource_create",
    description: "Create a UIIQ Sell bookable resource (room, chair, equipment, vehicle). quantity defaults to 1.",
    inputSchema: {
      type: "object",
      required: ["name", "type"],
      properties: {
        name:     { type: "string", description: "e.g. 'Treatment Room 1'" },
        type:     { type: "string", description: "e.g. 'Room', 'Chair', 'Equipment', 'Vehicle'" },
        quantity: { type: "number", description: "How many of this resource exist (default 1)" },
        venueId:  { type: "string", description: "Optional venue to attach to" }
      }
    },
    async handler({ name, type, quantity, venueId }) {
      const res = await apiClient()("/admin/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, quantity: quantity ?? 1, venueId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_posm_resource_delete",
    description: "Delete a UIIQ Sell resource by ID. Fails with 409 if the resource has active session allocations.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/admin/resources/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },

  // ── Pricing rules ───────────────────────────────────────────────────────────
  {
    name: "uiiq_posm_pricing_rule_list",
    description: "List UIIQ Sell pricing rules (off-peak discounts, weekend surcharges, seasonal pricing).",
    inputSchema: {
      type: "object",
      properties: {
        experienceId: { type: "string", description: "Filter to one experience (use 'all' for global rules only)" }
      }
    },
    async handler({ experienceId } = {}) {
      const qs = experienceId ? `?experienceId=${encodeURIComponent(experienceId)}` : "";
      const res = await apiClient()(`/admin/pricing-rules${qs}`);
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      return d.rules ?? [];
    }
  },
  {
    name: "uiiq_posm_pricing_rule_create",
    description: "Create a UIIQ Sell pricing rule. type=DISCOUNT_PERCENT|DISCOUNT_FIXED|SURCHARGE_PERCENT|SURCHARGE_FIXED. value is percent (15) or pence (500=£5).",
    inputSchema: {
      type: "object",
      required: ["name", "type", "value"],
      properties: {
        name:         { type: "string" },
        type:         { type: "string", enum: ["DISCOUNT_PERCENT", "DISCOUNT_FIXED", "SURCHARGE_PERCENT", "SURCHARGE_FIXED"] },
        value:        { type: "number", description: "Percent (e.g. 15) or pence (e.g. 500 = £5)" },
        daysOfWeek:   { type: "array", items: { type: "number" }, description: "0=Sun..6=Sat. Empty = all days" },
        dateFrom:     { type: "string", description: "YYYY-MM-DD earliest applicable date" },
        dateTo:       { type: "string", description: "YYYY-MM-DD latest applicable date" },
        experienceId: { type: "string", description: "Scope to one experience (default: all)" },
        priority:     { type: "number", description: "Higher wins when rules overlap (default 0)" }
      }
    },
    async handler(body) {
      const res = await apiClient()("/admin/pricing-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_posm_pricing_rule_delete",
    description: "Delete a UIIQ Sell pricing rule by ID.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/admin/pricing-rules/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_posm_pricing_rule_quote",
    description: "Preview what a UIIQ Sell experience would cost on a given date after all matching pricing rules cascade. Returns basePricePence, finalPricePence, and the applied[] breakdown.",
    inputSchema: {
      type: "object",
      required: ["experienceId", "date"],
      properties: {
        experienceId:    { type: "string" },
        date:            { type: "string", description: "YYYY-MM-DD" },
        basePricePence:  { type: "number", description: "Optional override of experience.priceFromPence" }
      }
    },
    async handler({ experienceId, date, basePricePence }) {
      const params = new URLSearchParams({ experienceId, date });
      if (basePricePence != null) params.set("basePricePence", String(basePricePence));
      const res = await apiClient()(`/admin/pricing-rules/quote?${params}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },

  // ── Pricing Intelligence (IQEX-driven AI recommendations) ───────────────────
  {
    name: "uiiq_posm_pricing_intelligence_recommend",
    description: "Fetch AI-recommended price adjustments for upcoming UIIQ Sell sessions. UIIQ aggregates upcoming sessions + historical baselines and calls the IQEX dynamic_pricing_recommendation recipe. Returns recommendations with confidence + reasoning.",
    inputSchema: {
      type: "object",
      properties: {
        lookaheadDays: { type: "number", description: "Look ahead this many days (default 30)" },
        historyDays:   { type: "number", description: "Days of history for baseline (default 90)" }
      }
    },
    async handler({ lookaheadDays, historyDays } = {}) {
      const params = new URLSearchParams();
      if (lookaheadDays != null) params.set("lookaheadDays", String(lookaheadDays));
      if (historyDays != null)   params.set("historyDays",   String(historyDays));
      const path = `/admin/pricing-intelligence/recommend${params.toString() ? "?" + params : ""}`;
      const res = await apiClient()(path);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  }
];
