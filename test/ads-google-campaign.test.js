// node --test — uiiq_ads_google_campaign_control (PATCH /api/ads/google/campaigns/:id),
// against a local stand-in for UIIQ (a throwaway HOME with a fake session).
// Enabling spends: without confirm: true it's a dry run and nothing is sent;
// with it, confirm: true is sent for enable only (UiiQ-platform #1011 M1).
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
  const { adsTools } = await import("../src/tools/ads.js");
  tool = adsTools.find((t) => t.name === "uiiq_ads_google_campaign_control");
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(args, response = [200, { campaign_id: "123", status: "ENABLED" }]) {
  reply = response;
  seen = [];
  const result = await tool.handler(args);
  return { result, requests: seen };
}

test("enable without confirm: true is a dry run; nothing is sent", async () => {
  for (const confirm of [undefined, false, "true", 1]) {
    const { result, requests } = await call({ id: "123", action: "enable", confirm });
    assert.deepEqual(requests, []);
    assert.equal(result.dryRun, true);
    assert.match(result.message, /starts spending/);
  }
});

test("enable with confirm: true sends confirm: true; pause and budget never send it", async () => {
  let r = await call({ id: "123", action: "enable", confirm: true });
  assert.deepEqual(r.requests, [{ method: "PATCH", path: "/ads/google/campaigns/123", body: { action: "enable", confirm: true } }]);
  r = await call({ id: "123", action: "pause", confirm: true }, [200, { campaign_id: "123", status: "PAUSED" }]);
  assert.deepEqual(r.requests[0].body, { action: "pause" });
  r = await call({ id: "123", action: "budget", budgetMicros: 5_000_000, confirm: true }, [200, { campaign_id: "123", budget_micros: 5_000_000 }]);
  assert.deepEqual(r.requests[0].body, { action: "budget", budget_micros: 5_000_000 });
});

test("UiiQ's refusal (Google didn't confirm) is thrown with its words", async () => {
  await assert.rejects(call({ id: "123", action: "pause" }, [502, { error: "Google Ads didn't confirm the change" }]), /didn't confirm/);
});

test("the schema is closed and says enabling spends", () => {
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.match(tool.description, /ENABLING starts spending/);
});
