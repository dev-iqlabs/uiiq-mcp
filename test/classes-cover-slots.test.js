// node --test — a class's coverSlots (UiiQ-platform: a class can use more than
// one of a plan's weekly slots) through create, update and get, against a
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

const CLASS = { name: "Musical Theatre", dayOfWeek: 2, startTime: "17:00", durationMins: 120, capacity: 20 };

test("create and update send coverSlots; update without it doesn't send one", async () => {
  const created = await call("uiiq_classes_create", { ...CLASS, coverSlots: 2 }, [201, { ok: true, id: "cls_mt" }]);
  assert.deepEqual(created.requests, [{ method: "POST", path: "/classes", body: { ...CLASS, coverSlots: 2 } }]);
  const updated = await call("uiiq_classes_update", { id: "cls_mt", ...CLASS, coverSlots: 2 }, [200, { ok: true }]);
  assert.deepEqual(updated.requests, [{ method: "PATCH", path: "/classes/cls_mt", body: { ...CLASS, coverSlots: 2 } }]);
  const without = await call("uiiq_classes_update", { id: "cls_mt", ...CLASS }, [200, { ok: true }]);
  assert.equal("coverSlots" in without.requests[0].body, false);
});

test("get returns coverSlots and whether you may change it", async () => {
  const { result } = await call("uiiq_classes_get", { id: "cls_mt" }, [200, { classes: [{ id: "cls_mt", coverSlots: 2 }], canSetCoverSlots: false }], [200, { runs: [] }]);
  assert.deepEqual([result.coverSlots, result.canSetCoverSlots], [2, false]);
});

test("a teacher's refusal comes back as UIIQ's message", async () => {
  await assert.rejects(
    call("uiiq_classes_update", { id: "cls_mt", ...CLASS, coverSlots: 2 }, [403, { error: "Only an owner or admin can change how many of a plan's weekly slots a class uses." }]),
    /owner or admin/,
  );
});

test("the schema says what it is, its range, and who may change it", () => {
  for (const name of ["uiiq_classes_create", "uiiq_classes_update"]) {
    const prop = tools[name].inputSchema.properties.coverSlots;
    assert.deepEqual([prop.type, prop.minimum, prop.maximum], ["integer", 1, 14]);
    assert.match(prop.description, /double-length class/);
    assert.match(prop.description, /owner or admin/i);
  }
  assert.match(tools.uiiq_classes_get.description, /coverSlots/);
});

test("update sends confirmAtRisk, and a 409 asking first comes back as its question", async () => {
  const ok = await call("uiiq_classes_update", { id: "cls_mt", ...CLASS, coverSlots: 2, confirmAtRisk: 1 }, [200, { ok: true, atRisk: 1 }]);
  assert.equal(ok.requests[0].body.confirmAtRisk, 1);
  assert.equal(ok.result.atRisk, 1);
  await assert.rejects(
    call("uiiq_classes_update", { id: "cls_mt", ...CLASS, coverSlots: 2 }, [409, { needsConfirmation: true, atRisk: 1, error: "1 family on a plan will now be over their weekly limit for this class. Save anyway?" }]),
    /will now be over their weekly limit/,
  );
});

test("the update description warns about raising coverSlots and says what is kept when omitted", () => {
  const d = tools.uiiq_classes_update.description;
  assert.ok(d.includes("Raising coverSlots can put existing 1-a-week members over their weekly limit; check atRisk."));
  assert.match(d, /Only resend confirmAtRisk after the user explicitly agrees/);
  assert.match(d, /confirmAtRisk: <n>/);
  assert.equal(tools.uiiq_classes_update.inputSchema.properties.confirmAtRisk.type, "integer");
  assert.match(d, /dropInPricePence, termFeePence, coveredByPlanIds, coverSlots, planCover\) are kept as they are when omitted/);
});
