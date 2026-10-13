// node --test — till day close and daily summary carry the "Owed to <sister>"
// lines (UiiQ-platform sister organisations 3e, Steve 13 Oct 2026: "Allow it,
// show owed-to-College"): a sister organisation's desk takings, one line per
// sister, apart from the workspace's own. Against a local stand-in for UIIQ
// (a throwaway HOME with a fake session).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, json] = reply;
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
  ({ tillTools: tools } = await import("../src/tools/till.js"));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

const tool = (name) => tools.find((t) => t.name === name);
const call = (name, r, args) => { reply = r; seen = []; return tool(name).handler(args); };
const LINE = { billingOrganisationId: "bo_college", name: "Riverside College", owedPence: 1200, collectedPence: 1200, refundedPence: 0, cashPence: 500, cardPence: 700, salesCount: 2 };

test("the daily summary answers with its owedTo lines and the workspace's own net revenue", async () => {
  const out = await call("uiiq_till_daily_summary", [200, { headline: { netRevenuePence: 6200, ownNetRevenuePence: 5000 }, owedTo: [LINE] }], { date: "2026-10-13" });
  assert.deepEqual(seen, [{ method: "GET", path: "/till/daily-summary?date=2026-10-13" }]);
  assert.deepEqual(out.owedTo, [LINE]);
  assert.equal(out.headline.ownNetRevenuePence, 5000);
});

test("a day close answers with its owedTo lines and ownSalesPence", async () => {
  const out = await call("uiiq_till_day_close", [200, { totalSalesPence: 3700, ownSalesPence: 2500, owedTo: [LINE] }], { managerPin: "123456", declaredCashPence: 4000 });
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].path, "/till/day-close");
  assert.deepEqual(out.owedTo, [LINE]);
  assert.equal(out.ownSalesPence, 2500);
});

test("the recent closes each carry their owedTo lines", async () => {
  const out = await call("uiiq_till_day_close_list", [200, [{ id: "close_1", owedTo: [LINE] }, { id: "close_0", owedTo: [] }]], {});
  assert.deepEqual(out.map((c) => c.owedTo), [[LINE], []]);
});

test("the descriptions say what the owed lines are", () => {
  for (const name of ["uiiq_till_daily_summary", "uiiq_till_day_close", "uiiq_till_day_close_list"]) {
    assert.match(tool(name).description, /owedTo: desk takings that are a SISTER organisation's/, name);
    assert.match(tool(name).description, /apart from the workspace's own/, name);
  }
  assert.match(tool("uiiq_till_daily_summary").description, /ownNetRevenuePence/);
  assert.match(tool("uiiq_till_day_close").description, /ownSalesPence = totalSalesPence without them/);
});
