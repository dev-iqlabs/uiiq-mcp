// node --test — competition tools against a local stand-in for UIIQ
// (a throwaway HOME with a fake session, so no real login is read or sent).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs, { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  const base = `http://127.0.0.1:${server.address().port}`;
  home = mkdtempSync(join(tmpdir(), "uiiq-mcp-test-home-"));
  mkdirSync(join(home, ".uiiq"));
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "test", cookieName: "authjs.session-token" }));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.UIIQ_BASE = base;
  // Follow a stored impersonation (reads only: UIIQ_MCP_INHERIT_WRITE stays unset),
  // so the dry run's "acting in" can be checked against one (Lucas, #97 L-b).
  process.env.UIIQ_MCP_INHERIT_IMPERSONATION = "1";
  delete process.env.UIIQ_MCP_INHERIT_WRITE;
  // Imported only now: auth.js and config.js read HOME and UIIQ_BASE at load.
  const { competitionTools } = await import("../src/tools/competitions.js");
  tools = Object.fromEntries(competitionTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, response = [200, { ok: true }]) {
  reply = () => response;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

test("every tool is named uiiq_competition_* and describes itself", () => {
  for (const [name, t] of Object.entries(tools)) {
    assert.match(name, /^uiiq_competition_[a-z_]+$/);
    assert.ok(t.description.length > 20, name);
    assert.equal(t.inputSchema.type, "object", name);
  }
  assert.equal(Object.keys(tools).length, 18);
});

test("each tool calls its own route, with its own method and body", async () => {
  const cases = [
    ["uiiq_competition_list", {}, "GET", "/competitions", undefined],
    ["uiiq_competition_get", { id: "c1" }, "GET", "/competitions/c1", undefined],
    ["uiiq_competition_create", { name: "Coin of the Week", slug: "coin-of-the-week", type: "NOMINATION" }, "POST", "/competitions", { name: "Coin of the Week", slug: "coin-of-the-week", type: "NOMINATION" }],
    ["uiiq_competition_update", { id: "c1", status: "ACTIVE" }, "PATCH", "/competitions/c1", { status: "ACTIVE" }],
    ["uiiq_competition_round_update", { id: "c1", roundId: "r1", theme: "Bonfire" }, "PATCH", "/competitions/c1/rounds/r1", { theme: "Bonfire" }],
    ["uiiq_competition_round_decide", { id: "c1", roundId: "r1", winnerEntryId: "e1", confirm: true }, "POST", "/competitions/c1/rounds/r1/decide", { winnerEntryId: "e1" }],
    ["uiiq_competition_round_decide", { id: "c1", roundId: "r1", winnerEntryId: "e1", runnerUpEntryIds: ["e2"], confirm: true }, "POST", "/competitions/c1/rounds/r1/decide", { winnerEntryId: "e1", runnerUpEntryIds: ["e2"] }],
    ["uiiq_competition_entries", { id: "c1", roundId: "r1", status: "NEW" }, "GET", "/competitions/c1/entries?roundId=r1&status=NEW", undefined],
    ["uiiq_competition_entries", { id: "c1" }, "GET", "/competitions/c1/entries", undefined],
    ["uiiq_competition_entry_get", { entryId: "e1" }, "GET", "/competitions/entries/e1", undefined],
    ["uiiq_competition_entry_update", { entryId: "e1", scores: { story: 8 } }, "PATCH", "/competitions/entries/e1", { scores: { story: 8 } }],
    ["uiiq_competition_nominee_confirm", { entryId: "e1", answeredBy: "nominee", how: "phone", items: {} }, "POST", "/competitions/entries/e1/nominee-confirmation", { answeredBy: "nominee", how: "phone", items: {} }],
    ["uiiq_competition_entry_erase", { entryId: "e1", confirm: true }, "DELETE", "/competitions/entries/e1", undefined],
    ["uiiq_competition_erase_address", { email: "jo@example.com", confirm: true }, "POST", "/competitions/erase", { email: "jo@example.com" }],
    ["uiiq_competition_post_draft", { id: "c1", roundId: "r1", stage: "shortlist" }, "POST", "/competitions/c1/rounds/r1/posts/shortlist", undefined],
    ["uiiq_competition_round_posts", { id: "c1", roundId: "r1" }, "GET", "/competitions/c1/rounds/r1/posts", undefined],
    ["uiiq_competition_post_taken_down", { id: "c1", roundId: "r1", stage: "winner", confirm: true }, "PATCH", "/competitions/c1/rounds/r1/posts/winner", { takenDown: true }],
    ["uiiq_competition_prize_get", { entryId: "e1" }, "GET", "/competitions/entries/e1/prize", undefined],
    ["uiiq_competition_prize_issue", { entryId: "e1" }, "POST", "/competitions/entries/e1/prize", undefined],
    ["uiiq_competition_update", { id: "c1", prizeAction: "COUPON", prizeSiteId: "site_uc", prizeWinner: { percent: 100, categoryIds: [31], productIds: [], expiryDays: 30 } }, "PATCH", "/competitions/c1", { prizeAction: "COUPON", prizeSiteId: "site_uc", prizeWinner: { percent: 100, categoryIds: [31], productIds: [], expiryDays: 30 } }],
  ];
  for (const [name, args, method, path, body] of cases) {
    const { requests } = await call(name, args);
    assert.equal(requests.length, 1, name);
    assert.equal(requests[0].method, method, name);
    assert.equal(requests[0].path, path, name);
    assert.deepEqual(requests[0].body, body, name);
  }
});

test("only the routes UiiQ has: posts only as drafts, nothing publishes or schedules; prizes read and issued", () => {
  const names = Object.keys(tools);
  assert.deepEqual(names.filter((n) => /publish|schedule/.test(n)), []);
  assert.deepEqual(names.filter((n) => /post/.test(n)).sort(), ["uiiq_competition_post_draft", "uiiq_competition_post_taken_down", "uiiq_competition_round_posts"]);
  assert.deepEqual(names.filter((n) => /prize/.test(n)).sort(), ["uiiq_competition_prize_get", "uiiq_competition_prize_issue"]);
  for (const name of ["uiiq_competition_create", "uiiq_competition_update"]) {
    for (const k of ["prizeAction", "prizeSiteId", "prizeWinner", "prizeRunnerUp"]) assert.ok(tools[name].inputSchema.properties?.[k], `${name} ${k}`);
  }
});

test("deciding and erasing are dry runs until confirm: true, and send nothing (Lucas, #97 M1)", async () => {
  const dry = [
    ["uiiq_competition_round_decide", { id: "c1", roundId: "r1", winnerEntryId: "e1", runnerUpEntryIds: ["e2"] }, { wouldDo: "decide_round", competitionId: "c1", roundId: "r1", winnerEntryId: "e1", runnerUpEntryIds: ["e2"] }],
    ["uiiq_competition_entry_erase", { entryId: "e1", tenant: "ultimatecoins" }, { wouldDo: "erase_entry", entryId: "e1", tenant: "ultimatecoins" }],
    ["uiiq_competition_erase_address", { email: "jo@example.com" }, { wouldDo: "erase_address", email: "jo@example.com", tenant: "your own workspace" }],
  ];
  for (const [name, args, expected] of dry) {
    for (const confirm of [undefined, false, "true", 1]) {
      const { result, requests } = await call(name, { ...args, confirm });
      assert.equal(requests.length, 0, `${name} confirm=${confirm}`);
      assert.equal(result.dryRun, true, name);
      assert.equal(result.changed, false, name);
      assert.match(result.note, /Nothing was changed.*confirm: true/, name);
      for (const [k, v] of Object.entries(expected)) assert.deepEqual(result[k], v, `${name} ${k}`);
    }
    assert.ok(tools[name].inputSchema.properties.confirm, name);
  }
});

test("the dry run names an inherited impersonation, and says when its write would be refused (Lucas, #97 L-b)", async () => {
  const creds = join(home, ".uiiq", "credentials.json");
  const plain = { base: process.env.UIIQ_BASE, sessionToken: "test", cookieName: "authjs.session-token" };
  const imp = (writeEnabled) => ({ cookie: "uiiq-impersonation=x", tenantName: "Ultimate Coins", tenantSlug: "ultimatecoins", writeEnabled, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
  try {
    writeFileSync(creds, JSON.stringify({ ...plain, impersonation: imp(false) }));
    let r = await call("uiiq_competition_erase_address", { email: "jo@example.com" });
    assert.equal(r.result.tenant, "Ultimate Coins (inherited impersonation)");
    writeFileSync(creds, JSON.stringify({ ...plain, impersonation: imp(true) }));
    r = await call("uiiq_competition_round_decide", { id: "c1", roundId: "r1", winnerEntryId: "e1" });
    assert.match(r.result.tenant, /^Ultimate Coins \(inherited; the change would be refused without UIIQ_MCP_INHERIT_WRITE=1\)$/);
    // A tenant named on the call wins.
    r = await call("uiiq_competition_entry_erase", { entryId: "e1", tenant: "sbda" });
    assert.equal(r.result.tenant, "sbda");
    assert.equal(r.requests.length, 0);
  } finally {
    writeFileSync(creds, JSON.stringify(plain));
  }
});

test("runners-up must be a list: a string is refused, never walked letter by letter (Lucas, #97 L-a)", async () => {
  seen = [];
  await assert.rejects(tools.uiiq_competition_round_decide.handler({ id: "c1", roundId: "r1", winnerEntryId: "e1", runnerUpEntryIds: "e2", confirm: true }), /runnerUpEntryIds must be a list/);
  assert.equal(seen.length, 0);
});

test("ids must be ids: no empty, dot or slashed segment reaches a route (Lucas, #97 L1)", async () => {
  for (const bad of ["", ".", "..", "a/b", "c 1", "%2e%2e", "x".repeat(65), undefined, 7]) {
    for (const [name, args] of [
      ["uiiq_competition_get", { id: bad }],
      ["uiiq_competition_round_update", { id: "c1", roundId: bad }],
      ["uiiq_competition_entry_get", { entryId: bad }],
      ["uiiq_competition_entries", { id: "c1", roundId: bad }],
      ["uiiq_competition_round_decide", { id: "c1", roundId: "r1", winnerEntryId: bad, confirm: true }],
      ["uiiq_competition_round_decide", { id: "c1", roundId: "r1", winnerEntryId: "e1", runnerUpEntryIds: [bad], confirm: true }],
      ["uiiq_competition_entry_erase", { entryId: bad, confirm: true }],
    ]) {
      if (name === "uiiq_competition_entries" && (bad === "" || bad === undefined)) continue; // no roundId = every round
      seen = [];
      await assert.rejects(tools[name].handler(args), /must be an id/, `${name} ${String(bad)}`);
      assert.equal(seen.length, 0, `${name} ${String(bad)}`);
    }
  }
});

test("the entries list carries no entrant details, reasons or photo links (Lucas, #97 L3)", async () => {
  const row = {
    id: "e1", roundId: "r1", entrantName: "Jo Bloggs", entrantEmail: "jo@example.com", nomineeFirstName: "Sam", reason: "Kind", photoUrl: "https://signed",
    consents: {}, status: "NEW", confirmedAt: "2026-11-03T10:00:00Z", nomineeConsent: {}, nomineeConfirmed: null, scores: {}, notes: "n", receivedAt: "2026-11-03T09:00:00Z",
    weightedScore: 7.5, publishable: { firstName: false, quote: false, photo: false },
  };
  const { result } = await call("uiiq_competition_entries", { id: "c1" }, [200, [row]]);
  assert.deepEqual(result, [{ id: "e1", roundId: "r1", nomineeFirstName: "Sam", status: "NEW", weightedScore: 7.5, receivedAt: "2026-11-03T09:00:00Z", publishable: { firstName: false, quote: false, photo: false } }]);
});

test("an erasure that kept entries says so, whichever way UiiQ answers", async () => {
  let r = await call("uiiq_competition_erase_address", { email: "jo@example.com", confirm: true }, [200, { erased: 1, photosDeleted: 0, kept: 1 }]);
  assert.match(r.result.warning, /1 entry was kept/);
  r = await call("uiiq_competition_erase_address", { email: "jo@example.com", confirm: true }, [200, { erased: 2, photosDeleted: 1, kept: 0 }]);
  assert.equal(r.result.warning, undefined);
  await assert.rejects(
    call("uiiq_competition_erase_address", { email: "jo@example.com", confirm: true }, [503, { error: "1 entry was kept.", erased: 1, kept: ["e9"] }]),
    /Erased 1; kept e9/,
  );
  // As #950 answers, without the ids: UiiQ's own words.
  await assert.rejects(
    call("uiiq_competition_entry_erase", { entryId: "e1", confirm: true }, [503, { error: "Its photo couldn't be deleted, so the entry was kept. Try again shortly." }]),
    /Its photo couldn't be deleted/,
  );
});

test("every route path is a plain template, so UiiQ's client-coverage scan reads it whole", () => {
  const src = fs.readFileSync(new URL("../src/tools/competitions.js", import.meta.url), "utf8");
  const paths = [...src.matchAll(/`(\/competitions[^`]*)`/g)].map((m) => m[1]);
  assert.ok(paths.length >= 9, String(paths.length));
  for (const path of paths) assert.doesNotMatch(path, /"/, path);
});

test("rounds: one round, or weekly with themes", async () => {
  let r = await call("uiiq_competition_rounds_add", { id: "c1", theme: "Remembrance", opensAt: "2026-11-02T00:00:00Z", closesAt: "2026-11-06T18:00:00Z" });
  assert.deepEqual(r.requests[0], { method: "POST", path: "/competitions/c1/rounds", body: { round: { theme: "Remembrance", opensAt: "2026-11-02T00:00:00Z", closesAt: "2026-11-06T18:00:00Z" } } });
  r = await call("uiiq_competition_rounds_add", { id: "c1", opensAt: "2026-11-02T00:00:00Z", closesAt: "2026-11-06T18:00:00Z", weeks: 4, themes: ["A", "B"] });
  assert.deepEqual(r.requests[0].body, { weekly: { first: { opensAt: "2026-11-02T00:00:00Z", closesAt: "2026-11-06T18:00:00Z" }, count: 4, themes: ["A", "B"] } });
});

test("the nominee confirmation sends exactly what was agreed, all four items", async () => {
  const items = { publishFirstName: true, publishReason: true, publishPhoto: false, publishDelivery: false };
  const r = await call("uiiq_competition_nominee_confirm", { entryId: "e1", answeredBy: "guardian", how: "in-person", items, note: "At the handover" });
  assert.deepEqual(r.requests[0], { method: "POST", path: "/competitions/entries/e1/nominee-confirmation", body: { answeredBy: "guardian", how: "in-person", items, note: "At the handover" } });
  assert.deepEqual(tools.uiiq_competition_nominee_confirm.inputSchema.properties.items.required, ["publishFirstName", "publishReason", "publishPhoto", "publishDelivery"]);
});

test("UiiQ's refusal comes back as its own words", async () => {
  await assert.rejects(
    call("uiiq_competition_round_decide", { id: "c1", roundId: "r1", winnerEntryId: "e1", confirm: true }, [409, { error: "A round is decided after it closes" }]),
    /A round is decided after it closes/,
  );
});

test("a round's posts: a draft by stage, never another stage; clearing a mark is a dry run until confirm: true", async () => {
  await assert.rejects(() => tools.uiiq_competition_post_draft.handler({ id: "c1", roundId: "r1", stage: "delivery" }), /stage must be one of call, shortlist, winner/);
  await assert.rejects(() => tools.uiiq_competition_post_taken_down.handler({ id: "c1", roundId: "r1", stage: "call", confirm: true }), /stage must be one of shortlist, winner/);
  // Only confirm: true clears it; anything else is the dry run (uiiq-mcp #98 Low).
  for (const confirm of [undefined, false, "true", 1]) {
    const { result, requests } = await call("uiiq_competition_post_taken_down", { id: "c1", roundId: "r1", stage: "shortlist", ...(confirm === undefined ? {} : { confirm }) });
    assert.equal(requests.length, 0, String(confirm));
    assert.equal(result.dryRun, true, String(confirm));
    assert.equal(result.wouldDo, "clear_post_mark");
    assert.match(result.note, /Nothing was changed/);
  }
});

test("the form numbers aren't sent: UiiQ reads them from the links (UiiQ-platform #954)", () => {
  for (const name of ["uiiq_competition_create", "uiiq_competition_update"]) {
    const props = tools[name].inputSchema.properties;
    assert.equal(props.entryFormId, undefined, name);
    assert.equal(props.consentFormId, undefined, name);
    assert.match(props.entryFormUrl.description, /data\?form-id=<number>/, name);
  }
});

test("a prize entry id must be an id: nothing else reaches the route", async () => {
  for (const name of ["uiiq_competition_prize_get", "uiiq_competition_prize_issue"]) {
    for (const bad of ["", "..", "e1/../../x"]) await assert.rejects(() => tools[name].handler({ entryId: bad }), /must be an id/, `${name} ${bad}`);
  }
});
