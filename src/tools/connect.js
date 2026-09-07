import { BASE } from "../config.js";

// IQlink pairing — IQEX (or any system that wants a tenant's Connect key)
// redeems a pairing code minted by an owner/admin in UIIQ (/api/connect/code).
// Public by design, like /api/connect/claim: the code IS the credential —
// single-use, 15-minute expiry — so this needs no session and takes no
// `tenant`; the code names the tenant.
export const connectTools = [
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
      const res = await fetch(`${BASE}/api/connect/iqlink/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
