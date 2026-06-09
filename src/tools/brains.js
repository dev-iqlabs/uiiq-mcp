import { apiClient } from "../auth.js";

export const brainsTools = [
  {
    name: "uiiq_brains_list",
    description: "List the Office Brains available to this tenant.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/brains");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_brains_ask",
    description: "Ask an Office Brain a question. Returns the answer + citations.",
    inputSchema: {
      type: "object",
      required: ["brainCategoryId", "prompt"],
      properties: {
        brainCategoryId: { type: "string", description: "Brain to query (from uiiq_brains_list)" },
        prompt: { type: "string" },
      },
    },
    async handler({ brainCategoryId, prompt }) {
      const res = await apiClient()("/brains/query", {
        method: "POST",
        body: JSON.stringify({ brainCategoryId, prompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
