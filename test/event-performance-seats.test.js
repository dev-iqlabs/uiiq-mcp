// node --test — uiiq_event_performance_seats: one performance's seats, through the route that
// closes and opens one (PATCH /api/events/:id/tickets/performances, action "seats"). The action is
// in a UiiQ-platform PR still being built; this holds the client to that contract. Against a local
// stand-in for UIIQ (a throwaway HOME with a fake session, so no real login is read or sent).
//
// What these hold still: a dry run without confirm, as closing a night has; the number checked here
// before anything is sent (1 to 100000, whole); the body the contract names; and UiiQ's refusal
// (never below the seats already booked) coming back in its words.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tool;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, data] = reply;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
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
  delete process.env.UIIQ_MCP_INHERIT_IMPERSONATION;
  delete process.env.UIIQ_MCP_INHERIT_WRITE;
  const { eventsTools } = await import("../src/tools/events.js");
  tool = eventsTools.find((t) => t.name === "uiiq_event_performance_seats");
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(args, answer = [500, { error: "nothing should have been called" }]) {
  reply = answer;
  seen = [];
  const result = await tool.handler(args);
  return { result, requests: seen };
}

const STATE = {
  eventId: "ev_hoedown", on: true,
  experience: { id: "exp_1", performances: [{ id: "ses_1", capacity: 350, booked: 12, left: 338, status: "OPEN" }], ticketTypes: [] },
};

test("the tool exists, shaped like uiiq_event_performance_set, with a seat count", () => {
  assert.ok(tool, "uiiq_event_performance_seats is missing");
  const s = tool.inputSchema;
  assert.deepEqual(s.required, ["id", "performanceId", "capacity"]);
  assert.equal(s.properties.capacity.type, "integer");
  assert.equal(s.properties.capacity.minimum, 1);
  assert.equal(s.properties.capacity.maximum, 100000);
  assert.ok("confirm" in s.properties);
  assert.ok("tenant" in s.properties);
});

test("without confirm it is a dry run, and calls nothing", async () => {
  assert.match(tool.description, /Without confirm: true it is ALWAYS a dry run/);
  const { result, requests } = await call({ id: "ev_hoedown", performanceId: "ses_1", capacity: 350 });
  assert.deepEqual(requests, []);
  assert.equal(result.dryRun, true);
  assert.equal(result.changed, false);
  assert.equal(result.wouldDo, "set_performance_seats");
  assert.equal(result.performanceId, "ses_1");
  assert.equal(result.capacity, 350);
  assert.match(result.note, /below the seats already booked/);
});

test("a number outside 1 to 100000, or not whole, is refused before anything is called, confirm or not", async () => {
  for (const capacity of [0, -1, 100001, 1.5, "120", NaN, null, undefined, Infinity]) {
    for (const confirm of [true, undefined]) {
      await assert.rejects(
        () => call({ id: "ev_hoedown", performanceId: "ses_1", capacity, confirm }),
        /capacity must be a whole number from 1 to 100000/,
        `${String(capacity)} confirm=${confirm}`,
      );
      assert.deepEqual(seen, [], `${String(capacity)} reached UiiQ`);
    }
  }
});

test("with confirm: one PATCH to the performances route with action seats and the capacity", async () => {
  const { result, requests } = await call({ id: "ev/hoedown", performanceId: "ses_1", capacity: 350, confirm: true }, [200, STATE]);
  assert.deepEqual(requests, [{
    method: "PATCH",
    path: "/events/ev%2Fhoedown/tickets/performances",
    body: { performanceId: "ses_1", action: "seats", capacity: 350 },
  }]);
  assert.deepEqual(result, STATE);
});

test("the ends of the range are allowed", async () => {
  for (const capacity of [1, 100000]) {
    const { requests } = await call({ id: "ev_hoedown", performanceId: "ses_1", capacity, confirm: true }, [200, STATE]);
    assert.equal(requests[0].body.capacity, capacity);
  }
});

test("below what's booked: UiiQ's 409 is the error, in its words", async () => {
  const words = "That's fewer seats than have already been booked (12 booked).";
  await assert.rejects(
    () => call({ id: "ev_hoedown", performanceId: "ses_1", capacity: 5, confirm: true }, [409, { error: words }]),
    (e) => { assert.equal(e.message, words); return true; },
  );
  assert.equal(seen.length, 1);
});

test("the description says what the refusal is", () => {
  assert.match(tool.description, /never sets it below the seats already booked/);
  assert.match(tool.description, /409/);
});
