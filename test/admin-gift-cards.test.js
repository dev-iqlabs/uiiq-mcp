// node --test — uiiq_admin_gift_cards_legacy_count (GET /api/admin/gift-cards/legacy-count),
// against a local stand-in for UIIQ (a throwaway HOME with a fake session, so
// no real login is read or sent).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    seen.push({ method: req.method, path: req.url.replace(/^\/api/, "") });
    const [status, data] = reply;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
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
  const mod = await import("../src/tools/admin-platform.js");
  const list = Object.values(mod).find((v) => Array.isArray(v) && v.some((t) => t?.name === "uiiq_admin_gift_cards_legacy_count"));
  tools = Object.fromEntries(list.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

const call = async (response) => {
  reply = response;
  seen = [];
  return tools.uiiq_admin_gift_cards_legacy_count.handler({});
};

test("one GET, and UiiQ's counts come back as sent", async () => {
  const body = { rows: [{ workspace: "milestone", format: "hex8", liveCards: 3, balancePence: 4500 }], totals: { liveCards: 3, balancePence: 4500 } };
  const out = await call([200, body]);
  assert.deepEqual(seen, [{ method: "GET", path: "/admin/gift-cards/legacy-count" }]);
  assert.deepEqual(out, body);
});

test("a refusal surfaces as an error", async () => {
  await assert.rejects(call([403, { error: "Forbidden" }]), /Forbidden|403/);
});
