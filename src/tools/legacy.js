import { apiClient } from "../auth.js";

export const legacyTools = [
  {
    name: "uiiq_legacy_films_list",
    description: "List films in the UIIQ legacy film archive.",
    inputSchema: { type: "object", properties: { search: { type: "string" } } },
    async handler({ search } = {}) {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await apiClient()(`/legacy/films${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_legacy_film_get",
    description: "Get a legacy film by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()(`/legacy/films/${id}`);
      if (!res.ok) throw new Error(`Film not found: ${id}`);
      return res.json();
    },
  },
];
