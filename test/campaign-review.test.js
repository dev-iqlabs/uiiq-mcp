// node --test — uiiq_campaign_review against a local stand-in for UIIQ
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
  // Imported only now: auth.js and config.js read HOME and UIIQ_BASE at load.
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

test("uiiq_campaign_review: the saved campaign, by its own route", async () => {
  const review = { from: "check", subject: { verdict: "good", notes: null, spamWords: [] } };
  const { result, requests } = await call("uiiq_campaign_review", { id: "c/1" }, [200, { review }]);
  assert.deepEqual(requests, [{ method: "POST", path: "/campaigns/c%2F1/review", body: {} }]);
  assert.deepEqual(result, { review });
});

test("uiiq_campaign_review: a subject, preview text or body given is what gets checked", async () => {
  const { requests } = await call("uiiq_campaign_review", { id: "c1", subject: "New", preheader: "Doors at 6", bodyHtml: "<p>x</p>" }, [200, { review: {} }]);
  assert.deepEqual(requests[0].body, { subject: "New", preheader: "Doors at 6", bodyHtml: "<p>x</p>" });
});

test("uiiq_campaign_review: no reviewer yet is an error in the route's words, never a review", async () => {
  reply = () => [503, { error: "The reviewer isn't available yet" }];
  seen = [];
  await assert.rejects(tools.uiiq_campaign_review.handler({ id: "c1" }), /The reviewer isn't available yet/);
});
