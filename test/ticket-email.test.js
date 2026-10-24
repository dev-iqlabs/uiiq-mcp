// node --test — emailing buyers their tickets, and a door set to one
// performance (UiiQ-platform events and tickets 5/6): /api/admin/tickets/send
// and the performanceId on /api/admin/tickets/scan. Against a local stand-in
// for UIIQ (a throwaway HOME with a fake session, so no real login is read or
// sent anywhere).
//
// What these hold still: sending emails the workspace's customers, so it is a
// dry run without confirm: true; the loop presses again only while a press is
// sending something, and never more than the route allows a person in its
// window; and a failure after some presses still says what was sent.
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
      // The last reply repeats, so a test can answer "still more" for ever.
      const [status, data] = replies.length > 1 ? replies.shift() : replies[0];
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
  const { ticketsTools } = await import("../src/tools/tickets.js");
  tools = Object.fromEntries(ticketsTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, ...answers) {
  replies = answers.length ? answers : [[500, { error: "nothing should have been called" }]];
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

const COUNTS = { bookings: 130, sent: 10, performances: [{ id: "ses_fri", bookings: 70, sent: 10 }, { id: "ses_sat", bookings: 60, sent: 0 }] };

test("the tools exist with the inputs the routes take", () => {
  assert.deepEqual(tools.uiiq_ticket_email_status.inputSchema.required, ["eventId"]);
  const send = tools.uiiq_ticket_email_send.inputSchema.properties;
  for (const k of ["eventId", "performanceId", "bookingId", "confirm"]) assert.ok(k in send, `${k} missing`);
  assert.ok("performanceId" in tools.uiiq_ticket_scan.inputSchema.properties);
  assert.ok("performanceId" in tools.uiiq_ticket_scan_stats.inputSchema.properties);
});

test("email status: the event's counts, from GET /admin/tickets/send", async () => {
  const { result, requests } = await call("uiiq_ticket_email_status", { eventId: "ev_hoedown" }, [200, COUNTS]);
  assert.deepEqual(requests, [{ method: "GET", path: "/admin/tickets/send?eventId=ev_hoedown" }]);
  assert.deepEqual(result, COUNTS);
});

test("send, no confirm: a dry run that only reads the counts, for the event", async () => {
  const { result, requests } = await call("uiiq_ticket_email_send", { eventId: "ev_hoedown" }, [200, COUNTS]);
  assert.deepEqual(requests, [{ method: "GET", path: "/admin/tickets/send?eventId=ev_hoedown" }]);
  assert.equal(result.dryRun, true);
  assert.equal(result.changed, false);
  assert.equal(result.wouldSend, 120);
  assert.match(result.note, /Nothing was sent/);
});

test("send, no confirm, one performance: that performance's counts", async () => {
  const { result, requests } = await call("uiiq_ticket_email_send", { eventId: "ev_hoedown", performanceId: "ses_sat" }, [200, COUNTS]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
  assert.equal(result.performanceId, "ses_sat");
  assert.equal(result.wouldSend, 60);
});

test("send again, no confirm: calls nothing", async () => {
  const { result, requests } = await call("uiiq_ticket_email_send", { bookingId: "bk_1" });
  assert.deepEqual(requests, []);
  assert.equal(result.dryRun, true);
  assert.equal(result.wouldDo, "email_tickets_again");
});

test("event and booking together, or neither, or a performance with a booking: refused before anything is called", async () => {
  for (const args of [{ eventId: "ev_hoedown", bookingId: "bk_1" }, {}, { bookingId: "bk_1", performanceId: "ses_sat" }]) {
    seen = [];
    await assert.rejects(() => tools.uiiq_ticket_email_send.handler({ ...args, confirm: true }));
    assert.deepEqual(seen, []);
  }
});

test("send: presses again while there is progress, and returns the totals", async () => {
  const { result, requests } = await call(
    "uiiq_ticket_email_send",
    { eventId: "ev_hoedown", performanceId: "ses_sat", confirm: true },
    [200, { sent: 50, notSent: 0, remaining: 70 }],
    [200, { sent: 49, notSent: 1, remaining: 21 }],
    [200, { sent: 21, notSent: 0, remaining: 0 }],
  );
  assert.equal(requests.length, 3);
  for (const r of requests) {
    assert.equal(r.method, "POST");
    assert.equal(r.path, "/admin/tickets/send");
    assert.deepEqual(r.body, { eventId: "ev_hoedown", performanceId: "ses_sat" });
  }
  assert.deepEqual(result, { sent: 120, notSent: 1, remaining: 0, presses: 3, done: true });
});

test("send, whole event: no performanceId in the body", async () => {
  const { requests } = await call("uiiq_ticket_email_send", { eventId: "ev_hoedown", confirm: true }, [200, { sent: 3, notSent: 0, remaining: 0 }]);
  assert.deepEqual(requests[0].body, { eventId: "ev_hoedown" });
});

test("send: a press that sends nothing stops the loop", async () => {
  const { result, requests } = await call(
    "uiiq_ticket_email_send",
    { eventId: "ev_hoedown", confirm: true },
    [200, { sent: 50, notSent: 0, remaining: 3 }],
    [200, { sent: 0, notSent: 3, remaining: 3 }],
    [200, { sent: 50, notSent: 0, remaining: 0 }],
  );
  assert.equal(requests.length, 2);
  assert.deepEqual(result, { sent: 50, notSent: 3, remaining: 3, presses: 2, done: false });
});

test("send: never more than 30 presses, the route's limit per person", async () => {
  const { result, requests } = await call("uiiq_ticket_email_send", { eventId: "ev_hoedown", confirm: true }, [200, { sent: 50, notSent: 0, remaining: 5000 }]);
  assert.equal(requests.length, 30);
  assert.equal(result.presses, 30);
  assert.equal(result.sent, 1500);
  assert.equal(result.done, false);
});

test("send: refused on the first press is an error in UiiQ's words", async () => {
  await assert.rejects(
    () => call("uiiq_ticket_email_send", { eventId: "ev_hoedown", confirm: true }, [429, { error: "That's a lot of sending. Try again in a few minutes." }]),
    /That's a lot of sending/,
  );
});

test("send: refused after some presses still reports what was sent", async () => {
  const { result } = await call(
    "uiiq_ticket_email_send",
    { eventId: "ev_hoedown", confirm: true },
    [200, { sent: 50, notSent: 0, remaining: 40 }],
    [429, { error: "That's a lot of sending. Try again in a few minutes." }],
  );
  assert.equal(result.sent, 50);
  assert.equal(result.remaining, 40);
  assert.equal(result.done, false);
  assert.match(result.stopped, /That's a lot of sending/);
});

test("send again: one POST with the booking, and the refusal in UiiQ's words", async () => {
  const { result, requests } = await call("uiiq_ticket_email_send", { bookingId: "bk_1", confirm: true }, [200, { sent: 1, notSent: 0, remaining: 0 }]);
  assert.deepEqual(requests, [{ method: "POST", path: "/admin/tickets/send", body: { bookingId: "bk_1" } }]);
  assert.equal(result.sent, 1);
  await assert.rejects(
    () => call("uiiq_ticket_email_send", { bookingId: "bk_2", confirm: true }, [409, { error: "This booking isn't confirmed yet, so it has no tickets to send." }]),
    /isn't confirmed yet/,
  );
});

test("scan stats: one performance by query string; without it, as before", async () => {
  const one = await call("uiiq_ticket_scan_stats", { performanceId: "ses_sat" }, [200, { performances: [], defaultPerformanceId: null, performance: { id: "ses_sat" } }]);
  assert.deepEqual(one.requests, [{ method: "GET", path: "/admin/tickets/scan?performanceId=ses_sat" }]);
  const all = await call("uiiq_ticket_scan_stats", {}, [200, { admittedToday: 0 }]);
  assert.deepEqual(all.requests, [{ method: "GET", path: "/admin/tickets/scan" }]);
});

test("scan: the door's performance goes in the body, and WRONG_PERFORMANCE comes back as it is", async () => {
  const wrong = { ok: false, result: "WRONG_PERFORMANCE", performance: "Sat 20 Feb, 7pm" };
  const { result, requests } = await call("uiiq_ticket_scan", { code: "ABC123", performanceId: "ses_fri" }, [200, wrong]);
  assert.deepEqual(requests[0].body, { code: "ABC123", undo: false, performanceId: "ses_fri" });
  assert.deepEqual(result, wrong);
  const plain = await call("uiiq_ticket_scan", { code: "ABC123" }, [200, { ok: true, result: "ADMITTED" }]);
  assert.deepEqual(plain.requests[0].body, { code: "ABC123", undo: false });
});

test("the scan description names every result the route returns", () => {
  for (const r of ["ADMITTED", "SIGNED_OUT", "ALREADY", "ALREADY_OUT", "UNDONE", "SIGN_OUT_UNDONE", "VOID", "INVALID", "PIN_REQUIRED", "PIN_WRONG", "WRONG_PERFORMANCE"]) {
    assert.match(tools.uiiq_ticket_scan.description, new RegExp(`\\b${r}\\b`));
  }
});
