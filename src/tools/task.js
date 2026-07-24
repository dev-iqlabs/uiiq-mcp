import { apiClient, withTenant } from "../auth.js";

// Every tool takes an optional `tenant` (id, slug or exact name). Without it the
// call lands in whatever tenant the stored login belongs to; with it the client
// switches tenant for that one call (SUPER_ADMIN only — see auth.js). `tenants`
// on the create tools repeats the same create across many tenants, which is what
// makes "one LAUNCH board in every tenant" a single call instead of 41.
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const TENANTS_PROP = {
  type: "array",
  items: { type: "string" },
  description:
    "Repeat this create in each of these tenants (id, slug or exact name). Use uiiq_tenant_list to get them.",
};

const api = (tenant) => apiClient(tenant ? { tenant } : {});

async function json(res) {
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Run the same create across a list of tenants, one at a time so a failure in
// tenant 7 doesn't lose tenants 1–6. Never throws — the per-tenant error is the
// result, so the caller can see exactly which tenants still need doing.
async function acrossTenants(tenants, fn) {
  const results = [];
  for (const tenant of tenants) {
    try {
      results.push({ tenant, ok: true, result: await fn(tenant) });
    } catch (e) {
      results.push({ tenant, ok: false, error: e.message });
    }
  }
  return {
    total: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

async function listBoards(client) {
  const data = await json(await client("/tasks/boards"));
  return Array.isArray(data) ? data : data.boards ?? [];
}

// Boards are addressed by name far more naturally than by id — especially across
// tenants, where the same board has a different id everywhere.
async function resolveBoardId(client, ref) {
  const wanted = String(ref).trim().toLowerCase();
  const boards = await listBoards(client);
  const hit =
    boards.find((b) => String(b.id).toLowerCase() === wanted) ??
    boards.find((b) => String(b.name ?? "").toLowerCase() === wanted);
  if (!hit) {
    throw new Error(
      `No board "${ref}" here. Boards: ${boards.map((b) => b.name).join(", ") || "(none)"}`,
    );
  }
  return hit.id;
}

// Seeding a board is dozens of cards against the same handful of people —
// memoise the roster per client so it isn't re-fetched 65 times.
const memberCache = new WeakMap();
async function listMembers(client) {
  if (!memberCache.has(client)) memberCache.set(client, await json(await client("/tasks/members")));
  return memberCache.get(client);
}

async function resolveMemberId(client, person) {
  const wanted = String(person).trim().toLowerCase();
  const members = await listMembers(client);
  const hit =
    members.find((m) => String(m.id).toLowerCase() === wanted) ??
    members.find((m) => String(m.email ?? "").toLowerCase() === wanted) ??
    members.find((m) => String(m.name ?? "").toLowerCase() === wanted) ??
    members.find((m) => String(m.name ?? "").toLowerCase().includes(wanted));
  if (!hit) {
    throw new Error(
      `No one here matches "${person}". Members: ${members.map((m) => m.name).join(", ") || "(none)"}`,
    );
  }
  return hit.id;
}

function cardCreateBody({ title, description, assigneeId, dueDate, priority, status, columnId, labels }) {
  const body = { title };
  if (description) body.description = description;
  if (assigneeId) body.assigneeId = assigneeId;
  if (dueDate) body.dueDate = dueDate;
  if (priority) body.priority = priority;
  if (status) body.status = status;
  if (columnId) body.columnId = columnId;
  if (labels) body.labels = labels;
  return body;
}

export const taskTools = [
  // ---------------------------------------------------------------- projects
  {
    name: "uiiq_task_project_list",
    description: "List UIIQ task projects (the containers boards live in), with their boards.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      const data = await json(await api(tenant)("/tasks/projects"));
      return Array.isArray(data) ? data : data.projects ?? [];
    },
  },
  {
    name: "uiiq_task_project_create",
    description:
      "Create a UIIQ task project. Seeds the 8 standard boards (Admin, Sales, Marketing, Operations, Finance, Projects, Planning, Events), each with the standard columns.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        tenant: TENANT_PROP,
        tenants: TENANTS_PROP,
      },
    },
    async handler({ name, description, tenant, tenants }) {
      const create = async (t) =>
        json(
          await api(t)("/tasks/projects", {
            method: "POST",
            body: JSON.stringify({ name, description }),
          }),
        );
      if (tenants?.length) return acrossTenants(tenants, create);
      return create(tenant);
    },
  },

  // ------------------------------------------------------------------ boards
  {
    name: "uiiq_board_list",
    description: "List all UIIQ task boards, with their project, columns and card counts.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return listBoards(api(tenant));
    },
  },
  {
    name: "uiiq_board_get",
    description: "Get one UIIQ task board in full — every column with its cards.",
    inputSchema: {
      type: "object",
      required: ["board"],
      properties: { board: { type: "string", description: "Board id or name" }, tenant: TENANT_PROP },
    },
    async handler({ board, tenant }) {
      const client = api(tenant);
      const boardId = await resolveBoardId(client, board);
      return json(await client("/tasks/boards/" + boardId));
    },
  },
  {
    name: "uiiq_board_create",
    description:
      "Create a UIIQ task board. Lands in the named project (created if new); with one project on the tenant it is picked automatically. Columns default to Triage / To Do / Doing / Review / On Hold / Done. Pass `tenants` to create the same board across many tenants in one go.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Board name, e.g. LAUNCH" },
        project: { type: "string", description: "Project name or slug — created if it doesn't exist" },
        projectId: { type: "string", description: "Exact project id (single-tenant only)" },
        columns: {
          type: "array",
          items: { type: "string" },
          description: "Column names in order. Omit for the standard six.",
        },
        color: { type: "string", description: "Accent colour, e.g. #E11D48" },
        tenant: TENANT_PROP,
        tenants: TENANTS_PROP,
      },
    },
    async handler({ name, project, projectId, columns, color, tenant, tenants }) {
      const body = { name };
      if (project) body.project = project;
      if (columns?.length) body.columns = columns;
      if (color) body.color = color;

      const create = async (t, withProjectId) => {
        const payload = withProjectId ? { ...body, projectId: withProjectId } : body;
        return json(await api(t)("/tasks/boards", { method: "POST", body: JSON.stringify(payload) }));
      };

      if (tenants?.length) {
        // projectId is tenant-specific, so it can't be reused across tenants —
        // name the project instead and let each tenant resolve or create it.
        if (projectId) throw new Error("projectId can't be used with `tenants` — pass `project` (a name) instead");
        return acrossTenants(tenants, (t) => create(t));
      }
      return create(tenant, projectId);
    },
  },
  {
    name: "uiiq_board_update",
    description: "Rename a UIIQ task board, change its accent colour, or reorder it.",
    inputSchema: {
      type: "object",
      required: ["board"],
      properties: {
        board: { type: "string", description: "Board id or current name" },
        name: { type: "string" },
        color: { type: "string" },
        position: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ board, name, color, position, tenant }) {
      const client = api(tenant);
      const boardId = await resolveBoardId(client, board);
      const body = {};
      if (name !== undefined) body.name = name;
      if (color !== undefined) body.color = color;
      if (position !== undefined) body.position = position;
      return json(await client("/tasks/boards/" + boardId, { method: "PATCH", body: JSON.stringify(body) }));
    },
  },
  {
    name: "uiiq_board_delete",
    description:
      "Delete a UIIQ task board. Refuses while the board still holds cards unless force is true (which deletes them with it).",
    inputSchema: {
      type: "object",
      required: ["board"],
      properties: {
        board: { type: "string", description: "Board id or name" },
        force: { type: "boolean", description: "Delete the board's cards too" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ board, force, tenant }) {
      const client = api(tenant);
      const boardId = await resolveBoardId(client, board);
      return json(
        await client(`/tasks/boards/${boardId}${force ? "?force=true" : ""}`, { method: "DELETE" }),
      );
    },
  },
  {
    name: "uiiq_board_column_add",
    description: "Add a column to a UIIQ task board.",
    inputSchema: {
      type: "object",
      required: ["board", "name"],
      properties: {
        board: { type: "string", description: "Board id or name" },
        name: { type: "string" },
        color: { type: "string" },
        position: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ board, name, color, position, tenant }) {
      const client = api(tenant);
      const boardId = await resolveBoardId(client, board);
      return json(
        await client(`/tasks/boards/${boardId}/columns`, {
          method: "POST",
          body: JSON.stringify({ name, color, position }),
        }),
      );
    },
  },
  {
    name: "uiiq_board_column_update",
    description: "Rename, recolour or reorder a column on a UIIQ task board.",
    inputSchema: {
      type: "object",
      required: ["board", "columnId"],
      properties: {
        board: { type: "string", description: "Board id or name" },
        columnId: { type: "string" },
        name: { type: "string" },
        color: { type: "string" },
        position: { type: "number" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ board, columnId, name, color, position, tenant }) {
      const client = api(tenant);
      const boardId = await resolveBoardId(client, board);
      const body = { columnId };
      if (name !== undefined) body.name = name;
      if (color !== undefined) body.color = color;
      if (position !== undefined) body.position = position;
      return json(
        await client(`/tasks/boards/${boardId}/columns`, { method: "PATCH", body: JSON.stringify(body) }),
      );
    },
  },
  {
    name: "uiiq_board_column_delete",
    description:
      "Delete a column from a UIIQ task board. A column holding cards needs moveCardsTo (another column on the same board); a board always keeps at least one column.",
    inputSchema: {
      type: "object",
      required: ["board", "columnId"],
      properties: {
        board: { type: "string", description: "Board id or name" },
        columnId: { type: "string" },
        moveCardsTo: { type: "string", description: "Column id to move any cards into" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ board, columnId, moveCardsTo, tenant }) {
      const client = api(tenant);
      const boardId = await resolveBoardId(client, board);
      const qs = new URLSearchParams({ columnId });
      if (moveCardsTo) qs.set("moveCardsTo", moveCardsTo);
      return json(await client(`/tasks/boards/${boardId}/columns?${qs}`, { method: "DELETE" }));
    },
  },

  // ------------------------------------------------------------------ people
  {
    name: "uiiq_task_members",
    description: "List the people a UIIQ task card can be assigned to on this tenant.",
    inputSchema: { type: "object", properties: { tenant: TENANT_PROP } },
    async handler({ tenant } = {}) {
      return json(await api(tenant)("/tasks/members"));
    },
  },

  // ------------------------------------------------------------------- cards
  {
    name: "uiiq_task_list",
    description:
      "List UIIQ tasks. Filter by board, status, assignee (id, email or name), title text, or mine (assigned to me).",
    inputSchema: {
      type: "object",
      properties: {
        mine: { type: "boolean" },
        board: { type: "string", description: "Board id or name" },
        status: { type: "string", description: "todo | in-progress | review | on-hold | done" },
        assignee: { type: "string", description: "User id, email or name — or \"none\" for unassigned" },
        q: { type: "string", description: "Match card titles containing this text" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ mine, board, status, assignee, q, tenant } = {}) {
      const client = api(tenant);
      if (mine) {
        const data = await json(await client("/tasks/my-work"));
        return Array.isArray(data) ? data : data.tasks ?? [];
      }
      const params = new URLSearchParams();
      if (board) params.set("board", board);
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      if (assignee) {
        params.set(
          "assigneeId",
          assignee.toLowerCase() === "none" ? "none" : await resolveMemberId(client, assignee),
        );
      }
      const data = await json(await client("/tasks/cards?" + params));
      return Array.isArray(data) ? data : data.cards ?? [];
    },
  },
  {
    name: "uiiq_task_get",
    description: "Get a UIIQ task card by ID — description, checklists, comments, attachments and activity.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant }) {
      const res = await api(tenant)("/tasks/cards/" + id);
      if (!res.ok) throw new Error("Task not found: " + id);
      return res.json();
    },
  },
  {
    name: "uiiq_task_create",
    description:
      "Create UIIQ task cards. Address the board by name or id; a card lands in the column matching its `status`, or the board's first column. Pass `cards` to seed a whole board in one call, and `tenants` to repeat it across many tenants — both report per-item success/failure rather than stopping at the first error.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Single card title. Use `cards` instead to create many." },
        cards: {
          type: "array",
          description:
            "Create several cards on the board in one call. Each entry takes title (required) plus any of description, status, priority, assignee, dueDate, labels; anything omitted falls back to the top-level value.",
          items: {
            type: "object",
            required: ["title"],
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              status: { type: "string" },
              priority: { type: "string" },
              assignee: { type: "string" },
              dueDate: { type: "string" },
              labels: { type: "array", items: { type: "string" } },
            },
          },
        },
        board: { type: "string", description: "Board id or name (required unless boardId is given)" },
        boardId: { type: "string", description: "Exact board id (single-tenant only)" },
        description: { type: "string" },
        assignee: { type: "string", description: "User id, email or name to assign to" },
        assigneeId: { type: "string", description: "Exact user id (single-tenant only)" },
        dueDate: { type: "string", description: "ISO date string" },
        priority: { type: "string", description: "low | medium | high | urgent" },
        status: { type: "string", description: "Column to land in, e.g. todo / doing / review" },
        columnId: { type: "string", description: "Exact column id (single-tenant only)" },
        labels: { type: "array", items: { type: "string" } },
        tenant: TENANT_PROP,
        tenants: TENANTS_PROP,
      },
    },
    async handler({
      title, cards, board, boardId, description, assignee, assigneeId, dueDate, priority, status, columnId, labels,
      tenant, tenants,
    }) {
      if (!title && !cards?.length) throw new Error("title or cards is required");

      // Each card inherits anything it doesn't set from the top-level fields,
      // so a 65-card seed can share one board, priority and set of labels.
      const spec = cards?.length
        ? cards.map((c) => ({
            title: c.title, description: c.description ?? description,
            assignee: c.assignee ?? assignee, dueDate: c.dueDate ?? dueDate,
            priority: c.priority ?? priority, status: c.status ?? status,
            labels: c.labels ?? labels,
          }))
        : [{ title, description, assignee, dueDate, priority, status, labels }];

      const createOne = async (client, resolvedBoardId, card, opts) => {
        const assigneeRef = card.assignee;
        const body = {
          boardId: resolvedBoardId,
          ...cardCreateBody({
            ...card,
            assigneeId: opts.assigneeId ?? (assigneeRef ? await resolveMemberId(client, assigneeRef) : undefined),
            columnId: opts.columnId,
          }),
        };
        return json(await client("/tasks/cards", { method: "POST", body: JSON.stringify(body) }));
      };

      // One tenant session for the whole batch rather than one per card.
      const runTenant = (t, opts = {}) =>
        withTenant(t ?? null, async (client) => {
          const resolvedBoardId = opts.boardId ?? (await resolveBoardId(client, board));
          if (spec.length === 1) return createOne(client, resolvedBoardId, spec[0], opts);

          const created = [];
          for (const card of spec) {
            try {
              created.push({ title: card.title, ok: true, card: await createOne(client, resolvedBoardId, card, opts) });
            } catch (e) {
              created.push({ title: card.title, ok: false, error: e.message });
            }
          }
          return {
            boardId: resolvedBoardId,
            total: created.length,
            succeeded: created.filter((c) => c.ok).length,
            failed: created.filter((c) => !c.ok).length,
            cards: created,
          };
        });

      if (tenants?.length) {
        // Ids belong to one tenant — everything must be resolved per tenant.
        if (boardId || assigneeId || columnId) {
          throw new Error("boardId / assigneeId / columnId can't be used with `tenants` — use board / assignee / status");
        }
        if (!board) throw new Error("board (a name) is required when creating across tenants");
        return acrossTenants(tenants, (t) => runTenant(t));
      }
      if (!board && !boardId) throw new Error("board or boardId is required");
      return runTenant(tenant, { boardId, assigneeId, columnId });
    },
  },
  {
    name: "uiiq_task_update",
    description:
      "Update a UIIQ task card — retitle, edit the description, change status/priority/due date/labels, or reassign.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", description: "todo | in-progress | review | on-hold | done" },
        assignee: { type: "string", description: "User id, email or name — empty string unassigns" },
        assigneeId: { type: "string" },
        dueDate: { type: "string", description: "ISO date string" },
        priority: { type: "string", description: "low | medium | high | urgent" },
        labels: { type: "array", items: { type: "string" } },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, title, description, status, assignee, assigneeId, dueDate, priority, labels, tenant }) {
      const client = api(tenant);
      const body = {};
      if (title !== undefined) body.title = title;
      if (description !== undefined) body.description = description;
      if (status !== undefined) body.status = status;
      if (dueDate !== undefined) body.dueDate = dueDate;
      if (priority !== undefined) body.priority = priority;
      if (labels !== undefined) body.labels = labels;
      if (assigneeId !== undefined) body.assigneeId = assigneeId;
      else if (assignee !== undefined) {
        body.assigneeId = assignee ? await resolveMemberId(client, assignee) : null;
      }
      if (!Object.keys(body).length) throw new Error("Nothing to update");
      return json(await client(`/tasks/cards/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
    },
  },
  {
    name: "uiiq_task_assign",
    description: "Assign a UIIQ task card to someone by id, email or name. Pass an empty person to unassign.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        person: { type: "string", description: "User id, email or name. Empty/omitted unassigns." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, person, tenant }) {
      const client = api(tenant);
      const assigneeId = person ? await resolveMemberId(client, person) : null;
      return json(
        await client(`/tasks/cards/${id}`, { method: "PATCH", body: JSON.stringify({ assigneeId }) }),
      );
    },
  },
  {
    name: "uiiq_task_move",
    description:
      "Move a UIIQ task card to another column on its board — by column name (or a status word) or exact column id.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        column: { type: "string", description: "Target column name, e.g. Doing" },
        columnId: { type: "string", description: "Exact target column id" },
        position: { type: "number", description: "Index within the column. Defaults to the bottom." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, column, columnId, position, tenant }) {
      const client = api(tenant);
      if (!column && !columnId) throw new Error("column or columnId is required");

      let targetId = columnId;
      let targetPosition = position;

      if (!targetId || targetPosition === undefined) {
        const card = await json(await client("/tasks/cards/" + id));
        const board = await json(await client("/tasks/boards/" + card.board.id));
        const wanted = String(column ?? "").trim().toLowerCase();
        const target = targetId
          ? board.columns.find((c) => c.id === targetId)
          : board.columns.find((c) => String(c.name).toLowerCase() === wanted);
        if (!target) {
          throw new Error(
            `No column "${column ?? columnId}" on board ${board.name}. Columns: ${board.columns.map((c) => c.name).join(", ")}`,
          );
        }
        targetId = target.id;
        // Bottom of the target column unless the caller pinned a position.
        if (targetPosition === undefined) targetPosition = target.cards.length;
      }

      return json(
        await client(`/tasks/cards/${id}/move`, {
          method: "PATCH",
          body: JSON.stringify({ columnId: targetId, position: targetPosition }),
        }),
      );
    },
  },
  {
    name: "uiiq_task_delete",
    description: "Delete a UIIQ task card.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, tenant }) {
      return json(await api(tenant)(`/tasks/cards/${id}`, { method: "DELETE" }));
    },
  },
  {
    name: "uiiq_task_comment",
    description: "Add a comment to a UIIQ task card.",
    inputSchema: {
      type: "object",
      required: ["id", "body"],
      properties: { id: { type: "string" }, body: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, body, tenant }) {
      return json(
        await api(tenant)("/tasks/cards/" + id + "/comments", {
          method: "POST",
          body: JSON.stringify({ body }),
        }),
      );
    },
  },
  {
    name: "uiiq_task_checklist_add",
    description: "Add a checklist item to a UIIQ task card (creates the checklist if the card hasn't got one).",
    inputSchema: {
      type: "object",
      required: ["id", "title"],
      properties: { id: { type: "string" }, title: { type: "string" }, tenant: TENANT_PROP },
    },
    async handler({ id, title, tenant }) {
      return json(
        await api(tenant)(`/tasks/cards/${id}/checklist`, {
          method: "POST",
          body: JSON.stringify({ title }),
        }),
      );
    },
  },
  {
    name: "uiiq_task_checklist_check",
    description: "Tick or untick a checklist item on a UIIQ task card.",
    inputSchema: {
      type: "object",
      required: ["id", "itemId", "isChecked"],
      properties: {
        id: { type: "string", description: "Card id" },
        itemId: { type: "string" },
        isChecked: { type: "boolean" },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, itemId, isChecked, tenant }) {
      return json(
        await api(tenant)(`/tasks/cards/${id}/checklist`, {
          method: "PATCH",
          body: JSON.stringify({ itemId, isChecked }),
        }),
      );
    },
  },
];
