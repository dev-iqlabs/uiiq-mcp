// node --test — a class's planCover ("Covered by weekly plans", UiiQ-platform
// 19 Oct 2026) through create, update and get, and the 409 that asks first, against a
// local stand-in for UIIQ (a throwaway HOME with a fake session).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, replies, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, json] = replies.length > 1 ? replies.shift() : replies[0];
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  home = mkdtempSync(join(tmpdir(), "uiiq-mcp-test-home-"));
  mkdirSync(join(home, ".uiiq"));
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "test", cookieName: "authjs.session-token" }));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.UIIQ_BASE = base;
  const { classesTools } = await import("../src/tools/classes.js");
  tools = Object.fromEntries(classesTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, ...responses) {
  replies = responses;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

const CLASS = { name: "Holiday Club", dayOfWeek: 1, startTime: "10:00", durationMins: 60, capacity: 20 };
const ASK = "2 families on a plan in Holiday Club would be charged at the register. Save anyway?";

test("create and update send planCover; update without it doesn't send one", async () => {
  const created = await call("uiiq_classes_create", { ...CLASS, planCover: "NOT_COVERED" }, [201, { ok: true, id: "cls_hc" }]);
  assert.deepEqual(created.requests, [{ method: "POST", path: "/classes", body: { ...CLASS, planCover: "NOT_COVERED" } }]);
  const updated = await call("uiiq_classes_update", { id: "cls_hc", ...CLASS, planCover: "COVERED" }, [200, { ok: true }]);
  assert.deepEqual(updated.requests, [{ method: "PATCH", path: "/classes/cls_hc", body: { ...CLASS, planCover: "COVERED" } }]);
  const without = await call("uiiq_classes_update", { id: "cls_hc", ...CLASS }, [200, { ok: true }]);
  assert.equal("planCover" in without.requests[0].body, false);
  assert.equal("confirmCoverChange" in without.requests[0].body, false);
});

test("a 409 asking first comes back as its question; confirmCoverChange is sent as the count", async () => {
  await assert.rejects(
    call("uiiq_classes_update", { id: "cls_hc", ...CLASS, planCover: "NOT_COVERED" }, [409, { needsConfirmation: true, affected: 2, confirmCoverChange: 2, error: ASK }]),
    /would be charged at the register/,
  );
  const ok = await call("uiiq_classes_update", { id: "cls_hc", ...CLASS, planCover: "NOT_COVERED", confirmCoverChange: 2 }, [200, { ok: true, atRisk: 0, affected: 2 }]);
  assert.equal(ok.requests[0].body.confirmCoverChange, 2);
  assert.equal(ok.result.affected, 2);
});

test("get passes the setting, what it comes to, and the organisation through", async () => {
  const answer = { id: "cls_hc", planCover: "AUTO", coveredByWeeklyPlans: false, planCoverAutomatic: false, organisation: { id: "bo_college", name: "Street Beat College", sister: true } };
  const { result } = await call("uiiq_classes_get", { id: "cls_hc" }, [200, answer]);
  assert.deepEqual(result, answer);
});

test("the schema: the three values, owner or admin, kept when omitted; the count to confirm", () => {
  for (const name of ["uiiq_classes_create", "uiiq_classes_update"]) {
    const prop = tools[name].inputSchema.properties.planCover;
    assert.deepEqual([prop.type, prop.enum], ["string", ["AUTO", "COVERED", "NOT_COVERED"]]);
    assert.match(prop.description, /owner or admin/i);
    assert.match(prop.description, /Kept as it is when omitted/);
    assert.match(prop.description, /sister organisation/);
  }
  const confirm = tools.uiiq_classes_update.inputSchema.properties.confirmCoverChange;
  assert.deepEqual([confirm.type, confirm.minimum], ["integer", 0]);
  assert.equal("confirmCoverChange" in tools.uiiq_classes_create.inputSchema.properties, false);
  const d = tools.uiiq_classes_update.description;
  assert.match(d, /Only resend confirmCoverChange after the user explicitly agrees/);
  assert.match(d, /confirmCoverChange: <n>/);
  assert.match(d, /coverSlots, planCover\) are kept as they are when omitted/);
  assert.match(tools.uiiq_classes_get.description, /coveredByWeeklyPlans/);
  assert.match(tools.uiiq_classes_get.description, /organisation \{ id, name, sister \}/);
  assert.match(tools.uiiq_classes_list.description, /coveredByWeeklyPlans/);
});

test("uiiq_classes_plan_cover_impact: a GET of the impact listing, returned as it is; a 403 is thrown", async () => {
  const impact = { classes: [{ classId: "cls_hc", className: "Holiday Club", organisation: { id: "bo_college", name: "Street Beat College", sister: true }, planCover: "AUTO", scheduleType: "TERM", dropInPricePence: null, affectedFamilies: 3 }] };
  replies = [[200, impact]];
  seen = [];
  assert.deepEqual(await tools.uiiq_classes_plan_cover_impact.handler({}), impact);
  assert.deepEqual(seen, [{ method: "GET", path: "/classes/plan-cover/impact" }]);
  assert.match(tools.uiiq_classes_plan_cover_impact.description, /never a family's or child's name/);
  // The two fields that say whether the register will collect anything from those families (Lucas M2 on UiiQ #1099).
  assert.match(tools.uiiq_classes_plan_cover_impact.description, /scheduleType, dropInPricePence, affectedFamilies/);
  assert.match(tools.uiiq_classes_plan_cover_impact.description, /null = none set, so NOTHING is collected/);
  assert.match(tools.uiiq_classes_plan_cover_impact.description, /TERM or ROLLING/);
  replies = [[403, { error: "Only an owner or admin can see which classes weekly plans no longer cover." }]];
  await assert.rejects(() => tools.uiiq_classes_plan_cover_impact.handler({}), /owner or admin/);
});
