// node --test — smart pages take-down, put-back, the live list and approve's
// version, against a local stand-in for UIIQ (a throwaway HOME with a fake
// session, so no real login is read or sent).
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
      // One reply per request, in order; the last one repeats.
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
  // Imported only now: auth.js and config.js read HOME and UIIQ_BASE at load.
  const { smartPagesTools } = await import("../src/tools/smart-pages.js");
  tools = Object.fromEntries(smartPagesTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

/** Call a tool; `responses` is one [status, json] or a list, one per request. */
async function call(name, args, ...responses) {
  replies = responses;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}

const page = { slug: "abcdefgh2345", status: "taken_down", url: "u", taken_down: null };
const livePage = { slug: "abcdefgh2345", name: "In memory of Jo", org_name: "Hill & Sons", status: "published", url: "https://p/abcdefgh2345", taken_down: null };
const downPage = { ...livePage, status: "taken_down", taken_down: { at: "2026-10-12T10:00:00Z", by: "IQEX support", reason: "x", from: "published", by_staff: true, can_put_back: false } };
const isMutation = (r) => r.method !== "GET";

test("live pages lists the workspace's published pages by default, or a status", async () => {
  let r = await call("uiiq_smart_pages_live_pages", {}, [200, { pages: [], available: true }]);
  assert.deepEqual(r.requests, [{ method: "GET", path: "/smart-pages/pages?status=published" }]);
  r = await call("uiiq_smart_pages_live_pages", { status: "taken_down" }, [200, { pages: [], available: true }]);
  assert.equal(r.requests[0].path, "/smart-pages/pages?status=taken_down");
});

test("M1: take-down without confirm is a dry run that shows the page and never posts", async () => {
  for (const confirm of [undefined, false, "true", 1]) {
    const r = await call("uiiq_smart_pages_page_take_down", { slug: "abcdefgh2345", reason: "Wrong date", confirm }, [200, { pages: [livePage], available: true }]);
    assert.deepEqual(r.requests, [{ method: "GET", path: "/smart-pages/pages?status=published" }], `confirm=${confirm}`);
    assert.equal(r.requests.filter(isMutation).length, 0);
    assert.equal(r.result.dryRun, true);
    assert.equal(r.result.changed, false);
    assert.deepEqual(r.result.page, { slug: "abcdefgh2345", name: "In memory of Jo", workspace: "Hill & Sons", status: "published", url: "https://p/abcdefgh2345", taken_down: null });
  }
});

test("M1: put-back without confirm is a dry run, says when only staff can put it back, and never posts", async () => {
  const r = await call("uiiq_smart_pages_page_put_back", { slug: "abcdefgh2345" }, [200, { pages: [downPage], available: true }]);
  assert.deepEqual(r.requests, [{ method: "GET", path: "/smart-pages/pages?status=taken_down" }]);
  assert.equal(r.result.dryRun, true);
  assert.equal(r.result.page.taken_down.by, "IQEX support");
  assert.match(r.result.note, /only staff:true can put it back/);
});

test("M1: a staff dry run reads the staff list, and a missing page is reported, not acted on", async () => {
  const r = await call("uiiq_smart_pages_page_take_down", { slug: "zzzzzzzz9999", reason: "x", staff: true }, [200, { pages: [livePage], available: true }]);
  assert.deepEqual(r.requests, [{ method: "GET", path: "/admin/smart-pages/pages?status=published" }]);
  assert.equal(r.result.page, null);
  assert.equal(r.result.dryRun, true);
});

test("with confirm: true, take down and put back post to the workspace route and nothing else", async () => {
  let r = await call("uiiq_smart_pages_page_take_down", { slug: "abcdefgh2345", reason: "Wrong date", confirm: true }, [200, { page }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/smart-pages/pages/abcdefgh2345", body: { action: "take_down", reason: "Wrong date" } }]);
  assert.deepEqual(r.result, { page });
  r = await call("uiiq_smart_pages_page_put_back", { slug: "abcdefgh2345", confirm: true }, [200, { page }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/smart-pages/pages/abcdefgh2345", body: { action: "put_back" } }]);
});

test("staff:true uses the /admin staff routes and sends no scope in the body", async () => {
  let r = await call("uiiq_smart_pages_live_pages", { staff: true }, [200, { pages: [], available: true }]);
  assert.deepEqual(r.requests, [{ method: "GET", path: "/admin/smart-pages/pages?status=published" }]);
  r = await call("uiiq_smart_pages_page_take_down", { slug: "abcdefgh2345", reason: "Reported", staff: true, confirm: true }, [200, { page }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/admin/smart-pages/pages/abcdefgh2345", body: { action: "take_down", reason: "Reported" } }]);
  r = await call("uiiq_smart_pages_page_put_back", { slug: "abcdefgh2345", staff: true, confirm: true }, [200, { page }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/admin/smart-pages/pages/abcdefgh2345", body: { action: "put_back" } }]);
});

test("staff:true with a tenant is refused before any request, dry run or not", async () => {
  await assert.rejects(call("uiiq_smart_pages_page_take_down", { slug: "abcdefgh2345", reason: "x", staff: true, tenant: "hill", confirm: true }, [200, {}]), /leave tenant out/);
  assert.deepEqual(seen, []);
  await assert.rejects(call("uiiq_smart_pages_page_put_back", { slug: "abcdefgh2345", staff: true, tenant: "hill" }, [200, {}]), /leave tenant out/);
  assert.deepEqual(seen, []);
});

test("a support take-down's 403 and IQEX's busy 409 come back as their messages", async () => {
  await assert.rejects(
    call("uiiq_smart_pages_page_put_back", { slug: "abcdefgh2345", confirm: true }, [403, { error: "This page was taken down by support. Ask them to put it back." }]),
    { message: "This page was taken down by support. Ask them to put it back." },
  );
  await assert.rejects(
    call("uiiq_smart_pages_page_take_down", { slug: "abcdefgh2345", reason: "x", confirm: true }, [409, { error: "Another smart page for this organisation is being made. Try again in a moment.", kind: "busy" }]),
    /Try again in a moment/,
  );
});

test("L2: approve sends the version given, without looking anything up", async () => {
  const r = await call("uiiq_smart_pages_page_approve", { slug: "abcdefgh2345", orderRef: "WC-1", version: "v1" }, [200, { page }]);
  assert.deepEqual(r.requests, [{ method: "POST", path: "/smart-pages/approvals/abcdefgh2345", body: { action: "approve", orderRef: "WC-1", version: "v1" } }]);
});

test("L2: approve without a version is refused when the pending row has one, and nothing is posted", async () => {
  await assert.rejects(
    call("uiiq_smart_pages_page_approve", { slug: "abcdefgh2345", orderRef: "WC-1" }, [200, { pages: [{ slug: "abcdefgh2345", version: "v1" }], messages: [] }]),
    /has a version/,
  );
  assert.deepEqual(seen, [{ method: "GET", path: "/smart-pages/approvals" }]);
});

test("L2: approve without a version goes ahead when the row has none (an older IQEX)", async () => {
  const r = await call("uiiq_smart_pages_page_approve", { slug: "abcdefgh2345", orderRef: "WC-1", staff: true },
    [200, { pages: [{ slug: "abcdefgh2345" }], messages: [] }], [200, { page }]);
  assert.deepEqual(r.requests, [
    { method: "GET", path: "/smart-pages/approvals?scope=staff" },
    { method: "POST", path: "/smart-pages/approvals/abcdefgh2345", body: { action: "approve", orderRef: "WC-1", scope: "staff" } },
  ]);
});

test("L2: a 409 changed says to re-list and check again, and never echoes a version", async () => {
  await assert.rejects(
    call("uiiq_smart_pages_page_approve", { slug: "abcdefgh2345", version: "v1" }, [409, { error: "The page changed since you checked it. Check it again.", kind: "changed", version: "v2" }]),
    (e) => /Re-list the pending pages with uiiq_smart_pages_approvals/.test(e.message) && !e.message.includes("v2"),
  );
});

test("take-down needs a reason; both live actions say to confirm first; approve mentions the 409", () => {
  assert.deepEqual(tools.uiiq_smart_pages_page_take_down.inputSchema.required, ["slug", "reason"]);
  for (const n of ["uiiq_smart_pages_page_take_down", "uiiq_smart_pages_page_put_back"]) {
    assert.match(tools[n].description, /Confirm with the person before calling/, n);
    assert.match(tools[n].description, /dry run/, n);
    assert.ok(tools[n].inputSchema.properties.confirm, n);
  }
  assert.match(tools.uiiq_smart_pages_page_approve.description, /409/);
  assert.ok(tools.uiiq_smart_pages_page_approve.inputSchema.properties.version);
});
