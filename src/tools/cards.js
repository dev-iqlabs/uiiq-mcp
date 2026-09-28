import { apiClient } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

async function fail(res) {
  const text = await res.text();
  try { const j = JSON.parse(text); if (j?.error) return new Error(j.error); } catch { /* not JSON */ }
  return new Error(text || `HTTP ${res.status}`);
}
const post = (tenant, path, body) => api(tenant)(path, { method: "POST", body: JSON.stringify(body ?? {}) });

// The proof routes answer 302 to a presigned IQEX link (~15 min). The client
// never follows redirects (the session cookie must not ride to S3), so the
// Location header IS the result.
async function proofUrl(tenant, path) {
  const res = await api(tenant)(path);
  const location = res.headers.get("location");
  if (location) return { url: location, expiresInMinutes: 15 };
  throw await fail(res);
}

// CUSTOMER CARDS — the venue's scannable member cards (QR + NFC) and the
// children's printed check-in cards, both under /admin/cards. Tenant data,
// not the operator control plane: OWNER/ADMIN/SUPER_ADMIN in the tenant
// (encoded: STAFF too). Never returns a raw card token. Sending cards to
// print needs the `customer_card_print` feature AND the platform print
// switch, and SPENDS the venue's IQEX credits per card (max 5 per call).
//
// HARD RULE: a printed card carries the QR/NFC and the venue's branding only.
// No holder or child name is printed on it — the name lives in UIIQ beside
// the card, never on it. There is deliberately no option here to change that.
export const cardsTools = [
  {
    name: "uiiq_cards_list",
    description: "The venue's customer cards (up to 500): holder name/email, status, print status, member code and plan, issued/last-used/revoked/encoded/printed times. withQr=true instead returns ACTIVE cards only (max 120) each with a data-URI QR for the printable sheet. OWNER/ADMIN only.",
    inputSchema: { type: "object", properties: { withQr: { type: "boolean" }, tenant: TENANT_PROP } },
    async handler({ withQr, tenant } = {}) {
      const qs = withQr ? "?qr=1" : "";
      const res = await api(tenant)(`/admin/cards${qs}`);
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_cards_members_uncarded",
    description: "ACTIVE members who have no live card yet (membership id, name, email, plan), flagging any whose email can't take a card. Pick from these for uiiq_cards_issue.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/admin/cards?members=1");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_cards_issue",
    description: "Issue cards to members (creates the card record; nothing is printed or charged). With membershipIds (max 200) just those; with none, the next batch of up to 200 ACTIVE members without a card, and `remaining` says how many still need one. Idempotent: a holder with a live card keeps it. Returns membership→card id pairs.",
    inputSchema: { type: "object", properties: { membershipIds: { type: "array", items: { type: "string" } }, tenant: TENANT_PROP } },
    async handler({ membershipIds, tenant } = {}) {
      const res = await post(tenant, "/admin/cards", membershipIds ? { membershipIds } : {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_cards_update",
    description: "Act on one card: reissue (card LOST — the old card, QR and NFC tag stop working at once and a new card starts at NOT_SENT for printing), revoke (cancel with no replacement), or handed-over (an encoded card has been given to its holder). reason is kept on reissue/revoke.",
    inputSchema: { type: "object", required: ["id", "action"], properties: { id: { type: "string" }, action: { type: "string", enum: ["reissue", "revoke", "handed-over"] }, reason: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, action, reason, tenant }) {
      const res = await post(tenant, `/admin/cards/${encodeURIComponent(id)}`, { action, reason });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_cards_proof_url",
    description: "A fresh presigned link (about 15 minutes) to the rendered proof of a card that has been sent to print. 404 until it has been sent; needs the platform print switch and the venue linked to IQEX.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      return proofUrl(tenant, `/admin/cards/${encodeURIComponent(id)}/proof`);
    },
  },
  {
    name: "uiiq_cards_templates",
    description: "The card designs the venue can have printed (IQEX Design Studio: the stock CR80 card plus any design allowed for its organisation) — slug, name, size, preview. 412 when printing isn't switched on for the venue (`customer_card_print` feature + platform switch) or it isn't linked to IQEX.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/admin/cards/templates");
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_cards_mark_encoded",
    description: "Mark a PRINTED card's NFC tag as written and verified, from the URL/token the tag holds (what a staff phone reads when it taps the card). 409 unless the card is waiting to be encoded. OWNER/ADMIN/STAFF.",
    inputSchema: { type: "object", required: ["token"], properties: { token: { type: "string", description: "The card URL or its token" }, tenant: TENANT_PROP } },
    async handler({ token, tenant }) {
      const res = await post(tenant, "/admin/cards/encoded", { token });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_cards_print",
    description: "SEND up to 5 unprinted customer cards to IQEX to be printed on a design (slug from uiiq_cards_templates) with the card URL in the QR and NFC. SPENDS the venue's IQEX credits per card and counts against its daily print cap. The card shows QR/NFC and branding only — no holder name is printed. Safe to repeat: a card is never charged or printed twice. Needs `customer_card_print` + the platform switch.",
    inputSchema: { type: "object", required: ["template", "cardIds"], properties: { template: { type: "string" }, cardIds: { type: "array", items: { type: "string" }, maxItems: 5 }, tenant: TENANT_PROP } },
    async handler({ template, cardIds, tenant }) {
      const res = await post(tenant, "/admin/cards/print", { template, cardIds });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_cards_print_refresh",
    description: "Ask IQEX where the venue's unprinted customer cards are and move them along: queued → SENT, finished → PRINTED, failed → back to NOT_SENT. Spends nothing; needs only the platform switch.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await post(tenant, "/admin/cards/print/refresh", {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },

  // ── Children's printed check-in cards ──
  {
    name: "uiiq_cards_students_print",
    description: "SEND up to 5 children's check-in cards to IQEX to be printed on a design, each with the child's check-in URL in the QR and NFC. SPENDS the school's IQEX credits per card; shares the daily cap with customer cards. Nothing about the child goes to IQEX and no name is printed on the card. Needs `customer_card_print` + the platform switch; OWNER/ADMIN only.",
    inputSchema: { type: "object", required: ["template", "studentIds"], properties: { template: { type: "string" }, studentIds: { type: "array", items: { type: "string" }, maxItems: 5 }, tenant: TENANT_PROP } },
    async handler({ template, studentIds, tenant }) {
      const res = await post(tenant, "/admin/cards/students/print", { template, studentIds });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_cards_students_refresh",
    description: "Move children's printed cards along from IQEX's job status (SENT / PRINTED / back to NOT_SENT on failure). Spends nothing; needs only the platform switch.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await post(tenant, "/admin/cards/students/refresh", {});
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_cards_student_handed_over",
    description: "Record that a child's PRINTED check-in card is on their lanyard. 409 unless it has been printed. A lost card is replaced with uiiq_students_card_issue regenerate=true.",
    inputSchema: { type: "object", required: ["studentId"], properties: { studentId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ studentId, tenant }) {
      const res = await post(tenant, `/admin/cards/students/${encodeURIComponent(studentId)}`, { action: "handed-over" });
      if (!res.ok) throw await fail(res);
      return res.json();
    },
  },
  {
    name: "uiiq_cards_student_proof_url",
    description: "A fresh presigned link (about 15 minutes) to the proof of a child's printed check-in card. 404 until it has been sent to print; needs the platform switch and the school linked to IQEX.",
    inputSchema: { type: "object", required: ["studentId"], properties: { studentId: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ studentId, tenant }) {
      return proofUrl(tenant, `/admin/cards/students/${encodeURIComponent(studentId)}/proof`);
    },
  },
];
