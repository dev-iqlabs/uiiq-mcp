// node --test — the office's ticket tools and early access (UiiQ-platform
// events and tickets 6/6 and 3): the door list, free tickets (comps),
// cancelling a free booking, reissuing a booking's tickets, and an event's
// early-access settings. Against a local stand-in for UIIQ (a throwaway HOME
// with a fake session, so no real login is read or sent anywhere).
//
// What these hold still: names on tickets never reach this client, even if
// UiiQ sent them (they can be children's; UiiQ leaves them out for the MCP);
// every write is a dry run without confirm: true and calls nothing; and the
// presale code is UiiQ's to make: it is never sent from here.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, replies, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, data, headers = {}] = replies.length > 1 ? replies.shift() : replies[0];
      // A string is sent as it is (the CSV, or a proxy's error page).
      res.writeHead(status, { "content-type": typeof data === "string" ? "text/csv; charset=utf-8" : "application/json", ...headers });
      res.end(typeof data === "string" ? data : JSON.stringify(data));
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
  const { eventsTools } = await import("../src/tools/events.js");
  tools = Object.fromEntries(eventsTools.map((t) => [t.name, t]));
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
async function refused(name, args, pattern) {
  replies = [[500, { error: "nothing should have been called" }]];
  seen = [];
  await assert.rejects(() => tools[name].handler(args), pattern);
  assert.deepEqual(seen, [], `${name} called UiiQ before refusing`);
}

const EV = "/events/ev_hoedown/tickets";

// ─── The door list ───────────────────────────────────────────

const ROW = {
  id: "bk_1", reference: "SB-1001", buyerName: "Ann Adult", comp: false,
  tickets: [{ type: "Adult", quantity: 2 }], attendees: [],
  ticketCount: 2, admitted: 1, signedOut: 0, refundablePence: 2400, cancellable: false, hasEmail: true,
};
const LIST = {
  performance: { id: "ses_sat", label: "Sat 20 Feb, 7pm", capacity: 120, booked: 2, status: "OPEN" },
  bookings: [ROW],
  totals: { bookings: 1, tickets: 2, admitted: 1 },
  attendeeNamesWithheld: true,
};

test("the tools exist with the inputs the routes take", () => {
  assert.deepEqual(tools.uiiq_event_door_list.inputSchema.required, ["id", "performanceId"]);
  assert.deepEqual(tools.uiiq_event_comp_issue.inputSchema.required, ["id", "performanceId", "ticketTypeId", "quantity", "name"]);
  assert.deepEqual(tools.uiiq_event_booking_cancel.inputSchema.required, ["id", "bookingId"]);
  assert.deepEqual(tools.uiiq_event_tickets_reissue.inputSchema.required, ["id", "bookingId"]);
  assert.deepEqual(tools.uiiq_event_early_access_set.inputSchema.required, ["id"]);
  for (const t of ["uiiq_event_comp_issue", "uiiq_event_booking_cancel", "uiiq_event_tickets_reissue", "uiiq_event_early_access_set"]) {
    assert.ok("confirm" in tools[t].inputSchema.properties, `${t} has no confirm`);
    assert.match(tools[t].description, /Without confirm: true it is ALWAYS a dry run/, t);
  }
  const ea = tools.uiiq_event_early_access_set.inputSchema.properties;
  for (const k of ["on", "group", "startsAt", "publicSaleAt", "cap", "newCode"]) assert.ok(k in ea, `${k} missing`);
  assert.deepEqual(ea.group.enum, ["FAMILIES", "CODE"]);
  assert.equal("presaleCode" in ea, false);
  assert.equal("code" in ea, false);
});

test("door list: GET the performance's attendees, and the names on tickets are withheld", async () => {
  const { result, requests } = await call("uiiq_event_door_list", { id: "ev_hoedown", performanceId: "ses_sat" }, [200, LIST]);
  assert.deepEqual(requests, [{ method: "GET", path: `${EV}/attendees?performanceId=ses_sat` }]);
  assert.deepEqual(result, LIST);
  assert.match(tools.uiiq_event_door_list.description, /NAMES ON TICKETS ARE NEVER HERE/);
});

test("door list: names UiiQ sent anyway are dropped, and the rest comes through", async () => {
  const leaked = { ...LIST, bookings: [{ ...ROW, attendees: [{ name: "CHILD NAME", type: "Child", admitted: false }] }], attendeeNamesWithheld: false };
  const { result } = await call("uiiq_event_door_list", { id: "ev_hoedown", performanceId: "ses_sat" }, [200, leaked]);
  assert.deepEqual(result, LIST);
  assert.doesNotMatch(JSON.stringify(result), /CHILD NAME/);
});

const HEADER = "Reference,Name,Email,Tickets,Names on tickets,Checked in,Comp";
const csvOf = (names) =>
  [HEADER,
    `SB-1001,Ann Adult,ann@example.test,2 × Adult,${names[0]},1 of 2 in,`,
    `SB-1002,"Smith, Bo",'=bo@example.test,1 × Guest,${names[1]},Not in yet,Yes`,
    `SB-1003,"Jo ""JJ"" Lee",,"1 × Adult, 1 × Child",${names[2]},No tickets issued,`,
  ].join("\r\n") + "\r\n";
const DISPOSITION = { "content-disposition": 'attachment; filename="door-list-hoedown-2027-02-20.csv"' };

test("door list csv: &format=csv, UiiQ's spreadsheet byte for byte when its names column is empty", async () => {
  const sent = csvOf(["", "", ""]);
  const { result, requests } = await call("uiiq_event_door_list", { id: "ev_hoedown", performanceId: "ses_sat", format: "csv" }, [200, sent, DISPOSITION]);
  assert.deepEqual(requests, [{ method: "GET", path: `${EV}/attendees?performanceId=ses_sat&format=csv` }]);
  assert.deepEqual(result, { filename: "door-list-hoedown-2027-02-20.csv", csv: sent });
});

test("door list csv: names on tickets UiiQ sent anyway are emptied, every other cell as it was", async () => {
  const { result } = await call(
    "uiiq_event_door_list",
    { id: "ev_hoedown", performanceId: "ses_sat", format: "csv" },
    [200, csvOf(["Kid One; Kid Two", '"Kid, Three"', "Kid Four"]), DISPOSITION],
  );
  assert.equal(result.csv, csvOf(["", "", ""]));
  assert.doesNotMatch(result.csv, /Kid/);
});

test("door list csv: savePath writes the file; savePath without csv is refused first", async () => {
  const path = join(home, "door.csv");
  const { result } = await call("uiiq_event_door_list", { id: "ev_hoedown", performanceId: "ses_sat", format: "csv", savePath: path }, [200, csvOf(["Kid", "", ""]), DISPOSITION]);
  assert.equal(result.saved, path);
  assert.equal(readFileSync(path, "utf8"), csvOf(["", "", ""]));
  await refused("uiiq_event_door_list", { id: "ev_hoedown", performanceId: "ses_sat", savePath: path }, /savePath goes with format: 'csv'/);
});

// ─── Comps ───────────────────────────────────────────────────

const COMP = { id: "ev_hoedown", performanceId: "ses_sat", ticketTypeId: "tt_guest", quantity: 2, name: "Press: Hull Daily Mail" };

test("comp, no confirm: a dry run that calls nothing and says how many", async () => {
  const { result, requests } = await call("uiiq_event_comp_issue", COMP);
  assert.deepEqual(requests, []);
  assert.equal(result.dryRun, true);
  assert.equal(result.changed, false);
  assert.equal(result.wouldDo, "give_free_tickets");
  assert.equal(result.quantity, 2);
  assert.match(result.note, /gives away 2 free tickets/);
});

test("comp, confirmed: one POST to the comps route with exactly the route's body", async () => {
  const { result, requests } = await call(
    "uiiq_event_comp_issue",
    { ...COMP, email: "desk@example.test", sendEmail: true, confirm: true },
    [201, { id: "bk_c1", reference: "SB-2001", seats: 2, emailed: true }],
  );
  assert.deepEqual(requests, [{
    method: "POST",
    path: `${EV}/comps`,
    body: { performanceId: "ses_sat", ticketTypeId: "tt_guest", quantity: 2, name: "Press: Hull Daily Mail", email: "desk@example.test", sendEmail: true },
  }]);
  assert.deepEqual(result, { id: "bk_c1", reference: "SB-2001", seats: 2, emailed: true });
});

test("comp: no email means sendEmail false and no email key", async () => {
  const { requests } = await call("uiiq_event_comp_issue", { ...COMP, confirm: true }, [201, { id: "bk_c2", reference: "SB-2002", seats: 2, emailed: false }]);
  assert.deepEqual(requests[0].body, { performanceId: "ses_sat", ticketTypeId: "tt_guest", quantity: 2, name: "Press: Hull Daily Mail", sendEmail: false });
});

test("comp: a bad quantity, or sendEmail with no address, is refused before anything is called", async () => {
  for (const quantity of [0, 51, 1.5, "2"]) await refused("uiiq_event_comp_issue", { ...COMP, quantity, confirm: true }, /quantity must be a whole number from 1 to 50/);
  await refused("uiiq_event_comp_issue", { ...COMP, sendEmail: true, confirm: true }, /sendEmail needs an email address/);
});

test("comp: UiiQ's refusal in its words, made printable", async () => {
  replies = [[409, { error: "Guest\u001b[31m tickets are for a‮ different performance." }]];
  seen = [];
  await assert.rejects(() => tools.uiiq_event_comp_issue.handler({ ...COMP, confirm: true }), (e) => {
    assert.match(e.message, /tickets are for a different performance/);
    assert.doesNotMatch(e.message, /[\u001b‮]/);
    return true;
  });
});

// ─── Cancel and reissue ──────────────────────────────────────

test("cancel, no confirm: a dry run that calls nothing and points a paid booking at the refund", async () => {
  const { result, requests } = await call("uiiq_event_booking_cancel", { id: "ev_hoedown", bookingId: "bk_c1" });
  assert.deepEqual(requests, []);
  assert.equal(result.dryRun, true);
  assert.equal(result.wouldDo, "cancel_free_booking");
  assert.match(result.note, /uiiq_booking_refund/);
});

test("cancel, confirmed: a POST to the booking's cancel route; a paid booking's refusal comes back", async () => {
  const { result, requests } = await call("uiiq_event_booking_cancel", { id: "ev_hoedown", bookingId: "bk_c1", confirm: true }, [200, { cancelled: true, reference: "SB-2001" }]);
  assert.deepEqual(requests, [{ method: "POST", path: `${EV}/bookings/bk_c1/cancel` }]);
  assert.deepEqual(result, { cancelled: true, reference: "SB-2001" });

  replies = [[409, { error: "This booking was paid for, so it's refunded rather than cancelled. Use Refund." }]];
  await assert.rejects(() => tools.uiiq_event_booking_cancel.handler({ id: "ev_hoedown", bookingId: "bk_paid", confirm: true }), /Use Refund/);
});

test("reissue, no confirm: a dry run that calls nothing", async () => {
  const { result, requests } = await call("uiiq_event_tickets_reissue", { id: "ev_hoedown", bookingId: "bk_1", email: true });
  assert.deepEqual(requests, []);
  assert.equal(result.dryRun, true);
  assert.equal(result.wouldDo, "reissue_tickets");
  assert.equal(result.wouldEmail, true);
  assert.match(result.note, /old link and every old QR code stop working/);
});

test("reissue, confirmed: POSTs { email } to the reissue route, and returns counts only", async () => {
  for (const email of [true, undefined]) {
    const { result, requests } = await call("uiiq_event_tickets_reissue", { id: "ev_hoedown", bookingId: "bk_1", email, confirm: true }, [200, { reissued: 2, emailed: email === true }]);
    assert.deepEqual(requests, [{ method: "POST", path: `${EV}/bookings/bk_1/reissue`, body: { email: email === true } }]);
    assert.deepEqual(result, { reissued: 2, emailed: email === true });
  }
  replies = [[429, { error: "These tickets have been emailed a few times in the last hour. Reissue them without emailing, or try later." }]];
  await assert.rejects(() => tools.uiiq_event_tickets_reissue.handler({ id: "ev_hoedown", bookingId: "bk_1", email: true, confirm: true }), /Reissue them without emailing/);
});

// ─── Early access ────────────────────────────────────────────

const CURRENT = { on: false, group: "CODE", startsAt: "2026-12-01T09:00:00.000Z", publicSaleAt: "2026-12-08T09:00:00.000Z", cap: 4, presaleCode: "ABCD-2345", phase: "OFF" };
const STATE = (earlyAccess) => ({ on: true, managed: true, live: true, earlyAccess, performingClasses: 0, experience: null });
const EA_FIELDS = ["on", "group", "startsAt", "publicSaleAt", "cap"];

test("early access, no confirm: reads the event only, and shows what would change", async () => {
  const { result, requests } = await call("uiiq_event_early_access_set", { id: "ev_hoedown", on: true, cap: 6 }, [200, STATE(CURRENT)]);
  assert.deepEqual(requests, [{ method: "GET", path: EV }]);
  assert.equal(result.dryRun, true);
  assert.equal(result.wouldDo, "set_early_access");
  assert.deepEqual(result.from, { on: false, group: "CODE", startsAt: CURRENT.startsAt, publicSaleAt: CURRENT.publicSaleAt, cap: 4 });
  assert.deepEqual(result.to, { on: true, group: "CODE", startsAt: CURRENT.startsAt, publicSaleAt: CURRENT.publicSaleAt, cap: 6 });
});

test("early access, confirmed: only what is given changes; the rest is sent as the event has it", async () => {
  const saved = STATE({ ...CURRENT, on: true, phase: "BEFORE" });
  const { result, requests } = await call("uiiq_event_early_access_set", { id: "ev_hoedown", on: true, confirm: true }, [200, STATE(CURRENT)], [200, saved]);
  assert.deepEqual(requests, [
    { method: "GET", path: EV },
    { method: "PATCH", path: `${EV}/early-access`, body: { on: true, group: "CODE", startsAt: CURRENT.startsAt, publicSaleAt: CURRENT.publicSaleAt, cap: 4 } },
  ]);
  assert.deepEqual(result, saved);
});

test("early access: null clears the cap; newCode asks UiiQ for a fresh code", async () => {
  const { requests } = await call("uiiq_event_early_access_set", { id: "ev_hoedown", cap: null, newCode: true, confirm: true }, [200, STATE(CURRENT)], [200, STATE(CURRENT)]);
  assert.deepEqual(requests[1].body, { on: false, group: "CODE", startsAt: CURRENT.startsAt, publicSaleAt: CURRENT.publicSaleAt, cap: null, newCode: true });
});

test("early access: the presale code is never sent from here, and asking to set one is refused first", async () => {
  for (const extra of [{ presaleCode: "MYCODE22" }, { code: "MYCODE22" }]) {
    await refused("uiiq_event_early_access_set", { id: "ev_hoedown", on: true, ...extra, confirm: true }, /The presale code is made by UiiQ, never sent/);
  }
  // Every body that does go: the five settings and, at most, newCode.
  for (const args of [{ on: true }, { group: "FAMILIES", startsAt: "2026-11-01T09:00:00.000Z" }, { newCode: true }]) {
    const { requests } = await call("uiiq_event_early_access_set", { id: "ev_hoedown", ...args, confirm: true }, [200, STATE(CURRENT)], [200, STATE(CURRENT)]);
    const keys = Object.keys(requests[1].body).sort();
    assert.deepEqual(keys, [...EA_FIELDS, ...(args.newCode ? ["newCode"] : [])].sort());
    assert.doesNotMatch(JSON.stringify(requests[1].body), /ABCD|2345|presale/i);
  }
});

test("early access: nothing to change is refused before any call; no settings from UiiQ changes nothing", async () => {
  await refused("uiiq_event_early_access_set", { id: "ev_hoedown", confirm: true }, /Send on, group, startsAt, publicSaleAt, cap or newCode/);
  replies = [[200, STATE(undefined)]];
  seen = [];
  await assert.rejects(() => tools.uiiq_event_early_access_set.handler({ id: "ev_hoedown", on: true, confirm: true }), /didn't send this event's early-access settings/);
  assert.deepEqual(seen, [{ method: "GET", path: EV }]);
});

test("early access: the description says the code is generated and can't be set", () => {
  const d = tools.uiiq_event_early_access_set.description;
  assert.match(d, /THE PRESALE CODE IS GENERATED BY UIIQ/);
  assert.match(d, /a code can never be set from here/);
  assert.match(d, /Only what you give changes/);
});
