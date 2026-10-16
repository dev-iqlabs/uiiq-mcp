// node --test — uiiq_contact_list's filters for newsletter sign-ups (#995 A8):
// source, subscribed and tag reach GET /contacts as the API reads them, and
// nothing is sent for a filter left out. Against a local stand-in for UIIQ
// (a throwaway HOME with a fake session).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
