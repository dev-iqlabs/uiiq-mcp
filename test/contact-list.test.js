// node --test — uiiq_contact_list's filters for newsletter sign-ups (#995 A8):
// source, subscribed and tag reach GET /contacts as the API reads them, and
// nothing is sent for a filter left out. Against a local stand-in for UIIQ
// (a throwaway HOME with a fake session).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, seen, tools;
const ROWS = [{ id: "c1", email: "sam@example.com", tags: ["newsletter"], subscribed: true, source: "website_signup" }];

before(async () => {
  server = http.createServer((req, res) => {
    seen.push(req.url.replace(/^\/api/, ""));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(ROWS));
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
  const { contactTools } = await import("../src/tools/contact.js");
  tools = Object.fromEntries(contactTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function list(args) {
  seen = [];
  const result = await tools.uiiq_contact_list.handler(args);
  return { result, url: new URL(`http://x${seen[0]}`) };
}

test("source, subscribed and tag go to GET /contacts as the API reads them, and the rows come back with their source", async () => {
  const { result, url } = await list({ source: "website_signup", subscribed: true, tag: "newsletter", search: "sam" });
  assert.equal(url.pathname, "/contacts");
  assert.deepEqual(Object.fromEntries(url.searchParams), { limit: "50", q: "sam", source: "website_signup", subscribed: "true", tag: "newsletter" });
  assert.deepEqual(result, ROWS);
});

test("subscribed false is sent; filters left out are not", async () => {
  assert.equal((await list({ subscribed: false })).url.searchParams.get("subscribed"), "false");
  const { url } = await list({});
  assert.deepEqual([...url.searchParams.keys()], ["limit"]);
});

// ── Tags: several, contacts with EVERY one (UiiQ-platform feat/contact-source-tags, Lucas R132) ──
const COMP = "Competition: Coin of the Week";
const ROUND = "Coin of the Week, round 1";

test("one tag in tags: a single tag=, encoded (a colon, spaces)", async () => {
  const { url } = await list({ tags: [COMP] });
  assert.deepEqual(url.searchParams.getAll("tag"), [COMP]);
  assert.match(url.search, /[?&]tag=Competition%3A\+Coin\+of\+the\+Week(&|$)/);
});

test("several tags: tag= repeated in order, each encoded (a comma, a colon, an ampersand), never joined into one", async () => {
  const odd = "Fish & chips #1";
  const { result, url } = await list({ tags: [COMP, ROUND, odd] });
  assert.deepEqual(url.searchParams.getAll("tag"), [COMP, ROUND, odd]);
  assert.ok(url.search.includes("tag=Competition%3A+Coin+of+the+Week&tag=Coin+of+the+Week%2C+round+1&tag=Fish+%26+chips+%231"), url.search);
  assert.deepEqual(result, ROWS);
});

test("tag and tags together: tag first; trimmed, blanks and repeats dropped, as UiiQ reads them", async () => {
  const { url } = await list({ tag: "newsletter", tags: [` ${COMP} `, "", "newsletter", COMP, "  "] });
  assert.deepEqual(url.searchParams.getAll("tag"), ["newsletter", COMP]);
});

test("more than UiiQ reads (10), or tags that aren't text: refused before anything is sent", async () => {
  const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
  for (const [args, why] of [[{ tags: eleven }, /^At most 10 tags: UiiQ reads no more\. Nothing was sent\.$/], [{ tag: "x", tags: eleven.slice(1) }, /At most 10 tags/], [{ tags: "a,b" }, /tags is a list/], [{ tags: [COMP, 7] }, /tags is a list/]]) {
    seen = [];
    await assert.rejects(tools.uiiq_contact_list.handler(args), (e) => why.test(e.message));
    assert.deepEqual(seen, []);
  }
  const { url } = await list({ tags: eleven.slice(1) });
  assert.equal(url.searchParams.getAll("tag").length, 10);
});

test("an older UiiQ that ignores tag: the rows it sends come back, no error", async () => {
  // The stand-in reads no filter at all and answers its rows, as a UiiQ before the filter does.
  const { result } = await list({ tags: [COMP, ROUND] });
  assert.deepEqual(result, ROWS);
});

test("the description, schema and README: every tag must match, the competition's source tags, at most 10", () => {
  const t = tools.uiiq_contact_list;
  assert.ok(t.description.includes("tags: contacts with EVERY one of them (all must match, each as typed or in lower case; at most 10, with tag counted among them)."), t.description);
  assert.ok(t.description.includes('A competition tags each contact it makes or matches with its source tags, "Competition: <competition name>" and "<competition name>, round <n>", e.g. tags ["Competition: Coin of the Week", "Coin of the Week, round 1"].'), t.description);
  assert.ok(t.description.includes("A UiiQ before contact source tags reads only the first tag, so there several give everyone with the first."), t.description);
  assert.deepEqual(t.inputSchema.properties.tags, { type: "array", items: { type: "string" }, maxItems: 10, description: t.inputSchema.properties.tags.description });
  assert.match(t.inputSchema.properties.tags.description, /EVERY one of these tags \(sent as repeated tag\)/);
  const row = readFileSync(new URL("../README.md", import.meta.url), "utf8").split("\n").find((l) => l.startsWith("| `uiiq_contact_list` |"));
  assert.match(row, /`tags` \(contacts with EVERY one, sent as repeated `tag`, at most 10\)/);
  assert.match(row, /"Competition: <competition name>" and "<competition name>, round <n>"/);
});
