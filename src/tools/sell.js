import { apiClient } from "../auth.js";

export const sellTools = [
  {
    name: "uiiq_sell_booking_list",
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
    name: "uiiq_sell_experience_list",
    description: "List UIIQ experiences available for booking.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/admin/experiences");
      const data = await res.json();
      return Array.isArray(data) ? data : data.experiences ?? [];
    }
  },
  {
    name: "uiiq_sell_subscription_list",
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
    name: "uiiq_sell_promo_create",
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
  // ---- Gift cards / vouchers -------------------------------------------------
  // The old tools here POSTed to /admin/gift-cards, which does not exist in UIIQ
  // — every call 404'd. The real surface is /gift-cards (+ the public /v1 API).
  {
    name: "uiiq_sell_gift_card_issue",
    description: "Issue a UIIQ gift card / voucher. Emails the recipient (or the purchaser if no recipient).",
    inputSchema: {
      type: "object",
      required: ["purchaserEmail", "originalPence"],
      properties: {
        purchaserEmail: { type: "string", description: "Who bought it (required)" },
        originalPence: { type: "number", description: "Face value in PENCE (e.g. 5000 = £50)" },
        purchaserName: { type: "string" },
        recipientEmail: { type: "string", description: "Who receives it; defaults to the purchaser" },
        recipientName: { type: "string" },
        message: { type: "string", description: "Gift message printed on the voucher" },
        expiryMonths: { type: "number", description: "Months until expiry" }
      }
    },
    async handler(args) {
      const res = await apiClient()("/gift-cards", {
        method: "POST",
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_gift_card_bulk_issue",
    description: "Bulk-issue vouchers (max 500). Either `count` identical vouchers, or an `items` array of per-recipient vouchers.",
    inputSchema: {
      type: "object",
      required: ["originalPence"],
      properties: {
        originalPence: { type: "number", description: "Face value in PENCE, applied to every voucher" },
        count: { type: "number", description: "How many identical vouchers to issue (ignored if `items` given)" },
        items: {
          type: "array",
          description: "Per-recipient vouchers: [{ recipientEmail, recipientName?, message? }]",
          items: { type: "object" }
        },
        type: { type: "string", description: "CASH (default) or MESSAGE_CARD" },
        purchaserEmail: { type: "string" },
        purchaserName: { type: "string" },
        expiresAt: { type: "string", description: "ISO date" }
      }
    },
    async handler(args) {
      const res = await apiClient()("/gift-cards/bulk", {
        method: "POST",
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_gift_card_balance",
    description: "Check a voucher's validity/balance by code. Vendor-scoped, so a leaked code can't be probed across tenants. Always 200 with { valid, reason }.",
    inputSchema: {
      type: "object",
      required: ["vendor", "code"],
      properties: {
        vendor: { type: "string", description: "Vendor/tenant slug the voucher belongs to" },
        code: { type: "string", description: "Voucher code" }
      }
    },
    async handler({ vendor, code }) {
      const res = await apiClient()("/v1/gift-cards/check", {
        method: "POST",
        body: JSON.stringify({ vendor, code }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_voucher_download",
    description: "Get the download URL for a voucher's printable artifact (PNG for vouchers rendered by UIIQ, legacy PDF for pre-migration cards).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Gift card id" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/gift-cards/${encodeURIComponent(id)}/pdf`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_voucher_resend",
    description: "Re-send a voucher's email to its recipient.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Gift card id" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/gift-cards/${encodeURIComponent(id)}/resend`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_voucher_regenerate",
    description: "Re-render a voucher's printable artifact (e.g. after changing the voucher branding template).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Gift card id" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/gift-cards/${encodeURIComponent(id)}/regenerate-pdf`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_voucher_template_get",
    description: "Get the tenant's voucher branding template (vendor name, logo, accent colour, footer, background artwork).",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/gift-cards/voucher-template");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_voucher_template_update",
    description: "Update the tenant's voucher branding. Existing vouchers keep their rendered artifact until regenerated (uiiq_sell_voucher_regenerate).",
    inputSchema: {
      type: "object",
      properties: {
        vendorName: { type: "string" },
        accentColor: { type: "string", description: "#rrggbb hex" },
        logoUrl: { type: "string", description: "http(s) URL" },
        backgroundArtworkUrl: { type: "string", description: "http(s) URL" },
        footerText: { type: "string" }
      }
    },
    async handler(args) {
      const res = await apiClient()("/gift-cards/voucher-template", {
        method: "PATCH",
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_booking_get",
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
    name: "uiiq_sell_booking_create",
    description: "Create a new UIIQ booking. Ticket/appointment bookings post to the public v1 endpoint (session-based). For a VISIT-mode experience (job at the customer's address — pest control, plumber, mobile groomer) pass visitAddress + visitDate instead of date: the booking is staff-entered via the dashboard endpoint, confirmed instantly, and shows in the calendar's visit lane.",
    inputSchema: {
      type: "object",
      required: ["experienceId", "customerEmail"],
      properties: {
        experienceId: { type: "string", description: "Experience ID to book" },
        customerEmail: { type: "string" },
        customerName: { type: "string" },
        customerPhone: { type: "string", description: "Visit bookings only" },
        date: { type: "string", description: "ISO date string for the booking slot (ticket/appointment bookings)" },
        notes: { type: "string" },
        quantity: { type: "number", description: "Number of places (default 1; ticket/appointment only)" },
        visitAddress: {
          type: "object",
          description: "VISIT bookings — the customer's address (with visitDate, routes to the staff booking endpoint)",
          required: ["line1", "postcode"],
          properties: {
            line1: { type: "string" },
            line2: { type: "string" },
            city: { type: "string" },
            postcode: { type: "string" }
          }
        },
        visitDate: { type: "string", description: "VISIT bookings — YYYY-MM-DD" },
        visitWindowStart: { type: "string", description: "Preferred window start HH:MM" },
        visitWindowEnd: { type: "string", description: "Preferred window end HH:MM" },
        resourceId: { type: "string", description: "Assigned resource/technician (visit bookings)" },
        source: { type: "string", enum: ["PHONE", "EMAIL", "WALK_IN"], description: "How the visit booking came in (default PHONE)" },
        totalPence: { type: "number", description: "Agreed price in pence (visit bookings; default 0)" }
      }
    },
    async handler({ experienceId, customerEmail, customerName, customerPhone, date, notes, quantity = 1, visitAddress, visitDate, visitWindowStart, visitWindowEnd, resourceId, source, totalPence }) {
      if (visitAddress || visitDate) {
        const res = await apiClient()("/admin/bookings", {
          method: "POST",
          body: JSON.stringify({
            experienceId, customerName, customerEmail, customerPhone,
            visitAddress, visitDate, visitWindowStart, visitWindowEnd,
            resourceId, source, totalPence, notes,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      }
      const res = await apiClient()("/v1/bookings", {
        method: "POST",
        body: JSON.stringify({ experienceId, customerEmail, customerName, date, notes, quantity }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_booking_cancel",
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
    name: "uiiq_sell_calendar_week",
    description: "Get the UIIQ Sell week calendar — sessions grouped by day, visit-mode bookings (visits, keyed by date: reference, customer, postcode, window, resource), active staff (performers), and per-staff availability blocks. Week is anchored to the Monday of whatever date is supplied (defaults to current week).",
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
    name: "uiiq_sell_staff_availability_list",
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
    name: "uiiq_sell_staff_availability_block",
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
    name: "uiiq_sell_staff_availability_unblock",
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
    name: "uiiq_sell_resource_list",
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
    name: "uiiq_sell_resource_create",
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
    name: "uiiq_sell_resource_delete",
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
    name: "uiiq_sell_pricing_rule_list",
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
    name: "uiiq_sell_pricing_rule_create",
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
    name: "uiiq_sell_pricing_rule_delete",
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
    name: "uiiq_sell_pricing_rule_quote",
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
    name: "uiiq_sell_pricing_intelligence_recommend",
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
  },

  // ── Service areas / territories (visit-mode auto-assign) ────────────────────
  {
    name: "uiiq_sell_service_area_list",
    description: "List the tenant's UIIQ Sell service-area territories (postcode-prefix zones with a default technician for visit-mode auto-assign) plus the technician picker. Returns { serviceAreas, technicians }.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/admin/service-areas");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_service_area_create",
    description: "Create a UIIQ Sell service-area territory. postcodePrefixes are outward-code prefixes (e.g. ['BS1','BS2']); defaultResourceId is the technician auto-assigned to visits in the zone.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name:              { type: "string", description: "Territory name, e.g. 'Bristol Central'" },
        postcodePrefixes:  { type: "array", items: { type: "string" }, description: "Outward-code prefixes covered, e.g. ['BS1','BS2']" },
        defaultResourceId: { type: "string", description: "Technician (resource) auto-assigned to visits in this zone" },
        color:             { type: "string", description: "Optional calendar colour (hex)" }
      }
    },
    async handler({ name, postcodePrefixes, defaultResourceId, color }) {
      const body = { name };
      if (postcodePrefixes) body.postcodePrefixes = postcodePrefixes;
      if (defaultResourceId) body.defaultResourceId = defaultResourceId;
      if (color) body.color = color;
      const res = await apiClient()("/admin/service-areas", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_service_area_update",
    description: "Update a UIIQ Sell service-area territory. Only supplied fields change; pass isActive:false to retire a zone (visit FKs are SET NULL).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id:                { type: "string" },
        name:              { type: "string" },
        postcodePrefixes:  { type: "array", items: { type: "string" } },
        defaultResourceId: { type: "string", description: "Technician (resource) to auto-assign; pass null to clear" },
        color:             { type: "string" },
        isActive:          { type: "boolean" }
      }
    },
    async handler({ id, ...rest }) {
      const body = {};
      for (const k of ["name", "postcodePrefixes", "defaultResourceId", "color", "isActive"]) {
        if (rest[k] !== undefined) body[k] = rest[k];
      }
      const res = await apiClient()(`/admin/service-areas/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_service_area_delete",
    description: "Delete a UIIQ Sell service-area territory by ID. Bookings/subscriptions in the zone have their serviceAreaId cleared (ON DELETE SET NULL).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/admin/service-areas/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },

  // ── Field app — technician day-of visits ────────────────────────────────────
  {
    name: "uiiq_sell_field_visit_list",
    description: "The technician field app's day view: every visit-mode booking for the tenant on a day, optionally filtered to one technician. Returns { date, visits, technicians }.",
    inputSchema: {
      type: "object",
      properties: {
        date:       { type: "string", description: "Day YYYY-MM-DD (defaults to today)" },
        resourceId: { type: "string", description: "Filter to one technician (assigned resource)" }
      }
    },
    async handler({ date, resourceId } = {}) {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (resourceId) params.set("resourceId", resourceId);
      const qs = params.toString() ? `?${params}` : "";
      const res = await apiClient()(`/field/visits${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_field_visit_update",
    description: "Technician field-app update to one visit-mode booking. action='stage' moves visitStage (SCHEDULED|EN_ROUTE|ON_SITE|COMPLETED|SKIPPED); action='complete' signs it off (notes, photos[], signatureKey, signedName); action='reschedule' moves it (visitDate + optional window, resets reminders).",
    inputSchema: {
      type: "object",
      required: ["id", "action"],
      properties: {
        id:               { type: "string", description: "Booking (visit) ID" },
        action:           { type: "string", enum: ["stage", "complete", "reschedule"] },
        stage:            { type: "string", enum: ["SCHEDULED", "EN_ROUTE", "ON_SITE", "COMPLETED", "SKIPPED"], description: "action=stage" },
        notes:            { type: "string", description: "action=complete — completion notes" },
        photos:           { type: "array", items: { type: "string" }, description: "action=complete — S3 keys (max 20)" },
        signatureKey:     { type: "string", description: "action=complete — customer signature S3 key" },
        signedName:       { type: "string", description: "action=complete — name of the person who signed" },
        visitDate:        { type: "string", description: "action=reschedule — new date YYYY-MM-DD" },
        visitWindowStart: { type: "string", description: "action=reschedule — window start HH:MM" },
        visitWindowEnd:   { type: "string", description: "action=reschedule — window end HH:MM" }
      }
    },
    async handler({ id, action, ...rest }) {
      const body = { action };
      for (const k of ["stage", "notes", "photos", "signatureKey", "signedName", "visitDate", "visitWindowStart", "visitWindowEnd"]) {
        if (rest[k] !== undefined) body[k] = rest[k];
      }
      const res = await apiClient()(`/field/visits/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_resource_notify_set",
    description: "Set a UIIQ Sell resource's technician flag and notify contact (used by visit reminders + day-of digests). Pass isTechnician to flag a resource as a field technician, notifyEmail/notifyPhone as the address the technician digest is sent to (pass empty string to clear).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id:           { type: "string", description: "Resource ID" },
        isTechnician: { type: "boolean", description: "Flag this resource as a field technician" },
        notifyEmail:  { type: "string", description: "Technician notify email (empty string clears)" },
        notifyPhone:  { type: "string", description: "Technician notify phone (empty string clears)" }
      }
    },
    async handler({ id, isTechnician, notifyEmail, notifyPhone }) {
      const body = {};
      if (isTechnician !== undefined) body.isTechnician = isTechnician;
      if (notifyEmail !== undefined) body.notifyEmail = notifyEmail;
      if (notifyPhone !== undefined) body.notifyPhone = notifyPhone;
      const res = await apiClient()(`/admin/resources/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_field_visit_get",
    description: "Get one UIIQ Sell visit-mode booking by ID (tenant-scoped) — full field-app detail: customer, address, window, stage, completion notes/photos/signature, reschedule count. Returns { visit }.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", description: "Booking (visit) ID" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/field/visits/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },

  // ── Visit subscriptions (recurring visit agreements) ────────────────────────
  {
    name: "uiiq_sell_visit_subscription_list",
    description: "List the tenant's UIIQ Sell recurring visit agreements (with default technician + service-area names). Optionally filter by status. Returns { subscriptions }.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ACTIVE", "PAUSED", "CANCELLED"], description: "Filter by subscription status" }
      }
    },
    async handler({ status } = {}) {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const res = await apiClient()(`/admin/visit-subscriptions${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_visit_subscription_create",
    description: "Create a UIIQ Sell recurring visit agreement (auto-generates visit bookings every intervalDays). customerName, customerEmail and intervalDays are required; defaultResourceId/serviceAreaId/experienceId must belong to the tenant when given.",
    inputSchema: {
      type: "object",
      required: ["customerName", "customerEmail", "intervalDays"],
      properties: {
        customerName:      { type: "string" },
        customerEmail:     { type: "string" },
        customerPhone:     { type: "string" },
        intervalDays:      { type: "number", description: "Days between visits (positive integer)" },
        nextVisitDate:     { type: "string", description: "Next scheduled visit date YYYY-MM-DD" },
        windowStart:       { type: "string", description: "Preferred window start HH:MM" },
        windowEnd:         { type: "string", description: "Preferred window end HH:MM" },
        address:           { type: "object", description: "Customer address object" },
        lat:               { type: "number" },
        lng:               { type: "number" },
        defaultResourceId: { type: "string", description: "Default technician (resource) for generated visits" },
        serviceAreaId:     { type: "string", description: "Service-area territory" },
        experienceId:      { type: "string", description: "Experience the visits book against" },
        notes:             { type: "string" }
      }
    },
    async handler(args) {
      const body = {};
      for (const k of ["customerName", "customerEmail", "customerPhone", "intervalDays", "nextVisitDate", "windowStart", "windowEnd", "address", "lat", "lng", "defaultResourceId", "serviceAreaId", "experienceId", "notes"]) {
        if (args[k] !== undefined) body[k] = args[k];
      }
      const res = await apiClient()("/admin/visit-subscriptions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_visit_subscription_update",
    description: "Update a UIIQ Sell recurring visit agreement. Only supplied fields change. Pause/resume/cancel by setting status (ACTIVE|PAUSED|CANCELLED).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id:                { type: "string" },
        status:            { type: "string", enum: ["ACTIVE", "PAUSED", "CANCELLED"], description: "Set to PAUSED/ACTIVE/CANCELLED to pause/resume/cancel" },
        customerName:      { type: "string" },
        customerEmail:     { type: "string" },
        customerPhone:     { type: "string" },
        intervalDays:      { type: "number", description: "Days between visits (positive integer)" },
        nextVisitDate:     { type: "string", description: "Next scheduled visit date YYYY-MM-DD (null clears)" },
        windowStart:       { type: "string", description: "Preferred window start HH:MM" },
        windowEnd:         { type: "string", description: "Preferred window end HH:MM" },
        address:           { type: "object" },
        lat:               { type: "number" },
        lng:               { type: "number" },
        defaultResourceId: { type: "string", description: "Default technician (resource); null to clear" },
        serviceAreaId:     { type: "string", description: "Service-area territory; null to clear" },
        experienceId:      { type: "string", description: "Experience; null to clear" },
        notes:             { type: "string" }
      }
    },
    async handler({ id, ...rest }) {
      const body = {};
      for (const k of ["status", "customerName", "customerEmail", "customerPhone", "intervalDays", "nextVisitDate", "windowStart", "windowEnd", "address", "lat", "lng", "defaultResourceId", "serviceAreaId", "experienceId", "notes"]) {
        if (rest[k] !== undefined) body[k] = rest[k];
      }
      const res = await apiClient()(`/admin/visit-subscriptions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_sell_visit_subscription_delete",
    description: "Delete a UIIQ Sell recurring visit agreement by ID. Already-generated visit bookings keep their history (visitSubscriptionId is SET NULL).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } }
    },
    async handler({ id }) {
      const res = await apiClient()(`/admin/visit-subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },

  // ── Visit reminders (read-only ledger) ──────────────────────────────────────
  {
    name: "uiiq_sell_visit_reminder_status",
    description: "Read the tenant's UIIQ Sell VisitReminder ledger (the day-before cron dispatches these; this is the read-only view). Optionally filter by bookingId, status (PENDING|SENT|FAILED), and limit (1–500, default 200). Each row carries the booking reference + customer name. Returns { reminders }.",
    inputSchema: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "Filter to one visit booking" },
        status:    { type: "string", enum: ["PENDING", "SENT", "FAILED"] },
        limit:     { type: "number", description: "Max rows 1–500 (default 200)" }
      }
    },
    async handler({ bookingId, status, limit } = {}) {
      const params = new URLSearchParams();
      if (bookingId) params.set("bookingId", bookingId);
      if (status)    params.set("status", status);
      if (limit != null) params.set("limit", String(limit));
      const qs = params.toString() ? `?${params}` : "";
      const res = await apiClient()(`/admin/visit-reminders${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  }
];
