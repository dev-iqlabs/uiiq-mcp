// node --test — embedOrigins on uiiq_nx2u_channel_create and uiiq_nx2u_channel_update, against a local stand-in for
// UIIQ (a throwaway HOME with a fake session, so no real login is read or sent). UiiQ saves the list as the watch
// page's frame-ancestors (lib/nx2u/validate.ts parseEmbedOrigins, embed-origin.ts), so each origin must be exact and
// a bad one is refused here before anything is sent: the same check as the CLI's --embed-origins.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools;

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
  const { nx2uTools } = await import("../src/tools/nx2u.js");
  tools = Object.fromEntries(nx2uTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, response = [200, {}]) {
  reply = response;
  seen = [];
  try {
    return { result: await tools[name].handler(args), requests: seen };
  } catch (error) {
    return { error, requests: seen };
  }
}

const UC = "https://ultimatecoins.co.uk";
const SHOP = "https://shop.acts.direct:8443";
const CREATE = "uiiq_nx2u_channel_create";
const UPDATE = "uiiq_nx2u_channel_update";

test("both tools take embedOrigins, a list of at most 10 strings; update says it replaces and [] clears", () => {
  for (const name of [CREATE, UPDATE]) {
    const p = tools[name].inputSchema.properties.embedOrigins;
    assert.deepEqual([p.type, p.items.type, p.maxItems], ["array", "string", 10], name);
    assert.match(p.description, /exact https origin, https:\/\/host\[:port\] with no path or trailing slash/, name);
    assert.ok(!tools[name].inputSchema.required.includes("embedOrigins"), name);
  }
  assert.match(tools[UPDATE].inputSchema.properties.embedOrigins.description, /REPLACES the saved list; \[\] clears it/);
});

// Lucas R197-01: this server keeps no allow-list of its own, so the description and the README row are the list a
// client's owner reads: create and update are never auto-allowed, and have no confirm (a flag the model sets is no check).
test("R197-01: create and update say never auto-allow this tool, in the description and the README row, and take no confirm", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8").split(/\r?\n/);
  for (const name of [CREATE, UPDATE]) {
    assert.match(tools[name].description, /UiiQ checks only its form, not whose sites they are, so the person's real check is this client's approval prompt: never auto-allow this tool\./, name);
    assert.ok(!("confirm" in tools[name].inputSchema.properties), name);
    assert.ok(!("annotations" in tools[name]), name);
    const row = readme.find((l) => l.startsWith(`| \`${name}\` |`));
    assert.match(row, /\*\*never auto-allow this tool\*\*.*\(Lucas R197-01\)/, name);
  }
  assert.doesNotMatch(tools.uiiq_nx2u_channel_list.description, /auto-allow/);
});

test("create sends embedOrigins as given (duplicates once); without it, none is sent", async () => {
  let r = await call(CREATE, { name: "Coins", embedOrigins: [UC, SHOP, UC] }, [201, { channel: { id: "ch1" } }]);
  assert.ifError(r.error);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/nx2u/channels", body: { name: "Coins", embedOrigins: [UC, SHOP] } }]);
  r = await call(CREATE, { name: "Coins" }, [201, { channel: { id: "ch1" } }]);
  assert.deepEqual(r.requests[0].body, { name: "Coins" });
});

test("update replaces the list in one PATCH; [] clears it", async () => {
  let r = await call(UPDATE, { id: "ch1", embedOrigins: [UC] }, [200, { channel: { id: "ch1", embedOrigins: [UC] } }]);
  assert.ifError(r.error);
  assert.deepEqual(r.requests, [{ method: "PATCH", path: "/nx2u/channels/ch1", body: { embedOrigins: [UC] } }]);
  r = await call(UPDATE, { id: "ch1", embedOrigins: [] }, [200, { channel: { id: "ch1", embedOrigins: [] } }]);
  assert.deepEqual(r.requests, [{ method: "PATCH", path: "/nx2u/channels/ch1", body: { embedOrigins: [] } }]);
});

test("a website address that isn't an exact https origin is refused, naming it, before anything is sent", async () => {
  for (const [bad, why] of [
    ["ultimatecoins.co.uk", /is not a website address: write it as https:\/\/host/],
    [`${UC}/`, /must be written exactly as https:\/\/ultimatecoins\.co\.uk/],
    ["https://UltimateCoins.co.uk", /must be written exactly as https:\/\/ultimatecoins\.co\.uk/],
    [`${UC}:443`, /must be written exactly as https:\/\/ultimatecoins\.co\.uk/],
    ["http://ultimatecoins.co.uk", /must start with https:\/\//],
    [`${UC}/live`, /origin only: no path, query or login/],
    [`${UC}?x=1`, /origin only/],
    ["https://me@ultimatecoins.co.uk", /origin only/],
    ["https://*.ultimatecoins.co.uk", /by its host name/],
    ["https://a.com;script-src", /by its host name/],
    ["https://127.0.0.1", /by its host name/],
    ["https://localhost", /by its host name/],
    [42, /is not text/],
  ]) {
    for (const [name, args] of [[CREATE, { name: "Coins" }], [UPDATE, { id: "ch1" }]]) {
      const r = await call(name, { ...args, embedOrigins: [UC, bad] });
      assert.ok(r.error, `${name} ${bad}`);
      assert.deepEqual(r.requests, [], `${name} ${bad}`);
      assert.ok(r.error.message.includes(JSON.stringify(String(bad))), `${bad}: ${r.error.message}`);
      assert.match(r.error.message, why, `${name} ${bad}`);
      assert.match(r.error.message, /Nothing was sent/);
    }
  }
});

test("more than 10, or not a list, is refused before anything is sent", async () => {
  const eleven = Array.from({ length: 11 }, (_, i) => `https://s${i}.example.co.uk`);
  let r = await call(CREATE, { name: "Coins", embedOrigins: eleven });
  assert.match(r.error.message, /At most 10 websites may embed a channel/);
  assert.deepEqual(r.requests, []);
  for (const notList of [UC, null, { 0: UC }]) {
    r = await call(UPDATE, { id: "ch1", embedOrigins: notList });
    assert.match(r.error.message, /embedOrigins must be a list of https origins/, String(notList));
    assert.deepEqual(r.requests, []);
  }
});
