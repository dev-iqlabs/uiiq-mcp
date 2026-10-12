// node --test — finding a competitor's Facebook Page and saving it, against a
// local stand-in for UIIQ (a throwaway HOME with a fake session, so no real
// login is read or sent).
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
  const { competitorTools } = await import("../src/tools/competitor.js");
  tools = Object.fromEntries(competitorTools.map((t) => [t.name, t]));
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

const FOUND = { query: "acme", pages: [{ id: "111111111", name: "Acme Escape Rooms", ads: 2 }], partial: null };

test("meta_page_find searches by the competitor's own word when no query is given", async () => {
  const { result, requests } = await call("uiiq_competitor_meta_page_find", { id: "comp 1" }, [200, FOUND]);
  assert.deepEqual(requests, [{ method: "GET", path: "/ads/competitors/comp%201/meta-pages" }]);
  assert.deepEqual(result, FOUND);
});

test("meta_page_find sends the query encoded", async () => {
  const { requests } = await call("uiiq_competitor_meta_page_find", { id: "comp_1", query: "acme & sons" }, [200, FOUND]);
  assert.equal(requests[0].path, "/ads/competitors/comp_1/meta-pages?q=acme%20%26%20sons");
});

test("meta_page_find passes UIIQ's refusal through", async () => {
  await assert.rejects(
    call("uiiq_competitor_meta_page_find", { id: "comp_1" }, [403, { error: "You don't have permission to do that." }]),
    /permission/,
  );
});

test("update saves the picked page's id and name, and clearing sends null", async () => {
  const saved = await call("uiiq_competitor_update", { id: "comp_1", metaPageId: "111111111", metaPageName: "Acme Escape Rooms" }, [200, { competitor: {} }]);
  assert.deepEqual(saved.requests, [{ method: "PATCH", path: "/ads/competitors/comp_1", body: { metaPageId: "111111111", metaPageName: "Acme Escape Rooms" } }]);
  const cleared = await call("uiiq_competitor_update", { id: "comp_1", clearMetaPageId: true }, [200, { competitor: {} }]);
  assert.deepEqual(cleared.requests[0].body, { metaPageId: null });
});
