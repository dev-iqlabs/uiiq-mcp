import { BASE } from "../config.js";
import { apiClient } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

// IQlink pairing — an owner/admin mints a pairing code in UIIQ (/api/connect/
// code); IQEX (or any system that wants the tenant's Connect key) redeems it.
// The claim is public by design, like /api/connect/claim: the code IS the
// credential — single-use, 15-minute expiry — so it needs no session and takes
// no `tenant`; the code names the tenant.
const IQLINK_CLAIM = "/connect/iqlink/claim";

export const connectTools = [
  {
    name: "uiiq_connect_code",
    description:
      "Mint a short-lived pairing code for connecting this tenant's website or IQEX: { code, expiresAt, expiresInSeconds }. Single-use, 15 minutes. Redeem it with uiiq_iqlink_claim (IQEX gets the Connect key) or the WordPress plugin's connect screen. OWNER or ADMIN only — claiming hands out the tenant's API key and secrets.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/connect/code", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_iqlink_claim",
    description:
      "Exchange an IQlink pairing code for the tenant's Connect key: { apiKey, tenantSlug, tenantName, apiBase }. The code is single-use and expires in 15 minutes; a tenant that never had a Connect key gets one now, an existing key is reused (never rotated here — a WordPress site may already be using it). 'ABCD-1234' style grouping is fine. No login needed.",
    inputSchema: {
      type: "object",
      required: ["code"],
      properties: { code: { type: "string", description: "The pairing code shown in UIIQ" } },
    },
    async handler({ code }) {
      const res = await fetch(`${BASE}/api${IQLINK_CLAIM}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
