// node --test — uiiq_campaign_update (PATCH /api/campaigns/:id) against a local stand-in for UIIQ
// (a throwaway HOME with a fake session, so no real login is read or sent anywhere).
//
// What these hold still: only the fields given are sent, previewText goes as previewText (the route
// maps it to bodyText), nothing given is refused before a request, the description warns that a new
// body replaces the editor's blocks, and the route's refusal comes back in its words.
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

async function call(args, answer = [500, { error: "nothing should have been called" }]) {
  reply = answer;
  seen = [];
  const result = await tools.uiiq_campaign_update.handler(args);
  return { result, requests: seen };
}

const CAMPAIGN = { id: "c_1", name: "November news", subject: "Doors at 6", status: "DRAFT", bodyHtml: "<p>Hi</p>", bodyText: "See you there" };

test("the tool takes an id and the four draft fields, and no scheduling or status", () => {
  const s = tools.uiiq_campaign_update.inputSchema;
  assert.deepEqual(s.required, ["id"]);
  for (const k of ["name", "subject", "bodyHtml", "previewText", "tenant"]) assert.ok(k in s.properties, `no ${k}`);
  for (const k of ["status", "scheduledAt", "scheduledFor", "bodyJson", "bodyText", "sendToFilter"]) assert.equal(k in s.properties, false, `${k} belongs elsewhere`);
});

test("the description says a body sent here replaces the editor's blocks", () => {
  assert.match(tools.uiiq_campaign_update.description, /editing the body here replaces any blocks made in the editor/i);
  assert.match(tools.uiiq_campaign_update.inputSchema.properties.bodyHtml.description, /replaces any blocks made in the editor/);
});

test("all four: one PATCH to the campaign, previewText under its own name", async () => {
  const args = { id: "c/1", name: "November news", subject: "Doors at 6", bodyHtml: "<p>Hi</p>", previewText: "See you there" };
  const { result, requests } = await call(args, [200, CAMPAIGN]);
  assert.deepEqual(requests, [{
    method: "PATCH", path: "/campaigns/c%2F1",
    body: { name: "November news", subject: "Doors at 6", bodyHtml: "<p>Hi</p>", previewText: "See you there" },
  }]);
  assert.deepEqual(result, CAMPAIGN);
});

test("only the fields given are sent", async () => {
  for (const one of [{ name: "Renamed" }, { subject: "New subject" }, { bodyHtml: "<p>New</p>" }, { previewText: "" }]) {
    const { requests } = await call({ id: "c_1", ...one }, [200, CAMPAIGN]);
    assert.deepEqual(requests, [{ method: "PATCH", path: "/campaigns/c_1", body: one }], JSON.stringify(one));
  }
});

test("the tenant is not sent in the body", async () => {
  const { requests } = await call({ id: "c_1", subject: "x", tenant: undefined }, [200, CAMPAIGN]);
  assert.deepEqual(requests[0].body, { subject: "x" });
});

test("nothing to change is refused before anything is called", async () => {
  await assert.rejects(() => call({ id: "c_1" }), /Give at least one of name, subject, bodyHtml or previewText/);
  assert.deepEqual(seen, []);
});

test("a sent campaign: the route's 409 is the error, in its words", async () => {
  await assert.rejects(() => call({ id: "c_1", subject: "Too late" }, [409, { error: "Can't edit a campaign that is sent" }]), (e) => {
    assert.equal(e.message, "Can't edit a campaign that is sent");
    return true;
  });
  assert.equal(seen.length, 1);
});

test("a refusal that isn't JSON still comes back as its text", async () => {
  reply = [400, "plain"];
  seen = [];
  await assert.rejects(() => tools.uiiq_campaign_update.handler({ id: "c_1", name: "x" }), /plain/);
});
