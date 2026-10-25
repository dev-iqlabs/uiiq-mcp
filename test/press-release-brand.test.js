// node --test — the press-release brand (UiiQ-platform #1202). UiiQ no longer
// has a fixed list of brands: the New press release screen offers the
// workspace's OWN names (its name, its billing organisations', the websites it
// owns), never another client's. The old description here listed five slugs,
// one of them a client's (Milestone Ranch). Against a local stand-in for UIIQ
// (a throwaway HOME with a fake session, so no real login is read or sent
// anywhere).
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
  const { communicationsTools } = await import("../src/tools/communications.js");
  tools = Object.fromEntries(communicationsTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

const brand = () => tools.uiiq_press_release_create.inputSchema.properties.brand;

test("brand is the workspace's own name, not a fixed list that names another client", () => {
  const d = brand().description;
  for (const old of [/milestone/i, /acts-direct/i, /ultimate-image/i, /\buiiq\b/i, /\|/]) assert.doesNotMatch(d, old);
  assert.match(d, /own name/);
  assert.match(d, /billing organisations/);
  assert.match(d, /website it owns/);
  assert.match(d, /Never another client's name/);
});

test("brand is free text, as the route takes it: no enum to go stale", () => {
  assert.equal(brand().type, "string");
  assert.equal("enum" in brand(), false);
});

test("create sends the brand as given, in one POST", async () => {
  reply = [201, { id: "pr_1", status: "GENERATING" }];
  seen = [];
  const briefData = { key_facts: "Open day", quote1_from: "Name, role", quote1_text: "Come along", press_enquiries_contact: "office@example.com" };
  const result = await tools.uiiq_press_release_create.handler({ brand: "Riverside Arts Ltd", announcementType: "Event", briefData });
  assert.deepEqual(seen, [{ method: "POST", path: "/communications/press-releases", body: { brand: "Riverside Arts Ltd", announcementType: "Event", briefData } }]);
  assert.equal(result.id, "pr_1");
});
