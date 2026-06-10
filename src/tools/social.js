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
];
