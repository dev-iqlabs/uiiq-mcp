// node --test — the timetable page on the school's website (UiiQ-platform
// feat/enrol-back-to-timetable, Steve 19 Oct 2026): uiiq_classes_register_settings_set
// sends timetablePageUrl (null clears it) and uiiq_classes_register_settings returns it,
// against a local stand-in for UIIQ (a throwaway HOME with a fake session).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, replies, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, json] = replies.length > 1 ? replies.shift() : replies[0];
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
  const { classesTools } = await import("../src/tools/classes.js");
  tools = Object.fromEntries(classesTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, ...responses) {
  replies = responses;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}


const PAGE = "https://sbda.online/timetable/";

test("_set sends timetablePageUrl, and only what was given", async () => {
  const set = await call("uiiq_classes_register_settings_set", { timetablePageUrl: PAGE }, [200, { timetablePageUrl: PAGE }]);
  assert.deepEqual(set.requests, [{ method: "PATCH", path: "/classes/registers/settings", body: { timetablePageUrl: PAGE } }]);
  assert.equal(set.result.timetablePageUrl, PAGE);
  const other = await call("uiiq_classes_register_settings_set", { lapseWeeks: 4 }, [200, { lapseWeeks: 4 }]);
  assert.deepEqual(other.requests[0].body, { lapseWeeks: 4 });
});

test("null clears it", async () => {
  const cleared = await call("uiiq_classes_register_settings_set", { timetablePageUrl: null }, [200, { timetablePageUrl: null }]);
  assert.deepEqual(cleared.requests[0].body, { timetablePageUrl: null });
});

test("the schema takes a string or null", () => {
  const prop = tools.uiiq_classes_register_settings_set.inputSchema.properties.timetablePageUrl;
  assert.deepEqual(prop.type, ["string", "null"]);
  assert.match(prop.description, /must be on your website/);
  assert.match(tools.uiiq_classes_register_settings.description, /timetablePageUrl/);
});

test("the API's 400 for a page off the website comes through as it is", async () => {
  replies = [[400, { error: "The timetable page must be on your website (sbda.online)" }]];
  seen = [];
  await assert.rejects(tools.uiiq_classes_register_settings_set.handler({ timetablePageUrl: "https://evil.example/" }), (e) => String(e.message).includes("The timetable page must be on your website (sbda.online)"));
});

test("_settings returns timetablePageUrl", async () => {
  const got = await call("uiiq_classes_register_settings", {}, [200, { lapseWeeks: 3, ageBands: [], timetablePageUrl: PAGE }]);
  assert.deepEqual(got.requests, [{ method: "GET", path: "/classes/registers/settings" }]);
  assert.equal(got.result.timetablePageUrl, PAGE);
});
