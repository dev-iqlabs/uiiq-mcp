// node --test — uiiq_campaign_live_show_drafts against a local stand-in for UIIQ
// (a throwaway HOME with a fake session, so no real login is read or sent).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
  delete process.env.UIIQ_MCP_INHERIT_IMPERSONATION;
  delete process.env.UIIQ_MCP_INHERIT_WRITE;
  const { campaignTools } = await import("../src/tools/campaign.js");
  tools = Object.fromEntries(campaignTools.map((t) => [t.name, t]));
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

const show = { ref: "abc123def456", title: "Christmas coins live", start: "2026-11-20T15:00:00Z", length: 60, liveUrl: "https://ultimatecoins.co.uk/live/", products: [{ name: "Advent Coin", pricePence: 2499 }], delivery: "Free UK delivery" };

test("uiiq_campaign_live_show_drafts: posts the show and the options to its route, and returns the drafts", async () => {
  const out = { basis: "consent", drafts: [{ kind: "invite", status: "created", campaignId: "c1" }] };
  const { result, requests } = await call("uiiq_campaign_live_show_drafts", { show, sends: ["invite"], dryRun: true }, [201, out]);
  assert.deepEqual(requests, [{ method: "POST", path: "/campaigns/live-show", body: { show, sends: ["invite"], dryRun: true } }]);
  assert.deepEqual(result, out);
});

test("uiiq_campaign_live_show_drafts: UiiQ's refusal is the error", async () => {
  await assert.rejects(call("uiiq_campaign_live_show_drafts", { show }, [400, { error: "show.delivery is required" }]), /show\.delivery is required/);
});

test("uiiq_campaign_live_show_drafts: the show is required", () => {
  assert.deepEqual(tools.uiiq_campaign_live_show_drafts.inputSchema.required, ["show"]);
});
