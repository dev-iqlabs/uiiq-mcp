// node --test — closing ONE of an event's performances (UiiQ-platform events
// and tickets 3/6).
//
// The thing this tool must not misdescribe: a night closed HERE is the office's
// decision and a later uiiq_event_tickets_on leaves it shut, where a night
// closed by the switch-off comes back. The two tickets tools used to promise
// the opposite — that switching on reopens every closed performance, hand-closed
// ones included — which was true when they were written and is not any more. A
// tool description is all an agent has to go on, so a stale one is worse than a
// missing one.
import "./isolate-home.js"; // first: no real login, nothing reaches UIIQ (Lucas, #97)
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventsTools } from "../src/tools/events.js";

const tool = (name) => eventsTools.find((t) => t.name === name);

test("the tool exists, takes an event, a performance and close/open", () => {
  const t = tool("uiiq_event_performance_set");
  assert.ok(t, "uiiq_event_performance_set is missing");
  assert.deepEqual(t.inputSchema.required, ["id", "performanceId", "action"]);
  assert.deepEqual(t.inputSchema.properties.action.enum, ["close", "open"]);
  assert.ok("confirm" in t.inputSchema.properties);
});

test("it is a dry run without confirm, and calls nothing", async () => {
  const t = tool("uiiq_event_performance_set");
  assert.match(t.description, /Without confirm: true it is ALWAYS a dry run/);
  for (const action of ["close", "open"]) {
    const out = await t.handler({ id: "ev_hoedown", performanceId: "ses_1", action });
    assert.equal(out.dryRun, true);
    assert.equal(out.changed, false);
    assert.equal(out.performanceId, "ses_1");
    assert.equal(out.wouldDo, action === "close" ? "close_performance" : "open_performance");
  }
});

test("the dry run says what survives a close, which is the question being asked", async () => {
  const out = await tool("uiiq_event_performance_set")
    .handler({ id: "ev_hoedown", performanceId: "ses_1", action: "close" });
  assert.match(out.note, /seats already sold keep their tickets/i);
});

test("a bad action is refused before anything is called", async () => {
  await assert.rejects(
    () => tool("uiiq_event_performance_set").handler({ id: "ev_1", performanceId: "ses_1", action: "cancel" }),
    /action must be 'close' or 'open'/,
  );
});

test("the description says a hand-closed night is NOT reopened by switching sales on", () => {
  // The whole reason the column exists on the UiiQ side.
  assert.match(
    tool("uiiq_event_performance_set").description,
    /uiiq_event_tickets_on leaves it shut/,
  );
});

test("cancelling is named as NOT being here, so nobody reaches for it", () => {
  assert.match(tool("uiiq_event_performance_set").description, /CANCELLING a performance is not here/);
});

test("the refusals are described, so a 409 is not a surprise", () => {
  const d = tool("uiiq_event_performance_set").description;
  assert.match(d, /CANCELLED performance/);
  assert.match(d, /already finished/);
  assert.match(d, /switched off/);
  assert.match(d, /no-op, not an error/);
});

// The two descriptions my UiiQ change made untrue.
test("uiiq_event_tickets_on no longer claims it reopens a hand-closed night", () => {
  const d = tool("uiiq_event_tickets_on").description;
  assert.match(d, /reopens ONLY the performances that switch-off closed/);
  assert.match(d, /stays shut, as does one whose date has passed/);
  assert.doesNotMatch(d, /also reopens one the office had closed by hand/);
});

test("its dry-run note says the same", async () => {
  const out = await tool("uiiq_event_tickets_on").handler({ id: "ev_hoedown" });
  assert.equal(out.dryRun, true);
  assert.match(out.note, /not ones closed by hand, and not ones already over/);
});

test("uiiq_event_tickets_off points at the per-performance tool and drops the old promise", () => {
  const d = tool("uiiq_event_tickets_off").description;
  assert.match(d, /use uiiq_event_performance_set/);
  assert.doesNotMatch(d, /reopening any performance left CLOSED/);
});
