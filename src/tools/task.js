import { apiClient } from "../auth.js";

export const taskTools = [
  {
    name: "uiiq_task_list",
    description: "List UVOS tasks. Filter by board, mine (assigned to me), or status.",
    inputSchema: {
      type: "object",
      properties: {
        mine: { type: "boolean" },
        board: { type: "string" },
        status: { type: "string" }
      }
    },
    async handler({ mine, board, status } = {}) {
      const api = apiClient();
      if (mine) {
        const res = await api("/tasks/my-work");
        const data = await res.json();
        return Array.isArray(data) ? data : data.tasks ?? [];
      }
      const params = new URLSearchParams();
      if (board)  params.set("board", board);
      if (status) params.set("status", status);
      const res = await api("/tasks/cards?" + params);
      const data = await res.json();
      return Array.isArray(data) ? data : data.cards ?? [];
    }
  },
  {
    name: "uiiq_task_get",
    description: "Get a UVOS task card by ID.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    async handler({ id }) {
      const res = await apiClient()("/tasks/cards/" + id);
      if (!res.ok) throw new Error("Task not found: " + id);
      return res.json();
    }
  },
  {
    name: "uiiq_task_comment",
    description: "Add a comment to a UVOS task card.",
    inputSchema: {
      type: "object",
      required: ["id", "body"],
      properties: { id: { type: "string" }, body: { type: "string" } }
    },
    async handler({ id, body }) {
      const res = await apiClient()("/tasks/cards/" + id + "/comments", {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_board_list",
    description: "List all UVOS task boards.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/tasks/boards");
      const data = await res.json();
      return Array.isArray(data) ? data : data.boards ?? [];
    }
  },
  {
    name: "uiiq_task_create",
    description: "Create a new UVOS task card on a board.",
    inputSchema: {
      type: "object",
      required: ["boardId", "title"],
      properties: {
        boardId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        assigneeId: { type: "string", description: "User ID to assign the task to" },
        dueDate: { type: "string", description: "ISO date string" },
        priority: { type: "string", description: "low | medium | high" }
      }
    },
    async handler({ boardId, title, description, assigneeId, dueDate, priority }) {
      const body = { boardId, title };
      if (description) body.description = description;
      if (assigneeId)  body.assigneeId  = assigneeId;
      if (dueDate)     body.dueDate     = dueDate;
      if (priority)    body.priority    = priority;
      const res = await apiClient()("/tasks/cards", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
  {
    name: "uiiq_task_update",
    description: "Update a UVOS task card — move status, reassign, or change due date.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        status: { type: "string", description: "todo | in-progress | review | done | blocked" },
        assigneeId: { type: "string" },
        dueDate: { type: "string", description: "ISO date string" },
        priority: { type: "string", description: "low | medium | high" }
      }
    },
    async handler({ id, status, assigneeId, dueDate, priority }) {
      const body = {};
      if (status)     body.status     = status;
      if (assigneeId) body.assigneeId = assigneeId;
      if (dueDate)    body.dueDate    = dueDate;
      if (priority)   body.priority   = priority;
      const res = await apiClient()(`/tasks/cards/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  },
];
