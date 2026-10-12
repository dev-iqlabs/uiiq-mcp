// node --test — smart pages take-down, put-back, the live list and approve's
// version, against a local stand-in for UIIQ (a throwaway HOME with a fake
// session, so no real login is read or sent).
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
  // Imported only now: auth.js and config.js read HOME and UIIQ_BASE at load.
  const { smartPagesTools } = await import("../src/tools/smart-pages.js");
  tools = Object.fromEntries(smartPagesTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, response) {
  reply = () => response;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

const page = { slug: "abcdefgh2345", status: "taken_down", url: "u", taken_down: null };

test("live pages lists the workspace's published pages by default, or a status", async () => {
  let r = await call("uiiq_smart_pages_live_pages", {}, [200, { pages: [], available: true }]);
  assert.deepEqual(r.requests, [{ method: "GET", path: "/smart-pages/pages?status=published" }]);
  r = await call("uiiq_smart_pages_live_pages", { status: "taken_down" }, [200, { pages: [], available: true }]);
  assert.equal(r.requests[0].path, "/smart-pages/pages?status=taken_down");
});

test("staff:true uses the /admin staff routes and sends no scope in the body", async () => {
  let r = await call("uiiq_smart_pages_live_pages", { staff: true }, [200, { pages: [], available: true }]);
  assert.deepEqual(r.requests, [{ method: "GET", path: "/admin/smart-pages/pages?status=published" }]);
  r = await call("uiiq_smart_pages_page_take_down", { slug: "abcdefgh2345", reason: "Reported", staff: true }, [200, { page }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/admin/smart-pages/pages/abcdefgh2345", body: { action: "take_down", reason: "Reported" } }]);
  r = await call("uiiq_smart_pages_page_put_back", { slug: "abcdefgh2345", staff: true }, [200, { page }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/admin/smart-pages/pages/abcdefgh2345", body: { action: "put_back" } }]);
});

test("staff:true with a tenant is refused before any request", async () => {
  await assert.rejects(call("uiiq_smart_pages_page_take_down", { slug: "abcdefgh2345", reason: "x", staff: true, tenant: "hill" }, [200, {}]), /leave tenant out/);
  assert.deepEqual(seen, []);
});

test("take down and put back post to the workspace route", async () => {
  let r = await call("uiiq_smart_pages_page_take_down", { slug: "abcdefgh2345", reason: "Wrong date" }, [200, { page }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/smart-pages/pages/abcdefgh2345", body: { action: "take_down", reason: "Wrong date" } }]);
  assert.deepEqual(r.result, { page });
  r = await call("uiiq_smart_pages_page_put_back", { slug: "abcdefgh2345" }, [200, { page }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/smart-pages/pages/abcdefgh2345", body: { action: "put_back" } }]);
});

test("a support take-down's 403 and IQEX's busy 409 come back as their messages", async () => {
  await assert.rejects(
    call("uiiq_smart_pages_page_put_back", { slug: "abcdefgh2345" }, [403, { error: "This page was taken down by support. Ask them to put it back." }]),
    { message: "This page was taken down by support. Ask them to put it back." },
  );
  await assert.rejects(
    call("uiiq_smart_pages_page_take_down", { slug: "abcdefgh2345", reason: "x" }, [409, { error: "Another smart page for this organisation is being made. Try again in a moment.", kind: "busy" }]),
    /Try again in a moment/,
  );
});

test("approve sends the version when given, none otherwise, and names the current one on a 409", async () => {
  let r = await call("uiiq_smart_pages_page_approve", { slug: "abcdefgh2345", orderRef: "WC-1", version: "v1" }, [200, { page }]);
  assert.deepEqual(r.requests[0].body, { action: "approve", orderRef: "WC-1", version: "v1" });
  r = await call("uiiq_smart_pages_page_approve", { slug: "abcdefgh2345", orderRef: "WC-1" }, [200, { page }]);
  assert.deepEqual(r.requests[0].body, { action: "approve", orderRef: "WC-1" });
  await assert.rejects(
    call("uiiq_smart_pages_page_approve", { slug: "abcdefgh2345", version: "v1" }, [409, { error: "The page changed since you checked it. Check it again.", kind: "changed", version: "v2" }]),
    { message: "The page changed since you checked it. Check it again. (current version v2)" },
  );
});

test("take-down needs a reason, says to confirm first, and approve mentions the 409", () => {
  assert.deepEqual(tools.uiiq_smart_pages_page_take_down.inputSchema.required, ["slug", "reason"]);
  assert.match(tools.uiiq_smart_pages_page_take_down.description, /Confirm with the person before calling/);
  assert.match(tools.uiiq_smart_pages_page_approve.description, /409/);
  assert.ok(tools.uiiq_smart_pages_page_approve.inputSchema.properties.version);
});
