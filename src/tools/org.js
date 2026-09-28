import { apiClient } from "../auth.js";

const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

export const orgTools = [
  {
    name: "uiiq_org_list",
    description: "List organisations.",
    inputSchema: { type: "object", properties: { search: { type: "string" } } },
    async handler({ search } = {}) {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await apiClient()(`/organisations${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_org_get",
    description: "Get an organisation by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/organisations/${id}`);
      if (!res.ok) throw new Error(`Organisation not found: ${id}`);
      return res.json();
    },
  },
  {
    name: "uiiq_org_features",
    description: "Get feature flags / entitlements for an organisation.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/organisations/${id}/features`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  // ── The tenant's own onboarding state and profile (/onboarding, /profile) ──
  {
    name: "uiiq_org_onboarding_status",
    description: "Whether the workspace has completed onboarding ({ completed }). The onboarding IQForm's completion webhook sets it; nothing here changes it.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/onboarding/status");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_org_profile_get",
    description: "The workspace's own tenant profile — name, description, industry, contact details, address, logo, brand colours, socials, email identity, onboarding state. Secrets (API keys) are never included.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const res = await api(tenant)("/profile");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_org_profile_update",
    description: "Update the workspace profile (the Settings → Profile screen): only the fields you send change; an empty string clears one. OWNER/ADMIN (checked against the database role). For VAT/company numbers, app colours, the privacy notice or the CRM follow-up board use uiiq_tenant_settings_update instead.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" }, description: { type: "string" }, industry: { type: "string" }, website: { type: "string" }, phone: { type: "string" },
        addressLine1: { type: "string" }, addressLine2: { type: "string" }, city: { type: "string" }, postcode: { type: "string" },
        logoUrl: { type: "string" }, brandColor: { type: "string" }, brandColorAlt: { type: "string" },
        socialFacebook: { type: "string" }, socialInstagram: { type: "string" }, socialTwitter: { type: "string" },
        socialLinkedin: { type: "string" }, socialTiktok: { type: "string" }, socialYoutube: { type: "string" },
        emailFrom: { type: "string" }, emailFromName: { type: "string" }, emailReplyTo: { type: "string" },
        emailOpenTracking: { type: "boolean", description: "Track opens on emails the workspace sends" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ tenant, ...fields }) {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (Object.keys(body).length === 0) throw new Error("Send at least one field to change");
      const res = await api(tenant)("/profile", { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
