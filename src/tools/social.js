import { apiClient } from "../auth.js";

export const socialTools = [
  {
    name: "uiiq_social_posts",
    description: "List social media posts.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/socials/posts");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_social_accounts",
    description: "List connected social media accounts.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/socials/accounts");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_social_template_list",
    description: "List the tenant's IQEX Design Studio social templates (each with field_config so a personalise form can be built). Returns { templates }.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/socials/templates");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_social_template_render",
    description: "Render an IQEX Design Studio social template with the tenant's field values (IQEX charges the org pool), then create a DRAFT SocialPost carrying the rendered PNG so it can be scheduled/published through the channels. Returns { success, post_id, media_url }.",
    inputSchema: {
      type: "object",
      required: ["template"],
      properties: {
        template: { type: "string", description: "Template id/key to render" },
        data:     { type: "object", description: "Field values for the template (keyed by field_config)" },
        content:  { type: "string", description: "Caption/body for the draft post" },
        hashtags: { type: "array", items: { type: "string" }, description: "Hashtags for the draft post (max 30, leading # optional)" },
      },
    },
    async handler({ template, data, content, hashtags }) {
      const body = { template };
      if (data) body.data = data;
      if (content) body.content = content;
      if (hashtags) body.hashtags = hashtags;
      const res = await apiClient()("/socials/templates", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
