// node --test — uiiq_ads_local (GET /api/ads/local), against a local stand-in
// for UIIQ (a throwaway HOME with a fake session, so no real login is read or
// sent). Since UiiQ-platform #1504 it answers real data only: no made-up
// listing, so `location` is null with figures "none" and a reason until a
// Google Business Profile is connected. The tool passes it on as it came.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, "") });
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
  const { adsTools } = await import("../src/tools/ads.js");
  tools = Object.fromEntries(adsTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

const WORDS = "The workspace's local-search state, real data only: `location`, its Google Business Profile listing (null with `figures: \"none\"` and a `reason` until a profile is connected; never sample data); `localPackPosition`, the best latest map-pack position among its tracked local keywords (null when none has ranked); and `recentReviews`, its newest five synced Google reviews ([] until reviews are synced). The tracked keywords themselves: uiiq_ads_local_keywords.";

test("no profile connected: UiiQ's null location, figures \"none\" and reason, as it sent them", async () => {
  const none = { location: null, figures: "none", reason: "No Google Business Profile is connected to this workspace", recentReviews: [], localPackPosition: 3 };
  reply = [200, none];
  seen = [];
  assert.deepEqual(await tools.uiiq_ads_local.handler({}), none);
  assert.deepEqual(seen, [{ method: "GET", path: "/ads/local" }]);
});

test("the description and the README row say real data only, word for word", () => {
  assert.equal(tools.uiiq_ads_local.description, WORDS);
  assert.doesNotMatch(tools.uiiq_ads_local.description, /Your Business|High Street/);
  const row = readFileSync(new URL("../README.md", import.meta.url), "utf8").split("\n").find((l) => l.startsWith("| `uiiq_ads_local` |"));
  assert.equal(row, `| \`uiiq_ads_local\` | ${WORDS} |`);
});
