// node --test — no AI session reads children's records (Steve, 22 Oct 2026, from Kim's DPIA:
// DPIA R3, DPA 6.6). The MCP has no tool for a child-record route, so none can come back
// unnoticed: every path any source file calls is checked against the child-record routes, with
// an explicit allowlist (and its reason) for the few that carry no child. The platform refuses
// those routes server-side for CLI, MCP and API-key sessions too, in its own PR.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The routes that hold children's records, as the paths the tools call (without /api).
export const CHILD_RECORD_ROUTES = [
  { re: /^\/students(\/|$)/, what: "student records: names, dates of birth, health, SEND, allergies, emergency contacts, photos, photo and health consent, progress, check-in cards, absences, registrations" },
  { re: /^\/admin\/cards\/students(\/|$)/, what: "children's printed check-in cards and their proofs" },
  { re: /^\/classes\/registers(\/|$)/, what: "the registers: children's names, marks, payments, stars, costumes, photo consent, scan check-in, attendance reports" },
  { re: /^\/classes\/enrolments(\/|$)/, what: "enrolments: children, their guardians and what they pay" },
  { re: /^\/classes\/parent-enrolments(\/|$)/, what: "the children parents enrolled in the Members App" },
  { re: /^\/classes\/absences(\/|$)/, what: "children's absences" },
  { re: /^\/classes\/auditions(\/|$)/, what: "children's audition requests" },
  { re: /^\/classes\/sessions\/audience(\/|$)/, what: "a session's households, with their children named" },
  { re: /^\/classes\/costumes(\/|$)/, what: "a child's routine costume (its refund)" },
  { re: /^\/portal(\/|$)/, what: "the parent area: a family's children" },
];
// Kept on purpose, each with why it carries no child.
export const ALLOWED = {
  "/students/groups": "labels and a count each, no child named (the group picker for notices, campaigns and SMS)",
  "/classes/registers/settings": "the register settings: thresholds, the timetable page and the age groups, no child",
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}
// Every API path a file calls, as the platform's client-coverage reads them: a template right after a slash is
// a segment (/*); anywhere else it is a query string, not part of the route.
export function pathsIn(src) {
  const out = new Set();
  for (const m of src.matchAll(/[`"'](\/(?:api\/)?[a-z0-9][a-zA-Z0-9_\-/${}().?=&]*)[`"']/g)) {
    const s = m[1].split("?")[0].replace(/^\/api/, "").replace(/\/\$\{[^}]*\}/g, "/*").replace(/\$\{[^}]*\}.*$/, "").replace(/\/+$/, "");
    if (s) out.add(s);
  }
  return out;
}
export function childRecordCalls(files) {
  const found = [];
  for (const f of files) {
    for (const p of pathsIn(readFileSync(f, "utf8"))) {
      const hit = CHILD_RECORD_ROUTES.find((r) => r.re.test(p));
      if (hit && !ALLOWED[p]) found.push(`${relative(ROOT, f)}: ${p} (${hit.what})`);
    }
  }
  return found;
}

test("no source file calls a child-record route, except the allowlisted ones", () => {
  const found = childRecordCalls(walk(join(ROOT, "src")));
  assert.deepEqual(found, [], `Children's records aren't for an AI session (Steve, 22 Oct 2026). Remove these, or add them to ALLOWED with why they carry no child:\n${found.join("\n")}`);
});

test("the guard can fail: a tool calling a student, a register or an enrolment is caught", () => {
  const dir = mkdtempSync(join(tmpdir(), "no-child-guard-"));
  try {
    const f = join(dir, "sneaky.js");
    writeFileSync(f, "api(t)(`/students/${encodeURIComponent(id)}/absences`); send(t, 'GET', `/classes/registers${qs}`); post(t, \"/classes/enrolments\", b); api(t)(\"/students/groups\");");
    const found = childRecordCalls([f]);
    assert.equal(found.length, 3, found.join("\n"));
    assert.ok(found.some((x) => x.includes("/students/*/absences")));
    assert.ok(found.some((x) => x.includes("/classes/registers ")));
    assert.ok(found.some((x) => x.includes("/classes/enrolments ")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

let server, home, reply, seen, tools;
before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, json] = reply();
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  home = mkdtempSync(join(tmpdir(), "uiiq-mcp-test-home-"));
  mkdirSync(join(home, ".uiiq"));
  const base = `http://127.0.0.1:${server.address().port}`;
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "test", cookieName: "authjs.session-token" }));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.UIIQ_BASE = base;
  tools = {};
  // Every tool the server offers, as src/index.js builds them: each module under src/tools.
  for (const f of readdirSync(join(ROOT, "src", "tools")).filter((x) => x.endsWith(".js"))) {
    const mod = await import(new URL(`../src/tools/${f}`, import.meta.url));
    for (const list of Object.values(mod)) if (Array.isArray(list)) for (const t of list) if (t?.name) tools[t.name] = t;
  }
});
after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

test("no tool is named for a child's record: students (but the group picker), their cards, registers, enrolments, absences, a session's audience", () => {
  const childNamed = /^uiiq_students_(?!groups$)|^uiiq_cards_students?_|^uiiq_classes_(register_(?!settings$|settings_set$)|enrol|parent_enrol|absences|attendance|costume|scan_cards|session_audience)/;
  const found = Object.keys(tools).filter((n) => childNamed.test(n));
  assert.deepEqual(found, []);
  assert.ok(tools.uiiq_students_groups && tools.uiiq_classes_register_settings && tools.uiiq_classes_get, "the kept tools are still there");
});

// GET /classes/<id> carries the class's roster, so UiiQ refuses it to this client (UiiQ-platform #1168). Its PATCH and
// DELETE stay (a class's settings), so this is checked by method: no source GETs it, and uiiq_classes_get doesn't.
test("no source file GETs a class's detail route (/classes/<id>): it lists the class's children", () => {
  const getClassDetail = /api\([a-zA-Z]*\)\(\s*`\/classes\/\$\{[^}]+\}`\s*\)/;
  const found = walk(join(ROOT, "src")).filter((f) => getClassDetail.test(readFileSync(f, "utf8")));
  assert.deepEqual(found.map((f) => relative(ROOT, f)), []);
});

test("uiiq_classes_get reads the class list and its course runs, never the class's detail route; a count, never who", async () => {
  const answers = [
    [200, { classes: [{ id: "cls_other", name: "Tap" }, { id: "cls1", name: "Junior Ballet", activeEnrolments: 2 }], canSetCoverSlots: true }],
    [200, { runs: [{ id: "run1", term: { id: "t1", name: "Autumn" }, activeEnrolments: 2 }] }],
  ];
  reply = () => answers.shift();
  seen = [];
  const result = await tools.uiiq_classes_get.handler({ id: "cls1" });
  assert.deepEqual(seen.map((q) => `${q.method} ${q.path}`), ["GET /classes?includeInactive=1", "GET /classes/course-runs?classId=cls1"]);
  assert.deepEqual(result, { id: "cls1", name: "Junior Ballet", activeEnrolments: 2, organisation: { id: null, name: null, sister: false }, courseRuns: [{ id: "run1", term: { id: "t1", name: "Autumn" }, activeEnrolments: 2 }], canSetCoverSlots: true, rosterOmitted: true });
  // A class that isn't in the list: an error, and still no detail call.
  reply = () => [200, { classes: [] }];
  seen = [];
  await assert.rejects(tools.uiiq_classes_get.handler({ id: "cls_gone" }), /No class cls_gone in this workspace/);
  assert.deepEqual(seen.map((q) => q.path), ["/classes?includeInactive=1"]);
});

test("uiiq_form_app_status leaves the child's name out of a per-child row: the parent's row says forAChild", async () => {
  const people = [
    { email: "kim@example.com", name: "Kim Lee", child: { id: "stu1", firstName: "Ava", lastName: "Lee" }, done: true, completedAt: "2026-10-21T10:00:00.000Z" },
    { email: "pat@example.com", name: "Pat Jones", child: null, done: false, completedAt: null },
  ];
  reply = () => [200, { people, done: 1, total: 2 }];
  seen = [];
  const result = await tools.uiiq_form_app_status.handler({ id: "af1" });
  assert.deepEqual(seen, [{ method: "GET", path: "/forms/app/af1/status" }]);
  assert.deepEqual(result, { people: [
    { email: "kim@example.com", name: "Kim Lee", done: true, completedAt: "2026-10-21T10:00:00.000Z", forAChild: true },
    { email: "pat@example.com", name: "Pat Jones", done: false, completedAt: null },
  ], done: 1, total: 2 });
  for (const v of ["Ava", "stu1"]) assert.equal(JSON.stringify(result).includes(v), false, v);
});

test("a class photo is never picked from the MCP: refused before any request, and not in the schemas", async () => {
  const CLASS = { name: "Junior Ballet", dayOfWeek: 1, startTime: "17:00", durationMins: 45, capacity: 16 };
  for (const [name, args] of [["uiiq_classes_create", { ...CLASS, imageMediaId: 41, photoPermissionConfirmed: true }], ["uiiq_classes_update", { id: "cls1", ...CLASS, imageMediaId: null }], ["uiiq_classes_update", { id: "cls1", ...CLASS, photoPermissionConfirmed: true }]]) {
    reply = () => [200, { ok: true }];
    seen = [];
    await assert.rejects(tools[name].handler(args), /Class photos aren't available from the MCP/);
    assert.deepEqual(seen, [], name);
    assert.equal("imageMediaId" in tools[name].inputSchema.properties, false, name);
    assert.equal("photoPermissionConfirmed" in tools[name].inputSchema.properties, false, name);
  }
});
